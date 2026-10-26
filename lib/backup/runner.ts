import { getDb } from '../db';
import { buildSnapshot, type Counts, type Manifest } from './snapshot';
import { describeChanges, diffManifests, type Changes } from './diff';
import { DriveError, getDriveConnection, saveDriveConnection, uploadBackup } from './drive';
import { dayKey } from './schedule';

export type Destination = 'local' | 'google_drive';
export type Trigger = 'manual' | 'scheduled' | 'catch_up';
export type RunStatus = 'running' | 'success' | 'failed' | 'skipped';

export class BackupBusyError extends Error {
  constructor() {
    super('A backup to Google Drive is already running. Please wait a moment.');
  }
}

export interface RunSummary {
  id: number;
  destination: Destination;
  trigger: Trigger;
  status: RunStatus;
  startedAt: string;
  finishedAt: string | null;
  fileName: string | null;
  sizeBytes: number | null;
  driveFileId: string | null;
  counts: Counts | null;
  changes: Changes | null;
  changesText: string;
  error: string | null;
}

export function toSummary(r: any): RunSummary {
  const changes = (r.changes ?? null) as Changes | null;
  return {
    id: Number(r.id),
    destination: r.destination,
    trigger: r.trigger,
    status: r.status,
    startedAt: new Date(r.started_at).toISOString(),
    finishedAt: r.finished_at ? new Date(r.finished_at).toISOString() : null,
    fileName: r.file_name,
    sizeBytes: r.size_bytes === null || r.size_bytes === undefined ? null : Number(r.size_bytes),
    driveFileId: r.drive_file_id,
    counts: r.counts ?? null,
    changes,
    changesText: r.status === 'success' ? describeChanges(changes) : '—',
    error: r.error,
  };
}

const pad = (n: number) => String(n).padStart(2, '0');
/** swami-backup-2026-10-25_02-00.json (time in the app's time zone) */
export function backupFileName(now: Date, timeZone?: string): string {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-GB', { timeZone: timeZone || process.env.APP_TIMEZONE || 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
      .formatToParts(now)
      .map((p) => [p.type, p.value]),
  );
  return `swami-backup-${parts.year}-${parts.month}-${parts.day}_${pad(Number(parts.hour))}-${parts.minute}.json`;
}

async function previousManifest(destination: Destination, excludeId = 0): Promise<Manifest | null> {
  const db = await getDb();
  const [row] = await db.query<{ manifest: Manifest | null }>(
    "select manifest from backup_runs where destination = $1 and status = 'success' and id <> $2 and manifest is not null order by started_at desc, id desc limit 1",
    [destination, excludeId],
  );
  return row?.manifest ?? null;
}

/** What has changed in the app since the last successful backup to this destination (not yet backed up). */
export async function pendingChanges(destination: Destination): Promise<Changes | null> {
  const prev = await previousManifest(destination);
  if (!prev) return null;
  const { manifest } = await buildSnapshot('status');
  return diffManifests(prev, manifest);
}

async function finish(id: number, patch: { status: RunStatus; error?: string; fileName?: string; size?: number; driveFileId?: string; counts?: Counts; changes?: Changes; manifest?: Manifest }) {
  const db = await getDb();
  const [row] = await db.query(
    `update backup_runs set status = $2, finished_at = now(), error = $3, file_name = $4, size_bytes = $5,
       drive_file_id = $6, counts = $7::jsonb, changes = $8::jsonb, manifest = $9::jsonb where id = $1 returning *`,
    [
      id,
      patch.status,
      patch.error ?? null,
      patch.fileName ?? null,
      patch.size ?? null,
      patch.driveFileId ?? null,
      patch.counts ? JSON.stringify(patch.counts) : null,
      patch.changes ? JSON.stringify(patch.changes) : null,
      patch.manifest ? JSON.stringify(patch.manifest) : null,
    ],
  );
  return row;
}

/**
 * Makes one backup.
 *  • destination "local": builds the file and hands it back so the browser can save it on the person's device.
 *  • destination "google_drive": uploads it to the connected Drive.
 * Every attempt (even a failed one) is written to the history.
 */
export async function runBackup(opts: { destination: Destination; trigger: Trigger; user?: string; now?: Date }): Promise<{ run: RunSummary; content?: string }> {
  const { destination, trigger } = opts;
  const now = opts.now ?? new Date();
  const db = await getDb();

  // A crashed run must not block the next one forever.
  await db.query("update backup_runs set status = 'failed', finished_at = now(), error = 'Interrupted before it finished' where status = 'running' and started_at < now() - interval '10 minutes'");

  let id: number;
  try {
    const [row] = await db.query<{ id: string }>("insert into backup_runs (destination, trigger, status, created_by) values ($1,$2,'running',$3) returning id", [destination, trigger, opts.user ?? null]);
    id = Number(row.id);
  } catch (e: any) {
    if (e?.code === '23505' || /duplicate key|unique/i.test(String(e?.message))) throw new BackupBusyError();
    throw e;
  }

  try {
    const conn = destination === 'google_drive' ? await getDriveConnection() : null;
    if (destination === 'google_drive' && (!conn || conn.needsReconnect)) {
      const msg = conn?.needsReconnect ? 'Google Drive needs to be connected again.' : 'Google Drive is not connected.';
      return { run: toSummary(await finish(id, { status: trigger === 'manual' ? 'failed' : 'skipped', error: msg })) };
    }

    const { file, manifest, counts } = await buildSnapshot(trigger, now);
    const changes = diffManifests(await previousManifest(destination, id), manifest);
    const content = JSON.stringify(file);
    const fileName = backupFileName(now);

    let driveFileId: string | undefined;
    if (conn) driveFileId = (await uploadBackup(conn, fileName, content)).fileId;

    const row = await finish(id, { status: 'success', fileName, size: Buffer.byteLength(content), driveFileId, counts, changes, manifest });
    // Keep fingerprints only for the newest successful backup of this destination, and the last 300 history rows.
    await db.query('update backup_runs set manifest = null where destination = $1 and id <> $2 and manifest is not null', [destination, id]);
    await db.query('delete from backup_runs where id in (select id from backup_runs order by started_at desc, id desc offset 300)');
    return { run: toSummary(row), content: destination === 'local' ? content : undefined };
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Backup failed';
    if (e instanceof DriveError && e.needsReconnect) {
      const conn = await getDriveConnection();
      if (conn) await saveDriveConnection({ ...conn, needsReconnect: true, lastError: message });
    }
    return { run: toSummary(await finish(id, { status: 'failed', error: message })) };
  }
}

/**
 * "Back up on first open each day": if no Google Drive backup has succeeded today (in the app's time zone),
 * make one now. Called quietly whenever someone opens the app; the check itself is one cheap query.
 */
export async function catchUpIfNeeded(now = new Date()): Promise<{ ran: boolean; reason: string; run?: RunSummary }> {
  const conn = await getDriveConnection();
  if (!conn) return { ran: false, reason: 'drive-not-connected' };
  if (conn.needsReconnect) return { ran: false, reason: 'drive-needs-reconnect' };

  const db = await getDb();
  const rows = await db.query<{ status: RunStatus; started_at: string }>(
    "select status, started_at from backup_runs where destination = 'google_drive' and started_at > now() - interval '48 hours'",
  );
  const today = dayKey(now);
  const todays = rows.filter((r) => dayKey(new Date(r.started_at)) === today);
  if (todays.some((r) => r.status === 'success' || r.status === 'running')) return { ran: false, reason: 'already-done-today' };
  if (todays.filter((r) => r.status === 'failed').length >= 3) return { ran: false, reason: 'too-many-failures-today' };

  try {
    const { run } = await runBackup({ destination: 'google_drive', trigger: 'catch_up', now });
    return { ran: true, reason: run.status, run };
  } catch (e) {
    if (e instanceof BackupBusyError) return { ran: false, reason: 'already-running' };
    throw e;
  }
}

/** The scheduled (cron) job. Skips if a backup just happened, e.g. the catch-up an hour ago. */
export async function runScheduledBackup(now = new Date()): Promise<{ ran: boolean; reason: string; run?: RunSummary }> {
  const db = await getDb();
  const [recent] = await db.query<{ n: number }>("select count(*)::int as n from backup_runs where destination = 'google_drive' and status = 'success' and started_at > now() - interval '3 hours'");
  if (recent.n > 0) return { ran: false, reason: 'recent-backup-exists' };
  try {
    const { run } = await runBackup({ destination: 'google_drive', trigger: 'scheduled', now });
    return { ran: true, reason: run.status, run };
  } catch (e) {
    if (e instanceof BackupBusyError) return { ran: false, reason: 'already-running' };
    throw e;
  }
}

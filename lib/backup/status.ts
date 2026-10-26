import { getDb } from '../db';
import { APP_TIMEZONE } from '../config';
import { describeChanges } from './diff';
import { DRIVE_FOLDER_NAME, driveConfigured, getDriveConnection } from './drive';
import { pendingChanges, toSummary, type Destination, type RunSummary } from './runner';
import { formatBytes } from './schedule';
import { DAILY_CRON, formatDateTime, formatTime, nextScheduledRun } from './schedule';

/** A run with its dates and size already written as text (formatted on the server so the page never mismatches). */
export interface RunView extends RunSummary {
  startedAtText: string;
  sizeText: string;
}
export const toView = (r: RunSummary): RunView => ({ ...r, startedAtText: formatDateTime(r.startedAt), sizeText: formatBytes(r.sizeBytes) });

export interface DestinationStatus {
  destination: Destination;
  last: RunView | null;
  lastFailure: RunView | null;
  pendingText: string;
  pendingTotal: number | null;
  totalBackups: number;
}
export interface BackupStatus {
  timezone: string;
  local: DestinationStatus;
  drive: DestinationStatus & {
    configured: boolean;
    connected: boolean;
    needsReconnect: boolean;
    email: string | null;
    connectedAt: string | null;
    folderName: string;
    lastError: string | null;
  };
  schedule: { cron: string; nextWindow: string; description: string; lastAutomatic: RunView | null };
  history: RunView[];
}

async function forDestination(destination: Destination): Promise<DestinationStatus> {
  const db = await getDb();
  const [last] = await db.query("select * from backup_runs where destination = $1 and status = 'success' order by started_at desc, id desc limit 1", [destination]);
  const [fail] = await db.query("select * from backup_runs where destination = $1 and status = 'failed' order by started_at desc, id desc limit 1", [destination]);
  const [{ n }] = await db.query<{ n: number }>("select count(*)::int as n from backup_runs where destination = $1 and status = 'success'", [destination]);
  const pending = last ? await pendingChanges(destination) : null;
  const lastFailure = fail && (!last || new Date(fail.started_at) > new Date(last.started_at)) ? toView(toSummary(fail)) : null;
  return {
    destination,
    last: last ? toView(toSummary(last)) : null,
    lastFailure,
    pendingTotal: pending ? pending.total : null,
    pendingText: pending ? (pending.total === 0 ? 'Nothing has changed since the last backup' : describeChanges(pending)) : last ? '—' : 'No backup yet',
    totalBackups: n,
  };
}

export async function getBackupStatus(now = new Date()): Promise<BackupStatus> {
  const db = await getDb();
  const [local, drive, conn, historyRows, [auto]] = await Promise.all([
    forDestination('local'),
    forDestination('google_drive'),
    getDriveConnection(),
    db.query('select * from backup_runs order by started_at desc, id desc limit 30'),
    db.query("select * from backup_runs where destination = 'google_drive' and trigger in ('scheduled','catch_up') order by started_at desc, id desc limit 1"),
  ]);
  const { start, windowEnd } = nextScheduledRun(now);
  return {
    timezone: APP_TIMEZONE,
    local,
    drive: {
      ...drive,
      configured: driveConfigured(),
      connected: Boolean(conn),
      needsReconnect: Boolean(conn?.needsReconnect),
      email: conn?.email ?? null,
      connectedAt: conn ? formatDateTime(conn.connectedAt) : null,
      folderName: DRIVE_FOLDER_NAME,
      lastError: conn?.lastError ?? null,
    },
    schedule: {
      cron: DAILY_CRON,
      nextWindow: `${formatDateTime(start)} – ${formatTime(windowEnd)}`,
      description: 'Runs once a day on Vercel. On the free plan the exact minute inside that hour can vary.',
      lastAutomatic: auto ? toView(toSummary(auto)) : null,
    },
    history: historyRows.map((r) => toView(toSummary(r))),
  };
}

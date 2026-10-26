import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { getDb } from '@/lib/db';
import { putKey } from '@/lib/state';
import { startMockGoogle } from '../helpers/mock-google';
import { BackupBusyError, catchUpIfNeeded, pendingChanges, runBackup, runScheduledBackup } from '@/lib/backup/runner';
import { connectDrive, disconnectDrive, exchangeCode, getDriveConnection, buildAuthUrl } from '@/lib/backup/drive';
import { getBackupStatus } from '@/lib/backup/status';

let google: Awaited<ReturnType<typeof startMockGoogle>>;
const student = (id: string, name: string) => ({ id, name, payments: [{ id: 'p' + id, amount: 100 }] });
const save = (list: object[]) => putKey('edu_students', JSON.stringify(list));

beforeAll(async () => {
  google = await startMockGoogle();
  Object.assign(process.env, google.env);
});
afterAll(async () => {
  await google.close();
});
beforeEach(async () => {
  const db = await getDb();
  for (const t of ['backup_runs', 'integrations', 'students', 'bookings', 'settings', 'versions']) await db.query(`delete from ${t}`);
  google.files.length = 0;
  google.folders.length = 0;
  Object.assign(google.state, { refreshTokenValid: true, failUploadsWith: 0, folderGone: false });
});

async function connect() {
  const { refreshToken, email } = await exchangeCode('good-code', 'http://localhost/cb');
  await connectDrive(refreshToken, email);
}

describe('connecting Google Drive', () => {
  it('builds a sign-in address that asks only for access to files the app creates', () => {
    const url = new URL(buildAuthUrl('http://localhost/cb', 'STATE'));
    expect(url.searchParams.get('scope')).toContain('drive.file');
    expect(url.searchParams.get('scope')).not.toContain('auth/drive ');
    expect(url.searchParams.get('access_type')).toBe('offline');
    expect(url.searchParams.get('state')).toBe('STATE');
  });
  it('stores the Google key encrypted, never as plain text', async () => {
    await connect();
    const db = await getDb();
    const [row] = await db.query<{ data: any }>("select data from integrations where name = 'google_drive'");
    expect(JSON.stringify(row.data)).not.toContain('refresh-secret-123');
    expect(row.data.email).toBe('owner@gmail.com');
    expect((await getDriveConnection())?.email).toBe('owner@gmail.com');
  });
  it('rejects a wrong sign-in code', async () => {
    await expect(exchangeCode('bad-code', 'http://localhost/cb')).rejects.toThrow(/Google sign-in failed/);
  });
  it('disconnecting removes the connection and tells Google to forget it', async () => {
    await connect();
    await disconnectDrive();
    expect(await getDriveConnection()).toBeNull();
    expect(google.state.revoked).toBe(1);
  });
});

describe('backups to Google Drive', () => {
  it('uploads a complete backup into a "Swami Abhyasika Backups" folder', async () => {
    await connect();
    await save([student('S1', 'Asha'), student('S2', 'Ravi')]);
    const { run } = await runBackup({ destination: 'google_drive', trigger: 'manual', user: 'owner' });
    expect(run.status).toBe('success');
    expect(google.folders.map((f) => f.name)).toEqual(['Swami Abhyasika Backups']);
    expect(google.files).toHaveLength(1);
    const uploaded = JSON.parse(google.files[0].content);
    expect(uploaded.app).toBe('swami-abhyasika');
    expect(uploaded.counts.students).toBe(2);
    expect(JSON.parse(uploaded.data.edu_students)).toHaveLength(2);
    expect(google.files[0].name).toMatch(/^swami-backup-\d{4}-\d{2}-\d{2}_\d{2}-\d{2}\.json$/);
    expect(run.driveFileId).toBe(google.files[0].id);
  });
  it('reuses the same folder next time', async () => {
    await connect();
    await save([student('S1', 'A')]);
    await runBackup({ destination: 'google_drive', trigger: 'manual' });
    await runBackup({ destination: 'google_drive', trigger: 'manual' });
    expect(google.folders).toHaveLength(1);
    expect(google.files).toHaveLength(2);
  });
  it('makes a new folder if the owner deleted it in Drive', async () => {
    await connect();
    await save([student('S1', 'A')]);
    await runBackup({ destination: 'google_drive', trigger: 'manual' });
    google.folders.length = 0;
    const { run } = await runBackup({ destination: 'google_drive', trigger: 'manual' });
    expect(run.status).toBe('success');
    expect(google.folders).toHaveLength(1);
  });
  it('fails clearly (and records it) when Google Drive is not connected', async () => {
    const { run } = await runBackup({ destination: 'google_drive', trigger: 'manual' });
    expect(run.status).toBe('failed');
    expect(run.error).toMatch(/not connected/);
  });
  it('records an upload failure without losing the history', async () => {
    await connect();
    google.state.failUploadsWith = 500;
    const { run } = await runBackup({ destination: 'google_drive', trigger: 'manual' });
    expect(run.status).toBe('failed');
    expect(run.error).toMatch(/upload failed/i);
  });
  it('asks to reconnect when Google says the access was revoked', async () => {
    await connect();
    google.state.refreshTokenValid = false;
    const { run } = await runBackup({ destination: 'google_drive', trigger: 'manual' });
    expect(run.status).toBe('failed');
    expect((await getDriveConnection())?.needsReconnect).toBe(true);
    const second = await runBackup({ destination: 'google_drive', trigger: 'scheduled' });
    expect(second.run.status).toBe('skipped');
  });
  it('refuses to start a second Drive backup while one is running', async () => {
    await connect();
    const db = await getDb();
    await db.query("insert into backup_runs (destination, trigger, status) values ('google_drive','manual','running')");
    await expect(runBackup({ destination: 'google_drive', trigger: 'manual' })).rejects.toBeInstanceOf(BackupBusyError);
  });
  it('clears a run that crashed long ago instead of blocking forever', async () => {
    await connect();
    const db = await getDb();
    await db.query("insert into backup_runs (destination, trigger, status, started_at) values ('google_drive','manual','running', now() - interval '1 hour')");
    expect((await runBackup({ destination: 'google_drive', trigger: 'manual' })).run.status).toBe('success');
  });
});

describe('what changed since the previous backup', () => {
  it('says "first backup", then counts each kind of change', async () => {
    await connect();
    await save([student('S1', 'Asha'), student('S2', 'Ravi')]);
    const first = (await runBackup({ destination: 'google_drive', trigger: 'manual' })).run;
    expect(first.changes?.first).toBe(true);
    expect(first.changesText).toMatch(/First backup/);

    await save([student('S1', 'Asha K'), student('S3', 'New')]); // S1 edited, S2 removed, S3 added
    const second = (await runBackup({ destination: 'google_drive', trigger: 'manual' })).run;
    expect(second.changes?.students).toEqual({ added: 1, removed: 1, changed: 1 });
    expect(second.changesText).toBe('1 student added, 1 student changed, 1 student removed');

    const third = (await runBackup({ destination: 'google_drive', trigger: 'manual' })).run;
    expect(third.changesText).toBe('No changes');
  });
  it('compares each destination with its own previous backup', async () => {
    await connect();
    await save([student('S1', 'A')]);
    await runBackup({ destination: 'local', trigger: 'manual' });
    await save([student('S1', 'A'), student('S2', 'B')]);
    const drive = (await runBackup({ destination: 'google_drive', trigger: 'manual' })).run;
    expect(drive.changes?.first).toBe(true); // Drive has never been backed up before, even though the device has
  });
  it('shows what is not yet backed up right now', async () => {
    await save([student('S1', 'A')]);
    await runBackup({ destination: 'local', trigger: 'manual' });
    expect((await pendingChanges('local'))?.total).toBe(0);
    await save([student('S1', 'A'), student('S2', 'B')]);
    expect((await pendingChanges('local'))?.students.added).toBe(1);
  });
  it('keeps fingerprints only for the newest backup of each destination', async () => {
    await save([student('S1', 'A')]);
    await runBackup({ destination: 'local', trigger: 'manual' });
    await runBackup({ destination: 'local', trigger: 'manual' });
    const db = await getDb();
    const rows = await db.query<{ manifest: unknown }>("select manifest from backup_runs where destination = 'local' order by id");
    expect(rows.map((r) => r.manifest !== null)).toEqual([false, true]);
  });
});

describe('local (download) backups', () => {
  it('returns the file for the browser to save, and records how it was made', async () => {
    await save([student('S1', 'A')]);
    const { run, content } = await runBackup({ destination: 'local', trigger: 'manual', user: 'owner' });
    expect(run.destination).toBe('local');
    expect(run.trigger).toBe('manual');
    expect(JSON.parse(content!).counts.students).toBe(1);
  });
  it('includes seat bookings (the old backup left them out)', async () => {
    await putKey('blib_bookings', JSON.stringify([{ id: 'B1', seat: 3, floor: 'basement', fromDate: '2026-10-01', dueDate: '2026-10-31', slotIds: ['S1'], status: 'active' }]));
    const { content } = await runBackup({ destination: 'local', trigger: 'manual' });
    const file = JSON.parse(content!);
    expect(JSON.parse(file.data.blib_bookings)).toHaveLength(1);
    expect(file.counts.bookings).toBe(1);
  });
});

describe('"first open each day" catch-up and the daily schedule', () => {
  it('does nothing without Google Drive', async () => {
    expect(await catchUpIfNeeded()).toMatchObject({ ran: false, reason: 'drive-not-connected' });
  });
  it('makes today’s backup once, and not again', async () => {
    await connect();
    await save([student('S1', 'A')]);
    const first = await catchUpIfNeeded();
    expect(first).toMatchObject({ ran: true, reason: 'success' });
    expect(first.run?.trigger).toBe('catch_up');
    expect(await catchUpIfNeeded()).toMatchObject({ ran: false, reason: 'already-done-today' });
    expect(google.files).toHaveLength(1);
  });
  it('a manual Drive backup today also counts', async () => {
    await connect();
    await runBackup({ destination: 'google_drive', trigger: 'manual' });
    expect((await catchUpIfNeeded()).reason).toBe('already-done-today');
  });
  it('makes a new one the next day', async () => {
    await connect();
    await catchUpIfNeeded(new Date('2026-10-25T10:00:00Z'));
    const db = await getDb();
    await db.query("update backup_runs set started_at = now() - interval '25 hours'");
    expect((await catchUpIfNeeded()).ran).toBe(true);
  });
  it('gives up for the day after three failures instead of retrying forever', async () => {
    await connect();
    google.state.failUploadsWith = 500;
    for (let i = 0; i < 3; i++) expect((await catchUpIfNeeded()).run?.status).toBe('failed');
    expect(await catchUpIfNeeded()).toMatchObject({ ran: false, reason: 'too-many-failures-today' });
  });
  it('the scheduled job runs, but skips when a backup has just been made', async () => {
    await connect();
    expect(await runScheduledBackup()).toMatchObject({ ran: true, reason: 'success' });
    expect(await runScheduledBackup()).toMatchObject({ ran: false, reason: 'recent-backup-exists' });
  });
  it('the scheduled job records a "skipped" day when Drive is not connected', async () => {
    const result = await runScheduledBackup();
    expect(result.run?.status).toBe('skipped');
  });
});

describe('status shown on the Backup page', () => {
  it('keeps the two destinations separate', async () => {
    await connect();
    await save([student('S1', 'A')]);
    await runBackup({ destination: 'local', trigger: 'manual' });
    await runBackup({ destination: 'google_drive', trigger: 'scheduled' });
    const s = await getBackupStatus();
    expect(s.local.last?.trigger).toBe('manual');
    expect(s.drive.last?.trigger).toBe('scheduled');
    expect(s.drive.connected).toBe(true);
    expect(s.drive.email).toBe('owner@gmail.com');
    expect(s.schedule.lastAutomatic?.trigger).toBe('scheduled');
    expect(s.schedule.nextWindow).toMatch(/2:00 am/i);
    expect(s.history).toHaveLength(2);
  });
  it('shows a recent failure next to the last success', async () => {
    await connect();
    await runBackup({ destination: 'google_drive', trigger: 'manual' });
    google.state.failUploadsWith = 500;
    await runBackup({ destination: 'google_drive', trigger: 'manual' });
    const s = await getBackupStatus();
    expect(s.drive.last?.status).toBe('success');
    expect(s.drive.lastFailure?.status).toBe('failed');
  });
  it('never exposes the stored Google key', async () => {
    await connect();
    expect(JSON.stringify(await getBackupStatus())).not.toMatch(/refresh|secret/i);
  });
});

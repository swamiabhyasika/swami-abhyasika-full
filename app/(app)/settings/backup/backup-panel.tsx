'use client';

import { useState, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { CalendarClock, Download, HardDrive, Link2, Unlink, Cloud } from 'lucide-react';
import type { BackupStatus, DestinationStatus, RunView } from '@/lib/backup/status';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

const TRIGGER: Record<string, string> = {
  manual: 'Manual (you clicked a button)',
  scheduled: 'Scheduled (daily routine)',
  catch_up: 'Catch-up (first open of the day)',
};
const TRIGGER_SHORT: Record<string, string> = { manual: 'Manual', scheduled: 'Scheduled', catch_up: 'Catch-up' };
const STATUS_BADGE = { success: 'success', failed: 'destructive', skipped: 'warning', running: 'info' } as const;
const NOTICE: Record<string, { variant: 'success' | 'warning' | 'destructive'; text: string }> = {
  connected: { variant: 'success', text: 'Google Drive is connected. The next backup will be saved there.' },
  denied: { variant: 'warning', text: 'Google Drive was not connected because access was not approved.' },
  'not-configured': { variant: 'warning', text: 'Google Drive is not set up on the server yet (the Google client ID and secret are missing).' },
  'bad-state': { variant: 'destructive', text: 'The Google sign-in expired or did not match. Please try connecting again.' },
  error: { variant: 'destructive', text: 'Could not connect Google Drive. Please try again.' },
};

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[9.5rem_1fr] gap-3 border-b py-2 text-[13px] last:border-0">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="min-w-0 break-words">{children}</dd>
    </div>
  );
}

function countsText(r: RunView | null) {
  if (!r?.counts) return '—';
  const c = r.counts;
  return `${c.students} students, ${c.payments} payments, ${c.bookings} seat bookings, ${c.photos} photos`;
}

function DestinationDetails({ d, destination }: { d: DestinationStatus; destination: ReactNode }) {
  const r = d.last;
  return (
    <dl>
      <Field label="Last backup">{r ? <strong>{r.startedAtText}</strong> : <span className="text-muted-foreground">No backup yet</span>}</Field>
      <Field label="Destination">{destination}</Field>
      <Field label="How it was made">{r ? TRIGGER[r.trigger] : '—'}</Field>
      <Field label="What was saved">{countsText(r)}</Field>
      <Field label="Changes in that backup">{r ? r.changesText : '—'}</Field>
      <Field label="Not yet backed up">
        {d.pendingTotal === null ? (
          d.pendingText
        ) : d.pendingTotal === 0 ? (
          <Badge variant="success">Up to date</Badge>
        ) : (
          <span>
            <Badge variant="warning">{d.pendingTotal} change{d.pendingTotal === 1 ? '' : 's'}</Badge> <span className="text-muted-foreground">{d.pendingText}</span>
          </span>
        )}
      </Field>
      <Field label="File">{r ? `${r.fileName} · ${r.sizeText}` : '—'}</Field>
      <Field label="Backups made">{d.totalBackups}</Field>
    </dl>
  );
}

export function BackupPanel({ status, canEdit, notice }: { status: BackupStatus; canEdit: boolean; notice?: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);
  const { local, drive, schedule } = status;
  const banner = notice ? NOTICE[notice] : undefined;

  async function act(name: string, fn: () => Promise<string>) {
    setBusy(name);
    setMessage(null);
    try {
      setMessage({ kind: 'ok', text: await fn() });
    } catch (e) {
      setMessage({ kind: 'error', text: e instanceof Error ? e.message : 'Something went wrong.' });
    } finally {
      setBusy(null);
      router.refresh();
    }
  }

  const download = () =>
    act('download', async () => {
      const res = await fetch('/api/backup/download', { method: 'POST' });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).message || 'Backup failed.');
      const name = /filename="([^"]+)"/.exec(res.headers.get('Content-Disposition') || '')?.[1] || 'swami-backup.json';
      const url = URL.createObjectURL(await res.blob());
      const a = Object.assign(document.createElement('a'), { href: url, download: name });
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      return `Backup downloaded as ${name}. Keep the file somewhere safe.`;
    });

  const backupToDrive = () =>
    act('drive', async () => {
      const res = await fetch('/api/backup/drive', { method: 'POST' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.run?.error || data.message || 'Backup to Google Drive failed.');
      return `Backup saved to Google Drive (${data.run.fileName}).`;
    });

  const disconnect = () => {
    if (!window.confirm('Disconnect Google Drive? Automatic backups to Drive will stop. Files already in Drive stay there.')) return;
    return act('disconnect', async () => {
      const res = await fetch('/api/google/disconnect', { method: 'POST' });
      if (!res.ok) throw new Error('Could not disconnect.');
      return 'Google Drive disconnected.';
    });
  };

  return (
    <div className="flex flex-col gap-5">
      {banner && (
        <Alert variant={banner.variant}>
          <AlertDescription>{banner.text}</AlertDescription>
        </Alert>
      )}
      {message && (
        <Alert variant={message.kind === 'ok' ? 'success' : 'destructive'} role="status">
          <AlertDescription>{message.text}</AlertDescription>
        </Alert>
      )}

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center gap-2">
            <CalendarClock className="size-4 text-accent-foreground" aria-hidden="true" />
            <CardTitle>Automatic daily backup</CardTitle>
            {drive.connected && !drive.needsReconnect ? <Badge variant="success">On</Badge> : <Badge variant="warning">Waiting for Google Drive</Badge>}
          </div>
          <CardDescription>Like a daily alarm: once a day the app saves a backup to Google Drive by itself.</CardDescription>
        </CardHeader>
        <CardContent>
          <dl>
            <Field label="Next scheduled run">
              <strong>{schedule.nextWindow}</strong> <span className="text-muted-foreground">({status.timezone})</span>
              <div className="text-xs text-muted-foreground">{schedule.description}</div>
            </Field>
            <Field label="Catch-up">If no backup has happened yet today when someone opens the app, it is made then, so a day is never missed.</Field>
            <Field label="Last automatic backup">
              {schedule.lastAutomatic ? (
                <span>
                  {schedule.lastAutomatic.startedAtText} · {TRIGGER_SHORT[schedule.lastAutomatic.trigger]} · <Badge variant={STATUS_BADGE[schedule.lastAutomatic.status]}>{schedule.lastAutomatic.status}</Badge>
                  {schedule.lastAutomatic.error && <span className="block text-xs text-destructive">{schedule.lastAutomatic.error}</span>}
                </span>
              ) : (
                <span className="text-muted-foreground">None yet</span>
              )}
            </Field>
          </dl>
        </CardContent>
      </Card>

      <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <HardDrive className="size-4 text-accent-foreground" aria-hidden="true" />
              <CardTitle>On this device</CardTitle>
              <Badge variant="secondary">Manual only</Badge>
            </div>
            <CardDescription>A file you download yourself. A website cannot save files on your device by itself, so these are never automatic.</CardDescription>
          </CardHeader>
          <CardContent>
            <DestinationDetails d={local} destination="Your device (the Downloads folder of this browser)" />
            {local.lastFailure && (
              <Alert variant="destructive" className="mt-3">
                <AlertTitle>The last attempt failed ({local.lastFailure.startedAtText})</AlertTitle>
                <AlertDescription>{local.lastFailure.error}</AlertDescription>
              </Alert>
            )}
            <p className="mt-3 text-xs text-muted-foreground">The history records that a download was started; the app cannot see whether you kept the file.</p>
          </CardContent>
          <CardFooter>
            <Button onClick={download} disabled={!canEdit || busy !== null}>
              <Download aria-hidden="true" />
              {busy === 'download' ? 'Preparing…' : 'Download backup now'}
            </Button>
          </CardFooter>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex flex-wrap items-center gap-2">
              <Cloud className="size-4 text-accent-foreground" aria-hidden="true" />
              <CardTitle>Google Drive</CardTitle>
              {drive.connected ? drive.needsReconnect ? <Badge variant="destructive">Reconnect needed</Badge> : <Badge variant="success">Connected</Badge> : <Badge variant="secondary">Not connected</Badge>}
            </div>
            <CardDescription>Saved automatically (daily) or whenever you click the button. The app can only see the backup files it creates, never the rest of your Drive.</CardDescription>
          </CardHeader>
          <CardContent>
            {!drive.configured && (
              <Alert variant="info" className="mb-3">
                <AlertTitle>Google Drive is not set up on the server yet</AlertTitle>
                <AlertDescription>The owner needs to add the Google client ID and secret to the app settings first (see README → “Backups to Google Drive”).</AlertDescription>
              </Alert>
            )}
            {drive.needsReconnect && (
              <Alert variant="destructive" className="mb-3">
                <AlertTitle>Google Drive needs to be connected again</AlertTitle>
                <AlertDescription>{drive.lastError || 'Access was removed or expired.'}</AlertDescription>
              </Alert>
            )}
            <DestinationDetails
              d={drive}
              destination={drive.connected ? `Google Drive › ${drive.email} › folder “${drive.folderName}”` : <span className="text-muted-foreground">Not connected yet</span>}
            />
            {drive.lastFailure && (
              <Alert variant="destructive" className="mt-3">
                <AlertTitle>The last attempt failed ({drive.lastFailure.startedAtText})</AlertTitle>
                <AlertDescription>{drive.lastFailure.error}</AlertDescription>
              </Alert>
            )}
          </CardContent>
          <CardFooter className="flex-wrap">
            {drive.connected && !drive.needsReconnect ? (
              <>
                <Button onClick={backupToDrive} disabled={!canEdit || busy !== null}>
                  <Cloud aria-hidden="true" />
                  {busy === 'drive' ? 'Uploading…' : 'Back up to Drive now'}
                </Button>
                <Button variant="outline" onClick={disconnect} disabled={!canEdit || busy !== null}>
                  <Unlink aria-hidden="true" />
                  Disconnect
                </Button>
              </>
            ) : (
              canEdit && drive.configured ? (
                <Button asChild>
                  <a href="/api/google/connect">
                    <Link2 aria-hidden="true" />
                    {drive.needsReconnect ? 'Reconnect Google Drive' : 'Connect Google Drive'}
                  </a>
                </Button>
              ) : (
                <Button disabled>
                  <Link2 aria-hidden="true" />
                  {drive.needsReconnect ? 'Reconnect Google Drive' : 'Connect Google Drive'}
                </Button>
              )
            )}
            {!canEdit && <p className="text-xs text-muted-foreground">Only the owner can change backups.</p>}
          </CardFooter>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Backup history</CardTitle>
          <CardDescription>The 30 most recent attempts, including the ones that failed.</CardDescription>
        </CardHeader>
        <CardContent>
          {status.history.length === 0 ? (
            <p className="text-sm text-muted-foreground">No backups yet. Click “Download backup now” to make the first one.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>When ({status.timezone})</TableHead>
                  <TableHead>Where</TableHead>
                  <TableHead>How</TableHead>
                  <TableHead>Result</TableHead>
                  <TableHead>Size</TableHead>
                  <TableHead>Changes</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {status.history.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="whitespace-nowrap">{r.startedAtText}</TableCell>
                    <TableCell>{r.destination === 'local' ? 'This device' : 'Google Drive'}</TableCell>
                    <TableCell>{TRIGGER_SHORT[r.trigger]}</TableCell>
                    <TableCell>
                      <Badge variant={STATUS_BADGE[r.status]}>{r.status}</Badge>
                      {r.error && <div className="mt-1 max-w-56 text-xs text-destructive">{r.error}</div>}
                    </TableCell>
                    <TableCell className="whitespace-nowrap">{r.sizeText}</TableCell>
                    <TableCell className="text-muted-foreground">{r.changesText}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

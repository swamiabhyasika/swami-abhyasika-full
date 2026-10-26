import { NextRequest, NextResponse } from 'next/server';
import { requireOwner } from '@/lib/auth';
import { BackupBusyError, runBackup } from '@/lib/backup/runner';

export const runtime = 'nodejs';
export const maxDuration = 60;

/** "Back up to Google Drive now". */
export async function POST(req: NextRequest) {
  const auth = await requireOwner(req);
  if ('response' in auth) return auth.response;
  try {
    const { run } = await runBackup({ destination: 'google_drive', trigger: 'manual', user: auth.session.username });
    return NextResponse.json({ run }, { status: run.status === 'success' ? 200 : 502 });
  } catch (e) {
    if (e instanceof BackupBusyError) return NextResponse.json({ message: e.message }, { status: 409 });
    console.error('[backup/drive]', e);
    return NextResponse.json({ message: 'Backup failed. Please try again.' }, { status: 500 });
  }
}

import { NextRequest, NextResponse } from 'next/server';
import { requireOwner } from '@/lib/auth';
import { BackupBusyError, runBackup } from '@/lib/backup/runner';

export const runtime = 'nodejs';

/** "Download backup now": builds a complete backup, records it in the history, and sends it to the browser to save. */
export async function POST(req: NextRequest) {
  const auth = await requireOwner(req);
  if ('response' in auth) return auth.response;
  try {
    const { run, content } = await runBackup({ destination: 'local', trigger: 'manual', user: auth.session.username });
    if (run.status !== 'success' || !content) return NextResponse.json({ message: run.error || 'Backup failed', run }, { status: 500 });
    return new NextResponse(content, {
      headers: {
        'Content-Type': 'application/json',
        'Content-Disposition': `attachment; filename="${run.fileName}"`,
        'X-Backup-Run': String(run.id),
        'Cache-Control': 'no-store',
      },
    });
  } catch (e) {
    if (e instanceof BackupBusyError) return NextResponse.json({ message: e.message }, { status: 409 });
    console.error('[backup/download]', e);
    return NextResponse.json({ message: 'Backup failed. Please try again.' }, { status: 500 });
  }
}

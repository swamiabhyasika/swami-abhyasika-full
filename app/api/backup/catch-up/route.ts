import { NextRequest, NextResponse } from 'next/server';
import { requireSession } from '@/lib/auth';
import { catchUpIfNeeded } from '@/lib/backup/runner';

export const runtime = 'nodejs';
export const maxDuration = 60;

/** Called quietly when someone opens the app. Makes today's Google Drive backup if it has not happened yet. */
export async function POST(req: NextRequest) {
  const auth = await requireSession(req);
  if ('response' in auth) return auth.response;
  try {
    const { ran, reason } = await catchUpIfNeeded();
    return NextResponse.json({ ran, reason });
  } catch (e) {
    console.error('[backup/catch-up]', e);
    return NextResponse.json({ ran: false, reason: 'error' });
  }
}

import { timingSafeEqual } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { runScheduledBackup } from '@/lib/backup/runner';

export const runtime = 'nodejs';
export const maxDuration = 60;

function authorised(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false; // never run without a secret: anyone on the internet could trigger it
  const given = req.headers.get('authorization') || '';
  const expected = `Bearer ${secret}`;
  return given.length === expected.length && timingSafeEqual(Buffer.from(given), Buffer.from(expected));
}

/** Vercel Cron calls this once a day (see vercel.json) and sends `Authorization: Bearer <CRON_SECRET>`. */
export async function GET(req: NextRequest) {
  if (!authorised(req)) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  const result = await runScheduledBackup();
  return NextResponse.json({ ran: result.ran, reason: result.reason, status: result.run?.status });
}

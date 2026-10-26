import { NextRequest, NextResponse } from 'next/server';
import { requireOwner } from '@/lib/auth';
import { disconnectDrive } from '@/lib/backup/drive';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  const auth = await requireOwner(req);
  if ('response' in auth) return auth.response;
  await disconnectDrive();
  return NextResponse.json({ ok: true });
}

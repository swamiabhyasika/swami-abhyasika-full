import { NextRequest, NextResponse } from 'next/server';
import { requireSession } from '@/lib/auth';
import { getState, getVersions } from '@/lib/state';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Everything the UI needs at start-up: `data` is a flat { key: value } object (same shape as localStorage); `versions` guard against stale saves. */
export async function GET(req: NextRequest) {
  const auth = await requireSession(req);
  if ('response' in auth) return auth.response;
  return NextResponse.json({ data: await getState(), versions: await getVersions() }, { headers: { 'Cache-Control': 'no-store' } });
}

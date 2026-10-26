import { NextRequest, NextResponse } from 'next/server';
import { clearAuthCookies, readSession } from '@/lib/auth';

export const runtime = 'nodejs';

/** Pages cannot renew an expired login themselves, so they send the browser here first, then back. */
export async function GET(req: NextRequest) {
  const next = req.nextUrl.searchParams.get('next') || '/dashboard';
  const safe = next.startsWith('/') && !next.startsWith('//') ? next : '/dashboard';
  const session = await readSession(req); // renews the cookies as a side effect
  if (!session) {
    const res = NextResponse.redirect(new URL('/login', req.url));
    clearAuthCookies(res);
    return res;
  }
  return NextResponse.redirect(new URL(safe, req.url));
}

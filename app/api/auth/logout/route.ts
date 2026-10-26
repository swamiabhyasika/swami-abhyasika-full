import { NextRequest, NextResponse } from 'next/server';
import { AT_COOKIE, clearAuthCookies, supabaseSignOut } from '@/lib/auth';

export const runtime = 'nodejs';

async function signOut(req: NextRequest) {
  await supabaseSignOut(req.cookies.get(AT_COOKIE)?.value);
  const res = NextResponse.redirect(new URL('/login', req.url), 303);
  clearAuthCookies(res);
  return res;
}
export const GET = signOut;
export const POST = signOut;

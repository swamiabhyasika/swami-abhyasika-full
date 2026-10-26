import { NextRequest, NextResponse } from 'next/server';
import { readSession } from '@/lib/auth';

export const dynamic = 'force-dynamic';

/** The bare address "/" just forwards to the dashboard (or to the login page). */
export async function GET(req: NextRequest) {
  const session = await readSession(req);
  return NextResponse.redirect(new URL(session ? '/dashboard' : '/login', req.url));
}

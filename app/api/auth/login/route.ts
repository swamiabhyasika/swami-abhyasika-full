import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { getDb } from '@/lib/db';
import { usingSupabase } from '@/lib/config';
import { enrollOrLookup, sbAuth, setSessionCookie, signSession, supabaseSignOut, writeSupabaseCookies } from '@/lib/auth';

export const runtime = 'nodejs';

// Basic brute-force protection: 5 wrong passwords per person+IP locks that pair for 15 minutes.
const attempts = new Map<string, { n: number; until: number }>();
const MAX = 5;
const LOCK_MS = 15 * 60 * 1000;

function noteFailure(id: string) {
  const rec = attempts.get(id);
  attempts.set(id, { n: (rec && rec.until > Date.now() ? rec.n : 0) + 1, until: Date.now() + LOCK_MS });
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const identifier = String(body?.email ?? body?.username ?? body?.identifier ?? '').trim();
  const password = String(body?.password ?? '');
  if (!identifier || !password) return NextResponse.json({ message: 'Please enter your login and password' }, { status: 400 });

  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'local';
  const id = `${ip}|${identifier.toLowerCase()}`;
  const rec = attempts.get(id);
  if (rec && rec.n >= MAX && rec.until > Date.now()) {
    return NextResponse.json({ message: 'Too many attempts. Try again in a few minutes.' }, { status: 429 });
  }

  // ── Supabase Auth ──
  if (usingSupabase()) {
    const { data, error } = await sbAuth().auth.signInWithPassword({ email: identifier.toLowerCase(), password });
    if (error || !data.session || !data.user) {
      noteFailure(id);
      const unconfirmed = /not confirmed/i.test(error?.message || '');
      return NextResponse.json({ message: unconfirmed ? 'Please confirm your email address first.' : 'Invalid email or password' }, { status: 401 });
    }
    const role = await enrollOrLookup(data.user);
    if (!role) {
      await supabaseSignOut(data.session.access_token);
      return NextResponse.json({ message: 'This account has not been given access to the app. Ask the owner to add you.' }, { status: 403 });
    }
    attempts.delete(id);
    const res = NextResponse.json({ ok: true, user: { username: data.user.email, role } });
    writeSupabaseCookies(res.cookies, data.session);
    return res;
  }

  // ── Local login (no Supabase configured) ──
  const db = await getDb();
  const [user] = await db.query<{ id: string; username: string; password_hash: string | null; role: string }>(
    'select id, username, password_hash, role from users where lower(username) = lower($1)',
    [identifier],
  );
  const ok = user?.password_hash
    ? bcrypt.compareSync(password, user.password_hash)
    : (bcrypt.compareSync(password, '$2a$10$invalidinvalidinvalidinvalidinvalidinvalidinvalidinvali'), false);
  if (!ok) {
    noteFailure(id);
    return NextResponse.json({ message: 'Invalid username or password' }, { status: 401 });
  }
  attempts.delete(id);
  const res = NextResponse.json({ ok: true, user: { username: user.username, role: user.role } });
  setSessionCookie(res, await signSession(user));
  return res;
}

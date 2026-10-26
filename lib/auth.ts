import fs from 'node:fs';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import { cookies } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';
import { SignJWT, jwtVerify } from 'jose';
import { createClient, type Session as SbSession, type SupabaseClient, type User as SbUser } from '@supabase/supabase-js';
import { getDb } from './db';
import { supabaseConfig, usingSupabase } from './config';

/*
 * Two ways to sign in, chosen automatically:
 *   • Supabase Auth (SUPABASE_URL + key present)  — email + password, tokens kept in httpOnly cookies.
 *   • Local login (nothing configured)            — username + password stored in our own `users` table.
 * Either way, a person is only let in if they are listed in our `users` table (the allow-list).
 */

export const COOKIE = 'swami_session'; // local mode
export const AT_COOKIE = 'swami_sb_at'; // Supabase access token (short-lived)
export const RT_COOKIE = 'swami_sb_rt'; // Supabase refresh token (long-lived)
const SESSION_DAYS = Number(process.env.SESSION_DAYS || 7);

export interface Session {
  sub: string;
  username: string;
  role: string;
}

// ─────────────────────────── local mode ───────────────────────────

function secretKey(): Uint8Array {
  let secret = process.env.AUTH_SECRET;
  if (!secret) {
    // Serverless hosting has no persistent disk, so the key must come from the environment there.
    if (process.env.VERCEL) throw new Error('AUTH_SECRET must be set in the Vercel environment variables');
    // Local / self-hosted: generate one once and keep it, so logins survive restarts.
    const file = path.join(process.cwd(), 'data', '.dev-auth-secret');
    if (!fs.existsSync(file)) {
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, randomBytes(32).toString('hex'));
    }
    secret = fs.readFileSync(file, 'utf8').trim();
  }
  return new TextEncoder().encode(secret);
}

export async function signSession(user: { id: string; username: string; role: string }): Promise<string> {
  return new SignJWT({ username: user.username, role: user.role })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(user.id)
    .setIssuedAt()
    .setExpirationTime(`${SESSION_DAYS}d`)
    .sign(secretKey());
}

async function readLocalToken(token: string | undefined): Promise<Session | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secretKey());
    return { sub: String(payload.sub), username: String(payload.username), role: String(payload.role || 'owner') };
  } catch {
    return null;
  }
}

export function setSessionCookie(res: NextResponse, token: string) {
  res.cookies.set(COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: SESSION_DAYS * 86400,
  });
}

// ─────────────────────────── Supabase mode ───────────────────────────

const g = globalThis as unknown as { __sbAuth?: SupabaseClient };

/** A server-side Supabase client that only does authentication (it never stores a session itself). */
export function sbAuth(): SupabaseClient {
  const cfg = supabaseConfig();
  if (!cfg) throw new Error('Supabase is not configured');
  if (!g.__sbAuth) {
    g.__sbAuth = createClient(cfg.url, cfg.anonKey, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
  }
  return g.__sbAuth;
}

type CookieJar = { set: (name: string, value: string, options?: Record<string, unknown>) => unknown };

export function writeSupabaseCookies(jar: CookieJar, session: Pick<SbSession, 'access_token' | 'refresh_token' | 'expires_in'>) {
  const base = { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', path: '/' } as const;
  jar.set(AT_COOKIE, session.access_token, { ...base, maxAge: Math.max(60, session.expires_in || 3600) });
  jar.set(RT_COOKIE, session.refresh_token, { ...base, maxAge: SESSION_DAYS * 86400 });
}

export function clearAuthCookies(res: NextResponse) {
  for (const name of [COOKIE, AT_COOKIE, RT_COOKIE]) res.cookies.set(name, '', { httpOnly: true, sameSite: 'lax', path: '/', maxAge: 0 });
}

/** Checks the signature and expiry of a Supabase access token. Returns its claims, or null. */
async function verifyAccessToken(token: string): Promise<{ sub: string; email?: string } | null> {
  try {
    const { data, error } = await sbAuth().auth.getClaims(token);
    if (error || !data?.claims?.sub) return null;
    return { sub: String(data.claims.sub), email: typeof data.claims.email === 'string' ? data.claims.email : undefined };
  } catch {
    return null;
  }
}

/** Who is allowed in? Anyone listed in `users`. Cached for 30 seconds to spare the database. */
const roleCache = new Map<string, { role: string | null; until: number }>();
export async function roleFor(userId: string): Promise<string | null> {
  const hit = roleCache.get(userId);
  if (hit && hit.until > Date.now()) return hit.role;
  const db = await getDb();
  const [row] = await db.query<{ role: string }>('select role from users where id = $1', [userId]);
  roleCache.set(userId, { role: row?.role ?? null, until: Date.now() + 30_000 });
  return row?.role ?? null;
}
export function forgetRole(userId?: string) {
  if (userId) roleCache.delete(userId);
  else roleCache.clear();
}

/**
 * Called right after a successful Supabase sign-in. Returns the person's role, or null if they are not
 * on the allow-list. The owner (ADMIN_EMAIL) is added automatically the first time they sign in,
 * but only if Supabase has verified that the email really belongs to them.
 */
export async function enrollOrLookup(user: Pick<SbUser, 'id' | 'email' | 'email_confirmed_at'>): Promise<string | null> {
  const db = await getDb();
  const email = (user.email || '').toLowerCase();
  const [row] = await db.query<{ role: string }>('select role from users where id = $1', [user.id]);
  if (row) return row.role;
  const owner = (process.env.ADMIN_EMAIL || '').trim().toLowerCase();
  if (owner && email === owner && user.email_confirmed_at) {
    await db.query(
      `insert into users (id, username, email, role, password_hash) values ($1,$2,$2,'owner',null)
       on conflict (id) do update set role = 'owner'`,
      [user.id, email],
    );
    forgetRole(user.id);
    return 'owner';
  }
  return null;
}

// Several requests often arrive together with the same expired token; share one refresh between them.
const refreshing = new Map<string, Promise<SbSession | null>>();
async function refreshOnce(refreshToken: string): Promise<SbSession | null> {
  let p = refreshing.get(refreshToken);
  if (!p) {
    p = sbAuth()
      .auth.refreshSession({ refresh_token: refreshToken })
      .then(({ data, error }) => (error || !data.session ? null : data.session))
      .catch(() => null);
    refreshing.set(refreshToken, p);
    setTimeout(() => refreshing.delete(refreshToken), 15_000).unref?.();
  }
  return p;
}

async function sessionFromClaims(claims: { sub: string; email?: string } | null): Promise<Session | null> {
  if (!claims) return null;
  const role = await roleFor(claims.sub);
  return role ? { sub: claims.sub, username: claims.email || claims.sub, role } : null;
}

/**
 * Route handlers: reads the session and, if the short-lived token has expired, quietly gets a new one
 * from the refresh token and stores it in the response cookies.
 */
async function readSupabaseSession(req: NextRequest): Promise<Session | null> {
  const at = req.cookies.get(AT_COOKIE)?.value;
  const rt = req.cookies.get(RT_COOKIE)?.value;
  const current = at ? await sessionFromClaims(await verifyAccessToken(at)) : null;
  if (current) return current;
  if (!rt) return null;
  const fresh = await refreshOnce(rt);
  if (!fresh) return null;
  writeSupabaseCookies(await cookies(), fresh);
  return sessionFromClaims(await verifyAccessToken(fresh.access_token));
}

/** Server components cannot set cookies, so this only reads. `needsRefresh` tells the caller to go through /api/auth/refresh. */
export async function readSessionForPage(): Promise<{ session: Session | null; needsRefresh: boolean }> {
  const jar = await cookies();
  if (!usingSupabase()) return { session: await readLocalToken(jar.get(COOKIE)?.value), needsRefresh: false };
  const at = jar.get(AT_COOKIE)?.value;
  const session = at ? await sessionFromClaims(await verifyAccessToken(at)) : null;
  return { session, needsRefresh: !session && Boolean(jar.get(RT_COOKIE)?.value) };
}

/** Best effort: tell Supabase to end this login. */
export async function supabaseSignOut(accessToken: string | undefined) {
  const cfg = supabaseConfig();
  if (!cfg || !accessToken) return;
  await fetch(`${cfg.url}/auth/v1/logout?scope=local`, {
    method: 'POST',
    headers: { apikey: cfg.anonKey, Authorization: `Bearer ${accessToken}` },
  }).catch(() => {});
}

// ─────────────────────────── shared entry points ───────────────────────────

export async function readSession(req: NextRequest): Promise<Session | null> {
  return usingSupabase() ? readSupabaseSession(req) : readLocalToken(req.cookies.get(COOKIE)?.value);
}

/** Use at the top of every protected API route. Returns the session, or a ready 401 response. */
export async function requireSession(req: NextRequest): Promise<{ session: Session } | { response: NextResponse }> {
  const session = await readSession(req);
  if (!session) return { response: NextResponse.json({ message: 'Not signed in' }, { status: 401 }) };
  return { session };
}

/** For changes only the owner may make (templates, backups, Google Drive connection). */
export async function requireOwner(req: NextRequest): Promise<{ session: Session } | { response: NextResponse }> {
  const auth = await requireSession(req);
  if ('response' in auth) return auth;
  if (auth.session.role !== 'owner') return { response: NextResponse.json({ message: 'Only the owner can do this.' }, { status: 403 }) };
  return auth;
}

// ─────────────────────────── helpers for other modules ───────────────────────────

/** The server's secret key (used to sign short-lived tokens and to encrypt stored keys). */
export function appSecret(): Uint8Array {
  return secretKey();
}

/** A signed token that stops working after `ttlSeconds` (used for the Google sign-in "state"). */
export async function signShortLived(payload: Record<string, unknown>, ttlSeconds: number): Promise<string> {
  return new SignJWT(payload).setProtectedHeader({ alg: 'HS256' }).setIssuedAt().setExpirationTime(`${ttlSeconds}s`).sign(secretKey());
}
export async function verifyShortLived(token: string): Promise<Record<string, unknown> | null> {
  try {
    return (await jwtVerify(token, secretKey())).payload as Record<string, unknown>;
  } catch {
    return null;
  }
}

import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { startMockGoTrue } from '../helpers/mock-gotrue';

// A stand-in for the browser's cookie jar (the real one only exists while a web request is being served).
const jar = vi.hoisted(() => new Map<string, string>());
vi.mock('next/headers', () => ({
  cookies: async () => ({ set: (n: string, v: string) => jar.set(n, v), get: (n: string) => (jar.has(n) ? { value: jar.get(n) } : undefined) }),
}));

let gotrue: Awaited<ReturnType<typeof startMockGoTrue>>;
let login: typeof import('@/app/api/auth/login/route').POST;
let auth: typeof import('@/lib/auth');
let db: Awaited<ReturnType<typeof import('@/lib/db').getDb>>;

const OWNER = 'owner@example.com';
const post = (email: string, password: string, ip = '1.1.1.1') =>
  login(new NextRequest('http://localhost/api/auth/login', { method: 'POST', headers: { 'content-type': 'application/json', 'x-forwarded-for': ip }, body: JSON.stringify({ email, password }) }));
const cookieValue = (res: Response, name: string) => (res.headers.getSetCookie().find((c) => c.startsWith(name + '=')) || '').split(';')[0].slice(name.length + 1);
const reqWith = (cookies: Record<string, string>) =>
  new NextRequest('http://localhost/api/state', { headers: { cookie: Object.entries(cookies).map(([k, v]) => `${k}=${v}`).join('; ') } });

beforeAll(async () => {
  gotrue = await startMockGoTrue();
  process.env.SUPABASE_URL = gotrue.url;
  process.env.SUPABASE_ANON_KEY = 'anon-key';
  process.env.ADMIN_EMAIL = OWNER;
  auth = await import('@/lib/auth');
  login = (await import('@/app/api/auth/login/route')).POST;
  db = await (await import('@/lib/db')).getDb();
});
afterAll(async () => {
  await gotrue.close();
});
beforeEach(async () => {
  await db.query('delete from users');
  auth.forgetRole();
  jar.clear();
  gotrue.reset();
  gotrue.state.accessTtl = 3600;
});

describe('signing in with Supabase Auth', () => {
  it('lets the owner in the first time (their email is confirmed and matches ADMIN_EMAIL) and sets private cookies', async () => {
    gotrue.addUser(OWNER, 'Correct-Horse-1');
    const res = await post(OWNER, 'Correct-Horse-1');
    expect(res.status).toBe(200);
    expect((await res.json()).user).toEqual({ username: OWNER, role: 'owner' });
    const setCookies = res.headers.getSetCookie().join('\n');
    expect(setCookies).toMatch(/swami_sb_at=.*HttpOnly/i);
    expect(setCookies).toMatch(/swami_sb_rt=.*HttpOnly/i);
    expect((await db.query("select role from users where email = $1", [OWNER]))[0].role).toBe('owner');
  });

  it('refuses a wrong password and an unknown email with the same message', async () => {
    gotrue.addUser(OWNER, 'Correct-Horse-1');
    const a = await post(OWNER, 'wrong');
    const b = await post('nobody@example.com', 'whatever');
    expect([a.status, b.status]).toEqual([401, 401]);
    expect((await a.json()).message).toBe((await b.json()).message);
  });

  it('tells a person to confirm their email', async () => {
    gotrue.addUser('new@example.com', 'Passw0rd!x', false);
    const res = await post('new@example.com', 'Passw0rd!x');
    expect(res.status).toBe(401);
    expect((await res.json()).message).toMatch(/confirm/i);
  });

  it('keeps out someone who has a Supabase login but is not on the allow-list (for example a stranger who signed up)', async () => {
    gotrue.addUser('stranger@example.com', 'Passw0rd!x');
    const before = gotrue.state.logouts;
    const res = await post('stranger@example.com', 'Passw0rd!x');
    expect(res.status).toBe(403);
    expect(res.headers.getSetCookie().join('')).not.toContain('swami_sb_at');
    expect(gotrue.state.logouts).toBe(before + 1);
  });

  it('lets in someone the owner added, with the role they were given', async () => {
    const staff = gotrue.addUser('staff@example.com', 'Passw0rd!x');
    await db.query("insert into users (id, username, email, role) values ($1,$2,$2,'staff')", [staff.id, staff.email]);
    const res = await post('staff@example.com', 'Passw0rd!x');
    expect(res.status).toBe(200);
    expect((await res.json()).user.role).toBe('staff');
  });

  it('never makes someone an owner just because their email matches, unless Supabase confirmed it', async () => {
    const id = crypto.randomUUID();
    expect(await auth.enrollOrLookup({ id, email: OWNER, email_confirmed_at: undefined })).toBeNull();
    expect(await auth.enrollOrLookup({ id, email: 'someone.else@example.com', email_confirmed_at: new Date().toISOString() })).toBeNull();
    expect(await auth.enrollOrLookup({ id, email: OWNER.toUpperCase(), email_confirmed_at: new Date().toISOString() })).toBe('owner');
  });

  it('slows down guessing: five wrong passwords lock that person out for a while', async () => {
    gotrue.addUser(OWNER, 'Correct-Horse-1');
    for (let i = 0; i < 5; i++) expect((await post(OWNER, 'bad', '9.9.9.9')).status).toBe(401);
    expect((await post(OWNER, 'Correct-Horse-1', '9.9.9.9')).status).toBe(429);
  });

  it('asks for both fields', async () => {
    expect((await post('', '')).status).toBe(400);
  });
});

describe('staying signed in', () => {
  async function signedIn() {
    gotrue.addUser(OWNER, 'Correct-Horse-1');
    const res = await post(OWNER, 'Correct-Horse-1', '2.2.2.2');
    return { at: cookieValue(res, 'swami_sb_at'), rt: cookieValue(res, 'swami_sb_rt') };
  }

  it('recognises a valid login (token checked against Supabase’s public keys, no network call per page)', async () => {
    const { at, rt } = await signedIn();
    const s = await auth.readSession(reqWith({ swami_sb_at: at, swami_sb_rt: rt }));
    expect(s).toMatchObject({ username: OWNER, role: 'owner' });
  });

  it('rejects a forged or tampered token', async () => {
    const { at } = await signedIn();
    const forged = at.slice(0, -4) + 'AAAA';
    expect(await auth.readSession(reqWith({ swami_sb_at: forged }))).toBeNull();
    expect(await auth.readSession(reqWith({ swami_sb_at: 'not.a.token' }))).toBeNull();
    expect(await auth.readSession(reqWith({}))).toBeNull();
  });

  it('quietly renews an expired token using the refresh token, and stores the new one', async () => {
    const { rt } = await signedIn();
    const user = (await db.query<{ id: string }>('select id from users limit 1'))[0];
    const expired = await gotrue.expiredToken({ id: user.id, email: OWNER, password: '', confirmed: true });
    const before = gotrue.state.refreshCalls;
    const s = await auth.readSession(reqWith({ swami_sb_at: expired, swami_sb_rt: rt }));
    expect(s).toMatchObject({ username: OWNER });
    expect(gotrue.state.refreshCalls).toBe(before + 1);
    expect(jar.get('swami_sb_at')).toBeTruthy();
    expect(jar.get('swami_sb_at')).not.toBe(expired);
  });

  it('shares one renewal between requests that arrive together', async () => {
    const { rt } = await signedIn();
    const before = gotrue.state.refreshCalls;
    const results = await Promise.all([1, 2, 3].map(() => auth.readSession(reqWith({ swami_sb_rt: rt }))));
    expect(results.every((r) => r?.username === OWNER)).toBe(true);
    expect(gotrue.state.refreshCalls).toBe(before + 1);
  });

  it('signs the person out when the refresh token has been revoked', async () => {
    const { rt } = await signedIn();
    gotrue.revokeRefreshTokens();
    expect(await auth.readSession(reqWith({ swami_sb_rt: rt }))).toBeNull();
  });

  it('stops working as soon as the owner removes someone from the allow-list (within 30 seconds)', async () => {
    const { at } = await signedIn();
    expect(await auth.readSession(reqWith({ swami_sb_at: at }))).not.toBeNull();
    await db.query('delete from users');
    auth.forgetRole(); // the 30-second memory; the real app lets it expire
    expect(await auth.readSession(reqWith({ swami_sb_at: at }))).toBeNull();
  });

  it('only lets the owner change settings', async () => {
    const staff = gotrue.addUser('staff@example.com', 'Passw0rd!x');
    await db.query("insert into users (id, username, email, role) values ($1,$2,$2,'staff')", [staff.id, staff.email]);
    const res = await post('staff@example.com', 'Passw0rd!x', '3.3.3.3');
    const at = cookieValue(res, 'swami_sb_at');
    const r = await auth.requireOwner(reqWith({ swami_sb_at: at }));
    expect('response' in r && r.response.status).toBe(403);
    expect('session' in (await auth.requireSession(reqWith({ swami_sb_at: at })))).toBe(true);
  });
});

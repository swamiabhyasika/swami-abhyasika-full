import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { NextRequest } from 'next/server';
import { startMockGoogle } from '../helpers/mock-google';

let db: Awaited<ReturnType<typeof import('@/lib/db').getDb>>;
let auth: typeof import('@/lib/auth');
let google: Awaited<ReturnType<typeof startMockGoogle>>;
const cookies: Record<string, string> = {};

const r = (path: string, init: RequestInit & { as?: 'owner' | 'staff' | null } = {}) => {
  const { as = 'owner', ...rest } = init;
  const headers = new Headers(rest.headers);
  if (as) headers.set('cookie', `swami_session=${cookies[as]}`);
  if (rest.body && !headers.has('content-type')) headers.set('content-type', 'application/json');
  return new NextRequest(`http://localhost${path}`, { ...rest, headers } as ConstructorParameters<typeof NextRequest>[1]);
};
const ctx = <T extends Record<string, string>>(params: T) => ({ params: Promise.resolve(params) });
const j = (v: unknown) => JSON.stringify(v);
const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

beforeAll(async () => {
  delete process.env.SUPABASE_URL;
  delete process.env.SUPABASE_ANON_KEY;
  google = await startMockGoogle();
  Object.assign(process.env, google.env, { CRON_SECRET: 'cron-secret-xyz', APP_URL: 'http://localhost' });
  db = await (await import('@/lib/db')).getDb();
  auth = await import('@/lib/auth');
  await db.query("insert into users (id, username, role, password_hash) values ('u-owner','owner','owner',null), ('u-staff','staff','staff',null)");
  cookies.owner = await auth.signSession({ id: 'u-owner', username: 'owner', role: 'owner' });
  cookies.staff = await auth.signSession({ id: 'u-staff', username: 'staff', role: 'staff' });
});
afterAll(async () => {
  await google.close();
});
beforeEach(async () => {
  for (const t of ['backup_runs', 'integrations', 'students', 'settings', 'versions', 'message_templates']) await db.query(`delete from ${t}`);
});

describe('who may do what', () => {
  it('shuts out people who are not signed in, on every protected address', async () => {
    const { GET: state } = await import('@/app/api/state/route');
    const { PUT: put } = await import('@/app/api/state/[key]/route');
    const { POST: upload } = await import('@/app/api/upload/image/route');
    const { POST: download } = await import('@/app/api/backup/download/route');
    const { POST: catchUp } = await import('@/app/api/backup/catch-up/route');
    const { GET: status } = await import('@/app/api/backup/status/route');
    const { GET: templates } = await import('@/app/api/templates/route');
    const { POST: pin } = await import('@/app/api/pin/verify/route');
    const codes = await Promise.all([
      state(r('/api/state', { as: null })), put(r('/api/state/x', { method: 'PUT', as: null, body: j({ value: 'x' }) }), ctx({ key: 'x' })),
      upload(r('/api/upload/image', { method: 'POST', as: null, body: j({ image: PNG }) })), download(r('/api/backup/download', { method: 'POST', as: null })),
      catchUp(r('/api/backup/catch-up', { method: 'POST', as: null })), status(r('/api/backup/status', { as: null })),
      templates(r('/api/templates', { as: null })), pin(r('/api/pin/verify', { method: 'POST', as: null, body: j({ pin: '1' }) })),
    ].map((p) => p.then((x) => x.status)));
    expect(codes).toEqual(Array(8).fill(401));
  });

  it('lets staff look but not change templates, backups or the Google connection', async () => {
    const { PUT, DELETE } = await import('@/app/api/templates/[key]/route');
    const { POST: download } = await import('@/app/api/backup/download/route');
    const { POST: drive } = await import('@/app/api/backup/drive/route');
    const { GET: connect } = await import('@/app/api/google/connect/route');
    const { POST: disconnect } = await import('@/app/api/google/disconnect/route');
    const { GET: templates } = await import('@/app/api/templates/route');
    expect((await templates(r('/api/templates', { as: 'staff' }))).status).toBe(200);
    const codes = [
      (await PUT(r('/api/templates/fee_receipt', { method: 'PUT', as: 'staff', body: j({ body: 'x {name}' }) }), ctx({ key: 'fee_receipt' }))).status,
      (await DELETE(r('/api/templates/fee_receipt', { method: 'DELETE', as: 'staff' }), ctx({ key: 'fee_receipt' }))).status,
      (await download(r('/api/backup/download', { method: 'POST', as: 'staff' }))).status,
      (await drive(r('/api/backup/drive', { method: 'POST', as: 'staff' }))).status,
      (await connect(r('/api/google/connect', { as: 'staff' }))).status,
      (await disconnect(r('/api/google/disconnect', { method: 'POST', as: 'staff' }))).status,
    ];
    expect(codes).toEqual(Array(6).fill(403));
  });
});

describe('saving data', () => {
  it('answers 409 with a clear message when the screen is out of date', async () => {
    const { PUT } = await import('@/app/api/state/[key]/route');
    const send = (list: unknown[], base: number) => PUT(r('/api/state/edu_students', { method: 'PUT', body: j({ value: j(list), base }) }), ctx({ key: 'edu_students' }));
    expect((await send([{ id: 'A', name: 'x' }], 0)).status).toBe(200);
    const stale = await send([], 0);
    expect(stale.status).toBe(409);
    expect(await stale.json()).toMatchObject({ stale: true });
  });
  it('answers 409 for a double-booked seat and 400 for rubbish', async () => {
    const { PUT } = await import('@/app/api/state/[key]/route');
    const b = (id: string) => ({ id, seat: 1, floor: 'basement', fromDate: '2026-10-01', dueDate: '2026-10-31', slotIds: ['S1'], status: 'active' });
    const send = (value: unknown) => PUT(r('/api/state/blib_bookings', { method: 'PUT', body: j({ value: j(value) }) }), ctx({ key: 'blib_bookings' }));
    expect((await send([b('1'), b('2')])).status).toBe(409);
    expect((await PUT(r('/api/state/edu_students', { method: 'PUT', body: j({ value: 5 }) }), ctx({ key: 'edu_students' }))).status).toBe(400);
  });
  it('checks the owner PIN on the server and locks after five wrong tries', async () => {
    const { PUT } = await import('@/app/api/state/[key]/route');
    const { POST } = await import('@/app/api/pin/verify/route');
    await PUT(r('/api/state/edu_owner_delete_pin', { method: 'PUT', body: j({ value: '4321' }) }), ctx({ key: 'edu_owner_delete_pin' }));
    const verify = (pin: string) => POST(r('/api/pin/verify', { method: 'POST', as: 'staff', body: j({ pin }) }));
    expect(await (await verify('4321')).json()).toEqual({ ok: true });
    expect(await (await verify('0000')).json()).toEqual({ ok: false });
    for (let i = 0; i < 4; i++) await verify('0000');
    expect((await verify('4321')).status).toBe(429);
  });
});

describe('photos', () => {
  it('stores a valid image and serves it back to signed-in people only', async () => {
    const { POST } = await import('@/app/api/upload/image/route');
    const { GET } = await import('@/app/api/uploads/[file]/route');
    const res = await POST(r('/api/upload/image', { method: 'POST', body: j({ image: PNG }) }));
    expect(res.status).toBe(200);
    const { url } = await res.json();
    expect(url).toMatch(/^\/api\/uploads\/[a-f0-9]{40}\.png$/);
    const file = url.split('/').pop()!;
    expect((await GET(r(url), ctx({ file }))).status).toBe(200);
    expect((await GET(r(url, { as: null }), ctx({ file }))).status).toBe(401);
    expect((await GET(r('/api/uploads/..%2f..%2fetc%2fpasswd'), ctx({ file: '../../etc/passwd' }))).status).toBe(404);
  });
  it('refuses anything that is not a JPG, PNG or WEBP picture', async () => {
    const { POST } = await import('@/app/api/upload/image/route');
    const bad = ['data:text/html;base64,PGgxPg==', 'hello', 'data:image/svg+xml;base64,PHN2Zz4='];
    for (const image of bad) expect((await POST(r('/api/upload/image', { method: 'POST', body: j({ image }) }))).status).toBe(400);
  });
});

describe('WhatsApp template editing', () => {
  it('saves, validates and resets', async () => {
    const { PUT, DELETE } = await import('@/app/api/templates/[key]/route');
    const { GET } = await import('@/app/api/templates/route');
    const put = (key: string, body: unknown) => PUT(r(`/api/templates/${key}`, { method: 'PUT', body: j({ body }) }), ctx({ key }));
    expect((await put('fee_receipt', 'Dear {name}, thanks!')).status).toBe(200);
    expect((await put('fee_receipt', '   ')).status).toBe(400);
    expect((await put('fee_receipt', 123)).status).toBe(400);
    expect((await put('nope', 'x')).status).toBe(404);
    const list = (await (await GET(r('/api/templates'))).json()).templates;
    expect(list.find((t: any) => t.key === 'fee_receipt')).toMatchObject({ body: 'Dear {name}, thanks!', isCustom: true });
    expect((await DELETE(r('/api/templates/fee_receipt', { method: 'DELETE' }), ctx({ key: 'fee_receipt' }))).status).toBe(200);
    expect((await (await GET(r('/api/templates'))).json()).templates.find((t: any) => t.key === 'fee_receipt').isCustom).toBe(false);
  });
});

describe('backup addresses', () => {
  it('downloads a complete backup file and records it', async () => {
    const { POST } = await import('@/app/api/backup/download/route');
    await db.query("insert into settings (key, value) values ('edu_inst_profile','{\"name\":\"S\"}')");
    const res = await POST(r('/api/backup/download', { method: 'POST' }));
    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Disposition')).toMatch(/attachment; filename="swami-backup-.*\.json"/);
    const file = JSON.parse(await res.text());
    expect(file.app).toBe('swami-abhyasika');
    expect(file.data.edu_inst_profile).toBe('{"name":"S"}');
    expect((await db.query("select 1 from backup_runs where destination = 'local' and trigger = 'manual' and status = 'success'")).length).toBe(1);
  });

  it('the daily job refuses callers without the secret, and works with it', async () => {
    const { GET } = await import('@/app/api/cron/backup/route');
    const call = (authorization?: string) => GET(new NextRequest('http://localhost/api/cron/backup', { headers: authorization ? { authorization } : {} }));
    expect((await call()).status).toBe(401);
    expect((await call('Bearer wrong')).status).toBe(401);
    expect((await call('Bearer cron-secret-xyz')).status).toBe(200);
    delete process.env.CRON_SECRET;
    expect((await call('Bearer cron-secret-xyz')).status).toBe(401); // never runs when no secret is configured
    process.env.CRON_SECRET = 'cron-secret-xyz';
  });
});

describe('connecting Google Drive from the browser', () => {
  it('sends the owner to Google with a signed, short-lived "state"', async () => {
    const { GET } = await import('@/app/api/google/connect/route');
    const res = await GET(r('/api/google/connect'));
    expect(res.status).toBe(307);
    const to = new URL(res.headers.get('location')!);
    expect(to.origin + to.pathname).toBe(`${google.base}/auth`);
    expect(to.searchParams.get('redirect_uri')).toBe('http://localhost/api/google/callback');
    expect(to.searchParams.get('state')!.split('.')).toHaveLength(3);
  });

  it('completes the connection when Google returns with a good code', async () => {
    const { GET: connect } = await import('@/app/api/google/connect/route');
    const { GET: callback } = await import('@/app/api/google/callback/route');
    const state = new URL((await connect(r('/api/google/connect'))).headers.get('location')!).searchParams.get('state')!;
    const res = await callback(r(`/api/google/callback?code=good-code&state=${state}`));
    expect(res.headers.get('location')).toContain('drive=connected');
    expect((await db.query("select 1 from integrations where name = 'google_drive'")).length).toBe(1);
  });

  it('refuses a forged state, someone else’s state, and a missing code', async () => {
    const { GET: connect } = await import('@/app/api/google/connect/route');
    const { GET: callback } = await import('@/app/api/google/callback/route');
    const state = new URL((await connect(r('/api/google/connect'))).headers.get('location')!).searchParams.get('state')!;
    const back = async (q: string, as: 'owner' | 'staff' = 'owner') => (await callback(r(`/api/google/callback?${q}`, { as }))).headers.get('location') || '';
    expect(await back('code=good-code&state=forged')).toContain('bad-state');
    // a state made for the owner, replayed by another signed-in person who is not the owner, is turned away before anything else
    expect(await back(`code=good-code&state=${state}`, 'staff')).toContain('/login');
    expect(await back(`state=${state}`)).toContain('drive=error');
    expect(await back('error=access_denied')).toContain('drive=denied');
    expect((await db.query("select 1 from integrations")).length).toBe(0);
  });
});

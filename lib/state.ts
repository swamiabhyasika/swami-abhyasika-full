import { createHash } from 'node:crypto';
import bcrypt from 'bcryptjs';
import { clean, cleanSetting } from './sanitize';
import { floorKey, findClash } from './seats';
import { loadTemplates } from './whatsapp';
import { getDb, type Tx } from './db';

/**
 * The legacy UI (public/app.js) keeps everything in localStorage under a handful of keys.
 * This module maps those keys onto real tables:
 *
 *   edu_students                       -> students + payments  (+ photos via edu_photo_<id>)
 *   blib_bookings                      -> bookings
 *   edu_fee_tiers / edu_delete_requests
 *   edu_cash_closings / edu_broadcast_history -> collections
 *   anything else (profile, settings, theme ...) -> settings
 *
 * Writes are diffed: only rows whose content changed are touched, so saving one payment
 * does not rewrite 1,000 students.
 */

export class ConflictError extends Error {}
export class BadValueError extends Error {}
export class StaleError extends Error {}

const PIN_KEY = 'edu_owner_delete_pin';
const PIN_RE = /^\d{4,12}$/;
/** Big lists that are saved as a whole and therefore need protection against stale overwrites. */
const GUARDED = ['edu_students', 'blib_bookings', 'edu_fee_tiers', 'edu_delete_requests', 'edu_cash_closings', 'edu_broadcast_history'];

async function bumpVersion(tx: Tx, key: string, base?: number): Promise<number> {
  await tx.query('insert into versions (key, v) values ($1, 0) on conflict (key) do nothing', [key]);
  const [row] = await tx.query<{ v: string }>('select v from versions where key = $1 for update', [key]);
  const current = Number(row.v);
  if (base !== undefined && base !== null && Number(base) !== current) {
    throw new StaleError('Another device or browser tab saved changes first, so your last change was not saved.');
  }
  await tx.query('update versions set v = v + 1 where key = $1', [key]);
  return current + 1;
}

export async function getVersions(): Promise<Record<string, number>> {
  const db = await getDb();
  const out: Record<string, number> = Object.fromEntries(GUARDED.map((k) => [k, 0]));
  for (const r of await db.query<{ key: string; v: string }>('select key, v from versions')) out[r.key] = Number(r.v);
  return out;
}

/** Checks a PIN typed by the owner. Old plain-text PINs are accepted once and upgraded to a hash. */
export async function verifyOwnerPin(pin: string): Promise<boolean> {
  const db = await getDb();
  const [row] = await db.query<{ value: string }>('select value from settings where key = $1', [PIN_KEY]);
  if (!row || typeof pin !== 'string') return false;
  if (row.value.startsWith('$2')) return bcrypt.compareSync(pin, row.value);
  if (row.value !== pin) return false;
  await db.query('update settings set value = $2 where key = $1', [PIN_KEY, bcrypt.hashSync(pin, 10)]);
  return true;
}

const COLLECTIONS: Record<string, string> = {
  edu_fee_tiers: 'fee_tiers',
  edu_delete_requests: 'delete_requests',
  edu_cash_closings: 'cash_closings',
  edu_broadcast_history: 'broadcast_history',
};
const COLLECTION_KEYS = Object.fromEntries(Object.entries(COLLECTIONS).map(([k, v]) => [v, k]));
const PHOTO_PREFIX = 'edu_photo_';
const KEY_RE = /^[A-Za-z0-9_.:\-]{1,200}$/;
const CHUNK = 200;

const sha = (s: string) => createHash('sha1').update(s).digest('hex');
const str = (v: unknown) => (v === null || v === undefined || v === '' ? null : String(v));
const num = (v: unknown) => {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};
const chunks = <T,>(a: T[], n = CHUNK) => Array.from({ length: Math.ceil(a.length / n) }, (_, i) => a.slice(i * n, i * n + n));

function parseArray(value: string): any[] {
  let v: unknown;
  try {
    v = JSON.parse(value);
  } catch {
    throw new BadValueError('Value is not valid JSON');
  }
  if (!Array.isArray(v)) throw new BadValueError('Expected a JSON array');
  return v;
}

// ───────────────────────────── read ─────────────────────────────

export async function getState(): Promise<Record<string, string>> {
  const db = await getDb();
  const out: Record<string, string> = {};

  const students = await db.query<{ id: string; data: any }>('select id, data from students order by position, id');
  if (students.length) {
    const pays = await db.query<{ student_id: string; data: any }>('select student_id, data from payments order by student_id, position, id');
    const byStudent = new Map<string, any[]>();
    for (const p of pays) {
      if (!byStudent.has(p.student_id)) byStudent.set(p.student_id, []);
      byStudent.get(p.student_id)!.push(p.data);
    }
    out.edu_students = JSON.stringify(students.map((s) => ({ ...s.data, payments: byStudent.get(s.id) ?? [] })));
  }

  for (const p of await db.query<{ student_id: string; url: string }>('select student_id, url from photos')) {
    out[PHOTO_PREFIX + p.student_id] = p.url;
  }

  const bookings = await db.query<{ data: any }>('select data from bookings order by position, id');
  if (bookings.length) out.blib_bookings = JSON.stringify(bookings.map((b) => b.data));

  const grouped = new Map<string, any[]>();
  for (const r of await db.query<{ name: string; data: any }>('select name, data from collections order by name, idx')) {
    if (!grouped.has(r.name)) grouped.set(r.name, []);
    grouped.get(r.name)!.push(r.data);
  }
  for (const [name, list] of grouped) if (COLLECTION_KEYS[name]) out[COLLECTION_KEYS[name]] = JSON.stringify(list);

  out['edutrack-wa-templates'] = JSON.stringify(await loadTemplates());
  for (const r of await db.query<{ key: string; value: string }>('select key, value from settings')) out[r.key] = r.key === PIN_KEY ? 'set' : r.value;
  return out;
}

// ───────────────────────────── write ─────────────────────────────

export async function putKey(key: string, value: string, base?: number, opts: { skipSeatCheck?: boolean } = {}): Promise<number | undefined> {
  if (!KEY_RE.test(key)) throw new BadValueError('Invalid key');
  if (typeof value !== 'string') throw new BadValueError('value must be a string');
  const db = await getDb();

  if (key === 'edutrack-wa-templates') return; // managed in Settings → WhatsApp Message Templates; the old screens never write it

  if (key === PIN_KEY) {
    if (value === 'set') return; // the placeholder the browser holds; never overwrite the real PIN with it
    if (!PIN_RE.test(value)) throw new BadValueError('PIN must contain 4 to 12 digits');
    await db.query(
      `insert into settings (key, value, updated_at) values ($1,$2, now())
       on conflict (key) do update set value = excluded.value, updated_at = now()`,
      [key, bcrypt.hashSync(value, 10)],
    );
    return;
  }

  if (key === 'edu_students' || key === 'blib_bookings') {
    const list = parseArray(value);
    return db.transaction(async (tx) => {
      const v = await bumpVersion(tx, key, base);
      if (key === 'edu_students') await syncStudents(tx, list);
      else await syncBookings(tx, list, opts.skipSeatCheck);
      return v;
    });
  }

  if (key.startsWith(PHOTO_PREFIX)) {
    const id = key.slice(PHOTO_PREFIX.length);
    if (!id) throw new BadValueError('Invalid photo key');
    if (!value) await db.query('delete from photos where student_id = $1', [id]);
    else await db.query('insert into photos (student_id, url) values ($1,$2) on conflict (student_id) do update set url = excluded.url', [id, value]);
    return;
  }

  const coll = COLLECTIONS[key];
  if (coll) {
    let arr: unknown;
    try {
      arr = JSON.parse(value);
    } catch {
      /* falls through to settings */
    }
    if (Array.isArray(arr)) {
      const list = clean(arr as any[]);
      return db.transaction(async (tx) => {
        const v = await bumpVersion(tx, key, base);
        await tx.query('delete from collections where name = $1', [coll]);
        for (let off = 0; off < list.length; off += CHUNK) {
          await tx.query(
            `insert into collections (name, idx, data)
             select $1, (x.ord - 1)::int + $3::int, x.d from jsonb_array_elements($2::jsonb) with ordinality as x(d, ord)`,
            [coll, JSON.stringify(list.slice(off, off + CHUNK)), off],
          );
        }
        await tx.query('delete from settings where key = $1', [key]);
        return v;
      });
    }
    await db.query('delete from collections where name = $1', [coll]);
  }

  await db.query(
    `insert into settings (key, value, updated_at) values ($1,$2, now())
     on conflict (key) do update set value = excluded.value, updated_at = now()`,
    [key, cleanSetting(value)],
  );
}

export async function deleteKey(key: string): Promise<void> {
  if (!KEY_RE.test(key)) throw new BadValueError('Invalid key');
  const db = await getDb();
  if (key === 'edu_students') {
    await db.transaction(async (tx) => {
      await bumpVersion(tx, key);
      await tx.query('delete from students');
      await tx.query('delete from photos');
    });
  } else if (key === 'blib_bookings') {
    await db.transaction(async (tx) => {
      await bumpVersion(tx, key);
      await tx.query('delete from bookings');
    });
  }
  else if (key.startsWith(PHOTO_PREFIX)) await db.query('delete from photos where student_id = $1', [key.slice(PHOTO_PREFIX.length)]);
  else {
    if (COLLECTIONS[key]) await db.query('delete from collections where name = $1', [COLLECTIONS[key]]);
    await db.query('delete from settings where key = $1', [key]);
  }
}

// ───────────────────────────── students ─────────────────────────────

async function syncStudents(tx: Tx, arr: any[]) {
  const seen = new Set<string>();
  const items: { id: string; data: any; payments: any[]; hash: string; position: number }[] = [];
  for (const raw of arr) {
    if (!raw || typeof raw !== 'object' || raw.id === undefined || raw.id === null) continue;
    const id = String(raw.id);
    if (seen.has(id)) continue;
    seen.add(id);
    const { photo: _photo, payments, ...rest } = clean(raw);
    const pays = Array.isArray(payments) ? payments.filter((p: unknown) => p && typeof p === 'object') : [];
    items.push({ id, data: { ...rest, id: raw.id }, payments: pays, hash: sha(JSON.stringify({ ...rest, payments: pays })), position: items.length });
  }

  const existing = await tx.query<{ id: string; hash: string; position: number }>('select id, hash, position from students');
  const ex = new Map(existing.map((r) => [r.id, r]));

  const gone = existing.filter((r) => !seen.has(r.id)).map((r) => r.id);
  if (gone.length) {
    await tx.query('delete from students where id = any($1::text[])', [gone]); // payments cascade
    await tx.query('delete from photos where student_id = any($1::text[])', [gone]);
  }

  const changed = items.filter((it) => ex.get(it.id)?.hash !== it.hash);
  for (const part of chunks(changed)) {
    const rows = part.map((it) => ({
      id: it.id,
      position: it.position,
      name: str(it.data.name),
      phone: str(it.data.phone),
      course: str(it.data.course),
      gender: str(it.data.gender),
      shift: str(it.data.shift),
      admission_date: str(it.data.admissionDate),
      due_date: str(it.data.dueDate),
      total_fees: num(it.data.totalFees),
      paid_fees: num(it.data.paidFees),
      hash: it.hash,
      data: it.data,
    }));
    await tx.query(
      `insert into students (id, position, name, phone, course, gender, shift, admission_date, due_date, total_fees, paid_fees, hash, data, updated_at)
       select id, position, name, phone, course, gender, shift, admission_date, due_date, total_fees, paid_fees, hash, data, now()
       from jsonb_to_recordset($1::jsonb) as x(id text, position int, name text, phone text, course text, gender text, shift text,
            admission_date text, due_date text, total_fees numeric, paid_fees numeric, hash text, data jsonb)
       on conflict (id) do update set position = excluded.position, name = excluded.name, phone = excluded.phone,
            course = excluded.course, gender = excluded.gender, shift = excluded.shift, admission_date = excluded.admission_date,
            due_date = excluded.due_date, total_fees = excluded.total_fees, paid_fees = excluded.paid_fees,
            hash = excluded.hash, data = excluded.data, updated_at = now()`,
      [JSON.stringify(rows)],
    );
  }

  if (changed.length) {
    await tx.query('delete from payments where student_id = any($1::text[])', [changed.map((c) => c.id)]);
    const payRows = changed.flatMap((it) =>
      it.payments.map((p, i) => ({ student_id: it.id, position: i, amount: num(p.amount), paid_on: str(p.date), method: str(p.method), notes: str(p.notes), data: p })),
    );
    for (const part of chunks(payRows, 500)) {
      await tx.query(
        `insert into payments (student_id, position, amount, paid_on, method, notes, data)
         select student_id, position, amount, paid_on, method, notes, data
         from jsonb_to_recordset($1::jsonb) as x(student_id text, position int, amount numeric, paid_on text, method text, notes text, data jsonb)`,
        [JSON.stringify(part)],
      );
    }
  }

  await reposition(tx, 'students', items.filter((it) => { const e = ex.get(it.id); return e && e.hash === it.hash && e.position !== it.position; }));
}

async function reposition(tx: Tx, table: 'students' | 'bookings', moved: { id: string; position: number }[]) {
  for (const part of chunks(moved, 1000)) {
    await tx.query(
      `update ${table} t set position = v.pos from (select unnest($1::text[]) as id, unnest($2::int[]) as pos) v where t.id = v.id`,
      [part.map((m) => m.id), part.map((m) => m.position)],
    );
  }
}

// ───────────────────────────── bookings ─────────────────────────────

async function syncBookings(tx: Tx, arr: any[], skipSeatCheck = false) {
  const seen = new Set<string>();
  const items: { id: string; data: any; hash: string; position: number }[] = [];
  for (const raw of arr) {
    if (!raw || typeof raw !== 'object' || raw.id === undefined || raw.id === null) continue;
    const id = String(raw.id);
    if (seen.has(id)) continue;
    seen.add(id);
    const c = clean(raw);
    items.push({ id, data: c, hash: sha(JSON.stringify(c)), position: items.length });
  }

  const existing = await tx.query<{ id: string; hash: string; position: number }>('select id, hash, position from bookings');
  const ex = new Map(existing.map((r) => [r.id, r]));
  const changed = items.filter((it) => ex.get(it.id)?.hash !== it.hash);

  // Seat double-booking guard. Only rows being added/changed are checked, so old data that already
  // overlaps can never lock the app; a second device booking the same seat gets a clear error instead.
  const active = items.filter((it) => it.data.status === 'active');
  for (const c of skipSeatCheck ? [] : changed) {
    if (c.data.status !== 'active') continue;
    const other = findClash(c.data, active.map((o) => o.data));
    if (other) throw new ConflictError(`Seat #${c.data.seat} is already booked for that period and time slot.`);
  }

  const gone = existing.filter((r) => !seen.has(r.id)).map((r) => r.id);
  if (gone.length) await tx.query('delete from bookings where id = any($1::text[])', [gone]);

  for (const part of chunks(changed)) {
    const rows = part.map((it) => ({
      id: it.id,
      position: it.position,
      student_id: str(it.data.studentId),
      seat: str(it.data.seat),
      floor: floorKey(it.data),
      from_date: str(it.data.fromDate || it.data.date),
      due_date: str(it.data.dueDate || it.data.date),
      status: str(it.data.status),
      hash: it.hash,
      data: it.data,
    }));
    await tx.query(
      `insert into bookings (id, position, student_id, seat, floor, from_date, due_date, status, hash, data, updated_at)
       select id, position, student_id, seat, floor, from_date, due_date, status, hash, data, now()
       from jsonb_to_recordset($1::jsonb) as x(id text, position int, student_id text, seat text, floor text, from_date text,
            due_date text, status text, hash text, data jsonb)
       on conflict (id) do update set position = excluded.position, student_id = excluded.student_id, seat = excluded.seat,
            floor = excluded.floor, from_date = excluded.from_date, due_date = excluded.due_date, status = excluded.status,
            hash = excluded.hash, data = excluded.data, updated_at = now()`,
      [JSON.stringify(rows)],
    );
  }

  await reposition(tx, 'bookings', items.filter((it) => { const e = ex.get(it.id); return e && e.hash === it.hash && e.position !== it.position; }));
}

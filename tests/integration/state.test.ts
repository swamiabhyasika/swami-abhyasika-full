import { beforeEach, describe, expect, it } from 'vitest';
import { getDb } from '@/lib/db';
import { ConflictError, StaleError, deleteKey, getState, getVersions, putKey, verifyOwnerPin } from '@/lib/state';
import { saveTemplate, listTemplates, resetTemplate, getTemplateDef } from '@/lib/whatsapp';

const student = (id: string, name: string, payments: object[] = []) => ({ id, name, phone: '9876543210', totalFees: 600, paidFees: 600, payments });
const booking = (id: string, o: object = {}) => ({ id, seat: 5, floor: 'basement', fromDate: '2026-10-01', dueDate: '2026-10-31', slotIds: ['S1'], status: 'active', ...o });
const json = (v: unknown) => JSON.stringify(v);
const read = async (key: string) => JSON.parse((await getState())[key] ?? 'null');

beforeEach(async () => {
  const db = await getDb();
  for (const t of ['payments', 'photos', 'students', 'bookings', 'collections', 'settings', 'versions', 'message_templates']) await db.query(`delete from ${t}`);
});

describe('students and payments', () => {
  it('saves and returns students with their payments, in order', async () => {
    const list = [student('S1', 'Asha', [{ id: 'P1', amount: 100, date: '2026-10-01' }, { id: 'P2', amount: 200, date: '2026-10-05' }]), student('S2', 'Ravi')];
    await putKey('edu_students', json(list));
    const back = await read('edu_students');
    expect(back.map((s: any) => s.id)).toEqual(['S1', 'S2']);
    expect(back[0].payments.map((p: any) => p.id)).toEqual(['P1', 'P2']);
    expect(back[0].name).toBe('Asha');
  });

  it('keeps a number as a number (ids are not turned into text)', async () => {
    await putKey('edu_students', json([{ id: 7, name: 'N', payments: [] }]));
    expect((await read('edu_students'))[0].id).toBe(7);
  });

  it('only rewrites students whose data changed', async () => {
    const db = await getDb();
    await putKey('edu_students', json([student('S1', 'Asha'), student('S2', 'Ravi')]));
    const before = Object.fromEntries((await db.query<{ id: string; updated_at: string }>('select id, updated_at from students')).map((r) => [r.id, +new Date(r.updated_at)]));
    await new Promise((r) => setTimeout(r, 20));
    await putKey('edu_students', json([student('S1', 'Asha'), student('S2', 'Ravi Kumar')]));
    const after = Object.fromEntries((await db.query<{ id: string; updated_at: string }>('select id, updated_at from students')).map((r) => [r.id, +new Date(r.updated_at)]));
    expect(after.S1).toBe(before.S1);
    expect(after.S2).toBeGreaterThan(before.S2);
  });

  it('removes a student together with their payments and photo', async () => {
    const db = await getDb();
    await putKey('edu_students', json([student('S1', 'Asha', [{ id: 'P1', amount: 1 }]), student('S2', 'Ravi')]));
    await putKey('edu_photo_S1', '/api/uploads/x.jpg');
    await putKey('edu_students', json([student('S2', 'Ravi')]));
    expect((await db.query('select 1 from payments')).length).toBe(0);
    expect((await getState())['edu_photo_S1']).toBeUndefined();
  });

  it('keeps the order of students after one in the middle is removed', async () => {
    await putKey('edu_students', json([student('A', 'a'), student('B', 'b'), student('C', 'c')]));
    await putKey('edu_students', json([student('A', 'a'), student('C', 'c')]));
    expect((await read('edu_students')).map((s: any) => s.id)).toEqual(['A', 'C']);
  });

  it('can store 1,000 students with payments', async () => {
    const many = Array.from({ length: 1000 }, (_, i) => student('S' + i, 'Student ' + i, [{ id: 'p' + i, amount: 1 }, { id: 'q' + i, amount: 2 }]));
    await putKey('edu_students', json(many));
    const back = await read('edu_students');
    expect(back).toHaveLength(1000);
    expect(back[999].payments).toHaveLength(2);
  });

  it('rejects data that is not a list', async () => {
    await expect(putKey('edu_students', json({ a: 1 }))).rejects.toThrow(/array/i);
    await expect(putKey('edu_students', 'not json')).rejects.toThrow(/JSON/i);
  });

  it('rejects unsafe keys', async () => {
    await expect(putKey('../etc', 'x')).rejects.toThrow(/Invalid key/);
  });
});

describe('text safety', () => {
  it('neutralises HTML and quotes, and accepts a NUL character', async () => {
    await putKey('edu_students', json([{ id: 'S1', name: '<img src=x onerror=alert(1)>', note: 'say "hi"\u0000', payments: [] }]));
    const [s] = await read('edu_students');
    expect(s.name).toBe('‹img src=x onerror=alert(1)›');
    expect(s.note).toBe('say ”hi”');
  });
});

describe('protection against out-of-date screens', () => {
  it('refuses a save made from an old copy and keeps what the other device added', async () => {
    await putKey('edu_students', json([student('A', 'Old')]));
    const v = (await getVersions()).edu_students;
    await putKey('edu_students', json([student('A', 'Old'), student('B', 'Added on phone')]), v); // device 2
    await expect(putKey('edu_students', json([student('A', 'Edited on PC')]), v)).rejects.toBeInstanceOf(StaleError); // device 1, stale
    expect((await read('edu_students')).map((s: any) => s.id)).toEqual(['A', 'B']);
  });
  it('accepts a save made from the current version, then moves the version on', async () => {
    const v0 = (await getVersions()).edu_students;
    await putKey('edu_students', json([student('A', 'x')]), v0);
    expect((await getVersions()).edu_students).toBe(v0 + 1);
    await putKey('edu_students', json([student('A', 'y')]), v0 + 1);
  });
  it('protects seat bookings and the small lists as well', async () => {
    await putKey('blib_bookings', json([booking('1')]), 0);
    await expect(putKey('blib_bookings', json([]), 0)).rejects.toBeInstanceOf(StaleError);
    await putKey('edu_cash_closings', json([{ date: 'a' }]), 0);
    await expect(putKey('edu_cash_closings', json([]), 0)).rejects.toBeInstanceOf(StaleError);
  });
});

describe('seat bookings', () => {
  it('refuses a second booking of the same seat, slot and dates', async () => {
    await putKey('blib_bookings', json([booking('1')]));
    await expect(putKey('blib_bookings', json([booking('1'), booking('2', { fromDate: '2026-10-10' })]))).rejects.toBeInstanceOf(ConflictError);
    expect(await read('blib_bookings')).toHaveLength(1);
  });
  it('allows a different slot, a different floor, or an expired overlap', async () => {
    await putKey('blib_bookings', json([booking('1'), booking('2', { slotIds: ['S2'] }), booking('3', { floor: 'floor2' }), booking('4', { status: 'expired' })]));
    expect(await read('blib_bookings')).toHaveLength(4);
  });
  it('Full Day conflicts with a morning booking', async () => {
    await putKey('blib_bookings', json([booking('1')]));
    await expect(putKey('blib_bookings', json([booking('1'), booking('2', { slotIds: ['S5'] })]))).rejects.toBeInstanceOf(ConflictError);
  });
  it('an import can bring in old data that already overlaps, and the app never gets stuck on it', async () => {
    const a = booking('1'), b = booking('2');
    await expect(putKey('blib_bookings', json([a, b]))).rejects.toBeInstanceOf(ConflictError); // a normal save refuses it
    await putKey('blib_bookings', json([a, b]), undefined, { skipSeatCheck: true }); // an import keeps it as it is
    expect(await read('blib_bookings')).toHaveLength(2);
    await putKey('blib_bookings', json([a, b])); // saving the same two again is fine (they did not change)
    await expect(putKey('blib_bookings', json([a, b, booking('3')]))).rejects.toBeInstanceOf(ConflictError); // a NEW overlap is still refused
  });
  it('lets a booking be cancelled/removed', async () => {
    await putKey('blib_bookings', json([booking('1'), booking('2', { seat: 9 })]));
    await putKey('blib_bookings', json([booking('2', { seat: 9 })]));
    expect((await read('blib_bookings')).map((b: any) => b.id)).toEqual(['2']);
  });
});

describe('lists and settings', () => {
  it('keeps the order of list items', async () => {
    await putKey('edu_cash_closings', json([{ date: 'c' }, { date: 'a' }, { date: 'b' }]));
    expect((await read('edu_cash_closings')).map((x: any) => x.date)).toEqual(['c', 'a', 'b']);
  });
  it('stores other settings as text and can delete them', async () => {
    await putKey('edu_inst_profile', json({ name: 'Swami' }));
    expect(await read('edu_inst_profile')).toEqual({ name: 'Swami' });
    await deleteKey('edu_inst_profile');
    expect((await getState()).edu_inst_profile).toBeUndefined();
  });
});

describe('owner PIN', () => {
  it('is stored as a hash and never returned', async () => {
    const db = await getDb();
    await putKey('edu_owner_delete_pin', '4321');
    const [row] = await db.query<{ value: string }>("select value from settings where key = 'edu_owner_delete_pin'");
    expect(row.value).not.toContain('4321');
    expect((await getState()).edu_owner_delete_pin).toBe('set');
  });
  it('checks the PIN on the server', async () => {
    await putKey('edu_owner_delete_pin', '4321');
    expect(await verifyOwnerPin('4321')).toBe(true);
    expect(await verifyOwnerPin('0000')).toBe(false);
  });
  it('ignores the "set" placeholder the browser holds, and rejects bad PINs', async () => {
    await putKey('edu_owner_delete_pin', '4321');
    await putKey('edu_owner_delete_pin', 'set');
    expect(await verifyOwnerPin('4321')).toBe(true);
    await expect(putKey('edu_owner_delete_pin', 'abc')).rejects.toThrow(/PIN/);
  });
  it('upgrades an old plain-text PIN to a hash on first use', async () => {
    const db = await getDb();
    await db.query("insert into settings (key, value) values ('edu_owner_delete_pin', '9876')");
    expect(await verifyOwnerPin('1111')).toBe(false);
    expect(await verifyOwnerPin('9876')).toBe(true);
    const [row] = await db.query<{ value: string }>("select value from settings where key = 'edu_owner_delete_pin'");
    expect(row.value.startsWith('$2')).toBe(true);
    expect(await verifyOwnerPin('9876')).toBe(true);
  });
  it('is not part of backups', async () => {
    await putKey('edu_owner_delete_pin', '4321');
    const { buildSnapshot } = await import('@/lib/backup/snapshot');
    expect((await buildSnapshot('manual')).file.data.edu_owner_delete_pin).toBeUndefined();
  });
});

describe('WhatsApp templates', () => {
  it('serves all four templates to the original screens, defaults first', async () => {
    const t = await read('edutrack-wa-templates');
    expect(Object.keys(t).sort()).toEqual(['admission_confirmed', 'fee_receipt', 'fee_reminder', 'seat_confirmed']);
    expect(t.fee_receipt).toBe(getTemplateDef('fee_receipt')!.defaultBody);
  });
  it('uses the owner’s wording once saved, and the default again after a reset', async () => {
    expect((await saveTemplate('fee_reminder', 'Hello {name}, please pay.', 'owner')).errors).toEqual([]);
    expect((await read('edutrack-wa-templates')).fee_reminder).toBe('Hello {name}, please pay.');
    expect((await listTemplates()).find((t) => t.key === 'fee_reminder')!.isCustom).toBe(true);
    await resetTemplate('fee_reminder');
    expect((await read('edutrack-wa-templates')).fee_reminder).toBe(getTemplateDef('fee_reminder')!.defaultBody);
  });
  it('refuses empty wording and does not store it', async () => {
    expect((await saveTemplate('fee_receipt', '   ', 'owner')).errors).toHaveLength(1);
    expect((await listTemplates()).find((t) => t.key === 'fee_receipt')!.isCustom).toBe(false);
  });
  it('does not keep a copy when the text is identical to the default', async () => {
    await saveTemplate('fee_receipt', getTemplateDef('fee_receipt')!.defaultBody + '\n\n', 'owner');
    expect((await listTemplates()).find((t) => t.key === 'fee_receipt')!.isCustom).toBe(false);
  });
  it('ignores writes to the key from the old screens', async () => {
    await putKey('edutrack-wa-templates', json({ fee_receipt: 'hacked' }));
    expect((await read('edutrack-wa-templates')).fee_receipt).not.toBe('hacked');
  });
});

import { createHash } from 'node:crypto';
import { getState } from '../state';

/** What a backup file looks like. `data` is the same { key: value } shape the app and `npm run import:legacy` use. */
export interface BackupFile {
  app: 'swami-abhyasika';
  formatVersion: 2;
  createdAt: string;
  trigger: string;
  counts: Counts;
  data: Record<string, string>;
}
export interface Counts {
  students: number;
  payments: number;
  bookings: number;
  photos: number;
  settings: number;
}
/** A fingerprint of every record, so two backups can be compared without storing the data twice. */
export interface Manifest {
  students: Record<string, string>;
  bookings: Record<string, string>;
  other: Record<string, string>;
}

// The owner PIN is stored as a one-way hash and is deliberately NOT part of any backup.
const EXCLUDED = new Set(['edu_owner_delete_pin']);
const fp = (v: unknown) => createHash('sha1').update(typeof v === 'string' ? v : JSON.stringify(v)).digest('hex').slice(0, 10);

function parseList(raw: string | undefined): any[] {
  try {
    const v = JSON.parse(raw || '[]');
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

export function summarise(data: Record<string, string>): { counts: Counts; manifest: Manifest } {
  const students = parseList(data.edu_students);
  const bookings = parseList(data.blib_bookings);
  const manifest: Manifest = { students: {}, bookings: {}, other: {} };
  let payments = 0;
  for (const s of students) {
    manifest.students[String(s.id)] = fp(s);
    payments += Array.isArray(s.payments) ? s.payments.length : 0;
  }
  for (const b of bookings) manifest.bookings[String(b.id)] = fp(b);
  let photos = 0;
  for (const [k, v] of Object.entries(data)) {
    if (k === 'edu_students' || k === 'blib_bookings') continue;
    if (k.startsWith('edu_photo_')) photos++;
    manifest.other[k] = fp(v);
  }
  return {
    counts: { students: students.length, payments, bookings: bookings.length, photos, settings: Object.keys(manifest.other).length - photos },
    manifest,
  };
}

export async function buildSnapshot(trigger: string, now = new Date()): Promise<{ file: BackupFile; manifest: Manifest; counts: Counts }> {
  const data = await getState();
  for (const k of EXCLUDED) delete data[k];
  const { counts, manifest } = summarise(data);
  return { file: { app: 'swami-abhyasika', formatVersion: 2, createdAt: now.toISOString(), trigger, counts, data }, manifest, counts };
}

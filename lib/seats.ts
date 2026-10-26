/** Seat-booking rules, kept free of database code so they are easy to test. */

export interface Booking {
  id: string | number;
  seat?: string | number;
  floor?: string;
  library?: string;
  fromDate?: string;
  dueDate?: string;
  date?: string;
  slotIds?: string[];
  slotId?: string;
  status?: string;
  studentId?: string;
  [key: string]: unknown;
}

/** 'basement' | 'floor2' — the same seat number on different floors is a different seat. */
export function floorKey(b: Booking): string {
  const f = String(b.floor || b.library || '').toLowerCase();
  if (!f || f.includes('base')) return 'basement';
  if (f.includes('2')) return 'floor2';
  return f;
}

export const slotsOf = (b: Booking): string[] => (Array.isArray(b.slotIds) ? b.slotIds : [b.slotId]).filter(Boolean).map(String);

/** S5 is the "Full Day" slot: it covers every other slot. */
export const FULL_DAY = 'S5';

/**
 * Two bookings clash when both are active, on the same seat of the same floor,
 * their time slots overlap, and their date ranges overlap (a booking that ends the day
 * before another starts does not clash).
 */
export function clashes(a: Booking, b: Booking): boolean {
  if (a.status !== 'active' || b.status !== 'active') return false;
  if (String(a.seat) !== String(b.seat) || floorKey(a) !== floorKey(b)) return false;
  const sa = slotsOf(a);
  const sb = slotsOf(b);
  const slotOverlap = sa.includes(FULL_DAY) || sb.includes(FULL_DAY) || sa.some((s) => sb.includes(s));
  if (!slotOverlap) return false;
  const aFrom = a.fromDate || a.date || '';
  const aTo = a.dueDate || a.date || '';
  const bFrom = b.fromDate || b.date || '';
  const bTo = b.dueDate || b.date || '';
  return !(aTo < bFrom || aFrom > bTo);
}

/** Returns the first existing booking that `candidate` clashes with, if any. */
export function findClash<T extends Booking>(candidate: T, all: T[]): T | undefined {
  return all.find((o) => o.id !== candidate.id && clashes(candidate, o));
}

import { describe, expect, it } from 'vitest';
import { clashes, findClash, floorKey, type Booking } from '@/lib/seats';

const base: Booking = { id: '1', seat: 5, floor: 'basement', fromDate: '2026-10-01', dueDate: '2026-10-31', slotIds: ['S1'], status: 'active' };
const other = (o: Partial<Booking>): Booking => ({ ...base, id: '2', ...o });

describe('floorKey', () => {
  it('treats a missing floor as the basement', () => expect(floorKey({ id: 1 })).toBe('basement'));
  it('recognises the second floor in different spellings', () => {
    expect(floorKey({ id: 1, floor: 'floor2' })).toBe('floor2');
    expect(floorKey({ id: 1, library: '2nd Floor' })).toBe('floor2');
  });
});

describe('clashes', () => {
  it('detects the same seat, slot and overlapping dates', () => expect(clashes(base, other({ fromDate: '2026-10-15', dueDate: '2026-11-15' }))).toBe(true));
  it('allows a different slot on the same seat', () => expect(clashes(base, other({ slotIds: ['S2'] }))).toBe(false));
  it('treats Full Day (S5) as covering every slot', () => {
    expect(clashes(base, other({ slotIds: ['S5'] }))).toBe(true);
    expect(clashes(other({ slotIds: ['S5'] }), base)).toBe(true);
  });
  it('detects a clash when only one of several slots overlaps', () => expect(clashes(base, other({ slotIds: ['S3', 'S1'] }))).toBe(true));
  it('allows the same seat number on a different floor', () => expect(clashes(base, other({ floor: 'floor2' }))).toBe(false));
  it('allows a different seat', () => expect(clashes(base, other({ seat: 6 }))).toBe(false));
  it('ignores expired and cancelled bookings', () => {
    expect(clashes(base, other({ status: 'expired' }))).toBe(false);
    expect(clashes(other({ status: 'cancelled' }), base)).toBe(false);
  });
  it('allows back-to-back bookings (one ends the day before the next starts)', () => expect(clashes(base, other({ fromDate: '2026-11-01', dueDate: '2026-11-30' }))).toBe(false));
  it('treats the last day as taken', () => expect(clashes(base, other({ fromDate: '2026-10-31', dueDate: '2026-11-30' }))).toBe(true));
  it('compares seat numbers whether they are stored as text or numbers', () => expect(clashes(base, other({ seat: '5' }))).toBe(true));
});

describe('findClash', () => {
  it('returns the booking it clashes with, but never itself', () => {
    const rival = other({});
    expect(findClash(base, [base, rival])).toBe(rival);
    expect(findClash(base, [base])).toBeUndefined();
  });
});

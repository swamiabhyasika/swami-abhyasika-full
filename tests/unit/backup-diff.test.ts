import { describe, expect, it } from 'vitest';
import { describeChanges, diffManifests } from '@/lib/backup/diff';
import { summarise } from '@/lib/backup/snapshot';

const m = (students: Record<string, string> = {}, bookings: Record<string, string> = {}, other: Record<string, string> = {}) => ({ students, bookings, other });

describe('diffManifests', () => {
  it('treats everything as new when there is no earlier backup', () => {
    const d = diffManifests(null, m({ a: '1', b: '2' }, { x: '1' }));
    expect(d.first).toBe(true);
    expect(d.students.added).toBe(2);
    expect(d.total).toBe(3);
  });
  it('counts added, removed and changed records', () => {
    const d = diffManifests(m({ a: '1', b: '2', c: '3' }), m({ a: '1', b: 'CHANGED', d: '4' }));
    expect(d.students).toEqual({ added: 1, removed: 1, changed: 1 });
    expect(d.total).toBe(3);
  });
  it('reports zero when nothing changed', () => {
    const d = diffManifests(m({ a: '1' }, { x: '1' }, { k: '1' }), m({ a: '1' }, { x: '1' }, { k: '1' }));
    expect(d.total).toBe(0);
    expect(describeChanges(d)).toBe('No changes');
  });
});

describe('describeChanges', () => {
  it('writes a sentence a person can read', () => {
    const d = diffManifests(m({ a: '1' }, { x: '1' }), m({ a: '2', b: '1' }, {}));
    expect(describeChanges(d)).toBe('1 student added, 1 student changed, 1 seat booking removed');
  });
  it('handles missing data', () => expect(describeChanges(null)).toBe('—'));
});

describe('summarise', () => {
  const data = {
    edu_students: JSON.stringify([{ id: 'S1', name: 'A', payments: [{ amount: 1 }, { amount: 2 }] }, { id: 'S2', name: 'B', payments: [] }]),
    blib_bookings: JSON.stringify([{ id: 'B1', seat: 1 }]),
    'edu_photo_S1': '/p.jpg',
    'edu_inst_profile': '{"name":"x"}',
  };
  it('counts students, payments, bookings, photos and settings', () => {
    expect(summarise(data).counts).toEqual({ students: 2, payments: 2, bookings: 1, photos: 1, settings: 1 });
  });
  it('notices a new payment on an existing student as a change', () => {
    const before = summarise(data).manifest;
    const edited = { ...data, edu_students: JSON.stringify([{ id: 'S1', name: 'A', payments: [{ amount: 1 }, { amount: 2 }, { amount: 3 }] }, { id: 'S2', name: 'B', payments: [] }]) };
    const d = diffManifests(before, summarise(edited).manifest);
    expect(d.students).toEqual({ added: 0, removed: 0, changed: 1 });
  });
  it('survives broken data', () => expect(summarise({ edu_students: 'not json' }).counts.students).toBe(0));
});

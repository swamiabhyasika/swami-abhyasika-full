import type { Manifest } from './snapshot';

export interface ChangeCount {
  added: number;
  removed: number;
  changed: number;
}
export interface Changes {
  /** true when there is no earlier backup to compare with */
  first: boolean;
  students: ChangeCount;
  bookings: ChangeCount;
  other: ChangeCount;
  total: number;
}

function compare(prev: Record<string, string>, cur: Record<string, string>): ChangeCount {
  let added = 0;
  let changed = 0;
  for (const [id, hash] of Object.entries(cur)) {
    if (!(id in prev)) added++;
    else if (prev[id] !== hash) changed++;
  }
  const removed = Object.keys(prev).filter((id) => !(id in cur)).length;
  return { added, removed, changed };
}

/** How many records were added, removed or edited between two backups. */
export function diffManifests(prev: Manifest | null, cur: Manifest): Changes {
  if (!prev) {
    const n = (o: Record<string, string>): ChangeCount => ({ added: Object.keys(o).length, removed: 0, changed: 0 });
    const s = n(cur.students), b = n(cur.bookings), o = n(cur.other);
    return { first: true, students: s, bookings: b, other: o, total: s.added + b.added + o.added };
  }
  const students = compare(prev.students, cur.students);
  const bookings = compare(prev.bookings, cur.bookings);
  const other = compare(prev.other, cur.other);
  const sum = (c: ChangeCount) => c.added + c.removed + c.changed;
  return { first: false, students, bookings, other, total: sum(students) + sum(bookings) + sum(other) };
}

/** "3 students added, 1 booking changed" — a sentence a person can read. */
export function describeChanges(c: Changes | null | undefined): string {
  if (!c) return '—';
  if (c.first) return 'First backup (everything is new)';
  if (c.total === 0) return 'No changes';
  const parts: string[] = [];
  const add = (c: ChangeCount, one: string, many: string) => {
    for (const [n, verb] of [[c.added, 'added'], [c.changed, 'changed'], [c.removed, 'removed']] as const) {
      if (n) parts.push(`${n} ${n === 1 ? one : many} ${verb}`);
    }
  };
  add(c.students, 'student', 'students');
  add(c.bookings, 'seat booking', 'seat bookings');
  add(c.other, 'setting/photo', 'settings/photos');
  return parts.join(', ');
}

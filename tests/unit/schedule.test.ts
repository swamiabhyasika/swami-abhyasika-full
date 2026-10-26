import fs from 'node:fs';
import { describe, expect, it } from 'vitest';
import { DAILY_CRON, dayKey, formatBytes, nextScheduledRun, parseDailyCron } from '@/lib/backup/schedule';
import { backupFileName } from '@/lib/backup/runner';

describe('schedule', () => {
  it('vercel.json uses the same schedule as the app shows', () => {
    const cfg = JSON.parse(fs.readFileSync('vercel.json', 'utf8'));
    expect(cfg.crons).toEqual([{ path: '/api/cron/backup', schedule: DAILY_CRON }]);
  });
  it('20:30 UTC is 02:00 AM in India', () => {
    const { start } = nextScheduledRun(new Date('2026-10-25T10:00:00Z'));
    expect(start.toISOString()).toBe('2026-10-25T20:30:00.000Z');
    expect(new Intl.DateTimeFormat('en-IN', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(start)).toBe('02:00');
  });
  it('moves to tomorrow once today’s time has passed', () => expect(nextScheduledRun(new Date('2026-10-25T21:00:00Z')).start.toISOString()).toBe('2026-10-26T20:30:00.000Z'));
  it('the run window is the rest of that hour', () => {
    const { start, windowEnd } = nextScheduledRun(new Date('2026-10-25T10:00:00Z'));
    expect(windowEnd.getTime() - start.getTime()).toBe(59 * 60_000);
  });
  it('only accepts daily schedules', () => {
    expect(parseDailyCron('0 3 * * *')).toEqual({ minute: 0, hour: 3 });
    expect(() => parseDailyCron('*/5 * * * *')).toThrow(/daily/);
  });
});

describe('dayKey (which day is "today"?)', () => {
  it('uses India time: 00:30 IST on the 25th is still the 24th in UTC', () => {
    const d = new Date('2026-10-24T19:00:00Z');
    expect(dayKey(d, 'Asia/Kolkata')).toBe('2026-10-25');
    expect(dayKey(d, 'UTC')).toBe('2026-10-24');
  });
});

describe('helpers', () => {
  it('formats sizes', () => {
    expect(formatBytes(0)).toBe('—');
    expect(formatBytes(900)).toBe('900 B');
    expect(formatBytes(2048)).toBe('2 KB');
    expect(formatBytes(5 * 1024 * 1024)).toBe('5.0 MB');
  });
  it('names backup files by India time', () => expect(backupFileName(new Date('2026-10-25T20:30:00Z'), 'Asia/Kolkata')).toBe('swami-backup-2026-10-26_02-00.json'));
});

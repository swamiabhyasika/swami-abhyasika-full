import { APP_TIMEZONE } from '../config';

/**
 * The automatic daily backup. Vercel runs scheduled jobs in UTC, so 20:30 UTC = 02:00 AM in India (UTC+5:30).
 * Keep this value identical to the "schedule" in vercel.json (a test checks that).
 * On Vercel's free plan a job runs once a day, at some point inside the chosen hour.
 */
export const DAILY_CRON = '30 20 * * *';
export const WINDOW_MINUTES = 59;

export function parseDailyCron(cron = DAILY_CRON): { minute: number; hour: number } {
  const m = cron.trim().match(/^(\d{1,2}) (\d{1,2}) \* \* \*$/);
  if (!m) throw new Error(`Only daily schedules like "30 20 * * *" are supported (got "${cron}")`);
  return { minute: Number(m[1]), hour: Number(m[2]) };
}

/** The next time the scheduled job may run, and the end of the hour in which it is allowed to run. */
export function nextScheduledRun(now: Date, cron = DAILY_CRON): { start: Date; windowEnd: Date } {
  const { minute, hour } = parseDailyCron(cron);
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), hour, minute));
  if (start.getTime() <= now.getTime()) start.setUTCDate(start.getUTCDate() + 1);
  return { start, windowEnd: new Date(start.getTime() + WINDOW_MINUTES * 60_000) };
}

/** "2026-10-25": the calendar day in the app's time zone — used to decide "has today's backup happened?" */
export function dayKey(date: Date, timeZone = APP_TIMEZONE): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);
}

export function formatDateTime(date: Date | string | null | undefined, timeZone = APP_TIMEZONE): string {
  if (!date) return '—';
  return new Intl.DateTimeFormat('en-IN', { timeZone, dateStyle: 'medium', timeStyle: 'short' }).format(new Date(date));
}

export function formatTime(date: Date, timeZone = APP_TIMEZONE): string {
  return new Intl.DateTimeFormat('en-IN', { timeZone, hour: 'numeric', minute: '2-digit', hour12: true }).format(date);
}

export function formatBytes(n: number | string | null | undefined): string {
  const v = Number(n);
  if (!v) return '—';
  if (v < 1024) return `${v} B`;
  if (v < 1024 * 1024) return `${(v / 1024).toFixed(0)} KB`;
  return `${(v / 1024 / 1024).toFixed(1)} MB`;
}

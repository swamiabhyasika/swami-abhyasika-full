import { getDb } from './db';

export interface ThemeSettings {
  theme: 'dark' | 'light';
  accent?: { accent: string; accent2: string };
}

/** Reads the colour theme the owner chose in Settings (same keys the original screens use). */
export async function loadTheme(): Promise<ThemeSettings> {
  try {
    const db = await getDb();
    const rows = await db.query<{ key: string; value: string }>("select key, value from settings where key in ('edutrack-theme','edutrack-accent')");
    const map = Object.fromEntries(rows.map((r) => [r.key, r.value]));
    let accent: ThemeSettings['accent'];
    try {
      const a = JSON.parse(map['edutrack-accent'] || 'null');
      if (a && /^#[0-9a-f]{6}$/i.test(a.accent) && /^#[0-9a-f]{6}$/i.test(a.accent2)) accent = a;
    } catch {}
    return { theme: map['edutrack-theme'] === 'light' ? 'light' : 'dark', accent };
  } catch {
    return { theme: 'dark' };
  }
}

/** CSS variables for an accent colour, calculated exactly like the original `setAccentColor`. */
export function accentVars(accent?: ThemeSettings['accent']): Record<string, string> | undefined {
  if (!accent) return undefined;
  const n = (i: number) => parseInt(accent.accent.slice(i, i + 2), 16);
  return {
    '--accent': accent.accent,
    '--accent2': accent.accent2,
    '--accent-bg': `rgba(${n(1)},${n(3)},${n(5)},0.12)`,
    '--accent-glow': `rgba(${n(1)},${n(3)},${n(5)},0.22)`,
  };
}

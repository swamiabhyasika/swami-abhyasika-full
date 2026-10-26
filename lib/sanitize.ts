/**
 * The original screens print names and notes straight into the page as HTML. Until those screens are
 * rebuilt as React components (which escape text automatically), characters that could be used to inject
 * HTML are replaced with look-alikes, and NUL characters (which PostgreSQL cannot store) are removed.
 */
export function clean<T>(v: T): T {
  if (typeof v === 'string') {
    if (v.startsWith('data:image')) return v;
    return v.replace(/\u0000/g, '').replace(/</g, '‹').replace(/>/g, '›').replace(/"/g, '”') as unknown as T;
  }
  if (Array.isArray(v)) return v.map(clean) as unknown as T;
  if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, clean(x)])) as T;
  return v;
}

/** Settings are stored as text; if the text is JSON, clean the values inside it. */
export function cleanSetting(value: string): string {
  try {
    return JSON.stringify(clean(JSON.parse(value)));
  } catch {
    return clean(value);
  }
}

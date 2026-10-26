import fs from 'node:fs';
import { describe, expect, it } from 'vitest';
import { NAV_ITEMS, legacyPageForPath, normalisePath } from '@/lib/nav';

describe('navigation', () => {
  it('has the ten pages of the original app, each with its own address', () => {
    expect(NAV_ITEMS.map((i) => i.href)).toEqual([
      '/dashboard', '/students', '/students/new', '/library/basement', '/library/second-floor',
      '/finance/fees', '/finance/reminders', '/settings', '/finance/statistics', '/export',
    ]);
  });
  it('uses lowercase, unique addresses', () => {
    const hrefs = NAV_ITEMS.map((i) => i.href);
    expect(new Set(hrefs).size).toBe(hrefs.length);
    for (const h of hrefs) expect(h).toBe(h.toLowerCase());
  });
  it('every address points at a section that really exists in the original screen', () => {
    const html = fs.readFileSync('legacy/index.html', 'utf8');
    for (const i of NAV_ITEMS) expect(html, i.href).toContain(`id="page-${i.legacy}"`);
  });
  it('finds a page by address, ignoring a trailing slash', () => {
    expect(legacyPageForPath('/library/basement/')?.legacy).toBe('basement');
    expect(legacyPageForPath('/nope')).toBeUndefined();
  });
  it('turns capital letters into the lowercase address', () => {
    expect(normalisePath('/Students')).toBe('/students');
    expect(normalisePath('/Library/Basement/')).toBe('/library/basement');
  });
});

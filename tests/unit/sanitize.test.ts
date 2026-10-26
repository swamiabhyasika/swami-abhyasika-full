import { describe, expect, it } from 'vitest';
import { clean, cleanSetting } from '@/lib/sanitize';

describe('clean', () => {
  it('replaces characters that could inject HTML', () => {
    expect(clean('<img src=x onerror=alert(1)>')).toBe('‹img src=x onerror=alert(1)›');
    expect(clean('say "hi"')).toBe('say ”hi”');
  });
  it('keeps normal names, including apostrophes', () => {
    expect(clean("O'Brien & Sons")).toBe("O'Brien & Sons");
  });
  it('removes NUL characters that PostgreSQL cannot store', () => {
    expect(clean('A\u0000B')).toBe('AB');
  });
  it('cleans values inside objects and lists but not the keys', () => {
    expect(clean({ name: '<b>', list: ['"x"', 1, null], n: 5 })).toEqual({ name: '‹b›', list: ['”x”', 1, null], n: 5 });
  });
  it('leaves photo data untouched', () => {
    const photo = 'data:image/png;base64,AAA<>"';
    expect(clean(photo)).toBe(photo);
  });
});

describe('cleanSetting', () => {
  it('cleans text inside JSON and keeps it valid JSON', () => {
    const out = cleanSetting(JSON.stringify({ name: '<x>' }));
    expect(JSON.parse(out)).toEqual({ name: '‹x›' });
  });
  it('cleans plain (non-JSON) text', () => {
    expect(cleanSetting('<dark>')).toBe('‹dark›');
  });
});

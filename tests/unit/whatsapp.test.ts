import { describe, expect, it } from 'vitest';
import { createRequire } from 'node:module';
import wa from '@/public/wa-render';
import { MAX_TEMPLATE_LENGTH, TEMPLATES, getTemplateDef, previewTemplate, validateTemplate } from '@/lib/whatsapp-defs';

const legacy = createRequire(import.meta.url)('../fixtures/legacy-messages.cjs') as Record<string, (...a: any[]) => string>;
const body = (key: string) => getTemplateDef(key)!.defaultBody;

describe('default templates reproduce the original messages exactly', () => {
  it('seat_confirmed', () => {
    const slots = '  • Morning (6am-10am)\n  • Evening (6pm-10pm)';
    const expected = legacy.seat_confirmed({ name: 'Asha Patil' }, '2026-10-01', '2026-10-31', 12, slots);
    const actual = wa.render('seat_confirmed', body('seat_confirmed'), { name: 'Asha Patil', startDate: '2026-10-01', endDate: '2026-10-31', seat: 12, slots });
    expect(actual).toBe(expected);
  });

  it('fee_receipt', () => {
    const expected = legacy.fee_receipt('Asha Patil', 'RCP-1', '2026-10-01', '2026-10-01', '2026-10-31', 'Library', 'UPI', 1500);
    const actual = wa.render('fee_receipt', body('fee_receipt'), { name: 'Asha Patil', receiptNo: 'RCP-1', paymentDate: '2026-10-01', fromDate: '2026-10-01', dueDate: '2026-10-31', course: 'Library', method: 'UPI', amount: Number(1500).toLocaleString() });
    expect(actual).toBe(expected);
  });

  const fmt = (d: string) => (d ? d.split('-').reverse().join('-') : '—');
  const admission = (opts: Record<string, any>, fee: number) => {
    const expected = legacy.admission_confirmed('Asha Patil', 'RCP-9', opts, fmt, '2026-10-01', '2026-10-31', 12, 'Morning (6am-10am)', fee);
    const actual = wa.render('admission_confirmed', body('admission_confirmed'), {
      name: 'Asha Patil', receiptNo: 'RCP-9', studentId: opts.studentId || '', admissionDate: opts.admissionDate ? fmt(opts.admissionDate) : '',
      paymentDate: fmt(opts.paymentDate || '2026-10-01'), startDate: fmt('2026-10-01'), endDate: fmt('2026-10-31'), course: opts.course || '', seat: 12,
      slot: 'Morning (6am-10am)', paymentMethod: opts.paymentMethod || '', amount: fee > 0 ? Number(fee).toLocaleString() : '',
    });
    return { expected, actual };
  };
  it('admission_confirmed with every detail', () => {
    const { expected, actual } = admission({ studentId: 'STU-1', admissionDate: '2026-10-01', paymentDate: '2026-10-02', course: 'Library', paymentMethod: 'Cash' }, 600);
    expect(actual).toBe(expected);
  });
  it('admission_confirmed leaves out the lines that have no value', () => {
    const { expected, actual } = admission({ paymentDate: '2026-10-02' }, 0);
    expect(actual).toBe(expected);
    expect(actual).not.toContain('Student ID');
    expect(actual).not.toContain('Amount Paid');
  });

  describe('fee_reminder', () => {
    const cases: [string, number | null, number][] = [
      ['expiring soon, fees pending', 3, 200], ['expiring tomorrow', 1, 0], ['expires today', 0, 0],
      ['expired 1 day ago', -1, 0], ['expired long ago, pending', -9, 500], ['no due date', null, 0],
    ];
    it.each(cases)('%s', (_label, diffDays, remaining) => {
      const expected = legacy.fee_reminder('Asha Patil', '2026-10-01', '2026-10-31', remaining, diffDays);
      // Rebuild the three computed pieces the same way the screen does.
      const period = '\uD83D\uDDD3 Subscription Period: *2026-10-01* \u2192 *2026-10-31*';
      let status: string;
      if (diffDays === null) status = 'Your membership due date is not set. Please visit us to update your records.';
      else if (diffDays < 0) status = '\u26A0\uFE0F Your membership has *expired ' + Math.abs(diffDays) + ' day' + (Math.abs(diffDays) !== 1 ? 's' : '') + ' ago*.';
      else if (diffDays === 0) status = '\u26A0\uFE0F Your membership *expires TODAY*. Please renew immediately.';
      else status = '\u23F3 Your membership is expiring in *' + diffDays + ' day' + (diffDays !== 1 ? 's' : '') + '*.';
      const feeNote = remaining > 0
        ? '\n\n\uD83D\uDCB0 *Pending Fees: \u20B9' + remaining.toLocaleString() + '*\nKindly clear your dues at the earliest to continue enjoying our facilities.'
        : '\n\u2705 Your fees are up to date.';
      expect(wa.render('fee_reminder', body('fee_reminder'), { name: 'Asha Patil', period, status, feeNote })).toBe(expected);
    });
  });
});

describe('render', () => {
  it('leaves unknown placeholders visible so a typing mistake is easy to spot', () => expect(wa.render('x', 'Hi {nmae}', { name: 'A' })).toBe('Hi {nmae}'));
  it('does not expand placeholders that appear inside a value', () => expect(wa.render('x', 'Hi {name}', { name: '{amount}', amount: '5' })).toBe('Hi {amount}'));
  it('accepts Windows line endings', () => expect(wa.render('x', 'a\r\nb', {})).toBe('a\nb'));
  it('drops a line only for optional placeholders', () => {
    expect(wa.render('admission_confirmed', 'a\nID {studentId}\nb', { studentId: '' })).toBe('a\nb');
    expect(wa.render('fee_receipt', 'a\nCourse {course}\nb', { course: '' })).toBe('a\nCourse \nb');
  });
});

describe('validateTemplate', () => {
  it('rejects empty text', () => expect(validateTemplate('fee_receipt', '   ').errors).toHaveLength(1));
  it('rejects text that is too long', () => expect(validateTemplate('fee_receipt', '{name}' + 'x'.repeat(MAX_TEMPLATE_LENGTH)).errors[0]).toMatch(/too long/));
  it('warns, but allows, unknown placeholders', () => {
    const v = validateTemplate('fee_receipt', 'Hi {name} {nmae}');
    expect(v.errors).toEqual([]);
    expect(v.warnings.join(' ')).toContain('{nmae}');
  });
  it('warns when the student name is not used', () => expect(validateTemplate('fee_receipt', 'Thanks').warnings.join(' ')).toContain('{name}'));
  it('accepts every built-in default without any complaint', () => {
    for (const t of TEMPLATES) expect(validateTemplate(t.key, t.defaultBody)).toEqual({ errors: [], warnings: [] });
  });
  it('rejects an unknown template key', () => expect(validateTemplate('nope', 'x').errors).toHaveLength(1));
});

describe('previewTemplate', () => {
  it('fills in the example values', () => expect(previewTemplate('fee_receipt', 'Hi {name}, {amount}')).toBe('Hi Asha Patil, 600'));
});

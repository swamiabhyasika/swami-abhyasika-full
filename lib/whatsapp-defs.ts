import wa from '@/public/wa-render';

/**
 * (Pure data and rules — no database code, so the browser can use this file too.)
 * The four WhatsApp messages the app sends. Each has built-in default wording (identical to the original app)
 * which the owner can change in Settings. Changed wording is stored in the `message_templates` table;
 * "Reset" simply deletes the changed row, so the default is used again.
 */

export interface Placeholder {
  name: string;
  description: string;
  example: string;
  optional?: boolean;
}
export interface TemplateDef {
  key: string;
  title: string;
  sentWhen: string;
  placeholders: Placeholder[];
  defaultBody: string;
}

const LINE = '━━━━━━━━━━━━━━━━━━';

export const TEMPLATES: TemplateDef[] = [
  {
    key: 'seat_confirmed',
    title: 'Seat confirmed (after a fee payment)',
    sentWhen: 'Fees → Record Payment, when a Basement Library seat is booked together with the payment.',
    placeholders: [
      { name: 'name', description: 'Student name', example: 'Asha Patil' },
      { name: 'startDate', description: 'First day of the booking', example: '2026-10-01' },
      { name: 'endDate', description: 'Last day of the booking', example: '2026-10-31' },
      { name: 'seat', description: 'Seat number', example: '12' },
      { name: 'slots', description: 'The booked time slots, one per line', example: '  • Morning (6am-10am)\n  • Evening (6pm-10pm)' },
    ],
    defaultBody: [
      '🙏 Namaste *{name}*!',
      '',
      'Your Basement Library seat is confirmed:',
      '',
      '🗓 Period: *{startDate}* → *{endDate}*',
      '🪑 Seat: #{seat}',
      '⏰ Daily Slots:',
      '{slots}',
      '',
      '*Swami Abhyasika — Basement Library*',
    ].join('\n'),
  },
  {
    key: 'fee_receipt',
    title: 'Fee receipt',
    sentWhen: 'Fees → a payment receipt → "Send Receipt on WhatsApp".',
    placeholders: [
      { name: 'name', description: 'Student name', example: 'Asha Patil' },
      { name: 'receiptNo', description: 'Receipt number', example: 'RCP-482913' },
      { name: 'paymentDate', description: 'Date the money was received', example: '2026-10-01' },
      { name: 'fromDate', description: 'Membership start date', example: '2026-10-01' },
      { name: 'dueDate', description: 'Membership end date', example: '2026-10-31' },
      { name: 'course', description: 'Course', example: 'Library' },
      { name: 'method', description: 'Payment method', example: 'UPI' },
      { name: 'amount', description: 'Amount paid (without the ₹ sign)', example: '600' },
    ],
    defaultBody: [
      '🙏 Namaste *{name}*!',
      '',
      '🧾 *Fee Receipt — Swami Abhyasika*',
      LINE,
      '🧾 Receipt No: *{receiptNo}*',
      '📅 Payment Date: *{paymentDate}*',
      '📆 From Date: *{fromDate}*',
      '📆 Valid Until: *{dueDate}*',
      '📚 Course: *{course}*',
      '💳 Payment Method: *{method}*',
      '💰 Amount Paid: *₹{amount}*',
      ' ',
      LINE,
      'Thank you for your payment! 🙏',
      '*Swami Abhyasika — Center For Learning*',
    ].join('\n'),
  },
  {
    key: 'admission_confirmed',
    title: 'Admission confirmed (seat booked from the seat map)',
    sentWhen: 'Basement / 2nd Floor Library → book a seat for a student → WhatsApp confirmation.',
    placeholders: [
      { name: 'name', description: 'Student name', example: 'Asha Patil' },
      { name: 'receiptNo', description: 'Receipt number', example: 'RCP-482913' },
      { name: 'studentId', description: 'Student ID', example: 'STU-0042', optional: true },
      { name: 'admissionDate', description: 'Admission date', example: '01-Oct-2026', optional: true },
      { name: 'paymentDate', description: 'Payment date', example: '01-Oct-2026' },
      { name: 'startDate', description: 'Membership start', example: '01-Oct-2026' },
      { name: 'endDate', description: 'Membership end', example: '31-Oct-2026' },
      { name: 'course', description: 'Course', example: 'Library', optional: true },
      { name: 'seat', description: 'Seat number', example: '12' },
      { name: 'slot', description: 'Booked slot(s) on one line', example: 'Morning (6am-10am) + Evening (6pm-10pm)' },
      { name: 'paymentMethod', description: 'Payment method', example: 'UPI', optional: true },
      { name: 'amount', description: 'Amount paid (without ₹); empty when nothing was paid', example: '600', optional: true },
    ],
    defaultBody: [
      '🙏 Namaste, *{name}*!',
      '',
      'Your Admission to *Swami Abhyasika* is Confirmed.',
      '',
      '✅ Your Library Seat has been Successfully Reserved.',
      LINE,
      '📄 *FEE RECEIPT — SWAMI ABHYASIKA*',
      LINE,
      '🧾 Receipt No: *{receiptNo}*',
      '🆔 Student ID: *{studentId}*',
      '👤 Student Name: *{name}*',
      '📅 Admission Date: *{admissionDate}*',
      '📅 Payment Date: *{paymentDate}*',
      '📅 Membership Start: *{startDate}*',
      '📅 Valid Until: *{endDate}*',
      '🎯 Course: *{course}*',
      '💺 Seat No: *{seat}*',
      '🕒 Slot: *{slot}*',
      '💳 Payment Method: *{paymentMethod}*',
      '💰 Amount Paid: *₹{amount}*',
      '🔖 Payment Status: *PAID ✅*',
      LINE,
      '🎓 Admission Status: *CONFIRMED ✅*',
      LINE,
      '📚 *Swami Abhyasika — Basement Library*',
      'Thank you for choosing us. We wish you great success in your studies. 🌟',
      LINE,
    ].join('\n'),
  },
  {
    key: 'fee_reminder',
    title: 'Membership / fee reminder',
    sentWhen: 'Reminders → "Send reminder" for a student whose membership is ending, expired or has pending fees.',
    placeholders: [
      { name: 'name', description: 'Student name', example: 'Asha Patil' },
      { name: 'period', description: 'The subscription period line (made by the app)', example: '🗓 Subscription Period: *2026-10-01* → *2026-10-31*' },
      { name: 'status', description: 'Expiry status sentence (made by the app)', example: '⏳ Your membership is expiring in *3 days*.' },
      { name: 'feeNote', description: 'Pending-fees note (made by the app; it includes its own line breaks)', example: '\n\n💰 *Pending Fees: ₹200*\nKindly clear your dues at the earliest to continue enjoying our facilities.' },
    ],
    defaultBody: [
      '🙏 Namaste *{name}*!',
      '',
      'This is a gentle reminder from *Swami Abhyasika*.',
      '',
      '{period}',
      '{status}{feeNote}',
      '',
      'Please renew your membership or visit us to avoid any interruption in services.',
      '',
      'Thank you 🙏',
      '*Swami Abhyasika — Center for Spiritual Practice & Learning*',
    ].join('\n'),
  },
];

export const TEMPLATE_KEYS = TEMPLATES.map((t) => t.key);
export const MAX_TEMPLATE_LENGTH = 2000;

export function getTemplateDef(key: string): TemplateDef | undefined {
  return TEMPLATES.find((t) => t.key === key);
}

/** The message the way it will look, using the example values of each placeholder. */
export function previewTemplate(key: string, body: string): string {
  const def = getTemplateDef(key);
  if (!def) return '';
  const vars = Object.fromEntries(def.placeholders.map((p) => [p.name, p.example]));
  return wa.render(key, body, vars);
}

export interface Validation {
  errors: string[];
  warnings: string[];
}

/** Errors block saving; warnings are shown but do not. */
export function validateTemplate(key: string, body: string): Validation {
  const errors: string[] = [];
  const warnings: string[] = [];
  const def = getTemplateDef(key);
  if (!def) return { errors: ['Unknown template'], warnings };
  if (!body.trim()) errors.push('The message cannot be empty.');
  if (body.length > MAX_TEMPLATE_LENGTH) errors.push(`The message is too long (${body.length} of ${MAX_TEMPLATE_LENGTH} characters).`);
  const known = new Set(def.placeholders.map((p) => p.name));
  const unknown = [...new Set([...body.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).filter((n) => !known.has(n)))];
  if (unknown.length) warnings.push(`Unknown placeholder${unknown.length > 1 ? 's' : ''}: ${unknown.map((u) => `{${u}}`).join(', ')}. They will be sent exactly as typed.`);
  if (!body.includes('{name}')) warnings.push("The student's name ({name}) is not used in this message.");
  return { errors, warnings };
}


export interface TemplateRow extends TemplateDef {
  body: string;
  isCustom: boolean;
  updatedAt: string | null;
}

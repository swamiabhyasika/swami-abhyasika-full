// Variables and functions that live in the original screen's script (public/app.js), used by the browser tests.
declare const students: any[];
declare function save(): void;
declare function sendReminderWA(phone: string, name: string, fromDate: string, dueDate: string, remaining: number, diffDays: number | null): void;

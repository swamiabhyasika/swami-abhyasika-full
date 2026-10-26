// Load data exported from the old app (or from `npm run backup`) into the database.
//   npm run import:legacy -- path/to/data.json
//
// Accepted files:
//   • { "edu_students": "[...]", "blib_bookings": "[...]", ... }          (localStorage dump / this app's backup)
//   • [ { "key": "edu_students", "value": "[...]" }, ... ]                (rows of the old `kv` table)
// In the old app, run this once in the browser console and save the output:
//   copy(JSON.stringify(Object.fromEntries(Object.entries(localStorage).filter(([k]) => !k.startsWith('_')))))
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
import fs from 'node:fs';
import { getDb } from '../lib/db';
import { putKey } from '../lib/state';
import { storeImage } from '../lib/images';
import { clashes } from '../lib/seats';

async function main() {
  const file = process.argv[2];
  if (!file) {
    console.error('Usage: npm run import:legacy -- <file.json>');
    process.exit(1);
  }
  let raw = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (raw && raw.app === 'swami-abhyasika' && raw.data) raw = raw.data; // a backup made by this app
  const entries: [string, unknown][] = (Array.isArray(raw) ? raw.map((r: any) => [r.key, r.value] as [string, unknown]) : Object.entries(raw)).filter(([k]) => k && !String(k).startsWith('_')); // keys starting with _ are browser-only
  const toStr = (v: unknown) => (typeof v === 'string' ? v : JSON.stringify(v));

  await getDb();
  const order = (k: string) => (k === 'edu_students' ? 0 : k === 'blib_bookings' ? 1 : k.startsWith('edu_photo_') ? 2 : 3);
  entries.sort((a, b) => order(a[0]) - order(b[0]));

  let ok = 0;
  for (const [key, val] of entries) {
    if (!key || key.startsWith('_')) continue;
    let value = toStr(val);
    try {
      if (key.startsWith('edu_photo_') && value.startsWith('data:image')) value = await storeImage(value);
      if (key === 'blib_bookings') {
        // Old data may already contain overlapping bookings; bring it in as it is, but tell the owner.
        const list: any[] = JSON.parse(value).filter((b: any) => b?.status === 'active');
        let pairs = 0;
        for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) if (clashes(list[i], list[j])) pairs++;
        if (pairs) console.warn(`  WARNING: ${pairs} pair(s) of active bookings in the old data overlap (same seat, slot and dates). Imported unchanged; please review them.`);
        await putKey(key, value, undefined, { skipSeatCheck: true });
      } else await putKey(key, value);
      ok++;
      console.log('  imported', key);
    } catch (e) {
      console.error('  FAILED  ', key, '-', (e as Error).message);
    }
  }
  console.log(`Done: ${ok} of ${entries.length} keys imported.`);
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });

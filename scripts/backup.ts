// Makes a complete backup file in ./backups and records it in the history (same as "Download backup now").
//   npm run backup
// Google Drive backups are made by the app itself (daily schedule, catch-up, or the button on Settings → Backup & Restore).
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
import fs from 'node:fs';
import path from 'node:path';
import { runBackup } from '../lib/backup/runner';

async function main() {
  const { run, content } = await runBackup({ destination: 'local', trigger: 'manual', user: 'command line' });
  if (run.status !== 'success' || !content) throw new Error(run.error || 'Backup failed');
  fs.mkdirSync('backups', { recursive: true });
  fs.writeFileSync(path.join('backups', run.fileName!), content);
  const old = fs.readdirSync('backups').filter((f) => f.startsWith('swami-backup-')).sort().slice(0, -30);
  old.forEach((f) => fs.unlinkSync(path.join('backups', f)));
  console.log(`Saved backups/${run.fileName} (${run.sizeBytes} bytes). ${run.changesText}`);
  process.exit(0);
}
main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});

// Add a person who may use the app, or reset their password:
//   npm run seed -- <email-or-username> <password> [owner|staff]
//
//  • With Supabase configured: creates the login in Supabase Auth (needs SUPABASE_SERVICE_ROLE_KEY) and adds the
//    person to the app's allow-list.
//  • Without Supabase (local development): creates a local username + password.
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
import bcrypt from 'bcryptjs';
import { randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { getDb } from '../lib/db';
import { supabaseConfig } from '../lib/config';

async function main() {
  const [login, password, role = 'owner'] = process.argv.slice(2);
  if (!login || !password) {
    console.error('Usage: npm run seed -- <email-or-username> <password> [owner|staff]');
    process.exit(1);
  }
  if (password.length < 8) {
    console.error('Use a password with at least 8 characters.');
    process.exit(1);
  }
  if (!['owner', 'staff'].includes(role)) {
    console.error('Role must be "owner" or "staff".');
    process.exit(1);
  }
  const db = await getDb();
  const cfg = supabaseConfig();

  if (cfg) {
    if (!cfg.serviceKey) {
      console.error('SUPABASE_SERVICE_ROLE_KEY is needed to create logins (Supabase → Project Settings → API). Keep it secret.');
      process.exit(1);
    }
    const email = login.toLowerCase();
    const admin = createClient(cfg.url, cfg.serviceKey, { auth: { persistSession: false, autoRefreshToken: false } }).auth.admin;
    let userId: string;
    const created = await admin.createUser({ email, password, email_confirm: true });
    if (created.data.user) {
      userId = created.data.user.id;
      console.log(`Created login ${email} in Supabase Auth.`);
    } else if (/already|registered|exists/i.test(created.error?.message || '')) {
      const list = await admin.listUsers({ page: 1, perPage: 1000 });
      const found = list.data.users.find((u) => (u.email || '').toLowerCase() === email);
      if (!found) throw new Error('The login exists but could not be found to update it.');
      userId = found.id;
      const upd = await admin.updateUserById(userId, { password, email_confirm: true });
      if (upd.error) throw upd.error;
      console.log(`Updated the password of ${email}.`);
    } else {
      throw created.error;
    }
    await db.query(
      `insert into users (id, username, email, role, password_hash) values ($1,$2,$2,$3,null)
       on conflict (id) do update set role = excluded.role`,
      [userId, email, role],
    );
    console.log(`${email} may now use the app (${role}).`);
  } else {
    const hash = bcrypt.hashSync(password, 10);
    const rows = await db.query('update users set password_hash = $2, role = $3 where lower(username) = lower($1) returning id', [login, hash, role]);
    if (rows.length) console.log(`Updated password for "${login}".`);
    else {
      await db.query('insert into users (id, username, password_hash, role) values ($1,$2,$3,$4)', [randomUUID(), login, hash, role]);
      console.log(`Created user "${login}" (${role}).`);
    }
  }
  process.exit(0);
}
main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});

import fs from 'node:fs';
import path from 'node:path';

export type Row = Record<string, any>;

export interface Tx {
  query<T = Row>(sql: string, params?: any[]): Promise<T[]>;
}
export interface Db extends Tx {
  exec(sql: string): Promise<void>;
  transaction<T>(fn: (tx: Tx) => Promise<T>): Promise<T>;
  kind: 'pglite' | 'postgres';
}

/**
 * One tiny interface, two engines:
 *  - DATABASE_URL set  -> real PostgreSQL (Supabase) through `pg`
 *  - DATABASE_URL empty -> embedded PostgreSQL (PGlite) stored in ./data/pgdata
 * The SQL is identical for both.
 */
async function createDb(): Promise<Db> {
  const url = process.env.DATABASE_URL?.trim();
  if (url) {
    const { Pool } = await import('pg');
    const useSsl = process.env.DATABASE_SSL ? process.env.DATABASE_SSL !== 'false' : !/localhost|127\.0\.0\.1/.test(url);
    const pool = new Pool({
      connectionString: url,
      max: Number(process.env.DATABASE_POOL_MAX || 3),
      ssl: useSsl ? { rejectUnauthorized: false } : undefined,
    });
    return {
      kind: 'postgres',
      async query(sql, params) {
        return (await pool.query(sql, params)).rows;
      },
      async exec(sql) {
        await pool.query(sql);
      },
      async transaction(fn) {
        const client = await pool.connect();
        try {
          await client.query('begin');
          const out = await fn({ query: async (sql, params) => (await client.query(sql, params)).rows });
          await client.query('commit');
          return out;
        } catch (e) {
          await client.query('rollback').catch(() => {});
          throw e;
        } finally {
          client.release();
        }
      },
    };
  }

  if (process.env.VERCEL) throw new Error('DATABASE_URL is not set. Add your Supabase connection string in the Vercel environment variables.');
  const { PGlite } = await import('@electric-sql/pglite');
  // Tests (and SWAMI_MEMORY_DB=1, used by the browser tests) get a throwaway in-memory database; normal local use keeps its data in ./data/pgdata.
  const dir = path.join(process.cwd(), 'data', 'pgdata');
  if (!process.env.VITEST && !process.env.SWAMI_MEMORY_DB) fs.mkdirSync(path.dirname(dir), { recursive: true });
  const pg = process.env.VITEST || process.env.SWAMI_MEMORY_DB ? new PGlite() : new PGlite(dir);
  await pg.waitReady;
  return {
    kind: 'pglite',
    async query(sql, params) {
      return (await pg.query(sql, params)).rows as any[];
    },
    async exec(sql) {
      await pg.exec(sql);
    },
    async transaction(fn) {
      return pg.transaction(async (t) => fn({ query: async (sql, params) => (await t.query(sql, params)).rows as any[] }));
    },
  };
}

const g = globalThis as unknown as { __swamiDb?: Promise<Db> };

/** Tests only: forget the cached database so the next call starts a fresh one. */
export function resetDbForTests() {
  g.__swamiDb = undefined;
}

/** Returns a ready database (schema applied, first admin created). Cached across hot reloads. */
export function getDb(): Promise<Db> {
  if (!g.__swamiDb) {
    g.__swamiDb = (async () => {
      const db = await createDb();
      await db.exec(fs.readFileSync(path.join(process.cwd(), 'db', 'schema.sql'), 'utf8'));
      await seedAdminIfEmpty(db);
      return db;
    })().catch((e) => {
      g.__swamiDb = undefined; // allow a retry on the next request
      throw e;
    });
  }
  return g.__swamiDb;
}

async function seedAdminIfEmpty(db: Db) {
  if (process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL) return; // Supabase Auth manages sign-ins
  const [{ n }] = await db.query<{ n: number }>('select count(*)::int as n from users');
  if (n > 0) return;
  const username = process.env.ADMIN_USERNAME;
  const password = process.env.ADMIN_PASSWORD;
  if (!username || !password) {
    console.warn('[db] No users yet. Set ADMIN_USERNAME and ADMIN_PASSWORD in .env.local, or run `npm run seed`.');
    return;
  }
  const bcrypt = (await import('bcryptjs')).default;
  const { randomUUID } = await import('node:crypto');
  await db.query('insert into users (id, username, password_hash, role) values ($1,$2,$3,$4)', [
    randomUUID(),
    username,
    bcrypt.hashSync(password, 10),
    'owner',
  ]);
  console.log(`[db] Created first admin user "${username}".`);
}

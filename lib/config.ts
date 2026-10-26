/** Reads settings from environment variables in one place. */

export interface SupabaseConfig {
  url: string;
  anonKey: string;
  serviceKey?: string;
}

/**
 * Supabase Auth is used when SUPABASE_URL and a public (anon / publishable) key are set.
 * When they are empty, the app falls back to a simple local login so it also runs on your own computer
 * with nothing installed.
 */
export function supabaseConfig(): SupabaseConfig | null {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey =
    process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !anonKey) return null;
  return { url: url.replace(/\/+$/, ''), anonKey, serviceKey: process.env.SUPABASE_SERVICE_ROLE_KEY || undefined };
}

export const usingSupabase = () => supabaseConfig() !== null;

/** "Today" for backups is decided in this time zone (default: India). */
export const APP_TIMEZONE = process.env.APP_TIMEZONE || 'Asia/Kolkata';

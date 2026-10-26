import { getDb } from './db';
import { getTemplateDef, TEMPLATES, validateTemplate, type TemplateRow, type Validation } from './whatsapp-defs';

export * from './whatsapp-defs';


/** All templates with the owner's wording where it exists, otherwise the default. */
export async function listTemplates(): Promise<TemplateRow[]> {
  const db = await getDb();
  const rows = await db.query<{ key: string; body: string; updated_at: string }>('select key, body, updated_at from message_templates');
  const saved = new Map(rows.map((r) => [r.key, r]));
  return TEMPLATES.map((t) => {
    const r = saved.get(t.key);
    return { ...t, body: r?.body ?? t.defaultBody, isCustom: Boolean(r), updatedAt: r ? new Date(r.updated_at).toISOString() : null };
  });
}

/** { key: wording } — what the original screens read from `edutrack-wa-templates`. */
export async function loadTemplates(): Promise<Record<string, string>> {
  return Object.fromEntries((await listTemplates()).map((t) => [t.key, t.body]));
}

export async function saveTemplate(key: string, body: string, userName: string): Promise<Validation> {
  const normalised = body.replace(/\r\n/g, '\n').replace(/\s+$/, '');
  const v = validateTemplate(key, normalised);
  if (v.errors.length) return v;
  const def = getTemplateDef(key)!;
  const db = await getDb();
  if (normalised === def.defaultBody) await db.query('delete from message_templates where key = $1', [key]); // same as default → nothing to store
  else
    await db.query(
      `insert into message_templates (key, body, updated_at, updated_by) values ($1,$2, now(), $3)
       on conflict (key) do update set body = excluded.body, updated_at = now(), updated_by = excluded.updated_by`,
      [key, normalised, userName],
    );
  return v;
}

export async function resetTemplate(key: string): Promise<void> {
  const db = await getDb();
  await db.query('delete from message_templates where key = $1', [key]);
}

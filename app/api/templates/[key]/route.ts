import { NextRequest, NextResponse } from 'next/server';
import { requireOwner } from '@/lib/auth';
import { getTemplateDef, resetTemplate, saveTemplate } from '@/lib/whatsapp';

export const runtime = 'nodejs';
type Ctx = { params: Promise<{ key: string }> };

/** Save new wording. */
export async function PUT(req: NextRequest, { params }: Ctx) {
  const auth = await requireOwner(req);
  if ('response' in auth) return auth.response;
  const { key } = await params;
  if (!getTemplateDef(key)) return NextResponse.json({ message: 'Unknown template' }, { status: 404 });
  const body = await req.json().catch(() => null);
  if (typeof body?.body !== 'string') return NextResponse.json({ message: 'The message text is missing.' }, { status: 400 });
  const result = await saveTemplate(key, body.body, auth.session.username);
  if (result.errors.length) return NextResponse.json({ message: result.errors.join(' '), ...result }, { status: 400 });
  return NextResponse.json({ ok: true, ...result });
}

/** Go back to the built-in wording. */
export async function DELETE(req: NextRequest, { params }: Ctx) {
  const auth = await requireOwner(req);
  if ('response' in auth) return auth.response;
  const { key } = await params;
  if (!getTemplateDef(key)) return NextResponse.json({ message: 'Unknown template' }, { status: 404 });
  await resetTemplate(key);
  return NextResponse.json({ ok: true });
}

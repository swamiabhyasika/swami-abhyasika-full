import { NextRequest, NextResponse } from 'next/server';
import { requireSession } from '@/lib/auth';
import { BadValueError, ConflictError, StaleError, deleteKey, putKey } from '@/lib/state';

export const runtime = 'nodejs';

type Ctx = { params: Promise<{ key: string }> };

function fail(e: unknown) {
  if (e instanceof StaleError) return NextResponse.json({ message: e.message, stale: true }, { status: 409 });
  if (e instanceof ConflictError) return NextResponse.json({ message: e.message }, { status: 409 });
  if (e instanceof BadValueError) return NextResponse.json({ message: e.message }, { status: 400 });
  console.error('[api/state]', e);
  return NextResponse.json({ message: 'Server error while saving' }, { status: 500 });
}

export async function PUT(req: NextRequest, { params }: Ctx) {
  const auth = await requireSession(req);
  if ('response' in auth) return auth.response;
  const { key } = await params;
  const body = await req.json().catch(() => null);
  try {
    const base = typeof body?.base === 'number' ? body.base : undefined;
    const version = await putKey(key, body?.value, base);
    return NextResponse.json({ ok: true, version });
  } catch (e) {
    return fail(e);
  }
}

export async function DELETE(req: NextRequest, { params }: Ctx) {
  const auth = await requireSession(req);
  if ('response' in auth) return auth.response;
  const { key } = await params;
  try {
    await deleteKey(key);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return fail(e);
  }
}

import { NextRequest, NextResponse } from 'next/server';
import { requireSession } from '@/lib/auth';
import { verifyOwnerPin } from '@/lib/state';

export const runtime = 'nodejs';

// 5 wrong PINs lock PIN checks for that user for 15 minutes.
const attempts = new Map<string, { n: number; until: number }>();

/** The owner PIN is checked here, on the server. It is never sent to the browser. */
export async function POST(req: NextRequest) {
  const auth = await requireSession(req);
  if ('response' in auth) return auth.response;
  const who = auth.session.sub;
  const rec = attempts.get(who);
  if (rec && rec.n >= 5 && rec.until > Date.now()) {
    return NextResponse.json({ ok: false, message: 'Too many wrong PINs. Try again in a few minutes.' }, { status: 429 });
  }
  const body = await req.json().catch(() => ({}));
  const ok = await verifyOwnerPin(String(body?.pin ?? ''));
  if (!ok) attempts.set(who, { n: (rec && rec.until > Date.now() ? rec.n : 0) + 1, until: Date.now() + 15 * 60 * 1000 });
  else attempts.delete(who);
  return NextResponse.json({ ok });
}

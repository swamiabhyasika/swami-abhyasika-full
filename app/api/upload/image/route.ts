import { NextRequest, NextResponse } from 'next/server';
import { requireSession } from '@/lib/auth';
import { ImageError, storeImage } from '@/lib/images';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  const auth = await requireSession(req);
  if ('response' in auth) return auth.response;
  const body = await req.json().catch(() => null);
  try {
    return NextResponse.json({ url: await storeImage(body?.image) });
  } catch (e) {
    if (e instanceof ImageError) return NextResponse.json({ message: e.message }, { status: e.status });
    console.error('[api/upload]', e);
    return NextResponse.json({ message: 'Image upload failed. Please try again.' }, { status: 502 });
  }
}

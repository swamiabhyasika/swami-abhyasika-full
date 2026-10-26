import fs from 'node:fs';
import path from 'node:path';
import { NextRequest, NextResponse } from 'next/server';
import { requireSession } from '@/lib/auth';
import { UPLOAD_DIR } from '@/lib/images';

export const runtime = 'nodejs';

const TYPES: Record<string, string> = { jpg: 'image/jpeg', png: 'image/png', webp: 'image/webp' };

/** Serves locally stored photos (only used until Cloudinary is configured). */
export async function GET(req: NextRequest, { params }: { params: Promise<{ file: string }> }) {
  const auth = await requireSession(req);
  if ('response' in auth) return auth.response;
  const { file } = await params;
  if (!/^[a-f0-9]{40}\.(jpg|png|webp)$/.test(file)) return NextResponse.json({ message: 'Not found' }, { status: 404 });
  const full = path.join(UPLOAD_DIR, file);
  if (!fs.existsSync(full)) return NextResponse.json({ message: 'Not found' }, { status: 404 });
  return new NextResponse(new Uint8Array(fs.readFileSync(full)), {
    headers: { 'Content-Type': TYPES[file.split('.')[1]], 'Cache-Control': 'private, max-age=31536000, immutable' },
  });
}

import { NextRequest, NextResponse } from 'next/server';
import { requireOwner, signShortLived } from '@/lib/auth';
import { appOrigin } from '@/lib/app-url';
import { buildAuthUrl, driveConfigured } from '@/lib/backup/drive';

export const runtime = 'nodejs';

/** The "Connect Google Drive" button leads here, and we forward the owner to Google's approval page. */
export async function GET(req: NextRequest) {
  const auth = await requireOwner(req);
  if ('response' in auth) return auth.response;
  if (!driveConfigured()) return NextResponse.redirect(new URL('/settings/backup?drive=not-configured', req.url));
  const state = await signShortLived({ purpose: 'google-drive', sub: auth.session.sub }, 600);
  return NextResponse.redirect(buildAuthUrl(`${appOrigin(req)}/api/google/callback`, state));
}

import { NextRequest, NextResponse } from 'next/server';
import { requireOwner, verifyShortLived } from '@/lib/auth';
import { appOrigin } from '@/lib/app-url';
import { DriveError, connectDrive, exchangeCode } from '@/lib/backup/drive';

export const runtime = 'nodejs';

/** Google sends the owner back here with a one-time `code`; we swap it for permanent access and store it encrypted. */
export async function GET(req: NextRequest) {
  const back = (reason: string) => NextResponse.redirect(new URL(`/settings/backup?drive=${reason}`, req.url));
  const auth = await requireOwner(req);
  if ('response' in auth) return NextResponse.redirect(new URL('/login', req.url));

  const params = req.nextUrl.searchParams;
  if (params.get('error')) return back('denied');
  const state = await verifyShortLived(params.get('state') || '');
  if (!state || state.purpose !== 'google-drive' || state.sub !== auth.session.sub) return back('bad-state');
  const code = params.get('code');
  if (!code) return back('error');

  try {
    const { refreshToken, email } = await exchangeCode(code, `${appOrigin(req)}/api/google/callback`);
    await connectDrive(refreshToken, email);
    return back('connected');
  } catch (e) {
    console.error('[google/callback]', e instanceof DriveError ? e.message : e);
    return back('error');
  }
}

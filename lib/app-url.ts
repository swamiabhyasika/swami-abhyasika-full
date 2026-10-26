import type { NextRequest } from 'next/server';

/** The public address of the app (needed for the Google sign-in return address). Set APP_URL in production. */
export function appOrigin(req: NextRequest): string {
  return (process.env.APP_URL || req.nextUrl.origin).replace(/\/+$/, '');
}

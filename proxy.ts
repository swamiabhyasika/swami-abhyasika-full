import { NextResponse, type NextRequest } from 'next/server';

/** Lets pages know which address was requested (a page cannot read it by itself). */
export function proxy(req: NextRequest) {
  const headers = new Headers(req.headers);
  headers.set('x-pathname', req.nextUrl.pathname + req.nextUrl.search);
  return NextResponse.next({ request: { headers } });
}

export const config = { matcher: ['/((?!_next/static|_next/image|favicon.ico|assets/|app.js|wa-render.js).*)'] };

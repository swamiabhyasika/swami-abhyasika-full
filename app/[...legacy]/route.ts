import fs from 'node:fs';
import path from 'node:path';
import { NextRequest, NextResponse } from 'next/server';
import { readSession } from '@/lib/auth';
import { NAV_ITEMS, legacyPageForPath, normalisePath } from '@/lib/nav';

export const dynamic = 'force-dynamic';

let cached: string | null = null;
function legacyHtml(): string {
  if (cached && process.env.NODE_ENV === 'production') return cached;
  cached = fs.readFileSync(path.join(process.cwd(), 'legacy', 'index.html'), 'utf8');
  return cached;
}

/**
 * Pages that have not been rebuilt in React yet are still served by the original screen.
 * Each address (/students, /library/basement ...) opens that screen directly on the right section.
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ legacy: string[] }> }) {
  const requested = '/' + (await params).legacy.join('/');
  const canonical = normalisePath(requested);
  const item = legacyPageForPath(canonical);
  if (!item) return new NextResponse('Page not found', { status: 404 });
  if (requested !== canonical && requested.replace(/\/+$/, '') !== canonical) {
    return NextResponse.redirect(new URL(canonical, req.url), 308); // /Students → /students
  }

  const session = await readSession(req);
  if (!session) return NextResponse.redirect(new URL('/login', req.url));

  const nav = NAV_ITEMS.map(({ legacy, href, label }) => ({ legacy, href, label }));
  const inject = `<script>window.__NAV__=${JSON.stringify(nav).replace(/</g, '\\u003c')};</script>`;
  const html = legacyHtml()
    .replace('<head>', `<head>${inject}`)
    .replace(/<title>[^<]*<\/title>/, `<title>${item.label} — Swami Abhyasika</title>`);
  return new NextResponse(html, { headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' } });
}

import { NextRequest, NextResponse } from 'next/server';
import { requireSession } from '@/lib/auth';
import { listTemplates } from '@/lib/whatsapp';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const auth = await requireSession(req);
  if ('response' in auth) return auth.response;
  return NextResponse.json({ templates: await listTemplates() });
}

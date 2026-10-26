import type { ReactNode } from 'react';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { AppShell } from '@/components/app-shell';
import { readSessionForPage } from '@/lib/auth';

export const dynamic = 'force-dynamic';

/** Every page in this folder needs a signed-in person who is on the allow-list. */
export default async function AppLayout({ children }: { children: ReactNode }) {
  const { session, needsRefresh } = await readSessionForPage();
  if (!session) {
    const path = (await headers()).get('x-pathname') || '/dashboard';
    redirect(needsRefresh ? `/api/auth/refresh?next=${encodeURIComponent(path)}` : '/login');
  }
  return <AppShell user={{ name: session.username, role: session.role }}>{children}</AppShell>;
}

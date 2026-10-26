'use client';

import { useState, type ReactNode } from 'react';
import { usePathname } from 'next/navigation';
import { Menu, LogOut } from 'lucide-react';
import { NAV, NAV_ITEMS } from '@/lib/nav';
import { NavIcon } from '@/components/nav-icons';
import { ThemeToggle } from '@/components/theme-toggle';
import { Button } from '@/components/ui/button';
import { BackupCatchUp } from '@/components/backup-catch-up';
import { cn } from '@/lib/utils';

/** The most specific sidebar item whose address matches the current page (so /settings/backup highlights Settings). */
function activeId(pathname: string) {
  const hits = NAV_ITEMS.filter((i) => pathname === i.href || pathname.startsWith(i.href + '/'));
  return hits.sort((a, b) => b.href.length - a.href.length)[0]?.id;
}

export function AppShell({ user, children }: { user: { name: string; role: string }; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const active = activeId(pathname);
  const initials = user.name.slice(0, 2).toUpperCase();

  return (
    <div className="flex min-h-screen">
      <BackupCatchUp />
      <a href="#main-content" className="sr-only focus:not-sr-only focus:fixed focus:left-2 focus:top-2 focus:z-[200] focus:rounded-md focus:bg-primary focus:px-3 focus:py-2 focus:text-white">
        Skip to main content
      </a>

      {open && <div className="fixed inset-0 z-[90] bg-black/50 md:hidden" onClick={() => setOpen(false)} aria-hidden="true" />}

      <aside
        id="main-sidebar"
        aria-label="Main navigation"
        className={cn(
          'fixed inset-y-0 left-0 z-[100] flex w-[248px] flex-col border-r bg-card shadow-[4px_0_24px_rgba(0,0,0,0.2)] transition-transform md:translate-x-0',
          open ? 'translate-x-0' : '-translate-x-full',
        )}
      >
        <div className="border-b bg-gradient-to-b from-muted to-card px-[18px] pb-[18px] pt-[22px]">
          <div className="flex items-center gap-[11px]">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/assets/swami-abhyasika-mark.jpg" alt="Swami Abhyasika logo" className="size-9 rounded-[10px] bg-[#faf7ef] object-contain" />
            <div>
              <div className="font-heading text-[15px] font-bold tracking-tight">Swami Abhyasika</div>
              <div className="mt-0.5 text-[10px] uppercase tracking-[0.08em] text-faint">Management System</div>
            </div>
          </div>
        </div>

        <nav className="flex-1 overflow-y-auto p-3">
          {NAV.map((group, gi) => (
            <div key={group.label} className={gi ? 'mt-3' : undefined}>
              <div className="px-2.5 pb-1.5 pt-2.5 text-[9.5px] font-semibold uppercase tracking-[0.12em] text-faint">{group.label}</div>
              {group.items.map((item) => (
                <a
                  key={item.id}
                  href={item.href}
                  aria-current={active === item.id ? 'page' : undefined}
                  className={cn(
                    'mb-0.5 flex items-center gap-2.5 rounded-md px-3 py-[9px] text-[13px] font-medium text-muted-foreground transition hover:bg-muted hover:text-foreground',
                    active === item.id && 'bg-accent text-accent-foreground shadow-[inset_3px_0_0_var(--accent),0_2px_8px_var(--accent-glow)]',
                  )}
                >
                  <NavIcon id={item.id} className="size-[18px] shrink-0" />
                  {item.label}
                </a>
              ))}
            </div>
          ))}
        </nav>

        <div className="border-t bg-gradient-to-t from-muted to-card px-4 py-3.5">
          <div className="flex items-center gap-2.5">
            <div className="grid size-8 shrink-0 place-items-center rounded-full bg-primary text-xs font-bold text-white">{initials}</div>
            <div className="min-w-0 flex-1">
              <div className="truncate text-[13px] font-semibold" title={user.name}>
                {user.name}
              </div>
              <div className="text-[11px] capitalize text-faint">{user.role}</div>
            </div>
            <Button asChild variant="ghost" size="icon" title="Sign out">
              <a href="/api/auth/logout" aria-label="Sign out">
                <LogOut />
              </a>
            </Button>
          </div>
        </div>
      </aside>

      <div id="main-content" tabIndex={-1} className="flex min-h-screen min-w-0 flex-1 flex-col md:ml-[248px]">
        <div className="sticky top-0 z-50 flex h-[62px] items-center justify-between border-b bg-card/95 px-4 backdrop-blur md:px-7">
          <Button variant="ghost" size="icon" className="md:hidden" aria-label="Open navigation menu" aria-controls="main-sidebar" aria-expanded={open} onClick={() => setOpen(true)}>
            <Menu />
          </Button>
          <div className="ml-auto">
            <ThemeToggle />
          </div>
        </div>
        <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-6 md:px-7">{children}</main>
      </div>
    </div>
  );
}

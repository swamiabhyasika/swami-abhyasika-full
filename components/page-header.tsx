import type { ReactNode } from 'react';
import { ArrowLeft } from 'lucide-react';

export function PageHeader({ title, description, back, children }: { title: string; description?: string; back?: { href: string; label: string }; children?: ReactNode }) {
  return (
    <header className="mb-6">
      {back && (
        <a href={back.href} className="mb-3 inline-flex items-center gap-1.5 text-xs font-semibold text-muted-foreground hover:text-foreground">
          <ArrowLeft className="size-3.5" aria-hidden="true" />
          {back.label}
        </a>
      )}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-[22px] font-bold">{title}</h1>
          {description && <p className="mt-1 max-w-2xl text-[13px] text-muted-foreground">{description}</p>}
        </div>
        {children}
      </div>
    </header>
  );
}

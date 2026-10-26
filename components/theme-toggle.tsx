'use client';

import { Moon, Sun } from 'lucide-react';
import { Button } from '@/components/ui/button';

/** Switches light/dark and remembers the choice (the same setting the original screens use). */
export function ThemeToggle() {
  async function toggle() {
    const root = document.documentElement;
    const next = root.getAttribute('data-theme') === 'light' ? 'dark' : 'light';
    root.setAttribute('data-theme', next);
    await fetch('/api/state/edutrack-theme', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ value: next }),
    }).catch(() => {});
  }
  return (
    <Button variant="ghost" size="icon" onClick={toggle} aria-label="Switch between light and dark theme">
      <Sun className="hidden [[data-theme=light]_&]:hidden [[data-theme=dark]_&]:block" />
      <Moon className="hidden [[data-theme=light]_&]:block" />
    </Button>
  );
}

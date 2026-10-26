'use client';

import { useEffect } from 'react';

/** Quietly asks the server to make today's Google Drive backup if it has not happened yet (at most once an hour per browser). */
export function BackupCatchUp() {
  useEffect(() => {
    try {
      const hour = new Date().toISOString().slice(0, 13);
      if (sessionStorage.getItem('swami-catchup') === hour) return;
      sessionStorage.setItem('swami-catchup', hour);
    } catch {}
    fetch('/api/backup/catch-up', { method: 'POST' }).catch(() => {});
  }, []);
  return null;
}

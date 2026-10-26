import { readSessionForPage } from '@/lib/auth';
import { getBackupStatus } from '@/lib/backup/status';
import { PageHeader } from '@/components/page-header';
import { BackupPanel } from './backup-panel';

export const metadata = { title: 'Backup & Restore — Swami Abhyasika' };
export const dynamic = 'force-dynamic';

export default async function BackupPage({ searchParams }: { searchParams: Promise<{ drive?: string }> }) {
  const [status, { session }, query] = await Promise.all([getBackupStatus(), readSessionForPage(), searchParams]);
  return (
    <>
      <PageHeader
        back={{ href: '/settings', label: 'Back to Settings' }}
        title="Backup & Restore"
        description="A backup is a complete copy of your students, payments, seat bookings, settings and photo links. Keep copies in two places: on your device and in Google Drive."
      />
      <BackupPanel status={status} canEdit={session?.role === 'owner'} notice={query.drive} />
    </>
  );
}

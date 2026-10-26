import { readSessionForPage } from '@/lib/auth';
import { listTemplates } from '@/lib/whatsapp';
import { PageHeader } from '@/components/page-header';
import { TemplateEditor } from './template-editor';

export const metadata = { title: 'WhatsApp Message Templates — Swami Abhyasika' };
export const dynamic = 'force-dynamic';

export default async function WhatsAppTemplatesPage() {
  const [templates, { session }] = await Promise.all([listTemplates(), readSessionForPage()]);
  return (
    <>
      <PageHeader
        back={{ href: '/settings', label: 'Back to Settings' }}
        title="WhatsApp Message Templates"
        description="Change the wording of the messages the app sends to students. Put a placeholder like {name} wherever the real value should appear. Changes apply to every message sent from now on."
      />
      <TemplateEditor templates={templates} canEdit={session?.role === 'owner'} />
    </>
  );
}

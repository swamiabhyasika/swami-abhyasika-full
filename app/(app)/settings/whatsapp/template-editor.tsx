'use client';

import { useMemo, useRef, useState } from 'react';
import wa from '@/public/wa-render';
import { validateTemplate, type TemplateRow } from '@/lib/whatsapp-defs';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';

type Status = { kind: 'ok' | 'error'; text: string } | null;

/** Shows *bold* the way WhatsApp does. Text is escaped first, so nothing typed can become HTML. */
function WhatsAppText({ text }: { text: string }) {
  const parts = text.split(/(\*[^*\n]+\*)/g);
  return (
    <>
      {parts.map((part, i) => (part.length > 2 && part.startsWith('*') && part.endsWith('*') ? <strong key={i}>{part.slice(1, -1)}</strong> : <span key={i}>{part}</span>))}
    </>
  );
}

function TemplateCard({ initial, canEdit }: { initial: TemplateRow; canEdit: boolean }) {
  const [saved, setSaved] = useState({ body: initial.body, isCustom: initial.isCustom });
  const [body, setBody] = useState(initial.body);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<Status>(null);
  const area = useRef<HTMLTextAreaElement>(null);

  const dirty = body !== saved.body;
  const check = useMemo(() => validateTemplate(initial.key, body), [initial.key, body]);
  const preview = useMemo(() => wa.render(initial.key, body, Object.fromEntries(initial.placeholders.map((p) => [p.name, p.example]))), [initial, body]);
  const differsFromDefault = body.replace(/\s+$/, '') !== initial.defaultBody;

  function insert(name: string) {
    const el = area.current;
    const token = `{${name}}`;
    if (!el) return setBody((b) => b + token);
    const { selectionStart: a, selectionEnd: z } = el;
    const next = body.slice(0, a) + token + body.slice(z);
    setBody(next);
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(a + token.length, a + token.length);
    });
  }

  async function call(method: 'PUT' | 'DELETE', payload?: object) {
    setBusy(true);
    setStatus(null);
    try {
      const res = await fetch(`/api/templates/${initial.key}`, { method, headers: { 'Content-Type': 'application/json' }, body: payload ? JSON.stringify(payload) : undefined });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.message || 'Could not save. Please try again.');
      return data;
    } finally {
      setBusy(false);
    }
  }

  async function save() {
    try {
      await call('PUT', { body });
      const isCustom = body.replace(/\s+$/, '') !== initial.defaultBody;
      setSaved({ body, isCustom });
      setStatus({ kind: 'ok', text: 'Saved. New messages will use this wording.' });
    } catch (e) {
      setStatus({ kind: 'error', text: e instanceof Error ? e.message : 'Could not save.' });
    }
  }

  async function reset() {
    if (!window.confirm('Go back to the original wording for this message? Your changes will be lost.')) return;
    try {
      await call('DELETE');
      setBody(initial.defaultBody);
      setSaved({ body: initial.defaultBody, isCustom: false });
      setStatus({ kind: 'ok', text: 'Original wording restored.' });
    } catch (e) {
      setStatus({ kind: 'error', text: e instanceof Error ? e.message : 'Could not reset.' });
    }
  }

  const id = `tpl-${initial.key}`;
  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center gap-2">
          <CardTitle>{initial.title}</CardTitle>
          {saved.isCustom ? <Badge variant="default">Customised</Badge> : <Badge variant="secondary">Original wording</Badge>}
          {dirty && <Badge variant="warning">Unsaved changes</Badge>}
        </div>
        <CardDescription>Sent from: {initial.sentWhen}</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-5 lg:grid-cols-2">
        <div className="flex flex-col gap-3">
          <Label htmlFor={id}>Message text</Label>
          <Textarea id={id} ref={area} value={body} onChange={(e) => setBody(e.target.value)} disabled={!canEdit || busy} rows={Math.min(22, Math.max(8, body.split('\n').length + 1))} aria-describedby={`${id}-help`} spellCheck={false} />
          <div id={`${id}-help`}>
            <p className="mb-1.5 text-[11px] text-faint">{canEdit ? 'Click a placeholder to insert it where the cursor is:' : 'Placeholders used by this message:'}</p>
            <div className="flex flex-wrap gap-1.5">
              {initial.placeholders.map((p) => (
                <button
                  key={p.name}
                  type="button"
                  disabled={!canEdit || busy}
                  onClick={() => insert(p.name)}
                  title={`${p.description}${p.optional ? ' — the whole line is left out when this is empty' : ''}`}
                  className={cn('rounded-md border border-border bg-muted px-2 py-1 font-mono text-[11px] text-foreground transition hover:bg-secondary disabled:cursor-default disabled:opacity-70', p.optional && 'border-dashed')}
                >
                  {`{${p.name}}`}
                </button>
              ))}
            </div>
            <p className="mt-1.5 text-[11px] text-faint">Dashed placeholders are optional: if the value is empty, that whole line is left out.</p>
          </div>
          {check.errors.map((m) => (
            <Alert key={m} variant="destructive">
              <AlertDescription>{m}</AlertDescription>
            </Alert>
          ))}
          {check.warnings.map((m) => (
            <Alert key={m} variant="warning">
              <AlertDescription>{m}</AlertDescription>
            </Alert>
          ))}
        </div>

        <div>
          <div className="mb-2 text-xs font-semibold text-muted-foreground">Preview (with example values)</div>
          <div className="max-h-[28rem] overflow-auto rounded-lg bg-[#0b141a] p-3">
            <div className="ml-auto max-w-[92%] whitespace-pre-wrap break-words rounded-lg rounded-tr-none bg-[#005c4b] px-3 py-2 text-[13px] leading-relaxed text-[#e9edef]" aria-label="Message preview">
              <WhatsAppText text={preview} />
            </div>
          </div>
        </div>
      </CardContent>
      <CardFooter className="flex-wrap">
        {canEdit ? (
          <>
            <Button onClick={save} disabled={!dirty || busy || check.errors.length > 0}>
              {busy ? 'Saving…' : 'Save changes'}
            </Button>
            <Button variant="outline" onClick={() => setBody(saved.body)} disabled={!dirty || busy}>
              Undo unsaved changes
            </Button>
            <Button variant="ghost" onClick={reset} disabled={busy || (!saved.isCustom && !differsFromDefault)}>
              Reset to original wording
            </Button>
          </>
        ) : (
          <p className="text-xs text-muted-foreground">Only the owner can change message wording.</p>
        )}
        {status && (
          <span role="status" className={cn('text-xs font-semibold', status.kind === 'ok' ? 'text-success' : 'text-destructive')}>
            {status.text}
          </span>
        )}
      </CardFooter>
    </Card>
  );
}

export function TemplateEditor({ templates, canEdit }: { templates: TemplateRow[]; canEdit: boolean }) {
  return (
    <div className="flex flex-col gap-5">
      {templates.map((t) => (
        <TemplateCard key={t.key} initial={t} canEdit={canEdit} />
      ))}
    </div>
  );
}

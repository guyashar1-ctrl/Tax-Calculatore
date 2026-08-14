// ─── פעילות — צבירה בזמן שאילתה ממקורות קיימים, לא יומן טכני ────────────────
// אין טבלת אירועים חדשה. כל אירוע נגזר ממקור אמת קיים: onboarding_events,
// email_messages, tax_fact_changes (accepted), quotations.events, additional_charges,
// documents.uploaded_at, client.activity (הערות ידניות). ראה docs/prototypes/
// client-case-simplified-exploration-v3-final2.html (#v-log) לקטגוריות ולניסוח.

import { useEffect, useState } from 'react';
import type { Client } from '../types';
import type { OnboardingEvent, OnboardingStep } from '../types/onboarding';
import { EVENT_TYPE_LABELS } from '../types/onboarding';
import type { Quotation } from '../types/quotations';
import { QUOTATION_STATUS_LABELS } from '../types/quotations';
import type { AdditionalCharge } from '../types/charges';
import { formatILS } from '../utils/quotationCalc';
import { supabase } from '../lib/supabase';
import type { EmailMessage } from '../types/emailActivity';

function emailFromDb(row: Record<string, any>): EmailMessage {
  const out: Record<string, any> = {};
  for (const [k, v] of Object.entries(row)) out[k.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase())] = v === null ? undefined : v;
  return out as EmailMessage;
}

export type ActivityCategory = 'mail' | 'tax' | 'docs' | 'commercial' | 'process';

export interface ActivityEvent {
  id: string;
  at: string;
  cat: ActivityCategory;
  title: string;
  meta?: string;
  /** מייל שנשלח — מאפשר "צפייה במייל שנשלח". */
  email?: EmailMessage;
}

interface Inputs {
  client: Client;
  clientSteps: OnboardingStep[];
  events: OnboardingEvent[];
  quotations: Quotation[];
  charges: AdditionalCharge[];
}

export function useClientActivity({ client, clientSteps, events, quotations, charges }: Inputs) {
  const [emails, setEmails] = useState<EmailMessage[]>([]);
  const [taxChanges, setTaxChanges] = useState<{ label: string; newDisplay: string; source: string; decidedAt: string }[]>([]);
  const [docEvents, setDocEvents] = useState<{ fileName: string; label: string; uploadedAt: string }[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!client.id) { setLoading(false); return; }
    let cancelled = false;
    setLoading(true);
    (async () => {
      const [emailRes, taxRes, docRes] = await Promise.all([
        supabase.from('email_messages').select('*').eq('client_id', client.id).order('sent_at', { ascending: false }).limit(100),
        supabase.from('tax_fact_changes').select('label, new_value, source, decided_at')
          .eq('client_id', client.id).eq('status', 'accepted').order('decided_at', { ascending: false }).limit(100),
        supabase.from('documents').select('file_name, description, uploaded_at')
          .eq('client_id', client.id).order('uploaded_at', { ascending: false }).limit(100),
      ]);
      if (cancelled) return;
      setEmails((emailRes.data ?? []).map(emailFromDb));
      setTaxChanges((taxRes.data ?? []).map((r: any) => ({
        label: r.label, newDisplay: r.new_value?.display ?? '', source: r.source, decidedAt: r.decided_at,
      })));
      setDocEvents((docRes.data ?? []).map((r: any) => ({
        fileName: r.file_name, label: r.description || r.file_name, uploadedAt: r.uploaded_at,
      })));
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [client.id]);

  const stepIds = new Set(clientSteps.map(s => s.id));
  const engagementIds = new Set(clientSteps.map(s => s.engagementId).filter(Boolean));
  const clientEvents = events.filter(ev => (ev.stepId && stepIds.has(ev.stepId)) || (ev.engagementId && engagementIds.has(ev.engagementId)));
  const clientQuotations = quotations.filter(q => q.clientId === client.id);
  const clientCharges = charges.filter(c => c.clientId === client.id);

  const items: ActivityEvent[] = [];

  for (const ev of clientEvents) {
    if (ev.type === 'note' && !ev.note) continue;
    items.push({
      id: `ob-${ev.id}`, at: ev.at, cat: 'process',
      title: EVENT_TYPE_LABELS[ev.type] ?? ev.type,
      meta: ev.note || undefined,
    });
  }

  for (const m of emails) {
    items.push({
      id: `mail-${m.id}`, at: m.sentAt ?? m.createdAt ?? '', cat: 'mail',
      title: 'נשלח מייל ללקוח',
      meta: m.subject || undefined,
      email: m,
    });
  }

  for (const t of taxChanges) {
    items.push({
      id: `tax-${t.label}-${t.decidedAt}`, at: t.decidedAt, cat: 'tax',
      title: 'עודכן נתון בתיק המס',
      meta: `${t.label}: ${t.newDisplay}`,
    });
  }

  for (const d of docEvents) {
    items.push({
      id: `doc-${d.fileName}-${d.uploadedAt}`, at: d.uploadedAt, cat: 'docs',
      title: 'נוסף מסמך',
      meta: d.label,
    });
  }

  for (const q of clientQuotations) {
    const qEvents = Array.isArray(q.events) ? q.events as { type: string; at: string; note?: string }[] : [];
    for (const e of qEvents) {
      const title = e.type === 'approved' ? 'הצעת מחיר אושרה'
        : e.type === 'viewed' ? 'הצעת המחיר נצפתה'
        : e.type === 'expired' ? 'הצעת המחיר פגה'
        : `הצעת מחיר — ${QUOTATION_STATUS_LABELS[e.type as keyof typeof QUOTATION_STATUS_LABELS] ?? e.type}`;
      items.push({
        id: `q-${q.id}-${e.type}-${e.at}`, at: e.at, cat: 'commercial',
        title, meta: `${q.quotationNumber ? `#${q.quotationNumber} · ` : ''}${e.note ?? ''}`.trim() || undefined,
      });
    }
    if (q.sentAt) items.push({ id: `q-${q.id}-sent`, at: q.sentAt, cat: 'mail', title: 'נשלחה הצעת מחיר', meta: q.quotationNumber ? `#${q.quotationNumber}` : undefined });
  }

  for (const c of clientCharges) {
    if (c.paidAt) {
      items.push({ id: `charge-paid-${c.id}`, at: c.paidAt, cat: 'commercial', title: 'תשלום סומן כשולם', meta: `${c.description} · ${formatILS(c.amount)}` });
    } else if (c.createdAt) {
      items.push({ id: `charge-created-${c.id}`, at: c.createdAt, cat: 'commercial', title: 'נוסף תשלום עתידי', meta: `${c.description} · ${formatILS(c.amount)}` });
    }
  }

  for (const a of client.activity ?? []) {
    items.push({ id: `note-${a.id}`, at: a.at, cat: 'process', title: a.kind === 'manual' ? a.text : 'הערה', meta: a.kind === 'note' ? a.text : undefined });
  }

  items.sort((a, b) => (b.at || '').localeCompare(a.at || ''));

  return { items, loading };
}

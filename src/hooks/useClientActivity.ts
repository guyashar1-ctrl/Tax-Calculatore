// ─── פעילות — צבירה בזמן שאילתה ממקורות קיימים, לא יומן טכני ────────────────
// אין טבלת אירועים חדשה. כל אירוע נגזר ממקור אמת קיים: onboarding_events,
// email_messages, tax_fact_changes (accepted), quotations.events, additional_charges,
// documents.uploaded_at, client.activity (הערות ידניות). ראה docs/prototypes/
// client-case-simplified-exploration-v3-final2.html (#v-log) לקטגוריות ולניסוח.

import { useEffect, useMemo, useState } from 'react';
import type { Client } from '../types';
import type { OnboardingEvent, OnboardingStep } from '../types/onboarding';
import { EVENT_TYPE_LABELS } from '../types/onboarding';
import { ACTIVITY_LABELS } from '../types/clientWorkspace';
import type { Quotation } from '../types/quotations';
import { QUOTATION_STATUS_LABELS } from '../types/quotations';
import type { AdditionalCharge } from '../types/charges';
import { formatILS } from '../utils/quotationCalc';
import { supabase } from '../lib/supabase';
import { emailActivityView, isInternalEmailKind, type EmailMessage, type EmailRowTone } from '../types/emailActivity';
import { meetingFromDb, meetingWhen, historyTitle, type Meeting } from '../features/meetings/meetingModel';

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
  /** מייל — מאפשר «צפייה במייל». */
  email?: EmailMessage;
  /** מייל שלא יצא כרגיל: כתום (לא ידוע אם יצא) או אדום (לא נשלח / חזר). */
  tone?: EmailRowTone;
  /** מה יודעים ומה עושים — לצד tone. */
  hint?: string;
  /** הכתובת של הלקוח לא קיבלה את המייל — קישור לתיק המס, שם מתקנים אותה. */
  fixAddress?: boolean;
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
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!client.id) { setLoading(false); return; }
    let cancelled = false;
    setLoading(true);
    (async () => {
      // ‼ פגישות: של הכרטיס, וגם של הליד שממנו נולד — שיחת ההיכרות לפני ההצעה היא חלק מהסיפור.
      const meetingFilter = client.mergedFromLeadId
        ? `client_id.eq.${client.id},lead_id.eq.${client.mergedFromLeadId}`
        : `client_id.eq.${client.id}`;
      const [emailRes, taxRes, docRes, meetingRes] = await Promise.all([
        supabase.from('email_messages').select('*').eq('client_id', client.id).order('sent_at', { ascending: false }).limit(100),
        supabase.from('tax_fact_changes').select('label, new_value, source, decided_at')
          .eq('client_id', client.id).eq('status', 'accepted').order('decided_at', { ascending: false }).limit(100),
        supabase.from('documents').select('file_name, description, uploaded_at')
          .eq('client_id', client.id).order('uploaded_at', { ascending: false }).limit(100),
        supabase.from('meetings').select('*').or(meetingFilter).order('starts_at', { ascending: false }).limit(50),
      ]);
      if (cancelled) return;
      setEmails((emailRes.data ?? []).map(emailFromDb));
      setTaxChanges((taxRes.data ?? []).map((r: any) => ({
        label: r.label, newDisplay: r.new_value?.display ?? '', source: r.source, decidedAt: r.decided_at,
      })));
      setDocEvents((docRes.data ?? []).map((r: any) => ({
        fileName: r.file_name, label: r.description || r.file_name, uploadedAt: r.uploaded_at,
      })));
      setMeetings((meetingRes.data ?? []).map(meetingFromDb));
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [client.id, client.mergedFromLeadId]);

  // ‼ הצבירה ממוזכרת על הקלטים: קודם היא רצה מחדש בכל רינדור של הלשונית
  // (כולל כל פעימה חיה), מיינה מאות שורות והחזירה מערך חדש לכל צרכן.
  const items = useMemo<ActivityEvent[]>(() => {
  const stepIds = new Set(clientSteps.map(s => s.id));
  const engagementIds = new Set(clientSteps.map(s => s.engagementId).filter(Boolean));
  const clientEvents = events.filter(ev => (ev.stepId && stepIds.has(ev.stepId)) || (ev.engagementId && engagementIds.has(ev.engagementId)));
  const clientQuotations = quotations.filter(q => q.clientId === client.id);
  const clientCharges = charges.filter(c => c.clientId === client.id);

  const items: ActivityEvent[] = [];
  // ‼ התראה למשרד אינה תקשורת עם הלקוח — מקומה ביומן המיילים של המשרד (כמו ClientEmailsSection).
  const clientEmails = emails.filter(m => !isInternalEmailKind(m.kind));
  const emailIds = new Set(clientEmails.map(m => m.id));

  for (const ev of clientEvents) {
    // ‼ בדיקה לא-ריקה בלי trim מחמיצה מחרוזת רווח/שורה בלבד — "אמת" בבדיקת
    // Boolean, אבל ריקה בעין. אותה שורה "הערה · תהליך" בלי שום תוכן.
    // ראה docs/UX-CONVERGENCE-AUDIT-2026-08.md §12/§21 Phase 8.
    if (ev.type === 'note' && !ev.note?.trim()) continue;
    // ‼ record_email_sent רושם גם אירוע «מייל נשלח» (meta.emailId). המייל עצמו כבר בציר —
    // עם המצב האמיתי שלו (חזר / לא ידוע); אירוע שני היה ממשיך לומר «נשלח».
    if (ev.type === 'email_sent' && emailIds.has(String(ev.meta?.emailId ?? ''))) continue;
    items.push({
      id: `ob-${ev.id}`, at: ev.at, cat: 'process',
      title: EVENT_TYPE_LABELS[ev.type] ?? ev.type,
      meta: ev.note?.trim() || undefined,
    });
  }

  for (const m of clientEmails) {
    // ‼ CLAUDE.md §9: «נשלח» רק עם ראיה — הכותרת לפי המצב שביומן (emailActivityView).
    const view = emailActivityView(m, { email: client.email, spouseEmail: client.spouseEmail });
    items.push({
      id: `mail-${m.id}`, at: m.sentAt ?? m.createdAt ?? '', cat: 'mail',
      title: view.title,
      meta: m.subject || undefined,
      email: m,
      ...(view.tone !== 'normal' ? { tone: view.tone, hint: view.hint } : {}),
      ...(view.fixAddressInTaxFile ? { fixAddress: true } : {}),
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
        : `הצעת מחיר - ${QUOTATION_STATUS_LABELS[e.type as keyof typeof QUOTATION_STATUS_LABELS] ?? e.type}`;
      items.push({
        id: `q-${q.id}-${e.type}-${e.at}`, at: e.at, cat: 'commercial',
        title, meta: `${q.quotationNumber ? `#${q.quotationNumber} · ` : ''}${e.note ?? ''}`.trim() || undefined,
      });
    }
    if (q.sentAt) items.push({ id: `q-${q.id}-sent`, at: q.sentAt, cat: 'mail', title: 'נשלחה הצעת מחיר', meta: q.quotationNumber ? `#${q.quotationNumber}` : undefined });
  }

  // ‼ «נשלח זימון» רק עם ראיה: רישום 'sent' נכתב בשרת רק אחרי ש-Google קיבל (225).
  for (const m of meetings) {
    const when = meetingWhen(m).label;
    for (const h of m.history) {
      const at = h.kind === 'moved' && h.to ? meetingWhen({ startsAt: h.to, durationMin: m.durationMin }).label : when;
      items.push({ id: `meet-${m.id}-${h.kind}-${h.at}`, at: h.at, cat: 'mail', title: historyTitle(h), meta: `${m.title} · ${at}` });
    }
  }

  for (const c of clientCharges) {
    if (c.paidAt) {
      items.push({ id: `charge-paid-${c.id}`, at: c.paidAt, cat: 'commercial', title: 'תשלום סומן כשולם', meta: `${c.description} · ${formatILS(c.amount)}` });
    } else if (c.createdAt) {
      items.push({ id: `charge-created-${c.id}`, at: c.createdAt, cat: 'commercial', title: 'נוסף תשלום עתידי', meta: `${c.description} · ${formatILS(c.amount)}` });
    }
  }

  // ‼ באג ממשי שנחשף בבדיקת דפדפן: הקוד טיפל רק ב-2 מתוך 6 סוגי kind
  // (note/manual) — task_created/task_completed/doc_uploaded/status_change
  // נפלו כולם לכותרת גנרית "הערה" ו-a.text נזרק (meta=undefined), למרות
  // שיש כבר ACTIVITY_LABELS לכל ששת הסוגים. זו הייתה השורה הריקה "הערה ·
  // תהליך" שנראתה בדף — לא הערה ריקה, אלא אירוע אחר לגמרי שאיבד את תוכנו.
  // manual עדיין מציג את הטקסט ככותרת (זה כל האירוע); שאר הסוגים מציגים
  // את שם הסוג ככותרת ואת a.text כפירוט. ראה docs/UX-CONVERGENCE-AUDIT-2026-08.md §12/§21 Phase 8.
  for (const a of client.activity ?? []) {
    if (!a.text || !a.text.trim()) continue;
    items.push({
      // «מסמך חדש» — בסינון «מסמכים», לא עם הבקשות והמשימות.
      id: `note-${a.id}`, at: a.at, cat: a.kind === 'doc_uploaded' ? 'docs' : 'process',
      title: a.kind === 'manual' ? a.text : (ACTIVITY_LABELS[a.kind] ?? 'הערה'),
      meta: a.kind === 'manual' ? undefined : a.text,
    });
  }

  items.sort((a, b) => (b.at || '').localeCompare(a.at || ''));
  return items;
  }, [client.id, client.email, client.spouseEmail, client.activity, clientSteps, events, quotations, charges, emails, taxChanges, docEvents, meetings]);

  return { items, loading };
}

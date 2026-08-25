// ─── בונה הצעות המחיר ───────────────────────────────────────────────────────
// מקור UX מחייב: docs/prototypes/quotation-builder-exception-based.html
//
// "ההצעה כבר מוכנה — אני עורך רק חריגות."
//
// המסך הוא מסמך ולא טופס: במנוחה אין בו אף שדה קלט. התבנית טוענת את הכול,
// והמסך מציג תוצאה — מספר אחד גדול, רשימה שמסבירה אותו, משפט אחד על ההשלכה,
// ושתי שורות שקטות. כל מספר נערך בלחיצה עליו, בחלונית עם החלטה אחת בלבד.
// המכניקה החשבונאית (שנתי ÷ 12, פריסה, הנחות פר-שורה) יושבת ב«עריכת השירותים»,
// ומע״מ מפורט מופיע רק בסקירה לפני השליחה.
//
// ‼ שינוי התנהגות מכוון: שירות שנתי בשכר החודשי נפתח כ-'deferred' ולא 'full'.
// התרומה החודשית נשארת שנתי ÷ 12 גם כשמתחילים באמצע שנה, והשארית נגבית
// במועד. פריסה מלאה על פחות חודשים העלתה את התשלום החודשי — ההפך ממה שסוכם.
//
// ‼ הנחה על השכר החודשי אינה נוגעת ביתרת הדוח השנתי: היא מחולקת בין השורות
// החודשיות שאינן שנתיות-במהותן בלבד. הפחתת היתרה היא החלטה נפרדת ומפורשת
// (popCompletion). ראה גם הרצפה ב-applyAgreedMonthly.

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { FirmProfile } from '../../types/firmProfile';
import type { Client } from '../../types';
import type { Engagement } from '../../types/onboarding';
import type {
  Lead, ServiceCatalogItem, ServiceCategory, QuotationTemplate, Quotation, QuotationItem,
  FutureService, QuotationRepresentation, QuotationKind,
} from '../../types/quotations';
import {
  DEFAULT_VAT_RATE, DEFAULT_EXPIRY_BUSINESS_DAYS, DEFAULT_INSTALLMENTS,
  defaultQuotationRepresentation,
} from '../../types/quotations';
import { businessDaysExpiry } from '../../utils/businessDays';
import {
  calcTotals, formatILS, itemFinalPrice, itemOriginalPrice, itemDisplayName,
  clampInstallments, currentMonthKey, monthsLeftInYear, formatMonthRange,
  addMonths, deferredBase, itemDeferred, DEFAULT_DEFERRED_TRIGGER,
} from '../../utils/quotationCalc';
import { deriveQuotationBrand } from './quotationBranding';
import { generateQuotationPdf, downloadPdf } from '../../utils/quotationPdf';
import QuotationWebView from './QuotationWebView';
import QuotationEmailsPanel from './QuotationEmailsPanel';
import QuotationRepresentationEditor, {
  validateQuotationRepresentation, representationSummary,
} from './QuotationRepresentationEditor';
import Modal from '../ui/Modal';

const MONTH_NAMES = ['ינואר', 'פברואר', 'מרץ', 'אפריל', 'מאי', 'יוני',
  'יולי', 'אוגוסט', 'ספטמבר', 'אוקטובר', 'נובמבר', 'דצמבר'];

const DEFERRED_TRIGGERS = [DEFAULT_DEFERRED_TRIGGER, 'עם הגשת הצהרת ההון', 'עם סיום הביקורת'];

const YEAR_OPTIONS: number[] = (() => {
  const y = new Date().getFullYear();
  return Array.from({ length: 8 }, (_, i) => y - i);
})();

interface RecipientDraft {
  kind: 'lead' | 'client' | 'new';
  id?: string;
  fullName: string;
  businessName?: string;
  email?: string;
  phone?: string;
  dealerType?: Lead['dealerType'];
  hasPreviousAccountant?: boolean;
  prevAccountantName?: string;
  prevAccountantEmail?: string;
  prevAccountantPhone?: string;
}

function isTransferRecipient(r: RecipientDraft, leads: Lead[], clients: Client[]): boolean {
  if (r.kind === 'lead') return !!leads.find(l => l.id === r.id)?.hasPreviousAccountant;
  if (r.kind === 'client') return !!clients.find(c => c.id === r.id)?.hasPreviousAccountant;
  return !!r.hasPreviousAccountant;
}

interface Props {
  profile: FirmProfile | null;
  services: ServiceCatalogItem[];
  templates: QuotationTemplate[];
  leads: Lead[];
  clients: Client[];
  existing?: Quotation | null;
  initialLeadId?: string;
  initialClientId?: string;
  initialKind?: QuotationKind;
  currentEngagement?: Engagement;
  existingQuotations: Quotation[];
  checkRepEmailConflict?: (email: string) => string | null;
  onSaveDraft: (payload: SaveDraftPayload) => Promise<void>;
  onSend: (payload: SaveDraftPayload, isTest: boolean) => Promise<{ ok: boolean; error?: string; link?: string }>;
  onBack: () => void;
}

export interface SaveDraftPayload {
  id?: string;
  recipient: RecipientDraft;
  items: QuotationItem[];
  futureServices: FutureService[];
  vatRate: number;
  emailSubject: string;
  emailMessage: string;
  notesForClient: string;
  internalNotes: string;
  templateId?: string;
  expiresAt: string;
  representation: QuotationRepresentation;
  kind: QuotationKind;
  effectiveFrom?: string;
}

interface BillingPlan { startMonth: string; installments: number }

const r2 = (n: number) => Math.round(n * 100) / 100;
const r0 = (n: number) => Math.round(n);
const monthLabel = (ym: string) => {
  const [y, m] = ym.split('-').map(Number);
  return `${MONTH_NAMES[m - 1]} ${y}`;
};

/** האם השורה שנתית-במהותה — כלומר תרומתה החודשית נגזרת ממחיר שנתי. */
const isAnnualNature = (i: QuotationItem) => i.category === 'monthly' && i.priceBasis === 'annual';

/**
 * שירות מהקטלוג → שורה בהצעה.
 * ‼ שירות שנתי נכנס כשורה חודשית שמתומחרת שנתית ונדחית: התרומה החודשית היא
 * תמיד שנתי ÷ 12, וההפרש נגבה במועד. זו ברירת המחדל המאושרת.
 */
function catalogToItem(svc: ServiceCatalogItem, overrides?: Partial<QuotationItem>): QuotationItem {
  const base: QuotationItem = {
    id: crypto.randomUUID(),
    serviceId: svc.id,
    name: svc.name,
    description: svc.description,
    category: svc.category,
    billingType: svc.billingType,
    unitLabel: svc.unitLabel,
    quantity: 1,
    catalogPrice: svc.defaultPrice,
    clientPrice: svc.defaultPrice,
    vatFlag: svc.vatFlag,
    ...overrides,
  };
  if (base.category === 'annual' && overrides?.priceBasis === undefined) {
    return {
      ...base,
      category: 'monthly',
      priceBasis: 'annual',
      annualPrice: base.clientPrice,
      clientPrice: r2(base.clientPrice / DEFAULT_INSTALLMENTS),
      prorationMode: 'deferred',
    };
  }
  return base;
}

/** החלת הפריסה על שורה חודשית. שורה נדחית שומרת על שנתי ÷ 12. */
function applyPlanToItem(it: QuotationItem, plan: BillingPlan): QuotationItem {
  if (it.category !== 'monthly') return it;
  const next: QuotationItem = {
    ...it,
    priceBasis: it.priceBasis ?? 'monthly',
    billingStartMonth: plan.startMonth,
    installments: plan.installments,
  };
  if (it.prorationMode === 'manual') return next;
  if (next.priceBasis === 'annual' && it.annualPrice != null) {
    if (it.prorationMode === 'full') {
      next.clientPrice = r2(it.annualPrice / plan.installments);
    } else {
      next.prorationMode = 'deferred';
      next.clientPrice = r2(it.annualPrice / DEFAULT_INSTALLMENTS);
    }
  }
  return next;
}

/* ─── חישוב העסקה — מה שהמסך מציג ─────────────────────────────────────────── */
interface Deal {
  installments: number;
  monthlyLines: QuotationItem[];
  separateLines: QuotationItem[];
  includedLines: QuotationItem[];
  retainer: number;
  anchor: number;
  discount: number;
  balances: { item: QuotationItem; name: string; value: number; perMonth: number; balance: number }[];
  rawBalance: number;
  completionCharge: number;
  trigger: string;
  endMonth: string;
}

function computeDeal(items: QuotationItem[], plan: BillingPlan, vatRate: number): Deal {
  const monthlyLines = items.filter(i => i.category === 'monthly');
  const separateLines = items.filter(i => i.category === 'annual' || i.category === 'one_time');
  const includedLines = items.filter(i => i.category === 'included');

  const retainer = monthlyLines.reduce((s, i) => s + itemFinalPrice(i), 0);
  const anchor = monthlyLines.reduce((s, i) => s + itemOriginalPrice(i), 0);

  const balances = monthlyLines
    .map(i => ({ item: i, base: deferredBase(i) }))
    .filter((x): x is { item: QuotationItem; base: NonNullable<ReturnType<typeof deferredBase>> } => !!x.base)
    .filter(x => x.base.balance >= 1)
    .map(x => ({
      item: x.item,
      name: itemDisplayName(x.item),
      value: x.base.totalValue,
      perMonth: x.base.perPayment,
      balance: x.base.balance,
    }));

  const rawBalance = balances.reduce((s, b) => s + b.balance, 0);
  const completionCharge = balances.reduce((s, b) => {
    const d = itemDeferred(b.item, vatRate);
    return s + (d ? d.finalAmount : 0);
  }, 0);

  const first = balances[0]?.item;
  const trigger = first?.deferredTrigger?.trim() || DEFAULT_DEFERRED_TRIGGER;

  return {
    installments: plan.installments,
    monthlyLines, separateLines, includedLines,
    retainer: r2(retainer), anchor: r2(anchor), discount: Math.max(0, r2(anchor - retainer)),
    balances, rawBalance: r2(rawBalance), completionCharge: r2(completionCharge),
    trigger,
    endMonth: addMonths(plan.startMonth, plan.installments - 1),
  };
}

/* ─── פופאובר הקשרי ───────────────────────────────────────────────────────── */
type PopKind = 'price' | 'start' | 'completion' | 'template' | 'oneTime' | null;

function Pop({ anchor, onClose, children }: {
  anchor: HTMLElement | null; onClose: () => void; children: React.ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);
  const narrow = typeof window !== 'undefined' && window.innerWidth <= 680;

  useLayoutEffect(() => {
    if (narrow || !anchor || !ref.current) return;
    const r = anchor.getBoundingClientRect();
    const w = ref.current.offsetWidth, h = ref.current.offsetHeight;
    const left = Math.max(12, Math.min(r.right - w, window.innerWidth - w - 12));
    let top = r.bottom + window.scrollY + 8;
    if (r.bottom + h + 20 > window.innerHeight) top = r.top + window.scrollY - h - 8;
    setPos({ left, top: Math.max(12, top) });
  }, [anchor, narrow]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <>
      <div className="qb-scrim" onClick={onClose} />
      <div ref={ref} className="qb-pop" role="dialog"
        style={narrow ? undefined : { left: pos?.left ?? -9999, top: pos?.top ?? -9999 }}>
        {children}
      </div>
    </>
  );
}

/* ═══ הבונה ═══════════════════════════════════════════════════════════════ */
export default function QuotationBuilder({
  profile, services, templates, leads, clients, existing, initialLeadId, initialClientId,
  initialKind, currentEngagement, existingQuotations, checkRepEmailConflict,
  onSaveDraft, onSend, onBack,
}: Props) {
  const brand = useMemo(() => deriveQuotationBrand(profile), [profile]);

  const initialRecipient: RecipientDraft = (() => {
    const fromClient = (c: Client): RecipientDraft => ({
      kind: 'client', id: c.id, fullName: `${c.firstName} ${c.lastName}`.trim(),
      businessName: c.businessName, email: c.email, phone: c.phone,
    });
    const fromLead = (l: Lead): RecipientDraft => ({
      kind: 'lead', id: l.id, fullName: l.fullName, businessName: l.businessName,
      email: l.email, phone: l.phone, dealerType: l.dealerType,
    });
    if (existing?.leadId) { const l = leads.find(x => x.id === existing.leadId); if (l) return fromLead(l); }
    if (existing?.clientId) { const c = clients.find(x => x.id === existing.clientId); if (c) return fromClient(c); }
    if (initialLeadId) { const l = leads.find(x => x.id === initialLeadId); if (l) return fromLead(l); }
    if (initialClientId) { const c = clients.find(x => x.id === initialClientId); if (c) return fromClient(c); }
    return { kind: 'new', fullName: '' };
  })();

  const kind: QuotationKind = existing?.kind ?? initialKind ?? 'engagement';
  const isRenewal = kind === 'engagement' && !!currentEngagement && !existing;

  const nextJanuary = `${new Date().getFullYear() + 1}-01-01`;

  const [recipient, setRecipient] = useState<RecipientDraft>(initialRecipient);
  const [effectiveFrom, setEffectiveFrom] = useState<string | undefined>(
    existing?.effectiveFrom ?? (kind === 'engagement' && currentEngagement ? nextJanuary : undefined));

  const initialPlan: BillingPlan = (() => {
    const m = (existing?.items ?? []).find(i => i.category === 'monthly' && !!i.billingStartMonth);
    if (m) return { startMonth: m.billingStartMonth!, installments: clampInstallments(m.installments) };
    if (isRenewal) {
      const start = (effectiveFrom ?? nextJanuary).slice(0, 7);
      return { startMonth: start, installments: DEFAULT_INSTALLMENTS };
    }
    const start = currentMonthKey();
    return { startMonth: start, installments: monthsLeftInYear(start) };
  })();
  const [plan, setPlan] = useState<BillingPlan>(initialPlan);

  /** חידוש מתחיל מההסכם הנוכחי; הצעה חדשה מתחילה מהתבנית של סוג העוסק. */
  const startingTemplateId = (() => {
    if (existing?.templateId) return existing.templateId;
    const active = templates.filter(t => t.active);
    const byKind = initialRecipient.dealerType === 'exempt' ? 'exempt_dealer'
      : initialRecipient.dealerType === 'company' ? 'company'
      : initialRecipient.dealerType === 'licensed' ? 'licensed_dealer' : undefined;
    return (byKind && active.find(t => t.kind === byKind)?.id) ?? active[0]?.id;
  })();

  const [templateId, setTemplateId] = useState<string | undefined>(startingTemplateId);

  const initialItems: QuotationItem[] = (() => {
    if (existing) return existing.items;
    if (isRenewal) {
      const src = existingQuotations.find(q => q.id === currentEngagement?.quotationId);
      const base = (src?.snapshot?.items ?? src?.items ?? []) as QuotationItem[];
      if (base.length) {
        return base.map(it => applyPlanToItem({ ...it, id: crypto.randomUUID() }, initialPlan));
      }
    }
    if (kind === 'one_time') return [];
    const tpl = templates.find(t => t.id === startingTemplateId);
    if (!tpl) return [];
    return tpl.serviceIds
      .map(sid => services.find(s => s.id === sid))
      .filter((s): s is ServiceCatalogItem => !!s)
      .map(s => applyPlanToItem(catalogToItem(s), initialPlan));
  })();

  const [items, setItems] = useState<QuotationItem[]>(initialItems);

  /** מחירון "אם וכאשר" — ברירת המחדל מגיעה מהתבנית, לא מכל הקטלוג. */
  const [futureIds, setFutureIds] = useState<Set<string>>(() => {
    if (existing) return new Set((existing.futureServices ?? []).map(f => f.serviceId).filter((v): v is string => !!v));
    const tpl = templates.find(t => t.id === startingTemplateId);
    const used = new Set(initialItems.map(i => i.serviceId).filter(Boolean));
    return new Set((tpl?.futureServiceIds ?? []).filter(id => !used.has(id)));
  });

  const [vatRate] = useState<number>(existing?.vatRate ?? DEFAULT_VAT_RATE);
  const [emailSubject, setEmailSubject] = useState(existing?.emailSubject ?? 'הצעת מחיר מהמשרד');
  const [emailMessage, setEmailMessage] = useState(existing?.emailMessage || existing?.notesForClient || '');
  const [internalNotes, setInternalNotes] = useState(existing?.internalNotes ?? '');
  const [expiresAt, setExpiresAt] = useState(existing?.expiresAt ?? businessDaysExpiry(DEFAULT_EXPIRY_BUSINESS_DAYS));
  const [representation, setRepresentation] = useState<QuotationRepresentation>(() => {
    if (existing?.representation) return existing.representation;
    const base = defaultQuotationRepresentation(isTransferRecipient(initialRecipient, leads, clients));
    // ‼ כל הצעה נפתחת עם ייצוג מלא (הכרעת גיא 2026-08-25) — גם חד־פעמית וגם
    // ללקוח קיים. היחיד שנפתח כבוי הוא לקוח שכבר מיוצג: אין מה לפתוח פעמיים.
    const already = initialRecipient.kind === 'client'
      && !!clients.find(c => c.id === initialRecipient.id)?.representationStatus;
    return already ? { ...base, enabled: false } : base;
  });

  // ── מצב מסך ──
  const [pop, setPop] = useState<{ kind: PopKind; anchor: HTMLElement | null; itemId?: string }>({ kind: null, anchor: null });
  const [panel, setPanel] = useState<'services' | 'future' | 'rep' | 'review' | 'recipient' | null>(null);
  const [saving, setSaving] = useState(false);
  const [sending, setSending] = useState<'test' | 'send' | null>(null);
  const [notice, setNotice] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);

  const deal = useMemo(() => computeDeal(items, plan, vatRate), [items, plan, vatRate]);
  const totals = useMemo(() => calcTotals(items, vatRate), [items, vatRate]);

  const closePop = () => setPop({ kind: null, anchor: null });
  const openPop = (k: PopKind, e: React.MouseEvent, itemId?: string) =>
    setPop({ kind: k, anchor: e.currentTarget as HTMLElement, itemId });

  const futureServices: FutureService[] = useMemo(() => {
    const used = new Set(items.map(i => i.serviceId).filter(Boolean));
    return services
      .filter(s => s.active && futureIds.has(s.id) && !used.has(s.id))
      .map(s => ({
        id: s.id, serviceId: s.id, name: s.name, description: s.description,
        category: s.category, price: s.defaultPrice, vatFlag: s.vatFlag,
        billingType: s.billingType, unitLabel: s.unitLabel,
      }));
  }, [services, futureIds, items]);

  /* ─── עריכות ─────────────────────────────────────────────────────────────── */

  function updatePlan(patch: Partial<BillingPlan>) {
    const next: BillingPlan = {
      ...plan, ...patch,
      installments: clampInstallments(patch.installments ?? plan.installments),
    };
    setPlan(next);
    setItems(prev => prev.map(it => applyPlanToItem(it, next)));
  }

  /**
   * מחיר שסוכם לשכר החודשי. ההפרש מחולק יחסית בין השורות החודשיות שאינן
   * שנתיות-במהותן — כך שיתרת הדוח השנתי אינה משתנה (הכרעה מאושרת).
   * הרצפה היא סכום התרומות השנתיות; מתחתיה אי אפשר לרדת בלי לגעת בדוח.
   */
  function applyAgreedMonthly(target: number) {
    const fixed = items.filter(isAnnualNature).reduce((s, i) => s + itemFinalPrice(i), 0);
    const flexible = items.filter(i => i.category === 'monthly' && !isAnnualNature(i));
    const flexOriginal = flexible.reduce((s, i) => s + itemOriginalPrice(i), 0);
    if (flexible.length === 0 || flexOriginal <= 0) return;
    const wanted = Math.max(fixed, target) - fixed;
    const ratio = Math.min(1, Math.max(0, wanted / flexOriginal));
    setItems(prev => prev.map(it => {
      if (it.category !== 'monthly' || isAnnualNature(it)) return it;
      return { ...it, discountPercent: r2((1 - ratio) * 100) };
    }));
  }

  function clearAgreedMonthly() {
    setItems(prev => prev.map(it =>
      it.category === 'monthly' && !isAnnualNature(it) ? { ...it, discountPercent: 0 } : it));
  }

  function setCompletion(patch: { mode?: 'charge' | 'reduce' | 'waive'; amount?: number | null; trigger?: string }) {
    setItems(prev => prev.map(it => {
      if (it.prorationMode !== 'deferred') return it;
      const base = deferredBase(it);
      if (!base) return it;
      const next = { ...it };
      if (patch.trigger !== undefined) {
        next.deferredTrigger = patch.trigger === DEFAULT_DEFERRED_TRIGGER ? undefined : patch.trigger;
      }
      if (patch.mode === 'charge') { next.deferredChargeAmount = undefined; next.deferredDiscount = undefined; }
      if (patch.mode === 'waive') { next.deferredChargeAmount = 0; }
      if (patch.amount !== undefined && patch.amount !== null) {
        next.deferredChargeAmount = Math.max(0, Math.min(patch.amount, base.balance));
      }
      return next;
    }));
  }

  function applyTemplate(id: string) {
    const tpl = templates.find(t => t.id === id);
    if (!tpl) return;
    if (items.length > 0 && !window.confirm('החלפת תבנית תבנה את ההצעה מחדש. להמשיך?')) return;
    setTemplateId(id);
    const svc = tpl.serviceIds.map(sid => services.find(s => s.id === sid)).filter((s): s is ServiceCatalogItem => !!s);
    const next = svc.map(s => applyPlanToItem(catalogToItem(s), plan));
    setItems(next);
    const used = new Set(next.map(i => i.serviceId).filter(Boolean));
    setFutureIds(new Set((tpl.futureServiceIds ?? []).filter(fid => !used.has(fid))));
    closePop();
  }

  function updateItem(id: string, patch: Partial<QuotationItem>) {
    setItems(prev => prev.map(it => (it.id === id ? applyPlanToItem({ ...it, ...patch }, plan) : it)));
  }
  function removeItem(id: string) { setItems(prev => prev.filter(it => it.id !== id)); }
  function addService(svc: ServiceCatalogItem, overrides?: Partial<QuotationItem>) {
    setItems(prev => [...prev, applyPlanToItem(catalogToItem(svc, overrides), plan)]);
    setFutureIds(prev => { const n = new Set(prev); n.delete(svc.id); return n; });
  }

  /* ─── שמירה ושליחה ───────────────────────────────────────────────────────── */

  function representationWithRecipient(): QuotationRepresentation {
    if (!representation.enabled) return representation;
    const parts = recipient.fullName.trim().split(/\s+/).filter(Boolean);
    const email = recipient.email?.trim();
    return {
      ...representation,
      prefill: {
        ...representation.prefill,
        ...(parts[0] ? { firstName: parts[0] } : {}),
        ...(parts.length > 1 ? { lastName: parts.slice(1).join(' ') } : {}),
        ...(email ? { email } : {}),
      },
    };
  }

  function buildPayload(): SaveDraftPayload {
    return {
      id: existing?.id,
      recipient, items, futureServices, vatRate,
      emailSubject, emailMessage, notesForClient: emailMessage, internalNotes,
      templateId, expiresAt,
      representation: representationWithRecipient(),
      kind,
      effectiveFrom: kind === 'engagement' && currentEngagement ? effectiveFrom : undefined,
    };
  }

  async function handleSave() {
    if (!recipient.fullName.trim()) { setPanel('recipient'); return; }
    setSaving(true);
    try {
      await onSaveDraft(buildPayload());
      setSavedAt(Date.now());
    } catch (e) {
      setNotice({ kind: 'err', text: e instanceof Error ? e.message : 'שמירה נכשלה' });
    } finally { setSaving(false); }
  }

  function sendBlocker(isTest: boolean): string | null {
    if (!recipient.fullName.trim()) return 'צריך לבחור למי ההצעה.';
    if (!isTest && !recipient.email?.trim()) return 'לנמען אין כתובת מייל - אי אפשר לשלוח.';
    if (items.length === 0) return 'אין שירותים בהצעה.';
    if (items.some(i => !i.name.trim())) return 'יש שורה בלי שם.';
    const rep = validateQuotationRepresentation(representation);
    return rep ? `ייצוג: ${rep}` : null;
  }

  async function handleSend(isTest: boolean) {
    const blocker = sendBlocker(isTest);
    if (blocker) { setNotice({ kind: 'err', text: blocker }); if (!recipient.fullName.trim()) setPanel('recipient'); return; }
    setSending(isTest ? 'test' : 'send');
    setNotice(null);
    try {
      const res = await onSend(buildPayload(), isTest);
      if (res.ok) {
        setNotice({ kind: 'ok', text: isTest ? 'מייל בדיקה נשלח אליך.' : 'ההצעה נשלחה ללקוח.' });
        if (!isTest) setTimeout(onBack, 900);
      } else {
        setNotice({ kind: 'err', text: `השליחה נכשלה: ${res.error ?? 'שגיאה'}` });
      }
    } finally { setSending(null); }
  }

  async function downloadPreviewPdf() {
    const bytes = await generateQuotationPdf({
      quotationNumber: existing?.quotationNumber ?? 'טיוטה',
      recipientName: recipient.fullName || 'הלקוח',
      businessName: recipient.businessName,
      items, futureServices, vatRate, notesForClient: emailMessage, expiresAt,
      representation: representationWithRecipient(),
    }, brand);
    downloadPdf(bytes, `הצעת מחיר ${existing?.quotationNumber ?? 'טיוטה'}.pdf`);
  }

  /* ─── הצעה שכבר נשלחה — מעקב ─────────────────────────────────────────────── */
  if (existing && existing.status !== 'draft') {
    return <SentQuotation quotation={existing} brand={brand} onBack={onBack} />;
  }

  const tpl = templates.find(t => t.id === templateId);
  const repConflict = representation.enabled && recipient.kind !== 'client' && recipient.email
    ? checkRepEmailConflict?.(recipient.email) ?? null : null;
  const openWarning = recipient.id
    ? existingQuotations.find(q => q.id !== existing?.id && (q.leadId === recipient.id || q.clientId === recipient.id)
        && ['draft', 'sent', 'viewed'].includes(q.status))
    : undefined;

  const instTxt = deal.installments === 12 ? '12 תשלומים'
    : deal.installments === 1 ? 'תשלום אחד השנה'
    : `${deal.installments} תשלומים השנה`;

  return (
    <div className="qb" dir="rtl">
      {/* פס עליון — פעולה ראשית אחת */}
      <div className="qb-top">
        <button className="qb-back" onClick={onBack}>→ חזרה</button>
        <div className="qb-status">
          {existing ? <>טיוטה · הצעה <b>{existing.quotationNumber}</b></> : 'הצעת מחיר חדשה'}
          {savedAt && <span className="qb-saved"> · נשמר</span>}
        </div>
        <button className="btn btn-sm" onClick={handleSave} disabled={saving}>{saving ? 'שומר…' : 'שמירה'}</button>
        <button className="btn btn-sm btn-primary" onClick={() => setPanel('review')}>סקירה ושליחה</button>
      </div>

      {notice && (
        <div className={`qb-notice ${notice.kind === 'err' ? 'err' : 'ok'}`} role="status">{notice.text}</div>
      )}

      <div className="qb-doc">
        {/* כותרת — מי, ומאיזו תבנית זה נבנה */}
        <div className="qb-eyebrow">
          <span>
            {[recipient.businessName, recipient.dealerType && dealerLabel(recipient.dealerType)]
              .filter(Boolean).join(' · ') || 'ללא שם עסק'} ·
          </span>
          {kind === 'one_time'
            ? <span className="qb-kindtag">שירות חד־פעמי</span>
            : <button className="qb-link mute ed" onClick={e => openPop('template', e)}>{tpl?.name ?? 'בחירת תבנית'}</button>}
        </div>
        <h1 className="qb-h1">
          <button className="ed qb-h1btn" onClick={() => setPanel('recipient')}>
            {recipient.fullName ? `הצעה ל${recipient.fullName}` : 'בחירת נמען'}
          </button>
        </h1>
        {openWarning && (
          <div className="qb-warn">כבר קיימת הצעה ({openWarning.quotationNumber}) פתוחה לנמען הזה.</div>
        )}

        {/* הגיבור — העסקה */}
        {deal.retainer > 0 ? (
          <div className="qb-hero">
            <button className="qb-amount ed" onClick={e => openPop('price', e)}>
              <span className="num">{formatILS(deal.retainer)}</span>
              <span className="qb-vat">לחודש + מע״מ</span>
            </button>
            {deal.discount >= 1 && (
              <div className="qb-strike">
                <span>מחיר רגיל <s className="num">{formatILS(deal.anchor)}</s></span>
                <span className="qb-disc">הנחה <b className="num">{formatILS(deal.discount)}</b> לחודש</span>
              </div>
            )}
            <div className="qb-under">
              <button className="ed qb-underbtn" onClick={e => openPop('start', e)}>
                מתחילים ב{monthLabel(plan.startMonth)}
              </button>
              <span className="qb-underdim"> · {instTxt}</span>
              {isRenewal && effectiveFrom && (
                <span className="qb-underdim"> · בתוקף מ{monthLabel(effectiveFrom.slice(0, 7))}</span>
              )}
            </div>
          </div>
        ) : (
          <div className="qb-hero">
            <div className="qb-amount-empty">
              {kind === 'one_time' ? 'שירות חד־פעמי - בלי שכר חודשי' : 'אין עדיין שכר חודשי'}
            </div>
            <div className="qb-under">
              <button className="qb-link" onClick={() => setPanel('services')}>הוספת שירותים</button>
            </div>
          </div>
        )}

        <hr className="qb-rule" />

        {/* מה כלול */}
        <div className="qb-lbl">מה כלול</div>
        {deal.monthlyLines.map(i => (
          <div className="qb-crow" key={i.id}>
            <div className="qb-nm">
              <div>{itemDisplayName(i)}</div>
              {isAnnualNature(i) && i.annualPrice != null && (
                <div className="qb-sub">{formatILS(i.annualPrice)} לשנה, נגבה בשכר החודשי</div>
              )}
            </div>
            <div className="qb-pr num">{formatILS(itemFinalPrice(i))} לחודש</div>
          </div>
        ))}
        {deal.separateLines.map(i => (
          <div className="qb-crow" key={i.id}>
            <div className="qb-nm">
              <div>{itemDisplayName(i)}</div>
              {/* מתי ייגבה הוא אחד משלושת הדברים שצריך לדעת על חיוב חד־פעמי
                  (מה · כמה · מתי), ולכן הוא השורה שמתחת ולא תווית גנרית. */}
              <div className="qb-sub">
                {i.category === 'annual'
                  ? 'חיוב שנתי נפרד - לא בשכר החודשי'
                  : (i.clientNote?.trim() || 'חיוב חד־פעמי')}
              </div>
            </div>
            <div className="qb-pr">
              <button className="ed qb-inlinenum num" onClick={e => openPop('oneTime', e, i.id)}>
                {formatILS(itemFinalPrice(i))}{i.category === 'annual' ? ' לשנה' : ''}
              </button>
            </div>
          </div>
        ))}
        {deal.includedLines.length > 0 && (
          <div className="qb-included">ועוד {deal.includedLines.length} שירותים ללא תוספת תשלום</div>
        )}
        {items.length === 0 && <div className="qb-empty">טרם נוספו שירותים.</div>}
        <div className="qb-addrow">
          <button className="qb-link mute" onClick={() => setPanel('services')}>עריכת השירותים</button>
        </div>

        {/* ההשלכה — יתרת הדוח השנתי */}
        {deal.rawBalance >= 1 && (
          <>
            <hr className="qb-rule" />
            <div className={`qb-conseq${deal.completionCharge < 1 ? ' muted' : ''}`}>
              <div className="qb-conseq-head">
                {deal.completionCharge < 1 ? (
                  <div className="qb-conseq-h">יתרת הדוח השנתי - {formatILS(deal.rawBalance)} - לא תיגבה</div>
                ) : (
                  <div className="qb-conseq-h">
                    <b className="num">{formatILS(deal.completionCharge)}</b> נוספים ייגבו {deal.trigger}
                  </div>
                )}
                <button className="qb-link mute" onClick={e => openPop('completion', e)}>שינוי</button>
              </div>
              <div className="qb-conseq-b">
                {deal.completionCharge < 1
                  ? 'ויתרת על היתרה. הלקוח לא יראה סעיף גבייה נוסף.'
                  : deal.balances.map(b =>
                      `${b.name} ${formatILS(b.value)} לשנה · ${deal.installments} × ${formatILS(b.perMonth)} נגבים בשכר החודשי`
                    ).join(' · ')
                    + (deal.completionCharge < deal.rawBalance
                      ? ` · היתרה המלאה ${formatILS(deal.rawBalance)}, הפחתת אותה` : '')}
              </div>
            </div>
          </>
        )}

        <hr className="qb-rule" />

        {/* שורות שקטות */}
        <div className="qb-quiet">
          <span className="qb-quiet-k">שירותים נוספים בעתיד</span>
          <span className="qb-quiet-v">
            {futureServices.length ? `${futureServices.length} מחירים יצורפו להצעה` : 'לא יצורף מחירון'}
          </span>
          <button className="qb-link mute" onClick={() => setPanel('future')}>עריכה</button>
        </div>
        <div className="qb-quiet">
          <span className="qb-quiet-k">ייצוג לאחר אישור</span>
          <span className="qb-quiet-v">{representationSummary(representation)}</span>
          <button className="qb-link mute" onClick={() => setPanel('rep')}>שינוי</button>
        </div>
        {repConflict && <div className="qb-warn">{repConflict}</div>}

        <div className="qb-addrow">
          <button className="qb-link mute" onClick={e => openPop('oneTime', e)}>+ הוספת חיוב חד־פעמי</button>
        </div>
        <div className="qb-hint">כל מספר במסמך נערך בלחיצה עליו.</div>
      </div>

      {/* ─── פופאוברים ─── */}
      {pop.kind === 'price' && (
        <Pop anchor={pop.anchor} onClose={closePop}>
          <PricePop deal={deal} onApply={v => { applyAgreedMonthly(v); closePop(); }}
            onReset={() => { clearAgreedMonthly(); closePop(); }}
            onServices={() => { closePop(); setPanel('services'); }} />
        </Pop>
      )}
      {pop.kind === 'start' && (
        <Pop anchor={pop.anchor} onClose={closePop}>
          <StartPop plan={plan} deal={deal} onPick={(startMonth) => { updatePlan({ startMonth, installments: monthsLeftInYear(startMonth) }); closePop(); }}
            onInstallments={n => { updatePlan({ installments: n }); closePop(); }} />
        </Pop>
      )}
      {pop.kind === 'completion' && (
        <Pop anchor={pop.anchor} onClose={closePop}>
          <CompletionPop deal={deal} onSet={p => { setCompletion(p); closePop(); }} />
        </Pop>
      )}
      {pop.kind === 'template' && (
        <Pop anchor={pop.anchor} onClose={closePop}>
          <div className="qb-pop-h">תבנית ההצעה</div>
          <div className="qb-pop-s">התבנית קובעת אילו שירותים ומחירים נטענים. החלפה תבנה את ההצעה מחדש.</div>
          <div className="qb-chips">
            {templates.filter(t => t.active).map(t => (
              <button key={t.id} className={`qb-chip wide${t.id === templateId ? ' on' : ''}`}
                onClick={() => applyTemplate(t.id)}>{t.name}</button>
            ))}
          </div>
        </Pop>
      )}
      {pop.kind === 'oneTime' && (
        <Pop anchor={pop.anchor} onClose={closePop}>
          <OneTimePop
            services={services} items={items} futureIds={futureIds}
            item={pop.itemId ? items.find(i => i.id === pop.itemId) : undefined}
            onSave={(patch, svc) => {
              if (pop.itemId) updateItem(pop.itemId, patch);
              else if (svc) addService(svc, patch);
              else setItems(prev => [...prev, {
                id: crypto.randomUUID(), name: patch.name ?? '', category: 'one_time',
                billingType: 'fixed', quantity: 1, catalogPrice: patch.clientPrice ?? 0,
                clientPrice: patch.clientPrice ?? 0, vatFlag: true, clientNote: patch.clientNote,
              }]);
              closePop();
            }}
            onRemove={() => { if (pop.itemId) removeItem(pop.itemId); closePop(); }} />
        </Pop>
      )}

      {/* ─── לוחות ─── */}
      {panel === 'services' && (
        <ServicesPanel
          items={items} services={services} plan={plan} deal={deal} templateName={tpl?.name}
          onUpdate={updateItem} onRemove={removeItem} onAdd={addService}
          onClose={() => setPanel(null)} />
      )}
      {panel === 'future' && (
        <FuturePanel
          services={services} items={items} selected={futureIds} templateName={tpl?.name}
          templateDefaults={tpl?.futureServiceIds ?? []}
          onChange={setFutureIds} onClose={() => setPanel(null)} />
      )}
      {panel === 'rep' && (
        <Modal title="ייצוג מול הרשויות" onClose={() => setPanel(null)} width={620}
          footer={<button className="btn btn-primary" onClick={() => setPanel(null)}>סיום</button>}>
          <QuotationRepresentationEditor
            value={representation} onChange={setRepresentation}
            recipientName={recipient.fullName} recipientEmail={recipient.email}
            emailConflict={repConflict}
            isTransfer={isTransferRecipient(recipient, leads, clients)} />
        </Modal>
      )}
      {panel === 'recipient' && (
        <Modal title="נמען ההצעה" onClose={() => setPanel(null)} width={520} footer={null}>
          <RecipientPicker leads={leads} clients={clients} value={recipient}
            onPick={r => {
              setRecipient(r);
              setPanel(null);
              // מי שכבר מיוצג לא נפתח שוב; כל השאר מקבל את ברירת המחדל המלאה,
              // כולל מי שעובר מרו"ח אחר — הוא נרשם ראשי, וירידה למשני נגזרת
              // ממכתב העברת הטיפול ולא מכאן.
              const picked = r.kind === 'client' ? clients.find(c => c.id === r.id) : undefined;
              if (picked?.representationStatus) setRepresentation(p => (p.enabled ? { ...p, enabled: false } : p));
            }} />
        </Modal>
      )}
      {panel === 'review' && (
        <ReviewPanel
          data={{
            quotationNumber: existing?.quotationNumber ?? 'טיוטה',
            recipientName: recipient.fullName || 'הלקוח',
            businessName: recipient.businessName,
            items, futureServices, vatRate, notesForClient: emailMessage, expiresAt,
            representation,
          }}
          brand={brand} totals={totals} deal={deal} vatRate={vatRate}
          message={emailMessage} onMessage={setEmailMessage}
          subject={emailSubject} onSubject={setEmailSubject}
          internalNotes={internalNotes} onInternalNotes={setInternalNotes}
          expiresAt={expiresAt} onExpires={setExpiresAt}
          isRenewal={isRenewal} effectiveFrom={effectiveFrom} onEffectiveFrom={setEffectiveFrom}
          sending={sending} blocker={sendBlocker(false)}
          onSend={() => handleSend(false)} onTest={() => handleSend(true)}
          onPdf={downloadPreviewPdf} onClose={() => setPanel(null)} />
      )}
    </div>
  );
}

function dealerLabel(d: NonNullable<Lead['dealerType']>): string {
  return d === 'exempt' ? 'עוסק פטור' : d === 'licensed' ? 'עוסק מורשה' : d === 'company' ? 'חברה' : 'אחר';
}

/* ═══ פופאוברים ═══════════════════════════════════════════════════════════ */

function PricePop({ deal, onApply, onReset, onServices }: {
  deal: Deal; onApply: (v: number) => void; onReset: () => void; onServices: () => void;
}) {
  const base = deal.anchor;
  const step = base >= 1000 ? 100 : base >= 400 ? 25 : 10;
  const opts: number[] = [];
  for (let i = 0; i < 4; i++) { const v = r0((base - i * step) / step) * step; if (v > base * 0.6) opts.push(v); }
  const [custom, setCustom] = useState(String(r0(deal.retainer)));

  return (
    <>
      <div className="qb-pop-h">המחיר שסוכם</div>
      <div className="qb-pop-s">
        מחיר התבנית: {formatILS(base)} לחודש. סכום נמוך יותר יוצג ללקוח כהנחה, לצד המחיר הרגיל.
      </div>
      <div className="qb-chips">
        {opts.map(v => (
          <button key={v} className={`qb-chip${Math.abs(v - deal.retainer) < 1 ? ' on' : ''}`}
            onClick={() => (v === base ? onReset() : onApply(v))}>
            {formatILS(v)}{v === base ? ' · מלא' : ''}
          </button>
        ))}
      </div>
      <label className="qb-fld">
        <span>או סכום אחר לחודש (לפני מע״מ)</span>
        <input type="number" min={0} value={custom} autoFocus
          onChange={e => setCustom(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') onApply(Number(custom) || 0); }} />
      </label>
      <div className="qb-note">
        ההנחה חלה על השכר החודשי
        {deal.rawBalance >= 1 && ` ואינה משנה את יתרת הדוח השנתי (${formatILS(deal.rawBalance)})`}
        . לתמחור שירות בנפרד - <button className="qb-link" onClick={onServices}>עריכת השירותים</button>.
      </div>
      <div className="qb-pop-f">
        <button className="qb-link" onClick={onReset}>חזרה למחיר התבנית</button>
        <button className="btn btn-sm btn-primary" onClick={() => onApply(Number(custom) || 0)}>עדכון</button>
      </div>
    </>
  );
}

function StartPop({ plan, deal, onPick, onInstallments }: {
  plan: BillingPlan; deal: Deal; onPick: (ym: string) => void; onInstallments: (n: number) => void;
}) {
  const year = Number(plan.startMonth.slice(0, 4));
  const [more, setMore] = useState(false);
  const [inst, setInst] = useState(String(plan.installments));
  return (
    <>
      <div className="qb-pop-h">חודש התשלום הראשון</div>
      <div className="qb-pop-s">
        התשלום הראשון נגבה מיד עם האישור, והבאים ב־1 בכל חודש.
        מספר התשלומים נגזר לבד - ואיתו יתרת הדוח השנתי.
      </div>
      <div className="qb-chips">
        {MONTH_NAMES.map((m, i) => {
          const ym = `${year}-${String(i + 1).padStart(2, '0')}`;
          return (
            <button key={ym} className={`qb-chip${ym === plan.startMonth ? ' on' : ''}`}
              onClick={() => onPick(ym)}>{m}</button>
          );
        })}
      </div>
      <button className="qb-chip wide" style={{ marginTop: 9 }} onClick={() => onPick(`${year + 1}-01`)}>
        ינואר {year + 1} · שנה מלאה
      </button>
      <div className="qb-note">
        כרגע: {deal.installments} תשלומים · {formatMonthRange(plan.startMonth, deal.endMonth)}.
        המחיר ממשיך לשנה הבאה ומתחדש אוטומטית, אלא אם תשנה אותו.
      </div>
      {more ? (
        <>
          <label className="qb-fld"><span>מספר תשלומים</span>
            <input type="number" min={1} max={24} value={inst} onChange={e => setInst(e.target.value)} />
          </label>
          <div className="qb-pop-f">
            <span />
            <button className="btn btn-sm" onClick={() => onInstallments(Number(inst) || 1)}>עדכון</button>
          </div>
        </>
      ) : (
        <button className="qb-link mute" style={{ marginTop: 10 }} onClick={() => setMore(true)}>מספר תשלומים אחר</button>
      )}
    </>
  );
}

function CompletionPop({ deal, onSet }: {
  deal: Deal;
  onSet: (p: { mode?: 'charge' | 'reduce' | 'waive'; amount?: number | null; trigger?: string }) => void;
}) {
  const waived = deal.completionCharge < 1;
  const reduced = !waived && deal.completionCharge < deal.rawBalance;
  const [mode, setMode] = useState<'charge' | 'reduce' | 'waive'>(waived ? 'waive' : reduced ? 'reduce' : 'charge');
  const [amount, setAmount] = useState(String(r0(deal.completionCharge)));
  return (
    <>
      <div className="qb-pop-h">יתרת הדוח השנתי</div>
      <div className="qb-pop-s">
        {formatILS(deal.rawBalance)} לא נכללים ב{deal.installments} התשלומים של השנה.
        ברירת המחדל: נגבים עם הגשת הדוח.
        {deal.discount >= 1 && ' ההנחה על השכר החודשי לא הפחיתה אותה - הפחתה כאן היא החלטה נפרדת.'}
      </div>
      <div className="qb-chips">
        <button className={`qb-chip${mode === 'charge' ? ' on' : ''}`}
          onClick={() => onSet({ mode: 'charge' })}>לגבות במלואה</button>
        <button className={`qb-chip${mode === 'reduce' ? ' on' : ''}`}
          onClick={() => setMode('reduce')}>להפחית</button>
        <button className={`qb-chip${mode === 'waive' ? ' on' : ''}`}
          onClick={() => onSet({ mode: 'waive' })}>לוותר</button>
      </div>
      {mode === 'reduce' && (
        <>
          <label className="qb-fld"><span>כמה ייגבה בפועל (עד {formatILS(deal.rawBalance)})</span>
            <input type="number" min={0} max={r0(deal.rawBalance)} value={amount} autoFocus
              onChange={e => setAmount(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') onSet({ mode: 'reduce', amount: Number(amount) || 0 }); }} />
          </label>
          <div className="qb-note">ההפרש יוצג ללקוח כהנחה על היתרה. השכר החודשי לא משתנה.</div>
        </>
      )}
      <label className="qb-fld"><span>מתי ייגבה</span>
        <select value={deal.trigger} onChange={e => onSet({ trigger: e.target.value })}>
          {DEFERRED_TRIGGERS.map(t => <option key={t} value={t}>{t}</option>)}
        </select>
      </label>
      {mode === 'reduce' && (
        <div className="qb-pop-f">
          <span />
          <button className="btn btn-sm btn-primary"
            onClick={() => onSet({ mode: 'reduce', amount: Number(amount) || 0 })}>עדכון</button>
        </div>
      )}
    </>
  );
}

function OneTimePop({ services, items, futureIds, item, onSave, onRemove }: {
  services: ServiceCatalogItem[]; items: QuotationItem[]; futureIds: Set<string>;
  item?: QuotationItem;
  onSave: (patch: Partial<QuotationItem>, svc?: ServiceCatalogItem) => void;
  onRemove: () => void;
}) {
  const used = new Set(items.map(i => i.serviceId).filter(Boolean));
  /* ההצעות המהירות מתחילות במה שכבר הוצג ללקוח כמחיר עתידי — המסלול
     "הסכמנו על מחיר לעתיד → הגיע הזמן לגבות". */
  const disclosed = services.filter(s => s.active && s.category === 'one_time' && futureIds.has(s.id) && !used.has(s.id));
  const rest = services.filter(s => s.active && s.category === 'one_time' && !used.has(s.id) && !futureIds.has(s.id));
  const suggestions = [...disclosed, ...rest].slice(0, 5);

  const [name, setName] = useState(item ? item.name : '');
  const [amount, setAmount] = useState(item ? String(r0(itemFinalPrice(item))) : '');
  const [when, setWhen] = useState<'immediate' | 'on_service' | 'custom'>(
    item?.clientNote?.includes('עם ביצוע') ? 'on_service' : item?.clientNote ? 'custom' : 'immediate');
  const [custom, setCustom] = useState(item?.clientNote ?? '');
  const [picked, setPicked] = useState<ServiceCatalogItem | undefined>();

  const noteFor = () => when === 'immediate' ? 'ייגבה מיידית עם האישור'
    : when === 'on_service' ? 'ייגבה עם ביצוע השירות' : custom.trim();

  return (
    <>
      <div className="qb-pop-h">{item ? 'חיוב חד־פעמי' : 'הוספת חיוב חד־פעמי'}</div>
      <div className="qb-pop-s">מה · כמה · מתי.</div>
      {!item && suggestions.length > 0 && (
        <div className="qb-chips" style={{ marginBottom: 4 }}>
          {suggestions.map(s => (
            <button key={s.id} className="qb-chip" onClick={() => {
              setPicked(s); setName(s.name); setAmount(String(s.defaultPrice));
            }}>{s.name}</button>
          ))}
        </div>
      )}
      <label className="qb-fld"><span>מה</span>
        <input value={name} onChange={e => setName(e.target.value)} placeholder="למשל: מעבר מעוסק פטור למורשה" />
      </label>
      <div className="qb-fld2">
        <label className="qb-fld"><span>כמה (לפני מע״מ)</span>
          <input type="number" min={0} value={amount} onChange={e => setAmount(e.target.value)} />
        </label>
        <label className="qb-fld"><span>מתי</span>
          <select value={when} onChange={e => setWhen(e.target.value as typeof when)}>
            <option value="immediate">מיידית</option>
            <option value="on_service">עם ביצוע השירות</option>
            <option value="custom">מועד אחר…</option>
          </select>
        </label>
      </div>
      {when === 'custom' && (
        <label className="qb-fld"><span>מתי - נוסח חופשי</span>
          <input value={custom} onChange={e => setCustom(e.target.value)} placeholder="למשל: עם קבלת האישור מהרשות" />
        </label>
      )}
      <div className="qb-pop-f">
        {item ? <button className="qb-link danger" onClick={onRemove}>הסרה</button> : <span />}
        <button className="btn btn-sm btn-primary" onClick={() => {
          const v = Number(amount) || 0;
          if (!name.trim() || v <= 0) return;
          onSave({
            name: name.trim(), clientPrice: v, catalogPrice: picked?.defaultPrice ?? v,
            discountPercent: 0, clientNote: noteFor(), category: 'one_time',
          }, picked);
        }}>{item ? 'עדכון' : 'הוספה'}</button>
      </div>
    </>
  );
}

/* ═══ לוחות ═══════════════════════════════════════════════════════════════ */

/** כאן, ורק כאן, יושבת המכניקה: שנתי ÷ 12, פריסה, הנחה פר-שורה, שנות מס. */
function ServicesPanel({ items, services, plan, deal, templateName, onUpdate, onRemove, onAdd, onClose }: {
  items: QuotationItem[]; services: ServiceCatalogItem[]; plan: BillingPlan; deal: Deal;
  templateName?: string;
  onUpdate: (id: string, p: Partial<QuotationItem>) => void;
  onRemove: (id: string) => void;
  onAdd: (svc: ServiceCatalogItem, overrides?: Partial<QuotationItem>) => void;
  onClose: () => void;
}) {
  const [search, setSearch] = useState('');
  const [yearsFor, setYearsFor] = useState<ServiceCatalogItem | null>(null);
  const [years, setYears] = useState<Set<number>>(new Set());

  const used = new Set(items.map(i => i.serviceId).filter(Boolean));
  // ‼ גם שירותים "כלולים" ניתנים להוספה: לקוח יכול לקבל ליווי עסקי ללא חיוב
  // גם כשהתבנית לא כללה אותו. בלי זה היכולת הייתה חד־כיוונית — אפשר להסיר
  // כלול, אי אפשר להוסיף.
  const catalog = services.filter(s => s.active
    && (!used.has(s.id) || s.category === 'annual')
    && (!search.trim() || s.name.includes(search.trim())));

  const monthly = items.filter(i => i.category === 'monthly');
  const others = items.filter(i => i.category === 'annual' || i.category === 'one_time');
  const included = items.filter(i => i.category === 'included');

  return (
    <Modal title="שירותים ומחירים" onClose={onClose} width={640}
      footer={<button className="btn btn-primary" onClick={onClose}>סיום</button>}>
      <div className="qb-panel-s">
        {templateName ? `תבנית: ${templateName} · ` : ''}השכר החודשי מסתכם ל{formatILS(deal.retainer)} + מע״מ
      </div>

      <div className="qb-sect">בשכר החודשי</div>
      {monthly.map(i => (
        <div className="qb-srow" key={i.id}>
          <div className="qb-sn">
            <div className="qb-st">
              {itemDisplayName(i)}{' '}
              <span className={`qb-tag${isAnnualNature(i) ? ' blue' : ''}`}>
                {isAnnualNature(i) ? 'שנתי במהותו' : 'חודשי במהותו'}
              </span>
            </div>
            <div className="qb-sm">
              {isAnnualNature(i) && i.annualPrice != null
                ? `${formatILS(i.annualPrice)} לשנה ÷ 12 = ${formatILS(itemFinalPrice(i))} לחודש`
                : `${formatILS(itemFinalPrice(i))} לחודש`}
              {itemOriginalPrice(i) > itemFinalPrice(i) && ` · מחירון ${formatILS(itemOriginalPrice(i))}`}
            </div>
          </div>
          <div className="qb-sp">
            {/* ‼ catalogPrice הוא העוגן שהלקוח רואה מחוק. מחיר נמוך ממנו הוא
                הנחה, ולכן אסור לדרוס אותו כאן — דריסה הייתה מוחקת בשקט את
                ההנחה מעמוד ההצעה. מחיר גבוה מהקטלוג פשוט הופך לעוגן בעצמו
                (itemOriginalPrice לוקח את הגבוה מביניהם). */}
            <input type="number" min={0}
              value={r0(isAnnualNature(i) ? (i.annualPrice ?? 0) : itemFinalPrice(i))}
              title={isAnnualNature(i) ? 'מחיר לשנה' : 'מחיר לחודש'}
              onChange={e => {
                const v = Math.max(0, Number(e.target.value) || 0);
                if (isAnnualNature(i)) onUpdate(i.id, { annualPrice: v, discountPercent: 0 });
                else onUpdate(i.id, { clientPrice: v, discountPercent: 0 });
              }} />
          </div>
          {isAnnualNature(i) && (
            <button className="btn btn-sm" title="להוציא מהשכר החודשי"
              onClick={() => onUpdate(i.id, {
                category: 'annual', priceBasis: undefined, prorationMode: undefined,
                clientPrice: i.annualPrice ?? itemFinalPrice(i), installments: undefined,
                billingStartMonth: undefined, annualPrice: undefined,
              })}>לחיוב שנתי</button>
          )}
          <button className="qb-x" onClick={() => onRemove(i.id)} title="הסרה">✕</button>
        </div>
      ))}
      {monthly.length === 0 && <div className="qb-note">אין שירותים בשכר החודשי.</div>}

      {others.length > 0 && (
        <>
          <div className="qb-sect">מחוץ לשכר החודשי</div>
          {others.map(i => (
            <div className="qb-srow" key={i.id}>
              <div className="qb-sn">
                <div className="qb-st">{itemDisplayName(i)} <span className="qb-tag">{i.category === 'annual' ? 'שנתי' : 'חד־פעמי'}</span></div>
                <div className="qb-sm">{i.category === 'annual' ? 'חיוב שנתי נפרד' : (i.clientNote || 'חיוב חד־פעמי')}</div>
              </div>
              <div className="qb-sp">
                <input type="number" min={0} value={r0(itemFinalPrice(i))}
                  onChange={e => onUpdate(i.id, {
                    clientPrice: Math.max(0, Number(e.target.value) || 0), discountPercent: 0,
                  })} />
              </div>
              {i.category === 'annual' && (
                <button className="btn btn-sm" onClick={() => onUpdate(i.id, {
                  category: 'monthly', priceBasis: 'annual', annualPrice: itemFinalPrice(i),
                  prorationMode: 'deferred', clientPrice: r2(itemFinalPrice(i) / DEFAULT_INSTALLMENTS),
                  installments: plan.installments, billingStartMonth: plan.startMonth,
                })}>לשכר החודשי</button>
              )}
              <button className="qb-x" onClick={() => onRemove(i.id)}>✕</button>
            </div>
          ))}
        </>
      )}

      {included.length > 0 && (
        <>
          <div className="qb-sect">ללא תוספת תשלום · {included.length}</div>
          {included.map(i => (
            <div className="qb-srow" key={i.id}>
              <div className="qb-sn"><div className="qb-st">{itemDisplayName(i)}</div></div>
              <button className="qb-x" onClick={() => onRemove(i.id)}>✕</button>
            </div>
          ))}
        </>
      )}

      <div className="qb-sect">הוספת שירות</div>
      <input className="qb-search" placeholder="חיפוש בקטלוג…" value={search} onChange={e => setSearch(e.target.value)} />
      <div className="qb-chips" style={{ marginTop: 6 }}>
        {catalog.slice(0, 8).map(s => (
          <button key={s.id} className="qb-chip" onClick={() => {
            if (s.category === 'annual') { setYearsFor(s); setYears(new Set()); }
            else onAdd(s);
          }}>{s.name} · {formatILS(s.defaultPrice)}</button>
        ))}
        {catalog.length === 0 && <div className="qb-note">אין התאמות.</div>}
      </div>

      {/* דוחות לשנים פתוחות — בחירת שנים לשירות שנתי */}
      {yearsFor && (
        <div className="qb-years">
          <div className="qb-sm">לאילו שנים? כל שנה נוספת כשורה נפרדת עם מחיר משלה.</div>
          <div className="qb-chips" style={{ margin: '8px 0' }}>
            {YEAR_OPTIONS.map(y => {
              const taken = items.some(i => i.year === y && i.serviceId === yearsFor.id);
              return (
                <button key={y} disabled={taken}
                  className={`qb-chip${years.has(y) ? ' on' : ''}`}
                  onClick={() => setYears(prev => {
                    const n = new Set(prev); n.has(y) ? n.delete(y) : n.add(y); return n;
                  })}>{y}{taken ? ' ✓' : ''}</button>
              );
            })}
          </div>
          <div className="qb-pop-f">
            <button className="qb-link mute" onClick={() => setYearsFor(null)}>ביטול</button>
            <button className="btn btn-sm btn-primary" disabled={years.size === 0} onClick={() => {
              [...years].sort().forEach(y => onAdd(yearsFor, { year: y }));
              setYearsFor(null); setYears(new Set());
            }}>הוספה</button>
          </div>
        </div>
      )}

      <div className="qb-callout">
        שירות שנתי בשכר החודשי נגבה כחלק מהריטיינר, והמערכת מחשבת לבד מה נשאר לגבייה
        בסוף השנה. שירות שהוצא לחיוב שנתי נגבה במלואו במועד אחד - ואז אין יתרה.
      </div>
    </Modal>
  );
}

function FuturePanel({ services, items, selected, templateName, templateDefaults, onChange, onClose }: {
  services: ServiceCatalogItem[]; items: QuotationItem[]; selected: Set<string>;
  templateName?: string; templateDefaults: string[];
  onChange: (s: Set<string>) => void; onClose: () => void;
}) {
  const [search, setSearch] = useState('');
  const used = new Set(items.map(i => i.serviceId).filter(Boolean));
  const groups: [ServiceCategory, string][] = [['one_time', 'חד־פעמיים'], ['annual', 'שנתיים'], ['monthly', 'חודשיים']];
  const count = [...selected].filter(id => !used.has(id)).length;

  const toggle = (id: string) => {
    const n = new Set(selected);
    n.has(id) ? n.delete(id) : n.add(id);
    onChange(n);
  };

  return (
    <Modal title="שירותים נוספים בעתיד" onClose={onClose} width={620}
      footer={<button className="btn btn-primary" onClick={onClose}>סיום</button>}>
      <div className="qb-panel-s">
        מחירון "אם וכאשר" שמצורף להצעה. אינו נכלל בסכומים ואינו מחייב את הלקוח -
        הוא רק מונע הפתעה כשיזדקק לשירות.
        {templateName && ` הבחירה הראשונית מגיעה מהתבנית «${templateName}»; שינוי כאן חל על ההצעה הזאת בלבד.`}
      </div>
      <input className="qb-search" placeholder="חיפוש בכל הקטלוג…" value={search} onChange={e => setSearch(e.target.value)} />
      <div className="qb-selbar">
        <b>{count} נבחרו</b>
        <button className="qb-link" onClick={() => onChange(new Set(templateDefaults.filter(id => !used.has(id))))}>
          ברירת המחדל של התבנית
        </button>
        <button className="qb-link" onClick={() => onChange(new Set(
          services.filter(s => s.active && s.category !== 'included' && !used.has(s.id)).map(s => s.id)))}>
          בחירת הכול
        </button>
        <button className="qb-link" onClick={() => onChange(new Set())}>ניקוי</button>
      </div>
      {groups.map(([cat, label]) => {
        const list = services.filter(s => s.active && s.category === cat && !used.has(s.id)
          && (!search.trim() || s.name.includes(search.trim())));
        if (!list.length) return null;
        return (
          <div key={cat}>
            <div className="qb-sect">{label}</div>
            {list.map(s => (
              <label className="qb-check" key={s.id}>
                <input type="checkbox" checked={selected.has(s.id)} onChange={() => toggle(s.id)} />
                <span className="qb-cn">{s.name}</span>
                <span className="qb-cp">
                  {formatILS(s.defaultPrice)}
                  {s.category === 'monthly' ? ' לחודש' : s.category === 'annual' ? ' לשנה' : ''} + מע״מ
                </span>
              </label>
            ))}
          </div>
        );
      })}
    </Modal>
  );
}

/** סקירה — כאן, ורק כאן, מע״מ מפורט, הודעה אישית ותוקף. */
function ReviewPanel({
  data, brand, totals, deal, vatRate, message, onMessage, subject, onSubject,
  internalNotes, onInternalNotes, expiresAt, onExpires, isRenewal, effectiveFrom, onEffectiveFrom,
  sending, blocker, onSend, onTest, onPdf, onClose,
}: {
  data: React.ComponentProps<typeof QuotationWebView>['data'];
  brand: ReturnType<typeof deriveQuotationBrand>;
  totals: ReturnType<typeof calcTotals>; deal: Deal; vatRate: number;
  message: string; onMessage: (v: string) => void;
  subject: string; onSubject: (v: string) => void;
  internalNotes: string; onInternalNotes: (v: string) => void;
  expiresAt: string; onExpires: (v: string) => void;
  isRenewal: boolean; effectiveFrom?: string; onEffectiveFrom: (v: string) => void;
  sending: 'test' | 'send' | null; blocker: string | null;
  onSend: () => void; onTest: () => void; onPdf: () => void; onClose: () => void;
}) {
  const [settings, setSettings] = useState(false);
  return (
    <Modal title="סקירה לפני שליחה" onClose={onClose} width={780}
      footer={
        <div className="qb-review-foot">
          <span className="qb-review-sum">
            {formatILS(totals.monthly.withVat)} לחודש כולל מע״מ
            {deal.completionCharge >= 1 && ` · ${formatILS(deal.completionCharge)} ${deal.trigger}`}
          </span>
          <span className="qb-review-acts">
            <button className="btn btn-sm" onClick={onTest} disabled={!!sending}>
              {sending === 'test' ? 'שולח…' : 'מייל בדיקה'}
            </button>
            <button className="btn btn-sm" onClick={onPdf}>PDF</button>
            <button className="btn btn-sm btn-primary" onClick={onSend} disabled={!!sending}>
              {sending === 'send' ? 'שולח…' : 'שליחה ללקוח'}
            </button>
          </span>
        </div>
      }>
      <div className="qb-panel-s">זה בדיוק מה שהלקוח יראה. אין מסמך שני.</div>
      {blocker && <div className="qb-warn">{blocker}</div>}

      <div className="qb-preview pivo-light">
        <QuotationWebView data={data} brand={brand} compact />
      </div>

      <label className="qb-fld"><span>הודעה אישית ללקוח (אופציונלי) - נכנסת למייל ולראש ההצעה</span>
        <textarea rows={3} value={message} onChange={e => onMessage(e.target.value)}
          placeholder="למשל: אחרי שדיברנו הבנתי שהדבר הדחוף אצלך הוא לסגור את השנים הפתוחות - התחלתי מזה." />
      </label>
      <div className="qb-note">
        המייל עצמו לא מציג מחירים - הם מחכים בעמוד ההצעה. תוקף: עד {new Date(expiresAt).toLocaleDateString('he-IL')},
        ותזכורת אוטומטית יום עסקים לפני הפקיעה. מע״מ {vatRate}% מוצג בעמוד בכל סעיף.
      </div>

      {settings ? (
        <>
          <label className="qb-fld"><span>נושא המייל</span>
            <input value={subject} onChange={e => onSubject(e.target.value)} />
          </label>
          <label className="qb-fld"><span>תוקף ההצעה</span>
            <input type="date" value={expiresAt.slice(0, 10)}
              onChange={e => { const d = new Date(e.target.value); d.setHours(23, 59, 0, 0); onExpires(d.toISOString()); }} />
          </label>
          {isRenewal && (
            <label className="qb-fld"><span>ההסכם המעודכן נכנס לתוקף</span>
              <input type="date" value={(effectiveFrom ?? '').slice(0, 10)}
                onChange={e => onEffectiveFrom(e.target.value)} />
              <span className="qb-note">עד התאריך הזה נשאר ההסכם הנוכחי בתוקף.</span>
            </label>
          )}
          <label className="qb-fld"><span>הערה פנימית (לא נשלחת ללקוח)</span>
            <textarea rows={2} value={internalNotes} onChange={e => onInternalNotes(e.target.value)} />
          </label>
        </>
      ) : (
        <button className="qb-link mute" onClick={() => setSettings(true)}>נושא המייל, תוקף והערה פנימית</button>
      )}
    </Modal>
  );
}

/* ═══ הצעה שנשלחה — מעקב ═══════════════════════════════════════════════════ */
function SentQuotation({ quotation, brand, onBack }: {
  quotation: Quotation; brand: ReturnType<typeof deriveQuotationBrand>; onBack: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);
  const snap = quotation.snapshot;
  const link = quotation.publicToken ? `${window.location.origin}/?quote=${quotation.publicToken}` : null;
  const fmt = (iso?: string) => iso
    ? new Date(iso).toLocaleString('he-IL', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
    : 'עדיין לא';

  async function contract() {
    setBusy(true);
    try {
      const bytes = await generateQuotationPdf({
        quotationNumber: quotation.quotationNumber,
        recipientName: snap?.recipientName ?? '',
        businessName: snap?.businessName,
        items: snap?.items ?? quotation.items,
        futureServices: snap?.futureServices ?? quotation.futureServices,
        vatRate: snap?.vatRate ?? quotation.vatRate,
        notesForClient: snap?.notesForClient ?? quotation.notesForClient,
        approval: {
          signatureDataUrl: quotation.approvalSignature,
          signerName: quotation.approvalSignerName,
          approvedAt: quotation.approvedAt,
        },
      }, brand);
      downloadPdf(bytes, `הסכם התקשרות - הצעה ${quotation.quotationNumber}.pdf`);
    } finally { setBusy(false); }
  }

  return (
    <div className="qb" dir="rtl">
      <div className="qb-top">
        <button className="qb-back" onClick={onBack}>→ חזרה</button>
        <div className="qb-status">הצעה <b>{quotation.quotationNumber}</b></div>
      </div>
      <div className="qb-doc">
        <div className="qb-lbl">מעקב</div>
        <div className="qb-milestones">
          {[
            { label: 'נשלחה ללקוח', at: quotation.sentAt },
            { label: 'נצפתה', at: quotation.firstViewedAt },
            { label: 'אושרה ונחתמה', at: quotation.approvedAt },
          ].map(m => (
            <div className="qb-ms" key={m.label} style={{ opacity: m.at ? 1 : 0.5 }}>
              <div className="qb-ms-l">{m.label}</div>
              <div className="qb-ms-d">{fmt(m.at)}</div>
            </div>
          ))}
        </div>
        {link && (
          <div className="qb-quiet">
            <span className="qb-quiet-k">הקישור שנשלח</span>
            <span className="qb-quiet-v" dir="ltr" style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{link}</span>
            <button className="qb-link mute" onClick={async () => {
              try { await navigator.clipboard.writeText(link); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch { /* דפדפן חוסם */ }
            }}>{copied ? 'הועתק' : 'העתקה'}</button>
          </div>
        )}
        {quotation.approvalSignature && (
          <>
            <hr className="qb-rule" />
            <div className="qb-lbl">חתימת הלקוח</div>
            <img src={quotation.approvalSignature} alt="חתימת הלקוח" className="qb-sig" />
            <div className="qb-sub">
              {quotation.approvalSignerName ? `נחתם על ידי ${quotation.approvalSignerName}` : 'נחתם'}
              {quotation.approvedAt ? ` · ${fmt(quotation.approvedAt)}` : ''}
            </div>
            <div className="qb-addrow">
              <button className="qb-link" onClick={contract} disabled={busy}>
                {busy ? 'מפיק…' : 'הורדת ההסכם החתום (PDF)'}
              </button>
            </div>
          </>
        )}
        <hr className="qb-rule" />
        <QuotationEmailsPanel quotationId={quotation.id} representationRequestId={quotation.representationRequestId} />
      </div>
    </div>
  );
}

/* ═══ בחירת נמען ═══════════════════════════════════════════════════════════ */
function buildRecipientOptions(leads: Lead[], clients: Client[]) {
  const norm = (s?: string) => (s ?? '').trim().toLowerCase();
  const clientIds = new Set(clients.map(c => c.id));
  const clientEmails = new Set(clients.map(c => norm(c.email)).filter(Boolean));
  const clientNames = new Set(clients.map(c => norm(`${c.firstName} ${c.lastName}`)).filter(Boolean));

  const leadOptions = leads
    .filter(l => {
      if (l.status === 'closed') return false;
      if (l.convertedClientId && clientIds.has(l.convertedClientId)) return false;
      if (norm(l.email) && clientEmails.has(norm(l.email))) return false;
      if (clientNames.has(norm(l.fullName))) return false;
      return true;
    })
    .map(l => ({
      kind: 'lead' as const, id: l.id, fullName: l.fullName, businessName: l.businessName,
      email: l.email, phone: l.phone, dealerType: l.dealerType,
    }));

  const clientOptions = clients
    .map(c => ({
      kind: 'client' as const, id: c.id, fullName: `${c.firstName} ${c.lastName}`.trim(),
      businessName: c.businessName, email: c.email, phone: c.phone, repStatus: c.representationStatus,
    }))
    .sort((a, b) => a.fullName.localeCompare(b.fullName, 'he'));

  return { leadOptions, clientOptions };
}

function RecipientPicker({ leads, clients, value, onPick }: {
  leads: Lead[]; clients: Client[]; value: RecipientDraft; onPick: (r: RecipientDraft) => void;
}) {
  const { leadOptions, clientOptions } = buildRecipientOptions(leads, clients);
  const hasExisting = leadOptions.length + clientOptions.length > 0;
  const [mode, setMode] = useState<'existing' | 'new'>(hasExisting ? 'existing' : 'new');
  const [nl, setNl] = useState({
    fullName: value.kind === 'new' ? value.fullName : '', phone: '', email: '', businessName: '',
  });
  const [hasPrev, setHasPrev] = useState(false);
  const [prev, setPrev] = useState({ name: '', email: '', phone: '' });

  const label = (o: { fullName: string; businessName?: string; phone?: string; email?: string }) =>
    [o.fullName || '(ללא שם)', o.businessName, o.phone || o.email].filter(Boolean).join(' · ');

  return (
    <div>
      <div className="qb-chips" style={{ marginBottom: 12 }}>
        <button className={`qb-chip${mode === 'existing' ? ' on' : ''}`} onClick={() => setMode('existing')}>ליד או לקוח קיים</button>
        <button className={`qb-chip${mode === 'new' ? ' on' : ''}`} onClick={() => setMode('new')}>ליד חדש</button>
      </div>

      {mode === 'existing' ? (
        hasExisting ? (
          <select autoFocus defaultValue={value.id ? `${value.kind}:${value.id}` : ''}
            onChange={e => {
              const key = e.target.value;
              if (!key) return;
              const [k, id] = [key.slice(0, key.indexOf(':')), key.slice(key.indexOf(':') + 1)];
              const picked = k === 'lead' ? leadOptions.find(o => o.id === id) : clientOptions.find(o => o.id === id);
              if (!picked) return;
              const { ...rest } = picked;
              delete (rest as Record<string, unknown>).repStatus;
              onPick(rest as RecipientDraft);
            }}>
            <option value="">- בחר ליד או לקוח -</option>
            {leadOptions.length > 0 && (
              <optgroup label={`לידים (${leadOptions.length})`}>
                {leadOptions.map(o => <option key={o.id} value={`lead:${o.id}`}>{label(o)}</option>)}
              </optgroup>
            )}
            {clientOptions.length > 0 && (
              <optgroup label={`לקוחות (${clientOptions.length})`}>
                {clientOptions.map(o => (
                  <option key={o.id} value={`client:${o.id}`}>
                    {label(o)}{o.repStatus === 'active' ? ' · מיוצג' : o.repStatus ? ' · ייצוג בתהליך' : ''}
                  </option>
                ))}
              </optgroup>
            )}
          </select>
        ) : <div className="qb-note">אין עדיין לידים או לקוחות.</div>
      ) : (
        <div className="qb-newlead">
          <input placeholder="שם מלא *" value={nl.fullName} autoFocus
            onChange={e => setNl(v => ({ ...v, fullName: e.target.value }))} />
          <div className="qb-fld2">
            <input placeholder="טלפון" value={nl.phone} dir="ltr" onChange={e => setNl(v => ({ ...v, phone: e.target.value }))} />
            <input placeholder="אימייל *" type="email" value={nl.email} dir="ltr" onChange={e => setNl(v => ({ ...v, email: e.target.value }))} />
          </div>
          <input placeholder="שם העסק (אופציונלי)" value={nl.businessName}
            onChange={e => setNl(v => ({ ...v, businessName: e.target.value }))} />
          <label className="qb-check">
            <input type="checkbox" checked={hasPrev} onChange={e => setHasPrev(e.target.checked)} />
            <span className="qb-cn">עובר מרו״ח אחר?</span>
          </label>
          {hasPrev && (
            <>
              <input placeholder="שם הרו״ח הקודם" value={prev.name} onChange={e => setPrev(v => ({ ...v, name: e.target.value }))} />
              <div className="qb-fld2">
                <input placeholder="מייל הרו״ח הקודם" value={prev.email} dir="ltr" onChange={e => setPrev(v => ({ ...v, email: e.target.value }))} />
                <input placeholder="טלפון" value={prev.phone} dir="ltr" onChange={e => setPrev(v => ({ ...v, phone: e.target.value }))} />
              </div>
              <div className="qb-note">לאחר שהלקוח יאשר, נכין מכתב שחרור לרו״ח הקודם.</div>
            </>
          )}
          <button className="btn btn-primary btn-sm" disabled={!nl.fullName.trim()} style={{ alignSelf: 'flex-start' }}
            onClick={() => onPick({
              kind: 'new', fullName: nl.fullName.trim(),
              phone: nl.phone.trim() || undefined, email: nl.email.trim() || undefined,
              businessName: nl.businessName.trim() || undefined,
              hasPreviousAccountant: hasPrev,
              prevAccountantName: hasPrev ? prev.name.trim() || undefined : undefined,
              prevAccountantEmail: hasPrev ? prev.email.trim() || undefined : undefined,
              prevAccountantPhone: hasPrev ? prev.phone.trim() || undefined : undefined,
            })}>שימוש בליד זה</button>
        </div>
      )}
    </div>
  );
}

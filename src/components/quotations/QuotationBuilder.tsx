import { useEffect, useMemo, useRef, useState } from 'react';
import type { FirmProfile } from '../../types/firmProfile';
import type { Client } from '../../types';
import type {
  Lead, ServiceCatalogItem, ServiceCategory, QuotationTemplate, Quotation, QuotationItem, FutureService,
  PriceBasis, QuotationRepresentation,
} from '../../types/quotations';
import {
  SERVICE_CATEGORY_LABELS, SERVICE_CATEGORY_ORDER, QUOTATION_EVENT_LABELS, QUOTATION_STATUS_LABELS,
  DEFAULT_VAT_RATE, DEFAULT_EXPIRY_BUSINESS_DAYS, DEFAULT_INSTALLMENTS,
  defaultQuotationRepresentation, applySecondaryLevels,
} from '../../types/quotations';
import { businessDaysExpiry } from '../../utils/businessDays';
import {
  calcTotals, formatILS, itemFinalPrice, itemOriginalPrice, itemDisplayName,
  monthlyPlan, clampInstallments,
  currentMonthKey, monthsLeftInYear, formatMonth, formatMonthRange, addMonths,
} from '../../utils/quotationCalc';
import { deriveQuotationBrand } from './quotationBranding';
import { buildQuotationEmailHtml } from '../../utils/quotationEmailHtml';
import { generateQuotationPdf, downloadPdf } from '../../utils/quotationPdf';
import QuotationWebView, { type QuotationWebViewData } from './QuotationWebView';
import QuotationEmailsPanel from './QuotationEmailsPanel';
import QuotationRepresentationEditor, {
  validateQuotationRepresentation, representationSummary,
} from './QuotationRepresentationEditor';

type PreviewTab = 'web' | 'email' | 'pdf' | 'track';
type Device = 'desktop' | 'mobile';

interface RecipientDraft {
  kind: 'lead' | 'client' | 'new';
  id?: string;              // עבור lead/client קיים
  fullName: string;
  businessName?: string;
  email?: string;
  phone?: string;
  dealerType?: Lead['dealerType'];
  // רו"ח קודם — נלכד ביצירת ליד חדש; מפעיל את זרימת השחרור אחרי ההמרה
  hasPreviousAccountant?: boolean;
  prevAccountantName?: string;
  prevAccountantEmail?: string;
  prevAccountantPhone?: string;
}

/** האם הנמען עובר מרו"ח אחר — העובדה שקובעת שהייצוג נפתח כמייצג משני. */
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
  existing?: Quotation | null;               // עריכת טיוטה קיימת
  initialLeadId?: string;                    // הצעה חדשה שנפתחה מתוך ליד קיים
  existingQuotations: Quotation[];           // לאזהרת "כבר יש הצעה פתוחה"
  /** כבר קיים ייצוג פעיל/בתהליך למייל הזה? מחזיר הודעת חסימה, או null. */
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
}

// שמונה שנות מס אחרונות — מכסה כל לקוח שמגיע עם שנים פתוחות
const YEAR_OPTIONS: number[] = (() => {
  const current = new Date().getFullYear();
  return Array.from({ length: 8 }, (_, i) => current - i);
})();

// ברירת המחדל לפריסה — תאריך התחלה ומספר תשלומים אחידים לכל השורות.
// את מספר התשלומים אפשר לשנות גם בכל שורה בנפרד.
interface BillingPlan {
  startMonth: string;                 // 'YYYY-MM'
  installments: number;
}

function catalogToItem(svc: ServiceCatalogItem, overrides?: Partial<QuotationItem>): QuotationItem {
  const item: QuotationItem = {
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
  // ברירת המחדל של המשרד לדוח שנתי: המחיר שנתי, הגבייה חודשית. הרו"ח ממשיך
  // לחשוב ב"1,800 ₪ לשנה" והלקוח רואה 12 תשלומים. השורה ניתנת להחזרה לחיוב
  // שנתי חד־פעמי דרך "תדירות חיוב" בשורה עצמה.
  if (item.category === 'annual' && overrides?.priceBasis === undefined) {
    return {
      ...item,
      category: 'monthly',
      priceBasis: 'annual',
      annualPrice: item.clientPrice,
      prorationMode: 'full',
    };
  }
  return item;
}

// החלת הפריסה על שורה. שורה שהמחיר החודשי שלה נקבע ידנית לא נדרסת — זו
// החלטה של הרו"ח, לא תוצאה של נוסחה.
// החישוב הוא תמיד מחיר שנתי ÷ מספר תשלומים — כמו שגיא חושב על זה.
function applyPlanToItem(it: QuotationItem, plan: BillingPlan): QuotationItem {
  if (it.category !== 'monthly') return it;
  const next: QuotationItem = {
    ...it,
    priceBasis: it.priceBasis ?? 'monthly',
    billingStartMonth: plan.startMonth,
    installments: plan.installments,
  };
  if (it.prorationMode === 'manual') return next;
  next.prorationMode = 'full';
  if (next.priceBasis === 'annual' && it.annualPrice != null) {
    next.clientPrice = r2(it.annualPrice / plan.installments);
  }
  return next;
}

function r2(n: number): number {
  return Math.round(n * 100) / 100;
}


export default function QuotationBuilder({
  profile, services, templates, leads, clients, existing, initialLeadId, existingQuotations,
  checkRepEmailConflict, onSaveDraft, onSend, onBack,
}: Props) {
  const brand = useMemo(() => deriveQuotationBrand(profile), [profile]);

  const initialRecipient: RecipientDraft = (() => {
    if (existing?.leadId) {
      const l = leads.find(x => x.id === existing.leadId);
      if (l) return { kind: 'lead', id: l.id, fullName: l.fullName, businessName: l.businessName, email: l.email, phone: l.phone, dealerType: l.dealerType };
    }
    if (existing?.clientId) {
      const c = clients.find(x => x.id === existing.clientId);
      if (c) return { kind: 'client', id: c.id, fullName: `${c.firstName} ${c.lastName}`.trim(), email: c.email, phone: c.phone };
    }
    // הצעה חדשה שנפתחה מכרטיס ליד — הנמען כבר ידוע
    if (initialLeadId) {
      const l = leads.find(x => x.id === initialLeadId);
      if (l) return { kind: 'lead', id: l.id, fullName: l.fullName, businessName: l.businessName, email: l.email, phone: l.phone, dealerType: l.dealerType };
    }
    return { kind: 'new', fullName: '' };
  })();

  const [recipient, setRecipient] = useState<RecipientDraft>(initialRecipient);
  const [items, setItems] = useState<QuotationItem[]>(existing?.items ?? []);
  // מחירון שירותים עתידיים — ברירת מחדל בהצעה חדשה: השירותים החד־פעמיים
  // (הצהרת הון, מעבר מפטור למורשה וכו') — אלה שהלקוח עלול להיות מופתע מהם.
  const [futureIds, setFutureIds] = useState<Set<string>>(() =>
    existing
      ? new Set((existing.futureServices ?? []).map(f => f.serviceId).filter((v): v is string => !!v))
      : new Set(services.filter(s => s.active && s.defaultPrice > 0 && s.category === 'one_time').map(s => s.id)));
  const [vatRate] = useState<number>(existing?.vatRate ?? DEFAULT_VAT_RATE);
  const [templateId, setTemplateId] = useState<string | undefined>(existing?.templateId);
  const [emailSubject, setEmailSubject] = useState(existing?.emailSubject ?? 'הצעת מחיר מהמשרד');
  // הודעה אישית אחת שנכנסת גם למייל וגם לעמוד ההצעה. עד 2026-07-30 היו שני
  // שדות נפרדים, וגיא כתב בשניהם את אותו דבר. טיוטה ישנה שיש בה רק הערת עמוד
  // נפתחת איתה, כדי שהטקסט שנכתב לא ייעלם.
  const [emailMessage, setEmailMessage] = useState(
    existing?.emailMessage || existing?.notesForClient || '');
  const notesForClient = emailMessage;
  const [internalNotes, setInternalNotes] = useState(existing?.internalNotes ?? '');
  const [expiresAt, setExpiresAt] = useState(existing?.expiresAt ?? businessDaysExpiry(DEFAULT_EXPIRY_BUSINESS_DAYS));
  // הצעה ללקוח קיים היא לרוב שירות נוסף למי שכבר מיוצג — ולכן ברירת המחדל שם
  // היא לא לפתוח ייצוג. הצעה לליד חדש כן פותחת, שזה כל העניין.
  const [representation, setRepresentation] = useState<QuotationRepresentation>(() => {
    if (existing?.representation) return existing.representation;
    const base = defaultQuotationRepresentation(isTransferRecipient(initialRecipient, leads, clients));
    return initialRecipient.kind === 'client' ? { ...base, enabled: false } : base;
  });

  // פריסת התשלומים נגזרת מהשורות הקיימות בעריכת טיוטה, ומתחילה מהחודש הנוכחי
  // ב-12 תשלומים בהצעה חדשה.
  const initialPlan: BillingPlan = (() => {
    const m = (existing?.items ?? []).find(i => i.category === 'monthly' && !!i.billingStartMonth);
    return {
      startMonth: m?.billingStartMonth ?? currentMonthKey(),
      installments: clampInstallments(m?.installments),
    };
  })();
  const [plan, setPlan] = useState<BillingPlan>(initialPlan);

  // הצעה שכבר נשלחה נפתחת ישר על המעקב — זה מה שמעניין אחרי השליחה
  const hasTracking = !!existing && existing.status !== 'draft';
  const [tab, setTab] = useState<PreviewTab>(hasTracking ? 'track' : 'web');

  // בטלפון אין מקום לשתי עמודות — עוברים לעמודה אחת עם מתג עריכה/תצוגה
  const [narrow, setNarrow] = useState(() => typeof window !== 'undefined' && window.innerWidth < 920);
  const [mobilePane, setMobilePane] = useState<'edit' | 'preview'>('edit');
  useEffect(() => {
    const onResize = () => setNarrow(window.innerWidth < 920);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);
  const [device, setDevice] = useState<Device>('desktop');
  const [catalogOpen, setCatalogOpen] = useState(false);
  const [catalogSearch, setCatalogSearch] = useState('');
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [recipientPicker, setRecipientPicker] = useState(false);
  // דוחות לשנים פתוחות — לקוח שלא הגיש בשנים האחרונות
  const [priorServiceId, setPriorServiceId] = useState('');
  const [priorYears, setPriorYears] = useState<Set<number>>(new Set());
  const [priorPrice, setPriorPrice] = useState<number | ''>('');
  const [priorCategory, setPriorCategory] = useState<ServiceCategory>('one_time');
  const [sending, setSending] = useState<'test' | 'send' | null>(null);
  const [notice, setNotice] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);
  const [pdfBusy, setPdfBusy] = useState(false);

  const totals = calcTotals(items, vatRate);
  const hasMonthly = items.some(i => i.category === 'monthly');
  // הכרטיס מוצג גם כשאין עדיין שורה חודשית — אחרת אי אפשר לגלות שהפריסה קיימת
  const hasPriced = items.some(i => i.category !== 'included');

  // "יש שינויים שלא נשמרו" — נגזר מהשוואה לתמונת המצב האחרונה שנשמרה, כדי
  // שהכפתור לא ייתקע על "נשמר" בזמן שממשיכים לערוך.
  const stateKey = JSON.stringify([
    recipient, items, [...futureIds].sort(), emailSubject, emailMessage,
    notesForClient, internalNotes, templateId, expiresAt, representation,
  ]);
  const savedKey = useRef<string | null>(null);
  const dirty = savedKey.current !== stateKey;

  // התנגשות מייל בייצוג — רק כשהאישור אכן עתיד לפתוח ייצוג חדש
  const repEmailConflict = useMemo(() => {
    if (!representation.enabled || !checkRepEmailConflict) return null;
    const email = recipient.email?.trim();
    if (!email) return null;
    // לקוח קיים שכבר בתהליך אינו "התנגשות" — זו אותה רשומה
    if (recipient.kind === 'client') return null;
    return checkRepEmailConflict(email);
  }, [representation.enabled, recipient.email, recipient.kind, checkRepEmailConflict]);

  // אזהרה: כבר קיימת הצעה פתוחה לאותו נמען
  const openWarning = useMemo(() => {
    if (!recipient.id) return null;
    const open = existingQuotations.find(q =>
      q.id !== existing?.id &&
      (q.leadId === recipient.id || q.clientId === recipient.id) &&
      ['draft', 'sent', 'viewed'].includes(q.status));
    return open ? `כבר קיימת הצעה (${q_num(open)}) בסטטוס פתוח לנמען זה.` : null;
  }, [recipient.id, existingQuotations, existing?.id]);

  function applyTemplate(id: string) {
    setTemplateId(id || undefined);
    if (!id) return;
    const tpl = templates.find(t => t.id === id);
    if (!tpl) return;
    const svc = tpl.serviceIds
      .map(sid => services.find(s => s.id === sid))
      .filter((s): s is ServiceCatalogItem => Boolean(s));
    setItems(svc.map(s => applyPlanToItem(catalogToItem(s), plan)));
  }

  function addService(svc: ServiceCatalogItem) {
    setItems(prev => [...prev, applyPlanToItem(catalogToItem(svc), plan)]);
  }

  // משבצת חופשית — שירות שלא קיים בקטלוג וממציאים אותו תוך כדי שיחה.
  // serviceId ריק מסמן שהשם נערך ישירות בשורה.
  function addCustomItem() {
    setItems(prev => [...prev, {
      id: crypto.randomUUID(),
      name: '',
      category: 'one_time' as ServiceCategory,
      billingType: 'fixed' as const,
      quantity: 1,
      catalogPrice: 0,
      clientPrice: 0,
      vatFlag: true,
    }]);
  }
  function updateItem(id: string, patch: Partial<QuotationItem>) {
    setItems(prev => prev.map(it => {
      if (it.id !== id) return it;
      const next = { ...it, ...patch };
      // שורה שהפכה לחודשית מקבלת את הפריסה הנוכחית; שורה שיצאה מחודשי
      // משילה אותה, כדי שסכום חד־פעמי לא יגרור איתו "5 תשלומים".
      if (patch.category !== undefined && patch.category !== it.category) {
        return next.category === 'monthly'
          ? applyPlanToItem(next, plan)
          : { ...next, priceBasis: undefined, annualPrice: undefined, installments: undefined, billingStartMonth: undefined, prorationMode: undefined };
      }
      return next;
    }));
  }
  function removeItem(id: string) {
    setItems(prev => prev.filter(it => it.id !== id));
  }

  // שינוי בפריסה מחיל את עצמו על כל השורות החודשיות בבת אחת
  function updatePlan(patch: Partial<BillingPlan>) {
    const next: BillingPlan = { ...plan, ...patch, installments: clampInstallments(patch.installments ?? plan.installments) };
    setPlan(next);
    setItems(prev => prev.map(it => applyPlanToItem(it, next)));
  }

  // ─── דוחות לשנים פתוחות ───
  // כל שנה נוספת כשורה נפרדת: מחיר משלה, הנחה משלה ותדירות חיוב משלה.
  const annualServices = services.filter(s => s.active && s.category === 'annual');
  const priorService = annualServices.find(s => s.id === priorServiceId) ?? annualServices[0];
  const priorPriceValue = priorPrice === '' ? (priorService?.defaultPrice ?? 0) : priorPrice;

  function yearTaken(year: number): boolean {
    return items.some(it => it.year === year && it.serviceId === priorService?.id);
  }

  function togglePriorYear(year: number) {
    setPriorYears(prev => {
      const next = new Set(prev);
      next.has(year) ? next.delete(year) : next.add(year);
      return next;
    });
  }

  function addPriorYearReports() {
    if (!priorService) return;
    const added = [...priorYears]
      .sort((a, b) => a - b)
      .filter(y => !yearTaken(y))
      .map(y => applyPlanToItem(catalogToItem(priorService, {
        year: y, category: priorCategory, clientPrice: priorPriceValue,
      }), plan));
    if (added.length === 0) return;
    setItems(prev => [...prev, ...added]);
    setPriorYears(new Set());
  }

  // מועמדים לשירותים עתידיים: שירותים פעילים בתשלום שאינם כבר בהצעה
  const usedIds = new Set(items.map(i => i.serviceId).filter(Boolean));
  const futureCandidates = services.filter(s => s.active && s.defaultPrice > 0 && !usedIds.has(s.id));
  const futureServices: FutureService[] = futureCandidates
    .filter(s => futureIds.has(s.id))
    .map(s => ({
      id: s.id, serviceId: s.id, name: s.name, description: s.description,
      category: s.category, price: s.defaultPrice, vatFlag: s.vatFlag,
      billingType: s.billingType, unitLabel: s.unitLabel,
    }));

  const webData: QuotationWebViewData = {
    quotationNumber: existing?.quotationNumber ?? 'טיוטה',
    recipientName: recipient.fullName || 'הלקוח',
    businessName: recipient.businessName,
    items, futureServices, vatRate, notesForClient, expiresAt,
    representation,
  };
  const emailHtml = useMemo(() => buildQuotationEmailHtml({
    quotationNumber: existing?.quotationNumber ?? 'טיוטה',
    recipientName: recipient.fullName || 'הלקוח',
    businessName: recipient.businessName,
    items, vatRate, message: emailMessage, quotationLink: '#', expiresAt,
  }, brand), [items, vatRate, emailMessage, recipient.fullName, recipient.businessName, expiresAt, brand, existing?.quotationNumber]);

  async function handleSave() {
    setError(null);
    if (!recipient.fullName.trim()) {
      setError('יש להזין שם נמען (ליד או לקוח) לפני שמירה.');
      return;
    }
    setSaving(true);
    try {
      await onSaveDraft(buildPayload());
      savedKey.current = stateKey;
      setSavedAt(Date.now());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'שמירה נכשלה');
    } finally {
      setSaving(false);
    }
  }

  function buildPayload(): SaveDraftPayload {
    return {
      id: existing?.id,
      recipient, items, futureServices, vatRate,
      emailSubject, emailMessage, notesForClient, internalNotes,
      templateId, expiresAt,
      representation: representationWithRecipient(),
    };
  }

  /**
   * שם ומייל הנמען נכתבים ל-prefill רק ברגע השמירה, ולא בזמן העריכה: הנמען
   * עשוי להתחלף אחרי שהייצוג הוגדר, ואז prefill היה נשאר על השם הקודם.
   */
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

  async function handleSend(isTest: boolean) {
    setError(null);
    setNotice(null);
    if (!recipient.fullName.trim()) { setError('יש להזין נמען לפני שליחה.'); return; }
    if (!isTest && !recipient.email?.trim()) { setError('לנמען אין כתובת מייל — לא ניתן לשלוח ללקוח.'); return; }
    if (items.length === 0) { setError('אין שירותים בהצעה.'); return; }
    if (items.some(i => !i.name.trim())) { setError('יש שורה חופשית בלי שם — יש לתת לה שם או להסיר אותה לפני שליחה.'); return; }
    // הייצוג נפתח אוטומטית עם האישור, ואז אין הזדמנות לתקן — ולכן נבדק כאן
    const repError = validateQuotationRepresentation(representation);
    if (repError) { setError(`ייצוג: ${repError}`); return; }
    if (!isTest && repEmailConflict) { setError(`ייצוג: ${repEmailConflict}`); return; }
    setSending(isTest ? 'test' : 'send');
    try {
      const res = await onSend(buildPayload(), isTest);
      if (res.ok) {
        savedKey.current = stateKey;
        setNotice({ kind: 'ok', text: isTest ? 'מייל בדיקה נשלח אליך.' : 'ההצעה נשלחה ללקוח.' });
        if (!isTest) { setTimeout(onBack, 900); }
      } else {
        setNotice({ kind: 'err', text: `השליחה נכשלה: ${res.error ?? 'שגיאה'}` });
      }
    } finally {
      setSending(null);
    }
  }

  async function handleDownloadPdf() {
    setPdfBusy(true);
    try {
      const bytes = await generateQuotationPdf({
        quotationNumber: existing?.quotationNumber ?? 'טיוטה',
        recipientName: recipient.fullName || 'הלקוח',
        businessName: recipient.businessName,
        items, vatRate, notesForClient, expiresAt, representation,
      }, brand);
      downloadPdf(bytes, `הצעת מחיר ${existing?.quotationNumber ?? 'טיוטה'}.pdf`);
    } catch (e) {
      setNotice({ kind: 'err', text: `הפקת ה-PDF נכשלה: ${e instanceof Error ? e.message : String(e)}` });
    } finally {
      setPdfBusy(false);
    }
  }

  // יציאה עם עריכות פתוחות מאבדת אותן — לכן שואלים לפני
  function handleBack() {
    const worthSaving = items.length > 0 || recipient.fullName.trim().length > 0;
    if (dirty && worthSaving && !window.confirm('יש שינויים שלא נשמרו בהצעה. לצאת בלי לשמור?')) return;
    onBack();
  }

  const catalogFiltered = services.filter(s =>
    s.active && (!catalogSearch.trim() || s.name.includes(catalogSearch.trim())));
  const usedServiceIds = new Set(items.map(i => i.serviceId).filter(Boolean));

  // אותן שלוש פעולות מוצגות פעמיים — בראש המסך ובסוף פאנל העריכה. מי שגלל
  // עד סוף המילוי סיים בדיוק שם, ולשלוח אותו חזרה לראש המסך זה מסע מיותר.
  const actionButtons = (full = false) => (
    <>
      <button className="btn btn-secondary" style={full ? { flex: 1 } : undefined}
        onClick={() => handleSend(true)} disabled={sending !== null || saving}>
        {sending === 'test' ? 'שולח…' : 'מייל בדיקה'}
      </button>
      <button className="btn btn-secondary" style={full ? { flex: 1 } : undefined}
        onClick={handleSave} disabled={saving || sending !== null}>
        {saving ? 'שומר…' : !dirty && savedAt ? 'נשמר' : 'שמירת טיוטה'}
      </button>
      <button className="btn btn-primary" style={full ? { flex: 2 } : undefined}
        onClick={() => handleSend(false)} disabled={sending !== null || saving}>
        {sending === 'send' ? 'שולח…' : 'שליחה ללקוח'}
      </button>
    </>
  );

  return (
    <div dir="rtl">
      {/* header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
        <button className="btn btn-ghost" onClick={handleBack}>→ חזרה</button>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 'var(--fs-20)', fontWeight: 600 }}>{existing ? `עריכת הצעה ${existing.quotationNumber}` : 'הצעת מחיר חדשה'}</div>
          <div style={{ fontSize: 'var(--fs-13)', color: 'var(--gray-500)', marginTop: 2 }}>
            {dirty && savedAt ? 'יש שינויים שלא נשמרו' : 'בונים, מציגים תצוגה מקדימה ושומרים — הכל במסך אחד'}
          </div>
        </div>
        {actionButtons()}
      </div>

      {error && <div className="alert alert-warning" style={{ marginBottom: 12 }}>{error}</div>}
      {notice && (
        <div className={`alert ${notice.kind === 'ok' ? 'alert-info' : 'alert-warning'}`} style={{ marginBottom: 12 }}>{notice.text}</div>
      )}

      {/* מתג עריכה/תצוגה — רק במסך צר (טלפון) */}
      {narrow && (
        <div className="tabs" style={{ marginBottom: 12 }}>
          <button className={`tab ${mobilePane === 'edit' ? 'active' : ''}`} onClick={() => setMobilePane('edit')}>עריכה</button>
          <button className={`tab ${mobilePane === 'preview' ? 'active' : ''}`} onClick={() => setMobilePane('preview')}>תצוגה מקדימה</button>
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: narrow ? '1fr' : 'minmax(360px, 460px) 1fr', gap: 18, alignItems: 'start' }}>

        {/* ── פאנל בקרה ── */}
        <div style={{ display: narrow && mobilePane === 'preview' ? 'none' : 'flex', flexDirection: 'column', gap: 14 }}>

          {/* נמען */}
          <div style={card}>
            <div style={cardTitle}>נמען ההצעה</div>
            {recipient.fullName && !recipientPicker ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 600, fontSize: 'var(--fs-15)' }}>{recipient.fullName}</div>
                  <div style={{ fontSize: 'var(--fs-12)', color: 'var(--gray-500)' }}>
                    {recipient.kind === 'lead' ? 'ליד' : recipient.kind === 'client' ? 'לקוח קיים' : 'ליד חדש'}
                    {recipient.email ? ` · ${recipient.email}` : ''}{recipient.phone ? ` · ${recipient.phone}` : ''}
                  </div>
                </div>
                <button className="btn btn-sm btn-secondary" onClick={() => setRecipientPicker(true)}>שינוי</button>
              </div>
            ) : (
              <RecipientEditor
                leads={leads} clients={clients} value={recipient}
                onPick={(r) => {
                  setRecipient(r);
                  setRecipientPicker(false);
                  // לקוח שכבר בייצוג — אין מה לפתוח לו ייצוג שני. כיבוי בלבד:
                  // אם הרו"ח הדליק ידנית, לא נדרוס את הבחירה שלו בכיוון השני.
                  const picked = r.kind === 'client' ? clients.find(c => c.id === r.id) : undefined;
                  if (picked?.representationStatus) {
                    setRepresentation(prev => prev.enabled ? { ...prev, enabled: false } : prev);
                  }
                  // נמען שעובר מרו"ח אחר — הייצוג יורד למשני. כיוון אחד בלבד:
                  // העלאה חזרה לראשי היא החלטה של הרו"ח, לא של החלפת נמען.
                  if (isTransferRecipient(r, leads, clients)) {
                    setRepresentation(prev => ({ ...prev, areas: applySecondaryLevels(prev.areas) }));
                  }
                }}
              />
            )}
            {openWarning && <div className="alert alert-info" style={{ marginTop: 10, fontSize: 'var(--fs-13)' }}>{openWarning}</div>}
          </div>

          {/* תבנית */}
          <div style={card}>
            <div style={cardTitle}>תבנית</div>
            <select value={templateId ?? ''} onChange={e => applyTemplate(e.target.value)}>
              <option value="">בחירת תבנית — טעינת שירותים מומלצים…</option>
              {templates.filter(t => t.active).map(t => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </select>
            <div style={{ fontSize: 'var(--fs-12)', color: 'var(--gray-500)', marginTop: 6 }}>בחירת תבנית טוענת שירותים מומלצים. אפשר לערוך הכל אחר כך.</div>
          </div>

          {/* שירותים */}
          <div style={card}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 12 }}>
              <div style={{ ...cardTitle, marginBottom: 0, flex: 1 }}>שירותים</div>
              <button className="btn btn-sm btn-secondary" onClick={addCustomItem} title="שורה ריקה עם שם ומחיר חופשיים — למה שלא קיים בקטלוג">+ שורה חופשית</button>
              {/* שתי דרכים להוסיף שירות הן שתי דרכים, לא ראשית ומשנית.
                  הכחול המלא כאן התחרה עם "שליחה ללקוח" — הפעולה הראשית
                  היחידה במסך. שתיהן משניות עכשיו, באותו משקל. */}
              <button className="btn btn-sm btn-secondary" onClick={() => setCatalogOpen(o => !o)}>+ מהקטלוג</button>
            </div>

            {catalogOpen && (
              <div style={{ border: '1px solid var(--gray-200)', borderRadius: 10, padding: 10, marginBottom: 12, background: 'var(--gray-50)' }}>
                <input placeholder="חיפוש בקטלוג…" value={catalogSearch} onChange={e => setCatalogSearch(e.target.value)} style={{ marginBottom: 8 }} />
                <div style={{ maxHeight: 220, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 4 }}>
                  {catalogFiltered.length === 0 && <div style={{ fontSize: 'var(--fs-13)', color: 'var(--gray-500)', padding: 8 }}>הקטלוג ריק — הגדר שירותים בהגדרות המשרד ← הצעות מחיר.</div>}
                  {catalogFiltered.map(s => (
                    <button key={s.id} onClick={() => addService(s)}
                      style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 9px', border: '1px solid var(--gray-200)', borderRadius: 8, background: 'var(--card)', cursor: 'pointer', textAlign: 'start', fontFamily: 'inherit' }}>
                      <span style={{ flex: 1 }}>
                        <span style={{ fontWeight: 500, fontSize: 'var(--fs-13)' }}>{s.name}</span>
                        <span style={{ fontSize: 'var(--fs-12)', color: 'var(--gray-400)', marginInlineStart: 6 }}>{SERVICE_CATEGORY_LABELS[s.category]}</span>
                      </span>
                      <span style={{ fontSize: 'var(--fs-12)', color: 'var(--gray-600)', fontVariantNumeric: 'tabular-nums' }}>
                        {s.defaultPrice > 0 ? formatILS(s.defaultPrice) : 'כלול'}{usedServiceIds.has(s.id) ? ' ✓' : ''}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {items.length === 0 ? (
              <div style={{ fontSize: 'var(--fs-13)', color: 'var(--gray-500)', textAlign: 'center', padding: '16px 0' }}>טרם נוספו שירותים. בחר תבנית או הוסף שירות.</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {items.map(item => (
                  <LineItem key={item.id} item={item} vatRate={vatRate} plan={plan}
                    onChange={p => updateItem(item.id, p)} onRemove={() => removeItem(item.id)} />
                ))}
              </div>
            )}
          </div>

          {/* פריסת תשלומים — חלה על כל השורות החודשיות יחד */}
          {hasPriced && (
            <div style={card}>
              <div style={{ ...cardTitle, marginBottom: 6 }}>פריסת תשלומים</div>
              <div style={{ fontSize: 'var(--fs-12)', color: 'var(--gray-500)', marginBottom: 10, lineHeight: 1.5 }}>
                לקוח שמתחיל באמצע שנה לא משלם 12 תשלומים. כאן קובעים מתי מתחילים וכמה תשלומים — והשורות החודשיות מתעדכנות יחד.
              </div>

              {!hasMonthly && (
                <div className="alert alert-info" style={{ fontSize: 'var(--fs-12)', marginBottom: 10, lineHeight: 1.55 }}>
                  אין עדיין שורה שמשולמת בתשלומים חודשיים. בשורה שרוצים לפרוס — לחץ
                  {' '}<b>«⤶ לפרוס לתשלומים חודשיים»</b>, והמחיר שלה יהפוך למחיר שנתי שמתחלק כאן.
                </div>
              )}

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                <label style={miniLabel}>חודש התשלום הראשון
                  <input type="month" value={plan.startMonth} style={miniInput}
                    onChange={e => e.target.value && updatePlan({ startMonth: e.target.value })} />
                </label>
                <label style={miniLabel}>מספר תשלומים
                  <input type="number" min={1} max={60} value={plan.installments} style={miniInput}
                    onChange={e => updatePlan({ installments: Number(e.target.value) || 1 })} />
                </label>
              </div>

              <div style={{ display: 'flex', gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
                <PlanChip active={plan.installments === DEFAULT_INSTALLMENTS}
                  onClick={() => updatePlan({ installments: DEFAULT_INSTALLMENTS })}>
                  שנה מלאה · 12
                </PlanChip>
                <PlanChip active={plan.installments === monthsLeftInYear(plan.startMonth)}
                  onClick={() => updatePlan({ installments: monthsLeftInYear(plan.startMonth) })}>
                  עד סוף השנה · {monthsLeftInYear(plan.startMonth)}
                </PlanChip>
              </div>

              <div style={{ fontSize: 'var(--fs-12)', color: 'var(--gray-500)', marginTop: 8, lineHeight: 1.55 }}>
                בוחרים פעם אחת — וזה חל על כל השורות החודשיות בהצעה.
              </div>
            </div>
          )}

          {/* דוחות לשנים פתוחות — לקוח שלא הגיש בשנים האחרונות */}
          <Section icon="📅" title="דוחות לשנים פתוחות"
            summary={(() => { const n = items.filter(i => i.year != null).length; return n ? `נוספו ${n} דוחות` : 'לא נדרש? דלג'; })()}>
            <div style={{ fontSize: 'var(--fs-12)', color: 'var(--gray-500)', marginBottom: 10, lineHeight: 1.5 }}>
              בוחרים את השנים שטרם דווחו — כל שנה נוספת כשורה נפרדת בהצעה, עם מחיר, הנחה ותדירות חיוב משלה.
            </div>

            {annualServices.length === 0 ? (
              <div style={{ fontSize: 'var(--fs-13)', color: 'var(--gray-500)' }}>
                אין שירות בקטגוריית "שנתי" בקטלוג. הוסף אחד בהגדרות המשרד ← הצעות מחיר.
              </div>
            ) : (
              <>
                <select value={priorService?.id ?? ''} onChange={e => { setPriorServiceId(e.target.value); setPriorPrice(''); }}>
                  {annualServices.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>

                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, margin: '10px 0' }}>
                  {YEAR_OPTIONS.map(y => {
                    const taken = yearTaken(y);
                    const on = priorYears.has(y);
                    return (
                      <button key={y} onClick={() => togglePriorYear(y)} disabled={taken}
                        title={taken ? 'כבר נוספה להצעה' : undefined}
                        style={{
                          padding: '5px 11px', borderRadius: 999, fontFamily: 'inherit', fontSize: 'var(--fs-13)',
                          fontVariantNumeric: 'tabular-nums',
                          cursor: taken ? 'default' : 'pointer',
                          border: `1px solid ${on ? 'var(--blue)' : 'var(--gray-200)'}`,
                          background: taken ? 'var(--gray-100)' : on ? 'var(--blue)' : 'var(--card)',
                          color: taken ? 'var(--gray-400)' : on ? '#fff' : 'var(--gray-700)',
                          fontWeight: on ? 600 : 400,
                        }}>
                        {y}{taken ? ' ✓' : ''}
                      </button>
                    );
                  })}
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                  <label style={miniLabel}>מחיר לדוח
                    <input type="number" min={0} value={priorPriceValue} style={miniInput}
                      onChange={e => setPriorPrice(Math.max(0, Number(e.target.value) || 0))} />
                  </label>
                  <label style={miniLabel}>תדירות חיוב
                    <select value={priorCategory} style={miniInput}
                      onChange={e => setPriorCategory(e.target.value as ServiceCategory)}>
                      {SERVICE_CATEGORY_ORDER.map(c => (
                        <option key={c} value={c}>{SERVICE_CATEGORY_LABELS[c]}</option>
                      ))}
                    </select>
                  </label>
                </div>
                {priorCategory === 'monthly' && priorPriceValue > 0 && (
                  <div style={{ marginTop: 5, fontSize: 'var(--fs-12)', color: 'var(--gray-500)' }}>
                    יתווסף כשורה חודשית ויקבל את פריסת התשלומים שלמעלה ({plan.installments} תשלומים).
                  </div>
                )}

                <button className="btn btn-sm btn-primary" disabled={priorYears.size === 0}
                  onClick={addPriorYearReports} style={{ marginTop: 10 }}>
                  {priorYears.size === 0 ? '+ בחר שנים להוספה'
                    : priorYears.size === 1 ? '+ הוספת דוח אחד'
                    : `+ הוספת ${priorYears.size} דוחות`}
                </button>
              </>
            )}
          </Section>

          {/* שירותים עתידיים — שקיפות מחירים מראש */}
          <Section icon="🔮" title="שירותים עתידיים"
            summary={futureServices.length ? `${futureServices.length} במחירון` : 'ללא'}>
            <div style={{ fontSize: 'var(--fs-12)', color: 'var(--gray-500)', marginBottom: 10, lineHeight: 1.5 }}>
              יוצגו ללקוח כמחירון "אם וכאשר", כדי שלא יופתע ממחיר בעתיד. לא נכלל בסכומי ההצעה.
            </div>
            {futureCandidates.length === 0 ? (
              <div style={{ fontSize: 'var(--fs-13)', color: 'var(--gray-500)' }}>כל השירותים בתשלום כבר כלולים בהצעה.</div>
            ) : (
              <div style={{ maxHeight: 190, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 2 }}>
                {futureCandidates.map(s => (
                  <label key={s.id} className="checkbox-row" style={{ padding: '4px 0', fontSize: 'var(--fs-13)' }}>
                    <input type="checkbox" checked={futureIds.has(s.id)} onChange={() => setFutureIds(prev => {
                      const next = new Set(prev);
                      next.has(s.id) ? next.delete(s.id) : next.add(s.id);
                      return next;
                    })} />
                    <span style={{ flex: 1 }}>{s.name}</span>
                    <span style={{ color: 'var(--gray-500)', fontSize: 'var(--fs-12)', whiteSpace: 'nowrap' }}>
                      {formatILS(s.defaultPrice)}{s.vatFlag ? ' + מע״מ' : ''}
                    </span>
                  </label>
                ))}
              </div>
            )}
          </Section>

          {/* מייל */}
          <Section icon="✉️" title="מייל"
            summary={emailMessage.trim() ? 'נושא + הודעה אישית' : emailSubject}>
            <label style={fieldLabel}>נושא
              <input value={emailSubject} onChange={e => setEmailSubject(e.target.value)} style={{ marginTop: 4 }} />
            </label>
            <label style={{ ...fieldLabel, marginTop: 10 }}>הודעה אישית ללקוח (אופציונלי)
              <textarea rows={3} value={emailMessage} onChange={e => setEmailMessage(e.target.value)}
                placeholder="למשל: אחרי שדיברנו הבנתי שהדבר הכי דחוף אצלך הוא לסגור את השנים הפתוחות — התחלתי מזה." style={{ marginTop: 4 }} />
            </label>
            <div style={{ fontSize: 'var(--fs-12)', color: 'var(--gray-500)', marginTop: 6, lineHeight: 1.55 }}>
              נכתבת פעם אחת ומופיעה בשני המקומות: במייל, ובעמוד ההצעה מעל המחיר.
              שתי שורות אמיתיות מהשיחה מוכיחות שההצעה לא נשלחה בהעתק-הדבק.
              המייל עצמו לא מציג מחירים — הם מחכים בעמוד ההצעה.
            </div>
          </Section>

          {/* ייצוג — מה שיקרה ברגע שהלקוח יאשר */}
          <Section icon="⚖️" title="ייצוג מול הרשויות"
            summary={representationSummary(representation)}
            defaultOpen={!!repEmailConflict || !!validateQuotationRepresentation(representation)}>
            <QuotationRepresentationEditor
              value={representation}
              onChange={setRepresentation}
              recipientName={recipient.fullName}
              recipientEmail={recipient.email}
              emailConflict={repEmailConflict}
              isTransfer={isTransferRecipient(recipient, leads, clients)}
            />
          </Section>

          {/* הגדרות */}
          <Section icon="⚙️" title="פרטי ההצעה"
            summary={`תוקף עד ${new Date(expiresAt).toLocaleDateString('he-IL')}${internalNotes.trim() ? ' · יש הערה פנימית' : ''}`}>
            <label style={fieldLabel}>הערה פנימית (לא נשלחת ללקוח)
              <textarea rows={2} value={internalNotes} onChange={e => setInternalNotes(e.target.value)} style={{ marginTop: 4 }} />
            </label>
            <label style={{ ...fieldLabel, marginTop: 10 }}>תוקף ההצעה
              <input type="date" value={expiresAt.slice(0, 10)}
                onChange={e => { const d = new Date(e.target.value); d.setHours(23, 59, 0, 0); setExpiresAt(d.toISOString()); }}
                style={{ marginTop: 4 }} />
            </label>
          </Section>

          {/* פס סיכום דביק — לאן זה מסתכם, בלי לעזוב את פאנל העריכה */}
          <div style={{
            position: 'sticky', bottom: 0, zIndex: 2,
            background: 'var(--surface-0)', borderTop: '1px solid var(--hairline-1)',
            padding: '10px 0',
          }}>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 14, alignItems: 'baseline' }}>
              <TotalChip label="חודשי" value={totals.monthly.withVat}
                suffix={totals.installments && totals.installments !== DEFAULT_INSTALLMENTS ? `× ${totals.installments}` : 'לחודש'} />
              <TotalChip label="שנתי" value={totals.annual.withVat} suffix="לשנה" />
              <TotalChip label="חד־פעמי" value={totals.oneTime.withVat} />
              {totals.totalDiscount > 0 && (
                <span style={{ fontSize: 'var(--fs-12)', color: 'var(--green, #059669)', marginInlineStart: 'auto' }}>
                  הנחה {formatILS(Math.round(totals.totalDiscount))}
                </span>
              )}
            </div>
            {totals.monthly.withVat > 0 && (totals.hasPartialTerm || totals.changesAfterPeriod) && (
              <div style={{ fontSize: 'var(--fs-12)', color: 'var(--gray-500)', marginTop: 6, lineHeight: 1.5 }}>
                {totals.hasPartialTerm && totals.installments && (
                  <>סה״כ בתקופה: <b>{formatILS(Math.round(totals.monthlyPeriod.withVat))}</b>
                    {plan.startMonth ? ` · ${formatMonthRange(plan.startMonth, addMonths(plan.startMonth, totals.installments - 1))}` : ''}</>
                )}
                {totals.changesAfterPeriod && (
                  <> · אחר כך: <b>{formatILS(Math.round(totals.monthlyOngoing.withVat))}</b> לחודש</>
                )}
              </div>
            )}
            {items.length === 0 && (
              <div style={{ fontSize: 'var(--fs-12)', color: 'var(--gray-400)', marginTop: 4 }}>אין עדיין שירותים בהצעה.</div>
            )}
          </div>

          {/* סוף המילוי — הפעולות כאן, בלי לחזור לראש המסך */}
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 4 }}>
            {actionButtons(true)}
          </div>
        </div>

        {/* ── תצוגה מקדימה חיה ── */}
        <div style={{ position: narrow ? 'static' : 'sticky', top: 76, display: narrow && mobilePane === 'edit' ? 'none' : undefined }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
            <div className="tabs" style={{ margin: 0 }}>
              {hasTracking && <button className={`tab ${tab === 'track' ? 'active' : ''}`} onClick={() => setTab('track')}>מעקב</button>}
              <button className={`tab ${tab === 'web' ? 'active' : ''}`} onClick={() => setTab('web')}>עמוד ההצעה</button>
              <button className={`tab ${tab === 'email' ? 'active' : ''}`} onClick={() => setTab('email')}>מייל</button>
              <button className={`tab ${tab === 'pdf' ? 'active' : ''}`} onClick={() => setTab('pdf')}>PDF</button>
            </div>
            {tab !== 'pdf' && tab !== 'track' && (
              <div className="tabs" style={{ margin: 0, marginInlineStart: 'auto' }}>
                <button className={`tab ${device === 'desktop' ? 'active' : ''}`} onClick={() => setDevice('desktop')}>דסקטופ</button>
                <button className={`tab ${device === 'mobile' ? 'active' : ''}`} onClick={() => setDevice('mobile')}>מובייל</button>
              </div>
            )}
          </div>

          {/* תצוגה מקדימה של מסמך שהלקוח יקבל — נשארת בהירה גם במצב כהה */}
          <div className="pivo-light" style={{ border: '1px solid var(--gray-200)', borderRadius: 14, overflow: 'hidden', background: '#F4F3EF', height: 'calc(100vh - 180px)', minHeight: 520 }}>
            <div style={{ height: '100%', overflowY: 'auto', display: 'flex', justifyContent: 'center' }}>
              <div style={{ width: device === 'mobile' && tab !== 'pdf' && tab !== 'track' ? 390 : '100%', maxWidth: '100%', transition: 'width .2s' }}>
                {tab === 'track' && existing && <TrackingPanel quotation={existing} brand={brand} />}
                {tab === 'web' && <QuotationWebView data={webData} brand={brand} compact={device === 'mobile' || narrow} />}
                {tab === 'email' && (
                  <iframe title="preview-email" srcDoc={emailHtml} style={{ width: '100%', height: '100%', border: 'none', minHeight: 520 }} />
                )}
                {tab === 'pdf' && (
                  <div style={{ padding: 40, textAlign: 'center', color: 'var(--gray-500)' }}>
                    <div style={{ fontSize: 40, marginBottom: 12 }}>📄</div>
                    <div style={{ fontWeight: 600, marginBottom: 6, color: 'var(--gray-700)' }}>ה-PDF של ההצעה</div>
                    <div style={{ fontSize: 'var(--fs-13)', marginBottom: 16 }}>מופק אוטומטית ותואם לעמוד ההצעה. אפשר להוריד ולבדוק:</div>
                    <button className="btn btn-primary" disabled={pdfBusy || items.length === 0} onClick={handleDownloadPdf}>
                      {pdfBusy ? 'מפיק…' : 'הורדת PDF לבדיקה'}
                    </button>
                    <div style={{ marginTop: 18, display: 'inline-flex', flexDirection: 'column', gap: 4, textAlign: 'start', background: 'var(--card)', border: '1px solid var(--gray-200)', borderRadius: 10, padding: 16 }}>
                      {totals.monthly.withVat > 0 && <span>חודשי: <b>{formatILS(Math.round(totals.monthly.withVat))}</b></span>}
                      {totals.annual.withVat > 0 && <span>שנתי: <b>{formatILS(Math.round(totals.annual.withVat))}</b></span>}
                      {totals.oneTime.withVat > 0 && <span>חד־פעמי: <b>{formatILS(Math.round(totals.oneTime.withVat))}</b></span>}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function q_num(q: Quotation): string { return q.quotationNumber; }

// ─── פאנל מעקב להצעה שנשלחה ─────────────────────────────────────────────────
// עונה על שלוש שאלות בלי לצאת מהמסך: איפה זה עומד (אבני דרך + יומן אירועים),
// מה בדיוק הלקוח קיבל (העתק המייל שנבנה מה-snapshot הקפוא), ומי חתם.
function TrackingPanel({ quotation, brand }: { quotation: Quotation; brand: ReturnType<typeof deriveQuotationBrand> }) {
  const [copied, setCopied] = useState(false);
  const [contractBusy, setContractBusy] = useState(false);
  const snap = quotation.snapshot;

  // הורדה ידנית של ההסכם החתום — אותו PDF שנשמר במסמכי הלקוח בהמרה
  async function downloadContract() {
    setContractBusy(true);
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
      downloadPdf(bytes, `הסכם התקשרות — הצעה ${quotation.quotationNumber}.pdf`);
    } finally {
      setContractBusy(false);
    }
  }
  const link = quotation.publicToken ? `${window.location.origin}/?quote=${quotation.publicToken}` : null;

  const applyPlaceholders = (s: string) => {
    if (!snap || !link) return s;
    const ctx: Record<string, string> = {
      '{{clientName}}': snap.recipientName,
      '{{businessName}}': snap.businessName || snap.recipientName,
      '{{quotationNumber}}': snap.quotationNumber,
      '{{quotationLink}}': link,
    };
    return Object.entries(ctx).reduce((acc, [k, v]) => acc.split(k).join(v ?? ''), s);
  };

  // המייל משוחזר מה-snapshot שהוקפא ברגע השליחה — לא מהשדות החיים,
  // כדי שמה שמוצג כאן יהיה באמת מה שנשלח.
  const sentEmailHtml = useMemo(() => {
    if (!snap || !link) return null;
    return buildQuotationEmailHtml({
      quotationNumber: snap.quotationNumber,
      recipientName: snap.recipientName,
      businessName: snap.businessName,
      items: snap.items,
      vatRate: snap.vatRate,
      message: applyPlaceholders(snap.emailMessage || ''),
      quotationLink: link,
      expiresAt: quotation.expiresAt,
    }, brand);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [snap, link, brand, quotation.expiresAt]);

  const fmt = (iso?: string) => iso
    ? new Date(iso).toLocaleString('he-IL', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
    : null;

  const events = [...quotation.events].sort((a, b) => (b.at || '').localeCompare(a.at || ''));
  const reminders = quotation.events.filter(e => e.type === 'reminder_sent' || e.type === 'sent').length - 1;

  const milestones = [
    { label: 'נשלחה ללקוח', at: quotation.sentAt, icon: '📤' },
    { label: 'נצפתה לראשונה', at: quotation.firstViewedAt, icon: '👀' },
    { label: 'אושרה ונחתמה', at: quotation.approvedAt, icon: '✅' },
  ];

  const panel: React.CSSProperties = { borderTop: '1px solid var(--hairline-2)', padding: '14px 0' };

  async function copyLink() {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch { /* דפדפן חוסם — הקישור מוצג וניתן להעתקה ידנית */ }
  }

  return (
    <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 12, direction: 'rtl' }}>

      {/* אבני דרך */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
        {milestones.map(m => (
          <div key={m.label} style={{ ...panel, padding: '10px 12px', opacity: m.at ? 1 : .55 }}>
            <div style={{ fontSize: 'var(--fs-12)', fontWeight: 600 }}>{m.icon} {m.label}</div>
            <div style={{ fontSize: 'var(--fs-12)', color: 'var(--gray-500)', marginTop: 3 }}>{fmt(m.at) ?? 'עדיין לא'}</div>
          </div>
        ))}
      </div>

      <div style={{ fontSize: 'var(--fs-12)', color: 'var(--gray-500)' }}>
        סטטוס נוכחי: <b style={{ color: 'var(--gray-800)' }}>{QUOTATION_STATUS_LABELS[quotation.status]}</b>
        {reminders > 0 ? ` · נשלחו ${reminders} תזכורות` : ''}
      </div>

      {/* קישור ההצעה */}
      {link && (
        <div style={{ ...panel, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <div style={{ fontSize: 'var(--fs-12)', fontWeight: 600 }}>הקישור שנשלח ללקוח</div>
          <div dir="ltr" style={{ flex: 1, minWidth: 160, fontSize: 'var(--fs-12)', color: 'var(--gray-500)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{link}</div>
          <button className="btn btn-sm btn-secondary" onClick={copyLink}>{copied ? 'הועתק' : 'העתקה'}</button>
          <a className="btn btn-sm btn-ghost" href={link} target="_blank" rel="noreferrer">פתיחה ↗</a>
        </div>
      )}

      {/* חתימת הלקוח */}
      {quotation.approvalSignature && (
        <div style={panel}>
          <div style={{ fontSize: 'var(--fs-13)', fontWeight: 600, marginBottom: 8 }}>חתימת הלקוח</div>
          <div style={{ background: '#fff', border: '1px solid var(--gray-200)', borderRadius: 8, padding: 8, display: 'inline-block' }}>
            <img src={quotation.approvalSignature} alt="חתימת הלקוח" style={{ maxHeight: 90, maxWidth: '100%', display: 'block' }} />
          </div>
          <div style={{ fontSize: 'var(--fs-12)', color: 'var(--gray-500)', marginTop: 6 }}>
            {quotation.approvalSignerName ? `נחתם על ידי ${quotation.approvalSignerName}` : 'נחתם'}
            {quotation.approvedAt ? ` · ${fmt(quotation.approvedAt)}` : ''}
          </div>
          <button className="btn btn-sm btn-secondary" style={{ marginTop: 8 }} disabled={contractBusy} onClick={downloadContract}>
            {contractBusy ? 'מפיק…' : 'הורדת ההסכם החתום (PDF)'}
          </button>
          <div style={{ fontSize: 'var(--fs-12)', color: 'var(--gray-500)', marginTop: 4 }}>
            ההסכם נשמר אוטומטית במסמכי הלקוח כשהופכים את הליד ללקוח.
          </div>
        </div>
      )}

      {/* מיילים ללקוח — מה יצא, אם הגיע, ואם נפתח */}
      <QuotationEmailsPanel
        quotationId={quotation.id}
        representationRequestId={quotation.representationRequestId}
      />

      {/* יומן אירועים */}
      <div style={panel}>
        <div style={{ fontSize: 'var(--fs-13)', fontWeight: 600, marginBottom: 6 }}>יומן אירועים</div>
        {events.length === 0 ? (
          <div style={{ fontSize: 'var(--fs-13)', color: 'var(--gray-500)' }}>אין אירועים עדיין.</div>
        ) : events.map((e, i) => (
          <div key={i} style={{ display: 'flex', gap: 10, padding: '6px 0', borderTop: i ? '1px solid var(--gray-100)' : 'none', fontSize: 'var(--fs-13)', alignItems: 'baseline' }}>
            <span style={{ flex: 1 }}>
              {QUOTATION_EVENT_LABELS[e.type] ?? e.type}
              {e.note ? <span style={{ color: 'var(--gray-500)' }}> — {e.note}</span> : null}
            </span>
            <span style={{ color: 'var(--gray-500)', whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>{fmt(e.at)}</span>
          </div>
        ))}
      </div>

      {/* המייל שנשלח */}
      <div style={{ ...panel, padding: 0, overflow: 'hidden' }}>
        <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--gray-200)' }}>
          <div style={{ fontSize: 'var(--fs-13)', fontWeight: 600 }}>המייל שנשלח ללקוח</div>
          <div style={{ fontSize: 'var(--fs-12)', color: 'var(--gray-500)', marginTop: 2 }}>
            נושא: {applyPlaceholders(snap?.emailSubject || quotation.emailSubject || '') || '—'}
          </div>
        </div>
        {sentEmailHtml ? (
          <iframe title="sent-email" srcDoc={sentEmailHtml} style={{ width: '100%', height: 480, border: 'none', background: '#fff' }} />
        ) : (
          <div style={{ padding: 14, fontSize: 'var(--fs-13)', color: 'var(--gray-500)' }}>
            ההצעה טרם נשלחה ללקוח — אין העתק שמור של מייל.
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * רשימת הנמענים לבחירה — לידים ולקוחות, כל אחד פעם אחת.
 *
 * ליד שהפך ללקוח לא מוצג פעמיים: הלקוח גובר עליו, כי הוא הרשומה שנושאת את
 * הייצוג ואת התיק. הזיהוי הוא לפי הקישור המפורש, ואם אין — לפי מייל או שם.
 *
 * ליד שמסומן "הומר" אך אין מאחוריו לקוח כן מוצג. זה לא מצב תקין, אבל הסתרתו
 * הפכה אותו לבלתי-נגיש לחלוטין — אי אפשר היה להוציא לו הצעה ואי אפשר היה
 * להבין למה הוא נעלם.
 */
export function buildRecipientOptions(leads: Lead[], clients: Client[]) {
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
      kind: 'client' as const, id: c.id,
      fullName: `${c.firstName} ${c.lastName}`.trim(),
      email: c.email, phone: c.phone,
      repStatus: c.representationStatus,
    }))
    .sort((a, b) => a.fullName.localeCompare(b.fullName, 'he'));

  return { leadOptions, clientOptions };
}

function RecipientEditor({ leads, clients, value, onPick }: {
  leads: Lead[]; clients: Client[]; value: RecipientDraft;
  onPick: (r: RecipientDraft) => void;
}) {
  const { leadOptions, clientOptions } = buildRecipientOptions(leads, clients);
  const hasExisting = leadOptions.length + clientOptions.length > 0;
  const [mode, setMode] = useState<'existing' | 'new'>(
    value.kind === 'client' || value.kind === 'lead' ? 'existing' : hasExisting ? 'existing' : 'new');
  const [nl, setNl] = useState({ fullName: value.fullName, phone: value.phone ?? '', email: value.email ?? '', businessName: value.businessName ?? '' });
  const [hasPrev, setHasPrev] = useState(!!value.hasPreviousAccountant);
  const [prev, setPrev] = useState({ name: value.prevAccountantName ?? '', email: value.prevAccountantEmail ?? '', phone: value.prevAccountantPhone ?? '' });

  // תווית שמאפשרת להבדיל בין שני אנשים עם אותו שם, בלי להעמיס את השורה
  const optionLabel = (o: { fullName: string; businessName?: string; phone?: string; email?: string }) =>
    [o.fullName || '(ללא שם)', o.businessName, o.phone || o.email].filter(Boolean).join(' · ');

  function handleSelect(key: string) {
    if (!key) return;
    const [kind, id] = [key.slice(0, key.indexOf(':')), key.slice(key.indexOf(':') + 1)];
    const picked = kind === 'lead'
      ? leadOptions.find(o => o.id === id)
      : clientOptions.find(o => o.id === id);
    if (!picked) return;
    const { ...rest } = picked;
    delete (rest as Record<string, unknown>).repStatus;   // לא חלק מהנמען
    onPick(rest as RecipientDraft);
  }

  return (
    <div>
      <div className="tabs" style={{ marginBottom: 10 }}>
        <button className={`tab ${mode === 'new' ? 'active' : ''}`} onClick={() => setMode('new')}>ליד חדש</button>
        <button className={`tab ${mode === 'existing' ? 'active' : ''}`} onClick={() => setMode('existing')}>קיים</button>
      </div>

      {mode === 'existing' ? (
        <>
          {hasExisting ? (
            <>
              <select
                value={value.id ? `${value.kind}:${value.id}` : ''}
                onChange={e => handleSelect(e.target.value)}
              >
                <option value="">{'—'} בחר ליד או לקוח {'—'}</option>
                {leadOptions.length > 0 && (
                  <optgroup label={`לידים (${leadOptions.length})`}>
                    {leadOptions.map(o => (
                      <option key={`lead:${o.id}`} value={`lead:${o.id}`}>{optionLabel(o)}</option>
                    ))}
                  </optgroup>
                )}
                {clientOptions.length > 0 && (
                  <optgroup label={`לקוחות (${clientOptions.length})`}>
                    {clientOptions.map(o => (
                      <option key={`client:${o.id}`} value={`client:${o.id}`}>
                        {optionLabel(o)}
                        {o.repStatus === 'active' ? ' · מיוצג' : o.repStatus ? ' · ייצוג בתהליך' : ''}
                      </option>
                    ))}
                  </optgroup>
                )}
              </select>
              <div style={{ fontSize: 'var(--fs-12)', color: 'var(--gray-500)', marginTop: 6, lineHeight: 1.55 }}>
                ליד שכבר הפך ללקוח מופיע פעם אחת בלבד — ברשימת הלקוחות.
              </div>
            </>
          ) : (
            <div style={{ fontSize: 'var(--fs-13)', color: 'var(--gray-500)', padding: 6, lineHeight: 1.6 }}>
              אין עדיין לידים או לקוחות. אפשר לפתוח ליד חדש בטאב שלצד.
            </div>
          )}
        </>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <input placeholder="שם מלא *" value={nl.fullName} onChange={e => setNl(v => ({ ...v, fullName: e.target.value }))} />
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <input placeholder="טלפון" value={nl.phone} onChange={e => setNl(v => ({ ...v, phone: e.target.value }))} dir="ltr" style={{ textAlign: 'right' }} />
            <input placeholder="אימייל" value={nl.email} onChange={e => setNl(v => ({ ...v, email: e.target.value }))} dir="ltr" style={{ textAlign: 'right' }} />
          </div>
          <input placeholder="שם העסק (אופציונלי)" value={nl.businessName} onChange={e => setNl(v => ({ ...v, businessName: e.target.value }))} />

          <div style={{ border: '1px solid var(--gray-200)', borderRadius: 8, padding: 10, background: hasPrev ? 'var(--blue-light)' : 'var(--gray-50)' }}>
            <label className="checkbox-row" style={{ fontWeight: 500 }}>
              <input type="checkbox" checked={hasPrev} onChange={e => setHasPrev(e.target.checked)} />
              עובר מרו״ח אחר?
            </label>
            {hasPrev && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 8 }}>
                <input placeholder="שם הרו״ח הקודם" value={prev.name} onChange={e => setPrev(v => ({ ...v, name: e.target.value }))} />
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                  <input placeholder="מייל הרו״ח הקודם" value={prev.email} onChange={e => setPrev(v => ({ ...v, email: e.target.value }))} dir="ltr" style={{ textAlign: 'right' }} />
                  <input placeholder="טלפון" value={prev.phone} onChange={e => setPrev(v => ({ ...v, phone: e.target.value }))} dir="ltr" style={{ textAlign: 'right' }} />
                </div>
                <div style={{ fontSize: 'var(--fs-12)', color: 'var(--gray-500)' }}>לאחר שהלקוח יאשר, נכין מכתב שחרור לרו״ח הקודם.</div>
              </div>
            )}
          </div>

          <button className="btn btn-sm btn-primary" disabled={!nl.fullName.trim()}
            onClick={() => onPick({
              kind: 'new', fullName: nl.fullName.trim(),
              phone: nl.phone.trim() || undefined, email: nl.email.trim() || undefined,
              businessName: nl.businessName.trim() || undefined,
              hasPreviousAccountant: hasPrev,
              prevAccountantName: hasPrev ? prev.name.trim() || undefined : undefined,
              prevAccountantEmail: hasPrev ? prev.email.trim() || undefined : undefined,
              prevAccountantPhone: hasPrev ? prev.phone.trim() || undefined : undefined,
            })}
            style={{ alignSelf: 'flex-start' }}>
            שימוש בליד זה
          </button>
        </div>
      )}
    </div>
  );
}

function LineItem({ item, vatRate, plan, onChange, onRemove }: {
  item: QuotationItem; vatRate: number; plan: BillingPlan;
  onChange: (p: Partial<QuotationItem>) => void; onRemove: () => void;
}) {
  const final = itemFinalPrice(item);
  const withVat = item.vatFlag ? Math.round(final * (1 + vatRate / 100)) : final;
  const isMonthly = item.category === 'monthly';
  const basis: PriceBasis = item.priceBasis ?? 'monthly';
  const isManual = item.prorationMode === 'manual';
  const installments = clampInstallments(item.installments ?? plan.installments);
  const qty = item.quantity || 1;

  // מעבר בין תמחור חודשי לשנתי: המחיר השנתי מאותחל מהחודשי (× מספר התשלומים)
  // כדי שהמספר שעל המסך לא יקפוץ לאפס, ואז התשלום החודשי נגזר ממנו מחדש.
  function switchBasis(next: PriceBasis) {
    if (next === 'monthly') {
      onChange({ priceBasis: 'monthly', annualPrice: undefined, prorationMode: 'full' });
      return;
    }
    const annual = item.annualPrice ?? Math.round(item.clientPrice * installments);
    onChange({
      priceBasis: 'annual', annualPrice: annual, prorationMode: 'full',
      clientPrice: r2(annual / installments),
    });
  }

  function setAnnual(annual: number) {
    onChange(isManual
      ? { annualPrice: annual }
      : { annualPrice: annual, clientPrice: r2(annual / installments) });
  }

  // עריכה ידנית של התשלום החודשי מנתקת את השורה מהנוסחה — זו כוונה, לא טעות
  function setMonthly(value: number) {
    onChange(basis === 'annual' ? { clientPrice: value, prorationMode: 'manual' } : { clientPrice: value });
  }

  // מחיר יעד: בוחרים כמה זה יעלה בסוף, והמערכת גוזרת את ההנחה. גיא חושב
  // במחיר לחודש — לכן היעד הוא תמיד על התשלום הבודד, גם כשהוזן מחיר שנתי.
  const targetBase = item.clientPrice * qty;

  function pickTarget(target: number | null) {
    if (target == null) { onChange({ discountPercent: 0 }); return; }
    if (targetBase <= 0) return;
    onChange({ discountPercent: Math.min(100, Math.max(0, (1 - target / targetBase) * 100)) });
  }

  return (
    <div style={{ border: '1px solid var(--gray-200)', borderRadius: 10, padding: 10 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
        {/* שורה חופשית (בלי serviceId) — השם נערך ישירות כאן */}
        {item.serviceId ? (
          <span style={{ flex: 1, fontWeight: 600, fontSize: 'var(--fs-14)' }}>{itemDisplayName(item)}</span>
        ) : (
          <input value={item.name} placeholder="שם השירות (שורה חופשית) *" autoFocus={!item.name}
            onChange={e => onChange({ name: e.target.value })}
            style={{ flex: 1, fontWeight: 600, fontSize: 'var(--fs-14)', padding: '.3rem .5rem' }} />
        )}
        <button className="btn btn-icon btn-ghost" onClick={onRemove} title="הסרה" style={{ color: 'var(--red)' }}>✕</button>
      </div>
      {/* תדירות החיוב ושנת המס נבחרות פר שורה — אותו שירות יכול להיות חודשי
          ללקוח אחד וחד־פעמי לאחר, ודוח לכל שנה פתוחה מתומחר בנפרד. */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, marginBottom: 6 }}>
        <label style={miniLabel}>תדירות חיוב
          <select value={item.category} style={miniInput}
            onChange={e => onChange({ category: e.target.value as ServiceCategory })}>
            {SERVICE_CATEGORY_ORDER.map(c => (
              <option key={c} value={c}>{SERVICE_CATEGORY_LABELS[c]}</option>
            ))}
          </select>
        </label>
        <label style={miniLabel}>שנת מס
          <select value={item.year ?? ''} style={miniInput}
            onChange={e => onChange({ year: e.target.value ? Number(e.target.value) : undefined })}>
            <option value="">— ללא —</option>
            {YEAR_OPTIONS.map(y => <option key={y} value={y}>{y}</option>)}
          </select>
        </label>
      </div>
      {/* שורה חודשית: מחיר שנתי ← מספר תשלומים ← תשלום חודשי, הכול באותה שורה */}
      {isMonthly && (
        <div style={{ display: 'grid', gridTemplateColumns: basis === 'annual' ? '1fr 1fr' : '1fr', gap: 6, marginBottom: 6 }}>
          <label style={miniLabel}>תמחור
            <select value={basis} style={miniInput} onChange={e => switchBasis(e.target.value as PriceBasis)}>
              <option value="monthly">לפי מחיר חודשי</option>
              <option value="annual">לפי מחיר שנתי</option>
            </select>
          </label>
          {basis === 'annual' && (
            <label style={miniLabel}>מחיר שנתי
              <input type="number" min={0} value={item.annualPrice ?? 0} style={miniInput}
                onChange={e => setAnnual(Math.max(0, Number(e.target.value) || 0))} />
            </label>
          )}
        </div>
      )}
      <div style={{ display: 'grid', gridTemplateColumns: item.billingType === 'per_unit' ? '1fr 1fr 1fr' : '1fr 1fr', gap: 6 }}>
        {item.billingType === 'per_unit' && (
          <label style={miniLabel}>{item.unitLabel || 'כמות'}
            <input type="number" min={1} value={item.quantity} onChange={e => onChange({ quantity: Math.max(1, Number(e.target.value) || 1) })} style={miniInput} />
          </label>
        )}
        <label style={miniLabel}>{isMonthly ? (basis === 'annual' ? `תשלום חודשי${isManual ? ' (ידני)' : ''}` : 'תשלום חודשי') : 'מחיר ליחידה'}
          <input type="number" min={0} value={item.clientPrice} onChange={e => setMonthly(Math.max(0, Number(e.target.value) || 0))} style={miniInput} />
        </label>
        <label style={miniLabel}>הנחה %
          <input type="number" min={0} max={100} value={Math.round((item.discountPercent ?? 0) * 10) / 10}
            onChange={e => onChange({ discountPercent: Math.min(100, Math.max(0, Number(e.target.value) || 0)) })} style={miniInput} />
        </label>
      </div>
      {item.category !== 'included' && targetBase > 0 && (
        <TargetPriceSelect base={targetBase} discountPercent={item.discountPercent ?? 0} onPick={pickTarget}
          label={isMonthly ? 'מחיר יעד לחודש (קובע את ההנחה)' : 'מחיר יעד (קובע את ההנחה)'} />
      )}
      {/* העוגן ההתנהגותי בידי הרו"ח: המחיר שיוצג מחוק ללקוח. ריק = אוטומטי
          (הגבוה מבין מחיר הקטלוג למחיר שהוזן). */}
      {item.category !== 'included' && (
        <label style={{ ...miniLabel, marginTop: 6 }}>
          {isMonthly ? 'מחיר לפני הנחה לחודש — יוצג מחוק ללקוח (ריק = אוטומטי)' : 'מחיר לפני הנחה — יוצג מחוק ללקוח (ריק = אוטומטי)'}
          <input type="number" min={0} style={miniInput}
            placeholder={String(Math.round(itemOriginalPrice(item) / qty))}
            value={item.displayFullPrice ?? ''}
            onChange={e => onChange({ displayFullPrice: e.target.value === '' ? undefined : Math.max(0, Number(e.target.value) || 0) })} />
        </label>
      )}
      {/* המחיר של השנה הבאה בשליטת הרו"ח: ריק = אוטומטי (שנתי ÷ 12, ובשורה
          ידנית — אותו מחיר שנקבע). מילוי — קובע בדיוק כמה יופיע "החל מינואר". */}
      {isMonthly && (
        <label style={{ ...miniLabel, marginTop: 6 }}>
          תשלום חודשי מהשנה הבאה (ריק = אוטומטי)
          <input type="number" min={0} style={miniInput}
            placeholder={String(Math.round(monthlyPlan({ ...item, ongoingPrice: undefined }).ongoingPerMonth / qty))}
            value={item.ongoingPrice ?? ''}
            onChange={e => onChange({ ongoingPrice: e.target.value === '' ? undefined : Math.max(0, Number(e.target.value) || 0) })} />
        </label>
      )}
      <ClientPriceHint item={item} />
      {/* הדרך הקצרה מ"דוח שנתי 6,000 ₪" ל"5 תשלומים של 1,200 ₪": בלי זה צריך
          לדעת שקודם משנים את תדירות החיוב לחודשי, וזה לא מובן מאליו. */}
      {!isMonthly && item.category !== 'included' && item.clientPrice > 0 && (
        <button className="btn btn-sm btn-secondary" style={{ marginTop: 6, fontSize: 'var(--fs-12)', padding: '3px 8px' }}
          onClick={() => onChange({
            category: 'monthly', priceBasis: 'annual',
            annualPrice: item.clientPrice, prorationMode: 'full',
            installments: plan.installments, billingStartMonth: plan.startMonth,
            clientPrice: r2(item.clientPrice / plan.installments),
          })}>
          ⤶ לפרוס לתשלומים חודשיים
        </button>
      )}
      {isMonthly && basis === 'annual' && isManual && (
        <button className="btn btn-sm btn-ghost" style={{ marginTop: 4, fontSize: 'var(--fs-12)', padding: '2px 6px' }}
          onClick={() => onChange({
            prorationMode: 'full',
            clientPrice: r2((item.annualPrice ?? 0) / installments),
          })}>
          ↺ חזרה לחישוב אוטומטי (שנתי ÷ {installments})
        </button>
      )}
      <PlanHint item={item} />
      <input placeholder="הערה שתוצג ללקוח (אופציונלי)" value={item.clientNote ?? ''} onChange={e => onChange({ clientNote: e.target.value })} style={{ marginTop: 6, fontSize: 'var(--fs-12)' }} />
      <div style={{ textAlign: 'end', marginTop: 6, fontSize: 'var(--fs-12)', color: 'var(--gray-600)' }}>
        {item.category === 'included' ? 'כלול' : <>סה״כ שורה: <b>{formatILS(withVat)}</b> <span style={{ color: 'var(--gray-400)' }}>כולל מע״מ</span></>}
      </div>
    </div>
  );
}

// שורת אמת מול הלקוח: בדיוק מה שיופיע בכרטיס השירות בעמוד ההצעה. ירוק כשיש
// עוגן והנחה, אפור עם רמז לפעולה כשאין — כדי שאי-הצגת הנחה לא תפתיע אף אחד.
function ClientPriceHint({ item }: { item: QuotationItem }) {
  if (item.category === 'included') return null;
  const original = itemOriginalPrice(item);
  const final = itemFinalPrice(item);
  if (final <= 0 && original <= 0) return null;
  const hasDiscount = original - final >= 1;
  return (
    <div style={{
      marginTop: 6, fontSize: 'var(--fs-12)', borderRadius: 8, padding: '5px 9px', lineHeight: 1.6,
      background: hasDiscount ? 'rgba(16,185,129,.09)' : 'var(--gray-50)',
      color: hasDiscount ? '#047857' : 'var(--gray-500)',
      border: `1px solid ${hasDiscount ? 'rgba(16,185,129,.25)' : 'var(--gray-200)'}`,
    }}>
      הלקוח יראה:{' '}
      {hasDiscount ? (
        <>
          <s>{formatILS(Math.round(original))}</s>{' ← '}
          <b>{formatILS(Math.round(final))}</b>
          {' · '}הנחה {Math.round((1 - final / original) * 100)}%
        </>
      ) : (
        <>
          <b>{formatILS(Math.round(final))}</b> בלי הנחה מוצגת — למילוי עוגן: "מחיר לפני הנחה" או הנחה %.
        </>
      )}
    </div>
  );
}

// רשימת מחירי יעד עגולים מתחת למחיר שהוזן. בוחרים "כמה זה יעלה בסוף" —
// וההנחה מחושבת לבד, במקום לנחש אחוזים עד שיוצא מספר יפה.
function TargetPriceSelect({ base, discountPercent, onPick, label }: {
  base: number; discountPercent: number; onPick: (target: number | null) => void; label: string;
}) {
  const step = base >= 4000 ? 250 : base >= 1500 ? 100 : base >= 500 ? 50 : base >= 150 ? 10 : 5;
  const targets: number[] = [];
  for (let t = Math.floor((base - 1) / step) * step; t >= base * 0.65 && targets.length < 9; t -= step) {
    if (t > 0) targets.push(t);
  }
  if (targets.length === 0) return null;

  const current = base * (1 - discountPercent / 100);
  const match = targets.find(t => Math.abs(t - current) < 0.5);

  return (
    <label style={{ ...miniLabel, marginTop: 6 }}>{label}
      <select value={match ?? ''} style={miniInput}
        onChange={e => onPick(e.target.value ? Number(e.target.value) : null)}>
        <option value="">{discountPercent > 0 && !match ? `לפי הנחה % — ${formatILS(Math.round(current))}` : `מחיר מלא — ${formatILS(Math.round(base))}`}</option>
        {targets.map(t => (
          <option key={t} value={t}>
            {formatILS(t)} · {Math.round((1 - t / base) * 100)}% הנחה
          </option>
        ))}
      </select>
    </label>
  );
}

// תרגום הפריסה למילים: כמה משלמים, כמה פעמים, מתי זה נגמר וכמה זה יעלה אחר כך.
// הסכום שאחרי התקופה הוא הנקודה החשובה — בלעדיו הלקוח מניח שהמחיר קבוע לתמיד.
function PlanHint({ item }: { item: QuotationItem }) {
  if (item.category !== 'monthly') return null;
  const p = monthlyPlan(item);
  if (p.perPayment <= 0) return null;
  return (
    <div style={{ marginTop: 5, fontSize: 'var(--fs-12)', color: 'var(--gray-500)', lineHeight: 1.55 }}>
      {formatILS(p.perPayment)} לחודש × {p.installments} תשלומים
      {p.startMonth && p.endMonth ? ` · ${formatMonthRange(p.startMonth, p.endMonth)}` : ''}
      {' · '}סה״כ {formatILS(Math.round(p.periodTotal))}
      {p.changesAfter && (
        <div style={{ color: 'var(--orange, #b45309)' }}>
          {p.nextMonth ? `מ־${formatMonth(p.nextMonth)}: ` : 'אחר כך: '}
          {formatILS(Math.round(p.ongoingPerMonth))} לחודש
        </div>
      )}
    </div>
  );
}

// כרטיס מתקפל — הסעיפים המשניים מתחילים סגורים עם שורת סיכום בכותרת, כדי
// שהמסך יתמקד בעיקר: נמען, שירותים ופריסת תשלומים. לחיצה על הכותרת פותחת.
function Section({ icon, title, summary, defaultOpen = false, children }: {
  icon: string; title: string; summary?: string; defaultOpen?: boolean; children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div style={card}>
      <button onClick={() => setOpen(o => !o)}
        style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 8, background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit', padding: 0, textAlign: 'start' }}>
        <span style={{ fontSize: 'var(--fs-14)', fontWeight: 600, color: 'var(--ink-1)', flex: 1 }}>{icon} {title}</span>
        {!open && summary ? (
          <span style={{ fontSize: 'var(--fs-12)', color: 'var(--ink-4)', maxWidth: 190, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{summary}</span>
        ) : null}
        <span className={`ed-section-caret ${open ? 'is-open' : ''}`}>▾</span>
      </button>
      {open && <div style={{ marginTop: 12 }}>{children}</div>}
    </div>
  );
}

function PlanChip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onClick} aria-pressed={active} style={{
      padding: '4px 11px', borderRadius: 'var(--r-chip)', fontFamily: 'inherit',
      fontSize: 'var(--fs-12)', cursor: 'pointer',
      border: `1px solid ${active ? 'var(--ink-3)' : 'var(--hairline-1)'}`,
      background: 'transparent',
      color: active ? 'var(--ink-1)' : 'var(--ink-3)', fontWeight: active ? 600 : 400,
      fontVariantNumeric: 'tabular-nums',
    }}>{children}</button>
  );
}

function TotalChip({ label, value, suffix }: { label: string; value: number; suffix?: string }) {
  if (value <= 0) return null;
  return (
    <span style={{ fontSize: 'var(--fs-12)', color: 'var(--gray-500)' }}>
      {label}{' '}
      <b style={{ fontSize: 'var(--fs-15)', color: 'var(--gray-800)', fontVariantNumeric: 'tabular-nums' }}>
        {formatILS(Math.round(value))}
      </b>
      {suffix ? <span style={{ fontSize: 'var(--fs-12)', marginInlineStart: 3 }}>{suffix}</span> : null}
    </span>
  );
}

/* קבועי הסגנון של צד העריכה בלבד. הפאנל הימני (‎QuotationWebView‎) הוא
   המסמך שהלקוח מקבל, והוא נשאר כפי שהוא — כדי שהצעות שכבר נשלחו ונחתמו
   ייראו בדיוק כמו ביום שנשלחו. חצאי-פיקסלים הוצאו משימוש (אפיון §2). */
const card: React.CSSProperties = { borderTop: '1px solid var(--hairline-2)', padding: '14px 0 16px' };
const cardTitle: React.CSSProperties = { fontSize: 'var(--fs-14)', fontWeight: 600, marginBottom: 12, color: 'var(--ink-1)' };
const fieldLabel: React.CSSProperties = { fontSize: 'var(--fs-12)', color: 'var(--ink-3)', display: 'block' };
const miniLabel: React.CSSProperties = { fontSize: 'var(--fs-12)', color: 'var(--ink-4)', display: 'flex', flexDirection: 'column', gap: 2 };
const miniInput: React.CSSProperties = { fontSize: 'var(--fs-13)', padding: '.35rem .5rem' };

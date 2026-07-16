import { useMemo, useState } from 'react';
import type { FirmProfile } from '../../types/firmProfile';
import type { Client } from '../../types';
import type {
  Lead, ServiceCatalogItem, QuotationTemplate, Quotation, QuotationItem, FutureService,
} from '../../types/quotations';
import {
  SERVICE_CATEGORY_LABELS,
  DEFAULT_VAT_RATE, DEFAULT_EXPIRY_BUSINESS_DAYS,
} from '../../types/quotations';
import { businessDaysExpiry } from '../../utils/businessDays';
import { calcTotals, formatILS, itemFinalPrice } from '../../utils/quotationCalc';
import { deriveQuotationBrand } from './quotationBranding';
import { buildQuotationEmailHtml } from '../../utils/quotationEmailHtml';
import { generateQuotationPdf, downloadPdf } from '../../utils/quotationPdf';
import QuotationWebView, { type QuotationWebViewData } from './QuotationWebView';

type PreviewTab = 'web' | 'email' | 'pdf';
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

interface Props {
  profile: FirmProfile | null;
  services: ServiceCatalogItem[];
  templates: QuotationTemplate[];
  leads: Lead[];
  clients: Client[];
  existing?: Quotation | null;               // עריכת טיוטה קיימת
  existingQuotations: Quotation[];           // לאזהרת "כבר יש הצעה פתוחה"
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
}

function catalogToItem(svc: ServiceCatalogItem): QuotationItem {
  return {
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
  };
}


export default function QuotationBuilder({
  profile, services, templates, leads, clients, existing, existingQuotations, onSaveDraft, onSend, onBack,
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
  const [emailMessage, setEmailMessage] = useState(existing?.emailMessage ?? '');
  const [notesForClient, setNotesForClient] = useState(existing?.notesForClient ?? '');
  const [internalNotes, setInternalNotes] = useState(existing?.internalNotes ?? '');
  const [expiresAt, setExpiresAt] = useState(existing?.expiresAt ?? businessDaysExpiry(DEFAULT_EXPIRY_BUSINESS_DAYS));

  const [tab, setTab] = useState<PreviewTab>('web');
  const [device, setDevice] = useState<Device>('desktop');
  const [catalogOpen, setCatalogOpen] = useState(false);
  const [catalogSearch, setCatalogSearch] = useState('');
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [recipientPicker, setRecipientPicker] = useState(false);
  const [sending, setSending] = useState<'test' | 'send' | null>(null);
  const [notice, setNotice] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);
  const [pdfBusy, setPdfBusy] = useState(false);

  const totals = calcTotals(items, vatRate);

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
    setItems(svc.map(catalogToItem));
  }

  function addService(svc: ServiceCatalogItem) {
    setItems(prev => [...prev, catalogToItem(svc)]);
  }
  function updateItem(id: string, patch: Partial<QuotationItem>) {
    setItems(prev => prev.map(it => it.id === id ? { ...it, ...patch } : it));
  }
  function removeItem(id: string) {
    setItems(prev => prev.filter(it => it.id !== id));
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
    };
  }

  async function handleSend(isTest: boolean) {
    setError(null);
    setNotice(null);
    if (!recipient.fullName.trim()) { setError('יש להזין נמען לפני שליחה.'); return; }
    if (!isTest && !recipient.email?.trim()) { setError('לנמען אין כתובת מייל — לא ניתן לשלוח ללקוח.'); return; }
    if (items.length === 0) { setError('אין שירותים בהצעה.'); return; }
    setSending(isTest ? 'test' : 'send');
    try {
      const res = await onSend(buildPayload(), isTest);
      if (res.ok) {
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
        items, vatRate, notesForClient, expiresAt,
      }, brand);
      downloadPdf(bytes, `הצעת מחיר ${existing?.quotationNumber ?? 'טיוטה'}.pdf`);
    } catch (e) {
      setNotice({ kind: 'err', text: `הפקת ה-PDF נכשלה: ${e instanceof Error ? e.message : String(e)}` });
    } finally {
      setPdfBusy(false);
    }
  }

  const catalogFiltered = services.filter(s =>
    s.active && (!catalogSearch.trim() || s.name.includes(catalogSearch.trim())));
  const usedServiceIds = new Set(items.map(i => i.serviceId).filter(Boolean));

  return (
    <div dir="rtl">
      {/* header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
        <button className="btn btn-ghost" onClick={onBack}>→ חזרה</button>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 20, fontWeight: 600 }}>{existing ? `עריכת הצעה ${existing.quotationNumber}` : 'הצעת מחיר חדשה'}</div>
          <div style={{ fontSize: 12.5, color: 'var(--gray-500)', marginTop: 2 }}>בונים, מציגים תצוגה מקדימה ושומרים — הכל במסך אחד</div>
        </div>
        <button className="btn btn-secondary" onClick={() => handleSend(true)} disabled={sending !== null || saving}>
          {sending === 'test' ? 'שולח…' : 'מייל בדיקה'}
        </button>
        <button className="btn btn-secondary" onClick={handleSave} disabled={saving || sending !== null}>
          {saving ? 'שומר…' : savedAt ? '✓ נשמר' : 'שמירת טיוטה'}
        </button>
        <button className="btn btn-primary" onClick={() => handleSend(false)} disabled={sending !== null || saving}>
          {sending === 'send' ? 'שולח…' : 'שליחה ללקוח'}
        </button>
      </div>

      {error && <div className="alert alert-warning" style={{ marginBottom: 12 }}>{error}</div>}
      {notice && (
        <div className={`alert ${notice.kind === 'ok' ? 'alert-info' : 'alert-warning'}`} style={{ marginBottom: 12 }}>{notice.text}</div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(360px, 460px) 1fr', gap: 18, alignItems: 'start' }}>

        {/* ── פאנל בקרה ── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

          {/* נמען */}
          <div style={card}>
            <div style={cardTitle}>👤 נמען ההצעה</div>
            {recipient.fullName && !recipientPicker ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 600, fontSize: 14.5 }}>{recipient.fullName}</div>
                  <div style={{ fontSize: 12, color: 'var(--gray-500)' }}>
                    {recipient.kind === 'lead' ? 'ליד' : recipient.kind === 'client' ? 'לקוח קיים' : 'ליד חדש'}
                    {recipient.email ? ` · ${recipient.email}` : ''}{recipient.phone ? ` · ${recipient.phone}` : ''}
                  </div>
                </div>
                <button className="btn btn-sm btn-secondary" onClick={() => setRecipientPicker(true)}>שינוי</button>
              </div>
            ) : (
              <RecipientEditor
                leads={leads} clients={clients} value={recipient}
                onPick={(r) => { setRecipient(r); setRecipientPicker(false); }}
              />
            )}
            {openWarning && <div className="alert alert-info" style={{ marginTop: 10, fontSize: 12.5 }}>{openWarning}</div>}
          </div>

          {/* תבנית */}
          <div style={card}>
            <div style={cardTitle}>📄 תבנית</div>
            <select value={templateId ?? ''} onChange={e => applyTemplate(e.target.value)}>
              <option value="">בחירת תבנית — טעינת שירותים מומלצים…</option>
              {templates.filter(t => t.active).map(t => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </select>
            <div style={{ fontSize: 11.5, color: 'var(--gray-500)', marginTop: 6 }}>בחירת תבנית טוענת שירותים מומלצים. אפשר לערוך הכל אחר כך.</div>
          </div>

          {/* שירותים */}
          <div style={card}>
            <div style={{ display: 'flex', alignItems: 'center', marginBottom: 12 }}>
              <div style={{ ...cardTitle, marginBottom: 0, flex: 1 }}>🧾 שירותים</div>
              <button className="btn btn-sm btn-primary" onClick={() => setCatalogOpen(o => !o)}>+ הוספת שירות</button>
            </div>

            {catalogOpen && (
              <div style={{ border: '1px solid var(--gray-200)', borderRadius: 10, padding: 10, marginBottom: 12, background: 'var(--gray-50)' }}>
                <input placeholder="חיפוש בקטלוג…" value={catalogSearch} onChange={e => setCatalogSearch(e.target.value)} style={{ marginBottom: 8 }} />
                <div style={{ maxHeight: 220, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 4 }}>
                  {catalogFiltered.length === 0 && <div style={{ fontSize: 12.5, color: 'var(--gray-500)', padding: 8 }}>הקטלוג ריק — הגדר שירותים בהגדרות המשרד ← הצעות מחיר.</div>}
                  {catalogFiltered.map(s => (
                    <button key={s.id} onClick={() => addService(s)}
                      style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 9px', border: '1px solid var(--gray-200)', borderRadius: 8, background: 'white', cursor: 'pointer', textAlign: 'start', fontFamily: 'inherit' }}>
                      <span style={{ flex: 1 }}>
                        <span style={{ fontWeight: 500, fontSize: 13 }}>{s.name}</span>
                        <span style={{ fontSize: 11, color: 'var(--gray-400)', marginInlineStart: 6 }}>{SERVICE_CATEGORY_LABELS[s.category]}</span>
                      </span>
                      <span style={{ fontSize: 12, color: 'var(--gray-600)', fontVariantNumeric: 'tabular-nums' }}>
                        {s.defaultPrice > 0 ? formatILS(s.defaultPrice) : 'כלול'}{usedServiceIds.has(s.id) ? ' ✓' : ''}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {items.length === 0 ? (
              <div style={{ fontSize: 13, color: 'var(--gray-500)', textAlign: 'center', padding: '16px 0' }}>טרם נוספו שירותים. בחר תבנית או הוסף שירות.</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {items.map(item => (
                  <LineItem key={item.id} item={item} vatRate={vatRate}
                    onChange={p => updateItem(item.id, p)} onRemove={() => removeItem(item.id)} />
                ))}
              </div>
            )}
          </div>

          {/* שירותים עתידיים — שקיפות מחירים מראש */}
          <div style={card}>
            <div style={{ ...cardTitle, marginBottom: 6 }}>🔮 שירותים עתידיים (מחירון מראש)</div>
            <div style={{ fontSize: 11.5, color: 'var(--gray-500)', marginBottom: 10, lineHeight: 1.5 }}>
              יוצגו ללקוח כמחירון "אם וכאשר", כדי שלא יופתע ממחיר בעתיד. לא נכלל בסכומי ההצעה.
            </div>
            {futureCandidates.length === 0 ? (
              <div style={{ fontSize: 12.5, color: 'var(--gray-500)' }}>כל השירותים בתשלום כבר כלולים בהצעה.</div>
            ) : (
              <div style={{ maxHeight: 190, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 2 }}>
                {futureCandidates.map(s => (
                  <label key={s.id} className="checkbox-row" style={{ padding: '4px 0', fontSize: 12.5 }}>
                    <input type="checkbox" checked={futureIds.has(s.id)} onChange={() => setFutureIds(prev => {
                      const next = new Set(prev);
                      next.has(s.id) ? next.delete(s.id) : next.add(s.id);
                      return next;
                    })} />
                    <span style={{ flex: 1 }}>{s.name}</span>
                    <span style={{ color: 'var(--gray-500)', fontSize: 11.5, whiteSpace: 'nowrap' }}>
                      {formatILS(s.defaultPrice)}{s.vatFlag ? ' + מע״מ' : ''}
                    </span>
                  </label>
                ))}
              </div>
            )}
          </div>

          {/* מייל */}
          <div style={card}>
            <div style={cardTitle}>✉️ מייל</div>
            <label style={fieldLabel}>נושא
              <input value={emailSubject} onChange={e => setEmailSubject(e.target.value)} style={{ marginTop: 4 }} />
            </label>
            <label style={{ ...fieldLabel, marginTop: 10 }}>הודעה אישית (אופציונלי)
              <textarea rows={3} value={emailMessage} onChange={e => setEmailMessage(e.target.value)} placeholder="כמה מילים אישיות שילוו את ההצעה…" style={{ marginTop: 4 }} />
            </label>
          </div>

          {/* הגדרות */}
          <div style={card}>
            <div style={cardTitle}>⚙️ פרטי ההצעה</div>
            <label style={fieldLabel}>הערה ללקוח בעמוד ההצעה (אופציונלי)
              <textarea rows={2} value={notesForClient} onChange={e => setNotesForClient(e.target.value)} style={{ marginTop: 4 }} />
            </label>
            <label style={{ ...fieldLabel, marginTop: 10 }}>הערה פנימית (לא נשלחת ללקוח)
              <textarea rows={2} value={internalNotes} onChange={e => setInternalNotes(e.target.value)} style={{ marginTop: 4 }} />
            </label>
            <label style={{ ...fieldLabel, marginTop: 10 }}>תוקף ההצעה
              <input type="date" value={expiresAt.slice(0, 10)}
                onChange={e => { const d = new Date(e.target.value); d.setHours(23, 59, 0, 0); setExpiresAt(d.toISOString()); }}
                style={{ marginTop: 4 }} />
            </label>
          </div>
        </div>

        {/* ── תצוגה מקדימה חיה ── */}
        <div style={{ position: 'sticky', top: 76 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
            <div className="tabs" style={{ margin: 0 }}>
              <button className={`tab ${tab === 'web' ? 'active' : ''}`} onClick={() => setTab('web')}>עמוד ההצעה</button>
              <button className={`tab ${tab === 'email' ? 'active' : ''}`} onClick={() => setTab('email')}>מייל</button>
              <button className={`tab ${tab === 'pdf' ? 'active' : ''}`} onClick={() => setTab('pdf')}>PDF</button>
            </div>
            {tab !== 'pdf' && (
              <div className="tabs" style={{ margin: 0, marginInlineStart: 'auto' }}>
                <button className={`tab ${device === 'desktop' ? 'active' : ''}`} onClick={() => setDevice('desktop')}>🖥️ דסקטופ</button>
                <button className={`tab ${device === 'mobile' ? 'active' : ''}`} onClick={() => setDevice('mobile')}>📱 מובייל</button>
              </div>
            )}
          </div>

          <div style={{ border: '1px solid var(--gray-200)', borderRadius: 14, overflow: 'hidden', background: '#F4F3EF', height: 'calc(100vh - 180px)', minHeight: 520 }}>
            <div style={{ height: '100%', overflowY: 'auto', display: 'flex', justifyContent: 'center' }}>
              <div style={{ width: device === 'mobile' && tab !== 'pdf' ? 390 : '100%', maxWidth: '100%', transition: 'width .2s' }}>
                {tab === 'web' && <QuotationWebView data={webData} brand={brand} compact={device === 'mobile'} />}
                {tab === 'email' && (
                  <iframe title="preview-email" srcDoc={emailHtml} style={{ width: '100%', height: '100%', border: 'none', minHeight: 520 }} />
                )}
                {tab === 'pdf' && (
                  <div style={{ padding: 40, textAlign: 'center', color: 'var(--gray-500)' }}>
                    <div style={{ fontSize: 40, marginBottom: 12 }}>📄</div>
                    <div style={{ fontWeight: 600, marginBottom: 6, color: 'var(--gray-700)' }}>ה-PDF של ההצעה</div>
                    <div style={{ fontSize: 13, marginBottom: 16 }}>מופק אוטומטית ותואם לעמוד ההצעה. אפשר להוריד ולבדוק:</div>
                    <button className="btn btn-primary" disabled={pdfBusy || items.length === 0} onClick={handleDownloadPdf}>
                      {pdfBusy ? 'מפיק…' : '⬇ הורדת PDF לבדיקה'}
                    </button>
                    <div style={{ marginTop: 18, display: 'inline-flex', flexDirection: 'column', gap: 4, textAlign: 'start', background: 'white', border: '1px solid var(--gray-200)', borderRadius: 10, padding: 16 }}>
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

function RecipientEditor({ leads, clients, value, onPick }: {
  leads: Lead[]; clients: Client[]; value: RecipientDraft;
  onPick: (r: RecipientDraft) => void;
}) {
  const [mode, setMode] = useState<'existing' | 'new'>(value.kind === 'client' ? 'existing' : 'new');
  const [search, setSearch] = useState('');
  const [nl, setNl] = useState({ fullName: value.fullName, phone: value.phone ?? '', email: value.email ?? '', businessName: value.businessName ?? '' });
  const [hasPrev, setHasPrev] = useState(!!value.hasPreviousAccountant);
  const [prev, setPrev] = useState({ name: value.prevAccountantName ?? '', email: value.prevAccountantEmail ?? '', phone: value.prevAccountantPhone ?? '' });

  const matches = search.trim()
    ? [
        ...leads.filter(l => l.status !== 'converted' && (l.fullName.includes(search) || (l.phone ?? '').includes(search) || (l.email ?? '').includes(search)))
          .map(l => ({ kind: 'lead' as const, id: l.id, fullName: l.fullName, businessName: l.businessName, email: l.email, phone: l.phone, dealerType: l.dealerType })),
        ...clients.filter(c => `${c.firstName} ${c.lastName}`.includes(search) || (c.phone ?? '').includes(search) || (c.email ?? '').includes(search))
          .map(c => ({ kind: 'client' as const, id: c.id, fullName: `${c.firstName} ${c.lastName}`.trim(), email: c.email, phone: c.phone })),
      ].slice(0, 6)
    : [];

  return (
    <div>
      <div className="tabs" style={{ marginBottom: 10 }}>
        <button className={`tab ${mode === 'new' ? 'active' : ''}`} onClick={() => setMode('new')}>ליד חדש</button>
        <button className={`tab ${mode === 'existing' ? 'active' : ''}`} onClick={() => setMode('existing')}>קיים</button>
      </div>

      {mode === 'existing' ? (
        <>
          <input placeholder="חיפוש ליד או לקוח לפי שם / טלפון…" value={search} onChange={e => setSearch(e.target.value)} />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 8 }}>
            {matches.map(m => (
              <button key={`${m.kind}-${m.id}`} onClick={() => onPick(m)}
                style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', border: '1px solid var(--gray-200)', borderRadius: 8, background: 'white', cursor: 'pointer', textAlign: 'start', fontFamily: 'inherit' }}>
                <span style={{ flex: 1 }}>
                  <span style={{ fontWeight: 500, fontSize: 13.5 }}>{m.fullName || '(ללא שם)'}</span>
                  <span style={{ fontSize: 11, color: 'var(--gray-400)', marginInlineStart: 6 }}>{m.kind === 'lead' ? 'ליד' : 'לקוח'}</span>
                </span>
                <span style={{ fontSize: 11.5, color: 'var(--gray-500)' }}>{m.phone || m.email}</span>
              </button>
            ))}
            {search.trim() && matches.length === 0 && <div style={{ fontSize: 12.5, color: 'var(--gray-500)', padding: 6 }}>לא נמצאו תוצאות.</div>}
          </div>
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
                <div style={{ fontSize: 11, color: 'var(--gray-500)' }}>לאחר שהלקוח יאשר, נכין מכתב שחרור לרו״ח הקודם.</div>
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

function LineItem({ item, vatRate, onChange, onRemove }: {
  item: QuotationItem; vatRate: number;
  onChange: (p: Partial<QuotationItem>) => void; onRemove: () => void;
}) {
  const final = itemFinalPrice(item);
  const withVat = item.vatFlag ? Math.round(final * (1 + vatRate / 100)) : final;
  return (
    <div style={{ border: '1px solid var(--gray-200)', borderRadius: 10, padding: 10 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
        <span style={{ flex: 1, fontWeight: 600, fontSize: 13.5 }}>{item.name}</span>
        <span style={{ fontSize: 10.5, color: 'var(--gray-400)' }}>{SERVICE_CATEGORY_LABELS[item.category]}</span>
        <button className="btn btn-icon btn-ghost" onClick={onRemove} title="הסרה" style={{ color: 'var(--red)' }}>✕</button>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: item.billingType === 'per_unit' ? '1fr 1fr 1fr' : '1fr 1fr', gap: 6 }}>
        {item.billingType === 'per_unit' && (
          <label style={miniLabel}>{item.unitLabel || 'כמות'}
            <input type="number" min={1} value={item.quantity} onChange={e => onChange({ quantity: Math.max(1, Number(e.target.value) || 1) })} style={miniInput} />
          </label>
        )}
        <label style={miniLabel}>מחיר ליחידה
          <input type="number" min={0} value={item.clientPrice} onChange={e => onChange({ clientPrice: Math.max(0, Number(e.target.value) || 0) })} style={miniInput} />
        </label>
        <label style={miniLabel}>הנחה %
          <input type="number" min={0} max={100} value={item.discountPercent ?? 0} onChange={e => onChange({ discountPercent: Math.min(100, Math.max(0, Number(e.target.value) || 0)) })} style={miniInput} />
        </label>
      </div>
      <input placeholder="הערה שתוצג ללקוח (אופציונלי)" value={item.clientNote ?? ''} onChange={e => onChange({ clientNote: e.target.value })} style={{ marginTop: 6, fontSize: 12 }} />
      <div style={{ textAlign: 'end', marginTop: 6, fontSize: 12, color: 'var(--gray-600)' }}>
        {item.category === 'included' ? 'כלול' : <>סה״כ שורה: <b>{formatILS(withVat)}</b> <span style={{ color: 'var(--gray-400)' }}>כולל מע״מ</span></>}
      </div>
    </div>
  );
}

const card: React.CSSProperties = { border: '1px solid var(--gray-200)', borderRadius: 12, padding: 16, background: 'white' };
const cardTitle: React.CSSProperties = { fontSize: 13.5, fontWeight: 600, marginBottom: 12 };
const fieldLabel: React.CSSProperties = { fontSize: 12, color: 'var(--gray-600)', display: 'block' };
const miniLabel: React.CSSProperties = { fontSize: 11, color: 'var(--gray-500)', display: 'flex', flexDirection: 'column', gap: 2 };
const miniInput: React.CSSProperties = { fontSize: 12.5, padding: '.35rem .5rem' };

import { useMemo, useState } from 'react';
import type { Client } from '../../types';
import type { Lead, Quotation, QuotationStatus } from '../../types/quotations';
import { QUOTATION_STATUS_LABELS, REMINDER_BUSINESS_DAYS_BEFORE } from '../../types/quotations';
import { calcTotals, formatILS } from '../../utils/quotationCalc';
import { businessDaysUntil } from '../../utils/businessDays';
import LeadsPanel, { type LeadPatch } from './LeadsPanel';
import { EmptyState } from '../ui/States';

interface Props {
  quotations: Quotation[];
  leads: Lead[];
  clients: Client[];
  onNew: () => void;
  onOpen: (q: Quotation) => void;
  onConvert: (q: Quotation) => void;
  onRelease: (q: Quotation) => void;
  // deferred=true ⇒ נפתחה תצוגה מקדימה והשליחה תקרה שם; אין מה לבשר כאן.
  onRemind: (q: Quotation) => Promise<{ ok: boolean; error?: string; deferred?: boolean }>;
  onCancel: (q: Quotation) => Promise<void>;
  onDelete: (q: Quotation) => Promise<void>;
  onSaveLead: (lead: LeadPatch) => Promise<void>;
  onCreateLead: (lead: Omit<Lead, 'id'>) => Promise<void>;
  onDeleteLead: (lead: Lead) => Promise<void>;
  onNewQuotationForLead: (lead: Lead) => void;
}

type PageTab = 'quotations' | 'leads';

// הצעה אחת יכולה להחזיק כמה תדירויות בבת אחת — ליווי חודשי לצד דוחות לשנים
// פתוחות שהם חד־פעמיים. הצגת סכום אחד בלבד מסתירה את הגדול מביניהם.
function rowAmounts(q: Quotation): { label: string; value: number }[] {
  const t = calcTotals(q.items, q.vatRate);
  return [
    { label: 'לחודש', value: t.monthly.withVat },
    { label: 'לשנה', value: t.annual.withVat },
    { label: 'חד־פעמי', value: t.oneTime.withVat },
  ].filter(a => a.value > 0).map(a => ({ ...a, value: Math.round(a.value) }));
}

// סדר תצוגה של קבוצות הסטטוס + צבע הפס
const GROUP_ORDER: { status: QuotationStatus; badge: string; strip: string }[] = [
  { status: 'draft', badge: 'badge-gray', strip: 'var(--gray-400)' },
  { status: 'sent', badge: 'badge-blue', strip: 'var(--blue)' },
  { status: 'viewed', badge: 'badge-purple', strip: 'var(--purple)' },
  { status: 'approved', badge: 'badge-green', strip: 'var(--green)' },
  { status: 'cancelled', badge: 'badge-gray', strip: 'var(--gray-300)' },
  { status: 'expired', badge: 'badge-orange', strip: 'var(--orange)' },
];

export default function QuotationsPipeline({
  quotations, leads, clients, onNew, onOpen, onConvert, onRelease, onRemind, onCancel, onDelete,
  onSaveLead, onCreateLead, onDeleteLead, onNewQuotationForLead,
}: Props) {
  const [page, setPage] = useState<PageTab>('quotations');
  // פתיחת "ליד חדש" יושבת כאן ולא ב-LeadsPanel, כי הכפתור הראשי של שני
  // המצבים חייב לחיות באותה משבצת בכותרת — אחרת הוא קופץ בין השורות.
  const [creatingLead, setCreatingLead] = useState(false);
  const [filter, setFilter] = useState<QuotationStatus | 'all'>('all');
  const [remindBusy, setRemindBusy] = useState<string | null>(null);
  const [rowBusy, setRowBusy] = useState<string | null>(null);
  const [toast, setToast] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);

  const leadOf = (q: Quotation): Lead | undefined => q.leadId ? leads.find(x => x.id === q.leadId) : undefined;
  const hasPrevAccountant = (q: Quotation): boolean => !!leadOf(q)?.hasPreviousAccountant;

  // ימי עסקים עד פקיעה. null אם אין תוקף או שכבר פג.
  const bizDaysToExpiry = (q: Quotation): number | null => {
    if (!q.expiresAt) return null;
    const t = new Date(q.expiresAt);
    if (t.getTime() <= Date.now()) return null;
    return businessDaysUntil(t);
  };

  async function remind(q: Quotation) {
    setRemindBusy(q.id);
    setToast(null);
    try {
      const res = await onRemind(q);
      if (res.deferred) return;
      setToast(res.ok ? { kind: 'ok', text: 'תזכורת נשלחה.' } : { kind: 'err', text: `שליחת תזכורת נכשלה: ${res.error ?? ''}` });
    } finally {
      setRemindBusy(null);
    }
  }

  // מחיקה סופית. לטיוטה — אישור קצר; להצעה שכבר יצאה ללקוח — אזהרה מפורטת
  // על מה נמחק, כי זו רשומה עם היסטוריה, חתימה ומעקב.
  async function remove(q: Quotation) {
    const name = `${q.quotationNumber} (${recipientName(q)})`;
    const message = q.status === 'draft'
      ? `למחוק את טיוטת הצעה ${name}?\n\nלא ניתן לשחזר.`
      : `למחוק לצמיתות את הצעה ${name}?\n\nיימחקו גם המעקב, יומן האירועים${q.approvalSignature ? ' וחתימת הלקוח' : ''} — ולא ניתן לשחזר.\n\n(אם ההצעה כבר הפכה ללקוח — הלקוח והסכם ההתקשרות שבמסמכיו יישארו.)`;
    if (!window.confirm(message)) return;
    setRowBusy(q.id);
    setToast(null);
    try {
      await onDelete(q);
      setToast({ kind: 'ok', text: `הצעה ${q.quotationNumber} נמחקה.` });
    } catch (e) {
      setToast({ kind: 'err', text: `המחיקה נכשלה: ${e instanceof Error ? e.message : String(e)}` });
    } finally {
      setRowBusy(null);
    }
  }

  // ביטול — הדרך המומלצת להצעה שנשלחה: ההיסטוריה נשמרת והלקוח רואה שבוטלה
  async function cancel(q: Quotation) {
    if (!window.confirm(`לבטל את הצעה ${q.quotationNumber} (${recipientName(q)})?\n\nההצעה תישאר בהיסטוריה, והלקוח שייכנס לקישור יראה שהיא בוטלה.`)) return;
    setRowBusy(q.id);
    setToast(null);
    try {
      await onCancel(q);
      setToast({ kind: 'ok', text: `הצעה ${q.quotationNumber} בוטלה.` });
    } catch (e) {
      setToast({ kind: 'err', text: `הביטול נכשל: ${e instanceof Error ? e.message : String(e)}` });
    } finally {
      setRowBusy(null);
    }
  }

  const recipientName = (q: Quotation): string => {
    if (q.leadId) { const l = leads.find(x => x.id === q.leadId); if (l) return l.fullName; }
    if (q.clientId) { const c = clients.find(x => x.id === q.clientId); if (c) return `${c.firstName} ${c.lastName}`.trim(); }
    return q.snapshot?.recipientName || '—';
  };

  // האם הליד של ההצעה כבר הומר ללקוח?
  const isConverted = (q: Quotation): boolean => {
    if (q.clientId) return true;
    const l = q.leadId ? leads.find(x => x.id === q.leadId) : undefined;
    return !!l?.convertedClientId;
  };

  const grouped = useMemo(() => {
    const byStatus: Record<string, Quotation[]> = {};
    for (const q of quotations) (byStatus[q.status] ??= []).push(q);
    return byStatus;
  }, [quotations]);

  const visibleGroups = GROUP_ORDER.filter(g => filter === 'all' || filter === g.status).filter(g => (grouped[g.status]?.length ?? 0) > 0);

  const reminderFailures = quotations.filter(q => q.autoReminderError && ['sent', 'viewed'].includes(q.status));

  // הצעות שאושרו, הייצוג נפתח — אבל מייל קישור הייצוג לא יצא ללקוח. בלי
  // ההתראה הזו הרו"ח חושב שהכל אוטומטי, והלקוח מחכה לקישור שלא הגיע.
  // הצעה שנצמדה לתהליך ייצוג קיים אינה כשל: אין ללקוח מה להשלים, ובמכוון לא
  // יצא אליו מייל. היא מוצגת בנפרד — אחרת היא נראית כתקלה שאין לה תיקון.
  const repEmailFailures = quotations.filter(q =>
    q.status === 'approved' && q.representationRequestId && !q.representationSentAt
    && !reusedRepresentation(q));
  const repReused = quotations.filter(q => q.status === 'approved' && reusedRepresentation(q));

  const stats = {
    open: quotations.filter(q => ['sent', 'viewed'].includes(q.status)).length,
    drafts: quotations.filter(q => q.status === 'draft').length,
    approved: quotations.filter(q => q.status === 'approved').length,
    leads: leads.filter(l => l.status !== 'converted' && l.status !== 'closed').length,
  };

  // המתג נבנה כאן ומוצג בתוך שורת הפקדים של המצב הפעיל — כך הוא נשאר
  // באותה נקודה בדיוק גם אחרי המעבר בין הצעות ללידים.
  const viewSwitch = (
    <div className="qp-switch" role="tablist" aria-label="הצעות או לידים">
      <button
        type="button" role="tab" aria-selected={page === 'quotations'}
        className={page === 'quotations' ? 'is-active' : ''}
        onClick={() => setPage('quotations')}
      >
        הצעות
      </button>
      <button
        type="button" role="tab" aria-selected={page === 'leads'}
        className={page === 'leads' ? 'is-active' : ''}
        onClick={() => setPage('leads')}
      >
        לידים
      </button>
    </div>
  );

  return (
    <div dir="rtl" className="quotations-page">
      {/* כותרת אחת עם משפט מצב אחד. המספרים שהיו פזורים בין הטאבים
          ובין ארבעת המחוונים מתרכזים כאן — כל מספר מופיע פעם אחת. */}
      <div className="pg-head">
        <div className="pg-head-main">
          <div className="pg-title pg-title-lg">
            {page === 'leads' ? 'לידים' : 'הצעות מחיר'}
          </div>
          <div className="pg-status">
            {page === 'leads'
              ? `${leads.length} לידים · מהשיחה הראשונה ועד הפיכת הליד ללקוח`
              : quotations.length === 0
                ? 'מהשיחה הראשונה ועד הפיכת הליד ללקוח'
                : `${quotations.length} הצעות · ${stats.drafts} טיוטות · ${stats.open} ממתינות לתשובה · ${stats.approved} אושרו`}
          </div>
        </div>
        {/* משבצת אחת לפעולה הראשית של שני המצבים — אותו גודל, אותו מקום.
            במצב ריק הכפתור חי בגוף המסך בלבד — שני כפתורים כחולים על אותו
            מסך מפצלים את ההחלטה במקום להוביל אותה (D14) */}
        <div className="pg-actions">
          {page === 'quotations'
            ? quotations.length > 0 && (
              <button className="ui-btn ui-btn-primary" onClick={onNew}>+ הצעה חדשה</button>
            )
            : leads.length > 0 && (
              <button className="ui-btn ui-btn-primary" onClick={() => setCreatingLead(true)}>+ ליד חדש</button>
            )}
        </div>
      </div>

      {page === 'leads' ? (
        <LeadsPanel
          leads={leads}
          quotations={quotations}
          viewSwitch={viewSwitch}
          creating={creatingLead}
          onCreatingChange={setCreatingLead}
          onSave={onSaveLead}
          onCreate={onCreateLead}
          onDelete={onDeleteLead}
          onNewQuotation={onNewQuotationForLead}
        />
      ) : (
      <>

      {/* שורת הפקדים צמודה לכותרת בשני המצבים — המתג ואז הסינון של המצב
          הפעיל. הודעות המערכת מתחתיה, כדי שהמתג לא יירד בשורה כשיש התראה. */}
      <div className="qp-controls">
        {viewSwitch}
        {quotations.length > 0 && (
          <>
            <span className="qp-controls-sep" aria-hidden="true" />
            <div className="filter-chips">
              <button className={`chip ${filter === 'all' ? 'active' : ''}`} onClick={() => setFilter('all')}>הכול</button>
              {GROUP_ORDER.map(g => (
                <button key={g.status} className={`chip ${filter === g.status ? 'active' : ''}`} onClick={() => setFilter(g.status)}>
                  {QUOTATION_STATUS_LABELS[g.status]}{grouped[g.status]?.length ? ` (${grouped[g.status].length})` : ''}
                </button>
              ))}
            </div>
          </>
        )}
      </div>

      {toast && (
        <div className={`alert ${toast.kind === 'ok' ? 'alert-info' : 'alert-warning'}`} style={{ marginBottom: 12 }}>{toast.text}</div>
      )}

      {reminderFailures.length > 0 && (
        <div className="alert alert-warning" style={{ marginBottom: 12, flexDirection: 'column', alignItems: 'stretch', gap: 4 }}>
          <div style={{ fontWeight: 600 }}>תזכורת אוטומטית נכשלה ל־{reminderFailures.length} הצעות — נדרש טיפול:</div>
          {reminderFailures.map(q => (
            <div key={q.id} style={{ fontSize: 12.5 }}>• {q.quotationNumber} ({recipientName(q)}) — {q.autoReminderError}. אפשר לשלוח תזכורת ידנית מהשורה.</div>
          ))}
        </div>
      )}

      {repEmailFailures.length > 0 && (
        <div className="alert alert-warning" style={{ marginBottom: 12, flexDirection: 'column', alignItems: 'stretch', gap: 4 }}>
          <div style={{ fontWeight: 600 }}>ב־{repEmailFailures.length} הצעות הייצוג נפתח אך מייל הקישור טרם יצא ללקוח:</div>
          {repEmailFailures.map(q => (
            <div key={q.id} style={{ fontSize: 12.5 }}>
              • {q.quotationNumber} ({recipientName(q)}){q.representationError ? ` — ${q.representationError}` : ''}.
              המערכת מנסה שוב אוטומטית בכל כניסה; אפשר גם לשלוח מכרטיס הלקוח.
            </div>
          ))}
        </div>
      )}

      {/* לא תקלה — אבל חייב להיות גלוי. הרו"ח מניח שאישור פותח ייצוג חדש,
          וכאן זה לא קרה. אם ההצעה הוסיפה רשויות, הן נרשמו בכרטיס הקיים. */}
      {repReused.length > 0 && (
        <div className="alert alert-info" style={{ marginBottom: 12, flexDirection: 'column', alignItems: 'stretch', gap: 4 }}>
          <div style={{ fontWeight: 600 }}>ℹ ב־{repReused.length} הצעות לא נפתחה בקשת ייצוג חדשה — ללקוח כבר קיים תהליך ייצוג:</div>
          {repReused.map(q => (
            <div key={q.id} style={{ fontSize: 12.5 }}>
              • {q.quotationNumber} ({recipientName(q)}) — {reuseNote(q) || 'נצמדה לתהליך הקיים'}.
              <button className="btn btn-sm btn-ghost" style={{ marginInlineStart: 6 }} onClick={() => onConvert(q)}>לכרטיס הלקוח ←</button>
            </div>
          ))}
        </div>
      )}

      {/* פס ארבעת המחוונים ירד — אותם ארבעה מספרים כבר כתובים במשפט
          המצב בכותרת, וגם בשמות הקבוצות למטה. כל מספר פעם אחת במסך. */}

      {quotations.length === 0 ? (
        /* מצב ריק · D14 — כפתור כחול אחד בדיוק, והשלבים מלמדים את המחזור */
        <EmptyState
          headline="עוד לא הפקת הצעת מחיר"
          sentence="ההצעה נשלחת לנמען, והליד נוצר אוטומטית — גם אם הוא לא קיים במערכת."
          steps={[
            { t: 'בונים את ההצעה', p: 'בוחרים תבנית, מוסיפים שירותים, ורואים במקביל את העמוד שהלקוח יקבל.' },
            { t: 'שולחים לנמען', p: 'הליד נוצר מעצמו. אין צורך להקים אותו לפני כן.' },
            { t: 'הלקוח חותם', p: 'עם החתימה הליד הופך ללקוח, ונפתח לו כרטיס.' },
          ]}
          action={{ label: 'צור הצעה ראשונה', onClick: onNew }}
        />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {visibleGroups.map(g => {
            const list = grouped[g.status] ?? [];
            return (
              <div key={g.status}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                  <span className={`badge ${g.badge}`}>{QUOTATION_STATUS_LABELS[g.status]}</span>
                  <span style={{ fontSize: 12.5, color: 'var(--gray-400)' }}>{list.length}</span>
                </div>
                <div className="card">
                  <table>
                    <thead>
                      <tr>
                        <th>מס׳</th><th>נמען</th><th className="number">סכום</th><th>תוקף</th><th>עודכן</th>
                        <th></th>
                      </tr>
                    </thead>
                    <tbody>
                      {list.map(q => {
                        const amounts = rowAmounts(q);
                        const converted = isConverted(q);
                        const days = bizDaysToExpiry(q);
                        const expiringSoon = (g.status === 'sent' || g.status === 'viewed') && days !== null && days <= REMINDER_BUSINESS_DAYS_BEFORE;
                        return (
                          <tr key={q.id} className="client-row" style={{ cursor: 'pointer', borderInlineStart: `3px solid ${g.strip}` }} onClick={() => onOpen(q)}>
                            <td className="mono-text">{q.quotationNumber}{q.revision > 1 ? ` · גרסה ${q.revision}` : ''}</td>
                            <td style={{ fontWeight: 600, color: 'var(--gray-900)' }}>{recipientName(q)}</td>
                            <td className="number">
                              {amounts.length === 0 ? '—' : amounts.map((a, i) => (
                                <div key={a.label} style={i === 0 ? undefined : { fontSize: 11.5, color: 'var(--gray-500)', fontWeight: 400 }}>
                                  {formatILS(a.value)} {a.label}
                                </div>
                              ))}
                            </td>
                            <td style={{ fontSize: 12.5, color: 'var(--gray-500)' }}>
                              {q.expiresAt ? new Date(q.expiresAt).toLocaleDateString('he-IL') : '—'}
                              {expiringSoon && <span className="badge badge-orange" style={{ marginInlineStart: 6, fontSize: 10 }}>{days === 0 ? 'פג היום' : days === 1 ? 'פג ביום עסקים הבא' : `פג בעוד ${days} ימי עסקים`}</span>}
                            </td>
                            <td style={{ fontSize: 12.5, color: 'var(--gray-500)' }}>{q.updatedAt ? new Date(q.updatedAt).toLocaleDateString('he-IL') : '—'}</td>
                            <td style={{ textAlign: 'end', whiteSpace: 'nowrap' }} onClick={e => e.stopPropagation()}>
                              {(g.status === 'sent' || g.status === 'viewed') && (
                                <>
                                  <button className={`btn btn-sm ${expiringSoon ? 'btn-primary' : 'btn-ghost'}`} disabled={remindBusy === q.id} onClick={() => remind(q)}>
                                    {remindBusy === q.id ? 'שולח…' : 'תזכורת'}
                                  </button>
                                  <button className="btn btn-sm btn-ghost" style={{ marginInlineStart: 6 }} disabled={rowBusy === q.id} onClick={() => cancel(q)}>ביטול</button>
                                </>
                              )}
                              {g.status === 'approved' && (
                                <>
                                  {q.representationRequestId ? (
                                    // האוטומציה כבר עשתה את העבודה — אין מה "להפוך"
                                    <button className="btn btn-sm btn-ghost" onClick={() => onConvert(q)}>
                                      {q.representationSentAt ? 'ייצוג נפתח — לכרטיס ←' : 'ייצוג נפתח — לכרטיס ←'}
                                    </button>
                                  ) : converted ? (
                                    <button className="btn btn-sm btn-ghost" onClick={() => onConvert(q)}>לקוח — לכרטיס ←</button>
                                  ) : (
                                    <button className="btn btn-sm btn-green" onClick={() => onConvert(q)}>הפוך ללקוח והתחל ייצוג ←</button>
                                  )}
                                  {converted && hasPrevAccountant(q) && (
                                    <button className="btn btn-sm btn-secondary" style={{ marginInlineStart: 6 }} onClick={() => onRelease(q)}>מכתב שחרור</button>
                                  )}
                                </>
                              )}
                              <button className="btn btn-icon btn-ghost" title="מחיקת ההצעה"
                                style={{ marginInlineStart: 6, color: 'var(--red)' }}
                                disabled={rowBusy === q.id} onClick={() => remove(q)}>
                                {rowBusy === q.id ? '…' : '🗑'}
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            );
          })}
        </div>
      )}

      </>
      )}
    </div>
  );
}

// ההערה שהשרת רושם כשאישור נצמד לתהליך ייצוג קיים במקום לפתוח חדש
const REUSE_MARK = 'לא נפתחה בקשה חדשה';

function reuseNote(q: Quotation): string | undefined {
  return q.events?.find(e => e.type === 'representation_opened' && e.note?.includes(REUSE_MARK))?.note;
}

function reusedRepresentation(q: Quotation): boolean {
  return !!reuseNote(q);
}


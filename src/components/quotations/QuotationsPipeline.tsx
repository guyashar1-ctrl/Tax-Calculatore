import { useMemo, useState } from 'react';
import type { Client } from '../../types';
import type { Lead, Quotation, QuotationStatus } from '../../types/quotations';
import { QUOTATION_STATUS_LABELS, REMINDER_BUSINESS_DAYS_BEFORE } from '../../types/quotations';
import { calcTotals, formatILS } from '../../utils/quotationCalc';
import { businessDaysUntil } from '../../utils/businessDays';

interface Props {
  quotations: Quotation[];
  leads: Lead[];
  clients: Client[];
  onNew: () => void;
  onOpen: (q: Quotation) => void;
  onConvert: (q: Quotation) => void;
  onRelease: (q: Quotation) => void;
  onRemind: (q: Quotation) => Promise<{ ok: boolean; error?: string }>;
}

const STATUSES_WITH_ACTIONS = ['approved', 'sent', 'viewed'];

// סדר תצוגה של קבוצות הסטטוס + צבע הפס
const GROUP_ORDER: { status: QuotationStatus; badge: string; strip: string }[] = [
  { status: 'draft', badge: 'badge-gray', strip: 'var(--gray-400)' },
  { status: 'sent', badge: 'badge-blue', strip: 'var(--blue)' },
  { status: 'viewed', badge: 'badge-purple', strip: 'var(--purple)' },
  { status: 'approved', badge: 'badge-green', strip: 'var(--green)' },
  { status: 'cancelled', badge: 'badge-gray', strip: 'var(--gray-300)' },
  { status: 'expired', badge: 'badge-orange', strip: 'var(--orange)' },
];

export default function QuotationsPipeline({ quotations, leads, clients, onNew, onOpen, onConvert, onRelease, onRemind }: Props) {
  const [filter, setFilter] = useState<QuotationStatus | 'all'>('all');
  const [remindBusy, setRemindBusy] = useState<string | null>(null);
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
      setToast(res.ok ? { kind: 'ok', text: 'תזכורת נשלחה.' } : { kind: 'err', text: `שליחת תזכורת נכשלה: ${res.error ?? ''}` });
    } finally {
      setRemindBusy(null);
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

  const stats = {
    open: quotations.filter(q => ['sent', 'viewed'].includes(q.status)).length,
    drafts: quotations.filter(q => q.status === 'draft').length,
    approved: quotations.filter(q => q.status === 'approved').length,
    leads: leads.filter(l => l.status !== 'converted' && l.status !== 'closed').length,
  };

  return (
    <div dir="rtl">
      <div className="desk-header">
        <div>
          <h1 className="desk-title">הצעות מחיר ולידים</h1>
          <div className="desk-subtitle">מהשיחה הראשונה ועד הפיכת הליד ללקוח</div>
        </div>
        <button className="btn btn-primary" onClick={onNew}>+ הצעה חדשה</button>
      </div>

      {toast && (
        <div className={`alert ${toast.kind === 'ok' ? 'alert-info' : 'alert-warning'}`} style={{ marginBottom: 12 }}>{toast.text}</div>
      )}

      {reminderFailures.length > 0 && (
        <div className="alert alert-warning" style={{ marginBottom: 12, flexDirection: 'column', alignItems: 'stretch', gap: 4 }}>
          <div style={{ fontWeight: 600 }}>⚠ תזכורת אוטומטית נכשלה ל־{reminderFailures.length} הצעות — נדרש טיפול:</div>
          {reminderFailures.map(q => (
            <div key={q.id} style={{ fontSize: 12.5 }}>• {q.quotationNumber} ({recipientName(q)}) — {q.autoReminderError}. אפשר לשלוח תזכורת ידנית מהשורה.</div>
          ))}
        </div>
      )}

      {/* strip סטטיסטיקה */}
      <div className="doc-stats-strip" style={{ marginBottom: 16 }}>
        <Stat n={stats.leads} label="לידים פעילים" />
        <div className="doc-stat-divider" />
        <Stat n={stats.drafts} label="טיוטות" />
        <div className="doc-stat-divider" />
        <Stat n={stats.open} label="ממתינות לתשובה" />
        <div className="doc-stat-divider" />
        <Stat n={stats.approved} label="אושרו" />
      </div>

      {/* פילטר */}
      <div className="filter-chips" style={{ marginBottom: 16 }}>
        <button className={`chip ${filter === 'all' ? 'active' : ''}`} onClick={() => setFilter('all')}>הכול</button>
        {GROUP_ORDER.map(g => (
          <button key={g.status} className={`chip ${filter === g.status ? 'active' : ''}`} onClick={() => setFilter(g.status)}>
            {QUOTATION_STATUS_LABELS[g.status]}{grouped[g.status]?.length ? ` (${grouped[g.status].length})` : ''}
          </button>
        ))}
      </div>

      {quotations.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-icon">📝</div>
          <div className="empty-state-title">אין עדיין הצעות מחיר</div>
          <div className="empty-state-desc">צור הצעה ראשונה — ההצעה תופק, תישלח, והליד יהפוך ללקוח עם האישור.</div>
          <button className="btn btn-primary" onClick={onNew} style={{ marginTop: 16 }}>+ הצעה חדשה</button>
        </div>
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
                        {STATUSES_WITH_ACTIONS.includes(g.status) && <th></th>}
                      </tr>
                    </thead>
                    <tbody>
                      {list.map(q => {
                        const t = calcTotals(q.items, q.vatRate);
                        const headline = t.monthly.withVat || t.annual.withVat || t.oneTime.withVat;
                        const converted = isConverted(q);
                        const days = bizDaysToExpiry(q);
                        const expiringSoon = (g.status === 'sent' || g.status === 'viewed') && days !== null && days <= REMINDER_BUSINESS_DAYS_BEFORE;
                        return (
                          <tr key={q.id} className="client-row" style={{ cursor: 'pointer', borderInlineStart: `3px solid ${g.strip}` }} onClick={() => onOpen(q)}>
                            <td className="mono-text">{q.quotationNumber}{q.revision > 1 ? ` · גרסה ${q.revision}` : ''}</td>
                            <td style={{ fontWeight: 600, color: 'var(--gray-900)' }}>{recipientName(q)}</td>
                            <td className="number">{headline > 0 ? formatILS(Math.round(headline)) : '—'}</td>
                            <td style={{ fontSize: 12.5, color: 'var(--gray-500)' }}>
                              {q.expiresAt ? new Date(q.expiresAt).toLocaleDateString('he-IL') : '—'}
                              {expiringSoon && <span className="badge badge-orange" style={{ marginInlineStart: 6, fontSize: 10 }}>{days === 0 ? 'פג היום' : days === 1 ? 'פג ביום עסקים הבא' : `פג בעוד ${days} ימי עסקים`}</span>}
                            </td>
                            <td style={{ fontSize: 12.5, color: 'var(--gray-500)' }}>{q.updatedAt ? new Date(q.updatedAt).toLocaleDateString('he-IL') : '—'}</td>
                            {STATUSES_WITH_ACTIONS.includes(g.status) && (
                              <td style={{ textAlign: 'end', whiteSpace: 'nowrap' }} onClick={e => e.stopPropagation()}>
                                {(g.status === 'sent' || g.status === 'viewed') && (
                                  <button className={`btn btn-sm ${expiringSoon ? 'btn-primary' : 'btn-ghost'}`} disabled={remindBusy === q.id} onClick={() => remind(q)}>
                                    {remindBusy === q.id ? 'שולח…' : 'תזכורת'}
                                  </button>
                                )}
                                {g.status === 'approved' && (
                                  <>
                                    {converted ? (
                                      <button className="btn btn-sm btn-ghost" onClick={() => onConvert(q)}>לקוח ✓ — לכרטיס ←</button>
                                    ) : (
                                      <button className="btn btn-sm btn-green" onClick={() => onConvert(q)}>הפוך ללקוח והתחל ייצוג ←</button>
                                    )}
                                    {converted && hasPrevAccountant(q) && (
                                      <button className="btn btn-sm btn-secondary" style={{ marginInlineStart: 6 }} onClick={() => onRelease(q)}>מכתב שחרור</button>
                                    )}
                                  </>
                                )}
                              </td>
                            )}
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
    </div>
  );
}

function Stat({ n, label }: { n: number; label: string }) {
  return (
    <div className="doc-stat">
      <span className="doc-stat-number">{n}</span>
      <span className="doc-stat-label">{label}</span>
    </div>
  );
}

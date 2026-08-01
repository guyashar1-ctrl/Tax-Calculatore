// ─── ניהול לידים ────────────────────────────────────────────────────────────
// עד היום ליד נוצר רק כתופעת לוואי של הצעת מחיר, ולא הייתה דרך לפתוח אותו,
// לתקן טלפון שהוקלד לא נכון או למחוק פנייה שלא הבשילה. כאן זה קורה.

import { useState, type ReactNode } from 'react';
import type { Lead, LeadStatus, LeadDealerType, Quotation } from '../../types/quotations';
import { LEAD_STATUS_LABELS, LEAD_DEALER_TYPE_LABELS } from '../../types/quotations';
import { EmptyState, CalmEmpty } from '../ui/States';

/** עדכון ליד — רק השדות שהשתנו, לצד המזהה. ראה ההערה ב-LeadForm.submit. */
export type LeadPatch = Partial<Lead> & { id: string };

interface Props {
  leads: Lead[];
  quotations: Quotation[];
  /** מתג הצעות/לידים — נבנה בעמוד האב ומוצג כאן, בראש שורת הפקדים */
  viewSwitch?: ReactNode;
  /** פתיחת "ליד חדש" מגיעה מהכפתור הראשי שבכותרת העמוד */
  creating?: boolean;
  onCreatingChange?: (v: boolean) => void;
  onSave: (lead: LeadPatch) => Promise<void>;
  onCreate: (lead: Omit<Lead, 'id'>) => Promise<void>;
  onDelete: (lead: Lead) => Promise<void>;
  onNewQuotation: (lead: Lead) => void;
}

const STATUS_BADGE: Record<LeadStatus, string> = {
  new: 'badge-blue',
  quoted: 'badge-purple',
  converted: 'badge-green',
  closed: 'badge-gray',
};

const STATUS_ORDER: LeadStatus[] = ['new', 'quoted', 'converted', 'closed'];

/**
 * שגיאות של Supabase אינן Error אלא אובייקט רגיל, ולכן String(e) הפיק
 * "[object Object]" — הודעה שמסתירה בדיוק את מה שצריך כדי להבין מה נפל.
 */
function errorText(e: unknown): string {
  if (e instanceof Error) return e.message;
  if (e && typeof e === 'object') {
    const o = e as Record<string, unknown>;
    const parts = [o.message, o.details, o.hint].filter(v => typeof v === 'string' && v.trim());
    if (parts.length > 0) return parts.join(' · ');
  }
  return String(e);
}

export default function LeadsPanel({
  leads, quotations, viewSwitch, creating = false, onCreatingChange,
  onSave, onCreate, onDelete, onNewQuotation,
}: Props) {
  const [filter, setFilter] = useState<LeadStatus | 'all'>('all');
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState<Lead | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [toast, setToast] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);

  const quotationsOf = (leadId: string) => quotations.filter(q => q.leadId === leadId);

  const q = search.trim();
  const visible = leads
    .filter(l => filter === 'all' || l.status === filter)
    .filter(l => !q || l.fullName.includes(q) || (l.phone ?? '').includes(q)
      || (l.email ?? '').includes(q) || (l.businessName ?? '').includes(q));

  const counts = STATUS_ORDER.reduce((acc, s) => {
    acc[s] = leads.filter(l => l.status === s).length;
    return acc;
  }, {} as Record<LeadStatus, number>);

  async function remove(lead: Lead) {
    const related = quotationsOf(lead.id);
    const extra = related.length
      ? `\n\nל${lead.fullName} משויכות ${related.length} הצעות מחיר. הן יישארו במערכת, אבל ינותקו מהליד.`
      : '';
    const converted = lead.convertedClientId
      ? '\n\nהליד כבר הפך ללקוח — כרטיס הלקוח והמסמכים שלו יישארו כמו שהם.'
      : '';
    if (!window.confirm(`למחוק את הליד ${lead.fullName}?${extra}${converted}\n\nלא ניתן לשחזר.`)) return;
    setBusy(lead.id);
    setToast(null);
    try {
      await onDelete(lead);
      setToast({ kind: 'ok', text: `הליד ${lead.fullName} נמחק.` });
    } catch (e) {
      setToast({ kind: 'err', text: `המחיקה נכשלה: ${errorText(e)}` });
    } finally {
      setBusy(null);
    }
  }

  function closeForm() {
    setEditing(null);
    onCreatingChange?.(false);
  }

  async function save(draft: LeadPatch | Omit<Lead, 'id'>) {
    setToast(null);
    try {
      if ('id' in draft && draft.id) await onSave(draft as LeadPatch);
      else await onCreate(draft as Omit<Lead, 'id'>);
      closeForm();
      setToast({ kind: 'ok', text: 'הליד נשמר.' });
    } catch (e) {
      setToast({ kind: 'err', text: `השמירה נכשלה: ${errorText(e)}` });
    }
  }

  return (
    <div dir="rtl">
      {/* אותה שורת פקדים בדיוק כמו במצב "הצעות": המתג פותח, אחריו קו,
          אחריו הסינון, והחיפוש בקצה. במסך ריק אין מה לסנן ואין מה לחפש. */}
      <div className="qp-controls">
        {viewSwitch}
        {leads.length > 0 && (
          <>
            <span className="qp-controls-sep" aria-hidden="true" />
            <div className="filter-chips">
              <button className={`chip ${filter === 'all' ? 'active' : ''}`} onClick={() => setFilter('all')}>הכול ({leads.length})</button>
              {STATUS_ORDER.map(s => (
                <button key={s} className={`chip ${filter === s ? 'active' : ''}`} onClick={() => setFilter(s)}>
                  {LEAD_STATUS_LABELS[s]}{counts[s] ? ` (${counts[s]})` : ''}
                </button>
              ))}
            </div>
            <input className="pg-search" placeholder="חיפוש שם, עסק, טלפון…" title="חיפוש לפי שם, עסק, טלפון או מייל"
              value={search} onChange={e => setSearch(e.target.value)} />
          </>
        )}
      </div>

      {toast && (
        <div className={`alert ${toast.kind === 'ok' ? 'alert-info' : 'alert-warning'}`} style={{ marginBottom: 12 }}>{toast.text}</div>
      )}

      {leads.length === 0 ? (
        /* אותו מצב ריק של העמוד — טקסט שמלמד, וכפתור כחול אחד (D14) */
        <EmptyState
          headline="אין עדיין לידים"
          sentence="ליד נוצר אוטומטית כשמפיקים הצעת מחיר לנמען חדש — או ידנית כאן, אחרי שיחת טלפון."
          action={{ label: '+ ליד חדש', onClick: () => onCreatingChange?.(true) }}
        />
      ) : visible.length === 0 ? (
        <CalmEmpty
          text="אין לידים שתואמים לסינון."
          action={{ label: 'נקה סינון', onClick: () => { setFilter('all'); setSearch(''); } }}
        />
      ) : (
        <div className="card">
          <table>
            <thead>
              <tr>
                <th>שם</th><th>עסק</th><th>טלפון</th><th>מייל</th><th>סטטוס</th><th>הצעות</th><th></th>
              </tr>
            </thead>
            <tbody>
              {visible.map(l => {
                const related = quotationsOf(l.id);
                return (
                  <tr key={l.id} className="client-row" style={{ cursor: 'pointer' }} onClick={() => setEditing(l)}>
                    <td style={{ fontWeight: 600, color: 'var(--gray-900)' }}>
                      {l.fullName || '(ללא שם)'}
                      {l.hasPreviousAccountant && (
                        <span className="badge badge-orange" style={{ marginInlineStart: 6, fontSize: 10 }}>מרו״ח אחר</span>
                      )}
                    </td>
                    <td style={{ fontSize: 12.5, color: 'var(--gray-600)' }}>{l.businessName || '—'}</td>
                    <td style={{ fontSize: 12.5, color: 'var(--gray-600)' }} dir="ltr">{l.phone || '—'}</td>
                    <td style={{ fontSize: 12.5, color: 'var(--gray-600)' }} dir="ltr">{l.email || '—'}</td>
                    <td><span className={`badge ${STATUS_BADGE[l.status]}`}>{LEAD_STATUS_LABELS[l.status]}</span></td>
                    <td style={{ fontSize: 12.5, color: 'var(--gray-500)' }}>{related.length || '—'}</td>
                    <td style={{ textAlign: 'end', whiteSpace: 'nowrap' }} onClick={e => e.stopPropagation()}>
                      {l.status !== 'converted' && (
                        <button className="btn btn-sm btn-ghost" onClick={() => onNewQuotation(l)}>הצעה חדשה</button>
                      )}
                      <button className="btn btn-icon btn-ghost" title="עריכה" style={{ marginInlineStart: 4 }} onClick={() => setEditing(l)}>✏️</button>
                      <button className="btn btn-icon btn-ghost" title="מחיקת הליד" style={{ marginInlineStart: 4, color: 'var(--red)' }}
                        disabled={busy === l.id} onClick={() => remove(l)}>
                        {busy === l.id ? '…' : '🗑'}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {(editing || creating) && (
        <LeadForm
          lead={editing}
          onSave={save}
          onCancel={closeForm}
        />
      )}
    </div>
  );
}

// ─── טופס ליד (מודל) ────────────────────────────────────────────────────────

function LeadForm({ lead, onSave, onCancel }: {
  lead: Lead | null;
  onSave: (l: LeadPatch | Omit<Lead, 'id'>) => Promise<void>;
  onCancel: () => void;
}) {
  const [v, setV] = useState({
    fullName: lead?.fullName ?? '',
    phone: lead?.phone ?? '',
    email: lead?.email ?? '',
    businessName: lead?.businessName ?? '',
    dealerType: lead?.dealerType ?? ('' as LeadDealerType | ''),
    status: lead?.status ?? ('new' as LeadStatus),
    notes: lead?.notes ?? '',
    hasPreviousAccountant: !!lead?.hasPreviousAccountant,
    prevAccountantName: lead?.prevAccountantName ?? '',
    prevAccountantEmail: lead?.prevAccountantEmail ?? '',
    prevAccountantPhone: lead?.prevAccountantPhone ?? '',
  });
  const [saving, setSaving] = useState(false);

  const set = (patch: Partial<typeof v>) => setV(prev => ({ ...prev, ...patch }));

  async function submit() {
    if (!v.fullName.trim()) return;
    setSaving(true);
    try {
      const base = {
        fullName: v.fullName.trim(),
        phone: v.phone.trim() || undefined,
        email: v.email.trim() || undefined,
        businessName: v.businessName.trim() || undefined,
        dealerType: (v.dealerType || undefined) as LeadDealerType | undefined,
        status: v.status,
        notes: v.notes.trim() || undefined,
        hasPreviousAccountant: v.hasPreviousAccountant,
        prevAccountantName: v.hasPreviousAccountant ? v.prevAccountantName.trim() || undefined : undefined,
        prevAccountantEmail: v.hasPreviousAccountant ? v.prevAccountantEmail.trim() || undefined : undefined,
        prevAccountantPhone: v.hasPreviousAccountant ? v.prevAccountantPhone.trim() || undefined : undefined,
      };
      // ‼ נשלחים רק השדות שהטופס באמת עורך, ולא כל הליד. שליחת הליד המלא
      // החזירה לשרת גם שדות שהמסך לא נגע בהם — ביניהם converted_client_id.
      // די בכך שהעותק בדפדפן התיישן (למשל לקוח שנמחק, או המרה שקרתה מאז
      // בלשונית אחרת) כדי שעריכת טלפון תיפול על הפרת מפתח זר.
      await onSave(lead ? { id: lead.id, ...base } : base);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={overlay} onClick={onCancel}>
      <div style={modal} onClick={e => e.stopPropagation()} dir="rtl">
        <div style={{ display: 'flex', alignItems: 'center', marginBottom: 14 }}>
          <div style={{ flex: 1, fontSize: 17, fontWeight: 600 }}>{lead ? 'עריכת ליד' : 'ליד חדש'}</div>
          <button className="btn btn-icon btn-ghost" onClick={onCancel}>✕</button>
        </div>

        <label style={label}>שם מלא *
          <input value={v.fullName} onChange={e => set({ fullName: e.target.value })} autoFocus style={{ marginTop: 4 }} />
        </label>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 10 }}>
          <label style={label}>טלפון
            <input value={v.phone} onChange={e => set({ phone: e.target.value })} dir="ltr" style={{ marginTop: 4, textAlign: 'right' }} />
          </label>
          <label style={label}>מייל
            <input value={v.email} onChange={e => set({ email: e.target.value })} dir="ltr" style={{ marginTop: 4, textAlign: 'right' }} />
          </label>
        </div>

        <label style={{ ...label, marginTop: 10, display: 'block' }}>שם העסק
          <input value={v.businessName} onChange={e => set({ businessName: e.target.value })} style={{ marginTop: 4 }} />
        </label>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 10 }}>
          <label style={label}>סוג עוסק
            <select value={v.dealerType} onChange={e => set({ dealerType: e.target.value as LeadDealerType | '' })} style={{ marginTop: 4 }}>
              <option value="">— לא נקבע —</option>
              {(Object.keys(LEAD_DEALER_TYPE_LABELS) as LeadDealerType[]).map(k => (
                <option key={k} value={k}>{LEAD_DEALER_TYPE_LABELS[k]}</option>
              ))}
            </select>
          </label>
          <label style={label}>סטטוס
            <select value={v.status} onChange={e => set({ status: e.target.value as LeadStatus })} style={{ marginTop: 4 }}>
              {(Object.keys(LEAD_STATUS_LABELS) as LeadStatus[]).map(k => (
                <option key={k} value={k}>{LEAD_STATUS_LABELS[k]}</option>
              ))}
            </select>
          </label>
        </div>

        <label style={{ ...label, marginTop: 10, display: 'block' }}>הערות פנימיות
          <textarea rows={2} value={v.notes} onChange={e => set({ notes: e.target.value })} style={{ marginTop: 4 }} />
        </label>

        <div style={{ border: '1px solid var(--gray-200)', borderRadius: 8, padding: 10, marginTop: 12, background: v.hasPreviousAccountant ? 'var(--blue-light)' : 'var(--gray-50)' }}>
          <label className="checkbox-row" style={{ fontWeight: 500 }}>
            <input type="checkbox" checked={v.hasPreviousAccountant} onChange={e => set({ hasPreviousAccountant: e.target.checked })} />
            עובר מרו״ח אחר?
          </label>
          {v.hasPreviousAccountant && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 8 }}>
              <input placeholder="שם הרו״ח הקודם" value={v.prevAccountantName} onChange={e => set({ prevAccountantName: e.target.value })} />
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                <input placeholder="מייל הרו״ח הקודם" value={v.prevAccountantEmail} onChange={e => set({ prevAccountantEmail: e.target.value })} dir="ltr" style={{ textAlign: 'right' }} />
                <input placeholder="טלפון" value={v.prevAccountantPhone} onChange={e => set({ prevAccountantPhone: e.target.value })} dir="ltr" style={{ textAlign: 'right' }} />
              </div>
              <div style={{ fontSize: 11, color: 'var(--gray-500)' }}>לאחר שהלקוח יאשר הצעה, נכין מכתב שחרור לרו״ח הקודם.</div>
            </div>
          )}
        </div>

        <div style={{ display: 'flex', gap: 8, marginTop: 16, justifyContent: 'flex-end' }}>
          <button className="btn btn-secondary" onClick={onCancel}>ביטול</button>
          <button className="btn btn-primary" disabled={!v.fullName.trim() || saving} onClick={submit}>
            {saving ? 'שומר…' : 'שמירה'}
          </button>
        </div>
      </div>
    </div>
  );
}

const overlay: React.CSSProperties = {
  position: 'fixed', inset: 0, background: 'rgba(0,0,0,.45)', zIndex: 60,
  display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
};
const modal: React.CSSProperties = {
  background: 'var(--card)', borderRadius: 14, padding: 20,
  width: '100%', maxWidth: 520, maxHeight: '90vh', overflowY: 'auto',
  boxShadow: '0 16px 48px rgba(0,0,0,.25)',
};
const label: React.CSSProperties = { fontSize: 12, color: 'var(--gray-600)', display: 'block' };

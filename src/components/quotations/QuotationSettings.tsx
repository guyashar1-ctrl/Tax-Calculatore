import { useState } from 'react';
import type { FirmProfile } from '../../types/firmProfile';
import type {
  ServiceCatalogItem, QuotationTemplate, ServiceCategory,
} from '../../types/quotations';
import {
  SERVICE_CATEGORY_LABELS, SERVICE_CATEGORY_ORDER, TEMPLATE_KIND_LABELS,
} from '../../types/quotations';
import { useQuotationCatalog } from '../../hooks/useQuotationCatalog';
import { formatILS } from '../../utils/quotationCalc';
import { deriveQuotationBrand } from './quotationBranding';
import QuotationWebView, { type QuotationWebViewData } from './QuotationWebView';

interface Props {
  profile: FirmProfile;
  onSaveProfile: (p: FirmProfile) => Promise<void> | void;
}

type Tab = 'catalog' | 'templates' | 'email' | 'preview';

const DEFAULT_EMAIL_SUBJECT = 'הצעת מחיר מ{{businessName}}';
const DEFAULT_EMAIL_BODY = 'שלום {{clientName}},\n\nמצורפת הצעת מחיר אישית ({{quotationNumber}}).\nלצפייה ולאישור: {{quotationLink}}\n\nנשמח לעמוד לרשותך לכל שאלה.';

interface QuotationSettingsBlob {
  emailTemplate?: { subject?: string; body?: string };
}

export default function QuotationSettings({ profile, onSaveProfile }: Props) {
  const [tab, setTab] = useState<Tab>('catalog');
  const catalog = useQuotationCatalog(profile.id);

  return (
    <div>
      <div className="tabs" style={{ marginBottom: 16 }}>
        <button className={`tab ${tab === 'catalog' ? 'active' : ''}`} onClick={() => setTab('catalog')}>מחירון</button>
        <button className={`tab ${tab === 'templates' ? 'active' : ''}`} onClick={() => setTab('templates')}>תבניות</button>
        <button className={`tab ${tab === 'email' ? 'active' : ''}`} onClick={() => setTab('email')}>תבנית מייל</button>
        <button className={`tab ${tab === 'preview' ? 'active' : ''}`} onClick={() => setTab('preview')}>תצוגה מקדימה</button>
      </div>

      {catalog.loading ? (
        <div style={{ padding: 40, textAlign: 'center', color: 'var(--gray-500)' }}>טוען מחירון…</div>
      ) : catalog.error ? (
        <div className="alert alert-warning">{catalog.error}</div>
      ) : (
        <>
          {tab === 'catalog' && <CatalogTab catalog={catalog} />}
          {tab === 'templates' && <TemplatesTab catalog={catalog} />}
          {tab === 'email' && <EmailTab profile={profile} onSaveProfile={onSaveProfile} />}
          {tab === 'preview' && <PreviewTab profile={profile} catalog={catalog} />}
        </>
      )}
    </div>
  );
}

// ─────────────────────────────── מחירון ───────────────────────────────

function CatalogTab({ catalog }: { catalog: ReturnType<typeof useQuotationCatalog> }) {
  const [editing, setEditing] = useState<ServiceCatalogItem | 'new' | null>(null);

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', marginBottom: 12 }}>
        <div style={{ flex: 1, fontSize: 12.5, color: 'var(--gray-500)' }}>
          שירותי המשרד והמחירים. שינוי מחיר משפיע רק על הצעות עתידיות — הצעות שנשלחו נשמרות כפי שהיו.
        </div>
        <button className="btn btn-sm btn-primary" onClick={() => setEditing('new')}>+ שירות חדש</button>
      </div>

      {SERVICE_CATEGORY_ORDER.map(cat => {
        const rows = catalog.services.filter(s => s.category === cat);
        if (rows.length === 0) return null;
        return (
          <div key={cat} style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 11.5, fontWeight: 700, letterSpacing: '.04em', color: 'var(--gray-400)', marginBottom: 6 }}>
              {SERVICE_CATEGORY_LABELS[cat]}
            </div>
            <div style={{ border: '1px solid var(--gray-200)', borderRadius: 10, overflow: 'hidden' }}>
              {rows.map((s, i) => (
                <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', borderTop: i ? '1px solid var(--gray-100)' : 'none', background: s.active ? 'white' : 'var(--gray-50)', opacity: s.active ? 1 : 0.6 }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 500, fontSize: 13.5 }}>
                      {s.name}
                      {s.includeByDefault && <span className="badge badge-green" style={{ marginInlineStart: 6, fontSize: 10 }}>ברירת מחדל</span>}
                      {!s.active && <span className="badge badge-gray" style={{ marginInlineStart: 6, fontSize: 10 }}>לא פעיל</span>}
                    </div>
                    {s.description && <div style={{ fontSize: 11.5, color: 'var(--gray-500)', marginTop: 2 }}>{s.description}</div>}
                  </div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--gray-700)', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>
                    {s.defaultPrice > 0 ? <>{formatILS(s.defaultPrice)}{s.vatFlag ? ' + מע״מ' : ''}{s.billingType === 'per_unit' ? ` / ${s.unitLabel || 'יחידה'}` : ''}</> : 'כלול'}
                  </div>
                  <button className="btn btn-sm btn-ghost" onClick={() => setEditing(s)}>עריכה</button>
                </div>
              ))}
            </div>
          </div>
        );
      })}

      {editing && (
        <ServiceEditor
          initial={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
          onSave={async (data) => {
            if (editing === 'new') await catalog.addService(data);
            else await catalog.updateService({ ...editing, ...data });
            setEditing(null);
          }}
          onDelete={editing !== 'new' ? async () => { await catalog.deleteService(editing.id); setEditing(null); } : undefined}
        />
      )}
    </div>
  );
}

function ServiceEditor({ initial, onClose, onSave, onDelete }: {
  initial: ServiceCatalogItem | null;
  onClose: () => void;
  onSave: (data: Omit<ServiceCatalogItem, 'id'>) => Promise<void>;
  onDelete?: () => Promise<void>;
}) {
  const [d, setD] = useState<Omit<ServiceCatalogItem, 'id'>>({
    name: initial?.name ?? '',
    category: initial?.category ?? 'monthly',
    description: initial?.description ?? '',
    defaultPrice: initial?.defaultPrice ?? 0,
    vatFlag: initial?.vatFlag ?? true,
    billingType: initial?.billingType ?? 'fixed',
    unitLabel: initial?.unitLabel ?? '',
    includeByDefault: initial?.includeByDefault ?? false,
    active: initial?.active ?? true,
    displayOrder: initial?.displayOrder ?? 999,
  });
  const [busy, setBusy] = useState(false);

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" style={{ maxWidth: 480, width: '100%' }} onClick={e => e.stopPropagation()}>
        <div className="modal-header"><h3>{initial ? 'עריכת שירות' : 'שירות חדש'}</h3><button className="btn btn-icon btn-ghost" onClick={onClose}>✕</button></div>
        <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <label style={lbl}>שם השירות
            <input value={d.name} onChange={e => setD(v => ({ ...v, name: e.target.value }))} />
          </label>
          <label style={lbl}>תיאור (מוצג ללקוח)
            <input value={d.description ?? ''} onChange={e => setD(v => ({ ...v, description: e.target.value }))} />
          </label>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <label style={lbl}>קטגוריה
              <select value={d.category} onChange={e => setD(v => ({ ...v, category: e.target.value as ServiceCategory }))}>
                {SERVICE_CATEGORY_ORDER.map(c => <option key={c} value={c}>{SERVICE_CATEGORY_LABELS[c]}</option>)}
              </select>
            </label>
            <label style={lbl}>מחיר (₪)
              <input type="number" min={0} value={d.defaultPrice} onChange={e => setD(v => ({ ...v, defaultPrice: Math.max(0, Number(e.target.value) || 0) }))} />
            </label>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <label style={lbl}>אופן חיוב
              <select value={d.billingType} onChange={e => setD(v => ({ ...v, billingType: e.target.value as 'fixed' | 'per_unit' }))}>
                <option value="fixed">קבוע</option>
                <option value="per_unit">לפי יחידה</option>
              </select>
            </label>
            {d.billingType === 'per_unit' && (
              <label style={lbl}>שם היחידה
                <input value={d.unitLabel ?? ''} onChange={e => setD(v => ({ ...v, unitLabel: e.target.value }))} placeholder="עובד / יחידה" />
              </label>
            )}
          </div>
          <label className="checkbox-row"><input type="checkbox" checked={d.vatFlag} onChange={e => setD(v => ({ ...v, vatFlag: e.target.checked }))} /> חייב במע״מ</label>
          <label className="checkbox-row"><input type="checkbox" checked={d.includeByDefault} onChange={e => setD(v => ({ ...v, includeByDefault: e.target.checked }))} /> נכלל כברירת מחדל בהצעות</label>
          <label className="checkbox-row"><input type="checkbox" checked={d.active} onChange={e => setD(v => ({ ...v, active: e.target.checked }))} /> פעיל</label>
        </div>
        <div className="modal-footer">
          {onDelete && <button className="btn btn-danger btn-sm" onClick={async () => { if (confirm('למחוק את השירות?')) { setBusy(true); await onDelete(); } }} disabled={busy}>מחיקה</button>}
          <div style={{ flex: 1 }} />
          <button className="btn btn-secondary" onClick={onClose} disabled={busy}>ביטול</button>
          <button className="btn btn-primary" disabled={busy || !d.name.trim()} onClick={async () => { setBusy(true); try { await onSave(d); } finally { setBusy(false); } }}>שמירה</button>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────── תבניות ───────────────────────────────

function TemplatesTab({ catalog }: { catalog: ReturnType<typeof useQuotationCatalog> }) {
  const [editing, setEditing] = useState<QuotationTemplate | null>(null);

  return (
    <div>
      <div style={{ fontSize: 12.5, color: 'var(--gray-500)', marginBottom: 12 }}>
        תבניות טוענות אוטומטית שירותים מומלצים כשמתחילים הצעה. בחירת השירותים בכל תבנית:
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {catalog.templates.map(t => (
          <div key={t.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 14px', border: '1px solid var(--gray-200)', borderRadius: 10, background: 'white' }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 600, fontSize: 14 }}>{t.name} <span style={{ fontSize: 11, color: 'var(--gray-400)', fontWeight: 400 }}>{TEMPLATE_KIND_LABELS[t.kind]}</span></div>
              <div style={{ fontSize: 12, color: 'var(--gray-500)', marginTop: 2 }}>{t.serviceIds.length} שירותים</div>
            </div>
            <button className="btn btn-sm btn-ghost" onClick={() => setEditing(t)}>עריכה</button>
          </div>
        ))}
        {catalog.templates.length === 0 && <div style={{ fontSize: 13, color: 'var(--gray-500)' }}>אין תבניות.</div>}
      </div>

      {editing && (
        <TemplateEditor
          template={editing}
          services={catalog.services}
          onClose={() => setEditing(null)}
          onSave={async (t) => { await catalog.updateTemplate(t); setEditing(null); }}
        />
      )}
    </div>
  );
}

function TemplateEditor({ template, services, onClose, onSave }: {
  template: QuotationTemplate;
  services: ServiceCatalogItem[];
  onClose: () => void;
  onSave: (t: QuotationTemplate) => Promise<void>;
}) {
  const [name, setName] = useState(template.name);
  const [selected, setSelected] = useState<Set<string>>(new Set(template.serviceIds));
  const [busy, setBusy] = useState(false);

  const toggle = (id: string) => setSelected(prev => {
    const next = new Set(prev);
    next.has(id) ? next.delete(id) : next.add(id);
    return next;
  });

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" style={{ maxWidth: 520, width: '100%' }} onClick={e => e.stopPropagation()}>
        <div className="modal-header"><h3>עריכת תבנית</h3><button className="btn btn-icon btn-ghost" onClick={onClose}>✕</button></div>
        <div className="modal-body">
          <label style={lbl}>שם התבנית
            <input value={name} onChange={e => setName(e.target.value)} />
          </label>
          <div style={{ fontSize: 12, color: 'var(--gray-600)', margin: '14px 0 8px', fontWeight: 500 }}>שירותים כלולים בתבנית</div>
          {SERVICE_CATEGORY_ORDER.map(cat => {
            const rows = services.filter(s => s.category === cat && s.active);
            if (rows.length === 0) return null;
            return (
              <div key={cat} style={{ marginBottom: 10 }}>
                <div style={{ fontSize: 10.5, color: 'var(--gray-400)', marginBottom: 4 }}>{SERVICE_CATEGORY_LABELS[cat]}</div>
                {rows.map(s => (
                  <label key={s.id} className="checkbox-row" style={{ padding: '4px 0' }}>
                    <input type="checkbox" checked={selected.has(s.id)} onChange={() => toggle(s.id)} />
                    {s.name} <span style={{ color: 'var(--gray-400)', fontSize: 11.5 }}>{s.defaultPrice > 0 ? formatILS(s.defaultPrice) : 'כלול'}</span>
                  </label>
                ))}
              </div>
            );
          })}
        </div>
        <div className="modal-footer">
          <div style={{ flex: 1 }} />
          <button className="btn btn-secondary" onClick={onClose} disabled={busy}>ביטול</button>
          <button className="btn btn-primary" disabled={busy || !name.trim()} onClick={async () => { setBusy(true); try { await onSave({ ...template, name: name.trim(), serviceIds: [...selected] }); } finally { setBusy(false); } }}>שמירה</button>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────── תבנית מייל ───────────────────────────────

function EmailTab({ profile, onSaveProfile }: { profile: FirmProfile; onSaveProfile: (p: FirmProfile) => Promise<void> | void }) {
  const blob = (profile.settings?.quotations as QuotationSettingsBlob | undefined)?.emailTemplate;
  const [subject, setSubject] = useState(blob?.subject ?? DEFAULT_EMAIL_SUBJECT);
  const [body, setBody] = useState(blob?.body ?? DEFAULT_EMAIL_BODY);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);

  const placeholders = ['{{clientName}}', '{{businessName}}', '{{quotationNumber}}', '{{quotationLink}}'];

  async function save() {
    setBusy(true);
    try {
      const nextSettings = { ...(profile.settings ?? {}), quotations: { ...((profile.settings?.quotations as object) ?? {}), emailTemplate: { subject, body } } };
      await onSaveProfile({ ...profile, settings: nextSettings });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ maxWidth: 640 }}>
      <div style={{ fontSize: 12.5, color: 'var(--gray-500)', marginBottom: 14 }}>
        טקסט ברירת המחדל של מייל ההצעה. אפשר לערוך לכל הצעה בנפרד לפני שליחה. השתמש בשדות הבאים והם יוחלפו אוטומטית:
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 16 }}>
        {placeholders.map(p => (
          <span key={p} style={{ fontSize: 11.5, background: 'var(--gray-100)', color: 'var(--gray-600)', padding: '3px 8px', borderRadius: 6, fontFamily: 'monospace', direction: 'ltr' }}>{p}</span>
        ))}
      </div>
      <label style={lbl}>נושא המייל
        <input value={subject} onChange={e => setSubject(e.target.value)} style={{ marginTop: 4 }} />
      </label>
      <label style={{ ...lbl, marginTop: 14, display: 'block' }}>גוף המייל
        <textarea rows={7} value={body} onChange={e => setBody(e.target.value)} style={{ marginTop: 4, width: '100%' }} />
      </label>
      <div style={{ marginTop: 14 }}>
        <button className="btn btn-primary" onClick={save} disabled={busy}>{busy ? 'שומר…' : saved ? '✓ נשמר' : 'שמירת תבנית'}</button>
      </div>
    </div>
  );
}

// ─────────────────────────────── תצוגה מקדימה ───────────────────────────────

function PreviewTab({ profile, catalog }: { profile: FirmProfile; catalog: ReturnType<typeof useQuotationCatalog> }) {
  const brand = deriveQuotationBrand(profile);
  // הצעת דוגמה מהתבנית הראשונה, אחרת מהשירותים הראשונים
  const tpl = catalog.templates[0];
  const svc = (tpl?.serviceIds.map(id => catalog.services.find(s => s.id === id)).filter(Boolean) as ServiceCatalogItem[] | undefined)
    ?? catalog.services.slice(0, 4);
  const sample: QuotationWebViewData = {
    quotationNumber: '2026-000',
    recipientName: 'ישראל ישראלי',
    businessName: 'ישראל ישראלי בע״מ',
    vatRate: 18,
    items: (svc ?? []).map(s => ({
      id: s.id, serviceId: s.id, name: s.name, description: s.description,
      category: s.category, billingType: s.billingType, unitLabel: s.unitLabel,
      quantity: 1, catalogPrice: s.defaultPrice, clientPrice: s.defaultPrice, vatFlag: s.vatFlag,
    })),
    notesForClient: 'שמחים על ההזדמנות ללוות אתכם. ההצעה מותאמת בדיוק לצרכים שסיכמנו בשיחה.',
  };

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
        <div style={{ flex: 1, fontSize: 12.5, color: 'var(--gray-500)' }}>
          כך תיראה הצעה ללקוח, במיתוג המשרד. את הלוגו, הצבעים והחתימה עורכים בלשוניות <b>מותג</b> ו<b>חתימת מייל</b>.
        </div>
      </div>
      <div style={{ border: '1px solid var(--gray-200)', borderRadius: 14, overflow: 'hidden', maxWidth: 680, margin: '0 auto' }}>
        <QuotationWebView data={sample} brand={brand} />
      </div>
    </div>
  );
}

const lbl: React.CSSProperties = { fontSize: 12, color: 'var(--gray-600)' };

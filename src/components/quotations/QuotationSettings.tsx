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
import { newTemplateDraft } from './templateDraft';
import { GoTo, Section } from '../office/officeUi';
import { extractErr } from '../office/useOfficeDraft';
import Modal from '../ui/Modal';

// ─── «הצעות מחיר» ────────────────────────────────────────────────────────────
// שירות ותבנית נשמרים מיד, בחלון העריכה (טבלאות service_catalog /
// quotation_templates). החלון לא נסגר עד שהשמירה הצליחה.
// ‼ (סבב 3) תזכורת הפקיעה עברה ל«תזכורות והתראות» — לצד כל מה שיוצא בלי לחיצה.
// ‼ «תבנית מייל» הוסרה מכאן (1.10.2026): שום שליחה לא קראה אותה — הבונה מתחיל
// תמיד מנושא «הצעת מחיר מהמשרד» ומהודעה ריקה. הערך השמור לא נמחק מהמסד.

interface Props {
  profile: FirmProfile;
  /** תזכורת הפקיעה יושבת ב«תזכורות והתראות» — קישור אליה. */
  onOpenReminders?: () => void;
}

export default function QuotationSettings({ profile, onOpenReminders }: Props) {
  const catalog = useQuotationCatalog(profile.id);

  return (
    <div>
      <Section title="מחירון" sub="שינוי מחיר משפיע רק על הצעות עתידיות. הצעה שנשלחה נשמרת כפי שהייתה.">
        {catalog.loading ? <div className="of-empty">טוען מחירון…</div>
          : catalog.error ? <div className="of-error-box">{catalog.error}</div>
            : <CatalogTab catalog={catalog} />}
      </Section>

      <Section title="תבניות הצעה" sub="כשמתחילים הצעה, התבנית טוענת את השירותים שבה.">
        {catalog.loading ? <div className="of-empty">טוען…</div>
          : catalog.error ? null
            : <TemplatesTab catalog={catalog} />}
      </Section>

      <p className="of-muted">
        ההודעה ללקוח נכתבת בכל הצעה, לפני השליחה.{' '}
        {onOpenReminders && <GoTo onClick={onOpenReminders}>תזכורת לפני שהצעה פוקעת ←</GoTo>}
      </p>
    </div>
  );
}

// ─────────────────────────────── מחירון ───────────────────────────────

function CatalogTab({ catalog }: { catalog: ReturnType<typeof useQuotationCatalog> }) {
  const [editing, setEditing] = useState<ServiceCatalogItem | 'new' | null>(null);

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', margin: '-6px 0 8px' }}>
        <button className="btn btn-sm btn-secondary" onClick={() => setEditing('new')}>＋ שירות</button>
      </div>
      {catalog.services.length === 0 && <div className="of-empty">אין עדיין שירותים במחירון.</div>}

      {SERVICE_CATEGORY_ORDER.map(cat => {
        const rows = catalog.services.filter(s => s.category === cat);
        if (rows.length === 0) return null;
        return (
          <div key={cat} style={{ marginBottom: 16 }}>
            <div className="of-muted" style={{ fontWeight: 500, marginBottom: 4 }}>{SERVICE_CATEGORY_LABELS[cat]}</div>
            <ul className="of-rows">
              {rows.map(s => (
                <li key={s.id} className="of-row" style={{ opacity: s.active ? 1 : 0.6 }}>
                  <div className="of-row-main">
                    <div className="of-row-title">
                      {s.name}
                      {s.includeByDefault && <span className="of-tag is-on" style={{ marginInlineStart: 6 }}>נכלל מראש</span>}
                      {!s.active && <span className="of-tag" style={{ marginInlineStart: 6 }}>לא פעיל</span>}
                    </div>
                    {s.description && <div className="of-row-meta">{s.description}</div>}
                  </div>
                  <div className="of-row-end">
                    <span style={{ fontSize: 'var(--fs-13)', fontWeight: 600, color: 'var(--ink-2)', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>
                      {s.defaultPrice > 0 ? <>{formatILS(s.defaultPrice)}{s.vatFlag ? ' + מע״מ' : ''}{s.billingType === 'per_unit' ? ` / ${s.unitLabel || 'יחידה'}` : ''}</> : 'כלול'}
                    </span>
                    <button className="btn btn-sm btn-ghost" onClick={() => setEditing(s)}>עריכה</button>
                  </div>
                </li>
              ))}
            </ul>
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
  const start: Omit<ServiceCatalogItem, 'id'> = {
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
  };
  const [d, setD] = useState(start);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const dirty = JSON.stringify(d) !== JSON.stringify(start);

  async function run(fn: () => Promise<void>, verb: string) {
    setBusy(true);
    setErr(null);
    try { await fn(); } catch (e) { setErr(`${verb} נכשלה: ${extractErr(e)}`); setBusy(false); }
  }

  return (
    <Modal title={initial ? 'עריכת שירות' : 'שירות חדש'} onClose={onClose} dirty={dirty && !busy} width={480}
      footer={onDelete && confirmDelete ? (
        <DeleteConfirm busy={busy} onYes={() => void run(onDelete, 'המחיקה')} onNo={() => setConfirmDelete(false)} />
      ) : <>
        {onDelete && (
          <button type="button" className="ui-btn ui-btn-ghost" style={{ color: 'var(--danger)', marginInlineEnd: 'auto' }}
            onClick={() => setConfirmDelete(true)} disabled={busy}>מחיקה</button>
        )}
        <button type="button" className="ui-btn ui-btn-ghost" onClick={onClose} disabled={busy}>ביטול</button>
        <button type="button" className="ui-btn ui-btn-primary" disabled={busy || !d.name.trim()}
          onClick={() => void run(() => onSave(d), 'השמירה')}>{busy ? 'שומר…' : 'שמירה'}</button>
      </>}>
      <div className="of-fields" style={{ gridTemplateColumns: 'minmax(0,1fr) minmax(0,1fr)' }}>
        <label className="of-field" style={{ gridColumn: '1 / -1' }}>
          <span className="of-field-label">שם השירות</span>
          <input value={d.name} data-autofocus onChange={e => setD(v => ({ ...v, name: e.target.value }))} />
        </label>
        <label className="of-field" style={{ gridColumn: '1 / -1' }}>
          <span className="of-field-label">תיאור (מוצג ללקוח)</span>
          <input value={d.description ?? ''} onChange={e => setD(v => ({ ...v, description: e.target.value }))} />
        </label>
        <label className="of-field">
          <span className="of-field-label">קטגוריה</span>
          <select value={d.category} onChange={e => setD(v => ({ ...v, category: e.target.value as ServiceCategory }))}>
            {SERVICE_CATEGORY_ORDER.map(c => <option key={c} value={c}>{SERVICE_CATEGORY_LABELS[c]}</option>)}
          </select>
        </label>
        <label className="of-field">
          <span className="of-field-label">מחיר (₪)</span>
          <input type="number" min={0} inputMode="decimal" value={d.defaultPrice}
            onChange={e => setD(v => ({ ...v, defaultPrice: Math.max(0, Number(e.target.value) || 0) }))} />
        </label>
        <label className="of-field">
          <span className="of-field-label">אופן חיוב</span>
          <select value={d.billingType} onChange={e => setD(v => ({ ...v, billingType: e.target.value as 'fixed' | 'per_unit' }))}>
            <option value="fixed">קבוע</option>
            <option value="per_unit">לפי יחידה</option>
          </select>
        </label>
        {d.billingType === 'per_unit' && (
          <label className="of-field">
            <span className="of-field-label">שם היחידה</span>
            <input value={d.unitLabel ?? ''} onChange={e => setD(v => ({ ...v, unitLabel: e.target.value }))} placeholder="עובד / יחידה" />
          </label>
        )}
      </div>
      <div style={{ marginTop: 14 }}>
        <label className="of-check"><input type="checkbox" checked={d.vatFlag} onChange={e => setD(v => ({ ...v, vatFlag: e.target.checked }))} /><span className="of-check-label">חייב במע״מ</span></label>
        <label className="of-check"><input type="checkbox" checked={d.includeByDefault} onChange={e => setD(v => ({ ...v, includeByDefault: e.target.checked }))} /><span className="of-check-label">נכלל מראש בהצעה חדשה</span></label>
        <label className="of-check"><input type="checkbox" checked={d.active} onChange={e => setD(v => ({ ...v, active: e.target.checked }))} /><span className="of-check-label">פעיל</span></label>
      </div>
      {err && <div className="of-error-box" role="alert">{err}</div>}
    </Modal>
  );
}

// ─────────────────────────────── תבניות ───────────────────────────────

function TemplatesTab({ catalog }: { catalog: ReturnType<typeof useQuotationCatalog> }) {
  const [editing, setEditing] = useState<QuotationTemplate | 'new' | null>(null);

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', margin: '-6px 0 8px' }}>
        <button className="btn btn-sm btn-secondary" onClick={() => setEditing('new')}>＋ תבנית</button>
      </div>
      {catalog.templates.length === 0 ? <div className="of-empty">אין תבניות.</div> : (
        <ul className="of-rows">
          {catalog.templates.map(t => (
            <li key={t.id} className="of-row">
              <div className="of-row-main">
                <div className="of-row-title">{t.name}</div>
                <div className="of-row-meta">{TEMPLATE_KIND_LABELS[t.kind]} · {t.serviceIds.length} שירותים</div>
              </div>
              <div className="of-row-end">
                <button className="btn btn-sm btn-ghost" onClick={() => setEditing(t)}>עריכה</button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {editing && (
        <TemplateEditor
          template={editing === 'new' ? null : editing}
          services={catalog.services}
          onClose={() => setEditing(null)}
          onSave={async ({ name, serviceIds }) => {
            if (editing === 'new') await catalog.addTemplate(newTemplateDraft(catalog.templates, name, serviceIds));
            else await catalog.updateTemplate({ ...editing, name, serviceIds });
            setEditing(null);
          }}
          onDelete={editing !== 'new' ? async () => { await catalog.deleteTemplate(editing.id); setEditing(null); } : undefined}
        />
      )}
    </div>
  );
}

function TemplateEditor({ template, services, onClose, onSave, onDelete }: {
  /** null = תבנית חדשה */
  template: QuotationTemplate | null;
  services: ServiceCatalogItem[];
  onClose: () => void;
  onSave: (d: { name: string; serviceIds: string[] }) => Promise<void>;
  onDelete?: () => Promise<void>;
}) {
  const startName = template?.name ?? '';
  const startIds = template?.serviceIds ?? [];
  const [name, setName] = useState(startName);
  const [selected, setSelected] = useState<Set<string>>(new Set(startIds));
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const dirty = name !== startName
    || selected.size !== startIds.length
    || startIds.some(id => !selected.has(id));
  const hasServices = services.some(s => s.active);

  const toggle = (id: string) => setSelected(prev => {
    const next = new Set(prev);
    next.has(id) ? next.delete(id) : next.add(id);
    return next;
  });

  async function run(fn: () => Promise<void>, verb: string) {
    setBusy(true);
    setErr(null);
    try { await fn(); } catch (e) { setErr(`${verb} נכשלה: ${extractErr(e)}`); setBusy(false); }
  }
  const submit = () => run(() => onSave({ name: name.trim(), serviceIds: [...selected] }), 'השמירה');

  return (
    <Modal title={template ? 'עריכת תבנית' : 'תבנית חדשה'} onClose={onClose} dirty={dirty && !busy} width={520}
      footer={onDelete && confirmDelete ? (
        <DeleteConfirm busy={busy} onYes={() => void run(onDelete, 'המחיקה')} onNo={() => setConfirmDelete(false)} />
      ) : <>
        {onDelete && (
          <button type="button" className="ui-btn ui-btn-ghost" style={{ color: 'var(--danger)', marginInlineEnd: 'auto' }}
            onClick={() => setConfirmDelete(true)} disabled={busy}>מחיקה</button>
        )}
        <button type="button" className="ui-btn ui-btn-ghost" onClick={onClose} disabled={busy}>ביטול</button>
        <button type="button" className="ui-btn ui-btn-primary" disabled={busy || !name.trim()} onClick={() => void submit()}>
          {busy ? 'שומר…' : 'שמירה'}
        </button>
      </>}>
      <label className="of-field">
        <span className="of-field-label">שם התבנית</span>
        <input value={name} data-autofocus onChange={e => setName(e.target.value)} />
      </label>
      <div className="of-field-label" style={{ margin: '16px 0 4px' }}>שירותים בתבנית</div>
      {!hasServices && <div className="of-empty">אין עדיין שירותים במחירון.</div>}
      {SERVICE_CATEGORY_ORDER.map(cat => {
        const rows = services.filter(s => s.category === cat && s.active);
        if (rows.length === 0) return null;
        return (
          <div key={cat} style={{ marginBottom: 10 }}>
            <div className="of-muted" style={{ margin: '6px 0 2px' }}>{SERVICE_CATEGORY_LABELS[cat]}</div>
            {rows.map(s => (
              <label key={s.id} className="of-check">
                <input type="checkbox" checked={selected.has(s.id)} onChange={() => toggle(s.id)} />
                <span>
                  <span className="of-check-label">{s.name}</span>
                  <span className="of-check-hint">{s.defaultPrice > 0 ? formatILS(s.defaultPrice) : 'כלול'}</span>
                </span>
              </label>
            ))}
          </div>
        );
      })}
      {err && <div className="of-error-box" role="alert">{err}</div>}
    </Modal>
  );
}

// ─── אישור מחיקה בתחתית החלון ───────────────────────────────────────────────
// ‼ מחליף את «ביטול» ו«שמירה» בזמן האישור, והטקסט והכפתורים עוטפים
// (pivo-design.css ‎.qs-del-confirm‎). בשורה אחת קשיחה הטקסט גלש מחוץ לחלון ב-360.

function DeleteConfirm({ busy, onYes, onNo }: { busy: boolean; onYes: () => void; onNo: () => void }) {
  return (
    <span className="qs-del-confirm">
      <span className="of-quiet qs-del-text">למחוק? הצעות קיימות לא ישתנו.</span>
      <button type="button" className="ui-btn ui-btn-danger" disabled={busy} onClick={onYes}>כן, למחוק</button>
      <button type="button" className="ui-btn ui-btn-ghost" disabled={busy} onClick={onNo}>לא</button>
    </span>
  );
}

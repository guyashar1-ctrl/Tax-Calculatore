// ─── תיק מס · מצב עריכה ────────────────────────────────────────────────────
// מקור UX מחייב: docs/prototypes/tax-file-edit-v1.html
// מודל השדות: features/taxFile/editModel.ts
//
// ‼ זה אינו עורך שני — זה **המצב השני של אותו תיק**. הקריאה והעריכה חולקות
// את אותן שש משפחות, אותן כותרות ואותו לקוח קנוני. «עריכה» על מקטע בקריאה
// נוחת כאן על אותה משפחה פתוחה, ו«שמור» מחזיר לאותו מקום.
//
// ‼ כתיבה: כל שדה governed עובר דרך record_manual_fact_change — כלומר מקבל
// field_meta עם source='manual'. שמירה רגילה מפשיטה field_meta, ולכן עריכה
// דרכה הייתה **מוחקת פרובננס** של עובדות שנאספו ביישור קו או בשאלון.
// שדות שאינם governed (פרטי קשר) נשמרים בשמירה הרגילה.

import { useMemo, useState } from 'react';
import type { Client } from '../../types';
import { useTaxFacts } from '../../hooks/useTaxFacts';
import { getTaxYearData } from '../../data/taxData';
import { calcCreditPoints } from '../../utils/taxCalculations';
import { shortDate } from '../../utils/clientDerived';
import { TAX_FACT_SOURCE_LABELS } from '../../types/taxFacts';
import {
  TAX_FAMILIES, SECTIONS_BY_FAMILY, type FamilyKey, type EditField, type EditSection,
} from '../../features/taxFile/editModel';

interface Props {
  client: Client;
  /** אחרי כתיבה טרנזקציונית בשרת — סנכרון העותק המקומי. */
  onClientPersisted: (c: Client) => void;
  /** שמירת שדות שאינם מנוהלים (פרטי קשר) דרך המסלול הרגיל. */
  onPatchAndSave: (partial: Partial<Client>) => Promise<void>;
  /** חזרה לתיק — לאותו מקטע שממנו נכנסו. */
  onClose: () => void;
  /** מפעיל יישור קו, מתוך מקטע הרשויות. */
  onRunAlignment?: () => void;
  alignBusy?: boolean;
  /** הרשימות הארוכות (ילדים, נכסים, מעסיקים) חיות בפרטי הלקוח המלאים. */
  onOpenDetails?: () => void;
  /** המשפחה שנפתחת מיד עם הכניסה. */
  initialFamily?: FamilyKey;
}

function money(n?: number): string {
  return typeof n === 'number' && !Number.isNaN(n)
    ? `₪${Math.round(n).toLocaleString('he-IL')}` : '';
}

/** ערך לתצוגה בשדה. ‼ undefined ⇒ ריק, ולא 0 — «לא ידוע» אינו אפס. */
function fieldValue(client: Client, f: EditField): string {
  const raw = (client as unknown as Record<string, unknown>)[f.key];
  if (raw === undefined || raw === null) return '';
  if (typeof raw === 'boolean') return raw ? 'true' : 'false';
  return String(raw);
}

export default function TaxFileEdit({
  client, onClientPersisted, onPatchAndSave, onClose,
  onRunAlignment, alignBusy, onOpenDetails, initialFamily,
}: Props) {
  const { recordManualEdit } = useTaxFacts(client.id || undefined);
  const [openFam, setOpenFam] = useState<Set<FamilyKey>>(
    new Set(initialFamily ? [initialFamily] : []),
  );
  const [openSec, setOpenSec] = useState<Set<string>>(new Set());
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [savedCount, setSavedCount] = useState(0);

  const meta = client.fieldMeta ?? {};
  const year = new Date().getFullYear();
  const taxData = getTaxYearData(year) ?? getTaxYearData(year - 1);

  /**
   * ‼ הנקודות מחושבות מ**טיוטה מוחלת**, לא מהלקוח השמור: אחרת הרו"ח משנה
   * «ימי מילואים» ורואה את המספר הישן עד שהוא שומר — כלומר בדיוק הרגע שבו
   * הוא צריך את המשוב. זה הלב של «להבין למה 7.25».
   */
  const previewClient = useMemo(() => {
    if (Object.keys(drafts).length === 0) return client;
    const patch: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(drafts)) {
      const f = allFields.find(x => x.key === k);
      if (!f) continue;
      patch[k] = coerce(f, v);
    }
    return { ...client, ...patch } as Client;
  }, [client, drafts]);

  const creditLines = useMemo(
    () => calcCreditPoints(previewClient, year, taxData?.creditPointValue ?? 0),
    [previewClient, year, taxData],
  );
  const totalPoints = creditLines.reduce((s, l) => s + l.points, 0);
  const totalValue = creditLines.reduce((s, l) => s + l.valueNIS, 0);

  function toggle<T>(set: Set<T>, v: T, fn: (s: Set<T>) => void) {
    const n = new Set(set);
    n.has(v) ? n.delete(v) : n.add(v);
    fn(n);
  }

  const dirty = Object.keys(drafts).length > 0;

  async function save() {
    setSaving(true);
    setErr(null);
    let done = 0;
    try {
      const plain: Partial<Client> = {};
      for (const [k, v] of Object.entries(drafts)) {
        const f = allFields.find(x => x.key === k);
        if (!f) continue;
        const value = coerce(f, v);
        if (f.governed && client.id) {
          // ‼ מסלול העובדות: כותב את הערך **ורושם פרובננס** manual + תאריך.
          const res = await recordManualEdit(
            client.id, f.key, f.label,
            fieldValue(client, f) || '—', v || '—',
            { [f.key]: value } as Partial<Client>,
          );
          if (!res.ok) { setErr(`${f.label}: ${res.error ?? 'שמירה נכשלה'}`); break; }
          if (res.client) onClientPersisted(res.client);
          done++;
        } else {
          (plain as Record<string, unknown>)[f.key] = value;
        }
      }
      if (Object.keys(plain).length > 0) { await onPatchAndSave(plain); done += Object.keys(plain).length; }
      if (!err) { setDrafts({}); setSavedCount(done); }
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="txe-root">
      <div className="txe-head">
        <div>
          <h2>עריכת תיק המס</h2>
          <p>אותן עובדות שבתיק, מסודרות לפי משמעות מס. פרטים נפתחים בלחיצה.</p>
        </div>
        <div className="txe-head-actions">
          <button type="button" className="ui-btn" onClick={onClose} disabled={saving}>
            {dirty ? 'חזרה בלי לשמור' : 'חזרה לתיק'}
          </button>
          <button type="button" className="ui-btn ui-btn-primary" onClick={() => void save()} disabled={!dirty || saving}>
            {saving ? 'שומר…' : 'שמור וחזור לתיק'}
          </button>
        </div>
      </div>

      {err && <div className="txe-err">{err}</div>}
      {savedCount > 0 && !dirty && (
        <div className="txe-saved">✓ {savedCount} שדות נשמרו ונרשמו כעדכון של הרו״ח.</div>
      )}

      {TAX_FAMILIES.map(fam => {
        const secs = SECTIONS_BY_FAMILY(fam.key);
        const isOpen = openFam.has(fam.key);
        return (
          <section key={fam.key} className={`txe-fam is-${fam.tone} ${isOpen ? 'is-open' : ''}`}>
            <button type="button" className="txe-fam-head"
              onClick={() => toggle(openFam, fam.key, setOpenFam)} aria-expanded={isOpen}>
              <span className="txe-fam-dot" aria-hidden="true" />
              <span className="txe-fam-title">{fam.title}</span>
              <span className="txe-fam-why">{fam.why}</span>
              <span className="txe-fam-mini">
                {fam.key === 'family' ? `${fmt(totalPoints)} נק׳` : miniOf(secs, client)}
              </span>
              <span className="txe-fam-chev">◂</span>
            </button>

            {isOpen && (
              <div className="txe-fam-body">
                {/* ‼ פאנל הנקודות פותח את משפחת המשפחה — הוא התשובה ל«למה
                    7.25», והוא מתעדכן מהטיוטה עוד לפני שמירה. */}
                {fam.key === 'family' && (
                  <div className="txe-cred">
                    <h4>נקודות הזיכוי — מחושבות מהשדות שמתחת</h4>
                    <div className="txe-cred-rows">
                      {creditLines.map((l, i) => (
                        <div key={i}>
                          <span>{l.description}<em>{l.legalBasis}</em></span>
                          <b>{l.points.toFixed(2)}</b>
                        </div>
                      ))}
                      <div className="txe-cred-tot">
                        <span>סה״כ</span>
                        <b>{fmt(totalPoints)} נק׳ · {money(totalValue)}</b>
                      </div>
                    </div>
                    <p>כל שדה שמסומן ★ משנה את הטבלה. המספר מתעדכן מיד, עוד לפני שמירה.</p>
                  </div>
                )}

                {secs.map(sec => {
                  const secOpen = openSec.has(sec.id);
                  return (
                    <div key={sec.id} className={`txe-sec ${secOpen ? 'is-open' : ''}`}>
                      <button type="button" className="txe-sec-head"
                        onClick={() => toggle(openSec, sec.id, setOpenSec)} aria-expanded={secOpen}>
                        <span className="txe-sec-name">{sec.title}</span>
                        <span className="txe-sec-sum">{sec.summary(previewClient)}</span>
                        <span className="txe-sec-chev">◂</span>
                      </button>
                      {secOpen && (
                        <div className="txe-sec-body">
                          {sec.fields.length > 0 && (
                            <div className="txe-grid">
                              {sec.fields.map(f => (
                                <Field key={f.key} f={f} meta={meta}
                                  value={drafts[f.key] ?? fieldValue(client, f)}
                                  onChange={v => setDrafts(d => ({ ...d, [f.key]: v }))} />
                              ))}
                            </div>
                          )}
                          {sec.listHint && (
                            <div className="txe-note">
                              {sec.listHint}{' '}
                              {onOpenDetails && (
                                <button type="button" className="ui-linkbtn" onClick={onOpenDetails}>
                                  פתח את הרשימה ←
                                </button>
                              )}
                            </div>
                          )}
                          {sec.note && <div className="txe-note">{sec.note}</div>}
                          {sec.fields.some(f => f.authority) && onRunAlignment && (
                            <div className="txe-auth">
                              <span>⟳ הדרך הנכונה לרענן את השדות האלה היא יישור קו.</span>
                              <button type="button" className="ui-linkbtn" disabled={alignBusy}
                                onClick={onRunAlignment}>
                                {alignBusy ? 'מעדכן…' : 'בצע יישור קו'}
                              </button>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        );
      })}
    </div>
  );
}

/* ─── עזרים ──────────────────────────────────────────────────────────────── */

const allFields: EditField[] = TAX_FAMILIES
  .flatMap(f => SECTIONS_BY_FAMILY(f.key))
  .flatMap(s => s.fields);

const fmt = (n: number) => n.toFixed(2).replace(/\.?0+$/, '');

function coerce(f: EditField, v: string): unknown {
  if (f.kind === 'bool') return v === 'true';
  if (f.kind === 'number' || f.kind === 'money') {
    const n = Number(v.replace(/[^\d.-]/g, ''));
    return v.trim() === '' ? undefined : (Number.isNaN(n) ? undefined : n);
  }
  return v;
}

function miniOf(secs: EditSection[], c: Client): string {
  const filled = secs.filter(s => {
    const t = s.summary(c);
    return t && t !== 'טרם ביררנו' && t !== 'אין';
  }).length;
  return `${filled} מתוך ${secs.length}`;
}

function Field({ f, meta, value, onChange }: {
  f: EditField;
  meta: NonNullable<Client['fieldMeta']>;
  value: string;
  onChange: (v: string) => void;
}) {
  const m = meta[f.key as keyof typeof meta];
  // ‼ הפרובננס מוצג רק כשהוא אומר משהו — על שדה תפעולי, או כשמקורו אינו
  //   הרו"ח. הצפה של «מקור» על כל שדה הופכת את המסך לרועש בלי להוסיף מידע.
  // ‼ פרובננס מוצג רק כשהוא מוסיף מידע: שדה תפעולי, או ערך שלא הרו"ח הזין.
  //   הצפת «מקור» על כל שדה הפכה את המסך לרועש בלי לומר דבר.
  const showSrc = !!m && (f.authority || m.source !== 'manual');
  const srcLabel = m
    ? `${TAX_FACT_SOURCE_LABELS[m.source as keyof typeof TAX_FACT_SOURCE_LABELS] ?? 'כרטיס הלקוח'}${m.syncedAt ? ` · ${shortDate(m.syncedAt)}` : ''}`
    : '';

  return (
    <div className={`txe-fld${f.credit ? ' is-credit' : ''}`}>
      <label htmlFor={`f-${f.key}`}>
        {f.label}
        {f.credit && <span className="txe-star" title="משנה נקודות זיכוי">★</span>}
      </label>

      {f.kind === 'bool' ? (
        <select id={`f-${f.key}`} value={value === '' ? '' : value} onChange={e => onChange(e.target.value)}>
          {/* ‼ שלוש אפשרויות ולא צ׳קבוקס: צ׳קבוקס אינו יודע לומר «טרם ביררנו»,
              והוא מציג «לא» גם כשמעולם לא נשאלנו. */}
          <option value="">טרם ביררנו</option>
          <option value="true">כן</option>
          <option value="false">לא — נבדק</option>
        </select>
      ) : f.kind === 'select' ? (
        <select id={`f-${f.key}`} value={value} onChange={e => onChange(e.target.value)}>
          <option value="">טרם ביררנו</option>
          {(f.options ?? []).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
      ) : (
        <input id={`f-${f.key}`} type={f.kind === 'text' ? 'text' : 'text'}
          inputMode={f.kind === 'text' ? undefined : 'numeric'}
          value={value} placeholder="—" onChange={e => onChange(e.target.value)} />
      )}

      {f.note && <div className="txe-fld-note">{f.note}</div>}
      {showSrc && <div className="txe-fld-src">מקור: {srcLabel}</div>}

    </div>
  );
}

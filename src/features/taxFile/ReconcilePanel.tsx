// ─── ראש תיק המס: שורת מצב אחת (16.10.2026; קודם «עדכון ויישור קו», 13.10.2026) ──────────────────
// ‼ 16.10.2026 (גיא, «פחות עומס»): ארבעת המונים, שני הכפתורים וההסבר הארוך ירדו. נשאר משפט אחד —
//   «17 פרטים חסרים · 1 לאישור · 0 מהרשויות» — וכפתור אחד, «השלם עם הלקוח», שפותח/ממשיך את בקשת הקליטה
//   ב«בקשות». הפירוט (מקור, מועד בדיקה ותחולה לכל פרט) — מקופל.
// ‼ 16.10.2026 (גיא, סבב 2: «אין סיבה שזה יופיע פעמיים»): זו הכותרת של «זהות ורשויות» — שורת המצב בתוכה, ושני
//   כפתורים זה לצד זה: «השלם עם הלקוח» (ראשי) ו«בצע יישור קו» (על הרשויות שבכרטיס); «תצוגה מפורטת» — קישור משני.
// ‼ גיא: במקום אזור תהליכים גדול — תמונה ברורה בראש התיק: מה ידוע מהרשויות, מה נמסר בידי הלקוח או הוזן במשרד,
//   מה חסר, מה דורש אישור ומה סותר — עם מקור, מועד בדיקה ותחולה לכל פרט — ופעולה אחת: «הכן שאלון השלמה»,
//   שמבקשת רק מידע חסר או מידע שצריך לאשר מחדש (מה שידוע — מוצג ללקוח לאישור, לא כשאלה מאפס).
// ‼ קריאה בלבד: לא משנה דבר. עדכון בתיק אינו מוצג כשינוי ברשות; תשובת לקוח ממתינה לאישור; סתירה מול הרשות
//   מוצגת לבירור (הכרטיסים «דורש טיפול» ו«הצעות לעדכון» מתחת — אותו מקור, לא עותק).
// ‼ מועד בדיקה ≠ תחולה: «נבדק ב-» הוא מתי עודכן; תאריכי הישות (נרכש / נפתח / ממתי) הם התחולה.

import { useMemo, useState } from 'react';
import type { Client } from '../../types';
import { FIELD_SOURCE_LABELS, type FieldMeta } from '../../types/clientWorkspace';
import { accountSpan, propertySpan, employerSpan, spanText } from '../taxYear/temporal';
import { dealerOf } from '../taxYear/structured';
import { DEALER_KIND_LABELS } from './editModel';
import '../taxYear/taxYear.css';

interface Props {
  client: Client;
  alignedAt?: string | null;
  /** הצעות לעדכון שממתינות לאישור (מכל מקור). */
  pendingCount: number;
  /** ממצאים מול הרשויות שדורשים טיפול (computeAuthorityFlags). */
  flagCount: number;
  /** «טרם ביררנו» להערכת מס (taxReadiness). */
  unknown: string[];
  /** קליטה פתוחה — למצב הכפתור. */
  intakeOpen?: boolean;
  onPrepare: () => void;
  prepareBusy?: boolean;
  prepareError?: string | null;
  onRunAlignment?: () => void;
  alignBusy?: boolean;
  /** «תצוגה מפורטת» — מסכי יישור הקו המלאים (קישור משני). */
  onOpenDetailed?: () => void;
  /** גלילה לכרטיסי «דורש טיפול» / «הצעות לעדכון» שמתחת. */
  onShowPending?: () => void;
}

const AUTH = new Set(['institution_alignment', 'automation', 'shaam', 'authority']);
const he = (iso?: string | null) => (iso ? iso.slice(0, 10).split('-').reverse().join('.') : '');

interface FactRow { key: string; label: string; value: string; source: string; fromAuthority: boolean; checkedAt?: string; validity?: string; missing?: boolean }

const n = (k: number, one: string, many: string) => (k === 1 ? one : `${k} ${many}`);

export default function ReconcilePanel({ client: c, alignedAt, pendingCount, flagCount, unknown, intakeOpen, onPrepare, prepareBusy, prepareError, onShowPending, onRunAlignment, alignBusy, onOpenDetailed }: Props) {
  const [open, setOpen] = useState(false);
  const meta = (c.fieldMeta ?? {}) as Record<string, FieldMeta>;
  const rows = useMemo<FactRow[]>(() => {
    const m = (k: string) => meta[k];
    const src = (k: string) => { const s = m(k)?.source; return s ? FIELD_SOURCE_LABELS[s] ?? 'כרטיס הלקוח' : 'כרטיס הלקוח'; };
    const auth = (k: string) => AUTH.has(String(m(k)?.source ?? ''));
    const row = (key: string, label: string, value: string, extra: Partial<FactRow> = {}): FactRow =>
      ({ key, label, value: value || '—', source: src(key), fromAuthority: auth(key), checkedAt: m(key)?.syncedAt, missing: !value, ...extra });
    const dealer = dealerOf(c, 'client');
    const props = c.properties ?? [];
    const accts = c.investmentAccounts ?? [];
    const emps = (c.employers ?? []).filter(e => !e.endDate);
    const noDate = (n: number, what: string) => (n ? `${n} ${what} בלי תאריך` : '');
    return [
      row('familyStatus', 'מצב משפחתי', { single: 'רווק/ה', married: 'נשוי/אה', divorced: 'גרוש/ה', widowed: 'אלמן/ה', singleParent: 'הורה יחיד/ה' }[c.familyStatus] ?? ''),
      row('children', 'ילדים', (c.children ?? []).length ? `${(c.children ?? []).length} — ${(c.children ?? []).map(k => k.firstName || k.birthYear).join(', ')}` : '',
        { validity: (c.children ?? []).some(k => !k.firstName) ? 'חסר שם לחלק מהילדים' : undefined }),
      row('city', 'יישוב וכתובת', [c.address, c.city].filter(Boolean).join(', ')),
      row('dealerType', 'סוג עוסק', dealer ? DEALER_KIND_LABELS[dealer] : '', { validity: dealer && !(c.businesses ?? []).some(b => !b.isClosed) ? 'רשום כעוסק — פרטי העסק חסרים' : undefined }),
      row('businesses', 'עסקים', (c.businesses ?? []).filter(b => !b.isClosed).map(b => b.name).join(', ')),
      row('employers', 'מעסיקים', emps.map(e => `${e.name}${spanText(employerSpan(e), { from: 'מ-', to: 'עד' }) ? ` (${spanText(employerSpan(e), { from: 'מ-', to: 'עד' })})` : ''}`).join(', ')),
      row('properties', 'נכסים', props.map(p => [p.address, p.city].filter(Boolean).join(' ')).join(', '),
        { validity: noDate(props.filter(p => !propertySpan(p as never).start).length, 'נכסים') || undefined }),
      row('investmentAccounts', 'חשבונות השקעות', accts.filter(a => !a.isClosed).map(a => a.institutionName).join(', '),
        { validity: noDate(accts.filter(a => !accountSpan(a as never).start).length, 'חשבונות') || undefined }),
      // ‼ החשבון להחזרים = הראשי שלא נסגר (חשבון שנסגר נשאר ברשימה להיסטוריה, ולא היה נכון להציג את הראשון ברשימה)
      row('bankAccounts', 'חשבון להחזרים', [(c.bankAccounts ?? []).find(b => b.isPrimary && !b.closedAt) ?? (c.bankAccounts ?? []).find(b => !b.closedAt)].filter(Boolean).map(b => b!).map(b => `${b.bankName}${b.branchNumber ? ` · ${b.branchNumber}` : ''}${b.accountNumber ? ` · …${String(b.accountNumber).slice(-4)}` : ''}`).join('')),
      row('pensionFunds', 'קופות', (c.pensionFunds ?? []).map(f => f.institutionName).join(', ')),
    ];
  }, [c, meta]);

  const fromAuth = rows.filter(r => r.fromAuthority && !r.missing);
  const gaps = rows.filter(r => r.missing || r.validity);
  const missingCount = unknown.length + gaps.length;

  const toApprove = pendingCount + flagCount;
  return (
    <section className="rp is-line" aria-labelledby="rp-h" data-tax-file-top>
      <div className="rp-head">
        <h3 id="rp-h" className="rp-title">זהות ורשויות</h3>
        <span className="rp-sub">
          {alignedAt ? `יישור קו אחרון: ${he(alignedAt)}` : 'טרם בוצע יישור קו'}
          {onOpenDetailed && <> · <button type="button" className="rp-link is-quiet" onClick={onOpenDetailed}>תצוגה מפורטת</button></>}
        </span>
      </div>
      <div className="rp-line">
        <p className="rp-status" data-rp-status>
          <span className={missingCount ? 'is-blue' : ''}>{n(missingCount, 'פרט אחד חסר', 'פרטים חסרים')}</span>
          <span aria-hidden="true" className="rp-dot">·</span>
          {toApprove
            ? <button type="button" className="rp-link is-amber" onClick={onShowPending}>{n(toApprove, 'אחד לאישור', 'לאישור')}</button>
            : <span>0 לאישור</span>}
          <span aria-hidden="true" className="rp-dot">·</span>
          <span title={alignedAt ? `יישור קו אחרון: ${he(alignedAt)}` : 'טרם בוצע יישור קו מול הרשויות'}>{n(fromAuth.length, 'אחד מהרשויות', 'מהרשויות')}</span>
        </p>
        <button type="button" className="btn btn-primary" onClick={onPrepare} disabled={prepareBusy} data-intake-open
          title={intakeOpen ? 'ממשיך את בקשת הקליטה הפתוחה ב«בקשות»' : 'פותח בקשת קליטה ב«בקשות» — שאלות רק על מה שחסר או צריך אישור'}>
          {prepareBusy ? 'פותח…' : 'השלם עם הלקוח'}
        </button>
        {onRunAlignment && (
          <button type="button" className="btn btn-secondary" onClick={onRunAlignment} disabled={alignBusy} data-run-alignment
            title="קריאה מהרשויות שבכרטיס — מעדכנת את התיק, וכל מה שדורש טיפול מופיע כאן">
            {alignBusy ? 'מעדכן…' : 'בצע יישור קו'}
          </button>
        )}
      </div>
      {prepareError && <div className="ty-err" role="alert">{prepareError}</div>}
      <details className="rp-detail" open={open} onToggle={e => setOpen((e.currentTarget as HTMLDetailsElement).open)}>
        <summary>מה חסר, ומאיפה כל פרט</summary>
        {unknown.length > 0 && <p className="rp-unknown">טרם ביררנו: {unknown.join(' · ')}</p>}
        <div className="rp-table" role="table" aria-label="פרטי התיק">
          <div className="rp-tr rp-th" role="row"><span role="columnheader">פרט</span><span role="columnheader">בתיק</span><span role="columnheader">מקור</span><span role="columnheader">נבדק / עודכן</span><span role="columnheader">תחולה וחוסרים</span></div>
          {rows.map(r => (
            <div key={r.key} className={`rp-tr${r.missing ? ' is-missing' : ''}`} role="row">
              <span role="cell"><b>{r.label}</b></span>
              <span role="cell">{r.value}</span>
              <span role="cell">{r.missing ? '—' : r.source}{r.fromAuthority ? '' : !r.missing ? <small> · לא אומת ברשות</small> : null}</span>
              <span role="cell">{r.checkedAt ? he(r.checkedAt) : '—'}</span>
              <span role="cell">{r.missing ? 'חסר' : r.validity ?? ''}</span>
            </div>
          ))}
        </div>
      </details>
    </section>
  );
}

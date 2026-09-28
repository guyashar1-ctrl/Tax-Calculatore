// ─── טופס 6101 — מנתוני ההגשה לפעולות ציור ────────────────────────────────
// כאן חיים כללי העיצוב של הטופס הזה (ת"ז עם אפסים מובילים, קידומת טלפון,
// פיצול מייל סביב ה-@ המודפס, תאריך dd/mm/yyyy, סכום עם מפריד אלפים) וההחלטה
// מה מוצג בכל תרחיש. הפריסה עצמה גנרית (../layout.ts).

import type { DrawOp, FieldDef, LayoutIssue, LayoutResult, MeasureText } from '../types';
import { layoutFields, type FieldValue } from '../layout';
import { BTL6101_TEMPLATE, OCCUPATION_VISIBLE_ROWS } from './template';
import type { Btl6101Data, Btl6101Purpose, OccupationRow6101 } from './model';
import { DATE_KEYS, INCOME_BASIS_LABELS, MONEY_KEYS, sectionApplies } from './model';

/** YYYY-MM-DD ⇒ dd/mm/yyyy. ערך שאינו ISO נשאר כמו שהוא (והוולידציה תתפוס). */
export function formDate(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso.trim());
  return m ? `${m[3]}/${m[2]}/${m[1]}` : iso.trim();
}

/** «12500» / «12,500» ⇒ «12,500». לא מספר ⇒ כמו שהוא. ‼ ריק נשאר ריק (לא 0). */
export function formMoney(v: string): string {
  const raw = v.replace(/[,\s₪]/g, '');
  if (!raw) return '';
  if (!/^\d+(\.\d+)?$/.test(raw)) return v.trim();
  return Math.round(Number(raw)).toLocaleString('en-US');
}

/** ת"ז: ספרות בלבד, 9 ספרות עם אפסים מובילים (כך היא נכתבת בתיבות). */
export function formId(v: string): string {
  const d = v.replace(/\D/g, '');
  return d ? d.padStart(9, '0') : '';
}

/** טלפון לתיבות: «קידומת|מספר». 972 ⇒ 0. אורך שאינו תקין נשאר כמו שהוא (שגיאה בפריסה). */
export function formPhone(v: string, kind: 'landline' | 'mobile'): string {
  let d = v.replace(/\D/g, '');
  if (!d) return '';
  if (d.startsWith('972')) d = '0' + d.slice(3);
  if (kind === 'mobile') return d.length === 10 ? `${d.slice(0, 3)}|${d.slice(3)}` : d;
  if (d.length === 9) return `${d.slice(0, 2)}|${d.slice(2)}`;
  if (d.length === 10) return `${d.slice(0, 3)}|${d.slice(3)}`;
  return d;
}

export function splitEmail(v: string): { local: string; domain: string } {
  const t = v.trim();
  const at = t.lastIndexOf('@');
  if (at < 0) return { local: t, domain: '' };
  return { local: t.slice(0, at), domain: t.slice(at + 1) };
}

/** «3,200 לחודש» — הסכום עם הפרשנות שהוזנה. בלי פרשנות ⇒ הסכום בלבד (והפתרון חוסם נעילה). */
export function incomeWithBasis(r: OccupationRow6101): string {
  const amount = formMoney(r.nonWorkIncome ?? '');
  if (!amount) return '';
  return r.nonWorkIncomeBasis ? `${amount} ${INCOME_BASIS_LABELS[r.nonWorkIncomeBasis]}` : amount;
}

/** מיון העיסוקים: האחרון קודם (כמו בפורטל ב"ל); בלי תאריך — בסוף. */
export function sortOccupationRows(rows: readonly OccupationRow6101[]): OccupationRow6101[] {
  return [...rows].sort((a, b) => (b.from || '0000').localeCompare(a.from || '0000'));
}

export function spouseRelevant(d: Btl6101Data): boolean {
  return d.maritalStatus === 'married' || d.maritalStatus === 'common_law';
}

const hasAny = (d: Btl6101Data, keys: (keyof Btl6101Data)[]) =>
  keys.some(k => typeof d[k] === 'string' && (d[k] as string).trim() !== '');

export const ALT_CONTACT_KEYS: (keyof Btl6101Data)[] = ['altContactLastName', 'altContactFirstName', 'altContactIdNumber'];
export const MAILING_KEYS: (keyof Btl6101Data)[] = ['mailRecipient', 'mailStreet', 'mailHouse', 'mailEntrance', 'mailApartment', 'mailCity', 'mailZip'];

/** האם השדה רלוונטי בהגשה — מקטע התרחיש + תנאים של הטופס עצמו. */
export function isActive6101(f: FieldDef, d: Btl6101Data, purposes: readonly Btl6101Purpose[]): boolean {
  if (!sectionApplies(f.section, purposes)) return false;
  if (f.section === 'spouse') return spouseRelevant(d);
  if (f.section === 'altContact') return hasAny(d, ALT_CONTACT_KEYS);
  if (f.section === 'mailing') return hasAny(d, MAILING_KEYS);
  return true;
}

function occupationValue(key: string, d: Btl6101Data): FieldValue {
  const m = /^occupations\[(\d+)\]\.(\w+)$/.exec(key);
  if (!m) return undefined;
  const row = sortOccupationRows(d.occupations)[Number(m[1])];
  if (!row) return undefined;
  const col = m[2] as keyof OccupationRow6101;
  const v = row[col] ?? '';
  if (col === 'from' || col === 'to') return formDate(v);
  if (col === 'nonWorkIncome') return incomeWithBasis(row);
  return v;
}

/** האם המייל נכנס סביב ה-@ המודפס (שני החלקים, בגודל המינימלי לכל היותר). */
export function emailFitsAroundAt(email: string, measure?: MeasureText): boolean {
  if (!measure) return true;
  const { local, domain } = splitEmail(email);
  const lf = BTL6101_TEMPLATE.fields.find(x => x.id === 'p1.contact.emailLocal')!;
  const df = BTL6101_TEMPLATE.fields.find(x => x.id === 'p1.contact.emailDomain')!;
  return measure(local, lf.minFontSize) <= lf.box.w - 2 && measure(domain, df.minFontSize) <= df.box.w - 2;
}

export function valueFor6101(f: FieldDef, d: Btl6101Data, measure?: MeasureText): FieldValue {
  const key = f.dataKey;
  if (key.startsWith('#signature')) return undefined;
  if (key === '#appendixNote') {
    const extra = d.occupations.length - OCCUPATION_VISIBLE_ROWS;
    return extra > 0 ? `* ${extra === 1 ? 'תקופה נוספת מפורטת' : `${extra} תקופות נוספות מפורטות`} בנספח המצורף לטופס (עמוד 4)` : undefined;
  }
  if (key.startsWith('occupations[')) return occupationValue(key, d);
  if (key.includes('=')) {
    const [k, v] = key.split('=');
    return (d as unknown as Record<string, unknown>)[k] === v;
  }
  if (key === 'email@local' || key === 'email@domain' || key === 'email@whole') {
    const fits = emailFitsAroundAt(d.email, measure);
    if (key === 'email@whole') return fits ? undefined : d.email.trim();
    if (!fits) return undefined;
    return key === 'email@local' ? splitEmail(d.email).local : splitEmail(d.email).domain;
  }
  const v = (d as unknown as Record<string, unknown>)[key];
  if (typeof v === 'boolean') return v;
  if (typeof v !== 'string') return undefined;
  if (key === 'idNumber' || key === 'spouseIdNumber' || key === 'altContactIdNumber') return formId(v);
  if (key === 'landline') return formPhone(v, 'landline');
  if (key === 'mobile') return formPhone(v, 'mobile');
  if (key === 'maritalSinceMonth') return v ? v.replace(/\D/g, '').padStart(2, '0') : '';
  if (DATE_KEYS.has(key as keyof Btl6101Data)) return formDate(v);
  if (MONEY_KEYS.has(key as keyof Btl6101Data)) return formMoney(v);
  return v;
}

export const APPENDIX_HEADER = ['מתאריך', 'עד תאריך', 'עיסוק', 'הכנסה שלא מעבודה (₪)', 'מקור ההכנסה'];

export function layout6101(d: Btl6101Data, purposes: readonly Btl6101Purpose[], measure: MeasureText): LayoutResult {
  const { ops, issues } = layoutFields({
    template: BTL6101_TEMPLATE,
    valueOf: f => valueFor6101(f, d, measure),
    isActive: f => isActive6101(f, d, purposes),
    measure,
  });
  const out: DrawOp[] = [...ops];
  const extraIssues: LayoutIssue[] = [];
  let pageCount = BTL6101_TEMPLATE.pageCount;

  if (sectionApplies('occupations', purposes)) {
    const sorted = sortOccupationRows(d.occupations);
    const overflow = sorted.slice(OCCUPATION_VISIBLE_ROWS);
    if (overflow.length) {
      pageCount += 1;
      out.push({
        kind: 'appendix', page: pageCount,
        title: 'נספח לטופס 6101 — המשך סעיף 3: עיסוק והכנסות בשנתיים האחרונות',
        idNumber: formId(d.idNumber),
        name: `${d.firstName} ${d.lastName}`.trim(),
        header: APPENDIX_HEADER,
        rows: overflow.map(r => [formDate(r.from), formDate(r.to), r.occupation, incomeWithBasis(r), r.nonWorkSource]),
      });
    }
  }
  return { ops: out, issues: [...issues, ...extraIssues], pageCount };
}

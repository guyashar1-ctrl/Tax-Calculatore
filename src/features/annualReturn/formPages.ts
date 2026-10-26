// ─── הטופס עצמו: עמודי 1301 והנספחים עם הערכים בשדות (25.10.2026) ─────────────────────────────────────────
// ‼ גיא: «אני אראה גם את הדוחות עצמם, 1301 והנספחים, במהלך כל התהליך». העמודים והמיקומים — של מפת הטופס
//   (taxKnowledge/formMap: LAYOUTS + markersOf, מהטופס הרשמי 2025); הערכים — מהמנוע (computeReturn), לא חישוב שני.
// ‼ טהור: אותו חישוב משמש את המסך ואת ההדפסה (printSet.ts).

import { LAYOUTS, MAP_FORMS, markersOf, type Box, type FormSlug, type Role } from '../taxKnowledge/formMap/model';
import type { ReturnField, ReturnOutputs } from './types';
import PAGE1 from '../taxForms/data/form1301-2025.page1-fill.json';

const personOf = (r: Role | undefined): ReturnField['person'] | undefined => (r === 'registered' ? 'client' : r === 'spouse' ? 'spouse' : r === 'joint' ? 'joint' : undefined);
const nis = (n: number) => Math.round(n).toLocaleString('he-IL');

/** הערך שנכתב בשדה: סכום · X לתיבה מסומנת (כמו «סמן X» בטופס; ✕ לא קיים בגופן של ה-PDF) · טקסט קצר. ריק — לא כותבים. */
export function fieldText(f: ReturnField | undefined): string {
  if (!f) return '';
  if (f.kind === 'amount') return typeof f.amount === 'number' && f.amount !== 0 ? nis(f.amount) : '';
  if (f.kind === 'checkbox') return f.checked ? 'X' : '';
  return (f.text ?? '').trim();
}

export interface PageValue { key: string; code: string; box: Box; text: string; kind: ReturnField['kind']; center?: boolean }

const ymdToHe = (s: string) => (/^\d{4}-\d{2}-\d{2}/.test(s) ? s.slice(0, 10).split('-').reverse().join('.') : s);

/**
 * ‼ גיא (25.10): «ב-1301 אני לא רואה שהוא מילא את הנתונים שכבר יש לו — הפרטים היבשים וכל הסימונים».
 *   עמוד 1: פרטים אישיים ותיבות סימון — מאותם שדות שהמנוע כבר מפיק לקובץ (formCoverage.produced, מזהי F###),
 *   לתאים שנמדדו מהטופס הרשמי (form1301-2025.page1-fill.json). שדה שאין לנו — נשאר ריק.
 */
function page1Values(out: ReturnOutputs): PageValue[] {
  const prod = new Map((out.formCoverage?.produced ?? []).filter(f => /^F\d{3}(\.options)?$/.test(f.code)).map(f => [f.code, f]));
  const txt = (k: string) => {
    const f = prod.get(k);
    const t = (f?.text ?? '').trim();
    if (!t) return '';
    if (k === 'F061' || k === 'F066') return ymdToHe(t);
    // תיק ניכויים — הספרה 9 מודפסת בתא
    if (k === 'F083' || k === 'F090') return t.replace(/^9/, '');
    return t;
  };
  const res: PageValue[] = [];
  for (const [key, box] of Object.entries(PAGE1.text)) {
    let text: string;
    if (key === 'F094:branch' || key === 'F094:bank') {
      const v = txt('F094').replace(/\D/g, '');
      text = v.length === 5 ? (key === 'F094:bank' ? v.slice(0, 2) : v.slice(2)) : '';
    } else text = key.split('+').map(txt).filter(Boolean).join(' · ');
    if (text) res.push({ key: `p1-${key}`, code: key, box: box as Box, text, kind: 'text' });
  }
  for (const [key, box] of Object.entries(PAGE1.check)) {
    if (prod.get(key)?.checked) res.push({ key: `p1-${key}`, code: key, box: box as Box, text: 'X', kind: 'checkbox', center: true });
  }
  for (const [key, byRole] of Object.entries(PAGE1.perPerson)) {
    for (const f of out.fields.filter(x => x.code === key && x.kind === 'checkbox')) {
      const box = byRole[f.person === 'spouse' ? 'spouse' : 'client'];
      res.push({ key: `p1-${key}-${f.person}`, code: key, box: box as Box, text: 'X', kind: 'checkbox', center: true });
    }
  }
  if (prod.get('F012')?.checked) for (const o of (prod.get('F012.options')?.text ?? '').split(',').filter(Boolean)) {
    const box = PAGE1.options.F012[o as keyof typeof PAGE1.options.F012];
    if (box) res.push({ key: `p1-F012-${o}`, code: 'F012', box: box as Box, text: 'X', kind: 'checkbox', center: true });
  }
  for (const [key, box] of Object.entries(PAGE1.yes)) {
    if (prod.get(key)?.checked) res.push({ key: `p1-${key}`, code: key, box: box as Box, text: 'X', kind: 'checkbox', center: true });
  }
  const fs = PAGE1.familyStatus[txt('F067') as keyof typeof PAGE1.familyStatus];
  if (fs) res.push({ key: 'p1-F067', code: 'F067', box: fs as Box, text: 'X', kind: 'checkbox', center: true });
  return res;
}

/**
 * ‼ גיא (27.10): «תראה את הטקסט שהודבק בדוח» — מספר התיק עלה על הכותרת, שם המשפחה גלש לתא הסמוך, תאריך הלידה נחתך ל-«99».
 *   גודל האות נקבע לפי התא בעמוד, לא לפי המסך: עד 1.05% מגובה העמוד ו-72% מגובה התא, ומתכווץ עד שכל הטקסט נכנס לרוחב התא.
 *   אותו חישוב במסך, בהדפסה וב-PDF החתום. התוצאה — שבר מגובה העמוד; aspect = רוחב/גובה העמוד.
 */
export function fitFontPct(box: Box, text: string, aspect: number): number {
  const byHeight = Math.min(0.0105, box[3] * 0.72);
  const room = box[2] * aspect - 0.004;
  const byWidth = room / (Math.max(1, [...text].length) * 0.6);
  return Math.max(0.004, Math.min(byHeight, byWidth));
}
/** אותו גודל ביחידות של רוחב העמוד (cqw) — במסך ובהדפסה העמוד הוא ה-container. */
export const fitFontCqw = (box: Box, text: string, aspect: number) => +(fitFontPct(box, text, aspect) / aspect * 100).toFixed(3);

/** הערכים על עמוד: כל סימון בעמוד עם הקוד והטור שלו ⇒ השדה מהמנוע. ‼ רק 1301 — לנספחים אין עדיין מיפוי קוד ⇒ שדה. */
export function valuesOnPage(slug: FormSlug, page: number, out: ReturnOutputs): PageValue[] {
  if (slug !== '1301') return [];
  const all = [...out.fields, ...(out.formCoverage?.produced ?? [])];
  const find = (code: string, role?: Role) => {
    const p = personOf(role);
    return all.find(f => f.code === code && (!p || f.person === p)) ?? (p ? undefined : all.find(f => f.code === code));
  };
  const res: PageValue[] = [];
  for (const m of markersOf(slug).filter(x => x.page === page && x.code)) {
    const f = find(m.code, m.fields[0]?.role);
    const text = fieldText(f);
    if (text) res.push({ key: m.id, code: m.code, box: m.box, text, kind: f!.kind });
  }
  return page === 1 ? [...res, ...page1Values(out)] : res;
}

/** כל העמודים של טופס, לפי הסדר. */
export const pagesOf = (slug: FormSlug) => LAYOUTS[slug]?.pages ?? [];
/** מזהה הטופס ⇒ הטופס במפה (1320, 1322, 1399י…). */
export const slugOfForm = (formId: string): FormSlug | undefined => MAP_FORMS.find(f => f.formId === formId && f.domain === 'annual')?.slug;

/** ערכי נספח, כרשימה ליד העמוד (עד שיהיה מיפוי שדה-שדה): 1320 לכל עסק, 1321, ושורות הנספח מהמנוע. */
export function annexValues(formId: string, out: ReturnOutputs): { label: string; text: string }[] {
  if (formId === '1320' && out.annex1320?.length) {
    return out.annex1320.flatMap(b => Object.entries(b.lines).filter(([, v]) => typeof v === 'number' && v !== 0)
      .map(([k, v]) => ({ label: `${out.annex1320!.length > 1 ? `${b.label} · ` : ''}שורה ${k}`, text: nis(v) })));
  }
  if (formId === '1321' && out.annex1321) {
    const a = out.annex1321;
    return [{ label: 'הכנסה משכירות', text: nis(a.gross) }, ...(a.ownHousingRent ? [{ label: 'שכר דירה למגורים', text: nis(a.ownHousingRent) }] : []), { label: 'נטו', text: nis(a.net) }];
  }
  return out.annexes.filter(a => a.formId === formId).flatMap(a => a.rows.filter(r => r.amount || r.text).map(r => ({ label: r.label, text: typeof r.amount === 'number' ? nis(r.amount) : r.text ?? '' })));
}

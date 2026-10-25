// ─── הטופס עצמו: עמודי 1301 והנספחים עם הערכים בשדות (25.10.2026) ─────────────────────────────────────────
// ‼ גיא: «אני אראה גם את הדוחות עצמם, 1301 והנספחים, במהלך כל התהליך». העמודים והמיקומים — של מפת הטופס
//   (taxKnowledge/formMap: LAYOUTS + markersOf, מהטופס הרשמי 2025); הערכים — מהמנוע (computeReturn), לא חישוב שני.
// ‼ טהור: אותו חישוב משמש את המסך ואת ההדפסה (printSet.ts).

import { LAYOUTS, MAP_FORMS, markersOf, type Box, type FormSlug, type Role } from '../taxKnowledge/formMap/model';
import type { ReturnField, ReturnOutputs } from './types';

const personOf = (r: Role | undefined): ReturnField['person'] | undefined => (r === 'registered' ? 'client' : r === 'spouse' ? 'spouse' : r === 'joint' ? 'joint' : undefined);
const nis = (n: number) => Math.round(n).toLocaleString('he-IL');

/** הערך שנכתב בשדה: סכום · ✕ לתיבה מסומנת · טקסט קצר. ריק — לא כותבים. */
export function fieldText(f: ReturnField | undefined): string {
  if (!f) return '';
  if (f.kind === 'amount') return typeof f.amount === 'number' && f.amount !== 0 ? nis(f.amount) : '';
  if (f.kind === 'checkbox') return f.checked ? '✕' : '';
  return (f.text ?? '').trim();
}

export interface PageValue { key: string; code: string; box: Box; text: string; kind: ReturnField['kind'] }

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
  return res;
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

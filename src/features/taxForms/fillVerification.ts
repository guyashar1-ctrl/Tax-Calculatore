// ─── אימות טופס ממולא — התוצר עצמו, לא רק הנתונים ──────────────────────────
// אחרי הפקה: מחלצים מה נכתב בפועל בקובץ (טקסט לכל שדה, סימון לכל תיבה) ומשווים
// לתשובות המאושרות. ‼ אותה בדיקה רצה פעמיים: על הקובץ שהופק, ועל הקובץ אחרי
// שנשמר ונפתח מחדש — כדי לוודא שהמילוי נשמר ומוצג נכון, לא רק שצויר.
// ‼ «ריק» בקובץ אינו «אפס» ואינו «לא»: אפס שנבדק נכתב 0; «לא רלוונטי» נשאר ריק;
// תשובה חסרה חוסמת הפקה עוד לפני הבדיקה הזו.

import type { FieldAnswer, FormField } from './types';

/** מה נמצא בקובץ עבור שדה אחד. */
export interface ExtractedValue { fieldKey: string; text?: string | null; checked?: boolean }

export type FillProblemCode =
  | 'wrongVersion' | 'answerMissing' | 'valueMismatch' | 'valueMissing' | 'filledButNotApplicable'
  | 'checkboxMismatch' | 'hebrewReversed' | 'hebrewMismatch' | 'calculationMismatch'
  | 'annexMissing' | 'annexUnexpected' | 'reopenMismatch';

export interface FillProblem { fieldKey: string; code: FillProblemCode; message: string }

export interface FillCheckInput {
  versionId: string;
  /** הגרסה שהקובץ מצהיר עליה (טביעה/כותרת). */
  fileVersionId: string;
  fields: readonly FormField[];
  answers: readonly FieldAnswer[];
  extracted: readonly ExtractedValue[];
  /** בדיקות חישוב: שדה, הערך הצפוי מהחישוב, סטייה מותרת (₪). */
  calculations?: readonly { fieldKey: string; expected: number; tolerance?: number }[];
  annexesExpected?: readonly string[];
  annexesPresent?: readonly string[];
}

const BIDI = /[‎‏‪-‮⁦-⁩]/g;
const normText = (s: string) => s.normalize('NFC').replace(BIDI, '').replace(/\s+/g, ' ').trim();
const normAmount = (s: string) => s.replace(BIDI, '').replace(/[₪,\s]/g, '').replace(/^\((.*)\)$/, '-$1');
const HEB = /[֐-׿]/;

export function verifyFilledForm(input: FillCheckInput): { ok: boolean; checked: number; problems: FillProblem[] } {
  const problems: FillProblem[] = [];
  if (input.fileVersionId !== input.versionId) {
    problems.push({ fieldKey: '*', code: 'wrongVersion', message: `הקובץ הוא ${input.fileVersionId}, נדרש ${input.versionId}` });
    return { ok: false, checked: 0, problems };
  }
  const ex = new Map(input.extracted.map(e => [e.fieldKey, e]));
  let checked = 0;
  for (const f of input.fields) {
    const a = input.answers.filter(x => x.fieldKey === f.key).sort((x, y) => y.answeredAt.localeCompare(x.answeredAt))[0];
    const got = ex.get(f.key);
    checked++;
    if (!a || a.state.kind === 'missing') { problems.push({ fieldKey: f.key, code: 'answerMissing', message: `${f.label}: אין תשובה — אסור להפיק` }); continue; }
    const st = a.state;
    if (f.kind === 'checkbox') {
      const want = st.kind === 'value' ? !!st.value : false;
      if ((got?.checked ?? false) !== want) problems.push({ fieldKey: f.key, code: 'checkboxMismatch', message: `${f.label}: ${want ? 'אמור להיות מסומן' : 'אסור שיהיה מסומן'}` });
      continue;
    }
    const text = got?.text == null ? '' : String(got.text);
    if (st.kind === 'notApplicable' || st.kind === 'no') {
      if (normText(text)) problems.push({ fieldKey: f.key, code: 'filledButNotApplicable', message: `${f.label}: «${st.kind === 'no' ? 'לא' : 'לא רלוונטי'}» אבל נכתב «${normText(text)}»` });
      continue;
    }
    if (!normText(text)) { problems.push({ fieldKey: f.key, code: 'valueMissing', message: `${f.label}: הערך לא נכתב בקובץ` }); continue; }
    if (f.kind === 'amount' || f.kind === 'count') {
      const want = st.kind === 'zero' ? '0' : String(st.kind === 'value' ? st.value : '');
      if (normAmount(text) !== normAmount(want)) problems.push({ fieldKey: f.key, code: 'valueMismatch', message: `${f.label}: בקובץ ${normText(text)}, צפוי ${want}` });
      continue;
    }
    const want = normText(String(st.kind === 'value' ? st.value : ''));
    const got2 = normText(text);
    if (got2 === want) continue;
    if (HEB.test(want) && got2 === [...want].reverse().join('')) problems.push({ fieldKey: f.key, code: 'hebrewReversed', message: `${f.label}: העברית נכתבה הפוכה` });
    else problems.push({ fieldKey: f.key, code: HEB.test(want) ? 'hebrewMismatch' : 'valueMismatch', message: `${f.label}: בקובץ «${got2}», צפוי «${want}»` });
  }
  for (const c of input.calculations ?? []) {
    const got = ex.get(c.fieldKey)?.text;
    const n = got == null ? NaN : Number(normAmount(String(got)));
    if (!(Math.abs(n - c.expected) <= (c.tolerance ?? 0))) problems.push({ fieldKey: c.fieldKey, code: 'calculationMismatch', message: `חישוב: בקובץ ${got ?? 'ריק'}, החישוב נותן ${c.expected}` });
  }
  const present = new Set(input.annexesPresent ?? []);
  const expected = new Set(input.annexesExpected ?? []);
  for (const id of expected) if (!present.has(id)) problems.push({ fieldKey: id, code: 'annexMissing', message: `נספח ${id} נדרש ולא צורף` });
  for (const id of present) if (!expected.has(id)) problems.push({ fieldKey: id, code: 'annexUnexpected', message: `נספח ${id} צורף בלי שנקבע שהוא נדרש` });
  return { ok: problems.length === 0, checked, problems };
}

/** הקובץ אחרי שמירה ופתיחה מחדש חייב להחזיר בדיוק את מה שחולץ מהקובץ שהופק. */
export function verifyReopened(first: readonly ExtractedValue[], reopened: readonly ExtractedValue[]): FillProblem[] {
  const b = new Map(reopened.map(e => [e.fieldKey, e]));
  const out: FillProblem[] = [];
  for (const e of first) {
    const r = b.get(e.fieldKey);
    if (!r || normText(String(r.text ?? '')) !== normText(String(e.text ?? '')) || (r.checked ?? false) !== (e.checked ?? false)) {
      out.push({ fieldKey: e.fieldKey, code: 'reopenMismatch', message: `${e.fieldKey}: אחרי פתיחה מחדש הערך שונה או חסר` });
    }
  }
  return out;
}

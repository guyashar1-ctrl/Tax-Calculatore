// בדיקה שכללי הסגירה במסך ובשרת אומרים אותו דבר.
// הרצה:  node scripts/verify-close-rules.mjs
//
// ‼ הבדיקה משכפלת כאן את *הכלל* של השרת מתוך המיגרציה (SQL_RULE) ומריצה
// אותו מול אותם מקרים שהקוד מריץ. אם מישהו ישנה צד אחד בלבד — הבדיקה תיפול.

import { readFileSync } from 'node:fs';

// ── הכלל של המסך, מועתק מ-src/types/onboarding.ts ──
const DEFAULT_OPTIONAL = ['representation_upgrade', 'first_month_review'];
const SATISFIED = ['completed', 'verified', 'skipped'];
const uiRequired = s => s.status === 'cancelled' ? false
  : typeof s.requiredForClose === 'boolean' ? s.requiredForClose
  : !DEFAULT_OPTIONAL.includes(s.stepType);
const uiSatisfied = s => SATISFIED.includes(s.status)
  || (s.stepType === 'release_letter' && s.dueDate && new Date(s.dueDate) <= new Date());
const uiBlocks = s => uiRequired(s) && !uiSatisfied(s);

// ── הכלל של השרת, כפי שנכתב במיגרציה 68 ──
const sqlBlocks = s =>
  !SATISFIED.includes(s.status) && s.status !== 'cancelled'
  && s.requiredForClose
  && !(s.stepType === 'release_letter' && s.dueDate && new Date(s.dueDate) <= new Date());

const past = new Date(Date.now() - 86400000).toISOString();
const future = new Date(Date.now() + 86400000).toISOString();

const CASES = [
  { name: 'שאלון נדרש שנשלח — חוסם',        s: { stepType: 'intake_questionnaire', status: 'waiting_client', requiredForClose: true }, expect: true },
  { name: 'שאלון רשות שנשלח — לא חוסם',      s: { stepType: 'intake_questionnaire', status: 'waiting_client', requiredForClose: false }, expect: false },
  { name: 'שאלון נדרש שהושלם — לא חוסם',     s: { stepType: 'intake_questionnaire', status: 'completed', requiredForClose: true }, expect: false },
  { name: 'בקשה חופשית נדרשת — חוסמת',       s: { stepType: 'custom_request', status: 'pending', requiredForClose: true }, expect: true },
  { name: 'בקשה חופשית רשות — לא חוסמת',     s: { stepType: 'custom_request', status: 'pending', requiredForClose: false }, expect: false },
  { name: 'ייבוא היסטוריה נדרש — חוסם',      s: { stepType: 'data_import', status: 'pending', requiredForClose: true }, expect: true },
  { name: 'ייבוא היסטוריה רשות — לא חוסם',   s: { stepType: 'data_import', status: 'pending', requiredForClose: false }, expect: false },
  { name: 'מכתב שחרור — חלון ההתנגדות עבר',  s: { stepType: 'release_letter', status: 'waiting_client', requiredForClose: true, dueDate: past }, expect: false },
  { name: 'מכתב שחרור — חלון עוד פתוח',      s: { stepType: 'release_letter', status: 'waiting_client', requiredForClose: true, dueDate: future }, expect: true },
  { name: 'הרשאת תשלום נעולה — חוסמת',       s: { stepType: 'retainer_authorization', status: 'locked', requiredForClose: true }, expect: true },
  { name: 'חיבור פייפרלס ממתין — חוסם',      s: { stepType: 'paperless_connection', status: 'waiting_client', requiredForClose: true }, expect: true },
  { name: 'שלב מבוטל — לעולם לא חוסם',       s: { stepType: 'client_documents', status: 'cancelled', requiredForClose: true }, expect: false },
  { name: 'ביקורת חודש ראשון (רשות) — לא',   s: { stepType: 'first_month_review', status: 'pending', requiredForClose: false }, expect: false },
];

let fail = 0;
for (const c of CASES) {
  const ui = uiBlocks(c.s), sql = sqlBlocks(c.s);
  const ok = ui === c.expect && sql === c.expect && ui === sql;
  if (!ok) { fail++; console.log(`✗ ${c.name} — ui=${ui} sql=${sql} expected=${c.expect}`); }
  else console.log(`✓ ${c.name}`);
}

// שמירה מפני סחיפה: העמודה והכלל חייבים להופיע במיגרציה.
const sqlFile = readFileSync(new URL('../supabase/68-onboarding-required-for-close.sql', import.meta.url), 'utf8');
for (const needle of ['required_for_close boolean', 'and required_for_close', "step_type = 'release_letter' and due_date"]) {
  if (!sqlFile.includes(needle)) { fail++; console.log(`✗ המיגרציה חסרה: ${needle}`); }
}

console.log(fail === 0 ? `\nכל ${CASES.length} המקרים עוברים — המסך והשרת מסכימים.` : `\n${fail} כשלים.`);
process.exit(fail === 0 ? 0 : 1);

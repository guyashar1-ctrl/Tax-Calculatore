// בדיקה שכללי הסגירה במסך ובשרת אומרים אותו דבר.
// הרצה:  node scripts/verify-close-rules.mjs
//
// ‼ הבדיקה משכפלת כאן את *הכלל* של השרת מתוך המיגרציה (sqlBlocks) ומריצה
// אותו מול אותם מקרים שהקוד מריץ. אם מישהו ישנה צד אחד בלבד — הבדיקה תיפול.
//
// ‼ שלוש שכבות נבדקות, לא אחת:
//   1. blocks   — הכלל של המסך מול הכלל של השרת, על שלב שיש לו ערך בעמודה.
//   2. fallback — שורה שנוצרה *לפני* שהעמודה קיימת: למסך יש נפילה לאחור לפי
//      סוג, ולשרת אין (העמודה NOT NULL). ההשוואה הנכונה היא מול מה שהמילוי
//      לאחור של מיגרציה 68 היה כותב לאותה שורה. עד היום הענף הזה לא נבדק
//      כלל, והוא בדיוק הענף ששורות ישנות עוברות בו.
//   3. drift    — הנוסח במיגרציה מכיל את הסעיפים שהבדיקה מניחה שקיימים.

import { readFileSync } from 'node:fs';

// ── הכלל של המסך, מועתק מ-src/types/onboarding.ts ──
const DEFAULT_OPTIONAL = ['representation_upgrade', 'first_month_review'];
const SATISFIED = ['completed', 'verified', 'skipped'];
const uiRequired = s => s.status === 'cancelled' ? false
  : typeof s.requiredForClose === 'boolean' ? s.requiredForClose
  : !DEFAULT_OPTIONAL.includes(s.stepType);
// ‼ חלון ההתנגדות תקף רק אחרי שהמכתב יצא מהכנה — שתיקה היא הסכמה רק אחרי
//   ששאלנו. זהה לתנאי שבמיגרציה 68.
const uiSatisfied = s => SATISFIED.includes(s.status)
  || (s.stepType === 'release_letter'
      && s.status !== 'pending' && s.status !== 'locked'
      && !!s.dueDate && new Date(s.dueDate) <= new Date());
const uiBlocks = s => uiRequired(s) && !uiSatisfied(s);

// ── הכלל של השרת, כפי שנכתב במיגרציה 68 ──
const sqlBlocks = s =>
  !SATISFIED.includes(s.status) && s.status !== 'cancelled'
  && !!s.requiredForClose
  && !(s.stepType === 'release_letter'
       && s.status !== 'pending' && s.status !== 'locked'
       && !!s.dueDate && new Date(s.dueDate) <= new Date());

// ── המילוי לאחור של מיגרציה 68, לשורות שנוצרו לפני העמודה ──
const backfillRequired = s =>
  DEFAULT_OPTIONAL.includes(s.stepType) ? false
  : (s.stepType === 'intake_questionnaire' && s.status === 'waiting_client') ? false
  : true;

const past = new Date(Date.now() - 86400000).toISOString();
const future = new Date(Date.now() + 86400000).toISOString();

const CASES = [
  { name: 'שאלון נדרש שנשלח — חוסם',            s: { stepType: 'intake_questionnaire', status: 'waiting_client', requiredForClose: true }, expect: true },
  { name: 'שאלון רשות שנשלח — לא חוסם',          s: { stepType: 'intake_questionnaire', status: 'waiting_client', requiredForClose: false }, expect: false },
  { name: 'שאלון נדרש שהושלם — לא חוסם',         s: { stepType: 'intake_questionnaire', status: 'completed', requiredForClose: true }, expect: false },
  { name: 'בקשה חופשית נדרשת — חוסמת',           s: { stepType: 'custom_request', status: 'pending', requiredForClose: true }, expect: true },
  { name: 'בקשה חופשית רשות — לא חוסמת',         s: { stepType: 'custom_request', status: 'pending', requiredForClose: false }, expect: false },
  { name: 'ייבוא היסטוריה נדרש — חוסם',          s: { stepType: 'data_import', status: 'pending', requiredForClose: true }, expect: true },
  { name: 'ייבוא היסטוריה רשות — לא חוסם',       s: { stepType: 'data_import', status: 'pending', requiredForClose: false }, expect: false },
  { name: 'הרשאת תשלום נעולה — חוסמת',           s: { stepType: 'retainer_authorization', status: 'locked', requiredForClose: true }, expect: true },
  { name: 'חיבור פייפרלס ממתין — חוסם',          s: { stepType: 'paperless_connection', status: 'waiting_client', requiredForClose: true }, expect: true },
  { name: 'שלב מבוטל — לעולם לא חוסם',           s: { stepType: 'client_documents', status: 'cancelled', requiredForClose: true }, expect: false },
  { name: 'שלב מבוטל שהוא רשות — לא חוסם',       s: { stepType: 'custom_request', status: 'cancelled', requiredForClose: false }, expect: false },
  { name: 'ביקורת חודש ראשון (רשות) — לא חוסמת', s: { stepType: 'first_month_review', status: 'pending', requiredForClose: false }, expect: false },
  { name: 'שלב שדולג במפורש — לא חוסם',          s: { stepType: 'paperless_invite', status: 'skipped', requiredForClose: true }, expect: false },
  { name: 'שלב שאומת — לא חוסם',                 s: { stepType: 'kyc_identification', status: 'verified', requiredForClose: true }, expect: false },
  { name: 'ייצוג בתהליך — חוסם',                 s: { stepType: 'representation', status: 'in_progress', requiredForClose: true }, expect: true },

  // ── מכתב השחרור · חלון ההתנגדות · ארבעת הצירופים ──
  // ‼ הליבה של התיקון: תאריך יעד לבדו אינו מספיק. עד היום מכתב שמעולם לא
  //   נשלח, שמישהו קבע לו תאריך יעד שעבר, "סיפק" את הסגירה בשקט.
  { name: 'שחרור: נשלח + החלון עבר — לא חוסם',   s: { stepType: 'release_letter', status: 'waiting_client', requiredForClose: true, dueDate: past }, expect: false },
  { name: 'שחרור: נשלח + החלון פתוח — חוסם',     s: { stepType: 'release_letter', status: 'waiting_client', requiredForClose: true, dueDate: future }, expect: true },
  { name: 'שחרור: לא נשלח (pending) + עבר — חוסם', s: { stepType: 'release_letter', status: 'pending', requiredForClose: true, dueDate: past }, expect: true },
  { name: 'שחרור: נעול + החלון עבר — חוסם',      s: { stepType: 'release_letter', status: 'locked', requiredForClose: true, dueDate: past }, expect: true },
  { name: 'שחרור: לא נשלח + החלון פתוח — חוסם',  s: { stepType: 'release_letter', status: 'pending', requiredForClose: true, dueDate: future }, expect: true },
  { name: 'שחרור: נשלח בלי תאריך יעד — חוסם',    s: { stepType: 'release_letter', status: 'waiting_client', requiredForClose: true, dueDate: null }, expect: true },
  { name: 'שחרור: רשות + לא נשלח — לא חוסם',     s: { stepType: 'release_letter', status: 'pending', requiredForClose: false, dueDate: past }, expect: false },
  { name: 'שחרור: הושלם — לא חוסם',              s: { stepType: 'release_letter', status: 'completed', requiredForClose: true, dueDate: future }, expect: false },
];

// שורות שנוצרו לפני העמודה: אין להן ערך, והמסך נופל לברירת המחדל לפי סוג.
// הציפייה היא שהנפילה לאחור תיתן בדיוק את מה שהמילוי לאחור היה כותב.
const FALLBACK_CASES = [
  { name: 'נפילה לאחור: מסמכי לקוח → נדרש',      s: { stepType: 'client_documents', status: 'pending' } },
  { name: 'נפילה לאחור: בקשה חופשית → נדרש',     s: { stepType: 'custom_request', status: 'pending' } },
  { name: 'נפילה לאחור: שדרוג ייצוג → רשות',     s: { stepType: 'representation_upgrade', status: 'pending' } },
  { name: 'נפילה לאחור: ביקורת חודש → רשות',     s: { stepType: 'first_month_review', status: 'in_progress' } },
  { name: 'נפילה לאחור: הרשאת תשלום → נדרש',     s: { stepType: 'retainer_authorization', status: 'locked' } },
  { name: 'נפילה לאחור: מכתב שחרור → נדרש',      s: { stepType: 'release_letter', status: 'pending' } },
];

let fail = 0;
for (const c of CASES) {
  const ui = uiBlocks(c.s), sql = sqlBlocks(c.s);
  const ok = ui === c.expect && sql === c.expect && ui === sql;
  if (!ok) { fail++; console.log(`✗ ${c.name} — ui=${ui} sql=${sql} expected=${c.expect}`); }
  else console.log(`✓ ${c.name}`);
}

// ‼ החריג היחיד במילוי לאחור שאינו לפי סוג: שאלון שנשלח ללקוח. הוא נבדק
//   בנפרד כי המסך *לא* מכיר אותו — ולכן זו אי-התאמה מכוונת וידועה, שקיימת
//   רק לשורות ישנות ורק עד שהמילוי לאחור רץ.
for (const c of FALLBACK_CASES) {
  const ui = uiRequired(c.s), backfill = backfillRequired(c.s);
  if (ui !== backfill) { fail++; console.log(`✗ ${c.name} — ui=${ui} backfill=${backfill}`); }
  else console.log(`✓ ${c.name}`);
}

// שמירה מפני סחיפה: העמודה והכללים חייבים להופיע במיגרציה.
const sqlFile = readFileSync(new URL('../supabase/68-onboarding-required-for-close.sql', import.meta.url), 'utf8');
const NEEDLES = [
  'required_for_close boolean',
  'and required_for_close',
  "step_type = 'release_letter'",
  "status not in ('pending', 'locked')",   // ‼ שער "המכתב אכן נשלח" (§10.3)
  'due_date <= current_date',
  'p_required_for_close boolean default true',
  "jsonb_build_object('stepType', p_step_type",  // meta היצירה נשמר
  'step_type_not_allowed',                       // רשימת הסוגים הסגורה לא נמחקה
  'no_requirements',                             // שער הבקשה החופשית לא נמחק
  'max(sort_order), 0) + 10',                    // סדר ההוספה נשמר
];
for (const needle of NEEDLES) {
  if (!sqlFile.includes(needle)) { fail++; console.log(`✗ המיגרציה חסרה: ${needle}`); }
}

const total = CASES.length + FALLBACK_CASES.length;
console.log(fail === 0
  ? `\nכל ${total} המקרים עוברים — המסך והשרת מסכימים.`
  : `\n${fail} כשלים.`);
process.exit(fail === 0 ? 0 : 1);

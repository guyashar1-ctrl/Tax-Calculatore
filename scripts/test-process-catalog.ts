// test-process-catalog.ts — שומר הקבועים של קטלוג התהליכים (M2), בלי מסד.
// הרצה: node scripts/test-process-catalog.ts   (Node ≥ 22.6, בלי בנייה)
//
// מה נשמר כאן שלא יזוז בשקט:
//  1. כל שלב שמצביע על סוג בקשה — הסוג קיים (אין תיאור של שלב שנמחק).
//  2. כל סוג בקשה במערכת מוסבר איפשהו — או מוחרג במפורש (אין תהליך שנשכח).
//  3. כל סטטוס של בקשת הייצוג שייך לשלב אחד בדיוק בהגדרת הייצוג.
//  4. סיווג: בקשה בודדת = שלב אחד; רב-שלבי = לפחות שניים; תת-תהליך = אב קיים.
//  5. שלב מותנה/רשות אומר מתי הוא מופיע.
//  6. מפת הלקוח נגזרת מאותה רשימה: אותו סדר, ביטוח לאומי רק כשכלול, ואישור
//     המייצג ברשות המסים נאמר ללקוח.
//  7. ייצוג: השלבים העיקריים קיימים (מילוי, חתימה, הגשה, אישור הלקוח, פעיל)
//     והתנהגות M1 (שמירה, דחיית צילום) מתוארת.

import assert from 'node:assert/strict';
import { PROCESS_CATALOG, NOT_A_PROCESS, processByKey } from '../src/lib/processCatalog.ts';
import { REP_STAGES, customerProcessMap, repStageForStatus } from '../src/lib/representationJourney.ts';
import { STEP_TYPE_LABELS, PORTAL_STEP_TYPES } from '../src/types/onboarding.ts';
import { CATALOG_STEP_TYPES } from '../src/types/journeyDefaults.ts';
import { REPRESENTATION_STATUS_LABELS } from '../src/types/index.ts';
import type { ProcessStage } from '../src/lib/processDefinition.ts';

let n = 0;
const ok = (name: string, cond: boolean, detail = '') => {
  n += 1;
  if (!cond) { console.error(`✗ ${name}${detail ? ' — ' + detail : ''}`); process.exit(1); }
  console.log(`✓ ${name}`);
};

const allStages = (stages: ProcessStage[]): ProcessStage[] =>
  stages.flatMap(s => [s, ...allStages(s.substages ?? [])]);
const catalogStages = PROCESS_CATALOG.flatMap(p => allStages(p.stages));
const stepTypes = new Set(Object.keys(STEP_TYPE_LABELS));

// 1 — שלבים מצביעים על סוגים קיימים
for (const s of catalogStages) {
  if (s.stepType) ok(`סוג קיים: ${s.stepType} (${s.key})`, stepTypes.has(s.stepType), s.stepType);
}

// 2 — כל סוג מוסבר או מוחרג
const EXCLUDED_STEP_TYPES = new Set(['data_import', 'data_verification']);   // NOT_A_PROCESS: מסלול נתונים בפייפרלס
const covered = new Set(catalogStages.map(s => s.stepType).filter(Boolean));
for (const t of stepTypes) {
  ok(`סוג מוסבר או מוחרג: ${t}`, covered.has(t) || EXCLUDED_STEP_TYPES.has(t));
}
ok('ההחרגות מתועדות ב-NOT_A_PROCESS', NOT_A_PROCESS.some(x => x.what.includes('ייבוא היסטוריה')));
for (const t of PORTAL_STEP_TYPES) ok(`סוג שהלקוח רואה בדף האישי מוסבר: ${t}`, covered.has(t));
for (const t of CATALOG_STEP_TYPES) ok(`סוג מברירת המחדל של המשרד מוסבר: ${t}`, covered.has(t));

// 3 — סטטוס ⇒ שלב אחד בדיוק
for (const st of Object.keys(REPRESENTATION_STATUS_LABELS) as (keyof typeof REPRESENTATION_STATUS_LABELS)[]) {
  const holders = REP_STAGES.filter(s => s.statuses?.includes(st));
  ok(`סטטוס ${st} שייך לשלב אחד בדיוק`, holders.length === 1, holders.map(h => h.key).join(','));
  ok(`repStageForStatus(${st}) עובד`, repStageForStatus(st).key === holders[0]?.key);
}

// 4 — סיווג
for (const p of PROCESS_CATALOG) {
  if (p.classification === 'single_step') ok(`בקשה בודדת עם שלב אחד: ${p.key}`, p.stages.length === 1 && !p.stages[0].substages);
  if (p.classification === 'multi_stage') ok(`רב-שלבי עם ≥2 שלבים: ${p.key}`, p.stages.length >= 2);
  if (p.classification === 'sub_process') ok(`תת-תהליך עם אב קיים: ${p.key}`, !!p.parentKey && !!processByKey(p.parentKey));
  ok(`לתהליך יש מתחיל, סיום ומקור: ${p.key}`, !!p.trigger && !!p.completion && !!p.source);
  ok(`מפתח ייחודי: ${p.key}`, PROCESS_CATALOG.filter(x => x.key === p.key).length === 1);
}

// 5 — מותנה/רשות אומר מתי
for (const s of catalogStages) {
  if (s.kind === 'conditional' || s.kind === 'optional') ok(`שלב ${s.kind} אומר מתי: ${s.key}`, !!s.when && s.when.length > 10);
}

// 6 — מפת הלקוח
const officeOrder = REP_STAGES.map(s => s.key);
const withNi = customerProcessMap({ niIncluded: true });
const withoutNi = customerProcessMap({ niIncluded: false });
ok('מפת הלקוח בלי ב"ל: 4 אבני-דרך', withoutNi.length === 4, String(withoutNi.length));
ok('מפת הלקוח עם ב"ל: 5 אבני-דרך', withNi.length === 5, String(withNi.length));
const titlesOrder = withNi.map(m => REP_STAGES.find(s => s.customer?.title === m.title)!.key);
const idx = titlesOrder.map(k => officeOrder.indexOf(k));
ok('מפת הלקוח שומרת על סדר המשרד', idx.every((v, i) => i === 0 || v > idx[i - 1]), idx.join(','));
ok('הלקוח שומע על אישור המייצג באזור האישי', withNi.some(m => m.text.includes('האזור האישי')));
ok('הלקוח שומע שהפרטים נשמרים ושצילום אפשר אחר כך', withoutNi[0].text.includes('נשמר') && withoutNi[0].text.includes('מאוחר יותר'));

// 7 — ייצוג: שלבים עיקריים ו-M1
const rep = processByKey('representation')!;
const keys = rep.stages.map(s => s.key);
for (const k of ['open', 'fill', 'prepare', 'sign', 'stamp', 'submit', 'client_approval', 'active']) ok(`שלב ייצוג קיים: ${k}`, keys.includes(k));
ok('סדר: מילוי לפני חתימה לפני הגשה לפני פעיל',
  keys.indexOf('fill') < keys.indexOf('sign') && keys.indexOf('sign') < keys.indexOf('submit') && keys.indexOf('submit') < keys.indexOf('active'));
const fill = rep.stages.find(s => s.key === 'fill')!;
ok('M1: שמירה במעבר שלב מתוארת', fill.what.includes('נשמר'));
ok('M1: דחיית צילום מתוארת', !!fill.deferrable && fill.deferrable.includes('מאוחר יותר'));
ok('M1: בן/בת זוג מתואר/ת', !!fill.substages?.some(s => s.key === 'fill_spouse'));
const approval = rep.stages.find(s => s.key === 'client_approval')!;
ok('אישור המייצג ברשות המסים: של הלקוח, רשות, מקושר ל-rep_client_approval',
  approval.actor === 'client' && approval.kind === 'optional' && approval.stepType === 'rep_client_approval');
const ni = rep.stages.find(s => s.key === 'ni')!;
ok('ביטוח לאומי: מותנה ומקביל', ni.kind === 'conditional' && ni.parallel === true);
const sign = rep.stages.find(s => s.key === 'sign')!;
ok('M1: השער הרך לפני שליחה לחתימה מתואר', !!sign.blocks && sign.blocks.includes('צילום תעודה'));

// פייפרלס: ארבעת השלבים בסדר, שניים מותנים
const pl = processByKey('paperless')!;
ok('פייפרלס: ארבעה שלבים בסדר הנכון',
  pl.stages.map(s => s.stepType).join(',') === 'paperless_invite,paperless_connection,paperless_tax_authority,retainer_authorization');
ok('פייפרלס: חיבור לרשות המסים והרשאת תשלום מותנים',
  pl.stages[2].kind === 'conditional' && pl.stages[3].kind === 'conditional');
ok('פייפרלס: התנאי של רשות המסים מזכיר מורשה/חברה ואת המקורות',
  !!pl.stages[2].when && ['עוסק מורשה', 'חברה', 'סיווג מע״מ'].every(t => pl.stages[2].when!.includes(t)));

console.log(`\n${n} passed`);

// בדיקת סדר ההחלה של 229 (סעיף 12) מול 239 של master, בבידוד: PGlite.
//   PGLITE_DIR=<tmp> node scripts/sql/229/test-229-order.pglite.mjs
// ‼ 12.10.2026: 239 (בייצור) הכניס שורה בין רשימת הסוגים לתנאי של פרטי העסק ב-_client_announceable_steps,
//   והעוגן הצמוד הקודם של 229 לא נמצא — 229 הייתה נכשלת בייצור. כאן: אותה הזרקה עובדת על הגוף שבייצור (אחרי 239)
//   ועל הגוף שלפניו; החלה חוזרת לא מכפילה; ההתאוששות מחזירה בדיוק; ו-239 שמוחלת אחרי 229 עדיין מוצאת את העוגנים שלה.
import { readFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { join, resolve } from 'node:path';
const { PGlite } = await import(pathToFileURL(join(process.env.PGLITE_DIR ?? '.', 'node_modules/@electric-sql/pglite/dist/index.js')).href);
const WT = resolve(fileURLToPath(import.meta.url), '../../../..') + '/';
const read = (f) => readFileSync(WT + f, 'utf8').replace(/\r\n/g, '\n');
const s229 = read('supabase/229-tax-year-collection.sql');
const patch12 = s229.slice(s229.indexOf('do $patch12$'), s229.indexOf('$patch12$;') + '$patch12$;'.length);
const rb = read('scripts/sql/229/rollback-229-staging.sql');
const undo12 = rb.slice(rb.indexOf('do $undo12$'), rb.indexOf('$undo12$;') + '$undo12$;'.length);
const prodWith239 = read('scripts/sql/229/fixtures/client-announce-prod-2026-10-12.sql');
// הגוף שלפני 239: בלי שלוש התוספות שלה
const pre239 = prodWith239
  .replace("                         -- 239 · ייפוי הכוח — רק כשהלקוח צריך לחתום עליו עכשיו\n                         'representation',\n", '')
  .replace("     and (s.step_type <> 'representation' or public._rep_signing_open(s.client_id))\n", '')
  .replace("\n           -- 239 · החתימה על ייפוי הכוח — אותו מפתח שהדף נותן לפריט (_portal_rep_item)\n           when 'representation' then 'rep_sign'", '');

const db = new PGlite();
let pass = 0, fail = 0;
const ok = (c, m, info = '') => { c ? pass++ : fail++; console.log(`${c ? '  ✓' : '  ✗'} ${m}${!c && info ? ` — ${info}` : ''}`); };
const one = async (s) => (await db.query(s)).rows[0];
const defs = async () => ({
  a: (await one(`select pg_get_functiondef('public._client_announceable_steps(text)'::regprocedure) d`)).d,
  k: (await one(`select pg_get_functiondef('public._client_step_portal_key(text, text)'::regprocedure) d`)).d,
});
const n = (hay, needle) => hay.split(needle).length - 1;
await db.exec(`set check_function_bodies = off;`);

for (const [label, body] of [['הגוף בייצור (אחרי 239)', prodWith239], ['הגוף שלפני 239', pre239]]) {
  await db.exec(body);
  const before = await defs();
  await db.exec(patch12);
  const after = await defs();
  ok(n(after.a, "'info_collection')") === 1 && n(after.a, "and (s.step_type <> 'info_collection' or coalesce(s.ball, 'client') = 'client')") === 1,
    `${label}: «השלמת מידע» נוספה לרשימה ולתנאי «אצל הלקוח» — פעם אחת`);
  ok(n(after.k, "when 'info_collection' then 'taxinfo_' || p_step_id") === 1, `${label}: מפתח הדף נוסף`);
  if (body === prodWith239) ok(after.a.includes('_rep_signing_open') && after.k.includes("'rep_sign'"), `${label}: התוספות של 239 נשמרו`);
  await db.exec(patch12);
  const again = await defs();
  ok(again.a === after.a && again.k === after.k, `${label}: החלה חוזרת — אין שינוי`);
  await db.exec(undo12);
  const undone = await defs();
  ok(undone.a === before.a && undone.k === before.k, `${label}: ההתאוששות מחזירה בדיוק את הגוף שלפני`);
}

// 229 קודם ואז 239 (הסדר ב-staging): העוגנים של 239 עדיין פעם אחת בדיוק
await db.exec(pre239);
await db.exec(patch12);
const mid = await defs();
ok(n(mid.a, "'paperless_invite', 'prev_accountant_details', 'rep_client_approval',") === 1
  && n(mid.a, "and (s.step_type <> 'business_details' or coalesce(s.ball, 'client') = 'client')") === 1
  && n(mid.k, "when 'rep_client_approval' then 'rep_approval'") === 1, '229 ואחריה 239: כל עוגני 239 נמצאים פעם אחת');

console.log(`\n${pass} עברו, ${fail} נכשלו`);
process.exit(fail ? 1 : 0);

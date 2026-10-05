#!/usr/bin/env node
/**
 * verify-221-body.mjs — גוף build_client_portal ב-221 הוא גוף 220 תו-בתו + שלוש שורות בלבד.
 *
 * ‼ למה סקריפט ולא עין: הפונקציה היא ~750 שורות שמחליפות את הגוף החי כולו. עותק ידני שהחמיץ שורה אחת
 *   (או הדביק גוף ישן) היה מחזיר לדף האישי באגים שכבר תוקנו — בלי שום שגיאה. הסקריפט מוצא את הגוף בשני
 *   הקבצים, מנרמל CRLF→LF, ומוודא שההבדל היחיד הוא שתי שורות ההערה ושורת ה-photoGuide, במקום אחד.
 *
 *   שימוש:
 *     node scripts/verify-221-body.mjs                        קובץ מול קובץ (220 ↔ 221)
 *     node scripts/verify-221-body.mjs --live staging         הגוף החי ב-staging == הגוף ב-221
 *     node scripts/verify-221-body.mjs --live prod --against 220   סטייה: הגוף החי בייצור == 220 (לפני ההחלה)
 *     node scripts/verify-221-body.mjs --live prod            אחרי ההחלה בייצור: הגוף החי == 221
 *   ‼ ייצור — קריאה בלבד (readProd). יציאה 0 = תקין, 1 = סטייה (ומודפס איפה).
 */
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// ‼ בלי לייבא את staging-lib למעלה: הוא דורש טוקן ב-.env.local, והבדיקה קובץ-מול-קובץ לא צריכה אותו.
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const FN = 'build_client_portal';
const SIG = 'public.build_client_portal(text,text)';

/** השורות שנוספו ב-221 — מילה במילה, כולל הכניסה. */
const ADDED = [
  `          -- ‼ 221 · מדריך מצולם — המפתח בלבד. התמונות, הצעדים והקישור לאתר קבועים בקוד`,
  `          -- (src/components/portal/photoGuides.ts); מפתח לא מוכר ⇒ הדף פשוט לא מציג מדריך.`,
  `          'photoGuide', nullif(s.payload->>'clientPhotoGuide',''),`,
];

const norm = (s) => s.replace(/\r\n/g, '\n');

/** הגוף (prosrc) של ההגדרה היחידה של build_client_portal בקובץ: בין AS $function$ ל-$function$. */
export function bodyOf(fileText) {
  const text = norm(fileText);
  const re = /create\s+or\s+replace\s+function\s+public\.build_client_portal\s*\(/gi;
  const heads = [...text.matchAll(re)];
  if (heads.length !== 1) throw new Error(`נמצאו ${heads.length} הגדרות של ${FN} (מצופה: 1)`);
  const mark = 'AS $function$';
  const at = text.indexOf(mark, heads[0].index);
  if (at < 0) throw new Error('AS $function$ לא נמצא');
  const open = at + mark.length;
  const close = text.indexOf('$function$', open);
  if (close < 0) throw new Error('סוף הפונקציה לא נמצא');
  return text.slice(open, close);
}

function firstDiff(a, b) {
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) if (a[i] !== b[i]) return i;
  return a.length === b.length ? -1 : n;
}

/** 221 = 220 + ADDED במקום אחד. מחזיר רשימת בעיות (ריק = תקין). */
export function checkAddedOnly(body220, body221) {
  const a = body220.split('\n');
  const b = body221.split('\n');
  const problems = [];
  if (b.length !== a.length + ADDED.length) problems.push(`מספר שורות: 220=${a.length}, 221=${b.length} (מצופה ${a.length + ADDED.length})`);
  const i = firstDiff(a, b);
  if (i < 0) return ['אין הבדל בין 220 ל-221'];
  const got = b.slice(i, i + ADDED.length);
  if (got.join('\n') !== ADDED.join('\n')) problems.push(`השורות החדשות (ממקום ${i + 1}) שונות מהמצופה:\n  ${got.join('\n  ')}`);
  const restA = a.slice(i), restB = b.slice(i + ADDED.length);
  if (restA.join('\n') !== restB.join('\n')) {
    const j = firstDiff(restA, restB);
    problems.push(`אחרי השורות החדשות הגוף שונה מ-220 (שורה ${i + 1 + j} ב-220): «${restA[j] ?? '∅'}» ↔ «${restB[j] ?? '∅'}»`);
  }
  return problems;
}

/** הגוף החי. staging — כתיבה/קריאה דרך staging-lib; ייצור — readProd בלבד. */
async function liveBody(target) {
  const lib = await import('./staging-lib.mjs');
  const q = `select prosrc from pg_proc where oid = '${SIG}'::regprocedure`;
  const rows = target === 'prod' ? await lib.readProd(q) : await lib.writeStaging(q);
  const src = rows?.[0]?.prosrc;
  if (typeof src !== 'string') throw new Error(`prosrc של ${FN} לא נמצא ב-${target}`);
  return norm(src);
}

const argv = process.argv.slice(2);
const opt = (n) => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : null; };
const read = (f) => readFileSync(resolve(ROOT, f), 'utf8');
const f220 = 'supabase/220-business-details-home-office.sql';
const f221 = 'supabase/221-reserve-duty-claim.sql';

let failed = 0;
const report = (ok, text) => { console.log(`${ok ? '✓' : '✗'} ${text}`); if (!ok) failed++; };

const b220 = bodyOf(read(f220));
const b221 = bodyOf(read(f221));

const live = opt('--live');
if (!live) {
  const problems = checkAddedOnly(b220, b221);
  report(problems.length === 0, `221 = 220 + ${ADDED.length} שורות בלבד (${b220.split('\n').length} → ${b221.split('\n').length} שורות)`);
  for (const p of problems) console.log('   ' + p);
} else {
  if (!['staging', 'prod'].includes(live)) { console.error('✋ --live staging | prod'); process.exit(1); }
  const against = opt('--against') ?? '221';
  if (!['220', '221'].includes(against)) { console.error('✋ --against 220 | 221'); process.exit(1); }
  const expected = against === '220' ? b220 : b221;
  const got = await liveBody(live);
  const i = firstDiff(expected, got);
  report(i < 0, `הגוף החי ב-${live} == ${against} (${got.length} תווים)`);
  if (i >= 0) {
    const line = expected.slice(0, i).split('\n').length;
    console.log(`   סטייה בשורה ${line}: «${expected.split('\n')[line - 1] ?? '∅'}» ↔ «${got.split('\n')[line - 1] ?? '∅'}»`);
    console.log(`   אורך: צפוי ${expected.length}, חי ${got.length}`);
  }
}
process.exitCode = failed ? 1 : 0;

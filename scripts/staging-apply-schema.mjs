#!/usr/bin/env node
/**
 * staging-apply-schema.mjs — מחיל את מבנה המסד של הפרודקשן על סביבת הבדיקות.
 *
 * הקלט: supabase/staging/schema-from-prod.sql (נוצר ע"י staging-schema-extract).
 * ‼ כותב אך ורק לסביבת הבדיקות — ראה שער הבטיחות ב-staging-lib.mjs.
 *
 * פונקציות SQL נבדקות בזמן היצירה ולכן עלולות לדרוש פונקציה שטרם נוצרה.
 * לכן ההרצה עוברת בסבבים: מה שנכשל נאסף ומנוסה שוב, עד שסבב שלם אינו מוסיף
 * הצלחה. מה שנשאר — מודפס במלואו ונחשב כישלון.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { ROOT, STAGING_REF, writeStaging, splitStatements } from './staging-lib.mjs';

const file = resolve(ROOT, process.argv[2] || 'supabase/staging/schema-from-prod.sql');
const statements = splitStatements(readFileSync(file, 'utf8'));
console.log(`יעד: ${STAGING_REF}  ·  ${statements.length} הוראות מתוך ${file}`);

let pending = statements.map((s, i) => ({ i, s }));
let round = 0;
const done = new Set();

while (pending.length && round < 6) {
  round += 1;
  const failed = [];
  for (const item of pending) {
    try {
      await writeStaging(item.s);
      done.add(item.i);
    } catch (e) {
      failed.push({ ...item, err: String(e.message || e) });
    }
  }
  console.log(`סבב ${round}: הצליחו ${pending.length - failed.length} · נכשלו ${failed.length}`);
  if (failed.length === pending.length) { pending = failed; break; }   // אין התקדמות
  pending = failed;
}

if (pending.length) {
  console.log(`\n✋ ${pending.length} הוראות לא עברו:\n`);
  for (const f of pending.slice(0, 40)) {
    console.log(`--- הוראה #${f.i}\n${f.s.slice(0, 300)}\n    ⤷ ${f.err.slice(0, 300)}\n`);
  }
  process.exit(1);
}
console.log(`\n✓ כל ${statements.length} ההוראות הוחלו על ${STAGING_REF}.`);

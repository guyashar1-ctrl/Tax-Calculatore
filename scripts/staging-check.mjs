#!/usr/bin/env node
/**
 * staging-check.mjs — "לאיזה מסד אני מחובר?"
 *
 * ‼ דרישה 6 של האישור: לפני כל בדיקה מוודאים במפורש שהאפליקציה מחוברת
 * לסביבת הבדיקות ולא לפרודקשן. בדיקה שרצה בטעות על הפרודקשן היא בדיוק
 * מה שהסביבה הזאת קיימת כדי למנוע, ולכן זה ריצה בפקודה ולא בזיכרון.
 */
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { ROOT, PROD_REF, STAGING_REF } from './staging-lib.mjs';

const refOf = (url) => { try { return new URL(url).hostname.split('.')[0]; } catch { return null; } };
const label = (ref) => ref === PROD_REF ? 'פרודקשן ‼' : ref === STAGING_REF ? 'סביבת בדיקות ✓' : 'לא מוכר';

let bad = 0;
for (const file of ['.env.local', '.env.production', '.env.staging']) {
  const path = resolve(ROOT, file);
  if (!existsSync(path)) { console.log(`· ${file.padEnd(16)} — לא קיים`); continue; }
  const m = readFileSync(path, 'utf8').match(/^VITE_SUPABASE_URL=(.*)$/m);
  const ref = m ? refOf(m[1].trim()) : null;
  console.log(`· ${file.padEnd(16)} → ${String(ref).padEnd(22)} ${label(ref)}`);
  // הקובץ שהבדיקות רצות מולו חייב להצביע לסביבת הבדיקות. כל ערך אחר — עצירה.
  if (file === '.env.staging' && ref !== STAGING_REF) { bad += 1; }
}

if (bad) { console.log('\n✗ .env.staging אינו מצביע לסביבת הבדיקות. אין להריץ בדיקות.'); process.exit(1); }
console.log(`\n✓ בדיקות ירוצו מול ${STAGING_REF}. הפרודקשן (${PROD_REF}) אינו מעורב.`);

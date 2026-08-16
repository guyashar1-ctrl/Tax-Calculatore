#!/usr/bin/env node
/**
 * staging-apply-migration.mjs — מחיל קובץ מיגרציה על סביבת הבדיקות, כפי שהוא.
 *
 * ‼ אותה סמנטיקה בדיוק כמו prod-apply-migration.mjs: הקובץ נשלח כמחרוזת אחת,
 *   בלי פיצול ובלי עריכה — כדי שמה שנבדק ב-staging יהיה בייט-בבייט מה שיוחל
 *   אחר כך על הפרודקשן. שער הבטיחות של staging-lib חוסם כתיבה לפרודקשן.
 *
 *   שימוש:  node scripts/staging-apply-migration.mjs supabase/106-....sql
 */
import { readFileSync } from 'node:fs';
import { resolve, basename } from 'node:path';
import { ROOT, STAGING_REF, writeStaging } from './staging-lib.mjs';

const file = process.argv[2];
if (!file) { console.error('✋ יש למסור נתיב לקובץ מיגרציה'); process.exit(1); }

const path = resolve(ROOT, file);
const sqlText = readFileSync(path, 'utf8');
console.log(`יעד: ${STAGING_REF}  ·  ${basename(path)}  ·  ${sqlText.length} תווים`);

try {
  const out = await writeStaging(sqlText);
  console.log('✓ הוחל בהצלחה');
  if (Array.isArray(out) && out.length) console.log(JSON.stringify(out, null, 2).slice(0, 2000));
} catch (e) {
  console.error('✗ נכשל:', e.message);
  process.exit(1);
}

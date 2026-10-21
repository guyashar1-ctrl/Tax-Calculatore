#!/usr/bin/env node
/**
 * who-depends.mjs — «מי תלוי במה שאני עומד/ת לשנות?» לפני הסרה/שינוי של כלל, שער או ברירת מחדל.
 *
 * ‼ למה (21.10.2026): ב-269 הוסר שער במסך («מי רשום» לפני ההזנה בשע״ם). כלל בקובץ אחר (218 —
 *   מקומות החתימה) נשען עליו בשקט, והטעות הגיעה לטופס של לקוחה אמיתית. החיפוש הזה מוצא את
 *   הצרכנים בשלושה מקומות שבהם הם חיים: הקוד (src/worker/functions/scripts), קבצי ה-SQL, וגוף
 *   הפונקציות **החי בייצור** (pg_get_functiondef — שם יש טלאים שלא נמצאים בקובץ אחד).
 *   וגם: האם יש לכלל רשומה ב-docs/INVARIANTS.md.
 * ‼ קריאה בלבד. הפלט מודבק להצעה/לקומיט (WORKING-AGREEMENT §4א, «כלל קיים שמשתנה»).
 *
 *   שימוש:  node scripts/who-depends.mjs <מונח> [מונח ...] [--no-live]
 *   למשל:   node scripts/who-depends.mjs registered_spouse_verified registeredOwnerOf "בן זוג רשום"
 */
import { execFileSync } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { ROOT, readProd } from './staging-lib.mjs';

const args = process.argv.slice(2);
const noLive = args.includes('--no-live');
const terms = args.filter(a => !a.startsWith('--'));
if (terms.length === 0) {
  console.error('שימוש: node scripts/who-depends.mjs <מונח> [מונח ...] [--no-live]');
  process.exit(2);
}

const CODE_PATHS = ['src', 'worker/src', 'supabase/functions', 'scripts'];
const grep = (term, paths) => {
  try {
    return execFileSync('git', ['-C', ROOT, 'grep', '-n', '-I', '-F', '-e', term, '--', ...paths], { encoding: 'utf8', maxBuffer: 64 << 20 })
      .split('\n').filter(Boolean);
  } catch { return []; }   // git grep יוצא 1 כשאין התאמה
};
const short = (line) => line.length > 180 ? line.slice(0, 180) + '…' : line;

for (const term of terms) {
  console.log(`\n══ «${term}» ══════════════════════════════════════════`);

  // ① הכללים הרשומים
  const invPath = resolve(ROOT, 'docs/INVARIANTS.md');
  if (existsSync(invPath)) {
    const inv = readFileSync(invPath, 'utf8').split(/\r?\n/);
    const hits = inv.map((l, i) => [i, l]).filter(([, l]) => l.includes(term));
    console.log(`\n① כללים ב-docs/INVARIANTS.md: ${hits.length ? '' : 'אין — אם זה כלל שחוצה קבצים, להוסיף רשומה'}`);
    for (const [i] of hits) {
      // מזהה הכלל: הכותרת הקרובה מעליו
      let h = i; while (h > 0 && !/^### /.test(inv[h])) h--;
      console.log(`   ${inv[h].replace(/^### /, '')}`);
    }
  }

  // ② קוד
  const codeHits = grep(term, CODE_PATHS).filter(l => !l.includes('__tests__') && !l.startsWith('scripts/who-depends'));
  const testHits = grep(term, ['src']).filter(l => l.includes('__tests__'));
  const byFile = new Map();
  for (const l of codeHits) { const f = l.split(':')[0]; byFile.set(f, [...(byFile.get(f) ?? []), l]); }
  console.log(`\n② קוד — ${byFile.size} קבצים:`);
  for (const [f, ls] of byFile) {
    console.log(`   ${f} (${ls.length})`);
    for (const l of ls.slice(0, 3)) console.log(`      ${short(l.slice(f.length + 1))}`);
  }
  console.log(`   בדיקות יחידה שמזכירות: ${new Set(testHits.map(l => l.split(':')[0])).size}`);

  // ③ קבצי SQL — הגרסה האחרונה בכל קובץ שמגדיר
  const sqlHits = grep(term, ['supabase/*.sql']);
  const sqlFiles = [...new Set(sqlHits.map(l => l.split(':')[0]))];
  console.log(`\n③ קבצי SQL — ${sqlFiles.length}: ${sqlFiles.slice(-12).join(', ')}${sqlFiles.length > 12 ? ' …' : ''}`);

  // ④ גוף הפונקציות החי בייצור
  if (!noLive) {
    try {
      const rows = await readProd(`
        select p.oid::regprocedure::text as fn
          from pg_proc p join pg_namespace n on n.oid = p.pronamespace
         where n.nspname = 'public' and p.prokind in ('f', 'p')
           and position(${`'${term.replace(/'/g, "''")}'`} in pg_get_functiondef(p.oid)) > 0
         order by 1`);
      const trig = await readProd(`
        select c.relname || '.' || t.tgname as trg, p.proname as fn
          from pg_trigger t join pg_class c on c.oid = t.tgrelid join pg_proc p on p.oid = t.tgfoid
          join pg_namespace n on n.oid = p.pronamespace
         where not t.tgisinternal and n.nspname = 'public'
           and position(${`'${term.replace(/'/g, "''")}'`} in pg_get_functiondef(p.oid)) > 0`);
      console.log(`\n④ פונקציות חיות בייצור — ${rows.length}:`);
      for (const r of rows) console.log(`   ${r.fn}`);
      if (trig.length) {
        console.log('   מופעלות מטריגר:');
        for (const t of trig) console.log(`   ${t.trg} → ${t.fn}`);
      }
    } catch (e) {
      console.log(`\n④ פונקציות חיות בייצור — לא נקרא (${String(e.message).slice(0, 120)})`);
    }
  }
}
console.log('\n‼ לעבור על כל צרכן: האם הוא מניח את מה שמשתנה? לכתוב בהצעה «כלל קיים שמשתנה · מי תלוי · איך הוכח».');

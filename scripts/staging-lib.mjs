/**
 * staging-lib.mjs — הבסיס המשותף לכל הסקריפטים של סביבת הבדיקות.
 *
 * ‼ שער הבטיחות: מזהה הפרודקשן כתוב כאן במפורש ונדחה בכל קריאה. כל סקריפט
 * בסביבת הבדיקות עובר דרך הקובץ הזה, ולכן אין מסלול שבו טעות הקלדה או משתנה
 * סביבה שנשכח יפנו כתיבה למסד האמיתי. זו הדרישה הראשונה של גיא ולא נוחות.
 */
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/** ‼ הפרודקשן. אסור לכתיבה מכל סקריפט בתיקייה הזאת. */
export const PROD_REF = 'uoweoqtuiettozagwgdw';
/** סביבת הבדיקות הקבועה. נוצרה 2026-08-07. */
export const STAGING_REF = 'evdfxjqrkgugssfrdoxd';

export function loadEnv(file = '.env.local') {
  const env = {};
  for (const line of readFileSync(resolve(ROOT, file), 'utf8').split(/\r?\n/)) {
    const m = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (m) env[m[1]] = m[2].trim();
  }
  return env;
}

const TOKEN = loadEnv().SUPABASE_ACCESS_TOKEN;
if (!TOKEN) { console.error('✋ SUPABASE_ACCESS_TOKEN חסר ב-.env.local'); process.exit(1); }

/**
 * הרצת SQL על פרויקט. `allowProd` חייב להיאמר במפורש, והוא נכון רק לקריאה.
 * ברירת המחדל: כל פנייה לפרודקשן נעצרת כאן.
 */
export async function sql(ref, query, { allowProd = false } = {}) {
  if (ref === PROD_REF && !allowProd) {
    console.error('✋ עצירה: הסקריפט ניסה לפנות לפרודקשן. אסור.');
    process.exit(1);
  }
  const r = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query }),
  });
  const text = await r.text();
  if (!r.ok) { const e = new Error(text.slice(0, 600)); e.http = r.status; throw e; }
  return text ? JSON.parse(text) : null;
}

/** קריאה בלבד מהפרודקשן — הדרך היחידה המותרת לגעת בו. */
export const readProd = (query) => sql(PROD_REF, query, { allowProd: true });
/** כתיבה לסביבת הבדיקות. */
export const writeStaging = (query) => sql(STAGING_REF, query);

/**
 * ‼ שער חובה לפני כל בדיקה. סקריפט טעינה שמנטרל טריגרים ונופל באמצע משאיר
 * אותם מנוטרלים — והמסד ממשיך להיראות תקין בזמן שהוא כבר לא מתנהג כמו
 * הפרודקשן. זה קרה בפועל: שלב מחזור־החיים נשאר "פעיל" במקום "בקליטה", ורק
 * ההשוואה גילתה. מאז — בודקים, ולא מניחים.
 */
export async function assertTriggersEnabled() {
  const r = await sql(STAGING_REF, `
    select coalesce(string_agg(distinct c.relname, ', '), '') as t
      from pg_trigger tg
      join pg_class c on c.oid = tg.tgrelid
      join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public' and not tg.tgisinternal and tg.tgenabled = 'D'`);
  if (r[0].t) {
    console.error(`✋ יש טריגרים מנוטרלים ב-staging (${r[0].t}). הרץ enable trigger user לפני שממשיכים.`);
    process.exit(1);
  }
}

export async function api(path, init = {}) {
  const r = await fetch(`https://api.supabase.com/v1${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json', ...(init.headers || {}) },
  });
  const text = await r.text();
  if (!r.ok) throw new Error(`${path} → ${r.status} ${text.slice(0, 400)}`);
  return text ? JSON.parse(text) : null;
}

/**
 * פיצול קובץ SQL להוראות. חייב להכיר ציטוט־דולר ($function$ … $function$),
 * אחרת כל נקודה־פסיק בתוך גוף פונקציה הייתה חותכת אותה באמצע.
 */
export function splitStatements(text) {
  const out = [];
  let buf = '';
  let i = 0;
  while (i < text.length) {
    const ch = text[i];
    // הערת שורה
    if (ch === '-' && text[i + 1] === '-') {
      const nl = text.indexOf('\n', i);
      const end = nl === -1 ? text.length : nl;
      buf += text.slice(i, end); i = end;
      continue;
    }
    // הערת בלוק
    if (ch === '/' && text[i + 1] === '*') {
      const end = text.indexOf('*/', i + 2);
      const stop = end === -1 ? text.length : end + 2;
      buf += text.slice(i, stop); i = stop;
      continue;
    }
    // מחרוזת רגילה
    if (ch === "'") {
      let j = i + 1;
      while (j < text.length) {
        if (text[j] === "'" && text[j + 1] === "'") { j += 2; continue; }
        if (text[j] === "'") { j += 1; break; }
        j += 1;
      }
      buf += text.slice(i, j); i = j;
      continue;
    }
    // מזהה במרכאות כפולות
    if (ch === '"') {
      let j = i + 1;
      while (j < text.length && text[j] !== '"') j += 1;
      j += 1;
      buf += text.slice(i, j); i = j;
      continue;
    }
    // ציטוט־דולר
    if (ch === '$') {
      const m = /^\$[A-Za-z_][A-Za-z0-9_]*\$|^\$\$/.exec(text.slice(i));
      if (m) {
        const tag = m[0];
        const end = text.indexOf(tag, i + tag.length);
        const stop = end === -1 ? text.length : end + tag.length;
        buf += text.slice(i, stop); i = stop;
        continue;
      }
    }
    if (ch === ';') { const s = buf.trim(); if (s) out.push(s); buf = ''; i += 1; continue; }
    buf += ch; i += 1;
  }
  const last = buf.trim();
  if (last) out.push(last);
  // הוראה שכולה הערות אינה הוראה.
  return out.filter((s) => s.split('\n').some((l) => l.trim() && !l.trim().startsWith('--')));
}

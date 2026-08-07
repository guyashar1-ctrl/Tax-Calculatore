#!/usr/bin/env node
/**
 * staging-verify-schema.mjs — משווה את מבנה סביבת הבדיקות למבנה הפרודקשן.
 *
 * למה זה קיים: המבנה ב-staging לא הועתק בכלי רשמי אלא נבנה מחדש מקריאת
 * המבנה של הפרודקשן. לכן אסור להאמין לו — משווים אובייקט מול אובייקט
 * ומדפיסים הפרש. בלי ההשוואה הזאת "המבנה זהה" היה הנחה.
 *
 * קריאה בלבד משתי הסביבות.
 */
import { PROD_REF, STAGING_REF, readProd, sql } from './staging-lib.mjs';

const readStaging = (q) => sql(STAGING_REF, q);

/** כל שאילתה מחזירה קבוצת מחרוזות שאפשר להשוות ישירות. */
const PROBES = {
  'טבלאות': `select c.relname as v from pg_class c join pg_namespace n on n.oid=c.relnamespace
             where n.nspname='public' and c.relkind='r' order by 1`,
  'עמודות': `select c.relname||'.'||a.attname||' '||format_type(a.atttypid,a.atttypmod)
               ||case when a.attnotnull then ' NOT NULL' else '' end
               ||coalesce(' DEFAULT '||pg_get_expr(d.adbin,d.adrelid),'') as v
             from pg_class c join pg_namespace n on n.oid=c.relnamespace
             join pg_attribute a on a.attrelid=c.oid and a.attnum>0 and not a.attisdropped
             left join pg_attrdef d on d.adrelid=c.oid and d.adnum=a.attnum
             where n.nspname='public' and c.relkind='r' order by 1`,
  'אילוצים': `select c.relname||' '||con.conname||' '||pg_get_constraintdef(con.oid) as v
              from pg_constraint con join pg_class c on c.oid=con.conrelid
              join pg_namespace n on n.oid=c.relnamespace
              where n.nspname='public' order by 1`,
  'אינדקסים': `select indexdef as v from pg_indexes where schemaname='public' order by 1`,
  'פונקציות': `select p.proname||'('||pg_get_function_identity_arguments(p.oid)||') '
                 ||md5(pg_get_functiondef(p.oid)) as v
               from pg_proc p join pg_namespace n on n.oid=p.pronamespace
               where n.nspname='public' order by 1`,
  'טריגרים': `select pg_get_triggerdef(t.oid) as v from pg_trigger t
              join pg_class c on c.oid=t.tgrelid join pg_namespace n on n.oid=c.relnamespace
              where n.nspname='public' and not t.tgisinternal order by 1`,
  'מדיניות RLS': `select tablename||' '||policyname||' '||cmd||' '||coalesce(qual,'-')
                    ||' / '||coalesce(with_check,'-') as v
                  from pg_policies where schemaname='public' order by 1`,
  'RLS מופעל': `select c.relname as v from pg_class c join pg_namespace n on n.oid=c.relnamespace
                where n.nspname='public' and c.relkind='r' and c.relrowsecurity order by 1`,
  'הרשאות טבלה': `select grantee||' '||table_name||' '||privilege_type as v
                  from information_schema.role_table_grants
                  where table_schema='public' and grantee in ('anon','authenticated','service_role')
                  order by 1`,
  'דליי אחסון': `select id||' public='||public::text as v from storage.buckets order by 1`,
};

let bad = 0;
for (const [label, query] of Object.entries(PROBES)) {
  const [p, s] = await Promise.all([readProd(query), readStaging(query)]);
  const P = new Set(p.map((r) => r.v));
  const S = new Set(s.map((r) => r.v));
  const missing = [...P].filter((x) => !S.has(x));
  const extra = [...S].filter((x) => !P.has(x));
  if (!missing.length && !extra.length) {
    console.log(`✓ ${label} — ${P.size} זהים`);
  } else {
    bad += missing.length + extra.length;
    console.log(`✗ ${label} — חסרים ב-staging: ${missing.length} · עודפים: ${extra.length}`);
    for (const m of missing.slice(0, 8)) console.log(`    חסר:  ${String(m).slice(0, 160)}`);
    for (const e of extra.slice(0, 8)) console.log(`    עודף: ${String(e).slice(0, 160)}`);
  }
}

// ‼ שער בטיחות הפוך: ב-staging אסור שתהיה ולו משימה מתוזמנת אחת.
const jobs = await readStaging(`select count(*)::int as n from cron.job`);
if (jobs[0].n === 0) console.log('✓ אין משימות מתוזמנות ב-staging (כנדרש)');
else { bad += 1; console.log(`✗ יש ${jobs[0].n} משימות מתוזמנות ב-staging — חייבות להימחק`); }

console.log(bad === 0
  ? `\n✓ המבנה של ${STAGING_REF} זהה למבנה של ${PROD_REF}.`
  : `\n✗ ${bad} הפרשים.`);
process.exit(bad === 0 ? 0 : 1);

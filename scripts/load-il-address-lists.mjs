#!/usr/bin/env node
/**
 * load-il-address-lists.mjs — טוען את רשימות היישובים והרחובות של רשות האוכלוסין
 * (data.gov.il, מתעדכנות כל שבוע) לטבלאות il_localities / il_streets (מיגרציה 285).
 *
 *   שימוש:  node scripts/load-il-address-lists.mjs staging
 *           node scripts/load-il-address-lists.mjs prod
 *
 * ‼ מה שהוסר מהרשימה הרשמית נמחק מ-il_streets (לפי loaded_at). יישובים לא נמחקים —
 *   כרטיסים מצביעים עליהם, ושם יישוב שנמחק עדיף על סמל יתום.
 * ‼ לא נוגע בכרטיסי לקוחות. רחוב חדש מופיע בבחירה מיד; כרטיס קיים לא מתעדכן לבד.
 */
import { sql, STAGING_REF, PROD_REF } from './staging-lib.mjs';

const env = process.argv[2];
if (env !== 'staging' && env !== 'prod') { console.error('שימוש: node scripts/load-il-address-lists.mjs <staging|prod>'); process.exit(2); }
const REF = env === 'prod' ? PROD_REF : STAGING_REF;
// כל שאילתה כאן חוזרת על עצמה בבטחה (upsert), ולכן ניתוק רשת = עוד ניסיון
async function run(q) {
  for (let attempt = 1; ; attempt++) {
    try { return await sql(REF, q, { allowProd: env === 'prod' }); }
    catch (e) { if (attempt >= 4) throw e; await new Promise(r => setTimeout(r, 2000 * attempt)); }
  }
}

const API = 'https://data.gov.il/api/3/action/datastore_search';
const LOCALITIES = '5c78e9fa-c2e2-4771-93ff-7f400a12f7ba';   // רשימת יישובים בישראל - מתעדכן
const STREETS = '9ad3862c-8391-4b2f-84a4-2d4c68625f4b';      // רשימת רחובות בישראל - מתעדכן
const NO_STREET = 9000;                                       // «רחוב» בשם היישוב — יישוב בלי רחובות

async function fetchAll(resource) {
  const out = [];
  for (let offset = 0; ; offset += 32000) {
    const r = await fetch(`${API}?resource_id=${resource}&limit=32000&offset=${offset}`);
    if (!r.ok) throw new Error(`data.gov.il ${r.status}`);
    const j = await r.json();
    out.push(...j.result.records);
    if (out.length >= j.result.total || !j.result.records.length) return { records: out, total: j.result.total };
  }
}
const clean = (s) => String(s ?? '').replace(/\s+/g, ' ').trim();
const lit = (s) => `'${s.replace(/'/g, "''")}'`;

const loc = await fetchAll(LOCALITIES);
const st = await fetchAll(STREETS);
console.log(`data.gov.il: ${loc.records.length}/${loc.total} יישובים · ${st.records.length}/${st.total} רחובות`);
if (loc.records.length !== loc.total || st.records.length !== st.total) throw new Error('הורדה חלקית — עוצרים');

const localities = new Map();
for (const r of loc.records) {
  const code = Number(r['סמל_ישוב']); const name = clean(r['שם_ישוב']);
  if (!code || !name) continue;
  localities.set(code, { code, name, municipal: Number(r['סמל_מועצה_איזורית']) === 0 });
}
const streets = new Map();
for (const r of st.records) {
  const lc = Number(r['סמל_ישוב']); const code = Number(r['סמל_רחוב']); const name = clean(r['שם_רחוב']);
  if (!localities.has(lc) || !code || !name) continue;
  streets.set(`${lc}:${code}`, { lc, code, name });
}
const withStreets = new Set([...streets.values()].filter(s => s.code !== NO_STREET).map(s => s.lc));
if (localities.size < 1200 || streets.size < 50000) throw new Error(`מעט מדי שורות (${localities.size}/${streets.size}) — עוצרים`);

const stamp = new Date().toISOString();
const locRows = [...localities.values()].map(l => `(${l.code}, ${lit(l.name)}, ${l.municipal}, ${withStreets.has(l.code)}, '${stamp}')`);
await run(`insert into public.il_localities (code, name, municipal, has_streets, loaded_at) values ${locRows.join(',')}
  on conflict (code) do update set name = excluded.name, municipal = excluded.municipal, has_streets = excluded.has_streets, loaded_at = excluded.loaded_at`);
console.log(`✓ ${localities.size} יישובים`);

const all = [...streets.values()];
for (let i = 0; i < all.length; i += 4000) {
  const part = all.slice(i, i + 4000).map(s => `(${s.lc}, ${s.code}, ${lit(s.name)}, '${stamp}')`);
  await run(`insert into public.il_streets (locality_code, code, name, loaded_at) values ${part.join(',')}
    on conflict (locality_code, code) do update set name = excluded.name, loaded_at = excluded.loaded_at`);
  process.stdout.write(`\r  רחובות ${Math.min(i + 4000, all.length)}/${all.length}`);
}
const del = await run(`with d as (delete from public.il_streets where loaded_at < '${stamp}' returning 1) select count(*)::int n from d`);
const cnt = await run(`select (select count(*) from public.il_localities)::int l, (select count(*) from public.il_streets)::int s`);
console.log(`\n✓ ${all.length} רחובות · הוסרו ${del[0].n} · במסד עכשיו ${cnt[0].l} יישובים, ${cnt[0].s} רחובות`);

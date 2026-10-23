#!/usr/bin/env node
/**
 * 289-paperless-first-flow.mjs — «פייפרלס ראשון» במסלול הקליטה של משרד (23.10.2026).
 *
 * ‼ הסדר הוא נתון של המסלול, לא כלל בשרת: מזיזים את פריטי הפייפרלס לראש השלב שבו הם יושבים
 *   (אחרי הפריטים הקבועים), ושומרים גרסה חדשה דרך save_office_flow — עם חמש הרשימות
 *   שמחושבות ב-compileOnboarding, אותה פונקציה שהבונה קורא לה בשמירה. לא כותבים את הרשימות ביד.
 * ‼ הוכחה לפני כתיבה: compileOnboarding(המסלול הנוכחי) חייב להיות זהה לרשימות השמורות. אם לא —
 *   הספרייה השתנתה מאז השמירה האחרונה, והשמירה הייתה מכניסה שינוי נוסף בשקט ⇒ עוצרים.
 * ‼ השמירה רצה בשם המשתמש שיצר את הגרסה האחרונה (auth.uid() דרך request.jwt.claims) — כמו
 *   לחיצה על «שמירה» בבונה; גרסה חדשה נרשמת בהיסטוריה וניתנת לחזרה.
 * ‼ חל על לקוחות שהקליטה שלהם נוצרת מעכשיו (sort_order נקבע ביצירה). לא שולח מייל ולא מפרסם.
 *
 *   שימוש:  node scripts/289-paperless-first-flow.mjs --target=staging|prod --flow=<id> [--apply]
 *   בלי --apply: מדפיס את הסדר לפני/אחרי ובודק את ההוכחה, בלי לכתוב.
 */
import { build } from 'esbuild';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { isDeepStrictEqual } from 'node:util';
import { ROOT, PROD_REF, STAGING_REF, sql } from './staging-lib.mjs';

const arg = (k) => process.argv.find((a) => a.startsWith(`--${k}=`))?.split('=')[1];
const target = arg('target');
const flowId = arg('flow');
const apply = process.argv.includes('--apply');
if (!['staging', 'prod'].includes(target) || !flowId) {
  console.error('✋ שימוש: --target=staging|prod --flow=<id> [--apply]'); process.exit(1);
}
const ref = target === 'prod' ? PROD_REF : STAGING_REF;
const q = (v) => `'${String(v).replace(/'/g, "''")}'`;
const read = (query) => sql(ref, query, { allowProd: true });

const PAPERLESS = ['paperless_invite', 'paperless_connection', 'paperless_tax_authority', 'retainer_authorization'];

// ── compileOnboarding + templateEntryOwner מהקוד עצמו ─────────────────────────
const dir = mkdtempSync(join(tmpdir(), 'p289-'));
const entry = join(dir, 'entry.ts');
writeFileSync(entry, `export { compileOnboarding } from ${JSON.stringify(resolve(ROOT, 'src/features/flows/compile.ts'))};
export { templateEntryOwner } from ${JSON.stringify(resolve(ROOT, 'src/utils/templateEntryOwner.ts'))};`);
const outfile = join(dir, 'bundle.mjs');
await build({ entryPoints: [entry], bundle: true, format: 'esm', platform: 'node', outfile, logLevel: 'error' });
const { compileOnboarding, templateEntryOwner } = await import(pathToFileURL(outfile).href);

// ── המצב הנוכחי ─────────────────────────────────────────────────────────────
const [f] = await read(`select f.id, f.office_id, f.current_version, f.trigger, v.definition,
    (select created_by from public.office_flow_versions x where x.flow_id = f.id and x.created_by is not null
      order by x.version desc limit 1) as author
  from public.office_flows f join public.office_flow_versions v on v.flow_id = f.id and v.version = f.current_version
  where f.id = ${q(flowId)}`);
if (!f) { console.error('✋ המסלול לא נמצא'); process.exit(1); }
if (f.trigger !== 'quote_approved') { console.error('✋ זה לא מסלול הקליטה'); process.exit(1); }
const stored = Object.fromEntries((await read(`select client_kind, entries from public.office_journey_defaults
  where office_id = ${q(f.office_id)}`)).map((r) => [r.client_kind, r.entries]));

// הספרייה כמו loadRequestTemplates + mergeOfficeOverrides + templateForRef (src/lib/requestTemplates.ts)
const rows = (await read(`select id, name, office_id, seed_key, entries from public.journey_templates
  where kind = 'request' and (office_id is null or office_id = ${q(f.office_id)})`)).map((r) => ({
  id: r.id, name: r.name, officeId: r.office_id, seedKey: r.seed_key, entries: Array.isArray(r.entries) ? r.entries : [] }));
const overridden = new Set(rows.filter((t) => t.officeId && t.seedKey).map((t) => t.seedKey));
const templates = rows.map((t) => (t.officeId && t.seedKey
  ? { ...t, overrides: rows.filter((s) => !s.officeId && s.seedKey === t.seedKey).map((s) => s.id) } : t))
  .filter((t) => !(!t.officeId && t.seedKey && overridden.has(t.seedKey)));
const lib = {
  template: (id) => {
    const t = templates.find((x) => x.id === id || x.overrides?.includes(id));
    const e = t?.entries[0];
    if (!t || !e) return undefined;
    return { name: t.name, stepType: e.stepType || 'custom_request', owner: templateEntryOwner(e), payload: e.payload ?? {}, requiredForClose: e.requiredForClose };
  },
  document: () => undefined, // ‼ אין במסלולים האלה פריטי מסמך; אם יש — ההוכחה תיפול ונעצור.
};

// ── הוכחה: הרשימות השמורות = התרגום של המסלול הנוכחי ─────────────────────────
const strip = (list) => JSON.parse(JSON.stringify(list ?? []));
const now = compileOnboarding(f.definition, lib);
const kinds = Object.keys(now);
const mismatch = kinds.filter((k) => !isDeepStrictEqual(strip(now[k]), strip(stored[k])));
if (mismatch.length) {
  console.error('✋ הרשימות השמורות אינן התרגום של המסלול הנוכחי:', mismatch.join(', '));
  for (const k of mismatch) console.error(k, '\n  נשמר:', JSON.stringify(stored[k])?.slice(0, 600), '\n  מתורגם:', JSON.stringify(now[k])?.slice(0, 600));
  process.exit(1);
}
console.log('✓ הוכחה: הרשימות השמורות = compileOnboarding(המסלול הנוכחי)');

// ── הסדר החדש ───────────────────────────────────────────────────────────────
const isPl = (it) => it.ref?.kind === 'system' && PAPERLESS.includes(it.ref.stepType);
let moved = 0;
const def = { ...f.definition, stages: f.definition.stages.map((s) => {
  if (!s.items.some(isPl)) return s;
  const fixed = s.items.filter((it) => it.fixed);
  const pl = s.items.filter((it) => !it.fixed && isPl(it));
  const rest = s.items.filter((it) => !it.fixed && !isPl(it));
  const items = [...fixed, ...pl, ...rest];
  if (items.some((it, i) => it !== s.items[i])) moved++;
  return { ...s, items };
}) };
const next = compileOnboarding(def, lib);
const order = (c) => Object.fromEntries(Object.entries(c).map(([k, l]) => [k, l.map((e) => `${e.key}:${e.sortIndex}`).join(' · ')]));
console.log('\nלפני:', order(now), '\nאחרי:', order(next));
if (!moved) { console.log('\nכבר בסדר הזה — אין מה לשמור.'); process.exit(0); }
// אותם פריטים בדיוק, רק בסדר אחר
for (const k of kinds) {
  const a = strip(now[k]).map(({ sortIndex, ...e }) => JSON.stringify(e)).sort();
  const b = strip(next[k]).map(({ sortIndex, ...e }) => JSON.stringify(e)).sort();
  if (!isDeepStrictEqual(a, b)) { console.error(`✋ ${k}: התוכן השתנה, לא רק הסדר`); process.exit(1); }
}
console.log('✓ אותם פריטים, רק הסדר זז');

if (!apply) { console.log('\n(בלי --apply — לא נכתב דבר)'); process.exit(0); }
if (!f.author) { console.error('✋ אין משתמש שבשמו לשמור'); process.exit(1); }

const claims = JSON.stringify({ sub: f.author, role: 'authenticated' });
const res = await sql(ref, `
  select set_config('request.jwt.claims', ${q(claims)}, true);
  select public.save_office_flow(${q(f.id)}, ${f.current_version}, ${q(JSON.stringify(def))}::jsonb, null,
    ${q('פייפרלס ראשון — הגבייה עוברת בו (23.10.2026)')}, ${q(JSON.stringify(next))}::jsonb) as r;`, { allowProd: true });
const r = res?.[0]?.r ?? res?.at?.(-1)?.r;
console.log('\nsave_office_flow:', JSON.stringify(r));
if (!r?.ok) process.exit(1);

const after = Object.fromEntries((await read(`select client_kind, entries from public.office_journey_defaults
  where office_id = ${q(f.office_id)}`)).map((x) => [x.client_kind, x.entries]));
const bad = kinds.filter((k) => !isDeepStrictEqual(strip(after[k]), strip(next[k])));
console.log(bad.length ? `✗ הרשימות במסד אחרי השמירה שונות: ${bad.join(', ')}` : '✓ הרשימות במסד = התרגום של הסדר החדש');
process.exit(bad.length ? 1 : 0);

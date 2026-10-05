#!/usr/bin/env node
/**
 * staging-test-onboarding-roundtrip.mjs — 216: המעבר מ«בקשות ללקוח חדש» (חמש רשימות)
 * למסלול קליטה אחד אינו משנה דבר במה שלקוח חדש מקבל.
 *
 * ‼ הכול בבקשה אחת שמסתיימת ב-raise ⇒ שום דבר לא נשמר. 214–216 מוחלות, נבנה
 * המסלול מהרשימות של משרד הבדיקות (ensure_onboarding_flow), ושני הצדדים חוזרים
 * לכאן. כאן המסלול מתורגם בחזרה (compileOnboarding — אותו קוד שהמסך שומר בו)
 * ומושווה לרשימות המקוריות, סוג אחר סוג, רשומה אחר רשומה.
 *
 * שימוש:  node scripts/staging-test-onboarding-roundtrip.mjs [real|synthetic]
 */
import { readFileSync, readdirSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';
import { ROOT, STAGING_REF, loadEnv, assertTriggersEnabled } from './staging-lib.mjs';

await assertTriggersEnabled();
const USER_ID = readFileSync(resolve(ROOT, 'STAGING_USER_ID'), 'utf8').trim();
// ‼ 222: גם הקבצים שאחרי 216 (217–229) — המחולל החי הוא הגרסה של 222 (קורא ל-_onboarding_system_payload), ובלעדיהם
// הבדיקה הייתה מגדירה מחדש את הגרסה של 216 ובודקת אותה במקום את מה שרץ.
const LATER = readdirSync(resolve(ROOT, 'supabase')).filter(f => /^2(1[7-9]|2\d)-.*\.sql$/.test(f))
  .sort((a, b) => parseInt(a) - parseInt(b)).map(f => 'supabase/' + f);
const MIGRATIONS = ['supabase/214-client-notices.sql', 'supabase/215-flows.sql', 'supabase/216-flows-onboarding-integration.sql', ...LATER]
  .map(f => readFileSync(resolve(ROOT, f), 'utf8')).join('\n');
const MODE = process.argv[2] === 'synthetic' ? 'synthetic' : 'real';
const TEST = readFileSync(resolve(ROOT, 'scripts/sql/test-onboarding-roundtrip.sql'), 'utf8')
  .replaceAll('__USER__', USER_ID).replaceAll('__MODE__', MODE);
console.log(`מצב: ${MODE}`);

const r = await fetch(`https://api.supabase.com/v1/projects/${STAGING_REF}/database/query`, {
  method: 'POST',
  headers: { Authorization: `Bearer ${loadEnv().SUPABASE_ACCESS_TOKEN}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({ query: MIGRATIONS + '\n' + TEST }),
});
const body = await r.text();
if (r.ok) { console.error('✋ הבקשה הסתיימה בלי raise — ייתכן שמשהו נשמר!'); process.exit(1); }
let msg = body; try { msg = JSON.parse(body).message ?? body; } catch { /* text */ }
const m = msg.match(/PAYLOAD:(\{.*\})/s);
if (!m) { console.error('✋ המיגרציה או הבדיקה נכשלו לפני הסוף:\n' + msg.slice(0, 2000)); process.exit(1); }
const payload = JSON.parse(m[1].slice(0, m[1].lastIndexOf('}') + 1));

// ── התרגום בחזרה, באותו קוד של המסך ─────────────────────────────────────────
const tmp = mkdtempSync(join(tmpdir(), 'pivo-rt-'));
const entry = join(tmp, 'entry.ts');
const p = (f) => JSON.stringify(resolve(ROOT, f).split('\\').join('/'));
writeFileSync(entry, `
export { compileOnboarding } from ${p('src/features/flows/compile.ts')};
export { buildDocumentRequestPayload } from ${p('src/lib/clientGuide.ts')};
`);
const outfile = join(tmp, 'bundle.mjs');
await build({ entryPoints: [entry], bundle: true, platform: 'node', format: 'esm', target: 'node20', outfile,
  loader: { '.css': 'empty', '.png': 'empty', '.svg': 'empty' }, logLevel: 'error',
  define: { 'import.meta.env': JSON.stringify({ VITE_SUPABASE_URL: 'http://localhost:54321', VITE_SUPABASE_ANON_KEY: 'x', MODE: 'test' }) } });
const { compileOnboarding, buildDocumentRequestPayload } = await import(pathToFileURL(outfile).href);
rmSync(tmp, { recursive: true, force: true });

const lib = {
  template: (id) => {
    const t = payload.templates[id];
    return t ? { name: t.name, stepType: t.entry.stepType, payload: t.entry.payload, requiredForClose: t.entry.requiredForClose } : undefined;
  },
  document: (id) => {
    const d = (payload.documents || []).find((x) => x.id === id);
    return d ? { name: d.label, payload: buildDocumentRequestPayload(d) } : undefined;
  },
};
const compiled = compileOnboarding(payload.definition, lib);

// ── השוואה ───────────────────────────────────────────────────────────────────
// ‼ סדר המפתחות של jsonb שונה מסדר הבנייה ב-JS — משווים בצורה קנונית.
const canon = (v) => Array.isArray(v) ? v.map(canon)
  : v && typeof v === 'object' ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, canon(v[k])])) : v;
const norm = (e) => {
  const office = e.source === 'office';
  return JSON.stringify(canon({
    key: e.key, stepType: e.stepType, source: e.source ?? 'system',
    requiredForClose: office ? (e.requiredForClose !== false) : (e.requiredForClose ?? null),
    dueInDays: e.dueInDays ?? null,
    dependsOn: office ? null : (e.dependsOn || null),
    variants: e.variants && e.variants.length ? e.variants : [],
    authorities: e.authorities ?? null,
    documentId: e.documentId ?? null,
    payload: office ? (e.payload ?? null) : null,
  }));
};
let pass = 0, fail = 0;
const ok = (n, c, d = '') => { if (c) { pass++; console.log(`✓ ${n}`); } else { fail++; console.log(`✗ ${n}${d ? '\n    ' + d : ''}`); } };
for (const kind of ['exempt_dealer', 'licensed_dealer', 'company', 'tax_refund', 'representation_only']) {
  const before = (payload.entries?.[kind] ?? []).filter((e) => e.enabled !== false)
    .sort((a, b) => (a.sortIndex ?? 0) - (b.sortIndex ?? 0));
  const after = compiled[kind] ?? [];
  const bset = before.map(norm).sort();
  const aset = after.map(norm).sort();
  const same = JSON.stringify(bset) === JSON.stringify(aset);
  ok(`${kind}: אותן ${before.length} רשומות, אותו תוכן`, same,
    same ? '' : `לפני: ${JSON.stringify(before.map((e) => e.key))}\n    אחרי: ${JSON.stringify(after.map((e) => e.key))}\n    ` +
      `שונה: ${JSON.stringify(bset.filter((x) => !aset.includes(x)).map((x) => JSON.parse(x).key))}`);
  // הסדר: לפני ⊆ אחרי באותו סדר יחסי (המסלול מאחד את סדר הסוגים).
  const order = before.map((e) => e.key);
  const aOrder = after.map((e) => e.key).filter((k) => order.includes(k));
  if (JSON.stringify(order) !== JSON.stringify(aOrder)) console.log(`  · ${kind}: הסדר בתצוגה השתנה (${order.join(',')} ⇒ ${aOrder.join(',')}) — סדר תצוגה בלבד`);
}
const items = payload.definition.stages.flatMap((s) => s.items);
// ‼ «כמו היום» חל על משרד שעוד לא בנה מסלול. רשימות שנכתבו כבר ממסלול (save_office_flow —
// לרשומות יש stageKey) נבנות חזרה לשלבים שלהן, וזה הנכון.
const fromFlow = Object.values(payload.entries ?? {}).flat().some((e) => e && e.stageKey);
if (fromFlow) {
  console.log('  · הרשימות של המשרד נכתבו כבר ממסלול — בדיקת «שלב אחד, כמו היום» לא חלה');
} else {
  ok('המסלול: שלב אחד שנפתח מיד, «הכול באישורך» (כמו היום)',
    payload.definition.stages.length === 1 && payload.definition.stages[0].delivery === 'hold' && payload.definition.stages[0].opens.after === 'start');
}
ok('בקשות המשרד הועברו לספרייה (המסלול מצביע ולא מעתיק)',
  items.filter((i) => i.ref.kind === 'template').every((i) => payload.templates[i.ref.templateId]));
console.log(`\n${pass} עברו · ${fail} נכשלו · rolled back`);
process.exitCode = fail ? 1 : 0;

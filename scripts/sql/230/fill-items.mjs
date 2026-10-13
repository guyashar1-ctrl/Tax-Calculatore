// ממלא את רשימת הפריטים ב-230 מהקטלוג בקוד (catalog.ts + wealthCatalog.ts) — כדי שהשרת והקוד לא ייפרדו.
//   npx esbuild scripts/sql/230/items.ts --bundle --platform=node --alias:@src=./src --outfile=<tmp>/items.cjs
//   node <tmp>/items.cjs > <tmp>/items.json && node scripts/sql/230/fill-items.mjs <tmp>/items.json
// ‼ 12.10.2026: גם ל-229 — node scripts/sql/230/fill-items.mjs <items.json> 229 (229 נבדקת לבדה מול אותו קטלוג).
// ‼ מחליף את התוכן שבין `select '` לבין `'::jsonb` בפונקציה _tax_year_items בלבד.
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
const WT = resolve(fileURLToPath(import.meta.url), '../../../..') + '/';
// ‼ 12.10.2026: 236 (קליטה) — הבעלים של הרשימה המלאה. 230 — בלי פריטי הקליטה; 229 — בלי פריטי ההון והקליטה.
const which = process.argv[3] ?? '230';
const file = WT + ({ 229: 'supabase/229-tax-year-collection.sql', 230: 'supabase/230-wealth-declaration-collection.sql', 236: 'supabase/236-tax-file-intake.sql' })[which];
const all = JSON.parse(readFileSync(process.argv[2], 'utf8'));
// 229 — רק פריטי שנת המס; פריטי הצהרת ההון (wealth.*) נוספים ב-230.
const keep = (k) => which === '236' || (!k.startsWith('intake.') && (which === '230' || !k.startsWith('wealth.')));
const items = Object.fromEntries(Object.entries(all).filter(([k]) => keep(k)));
const entries = Object.entries(items).map(([k, v]) => `${JSON.stringify(k)}:${JSON.stringify(v)}`);
const lines = [];
for (let i = 0; i < entries.length; i += 4) lines.push('    ' + entries.slice(i, i + 4).join(','));
const lit = `{\n${lines.join(',\n')}}`.replace(/'/g, "''");
let sql = readFileSync(file, 'utf8');
const start = sql.indexOf("create or replace function public._tax_year_items()");
const a = sql.indexOf("select '", start) + "select '".length;
const b = sql.indexOf("'::jsonb", a);
sql = sql.slice(0, a) + lit + sql.slice(b);
writeFileSync(file, sql);
console.log(`${which}: ${entries.length} פריטים`);

#!/usr/bin/env node
/**
 * staging-verify-signed-6101.mjs — הקובץ החתום שנשמר בתיק הלקוח הוא בדיוק מה שננעל ונחתם.
 *
 *   node scripts/staging-verify-signed-6101.mjs <clientId> [קובץ-שנפתח-מהמסך.pdf]
 *
 * קריאה בלבד, staging בלבד. בודק שלושה דברים בלתי תלויים:
 *   1. הקובץ באחסון (client-documents) — אותה טביעת SHA-256 שנרשמה בשרת על הגרסה,
 *      ואותה טביעה של הקובץ שהמסך פתח (כשמעבירים אותו).
 *   2. רינדור מחדש, בקוד הנוכחי, מהנתונים שננעלו + החתימות שנשמרו + תאריך החתימה —
 *      יוצא **זהה בייט-בבייט** לקובץ השמור. כלומר: אין בקובץ שום דבר שלא עבר את הנעילה.
 *   3. הערכים המבוקשים שננעלו אכן כתובים בקובץ (שכבת הטקסט).
 * ‼ רינדור זהה מחייב את אותו מיפוי: גרסה שננעלה במיפוי אחר מדווחת ולא מושווית.
 */
import { createClient } from '@supabase/supabase-js';
import { build } from 'esbuild';
import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { pathToFileURL } from 'node:url';
import { loadEnv } from './staging-lib.mjs';

const ROOT = resolve(process.cwd());
const clientId = process.argv[2];
const uiFile = process.argv[3];
if (!clientId) { console.error('שימוש: node scripts/staging-verify-signed-6101.mjs <clientId> [file.pdf]'); process.exit(2); }

const env = loadEnv('.env.staging');
if (!/evdfxjqrkgugssfrdoxd/.test(env.VITE_SUPABASE_URL ?? '')) { console.error('✋ לא staging'); process.exit(2); }
const admin = createClient(env.VITE_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const sha = (b) => createHash('sha256').update(b).digest('hex');
let fail = 0;
const ok = (name, cond, detail) => { if (cond) console.log(`✓ ${name}`); else { fail++; console.log(`✗ ${name}${detail ? ' — ' + detail : ''}`); } };

// ── מה נרשם בשרת ──
const { data: filings } = await admin.from('smart_form_filings').select('id, state').eq('client_id', clientId).order('created_at', { ascending: false });
let rev = null, filing = null;
for (const f of filings ?? []) {
  const { data } = await admin.from('smart_form_revisions').select('*').eq('filing_id', f.id).not('signed_document_id', 'is', null).order('revision', { ascending: false }).limit(1);
  if (data?.length) { rev = data[0]; filing = f; break; }
}
if (!rev) { console.error('אין לגרסה חתומה ושמורה ללקוח הזה'); process.exit(1); }
const { data: client } = await admin.from('clients').select('first_name, last_name').eq('id', clientId).single();
const { data: doc } = await admin.from('documents').select('id, storage_path, file_size, file_name, client_id').eq('id', rev.signed_document_id).single();
console.log(`הגשה ${filing.id.slice(0, 8)}… · גרסה ${rev.revision} · מיפוי ${rev.mapping_version} · מסמך ${doc?.file_name}`);
ok('המסמך שמור בתיק של אותו לקוח', doc?.client_id === clientId, doc?.client_id);

// ── 1 · הקובץ באחסון ──
const { data: blob, error: dlErr } = await admin.storage.from('client-documents').download(doc.storage_path);
if (dlErr) { console.error('הורדה נכשלה:', dlErr.message); process.exit(1); }
const stored = new Uint8Array(await blob.arrayBuffer());
ok('הקובץ באחסון = הטביעה שנרשמה בשרת על הגרסה', sha(stored) === rev.signed_pdf_sha256, `${sha(stored).slice(0, 12)} מול ${rev.signed_pdf_sha256?.slice(0, 12)}`);
ok('גודל הקובץ תואם לרשומת המסמך', stored.byteLength === Number(doc.file_size), `${stored.byteLength} מול ${doc.file_size}`);
if (uiFile) {
  const ui = readFileSync(uiFile);
  ok('הקובץ שהמסך פתח («פתיחת המסמך החתום») = הקובץ באחסון', sha(ui) === sha(stored));
}

// ── 2 · רינדור מחדש מהנעול ──
const tmp = mkdtempSync(join(tmpdir(), 'pivo-6101v-'));
const esc = (p) => JSON.stringify(p.split('\\').join('/'));
writeFileSync(join(tmp, 'entry.ts'), `
export { renderBtl6101, israelDate } from ${esc(join(ROOT, 'src/features/smartForms/btl6101/document.ts'))};
export { BTL6101_TEMPLATE } from ${esc(join(ROOT, 'src/features/smartForms/btl6101/template.ts'))};
export { formDate, formMoney } from ${esc(join(ROOT, 'src/features/smartForms/btl6101/layout6101.ts'))};
`);
await build({ entryPoints: [join(tmp, 'entry.ts')], bundle: true, outfile: join(tmp, 'm.mjs'), platform: 'node', format: 'esm', target: 'node20', logLevel: 'warning', nodePaths: [join(ROOT, 'node_modules')] });
const realFetch = globalThis.fetch;
globalThis.fetch = async (url, ...rest) => {
  const u = String(url);
  if (u.startsWith('/fonts/') || u.startsWith('/templates/')) return new Response(readFileSync(join(ROOT, 'public', u)), { status: 200 });
  return realFetch(url, ...rest);
};
const M = await import(pathToFileURL(join(tmp, 'm.mjs')).href);
if (rev.mapping_version !== M.BTL6101_TEMPLATE.mappingVersion) {
  console.log(`‼ הגרסה ננעלה במיפוי ${rev.mapping_version} והקוד במיפוי ${M.BTL6101_TEMPLATE.mappingVersion} — רינדור מחדש לא אמור להיות זהה; לא מושווה.`);
} else {
  const clientSigned = (rev.signers ?? []).find(s => s.role === 'client')?.signedAt;
  const declarationDate = M.israelDate(clientSigned);
  const signatures = Object.fromEntries(Object.entries(rev.signatures ?? {}).map(([k, v]) => [k, v?.png]));
  const { bytes } = await M.renderBtl6101({ ...rev.snapshot.data, declarationDate }, rev.purposes, {
    signatures, title: `טופס 6101 חתום — ${client.first_name} ${client.last_name} — גרסה ${rev.revision}`,
    date: new Date(rev.signed_at ?? clientSigned),
  });
  ok('רינדור מחדש (נתונים שננעלו + חתימות + תאריך חתימה) זהה בייט-בבייט לקובץ השמור', sha(bytes) === sha(stored),
    `${sha(bytes).slice(0, 12)} מול ${sha(stored).slice(0, 12)} (${bytes.byteLength} מול ${stored.byteLength})`);
}

// ── 3 · הערכים המבוקשים כתובים בקובץ ──
const pdfjsPath = join(ROOT, 'node_modules/pdfjs-dist/legacy/build/pdf.mjs');
if (existsSync(pdfjsPath)) {
  const pdfjs = await import(pathToFileURL(pdfjsPath).href);
  const pdf = await pdfjs.getDocument({ data: stored.slice(), disableFontFace: true, useSystemFonts: false }).promise;
  let text = '';
  for (let i = 1; i <= pdf.numPages; i++) text += (await (await pdf.getPage(i)).getTextContent()).items.map(x => x.str).join(' ') + '\n';
  const d = rev.snapshot.data;
  const want = [];
  if (rev.purposes.includes('change')) want.push(['תאריך השינוי', M.formDate(d.changeToDate)], ['שעות אחרי', d.hoursAfter], ['הכנסה אחרי', M.formMoney(d.incomeAfter)], ['הכנסה לפני', M.formMoney(d.incomeBefore)], ['מתאריך (לפני)', M.formDate(d.changeFromDate)]);
  if (rev.purposes.includes('start')) want.push(['תאריך התחלה', M.formDate(d.startDate)], ['הכנסה חודשית', M.formMoney(d.monthlyIncome)]);
  const flat = text.replace(/\s+/g, '');
  for (const [label, v] of want) if (v) ok(`בקובץ: ${label} (${v})`, flat.includes(String(v).replace(/\s+/g, '')));
  console.log(`עמודים: ${pdf.numPages}`);
}

console.log(fail ? `\n✗ ${fail} בדיקות נכשלו` : '\n✓ הקובץ השמור הוא בדיוק מה שננעל ונחתם');
process.exit(fail ? 1 : 0);

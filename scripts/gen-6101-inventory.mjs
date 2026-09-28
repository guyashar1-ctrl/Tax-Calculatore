#!/usr/bin/env node
// ─── מלאי השדות של טופס 6101 — מסמך קריא שנגזר מהקוד (לא נכתב ביד) ──────────
//   node scripts/gen-6101-inventory.mjs  ⇒  docs/forms/btl-6101-inventory.md
import { build } from 'esbuild';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { pathToFileURL } from 'node:url';

const ROOT = resolve(process.cwd());
const tmp = mkdtempSync(join(tmpdir(), 'pivo-inv-'));
await build({ entryPoints: [join(ROOT, 'src/features/smartForms/btl6101/template.ts')], bundle: true, outfile: join(tmp, 't.mjs'), platform: 'node', format: 'esm', logLevel: 'warning' });
const { BTL6101_TEMPLATE: T } = await import(pathToFileURL(join(tmp, 't.mjs')).href);

const esc = (s) => String(s ?? '').replace(/\|/g, '\|').replace(/\n/g, ' ');
const box = (b) => `${b.x.toFixed(1)}, ${b.y.toFixed(1)}, ${b.w.toFixed(1)}×${b.h.toFixed(1)}`;
const REQ = { always: 'חובה', when_applicable: 'חובה כשרלוונטי', optional: 'רשות', signer: 'חותם נדרש' };
const PROV = { client_record: 'כרטיס הלקוח', btl_sync: 'ב"ל (סנכרון)', derived: 'נגזר', filing: 'ההגשה', system: 'PIVO' };
const OVF = { shrink: 'הקטנה עד מינימום ⇒ חסימה', shrink_wrap2: 'הקטנה ⇒ 2 שורות ⇒ חסימה', appendix: 'נספח', reject: 'ערך ארוך ⇒ חסימה', none: '—' };

let md = `# טופס 6101 (${T.version}) — מלאי השדות הסמנטי\n\n`;
md += `> נגזר אוטומטית מ-\`src/features/smartForms/btl6101/template.ts\` (\`node scripts/gen-6101-inventory.mjs\`). אין לערוך ביד.\n\n`;
md += `- **קובץ:** \`public${T.fileUrl}\` · ${T.pageCount} עמודים · ${T.pageSize.width}×${T.pageSize.height} נק' · בלי סיבוב · בלי AcroForm\n`;
md += `- **SHA-256:** \`${T.sha256}\` · **גרסת מיפוי:** ${T.mappingVersion}\n`;
md += `- **מערכת צירים:** נקודות PDF, ראשית שמאל-תחתון של ה-MediaBox (=CropBox). מלבן = x, y, רוחב×גובה.\n`;
md += `- **${T.fields.length} שדות.** «אישור לקוח» = הצהרה שהלקוח מאשר בחתימתו, לא העתקה מהכרטיס.\n\n`;
const sections = [...new Set(T.fields.map(f => f.section))];
for (const s of sections) {
  md += `## ${s}\n\n| מזהה | תווית | עמ' | מלבן (נק') | סוג | מקור ב-PIVO | כלל עיצוב | תרחיש | חובה | ולידציה | מקור | אישור לקוח | גלישה |\n|---|---|---|---|---|---|---|---|---|---|---|---|---|\n`;
  for (const f of T.fields.filter(x => x.section === s)) {
    md += `| \`${f.id}\` | ${esc(f.label)} | ${f.page} | ${box(f.box)}${f.cells ? ` · ${f.cells.length - 1} תיבות${f.groups ? ` (${f.groups.join('+')})` : ''}` : ''} | ${f.kind}${f.signer ? ` (${f.signer})` : ''} | ${esc(f.source)} | ${esc(f.formatRule)} | ${f.applies === 'always' ? 'תמיד' : f.applies.join(', ')} | ${REQ[f.required]} | ${esc(f.validation ?? '—')} | ${PROV[f.provenance]} | ${f.clientConfirmation ? 'כן' : '—'} | ${OVF[f.overflow]} |\n`;
  }
  md += '\n';
}
md += `## אזורים גלויים שבכוונה אינם ממופים\n\n| מזהה | עמ' | מלבן | מה | למה |\n|---|---|---|---|---|\n`;
for (const u of T.unmapped) md += `| \`${u.id}\` | ${u.page} | ${box(u.box)} | ${esc(u.label)} | ${esc(u.reason)} |\n`;
writeFileSync(join(ROOT, 'docs/forms/btl-6101-inventory.md'), md);
console.log(`docs/forms/btl-6101-inventory.md · ${T.fields.length} שדות · ${T.unmapped.length} אזורים לא ממופים`);

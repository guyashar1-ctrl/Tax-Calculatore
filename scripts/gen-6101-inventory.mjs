#!/usr/bin/env node
// ─── מלאי השדות של טופס 6101 — מסמך קריא שנגזר מהקוד (לא נכתב ביד) ──────────
//   node scripts/gen-6101-inventory.mjs  ⇒  docs/forms/btl-6101-inventory.md
//
// שני חלקים: (1) כל שדה מודפס — מיקום, גיאומטריה נמדדת, כללים; (2) לכל נתון
// בטופס — מאיפה הוא מגיע ב-PIVO (נסרק מקוד ה-resolve, לא מוצהר ביד) ומה עדיין
// חסר. ‼ הדוגמאות מלקוח סינתטי בלבד (fixtures) ורשומת ב"ל סינתטית.
import { build } from 'esbuild';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { pathToFileURL } from 'node:url';

const ROOT = resolve(process.cwd());
const B = join(ROOT, 'src/features/smartForms/btl6101');
const tmp = mkdtempSync(join(tmpdir(), 'pivo-inv-'));
const entry = join(tmp, 'entry.ts');
const imp = (p) => JSON.stringify(join(B, p).split('\\').join('/'));
writeFileSync(entry, `
export { BTL6101_TEMPLATE, CHECK_SQUARES, WRITING_LINES } from ${imp('template.ts')};
export { resolve6101, KEY_LABELS, SECTION_OF, CLIENT_DECLARED_KEYS } from ${imp('resolve.ts')};
export { FX_FULL } from ${imp('fixtures.ts')};
`);
await build({ entryPoints: [entry], bundle: true, outfile: join(tmp, 't.mjs'), platform: 'node', format: 'esm', logLevel: 'warning' });
const M = await import(pathToFileURL(join(tmp, 't.mjs')).href);
const T = M.BTL6101_TEMPLATE;

const esc = (s) => String(s ?? '').replace(/\|/g, '\\|').replace(/\n/g, ' ');
const box = (b) => `${b.x.toFixed(1)}, ${b.y.toFixed(1)}, ${b.w.toFixed(1)}×${b.h.toFixed(1)}`;
const REQ = { always: 'חובה', when_applicable: 'חובה כשרלוונטי', optional: 'רשות', signer: 'חותם נדרש' };
const PROV = { client_record: 'כרטיס הלקוח', btl_sync: 'ב"ל (סנכרון)', derived: 'נגזר', filing: 'ההגשה', system: 'PIVO' };
const OVF = { shrink: 'הקטנה עד מינימום ⇒ חסימה', shrink_wrap2: 'הקטנה ⇒ 2 שורות ⇒ חסימה', appendix: 'נספח', reject: 'ערך ארוך ⇒ חסימה', none: '—' };
const printed = (f) => M.CHECK_SQUARES[f.id] ? `ריבוע ${M.CHECK_SQUARES[f.id].w}×${M.CHECK_SQUARES[f.id].h}` : f.line != null ? `קו ${f.line}` : '—';

let md = `# טופס 6101 (${T.version}) — מלאי השדות הסמנטי\n\n`;
md += `> נגזר אוטומטית מהקוד (\`node scripts/gen-6101-inventory.mjs\`): \`template.ts\` (שדות וגיאומטריה) ו-\`resolve.ts\` (מקורות). אין לערוך ביד.\n\n`;
md += `- **קובץ:** \`public${T.fileUrl}\` · ${T.pageCount} עמודים · ${T.pageSize.width}×${T.pageSize.height} נק' · בלי סיבוב · בלי AcroForm\n`;
md += `- **SHA-256:** \`${T.sha256}\` · **גרסת מיפוי:** ${T.mappingVersion}\n`;
md += `- **מערכת צירים:** נקודות PDF, ראשית שמאל-תחתון של ה-MediaBox (=CropBox). מלבן = x, y, רוחב×גובה.\n`;
md += `- **${T.fields.length} שדות.** «אישור לקוח» = הצהרה שהלקוח מאשר בחתימתו, לא העתקה מהכרטיס.\n`;
md += `- **גיאומטריה מודפסת (מיפוי 2):** «ריבוע» = פנים הריבוע המודפס שה-✗ ממורכז בו; «קו» = הקצה העליון של קו הכתיבה — זנב תחתון מורם ממנו 0.4 נק', חתימה נחה 0.5 נק' מעליו. נמדד בסקאלה 8 מהקובץ עצמו; היישור נבדק בכל ריצה של \`scripts/test-smart-form-6101.mjs\`.\n\n`;
md += `**תוכן:** [מקור כל נתון ומה עדיין חסר](#מקור-כל-נתון-ומה-עדיין-חסר) · השדות לפי מקטע · [אזורים לא ממופים](#אזורים-גלויים-שבכוונה-אינם-ממופים)\n\n`;

// ─── (2) מקורות וחוסרים — נסרק מהקוד ────────────────────────────────────────
const resolveSrc = readFileSync(join(B, 'resolve.ts'), 'utf8');
const putKeys = new Set([...resolveSrc.matchAll(/put\('([a-zA-Z]+)'/g)].map(m => m[1]));
const hintKeys = new Set([...resolveSrc.matchAll(/hint\('([a-zA-Z]+)'/g)].map(m => m[1]));
putKeys.add('occupations');   // נבנה מרשימת העיסוקים (ב"ל/כרטיס) מחוץ ל-put

/** לקוח סינתטי «מלא ככל האפשר» + רשומת ב"ל סינתטית (207) — להדגמת המקור בפועל. */
const seen = '2026-09-23T17:30:00Z';
const fact = (value) => ({ value, since: '2026-01-05T08:00:00Z', lastSeen: seen, screen: 'ריכוז מידע', history: [] });
const MAX = {
  ...M.FX_FULL,
  mailingAddress: { recipient: 'נועה אלמוג', street: 'ת.ד.', houseNumber: '4521', city: 'תל אביב - יפו', zip: '6104401' },
};
const REC = { documents: [], facts: {
  familyStatus: fact({ raw: 'נשוי', code: 'married' }),
  withholdingFile: fact({ raw: '912345678' }),
  annualContributions: fact({ years: [{ year: 2025, byAssessment: false, total: null, classes: [{ classification: 'עצמאי', charge: null, annualBase: null }] }] }),
} };
const ALL = ['multi_year_report', 'start', 'change', 'end', 'stop_employees', 'spouse_in_business', 'update_details'];
const R = M.resolve6101({ client: MAX, purposes: ALL, entered: {}, asOf: '2026-09-28', btlRecord: REC, flags: { contactNotOwn: true, separateMailing: true } });

/** למה אין מקור — תיעוד בלבד; הסיווג עצמו נגזר מהסריקה. */
const WHY = {
  maritalSinceMonth: 'בכרטיס נשמרת רק שנת הנישואין/הגירושין/האלמנות — אין חודש. ב"ל (ריכוז מידע) מציג את המצב בלי תאריך.',
  altContactLastName: 'אין בכרטיס «איש קשר שהטלפון/המייל שלו» (הטופס מבקש רק כשהפרטים אינם של המבוטח).',
  altContactFirstName: 'כנ"ל.', altContactIdNumber: 'כנ"ל.',
  hoursBand: 'מהכרטיס רק כשנרשמו שעות שבועיות ידנית; טווח השעות שב"ל רושם מוצג כרמז.',
  currentOccupation: 'מהכרטיס כשיש מעסיק נוכחי («שכיר»); אחרת — הצהרה.',
  occupations: 'רשימת העיסוקים מב"ל (סנכרון); החיוב השנתי (207) בודק עקביות.',
  startDate: 'תאריך פתיחת התיק במע"מ — הצעה בלבד, לא בהכרח יום תחילת העבודה.',
  refuseDigital: 'בחירה של הלקוח בטופס — לא נשמרת בכרטיס ולא מוצגת בפורטל המייצגים.',
  monthlyIncome: 'הכנסה חודשית צפויה בפתיחה — הצהרה. בכרטיס יש מחזור/רווח **שנתי** (מוצג כרמז, לא מומר).',
  changeToDate: 'תאריך השינוי המבוקש — הצהרה.', hoursAfter: 'היקף השעות אחרי השינוי — הצהרה.', incomeAfter: 'ההכנסה אחרי השינוי — הצהרה.',
  spouseFromDate: 'אין בכרטיס נתוני עבודת בן/בת הזוג בעסק.', spouseSharePct: 'כנ"ל.', spouseWeeklyHours: 'כנ"ל.',
  endDate: 'תאריך ההפסקה — הצהרה (סגירת תיק מע"מ אינה בהכרח הפסקת העבודה).',
  stopEmployeesDate: 'אין בכרטיס נתוני שכר/עובדים (102) — תאריך ההפסקה הוא הצהרה.',
  declarationDate: 'נקבע ברגע החתימה — לא בטיוטה.',
  hoursBefore: 'ב"ל רושם **טווח** שעות (לא מספר) — מוצג כרמז; מספר השעות מהכרטיס רק כשנרשם ידנית.',
};

/**
 * «הצהרה על ההגשה» — הכוונה של ההגשה הזו (מה מבקשים לשנות), שאין לה מקום
 * בכרטיס. ‼ רשימה מתועדת; כל שאר מה שאין לו מקור ב-resolve הוא **חוסר ב-PIVO**.
 */
const INTENT = new Set(['refuseDigital', 'monthlyIncome', 'changeToDate', 'hoursAfter', 'incomeAfter', 'endDate']);
const KIND = (k) => k === 'declarationDate' ? 'signing'
  : putKeys.has(k) ? (M.CLIENT_DECLARED_KEYS.has(k) ? 'suggested' : 'from_pivo')
  : INTENT.has(k) ? 'declared' : 'none';
const KIND_LABEL = { from_pivo: 'ממולא מ-PIVO', suggested: 'הצעה מ-PIVO + אישור הלקוח', declared: 'הצהרה על ההגשה', signing: 'בחתימה', none: '**אין מקור ב-PIVO**' };
const keys = Object.keys(M.KEY_LABELS);
/** השדות המודפסים של נתון: dataKey זהה, או k= / k@ / k[ / k. (תיבות, מייל מפוצל, שורות טבלה). */
const fieldsOf = (k) => T.fields.filter(f => f.dataKey === k || (f.dataKey?.startsWith(k) && /^[.=@[]/.test(f.dataKey.slice(k.length)))).map(f => `\`${f.id}\``);
const fieldsCell = (k) => { const a = fieldsOf(k); return a.length > 4 ? `${a.slice(0, 2).join(' ')} … (${a.length} שדות)` : a.join(' ') || '—'; };

md += `## מקור כל נתון ומה עדיין חסר\n\n`;
md += `> «ממולא מ-PIVO» = יש בקוד ה-resolve מקור שממלא את הנתון (כרטיס, ב"ל, נגזר). «הצהרה» = הלקוח מצהיר בכל הגשה — אין נתון שמחליף אותה. «אין מקור» = הטופס מבקש נתון שאין עליו שדה ב-PIVO.\n`;
md += `> הדוגמה — מלקוחה סינתטית מלאה (FX_FULL + מען למכתבים) ורשומת ב"ל סינתטית, כל התרחישים פעילים.\n\n`;
md += `| נתון | מקטע | סיווג | מקור בדוגמה | מצב בדוגמה | רמז בלבד | שדות בטופס |\n|---|---|---|---|---|---|---|\n`;
const counts = { from_pivo: 0, suggested: 0, declared: 0, signing: 0, none: 0 };
for (const k of keys) {
  const kind = KIND(k); counts[kind]++;
  const st = R.fields[k];
  md += `| ${esc(M.KEY_LABELS[k])} \`${k}\` | ${M.SECTION_OF[k] ?? ''} | ${KIND_LABEL[kind]} | ${esc(st?.sourceLabel || '—')} | ${st?.status ?? '—'} | ${hintKeys.has(k) ? 'כן' : '—'} | ${fieldsCell(k)} |\n`;
}
md += `\n**סיכום:** ${counts.from_pivo} ממולאים מ-PIVO · ${counts.suggested} הצעה מ-PIVO שהלקוח מאשר · ${counts.declared} הצהרה על ההגשה · ${counts.signing} בחתימה · **${counts.none} בלי מקור ב-PIVO**.\n\n`;

md += `### מה עדיין חסר ב-PIVO\n\n`;
for (const k of keys.filter(k => KIND(k) === 'none')) md += `- **${M.KEY_LABELS[k]}** (\`${k}\`) — ${WHY[k] ?? 'אין שדה מתאים בכרטיס.'}\n`;
md += `\nבכל אלה הטופס החכם **שואל בהגשה** (שדה חובה ריק ⇒ «חסר» וחוסם נעילה); החוסר הוא בכרטיס, לא בזרימה.\n`;
md += `\n### הצהרות על ההגשה — נשאלות בכל הגשה (בכוונה, אין מה להשלים ב-PIVO)\n\n`;
for (const k of keys.filter(k => KIND(k) === 'declared')) md += `- ${M.KEY_LABELS[k]} (\`${k}\`)${WHY[k] ? ` — ${WHY[k]}` : ''}\n`;
md += `\n### הצעה מ-PIVO שהלקוח מאשר\n\n`;
for (const k of keys.filter(k => KIND(k) === 'suggested')) md += `- ${M.KEY_LABELS[k]} (\`${k}\`)${WHY[k] ? ` — ${WHY[k]}` : ''}\n`;
md += `\n### מה «מה ב"ל רושם» (207) תורם לטופס\n\n`;
md += `- **מצב משפחתי** — השוואה לכרטיס (סתירה ⇒ חלופה לבחירה, הכרטיס לא נדרס); כשבכרטיס אין מצב — הצעה «נגזר» לאישור.\n`;
md += `- **תיק ניכויים** — השוואה (אפסים מובילים מנורמלים); כשבכרטיס אין תיק — הצעה «נגזר».\n`;
md += `- **חיוב שנתי לפי סיווג** — בדיקת עקביות לטבלת השנתיים: שנה שב"ל חייב בה סיווג שאין בטבלה ⇒ רמז (לא הוספת שורה).\n`;
md += `- **חובת תשלום, כיסוי, חיוב שנתי** — מוצגים ב«מה ב"ל רושם עכשיו» ונשמרים בצילום הנעילה (ראיה למצב שממנו ביקשו את השינוי). אינם שדות בטופס.\n`;
md += `- לא בשימוש בטופס (אין שדה מקביל): תושבות, גבייה/הסדרים, ייצוג, אמצעי חיוב, הודעות, מילואים, תכתובות.\n\n`;

// ─── (1) השדות המודפסים ──────────────────────────────────────────────────────
const sections = [...new Set(T.fields.map(f => f.section))];
for (const s of sections) {
  md += `## ${s}\n\n| מזהה | תווית | עמ' | מלבן (נק') | מודפס | סוג | מקור ב-PIVO | כלל עיצוב | תרחיש | חובה | ולידציה | מקור | אישור לקוח | גלישה |\n|---|---|---|---|---|---|---|---|---|---|---|---|---|---|\n`;
  for (const f of T.fields.filter(x => x.section === s)) {
    md += `| \`${f.id}\` | ${esc(f.label)} | ${f.page} | ${box(f.box)}${f.cells ? ` · ${f.cells.length - 1} תיבות${f.groups ? ` (${f.groups.join('+')})` : ''}` : ''} | ${printed(f)} | ${f.kind}${f.signer ? ` (${f.signer})` : ''} | ${esc(f.source)} | ${esc(f.formatRule)} | ${f.applies === 'always' ? 'תמיד' : f.applies.join(', ')} | ${REQ[f.required]} | ${esc(f.validation ?? '—')} | ${PROV[f.provenance]} | ${f.clientConfirmation ? 'כן' : '—'} | ${OVF[f.overflow]} |\n`;
  }
  md += '\n';
}
md += `## אזורים גלויים שבכוונה אינם ממופים\n\n| מזהה | עמ' | מלבן | מה | למה |\n|---|---|---|---|---|\n`;
for (const u of T.unmapped) md += `| \`${u.id}\` | ${u.page} | ${box(u.box)} | ${esc(u.label)} | ${esc(u.reason)} |\n`;
writeFileSync(join(ROOT, 'docs/forms/btl-6101-inventory.md'), md);
console.log(`docs/forms/btl-6101-inventory.md · ${T.fields.length} שדות · ${keys.length} נתונים (${counts.from_pivo} מ-PIVO · ${counts.suggested} הצעה · ${counts.declared} הצהרה · ${counts.none} בלי מקור) · ${T.unmapped.length} אזורים לא ממופים`);

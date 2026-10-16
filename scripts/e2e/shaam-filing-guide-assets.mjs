// צילומי המדריך «איך מפיקים משע״ם» — עותקים מושחרים באמת מתוך צילומי המקור (docs/evidence/shaam-filing-monitor-2026-10-16).
// ‼ המקור הפנימי לא משתנה. בעותק: שם המשתמש, שם ומספר המייצג, שמות ומספרי תיק של לקוחות ושם איש קשר — מוחלפים בפיקסלים שחורים
//   (כמו רקע המסוף), ואז נבדק שכל אזור מושחר הוא שחור אחיד בקובץ שנכתב. הסימונים (מסגרות/מספרים) — SVG במסך, לא בתמונה.
//   node scripts/e2e/shaam-filing-guide-assets.mjs [--evidence <תיקייה>]
import { readFileSync, writeFileSync, mkdirSync, readdirSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { decodePng, encodePng, fill, isSolid, crop } from './shaam-filing-png.mjs';

const i = process.argv.indexOf('--evidence');
const EVIDENCE = i > 0 ? process.argv[i + 1] : resolve('../../../docs/evidence/shaam-filing-monitor-2026-10-16');
const OUT = resolve('public/guides/shaam-filing');
if (!existsSync(EVIDENCE)) { console.error(`אין תיקיית ראיות: ${EVIDENCE}`); process.exit(1); }
mkdirSync(OUT, { recursive: true });

// [x, y, w, h] בפיקסלים של המקור
const PLAN = {
  '12': { redact: [] },                                                                    // תפריט IDOM — בלי פרטים אישיים
  '17': { redact: [[555, 140, 135, 40]] },                                                 // שם המשתמש
  '18': { redact: [[495, 108, 130, 40]] },
  '19': { redact: [[570, 18, 140, 40], [1025, 55, 150, 38], [745, 228, 510, 352]] },       // משתמש, מספר מייצג, שמות ומספרי תיק
  '20': { redact: [[268, 52, 125, 38], [440, 746, 245, 40]] },                             // משתמש, איש קשר
  '25': { redact: [[362, 52, 140, 40], [535, 748, 245, 40]] },
  '26': { redact: [[258, 32, 130, 40], [995, 207, 120, 40], [465, 207, 150, 40], [745, 417, 295, 40], [1100, 417, 155, 40]] },
  '27': { redact: [[255, 92, 130, 38], [425, 788, 245, 40]] },
  '07': { crop: [0, 30, 1880, 120], redact: [] },                                          // רק סרגל הכלים של המסוף
};

let bad = 0;
const files = readdirSync(EVIDENCE);
for (const [n, p] of Object.entries(PLAN)) {
  const f = files.find(x => x.startsWith(`${n}-`) && x.endsWith('.png'));
  if (!f) { console.log(`  ✗ ${n} — לא נמצא`); bad++; continue; }
  let img = decodePng(readFileSync(join(EVIDENCE, f)));
  if (p.crop) img = crop(img, p.crop);
  for (const r of p.redact) fill(img, r);
  const out = join(OUT, `${n}.png`);
  writeFileSync(out, encodePng(img));
  const back = decodePng(readFileSync(out));
  const solid = p.redact.every(r => isSolid(back, r));
  if (!solid) bad++;
  console.log(`  ${solid ? '✓' : '✗'} ${n}.png ${back.width}×${back.height} · ${p.redact.length} אזורים מושחרים${solid ? ' ונבדקו' : ' — לא שחורים!'}`);
}
process.exit(bad ? 1 : 0);

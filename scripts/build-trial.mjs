// ─── גרסת ניסיון לקריאה — בנייה (src/lib/trialBuild.ts) ─────────────────────
// ‼ בונה את האפליקציה על המסד המדומה בלבד: mode=development (טוען את
// ‎.env.development.local‎ — כתובת מסד שלא מובילה לשום מקום), VITE_TRIAL=true,
// בלי תיקיית public (טפסים רשמיים, מדריכים מצולמים) ובלי דף ההמרה של העובד.
// בסוף — בדיקה שהחבילה לא מכילה כתובת או מפתח של מסד אמיתי. נכשלת ⇒ אין פרסום.
//
//   node scripts/build-trial.mjs [outDir]      (ברירת מחדל: dist-trial)
import { build, loadEnv } from 'vite';
import { readdirSync, readFileSync, statSync, writeFileSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';

const outDir = resolve(process.argv[2] ?? 'dist-trial');
const env = loadEnv('development', process.cwd(), 'VITE_');
if (!/^http:\/\/127\.0\.0\.1:9\/?$/.test(env.VITE_SUPABASE_URL ?? '')) {
  console.error(`‼ VITE_SUPABASE_URL במצב development אינו המסד המנותק (${env.VITE_SUPABASE_URL}). עוצרים.`);
  process.exit(1);
}
if (env.VITE_DEV_AUTO_LOGIN === 'true') { console.error('‼ VITE_DEV_AUTO_LOGIN=true. עוצרים.'); process.exit(1); }

// ‼ גם NODE_ENV: בלי זה vite build משאיר import.meta.env.DEV=false גם ב--mode development,
// וכל שערי ההדגמה נסגרים — הדף נפתח על מסך הכניסה (נמצא בבדיקה 11.10).
process.env.NODE_ENV = 'development';
process.env.VITE_TRIAL = 'true';
process.env.VITE_TRIAL_STAMP = new Date().toLocaleDateString('he-IL', { timeZone: 'Asia/Jerusalem' });

rmSync(outDir, { recursive: true, force: true });
await build({
  mode: 'development',
  base: './',
  logLevel: 'warn',
  build: {
    outDir, emptyOutDir: true, copyPublicDir: false, sourcemap: false, minify: true,
    rollupOptions: { input: { main: 'index.html' } },
  },
});

// ‼ הפרסום דוחה קובץ טקסט עם בתי בקרה גולמיים (ESC וכו׳) ותו ההחלפה U+FFFD. ב-JS הם יכולים להופיע רק בתוך
// מחרוזת, תבנית או ביטוי רגולרי — ושם \uXXXX שקול להם. (pdf.js ו-fontkit מכילים כאלה.)
for (const f of readdirSync(join(outDir, 'assets'))) {
  if (!/\.m?js$/.test(f)) continue;
  const p = join(outDir, 'assets', f);
  const src = readFileSync(p, 'utf8');
  const out = src.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F\uFFFD]/g, c => '\\u' + c.charCodeAt(0).toString(16).padStart(4, '0'));
  if (out !== src) writeFileSync(p, out);
}

// בדיקת אטימות: שום כתובת/מפתח של מסד אמיתי בחבילה.
const prodEnv = loadEnv('production', process.cwd(), 'VITE_');
// ‼ כתובות ומפתחות — לא שם הפרויקט לבד: נתוני ההדגמה מציינים «נלכד מ-staging <ref>» כמקור.
const forbidden = [prodEnv.VITE_SUPABASE_ANON_KEY, 'uoweoqtuiettozagwgdw.supabase', 'evdfxjqrkgugssfrdoxd.supabase', 'supabase.co/rest', 'supabase.co/functions'].filter(Boolean);
const files = [];
const walk = d => { for (const e of readdirSync(d)) { const p = join(d, e); statSync(p).isDirectory() ? walk(p) : files.push(p); } };
walk(outDir);
let bad = 0, total = 0;
for (const f of files) {
  total += statSync(f).size;
  if (!/\.(js|html|css|json)$/.test(f)) continue;
  const s = readFileSync(f, 'utf8');
  for (const x of forbidden) if (s.includes(x)) { console.error(`‼ ${f} מכיל ${x.slice(0, 12)}…`); bad++; }
}
if (bad) { rmSync(outDir, { recursive: true, force: true }); process.exit(1); }

// הדף לפרסום: אותו index.html, עם כותרת ותיאור של גרסת ניסיון.
const idx = join(outDir, 'index.html');
writeFileSync(idx, readFileSync(idx, 'utf8').replace(/<title>[^<]*<\/title>/, '<title>PIVO ידע מס · ניסיון</title>'));
console.log(`✓ ${files.length} קבצים, ${(total / 1048576).toFixed(1)}MB → ${outDir}`);

// הדף לפרסום כ-Artifact פרטי: הפרסום עוטף אותו בשלד משלו (charset, viewport), ולכן רק תוכן
// ה-head הרלוונטי ו-#root. השמות של קובצי assets משתנים בכל בנייה — מפורסמים כ-files.
const head = readFileSync(idx, 'utf8').split('<head>')[1].split('</head>')[0];
const keep = head.split('\n').filter(l => !/<meta charset|<meta name="viewport"|<!--|-->|דף ציבורי|חיצוני מהדף|favicon|<title>/.test(l)).join('\n');
writeFileSync(join(outDir, 'tax-knowledge.html'), `<title>ידע מס PIVO</title>\n${keep.trim()}\n<div id="root"></div>\n`);
const publish = readdirSync(join(outDir, 'assets')).filter(f => !f.startsWith('pdfConverter'));
writeFileSync(join(outDir, 'publish-files.json'), JSON.stringify(Object.fromEntries(publish.map(f => [`assets/${f}`, f.endsWith('.mjs') ? { from: `assets/${f}`, contentType: 'text/javascript' } : `assets/${f}`])), null, 1));
console.log('→ tax-knowledge.html + publish-files.json');

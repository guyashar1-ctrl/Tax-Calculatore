#!/usr/bin/env node
// בונה את המדריך העצמאי (index.html) מצילומי ה-e2e של שלב 1 (scripts/e2e/return-engine-s1.mjs): תמונות מוטמעות כ-base64,
// סימונים לפי מיקומים שנמדדו בזמן הצילום (<name>-<vp>.json). הרצה:
//   node docs/release-guides/2026-10-17-return-engine-s1/build-guide.mjs <תיקיית צילומים> [--commit=<sha>] [--live=yes|pending]
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const SHOTS = process.argv[2];
const arg = (k, d) => (process.argv.find(a => a.startsWith(`--${k}=`))?.split('=')[1] ?? d);
const COMMIT = arg('commit', 'טרם בקומיט');
const LIVE = arg('live', 'pending');
if (!SHOTS) throw new Error('תיקיית צילומים חסרה');

const img = (name) => {
  const p = join(SHOTS, `${name}.png`);
  if (!existsSync(p)) throw new Error('חסר צילום: ' + p);
  return `data:image/png;base64,${readFileSync(p).toString('base64')}`;
};
const boxes = (name) => { const p = join(SHOTS, `${name}.json`); return existsSync(p) ? JSON.parse(readFileSync(p, 'utf8')) : null; };
const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');

function shot(name, alt, marks, opts = {}) {
  const b = boxes(name);
  const W = b?.vw ?? 1280, H = b?.vh ?? 900;
  let badges = '';
  const legend = [];
  marks.forEach((m, i) => {
    const r = b?.boxes?.[m.sel];
    legend.push(`<li><b>${i + 1}</b> ${esc(m.text)}</li>`);
    if (!r) return;
    const cx = (r.x + (m.anchor === 'left' ? 0 : m.anchor === 'right' ? r.w : r.w / 2)) / W * 100;
    const cy = r.y / H * 100;
    badges += `<span class="mk" style="left:${cx.toFixed(2)}%;top:${cy.toFixed(2)}%" aria-hidden="true">${i + 1}</span>`;
    badges += `<span class="ring" style="left:${(r.x / W * 100).toFixed(2)}%;top:${(r.y / H * 100).toFixed(2)}%;width:${(r.w / W * 100).toFixed(2)}%;height:${(r.h / H * 100).toFixed(2)}%" aria-hidden="true"></span>`;
  });
  return `<figure class="fig${opts.phone ? ' phone' : ''}"><button type="button" class="shot" aria-label="הגדלה: ${esc(alt)}"><img src="${img(name)}" alt="${esc(alt)}">${badges}</button>
  ${legend.length ? `<figcaption><ol class="marks">${legend.join('')}</ol></figcaption>` : ''}</figure>`;
}

const html = `<!doctype html><html lang="he" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>הדוח השנתי — מנוע אחד ושורות מקור (שלב 1)</title><style>
:root{--bg:#f6f4ef;--card:#fff;--ink:#1f2328;--ink2:#5a6068;--acc:#e8590c;--line:#e4e0d8;--okbg:rgba(47,125,79,.1);--warnbg:rgba(232,89,12,.09)}
@media (prefers-color-scheme:dark){:root{--bg:#17181a;--card:#222326;--ink:#ecebe8;--ink2:#a9aaad;--line:#34363a;--okbg:rgba(80,180,120,.14);--warnbg:rgba(232,89,12,.16)}}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font:16px/1.65 system-ui,"Segoe UI",Arial,sans-serif}
main{max-width:980px;margin:0 auto;padding:24px 16px 56px}h1{font-size:1.55rem;line-height:1.3;margin:.2em 0}h2{font-size:1.12rem;margin:0 0 .4em}
.meta{color:var(--ink2);font-size:.9rem}.box{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:16px 18px;margin:14px 0}
.why{border-inline-start:4px solid var(--acc)}nav{display:flex;gap:8px;flex-wrap:wrap;margin:22px 0 8px}
nav button{font:inherit;border:1px solid var(--line);background:var(--card);color:var(--ink);border-radius:999px;padding:8px 14px;cursor:pointer;min-height:44px}
nav button[aria-current=true]{background:var(--acc);border-color:var(--acc);color:#fff}
nav button:focus-visible,.shot:focus-visible,.pager button:focus-visible{outline:3px solid var(--acc);outline-offset:2px}
.fig{margin:14px 0 0}.shot{position:relative;display:block;width:100%;padding:0;border:1px solid var(--line);border-radius:8px;cursor:zoom-in;background:#fff;overflow:visible}
.shot img{display:block;width:100%;height:auto;border-radius:8px}
.mk{position:absolute;transform:translate(-50%,-110%);min-width:26px;height:26px;padding:0 7px;border-radius:999px;background:var(--acc);color:#fff;font:700 14px/26px system-ui,sans-serif;box-shadow:0 1px 4px rgba(0,0,0,.35);pointer-events:none}
.ring{position:absolute;border:2.5px solid var(--acc);border-radius:6px;box-shadow:0 0 0 2px rgba(255,255,255,.75);pointer-events:none}
.phones{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px;align-items:start}@media(max-width:700px){.phones{grid-template-columns:1fr}}
.fig.phone .shot{max-width:390px;margin:0 auto}
figcaption{margin-top:8px}.marks{margin:0;padding:0;list-style:none;display:grid;gap:4px;font-size:.93rem}.marks b{display:inline-grid;place-items:center;min-width:24px;height:24px;border-radius:999px;background:var(--acc);color:#fff;font-size:13px;margin-inline-end:6px}
.note{color:var(--ink2);font-size:.92rem}.exp{background:var(--okbg);border-radius:8px;padding:8px 12px;margin-top:10px}
.warn{background:var(--warnbg);border-radius:8px;padding:8px 12px;margin-top:10px}
.zoom{position:fixed;inset:0;background:rgba(0,0,0,.85);display:none;align-items:center;justify-content:center;padding:16px;z-index:9;cursor:zoom-out}
.zoom.on{display:flex}.zoom img{max-width:100%;max-height:100%;background:#fff}ul,ol{margin:.3em 0;padding-inline-start:1.3em}li{margin:.3em 0}
.pager{display:flex;justify-content:space-between;gap:8px;margin-top:14px}.pager button{font:inherit;min-height:44px;padding:8px 16px;border-radius:10px;border:1px solid var(--line);background:var(--card);color:var(--ink);cursor:pointer}
.step[hidden]{display:none}table{border-collapse:collapse;width:100%;font-size:.93rem}td{padding:6px 8px;border-top:1px solid var(--line);vertical-align:top}td:first-child{color:var(--ink2);width:34%}
code{font-size:.9em}
</style></head><body><main>
<p class="meta">PIVO · מדריך שחרור · 17.10.2026 · צילומים מסביבת הבדיקות (staging, הדמיית דפדפן — לא מכשיר אמיתי) עם לקוח דמה «דוד ורחל» · קוד: ${esc(COMMIT)} · ${LIVE === 'yes' ? '<b>באתר (crm.yasharcpa.co.il), מיגרציות 233 ו-257 בייצור</b>' : '<b>עדיין לא באתר</b> — ב-staging בלבד; מיגרציות 233 ו-257 ממתינות לאישורך לייצור'}</p>
<h1>הדוח השנתי — מנוע אחד, מקור לכל שדה, ואיתור שדה לפי קוד (שלב 1)</h1>

<div class="box why"><h2>מה ביקשת ומה קיבלת</h2>
<p>ביקשת שכל סכום בדוח יהיה מורכב מ<b>שורות מקור</b> — סכום + המסמך שממנו נלקח + השאלה בשאלון + האדם + השנה — ושהשדה בטופס 1301 יהיה סיכום מחושב, לא מספר שמקלידים. ועוד: שהדוח ייפתח בתוך שורת הבקשה ב«בקשות» (לא מסך נפרד), שתהיה בקרה «שדה בלי מקור», ושאיתור שדה לפי קוד במפת הטופס יראה את הערכים של הלקוח.</p>
<p>קיבלת: מנוע הדוח מחובר (מיגרציה 233 ב-staging), מרשם תבניות לחמשת המסמכים הנפוצים (106, אישור ב״ל שנתי, 867, אישורי קופה/ביטוח, רווח והפסד), עורך הזנה בסיסי בתוך שורת הבקשה, «לאן זה הלך» אחרי כל שמירה, «ממה זה מורכב» על כל שדה, בקרות «שדה בלי מקור» ו«Σ שורות = שדה», ערך ידני מסומן «#», ומפת הטופס שנפתחת מהבקשה עם ערכי הדוח של הלקוח.</p>
<p class="note">מסך הליווי המלא קובץ-אחר-קובץ (עם המסמך לצד השדות), אישור התקבולים מב״ל, PayBox ומשרד הביטחון — שלב 2. ניתוח אוטומטי של PDF — לא עכשיו (לפי התוכנית).</p></div>

<nav aria-label="צעדים">
<button type="button" data-go="1" aria-current="true">1 · הבקשה</button><button type="button" data-go="2">2 · הזנה מהמסמך</button><button type="button" data-go="3">3 · לאן זה הלך</button><button type="button" data-go="4">4 · ממה זה מורכב</button><button type="button" data-go="5">5 · מפת הטופס</button><button type="button" data-go="6">6 · טלפון</button>
</nav>

<section class="step box" data-step="1"><h2>1 · «בקשות» ← «דוח שנתי 2025» — הדוח נפתח בתוך השורה</h2>
<p>אצל לקוח עם בקשת «דוח שנתי»: בלשונית «בקשות» פותחים את השורה. למעלה — המס לשנה, נוכה במקור, מקדמות ויתרה; לפני שהוזן מסמך הכול «חסר» (לא אפס). «מי בדוח» — בן/בת הזוג נכלל/ת כשיש לו/ה הכנסה בתיק.</p>
${shot('panel-open-desktop', 'שורת הבקשה פתוחה עם הדוח השנתי', [
  { sel: '#ar-title', text: 'הדוח השנתי — בתוך שורת הבקשה, לא מסך נפרד' },
  { sel: '[data-ar-sources] > summary', text: '«מסמכים ושורות מקור» — כאן מזינים' },
  { sel: '[data-ar-open-map]', text: '«פתח במפת הטופס» — הטופס הרשמי עם ערכי הלקוח (צעד 5)' },
])}
<div class="exp">צפוי: הכותרת «דוח 2025 · דוד ורחל», «חסרים נתוני הכנסה», ומקטע «מסמכים ושורות מקור».</div>
</section>

<section class="step box" data-step="2" hidden><h2>2 · הזנה מהמסמך — «מה לוקחים ממנו» ואיפה זה בטופס 106</h2>
<p>בוחרים סוג מסמך («הזנה מהנייר») או לוחצים «הזן מהמסמך» על מסמך שהלקוח העלה. לכל שורה: מה לוקחים, איפה זה במסמך, ולאן זה הולך בטופס. האימות בזמן ההזנה: סכום שלילי, מס גדול מההכנסה, מבוטחת גדולה ממשכורת — חוסמים את השמירה עם הסבר.</p>
${shot('entry-106-desktop', 'עורך ההזנה של טופס 106', [
  { sel: '[data-ar-editor]', text: 'תבנית 106: של מי, איזה מעסיק, ושש השורות שלוקחים' },
  { sel: '[data-ar-line="106.gross"]', text: 'הכנסה חייבת — «שורות 158/172» ← 158 / 172' },
  { sel: '[data-ar-save]', text: '«שמור שורות מקור» — נכנסות לטיוטה מיד (אישור אחד שלך בסוף)' },
])}
<div class="warn">נבדק: 1,000 הכנסה עם 5,000 מס ⇒ «המס שנוכה גדול מההכנסה — לבדוק את הטופס», השמירה חסומה.</div>
</section>

<section class="step box" data-step="3" hidden><h2>3 · «לאן זה הלך» — כל שורה והשדה שקיבל אותה</h2>
<p>אחרי «שמור» רואים מיד לאן כל שורה נכנסה: 158 ← 152,855 · 042 ← 15,000 · 244 ← 140,000. המסמך מופיע ברשימה כ«הוזן · 3 שורות». שמירה חוזרת של אותו מסמך מחליפה את שורותיו (הקודמות נשמרות בהיסטוריה כ«הוחלפו»); אישור מתקן מחליף גם את שורות המסמך הקודם.</p>
${shot('landed-106-desktop', 'לאן זה הלך אחרי שמירת 106', [
  { sel: '[data-ar-landed]', text: '«לאן זה הלך» — הקודים והסכומים שהשורות הזינו' },
  { sel: '[data-ar-doc="form106"]', text: 'המסמך ברשימה: מי, איזה מעסיק, «הוזן»' },
])}
${shot('docs-entered-desktop', 'ארבעה מסמכים הוזנו', [
  { sel: '[data-ar-sources] > summary', text: '4 מסמכים · 4 הוזנו · 0 להזנה' },
])}
<div class="exp">אישור ב״ל: ביטוח לאומי ובריאות — שתי שורות נפרדות; רק הב״ל נכנס ל-030/089, הבריאות נשמרת ולא נכנסת לדוח.</div>
</section>

<section class="step box" data-step="4" hidden><h2>4 · «טיוטת 1301 לפי קודים» ← «ממה זה מורכב»</h2>
<p>בטבלת השדות, על כל סכום — «ממה זה מורכב»: השורות שמרכיבות אותו, עם המסמך, של מי, השאלה בשאלון, השנה, ומי הזין ומתי. 042 (מס שנוכה ממשכורת) = 19,979 ₪ — שתי שורות: 106 של דוד (15,000) ו-106 של רחל (4,979). ערך ידני מעל חישוב מסומן «#» ומנומק.</p>
${shot('breakdown-042-desktop', 'ממה מורכב שדה 042', [
  { sel: '[data-ar-field="042"]', text: '042 = 19,979 ₪ · ✓ אומת מול מסמך' },
  { sel: '[data-ar-breakdown]', text: 'שתי השורות: סכום · טופס 106 · של מי · השאלה · השנה · מי הזין' },
])}
<div class="exp">ב«נספחים ובקרות»: ✓ «שדה בלי מקור» — לכל סכום יש שורות מקור, כלל חישוב, השלמה או ערך ידני מנומק; ✓ «סכום שורות המקור = השדה». «שמור טיוטה» פותח גרסה 1 (מיגרציה 233) עם העובדות שנכנסו.</div>
</section>

<section class="step box" data-step="5" hidden><h2>5 · «פתח במפת הטופס» — הטופס הרשמי עם ערכי הלקוח, ואיתור שדה לפי קוד</h2>
<p>מהבקשה נפתחת מפת הטופס (ידע ← דוח שנתי) מול התיק של הלקוח: שדות שיש להם סכום בדוח מסומנים בירוק מלא; «אתר שדה — קוד או שם»: 158 ⇒ «בדוח: 152,900 ₪»; לחיצה על השדה — «בדוח 2025: 152,900 ₪» ו«ממה זה מורכב» (טופס 106). קריאה בלבד — המפה לא כותבת לתיק.</p>
${shot('map-158-desktop', 'מפת הטופס עם ערכי הדוח של הלקוח ואיתור 158', [
  { sel: '.fm-ctx', text: 'מוצג מול התיק של דוד · ערכי הדוח לשנת 2025 על הטופס' },
  { sel: '[data-fm-hit-value]', text: 'איתור 158 ⇒ «בדוח: 152,900 ₪»' },
  { sel: '[data-fm-return-value]', text: 'כרטיס השדה: הסכום בדוח + ממה הוא מורכב' },
])}
</section>

<section class="step box" data-step="6" hidden><h2>6 · בטלפון — אותו מסלול</h2>
<div class="phones">
${shot('panel-open-mobile', 'טלפון: שורת הבקשה עם הדוח', [{ sel: '#ar-title', text: 'הדוח בתוך השורה' }], { phone: true })}
${shot('breakdown-042-mobile', 'טלפון: ממה מורכב 042', [{ sel: '[data-ar-breakdown]', text: 'שורות המקור של 042' }], { phone: true })}
</div>
<div class="phones">
${shot('entry-106-mobile', 'טלפון: עורך ההזנה', [{ sel: '[data-ar-save]', text: 'שמירה' }], { phone: true })}
${shot('map-158-mobile', 'טלפון: מפת הטופס עם ערכי הדוח', [{ sel: '[data-fm-return-value]', text: 'בדוח 2025 + ממה מורכב' }], { phone: true })}
</div>
<p class="note">הדמיית דפדפן (Chrome, 390×844), לא מכשיר אמיתי. באותו מסלול 30/30 במחשב ובטלפון.</p>
</section>

<div class="pager"><button type="button" id="prev">→ הקודם</button><button type="button" id="next">הבא ←</button></div>

<div class="box"><h2>מה נבדק</h2>
<table>
<tr><td>דפדפן מול staging (מסד אמיתי)</td><td><code>scripts/e2e/return-engine-s1.mjs</code>: בקשה ← הדוח בשורה ← אימות הזנה ← 4 מסמכים (106 ×2, רו״ה, אישור ב״ל) ← «לאן זה הלך» ← 042 וממה מורכב ← בקרות ← «שמור טיוטה» (גרסה 1) ← עריכה חוזרת («הוחלפו») ← מפת הטופס עם הערכים. 30/30 במחשב 1280 ובטלפון 390. 0 שגיאות קונסול, 0 מיילים, 0 שאריות.</td></tr>
<tr><td>מיגרציות</td><td>233 + 257 ב-staging (<code>scripts/sql/233/apply-staging.mjs</code>: גופים זהים לקבצים, anon חסום, כתיבה ישירה לטבלה נשללה). בבידוד (PGlite): <code>scripts/sql/233/test-233-257.pglite.mjs</code> 36/36.</td></tr>
<tr><td>יחידה</td><td>אורקל תרגיל 2023 מהקורס («עמרי ונועה ברק»): 158/172/042/244/245/170/239/089/217/317/043/040/180/036, שורות 042, בקרות, אינדקס קודים, ערך ידני «#», מתקן מול נוסף — <code>exercise2023.test.ts</code>. כל החבילה: 1938/0 (<code>npm run test:unit</code>), tsc נקי, build.</td></tr>
</table></div>

<div class="box"><h2>מה לא נעשה / לאישורך</h2>
<ul>
<li><b>ייצור</b> — 233 ו-257 ב-staging בלבד; ההעלאה לאתר ולמסד הייצור ממתינה לאישורך. בעלייה: גם פריסה מחדש של פונקציית הגיבוי השבועי (הטבלה החדשה ב-scope).</li>
<li><b>שלב 2</b> — מסך הליווי קובץ-אחר-קובץ (המסמך לצד השדות), אישור תקבולים מב״ל (אבטלה 194), PayBox (040 «לבדיקה»), משרד הביטחון, ילד נכה, חוזה שכירות, מקדמות — לפי התוכנית.</li>
<li><b>ערך ידני «#»</b> — משנה את השדה בטופס ומנומק; חישוב המס לא משתנה ממנו (מצוין במסך). עורך להזנת ערך ידני — עדיין לא במסך (המבנה והבדיקות קיימים).</li>
<li>שדה 030/089 מקבל את מלוא דמי הב״ל ששולמו (פחות החזרים) — «לבדיקה לכל שנה» לפי התוכנית; הכלל של 52% לא הוחל כאן.</li>
<li>מכשיר אמיתי ומצב כהה — לא נבדקו.</li>
</ul></div>
</main>
<div class="zoom" role="dialog" aria-label="תמונה מוגדלת" tabindex="-1"><img alt=""></div>
<script>
(function(){
  var steps=[].slice.call(document.querySelectorAll('.step')),navs=[].slice.call(document.querySelectorAll('nav button')),cur=1;
  function go(n){cur=Math.max(1,Math.min(steps.length,n));steps.forEach(function(s){s.hidden=+s.dataset.step!==cur});navs.forEach(function(b){b.setAttribute('aria-current',String(+b.dataset.go===cur))});window.scrollTo({top:0,behavior:'smooth'})}
  navs.forEach(function(b){b.addEventListener('click',function(){go(+b.dataset.go)})});
  document.getElementById('prev').addEventListener('click',function(){go(cur-1)});
  document.getElementById('next').addEventListener('click',function(){go(cur+1)});
  var z=document.querySelector('.zoom'),zi=z.querySelector('img');
  document.querySelectorAll('.shot').forEach(function(s){s.addEventListener('click',function(){var i=s.querySelector('img');zi.src=i.src;zi.alt=i.alt;z.classList.add('on');z.focus()})});
  z.addEventListener('click',function(){z.classList.remove('on')});
  document.addEventListener('keydown',function(e){if(e.key==='Escape')z.classList.remove('on');else if(!z.classList.contains('on')&&e.target.tagName!=='INPUT'){if(e.key==='ArrowLeft')go(cur+1);if(e.key==='ArrowRight')go(cur-1)}});
})();
</script></body></html>`;
writeFileSync(join(here, 'index.html'), html);
console.log('index.html', (html.length / 1024 / 1024).toFixed(2), 'MB');

#!/usr/bin/env node
// בונה את המדריך העצמאי (index.html) מצילומי ה-e2e: תמונות מוטמעות כ-base64, סימונים לפי מיקומים שנמדדו
// בזמן הצילום (<name>-<vp>.json של scripts/e2e/form-821-live.mjs). הרצה:
//   node docs/release-guides/2026-10-19-form-821-no-stamp-saved/build-guide.mjs <תיקיית צילומים> [--commit=<sha>] [--live=yes|pending]
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

/** צילום עם סימונים ממוספרים: כל סימון = בורר שנמדד + הסבר. המיקום באחוזים של התמונה. */
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
<title>טופס 821 חתום — בלי חותמת, ישר למסמכים</title><style>
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
label.chk{display:flex;gap:8px;align-items:center;margin-top:10px;font-size:.95rem;min-height:44px}
.zoom{position:fixed;inset:0;background:rgba(0,0,0,.85);display:none;align-items:center;justify-content:center;padding:16px;z-index:9;cursor:zoom-out}
.zoom.on{display:flex}.zoom img{max-width:100%;max-height:100%;background:#fff}ul,ol{margin:.3em 0;padding-inline-start:1.3em}li{margin:.3em 0}
.pager{display:flex;justify-content:space-between;gap:8px;margin-top:14px}.pager button{font:inherit;min-height:44px;padding:8px 16px;border-radius:10px;border:1px solid var(--line);background:var(--card);color:var(--ink);cursor:pointer}
.step[hidden]{display:none}table{border-collapse:collapse;width:100%;font-size:.93rem}td{padding:6px 8px;border-top:1px solid var(--line);vertical-align:top}td:first-child{color:var(--ink2);width:34%}
</style></head><body><main>
<p class="meta">PIVO · מדריך שחרור · 19.10.2026 · צילומים מסביבת הבדיקות (staging, הדמיית דפדפן — לא מכשיר אמיתי) עם לקוח דמה «דוד בדיקה» · קוד: ${esc(COMMIT)} · ${LIVE === 'yes' ? '<b>באתר (crm.yasharcpa.co.il), מיגרציה 259 ו-portal-signed-form בייצור</b>' : '<b>עדיין לא באתר</b> — ממתין לאישורך; מיגרציה 259 ו-portal-signed-form ב-staging בלבד'}</p>
<h1>טופס 821 שהלקוח חותם: בלי החותמת שלך, ונשמר במסמכים של הלקוח ברגע החתימה</h1>

<div class="box why"><h2>מה ביקשת ומה קיבלת</h2>
<ul>
<li><b>«נכון לעכשיו אני לא רוצה חותמת שלי»</b> — החותמת כבר לא נכנסת ל«הצהרת המייצג». התיבה «חתימה וחותמת המייצג» נשארת ריקה, ואם תרצה, תחתום או תחתים בעצמך. השם שלך והתאריך נשארים. ייפוי הכוח לא השתנה.</li>
<li><b>«שהמסמכים כמו אלה ישמרו במסמכים של הלקוח»</b> — עד עכשיו הקובץ החתום נוצר רק כשפתחת את הטופס ב«בקשות», ולכן לא היה במסמכים. עכשיו הוא נשמר ב«מסמכים» ברגע שהלקוח לוחץ «חתימה ושליחה למשרד», עם התווית «מסמך עסקי». כך גם בטופס 4440.</li>
<li><b>אם השמירה מהדף של הלקוח נכשלת</b> (למשל אם החיבור שלו נפל), המשרד בונה את הקובץ כמו קודם כשאתה פותח את הטופס. אין קובץ כפול.</li>
</ul></div>

<nav aria-label="צעדים">
<button type="button" data-go="1" aria-current="true">1 · במסמכים מיד</button>
<button type="button" data-go="2">2 · בלי חותמת</button>
<button type="button" data-go="3">3 · בטופס ב«בקשות»</button>
</nav>

<section class="step box" data-step="1"><h2>1 · הלקוח חתם, והקובץ כבר ב«מסמכים»</h2>
<p>הלקוח מילא וחתם בדף האישי. בלי לפתוח שום דבר: כרטיס הלקוח ← לשונית «מסמכים».</p>
${shot('c0-office-documents-desktop', 'כרטיס הלקוח, לשונית מסמכים — הטופס החתום כבר שם', [
  { sel: '[data-guide="doc821"]', text: '«רישום עוסק במע״מ (821) — חתום בדף האישי», קובץ PDF, התווית «מסמך עסקי» ותאריך החתימה' },
])}
<p class="exp">צפוי: השורה מופיעה מיד אחרי החתימה (בבדיקה: לפני שמישהו במשרד פתח את הטופס).</p>
<div class="phones">${shot('c0-office-documents-mobile', 'בטלפון: אותה שורה במסמכים', [
  { sel: '[data-guide="doc821"]', text: 'אותו מסמך, בתצוגת טלפון' },
], { phone: true })}</div>
<label class="chk"><input type="checkbox"> בדקתי: הקובץ במסמכים בלי לפתוח את הטופס</label>
</section>

<section class="step box" data-step="2" hidden><h2>2 · בקובץ החתום: השם והתאריך, בלי החותמת</h2>
<p>תחתית עמוד 1 של הקובץ שנשמר (נבנה בדף של הלקוח ברגע החתימה):</p>
${shot('pdf-declaration-desktop', 'תחתית טופס 821 החתום — הצהרת המייצג', [
  { sel: 'repName', text: '«שם המייצג» — השם מ«פרטי המשרד» (כאן «רו״ח בדיקה» של חשבון הבדיקה), והתאריך לידו' },
  { sel: 'stampBox', text: '«חתימה וחותמת המייצג» — ריק. כאן תחתום או תחתים בעצמך, אם תרצה' },
])}
<p class="note">חתימת הלקוח נמצאת בתיבה שלו («חתימה וחותמת» בשורה שמעל); הבדיקה מדדה שהדיו כולו בתוך התיבה.</p>
<label class="chk"><input type="checkbox"> בדקתי: אין חותמת, יש שם ותאריך</label>
</section>

<section class="step box" data-step="3" hidden><h2>3 · הטופס ב«בקשות»: אין יותר שאלת «הפקה בלי החותמת»</h2>
<p>«בקשות» ← השורה של 821. ההודעה «הקובץ החתום נשמר במסמכים של…» כבר שם, ואין כפתור «הפקה בלי החותמת».</p>
${shot('c1-office-signed-desktop', 'הטופס החתום ב«בקשות»', [
  { sel: '.cfp-status', text: 'המצב: נחתם, ותאריך החתימה' },
])}
<p class="exp">צפוי: «סימון כהוגש» פעיל כרגיל. אם הלקוח חתם ממש עכשיו והקובץ עוד בדרך, תופיע לשתי דקות לכל היותר השורה «הלקוח חתם עכשיו — הקובץ החתום נשמר במסמכי הלקוח…».</p>
<label class="chk"><input type="checkbox"> בדקתי: אין שאלת חותמת</label>
</section>

<div class="pager"><button type="button" id="prev">→ הקודם</button><button type="button" id="next">הבא ←</button></div>

<div class="box"><h2>מה נבדק</h2>
<table>
<tr><td>דפדפן מול staging (מסד אמיתי)</td><td><code>scripts/e2e/form-821-live.mjs</code>: המשרד פותח 821, הלקוח ממלא וחותם בדף האישי ⇒ <b>מיד</b> יש שורה במסמכים, קובץ באחסון, והאירוע «נשמר מהדף האישי»; «מסמכים» מציג אותו; במשרד אין «הפקה בלי החותמת»; החתימה בתיבה. 44/44 במחשב (1280) ו-44/44 בטלפון (390, הדמיה). 0 מיילים, 0 שאריות.</td></tr>
<tr><td>שרת</td><td>מיגרציה 259 ב-staging: שם המייצג לדף של הלקוח, ושתי פונקציות שמירה שרק השרת יכול להפעיל (הדף לא ניגש אליהן ישירות). הפונקציה portal-signed-form נפרסה ל-staging: מקבלת רק PDF, רק לטופס שנחתם ועוד אין לו קובץ, ולא מחליפה קובץ קיים.</td></tr>
<tr><td>קוד</td><td>tsc נקי · unit 1965/0 (אחרי מיזוג master) · build.</td></tr>
${LIVE === 'yes' ? '<tr><td>ייצור (19.10, בדיקה חיה)</td><td>לקוח בדיקה במשרד הבדיקה (לא בחשבון שלך), בלי כתובת מייל: המשרד פתח 821, הלקוח מילא וחתם <b>באתר עצמו</b> ⇒ תוך 6 שניות הקובץ במסמכים («מסמך עסקי», נבנה בדף הלקוח). בקובץ: שם המייצג ותאריך, חתימת הלקוח, <b>בלי חותמת</b>. 0 מיילים; לקוח הבדיקה, הקובץ וההתראה נמחקו.</td></tr>' : ''}
</table></div>

<div class="box"><h2>מה לא נעשה / לידיעתך</h2>
<ul>
${LIVE === 'yes' ? '<li><b>מסך המשרד באתר</b> (לשונית «מסמכים» ו«בקשות») נבדק ב-staging; בייצור נבדק הקובץ במסד ובאחסון, לא דרך המסך שלך.</li>' : '<li><b>ייצור:</b> ממתין לאישורך — מיגרציה 259, הפונקציה portal-signed-form והאתר.</li>'}
<li><b>הקובץ של «ויסמרק» מ-17.10</b> נשמר עוד עם החותמת (זו גרסה חתומה, לא משנים אותה בשקט). אם תרצה עותק בלי חותמת — זו פעולה נפרדת.</li>
<li><b>הקובץ נבנה בדפדפן של הלקוח</b> מאותם פרטים שהוא ראה וחתם עליהם. לפני ההגשה עוברים עליו כרגיל.</li>
<li><b>טלפון אמיתי</b> לא נבדק — הדמיית דפדפן בלבד.</li>
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

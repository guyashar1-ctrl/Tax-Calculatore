#!/usr/bin/env node
// בונה את המדריך העצמאי (index.html) מצילומי ה-e2e: תמונות מוטמעות כ-base64, סימונים לפי מיקומים שנמדדו
// בזמן הצילום (<name>-<vp>.json של scripts/e2e/id-upload-flex.mjs). הרצה:
//   node docs/release-guides/2026-10-17-id-upload-flex/build-guide.mjs <תיקיית צילומים> [--commit=<sha>] [--live=yes|pending]
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
<title>צילום תעודת זהות — העלאה גמישה</title><style>
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
<p class="meta">PIVO · מדריך שחרור · 17.10.2026 · צילומים מסביבת הבדיקות (staging, הדמיית דפדפן — לא מכשיר אמיתי) עם לקוח דמה «דוד» ו«רחל» · קוד: ${esc(COMMIT)} · ${LIVE === 'yes' ? '<b>באתר (crm.yasharcpa.co.il), מיגרציה 257 בייצור</b>' : '<b>עדיין לא באתר</b> — ממתין לאישורך; מיגרציה 257 ב-staging בלבד'}</p>
<h1>צילום תעודת זהות — העלאה גמישה: תמונה אחת של הכול, או כמה, והמערכת בודקת שלא חסר צד</h1>

<div class="box why"><h2>מה ביקשת ומה קיבלת</h2>
<ul>
<li><b>מה ביקשת (16.10):</b> «טעות חמורה — לקוח שרוצה להעלות קדמי, אחורי וספח בתמונה אחת? או קדמי וספח יחד והאחורי בנפרד?» — שלוש התיבות הקבועות (קדמי / אחורי / ספח) ירדו.</li>
<li><b>אזור העלאה אחד לכל אדם:</b> «צלמו או העלו איך שנוח: תמונה אחת של הכול, או כמה תמונות». מצלמה, גלריה או קובץ PDF; כמה תמונות בבת אחת.</li>
<li><b>אחרי כל תמונה — מה היא:</b> בחירה סגורה: צד קדמי / צד אחורי / ספח / קדמי + ספח יחד / הכול יחד. ברירת המחדל לפי הסדר (ראשונה = קדמי, שנייה = אחורי, שלישית = ספח; קובץ PDF = «הכול יחד»), ואפשר לשנות.</li>
<li><b>בדיקה שהסט שלם לפני השליחה:</b> שבב «עוד חסר: אחורי, ספח» עד שיש קדמי + אחורי + ספח בכל שילוב; «אישור ושליחה» פעיל רק אז. רישיון נהיגה: קדמי + אחורי. דרכון: עמוד התמונה.</li>
<li><b>במשרד:</b> הקובץ נשמר בתיקיית האדם כ-PDF אחד לפי הסדר (קדמי, אחורי, ספח), עם ההרכב ליד הקובץ — «צילום · קדמי+ספח · אחורי» במרכז הייצוג ובהערת המסמך. אותו בוחר גם בטופס הייצוג, בדף של בן/בת הזוג ובהעלאה מהמשרד.</li>
</ul></div>

<nav aria-label="צעדים">
<button type="button" data-go="1" aria-current="true">1 · הדף של הלקוח</button>
<button type="button" data-go="2">2 · מה חסר</button>
<button type="button" data-go="3">3 · הסט שלם</button>
<button type="button" data-go="4">4 · הכול בתמונה אחת</button>
<button type="button" data-go="5">5 · במשרד</button>
<button type="button" data-go="6">6 · בטלפון וכהה</button>
</nav>

<section class="step box" data-step="1"><h2>1 · הדף של הלקוח: «מסמכים שביקשנו» ← «צילום תעודת זהות» ← «העלאה»</h2>
<p>במקום שלוש תיבות — אזור אחד עם הסבר קצר ושני כפתורים: «צילום» (המצלמה בטלפון) ו«מהגלריה או קובץ» (כמה תמונות יחד, או PDF). בפריט שמקבל גם רישיון — בחירה «תעודת זהות / רישיון נהיגה» שקובעת מה נדרש.</p>
${shot('portal-empty-desktop', 'הדף של הלקוח — אזור ההעלאה לפני שצורף משהו', [
  { sel: '[data-testid="id-flex-picker"] .idf-lead', text: 'ההסבר: «צלמו או העלו איך שנוח: תמונה אחת של הכול, או כמה תמונות…»' },
  { sel: '[data-testid="id-flex-picker"] .idf-kind', text: 'מה מצלמים — תעודת זהות (ברירת מחדל) או רישיון נהיגה' },
  { sel: '[data-testid="id-flex-picker"] .idf-add', text: '«צילום» / «מהגלריה או קובץ» — אותו אזור לכל התמונות' },
  { sel: '[data-testid="id-confirm"]', text: '«אישור ושליחה» כבוי עד שהסט שלם' },
])}
<p class="exp">צפוי: שום דבר לא נשלח עד האישור. לחיצה על «צילום» בטלפון פותחת את המצלמה; «מהגלריה או קובץ» מאפשר לבחור כמה תמונות יחד.</p>
<label class="chk"><input type="checkbox"> בדקתי: אזור אחד, בלי תיבות קבועות</label>
</section>

<section class="step box" data-step="2" hidden><h2>2 · תמונה אחת — ומה עוד חסר</h2>
<p>אחרי התמונה הראשונה מופיעות תמונה ממוזערת ובחירה «מה בתמונה?» (ברירת המחדל: צד קדמי). למטה שבב צהוב «עוד חסר: אחורי, ספח», והאישור עדיין כבוי.</p>
${shot('portal-missing-desktop', 'תמונה ראשונה — «צד קדמי», ו«עוד חסר: אחורי, ספח»', [
  { sel: '[data-testid="id-flex-picker"] .idf-files', text: 'התמונה הממוזערת, ולידה «מה בתמונה?» — רשימה סגורה' },
  { sel: '[data-testid="idf-tag"]', text: 'צד קדמי / צד אחורי / ספח / קדמי + ספח יחד / הכול יחד' },
  { sel: '[data-testid="idf-missing"]', text: '«עוד חסר: אחורי, ספח» — מה שעוד צריך' },
  { sel: '[data-testid="id-confirm"]', text: 'כבוי עד שהכול שם' },
])}
<p class="exp">צפוי: מחליפים את הבחירה ל«קדמי + ספח יחד» ⇒ השבב משתנה ל«עוד חסר: אחורי». הסרת תמונה מחזירה את החוסר.</p>
<label class="chk"><input type="checkbox"> בדקתי: השבב אומר בדיוק מה חסר</label>
</section>

<section class="step box" data-step="3" hidden><h2>3 · קדמי + ספח בתמונה אחת, האחורי בנפרד — הסט שלם</h2>
<p>התמונה הראשונה סומנה «קדמי + ספח יחד», השנייה קיבלה אוטומטית «צד אחורי» (מה שחסר). השבב הופך לירוק «הסט שלם: קדמי, אחורי וספח» ו«אישור ושליחה» נפתח. באישור נבנה PDF אחד (עמוד 1: קדמי+ספח, עמוד 2: אחורי) והפריט בדף נסגר.</p>
${shot('portal-complete-desktop', 'שתי תמונות — «קדמי + ספח יחד» ו«צד אחורי» — הסט שלם', [
  { sel: '.idf-file:nth-of-type(1) select', text: 'הראשונה: «קדמי + ספח יחד»' },
  { sel: '.idf-file:nth-of-type(2) select', text: 'השנייה: «צד אחורי» — ברירת המחדל לפי מה שחסר' },
  { sel: '[data-testid="idf-complete"]', text: '«✓ הסט שלם: קדמי, אחורי וספח»' },
  { sel: '[data-testid="id-confirm"]', text: '«אישור ושליחה» פעיל' },
])}
${shot('portal-done-desktop', 'אחרי האישור — הפריט בדף מסומן ✓', [])}
<p class="exp">צפוי במשרד: מסמך אחד (PDF) בתיק הלקוח, בתיקיית האדם, עם ההערה «עמודים: קדמי+ספח · אחורי». הרישום על בקשת הייצוג נעשה מעצמו (כולל אישור הלקוח, כמו קודם).</p>
<label class="chk"><input type="checkbox"> בדקתי: קדמי+ספח ואחורי ⇒ שלם, ונשלח כקובץ אחד</label>
</section>

<section class="step box" data-step="4" hidden><h2>4 · תמונה אחת של הכול</h2>
<p>לבת הזוג צולמה תמונה אחת של קדמי, אחורי וספח יחד. בוחרים «הכול יחד (קדמי, אחורי וספח)» — והסט שלם מיד. קובץ PDF סרוק מקבל את הבחירה הזו כברירת מחדל.</p>
${shot('portal-all-in-one-desktop', 'תמונה אחת מתויגת «הכול יחד» — הסט שלם', [
  { sel: '[data-testid="idf-tag"]', text: '«הכול יחד (קדמי, אחורי וספח)»' },
  { sel: '[data-testid="idf-complete"]', text: 'שלם — אפשר לשלוח' },
])}
<p class="exp">צפוי: אחרי שני הפריטים הבקשה «מסמכים שביקשנו» מושלמת והכדור חוזר למשרד.</p>
<label class="chk"><input type="checkbox"> בדקתי: תמונה אחת של הכול מספיקה</label>
</section>

<section class="step box" data-step="5" hidden><h2>5 · במשרד — מרכז הייצוג: מה הגיע ואיך</h2>
<p>במרכז ביצוע הייצוג, ב«מסמכי הבקשה», ליד כל תעודה מופיע ההרכב: «צילום · קדמי+ספח · אחורי» אצל דוד, «צילום · הכול יחד» אצל רחל. הקובץ הוא PDF, והלקוח אישר אותו בהעלאה (כמו קודם). אותו הרכב גם בהערת המסמך בתיק.</p>
${shot('office-composition-desktop', 'מרכז הייצוג — ההרכב ליד כל תעודה', [
  { sel: '[data-testid="rc-doc-id"] .rc-doc-line', text: '«צילום · קדמי+ספח · אחורי · הקובץ הוא PDF · הלקוח אישר שזה המסמך שלו»' },
])}
<p class="note">גם ההעלאה מהמשרד (כשחסר צילום במרכז הייצוג — «העלאה») וטופס הייצוג (?onboard=) עברו לאותו בוחר; ההרכב נשמר גם שם. הבנייה ברקע (211) מקבלת את ה-PDF כמות שהוא — PDF יחיד לאדם הוא עצמו המסמך לשע״ם.</p>
<label class="chk"><input type="checkbox"> בדקתי: במרכז הייצוג רואים מה כל עמוד</label>
</section>

<section class="step box" data-step="6" hidden><h2>6 · בטלפון (הדמיה 390px) ובערכה הכהה</h2>
<p>בטלפון אותו מסלול: כפתורי «צילום» (מצלמה) ו«מהגלריה או קובץ», תמונה ממוזערת עם «מה בתמונה?» ברוחב המסך, והשבב «עוד חסר». בערכת המשרד הכהה — אותם צבעים מהערכה (דף הבדיקה הפנימי ?test-id-flex).</p>
<div class="phones">
${shot('portal-missing-mobile', 'טלפון: תמונה ראשונה ו«עוד חסר: אחורי, ספח»', [
  { sel: '[data-testid="idf-missing"]', text: '«עוד חסר: אחורי, ספח»' },
], { phone: true })}
${shot('portal-complete-mobile', 'טלפון: הסט שלם', [
  { sel: '[data-testid="idf-complete"]', text: '«✓ הסט שלם: קדמי, אחורי וספח»' },
], { phone: true })}
</div>
${shot('office-dark-desktop', 'ערכת המשרד הכהה — הבוחר עם שתי תמונות', [])}
<p class="note">זו הדמיית דפדפן (Chrome, 390×844), לא מכשיר אמיתי. המצלמה עצמה («צילום») לא נבדקה על טלפון — בדפדפן ההדמיה היא נפתחת כבחירת קובץ.</p>
</section>

<div class="pager"><button type="button" id="prev">→ הקודם</button><button type="button" id="next">הבא ←</button></div>

<div class="box"><h2>מה נבדק</h2>
<table>
<tr><td>דפדפן מול staging (מסד אמיתי)</td><td><code>scripts/e2e/id-upload-flex.mjs</code>: הדף של הלקוח — קדמי בלבד ⇒ «עוד חסר: אחורי, ספח»; קדמי+ספח ואחורי ⇒ שלם ⇒ PDF אחד עם 2 עמודים; בת זוג — תמונה אחת «הכול יחד» ⇒ שלם ⇒ עמוד אחד; הבקשה מושלמת. טופס הייצוג (?onboard=) — שלוש תמונות יחד ⇒ קדמי, אחורי, ספח. מרכז הייצוג — ההרכב מוצג. ערכה כהה. 42/42 במחשב 1280 ו-42/42 בטלפון 390. 0 מיילים, 0 שאריות.</td></tr>
<tr><td>שרת</td><td>מיגרציה 257 ב-staging (הטריגר של 238 מעתיק את ההרכב מהפריט לרישום על הבקשה); הפונקציות onboarding-upload-id ו-portal-upload-document נפרסו ל-staging (ההרכב בהערת המסמך וברישום). הבנייה ברקע (211): PDF יחיד לאדם = המסמך עצמו, בר-המרה לשע״ם.</td></tr>
<tr><td>קוד</td><td>tsc נקי · unit (14 בדיקות חדשות ל-idFlex: שלמות, ברירת מחדל, סדר עמודים, הרכב) · build.</td></tr>
</table></div>

<div class="box"><h2>מה לא נעשה / להחלטה</h2>
<ul>
<li><b>ייצור:</b> הקוד בענף <code>claude/adoring-bhaskara-05f4ec</code>; מיגרציה 257 ושתי הפונקציות — ב-staging בלבד. ממתין לאישורך לפריסה (מיזוג ל-master, 257 בייצור, שתי הפונקציות, האתר).</li>
<li><b>טלפון אמיתי:</b> המצלמה («צילום») ו-HEIC מהאייפון לא נבדקו על מכשיר; בהדמיה נבדקו קבצי PNG.</li>
<li><b>שאלון תיק המס</b> (השלמת מידע) עדיין מבקש תעודת זהות בחלקים קבועים (DocPartsPicker) — לפי ההדמיה המאושרת תעודת הזהות לא נשאלת שם יותר; לא נגעתי (קבצים של סשן אחר).</li>
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

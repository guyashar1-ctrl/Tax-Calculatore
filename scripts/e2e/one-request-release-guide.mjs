#!/usr/bin/env node
// בונה את המדריך החזותי — docs/release-guides/2026-10-17-one-request-s1/index.html — קובץ עצמאי, התמונות מוטמעות (data:).
// הצילומים: מריצות scripts/e2e/work-as-request.mjs (הדגמה על מסד מדומה ב-1280/390, ו-staging ב-1280) — נתוני דמה בלבד.
//   node scripts/e2e/one-request-release-guide.mjs --demo=<shots-demo> --staging=<shots-staging> [--commit=<sha>] [--out=docs/release-guides/2026-10-17-one-request-s1]
import { readFileSync, writeFileSync, mkdirSync, copyFileSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';

const arg = (k, d) => (process.argv.find(a => a.startsWith(`--${k}=`))?.split('=').slice(1).join('=') ?? d);
const DEMO = arg('demo', ''), STG = arg('staging', '');
const OUT = resolve(arg('out', 'docs/release-guides/2026-10-17-one-request-s1'));
const COMMIT = arg('commit', 'לא בקומיט');
mkdirSync(join(OUT, 'shots'), { recursive: true });
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');

/** צילום מתיקיית המקור → עותק נקי ב-shots/ של המדריך + data: לקובץ העצמאי + סימונים מה-json של הריצה. */
function pic(dir, name, env) {
  const src = join(dir, `${name}.png`);
  if (!existsSync(src)) throw new Error(`חסר צילום: ${src}`);
  copyFileSync(src, join(OUT, 'shots', `${env}-${name}.png`));
  const data = `data:image/png;base64,${readFileSync(src).toString('base64')}`;
  const j = existsSync(join(dir, `${name}.json`)) ? JSON.parse(readFileSync(join(dir, `${name}.json`), 'utf8')) : null;
  return { data, boxes: j?.boxes ?? [], env };
}
const envLabel = { demo: 'הדגמה (מסד מדומה)', staging: 'staging (מסד אמיתי, לקוח בדיקה)' };
function figure(p, caption, { phone = false } = {}) {
  const marks = p.boxes.map((b, i) => `<span class="mk" style="left:${(b.x * 100).toFixed(2)}%;top:${(b.y * 100).toFixed(2)}%">${i + 1}</span><span class="box" style="left:${(b.x * 100).toFixed(2)}%;top:${(b.y * 100).toFixed(2)}%;width:${(b.w * 100).toFixed(2)}%;height:${(b.h * 100).toFixed(2)}%"></span>`).join('');
  const legend = p.boxes.length ? `<ol class="legend">${p.boxes.map((b, i) => `<li><b>${i + 1}</b> ${esc(b.label)}</li>`).join('')}</ol>` : '';
  return `<figure class="${phone ? 'is-phone' : ''}"><button type="button" class="zoom" data-src="${p.data}" aria-label="הגדלה: ${esc(caption)}"><span class="pic"><img src="${p.data}" alt="${esc(caption)}" loading="lazy">${marks}</span></button>${legend}<figcaption>${esc(caption)} <span class="env">${envLabel[p.env]}</span></figcaption></figure>`;
}

const STEPS = [
  {
    t: 'פותחים היכרות — והשאלון כבר אצל הלקוח',
    p: 'מתיק המס («השלם עם הלקוח») או מ«＋ בקשה חדשה»: נפתחת שורה אחת ב«בקשות» — «קליטה והשלמת תיק המס». בתוך השורה אין יותר «הוסף שאלות» ואין «פרסם את השאלות בדף»: השאלות נגזרות מהתיק ומתפרסמות בדף של הלקוח לבד, בפעולה אחת בשרת (מיגרציה 252). <b>בלי מייל</b> — המייל, אם צריך, יוצא כמו תמיד מ«הדף של …» למעלה.',
    expect: 'בשורה: שבב «אצל דוד · 0 מתוך N», ומתחתיה שלושה צעדים: תשובות הלקוח · יישור קו ברשויות · לתיק. ב«עכשיו» — אין כפתור «פרסם».',
    figs: (d, s, p) => [figure(d, 'שורת הקליטה פתוחה, מיד אחרי «השלם עם הלקוח» — השאלון כבר בדף'), figure(s, 'אותו מסך מול staging — 27 שאלות פורסמו בלי לחיצה של המשרד'), figure(p, 'בטלפון (390)', { phone: true })],
    shot: '03-published',
  },
  {
    t: 'שורה אחת, לא שתיים',
    p: 'השורה «↳ השלמת פרטים לתיק המס» ירדה מהרשימה. מצבה («אצל הלקוח · 3 מתוך 9», «הגיעו תשובות», «לאישורך בתיק») הוא השבב בשורת הקליטה, ושלושת הצעדים גלויים גם כשהשורה סגורה. קישור ישן ל«השלמת מידע» (למשל מהדף האישי) נוחת בשורת הקליטה.',
    expect: 'ב«בקשות» של לקוח עם קליטה פתוחה — שורה אחת לקליטה. אין שורה שמתחילה ב-«↳».',
    figs: (d, s, p) => [figure(d, 'השורה הסגורה עם שלושת הצעדים'), figure(p, 'בטלפון: הצעדים זה מתחת לזה', { phone: true })],
    shot: '03b-closed-row',
  },
  {
    t: 'הלקוח רואה את השאלון בדף שלו — בלי פעולה של המשרד',
    p: 'בדף האישי מופיע הפריט «השלמת פרטים לתיק המס» כמו היום (אותו שאלון, אותם מסכים). הדף נפתח רק אם כבר פורסם ללקוח; לקוח חדש שהדף שלו עוד לא פורסם — השבב אומר «ממתין לפרסום», ו«פרסם בדף» בכרטיס הדף פותח אותו (גם זה בלי מייל).',
    expect: 'בדף האישי: «השלמת פרטים לתיק המס» עם מונה «1 מתוך N».',
    figs: (d, s, p) => [figure(s, 'הדף האישי של לקוח הבדיקה ב-staging — השאלה הראשונה')],
    shot: '04-portal-question',
  },
  {
    t: 'הגיעו תשובות — הבדיקה באותה שורה',
    p: 'כשהלקוח עונה, השבב מתחלף ל«הגיעו תשובות» והצעד הראשון נעשה «שלך». הבדיקה והאישור — בתוך השורה, כמו קודם. «החזר ללקוח לתיקון» מחזיר את השאלה לדף של הלקוח <b>לבד</b> (בלי «פרסם»). הצעד השלישי «לתיק» סופר את העדכונים שממתינים לאישורך בתיק המס מהבקשה הזו.',
    expect: 'אחרי «החזר ללקוח»: הודעה «שאלה אחת בדף של … — בלי מייל», ואין כפתור «פרסם».',
    figs: (d, s, p) => [figure(s, 'הבדיקה בתוך השורה — staging')],
    shot: '06-review-in-row',
  },
  {
    t: 'מצב כהה',
    p: 'שלושת הצעדים והשבב נבדקו גם במצב כהה (ניגודיות ≥ 4.5:1 נמדדת בבדיקה האוטומטית).',
    expect: 'הטקסט בצעדים קריא על רקע כהה.',
    figs: (d, s, p) => [figure(s, 'השורה במצב כהה — staging')],
    shot: '22-dark-request-row-1280-dark',
  },
];

const demo = (n) => pic(DEMO, `${n}-1280`, 'demo');
const demoPhone = (n) => pic(DEMO, `${n}-390`, 'demo');
const stg = (n) => pic(STG, `${n}-1280`, 'staging');
const sections = STEPS.map((s, i) => {
  const figs = s.shot === '04-portal-question' || s.shot === '06-review-in-row' ? s.figs(null, stg(s.shot), null)
    : s.shot === '22-dark-request-row-1280-dark' ? s.figs(null, pic(STG, s.shot, 'staging'), null)
    : s.figs(demo(s.shot), s.shot === '03-published' ? stg(s.shot) : null, demoPhone(s.shot));
  return `<section class="card step" data-step="${i}" ${i ? 'hidden' : ''} aria-labelledby="s${i}"><h2 id="s${i}"><span class="n">${i + 1}</span>${esc(s.t)}</h2><p>${s.p}</p>
${figs.join('\n')}
<p class="try"><b>לבדוק (כדקה):</b> ${esc(s.expect)}</p>
<div class="pager"><button type="button" data-go="${i - 1}" ${i === 0 ? 'disabled' : ''}>→ הקודם</button><button type="button" data-go="${i + 1}" ${i === STEPS.length - 1 ? 'disabled' : ''}>הבא ←</button></div></section>`;
}).join('\n');

const html = `<!doctype html>
<html lang="he" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>בקשה אחת לתיק המס — שלב 1</title>
<style>
:root{--bg:#f6f5f2;--card:#fff;--tx:#1d2330;--tx2:#5a6272;--bd:#e3e1dc;--br:#3b5b8c;--ok:#2f6b4f;--warn:#9a5b00;--mk:#e0662a}
@media (prefers-color-scheme: dark){:root:not([data-theme="light"]){--bg:#15171c;--card:#1e2128;--tx:#e8e9ec;--tx2:#a7adb8;--bd:#333844;--br:#8fb0e3;--ok:#7cc9a2;--warn:#f0b35a}}
:root[data-theme="dark"]{--bg:#15171c;--card:#1e2128;--tx:#e8e9ec;--tx2:#a7adb8;--bd:#333844;--br:#8fb0e3;--ok:#7cc9a2;--warn:#f0b35a}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--tx);font:16px/1.65 system-ui,"Segoe UI",Arial,sans-serif}
.wrap{max-width:980px;margin:0 auto;padding:20px 16px 60px}
h1{font-size:26px;margin:0 0 6px}h2{font-size:20px;margin:0 0 8px}.sub{color:var(--tx2);margin:0 0 16px;font-size:14px}
.card{background:var(--card);border:1px solid var(--bd);border-radius:14px;padding:16px 18px;margin:14px 0}
.ask ul{margin:6px 0 0;padding-inline-start:20px}
.nav{display:flex;flex-wrap:wrap;gap:6px;margin:10px 0 0;position:sticky;top:0;background:var(--bg);padding:8px 0;z-index:5}
.nav button{font:inherit;font-size:14px;border:1px solid var(--bd);background:var(--card);color:var(--tx);border-radius:999px;padding:6px 12px;cursor:pointer;min-height:40px}
.nav button[aria-current="step"]{background:var(--br);color:#fff;border-color:var(--br)}
.step[hidden]{display:none}.step h2 .n{display:inline-grid;place-items:center;width:28px;height:28px;border-radius:50%;background:var(--br);color:#fff;font-size:15px;margin-inline-end:8px}
figure{margin:12px 0}figcaption{font-size:14px;color:var(--tx2);margin-top:6px}.env{display:inline-block;font-size:12px;border:1px solid var(--bd);border-radius:999px;padding:0 8px;margin-inline-start:6px}
.zoom{display:block;border:0;padding:0;background:none;cursor:zoom-in;width:100%;text-align:start}
.pic{position:relative;display:block;border:1px solid var(--bd);border-radius:10px;overflow:hidden;background:#fff}
.is-phone .pic{max-width:390px}
.pic img{display:block;width:100%;height:auto}
.mk{position:absolute;transform:translate(40%,-40%);width:26px;height:26px;border-radius:50%;background:var(--mk);color:#fff;font:700 14px/26px system-ui;text-align:center;box-shadow:0 0 0 2px #fff;z-index:2}
.box{position:absolute;border:2px solid var(--mk);border-radius:8px;pointer-events:none}
.legend{margin:6px 0 0;padding:0;list-style:none;display:flex;flex-wrap:wrap;gap:4px 14px;font-size:14px}.legend b{display:inline-grid;place-items:center;width:20px;height:20px;border-radius:50%;background:var(--mk);color:#fff;font-size:12px;margin-inline-end:4px}
.try{border-inline-start:3px solid var(--ok);padding-inline-start:10px;color:var(--tx)}
.pager{display:flex;justify-content:space-between;gap:8px;margin-top:10px}.pager button{font:inherit;border:1px solid var(--bd);background:var(--card);color:var(--tx);border-radius:10px;padding:8px 14px;cursor:pointer;min-height:44px}.pager button:disabled{opacity:.4;cursor:default}
code{background:color-mix(in srgb,var(--tx) 8%,transparent);border-radius:4px;padding:0 4px;direction:ltr;unicode-bidi:isolate}
dialog{border:0;padding:0;background:transparent;max-width:96vw;max-height:96vh}dialog::backdrop{background:rgba(0,0,0,.75)}dialog img{max-width:96vw;max-height:90vh;display:block;border-radius:8px}
dialog .x{position:fixed;top:12px;left:12px;font:inherit;font-size:16px;border:0;border-radius:999px;padding:8px 14px;background:#fff;color:#111;cursor:pointer}
.miss{color:var(--warn)}.gaps li{margin:4px 0}
@media (max-width:640px){h1{font-size:22px}.wrap{padding:14px 16px 40px}}
</style></head><body><div class="wrap">
<h1>בקשה אחת לתיק המס — שלב 1: שורה אחת, והיכרות שנשלחת לבד</h1>
<p class="sub">17.10.2026 · ענף <code>claude/loving-hertz-2b70a9</code> על <code>origin/master a0520b7</code> · קומיט <code>${esc(COMMIT)}</code> · מיגרציה <b>252</b> ב-<b>staging בלבד</b> · <b>לא באתר, לא בייצור</b> — ממתין לאישורך. צילומי «הדגמה» — מסד מדומה; צילומי «staging» — מסד אמיתי, לקוח בדיקה (נמחק בסוף הריצה).</p>

<section class="card ask" aria-labelledby="ask-h"><h2 id="ask-h">מה ביקשת ומה קיבלת</h2>
<ul>
<li><b>«שורה אחת לכל בקשת תיק מס»</b> — ב«בקשות» יש שורה אחת לקליטה (וגם לדוח שנתי / הצהרת הון / הערכת מס); «↳ השלמת פרטים לתיק המס» ירדה. המצב שלה הוא השבב בשורה.</li>
<li><b>«שלושה צעדים בתוך השורה»</b> — תשובות הלקוח · יישור קו ברשויות · לתיק — גלויים גם כשהשורה סגורה, לפי ההדמיה שאישרת. בשלב הזה הצעד השני מראה את יישור הקו האחרון שבוצע מכרטיס «זהות ורשויות» (האוטומציה — שלב 4), והשלישי סופר עדכונים שממתינים לאישורך בתיק.</li>
<li><b>«כשנפתחת היכרות — השאלון כבר אצל הלקוח»</b> — בלי «הוסף שאלות» ובלי «פרסם». השאלות נגזרות מהתיק (אותו מנוע) ומתפרסמות בדף של הלקוח בפעולה אחת בשרת. <b>בלי מייל</b> — כלל «דף אחד ללקוח».</li>
</ul></section>

<nav class="nav" aria-label="צעדים">${STEPS.map((s, i) => `<button type="button" data-go="${i}" ${i === 0 ? 'aria-current="step"' : ''}>${i + 1}. ${esc(s.t)}</button>`).join('')}</nav>
${sections}

<section class="card" aria-labelledby="gaps-h"><h2 id="gaps-h">מה לא השתנה, ומה עוד לא</h2>
<ul class="gaps">
<li>דוח שנתי, הצהרת הון והערכת מס — עדיין עם «הוסף שאלות» ו«פרסם» (שלב 5). גם להן יש עכשיו שורה אחת ושלושה צעדים.</li>
<li>השאלון עצמו (20 שאלות, טקסט חופשי, מסמכים בהיכרות) — שלב 2, רץ במקביל.</li>
<li>התשובות עדיין מאושרות בבקשה («אשר», «אשר ועדכן בתיק») — «ישר לתיק + אשר הכול» הוא שלב 3.</li>
<li>לא נבדק: טלפון אמיתי (רק הדמיית 390/360); המסכים באתר החי עם המשתמש שלך (עדיין לא בייצור).</li>
</ul></section>
</div>
<dialog id="dlg"><button type="button" class="x" aria-label="סגירה">סגירה ✕</button><img alt=""></dialog>
<script>
(function(){
  var steps=[].slice.call(document.querySelectorAll('.step')),nav=[].slice.call(document.querySelectorAll('.nav button'));
  function go(i){i=Math.max(0,Math.min(steps.length-1,i));steps.forEach(function(s,k){s.hidden=k!==i});nav.forEach(function(b,k){if(k===i)b.setAttribute('aria-current','step');else b.removeAttribute('aria-current')});steps[i].querySelector('h2').scrollIntoView({block:'start',behavior:'smooth'})}
  document.addEventListener('click',function(e){var b=e.target.closest('[data-go]');if(b&&!b.disabled){go(Number(b.getAttribute('data-go')));return}
    var z=e.target.closest('.zoom');if(z){var d=document.getElementById('dlg');d.querySelector('img').src=z.getAttribute('data-src');d.showModal();return}
    if(e.target.closest('dialog .x')||e.target.id==='dlg'){document.getElementById('dlg').close()}});
})();
</script></body></html>`;
writeFileSync(join(OUT, 'index.html'), html);
console.log(`נכתב: ${join(OUT, 'index.html')} (${(html.length / 1024 / 1024).toFixed(1)}MB)`);

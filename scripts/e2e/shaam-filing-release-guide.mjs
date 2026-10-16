// בונה את המדריך החזותי לשחרור — docs/release-guides/2026-10-16-shaam-filing-import/index.html — קובץ עצמאי, התמונות מוטמעות.
// הצילומים: shots/ באותה תיקייה (מריצת scripts/e2e/shaam-filing.mjs על מסד מדומה — נתוני דמה בלבד).
//   node scripts/e2e/shaam-filing-release-guide.mjs
import { readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const DIR = resolve('docs/release-guides/2026-10-16-shaam-filing-import');
const img = (n) => `data:image/png;base64,${readFileSync(join(DIR, 'shots', `${n}.png`)).toString('base64')}`;
const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');

// [x, y, w, h] בפיקסלים של הצילום (1280×900 במחשב, 360×740 בטלפון ×2)
const STEPS = [
  { t: 'איפה זה ומה להפיק', shot: 'desktop-02-guide', w: 1280, h: 900,
    p: 'מקטע חדש «הפקת דוחות משע״ם והעלאה». «מה להפיק ואיך» פותח את שלוש ההפקות ומדריך צעד-צעד על צילומי שע״ם אמיתיים (פרטים אישיים הושחרו בתמונה עצמה), עם מסגרות ממוספרות. לחיצה על צילום — הגדלה.',
    expect: 'רואים את הצעדים של IDOM ושל AHZM; בצעד 4 מסומנות עמודות «חייב בהגשה», «מועד חוקי/תאריך ארכה», «תאריך הגשה» ושורה עם ח.',
    marks: [[148, 300, 262, 40, 'הצעדים — הצעד האחרון «שמירה כ-PDF» מסומן «ממתין לאימות»'], [426, 545, 245, 85, 'הסימונים על צילום 19']] },
  { t: 'מעלים PDF — ורואים מה יקרה, לפני שנשמר', shot: 'desktop-05-review', w: 1280, h: 900,
    p: 'אפשר להעלות כמה קבצים יחד (גם קובץ עם כמה עמודים). לכל קובץ — מה זוהה בו; «כיסוי» — אילו עמודים נקראו ומה חסר; קבוצת הון שלא הועלתה — «לא נבדקה» (היעדר קובץ אינו «ריקה»). השורות: זוהו / חדשים / עודכנו / ללא שינוי / לבדיקה.',
    expect: 'בדוגמה: זוהו 7, חדשים 9, לבדיקה 2 — מספר שלא נמצא בכרטיסים, ומספר שתואם לכרטיס עם שם אחר.',
    marks: [[116, 190, 1034, 120, 'הקבצים ומה זוהה בכל אחד'], [580, 360, 570, 60, 'כיסוי — עמודים ותאריך הפקה'], [808, 516, 342, 28, 'הספירות']] },
  { t: '«שמירה לתיקים» — ומי חייב ועוד לא נפתחה לו בקשה', shot: 'desktop-06-saved', w: 1280, h: 900,
    p: 'רק שורות מזוהות נכתבות לתיק. מתחת — «חייבים לפי שע״ם — טרם נפתחה בקשה»: לקוח, מה (דוח שנתי / הצהרת הון), המועד מהרשימה והמקור. מה שלא ודאי — ב«לבדיקה», עם בחירת כרטיס או «לא שלנו».',
    expect: '5 שורות «חייב · טרם נפתח»; «מועד לא ידוע» כשהרשימה לא כוללת מועד (לא היום ולא אפס).',
    marks: [[116, 274, 1034, 46, 'מה נשמר ומה לבדיקה'], [116, 333, 1034, 368, 'חייבים — טרם נפתחה בקשה'], [116, 725, 1034, 30, 'לבדיקה — לא נכתבו לתיק']] },
  { t: '«פתח בקשה» / «פתח בקשות לכולם»', shot: 'desktop-08-open-all', w: 1280, h: 900,
    p: 'נפתחת העבודה הרגילה ב«בקשות» של הלקוח (אותה פתיחה כמו «הוספת דוח או הצהרת הון»), עם המועד מהרשימה ו«מקור: מסך המייצגים». שאלות הלקוח נוצרות כטיוטה — לא מתפרסמות ולא יוצא מייל. בהצהרת הון שע״ם מציג רק שנה — את היום שאליו ההצהרה בוחרים כאן.',
    expect: 'בלי יום הצהרה הכפתור אומר «חסר יום הצהרה»; אחרי הפתיחה השורה עוברת ל«נפתחה בקשה».',
    marks: [[680, 366, 242, 38, 'יום ההצהרה — נבחר במפורש'], [819, 740, 114, 36, 'פתיחה']] },
  { t: 'בתיק הלקוח: «מרשימות שע״ם», הגשות ועותקים', shot: 'desktop-10-client', w: 1280, h: 900,
    p: 'בתיק של כל לקוח: «דוח שנתי — שנת מס 2025 — נדרש להגיש עד…» או «הוגש לפי שע״ם ב-…», עם המקור (רשימה, תאריך הפקה, עמוד ושורה — לא הקובץ של כל המשרד). כשקובץ חדש מראה הגשה — הבקשה הפתוחה מסומנת «הוגש לפי שע״ם» ולא נסגרת לבד. הצהרה שכבר הוגשה — «בקש עותק» פותח בקשת מסמך רגילה, בלי שליחה.',
    expect: '«בקשת עותק ממתינה» אחרי הלחיצה; «חייב בקנס» מופיע כסימון בלבד — בלי סכום ובלי «שולם».',
    marks: [[100, 452, 1066, 80, 'חובה פתוחה עם בקשה'], [100, 540, 1066, 120, 'הוגש לפי שע״ם — היסטוריה ועותק']] },
];
const EXTRA = [
  { t: 'קובץ מהמסלול הישן — לא נקלט', shot: 'desktop-04-legacy', w: 1280, h: 900, p: 'הקובץ השנתי שסופק (מסלול 1/5) — בלי עמודת «חייב בהגשה». המערכת אומרת «חסר סימון חבות», לא מציגה אף שורה כחייבת, ו«שמירה לתיקים» כבויה.' },
  { t: 'בטלפון (360)', shot: 'small-06-saved', w: 720, h: 1480, p: 'אותו מסך בעמודה אחת; כפתורים בגובה 44 לפחות; בלי גלילה הצידה (נבדק גם ב-390).' },
];

const markSvg = (s) => s.marks ? `<svg viewBox="0 0 ${s.w} ${s.h}" preserveAspectRatio="none" aria-hidden="true">${s.marks.map(([x, y, w, h], i) =>
  `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="8" fill="none" stroke="#ff8a1f" stroke-width="4"/><circle cx="${Math.min(s.w - 22, x + w + 6)}" cy="${Math.max(22, y - 4)}" r="18" fill="#ff8a1f"/><text x="${Math.min(s.w - 22, x + w + 6)}" y="${Math.max(22, y - 4)}" text-anchor="middle" dominant-baseline="central" font-size="20" font-weight="700" font-family="Arial">${i + 1}</text>`).join('')}</svg>` : '';
const figure = (s) => `<button class="shot" type="button" data-zoom aria-label="הגדלה: ${esc(s.t)}"><img src="${img(s.shot)}" alt="${esc(s.t)}" width="${s.w}" height="${s.h}">${markSvg(s)}</button>`;

const html = `<!doctype html>
<html lang="he" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>הפקת דוחות משע״ם והעלאה — מה קיבלת</title>
<style>
:root{--bg:#f7f6f3;--card:#fff;--tx:#1b1f24;--tx2:#5b6470;--bd:#e3e1dc;--acc:#3e5f8f;--warn:#a45a00;--ok:#1f6b45;--mark:#ff8a1f}
@media (prefers-color-scheme:dark){:root{--bg:#15171a;--card:#1e2126;--tx:#eceae6;--tx2:#a9b0b8;--bd:#33373d;--acc:#8fb0e0;--warn:#f0a74a;--ok:#6fd19b}}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--tx);font:16px/1.6 system-ui,-apple-system,"Segoe UI",Arial,sans-serif}
main{max-width:980px;margin:0 auto;padding:16px}h1{font-size:24px;margin:8px 0}h2{font-size:19px;margin:0 0 6px}p{margin:6px 0}
.card{background:var(--card);border:1px solid var(--bd);border-radius:14px;padding:16px;margin:14px 0}
.meta{font-size:14px;color:var(--tx2)}.chip{display:inline-block;padding:1px 10px;border-radius:999px;font-size:13px;font-weight:600;background:#e8eef8;color:#2b4a7a;margin-inline-end:6px}
.chip.warn{background:#fdecd8;color:#8a4b00}.chip.ok{background:#dff2e7;color:#1f6b45}
nav.steps{display:flex;gap:6px;flex-wrap:wrap;margin:10px 0}nav.steps button{border:1px solid var(--bd);background:var(--card);color:var(--tx);border-radius:999px;padding:6px 12px;font:inherit;font-size:14px;cursor:pointer;min-height:40px}
nav.steps button[aria-current=step]{border-color:var(--acc);font-weight:700}
.step{display:none}.step.on{display:block}
.shot{position:relative;display:block;width:100%;padding:0;border:1px solid var(--bd);border-radius:10px;overflow:hidden;background:#fff;cursor:zoom-in}
.shot img{display:block;width:100%;height:auto}.shot svg{position:absolute;inset:0;width:100%;height:100%;pointer-events:none}
ol.marks{padding-inline-start:20px;margin:8px 0}.expect{border-inline-start:4px solid var(--ok);padding:6px 10px;background:rgba(31,107,69,.07);border-radius:6px}
.nav2{display:flex;justify-content:space-between;gap:8px;margin-top:10px}.nav2 button,.btn{border:1px solid var(--bd);background:var(--card);color:var(--tx);border-radius:10px;padding:8px 14px;font:inherit;cursor:pointer;min-height:44px}
label.check{display:flex;gap:8px;align-items:center;margin-top:8px;font-size:14px;color:var(--tx2)}
.zoom{position:fixed;inset:0;background:rgba(10,12,16,.92);display:none;align-items:flex-start;justify-content:center;overflow:auto;padding:16px;z-index:10;cursor:zoom-out}.zoom.on{display:flex}.zoom .shot{max-width:1400px;cursor:zoom-out}
ul.gaps li{margin:4px 0}table{border-collapse:collapse;width:100%;font-size:14px}td,th{border-bottom:1px solid var(--bd);padding:6px;text-align:right;vertical-align:top}
.grid2{display:grid;grid-template-columns:1fr 1fr;gap:12px}@media (max-width:700px){.grid2{grid-template-columns:1fr}}
</style></head><body><main>
<h1>הפקת דוחות משע״ם והעלאה — מה קיבלת</h1>
<p class="meta">16.10.2026 · ענף <code>claude/shaam-filing-import-dcf50d</code> (על <code>2a971d2</code>) · <b>לא בקומיט, לא בייצור</b> · צילומים: מסך בדיקה על מסד מדומה (נתוני דמה), והמדריך — על צילומי שע״ם אמיתיים מושחרים.</p>

<section class="card"><h2>מה ביקשת ומה קיבלת</h2>
<p>ביקשת: להפיק מדי פעם משע״ם את מעקב הדוחות השנתיים ואת דרישות הצהרות ההון, להעלות את ה-PDF, ושהמערכת תסמן בתיק של כל לקוח מי חייב במה ועד מתי.</p>
<p>קיבלת: מקטע אחד «הפקת דוחות משע״ם והעלאה» — מדריך הפקה עם צילומים מסומנים, העלאת PDF אחד או כמה, תצוגה של מה יקרה לפני השמירה, «שמירה לתיקים», ושורות «חייב · טרם נפתח» עם «פתח בקשה» / «פתח בקשות לכולם». בתיק הלקוח — «מרשימות שע״ם». שום דבר לא מתפרסם ללקוח ולא יוצא מייל.</p>
<p><span class="chip warn">עוד לא במקום</span> המקטע ייכנס ל«מס › עבודות לקוחות › כל העבודות», והשורות בתיק — ל«דוחות והצהרות». את השילוב עושים הסשנים שאחראים על המסכים האלה; עד אז הכול נבדק במסך בדיקה נפרד.</p>
</section>

<section class="card"><h2>המסלול — 5 צעדים</h2>
<nav class="steps" aria-label="צעדים">${STEPS.map((s, i) => `<button type="button" data-go="${i}"${i ? '' : ' aria-current="step"'}>${i + 1}. ${esc(s.t)}</button>`).join('')}</nav>
${STEPS.map((s, i) => `<div class="step${i ? '' : ' on'}" data-step="${i}"><h2>${i + 1}. ${esc(s.t)}</h2><p>${esc(s.p)}</p>${figure(s)}
<ol class="marks">${s.marks.map(m => `<li>${esc(m[4])}</li>`).join('')}</ol><p class="expect"><b>מה אמור לקרות:</b> ${esc(s.expect)}</p>
<label class="check"><input type="checkbox"> בדקתי את הצעד הזה (סימון מקומי בלבד)</label>
<div class="nav2"><button type="button" data-go="${i - 1}"${i ? '' : ' disabled'}>→ הקודם</button><button type="button" data-go="${i + 1}"${i < STEPS.length - 1 ? '' : ' disabled'}>הבא ←</button></div></div>`).join('')}
</section>

<section class="card"><h2>עוד שני דברים לראות</h2><div class="grid2">${EXTRA.map(s => `<div><h3 style="font-size:16px;margin:0 0 4px">${esc(s.t)}</h3><p>${esc(s.p)}</p>${figure(s)}</div>`).join('')}</div></section>

<section class="card"><h2>בדיקה של דקה</h2>
<ol><li>«מה להפיק ואיך» ← צעד 4: רואים את שלוש העמודות מסומנות, ובצעד 5 «ממתין לאימות».</li>
<li>מעלים קובץ ישן (מסלול 1/5) — «חסר סימון חבות», אין שמירה.</li>
<li>מעלים רשימה — הספירות מופיעות לפני השמירה; «שמירה לתיקים» — השורות עוברות ל«חייב · טרם נפתח».</li>
<li>«פתח בקשה» ללקוח אחד — ב«בקשות» שלו נפתח הדוח, השאלות בטיוטה, לא יצא מייל.</li></ol>
<p class="meta">‼ «פתח בקשה» פותח עבודה אמיתית בתיק. לבדיקה ראשונה — לקוח בדיקה, או מסך הבדיקה על מסד מדומה.</p></section>

<section class="card"><h2>מה נבדק</h2><table>
<tr><th>בדיקה</th><th>תוצאה</th><th>איפה</th></tr>
<tr><td>הקובץ האמיתי של הצהרת ההון (לא הגישו, ללא קנס)</td><td><span class="chip ok">נקרא נכון</span> תיק עם אפס מוביל, 2025, 30.11.2026, דף 1 מתוך 1</td><td>מקומי, PDF מקורי</td></tr>
<tr><td>הקובץ השנתי הישן שסופק</td><td><span class="chip ok">«חסר סימון חבות»</span> 0 שורות כחייבות</td><td>מקומי, PDF מקורי</td></tr>
<tr><td>צילום 19 (דוגמה בפריסה שלו)</td><td><span class="chip ok">3 פתוחות</span> 31.10, 30.11, 30.11; לא מ«ח» עם הגשה ולא בלי «ח»</td><td>בדיקות יחידה + PDF סינתטי</td></tr>
<tr><td>מסד הנתונים (מיגרציה 250) בבידוד</td><td><span class="chip ok">69/69</span></td><td>PGlite</td></tr>
<tr><td>מסך הבדיקה, 1280 / 390 / 360</td><td><span class="chip ok">141/141</span></td><td>מסד מדומה</td></tr>
<tr><td>מסלול מלא מול מסד אמיתי</td><td><span class="chip ok">39/39</span> כולל ניקוי בלי שאריות</td><td>staging</td></tr>
<tr><td>בדיקות היחידה של כל המערכת · tsc · build</td><td><span class="chip ok">1820/0</span> · נקי · עבר</td><td>מקומי</td></tr>
</table></section>

<section class="card"><h2>מה עוד לא</h2><ul class="gaps">
<li><b>PDF שנתי מהמסלול הנכון</b> (IDOM ← 4, עם «חייב בהגשה") — עוד לא נבדק על קובץ אמיתי; יש רק צילום 19. צריך ממך הפקה אחת מהמסלול הזה.</li>
<li><b>שמירת ה-PDF מהמסוף</b> — לא צולם איך מדפיסים את כל הרשימה; הצעד במדריך מסומן «ממתין לאימות». צריך ממך צילום של תיבת ההדפסה.</li>
<li><b>«הגישו» (שתי הקבוצות)</b> — עמודות התוצאה לא נראו עדיין; נבדק רק על דוגמה סינתטית.</li>
<li><b>צילום מסך</b> במקום PDF — לא נקלט אוטומטית (מוסבר במסך).</li>
<li>מועד מהרשימה נשמר בבקשה «נמסר, לא מאומת» — «רשמי» עדיין דורש אסמכתה בתוך העבודה.</li>
<li>שילוב במסכים, קומיט, מיגרציה 250 בייצור — לא נעשו.</li>
</ul></section>
</main>
<div class="zoom" id="zoom" role="dialog" aria-modal="true" aria-label="הגדלה"></div>
<script>
const steps=[...document.querySelectorAll('.step')],dots=[...document.querySelectorAll('nav.steps button')];
function go(i){if(i<0||i>=steps.length)return;steps.forEach((s,k)=>s.classList.toggle('on',k===i));dots.forEach((d,k)=>{if(k===i)d.setAttribute('aria-current','step');else d.removeAttribute('aria-current')});}
document.addEventListener('click',e=>{const g=e.target.closest('[data-go]');if(g&&!g.disabled){go(+g.dataset.go);return}
const z=e.target.closest('[data-zoom]');const box=document.getElementById('zoom');if(z&&!box.contains(z)){box.innerHTML='';box.appendChild(z.cloneNode(true));box.classList.add('on');return}
if(box.classList.contains('on'))box.classList.remove('on')});
document.addEventListener('keydown',e=>{const box=document.getElementById('zoom');if(e.key==='Escape')box.classList.remove('on');
const cur=steps.findIndex(s=>s.classList.contains('on'));if(e.key==='ArrowLeft')go(cur+1);if(e.key==='ArrowRight')go(cur-1)});
</script></body></html>`;
writeFileSync(join(DIR, 'index.html'), html);
console.log(`נכתב ${join(DIR, 'index.html')} · ${(html.length / 1024).toFixed(0)}KB`);

#!/usr/bin/env node
// בונה את המדריך העצמאי (index.html) מצילומי ה-e2e של scripts/e2e/intake-closed-lists.mjs: תמונות מוטמעות כ-base64,
// סימונים לפי מיקומים שנמדדו בזמן הצילום (<name>.json), ומספרי הבדיקות מ-results.json של כל ריצה.
//   node docs/release-guides/2026-10-17-one-request-s2/build-guide.mjs <shots-staging> <shots-demo-dark> [--commit=<sha>] [--live=yes|pending]
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const STG = process.argv[2], DARK = process.argv[3];
const arg = (k, d) => (process.argv.find(a => a.startsWith(`--${k}=`))?.split('=')[1] ?? d);
const COMMIT = arg('commit', 'טרם בקומיט');
const LIVE = arg('live', 'pending');
if (!STG || !DARK) throw new Error('תיקיות צילומים חסרות: <shots-staging> <shots-demo-dark>');

const img = (dir, name) => { const p = join(dir, `${name}.png`); if (!existsSync(p)) throw new Error('חסר צילום: ' + p); return `data:image/png;base64,${readFileSync(p).toString('base64')}`; };
const boxes = (dir, name) => { const p = join(dir, `${name}.json`); return existsSync(p) ? JSON.parse(readFileSync(p, 'utf8')) : null; };
const results = (dir) => { const p = join(dir, 'results.json'); return existsSync(p) ? JSON.parse(readFileSync(p, 'utf8')) : null; };
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');

/** צילום עם סימונים ממוספרים (מיקום באחוזים לפי מה שנמדד בזמן הצילום). */
function shot(dir, name, alt, marks = [], opts = {}) {
  const b = boxes(dir, name);
  let badges = '';
  const legend = [];
  marks.forEach((label, i) => {
    const r = b?.boxes?.find(x => x.label === label);
    legend.push(`<li><b>${i + 1}</b> ${esc(label)}</li>`);
    if (!r) return;
    badges += `<span class="mk" style="right:${((1 - r.x - r.w) * 100).toFixed(2)}%;top:${(r.y * 100).toFixed(2)}%" aria-hidden="true">${i + 1}</span>`;
    badges += `<span class="ring" style="left:${(r.x * 100).toFixed(2)}%;top:${(r.y * 100).toFixed(2)}%;width:${(r.w * 100).toFixed(2)}%;height:${(r.h * 100).toFixed(2)}%" aria-hidden="true"></span>`;
  });
  return `<figure class="fig${opts.phone ? ' phone' : ''}"><button type="button" class="shot" aria-label="הגדלה: ${esc(alt)}"><img src="${img(dir, name)}" alt="${esc(alt)}">${badges}</button>
  <figcaption>${esc(alt)}${legend.length ? `<ol class="marks">${legend.join('')}</ol>` : ''}</figcaption></figure>`;
}
const pair = (name, alt, marks) => `<div class="phones">${shot(join(STG, '1280'), `${name}-1280`, `${alt} — מחשב`, marks)}${shot(join(STG, '390'), `${name}-390`, `${alt} — טלפון`, marks, { phone: true })}</div>`;

const r1280 = results(join(STG, '1280')), r390 = results(join(STG, '390')), rDark = results(DARK);
const secsOf = (r) => r?.results?.find(x => /סיום:/.test(x.m))?.m.match(/(\d+) מסכים ב-(\d+) שניות/) ?? [];
const row = (label, r) => r ? `<tr><td>${label}</td><td>${r.pass} עברו · ${r.fail} נכשלו</td><td>${secsOf(r)[1] ?? '—'} מסכים · ${secsOf(r)[2] ?? '—'} שניות ללקוח</td></tr>` : `<tr><td>${label}</td><td colspan="2">לא הורץ</td></tr>`;

const html = `<!doctype html><html lang="he" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>ההיכרות מהתיק — רשימות סגורות, בלי מסמכים</title><style>
:root{--bg:#f6f4ef;--card:#fff;--ink:#1f2328;--ink2:#5a6068;--acc:#e8590c;--line:#e4e0d8;--okbg:rgba(47,125,79,.1);--warnbg:rgba(232,89,12,.09)}
@media (prefers-color-scheme:dark){:root:not([data-theme="light"]){--bg:#17181a;--card:#222326;--ink:#ecebe8;--ink2:#a9aaad;--line:#34363a;--okbg:rgba(80,180,120,.14);--warnbg:rgba(232,89,12,.16)}}
:root[data-theme="dark"]{--bg:#17181a;--card:#222326;--ink:#ecebe8;--ink2:#a9aaad;--line:#34363a;--okbg:rgba(80,180,120,.14);--warnbg:rgba(232,89,12,.16)}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font:16px/1.65 system-ui,"Segoe UI",Arial,sans-serif}
main{max-width:980px;margin:0 auto;padding:24px 16px 56px}h1{font-size:1.55rem;line-height:1.3;margin:.2em 0}h2{font-size:1.12rem;margin:0 0 .4em}
.meta{color:var(--ink2);font-size:.9rem}.box{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:16px 18px;margin:14px 0}
.why{border-inline-start:4px solid var(--acc)}nav{display:flex;gap:8px;flex-wrap:wrap;margin:22px 0 8px;position:sticky;top:0;background:var(--bg);padding:8px 0;z-index:5}
nav button{font:inherit;border:1px solid var(--line);background:var(--card);color:var(--ink);border-radius:999px;padding:8px 14px;cursor:pointer;min-height:44px}
nav button[aria-current=true]{background:var(--acc);border-color:var(--acc);color:#fff}
nav button:focus-visible,.shot:focus-visible,.pager button:focus-visible{outline:3px solid var(--acc);outline-offset:2px}
.fig{margin:14px 0 0}.shot{position:relative;display:block;width:100%;padding:0;border:1px solid var(--line);border-radius:8px;cursor:zoom-in;background:#fff;overflow:visible}
.shot img{display:block;width:100%;height:auto;border-radius:8px}
.mk{position:absolute;transform:translate(50%,-110%);min-width:26px;height:26px;padding:0 7px;border-radius:999px;background:var(--acc);color:#fff;font:700 14px/26px system-ui,sans-serif;box-shadow:0 1px 4px rgba(0,0,0,.35)}
.ring{position:absolute;border:2.5px solid var(--acc);border-radius:6px;box-shadow:0 0 0 2px rgba(255,255,255,.75);pointer-events:none}
.phones{display:grid;grid-template-columns:minmax(0,2fr) minmax(0,1fr);gap:14px;align-items:start}@media(max-width:700px){.phones{grid-template-columns:1fr}}
.fig.phone .shot{max-width:390px;margin:0 auto}
figcaption{margin-top:8px;font-size:.93rem;color:var(--ink2)}.marks{margin:4px 0 0;padding:0;list-style:none;display:grid;gap:4px;color:var(--ink)}.marks b{display:inline-grid;place-items:center;min-width:24px;height:24px;border-radius:999px;background:var(--acc);color:#fff;font-size:.85rem;margin-inline-end:6px}
.note{color:var(--ink2);font-size:.92rem}.exp{background:var(--okbg);border-radius:8px;padding:8px 12px;margin-top:10px}
.warn{background:var(--warnbg);border-radius:8px;padding:8px 12px;margin-top:10px}
label.chk{display:flex;gap:8px;align-items:center;margin-top:10px;font-size:.95rem;min-height:44px}
.zoom{position:fixed;inset:0;background:rgba(0,0,0,.85);display:none;align-items:center;justify-content:center;padding:16px;z-index:9;cursor:zoom-out}
.zoom.on{display:flex}.zoom img{max-width:100%;max-height:100%;background:#fff}ul,ol{margin:.3em 0;padding-inline-start:1.3em}li{margin:.3em 0}
.pager{display:flex;justify-content:space-between;gap:8px;margin-top:14px}.pager button{font:inherit;min-height:44px;padding:8px 16px;border-radius:10px;border:1px solid var(--line);background:var(--card);color:var(--ink);cursor:pointer}
.step[hidden]{display:none}table{border-collapse:collapse;width:100%;font-size:.93rem}td,th{padding:6px 8px;border-top:1px solid var(--line);vertical-align:top;text-align:start}td:first-child{color:var(--ink2);width:34%}
code{background:rgba(127,127,127,.15);border-radius:4px;padding:0 4px;direction:ltr;unicode-bidi:isolate}
</style></head><body><main>
<p class="meta">PIVO · מדריך שחרור · 17.10.2026 · «בקשה אחת לתיק המס» — שלב 2 · צילומים מסביבת הבדיקות (staging, הדמיית דפדפן — לא מכשיר אמיתי) עם לקוח דמה «דוד ורחל» · קומיט <code>${esc(COMMIT)}</code> · ${LIVE === 'yes' ? '<b>באתר</b> (253 בייצור 19.10.2026 באישור גיא; גיבוי PIVO/backups/one-request-s2-20261019)' : '<b>ב-staging בלבד — ממתין לאישורך לייצור</b>'}</p>
<h1>ההיכרות מהתיק: מסך «נכון?», מסך «מה יש לכם», ו«של מי / איפה» מרשימות — בלי מסמכים</h1>

<div class="box why"><h2>מה ביקשת ומה קיבלת</h2>
<ul>
<li><b>בלי מסמכים בהיכרות.</b> 12 בקשות מסמך ירדו מהשאלון (תעודת זהות, תלוש, תעודת עוסק, חוזה, אישורים…). הן נשארות לדוח השנתי ולהצהרת ההון. גם מהערכת המס ירדו כל המסמכים (31) — מספרים בלבד.</li>
<li><b>בלי שאלות שהלקוח לא יודע.</b> «הוגש דוח בעבר?» ו«יש מכתב/חוב/דרישה?» עברו למשרד — יישור הקו ברשויות עונה (שלב 4). (מקדמות — אין שאלה כזאת בהיכרות; יישור הקו מכסה.)</li>
<li><b>מה שידוע — מאשרים במסך אחד.</b> «מה שכבר ידוע לנו — נכון?»: כל מה שבתיק (משפחה, כתובת, מעסיקים, נכס, חשבונות) בשורות, «נכון / יש שינוי» בכל שורה. «יש שינוי» פותח מיד את העריכה של אותה שורה.</li>
<li><b>מה שלא ידוע — מסך רשת אחד.</b> «סמנו מה יש לכם»: אריח לכל תחום (עבודה, עסק, נכס מושכר, השקעות, חו״ל, קריפטו, פנסיה עצמאית, קצבה, ביטוח, תואר/שחרור, עלייה/נכות) — רק מה שהתיק לא יודע. לזוג: «מסמנים גם אם זה רק של אחד מכם».</li>
<li><b>מה שסומן — «של מי / איפה» מרשימה.</b> בנקים (לפי קוד בנק ישראל), בתי השקעות, קופות וגופים מוסדיים, חברות ביטוח, זירות קריפטו, מדינות — עם חיפוש. «אחר» תמיד קיים. השרת דוחה ערך שלא ברשימה.</li>
<li><b>שם המעסיק/העסק — השדה החופשי היחיד.</b> כל השאר בחירה. טקסט חופשי נוסף יש רק כשמסמנים «יש שינוי» על שורה בלי טופס מובנה (המצב המשפחתי).</li>
<li><b>ללא סבב מול המשרד באמצע:</b> מה שמסומן במסך הרשת פותח מיד את שאלות ההמשך (באותה ישיבה). בסוף: «התשובות נשלחו למשרד», בלי «נשארו מסמכים».</li>
</ul></div>

<nav aria-label="צעדים"><button type="button" data-go="0" aria-current="true">1. המשרד מכין ומפרסם</button><button type="button" data-go="1">2. «נכון?»</button><button type="button" data-go="2">3. «סמנו מה יש לכם»</button><button type="button" data-go="3">4. «של מי / איפה»</button><button type="button" data-go="4">5. סיום ומה המשרד רואה</button><button type="button" data-go="5">6. מה נבדק ומה נשאר</button></nav>

<section class="box step" data-step="0"><h2>1 · המשרד פותח — והשאלון כבר בדף של הלקוח (שלב 1 + שלב 2 יחד)</h2>
<p>בתיק המס ← «השלם עם הלקוח» ← שורת הקליטה ב«בקשות». ההיכרות נשלחת לבד (שלב 1, 254): בלי «הוסף שאלות» ובלי «פרסם». בין השאלות שפורסמו: האישורים מהתיק, שאלה אחת «סמנו מה יש לכם» (במקום 11 שאלות פתיחה), ילדים, חשבון בנק — ואף מסמך.</p>
${shot(join(STG, '1280'), '01-office-prepared-1280', 'שורת הקליטה ב«בקשות»: ממתין ללקוח — השאלות כבר בדף שלו', ['ממתין ללקוח — השאלות כבר בדף', 'שבב המצב'])}
<p class="try exp"><b>לבדוק:</b> לקוח ← תיק מס ← «השלם עם הלקוח». השורה מראה «אצל דוד · 0 מתוך N» בלי שום לחיצה נוספת; בדף של הלקוח — מסך «נכון?», מסך הרשת, ואין «תעודת זהות» / «תלוש».</p>
<div class="pager"><button type="button" data-go="-1" disabled>→ הקודם</button><button type="button" data-go="1">הבא ←</button></div></section>

<section class="box step" data-step="1" hidden><h2>2 · «מה שכבר ידוע לנו — נכון?» — כל האישורים במסך אחד</h2>
<p>הלקוח פותח את «השלמת פרטים לתיק המס» בדף שלו. המסך הראשון: כל מה שבתיק, שורה לכל נושא, «נכון» מסומן כברירת מחדל. «יש שינוי» על שורה פותח אותה לתיקון מיד אחרי הלחיצה על «הבא». בלי שום דבר בתיק — אין המסך הזה.</p>
${pair('02-confirm-all', '«מה שכבר ידוע לנו — נכון?»', ['מה שכבר ידוע לנו', 'נכון / יש שינוי'])}
${shot(join(STG, '390'), '03-changed-row-390', 'השורה שסומנה «יש שינוי» (המצב המשפחתי) — נפתחת לתיקון מיד אחרי האישור', ['התיקון של השורה שסומנה'], { phone: true })}
<p class="try exp"><b>לבדוק:</b> בדף הלקוח — «נכון» על הכול ו«יש שינוי» על שורה אחת ← «הבא — לתקן מה שהשתנה» ← נפתחת רק השורה שסומנה. במשרד: «אין שינוי — N פריטים · אשר את כולם».</p>
<div class="pager"><button type="button" data-go="-1">→ הקודם</button><button type="button" data-go="1">הבא ←</button></div></section>

<section class="box step" data-step="2" hidden><h2>3 · «סמנו מה יש לכם» — אריח לכל תחום, רק מה שהתיק לא יודע</h2>
<p>במקום 11 שאלות «האם יש לך…» אחת אחרי השנייה — מסך אחד. מה שהתיק כבר יודע (מעסיקים, נכס, חשבון) לא מופיע כאריח. «אין לנו אף אחד מאלה» — תשובה. לזוג: אריח אחד לשניכם; «של מי» נשאל אחר כך.</p>
${pair('04-grid', 'מסך הרשת «סמנו מה יש לכם»', ['סמנו מה יש לכם', 'אין לנו אף אחד מאלה'])}
<p class="try exp"><b>לבדוק:</b> מסמנים 2–3 אריחים ← «הבא» ← מיד נפתחת שאלת «של מי / איפה» של הראשון (בלי לחזור למשרד). «שמירה ויציאה» באמצע וחזרה מאותו קישור — למסך הרשת, לא מההתחלה.</p>
<div class="pager"><button type="button" data-go="-1">→ הקודם</button><button type="button" data-go="1">הבא ←</button></div></section>

<section class="box step" data-step="3" hidden><h2>4 · «של מי / איפה» — רשימות סגורות עם חיפוש</h2>
<p>לכל מה שסומן: «של מי» (אני / בן/בת הזוג / שנינו — רק לזוג), «איפה» מרשימה עם חיפוש (בנק, בית השקעות, קופה, חברת ביטוח, זירה, מדינה), ולפעמים בחירה (סוג הקופה, איזה ביטוח). למעסיק: שם (חופשי) + «כל השנה / חלק» + «עוד מעסיק». לעסק: שם + איך רשום (כשהתיק כבר יודע שהאדם עוסק — מוצג מראש).</p>
${shot(join(STG, '390'), '05b-entity-filled-390', '«של מי / איפה» — תשובה מהרשימה', ['של מי / איפה — מהרשימה'], { phone: true })}
${shot(join(STG, '1280'), '05-entity-1280', 'הרשימה עם חיפוש — מחשב', ['של מי / איפה', 'חיפוש ברשימה'])}
<p class="try exp"><b>לבדוק:</b> מקלידים «הפועלים» ← בוחרים ← ✓ עם «שינוי». מקלידים משהו שלא קיים ← נשאר «אחר (לא ברשימה)». אין שדה טקסט חופשי חוץ משם המעסיק/העסק.</p>
<div class="pager"><button type="button" data-go="-1">→ הקודם</button><button type="button" data-go="1">הבא ←</button></div></section>

<section class="box step" data-step="4" hidden><h2>5 · סיום בלי מסמכים — והמשרד רואה את התשובה כטקסט</h2>
<p>בסוף: «התשובות נשלחו למשרד». אין «נשארו N מסמכים להשלמה». במשרד, בשורת הקליטה: «לפי דוד: אין שינוי — N», «לפי דוד: «לא» — N נושאים», ולכל «כן» שורה עם «של רחל · ארצות הברית · חשבון בנק» — ואישור כרגיל. (בשלב 3 התשובות ייכנסו ישר לתיק כ«ממתין לאישורך».)</p>
${pair('06-done', 'סיום: «התשובות נשלחו למשרד» — בלי מסמכים', [])}
${shot(join(STG, '1280'), '07-office-review-1280', 'המשרד: מה הלקוח מסר — מהרשימות, בשם (של רחל) ובשם הגוף', ['מה הלקוח מסר — מהרשימות'])}
<h2 style="margin-top:18px">מצב כהה (טלפון, staging)</h2>
<div class="phones">${shot(DARK, '02-confirm-all-390-dark', '«נכון?» — כהה', [], { phone: true })}${shot(DARK, '04-grid-390-dark', 'מסך הרשת — כהה', [], { phone: true })}</div>
<div class="pager"><button type="button" data-go="-1">→ הקודם</button><button type="button" data-go="1">הבא ←</button></div></section>

<section class="box step" data-step="5" hidden><h2>6 · מה נבדק, מה השתנה בקטלוג, ומה נשאר</h2>
<table><tr><th>ריצה</th><th>תוצאה</th><th>המסלול של הלקוח</th></tr>
${row('staging · מחשב 1280 · בהיר', r1280)}${row('staging · טלפון 390 · בהיר', r390)}${row('staging · טלפון 390 · כהה', rDark)}
<tr><td>בדיקות יחידה</td><td colspan="2">1965 עברו, 0 נכשלו (6 חדשות: לקוח חדש = N מסכים, תיק מלא = «נכון?» + רשת, זוג, רשימות, קטלוג, בן/בת זוג של עוסק)</td></tr>
<tr><td>מיגרציה 253 בבידוד (PGlite, על הגופים החיים של staging)</td><td colspan="2">36 עברו, 0 נכשלו — כולל חזרה (rollback) והחלה מחדש</td></tr>
<tr><td>staging</td><td colspan="2">253 הוחלה ומאומתת (<code>scripts/sql/253/apply-staging.mjs</code>); 0 מיילים ללקוח הבדיקה; לקוחות הבדיקה נמחקו — 0 שאריות</td></tr></table>
<h2 style="margin-top:16px">מה השתנה בקטלוג (בלי שינוי מפתח)</h2>
<ul>
<li><b>12</b> פריטי מסמך ירדו מההיכרות (נשארים כזהות הראיות שנשמרו): ת.ז., אישור תושבות, אישורי תואר/שחרור, אישורי מעמד, תלוש, תעודת עוסק, חוזה שכירות, אישור קצבה, אישור ביטוח, דוח ושומה קודמים, מכתבים, אישור ניהול חשבון.</li>
<li><b>2</b> שאלות עברו למשרד: «הוגש דוח בעבר», «מכתב/דרישה/חוב».</li>
<li><b>10</b> פריטי «של מי / איפה»: מעסיק, עסק, הנהלת חשבונות, נכס מושכר, חשבון השקעות, מקור בחו״ל, קופה — ו-3 חדשים: זירת קריפטו, משלם קצבה, חברת ביטוח. <b>0</b> שדות טקסט חופשי נשארו (חוץ משם המעסיק/העסק בתוך הפריט).</li>
<li><b>11</b> שאלות פתיחה הפכו לאריחים; פריט אחד חדש למסך הרשת (<code>intake.whatYouHave</code>).</li>
<li><b>31</b> פריטי מסמך ירדו מהערכת המס.</li>
<li>שרת: <code>_tax_year_items</code> (241 פריטים) ו-<code>_tax_institutions</code> (8 רשימות, 139 ערכים) נוצרים מאותו קטלוג בקוד (<code>scripts/sql/253/build-items.mjs</code>).</li>
</ul>
<h2 style="margin-top:16px">מה לא נבדק / פערים</h2>
<ul>
${LIVE === 'yes' ? '<li>בייצור מ-19.10.2026 (מיזוג ל-master + 253 אחרי גיבוי + פריסה). חזרה: <code>scripts/sql/253/rollback-253.sql</code> + החזרת האתר.</li>' : '<li class="warn">לא בייצור. ממתין לאישורך; ההחלה בייצור דורשת 241 חיה שם (כן) ו-<code>apply-staging.mjs --target=prod --approved</code>.</li>'}
<li>נבדק יחד עם שלב 1 (254, כבר בייצור): פתיחת ההיכרות ⇒ 10 שאלות מתפרסמות לבד כולל מסך הרשת ⇒ הלקוח עונה ⇒ המשרד רואה בשורה האחת. 0 מיילים, 0 שאריות.</li>
<li>הבדיקה היא הדמיית דפדפן, לא מכשיר אמיתי; הזמן ללקוח נמדד עם לחיצות אוטומטיות (לא זמן קריאה של אדם).</li>
<li>תרומות אינן אריח בהיכרות (אין להן פריט בקטלוג ההיכרות — הן שאלה של הדוח השנתי). אם רוצים — פריט חדש.</li>
<li>«למדריך» וכתובת עם מיקוד אוטומטי — שלב 6. סקריפט ה-e2e הישן של האיסוף (<code>collection-flows.mjs</code>) מיושן מול מסך «בקשות» החדש ולא עודכן; הבדיקה החדשה: <code>scripts/e2e/intake-closed-lists.mjs</code>.</li>
</ul>
<div class="pager"><button type="button" data-go="-1">→ הקודם</button><button type="button" data-go="1" disabled>הבא ←</button></div></section>

<div class="zoom" role="dialog" aria-label="תמונה מוגדלת"><img alt=""></div>
<script>
const steps=[...document.querySelectorAll('.step')],navs=[...document.querySelectorAll('nav button')];let cur=0;
function show(i){cur=Math.max(0,Math.min(steps.length-1,i));steps.forEach((s,k)=>{s.hidden=k!==cur});navs.forEach((b,k)=>b.setAttribute('aria-current',k===cur?'true':'false'));window.scrollTo({top:0});}
navs.forEach((b,k)=>b.addEventListener('click',()=>show(k)));
document.querySelectorAll('.pager button').forEach(b=>b.addEventListener('click',()=>show(cur+Number(b.dataset.go))));
const z=document.querySelector('.zoom');document.querySelectorAll('.shot').forEach(b=>b.addEventListener('click',()=>{z.querySelector('img').src=b.querySelector('img').src;z.classList.add('on')}));
z.addEventListener('click',()=>z.classList.remove('on'));document.addEventListener('keydown',e=>{if(e.key==='Escape')z.classList.remove('on')});
</script></main></body></html>`;
writeFileSync(join(here, 'index.html'), html);
console.log(`נכתב: ${join(here, 'index.html')} (${Math.round(html.length / 1024)} KB)`);

#!/usr/bin/env node
// בונה את המדריך העצמאי (index.html) מצילומי ה-e2e: תמונות מוטמעות כ-base64, סימונים לפי מיקומים שנמדדו
// בזמן הצילום (<name>-<vp>.json של scripts/e2e/form-821-live.mjs). הרצה:
//   node docs/release-guides/2026-10-16-form-821-live/build-guide.mjs <תיקיית צילומים> [--commit=<sha>] [--live=yes|pending]
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
<title>טופס 821 חי — מתעדכן תוך כדי מילוי</title><style>
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
<p class="meta">PIVO · מדריך שחרור · 16.10.2026 · צילומים מסביבת הבדיקות (staging, הדמיית דפדפן — לא מכשיר אמיתי) עם לקוח דמה «דוד בדיקה» · קוד: ${esc(COMMIT)} · ${LIVE === 'yes' ? '<b>באתר (crm.yasharcpa.co.il), מיגרציה 251 בייצור</b>' : '<b>עדיין לא באתר</b> — ממתין לפריסה; מיגרציה 251 ב-staging בלבד'}</p>
<h1>טופס 821 חי — מתעדכן תוך כדי מילוי, מראה מה חסר ואיפה חותמים</h1>

<div class="box why"><h2>מה ביקשת ומה קיבלת</h2>
<ul>
<li><b>תצוגה חיה:</b> כל פרט שממלאים — במשרד («מילוי עכשיו») או בדף של הלקוח — מופיע מיד במקומו על טופס 821. בלי «שמור», בלי רענון. השמירה עדיין בלחיצה.</li>
<li><b>כל תיבת חובה מסומנת על הטופס:</b> ריקה — מסגרת אדומה עם «!»; מלאה — ✓ ירוק. למעלה שורת סיכום «חסר בטופס · N»; לחיצה על תיבה אדומה (או על הצ'יפ) פותחת את השאלה הנכונה.</li>
<li><b>אזור חתימת הלקוח מסומן</b> תמיד — «כאן הלקוח חותם» במשרד, «כאן תיכנס החתימה שלך» אצל הלקוח, «נחתם» אחרי. החתימה נכנסת בדיוק לתיבת «חתימה וחותמת» (נבדק על הקובץ שנשמר). המשרד אינו חותם במקום הלקוח.</li>
<li><b>שדות שהיו חסרים מול מסך «פתיחת תיק» של רשות המסים:</b> <b>תאריך פתיחת העסק</b> — תאריך מלא, נשמר בכרטיס העסק, ומודפס חודש/שנה בתיבה ליד המחזור; <b>ענף כלכלי</b> — רשימה סגורה (ענפי-העל של הלמ״ס), נשמר בכרטיס העסק ומודפס בשורת «תאור מלא של פעילות העסק»; <b>«לא קיים נכס»</b> — בחירה; כשאין נכס, תיבות הנכס נשארות ריקות ולא נדרשות.</li>
<li><b>ענף כלכלי — הרשימה הרשמית (סבב 2, ערב):</b> 591 הענפים של רשות המסים (אותם קודים שבמסך «פתיחת תיק»), עם חיפוש לפי מילה או קוד — בשאלון ובכרטיס ← עסקים.</li>
<li><b>סוג עוסק לפי הענף ולפי המחזור:</b> ענף שחייב ברישום כעוסק מורשה (תקנה 13 לתקנות הרישום — עורכי דין, רו״ח, יועצי מס, אדריכלים, רופאים, בתי ספר לנהיגה…) ⇒ «לפי הענף: עוסק מורשה»; אחרת «לפי המחזור: פטור/מורשה» (תקרת 2026: 122,833 ₪). עסק שהטופס יוצר בכרטיס מקבל את הסוג הזה. נושא חדש בידע המס מסביר הכול, עם מקורות.</li>
</ul></div>

<nav aria-label="צעדים">
<button type="button" data-go="1" aria-current="true">1 · מה חסר</button>
<button type="button" data-go="2">2 · מילוי חי</button>
<button type="button" data-go="3">3 · הכול מלא</button>
<button type="button" data-go="4">4 · הלקוח</button>
<button type="button" data-go="5">5 · חתימה</button>
<button type="button" data-go="6">6 · בטלפון</button>
<button type="button" data-go="7">7 · ענף ומורשה</button>
</nav>

<section class="step box" data-step="1"><h2>1 · «בקשות» ← הטופס ← «פתיחה»: רואים במבט אחד מה חסר</h2>
<p>בכרטיס הלקוח ← «בקשות» ← שורת «רישום עוסק במע״מ (821)» ← «פתיחה». הטופס עצמו מוצג משמאל, וכל תיבת חובה שעוד ריקה מסומנת באדום. מה שבא מהכרטיס (ת.ז., כתובת, טלפון) כבר מסומן ✓.</p>
${shot('a1-panel-missing-desktop', 'פאנל הבקשה — תיבות חובה חסרות מסומנות באדום על הטופס', [
  { sel: '.cf-live-sum', text: 'שורת הסיכום: כמה תיבות חובה חסרות, ואילו (צ׳יפ = לחיצה פותחת את השאלה)' },
  { sel: '.cf-live-legend', text: 'מקרא: חסר / מלא / כאן הלקוח חותם' },
  { sel: '.sf-hot[data-hot="businessName"]', text: 'תיבה אדומה עם «!» — חסר. לחיצה עליה פותחת «מילוי עכשיו» על השדה הזה', anchor: 'left' },
  { sel: '.sf-hot.is-sign .sf-hot-tag', text: 'אזור חתימת הלקוח: «כאן הלקוח חותם (בדף האישי)»', anchor: 'left' },
  { sel: '[data-cf-sign-note]', text: 'הסבר קבוע: הלקוח חותם בדף שלו, והחתימה נכנסת לתיבה המסומנת' },
])}
<p class="exp">צפוי: הסיכום אומר «חסר בטופס · 14» ללקוח שבכרטיסו רק זהות וכתובת. התיבות האדומות הן בדיוק אלה שהסיכום מונה.</p>
<label class="chk"><input type="checkbox"> בדקתי: הטופס נפתח עם סימונים אדומים וירוקים ותג חתימה</label>
</section>

<section class="step box" data-step="2" hidden><h2>2 · «מילוי עכשיו במשרד» — מה שמקלידים מופיע מיד על הטופס</h2>
<p>לוחצים על תיבה אדומה (או על «מילוי עכשיו במשרד»). מקלידים שם עסק, בוחרים ענף כלכלי מהרשימה, כותבים מה העסק עושה — ועוד לפני «שמירה» הטופס משמאל מתמלא והתיבות הופכות ל-✓. במסד עדיין לא נשמר דבר עד שלוחצים «שמירה».</p>
${shot('a2-panel-live-typing-desktop', 'מילוי במשרד — שם העסק והענף כבר על הטופס לפני שמירה', [
  { sel: '[data-cf-key="businessName"]', text: 'הקלדה של שם העסק…' },
  { sel: '.sf-hot[data-hot="businessName"]', text: '…ומיד מופיע על הטופס עם ✓ (בלי שמירה)', anchor: 'left' },
  { sel: '[data-cf-key="industry"]', text: 'ענף כלכלי — רשימה סגורה (ענפי-העל של הלמ״ס)' },
  { sel: '.sf-hot[data-hot="activity.1"]', text: 'שורת «תאור מלא של פעילות העסק» — התיאור ואחריו «ענף: …»', anchor: 'left' },
])}
<p class="exp">צפוי: המונה בסיכום יורד תוך כדי הקלדה (14 ⇒ 12). «שמירה» שומרת בכרטיס (עסק: שם, ענף, תאריך פתיחה) ובבקשה (מחזור, נכס).</p>
<p class="warn">שים לב: «תאריך פתיחת העסק» הוא עכשיו תאריך מלא (כמו במסך «פתיחת תיק» של הרשות) ומותר תאריך עתידי — על הטופס מודפסים רק חודש ושנה.</p>
<label class="chk"><input type="checkbox"> בדקתי: הקלדתי שם עסק ובחרתי ענף — הופיעו על הטופס לפני שמירה</label>
</section>

<section class="step box" data-step="3" hidden><h2>3 · הכול מלא — וסוג העוסק לפי המחזור</h2>
<p>אחרי מילוי כל התיבות (עוד לפני שמירה): הסיכום הופך לירוק «כל תיבות החובה בטופס מלאות». ליד המצב מופיע «לפי המחזור: עוסק פטור» (מחזור 40,000 ₪, מתחת לתקרה). תיבת החתימה נשארת מסומנת — זו היחידה שרק הלקוח ממלא.</p>
${shot('a3-panel-all-filled-desktop', 'כל תיבות החובה מלאות; סוג העוסק לפי המחזור', [
  { sel: '.cf-live-sum', text: '«כל תיבות החובה בטופס מלאות»' },
  { sel: '[data-cf-status-note]', text: '«לפי המחזור: עוסק פטור» — נגזר מתקרת עוסק פטור לשנת הפתיחה' },
  { sel: '.sf-hot[data-hot="openDate"]', text: 'תאריך הפתיחה 31.08.2026 ⇒ «08 | 26» בתיבות חודש/שנה', anchor: 'left' },
  { sel: '.sf-hot.is-sign .sf-hot-tag', text: 'תיבת החתימה — עדיין מחכה ללקוח', anchor: 'left' },
])}
<p class="exp">צפוי אחרי «שמירה»: בכרטיס הלקוח ← «עסקים»: שם העסק, ענף כלכלי, תאריך פתיחה, סוג «עוסק פטור». מחזור ונכס נשמרים על הבקשה בלבד.</p>
<label class="chk"><input type="checkbox"> בדקתי: אחרי שמירה הפרטים בכרטיס העסק</label>
</section>

<section class="step box" data-step="4" hidden><h2>4 · הדף של הלקוח — הטופס לצד השאלות</h2>
<p>הלקוח פותח «למילוי וחתימה» בדף האישי. נשארו לו רק מסכי ההצהרה (פתיחת העסק, הנכס); במחשב הטופס החי מוצג לצד השאלות, והתיבה של השאלה הנוכחית מודגשת בצהוב. במסך הנכס יש «קיים נכס / לא קיים נכס».</p>
${shot('b1-client-screen-live-desktop', 'דף הלקוח — השאלות והטופס החי זה לצד זה', [
  { sel: '[data-cf-key="openDate"]', text: 'הערכים שהמשרד מילא כבר בשדות — הלקוח רק מאשר או מתקן' },
  { sel: '.sf-hot.is-active', text: 'התיבה של השאלה הנוכחית מודגשת על הטופס', anchor: 'left' },
  { sel: '.sf-hot.is-sign .sf-hot-tag', text: '«כאן תחתמו בסוף»', anchor: 'left' },
])}
${shot('b2-client-property-desktop', 'מסך הנכס — קיים נכס / לא קיים נכס', [
  { sel: '[data-cf-key="propExists"]', text: '«לא קיים נכס» — כשבוחרים, תיבות הנכס בטופס נשארות ריקות ולא נדרשות' },
])}
<p class="exp">צפוי: שינוי המחזור אצל הלקוח מצייר את הטופס מחדש מיד. «הבא» שומר ועובר למסך הבא.</p>
<label class="chk"><input type="checkbox"> בדקתי: הטופס לצד השאלות, התיבה הנוכחית מודגשת</label>
</section>

<section class="step box" data-step="5" hidden><h2>5 · סקירה וחתימה — החתימה נכנסת לתיבה המסומנת</h2>
<p>בסקירה: «כל תיבות החובה בטופס מלאות», ותיבת «חתימה וחותמת» מסומנת «כאן תיכנס החתימה שלך». אחרי החתימה — «נחתם» על התיבה; במשרד הקובץ החתום נשמר במסמכי הלקוח, והחתימה יושבת בתוך התיבה (נבדק בפיקסלים: 0 גלישה מחוץ לתיבה).</p>
${shot('b3-client-review-desktop', 'סקירה לפני חתימה', [
  { sel: '.cf-live-sum', text: 'הכול מלא — אפשר לחתום' },
  { sel: '.sf-hot.is-sign .sf-hot-tag', text: '«כאן תיכנס החתימה שלך»', anchor: 'left' },
])}
${shot('c1-office-signed-desktop', 'המשרד אחרי החתימה — הקובץ החתום', [
  { sel: '.sf-hot.is-signed .sf-hot-tag', text: '«נחתם» על תיבת החתימה; החתימה בתוכה', anchor: 'left' },
  { sel: '.cfp-status', text: 'המצב: נחתם · לפי המחזור: עוסק פטור' },
])}
<p class="warn">ב-staging אין חותמת משרד בפרופיל הבדיקה ולכן מופיע «הפקה בלי החותמת». בייצור, עם החותמת מ«פרטי המשרד», הצהרת המייצג נצרבת עם החותמת — כמו מ-16.10 בבוקר.</p>
<label class="chk"><input type="checkbox"> בדקתי: אחרי החתימה הקובץ במסמכים, והחתימה בתיבה</label>
</section>

<section class="step box" data-step="6" hidden><h2>6 · בטלפון (הדמיה 390px)</h2>
<p>בטלפון הטופס החי מקופל מתחת לשאלות — «הטופס מתמלא תוך כדי — להצצה». בסקירה הטופס ברוחב המסך, התגים קטנים יותר, ותג החתימה נפתח לתוך העמוד.</p>
<div class="phones">
${shot('b1-client-screen-live-mobile', 'טלפון: מסך פתיחת העסק עם הטופס המקופל', [
  { sel: '[data-cf-live-mobile] > summary', text: '«להצצה» פותח את הטופס החי מתחת לשאלות' },
], { phone: true })}
${shot('b3-client-review-mobile', 'טלפון: סקירה עם «כאן תיכנס החתימה שלך»', [
  { sel: '.sf-hot.is-sign .sf-hot-tag', text: 'תג החתימה בטלפון', anchor: 'left' },
], { phone: true })}
</div>
<p class="note">זו הדמיית דפדפן (Chrome, 390×844 ו-360×780), לא מכשיר אמיתי. גם במצב כהה (מחשב) — אותו מסלול, 39/39.</p>
</section>

<section class="step box" data-step="7" hidden><h2>7 · ענף מהרשימה הרשמית — ומי חייב להיות עוסק מורשה</h2>
<p>«ענף כלכלי» הוא עכשיו חיפוש ב-591 הענפים של רשות המסים (מילה או קוד). ענף שחייב ברישום כעוסק מורשה מסומן כבר ברשימה; כשבוחרים אותו, המצב ליד הכותרת משתנה מיד ל«לפי הענף: עוסק מורשה (תקנה 13…)», גם אם המחזור מתחת לתקרה. ליד המצב — «ללמוד: פטור או מורשה».</p>
${shot('a3b-panel-licensed-branch-desktop', 'ענף 6921 (ראיית חשבון) — חייב ברישום כעוסק מורשה', [
  { sel: '[data-cf-key="industry"]', text: 'הענף שנבחר, עם ההערה «ענף זה חייב ברישום כעוסק מורשה (תקנה 13(1))»' },
  { sel: '[data-cf-status-note]', text: 'המצב השתנה חי: «לפי הענף: עוסק מורשה» — עוד לפני שמירה' },
])}
<p>ב«מס» ← «ידע מקצועי» ← «עסק, מע״מ וניהול ספרים» נוסף הנושא <b>«עוסק פטור או עוסק מורשה — לפי המחזור ולפי הענף»</b>: ההבדל, התקרה, תקנה 13 במלואה, טבלת ענף ⇒ סיווג (מחייב / מותנה, עם מה בודקים), מחשבון מחזור+ענף, מה פתוח, תרגול ומה עושים בתיק. כל טענה מסומנת מאומת / פרשנות / פתוח, והמקורות בסוף.</p>
${shot('k1-dealer-topic-desktop', 'נושא «עוסק פטור או עוסק מורשה» בידע המס', [])}
${shot('k2-dealer-branches-desktop', 'טבלת ענף ⇒ סיווג לפי תקנה 13', [])}
<p class="warn">המיפוי ענף ⇒ «חייב מורשה» הוא פרשנות של המשרד (התקנה מונה מקצועות, לא קודים). ענפים «מותנים» (הדרכה לקבוצות, בריאות אחרת, נדל״ן בבעלות, השכרת רכב) מוצגים כהערה — המשרד מכריע.</p>
<label class="chk"><input type="checkbox"> בדקתי: חיפוש ענף, סימון «מורשה», והנושא בידע המס</label>
</section>

<div class="pager"><button type="button" id="prev">→ הקודם</button><button type="button" id="next">הבא ←</button></div>

<div class="box"><h2>מה נבדק</h2>
<table>
<tr><td>דפדפן מול staging (מסד אמיתי)</td><td><code>scripts/e2e/form-821-live.mjs</code>: משרד ← מילוי חי ← שמירה ← לקוח ← חתימה ← קובץ חתום, כולל 4440 שלא נשבר. 39/39 במחשב 1280, בטלפון 390 ו-360, ובמצב כהה. 0 שגיאות קונסול, 0 מיילים, 0 שאריות.</td></tr>
<tr><td>שרת</td><td>מיגרציה 251 ב-staging; <code>staging-test-smart-client-forms</code> 56/56 (כולל ענף, תאריך פתיחה, «לא קיים נכס», סוג עוסק).</td></tr>
<tr><td>הקובץ</td><td><code>test-smart-client-forms</code>: 3 תרחישי 821 (כולל «לא קיים נכס») + 4440 — אפס דיו מחוץ לשדות, דטרמיניסטי. החתימה בתוך תיבת «חתימה וחותמת» נבדקה בפיקסלים על הקובץ שנשמר.</td></tr>
<tr><td>ענפים וסוג עוסק (סבב 2)</td><td>רשימת 591 הענפים מאתר רשות המסים; מיגרציה 252 ב-staging (58/58); e2e 41/41 כולל ענף מחייב (6921 ⇒ מורשה חי); נושא ידע המס נבדק בדפדפן. מחקר: docs/tax-foundation/research/vat-dealer-classification-2026-10-16.md.</td></tr>
<tr><td>קוד</td><td>tsc נקי · unit 1931+/0 · build.</td></tr>
</table></div>

<div class="box"><h2>מה לא נעשה / להחלטה</h2>
<ul>
<li><b>ענפים «מותנים»</b> בתקנה 13 — המשרד מכריע לפי העיסוק בפועל; המיפוי יעודכן אחרי מקרים אמיתיים. דף השירות של רשות המסים לרישום עוסק פטור ותקנה 6א — לא נקראו (חסום לכלי); ראו «פתוח» במחקר.</li>
<li><b>«לא קיים נכס»</b> — בטופס הנייר אין תיבה כזו; תיבות הנכס נשארות ריקות, בלי ניסוח ב«אחר, פרט» (לא המצאנו נוהל).</li>
<li>המסכים באתר החי עם המשתמש שלך — לא נבדקו בידי קלוד (משתמש הבדיקה חסום בייצור); הפונקציות בייצור אומתו מול הקובץ.</li>
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

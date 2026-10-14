/* PIVO · אבות־טיפוס לתשתית המס — נתוני דמה וכללים משותפים
   ‼ כל האנשים, העסקים והסכומים כאן מומצאים. אין כאן נתוני לקוח אמיתיים.
   ‼ ערכי הכללים נלקחו מהמקורות שנבדקו ב-10.10.2026 (ראה current-state-and-coverage.md).
     מה שמסומן secondary/unverified לא אומת במקור ראשוני ומוצג כך גם במסך. */
(function () {
  'use strict';

  const SRC = {
    itaGuide2025: { id: 'itaGuide2025', label: 'רשות המסים · «דע זכויותיך וחובותיך» 2025 (152 עמ׳)', kind: 'primary', url: 'https://www.gov.il/BlobFolder/generalpage/income-tax-guide-knowyourright/he/Guides_IncomeTax_da-2025.pdf', checked: '10.10.2026' },
    form1301_2025: { id: 'form1301_2025', label: 'רשות המסים · טופס 1301 לשנת 2025', kind: 'primary', url: 'https://www.gov.il/he/service/reporting-and-payment-2025-annual-tax-report-for-individuals', checked: '10.10.2026' },
    btlRates2026: { id: 'btlRates2026', label: 'ביטוח לאומי · שיעורי דמי ביטוח לעצמאי מ-01.01.2026', kind: 'primary', url: 'https://www.btl.gov.il/Insurance/National%20Insurance/type_list/Self_Employed/Pages/rates.aspx', checked: '10.10.2026' },
    itc1219: { id: 'itc1219', label: 'רשות המסים · הצהרת הון (מערכת מקוונת וטופס 1219)', kind: 'primary', url: 'https://www.gov.il/he/service/itc1219', checked: '10.10.2026' },
    harel2026: { id: 'harel2026', label: 'גוף מוסדי · טבלת תקרות 2026 (מקור משני)', kind: 'secondary', url: 'https://media.harel-group.co.il/media/eh3fyryd/תקרות-הפקדה-בקופות-הגמל-ובקרנות-השתלמות-2026.pdf', checked: '10.10.2026' },
    officeDoc: { id: 'officeDoc', label: 'מסמך פנימי של המשרד (דוגמה, לא מקור דין)', kind: 'unverified', url: null, checked: '10.10.2026' },
  };

  /* מרשם הכללים: ערך לכל שנה, רמת ביסוס ומקור. תוכן הידע, השאלון והחישוב
     קוראים מכאן — מספר אינו נכתב בתוך טקסט ההסבר. */
  const RULES = {
    'sf.se.rate': { label: 'שיעור הניכוי לקרן השתלמות לעצמאי', unit: '%', byYear: { 2025: { v: 4.5, basis: 'primary', src: 'itaGuide2025' }, 2026: { v: 4.5, basis: 'secondary', src: 'harel2026', note: 'מדריך 2026 טרם פורסם' } }, law: 'סעיף 17(5א)' },
    'sf.se.ceiling': { label: 'תקרת «הכנסה קובעת» לעצמאי', unit: '₪', byYear: { 2025: { v: 293397, basis: 'primary', src: 'itaGuide2025' }, 2026: { v: 293397, basis: 'secondary', src: 'harel2026', note: 'מוקפא לפי מקורות משניים' } }, law: 'סעיף 17(5א)' },
    'sf.se.maxDeduction': { label: 'ניכוי מרבי לקרן השתלמות לעצמאי', unit: '₪', byYear: { 2025: { v: 13203, basis: 'primary', src: 'itaGuide2025' }, 2026: { v: 13203, basis: 'derived', src: 'harel2026' } } },
    'sf.mixed.formula': { label: 'עצמאי שגם שכיר ומעבידו הפקיד לקרן: «סכום התקרה»', unit: 'נוסחה', byYear: { 2025: { v: 'הנמוך מבין: ההכנסה מעסק, לבין התקרה פחות «המשכורת הקובעת» שבשלה הפקיד המעביד', basis: 'primary', src: 'itaGuide2025' } } },
    'sf.se.exemptDeposit': { label: 'תקרת הפקדה מוטבת (פטור ממס רווחי הון) לעצמאי', unit: '₪', byYear: { 2025: { v: 20566, basis: 'secondary', src: 'harel2026' }, 2026: { v: 20566, basis: 'secondary', src: 'harel2026' } }, note: 'לא נמצא במדריך הרשמי; דורש אימות בתקנות/בחוזר' },
    'sf.liquidity': { label: 'משיכה פטורה מקרן השתלמות', unit: 'כלל', byYear: { 2025: { v: 'אחרי 6 שנים מהתשלום הראשון; אחרי 3 שנים להשתלמות או בגיל פרישה', basis: 'primary', src: 'itaGuide2025' } }, law: 'סעיף 9(16ב)' },
    'sf.seniorityStart': { label: 'ממתי נספר הוותק בקרן (תאריך ההפקדה או תחילת השנה)', unit: 'כלל', byYear: { 2025: { v: 'לא הוכרע', basis: 'unverified', src: 'officeDoc' } }, note: 'טענה במסמך המשרד; לא נמצא מקור ראשוני' },
    'pen.mandatory.rates': { label: 'פנסיית חובה לעצמאי', unit: '%', byYear: { 2025: { v: '4.45% עד מחצית השכר הממוצע · 12.55% עד השכר הממוצע', basis: 'primary', src: 'itaGuide2025' } } },
    'pen.mandatory.halfWage': { label: 'מחצית השכר הממוצע (שנתי)', unit: '₪', byYear: { 2025: { v: 75216, basis: 'primary', src: 'itaGuide2025' }, 2026: { v: 82614, basis: 'derived', src: 'btlRates2026', note: '13,769 × 12 ÷ 2; טרם אומת במדריך מס הכנסה 2026' } } },
    'pen.beneficial.threshold': { label: 'רף «עמית מוטב» (16% מהשכר הממוצע השנתי)', unit: '₪', byYear: { 2025: { v: 24069, basis: 'primary', src: 'itaGuide2025' }, 2026: { v: 26436, basis: 'secondary', src: 'harel2026' } } },
    'pen.qualifying.work': { label: 'הכנסה מזכה — הכנסת עבודה', unit: '₪', byYear: { 2025: { v: 116400, basis: 'primary', src: 'itaGuide2025' }, 2026: { v: 116400, basis: 'secondary', src: 'harel2026' } } },
    'pen.qualifying.nonWork': { label: 'הכנסה מזכה — הכנסה שאינה מעבודה', unit: '₪', byYear: { 2025: { v: 164400, basis: 'primary', src: 'itaGuide2025' } } },
    'pen.trackA': { label: 'מסלול א׳ (כל יחיד) — ניכוי על הכנסה שאינה מעבודה', unit: '%', byYear: { 2025: { v: '7%, ועוד עד 4% כשההפקדה עולה על 12%. מגיל 50: 10.5% / 6% / 16.5%', basis: 'primary', src: 'itaGuide2025' } } },
    'pen.trackB': { label: 'מסלול ב׳ (עמית מוטב) — שני רבדים', unit: 'כלל', byYear: { 2025: { v: 'רובד א׳: 11% מהכנסת העמית העצמאי עד 116,400 פחות ההכנסה המבוטחת · רובד ב׳: 7% (+4%) מ«ההכנסה הנוספת»', basis: 'primary', src: 'itaGuide2025' } } },
    'ni.se.2026': { label: 'דמי ביטוח לעצמאי 2026', unit: '%', byYear: { 2026: { v: '7.7% עד 7,703 ₪ לחודש · 18% עד 51,910 ₪', basis: 'primary', src: 'btlRates2026' } } },
    'micro.business': { label: 'עסק זעיר — ניכוי הוצאות נורמטיבי', unit: '%', byYear: { 2025: { v: '30% מהמחזור; תקרת מחזור 120,000 ₪', basis: 'secondary', src: 'officeDoc', note: 'השדה קיים בטופס 1301 לשנת 2025 (ראשוני); התקרה ממקורות משניים' } } },
    'wealth.deadline': { label: 'מועד הגשת הצהרת הון', unit: 'כלל', byYear: { 2025: { v: '120 יום מיום הדרישה או מתאריך ההצהרה — המאוחר מביניהם', basis: 'primary', src: 'itc1219' } } },
  };

  const BASIS = {
    primary: { label: 'מקור רשמי', cls: 'primary', glyph: '●' },
    secondary: { label: 'מקור משני', cls: 'secondary', glyph: '◐' },
    derived: { label: 'חושב מכלל אחר', cls: 'derived', glyph: '◇' },
    unverified: { label: 'לא אומת', cls: 'unverified', glyph: '○' },
  };

  /* לקוחה לדוגמה: עצמאית שגם שכירה — המקרה שבו הכללים מתנגשים */
  const CASE = {
    id: 'noa', name: 'נועה ברק', initials: 'נב',
    people: [
      { role: 'client', name: 'נועה', desc: 'מעצבת גרפית · עוסקת מורשית · שכירה בחצי משרה' },
      { role: 'spouse', name: 'עידו', desc: 'שכיר · בן הזוג הרשום אינו מוכרע עדיין' },
    ],
    business: { name: 'סטודיו נועה ברק (עסק לדוגמה)', type: 'עוסק מורשה' },
    year: 2026,
    bookkeepingCutoff: '31.08.2026',
    known: [
      { k: 'משכורת חודשית · סטודיו מרחב (דוגמה)', v: '6,000 ₪', who: 'נועה', src: 'תלושים 01–08/2026 · הועלו בדף האישי', basis: 'doc' },
      { k: 'משכורת קובעת לקרן השתלמות (מעביד)', v: '72,000 ₪ לשנה', who: 'נועה', src: 'נגזר מהתלושים · לאשר מול 106', basis: 'derived' },
      { k: 'הכנסה מבוטחת (פנסיה מהמעביד)', v: '72,000 ₪ לשנה', who: 'נועה', src: 'נגזר מהתלושים', basis: 'derived' },
      { k: 'רווח לפני תיאומים 01–08', v: '127,150 ₪', who: 'העסק', src: 'רו״ה פייפרלס · סגור עד 31.08', basis: 'doc' },
      { k: 'מקדמות מס הכנסה', v: '7% · דו־חודשי', who: 'העסק', src: 'שאילתה 134 · נקרא 08.10.2026', basis: 'authority' },
      { k: 'אחוז משרד ביתי', v: '25%', who: 'העסק', src: 'אושר בבקשת «פרטי העסק» · 12.07.2026', basis: 'office' },
      { k: 'ילדים', v: '2 (ילידי 2017, 2021)', who: 'משק הבית', src: 'כרטיס הלקוח', basis: 'card' },
      { k: 'הפקדות לפנסיה כעצמאית 01–08', v: '8,000 ₪', who: 'נועה', src: 'הצהרת הלקוחה · אין עדיין אישור קופה', basis: 'declared' },
    ],
    missing: [
      { id: 'q-dis', k: 'פרמיה לביטוח אובדן כושר עבודה כעצמאית', why: 'משנה את שיעור ההפקדה המזכה בזיכוי (תוספת 0.5%) ואת הניכוי', ask: 'client', kind: 'question' },
      { id: 'q-sf', k: 'האם יש לך קרן השתלמות כעצמאית? מתי הופקד בה לראשונה?', why: 'קובע אם יש ותק קיים, ואם ההפקדה השנה תזכה בניכוי', ask: 'client', kind: 'question' },
      { id: 'd-pen', k: 'אישור שנתי מקרן הפנסיה (אחרי 31.12)', why: 'ההפקדה בפועל קובעת ניכוי וזיכוי, לא ההצהרה', ask: 'client', kind: 'document' },
      { id: 'o-fore', k: 'תחזית רווח ספטמבר–דצמבר', why: 'החלק שלא נסגר בהנהלת החשבונות — הנחת משרד, לא נתון', ask: 'office', kind: 'office' },
      { id: 'o-spouse', k: 'מי בן הזוג הרשום ואיך מחשבים (מאוחד/נפרד)', why: 'מכריע איפה נרשמת כל הכנסה בדוח', ask: 'office', kind: 'office' },
    ],
    conflicts: [
      { id: 'c-0506', k: 'מחזור 05–06/2026', a: { label: 'שאילתה 134', v: 47300 }, b: { label: 'פייפרלס', v: 44800 }, c: { label: 'ESNA (מע״מ)', v: 44800 }, note: 'מקדמות דווחו על מחזור גבוה ב-2,500 ₪ מהנהלת החשבונות ומהמע״מ' },
    ],
    periods: [
      { p: '01–02', books: 'closed', it: { st: 'reported', turnover: 38200, charge: 2674, paid: 2674 }, vat: { st: 'reported', turnover: 38200 }, pnl: 38200 },
      { p: '03–04', books: 'closed', it: { st: 'reported', turnover: 41900, charge: 2933, paid: 2933 }, vat: { st: 'reported', turnover: 41900 }, pnl: 41900 },
      { p: '05–06', books: 'closed', it: { st: 'reported', turnover: 47300, charge: 3311, paid: 3311 }, vat: { st: 'reported', turnover: 44800 }, pnl: 44800 },
      { p: '07–08', books: 'closed', it: { st: 'reported', turnover: 43500, charge: 3045, paid: 3045 }, vat: { st: 'reported', turnover: 43500 }, pnl: 43500 },
      { p: '09–10', books: 'open', it: { st: 'notDue' }, vat: { st: 'notDue' }, pnl: null },
      { p: '11–12', books: 'open', it: { st: 'notDue' }, vat: { st: 'notDue' }, pnl: null },
    ],
    pnlMonths: [
      { m: '01', inc: 18100, exp: 5200 }, { m: '02', inc: 20100, exp: 4800 }, { m: '03', inc: 19800, exp: 5100 },
      { m: '04', inc: 22100, exp: 5600 }, { m: '05', inc: 21400, exp: 4950 }, { m: '06', inc: 23400, exp: 5300 },
      { m: '07', inc: 20300, exp: 5150 }, { m: '08', inc: 23200, exp: 5150 },
      { m: '09', inc: null, exp: null }, { m: '10', inc: null, exp: null }, { m: '11', inc: null, exp: null }, { m: '12', inc: null, exp: null },
    ],
    requests: [
      { id: 'r-est', title: 'הערכת מס 2026', subject: 'נועה', ball: 'office', state: 'סתירה אחת ליישוב · 2 הנחות משרד חסרות', since: '06.10.2026', door: 'year' },
      { id: 'r-ask', title: 'השלמת מידע להערכת מס 2026', subject: 'נועה', ball: 'client', state: 'פורסם בדף האישי · 2 שאלות ומסמך אחד', since: '07.10.2026', door: 'portal' },
      { id: 'r-ann', title: 'דוח שנתי 2025', subject: 'נועה ועידו', ball: 'client', state: 'חסרים 106 של עידו ואישור תרומות', since: '21.09.2026', door: 'annual' },
      { id: 'r-wd', title: 'הצהרת הון ראשונה · ליום 31.12.2025', subject: 'נועה ועידו', ball: 'office', state: 'הדרישה התקבלה 14.09.2026 · להגיש עד 12.01.2027', since: '15.09.2026', door: 'wealth' },
    ],
  };

  const OFFICE = [
    { name: 'נועה ברק', proc: 'הערכת מס 2026', ball: 'office', state: 'סתירה במחזור 05–06', next: 'ליישב מול 134', tone: 'warn', go: true },
    { name: 'אורי טל', proc: 'הערכת מס 2026', ball: 'client', state: 'ממתין לתלושי ספטמבר', next: 'תזכורת נשלחה 05.10', tone: '' },
    { name: 'דניאל אבן', proc: 'הערכת מס 2026', ball: 'office', state: 'קריאת 134 נכשלה — החיבור לשע״ם לא היה מוכן', next: 'להריץ שוב אחרי חיבור', tone: 'err' },
    { name: 'משפחת כהן־לוי', proc: 'דוח שנתי 2025', ball: 'office', state: 'כל המסמכים התקבלו', next: 'לעבור על מאזן הכיסוי', tone: 'ok' },
    { name: 'רונית שמש', proc: 'הצהרת הון ראשונה', ball: 'client', state: 'רשימת נכסים התקבלה חלקית', next: 'מועד: 03.12.2026', tone: '' },
  ];

  const fmt = n => (n == null ? '—' : Math.round(n).toLocaleString('he-IL'));
  const nis = n => (n == null ? '—' : fmt(n) + ' ₪');
  function rule(id, year) {
    const r = RULES[id]; if (!r) return null;
    const ys = Object.keys(r.byYear).map(Number).sort((a, b) => b - a);
    const y = r.byYear[year] ? year : ys.find(x => x <= year) ?? ys[ys.length - 1];
    const e = r.byYear[y];
    return { ...r, year: y, exactYear: y === year, value: e.v, basis: e.basis, src: SRC[e.src], note: e.note || r.note };
  }
  function basisHtml(b) { const m = BASIS[b] || BASIS.unverified; return `<span class="basis ${m.cls}" title="${m.label}"><span aria-hidden="true">${m.glyph}</span>${m.label}</span>`; }

  /* מגירה נגישה: מוקד בפנים, Esc סוגר, חזרה למוקד הקודם */
  function drawer(opts) {
    const prev = document.activeElement;
    const scrim = document.createElement('div'); scrim.className = 'scrim';
    const d = document.createElement('section'); d.className = 'drawer'; d.setAttribute('role', 'dialog'); d.setAttribute('aria-modal', 'true');
    d.setAttribute('aria-labelledby', 'dr-title');
    d.innerHTML = `<div class="drawer-head"><div class="grow"><div class="eyebrow">${opts.eyebrow || ''}</div><h2 id="dr-title" style="margin-top:2px">${opts.title}</h2></div><button class="x" type="button" aria-label="סגירה">×</button></div><div class="drawer-body">${opts.body}</div>${opts.foot ? `<div class="drawer-foot">${opts.foot}</div>` : ''}`;
    document.body.append(scrim, d);
    const close = () => { d.classList.remove('on'); scrim.classList.remove('on'); document.removeEventListener('keydown', onKey); setTimeout(() => { d.remove(); scrim.remove(); }, 300); if (prev && prev.focus) prev.focus(); };
    const onKey = e => {
      if (e.key === 'Escape') close();
      if (e.key === 'Tab') { const f = d.querySelectorAll('button,a,input,select,textarea,summary,[tabindex="0"]'); if (!f.length) return; const first = f[0], last = f[f.length - 1]; if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); } else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); } }
    };
    document.addEventListener('keydown', onKey);
    scrim.addEventListener('click', close); d.querySelector('.x').addEventListener('click', close);
    requestAnimationFrame(() => { scrim.classList.add('on'); d.classList.add('on'); d.querySelector('.x').focus(); });
    if (opts.onOpen) opts.onOpen(d, close);
    return { el: d, close };
  }
  let tt;
  function toast(msg) {
    let t = document.querySelector('.toast');
    if (!t) { t = document.createElement('div'); t.className = 'toast'; t.setAttribute('role', 'status'); document.body.append(t); }
    t.textContent = msg; t.classList.add('on'); clearTimeout(tt); tt = setTimeout(() => t.classList.remove('on'), 3200);
  }
  function protoBar(name) {
    return `<div class="proto-bar" role="note"><strong>אב־טיפוס · ${name}</strong><span>נתוני דמה · לא נשמר ולא נשלח · חישובים להמחשה</span><span class="sp"></span><a href="index.html">כל החלופות</a><button type="button" class="btn ghost sm" id="themeBtn" style="color:inherit">מצב כהה/בהיר</button></div>`;
  }
  function bindTheme() {
    const b = document.getElementById('themeBtn'); if (!b) return;
    b.addEventListener('click', () => {
      const r = document.documentElement; const cur = r.getAttribute('data-theme');
      const dark = cur ? cur === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches;
      r.setAttribute('data-theme', dark ? 'light' : 'dark');
    });
  }
  /* חישוב ניכוי קרן השתלמות לעצמאי שגם שכיר — לפי נוסחת המדריך (ערכי 2025) */
  function studyFundDeduction({ businessIncome, employerSalary, deposit, year = 2026 }) {
    const ceiling = rule('sf.se.ceiling', year).value; const rate = rule('sf.se.rate', year).value / 100;
    const cap = Math.max(0, Math.min(businessIncome, ceiling - (employerSalary || 0)));
    const max = cap * rate; const ded = Math.min(deposit, max);
    const exempt = rule('sf.se.exemptDeposit', year).value;
    return { ceiling, cap, max, ded, overDeduction: Math.max(0, deposit - max), overExempt: Math.max(0, deposit - exempt), exempt };
  }

  /* ‼ טווח מספרים בעברית מתהפך: «05–06» מוצג «06–05». עוטפים כל טווח בבידוד
     LTR (U+2066…U+2069) — גם בטקסט שנוצר אחרי רינדור, דרך MutationObserver. */
  const RANGE = /(\d[\d.,/]*)\s*–\s*(\d[\d.,/]*)/g;
  function isolateRanges(root) {
    const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    const nodes = []; while (w.nextNode()) nodes.push(w.currentNode);
    for (const n of nodes) {
      if (n.parentElement && /^(SCRIPT|STYLE|TEXTAREA)$/.test(n.parentElement.tagName)) continue;
      const t = n.nodeValue; if (!RANGE.test(t)) continue; RANGE.lastIndex = 0;
      const out = t.replace(RANGE, (m, a, b, i, s) => (s[i - 1] === '⁦' ? m : `⁦${a}–${b}⁩`));
      if (out !== t) n.nodeValue = out;
    }
  }
  function watchRanges() {
    isolateRanges(document.body);
    new MutationObserver(ms => ms.forEach(m => m.addedNodes.forEach(n => { if (n.nodeType === 1) isolateRanges(n); else if (n.nodeType === 3 && n.parentNode) isolateRanges(n.parentNode); }))).observe(document.body, { childList: true, subtree: true });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', watchRanges); else watchRanges();

  window.PIVO = { SRC, RULES, BASIS, CASE, OFFICE, fmt, nis, rule, basisHtml, drawer, toast, protoBar, bindTheme, studyFundDeduction, isolateRanges };
})();

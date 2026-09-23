// btl-tracking.mjs — בדיקות השכבה שבה נולד האירוע של 23.09.2026:
// קריאת מסך «מעקב ייפוי כוח» והכרעת הסטטוס. ‼ בלי Chrome ובלי סשן מאומת —
// בדיוק בגלל זה הלוגיקה הוצאה מ-page.evaluate ל-btlTracking.mjs.
//
// ‼ מה שנבדק כאן הוא **החוק**, לא המימוש: «קיימת שורה» לעולם אינו «אושר»,
// וסטטוס שלא זוהה לעולם אינו נופל ל-'approved'.
//
// הרצה:  node test/btl-tracking.mjs
import {
  classifyPoaStatus, normalizeStatusText, selectTrackingRow, toIsoDate,
  sameIdNumber, sameReference,
} from '../src/btlTracking.mjs';
import { confirmationState, btlPageRank } from '../src/btlSession.mjs';

let failures = 0;
let passes = 0;
function check(ok, label, extra) {
  if (ok) { passes++; console.log(`  ✓ ${label}`); }
  else { failures++; console.log(`  ✗ ${label}${extra ? `\n      ${extra}` : ''}`); }
}
function eq(actual, expected, label) {
  check(Object.is(actual, expected), label, `expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
}
function section(title) { console.log(`\n── ${title}`); }

// ── המסך האמיתי, מילה במילה ────────────────────────────────────────────────
// ‼ הועתק מצילום מסך של סשן אמיתי (23.09.2026, חשבון «ישר גיא - רו"ח»),
// כולל עמודת העיפרון הריקה לפני «אסמכתא» ועמודת «שידור טופס» אחרי
// «סטטוס» — כדי שהבדיקה תוכיח שהמיפוי לפי כותרות ולא לפי אינדקס.
const HEADER = ['', 'אסמכתא', 'זהות/תיק מעסיק', 'שם', 'מ/עד תאריך', 'סטטוס', 'שידור טופס'];
const LIVE_ROWS = [
  ['', '75165449', '34605212', 'סלע הדסה', '22/11/2026', 'ממתין לאישור', ''],
  ['', '75074203', '36693828', 'סלע יאיר', '15/11/2026', 'ממתין לאישור', ''],
  ['', '75071159', '209422500', 'וולוצקי ישר דין', '15/11/2026', 'ממתין לאישור', ''],
  ['', '74652298', '312359193', 'לזימי שמעון', '27/08/2026', 'מאושר', ''],
  ['', '74408246', '214131591', 'ישר שי', '18/08/2026', 'מאושר', ''],
  ['', '74100678', '209132901', 'גרוסמן יובל', '04/08/2026', 'מאושר', ''],
  ['', '74031246', '213948433', 'סימנטוב אילן', '02/08/2026', 'מאושר', ''],
  ['', '73882698', '22321673', 'רכס יריב צבי', '27/07/2026', 'מאושר', ''],
];
const LIVE = { headerCells: HEADER, dataRows: LIVE_ROWS };

// ── 1. סיווג הסטטוס ────────────────────────────────────────────────────────
section('סיווג הסטטוס — אישור רק מראיה חיובית');
eq(classifyPoaStatus('ממתין לאישור'), 'pending', 'הניסוח שנצפה חי: «ממתין לאישור» ⇒ pending');
eq(classifyPoaStatus('מאושר'), 'approved', 'הניסוח שנצפה חי: «מאושר» ⇒ approved');
eq(classifyPoaStatus('לא מאושר'), 'cancelled', '«לא מאושר» אינו approved — includes היה נכשל כאן');
eq(classifyPoaStatus('פג תוקף'), 'expired', '«פג תוקף» ⇒ expired');
eq(classifyPoaStatus('בוטל'), 'cancelled', '«בוטל» ⇒ cancelled');
eq(classifyPoaStatus(''), 'unknown', 'תא ריק ⇒ unknown');
eq(classifyPoaStatus(null), 'unknown', 'null ⇒ unknown');
eq(classifyPoaStatus(undefined), 'unknown', 'undefined ⇒ unknown');
eq(classifyPoaStatus('בהמתנה לאישור המבוטח'), 'unknown', 'ניסוח חדש ⇒ unknown, לא ניחוש');
eq(classifyPoaStatus('הבקשה אושרה'), 'unknown', '«אושרה» בתוך משפט אינו approved');
eq(classifyPoaStatus('approved'), 'unknown', 'אנגלית אינה ניסוח של המסך ⇒ unknown');

section('נרמול — תווים בלתי-נראים של דף RTL');
eq(classifyPoaStatus('‏ממתין לאישור‎'), 'pending', 'סימני כיווניות מסביב לטקסט');
eq(classifyPoaStatus('ממתין לאישור'), 'pending', 'NBSP במקום רווח');
eq(classifyPoaStatus('  מאושר  '), 'approved', 'רווחים מובילים/נגררים');
eq(classifyPoaStatus('מאושר:'), 'approved', 'נקודתיים מעיצוב');
eq(classifyPoaStatus('ממתין   לאישור'), 'pending', 'רווחים כפולים');
eq(normalizeStatusText('﻿מאושר⁩'), 'מאושר', 'BOM ו-PDI מוסרים');

// ── 2. בחירת השורה ─────────────────────────────────────────────────────────
section('בחירת השורה — לפי אסמכתא');
{
  const r = selectTrackingRow(LIVE, { referenceNumber: '75165449' });
  eq(r.found, true, 'נמצאה השורה של הדסה סלע');
  eq(r.status, 'pending', 'הסטטוס שלה: pending');
  eq(r.rawStatus, 'ממתין לאישור', 'הטקסט הגולמי נשמר');
  eq(r.referenceNumber, '75165449', 'אסמכתא');
  eq(r.idNumber, '34605212', 'ת.ז. כפי שב"ל מציגה (בלי אפס מוביל)');
  eq(r.deadline, '2026-11-22', 'מועד אחרון מומר ל-ISO');
  eq(r.deadlineRaw, '22/11/2026', 'והגולמי נשמר');
  eq(r.name, 'סלע הדסה', 'שם לתצוגה/אבחון');
}
{
  const r = selectTrackingRow(LIVE, { referenceNumber: '0075165449' });
  eq(r.found, true, 'אסמכתא מרופדת באפסים (כמו ב-PerutKey של ה-URL) מתאימה');
  eq(r.status, 'pending', 'ואותו סטטוס');
}
{
  const r = selectTrackingRow(LIVE, { referenceNumber: '74652298' });
  eq(r.status, 'approved', 'שורה שבאמת מאושרת ⇒ approved');
  eq(r.deadline, '2026-08-27', 'גם במאושרת המועד נקרא ולא נזרק');
}
{
  const r = selectTrackingRow(LIVE, { referenceNumber: '99999999' });
  eq(r.found, false, 'אסמכתא שאינה בטבלה');
  eq(r.reason, 'reference_not_found', 'והסיבה מפורשת');
}

section('בחירת השורה — לפי ת.ז. (אין עדיין אסמכתא)');
{
  const r = selectTrackingRow(LIVE, { idNumber: '034605212' });
  eq(r.found, true, 'ת.ז. עם אפס מוביל מ-PIVO מול תצוגה בלי אפס');
  eq(r.referenceNumber, '75165449', 'האסמכתא הנכונה — של הדסה, לא של שורה אחרת');
  eq(r.status, 'pending', 'והסטטוס שנקרא');
  eq(r.candidates, 1, 'שורה אחת בלבד ענתה');
}
{
  const r = selectTrackingRow(LIVE, { idNumber: '22321673' });
  eq(r.referenceNumber, '73882698', 'ת.ז. אחרת ⇒ האסמכתא שלה');
  eq(r.status, 'approved', 'ולא מתערבבת עם שורות אחרות');
}
{
  const r = selectTrackingRow(LIVE, { idNumber: '999999999' });
  eq(r.found, false, 'ת.ז. שאינה בטבלה');
  eq(r.reason, 'id_not_found', 'והסיבה מפורשת');
}

section('היסטוריה — כמה שורות לאותה ת.ז.');
{
  // ‼ מצב נורמלי לחלוטין: ייפוי כוח ישן שפג/אושר, ואחד חדש שממתין.
  const withHistory = {
    headerCells: HEADER,
    dataRows: [
      ['', '75165449', '34605212', 'סלע הדסה', '22/11/2026', 'ממתין לאישור', ''],
      ['', '70000001', '34605212', 'סלע הדסה', '01/02/2025', 'פג תוקף', ''],
      ...LIVE_ROWS.slice(1),
    ],
  };
  const r = selectTrackingRow(withHistory, { idNumber: '34605212' });
  eq(r.found, true, 'נבחרה שורה');
  eq(r.referenceNumber, '75165449', 'הפעילה (ממתין לאישור) ולא ההיסטורית');
  eq(r.status, 'pending', 'ולכן הסטטוס הוא של הפעילה');
  eq(r.candidates, 2, 'ונשמר שהיו שתי מועמדות');
  eq(r.ambiguous, false, 'העדיפות הכריעה חד-משמעית');
}
{
  // ‼ רק היסטוריה: רישום מאושר ישן, בלי שורה ממתינה. הקורא (היצירה) לא
  // יוצר כפול, ורואה שהוא מאושר — וזה בדיוק הופך לייצוג פעיל ב-CRM.
  const onlyApproved = {
    headerCells: HEADER,
    dataRows: [['', '70000002', '34605212', 'סלע הדסה', '01/02/2025', 'מאושר', '']],
  };
  const r = selectTrackingRow(onlyApproved, { idNumber: '34605212' });
  eq(r.status, 'approved', 'רישום מאושר בלבד ⇒ approved');
}
{
  // ‼ שתי שורות עם אותה **אסמכתא** — אנומליה, לא היסטוריה. לא מכריעים.
  const dupRef = {
    headerCells: HEADER,
    dataRows: [
      ['', '75165449', '34605212', 'סלע הדסה', '22/11/2026', 'ממתין לאישור', ''],
      ['', '75165449', '11111118', 'מישהו אחר', '22/11/2026', 'מאושר', ''],
    ],
  };
  const r = selectTrackingRow(dupRef, { referenceNumber: '75165449' });
  eq(r.found, false, 'אסמכתא כפולה אינה מוכרעת');
  eq(r.reason, 'ambiguous_match', 'והסיבה מפורשת');
}
{
  // ‼ שתי שורות ממתינות לאותה ת.ז. — בוחרים, אבל מסמנים שזו בחירה.
  const twoPending = {
    headerCells: HEADER,
    dataRows: [
      ['', '75165449', '34605212', 'סלע הדסה', '22/11/2026', 'ממתין לאישור', ''],
      ['', '75165450', '34605212', 'סלע הדסה', '23/11/2026', 'ממתין לאישור', ''],
    ],
  };
  const r = selectTrackingRow(twoPending, { idNumber: '34605212' });
  eq(r.found, true, 'לא נכשל — זה מצב שאפשר להתקדם ממנו');
  eq(r.ambiguous, true, 'אבל מסומן כדו-משמעי');
  eq(r.status, 'pending', 'ושתיהן ממתינות ממילא');
}

section('מבנה — עמודות ממופות לפי כותרת, לא לפי אינדקס');
{
  // ‼ אותן שורות, סדר עמודות הפוך לגמרי. אם המיפוי היה לפי אינדקס,
  // הסטטוס היה נקרא מעמודת התאריך והתוצאה הייתה 'unknown' בשקט.
  const flipped = {
    headerCells: ['שידור טופס', 'סטטוס', 'מ/עד תאריך', 'שם', 'זהות/תיק מעסיק', 'אסמכתא', ''],
    dataRows: [['', 'ממתין לאישור', '22/11/2026', 'סלע הדסה', '34605212', '75165449', '']],
  };
  const r = selectTrackingRow(flipped, { referenceNumber: '75165449' });
  eq(r.status, 'pending', 'סדר עמודות שונה — אותה תוצאה');
  eq(r.deadline, '2026-11-22', 'וגם המועד');
}
{
  const renamed = {
    headerCells: ['מספר בקשה', 'ת.ז.', 'שם', 'תאריך', 'מצב'],
    dataRows: [['75165449', '34605212', 'סלע הדסה', '22/11/2026', 'מאושר']],
  };
  const r = selectTrackingRow(renamed, { referenceNumber: '75165449' });
  eq(r.found, false, 'ביטוח לאומי שינתה את שמות העמודות');
  eq(r.reason, 'columns_not_found', 'נכשל בקול — ולא מחזיר "מאושר" מטבלה שלא הבנּו');
}
{
  const r = selectTrackingRow({ headerCells: [], dataRows: [] }, { referenceNumber: '1' });
  eq(r.reason, 'table_not_found', 'אין טבלה בכלל');
}
{
  const r = selectTrackingRow(LIVE, {});
  eq(r.found, false, 'בלי מפתח חיפוש');
  eq(r.reason, 'no_lookup_key', 'לא "השורה הראשונה"');
}
{
  // ‼ GridView מוסיף שורת עימוד/סיכום בלי אסמכתא — אסור שתיחשב רשומה.
  const withPager = {
    headerCells: HEADER,
    dataRows: [...LIVE_ROWS, ['', '', '', '', '', '', '1 2 3']],
  };
  const r = selectTrackingRow(withPager, { referenceNumber: '75165449' });
  eq(r.found, true, 'שורת עימוד אינה מפריעה');
  eq(r.status, 'pending', 'והסטטוס נשאר נכון');
}

section('שתי טבלאות בעמוד — פאנל הסינון מול טבלת הנתונים');
{
  // ‼ נצפה חי: מעל טבלת המעקב יושב פאנל סינון שבו מופיעות בדיוק המילים
  // «סטטוס» ו«אסמכתא», והוא **קודם** ב-DOM. "הטבלה הראשונה שיש בה אסמכתא"
  // הייתה בוחרת אותו ומחזירה «לא נמצא» על לקוח שכן קיים.
  const withFilterPanel = {
    tables: [
      { headerCells: ['סטטוס', 'אסמכתא', 'טקסט', 'סוג'], dataRows: [['הכל', '', '', 'הכל']] },
      { headerCells: HEADER, dataRows: LIVE_ROWS },
    ],
  };
  const r = selectTrackingRow(withFilterPanel, { referenceNumber: '75165449' });
  eq(r.found, true, 'נבחרה טבלת הנתונים ולא פאנל הסינון');
  eq(r.status, 'pending', 'ועם הסטטוס הנכון');
  eq(r.idNumber, '34605212', 'ועם הת.ז. הנכונה');
}
{
  const idLookup = selectTrackingRow(
    { tables: [
      { headerCells: ['סטטוס', 'אסמכתא', 'טקסט', 'סוג'], dataRows: [] },
      { headerCells: HEADER, dataRows: LIVE_ROWS },
    ] },
    { idNumber: '034605212' },
  );
  eq(idLookup.referenceNumber, '75165449', 'גם בחיפוש לפי ת.ז.');
}
{
  const onlyFilter = selectTrackingRow(
    { tables: [{ headerCells: ['סטטוס', 'אסמכתא', 'טקסט', 'סוג'], dataRows: [['הכל', '', '', 'הכל']] }] },
    { referenceNumber: '75165449' },
  );
  eq(onlyFilter.found, false, 'רק פאנל סינון בעמוד — אין רשומות');
  eq(onlyFilter.reason, 'reference_not_found', 'וזו לא "מצאתי"');
}
{
  eq(selectTrackingRow({ tables: [] }, { referenceNumber: '1' }).reason, 'table_not_found',
    'אין טבלאות בכלל');
}

section('עמודת סטטוס ריקה');
{
  const blank = {
    headerCells: HEADER,
    dataRows: [['', '75165449', '34605212', 'סלע הדסה', '22/11/2026', '', '']],
  };
  const r = selectTrackingRow(blank, { referenceNumber: '75165449' });
  eq(r.found, true, 'השורה נמצאה');
  eq(r.status, 'unknown', 'סטטוס ריק ⇒ unknown — לעולם לא approved');
  eq(r.referenceNumber, '75165449', 'ועדיין מיישבים את האסמכתא');
  eq(r.deadline, '2026-11-22', 'ואת המועד');
}
{
  const noDeadline = {
    headerCells: HEADER,
    dataRows: [['', '75165449', '34605212', 'סלע הדסה', '', 'ממתין לאישור', '']],
  };
  const r = selectTrackingRow(noDeadline, { referenceNumber: '75165449' });
  eq(r.deadline, null, 'מועד חסר ⇒ null, לא תאריך מנוחש');
  eq(r.status, 'pending', 'והסטטוס עדיין נקרא');
}

section('תאריכים וזהויות');
eq(toIsoDate('22/11/2026'), '2026-11-22', 'DD/MM/YYYY ⇒ ISO');
eq(toIsoDate('2/11/2026'), '2026-11-02', 'יום חד-ספרתי');
eq(toIsoDate('22.11.2026'), '2026-11-22', 'מפריד נקודה');
eq(toIsoDate('22/13/2026'), null, 'חודש לא חוקי ⇒ null');
eq(toIsoDate('2026-11-22'), null, 'צורה שאינה של המסך ⇒ null');
eq(toIsoDate(''), null, 'ריק ⇒ null');
eq(sameIdNumber('034605212', '34605212'), true, 'אפס מוביל מושמט בב"ל');
eq(sameIdNumber('', ''), false, 'ריק אינו "זהה"');
eq(sameIdNumber('34605212', '36693828'), false, 'ת.ז. שונות');
eq(sameReference('0075165449', '75165449'), true, 'אסמכתא מרופדת');
eq(sameReference('', '75165449'), false, 'ריק אינו "זהה"');

section('מסך התוצאה שאחרי הגשה');
eq(confirmationState('ייפוי הכוח ניקלט במערכת, אך עדיין אינו בתוקף.'), 'pending',
  'הניסוח שנצפה חי ⇒ ראיה חיובית ל-pending');
eq(confirmationState('רישום הטופס נקלט בהצלחה'), 'unknown',
  '"נקלט בהצלחה" לבדו אינו אומר דבר על תוקף ⇒ unknown, לא approved');
eq(confirmationState(''), 'unknown', 'ריק ⇒ unknown');

section('בחירת הלשונית — אותו דומיין, אפליקציות שונות');
{
  // ‼ נצפה חי (23.09.2026) בחלון של גיא: שתי לשוניות על meyazegs.btl.gov.il —
  // מסך הפירוט של «מערכת ייצוג לקוחות», ו«תרמי"ל». הבחירה נפלה על תרמי"ל,
  // שאין בו «מיוצגים», והמשימה נכשלה עם «המסך השתנה — יש לעדכן את הקוד».
  const repApp = {
    href: 'https://meyazegs.btl.gov.il/BTL.ILG.Meyazgim.New/y114z_yipuicoachmamtinishur.aspx?type=MV',
    pathname: '/BTL.ILG.Meyazgim.New/y114z_yipuicoachmamtinishur.aspx', hasPasswordField: false,
  };
  const tarmil = {
    href: 'https://meyazegs.btl.gov.il/tarmil/?q=v141z_peruthachnasa_hagdalatmikdamot',
    pathname: '/tarmil/', hasPasswordField: false,
  };
  const loginGate = {
    href: 'https://meyazegs.btl.gov.il/my.policy', pathname: '/my.policy', hasPasswordField: true,
  };
  const elsewhere = { href: 'https://www.btl.gov.il/', pathname: '/', hasPasswordField: false };

  eq(btlPageRank(repApp), 3, 'מערכת ייצוג לקוחות — העדיפות הגבוהה ביותר');
  eq(btlPageRank(tarmil), 2, 'תרמי"ל — מחובר, אבל אפליקציה אחרת');
  eq(btlPageRank(loginGate), 1, 'מסך הכניסה — לא מחובר');
  eq(btlPageRank(elsewhere), 0, 'דומיין אחר של ביטוח לאומי אינו רלוונטי');
  eq(btlPageRank(undefined), 0, 'אין לשונית');

  check(btlPageRank(repApp) > btlPageRank(tarmil),
    '‼ מערכת הייצוג תמיד גוברת על תרמי"ל — זה הבאג של 23.09');
  check(btlPageRank(tarmil) > btlPageRank(loginGate),
    'לשונית מחוברת גוברת על מסך כניסה');
}

// ── סיכום ──────────────────────────────────────────────────────────────────
console.log(`\n${passes} עברו, ${failures} נכשלו`);
process.exit(failures > 0 ? 1 : 0);

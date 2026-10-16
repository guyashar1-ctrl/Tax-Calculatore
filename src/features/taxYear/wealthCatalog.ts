// ─── הכנה להצהרת הון: תחומים ופריטים (230) ──────────────────────────────────────
// ‼ אותו מנגנון כמו שנת המס — שאלות, דף אישי, ראיות ואישור המשרד — עם תכלית 'wealth':
//   כל עובדה «נכון ליום ההצהרה» (period_kind = as_of), לא לשנה.
// ‼ זה איסוף, לא מילוי טופס 1219 ולא מנוע השוואת הון. סכום המשרד לתחום הוא סיכום עבודה
//   מתועד, לא שדה בטופס.
// ‼ בהצהרת המשך שאלת הפתיחה שואלת «מה השתנה מאז ההצהרה הקודמת» (followupQuestion), ו«כן»
//   שלה פותח את אותו פירוט. שאלה ל«ראשונה בלבד» / «המשך בלבד» — declKind.
// ‼ כללי הרישום (קופות, עלות מופחתת, מט״ח) — ב«ידע מקצועי › הצהרת הון». כלל שלא הוכרע לא חוסם איסוף.
// מקור: docs/tax-foundation/wealth/ (מחקר 11.10.2026, טופס 1219 ודברי ההסבר 12.2024).

import type { Area, InfoItem } from './catalog';
import type { Purpose } from './types';

const W: Purpose[] = ['wealth'];

export const WEALTH_AREAS: Area[] = [
  { id: 'wPeople', title: 'מי בהצהרה', clientTitle: 'מי נכלל בהצהרה', parts1301: [], annexes: [], purposes: W, form1219: 'פרטים אישיים' },
  { id: 'wRealEstate', title: 'נדל״ן', clientTitle: 'דירות, קרקעות ונכסים', parts1301: [], annexes: [], purposes: W, form1219: 'חלק א׳, סעיפים 1 עד 2' },
  { id: 'wBank', title: 'בנקים וחשבונות', clientTitle: 'חשבונות בנק', parts1301: [], annexes: [], purposes: W, form1219: 'חלק א׳, סעיף 3' },
  { id: 'wDigital', title: 'נכסים דיגיטליים', clientTitle: 'מטבעות דיגיטליים', parts1301: [], annexes: [], purposes: W, form1219: 'חלק א׳, סעיף 4' },
  { id: 'wCash', title: 'מזומן', clientTitle: 'מזומן בבית', parts1301: [], annexes: [], purposes: W, form1219: 'חלק א׳, סעיף 5' },
  { id: 'wFunds', title: 'קופות וביטוחים', clientTitle: 'פנסיה, השתלמות וגמל', parts1301: [], annexes: [], purposes: W, form1219: 'חלק א׳, סעיף 6' },
  { id: 'wSecurities', title: 'ניירות ערך', clientTitle: 'השקעות', parts1301: [], annexes: [], purposes: W, form1219: 'חלק א׳, סעיף 7' },
  { id: 'wLoansGiven', title: 'חייבים', clientTitle: 'הלוואות שנתתם', parts1301: [], annexes: [], purposes: W, form1219: 'חלק א׳, סעיף 8' },
  { id: 'wVehicles', title: 'כלי רכב', clientTitle: 'רכב', parts1301: [], annexes: [], purposes: W, form1219: 'חלק א׳, סעיף 9' },
  { id: 'wValuables', title: 'תכשיטים ותכולה', clientTitle: 'תכשיטים ותכולת הבית', parts1301: [], annexes: [], purposes: W, form1219: 'חלק א׳, סעיפים 10 עד 11' },
  { id: 'wLiabilities', title: 'התחייבויות', clientTitle: 'משכנתאות והלוואות', parts1301: [], annexes: [], purposes: W, form1219: 'חלק א׳, סעיפים 13 עד 14' },
  { id: 'wBusiness', title: 'עסקים וחברות', clientTitle: 'העסק והחברה', parts1301: [], annexes: [], purposes: W, form1219: 'חלקים ב׳ ו-ג׳' },
  { id: 'wPartD', title: 'פרטים נוספים', clientTitle: 'כספות ונכסים של אחרים', parts1301: [], annexes: [], purposes: W, form1219: 'חלק ד׳' },
  { id: 'wSinceLast', title: 'מאז ההצהרה הקודמת', clientTitle: 'מה קרה מאז ההצהרה הקודמת', parts1301: [], annexes: [], purposes: W, form1219: 'להשוואה — לא שדה בטופס' },
];

const total = (key: string, area: InfoItem['area'], label: string): InfoItem => ({
  key, area, label, kind: 'amount', per: 'couple', who: 'office', purposes: W,
  why: 'סיכום עבודה של המשרד ליום ההצהרה, עם המסמכים שמאחוריו. לא מילוי של הטופס.',
});

export const WEALTH_ITEMS: InfoItem[] = [
  // ── מי בהצהרה ──
  { key: 'wealth.household', area: 'wPeople', label: 'מי נכלל בהצהרה', kind: 'confirm', per: 'couple', who: 'client', purposes: W,
    question: 'מי נכלל בהצהרה', why: 'נכללים בן/בת הזוג (נשואים שמנהלים משק בית משותף) והילדים שבשנת ההצהרה טרם מלאו להם 18', input: 'confirm', cardKeys: ['familyStatus', 'children'] },
  { key: 'wealth.spouseSeparate', area: 'wPeople', label: 'בן/בת הזוג מגיש/ה הצהרה נפרדת', kind: 'detail', per: 'couple', who: 'office', purposes: W,
    why: 'מותר, עם הצהרה חתומה של בן/בת הזוג. משנה מה נכלל ומי חותם.' },

  // ── נדל״ן ──
  { key: 'wealth.realEstate.list', area: 'wRealEstate', label: 'הנכסים שבכרטיס', kind: 'confirm', per: 'couple', who: 'client', purposes: W, onlyIfOnCard: true,
    question: 'הנכסים שלכם', why: 'כל נכס נרשם בהצהרה בעלות שלו — גם דירת מגורים, גם נכס שאינו מושכר', input: 'confirm', cardKeys: ['properties'] },
  { key: 'wealth.realEstate.has', area: 'wRealEstate', label: 'נדל״ן', kind: 'screener', per: 'person', who: 'client', purposes: W, coveredBy: 'wealth.realEstate.list',
    question: 'האם ל{name} יש דירה, קרקע, חנות או נכס בבנייה — בארץ או בחו״ל?',
    coupleQuestion: 'האם למישהו מכם, או לילד מתחת ל-18, יש דירה, קרקע, חנות או נכס בבנייה — בארץ או בחו״ל?',
    followupQuestion: 'מאז ההצהרה הקודמת, קניתם, מכרתם, בניתם או שיפצתם נכס?',
    why: 'נדל״ן הוא בדרך כלל הסעיף הגדול בהצהרה', input: 'yesno' },
  { key: 'wealth.realEstate.details', area: 'wRealEstate', label: 'פרטי הנכסים', kind: 'detail', per: 'couple', who: 'client', purposes: W, after: 'wealth.realEstate.has',
    question: 'לכל נכס: כתובת, חלק בבעלות, ואיך נרכש (קנייה, תשלומים לקבלן, ירושה, מתנה או בנייה עצמית) ומתי',
    followupQuestion: 'מה השתנה: נכס שנוסף או נמכר, שיפוץ, תשלומים לקבלן',
    why: 'דרך הרכישה קובעת איך רושמים: דירה בתשלומים — המחיר המלא, והיתרה כחוב; ירושה או מתנה — 1 ₪', input: 'text' },
  { key: 'wealth.realEstate.docs', area: 'wRealEstate', label: 'מסמכי הנכסים', kind: 'document', per: 'couple', who: 'client', purposes: W, after: 'wealth.realEstate.has',
    question: 'חוזה, נסח טאבו, וקבלות על העלויות הנלוות ועל שיפוצים', why: 'נרשם בעלות: מחיר, עו״ד, תיווך, מס רכישה ושיפורים', input: 'file', docKind: 'realEstateDocs' },
  total('wealth.realEstate.total', 'wRealEstate', 'עלות הנדל״ן ליום ההצהרה (סיכום המשרד)'),

  // ── בנקים ──
  { key: 'wealth.bank.accounts', area: 'wBank', label: 'החשבונות', kind: 'detail', per: 'couple', who: 'client', purposes: W,
    question: 'באילו בנקים, בתי השקעות וארנקים דיגיטליים (כמו PayPal) יש לכם חשבון — בארץ ובחו״ל, וגם חשבון בשליטתכם שאינו על שמכם?',
    followupQuestion: 'אילו חשבונות נפתחו או נסגרו מאז ההצהרה הקודמת?',
    why: 'כל חשבון נרשם בשורה משלו, גם חשבון במינוס', input: 'text' },
  { key: 'wealth.bank.certs', area: 'wBank', label: 'אישורי יתרות', kind: 'document', per: 'couple', who: 'client', purposes: W,
    question: 'אישור יתרות מכל חשבון, נכון ליום ההצהרה', why: 'היתרה נרשמת כפי שהיא באישור; משיכת יתר — במינוס', input: 'file', docKind: 'bankBalanceCert' },
  { key: 'wealth.bank.foreign', area: 'wBank', label: 'חשבונות בחו״ל שבכרטיס', kind: 'confirm', per: 'couple', who: 'client', purposes: W, onlyIfOnCard: true,
    question: 'החשבונות בחו״ל', why: 'נכללים בהצהרה כמו חשבון בארץ', input: 'confirm', cardKeys: ['foreignAccounts'] },
  total('wealth.bank.total', 'wBank', 'יתרות הבנקים ליום ההצהרה (סיכום המשרד)'),

  // ── נכסים דיגיטליים ──
  { key: 'wealth.crypto.has', area: 'wDigital', label: 'מטבעות דיגיטליים', kind: 'screener', per: 'person', who: 'client', purposes: W, cardKeys: ['hasCrypto'],
    question: 'האם ל{name} היו מטבעות דיגיטליים או NFT ביום ההצהרה?', coupleQuestion: 'האם למישהו מכם היו מטבעות דיגיטליים או NFT ביום ההצהרה?',
    why: 'סעיף נפרד בהצהרה, בעלות ולא בשווי', input: 'yesno' },
  { key: 'wealth.crypto.docs', area: 'wDigital', label: 'פירוט האחזקות', kind: 'document', per: 'couple', who: 'client', purposes: W, after: 'wealth.crypto.has',
    question: 'קובץ יתרות מכל זירה, כתובות הארנקים ופירוט עלות הרכישה', why: 'נרשמים סוג, כמות, תאריך רכישה ועלות בשקלים', input: 'file', docKind: 'cryptoStatement' },

  // ── מזומן ──
  { key: 'wealth.cash', area: 'wCash', label: 'מזומן', kind: 'amount', per: 'couple', who: 'client', purposes: W,
    question: 'כמה מזומן (שקלים ומטבע חוץ) היה בבית או בכספת ביום ההצהרה? אפס היא תשובה.',
    why: 'מזומן שלא נרשם עכשיו ייראה בהצהרה הבאה כמו כסף שאין לו הסבר', input: 'amount' },

  // ── קופות וביטוחים ──
  { key: 'wealth.funds.list', area: 'wFunds', label: 'הקופות שבכרטיס', kind: 'confirm', per: 'couple', who: 'client', purposes: W, onlyIfOnCard: true,
    question: 'הקופות שלכם', why: 'כל קופה נרשמת בהצהרה', input: 'confirm', cardKeys: ['pensionFunds'] },
  { key: 'wealth.funds.has', area: 'wFunds', label: 'קופות', kind: 'screener', per: 'person', who: 'client', purposes: W, coveredBy: 'wealth.funds.list',
    question: 'האם ל{name} יש קרן פנסיה, קרן השתלמות, קופת גמל או ביטוח עם חיסכון?',
    coupleQuestion: 'האם למישהו מכם, או לילד מתחת ל-18, יש קרן פנסיה, קרן השתלמות, קופת גמל או ביטוח עם חיסכון?',
    followupQuestion: 'מאז ההצהרה הקודמת, נפתחה קופה, הועברה לקופה אחרת או נמשך ממנה כסף?',
    why: 'נרשמות ההפקדות, בלי הרווחים', input: 'yesno' },
  { key: 'wealth.funds.certs', area: 'wFunds', label: 'אישורים מהקופות', kind: 'document', per: 'couple', who: 'client', purposes: W,
    question: 'אישור להצהרת הון מכל קופה, נכון ליום ההצהרה, עם פיצול בין הפקדות העובד והמעביד',
    why: 'הטופס מבקש את סכום ההפקדות בלי רווחים. איך בדיוק רושמים — ב«ידע מקצועי › הצהרת הון»', input: 'file', docKind: 'fundWealthCert' },
  total('wealth.funds.total', 'wFunds', 'הפקדות בקופות ליום ההצהרה (סיכום המשרד, לפי בסיס הרישום)'),

  // ── ניירות ערך ──
  { key: 'wealth.securities.list', area: 'wSecurities', label: 'תיקי ההשקעות שבכרטיס', kind: 'confirm', per: 'couple', who: 'client', purposes: W, onlyIfOnCard: true,
    question: 'תיקי ההשקעות שלכם', why: 'כל תיק נרשם בעלות', input: 'confirm', cardKeys: ['investmentAccounts'] },
  { key: 'wealth.securities.has', area: 'wSecurities', label: 'השקעות', kind: 'screener', per: 'person', who: 'client', purposes: W, coveredBy: 'wealth.securities.list',
    question: 'האם ל{name} יש תיק השקעות בבנק, אצל ברוקר בחו״ל או בקופת גמל להשקעה?',
    coupleQuestion: 'האם למישהו מכם יש תיק השקעות בבנק, אצל ברוקר בחו״ל או בקופת גמל להשקעה?',
    why: 'מאז הטופס החדש ניירות ערך נרשמים בעלות בלבד', input: 'yesno' },
  { key: 'wealth.securities.docs', area: 'wSecurities', label: 'תדפיסי עלות', kind: 'document', per: 'couple', who: 'client', purposes: W,
    question: 'מכל בנק או בית השקעות: דוח שמראה כמה עלו ההשקעות (לא כמה הן שוות היום), נכון ליום ההצהרה', why: 'נקרא «תדפיס עלות». בהצהרה נרשמת העלות, לא השווי בבורסה', input: 'file', docKind: 'securitiesCost' },
  total('wealth.securities.total', 'wSecurities', 'עלות ניירות הערך ליום ההצהרה (סיכום המשרד)'),

  // ── חייבים ──
  { key: 'wealth.loansGiven.has', area: 'wLoansGiven', label: 'הלוואות שניתנו', kind: 'screener', per: 'person', who: 'client', purposes: W,
    question: 'האם {name} הלווה כסף למישהו שעוד לא החזיר?', coupleQuestion: 'האם מישהו מכם הלווה כסף למישהו שעוד לא החזיר?',
    followupQuestion: 'מאז ההצהרה הקודמת, הלוויתם כסף או קיבלתם החזר על הלוואה?', why: 'נרשמת יתרת הקרן', input: 'yesno' },
  { key: 'wealth.loansGiven.details', area: 'wLoansGiven', label: 'פרטי ההלוואות', kind: 'detail', per: 'couple', who: 'client', purposes: W, after: 'wealth.loansGiven.has',
    question: 'למי, מה הקרבה, מתי וכמה נשאר להחזיר', why: 'בטופס: שם, קרבה, ושנת ההלוואה', input: 'text' },
  { key: 'wealth.loansGiven.docs', area: 'wLoansGiven', label: 'הסכם או אסמכתה', kind: 'document', per: 'couple', who: 'client', purposes: W, after: 'wealth.loansGiven.has',
    question: 'הסכם ההלוואה, או הצהרה, ותיעוד ההעברה בבנק', why: 'בלי תיעוד קשה להסביר את ההלוואה בהמשך', input: 'file', docKind: 'loanDocs' },

  // ── רכב ──
  { key: 'wealth.vehicles.has', area: 'wVehicles', label: 'כלי רכב', kind: 'screener', per: 'person', who: 'client', purposes: W,
    question: 'האם ל{name} יש רכב, אופנוע או כלי שייט?', coupleQuestion: 'האם למישהו מכם יש רכב, אופנוע או כלי שייט?',
    followupQuestion: 'מאז ההצהרה הקודמת, קניתם או מכרתם רכב?', why: 'נרשם בעלות הרכישה', input: 'yesno' },
  { key: 'wealth.vehicles.details', area: 'wVehicles', label: 'פרטי הרכב', kind: 'detail', per: 'couple', who: 'client', purposes: W, after: 'wealth.vehicles.has',
    question: 'סוג, שנת ייצור, מספר רישוי, מחיר קנייה, ואם הרכב רשום בעסק', why: 'רכב שרשום בעסק נרשם בחלק העסקי', input: 'text' },
  { key: 'wealth.vehicles.docs', area: 'wVehicles', label: 'רישיון ומסמכי קנייה', kind: 'document', per: 'couple', who: 'client', purposes: W, after: 'wealth.vehicles.has',
    question: 'צילום רישיון הרכב והסכם הקנייה', why: 'העלות מהסכם הקנייה', input: 'file', docKind: 'vehicleDocs' },

  // ── תכשיטים ותכולה ──
  { key: 'wealth.valuables.has', area: 'wValuables', label: 'תכשיטים ואספנות', kind: 'screener', per: 'person', who: 'client', purposes: W,
    question: 'האם ל{name} יש תכשיטים, זהב, אוספים או אומנות?', coupleQuestion: 'האם למישהו מכם יש תכשיטים, זהב, אוספים או אומנות?',
    followupQuestion: 'מאז ההצהרה הקודמת, נקנו תכשיטים, זהב, אוספים או אומנות?', why: 'סעיף נפרד בטופס, בעלות', input: 'yesno' },
  { key: 'wealth.contents', area: 'wValuables', label: 'תכולת הבית', kind: 'document', per: 'couple', who: 'client', purposes: W,
    question: 'רשימת תכולת הבית עם עלות ותאריך קנייה משוערים, או דוח שמאי מהביטוח',
    followupQuestion: 'מה נקנה לבית מאז ההצהרה הקודמת, עם עלות ותאריך',
    why: 'התכולה נרשמת בעלות; פירוט שלה משפיע גם על טבלת המחיה בהשוואה', input: 'file', docKind: 'valuablesList' },

  // ── התחייבויות ──
  { key: 'wealth.mortgage.has', area: 'wLiabilities', label: 'משכנתא והלוואות מבנק', kind: 'screener', per: 'person', who: 'client', purposes: W,
    question: 'האם ל{name} יש משכנתא או הלוואה מבנק?', coupleQuestion: 'האם למישהו מכם יש משכנתא או הלוואה מבנק?', why: 'נרשמת יתרת הקרן ליום ההצהרה', input: 'yesno' },
  { key: 'wealth.mortgage.docs', area: 'wLiabilities', label: 'אישור יתרת הלוואות', kind: 'document', per: 'couple', who: 'client', purposes: W, after: 'wealth.mortgage.has',
    question: 'אישור יתרת הקרן מכל בנק, נכון ליום ההצהרה', why: 'נרשמת הקרן; ריבית שטרם שולמה לא נרשמת', input: 'file', docKind: 'liabilityBalanceCert' },
  { key: 'wealth.loansReceived.has', area: 'wLiabilities', label: 'הלוואות ממשפחה או מחברים', kind: 'screener', per: 'person', who: 'client', purposes: W,
    question: 'האם {name} לווה כסף ממשפחה או מחברים?', coupleQuestion: 'האם מישהו מכם לווה כסף ממשפחה או מחברים?', why: 'חוב נרשם בנפרד מהנכסים', input: 'yesno' },
  { key: 'wealth.loansReceived.details', area: 'wLiabilities', label: 'פרטי ההלוואות שהתקבלו', kind: 'detail', per: 'couple', who: 'client', purposes: W, after: 'wealth.loansReceived.has',
    question: 'ממי, מתי, כמה נשאר להחזיר, והאם יש הסכם', why: 'כמו הלוואה שנתתם — עם תיעוד', input: 'text' },
  total('wealth.liabilities.total', 'wLiabilities', 'יתרת ההתחייבויות ליום ההצהרה (סיכום המשרד)'),

  // ── עסקים וחברות ──
  { key: 'wealth.business.books', area: 'wBusiness', label: 'נתוני העסק ליום ההצהרה', kind: 'detail', per: 'business', who: 'office', purposes: W,
    why: 'מהספרים: קופה, לקוחות, מלאי (לפי ספירה), רכוש קבוע, ספקים והלוואות. עסק בלי מאזן — נספח לכל עסק' },
  { key: 'wealth.companies.has', area: 'wBusiness', label: 'מניות או שותפות עם מאזן', kind: 'screener', per: 'person', who: 'client', purposes: W,
    question: 'האם ל{name} יש מניות בחברה או חלק בשותפות עסקית?', coupleQuestion: 'האם למישהו מכם יש מניות בחברה או חלק בשותפות עסקית?',
    why: 'נרשמת ההשקעה נטו: הון, חשבון עו״ש והלוואות', input: 'yesno' },
  { key: 'wealth.companies.docs', area: 'wBusiness', label: 'מאזן ואישור רו״ח', kind: 'document', per: 'couple', who: 'client', purposes: W, after: 'wealth.companies.has',
    question: 'המאזן, ואישור רו״ח החברה על יתרת חשבון הבעלים והון המניות שלך', why: 'מניות נרשמות בערך הנקוב', input: 'file', docKind: 'businessBalance' },
  total('wealth.business.total', 'wBusiness', 'ההון בעסקים ובחברות ליום ההצהרה (סיכום המשרד)'),

  // ── חלק ד׳ ──
  { key: 'wealth.partD.has', area: 'wPartD', label: 'כספות ונכסים של אחרים', kind: 'screener', per: 'couple', who: 'client', purposes: W,
    question: 'האם יש לכם כספת, ייפוי כוח או נאמנות על נכסים של אדם אחר, או רכוש של אחרים שנמצא אצלכם?',
    why: 'נשאל במפורש בחלק ד׳ של הטופס', input: 'yesno' },
  { key: 'wealth.partD.details', area: 'wPartD', label: 'פירוט', kind: 'detail', per: 'couple', who: 'client', purposes: W, after: 'wealth.partD.has',
    question: 'איפה הכספת; של מי הנכסים ומה הקשר אליכם', why: 'נרשם עם פרטי הבעלים', input: 'text' },

  // ── מאז ההצהרה הקודמת (המשך בלבד) ──
  { key: 'wealth.prevDeclaration', area: 'wSinceLast', label: 'ההצהרה הקודמת', kind: 'document', per: 'couple', who: 'office', purposes: W, declKind: 'followup',
    why: 'הבסיס להשוואה: התאריך, ההון נטו ובסיס הרישום. נשמרת כמו שהוגשה — גם אם נמצאה בה טעות', docKind: 'prevWealthDeclaration' },
  { key: 'wealth.since.sources', area: 'wSinceLast', label: 'כסף שהתקבל', kind: 'detail', per: 'couple', who: 'client', purposes: W, declKind: 'followup',
    question: 'מאז ההצהרה הקודמת: ירושה, מתנה, זכייה, פיצויים או מכירת נכס? כמה ומתי', why: 'מקורות כסף שמסבירים גידול בהון', input: 'text' },
  { key: 'wealth.since.uses', area: 'wSinceLast', label: 'כסף שיצא', kind: 'detail', per: 'couple', who: 'client', purposes: W, declKind: 'followup',
    question: 'מאז ההצהרה הקודמת: מתנות שנתתם, עזרה לילדים בגירים או תרומות גדולות?', why: 'כסף שיצא ואינו בהוצאות המחיה', input: 'text' },
  { key: 'wealth.since.living', area: 'wSinceLast', label: 'משק הבית בכל שנה', kind: 'detail', per: 'couple', who: 'client', purposes: W, declKind: 'followup',
    question: 'כמה נפשות גרו בבית בכל שנה, האם גרתם בשכירות, וכמה שכר דירה וריבית על הלוואות שילמתם',
    why: 'כדי לבחור את טבלת המחיה המתאימה, ולהוסיף מה שאינו כלול בה', input: 'text' },
];

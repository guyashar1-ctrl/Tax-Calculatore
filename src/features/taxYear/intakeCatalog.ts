// ─── קליטה והשלמת תיק המס: תחומים ופריטים (236) ─────────────────────────────────
// ‼ אותו מנגנון כמו שנת המס והצהרת ההון — שאלות בדף האישי, «אין לי עדיין», בדיקת המשרד, «החזר
//   לתיקון», אישור — עם תכלית 'intake': פרטים מתמשכים ומסמכים «נכון ליום הקליטה». לא שואלים כאן
//   סכומים לשנה (הם בדוח השנתי של השנה), ולא נכסים ליום הצהרה (הם בהצהרת ההון).
// ‼ מה שאושר כאן מעדכן את הכרטיס רק דרך הצעה (tax_fact_changes, עם המקור וההיסטוריה):
//   ישות חדשה («הוסף לתיק»), שדה כן/לא (cardFlag), בחירה (cardChoice), או «עודכן בתיק» אחרי עריכה
//   ידנית של שינוי שהלקוח תיאר במילים. תוצר שאושר בעבר לא משתנה.
// ‼ מה שיש בכרטיס — מאשרים («זה מה שידוע לנו»), לא שואלים מחדש. מה שאין — שאלת פתיחה, ו«כן» פותח
//   פרטים ומסמך. «כן» בלי ישות בתיק ⇒ ישות זמנית (picture.ts › provisional), לא התראה כללית.
// ‼ אימות מול הרשות אינו כאן: תשובת לקוח היא «נמסר בידי הלקוח», גם אחרי אישור. יישור הקו מול
//   הרשויות הוא פעולת משרד נפרדת (intake.authorityAlignment) — והאיסוף אינו מחכה לה.

import type { Area, InfoItem } from './catalog';
import type { Purpose } from './types';

const I: Purpose[] = ['intake'];

export const INTAKE_AREAS: Area[] = [
  { id: 'iPeople', title: 'זהות ומשפחה', clientTitle: 'מי אתם', parts1301: ['א', 'ב', 'יג'], annexes: [], purposes: I },
  { id: 'iCredits', title: 'נקודות זיכוי ומעמד', clientTitle: 'לימודים, שירות ומצבים מיוחדים', parts1301: ['יג', 'יד'], annexes: ['119'], purposes: I },
  { id: 'iWork', title: 'עבודה ועסק', clientTitle: 'עבודה ועסק', parts1301: ['ג'], annexes: ['134', '1320'], purposes: I },
  { id: 'iProperty', title: 'נכסים והשקעות', clientTitle: 'נכסים, השקעות וחו״ל', parts1301: ['ד', 'ה', 'ח', 'ט'], annexes: ['1321', '1322', '1324'], purposes: I },
  { id: 'iSavings', title: 'חיסכון, קצבאות וביטוח', clientTitle: 'פנסיה, קצבאות וביטוח', parts1301: ['ג', 'יב', 'יד'], annexes: [], purposes: I },
  { id: 'iHistory', title: 'דוחות קודמים ועניינים פתוחים', clientTitle: 'דוחות קודמים ומכתבים מהרשויות', parts1301: ['יא'], annexes: ['1344'], purposes: I },
  { id: 'iFiling', title: 'פרטים להגשה ויישור קו', clientTitle: 'חשבון להחזרים', parts1301: ['לשימוש המשדר'], annexes: [], purposes: I },
];

const FAMILY_OPTIONS = [
  { value: 'single', label: 'רווק/ה' }, { value: 'married', label: 'נשוי/אה (או ידועים בציבור שגרים יחד)' },
  { value: 'divorced', label: 'גרוש/ה' }, { value: 'widowed', label: 'אלמן/ה' }, { value: 'singleParent', label: 'הורה יחיד/ה' },
];

export const INTAKE_ITEMS: InfoItem[] = [
  // ── זהות ומשפחה ──
  { key: 'intake.family', area: 'iPeople', label: 'מצב משפחתי ובן/בת הזוג', kind: 'confirm', per: 'couple', who: 'client', purposes: I,
    question: 'המצב המשפחתי', why: 'קובע אם הדוח משותף, מי בן הזוג הרשום ואילו נקודות זיכוי מגיעות', input: 'confirm',
    cardKeys: ['familyStatus', 'marriageYear', 'spouseFirstName'], cardChoice: 'familyStatus',
    whenEmpty: { question: 'מה המצב המשפחתי היום?', input: 'choice', options: FAMILY_OPTIONS },
    officeNext: 'בחירה — «עדכן בתיק» (הצעה עם היסטוריה); «משהו השתנה» — לעדכן בכרטיס ואז «עודכן בתיק»' },
  { key: 'intake.children', area: 'iPeople', label: 'ילדים', kind: 'confirm', per: 'couple', who: 'client', purposes: I,
    question: 'הילדים', why: 'לכל ילד מגיעות נקודות זיכוי לפי גילו ולפי מי שהוא גר אצלו', input: 'confirm', cardKeys: ['children'],
    whenEmpty: { question: 'הילדים שלכם — שם ותאריך לידה לכל ילד', input: 'text' },
    officeNext: 'לעדכן את רשימת הילדים בכרטיס (שנת לידה, אצל מי גר) ואז «עודכן בתיק»; לאמת מול הספח' },
  // ‼ 13.10.2026 · כתובת מגורים — מובנית (יישוב, רחוב, מספר, דירה, מיקוד); באישור המשרד מתעדכנת בכרטיס עם היסטוריה
  { key: 'intake.address', area: 'iPeople', label: 'כתובת מגורים', kind: 'confirm', per: 'couple', who: 'client', purposes: I,
    question: 'כתובת המגורים', why: 'הכתובת מופיעה בדוח ובמכתבים מהרשויות, ויישוב המגורים עשוי לזכות בהטבת מס', input: 'confirm', cardKeys: ['city', 'address'],
    whenEmpty: { question: 'מה כתובת המגורים שלכם היום?', input: 'text' },
    officeNext: '«אשר ועדכן בתיק» — הכתובת נכתבת בכרטיס והקודמת נשמרת בהיסטוריה; לאמת מול הספח' },
  { key: 'intake.idCard', area: 'iPeople', label: 'תעודת זהות עם הספח', kind: 'document', per: 'person', who: 'client', purposes: I,
    question: 'צילום תעודת הזהות של {name}, עם הספח', why: 'הספח מראה כתובת, בן/בת זוג וילדים — כך מאמתים את מה שרשום אצלנו',
    input: 'file', docKind: 'idCard', officeNext: 'לבדוק שמספר הזהות, הכתובת, בן/בת הזוג והילדים תואמים לכרטיס; סתירה — לעדכן בכרטיס' },
  { key: 'intake.settlement', area: 'iPeople', label: 'יישוב מזכה', kind: 'confirm', per: 'couple', who: 'client', purposes: I, onlyIfOnCard: true,
    question: 'יישוב המגורים', why: 'מגורים ביישוב מזכה מקנים הנחה במס, רק עם אישור תושבות', input: 'confirm', cardKeys: ['qualifyingSettlementId'],
    officeNext: 'לאשר; מעבר דירה — לעדכן בכרטיס' },
  { key: 'intake.settlementCert', area: 'iPeople', label: 'אישור תושבות ביישוב', kind: 'document', per: 'couple', who: 'client', purposes: I, after: 'intake.settlement',
    question: 'אישור התושבות מהרשות המקומית', why: 'ההנחה ביישוב ניתנת רק לפי אישור תושב', input: 'file', docKind: 'settlementCert',
    officeNext: 'לבדוק שהאישור על שם הלקוח ולשנים הרלוונטיות' },

  // ── נקודות זיכוי ומעמד ──
  { key: 'intake.credits', area: 'iCredits', label: 'תואר, לימודי מקצוע או שחרור משירות בשנים האחרונות', kind: 'screener', per: 'person', who: 'client', purposes: I,
    question: 'בשנים האחרונות, האם {name} סיים/ה תואר אקדמי או לימודי מקצוע, או השתחרר/ה משירות צבאי או לאומי?',
    coupleQuestion: 'בשנים האחרונות, האם מישהו מכם סיים תואר אקדמי או לימודי מקצוע, או השתחרר משירות צבאי או לאומי?',
    why: 'שני אלה מזכים בנקודות זיכוי לתקופה מוגבלת אחרי הסיום', input: 'yesno',
    officeNext: 'לפי האישור — לעדכן בכרטיס שנת סיום וסוג התואר או שנת השחרור; הזכאות נקבעת בדוח השנתי' },
  { key: 'intake.creditDocs', area: 'iCredits', label: 'אישור זכאות לתואר או תעודת שחרור', kind: 'document', per: 'person', who: 'client', purposes: I, after: 'intake.credits',
    question: 'אישור הזכאות לתואר או תעודת השחרור של {name}', why: 'נקודות הזיכוי ניתנות רק לפי האישור', input: 'file', docKind: 'creditCerts',
    officeNext: 'לרשום בכרטיס את התאריכים מהאישור' },
  { key: 'intake.special', area: 'iCredits', label: 'עלייה, תושב חוזר, נכות או ילד עם מוגבלות', kind: 'screener', per: 'person', who: 'client', purposes: I,
    question: 'האם {name} עלה/תה לארץ או חזר/ה לגור בישראל אחרי שנים בחו״ל, או שיש ל{name} או לאחד הילדים נכות או מוגבלות מוכרת?',
    why: 'כל אחד מאלה יכול לזכות בנקודות זיכוי או בפטור', input: 'yesno',
    officeNext: 'לפי האישור — לעדכן בכרטיס (שנת עלייה, תושב חוזר, אחוזי נכות); פטור ממס — לבדוק בדוח השנתי' },
  { key: 'intake.specialDocs', area: 'iCredits', label: 'תעודת עולה, אישור תושב חוזר או אישור נכות', kind: 'document', per: 'person', who: 'client', purposes: I, after: 'intake.special',
    question: 'האישור הרלוונטי: תעודת עולה, אישור תושב חוזר או אישור נכות', why: 'ההטבה ניתנת רק לפי האישור', input: 'file', docKind: 'specialStatusCert',
    officeNext: 'לרשום בכרטיס את הנתונים מהאישור' },

  // ── עבודה ועסק ──
  { key: 'intake.employers', area: 'iWork', label: 'מקומות העבודה כיום', kind: 'confirm', per: 'person', who: 'client', purposes: I, onlyIfOnCard: true,
    question: 'מקומות העבודה', why: 'מכל מעסיק נבקש בכל שנה אישור שנתי משלו', input: 'confirm', cardKeys: ['employers'],
    officeNext: 'מעסיק שהסתיים או נוסף — לעדכן בכרטיס ואז «עודכן בתיק»' },
  { key: 'intake.employed', area: 'iWork', label: 'עובד/ת כשכיר/ה', kind: 'screener', per: 'person', who: 'client', purposes: I, coveredBy: 'intake.employers', cardKeys: ['employers'],
    question: 'האם {name} עובד/ת היום כשכיר/ה?', coupleQuestion: 'האם מישהו מכם עובד היום כשכיר?', why: 'משכורת נכנסת לחישוב המס, ומהמעסיק מגיע אישור שנתי', input: 'yesno',
    officeNext: '«כן» — נפתחים פרטי המעסיק ותלוש לכל מעסיק חדש' },
  { key: 'intake.employerDetails', area: 'iWork', label: 'מעסיק חדש: שם, ממתי ותפקיד', kind: 'detail', per: 'employer', who: 'client', purposes: I, after: 'intake.employed', onlyNew: true,
    question: 'שם המעסיק, ממתי עובד/ת שם ומה התפקיד', why: 'כך נוסיף את המעסיק לתיק', input: 'text',
    officeNext: '«הוסף לתיק» — המעסיק נכנס לכרטיס עם אותו מזהה, והתלוש שהועלה נשאר משויך אליו' },
  { key: 'intake.payslip', area: 'iWork', label: 'תלוש שכר אחרון', kind: 'document', per: 'employer', who: 'client', purposes: I, after: 'intake.employed',
    question: 'תלוש השכר האחרון מ{entity}', why: 'בתלוש רואים את נקודות הזיכוי, תיאום המס וההפקדות לפנסיה', input: 'file', docKind: 'payslipToDate',
    officeNext: 'לבדוק נקודות זיכוי ותיאום מס בתלוש מול הכרטיס; אין חיוב להזין סכומים (הם לשנה — בדוח השנתי)' },
  { key: 'intake.business', area: 'iWork', label: 'העסק', kind: 'confirm', per: 'person', who: 'client', purposes: I, onlyIfOnCard: true,
    question: 'העסק', why: 'הכנסה מעסק היא הבסיס לחישוב המס והמקדמות', input: 'confirm', cardKeys: ['businesses'],
    officeNext: 'שינוי בעסק — לעדכן בכרטיס (עריכת «העסק») ואז «עודכן בתיק»' },
  { key: 'intake.selfEmployed', area: 'iWork', label: 'עצמאי/ת או בעל/ת עסק', kind: 'screener', per: 'person', who: 'client', purposes: I, coveredBy: 'intake.business', cardKeys: ['businesses'],
    question: 'האם {name} עצמאי/ת או בעל/ת עסק (כולל עוסק פטור)?', coupleQuestion: 'האם מישהו מכם עצמאי או בעל עסק (כולל עוסק פטור)?',
    why: 'עסק מחייב דיווח שנתי ומקדמות', input: 'yesno', officeNext: '«כן» — פרטי העסק ותעודת העוסק; פתיחת העסק בכרטיס היא פעולת משרד' },
  { key: 'intake.businessDetails', area: 'iWork', label: 'עסק חדש: שם, תחום וממתי', kind: 'detail', per: 'person', who: 'client', purposes: I, after: 'intake.selfEmployed', noCardEntity: 'businesses',
    question: 'שם העסק, במה הוא עוסק, ממתי, והאם הוא עוסק פטור או מורשה', why: 'כך נפתח את העסק בתיק', input: 'text',
    officeNext: 'לפתוח את העסק בכרטיס («העסק» בתיק המס) ואז «עודכן בתיק»; עסק אינו נכנס במסלול ההצעות' },
  { key: 'intake.businessCert', area: 'iWork', label: 'תעודת עוסק ואישור פתיחת תיק', kind: 'document', per: 'person', who: 'client', purposes: I, after: 'intake.selfEmployed',
    question: 'תעודת העוסק (פטור או מורשה) ואישור פתיחת התיק במס הכנסה, אם יש', why: 'מראים איך העסק רשום ברשויות', input: 'file', docKind: 'businessCert',
    officeNext: 'להשוות לנתוני יישור הקו (סוג תיק, תחום, מועד פתיחה)' },
  { key: 'intake.bookkeeping', area: 'iWork', label: 'מי מנהל את הספרים', kind: 'detail', per: 'business', who: 'client', purposes: I, after: 'intake.business',
    question: 'מי מנהל היום את הנהלת החשבונות של {entity}, ובאיזו תוכנה מוציאים חשבוניות?', why: 'כך נדע מאיפה יגיעו הספרים בסוף השנה', input: 'text',
    officeNext: 'לתאם עם מנהל החשבונות; העברה מרו״ח קודם — בבקשה «חומרים מרו״ח קודם»' },

  // ── נכסים, השקעות וחו״ל ──
  { key: 'intake.rentals', area: 'iProperty', label: 'נכסים מושכרים', kind: 'confirm', per: 'couple', who: 'client', purposes: I, onlyIfOnCard: true,
    question: 'הנכסים המושכרים', why: 'שכר דירה ממוסה לפי מסלול שנבחר לכל נכס', input: 'confirm', cardKeys: ['properties'],
    officeNext: 'נכס שנמכר או הפסיק להיות מושכר — «עדכן בתיק» או עריכה בכרטיס' },
  { key: 'intake.rents', area: 'iProperty', label: 'משכירים נכס', kind: 'screener', per: 'couple', who: 'client', purposes: I, coveredBy: 'intake.rentals', cardKeys: ['properties'], cardFlag: 'hasRentalIncome',
    question: 'האם אתם משכירים דירה, חנות או נכס אחר — בארץ או בחו״ל?', why: 'שכר דירה מדווח לפי מסלול לכל נכס', input: 'yesno',
    officeNext: '«כן» — פרטי הנכס וחוזה השכירות לכל נכס חדש; התשובה נכנסת לכרטיס («משכיר נכס») באישור' },
  { key: 'intake.propertyDetails', area: 'iProperty', label: 'נכס מושכר חדש: כתובת, בעלות ושכר דירה', kind: 'detail', per: 'property', who: 'client', purposes: I, after: 'intake.rents', onlyNew: true,
    question: 'כתובת הנכס, חלק בבעלות, ממתי הוא מושכר וכמה שכר דירה בחודש', why: 'כך נוסיף את הנכס לתיק ונבחר מסלול מיסוי', input: 'text',
    officeNext: '«הוסף לתיק» — הנכס נכנס לכרטיס עם אותו מזהה, והחוזה שהועלה נשאר משויך אליו' },
  { key: 'intake.rentalContract', area: 'iProperty', label: 'חוזה שכירות', kind: 'document', per: 'property', who: 'client', purposes: I, after: 'intake.rents',
    question: 'חוזה השכירות של {entity}', why: 'החוזה מראה את התקופה ואת הסכום', input: 'file', docKind: 'rentalContract',
    officeNext: 'לבדוק תקופה וסכום; מסלול המיסוי נקבע לכל נכס בכרטיס' },
  { key: 'intake.investments', area: 'iProperty', label: 'תיקי השקעות ופיקדונות', kind: 'confirm', per: 'couple', who: 'client', purposes: I, onlyIfOnCard: true,
    question: 'תיקי ההשקעות והפיקדונות', why: 'מכל בנק ובית השקעות מגיע בכל שנה אישור שנתי (867)', input: 'confirm', cardKeys: ['investmentAccounts'],
    officeNext: 'חשבון שנסגר — «עדכן בתיק»' },
  { key: 'intake.hasInvestments', area: 'iProperty', label: 'יש תיק השקעות או פיקדון', kind: 'screener', per: 'couple', who: 'client', purposes: I, coveredBy: 'intake.investments', cardKeys: ['investmentAccounts'], cardFlag: 'hasInvestments',
    question: 'האם יש לכם תיק השקעות, פיקדון או קופת גמל להשקעה — בבנק או בבית השקעות?', why: 'רווחים, ריבית ודיבידנד מדווחים לפי האישור השנתי', input: 'yesno',
    officeNext: '«כן» — לכל חשבון חדש: באיזה גוף' },
  { key: 'intake.accountDetails', area: 'iProperty', label: 'חשבון השקעות חדש: הגוף', kind: 'detail', per: 'account', who: 'client', purposes: I, after: 'intake.hasInvestments', onlyNew: true,
    question: 'באיזה בנק או בית השקעות (אם יש כמה — כולם)?', why: 'כך נוסיף את החשבון לתיק ונבקש ממנו אישור שנתי', input: 'text',
    officeNext: '«הוסף לתיק» — חשבון לכל גוף; הראשון עם אותו מזהה' },
  { key: 'intake.foreign', area: 'iProperty', label: 'הכנסה, חשבון או נכס בחו״ל', kind: 'screener', per: 'person', who: 'client', purposes: I, cardKeys: ['foreignAccounts'],
    question: 'האם ל{name} יש הכנסה, חשבון בנק, השקעות או נכס מחוץ לישראל?', coupleQuestion: 'האם למישהו מכם יש הכנסה, חשבון בנק, השקעות או נכס מחוץ לישראל?',
    why: 'תושב ישראל מדווח על הכנסות מכל העולם', input: 'yesno', officeNext: '«כן» — פרטי המקור (מדינה, סוג, גוף) לכל מקור חדש' },
  { key: 'intake.foreignDetails', area: 'iProperty', label: 'מקור חדש בחו״ל: מדינה, סוג וגוף', kind: 'detail', per: 'foreign_source', who: 'client', purposes: I, after: 'intake.foreign', onlyNew: true,
    question: 'באיזו מדינה, מה בדיוק (חשבון בנק, השקעות, נכס או הכנסה מעבודה) ואצל איזה גוף?', why: 'כך נוסיף את המקור לתיק ונדע איזה דוח לבקש', input: 'text',
    officeNext: '«הוסף לתיק» — המקור נכנס לכרטיס (חשבונות בחו״ל) עם אותו מזהה' },
  { key: 'intake.crypto', area: 'iProperty', label: 'מטבעות דיגיטליים', kind: 'screener', per: 'couple', who: 'client', purposes: I, cardKeys: ['hasCrypto'], cardFlag: 'hasCrypto',
    question: 'האם למישהו מכם יש מטבעות דיגיטליים (קריפטו)?', why: 'מכירה או המרה של מטבע דיגיטלי מדווחת כרווח הון', input: 'yesno',
    officeNext: 'התשובה נכנסת לכרטיס באישור; הפירוט נשאל בדוח השנתי ובהצהרת ההון' },

  // ── חיסכון, קצבאות וביטוח ──
  { key: 'intake.funds', area: 'iSavings', label: 'הקופות שבכרטיס', kind: 'confirm', per: 'couple', who: 'client', purposes: I, onlyIfOnCard: true,
    question: 'הקופות שלכם', why: 'הפקדות עצמאיות מזכות בהטבת מס, ומכל קופה מגיע אישור שנתי', input: 'confirm', cardKeys: ['pensionFunds'],
    officeNext: 'קופה שנוספה או נסגרה — לעדכן בכרטיס' },
  { key: 'intake.selfDeposits', area: 'iSavings', label: 'הפקדה עצמאית לפנסיה, השתלמות או גמל', kind: 'screener', per: 'person', who: 'client', purposes: I,
    question: 'האם {name} מפקיד/ה בעצמו/ה (לא דרך מעסיק) לפנסיה, לקרן השתלמות או לקופת גמל?',
    coupleQuestion: 'האם מישהו מכם מפקיד בעצמו (לא דרך מעסיק) לפנסיה, לקרן השתלמות או לקופת גמל?',
    why: 'הפקדה עצמאית מזכה בניכוי או בזיכוי', input: 'yesno', officeNext: '«כן» — לכל קופה חדשה: שם החברה וסוג הקופה' },
  { key: 'intake.fundDetails', area: 'iSavings', label: 'קופה חדשה: שם החברה וסוג הקופה', kind: 'detail', per: 'fund', who: 'client', purposes: I, after: 'intake.selfDeposits', onlyNew: true,
    question: 'לאיזו קופה מפקידים (שם החברה וסוג הקופה — פנסיה, קרן השתלמות או קופת גמל)?', why: 'מכל קופה נבקש בסוף השנה אישור שנתי', input: 'text',
    officeNext: '«הוסף לתיק» — הקופה נכנסת לכרטיס עם אותו מזהה' },
  { key: 'intake.allowances', area: 'iSavings', label: 'קצבה או דמי אבטלה', kind: 'screener', per: 'person', who: 'client', purposes: I,
    question: 'האם {name} מקבל/ת היום קצבה — פנסיה, קצבת נכות, קצבת שארים — או דמי אבטלה?',
    coupleQuestion: 'האם מישהו מכם מקבל היום קצבה — פנסיה, קצבת נכות, קצבת שארים — או דמי אבטלה?',
    why: 'חלק מהקצבאות חייבות במס וחלקן פטורות — לפי סוגן', input: 'yesno', officeNext: '«כן» — האישור על הקצבה; בדיקת פטור — בדוח השנתי' },
  { key: 'intake.allowanceDocs', area: 'iSavings', label: 'אישור על קצבה או תלוש פנסיה', kind: 'document', per: 'person', who: 'client', purposes: I, after: 'intake.allowances',
    question: 'האישור על הקצבה או תלוש הפנסיה האחרון של {name}', why: 'באישור רואים מי משלם, כמה ואם נוכה מס', input: 'file', docKind: 'allowanceCert',
    officeNext: 'לרשום בכרטיס את מקור הקצבה; סכומים לשנה — בדוח השנתי' },
  { key: 'intake.insurance', area: 'iSavings', label: 'ביטוח חיים או אובדן כושר עבודה פרטי', kind: 'screener', per: 'person', who: 'client', purposes: I, cardKeys: ['hasLifeInsurance', 'hasDisabilityInsurance'],
    question: 'האם ל{name} יש ביטוח חיים או ביטוח אובדן כושר עבודה שמשולם באופן פרטי (לא דרך המשכורת)?',
    coupleQuestion: 'האם למישהו מכם יש ביטוח חיים או ביטוח אובדן כושר עבודה שמשולם באופן פרטי (לא דרך המשכורת)?',
    why: 'על ביטוחים כאלה יש זיכוי או ניכוי ממס', input: 'yesno', officeNext: '«כן» — אישור שנתי מחברת הביטוח; לעדכן בכרטיס איזה ביטוח' },
  { key: 'intake.insuranceDocs', area: 'iSavings', label: 'אישור שנתי מחברת הביטוח', kind: 'document', per: 'person', who: 'client', purposes: I, after: 'intake.insurance',
    question: 'האישור השנתי מחברת הביטוח (או הפוליסה) של {name}', why: 'הזיכוי ניתן לפי האישור', input: 'file', docKind: 'insuranceCert',
    officeNext: 'לעדכן בכרטיס ביטוח חיים / אובדן כושר עבודה; הסכום לשנה — בדוח השנתי' },

  // ── דוחות קודמים ועניינים פתוחים ──
  { key: 'intake.prevReturns', area: 'iHistory', label: 'הוגש בעבר דוח שנתי', kind: 'screener', per: 'couple', who: 'client', purposes: I,
    question: 'האם הוגש בעבר דוח שנתי למס הכנסה — על ידיכם או על ידי רואה חשבון אחר?', why: 'מהדוח והשומה הקודמים נלקחים הפסדים ויתרות שעוברים לשנה הבאה', input: 'yesno',
    officeNext: '«כן» — הדוח והשומה האחרונים; העברה מרו״ח קודם — בבקשה הנפרדת' },
  { key: 'intake.prevReturnDocs', area: 'iHistory', label: 'הדוח השנתי והשומה האחרונים', kind: 'document', per: 'couple', who: 'client', purposes: I, after: 'intake.prevReturns',
    question: 'הדוח השנתי האחרון שהוגש ושומת המס האחרונה שקיבלתם', why: 'מהם נלקחים הפסדים מועברים ויתרות', input: 'file', docKind: 'prevAssessment',
    officeNext: 'לרשום יתרות והפסדים מועברים בדוח השנתי הבא (יתרות משנים קודמות)' },
  { key: 'intake.openIssues', area: 'iHistory', label: 'מכתב, דרישה, חוב או הליך פתוח מול רשות', kind: 'screener', per: 'couple', who: 'client', purposes: I,
    question: 'האם יש לכם מכתב, דרישה, חוב או הליך פתוח מול מס הכנסה, מע״מ או ביטוח לאומי — כולל דרישה להצהרת הון?',
    why: 'כך נדע מה דחוף ומה צריך לטפל בו קודם', input: 'yesno', officeNext: '«כן» — המכתבים; דרישה להצהרת הון — לפתוח הכנה להצהרת הון ולאמת שם את הדרישה' },
  { key: 'intake.openIssueDocs', area: 'iHistory', label: 'מכתבים ודרישות מהרשויות', kind: 'document', per: 'couple', who: 'client', purposes: I, after: 'intake.openIssues',
    question: 'המכתבים או הדרישות שקיבלתם', why: 'מהמכתב רואים מה נדרש ועד מתי', input: 'file', docKind: 'authorityLetter',
    officeNext: 'לפתוח משימה או בקשה לטיפול; מועד שבמכתב — לבדוק מול הרשות' },

  // ── פרטים להגשה ויישור קו ──
  { key: 'intake.bankAccount', area: 'iFiling', label: 'חשבון בנק להחזרים', kind: 'confirm', per: 'couple', who: 'client', purposes: I, cardKeys: ['bankAccounts'],
    question: 'חשבון הבנק להחזרי מס', why: 'רשות המסים מעבירה החזר רק לחשבון על שם הנישום', input: 'confirm',
    whenEmpty: { question: 'לאיזה חשבון בנק להעביר החזרי מס, אם יהיה?', input: 'text' },
    officeNext: 'לעדכן את חשבון הבנק בכרטיס ואז «עודכן בתיק»; לאמת מול אישור ניהול החשבון' },
  { key: 'intake.bankCert', area: 'iFiling', label: 'אישור ניהול חשבון', kind: 'document', per: 'couple', who: 'client', purposes: I, after: 'intake.bankAccount',
    question: 'אישור ניהול חשבון מהבנק (או צילום צ׳ק)', why: 'כך מוודאים שמספר החשבון נכון', input: 'file', docKind: 'bankAccountCert',
    officeNext: 'להשוות למספר החשבון שבכרטיס' },
  { key: 'intake.authorityAlignment', area: 'iFiling', label: 'יישור קו מול הרשויות (מס הכנסה, מע״מ, ביטוח לאומי)', kind: 'screener', per: 'couple', who: 'office', purposes: I,
    why: 'מה שהלקוח מסר הוא הצהרה; תיקים, מעמד, מקדמות ויתרות נבדקים ברשות עצמה',
    officeNext: '«בצע יישור קו מול הרשויות» בתיק המס (או ידנית: שע״ם, האזור האישי במע״מ, פורטל המייצגים בב״ל) — וכאן לסמן «בוצע»' },
];

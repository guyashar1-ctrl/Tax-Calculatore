// ─── «מס» — אזור אחד לעבודה בתיקי הלקוחות וללמידה מקצועית (14.10.2026) ─────────────────────
// ‼ גיא (14.10): «ידע מס» (בסרגל) ו«עבודת מס» (בתפריט החשבון, בתוך «המשרד») היו דומים מדי בשם ובמקומות שונים.
//   עכשיו: כניסה אחת «מס» בסרגל, ובתוכה שני מרחבים בשמות שאי אפשר לבלבל —
//   «עבודות לקוחות» (מה פתוח אצל מי, מה חסר ומה הבא) ו«ידע מקצועי» (ללמוד תחום ולעבוד לפיו, גם ביד).
// ‼ לכל סוג עבודה ולכל תחום מקצועי — כניסה משלו בצד. «כל העבודות» היא סקירה, לא תחליף לכניסות.
// ‼ טהור (בלי React) — נבדק ב-node. הכתובת: ‎#/tax/work/<section>‎ · ‎#/tax/learn/<domain>[/<item>]‎.

import type { WorkKind } from '../taxYear/taxWork';
import type { Tool } from '../taxCenter/taxCenterNav';
import { AVAILABLE } from '../taxKnowledge/availability';
import { topicAskAreaIds } from '../taxKnowledge/learnPath';
import { AREAS, type AreaId } from '../taxYear/catalog';
import { WEALTH_AREAS } from '../taxYear/wealthCatalog';
import { valueGroup } from '../taxKnowledge/domainValues';
import type { ClaimStatus } from '../taxKnowledge/claim';

export type AreaMode = 'work' | 'learn';
export const MODE_LABEL: Record<AreaMode, string> = { work: 'עבודות לקוחות', learn: 'ידע מקצועי' };
export const MODE_HINT: Record<AreaMode, string> = {
  // ‼ 16.10 (הכרעת גיא): סקירה בלבד — העבודה עצמה ב«בקשות» של הלקוח
  work: 'סקירה: מה פתוח אצל כל לקוח ומה המועד. העבודה עצמה — ב«בקשות» של הלקוח',
  learn: 'ללמוד תחום מההתחלה ועד עבודה בתיק — גם בלי המערכת',
};

// ── עבודות לקוחות ──────────────────────────────────────────────────────────────
export type WorkSection = 'all' | WorkKind;
export interface WorkSectionDef {
  id: WorkSection;
  label: string;
  /** מה זו העבודה — שורה אחת, בשפת המשרד. */
  lead: string;
  /** איך פותחים עבודה מהסוג הזה. */
  howToOpen: string;
  /** התחום המקצועי שמסביר אותה. */
  domain?: DomainId;
  /** אפשר להוסיף מכאן ללקוח אחד או לכמה (AddTaxWorkDialog). */
  addKind?: 'annual' | 'wealth';
}

export const WORK_SECTIONS: WorkSectionDef[] = [
  { id: 'all', label: 'כל העבודות', lead: 'סקירה של כל העבודות הפתוחות — איחורים ומועדים קרובים בראש.', howToOpen: 'כל סוג נפתח מהעמוד שלו או מתיק הלקוח.' },
  { id: 'intake', label: 'קליטה והשלמת תיק', lead: 'פרטים קבועים שחסרים בתיק המס של לקוח חדש — שאלון השלמה, מסמכים ואישור בתיק.', howToOpen: 'נפתחת מתיק הלקוח: «עדכון ויישור קו» ← «הכן שאלון השלמה».', domain: 'annual' },
  { id: 'annual', label: 'דוחות שנתיים', lead: 'איסוף המידע והמסמכים לדוח של שנה — גם לשנה קודמת.', howToOpen: '«＋ דוח שנתי» — ללקוח אחד או לכמה, עם מקור ומועד.', domain: 'annual', addKind: 'annual' },
  { id: 'wealth', label: 'הצהרות הון', lead: 'הצהרה ליום מסוים — ראשונה או המשך, עם המועד שבדרישה.', howToOpen: '«＋ הצהרת הון» — ללקוח אחד או לכמה, עם המכתב אם התקבל.', domain: 'wealth', addKind: 'wealth' },
  ...(AVAILABLE.taxEstimate ? [{ id: 'estimate' as const, label: 'הערכות מס', lead: 'הערכה לשנה לפי חודש חתך — חבות, מקדמות ומה לשלם.', howToOpen: 'נפתחת מתיק הלקוח: «דוחות והצהרות» ← «＋ הערכת מס».', domain: 'advances' as const }] : []),
];
export const WORK_BY_ID = Object.fromEntries(WORK_SECTIONS.map(s => [s.id, s])) as Record<WorkSection, WorkSectionDef>;

// ── ידע מקצועי ─────────────────────────────────────────────────────────────────
export type DomainId = 'annual' | 'credits' | 'salary' | 'savings' | 'ni' | 'advances' | 'business' | 'companies' | 'rent' | 'wealth' | 'reference';

/** פריט בתוך תחום: נושא לימוד (מסלול מלא) או כלי (מחשבון, מילון, טבלה). */
export type DomainItem =
  | { kind: 'topic'; id: string; label: string; purpose: string }
  | { kind: 'tool'; id: Tool; label: string; purpose: string };

export interface DomainDef {
  id: DomainId;
  label: string;
  /** מה התחום — משפט אחד. */
  what: string;
  /** מתי הוא רלוונטי ללקוח. */
  when: string;
  items: DomainItem[];
  /** סוגי העבודה שבהם משתמשים בתחום. */
  workKinds: WorkKind[];
  /** תחומי שאלון נוספים לתחום, מעבר לאלה של נושאי הלימוד שבו — «מה מבקשים מהלקוח». הרשימה המלאה: askAreasOf. */
  catalogAreas: AreaId[];
  /** ‼ כשאין לתחום מסלול לימוד — אומרים את זה בשקט, ומה יש בינתיים. לא ממציאים תוכן. */
  learnGap?: string;
  /** ‼ 16.10 (ביקורת כיסוי מול «חשבים 360» / «כל מס»): כלים ונושאים שחסרים — גלויים כ«טרם נכתב», עם מה יש היום. בלי דין חדש. */
  planned?: PlannedItem[];
  /** ‼ 16.10: הפניה לנושא שגר בתחום אחר (כל נושא — בתחום אחד בדיוק). מוצג ב«ללמוד לעומק» עם שם התחום שלו. */
  seeAlso?: { id: string; why: string }[];
  /** ‼ 16.10: הסבר קצר שאין לו נושא משלו — מוצג ב«ללמוד לעומק», כל טענה עם מעמד (מאומת / פרשנות / פתוח). */
  notes?: DomainNote[];
}
export interface DomainNote { id: string; title: string; points: { text: string; status: ClaimStatus }[]; where?: string }
export interface PlannedItem { kind: 'tool' | 'topic'; label: string; purpose: string; today?: string; research: string }
const NEW_RESEARCH = 'מחקר חדש — לא ברשימת R01–R14';

// ‼ «הדוח השנתי» ו«טופס 1301» היו שתי כניסות שנראו כפולות. עכשיו שתיהן בתחום אחד, עם תפקיד ברור לכל אחת:
//   ללמוד להכין דוח (מהמסמך לשדה) מול בדיקת הטופס לשנה ומוכנות לקוח.
export const DOMAINS: DomainDef[] = [
  { id: 'annual', label: 'דוח שנתי', what: 'הכנת הדוח השנתי ליחיד: אילו טפסים ונספחים, איך עוברים מכל מסמך לשדה, ואיך בודקים לפני הגשה.',
    when: 'לכל לקוח שמגיש דוח — עצמאי, בעל הכנסות נוספות, או מי שרוצה החזר.',
    items: [
      { kind: 'topic', id: 'annualReturn', label: 'הכנת הדוח: מהמסמך לשדה', purpose: 'ללמוד את התהליך — מסמכים, נספחים, קודים, בני זוג ובדיקות' },
      { kind: 'tool', id: 'map1301', label: 'הטופס מול תיק לקוח ובקרה', purpose: 'הטופס עם מצב כל שדה אצל לקוח מסוים, מה השתנה מול 2024 וכיסוי לפי חלקים' },
    ],
    workKinds: ['annual', 'intake'], catalogAreas: ['salary', 'capital', 'foreign', 'donations', 'special', 'carryForward', 'filing'],
    seeAlso: [{ id: 'maternity', why: 'דמי לידה בדוח: 250 או 194, המס שנוכה, וסימון הפריסה בעמ׳ 1 עם 116ג' }] },
  { id: 'credits', label: 'נקודות זיכוי ומדרגות', what: 'כמה נקודות זיכוי מגיעות ולמה, מדרגות המס, מס יסף, הטבת יישובים ומענק עבודה.',
    when: 'בכל חישוב מס — הערכה, דוח או בדיקת החזר.',
    items: [
      { kind: 'tool', id: 'wizard', label: 'אשף נקודות זיכוי', purpose: 'עונים על שאלות — מקבלים את הנקודות וההסבר לכל אחת' },
      { kind: 'tool', id: 'incomeTax', label: 'מדרגות ומס יסף', purpose: 'המדרגות לשנה, מס יסף וחישוב מהיר' },
      { kind: 'tool', id: 'settlements', label: 'יישובים מוטבים', purpose: 'האם היישוב מזכה, ובכמה' },
    ],
    workKinds: ['annual', 'estimate'], catalogAreas: ['household'],
    // ‼ 16.10 (מצב משפחתי לפי שנת המס, src/utils/familyStatusYear.ts): החישוב לפי המצב בשנת המס, לא היום.
    notes: [{ id: 'familyYear', title: 'מצב משפחתי בשנת המס: מה קובע ומתי', where: 'בכרטיס הלקוח: תיק מס ← «משפחה וזכאות» — המצב ושנת האירוע.', points: [
      { text: 'המצב המשפחתי בדוח הוא המצב בשנת המס, לא היום. «נשוי» לעניין מס — נשוי לפי המרשם, שחי יחד ומנהל משק בית משותף; «פרוד» — רק אחרי עדכון מרשם רשות המסים בטופס 4440 (מדריך 1301 לשנת 2025, «מצב משפחתי», עמ׳ 10).', status: 'verified' },
      { text: 'לשנת שינוי מצב משפחתי דרושים תאריך האירוע המלא וזהות בן הזוג הרשום, לצד מצב ההחזקה והכלכלה של הילדים ואופן החישוב והדיווח. שנת האירוע לבדה אינה מספיקה להפעלת החלוקה החודשית שבסעיף 41. אם חסרים נתוני התחולה, אין לאשר אוטומטית תוצאת סוף שנה.', status: 'interpretation' },
      { text: 'בשנת הנישואין (או כשחזרו ממצב פרודים) בני הזוג בוחרים דוח משותף או נפרד, ומצהירים על כך לפני ההגשה בטופס 5329 — באזור האישי או בפורטל המייצגים. בלי הצהרה הדוח לא ישודר (שם, «בני זוג», עמ׳ 5).', status: 'verified' },
      { text: 'שנת גירושין או פטירה אינה נקבעת אוטומטית לפי המצב ב־31.12. סעיף 41 קובע לבן זוג שאינו הרשום, שהיה נשוי חלק מהשנה, נקודות יחסיות לפי חודשי התקופות ובכפוף לסעיפים הנזכרים בו. סעיף 40(ב)(3) כולל גם ילד שאחד מהוריו נפטר בשנת המס. בודקים תאריך מלא, בן זוג רשום, אופן חישוב, ילדים והחזקה; אין להחיל חלוקה חודשית על כל אדם וכל הטבה בלי בדיקת תחולה. עד שהמחשבון תומך בכך, חישוב לשנת האירוע לפי מצב סוף השנה טעון התאמה מקצועית.', status: 'interpretation' },
      { text: 'כשהשנה לא רשומה בכרטיס — המצב לשנה קודמת «לא ידוע»: החישוב מסומן «לבדיקה» ואינו מאושר. לא מנחשים.', status: 'interpretation' },
    ] }] },
  { id: 'salary', label: 'שכירים ושכר', what: 'הכנסה ממשכורת: שווי שימוש ברכב, שכר מינימום, ריבית על הלוואה מהמעביד ודיווח ניכויים.',
    when: 'ללקוח שכיר, או ללקוח שמעסיק עובדים ומשלם שכר.',
    items: [],
    learnGap: 'מסלול לימוד לשכירים — טרם נכתב. בינתיים: הערכים לשנה, מה מבקשים מהלקוח, והעבודה בתיקים.',
    workKinds: ['annual', 'estimate'], catalogAreas: ['salary'],
    seeAlso: [{ id: 'maternity', why: 'שכירה שקיבלה דמי לידה: דרך המעסיק (ב-106) או ישירות מב״ל (194/196), ופריסה' }],
    planned: [
      { kind: 'tool', label: 'תחשיבי שכר', purpose: 'עלות מעביד, שכר מינימום, פיצויים, הבראה, הלנת שכר והלוואות לעובדים', today: 'שכר מינימום וריבית 3(ט) — בערכים לשנה; דמי ב״ל של מעביד — בכלי «שיעורים ותקרות» בביטוח לאומי', research: NEW_RESEARCH },
      { kind: 'tool', label: 'רכב: שווי שימוש, אחזקה, ליסינג ודלק', purpose: 'חישוב שווי השימוש ופיצול הוצאות הרכב', today: 'ערכי שווי שימוש לשנה — בערכים; סיווג הוצאות רכב — בכלי «הוצאות מוכרות»', research: NEW_RESEARCH },
      { kind: 'topic', label: 'תגמולי מילואים לשכירים', purpose: 'מה נחשב הכנסה, איך מדווחים ואילו מענקים פטורים', today: 'הדיווח בדוח — בנושא «הדוח השנתי»; «תביעת מילואים» היא בקשה ב«בקשות»', research: 'R04–R05 (גמלאות ב״ל וסיווגן)' },
    ] },
  { id: 'savings', label: 'פנסיה, השתלמות ופרישה', what: 'ניכוי וזיכוי על הפקדות לפנסיה ולקרן השתלמות, פנסיית חובה לעצמאים, ופטורים בפרישה.',
    when: 'לעצמאי או לשכיר־עצמאי שמפקיד, לפני סוף השנה כשבודקים השלמת הפקדה, או ללקוח שפורש.',
    items: [
      { kind: 'topic', id: 'pensionSE', label: 'פנסיה לעצמאי', purpose: 'ניכוי בשני מסלולים, זיכוי, גיל 50 ועמית מוטב' },
      { kind: 'topic', id: 'studyFund', label: 'קרן השתלמות', purpose: 'ניכוי בשנת ההפקדה ופטור במשיכה — שתי תקרות' },
      { kind: 'topic', id: 'mandatoryPension', label: 'פנסיית חובה לעצמאים', purpose: 'מי חייב, כמה, ומה ההבדל מהטבת המס' },
    ],
    workKinds: ['annual', 'estimate'], catalogAreas: ['savings'],
    planned: [
      { kind: 'tool', label: 'היוון קצבה', purpose: 'חישוב היוון ופטור', today: 'ערכי ההיוון — בערכים לשנה (פרישה)', research: NEW_RESEARCH },
    ] },
  { id: 'ni', label: 'ביטוח לאומי', what: 'דמי ביטוח לעצמאי: על איזו הכנסה, מקדמות, תיקון ושומה סופית — וגמלאות שב״ל משלם, כמו דמי לידה.',
    when: 'לכל עצמאי, ולשכיר שיש לו גם הכנסה מעסק; ולכל מי שקיבל דמי לידה.',
    items: [
      { kind: 'topic', id: 'niSelfEmployed', label: 'ביטוח לאומי לעצמאי', purpose: 'חישוב, מקדמות ותיקון — עם מחשבון רבעוני' },
      { kind: 'topic', id: 'maternity', label: 'דמי לידה: סיווג, מס במקור ופריסה', purpose: 'באיזה שדה, מה עושים במס שנוכה, ופריסה לפי ימי הזכאות עם 116ג' },
      { kind: 'tool', id: 'ni', label: 'שיעורים ותקרות', purpose: 'הטבלאות לשנה לכל סוגי המבוטחים' },
    ],
    workKinds: ['estimate', 'annual'], catalogAreas: ['niBenefits'] },
  { id: 'advances', label: 'מקדמות והערכת מס', what: 'הערכה לפי חודש חתך: אמת מול תחזית, מקדמות במס הכנסה ובביטוח לאומי, ומה עושים אם משנים.',
    when: 'באמצע שנה — כשהכנסות העסק השתנו, או לפני המלצה ללקוח על מקדמות.',
    items: [
      { kind: 'topic', id: 'advances', label: 'מקדמות והערכת מס', purpose: 'חודש חתך, ארבעה תאריכים, ומה קורה לחודשים שעברו' },
    ],
    workKinds: ['estimate'], catalogAreas: ['payments'] },
  { id: 'business', label: 'עסק, מע״מ וניהול ספרים', what: 'עסק זעיר, מע״מ ועוסק פטור, סיווג הוצאות, ניהול ספרים ו-6111 — מה מותר לנכות ואיך מדווחים.',
    when: 'לכל עוסק — פטור, מורשה או עסק זעיר.',
    items: [
      { kind: 'topic', id: 'dealerType', label: 'עוסק פטור או מורשה', purpose: 'תקנה 13 (מי מורשה בכל מקרה), התקרה, הענף בטופס 821' },
      { kind: 'topic', id: 'microBusiness', label: 'עסק זעיר', purpose: 'ניכוי 30%, תקרה, חריגה וצינון' },
      { kind: 'topic', id: 'form6111', label: 'טופס 6111 ומילון סיווג', purpose: 'מי חייב, מבנה הקודים, וסיווג הוצאה לקוד' },
      { kind: 'tool', id: 'expenses', label: 'הוצאות מוכרות', purpose: '«אפשר לנכות את זה?» — מס הכנסה ומע״מ, עם מקורות' },
      { kind: 'tool', id: 'bookkeeping', label: 'ניהול ספרים', purpose: 'איזו תוספת ואילו ספרים העוסק חייב לנהל' },
    ],
    workKinds: ['annual', 'intake'], catalogAreas: ['business'],
    planned: [
      { kind: 'topic', label: 'חשבוניות ישראל', purpose: 'רישום, מספר הקצאה, ביטול חשבונית, חשבונית עצמית, מלכ״ר ומוסד כספי', today: 'אזכורים במילון הסיווג ובקבלות תרומה בלבד', research: NEW_RESEARCH },
      { kind: 'topic', label: 'מתווי פיצויים למלחמה ומענקים', purpose: 'מי זכאי, איך מחשבים, ואיך המענק נכנס לדוח (חרבות ברזל)', today: 'אזכור במילון הסיווג (מסומן «פתוח») ובשורת ההכנסות ב-1320', research: NEW_RESEARCH },
      { kind: 'topic', label: 'תגמולי מילואים לעצמאים', purpose: 'תגמול, פיצוי לעצמאי ומענקים — סיווג ודיווח', today: '«תביעת מילואים» — בקשה ב«בקשות»; נקודות זיכוי — באשף', research: 'R04–R05 (גמלאות ב״ל וסיווגן)' },
      { kind: 'topic', label: 'תרומות לחיילים ולתושבי הדרום', purpose: 'מע״מ ומס הכנסה על תרומה ומתנה בזמן מלחמה', research: NEW_RESEARCH },
      { kind: 'topic', label: 'הקלות ודחיית דיווחים', purpose: 'מועדים שנדחו ומה הוקל, לפי פרסומי הרשות', today: 'דחייה בהצהרת עוסק פטור — בערכים; לוח המועדים — ב«מקורות ועדכניות»', research: NEW_RESEARCH },
      { kind: 'tool', label: 'נסיעות עסקיות לחו״ל', purpose: 'מחשבון אש״ל, לינה וכרטיסי טיסה לפי ימי עסקים', today: 'ההסברים והסכומים — בכלי «הוצאות מוכרות» ובערכים לשנה', research: NEW_RESEARCH },
      { kind: 'tool', label: 'מכתב ללקוח: הוראות ניהול ספרים לפי מקצוע', purpose: 'מכתב מובנה להורדה לפי סוג העסק והתוספת', today: 'הסיווג לפי סוג עסק — בכלי «ניהול ספרים»; אין מכתב להורדה', research: 'אין צורך במחקר חדש — חיבור של מה שיש' },
    ] },
  { id: 'companies', label: 'חברות ובעלי שליטה', what: 'מס חברות, דיבידנד ורווחים כלואים, וריבית על הלוואה לבעל מניות.',
    when: 'ללקוח שמחזיק חברה, או שהוא בעל מניות מהותי.',
    items: [],
    learnGap: 'מסלול לימוד לחברות ולבעלי שליטה — טרם נכתב. בינתיים: הערכים לשנה, מה מבקשים מהלקוח, והעבודה בתיקים.',
    workKinds: ['annual'], catalogAreas: ['companies'] },
  { id: 'rent', label: 'שכר דירה ונדל״ן', what: 'מיסוי שכר דירה למגורים — פטור, 10% או מס שולי — מס רכישה, מס שבח ומכירת נכסים.',
    when: 'ללקוח שמשכיר דירה, או שמכר נכס השנה.',
    items: [
      { kind: 'tool', id: 'rental', label: 'מחשבון שכר דירה', purpose: 'השוואת שלושת המסלולים, כולל הפטור המתקפל' },
    ],
    learnGap: 'מסלול לימוד לשכר דירה ולמכירת נכס — טרם נכתב. בינתיים: המחשבון, הערכים לשנה והשאלון.',
    workKinds: ['annual', 'estimate'], catalogAreas: ['rent', 'sales'],
    planned: [
      { kind: 'tool', label: 'מס שבח ופריסת שבח', purpose: 'חישוב שבח, פטור לדירת מגורים ופריסה', today: 'מס רכישה, תקרת פטור ו-18 חודשים — בערכים לשנה', research: NEW_RESEARCH },
    ] },
  { id: 'wealth', label: 'הצהרת הון', what: 'הצהרה ראשונה או המשך: מועד, הטופס שדה אחר שדה, איך רושמים והשוואת הון.',
    when: 'כשהגיעה דרישה מפקיד השומה, או לפני כשמתכננים.',
    items: [
      { kind: 'topic', id: 'wealth', label: 'הצהרת הון והשוואת הון', purpose: 'המועד, 1219 שדה אחר שדה, השאלון והתהליך ביד' },
    ],
    // ‼ 15.10: כל חלקי שאלון ההון, מהשאלון עצמו — הרשימה הידנית הציגה 7 מתוך 14 (בלי «מי בהצהרה», מזומן, נכסים דיגיטליים…)
    workKinds: ['wealth'], catalogAreas: WEALTH_AREAS.map(a => a.id) },
  // ‼ 15.10: «ערכים לפי נושא» ירד — כל ערך בעמוד התחום שלו (taxKnowledge/domainValues.ts). כאן רק מה שבאמת רוחבי.
  { id: 'reference', label: 'מקורות ועדכניות', what: 'מה שחוצה תחומים: לוח המועדים של כל התחומים, ועדכניות המאגר — מה נבדק, מתי, ומה פתוח.',
    when: 'כשמתכננים את החודש, או לפני עדכון שנתי של הידע.',
    items: [
      { kind: 'tool', id: 'deadlines', label: 'לוח מועדים', purpose: 'המועדים החודשיים והשנתיים — כל אחד עם התחום שלו' },
      { kind: 'tool', id: 'maintenance', label: 'עדכניות ותחזוקה', purpose: 'ביסוס לכל כלל, בדיקת כיסוי, ופרומפט עדכון' },
    ],
    workKinds: [], catalogAreas: [],
    planned: [
      { kind: 'tool', label: 'ריבית והצמדה', purpose: 'לפי חוק פסיקת ריבית, כולל רשויות מקומיות — לחובות, החזרים והפרשים', today: 'שיעור ריבית בודד במרשם; הפרשי הצמדה במקדמות ב״ל — לא מחושבים', research: 'R11 (הפרשי הצמדה במקדמות) + מחקר חדש' },
      { kind: 'tool', label: 'מדדים ושערי מט״ח', purpose: 'מדד לתאריך ושער יציג ליום', today: 'כלל השער היציג להצהרת הון — במרשם', research: NEW_RESEARCH },
      { kind: 'tool', label: 'סדרת תשלומים', purpose: 'חלוקת חוב או מקדמה לתשלומים עם ריבית', research: NEW_RESEARCH },
      { kind: 'tool', label: 'ריביות בנקאיות וריבית חשב כללי', purpose: 'שיעורים לפי תקופה — לחישובי הלוואות ושווי', research: NEW_RESEARCH },
      { kind: 'tool', label: 'שערוך מזונות', purpose: 'עדכון סכום מזונות לפי מדד', today: 'פרטי ילדים ומזונות — בכרטיס הלקוח בלבד', research: NEW_RESEARCH },
    ] },
];
export const DOMAIN_BY_ID = Object.fromEntries(DOMAINS.map(d => [d.id, d])) as Record<DomainId, DomainDef>;

/** התחום של נושא או כלי — לקישור ישן (נושא בלבד) ולחזרה מתיק הלקוח. */
export function domainOf(itemId: string): DomainId | undefined {
  return DOMAINS.find(d => d.items.some(i => i.id === itemId))?.id;
}

// ── הכתובת ─────────────────────────────────────────────────────────────────────
export type AreaPath =
  | { mode: 'work'; section: WorkSection }
  /** values — קבוצת ערכים שנפתחת בעמוד התחום (‎learn/<domain>/v/<group>‎). moved — הגיעו מקישור ישן ל«ערכים לפי נושא». */
  /** sub — מה שנבחר בתוך כלי או נושא (מאמר הוצאה, פעילות בניהול ספרים): ‎learn/<domain>/<item>/<sub>‎. */
  | { mode: 'learn'; domain?: DomainId; item?: string; values?: string; moved?: true; code?: string; sub?: string };

export const DEFAULT_AREA_PATH: AreaPath = { mode: 'work', section: 'all' };

/** ‎"work/annual"‎ · ‎"learn/savings/pensionSE"‎ — מה שאחרי ‎#/tax/‎. קטע לא מוכר נופל לראש המרחב, לא לשגיאה. */
export function parseAreaPath(raw: string | undefined): AreaPath {
  const [mode, a, b, c] = (raw ?? '').split('/').filter(Boolean);
  if (mode === 'learn') {
    if (!a) return { mode: 'learn' };
    // ‼ «ערכים לפי נושא» ירד (15.10) — קישור ישן נוחת בדף הבית, עם ההסבר לאן עבר כל נושא
    if ((a === 'reference' && b === 'topics') || a === 'topics') return { mode: 'learn', moved: true };
    // קישור ישן לנושא בלי תחום (‎learn/pensionSE‎) — נוחת בתחום שלו
    if (!DOMAIN_BY_ID[a as DomainId]) {
      const d = domainOf(a);
      return d ? { mode: 'learn', domain: d, item: a } : { mode: 'learn' };
    }
    const dom = DOMAIN_BY_ID[a as DomainId];
    if (b === 'v') return c && valueGroup(dom.id, c) ? { mode: 'learn', domain: dom.id, values: c } : { mode: 'learn', domain: dom.id };
    // ‎learn/annual/c/158‎ — עמוד התחום עם הטופס, והסעיף בקוד הזה מאותר בו (מהחיפוש בספרייה)
    if (b === 'c') return c && /^[0-9א-ת]{2,5}$/.test(c) && FORM_DOMAIN_IDS.has(dom.id) ? { mode: 'learn', domain: dom.id, code: c } : { mode: 'learn', domain: dom.id };
    if (b && dom.items.some(i => i.id === b)) return c ? { mode: 'learn', domain: dom.id, item: b, sub: safeDecode(c) } : { mode: 'learn', domain: dom.id, item: b };
    return { mode: 'learn', domain: dom.id };
  }
  if (mode === 'work') return { mode: 'work', section: (a && WORK_BY_ID[a as WorkSection] ? a : 'all') as WorkSection };
  return DEFAULT_AREA_PATH;
}

export function formatAreaPath(p: AreaPath): string {
  if (p.mode === 'work') return `work/${p.section}`;
  if (p.domain && p.values && !p.item) return `learn/${p.domain}/v/${p.values}`;
  if (p.domain && p.code && !p.item) return `learn/${p.domain}/c/${p.code}`;
  // ‼ sub מקודד כאן — שם פעילות כמו «פאב / בר» מכיל «/», והכתובת מפוצלת לפי «/» בכל שכבה
  return ['learn', p.domain, p.domain ? p.item : undefined, p.domain && p.item && p.sub ? encodeURIComponent(p.sub) : undefined].filter(Boolean).join('/');
}

const safeDecode = (s: string) => { try { return decodeURIComponent(s); } catch { return s; } };

/** תחומים שהעמוד שלהם הוא הטופס הרשמי עצמו (מפת הטופס). */
export const FORM_DOMAIN_IDS = new Set<DomainId>(['annual', 'wealth']);

// ── שנת המס שנפתחת (החלטת גיא, 25.10.2026) ─────────────────────────────────────────────
// ‼ סיכומים, טפסים והדוח — שנת עונת הדוחות: 2025 עד 31.3.2027. כלים שוטפים (ב״ל, יישובים, מדרגות, נקודות זיכוי,
//   מועדים) — השנה השוטפת. שנה שנבחרה ביד נשמרת; כניסה מתיק לקוח — שנת הדוח שלו. אין שימוש שקט בשנה אחרת.
/** שנת הדוחות שבעונה: מאפריל ועד סוף מרץ שאחריו — הדוח על השנה הקודמת. */
export function reportSeasonYear(today = new Date()): number {
  return today.getMonth() >= 3 ? today.getFullYear() - 1 : today.getFullYear() - 2;
}
/** השנה הקרובה ביותר שיש לה נתונים — לא קופצים קדימה לשנה שאין עליה מידע. */
export function clampYear(y: number, years: number[]): number {
  if (years.includes(y)) return y;
  const below = years.filter(x => x <= y);
  return below.length ? Math.max(...below) : Math.min(...years);
}
export function defaultYearFor(p: AreaPath, years: number[], today = new Date()): number {
  const report = clampYear(reportSeasonYear(today), years);
  const current = clampYear(today.getFullYear(), years);
  if (p.mode !== 'learn' || !p.domain) return current;
  const it = itemOf(p);
  if (!it) return FORM_DOMAIN_IDS.has(p.domain) ? report : current;
  if (it.kind === 'topic') return report;
  return it.id === 'map1301' ? report : current;
}

// ── «חזרה ל…» (26.10.2026) ─────────────────────────────────────────────────────────────────
// ‼ מהטופס ל«ללמוד» וחזרה — לאותו עמוד, גם כשהגיעו אליו מכמה כיוונים. «אחורה» בדפדפן נשאר; זו החזרה הגלויה.
/** הזהות של עמוד לצורך «חזרה»: תחום/פריט (בלי השלב שבתוכו), או הטופס על קוד. */
export function pageKeyOf(path: string): string {
  const p = parseAreaPath(path);
  if (p.mode !== 'learn') return 'work';
  if (!p.domain) return 'home';
  return p.item ? `${p.domain}/${p.item}` : p.code ? `${p.domain}/c` : p.domain;
}
/** השביל אחרי מעבר: אותו עמוד — מחליף; העמוד הקודם — חזרה; דף הבית — מתחילים מחדש. */
export function advanceTrail(trail: string[], next: string): string[] {
  const key = pageKeyOf(next);
  if (key === 'home' || key === 'work') return [next];
  if (trail.length && pageKeyOf(trail[trail.length - 1]) === key) return [...trail.slice(0, -1), next];
  if (trail.length > 1 && pageKeyOf(trail[trail.length - 2]) === key) return [...trail.slice(0, -2), next];
  return [...trail, next].slice(-12);
}
/** לאן «חזרה» — רק כשזה לא דף הבית ולא התחום שבפירורים (שם כבר יש קישור). */
export function returnTargetOf(trail: string[]): string | null {
  if (trail.length < 2) return null;
  const back = trail[trail.length - 2], cur = parseAreaPath(trail[trail.length - 1]), b = parseAreaPath(back);
  if (b.mode !== 'learn' || !b.domain) return null;
  if (cur.mode === 'learn' && cur.item && !b.item && !b.code && b.domain === cur.domain) return null;
  return back;
}

/** הפריט בתחום שנפתח, או undefined כשמוצג עמוד התחום עצמו. */
export function itemOf(p: AreaPath): DomainItem | undefined {
  if (p.mode !== 'learn' || !p.domain || !p.item) return undefined;
  return DOMAIN_BY_ID[p.domain].items.find(i => i.id === p.item);
}

/**
 * תחומי השאלון שעמוד התחום מציג תחת «מה מבקשים מהלקוח»: אלה שהוגדרו לו, ובנוסף כל מה שנושאי הלימוד שבתוכו מציגים בשלב «מה מבקשים».
 * ‼ כך הפירוט שנפתח מעמוד התחום הוא על-קבוצה של מה שמסלול הלימוד מראה — אותו מקור, בלי רשימה שנייה שתתיישן. לפי סדר השאלון.
 */
export function askAreasOf(d: DomainDef): AreaId[] {
  const ids = new Set<AreaId>([...d.catalogAreas, ...d.items.flatMap(i => (i.kind === 'topic' ? topicAskAreaIds(i.id) : []))]);
  const order = new Map(AREAS.map((a, n) => [a.id, n]));
  return [...ids].sort((a, b) => (order.get(a) ?? 99) - (order.get(b) ?? 99));
}

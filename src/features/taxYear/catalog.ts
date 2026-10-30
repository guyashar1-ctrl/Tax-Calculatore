// ─── תחומי מידע ופריטי מידע לשנת מס ─────────────────────────────────────────
// ‼ זו היחידה שהלקוח רואה — לא שדות 1301. כל פריט אומר אילו חלקים בטופס ואילו
// פריטי נספח הוא מזין (בקרת כיסוי מאחור), אבל השאלה ללקוח היא שאלה של חיים:
// «עבדת כשכיר השנה?», לא «קוד 158».
// ‼ מדרג: שאלת פתיחה לתחום → ישות (מעביד, נכס, חשבון) → סכום או מסמך. פריט
// חריג (rare) נפתח רק כשהמשרד מסמן אותו.
// ‼ מפתח פריט הוא זהות: שינוי מפתח שובר עובדות שמורות. משנים ניסוח, לא מפתח.

import type { Client } from '../../types';
import type { DocKind, EntityKind, EntitySpec, Purpose } from './types';
import { WEALTH_AREAS, WEALTH_ITEMS } from './wealthCatalog';
import { INTAKE_AREAS, INTAKE_ITEMS } from './intakeCatalog';

export type AreaId =
  | 'household' | 'salary' | 'business' | 'niBenefits' | 'rent' | 'capital' | 'sales'
  | 'foreign' | 'savings' | 'donations' | 'companies' | 'payments' | 'carryForward' | 'special' | 'filing'
  // הצהרת הון (230)
  | 'wPeople' | 'wRealEstate' | 'wBank' | 'wDigital' | 'wCash' | 'wFunds' | 'wSecurities' | 'wLoansGiven'
  | 'wVehicles' | 'wValuables' | 'wLiabilities' | 'wBusiness' | 'wPartD' | 'wSinceLast'
  // קליטה והשלמת תיק המס (236)
  | 'iPeople' | 'iCredits' | 'iWork' | 'iProperty' | 'iSavings' | 'iHistory' | 'iFiling';

export interface Area {
  id: AreaId;
  title: string;          // למשרד
  clientTitle: string;    // ללקוח, בלי מונחי מס
  /** חלקי 1301 שהתחום מכסה (בקרת כיסוי). */
  parts1301: string[];
  /** נספחים שהתחום מזין. */
  annexes: string[];
  purposes: Purpose[];
  /** הצהרת הון: הסעיפים בטופס 1219 שהתחום מכסה. */
  form1219?: string;
}

export const AREAS: Area[] = [
  { id: 'household', title: 'משק הבית ונקודות זיכוי', clientTitle: 'המשפחה והבית', parts1301: ['ב', 'יג'], annexes: ['119', '116ד'], purposes: ['estimate', 'annual'] },
  { id: 'salary', title: 'משכורת', clientTitle: 'עבודה כשכיר', parts1301: ['ג'], annexes: ['134'], purposes: ['estimate', 'annual'] },
  { id: 'business', title: 'עסק או משלח יד', clientTitle: 'העסק', parts1301: ['ג', 'ז'], annexes: ['1320', '1342', '1343'], purposes: ['estimate', 'annual'] },
  { id: 'niBenefits', title: 'תקבולים מביטוח לאומי', clientTitle: 'כספים מביטוח לאומי', parts1301: ['ג'], annexes: [], purposes: ['estimate', 'annual'] },
  { id: 'rent', title: 'שכר דירה', clientTitle: 'השכרת נכס', parts1301: ['ד', 'ה', 'י'], annexes: ['1321'], purposes: ['estimate', 'annual'] },
  // ‼ 12.10.2026 (מחקר: docs/tax-foundation/research/securities-foreign-income-2026-10-12.md): 1322 «נספח ג» — מרכז;
  //   1325 «נספח ג1» — שורה לכל מכירה (חובה כשלא נוכה מלוא המס, למשל בברוקר זר); 1326 «נספח ג2» — ני״ע מלפני 2006.
  { id: 'capital', title: 'שוק ההון וריבית', clientTitle: 'חסכונות והשקעות בבנק ובבית השקעות', parts1301: ['ה', 'ח'], annexes: ['1322', '1325', '1326', '1344'], purposes: ['estimate', 'annual'] },
  { id: 'sales', title: 'מכירת נכסים ונדל״ן', clientTitle: 'מכירה של נכס', parts1301: ['ח', 'טו'], annexes: ['1399י'], purposes: ['estimate', 'annual'] },
  // 1324 «נספח ד» — הכנסות מחו״ל ומס זר; מכירת ני״ע בחו״ל — 1325 ו-1322 (כ«נכס בחו״ל»).
  { id: 'foreign', title: 'חו״ל', clientTitle: 'הכנסות מחוץ לישראל', parts1301: ['ט', 'ח'], annexes: ['1324', '1325', '1322'], purposes: ['estimate', 'annual'] },
  { id: 'savings', title: 'חיסכון וביטוח', clientTitle: 'פנסיה, קרן השתלמות וביטוחים', parts1301: ['יב', 'יד'], annexes: [], purposes: ['estimate', 'annual'] },
  { id: 'donations', title: 'תרומות וזיכויים נוספים', clientTitle: 'תרומות', parts1301: ['יד'], annexes: [], purposes: ['estimate', 'annual'] },
  { id: 'companies', title: 'חברות בשליטה', clientTitle: 'חברה שבבעלותך', parts1301: ['ד', 'ה', 'יא'], annexes: [], purposes: ['estimate', 'annual'] },
  { id: 'payments', title: 'תשלומים ששולמו', clientTitle: 'תשלומים לרשויות', parts1301: ['טו'], annexes: [], purposes: ['estimate', 'annual'] },
  { id: 'carryForward', title: 'יתרות משנים קודמות', clientTitle: 'יתרות משנים קודמות', parts1301: ['יא'], annexes: ['1344'], purposes: ['estimate', 'annual'] },
  { id: 'special', title: 'מצבים מיוחדים', clientTitle: 'מצבים מיוחדים', parts1301: ['א', 'ו', 'ז', 'י'], annexes: [], purposes: ['estimate', 'annual'] },
  { id: 'filing', title: 'פרטים להגשה', clientTitle: 'פרטים להגשת הדוח', parts1301: ['א', 'ב', 'לשימוש המשדר'], annexes: [], purposes: ['annual'] },
];

export type ItemKind = 'screener' | 'confirm' | 'detail' | 'amount' | 'document';
/** על מי הפריט: אדם (לכל אחד מבני הזוג), משק הבית, או ישות ברשימה. */
export type ItemPer = 'person' | 'couple' | EntityKind;

export interface ItemCtx {
  client: Client;
  taxYear: number;
  purpose: Purpose;
  /** האם התשובה לשאלת הפתיחה של התחום היא «כן» לאדם הזה (מתוך עובדות). */
  screener: (key: string, role?: 'client' | 'spouse') => 'yes' | 'no' | 'unknown';
}

export interface InfoItem {
  key: string;
  area: AreaId;
  label: string;          // למשרד
  kind: ItemKind;
  per: ItemPer;
  /** מי עונה כברירת מחדל. */
  who: 'client' | 'office';
  purposes: Purpose[];
  /** שאלה ללקוח. בלי מונחי מס ובלי קודים. {name} = שם האדם. */
  question?: string;
  why?: string;
  input?: 'yesno' | 'amount' | 'date' | 'text' | 'choice' | 'confirm' | 'file' | 'record' | 'entity' | 'multi';
  options?: { value: string; label: string }[];
  /** 16.10.2026 · קלט «של מי / איפה» — שדות סגורים (types.ts › EntitySpec). */
  entity?: EntitySpec;
  /** 16.10.2026 · שאלת פתיחה בהיכרות: הכיתוב על האריח במסך «סמנו מה יש לכם» (קצר, בלי סימן שאלה). */
  tile?: string;
  docKind?: DocKind;
  /** פריט שנשאל רק אחרי «כן» בשאלת הפתיחה הזו. */
  after?: string;
  /** 20.10.2026 · בדוח השנתי לא נשאל לבד — הוא אפשרות במסך הבחירה הזה (למשל «דמי לידה» ב«מה שולם מביטוח לאומי?»). */
  annualVia?: string;
  /** חריג: נפתח רק כשהמשרד מסמן אותו. */
  rare?: boolean;
  /** מפתחות בכרטיס שמהם ידוע משהו מראש (מתמשך — לאישור, לא לשאלה). */
  cardKeys?: string[];
  /** בקרת כיסוי: חלקי 1301 ופריטי נספח (`annex-info-2025.json`). */
  /** ‼ 16.10.2026 · fields — קודי שדה ב-1301 (רשום / בן זוג), כשהפריט מזין שדה מוגדר; למפת הטופס. */
  covers?: { parts?: string[]; annexItems?: string[]; fields?: string[] };
  /** אילו בסיסים נחשבים «ידוע» לכל תכלית. */
  knownBasis?: Partial<Record<Purpose, ('actual' | 'actual_to_date' | 'forecast' | 'final' | 'declared' | 'derived')[]>>;
  /** חישוב שתלוי בפריט וחסום בפער פתוח — האיסוף נמשך. */
  calcBlockedBy?: string;
  /** לזוג: שאלה אחת «מי מכם?» במקום שאלה לכל אחד. העובדות עדיין נשמרות לכל אדם. */
  coupleQuestion?: string;
  /** נשאל רק כשיש בכרטיס מה לאשר (אחרת — לא נשאל, ומופיע בפירוט כלא ידוע). */
  onlyIfOnCard?: boolean;
  /** שאלת פתיחה שאין לשאול כשפריט האישור הזה כבר מכסה אותה מהכרטיס. */
  coveredBy?: string;
  /** הצהרת הון: רק בהצהרה ראשונה / רק בהצהרת המשך. */
  declKind?: 'first' | 'followup';
  /** הצהרת הון: נוסח השאלה בהצהרת המשך (מה השתנה מאז ההצהרה הקודמת). */
  followupQuestion?: string;
  /**
   * ‼ 12.10.2026: נשאל רק על ישות «חדשה» — כשהלקוח ענה «כן» בשאלת הפתיחה ובתיק אין לאדם הזה אף ישות
   * כזו (מעסיק, נכס, חשבון, מקור בחו״ל, קופה). ראו provisional ב-picture.ts.
   */
  onlyNew?: boolean;
  /** אישור מהכרטיס כשבכרטיס אין כלום: שאלה מובנית במקום «אין אצלנו פרטים». */
  whenEmpty?: { question: string; input: 'text' | 'choice' | 'record'; options?: { value: string; label: string }[] };
  /** «כן/לא» שמתורגם לשדה בוליאני בכרטיס — עדכון רק אחרי אישור המשרד, דרך הצעה עם היסטוריה. */
  cardFlag?: string;
  /** בחירה שמתורגמת לשדה בכרטיס (למשל מצב משפחתי) — אותו מסלול אישור. */
  cardChoice?: string;
  /** נשאל רק כשבכרטיס אין לאדם הזה אף ישות מהרשימה הזו (עסק — אין לו מסלול הצעות, ולכן לא ישות זמנית). */
  noCardEntity?: 'businesses';
  /** מה המשרד עושה עם התשובה או המסמך — למפת הכיסוי ולעבודה ביד. */
  officeNext?: string;
  /** נשאל רק לזוג נשוי (למשל: של מי מבני הזוג המקור בחו״ל). */
  onlyMarried?: boolean;
  /**
   * ‼ 16.10.2026 · שנת האירוע של המצב המשפחתי (נישואין / גירושין / פטירה): נשאל רק כשהמצב (תשובת הלקוח בקליטה,
   * אחרת הכרטיס) הוא זה — ובכרטיס אין שנה. כשיש שנה — היא מאושרת בתוך «המצב המשפחתי». אחרי אישור המשרד ⇒ «עדכן בתיק»
   * (השדה מ-FAMILY_STATUS_YEAR_KEY, utils/familyStatusYear.ts).
   */
  familyYearFor?: 'married' | 'divorced' | 'widowed';
  /**
   * ‼ 23.10.2026 · 290: נשאל רק כשהנתון הזה חסר בכרטיס (picture.ts › MISSING_ON_CARD). אחרי תשובה או שאלה — נשאר במעקב כרגיל.
   *   'spouseBasics' — מין או תאריך לידה של בן/בת הזוג: בלי מין הזיכויים שלהם לא מחושבים בכלל (creditGaps › spouseCreditGaps).
   *   'noIncomeCredit' — סעיף 37: זוג נשוי, בכרטיס אין לבן/בת הזוג מעסיק או עסק, והזכאות עוד לא נקבעה.
   */
  onlyIfMissing?: 'spouseBasics' | 'noIncomeCredit';
  /** ‼ 290 · נשאל רק מהשנה הזו (39ב — נקודות ללוחמי מילואים מ-2026). */
  fromTaxYear?: number;
}

const BOTH: Purpose[] = ['estimate', 'annual'];
const AMOUNT_KNOWN = { estimate: ['actual', 'actual_to_date', 'forecast', 'final', 'declared'], annual: ['final', 'actual'] } as InfoItem['knownBasis'];
const DOC_KNOWN = { estimate: ['actual', 'actual_to_date', 'final'], annual: ['final'] } as InfoItem['knownBasis'];

export const ITEMS: InfoItem[] = [
  // ── משק הבית — ידוע מהכרטיס; הלקוח מאשר «עדיין נכון», לא עונה מחדש ──
  { key: 'household.maritalAtYearEnd', area: 'household', label: 'מצב משפחתי בסוף השנה', kind: 'confirm', per: 'couple', who: 'client', purposes: BOTH,
    question: 'המצב המשפחתי', why: 'קובע אם הדוח משותף ואילו נקודות זיכוי מגיעות', input: 'confirm', cardKeys: ['familyStatus', 'marriageYear', 'divorceYear', 'widowhoodYear'], covers: { parts: ['ב'] } },
  { key: 'household.children', area: 'household', label: 'ילדים', kind: 'confirm', per: 'couple', who: 'client', purposes: BOTH,
    question: 'הילדים', why: 'לכל ילד מגיעות נקודות זיכוי לפי גילו', input: 'confirm', cardKeys: ['children'], covers: { parts: ['יג'] },
    // ‼ 21.10.2026 · בלי «קליטה» נפרדת (גיא): לקוח חדש שאין לו ילדים בכרטיס נשאל כאן — בהערכת המס או בדוח
    whenEmpty: { question: 'הילדים שלכם', input: 'record' } },
  { key: 'household.childDeferral', area: 'household', label: 'דחיית נקודת זיכוי לילד שנולד (116ד)', kind: 'detail', per: 'child', who: 'office', purposes: ['annual'],
    covers: { parts: ['יג'], annexItems: ['116ד.deferChildren', '116ד.useDeferred', '116ד.employer'] },
    officeNext: 'פרטי המעסיק לטופס (כתובת, טלפון, תיק ניכויים) — מטופס 101 או מהתלוש של המעסיק' },
  { key: 'household.settlement', area: 'household', label: 'יישוב מזכה', kind: 'confirm', per: 'couple', onlyIfOnCard: true, who: 'client', purposes: BOTH,
    question: 'יישוב המגורים', why: 'מגורים ביישוב מזכה מקנים הנחה במס', input: 'confirm', cardKeys: ['qualifyingSettlementId'], covers: { parts: ['יד'] },
    officeNext: 'השתנה — לבדוק מתי עבר/ה, ולתקן ב«יישוב מזכה» בתיק המס (קביעה ידנית עם סיבה)' },
  // ‼ 21.10.2026 · כתובת המגורים — נשאלת בהערכת המס ובדוח רק כשחסרה בכרטיס (אין יותר «קליטה והשלמת תיק» נפרדת; גיא:
  //   «אני פשוט אשלח לו הערכת מס, וככה על הדרך אקבל איפה הוא גר, כמה ילדים…»). באישור המשרד — לכרטיס, עם היסטוריה.
  { key: 'household.address', area: 'household', label: 'כתובת מגורים', kind: 'confirm', per: 'couple', who: 'client', purposes: BOTH, onlyIfOnCard: false,
    question: 'כתובת המגורים', why: 'הכתובת מופיעה בדוח ובמכתבים מהרשויות, ויישוב המגורים עשוי לזכות בהטבת מס', input: 'confirm', cardKeys: ['city', 'address'],
    whenEmpty: { question: 'מה כתובת המגורים שלכם היום?', input: 'record' }, covers: { parts: ['ב'] },
    officeNext: '«אשר ועדכן בתיק» — הכתובת נכתבת בכרטיס והקודמת נשמרת בהיסטוריה' },
  { key: 'household.degree', area: 'household', label: 'תואר או לימודי מקצוע', kind: 'confirm', per: 'person', onlyIfOnCard: true, who: 'client', purposes: BOTH,
    question: 'לימודים', why: 'סיום תואר מקנה נקודות זיכוי בשנים שאחרי הסיום', input: 'confirm', cardKeys: ['hasAcademicDegree', 'academicDegreeYear', 'academicDegreeType'], covers: { parts: ['יג'], annexItems: ['119.degree'] } },
  { key: 'household.release', area: 'household', label: 'שחרור משירות סדיר או לאומי', kind: 'confirm', per: 'person', onlyIfOnCard: true, who: 'client', purposes: BOTH,
    question: 'שירות צבאי או לאומי', why: 'בשנים שאחרי השחרור מגיעות נקודות זיכוי', input: 'confirm', cardKeys: ['completedIdf', 'idfReleaseYear', 'completedNationalService', 'nationalServiceYear'], covers: { parts: ['יג'] } },
  // ‼ 11.10.2026: שלושת הפריטים למעלה נשאלים רק כשהכרטיס יודע עליהם. תואר שהסתיים השנה, שחרור
  // או מעבר ליישוב מזכה — שאינם בכרטיס — לא היו עולים בכלל. שאלה אחת, רק כשיש מה לפספס;
  // «כן» ⇒ המשרד מעדכן את הכרטיס, ומשם האישור הרגיל.
  { key: 'household.creditChanges', area: 'household', label: 'שינוי שמזכה בהנחה (תואר, שחרור, מעבר יישוב)', kind: 'screener', per: 'person', who: 'client', purposes: BOTH,
    // ‼ 21.10.2026 · סבב 2: היישוב נבדק לפי הכתובת (שורת «זה עדיין נכון?») — לא כאן
    question: 'בשנים האחרונות, האם {name} סיים/ה תואר או לימודי מקצוע, או השתחרר/ה משירות צבאי או לאומי?',
    coupleQuestion: 'בשנים האחרונות, האם מישהו מכם סיים תואר או לימודי מקצוע, או השתחרר משירות צבאי או לאומי?',
    why: 'סיום לימודים או שירות מזכה בנקודות זיכוי בשנים שאחרי', input: 'yesno', covers: { parts: ['יג', 'יד'] } },
  // 12.10.2026 · טופס 119 (תואר/מקצוע): התמחות ופרטי המעסיק
  { key: 'household.degreeDocs', area: 'household', label: 'אישור תואר או מקצוע, ואישור סיום התמחות', kind: 'document', per: 'person', who: 'client', purposes: ['annual'], after: 'household.creditChanges',
    question: 'אישור הזכאות לתואר או לתעודת המקצוע, ואישור סיום התמחות אם הייתה', why: 'נקודות הזיכוי לתואר ניתנות לפי מועד הסיום, ולמתמחים — לפי שנות ההתמחות', input: 'file', docKind: 'degreeCert', knownBasis: DOC_KNOWN,
    covers: { annexItems: ['119.internship'] }, officeNext: 'מסיימי התמחות מ-2012 בוחרים שנת תחילה; תחום ותאריכים — לטופס 119' },
  { key: 'household.creditEmployer', area: 'household', label: 'פרטי המעסיק לטופס 119', kind: 'detail', per: 'person', who: 'office', purposes: ['annual'], after: 'household.creditChanges',
    covers: { annexItems: ['119.employer'] }, officeNext: 'כתובת ותיק ניכויים — מטופס 106 או מהתלוש; כשהנמען פקיד השומה ייתכן שלא נדרש' },
  // ‼ 290 · סעיף 40א חל רק על מי שנשוי/אה בשנית — בדוח השנתי ריבוע ב«מה יכול להוריד לך מס?» לכל נשוי/אה (לא «חריג»).
  //   באישור ⇒ paysAlimonyToEx בכרטיס (recordToCard); בהערכת המס — מה שבכרטיס.
  { key: 'household.alimonyPaid', area: 'household', label: 'מזונות ששולמו לבן/בת זוג לשעבר', kind: 'amount', per: 'person', who: 'client', purposes: ['annual'],
    question: 'האם {name} שילם/ה השנה מזונות לבן או בת זוג לשעבר?', why: 'מי שנישא מחדש ומשלם מזונות זכאי לנקודת זיכוי', input: 'yesno', covers: { parts: ['יג'] }, onlyMarried: true },
  // ‼ 290 · מין ותאריך לידה של בן/בת הזוג — פעם אחת, מוקדם, רק לזוג נשוי שבכרטיס חסר אחד מהם. באישור ⇒ clients.spouse (recordToCard)
  { key: 'household.spouseBasics', area: 'household', label: 'בן/בת הזוג: מין ותאריך לידה (לחישוב הזיכויים)', kind: 'detail', per: 'couple', who: 'client', purposes: BOTH,
    question: 'כמה פרטים על {spouse}', why: 'נקודות הזיכוי של כל אחד מכם תלויות בכך', input: 'record', onlyMarried: true, onlyIfMissing: 'spouseBasics' },
  // ‼ 290 · סעיף 37 — נקודה כשלבן/בת הזוג אין הכנסה ואחד מכם בגיל פרישה, עיוור/ת או נכה. רק כשבכרטיס אין לבן/בת הזוג עבודה או עסק.
  { key: 'household.noIncomeSpouse', area: 'household', label: 'בן/בת זוג בלי הכנסה (סעיף 37)', kind: 'detail', per: 'couple', who: 'client', purposes: BOTH,
    question: 'אם ל{spouse} לא הייתה הכנסה ב-{year} — מה מאלה נכון?', why: 'במצבים האלה מגיעה נקודת זיכוי נוספת', input: 'choice',
    options: [{ value: 'retirement', label: 'אחד מאיתנו בגיל פרישה' }, { value: 'blind', label: 'אחד מאיתנו עיוור/ת' }, { value: 'disabled', label: 'אחד מאיתנו נכה' },
      { value: 'none', label: 'אף אחד מאלה' }, { value: 'hadIncome', label: 'הייתה הכנסה' }],
    onlyMarried: true, onlyIfMissing: 'noIncomeCredit', officeNext: 'סעיף 37 — לבדוק אישור על העיוורון או הנכות, או גיל הפרישה' },

  // ── משכורת ──
  { key: 'salary.worked', area: 'salary', label: 'עבד/ה כשכיר/ה בשנה', kind: 'screener', per: 'person', who: 'client', purposes: BOTH, coveredBy: 'salary.employers',
    coupleQuestion: 'האם מישהו מכם עבד השנה כשכיר?',
    question: 'האם {name} עבד/ה כשכיר/ה השנה?', why: 'משכורת נכנסת לחישוב המס, ומהמעסיק מגיע אישור שנתי', input: 'yesno', cardKeys: ['employers'], covers: { parts: ['ג'] } },
  // ‼ 12.10.2026: רק כשבכרטיס יש מעסיק לאשר. בלי מעסיק בכרטיס — «עבדת כשכיר?», ו«כן» פותח מעסיק חדש (פרטים + 106).
  { key: 'salary.employers', area: 'salary', label: 'מעסיקים בשנה', kind: 'confirm', per: 'person', who: 'client', purposes: BOTH, after: 'salary.worked', onlyIfOnCard: true,
    question: 'מקומות העבודה', why: 'מכל מעסיק נבקש אישור שנתי משלו', input: 'confirm', cardKeys: ['employers'], covers: { parts: ['ג', 'ב'] } },
  { key: 'salary.spouseIncomeEstimate', area: 'salary', label: 'אומדן הכנסת בן/בת הזוג (מהכרטיס)', kind: 'amount', per: 'person', who: 'office', purposes: BOTH, knownBasis: AMOUNT_KNOWN, rare: true },
  { key: 'salary.form106', area: 'salary', label: 'טופס 106', kind: 'document', per: 'employer', who: 'client', purposes: ['annual'], after: 'salary.worked',
    question: 'טופס 106 מ{entity}', why: 'האישור השנתי שהמעסיק נותן אחרי סוף השנה («טופס 106») — המעסיק נותן אותו אחרי סוף השנה. ממנו נלקחים המשכורת, המס שנוכה וההפקדות', input: 'file', docKind: 'form106', knownBasis: DOC_KNOWN, covers: { parts: ['ג', 'יב', 'יד', 'טו'], annexItems: ['134.pensionDeposits', '134.studyFundDeposits', '134.severanceDeposits'] } },
  { key: 'salary.employerDetails', area: 'salary', label: 'מעסיק חדש: שם ותקופת העבודה', kind: 'detail', per: 'employer', who: 'client', purposes: BOTH, after: 'salary.worked', onlyNew: true,
    question: 'מקום העבודה החדש ב-{year}', why: 'כך נוסיף את המעסיק לתיק ונבקש ממנו את האישור השנתי', input: 'text',
    officeNext: '«הוסף לתיק» — המעסיק נכנס לכרטיס עם אותו מזהה, והמסמך שהועלה נשאר משויך אליו' },
  { key: 'salary.payslipToDate', area: 'salary', label: 'תלוש אחרון עם נתונים מצטברים', kind: 'document', per: 'employer', who: 'client', purposes: ['estimate'], after: 'salary.worked',
    question: 'התלוש האחרון מ{entity}', why: 'בתלוש יש את הסכום המצטבר מתחילת השנה — כך מעריכים את השנה כולה', input: 'file', docKind: 'payslipToDate', knownBasis: DOC_KNOWN },
  { key: 'salary.amounts', area: 'salary', label: 'סכומים מהמסמך: ברוטו, מס שנוכה, הכנסה מבוטחת, הפקדות מעסיק', kind: 'amount', per: 'employer', who: 'office', purposes: BOTH, after: 'salary.worked',
    knownBasis: AMOUNT_KNOWN, covers: { parts: ['ג', 'יב', 'טו'], annexItems: ['134.pensionDeposits', '134.employerDisability', '134.employeeDisability'] },
    officeNext: 'מטופס 106: גם הפקדות המעסיק והעובד לאובדן כושר עבודה (כולל הפקדה שחויבה במס)' },

  // ── עסק ──
  { key: 'business.active', area: 'business', label: 'עסקים פעילים בשנה', kind: 'confirm', per: 'person', who: 'client', purposes: BOTH,
    question: 'העסק', why: 'הכנסה מעסק היא הבסיס לחישוב המס והמקדמות', input: 'confirm', cardKeys: ['businesses'], covers: { parts: ['ג', 'ב'] } },
  { key: 'business.books', area: 'business', label: 'דוח רווח והפסד', kind: 'document', per: 'business', who: 'office', purposes: BOTH, after: 'business.active',
    docKind: 'annualPnl', knownBasis: DOC_KNOWN, covers: { parts: ['ג', 'ז', 'יא'], annexItems: ['1320.revenue', '1320.operatingExpenses', '1320.totals'] } },
  { key: 'business.profit', area: 'business', label: 'רווח (לפני תיאומי מס) ומחזור', kind: 'amount', per: 'business', who: 'office', purposes: BOTH, after: 'business.active',
    knownBasis: AMOUNT_KNOWN, covers: { parts: ['ג', 'ז', 'טו'] } },
  { key: 'business.selfDeposits', area: 'business', label: 'הפקדות בעל העסק לפנסיה ולקרן (מהכרטיס)', kind: 'amount', per: 'business', who: 'office', purposes: BOTH, knownBasis: AMOUNT_KNOWN, rare: true },
  { key: 'business.assetsChanged', area: 'business', label: 'רכישה או מכירה של ציוד, רכב או רכוש קבוע', kind: 'screener', per: 'business', who: 'client', purposes: BOTH, after: 'business.active',
    question: 'האם קנית או מכרת השנה ציוד, רכב או מחשבים ל{entity}?', why: 'ציוד לעסק לא נרשם כהוצאה אחת — הוא מופחת לאורך שנים, ולכן צריך את פרטיו', input: 'yesno', covers: { annexItems: ['1342.assetRegister', '1342.changesThisYear', '1342.disposals', '1343.assets'] } },
  { key: 'business.assetDocs', area: 'business', label: 'חשבוניות רכישה ומכירה של רכוש קבוע', kind: 'document', per: 'business', who: 'client', purposes: BOTH, after: 'business.assetsChanged',
    question: 'חשבוניות הקנייה או המכירה של הציוד', why: 'מהחשבונית נלקחים המחיר והתאריך לחישוב הפחת', input: 'file', docKind: 'assetInvoices', knownBasis: DOC_KNOWN, covers: { annexItems: ['1342.assetRegister', '1342.changesThisYear'] } },
  { key: 'business.depreciation', area: 'business', label: 'דוח פחת מהספרים', kind: 'document', per: 'business', who: 'office', purposes: ['annual'], after: 'business.active',
    docKind: 'depreciationReport', knownBasis: DOC_KNOWN, covers: { annexItems: ['1342.assetRegister', '1342.changesThisYear', '1342.disposals', '1343.assets'] } },
  // ── 12.10.2026 · שדות נספח 1320/1342 שנאספו עד היום רק «ממסמכי העסק» או בשיחה — לכל אחד מקור משלו ──
  { key: 'business.inventory', area: 'business', label: 'מלאי בעסק', kind: 'screener', per: 'business', who: 'client', purposes: ['annual'], after: 'business.active',
    question: 'האם יש ב{entity} מלאי — סחורה, חומרי גלם או מוצרים שעוד לא נמכרו?', why: 'המלאי בסוף השנה משנה את הרווח, ולכן צריך ספירה', input: 'yesno',
    covers: { annexItems: ['1320.inventoryAndPurchases'] }, officeNext: 'מלאי פתיחה — מלאי הסגירה בדוח הקודם; קניות — מהספרים; מלאי סגירה — מהספירה' },
  { key: 'business.inventoryCount', area: 'business', label: 'ספירת מלאי לסוף השנה', kind: 'document', per: 'business', who: 'client', purposes: ['annual'], after: 'business.inventory',
    question: 'רשימת ספירת המלאי של {entity} ב-31 בדצמבר: מה יש, כמה, ובאיזה מחיר נקנה', why: 'מהספירה נקבע מלאי הסגירה בדוח', input: 'file', docKind: 'inventoryCount', knownBasis: DOC_KNOWN,
    covers: { annexItems: ['1320.inventoryAndPurchases'] } },
  { key: 'business.employees', area: 'business', label: 'עובדים בעסק', kind: 'screener', per: 'business', who: 'client', purposes: ['annual'], after: 'business.active',
    question: 'האם העסקת עובדים ב{entity} השנה (כולל בני משפחה)?', why: 'בדוח העסק מפרטים את מספר העובדים ואת הוצאות השכר', input: 'yesno',
    covers: { annexItems: ['1320.payroll'] } },
  { key: 'business.payrollReport', area: 'business', label: 'דוח שכר שנתי (טופס 126)', kind: 'document', per: 'business', who: 'client', purposes: ['annual'], after: 'business.employees',
    question: 'הדוח השנתי על השכר ב{entity} — מי שמכין את המשכורות יכול להפיק אותו', why: 'נקרא «טופס 126». ממנו נלקחים מספר העובדים, השכר וההוצאות הנלוות', input: 'file', docKind: 'payrollReport', knownBasis: DOC_KNOWN,
    covers: { annexItems: ['1320.payroll'] } },
  { key: 'business.badDebts', area: 'business', label: 'חוב של לקוח שלא ייגבה', kind: 'screener', per: 'business', who: 'client', purposes: ['annual'], after: 'business.active',
    question: 'האם יש לקוח של {entity} שחייב לך כסף, ואין סיכוי לגבות אותו?', why: 'חוב שלא ייגבה יכול להיות מוכר כהוצאה — רק עם אסמכתאות', input: 'yesno',
    covers: { annexItems: ['1320.badDebts'] }, officeNext: 'רק בבסיס מצטבר, ורק אם ההכנסה נרשמה; לבדוק את האסמכתאות לפני ניכוי' },
  { key: 'business.badDebtDocs', area: 'business', label: 'אסמכתאות לחוב שלא ייגבה', kind: 'document', per: 'business', who: 'client', purposes: ['annual'], after: 'business.badDebts',
    question: 'מסמכים על החוב: החשבונית, פניות לגבייה, הליך משפטי או הודעה על פשיטת רגל', why: 'בלי אסמכתאות החוב אינו מוכר', input: 'file', docKind: 'badDebtDocs', knownBasis: DOC_KNOWN,
    covers: { annexItems: ['1320.badDebts'] } },
  { key: 'business.vehicle', area: 'business', label: 'רכב בשימוש העסק', kind: 'screener', per: 'business', who: 'client', purposes: ['annual'], after: 'business.active',
    question: 'האם השתמשת ברכב לצורך {entity}?', why: 'הוצאות רכב מותרות רק עם פרטי הרכב והשימוש בו', input: 'yesno',
    covers: { annexItems: ['1320.vehicleDetails', '1320.vehicleExpenses'] } },
  { key: 'business.vehicleDetails', area: 'business', label: 'פרטי הרכב: מספר, חודשי שימוש וק״מ', kind: 'detail', per: 'business', who: 'client', purposes: ['annual'], after: 'business.vehicle',
    question: 'פרטי הרכב: מספר הרכב, מאיזה חודש עד איזה חודש שימש לעסק, וכמה ק״מ הראה המד בתחילת השנה ובסופה', why: 'אלה הפרטים שהדוח דורש לכל רכב', input: 'text',
    covers: { annexItems: ['1320.vehicleDetails'] }, officeNext: 'מספר הרכב — מהרישיון; חודשי השימוש וק״מ — מהספרים או בשיחה עם הלקוח' },
  { key: 'business.vehicleLicense', area: 'business', label: 'רישיון הרכב', kind: 'document', per: 'business', who: 'client', purposes: ['annual'], after: 'business.vehicle',
    question: 'רישיון הרכב', why: 'מהרישיון נלקחים סוג הרכב ושנת הייצור', input: 'file', docKind: 'vehicleLicense', knownBasis: DOC_KNOWN,
    covers: { annexItems: ['1320.vehicleDetails'] } },
  { key: 'business.vehicleExpenses', area: 'business', label: 'הוצאות הרכב המלאות מהספרים', kind: 'amount', per: 'business', who: 'office', purposes: ['annual'], after: 'business.vehicle', knownBasis: AMOUNT_KNOWN,
    covers: { annexItems: ['1320.vehicleExpenses'] }, officeNext: 'מכרטסת הרכב: כולל פחת, חנייה שלא במקום העיסוק וכביש 6; החלק המותר — לפי התקנות' },
  { key: 'business.partnership', area: 'business', label: 'העסק הוא שותפות', kind: 'screener', per: 'business', who: 'client', purposes: ['annual'], after: 'business.active',
    question: 'האם {entity} הוא שותפות עם אנשים נוספים?', why: 'לשותפות מדווחים את פרטיה ואת חלקו של כל שותף', input: 'yesno',
    covers: { annexItems: ['1320.partnershipDetails', '1320.partners'] } },
  { key: 'business.partnershipDocs', area: 'business', label: 'הסכם השותפות ותעודת הרישום', kind: 'document', per: 'business', who: 'client', purposes: ['annual'], after: 'business.partnership',
    question: 'הסכם השותפות ותעודת הרישום של השותפות', why: 'מהם נלקחים מספר השותפות וחלקי השותפים', input: 'file', docKind: 'partnershipAgreement', knownBasis: DOC_KNOWN,
    covers: { annexItems: ['1320.partnershipDetails', '1320.partners'] } },
  { key: 'business.partners', area: 'business', label: 'השותפים וחלקם', kind: 'detail', per: 'business', who: 'client', purposes: ['annual'], after: 'business.partnership',
    question: 'מי השותפים? לכל אחד: שם, תעודת זהות, החלק שלו ברווחים, והאם הוא עובד בעסק', why: 'הדוח מפרט כל שותף, עד 100%', input: 'text',
    covers: { annexItems: ['1320.partners'] }, officeNext: 'השותף הראשון ברשימה — ראש השותפים לפי סעיף 63; לוודא שהחלקים מסתכמים ב-100%' },
  { key: 'business.rentsPremises', area: 'business', label: 'העסק שוכר מקום', kind: 'screener', per: 'business', who: 'client', purposes: ['annual'], after: 'business.active',
    question: 'האם {entity} שוכר משרד, חנות, קליניקה או מחסן?', why: 'על שכירות של העסק מדווחים את פרטי המשכיר', input: 'yesno',
    covers: { annexItems: ['1320.lessorDetails'] } },
  { key: 'business.premisesLease', area: 'business', label: 'חוזה השכירות של העסק', kind: 'document', per: 'business', who: 'client', purposes: ['annual'], after: 'business.rentsPremises',
    question: 'חוזה השכירות של המקום שהעסק שוכר', why: 'מהחוזה נלקחים פרטי המשכיר', input: 'file', docKind: 'premisesLease', knownBasis: DOC_KNOWN,
    covers: { annexItems: ['1320.lessorDetails'] } },
  { key: 'business.priorDepreciation', area: 'business', label: 'טבלת הפחת של השנה הקודמת (פחת נצבר)', kind: 'document', per: 'business', who: 'office', purposes: ['annual'], after: 'business.active',
    docKind: 'priorDepreciation', knownBasis: DOC_KNOWN, covers: { annexItems: ['1342.accumulatedPrior'] },
    officeNext: 'מהדוח הקודם במשרד; ללקוח חדש — מהרו״ח הקודם. עסק בלי רכוש קבוע — «לא רלוונטי»' },
  // ── עסק זעיר (87ב עד 87ז, מ-2024) — רק כשהמשרד מסמן. ‼ רישום, סוג תיק, מסלול לשנה וזכאות הם ארבעה דברים
  //    נפרדים; הזכאות נגזרת בחישוב (מחזור מול התקרה, 87ה), לא מסוג התיק ולא מהמעמד במע״מ.
  { key: 'business.microRegistration', area: 'business', label: 'עסק זעיר: רישום ברשות (תאריך) וסוג התיק', kind: 'document', per: 'business', who: 'office', purposes: BOTH, after: 'business.active', rare: true,
    docKind: 'microRegistration', knownBasis: DOC_KNOWN, covers: { parts: ['א'] } },
  { key: 'business.microTrack', area: 'business', label: 'עסק זעיר: המסלול לשנה (30% / ספרים / חריגה) והיסטוריית הניכוי בשנים הקודמות', kind: 'amount', per: 'business', who: 'office', purposes: BOTH, after: 'business.active', rare: true,
    knownBasis: { estimate: ['declared', 'derived'], annual: ['final', 'declared'] } },
  { key: 'business.microExclusions', area: 'business', label: 'עסק זעיר: סייגים (עובדים, הכנסה מהמעסיק, מעל רבע מקרוב או ממעסיק לשעבר)', kind: 'screener', per: 'business', who: 'client', purposes: BOTH, after: 'business.active', rare: true,
    question: 'השנה — האם {entity} העסיק עובדים, קיבל תשלום ממי שמעסיק אותך כשכיר, או קיבל יותר מרבע מההכנסות מקרוב משפחה או ממעסיק לשעבר?', why: 'כל אחד מאלה שולל את הניכוי של 30% לעסק זעיר', input: 'yesno' },
  { key: 'business.microCoordination', area: 'business', label: 'עסק זעיר: אישור תיאום מס לשנה', kind: 'document', per: 'person', who: 'client', purposes: BOTH, after: 'business.microRegistration', rare: true,
    question: 'אישור תיאום המס לשנה הזו (מהאזור האישי)', why: 'בלי תיאום במהלך השנה אין דיווח מקוצר — רק דוח שנתי מלא', input: 'file', docKind: 'taxCoordination', knownBasis: DOC_KNOWN },
  { key: 'business.forecast', area: 'business', label: 'צפי לשאר השנה', kind: 'amount', per: 'business', who: 'client', purposes: [] /* 27.10.2026 · הצפי נשאל אחרי המשיכה — business.forecastMonths */, after: 'business.active',
    question: 'מה צפוי ב{entity} עד סוף השנה, לעומת מה שהיה עד עכשיו?', why: 'ההערכה משלבת את מה שכבר קרה עם מה שצפוי', input: 'choice',
    options: [{ value: 'more', label: 'יותר הכנסות' }, { value: 'same', label: 'בערך אותו דבר' }, { value: 'less', label: 'פחות הכנסות' }], knownBasis: { estimate: ['forecast'] } },
  { key: 'business.oneOffs', area: 'business', label: 'הכנסות או הוצאות חד־פעמיות', kind: 'amount', per: 'business', who: 'client', purposes: [] /* 27.10.2026 · נכלל בצפי לכל חודש */, after: 'business.active',
    question: 'האם היו השנה ב{entity} הכנסה או הוצאה גדולה שלא תחזור? אם כן — מה וכמה', why: 'אירוע חד־פעמי לא מוכפל בקצב שנתי', input: 'yesno', knownBasis: { estimate: ['actual', 'forecast'] } },

  // ── ביטוח לאומי ──
  { key: 'niBenefits.received', area: 'niBenefits', label: 'דמי לידה, מילואים, אבטלה או פגיעה בעבודה', kind: 'screener', per: 'person', who: 'client', purposes: BOTH,
    coupleQuestion: 'האם מישהו מכם קיבל השנה דמי לידה, תגמולי מילואים, דמי אבטלה או דמי פגיעה בעבודה?',
    question: 'האם {name} קיבל/ה השנה דמי לידה, תגמולי מילואים, דמי אבטלה או דמי פגיעה בעבודה?', why: 'כספים מביטוח לאומי חייבים במס כמו משכורת', input: 'yesno', covers: { parts: ['ג'] } },
  { key: 'niBenefits.cert', area: 'niBenefits', label: 'אישור שנתי מביטוח לאומי', kind: 'document', per: 'person', who: 'office' /* ‼ 20.10.2026 גיא: «ביטוח לאומי זה משהו שאני מכניס כמייצג» */, purposes: BOTH, after: 'niBenefits.received',
    question: 'האישור השנתי מביטוח לאומי', why: 'באישור מופיעים הסכום והמס שנוכה', input: 'file', docKind: 'niAnnualCert', knownBasis: DOC_KNOWN, covers: { parts: ['ג', 'טו'] } },
  // ── דמי לידה (16.10.2026) — המקור: docs/tax-foundation/research/ni-benefits-withholding-2026-10-16.md (R04, C21/C24)
  //    ו-spreading-deferral-continuity-2026-10-16.md §3. שכירה/עצמאית — ידוע מהכרטיס, לא נשאל שוב.
  //    ‼ 105 ימים אינם קבועים (חלקי 56, הארכות, העברה לבן הזוג) — לכן שני תאריכים, מההודעה של ב״ל.
  //    ‼ הסכום: עצמאית ⇐ 250/270; שכירה שלא דרך המעסיק ⇐ 194/196; אם נכלל ב-106 ⇐ 158/172 (המשרד מכריע).
  //    ‼ המס שנוכה ⇐ 040 — פרשנות במחקר; הפרשים ששולמו מאוחר — פתוח (לא מפוצלים לבד).
  { key: 'niBenefits.maternity', area: 'niBenefits', label: 'דמי לידה', kind: 'screener', per: 'person', who: 'client', purposes: BOTH, after: 'niBenefits.received', annualVia: 'niBenefits.kinds',
    question: 'האם מתוך זה {name} קיבל/ה דמי לידה?', coupleQuestion: 'האם מישהו מכם קיבל דמי לידה מביטוח לאומי?',
    why: 'כשדמי הלידה שולמו על ימים בשתי שנים, אפשר לחלק אותם בין השנים — ולפעמים זה מקטין את המס', input: 'yesno',
    covers: { parts: ['ג'], fields: ['250', '270', '194', '196'] },
    officeNext: 'לפי המעמד בכרטיס: עצמאית ⇐ 250/270; שכירה שלא דרך המעסיק ⇐ 194/196; אם שולם דרך המעסיק ונכלל ב-106 ⇐ 158/172' },
  { key: 'niBenefits.maternityPeriod', area: 'niBenefits', label: 'דמי לידה: תקופת הזכאות', kind: 'detail', per: 'person', who: 'office' /* 20.10.2026 · מהודעת ב״ל — המשרד מוציא */, purposes: BOTH, after: 'niBenefits.maternity',
    question: 'מאיזה תאריך ועד איזה תאריך שולמו דמי הלידה?', why: 'לפי התאריכים יודעים אם התקופה עברה משנה לשנה', input: 'record',
    covers: { parts: ['ג'] }, officeNext: 'תקופה שחוצה את 31.12 — הצעת חלוקה בין השנים (פריט המשרד «פריסה בין שנות המס»)' },
  { key: 'niBenefits.maternityAmounts', area: 'niBenefits', label: 'דמי לידה: סכום ומס שנוכה', kind: 'amount', per: 'person', who: 'office' /* 20.10.2026 · מהאישור השנתי של ב״ל */, purposes: ['annual'], after: 'niBenefits.maternity',
    question: 'לפי האישור השנתי מביטוח לאומי — כמה דמי לידה שולמו, וכמה מס נוכה מהם?', why: 'הסכום והמס נכנסים לדוח, ובחלוקה בין שנים — שניהם מתחלקים', input: 'record',
    knownBasis: AMOUNT_KNOWN, covers: { parts: ['ג', 'טו'], fields: ['250', '270', '194', '196'] } },
  { key: 'niBenefits.maternityNotice', area: 'niBenefits', label: 'הודעת ב״ל על חישוב דמי הלידה', kind: 'document', per: 'person', who: 'office' /* 20.10.2026 */, purposes: ['annual'], after: 'niBenefits.maternity',
    question: 'ההודעה מביטוח לאומי על חישוב דמי הלידה — זו שכתובים בה התאריכים «מ… עד…»', why: 'ממנה לוקחים את מספר הימים בכל שנה', input: 'file', docKind: 'niMaternityNotice',
    covers: { parts: ['ג'] } },
  // ‼ פריט המשרד — מופיע רק כשתקופת הזכאות חוצה את 31.12 (picture.ts). הצעת חלוקה יחסית לפי ימים (maternity.ts).
  //   C26: אין עדיין מנגנון רב-שנתי — ההחלטה נשמרת לשנה הזו ולשנה השנייה, ושם היא מסומנת «לבדיקה».
  { key: 'niBenefits.maternitySpread', area: 'niBenefits', label: 'דמי לידה: פריסה בין שנות המס', kind: 'detail', per: 'person', who: 'office', purposes: BOTH,
    covers: { parts: ['ג', 'טו'] },
    officeNext: 'לבקשת הלקוחה: ההכנסה והמס שנוכה — לפי ימי הזכאות בכל שנה (חוזר 2/2022 §7). קדימה: בדוח של שנת הקבלה מסמנים «מבקש/ת פריסת דמי לידה לשנה הבאה» (רצף 159) ומצרפים 116ג; אחורה — 116ג ודוח/תיקון לשנה הקודמת. חובה להגיש דוח לשתי השנים' },

  // ── שכר דירה ──
  { key: 'rent.properties', area: 'rent', label: 'נכסים מושכרים', kind: 'confirm', per: 'couple', who: 'client', purposes: BOTH,
    question: 'הנכסים המושכרים', why: 'שכר דירה ממוסה לפי מסלול שנבחר לכל נכס', input: 'confirm', cardKeys: ['properties', 'hasRentalIncome'], covers: { parts: ['ד', 'ה', 'י'] } },
  { key: 'rent.income', area: 'rent', label: 'שכר דירה שהתקבל', kind: 'amount', per: 'property', who: 'client', purposes: BOTH, after: 'rent.properties',
    question: 'כמה שכר דירה התקבל השנה על {entity}?', why: 'הסכום קובע אם יש פטור ובאיזה מסלול', input: 'amount', knownBasis: AMOUNT_KNOWN, covers: { parts: ['ד', 'ה', 'י'], annexItems: ['1321.houseRentIncome', '1321.rent10Income'] },
    officeNext: 'מהחוזה: שכר חודשי × חודשי השכירות; חודשים בלי שוכר או שינוי בשכר — לוודא עם הלקוח' },
  { key: 'rent.incomeTotal', area: 'rent', label: 'שכר דירה — סכום כולל בלי פירוט לנכס (מהכרטיס)', kind: 'amount', per: 'couple', who: 'office', purposes: BOTH, knownBasis: AMOUNT_KNOWN, rare: true },
  { key: 'rent.expenses', area: 'rent', label: 'הוצאות השכרה', kind: 'amount', per: 'couple', who: 'client', purposes: BOTH, after: 'rent.properties', question: 'היו השנה הוצאות על הנכסים המושכרים (תיקונים, ריבית על המשכנתה, ועד בית, ביטוח)?', why: 'במסלול הרגיל ההוצאות מקטינות את ההכנסה החייבת', input: 'yesno', knownBasis: AMOUNT_KNOWN, covers: { annexItems: ['1321.houseExpenses'] } },
  { key: 'rent.contract', area: 'rent', label: 'חוזה שכירות', kind: 'document', per: 'property', who: 'client', purposes: ['annual'], after: 'rent.properties',
    question: 'חוזה השכירות של {entity}', why: 'החוזה מראה את התקופה ואת הסכום', input: 'file', docKind: 'rentalContract', knownBasis: DOC_KNOWN, covers: { annexItems: ['1321.houseRentIncome'] } },
  { key: 'rent.track', area: 'rent', label: 'מסלול מיסוי לנכס', kind: 'detail', per: 'property', who: 'office', purposes: BOTH, after: 'rent.properties', covers: { parts: ['ה', 'י'] } },
  // 12.10.2026 · מפת הכיסוי: עובדות של הלקוח שנספח 1321 דורש — חריג, נפתח כשהמשרד מסמן (המסלול הרלוונטי)
  { key: 'rent.singleApartment', area: 'rent', label: 'הצהרת «דירה יחידה»', kind: 'screener', per: 'couple', who: 'client', purposes: ['annual'], after: 'rent.properties', rare: true,
    question: 'האם הדירה שאתם משכירים היא דירת המגורים היחידה שבבעלותכם (שלכם ושל ילדים מתחת לגיל 18)?', why: 'במסלול המיסוי של 10% נדרשת הצהרה על «דירה יחידה»', input: 'yesno',
    covers: { annexItems: ['1321.rent10SingleApartment'] }, officeNext: 'לסמן בנספח 1321 לפי המסלול שנבחר; לבדוק מול רשימת הנכסים בתיק' },
  { key: 'rent.businessUse', area: 'rent', label: 'נכס ששימש לעסק לפני השכרתו (9ד)', kind: 'screener', per: 'property', who: 'client', purposes: ['annual'], after: 'rent.properties', rare: true,
    question: 'האם {entity} שימש לעסק שלכם לפני שהתחלתם להשכיר אותו?', why: 'נכס ששימש לעסק לפני ההשכרה מדווח בסעיף נפרד בנספח שכר הדירה', input: 'yesno',
    covers: { annexItems: ['1321.businessUseDeclaration'] }, officeNext: 'לבדוק את תנאי סעיף 9ד ולסמן בנספח 1321; «לא בטוח» — לברר לפני הגשה' },
  // ── 12.10.2026 · שדות נספח 1321 שלא היה להם מקור משלהם ──
  { key: 'rent.businessUseDocs', area: 'rent', label: 'מסמכי הנכס ששימש לעסק (9ד)', kind: 'document', per: 'property', who: 'client', purposes: ['annual'], after: 'rent.businessUse',
    question: 'נסח הטאבו, חוזה הקנייה וחוזה השכירות של {entity}', why: 'לנכס ששימש לעסק מדווחים גוש, חלקה, מועדי רכישה והשכרה ואת השוכר', input: 'file', docKind: 'businessUseDocs', knownBasis: DOC_KNOWN,
    covers: { annexItems: ['1321.businessUseProperty', '1321.businessUseIncome'] } },
  { key: 'rent.businessUseAmounts', area: 'rent', label: 'הכנסות והוצאות הנכס ששימש לעסק', kind: 'amount', per: 'property', who: 'office', purposes: ['annual'], after: 'rent.businessUse', knownBasis: AMOUNT_KNOWN,
    covers: { annexItems: ['1321.businessUseIncome'] }, officeNext: 'מהחוזה ומקבלות ההוצאות, כולל הכנסה שהתקבלה מראש' },
  { key: 'rent.coOwned', area: 'rent', label: 'בעלות משותפת בנכס (לא בן/בת הזוג)', kind: 'screener', per: 'property', who: 'client', purposes: ['annual'], after: 'rent.properties',
    question: 'האם {entity} בבעלות משותפת גם עם מישהו אחר (לא בן/בת הזוג)?', why: 'כשיש שותפים בנכס, מדווחים רק את החלק שלך בהכנסה', input: 'yesno',
    covers: { annexItems: ['1321.coOwners'] } },
  { key: 'rent.coOwners', area: 'rent', label: 'השותפים בנכס וחלקם', kind: 'detail', per: 'property', who: 'client', purposes: ['annual'], after: 'rent.coOwned',
    question: 'מי השותפים ב{entity}, ומה החלק של כל אחד?', why: 'חלק הבעלות קובע איזה חלק מההכנסה מדווח אצלך', input: 'text',
    covers: { annexItems: ['1321.coOwners'] }, officeNext: 'לאמת מול נסח הטאבו; השותפים וחלקם — לנספח 1321' },
  { key: 'rent.keyMoney', area: 'rent', label: 'דמי מפתח', kind: 'screener', per: 'couple', who: 'client', purposes: ['annual'], after: 'rent.properties',
    question: 'האם קיבלתם השנה דמי מפתח על נכס?', why: 'דמי מפתח מדווחים בנפרד משכר הדירה, עם מועדי הקבלה', input: 'yesno',
    covers: { annexItems: ['1321.keyMoney', '1321.keyMoneyDates'] } },
  { key: 'rent.keyMoneyDocs', area: 'rent', label: 'חוזה דמי המפתח ואישור המקדמה', kind: 'document', per: 'couple', who: 'client', purposes: ['annual'], after: 'rent.keyMoney',
    question: 'חוזה דמי המפתח, וקבלה על מקדמה ששולמה אם שולמה', why: 'מהחוזה נלקחים הסכום, מועד הקבלה וההוצאות', input: 'file', docKind: 'keyMoneyContract', knownBasis: DOC_KNOWN,
    covers: { annexItems: ['1321.keyMoney', '1321.keyMoneyDates'] } },
  { key: 'rent.ownRent', area: 'rent', label: 'שכר דירה שהמשכיר משלם על מגוריו', kind: 'screener', per: 'couple', who: 'client', purposes: ['annual'], after: 'rent.properties',
    question: 'האם אתם עצמכם גרים בשכירות, או משלמים על מגורים בבית אבות?', why: 'במסלול 10% שכר הדירה שאתם משלמים על מגוריכם מופחת מההכנסה', input: 'yesno',
    covers: { annexItems: ['1321.rent10OwnRent'] }, officeNext: 'רלוונטי רק במסלול 10% (rent.track); עד 90,000 ש״ח' },
  { key: 'rent.ownRentDocs', area: 'rent', label: 'חוזה השכירות של מגורי הלקוח / קבלות בית אבות', kind: 'document', per: 'couple', who: 'client', purposes: ['annual'], after: 'rent.ownRent',
    question: 'חוזה השכירות של הדירה שאתם גרים בה, או הקבלות מבית האבות', why: 'הסכום המופחת נלקח מהחוזה או מהקבלות', input: 'file', docKind: 'ownRentDocs', knownBasis: DOC_KNOWN,
    covers: { annexItems: ['1321.rent10OwnRent'] } },
  { key: 'rent.otherProperty', area: 'rent', label: 'הכנסה מרכוש אחר (לא דירה)', kind: 'screener', per: 'couple', who: 'client', purposes: ['annual'],
    question: 'האם קיבלתם השנה הכנסה מהשכרת ציוד, רכב או קרקע, או תמלוגים על יצירה, פטנט או זכות?', why: 'הכנסה מרכוש שאינו דירה מדווחת בנפרד', input: 'yesno',
    covers: { annexItems: ['1321.otherProperty'] }, officeNext: 'לסווג: רכוש (1321) או יגיעה אישית (תמלוגים של היוצר עצמו); לא רווח הון' },
  { key: 'rent.otherPropertyDocs', area: 'rent', label: 'מסמכי ההכנסה מרכוש אחר', kind: 'document', per: 'couple', who: 'client', purposes: ['annual'], after: 'rent.otherProperty',
    question: 'מסמכים על ההכנסה וההוצאות: חוזה, חשבוניות או דוח תמלוגים', why: 'מהם נלקחים ההכנסה וההוצאות', input: 'file', docKind: 'otherPropertyDocs', knownBasis: DOC_KNOWN,
    covers: { annexItems: ['1321.otherProperty'] } },

  // ── שוק ההון ──
  { key: 'capital.accounts', area: 'capital', label: 'חשבונות השקעות ופיקדונות', kind: 'confirm', per: 'couple', who: 'client', purposes: BOTH,
    question: 'חשבונות ההשקעות', why: 'מכל בנק ובית השקעות מגיע אישור שנתי על רווחים ומס שנוכה', input: 'confirm', cardKeys: ['investmentAccounts', 'bankAccounts'], covers: { parts: ['ה', 'ח'] } },
  { key: 'capital.form867', area: 'capital', label: 'טופס 867', kind: 'document', per: 'account', who: 'client', purposes: ['annual'], after: 'capital.accounts',
    question: 'האישור השנתי על הרווחים והמס מ{entity}', why: 'נקרא «טופס 867» — הבנק או בית ההשקעות שולחים אותו בתחילת השנה. ממנו נלקחים הרווחים, הריבית והמס שנוכה', input: 'file', docKind: 'form867', knownBasis: DOC_KNOWN, covers: { parts: ['ה', 'ח', 'טו'], annexItems: ['1322.accounts867'] } },
  { key: 'capital.amounts', area: 'capital', label: 'סכומים מ-867: רווח לפי שיעור, מחזור מכירות, דיבידנד וריבית לפי שיעור, מס שנוכה', kind: 'amount', per: 'account', who: 'office', purposes: BOTH, after: 'capital.accounts', knownBasis: AMOUNT_KNOWN,
    covers: { parts: ['ה', 'ח', 'טו'], annexItems: ['1322.gainByRate', '1322.salesTurnover', '1322.interestDividendIncome'] },
    officeNext: 'מטופס 867 של כל חשבון: הרווח והריבית/דיבידנד לפי שיעור, ומחזור המכירות (קוד 56 ⇐ שדה 256)' },
  // 12.10.2026 · 1322 — שיוך הטופס לבן הזוג (867 אינו אומר של מי החשבון)
  { key: 'capital.owner', area: 'capital', label: 'של מי החשבון (לזוג)', kind: 'detail', per: 'account', who: 'client', purposes: ['annual'], after: 'capital.accounts', onlyMarried: true,
    question: 'של מי {entity}?', why: 'בדוח כל חשבון משויך לאחד מבני הזוג', input: 'choice',
    options: [{ value: 'client', label: 'שלי' }, { value: 'spouse', label: 'של בן/בת הזוג' }, { value: 'joint', label: 'משותף לשנינו' }],
    covers: { annexItems: ['1322.formSplit'] }, officeNext: 'ניכוי במקור — מה-867; חשבון משנה שלפני נישואין או מירושה — לברר עם הלקוח' },
  { key: 'capital.relatedParty', area: 'capital', label: 'ני״ע מצד קשור או יחידות בקרן ריט', kind: 'screener', per: 'person', who: 'client', purposes: ['annual'], after: 'capital.accounts', rare: true,
    question: 'האם {name} קנה/תה או מכר/ה השנה ניירות ערך מקרוב משפחה או מחברה קשורה, או מחזיק/ה יחידות בקרן שמשקיעה בנדל״ן להשכרה (קרן ריט)?', why: 'עסקה עם צד קשור ורווח מקרן נדל״ן מדווחים אחרת בנספח רווח ההון', input: 'yesno',
    covers: { annexItems: ['1322.relatedParty'] }, officeNext: 'מכירה לקרוב — לא ב-1322 (1399י/1399ח); ריט — בשורה נפרדת ב-1322' },
  { key: 'capital.totals', area: 'capital', label: 'רווחי הון, דיבידנד וריבית — סכום כולל בלי פירוט לחשבון (מהכרטיס)', kind: 'amount', per: 'couple', who: 'office', purposes: BOTH, knownBasis: AMOUNT_KNOWN, rare: true },
  { key: 'capital.estimate', area: 'capital', label: 'אומדן רווחים בשנה', kind: 'amount', per: 'account', who: 'client', purposes: ['estimate'], after: 'capital.accounts',
    question: 'בערך כמה הרווחת או הפסדת השנה ב{entity}?', why: 'אומדן מספיק להערכה; האישור השנתי יגיע בהמשך', input: 'amount', knownBasis: { estimate: ['forecast', 'actual_to_date', 'final'] } },

  // ── מכירת נכסים ──
  { key: 'sales.sold', area: 'sales', label: 'מכירה של נכס, מניות מחוץ לחשבון, קריפטו או חלק בעסק', kind: 'screener', per: 'person', who: 'client', purposes: BOTH,
    coupleQuestion: 'האם מישהו מכם מכר השנה דירה, מגרש, מטבע דיגיטלי, מניות שלא דרך בנק, או חלק בעסק?',
    question: 'האם {name} מכר/ה השנה דירה, מגרש, מטבע דיגיטלי, מניות שלא דרך בנק, או חלק בעסק?', why: 'רווח ממכירה ממוסה בנפרד, ולפעמים יש פטור', input: 'yesno', covers: { parts: ['ח', 'טו'] } },
  { key: 'sales.transaction', area: 'sales', label: 'עסקה: נכס, תאריך, תמורה', kind: 'detail', per: 'transaction', who: 'client', purposes: BOTH, after: 'sales.sold',
    question: 'מה נמכר, מתי ובכמה?', why: 'הפרטים הבסיסיים של העסקה', input: 'text', covers: { annexItems: ['1399י.assetDetails', '1399י.saleProceeds', '1399י.originalCost'] },
    officeNext: 'מחוזה המכר ומסמכי הרכישה: הנכס, תאריכי רכישה ומכירה, תמורה ועלות' },
  { key: 'sales.circumstances', area: 'sales', label: 'נסיבות המכירה: של בן/בת הזוג, ירושה, מתנה, 102 או הפקעה', kind: 'screener', per: 'transaction', who: 'client', purposes: BOTH, after: 'sales.sold',
    question: 'האם מה שנמכר היה של בן/בת הזוג, התקבל בירושה או במתנה, הוקצה לך כעובד (מניות או אופציות), או נלקח בהפקעה?', why: 'כל אחד מאלה משנה את טופס הדיווח ואת חישוב הרווח', input: 'yesno',
    covers: { annexItems: ['1399י.ownershipFlags', '1399י.sellerStatus'] }, officeNext: 'לסמן בטופס 1399י; בעל מניות מהותי ותושבות — המשרד בודק לכל מכירה' },
  // ── 12.10.2026 · שדות נספח 1399י שלא היה להם מקור משלהם ──
  { key: 'sales.buyer', area: 'sales', label: 'הקונה וקשר אליו', kind: 'detail', per: 'transaction', who: 'client', purposes: ['annual'], after: 'sales.sold',
    question: 'למי מכרת? האם הקונה קרוב משפחה, שותף או חברה שקשורה אליך?', why: 'מכירה לקרוב או לצד קשור מדווחת אחרת', input: 'text',
    covers: { annexItems: ['1399י.buyer'] }, officeNext: 'שם הקונה — מחוזה המכר; קרבה או צד קשור — לשאול את הלקוח (משנה את הדיווח)' },
  { key: 'sales.expenseDocs', area: 'sales', label: 'חשבוניות השבחה והוצאות מכירה', kind: 'document', per: 'transaction', who: 'client', purposes: ['annual'], after: 'sales.sold',
    question: 'חשבוניות על שיפוצים או השבחה במה שנמכר, והוצאות המכירה (תיווך, עורך דין, שמאי)', why: 'הוצאות כאלה מפחיתות את הרווח — רק עם חשבוניות', input: 'file', docKind: 'saleExpenseDocs', knownBasis: DOC_KNOWN,
    covers: { annexItems: ['1399י.improvements', '1399י.holdingAndSaleExpenses'] }, officeNext: 'השבחה — לכל אחת תאריך גמר וסכום; הוצאות החזקה — רק מה שלא הותר ולא הופחת' },
  { key: 'sales.specialDeal', area: 'sales', label: 'עסקה מיוחדת: הלוואה, החלפת מניות, נכס חלופי, מטבע דיגיטלי או מוניטין', kind: 'screener', per: 'transaction', who: 'client', purposes: ['annual'], after: 'sales.sold',
    question: 'האם המכירה כללה אחד מאלה: הלוואה לקונה בלי ריבית, החלפת מניות במניות אחרות, קנייה של נכס חלופי במקום הנמכר, או מכירה של מטבע דיגיטלי או מוניטין?', why: 'כל אחד מאלה משנה את חישוב הרווח ואת הסימון בדוח', input: 'yesno',
    covers: { annexItems: ['1399י.interestFreeLoan', '1399י.shareSwap', '1399י.rollover96', '1399י.specialTransactions'] } },
  { key: 'sales.specialDocs', area: 'sales', label: 'מסמכי העסקה המיוחדת', kind: 'document', per: 'transaction', who: 'client', purposes: ['annual'], after: 'sales.specialDeal',
    question: 'המסמכים של העסקה: הסכם ההלוואה, מסמכי החלפת המניות, חוזה הנכס החלופי או דוח העסקאות בזירה', why: 'מהם נלקחים הסכומים והתאריכים לכל סימון', input: 'file', docKind: 'specialDealDocs', knownBasis: DOC_KNOWN,
    covers: { annexItems: ['1399י.interestFreeLoan', '1399י.shareSwap', '1399י.rollover96', '1399י.specialTransactions'] } },
  { key: 'sales.officeChecks', area: 'sales', label: 'פחת שנצבר ורווחים ראויים לחלוקה', kind: 'detail', per: 'transaction', who: 'office', purposes: ['annual'], after: 'sales.sold',
    covers: { annexItems: ['1399י.accumulatedDepreciation', '1399י.retainedEarnings'] },
    officeNext: 'פחת — מטבלאות הפחת (1342) של השנים הקודמות; רווחים ראויים לחלוקה — מהדוחות הכספיים של החברה (מניות לא סחירות): לבקש מהלקוח כשחסר. לא רלוונטי — לסמן' },
  { key: 'sales.docs', area: 'sales', label: 'חוזה מכר ומסמכי רכישה', kind: 'document', per: 'transaction', who: 'client', purposes: BOTH, after: 'sales.sold',
    question: 'חוזה המכירה ומסמכי הקנייה המקורית (במטבע דיגיטלי — דוח עסקאות מכל זירה וכתובות הארנקים)', why: 'הרווח מחושב מההפרש בין המכירה לקנייה', input: 'file', docKind: 'saleContract', knownBasis: DOC_KNOWN, covers: { annexItems: ['1399י.assetDetails', '1399י.saleProceeds', '1399י.originalCost'] } },

  // ── חו״ל ──
  { key: 'foreign.income', area: 'foreign', label: 'הכנסות או חשבונות בחו״ל', kind: 'screener', per: 'person', who: 'client', purposes: BOTH,
    coupleQuestion: 'האם למישהו מכם היו השנה הכנסות מחוץ לישראל, או חשבון בנק או השקעות בחו״ל?',
    question: 'האם ל{name} היו השנה הכנסות מחוץ לישראל, או חשבון בנק או השקעות בחו״ל?', why: 'תושב ישראל מדווח על הכנסות מכל העולם, ומס ששולם בחו״ל מקוזז', input: 'yesno', cardKeys: ['hasForeignIncome', 'foreignAccounts'], covers: { parts: ['ט'] } },
  { key: 'foreign.totals', area: 'foreign', label: 'הכנסות ומס זר — סכום כולל (מהכרטיס)', kind: 'amount', per: 'couple', who: 'office', purposes: BOTH, knownBasis: AMOUNT_KNOWN, rare: true },
  { key: 'foreign.sourceDetails', area: 'foreign', label: 'מקור חדש בחו״ל: מדינה, סוג וגוף', kind: 'detail', per: 'foreign_source', who: 'client', purposes: BOTH, after: 'foreign.income', onlyNew: true,
    question: 'באיזו מדינה, מה בדיוק (חשבון בנק, השקעות, נכס או הכנסה מעבודה) ואצל איזה גוף?', why: 'כך נוסיף את המקור לתיק ונדע איזה דוח לבקש', input: 'text',
    officeNext: '«הוסף לתיק» — המקור נכנס לכרטיס (חשבונות בחו״ל) עם אותו מזהה' },
  { key: 'foreign.statements', area: 'foreign', label: 'דוחות מהגורם בחו״ל', kind: 'document', per: 'foreign_source', who: 'client', purposes: BOTH, after: 'foreign.income',
    question: 'הדוח השנתי מ{entity}', why: 'ממנו נלקחים ההכנסה והמס ששולם בחו״ל', input: 'file', docKind: 'foreignStatement', knownBasis: DOC_KNOWN, covers: { annexItems: ['1324.otherRegular', '1324.foreignTaxPaid'] },
    officeNext: 'דיבידנד ברוטו וריבית לפי מדינה — ל-1324 ול-1301; סכום Unrealized או «צבירת דיבידנד» אינם הכנסה' },
  // ‼ 12.10.2026 · מכירת ני״ע דרך ברוקר או בנק בחו״ל: 1325 דורש שורה לכל מכירה (תאריך קנייה ומכירה, כמות, תמורה ועלות).
  //   סיכום רווח בלבד אינו מספיק, ורווח בדולרים אינו רווח בשקלים — מבקשים דוח ברמת המנה.
  { key: 'foreign.securitiesSold', area: 'foreign', label: 'מכירת ניירות ערך דרך ברוקר או בנק בחו״ל', kind: 'screener', per: 'person', who: 'client', purposes: BOTH, after: 'foreign.income',
    question: 'האם {name} מכר/ה השנה ניירות ערך (מניות, תעודות סל, אג״ח או אופציות) דרך ברוקר או בנק בחו״ל — גם אם בהפסד?',
    coupleQuestion: 'האם מישהו מכם מכר השנה ניירות ערך (מניות, תעודות סל, אג״ח או אופציות) דרך ברוקר או בנק בחו״ל — גם אם בהפסד?',
    why: 'מכירה בחו״ל מדווחת שורה לכל מכירה, גם כשיצא הפסד — בארץ לא נוכה עליה מס', input: 'yesno', covers: { parts: ['ח'] },
    officeNext: '«כן» — דוח עסקאות מפורט מכל ברוקר; «לא» — לוודא מול הדוח השנתי שאין מכירות' },
  { key: 'foreign.tradeReport', area: 'foreign', label: 'דוח עסקאות מפורט מהברוקר בחו״ל (לכל מכירה)', kind: 'document', per: 'foreign_source', who: 'client', purposes: ['annual'], after: 'foreign.securitiesSold',
    question: 'דוח עסקאות מפורט מ{entity}: לכל מכירה — תאריך הקנייה, תאריך המכירה, כמות, תמורה ועלות',
    why: 'הדוח השנתי מראה רק סיכום; לדוח צריך כל מכירה בנפרד. ב-Interactive Brokers: Flex Query ברמת «Closed Lots» לשנה, כקובץ CSV',
    input: 'file', docKind: 'foreignTradeReport', knownBasis: DOC_KNOWN, covers: { annexItems: ['1324.otherRegular'] },
    officeNext: 'שורה לכל מנה ב-1325 (המרה לשקלים לפי ימי הקנייה והמכירה), ומשם ל-1322 כ«נכס בחו״ל»; תמורת המכירות לקוד 256. לבדוק שהסיכום תואם לרווח הממומש בדוח הברוקר. אם יש רק סיכום — לבקש שוב, לא להזין נטו' },
  { key: 'foreign.taxCert', area: 'foreign', label: 'אישור על מס שנוכה בחו״ל', kind: 'document', per: 'foreign_source', who: 'client', purposes: ['annual'], after: 'foreign.income',
    question: 'אישור על המס שנוכה בחו״ל מ{entity}',
    why: 'למשל טופס 1042-S מ-Interactive Brokers, או אישור שנתי מהבנק הזר. זיכוי על מס ששולם בחו״ל ניתן רק לפי אישור, לכל מדינה בנפרד', input: 'file', docKind: 'foreignTaxCert', knownBasis: DOC_KNOWN, covers: { annexItems: ['1324.foreignTaxPaid'] },
    officeNext: 'מס זר לפי מדינה ב-1324; לבדוק שהמס סופי (לא קנס, לא ריבית) ושלא הוחזר' },
  { key: 'foreign.amounts', area: 'foreign', label: 'סכומים מהדוחות בחו״ל: דיבידנד ברוטו, ריבית, מס זר, תמורה ועלות', kind: 'amount', per: 'foreign_source', who: 'office', purposes: ['annual'], after: 'foreign.income',
    knownBasis: AMOUNT_KNOWN, covers: { parts: ['ח', 'ט'], annexItems: ['1324.otherRegular', '1324.foreignTaxPaid', '1324.specialRates'] },
    officeNext: 'סיכום לכל מקור ומדינה, ומיון לשיעור (15%–35%) לפי סוג ההכנסה ומעמד הנישום; פירוט המכירות עצמו — ב-1325, לא כאן' },
  // ── 12.10.2026 · שדות נספח 1324 שלא היה להם מקור משלהם ──
  { key: 'foreign.work', area: 'foreign', label: 'עבודה, עסק או קצבה בחו״ל', kind: 'screener', per: 'person', who: 'client', purposes: ['annual'], after: 'foreign.income',
    question: 'האם {name} עבד/ה בחו״ל, הפעיל/ה שם עסק, או קיבל/ה קצבה או פנסיה מחו״ל?', why: 'הכנסה מעבודה ומקצבה בחו״ל מדווחת בנפרד מהשקעות', input: 'yesno',
    covers: { annexItems: ['1324.personalExertion', '1324.pension9c'] } },
  { key: 'foreign.workDocs', area: 'foreign', label: 'אישורי שכר, דוח העסק או אישור הקצבה מחו״ל', kind: 'document', per: 'person', who: 'client', purposes: ['annual'], after: 'foreign.work',
    question: 'אישורי השכר, דוח הרווח וההפסד של העסק או אישור הקצבה מחו״ל', why: 'מהם נלקחים ההכנסה, המדינה והמס ששולם שם', input: 'file', docKind: 'foreignWorkDocs', knownBasis: DOC_KNOWN,
    covers: { annexItems: ['1324.personalExertion', '1324.pension9c'] }, officeNext: 'קצבה — לבדוק את סעיף 9ג ואת האמנה; עבודה ועסק — יגיעה אישית ב-1324' },
  { key: 'foreign.rentalProperty', area: 'foreign', label: 'נכס מושכר בחו״ל', kind: 'screener', per: 'person', who: 'client', purposes: ['annual'], after: 'foreign.income',
    question: 'האם יש ל{name} נכס בחו״ל שמושכר?', why: 'לשכירות מחו״ל יש מסלולי מיסוי משלה', input: 'yesno',
    covers: { annexItems: ['1324.foreignRent15'] } },
  { key: 'foreign.leaseDocs', area: 'foreign', label: 'חוזה השכירות ודוח ההכנסות של הנכס בחו״ל', kind: 'document', per: 'person', who: 'client', purposes: ['annual'], after: 'foreign.rentalProperty',
    question: 'חוזה השכירות של הנכס בחו״ל, ופירוט ההכנסות וההוצאות שלו', why: 'מהם נלקחים שכר הדירה, ההוצאות והמס ששולם שם', input: 'file', docKind: 'foreignLease', knownBasis: DOC_KNOWN,
    covers: { annexItems: ['1324.foreignRent15'] }, officeNext: 'מסלול 15% (בלי זיכוי) או רגיל עם זיכוי — הכרעת המשרד' },
  { key: 'foreign.company', area: 'foreign', label: 'אחזקה בחברה זרה (10% ומעלה)', kind: 'screener', per: 'person', who: 'client', purposes: ['annual'], after: 'foreign.income',
    question: 'האם {name} מחזיק/ה 10% או יותר בחברה שרשומה בחו״ל?', why: 'אחזקה כזו יכולה לחייב דיווח על רווחי החברה גם בלי שחולק דיבידנד', input: 'yesno',
    covers: { annexItems: ['1324.cfcFacts', '1324.fpcFacts'] } },
  { key: 'foreign.companyDocs', area: 'foreign', label: 'דוחות כספיים של החברה הזרה ואישור דיבידנד', kind: 'document', per: 'person', who: 'client', purposes: ['annual'], after: 'foreign.company',
    question: 'הדוחות הכספיים של החברה בחו״ל, ואישור על דיבידנד שחולק', why: 'מהם בודקים אם החברה נשלטת זרה או חברת משלח יד', input: 'file', docKind: 'foreignCompanyStatements', knownBasis: DOC_KNOWN,
    covers: { annexItems: ['1324.cfcFacts', '1324.fpcFacts'] }, officeNext: 'לבדוק תנאי חנ״ז (75ב) וחמי״ז (75ב1); הדיבידנד הרעיוני — בהכנת הדוח' },
  { key: 'foreign.owner', area: 'foreign', label: 'של מי המקור בחו״ל (לזוג)', kind: 'detail', per: 'foreign_source', who: 'client', purposes: ['annual'], after: 'foreign.income', onlyMarried: true,
    question: 'של מי {entity}?', why: 'בנספח ההכנסות מחו״ל כל הכנסה משויכת לאחד מבני הזוג', input: 'choice',
    options: [{ value: 'client', label: 'שלי' }, { value: 'spouse', label: 'של בן/בת הזוג' }, { value: 'joint', label: 'משותף לשנינו' }],
    covers: { annexItems: ['1324.rowAttribution'] }, officeNext: 'לשייך את השורות ב-1324 לבן הזוג הרשום / לבן הזוג; משותף — לפי חלקים' },
  { key: 'foreign.taxRefund', area: 'foreign', label: 'החזר מס מרשות מס זרה', kind: 'screener', per: 'person', who: 'client', purposes: ['annual'], after: 'foreign.income', covers: { annexItems: ['1324.refundDeclaration'] },
    question: 'האם {name} קיבל/ה השנה החזר מס מרשות מס בחו״ל (גם על שנים קודמות)?', why: 'החזר כזה מקטין את הזיכוי שניתן בעבר על המס הזר', input: 'yesno',
    officeNext: '«כן» — לתקן את הזיכוי בשנה שבה ניתן; החזר הוא לא הכנסה חדשה' },

  // ── חיסכון וביטוח ──
  { key: 'savings.selfDeposits', area: 'savings', label: 'הפקדות עצמאיות לפנסיה ולקרן השתלמות', kind: 'screener', per: 'person', who: 'client', purposes: BOTH,
    coupleQuestion: 'האם מישהו מכם הפקיד השנה בעצמו לפנסיה או לקרן השתלמות (לא דרך מעסיק)?',
    question: 'האם {name} הפקיד/ה השנה בעצמו/ה לפנסיה או לקרן השתלמות (לא דרך מעסיק)?', why: 'הפקדה עצמאית מזכה בהטבת מס', input: 'yesno', cardKeys: ['pensionFunds', 'selfEmployedPensionAmount', 'krenHashtalmutSE'], covers: { parts: ['יב', 'יד'] }, calcBlockedBy: 'pen.age50Cap' },
  { key: 'savings.selfAmounts', area: 'savings', label: 'הפקדה עצמאית בשנה: פנסיה, קרן השתלמות', kind: 'amount', per: 'person', who: 'office', purposes: BOTH, after: 'savings.selfDeposits', knownBasis: AMOUNT_KNOWN, covers: { parts: ['יב', 'יד'] }, calcBlockedBy: 'pen.age50Cap' },
  { key: 'savings.fundDetails', area: 'savings', label: 'קופה חדשה: שם החברה וסוג הקופה', kind: 'detail', per: 'fund', who: 'client', purposes: BOTH, after: 'savings.selfDeposits', onlyNew: true,
    question: 'לאיזו קופה הופקד (שם החברה וסוג הקופה — פנסיה, קרן השתלמות או קופת גמל)?', why: 'מכל קופה נבקש אישור שנתי משלה', input: 'text',
    officeNext: '«הוסף לתיק» — הקופה נכנסת לכרטיס עם אותו מזהה' },
  { key: 'savings.fundCerts', area: 'savings', label: 'אישור שנתי מהקופה', kind: 'document', per: 'fund', who: 'client', purposes: ['annual'], after: 'savings.selfDeposits',
    question: 'האישור השנתי למס מ{entity}', why: 'באישור מופיע כמה הופקד בשנה', input: 'file', docKind: 'fundAnnualCert', knownBasis: DOC_KNOWN, covers: { parts: ['יב', 'יד'] } },
  { key: 'savings.depositsEstimate', area: 'savings', label: 'הפקדות עד עכשיו ותוכנית לשאר השנה', kind: 'amount', per: 'person', who: 'client', purposes: ['estimate'], after: 'savings.selfDeposits',
    question: 'כמה {name} הפקיד/ה עד עכשיו, וכמה מתוכנן עד סוף השנה?', why: 'כך יודעים כמה עוד כדאי להפקיד עד סוף השנה', input: 'text', knownBasis: { estimate: ['actual_to_date', 'forecast'] } },
  { key: 'savings.insuranceAmounts', area: 'savings', label: 'סכומי ביטוח חיים ואובדן כושר עבודה (שכיר / עצמאי)', kind: 'amount', per: 'person', who: 'office', purposes: BOTH, after: 'savings.insurance', knownBasis: AMOUNT_KNOWN,
    covers: { parts: ['יב', 'יד'], annexItems: ['134.employeeDisability', '134.selfEmployedDisability'] },
    officeNext: 'מהאישור השנתי: להפריד הפקדה כשכיר מהפקדה כעצמאי לאובדן כושר עבודה' },
  { key: 'savings.insuranceCert', area: 'savings', label: 'אישור שנתי מחברת הביטוח', kind: 'document', per: 'person', who: 'client', purposes: ['annual'], after: 'savings.insurance',
    question: 'האישור השנתי מחברת הביטוח על התשלומים לביטוח החיים ולאובדן כושר העבודה', why: 'הסכומים לזיכוי ולניכוי נלקחים מהאישור', input: 'file', docKind: 'insuranceCert', knownBasis: DOC_KNOWN,
    covers: { annexItems: ['134.employeeDisability', '134.selfEmployedDisability'] } },
  { key: 'savings.insurance', area: 'savings', label: 'ביטוח חיים ואובדן כושר עבודה פרטי', kind: 'screener', per: 'person', who: 'client', purposes: BOTH,
    coupleQuestion: 'האם למישהו מכם יש ביטוח חיים או ביטוח אובדן כושר עבודה שמשולם באופן פרטי (לא דרך המשכורת)?',
    question: 'האם ל{name} יש ביטוח חיים או ביטוח אובדן כושר עבודה שמשולם באופן פרטי (לא דרך המשכורת)?', why: 'על ביטוחים כאלה יש זיכוי או ניכוי ממס', input: 'yesno', cardKeys: ['hasLifeInsurance', 'hasDisabilityInsurance'], covers: { parts: ['יב', 'יד'] } },

  // ── תרומות ──
  { key: 'donations.given', area: 'donations', label: 'תרומות למוסדות מוכרים', kind: 'screener', per: 'person', who: 'client', purposes: BOTH,
    coupleQuestion: 'האם מישהו מכם תרם השנה למוסדות (עמותות, בתי ספר, בתי חולים)?',
    question: 'האם {name} תרם/ה השנה למוסדות (עמותות, בתי ספר, בתי חולים)?', why: 'על תרומה למוסד מוכר מגיע זיכוי של 35%', input: 'yesno', cardKeys: ['donationsAnnual'], covers: { parts: ['יד'] } },
  { key: 'donations.amount', area: 'donations', label: 'סכום התרומות בשנה', kind: 'amount', per: 'person', who: 'client', purposes: BOTH, after: 'donations.given', question: 'בערך כמה {name} תרם/ה השנה?', why: 'הסכום קובע את הזיכוי', input: 'amount', knownBasis: AMOUNT_KNOWN, covers: { parts: ['יד'] },
    officeNext: 'סכום הקבלות ממוסדות מוכרים (סעיף 46)' },
  { key: 'donations.receipts', area: 'donations', label: 'קבלות על תרומות', kind: 'document', per: 'person', who: 'client', purposes: ['annual'], after: 'donations.given',
    question: 'הקבלות על התרומות', why: 'הזיכוי ניתן רק לפי קבלות', input: 'file', docKind: 'donationReceipts', knownBasis: DOC_KNOWN, covers: { parts: ['יד'] } },

  // ── חברות בשליטה — המשרד ──
  // ‼ 30.10.2026 · הלקוח יודע אם יש לו חברה — ריבוע בשאלון («חברה שלי»), לא משימה של המשרד
  { key: 'companies.controlled', area: 'companies', label: 'חברה בשליטה: דיבידנד, משיכות, חברה משפחתית', kind: 'screener', per: 'person', who: 'client', purposes: BOTH,
    question: 'האם {name} בעל/ת מניות בחברה (10% ומעלה)?', why: 'דיבידנד, משכורת או משיכות מחברה בשליטה מדווחים בדוח', input: 'yesno',
    cardKeys: ['isSubstantialShareholder', 'isFamilyCompanyMember', 'isForeignControllingShareholder'], covers: { parts: ['ד', 'ה', 'יא'] } },

  // ── תשלומים — המשרד ──
  { key: 'payments.advances', area: 'payments', label: 'מקדמות ששולמו', kind: 'amount', per: 'person', who: 'office', purposes: BOTH,
    covers: { parts: ['טו'] }, calcBlockedBy: 'it.pastMonths' },
  { key: 'payments.withholding', area: 'payments', label: 'ניכויים במקור שלא מהמשכורת', kind: 'amount', per: 'person', who: 'office', purposes: BOTH, covers: { parts: ['טו'] } },
  // 030/089: הסכום ששולם בשנה על הכנסה שאינה מעבודה (לא על שנים קודמות — 130/189). לא במסלול עסק זעיר.
  { key: 'payments.niPaid', area: 'payments', label: 'דמי ביטוח לאומי ששולמו כעצמאי בשנה', kind: 'amount', per: 'person', who: 'office', purposes: ['annual'], covers: { parts: ['יב'] } },

  // ── יתרות — המשרד ──
  { key: 'carryForward.balances', area: 'carryForward', label: 'הפסדים מועברים (גם מני״ע ומחו״ל), עודף זיכוי זר ודחיית נקודות משנה קודמת', kind: 'amount', per: 'person', who: 'office', purposes: BOTH,
    docKind: 'prevAssessment', covers: { parts: ['יא'], annexItems: ['1344.carriedIn', '1344.offsetAndCarryForward', '1322.carriedSecuritiesLossOffset', '1324.foreignLosses'] },
    officeNext: 'מהשומה או מהדוח של השנה הקודמת (1344 ו-1324 קודמים); ללקוח חדש — מהרו״ח הקודם' },

  // ── מצבים מיוחדים — המשרד מסמן; ללקוח רק מה שסומן ──
  { key: 'special.otherIncome', area: 'special', label: 'הכנסה אחרת (מהכרטיס)', kind: 'amount', per: 'person', who: 'office', purposes: BOTH, rare: true, knownBasis: AMOUNT_KNOWN, covers: { parts: ['ד', 'ה'] } },
  { key: 'special.gambling', area: 'special', label: 'זכיות והימורים', kind: 'amount', per: 'person', who: 'office', purposes: BOTH, rare: true, knownBasis: AMOUNT_KNOWN, covers: { parts: ['ה'] } },
  { key: 'special.reserveCombatDays', area: 'special', label: 'ימי מילואים קרביים בשנה הקודמת', kind: 'amount', per: 'person', who: 'office', purposes: BOTH, rare: true },
  { key: 'special.trust', area: 'special', label: 'נאמנות (יוצר או נהנה)', kind: 'screener', per: 'person', who: 'office', purposes: BOTH, rare: true, covers: { parts: ['א'] },
    question: 'האם {name} העביר/ה נכסים לנאמנות, או מקבל/ת כסף או נכסים מנאמנות?', why: 'לנאמנות יש חובת דיווח מיוחדת', input: 'yesno' },
  { key: 'special.kibbutz', area: 'special', label: 'חבר/ת קיבוץ', kind: 'screener', per: 'person', who: 'office', purposes: BOTH, rare: true, cardKeys: ['isKibbutzMember'], covers: { parts: ['א'] } },
  { key: 'special.reportablePosition', area: 'special', label: 'פעולה או עמדה חייבת בדיווח (131(א)(5), 131ה)', kind: 'screener', per: 'couple', who: 'office', purposes: ['annual'], rare: true, covers: { parts: ['א'] } },
  { key: 'special.partnership', area: 'special', label: 'שותפות (כולל שותפות נפט)', kind: 'screener', per: 'person', who: 'office', purposes: BOTH, rare: true, covers: { parts: ['א'] },
    question: 'האם {name} שותף/ה בשותפות עסקית?', why: 'הכנסה משותפות מדווחת לפי חלקך', input: 'yesno' },
  { key: 'special.nonResident', area: 'special', label: 'תושבות חוץ או ניתוק תושבות', kind: 'screener', per: 'person', who: 'office', purposes: BOTH, rare: true, covers: { parts: ['א'] } },
  { key: 'special.moneyAbroad', area: 'special', label: 'העברת כספים לחו״ל לאורך 12 חודשים', kind: 'screener', per: 'couple', who: 'office', purposes: ['annual'], rare: true, covers: { parts: ['א'] } },
  { key: 'special.financialInstitution', area: 'special', label: 'רווח של מוסד כספי', kind: 'screener', per: 'person', who: 'office', purposes: ['annual'], rare: true, covers: { parts: ['ו'] } },

  // ── פרטים להגשה — רק לדוח ──
  { key: 'filing.refundAccount', area: 'filing', label: 'חשבון בנק להחזר', kind: 'detail', per: 'couple', who: 'client', purposes: ['annual'],
    question: 'לאיזה חשבון בנק להעביר החזר מס, אם יהיה?', why: 'רשות המסים מעבירה החזר רק לחשבון על שם בן הזוג הרשום', input: 'text', covers: { parts: ['לשימוש המשדר'] } },
  // ‼ 30.10.2026 · לא משימה של המשרד בשאלון (purposes ריק): ההצהרות מסומנות לבד ופרטי השחרור/התואר/המיקוד נלקחים מהכרטיס
  //   (annualReturn/formFields.ts). מה שבאמת חסר (שם האב, קוד לדוקטורט, תאריך עלייה) — שורה משלו ב«אצלך» עם העורך המובנה
  //   (AnnualWorkspace › formRest). העובדות עצמן נשארות — הצהרה/תיקון של המשרד גוברים.
  { key: 'filing.declarations', area: 'filing', label: 'הצהרות ותיבות סימון בהגשה', kind: 'detail', per: 'couple', who: 'office', purposes: [], covers: { parts: ['א', 'ב', 'ז'] } },
  // ‼ פער כרטיס מתועד: פרטים שהטופס דורש והכרטיס עוד לא מחזיק (שם האב, תאריכי עלייה/חזרה)
  { key: 'filing.identity', area: 'filing', label: 'פרטים לטופס שהכרטיס לא מחזיק', kind: 'detail', per: 'couple', who: 'office', purposes: [], covers: { parts: ['ב', 'יג'] } },
];

// «מה השתנה מאז» — לדוח השנתי, לתחום שידוע רק עד חודש החתך של ההערכה. שאלה אחת לתחום,
// לא חזרה על כל השאלות.
const CHANGE_AREAS: AreaId[] = ['household', 'salary', 'business', 'niBenefits', 'rent', 'capital', 'sales', 'foreign', 'savings', 'donations'];
for (const id of CHANGE_AREAS) {
  const area = AREAS.find(x => x.id === id)!;
  ITEMS.push({
    key: `${id}.changesSince`, area: id, label: `שינויים מאז החתך — ${area.title}`, kind: 'screener', per: 'couple', who: 'client', purposes: ['annual'],
    question: `מאז {since}, השתנה משהו בנושא «${area.clientTitle}»?`, why: 'כבר יש לנו את המידע עד אז מההערכה; צריך רק את מה שקרה אחר כך', input: 'yesno',
  });
}

// ── 13.10.2026 · תחולה בזמן (docs/TAX-FILE-TEMPORAL-RELEVANCE-2026-10-13.md) ──
// ‼ נכס או חשבון בתיק שלא ידוע אם היו קיימים בתקופה — שאלה ממוקדת אחת לכל ישות, לא ניחוש. רשימת «זה מה
//   שידוע לנו» מציגה רק ישויות שבוודאות בתקופה; ישות שבוודאות מחוץ לתקופה (נקנתה אחרי, נמכרה לפני) — לא מוצגת.
//   הפריטים שתלויים בישות (שכר דירה, 867) מחכים לתשובה. נשאל רק כשהתחולה לא ידועה (picture.ts).
ITEMS.push(
  { key: 'period.property', area: 'rent', label: 'האם הנכס היה בבעלות בתקופה', kind: 'detail', per: 'property', who: 'client', purposes: ['estimate', 'annual'],
    question: 'האם {entity} היה בבעלותכם {period}?', why: 'בתיק לא רשום מתי הנכס נקנה (או נמכר) — ולא ננחש', input: 'record',
    officeNext: 'לעדכן בכרטיס תאריך רכישה או מכירה — כך לא נשאל שוב' },
  { key: 'period.account', area: 'capital', label: 'האם החשבון היה קיים בתקופה', kind: 'detail', per: 'account', who: 'client', purposes: ['estimate', 'annual'],
    question: 'האם החשבון ב{entity} היה קיים {period}?', why: 'בתיק לא רשום מתי החשבון נפתח (או נסגר) — ולא ננחש', input: 'record',
    officeNext: 'לעדכן בכרטיס מועד פתיחה או סגירה — כך לא נשאל שוב' },
  { key: 'wealth.period.property', area: 'wRealEstate', label: 'האם הנכס היה בבעלות ביום ההצהרה', kind: 'detail', per: 'property', who: 'client', purposes: ['wealth'],
    question: 'האם {entity} היה בבעלותכם {period}?', why: 'ההצהרה היא ליום מסוים; בתיק לא רשום מתי הנכס נקנה או נמכר', input: 'record',
    officeNext: 'לעדכן בכרטיס תאריך רכישה או מכירה' },
  { key: 'wealth.period.account', area: 'wSecurities', label: 'האם החשבון היה קיים ביום ההצהרה', kind: 'detail', per: 'account', who: 'client', purposes: ['wealth'],
    question: 'האם החשבון ב{entity} היה קיים {period}?', why: 'ההצהרה היא ליום מסוים; בתיק לא רשום מתי החשבון נפתח או נסגר', input: 'record',
    officeNext: 'לעדכן בכרטיס מועד פתיחה או סגירה' },
);

// ── 19.10.2026 · השאלון הפשוט לדוח השנתי (docs/proposals/2026-10-19-simple-annual-questionnaire.html) ──────────
// ‼ מסך רשת אחד «מה היה לכם ב-{שנה}?» (asks.ts › ANNUAL_GRID_KEY), ולכל אריח שסומן נפתחות מיד שאלה או שתיים ומסמך —
//   בלי סבב נוסף מול המשרד. פריטי הענף (אירוע משפחתי, פטירה) — בלי תכלית: הם לא נשאלים לבד, רק נפתחים מהרשת.
//   השרת (_tax_year_items, 262) מכיר את כל המפתחות.
// ‼ 20.10.2026 (גיא: «הניסוח ממש לא טוב… פנסיה זה הפקדה?») — שם עצם קצר + שורת דוגמה גלויה (ANNUAL_TILE_EXAMPLE),
//   בהשראת «תיאום מס — הקלות מס» בשע״ם. קבלה ≠ הפקדה; «שינוי במשפחה» — הדוגמה לפי המצב בכרטיס (asks.ts › buildMultiEntry).
// ‼ 21.10.2026 · סבב 2 (docs/proposals/2026-10-21-annual-questionnaire-fixes.html, גיא אישר): לכל אדם שני מסכים —
//   «מאיפה נכנס לך כסף» ו«מה יכול להוריד לך מס» — במקום «של מי». «שינוי במשפחה» ו«מעבר דירה» יצאו מהריבועים
//   (המשפחה והכתובת — בשורות «זה עדיין נכון?»); חזר «חיסכון או מניות בבנק»; חדשים: משיכה מקופה, עסק, עלייה, קרוב במוסד.
const ANNUAL_TILES: Record<string, string> = {
  'household.familyChange': 'שינוי במשפחה',
  'salary.worked': 'משכורת', 'salary.equity': 'מניות מהעבודה', 'pension.received': 'פנסיה או קצבה', 'niBenefits.received': 'ביטוח לאומי',
  'rent.newRental': 'שכר דירה', 'rent.otherProperty': 'השכרת ציוד, רכב או קרקע', 'capital.newAccount': 'חיסכון או מניות בבנק',
  'savings.withdrawal': 'משיכה מקופה', 'business.started': 'עסק או חשבוניות', 'income.other': 'הכנסה אחרת',
  'savings.selfDeposits': 'הפקדה לפנסיה לבד', 'savings.insurance': 'ביטוח חיים', 'donations.given': 'תרומות',
  'special.disability': 'אחוזי נכות', 'household.creditChanges': 'סיום לימודים או צבא',
  'household.aliyah': 'עלייה או חזרה לארץ', 'household.relativeCare': 'קרוב במוסד סיעודי',
  'household.alimonyPaid': 'מזונות לגרוש/ה', 'household.reserveDuty': 'מילואים כלוחם/ת',
  'foreign.income': 'כסף בחו״ל', 'sales.sold': 'מכירה', 'companies.controlled': 'חברה שלי',
};
/** שורת הדוגמה מתחת לריבוע. */
export const ANNUAL_TILE_EXAMPLE: Record<string, string> = {
  'salary.worked': 'גם מעבודה נוספת', 'salary.equity': 'RSU, אופציות — גם בלי מכירה',
  'pension.received': 'מקרן, מהמדינה או מביטוח', 'niBenefits.received': 'מילואים, לידה, אבטלה, זקנה',
  'rent.newRental': 'בארץ או בחו״ל', 'rent.otherProperty': 'לא דירה', 'capital.newAccount': 'ריבית, פיקדון, תיק השקעות',
  'savings.withdrawal': 'פיצויים, השתלמות, גמל', 'business.started': 'גם אם נפתח השנה', 'income.other': 'זכייה, תמלוגים, השכרת ציוד',
  'savings.selfDeposits': 'לא דרך התלוש', 'savings.insurance': 'או אובדן כושר — פרטי', 'donations.given': 'עם קבלה',
  'special.disability': 'או מחלה קשה', 'household.creditChanges': 'מ-{since}',
  'household.aliyah': 'מ-{aliyahSince}', 'household.relativeCare': 'הורה, בן או בת זוג',
  'household.alimonyPaid': 'לבן או בת זוג קודמים', 'household.reserveDuty': 'ב-{reserveYear}{reserveNext}',
  'foreign.income': 'עבודה, נכס או חשבון', 'sales.sold': 'דירה, מניות, קריפטו — גם בהפסד', 'companies.controlled': 'בעלות של 10% ומעלה',
};
/** «?» בריבוע — שורת הסבר אחת, רק בשאלון השנתי (ההסברים הארוכים ב-hints.ts משרתים גם את הערכת המס). */
export const ANNUAL_TILE_HELP: Record<string, string> = {
  'salary.worked': 'עבודה עם תלוש — גם חלקית או לחלק מהשנה.',
  'niBenefits.received': 'כל תשלום מביטוח לאומי. את האישור אנחנו מוציאים.',
  'pension.received': 'תשלום חודשי. סכום חד-פעמי — ב«משיכה מקופה».',
  'rent.newRental': 'כסף שמקבלים משוכר, על נכס שבבעלותך.',
  'capital.newAccount': 'גם בלי מכירה. עו״ש רגיל — לא.',
  'salary.equity': 'גם אם נמכרו — רק כאן, לא ב«מכירה».',
  'savings.withdrawal': 'כסף שיצא מקופה: פיצויים בעזיבה, משיכה מוקדמת, סגירת קופה.',
  'business.started': 'עוסק פטור או מורשה, או עבודה בחשבוניות. את הדוח אנחנו מפיקים.',
  'income.other': 'כל הכנסה שלא ברשימה — גם חד-פעמית.',
  'foreign.income': 'גם חשבון בלי פעילות.',
  'sales.sold': 'גם החלפה בין מטבעות קריפטו.',
  'companies.controlled': 'חברה בע״מ שיש לך בה לפחות 10% מהמניות — גם אם לא קיבלת ממנה כסף השנה.',
  'donations.given': 'לעמותה מוכרת. קבלה דיגיטלית מספיקה.',
  'savings.selfDeposits': 'כעצמאים, בהוראת קבע, או מעבר למה שהמעסיק מפקיד. גם קרן השתלמות.',
  'savings.insurance': 'למשל ביטוח חיים למשכנתה. ביטוח דירה — לא.',
  'household.creditChanges': 'תואר, לימודי מקצוע, או שחרור מצבא או משירות לאומי.',
  'special.disability': 'אחוזים מביטוח לאומי, ממשרד הביטחון או מפקיד השומה.',
  'household.aliyah': 'עולים ותושבים חוזרים מקבלים הקלות לכמה שנים.',
  'household.relativeCare': 'מי שמשלם על החזקה במוסד מקבל זיכוי.',
  'household.alimonyPaid': 'מי שנישא שוב ומשלם מזונות לגרוש/ה מקבל נקודת זיכוי. מזונות ילדים — לא.',
  'household.reserveDuty': 'מ-30 ימי מילואים כלוחם בשנה — נקודות זיכוי בשנה שאחריה.',
};
/** המסך השני של כל אדם: מה שיכול להוריד מס — השאר «מאיפה נכנס כסף». */
export const ANNUAL_TILE_LESS = new Set(['savings.selfDeposits', 'savings.insurance', 'donations.given', 'special.disability', 'household.creditChanges', 'household.aliyah', 'household.relativeCare', 'household.alimonyPaid', 'household.reserveDuty']);
/** ‼ סבב 2: לא ריבועים בשאלון השנתי — המשפחה בשורת «זה עדיין נכון?», השכרת ציוד ב«משהו אחר?». */
export const ANNUAL_TILE_OFF = new Set(['household.familyChange', 'rent.otherProperty']);
/**
 * ‼ 22.10.2026 · סבב 2.1 (גיא: «לא עומד בסטנדרט») — בדוח השנתי הלקוח לא נשאל פרטים שהמסמך כבר נותן או שהמשרד
 *   מברר רק במקרה חריג: מה בדיוק נמכר ולמי, שותפים בנכס, כמה שכר דירה, של מי החשבון (מופיע ב-867), שם הקופה (מופיע
 *   באישור), כמה תרמת (בקבלות), פרטי רכב ושותפים בעסק, פרטי מקור בחו״ל. הם עוברים לרשימת המשרד (picture › officeTodo).
 */
export const ANNUAL_OFFICE_DETAIL = new Set([
  'foreign.sourceDetails', 'foreign.owner', 'sales.transaction', 'sales.buyer', 'rent.coOwners', 'rent.income', 'capital.owner',
  'savings.fundDetails', 'donations.amount', 'business.vehicleDetails', 'business.partners',
]);
/**
 * ‼ 22.10.2026 · סבב 2.1 — שאלות כן/לא שנפתחות מאותו נושא (חו״ל, מכירה, נכס מושכר, עסק) — מסך אחד של סימון, לא מסך לכל שאלה.
 *   הכותרת לפי הנושא; לכל שאלה תווית קצרה. מה שלא סומן — «לא».
 */
export const CHECKLIST_TITLE: Record<string, string> = {
  'foreign.income': 'מה מאלה היה בחו״ל?', 'sales.sold': 'משהו מאלה נכון לגבי המכירה?',
  'rent.properties': 'משהו מאלה נכון לגבי הנכס המושכר?', 'rent.newRental': 'משהו מאלה נכון לגבי הנכס המושכר?',
  'business.active': 'מה מאלה היה ב{entity} ב-{year}?',
};
export const CHECKLIST_LABEL: Record<string, string> = {
  'foreign.securitiesSold': 'מכירת מניות דרך ברוקר', 'foreign.work': 'עבודה, עסק או קצבה', 'foreign.rentalProperty': 'נכס מושכר',
  'foreign.company': 'חברה (10% ומעלה)', 'foreign.taxRefund': 'החזר מס מרשות זרה',
  'sales.circumstances': 'ירושה, מתנה או נכס של {spouse}', 'sales.specialDeal': 'החלפה, נכס חלופי או הלוואה לקונה',
  'rent.coOwned': 'יש עוד בעלים בנכס', 'rent.expenses': 'היו הוצאות על הנכס', 'rent.keyMoney': 'דמי מפתח', 'rent.ownRent': 'אנחנו גרים בשכירות',
  'business.assetsChanged': 'קנייה או מכירה של ציוד או רכב', 'business.inventory': 'מלאי', 'business.employees': 'עובדים',
  'business.badDebts': 'חוב שלא ייגבה', 'business.vehicle': 'רכב בשימוש העסק', 'business.partnership': 'שותפים בעסק',
  'business.rentsPremises': 'שכירות של משרד או חנות',
};
const NONE: Purpose[] = [];
ITEMS.push(
  // ‼ 26.10.2026 · הערכת מס: «ביצוע בפועל» — המשרד מסמן שהמלצה בוצעה (ומתי). לא שאלה ללקוח ולא קלט לחישוב; ההבחנה הערכה ≠ המלצה ≠ ביצוע
  { key: 'estimate.applied', area: 'payments', label: 'המלצה מההערכה — בוצעה בפועל', kind: 'detail', per: 'couple', who: 'office', purposes: NONE },
  // ‼ 27.10.2026 · הערכת מס בארבעה שלבים (docs/proposals/2026-10-27-tax-estimate.html): בשאלון — «הכול בפייפרלס?»;
  //   הצפי נשאל רק אחרי המשיכה, עם המספרים של הלקוח (בקשה שהמשרד מוסיף — FORECAST_ITEM, forecastFlow.ts), לא בשאלון.
  { key: 'business.inPaperless', area: 'business', label: 'כל החשבוניות והקבלות של השנה — בפייפרלס', kind: 'detail', per: 'business', who: 'client', purposes: ['estimate'], after: 'business.active',
    question: 'כל החשבוניות והקבלות של השנה ב{entity} — כבר בפייפרלס?', why: 'מהן נמשוך את ההכנסות וההוצאות עד עכשיו. מה שחסר — אפשר להעלות עכשיו באפליקציה של פייפרלס', input: 'choice',
    options: [{ value: 'all', label: 'כן, הכול שם' }, { value: 'later', label: 'עוד לא — אעלה עכשיו לפייפרלס' }], knownBasis: { estimate: ['actual_to_date'] } },
  { key: 'business.forecastMonths', area: 'business', label: 'הצפי עד סוף השנה — לפי הקצב או לכל חודש', kind: 'amount', per: 'business', who: 'client', purposes: NONE, input: 'record',
    question: 'עד סוף השנה — זה נראה נכון?', why: 'זו הערכה שלך: לפי הקצב עד עכשיו, או מה שאתה יודע על החודשים הבאים' },
  { key: 'annual.whatHappened', area: 'special', label: 'מאיפה נכנס כסף בשנה (מסך הריבועים, לכל אדם)', kind: 'screener', per: 'couple', who: 'client', purposes: NONE, input: 'multi',
    question: 'מאיפה נכנס ל{name} כסף ב-{year}?', why: 'מה שתסמנו — נבקש עליו את המסמך המתאים. מה שלא תסמנו — לא נשאל.' },
  { key: 'annual.lessTax', area: 'special', label: 'מה יכול להוריד מס (מסך הריבועים השני, לכל אדם)', kind: 'screener', per: 'couple', who: 'client', purposes: NONE, input: 'multi',
    question: 'מה יכול להוריד ל{name} מס?', why: 'על כל אלה יש הקלה במס — רק עם אישור.' },
  // ── 21.10.2026 · סבב 2: ריבועים חדשים (בדיקת הכיסוי) ──
  { key: 'savings.withdrawal', area: 'savings', label: 'משיכת כסף מקופה בשנה (פיצויים, השתלמות, גמל)', kind: 'screener', per: 'person', who: 'client', purposes: ['annual'],
    question: 'האם {name} משך/ה השנה כסף מקופה — פיצויים, קרן השתלמות או קופת גמל?', why: 'משיכה מקופה יכולה להיות חייבת במס — לפי סוג הכסף ומתי הופקד', input: 'yesno', covers: { parts: ['ג', 'ו'] },
    officeNext: 'פיצויים — 161 (פטור, פריסה 8(ג)(3), רצף); השתלמות לפני 6 שנים / גמל שלא כדין — 35%; הוני מוכר — פטור' },
  { key: 'savings.withdrawalDocs', area: 'savings', label: 'אישור משיכה מקופה וטופס 161', kind: 'document', per: 'person', who: 'client', purposes: ['annual'], after: 'savings.withdrawal',
    question: 'אישור המשיכה מהקופה — ואם היו פיצויים, גם הטופס מהמעסיק', why: 'באישור רואים כמה נמשך, מאיזה כסף וכמה מס נוכה', input: 'file', docKind: 'severanceDocs', knownBasis: DOC_KNOWN },
  { key: 'business.started', area: 'business', label: 'עסק או עבודה בחשבוניות (כשאין עסק בתיק)', kind: 'screener', per: 'person', who: 'client', purposes: ['annual'], coveredBy: 'business.active', cardKeys: ['businesses'],
    question: 'האם {name} עבד/ה השנה כעצמאי/ת או עם חשבוניות?', why: 'הכנסה מעסק מדווחת בדוח — גם בשנה הראשונה', input: 'yesno', covers: { parts: ['ג'] },
    officeNext: 'לפתוח עסק בכרטיס (סוג עוסק, ניהול ספרים); 6111 / רווח והפסד; ביטוח לאומי עצמאי ומקדמות' },
  // ‼ 25.10.2026 גיא: «חשבוניות וקבלות — לא צריך, אני מפיק לו מהאפליקציה של פייפרלס» ⇒ המשרד, לא הלקוח
  { key: 'business.startedDocs', area: 'business', label: 'רווח והפסד מפייפרלס', kind: 'document', per: 'person', who: 'office', purposes: ['annual'], after: 'business.started',
    question: 'החשבוניות והקבלות של העסק ב-{year}', why: 'מהן המשרד בונה את דוח העסק', input: 'file', docKind: 'annualPnl', knownBasis: DOC_KNOWN },
  { key: 'household.aliyah', area: 'household', label: 'עלייה או חזרה לישראל (נקודות עולה, פטור תושב חוזר)', kind: 'screener', per: 'person', who: 'client', purposes: ['annual'],
    question: 'האם {name} עלה/תה לארץ או חזר/ה אליה אחרי שנים בחו״ל?', why: 'עולים ותושבים חוזרים מקבלים נקודות זיכוי ופטורים לכמה שנים', input: 'yesno', covers: { parts: ['יג'] },
    officeNext: 'עולה — נקודות לפי סעיף 35; תושב חוזר ותיק — פטור 14(א) על הכנסות מחו״ל לעשר שנים; תאריך העלייה מהתעודה' },
  // ‼ 290 · «כן» בריבוע ⇒ המעמד, חודש ושנה (סעיף 35 סופר חודשי ותק). באישור ⇒ עולה + שנה + חודש, או תושב חוזר + שנה, בכרטיס
  { key: 'household.aliyahDetails', area: 'household', label: 'עלייה או חזרה: מעמד, חודש ושנה', kind: 'detail', per: 'person', who: 'client', purposes: ['annual'], after: 'household.aliyah', input: 'record',
    question: 'מתי {name} עלה/תה או חזר/ה לארץ?', why: 'הנקודות לעולה ניתנות לפי החודשים מאז העלייה',
    officeNext: '«אשר ועדכן בתיק» — עולה: שנה וחודש; תושב חוזר: שנה. תושב חוזר ותיק — לפי האישור' },
  { key: 'household.aliyahDocs', area: 'household', label: 'תעודת עולה או אישור תושב חוזר', kind: 'document', per: 'person', who: 'client', purposes: ['annual'], after: 'household.aliyah',
    question: 'תעודת העולה או האישור על מעמד תושב חוזר', why: 'בה רשום התאריך שממנו נספרות השנים', input: 'file', docKind: 'specialStatusCert', knownBasis: DOC_KNOWN },
  // ‼ 290 · סעיף 39ב — נקודות ללוחמי מילואים מ-2026, לפי ימי המילואים כלוחם בשנה שלפני שנת המס. ריבוע ⇒ כמה ימים ⇒ האישור
  // ‼ 25.10.2026 · גם בשאלון 2025: ימי 2025 נותנים את הנקודות של 2026 ({reserveYear} — asks.ts › reserveYearOf)
  { key: 'household.reserveDuty', area: 'household', label: 'מילואים כלוחם/ת (סעיף 39ב)', kind: 'screener', per: 'person', who: 'client', purposes: ['annual'], fromTaxYear: 2025,
    question: 'האם {name} עשה/תה מילואים כלוחם/ת ב-{reserveYear}?', why: 'ימי מילואים כלוחם מזכים בנקודות זיכוי', input: 'yesno', covers: { parts: ['יג'] } },
  { key: 'household.reserveDays', area: 'household', label: 'ימי מילואים כלוחם/ת', kind: 'detail', per: 'person', who: 'client', purposes: ['annual'], after: 'household.reserveDuty', input: 'record', fromTaxYear: 2025,
    question: 'כמה ימי מילואים כלוחם/ת היו ל{name} ב-{reserveYear}?', why: 'מספר הימים קובע כמה נקודות מגיעות',
    officeNext: '«אשר ועדכן בתיק» — ימי המילואים נכתבים בכרטיס (לנקודות של השנה שאחריהם); לבדוק מול האישור. שכיר — טופס 101 אצל המעסיק; עצמאי — מקדמות' },
  { key: 'household.reserveDocs', area: 'household', label: 'אישור ימי מילואים מצה״ל', kind: 'document', per: 'person', who: 'client', purposes: ['annual'], after: 'household.reserveDuty', fromTaxYear: 2025,
    question: 'האישור מצה״ל על ימי המילואים ב-{reserveYear}', why: 'בו רשום כמה ימים שירתת כלוחם', input: 'file', docKind: 'creditCerts', knownBasis: DOC_KNOWN },
  { key: 'household.relativeCare', area: 'household', label: 'קרוב במוסד סיעודי (זיכוי סעיף 44)', kind: 'screener', per: 'person', who: 'client', purposes: ['annual'],
    question: 'האם {name} שילם/ה השנה על החזקת קרוב — הורה, בן או בת זוג, או ילד — במוסד סיעודי?', why: 'על החזקת קרוב במוסד יש זיכוי ממס', input: 'yesno', covers: { parts: ['יד'] },
    officeNext: 'סעיף 44: זיכוי 35% על ההוצאה שמעל 12.5% מההכנסה החייבת; לבדוק מי שילם בפועל' },
  { key: 'household.relativeCareDocs', area: 'household', label: 'קבלות מהמוסד ואישור על מצב הקרוב', kind: 'document', per: 'person', who: 'client', purposes: ['annual'], after: 'household.relativeCare',
    question: 'הקבלות מהמוסד על התשלום, ואישור על מצבו של הקרוב', why: 'הזיכוי ניתן לפי מה ששולם בפועל', input: 'file', docKind: 'ownRentDocs', knownBasis: DOC_KNOWN },
  // ── 22.10.2026 · סבב 2.1: «הכנסה אחרת» — ריבוע ובחירה סגורה, במקום «משהו אחר?» בטקסט חופשי (גיא) ──
  { key: 'income.other', area: 'special', label: 'הכנסה אחרת (זכייה, תמלוגים, השכרת ציוד)', kind: 'screener', per: 'person', who: 'client', purposes: ['annual'],
    question: 'האם ל{name} הייתה השנה הכנסה אחרת — זכייה, תמלוגים או השכרת ציוד?', why: 'כל הכנסה נכנסת לדוח — גם חד-פעמית', input: 'yesno', covers: { parts: ['ד', 'ה'] } },
  { key: 'income.otherKinds', area: 'special', label: 'מה הייתה ההכנסה האחרת', kind: 'detail', per: 'person', who: 'client', purposes: NONE, input: 'multi',
    question: 'מה הייתה ההכנסה?', why: 'לכל אחת נבקש רק את האישור שלה' },
  { key: 'income.prize', area: 'special', label: 'זכייה או פרס', kind: 'screener', per: 'person', who: 'client', purposes: NONE },
  { key: 'income.prizeDocs', area: 'special', label: 'אישור על הזכייה', kind: 'document', per: 'person', who: 'client', purposes: NONE,
    question: 'האישור על הזכייה — ממי שנתן את הפרס', why: 'בו רשום הסכום והמס שנוכה', input: 'file', docKind: 'other',
    officeNext: 'זכיות והימורים (special.gambling) — 124ב; מס שנוכה במקור לפי האישור' },
  { key: 'income.royalties', area: 'special', label: 'תמלוגים', kind: 'screener', per: 'person', who: 'client', purposes: NONE },
  { key: 'income.royaltiesDocs', area: 'special', label: 'דוח שנתי על תמלוגים', kind: 'document', per: 'person', who: 'client', purposes: NONE,
    question: 'הדוח השנתי על התמלוגים — מהגוף שמשלם', why: 'בו רשום כמה שולם וכמה מס נוכה', input: 'file', docKind: 'otherPropertyDocs' },
  { key: 'income.unlisted', area: 'special', label: 'הכנסה אחרת שלא ברשימה — לברר', kind: 'screener', per: 'person', who: 'client', purposes: NONE,
    officeNext: 'להתקשר ולברר מה ההכנסה; לפי הסוג — לבקש את האישור' },
  // ── לימודים וצבא: מקום אחד לכל אדם (מה שבתיק — ממולא; תואר ⇐ «ואז התמחות?», שחרור ⇐ חודש ושנה) ──
  { key: 'household.studies', area: 'household', label: 'לימודים, שחרור והתמחות', kind: 'detail', per: 'person', who: 'client', purposes: NONE, input: 'record',
    question: 'לימודים וצבא', why: 'סיום תואר או שירות מזכה בנקודות זיכוי בשנים שאחרי — ולמתמחים, משנת סיום ההתמחות',
    officeNext: 'תואר — 40ג (שדה 181/182, קוד ושנה); התמחות — 40ג(ג1), טופס 119; שחרור — 39 (חודש ושנה, אורך השירות מהתעודה)' },
  { key: 'household.releaseDocs', area: 'household', label: 'תעודת שחרור', kind: 'document', per: 'person', who: 'client', purposes: NONE,
    question: 'תעודת השחרור', why: 'בה רשומים חודש השחרור ואורך השירות', input: 'file', docKind: 'creditCerts' },
  { key: 'household.internshipDocs', area: 'household', label: 'אישור סיום התמחות', kind: 'document', per: 'person', who: 'client', purposes: NONE,
    question: 'אישור על ההתמחות — מתי התחילה ומתי הסתיימה', why: 'לפיו הנקודות מתחילות אחרי ההתמחות (טופס 119)', input: 'file', docKind: 'creditCerts' },
  // ── שורת הילדים: «השתנה» ⇒ נולד ילד / ילד עם מוגבלות ──
  { key: 'household.childChange', area: 'household', label: 'מה השתנה בילדים', kind: 'detail', per: 'couple', who: 'client', purposes: NONE, input: 'multi',
    question: 'מה השתנה?', why: 'לכל ילד נקודות זיכוי לפי גילו; לילד עם מוגבלות — נקודות נוספות' },
  { key: 'household.newChild', area: 'household', label: 'נולד ילד בשנה', kind: 'screener', per: 'couple', who: 'client', purposes: NONE },
  { key: 'household.newChildDocs', area: 'household', label: 'ספח תעודת הזהות עם הילד החדש', kind: 'document', per: 'couple', who: 'client', purposes: NONE,
    question: 'ספח תעודת הזהות — עם הילד החדש', why: 'ממנו לוקחים את תאריך הלידה', input: 'file', docKind: 'idCard' },
  { key: 'household.disabledChild', area: 'household', label: 'ילד עם מוגבלות (סעיף 45)', kind: 'screener', per: 'couple', who: 'client', purposes: NONE },
  // ‼ 290 · «ילד עם מוגבלות» ⇒ איזה ילד, ולזוג — למי מכם הנקודות (סעיף 45: להורה אחד). באישור ⇒ Child.hasDisability + disabilityPointsTo
  { key: 'household.disabledChildDetails', area: 'household', label: 'איזה ילד עם מוגבלות, ולמי הנקודות', kind: 'detail', per: 'couple', who: 'client', purposes: NONE, input: 'record',
    question: 'איזה ילד?', why: 'לילד עם מוגבלות מגיעות נקודות זיכוי נוספות' },
  { key: 'household.disabledChildDocs', area: 'household', label: 'אישור על מצב הילד', kind: 'document', per: 'couple', who: 'client', purposes: NONE,
    question: 'אישור על מצב הילד — למשל אישור קצבת ילד נכה', why: 'לפיו ניתנות נקודות הזיכוי הנוספות (טופס 116א)', input: 'file', docKind: 'specialStatusCert' },
  // ── שורת הכתובת: «עברנו» ⇒ אישור תושבות (יישוב מזכה דורש 12 חודשים) ──
  { key: 'household.addressCert', area: 'household', label: 'אישור תושבות ביישוב החדש', kind: 'document', per: 'couple', who: 'client', purposes: NONE,
    question: 'אישור תושבות — מהרשות המקומית', why: 'הטבת היישוב ניתנת לפי תקופת המגורים בו', input: 'file', docKind: 'settlementCert' },
  // ── 20.10.2026 · «מה שולם מביטוח לאומי?» — בחירה לכל אדם במקום «האם מתוך זה קיבל/ה דמי לידה?» (שנשאל גם אלמן — גיא, יריב).
  //    האישור השנתי — המשרד מוציא (niBenefits.cert). «דמי לידה» כאן = העובדה niBenefits.maternity, כמו התשובה הישנה.
  { key: 'niBenefits.kinds', area: 'niBenefits', label: 'מה שולם מביטוח לאומי', kind: 'detail', per: 'person', who: 'client', purposes: NONE, input: 'multi',
    question: 'מה שולם מביטוח לאומי?', why: 'כל תשלום מביטוח לאומי נכנס לדוח. את האישור השנתי אנחנו מוציאים' },
  { key: 'niBenefits.kindUnemployment', area: 'niBenefits', label: 'דמי אבטלה', kind: 'screener', per: 'person', who: 'client', purposes: NONE },
  { key: 'niBenefits.kindReserve', area: 'niBenefits', label: 'תגמולי מילואים', kind: 'screener', per: 'person', who: 'client', purposes: NONE },
  { key: 'niBenefits.kindInjury', area: 'niBenefits', label: 'דמי פגיעה בעבודה', kind: 'screener', per: 'person', who: 'client', purposes: NONE },
  { key: 'niBenefits.kindDisability', area: 'niBenefits', label: 'קצבת נכות', kind: 'screener', per: 'person', who: 'client', purposes: NONE },
  { key: 'niBenefits.kindOther', area: 'niBenefits', label: 'תשלום אחר מביטוח לאומי', kind: 'screener', per: 'person', who: 'client', purposes: NONE },
  // ── 20.10.2026 · מניות, אופציות ו-RSU מהעבודה (פער בבדיקת השלמות; נפוץ בהייטק) ──
  { key: 'salary.equity', area: 'salary', label: 'מניות, אופציות או RSU מהעבודה בשנה', kind: 'screener', per: 'person', who: 'client', purposes: ['annual'],
    question: 'האם {name} קיבל/ה מהעבודה מניות או אופציות — או מכר/ה כאלה השנה?',
    coupleQuestion: 'האם מישהו מכם קיבל מהעבודה מניות או אופציות — או מכר כאלה השנה?',
    why: 'מימוש ומכירה של מניות מהעבודה מדווחים בדוח — לפעמים כשכר ולפעמים כרווח הון', input: 'yesno',
    officeNext: 'סעיף 102 (נאמן / לא נאמן): חלק כהכנסת עבודה וחלק כרווח הון; מניות זרות — נספח ד׳; מכירה — נספח ג׳ / 1325' },
  { key: 'salary.equityDocs', area: 'salary', label: 'אישור הנאמן על מניות או אופציות', kind: 'document', per: 'person', who: 'client', purposes: ['annual'], after: 'salary.equity',
    question: 'האישור מהנאמן או מחברת ניהול התוכנית על מה שהוקצה, מומש ונמכר ב-{year}', why: 'בו רואים כמה מהרווח הוא שכר, כמה רווח הון, וכמה מס כבר נוכה', input: 'file', docKind: 'equityCert', knownBasis: DOC_KNOWN },
  // ── קצבה ופנסיה שהתקבלו (עד 19.10 נשאלו רק בהיכרות) ──
  { key: 'pension.received', area: 'savings', label: 'קצבה או פנסיה שהתקבלה בשנה', kind: 'screener', per: 'person', who: 'client', purposes: ['annual'],
    question: 'האם {name} קיבל/ה השנה קצבה או פנסיה — מקרן פנסיה, מהמדינה, מחברת ביטוח או קצבת שאירים?',
    coupleQuestion: 'האם מישהו מכם קיבל השנה קצבה או פנסיה — מקרן פנסיה, מהמדינה, מחברת ביטוח או קצבת שאירים?',
    why: 'חלק מהקצבאות חייבות במס וחלקן פטורות — לפי סוגן ולפי מי משלם', input: 'yesno', covers: { parts: ['ג', 'י'] },
    officeNext: 'קצבה מזכה — פטור 9א; קצבת שאירים — פטור עד התקרה לכל שאיר (9(6ו)); מביטוח לאומי — 9(6ג). לפי האישור' },
  { key: 'pension.certs', area: 'savings', label: 'אישור שנתי על קצבה — מכל משלם', kind: 'document', per: 'person', who: 'client', purposes: ['annual'], after: 'pension.received',
    question: 'האישור השנתי על הקצבה — מכל מי שמשלם קצבה', why: 'באישור רואים כמה שולם, מה פטור וכמה מס נוכה', input: 'file', docKind: 'allowanceCert', knownBasis: DOC_KNOWN,
    officeNext: 'סכום חייב ופטור לפי האישור; כמה משלמים ⇒ לבדוק תיאום מס' },
  // ── נכות (פטור 9(5)) ──
  { key: 'special.disability', area: 'special', label: 'נכות או מחלה קשה (פטור 9(5))', kind: 'screener', per: 'person', who: 'client', purposes: ['annual'],
    question: 'האם ל{name} נקבעו אחוזי נכות, או שיש מחלה קשה?', coupleQuestion: 'האם למישהו מכם נקבעו אחוזי נכות, או שיש מחלה קשה?',
    why: 'נכות של 90% ומעלה פוטרת חלק גדול מההכנסה ממס — רק עם אישור', input: 'yesno', covers: { parts: ['י'] },
    officeNext: 'פטור 9(5): נכות 100% (או 90% מצטבר) לתקופה של 185 יום לפחות, לפי אישור פקיד השומה' },
  // ‼ 290 · «כן» בריבוע ⇒ כמה אחוזים וממתי (או «עוד לא נקבעו»). באישור ⇒ disabilityPercentage בכרטיס; «ממתי» — שורה למשרד
  { key: 'special.disabilityDetails', area: 'special', label: 'אחוזי נכות וממתי', kind: 'detail', per: 'person', who: 'client', purposes: ['annual'], after: 'special.disability', input: 'record',
    question: 'אחוזי הנכות של {name}', why: 'מ-90% יש פטור ממס על חלק מההכנסה — לפי התקופה',
    officeNext: '«אשר ועדכן בתיק» — האחוז נכתב בכרטיס; נכות מתוך השנה — לבדוק 185 יום (9(5))' },
  { key: 'special.disabilityCert', area: 'special', label: 'אישור אחוזי נכות', kind: 'document', per: 'person', who: 'client', purposes: ['annual'], after: 'special.disability',
    question: 'האישור על אחוזי הנכות — מפקיד השומה או מביטוח לאומי', why: 'הפטור ניתן רק לפי האישור, לתקופה שבו', input: 'file', docKind: 'specialStatusCert', knownBasis: DOC_KNOWN },
  // ── דירה או חשבון חדשים, כשבתיק אין (בתיק יש — אישור «זה מה שידוע לנו») ──
  { key: 'rent.newRental', area: 'rent', label: 'השכרת דירה או נכס (כשאין בתיק)', kind: 'screener', per: 'couple', who: 'client', purposes: ['annual'], coveredBy: 'rent.properties', cardKeys: ['properties'],
    question: 'האם השכרתם השנה דירה או נכס אחר?', why: 'שכר דירה מדווח לפי מסלול לכל נכס', input: 'yesno', covers: { parts: ['ד', 'ה', 'י'] } },
  { key: 'capital.newAccount', area: 'capital', label: 'חיסכון, פיקדון או מניות (כשאין בתיק)', kind: 'screener', per: 'couple', who: 'client', purposes: ['annual'], coveredBy: 'capital.accounts', cardKeys: ['investmentAccounts'],
    question: 'האם היו לכם השנה פיקדון, חיסכון או מניות — בבנק או בבית השקעות?', why: 'מכל בנק או בית השקעות מגיע אישור שנתי (867)', input: 'yesno', covers: { parts: ['ה', 'ח'] } },
  // ── אירוע משפחתי בשנה ──
  { key: 'household.familyChange', area: 'household', label: 'שינוי במצב המשפחתי בשנה', kind: 'screener', per: 'couple', who: 'client', purposes: ['annual'],
    question: 'האם השתנה השנה המצב המשפחתי — נישואין, גירושין או פטירה?', why: 'קובע מי מגיש, איך מחשבים ואילו נקודות זיכוי מגיעות', input: 'yesno', covers: { parts: ['ב', 'יג'] } },
  { key: 'household.familyEvent', area: 'household', label: 'מה השתנה במצב המשפחתי', kind: 'detail', per: 'couple', who: 'client', purposes: NONE, after: 'household.familyChange', input: 'multi',
    question: 'מה קרה?', why: 'לכל מקרה נשאל שאלה קצרה ונבקש רק את המסמכים שצריך' },
  { key: 'family.eventDeath', area: 'household', label: 'פטירת בן/בת הזוג בשנה', kind: 'screener', per: 'couple', who: 'client', purposes: NONE },
  { key: 'family.eventDivorce', area: 'household', label: 'גירושין או פרידה בשנה', kind: 'screener', per: 'couple', who: 'client', purposes: NONE },
  { key: 'family.eventMarriage', area: 'household', label: 'נישואין בשנה', kind: 'screener', per: 'couple', who: 'client', purposes: NONE },
  // פטירה (המחקר: docs/tax-foundation/research/spouse-death-year-2026-10-19.md)
  { key: 'family.death', area: 'household', label: 'פטירה: תאריך וצו ירושה', kind: 'detail', per: 'couple', who: 'client', purposes: NONE, input: 'record', after: 'family.eventDeath',
    question: 'מתי {spouse} נפטר/ה?', why: 'עד יום הפטירה ההכנסות נכללות בדוח המשותף; אחריו — שייכות ליורשים',
    officeNext: 'חיתוך לפי יום הפטירה (פקודה 120, 125א): עד היום — בדוח כבן/בת הזוג; מה שהתקבל אחרי ובגללו — הכנסת היורשים (258/272)' },
  { key: 'family.deathIncome', area: 'household', label: 'מה בן/בת הזוג קיבל/ה עד הפטירה', kind: 'detail', per: 'couple', who: 'client', purposes: NONE, input: 'multi',
    question: 'מה {spouse} קיבל/ה ב-{year}, עד הפטירה?', why: 'כך נדע אילו אישורים לבקש. «לא בטוח» זה בסדר — נברר יחד' },
  { key: 'family.deathGotSalary', area: 'household', label: 'קיבל/ה משכורת עד הפטירה', kind: 'screener', per: 'person', who: 'client', purposes: NONE },
  { key: 'family.deathGotPension', area: 'household', label: 'קיבל/ה קצבה עד הפטירה', kind: 'screener', per: 'person', who: 'client', purposes: NONE },
  { key: 'family.deathGotNi', area: 'household', label: 'קיבל/ה דמי מחלה או קצבת נכות מביטוח לאומי', kind: 'screener', per: 'person', who: 'client', purposes: NONE },
  { key: 'family.deathGotDisabilityIns', area: 'household', label: 'קיבל/ה אובדן כושר עבודה מחברת ביטוח', kind: 'screener', per: 'person', who: 'client', purposes: NONE },
  { key: 'family.disabilityInsDocs', area: 'household', label: 'אישור מחברת הביטוח על אובדן כושר עבודה', kind: 'document', per: 'person', who: 'client', purposes: NONE,
    question: 'האישור מחברת הביטוח על התשלומים לאובדן כושר עבודה', why: 'תשלום חודשי כזה הוא הכנסה; ייתכן שהוא בפטור הנכות', input: 'file', docKind: 'insuranceCert' },
  { key: 'family.deathPayouts', area: 'household', label: 'כספים ששולמו בגלל הפטירה', kind: 'detail', per: 'couple', who: 'client', purposes: NONE, input: 'multi',
    question: 'שולמו כספים בגלל הפטירה?', why: 'רוב הכספים האלה פטורים ממס — אבל צריך את האישורים כדי לקבל את הפטור' },
  { key: 'family.payoutSeverance', area: 'household', label: 'פיצויים או מענק מהמעסיק בגלל הפטירה', kind: 'screener', per: 'couple', who: 'client', purposes: NONE },
  { key: 'family.payoutLifeIns', area: 'household', label: 'ביטוח חיים בגלל הפטירה', kind: 'screener', per: 'couple', who: 'client', purposes: NONE },
  { key: 'family.payoutFund', area: 'household', label: 'כסף מקופת גמל או פנסיה למוטבים', kind: 'screener', per: 'couple', who: 'client', purposes: NONE },
  { key: 'family.payoutMortgage', area: 'household', label: 'ביטוח משכנתה ששילם לבנק', kind: 'screener', per: 'couple', who: 'client', purposes: NONE },
  // 20.10.2026 · פערי יריב: פדיון ימי מחלה, היוון + 161ד, מתי שולמה קצבת השאירים, אישור לכל משלם
  { key: 'family.payoutSickDays', area: 'household', label: 'פדיון ימי מחלה או חופשה בגלל הפטירה', kind: 'screener', per: 'couple', who: 'client', purposes: NONE },
  { key: 'family.sickPayDocs', area: 'household', label: 'אישור על פדיון ימי מחלה או חופשה', kind: 'document', per: 'couple', who: 'client', purposes: NONE,
    question: 'האישור מהמעסיק על פדיון ימי המחלה או החופשה — כמה שולם, כמה מס נוכה ומתי שולם', why: 'כסף שהתקבל אחרי הפטירה שייך ליורשים; לפי האישור נבדוק אם נוכה יותר מדי מס', input: 'file', docKind: 'sickPayout',
    officeNext: 'אחרי הפטירה ⇒ הכנסת היורשים (125א, המס עד 40%), לא בפטור 9(5) של הנפטר/ת; החזר רק אם נוכה יותר מהמס המתאים; באיזו שנה שולם' },
  { key: 'family.pensionCapitalized', area: 'household', label: 'היוון של חלק מהקצבה', kind: 'detail', per: 'couple', who: 'client', purposes: NONE,
    question: 'האם {spouse} קיבל/ה פעם סכום חד־פעמי במקום חלק מהקצבה החודשית?', why: 'כשחלק מהקצבה «הוון», זה משנה כמה ממנה פטור ממס', input: 'yesno',
    officeNext: 'היוון + 161ד (קיבוע זכויות): הפטור על הקצבה (9א) ומה מכוסה ב-9(5) בחייה; היוון ששולם לשאירים — הכנסתם' },
  { key: 'family.capitalizationDocs', area: 'household', label: 'מכתב ההיוון וטופס 161ד', kind: 'document', per: 'couple', who: 'client', purposes: NONE,
    question: 'המכתב על ההיוון — ואם הוגש, גם הטופס «קיבוע זכויות»', why: 'בהם רואים כמה הוון וממתי — זה קובע כמה מהקצבה פטור (הטופס נקרא 161ד)', input: 'file', docKind: 'capitalizationDocs' },
  { key: 'family.survivorPaidWhen', area: 'household', label: 'קצבת השאירים: מתי התחילו לשלם בפועל', kind: 'detail', per: 'couple', who: 'client', purposes: NONE,
    question: 'מתי התחילו לשלם את קצבת השאירים בפועל?', why: 'קצבה שאושרה מאוחר ושולמה רטרואקטיבית — לפעמים שייכת לדוח של השנה שבה שולמה', input: 'choice',
    options: [{ value: 'thisYear', label: 'כבר בשנה של הדוח' }, { value: 'nextYearRetro', label: 'רק בשנה שאחריה — עם תשלום רטרואקטיבי' }, { value: 'notYet', label: 'עוד לא התחילו לשלם' }, { value: 'notSure', label: 'לא בטוח/ה' }],
    officeNext: 'מזומן: קצבה ששולמה בשנה שאחרי, רטרואקטיבית — לדוח שנת התשלום; לבחון פריסה לאחור (8(ג)(3))' },
  { key: 'family.survivorDocsState', area: 'household', label: 'אישור שנתי מהגמלאות של המדינה על קצבת שאירים', kind: 'document', per: 'couple', who: 'client', purposes: NONE,
    question: 'האישור השנתי מהגמלאות של המדינה על קצבת השאירים — לכל מי שמקבל (גם לילדים)', why: 'כמה שולם, ממתי וכמה מס נוכה — לכל שאיר יש פטור משלו', input: 'file', docKind: 'allowanceCert' },
  { key: 'family.survivorDocsBtl', area: 'household', label: 'אישור מביטוח לאומי על קצבת שאירים', kind: 'document', per: 'couple', who: 'office', purposes: ['annual'], after: 'family.survivorFromBtl' /* 20.10.2026 · המשרד מוציא */,
    question: 'האישור מביטוח לאומי על קצבת השאירים', why: 'קצבת שאירים מביטוח לאומי פטורה — האישור לתיעוד בדוח', input: 'file', docKind: 'allowanceCert' },
  { key: 'family.severanceDocs', area: 'household', label: 'טופס 161 ו-161ב (פיצויים בגלל פטירה)', kind: 'document', per: 'couple', who: 'client', purposes: NONE,
    question: 'הטופס מהמעסיק על הפיצויים בגלל הפטירה, וחלק ב׳ שמילאתם — ואם יש, תשובת פקיד השומה', why: 'נקרא «טופס 161». פיצויים בגלל פטירה פטורים עד כפל התקרה — רק דרך הטופס', input: 'file', docKind: 'severanceDocs',
    officeNext: '9(7א)(ב)(1): לבחור — לשאירים (פטור כפול, החייב עד 40% בידם) או לנפטר/ת (פטור רגיל); לבדוק באיזו שנה שולם' },
  { key: 'family.payoutDocs', area: 'household', label: 'מכתב תשלום מחברת הביטוח או מהקופה', kind: 'document', per: 'couple', who: 'client', purposes: NONE,
    question: 'המכתב מחברת הביטוח או מהקופה על התשלום', why: 'סכום הון על מוות פטור ממס (9(7)) — לתיעוד בדוח', input: 'file', docKind: 'insurancePayout' },
  { key: 'family.survivorPensions', area: 'household', label: 'קצבאות שאירים: ממי', kind: 'detail', per: 'couple', who: 'client', purposes: NONE, input: 'multi',
    question: 'ממי מקבלים קצבת שאירים (אתם או הילדים)?', why: 'לכל מי שמקבל — פטור משלו עד התקרה; ילדים מדווחים בתיק משלהם' },
  { key: 'family.survivorFromFund', area: 'household', label: 'קצבת שאירים מקרן פנסיה או חברת ביטוח', kind: 'screener', per: 'couple', who: 'client', purposes: NONE },
  { key: 'family.survivorFromState', area: 'household', label: 'קצבת שאירים מהמדינה (גמלאות)', kind: 'screener', per: 'couple', who: 'client', purposes: NONE },
  { key: 'family.survivorFromBtl', area: 'household', label: 'קצבת שאירים מביטוח לאומי', kind: 'screener', per: 'couple', who: 'client', purposes: NONE },
  { key: 'family.deathDocs', area: 'household', label: 'תעודת פטירה וצו ירושה', kind: 'document', per: 'couple', who: 'client', purposes: NONE,
    question: 'תעודת הפטירה, וצו הירושה אם כבר ניתן', why: 'החזרי מס והכנסות שאחרי הפטירה שייכים ליורשים', input: 'file', docKind: 'deathDocs' },
  { key: 'family.survivorDocs', area: 'household', label: 'אישורים שנתיים על קצבאות שאירים', kind: 'document', per: 'couple', who: 'client', purposes: NONE,
    question: 'האישור השנתי מקרן הפנסיה או מחברת הביטוח על קצבת השאירים — לכל מי שמקבל (גם לילדים), גם אם עוד לא שולם', why: 'בו רואים כמה שולם, מתי התחיל וכמה מס נוכה', input: 'file', docKind: 'allowanceCert',
    officeNext: 'תשלום רטרואקטיבי — לבדוק באיזו שנה שולם בפועל; כמה משלמים ⇒ תיאום מס לכל שאיר' },
  // גירושין · נישואין
  { key: 'family.divorce', area: 'household', label: 'גירושין: תאריך, ילדים ומזונות', kind: 'detail', per: 'couple', who: 'client', purposes: NONE, input: 'record', after: 'family.eventDivorce',
    question: 'הגירושין או הפרידה — הפרטים', why: 'מהתאריך משתנה מי מגיש ואילו נקודות זיכוי מגיעות לכל הורה',
    officeNext: 'מצב משפחתי לפי שנת המס (familyStatusForYear); מזונות לבן/בת זוג לשעבר — נקודת זיכוי למי שנישא מחדש' },
  // ‼ 290 · «אני משלם/ת» מזונות ⇒ כמה בחודש לכל ילד (Child.monthlyAlimonyPaid — «משתתף בכלכלת ילדיו»)
  { key: 'family.childSupport', area: 'household', label: 'מזונות ילדים ששולמו — לכל ילד', kind: 'detail', per: 'couple', who: 'client', purposes: NONE, input: 'record',
    question: 'מזונות לילדים — כמה בחודש?', why: 'מי שמשלם מזונות לילדיו זכאי לנקודת זיכוי' },
  { key: 'family.divorceDocs', area: 'household', label: 'הסכם או פסק דין גירושין', kind: 'document', per: 'couple', who: 'client', purposes: NONE,
    question: 'הסכם הגירושין או פסק הדין', why: 'בו כתוב התאריך, אצל מי הילדים והמזונות', input: 'file', docKind: 'divorceDocs' },
  { key: 'family.marriage', area: 'household', label: 'נישואין: תאריך ובן/בת הזוג', kind: 'detail', per: 'couple', who: 'client', purposes: NONE, input: 'record', after: 'family.eventMarriage',
    question: 'מזל טוב! כמה פרטים על הנישואין', why: 'משנת הנישואין מגישים דוח משותף, והכנסות בן/בת הזוג נכללות בו',
    officeNext: 'לעדכן בכרטיס: מצב משפחתי, שנת נישואין, בן/בת הזוג (ולפתוח לו/ה כרטיס אם צריך)' },
  { key: 'family.marriageSpouseDocs', area: 'household', label: 'האישורים השנתיים של בן/בת הזוג', kind: 'document', per: 'couple', who: 'client', purposes: NONE,
    question: 'האישורים השנתיים של בן/בת הזוג על ההכנסות — מכל מעסיק, או דוח העסק', why: 'בדוח המשותף נכללות גם ההכנסות של בן/בת הזוג (משכורת — «טופס 106»)', input: 'file', docKind: 'form106' },
);
// ‼ «הכרעות שלך» בדף הסיכום (AnnualSummary): עובדת משרד אחת לכל הכרעה (value.decision) — מי ומתי, בלי מצב חדש
ITEMS.push({ key: 'annual.officeDecision', area: 'special', label: 'הכרעת משרד בדוח השנתי', kind: 'detail', per: 'couple', who: 'office', purposes: NONE });
for (const i of ITEMS) if (ANNUAL_TILES[i.key]) i.tile = ANNUAL_TILES[i.key];

// ‼ 16.10.2026 (גיא, «בקשה אחת לתיק המס» שלב 2): הערכת מס היא מספרים בלבד — אף מסמך לא מתבקש בה. פריטי המסמך
//   נשארים (זהות הראיות, הדוח השנתי); רק התכלית 'estimate' יורדת מהם.
for (const i of ITEMS) if (i.input === 'file') i.purposes = i.purposes.filter(p => p !== 'estimate');
/** פריטי מסמך שירדו מהערכת המס (לדוח ולבדיקות). */
export const ESTIMATE_DOCS_REMOVED = ITEMS.filter(i => i.input === 'file').length;
// הכנה להצהרת הון (230) — אותו מנגנון, תכלית 'wealth' (wealthCatalog.ts).
AREAS.push(...WEALTH_AREAS);
ITEMS.push(...WEALTH_ITEMS);
// קליטה והשלמת תיק המס (236) — אותו מנגנון, תכלית 'intake' (intakeCatalog.ts).
AREAS.push(...INTAKE_AREAS);
ITEMS.push(...INTAKE_ITEMS);

export const ITEM_BY_KEY: Record<string, InfoItem> = Object.fromEntries(ITEMS.map(i => [i.key, i]));

/**
 * גרסת תבנית השאלון — טביעה של מה שהלקוח רואה (ניסוח, תנאים, סוג תשובה).
 * ‼ נשמרת בתוך השאלה שנשלחה (prompt.templateVersion), כדי להבחין בין התבנית
 * שאפשר לערוך היום לבין הגרסה שכבר נשלחה ללקוח. שינוי ניסוח ⇒ גרסה חדשה;
 * השאלה שנשלחה נשארת כפי שנשלחה.
 */
export const CATALOG_VERSION: string = (() => {
  const text = JSON.stringify(ITEMS.map(i => [i.key, i.kind, i.per, i.question ?? '', i.coupleQuestion ?? '', i.why ?? '', i.input ?? '', i.after ?? '', i.rare ? 1 : 0, i.onlyIfOnCard ? 1 : 0, i.coveredBy ?? '', i.purposes.join(','), i.onlyNew ? 1 : 0, i.whenEmpty?.question ?? '']));
  let h = 0x811c9dc5;
  for (let k = 0; k < text.length; k++) { h ^= text.charCodeAt(k); h = Math.imul(h, 0x01000193) >>> 0; }
  return h.toString(16).padStart(8, '0').slice(0, 6);
})();
export const AREA_BY_ID: Record<AreaId, Area> = Object.fromEntries(AREAS.map(a => [a.id, a])) as Record<AreaId, Area>;

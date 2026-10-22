// ─── הערכת מס (שלב 3) — מבנה הנתונים ──────────────────────────────────────────
// ‼ ארבעה תאריכים שאינם מתערבבים: חודש החתך (עד מתי נתוני אמת), תאריך ההכנה, תאריך בדיקת
//   היתרות ברשויות, ותקופה של כל תשלום. תשלום שבוצע אחרי החתך נספר לפי התקופה שלו — פעם אחת.
// ‼ חסר ≠ אפס: שורה בלי סכום בפועל היא «חסר», לא 0.
// ‼ רווח והפסד מהספרים נשמר לפני תיאומים; תיאומי מס נפרדים, ואי אפשר לתאם אותה קטגוריה פעמיים.
// ‼ גרסה מאושרת אינה נערכת. חישוב מחדש = גרסה חדשה (השרת אוכף, 231).
// מקור הדרישות: docs/TAX-ESTIMATE-CUTOFF-AND-ADVANCES-2026-10-10.md (עותק ראשי),
// docs/tax-foundation/architecture-and-delivery-plan.md §4.3–4.4, §6 «שלב 3».

export type Person = 'client' | 'spouse';
export type IncomeSource = 'salary' | 'business' | 'rent' | 'capital' | 'other';

/** מאיפה הגיע מספר — כדי לחזור למקור. */
export interface SourceRef {
  factId?: string;
  evidenceId?: string;
  documentId?: string;
  /** תיאור קצר כשאין רשומה (למשל «הזנה ידנית מתלוש 09/2026»). */
  note?: string;
  /**
   * 14.10.2026 · מאיפה הסכום — כדי להבחין במסך ובסיכום בין «נמסר מהלקוח» ל«נבדק במשרד» ול«מול הרשות».
   * client — תשובת הלקוח שהמשרד אישר; document — ממסמך שהמשרד בדק; authority — נקרא מהרשות;
   * import — נקלט מקובץ (רו״ה, 134, ESNA); office — הוזן במשרד.
   */
  provenance?: 'client' | 'document' | 'authority' | 'import' | 'office';
  /** מתי המשרד אישר / בדק (YYYY-MM-DD). */
  checkedAt?: string;
}

export type ForecastMethod = 'runRate' | 'lastYear' | 'manual' | 'none';

/** תחזית לשאר השנה — של הלקוח ושל המשרד, נשמרות שתיהן; המשרד בוחר. */
export interface ForecastSide {
  method: ForecastMethod;
  /** manual / lastYear: הסכום לחודשים שאחרי החתך. runRate: מחושב. */
  amount?: number;
  assumption?: string;
  at?: string;
}

/** שורת הכנסה אחת: אדם × מקור × ישות. */
export interface IncomeLine {
  id: string;
  person: Person;
  source: IncomeSource;
  entityRef?: string;
  label: string;
  /** בפועל עד סוף חודש החתך. undefined = חסר (לא 0). */
  actualToCutoff?: number;
  /** כמה חודשים מכסה הסכום בפועל (עסק שנפתח באמצע השנה — פחות מחודש החתך). */
  actualMonths?: number;
  actualSource?: SourceRef;
  /**
   * 14.10.2026 · סוג המקור בלבד, בטוח לתצוגה ללקוח (actualSource פנימי ואינו עובר לדף האישי — 232).
   * נשמר יחד עם actualSource בכל מקום שהוא נקבע.
   */
  actualFrom?: NonNullable<SourceRef['provenance']>;
  /** עסק: המחזור עד החתך (לבסיס מקדמת מס הכנסה ולהשוואה מול מע״מ ו-134). */
  turnoverToCutoff?: number;
  /** משכורת / הון: מס שנוכה עד החתך. עסק: ניכוי במקור מלקוחות (מקוזז מהמקדמה, סעיף 177). */
  withheldToCutoff?: number;
  client?: ForecastSide;
  office?: ForecastSide;
  /** איזו תחזית נכנסת לחישוב; undefined = טרם אושרה (חוסם אישור הערכה). */
  chosen?: 'client' | 'office';
  /** עסק: מחזור צפוי לשאר השנה (לחישוב שיעור המקדמה). */
  turnoverForecast?: number;
  /** מס צפוי במקור לשאר השנה (משכורת / הון / לקוחות). */
  withheldForecast?: number;
  /**
   * 13.10.2026 · תחולה בזמן (taxYear/temporal.ts — החוזה המשותף עם האיסוף): האם הישות מהתיק קיימת בתקופת האמת
   * (1.1 עד סוף החתך) ובתקופת התחזית (מהחודש שאחרי החתך עד 31.12). נגזר בטעינה מתאריכי הישות ומתשובות period.*.
   * ‼ מועד בדיקה או אישור אינו תחולה. 'unknown' — לא מנחשים; שואלים.
   */
  period?: { actual: 'in' | 'out' | 'unknown'; forecast: 'in' | 'out' | 'unknown'; span?: string };
  /** עסק: המסלול בשנה הזו. undefined / books = רווח לפי הספרים; micro = עסק זעיר (87ב, מ-2024) — 30% מהמחזור. */
  track?: 'books' | 'micro';
  micro?: MicroSetup;
  /**
   * הון: סוג ההכנסה — קובע את השיעור (125ב, 125ג, 91). ‼ undefined = לא סווג ⇒ חוסם (לא מנחשים 25%).
   * dividendSubstantial — דיבידנד מחברה שבה הוא בעל מניות מהותי (30%), לא כל ההכנסה ההונית שלו.
   * interestOwnCompany — ריבית מחברה שבשליטתו: במדרגות הרגילות (לא 15%/25%).
   */
  capitalKind?: CapitalKind;
  /** הכנסה שאינה מיגיעה אישית (שכ״ד, הון, אחר) אצל בן הזוג עם היגיעה הנמוכה: מותר רק לרכוש מלפני הנישואים / מירושה (66(ב)). */
  attribution?: 'premarital' | 'inherited';
}

export type CapitalKind = 'gains' | 'dividend' | 'dividendSubstantial' | 'interestUnlinked' | 'interestLinked' | 'interestOwnCompany';

/**
 * עסק זעיר לשורת עסק. ‼ ארבעה דברים נפרדים: רישום ברשות (מתי), סוג התיק, המסלול שנבחר לשנה, והזכאות —
 * שנגזרת בחישוב (מחזור מול התקרה, 87ד(ג), צינון). המעמד במע״מ אינו כאן ואינו קובע.
 */
export interface MicroSetup {
  /** היה רשום כבעל עסק זעיר בתחילת שנת המס — תנאי ל-87ד(ג). undefined = לא ידוע. */
  registeredAtYearStart?: boolean;
  registeredOn?: string;
  /** סוג התיק כפי שנקרא (44 / אחר) — מידע, לא זכאות. */
  fileType?: string;
  evidence?: SourceRef;
  /** בשנת חריגה (87ד(ג)): ניכוי מוגבל או הוצאות בפועל על כל המחזור. undefined = הנמוך מהשניים, מוצג. */
  choice?: 'normativeCapped' | 'books';
  /** שנים קודמות: ניכה 30%? הייתה הכנסה מעסק? — לבדיקת הצינון (87ה(ב)). */
  history?: { year: number; deducted: boolean; hadBusinessIncome: boolean }[];
  /** מסלול הדיווח לשנה: מקוצר (תיק 44, תיאום, תקנות הפטור) או דוח מלא. קובע את הטבות הפנסיה וקרן ההשתלמות. */
  reporting?: 'short' | 'full';
}

/** עסק זעיר — מה חושב לשורה, כדי שיהיה אפשר לבדוק ביד. */
export interface MicroLineResult {
  lineId: string;
  person: Person;
  turnoverToCutoff: number;
  annualTurnover: number;
  ceiling: number;
  /** within = בתקרה; forecastExceed = עד החתך בתקרה, השנה צפויה לחרוג; actualExceed = כבר חרג. */
  status: 'within' | 'forecastExceed' | 'actualExceed';
  mode: 'regular' | 'exceeded87dc' | 'exceededNoRelief' | 'blockedCooling';
  /** מה נכנס כהכנסה מהעסק: מחזור פחות הניכוי, או הספרים. undefined = חסר. */
  taxable?: number;
  deduction: number;
  /** בשנת 87ד(ג): שתי החלופות — לא משולבות. */
  alternatives?: { normativeCapped: number; books?: number };
  chosen: 'normative' | 'normativeCapped' | 'books';
  /** מסלול הדיווח והשפעתו: מס האדם בכל חלופה (כשיש הפקדות — הן שונות). */
  reporting?: { chosen?: 'short' | 'full'; short?: number; full?: number; withoutDeposits?: number; note: string };
  open: string[];
  explain: string[];
}

/** אירוע חד־פעמי — לא מוכפל בקצב שנתי. */
export interface OneOff {
  id: string;
  person: Person;
  lineId?: string;
  label: string;
  /** חיובי = הכנסה, שלילי = הוצאה. */
  amount: number;
  /** כבר כלול בסכום בפועל עד החתך (ואז מנוטרל מקצב החודשים), או צפוי אחריו. */
  timing: 'inActual' | 'expected';
  source?: SourceRef;
}

/** תיאום מס — נפרד מהספרים. */
export interface Adjustment {
  id: string;
  person: Person;
  lineId: string;
  /** הקטגוריה בספרים — ייחודית לכל שורה (אין תיאום כפול). */
  bookCategory: string;
  /** חיובי = מגדיל הכנסה חייבת. */
  amount: number;
  reason: string;
}

/** תקופת דיווח ברשות (134 / ESNA). */
export interface AuthorityPeriod {
  /** YYYY-MM של חודש הסיום של התקופה. */
  period: string;
  /** reported = דווח; not_due = טרם הגיע המועד (לא חוסר ולא אפס); unknown = לא נקרא. */
  state: 'reported' | 'not_due' | 'unknown';
  turnover?: number;
  charged?: number;
  paid?: number;
  withheld?: number;
}

export interface AuthorityReading {
  /** מתי נבדקו היתרות ברשות — לא תאריך ההכנה ולא החתך. */
  readOn?: string;
  /** manual = הוזן ביד ממסך הרשות; upload = מצילום/קובץ; automation = קורא אוטומטי. */
  via: 'manual' | 'upload' | 'automation' | 'client';
  evidence?: SourceRef;
  periods: AuthorityPeriod[];
}

/** מס הכנסה (134): שיטת המקדמה ושיעורה. */
export interface ItAdvanceSetup extends AuthorityReading {
  method: 'turnoverRate' | 'fixed' | 'none' | 'unknown';
  /** אחוז מהמחזור, כשהשיטה לפי מחזור. */
  ratePct?: number;
  fixedPerPeriod?: number;
  /** חודשי או דו־חודשי. */
  frequency: 1 | 2;
}

/** ב״ל: המקדמה החודשית הנוכחית ומה שולם. */
export interface NiAdvanceSetup {
  readOn?: string;
  via: 'manual' | 'upload' | 'automation' | 'client';
  evidence?: SourceRef;
  monthlyAdvance?: number;
  /** ההכנסה החודשית שעליה נשענת המקדמה בב״ל. */
  basisMonthlyIncome?: number;
  paidToCutoff?: number;
  /** תשלומים לפי חודש — נדרש להשלמה שאינה מינואר. */
  periods?: { period: string; paid?: number; charged?: number }[];
  /** מקור המספרים כשנקראו מהכרטיס (קריאת ב״ל). */
  source?: SourceRef;
}

/**
 * השלמה חד־פעמית לתקופות שכבר עברו — נפרדת מהשיעור השוטף. מחושבת רק כשהמשרד רשם רשות, אדם,
 * שיטה ותקופת תחולה מפורשים, ביסוס ואישור; ונשענת על התקופות והתשלומים בפועל — לא על נוסחה
 * קבועה של «הפרש שיעורים × מחזור עד החתך».
 */
export interface CatchUp {
  id: string;
  authority: 'it' | 'ni';
  person: Person;
  /** התקופה הראשונה שההשלמה חלה עליה (YYYY-MM). */
  effectiveFrom: string;
  /** it: שיעור חדש על המחזור שדווח בכל תקופה, פחות מה שחויב/שולם בה. ni: מקדמה חודשית חדשה פחות מה ששולם בכל חודש.
   *  manualAmount: סכום שהמשרד קבע (למשל מדרישת הרשות). */
  method: 'rateOnReportedTurnover' | 'monthlyDifference' | 'manualAmount';
  /** השיעור (%) או המקדמה החודשית החדשה. */
  newValue?: number;
  amount?: number;
  justification: string;
  source?: SourceRef;
  approvedAt?: string;
}

/**
 * דמי ב״ל לעסק זעיר: אין ניכוי 52% (מאומת, 345(ב)(1)(א)); שהבסיס הוא 70% מהמחזור — קריאה, לא כתוב.
 * לכן אין מספר בלי הכרעה מפורשת: סכום (למשל משומת ב״ל) או החלת 70% — עם מקור ואישור.
 */
export interface NiOverride {
  id: string;
  person: Person;
  method: 'manualAmount' | 'assessedIncome70';
  amount?: number;
  justification: string;
  source?: SourceRef;
  approvedAt?: string;
}

/** תשלום שבוצע — עם התקופה שהוא משלם, כדי שלא ייספר פעמיים. */
export interface Payment {
  id: string;
  authority: 'it' | 'ni';
  person: Person;
  paidOn: string;
  /** YYYY-MM של התקופה שהתשלום מכסה. */
  period: string;
  amount: number;
  source?: SourceRef;
}

/** הפקדות לפנסיה ולקרן השתלמות — מה הופקד ומה מתוכנן. */
export interface SavingsPlan {
  person: Person;
  pensionToCutoff?: number;
  pensionPlanned?: number;
  studyFundToCutoff?: number;
  studyFundPlanned?: number;
  source?: SourceRef;
  /** מטופסי 106, לשנה: ההכנסה המבוטחת (244/245), הפקדות העובד (045/086) והמעביד כולל פיצויים (248/249) —
   *  משכורת מקטינה את תקרת ההכנסה המזכה, וההפקדות קובעות «עמית מוטב» (מסלול ב׳). */
  insuredSalary?: number;
  employeeDeposits?: number;
  employerDeposits?: number;
  /** «מסלול א׳» במקום ב׳ לעמית מוטב (233/234). */
  pensionTrack?: 'auto' | 'A';
}

/** יישור בין מקורות (ספרים / מע״מ / 134) לתקופה. פתוח ⇒ חוסם אישור. */
export interface Reconciliation {
  id: string;
  lineId: string;
  what: 'turnover';
  books?: number;
  vat?: number;
  it134?: number;
  decision?: 'books_correct' | 'authority_correct' | 'open_with_note';
  note?: string;
  decidedAt?: string;
}

/** הכרעה משרדית מתועדת לכלל שלא הוכרע — מאפשרת חישוב, לא מסתירה את המגבלה. */
export interface OfficeDecision {
  ruleId: string;
  text: string;
  at?: string;
}

export interface EstimateDraft {
  cutoffMonth: number;
  preparedOn: string;
  lines: IncomeLine[];
  oneOffs: OneOff[];
  adjustments: Adjustment[];
  it: ItAdvanceSetup;
  ni: NiAdvanceSetup;
  /** בן/בת הזוג — מקדמות משלו/ה כשיש לו/ה עסק. */
  itSpouse?: ItAdvanceSetup;
  niSpouse?: NiAdvanceSetup;
  catchUps?: CatchUp[];
  /** השלמה מקצועית לדמי ב״ל כשהבסיס לא אומת (עסק זעיר) — רק עם שיטה/סכום, ביסוס ואישור. */
  niOverrides?: NiOverride[];
  /** זיכויים לפי אדם: תרומות (סעיף 46), ביטוח חיים (45א — 106 + ישירות לחברה, בלי כפל). */
  credits?: { person: Person; donations?: number; lifeInsurance?: number; source?: SourceRef }[];
  /**
   * בני זוג — שער הזכאות לחישוב נפרד (סעיף 66(ד), טופס 1301 חלק א׳ סעיף 2). ‼ ברירת המחדל בחוק היא חישוב מאוחד;
   * נפרד מותר רק בתנאים, והרשות מחילה את הזול מבין השניים למי שזכאי — אין «בחירה» חופשית.
   * none = אין מקור הכנסה משותף; dependentMet = יש, ושלושת התנאים מתקיימים; dependentNotMet = יש, ולא מתקיימים.
   */
  spouseSource?: 'none' | 'dependentMet' | 'dependentNotMet';
  /** בעל שליטה / בעל מניות מהותי — ההיבט האישי. מה שמסומן כאן לא מחושב: מוצג «ידני» עם הסיבה. */
  controlling?: { person: Person; company?: string; withdrawals?: boolean; loans?: boolean; attribution62a?: boolean; companyRent?: boolean; companyCar?: boolean }[];
  vat: AuthorityReading;
  payments: Payment[];
  savings: SavingsPlan[];
  reconciliations: Reconciliation[];
  decisions: OfficeDecision[];
  /** מהערכת המשרד — הערה חופשית שנשמרת עם הגרסה. */
  note?: string;
}

/** רכיב שאינו מחושב — עם הסיבה. מוצג במקום מספר. */
export interface NotComputed { why: string; ruleId?: string }

export type Amount = { value: number; basis: 'computed' | 'officeDecision' | 'illustrative' } | NotComputed;
export const isNum = (a: Amount | undefined): a is { value: number; basis: 'computed' | 'officeDecision' | 'illustrative' } => !!a && 'value' in a;

export interface PersonResult {
  person: Person;
  salary: number;
  businessBooks: number;
  adjustments: number;
  businessTaxable: number;
  rent: number;
  capital: number;
  other: number;
  incomeTax: number;
  creditPoints: number;
  surtax: number;
  salaryWithheld: number;
  /** דמי ב״ל ובריאות על ההכנסה מעסק (עצמאי). ‼ 16.10.2026: בסיס אחרי ניכוי הפנסיה (345); המעמד — מהכרטיס. */
  niSelfEmployed: Amount;
  /** דמי ב״ל ובריאות על הכנסה שלא מעבודה (שכירות חייבת — 059; עסק של «עצמאי שאינו עונה להגדרה»). נוסף 16.10.2026. */
  niNonWork?: Amount;
  /** הפירוק ללאומי ולבריאות של כל דמי הביטוח של האדם (עצמאי + שלא מעבודה) — רק הלאומי מותר בניכוי 52% (47א). */
  niSplit?: { ni: number; health: number };
  /** המעמד בב״ל שעליו נשען החישוב — ומאיפה נלקח. */
  niStatus?: string;
  /** פנסיה לעצמאי כפי שחושבה (selfEmployedPension): מסלול, ניכוי, בסיס לזיכוי, וחלופה לעמית מוטב. */
  pension?: { track: 'A' | 'B'; deduction: number; creditBase: number; extraCreditBase: number; beneficial: boolean; alternative?: { track: 'A' | 'B'; deduction: number; creditBase: number; extraCreditBase: number } };
  /** ממה מורכב המס — לפירוט בסיכום ללקוח (נוסף 13.10.2026; בגרסאות ישנות חסר). */
  breakdown?: { taxable: number; deductions: number; niDeduction: number; creditPointsValue: number; donationCredit: number; pensionCredit: number; lifeCredit: number; surtax: number; capitalTax: number; lines: string[] };
  /** מס הכנסה לא חושב לאדם הזה (והסכומים שלו אינם 0) — הסיבה. */
  notComputed?: string;
}

/** מקדמה אחת: רשות × אדם. */
export interface AuthorityAdvance {
  authority: 'it' | 'ni';
  person: Person;
  method: 'turnoverRate' | 'fixed' | 'monthly' | 'none' | 'unknown';
  /** שיעור (%) או סכום — לפי השיטה. */
  current?: number;
  recommended?: number;
  unit: '%' | '₪ לחודש' | '₪ לתקופה';
  /** מה המקדמה הזו אמורה לכסות לשנה (מ״ה: מס שנובע מהעסק פחות ניכוי מלקוחות; ב״ל: דמי הביטוח). */
  annualDue: Amount;
  paidPast: number;
  paidFuture: number;
  futureAtCurrent: number;
  futureAtRecommended: number;
  /** היתרה למקדמה הזו: מה שנשאר אחרי ששולם ובמקדמה מהתקופה הבאה. */
  balanceAtCurrent: Amount;
  balanceAtRecommended: Amount;
  /** השלמה חד־פעמית לתקופות שעברו — רק מרשומה מאושרת. */
  catchUp: Amount;
  catchUpLines?: { period: string; due: number; paid: number; diff: number }[];
  interestLinkage: Amount;
  fine: Amount;
  belowChangeThreshold?: boolean;
  schedule: { period: string; current: number; recommended: number }[];
  /** ב״ל: הפירוק ללאומי ולבריאות (נוסף 16.10.2026). */
  split?: { ni: number; health: number };
  /** 21.10.2026 · ב״ל: ההצהרה שרשומה היום ברשימת ההכנסות — ממנה נגזרת המקדמה של היום. */
  registered?: string;
  /** 21.10.2026 · איפה משנים — גיא מגיש בעצמו באתר הרשות; PIVO לא משנה מקדמות. */
  whereToChange?: string;
  /** החישוב במספרים — לבדיקה ידנית. */
  explain: string[];
  /**
   * 14.10.2026 · מה עוד יחול אם משנים את המקדמה — ארבע שורות נפרדות, אף פעם לא מאוחדות (research/advances-topup-charges §ד):
   * הפרש, הצמדה, ריבית, קנס. לכל שורה מעמד: מחושב / אומדן / צפוי — לא אושר ברשות / הסבר בלבד. אומדן אינו חוב.
   */
  changeCharges?: ChargeLine[];
}

export interface ChargeLine {
  kind: 'difference' | 'linkage' | 'interest' | 'fine';
  status: 'computed' | 'estimate' | 'expected' | 'explain';
  /** בשקלים — רק כשהמעמד «מחושב». */
  amount?: number;
  text: string;
}

/** משק הבית כולו מול מס הכנסה: חבות, ניכויים ומקדמות של שני בני הזוג. */
export interface HouseholdIt {
  annualLiability: number;
  withheldAnnual: number;
  advancesPaid: number;
  futureAtCurrent: number;
  futureAtRecommended: number;
  balanceAtCurrent: number;
  balanceAtRecommended: number;
  catchUpApproved: number;
  /** חלק מהחבות לא חושב (ראו partial) — הסכומים אינם הסיכום המלא. */
  partial: boolean;
  /** חסרים נתוני הכנסה (בפועל / תחזית / מחזור) — הסכומים אינם תוצאה, והמסך מציג «חסר» ולא 0. */
  incomplete: boolean;
  explain: string[];
}

export interface SavingsResult {
  person: Person;
  studyFundMaxDeduction: Amount;
  studyFundPlanned: number;
  pensionPlanned: number;
  /** השפעת השלמת קרן ההשתלמות עד התקרה: הפקדה נוספת וחיסכון משוער במס. */
  studyFundTopUp?: { extraDeposit: number; taxSaving: number };
  pensionNote: string;
}

export interface Blocker { code: string; text: string; ruleId?: string }

/**
 * תשלום צפוי בתזרים — לכל רשות ואדם. ‼ אומדן: המועד לפי כלל רשמי כשיש (dateBasis 'rule'),
 * אחרת לפי דרישת הרשות או לא ידוע — לא ממציאים תאריך.
 */
export interface CashflowItem {
  authority: 'it' | 'ni';
  person: Person;
  kind: 'advance' | 'catchUp' | 'yearEnd';
  /** YYYY-MM של התקופה שהתשלום משלם (מקדמה). */
  period?: string;
  /** YYYY-MM-DD. undefined = אין מועד ידוע מראש. */
  date?: string;
  dateBasis: 'rule' | 'authorityDemand' | 'unknown';
  /** בשיעור / במקדמה הנוכחיים, ולפי ההמלצה. */
  current: number;
  recommended: number;
  note?: string;
}

/**
 * מצב היישור מול רשות — מאיפה הגיעו המספרים. ‼ «הלקוח מסר» אינו יישור מול הרשות; גם מספר שהוזן
 * בלי תאריך בדיקה אינו קריאה. רק קריאה מהרשות (אוטומציה, או המשרד מול המסך/מסמך עם תאריך) נחשבת.
 */
export interface AuthorityAlignment {
  authority: 'it' | 'ni' | 'vat';
  person: Person;
  state: 'readFromAuthority' | 'officeEntered' | 'clientStated' | 'notRead';
  readOn?: string;
  via?: string;
  hasEvidence: boolean;
  /** פערים שנמצאו בקריאה: תקופות בלי נתון, חיוב בלי תשלום וכו׳ — חסר, לא 0. */
  gaps: string[];
  text: string;
}

/**
 * «מה בדקנו» — כל בדיקת מיצוי שבוצעה בפועל, גם כשלא נמצא חיסכון. ‼ בדיקה שלא בוצעה (חסר מידע,
 * לא נתמכת) מוצגת כך, ולא כ«נבדק». חיסכון = הפרש מחושב באותו מנוע, עם אותם נתונים.
 */
export interface OptimizationCheck {
  id: string;
  title: string;
  person?: Person;
  /** notCompared — ההשוואה טרם בוצעה (אין שני מספרים); compared — חושב בשתי הדרכים, מוצג מה חל; undecided — חושב, ההכרעה תלויה בשאלה פתוחה; checked — עובדה שהחישוב נשען עליה נבדקה (למשל מצב משפחתי בשנת המס). */
  status: 'saving' | 'noSaving' | 'notApplicable' | 'missingData' | 'notSupported' | 'notCompared' | 'compared' | 'undecided' | 'checked';
  detail: string;
  /** חיסכון משוער במס הכנסה לשנה, כשנמצא. */
  saving?: number;
  /** הפעולה שנדרשת כדי לממש (הפקדה, בחירת מסלול…) — המלצה, לא ביצוע. */
  action?: string;
  /** נושא בידע המס להסבר. */
  topicId?: string;
  ruleIds?: string[];
}

export interface EstimateOutputs {
  taxYear: number;
  cutoffMonth: number;
  persons: PersonResult[];
  household: HouseholdIt;
  advances: AuthorityAdvance[];
  /** עסק זעיר — לכל שורה במסלול. */
  micro: MicroLineResult[];
  savings: SavingsResult[];
  /** חוסם אישור: חסר נתון, תחזית לא אושרה, יישור פתוח, כלל לא מוכרע. */
  blockers: Blocker[];
  /** חלק שהחישוב לא תומך בו — מוצג כחסר, והסיכום הכולל מסומן «חלקי». */
  partial: Blocker[];
  limits: string[];
  /**
   * 14.10.2026 · שאלה מקצועית שלא הוכרעה ומשפיעה על הסכום — בניסוח ללקוח. נכנסת לסיכום, לקובץ ולדף האישי:
   * תרחיש פתוח לא מוצג כתוצאה סופית. impact — בכמה הסכום עשוי להשתנות (כשידוע); lower = המס עשוי להיות נמוך יותר.
   */
  openQuestions?: { id: string; text: string; impact?: number; direction?: 'lower' | 'higher' }[];
  /** לוח תשלומים צפוי מכאן ועד סוף השנה (נוסף 13.10.2026 — בגרסאות ישנות חסר). */
  cashflow?: CashflowItem[];
  /** מצב הקריאה מול כל רשות (נוסף 13.10.2026). */
  alignment?: AuthorityAlignment[];
  /** «מה בדקנו» — בדיקות מיצוי והחלופות (נוסף 13.10.2026). */
  checks?: OptimizationCheck[];
  /** בני זוג: נפרד מול מאוחד (spouseCalc.ts). household — מס משק הבית לפי החישוב שיחול; חסר כשלא הוכרע. */
  spouseCalc?: { applies: 'separate' | 'joint' | 'undecided'; separate: number | null; jointLow: number; jointHigh: number; household?: number; open: string[] };
  usedRules: { ruleId: string; basis: string; taxYear: number }[];
  rulesetVersion: string;
  nextAction: string;
}

export interface EstimateVersion {
  id: string;
  requestId: string;
  clientId: string;
  taxYear: number;
  version: number;
  /** מספר העדכון של הטיוטה — «מה ראיתי» בשמירה (עריכה במקביל לא דורסת). */
  revision: number;
  status: 'draft' | 'approved' | 'superseded';
  draft: EstimateDraft;
  outputs?: EstimateOutputs;
  /** עובדות שנכנסו — מזהה וערך ברגע החישוב (לזיהוי «הנתונים השתנו מאז»). */
  inputFacts: { id: string; value: unknown }[];
  approvedAt?: string;
  approvedBy?: string;
  /** פורסם בדף האישי של הלקוח (232) — אותה גרסה, לא עותק. */
  publishedAt?: string;
  createdAt: string;
  updatedAt?: string;
}

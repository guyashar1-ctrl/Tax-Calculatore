// ─── שנת מס: עובדות, ראיות ופריטי איסוף (שלב 2) ─────────────────────────────
// ‼ מאגר אחד לשנת מס, שהערכת המס והדוח השנתי קוראים ממנו. אבל «משותף» אינו
// «מספיק לשנה כולה»: עובדה נשמרת עם התקופה שלה, ונתון עד ספטמבר אינו נתון שנתי.
// ‼ ריק ≠ אפס ≠ «לא» ≠ «לא רלוונטי»: חסר = אין שורה; שלושת האחרים הם תשובות.
// ‼ מסמך שהתקבל אינו מידע שאושר: קבלה → חילוץ → בדיקת התאמה → אישור משרד.

/** ‼ 'wealth' (230) — הכנה להצהרת הון: עובדות «נכון ליום ההצהרה», לא לשנה.
 *  ‼ 'intake' (236) — קליטה והשלמת תיק המס: פרטים מתמשכים ומסמכים «נכון ליום הקליטה», לא לשנה ולא
 *  ליום הצהרה. מה שאושר בה נכנס לכרטיס רק דרך הצעה (tax_fact_changes) — לא בכתיבה ישירה. */
export type Purpose = 'estimate' | 'annual' | 'wealth' | 'intake';

/** האדם — תפקיד, לא זהות. `couple` = עובדה של משק הבית (למשל מצב משפחתי בסוף השנה). */
export type SubjectRole = 'client' | 'spouse' | 'couple';

/** ישות שהעובדה עליה. אינה «אדם»: הבעלות עליה נקבעת בכרטיס. */
export type EntityKind =
  | 'employer' | 'business' | 'property' | 'account' | 'foreign_source'
  | 'fund' | 'child' | 'transaction' | 'company' | 'asset';

export type PeriodKind = 'year' | 'months' | 'as_of' | 'transaction' | 'carry_forward';

/** תשובה. «חסר» אינו כאן — חסר = אין עובדה. */
export type FactAnswer = 'value' | 'zero' | 'no' | 'not_applicable';

export type FactBasis =
  | 'actual'          // בפועל, לתקופה שבעובדה
  | 'actual_to_date'  // בפועל עד חודש החתך — לא שנה מלאה
  | 'forecast'        // תחזית — לעולם לא מחליפה בפועל
  | 'final'           // סופי לשנה (106, 867, אישור שנתי)
  | 'declared'        // דווח בלי אסמכתה (כולל מעבר מהכרטיס)
  | 'derived';        // חושב מעובדות אחרות

export type FactSource =
  | 'portal' | 'office' | 'document' | 'import' | 'automation'
  | 'card_migration' | 'legacy_questionnaire';

export type FactStatus = 'pending' | 'accepted' | 'rejected' | 'superseded';

/** «הלקוח אישר שאין שינוי» — הצהרת לקוח, לא אישור מקצועי. המשרד מאשר במרוכז. */
export type ClientAssertion = 'unchanged' | 'changed';

export interface YearFact {
  id: string;
  clientId: string;
  taxYear: number;
  itemKey: string;
  subjectRole: SubjectRole;
  entityKind?: EntityKind;
  entityRef?: string;
  periodKind: PeriodKind;
  periodFrom?: string;   // YYYY-MM-DD
  periodTo?: string;
  answer: FactAnswer;
  value?: unknown;       // רק כש-answer='value'
  basis: FactBasis;
  forecastBy?: 'client' | 'office';
  assumption?: string;
  isOneOff?: boolean;
  source: FactSource;
  clientAssertion?: ClientAssertion;
  /** העובדה שהלקוח אישר שלא השתנתה (או מפתח הכרטיס, כשאושר נתון מתמשך). */
  confirmsFactId?: string;
  confirmsCardKey?: string;
  requestId?: string;
  evidenceId?: string;
  /** השאלה שהלקוח ענה עליה (tax_year_facts.ask_id) — למשל כדי להחזיר אותה לתיקון. */
  askId?: string;
  status: FactStatus;
  decidedBy?: string;
  decidedAt?: string;
  supersedes?: string;
  note?: string;
  createdAt: string;
  /** 258 · שורת מקור: מפתח השורה במסמך (למשל ‎106.gross‎) ומי הזין אותה במשרד. */
  lineKey?: string;
  enteredBy?: string;
}

/** סוגי מסמך שהאיסוף מכיר. */
export type DocKind =
  | 'form106' | 'payslipToDate' | 'form867' | 'fundAnnualCert' | 'niAnnualCert' | 'niMaternityNotice'
  | 'annualPnl' | 'pnlToDate' | 'depreciationReport' | 'assetInvoices'
  | 'rentalContract' | 'donationReceipts' | 'saleContract' | 'purchaseDocs'
  | 'shevachAssessment' | 'foreignStatement' | 'prevAssessment' | 'degreeCert'
  // עסק זעיר: רישום וסוג תיק (צילום מהאזור האישי / שע״ם), אישור תיאום מס
  | 'microRegistration' | 'taxCoordination'
  // הצהרת הון (230) — אישורים «נכון ליום ההצהרה»
  | 'bankBalanceCert' | 'fundWealthCert' | 'securitiesCost' | 'cryptoStatement' | 'realEstateDocs' | 'loanDocs'
  | 'liabilityBalanceCert' | 'vehicleDocs' | 'valuablesList' | 'businessBalance' | 'prevWealthDeclaration' | 'demandLetter'
  // ני״ע בחו״ל (12.10.2026): דוח עסקאות ברמת המנה, אישור מס זר
  | 'foreignTradeReport' | 'foreignTaxCert'
  // קליטה והשלמת תיק המס (236)
  | 'idCard' | 'settlementCert' | 'creditCerts' | 'specialStatusCert' | 'businessCert' | 'allowanceCert' | 'insuranceCert'
  | 'authorityLetter' | 'bankAccountCert'
  // שדות נספחים שאין להם מסמך כללי מספיק (12.10.2026, מפת הכיסוי)
  | 'inventoryCount' | 'payrollReport' | 'badDebtDocs' | 'vehicleLicense' | 'partnershipAgreement' | 'premisesLease' | 'priorDepreciation'
  | 'businessUseDocs' | 'keyMoneyContract' | 'ownRentDocs' | 'otherPropertyDocs' | 'foreignWorkDocs' | 'foreignLease' | 'foreignCompanyStatements'
  | 'saleExpenseDocs' | 'specialDealDocs'
  // 19.10.2026 · אירוע משפחתי בשנת הדוח (פטירה, גירושין) וכספים בגלל פטירה
  | 'deathDocs' | 'severanceDocs' | 'insurancePayout' | 'divorceDocs' | 'marriageDocs'
  | 'other';

/** ארבעה שלבים נפרדים בחיי מסמך. פריט אינו «הושלם» כי הועלה קובץ. */
export interface Evidence {
  id: string;
  clientId: string;
  taxYear?: number;
  docKind: DocKind;
  subjectRole: SubjectRole;
  entityKind?: EntityKind;
  entityRef?: string;
  periodFrom?: string;
  periodTo?: string;
  documentId?: string;
  fileName?: string;
  receivedAt: string;
  receivedVia: 'portal' | 'office' | 'automation';
  /** חילוץ: אין חילוץ אוטומטי לסוג הזה → המשרד מזין. */
  extraction: 'not_supported' | 'pending' | 'extracted' | 'office_entered';
  /** התאמה ללקוח ולתקופה. */
  identityMatch: 'match' | 'mismatch' | 'unchecked';
  periodMatch: 'match' | 'mismatch' | 'unchecked';
  review: 'needs_review' | 'accepted' | 'rejected';
  /** השאלה שהקובץ הועלה אליה (tax_evidence.ask_id). */
  askId?: string;
  reviewedBy?: string;
  reviewedAt?: string;
  note?: string;
}

/** פריט ששואלים בבקשת «השלמת מידע». הטקסט ללקוח נשמר כצילום ברגע היצירה. */
export interface InfoAsk {
  id: string;
  clientId: string;
  taxYear: number;
  /** בקשת־הבת «השלמת מידע». */
  stepId: string;
  /** הבקשה הראשית (הערכה / דוח). */
  parentStepId: string;
  itemKey: string;
  subjectRole: SubjectRole;
  entityKind?: EntityKind;
  entityRef?: string;
  periodFrom?: string;
  periodTo?: string;
  /** מה הלקוח רואה — צילום, לא נגזר מחדש. */
  prompt: AskPrompt;
  state: 'draft' | 'published' | 'answered' | 'unavailable' | 'cancelled';
  answeredFactIds?: string[];
  evidenceIds?: string[];
  /** מסמך שטרם זמין: הסיבה ומועד המעקב, לפי סוג המסמך והשנה. */
  unavailable?: { reason: string; followUpOn: string; recordedAt: string; code?: UnavailableCode };
  savedDraft?: unknown;
  createdAt: string;
  answeredAt?: string;
}

/**
 * ‼ 13.10.2026 · למה אין מסמך עכשיו — שלוש משמעויות, לא «אין לי עדיין» אחד:
 *   later — יש לי, אעלה בהמשך · notYet — עוד לא קיבלתי (המעסיק / הבנק טרם הפיק) · needHelp — אין לי, צריך עזרה.
 *   ‼ «לא רלוונטי» אינו כאן: זו טענה שהמשרד בודק (נשמרת כתשובה עם הערה), לא מסמך שחסר.
 *   ‼ שורה ישנה בלי code — «אין לי עדיין» שמשמעותו לא ידועה. לא ממירים אותה.
 */
export type UnavailableCode = 'later' | 'notYet' | 'needHelp';

export type RecordSchemaId = 'children' | 'address' | 'bank' | 'employer' | 'property' | 'account' | 'fund' | 'business' | 'foreign' | 'vehicle' | 'partners' | 'period'
  // 16.10.2026 · דמי לידה: תקופת הזכאות (שני תאריכים) והסכומים מהאישור השנתי
  | 'maternityPeriod' | 'maternityAmounts' | 'familyYear'
  // 19.10.2026 · אירוע משפחתי בשנת הדוח — תאריך ועוד שתיים-שלוש בחירות, במסך אחד
  | 'deathEvent' | 'divorceEvent' | 'marriageEvent';

/**
 * 16.10.2026 · קלט מובנה «של מי / איפה» (שלב 2 של «בקשה אחת לתיק המס»): כל שדה סגור — מי (אני / בן/בת הזוג /
 * שנינו), איפה (רשימה מ-src/data/institutions.ts, עם חיפוש), בחירה; `name` — שם המעסיק/העסק, השדה החופשי היחיד.
 * השרת מאמת ש«איפה» מתוך הרשימה (_tax_institutions, 253).
 */
export type EntityFieldType = 'who' | 'list' | 'name' | 'choice';
export interface EntityField {
  key: string;
  label: string;
  type: EntityFieldType;
  /** לרשימה סגורה: איזו רשימה. */
  list?: import('../../data/institutions').InstitutionListId;
  options?: { value: string; label: string }[];
  required?: boolean;
  hint?: string;
}
export interface EntitySpec {
  /** מעסיק · חשבון · קופה */
  noun: string;
  fields: EntityField[];
  /** כמה כאלה («＋ עוד מעסיק»). */
  multiple?: boolean;
  addLabel?: string;
}
/** אריח במסך «סמנו מה יש לכם» — שאלת פתיחה אחת; `followUp` — השאלה שנפתחת כשמסמנים (צילום, נשמר בשאלה). */
export interface MultiOption {
  key: string;
  role: SubjectRole;
  label: string;
  hint?: string;
  followUp?: MultiFollowUp;
  /**
   * 19.10.2026 · כמה שאלות שנפתחות יחד כשמסמנים (למשל «בן/בת הזוג נפטר/ה» ⇒ תאריך, מה התקבל, קצבאות שאירים, מסמכים).
   * כל אחת צילום, כמו followUp. השרת (262) פותח את כולן; followUp נשאר לתאימות.
   */
  followUps?: MultiFollowUp[];
  /**
   * 19.10.2026 · מסומן מראש: היה בדוח של שנה שעברה (אושר במשרד) או שהאירוע כבר בכרטיס. הלקוח יכול לבטל.
   * note — השורה הקטנה מתחת לשם האריח («ב-2024: מינהלת הגמלאות · דפנה»).
   */
  preset?: boolean;
  note?: string;
}
export interface MultiFollowUp { itemKey: string; subjectRole: SubjectRole; entityKind?: EntityKind; entityRef?: string; prompt: AskPrompt }

export type AskInput =
  | { kind: 'yesno'; followUp?: AskInput }
  /** 16.10.2026 · מסך רשת: שאלה אחת שתשובתה קבוצת מפתחות; השרת שומר כן/לא לכל מפתח, ופותח את שאלות ההמשך של מה שסומן. */
  | { kind: 'multi'; options: MultiOption[] }
  /** 16.10.2026 · של מי / איפה — רשימות סגורות. `context` — שמות בני הזוג (בדף האישי אין כרטיס). */
  | { kind: 'entity'; spec: EntitySpec; context?: Record<string, string>; initial?: Record<string, string>[] }
  | { kind: 'amount' }
  | { kind: 'date' }
  | { kind: 'text' }
  | { kind: 'choice'; options: { value: string; label: string }[] }
  /** `edit` — 13.10.2026: «משהו השתנה» נפתח כרשומה מובנית עם מה שבתיק (ילדים, מעסיקים, חשבון בנק…), לא כתיבה חופשית. */
  | { kind: 'confirm'; lines: string[]; edit?: { schema: RecordSchemaId; initial?: Record<string, unknown>[]; context?: Record<string, string> } }
  /** לזוג: «מי מכם?» — התשובה נשמרת כעובדה לכל אחד מבני הזוג. */
  | { kind: 'who'; clientName: string; spouseName: string }
  | { kind: 'file'; docKind: DocKind }
  /**
   * 13.10.2026 · רשומה מובנית (ילדים, חשבון בנק, מעסיק, נכס…) — שדות נפרדים, לא תיבת טקסט אחת.
   * `initial` = מה שבתיק, לאישור או לתיקון (לא שאלה מאפס). `context` — מילים לשאלה (למשל שנת המס).
   */
  | { kind: 'record'; schema: RecordSchemaId; initial?: Record<string, unknown>[]; context?: Record<string, string> };

export interface AskPrompt {
  title: string;      // הכותרת ללקוח, עם הנושא כשזה בן/בת הזוג
  why: string;        // «למה שואלים?»
  /** 13.10.2026 · הסבר קצר וגלוי מתחת לשאלה: למה הכוונה, ודוגמאות מוכרות. «למה שואלים» נשאר הרחבה. */
  hint?: string;
  /** על איזו תקופה שואלים — «בשנת 2025» / «ביום 31.12.2025». מוצג ליד השאלה. */
  periodText?: string;
  input: AskInput;
  subjectName?: string;
  /** גרסת התבנית שממנה נבנתה השאלה (CATALOG_VERSION) — מה שנשלח, לא מה שקיים היום. */
  templateVersion?: string;
  /** שאלה שהמשרד החזיר לתיקון: מה לתקן, במילים של המשרד. מוצג ללקוח מעל השאלה. */
  correction?: string;
  /** 19.10.2026 · סדר בתוך קבוצת שאלות שנפתחו יחד (שאלות ההמשך של אריח) — screens.ts › sortAsks. */
  order?: number;
}

/** בקשה ראשית לשנה — מה שהמסך צריך לדעת עליה. */
export interface YearRequest {
  stepId: string;
  clientId: string;
  purpose: Purpose;
  taxYear: number;
  status: 'open' | 'done' | 'cancelled';
  /** הערכה: עד איזה חודש נתוני אמת (1 עד 12). */
  cutoffMonth?: number;
  /** קישור לסשן השאלון הישן לאותה שנה — כדי לא לפתוח מסלול כפול. */
  legacySessionId?: string;
  infoStepId?: string;
  createdAt: string;
}

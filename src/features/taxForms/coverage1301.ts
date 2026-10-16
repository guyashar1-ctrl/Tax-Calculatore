// ─── מפת כיסוי — כל שדות 1301 לשנת 2025 מול התיק ───────────────────────────
// שני צירים נפרדים לכל שדה ותיבת סימון:
//   קריאה:  mapped (מופה במלואו ב-form1301.ts) · catalogued (נקרא מהטופס, עם הוראה
//           מהמדריך) · noInstruction (נקרא; במדריך אין הוראה לשדה) · uncertain (הקריאה לא ודאית).
//   בתיק:   inFile (יש בכרטיס נתון שמתאים ישירות, או נגזר לשנה) · partialInFile (יש
//           נתון קרוב — מצב עדכני, שנה בלי תאריך, אומדן במקום סכום, כן/לא בלי סכום)
//           · missingInFile (אין מקום בתיק — מסמך, תשובת לקוח או נתון שנתי) · office
//           (ממולא בהגשה: חתימות, פרטי המייצג, קודי שידור, סיכומים מחושבים)
//           · notChecked (לא סווג — הקריאה לא ודאית).
// ‼ «partialInFile» אינו «מוכן»: הוא נקודת התחלה שמחייבת אימות לשנה.
// ‼ הקטלוג נקרא מהטופס עצמו (גרסה מונגשת + רגילה) ומפרק ד במדריך, 10.10.2026.

import catalogJson from './data/form1301-2025.catalog.json';
import annexJson from './data/annexes-2025.catalog.json';
import annexInfoJson from './data/annex-info-2025.json';
import { FIELDS_1301_2025 } from './form1301';

export interface CatalogEntry {
  id: string;
  part: string;
  section: string | null;
  codes: { registered?: string | null; spouse?: string | null } | null;
  label: string;
  kind: string;
  instruction?: string | null;
  documents?: string[];
  guidePage?: number | null;
  uncertain?: boolean;
  onlineOnly?: boolean;
  officeUse?: boolean;
}

export type ReadState = 'mapped' | 'catalogued' | 'noInstruction' | 'uncertain';
export type FileState = 'inFile' | 'partialInFile' | 'missingInFile' | 'office' | 'notChecked';

export interface CoverageRow {
  entry: CatalogEntry;
  read: ReadState;
  file: FileState;
  /** שדות בכרטיס שהם נקודת ההתחלה, ומה חסר בהם. */
  fileKeys: string[];
  fileNote: string;
}

const catalog = catalogJson as unknown as { source: unknown; parts: { part: string; title: string }[]; fields: CatalogEntry[]; notReadOrUncertain: string[] };
export const CATALOG_1301_2025 = catalog.fields;
export const CATALOG_PARTS_1301_2025 = catalog.parts;
export const CATALOG_UNCERTAIN_NOTES = catalog.notReadOrUncertain;

const codeOf = (e: CatalogEntry) => [e.codes?.registered, e.codes?.spouse].filter(Boolean).join('/');
// ‼ אותו קוד יכול לשמש כמה תתי-שדות (181/182: קוד התואר, שנת סיום, שנת התמחות) — לכן התאמה לפי קוד וסוג.
const kindGroup = (k: string) => (k === 'code' || k === 'choice' || k === 'checkbox' || k === 'yesno' ? 'choice' : k);
const MAPPED = new Set(FIELDS_1301_2025.map(f => `${[f.codes.registered, f.codes.spouse].filter(Boolean).join('/')}|${kindGroup(f.kind)}`));

type Link = { file: FileState; keys: string[]; note: string };
const L = (file: FileState, keys: string[], note: string): Link => ({ file, keys, note });
const P = (keys: string[], note: string) => L('partialInFile', keys, note);
const IN = (keys: string[], note: string) => L('inFile', keys, note);

/** קישורים מפורשים לפי מזהה בקטלוג (F###). כל השאר — לפי הכללים ב-classify. */
const LINKS: Record<string, Link> = {
  F001: P(['familyStatus', 'marriageYear', 'divorceYear', 'widowhoodYear', 'spouseClientId'], 'המצב בשנת המס — נגזר מהמצב ומשנת האירוע בכרטיס (נישואין, גירושין, פטירה). שנה חסרה ⇒ «לא ידוע»; שנת האירוע עצמה ⇒ לבדיקה; בשנת הנישואין — לפי הצהרת בני הזוג (5329)'),
  F002: P(['familyStatus', 'marriageYear', 'divorceYear', 'widowhoodYear'], 'המצב בשנת המס — נגזר מהמצב ומשנת האירוע בכרטיס (נישואין, גירושין, פטירה). שנה חסרה ⇒ «לא ידוע»; שנת האירוע עצמה ⇒ לבדיקה'),
  F005: P(['spouseWorking', 'spouseIncome'], 'מצב עדכני של בן/בת הזוג'),
  F010: P(['businesses', 'incomeTaxFileType'], 'אין בכרטיס בחירה במסלול עסק זעיר; המעמד במע״מ אינו מעיד על המסלול. 87ד(ג) — אין נתיב מקוון ידוע; טיפול ידני (פתוח)'),
  F011: P(['businesses', 'incomeTaxFileType'], 'אין בכרטיס בחירה במסלול עסק זעיר; המעמד במע״מ אינו מעיד על המסלול'),
  F012: P(['isNewImmigrant', 'isReturningResident'], 'כן/לא עדכני'),
  F013: P(['aliyahYear', 'returningYear'], 'שנה בלבד — הטופס דורש תאריך'),
  F014: P(['spouse'], 'פרטי עלייה של בן/בת הזוג — לא נשמרים בנפרד'),
  F015: P(['hasForeignAssets', 'foreignAccounts'], 'יש נכסים בחו״ל — בלי שווי ליום הקובע'),
  F016: L('office', [], 'נגזר מהחישוב'),
  F017: P(['hasInvestments', 'investmentAccounts'], 'אין מחזור מכירות'),
  F018: P(['isFamilyCompanyMember', 'familyCompanyName'], 'חברה משפחתית — לא בהכרח «חברת מעטים» לפי 62א'),
  F021: P(['hasCrypto'], 'כן/לא בלבד'),
  F022: P(['disabilityPercentage', 'disabilityType'], 'נכות עדכנית — לאמת לשנה ולסעיף'),
  F023: P(['disabilityPercentage', 'disabilityType'], 'נכות עדכנית — לאמת לשנה ולסעיף'),
  F034: P(['isKibbutzMember', 'kibbutzName'], 'חברות עדכנית'),
  F035: P(['kibbutzName'], 'אין מספר תיק הקיבוץ'),
  F040: P(['isForeignControllingShareholder', 'foreignCompanyDetails'], 'מצב עדכני'),
  F041: P(['isForeignControllingShareholder', 'foreignCompanyDetails'], 'מצב עדכני'),
  F042: P(['hasRelatedPartyTransactionsAbroad'], 'כן/לא עדכני'),
  F048: P(['bookStatus'], 'מצב ספרים עדכני'),
  F050: P(['vatStatus', 'dealerType'], 'סוג עוסק עדכני'),
  F054: L('office', ['businesses'], 'נגזר מהמחזור (6111 מעל הסף)'),
  F055: P(['taxFiles'], 'תיקים ברשויות — לאמת מספר תיק מ״ה'),
  F057: IN(['idNumber'], ''), F058: IN(['lastName'], ''), F059: IN(['firstName'], ''),
  F061: IN(['birthDate'], ''),
  F062: IN(['spouseIdNumber'], ''), F063: IN(['spouseLastName'], ''), F064: IN(['spouseFirstName'], ''),
  F066: P(['spouseBirthYear'], 'שנת לידה בלבד — הטופס דורש תאריך'),
  F067: P(['familyStatus', 'marriageYear', 'divorceYear', 'widowhoodYear'], 'המצב בשנת המס — נגזר מהמצב ומשנת האירוע בכרטיס (נישואין, גירושין, פטירה). שנה חסרה ⇒ «לא ידוע»; שנת האירוע עצמה ⇒ לבדיקה'),
  F069: P(['address', 'city', 'zipCode'], 'כתובת עדכנית'),
  F072: IN(['email'], ''), F073: IN(['landlinePhone'], ''), F076: IN(['phone'], ''),
  F079: P(['businessDescription'], 'תיאור עסק — לא בהכרח «עיסוק עיקרי»'),
  F080: IN(['businessName'], ''),
  F082: P(['taxFiles'], 'תיקים ברשויות'), F083: P(['taxFiles'], 'תיקים ברשויות'), F084: P(['taxFiles', 'vatFileType'], 'תיקים ברשויות'),
  F085: P(['employers'], 'רשימת מעבידים עדכנית — לאמת לשנת המס'),
  F086: P(['spouse'], 'פרטי עיסוק בן/בת הזוג — חלקי'), F092: P(['spouse'], 'מעבידי בן/בת הזוג — חלקי'),
  F093: P(['bankAccounts'], 'חשבון בכרטיס; שיוך הקודים 277/278 לא ודאי'), F094: P(['bankAccounts'], 'כנ״ל'), F095: P(['bankAccounts'], 'כנ״ל'), F096: P(['bankAccounts'], 'כנ״ל'),
  F108: P(['businesses'], 'רשימת עסקים — הסכום מנספח א׳ (1320)'),
  F111: P(['employers'], 'מעבידים — הסכום מטופס 106'),
  F117: P(['hasRentalIncome', 'rentalIncomeAnnual', 'properties'], 'אומדן שנתי — הסכום מנספח ב׳ (1321)'),
  F123: P(['dividendInterestAnnual', 'investmentAccounts'], 'אומדן — הסכום מ-867'),
  F128: P(['isSubstantialShareholder', 'dividendInterestAnnual'], 'אומדן — הסכום מ-867'),
  F134: P(['rentalTaxTrack', 'rentalIncomeAnnual'], 'מסלול ואומדן — לאמת לשנה'),
  F136: P(['gamblingIncomeAnnual', 'gamblingTaxWithheldAtSource'], 'אומדן'),
  F153: P(['hasInvestments', 'capitalGainsAnnual'], 'אומדן — הנספחים 1322/1399י'),
  F155: P(['capitalGainsAnnual'], 'אומדן — הנספחים'),
  F156: P(['hasForeignIncome', 'foreignIncomeAnnual', 'foreignTaxPaid'], 'אומדן — נספח ד׳ (1324)'),
  F157: P(['disabilityPercentage'], 'נכות עדכנית; הסכום חסר'),
  F158: P(['rentalTaxTrack'], 'מסלול פטור — הסכום חסר'),
  F181: P(['hasDisabilityInsurance', 'disabilityInsuranceAnnual'], 'סכום שנתי משוער — לאמת מאישור'),
  F183: P(['krenHashtalmutSE'], 'סכום עדכני — לאמת מאישור שנתי'),
  F185: P(['selfEmployedPensionAmount'], 'סכום עדכני — לאמת מאישור שנתי'),
  F193: L('missingInFile', [], 'תושבות — לא נשמרת בכרטיס'),
  F230: P(['familyStatus', 'children'], 'מצב עדכני'),
  F234: P(['children'], 'ילד עם מוגבלות — מסומן בכרטיס; אסמכתה 116א/127'),
  F235: P(['aliyahYear'], 'שנה בלבד'), F236: P(['spouse'], 'חלקי'),
  F237: P(['returningYear', 'isReturningResidentVeteran'], 'שנה בלבד'),
  F238: P(['completedIdf', 'idfReleaseYear', 'completedNationalService', 'nationalServiceYear'], 'שנה בלבד — הטופס דורש תאריך'),
  F239: L('missingInFile', ['completedIdf'], 'חודשי שירות — לא נשמרים'),
  F240: P(['hasAcademicDegree', 'academicDegreeType'], 'סוג תואר — הקוד לפי טופס 119'),
  F241: P(['academicDegreeYear'], 'שנת סיום'),
  F243: P(['hasLifeInsurance', 'lifeInsuranceAnnual'], 'אומדן — לאמת מאישור'),
  F246: P(['selfEmployedPensionAmount'], 'הפיצול בין 53 ל-76 — הכרעת המשרד'),
  F247: P(['dependentRelatives'], 'חלקי'),
  F248: P(['donationsAnnual'], 'אומדן — לאמת מקבלות'),
  F253: P(['qualifyingSettlementId'], 'יישוב — בלי הכנסה שהופקה באילת'),
  F254: P(['qualifyingSettlementId'], 'יישוב עדכני — בלי תקופות'),
  F255: P(['qualifyingSettlementId'], 'אין תאריכי תושבות'), F256: P(['qualifyingSettlementId'], 'אין תאריכי תושבות'),
  F262: P(['employers'], 'מעבידים — הסכום מטופס 106'),
};
// ילדים לפי גיל (F196 עד F229): נגזרים לשנת המס מתאריכי הלידה בכרטיס.
for (let n = 196; n <= 229; n++) LINKS[`F${n}`] = n <= 225
  ? IN(['children'], 'נגזר מתאריכי הלידה לשנת המס; חלוקה בין בני הזוג — לפי מסלול ההורה')
  : L('missingInFile', ['children'], 'בקשת דחייה (116ד) — לא נשמרת');

const OFFICE_PARTS = new Set(['לשימוש המשדר', 'משרד', 'מסייע', 'הצהרה']);

function classify(e: CatalogEntry): Link {
  const explicit = LINKS[e.id];
  if (explicit) return explicit;
  if (e.uncertain) return L('notChecked', [], 'הקריאה לא ודאית — לא סווג');
  if (e.officeUse || OFFICE_PARTS.has(e.part) || OFFICE_PARTS.has(e.section ?? '')) return L('office', [], 'ממולא בהגשה');
  if (e.documents?.length) return L('missingInFile', [], `נדרש: ${e.documents.join(', ')}`);
  return L('missingInFile', [], e.kind === 'checkbox' || e.kind === 'yesno' ? 'שאלה ללקוח או למשרד' : 'נתון שנתי — אין מקום בתיק');
}

export function coverage1301(): CoverageRow[] {
  return CATALOG_1301_2025.map(entry => {
    const link = classify(entry);
    const code = codeOf(entry);
    const read: ReadState = code && MAPPED.has(`${code}|${kindGroup(entry.kind)}`) ? 'mapped' : entry.uncertain ? 'uncertain' : entry.instruction ? 'catalogued' : 'noInstruction';
    return { entry, read, file: link.file, fileKeys: link.keys, fileNote: link.note };
  });
}

export function coverageSummary(rows: readonly CoverageRow[]) {
  const by = <K extends string>(get: (r: CoverageRow) => K) => rows.reduce((a, r) => { const k = get(r); a[k] = (a[k] ?? 0) + 1; return a; }, {} as Partial<Record<K, number>>);
  return { total: rows.length, read: by(r => r.read), file: by(r => r.file) };
}

// ── נספחים — ברמת הנספח (השדות קוטלגו; הקישור לתיק — ברמת הנספח) ─────────
export interface AnnexCatalog { formId: string; title: string; documentVersion?: string; readStatus: string; requiredWhen?: string; fields: unknown[]; checkboxes?: number; linksTo1301?: { annexField: string; goesTo1301Code: string }[] }
export const ANNEX_CATALOG_2025 = (annexJson as unknown as { annexes: AnnexCatalog[] }).annexes;

export const ANNEX_FILE_LINKS: Record<string, Link> = {
  '1320': P(['businesses'], 'רשימת עסקים — אין דוח רווח והפסד מובנה בתיק'),
  '1321': P(['properties', 'rentalIncomeAnnual', 'rentalExpenses'], 'נכסים ואומדנים — לא לפי שנה'),
  '1322': P(['investmentAccounts', 'capitalGainsAnnual'], 'חשבונות ואומדן — הנתונים מ-867'),
  '1324': P(['foreignAccounts', 'foreignIncomeAnnual', 'foreignTaxPaid'], 'אומדנים'),
  '1399י': P(['hasCrypto'], 'כן/לא בלבד — עסקאות חסרות'),
  '1344': L('missingInFile', [], 'יתרות הפסדים — לא נשמרות'),
  '1342': L('missingInFile', [], 'טבלת פחת — לא נשמרת'),
  '1343': L('missingInFile', [], 'לא נשמר'),
  '134': P(['employers'], 'מעבידים — סכומי 134 חסרים'),
  '119': P(['hasAcademicDegree', 'academicDegreeType', 'academicDegreeYear'], 'פרטי תואר — אישור מוסד חסר'),
  '116ד': L('missingInFile', ['children'], 'בקשת דחייה — לא נשמרת'),
};

// ── מידע לאיסוף לכל נספח (שכבה 2: מיפוי למידע בתיק) ────────────────────────
// ‼ שלוש שכבות נפרדות: קטלוג השדות (מה הטופס שואל) · המידע שהמשרד צריך לאסוף
// ולאן בתיק הוא שייך · יכולת מילוי (ציור/שידור) — שלב 4, לא קיימת היום.
export type InfoPeriod = 'taxYear' | 'asOfDate' | 'perTransaction' | 'perAsset' | 'cumulative';
export interface AnnexInfoItem {
  key: string; label: string; annexFields: string[];
  source: 'fileFact' | 'document' | 'client' | 'calculation' | 'office';
  documents: string[]; fileKeys: string[];
  fileState: Exclude<FileState, 'notChecked'>; period: InfoPeriod; note: string;
}
export interface AnnexInfo { formId: string; repeatsPer: string; repeatsNote?: string; items: AnnexInfoItem[] }
const annexInfo = annexInfoJson as unknown as { annexes: AnnexInfo[]; gaps: string[] };
export const ANNEX_INFO_2025 = annexInfo.annexes;
export const ANNEX_INFO_GAPS = annexInfo.gaps;
/** יכולת מילוי בפועל — אין עדיין לשום טופס מס הכנסה (שלב 4). */
/**
 * קודים ש-PIVO ממלא בטיוטת 1301 (שלב 4 — src/features/annualReturn/engine.ts), ומאיפה. ציר שלישי, נפרד מ«נקרא»
 * ומ«בתיק»: «ממולא בטיוטה» אינו «מוכן להגשה» — הדוח מאושר רק בלי פערים, בסקירת משרד. ‼ לעדכן יחד עם המנוע
 * (הבדיקה ב-annualReturn/__tests__ משווה).
 */
export const DRAFT_FILL_1301: Record<string, string> = {
  '158': 'משכורת — ברוטו מ-106', '172': 'משכורת — ברוטו מ-106 (בן/בת זוג)', '042': 'מס שנוכה ממשכורת — 106',
  '150': 'עסק — רווח או 30% מהמחזור (זעיר)', '170': 'עסק — בן/בת זוג', '238': 'מחזור ללא מע״מ', '239': 'מחזור — בן/בת זוג',
  'F010': 'סימון «בעל עסק זעיר» (דוח מלא עם 30%)', '030': 'דמי ב״ל ששולמו כעצמאי', '089': 'דמי ב״ל — בן/בת זוג',
  '135': 'פנסיה כעצמאי — כל הסכום ששולם (רשות המסים מפצלת לניכוי ולזיכוי)', '180': 'כנ״ל — בן/בת זוג',
  '136': 'קרן השתלמות כעצמאי', '137': 'כנ״ל — בן/בת זוג', '036': 'ביטוח חיים (הזיכוי — השלמה מקצועית)', '081': 'כנ״ל — בן/בת זוג',
  '037': 'תרומות סעיף 46', '237': 'כנ״ל — בן/בת זוג', '040': 'ניכוי במקור מלקוחות', '332': 'שכר דירה פטור', '284': 'שכר דירה 10%',
  '242': 'ריבית 25% (הכרעת משרד)', '241': 'דיבידנד 25% (הכרעת משרד)', '043': 'ניכוי במקור משוק ההון — 867',
  '244': 'הכנסה מבוטחת — 106', '245': 'כנ״ל — בן/בת זוג', '045': 'הפקדות העובד לקצבה — 106', '086': 'כנ״ל — בן/בת זוג',
  '248': 'הפקדות המעביד לקצבה כולל פיצויים — 106', '249': 'כנ״ל — בן/בת זוג', '218': 'משכורת לקרן השתלמות — 106', '219': 'כנ״ל — בן/בת זוג',
  '233': 'עמית מוטב שבחר מסלול א׳', '234': 'כנ״ל — בן/בת זוג',
};
/** מה PIVO מפיק: 1301 — גיליון עבודה + קובץ לפי מבנה רשות המסים 2025 (נבדק מקומית, לא משודר); 1320 — מהספרים;
 *  1321 — מסלול 10% בלבד; שאר הנספחים — לא (הדוח «גיליון חלקי»). ‼ אין PDF רשמי למילוי לאף טופס 2025. */
export const FILL_CAPABILITY: Record<string, 'none' | 'draft'> = Object.fromEntries([...ANNEX_CATALOG_2025.map(a => a.formId), '1301']
  .map(id => [id, id === '1301' || id === '1320' || id === '1321' ? 'draft' as const : 'none' as const]));
export const SOURCE_LABEL_HE: Record<AnnexInfoItem['source'], string> = { fileFact: 'נתון בתיק', document: 'מסמך', client: 'תשובת הלקוח', calculation: 'חישוב', office: 'המשרד' };
export const PERIOD_LABEL: Record<InfoPeriod, string> = { taxYear: 'לשנת המס', asOfDate: 'ליום מסוים', perTransaction: 'לכל עסקה', perAsset: 'לכל נכס', cumulative: 'מצטבר משנים קודמות' };

export const READ_LABEL: Record<ReadState, string> = { mapped: 'מופה במלואו', catalogued: 'נקרא, עם הוראה', noInstruction: 'נקרא, בלי הוראה במדריך', uncertain: 'הקריאה לא ודאית' };
export const FILE_LABEL: Record<FileState, string> = { inFile: 'בתיק', partialInFile: 'חלקי בתיק', missingInFile: 'חסר בתיק', office: 'ממולא בהגשה', notChecked: 'לא נבדק' };

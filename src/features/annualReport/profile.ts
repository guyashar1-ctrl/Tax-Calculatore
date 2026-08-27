// ─── פרופיל המס — נגזרות מכרטיס הלקוח ────────────────────────────────────────
// "הפרופיל הוא המוצר": הקובץ הזה מרכז את הלוגיקה שהופכת את כרטיס הלקוח
// לפרופיל מס קריא — בלוקים לתצוגה + רשימת המסמכים הקבועה שנדרשת כל שנה.

import type { Client, TaxFileInfo, TaxFileOwner } from '../../types';
import type { TaxpayerModel, AnnualReportSession, IncomeSourceKind } from './types';
import { FIELD_SOURCE_LABELS } from '../../types/clientWorkspace';

// ─── זריעת עובדות מהכרטיס לתוך מודל השאלון ──────────────────────────────────
// עובדות שנגזרות אוטומטית מהכרטיס ולא נשאלות בכלל (למשל ישוב מזכה — לפי
// הכתובת). רץ בפתיחת תיק ובשחזור הסקירה השנתית; בטוח להריץ שוב (אידמפוטנטי).

// ─── בן הזוג הרשום — נגזר מתיק מס הכנסה בכרטיס (מקור האמת) ──────────────────

export interface RegisteredFileInfo {
  /** על שם מי מתנהל תיק מס הכנסה. */
  owner: 'client' | 'spouse' | 'joint';
  /** שם בן הזוג הרשום (הלקוח או בן/בת הזוג). */
  name: string;
  /** ת.ז. שעליה מתנהל התיק. */
  idNumber: string;
  fileNumber?: string;
  /**
   * השם נקבע בבקשת הייצוג כ**כוונה** וטרם נראה מול מ"ה. כל מקום שמציג את
   * בן הזוג הרשום מוסיף אז את `REGISTERED_UNVERIFIED_LABEL` — כדי שלא נסתמך
   * על נתון שלא נבדק. נסגר בשלב "הפרטים הוזנו בשע״ם" שבמרכז ביצוע הייצוג.
   */
  unverified: boolean;
}

/** תווית אחידה לבן זוג רשום שנקבע כוונתית ועדיין לא נראה מול מ"ה. */
export const REGISTERED_UNVERIFIED_LABEL = 'טרם אומת מול מ"ה';

/**
 * שדה "על שם מי התיק במס הכנסה" בכרטיס הוא המקור הקובע לבן הזוג הרשום.
 * מחזיר null כשאין תיק מ"ה מוגדר — ואז ההכרעה נופלת לשער הכיסוי.
 */
export function registeredFileInfo(client: Client): RegisteredFileInfo | null {
  const file = (client.taxFiles ?? []).find((f) => f.authority === 'income_tax');
  if (!file) return null;
  const clientName = `${client.firstName} ${client.lastName}`.trim();
  const spouseName = client.spouseName?.trim()
    || (client.spouse ? `${client.spouse.firstName ?? ''} ${client.spouse.lastName ?? ''}`.trim() : '');
  const isSpouse = file.owner === 'spouse';
  return {
    owner: file.owner,
    name: isSpouse ? (spouseName || 'בן/בת הזוג') : clientName,
    idNumber: (isSpouse ? client.spouseIdNumber : client.idNumber) || file.fileNumber || '',
    fileNumber: file.fileNumber,
    unverified: !!client.registeredSpouseUnverified,
  };
}

export function clientDisplayName(client: Client): string {
  return `${client.firstName} ${client.lastName}`.trim() || 'הלקוח/ה';
}

export function spouseDisplayName(client: Client): string {
  return client.spouseName?.trim()
    || (client.spouse ? `${client.spouse.firstName ?? ''} ${client.spouse.lastName ?? ''}`.trim() : '')
    || 'בן/בת הזוג';
}

/**
 * המשפט שמסכם את ההכרעה: "מיכל סלע היא בת הזוג הרשומה במס הכנסה".
 *
 * ‼ מגדר רק כשהוא ידוע בפועל — מגדר הלקוח מהכרטיס, או `spouse.gender` כשיש
 * רשומת בן/בת זוג מלאה. לבן/בת זוג שנקלט/ה בבקשת ייצוג אין שדה מגדר, ושם
 * נשארת הצורה הכפולה: עדיף מאשר לנחש מגדר של אדם אמיתי לפי שם.
 */
export function registeredSpouseSentence(client: Client, owner: 'client' | 'spouse'): string {
  const name = owner === 'spouse' ? spouseDisplayName(client) : clientDisplayName(client);
  const gender = owner === 'spouse' ? client.spouse?.gender : client.gender;
  if (gender === 'female') return `${name} היא בת הזוג הרשומה במס הכנסה`;
  if (gender === 'male') return `${name} הוא בן הזוג הרשום במס הכנסה`;
  return `${name} - בן/בת הזוג הרשום/ה במס הכנסה`;
}

/** האם יש בכלל שני בני זוג שאפשר לבחור ביניהם. */
export function hasRegisteredSpouseChoice(client: Client): boolean {
  return client.familyStatus === 'married' || !!client.spouseName?.trim();
}

/**
 * תווית בעלים עם שם אמיתי במקום "ע"ש הלקוח/ה":
 * מס הכנסה — בעל התיק הוא בן הזוג הרשום ("דין · בן הזוג הרשום");
 * ביטוח לאומי — תיק אישי לכל אחד ("של גיא"), ו-joint משמש לתיק הניכויים.
 */
export function taxFileOwnerLabel(client: Client, authority: TaxFileInfo['authority'], owner: TaxFileOwner): string {
  const me = clientDisplayName(client);
  const sp = spouseDisplayName(client);
  const married = client.familyStatus === 'married' || !!client.spouseName?.trim();
  if (authority === 'national_insurance') {
    if (owner === 'joint') return 'עבור תיק הניכויים';
    return owner === 'spouse' ? sp : me;
  }
  if (owner === 'joint') return 'משותף';
  const name = owner === 'spouse' ? sp : me;
  if (authority === 'income_tax' && married) return `${name} · בן/בת הזוג הרשום/ה`;
  return name;
}

export function seedModelFromClient(model: TaxpayerModel, client: Client): TaxpayerModel {
  const pct = client.disabilityPercentage ?? 0;
  const band = pct >= 90 ? 'full' : pct >= 40 ? 'high' : pct > 0 ? 'low' : undefined;
  // בן הזוג הרשום מהכרטיס — רק אם טרם הוכרע בתיק השנה (הכרעה מפורשת גוברת)
  const regFile = registeredFileInfo(client);
  const seededRole = model.spouse.registeredRole
    ?? (regFile ? (regFile.owner === 'spouse' ? 'spouse_only' as const : 'me_only' as const) : undefined);
  return {
    ...model,
    identity: {
      ...model.identity,
      livesInQualifyingSettlement: !!client.qualifyingSettlementId,
      city: client.city || model.identity.city,
      // דרגת הנכות נגזרת מאחוז הנכות בכרטיס — השאלה מדולגת כשידוע
      disabilityBand: model.identity.disabilityBand ?? band,
    },
    spouse: {
      ...model.spouse,
      registeredRole: seededRole,
    },
  };
}

export interface ProfileRow {
  label: string;
  value: string;
  /** מפתח fieldMeta לשליפת "מאיפה אנחנו יודעים" (אופציונלי). */
  metaKey?: string;
  missing?: boolean;
}

export interface ProfileBlock {
  key: string;
  icon: string;
  title: string;
  rows: ProfileRow[];
}

const FAMILY_LABELS: Record<string, string> = {
  single: 'רווק/ה', married: 'נשוי/אה', divorced: 'גרוש/ה',
  widowed: 'אלמן/ה', singleParent: 'הורה יחיד',
};

function yesNo(v: boolean | undefined): string {
  return v ? 'כן' : 'לא';
}

export function buildProfileBlocks(client: Client, latestModel?: TaxpayerModel | null): ProfileBlock[] {
  const blocks: ProfileBlock[] = [];
  // מיזוג עם השאלון האחרון: מה שהלקוח ענה נחשב גם כשהכרטיס עוד לא פורט
  // (למשל ענה "שכיר" אבל שם המעסיק טרם הוזן) — כדי שהפרופיל לא יסתור את השאלון.
  const modelSources = latestModel?.income?.sources ?? [];
  const saysSalary = modelSources.includes('salary') || client.incomeTaxType === 'employee' || client.incomeTaxType === 'both';
  const saysBusiness = modelSources.includes('business');
  const saysRental = modelSources.includes('rental');
  const saysCapital = modelSources.includes('capital') || modelSources.includes('interest');
  const saysForeign = modelSources.includes('foreign');

  // ── זהות ומשפחה ──
  blocks.push({
    key: 'identity', icon: '👤', title: 'זהות ומשפחה',
    rows: [
      { label: 'מצב משפחתי', value: FAMILY_LABELS[client.familyStatus] ?? client.familyStatus, metaKey: 'familyStatus' },
      {
        label: 'ילדים',
        value: (client.children ?? []).length > 0
          ? (client.children ?? []).map((c) => `${c.firstName || 'ילד/ה'} (${c.birthYear || c.birthDate?.slice(0, 4) || '?'})`).join(', ')
          : 'אין',
        metaKey: 'children',
      },
      {
        label: 'תושבות',
        value: client.isNewImmigrant
          ? `עולה חדש/ה (${client.aliyahYear || '?'})`
          : client.isReturningResident
            ? `תושב/ת חוזר/ת (${client.returningYear || '?'})`
            : 'תושב/ת ישראל',
        metaKey: 'residency',
      },
      ...(client.disabilityPercentage > 0
        ? [{ label: 'נכות מוכרת', value: `${client.disabilityPercentage}%`, metaKey: 'disabilityPercentage' }]
        : []),
      ...(client.qualifyingSettlementId
        ? [{ label: 'יישוב מזכה', value: client.qualifyingSettlementId, metaKey: 'qualifyingSettlementId' }]
        : []),
      ...(client.hasAcademicDegree
        ? [{ label: 'תואר אקדמי', value: `${client.academicDegreeType || 'תואר'} (${client.academicDegreeYear || '?'})`, metaKey: 'hasAcademicDegree' }]
        : []),
      // תעסוקת בן/בת הזוג — מהכרטיס או מהשאלון
      ...(client.familyStatus === 'married'
        ? [{
            label: `תעסוקת ${spouseDisplayName(client)}`,
            value: latestModel?.spouse?.has106
              ? 'שכיר/ה (טופס 106)'
              : latestModel?.spouse?.hasBusinessIncome
                ? 'עצמאי/ת'
                : latestModel?.identity?.spouseHasIncome === false
                  ? 'ללא הכנסה'
                  : client.spouseWorking
                    ? 'עובד/ת'
                    : 'טרם נענה',
            metaKey: 'spouseWorking',
            missing: latestModel?.identity?.spouseHasIncome === undefined && !client.spouseWorking,
          }]
        : []),
    ],
  });

  // ── מקורות הכנסה ──
  const employers = client.employers ?? [];
  const businesses = client.businesses ?? [];
  const properties = client.properties ?? [];
  blocks.push({
    key: 'income', icon: '💼', title: 'מקורות הכנסה',
    rows: [
      {
        label: 'שכיר/ה',
        value: employers.length > 0
          ? employers.filter((e) => !e.endDate).map((e) => e.name).join(', ') || 'מעסיקים לשעבר בלבד'
          : saysSalary ? 'כן - שם המעסיק טרם הוזן' : 'לא',
        metaKey: 'employers',
        missing: employers.length === 0 && saysSalary,
      },
      {
        label: 'עסק עצמאי',
        value: businesses.length > 0
          ? businesses.map((b) => b.name).join(', ')
          : saysBusiness ? 'כן - פרטי העסק טרם הוזנו' : 'אין',
        metaKey: 'businesses',
        missing: businesses.length === 0 && saysBusiness,
      },
      {
        label: 'נדל"ן',
        value: client.hasResidentialProperty || properties.length > 0
          ? `${properties.length || client.numberOfProperties || 1} נכס/ים${properties.some((p) => p.isRented) ? ' (מושכר)' : ''}`
          : saysRental ? 'כן - פרטי הנכס טרם הוזנו' : 'אין',
        metaKey: 'properties',
        missing: properties.length === 0 && saysRental,
      },
      { label: 'שוק ההון', value: yesNo(client.hasCapitalIncome || (client.investmentAccounts ?? []).length > 0 || saysCapital), metaKey: 'hasCapitalIncome' },
      { label: 'הכנסות/נכסים בחו"ל', value: yesNo(client.hasForeignAssets || saysForeign), metaKey: 'hasForeignAssets' },
    ],
  });

  // ── קופות וחשבונות ──
  const banks = client.bankAccounts ?? [];
  const invest = client.investmentAccounts ?? [];
  const pensions = client.pensionFunds ?? [];
  blocks.push({
    key: 'accounts', icon: '🏦', title: 'קופות וחשבונות',
    rows: [
      {
        label: 'חשבונות בנק',
        value: banks.length > 0
          ? banks.map((b) => b.bankName).join(', ')
          : latestModel?.accounts?.bankNames?.trim() || 'לא הוזנו',
        missing: banks.length === 0 && !latestModel?.accounts?.bankNames?.trim(),
        metaKey: 'bankAccounts',
      },
      {
        label: 'חשבונות השקעה',
        value: invest.length > 0
          ? invest.map((a) => a.institutionName).join(', ')
          : latestModel?.accounts?.investmentInstitutions?.trim() || 'אין',
        metaKey: 'investmentAccounts',
      },
      { label: 'קופות פנסיה', value: pensions.length > 0 ? pensions.map((p) => p.institutionName).join(', ') : 'לא הוזנו', metaKey: 'pensionFunds' },
      ...(client.hasKrenHashtalmut ? [{ label: 'קרן השתלמות', value: 'כן', metaKey: 'hasKrenHashtalmut' }] : []),
    ],
  });

  // ── מצבים מיוחדים ──
  const special: ProfileRow[] = [];
  if (client.isFamilyCompanyMember) special.push({ label: 'חברה משפחתית', value: client.familyCompanyName || 'כן', metaKey: 'isFamilyCompanyMember' });
  if (client.isForeignControllingShareholder) special.push({ label: 'בעל שליטה בחברה זרה', value: 'כן', metaKey: 'isForeignControllingShareholder' });
  if (client.isKibbutzMember) special.push({ label: 'חבר/ת קיבוץ', value: client.kibbutzName || 'כן', metaKey: 'isKibbutzMember' });
  if (client.section14Elected) special.push({ label: 'סעיף 14', value: `מוחל (${client.section14StartYear || '?'})`, metaKey: 'section14Elected' });
  if (client.isSubstantialShareholder) special.push({ label: 'בעל מניות מהותי', value: 'כן', metaKey: 'isSubstantialShareholder' });
  if (special.length > 0) blocks.push({ key: 'special', icon: '⭐', title: 'מצבים מיוחדים', rows: special });

  return blocks;
}

// ─── מסמכים קבועים — מה מבקשים מהלקוח כל שנה ───────────────────────────────

export interface RecurringDoc {
  code: string;
  name: string;
  from: string;    // ממי משיגים
}

export function deriveRecurringDocs(client: Client): RecurringDoc[] {
  const docs: RecurringDoc[] = [];
  for (const e of (client.employers ?? []).filter((e) => !e.endDate)) {
    docs.push({ code: `106-${e.id}`, name: `טופס 106 - ${e.name}`, from: 'מהמעסיק' });
  }
  for (const b of client.businesses ?? []) {
    docs.push({ code: `pnl-${b.id}`, name: `דוח רווח-הפסד - ${b.name}`, from: 'הנהלת חשבונות' });
    docs.push({ code: `857-${b.id}`, name: `אישורי ניכוי במקור (857) - ${b.name}`, from: 'מלקוחות העסק' });
  }
  for (const a of (client.investmentAccounts ?? []).filter((a) => !a.isClosed)) {
    docs.push({ code: `867-${a.id}`, name: `טופס 867 - ${a.institutionName}`, from: 'מבית ההשקעות' });
  }
  for (const b of client.bankAccounts ?? []) {
    docs.push({ code: `867b-${b.id}`, name: `טופס 867 - ${b.bankName}`, from: 'מהבנק' });
  }
  for (const p of (client.pensionFunds ?? []).filter((p) => p.hasSelfDeposits)) {
    docs.push({ code: `pension-${p.id}`, name: `אישור הפקדות - ${p.institutionName}`, from: 'מהקופה' });
  }
  const rentedProps = (client.properties ?? []).filter((p) => p.isRented);
  for (const p of rentedProps) {
    docs.push({ code: `rent-${p.id}`, name: `חוזה שכירות - ${p.address || 'נכס'}`, from: 'מהלקוח' });
  }
  if ((client.donationsAnnual ?? 0) > 0) {
    docs.push({ code: 'donations', name: 'קבלות תרומות (סעיף 46)', from: 'מהלקוח' });
  }
  if (client.hasLifeInsurance) {
    docs.push({ code: 'life-ins', name: 'אישור שנתי ביטוח חיים', from: 'מחברת הביטוח' });
  }
  if (client.hasDisabilityInsurance) {
    docs.push({ code: 'ak-ins', name: 'אישור ביטוח אובדן כושר עבודה', from: 'מחברת הביטוח' });
  }
  return docs;
}

// ─── תווית מקור לשדה ─────────────────────────────────────────────────────────

export function provenanceLabel(client: Client, metaKey?: string): string | null {
  if (!metaKey) return null;
  const meta = client.fieldMeta?.[metaKey];
  if (!meta?.source) return null;
  const src = FIELD_SOURCE_LABELS[meta.source] ?? meta.source;
  const when = meta.syncedAt ? new Date(meta.syncedAt).toLocaleDateString('he-IL', { month: 'numeric', year: 'numeric' }) : '';
  return when ? `${src} · ${when}` : src;
}

// ─── תמונת מס — סיכום תיקי השנה של הלקוח לתצוגה בכרטיס ──────────────────────

export const SESSION_STATUS_META: Record<AnnualReportSession['status'], { label: string; color: string; bg: string }> = {
  in_progress: { label: 'באמצע השאלון', color: 'var(--chip-blue-tx)', bg: 'var(--chip-blue-bg)' },
  review:      { label: 'ממתין לבדיקה', color: 'var(--warn)', bg: 'var(--chip-amber-bg)' },
  mapping_done:{ label: 'מוכן להגשה', color: 'var(--ok)', bg: 'var(--chip-green-bg)' },
  archived:    { label: 'בארכיון', color: 'var(--tx2)', bg: 'var(--s2)' },
};

const SOURCE_LABELS: Record<IncomeSourceKind, string> = {
  salary: 'שכר', business: 'עסק', rental: 'שכירות', capital: 'שוק ההון',
  interest: 'ריבית', dividend: 'דיבידנד', pension: 'קצבאות', foreign: 'חו"ל', other: 'אחר',
};

export interface YearFileSummary {
  sessionId: string;
  taxYear: number;
  status: AnnualReportSession['status'];
  updatedAt: string;
  sourceLabels: string[];
  docsTotal: number;
  docsReceived: number;
  openUnknowns: number;
}

export function summarizeYearFile(session: AnnualReportSession): YearFileSummary {
  const m = session.model;
  const sources = (m.income?.sources ?? []).filter((s) => s !== 'interest'); // ריבית משתמעת משוק ההון
  const docStatuses = m.meta?.docStatuses ?? {};
  const docsList = Object.values(docStatuses);
  return {
    sessionId: session.id,
    taxYear: session.taxYear,
    status: session.status,
    updatedAt: session.updatedAt,
    sourceLabels: sources.map((s) => SOURCE_LABELS[s] ?? s),
    docsTotal: docsList.length,
    docsReceived: docsList.filter((s) => s === 'received').length,
    openUnknowns: (m.meta?.unknownQuestions ?? []).length,
  };
}

export interface TaxSnapshotAmount {
  label: string;
  value: string;
  year?: number;
}

/** סכומי מפתח שנאספו — מהכרטיס ומתיק השנה האחרון. */
export function buildKeyAmounts(client: Client, latest: AnnualReportSession | null): TaxSnapshotAmount[] {
  const out: TaxSnapshotAmount[] = [];
  const nis = (n: number) => `${Math.round(n).toLocaleString('he-IL')} ₪`;
  const m = latest?.model;
  const yr = latest?.taxYear;

  const salaryTotal = (client.employers ?? []).reduce((s, e) => s + (e.grossSalaryAnnual ?? 0), 0);
  if (salaryTotal > 0) out.push({ label: 'שכר ברוטו (106)', value: nis(salaryTotal) });

  if ((m?.income?.rentalGrossAnnual ?? 0) > 0) out.push({ label: 'שכר דירה שהתקבל', value: nis(m!.income!.rentalGrossAnnual!), year: yr });
  if ((m?.income?.rentPaidAnnual ?? 0) > 0) out.push({ label: 'שכר דירה ששולם', value: nis(m!.income!.rentPaidAnnual!), year: yr });

  const donations = client.donationsAnnual ?? m?.deductionsCredits?.donationAmount ?? 0;
  if (donations > 0) out.push({ label: 'תרומות', value: nis(donations) });

  const lifeIns = client.lifeInsuranceAnnual ?? m?.deductionsCredits?.lifeInsuranceAnnual ?? 0;
  if (lifeIns > 0) out.push({ label: 'ביטוח חיים', value: nis(lifeIns) });

  return out;
}

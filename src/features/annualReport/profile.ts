// ─── פרופיל המס — נגזרות מכרטיס הלקוח ────────────────────────────────────────
// "הפרופיל הוא המוצר": הקובץ הזה מרכז את הלוגיקה שהופכת את כרטיס הלקוח
// לפרופיל מס קריא — בלוקים לתצוגה + רשימת המסמכים הקבועה שנדרשת כל שנה.

import type { Client } from '../../types';
import type { TaxpayerModel, AnnualReportSession, IncomeSourceKind } from './types';
import { FIELD_SOURCE_LABELS } from '../../types/clientWorkspace';

// ─── זריעת עובדות מהכרטיס לתוך מודל השאלון ──────────────────────────────────
// עובדות שנגזרות אוטומטית מהכרטיס ולא נשאלות בכלל (למשל ישוב מזכה — לפי
// הכתובת). רץ בפתיחת תיק ובשחזור הסקירה השנתית; בטוח להריץ שוב (אידמפוטנטי).

export function seedModelFromClient(model: TaxpayerModel, client: Client): TaxpayerModel {
  const pct = client.disabilityPercentage ?? 0;
  const band = pct >= 90 ? 'full' : pct >= 40 ? 'high' : pct > 0 ? 'low' : undefined;
  return {
    ...model,
    identity: {
      ...model.identity,
      livesInQualifyingSettlement: !!client.qualifyingSettlementId,
      city: client.city || model.identity.city,
      // דרגת הנכות נגזרת מאחוז הנכות בכרטיס — השאלה מדולגת כשידוע
      disabilityBand: model.identity.disabilityBand ?? band,
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

export function buildProfileBlocks(client: Client): ProfileBlock[] {
  const blocks: ProfileBlock[] = [];

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
          : 'לא',
        metaKey: 'employers',
        missing: employers.length === 0 && client.incomeTaxType !== 'selfEmployed',
      },
      {
        label: 'עסק עצמאי',
        value: businesses.length > 0 ? businesses.map((b) => b.name).join(', ') : 'אין',
        metaKey: 'businesses',
      },
      {
        label: 'נדל"ן',
        value: client.hasResidentialProperty || properties.length > 0
          ? `${properties.length || client.numberOfProperties || 1} נכס/ים${properties.some((p) => p.isRented) ? ' (מושכר)' : ''}`
          : 'אין',
        metaKey: 'properties',
      },
      { label: 'שוק ההון', value: yesNo(client.hasCapitalIncome || (client.investmentAccounts ?? []).length > 0), metaKey: 'hasCapitalIncome' },
      { label: 'הכנסות/נכסים בחו"ל', value: yesNo(client.hasForeignAssets), metaKey: 'hasForeignAssets' },
    ],
  });

  // ── קופות וחשבונות ──
  const banks = client.bankAccounts ?? [];
  const invest = client.investmentAccounts ?? [];
  const pensions = client.pensionFunds ?? [];
  blocks.push({
    key: 'accounts', icon: '🏦', title: 'קופות וחשבונות',
    rows: [
      { label: 'חשבונות בנק', value: banks.length > 0 ? banks.map((b) => b.bankName).join(', ') : 'לא הוזנו', missing: banks.length === 0, metaKey: 'bankAccounts' },
      { label: 'חשבונות השקעה', value: invest.length > 0 ? invest.map((a) => a.institutionName).join(', ') : 'אין', metaKey: 'investmentAccounts' },
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
    docs.push({ code: `106-${e.id}`, name: `טופס 106 — ${e.name}`, from: 'מהמעסיק' });
  }
  for (const b of client.businesses ?? []) {
    docs.push({ code: `pnl-${b.id}`, name: `דוח רווח-הפסד — ${b.name}`, from: 'הנהלת חשבונות' });
    docs.push({ code: `857-${b.id}`, name: `אישורי ניכוי במקור (857) — ${b.name}`, from: 'מלקוחות העסק' });
  }
  for (const a of (client.investmentAccounts ?? []).filter((a) => !a.isClosed)) {
    docs.push({ code: `867-${a.id}`, name: `טופס 867 — ${a.institutionName}`, from: 'מבית ההשקעות' });
  }
  for (const b of client.bankAccounts ?? []) {
    docs.push({ code: `867b-${b.id}`, name: `טופס 867 — ${b.bankName}`, from: 'מהבנק' });
  }
  for (const p of (client.pensionFunds ?? []).filter((p) => p.hasSelfDeposits)) {
    docs.push({ code: `pension-${p.id}`, name: `אישור הפקדות — ${p.institutionName}`, from: 'מהקופה' });
  }
  const rentedProps = (client.properties ?? []).filter((p) => p.isRented);
  for (const p of rentedProps) {
    docs.push({ code: `rent-${p.id}`, name: `חוזה שכירות — ${p.address || 'נכס'}`, from: 'מהלקוח' });
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
  in_progress: { label: 'באמצע השאלון', color: '#1d4ed8', bg: '#dbeafe' },
  review:      { label: 'ממתין לבדיקה', color: '#b45309', bg: '#fef3c7' },
  mapping_done:{ label: 'מוכן להגשה', color: '#1F7A4D', bg: '#E8F3EC' },
  archived:    { label: 'בארכיון', color: '#6b7280', bg: '#f3f4f6' },
};

const SOURCE_LABELS: Record<IncomeSourceKind, string> = {
  salary: '💼 שכר', business: '🧾 עסק', rental: '🏠 שכירות', capital: '📈 שוק ההון',
  interest: '💰 ריבית', dividend: '📊 דיבידנד', pension: '🌅 קצבאות', foreign: '✈️ חו"ל', other: '⭐ אחר',
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

// ─── העברת סכומים שנתיים מהכרטיס לשנת מס, וחיבור השאלון הישן ──────────────────
// ‼ לסכומים שנתיים בכרטיס אין שנה. `field_meta.syncedAt` הוא מועד כתיבה, לא שנת
// מס. לכן שנה מוצעת רק כשיש ראיה תומכת שמוצגת: הסכום נכתב מהשאלון השנתי של שנה
// ידועה (tax_fact_changes.source_ref = מזהה הסשן), והערך בכרטיס לא השתנה מאז.
// בלי ראיה — «שנה לא ידועה»: בלי ניחוש, ובלי שימוש בחישוב (החלטת גיא 11.10.2026).
// ‼ הערך המקורי בכרטיס לא נמחק ולא משתנה. ההעברה נרשמת עם המקור וההיסטוריה.

import type { Client } from '../../types';
import type { TaxpayerModel } from '../annualReport/types';
import type { FactAnswer, SubjectRole, YearFact, EntityKind } from './types';

/** סכום שנתי בכרטיס → פריט בשנת המס. */
export interface CardAmountField {
  path: string;                 // 'donationsAnnual' | 'spouse.grossSalary' | 'employers[].grossSalaryAnnual'
  label: string;
  itemKey: string;
  subjectRole: SubjectRole;
  entityKind?: EntityKind;
}

export const CARD_ANNUAL_FIELDS: CardAmountField[] = [
  { path: 'donationsAnnual', label: 'תרומות שנתיות', itemKey: 'donations.amount', subjectRole: 'client' },
  { path: 'lifeInsuranceAnnual', label: 'ביטוח חיים', itemKey: 'savings.insuranceAmounts', subjectRole: 'client' },
  { path: 'disabilityInsuranceAnnual', label: 'ביטוח אובדן כושר עבודה', itemKey: 'savings.insuranceAmounts', subjectRole: 'client' },
  { path: 'rentalIncomeAnnual', label: 'שכר דירה שנתי', itemKey: 'rent.incomeTotal', subjectRole: 'couple' },
  { path: 'rentalExpenses', label: 'הוצאות השכרה', itemKey: 'rent.expenses', subjectRole: 'couple' },
  { path: 'capitalGainsAnnual', label: 'רווחי הון', itemKey: 'capital.totals', subjectRole: 'couple' },
  { path: 'dividendInterestAnnual', label: 'דיבידנד וריבית', itemKey: 'capital.totals', subjectRole: 'couple' },
  { path: 'foreignIncomeAnnual', label: 'הכנסות מחו״ל', itemKey: 'foreign.totals', subjectRole: 'couple' },
  { path: 'foreignTaxPaid', label: 'מס ששולם בחו״ל', itemKey: 'foreign.totals', subjectRole: 'couple' },
  { path: 'gamblingIncomeAnnual', label: 'זכיות והימורים', itemKey: 'special.gambling', subjectRole: 'client' },
  { path: 'otherIncome', label: 'הכנסה אחרת', itemKey: 'special.otherIncome', subjectRole: 'client' },
  { path: 'selfEmployedPensionAmount', label: 'הפקדה לפנסיה כעצמאי', itemKey: 'savings.selfAmounts', subjectRole: 'client' },
  { path: 'krenHashtalmutSE', label: 'הפקדה לקרן השתלמות כעצמאי', itemKey: 'savings.selfAmounts', subjectRole: 'client' },
  { path: 'reserveCombatDaysPrevYear', label: 'ימי מילואים קרביים (שנה קודמת)', itemKey: 'special.reserveCombatDays', subjectRole: 'client' },
  { path: 'spouseIncome', label: 'הכנסת בן/בת הזוג', itemKey: 'salary.spouseIncomeEstimate', subjectRole: 'spouse' },
  { path: 'spouse.selfEmployedPensionAmount', label: 'הפקדה לפנסיה כעצמאי — בן/בת הזוג', itemKey: 'savings.selfAmounts', subjectRole: 'spouse' },
  { path: 'spouse.krenHashtalmutSE', label: 'קרן השתלמות כעצמאי — בן/בת הזוג', itemKey: 'savings.selfAmounts', subjectRole: 'spouse' },
  { path: 'employers[].grossSalaryAnnual', label: 'משכורת שנתית', itemKey: 'salary.amounts', subjectRole: 'client', entityKind: 'employer' },
  { path: 'employers[].mandatoryTaxWithheld', label: 'מס שנוכה משכר', itemKey: 'salary.amounts', subjectRole: 'client', entityKind: 'employer' },
  { path: 'businesses[].revenueAnnual', label: 'מחזור שנתי', itemKey: 'business.profit', subjectRole: 'client', entityKind: 'business' },
  { path: 'businesses[].netIncome', label: 'רווח נקי', itemKey: 'business.profit', subjectRole: 'client', entityKind: 'business' },
  { path: 'investmentAccounts[].capitalGainsRealized', label: 'רווח הון בחשבון', itemKey: 'capital.amounts', subjectRole: 'couple', entityKind: 'account' },
  { path: 'investmentAccounts[].dividendIncome', label: 'דיבידנד בחשבון', itemKey: 'capital.amounts', subjectRole: 'couple', entityKind: 'account' },
  { path: 'investmentAccounts[].interestIncome', label: 'ריבית בחשבון', itemKey: 'capital.amounts', subjectRole: 'couple', entityKind: 'account' },
];

/** היסטוריית כתיבה של שדה (מ-tax_fact_changes), עם שנת המס של הסשן כשהמקור הוא שאלון. */
export interface FieldWrite {
  fieldKey: string;
  value: unknown;
  source: string;           // questionnaire | manual | import | …
  sessionTaxYear?: number;  // כש-source_ref הוא סשן של הדוח השנתי
  at: string;
}

export interface TransferProposal {
  /** זהות יציבה: הנתיב + מזהה הישות. */
  key: string;
  path: string;
  label: string;
  itemKey: string;
  subjectRole: SubjectRole;
  entityKind?: EntityKind;
  entityRef?: string;
  entityLabel?: string;
  /** הערך בכרטיס היום — נשמר כמו שהוא. */
  original: number;
  suggestedYear: number | null;
  /** הראיה לשנה המוצעת, כמחרוזת שמוצגת למשרד. null = אין ראיה. */
  evidence: string | null;
  /** קבוצה לאישור מרוכז: נתונים עם אותו בסיס (אותה שנה ואותה ראיה). */
  group: string;
}

const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : undefined);
const fmtDate = (iso: string) => `${iso.slice(8, 10)}.${iso.slice(5, 7)}.${iso.slice(0, 4)}`;

/** הצעות העברה לכרטיס. רק ערכים שאינם ריקים; 0 בלי ראיה אינו נתון (כרטיס נולד עם אפסים). */
export function proposeTransfers(c: Client, writes: FieldWrite[]): TransferProposal[] {
  const out: TransferProposal[] = [];
  const evidenceFor = (fieldKey: string, value: number): { year: number | null; text: string | null } => {
    const w = writes.filter(x => x.fieldKey === fieldKey).sort((a, b) => b.at.localeCompare(a.at))[0];
    if (!w) return { year: null, text: null };
    // הכתיבה האחרונה לשדה היא שקבעה את הערך בכרטיס; אם הערך שונה — מישהו שינה בלי שנה.
    if (num(w.value) !== value) return { year: null, text: null };
    if (w.source === 'questionnaire' && w.sessionTaxYear) return { year: w.sessionTaxYear, text: `נכתב מהשאלון השנתי לשנת ${w.sessionTaxYear} (${fmtDate(w.at)}), והערך לא השתנה מאז` };
    return { year: null, text: null };
  };
  const rec = c as unknown as Record<string, unknown>;
  for (const f of CARD_ANNUAL_FIELDS) {
    if (f.path.includes('[]')) {
      const [list, field] = f.path.split('[].');
      for (const row of (rec[list] as Record<string, unknown>[] | undefined) ?? []) {
        const v = num(row[field]);
        if (v === undefined || v === 0) continue;
        const ev = evidenceFor(`${list}.${String(row.id)}.${field}`, v);
        const subject: SubjectRole = row.belongsToSpouse ? 'spouse' : f.subjectRole;
        out.push({ key: `${f.path}:${String(row.id)}`, path: f.path, label: f.label, itemKey: f.itemKey, subjectRole: subject, entityKind: f.entityKind, entityRef: String(row.id),
          entityLabel: String(row.name ?? row.institutionName ?? ''), original: v, suggestedYear: ev.year, evidence: ev.text, group: ev.year ? `year:${ev.year}:questionnaire` : 'unknown' });
      }
      continue;
    }
    const v = f.path.startsWith('spouse.') ? num((c.spouse as unknown as Record<string, unknown> | undefined)?.[f.path.slice(7)]) : num(rec[f.path]);
    if (v === undefined || v === 0) continue;
    const ev = evidenceFor(f.path, v);
    out.push({ key: f.path, path: f.path, label: f.label, itemKey: f.itemKey, subjectRole: f.subjectRole, original: v, suggestedYear: ev.year, evidence: ev.text,
      group: ev.year ? `year:${ev.year}:questionnaire` : 'unknown' });
  }
  return out;
}

/** עובדה מהעברה שהמשרד אישר (האישור המרוכז הוא ההחלטה). השנה — רק זו שהמשרד אישר; בסיס «דווח». */
export function transferToFact(p: TransferProposal, taxYear: number, clientId: string): Omit<YearFact, 'id' | 'createdAt'> {
  return {
    clientId, taxYear, itemKey: p.itemKey, subjectRole: p.subjectRole, entityKind: p.entityKind, entityRef: p.entityRef,
    periodKind: 'year', periodFrom: `${taxYear}-01-01`, periodTo: `${taxYear}-12-31`,
    answer: 'value', value: { [p.path.replace('[].', '.')]: p.original }, basis: 'declared', source: 'card_migration',
    status: 'accepted', note: p.evidence ? `שנה לפי ראיה: ${p.evidence}` : 'שנה נקבעה במשרד',
  };
}

// ── השאלון הישן (קישור שכבר נשלח) → עובדות לשנת הסשן ──────────────────────────
// ‼ החלטת גיא 11.10.2026: קישורים ישנים ממשיכים לעבוד, והתשובות נשמרות ומתחברות
// לתיק ולשנה. מזהה המקור = מזהה הסשן + הפריט, ולכן קליטה חוזרת לא יוצרת כפילות.

export interface LegacyFact extends Omit<YearFact, 'id' | 'createdAt'> { sourceRef: string }

export function legacyModelToFacts(model: TaxpayerModel, session: { id: string; clientId: string; taxYear: number }): LegacyFact[] {
  const out: LegacyFact[] = [];
  const y = session.taxYear;
  const add = (itemKey: string, subjectRole: SubjectRole, answer: FactAnswer, value?: unknown) => out.push({
    clientId: session.clientId, taxYear: y, itemKey, subjectRole, periodKind: 'year', periodFrom: `${y}-01-01`, periodTo: `${y}-12-31`,
    answer, value, basis: 'declared', source: 'legacy_questionnaire', status: 'pending', sourceRef: `${session.id}:${itemKey}:${subjectRole}`,
    note: 'מהשאלון השנתי הקודם (קישור שנשלח לפני המעבר)',
  });
  const src = model.income?.sources ?? [];
  const yn = (key: string, v: boolean | undefined, role: SubjectRole = 'client') => { if (v !== undefined) add(key, role, v ? 'value' : 'no', v ? true : undefined); };
  if (model.income) {
    yn('salary.worked', src.includes('salary'));
    if (src.includes('rental')) add('rent.properties', 'couple', 'value', { fromLegacy: true });
    if ((model.income.rentalGrossAnnual ?? 0) > 0) add('rent.incomeTotal', 'couple', 'value', { rentalIncomeAnnual: model.income.rentalGrossAnnual });
  }
  const d = model.deductionsCredits;
  if (d) {
    if (d.donationAmount !== undefined) { yn('donations.given', d.donationAmount > 0); if (d.donationAmount > 0) add('donations.amount', 'client', 'value', d.donationAmount); }
    if (d.hasLifeInsurance !== undefined) yn('savings.insurance', d.hasLifeInsurance);
    if ((d.lifeInsuranceAnnual ?? 0) > 0) add('savings.insuranceAmounts', 'client', 'value', { lifeInsuranceAnnual: d.lifeInsuranceAnnual });
    if (d.hasSelfPensionDeposits !== undefined || d.hasKerenHashtalmutSelf !== undefined) yn('savings.selfDeposits', !!(d.hasSelfPensionDeposits || d.hasKerenHashtalmutSelf));
    if ((d.reserveCombatDaysPrevYear ?? 0) > 0) add('special.reserveCombatDays', 'client', 'value', d.reserveCombatDaysPrevYear);
  }
  return out;
}

/** מפתחות כרטיס שהשאלון הישן כתב ישירות לכרטיס — מעכשיו נכנסים לשנת הסשן ולא לכרטיס. */
export const LEGACY_ANNUAL_CARD_KEYS = new Set(['donationsAnnual', 'lifeInsuranceAnnual', 'gamblingIncomeAnnual', 'reserveCombatDaysPrevYear', 'rentalIncomeAnnual']);

// ── שאלון קליטה ישן: סבב חוזר (12.10.2026) ──────────────────────────────────
/**
 * טהור, נבדק: מה לרשום בסבב חוזר. זהה לתשובה האחרונה שנרשמה ⇒ לא נרשם; שונה ⇒ נרשם עם מזהה
 * מקור של הסבב (`<סשן>@<מועד>:<פריט>:<אדם>`), כדי שלא ייבלע ב-unique של הסבב הראשון.
 */
export function reconcileLegacyRound<F extends { itemKey: string; subjectRole: string; answer: string; value?: unknown; sourceRef: string }>(
  facts: F[], recorded: { item_key: string; subject_role: string; answer: string; value: unknown; source_ref: string }[], round: string,
): F[] {
  const same = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
  const out: F[] = [];
  for (const f of facts) {
    const prev = recorded.filter(r => r.item_key === f.itemKey && r.subject_role === f.subjectRole)
      .sort((a, b) => a.source_ref.localeCompare(b.source_ref)).pop();
    if (!prev) { out.push(f); continue; }
    if (prev.answer === f.answer && same(prev.value, f.value)) continue;
    const [sid, ...rest] = f.sourceRef.split(':');
    out.push({ ...f, sourceRef: `${sid}@${round}:${rest.join(':')}` });
  }
  return out;
}

/** טהור, נבדק: סשן שהושלם וטרם נקלט — או שהושלם שוב אחרי הקליטה האחרונה. */
export function sessionNeedsSync(completedAt: string | null | undefined, syncedAt: string | null | undefined): boolean {
  if (!completedAt) return false;
  if (!syncedAt) return true;
  return Date.parse(completedAt) > Date.parse(syncedAt);
}

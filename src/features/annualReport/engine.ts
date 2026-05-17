// ─── מנוע שאלון + מנוע מיפוי 1301 — מבוסס סכמת form1301Fields ──────────────

import type {
  QuestionNode,
  TaxpayerModel,
  AnswerValue,
  MappedField,
  Form1301FieldDef,
  SourceTrace,
  QuestionPreviewClient,
} from './types';
import { annualReportTree } from './tree';
import { form1301Fields } from './form1301Fields';
import { computeCoverage, buildDocumentChecklist } from './coverage';

// ─── מנוע שאלון ──────────────────────────────────────────────────────────

export function getQuestionById(id: string | null): QuestionNode | null {
  if (!id) return null;
  return annualReportTree.nodes[id] ?? null;
}

export function getRootQuestion(): QuestionNode {
  return annualReportTree.nodes[annualReportTree.rootNodeId];
}

export function applySingleAnswer(
  model: TaxpayerModel,
  questionId: string,
  answer: AnswerValue,
): TaxpayerModel {
  const node = annualReportTree.nodes[questionId];
  if (!node) return model;
  return node.applyToModel(model, answer);
}

export function formatAnswerForDisplay(
  questionId: string,
  value: AnswerValue,
): string {
  const node = annualReportTree.nodes[questionId];
  if (!node) return String(value);
  if (node.type === 'boolean') return value ? 'כן' : 'לא';
  if (node.type === 'single_select') {
    const opt = node.options?.find((o) => o.value === value);
    return opt?.label ?? String(value);
  }
  if (node.type === 'multi_select') {
    const arr = Array.isArray(value) ? value : [];
    if (arr.length === 0) return '—';
    return arr.map((v) => node.options?.find((o) => o.value === v)?.label ?? v).join(', ');
  }
  if (node.type === 'number') {
    const n = Number(value);
    if (!isFinite(n)) return String(value);
    return n.toLocaleString('he-IL');
  }
  if (node.type === 'text') {
    const s = String(value || '');
    return s || '—';
  }
  return String(value);
}

export function answerAndAdvance(
  model: TaxpayerModel,
  questionId: string,
  answer: AnswerValue,
): { model: TaxpayerModel; nextQuestionId: string | null } {
  const node = annualReportTree.nodes[questionId];
  if (!node) return { model, nextQuestionId: null };

  const updated = node.applyToModel(model, answer);
  let nextId = node.next(answer, updated);
  while (nextId) {
    const nextNode = annualReportTree.nodes[nextId];
    if (!nextNode) break;
    if (nextNode.visibleWhen && !nextNode.visibleWhen(updated)) {
      nextId = nextNode.next(undefined as unknown as AnswerValue, updated);
    } else {
      break;
    }
  }
  return { model: updated, nextQuestionId: nextId };
}

// ─── רשימת מסמכים נדרשים ──────────────────────────────────────────────────

/**
 * מקור הצוואה למסמך — קובע אצל מי צריך לבקש אותו.
 */
export type DocSource =
  | 'client'           // מהלקוח עצמו (אישורים, תעודות, חוזים)
  | 'employer'         // מהמעביד (106, אישור אופציות)
  | 'investment_house' // מבית ההשקעות / בנק (867)
  | 'authority_ni'     // מביטוח לאומי (דמי לידה, אבטלה, מילואים)
  | 'authority_tax'    // מרשות המסים (מקדמות, שומה, אישור מס)
  | 'self';            // רואה החשבון מכין (נספח א', 6111, הצהרת הון)

export const DOC_SOURCE_LABELS: Record<DocSource, string> = {
  client:           '📨 לבקש מהלקוח',
  employer:         '🏢 לבקש מהמעביד/ים',
  investment_house: '📈 לבקש מבית ההשקעות / בנק',
  authority_ni:     '🏛 לקבל מביטוח לאומי',
  authority_tax:    '🏛 לקבל מרשות המסים / שע"ם',
  self:             '🧮 לבנות (רואה החשבון)',
};

export interface RequiredDoc {
  code: string;
  name: string;
  reason: string;
  forFields?: string[];      // שדות בטופס שהמסמך מזין
  source: DocSource;          // מי האחראי לספק אותו
}

/**
 * הסקת מקור המסמך לפי קוד / שם — heuristic.
 */
export function inferDocSource(code: string, _name: string): DocSource {
  const c = code.toLowerCase();
  // טפסי מעביד
  if (c.startsWith('106') || c === 'options_102_cert') return 'employer';
  // טפסי בנק / בית השקעות
  if (c.startsWith('867')) return 'investment_house';
  // בט"ל
  if (c.startsWith('ni_') || c.includes('ni_maternity') || c.includes('ni_unemployment') || c.includes('ni_reserve') || c.includes('ni_work_injury')) return 'authority_ni';
  if (c === '161') return 'authority_ni';
  // רשות המסים
  if (c === 'advance_payments' || c === 'last_year_assessment' || c === '857_837_summary' || c === 'land_appraisal') return 'authority_tax';
  // רואה החשבון מכין
  if (c === '6111' || c === 'wealth_declaration' || c === 'biz_pnl' || c === 'annex_1320' || c === 'annex_1322' || c === 'annex_1324' || c === 'annex_1325' || c === '134' || c === 'family_company_decl' || c === 'cfc_decl') return 'self';
  // ברירת מחדל — מהלקוח
  return 'client';
}

export function buildRequiredDocs(model: TaxpayerModel, client?: QuestionPreviewClient): RequiredDoc[] {
  const docs = buildDocumentChecklist(model, client);
  return docs.map((d) => ({ ...d, source: inferDocSource(d.code, d.name) }));
}

// ─── נספחים נדרשים ───────────────────────────────────────────────────────

export interface RequiredAttachment {
  formNumber: string;
  name: string;
  reason: string;
}

export function buildRequiredAttachments(model: TaxpayerModel): RequiredAttachment[] {
  const out: RequiredAttachment[] = [];
  const src = model.income.sources;
  if (src.includes('business')) {
    out.push({ formNumber: 'נספח א\' (1320)', name: 'דוח הכנסות מעסק', reason: 'דרישה לכל בעל עסק/משלח יד' });
  }
  if (model.income.bizRevenueBand === '300k_plus') {
    out.push({ formNumber: '6111', name: 'מאזן ודוח רווח-הפסד מקודד', reason: 'חובה לעסקים עם מחזור מעל 300,000 ₪ (הוראות 2025)' });
  }
  if ((model.income.capitalSubTypes ?? []).length > 0) {
    out.push({ formNumber: 'נספח ג\' (1322)', name: 'פירוט רווחי הון', reason: 'דיווח רווחי הון מני"ע / קריפטו / מקרקעין' });
  }
  if (src.includes('foreign')) {
    out.push({ formNumber: 'נספח ד\' (1324)', name: 'דיווח הכנסות חו"ל', reason: 'הכנסות שהופקו מחוץ לישראל' });
  }
  if (model.income.foreignPaidTaxAbroad) {
    out.push({ formNumber: '1325', name: 'בקשה לזיכוי מס זר', reason: 'מס ששולם בחו"ל לזיכוי' });
  }
  if (model.income.receivedSeverance) {
    out.push({ formNumber: '134', name: 'בקשה לפריסת מענק פרישה', reason: 'אם נבחרה פריסה למספר שנות מס' });
  }
  if (model.specialSituations.hasCarriedLosses) {
    out.push({ formNumber: '1344', name: 'פירוט הפסדים מועברים', reason: 'יתרת ההפסד משנים קודמות' });
  }
  if (model.specialSituations.wealthDeclarationRequired) {
    out.push({ formNumber: 'הצהרת הון', name: 'טופס הצהרת הון', reason: 'לפי דרישת פקיד השומה' });
  }
  return out;
}

// ─── מיפוי ל-1301 — מהסכמה המרכזית ──────────────────────────────────────

function fmtValue(v: unknown): string | null {
  if (v === undefined || v === null || v === '') return null;
  if (typeof v === 'number') return Math.round(v).toLocaleString('he-IL');
  if (typeof v === 'boolean') return v ? 'כן' : 'לא';
  if (Array.isArray(v)) return v.length ? v.join(', ') : null;
  return String(v);
}

// שולף ערך מהמודל לפי modelPath ("a.b.c")
function getByPath(obj: unknown, path: string): unknown {
  const parts = path.split('.');
  let cur: unknown = obj;
  for (const p of parts) {
    if (cur && typeof cur === 'object' && p in (cur as Record<string, unknown>)) {
      cur = (cur as Record<string, unknown>)[p];
    } else {
      return undefined;
    }
  }
  return cur;
}

function fieldToMapped(field: Form1301FieldDef, model: TaxpayerModel): MappedField {
  const raw = getByPath(model, field.modelPath);
  const value = fmtValue(raw);

  let trace: SourceTrace;
  if (value !== null) {
    trace = {
      kind: 'questionnaire',
      detail: `מהשאלון: ${field.sourceQuestionIds.join(', ')}`,
      questionIds: field.sourceQuestionIds,
    };
  } else if (field.requiredDocuments.length > 0) {
    trace = {
      kind: 'document_pending',
      detail: `ממתין למסמכים: ${field.requiredDocuments.map((d) => d.name).join(', ')}`,
    };
  } else {
    trace = { kind: 'empty', detail: 'אין נתון' };
  }

  return {
    fieldNumber: field.fieldNumber,
    hebrewLabel: field.hebrewLabel,
    section: field.section,
    legalReference: field.legalReference,
    value,
    trace,
  };
}

export function mapModelToForm1301(model: TaxpayerModel): MappedField[] {
  const applicableFields = form1301Fields.filter((f) => {
    if (f.required === 'always') return true;
    if (f.conditionalOn) return f.conditionalOn(model);
    return false;
  });
  return applicableFields.map((f) => fieldToMapped(f, model));
}

// ─── סטטוס שדה עבור צביעה דינמית ב-UI (Wave ד') ────────────────────────────

/**
 * סטטוס של שדה ב-1301:
 * - 🟢 active: רלוונטי לפרופיל הלקוח. ייכנס לטופס.
 * - 🔴 pruned: נפסל אוטומטית ע"י תשובות השאלון (לא רלוונטי לפרופיל).
 * - 🟡 pending: השאלון עוד לא הגיע לשאלות שמכריעות לגבי השדה.
 */
export type FieldStatus = 'active' | 'pruned' | 'pending';

export interface FieldWithStatus {
  field: Form1301FieldDef;
  mapped: MappedField;
  status: FieldStatus;
}

function computeFieldStatus(
  field: Form1301FieldDef,
  model: TaxpayerModel,
  answeredQuestionIds: Set<string>,
): FieldStatus {
  if (field.required === 'always') return 'active';
  if (!field.conditionalOn) return 'active';

  // אם conditionalOn מחזיר true — יש מספיק במודל. active.
  if (field.conditionalOn(model)) return 'active';

  // false: pruned רק אם נענתה לפחות אחת מ-sourceQuestionIds של השדה.
  // אחרת — pending (השאלון עוד לא הגיע לנקודה שמכריעה לגביו).
  if (field.sourceQuestionIds.length === 0) return 'active';

  const anyAnswered = field.sourceQuestionIds.some((qid) => answeredQuestionIds.has(qid));
  return anyAnswered ? 'pruned' : 'pending';
}

/**
 * מחזיר את כל 44 השדות עם סטטוס וערך, לצורך צביעה דינמית בטאב "מיפוי".
 */
export function computeAllFieldStatuses(
  model: TaxpayerModel,
  answeredQuestionIds: Set<string>,
): FieldWithStatus[] {
  return form1301Fields.map((field) => ({
    field,
    mapped: fieldToMapped(field, model),
    status: computeFieldStatus(field, model, answeredQuestionIds),
  }));
}

// ─── חישוב מס שקוף (כמו קודם, ללא שינוי משמעותי) ───────────────────────

import { getTaxYearData } from '../../data/taxData';

export interface TransparentTaxStep {
  description: string;
  value: number;
}

export interface TransparentTaxResult {
  taxableIncomeEstimate: number;
  grossTax: number;
  creditFromPoints: number;
  donationCredit: number;
  lifeInsuranceCredit: number;
  netTax: number;
  steps: TransparentTaxStep[];
  warnings: string[];
}

export function computeTransparentTax(model: TaxpayerModel): TransparentTaxResult {
  const data = getTaxYearData(model.taxYear);
  const warnings: string[] = [];
  const steps: TransparentTaxStep[] = [];

  const salary = 0;
  const business = 0;
  const rentalRegular = (model.income.rentalTrack === 'regular') ? (model.income.rentalGrossAnnual ?? 0) : 0;
  const taxable = salary + business + rentalRegular;

  if (model.income.sources.includes('salary')) {
    warnings.push('הכנסת שכר תחושב לאחר העלאת טפסי 106 (פאזה הבאה).');
  }
  if (model.income.sources.includes('business')) {
    warnings.push('הכנסה מעסק תחושב לאחר העלאת נספח א\' / דוח רווח-הפסד.');
  }

  steps.push({ description: 'הכנסה משכ"ד רגיל (חייב במס שולי)', value: rentalRegular });
  steps.push({ description: 'סה"כ הכנסה חייבת (אומדן)', value: taxable });

  let grossTax = 0;
  if (data) {
    let remaining = taxable;
    let prev = 0;
    for (const b of data.incomeTaxBrackets) {
      const cap = b.upTo === Infinity ? remaining + prev : b.upTo;
      const slice = Math.max(0, Math.min(cap, taxable) - prev);
      if (slice > 0) grossTax += slice * (b.rate / 100);
      prev = cap;
      if (cap >= taxable) break;
      if (remaining <= 0) break;
    }
  }
  steps.push({ description: 'מס ברוטו לפי מדרגות', value: Math.round(grossTax) });

  let points = 2.25;
  if (model.identity.maritalStatus === 'married' && model.identity.spouseHasIncome === false) points += 1;
  if ((model.identity.childrenCount ?? 0) > 0) points += (model.identity.childrenCount ?? 0) * 1.5;
  if (model.deductionsCredits.isDischargedSoldier) points += 2;
  if (model.deductionsCredits.hasAcademicDegree) points += 1;
  const creditFromPoints = points * (data?.creditPointValue ?? 0);
  steps.push({ description: `נקודות זיכוי (אומדן ${points.toFixed(2)} × ${(data?.creditPointValue ?? 0).toLocaleString('he-IL')})`, value: Math.round(creditFromPoints) });

  const donation = model.deductionsCredits.donationAmount ?? 0;
  const donationCredit = donation >= 207 ? Math.min(donation, 0.30 * taxable, 10_354_816) * 0.35 : 0;
  if (donation > 0 && donation < 207) warnings.push('סכום התרומה נמוך מהמינימום לזיכוי (207 ₪ בשנת 2025).');
  steps.push({ description: 'זיכוי תרומות (35% עד תקרה)', value: Math.round(donationCredit) });

  const lifeIns = model.deductionsCredits.lifeInsuranceAnnual ?? 0;
  const lifeInsuranceCredit = lifeIns * 0.25;
  steps.push({ description: 'זיכוי ביטוח חיים (25%)', value: Math.round(lifeInsuranceCredit) });

  const netTax = Math.max(0, grossTax - creditFromPoints - donationCredit - lifeInsuranceCredit);
  steps.push({ description: 'מס נטו לתשלום (אומדן)', value: Math.round(netTax) });

  return {
    taxableIncomeEstimate: taxable,
    grossTax: Math.round(grossTax),
    creditFromPoints: Math.round(creditFromPoints),
    donationCredit: Math.round(donationCredit),
    lifeInsuranceCredit: Math.round(lifeInsuranceCredit),
    netTax: Math.round(netTax),
    steps,
    warnings,
  };
}

// ─── חישוב % כיסוי לסשן נתון ──────────────────────────────────────────

export function getCoverageForSession(model: TaxpayerModel, answeredQuestionIds: string[]) {
  return computeCoverage(model, answeredQuestionIds);
}

// re-export לנוחות מודולים אחרים
export { computeCoverage, buildDocumentChecklist };

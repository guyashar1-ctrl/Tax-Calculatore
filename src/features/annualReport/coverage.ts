// ─── מנוע כיסוי 1301 ────────────────────────────────────────────────────────
// מחשב לכל שדה: covered / partial / missing / not_applicable.

import type {
  CoverageReport,
  FieldCoverage,
  Form1301FieldDef,
  SectionKey,
  TaxpayerModel,
  AnnualReportSession,
  QuestionPreviewClient,
} from './types';
import { form1301Fields } from './form1301Fields';

// בודק האם שאלה "נענתה" — דורש שהמודל מכיל את הערך שהיא מזינה.
// פתרון פרגמטי: שאלה נחשבת נענתה אם ה-applyToModel שלה השפיעה על המודל.
// בעצם נסמוך על answeredQuestionIds שמגיע מ-Supabase, אבל גם נחזיר fallback
// שמסיק על בסיס מצב המודל.
function isQuestionAnswered(qid: string, _model: TaxpayerModel, answered: Set<string>): boolean {
  if (answered.has(qid)) return true;
  // ברירת מחדל: שאלה נחשבת "לא-נענתה" אם אינה מופיעה ברשימת הנענות מ-Supabase.
  // ניתן להרחיב בעתיד עם heuristic על המודל אם נדרש.
  return false;
}

export function computeCoverage(
  model: TaxpayerModel,
  answeredQuestionIds: string[] = [],
): CoverageReport {
  const answered = new Set(answeredQuestionIds);
  const fields: FieldCoverage[] = [];

  const sections: SectionKey[] = [
    '1_identity', '2_family', '3_income_salary', '4_income_business',
    '5_income_passive', '6_capital', '7_foreign', '8_deductions',
    '9_credits', '10_tax_paid', '11_special', '12_signature',
  ];
  const bySection: CoverageReport['bySection'] = {} as CoverageReport['bySection'];
  for (const s of sections) bySection[s] = { covered: 0, partial: 0, missing: 0, total: 0 };

  let covered = 0, partial = 0, missing = 0, notApplicable = 0;

  for (const f of form1301Fields) {
    const applicable = isApplicable(f, model);
    if (!applicable) {
      fields.push({ field: f, status: 'not_applicable', answeredSources: [], missingSources: f.sourceQuestionIds });
      notApplicable++;
      continue;
    }

    const ansSrc: string[] = [];
    const missSrc: string[] = [];
    for (const q of f.sourceQuestionIds) {
      if (isQuestionAnswered(q, model, answered)) ansSrc.push(q);
      else missSrc.push(q);
    }

    let status: FieldCoverage['status'];
    if (f.sourceQuestionIds.length === 0) {
      // שדה ללא מקור-שאלות מוגדר → תיעלם כשתסיים את האפיון, לעת עתה: missing
      status = 'missing';
      missing++;
      bySection[f.section].missing++;
    } else if (ansSrc.length === f.sourceQuestionIds.length) {
      status = 'covered';
      covered++;
      bySection[f.section].covered++;
    } else if (ansSrc.length > 0) {
      status = 'partial';
      partial++;
      bySection[f.section].partial++;
    } else {
      status = 'missing';
      missing++;
      bySection[f.section].missing++;
    }

    bySection[f.section].total++;
    fields.push({ field: f, status, answeredSources: ansSrc, missingSources: missSrc });
  }

  const applicableCount = covered + partial + missing;
  const percent = applicableCount === 0 ? 0 : Math.round((covered / applicableCount) * 100);

  return {
    totalFields: form1301Fields.length,
    applicable: applicableCount,
    covered, partial, missing,
    notApplicable,
    percent,
    bySection,
    fields,
  };
}

function isApplicable(field: Form1301FieldDef, model: TaxpayerModel): boolean {
  if (field.required === 'always') return true;
  if (field.conditionalOn) return field.conditionalOn(model);
  return field.required === 'conditional';
}

// בונה Checklist מאוחד של כל המסמכים הנדרשים — לפי השדות החיים (applicable).
// אם הועבר client, מורחב לפריטים ספציפיים לפי הגוף (למשל "867 ממיטב דש"
// במקום "867 כללי", או "106 מ-Wix" במקום "טופס 106 מכל מעביד").
export function buildDocumentChecklist(
  model: TaxpayerModel,
  client?: QuestionPreviewClient,
): Array<{ code: string; name: string; reason: string; forFields: string[] }> {
  type DocItem = { code: string; name: string; reason: string; forFields: string[] };
  const merged = new Map<string, DocItem>();

  function addOrMerge(code: string, name: string, reason: string, fieldNumber: string) {
    const existing = merged.get(code);
    if (existing) {
      if (!existing.forFields.includes(fieldNumber)) existing.forFields.push(fieldNumber);
    } else {
      merged.set(code, { code, name, reason, forFields: [fieldNumber] });
    }
  }

  for (const f of form1301Fields) {
    if (!isApplicable(f, model)) continue;
    for (const doc of f.requiredDocuments) {
      // ── הרחבה ספציפית לפי הכרטיס ──
      // 106 → לכל מעביד בכרטיס
      if (doc.code === '106' && client?.employers && client.employers.length > 0) {
        for (const emp of client.employers) {
          if (!emp.name) continue;
          addOrMerge(
            `106-${emp.id}`,
            `טופס 106 — ${emp.name}`,
            doc.reason,
            f.fieldNumber,
          );
        }
        continue;
      }
      // 867 לבית השקעות → לכל חשבון השקעה בכרטיס
      if (doc.code === '867_capital' && client?.investmentAccounts && client.investmentAccounts.length > 0) {
        for (const inv of client.investmentAccounts) {
          if (!inv.institutionName || inv.isClosed) continue;
          addOrMerge(
            `867-inv-${inv.id}`,
            `אישור 867 — ${inv.institutionName}`,
            doc.reason,
            f.fieldNumber,
          );
        }
        continue;
      }
      // 867 לבנק (ריבית) → לכל חשבון בנק בכרטיס
      if (doc.code === '867' && client?.bankAccounts && client.bankAccounts.length > 0) {
        for (const bank of client.bankAccounts) {
          if (!bank.bankName) continue;
          addOrMerge(
            `867-bank-${bank.id}`,
            `אישור 867 — ${bank.bankName}`,
            doc.reason,
            f.fieldNumber,
          );
        }
        continue;
      }
      // אישור הפקדות פנסיה עצמאית → לכל קופה עם hasSelfDeposits
      if (doc.code === 'pension_self_cert' && client?.pensionFunds && client.pensionFunds.length > 0) {
        const selfDepositFunds = client.pensionFunds.filter((p) => p.hasSelfDeposits);
        if (selfDepositFunds.length > 0) {
          for (const p of selfDepositFunds) {
            if (!p.institutionName) continue;
            addOrMerge(
              `pension-self-${p.id}`,
              `אישור הפקדות עצמאיות — ${p.institutionName}`,
              doc.reason,
              f.fieldNumber,
            );
          }
          continue;
        }
      }

      // ── ברירת מחדל: מסמך כללי ──
      addOrMerge(doc.code, doc.name, doc.reason, f.fieldNumber);
    }
  }
  return Array.from(merged.values());
}

// עוזר ל-Session — מוציא answeredQuestionIds מתוך snapshot של תשובות שהורדנו מ-Supabase
export function deriveCoverage(
  session: AnnualReportSession,
  answeredQuestionIds: string[],
): CoverageReport {
  return computeCoverage(session.model, answeredQuestionIds);
}

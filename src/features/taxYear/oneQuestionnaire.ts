// ─── לקוח אחד = שאלון אחד פתוח (263, 20.10.2026) ──────────────────────────────────────────────────
// ‼ ההכרעה: גיא 20.10 (docs/plans/2026-10-20-simplicity-roadmap.md §4). סרב, לא למזג: שאלון שני לא נחשף ללקוח כל עוד
//   יש לו שאלון אחר עם שאלות שמחכות לו. הוספת שאלות **לאותו** שאלון — מותרת.
// ‼ השער הוא השרת (publish_tax_info). כאן רק הבדיקה המקדימה במסך — כדי שלא תיווצר בקשה ריקה — והנוסח.

/** השאלון שפתוח ללקוח עכשיו — התשובה של open_questionnaire_of. */
export interface OpenQuestionnaire {
  /** השורה שפותחים ב«בקשות»: הבקשה של השאלון (דוח/קליטה/הצהרה), או השאלון הישן עצמו. */
  stepId: string;
  infoStepId?: string;
  parentStepId?: string;
  stepType: string;
  title: string;
  taxYear?: number;
  asOfDate?: string;
}

/** הבקשה שעומדים לפתוח או לפרסם בה שאלון. stepId — כשהיא כבר קיימת. */
export interface QuestionnaireTarget {
  stepType: 'annual_return' | 'tax_estimate' | 'wealth_declaration' | 'tax_file_intake';
  stepId?: string;
  taxYear?: number;
  asOfDate?: string;
}

export function parseOpenQuestionnaire(raw: unknown): OpenQuestionnaire | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  if (!r.stepId) return null;
  const s = (v: unknown) => (v == null || v === '' ? undefined : String(v));
  return {
    stepId: String(r.stepId), infoStepId: s(r.infoStepId), parentStepId: s(r.parentStepId),
    stepType: String(r.stepType ?? ''), title: String(r.title ?? '') || 'שאלון',
    taxYear: r.taxYear == null || r.taxYear === '' ? undefined : Number(r.taxYear), asOfDate: s(r.asOfDate)?.slice(0, 10),
  };
}

/**
 * האם השאלון הפתוח חוסם את הבקשה הזו. לא חוסם כשזה **אותו** שאלון — אותה בקשה, או אותה זהות שהשרת יחזיר במקום
 * ליצור שנייה (קליטה אחת ללקוח; דוח/הערכה לשנה; הצהרת הון ליום).
 * ‼ שאלון הקליטה הישן מול קליטה: לא חוסם את **פתיחת** הקליטה — בשורה שלה «החלף בקליטה» (236). הפרסום עצמו נחסם בשרת
 *   עד שהישן מוחלף או מסתיים.
 */
export function blockingQuestionnaire(open: OpenQuestionnaire | null, target: QuestionnaireTarget): OpenQuestionnaire | null {
  if (!open) return null;
  if (target.stepId && [open.stepId, open.parentStepId, open.infoStepId].includes(target.stepId)) return null;
  if (open.stepType === target.stepType) {
    if (target.stepType === 'tax_file_intake') return null;
    if (target.stepType === 'wealth_declaration' ? !!target.asOfDate && open.asOfDate === target.asOfDate.slice(0, 10)
      : target.taxYear != null && open.taxYear === Number(target.taxYear)) return null;
  }
  if (target.stepType === 'tax_file_intake' && open.stepType === 'intake_questionnaire') return null;
  return open;
}

/** «יש ל{שם} שאלון פתוח: «{כותרת}» — קודם מסיימים אותו». ‼ אותו נוסח בכל המסכים. */
export function questionnaireOpenText(firstName: string | undefined, open?: Pick<OpenQuestionnaire, 'title'> | null): string {
  const who = firstName?.trim() ? `ל${firstName.trim()}` : 'ללקוח';
  return open?.title ? `יש ${who} שאלון פתוח: «${open.title}» — קודם מסיימים אותו` : `יש ${who} שאלון פתוח — קודם מסיימים אותו`;
}

export const QUESTIONNAIRE_OPEN = 'questionnaire_open';

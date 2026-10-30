// ─── איפה הלקוח בשאלון — משפט אחד לדוח השנתי, להצהרת ההון ולהערכת המס (30.10.2026) ────────────────────────
// ‼ גיא: «אני מוחק ופותח חדש — וזה ממשיך מאיפה שזה היה». השאלון החדש היה ריק, אבל המסך כתב «באמצע השאלון» כבר ברגע
//   שנשלח. «התחיל» = יש טיוטה בשרת (הדף שומר אותה בכל שינוי — saved_draft של שאלה פתוחה). שאלה שנענתה נסגרת, ולכן
//   סבב שאלות נוסף אחרי שליחה מתחיל שוב ב«עוד לא התחיל».
// ‼ זה רק המשפט. «הלקוח עוד ממלא» לצורך כניסת התשובות לבד (useAutoAccept) וה«מוכן» — נשאר `filling` (שאלה פתוחה), כמו קודם.
import type { InfoAsk } from './types';

export type QuestionnaireState = 'notSent' | 'notStarted' | 'filling' | 'answered';

const hasDraft = (d: unknown): boolean => {
  if (d == null) return false;
  if (typeof d !== 'object') return true;
  const v2 = (d as { v2?: unknown }).v2;
  const body = v2 && typeof v2 === 'object' ? v2 : d;
  return Object.keys(body as object).filter(k => k !== 'at').length > 0;
};

/** asks — השאלות של הבקשה הזו, בלי שבוטלו. */
export function questionnaireState(asks: Pick<InfoAsk, 'state' | 'prompt' | 'savedDraft'>[]): QuestionnaireState {
  if (!asks.length) return 'notSent';
  const open = asks.filter(a => a.state === 'published' && a.prompt.input.kind !== 'file');
  if (!open.length) return 'answered';
  return open.some(a => hasDraft(a.savedDraft)) ? 'filling' : 'notStarted';
}

/** המשפט — undefined כשהלקוח כבר שלח (כל מסך ממשיך משם עם המצב שלו). */
export function questionnaireText(s: QuestionnaireState, firstName: string): string | undefined {
  return s === 'notSent' ? 'השאלון עוד לא נשלח'
    : s === 'notStarted' ? `נשלח ל${firstName} · עוד לא התחיל`
    : s === 'filling' ? `${firstName} באמצע השאלון`
    : undefined;
}

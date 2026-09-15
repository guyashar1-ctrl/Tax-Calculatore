// ─── Supabase repository — Annual Report 1301 ──────────────────────────────

import { supabase } from '../../lib/supabase';
import type { AnnualReportSession, TaxpayerModel, AnswerValue } from './types';
import { emptyModel, migrateModel } from './types';

interface SessionRow {
  id: string;
  user_id: string;
  client_id: string;
  tax_year: number;
  status: 'in_progress' | 'review' | 'mapping_done' | 'archived';
  model: TaxpayerModel;
  current_question_id: string | null;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
}

function rowToSession(row: SessionRow): AnnualReportSession {
  // חשוב: כל מודל שמגיע מ-DB עובר migrateModel שמוודא שכל הנתיבים העליונים
  // (spouse, taxPaid וכו') קיימים — גם אם הסשן נשמר עם גרסת מודל ישנה יותר.
  return {
    id: row.id,
    userId: row.user_id,
    clientId: row.client_id,
    taxYear: row.tax_year,
    status: row.status,
    model: migrateModel(row.model as Partial<TaxpayerModel> | null, row.tax_year),
    currentQuestionId: row.current_question_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    completedAt: row.completed_at,
  };
}

// ‼ "התחל מחדש" (174) לא מוחק: הסשן הישן נשאר עם superseded_by שמצביע לחדש.
// לכן כל קריאה לפי לקוח+שנה מסננת לסשן החי — אחרת maybeSingle היה נופל על
// שתי שורות, והרשימות היו מציגות גם היסטוריה.
export async function findSession(clientId: string, taxYear: number): Promise<AnnualReportSession | null> {
  const { data, error } = await supabase
    .from('annual_report_sessions')
    .select('*')
    .eq('client_id', clientId)
    .eq('tax_year', taxYear)
    .is('superseded_by', null)
    .maybeSingle();
  if (error) throw error;
  return data ? rowToSession(data as SessionRow) : null;
}

/** העמודות שהמסכים קוראים — בלי facts_synced_at וכל עמודה עתידית. */
const SESSION_COLUMNS = 'id,user_id,client_id,tax_year,status,model,current_question_id,created_at,updated_at,completed_at';

/**
 * רשימת כל תיקי השנה במשרד — למסך הכניסה של הדוח השנתי ולמפת העץ.
 * ‼ בלי `model`: שני הצרכנים (AnnualReportEntry, TreeMapView) קוראים רק
 * מזהה/לקוח/שנה/סטטוס; המפה מושכת תשובות ב-getAnswersForSession. הסשן
 * שנפתח בפועל נטען מלא ב-findSession. המודל שמוחזר כאן הוא ריק (migrateModel
 * על null) — אין לקרוא אותו מהרשימה הזו.
 */
export async function listSessions(): Promise<AnnualReportSession[]> {
  const { data, error } = await supabase
    .from('annual_report_sessions')
    .select('id,user_id,client_id,tax_year,status,current_question_id,created_at,updated_at,completed_at')
    .is('superseded_by', null)
    .order('updated_at', { ascending: false });
  if (error) throw error;
  return (data ?? []).map((r) => rowToSession({ ...(r as Omit<SessionRow, 'model'>), model: null as unknown as TaxpayerModel }));
}

// כל תיקי השנה של לקוח מסוים — לתצוגת "תמונת מס" בכרטיס הלקוח.
// כאן `model` נחוץ: הכרטיס מסכם את תיק השנה האחרון (summarizeYearFile).
export async function listSessionsForClient(clientId: string): Promise<AnnualReportSession[]> {
  const { data, error } = await supabase
    .from('annual_report_sessions')
    .select(SESSION_COLUMNS)
    .eq('client_id', clientId)
    .is('superseded_by', null)
    .order('tax_year', { ascending: false });
  if (error) throw error;
  return (data ?? []).map((r) => rowToSession(r as SessionRow));
}

export async function createSession(
  userId: string,
  clientId: string,
  taxYear: number,
  rootQuestionId: string,
): Promise<AnnualReportSession> {
  const model = emptyModel(taxYear);
  const insert = {
    user_id: userId,
    client_id: clientId,
    tax_year: taxYear,
    status: 'in_progress' as const,
    model,
    current_question_id: rootQuestionId,
  };
  const { data, error } = await supabase
    .from('annual_report_sessions')
    .insert(insert)
    .select()
    .single();
  if (error) throw error;
  return rowToSession(data as SessionRow);
}

export async function deleteSession(sessionId: string): Promise<void> {
  // הטבלאות annual_report_answers ו-model_snapshots עם cascade FK,
  // אז מחיקה כאן מנקה הכל.
  const { error } = await supabase
    .from('annual_report_sessions')
    .delete()
    .eq('id', sessionId);
  if (error) throw error;
}

// איפוס currentQuestionId לשורש העץ — לעריכה דרך השאלון.
// לא מוחק תשובות קיימות; הן ייטענו כ-prefills בעץ.
export async function resetSessionToRoot(
  sessionId: string,
  rootQuestionId: string,
): Promise<AnnualReportSession> {
  const { data, error } = await supabase
    .from('annual_report_sessions')
    .update({ current_question_id: rootQuestionId, status: 'in_progress', completed_at: null })
    .eq('id', sessionId)
    .select()
    .single();
  if (error) throw error;
  return rowToSession(data as SessionRow);
}

export async function updateSessionState(
  sessionId: string,
  patch: { model?: TaxpayerModel; currentQuestionId?: string | null; status?: AnnualReportSession['status']; completedAt?: string | null },
): Promise<AnnualReportSession> {
  const row: Record<string, unknown> = {};
  if (patch.model !== undefined) row.model = patch.model;
  if (patch.currentQuestionId !== undefined) row.current_question_id = patch.currentQuestionId;
  if (patch.status !== undefined) row.status = patch.status;
  if (patch.completedAt !== undefined) row.completed_at = patch.completedAt;
  const { data, error } = await supabase
    .from('annual_report_sessions')
    .update(row)
    .eq('id', sessionId)
    .select()
    .single();
  if (error) throw error;
  return rowToSession(data as SessionRow);
}

export interface StoredAnswer {
  questionId: string;
  value: AnswerValue;
  answeredAt: string;
}

export async function getAnswersForSession(sessionId: string): Promise<StoredAnswer[]> {
  const { data, error } = await supabase
    .from('annual_report_answers')
    .select('question_id, answer_value, answered_at')
    .eq('session_id', sessionId)
    .is('superseded_by', null)
    .order('answered_at', { ascending: true });
  if (error) throw error;
  return (data ?? []).map((r: { question_id: string; answer_value: AnswerValue; answered_at: string }) => ({
    questionId: r.question_id,
    value: r.answer_value,
    answeredAt: r.answered_at,
  }));
}

/**
 * שמירת תשובות + מודל בטרנזקציה אחת (save_intake_answers, 174).
 * ‼ עד 174 כל תשובה הייתה שתי-שלוש קריאות נפרדות ואחריהן כתיבת המודל —
 * כשל באמצע (עד 200 תשובות אוטומטיות מהשנה הקודמת) השאיר תשובות בלי מודל.
 * `done`: true = השאלון הסתיים, false = ממשיכים, null = תשובה ומודל בלבד
 * (הסטטוס והשאלה הנוכחית לא נוגעים — שער הכיסוי).
 * מחזירה את הסשן כפי שהשרת שמר אותו — זה מה שהמסך צריך לאמץ.
 */
export async function saveAnswers(
  sessionId: string,
  answers: Record<string, AnswerValue>,
  patch: { model: TaxpayerModel; currentQuestionId: string | null; done: boolean | null },
): Promise<AnnualReportSession> {
  const { data, error } = await supabase.rpc('save_intake_answers', {
    p_session_id: sessionId,
    p_answers: answers as unknown as object,
    p_model: patch.model as unknown as object,
    p_current_question_id: patch.currentQuestionId,
    p_done: patch.done,
  });
  if (error) throw error;
  return rowToSession(data as SessionRow);
}

/**
 * "התחל מחדש" בשרת (restart_intake_session, 174): הסשן הישן נשאר כהיסטוריה
 * עם superseded_by שמצביע לסשן חדש וריק. ‼ עד 174 המודל רוקן במקום, אבל
 * התשובות נשארו — ושער הכיסוי הראה 100% על מודל ריק.
 */
export async function restartSession(
  sessionId: string,
  rootQuestionId: string,
  model: TaxpayerModel,
): Promise<AnnualReportSession> {
  const { data, error } = await supabase.rpc('restart_intake_session', {
    p_session_id: sessionId,
    p_root_question_id: rootQuestionId,
    p_model: model as unknown as object,
  });
  if (error) throw error;
  return rowToSession(data as SessionRow);
}

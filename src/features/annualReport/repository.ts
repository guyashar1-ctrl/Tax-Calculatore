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

export async function findSession(clientId: string, taxYear: number): Promise<AnnualReportSession | null> {
  const { data, error } = await supabase
    .from('annual_report_sessions')
    .select('*')
    .eq('client_id', clientId)
    .eq('tax_year', taxYear)
    .maybeSingle();
  if (error) throw error;
  return data ? rowToSession(data as SessionRow) : null;
}

export async function listSessions(): Promise<AnnualReportSession[]> {
  const { data, error } = await supabase
    .from('annual_report_sessions')
    .select('*')
    .order('updated_at', { ascending: false });
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

export async function saveAnswer(
  sessionId: string,
  questionId: string,
  value: AnswerValue,
): Promise<void> {
  // Supersede קיים פעיל (אם יש)
  await supabase
    .from('annual_report_answers')
    .update({ superseded_by: null })  // no-op trick: we use the unique-active index to enforce
    .eq('session_id', sessionId)
    .eq('question_id', questionId)
    .is('superseded_by', null);
  // לעדכן את הקיים, או להוסיף חדש
  const { data: existing } = await supabase
    .from('annual_report_answers')
    .select('id')
    .eq('session_id', sessionId)
    .eq('question_id', questionId)
    .is('superseded_by', null)
    .maybeSingle();
  if (existing) {
    const { error } = await supabase
      .from('annual_report_answers')
      .update({ answer_value: value, answered_at: new Date().toISOString() })
      .eq('id', existing.id);
    if (error) throw error;
  } else {
    const { error } = await supabase
      .from('annual_report_answers')
      .insert({ session_id: sessionId, question_id: questionId, answer_value: value });
    if (error) throw error;
  }
}

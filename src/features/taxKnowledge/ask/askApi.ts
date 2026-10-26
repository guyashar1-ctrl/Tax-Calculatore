// ─── «שאל» — קריאות לשרת: תשובה, יומן השאלות, «מה אני לומד» ────────────────────────
// ‼ התשובה מנוסחת רק בשרת (knowledge-answer), ורק מכללים קיימים — ראה שם. כאן: קריאה, ומה מציגים כשאין שרת.
// ‼ בהדגמה (מסד מבודד) אין רשת: התשובה «לא זמינה» ורשימות ריקות — לא תשובה מומצאת.

import { supabase } from '../../../lib/supabase';
import type { ClaimStatus } from '../claim';
import type { KnowledgeRule } from '../corpus/types';

export const INBOX_CHANGED = 'pivo:knowledge-inbox-changed';

export interface AnswerLine { mark: 'yes' | 'no' | 'info'; title: string; detail: string; ruleIds: string[]; status?: ClaimStatus }
export interface Answer { answerable: boolean; lines: AnswerLine[]; why: string; missing?: string; status: ClaimStatus | null; rules: KnowledgeRule[] }
export type AskResult =
  | { kind: 'answer'; answer: Answer; questionId: string | null }
  /** השרת לא ענה (אין מפתח, תקלה, אין חיבור) — השאלה נרשמה כשאפשר. */
  | { kind: 'unavailable'; reason: string; questionId: string | null };

export async function askQuestion(question: string): Promise<AskResult> {
  try {
    const { data, error } = await supabase.functions.invoke('knowledge-answer', { body: { question } });
    if (error) throw error;
    if (data?.ok && data.answer) return { kind: 'answer', answer: data.answer as Answer, questionId: data.questionId ?? null };
    return { kind: 'unavailable', reason: String(data?.reason ?? data?.error ?? 'error'), questionId: data?.questionId ?? null };
  } catch (e) {
    // ‼ השרת לא הגיע בכלל — רושמים את השאלה מהדפדפן («לא נבדקה»), כדי שתיכנס לעדכון הבא
    const { data } = await supabase.from('knowledge_questions').insert({ question }).select('id').maybeSingle();
    return { kind: 'unavailable', reason: (e as Error).message ?? 'network', questionId: (data as { id?: string } | null)?.id ?? null };
  }
}

/** שאלה שאין לה כלל — נשמרת לעדכון הבא («לא נבדקה»: answerable=null), בלי תשובה. */
export async function logQuestion(question: string): Promise<boolean> {
  const { error } = await supabase.from('knowledge_questions').insert({ question });
  return !error;
}

export interface OpenQuestion { id: string; question: string; createdAt: string; answerable: boolean | null }
/** שאלות שלא נענו מכללים ועוד לא נסגרו בעדכון — תור המחקר. */
export async function openQuestions(): Promise<OpenQuestion[]> {
  const { data, error } = await supabase.from('knowledge_questions').select('id, question, created_at, answerable')
    .or('answerable.is.null,answerable.eq.false').is('resolved_at', null).order('created_at', { ascending: false }).limit(50);
  if (error) return [];
  return (data ?? []).map(r => ({ id: r.id, question: r.question, createdAt: r.created_at, answerable: r.answerable }));
}

export interface InboxFile { path: string; name: string; size: number }
export interface InboxItem { id: string; title: string; note?: string; files: InboxFile[]; status: 'waiting' | 'ingested' | 'dismissed'; result?: string; createdAt: string; ingestedAt?: string }

export async function listInbox(): Promise<InboxItem[] | null> {
  const { data, error } = await supabase.from('knowledge_inbox').select('*').order('created_at', { ascending: false }).limit(100);
  if (error) return null;
  return (data ?? []).map(r => ({ id: r.id, title: r.title, note: r.note ?? undefined, files: r.files ?? [], status: r.status, result: r.result ?? undefined, createdAt: r.created_at, ingestedAt: r.ingested_at ?? undefined }));
}

/** ‼ קודם הקבצים (לתיקייה של הפריט), ואז השורה עם רשימתם — אין עדכון של שורה אחרי שנוצרה. */
/** note — ההקשר שבו עלה החומר (מאיפה, שנת מס, תחום, סוג) והטקסט; נכנס לפרומפט העדכון. */
export async function addInbox(title: string, files: File[], note?: string): Promise<{ ok: boolean; error?: string }> {
  const { data: u } = await supabase.auth.getUser();
  const uid = u.user?.id;
  if (!uid) return { ok: false, error: 'לא מחובר' };
  const id = crypto.randomUUID();
  const saved: InboxFile[] = [];
  for (const f of files) {
    const safe = f.name.replace(/[^\p{L}\p{N}._-]+/gu, '_').slice(-120) || 'file';
    const path = `${uid}/${id}/${safe}`;
    const { error } = await supabase.storage.from('knowledge-inbox').upload(path, f, { upsert: false, contentType: f.type || undefined });
    if (error) return { ok: false, error: `${f.name}: ${error.message}` };
    saved.push({ path, name: f.name, size: f.size });
  }
  const { error } = await supabase.from('knowledge_inbox').insert({ id, title: title.trim(), files: saved, ...(note ? { note } : {}) });
  if (error) {
    if (saved.length) await supabase.storage.from('knowledge-inbox').remove(saved.map(s => s.path));
    return { ok: false, error: error.message };
  }
  return { ok: true };
}

export async function removeInbox(item: InboxItem): Promise<boolean> {
  const { error } = await supabase.from('knowledge_inbox').delete().eq('id', item.id);
  if (error) return false;
  if (item.files.length) await supabase.storage.from('knowledge-inbox').remove(item.files.map(f => f.path));
  return true;
}

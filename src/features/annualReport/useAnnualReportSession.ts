// ─── Hook לניהול מצב Session של דוח שנתי ──────────────────────────────────

import { useEffect, useState, useCallback } from 'react';
import type { AnnualReportSession, AnswerValue } from './types';
import { emptyModel } from './types';
import { findSession, createSession, updateSessionState, saveAnswer, listSessions, deleteSession, resetSessionToRoot } from './repository';
import { answerAndAdvance, getRootQuestion } from './engine';
import { annualReportTree } from './tree';

export function useAnnualReportSessions(userId: string | undefined) {
  const [sessions, setSessions] = useState<AnnualReportSession[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!userId) {
      setSessions([]);
      return;
    }
    let cancelled = false;
    setLoading(true);
    (async () => {
      try {
        const list = await listSessions();
        if (!cancelled) setSessions(list);
      } catch (e) {
        if (!cancelled) setError((e as Error).message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [userId]);

  const startOrResume = useCallback(async (clientId: string, taxYear: number): Promise<AnnualReportSession> => {
    if (!userId) throw new Error('Not signed in');
    const existing = await findSession(clientId, taxYear);
    if (existing) return existing;
    const root = getRootQuestion().id;
    const created = await createSession(userId, clientId, taxYear, root);
    setSessions((prev) => [created, ...prev]);
    return created;
  }, [userId]);

  const removeSession = useCallback(async (sessionId: string): Promise<void> => {
    await deleteSession(sessionId);
    setSessions((prev) => prev.filter((s) => s.id !== sessionId));
  }, []);

  const restartForEdit = useCallback(async (sessionId: string): Promise<AnnualReportSession> => {
    const root = getRootQuestion().id;
    const updated = await resetSessionToRoot(sessionId, root);
    setSessions((prev) => prev.map((s) => (s.id === updated.id ? updated : s)));
    return updated;
  }, []);

  return { sessions, loading, error, startOrResume, removeSession, restartForEdit };
}

export function useAnnualReportFlow(
  initialSession: AnnualReportSession,
  /** תשובות שהועתקו מהשנה הקודמת — שאלה שיש לה תשובה כאן נענית אוטומטית. */
  autoAnswers?: Map<string, AnswerValue>,
) {
  const [session, setSession] = useState<AnnualReportSession>(initialSession);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // היסטוריית ניווט לצורך "שאלה קודמת" — נשמרת רק בזיכרון (בטעינה מחדש
  // אפשר לערוך דרך "ערוך תשובות"). כל צעד שומר את המודל לפני התשובה.
  const [history, setHistory] = useState<Array<{ questionId: string; model: AnnualReportSession['model'] }>>([]);

  // sync if a new initialSession is passed
  useEffect(() => {
    setSession(initialSession);
    setHistory([]);
  }, [initialSession.id]);

  const submitAnswer = useCallback(async (answer: AnswerValue) => {
    if (!session.currentQuestionId) return;
    const qid = session.currentQuestionId;
    setSaving(true);
    setError(null);
    try {
      setHistory((prev) => [...prev, { questionId: qid, model: session.model }]);
      let { model: newModel, nextQuestionId } = answerAndAdvance(session.model, qid, answer);
      // צריכה אוטומטית של תשובות שהועתקו מהשנה הקודמת — הלקוח לא רואה אותן.
      let guard = 0;
      while (nextQuestionId && autoAnswers?.has(nextQuestionId) && guard++ < 200) {
        const autoValue = autoAnswers.get(nextQuestionId)!;
        const res = answerAndAdvance(newModel, nextQuestionId, autoValue);
        newModel = res.model;
        nextQuestionId = res.nextQuestionId;
      }
      const nextStatus = nextQuestionId ? 'in_progress' : 'review';
      const completedAt = nextQuestionId ? null : new Date().toISOString();

      // optimistic update
      const optimistic: AnnualReportSession = {
        ...session,
        model: newModel,
        currentQuestionId: nextQuestionId,
        status: nextStatus,
        completedAt,
      };
      setSession(optimistic);

      // persist
      await saveAnswer(session.id, qid, answer);
      const updated = await updateSessionState(session.id, {
        model: newModel,
        currentQuestionId: nextQuestionId,
        status: nextStatus,
        completedAt,
      });
      setSession(updated);
    } catch (e) {
      setError((e as Error).message);
      // revert
      setSession(initialSession);
    } finally {
      setSaving(false);
    }
  }, [session, initialSession]);

  const goBack = useCallback(async () => {
    const prev = history[history.length - 1];
    if (!prev || saving) return;
    setSaving(true);
    setError(null);
    try {
      setHistory((h) => h.slice(0, -1));
      const updated = await updateSessionState(session.id, {
        model: prev.model,
        currentQuestionId: prev.questionId,
        status: 'in_progress',
        completedAt: null,
      });
      setSession(updated);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }, [history, session.id, saving]);

  const restart = useCallback(async () => {
    setSaving(true);
    try {
      const root = getRootQuestion().id;
      const updated = await updateSessionState(session.id, {
        model: emptyModel(session.taxYear),
        currentQuestionId: root,
        status: 'in_progress',
        completedAt: null,
      });
      setSession(updated);
      setHistory([]);
    } finally {
      setSaving(false);
    }
  }, [session]);

  const markMappingDone = useCallback(async () => {
    setSaving(true);
    try {
      const updated = await updateSessionState(session.id, {
        status: 'mapping_done',
      });
      setSession(updated);
    } finally {
      setSaving(false);
    }
  }, [session]);

  const goToReview = useCallback(async () => {
    setSaving(true);
    try {
      const updated = await updateSessionState(session.id, {
        status: 'review',
        currentQuestionId: null,
        completedAt: new Date().toISOString(),
      });
      setSession(updated);
    } finally {
      setSaving(false);
    }
  }, [session]);

  // אימוץ סשן שעודכן מחוץ ל-hook (למשל אחרי החלת הסקירה השנתית).
  const adoptSession = useCallback((s: AnnualReportSession) => {
    setSession(s);
    setHistory([]);
  }, []);

  return {
    session,
    saving,
    error,
    submitAnswer,
    goBack,
    canGoBack: history.length > 0,
    restart,
    adoptSession,
    markMappingDone,
    goToReview,
    isFinished: session.currentQuestionId === null,
    tree: annualReportTree,
  };
}

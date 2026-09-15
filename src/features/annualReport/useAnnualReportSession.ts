// ─── Hook לניהול מצב Session של דוח שנתי ──────────────────────────────────

import { useEffect, useState, useCallback } from 'react';
import type { AnnualReportSession, AnswerValue } from './types';
import { emptyModel } from './types';
import { findSession, createSession, updateSessionState, saveAnswers, listSessions, deleteSession, resetSessionToRoot, restartSession } from './repository';
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

  // "התחל מחדש" מהפלט: סשן חדש וריק; הישן נשאר בשרת כהיסטוריה (superseded_by)
  // ויורד מהרשימה — הרשימה מציגה רק סשנים חיים.
  const restartFresh = useCallback(async (session: AnnualReportSession): Promise<AnnualReportSession> => {
    const created = await restartSession(session.id, getRootQuestion().id, emptyModel(session.taxYear));
    setSessions((prev) => [created, ...prev.filter((s) => s.id !== session.id)]);
    return created;
  }, []);

  return { sessions, loading, error, startOrResume, removeSession, restartForEdit, restartFresh };
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
      // "לא בטוח": ממשיכים כאילו "לא" (לא פותחים תת-ענף), אבל השאלה מסומנת
      // לבירור רו"ח והסעיפים שלה נשארים פתוחים בשער הכיסוי.
      const isUnknown = answer === 'unknown';
      const effectiveAnswer: AnswerValue = isUnknown ? false : answer;
      let { model: newModel, nextQuestionId } = answerAndAdvance(session.model, qid, effectiveAnswer);
      if (isUnknown) {
        const prevUnknown = newModel.meta?.unknownQuestions ?? [];
        newModel = {
          ...newModel,
          meta: {
            ...(newModel.meta ?? {}),
            unknownQuestions: prevUnknown.includes(qid) ? prevUnknown : [...prevUnknown, qid],
          },
        };
      } else if (newModel.meta?.unknownQuestions?.includes(qid)) {
        // נענתה מחדש בתשובה אמיתית — יורדת מרשימת הבירורים
        newModel = {
          ...newModel,
          meta: {
            ...newModel.meta,
            unknownQuestions: newModel.meta.unknownQuestions.filter((q) => q !== qid),
          },
        };
      }
      // צריכה אוטומטית של תשובות שהועתקו מהשנה הקודמת — הלקוח לא רואה אותן,
      // אבל הן נשמרות למסד כדי שהכיסוי והעריכה יכירו אותן.
      // ‼ נאספות לאותה כתיבה אחת עם התשובה עצמה והמודל (174) — לא עד 200
      // קריאות רופפות שכשל באמצען השאיר תשובות בלי מודל.
      const toSave: Record<string, AnswerValue> = { [qid]: answer };
      let guard = 0;
      while (nextQuestionId && autoAnswers?.has(nextQuestionId) && guard++ < 200) {
        const autoValue = autoAnswers.get(nextQuestionId)!;
        toSave[nextQuestionId] = autoValue;
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

      // persist — טרנזקציה אחת; מאמצים את מה שהשרת שמר בפועל
      const updated = await saveAnswers(session.id, toSave, {
        model: newModel,
        currentQuestionId: nextQuestionId,
        done: !nextQuestionId,
      });
      setSession(updated);
    } catch (e) {
      setError((e as Error).message);
      // ‼ חזרה לסשן האחרון שהשרת אישר (מה שהיה לפני התשובה הזאת) — לא לסשן
      // של רגע הטעינה, שהיה מוחק על המסך את כל מה שנענה מאז.
      setSession(session);
      setHistory((prev) => prev.slice(0, -1));
    } finally {
      setSaving(false);
    }
  }, [session, autoAnswers]);

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

  // "התחל מחדש" מתוך השאלון — חזרה לשורש עם התשובות הקיימות כברירת מחדל
  // (כמו "ערוך תשובות"). ‼ לא מרוקן את המודל: מודל ריק לצד תשובות שמורות
  // הוא בדיוק הפער שהראה 100% כיסוי על כלום (B5). איפוס אמיתי — סשן חדש —
  // קיים במסך הפלט (restartFresh).
  const restart = useCallback(async () => {
    setSaving(true);
    try {
      const updated = await resetSessionToRoot(session.id, getRootQuestion().id);
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

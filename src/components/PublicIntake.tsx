// ─── שאלון היכרות בקישור הציבורי ─────────────────────────────────────────────
// ממשיך את קישור הייצוג: מיד אחרי הזיהוי הלקוח עונה על עובדות הקבע
// (flow='onboarding' — רק שאלות "קבוע", בלי שאלות רו"ח). המנוע רץ בדפדפן;
// השמירה דרך RPC מאובטח שמאומת בטוקן הייצוג (save_intake_answer).

import { useEffect, useRef, useState } from 'react';
import { supabase } from '../lib/supabase';
import type { AnswerValue, TaxpayerModel } from '../features/annualReport/types';
import { migrateModel } from '../features/annualReport/types';
import { answerAndAdvance, getQuestionById } from '../features/annualReport/engine';
import { estimateTotalQuestions } from '../features/annualReport/tree';
import QuestionCard from '../features/annualReport/QuestionCard';

interface Props {
  token: string;
  firstName: string;
  ink: string;
  onDone: () => void;
}

type IntakeState =
  | { kind: 'loading' }
  | { kind: 'error'; message: string }
  | { kind: 'active'; sessionId: string; model: TaxpayerModel; currentQuestionId: string };

export default function PublicIntake({ token, firstName, ink, onDone }: Props) {
  const [state, setState] = useState<IntakeState>({ kind: 'loading' });
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState(false);
  const [answered, setAnswered] = useState(0);
  const historyRef = useRef<Array<{ questionId: string; model: TaxpayerModel }>>([]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      // ניסיון-חוזר אחד — הקריאה הראשונה אחרי הזיהוי עלולה להיתקל במרוץ רגעי
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let data: any = null; let error: any = null;
      for (let attempt = 0; attempt < 2; attempt++) {
        const res = await supabase.rpc('start_intake', { p_token: token });
        data = res.data; error = res.error;
        if (!res.error && res.data) break;
        await new Promise((r) => setTimeout(r, 900));
      }
      if (cancelled) return;
      const row = Array.isArray(data) ? data[0] : data;
      if (error || !row) {
        setState({ kind: 'error', message: 'לא הצלחנו לפתוח את השאלון. נסו לרענן, או פנו למשרד.' });
        return;
      }
      const model = migrateModel(row.model as Partial<TaxpayerModel> | null, row.tax_year as number);
      if (!model.meta?.flow) model.meta = { ...(model.meta ?? {}), flow: 'onboarding' };
      if (!row.current_question_id) { onDone(); return; }
      setState({ kind: 'active', sessionId: row.session_id as string, model, currentQuestionId: row.current_question_id as string });
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  async function handleSubmit(answer: AnswerValue) {
    if (state.kind !== 'active' || saving) return;
    setSaving(true);
    setSaveError(false);

    const qid = state.currentQuestionId;
    // "לא בטוח" — ממשיכים כמו "לא", והשאלה מסומנת לבירור רו"ח
    const isUnknown = answer === 'unknown';
    const effective: AnswerValue = isUnknown ? false : answer;
    let { model, nextQuestionId } = answerAndAdvance(state.model, qid, effective);
    if (isUnknown) {
      const prev = model.meta?.unknownQuestions ?? [];
      model = { ...model, meta: { ...(model.meta ?? {}), unknownQuestions: prev.includes(qid) ? prev : [...prev, qid] } };
    }

    const done = nextQuestionId === null;
    const { data, error } = await supabase.rpc('save_intake_answer', {
      p_token: token,
      p_session_id: state.sessionId,
      p_question_id: qid,
      p_answer: answer as unknown as object,
      p_model: model as unknown as object,
      p_current_question_id: nextQuestionId,
      p_done: done,
    });
    setSaving(false);
    if (error || data === false) {
      setSaveError(true);
      return; // לא מתקדמים — הלקוח ילחץ שוב
    }
    historyRef.current.push({ questionId: qid, model: state.model });
    setAnswered((n) => n + 1);
    if (done) { onDone(); return; }
    setState({ ...state, model, currentQuestionId: nextQuestionId! });
  }

  function goBack() {
    if (state.kind !== 'active' || saving) return;
    const prev = historyRef.current.pop();
    if (!prev) return;
    setAnswered((n) => Math.max(0, n - 1));
    setState({ ...state, model: prev.model, currentQuestionId: prev.questionId });
  }

  if (state.kind === 'loading') {
    return <div style={{ textAlign: 'center', color: '#6B6B68', padding: '18px 0' }}>פותח את השאלון…</div>;
  }
  if (state.kind === 'error') {
    return <div style={{ padding: '10px 12px', background: '#FCEBEB', color: '#A32D2D', borderRadius: 9, fontSize: 13 }}>{state.message}</div>;
  }

  const node = getQuestionById(state.currentQuestionId);
  if (!node) {
    return (
      <div style={{ textAlign: 'center', padding: '10px 0' }}>
        <button
          onClick={onDone}
          style={{ background: ink, color: '#fff', border: 'none', borderRadius: 10, padding: '11px 22px', fontSize: 14, cursor: 'pointer' }}
        >
          סיום
        </button>
      </div>
    );
  }

  const totalEst = estimateTotalQuestions(state.model);
  const remaining = Math.max(1, totalEst - answered);
  const isGate = node.id === 'year_map';

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 14 }}>
        <div>
          <div style={{ fontSize: 11, letterSpacing: '.08em', color: '#9A9A95', marginBottom: 4 }}>שאלון היכרות</div>
          <div style={{ fontSize: 19, fontWeight: 500, color: '#111' }}>
            {isGate ? `עוד צעד אחד${firstName ? `, ${firstName}` : ''} — כמה שאלות קצרות` : 'כמה שאלות קצרות'}
          </div>
        </div>
        {!isGate && (
          <span style={{ fontSize: 11.5, color: '#9A9A95', whiteSpace: 'nowrap' }} className="num">
            נותרו כ-{remaining}
          </span>
        )}
      </div>
      {isGate && (
        <div style={{ fontSize: 13, lineHeight: 1.6, color: '#6B6B68', marginBottom: 14 }}>
          התשובות עוזרות לנו להכיר אתכם ולבקש רק את המסמכים הנכונים. לא בטוחים במשהו? יש כפתור "לא בטוח" — נבדוק את זה יחד.
        </div>
      )}

      <QuestionCard
        node={node}
        variant={isGate ? 'tiles' : undefined}
        disabled={saving}
        onSubmit={(v) => void handleSubmit(v)}
        submitLabel={isGate ? 'נתחיל ←' : undefined}
      />

      {saveError && (
        <div style={{ marginTop: 12, padding: '10px 12px', background: '#FCEBEB', color: '#A32D2D', borderRadius: 9, fontSize: 12.5 }}>
          החיבור נכשל והתשובה לא נשמרה — נסו שוב.
        </div>
      )}

      {historyRef.current.length > 0 && (
        <button
          onClick={goBack}
          disabled={saving}
          style={{ marginTop: 12, background: 'transparent', border: 'none', color: '#6B6B68', fontSize: 12.5, cursor: 'pointer', fontFamily: 'inherit' }}
        >
          → שאלה קודמת
        </button>
      )}
    </div>
  );
}

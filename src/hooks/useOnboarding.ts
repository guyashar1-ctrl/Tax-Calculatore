import { useCallback, useEffect, useState } from 'react';
import type { Engagement, OnboardingEvent, OnboardingStep } from '../types/onboarding';
import { supabase } from '../lib/supabase';
import { engagementFromDb, eventFromDb, stepFromDb } from '../lib/dbMappers';

/** תשובת advance_onboarding_step. ok=false ⇒ הקורא מציג את ההודעה למשתמש. */
export interface AdvanceResult {
  ok: boolean;
  error?: string;
  message?: string;
  from?: string;
  to?: string;
}

const ERROR_TEXT: Record<string, string> = {
  step_not_found: 'השלב לא נמצא.',
  forbidden: 'אין הרשאה לשלב הזה.',
  unknown_action: 'הפעולה אינה מוכרת.',
  locked: 'השלב נעול עד להשלמת השלב שהוא תלוי בו.',
  paperless_required: 'קיימת הרשאת תשלום שממתינה — אי אפשר לדלג על הפייפרלס.',
};

export function useOnboarding(userId: string | undefined, clientId?: string) {
  const [engagements, setEngagements] = useState<Engagement[]>([]);
  const [steps, setSteps] = useState<OnboardingStep[]>([]);
  const [events, setEvents] = useState<OnboardingEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    if (!userId) {
      setEngagements([]); setSteps([]); setEvents([]);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    (async () => {
      const engQuery = supabase.from('engagements').select('*').order('created_at', { ascending: false });
      // הסדר שהרו״ח קבע בבונה גובר; סדר היצירה הוא רק שובר שוויון.
      const stepQuery = supabase.from('onboarding_steps').select('*')
        .order('sort_order', { ascending: true, nullsFirst: true })
        .order('created_at', { ascending: true });
      if (clientId) {
        engQuery.eq('client_id', clientId);
        stepQuery.eq('client_id', clientId);
      }
      const [engRes, stepRes] = await Promise.all([engQuery, stepQuery]);
      if (cancelled) return;
      if (engRes.error || stepRes.error) {
        setError((engRes.error || stepRes.error)!.message);
        setLoading(false);
        return;
      }
      const loadedEngagements = (engRes.data ?? []).map(engagementFromDb);
      const loadedSteps = (stepRes.data ?? []).map(stepFromDb);

      // ליומן אין client_id — כשמסתכלים על לקוח אחד מסננים לפי השלבים שלו,
      // אחרת מביאים את האחרונים בכל המשרד (מקטע "ממתינים לאישורך").
      if (clientId && loadedSteps.length === 0) {
        setEngagements(loadedEngagements);
        setSteps(loadedSteps);
        setEvents([]);
        setError(null);
        setLoading(false);
        return;
      }
      const eventQuery = supabase.from('onboarding_events').select('*').order('at', { ascending: false }).limit(200);
      if (clientId) eventQuery.in('step_id', loadedSteps.map(s => s.id));
      const eventRes = await eventQuery;
      if (cancelled) return;
      if (eventRes.error) {
        setError(eventRes.error.message);
        setLoading(false);
        return;
      }
      setEngagements(loadedEngagements);
      setSteps(loadedSteps);
      setEvents((eventRes.data ?? []).map(eventFromDb));
      setError(null);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [userId, clientId, reloadKey]);

  const refresh = useCallback(() => setReloadKey(k => k + 1), []);

  /**
   * ‼ נתיב הכתיבה היחיד לסטטוס של שלב. אין UPDATE ישיר על onboarding_steps —
   * התלות בין השלבים נאכפת בשרת, ועקיפה שלה מהדפדפן הייתה שוברת אותה.
   */
  const advance = useCallback(async (
    stepId: string,
    action: string,
    payload: Record<string, unknown> = {},
  ): Promise<AdvanceResult> => {
    try {
      const { data, error: rpcError } = await supabase.rpc('advance_onboarding_step', {
        p_step_id: stepId,
        p_action: action,
        p_payload: payload,
      });
      if (rpcError) return { ok: false, message: rpcError.message };
      const res = data as AdvanceResult | null;
      if (!res?.ok) {
        const code = res?.error ?? '';
        return { ok: false, error: code, message: res?.message || ERROR_TEXT[code] || 'הפעולה נכשלה.' };
      }
      setReloadKey(k => k + 1);
      return res;
    } catch (e) {
      return { ok: false, message: e instanceof Error ? e.message : String(e) };
    }
  }, []);

  return { engagements, steps, events, loading, error, advance, refresh };
}

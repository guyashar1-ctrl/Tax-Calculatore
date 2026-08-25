// ─── אישור המייצג באזור האישי — הנתון שמרכז הביצוע מציג ───────────────────
// ‼ קריאה בלבד, ובכוונה. אין כאן שום פעולת כתיבה כי אין לרו"ח מה לעשות עם
// השלב הזה בנפרד: הוא נוצר לבד בהגשה לשע"ם ונסגר לבד כשהייצוג מסומן כפעיל
// (sync_representation_step, מיגרציה 131). כפתור "סמן כמושלם" משלו היה יוצר
// שני מקומות לסגור בהם את אותו דבר, ומצב שבו הם לא מסכימים.
//
// ‼ המסך טוען את הנתון שלו בעצמו במקום לקבל אותו מלמעלה — אותו דפוס של
// useEmailMessages באותה קומפוננטה. השרשור דרך RepresentationRequestReview
// היה מכריח מסך שאינו יודע דבר על שלבי קליטה להחזיק אותם.

import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

export interface RepApprovalStep {
  id: string;
  status: string;
  ball: string;
  /** מתי הלקוח הצהיר שאישר. ריק = טרם דיווח. */
  clientDeclaredAt?: string;
  /** מה שהלקוח רואה ככותרת — מוצג גם לרו"ח כדי ששניהם ידברו באותן מילים. */
  clientTitle?: string;
}

const CLOSED = ['completed', 'verified', 'skipped', 'cancelled'];

export function isRepApprovalClosed(s: RepApprovalStep | null): boolean {
  return !!s && CLOSED.includes(s.status);
}

/** הלקוח דיווח שאישר, ואנחנו עוד לא אימתנו בשע"ם. */
export function isRepApprovalDeclared(s: RepApprovalStep | null): boolean {
  return !!s && !!s.clientDeclaredAt && !isRepApprovalClosed(s);
}

/**
 * השלב של הלקוח, אם קיים. מחזיר null כשאין — כלומר לפני ההגשה לשע"ם, או
 * כשהמשרד הסיר את הבקשה.
 */
export function useRepApprovalStep(clientId: string | undefined | null) {
  const [step, setStep] = useState<RepApprovalStep | null>(null);
  const [loading, setLoading] = useState(false);

  const reload = useCallback(async () => {
    if (!clientId) { setStep(null); return; }
    setLoading(true);
    const { data } = await supabase
      .from('onboarding_steps')
      .select('id,status,ball,payload')
      .eq('client_id', clientId)
      .eq('step_type', 'rep_client_approval')
      .neq('status', 'cancelled')
      .limit(1);
    const row = (data ?? [])[0] as
      { id: string; status: string; ball: string; payload: Record<string, unknown> | null } | undefined;
    setStep(row
      ? {
        id: row.id,
        status: row.status,
        ball: row.ball,
        clientDeclaredAt: (row.payload?.clientDeclaredAt as string) || undefined,
        clientTitle: (row.payload?.clientTitle as string) || undefined,
      }
      : null);
    setLoading(false);
  }, [clientId]);

  useEffect(() => { void reload(); }, [reload]);

  return { step, loading, reload };
}

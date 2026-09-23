// ─── «הסר מהבקשה» — אדם אחד יוצא מהייצוג בביטוח לאומי ──────────────────────
// ‼ כתיבה אחת בשרת (200, `drop_authority_representation`): האדם יוצא מ-targets,
// הבקשה שלו ב«בקשות» מבוטלת, והתזכורות אליו נעצרות. מסלול הביצוע (אסמכתא,
// מועד, הוראות) **לא** נמחק — הוא נשאר כהיסטוריה, ובקשה חוזרת מתיק המס
// ממשיכה ממנו.
// ‼ מוצג רק כשיש עוד אדם בב"ל ורק למי שעוד לא אושר — השרת אוכף את שניהם.

import { useState } from 'react';
import type { NiTracking, PersonRole } from '../types';
import { supabase } from '../lib/supabase';

const ERRORS: Record<string, string> = {
  last_subject: 'זה המבוטח היחיד בב״ל בבקשה — אין את מי להשאיר.',
  already_active: 'הייצוג כבר אושר בביטוח לאומי — אין בקשה להסיר.',
  not_requested: 'לא התבקש ייצוג בב״ל עבור האדם הזה.',
  forbidden: 'אין הרשאה לפעולה הזו.',
  unauthenticated: 'יש להתחבר מחדש.',
};

interface Props {
  clientId: string;
  role: PersonRole;
  name: string;
  track?: NiTracking;
  /** נקרא אחרי הצלחה — הקורא מרענן כרטיס, בקשה ושלבים. */
  onChanged?: () => void;
}

export default function NiDropSubjectButton({ clientId, role, name, track, onChanged }: Props) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (track?.confirmedAt) return null;

  async function run() {
    const kept = track?.referenceNumber ? ` (אסמכתא ${track.referenceNumber})` : '';
    const ok = window.confirm(
      `להסיר את הייצוג בביטוח לאומי עבור ${name} מהבקשה?\n\n`
      + `הייצוג שלו/ה לא יידרש יותר, הבקשה שלו/ה ב«בקשות» תבוטל ותזכורות לא יישלחו אליו/ה.\n`
      + `הפרטים שכבר נרשמו${kept} נשמרים. אפשר לבקש שוב בכל עת מתיק המס.`);
    if (!ok) return;
    setBusy(true); setError(null);
    try {
      const { data, error: rpcError } = await supabase.rpc('drop_authority_representation', {
        p_client_id: clientId, p_authority: 'national_insurance', p_subject_role: role,
      });
      if (rpcError) { setError(rpcError.message); return; }
      const res = data as { ok?: boolean; reason?: string } | null;
      if (!res?.ok) { setError(ERRORS[res?.reason ?? ''] ?? (res?.reason || 'ההסרה נכשלה')); return; }
      onChanged?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'ההסרה נכשלה');
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button type="button" className="btn btn-sm btn-ghost" disabled={busy}
        style={{ color: 'var(--ink-3)', fontSize: 'var(--fs-12)', padding: '0 .25rem' }}
        title="הייצוג בב״ל עבור האדם הזה לא יידרש יותר. הפרטים שנרשמו נשמרים."
        onClick={() => void run()}>
        {busy ? 'מסיר…' : 'הסר מהבקשה'}
      </button>
      {error && <div className="rep-track-next-err">{error}</div>}
    </>
  );
}

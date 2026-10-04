// ─── מחיקה/ביטול של בקשת ייצוג בביטוח לאומי לאדם אחד ─────────────────────────
// ‼ החלטת גיא (1.10.2026), נאכפת בשרת (212, `cancel_authority_representation`):
//   · לא נשלחה לאדם      ⇒ «מחיקת הבקשה» — יוצאת מהעבודה הפעילה.
//   · נשלחה, טרם אושרה   ⇒ «ביטול הבקשה» — רק אחרי אזהרה קצרה ואישור מפורש.
//   · אושרה ב-PIVO       ⇒ אין פעולה (הרכיב לא מוצג) — confirmedAt, או תיק ב״ל פעיל (approved).
// גם לאדם היחיד בבקשה. האסמכתא וההיסטוריה נשמרות; האדם השני והרשויות האחרות
// לא זזים. השרת מכריע את השלב מחדש בתוך נעילה — אם הוא חושב אחרת מהמסך (נשלח
// בינתיים מלשונית אחרת), החלון עובר לנוסח האזהרה ושואל שוב. כישלון נשאר בחלון.

import { useState } from 'react';
import type { NiTracking, PersonRole } from '../types';
import { supabase } from '../lib/supabase';
import Modal from './ui/Modal';
import { useToast } from './ui/Toast';

type Stage = 'not_sent' | 'sent';

/**
 * @param approved ‼ H1.b · הייצוג של האדם כבר פעיל לפי הכרטיס (שורת תיק ב״ל active) —
 *   כמו ni_subject_stage בשרת (212): confirmedAt **או** תיק active ⇒ מאושר, ואין פעולה.
 */
export function niCancelStage(track?: NiTracking, approved = false): Stage | null {
  if (approved || track?.confirmedAt) return null;
  return track?.instructionsSentAt ? 'sent' : 'not_sent';
}

export const NI_CANCEL_LABEL: Record<Stage, string> = {
  not_sent: 'מחיקת הבקשה',
  sent: 'ביטול הבקשה',
};

export function reasonText(reason: string, name: string): string {
  switch (reason) {
    case 'already_active': return `הבקשה עבור ${name} כבר סומנה כמאושרת, ולכן אי אפשר לבטל אותה.`;
    case 'automation_running': return `PIVO עובדת עכשיו מול ביטוח לאומי עבור ${name}. אפשר לבטל אחרי שהפעולה תסתיים.`;
    case 'not_requested': return 'הבקשה הזו כבר לא פעילה. המסך יתעדכן.';
    case 'forbidden': return 'אין הרשאה לפעולה הזו.';
    case 'unauthenticated': return 'צריך להתחבר מחדש.';
    // ‼ H1.c · אין תשובה ברורה (רשת/חריגה) — לא «לא בוצע»: ייתכן שהשרת כן ביטל. ניסיון
    // נוסף בטוח — אחרי ביטול השרת עונה «כבר לא פעילה».
    default: return 'לא ידוע אם הפעולה נקלטה. המסך יתעדכן — אם הבקשה עדיין מופיעה, אפשר לנסות שוב.';
  }
}

/** ‼ H1.c · תשובה סופית מהשרת — אין מה לאשר יותר; החלון אומר מה קרה ונסגר. */
export function finalOutcome(reason: string | undefined, name: string): { title: string; text: string } | null {
  if (reason === 'already_active') return { title: `הבקשה עבור ${name} כבר אושרה`, text: 'היא סומנה כמאושרת, ולכן אי אפשר לבטל אותה. המסך יתעדכן.' };
  if (reason === 'not_requested') return { title: `הבקשה עבור ${name} כבר לא פעילה`, text: 'אין מה לבטל. המסך יתעדכן.' };
  return null;
}

interface Props {
  clientId: string;
  role: PersonRole;
  /** שם האדם שהבקשה עבורו — מופיע בכותרת ובאזהרה. */
  name: string;
  track?: NiTracking;
  /**
   * ‼ H1.b · הייצוג של האדם כבר פעיל לפי הכרטיס (שורת תיק ב״ל active), גם בלי confirmedAt
   * על המסלול. השרת מסרב לבטל במצב הזה — ולכן הפעולה לא מוצגת בכלל.
   */
  approved?: boolean;
  /** נקרא אחרי הצלחה (ואחרי «כבר לא פעילה») — הקורא מרענן כרטיס, בקשה ושלבים. */
  onChanged?: () => void;
  /** מראה הכפתור: קישור שקט בשורה, או כפתור בתפריט. */
  variant?: 'link' | 'menu';
}

export default function NiCancelRequest({ clientId, role, name, track, approved = false, onChanged, variant = 'link' }: Props) {
  const initial = niCancelStage(track, approved);
  const [open, setOpen] = useState(false);
  const [stage, setStage] = useState<Stage>(initial ?? 'not_sent');
  const { showToast } = useToast();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** תשובה לא ברורה — השורה בכתום, לא באדום (כמו «לא ידוע אם יצא»). */
  const [unknown, setUnknown] = useState(false);
  /** תשובה סופית מהשרת (כבר אושרה / כבר לא פעילה) — החלון רק אומר מה קרה. */
  const [outcome, setOutcome] = useState<{ title: string; text: string } | null>(null);
  if (!initial && !open) return null;

  function start() {
    setStage(initial ?? 'not_sent');
    setError(null);
    setUnknown(false);
    setOutcome(null);
    setOpen(true);
  }

  async function confirm() {
    setBusy(true); setError(null); setUnknown(false);
    try {
      const { data, error: rpcError } = await supabase.rpc('cancel_authority_representation', {
        p_client_id: clientId, p_authority: 'national_insurance', p_subject_role: role,
        p_acknowledge_sent: stage === 'sent',
      });
      if (rpcError) { setError(reasonText('', name)); setUnknown(true); onChanged?.(); return; }
      const res = data as { ok?: boolean; reason?: string } | null;
      // ‼ השורה יורדת מהרשימה — אומרים מה קרה ואיפה זה נשמר, כדי שזה לא ייראה כמו העלמות.
      if (res?.ok) { setOpen(false); showToast(`${stage === 'sent' ? 'הבקשה בוטלה' : 'הבקשה נמחקה'} · נשמר בלשונית «פעילות»`); onChanged?.(); return; }
      if (res?.reason === 'confirm_required') {
        // נשלח בינתיים — מציגים את האזהרה ושואלים שוב. לא ממשיכים לבד.
        setStage('sent');
        setError('הבקשה כבר נשלחה בינתיים. קראו את האזהרה ואשרו שוב.');
        return;
      }
      const final = finalOutcome(res?.reason, name);
      if (final) { setOutcome(final); onChanged?.(); return; }
      setError(reasonText(res?.reason ?? '', name));
      if (!res?.reason) { setUnknown(true); onChanged?.(); }
    } catch {
      setError(reasonText('', name));
      setUnknown(true);
      onChanged?.();
    } finally {
      setBusy(false);
    }
  }

  const label = NI_CANCEL_LABEL[initial ?? stage];
  return (
    <>
      {initial && (
        <button
          type="button"
          className={variant === 'menu' ? 'ob-menu-item ob-menu-item-danger' : 'ni-cancel-link'}
          onClick={start}
        >
          {label}
        </button>
      )}
      {open && outcome && (
        <Modal
          title={outcome.title}
          onClose={() => setOpen(false)}
          width={440}
          footer={
            <button type="button" className="ui-btn ui-btn-ghost" onClick={() => setOpen(false)} data-autofocus>
              סגירה
            </button>
          }
        >
          <div className="ui-confirm-text">
            <p className="ni-cancel-p" role="status">{outcome.text}</p>
          </div>
        </Modal>
      )}
      {open && !outcome && (
        <Modal
          title={stage === 'sent'
            ? `לבטל את בקשת הייצוג בביטוח לאומי עבור ${name}?`
            : `למחוק את בקשת הייצוג בביטוח לאומי עבור ${name}?`}
          onClose={() => { if (!busy) setOpen(false); }}
          width={440}
          footer={
            <>
              <button type="button" className="ui-btn ui-btn-ghost" onClick={() => setOpen(false)} disabled={busy} data-autofocus>
                חזרה
              </button>
              <button type="button" className="ui-btn ui-btn-danger" onClick={() => void confirm()} disabled={busy}>
                {busy ? 'רגע…' : NI_CANCEL_LABEL[stage]}
              </button>
            </>
          }
        >
          <div className="ui-confirm-text">
            {stage === 'sent' ? (
              <>
                {/* ‼ H1.c · השרת מפסיק את התזכורות לאדם שבוטל (212, claim_representation_reminder). */}
                <p className="ni-cancel-p">{name} כבר קיבל/ה את הבקשה, ואולי כבר פעל/ה לפיה. התזכורות אל {name} ייפסקו.</p>
                <p className="ni-cancel-p"><strong>הביטול ב-PIVO לא מבטל בקשה או ייצוג בביטוח לאומי.</strong> אם צריך — מבטלים גם באתר ביטוח לאומי.</p>
              </>
            ) : (
              <>
                <p className="ni-cancel-p">הבקשה תצא מהעבודה הפעילה. היא עוד לא נשלחה ל{name}.</p>
                {/* ‼ הוזנה כבר בב״ל (יש אסמכתא) — המחיקה כאן לא נוגעת בה שם. בלי השורה הזאת
                    «מחיקה» נקראה כאילו הבקשה נעלמת גם ברשות (ביקורת שימושיות 2). */}
                {track?.referenceNumber && (
                  <p className="ni-cancel-p"><strong>הבקשה כבר הוזנה בביטוח לאומי.</strong> המחיקה ב-PIVO לא מבטלת אותה שם — אם צריך, מבטלים באתר ביטוח לאומי.</p>
                )}
              </>
            )}
            <p className="ni-cancel-p ni-cancel-kept">
              {track?.referenceNumber ? <>האסמכתא {track.referenceNumber} נשמרת. </> : null}
              מה שקרה נשמר בלשונית «פעילות».
            </p>
            {error && (
              <p className="ni-cancel-err" role="alert" style={unknown ? { color: 'var(--chip-amber-tx)' } : undefined}>{error}</p>
            )}
          </div>
        </Modal>
      )}
    </>
  );
}

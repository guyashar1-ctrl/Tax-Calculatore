// ─── הפעולה ההקשרית של ביטוח לאומי — לאדם אחד (פרק 17) ────────────────────────
// ‼ רכיב אחד לשני המשטחים — תיק המס ומרכז ביצוע הייצוג — כדי שהמצב, הקלט
// לעובד, הסינון לפי אדם והרענון אחרי הצלחה יחיו במקום אחד ולא יסטו.
// ‼ המצב (איזו פעולה, אם בכלל) **לא** נגזר כאן אלא ב-niRepresentationAction
// (utils/niPersons.ts) — הרכיב מקבל אותו מוכן ומטפל רק בשני הסוגים
// האוטומטיים: 'enter_btl' (btl.create_representation) ו-'check_btl'
// (btl.check_representation). לכל סוג אחר הוא מחזיר null, והקורא מצייר את
// הפעולה שלו (בקש ייצוג / שלח הוראות / המשך).
// ‼ היעד הוא **תפקיד מפורש** (role): הזהות נקראת מהכרטיס עבור אותו תפקיד
// (niPersonIdentity), והתוצאה נכתבת בשרת ל-nationalInsurance או
// ל-nationalInsuranceSpouse לפי אותו role (187). לעולם לא "הראשון ברשימה".
// ‼ שני האנשים חולקים client_id ולכן גם את אותה (client_id, action_type) —
// automation_jobs_open_unique מבטיח משימה פתוחה אחת מכל סוג בכל רגע; לכן
// משימה מוצגת כאן רק אם job.input.role הוא התפקיד של הרכיב הזה.

import { useEffect, useRef, useState } from 'react';
import type { Client, NiTracking, PersonRole } from '../types';
import type { AutomationJob } from '../types/automation';
import { BTL_CREATE_REPRESENTATION_ACTION_TYPE, BTL_CHECK_REPRESENTATION_ACTION_TYPE } from '../types/automation';
import { useAutomationJob } from '../hooks/useAutomationJobs';
import { niPersons, niPersonIdentity } from '../utils/niPersons';
import type { NiRepresentationAction } from '../utils/niPersons';

interface Props {
  client: Client;
  spouseClient?: Client;
  role: PersonRole;
  action: NiRepresentationAction | null;
  /** מסלול הביצוע של האדם הזה (execution.nationalInsurance[Spouse]). */
  track?: NiTracking;
  /** נקרא פעם אחת כשמשימה מסתיימת בהצלחה — הקורא מרענן את הבקשה/הכרטיס. */
  onChanged?: () => void;
  /**
   * בסיס הכפתור של המשטח (גודל/ריפוד). ‼ הצבע אינו של המשטח: זו פעולת
   * אוטומציה ולכן `btn-automation` (ורוד) מתווסף תמיד, בכל משטח.
   */
  className?: string;
  /** מחלקת שורת השגיאה מתחת לכפתור. */
  errorClassName?: string;
}

const jobForRole = (job: AutomationJob | null, role: PersonRole) =>
  job && job.input?.role === role ? job : null;

export default function NiNextActionButton({
  client, spouseClient, role, action, track, onChanged,
  className = 'ui-btn ui-btn-sm', errorClassName = 'txf-qt-err',
}: Props) {
  const create = useAutomationJob(client.id || undefined, BTL_CREATE_REPRESENTATION_ACTION_TYPE);
  const check = useAutomationJob(client.id || undefined, BTL_CHECK_REPRESENTATION_ACTION_TYPE);
  const [localError, setLocalError] = useState<string | null>(null);

  // ‼ אחרי הצלחה, טריגר בשרת (187/190) כבר כתב ל-execution — כאן רק מבקשים
  // מהקורא לרענן, פעם אחת למעבר. הפול של useAutomationJob רץ רק כשהלשונית
  // גלויה, ולכן בלשונית ברקע הרענון יקרה כשחוזרים אליה.
  const prevCreate = useRef<string | undefined>(undefined);
  const prevCheck = useRef<string | undefined>(undefined);
  useEffect(() => {
    const st = jobForRole(create.job, role)?.status;
    if (st === 'succeeded' && prevCreate.current !== 'succeeded') onChanged?.();
    prevCreate.current = st;
  }, [create.job, role, onChanged]);
  useEffect(() => {
    const st = jobForRole(check.job, role)?.status;
    if (st === 'succeeded' && prevCheck.current !== 'succeeded') onChanged?.();
    prevCheck.current = st;
  }, [check.job, role, onChanged]);

  if (!action || (action.kind !== 'enter_btl' && action.kind !== 'check_btl')) return null;

  const isCheck = action.kind === 'check_btl';
  const hook = isCheck ? check : create;
  const job = jobForRole(hook.job, role);

  async function run() {
    setLocalError(null);
    const person = niPersons(client, spouseClient).find(p => p.role === role);
    if (isCheck) {
      if (!person?.idNumber || !track?.referenceNumber) {
        setLocalError('אין עדיין קוד אסמכתא שמור לאדם הזה — אין מה לבדוק מול ביטוח לאומי.');
        return;
      }
      await check.run({ role, idNumber: person.idNumber, referenceNumber: track.referenceNumber });
      return;
    }
    // ‼ «חסרים פרטים» נבדק כאן, לפני יצירת job — עדיף לומר לרו"ח מיד מה חסר
    // בכרטיס מאשר לתת לעובד לגלות את זה אחרי שכבר תפס משימה.
    const identity = person ? niPersonIdentity(person, client) : null;
    if (!identity || identity.birthYear == null) {
      setLocalError('חסרים בכרטיס פרטים הדרושים לטופס ביטוח לאומי (שם פרטי, שם משפחה או שנת לידה).');
      return;
    }
    await create.run({
      role, idNumber: identity.idNumber, firstName: identity.firstName,
      lastName: identity.lastName, birthYear: identity.birthYear,
    });
  }

  const busyLabel = isCheck ? 'בודק…' : 'שולח…';
  const running = hook.busy || job?.status === 'queued' || job?.status === 'running';
  return (
    <>
      <button type="button" className={`${className} btn-automation`} disabled={hook.busy}
        aria-busy={running || undefined} onClick={() => void run()}>
        {hook.busy ? busyLabel : action.label}
      </button>
      {localError && <div className={errorClassName}>{localError}</div>}
      {/* ‼ שגיאת יצירת ה-job עצמה (לא ריצתו) — בלי זה לחיצה כושלת נראית כאילו לא קרה כלום. */}
      {hook.error && <div className={errorClassName}>{hook.error}</div>}
      {job?.status === 'needs_human' && <div className={errorClassName}>{job.needsHuman}</div>}
      {job?.status === 'failed' && <div className={errorClassName}>{job.errorDetail}</div>}
      {job?.status === 'queued' || job?.status === 'running'
        ? <div className={errorClassName} style={{ color: 'var(--ink-3)' }}>{isCheck ? 'הבדיקה רצה בעובד המקומי…' : 'ההזנה רצה בעובד המקומי…'}</div>
        : null}
    </>
  );
}

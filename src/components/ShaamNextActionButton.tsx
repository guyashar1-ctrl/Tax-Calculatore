// ─── הפעולה ההקשרית של שע״ם — להגשה אחת ──────────────────────────────────────
// ‼ רכיב אחד לשני המשטחים — מרכז ביצוע הייצוג וכרטיס הרשות בתיק המס — כדי
// שהמצב, הקלט לעובד והרענון אחרי הצלחה יחיו במקום אחד ולא יסטו. אותו דפוס
// בדיוק כמו NiNextActionButton (פרק 17).
//
// ‼ המצב **לא** נגזר כאן אלא ב-`shaamRepresentationAction` — הרכיב מקבל אותו
// מוכן ורק מריץ. מה שכן שייך לכאן: להרכיב את הקלט מ-PIVO, ולעצור **לפני**
// יצירת המשימה כשחסר משהו. עדיף לומר לרו"ח מיד מה חסר בכרטיס מאשר לתת לעובד
// לגלות את זה אחרי שכבר נגע ברשות.
//
// ‼ ההגשה היא **אדם** ולא רשות: `submissionKey` מפורש בכל קלט, ומשימה מוצגת
// כאן רק אם היא של אותה הגשה. שתי ההגשות של זוג חולקות client_id ולכן גם את
// אותה (client_id, action_type) — automation_jobs_open_unique מבטיח משימה
// פתוחה אחת מכל סוג בכל רגע.

import { useEffect, useRef, useState } from 'react';
import type { Client, RepresentationRequest } from '../types';
import type { AutomationJob } from '../types/automation';
import { useAutomationJob } from '../hooks/useAutomationJobs';
import { useAutomationGate } from '../hooks/useAutomationGate';
import type { ShaamSubmission } from '../utils/repScope';
import {
  preflightShaamSubmission, SHAAM_SYSTEM_SCREEN_LABELS,
  SHAAM_REPRESENTATION_TYPE, type ShaamRequestTracking,
} from '../features/representation/shaamRepresentation';
import { shaamPersonFacts, shaamBirthDateInput } from '../features/representation/shaamPersonFacts';
import type { ShaamRepresentationAction } from '../features/taxFile/shaamRepresentationAction';
import { signatureDocumentsOf } from '../utils/repDocuments';
import { shaamStopState } from '../features/representation/shaamJobSafety';
import ShaamStopNotice from './ShaamStopNotice';

interface Props {
  request: RepresentationRequest;
  linkedClient?: Client | null;
  /** ההגשה שהכפתור הזה מטפל בה — אדם אחד, עם המערכים שלו. */
  submission: ShaamSubmission;
  /** הפעולה שנגזרה (shaamRepresentationAction). null ⇒ אין מה להציע. */
  action: ShaamRepresentationAction | null;
  /** מצב ההגשה שנשמר — `execution.shaam[submission.key]`. */
  tracking?: ShaamRequestTracking;
  /** האם הלקוח נשוי — קובע אם שע״ם תבקש טלפון בן/בת זוג. */
  married: boolean;
  /** נקרא פעם אחת כשמשימה מסתיימת בהצלחה — הקורא מרענן את הבקשה/הכרטיס. */
  onChanged?: () => void;
  className?: string;
  errorClassName?: string;
}

const forSubmission = (job: AutomationJob | null, key: string) =>
  job && job.input?.submissionKey === key ? job : null;

export default function ShaamNextActionButton({
  request, linkedClient, submission, action, tracking, married, onChanged,
  className = 'ui-btn ui-btn-sm', errorClassName = 'txf-qt-err',
}: Props) {
  const actionType = action?.actionType ?? '';
  const hook = useAutomationJob(linkedClient?.id || undefined, actionType);
  const gate = useAutomationGate(actionType);
  const [localError, setLocalError] = useState<string | null>(null);
  // ‼ 196: «נסה שוב» על פעולה שכבר נגעה בשע״ם דורש אישור מפורש,
  // והאישור ניתן רק אחרי שהמסך הציג מה קרה.
  const [confirmRetry, setConfirmRetry] = useState(false);

  // ‼ אחרי הצלחה, טריגר בשרת (194) כבר כתב ל-execution — כאן רק מבקשים
  // מהקורא לרענן, פעם אחת למעבר.
  const prev = useRef<string | undefined>(undefined);
  const job = forSubmission(hook.job, submission.key);
  useEffect(() => {
    const st = forSubmission(hook.job, submission.key)?.status;
    if (st === 'succeeded' && prev.current !== 'succeeded') onChanged?.();
    prev.current = st;
  }, [hook.job, submission.key, onChanged]);

  if (!action) return null;

  // ‼ «חסר נתון» נבדק **לפני** שער החיבור ומוצג תמיד: זו עובדה על הכרטיס,
  // ונכונה גם כשמחשב האוטומציה כבוי. בלי זה, לחיצה בלי עובד הייתה מראה
  // «מחשב האוטומציה אינו פעיל» ומסתירה את מה שבאמת חוסם.
  const preflight = action.kind === 'create' && linkedClient
    ? preflightShaamSubmission(
        submission,
        shaamPersonFacts(request, linkedClient, submission.target),
        linkedClient, married,
      )
    : null;
  const missingData = preflight && !preflight.ok
    ? preflight.issues.map(i => i.message).join(' · ')
    : null;

  async function run(acknowledgeExternal = false) {
    setLocalError(null);
    setConfirmRetry(false);
    if (!linkedClient) {
      setLocalError('אין כרטיס לקוח מקושר לבקשה — אי אפשר להרכיב את הפרטים לשע״ם.');
      return;
    }
    const person = shaamPersonFacts(request, linkedClient, submission.target);

    if (action!.kind === 'create') {
      const pre = preflightShaamSubmission(submission, person, linkedClient, married);
      if (!pre.ok) {
        setLocalError(pre.issues.map(i => i.message).join(' · '));
        return;
      }
      await hook.run({
        submissionKey: submission.key,
        role: submission.target,
        requestId: request.id,
        personName: person.name,
        entityId: person.idNumber.replace(/\D/g, ''),
        birthDateDDMMYYYY: shaamBirthDateInput(person.birthDate),
        secondary: { type: person.secondaryType, value: person.secondaryValue },
        // ‼ בדיוק מה ש-PIVO ביקש, ותו לא. העובד מסמן את השורות האלה ולא אחרות.
        systems: pre.systems.map(s => ({
          key: s,
          screenLabel: SHAAM_SYSTEM_SCREEN_LABELS[s],
          fileNumber: pre.fileNumbers[s] ?? '',
          repType: SHAAM_REPRESENTATION_TYPE,
        })),
        spousePhone: married ? person.spousePhone : '',
        formFileName: `ייפוי כוח לחתימה - ${person.name}.pdf`,
        existingRequestNumber: tracking?.requestNumber ?? null,
      }, { acknowledgeExternal });
      return;
    }

    if (action!.kind === 'submit') {
      const doc = signatureDocumentsOf(request).find(d => d.key === submission.key)
        ?? signatureDocumentsOf(request)[0];
      if (!doc?.signedPdfStoredId) {
        setLocalError('הטופס החתום של ההגשה הזאת עדיין לא נשמר — אין מה לשדר.');
        return;
      }
      if (!tracking?.requestNumber) {
        setLocalError('לא נשמר מספר בקשה בשע״ם להגשה הזאת — אי אפשר לאתר את הבקשה הנכונה.');
        return;
      }
      await hook.run({
        submissionKey: submission.key,
        role: submission.target,
        requestNumber: tracking.requestNumber,
        entityId: person.idNumber.replace(/\D/g, ''),
        signedDocumentId: doc.signedPdfStoredId,
        alreadySubmittedAt: tracking.submittedAt ?? null,
      }, { acknowledgeExternal });
      return;
    }

    // check
    // ‼ 23.09.2026 · אין יותר חסימה על requestNumber חסר: זה בדיוק המקרה
    // שבשבילו הבדיקה קיימת — בקשה שהוזנה בשע״ם בלי ש-PIVO יודעת עליה
    // (הזנה ידנית, למשל). היא מוצאת את מספר הבקשה לבד לפי הישות, ולא
    // דורשת מהרו"ח להעתיק אותו ידנית. entityId לבדו מספיק.
    if (!person.idNumber.replace(/\D/g, '')) {
      setLocalError('אין תעודת זהות תקינה לאדם הזה בכרטיס — אין לפי מה לבדוק.');
      return;
    }
    await hook.run({
      submissionKey: submission.key,
      role: submission.target,
      requestNumber: tracking?.requestNumber ?? '',
      entityId: person.idNumber.replace(/\D/g, ''),
      // ‼ ראיית שיוך כשאין עדיין מספר בקשה — ראה attributeRows/matchRegisteredPersonName.
      personName: person.name,
    }, { acknowledgeExternal });
  }

  const busyLabel = action.kind === 'create' ? 'פותח בקשה…'
    : action.kind === 'submit' ? 'משדר…' : 'בודק…';
  const runningLabel = action.kind === 'create' ? 'הבקשה נפתחת בעובד המקומי…'
    : action.kind === 'submit' ? 'השידור רץ בעובד המקומי…' : 'הבדיקה רצה בעובד המקומי…';
  const running = hook.busy || job?.status === 'queued' || job?.status === 'running';
  const busy = hook.busy || gate.connecting;
  // ‼ אותה שפה כמו AuthorityCheckButton: בלי חיבור לשע״ם הכפתור ורוד בהיר,
  // והלחיצה פותחת את ההתחברות. פקד שמושבת מסיבה עסקית (טופס שטרם נחתם)
  // נשאר מושבת באמת — שם אין מה לפתוח.
  // ‼ מצב העצירה נגזר במקום אחד (shaamJobSafety) ולא מנוסח כאן — אחרת כל
  // מסך היה ממציא ניסוח משלו, ו«לא ידוע אם נקלט» היה נראה ככישלון רגיל.
  const stop = shaamStopState(job);
  const soft = !busy && !running && !gate.ready && !action.disabled && !missingData;
  const title = action.disabled ? action.reason
    : missingData ? missingData
    : soft ? `${gate.blockedReason ?? 'לא מחובר'}${gate.workerOffline ? '' : ' · לחיצה פותחת את ההתחברות'}`
    : undefined;

  return (
    <>
      <button type="button"
        className={`${className} btn-automation ${soft ? 'is-soft' : ''}`}
        disabled={busy || !!action.disabled}
        aria-busy={running || busy || undefined}
        title={title}
        aria-label={action.disabled ? `${action.label} — ${action.reason}` : undefined}
        onClick={() => {
          // ‼ נתון חסר עוצר כאן, לפני שער החיבור: אין טעם לפתוח חלון
          // התחברות כדי לגלות מיד שחסר מספר בכרטיס.
          if (missingData) { setLocalError(missingData); return; }
          gate.runOrConnect(() => void run());
        }}>
        {hook.busy ? busyLabel : gate.connecting ? 'ממתין לחיבור…' : action.label}
      </button>
      {/* ‼ מוצג תמיד כשחסר נתון — לא רק אחרי לחיצה. הרו"ח רואה מה חסם
          עוד לפני שהוא מנסה. */}
      {!localError && missingData && (
        <div className={errorClassName}>{missingData}</div>
      )}
      {localError && <div className={errorClassName}>{localError}</div>}
      {hook.error && <div className={errorClassName}>{hook.error}</div>}

      {/* ‼ הפאנל חי ברכיב משלו (ShaamStopNotice) — אותה תצוגה
          בכל מקום, וניתנת להצגה ולבדיקה בלי משימה אמיתית. */}
      {stop && (
        <ShaamStopNotice
          stop={stop}
          workerMessage={job?.needsHuman ?? undefined}
          className={errorClassName}
          confirming={confirmRetry}
          busy={busy}
          onAskConfirm={() => setConfirmRetry(true)}
          onCancelConfirm={() => setConfirmRetry(false)}
          onConfirmRetry={() => gate.runOrConnect(() => void run(true))}
        />
      )}

      {running
        ? <div className={errorClassName} style={{ color: 'var(--ink-3)' }}>{runningLabel}</div>
        : null}
    </>
  );
}

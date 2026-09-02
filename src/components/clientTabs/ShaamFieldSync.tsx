// ─── פרימיטיב סנכרון לשדה בודד מול שע״ם (שאילתה 134) ───────────────────────
// ‼ המודל המאושר בשלב הלמידה הוא **שדה-שדה**: לכל שדה שיש לו מקור ודאי
// בשע״ם יש כפתור משלו, ובודקים אותו בנפרד. תזמור ברמת הסעיף ו"יישור קו"
// מלא יבואו אחר כך, אחרי שכל פרימיטיב הוכח לבדו.
//
// ‼ מציע ולא כותב: הערך שנקרא מוצג ליד השדה, ונכנס לטופס רק בלחיצה על
// «אמץ». השמירה נשארת השמירה הרגילה של יישור הקו.
//
// ‼ קריאה אחת משרתת את כל השדות: כל הכפתורים חולקים את אותה משימה (אותו
// (לקוח, פעולה)), ולכן לחיצה על שדה שני לא פותחת סשן שני מול שע״ם. מי
// שלחץ ראשון מפעיל, והשאר קוראים את אותה תוצאה.

import type { AutomationJob } from '../../types/automation';
import { incomeTaxFileType } from '../../data/incomeTaxFileTypes';
import { useShaamReadiness } from '../../hooks/shaamReadiness';

/** ‼ אחרי זה, הודעת משימה היא היסטוריה ולא מצב. */
const JOB_MESSAGE_MAX_AGE_MS = 10 * 60_000;

/** מפתח השדה בטופס ⇄ המפתח שהעובד מחזיר. רק שדות עם מקור מוכח. */
export const SHAAM_134_FIELD_SOURCES: Record<string, string> = {
  incomeTaxFileType: 'fileType',
  taxOfficeName: 'taxOffice',
  incomeTaxUnit: 'unit',
  incomeTaxEconomicIndustry: 'economicIndustry',
};

interface Props {
  /** מפתח השדה בטופס יישור הקו. */
  fieldKey: string;
  /** הערך שכרגע בטופס. */
  currentValue: string;
  onAdopt: (value: string) => void;
  /** ‼ המשימה משותפת לכל השדות — ראה ההערה בראש הקובץ. */
  job: AutomationJob | null;
  busy: boolean;
  /** ריק ⇒ אין מספר תיק בכרטיס, ואין מה למשוך. */
  fileNumber: string;
  onRun: () => void;
}

export default function ShaamFieldSync({
  fieldKey, currentValue, onAdopt, job, busy, fileNumber, onRun,
}: Props) {
  const readiness = useShaamReadiness();
  const sourceKey = SHAAM_134_FIELD_SOURCES[fieldKey];
  if (!sourceKey) return null;

  const pending = job?.status === 'queued' || job?.status === 'running';

  /**
   * ‼ התיישנות דטרמיניסטית להודעות המשימה. בלעדיה משימה שנכשלה אתמול
   * המשיכה להציג את הודעתה לנצח — כי המשימה נשלפת לפי (לקוח, פעולה) בלי
   * שום הגבלת גיל. זה מה שיצר את הסתירה מול הכותרת.
   */
  const jobStampMs = job ? new Date(job.finishedAt ?? job.updatedAt ?? job.createdAt).getTime() : 0;
  const jobIsCurrent = !!job
    && (pending || (Date.now() - jobStampMs) < JOB_MESSAGE_MAX_AGE_MS);
  const fields = job?.status === 'succeeded'
    ? (job.result as { fields?: Record<string, string> } | undefined)?.fields
    : undefined;
  const shaamValue = (fields?.[sourceKey] ?? '').trim();
  const same = shaamValue !== '' && shaamValue === currentValue.trim();
  const meta = fieldKey === 'incomeTaxFileType' ? incomeTaxFileType(shaamValue) : undefined;

  // ‼ המוכנות מגיעה מהחוזה המשותף — אותו ערך בדיוק שמדליק את הנורית
  // בכותרת. אסור שהכפתור כאן יאמר "לא מוכן" בזמן שהכותרת ירוקה.
  const title = !fileNumber
    ? 'אין מספר תיק במס הכנסה בכרטיס — אין מה למשוך'
    : !readiness.ready
      ? (readiness.blockedReason ?? 'החיבור לשע״ם אינו מוכן')
      : 'קרא את הערך הזה משע״ם (שאילתה 134)';

  return (
    <div className="ial-fsync">
      <button type="button" className="ial-fsync-btn" title={title}
        disabled={!fileNumber || busy || pending || !readiness.ready}
        onClick={onRun}
        aria-label={title}>
        {pending ? '⋯' : '⟳'}
      </button>

      {/* ‼ מצב החיבור מגיע **רק** מהחוזה המשותף, לעולם לא מהמשימה האחרונה.
          המשימה היא אירוע שקרה פעם; המוכנות היא מצב עכשיו. כשקראנו מצב
          מתוך אירוע, הכותרת הייתה ירוקה והשדה הכריז "לא מוכן" — אותו רגע,
          אותו מסך. */}
      {!readiness.ready && (
        <span className="ial-fsync-msg">{readiness.blockedReason}</span>
      )}
      {/* הודעת המשימה מוצגת רק כשהיא עדיין רלוונטית: משימה פתוחה, או כזו
          שהסתיימה זה עתה. אחרת זו היסטוריה שמתחזה למצב. */}
      {readiness.ready && jobIsCurrent && job?.status === 'needs_human' && (
        <span className="ial-fsync-msg">{job.needsHuman ?? 'דרושה פעולה בחלון שע״ם.'}</span>
      )}
      {jobIsCurrent && job?.status === 'failed' && (
        <span className="ial-fsync-msg ial-fsync-err">{job.errorDetail ?? 'הקריאה נכשלה.'}</span>
      )}

      {fields && shaamValue === '' && (
        <span className="ial-fsync-msg">שע״ם לא החזירה ערך לשדה הזה.</span>
      )}
      {shaamValue !== '' && (
        <span className="ial-fsync-val">
          <span className="ial-fsync-tag">שע״ם:</span> {shaamValue}
          {same ? (
            <span className="ial-fsync-same">זהה</span>
          ) : (
            <button type="button" className="ial-fsync-adopt"
              onClick={() => onAdopt(shaamValue)}>
              {currentValue.trim() ? 'החלף' : 'אמץ'}
            </button>
          )}
          {meta && <span className="ial-fsync-hint">{meta.description} — {meta.explanation}</span>}
        </span>
      )}
    </div>
  );
}

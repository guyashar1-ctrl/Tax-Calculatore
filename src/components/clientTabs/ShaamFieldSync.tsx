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
  const sourceKey = SHAAM_134_FIELD_SOURCES[fieldKey];
  if (!sourceKey) return null;

  const pending = job?.status === 'queued' || job?.status === 'running';
  const fields = job?.status === 'succeeded'
    ? (job.result as { fields?: Record<string, string> } | undefined)?.fields
    : undefined;
  const shaamValue = (fields?.[sourceKey] ?? '').trim();
  const same = shaamValue !== '' && shaamValue === currentValue.trim();
  const meta = fieldKey === 'incomeTaxFileType' ? incomeTaxFileType(shaamValue) : undefined;

  const title = !fileNumber
    ? 'אין מספר תיק במס הכנסה בכרטיס — אין מה למשוך'
    : 'קרא את הערך הזה משע״ם (שאילתה 134)';

  return (
    <div className="ial-fsync">
      <button type="button" className="ial-fsync-btn" title={title}
        disabled={!fileNumber || busy || pending}
        onClick={onRun}
        aria-label={title}>
        {pending ? '⋯' : '⟳'}
      </button>

      {job?.status === 'needs_human' && (
        <span className="ial-fsync-msg">{job.needsHuman ?? 'דרושה פעולה בחלון שע״ם.'}</span>
      )}
      {job?.status === 'failed' && (
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

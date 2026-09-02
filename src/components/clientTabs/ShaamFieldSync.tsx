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
import { useShaamReadiness, SHAAM_READ_134 } from '../../hooks/shaamReadiness';

/** ‼ אחרי זה, הודעת משימה היא היסטוריה ולא מצב. */
const JOB_MESSAGE_MAX_AGE_MS = 10 * 60_000;

/**
 * תדירות מקדמות: הטקסט של שע״ם ⇄ הערך של PIVO.
 *
 * ‼ שע״ם כותבת «דו-חדשי» (בלי יו״ד), ו-PIVO שומרת 'bi_monthly'. ממפים
 * **רק** צורות חד-משמעיות; כל טקסט אחר מוחזר כלא-ממופה, מוצג כמו שהוא,
 * ובלי כפתור אימוץ. עדיף לא להציע מאשר להציע ניחוש.
 */
function mapAdvanceFrequency(raw: string): string | null {
  const t = raw.replace(/\s+/g, '').replace(/["'׳״]/g, '');
  if (/^דו-?ח[ו]?דשי$/.test(t)) return 'bi_monthly';
  if (/^ח[ו]?דשי$/.test(t)) return 'monthly';
  return null;
}

/** «15%» ⇒ «15». שומר את המספר כפי שהוא, בלי לעגל ובלי להמציא. */
function mapAdvanceRate(raw: string): string | null {
  const m = raw.replace(/\s+/g, '').match(/^(\d+(?:\.\d+)?)%$/);
  return m ? m[1] : null;
}

interface ShaamFieldSource {
  /** המפתח שהעובד מחזיר ב-result.fields. */
  source: string;
  /**
   * המרה לערך שנשמר ב-PIVO. מחזיר null ⇒ לא ניתן למפות חד-משמעית,
   * ואז מציגים את הערך הגולמי בלי אפשרות אימוץ.
   */
  normalize?: (raw: string) => string | null;
}

/** מפתח השדה בכרטיס ⇄ המקור בשאילתה 134. רק שדות עם מיפוי מוכח חי. */
export const SHAAM_134_FIELD_SOURCES: Record<string, ShaamFieldSource> = {
  incomeTaxFileType: { source: 'fileType' },
  taxOfficeName: { source: 'taxOffice' },
  incomeTaxUnit: { source: 'unit' },
  incomeTaxEconomicIndustry: { source: 'economicIndustry' },
  pitAdvancePercent: { source: 'advanceRate', normalize: mapAdvanceRate },
  pitAdvanceFrequency: { source: 'advanceFrequency', normalize: mapAdvanceFrequency },
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
  // ‼ מוכנות **לפעולה הזאת**, לא מוכנות גלובלית: קריאת 134 צריכה עובד חי,
  // פורטל מאומת ו-GMF. מע"מ ומגן אינן תלות שלה, וחסימה בגללן היא חסימה
  // על משהו שאינו נדרש.
  const cap = useShaamReadiness().capability(SHAAM_READ_134);
  const spec = SHAAM_134_FIELD_SOURCES[fieldKey];
  if (!spec) return null;

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
  /** מה שע״ם החזירה, מילה במילה — זה מה שמוצג לרו"ח. */
  const rawValue = (fields?.[spec.source] ?? '').trim();
  /** מה שיישמר ב-PIVO. null ⇒ הוחזר ערך שאי אפשר למפות חד-משמעית. */
  const normalized = rawValue === ''
    ? '' : (spec.normalize ? spec.normalize(rawValue) : rawValue);
  const unmappable = rawValue !== '' && normalized === null;
  const shaamValue = normalized ?? '';
  const same = shaamValue !== '' && shaamValue === currentValue.trim();
  const meta = fieldKey === 'incomeTaxFileType' ? incomeTaxFileType(shaamValue) : undefined;

  // ‼ המוכנות מגיעה מהחוזה המשותף — אותו ערך בדיוק שמדליק את הנורית
  // בכותרת. אסור שהכפתור כאן יאמר "לא מוכן" בזמן שהכותרת ירוקה.
  const title = !fileNumber
    ? 'אין מספר תיק במס הכנסה בכרטיס — אין מה למשוך'
    : !cap.ready
      ? (cap.blockedReason ?? 'החיבור לשע״ם אינו מוכן')
      : 'קרא את הערך הזה משע״ם (שאילתה 134)';

  return (
    <div className="ial-fsync">
      <button type="button" className="ial-fsync-btn" title={title}
        disabled={!fileNumber || busy || pending || !cap.ready}
        onClick={onRun}
        aria-label={title}>
        {pending ? '⋯' : '⟳'}
      </button>

      {/* ‼ סיבת החוסם **אינה** מוצגת כאן אלא פעם אחת בכרטיס. עם שישה
          פקדים באותו כרטיס אותו משפט הופיע שש פעמים והכפיל את גובה
          התאים. הכפתור עצמו מושבת, והסיבה יושבת ב-title שלו. מצב החיבור
          עדיין מגיע רק מהחוזה המשותף — לא מהמשימה האחרונה. */}
      {/* הודעת המשימה מוצגת רק כשהיא עדיין רלוונטית: משימה פתוחה, או כזו
          שהסתיימה זה עתה. אחרת זו היסטוריה שמתחזה למצב. */}
      {cap.ready && jobIsCurrent && job?.status === 'needs_human' && (
        <span className="ial-fsync-msg">{job.needsHuman ?? 'דרושה פעולה בחלון שע״ם.'}</span>
      )}
      {jobIsCurrent && job?.status === 'failed' && (
        <span className="ial-fsync-msg ial-fsync-err">{job.errorDetail ?? 'הקריאה נכשלה.'}</span>
      )}

      {fields && rawValue === '' && (
        <span className="ial-fsync-msg">שע״ם לא החזירה ערך לשדה הזה.</span>
      )}
      {/* ‼ ערך שהוחזר אך אינו ממופה חד-משמעית מוצג כמו שהוא, בלי «אמץ».
          ניחוש היה נכנס לכרטיס כעובדה מקצועית. */}
      {unmappable && (
        <span className="ial-fsync-val">
          <span className="ial-fsync-tag">שע״ם:</span> {rawValue}
          <span className="ial-fsync-msg">לא ניתן למפות לערך של PIVO — יש להזין ידנית.</span>
        </span>
      )}
      {shaamValue !== '' && (
        <span className="ial-fsync-val">
          {/* מציגים את הערך הגולמי של שע״ם — זה מה שהרו"ח משווה מולו. */}
          <span className="ial-fsync-tag">שע״ם:</span> {rawValue}
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

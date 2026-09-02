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
 *
 * ‼ «חדשי» (חודשי) הוסר בכוונה: המיפוי המקורי (786468f) הומצא כניחוש
 * סביר — "דו-חודשי יש, אז חודשי כנראה גם" — ומעולם לא נצפה בפועל אצל אף
 * לקוח. עד שייצפה חי, טקסט כזה יוצג גולמי בלי כפתור אימוץ, בדיוק כמו כל
 * ערך לא-מוכר אחר.
 */
function mapAdvanceFrequency(raw: string): string | null {
  const t = raw.replace(/\s+/g, '').replace(/["'׳״]/g, '');
  if (/^דו-?ח[ו]?דשי$/.test(t)) return 'bi_monthly';
  return null;
}

/** «15%» ⇒ «15». שומר את המספר כפי שהוא, בלי לעגל ובלי להמציא. */
function mapAdvanceRate(raw: string): string | null {
  const m = raw.replace(/\s+/g, '').match(/^(\d+(?:\.\d+)?)%$/);
  return m ? m[1] : null;
}

/**
 * ‼ «לא נדרש במקדמה» אינו כישלון קריאה — זו עובדה עסקית ששע״ם מדווחת
 * במפורש (ראה advanceStatus/advanceReason ב-extractIncomeTaxFileFacts).
 * אין שם אחוז מספרי בשום מקום במסך, ולכן **לא** מציגים "0": זה היה נתון
 * שהומצא, לא נתון שנקרא. שני השדות (שיעור ותדירות) חולקים את אותה הודעה,
 * כי שניהם חסרים מאותה סיבה עסקית אחת.
 */
function advanceEmptyReason(fields: Record<string, string>): string | null {
  if (fields.advanceStatus !== 'no_advance') return null;
  const reason = (fields.advanceReason ?? '').trim();
  return reason ? `שע״ם: לא נדרש במקדמה (סיבה: ${reason})` : 'שע״ם: לא נדרש במקדמה.';
}

/**
 * «יתרת חשבון המקדמות לשנה» ⇒ מספר. «105,501» / «15,825» / «0» וכו'.
 *
 * ‼ אותה מוסכמת שכבר קיימת ב-authorityRows.ts (balanceText): חיובי=חוב,
 * שלילי=זכות, 0=אין יתרה — בדיוק מה ששע״ם עצמה מציגה, בלי היפוך. פסיקים
 * הם מפרידי אלפים בלבד ומוסרים; הסימן (אם קיים) נשמר בדיוק כפי שנקרא.
 * ‼ נצפו חי רק ערכי אפס (שני לקוחות שונים). כל צורה שאינה מספר נקי עם
 * פסיקים/נקודה/מינוס — כמו סוגריים לשלילי — **לא** ממופה: לא נראתה חי,
 * ועדיף שדה גולמי בלי כפתור אימוץ מאשר לנחש ולהפוך זכות לחוב בטעות.
 */
function mapBalance(raw: string): string | null {
  const t = raw.replace(/\s+/g, '');
  const m = t.match(/^(-?)(\d{1,3}(?:,\d{3})*|\d+)(\.\d+)?$/);
  if (!m) return null;
  const sign = m[1] === '-' ? -1 : 1;
  const digits = m[2].replace(/,/g, '') + (m[3] ?? '');
  const n = sign * Number(digits);
  return Number.isFinite(n) ? String(n) : null;
}

interface ShaamFieldSource {
  /** המפתח שהעובד מחזיר ב-result.fields. */
  source: string;
  /**
   * המרה לערך שנשמר ב-PIVO. מחזיר null ⇒ לא ניתן למפות חד-משמעית,
   * ואז מציגים את הערך הגולמי בלי אפשרות אימוץ.
   */
  normalize?: (raw: string) => string | null;
  /**
   * הודעה חלופית כש-source ריק, לפי שדות אחרים בתוצאה — למשל "אין מקדמה"
   * במקום "שע״ם לא החזירה ערך". null/לא מוגדר ⇒ ההודעה הגנרית הרגילה.
   */
  emptyReason?: (fields: Record<string, string>) => string | null;
}

/** מפתח השדה בכרטיס ⇄ המקור בשאילתה 134. רק שדות עם מיפוי מוכח חי. */
export const SHAAM_134_FIELD_SOURCES: Record<string, ShaamFieldSource> = {
  incomeTaxFileType: { source: 'fileType' },
  taxOfficeName: { source: 'taxOffice' },
  incomeTaxUnit: { source: 'unit' },
  incomeTaxEconomicIndustry: { source: 'economicIndustry' },
  pitAdvancePercent: { source: 'advanceRate', normalize: mapAdvanceRate, emptyReason: advanceEmptyReason },
  pitAdvanceFrequency: { source: 'advanceFrequency', normalize: mapAdvanceFrequency, emptyReason: advanceEmptyReason },
  // ‼ «יתרה» כאן היא יתרת חשבון המקדמות לשנה, לא יתרת חשבון מס הכנסה
  // כללית — ומופתה במפורש לשדה הזה לפי החלטת מוצר, לא כי שני המושגים
  // זהים. נעדרת בדיוק כשאין מקדמה (advanceStatus='no_advance'), ולכן
  // חולקת את אותה הודעה.
  incomeTaxBalance: { source: 'balance', normalize: mapBalance, emptyReason: advanceEmptyReason },
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
  /** כשל ביצירת הקריאה עצמה — חייב להיראות, אחרת הלחיצה "לא עשתה כלום". */
  runError?: string | null;
}

export default function ShaamFieldSync({
  fieldKey, currentValue, onAdopt, job, busy, fileNumber, onRun, runError,
}: Props) {
  // ‼ מוכנות **לפעולה הזאת**, לא מוכנות גלובלית: קריאת 134 צריכה רק עובד
  // חי + GMF. פורטל, מע"מ ומגן אינם תלות שלה — סשן GMF יכול להיות חי גם
  // כשהפורטל מבקש אימות מחדש, וחסימה על תלות שאינה קיימת היא בדיוק מה
  // שגרם לששת הכפתורים להיחסם בזמן שהקריאה הייתה עובדת. ראה
  // SHAAM_CAPABILITIES ב-shaamReadiness.tsx.
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
  /** ‼ ריק מסיבה עסקית ידועה (כמו «אין מקדמה») מחליף את ההודעה הגנרית. */
  const emptyMessage = fields && rawValue === ''
    ? (spec.emptyReason?.(fields) ?? 'שע״ם לא החזירה ערך לשדה הזה.')
    : null;
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
      {runError && (
        <span className="ial-fsync-msg ial-fsync-err">{runError}</span>
      )}
      {jobIsCurrent && job?.status === 'failed' && (
        <span className="ial-fsync-msg ial-fsync-err">{job.errorDetail ?? 'הקריאה נכשלה.'}</span>
      )}

      {emptyMessage && (
        <span className="ial-fsync-msg">{emptyMessage}</span>
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

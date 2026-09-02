// ─── פקדי האוטומציה של כרטיס רשות — משותפים לכל הרשויות ─────────────────────
// ‼ החלטת מוצר: פקד אחד בכותרת הכרטיס («בדוק מול שע״ם»), סמן מצב קטן ליד
// כל שדה, שורת השוואה רק לשדה ששונה, סיכום אחד, ואישור מקובץ אחד. אין
// כפתור לכל שדה, ואין הודעת חיבור לכל שדה. ראה authorityAutomation.ts.
//
// ‼ הרכיבים כאן לא יודעים כלום על שע״ם או על ב״ל: הם מקבלים סט השוואה
// מוכן ומציירים אותו. מע״מ וב״ל יתחברו לאותם רכיבים בדיוק, בלי עיצוב חדש.

import type { ReactNode } from 'react';
import type { AuthorityCheckResult, AuthorityFieldResult, AuthorityFieldStatus } from '../../features/taxFile/authorityAutomation';

/** סמן מצב ליד תווית השדה. עיגול קטן אחד; הצבע אומר הכול, בלי מילים. */
export function FieldStatusMark({ status, title }: { status: AuthorityFieldStatus; title?: string }) {
  const label: Record<AuthorityFieldStatus, string> = {
    match: 'נבדק · תואם לרשות',
    changed: 'נבדק · הרשות מדווחת ערך אחר',
    unsupported: 'טרם נתמך באוטומציה',
    failed: 'הקריאה מהרשות נכשלה בשדה הזה',
    info: 'הרשות החזירה מצב עסקי',
  };
  return <span className={`txf-fstat is-${status}`} title={title ?? label[status]} aria-label={label[status]} />;
}

/**
 * שורת הרשות מתחת לערך — **רק** כשיש מה לומר: ערך שונה או כשל.
 * ‼ שדה ירוק (תואם) לא מקבל שורה: "הרשות אומרת אותו דבר" הוא רעש.
 * ‼ שדה במצב עסקי (info) גם הוא לא מקבל שורה — ההסבר מוצג פעם אחת
 * לקבוצה (groupNotes). קודם אותו משפט הופיע מתחת לשיעור, לתדירות
 * **ולַיתרה** — שלוש פעמים אותו דבר בארבע שורות.
 */
export function FieldAuthorityLine({ field, sourceLabel }: { field: AuthorityFieldResult; sourceLabel: string }) {
  if (field.status === 'changed') {
    return (
      <div className="txf-authline is-changed">
        <span className="txf-authline-tag">{sourceLabel}:</span> {field.authorityDisplay ?? field.authorityRaw}
        {field.hint && <span className="txf-authline-hint">{field.hint}</span>}
      </div>
    );
  }
  if (field.status === 'failed') {
    return (
      <div className="txf-authline is-failed">
        {field.authorityRaw ? <><span className="txf-authline-tag">{sourceLabel}:</span> {field.authorityRaw} · </> : null}
        {field.error}
      </div>
    );
  }
  return null;
}

export interface AuthorityCheckButtonProps {
  label: string;
  /** אפשר להריץ עכשיו. כשלא — הכפתור מושבת והסיבה ב-title. */
  ready: boolean;
  blockedReason?: string | null;
  running: boolean;
  onRun: () => void;
}

/**
 * הפקד היחיד בכותרת הכרטיס. ‼ יושב **ליד** כפתור הפתיחה של השורה ולא
 * בתוכו — כפתור בתוך כפתור אינו HTML תקין, ולחיצה עליו הייתה גם פותחת
 * וגם מריצה.
 */
export function AuthorityCheckButton({ label, ready, blockedReason, running, onRun }: AuthorityCheckButtonProps) {
  const title = running ? 'הקריאה מהרשות רצה…' : ready ? label : (blockedReason ?? 'האוטומציה אינה זמינה כרגע');
  return (
    <button type="button" className={`txf-check-btn ${running ? 'is-running' : ''}`}
      disabled={!ready || running} title={title} aria-label={title}
      onClick={onRun}>
      <span className="txf-check-ic" aria-hidden="true">{running ? '⋯' : '⟳'}</span>
      <span className="txf-check-lbl">{running ? 'בודק…' : label}</span>
    </button>
  );
}

function checkedAtText(iso?: string): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const sameDay = d.toDateString() === new Date().toDateString();
  const time = d.toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' });
  return sameDay ? time : `${d.toLocaleDateString('he-IL', { day: '2-digit', month: '2-digit' })} ${time}`;
}

export interface AuthorityCheckSummaryProps {
  result: AuthorityCheckResult | null;
  sourceLabel: string;
  /** שגיאה ביצירת הקריאה עצמה (לא בריצה) — חייבת להיראות. */
  runError?: string | null;
  approving: boolean;
  approveError?: string | null;
  approveNotice?: string | null;
  onApprove: () => void;
  /** תוספת מתחת לסיכום — למשל סיבת חסימה של המוכנות, פעם אחת לכרטיס. */
  children?: ReactNode;
}

/**
 * הסיכום היחיד של הבדיקה: «נבדקו 8 שדות · 2 שינויים · 4 טרם נתמכים», ואם
 * יש שינויים — כפתור אחד «אשר N שינויים». שגיאת ריצה מופיעה כאן פעם אחת.
 */
export function AuthorityCheckSummary({
  result, sourceLabel, runError, approving, approveError, approveNotice, onApprove, children,
}: AuthorityCheckSummaryProps) {
  if (!result && !runError && !children) return null;
  const s = result?.summary;
  const at = checkedAtText(result?.checkedAt);
  const changed = s?.changed ?? 0;

  const parts: string[] = [];
  if (s && result?.checkedAt) {
    parts.push(`נבדקו ${s.checked} שדות`);
    parts.push(changed === 0 ? 'אין שינויים' : changed === 1 ? 'שינוי אחד' : `${changed} שינויים`);
    if (s.failed > 0) parts.push(s.failed === 1 ? 'שדה אחד לא נקרא' : `${s.failed} שדות לא נקראו`);
    if (s.unsupported > 0) parts.push(`${s.unsupported} טרם נתמכים`);
  }

  return (
    <div className="txf-check">
      {parts.length > 0 && (
        <div className="txf-check-line">
          <span className="txf-check-sum">{parts.join(' · ')}</span>
          {at && <span className="txf-check-at">{sourceLabel} · {at}</span>}
          {changed > 0 && (
            <button type="button" className="ui-btn ui-btn-primary ui-btn-sm" disabled={approving}
              onClick={onApprove}>
              {approving ? 'מאשר…' : changed === 1 ? 'אשר שינוי אחד' : `אשר ${changed} שינויים`}
            </button>
          )}
        </div>
      )}
      {/* ‼ ההסבר העסקי — פעם אחת לקבוצה, בטקסט משני. לא מתחת לכל שדה. */}
      {result?.groupNotes.map(n => (
        <div className="txf-check-note" key={n.group}>
          <span className="txf-check-grp">{n.label}</span> {n.text}
        </div>
      ))}
      {/* ‼ שגיאה אחת, פעם אחת. לא ליד כל שדה. */}
      {(runError || result?.runError) && (
        <div className="txf-check-err">{runError ?? result?.runError}</div>
      )}
      {approveError && <div className="txf-check-err">{approveError}</div>}
      {!approveError && approveNotice && <div className="txf-check-note">{approveNotice}</div>}
      {children}
    </div>
  );
}

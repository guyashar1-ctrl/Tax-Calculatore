// ─── פקדי האוטומציה של כרטיס רשות — משותפים לכל הרשויות ─────────────────────
// ‼ החלטת מוצר: פקד אחד בכותרת הכרטיס («בדוק מול שע״ם»), סמן מצב קטן ליד
// כל שדה, שורת השוואה רק לשדה ששונה, סיכום אחד, ואישור מקובץ אחד. אין
// כפתור לכל שדה, ואין הודעת חיבור לכל שדה. ראה authorityAutomation.ts.
//
// ‼ הרכיבים כאן לא יודעים כלום על שע״ם או על ב״ל: הם מקבלים סט השוואה
// מוכן ומציירים אותו. מע״מ וב״ל יתחברו לאותם רכיבים בדיוק, בלי עיצוב חדש.

import type { ReactNode } from 'react';
import type { AuthorityCheckResult, AuthorityFieldResult, AuthorityFieldStatus } from '../../features/taxFile/authorityAutomation';
import { useToast } from '../ui/Toast';
import { useAutomationGate } from '../../hooks/useAutomationGate';

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
  // ‼ כשל — הנקודה האדומה מספיקה; «N שדות לא נקראו» נאמר פעם אחת בסיכום
  // (21.10.2026: אותו משפט אדום מתחת לשני שדות היה רעש). שורה רק כשהרשות
  // החזירה ערך גולמי שלא פוענח — זה מידע.
  if (field.status === 'failed' && field.authorityRaw) {
    return (
      <div className="txf-authline is-failed">
        <span className="txf-authline-tag">{sourceLabel}:</span> {field.authorityRaw}
        {field.error ? <> · {field.error}</> : null}
      </div>
    );
  }
  if (field.status === 'match' && field.showOnMatch && field.authorityDisplay) {
    return (
      <div className="txf-authline is-info">
        <span className="txf-authline-tag">{sourceLabel}:</span> {field.authorityDisplay}
      </div>
    );
  }
  // ‼ מצב עסקי עם ראיה משלו (למשל «מופיע ברשימת המיוצגים») — שורה ניטרלית.
  // מצב עסקי בלי ראיה משלו מוסבר פעם אחת בקבוצה, כמו קודם.
  if (field.status === 'info' && field.authorityDisplay) {
    return (
      <div className="txf-authline is-info">
        <span className="txf-authline-tag">{sourceLabel}:</span> {field.authorityDisplay}
      </div>
    );
  }
  return null;
}

/**
 * «עדכן רק את X» — אותה קריאה, לאדם אחד. ‼ אותו שער חיבור כמו הכפתור
 * בכותרת: לא מחובר ⇒ הלחיצה פותחת את ההתחברות וממשיכה לבד.
 */
export function PersonSyncButton({ label, capability, running, onRun }: {
  label: string; capability: string; running: boolean; onRun: () => void;
}) {
  const gate = useAutomationGate(capability);
  const busy = running || gate.connecting;
  return (
    <button type="button" className="ui-linkbtn txf-person-sync" disabled={busy} aria-busy={busy || undefined}
      title={gate.ready ? label : `${gate.blockedReason ?? 'לא מחובר'} · לחיצה פותחת את ההתחברות`}
      onClick={() => gate.runOrConnect(onRun)}>
      {busy ? 'בודק…' : label}
    </button>
  );
}

export interface AuthorityCheckButtonProps {
  label: string;
  /** היכולת שהפעולה צריכה (מפתח ב-SHAAM_CAPABILITIES) — ממנה נגזר החיבור. */
  capability: string;
  running: boolean;
  onRun: () => void;
  /** האוטומציה עוד לא נבנתה לרשות הזו — הכפתור מושבת באמת, עם הסיבה. */
  unavailableReason?: string | null;
  /** חסר קלט בכרטיס — אין חיבור שיפתור את זה; הלחיצה מסבירה. */
  inputBlockedReason?: string | null;
}

/**
 * הפקד היחיד בכותרת הכרטיס. ‼ יושב **ליד** כפתור הפתיחה של השורה ולא
 * בתוכו — כפתור בתוך כפתור אינו HTML תקין, ולחיצה עליו הייתה גם פותחת
 * וגם מריצה.
 *
 * ‼ שלושה מצבים, אותה שפה בכל האוטומציות (הכרעת גיא, 19.09.2026):
 *   ורוד מלא   — החיבור לרשות קיים ⇒ לחיצה מריצה.
 *   ורוד בהיר  — החיבור לא קיים (הנורית בכותרת לא ירוקה) ⇒ הלחיצה פותחת
 *                 את ההתחברות, ואחריה הפעולה רצה לבד (useAutomationGate).
 *                 חסר קלט בכרטיס ⇒ הלחיצה מסבירה מה למלא.
 *   מקווקו     — האוטומציה עוד לא נבנתה ⇒ מושבת באמת.
 */
export function AuthorityCheckButton({ label, capability, running, onRun, unavailableReason, inputBlockedReason }: AuthorityCheckButtonProps) {
  const { showToast } = useToast();
  const gate = useAutomationGate(capability);
  const busy = running || gate.connecting;
  const soft = !busy && !unavailableReason && (!gate.ready || !!inputBlockedReason);
  const title = running ? 'הקריאה מהרשות רצה…'
    : gate.connecting ? 'ממתין להתחברות — הבדיקה תרוץ לבד אחריה'
    : unavailableReason ? unavailableReason
    : inputBlockedReason ? inputBlockedReason
    : soft ? `${gate.blockedReason ?? 'לא מחובר'}${gate.workerOffline ? '' : ' · לחיצה פותחת את ההתחברות'}`
    : label;
  const onClick = inputBlockedReason ? () => showToast(inputBlockedReason) : () => gate.runOrConnect(onRun);
  return (
    <button type="button" className={`txf-check-btn btn-automation ${busy ? 'is-running' : ''} ${soft ? 'is-soft' : ''}`}
      disabled={!!unavailableReason || busy} aria-busy={busy || undefined} title={title} aria-label={title}
      onClick={onClick}>
      <span className="txf-check-ic" aria-hidden="true">{busy ? '⋯' : '⟳'}</span>
      <span className="txf-check-lbl">{running ? 'בודק…' : gate.connecting ? 'ממתין לחיבור…' : label}</span>
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
  /** «קרא שוב» — כשקריאה של שדה נכשלה. אותה פעולה כמו הכפתור בכותרת. */
  onRetry?: () => void;
  /** תוספת מתחת לסיכום — למשל סיבת חסימה של המוכנות, פעם אחת לכרטיס. */
  children?: ReactNode;
}

/**
 * הסיכום היחיד של הבדיקה — ‼ רק כשיש מה לעשות (22.10.2026, גיא: «למה יש את זה אם הכל סבבה»):
 * «2 שינויים · אשר» / «שדה אחד לא נקרא · קרא שוב». הכול תקין ⇒ רק «נבדק 22:34» קטן.
 * «טרם נתמכים» / «לא נבדקו הפעם» הוסרו — פרט פנימי; הנקודה האפורה ליד השדה אומרת את זה.
 */
export function AuthorityCheckSummary({
  result, sourceLabel, runError, approving, approveError, approveNotice, onApprove, onRetry, children,
}: AuthorityCheckSummaryProps) {
  if (!result && !runError && !children) return null;
  const s = result?.summary;
  const at = checkedAtText(result?.checkedAt);
  const changed = s?.changed ?? 0;
  const failed = s?.failed ?? 0;
  const checked = !!(s && result?.checkedAt);

  const parts: string[] = [];
  if (checked) {
    if (changed > 0) parts.push(changed === 1 ? 'שינוי אחד' : `${changed} שינויים`);
    if (failed > 0) parts.push(failed === 1 ? 'שדה אחד לא נקרא' : `${failed} שדות לא נקראו`);
  }
  const quiet = checked && parts.length === 0;
  // ‼ בזמן ריצה אין עדיין מה לסכם — בלי זה נשארת מסגרת ריקה עם קו מפריד.
  const hasContent = checked || (result?.groupNotes.length ?? 0) > 0 || !!runError || !!result?.runError
    || !!approveError || !!approveNotice || !!children;
  if (!hasContent) return null;

  return (
    <div className={`txf-check${quiet ? ' is-quiet' : ''}`}>
      {quiet && at && <div className="txf-check-at" data-check-quiet>נבדק מול {sourceLabel} · {at}</div>}
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
          {failed > 0 && changed === 0 && onRetry && (
            <button type="button" className="ui-btn ui-btn-sm" onClick={onRetry}>קרא שוב</button>
          )}
        </div>
      )}
      {/* ‼ ההסבר העסקי — פעם אחת לקבוצה, בטקסט משני. לא מתחת לכל שדה. ‼ 22.10.2026 · לא כשהכול תקין:
          המצב עצמו מוצג בשדה («אין מקדמות» + הסיבה). */}
      {!quiet && result?.groupNotes.map(n => (
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

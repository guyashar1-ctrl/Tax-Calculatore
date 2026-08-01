/**
 * מצבי מסך משותפים · אפיון §3.13, §3.7, §5.1, §5.3.
 * ריק · טעינה · שגיאה · כותרת קבוצה. הכלל שמאחוריהם: מסך אף פעם לא לבן
 * ואף פעם לא מציג כותרת מעל כלום.
 */
import { ReactNode } from 'react';
import Icon from './Icon';

// ─── מצב ריק · §3.13 ────────────────────────────────────────────────────────

interface EmptyStateProps {
  headline: string;
  /** משפט אחד. לא פסקה. */
  sentence?: string;
  /** שלבים ממוספרים — רק כשיש מחזור חיים שכדאי ללמד.
   *  מחרוזת = שורה אחת; אובייקט = כותרת השלב + מה קורה בו. */
  steps?: (string | { t: string; p: string })[];
  action?: { label: string; onClick: () => void };
  /** קישור טקסט שקט — מסלול המשנה, לא הפעולה הראשית */
  quietLink?: { label: string; onClick: () => void };
}

export function EmptyState({ headline, sentence, steps, action, quietLink }: EmptyStateProps) {
  return (
    <div className="ui-empty">
      <h3 className="ui-empty-headline">{headline}</h3>
      {sentence && <p className="ui-empty-sentence">{sentence}</p>}
      {steps && steps.length > 0 && (
        <ol className="ui-empty-steps">
          {steps.map((s, i) => (
            <li key={i}>
              <span className="ui-empty-num">{String(i + 1).padStart(2, '0')}</span>
              {typeof s === 'string' ? (
                <span className="ui-empty-step-t">{s}</span>
              ) : (
                <span className="ui-empty-step">
                  <span className="ui-empty-step-t">{s.t}</span>
                  <span className="ui-empty-step-p">{s.p}</span>
                </span>
              )}
            </li>
          ))}
        </ol>
      )}
      {(action || quietLink) && (
        <div className="ui-empty-actions">
          {action && (
            <button type="button" className="ui-btn ui-btn-primary" onClick={action.onClick}>
              {action.label}
            </button>
          )}
          {quietLink && (
            <button type="button" className="ui-linkbtn" onClick={quietLink.onClick}>
              {quietLink.label}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * מצב ריק בתוך מסך מלא — שורה שקטה, לא כרטיס ממורכז.
 * קופסה גדולה בתוך מסך שכבר יש בו תוכן קוראת כמו תקלה.
 */
export function CalmEmpty({ text, action }: { text: string; action?: { label: string; onClick: () => void } }) {
  return (
    <div className="ui-calm-empty">
      <span>{text}</span>
      {action && (
        <button type="button" className="ui-linkbtn" onClick={action.onClick}>{action.label}</button>
      )}
    </div>
  );
}

// ─── טעינה · §5.1 ───────────────────────────────────────────────────────────

/** שלד שורה — חיקוי של השורה האמיתית, לא ספינר. */
export function SkeletonRow({ widths = [40, 18, 12] }: { widths?: number[] }) {
  return (
    <div className="ui-skel-row" aria-hidden="true">
      {widths.map((w, i) => <span key={i} className="ui-skel-bar" style={{ width: `${w}%` }} />)}
    </div>
  );
}

export function SkeletonList({ rows = 4, widths }: { rows?: number; widths?: number[] }) {
  return (
    <div className="ui-skel-list" role="status" aria-label="טוען">
      {Array.from({ length: rows }, (_, i) => <SkeletonRow key={i} widths={widths} />)}
    </div>
  );
}

// ─── שגיאה · §5.3 ───────────────────────────────────────────────────────────

/** באנר במקום התוכן. אף פעם לא alert, אף פעם לא מסך לבן. */
export function ErrorBanner({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="ui-error-banner" role="alert">
      <span>{message}</span>
      {onRetry && <button type="button" className="ui-linkbtn" onClick={onRetry}>נסה שוב</button>}
    </div>
  );
}

// ─── כותרת קבוצה · §3.7 ─────────────────────────────────────────────────────

interface GroupHeaderProps {
  title: string;
  count?: number;
  hint?: string;
  collapsed?: boolean;
  onToggle?: () => void;
  /** תוכן בקצה — פעולה שקטה שקשורה לקבוצה כולה */
  end?: ReactNode;
}

export function GroupHeader({ title, count, hint, collapsed, onToggle, end }: GroupHeaderProps) {
  const clickable = !!onToggle;
  return (
    <div className="ui-group-head">
      <button
        type="button"
        className="ui-group-toggle"
        onClick={onToggle}
        aria-expanded={clickable ? !collapsed : undefined}
        disabled={!clickable}
      >
        {clickable && (
          <span className={`ui-group-arrow ${collapsed ? 'is-collapsed' : ''}`}><Icon name="chevron-down" size={13} /></span>
        )}
        <span className="ui-group-title">{title}</span>
        {count !== undefined && <span className="ui-group-count">{count}</span>}
        {hint && <span className="ui-group-hint">{hint}</span>}
      </button>
      {end && <div className="ui-group-end">{end}</div>}
    </div>
  );
}

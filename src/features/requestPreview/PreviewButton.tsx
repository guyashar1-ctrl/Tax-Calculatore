// ─── «צפייה» — הכפתור השקט שיושב בכל שורה שאפשר לראות ──────────────────────────────
// מילה ולא רק אייקון (משתמש לא טכני); יושב לפני הפעולה הקיימת, ולבד כשאין פעולה.
import './requestPreview.css';

export default function PreviewButton({ name, onClick, className }: { name: string; onClick: () => void; className?: string }) {
  return (
    <button type="button" className={`btn btn-ghost btn-sm rp-view${className ? ` ${className}` : ''}`}
      aria-label={`צפייה: ${name}`} data-testid="rp-view-btn" onClick={onClick}>
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z" /><circle cx="12" cy="12" r="3" />
      </svg>
      <span>צפייה</span>
    </button>
  );
}

// ─── שם בשורה בספרייה = «צפייה» (16.10.2026) ────────────────────────────────
// ‼ פעולה אחת גלויה בשורה: השם עצמו פותח את מה שהלקוח מקבל; עין קטנה אומרת שזו לחיצה.
export default function NameView({ name, onClick }: { name: string; onClick: () => void }) {
  return (
    <button type="button" className="lb-name lb-name-btn" aria-label={`צפייה: ${name}`} data-testid="rp-view-btn" onClick={onClick}>
      {name}
      <svg className="lb-name-eye" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z" /><circle cx="12" cy="12" r="3" />
      </svg>
    </button>
  );
}

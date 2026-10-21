// ─── שרשרת שלבים עם חצים — «IDOM ← אפשרות 4 ← סוג רשימה 1» ──────────────────
// ‼ הבעיה שזה פותר (21.10.2026): כשקוד באנגלית, חץ ומספר עומדים צמודים בתוך
// טקסט עברי («IDOM ← 4»), הדפדפן מחבר אותם לרצף אחד משמאל לימין — וקורא
// בעברית רואה קודם את ה-4. כאן כל שלב מבודד (bdi) והחץ ביניהם נפרד, ולכן
// הסדר תמיד מימין לשמאל. שלב והחץ שאחריו לא נשברים באמצע שורה.
//
// ‼ החץ בעברית הוא תמיד ← (קדימה). → רק בתחילת «→ חזרה». הכלל נאכף בסריקה:
// components/ui/__tests__/rtlArrows.test.ts.
import { Fragment } from 'react';

export const ARROW = '←';

export function ArrowChain({ steps, className }: { steps: string[]; className?: string }) {
  return (
    <span className={['ui-arrow-chain', className].filter(Boolean).join(' ')}>
      {steps.map((s, i) => (
        <span key={i} className="ui-arrow-step">
          <bdi>{s}</bdi>
          {i < steps.length - 1 && <span className="ui-arrow" aria-hidden="true">{ARROW}</span>}
        </span>
      ))}
    </span>
  );
}

/** מחרוזת נתיב שכבר כתובה עם ← (מנתוני הקוד) — מוצגת כשרשרת; בלי חץ — כמו שהיא. */
export function ArrowText({ text, className }: { text: string; className?: string }) {
  const steps = text.split(/\s*←\s*/).filter(Boolean);
  if (steps.length < 2) return <Fragment>{text}</Fragment>;
  return <ArrowChain steps={steps} className={className} />;
}

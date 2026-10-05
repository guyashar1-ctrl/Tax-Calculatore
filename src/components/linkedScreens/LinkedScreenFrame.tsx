/**
 * מסגרת למסך שהלקוח מגיע אליו בקישור אישי, כשהוא מוצג בתוך עמוד אחר («צפייה»).
 * ‼ אותו עטיפה בדיוק כמו ב-App.tsx (`pivo-light public-page-shell`) — מסכי לקוח
 * נשארים בהירים וממותגים. ‼ `transform` הופך את המסגרת למכילה של כל מה שמוצג
 * `position: fixed` בתוכה (חדר החתימה, חלונות הבחירה) — בלעדיו הם היו מכסים את
 * כל המסך של המשרד ולא רק את המסגרת.
 */
export default function LinkedScreenFrame({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div
      className="pivo-light public-page-shell"
      data-testid="linked-screen-frame"
      style={{ position: 'relative', transform: 'translateZ(0)', minHeight: 0, height: '100%', overflow: 'auto', ...style }}
    >
      {children}
    </div>
  );
}

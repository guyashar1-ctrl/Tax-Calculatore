// ─── כמה דברים נפרדים · שורה לכל דבר ────────────────────────────────────────
// ‼ הבעיה שזה פותר: משפטים שכל אחד מהם אומר דבר אחר נדחסו לפסקה אחת,
// מופרדים בנקודה בלבד — "נשלח מ-X. בדוק ושלח. עותק יישמר". העין קוראת
// את זה כמשפט אחד ארוך ומדלגת על השני והשלישי.
//
// ‼ פריט אחד נשאר משפט. אין רשימה של דבר אחד, ואין מסגרת סביב הודעה קצרה.
import type { ReactNode } from 'react';

export interface InfoLinesProps {
  /** ערכים ריקים/‎false‎ נופלים — כדי שאפשר יהיה לכתוב תנאים בתוך המערך. */
  items: Array<ReactNode | false | null | undefined>;
  className?: string;
  style?: React.CSSProperties;
}

export default function InfoLines({ items, className, style }: InfoLinesProps) {
  const rows = items.filter((i): i is ReactNode => i !== null && i !== undefined && i !== false && i !== '');
  if (rows.length === 0) return null;

  const cls = ['ui-lines', className].filter(Boolean).join(' ');
  if (rows.length === 1) return <p className={cls} style={style}>{rows[0]}</p>;

  return (
    <ul className={cls} style={style}>
      {rows.map((row, i) => <li key={i}>{row}</li>)}
    </ul>
  );
}

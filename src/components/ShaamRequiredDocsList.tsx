// ─── מסמכים נוספים ששע״ם דרשה — ומה PIVO עשתה עם כל אחד (201) ─────────────
// ‼ מידע, לא פעולה: הפעולה עצמה (בקשת מסמך אצל הלקוח) נוצרת בשרת ומופיעה
// ב«בקשות». כאן רק מה נדרש ומה נעשה, בצבע מידע — לא בוורוד של אוטומציה.

import { shaamRequiredDocumentText, type ShaamRequiredDocument } from '../features/representation/shaamRepresentation';

export function ShaamRequiredDocsList({ docs }: { docs: ShaamRequiredDocument[] }) {
  if (docs.length === 0) return null;
  return (
    <div data-testid="shaam-required-docs" style={{ fontSize: 'var(--fs-12)', color: 'var(--ink-3)', lineHeight: 1.7, marginTop: '.3rem' }}>
      <div>שע״ם דורשת מסמכים נוספים מלבד ייפוי הכוח:</div>
      {docs.map((d, i) => (
        <div key={`${d.label}-${i}`}>· {d.label}{shaamRequiredDocumentText(d) ? ` - ${shaamRequiredDocumentText(d)}` : ''}</div>
      ))}
    </div>
  );
}

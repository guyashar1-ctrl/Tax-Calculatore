// ─── הייצוג בשע״ם אחרי ההגשה — מה שע״ם אומרת עכשיו ─────────────────────────
// ‼ 201 · הרכיב מצייר את shaamLifecycle בלבד — בלי מצב משלו. מה שמוצג כאן
// נגזר מהעובדות השמורות (execution.shaam[key]), ולכן זהה לפני ואחרי F5.
//
// חמש שאלות, בסדר הזה: הוגש? מה שע״ם אומרת? משהו נדרש מהמשרד? משהו נדרש
// מהלקוח? מה אבן הדרך הבאה ומתי?

import InfoLines from './ui/InfoLines';
import {
  shaamRequiredDocumentText, type ShaamLifecycleView, type ShaamRequiredDocument,
} from '../features/representation/shaamRepresentation';

function fmtDate(iso?: string): string {
  if (!iso) return '';
  const d = new Date(iso.length === 10 ? `${iso}T12:00:00` : iso);
  return isNaN(d.getTime()) ? iso : d.toLocaleDateString('he-IL');
}

function fmtDateTime(iso?: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return `${d.toLocaleDateString('he-IL')} ${d.toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' })}`;
}

/** מסמכים נוספים ששע״ם דרשה, ומה PIVO עשתה עם כל אחד (201). ריק ⇒ כלום. */
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

export default function ShaamLifecyclePanel({ view }: { view: ShaamLifecycleView }) {
  const sub = { fontSize: 'var(--fs-12)', color: 'var(--ink-3)', lineHeight: 1.7 } as const;
  return (
    <div data-testid="shaam-lifecycle" style={{ display: 'flex', flexDirection: 'column', gap: '.35rem' }}>
      {/* כשיש פעולת חובה ללקוח, התיבה שלה היא הכותרת — בלי לחזור עליה. */}
      {!view.clientAction && (
        <div style={{ fontSize: 'var(--fs-13)', color: 'var(--ink-2)', lineHeight: 1.6 }}>
          {view.headline}
        </div>
      )}

      {/* ‼ חובה של הלקוח — לא שורת עזר אפורה. בלי האישור שע״ם לא קולטת. */}
      {view.clientAction && (
        <div role="status" data-testid="shaam-client-action" style={{
          border: '1px solid var(--chip-orange-bd)', background: 'var(--warn-bg)', color: 'var(--ink-1)',
          borderRadius: 'var(--radius)', padding: '.5rem .65rem', fontSize: 'var(--fs-13)', lineHeight: 1.6,
        }}>
          <div style={{ fontWeight: 600 }}>
            {view.clientAction.title}
            <span style={{
              marginInlineStart: '.4rem', fontSize: 'var(--fs-12)', fontWeight: 600,
              color: 'var(--chip-orange-tx)', background: 'var(--chip-orange-bg)',
              border: '1px solid var(--chip-orange-bd)', borderRadius: 999, padding: '0 .45rem',
            }}>נדרש מהלקוח</span>
          </div>
          <div>{view.clientAction.text}</div>
        </div>
      )}

      {view.nextMilestone?.date && (
        <div style={{ fontSize: 'var(--fs-13)', color: 'var(--ink-2)' }}>
          {view.nextMilestone.text}: <strong>{fmtDate(view.nextMilestone.date)}</strong>
        </div>
      )}

      {view.reconciled && (view.requestStateRaw || view.systems.length > 0) && (
        <div style={sub} data-testid="shaam-states">
          {view.requestStateRaw && <div>מצב בקשה בשע״ם: {view.requestStateRaw}</div>}
          {view.systems.map((s, i) => (
            <div key={`${s.label}-${i}`}>מצב מערך · {s.label}: {s.raw || 'טרם עודכן בשע״ם'}</div>
          ))}
        </div>
      )}

      <InfoLines style={{ fontSize: 'var(--fs-12)' }} items={[
        view.note,
        view.officeAction && `למשרד: ${view.officeAction}`,
      ]} />

      <ShaamRequiredDocsList docs={view.requiredDocuments} />

      <div style={{ fontSize: 'var(--fs-12)', color: 'var(--ink-4)' }}>
        {view.submittedAt && <>הוגש לשע״ם: {fmtDateTime(view.submittedAt)}</>}
        {view.observedAt && view.reconciled && <> · נקרא משע״ם: {fmtDateTime(view.observedAt)}</>}
      </div>
    </div>
  );
}

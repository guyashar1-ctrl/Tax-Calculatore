// ─── מה שע״ם דורשת לשידור ייפוי הכוח — להגשה אחת (201/204) ─────────────────
// ‼ רק דרישות **של שע״ם** (execution.shaam[key]): מה נדרש, ממי, ואיפה השידור
// עומד. מסמך שהמשרד ביקש אינו כאן — הוא בקשה פתוחה ללקוח, ולא חוסם.
// ‼ בלי «נסה שוב»: כשחסר מסמך, השידור ממשיך מעצמו כשהמסמך מגיע (שרת, 204).
// כלי הצירוף מופיע רק כשהמשרד יכול לפתור בצירוף, והבעלים ידוע.

import type { ShaamRequestTracking } from '../features/representation/shaamRepresentation';
import { shaamDocumentsView, planStatusText } from '../features/representation/shaamDocumentsGate';
import IdentityDocAttach from './IdentityDocAttach';

interface Props {
  tracking?: ShaamRequestTracking;
  /** לצירוף צילום שהגיע למשרד. חסר ⇒ בלי כלי צירוף. */
  requestId?: string;
  clientId?: string;
  usedDocumentIds?: string[];
  onAttached?: () => void;
}

const TONE: Record<string, React.CSSProperties> = {
  wait: { background: 'var(--surface-2)', color: 'var(--ink-2)' },
  attention: { background: 'var(--orange-light, #fff4e5)', color: 'var(--ink-1)' },
  info: { background: 'var(--surface-2)', color: 'var(--ink-2)' },
  done: { background: 'transparent', color: 'var(--ink-3)' },
};

export function ShaamRequiredDocsList({ tracking, requestId, clientId, usedDocumentIds, onAttached }: Props) {
  const v = shaamDocumentsView(tracking);
  if (!v) return null;
  return (
    <div data-testid="shaam-required-docs" data-state={v.state ?? 'observed'}
      style={{ fontSize: 'var(--fs-13)', lineHeight: 1.7, marginTop: '.35rem', padding: '.45rem .6rem', borderRadius: 'var(--radius)', ...TONE[v.tone] }}>
      <div style={{ fontWeight: 600 }}>{v.title}</div>
      <div style={{ fontSize: 'var(--fs-12)', color: 'var(--ink-3)' }}>נדרש על ידי רשות המסים לשידור - לא קשור לחתימת הלקוח</div>
      {v.items.map((d, i) => (
        <div key={`${d.label}-${i}`} data-testid="shaam-required-doc">
          · {d.label}{d.personName ? <> של <b>{d.personName}</b></> : null}{d.handling ? ` - ${d.handling}` : ''}
        </div>
      ))}
      {v.plan.length > 0 && (
        <div data-testid="shaam-docs-plan" style={{ marginTop: '.3rem' }}>
          <div style={{ fontWeight: 600 }}>התוכנית שהוכנה (לא הועלתה):</div>
          {v.plan.map((p, i) => (
            <div key={`${p.label}-${i}`}>
              · «{p.label}»{p.personName ? ` של ${p.personName}` : ''}: {planStatusText(p.status)}
              {p.fileName ? ` · ${p.fileName}` : ''}{p.pageCount ? ` (${p.pageCount} עמ׳)` : ''}
            </div>
          ))}
        </div>
      )}
      {v.next && <div style={{ marginTop: '.25rem' }}>{v.next}</div>}
      {v.uploadDeadline && (
        <div data-testid="shaam-upload-deadline" style={{ marginTop: '.25rem', fontSize: 'var(--fs-12)', color: 'var(--ink-3)' }}>
          מועד אחרון בשע״ם: {v.uploadDeadline.split('-').reverse().join('.')} - בקשה שלא צורפו לה טפסים 30 יום מתבטלת.
        </div>
      )}
      {requestId && clientId && v.attach.length > 0 && (
        <IdentityDocAttach
          requestId={requestId} clientId={clientId}
          missing={v.attach.map((a) => ({ person: a.person, name: a.personName, kind: a.kind }))}
          usedDocumentIds={usedDocumentIds}
          onAttached={() => onAttached?.()}
        />
      )}
    </div>
  );
}

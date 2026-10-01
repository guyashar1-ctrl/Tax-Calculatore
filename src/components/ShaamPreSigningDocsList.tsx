// ─── 208 · מה שע״ם דורשת לבקשה — לפני השליחה לחתימה ─────────────────────────
// ‼ רשימה אחת להגשה: כל מסמך ששע״ם כתבה ביצירה («בהמשך תתבקש לצרף»), של מי,
// ובאיזה מצב — חסר / יש בתיק וממתין לאישור הלקוח / אושר. «יש בתיק» אינו אישור.
// ‼ 01.10.2026 · ה-PDF של הצילום מוכן ברקע (210) ומוצג ב«מסמכי הבקשה» — לא כאן.

import type { ShaamPreSigningDoc } from '../features/representation/shaamPreSigningDocs';
import IdentityDocAttach from './IdentityDocAttach';

interface Props {
  items: ShaamPreSigningDoc[];
  /** כותרת ההגשה, כשיש יותר מאחת (בני זוג). */
  title?: string;
  clientId?: string;
  /** לצירוף צילום שכבר בתיק לאדם (בלי ⇒ בלי כלי צירוף). */
  requestId?: string;
  usedDocumentIds?: string[];
  onChanged?: () => void;
}

const STATUS_COLOR: Record<string, string> = {
  to_sign: 'var(--ink-2)',
  signed: 'var(--success, #1f7a3d)',
  missing: 'var(--orange, #b45309)',
  awaiting_confirmation: 'var(--orange, #b45309)',
  confirmed: 'var(--success, #1f7a3d)',
  manual: 'var(--ink-2)',
};

export default function ShaamPreSigningDocsList({ items, title, clientId, requestId, usedDocumentIds, onChanged }: Props) {
  if (items.length === 0) return null;

  return (
    <div data-testid="shaam-presign-docs" style={{ fontSize: 'var(--fs-13)', lineHeight: 1.7, marginTop: '.4rem' }}>
      <div style={{ fontWeight: 600 }}>
        מה רשות המסים דורשת לבקשה הזאת{title ? ` · ${title}` : ''}
      </div>
      {items.map(d => {
        return (
          <div key={d.key} data-testid="shaam-presign-doc" data-status={d.status} style={{ marginTop: '.2rem' }}>
            {/* ‼ התווית היא הנוסח של שע״ם («… של הלקוח») — השם נוסף לידה, לא בתוכה. */}
            · {d.label}{d.kind !== 'poa' && d.personName ? <> · <b>{d.personName}</b></> : null}
            {' - '}<span style={{ color: STATUS_COLOR[d.status] }}>{d.statusText}</span>
            {d.documents.length > 1 && (
              <div style={{ fontSize: 'var(--fs-12)', color: 'var(--ink-3)', paddingInlineStart: '.8rem' }}>
                {d.documents.map((x, i) => `עמוד ${i + 1}: ${x.fileName || 'צילום'}`).join(' · ')}
              </div>
            )}
            {/* ‼ צילום שכבר הגיע למשרד (וואטסאפ וכד') — שיוך לאדם. אחרי השיוך הלקוח עדיין מתבקש לאשר. */}
            {d.status === 'missing' && clientId && requestId && (
              <div style={{ paddingInlineStart: '.8rem' }}>
                <IdentityDocAttach
                  requestId={requestId} clientId={clientId}
                  missing={[{ person: d.person, name: d.personName, kind: d.kind === 'passport' ? 'passport' : 'idOrLicense' }]}
                  usedDocumentIds={usedDocumentIds}
                  onAttached={() => onChanged?.()}
                />
              </div>
            )}
            {/* ‼ 01.10.2026 · ה-PDF מוכן ברקע (210) ומוצג ב«מסמכי הבקשה» — כאן אין «הכן PDF». */}
          </div>
        );
      })}
    </div>
  );
}

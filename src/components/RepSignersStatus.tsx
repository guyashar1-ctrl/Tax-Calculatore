// ─── חיווי מצב חתימה לכל חותם ──────────────────────────────────────────────
// מציג לכל חותם (נישום + בן/בת זוג) אם כבר חתם או ממתין לחתימה.
// מוצג רק כשיש יותר מחותם אחד (בקשת בני זוג).

import { RepresentationRequest } from '../types';
import { getRequestSigners, effectiveSignStatus, isSpouseRequest } from '../utils/repSigners';

interface Props {
  request: RepresentationRequest;
  compact?: boolean;   // שורה אחת (לצינור) במקום רשימה
}

export default function RepSignersStatus({ request, compact }: Props) {
  if (!isSpouseRequest(request)) return null;
  const signers = getRequestSigners(request);

  return (
    <div style={{
      display: 'flex',
      flexDirection: compact ? 'row' : 'column',
      flexWrap: 'wrap',
      gap: compact ? 12 : 6,
    }}>
      {signers.map(s => {
        const signed = effectiveSignStatus(request, s) === 'signed';
        return (
          <span
            key={s.id}
            title={s.email}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 5,
              fontSize: compact ? '.72rem' : '.82rem',
              color: signed ? 'var(--green-dark, var(--ok))' : 'var(--gray-600)',
              fontWeight: signed ? 600 : 400,
            }}
          >
            <span>👤</span>
            <span>{s.name}</span>
            <span>—</span>
            <span>{signed ? 'חתם/ה' : '⏳ ממתין/ה לחתימה'}</span>
          </span>
        );
      })}
    </div>
  );
}

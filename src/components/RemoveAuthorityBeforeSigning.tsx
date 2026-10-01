// ─── 208 · «הסר מהבקשה» — רשות שע״ם, לפני השליחה לחתימה ──────────────────────
// ‼ כתיבה אחת בשרת (remove_authority_before_signing): היקף הבקשה, המרשם בכרטיס,
// ומסמך החתימה של כל טופס שכולל את הרשות — נמחק מהחתימה, ולכן הגרסה הישנה לא
// יכולה לצאת ללקוח. טופס חדש מופק בלי הרשות.
// ‼ בקשה שכבר נפתחה בשע״ם: שע״ם מבטלת לפני קבלת המסמכים רק את כל הבקשה, ו-PIVO
// לא מבטלת שם. החלון אומר את זה לפני הלחיצה, והמעקב מסומן «להחלפה».
// ‼ ביטול ייצוג פעיל — לא כאן.

import { useState } from 'react';
import { createPortal } from 'react-dom';
import type { RepresentationRequest, RepTarget } from '../types';
import type { ScopeLine, ScopePeople } from '../utils/repScope';
import { targetName } from '../utils/repScope';
import { signatureDocumentsOf } from '../utils/repDocuments';
import { removeAuthorityBeforeSigning } from '../lib/representationSigning';
import ConfirmDialog from './ui/ConfirmDialog';

type ShaamAuthority = 'incomeTax' | 'vat' | 'withholding';
const SHAAM_AUTHORITIES: ShaamAuthority[] = ['incomeTax', 'vat', 'withholding'];
/** מה ששע״ם מציגה ב-requestedSystems/systems — להתאמה בלבד. */
const SYSTEM_LABEL: Record<ShaamAuthority, string> = { incomeTax: 'מס הכנסה', vat: 'מע"מ', withholding: 'ניכויים' };

/** האם אפשר עדיין להסיר רשות מהבקשה (לפני שהטופס יצא לחתימה). */
export function canRemoveBeforeSigning(request: RepresentationRequest): boolean {
  if (request.execution?.signatureEmailSentAt) return false;
  if (!['pending_fill', 'awaiting_accountant', 'pending_signature'].includes(request.status)) return false;
  return !(request.signers ?? []).some(s => s.signStatus === 'signed');
}

const norm = (s: string) => s.replace(/["״]/g, '');

export default function RemoveAuthorityBeforeSigning({ request, line, people, shaamAuthorityCount, onChanged }: {
  request: RepresentationRequest;
  line: ScopeLine;
  people: ScopePeople;
  /** כמה רשויות שע״ם בבקשה — האחרונה לא מוסרת (השרת דוחה ממילא). */
  shaamAuthorityCount: number;
  onChanged: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [who, setWho] = useState<RepTarget | 'both'>('both');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const auth = line.authority as ShaamAuthority;
  if (!SHAAM_AUTHORITIES.includes(auth) || !canRemoveBeforeSigning(request)) return null;
  if (shaamAuthorityCount <= 1 && !(auth !== 'incomeTax' && line.targets.length > 1)) return null;
  const perPerson = auth !== 'incomeTax' && line.targets.length > 1;
  // האחרונה — רק כשמסירים את כולה.
  const lastOne = shaamAuthorityCount <= 1 && (!perPerson || who === 'both');

  // מה יקרה — נגזר ממה שיש עכשיו: טפסים שהופקו, ובקשות שנפתחו בשע״ם.
  const docs = signatureDocumentsOf(request);
  const shaam = request.execution?.shaam ?? {};
  const affectedKeys = Object.keys(shaam).filter(k => {
    if (perPerson && who !== 'both' && k !== `person:${who}`) return false;
    const t = shaam[k];
    const sys = (t?.requestedSystems ?? []) as string[];
    return sys.length === 0 ? !!t?.requestNumber : sys.some(x => norm(x) === norm(SYSTEM_LABEL[auth]));
  });
  const openInShaam = affectedKeys.filter(k => shaam[k]?.requestNumber && !shaam[k]?.submittedAt);
  const formAffected = docs.length > 0;

  async function run() {
    setBusy(true); setErr(null);
    const res = await removeAuthorityBeforeSigning(request.id, auth, perPerson && who !== 'both' ? who : undefined);
    setBusy(false);
    if (!res.ok) { setErr(res.error); return; }
    setOpen(false);
    onChanged();
  }

  const whoText = perPerson && who !== 'both' ? ` של ${targetName(people, who)}` : '';
  return (
    <>
      <button type="button" className="rep-scope-remove" data-testid={`remove-authority-${auth}`}
        title={`הסר את ${line.authorityLabel} מהבקשה`}
        style={{ background: 'none', border: 'none', padding: '0 .2rem', marginInlineStart: '.2rem', cursor: 'pointer', color: 'var(--ink-3)', fontSize: 'var(--fs-12)', textDecoration: 'underline' }}
        onClick={() => { setErr(null); setWho('both'); setOpen(true); }}>
        הסר מהבקשה
      </button>
      {/* ‼ מחוץ לתגית: התגית היא nowrap, והחלון בתוכה לא שבר שורות. */}
      {open && createPortal(
        <ConfirmDialog
          tone="danger"
          title={`להסיר את ${line.authorityLabel}${whoText} מהבקשה?`}
          confirmLabel={busy ? 'מסיר…' : 'הסר מהבקשה'}
          onCancel={() => { if (!busy) setOpen(false); }}
          onConfirm={() => { if (!busy && !lastOne) void run(); }}
          message={<div data-testid="remove-authority-dialog" style={{ lineHeight: 1.7 }}>
            {perPerson && (
              <div style={{ marginBottom: '.5rem', display: 'flex', gap: '.8rem', flexWrap: 'wrap' }}>
                {(['both', ...line.targets] as const).map(t => (
                  <label key={t} style={{ display: 'flex', gap: '.3rem', alignItems: 'center', cursor: 'pointer' }}>
                    <input type="radio" name="remove-who" checked={who === t} onChange={() => setWho(t)} />
                    {t === 'both' ? 'לשניהם' : `רק ל${targetName(people, t)}`}
                  </label>
                ))}
              </div>
            )}
            {lastOne ? (
              <div>זו רשות השע״ם היחידה בבקשה - אין מה להשאיר.</div>
            ) : (
              <>
                <div>· {line.authorityLabel}{whoText} ייצא מהבקשה ומהכרטיס.</div>
                {formAffected && (
                  <div>· הטופס שהופק לחתימה בוטל ולא יישלח. יופק טופס חדש, רק עם מה שנשאר.</div>
                )}
                {openInShaam.length > 0 ? (
                  <div data-testid="remove-authority-shaam-warning">
                    · בשע״ם כבר נפתחה בקשה ({openInShaam.map(k => shaam[k]!.requestNumber).join(', ')}) שכוללת את {line.authorityLabel}.
                    לפני שהמסמכים התקבלו שע״ם מאפשרת לבטל רק את כל הבקשה - תצטרכו לבטל אותה שם, ואז לפתוח חדשה בלי {line.authorityLabel}.
                    PIVO לא מבטלת בשע״ם, ולא תפתח בקשה חדשה כל עוד הישנה פתוחה שם.
                  </div>
                ) : (
                  <div>· בשע״ם לא נפתחה עדיין בקשה - אין שם מה לעדכן.</div>
                )}
              </>
            )}
            {err && <div className="rep-track-next-err" style={{ marginTop: '.4rem' }}>{err}</div>}
          </div>}
        />,
        document.body,
      )}
    </>
  );
}

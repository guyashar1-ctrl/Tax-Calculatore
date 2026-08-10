// ─── "דף הלקוח עודכן — לשלוח מייל?" ─────────────────────────────────────────
// הכרעת D4 (docs/EMAIL-POLICY.md §9): פרסום ושליחה הן שתי החלטות נפרדות.
// הפרסום כבר קרה כשהחלון הזה נפתח; כאן שואלים — מיד, כדי שפרסום שקט לא
// יישכח — האם להודיע ללקוח. "שלח מייל" עובר לאותו מסלול שליחה קיים
// (SendPortalDialog: תצוגה מקדימה של המייל, או קישור לוואטסאפ).

import { useState } from 'react';
import SendPortalDialog from './SendPortalDialog';

export default function PublishCasePrompt({ clientId, clientName, clientEmail, onClose }: {
  clientId: string;
  clientName: string;
  clientEmail?: string;
  /** נקרא גם אחרי "לא עכשיו" וגם אחרי שליחה — ההורה מרענן כאן. */
  onClose: () => void;
}) {
  const [sending, setSending] = useState(false);

  if (sending) {
    return (
      <SendPortalDialog
        clientId={clientId}
        clientName={clientName}
        clientEmail={clientEmail}
        heading="שליחת הדף המעודכן ללקוח"
        onClose={onClose}
        onSent={onClose}
      />
    );
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" style={{ width: 430, maxWidth: '94vw' }} onClick={e => e.stopPropagation()}>
        <div className="modal-head">
          <h3 style={{ margin: 0 }}>דף הלקוח עודכן</h3>
        </div>
        <div className="modal-body">
          <p style={{ margin: 0, fontSize: 'var(--fs-14)', color: 'var(--ink-2)', lineHeight: 1.6 }}>
            השינויים פורסמו — {clientName} יראה אותם בכניסה הבאה לדף האישי.
            לשלוח לו עכשיו מייל עם הקישור?
          </p>
        </div>
        <div className="modal-foot" style={{ display: 'flex', gap: '.5rem', justifyContent: 'flex-start' }}>
          <button type="button" className="btn btn-primary" onClick={() => setSending(true)}>
            שלח מייל
          </button>
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            לא עכשיו
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── "הפיכת בן/בת הזוג ללקוח/ה" — שלב מעבר קל (159) ────────────────────────
//
// ‼ למה בכלל: עד עכשיו לחיצה על "פתיחת כרטיס לקוח ל-X" יצרה כרטיס מיד,
// ומשם המסך כבר דחף לייצוג מלא. זה נחווה כמו הרצה חוזרת של קליטת הזוג —
// בזמן שמה שבאמת קרה הוא **עובדה אחת חדשה**: לבן/בת הזוג יש עכשיו עסק.
// השלב הזה שואל רק את מה שהשתנה, ולא מייצר כרטיס עד שיש תשובה.
//
// ‼ שתי שאלות בדיוק, לא אשף. אין כאן שדות זהות (הם כבר על הכרטיס), אין
// רשויות (הן נבחרות בייצוג עצמו), ואין הצעת מחיר.
//
// ‼ שלוש התשובות שאינן "אנחנו" אינן מבוי סתום: "רו"ח אחר" כותב את העובדה
// הזאת לכרטיס (spouseRepresentedElsewhere) — שיפור מצב אמיתי — ו"עדיין לא
// הוחלט" פשוט סוגר בלי לשנות כלום. יצירת כרטיס קורית רק כשבאמת יש עסק
// שאנחנו מנהלים.

import { useState } from 'react';
import Modal from '../ui/Modal';

export type SpouseBusinessOwner = 'us' | 'other' | 'undecided';

interface Props {
  spouseName: string;
  /** ידוע כבר שיש עסק אצל רו"ח אחר — מזין מראש את שתי השאלות. */
  knownRepresentedElsewhere?: boolean;
  busy?: boolean;
  onCancel: () => void;
  /**
   * ההכרעה. `hasBusiness=false` או `owner!=='us'` ⇒ **לא** נוצר כרטיס;
   * הקורא רק רושם את העובדה (ראה App.tsx).
   */
  onConfirm: (decision: { hasBusiness: boolean; owner: SpouseBusinessOwner }) => void;
}

export default function SpouseToClientDialog({
  spouseName, knownRepresentedElsewhere, busy, onCancel, onConfirm,
}: Props) {
  const [hasBusiness, setHasBusiness] = useState<boolean | null>(
    knownRepresentedElsewhere ? true : null);
  const [owner, setOwner] = useState<SpouseBusinessOwner | null>(
    knownRepresentedElsewhere ? 'other' : null);

  const needsOwner = hasBusiness === true;
  const ready = hasBusiness === false || (needsOwner && owner !== null);
  const willCreate = hasBusiness === true && owner === 'us';

  return (
    <Modal
      title={`הפיכת ${spouseName} ללקוח/ה`}
      onClose={onCancel}
      width={460}
      footer={
        <>
          <button type="button" className="btn btn-secondary" onClick={onCancel} disabled={busy}>ביטול</button>
          <button
            type="button" className="btn btn-primary" disabled={!ready || busy}
            onClick={() => ready && onConfirm({ hasBusiness: hasBusiness!, owner: owner ?? 'undecided' })}
          >
            {busy ? 'רגע…' : willCreate ? 'פתיחת כרטיס לקוח' : 'שמירה'}
          </button>
        </>
      }
    >
      <div style={{ fontSize: 'var(--fs-13)', color: 'var(--ink-3)', lineHeight: 1.6, marginBottom: '.9rem' }}>
        {spouseName} כבר רשומ/ה כבן/בת הזוג. נשאר רק לעדכן מה השתנה - הפרטים
        והייצוג שכבר קיימים לא ייווצרו מחדש.
      </div>

      <div style={{ fontWeight: 600, fontSize: 'var(--fs-14)', marginBottom: '.4rem' }}>
        האם ל{spouseName} יש עסק?
      </div>
      <div style={{ display: 'flex', gap: '.4rem', marginBottom: '1rem', flexWrap: 'wrap' }}>
        {[{ v: true, l: 'כן' }, { v: false, l: 'לא' }].map(o => (
          <button
            key={String(o.v)} type="button" disabled={busy}
            className={`rep-who${hasBusiness === o.v ? ' is-on' : ''}`}
            onClick={() => { setHasBusiness(o.v); if (!o.v) setOwner(null); }}
          >
            {hasBusiness === o.v ? '✓ ' : ''}{o.l}
          </button>
        ))}
      </div>

      {needsOwner && (
        <>
          <div style={{ fontWeight: 600, fontSize: 'var(--fs-14)', marginBottom: '.4rem' }}>
            מי מטפל בעסק?
          </div>
          <div style={{ display: 'flex', gap: '.4rem', flexWrap: 'wrap' }}>
            {([
              { v: 'us' as const, l: 'אנחנו' },
              { v: 'other' as const, l: 'רו״ח אחר' },
              { v: 'undecided' as const, l: 'עדיין לא הוחלט' },
            ]).map(o => (
              <button
                key={o.v} type="button" disabled={busy}
                className={`rep-who${owner === o.v ? ' is-on' : ''}`}
                onClick={() => setOwner(o.v)}
              >
                {owner === o.v ? '✓ ' : ''}{o.l}
              </button>
            ))}
          </div>
        </>
      )}

      {/* ‼ אומרים מראש מה הלחיצה תעשה — כדי שהיא לא תיחווה כהסלמה. */}
      {ready && (
        <div style={{
          marginTop: '1rem', padding: '.6rem .75rem', borderRadius: 'var(--radius)',
          background: 'var(--surface-2)', fontSize: 'var(--fs-12)', color: 'var(--ink-3)', lineHeight: 1.6,
        }}>
          {willCreate
            ? `ייפתח כרטיס לקוח ל${spouseName}, מקושר לכרטיס הזה. הייצוג שכבר קיים לזוג לא יתבקש שוב - נבקש רק את מה שחסר.`
            : hasBusiness === false
              ? `לא ייפתח כרטיס. ${spouseName} תישאר/יישאר בן/בת זוג על הכרטיס הזה.`
              : owner === 'other'
                ? `לא ייפתח כרטיס. נסמן שיש עסק שמנוהל אצל רו״ח אחר.`
                : `לא ייפתח כרטיס כרגע. אפשר לחזור לכאן כשיוחלט.`}
        </div>
      )}
    </Modal>
  );
}

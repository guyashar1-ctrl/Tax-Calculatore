// ─── «הסר עבודה» — חלון אחד לכל מקום שבו מופיעה עבודת מס (14.10.2026) ─────────────────────────
// ‼ אותו חלון ב«עבודות לקוחות», בתיק המס («דוחות והצהרות»), ב«בקשות» ובדף העבודה עצמו — כדי שהפעולה תהיה זהה בכל מקום.
// ‼ השרת קובע אם זו מחיקה או ביטול (242); החלון מראה בדיוק מה יוצא ומה נשאר, לפני הלחיצה.

import { useEffect, useRef, useState } from 'react';
import * as api from './api';
import { removalExplain, type RemovalFacts, type RemovalMode } from './workRemoval';
import './taxWorkArea.css';

interface Props {
  stepId: string;
  /** «דוח שנתי 2025 · דוד כהן» — לכותרת. */
  title: string;
  onClose: () => void;
  /** אחרי הסרה או החזרה — לטעינה מחדש של הרשימה. */
  onDone: (what: 'deleted' | 'cancelled' | 'restored' | 'purged', text: string) => void;
  /** 21.10.2026 · «מחק» ישיר (גיא: «מחקתי — וחזר הישן»; «בבוטלו אין אופציה למחוק»): החלון נפתח ישר על «למחוק לגמרי». */
  purgeOnly?: boolean;
}

const ERR: Record<string, string> = {
  changed: 'המצב השתנה מאז שהחלון נפתח (למשל הלקוח ענה). בדקנו שוב — ראה למטה.',
  completed: 'העבודה הושלמה בינתיים — היא נשארת בהיסטוריה.',
  already_cancelled: 'העבודה כבר בוטלה.',
  superseded: 'בינתיים נפתחה עבודה חדשה לאותה תקופה. אי אפשר להחזיר את הישנה — ממשיכים בחדשה.',
  forbidden: 'אין הרשאה ללקוח הזה.',
  not_found: 'העבודה לא נמצאה — אולי כבר נמחקה.',
};

export default function RemoveWorkDialog({ stepId, title, onClose, onDone, purgeOnly }: Props) {
  const [state, setState] = useState<{ mode: RemovalMode; facts: RemovalFacts; restorable: boolean } | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [reason, setReason] = useState('');
  const [pick, setPick] = useState<'delete' | 'cancel' | 'purge'>('delete');
  // ‼ 20.10.2026 · «מחק לגמרי» (266): לבדיקות על הלקוח עצמו — גם תשובות, קבצים והזנה, כדי שלא ישפיעו על הדוח הבא
  const [purge, setPurge] = useState<api.PurgeCounts | null>(null);
  const firstRef = useRef<HTMLButtonElement>(null);

  const check = async () => {
    const r = await api.workRemovalCheck(stepId);
    if (!r.ok) { setErr(ERR[r.error] ?? `לא ניתן לבדוק (${r.error})`); return; }
    setState({ mode: r.mode, facts: r.facts, restorable: r.restorable });
    setPick(purgeOnly ? 'purge' : r.mode === 'cancel' ? 'cancel' : 'delete');
    const p = r.mode === 'delete' && !purgeOnly ? null : await api.purgeTaxWork(stepId, true);
    setPurge(p && p.ok ? p.counts : null);
    if (purgeOnly && p && !p.ok) setErr(ERR[p.error] ?? `אי אפשר למחוק (${p.error})`);
  };
  useEffect(() => { void check(); }, [stepId]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (state) firstRef.current?.focus(); }, [state]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !busy) onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [busy, onClose]);

  const run = async () => {
    if (!state) return;
    setBusy(true); setErr(null);
    if (pick === 'purge') {
      const r = await api.purgeTaxWork(stepId);
      setBusy(false);
      if (!r.ok) { setErr(ERR[r.error] ?? `המחיקה נכשלה (${r.error})`); return; }
      onDone('purged', 'נמחק. בפתיחה מחדש מתחילים ממה שבכרטיס.');
      return;
    }
    if (state.mode === 'none' && state.restorable && pick !== 'cancel') {
      const r = await api.restoreTaxWork(stepId);
      setBusy(false);
      if (!r.ok) { setErr(ERR[r.error] ?? `ההחזרה נכשלה (${r.error})`); return; }
      onDone('restored', `העבודה הוחזרה לרשימה הפעילה${r.asksKept ? ` — ${r.asksKept} שאלות לא חזרו כי נפתחו בעבודה אחרת` : ''}.`);
      return;
    }
    const r = await api.removeTaxWork(stepId, pick, reason);
    setBusy(false);
    if (!r.ok) { setErr(ERR[r.error] ?? `ההסרה נכשלה (${r.error})`); if (r.error === 'changed') void check(); return; }
    onDone(r.mode === 'delete' ? 'deleted' : 'cancelled', r.mode === 'delete'
      ? 'העבודה נמחקה. דבר לא יצא ממנה ללקוח.'
      : `העבודה בוטלה${r.asksClosed ? ` ו-${r.asksClosed} שאלות שלא נענו נסגרו` : ''}. מה שהתקבל נשמר. להחזרה: «תיק מס» ← «דוחות והצהרות» ← «היסטוריה».`);
  };

  const ex = state ? removalExplain(state.facts, pick === 'purge' ? 'cancel' : pick) : null;
  const canPurge = !!purge && !!state && (purgeOnly || state.mode === 'cancel' || state.facts.status === 'cancelled');
  const purgeGoes = purge ? [
    'הבקשה והשאלון',
    ...(purge.answers ? [`${purge.answers} תשובות`] : []),
    ...(purge.files ? [`${purge.files} קבצים שהועלו`] : []),
    ...(purge.facts ? ['מה שהוזן'] : []),
    ...(purge.cardUndo ? [`${purge.cardUndo} עדכונים שנכנסו לכרטיס`] : []),
    ...(purge.cardDropped ? [`${purge.cardDropped} הצעות לכרטיס`] : []),
  ] : [];
  const purgeStays = ['שאר הכרטיס', ...(purge?.cardKept ? [`${purge.cardKept} שדות בכרטיס ששונו אחר כך`] : []), 'יומן המיילים'];
  const canDelete = state?.mode === 'delete';
  const isRestore = state?.mode === 'none' && state.restorable;
  return (
    <div className="modal-backdrop" onClick={e => { if (e.target === e.currentTarget && !busy) onClose(); }}>
      <div className="modal rw" role="dialog" aria-modal="true" aria-labelledby="rw-h" data-remove-work>
        <div className="modal-head">
          <h3 id="rw-h">{purgeOnly ? 'מחיקה' : isRestore ? 'החזרת העבודה' : 'הסרת עבודה'} · {title}</h3>
          <button type="button" className="btn btn-sm btn-ghost" disabled={busy} onClick={onClose} aria-label="סגירה">✕</button>
        </div>
        <div className="modal-body rw-body">
          {!state && !err && <p className="ty-note" role="status">בודק מה כבר יצא מהעבודה…</p>}
          {err && <div className="ty-err" role="alert">{err}</div>}
          {state && ex && (
            <>
              {state.mode === 'none' && !isRestore && !purgeOnly && <p className="rw-why">{ex.why}</p>}
              {isRestore && pick !== 'purge' && <p className="rw-why">העבודה תחזור לרשימה הפעילה, ל«בקשות» ולדף האישי של הלקוח — עם השאלות שנסגרו בביטול.</p>}
              {canPurge && !purgeOnly && (
                <div className="rw-choice" role="radiogroup" aria-label="מה לעשות">
                  {state.mode === 'cancel' && (
                    <label className={`rw-opt${pick === 'cancel' ? ' is-on' : ''}`}>
                      <input type="radio" name="rw" checked={pick === 'cancel'} onChange={() => setPick('cancel')} />
                      <span><b>לבטל ולשמור</b></span>
                    </label>
                  )}
                  {isRestore && (
                    <label className={`rw-opt${pick !== 'purge' ? ' is-on' : ''}`}>
                      <input type="radio" name="rw" checked={pick !== 'purge'} onChange={() => setPick('delete')} />
                      <span><b>להחזיר לרשימה</b></span>
                    </label>
                  )}
                  <label className={`rw-opt${pick === 'purge' ? ' is-on' : ''}`} data-rw-purge>
                    <input type="radio" name="rw" checked={pick === 'purge'} onChange={() => setPick('purge')} />
                    <span><b>למחוק לגמרי</b><small>לבדיקות — כאילו לא נפתח</small></span>
                  </label>
                </div>
              )}
              {pick === 'purge' && purge && (
                <div className="rw-cols" data-rw-purge-list>
                  <div><b className="rw-h">נמחק</b><ul>{purgeGoes.map(x => <li key={x}>{x}</li>)}</ul></div>
                  <div><b className="rw-h">נשאר</b><ul>{purgeStays.map(x => <li key={x}>{x}</li>)}</ul></div>
                </div>
              )}
              {state.mode !== 'none' && pick !== 'purge' && (
                <>
                  {canDelete && (
                    <div className="rw-choice" role="radiogroup" aria-label="מה לעשות">
                      <label className={`rw-opt${pick === 'delete' ? ' is-on' : ''}`}>
                        <input type="radio" name="rw" checked={pick === 'delete'} onChange={() => setPick('delete')} />
                        <span><b>למחוק</b><small>נפתחה בטעות — לא משאירים זכר. דבר לא יצא ממנה.</small></span>
                      </label>
                      <label className={`rw-opt${pick === 'cancel' ? ' is-on' : ''}`}>
                        <input type="radio" name="rw" checked={pick === 'cancel'} onChange={() => setPick('cancel')} />
                        <span><b>לבטל ולשמור בהיסטוריה</b><small>לא נחוצה כרגע — נשארת ב«היסטוריה» ואפשר להחזיר.</small></span>
                      </label>
                    </div>
                  )}
                  <p className="rw-why">{ex.why}</p>
                  <div className="rw-cols">
                    <div><b className="rw-h">{pick === 'delete' && canDelete ? 'נמחק' : 'יוצא מהרשימה ונסגר'}</b>
                      <ul>{ex.goes.map(x => <li key={x}>{x}</li>)}</ul></div>
                    <div><b className="rw-h">נשאר</b>
                      <ul>{ex.stays.map(x => <li key={x}>{x}</li>)}</ul></div>
                  </div>
                  <label className="te-field rw-reason">למה (לא חובה — נשמר בהיסטוריה)
                    <input value={reason} onChange={e => setReason(e.target.value)} maxLength={200} placeholder="למשל: נפתח ללקוח הלא נכון" />
                  </label>
                  <p className="ty-note rw-safe">אין מייל ללקוח, ואין שינוי בכרטיס או ברשויות.</p>
                </>
              )}
            </>
          )}
        </div>
        <div className="modal-foot">
          {state && (purgeOnly ? canPurge : state.mode !== 'none' || isRestore) && (
            <button ref={firstRef} type="button" className={isRestore && pick !== 'purge' ? 'btn btn-primary' : 'btn btn-danger'} disabled={busy} onClick={() => void run()} data-rw-confirm>
              {busy ? 'רגע…' : pick === 'purge' ? 'מחק לגמרי' : isRestore ? 'החזר לרשימה' : pick === 'delete' && canDelete ? 'מחק את העבודה' : 'בטל את העבודה'}
            </button>
          )}
          <button ref={state && state.mode === 'none' && !isRestore ? firstRef : undefined} type="button" className="btn btn-ghost" disabled={busy} onClick={onClose}>
            {state && state.mode === 'none' && !isRestore ? 'סגירה' : 'לא עכשיו'}
          </button>
        </div>
      </div>
    </div>
  );
}

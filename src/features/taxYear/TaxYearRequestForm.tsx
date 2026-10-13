// ─── «＋ בקשה חדשה» › שנת מס: הערכת מס, דוח שנתי, הצהרת הון (229/230) וקליטה (236) ──
// ‼ בקשה אחת לכל לקוח + תכלית + שנה — השרת מחזיר את הקיימת אם יש (לחיצה כפולה,
// שתי לשוניות). בדוח שנתי לשנה שיש לה שאלון ישן — הבקשה מקושרת אליו, לא מסלול שני.

import { useState } from 'react';
import { ensureTaxFileIntake, ensureWealthDeclaration, ensureYearRequest } from './api';
import { MONTHS } from './asks';
import type { Purpose } from './types';
import { AVAILABLE } from '../taxKnowledge/availability';

interface Props {
  clientId: string;
  /** אחרי יצירה (או מציאת הקיימת) — לפתוח את דף התהליך. */
  onOpened: (stepId: string, created: boolean) => void;
}

export default function TaxYearRequestForm({ clientId, onOpened }: Props) {
  const now = new Date();
  const thisYear = now.getFullYear();
  const lastClosedMonth = now.getMonth() === 0 ? 12 : now.getMonth(); // החודש הקודם
  // ‼ הערכת מס (231–232) — רק כשהיא באתר; בחבילת האיסוף נפתחים דוח שנתי והצהרת הון.
  const [purpose, setPurpose] = useState<Purpose>(AVAILABLE.taxEstimate ? 'estimate' : 'annual');
  const [asOf, setAsOf] = useState(`${thisYear - 1}-12-31`);
  const [kind, setKind] = useState<'' | 'first' | 'followup'>('');
  const [year, setYear] = useState(AVAILABLE.taxEstimate ? thisYear : thisYear - 1);
  const [cutoff, setCutoff] = useState(lastClosedMonth);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const pick = (p: Purpose) => { setPurpose(p); if (p !== 'wealth') setYear(p === 'estimate' ? thisYear : thisYear - 1); };
  const years = purpose === 'estimate' ? [thisYear, thisYear - 1] : [thisYear - 1, thisYear - 2, thisYear - 3];

  const submit = async () => {
    setBusy(true); setErr(null);
    if (purpose === 'wealth' && !asOf) { setBusy(false); setErr('חסר יום הצהרה'); return; }
    const r = purpose === 'intake' ? await ensureTaxFileIntake(clientId)
      : purpose === 'wealth'
      ? await ensureWealthDeclaration(clientId, asOf, kind || undefined)
      : await ensureYearRequest(clientId, purpose, year, purpose === 'estimate' ? cutoff : undefined);
    setBusy(false);
    if (!r.ok) { setErr(r.error === 'forbidden' ? 'אין הרשאה ללקוח הזה' : `הפתיחה נכשלה (${r.error})`); return; }
    onOpened(r.stepId, r.created);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '.6rem' }}>
      <div role="radiogroup" aria-label="מה פותחים" style={{ display: 'flex', gap: '.4rem', flexWrap: 'wrap' }}>
        {([['intake', 'קליטה והשלמת תיק'], ['estimate', 'הערכת מס לשנה'], ['annual', 'דוח שנתי'], ['wealth', 'הצהרת הון']] as const).filter(([v]) => v !== 'estimate' || AVAILABLE.taxEstimate).map(([v, l]) => (
          <button key={v} type="button" role="radio" aria-checked={purpose === v} className={`btn btn-sm ${purpose === v ? 'btn-primary' : 'btn-ghost'}`} onClick={() => pick(v)}>{l}</button>
        ))}
      </div>
      <div style={{ display: 'flex', gap: '.6rem', flexWrap: 'wrap', alignItems: 'center', fontSize: 'var(--fs-13)' }}>
        {purpose === 'intake' ? null : purpose === 'wealth' ? (<>
          <label>יום ההצהרה{' '}<input type="date" value={asOf} onChange={e => setAsOf(e.target.value)} style={{ minHeight: 34 }} /></label>
          <label>סוג{' '}
            <select value={kind} onChange={e => setKind(e.target.value as '' | 'first' | 'followup')} style={{ minHeight: 34 }}>
              <option value="">לפי ההצהרות שבתיק</option><option value="first">ראשונה</option><option value="followup">המשך</option>
            </select>
          </label>
        </>) : (
        <label>שנת מס{' '}
          <select value={year} onChange={e => setYear(Number(e.target.value))} style={{ minHeight: 34 }}>{years.map(y => <option key={y} value={y}>{y}</option>)}</select>
        </label>)}
        {purpose === 'estimate' && (
          <label>נתוני אמת עד סוף{' '}
            <select value={cutoff} onChange={e => setCutoff(Number(e.target.value))} style={{ minHeight: 34 }}>
              {MONTHS.slice(1).map((m, k) => <option key={k + 1} value={k + 1}>{m}</option>)}
            </select>
          </label>
        )}
      </div>
      <div style={{ fontSize: 'var(--fs-12)', color: 'var(--ink-3)', lineHeight: 1.6 }}>
        {purpose === 'intake'
          ? 'השלמת התיק עצמו — מי הלקוח, מקורות ההכנסה, הנכסים והמסמכים הקבועים (תעודת זהות, תעודת עוסק, חוזי שכירות). מה שבתיק — הלקוח מאשר; מה שחסר — נשאל, ו«כן» פותח פרטים ומסמך. אין צורך בדוח שנתי כדי לאסוף את זה. בקשה פתוחה אחת ללקוח.'
          : purpose === 'wealth'
          ? 'הכנה לפי יום ההצהרה — אפשר גם בלי דרישה; המועד הרשמי והיעד הפנימי נרשמים בדף. בהצהרת המשך מייבאים את הקודמת ושואלים רק מה השתנה. אין כאן מילוי 1219 או הגשה.'
          : purpose === 'estimate'
          ? 'נפתח דף תהליך: מה כבר ידוע מהתיק, מה חסר, ושאלות רק על החסר. תשובות נשמרות עד סוף החודש שבחרת; היתרה — תחזית נפרדת.'
          : 'מה שידוע מהערכת המס לאותה שנה לא נשאל שוב — שואלים מה השתנה מאז, ומבקשים מסמכים סופיים לפי מועד הזמינות שלהם.'}
      </div>
      {err && <div style={{ color: 'var(--err)', fontSize: 'var(--fs-13)' }} role="alert">{err}</div>}
      <div><button type="button" className="btn btn-primary" disabled={busy} onClick={() => void submit()}>{busy ? 'פותח…' : 'פתח'}</button></div>
    </div>
  );
}

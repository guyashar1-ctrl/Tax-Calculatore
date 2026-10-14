// ─── רצועת ההדגמה — מה מדומה כאן ────────────────────────────────────────────
// ‼ רק בסביבות ההדגמה: staging (‎vite --mode staging‎) — המימוש עצמו על נתוני
// בדיקה, ו-‎?office-app‎ — אותו קוד על מסד מדומה בזיכרון. בבנייה לייצור לא מוצג.
// ב-staging שני דברים מדומים, ושניהם נאמרים כאן במפורש:
//   · ספק הדואר — fake-email-provider קולט את המיילים (לא יוצאים לאיש);
//   · השעון וה-cron — «הרץ את התזמון עכשיו» מפעיל את אותו מנגנון שה-cron מריץ
//     בייצור (demo_run_schedule ← kick_due_client_notices), ו«דלג לזמן התזכורת» מזיז זמנים.
import { useState } from 'react';
import { supabase } from '../../lib/supabase';
import DemoInbox from './DemoInbox';
import { TRIAL_BUILD } from '../../lib/trialBuild';
import './demo.css';

const STAGING = import.meta.env.MODE === 'staging';
const FAKE = import.meta.env.DEV && typeof window !== 'undefined'
  && (TRIAL_BUILD || new URLSearchParams(window.location.search).has('office-app'));

interface RunResult { ok?: boolean; error?: string; kicked?: number; remindersQueued?: number; officeFlushes?: number; advanced?: number }

export default function DemoBar() {
  const [busy, setBusy] = useState<null | 'now' | 'day'>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [inbox, setInbox] = useState(false);
  if (!STAGING && !FAKE) return null;
  if (TRIAL_BUILD) return <TrialBar />;

  if (!STAGING) {
    return (
      <div className="demo-bar" role="note">
        <b>הדגמה על נתונים מדומים</b>
        <span>הכול בזיכרון הדפדפן — שום דבר לא נשמר ולא נשלח. רענון מחזיר להתחלה.</span>
      </div>
    );
  }

  async function run(day: boolean) {
    setBusy(day ? 'day' : 'now');
    setMsg(null);
    const { data, error } = await supabase.rpc('demo_run_schedule', { p_simulate_day: day });
    setBusy(null);
    const r = (data ?? {}) as RunResult;
    if (error || r.ok === false) { setMsg('ההפעלה לא הצליחה — אפשר לנסות שוב.'); return; }
    if (!r.kicked && !r.remindersQueued && !r.officeFlushes) {
      setMsg(day
        ? 'אין מה לשלוח: אין מייל בתור, ואין בקשה שנמסרה ללקוח ושיש לה תזכורת.'
        : 'אין מה לשלוח — אין מייל בתור כרגע.');
      return;
    }
    const parts = [
      // ‼ «הועבר לשליחה» ולא «יצא»: השליחה עצמה עדיין יכולה להידחות (אין מה לבשר, אין כתובת).
      r.kicked ? `${r.kicked} ${r.kicked === 1 ? 'מייל הועבר לשליחה' : 'מיילים הועברו לשליחה'}` : 'אין מיילים בתור',
      r.remindersQueued ? `${r.remindersQueued} ${r.remindersQueued === 1 ? 'תזכורת' : 'תזכורות'}` : '',
      r.officeFlushes ? 'הודעות אליך נשלחו' : '',
    ].filter(Boolean);
    setMsg(`${parts.join(' · ')}. התוצאה מגיעה תוך כמה שניות — רעננו את המסך כדי לראות.`);
  }

  return (
    <>
      <div className="demo-bar" role="note">
        <b>סביבת הדגמה</b>
        <span className="demo-bar-long">
          נתוני בדיקה. מיילים לא יוצאים לאיש — נקלטים ב«תיבת ההדגמה». מה שבייצור קורה לבד כל 5 דקות, כאן קורה בלחיצה:
        </span>
        <span className="demo-bar-short">מיילים לא יוצאים לאיש</span>
        <span className="demo-bar-acts">
          <button type="button" className="demo-btn" disabled={busy !== null} onClick={() => void run(false)}>
            {busy === 'now' ? 'מריץ…' : <>הרץ את התזמון<span className="demo-bar-long"> עכשיו</span></>}
          </button>
          <button type="button" className="demo-btn" disabled={busy !== null} onClick={() => void run(true)}
            title="מה שנמסר ללקוח נחשב כאילו נמסר לפני מספר הימים שהשלב מגדיר לתזכורת — כדי לראות תזכורת יוצאת">
            {busy === 'day' ? 'מריץ…' : 'דלג לזמן התזכורת'}
          </button>
          <button type="button" className="demo-btn is-primary" onClick={() => setInbox(true)}>תיבת ההדגמה</button>
          {msg && <button type="button" className="demo-btn" onClick={() => window.location.reload()}>רענון</button>}
        </span>
        {msg && <span className="demo-msg" role="status">{msg}</span>}
      </div>
      {inbox && <DemoInbox onClose={() => setInbox(false)} />}
    </>
  );
}

/**
 * גרסת הניסיון לקריאה (trialBuild.ts). ‼ אומרת במפורש מה זה ומה לא אומת — גיא לומד
 * ממנה, ולכן אסור שתיראה כמו המערכת החיה או כמו ידע שהושלם.
 */
function TrialBar() {
  const [open, setOpen] = useState(false);
  const stamp = import.meta.env.VITE_TRIAL_STAMP as string | undefined;
  return (
    <div className="demo-bar trial-bar" role="note">
      <b>גרסת ניסיון לקריאה</b>
      <span>נתוני דוגמה בלבד · לא מחוברת לשום מסד · לא שולחת ולא פונה לרשויות</span>
      <button type="button" className="demo-btn" aria-expanded={open} onClick={() => setOpen(o => !o)}>{open ? 'סגירה' : 'מה לא מאומת'}</button>
      {open && (
        <ul className="trial-bar-list">
          <li><b>ידע המס:</b> אין נושא שהושלם. בראש כל נושא — מה עוד פתוח; ליד כל ערך — אם הוא רשמי, מחושב, משני או לא אומת.</li>
          <li><b>חישובים:</b> רק מה שמסומן כמחושב. מסלולים שמוסברים ולא מחושבים מציגים «אין תוצאה», לא מספר חלקי.</li>
          <li><b>הלקוחות, הבקשות והמסמכים:</b> הדגמה. מה שמשנים כאן נשאר בדפדפן הזה בלבד, וחלקו נמחק ברענון.</li>
          <li><b>שנות מס ו«עבודת מס» (שלב 2):</b> נבדקו בהדגמה, במסד מבודד ובסביבת בדיקות על לקוח בדיקה — לא בייצור.</li>
          <li><b>הצהרת הון (בתיק המס › «הצהרות הון»):</b> הכנה ואיסוף — בלי מילוי 1219, בלי השוואת הון ובלי הגשה. נבדקה גם בסביבת בדיקות על לקוח בדיקה. דרישה «מאומתת» רק מול אסמכתה; מועד ההגשה המחייב — רק מהמכתב.</li>
          <li><b>הערכת מס (שלב 3):</b> החישוב רץ על נתוני הדוגמה בלבד. קריאת 134, ב״ל ומע״מ — ידנית. ל-2026 נדרשת הכרעת משרד על כללי הליבה (מקור משני). שמירת גרסאות בשרת — עדיין לא בסביבת בדיקות.</li>
          <li><b>האתר הפעיל לא השתנה.</b> {stamp ? `גרסה מ-${stamp}; ` : ''}עדכונים יגיעו לאותו קישור.</li>
        </ul>
      )}
    </div>
  );
}

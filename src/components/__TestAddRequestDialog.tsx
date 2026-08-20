// ─── מסך בדיקה לחלון "+ בקשה" — נתונים מדומים ───────────────────────────────
// ‼ למה זה קיים: משתמש הבדיקות חסום ב-RLS, ולכן מקומית אין לקוח אמיתי שאפשר
// ליצור עליו בקשה — כל קריאה לשרת חוזרת ריקה. כאן מרכיבים את החלון על נתונים
// מדומים ולוכדים את מה שהיה נשלח לשרת, כדי לבדוק את שני המסכים (בקשה חופשית
// ומסמכים מהלקוח) בלי לגעת בנתוני אמת.
//
// פתיחה:  http://localhost:5173/?test-addrequest   (DEV בלבד)

import { useState } from 'react';
import type { OnboardingStep } from '../types/onboarding';
import { supabase } from '../lib/supabase';
import AddRequestDialog from './clientTabs/AddRequestDialog';

/** ההגדרות של "המשרד" — נשמרות בזיכרון, כדי לראות שהוספת מסמך אכן נדבקת. */
const store: { settings: Record<string, unknown> } = { settings: {} };
/** ‼ כל הקריאות ולא רק האחרונה: «חומרים מרו״ח קודם» יוצרת שלוש בקשות
 *  בלחיצה אחת, ורק הרשימה המלאה מוכיחה שכולן יצאו ובסדר הנכון. */
type RpcCall = {
  stepType: string; payload: unknown; dependsOn: unknown;
  owner: unknown; published: unknown; requiredForClose: unknown;
};
let calls: RpcCall[] = [];

const TEMPLATE_ROWS = [{
  id: 'tpl-docs', name: 'מסמכים מהלקוח', description: null, kind: 'request',
  office_id: null, seed_key: 'client_documents',
  entries: [{
    stepType: 'client_documents',
    payload: { checklist: [{ key: 'd1', label: 'אישור ניהול חשבון בנק', done: false }] },
  }],
}];

function chain(result: unknown) {
  const p = Promise.resolve(result);
  const obj: Record<string, unknown> = {};
  for (const k of ['select', 'eq', 'limit', 'order', 'in', 'neq']) obj[k] = () => obj;
  obj.maybeSingle = () => p;
  obj.single = () => p;
  obj.update = (row: { settings?: Record<string, unknown> }) => {
    if (row?.settings) store.settings = row.settings;
    return obj;
  };
  obj.then = (a: (v: unknown) => unknown, b?: (e: unknown) => unknown) => p.then(a, b);
  return obj;
}

function installStubs() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (supabase as any).from = (table: string) => {
    if (table === 'profiles') return chain({ data: { id: 'test-office', settings: store.settings }, error: null });
    if (table === 'journey_templates') return chain({ data: TEMPLATE_ROWS, error: null });
    return chain({ data: null, error: null });
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (supabase as any).rpc = (_name: string, args: Record<string, unknown>) => {
    const call: RpcCall = {
      stepType: args.p_step_type as string,
      payload: args.p_payload,
      dependsOn: args.p_depends_on,
      owner: args.p_owner ?? null,
      published: args.p_published,
      requiredForClose: args.p_required_for_close,
    };
    calls = [...calls, call];
    return Promise.resolve({ data: { ok: true, stepId: `step-${call.stepType}` }, error: null });
  };
  return true;
}

const STEPS: OnboardingStep[] = [];

/** לקוח שכבר יש לו את שאלת הפרטים — לבדיקת "משלים את החסר". */
const STEPS_WITH_DETAILS = [{
  id: 'existing-details', clientId: 'test-client', stepType: 'prev_accountant_details',
  status: 'pending', ball: 'client', payload: {},
}] as unknown as OnboardingStep[];

export default function TestAddRequestDialog() {
  useState(installStubs);
  const [open, setOpen] = useState(true);
  const [seq, setSeq] = useState(0);
  const [sent, setSent] = useState<string>('טרם נשלח');
  const [settingsView, setSettingsView] = useState<string>('{}');
  /** שני המשתנים שמשנים את «חומרים מרו״ח קודם»: אימייל על הכרטיס, ומה קיים כבר. */
  const [withEmail, setWithEmail] = useState(false);
  const [withDetails, setWithDetails] = useState(false);

  const refresh = () => {
    setSent(calls.length === 0 ? 'טרם נשלח' : JSON.stringify(calls, null, 2));
    setSettingsView(JSON.stringify(store.settings, null, 2));
  };

  const reopen = () => { calls = []; setSeq(n => n + 1); setOpen(true); refresh(); };

  return (
    <div style={{ padding: '1.5rem', maxWidth: 900, margin: '0 auto' }} dir="rtl">
      <h2 style={{ fontSize: 18 }}>בדיקת חלון «+ בקשה»</h2>
      <div style={{ display: 'flex', gap: '.5rem', margin: '.8rem 0', flexWrap: 'wrap', alignItems: 'center' }}>
        <button type="button" className="btn btn-primary" onClick={reopen}>פתיחת החלון (מאפס)</button>
        <button type="button" className="btn btn-secondary" onClick={refresh}>רענון התצוגה</button>
        <label style={{ display: 'flex', gap: '.35rem', alignItems: 'center', fontSize: 13 }}>
          <input type="checkbox" checked={withEmail} onChange={e => setWithEmail(e.target.checked)} />
          יש אימייל של הרו״ח הקודם בכרטיס
        </label>
        <label style={{ display: 'flex', gap: '.35rem', alignItems: 'center', fontSize: 13 }}>
          <input type="checkbox" checked={withDetails} onChange={e => setWithDetails(e.target.checked)} />
          שאלת הפרטים כבר קיימת
        </label>
      </div>

      <div style={{ display: 'grid', gap: '1rem', gridTemplateColumns: '1fr 1fr' }}>
        <div>
          <div style={{ fontSize: 13, fontWeight: 600 }}>מה נשלח לשרת ({calls.length} קריאות)</div>
          <pre style={{ direction: 'ltr', textAlign: 'left', fontSize: 12, background: 'var(--gray-50)', padding: '.6rem', overflow: 'auto', maxHeight: 380 }}>{sent}</pre>
        </div>
        <div>
          <div style={{ fontSize: 13, fontWeight: 600 }}>הגדרות המשרד שנשמרו</div>
          <pre style={{ direction: 'ltr', textAlign: 'left', fontSize: 12, background: 'var(--gray-50)', padding: '.6rem', overflow: 'auto', maxHeight: 380 }}>{settingsView}</pre>
        </div>
      </div>

      {open && (
        <AddRequestDialog
          key={`${seq}-${withEmail}-${withDetails}`}
          clientId="test-client"
          steps={withDetails ? STEPS_WITH_DETAILS : STEPS}
          processPublished={false}
          prevAccountantEmail={withEmail ? 'prev@example.com' : null}
          onClose={() => { setOpen(false); refresh(); }}
          onCreated={refresh}
        />
      )}
    </div>
  );
}

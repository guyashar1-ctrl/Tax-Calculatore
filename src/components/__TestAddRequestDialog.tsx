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
let lastCall: { stepType: string; payload: unknown; dueDate: unknown; published: unknown; requiredForClose: unknown } | null = null;

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
  (supabase as any).rpc = (name: string, args: Record<string, unknown>) => {
    lastCall = {
      stepType: args.p_step_type as string,
      payload: args.p_payload,
      dueDate: args.p_due_date,
      published: args.p_published,
      requiredForClose: args.p_required_for_close,
    };
    return Promise.resolve({ data: { ok: true, stepId: `step-${name}` }, error: null });
  };
  return true;
}

const STEPS: OnboardingStep[] = [];

export default function TestAddRequestDialog() {
  useState(installStubs);
  const [open, setOpen] = useState(true);
  const [seq, setSeq] = useState(0);
  const [sent, setSent] = useState<string>('טרם נשלח');
  const [settingsView, setSettingsView] = useState<string>('{}');

  const refresh = () => {
    setSent(JSON.stringify(lastCall, null, 2));
    setSettingsView(JSON.stringify(store.settings, null, 2));
  };

  return (
    <div style={{ padding: '1.5rem', maxWidth: 900, margin: '0 auto' }} dir="rtl">
      <h2 style={{ fontSize: 18 }}>בדיקת חלון «+ בקשה»</h2>
      <div style={{ display: 'flex', gap: '.5rem', margin: '.8rem 0' }}>
        <button type="button" className="btn btn-primary"
          onClick={() => { setSeq(n => n + 1); setOpen(true); }}>פתיחת החלון</button>
        <button type="button" className="btn btn-secondary" onClick={refresh}>רענון התצוגה</button>
      </div>

      <div style={{ display: 'grid', gap: '1rem', gridTemplateColumns: '1fr 1fr' }}>
        <div>
          <div style={{ fontSize: 13, fontWeight: 600 }}>מה נשלח לשרת</div>
          <pre style={{ direction: 'ltr', textAlign: 'left', fontSize: 12, background: 'var(--gray-50)', padding: '.6rem', overflow: 'auto', maxHeight: 380 }}>{sent}</pre>
        </div>
        <div>
          <div style={{ fontSize: 13, fontWeight: 600 }}>הגדרות המשרד שנשמרו</div>
          <pre style={{ direction: 'ltr', textAlign: 'left', fontSize: 12, background: 'var(--gray-50)', padding: '.6rem', overflow: 'auto', maxHeight: 380 }}>{settingsView}</pre>
        </div>
      </div>

      {open && (
        <AddRequestDialog
          key={seq}
          clientId="test-client"
          steps={STEPS}
          processPublished
          onClose={() => { setOpen(false); refresh(); }}
          onCreated={refresh}
        />
      )}
    </div>
  );
}

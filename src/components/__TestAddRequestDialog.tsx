// ─── מסך בדיקה לחלון "+ בקשה" — נתונים מדומים ───────────────────────────────
// ‼ למה זה קיים: משתמש הבדיקות חסום ב-RLS, ולכן מקומית אין לקוח אמיתי שאפשר
// ליצור עליו בקשה — כל קריאה לשרת חוזרת ריקה. כאן מרכיבים את החלון על נתונים
// מדומים ולוכדים את מה שהיה נשלח לשרת, כדי לבדוק את שני המסכים (בקשה חופשית
// ומסמכים מהלקוח) בלי לגעת בנתוני אמת.
//
// פתיחה:  http://localhost:5173/?test-addrequest   (DEV בלבד)

import { useEffect, useState } from 'react';
import type { OnboardingStep } from '../types/onboarding';
import { supabase } from '../lib/supabase';
import AddRequestDialog from './clientTabs/AddRequestDialog';

/** ההגדרות של "המשרד" — נשמרות בזיכרון, כדי לראות שהוספת מסמך אכן נדבקת.
 *  ‼ ספריית המסמכים נטענת מראש: בלעדיה מסך «שליחת מסמכים ללקוח» מציג בורר
 *  ריק, ואי אפשר לבדוק את מה שהוא בא לעשות. */
const store: { settings: Record<string, unknown>; docs: Record<string, unknown>[] } = {
  docs: [],
  settings: {
    client_documents: [
      { id: 'doc_a', label: 'מדריך הוצאות מוכרות', url: 'https://example.com/a.pdf',
        path: 'x/a.pdf', fileName: 'מדריך הוצאות v2.pdf', at: '2026-08-01T00:00:00Z' },
      { id: 'doc_b', label: 'נוהל העבודה במשרד', url: 'https://example.com/b.pdf',
        path: 'x/b.pdf', fileName: 'נוהל עבודה.pdf', at: '2026-08-01T00:00:00Z' },
    ],
  },
};

/** התיק של הלקוח — כולל מסמך אחד עם *משפט* במקום שם, כדי לראות שהקיצור
 *  לשם הקובץ עובד ושהלקוח לא מקבל פסקה ככותרת. */
const CLIENT_DOCS = [
  { id: 'd1', client_id: 'test-client', file_name: 'שומה 2024.pdf', file_type: 'application/pdf',
    file_size: 12345, category: 'other', year: '2024', uploaded_at: '2026-08-20T10:00:00Z',
    description: 'שומת מס 2024', notes: '', folder_id: null, label_id: 'lbl-1' },
  { id: 'd2', client_id: 'test-client', file_name: 'הסכם התקשרות - הצעה 2026-008.pdf',
    file_type: 'application/pdf', file_size: 358079, category: 'other', year: 'general',
    uploaded_at: '2026-08-16T10:00:00Z', notes: '', folder_id: null, label_id: null,
    description: 'הצעת מחיר 2026-008 שאושרה ונחתמה על ידי רונית זרימה — נשמרה אוטומטית עם פתיחת הלקוח' },
];

const LABELS = [
  { id: 'lbl-1', user_id: 'test-office', name: 'מס הכנסה', sort_order: 1, is_reserved: false },
  { id: 'lbl-r', user_id: 'test-office', name: 'לבדיקה', sort_order: 99, is_reserved: true },
];
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
  // saveDoc עושה upsert על 'documents' — הקובץ שהועלה נכנס לתיק המדומה.
  obj.upsert = (row: Record<string, unknown>) => {
    store.docs = [row, ...store.docs];
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
    if (table === 'documents') return chain({ data: store.docs, error: null });
    if (table === 'document_labels') return chain({ data: LABELS, error: null });
    return chain({ data: null, error: null });
  };
  // ‼ העלאה מהמחשב נשמרת בזיכרון בלבד: המסך אמור להראות שהקובץ נכנס לתיק
  // *ומיד נבחר לשליחה*, וזה כל מה שנבדק כאן — בלי לגעת ב-Storage אמיתי.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (supabase as any).storage = {
    from: () => ({
      upload: () => Promise.resolve({ data: { path: 'stub' }, error: null }),
      remove: () => Promise.resolve({ data: null, error: null }),
    }),
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  // ‼ ארגומנטים אופציונליים: useAuth קורא ל-is_authorized() בלי args, ובלי
  // ההגנה הזאת החלון נופל עוד לפני שהוא מצייר.
  (supabase as any).rpc = (_name: string, args: Record<string, unknown> = {}) => {
    if (!args.p_step_type) return Promise.resolve({ data: true, error: null });
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
  useState(() => { store.docs = [...CLIENT_DOCS]; return installStubs(); });
  const [open, setOpen] = useState(true);
  const [seq, setSeq] = useState(0);
  const [sent, setSent] = useState<string>('טרם נשלח');
  const [settingsView, setSettingsView] = useState<string>('{}');
  /** שני המשתנים שמשנים את «חומרים מרו״ח קודם»: אימייל על הכרטיס, ומה קיים כבר. */
  const [withEmail, setWithEmail] = useState(false);
  const [withDetails, setWithDetails] = useState(false);
  /** ברירת המחדל היא **בלי** קליטה — התרחיש שדווח (לקוח מיוצג, בלי התקשרות). */
  const [hasIntake, setHasIntake] = useState(false);
  /** ‼ נפתח ישר על «שליחת מסמכים ללקוח» עם קובץ מסומן — כמו הקיצור מתיקיית
   *  המסמכים. `?test-addrequest&send` מאפשר גם צילום בכרום ללא-ראש. */
  const [sendMode, setSendMode] = useState(
    typeof window !== 'undefined' && window.location.search.includes('send'));

  /**
   * `?test-addrequest&upload` — מזריק קובץ מהמחשב לתוך החלון, כדי שאפשר יהיה
   * לראות (ולצלם) את שורת התיוק שמופיעה רק להעלאה חדשה.
   * ‼ נוגע ב-DOM ולא ב-props של החלון: זה נתיב בדיקה בלבד, ואין סיבה
   * שהרכיב האמיתי יכיר אותו.
   */
  useEffect(() => {
    if (typeof window === 'undefined' || !window.location.search.includes('upload')) return;
    const t = window.setInterval(() => {
      const input = document.querySelector<HTMLInputElement>('.modal input[type=file]');
      if (!input) return;
      window.clearInterval(t);
      const dt = new DataTransfer();
      // שניים, כי זה בדיוק המקרה שבו לכל קובץ צריך תיוק משלו.
      dt.items.add(new File(['%PDF-1.4 a'], 'פטור מניכוי מס במקור.pdf', { type: 'application/pdf' }));
      dt.items.add(new File(['%PDF-1.4 b'], 'אישור ניהול ספרים.pdf', { type: 'application/pdf' }));
      input.files = dt.files;
      input.dispatchEvent(new Event('change', { bubbles: true }));
    }, 200);
    return () => window.clearInterval(t);
  }, []);

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
        {/* ‼ המתג שבודק את הבאג שדווח: ללקוח מיוצג בלי התקשרות אין קליטה,
            ולכן «נדרש לסגירת הקליטה» לא אמור להופיע בחלון בכלל. */}
        <label style={{ display: 'flex', gap: '.35rem', alignItems: 'center', fontSize: 13 }}>
          <input type="checkbox" checked={hasIntake} onChange={e => setHasIntake(e.target.checked)} />
          ללקוח יש קליטה פתוחה (התקשרות במצב onboarding)
        </label>
        <label style={{ display: 'flex', gap: '.35rem', alignItems: 'center', fontSize: 13 }}>
          <input type="checkbox" checked={sendMode} onChange={e => setSendMode(e.target.checked)} />
          לפתוח על «שליחת מסמכים» עם קובץ מסומן
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
          key={`${seq}-${withEmail}-${withDetails}-${sendMode}-${hasIntake}`}
          clientId="test-client"
          steps={withDetails ? STEPS_WITH_DETAILS : STEPS}
          processPublished={false}
          intake={hasIntake ? { state: 'open', engagementId: 'eng-test' } : { state: 'none' }}
          presetDocuments={sendMode
            ? [{ documentId: 'd1', label: 'שומת מס 2024', fileName: 'שומה 2024.pdf' }]
            : undefined}
          prevAccountantEmail={withEmail ? 'prev@example.com' : null}
          onClose={() => { setOpen(false); refresh(); }}
          onCreated={refresh}
        />
      )}
    </div>
  );
}

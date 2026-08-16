// ─── "+ בקשה" — הוספת בקשה למסע של הלקוח ────────────────────────────────────
// עד היום אפשר היה רק להדליק ולכבות את מה שהמרכיב בשרת יצר. כאן מוסיפים:
// בקשה מהקטלוג, או בקשה חופשית שהרו"ח מרכיב בעצמו.
//
// ‼ בקשה שנוצרת אחרי שהתהליך כבר נפתח ללקוח נולדת כטיוטה — היא מופיעה אצל
// הרו"ח ולא אצל הלקוח, עד שהוא לוחץ "שלח ללקוח". בלי זה כל תיקון קטן בניסוח
// היה קופץ מיד למסך של הלקוח.

import { useMemo, useState } from 'react';
import type { CustomRequirement, CustomRequirementKind, OnboardingStep } from '../../types/onboarding';
import { REQUIREMENT_KIND_LABELS, STEP_TYPE_LABELS } from '../../types/onboarding';
import { supabase } from '../../lib/supabase';

/** מה אפשר להוסיף ידנית. שלב הייצוג אינו כאן — הוא מסונכרן מבקשת הייצוג. */
const CATALOG: { type: string; hint: string; once: boolean }[] = [
  { type: 'client_documents',       hint: 'רשימת מסמכים שהלקוח מעלה בדף האישי', once: true },
  { type: 'prev_accountant_details', hint: 'הלקוח מוסר שם, מייל וטלפון של הקודם', once: true },
  { type: 'release_letter',         hint: 'מכתב שחרור — נשלח לרו״ח הקודם', once: true },
  { type: 'materials_received',     hint: 'מעקב אחרי החומרים שמגיעים ממנו', once: true },
  { type: 'paperless_invite',       hint: 'הזמנת הלקוח לפייפרלס', once: true },
  { type: 'retainer_authorization', hint: 'הרשאה לחיוב חודשי', once: true },
  { type: 'intake_questionnaire',   hint: 'רענון תיק המס — שאלון ומסמכים לפי מה שחסר', once: true },
  { type: 'kyc_identification',     hint: 'הכרת הלקוח — אישור ידני', once: true },
  { type: 'file_opening',           hint: 'פתיחת תיקים ברשויות', once: true },
];

const KINDS: CustomRequirementKind[] = ['confirm', 'text', 'file'];

interface Props {
  clientId: string;
  steps: OnboardingStep[];
  /** לפני פרסום התהליך אין מושג "טיוטה" — הכל ממילא עוד לא נחשף. */
  processPublished: boolean;
  /**
   * סוג בקשה מסומן מראש — לנקודת כניסה הקשרית (למשל "עדכון סטטוס מס"
   * מתוך תיק מס). ‼ זו אינה זרימה שנייה: אותו חלון, אותו state, ואותה
   * קריאת create_onboarding_request. ההבדל היחיד הוא שמדלגים על הקטלוג.
   */
  presetType?: OnboardingStep['stepType'];
  onClose: () => void;
  onCreated: () => void;
}

export default function AddRequestDialog({ clientId, steps, processPublished, presetType, onClose, onCreated }: Props) {
  const [mode, setMode] = useState<'catalog' | 'custom' | 'documents'>('catalog');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // בקשה חופשית
  const [title, setTitle] = useState('');
  const [clientTitle, setClientTitle] = useState('');
  const [clientSub, setClientSub] = useState('');
  const [clientCta, setClientCta] = useState('למילוי');
  /** האם הבקשה חוסמת סגירת קליטה. ברירת מחדל: כן — בקשה שביקשתי היא עבודה. */
  const [requiredForClose, setRequiredForClose] = useState(true);
  const [reqs, setReqs] = useState<{ kind: CustomRequirementKind; label: string }[]>([
    { kind: 'confirm', label: '' },
  ]);
  // מסמכים מהלקוח
  const [docLines, setDocLines] = useState('אישור ניהול חשבון בנק\nצילום תעודת זהות');

  const [dueDate, setDueDate] = useState('');
  const [dependsOn, setDependsOn] = useState('');
  const [sendNow, setSendNow] = useState(!processPublished);

  const existing = useMemo(
    () => new Set(steps.filter(s => s.status !== 'cancelled').map(s => s.stepType)),
    [steps],
  );
  const available = CATALOG.filter(c => !(c.once && existing.has(c.type as OnboardingStep['stepType'])));
  const dependencyOptions = steps.filter(s => s.status !== 'cancelled');

  async function create(stepType: string, payload: Record<string, unknown>) {
    setBusy(true);
    setError(null);
    const { data, error: rpcError } = await supabase.rpc('create_onboarding_request', {
      p_client_id: clientId,
      p_step_type: stepType,
      p_payload: payload,
      p_due_date: dueDate || null,
      p_depends_on: dependsOn || null,
      p_published: processPublished ? sendNow : true,
      p_required_for_close: requiredForClose,
    });
    setBusy(false);
    const res = data as { ok?: boolean; error?: string } | null;
    if (rpcError || !res?.ok) {
      setError(ERRORS[res?.error ?? ''] ?? friendly(rpcError?.message));
      return;
    }
    onCreated();
    onClose();
  }

  function submitCustom() {
    const clean = reqs.map(r => r.label.trim()).filter(Boolean);
    if (clean.length !== reqs.length || reqs.length === 0) {
      setError('לכל דרישה צריך תיאור — מה בדיוק הלקוח צריך לעשות.');
      return;
    }
    const requirements: CustomRequirement[] = reqs.map((r, i) => ({
      key: `r${i + 1}`, kind: r.kind, label: r.label.trim(), done: false,
    }));
    void create('custom_request', {
      title: title.trim() || 'בקשה מהמשרד',
      clientTitle: clientTitle.trim() || title.trim() || 'בקשה מהמשרד',
      clientSub: clientSub.trim() || undefined,
      clientCta: clientCta.trim() || 'למילוי',
      requirements,
    });
  }

  function submitDocuments() {
    const items = docLines.split('\n').map(s => s.trim()).filter(Boolean);
    if (items.length === 0) { setError('צריך לפחות מסמך אחד ברשימה.'); return; }
    void create('client_documents', {
      checklist: items.map((label, i) => ({ key: `d${i + 1}`, label, done: false })),
      clientTitle: `להעלות ${items.length} מסמכים`,
      clientSub: items.join(' · '),
      clientCta: 'להעלאה',
    });
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" style={{ maxWidth: 560 }} onClick={e => e.stopPropagation()}>
        <div className="modal-head">
          <h3 style={{ margin: 0, fontSize: 'var(--fs-16)' }}>
            {presetType ? STEP_TYPE_LABELS[presetType]
              : mode === 'catalog' ? 'הוספת בקשה'
              : mode === 'custom' ? 'בקשה חופשית'
              : 'מסמכים מהלקוח'}
          </h3>
          <button type="button" className="btn btn-sm btn-ghost" onClick={onClose} aria-label="סגירה">✕</button>
        </div>

        <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '.7rem' }}>
          {error && (
            <div style={{
              padding: '.5rem .7rem', borderRadius: 'var(--radius)',
              background: 'var(--red-light)', color: 'var(--err)', fontSize: 'var(--fs-13)',
            }}>⚠ {error}</div>
          )}

          {/* ‼ נקודת כניסה הקשרית (תיק מס). אותה בקשה, אותו RPC — רק בלי
              לבחור מהקטלוג. אם כבר קיימת בקשה פתוחה מהסוג הזה לא יוצרים
              שנייה: הכפילות היא בדיוק מה שהמודל המאוחד בא למנוע. */}
          {presetType && (
            existing.has(presetType) ? (
              <div className="cw-empty">
                כבר קיימת בקשת {STEP_TYPE_LABELS[presetType]} פתוחה ללקוח. אפשר לנהל אותה מלשונית «בקשות».
              </div>
            ) : (
              <div style={{ fontSize: 'var(--fs-13)', color: 'var(--ink-3)' }}>
                הבקשה תיווצר במודל הבקשות המאוחד ותופיע ללקוח בדף האישי — כמו כל בקשה אחרת.
              </div>
            )
          )}

          {mode === 'catalog' && !presetType && (
            <>
              {available.length === 0 && (
                <div className="cw-empty">כל הבקשות מהקטלוג כבר קיימות אצל הלקוח.</div>
              )}
              {available.map(c => (
                <button
                  key={c.type}
                  type="button"
                  disabled={busy}
                  onClick={() => {
                    if (c.type === 'client_documents') { setMode('documents'); return; }
                    void create(c.type, {});
                  }}
                  style={rowBtn}
                >
                  <span style={{ fontWeight: 600 }}>{STEP_TYPE_LABELS[c.type as OnboardingStep['stepType']]}</span>
                  <span style={{ fontSize: 'var(--fs-12)', color: 'var(--ink-3)' }}>{c.hint}</span>
                </button>
              ))}

              <button type="button" disabled={busy} onClick={() => setMode('custom')} style={rowBtn}>
                <span style={{ fontWeight: 600 }}>בקשה חופשית</span>
                <span style={{ fontSize: 'var(--fs-12)', color: 'var(--ink-3)' }}>
                  אתה מגדיר מה הלקוח צריך לעשות — לאשר, לענות, או להעלות
                </span>
              </button>
            </>
          )}

          {mode === 'documents' && (
            <>
              <label style={lbl}>
                אילו מסמכים לבקש — שורה לכל מסמך
                <textarea rows={5} value={docLines} onChange={e => setDocLines(e.target.value)}
                  className="input" style={{ resize: 'vertical' }} />
              </label>
              <Shared {...{ dueDate, setDueDate, dependsOn, setDependsOn, dependencyOptions, processPublished, sendNow, setSendNow, requiredForClose, setRequiredForClose }} />
            </>
          )}

          {mode === 'custom' && (
            <>
              <label style={lbl}>
                שם הבקשה — מה שאני רואה
                <input className="input" value={title} onChange={e => setTitle(e.target.value)}
                  placeholder="למשל: פרטי הרכב לצורך הכרה בהוצאות" />
              </label>

              <div style={{
                borderInlineStart: '3px solid var(--hairline-2)', paddingInlineStart: '.6rem',
                display: 'flex', flexDirection: 'column', gap: '.5rem',
              }}>
                <div style={{ fontSize: 'var(--fs-12)', color: 'var(--ink-3)' }}>מה הלקוח רואה בדף האישי</div>
                <label style={lbl}>
                  כותרת
                  <input className="input" value={clientTitle} onChange={e => setClientTitle(e.target.value)}
                    placeholder="ריק ⇒ אותו שם כמו למעלה" />
                </label>
                <label style={lbl}>
                  משפט הסבר
                  <input className="input" value={clientSub} onChange={e => setClientSub(e.target.value)} />
                </label>
                <label style={lbl}>
                  טקסט הכפתור
                  <input className="input" value={clientCta} onChange={e => setClientCta(e.target.value)} />
                </label>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '.35rem' }}>
                <div style={{ fontSize: 'var(--fs-13)', fontWeight: 600 }}>מה נדרש ממנו</div>
                {reqs.map((r, i) => (
                  <div key={i} style={{ display: 'flex', gap: '.35rem', alignItems: 'center' }}>
                    <select className="input" style={{ width: 130 }} value={r.kind}
                      onChange={e => setReqs(list => list.map((x, j) =>
                        j === i ? { ...x, kind: e.target.value as CustomRequirementKind } : x))}>
                      {KINDS.map(k => <option key={k} value={k}>{REQUIREMENT_KIND_LABELS[k]}</option>)}
                    </select>
                    <input className="input" style={{ flex: 1 }} value={r.label}
                      placeholder="מה בדיוק צריך"
                      onChange={e => setReqs(list => list.map((x, j) =>
                        j === i ? { ...x, label: e.target.value } : x))} />
                    {reqs.length > 1 && (
                      <button type="button" className="btn btn-sm btn-ghost" aria-label="הסרה"
                        onClick={() => setReqs(list => list.filter((_, j) => j !== i))}>✕</button>
                    )}
                  </div>
                ))}
                <button type="button" className="btn btn-sm btn-ghost" style={{ alignSelf: 'flex-start' }}
                  onClick={() => setReqs(list => [...list, { kind: 'confirm', label: '' }])}>
                  + עוד דרישה
                </button>
              </div>

              <Shared {...{ dueDate, setDueDate, dependsOn, setDependsOn, dependencyOptions, processPublished, sendNow, setSendNow, requiredForClose, setRequiredForClose }} />
            </>
          )}

          {presetType && !existing.has(presetType) && (
            <Shared {...{ dueDate, setDueDate, dependsOn, setDependsOn, dependencyOptions, processPublished, sendNow, setSendNow, requiredForClose, setRequiredForClose }} />
          )}
        </div>

        <div className="modal-foot" style={{ display: 'flex', gap: '.4rem', justifyContent: 'flex-end' }}>
          {mode !== 'catalog' && !presetType && (
            <button type="button" className="btn btn-secondary" disabled={busy}
              onClick={() => { setMode('catalog'); setError(null); }}>חזרה</button>
          )}
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            {presetType && existing.has(presetType) ? 'סגור' : 'ביטול'}
          </button>
          {presetType && !existing.has(presetType) && (
            <button type="button" className="btn btn-primary" disabled={busy}
              onClick={() => { void create(presetType, {}); }}>
              {busy ? 'מוסיף…' : 'הוסף בקשה'}
            </button>
          )}
          {mode === 'custom' && !presetType && (
            <button type="button" className="btn btn-primary" disabled={busy} onClick={submitCustom}>
              {busy ? 'מוסיף…' : 'הוסף בקשה'}
            </button>
          )}
          {mode === 'documents' && !presetType && (
            <button type="button" className="btn btn-primary" disabled={busy} onClick={submitDocuments}>
              {busy ? 'מוסיף…' : 'הוסף בקשה'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

/** שדות שמשותפים לכל סוגי הבקשות — יעד, תלות, ומתי הלקוח יראה. */
function Shared({
  dueDate, setDueDate, dependsOn, setDependsOn, dependencyOptions,
  processPublished, sendNow, setSendNow, requiredForClose, setRequiredForClose,
}: {
  dueDate: string; setDueDate: (v: string) => void;
  dependsOn: string; setDependsOn: (v: string) => void;
  dependencyOptions: OnboardingStep[];
  processPublished: boolean;
  sendNow: boolean; setSendNow: (v: boolean) => void;
  requiredForClose: boolean; setRequiredForClose: (v: boolean) => void;
}) {
  return (
    <>
      <div style={{ display: 'flex', gap: '.5rem', flexWrap: 'wrap' }}>
        <label style={{ ...lbl, flex: 1, minWidth: 150 }}>
          תאריך יעד (לא חובה)
          <input type="date" className="input" value={dueDate} onChange={e => setDueDate(e.target.value)} />
        </label>
        <label style={{ ...lbl, flex: 1, minWidth: 180 }}>
          ייפתח רק אחרי (לא חובה)
          <select className="input" value={dependsOn} onChange={e => setDependsOn(e.target.value)}>
            <option value="">— בלי תלות —</option>
            {dependencyOptions.map(s => (
              <option key={s.id} value={s.id}>{STEP_TYPE_LABELS[s.stepType]}</option>
            ))}
          </select>
        </label>
      </div>

      {/* ‼ בקרה אחת, שורה אחת: האם הבקשה חוסמת סגירת קליטה. אותו סוג בקשה
          יכול להיות חובה במסע אחד ורשות במסע אחר, ולכן זו החלטה לכל בקשה. */}
      <label style={{ display: 'flex', gap: '.4rem', alignItems: 'center', fontSize: 'var(--fs-13)' }}>
        <input type="checkbox" checked={requiredForClose} onChange={e => setRequiredForClose(e.target.checked)} />
        נדרש לסגירת הקליטה
        <span style={{ color: 'var(--ink-4)', fontSize: 'var(--fs-12)' }}>
          (לא מסומן ⇒ רשות — לא יחסום את הסגירה)
        </span>
      </label>

      {processPublished && (
        <label style={{ display: 'flex', gap: '.4rem', alignItems: 'center', fontSize: 'var(--fs-13)' }}>
          <input type="checkbox" checked={sendNow} onChange={e => setSendNow(e.target.checked)} />
          לפתוח מיד ללקוח בדף האישי
          <span style={{ color: 'var(--ink-4)', fontSize: 'var(--fs-12)' }}>
            (לא מסומן ⇒ נשמר כטיוטה אצלך)
          </span>
        </label>
      )}
    </>
  );
}

const lbl: React.CSSProperties = {
  display: 'flex', flexDirection: 'column', gap: '.25rem', fontSize: 'var(--fs-13)',
};

const rowBtn: React.CSSProperties = {
  display: 'flex', flexDirection: 'column', gap: '.15rem', alignItems: 'flex-start',
  textAlign: 'start', padding: '.55rem .7rem', borderRadius: 'var(--radius)',
  border: '1px solid var(--hairline-2)', background: 'transparent',
  color: 'var(--ink-1)', cursor: 'pointer', font: 'inherit', width: '100%',
};

/** שגיאת מסד גולמית באנגלית אינה אומרת כלום לרו"ח. מה שאין לו תרגום — נאמר בכלליות. */
function friendly(dbMessage?: string): string {
  if (dbMessage && /duplicate key|unique constraint/i.test(dbMessage)) {
    return ERRORS.step_type_exists;
  }
  return 'ההוספה נכשלה. אפשר לנסות שוב.';
}

const ERRORS: Record<string, string> = {
  forbidden: 'אין הרשאה ללקוח הזה.',
  step_type_exists: 'כבר קיימת בקשה מהסוג הזה אצל הלקוח. אפשר לערוך אותה מלשונית «בקשות».',
  client_not_found: 'הלקוח לא נמצא.',
  step_type_not_allowed: 'סוג הבקשה הזה לא נוצר ידנית.',
  no_requirements: 'בקשה חופשית חייבת לפחות דרישה אחת.',
  dependency_not_found: 'השלב שבחרת כתלות לא נמצא.',
};

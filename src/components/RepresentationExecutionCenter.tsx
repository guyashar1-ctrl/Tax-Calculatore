// ─── מרכז ביצוע הייצוג ─────────────────────────────────────────────────────
// שני מסלולים נפרדים לגמרי, ולכן שתי עמודות ולא רשימה אחת:
//   • מס הכנסה — הפרטים מוזנים בשע"ם, ייפוי הכוח נחתם דיגיטלית אצלנו והתהליך
//     מתקדם דרך סטטוס הבקשה. השלבים כאן משקפים את הסטטוס, לא קובעים אותו.
//   • ביטוח לאומי — הזנה ידנית באתר ב"ל שמנפיקה מספר אסמכתא עם מועד תפוגה,
//     ומי שמאשר בסוף הוא הלקוח. כל השלבים כאן נשמרים ב-execution.
// המטרה: להיכנס לבקשה ולדעת בשנייה מה נשאר לעשות ואצל מי הכדור.

import { useRef, useState } from 'react';
import {
  RepresentationRequest,
  RepresentationExecution,
  NI_APPROVAL_PHONE,
} from '../types';
import { useDocumentDB } from '../hooks/useIndexedDB';

interface Props {
  request: RepresentationRequest;
  /** האם התבקש ייצוג בביטוח לאומי — נגזר ממרשם הייצוג של הלקוח. */
  niIncluded: boolean;
  onSaveExecution: (execution: RepresentationExecution) => Promise<void> | void;
  /** שולח ללקוח את הוראות אישור ייפוי הכוח בב"ל. מחזיר שגיאה בעברית, או null. */
  onSendNiInstructions: () => Promise<string | null>;
}

const todayISO = () => new Date().toISOString().slice(0, 10);

function fmt(dateish?: string): string {
  if (!dateish) return '';
  const d = new Date(dateish);
  return isNaN(d.getTime()) ? dateish : d.toLocaleDateString('he-IL');
}

/** ימים עד המועד האחרון. שלילי = עבר. */
function daysUntil(deadline?: string): number | null {
  if (!deadline) return null;
  const d = new Date(deadline);
  if (isNaN(d.getTime())) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  d.setHours(0, 0, 0, 0);
  return Math.round((d.getTime() - today.getTime()) / 86400000);
}

function Step({ n, title, done, hint, children }: {
  n: number; title: string; done: boolean; hint?: string; children?: React.ReactNode;
}) {
  return (
    <div style={{ display: 'flex', gap: '.65rem', padding: '.55rem 0' }}>
      <div style={{
        flex: '0 0 auto', width: 22, height: 22, borderRadius: '50%', marginTop: 1,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: '.72rem', fontWeight: 700,
        background: done ? 'var(--ok, #17845b)' : 'var(--gray-200)',
        color: done ? '#fff' : 'var(--gray-600)',
      }}>
        {done ? '✓' : n}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: '.88rem', fontWeight: done ? 500 : 600, color: done ? 'var(--gray-500)' : 'var(--gray-900, #111)' }}>
          {title}
        </div>
        {hint && <div style={{ fontSize: '.75rem', color: 'var(--gray-500)', marginTop: 2 }}>{hint}</div>}
        {children && <div style={{ marginTop: '.5rem' }}>{children}</div>}
      </div>
    </div>
  );
}

function Track({ title, subtitle, done, total, tone, children }: {
  title: string; subtitle: string; done: number; total: number; tone: string; children: React.ReactNode;
}) {
  const complete = done >= total;
  return (
    <div style={{
      flex: '1 1 320px', minWidth: 0,
      border: `1px solid ${complete ? 'var(--ok, #17845b)' : 'var(--gray-200)'}`,
      borderRadius: 'var(--radius)', overflow: 'hidden',
    }}>
      <div style={{ padding: '.65rem .8rem', background: complete ? 'var(--green-light, #eaf6f1)' : 'var(--gray-50)', borderBottom: '1px solid var(--gray-200)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '.5rem' }}>
          <span style={{ fontSize: '1.05rem' }}>{tone}</span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 700, fontSize: '.92rem' }}>{title}</div>
            <div style={{ fontSize: '.73rem', color: 'var(--gray-500)' }}>{subtitle}</div>
          </div>
          <span style={{
            fontSize: '.75rem', fontWeight: 600, padding: '.15rem .5rem', borderRadius: 999,
            background: complete ? 'var(--ok, #17845b)' : 'var(--gray-200)',
            color: complete ? '#fff' : 'var(--gray-700)',
          }}>
            {done}/{total}
          </span>
        </div>
      </div>
      <div style={{ padding: '.5rem .8rem .8rem' }}>{children}</div>
    </div>
  );
}

export default function RepresentationExecutionCenter({ request, niIncluded, onSaveExecution, onSendNiInstructions }: Props) {
  const db = useDocumentDB();
  const exec = request.execution || {};
  const it = exec.incomeTax || {};
  const ni = exec.nationalInsurance || {};

  const [refNumber, setRefNumber] = useState(ni.referenceNumber || '');
  const [deadline, setDeadline] = useState(ni.deadline || '');
  const [busy, setBusy] = useState<string | null>(null);
  const [note, setNote] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [docName, setDocName] = useState<string | null>(null);

  const status = request.status;
  const signed = ['awaiting_stamp', 'awaiting_authorities', 'active'].includes(status);
  const sentToShaam = ['awaiting_authorities', 'active'].includes(status);
  const formReady = !!request.signatureSetup || signed;

  async function patch(next: RepresentationExecution, label: string) {
    setBusy(label);
    setNote(null);
    try {
      await onSaveExecution(next);
    } catch (e) {
      setNote({ kind: 'err', text: e instanceof Error ? e.message : 'השמירה נכשלה' });
    } finally {
      setBusy(null);
    }
  }

  const patchNi = (p: Partial<NonNullable<RepresentationExecution['nationalInsurance']>>, label: string) =>
    patch({ ...exec, nationalInsurance: { ...ni, ...p } }, label);

  async function handleUpload(file: File) {
    if (!request.linkedClientId) {
      setNote({ kind: 'err', text: 'הבקשה אינה מקושרת ללקוח — לא ניתן לשמור קובץ.' });
      return;
    }
    setBusy('upload');
    setNote(null);
    try {
      const bytes = await file.arrayBuffer();
      await db.saveDoc({
        id: `ni-poa-${request.id}`,
        clientId: request.linkedClientId,
        fileName: file.name,
        fileType: file.type || 'application/pdf',
        fileSize: file.size,
        category: 'other',
        year: 'general',
        uploadedAt: new Date().toISOString(),
        description: 'אסמכתא והוראות אישור — ייפוי כוח ביטוח לאומי',
        notes: ni.referenceNumber ? `אסמכתא ${ni.referenceNumber}` : '',
        fileData: bytes,
      });
      setDocName(file.name);
      setNote({ kind: 'ok', text: `הקובץ "${file.name}" נשמר במסמכי הלקוח.` });
    } catch (e) {
      setNote({ kind: 'err', text: e instanceof Error ? e.message : 'ההעלאה נכשלה' });
    } finally {
      setBusy(null);
    }
  }

  async function handleSendInstructions() {
    if (!ni.referenceNumber) {
      setNote({ kind: 'err', text: 'יש לשמור קודם את מספר האסמכתא.' });
      return;
    }
    setBusy('send');
    setNote(null);
    const err = await onSendNiInstructions();
    if (err) {
      setNote({ kind: 'err', text: err });
      setBusy(null);
      return;
    }
    await patchNi({ instructionsSentAt: new Date().toISOString() }, 'send');
    setNote({ kind: 'ok', text: `ההוראות נשלחו ל-${request.clientEmail}.` });
  }

  // ── ספירת שלבים שהושלמו, להצגה בכותרת כל מסלול ──
  const itSteps = [!!it.enteredAt, formReady, signed, sentToShaam, status === 'active'];
  const niSteps = [!!ni.enteredAt, !!ni.referenceNumber, !!ni.instructionsSentAt, !!ni.confirmedAt];

  const dLeft = daysUntil(ni.deadline);
  const deadlineTone = dLeft === null ? null
    : dLeft < 0 ? { bg: 'var(--red-light)', fg: 'var(--red)', text: `⚠ המועד עבר לפני ${Math.abs(dLeft)} ימים — יש להזין מחדש בב"ל` }
    : dLeft <= 14 ? { bg: 'var(--orange-light)', fg: 'var(--gray-800)', text: `⏳ נותרו ${dLeft} ימים לאישור הלקוח` }
    : { bg: 'var(--gray-50)', fg: 'var(--gray-600)', text: `נותרו ${dLeft} ימים לאישור` };

  return (
    <div className="card" style={{ marginBottom: '1rem' }}>
      <div className="card-header">
        <div className="card-title">🎯 ביצוע הייצוג מול הרשויות</div>
      </div>
      <div className="card-body">
        <p style={{ marginTop: 0, fontSize: '.83rem', color: 'var(--gray-600)', lineHeight: 1.6 }}>
          העתיקו את הפרטים מהבלוק שמעל, הזינו אותם באתר של כל רשות, וסמנו כאן מה בוצע.
        </p>

        <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
          {/* ─────────── מס הכנסה ─────────── */}
          <Track
            title="מס הכנסה"
            subtitle="שע״ם · ייפוי כוח בחתימה דיגיטלית"
            done={itSteps.filter(Boolean).length}
            total={itSteps.length}
            tone="🏛"
          >
            <Step n={1} title="הפרטים הוזנו בשע״ם" done={!!it.enteredAt}
              hint={it.enteredAt ? `סומן ב-${fmt(it.enteredAt)}` : 'פתחו בקשת ייצוג באתר שע״ם עם הפרטים שלמעלה'}>
              {!it.enteredAt && (
                <button className="btn btn-secondary btn-sm" disabled={busy === 'it'}
                  onClick={() => patch({ ...exec, incomeTax: { ...it, enteredAt: new Date().toISOString() } }, 'it')}>
                  {busy === 'it' ? 'שומר…' : '✓ סמן כהוזן'}
                </button>
              )}
            </Step>

            <Step n={2} title="טופס ייפוי הכוח הועלה ונשלח לחתימה" done={formReady}
              hint={formReady ? undefined : 'בכפתור "העלה טופס וסמן אזורי חתימה" למעלה'} />

            <Step n={3} title="כל החותמים חתמו" done={signed} />

            <Step n={4} title="נשלח לשע״ם" done={sentToShaam} />

            <Step n={5} title="הייצוג פעיל" done={status === 'active'} />
          </Track>

          {/* ─────────── ביטוח לאומי ─────────── */}
          {niIncluded ? (
            <Track
              title="ביטוח לאומי"
              subtitle="הזנה ידנית · הלקוח מאשר את האסמכתא"
              done={niSteps.filter(Boolean).length}
              total={niSteps.length}
              tone="🛡"
            >
              <Step n={1} title="ייפוי הכוח הוזן באתר ב״ל" done={!!ni.enteredAt}
                hint={ni.enteredAt ? `סומן ב-${fmt(ni.enteredAt)}` : 'מסך "הוספת ייפוי כח מבוטח" — ארבעת השדות מהבלוק שמעל'}>
                {!ni.enteredAt && (
                  <button className="btn btn-secondary btn-sm" disabled={busy === 'ni-entered'}
                    onClick={() => patchNi({ enteredAt: new Date().toISOString() }, 'ni-entered')}>
                    {busy === 'ni-entered' ? 'שומר…' : '✓ סמן כהוזן'}
                  </button>
                )}
              </Step>

              <Step n={2} title="מספר אסמכתא ומועד אחרון לאישור" done={!!ni.referenceNumber}
                hint="ב״ל מציג אותם במסך שאחרי ההזנה">
                <div style={{ display: 'flex', gap: '.4rem', flexWrap: 'wrap', alignItems: 'flex-end' }}>
                  <div style={{ flex: '1 1 130px' }}>
                    <div style={{ fontSize: '.72rem', color: 'var(--gray-500)' }}>מספר אסמכתא</div>
                    <input value={refNumber} dir="ltr" inputMode="numeric" placeholder="73882698"
                      onChange={e => setRefNumber(e.target.value.replace(/\D/g, ''))}
                      style={{ width: '100%', textAlign: 'left' }} />
                  </div>
                  <div style={{ flex: '1 1 130px' }}>
                    <div style={{ fontSize: '.72rem', color: 'var(--gray-500)' }}>מועד אחרון</div>
                    <input type="date" value={deadline} min={todayISO()}
                      onChange={e => setDeadline(e.target.value)} style={{ width: '100%' }} />
                  </div>
                  <button className="btn btn-primary btn-sm" disabled={busy === 'ni-ref' || !refNumber.trim()}
                    onClick={() => patchNi({ referenceNumber: refNumber.trim(), deadline: deadline || undefined }, 'ni-ref')}>
                    {busy === 'ni-ref' ? 'שומר…' : 'שמירה'}
                  </button>
                </div>
                {deadlineTone && (
                  <div style={{ marginTop: '.45rem', padding: '.35rem .6rem', borderRadius: 'var(--radius)', background: deadlineTone.bg, color: deadlineTone.fg, fontSize: '.78rem' }}>
                    {deadlineTone.text} {ni.deadline && `(${fmt(ni.deadline)})`}
                  </div>
                )}

                {/* צירוף האסמכתא המודפסת מב"ל למסמכי הלקוח */}
                <div style={{ marginTop: '.55rem' }}>
                  <input ref={fileRef} type="file" accept="application/pdf,image/*" style={{ display: 'none' }}
                    onChange={e => { const f = e.target.files?.[0]; if (f) handleUpload(f); e.target.value = ''; }} />
                  <button className="btn btn-secondary btn-sm" disabled={busy === 'upload'}
                    onClick={() => fileRef.current?.click()}>
                    {busy === 'upload' ? 'מעלה…' : '📎 צרף אסמכתא מב״ל'}
                  </button>
                  {docName && <span style={{ marginRight: '.5rem', fontSize: '.78rem', color: 'var(--ok)' }}>✓ {docName}</span>}
                </div>
              </Step>

              <Step n={3} title="הוראות האישור נשלחו ללקוח" done={!!ni.instructionsSentAt}
                hint={ni.instructionsSentAt
                  ? `נשלח ב-${fmt(ni.instructionsSentAt)}`
                  : `מייל עם האסמכתא, המועד האחרון, ואישור באתר ב״ל או בטלפון ${NI_APPROVAL_PHONE}`}>
                <button className="btn btn-primary btn-sm" disabled={busy === 'send' || !ni.referenceNumber || !request.clientEmail}
                  onClick={handleSendInstructions}>
                  {busy === 'send' ? 'שולח…' : ni.instructionsSentAt ? '📧 שלח שוב' : '📧 שלח ללקוח הוראות אישור'}
                </button>
                {!request.clientEmail && (
                  <div style={{ fontSize: '.75rem', color: 'var(--gray-500)', marginTop: '.3rem' }}>אין מייל ללקוח בבקשה.</div>
                )}
              </Step>

              <Step n={4} title="הלקוח אישר — הייצוג בב״ל פעיל" done={!!ni.confirmedAt}
                hint={ni.confirmedAt ? `אושר ב-${fmt(ni.confirmedAt)}` : 'בדקו באתר ב״ל שהאישור נקלט'}>
                {!ni.confirmedAt && (
                  <button className="btn btn-secondary btn-sm" disabled={busy === 'ni-conf'}
                    onClick={() => patchNi({ confirmedAt: new Date().toISOString() }, 'ni-conf')}>
                    {busy === 'ni-conf' ? 'שומר…' : '✓ סמן כאושר'}
                  </button>
                )}
              </Step>
            </Track>
          ) : (
            <div style={{ flex: '1 1 320px', minWidth: 0, border: '1px dashed var(--gray-200)', borderRadius: 'var(--radius)', padding: '1rem', color: 'var(--gray-500)', fontSize: '.85rem', display: 'flex', alignItems: 'center', justifyContent: 'center', textAlign: 'center' }}>
              🛡 לא התבקש ייצוג בביטוח לאומי עבור לקוח זה.
            </div>
          )}
        </div>

        {note && (
          <div style={{
            marginTop: '.9rem', padding: '.55rem .8rem', borderRadius: 'var(--radius)', fontSize: '.85rem',
            background: note.kind === 'ok' ? 'var(--green-light, #eaf6f1)' : 'var(--red-light)',
            color: note.kind === 'ok' ? 'var(--ok, #17845b)' : 'var(--red)',
          }}>
            {note.kind === 'ok' ? '✓ ' : '⚠ '}{note.text}
          </div>
        )}
      </div>
    </div>
  );
}

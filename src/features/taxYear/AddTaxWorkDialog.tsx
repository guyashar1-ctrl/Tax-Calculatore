// ─── «הוסף דוח או הצהרת הון» — ללקוח אחד או לכמה (13.10.2026) ─────────────────────────────
// ‼ שני שלבים: (1) מה מוסיפים וערכים משותפים, ולאילו לקוחות; (2) שורה לכל לקוח — רואים ומתקנים לפני האישור.
//   עבודה שכבר קיימת לאותה זהות מסומנת «כבר קיימת — תקושר» ולא נוצרת שוב; פרטים שכבר רשומים עליה לא נדרסים.
// ‼ כשל חלקי: כל שורה נשלחת בנפרד, והתוצאה נשמרת לשורה. «נסה שוב» — רק לשורות שנכשלו (השרת אידמפוטנטי).
// ‼ «מועד רשמי» רק עם בסיס. בדוח שנתי — פרסום של רשות המסים בשמו (חל על כולם); בלי בסיס — «מועד שנמסר».
//   בהצהרת הון — הדרישה נשמרת «טרם אומתה»; אימות עם אסמכתה — בתוך העבודה של כל לקוח.
// ‼ יצירה אינה פרסום ואינה מייל: נוצרת טיוטת שאלות, שהמשרד בודק ומפרסם בעצמו.
// ‼ ההזנה כאן ידנית; המבנה (NewWorkRow) מתאים לקליטת קובץ מרוכז מהרשויות בעתיד — בלי לבנות את זה עכשיו.

import { useMemo, useState } from 'react';
import type { Client } from '../../types';
import type { OnboardingStep } from '../../types/onboarding';
import { todayIso } from '../../utils/dateFormat';
import { WORK_SOURCE_LABEL, existingFor, rowProblems, workKey, type NewWorkKind, type NewWorkRow, type WorkSource } from './workMeta';
import { createWork, type CreateResult } from './workCreate';
import './taxYear.css';

interface Props {
  clients: Client[];
  /** עבודות פתוחות שכבר קיימות — לסימון «כבר קיימת». */
  steps: Pick<OnboardingStep, 'id' | 'clientId' | 'stepType' | 'status' | 'payload'>[];
  /** מתוך תיק לקוח: הלקוח קבוע. */
  fixedClientId?: string;
  onClose: () => void;
  /** אחרי שנוצרו/קושרו — רענון הרשימות; stepId — לפתיחה. */
  onDone: (results: { clientId: string; stepId?: string }[]) => void;
}

type Shared = Omit<NewWorkRow, 'clientId'>;
const he = (iso?: string) => (iso ? iso.split('-').reverse().join('.') : '');

export default function AddTaxWorkDialog({ clients, steps, fixedClientId, onClose, onDone }: Props) {
  const today = todayIso();
  const lastYear = Number(today.slice(0, 4)) - 1;
  const [stage, setStage] = useState<'what' | 'review'>('what');
  const [shared, setShared] = useState<Shared>({ kind: 'annual', taxYear: lastYear, asOfDate: `${lastYear}-12-31`, source: undefined });
  const [picked, setPicked] = useState<string[]>(fixedClientId ? [fixedClientId] : []);
  const [q, setQ] = useState('');
  const [rows, setRows] = useState<NewWorkRow[]>([]);
  const [results, setResults] = useState<Record<string, CreateResult | 'running'>>({});
  const [busy, setBusy] = useState(false);

  const byId = useMemo(() => new Map(clients.map(c => [c.id, c])), [clients]);
  const name = (c?: Client) => (c ? `${c.firstName ?? ''} ${c.lastName ?? ''}`.trim() || 'לקוח' : 'לקוח');
  const set = (p: Partial<Shared>) => setShared(s => ({ ...s, ...p }));
  const sourceOpts: WorkSource[] = shared.kind === 'annual' ? ['office', 'publication', 'letter', 'portal', 'client', 'alignment', 'other'] : ['office', 'letter', 'portal', 'client', 'alignment', 'other'];
  const years = Array.from({ length: 7 }, (_, k) => lastYear - k);

  const toReview = () => {
    setRows(picked.map(id => ({ ...shared, clientId: id, addressee: shared.kind === 'wealth' ? (byId.get(id)?.familyStatus === 'married' ? 'both' : 'client') : undefined })));
    setResults({});
    setStage('review');
  };
  const patchRow = (i: number, p: Partial<NewWorkRow>) => setRows(rs => rs.map((r, k) => (k === i ? { ...r, ...p } : r)));

  const run = async (only?: Set<string>) => {
    setBusy(true);
    const done: { clientId: string; stepId?: string }[] = [];
    for (const r of rows) {
      const key = workKey(r);
      if (only && !only.has(key)) continue;
      if (rowProblems(r, today).length) continue;
      setResults(x => ({ ...x, [key]: 'running' }));
      const c = byId.get(r.clientId);
      const res: CreateResult = c ? await createWork(r, c).catch(e => ({ ok: false, error: String((e as Error).message) })) : { ok: false, error: 'client_not_found' };
      setResults(x => ({ ...x, [key]: res }));
      if (res.stepId) done.push({ clientId: r.clientId, stepId: res.stepId });
    }
    setBusy(false);
    onDone(done);
  };

  const failed = rows.filter(r => { const x = results[workKey(r)]; return x && x !== 'running' && !x.ok; });
  const finished = rows.length > 0 && rows.every(r => { const x = results[workKey(r)]; return (x && x !== 'running') || rowProblems(r, today).length > 0; });
  const errText = (e?: string) => ({ bad_year: 'שנה לא תקינה', bad_date: 'תאריך לא תקין', evidence_required: 'מועד «רשמי» דורש בסיס', due_before_letter: 'המועד מוקדם מתאריך המכתב', client_not_found: 'הלקוח לא נמצא', forbidden: 'אין הרשאה ללקוח' } as Record<string, string>)[e ?? ''] ?? (e ? `נכשל (${e})` : 'נכשל');

  const filtered = clients.filter(c => !q || name(c).includes(q.trim()) || (c.idNumber ?? '').includes(q.trim())).slice(0, 60);

  return (
    <div className="modal-backdrop aw-backdrop" onClick={e => { if (e.target === e.currentTarget && !busy) onClose(); }}>
      <div className="modal aw" role="dialog" aria-modal="true" aria-labelledby="aw-h" data-add-work>
        <div className="modal-head">
          <h3 id="aw-h">{stage === 'what' ? 'הוספת דוח או הצהרת הון' : `בדיקה לפני יצירה · ${rows.length} ${shared.kind === 'annual' ? 'דוחות' : 'הצהרות'}`}</h3>
          <button type="button" className="btn btn-sm btn-ghost" disabled={busy} onClick={onClose} aria-label="סגירה">✕</button>
        </div>
        <div className="modal-body aw-body">
          {stage === 'what' ? (
            <>
              <div className="rec-seg aw-kind" role="radiogroup" aria-label="סוג העבודה">
                {(['annual', 'wealth'] as NewWorkKind[]).map(k => (
                  <button key={k} type="button" role="radio" aria-checked={shared.kind === k} className="rec-seg-btn" onClick={() => set({ kind: k, source: undefined, publication: undefined })}>{k === 'annual' ? 'דוח שנתי' : 'הצהרת הון'}</button>
                ))}
              </div>
              <div className="rec-grid">
                {shared.kind === 'annual' ? (
                  <label className="rec-field is-half"><span className="rec-label">שנת המס</span>
                    <select value={shared.taxYear} onChange={e => set({ taxYear: Number(e.target.value) })}>{years.map(y => <option key={y} value={y}>{y}</option>)}</select>
                    <span className="rec-hint">דוח שנתי נפתח לשנה שהסתיימה. אפשר גם דוח של שנה קודמת.</span>
                  </label>
                ) : (
                  <>
                    <label className="rec-field is-half"><span className="rec-label">ההצהרה ליום</span>
                      <input type="date" dir="ltr" value={shared.asOfDate ?? ''} max={today} onChange={e => set({ asOfDate: e.target.value })} />
                      <span className="rec-hint">היום שאליו מתייחסת ההצהרה — לא יום המילוי או ההגשה.</span>
                    </label>
                    <label className="rec-field is-half"><span className="rec-label">ראשונה או המשך</span>
                      <select value={shared.declKind ?? ''} onChange={e => set({ declKind: (e.target.value || undefined) as Shared['declKind'] })}>
                        <option value="">לפי מה שבמערכת</option><option value="first">ראשונה</option><option value="followup">המשך</option>
                      </select>
                    </label>
                  </>
                )}
                <label className="rec-field"><span className="rec-label">מקור הדרישה או המידע</span>
                  <select value={shared.source ?? ''} onChange={e => set({ source: (e.target.value || undefined) as WorkSource | undefined })}>
                    <option value="">בחירה…</option>
                    {sourceOpts.map(s => <option key={s} value={s}>{WORK_SOURCE_LABEL[s]}</option>)}
                  </select>
                  {shared.kind === 'wealth' && shared.source === 'office' && <span className="rec-hint">הכנה בלי דרישה — אין מועד רשמי. מועד נרשם כשמגיע מכתב.</span>}
                </label>
                {shared.source && shared.source !== 'office' && (
                  <label className="rec-field"><span className="rec-label">פרטים / אסמכתה (לא חובה)</span>
                    <input value={shared.sourceNote ?? ''} placeholder={shared.kind === 'wealth' ? 'למשל: מכתב פקיד שומה חיפה' : 'למשל: מכסת דוחות למייצגים'} onChange={e => set({ sourceNote: e.target.value })} />
                  </label>
                )}
                {shared.kind === 'wealth' && shared.source && !['office'].includes(shared.source) && (
                  <label className="rec-field is-half"><span className="rec-label">תאריך המכתב</span>
                    <input type="date" dir="ltr" value={shared.letterDate ?? ''} max={today} onChange={e => set({ letterDate: e.target.value || undefined })} />
                  </label>
                )}
                {shared.source !== 'office' && (
                  <label className="rec-field is-half"><span className="rec-label">{shared.kind === 'annual' ? 'מועד הגשה' : 'המועד שבדרישה'}</span>
                    <input type="date" dir="ltr" value={shared.due ?? ''} onChange={e => set({ due: e.target.value || undefined })} />
                    <span className="rec-hint">{shared.kind === 'annual' ? (shared.publication ? 'יוצג כמועד רשמי, לפי הפרסום' : 'בלי בסיס — יוצג «מועד שנמסר, לא מאומת»') : 'נשמר «טרם אומת» עד שמצרפים אסמכתה בתוך העבודה'}</span>
                  </label>
                )}
                {shared.kind === 'annual' && shared.source === 'publication' && (
                  <label className="rec-field"><span className="rec-label">הפרסום של רשות המסים (הבסיס למועד הרשמי)</span>
                    <input value={shared.publication ?? ''} placeholder="למשל: הודעה על מועדי הגשת דוחות 2025 למייצגים" onChange={e => set({ publication: e.target.value || undefined })} />
                  </label>
                )}
                {shared.source !== 'office' && (
                  <label className="rec-field is-half"><span className="rec-label">ארכה עד (אם ניתנה)</span>
                    <input type="date" dir="ltr" value={shared.extensionUntil ?? ''} onChange={e => set({ extensionUntil: e.target.value || undefined })} />
                  </label>
                )}
                <label className="rec-field is-half"><span className="rec-label">יעד פנימי של המשרד</span>
                  <input type="date" dir="ltr" value={shared.internalTarget ?? ''} onChange={e => set({ internalTarget: e.target.value || undefined })} />
                </label>
                <label className="rec-field is-half"><span className="rec-label">נבדק מול הרשויות ב</span>
                  <input type="date" dir="ltr" value={shared.lastAuthorityCheck ?? ''} max={today} onChange={e => set({ lastAuthorityCheck: e.target.value || undefined })} />
                </label>
              </div>

              {!fixedClientId && (
                <fieldset className="aw-clients">
                  <legend className="rec-label">לאילו לקוחות ({picked.length})</legend>
                  <input className="aw-search" value={q} placeholder="חיפוש לפי שם או ת.ז." onChange={e => setQ(e.target.value)} aria-label="חיפוש לקוח" />
                  <ul className="aw-client-list">
                    {filtered.map(c => {
                      const on = picked.includes(c.id);
                      const ex = existingFor({ ...shared, clientId: c.id } as NewWorkRow, steps);
                      return (
                        <li key={c.id}>
                          <label className="aw-client">
                            <input type="checkbox" checked={on} onChange={() => setPicked(p => (on ? p.filter(x => x !== c.id) : [...p, c.id]))} />
                            <span>{name(c)}</span>
                            {ex && <span className="ty-chip">כבר קיים{shared.kind === 'annual' ? ` דוח ${shared.taxYear}` : ''}</span>}
                          </label>
                        </li>
                      );
                    })}
                  </ul>
                </fieldset>
              )}
              <p className="ty-note aw-note">יצירה אינה פרסום: נוצרת טיוטת שאלות ובקשת מסמכים לפי מה שכבר ידוע, והיא לא מופיעה ללקוח ולא יוצא מייל עד שתפרסם.</p>
            </>
          ) : (
            <>
              <p className="ty-note" style={{ margin: 0 }}>אפשר לתקן לכל לקוח לפני היצירה. עבודה שכבר קיימת — תקושר; פרטים שכבר רשומים עליה לא יידרסו.</p>
              <ul className="aw-rows">
                {rows.map((r, i) => {
                  const c = byId.get(r.clientId);
                  const key = workKey(r);
                  const ex = existingFor(r, steps);
                  const probs = rowProblems(r, today);
                  const res = results[key];
                  return (
                    <li key={key + i} className={`aw-row${probs.length ? ' has-err' : ''}`} data-aw-row={r.clientId}>
                      <div className="aw-row-head">
                        <b>{name(c)}</b>
                        <span className="ty-chip">{r.kind === 'annual' ? `דוח שנתי ${r.taxYear}` : `הצהרת הון ליום ${he(r.asOfDate)}`}</span>
                        {ex ? <span className="ty-chip amber">כבר קיימת — תקושר</span> : <span className="ty-chip blue">חדשה</span>}
                        {res === 'running' && <span className="ty-note">יוצר…</span>}
                        {res && res !== 'running' && (res.ok
                          ? <span className="ty-chip green" data-aw-result="ok">{res.created ? 'נוצרה' : 'קושרה'}{res.drafted ? ` · טיוטה: ${res.drafted} שאלות` : ''}{res.kept?.length ? ' · פרטים קיימים נשמרו' : ''}</span>
                          : <span className="ty-chip red" data-aw-result="fail">{res.failedAt === 'draft' ? 'העבודה נוצרה, הטיוטה נכשלה' : errText(res.error)}</span>)}
                      </div>
                      <div className="aw-row-fields">
                        {r.kind === 'annual'
                          ? <label className="rec-field"><span className="rec-label">שנה</span><select value={r.taxYear} disabled={busy} onChange={e => patchRow(i, { taxYear: Number(e.target.value) })}>{years.map(y => <option key={y} value={y}>{y}</option>)}</select></label>
                          : <label className="rec-field"><span className="rec-label">ליום</span><input type="date" dir="ltr" value={r.asOfDate ?? ''} disabled={busy} onChange={e => patchRow(i, { asOfDate: e.target.value })} /></label>}
                        {r.kind === 'wealth' && c?.familyStatus === 'married' && (
                          <label className="rec-field"><span className="rec-label">הדרישה פונה ל</span>
                            <select value={r.addressee ?? 'both'} disabled={busy} onChange={e => patchRow(i, { addressee: e.target.value as NewWorkRow['addressee'] })}>
                              <option value="client">{c.firstName}</option><option value="spouse">{c.spouseFirstName || c.spouse?.firstName || 'בן/בת הזוג'}</option><option value="both">שניהם</option>
                            </select>
                          </label>
                        )}
                        {r.source !== 'office' && <label className="rec-field"><span className="rec-label">{r.kind === 'annual' ? 'מועד הגשה' : 'מועד בדרישה'}</span><input type="date" dir="ltr" value={r.due ?? ''} disabled={busy} onChange={e => patchRow(i, { due: e.target.value || undefined })} /></label>}
                        <label className="rec-field"><span className="rec-label">יעד פנימי</span><input type="date" dir="ltr" value={r.internalTarget ?? ''} disabled={busy} onChange={e => patchRow(i, { internalTarget: e.target.value || undefined })} /></label>
                      </div>
                      {probs.length > 0 && <p className="rec-err">{probs.join(' · ')}</p>}
                    </li>
                  );
                })}
              </ul>
            </>
          )}
        </div>
        <div className="modal-foot aw-foot">
          {stage === 'what' ? (
            <>
              <button type="button" className="btn btn-primary" disabled={!picked.length || (shared.kind === 'wealth' && !shared.asOfDate)} onClick={toReview}>
                המשך לבדיקה ({picked.length})
              </button>
              <button type="button" className="btn btn-ghost" onClick={onClose}>ביטול</button>
            </>
          ) : finished ? (
            <>
              {failed.length > 0 && <button type="button" className="btn btn-primary" disabled={busy} onClick={() => void run(new Set(failed.map(workKey)))}>נסה שוב את {failed.length} שנכשלו</button>}
              <button type="button" className={failed.length ? 'btn btn-ghost' : 'btn btn-primary'} disabled={busy} onClick={onClose}>סיום</button>
            </>
          ) : (
            <>
              <button type="button" className="btn btn-primary" disabled={busy || rows.every(r => rowProblems(r, today).length > 0)} onClick={() => void run()} data-aw-create>
                {busy ? 'יוצר…' : `יצירה (${rows.filter(r => !rowProblems(r, today).length).length}) — בלי פרסום ובלי מייל`}
              </button>
              <button type="button" className="btn btn-ghost" disabled={busy} onClick={() => setStage('what')}>חזרה</button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export const kindLabel = (k: NewWorkKind) => (k === 'annual' ? 'דוח שנתי' : 'הצהרת הון');

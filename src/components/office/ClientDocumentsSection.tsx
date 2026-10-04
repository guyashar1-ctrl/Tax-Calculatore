// ─── «ספריית מסמכים» — קבצים קבועים לשליחה, וטפסים רשמיים שממולאים מהתיק ─────
// שתי קבוצות, כל אחת עם פעולה אחת ברורה: «＋ קובץ» / «פתיחה». פעולות משניות (שינוי שם,
// החלפה, הסרה) בתפריט ⋯ ובאישור במקום — לא שורות הסבר קבועות.
// ‼ הקבצים נשמרים בטיוטת המשרד; «שמירה» של המשרד היא שמכניסה אותם לשימוש.
// ‼ טופס ללקוח לא נפתח מכאן — רק מהלקוח: «בקשות» ← «בקשה חדשה». כאן מנהלים את התבנית.
// ‼ (1.10.2026) כל שינוי נגזר מהטיוטה העדכנית ולא מהעותק שברינדור: העלאה
// אורכת זמן, ושינוי שם שנעשה בזמן הזה נדרס קודם.
// ‼ הסרה אינה מוחקת את הקובץ מהאחסון — אבל בקשה שכבר נשלחה פותחת את הקובץ לפי
// המזהה שבספרייה (office_document_url, מיגרציה 112), ולכן אחרי הסרה ושמירה
// הלקוח לא יוכל לפתוח אותו משם. זה נאמר באישור ההסרה.

import { Fragment, useEffect, useRef, useState } from 'react';
import type { FirmProfile } from '../../types/firmProfile';
import { supabase } from '../../lib/supabase';
import {
  GUIDE_BUCKET, documentLibrary, newDocumentId,
  withAddedDocument, withRemovedDocument, withRenamedDocument, withReplacedFile,
  type DocVersion,
} from '../../lib/clientGuide';
import SmartTemplateManager from '../../features/smartForms/templateManager/SmartTemplateManager';
import { BTL6101_TEMPLATE } from '../../features/smartForms/btl6101/template';
import { fetchMappingState, type MappingState } from '../../features/smartForms/mapping';
import { assetRef, type AssetRef } from './officeModel';
import { UsedIn, focusOfUse, type GoFn, type LibraryUse } from './pages/library/usedIn';
import './clientDocs.css';

const MAX_BYTES = 10 * 1024 * 1024;
const fmtDate = (iso: string) => new Date(iso).toLocaleDateString('he-IL');

function FileGlyph({ tone = 'doc' }: { tone?: 'doc' | 'form' }) {
  return (
    <span className={`cdx-glyph is-${tone}`} aria-hidden="true">
      <svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round">
        <path d="M4 1.8h5.2L12.5 5v9.2H4z" /><path d="M9 1.8V5h3.5" />
        {tone === 'form' ? <><path d="M6 8.2h4.5M6 10.4h4.5M6 12.4h2.5" /></> : <path d="M6 9h4.5M6 11.2h3" />}
      </svg>
    </span>
  );
}

/** תפריט ⋯ קטן — נסגר בלחיצה מחוצה לו או ב-Esc, והפוקוס חוזר לכפתור. */
function RowMenu({ label, items }: { label: string; items: { label: string; sub?: string; danger?: boolean; onSelect: () => void }[] }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const btn = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!open) return;
    const down = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') { setOpen(false); btn.current?.focus(); } };
    document.addEventListener('mousedown', down);
    document.addEventListener('keydown', key);
    ref.current?.querySelector<HTMLButtonElement>('[role=menuitem]')?.focus();
    return () => { document.removeEventListener('mousedown', down); document.removeEventListener('keydown', key); };
  }, [open]);
  return (
    <div className="cdx-menu" ref={ref}>
      <button ref={btn} type="button" className="cdx-iconbtn" aria-label={`פעולות נוספות · ${label}`} aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen(o => !o)}>⋯</button>
      {open && (
        <div className="cdx-menu-pop" role="menu">
          {items.map(it => (
            <button key={it.label} type="button" role="menuitem" className={`cdx-menu-item${it.danger ? ' is-danger' : ''}`}
              onClick={() => { setOpen(false); it.onSelect(); }}>
              <span>{it.label}</span>
              {it.sub && <small>{it.sub}</small>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

interface Props {
  profile: FirmProfile;
  saved: FirmProfile;
  setDraft: React.Dispatch<React.SetStateAction<FirmProfile>>;
  noteUpload: (r: AssetRef) => void;
  /**
   * ‼ כל מסלול שבו הקובץ נשלח — לא רק הקליטה. בשורה («בשימוש ב:», כמו בבקשות) ובאישור
   * ההסרה: קובץ שהוסר לא נוצר באף אחד מהם (_flow_item_spec: library_item_missing).
   */
  usesOf: (docId: string) => LibraryUse[];
  go: GoFn;
  /** «שליחה ללקוח» — בוחרים לקוח, ונפתח אצלו חלון השליחה עם הקובץ. */
  onSendToClient?: (doc: { id: string; label: string; fileName?: string }) => void;
}

export default function ClientDocumentsSection({ profile, saved, setDraft, noteUpload, usesOf, go, onSendToClient }: Props) {
  const docs = documentLibrary(profile);
  const savedDocs = new Map(documentLibrary(saved).map(d => [d.id, d]));
  const [busyId, setBusyId] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [newLabel, setNewLabel] = useState('');
  const [renaming, setRenaming] = useState<{ id: string; label: string } | null>(null);
  const [removing, setRemoving] = useState<string | null>(null);
  const replaceInput = useRef<HTMLInputElement>(null);
  const replaceFor = useRef<string | null>(null);
  const [managerOpen, setManagerOpen] = useState(false);
  const [mapping, setMapping] = useState<MappingState | null>(null);

  const refreshMapping = () => { void fetchMappingState(BTL6101_TEMPLATE.key).then(setMapping).catch(() => setMapping(null)); };
  useEffect(refreshMapping, []);

  async function put(file: File, id: string): Promise<DocVersion | null> {
    if (file.type !== 'application/pdf') { setErr('אפשר להעלות PDF בלבד.'); return null; }
    if (file.size > MAX_BYTES) { setErr('הקובץ גדול מדי — עד 10MB.'); return null; }
    // ‼ שם ייחודי לכל העלאה, בלי upsert: הגרסה הקודמת נשארת במקומה (מדיניות הדלי חוסמת upsert)
    const path = `${profile.id}/${id}-${Date.now()}.pdf`;
    const { error: upErr } = await supabase.storage.from(GUIDE_BUCKET).upload(path, file, { contentType: 'application/pdf' });
    if (upErr) { setErr(`ההעלאה נכשלה: ${upErr.message}`); return null; }
    noteUpload(assetRef(GUIDE_BUCKET, path));
    const { data: pub } = supabase.storage.from(GUIDE_BUCKET).getPublicUrl(path);
    return { path, url: pub.publicUrl, fileName: file.name || 'document.pdf', at: new Date().toISOString() };
  }

  async function addDocument(file: File) {
    setErr(null);
    const id = newDocumentId();
    setBusyId(id);
    const v = await put(file, id);
    setBusyId(null);
    if (!v) return;
    const label = newLabel.trim() || file.name.replace(/\.pdf$/i, '');
    setDraft(p => ({ ...p, settings: withAddedDocument(p, { id, label, ...v }) }));
    setNewLabel(''); setAdding(false);
  }

  async function replaceFile(id: string, file: File) {
    setErr(null);
    setBusyId(id);
    const v = await put(file, id);
    setBusyId(null);
    if (v) setDraft(p => ({ ...p, settings: withReplacedFile(p, id, v) }));
  }

  function rename(id: string, label: string) {
    setDraft(p => ({ ...p, settings: withRenamedDocument(p, id, label) }));
    setRenaming(null);
  }

  const draftOpen = !!mapping?.draft;

  function pendingOf(d: ReturnType<typeof documentLibrary>[number]): string | null {
    const s = savedDocs.get(d.id);
    if (!s) return 'חדש — נכנס לשימוש אחרי שמירה';
    if (s.path !== d.path) return 'קובץ חדש — נכנס לשימוש אחרי שמירה';
    if (s.label !== d.label) return 'שם חדש — אחרי שמירה';
    return null;
  }
  const removedSaved = [...savedDocs.values()].filter(s => !docs.some(d => d.id === s.id));

  return (
    <div className="cdx">
      {/* ── קבצים לשליחה ── */}
      <section className="cdx-group" aria-labelledby="cdx-files" style={{ marginTop: 0 }}>
        <div className="cdx-group-head">
          <h3 id="cdx-files">קבצים לשליחה ללקוחות</h3>
          {!adding && <button type="button" className="btn btn-secondary btn-sm" onClick={() => { setAdding(true); setErr(null); }}>＋ קובץ</button>}
        </div>

        {adding && (
          <div className="cdx-add">
            <input value={newLabel} autoFocus onChange={e => setNewLabel(e.target.value)} placeholder="שם שהלקוח יראה, למשל: מדריך הוצאות מוכרות" aria-label="שם הקובץ" />
            <label className={`btn btn-primary btn-sm${busyId ? ' is-busy' : ''}`}>
              <input type="file" accept="application/pdf" hidden disabled={!!busyId}
                onChange={e => { const f = e.target.files?.[0]; if (f) void addDocument(f); e.target.value = ''; }} />
              {busyId ? 'מעלה…' : 'בחירת PDF'}
            </label>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => { setAdding(false); setNewLabel(''); }}>ביטול</button>
            <small className="cdx-quiet">PDF עד 10MB</small>
          </div>
        )}

        {docs.length === 0 && !adding && <div className="cdx-empty">עוד אין קבצים.</div>}

        <ul className="cdx-list">
          {docs.map(d => {
            const pending = pendingOf(d);
            const uses = usesOf(d.id);
            const replace = () => { replaceFor.current = d.id; replaceInput.current?.click(); };
            return (
              <li key={d.id} className="cdx-row">
                <FileGlyph />
                {renaming?.id === d.id ? (
                  <div className="cdx-rename">
                    <input value={renaming.label} autoFocus aria-label="שם חדש"
                      onChange={e => setRenaming({ id: d.id, label: e.target.value })}
                      onKeyDown={e => {
                        if (e.key === 'Enter' && renaming.label.trim()) rename(d.id, renaming.label.trim());
                        if (e.key === 'Escape') setRenaming(null);
                      }} />
                    <button type="button" className="btn btn-primary btn-sm" disabled={!renaming.label.trim()}
                      onClick={() => rename(d.id, renaming.label.trim())}>אישור</button>
                    <button type="button" className="btn btn-ghost btn-sm" onClick={() => setRenaming(null)}>ביטול</button>
                  </div>
                ) : removing === d.id ? (
                  <div className="cdx-confirm" role="alertdialog" aria-label={`הסרת ${d.label}`}>
                    <span>
                      להסיר את «{d.label}» מהספרייה?
                      {savedDocs.has(d.id) && <small className="cdx-consequence">לקוח שכבר קיבל אותו בבקשה לא יוכל לפתוח אותו משם אחרי השמירה.</small>}
                      {/* ‼ כל מסלול, לא רק הקליטה: אחרי ההסרה הקובץ לא נוצר באף אחד מהם. «החלפת קובץ» שומרת
                          על אותו מסמך — והמסלולים ממשיכים לשלוח אותו. */}
                      {uses.length > 0 && (
                        <>
                          <small className="cdx-consequence">
                            אחרי השמירה הוא לא ייווצר במסלולים שבהם הוא נשלח. קובץ חדש במקומו — «החלפת קובץ», והמסלולים ממשיכים לשלוח אותו.
                          </small>
                          {/* ‼ בלי <span>: ‎.cdx-confirm span‎ נותן לכל span רוחב מינימלי — הקישורים כאן כפתורים בלבד. */}
                          <small className="cdx-consequence">
                            בשימוש ב:{' '}
                            {uses.map((u, i) => (
                              <Fragment key={`${u.flowId}:${u.stageKey}`}>
                                {i > 0 && ' · '}
                                <button type="button" className="of-link" onClick={() => go('flows', focusOfUse(u))}>{u.flowName} ← {u.stageName}</button>
                              </Fragment>
                            ))}
                          </small>
                        </>
                      )}
                    </span>
                    {uses.length > 0 && (
                      <button type="button" className="btn btn-secondary btn-sm" onClick={() => { setRemoving(null); replace(); }}>החלפת קובץ</button>
                    )}
                    <button type="button" className="btn btn-danger btn-sm"
                      onClick={() => { setDraft(p => ({ ...p, settings: withRemovedDocument(p, d.id) })); setRemoving(null); }}>הסרה</button>
                    <button type="button" className="btn btn-ghost btn-sm" onClick={() => setRemoving(null)} autoFocus>ביטול</button>
                  </div>
                ) : (
                  <>
                    <div className="cdx-main">
                      <div className="cdx-title">{d.label}</div>
                      <div className="cdx-meta">
                        {busyId === d.id ? 'מעלה גרסה חדשה…' : <>
                          <bdi>{d.fileName}</bdi> · {fmtDate(d.at)}{d.history?.length ? (d.history.length === 1 ? ' · גרסה קודמת אחת' : ` · ${d.history.length} גרסאות קודמות`) : ''}
                        </>}
                        {pending && <span className="cdx-chip">{pending}</span>}
                      </div>
                      {/* «בשימוש ב» בשורה עצמה — כמו בבקשות, ולא רשימה נפרדת שחוזרת על שמות הקבצים. */}
                      {uses.length > 0 && <div className="cdx-meta"><UsedIn uses={uses} go={go} loading={false} /></div>}
                    </div>
                    <a className="btn btn-ghost btn-sm" href={d.url} target="_blank" rel="noopener noreferrer">צפייה</a>
                    {onSendToClient && (
                      <button type="button" className="btn btn-secondary btn-sm"
                        disabled={!!pending} title={pending ? 'אפשר לשלוח אחרי «שמירה»' : undefined}
                        onClick={() => onSendToClient({ id: d.id, label: d.label, fileName: d.fileName })}>
                        שליחה ללקוח
                      </button>
                    )}
                    <RowMenu label={d.label} items={[
                      { label: 'שינוי שם', sub: 'השם שהלקוח רואה', onSelect: () => setRenaming({ id: d.id, label: d.label }) },
                      { label: 'החלפת קובץ', sub: 'אחרי שמירה — ייפתח גם בבקשות שכבר נשלחו', onSelect: replace },
                      { label: 'הסרה מהספרייה', danger: true, onSelect: () => setRemoving(d.id) },
                    ]} />
                  </>
                )}
              </li>
            );
          })}
        </ul>
        {removedSaved.length > 0 && (
          <p className="cdx-quiet cdx-note">
            יוסרו אחרי שמירה: {removedSaved.map(s => `«${s.label}»`).join(', ')}.
          </p>
        )}
        <input ref={replaceInput} type="file" accept="application/pdf" hidden
          onChange={e => { const f = e.target.files?.[0]; const id = replaceFor.current; if (f && id) void replaceFile(id, f); e.target.value = ''; }} />
      </section>

      {/* ── טפסים רשמיים ── */}
      <section className="cdx-group" aria-labelledby="cdx-forms">
        <div className="cdx-group-head">
          <h3 id="cdx-forms">טפסים רשמיים</h3>
        </div>
        <ul className="cdx-list">
          <li className="cdx-row">
            <FileGlyph tone="form" />
            <div className="cdx-main">
              <div className="cdx-title">דין וחשבון רב שנתי (6101) <span className="cdx-sub">ביטוח לאומי</span></div>
              <div className="cdx-meta">
                {/* גרסת המיפוי וכמות השדות — בתוך «הגדרת הטופס»; כאן רק מה שעוזר ביום־יום. */}
                הלקוח ממלא בדף האישי, ואתה מקבל PDF מוכן
                {draftOpen && <span className="cdx-chip">שינויים שעוד לא הופעלו</span>}
              </div>
            </div>
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => setManagerOpen(true)}>הגדרת הטופס</button>
          </li>
        </ul>
        <p className="cdx-quiet cdx-note">שולחים ללקוח מהכרטיס שלו: «בקשות» ← «בקשה חדשה».</p>
      </section>

      {err && <div className="cdx-err" role="alert">{err}</div>}

      {managerOpen && <SmartTemplateManager base={BTL6101_TEMPLATE} onClose={() => { setManagerOpen(false); refreshMapping(); }} />}
    </div>
  );
}

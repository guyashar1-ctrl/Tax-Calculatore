// ─── «מסמכים ללקוחות» — קבצים קבועים לשליחה, וטפסים רשמיים שממולאים מהתיק ────────
// שתי קבוצות, כל אחת עם פעולה אחת ברורה: «＋ קובץ» / «פתיחה». פעולות משניות (שינוי שם,
// החלפה, הסרה) בתפריט ⋯ ובאישור במקום — לא שורות הסבר קבועות.
// ‼ הקבצים נשמרים בטיוטת הפרופיל; «שמירת שינויים» בראש המסך שומרת אותם (כמו כל ההגדרות).
// ‼ טופס ללקוח לא נפתח מכאן — רק מהלקוח: «בקשות» ← «בקשה חדשה». כאן מנהלים את התבנית.

import { useEffect, useRef, useState } from 'react';
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

/** תפריט ⋯ קטן — נסגר בלחיצה מחוצה לו או ב-Esc. */
function RowMenu({ items }: { items: { label: string; sub?: string; danger?: boolean; onSelect: () => void }[] }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const down = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', down);
    document.addEventListener('keydown', key);
    return () => { document.removeEventListener('mousedown', down); document.removeEventListener('keydown', key); };
  }, [open]);
  return (
    <div className="cdx-menu" ref={ref}>
      <button type="button" className="cdx-iconbtn" aria-label="פעולות נוספות" aria-expanded={open} onClick={() => setOpen(o => !o)}>⋯</button>
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

export default function ClientDocumentsSection({ profile, onChangeProfile }: { profile: FirmProfile; onChangeProfile: (p: FirmProfile) => void }) {
  const docs = documentLibrary(profile);
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
    if (upErr) { setErr(upErr.message); return null; }
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
    onChangeProfile({ ...profile, settings: withAddedDocument(profile, { id, label: newLabel.trim() || file.name.replace(/\.pdf$/i, ''), ...v }) });
    setNewLabel(''); setAdding(false);
  }

  async function replaceFile(id: string, file: File) {
    setErr(null);
    setBusyId(id);
    const v = await put(file, id);
    setBusyId(null);
    if (v) onChangeProfile({ ...profile, settings: withReplacedFile(profile, id, v) });
  }

  const draftOpen = !!mapping?.draft;
  const activeVersion = mapping?.active.version ?? BTL6101_TEMPLATE.mappingVersion;

  return (
    <div className="cdx">
      <header className="cdx-head">
        <h2>מסמכים ללקוחות</h2>
        <p>קבצים קבועים שהלקוח מקבל, וטפסים רשמיים שממולאים מהתיק.</p>
      </header>

      {/* ── קבצים לשליחה ── */}
      <section className="cdx-group" aria-labelledby="cdx-files">
        <div className="cdx-group-head">
          <h3 id="cdx-files">קבצים לשליחה</h3>
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
          {docs.map(d => (
            <li key={d.id} className="cdx-row">
              <FileGlyph />
              {renaming?.id === d.id ? (
                <div className="cdx-rename">
                  <input value={renaming.label} autoFocus aria-label="שם חדש"
                    onChange={e => setRenaming({ id: d.id, label: e.target.value })}
                    onKeyDown={e => {
                      if (e.key === 'Enter' && renaming.label.trim()) { onChangeProfile({ ...profile, settings: withRenamedDocument(profile, d.id, renaming.label.trim()) }); setRenaming(null); }
                      if (e.key === 'Escape') setRenaming(null);
                    }} />
                  <button type="button" className="btn btn-primary btn-sm" disabled={!renaming.label.trim()}
                    onClick={() => { onChangeProfile({ ...profile, settings: withRenamedDocument(profile, d.id, renaming.label.trim()) }); setRenaming(null); }}>שמירה</button>
                  <button type="button" className="btn btn-ghost btn-sm" onClick={() => setRenaming(null)}>ביטול</button>
                </div>
              ) : removing === d.id ? (
                <div className="cdx-confirm">
                  <span>להסיר את «{d.label}» מהרשימה?</span>
                  <button type="button" className="btn btn-danger btn-sm"
                    onClick={() => { onChangeProfile({ ...profile, settings: withRemovedDocument(profile, d.id) }); setRemoving(null); }}>הסרה</button>
                  <button type="button" className="btn btn-ghost btn-sm" onClick={() => setRemoving(null)}>ביטול</button>
                </div>
              ) : (
                <>
                  <div className="cdx-main">
                    <div className="cdx-title">{d.label}</div>
                    <div className="cdx-meta">
                      {busyId === d.id ? 'מעלה גרסה חדשה…' : <>{d.fileName} · {fmtDate(d.at)}{d.history?.length ? ` · ${d.history.length} גרסאות קודמות` : ''}</>}
                    </div>
                  </div>
                  <a className="btn btn-ghost btn-sm" href={d.url} target="_blank" rel="noopener noreferrer">צפייה</a>
                  <RowMenu items={[
                    { label: 'שינוי שם', onSelect: () => setRenaming({ id: d.id, label: d.label }) },
                    { label: 'החלפת קובץ', sub: 'משפיע גם על בקשות שכבר נשלחו', onSelect: () => { replaceFor.current = d.id; replaceInput.current?.click(); } },
                    { label: 'הסרה', danger: true, onSelect: () => setRemoving(d.id) },
                  ]} />
                </>
              )}
            </li>
          ))}
        </ul>
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
                {BTL6101_TEMPLATE.pageCount} עמודים · {BTL6101_TEMPLATE.fields.length} שדות · מיפוי {activeVersion}
                {draftOpen && <span className="cdx-chip">טיוטת מיפוי פתוחה</span>}
              </div>
            </div>
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => setManagerOpen(true)}>פתיחה</button>
          </li>
        </ul>
        <p className="cdx-quiet cdx-note">טופס ללקוח נפתח מתוך הלקוח: «בקשות» ← «בקשה חדשה».</p>
      </section>

      {err && <div className="cdx-err" role="alert">{err}</div>}

      {managerOpen && <SmartTemplateManager base={BTL6101_TEMPLATE} onClose={() => { setManagerOpen(false); refreshMapping(); }} />}
    </div>
  );
}

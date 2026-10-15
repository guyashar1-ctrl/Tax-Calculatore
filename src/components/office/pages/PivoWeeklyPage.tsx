// ─── «המשרד» · PIVO השבוע ──────────────────────────────────────────────────────
// יומן שבועי של התפתחות המערכת, לתיעוד ולמגמה. בכל שבוע: מעתיקים בקשה מוכנה,
// מדביקים אותה ב-Claude Code (רק שם הוא רואה מה השתנה), ומדביקים כאן את התשובה.
// ‼ השבוע הפתוח למעלה; שבועות קודמים — רשימה שקטה מתחת, עם «עריכה» לכל שבוע.
import { useEffect, useMemo, useRef, useState } from 'react';
import { Section } from '../officeUi';
import { listNotes, saveNote, deleteNote, type WeeklyNote } from '../../../features/pivoWeekly/api';
import {
  buildPrompt, defaultWeek, HIGHLIGHT_PREFIX, journalText, noteLines, recentWeeks, weekLabel, weekStartOf,
} from '../../../features/pivoWeekly/model';
import '../../../features/pivoWeekly/pivoWeekly.css';

async function copyText(text: string, fallback: HTMLTextAreaElement | null): Promise<boolean> {
  try { await navigator.clipboard.writeText(text); return true; } catch { /* נופל לסימון ידני */ }
  try {
    if (fallback) {
      const d = fallback.closest('details');
      if (d) d.open = true;
      fallback.focus(); fallback.select();
      if (document.execCommand('copy')) return true;
    }
  } catch { /* ignore */ }
  return false;
}

function Lines({ body }: { body: string }) {
  return (
    <ul className="pw-lines">
      {noteLines(body).map((l, i) => (
        <li key={i}>
          {l.startsWith(HIGHLIGHT_PREFIX) ? <><b>{HIGHLIGHT_PREFIX}</b>{l.slice(HIGHLIGHT_PREFIX.length)}</> : l}
        </li>
      ))}
    </ul>
  );
}

export default function PivoWeeklyPage() {
  const [notes, setNotes] = useState<WeeklyNote[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [reload, setReload] = useState(0);
  const today = useMemo(() => new Date(), []);
  const [week, setWeek] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [copied, setCopied] = useState<'prompt' | 'all' | null>(null);
  const [copyFail, setCopyFail] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [flash, setFlash] = useState<string | null>(null);
  // בחירת שבוע אחר — רק כשמבקשים; ברוב השבועות כותבים את השבוע הנוכחי.
  const [pickOpen, setPickOpen] = useState(false);
  const promptRef = useRef<HTMLTextAreaElement>(null);
  const topRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let alive = true;
    setLoadError(null);
    listNotes()
      .then(list => { if (alive) setNotes(list); })
      .catch(e => { if (alive) setLoadError(e instanceof Error ? e.message : String(e)); });
    return () => { alive = false; };
  }, [reload]);

  const byWeek = useMemo(() => new Map((notes ?? []).map(n => [n.weekStart, n])), [notes]);
  // השבוע הנבחר נקבע פעם אחת, כשהיומן נטען.
  useEffect(() => {
    if (notes && week === null) setWeek(defaultWeek(today, new Set(byWeek.keys())));
  }, [notes, week, today, byWeek]);

  const current = week ? byWeek.get(week) ?? null : null;
  const showEditor = !!week && (editing || !current);
  const options = useMemo(() => {
    const list = recentWeeks(today, 6);
    if (week && !list.includes(week)) list.push(week);
    return list;
  }, [today, week]);
  const thisWeek = weekStartOf(today);
  const others = (notes ?? []).filter(n => n.weekStart !== week);

  const pickWeek = (w: string, edit: boolean) => {
    setWeek(w);
    setEditing(edit);
    setText(byWeek.get(w)?.body ?? '');
    setSaveError(null); setConfirmDelete(false); setCopied(null); setCopyFail(false);
  };

  const flashCopied = (k: 'prompt' | 'all') => { setCopied(k); setCopyFail(false); setTimeout(() => setCopied(c => (c === k ? null : c)), 2500); };

  const onSave = async () => {
    if (!week || !text.trim()) return;
    setBusy(true); setSaveError(null);
    try {
      const saved = await saveNote(current, week, text.trim());
      setNotes(prev => [saved, ...(prev ?? []).filter(n => n.weekStart !== week)].sort((a, b) => b.weekStart.localeCompare(a.weekStart)));
      setEditing(false); setPickOpen(false);
      setFlash(week);
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : String(e));
    } finally { setBusy(false); }
  };

  const onDelete = async () => {
    if (!current) return;
    setBusy(true); setSaveError(null);
    try {
      await deleteNote(current.id);
      setNotes(prev => (prev ?? []).filter(n => n.id !== current.id));
      setEditing(false); setText(''); setConfirmDelete(false);
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : String(e));
    } finally { setBusy(false); }
  };

  if (loadError) {
    return (
      <div className="pw" role="alert">
        <p className="pw-err">לא הצלחנו לטעון את היומן: {loadError}</p>
        <button type="button" className="btn btn-secondary btn-sm" onClick={() => setReload(r => r + 1)}>ניסיון חוזר</button>
      </div>
    );
  }
  if (!notes || !week) return <div className="pw"><p className="of-empty">טוען…</p></div>;

  const wkName = `${week === thisWeek ? 'השבוע' : 'שבוע'} · ${weekLabel(week, false)}`;

  return (
    <div className="pw" ref={topRef}>
      <Section id="pw-week" title={wkName}
        aside={!showEditor ? (
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => pickWeek(week, true)}>עדכון</button>
        ) : !pickOpen ? (
          <button type="button" className="of-link" onClick={() => setPickOpen(true)}>שבוע אחר</button>
        ) : undefined}>
        {!showEditor && current && (
          <div className={`pw-current${flash === week ? ' is-fresh' : ''}`} aria-live="polite">
            <Lines body={current.body} />
          </div>
        )}

        {showEditor && (
          <div className="pw-editor">
            {pickOpen && <label className="pw-week-pick">
              <span className="of-field-label">לאיזה שבוע</span>
              <select value={week} disabled={busy} autoFocus onChange={e => pickWeek(e.target.value, !!byWeek.get(e.target.value))}>
                {options.map(w => (
                  <option key={w} value={w}>
                    {weekLabel(w, false)}{w === thisWeek ? ' (השבוע)' : ''}{byWeek.has(w) ? ' · כבר כתוב' : ''}
                  </option>
                ))}
              </select>
            </label>}

            <div className="pw-step">
              <span className="pw-n" aria-hidden="true">1</span>
              <div className="pw-step-body">
                <div className="pw-step-title">שלח ל־Claude את הבקשה</div>
                <div className="pw-copy">
                  <button type="button" className="btn btn-secondary btn-sm"
                    onClick={async () => { if (await copyText(buildPrompt(week), promptRef.current)) flashCopied('prompt'); else setCopyFail(true); }}>
                    {copied === 'prompt' ? '✓ הועתק' : 'העתק את הבקשה'}
                  </button>
                  <span className="pw-hint">הדבק אותה ב־Claude Code, בתיקיית הפרויקט. שם הוא רואה מה השתנה בשבוע הזה.</span>
                </div>
                {copyFail && <p className="pw-hint is-warn" role="status">ההעתקה האוטומטית לא עברה. הבקשה מסומנת למטה; העתק אותה ידנית (Ctrl+C).</p>}
                <details className="pw-see">
                  <summary>מה כתוב בבקשה</summary>
                  <textarea ref={promptRef} readOnly rows={8} value={buildPrompt(week)} aria-label="הבקשה ל־Claude" />
                </details>
              </div>
            </div>

            <div className="pw-step">
              <span className="pw-n" aria-hidden="true">2</span>
              <div className="pw-step-body">
                <label className="pw-step-title" htmlFor="pw-answer">הדבק כאן את התשובה</label>
                <textarea id="pw-answer" rows={7} maxLength={4000} value={text} disabled={busy}
                  placeholder="• מה השתנה השבוע, שורה לכל דבר"
                  onChange={e => { setText(e.target.value); setSaveError(null); }} />
                <span className="pw-hint">אפשר לקצר או לתקן לפני השמירה. נשמר רק אצלך.</span>
              </div>
            </div>

            {saveError && <p className="pw-err" role="alert">השמירה נכשלה: {saveError}. הטקסט עדיין כאן — אפשר לנסות שוב.</p>}

            {!confirmDelete ? (
              <div className="pw-acts">
                <button type="button" className="btn btn-primary btn-sm" disabled={busy || !text.trim()} onClick={() => void onSave()}>
                  {busy ? 'שומר…' : 'שמירה'}
                </button>
                {current && (
                  <button type="button" className="btn btn-ghost btn-sm" disabled={busy} onClick={() => pickWeek(week, false)}>ביטול</button>
                )}
                {current && (
                  <button type="button" className="btn btn-ghost btn-sm pw-del" disabled={busy} onClick={() => setConfirmDelete(true)}>מחיקת השבוע</button>
                )}
              </div>
            ) : (
              <div className="pw-acts pw-confirm" role="group" aria-label="אישור מחיקה">
                <span>למחוק את מה שכתוב לשבוע {weekLabel(week, false)}?</span>
                <button type="button" className="btn btn-ghost btn-sm" disabled={busy} onClick={() => setConfirmDelete(false)} autoFocus>חזרה</button>
                <button type="button" className="btn btn-danger btn-sm" disabled={busy} onClick={() => void onDelete()}>{busy ? 'מוחק…' : 'מחיקה'}</button>
              </div>
            )}
          </div>
        )}
      </Section>

      {others.length > 0 && (
        <Section id="pw-history" title="שבועות קודמים"
          aside={
            <button type="button" className="of-link"
              onClick={async () => { if (await copyText(journalText(notes), null)) flashCopied('all'); else setCopyFail(true); }}>
              {copied === 'all' ? '✓ הועתק' : 'העתק את כל היומן'}
            </button>
          }>
          <ul className="pw-history">
            {others.map(n => (
              <li key={n.id} className={flash === n.weekStart ? 'is-fresh' : undefined}>
                <div className="pw-h-head">
                  <span className="pw-h-week">{weekLabel(n.weekStart, false)}{n.weekStart.slice(0, 4) !== thisWeek.slice(0, 4) ? ` ${n.weekStart.slice(0, 4)}` : ''}</span>
                  <button type="button" className="of-link" aria-label={`עריכת השבוע ${weekLabel(n.weekStart, false)}`}
                    onClick={() => { pickWeek(n.weekStart, true); topRef.current?.scrollIntoView({ block: 'start' }); }}>עריכה</button>
                </div>
                <Lines body={n.body} />
              </li>
            ))}
          </ul>
        </Section>
      )}
    </div>
  );
}

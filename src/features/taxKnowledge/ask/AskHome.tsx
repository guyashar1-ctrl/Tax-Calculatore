// ─── «ידע מקצועי» — הספרייה, עם החיפוש בראשה (25.10.2026; קודם: «קודם השאלה», 21.10) ─────────────
// ‼ החלטת גיא (25.10): הבית של «ידע מקצועי» הוא הספרייה — להתחיל מכאן, המחברות לפי תחום, כלים ונתונים. בחיפוש — נושאים
//   וכלים קודם, אחריהם סעיפים בטפסים לפי קוד או שם, ואז הכללים והערכים.
// ‼ הצעה מאושרת: docs/proposals/2026-10-21-tax-area-reimagined.html. גיא: «כמה שפחות מילים — החוויה מסבירה».
// ‼ בזמן ההקלדה — «מה כתוב אצלנו» מיד (localSearch, בלי רשת). Enter — תשובה מנוסחת מהשרת, רק מכללים, עם הכללים.
//   התשובה עולה כסף — לכן רק בלחיצה, לא בכל הקשה. אין תשובה ⇒ אומרים את זה, והשאלה נכנסת לעדכון הבא.
// ‼ «מה אני לומד» ו«עדכן עכשיו» — הזנה לעדכון הידע (updatePrompt.ts). חומר מהתואר הוא קצה חוט, לא עובדה.

import { useEffect, useMemo, useRef, useState, type DragEvent } from 'react';
import Modal from '../../../components/ui/Modal';
import { useToast } from '../../../components/ui/Toast';
import { ClaimTag, CLAIM_LABEL } from '../claim';
import type { KnowledgeRule } from '../corpus/types';
import { DOMAINS, DOMAIN_BY_ID, domainOf, parseAreaPath, type AreaPath, type DomainId } from '../../taxArea/areaModel';
import { readLastRead } from '../readingMarks';
import { highlightNext, takeSearchFocus } from '../searchHighlight';
import { BODIES } from '../TopicPage';
import KnowledgeCatalog from '../KnowledgeCatalog';
import { findFields } from '../formMap/model';
import { searchValues } from '../domainValues';
import { RULESET_VERSION } from '../../taxRules/registry';
import { searchRules } from './localSearch';
import { bidiText } from './bidiText';
import { AVAILABLE } from '../availability';
import { addInbox, askQuestion, INBOX_CHANGED, listInbox, logQuestion, openQuestions, removeInbox, type AskResult, type InboxItem, type OpenQuestion } from './askApi';
import { buildUpdatePrompt } from './updatePrompt';
import './ask.css';

/** «להתחיל מכאן» — מה שפותחים הכי הרבה בעבודה השוטפת. */
const START: { label: string; to: AreaPath }[] = [
  { label: 'הדוח השנתי — סעיף אחר סעיף', to: { mode: 'learn', domain: 'annual' } },
  { label: 'לוח מועדים', to: { mode: 'learn', domain: 'reference', item: 'deadlines' } },
  { label: 'הוצאות מוכרות', to: { mode: 'learn', domain: 'business', item: 'expenses' } },
  { label: 'ניהול ספרים', to: { mode: 'learn', domain: 'business', item: 'bookkeeping' } },
  { label: 'הצהרת הון', to: { mode: 'learn', domain: 'wealth' } },
];
// ‼ צורות עבריות: «בפנסיה», «והשתלמות», «הוצאות» ⇐ אותו נושא. תחילית אחת וסיומת רבים — לא גזירה מלאה
const stems = (w: string) => {
  const out = new Set([w]);
  if (w.length >= 4 && /^[הובלמכ]/.test(w)) out.add(w.slice(1));
  for (const x of [...out]) if (x.length >= 5 && /(ות|ים)$/.test(x)) out.add(x.slice(0, -2));
  return [...out];
};
const matchesAll = (hay: string, q: string) => {
  const words = q.split(/\s+/).filter(w => w.length >= 2 && !/^20\d\d$/.test(w));
  return words.length > 0 && words.every(w => stems(w).some(s => hay.includes(s)));
};
const formDomainOf = (slug: string): DomainId => (slug === '1219' ? 'wealth' : 'annual');
const MARK: Record<'yes' | 'no' | 'info', string> = { yes: '✓', no: '✕', info: 'i' };

let corpusPromise: Promise<KnowledgeRule[]> | null = null;
const loadCorpus = () => (corpusPromise ??= import('../corpus/corpus.json').then(m => m.default as KnowledgeRule[]));

interface Props {
  onGo: (p: AreaPath) => void;
  onOpenTopic: (topicId: string) => void;
  moved?: boolean;
}

export default function AskHome({ onGo, onOpenTopic, moved }: Props) {
  const { showToast } = useToast();
  const [rules, setRules] = useState<KnowledgeRule[]>([]);
  const [q, setQ] = useState('');
  const [asked, setAsked] = useState<string | null>(null);
  const [result, setResult] = useState<AskResult | 'loading' | 'saved' | null>(null);
  const [showRules, setShowRules] = useState(false);
  const [inbox, setInbox] = useState<InboxItem[] | null>(null);
  const [questions, setQuestions] = useState<OpenQuestion[]>([]);
  const [updating, setUpdating] = useState(false);
  const seq = useRef(0);
  const [last] = useState(readLastRead);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { void loadCorpus().then(setRules); }, []);
  // «חיפוש» / Ctrl+K מעמוד אחר — הסמן בתיבה
  useEffect(() => { if (takeSearchFocus()) inputRef.current?.focus(); }, []);
  const reloadSide = () => { void listInbox().then(setInbox); void openQuestions().then(setQuestions); };
  useEffect(() => { reloadSide(); window.addEventListener(INBOX_CHANGED, reloadSide); return () => window.removeEventListener(INBOX_CHANGED, reloadSide); }, []);

  const typing = q.trim();
  const hits = useMemo(() => (typing && rules.length ? searchRules(rules, typing, 6) : []), [rules, typing]);
  const valueHits = useMemo(() => (typing ? searchValues(typing.split(/\s+/)).slice(0, 4) : []), [typing]);
  // נושאים וכלים קודם — שם הפריט, מטרתו ושם התחום
  const itemHits = useMemo(() => (typing.length >= 2 ? DOMAINS.flatMap(d => d.items.filter(i => matchesAll(`${i.label} ${i.purpose} ${d.label}`, typing)).map(i => ({ d, i }))).slice(0, 6) : []), [typing]);
  const fieldHits = useMemo(() => {
    if (typing.length < 2 && !/^\d+$/.test(typing)) return [];
    const seen = new Set<string>();
    return findFields(typing, 12).filter(h => { const k = `${h.slug}.${h.field.key}`; if (seen.has(k)) return false; seen.add(k); return true; }).slice(0, 4);
  }, [typing]);
  const active = !!typing || !!asked;

  async function ask(text: string) {
    const t = text.trim();
    if (t.length < 2) return;
    // ‼ בלי תשובה מנוסחת (AVAILABLE.askAi): מה שכתוב אצלנו כבר מוצג; שאלה שאין לה כלל — נשמרת לעדכון הבא
    if (!AVAILABLE.askAi) {
      setQ(t);
      if (rules.length && !searchRules(rules, t, 1).length && !searchValues(t.split(/\s+/)).length) {
        const saved = await logQuestion(t);
        setAsked(t); setResult(saved ? 'saved' : null);
        if (saved) void openQuestions().then(setQuestions);
      }
      return;
    }
    const my = ++seq.current;
    setQ(t); setAsked(t); setResult('loading'); setShowRules(false);
    const r = await askQuestion(t);
    if (my !== seq.current) return;
    setResult(r);
    if (r.kind !== 'answer' || !r.answer.answerable) void openQuestions().then(setQuestions);
  }
  const clear = () => { seq.current++; setQ(''); setAsked(null); setResult(null); inputRef.current?.focus(); };

  // ‼ הכלל נבנה מסעיף בדף הנושא (‎<נושא>.<סעיף>.…‎) — פותחים את השלב הזה ומסמנים את הקטע; כלל משכבת הלימוד — בסיכום
  const openRule = (r: KnowledgeRule) => {
    const d = r.topic ? domainOf(r.topic) : undefined;
    if (r.topic && d) {
      const sec = r.id.split('.')[1];
      const sub = BODIES[r.topic]?.toc.some(t => t.id === sec) ? sec : r.kind === 'lesson' ? 'summary' : undefined;
      highlightNext(r.text);
      onGo({ mode: 'learn', domain: d, item: r.topic, ...(sub ? { sub } : {}) });
    } else if (r.topic) onOpenTopic(r.topic);
    else if (r.domain) onGo({ mode: 'learn', domain: r.domain });
  };

  const answer = result && result !== 'loading' && result !== 'saved' && result.kind === 'answer' ? result.answer : null;
  const stale = asked !== null && typing !== asked; // ממשיכים להקליד אחרי ששאלו — התשובה הקודמת נסגרת

  return (
    <div className={`ak${active ? ' is-active' : ''}`} data-ask-home>
      <div className="ak-hero kl-intro">
        <div><p className="kl-eyeline">PIVO / ידע מקצועי</p><h1 className="ak-h">ספריית הידע</h1><p className="kl-intro-line">סיכומים מסודרים, לימוד מעמיק וכלי עבודה.</p></div>
        <form className="ak-ask" role="search" onSubmit={e => { e.preventDefault(); void ask(q); }}>
          <svg className="ak-ask-ic" viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><circle cx="11" cy="11" r="7" fill="none" stroke="currentColor" strokeWidth="2" /><path d="m20 20-3.5-3.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>
          <input ref={inputRef} value={q} onChange={e => setQ(e.target.value)} placeholder="נושא, שאלה או קוד בטופס" aria-label="חיפוש בידע המקצועי" enterKeyHint="search" autoComplete="off" data-ask-input />
          {q && <button type="button" className="ak-clear" onClick={clear} aria-label="ניקוי">✕</button>}
          {AVAILABLE.askAi && <button type="submit" className="ak-go" disabled={q.trim().length < 2} aria-label="קבל תשובה" data-ask-go>
            <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M19 12H5m6-6-6 6 6 6" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" /></svg>
          </button>}
        </form>
      </div>

      {last && !active && (
        <button type="button" className="ak-resume" onClick={() => onGo(parseAreaPath(last.path))} data-ask-resume>
          <span className="kl-resume-symbol" aria-hidden="true">↶</span><span><small>המקום האחרון שקראת</small><b>{last.title}</b></span><span>ממשיכים מכאן <span aria-hidden="true">←</span></span>
        </button>
      )}

      {moved && !active && <p className="ak-moved" role="status">«ערכים לפי נושא» עברו לעמודי התחומים — תחת «ערכים לשנה».</p>}

      {active && (
        <div className="ak-results" aria-live="polite">
          {asked && !stale && result === 'loading' && (
            <div className="ak-answer is-thinking" data-ask-thinking>
              <div className="ak-q"><span className="ak-spark" aria-hidden="true">✦</span>מחפש בכללים המאומתים…</div>
              <div className="ak-sk" style={{ width: '62%' }} /><div className="ak-sk" style={{ width: '84%' }} /><div className="ak-sk" style={{ width: '46%' }} />
            </div>
          )}

          {asked && !stale && answer?.answerable && (
            <article className="ak-answer" data-ask-answer={answer.status ?? ''}>
              <div className="ak-q">{asked}</div>
              <div className="ak-verd">
                {answer.lines.map((l, i) => (
                  <div key={i} className="ak-vline">
                    <span className={`ak-mark is-${l.mark}`} aria-label={l.mark === 'yes' ? 'כן' : l.mark === 'no' ? 'לא' : 'מידע'}>{MARK[l.mark]}</span>
                    <div><b>{bidiText(l.title)}{l.status && l.status !== 'verified' && <> <ClaimTag status={l.status} /></>}</b>{l.detail && <span>{bidiText(l.detail)}</span>}</div>
                  </div>
                ))}
              </div>
              {answer.why && <p className="ak-why">{bidiText(answer.why)}</p>}
              <div className="ak-by">
                {answer.status && <span className={`ak-tag is-${answer.status}`}>{answer.status === 'verified' ? CLAIM_LABEL.verified : answer.status === 'interpretation' ? 'חלקו פרשנות' : 'חלקו פתוח'}</span>}
                <span className="ak-ai"><span className="ak-spark" aria-hidden="true">✦</span>נוסח בידי AI מתוך {answer.rules.length === 1 ? 'כלל אחד' : `${answer.rules.length} כללים`} בלבד</span>
                <button type="button" className="ak-link" aria-expanded={showRules} onClick={() => setShowRules(s => !s)} data-ask-rules>הכללים</button>
              </div>
              {showRules && <RuleList rules={answer.rules} onOpen={openRule} />}
            </article>
          )}

          {asked && !stale && answer && !answer.answerable && (
            <div className="ak-none" data-ask-none>
              <b>אין כלל מאומת שעונה על זה</b>
              <p>{answer.missing ? `${answer.missing} ` : ''}השאלה נכנסה לעדכון הבא.</p>
            </div>
          )}

          {asked && !stale && result === 'saved' && (
            <div className="ak-none" data-ask-saved>
              <b>אין עדיין כלל שעונה על זה</b>
              <p>השאלה נשמרה לעדכון הבא.</p>
            </div>
          )}

          {asked && !stale && result && result !== 'loading' && result !== 'saved' && result.kind === 'unavailable' && (
            <div className="ak-none" data-ask-unavailable={result.reason}>
              <b>התשובה האוטומטית לא זמינה כרגע</b>
              <p>{result.questionId ? 'השאלה נשמרה לעדכון הבא. ' : ''}בינתיים — מה שכתוב אצלנו:</p>
            </div>
          )}

          {(itemHits.length > 0 || fieldHits.length > 0) && (!answer?.answerable || stale) && (
            <section className="ak-local" aria-label="נושאים, כלים וסעיפים">
              {itemHits.length > 0 && <>
                <h4 className="ak-sub">נושאים וכלים</h4>
                <ul className="ak-list">
                  {itemHits.map(({ d, i }) => (
                    <li key={i.id}>
                      <button type="button" onClick={() => onGo({ mode: 'learn', domain: d.id, item: i.id })} data-ask-item={i.id}>
                        <span className="ak-hit-t">{i.label}</span>
                        <span className="ak-hit-w">{i.kind === 'topic' ? 'מסלול לימוד' : 'כלי'} · {d.label}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              </>}
              {fieldHits.length > 0 && <>
                <h4 className="ak-sub">סעיפים בטפסים</h4>
                <ul className="ak-list">
                  {fieldHits.map(h => (
                    <li key={`${h.slug}.${h.field.key}`}>
                      <button type="button" onClick={() => onGo({ mode: 'learn', domain: formDomainOf(h.slug), form: h.slug, field: h.field.key, ...(h.code ? { mark: h.code } : {}) })} data-ask-field={`${h.slug}:${h.code || h.field.key}`}>
                        <span className="ak-hit-t">{h.field.label}</span>
                        <span className="ak-hit-w">טופס {h.formId}{h.code ? <> · קוד <bdi>{h.code}</bdi></> : null}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              </>}
            </section>
          )}

          {(hits.length > 0 || valueHits.length > 0) && (!answer?.answerable || stale) && (
            <section className="ak-local" aria-label="מה כתוב אצלנו">
              <h4 className="ak-sub">אצלנו בידע</h4>
              <ul className="ak-list">
                {hits.map(h => (
                  <li key={h.rule.id}>
                    <button type="button" onClick={() => openRule(h.rule)} data-ask-hit={h.rule.id}>
                      <span className="ak-hit-t">{bidiText(h.rule.text.length > 180 ? h.rule.text.slice(0, 178) + '…' : h.rule.text)}</span>
                      <span className="ak-hit-w"><ClaimTag status={h.rule.status} /> {h.rule.where}</span>
                    </button>
                  </li>
                ))}
                {valueHits.map(v => (
                  <li key={`${v.domain}.${v.group}.${v.label}`}>
                    <button type="button" onClick={() => onGo({ mode: 'learn', domain: v.domain, values: v.group })} data-ask-value>
                      <span className="ak-hit-t">{v.label}</span>
                      <span className="ak-hit-w">ערך לשנה · {DOMAIN_BY_ID[v.domain].label}</span>
                    </button>
                  </li>
                ))}
              </ul>
              {AVAILABLE.askAi && (!asked || stale) ? <p className="ak-hint">Enter — לתשובה מנוסחת</p> : null}
            </section>
          )}
          {typing && !hits.length && !valueHits.length && !itemHits.length && !fieldHits.length && rules.length > 0 && (!asked || stale) && <p className="ak-hint">{AVAILABLE.askAi ? 'Enter — לתשובה מנוסחת מכל הכללים' : 'לא נמצא אצלנו. Enter — לשמור את השאלה לעדכון הבא'}</p>}
        </div>
      )}

      {!active && (
        <>
          <KnowledgeCatalog onGo={onGo} />
          <nav className="kl-shortcuts" aria-label="קיצורי דרך לעבודה">{START.map(x => <button key={x.label} type="button" onClick={() => onGo(x.to)} data-ask-start>{x.label} ←</button>)}</nav>
          <details className="kl-material-desk"><summary>מה אני לומד ועדכון הידע{(inbox?.filter(i => i.status === 'waiting').length ?? 0) + questions.length > 0 && <span> · {(inbox?.filter(i => i.status === 'waiting').length ?? 0) + questions.length} ממתינים</span>}</summary><div className="ak-two">
            <Inbox items={inbox} onChanged={reloadSide} onToast={showToast} />
            <UpdateCard rules={rules} inbox={inbox ?? []} questions={questions} onOpen={() => setUpdating(true)} />
          </div></details>
        </>
      )}

      {updating && <UpdateDialog rules={rules} inbox={inbox ?? []} questions={questions} onClose={() => setUpdating(false)} onToast={showToast} />}
    </div>
  );
}

function RuleList({ rules, onOpen }: { rules: KnowledgeRule[]; onOpen: (r: KnowledgeRule) => void }) {
  return (
    <ul className="ak-cites" data-ask-cites>
      {rules.map(r => (
        <li key={r.id}>
          <ClaimTag status={r.status} />
          <div>
            <span className="ak-cite-t">{bidiText(r.text)}</span>
            <span className="ak-cite-w">
              {r.topic || r.domain ? <button type="button" className="ak-link" onClick={() => onOpen(r)}>{r.where ?? 'לנושא'} ←</button> : r.where}
              {r.law ? ` · ${r.law}` : ''}{r.source ? ` · ${r.source}` : ''}
            </span>
          </div>
        </li>
      ))}
    </ul>
  );
}

// ── «מה אני לומד» ──────────────────────────────────────────────────────────────────
function Inbox({ items, onChanged, onToast }: { items: InboxItem[] | null; onChanged: () => void; onToast: (m: string) => void }) {
  const [title, setTitle] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const [drag, setDrag] = useState(false);
  const [open, setOpen] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  async function add() {
    const t = title.trim() || files[0]?.name.replace(/\.[^.]+$/, '') || '';
    if (t.length < 2 || busy) return;
    setBusy(true);
    const r = await addInbox(t, files);
    setBusy(false);
    if (!r.ok) { onToast(`לא נשמר: ${r.error}`); return; }
    setTitle(''); setFiles([]); onChanged(); onToast('נוסף — ייקלט בעדכון הבא');
  }
  const onDrop = (e: DragEvent) => { e.preventDefault(); setDrag(false); setFiles(f => [...f, ...Array.from(e.dataTransfer.files)]); };

  return (
    <section className={`ak-card ak-inbox${drag ? ' is-drag' : ''}`} aria-labelledby="ak-inbox-h" data-ask-inbox
      onDragOver={e => { e.preventDefault(); setDrag(true); }} onDragLeave={() => setDrag(false)} onDrop={onDrop}>
      <h3 className="ak-sect-h" id="ak-inbox-h">מה אני לומד</h3>
      {items === null ? <p className="ak-hint">לא זמין כרגע.</p> : (
        <ul className="ak-items">
          {items.filter(i => i.status !== 'dismissed').map(i => (
            <li key={i.id}>
              <button type="button" className="ak-item" onClick={() => setOpen(o => (o === i.id ? null : i.id))} aria-expanded={open === i.id}>
                <span><b>{i.title}</b><small>{i.files.length ? `${i.files.length === 1 ? 'קובץ אחד' : `${i.files.length} קבצים`}` : 'בלי קבצים'}</small></span>
                <span className={`ak-st is-${i.status}`}>{i.status === 'ingested' ? 'נקלט' : 'ממתין'}</span>
              </button>
              {open === i.id && (
                <div className="ak-item-more">
                  {i.result && <p>{i.result}</p>}
                  {i.files.length > 0 && <p className="ak-hint">{i.files.map(f => f.name).join(' · ')}</p>}
                  {i.status === 'waiting' && (
                    <button type="button" className="ak-link is-danger" onClick={async () => { if (await removeInbox(i)) { onChanged(); onToast('הוסר'); } }}>הסר</button>
                  )}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
      <form className="ak-add" onSubmit={e => { e.preventDefault(); void add(); }}>
        <input value={title} onChange={e => setTitle(e.target.value)} placeholder={files.length ? `${files.length === 1 ? files[0].name : `${files.length} קבצים`} — שם הנושא` : 'נושא מהתואר, או גרור קובץ'} aria-label="נושא מהתואר" disabled={items === null} data-ask-inbox-input />
        <input ref={fileRef} type="file" multiple hidden onChange={e => setFiles(f => [...f, ...Array.from(e.target.files ?? [])])} />
        <button type="button" className="ak-icon-btn" onClick={() => fileRef.current?.click()} aria-label="צירוף קבצים" disabled={items === null}>
          <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path d="M21 11.5 12.5 20a5 5 0 0 1-7-7L14 4.5a3.5 3.5 0 0 1 5 5L10.5 18a2 2 0 0 1-3-3L15 7.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>
        </button>
        <button type="submit" className="ak-icon-btn is-primary" aria-label="הוסף" disabled={busy || items === null || (title.trim().length < 2 && !files.length)} data-ask-inbox-add>
          <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path d="M12 5v14M5 12h14" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" /></svg>
        </button>
      </form>
    </section>
  );
}

// ── «עדכון הידע» ─────────────────────────────────────────────────────────────────────
function UpdateCard({ rules, inbox, questions, onOpen }: { rules: KnowledgeRule[]; inbox: InboxItem[]; questions: OpenQuestion[]; onOpen: () => void }) {
  const verified = rules.filter(r => r.status === 'verified').length;
  const waiting = inbox.filter(i => i.status === 'waiting').length;
  return (
    <section className="ak-card ak-update" aria-labelledby="ak-up-h" data-ask-update>
      <h3 className="ak-sect-h" id="ak-up-h">עדכון הידע</h3>
      <div className="ak-nums">
        <div><b>{rules.length || '—'}</b><span>כללים</span></div>
        <div><b>{rules.length ? Math.round((verified / rules.length) * 100) + '%' : '—'}</b><span>מאומתים</span></div>
        <div><b>{waiting + questions.length}</b><span>ממתינים לעדכון</span></div>
      </div>
      <p className="ak-hint">גרסת הידע: {RULESET_VERSION}</p>
      <button type="button" className="ak-run" onClick={onOpen} data-ask-run><span className="ak-spark" aria-hidden="true">✦</span>עדכן עכשיו</button>
    </section>
  );
}

function UpdateDialog({ rules, inbox, questions, onClose, onToast }: { rules: KnowledgeRule[]; inbox: InboxItem[]; questions: OpenQuestion[]; onClose: () => void; onToast: (m: string) => void }) {
  const [show, setShow] = useState(false);
  const prompt = useMemo(() => buildUpdatePrompt({ inbox, questions, ruleCount: rules.length }), [inbox, questions, rules.length]);
  const waiting = inbox.filter(i => i.status === 'waiting').length;
  const copy = async () => {
    try { await navigator.clipboard.writeText(prompt); onToast('הפרומט הועתק — הדבק ב-Claude Code'); onClose(); } catch { setShow(true); onToast('סמן והעתק מהתיבה'); }
  };
  return (
    <Modal title="עדכון הידע" onClose={onClose} width={520}>
      <div className="ak-plan" data-ask-plan>
        <div><b>{rules.length}</b><span>כללים — בדיקה מול המקורות</span></div>
        <div><b>{waiting}</b><span>מהתואר — קריאה והוספה</span></div>
        <div><b>{questions.length}</b><span>שאלות שלא נענו</span></div>
      </div>
      <button type="button" className="ak-primary" onClick={() => void copy()} data-autofocus data-ask-copy>העתק את הפרומט</button>
      <div className="ak-plan-foot">
        <button type="button" className="ak-link" aria-expanded={show} onClick={() => setShow(s => !s)}>{show ? 'הסתר' : 'הצג'}</button>
        <span className="ak-hint">מדביקים ב-Claude Code</span>
      </div>
      {show && <textarea className="ak-prompt" readOnly value={prompt} onFocus={e => e.currentTarget.select()} aria-label="הפרומט" />}
    </Modal>
  );
}


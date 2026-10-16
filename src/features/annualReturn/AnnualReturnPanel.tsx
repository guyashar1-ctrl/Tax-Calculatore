// ─── הדוח השנתי: התוצאה, מה חסר, הטיוטה לפי קודים והגרסאות (שלב 4) ────────────────
// ‼ קודם התוצאה והצעד הבא; אחר כך «מה חסר» — כל פער עם דרך לסגור אותו (נתון בשנת המס, הכרעה, או השלמה מקצועית
//   מתועדת). הפירוט (שדות 1301 עם מקור, נספחים, בקרות) — לפי צורך.
// ‼ מצבים נפרדים: טיוטה פנימית (חסרים נתונים) · גיליון עבודה חלקי (יש שדה/נספח רלוונטי שלא מופק) · גיליון מלא ·
//   מוכן להגשה (אישור משרד על גיליון מלא) · הוגש בפועל (רישום ידני). אין כאן שידור או הגשה לרשות.
// ‼ השלמה מקצועית — רק לפער נתון/חישוב בשדות שמופקים; לא למיפוי, לתוצר או לנספח.
// ‼ התיק הוא המרכז: הדוח קורא את העובדות המאושרות של השנה ואת ישויות התיק. מה שהשתנה אחרי אישור — «לבדיקה»,
//   הגרסה המאושרת לא משתנה.

import { useEffect, useMemo, useState } from 'react';
import type { Client } from '../../types';
import type { OnboardingStep } from '../../types/onboarding';
import type { Evidence, YearFact } from '../taxYear/types';
import type { EstimateVersion, IncomeLine, Person } from '../taxEstimate/types';
import { MicroLineEditor } from '../taxEstimate/MicroLineEditor';
import { DocPick, NumField, PERSON, he, nis, today, uid } from '../taxEstimate/parts';
import { loadClientDocuments } from '../taxEstimate/api';
import { cardSnapshot, changesSinceApproval } from '../taxFile/hub';
import { computeReturn, defaultPersons } from './engine';
import { sliceYear, sumComponent } from './facts';
import { returnHtml } from './output';
import * as api from './api';
import type { ReturnCompletion, ReturnDraft, ReturnOutputs, ReturnVersion } from './types';
import { Books1320Editor, CoverageMatrix, DeclarationsEditor, IdentityEditor, ProductsSection, RefundEditor, Rent1321Editor, ScreenerAnswers } from './ReturnEditors';
import { STATUS_HE } from './output';
import '../taxEstimate/estimate.css';

const TRUST_MARK: Record<string, string> = { verified: '✓ אומת מול מסמך', read: '⟳ נקרא מהרשות', manual: '✎ הוזן / הוצהר' };
const srcMark = (s: ReturnOutputs['fields'][number]['source']) => (s.kind === 'fact' ? TRUST_MARK[s.trust ?? 'manual'] : s.kind === 'calculation' ? '∑ חישוב' : s.kind === 'completion' ? '✍ השלמה מקצועית' : 'מהתיק');
const ANNEX_HE = { filled: 'מולא', partial: 'חלקי', manual: 'מולא ידנית', missing: 'חסר' } as const;
/** פער שהשלמה מקצועית לא סוגרת: נסגר בנתון / בעורך / בבקרה — או שאינו נתמך. */
const NOT_COMPLETABLE = (g: { code: string; kind: string }) => !['data', 'calc'].includes(g.kind) || /^(cov_|annex1320_|control_|ni_paid_|insured_salary_)/.test(g.code);

function initialDraft(client: Client, year: number, est?: EstimateVersion): ReturnDraft {
  const micro: ReturnDraft['micro'] = {};
  for (const l of est?.draft.lines ?? []) if (l.source === 'business' && l.entityRef && (l.track || l.micro)) micro[l.entityRef] = { ...(l.micro ?? {}), track: l.track };
  return { taxYear: year, preparedOn: today(), persons: defaultPersons(client, year), completions: [], adjustments: [], micro, niOverrides: est?.draft.niOverrides, decisions: [] };
}

export default function AnnualReturnPanel({ client, step, year, facts, evidence, run }: {
  client: Client; step: OnboardingStep; year: number; facts: YearFact[]; evidence: Evidence[];
  /** כתיבה לשנת המס (הצהרות, פרטים, חשבון להחזר, שאלות פתיחה) — דרך התהליך, שטוען מחדש את העובדות. */
  run: (fn: () => Promise<unknown>, done?: string) => Promise<boolean>;
}) {
  const [versions, setVersions] = useState<ReturnVersion[] | null>(null);
  const [estimate, setEstimate] = useState<EstimateVersion | undefined>();
  const [draft, setDraft] = useState<ReturnDraft | null>(null);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [docs, setDocs] = useState<{ id: string; label: string; date?: string }[]>([]);
  const [completing, setCompleting] = useState<string | null>(null);

  const load = async () => {
    try {
      const [vs, est] = await Promise.all([api.loadReturns(step.id), api.loadApprovedEstimate(client.id, year).catch(() => undefined)]);
      setVersions(vs); setEstimate(est);
      const cur = vs.find(v => v.status === 'draft') ?? [...vs].reverse().find(v => v.status === 'approved');
      setDraft(cur ? cur.draft : initialDraft(client, year, est));
      setDirty(!cur);
    } catch (e) { setMsg({ ok: false, text: `לא ניתן לטעון את הדוח: ${(e as Error).message}` }); setVersions([]); setDraft(initialDraft(client, year)); }
  };
  useEffect(() => { void load(); void loadClientDocuments(client.id).then(setDocs).catch(() => setDocs([])); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [step.id]);

  const out = useMemo(() => (draft ? computeReturn({ client, draft, facts, evidence,
    estimate: estimate?.outputs ? { version: estimate.version, cutoffMonth: estimate.draft.cutoffMonth, outputs: estimate.outputs } : undefined }) : null), [draft, client, facts, evidence, estimate]);

  if (!versions || !draft || !out) return <section className="te-panel"><p className="ty-label">הדוח השנתי</p><p className="ty-note">טוען…</p></section>;

  const latest = versions.length ? versions[versions.length - 1] : undefined;
  const approved = [...versions].reverse().find(v => v.status === 'approved');
  const filed = versions.find(v => v.filedAt);
  const showingApproved = !!approved && latest?.id === approved.id && !dirty;
  const married = client.familyStatus === 'married' || !!client.spouse;
  const spouseName = client.spouseFirstName || client.spouse?.firstName || PERSON.spouse;
  const clientName = [client.firstName, client.lastName].filter(Boolean).join(' ') || 'הלקוח';

  const upd = (f: (d: ReturnDraft) => ReturnDraft) => { setDraft(d => (d ? f(d) : d)); setDirty(true); setMsg(null); };
  const inputFacts = () => [...sliceYear(facts, year).full.map(f => ({ id: f.id, value: f.value })), ...cardSnapshot(client)];
  const save = async () => {
    setBusy(true);
    const r = await api.saveReturn(step.id, draft, out, inputFacts(), api.baseOf(versions));
    setBusy(false);
    if (!r.ok && r.error === 'conflict') {
      try { setVersions(await api.loadReturns(step.id)); } catch { /* ההודעה מספיקה */ }
      setMsg({ ok: false, text: 'מישהו שמר את הדוח בינתיים. השינויים שלך עדיין כאן ולא נשמרו; ב«גרסאות» רואים מה נשמר.' });
      return false;
    }
    if (!r.ok) { setMsg({ ok: false, text: r.error === 'year_mismatch' ? 'הדוח שייך לשנה אחרת מהבקשה — לא נשמר' : r.error === 'request_closed' ? 'הבקשה סגורה — לא נשמר' : `השמירה נכשלה (${r.error})` }); return false; }
    setMsg({ ok: true, text: r.created ? `נפתחה גרסה ${r.version} (טיוטה פנימית)` : `טיוטה ${r.version} נשמרה` });
    setDirty(false); await load(); return true;
  };
  const approve = async () => {
    if (dirty && !(await save())) return;
    const d = (await api.loadReturns(step.id)).find(v => v.status === 'draft');
    if (!d) return;
    setBusy(true);
    const r = await api.approveReturn(d.id, d.revision);
    setBusy(false);
    if (!r.ok) { setMsg({ ok: false, text: r.error === 'has_blockers' ? 'יש עדיין דברים חסרים — לא אושר' : r.error === 'not_ready' ? 'רק גיליון עבודה מלא מאושר «מוכן להגשה»' : r.error === 'conflict' ? 'הטיוטה השתנתה בינתיים — לבדוק ולאשר שוב' : `האישור נכשל (${r.error})` }); return; }
    setMsg({ ok: true, text: `גרסה ${r.version} אושרה — «מוכן להגשה»: הקלדה במערכת המקוונת לפי הגיליון. לא שודר דבר; ההגשה נרשמת כאן.` });
    await load();
  };
  const download = (v: { outputs: ReturnOutputs; version: number; approved: boolean; filed?: { at: string; ref?: string } }) => {
    const html = returnHtml(v.outputs, { clientName, spouseName: v.outputs.persons.length > 1 ? spouseName : undefined, version: v.version, approved: v.approved, filed: v.filed });
    const url = URL.createObjectURL(new Blob([html], { type: 'text/html;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url; a.download = `טיוטת-1301-${year}-גרסה-${v.version}${v.filed ? '-הוגש' : v.approved ? '-מאושר' : ''}.html`;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const impact = approved ? changesSinceApproval({ inputFacts: approved.inputFacts, approvedAt: approved.approvedAt, client, facts, taxYear: year }) : [];
  const decided = (key: string) => draft.decisions.some(d => d.key === key);
  const decide = (key: string, text: string) => upd(d => ({ ...d, decisions: [...d.decisions.filter(x => x.key !== key), { key, text, at: today() }] }));
  const contentHe = out.status === 'internalDraft' ? 'טיוטה פנימית' : out.status === 'partialWorksheet' ? 'גיליון עבודה חלקי' : 'גיליון עבודה מלא';
  const statusText = filed ? `הוגש בפועל · ${he(filed.filedAt)} (גרסה ${filed.version})` : showingApproved ? `מוכן להגשה · גרסה ${approved!.version}` : `${contentHe} · ${dirty ? 'לא נשמר' : `גרסה ${latest?.version ?? 1}`}`;
  const fixRows = out.formCoverage.rows;
  const bal = out.household.balance;
  const parts = [...new Set(out.fields.map(f => f.part))];
  const bizList = (client.businesses ?? []).filter(b => !(b as { isClosed?: boolean }).isClosed && draft.persons.includes((b as { belongsToSpouse?: boolean }).belongsToSpouse ? 'spouse' : 'client'));
  const pendingCompletions = draft.completions.filter(c => !c.approvedAt);

  return (
    <section className="te-panel" aria-labelledby="ar-title">
      <p className="ty-label" id="ar-title">הדוח השנתי</p>
      <div className="te-result">
        <div className="te-head">
          <h3>דוח {year} · {draft.persons.length > 1 ? `${client.firstName || 'הלקוח'} ו${spouseName}` : client.firstName || 'הלקוח'}</h3>
          <span className={`ty-chip ${filed || showingApproved ? 'green' : 'amber'}`} title={STATUS_HE[filed ? 'filed' : showingApproved ? 'approved' : out.status]}>{statusText}</span>
        </div>
        {out.household.incomplete && <p className="te-partial-banner" role="note"><b>חסרים נתוני הכנסה</b> — אין עדיין חבות או יתרה להציג. מה להשלים — ברשימה למטה.</p>}
        <div className={`te-figures${out.blockers.length ? ' is-partial' : ''}`}>
          <div><span>מס הכנסה לשנה{out.household.manualTax ? ' (כולל השלמות)' : ''}</span><b>{out.household.incomplete ? 'חסר' : nis(out.household.liability)}</b></div>
          <div><span>נוכה במקור</span><b>{nis(out.household.withheld)}</b></div>
          <div><span>מקדמות ששולמו</span><b>{nis(out.household.advancesPaid)}</b></div>
          <div><span>{out.household.incomplete ? 'יתרה' : bal > 0 ? 'לתשלום' : bal < 0 ? 'להחזר' : 'יתרה'}</span><b className={bal > 0 && !out.household.incomplete ? 'te-due' : ''}>{out.household.incomplete ? 'חסר' : bal === 0 ? 'מאוזן' : nis(Math.abs(bal))}</b></div>
        </div>
        <p className="ty-note">{out.coverage.text}. {out.blockers.length ? 'המספרים חלקיים עד שיושלם מה שחסר.' : ''}</p>
        <p className="te-next"><b>הצעד הבא:</b> {filed ? 'הדוח נרשם כמוגש. דוח מתקן — גרסה חדשה.' : showingApproved ? 'חתימת הלקוח והגשה במערכת המקוונת של רשות המסים (ידני), ואז «רשום הגשה» כאן.' : out.nextAction}</p>
        {impact.length > 0 && (
          <div className="ty-why wd-hint te-impact" role="note">
            <b>לבדיקה מאז אישור גרסה {approved!.version}</b>
            <ul>{impact.slice(0, 5).map((x, i) => <li key={i}>{x.text}{x.affects ? <small> — עשוי להשפיע על {x.affects}</small> : null}</li>)}{impact.length > 5 && <li>ועוד {impact.length - 5}</li>}</ul>
            <span>הגרסה המאושרת לא משתנה; כדי לעדכן — גרסה חדשה (דוח מתקן אם כבר הוגש).</span>
          </div>
        )}
        {msg && <p className={msg.ok ? 'ty-ok' : 'ty-err'} role={msg.ok ? 'status' : 'alert'}>{msg.text}</p>}
        <div className="ty-actions">
          <button type="button" className="btn btn-primary" disabled={busy || out.status !== 'completeWorksheet' || showingApproved || !!filed && !dirty}
            onClick={() => void approve()} title={out.status === 'internalDraft' ? 'חסרים נתונים' : out.status === 'partialWorksheet' ? 'יש שדות או נספחים שהמערכת לא מפיקה — לא «מוכן להגשה»' : ''}>אשר «מוכן להגשה»</button>
          <button type="button" className="btn btn-ghost" disabled={busy || !dirty} onClick={() => void save()}>שמור טיוטה</button>
          <button type="button" className="btn btn-ghost" onClick={() => showingApproved && approved?.outputs
            ? download({ outputs: approved.outputs, version: approved.version, approved: true, filed: approved.filedAt ? { at: he(approved.filedAt), ref: approved.filedRef } : undefined })
            : download({ outputs: out, version: dirty ? (latest?.version ?? 0) + (latest?.status === 'draft' ? 0 : 1) : latest?.version ?? 1, approved: false })}>הורד גיליון 1301 (HTML)</button>
        </div>
      </div>

      {out.blockers.length > 0 && (
        <div className="te-gaps" aria-labelledby="ar-gaps">
          <p className="ty-label" id="ar-gaps">מה חסר · {out.blockers.length}</p>
          <ol className="te-blockers">
            {out.blockers.map(b => (
              <li key={b.code}>
                <span>{b.text}</span>
                {b.code === 'capital_rates' && !decided('capital.rates') && <button type="button" className="btn btn-sm btn-ghost" onClick={() => decide('capital.rates', 'ריבית ודיבידנד בשיעור 25% (לא בעל מניות מהותי); הניכוי במקור לפי 867')}>הכרעת משרד: 25%</button>}
                {b.code.startsWith('control_') && <small> — לתקן את הנתון בשנת המס (למטה), ואז הבקרה תיבדק שוב</small>}
                {!NOT_COMPLETABLE(b) && b.code !== 'capital_rates' && completing !== b.code && <button type="button" className="btn btn-sm btn-ghost" onClick={() => setCompleting(b.code)}>השלמה מקצועית</button>}
                {completing === b.code && <CompletionForm gap={b.code} persons={draft.persons} spouseName={spouseName} docs={docs}
                  onCancel={() => setCompleting(null)} onAdd={c => { upd(d => ({ ...d, completions: [...d.completions.filter(x => x.gap !== c.gap), c] })); setCompleting(null); }} />}
              </li>
            ))}
          </ol>
          <DeclarationsEditor client={client} year={year} facts={facts} rows={fixRows} run={run} requestId={step.id} />
          <IdentityEditor client={client} year={year} facts={facts} rows={fixRows} run={run} requestId={step.id} />
          <RefundEditor client={client} year={year} facts={facts} rows={fixRows} run={run} requestId={step.id} />
          <ScreenerAnswers client={client} year={year} facts={facts} run={run} requestId={step.id} />
          <p className="ty-note">נתון חסר? משלימים אותו כאן, בשנת המס («מה חסר לשנה») או מבקשים מהלקוח. השלמה מקצועית — רק לפער נתון או חישוב בשדות שהמערכת מפיקה, עם ביסוס ואסמכתה.</p>
        </div>
      )}
      {out.unsupported.length > 0 && (
        <div className="te-gaps" aria-labelledby="ar-unsup">
          <p className="ty-label" id="ar-unsup">מה המערכת לא מפיקה ללקוח הזה · {out.unsupported.length}</p>
          <ul className="te-blockers">{out.unsupported.map((u, i) => <li key={u.code + i}>{u.text}</li>)}</ul>
          <p className="ty-note">לא נסגר בהשלמה מקצועית. כל עוד יש כאן משהו — «גיליון עבודה חלקי»; את החלקים האלה מכינים מחוץ למערכת, והדוח אינו מסומן «מוכן להגשה».</p>
        </div>
      )}
      {pendingCompletions.length > 0 && (
        <p className="ty-why wd-hint">{pendingCompletions.length} השלמות ממתינות לביסוס ולאישור — לא נכנסו לחישוב: {pendingCompletions.map(c => c.gap).join(', ')}</p>
      )}

      <details className="ty-details" id="ar-persons">
        <summary><b>מי בדוח</b><span>{draft.persons.map(p => (p === 'spouse' ? spouseName : client.firstName || PERSON.client)).join(' + ')}</span></summary>
        <div className="ty-details-body">
          <label className="te-radio"><input type="checkbox" checked disabled /> {client.firstName || PERSON.client}{married ? ' — בן/בת הזוג הרשום/ה' : ''}</label>
          {married && <label className="te-radio"><input type="checkbox" checked={draft.persons.includes('spouse')} onChange={e => upd(d => ({ ...d, persons: e.target.checked ? ['client', 'spouse'] : ['client'] }))} /> {spouseName} — חישוב נפרד באותו דוח</label>}
          <small className="ty-note">ברירת המחדל: בן/בת הזוג נכלל/ת כשיש לו/ה הכנסה בתיק.</small>
        </div>
      </details>

      {bizList.length > 0 && (
        <details className="ty-details" id="ar-micro">
          <summary><b>עסקים — מסלול לשנה ונספח 1320</b><span>{bizList.map(b => `${b.name || 'עסק'}: ${draft.micro[b.id]?.track === 'micro' ? 'עסק זעיר' : draft.micro[b.id]?.track === 'books' ? 'לפי הספרים' : 'לא נקבע'}`).join(' · ')}</span></summary>
          <div className="ty-details-body te-lines">
            {bizList.map(b => {
              const m = draft.micro[b.id] ?? {};
              const person: Person = (b as { belongsToSpouse?: boolean }).belongsToSpouse ? 'spouse' : 'client';
              const line = { id: `biz-${b.id}`, person, source: 'business', entityRef: b.id, label: b.name || 'עסק', track: m.track, micro: m } as IncomeLine;
              return (
                <div key={b.id} className="te-line">
                  <div className="te-line-head"><b>{b.name || 'עסק'}</b><span className="ty-chip">{person === 'spouse' ? spouseName : PERSON.client}</span></div>
                  <MicroLineEditor line={line} year={year} client={client} result={out.micro.find(x => x.lineId === line.id)} docs={docs}
                    onChange={patch => upd(d => ({ ...d, micro: { ...d.micro, [b.id]: { ...(d.micro[b.id] ?? {}), ...(patch.micro ?? {}), ...('track' in patch ? { track: patch.track } : {}) } } }))} />
                  {m.track !== 'micro' && <Books1320Editor label={b.name || 'עסק'} books={draft.books?.[b.id]} profitFact={sumComponent(sliceYear(facts, year), 'business.profit', 'profit', person, evidence, b.id).amount}
                    onChange={nb => upd(d => ({ ...d, books: { ...(d.books ?? {}), [b.id]: nb } }))} />}
                </div>
              );
            })}
          </div>
        </details>
      )}

      {out.persons.some(p => p.pension?.beneficial) && (
        <details className="ty-details" id="ar-pension">
          <summary><b>פנסיה כעצמאי — מסלול</b><span>עמית מוטב: רשות המסים מחשבת במסלול ב׳, אלא אם מסמנים «יחיד» (233/234)</span></summary>
          <div className="ty-details-body">{out.persons.filter(p => p.pension?.beneficial).map(p => {
            const pc = p.pension!, b = pc.track === 'B' ? pc : pc.alternative, a = pc.track === 'A' ? pc : pc.alternative;
            return <label key={p.person} className="te-field">{p.person === 'spouse' ? spouseName : client.firstName || PERSON.client} — במסלול ב׳: ניכוי {nis(b?.deduction)}, זיכוי על {nis(b?.creditBase)} · במסלול א׳: ניכוי {nis(a?.deduction)}, זיכוי על {nis((a?.creditBase ?? 0) + (a?.extraCreditBase ?? 0))}
              <select value={draft.pensionTrack?.[p.person] ?? 'auto'} onChange={e => upd(d => ({ ...d, pensionTrack: { ...(d.pensionTrack ?? {}), [p.person]: e.target.value as 'auto' | 'A' } }))}><option value="auto">מסלול ב׳ (ברירת המחדל של הרשות)</option><option value="A">מסלול א׳ — «יחיד» (סימון 233/234)</option></select></label>;
          })}<p className="ty-note">בדוח נרשם ב-135/180 כל הסכום ששולם; רשות המסים מפצלת לניכוי ולזיכוי (מדריך 2025, סעיף 53).</p></div>
        </details>
      )}

      {out.annex1321 && (
        <details className="ty-details" id="ar-1321" open={!out.annex1321.complete}>
          <summary><b>שכר דירה 10% — נספח 1321</b><span>{out.annex1321.complete ? 'מלא' : out.annex1321.problems.join(' · ')}</span></summary>
          <div className="ty-details-body"><Rent1321Editor out={out} value={draft.rent1321} onChange={r => upd(d => ({ ...d, rent1321: r }))} /></div>
        </details>
      )}

      <details className="ty-details" id="ar-coverage">
        <summary><b>בדיקת כיסוי — כל שדות הטופס</b><span>{out.formCoverage.counts.filled}/{out.formCoverage.counts.relevant} רלוונטיים מולאו · {out.formCoverage.counts.missing} חסרים · {out.formCoverage.counts.notSupported} לא מופקים</span></summary>
        <div className="ty-details-body"><CoverageMatrix out={out} /></div>
      </details>

      <details className="ty-details" id="ar-products">
        <summary><b>תוצרים להגשה</b><span>גיליון עבודה · קובץ לפי מבנה רשות המסים · אין שידור</span></summary>
        <div className="ty-details-body"><ProductsSection out={out} client={client} draft={draft} onDownloadSheet={() => download({ outputs: out, version: latest?.version ?? 1, approved: showingApproved })} /></div>
      </details>

      <details className="ty-details" id="ar-fields">
        <summary><b>טיוטת 1301 לפי קודים</b><span>{out.fields.length} שדות · {out.formVersionId}</span></summary>
        <div className="ty-details-body">
          {parts.map(p => (
            <div key={p} className="ar-part">
              <p className="ty-label">חלק {p}</p>
              <div className="ar-table-wrap"><table className="ar-table">
                <thead><tr><th>קוד</th><th>שדה</th><th>של מי</th><th>סכום</th><th>מקור</th></tr></thead>
                <tbody>{out.fields.filter(f => f.part === p).map(f => (
                  <tr key={f.code + f.person}><td className="ar-code">{f.code}</td><td>{f.label}</td><td>{f.person === 'spouse' ? spouseName : f.person === 'joint' ? 'משותף' : client.firstName || PERSON.client}</td>
                    <td className="ar-num">{f.kind === 'amount' ? nis(f.amount) : f.kind === 'checkbox' ? (f.checked ? '☒ מסומן' : '☐') : f.text}</td><td className="ar-src">{srcMark(f.source)}<br /><small>{f.source.text}</small></td></tr>
                ))}</tbody>
              </table></div>
            </div>
          ))}
          {out.fields.length === 0 && <p className="ty-note">אין עדיין שדות — חסרים נתונים סופיים לשנה.</p>}
          <p className="ty-note">✓ אומת מול מסמך · ⟳ נקרא מהרשות · ✎ הוזן / הוצהר · ∑ חישוב · ✍ השלמה מקצועית</p>
        </div>
      </details>

      <details className="ty-details" id="ar-annexes">
        <summary><b>נספחים ובקרות</b><span>{out.annexes.length ? `${out.annexes.length} נספחים` : 'אין נספחים'} · {out.controls.filter(c => c.ok === false).length ? `${out.controls.filter(c => c.ok === false).length} בקרות נכשלו` : 'הבקרות תקינות'}</span></summary>
        <div className="ty-details-body">
          <ul className="wd-list">{out.annexes.map(a => (
            <li key={a.formId + (a.entityRef ?? '')}><b>{a.formId}</b> — {a.title} · {a.reason} · <b>{ANNEX_HE[a.status]}</b>{a.note ? <small> — {a.note}</small> : null}</li>
          ))}{out.annexes.length === 0 && <li>לא נדרשים נספחים לפי הנתונים</li>}</ul>
          <p className="ty-label">בקרות התאמה</p>
          <ul className="wd-list">{out.controls.map(c => <li key={c.id} className={c.ok === false ? 'ty-err' : ''}>{c.ok === true ? '✓' : c.ok === false ? '✗' : '—'} {c.text} · <small>{c.detail}</small></li>)}</ul>
          {out.limits.length > 0 && <><p className="ty-label">הערות</p><ul className="wd-list">{out.limits.map((l, i) => <li key={i}>{l}</li>)}</ul></>}
          {draft.decisions.length > 0 && <><p className="ty-label">הכרעות משרד</p><ul className="wd-list">{draft.decisions.map(d => <li key={d.key}>{d.text}{d.at ? ` · ${he(d.at)}` : ''} <button type="button" className="btn btn-sm btn-ghost" onClick={() => upd(x => ({ ...x, decisions: x.decisions.filter(y => y.key !== d.key) }))}>בטל</button></li>)}</ul></>}
          {draft.completions.length > 0 && <><p className="ty-label">השלמות מקצועיות</p><ul className="wd-list">{draft.completions.map(c => <li key={c.id}>{c.gap} · {c.fields.map(f => `${f.code}: ${nis(f.amount)}`).join(', ')}{c.taxAmount ? ` · מס ${nis(c.taxAmount)}` : ''} · {c.justification} · {c.approvedAt ? `אושרה ${he(c.approvedAt)}` : 'ממתינה'} <button type="button" className="btn btn-sm btn-ghost" onClick={() => upd(x => ({ ...x, completions: x.completions.filter(y => y.id !== c.id) }))}>הסר</button></li>)}</ul></>}
        </div>
      </details>

      <details className="ty-details" id="ar-versions">
        <summary><b>גרסאות והגשה</b><span>{versions.length ? `${versions.length} · ${filed ? 'הוגש' : approved ? 'מוכן להגשה' : 'טיוטה'}` : 'עוד לא נשמר'}</span></summary>
        <div className="ty-details-body">
          <ul className="wd-list">{[...versions].reverse().map(v => (
            <li key={v.id}>גרסה {v.version} · {v.status === 'approved' ? `מוכן להגשה (אושר ${he(v.approvedAt?.slice(0, 10))})` : v.status === 'draft' ? 'טיוטה פנימית' : 'הוחלפה'}
              {v.filedAt ? ` · הוגש בפועל ${he(v.filedAt)}${v.filedRef ? ` · ${v.filedRef}` : ''}` : ''}
              {v.outputs ? (v.outputs.household.incomplete ? ' · חסרים נתוני הכנסה' : ` · ${v.outputs.household.balance > 0 ? 'לתשלום' : v.outputs.household.balance < 0 ? 'להחזר' : 'מאוזן'} ${v.outputs.household.balance ? nis(Math.abs(v.outputs.household.balance)) : ''}`) : ''}
              {v.outputs && <button type="button" className="btn btn-sm btn-ghost" onClick={() => download({ outputs: v.outputs!, version: v.version, approved: v.status !== 'draft', filed: v.filedAt ? { at: he(v.filedAt), ref: v.filedRef } : undefined })}>הורד</button>}
              {v.status !== 'draft' && <button type="button" className="btn btn-sm btn-ghost" onClick={() => { setDraft(v.draft); setDirty(true); setMsg({ ok: true, text: `נטענה גרסה ${v.version} — שמירה תפתח גרסה חדשה${v.filedAt ? ' (דוח מתקן)' : ''}` }); }}>{v.filedAt ? 'פתח דוח מתקן' : 'התחל ממנה'}</button>}
            </li>
          ))}</ul>
          {approved && !approved.filedAt && <FiledForm docs={docs} busy={busy} onRecord={async (on, ref, ev) => {
            setBusy(true); const r = await api.recordFiled(approved.id, on, ref, ev); setBusy(false);
            if (!r.ok) { setMsg({ ok: false, text: r.error === 'bad_date' ? 'תאריך ההגשה לא יכול להיות בעתיד' : r.error === 'evidence_required' ? 'נדרש מספר אישור או מסמך' : `הרישום נכשל (${r.error})` }); return; }
            setMsg({ ok: true, text: `נרשם: הוגש בפועל ב-${he(on)}` }); await load();
          }} />}
          <p className="ty-note">מסלול ידני: אחרי «מוכן להגשה» — חתימת הלקוח, הקלדה במערכת המקוונת של רשות המסים לפי הגיליון, ורישום ההגשה כאן עם מספר האישור. המערכת לא משדרת ולא מגישה.</p>
        </div>
      </details>
    </section>
  );
}

function CompletionForm({ gap, persons, spouseName, docs, onAdd, onCancel }: {
  gap: string; persons: Person[]; spouseName: string; docs: { id: string; label: string; date?: string }[]; onAdd: (c: ReturnCompletion) => void; onCancel: () => void;
}) {
  const [v, setV] = useState({ person: 'client' as Person, code: '', amount: undefined as number | undefined, tax: undefined as number | undefined, why: '', doc: undefined as string | undefined, ok: false });
  const ready = v.why.trim().length > 3 && (v.code.trim() === '' || v.amount != null);
  return (
    <div className="te-grid ar-completion" role="group" aria-label="השלמה מקצועית">
      {persons.length > 1 && <label className="te-field">של מי<select value={v.person} onChange={e => setV({ ...v, person: e.target.value as Person })}><option value="client">{PERSON.client}</option><option value="spouse">{spouseName}</option></select></label>}
      <label className="te-field">קוד בטופס<input inputMode="numeric" value={v.code} onChange={e => setV({ ...v, code: e.target.value.replace(/\D/g, '').slice(0, 3) })} placeholder="למשל 060" /></label>
      <NumField label="סכום בשדה" value={v.amount} onChange={x => setV({ ...v, amount: x })} />
      <NumField label="מס על הרכיב (מחושב מחוץ למערכת)" value={v.tax} onChange={x => setV({ ...v, tax: x })} hint="0 = אין השפעת מס" />
      <label className="te-field ar-why">ביסוס<input value={v.why} onChange={e => setV({ ...v, why: e.target.value })} placeholder="למשל: רווח הון לפי 867 של הבנק, חושב בגיליון המשרד" /></label>
      <DocPick docs={docs} value={v.doc} onChange={id => setV({ ...v, doc: id })} />
      <label className="te-radio"><input type="checkbox" checked={v.ok} onChange={e => setV({ ...v, ok: e.target.checked })} /> בדקתי ומאשר/ת — נכנס לחישוב</label>
      <div className="ty-actions">
        <button type="button" className="btn btn-sm btn-primary" disabled={!ready} onClick={() => onAdd({ id: uid(), gap, person: v.person, fields: v.code && v.amount != null ? [{ code: v.code, amount: v.amount }] : [], taxAmount: v.tax, justification: v.why.trim(), evidenceDocumentId: v.doc, approvedAt: v.ok ? today() : undefined })}>{v.ok ? 'הוסף והחל' : 'שמור כממתינה'}</button>
        <button type="button" className="btn btn-sm btn-ghost" onClick={onCancel}>ביטול</button>
      </div>
    </div>
  );
}

function FiledForm({ docs, busy, onRecord }: { docs: { id: string; label: string; date?: string }[]; busy: boolean; onRecord: (on: string, ref: string, ev?: string) => Promise<void> }) {
  const [v, setV] = useState({ on: '', ref: '', doc: undefined as string | undefined });
  return (
    <div className="te-grid" role="group" aria-label="רישום הגשה">
      <label className="te-field">הוגש בתאריך<input type="date" max={today()} value={v.on} onChange={e => setV({ ...v, on: e.target.value })} /></label>
      <label className="te-field">מספר אישור הגשה<input value={v.ref} onChange={e => setV({ ...v, ref: e.target.value })} /></label>
      <DocPick docs={docs} value={v.doc} onChange={id => setV({ ...v, doc: id })} />
      <div className="ty-actions"><button type="button" className="btn btn-sm btn-ghost" disabled={busy || !v.on || (!v.ref.trim() && !v.doc)} onClick={() => void onRecord(v.on, v.ref, v.doc)}>רשום הגשה (ידני)</button></div>
    </div>
  );
}

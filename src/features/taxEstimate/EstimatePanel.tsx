// ─── הערכת מס: התוצאה, הנתונים והגרסאות (שלב 3) ───────────────────────────────
// ‼ קודם התוצאה והצעד הבא; הפירוט — לפי צורך. כל מספר בפירוט מצביע למקור (עובדה, מסמך, קריאה מהרשות).
// ‼ כלל שלא הוכרע: המספר לא מוצג כוודאי — «לא מחושב» עם הסיבה ומה משלים אותו. «הכרעת משרד» אינה פותרת אי־ודאות (14.10.2026).
// ‼ גרסה מאושרת אינה נערכת; שינוי אחרי אישור פותח טיוטה חדשה (231). אין כאן שינוי מקדמות ברשות
//   ואין שליחה ללקוח — ההמלצה נמסרת ביד, אחרי אישור.

import { useEffect, useMemo, useState } from 'react';
import type { Client } from '../../types';
import type { OnboardingStep } from '../../types/onboarding';
import type { Evidence, YearFact } from '../taxYear/types';
import { RULESET_VERSION } from '../taxRules/registry';
import { RULES } from '../taxRules/rules';
import { useDocumentStore } from '../../hooks/useDocumentStore';
import { computeEstimate, annualFor, forecastFor, MONTH_HE, IT_CORE_RULES } from './engine';
import { buildDraft, cardAdvances, reconciliationsNeeded } from './prefill';
import * as api from './api';
import { cardSnapshot, changesSinceApproval } from '../taxFile/hub';
import { AdvanceResult, CatchUpEditor, ItSetupEditor, NiOverrideEditor, NiSetupEditor } from './AdvanceEditors';
import ImportPanel from './ImportPanel';
import { MicroLineEditor } from './MicroLineEditor';
import { EstimateSummary } from './EstimateSummary';
import { AuthorityOverview, ChecksList } from './AuthorityView';
import { followUpsFor } from './followUps';
import { useKnowledgeLink } from '../taxKnowledge/knowledgeLink';
import { AmountView, DocPick, NumField, PERSON, Periods, he, nis, today, uid } from './parts';
import type { CapitalKind, EstimateDraft, EstimateVersion, ForecastMethod, IncomeLine, ItAdvanceSetup, NiAdvanceSetup, Person, SourceRef } from './types';
import './estimate.css';
import { clientForTaxYear } from '../../utils/familyStatusYear';
import { niEmployersInYear, niEmployersText } from '../nationalInsurance/niOccupations';

const SOURCE_HE: Record<IncomeLine['source'], string> = { salary: 'משכורת', business: 'עסק', rent: 'שכר דירה', capital: 'שוק ההון', other: 'אחר' };
const CAPITAL_KIND_HE: Record<CapitalKind, string> = {
  gains: 'רווח הון (25%)', dividend: 'דיבידנד (25%)', dividendSubstantial: 'דיבידנד — בעל מניות מהותי באותה חברה (30%)',
  interestUnlinked: 'ריבית לא צמודה (15%)', interestLinked: 'ריבית צמודה / זרה (25%)', interestOwnCompany: 'ריבית מחברה שבשליטתו (מדרגות רגילות)',
};
const CTRL_FLAGS: { key: 'withdrawals' | 'loans' | 'attribution62a' | 'companyRent' | 'companyCar'; label: string }[] = [
  { key: 'withdrawals', label: 'משיכות / יתרת חובה בחברה' }, { key: 'loans', label: 'הלוואה מהחברה' }, { key: 'attribution62a', label: 'ייחוס הכנסה (62א)' },
  { key: 'companyRent', label: 'החברה משלמת לו שכירות' }, { key: 'companyCar', label: 'רכב / נכס של החברה שלא ב-106' },
];
const SPOUSE_SOURCE: [NonNullable<EstimateDraft['spouseSource']>, string][] = [
  ['none', 'לא — לכל אחד מקור משלו'],
  ['dependentMet', 'כן, ושלושת התנאים מתקיימים (יגיעה של כל אחד, הכנסה לפי תרומה, ובבית — דרך קבע)'],
  ['dependentNotMet', 'כן, והתנאים לא מתקיימים — חישוב מאוחד'],
];
const METHOD_HE: Record<ForecastMethod, string> = { runRate: 'קצב חודשי מהבפועל', lastYear: 'כמו אותם חודשים בשנה שעברה', manual: 'סכום', none: 'אין הכנסה בהמשך' };

/** 14.10.2026 · מי מסר / מי בדק — לכל סכום. */
export const PROVENANCE_HE: Record<NonNullable<SourceRef['provenance']>, string> = {
  client: 'נמסר מהלקוח · אושר במשרד', document: 'ממסמך שנבדק במשרד', authority: 'נקרא מהרשות', import: 'נקלט מקובץ', office: 'הוזן במשרד',
};
function SourceLink({ src, evidence, docs }: { src?: SourceRef; evidence: Evidence[]; docs: { id: string; label: string }[] }) {
  const store = useDocumentStore();
  const [msg, setMsg] = useState('');
  if (!src) return <small className="te-src">מקור: הוזן במשרד</small>;
  const ev = src.evidenceId ? evidence.find(e => e.id === src.evidenceId) : undefined;
  const docId = src.documentId ?? ev?.documentId;
  const docLabel = docId ? (docs.find(d => d.id === docId)?.label ?? ev?.fileName ?? 'מסמך') : undefined;
  const open = async () => {
    if (!docId) return;
    const d = await store.getDoc(docId);
    if (!d || !d.fileData || d.fileData.byteLength === 0) { setMsg('הקובץ לא זמין כאן (בהדגמה אין קבצים)'); return; }
    const url = URL.createObjectURL(new Blob([d.fileData], { type: d.fileType || 'application/pdf' }));
    window.open(url, '_blank', 'noopener');
  };
  return (
    <small className="te-src">
      מקור: <b>{PROVENANCE_HE[src.provenance ?? (src.factId ? 'office' : 'office')]}</b>{src.checkedAt ? ` · ${src.checkedAt.split('-').reverse().join('.')}` : ''}{src.note ? ` · ${src.note}` : ''}{docLabel ? ` · ${docLabel}` : ''}
      {docId && <button type="button" className="btn btn-sm btn-ghost" onClick={() => void open()}>פתח מסמך</button>}
      {msg && <span> · {msg}</span>}
    </small>
  );
}

export default function EstimatePanel({ client, step, year, cutoffMonth, facts, evidence }: {
  client: Client; step: OnboardingStep; year: number; cutoffMonth: number; facts: YearFact[]; evidence: Evidence[];
}) {
  const [versions, setVersions] = useState<EstimateVersion[] | null>(null);
  const [draft, setDraft] = useState<EstimateDraft | null>(null);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [docs, setDocs] = useState<{ id: string; label: string; date?: string }[]>([]);
  const [showAllBlockers, setShowAllBlockers] = useState(false);
  const links = useKnowledgeLink();
  const [opened, setOpened] = useState<Set<string>>(new Set());
  const pre = useMemo(() => buildDraft({ client, taxYear: year, cutoffMonth, facts, evidence, today: today() }), [client, year, cutoffMonth, facts, evidence]);
  // ‼ נשוי/אה בשנת המס (לא היום) — קובע אם יש בן/בת זוג בשורות ובחלוקה
  const marriedInYear = clientForTaxYear(client, year).familyStatus === 'married';
  const btlEmployers = ([['', client.niOccupations], [marriedInYear ? PERSON.spouse : '', client.spouseNiOccupations]] as const)
    .filter(([who, list], i) => (i === 0 || !!who) && !!list?.length)
    .map(([who, list]) => ({ who, text: niEmployersText(niEmployersInYear(list ?? [], year)) }))
    .filter(e => !!e.text);

  const load = async () => {
    try {
      const vs = await api.loadEstimates(step.id);
      setVersions(vs);
      const cur = vs.find(v => v.status === 'draft') ?? [...vs].reverse().find(v => v.status === 'approved');
      setDraft(cur ? cur.draft : pre.draft);
      setDirty(!cur);
    } catch (e) { setMsg({ ok: false, text: `לא ניתן לטעון את ההערכות: ${(e as Error).message}` }); setVersions([]); setDraft(pre.draft); }
  };
  useEffect(() => { void load(); void api.loadClientDocuments(client.id).then(setDocs).catch(() => setDocs([])); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [step.id]);

  const latest = versions?.length ? versions[versions.length - 1] : undefined;
  const approved = versions ? [...versions].reverse().find(v => v.status === 'approved') : undefined;
  const editingApproved = !!draft && !!latest && latest.status === 'approved' && !dirty;

  // יישור: נגזר מהנתונים — שורה לכל פער, וההכרעה שכבר נרשמה נשמרת
  const eff = useMemo<EstimateDraft | null>(() => {
    if (!draft) return null;
    const need = reconciliationsNeeded(draft, year);
    const recs = need.map(n => {
      const had = draft.reconciliations.find(r => r.lineId === n.lineId);
      const same = had && had.books === n.books && had.vat === n.vat && had.it134 === n.it134;
      return { id: had?.id ?? uid(), lineId: n.lineId, what: 'turnover' as const, books: n.books, vat: n.vat, it134: n.it134, ...(same ? { decision: had!.decision, note: had!.note, decidedAt: had!.decidedAt } : {}) };
    });
    return { ...draft, reconciliations: recs };
  }, [draft, year]);
  const out = useMemo(() => (eff ? computeEstimate(eff, { client, taxYear: year }) : null), [eff, client, year]);

  if (!versions || !draft || !eff || !out) return <section className="te-panel"><p className="ty-label">הערכת המס</p><p className="ty-note">טוען…</p></section>;

  const upd = (f: (d: EstimateDraft) => EstimateDraft) => { setDraft(d => (d ? f(d) : d)); setDirty(true); setMsg(null); };
  const updLine = (id: string, patch: Partial<IncomeLine>) => upd(d => ({ ...d, lines: d.lines.map(l => (l.id === id ? { ...l, ...patch } : l)) }));
  const save = async () => {
    setBusy(true);
    const r = await api.saveEstimate(step.id, eff, out, [...pre.inputFacts, ...cardSnapshot(client)], api.baseOf(versions));
    setBusy(false);
    if (!r.ok && r.error === 'conflict') {
      // מישהו שמר בינתיים: מרעננים את רשימת הגרסאות ומשאירים את העריכה שלך כאן — לא נדרס כלום
      try { setVersions(await api.loadEstimates(step.id)); } catch { /* ההודעה למטה מספיקה */ }
      setMsg({ ok: false, text: 'מישהו שמר את ההערכה בינתיים (או שנפתחה גרסה חדשה). השינויים שלך עדיין כאן ולא נשמרו; ברשימת «גרסאות» רואים את מה שנשמר. שמירה נוספת תחליף את הטיוטה השמורה במה שמוצג כאן.' });
      return false;
    }
    if (!r.ok) { setMsg({ ok: false, text: r.error === 'year_mismatch' ? 'ההערכה שייכת לשנה אחרת מהבקשה — לא נשמרה' : `השמירה נכשלה (${r.error})` }); return false; }
    setMsg({ ok: true, text: r.created ? `נפתחה גרסה ${r.version} (טיוטה)` : `טיוטה ${r.version} נשמרה` });
    setDirty(false); await load(); return true;
  };
  const approve = async () => {
    // ‼ מאשרים את מה שמוצג: טיוטה שמורה שהתוצאה שלה שונה מהחישוב הנוכחי (כלל עודכן, טיוטה בלי תוצאה) — נשמרת קודם
    const stored = versions?.find(v => v.status === 'draft');
    const stale = !stored?.outputs || JSON.stringify(stored.outputs) !== JSON.stringify(out);
    if ((dirty || stale) && !(await save())) return;
    const vs = await api.loadEstimates(step.id);
    const d = vs.find(v => v.status === 'draft');
    if (!d) return;
    setBusy(true);
    const r = await api.approveEstimate(d.id, d.revision);
    setBusy(false);
    if (!r.ok) { setMsg({ ok: false, text: r.error === 'has_blockers' ? 'יש עדיין חוסמים — לא אושר' : r.error === 'reconciliation_open' ? 'יש יישור שלא הוכרע' : r.error === 'conflict' ? 'הטיוטה השתנתה בינתיים — לבדוק ולאשר שוב' : `האישור נכשל (${r.error})` }); return; }
    setMsg({ ok: true, text: `גרסה ${r.version} אושרה. ההמלצה נמסרת ללקוח ביד — אין שינוי מקדמות מכאן.` });
    await load();
  };

  // ── מה השתנה מאז האישור ──
  // ‼ התיק הוא המרכז: ישות שנוספה לתיק (למשל דירה מהצהרת ההון) או נתון שהשתנה — «לבדיקה». הגרסה המאושרת לא משתנה.
  const impact = approved ? changesSinceApproval({ inputFacts: approved.inputFacts, approvedAt: approved.approvedAt, client, facts, taxYear: year }) : [];
  const factsChanged = impact.length;
  const rulesChanged = !!approved?.outputs && approved.outputs.rulesetVersion !== RULESET_VERSION;
  const bizPersons = (['client', 'spouse'] as Person[]).filter(p => eff.lines.some(l => l.person === p && l.source === 'business'));
  const emptyIt: ItAdvanceSetup = { via: 'manual', method: 'unknown', frequency: 1, periods: [] };
  const ruleBlocked = out.blockers.some(b => b.code === 'rule_not_verified' || b.code === 'no_tax_data');
  const pending = out.blockers.length > 0;
  const curStatus = dirty ? 'שינויים שלא נשמרו' : latest ? `גרסה ${latest.version} · ${latest.status === 'approved' ? 'מאושרת' : latest.status === 'draft' ? 'טיוטה' : 'הוחלפה'}` : 'עוד לא נשמרה';
  const m = MONTH_HE[eff.cutoffMonth];

  return (
    <section className="te-panel" aria-labelledby="te-title">
      <p className="ty-label" id="te-title">הערכת המס</p>
      <div className="te-result">
        <div className="te-head">
          <h3>שנת {year} · נתוני אמת עד סוף {m}</h3>
          <span className={`ty-chip ${latest?.status === 'approved' && !dirty ? 'green' : dirty ? 'amber' : ''}`}>{curStatus}</span>
        </div>
        {ruleBlocked ? (
          <p className="te-nc">אין עדיין חבות שאפשר להציג כוודאית: {out.blockers.filter(b => b.code === 'rule_not_verified' || b.code === 'no_tax_data').map(b => b.text).join(' · ')}</p>
        ) : (
          <>
            {out.household.partial && <p className="te-partial-banner" role="note"><b>סיכום חלקי.</b> {out.partial.map(x => x.text).join(' · ')}</p>}
            {/* 14.10.2026 · שאלה מקצועית פתוחה — אותו נוסח שהלקוח יראה בסיכום ובדף האישי */}
            {(out.openQuestions?.length ?? 0) > 0 && <p className="te-partial-banner" role="note"><b>לא הוכרע — יופיע גם בסיכום ללקוח:</b> {out.openQuestions!.map(q => q.text).join(' · ')}</p>}
            {out.household.incomplete && <p className="te-partial-banner" role="note"><b>חסרים נתוני הכנסה</b> — אין עדיין חבות או יתרה להציג. מה להשלים — ברשימה למטה.</p>}
            <div className={`te-figures${pending ? ' is-partial' : ''}`}>
              <div><span>מס הכנסה לשנה{out.persons.length > 1 ? ' (שני בני הזוג)' : ''}</span><b>{out.household.incomplete ? 'חסר' : <>{nis(out.household.annualLiability)}{out.household.partial ? ' +?' : ''}</>}</b></div>
              <div><span>נוכה במקור</span><b>{out.household.incomplete ? 'חסר' : nis(out.household.withheldAnnual)}</b></div>
              <div><span>מקדמות ששולמו</span><b>{out.household.incomplete ? 'חסר' : nis(out.household.advancesPaid)}</b></div>
              <div><span>מס הכנסה — יתרה בסוף השנה במקדמה הנוכחית</span><b className={out.household.balanceAtCurrent > 0 ? 'te-due' : ''}>{out.household.incomplete ? 'חסר' : out.household.balanceAtCurrent > 0 ? `חוב ${nis(out.household.balanceAtCurrent)}` : out.household.balanceAtCurrent < 0 ? `זכות ${nis(-out.household.balanceAtCurrent)}` : 'מאוזן'}</b></div>
              {out.advances.some(a => a.authority === 'it') && <div><span>מס הכנסה — יתרה במקדמה המומלצת{out.household.catchUpApproved ? ' ועם ההשלמה' : ''}</span><b>{out.household.incomplete ? 'חסר' : out.household.balanceAtRecommended > 0 ? `חוב ${nis(out.household.balanceAtRecommended)}` : out.household.balanceAtRecommended < 0 ? `זכות ${nis(-out.household.balanceAtRecommended)}` : 'מאוזן'}</b></div>}
              {out.advances.filter(a => a.authority === 'ni').map(a => <div key={a.person}><span>ב״ל לשנה{a.person === 'spouse' ? ` · ${PERSON.spouse}` : ''}</span><b><AmountView a={a.annualDue} /></b></div>)}
            </div>
            {out.persons.filter(p => p.notComputed).map(p => <p key={p.person} className="te-nc">{PERSON[p.person]}: {p.notComputed}</p>)}
            <p className="ty-note">אומדן משרדי לפי נתוני אמת ותחזית — לא חיוב של רשות. יתרת זכות מתבררת בדוח השנתי.</p>
          </>
        )}
        {!ruleBlocked && out.advances.some(a => a.recommended != null) && (
          <ul className="te-reco">
            {out.advances.filter(a => a.recommended != null).map(a => (
              <li key={a.authority + a.person}>מקדמת {a.authority === 'it' ? 'מס הכנסה' : 'ב״ל'}{a.person === 'spouse' ? ` (${PERSON.spouse})` : ''} — מומלץ <b>{a.unit === '%' ? `${a.recommended}%` : nis(a.recommended)}</b>{a.unit === '%' ? ' מהמחזור' : a.unit === '₪ לחודש' ? ' לחודש' : ' לתקופה'}, מהתקופה הבאה{a.current != null ? <> (היום <b>{a.unit === '%' ? `${a.current}%` : nis(a.current)}</b>)</> : ''}{a.belowChangeThreshold ? ' — שינוי קטן מ-10%, אין עילה לתיקון' : ''}</li>
            ))}
          </ul>
        )}
        {pending && <p className="te-partial">{ruleBlocked ? '' : 'המספרים חלקיים — '}טיוטה: יש {out.blockers.length} דברים להשלים לפני אישור.</p>}
        <p className="te-next"><b>הצעד הבא:</b> {editingApproved
          ? 'הגרסה אושרה — למסור ללקוח את ההמלצה (בשיחה או במייל מהמשרד). שינוי מקדמות ברשות הוא פעולה נפרדת, ואחריה קוראים שוב את היתרות.'
          : out.nextAction}</p>
        {pending && <ol className="te-blockers">{(showAllBlockers ? out.blockers : out.blockers.slice(0, 4)).map((b, i) => <li key={i}>{b.text}</li>)}</ol>}
        {pending && out.blockers.length > 4 && !showAllBlockers && <div><button type="button" className="btn btn-sm btn-ghost" onClick={() => setShowAllBlockers(true)}>הצג את כל {out.blockers.length}</button></div>}
        {approved && (factsChanged > 0 || rulesChanged) && (
          <div className="ty-why wd-hint te-impact" role="note">
            <b>לבדיקה מאז אישור גרסה {approved.version}</b>{rulesChanged ? ' · מרשם הכללים השתנה' : ''}
            {impact.length > 0 && <ul>{impact.slice(0, 5).map((x, i) => <li key={i}>{x.text}{x.affects ? <small> — עשוי להשפיע על {x.affects}</small> : null}</li>)}{impact.length > 5 && <li>ועוד {impact.length - 5}</li>}</ul>}
            <span>הגרסה המאושרת לא משתנה; חישוב מחדש יוצר גרסה חדשה.</span>
          </div>
        )}
        {msg && <p className={msg.ok ? 'ty-ok' : 'ty-err'} role={msg.ok ? 'status' : 'alert'}>{msg.text}</p>}
        <div className="ty-actions">
          <button type="button" className="btn btn-primary" disabled={busy || pending || editingApproved} onClick={() => void approve()} title={pending ? 'יש מה להשלים' : ''}>
            {latest?.status === 'draft' || dirty ? `אשר גרסה ${dirty && latest?.status !== 'draft' ? (latest?.version ?? 0) + 1 : latest?.version ?? 1}` : 'אשר'}
          </button>
          <button type="button" className="btn btn-ghost" disabled={busy || !dirty} onClick={() => void save()}>שמור טיוטה</button>
          {editingApproved && <span className="ty-note">זו הגרסה המאושרת. כל שינוי יפתח טיוטה חדשה.</span>}
        </div>
      </div>

      {!ruleBlocked && !out.household.incomplete && out.advances.length > 0 && (
        <details className="ty-details" id="te-authorities" open>
          <summary><b>מול הרשויות</b><span>חבות, ששולם, מה נשאר, מקדמות ומועדים — לכל רשות</span></summary>
          <div className="ty-details-body"><AuthorityOverview out={out} preparedOn={eff.preparedOn} multi={bizPersons.length > 1} /></div>
        </details>
      )}

      <details className="ty-details" id="te-checks" open={(out.checks ?? []).some(c => c.status === 'saving') || undefined}>
        <summary><b>מה בדקנו</b><span>{(out.checks ?? []).length ? `${(out.checks ?? []).length} בדיקות · ${(out.checks ?? []).filter(c => c.status === 'saving').length} עם חיסכון` : 'אחרי שיש נתוני הכנסה'}</span></summary>
        <div className="ty-details-body">
          <p className="ty-note">כל בדיקה שבוצעה — גם כשלא נמצא חיסכון. חיסכון = הפרש שחושב מחדש באותו מנוע ובאותם נתונים. בדיקה שלא בוצעה מסומנת כך, לא «נבדק».</p>
          <ChecksList checks={out.checks ?? []} stepId={step.id} />
        </div>
      </details>

      <details className="ty-details" id="te-import">
        <summary><b>קליטת נתונים</b><span>רו״ה · 134 · ESNA — תצוגה ואישור לפני שימוש</span></summary>
        <div className="ty-details-body">
          <ImportPanel client={client} year={year} draft={eff} onApply={(f, note) => { upd(f); setMsg({ ok: true, text: `${note}. נשמר בטיוטה רק אחרי «שמור טיוטה».` }); }} />
        </div>
      </details>

      <details className="ty-details" id="te-income">
        <summary><b>הכנסות — בפועל עד סוף {m} ותחזית</b><span>{eff.lines.length} שורות</span></summary>
        <div className="ty-details-body te-lines">
          <label className="te-field te-cut">חודש החתך (נתוני אמת עד סוף)
            <select value={eff.cutoffMonth} onChange={e => upd(d => ({ ...d, cutoffMonth: Number(e.target.value) }))}>
              {MONTH_HE.slice(1).map((x, i) => <option key={i + 1} value={i + 1}>{x}</option>)}
            </select>
            <small>תאריך ההכנה {he(eff.preparedOn)} — נפרד מהחתך ומתאריך בדיקת היתרות ברשויות.</small>
          </label>
          {eff.lines.length === 0 && <p className="ty-note">אין בכרטיס עסק, מעסיק או נכס מושכר. להוסיף שורה ידנית.</p>}
          {/* ‼ 21.10.2026 · תזכורת בלבד: מעסיקים שב״ל רושם בשנה — כדי שלא תחסר שורת משכורת. לא נוספת שורה לבד. */}
          {btlEmployers.map(e => <p key={e.who} className="ty-note" data-te-btl-employers>מעסיקים לפי ב״ל ב-{year}{e.who ? ` (${e.who})` : ''}: {e.text}</p>)}
          {eff.lines.map(l => {
            const f = forecastFor(l, eff), a = annualFor(l, eff);
            const lineHints = pre.hints.filter(h => h.lineId === l.id || h.lineId === l.entityRef);
            return (
              <div key={l.id} className="te-line">
                <div className="te-line-head"><b>{l.label}</b><span className="ty-chip">{SOURCE_HE[l.source]} · {PERSON[l.person]}</span><span className="te-annual">שנתי: {a == null ? 'חסר' : nis(a)}</span></div>
                <div className="te-grid">
                  <NumField label={`בפועל עד סוף ${m}`} value={l.actualToCutoff} onChange={v => updLine(l.id, { actualToCutoff: v, ...(v === l.actualToCutoff ? {} : { actualSource: { note: l.actualSource?.factId ? 'תוקן ידנית' : 'הוזן ידנית', provenance: 'office' as const, checkedAt: today() }, actualFrom: 'office' as const }) })} />
                  {l.source === 'business' && <NumField label="חודשים שבאמת נמדדו" value={l.actualMonths} onChange={v => updLine(l.id, { actualMonths: v })} hint="עסק שנפתח באמצע השנה" />}
                  {l.source === 'business' && <NumField label={`מחזור עד סוף ${m}`} value={l.turnoverToCutoff} onChange={v => updLine(l.id, { turnoverToCutoff: v })} hint="להשוואה מול מע״מ ו-134" />}
                  {l.source !== 'rent' && l.source !== 'other' && <NumField label={l.source === 'business' ? 'ניכוי במקור מלקוחות עד החתך' : 'נוכה במקור עד החתך'} value={l.withheldToCutoff} onChange={v => updLine(l.id, { withheldToCutoff: v })} hint={l.source === 'business' ? 'מאישורי ניכוי במקור; מקוזז מהמקדמה' : undefined} />}
                  {l.source !== 'rent' && l.source !== 'other' && <NumField label="ניכוי צפוי בהמשך השנה" value={l.withheldForecast} onChange={v => updLine(l.id, { withheldForecast: v })} />}
                  {l.source === 'business' && <NumField label="מחזור צפוי לשאר השנה" value={l.turnoverForecast} onChange={v => updLine(l.id, { turnoverForecast: v })} hint="בסיס למקדמה לפי מחזור" />}
                </div>
                {(l.source === 'capital' || (l.source === 'rent' && marriedInYear)) && (
                  <div className="te-grid">
                    {l.source === 'capital' && (
                      <label className="te-field">סוג ההכנסה (קובע את השיעור)<select value={l.capitalKind ?? ''} onChange={e => updLine(l.id, { capitalKind: (e.target.value || undefined) as CapitalKind | undefined })}>
                        <option value="">— לא סווג —</option>{(Object.keys(CAPITAL_KIND_HE) as CapitalKind[]).map(k => <option key={k} value={k}>{CAPITAL_KIND_HE[k]}</option>)}
                      </select><small>30% רק לדיבידנד מחברה שבה הוא מחזיק 10% ומעלה — לא לכל ההכנסה ההונית שלו</small></label>
                    )}
                    {marriedInYear && l.capitalKind !== 'interestOwnCompany' && (
                      <label className="te-field">שיוך בין בני הזוג<select value={l.attribution ?? ''} onChange={e => updLine(l.id, { attribution: (e.target.value || undefined) as IncomeLine['attribution'] })}>
                        <option value="">רכוש משותף — לבעל היגיעה האישית הגבוהה</option><option value="premarital">רכוש מלפני הנישואים (שנה לפחות)</option><option value="inherited">רכוש שהתקבל בירושה</option>
                      </select><small>סעיף 66: אין פיצול לפי בחירה</small></label>
                    )}
                  </div>
                )}
                <SourceLink src={l.actualSource} evidence={evidence} docs={docs} />
                {l.source === 'business' && <MicroLineEditor line={l} year={year} client={client} result={out.micro.find(x => x.lineId === l.id)} docs={docs} onChange={patch => updLine(l.id, patch)} />}
                {eff.cutoffMonth < 12 && (
                  <div className="te-fc">
                    {(['client', 'office'] as const).map(side => {
                      const s = l[side];
                      return (
                        <fieldset key={side} className={`te-fc-side${l.chosen === side ? ' is-chosen' : ''}`}>
                          <legend>תחזית {side === 'client' ? 'הלקוח' : 'המשרד'}</legend>
                          <select aria-label={`שיטת התחזית של ${side === 'client' ? 'הלקוח' : 'המשרד'}`} value={s?.method ?? ''} onChange={e => updLine(l.id, { [side]: e.target.value ? { ...s, method: e.target.value as ForecastMethod, at: today() } : undefined } as Partial<IncomeLine>)}>
                            <option value="">—</option>{(Object.keys(METHOD_HE) as ForecastMethod[]).map(k => <option key={k} value={k}>{METHOD_HE[k]}</option>)}
                          </select>
                          {(s?.method === 'manual' || s?.method === 'lastYear') && <NumField label={`סכום ל-${12 - eff.cutoffMonth} החודשים הבאים`} value={s.amount} onChange={v => updLine(l.id, { [side]: { ...s, amount: v } } as Partial<IncomeLine>)} />}
                          <label className="te-field">הנחה ומקור<input value={s?.assumption ?? ''} onChange={e => updLine(l.id, { [side]: { ...(s ?? { method: 'manual' }), assumption: e.target.value } } as Partial<IncomeLine>)} placeholder="למשל: עונתיות — דצמבר חלש; לפי שיחה 10.10" /></label>
                          <label className="te-radio"><input type="radio" name={`chosen-${l.id}`} checked={l.chosen === side} disabled={!s?.method} onChange={() => updLine(l.id, { chosen: side })} /> זו נכנסת לחישוב</label>
                        </fieldset>
                      );
                    })}
                    <p className="ty-note">תחזית לשאר השנה: {f == null ? 'לא שלמה' : nis(f)}{l.chosen ? ` (של ${l.chosen === 'client' ? 'הלקוח' : 'המשרד'})` : ' — טרם נבחרה'}</p>
                  </div>
                )}
                {lineHints.map((h, i) => <p key={i} className="ty-note">‹ {h.text}</p>)}
              </div>
            );
          })}
          <AddLine onAdd={(person, source, label) => upd(d => ({ ...d, lines: [...d.lines, { id: uid(), person, source, label }] }))} married={marriedInYear} />
          {pre.hints.filter(h => !h.lineId).map((h, i) => <p key={i} className="ty-note">‹ {h.text}</p>)}
        </div>
      </details>

      <details className="ty-details" id="te-oneoffs">
        <summary><b>אירועים חד־פעמיים</b><span>{eff.oneOffs.length ? `${eff.oneOffs.length} · לא מוכפלים בקצב שנתי` : 'אין'}</span></summary>
        <div className="ty-details-body te-lines">
          {eff.oneOffs.map(o => (
            <div key={o.id} className="te-row">
              <span>{o.label} · {o.timing === 'inActual' ? 'כלול בבפועל — מנוטרל מהקצב' : 'צפוי בהמשך'} · {nis(o.amount)}</span>
              <button type="button" className="btn btn-sm btn-ghost" onClick={() => upd(d => ({ ...d, oneOffs: d.oneOffs.filter(x => x.id !== o.id) }))}>הסר</button>
            </div>
          ))}
          <AddOneOff lines={eff.lines} onAdd={o => upd(d => ({ ...d, oneOffs: [...d.oneOffs, { ...o, id: uid() }] }))} />
        </div>
      </details>

      <details className="ty-details" id="te-adjust">
        <summary><b>תיאומי מס</b><span>{eff.adjustments.length ? `${eff.adjustments.length} · נפרדים מהספרים` : 'אין — הספרים לפני תיאומים'}</span></summary>
        <div className="ty-details-body te-lines">
          <p className="ty-note">רווח והפסד נשמר כפי שבספרים (לפני תיאומים). כל תיאום נרשם כאן עם הקטגוריה בספרים — אותה קטגוריה לא מתואמת פעמיים.</p>
          {eff.adjustments.map(a => (
            <div key={a.id} className="te-row">
              <span>{eff.lines.find(l => l.id === a.lineId)?.label ?? a.lineId} · {a.bookCategory} · {a.amount > 0 ? '+' : ''}{nis(a.amount)} · {a.reason}</span>
              <button type="button" className="btn btn-sm btn-ghost" onClick={() => upd(d => ({ ...d, adjustments: d.adjustments.filter(x => x.id !== a.id) }))}>הסר</button>
            </div>
          ))}
          <AddAdjustment lines={eff.lines.filter(l => l.source === 'business')} onAdd={a => upd(d => ({ ...d, adjustments: [...d.adjustments, { ...a, id: uid() }] }))} />
        </div>
      </details>

      {bizPersons.map(p => {
        const it = (p === 'client' ? eff.it : eff.itSpouse) ?? emptyIt;
        const ni = (p === 'client' ? eff.ni : eff.niSpouse) ?? { via: 'manual' as const };
        const aIt = out.advances.find(a => a.authority === 'it' && a.person === p);
        const aNi = out.advances.find(a => a.authority === 'ni' && a.person === p);
        const who = bizPersons.length > 1 || p === 'spouse' ? ` · ${PERSON[p]}` : '';
        const setIt = (s: ItAdvanceSetup) => upd(d => (p === 'client' ? { ...d, it: s } : { ...d, itSpouse: s }));
        const setNi = (s: NiAdvanceSetup) => upd(d => (p === 'client' ? { ...d, ni: s } : { ...d, niSpouse: s }));
        const card = cardAdvances(client);
        const cardNi = p === 'client' ? card.ni : card.niSpouse;
        return (
          <div key={p}>
            <details className="ty-details" id={`te-it-${p}`}>
              <summary><b>מס הכנסה — מקדמות (134){who}</b><span>{it.readOn ? `נבדק ${he(it.readOn)}` : 'לא נקרא'}{it.method === 'turnoverRate' && it.ratePct != null ? ` · ${it.ratePct}% מהמחזור` : ''}{aIt?.recommended != null ? ` · מומלץ ${aIt.unit === '%' ? `${aIt.recommended}%` : nis(aIt.recommended)}` : ''}</span></summary>
              <div className="ty-details-body te-lines">
                <p className="ty-note">מטבלת התקופות במסך 134 — ביד, או ב«קליטת נתונים». תקופה «טרם הגיע המועד» אינה חוסר ואינה 0.</p>
                {p === 'client' && card.it && !eff.it.readOn && eff.it.method === 'unknown' && <div className="ty-actions"><button type="button" className="btn btn-sm btn-ghost" onClick={() => setIt({ ...card.it!, periods: eff.it.periods })}>מלא מהכרטיס ({card.it.ratePct}%)</button></div>}
                <ItSetupEditor setup={it} onChange={setIt} year={year} cutoff={eff.cutoffMonth} docs={docs} />
                {!ruleBlocked && aIt && <AdvanceResult a={aIt} />}
                <CatchUpEditor list={eff.catchUps ?? []} authority="it" person={p} year={year} cutoff={eff.cutoffMonth} docs={docs} onChange={cu => upd(d => ({ ...d, catchUps: cu }))} />
              </div>
            </details>
            <details className="ty-details" id={`te-ni-${p}`}>
              <summary><b>ביטוח לאומי — מקדמה{who}</b><span>{ni.readOn ? `נבדק ${he(ni.readOn)}` : 'לא נבדק'}{ni.monthlyAdvance != null ? ` · ${nis(ni.monthlyAdvance)} לחודש` : ''}{aNi?.recommended != null ? ` · מומלץ ${nis(aNi.recommended)}` : ''}</span></summary>
              <div className="ty-details-body te-lines">
                {cardNi && ni.monthlyAdvance == null && <div className="ty-actions"><button type="button" className="btn btn-sm btn-ghost" onClick={() => setNi({ ...cardNi, periods: ni.periods, paidToCutoff: ni.paidToCutoff })}>מלא מהכרטיס{cardNi.monthlyAdvance != null ? ` (${nis(cardNi.monthlyAdvance)} לחודש)` : ''}</button></div>}
                <NiSetupEditor setup={ni} onChange={setNi} year={year} cutoff={eff.cutoffMonth} docs={docs} />
                {out.micro.some(m => m.person === p && m.chosen !== 'books') && <NiOverrideEditor list={eff.niOverrides ?? []} person={p} docs={docs} onChange={l => upd(d => ({ ...d, niOverrides: l }))} />}
                {aNi && <AdvanceResult a={aNi} />}
                <CatchUpEditor list={eff.catchUps ?? []} authority="ni" person={p} year={year} cutoff={eff.cutoffMonth} docs={docs} onChange={cu => upd(d => ({ ...d, catchUps: cu }))} />
              </div>
            </details>
          </div>
        );
      })}

      <details className="ty-details" id="te-vat">
        <summary><b>מע״מ — ESNA</b><span>{eff.vat.periods.length ? `${eff.vat.periods.length} תקופות` : 'לא נקרא'}</span></summary>
        <div className="ty-details-body te-lines">
          <p className="ty-note">המחזור שדווח למע״מ — להשוואה מול הספרים. קריאה בלבד; אין כאן דיווח או תיקון.</p>
          <div className="te-grid">
            <label className="te-field">נבדק בתאריך<input type="date" value={eff.vat.readOn ?? ''} onChange={e => upd(d => ({ ...d, vat: { ...d.vat, readOn: e.target.value || undefined } }))} /></label>
            <DocPick docs={docs} value={eff.vat.evidence?.documentId} onChange={id => upd(d => ({ ...d, vat: { ...d.vat, evidence: id ? { documentId: id } : undefined, via: id ? 'upload' : 'manual' } }))} />
          </div>
          <Periods periods={eff.vat.periods} year={year} cutoff={eff.cutoffMonth} onChange={ps => upd(d => ({ ...d, vat: { ...d.vat, periods: ps } }))} />
        </div>
      </details>

      <details className="ty-details" id="te-payments">
        <summary><b>תשלומים שבוצעו אחרי הבדיקה</b><span>{eff.payments.length ? `${eff.payments.length}` : 'אין'}</span></summary>
        <div className="ty-details-body te-lines">
          <p className="ty-note">כל תשלום נרשם עם התקופה שהוא משלם. תשלום לתקופה שכבר מופיעה בקריאת 134 לא נספר פעמיים.</p>
          {eff.payments.map(p => (
            <div key={p.id} className="te-row"><span>{p.authority === 'it' ? 'מס הכנסה' : 'ב״ל'}{p.person === 'spouse' ? ` (${PERSON.spouse})` : ''} · שולם {he(p.paidOn)} · לתקופה {p.period.slice(5)}/{p.period.slice(0, 4)} · {nis(p.amount)}</span>
              <button type="button" className="btn btn-sm btn-ghost" onClick={() => upd(d => ({ ...d, payments: d.payments.filter(x => x.id !== p.id) }))}>הסר</button></div>
          ))}
          <AddPayment year={year} persons={bizPersons} onAdd={p => upd(d => ({ ...d, payments: [...d.payments, { ...p, id: uid() }] }))} />
        </div>
      </details>

      <details className="ty-details" id="te-recon" open={eff.reconciliations.some(r => !r.decision) || undefined}>
        <summary><b>יישור בין מקורות</b><span>{eff.reconciliations.length ? `${eff.reconciliations.filter(r => !r.decision).length} פתוחים` : 'אין פער'}</span></summary>
        <div className="ty-details-body te-lines">
          <p className="ty-note">מחזור עד החתך: הספרים מול מע״מ ומול 134. פער מעל 1% (ולפחות 500 ₪) דורש הכרעה. ההכרעה לא משנה דבר ברשות; תיקון דיווח — בקשה נפרדת.</p>
          {eff.reconciliations.map(r => (
            <div key={r.id} className="te-line">
              <div className="te-row"><span>ספרים {nis(r.books)} · מע״מ {nis(r.vat)} · 134 {nis(r.it134)}</span></div>
              <div className="te-grid">
                <label className="te-field">הכרעה<select value={r.decision ?? ''} onChange={e => upd(d => ({ ...d, reconciliations: eff.reconciliations.map(x => x.id === r.id ? { ...x, decision: (e.target.value || undefined) as typeof x.decision, decidedAt: today() } : x) }))}>
                  <option value="">— פתוח —</option><option value="books_correct">הספרים נכונים</option><option value="authority_correct">הרשות נכונה — לתקן ספרים</option><option value="open_with_note">פתוח, עם הערה (להמשך)</option>
                </select></label>
                <label className="te-field">הערה<input value={r.note ?? ''} onChange={e => upd(d => ({ ...d, reconciliations: eff.reconciliations.map(x => x.id === r.id ? { ...x, note: e.target.value } : x) }))} /></label>
              </div>
            </div>
          ))}
        </div>
      </details>

      <details className="ty-details" id="te-savings">
        <summary><b>פנסיה וקרן השתלמות</b><span>מה הופקד, מה מתוכנן, ומה אפשר עוד</span></summary>
        <div className="ty-details-body te-lines">
          {out.persons.map(pr => {
            const s = eff.savings.find(x => x.person === pr.person) ?? { person: pr.person };
            const sr = out.savings.find(x => x.person === pr.person);
            const set = (patch: object) => upd(d => ({ ...d, savings: [...d.savings.filter(x => x.person !== pr.person), { ...s, ...patch }] }));
            return (
              <div key={pr.person} className="te-line">
                <div className="te-line-head"><b>{PERSON[pr.person]}</b></div>
                <div className="te-grid">
                  <NumField label={`פנסיה — הופקד עד סוף ${m}`} value={s.pensionToCutoff} onChange={v => set({ pensionToCutoff: v })} />
                  <NumField label="פנסיה — מתוכנן להמשך" value={s.pensionPlanned} onChange={v => set({ pensionPlanned: v })} />
                  <NumField label={`קרן השתלמות — הופקד עד סוף ${m}`} value={s.studyFundToCutoff} onChange={v => set({ studyFundToCutoff: v })} />
                  <NumField label="קרן השתלמות — מתוכנן להמשך" value={s.studyFundPlanned} onChange={v => set({ studyFundPlanned: v })} />
                </div>
                {sr && (
                  <div className="te-calc">
                    <div><span>ניכוי מרבי לקרן השתלמות</span><b><AmountView a={sr.studyFundMaxDeduction} /></b></div>
                    {sr.studyFundTopUp && <div><span>חלופה: להשלים עוד {nis(sr.studyFundTopUp.extraDeposit)}</span><b>חיסכון משוער במס {nis(sr.studyFundTopUp.taxSaving)}</b></div>}
                  </div>
                )}
                {sr && <p className="ty-note">{sr.pensionNote}</p>}
              </div>
            );
          })}
        </div>
      </details>

      <details className="ty-details" id="te-credits">
        <summary><b>זיכויים, בני זוג ובעל שליטה</b><span>{[(eff.credits ?? []).some(c => (c.donations ?? 0) > 0) ? 'תרומות' : '', (eff.credits ?? []).some(c => (c.lifeInsurance ?? 0) > 0) ? 'ביטוח חיים' : '', eff.spouseSource ? 'מקור משותף סומן' : '', (eff.controlling ?? []).length ? 'בעל שליטה' : ''].filter(Boolean).join(' · ') || 'לא הוזן'}</span></summary>
        <div className="ty-details-body te-lines">
          {out.persons.map(pr => {
            const c = (eff.credits ?? []).find(x => x.person === pr.person) ?? { person: pr.person };
            const set = (patch: object) => upd(d => ({ ...d, credits: [...(d.credits ?? []).filter(x => x.person !== pr.person), { ...c, ...patch }] }));
            const cardLife = pr.person === 'client' ? client.lifeInsuranceAnnual : undefined;
            return (
              <div key={pr.person} className="te-line">
                <div className="te-line-head"><b>{PERSON[pr.person]}</b></div>
                <div className="te-grid">
                  <NumField label="תרומות בשנה (סעיף 46)" value={c.donations} onChange={v => set({ donations: v })} hint="קבלות או מערכת התרומות; זיכוי רק מעל 207 ₪" />
                  <NumField label="ביטוח חיים — פרמיה לשנה" value={c.lifeInsurance} onChange={v => set({ lifeInsurance: v })} hint="ריסק בחברת ביטוח: מה שב-106 (036/081) ועוד מה ששולם ישירות — בלי לספור פעמיים. כיסוי מוות בתוך קרן פנסיה אינו כאן — הוא חלק מההפקדה לפנסיה" />
                </div>
                {cardLife != null && c.lifeInsurance == null && <div className="ty-actions"><button type="button" className="btn btn-sm btn-ghost" onClick={() => set({ lifeInsurance: cardLife, source: { note: 'ביטוח חיים מהכרטיס — לוודא שהוא לשנה הזו' } })}>מהכרטיס: {nis(cardLife)} לשנה — לוודא שזו השנה</button></div>}
              </div>
            );
          })}
          {marriedInYear && out.persons.length > 1 && (
            <fieldset className="te-choice">
              <legend>בני זוג — האם הכנסת אחד מהם תלויה במקור ההכנסה של השני?</legend>
              <small className="ty-note">סעיף 66(ד) · 1301 חלק א׳ סעיף 2. חישוב מאוחד הוא ברירת המחדל בחוק; נפרד — רק בתנאים, והרשות מחילה את הזול למי שזכאי.</small>
              {SPOUSE_SOURCE.map(([v, t]) => (
                <label key={v} className="te-radio"><input type="radio" name="spouse-source" checked={eff.spouseSource === v} onChange={() => upd(d => ({ ...d, spouseSource: v }))} /> {t}</label>
              ))}
            </fieldset>
          )}
          {out.persons.map(pr => {
            const ctl = (eff.controlling ?? []).find(x => x.person === pr.person);
            const setCtl = (next?: NonNullable<EstimateDraft['controlling']>[number]) => upd(d => ({ ...d, controlling: [...(d.controlling ?? []).filter(x => x.person !== pr.person), ...(next ? [next] : [])] }));
            return (
              <div key={'ctl' + pr.person} className="te-line">
                <label className="te-radio"><input type="checkbox" checked={!!ctl} onChange={e => setCtl(e.target.checked ? { person: pr.person } : undefined)} /> {PERSON[pr.person]} — בעל שליטה / בעל מניות מהותי בחברה</label>
                {ctl && (
                  <>
                    <label className="te-field">החברה<input value={ctl.company ?? ''} onChange={e => setCtl({ ...ctl, company: e.target.value })} placeholder="שם החברה" /></label>
                    <div className="te-flags">{CTRL_FLAGS.map(f => <label key={f.key} className="te-radio"><input type="checkbox" checked={!!ctl[f.key]} onChange={e => setCtl({ ...ctl, [f.key]: e.target.checked })} /> {f.label}</label>)}</div>
                    <small className="ty-note">משכורת מהחברה — כשורת משכורת (מ-106); דיבידנד — כשורת הון «דיבידנד — בעל מניות מהותי»; ריבית מהחברה — «ריבית מחברה שבשליטתו». מה שמסומן כאן לא מחושב — מוצג «ביד» עם הסיבה.</small>
                  </>
                )}
              </div>
            );
          })}
        </div>
      </details>

      <details className="ty-details" id="te-rules" open={out.blockers.some(b => b.ruleId) || undefined}>
        <summary><b>כללים ומגבלות</b><span>{out.blockers.some(b => b.ruleId) ? `${out.blockers.filter(b => b.ruleId).length} כללים חסרים · ` : ''}{out.limits.length} מגבלות</span></summary>
        <div className="ty-details-body te-lines">
          {out.blockers.some(b => b.ruleId) && <>
            <p className="ty-label">כללים שחסרים לחישוב</p>
            <ul className="wd-list">{out.blockers.filter(b => b.ruleId).map(b => <li key={b.ruleId}>{RULES[b.ruleId!]?.label ?? b.ruleId}: {b.text}</li>)}</ul>
          </>}
          {eff.decisions.length > 0 && <>
            <p className="ty-label">הכרעות שתועדו בעבר — לא משפיעות על החישוב</p>
            <ul className="wd-list">{eff.decisions.map(d => <li key={d.ruleId}>{RULES[d.ruleId]?.label ?? d.ruleId}: {d.text}{d.at ? ` · ${he(d.at)}` : ''} <button type="button" className="btn btn-sm btn-ghost" onClick={() => upd(x => ({ ...x, decisions: x.decisions.filter(y => y.ruleId !== d.ruleId) }))}>הסר</button></li>)}</ul>
          </>}
          <p className="ty-label">מגבלות</p>
          <ul className="wd-list">{out.limits.map((l, i) => <li key={i}>{l}</li>)}</ul>
          <p className="ty-label">כללים שנכנסו לחישוב</p>
          <ul className="wd-list">{out.usedRules.map(u => <li key={u.ruleId}>{RULES[u.ruleId]?.label ?? u.ruleId} · {u.taxYear} · {u.basis.startsWith('officeDecision') ? `הכרעת משרד (המקור: ${u.basis.slice(15, -1)})` : u.basis === 'primary' ? 'מקור רשמי' : u.basis}</li>)}</ul>
          <p className="ty-note">ליבת מס ההכנסה: {IT_CORE_RULES.map(id => RULES[id]?.label ?? id).join(', ')}. גרסת המרשם: {out.rulesetVersion}.</p>
        </div>
      </details>

      {approved && approved.outputs && (
        <details className="ty-details" id="te-summary" open={editingApproved || undefined}>
          <summary><b>סיכום ללקוח</b><span>גרסה {approved.version} · {approved.publishedAt ? 'בדף האישי' : 'להורדה ומסירה ידנית'}</span></summary>
          <div className="ty-details-body"><EstimateSummary client={client} version={approved} onPublished={() => void load()} /></div>
        </details>
      )}

      {approved && approved.outputs && (() => {
        const fu = followUpsFor(approved.outputs, { clientName: [client.firstName, client.lastName].filter(Boolean).join(' '), spouseName: client.spouse?.firstName || undefined, version: approved.version });
        if (!fu.length) return null;
        return (
          <details className="ty-details" id="te-followups" open={editingApproved || undefined}>
            <summary><b>משימות המשך</b><span>{fu.length} מגרסה {approved.version} · המלצה, לא ביצוע</span></summary>
            <div className="ty-details-body te-lines">
              <p className="ty-note">מה נשאר לעשות אחרי האישור. המערכת לא משנה מקדמות ברשות ולא שולחת דבר — כל אחד מאלה הוא משימה במשרד.</p>
              {fu.map(f => (
                <div key={f.key} className="te-row">
                  <span>{f.title}<small className="te-src"> · {f.why}</small></span>
                  {links?.createTask && (opened.has(f.key)
                    ? <span className="ty-chip green">נפתח</span>
                    : <button type="button" className="btn btn-sm btn-ghost" onClick={() => { links.createTask!(f.title); setOpened(s0 => new Set(s0).add(f.key)); }}>פתח משימה</button>)}
                </div>
              ))}
            </div>
          </details>
        );
      })()}

      <details className="ty-details" id="te-versions">
        <summary><b>גרסאות</b><span>{versions.length ? `${versions.length} · ${versions.filter(v => v.status === 'approved').length} מאושרת` : 'עוד לא נשמרה'}</span></summary>
        <div className="ty-details-body">
          <ul className="wd-list">{[...versions].reverse().map(v => (
            <li key={v.id}>גרסה {v.version} · {v.status === 'approved' ? `אושרה ${he(v.approvedAt?.slice(0, 10))}` : v.status === 'draft' ? 'טיוטה' : 'הוחלפה'} · חתך {MONTH_HE[v.draft.cutoffMonth]}
              {v.outputs?.household && !v.outputs.blockers.length ? ` · מ״ה ${nis(v.outputs.household.annualLiability)}${v.outputs.advances?.filter(a => a.recommended != null).map(a => ` · ${a.authority === 'it' ? 'מ״ה' : 'ב״ל'}${a.person === 'spouse' ? ' (בן/בת זוג)' : ''} ${a.unit === '%' ? `${a.recommended}%` : nis(a.recommended)}`).join('') ?? ''}` : ''}
              {v.status !== 'draft' && <button type="button" className="btn btn-sm btn-ghost" onClick={() => { setDraft(v.draft); setDirty(true); setMsg({ ok: true, text: `נטענה גרסה ${v.version} לעריכה — שמירה תפתח גרסה חדשה` }); }}>התחל ממנה</button>}
            </li>
          ))}</ul>
        </div>
      </details>
    </section>
  );
}

function AddLine({ onAdd, married }: { onAdd: (p: Person, s: IncomeLine['source'], label: string) => void; married: boolean }) {
  const [v, setV] = useState({ person: 'client' as Person, source: 'business' as IncomeLine['source'], label: '' });
  return (
    <div className="te-grid te-add">
      {married && <label className="te-field">של מי<select value={v.person} onChange={e => setV({ ...v, person: e.target.value as Person })}><option value="client">הלקוח</option><option value="spouse">בן/בת הזוג</option></select></label>}
      <label className="te-field">מקור<select value={v.source} onChange={e => setV({ ...v, source: e.target.value as IncomeLine['source'] })}>{(Object.keys(SOURCE_HE) as IncomeLine['source'][]).map(k => <option key={k} value={k}>{SOURCE_HE[k]}</option>)}</select></label>
      <label className="te-field">שם<input value={v.label} onChange={e => setV({ ...v, label: e.target.value })} placeholder="למשל: עסק שני" /></label>
      <div className="ty-actions"><button type="button" className="btn btn-sm btn-ghost" disabled={!v.label.trim()} onClick={() => { onAdd(v.person, v.source, v.label.trim()); setV({ ...v, label: '' }); }}>הוסף שורת הכנסה</button></div>
    </div>
  );
}

function AddOneOff({ lines, onAdd }: { lines: IncomeLine[]; onAdd: (o: { person: Person; lineId?: string; label: string; amount: number; timing: 'inActual' | 'expected' }) => void }) {
  const [v, setV] = useState({ lineId: lines[0]?.id ?? '', label: '', amount: undefined as number | undefined, timing: 'inActual' as 'inActual' | 'expected' });
  const line = lines.find(l => l.id === v.lineId);
  return (
    <div className="te-grid te-add">
      <label className="te-field">שורה<select value={v.lineId} onChange={e => setV({ ...v, lineId: e.target.value })}>{lines.map(l => <option key={l.id} value={l.id}>{l.label}</option>)}</select></label>
      <label className="te-field">מה<input value={v.label} onChange={e => setV({ ...v, label: e.target.value })} placeholder="למשל: מכירת ציוד, מענק" /></label>
      <NumField label="סכום (הוצאה — במינוס)" value={v.amount} onChange={x => setV({ ...v, amount: x })} />
      <label className="te-field">מתי<select value={v.timing} onChange={e => setV({ ...v, timing: e.target.value as typeof v.timing })}><option value="inActual">כבר קרה (כלול בבפועל)</option><option value="expected">צפוי בהמשך השנה</option></select></label>
      <div className="ty-actions"><button type="button" className="btn btn-sm btn-ghost" disabled={!v.label.trim() || v.amount == null || !line} onClick={() => { onAdd({ person: line!.person, lineId: line!.id, label: v.label.trim(), amount: v.amount!, timing: v.timing }); setV({ ...v, label: '', amount: undefined }); }}>הוסף</button></div>
    </div>
  );
}

function AddAdjustment({ lines, onAdd }: { lines: IncomeLine[]; onAdd: (a: { person: Person; lineId: string; bookCategory: string; amount: number; reason: string }) => void }) {
  const [v, setV] = useState({ lineId: lines[0]?.id ?? '', bookCategory: '', amount: undefined as number | undefined, reason: '' });
  const line = lines.find(l => l.id === v.lineId);
  if (!lines.length) return <p className="ty-note">אין שורת עסק לתאם.</p>;
  return (
    <div className="te-grid te-add">
      <label className="te-field">עסק<select value={v.lineId} onChange={e => setV({ ...v, lineId: e.target.value })}>{lines.map(l => <option key={l.id} value={l.id}>{l.label}</option>)}</select></label>
      <label className="te-field">קטגוריה בספרים<input value={v.bookCategory} onChange={e => setV({ ...v, bookCategory: e.target.value })} placeholder="למשל: הוצאות רכב" /></label>
      <NumField label="תיאום (+ מגדיל הכנסה)" value={v.amount} onChange={x => setV({ ...v, amount: x })} />
      <label className="te-field">סיבה<input value={v.reason} onChange={e => setV({ ...v, reason: e.target.value })} placeholder="למשל: חלק פרטי ברכב" /></label>
      <div className="ty-actions"><button type="button" className="btn btn-sm btn-ghost" disabled={!v.bookCategory.trim() || v.amount == null || !v.reason.trim() || !line} onClick={() => { onAdd({ person: line!.person, lineId: line!.id, bookCategory: v.bookCategory.trim(), amount: v.amount!, reason: v.reason.trim() }); setV({ ...v, bookCategory: '', amount: undefined, reason: '' }); }}>הוסף תיאום</button></div>
    </div>
  );
}

function AddPayment({ year, persons, onAdd }: { year: number; persons: Person[]; onAdd: (p: { authority: 'it' | 'ni'; person: Person; paidOn: string; period: string; amount: number }) => void }) {
  const [v, setV] = useState({ authority: 'it' as 'it' | 'ni', person: 'client' as Person, paidOn: '', month: 1, amount: undefined as number | undefined });
  return (
    <div className="te-grid te-add">
      <label className="te-field">רשות<select value={v.authority} onChange={e => setV({ ...v, authority: e.target.value as 'it' | 'ni' })}><option value="it">מס הכנסה</option><option value="ni">ביטוח לאומי</option></select></label>
      {persons.length > 1 && <label className="te-field">של מי<select value={v.person} onChange={e => setV({ ...v, person: e.target.value as Person })}>{persons.map(x => <option key={x} value={x}>{PERSON[x]}</option>)}</select></label>}
      <label className="te-field">שולם בתאריך<input type="date" value={v.paidOn} onChange={e => setV({ ...v, paidOn: e.target.value })} /></label>
      <label className="te-field">לתקופה<select value={v.month} onChange={e => setV({ ...v, month: Number(e.target.value) })}>{MONTH_HE.slice(1).map((x, i) => <option key={i + 1} value={i + 1}>{x} {year}</option>)}</select></label>
      <NumField label="סכום" value={v.amount} onChange={x => setV({ ...v, amount: x })} />
      <div className="ty-actions"><button type="button" className="btn btn-sm btn-ghost" disabled={!v.paidOn || v.amount == null} onClick={() => { onAdd({ authority: v.authority, person: v.person, paidOn: v.paidOn, period: `${year}-${String(v.month).padStart(2, '0')}`, amount: v.amount! }); setV({ ...v, amount: undefined }); }}>הוסף תשלום</button></div>
    </div>
  );
}


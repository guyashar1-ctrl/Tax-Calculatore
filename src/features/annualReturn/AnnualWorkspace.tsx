// ─── הדוח השנתי במשרד: מסך אחד — «חומרים» ליד «הדוח» (25.10.2026) ───────────────────────────────────────────
// ‼ ההמחשה שגיא אישר: docs/proposals/2026-10-25-annual-office-return.html. «אני לא רוצה מיליון אישורים… כל מה שאפשר
//   לבד — לבד». ולכן:
//   · תשובות הלקוח נכנסות לדוח ולתיק לבד (workspace.autoAcceptPlan) — אחרי שסיים לענות, בלי כפתור אישור.
//   · «הזנה» ליד המסמך עצמו ⇒ record_source_lines (258) ⇒ המספרים בדוח מיד; השדות שהשתנו מהבהבים.
//   · «הדוח» — הסיכום, או הטופס עצמו (1301 והנספחים הרלוונטיים, עם הערכים בשדות — formPages.ts).
//   · «הדפסת הסט» — עמוד ריכוז ← 1301 ← נספחים ← אסמכתאות (printSet.ts).
// ‼ כל מה שהיה כאן קודם (פס השלבים, «פירוט», גרסאות, הכרעות שנת פטירה, הקובץ לשידור) — ב«כלים מתקדמים», לא נמחק.

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { Client } from '../../types';
import type { OnboardingStep } from '../../types/onboarding';
import type { ProposedFact } from '../../types/taxFacts';
import type { YearData } from '../taxYear/api';
import * as tyApi from '../taxYear/api';
import type { ItemStatus } from '../taxYear/picture';
import type { SubjectRole } from '../taxYear/types';
import { ITEM_BY_KEY } from '../taxYear/catalog';
import { OykInputs, oykCurrent, oykFields } from '../taxYear/AnnualSummary';
import type { EstimateVersion } from '../taxEstimate/types';
import { computeReturn } from './engine';
import { initialDraft } from './AnnualReturnPanel';
import * as api from './api';
import { DOC_TEMPLATES, entitiesFor, linesToSave, missingRequired, templateFor, type LineValues } from './docTemplates';
import type { ReturnDraft, ReturnOutputs } from './types';
import { balanceText, filledPct, isReady, materialsOf, neededAnnexes, type Material, type Who } from './workspace';
import { slugOfForm } from './formPages';
import { loadDocumentFile, isPdf, type LoadedFile } from './docFile';
import { openPrintSet, setContents } from './printSet';
import { loadSigning, sendForSigning, signErrorText, signSnapshot, signersOf, snapshotKey, storeSigned, type Signing } from './signing';
import { buildSignedSetPdf, sha256Hex } from './signedSet';
import { supabase } from '../../lib/supabase';
import type { FormSlug } from '../taxKnowledge/formMap/model';
import './workspace.css';
import { useAutoAccept } from '../taxYear/useAutoAccept';
import { FormView, Ring, Summary } from './ReturnView';

type Run = (fn: () => Promise<unknown>, done?: string) => Promise<boolean>;
type ApplyCard = (items: ProposedFact[], sourceRef: string) => Promise<{ ok: boolean; error?: string; client?: Client }>;

interface Props {
  client: Client;
  step: OnboardingStep;
  year: number;
  data: YearData;
  busy: boolean;
  run: Run;
  statuses: ItemStatus[];
  applyCard: ApplyCard;
  /** «כלים מתקדמים» — המסך הקודם (פס השלבים, הפירוט, הגרסאות), שמוצג מתחת (TaxYearProcess). */
  advancedOpen: boolean;
  onAdvanced: (open: boolean) => void;
  /** מה שהמשרד משלים (picture.officeTodo) — ומה שפותח את העורכים הקיימים שלו («כלים מתקדמים» ← «להשלים במשרד»). */
  officeTodo: ItemStatus[];
  /** העורך של המשרד לפריטים האלה — נפתח בתוך «אצלך» (לא במסך הקודם). */
  renderOffice: (statuses: ItemStatus[]) => ReactNode;
}

/** פריטים שהמספרים שלהם נכנסים מהקלדת מסמך (106, 867, קופות, רו״ה…) — כבר שורות ב«חומרים». */
const TEMPLATE_ITEMS = new Set(Object.values(DOC_TEMPLATES).flat().flatMap(t => t.lines.map(l => l.itemKey)));
const OYK_KEYS = new Set(['payments.advances', 'payments.withholding', 'payments.niPaid', 'carryForward.balances']);
const ICON: Record<Material['state'], string> = {
  wait: '<circle cx="12" cy="12" r="8"/><path d="M12 8v4l2.5 1.5"/>',
  here: '<path d="M7 3h7l4 4v14H7z"/><path d="M14 3v4h4M9.5 12h5M9.5 15.5h5"/>',
  got: '<path d="M7 3h7l4 4v14H7z"/><path d="M14 3v4h4"/>',
  mine: '<rect x="6" y="3" width="12" height="18" rx="2"/><path d="M9 7h6M9 11h1M12 11h1M9 15h1M12 15h1"/>',
  done: '<path d="M6 12.5l4 4 8-9"/>',
};

export default function AnnualWorkspace({ client, step, year, data, busy, run, statuses, applyCard, advancedOpen, onAdvanced, officeTodo, renderOffice }: Props) {
  const firstName = client.firstName || 'הלקוח';
  const married = client.familyStatus === 'married' || !!client.spouse;
  const spouseName = client.spouseFirstName || client.spouse?.firstName || 'בן/בת הזוג';
  const nameOf = (w: Who) => (w === 'spouse' ? spouseName : w === 'client' ? firstName : 'משותף');

  // ── הטיוטה של הדוח (233) — כמו פאנל הדוח: הגרסה הפתוחה, או טיוטה ראשונה מהתיק ──
  const [draft, setDraft] = useState<ReturnDraft | null>(null);
  const [estimate, setEstimate] = useState<EstimateVersion | undefined>();
  useEffect(() => {
    let alive = true;
    void (async () => {
      const [vs, est] = await Promise.all([api.loadReturns(step.id).catch(() => []), api.loadApprovedEstimate(client.id, year).catch(() => undefined)]);
      if (!alive) return;
      const cur = vs.find(v => v.status === 'draft') ?? [...vs].reverse().find(v => v.status === 'approved');
      setEstimate(est); setDraft(cur ? cur.draft : initialDraft(client, year, est));
    })();
    return () => { alive = false; };
  }, [step.id, client, year]);
  const out = useMemo<ReturnOutputs | null>(() => (draft ? computeReturn({ client, draft, facts: data.facts, evidence: data.evidence,
    estimate: estimate?.outputs ? { version: estimate.version, cutoffMonth: estimate.draft.cutoffMonth, outputs: estimate.outputs } : undefined }) : null),
  [draft, client, data.facts, data.evidence, estimate]);

  // ── השדות שהשתנו מאז הפעם הקודמת — מהבהבים לרגע (אחרי «שמירה») ──
  const prevAmounts = useRef<Map<string, number> | null>(null);
  const [lit, setLit] = useState<Set<string>>(new Set());
  useEffect(() => {
    if (!out) return;
    const now = new Map(out.fields.filter(f => f.kind === 'amount').map(f => [`${f.code}|${f.person}`, f.amount ?? 0]));
    const before = prevAmounts.current;
    prevAmounts.current = now;
    if (!before) return;
    const changed = new Set([...now].filter(([k, v]) => (before.get(k) ?? 0) !== v).map(([k]) => k.split('|')[0]));
    if (!changed.size) return;
    setLit(changed);
    const t = window.setTimeout(() => setLit(new Set()), 1800);
    return () => window.clearTimeout(t);
  }, [out]);

  const asks = data.asks.filter(a => a.parentStepId === step.id && a.state !== 'cancelled');
  const filling = asks.some(a => a.state === 'published' && a.prompt.input.kind !== 'file');
  const sent = asks.length > 0;

  // ── ‼ התשובות נכנסות לבד: אחרי שהלקוח סיים, פעם אחת לכל מצב — עדכון התיק (מה שאפשר עד הסוף) ואישור התשובות ──
  const plan = useAutoAccept({ client, facts: data.facts, stepId: step.id, filling, busy, run, applyCard });

  const mats = useMemo(() => materialsOf({ client, year, stepId: step.id, asks: data.asks, evidence: data.evidence, facts: data.facts, statuses }), [client, year, step.id, data, statuses]);
  // «רק אתה יודע» — מקדמות, ניכוי במקור, ב״ל כעצמאי, הפסדים מועברים (אותם שדות כמו בסיכום הקודם)
  const businesses = (client.businesses ?? []).filter(b => !b.isClosed);
  const oyk = oykFields(client, businesses.map(b => (b.belongsToSpouse ? 'spouse' : 'client')));
  const oykDone = oyk.length > 0 && oyk.every(f => oykCurrent(data.facts, f.key, f.role) !== null);
  const notes = asks.filter(a => a.officeNote && !a.noteResolvedAt);
  const unlisted = data.facts.filter(f => f.taxYear === year && f.itemKey === 'income.unlisted' && f.answer === 'value' && f.status !== 'rejected' && f.status !== 'superseded'
    && !data.facts.some(d => d.itemKey === 'annual.officeDecision' && (d.value as { decision?: string } | undefined)?.decision === `unlisted-${f.subjectRole}`));
  // ‼ מה שהמשרד משלים ואינו מסמך להקלדה ואינו «רק אתה יודע» (הצהרות, מסלול לנכס, פרטים לטופס…) — שורה אחת לעורכים הקיימים
  //   מקדמות / ניכוי במקור / ב״ל כעצמאי / הפסדים — רק ב«רק אתה יודע» (ושם רק למי שזה נוגע לו); נושא אחד = שורה אחת גם לשני בני הזוג
  const officeRest = [...new Map(officeTodo.filter(s => s.item.kind !== 'document' && !TEMPLATE_ITEMS.has(s.item.key) && !OYK_KEYS.has(s.item.key))
    .map(s => [s.item.key, s])).values()];
  const openExtras = (oyk.length && !oykDone ? 1 : 0) + notes.length + unlisted.length + plan.needsDecision.length + (officeRest.length ? 1 : 0);
  const ready = sent && !filling && isReady(mats) && openExtras === 0;

  const [entry, setEntry] = useState<Material | null>(null);
  const [extra, setExtra] = useState<'oyk' | 'office' | null>(null);
  const [tab, setTab] = useState<'sum' | FormSlug>('sum');
  const [showSet, setShowSet] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const waiting = mats.filter(m => m.state === 'wait').length;
  const mine = mats.filter(m => m.state === 'here' || m.state === 'mine').length + openExtras;
  const status0 = !sent ? 'השאלון עוד לא נשלח' : filling ? `${firstName} באמצע השאלון` : ready ? 'הכול מוכן'
    : [waiting ? `ממתין ל-${waiting} מ${firstName}` : '', mine ? `${mine} אצלך` : ''].filter(Boolean).join(' · ') || 'הכול מוכן';

  // ── 297 · חתימת הלקוח על הסט: «שליחה לחתימה» = האישור של המשרד; «נחתם» — רק מהשרת ──
  const [signing, setSigning] = useState<Signing | null>(null);
  const refreshSigning = () => loadSigning(step.id).then(setSigning).catch(() => setSigning(null));
  useEffect(() => { void refreshSigning(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [step.id, data]);
  const docsDone = mats.filter(m => m.state === 'done' || m.state === 'got').map(m => ({ title: m.title, who: nameOf(m.who) }));
  const snap = out ? signSnapshot(out, { year, clientName: firstName, spouseName: married ? spouseName : undefined, docs: docsDone }) : null;
  const changed = !!(signing && snap && snapshotKey(signing.snapshot) !== snapshotKey(snap));
  const pendingNames = signing ? signing.signers.filter(g => !signing.signed[g.role]).map(g => g.name) : [];
  const status = !signing ? status0 : changed ? 'הדוח השתנה מאז החתימה' : signing.state === 'signed' ? (signing.signers.length > 1 ? 'שניהם חתמו' : 'נחתם')
    : `נשלח לחתימה · ממתין ל${pendingNames.join(' ול')}`;
  const send = () => snap && void run(async () => {
    const r = await sendForSigning(step.id, snap, signersOf(client));
    if (!r.ok) { setMsg(signErrorText(r.error)); return r; }
    setMsg(null); await refreshSigning(); return r;
  }, `נשלח לחתימה — מופיע בדף של ${firstName}. המייל, אם צריך — מ«הדף של ${firstName}».`);
  // ‼ הקובץ החתום: כשכולם חתמו — נבנה מהצילום ומהחתימות שבשרת, נשמר במסמכים של הלקוח (פעם אחת)
  const storing = useRef(false);
  // ‼ ניסיון שנכשל (הכניסה עוד לא נטענה אחרי רענון, רשת) — עוד שני ניסיונות לבד; רק אחריהם הודעה
  const [storeTry, setStoreTry] = useState(0);
  useEffect(() => {
    if (!signing || signing.state !== 'signed' || signing.signedDocumentId || storing.current) return;
    storing.current = true;
    let failed = true;
    void (async () => {
      try {
        const { data: u } = await supabase.auth.getUser();
        if (!u.user) return;
        const bytes = await buildSignedSetPdf(signing);
        const sha = await sha256Hex(bytes);
        const path = `${u.user.id}/${client.id}/arsign-${signing.id}-v${signing.version}`;
        const up = await supabase.storage.from('client-documents').upload(path, new Blob([bytes as BlobPart], { type: 'application/pdf' }), { contentType: 'application/pdf', upsert: true });
        if (up.error) return;
        const r = await storeSigned(signing.id, path, bytes.length, sha);
        if (!r.ok) return;
        failed = false;
        await refreshSigning();
      } catch (e) {
        console.warn('annual signed set', e);
      } finally {
        storing.current = false;
        if (failed) {
          if (storeTry < 2) window.setTimeout(() => setStoreTry(n => n + 1), 3000);
          else setMsg('הקובץ החתום לא נשמר — ננסה שוב בפתיחה הבאה');
        }
      }
    })();
    /* eslint-disable-next-line react-hooks/exhaustive-deps */
  }, [signing?.id, signing?.state, signing?.signedDocumentId, storeTry]);
  const openSigned = async () => {
    if (!signing?.signedDocumentId) return;
    const f = await loadDocumentFile(signing.signedDocumentId);
    if (f) window.open(f.url, '_blank'); else setMsg('הקובץ לא נטען');
  };

  const markDecision = (key: string) => run(() => tyApi.recordFact(client.id, {
    taxYear: year, itemKey: 'annual.officeDecision', subjectRole: 'couple', periodKind: 'year', periodFrom: `${year}-01-01`, periodTo: `${year}-12-31`,
    answer: 'value', value: { decision: key, done: true, at: new Date().toISOString().slice(0, 10) }, basis: 'actual', requestId: step.id,
  } as never), 'סומן שבורר');

  const groups: Who[] = married ? ['client', 'spouse', 'home'] : ['client', 'home'];
  const isMine = (m: Material) => m.state === 'here' || m.state === 'mine';
  const matRow = (m: Material, withName = false) => (
    <div key={m.key} className={`aw-mat is-${m.state}`} data-aw-mat={m.docKind ?? ''} data-state={m.state}>
      <span className="aw-ic" aria-hidden="true" dangerouslySetInnerHTML={{ __html: `<svg viewBox="0 0 24 24">${ICON[m.state]}</svg>` }} />
      <span className="aw-t"><b>{m.title}</b>{withName
        ? <small><span className="aw-who" data-who={m.who}>{nameOf(m.who)}</span>{m.sub && m.sub !== 'אצלך' ? ` · ${m.sub}` : ''}</small>
        : m.sub && <small>{m.sub}</small>}</span>
      {(m.state === 'here' || (m.state === 'mine' && m.enterable)) && <button type="button" className="aw-act" onClick={() => setEntry(m)} data-aw-enter>{m.state === 'mine' ? 'הכנה' : 'הזנה'}</button>}
      {m.state === 'done' && m.enterable && <button type="button" className="aw-link" onClick={() => setEntry(m)}>תיקון</button>}
      {m.state === 'got' && m.evidence?.documentId && <button type="button" className="aw-link" onClick={() => setEntry(m)}>צפייה</button>}
      {m.state === 'wait' && <span className="aw-tag">ממתין</span>}
      {m.state === 'done' && !m.enterable && <span className="aw-tag is-ok">✓</span>}
    </div>
  );
  const oykRow = (
    <div key="oyk">
      <div className={`aw-mat ${oykDone ? 'is-done' : 'is-mine'}`} data-aw-oyk>
        <span className="aw-ic" aria-hidden="true" dangerouslySetInnerHTML={{ __html: `<svg viewBox="0 0 24 24">${ICON[oykDone ? 'done' : 'mine']}</svg>` }} />
        <span className="aw-t"><b>{oyk.length === 1 ? oyk[0].label : 'תשלומים על חשבון והפסדים'}</b><small>{oykDone ? 'נרשם' : 'רק אתה יודע'}</small></span>
        <button type="button" className={oykDone ? 'aw-link' : 'aw-act'} onClick={() => setExtra(extra === 'oyk' ? null : 'oyk')} aria-expanded={extra === 'oyk'}>{oykDone ? 'תיקון' : 'הזנה'}</button>
      </div>
      {extra === 'oyk' && <div className="aw-inline"><OykInputs client={client} year={year} stepId={step.id} fields={oyk} facts={data.facts.filter(f => f.taxYear === year)} busy={busy} run={run} /></div>}
    </div>
  );
  const annexes = out ? neededAnnexes(out) : [];

  return (
    <section className="aw" data-annual-workspace aria-label={`דוח שנתי ${year}`}>
      <header className="aw-top">
        <div className="aw-status"><span data-aw-status>{status}</span>
          <span className="aw-btns">
            <button type="button" className={`btn ${ready && (!signing || changed) ? 'btn-ghost' : 'btn-primary'}`} disabled={!ready || !out} onClick={() => setShowSet(true)} data-aw-print>הדפסת הסט</button>
            {ready && out && (!signing || changed) && <button type="button" className="btn btn-primary" disabled={busy} onClick={send} data-aw-send-sign>{signing ? 'שליחה מחדש' : 'שליחה לחתימה'}</button>}
            {signing?.signedDocumentId && !changed && <button type="button" className="btn btn-ghost" onClick={() => void openSigned()} data-aw-signed-file>הקובץ החתום</button>}
          </span>
        </div>
      </header>
      {signing && (
        <div className="aw-signers" data-aw-signing={changed ? 'changed' : signing.state}>
          {signing.signers.map(g => (
            <div key={g.role} className={`aw-signer${signing.signed[g.role] ? ' is-done' : ''}`} data-who={g.role} data-aw-signer={g.role}>
              <i aria-hidden="true">{g.name[0]}</i><b>{g.name}</b>
              <span>{signing.signed[g.role] ? `${g.gender === 'f' ? '✓ חתמה' : '✓ חתם'} · ${new Date(signing.signed[g.role]!).toLocaleDateString('he-IL')}` : 'ממתין'}</span>
            </div>
          ))}
          {changed && <p className="aw-changed" role="note">הדוח עודכן אחרי ש{signing.state === 'signed' ? 'נחתם' : 'נשלח לחתימה'}. החתימה הקודמת נשמרת בהיסטוריה.</p>}
        </div>
      )}
      {msg && <p className="aw-msg" role="status">{msg}</p>}

      <div className="aw-grid">
        {/* ── חומרים ── */}
        <section className="aw-mats" aria-labelledby="aw-mats-h">
          <div className="aw-col-h"><h4 id="aw-mats-h">חומרים</h4><small data-aw-open>{sent ? (mats.filter(m => m.state !== 'done' && m.state !== 'got').length + openExtras ? `${mats.filter(m => m.state !== 'done' && m.state !== 'got').length + openExtras} פתוחים` : 'הכול הוזן') : ''}</small></div>
          {!sent && <p className="aw-empty">כשהשאלון יישלח ל{firstName}, המסמכים יופיעו כאן.</p>}
          {/* ‼ גיא (25.10): «אני לא רואה בממשק את הדברים שאני צריך לעשות» — כל מה שבידיים שלך למעלה, במקום אחד; מתחת — מה שממתין מהלקוח */}
          {sent && (
            <div className="aw-grp aw-minebox" data-who="mine" data-aw-mine={mine}>
              <div className="aw-grp-h"><i aria-hidden="true">✓</i>אצלך{mine ? ` · ${mine}` : ''}</div>
              {!mine && <p className="aw-empty" data-aw-mine-empty>אין לך מה לעשות כרגע.</p>}
              {mats.filter(isMine).map(m => matRow(m, true))}
              {oyk.length > 0 && !oykDone && oykRow}
              {notes.map(a => (
                <div key={a.id} className="aw-mat is-mine" data-aw-hint>
                  <span className="aw-ic" aria-hidden="true" dangerouslySetInnerHTML={{ __html: `<svg viewBox="0 0 24 24">${ICON.mine}</svg>` }} />
                  <span className="aw-t"><b>«{a.officeNote}»</b><small>{a.prompt.subjectName ?? firstName}</small></span>
                  <button type="button" className="aw-act" disabled={busy} onClick={() => void run(() => tyApi.resolveNote(a.id), 'סומן שנסגר')}>סגור</button>
                </div>
              ))}
              {unlisted.map(f => (
                <div key={f.id} className="aw-mat is-mine" data-aw-unlisted={f.subjectRole}>
                  <span className="aw-ic" aria-hidden="true" dangerouslySetInnerHTML={{ __html: `<svg viewBox="0 0 24 24">${ICON.mine}</svg>` }} />
                  <span className="aw-t"><b>לברר עם {nameOf(f.subjectRole === 'spouse' ? 'spouse' : 'client')}: הכנסה אחרת</b><small>שלא ברשימה</small></span>
                  <button type="button" className="aw-act" disabled={busy} onClick={() => void markDecision(`unlisted-${f.subjectRole}`)}>בורר</button>
                </div>
              ))}
              {officeRest.length > 0 && (
                <div className="aw-mat is-mine" data-aw-office-rest={officeRest.map(s => `${s.item.key}:${s.subjectRole}:${s.entityKind ?? ""}:${s.entityRef ?? ""}`).join(",")}>
                  <span className="aw-ic" aria-hidden="true" dangerouslySetInnerHTML={{ __html: `<svg viewBox="0 0 24 24">${ICON.mine}</svg>` }} />
                  <span className="aw-t"><b>להשלים במשרד{officeRest.length > 1 ? ` · ${officeRest.length}` : ''}</b><small>{officeRest.slice(0, 2).map(s => s.item.label).join(' · ')}{officeRest.length > 2 ? ` ועוד ${officeRest.length - 2}` : ''}</small></span>
                  <button type="button" className="aw-act" onClick={() => setExtra(extra === 'office' ? null : 'office')} aria-expanded={extra === 'office'}>להשלים</button>
                </div>
              )}
              {officeRest.length > 0 && extra === 'office' && <div className="aw-inline ty-office-inline" data-aw-office-panel>{renderOffice(officeRest)}</div>}
              {plan.needsDecision.map(({ fact, plan: p }) => (
                <div key={fact.id} className="aw-mat is-mine" data-aw-decide>
                  <span className="aw-ic" aria-hidden="true" dangerouslySetInnerHTML={{ __html: `<svg viewBox="0 0 24 24">${ICON.mine}</svg>` }} />
                  <span className="aw-t"><b>{ITEM_BY_KEY[fact.itemKey]?.label ?? 'שינוי בתיק'}</b><small>{p.lines[0] ?? 'צריך החלטה לפני העדכון בתיק'}</small></span>
                  <button type="button" className="aw-link" onClick={() => onAdvanced(true)}>להחליט</button>
                </div>
              ))}
            </div>
          )}
          {groups.map(w => {
            const list = mats.filter(m => m.who === w && !isMine(m));
            const oykHere = w === 'home' && oyk.length > 0 && oykDone;
            if (!list.length && !oykHere) return null;
            return (
              <div key={w} className="aw-grp" data-who={w}>
                <div className="aw-grp-h"><i aria-hidden="true">{w === 'home' ? '✱' : nameOf(w)[0]}</i>{nameOf(w)}</div>
                {list.map(m => matRow(m))}
                {oykHere && oykRow}
              </div>
            );
          })}
        </section>

        {/* ── הדוח ── */}
        <section className="aw-rep" aria-labelledby="aw-rep-h">
          <div className="aw-col-h"><h4 id="aw-rep-h">הדוח</h4><small>1301{annexes.length ? ' ונספחים' : ''} · מתמלא לבד</small></div>
          {!out ? <p className="aw-empty">טוען…</p> : (
            <div className="aw-card">
              <div className="aw-rep-top">
                <Ring pct={filledPct(out)} />
                <div className="aw-est"><small>הערכה כרגע</small><b className={out.household.balance < 0 && !out.household.incomplete ? 'is-refund' : ''} data-aw-balance>{balanceText(out) ?? 'חסרים נתונים'}</b></div>
              </div>
              <div className="aw-tabs" role="tablist" aria-label="תצוגת הדוח">
                <button type="button" role="tab" aria-selected={tab === 'sum'} onClick={() => setTab('sum')}>סיכום</button>
                <button type="button" role="tab" aria-selected={tab === '1301'} onClick={() => setTab('1301')} data-aw-tab="1301">1301</button>
                {annexes.map(a => { const s = slugOfForm(a.formId); return s ? <button key={a.formId} type="button" role="tab" aria-selected={tab === s} onClick={() => setTab(s)} data-aw-tab={s}>{a.formId}</button> : null; })}
              </div>
              {tab === 'sum' ? <Summary out={out} lit={lit} firstName={firstName} spouseName={spouseName} married={married} />
                : <FormView slug={tab} out={out} lit={lit} />}
            </div>
          )}
        </section>
      </div>

      <div className="aw-adv">
        <button type="button" className="aw-link" onClick={() => onAdvanced(!advancedOpen)} aria-expanded={advancedOpen} data-aw-advanced>{advancedOpen ? 'סגירת הכלים המתקדמים' : 'כלים מתקדמים'}</button>
      </div>

      {entry && <EntryPanel m={entry} client={client} year={year} stepId={step.id} facts={data.facts} run={run} spouseName={spouseName} onClose={() => setEntry(null)} />}
      {showSet && out && (
        <div className="aw-scrim" onClick={e => { if (e.target === e.currentTarget) setShowSet(false); }}>
          <div className="aw-set" role="dialog" aria-label="הסט להדפסה">
            <h4>הסט — דוח שנתי {year}</h4>
            <ol>{setContents(out, mats).map(p => <li key={p.title}>{p.title}{p.pages > 1 ? <small> · {p.pages} עמ׳</small> : null}</li>)}</ol>
            <div className="aw-set-foot">
              <button type="button" className="btn btn-primary" data-aw-do-print onClick={() => {
                void openPrintSet({ out, mats, clientName: firstName, spouseName: married ? spouseName : undefined, year })
                  .then(r => setMsg(r === 'blocked' ? 'הדפדפן חסם את חלון ההדפסה — לאפשר חלונות קופצים לאתר ולנסות שוב' : null));
                setShowSet(false);
              }}>הדפסה</button>
              <button type="button" className="btn btn-ghost" onClick={() => setShowSet(false)}>סגירה</button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

/** «הזנה»: המסמך עצמו ליד השדות מהתבנית; «שמירה» ⇒ שורות מקור ⇒ הדוח. מסמך בלי מספרים — רק צפייה. */
function EntryPanel({ m, client, year, stepId, facts, run, spouseName, onClose }: {
  m: Material; client: Client; year: number; stepId: string; facts: YearData['facts']; run: Run; spouseName: string; onClose: () => void;
}) {
  const t = m.docKind ? templateFor(m.docKind as never, year)?.template : undefined;
  const [file, setFile] = useState<LoadedFile | null | 'loading'>(m.evidence?.documentId ? 'loading' : null);
  useEffect(() => {
    if (!m.evidence?.documentId) return;
    let alive = true; let url: string | undefined;
    void loadDocumentFile(m.evidence.documentId).then(f => { if (!alive) { if (f) URL.revokeObjectURL(f.url); return; } url = f?.url; setFile(f); });
    return () => { alive = false; if (url) URL.revokeObjectURL(url); };
  }, [m.evidence?.documentId]);
  const existing = m.evidence ? facts.filter(f => f.evidenceId === m.evidence!.id && f.status === 'accepted') : [];
  const [values, setValues] = useState<LineValues>(() => Object.fromEntries(existing.map(f => {
    const v = f.value && typeof f.value === 'object' ? Object.values(f.value as Record<string, unknown>).find(x => typeof x === 'number') : f.value;
    return [f.lineKey ?? '', typeof v === 'number' ? v : undefined];
  })));
  const married = client.familyStatus === 'married' || !!client.spouse;
  const [who, setWho] = useState<'client' | 'spouse'>(m.subjectRole === 'spouse' ? 'spouse' : 'client');
  const ents = t ? entitiesFor(t, client, who) : [];
  const [entityRef, setEntityRef] = useState(m.entityRef ?? (ents.length === 1 ? ents[0].id : ''));
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => { const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); }; window.addEventListener('keydown', h); return () => window.removeEventListener('keydown', h); }, [onClose]);
  const problems = t ? [...missingRequired(t, values).map(x => `חסר: ${x}`), ...t.validate(values)] : [];
  const needEntity = !!t?.entityKind && ents.length > 0 && !entityRef;
  const askWho = married && !!t && (m.subjectRole !== 'client' && m.subjectRole !== 'spouse');
  const save = async () => {
    if (!t) return;
    setErr(null);
    const lines = linesToSave(t, values, { subjectRole: who as SubjectRole, entityRef: entityRef || undefined, taxYear: year, requestId: stepId, askId: m.ask?.id });
    const ok = await run(async () => {
      const r = await api.recordSourceLines(client.id, lines, m.evidence ? { evidenceId: m.evidence.id }
        : { evidence: { docKind: t.docKind, subjectRole: who, entityKind: t.entityKind, entityRef: entityRef || undefined, taxYear: year, note: 'הוזן במשרד' } });
      if (!r.ok) setErr(r.error === 'evidence_mismatch' ? 'המסמך סומן «לא תואם» — לא מזינים ממנו' : `השמירה לא הצליחה (${r.error})`);
      return r;
    });
    if (ok) onClose();
  };
  return (
    <div className="aw-scrim" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className={`aw-panel${file === null ? ' no-file' : ''}`} role="dialog" aria-label={m.title} data-aw-panel={m.docKind ?? ''}>
        {file !== null && (
          <div className="aw-doc">
            {file === 'loading' ? <p className="aw-empty">טוען את המסמך…</p>
              : !file ? <p className="aw-empty">הקובץ לא נטען.</p>
              : isPdf(file) ? <iframe src={file.url} title={m.title} />
              : <img src={file.url} alt={m.title} />}
          </div>
        )}
        <div className="aw-form-side">
          <h4>{m.title}</h4>
          {!t ? <p className="aw-hint">מהמסמך הזה אין מספרים להקליד — מספיק שהגיע.</p> : (
            <>
              {askWho && (
                <div className="aw-seg" role="group" aria-label="של מי">
                  {(['client', 'spouse'] as const).map(r => <button key={r} type="button" aria-pressed={who === r} onClick={() => { setWho(r); setEntityRef(''); }}>{r === 'spouse' ? spouseName : client.firstName || 'הלקוח'}</button>)}
                </div>
              )}
              {t.entityKind && ents.length > 1 && (
                <label className="aw-fl"><span>{t.per === 'employer' ? 'מעסיק' : t.per === 'business' ? 'עסק' : t.per === 'account' ? 'חשבון' : 'קופה'}</span>
                  <select value={entityRef} onChange={e => setEntityRef(e.target.value)}><option value="">בחירה…</option>{ents.map(x => <option key={x.id} value={x.id}>{x.label}</option>)}</select>
                </label>
              )}
              {t.lines.map(l => (
                <label key={l.key} className="aw-fl" data-aw-line={l.key}>
                  <span>{l.label}{l.optional ? '' : ' *'}<em>{l.goesTo.split(' ')[0].replace(/[^\d/]/g, '')}</em></span>
                  <input inputMode="numeric" dir="ltr" value={typeof values[l.key] === 'number' ? (values[l.key] as number).toLocaleString('he-IL') : ''}
                    onChange={e => { const raw = e.target.value.replace(/[^\d.-]/g, ''); setValues(v => ({ ...v, [l.key]: raw === '' ? undefined : Number(raw) })); }} />
                </label>
              ))}
              {problems.length > 0 && Object.values(values).some(v => typeof v === 'number') && <ul className="aw-problems" role="alert">{problems.map(p => <li key={p}>{p}</li>)}</ul>}
              {needEntity && <p className="aw-hint">לבחור {t.per === 'employer' ? 'מעסיק' : 'למי המסמך שייך'}.</p>}
              {err && <p className="aw-err" role="alert">{err}</p>}
            </>
          )}
          <div className="aw-pfoot">
            {t && <button type="button" className="btn btn-primary" disabled={problems.length > 0 || needEntity} onClick={() => void save()} data-aw-save>שמירה</button>}
            <button type="button" className="btn btn-ghost" onClick={onClose}>{t ? 'ביטול' : 'סגירה'}</button>
          </div>
        </div>
      </div>
    </div>
  );
}

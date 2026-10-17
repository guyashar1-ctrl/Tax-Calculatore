// ─── תיק מס › שנות מס (229) ─────────────────────────────────────────────────
// ‼ אין לשונית «שנת מס» (ההדמיה המאושרת): כרטיס לכל שנה כאן, שפותח את דף
// התהליך. עובדות מתמשכות נשארות בתיק; סכום לשנה — בשנת המס.
// ‼ «סכומים בכרטיס בלי שנה» (החלטת גיא 11.10.2026): שנה מוצעת רק עם ראיה שמוצגת;
// אישור מרוכז לקבוצה עם אותו בסיס, עם חריגים; בלי ראיה — «שנה לא ידועה», בלי
// ניחוש ובלי חישוב. הערך בכרטיס לא משתנה; ההחלטה וההיסטוריה נשמרות.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Client } from '../../types';
import type { OnboardingStep } from '../../types/onboarding';
import { supabase } from '../../lib/supabase';
import { stepFromDb } from '../../lib/dbMappers';
import * as api from './api';
import { openTaxFileIntake } from './workCreate';
import type { WealthPayload } from './WealthDeclarationPanel';
import { deadlineView, dueState } from './workMeta';
import AddTaxWorkDialog from './AddTaxWorkDialog';
import { todayIso } from '../../utils/dateFormat';
import { MONTHS } from './asks';
import { proposeTransfers, type FieldWrite, type TransferProposal } from './transfer';
import TaxYearProcess from './TaxYearProcess';
import RemoveWorkDialog from './RemoveWorkDialog';
import { consumeKnowledgeReturn } from '../taxKnowledge/knowledgeLink';
import './taxYear.css';
import { AVAILABLE } from '../taxKnowledge/availability';

interface Props {
  client: Client;
  onChanged?: () => void;
  /** 236 · עדכון הכרטיס מתוך התהליך — הכרטיס המעודכן, כדי שהמסך לא יישאר ישן. */
  onClientPersisted?: (c: Client) => void;
  /** 236 · כפתור «השלמת תיק המס» בראש התיק: כל שינוי במספר פותח (או יוצר) את הקליטה. */
  intakeSignal?: number;
  /**
   * 16.10.2026 · «כל עבודה היא בקשה»: «פתח» נוחת בשורת הבקשה ב«בקשות» (העבודה נפתחת בתוך השורה) —
   * לא מסך תהליך שלישי. בלי הפרופ (מסכי בדיקה) — כמו קודם, דף התהליך.
   */
  onOpenRequest?: (stepId: string) => void;
}

/** סדר: שנה / יום ההצהרה — החדש למעלה. */
const periodKey = (s: OnboardingStep) => { const p = (s.payload ?? {}) as unknown as { taxYear?: number; asOfDate?: string }; return p.asOfDate ?? `${p.taxYear ?? 0}-12-31`; };
const OPEN = (s: OnboardingStep) => !['completed', 'verified', 'skipped', 'cancelled', 'failed'].includes(s.status);
const money = (n: number) => `${n.toLocaleString('he-IL')} ₪`;

export default function TaxYearsSection({ client, onChanged, onClientPersisted, intakeSignal, onOpenRequest }: Props) {
  const [steps, setSteps] = useState<OnboardingStep[]>([]);
  /** 16.10.2026 · עבודות שבוטלו — כאן הבית של «החזר…» (ב«מס › עבודות לקוחות» יש עכשיו סקירה בלבד). */
  const [cancelled, setCancelled] = useState<OnboardingStep[]>([]);
  // ‼ 231: גרסת ההערכה המאושרת האחרונה לכל בקשה — מוצגת בכרטיס השנה (מקור אחד: tax_estimates)
  const [approvedEst, setApprovedEst] = useState<Map<string, { version: number; rate?: number }>>(new Map());
  const [writes, setWrites] = useState<FieldWrite[]>([]);
  const [decided, setDecided] = useState<Set<string>>(new Set());
  const [transferYears, setTransferYears] = useState<number[]>([]);
  const [openId, setOpenIdRaw] = useState<string | null>(null);
  const setOpenId = useCallback((id: string | null) => {
    if (id && onOpenRequest) { onOpenRequest(id); return; }
    setOpenIdRaw(id);
  }, [onOpenRequest]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const load = useCallback(async () => {
    const [st, ch, se, tr] = await Promise.all([
      supabase.from('onboarding_steps').select('*').eq('client_id', client.id).in('step_type', ['tax_estimate', 'annual_return', 'info_collection', 'wealth_declaration', 'tax_file_intake']),
      supabase.from('tax_fact_changes').select('field_key, new_value, source, source_ref, status, created_at').eq('client_id', client.id).eq('status', 'accepted'),
      supabase.from('annual_report_sessions').select('id, tax_year').eq('client_id', client.id),
      api.loadTransfers(client.id).catch(() => []),
    ]);
    // ‼ tax_estimates (231) — רק כשהערכת המס באתר; אחרת הטבלה לא קיימת והקריאה נכשלת.
    const est = !AVAILABLE.taxEstimate ? { data: [] } : await supabase.from('tax_estimates').select('request_id, version, status, outputs').eq('client_id', client.id).eq('status', 'approved');
    setApprovedEst(new Map(((est.data ?? []) as { request_id: string; version: number; outputs?: { advances?: { authority: string; person: string; recommended?: number }[] } }[])
      .map(e => [e.request_id, { version: e.version, rate: e.outputs?.advances?.find(a => a.authority === 'it' && a.person === 'client')?.recommended }])));
    const all = ((st.data ?? []) as Record<string, unknown>[]).map(r => stepFromDb(r));
    setSteps(all.filter(s => s.status !== 'cancelled'));
    setCancelled(all.filter(s => s.status === 'cancelled' && s.stepType !== 'info_collection')
      .sort((a, b) => (b.createdAt ?? '').localeCompare(a.createdAt ?? '')).slice(0, 6));
    const yearOf = new Map(((se.data ?? []) as { id: string; tax_year: number }[]).map(r => [String(r.id), r.tax_year]));
    setWrites(((ch.data ?? []) as Record<string, unknown>[]).map(r => {
      const patch = ((r.new_value as { patch?: Record<string, unknown> } | null)?.patch ?? {}) as Record<string, unknown>;
      const key = String(r.field_key);
      return { fieldKey: key, value: patch[key], source: String(r.source), sessionTaxYear: r.source_ref ? yearOf.get(String(r.source_ref)) : undefined, at: String(r.created_at) };
    }));
    setDecided(new Set(tr.map(t => `${String(t.path)}:${String(t.entity_ref ?? '')}`)));
    setTransferYears([...new Set(tr.map(t => Number(t.assigned_year)).filter(Boolean))]);
  }, [client.id]);
  useEffect(() => { void load(); }, [load]);

  // ‼ 13.10.2026 (גיא): רק עבודות שנפתחו — בלי כרטיסי שנים אוטומטיים («2026» רק כי זו השנה). הוספה — אותו
  //   דיאלוג כמו ב«עבודת מס» (AddTaxWorkDialog), עם הלקוח הזה; אותה עבודה, אותם מועדים ומצב.
  const infoOf = (parent?: OnboardingStep) => parent && steps.find(s => s.stepType === 'info_collection' && (s.payload as unknown as { parentStepId?: string }).parentStepId === parent.id && s.status !== 'cancelled');
  const [adding, setAdding] = useState(false);
  // ‼ 14.10.2026 · «הסר…» — אותו חלון כמו ב«מס» וב«בקשות»; עבודה שהושלמה לא מוסרת (242)
  const [removing, setRemoving] = useState<{ id: string; title: string } | null>(null);
  const works = useMemo(() => steps
    .filter(s => s.stepType === 'annual_return' || s.stepType === 'wealth_declaration' || (s.stepType === 'tax_estimate'))
    .sort((a, b) => Number(OPEN(b)) - Number(OPEN(a))
      || String(periodKey(b)).localeCompare(String(periodKey(a)))), [steps]);

  // הערכת מס — סוג עבודה נפרד מדוח שנתי (רק כשהיא זמינה באתר)
  const startEstimate = async () => {
    setBusy(true); setMsg(null);
    const lastMonth = new Date().getMonth() === 0 ? 12 : new Date().getMonth();
    const r = await api.ensureYearRequest(client.id, 'estimate', new Date().getFullYear(), lastMonth);
    setBusy(false);
    if (!r.ok) { setMsg({ ok: false, text: `הפתיחה נכשלה (${r.error})` }); return; }
    await load(); onChanged?.(); setOpenId(r.stepId);
  };
  void transferYears;

  // ── 236 · קליטה והשלמת תיק המס: בקשה פתוחה אחת ללקוח; היסטוריה — קליטות שהושלמו ──
  const intakes = steps.filter(s => s.stepType === 'tax_file_intake').sort((a, b) => Number(OPEN(b)) - Number(OPEN(a)) || (b.createdAt ?? '').localeCompare(a.createdAt ?? ''));
  const intake = intakes[0];
  const startIntake = useCallback(async () => {
    setBusy(true); setMsg(null);
    // 252 · הפתיחה גם מכינה ומפרסמת את השאלון בדף של הלקוח — בלי מייל
    const r = await openTaxFileIntake(client);
    setBusy(false);
    if (!r.ok || !r.stepId) { setMsg({ ok: false, text: `הפתיחה נכשלה (${r.error})` }); return; }
    await load(); onChanged?.(); setOpenId(r.stepId);
  }, [client.id, load, onChanged]);
  const lastSignal = useRef(intakeSignal ?? 0);
  useEffect(() => {
    if (!intakeSignal || intakeSignal === lastSignal.current) return;
    lastSignal.current = intakeSignal;
    if (intake && OPEN(intake)) setOpenId(intake.id); else void startIntake();
  }, [intakeSignal, intake, startIntake]);

  const proposals = useMemo(() => proposeTransfers(client, writes).filter(p => !decided.has(`${p.path}:${p.entityRef ?? ''}`)), [client, writes, decided]);
  const openStep = openId ? steps.find(s => s.id === openId) : undefined;
  // חזרה מ«ידע מס» לאותו תהליך שממנו יצאו ללמוד (knowledgeLink) — פעם אחת, כשהבקשות נטענו
  useEffect(() => {
    if (!steps.length || openId) return;
    const back = consumeKnowledgeReturn(client.id);
    if (back && steps.some(s => s.id === back)) setOpenId(back);
  }, [steps, openId, client.id]);

  const stateOf = (s: OnboardingStep) => {
    const info = infoOf(s);
    if (!OPEN(s)) return { text: 'הושלם', tone: 'green' };
    if (!info) return { text: 'עוד לא הוכנו שאלות', tone: '' };
    if (info.status === 'pending') return { text: 'טיוטת שאלות — לא פורסמה', tone: '' };
    if (info.status === 'waiting_client') return { text: 'ממתין ללקוח', tone: 'blue' };
    if (info.ball === 'me' && OPEN(info)) return { text: 'יש תשובות לבדוק', tone: 'amber' };
    return { text: 'בעבודה', tone: '' };
  };
  const today = todayIso();

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '.6rem' }} data-section="works">
      {msg && <div className={msg.ok ? 'ty-ok' : 'ty-err'} role={msg.ok ? 'status' : 'alert'}>{msg.text}</div>}
      {works.length === 0
        ? <p className="ty-note" style={{ margin: 0 }}>אין דוח או הצהרה פתוחים.</p>
        : (
          <ul className="tf-works" aria-label="דוחות והצהרות">
            {works.map(w => {
              const st = stateOf(w);
              const dv = deadlineView(w);
              const ds = dueState(dv, today, OPEN(w));
              const pl = w.payload as unknown as { cutoffMonth?: number; taxYear?: number } & WealthPayload;
              const title = w.stepType === 'wealth_declaration' ? `הצהרת הון ליום ${(pl.asOfDate ?? '').split('-').reverse().join('.')}${pl.kind === 'followup' ? ' · המשך' : ''}`
                : w.stepType === 'tax_estimate' ? `הערכת מס ${pl.taxYear ?? ''}${pl.cutoffMonth ? ` · עד סוף ${MONTHS[pl.cutoffMonth]}` : ''}` : `דוח שנתי ${pl.taxYear ?? ''}`;
              return (
                <li key={w.id} className={`tf-work is-${ds}`} data-work={w.stepType}>
                  <span className="tf-work-main">
                    <b>{title}</b>
                    <small>{dv.none ? (w.stepType === 'wealth_declaration' ? 'הכנה בלי דרישה — אין מועד רשמי' : 'אין מועד רשום') : dv.short}{ds === 'overdue' ? ' · באיחור' : ''}</small>
                  </span>
                  <span className={`ty-chip ${st.tone}`}>{st.text}{approvedEst.get(w.id) ? ` · גרסה ${approvedEst.get(w.id)!.version}` : ''}</span>
                  <button type="button" className="btn btn-sm btn-ghost" onClick={() => setOpenId(w.id)} data-tf-open-work={w.id}>{onOpenRequest ? "לבקשה ←" : "פתח"}</button>
                  {OPEN(w) && <button type="button" className="btn btn-sm btn-ghost tw-remove" onClick={() => setRemoving({ id: w.id, title })} aria-label={`הסר: ${title}`} data-tf-remove>הסר…</button>}
                </li>
              );
            })}
          </ul>
        )}
      <div className="ty-actions">
        <button type="button" className="btn btn-sm btn-ghost" disabled={busy} onClick={() => setAdding(true)} data-tf-add-work>＋ הוסף דוח או הצהרת הון</button>
        {AVAILABLE.taxEstimate && !works.some(w => w.stepType === 'tax_estimate' && OPEN(w)) && (
          <button type="button" className="btn btn-sm btn-ghost" disabled={busy} onClick={() => void startEstimate()}>＋ הערכת מס {new Date().getFullYear()}</button>
        )}
      </div>
      {adding && (
        <AddTaxWorkDialog clients={[client]} steps={steps} fixedClientId={client.id} onClose={() => setAdding(false)}
          onDone={res => { void load(); onChanged?.(); if (res[0]?.stepId) { setAdding(false); setOpenId(res[0].stepId); } }} />
      )}
      {removing && (
        <RemoveWorkDialog stepId={removing.id} title={removing.title} onClose={() => setRemoving(null)}
          onDone={(_what, text) => { setRemoving(null); setMsg({ ok: true, text }); void load(); onChanged?.(); }} />
      )}
      {cancelled.length > 0 && (
        <details className="tf-cancelled" data-tf-cancelled>
          <summary>בוטלו ({cancelled.length})</summary>
          <ul className="tf-works">
            {cancelled.map(c => {
              const t = (c.payload as unknown as { title?: string }).title ?? 'עבודת מס';
              return (
                <li key={c.id} className="tf-work is-cancelled">
                  <span className="tf-work-main"><b>{t}</b><small>בוטלה — מה שהתקבל נשמר</small></span>
                  <button type="button" className="btn btn-sm btn-ghost" onClick={() => setRemoving({ id: c.id, title: t })} data-tf-restore>החזר…</button>
                </li>
              );
            })}
          </ul>
        </details>
      )}
      {proposals.length > 0 && <Transfers client={client} proposals={proposals} busy={busy} setBusy={setBusy}
        onDone={async text => { setMsg({ ok: true, text }); await load(); onChanged?.(); }} onError={text => setMsg({ ok: false, text })} />}
      {openStep && (
        <TaxYearProcess client={client} step={openStep} infoStep={infoOf(openStep)} onClientPersisted={onClientPersisted}
          onClose={() => { setOpenId(null); void load(); }} onChanged={() => { void load(); onChanged?.(); }} onRemoved={text => setMsg({ ok: true, text })} />
      )}
    </div>
  );
}

function Transfers({ client, proposals, busy, setBusy, onDone, onError }: {
  client: Client; proposals: TransferProposal[]; busy: boolean; setBusy: (b: boolean) => void;
  onDone: (text: string) => Promise<void>; onError: (text: string) => void;
}) {
  const groups = useMemo(() => {
    const m = new Map<string, TransferProposal[]>();
    for (const p of proposals) m.set(p.group, [...(m.get(p.group) ?? []), p]);
    return [...m.entries()].sort(([a], [b]) => (a === 'unknown' ? 1 : b === 'unknown' ? -1 : b.localeCompare(a)));
  }, [proposals]);
  const [except, setExcept] = useState<Set<string>>(new Set());
  const [manual, setManual] = useState<Record<string, string>>({});
  const decide = async (items: TransferProposal[], decision: 'year' | 'unknown_year', yearOf: (p: TransferProposal) => number | undefined, done: string) => {
    setBusy(true);
    const r = await api.decideTransfers(client.id, items.map(p => ({
      path: p.path, itemKey: p.itemKey, subjectRole: p.subjectRole, entityKind: p.entityKind, entityRef: p.entityRef, original: p.original,
      suggestedYear: p.suggestedYear, evidence: p.evidence, decision, year: yearOf(p),
    })));
    setBusy(false);
    if (!r.ok) { onError(`השמירה נכשלה (${r.error})`); return; }
    await onDone(done);
  };
  return (
    <div className="ty-bulk" style={{ background: 'var(--s4)' }}>
      <b style={{ fontSize: 'var(--fs-14)' }}>סכומים בכרטיס בלי שנת מס ({proposals.length})</b>
      <p className="ty-note" style={{ margin: '.25rem 0 .5rem' }}>
        עד שנקבעת שנה הם לא נכנסים לחישוב. הערך בכרטיס לא משתנה; ההחלטה נשמרת עם הראיה.
      </p>
      {groups.map(([g, list]) => {
        const year = g === 'unknown' ? null : Number(g.split(':')[1]);
        const chosen = list.filter(p => !except.has(p.key));
        return (
          <div key={g} className="ty-area">
            <h4>{year ? `שנה מוצעת: ${year} — לפי ראיה` : 'שנה לא ידועה — אין ראיה'}</h4>
            {year && <p className="ty-note" style={{ margin: '0 0 .3rem' }}>{list[0].evidence}</p>}
            <div className="ty-rows">{list.map(p => (
              <div key={p.key} className="ty-row">
                <div className="ty-main"><b>{p.label}{p.entityLabel ? ` · ${p.entityLabel}` : ''}{p.subjectRole === 'spouse' ? ' · בן/בת הזוג' : ''}</b><small>בכרטיס: {money(p.original)}</small></div>
                <div className="ty-side">
                  {year ? (
                    <label className="ty-note"><input type="checkbox" checked={!except.has(p.key)} onChange={e => setExcept(s => { const n = new Set(s); if (e.target.checked) n.delete(p.key); else n.add(p.key); return n; })} /> לכלול</label>
                  ) : (
                    <>
                      <select aria-label="המשרד יודע את השנה" value={manual[p.key] ?? ''} onChange={e => setManual(m => ({ ...m, [p.key]: e.target.value }))}>
                        <option value="">המשרד יודע את השנה?</option>
                        {[0, 1, 2, 3].map(k => new Date().getFullYear() - k).map(y => <option key={y} value={y}>{y}</option>)}
                      </select>
                      {manual[p.key] && <button type="button" className="btn btn-sm btn-ghost" disabled={busy}
                        onClick={() => void decide([p], 'year', () => Number(manual[p.key]), `נקבעה שנה ${manual[p.key]} בידי המשרד — «דווח, בלי אסמכתה»`)}>שמור</button>}
                    </>
                  )}
                </div>
              </div>))}</div>
            <div className="ty-actions" style={{ marginTop: '.4rem' }}>
              {year ? (
                <button type="button" className="btn btn-sm btn-primary" disabled={busy || chosen.length === 0}
                  onClick={() => void decide(chosen, 'year', () => year, `${chosen.length} סכומים הועברו לשנת ${year} — «דווח, בלי אסמכתה»; לדוח השנתי עדיין נדרש מסמך`)}>העבר {chosen.length} לשנת {year}</button>
              ) : (
                <button type="button" className="btn btn-sm btn-ghost" disabled={busy}
                  onClick={() => void decide(list.filter(p => !manual[p.key]), 'unknown_year', () => undefined, 'נשמר «שנה לא ידועה» — לא ייכנס לחישוב')}>סמן «שנה לא ידועה»</button>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

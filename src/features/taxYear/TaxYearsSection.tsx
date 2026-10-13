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
import type { WealthPayload } from './WealthDeclarationPanel';
import { demandView } from './wealthDemand';
import { MONTHS } from './asks';
import { proposeTransfers, type FieldWrite, type TransferProposal } from './transfer';
import TaxYearProcess from './TaxYearProcess';
import './taxYear.css';
import { AVAILABLE } from '../taxKnowledge/availability';

interface Props {
  client: Client;
  onChanged?: () => void;
  /** 236 · עדכון הכרטיס מתוך התהליך — הכרטיס המעודכן, כדי שהמסך לא יישאר ישן. */
  onClientPersisted?: (c: Client) => void;
  /** 236 · כפתור «השלמת תיק המס» בראש התיק: כל שינוי במספר פותח (או יוצר) את הקליטה. */
  intakeSignal?: number;
}

const OPEN = (s: OnboardingStep) => !['completed', 'verified', 'skipped', 'cancelled', 'failed'].includes(s.status);
const money = (n: number) => `${n.toLocaleString('he-IL')} ₪`;

export default function TaxYearsSection({ client, onChanged, onClientPersisted, intakeSignal }: Props) {
  const [steps, setSteps] = useState<OnboardingStep[]>([]);
  // ‼ 231: גרסת ההערכה המאושרת האחרונה לכל בקשה — מוצגת בכרטיס השנה (מקור אחד: tax_estimates)
  const [approvedEst, setApprovedEst] = useState<Map<string, { version: number; rate?: number }>>(new Map());
  const [writes, setWrites] = useState<FieldWrite[]>([]);
  const [decided, setDecided] = useState<Set<string>>(new Set());
  const [transferYears, setTransferYears] = useState<number[]>([]);
  const [openId, setOpenId] = useState<string | null>(null);
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
    setSteps(((st.data ?? []) as Record<string, unknown>[]).map(r => stepFromDb(r)).filter(s => s.status !== 'cancelled'));
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

  const thisYear = new Date().getFullYear();
  const years = useMemo(() => {
    const ys = new Set<number>([thisYear, thisYear - 1]);
    for (const s of steps) { if (s.stepType === 'wealth_declaration' || s.stepType === 'tax_file_intake') continue; const y = Number((s.payload as unknown as { taxYear?: number }).taxYear); if (y) ys.add(y); }
    for (const y of transferYears) ys.add(y); // שנה שקיבלה סכומים מהכרטיס
    return [...ys].sort((a, b) => b - a);
  }, [steps, thisYear, transferYears]);

  const reqOf = (y: number, type: 'tax_estimate' | 'annual_return') =>
    steps.filter(s => s.stepType === type && Number((s.payload as unknown as { taxYear?: number }).taxYear) === y)
      .sort((a, b) => Number(OPEN(b)) - Number(OPEN(a)) || (b.createdAt ?? "").localeCompare(a.createdAt ?? ""))[0];
  const infoOf = (parent?: OnboardingStep) => parent && steps.find(s => s.stepType === 'info_collection' && (s.payload as unknown as { parentStepId?: string }).parentStepId === parent.id && s.status !== 'cancelled');

  const start = async (purpose: 'estimate' | 'annual', y: number) => {
    setBusy(true); setMsg(null);
    const lastMonth = new Date().getMonth() === 0 ? 12 : new Date().getMonth();
    const r = await api.ensureYearRequest(client.id, purpose, y, purpose === 'estimate' ? lastMonth : undefined);
    setBusy(false);
    if (!r.ok) { setMsg({ ok: false, text: `הפתיחה נכשלה (${r.error})` }); return; }
    await load(); onChanged?.(); setOpenId(r.stepId);
  };

  // ── 230 · הצהרות הון: לפי יום הצהרה, לא לפי שנה ──
  const wealth = steps.filter(s => s.stepType === 'wealth_declaration')
    .sort((a, b) => String((b.payload as unknown as WealthPayload).asOfDate).localeCompare(String((a.payload as unknown as WealthPayload).asOfDate)));
  const [wDate, setWDate] = useState(`${new Date().getFullYear() - 1}-12-31`);
  const startWealth = async () => {
    setBusy(true); setMsg(null);
    const r = await api.ensureWealthDeclaration(client.id, wDate);
    setBusy(false);
    if (!r.ok) { setMsg({ ok: false, text: `הפתיחה נכשלה (${r.error})` }); return; }
    await load(); onChanged?.(); setOpenId(r.stepId);
  };

  // ── 236 · קליטה והשלמת תיק המס: בקשה פתוחה אחת ללקוח; היסטוריה — קליטות שהושלמו ──
  const intakes = steps.filter(s => s.stepType === 'tax_file_intake').sort((a, b) => Number(OPEN(b)) - Number(OPEN(a)) || (b.createdAt ?? '').localeCompare(a.createdAt ?? ''));
  const intake = intakes[0];
  const startIntake = useCallback(async () => {
    setBusy(true); setMsg(null);
    const r = await api.ensureTaxFileIntake(client.id);
    setBusy(false);
    if (!r.ok) { setMsg({ ok: false, text: `הפתיחה נכשלה (${r.error})` }); return; }
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

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '.8rem' }}>
      {msg && <div className={msg.ok ? 'ty-ok' : 'ty-err'} role={msg.ok ? 'status' : 'alert'}>{msg.text}</div>}
      <div className="ty-year wd-years" data-section="intake">
        <h4>קליטה והשלמת תיק המס</h4>
        {(() => {
          const info = infoOf(intake);
          const state = !intake ? '' : !OPEN(intake) ? `הושלמה ${(intake.completedAt ?? intake.updatedAt ?? '').slice(0, 10).split('-').reverse().join('.')}` : !info ? 'בעבודה — עוד לא נשאל דבר' : info.status === 'waiting_client' ? 'ממתין ללקוח' : info.ball === 'me' && OPEN(info) ? 'יש תשובות לבדוק' : info.status === 'pending' ? 'שאלות בטיוטה' : 'בעבודה';
          return (
            <div className="ty-line">
              <span style={{ display: 'flex', flexDirection: 'column' }}>
                <span>{intake ? state : 'פרטים קבועים, מקורות הכנסה, נכסים ומסמכים קבועים'}</span>
                <span className="ty-note">{intake ? 'מה שאושר נכנס לתיק דרך הצעה עם היסטוריה' : 'בלי לפתוח דוח שנתי: שאלות רק על מה שחסר, ומסמכים לכל מעסיק, נכס וחשבון'}</span>
              </span>
              {intake && OPEN(intake)
                ? <button type="button" className="btn btn-sm btn-ghost" onClick={() => setOpenId(intake.id)}>פתח</button>
                : <button type="button" className="btn btn-sm btn-ghost" disabled={busy} onClick={() => void startIntake()}>{intake ? 'קליטה חדשה' : 'התחל'}</button>}
            </div>
          );
        })()}
      </div>
      <div className="ty-years">
        {years.map(y => {
          const est = reqOf(y, 'tax_estimate');
          const ann = reqOf(y, 'annual_return');
          const line = (s: OnboardingStep | undefined, label: string, purpose: 'estimate' | 'annual') => {
            const info = infoOf(s);
            const pl = s?.payload as unknown as { cutoffMonth?: number } | undefined;
            const state = !s ? '' : !OPEN(s) ? 'הושלם' : !info ? 'בעבודה' : info.status === 'waiting_client' ? 'ממתין ללקוח' : info.ball === 'me' && OPEN(info) ? 'יש תשובות לבדוק' : info.status === 'pending' ? 'שאלות בטיוטה' : 'בעבודה';
            const canStart = purpose === 'estimate' ? y >= thisYear - 1 : y <= thisYear - 1;
            return (
              <div className="ty-line">
                <span style={{ display: 'flex', flexDirection: 'column' }}><span>{label}{s ? ` · ${state}` : ''}{s && approvedEst.get(s.id) ? ` · גרסה ${approvedEst.get(s.id)!.version} מאושרת` : ''}</span>{s && purpose === 'estimate' && pl?.cutoffMonth ? <span className="ty-note">נתוני אמת עד סוף {MONTHS[pl.cutoffMonth]}</span> : null}</span>
                {s ? <button type="button" className="btn btn-sm btn-ghost" onClick={() => setOpenId(s.id)}>פתח</button>
                  : canStart ? <button type="button" className="btn btn-sm btn-ghost" disabled={busy} onClick={() => void start(purpose, y)}>התחל</button> : <span className="ty-note">{purpose === 'annual' ? 'אחרי סוף השנה' : '—'}</span>}
              </div>
            );
          };
          return (
            <div key={y} className="ty-year">
              <h4>{y}{y === thisYear ? <span className="ty-chip blue">השנה</span> : null}</h4>
              {(AVAILABLE.taxEstimate || est) && line(est, 'הערכת מס', 'estimate')}
              {line(ann, 'דוח שנתי', 'annual')}
            </div>
          );
        })}
      </div>
      <div className="ty-year wd-years">
        <h4>הצהרות הון</h4>
        {wealth.length === 0 && <p className="ty-note" style={{ margin: 0 }}>אין הכנה פתוחה. אפשר להתחיל גם בלי דרישה — המועד הרשמי נרשם כשמגיע מכתב.</p>}
        {wealth.map(w => { const wp = w.payload as unknown as WealthPayload; const info = infoOf(w); return (
          <div key={w.id} className="ty-line">
            <span style={{ display: 'flex', flexDirection: 'column' }}>
              <span>ליום {(wp.asOfDate ?? '').split('-').reverse().join('.')} · {wp.kind === 'followup' ? 'המשך' : 'ראשונה'}{!OPEN(w) ? ' · הושלמה' : info?.status === 'waiting_client' ? ' · ממתין ללקוח' : info && info.ball === 'me' && OPEN(info) ? ' · יש תשובות לבדוק' : ''}</span>
              <span className="ty-note">{demandView(wp.demand).short}{wp.internalTarget ? ` · יעד פנימי ${wp.internalTarget.split('-').reverse().join('.')}` : ''}</span>
            </span>
            <button type="button" className="btn btn-sm btn-ghost" onClick={() => setOpenId(w.id)}>פתח</button>
          </div>
        ); })}
        <div className="ty-line">
          <label style={{ display: 'flex', gap: '.4rem', alignItems: 'center', flexWrap: 'wrap' }}>הכנה ליום הצהרה<input type="date" value={wDate} onChange={e => setWDate(e.target.value)} style={{ minHeight: 34 }} /></label>
          <button type="button" className="btn btn-sm btn-ghost" disabled={busy || !wDate} onClick={() => void startWealth()}>התחל הכנה</button>
        </div>
      </div>
      {proposals.length > 0 && <Transfers client={client} proposals={proposals} busy={busy} setBusy={setBusy}
        onDone={async text => { setMsg({ ok: true, text }); await load(); onChanged?.(); }} onError={text => setMsg({ ok: false, text })} />}
      {openStep && (
        <TaxYearProcess client={client} step={openStep} infoStep={infoOf(openStep)} onClientPersisted={onClientPersisted}
          onClose={() => { setOpenId(null); void load(); }} onChanged={() => { void load(); onChanged?.(); }} />
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

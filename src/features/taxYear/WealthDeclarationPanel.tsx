// ─── הכנה להצהרת הון: פרטי ההצהרה (230) ─────────────────────────────────────
// ‼ ארבעה דברים שאינם שאלות ללקוח, ושייכים להכנה עצמה:
//   1. דרישה ומועדים — מותר להכין בלי דרישה. מידע על דרישה נשמר «טרם אומת» עד שמקשרים אסמכתה
//      (מסמך בתיק או רשומה שנקראה מהרשות) — אז «מאומתת», עם מי ומתי. שלושה מועדים נפרדים:
//      בדרישה (נקרא), מחושב (המערכת, «לא לפני»), יעד פנימי (ידני, אין ברירת מחדל). wealthDemand.ts.
//   2. ההצהרה הקודמת — נשמרת כפי שהוגשה (גם אם נמצאה בה טעות). היא הבסיס להשוואה, לא לרישום.
//   3. בסיס הרישום — לפי הטופס הנוכחי. אפשרות שאינה לשון הטופס (פתוח/פרשנות) נשמרת רק עם ביסוס
//      מתועד, ועד אז לא נכנסת לחישוב. שינוי מול הקודמת = «גישור»: הסבר + מי אישר.
//      נכס שלא הוצהר בקודמת אינו שינוי בסיס — טעות מהותית, לבירור (docs/tax-foundation/wealth/professional-rules).
//   4. היסטוריה — מי שינה מה ומתי (נשמר בשרת).
// ‼ זה לא מילוי של טופס 1219 ולא חישוב השוואת הון. מדיניות משרד שלא נקבעה אינה מופעלת.

import { useEffect, useState } from 'react';
import type { Client } from '../../types';
import type { OnboardingStep } from '../../types/onboarding';
import * as api from './api';
import { ClaimTag, type ClaimStatus } from '../taxKnowledge/claim';
import { DEMAND_SOURCE_LABEL, demandView, type DemandSource, type WealthDemand } from './wealthDemand';

export interface WealthPayload {
  purpose?: 'wealth'; asOfDate?: string; kind?: 'first' | 'followup';
  demand?: WealthDemand;
  internalTarget?: string;
  previous?: { fromStepId?: string; asOfDate?: string; netWorth?: number | null; basis?: Record<string, string>; sections?: Record<string, number>; note?: string };
  basis?: Record<string, string>;
  basisJustification?: Record<string, { value: string; text: string; source?: string; at?: string }>;
  basisChanges?: { field: string; from: string; to: string; explanation: string; approvedAt: string }[];
  /** השמטה בהצהרה הקודמת — ממצא פתוח עד הכרעה כתובה; ממצא פתוח חוסם סגירה בשרת. */
  omissions?: { id: string; status: 'open' | 'resolved'; area?: string; description: string; foundAt?: string; resolution?: string; resolvedAt?: string }[];
  history?: { at: string; what: string; fields?: string[]; note?: string; kind?: string }[];
}

const he = (iso?: string) => (iso ? `${iso.slice(8, 10)}.${iso.slice(5, 7)}.${iso.slice(0, 4)}` : '');
const nis = (n?: number | null) => (n == null ? '' : `${Math.round(n).toLocaleString('he-IL')} ₪`);

/** הכותרת המשנית בדף התהליך. */
export function wealthSubtitle(p: WealthPayload): string {
  return [
    `נכון ליום ${he(p.asOfDate)}`,
    p.kind === 'followup' ? 'הצהרת המשך' : 'הצהרה ראשונה',
    demandView(p.demand).short,
    p.internalTarget ? `יעד פנימי ${he(p.internalTarget)}` : '',
  ].filter(Boolean).join(' · ');
}

const SECTIONS: { area: string; label: string }[] = [
  { area: 'wRealEstate', label: 'נדל״ן' }, { area: 'wBank', label: 'בנקים' }, { area: 'wFunds', label: 'קופות' },
  { area: 'wSecurities', label: 'ניירות ערך' }, { area: 'wLiabilities', label: 'התחייבויות' }, { area: 'wBusiness', label: 'עסקים וחברות' },
];

/** מה ידוע מההצהרה הקודמת לכל תחום — מוצג ללקוח בשאלות ההמשך. */
export function previousByArea(p: WealthPayload): Record<string, string> | undefined {
  const s = p.previous?.sections;
  if (!s) return undefined;
  return Object.fromEntries(Object.entries(s).filter(([, v]) => typeof v === 'number').map(([k, v]) => [k, nis(v)]));
}

/** בסיס הרישום — כל אפשרות עם מעמדה המקצועי (מחקר 11.10.2026). לא החלטה של המערכת.
 *  needsBasis: אפשרות שאינה לשון הטופס — נשמרת רק עם ביסוס מתועד (השרת אוכף). */
const BASIS: { key: string; label: string; options: { v: string; label: string; status: ClaimStatus; note: string; needsBasis?: boolean }[] }[] = [
  { key: 'funds', label: 'קופות, קרנות וביטוח עם חיסכון', options: [
    { v: 'allDeposits', label: 'כל ההפקדות (עובד, מעביד ופיצויים), בלי רווחים', status: 'verified', note: 'לשון הטופס: «סכום כל ההפקדות»' },
    { v: 'employeeOnly', label: 'רק חלק העובד', status: 'open', note: 'נוהג נפוץ; לא נמצא לו מקור רשמי', needsBasis: true },
    { v: 'notDecided', label: 'טרם הוכרע', status: 'open', note: 'האיסוף ממשיך; שום חישוב לא נשען על הסעיף' },
  ] },
  { key: 'businessAssets', label: 'רכוש קבוע בעסק בלי מאזן', options: [
    { v: 'cost', label: 'עלות מקורית ותאריך רכישה', status: 'verified', note: 'לשון הטופס' },
    { v: 'depreciatedCost', label: 'עלות מופחתת', status: 'open', note: 'לא לפי לשון הטופס; בהשוואה — רווח אחרי פחת', needsBasis: true },
    { v: 'notDecided', label: 'טרם הוכרע', status: 'open', note: 'האיסוף ממשיך; שום חישוב לא נשען על הסעיף' },
  ] },
  { key: 'fxBalances', label: 'יתרות בנק במטבע חוץ', options: [
    { v: 'declarationDateRate', label: 'שער יציג ביום ההצהרה', status: 'interpretation', note: 'נוהג; הטופס לא קובע שער ליתרות', needsBasis: true },
    { v: 'notDecided', label: 'טרם הוכרע', status: 'open', note: 'האיסוף ממשיך; שום חישוב לא נשען על הסעיף' },
  ] },
  { key: 'securities', label: 'ניירות ערך', options: [
    { v: 'cost', label: 'עלות לפי תדפיס המוסד', status: 'verified', note: 'בטופס החדש — עלות בלבד' },
    { v: 'marketValueOldForm', label: 'שווי שוק (טופס ישן, עד 30.6.2025)', status: 'interpretation', note: 'רק כבסיס של הצהרה קודמת' },
  ] },
];
const optLabel = (key: string, v?: string) => BASIS.find(b => b.key === key)?.options.find(o => o.v === v)?.label ?? (v ?? '—');
const optOf = (key: string, v?: string) => BASIS.find(b => b.key === key)?.options.find(o => o.v === v);

const HIST_FIELD: Record<string, string> = {
  demand: 'מידע על הדרישה', demandVerify: 'אימות הדרישה', demandExtension: 'ארכה', internalTarget: 'יעד פנימי', previous: 'הצהרה קודמת',
  basis: 'בסיס', basisChange: 'אישור שינוי בסיס', basisJustification: 'ביסוס לבסיס', omission: 'ממצא השמטה',
};

export default function WealthDeclarationPanel({ client, step, payload: p, busy, run }: {
  client: Client; step: OnboardingStep; payload: WealthPayload; busy: boolean;
  run: (fn: () => Promise<unknown>, done?: string) => Promise<boolean>;
}) {
  const d = p.demand;
  const dv = demandView(d);
  const [dm, setDm] = useState({ source: (d?.source ?? 'letter') as DemandSource, letterDate: d?.letterDate ?? '', receivedOn: d?.receivedOn ?? '', dueInLetter: d?.dueInLetter ?? '', note: d?.note ?? '' });
  const [evOpts, setEvOpts] = useState<api.DemandEvidenceOption[] | null>(null);
  const [ext, setExt] = useState({ until: d?.extension?.until ?? '', kind: (d?.extension?.kind ?? 'personal') as 'personal' | 'general', documentId: d?.extension?.documentId ?? '', note: d?.extension?.note ?? '' });
  const [ev, setEv] = useState('');
  const [target, setTarget] = useState(p.internalTarget ?? '');
  const [prev, setPrev] = useState({ asOfDate: p.previous?.asOfDate ?? '', netWorth: p.previous?.netWorth != null ? String(p.previous.netWorth) : '',
    basis: { ...(p.previous?.basis ?? {}) } as Record<string, string>, sections: Object.fromEntries(SECTIONS.map(s => [s.area, p.previous?.sections?.[s.area] != null ? String(p.previous.sections[s.area]) : ''])) as Record<string, string> });
  const [basis, setBasis] = useState<Record<string, string>>({ ...(p.basis ?? {}) });
  const [just, setJust] = useState<Record<string, { text: string; source: string }>>({});
  const [expl, setExpl] = useState('');
  const [showPrev, setShowPrev] = useState(p.kind === 'followup');
  const [omNew, setOmNew] = useState({ area: '', description: '' });
  const [omRes, setOmRes] = useState<Record<string, string>>({});
  const openOmissions = (p.omissions ?? []).filter(o => o.status === 'open');
  const save = (patch: Record<string, unknown>, done: string, note?: string) => run(() => api.updateWealthDeclaration(step.id, patch, note), done);

  // האסמכתאות נטענות כשיש דרישה (לאימות או לארכה)
  useEffect(() => {
    if (!d || evOpts) return;
    let live = true;
    void api.loadDemandEvidence(client.id).then(o => { if (live) setEvOpts(o); }).catch(() => { if (live) setEvOpts([]); });
    return () => { live = false; };
  }, [d, evOpts, client.id]);

  // שינוי מול בסיס ההצהרה הקודמת — מחייב הסבר ואישור מקצועי (השרת בודק שוב)
  const prevBasis = p.previous?.basis ?? {};
  // ‼ שינוי שכבר אושר (אותו שדה, מאותו בסיס לאותו בסיס) אינו נדרש שוב — מוצג ברשימת השינויים שאושרו
  const diffs = Object.entries(basis).filter(([k, v]) => prevBasis[k] && prevBasis[k] !== v && v !== 'notDecided' && prevBasis[k] !== 'notDecided'
    && !(p.basisChanges ?? []).some(c => c.field === k && c.from === prevBasis[k] && c.to === v));
  // אפשרות שאינה לשון הטופס — ביסוס חובה, אלא אם כבר תועד לאותו ערך
  const needJust = Object.entries(basis).filter(([k, v]) => optOf(k, v)?.needsBasis && p.basisJustification?.[k]?.value !== v);
  const justMissing = needJust.some(([k]) => !just[k]?.text.trim());
  const alignmentHint = client.capitalDeclarationRequired === true && !d;
  const evPicked = evOpts?.find(o => `${o.kind}:${o.id}` === ev);

  return (
    <section aria-labelledby="wd-panel" className="wd-panel">
      <p className="ty-label" id="wd-panel">פרטי ההצהרה</p>
      <div className="wd-chips">
        <span className="ty-chip blue">נכון ליום {he(p.asOfDate)}</span>
        <span className="ty-chip">{p.kind === 'followup' ? 'הצהרת המשך' : 'הצהרה ראשונה'}</span>
        <span className={`ty-chip ${dv.tone}`}>{dv.label}</span>
        {dv.officialDue && <span className="ty-chip green">מועד בדרישה {he(dv.officialDue)}</span>}
        {p.internalTarget && <span className="ty-chip violet">יעד פנימי {he(p.internalTarget)}</span>}
      </div>
      {openOmissions.length > 0 && <p className="ty-why wd-hint">יש {openOmissions.length === 1 ? 'ממצא השמטה פתוח' : `${openOmissions.length} ממצאי השמטה פתוחים`} בהצהרה הקודמת — לבירור רו״ח. עד הכרעה כתובה הבקשה לא תיסגר.</p>}
      {alignmentHint && <p className="ty-why wd-hint">ביישור הקו מול הרשויות סומנה «דרישה פתוחה» להצהרת הון. זו לא אסמכתה — לבדוק מול המכתב ולרשום כאן.</p>}
      <p className="ty-why" style={{ margin: 0 }}>זו הכנה ואיסוף: שאלות ללקוח, מסמכים ובדיקת המשרד. לא מילוי של טופס 1219, לא חישוב השוואת הון ולא הגשה.</p>

      <details className="ty-details">
        <summary><b>דרישה ומועדים</b><span>{dv.label}{dv.officialDue ? ` · ${he(dv.officialDue)}` : ''}{p.internalTarget ? ` · יעד ${he(p.internalTarget)}` : ''}</span></summary>
        <div className="ty-details-body wd-form">
          <dl className="wd-dates">
            <div><dt>מועד בדרישה</dt><dd>{dv.officialDue ? <>{he(dv.officialDue)} <span className="ty-note">נקרא מהאסמכתה</span></>
              : dv.reportedDue ? <>{he(dv.reportedDue)} <span className="ty-chip amber">נמסר, טרם אומת</span></>
              : d?.status === 'verified' ? <span className="ty-note">אין מועד בדרישה</span> : <span className="ty-note">אין — {d ? 'הדרישה טרם אומתה' : 'אין דרישה'}</span>}</dd></div>
            {d?.extension && <div><dt>ארכה</dt><dd>עד {he(d.extension.until)} <span className="ty-note">{d.extension.kind === 'general' ? 'ארכה כללית שפורסמה' : 'ארכה אישית'} · {d.extension.status === 'documented' ? 'מתועדת במסמך' : 'נמסרה, לא מתועדת'}{d.extension.note ? ` · ${d.extension.note}` : ''}</span></dd></div>}
            <div><dt>רצפה חוקית (בקרה)</dt><dd>{dv.computedDue ? <>{he(dv.computedDue)} <span className="ty-note">סעיף 135(1)(א): המועד בדרישה לא יכול להיות לפני 120 יום מהמאוחר מבין תאריך הדרישה ויום ההצהרה. זה לא מועד הגשה.</span></>
              : <span className="ty-note">צריך את תאריך המכתב</span>}</dd></div>
            <div><dt>יעד פנימי</dt><dd>{p.internalTarget ? he(p.internalTarget) : <span className="ty-note">לא נקבע — אין כלל משרד; בוחרים ידנית בתיק</span>}</dd></div>
          </dl>

          {dv.dueBelowFloor && <p className="ty-why wd-hint">המועד שנרשם מהדרישה מוקדם מהרצפה החוקית. לבדוק שוב את המכתב — ייתכן שהתאריך נקרא לא נכון.</p>}
          <fieldset className="wd-fs">
            <legend>מידע על הדרישה {d?.status === 'verified' ? '(שינוי יבטל את האימות)' : '(נשמר «טרם אומת»)'}</legend>
            <label>מאיפה<select value={dm.source} onChange={e => setDm({ ...dm, source: e.target.value as DemandSource })}>
              {(Object.keys(DEMAND_SOURCE_LABEL) as DemandSource[]).map(k => <option key={k} value={k}>{DEMAND_SOURCE_LABEL[k]}</option>)}
            </select></label>
            <div className="wd-grid">
              <label>תאריך המכתב<input type="date" value={dm.letterDate} onChange={e => setDm({ ...dm, letterDate: e.target.value })} /></label>
              <label>התקבל (במשרד / אצל הלקוח)<input type="date" value={dm.receivedOn} onChange={e => setDm({ ...dm, receivedOn: e.target.value })} /></label>
              <label>מועד ההגשה שכתוב בדרישה<input type="date" value={dm.dueInLetter} onChange={e => setDm({ ...dm, dueInLetter: e.target.value })} /></label>
            </div>
            <label>הערה<input value={dm.note} onChange={e => setDm({ ...dm, note: e.target.value })} placeholder="למשל: הלקוח סיפר בטלפון, המכתב עוד לא אצלנו" /></label>
            <div className="ty-actions">
              <button type="button" className="btn btn-sm btn-ghost" disabled={busy} onClick={() => void save({ demand: dm }, 'המידע על הדרישה נשמר — טרם אומת')}>שמור מידע</button>
              {d && <button type="button" className="btn btn-sm btn-ghost" disabled={busy} onClick={() => void save({ demand: null }, 'הדרישה הוסרה — הכנה בלי דרישה')}>אין דרישה</button>}
            </div>
          </fieldset>

          {d && d.status !== 'verified' && (
            <fieldset className="wd-fs">
              <legend>אימות מול אסמכתה</legend>
              {!d.letterDate && !d.receivedOn && <p className="ty-note">כדי לאמת צריך תאריך מכתב או תאריך קבלה.</p>}
              {d.unverifiedFrom && <p className="ty-note">האימות הקודם ({he(d.unverifiedFrom.slice(0, 10))}) בוטל כי המידע שונה אחריו.</p>}
              {evOpts == null ? <p className="ty-note">טוען אסמכתאות…</p> : evOpts.length === 0 ? (
                <p className="ty-note">אין בתיק מסמך או רשומה מהרשות לקשר. להעלות את המכתב ל«מסמכים» ואז לחזור לכאן; עד אז הדרישה נשארת «טרם אומתה», והאיסוף ממשיך.</p>
              ) : (
                <label>האסמכתה<select value={ev} onChange={e => setEv(e.target.value)}>
                  <option value="">— לבחור —</option>
                  {evOpts.map(o => <option key={`${o.kind}:${o.id}`} value={`${o.kind}:${o.id}`}>{o.kind === 'document' ? 'מסמך: ' : 'מהרשות: '}{o.label}{o.date ? ` · ${he(o.date)}` : ''}</option>)}
                </select></label>
              )}
              <p className="ty-note">אימות = בדקתי שהמועדים שרשמתי כתובים באסמכתה. נשמר עם שמך ותאריך.</p>
              <div className="ty-actions"><button type="button" className="btn btn-sm btn-primary" disabled={busy || !evPicked || (!d.letterDate && !d.receivedOn)}
                onClick={() => evPicked && void save({ demandVerify: evPicked.kind === 'document' ? { kind: 'document', documentId: evPicked.id, label: evPicked.label } : { kind: 'authority_record', recordId: evPicked.id, label: evPicked.label } }, 'הדרישה אומתה מול האסמכתה')}>אמת דרישה</button></div>
            </fieldset>
          )}
          {d?.status === 'verified' && (
            <p className="ty-note">אומתה ב-{he(d.verifiedAt?.slice(0, 10))} מול {d.evidence?.kind === 'document' ? 'מסמך' : 'רשומה מהרשות'}: {d.evidence?.label ?? '—'}.</p>
          )}

          {d && (
            <fieldset className="wd-fs">
              <legend>ארכה</legend>
              <p className="ty-note">רשומה נפרדת — המועד שבדרישה נשאר כפי שנקרא. ארכה כללית (שהרשות פרסמה) חלה רק אם התנאים שלה מתקיימים בתיק — לבדוק ולרשום ידנית; המערכת לא מחילה ארכות בעצמה.</p>
              <div className="wd-grid">
                <label>עד<input type="date" value={ext.until} onChange={e => setExt({ ...ext, until: e.target.value })} /></label>
                <label>סוג<select value={ext.kind} onChange={e => setExt({ ...ext, kind: e.target.value as 'personal' | 'general' })}>
                  <option value="personal">אישית — לבקשת הנישום</option><option value="general">כללית — פורסמה</option>
                </select></label>
                <label>מסמך בתיק (אם יש)<select value={ext.documentId} onChange={e => setExt({ ...ext, documentId: e.target.value })}>
                  <option value="">— בלי מסמך (לא מתועדת) —</option>
                  {(evOpts ?? []).filter(o => o.kind === 'document').map(o => <option key={o.id} value={o.id}>{o.label}{o.date ? ` · ${he(o.date)}` : ''}</option>)}
                </select></label>
              </div>
              <label>הערה<input value={ext.note} onChange={e => setExt({ ...ext, note: e.target.value })} placeholder="למשל: אושרה בטלפון ע״י פקיד השומה, 12.10" /></label>
              <div className="ty-actions">
                <button type="button" className="btn btn-sm btn-ghost" disabled={busy || !ext.until} onClick={() => void save({ demandExtension: { ...ext, documentId: ext.documentId || undefined } }, 'הארכה נרשמה')}>שמור ארכה</button>
                {d.extension && <button type="button" className="btn btn-sm btn-ghost" disabled={busy} onClick={() => void save({ demandExtension: null }, 'הארכה הוסרה')}>הסר ארכה</button>}
              </div>
            </fieldset>
          )}

          <label>יעד פנימי (של המשרד, לא מועד רשות)<input type="date" value={target} onChange={e => setTarget(e.target.value)} /></label>
          <div className="ty-actions"><button type="button" className="btn btn-sm btn-ghost" disabled={busy} onClick={() => void save({ internalTarget: target || null }, 'היעד הפנימי נשמר')}>שמור יעד</button></div>
        </div>
      </details>

      <details className="ty-details" open={showPrev && !p.previous?.netWorth ? true : undefined}>
        <summary><b>ההצהרה הקודמת</b><span>{p.previous?.asOfDate ? `ליום ${he(p.previous.asOfDate)}${p.previous.netWorth != null ? ` · הון נטו ${nis(p.previous.netWorth)}` : ''}` : p.kind === 'followup' ? 'להזין' : 'אין — הצהרה ראשונה'}</span></summary>
        <div className="ty-details-body wd-form">
          {!showPrev ? (
            <button type="button" className="btn btn-sm btn-ghost" onClick={() => setShowPrev(true)}>יש הצהרה קודמת — להזין</button>
          ) : (
            <>
              <p className="ty-note">מזינים כפי שהוגשה, גם אם נראית בה טעות. ההון נטו נרשם בהצהרה החדשה (חלק ד׳) כפי שהוצהר; תיקונים — בגישור בהשוואה, לא כאן.</p>
              <label>יום ההצהרה הקודמת<input type="date" value={prev.asOfDate} onChange={e => setPrev({ ...prev, asOfDate: e.target.value })} /></label>
              <label>הון נטו שהוצהר (שורה 800)<input inputMode="decimal" value={prev.netWorth} onChange={e => setPrev({ ...prev, netWorth: e.target.value })} /></label>
              <div className="wd-grid">{SECTIONS.map(s => (
                <label key={s.area}>{s.label}<input inputMode="decimal" value={prev.sections[s.area]} onChange={e => setPrev({ ...prev, sections: { ...prev.sections, [s.area]: e.target.value } })} /></label>
              ))}</div>
              <div className="wd-grid">{BASIS.map(b => (
                <label key={b.key}>בסיס: {b.label}<select value={prev.basis[b.key] ?? ''} onChange={e => setPrev({ ...prev, basis: { ...prev.basis, [b.key]: e.target.value } })}>
                  <option value="">לא ידוע</option>{b.options.map(o => <option key={o.v} value={o.v}>{o.label}</option>)}
                </select></label>
              ))}</div>
              <div className="ty-actions"><button type="button" className="btn btn-sm btn-primary" disabled={busy || !prev.asOfDate} onClick={() => {
                const sections = Object.fromEntries(Object.entries(prev.sections).filter(([, v]) => v.trim() !== '' && !isNaN(Number(v))).map(([k, v]) => [k, Number(v)]));
                const pb = Object.fromEntries(Object.entries(prev.basis).filter(([, v]) => v));
                void save({ previous: { asOfDate: prev.asOfDate, netWorth: prev.netWorth.trim() === '' ? null : Number(prev.netWorth), sections, basis: pb } }, 'ההצהרה הקודמת נשמרה');
              }}>שמור הצהרה קודמת</button></div>
              <fieldset className="wd-fs">
                <legend>השמטה שהתגלתה בהצהרה הקודמת</legend>
                <p className="ty-note">נכס שהיה קיים ביום ההצהרה הקודמת ולא הוצהר — זה לא «שינוי בסיס» ולא נכנס לגישור. נרשם כממצא לבירור רו״ח (ייתכן גילוי מרצון), ונסגר רק עם הכרעה כתובה.</p>
                {(p.omissions ?? []).map(o => (
                  <div key={o.id} className={o.status === 'open' ? 'wd-change' : 'wd-basis'}>
                    <strong>{o.status === 'open' ? 'פתוח' : 'הוכרע'} · {SECTIONS.find(s => s.area === o.area)?.label ?? 'כללי'}</strong>
                    <span>{o.description}</span>
                    <span className="ty-note">נרשם {he(o.foundAt?.slice(0, 10))}{o.status === 'resolved' ? ` · הוכרע ${he(o.resolvedAt?.slice(0, 10))}: ${o.resolution}` : ''}</span>
                    {o.status === 'open' && <>
                      <label>ההכרעה (מה נעשה ולמה)<textarea rows={2} value={omRes[o.id] ?? ''} onChange={e => setOmRes({ ...omRes, [o.id]: e.target.value })} /></label>
                      <div className="ty-actions"><button type="button" className="btn btn-sm btn-ghost" disabled={busy || !(omRes[o.id] ?? '').trim()} onClick={() => void save({ omission: { resolve: { id: o.id, resolution: omRes[o.id].trim() } } }, 'הממצא הוכרע ותועד')}>תעד הכרעה</button></div>
                    </>}
                  </div>
                ))}
                <div className="wd-grid">
                  <label>תחום<select value={omNew.area} onChange={e => setOmNew({ ...omNew, area: e.target.value })}>
                    <option value="">כללי</option>{SECTIONS.map(s => <option key={s.area} value={s.area}>{s.label}</option>)}
                  </select></label>
                </div>
                <label>מה לא הוצהר<textarea rows={2} value={omNew.description} onChange={e => setOmNew({ ...omNew, description: e.target.value })} placeholder="למשל: חשבון בבנק בחו״ל שהיה פתוח ביום ההצהרה הקודמת" /></label>
                <div className="ty-actions"><button type="button" className="btn btn-sm btn-ghost" disabled={busy || !omNew.description.trim()} onClick={() => void save({ omission: { add: { area: omNew.area || undefined, description: omNew.description.trim() } } }, 'הממצא נרשם — לבירור רו״ח').then(r => { if (r) setOmNew({ area: '', description: '' }); })}>רשום ממצא</button></div>
              </fieldset>
            </>
          )}
        </div>
      </details>

      <details className="ty-details">
        <summary><b>בסיס הרישום</b><span>{Object.keys(p.basis ?? {}).length ? `${Object.keys(p.basis ?? {}).length} נקבעו` : 'טרם נקבע'}{p.basisChanges?.length ? ` · ${p.basisChanges.length} שינויים מול הקודמת` : ''}</span></summary>
        <div className="ty-details-body wd-form">
          <p className="ty-note">לפי הטופס הנוכחי. הסטטוס ליד כל אפשרות הוא המעמד המקצועי שלה — לא המלצה של המערכת. אפשרות שאינה לשון הטופס נשמרת רק עם ביסוס, ועד אז לא נכנסת לשום חישוב. כלל שלא הוכרע אינו עוצר את האיסוף.</p>
          {BASIS.map(b => {
            const cur = basis[b.key] ?? '';
            const o = optOf(b.key, cur);
            const justified = p.basisJustification?.[b.key];
            const needs = !!o?.needsBasis && justified?.value !== cur;
            return (
              <div key={b.key} className="wd-basis">
                <label>{b.label}<select value={cur} onChange={e => setBasis({ ...basis, [b.key]: e.target.value })}>
                  <option value="">—</option>{b.options.filter(x => !(b.key === 'securities' && x.v === 'marketValueOldForm')).map(x => <option key={x.v} value={x.v}>{x.label}</option>)}
                </select></label>
                {o && <span className="ty-note"><ClaimTag status={o.status} /> {o.note}</span>}
                {o?.needsBasis && justified?.value === cur && <span className="ty-note">ביסוס מתועד ({he(justified.at?.slice(0, 10))}): {justified.text}{justified.source ? ` · ${justified.source}` : ''}</span>}
                {needs && (
                  <div className="wd-change">
                    <strong>{o!.status === 'open' ? 'כלל פתוח' : 'פרשנות'} — לא בחירה חופשית</strong>
                    <span className="ty-note">אין מקור רשמי לאפשרות הזו. היא נשמרת רק עם ביסוס מקצועי מתועד (נימוק ומקור), ועד אז לא נכנסת לחישוב.</span>
                    <label>הביסוס<textarea rows={2} value={just[b.key]?.text ?? ''} onChange={e => setJust({ ...just, [b.key]: { text: e.target.value, source: just[b.key]?.source ?? '' } })} /></label>
                    <label>מקור (אם יש)<input value={just[b.key]?.source ?? ''} onChange={e => setJust({ ...just, [b.key]: { text: just[b.key]?.text ?? '', source: e.target.value } })} placeholder="למשל: אישור פקיד השומה בתיק, חוות דעת" /></label>
                  </div>
                )}
                {prevBasis[b.key] && <span className="ty-note">בהצהרה הקודמת: {optLabel(b.key, prevBasis[b.key])}</span>}
              </div>
            );
          })}
          {diffs.length > 0 && (
            <div className="wd-change">
              <strong>שינוי בסיס מול ההצהרה הקודמת: {diffs.map(([k]) => BASIS.find(b => b.key === k)?.label).join(', ')}</strong>
              <p className="ty-note">ההצהרה הקודמת לא משתנה. בהשוואה מחשבים אותה מחדש לפי הבסיס הנוכחי («גישור»), ומציגים את ההפרש בנפרד — לא כמקור ולא כשימוש. נכס שלא הוצהר בקודמת אינו שינוי בסיס: זו טעות מהותית, לבירור מקצועי.</p>
              <label>הסבר לשינוי (נשמר עם שמך ותאריך)<textarea rows={2} value={expl} onChange={e => setExpl(e.target.value)} /></label>
            </div>
          )}
          <div className="ty-actions"><button type="button" className="btn btn-sm btn-primary" disabled={busy || (diffs.length > 0 && !expl.trim()) || justMissing}
            onClick={() => void save({
              basis: Object.fromEntries(Object.entries(basis).filter(([, v]) => v)),
              ...(diffs.length ? { basisChange: { explanation: expl.trim() } } : {}),
              ...(needJust.length ? { basisJustification: Object.fromEntries(needJust.map(([k]) => [k, { text: just[k]?.text.trim(), source: just[k]?.source.trim() || undefined }])) } : {}),
            }, diffs.length ? 'הבסיס נשמר; השינוי מול הקודמת אושר ותועד' : 'הבסיס נשמר')}>
            {diffs.length ? 'שמור ואשר את השינוי' : 'שמור בסיס'}</button></div>
          {(p.basisChanges ?? []).length > 0 && (
            <ul className="wd-list">{p.basisChanges!.map((c, i) => <li key={i}>{BASIS.find(b => b.key === c.field)?.label}: {optLabel(c.field, c.from)} ← {optLabel(c.field, c.to)} · {he(c.approvedAt?.slice(0, 10))} · {c.explanation}</li>)}</ul>
          )}
        </div>
      </details>

      <details className="ty-details">
        <summary><b>הגדרות משרד</b><span>תמחור בהצעות מחיר · השאר טרם נקבעו</span></summary>
        <div className="ty-details-body">
          <ul className="wd-list">
            <li><b>תמחור</b> — כבר מוגדר בשירותי המשרד (<a href="#/firm/pricing">המשרד › הצעות מחיר</a>): «הצהרת הון ראשונה», «הצהרת הון שנייה ואילך». לא מחויב מכאן.</li>
            <li><b>יעד פנימי ללקוח</b> — טרם נקבע כלל משרד. אין ברירת מחדל; בוחרים ידנית למעלה.</li>
            <li><b>תזכורות ללקוח</b> — טרם נקבעו. אין תזכורת אוטומטית; «שלח בקשות» ידני כרגיל.</li>
            <li><b>הצהרת שלמות של הלקוח (מי חותם)</b> — טרם נקבע. נוסח הטיוטה ב«ידע מס › הצהרת הון».</li>
            <li><b>השוואת הון ביוזמת המשרד</b> — טרם נקבע. המערכת לא מחשבת השוואה.</li>
          </ul>
        </div>
      </details>

      {(p.history ?? []).length > 0 && (
        <details className="ty-details">
          <summary><b>היסטוריה</b><span>{p.history!.length} רשומות</span></summary>
          <div className="ty-details-body"><ul className="wd-list">{[...p.history!].reverse().map((h, i) => (
            <li key={i}>{he(h.at?.slice(0, 10))} · {h.what === 'opened' ? `נפתחה (${h.kind === 'followup' ? 'המשך' : 'ראשונה'})` : `עודכן: ${(h.fields ?? []).map(f => HIST_FIELD[f] ?? f).join(', ')}`}{h.note ? ` · ${h.note}` : ''}</li>
          ))}</ul></div>
        </details>
      )}
    </section>
  );
}

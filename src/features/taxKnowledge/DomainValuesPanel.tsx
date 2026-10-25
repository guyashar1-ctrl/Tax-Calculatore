// ─── «ערכים לשנה» בעמוד התחום, ו«לוח מועדים» הרוחבי (15.10.2026) ─────────────────────────────
// ‼ אותו דפוס כמו «מה מבקשים מהלקוח» (ClientAsksPanel): שורה לכל קבוצה עם ספירה, נפתחת במקום. עמוד התחום נשאר סקירה קצרה.
// ‼ ערך מהמרשם מוצג עם הביסוס שלו; שורה מהטבלה הישנה — עם התגים שלה (מוקפא / לאימות) ותג העדכניות של המאגר. אין כאן אף מספר.
// ‼ לשורה ישנה יש רק 2025 ו-2026. לשנה אחרת אומרים את זה במפורש, ולא מציגים ערך של שנה אחרת כאילו הוא שלה.

import { useEffect, useRef, useState, type ReactNode, type Ref } from 'react';
import { ruleView, formatRuleValue } from '../taxRules/registry';
import { BasisTag } from './RuleBits';
import { KNOWLEDGE_TOPICS } from '../../data/taxKnowledge';
import { DEADLINE_HOME, legacyRow, legacyValueFor, valueGroupsOf, type ValueGroup, type ValueRef } from './domainValues';
import type { DomainId } from '../taxArea/areaModel';
import './learnPath.css';

const LEGACY_YEARS = [2025, 2026] as const;

function LegacyRow({ group, rowKey, year }: { group: string; rowKey: string; year: number }) {
  const v = legacyRow(group, rowKey);
  if (!v) return null;
  const cur = legacyValueFor(v, year);
  const others = LEGACY_YEARS.filter(y => y !== year);
  return (
    <li className="kn-val-row" data-value-row={`${group}.${rowKey}`}>
      <div className="kn-val-label">
        <span>{v.label}</span>
        {(v.frozen || v.needsReview) && (
          <span className="kn-ask-tags">
            {v.frozen && <span className="kn-tag">מוקפא</span>}
            {v.needsReview && <span className="kn-tag is-review">לאימות</span>}
          </span>
        )}
      </div>
      <div className="kn-val-value">
        {cur !== undefined ? <strong>{cur}</strong> : <span className="kn-muted">אין ערך ל-{year} במאגר הזה</span>}
        {others.map(y => <span key={y} className="kn-val-other">{y}: {legacyValueFor(v, y)}</span>)}
      </div>
      {(v.legalBasis || v.note) && <div className="kn-ask-meta kn-val-meta">{[v.legalBasis, v.note].filter(Boolean).join(' · ')}{v.auditSources&&<details className="aux-source"><summary>מקור ובדיקה</summary>{v.auditSources.map(s=><a key={s.url} href={s.url} target="_blank" rel="noreferrer">{s.label} ↗</a>)}<span>נבדק {v.auditCheckedAt}</span></details>}</div>}
    </li>
  );
}

function RuleRow({ id, year }: { id: string; year: number }) {
  const v = ruleView(id, year);
  if (!v) return null;
  return (
    <li className="kn-val-row" data-value-row={`rule.${id}`}>
      <div className="kn-val-label"><span>{v.rule.label}</span></div>
      <div className="kn-val-value">
        {v.entry ? <strong>{formatRuleValue(v)}</strong> : <span className="kn-muted">אין ערך</span>}
        {v.entry && <BasisTag basis={v.exactYear ? v.entry.basis : 'secondary'} label={v.exactYear ? undefined : `ערך לשנת ${v.entry.taxYear} — אין ל-${year}`} />}
      </div>
      <div className="kn-ask-meta kn-val-meta">{v.rule.law}{v.entry?.note&&<p>{v.entry.note}</p>}{v.source&&<a href={v.source.url} target="_blank" rel="noreferrer">{v.source.label} ↗</a>}{v.entry?.checkedAt&&<span>נבדק ב־{v.entry.checkedAt}</span>}</div>
    </li>
  );
}

const Row = ({ r, year }: { r: ValueRef; year: number }) =>
  r.kind === 'rule' ? <RuleRow id={r.id} year={year} /> : <LegacyRow group={r.group} rowKey={r.key} year={year} />;

interface Props {
  domain: DomainId;
  year: number;
  /** קבוצה שנפתחת מקישור (‎learn/<domain>/v/<group>‎) — פתוחה, וגוללים אליה. */
  focusGroup?: string;
  /** בורר השנה — מוצג בטלפון בלבד (במחשב הוא במסילה). */
  yearControl?: ReactNode;
}

export default function DomainValues({ domain, year, focusGroup, yearControl }: Props) {
  const groups = valueGroupsOf(domain);
  const [open, setOpen] = useState<Set<string>>(() => new Set(focusGroup ? [focusGroup] : groups.slice(0, 2).map(g => g.id)));
  const focusRef = useRef<HTMLButtonElement | null>(null);
  useEffect(() => {
    if (!focusGroup) return;
    setOpen(prev => (prev.has(focusGroup) ? prev : new Set([...prev, focusGroup])));
    // ‼ אחרי שהעמוד צויר — גוללים לקבוצה ומעבירים אליה את הפוקוס (קישור מחיפוש או מקישור ישן)
    const t = window.setTimeout(() => { focusRef.current?.scrollIntoView({ block: 'start' }); focusRef.current?.focus({ preventScroll: true }); }, 0);
    return () => window.clearTimeout(t);
  }, [focusGroup]);
  if (groups.length === 0) return null;
  const toggle = (id: string) => setOpen(prev => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  return (
    <div className="kn-asks-panel kn-values" data-values-panel={domain}>
      <div className="kn-asks-bar">
        <span className="kn-small kn-muted">ערכי {year} — תחולה, תנאים ומקור ליד הנתון. שנת הזכאות נפרדת משנת ההגשה.</span>
        {yearControl}
      </div>
      
      {groups.map(g => <Group key={g.id} g={g} year={year} isOpen={open.has(g.id)} onToggle={() => toggle(g.id)} btnRef={g.id === focusGroup ? focusRef : undefined} domain={domain} />)}
    </div>
  );
}

function Group({ g, year, isOpen, onToggle, btnRef, domain }: { g: ValueGroup; year: number; isOpen: boolean; onToggle: () => void; btnRef?: Ref<HTMLButtonElement>; domain: DomainId }) {
  const panelId = `kn-val-${domain}-${g.id}`;
  return (
    <div className={`kn-ask-area${isOpen ? ' is-open' : ''}`} data-value-group={g.id}>
      <h4 className="kn-ask-h">
        <button ref={btnRef} type="button" className="kn-ask-toggle" aria-expanded={isOpen} aria-controls={panelId} onClick={onToggle}>
          <svg className="kn-ask-chev" viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><path d="M4 6l4 4 4-4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>
          <span className="kn-ask-title">{g.title}{g.subtitle ? <small> · {g.subtitle}</small> : null}</span>
          <span className="kn-ask-n">{g.refs.length} {g.refs.length === 1 ? 'ערך' : 'ערכים'}</span>
        </button>
      </h4>
      <div id={panelId} hidden={!isOpen} className="kn-val-body">
        {g.note && <p className="kn-xs kn-val-note">{g.note}</p>}
        <ul className="kn-val-list">{g.refs.map(r => <Row key={r.kind === 'rule' ? r.id : `${r.group}.${r.key}`} r={r} year={year} />)}</ul>
        {g.insights && g.insights.length > 0 && (
          <div className="kn-val-insights">
            <strong className="kn-small">בעבודה עם לקוחות</strong>
            <ul>{g.insights.map((t, i) => <li key={i}>{t}</li>)}</ul>
          </div>
        )}
        {g.sources && g.sources.length > 0 && (
          <p className="kn-xs kn-muted kn-val-sources">מקורות: {g.sources.map((s, i) => <span key={s.url}>{i > 0 && ' · '}<a href={s.url} target="_blank" rel="noreferrer">{s.label}</a></span>)}</p>
        )}
      </div>
    </div>
  );
}

// ── לוח המועדים — כל השורות, מאותו מקור, וכל אחת עם התחום שלה ───────────────────────────
export function DeadlinesTool({ year, domainLabel, onOpenDomain }: { year: number; domainLabel: (d: DomainId) => string; onOpenDomain: (d: DomainId) => void }) {
  const group = KNOWLEDGE_TOPICS.find(t => t.id === 'deadlines');
  if (!group) return null;
  return (
    <div className="kn-asks-panel kn-values" data-deadlines>
      <UpcomingDeadlines/>
      <p className="kn-small kn-muted" style={{ margin: 0 }}>כל מועד מופיע גם בתחום שלו — לשם עוברים להסבר ולערכים הקשורים.</p>
      <ul className="kn-val-list">
        {group.values.map(v => {
          const home = DEADLINE_HOME[v.key];
          return (
            <li key={v.key} className="kn-val-row" data-deadline={v.key}>
              <div className="kn-val-label">
                <span>{v.label}</span>
                {v.needsReview && <span className="kn-ask-tags"><span className="kn-tag is-review">לאימות</span></span>}
              </div>
              <div className="kn-val-value">
                {legacyValueFor(v, year) !== undefined ? <strong>{legacyValueFor(v, year)}</strong> : <span className="kn-muted">אין ערך ל-{year} במאגר הזה</span>}
                
              </div>
              <div className="kn-ask-meta kn-val-meta">
                {v.note && <>{v.note} · </>}{v.auditSources&&<details className="aux-source"><summary>מקור ובדיקה</summary>{v.auditSources.map(s=><a key={s.url} href={s.url} target="_blank" rel="noreferrer">{s.label} ↗</a>)}</details>}
                {home && <button type="button" className="kn-link" onClick={() => onOpenDomain(home)} data-deadline-home={home}>בתחום: {domainLabel(home)}</button>}
              </div>
            </li>
          );
        })}
      </ul>
      <p className="kn-xs kn-muted kn-val-sources">מקורות: {group.sources.map((s, i) => <span key={s.url}>{i > 0 && ' · '}<a href={s.url} target="_blank" rel="noreferrer">{s.label}</a></span>)}</p>
    </div>
  );
}

const UPCOMING:{date:string;what:string;who?:string;source?:string;status?:string}[]=[{"date":"26.10.2026","what":"מע״מ מפורט (874) — ספטמבר 2026","who":"עוסקים החייבים בדוח מפורט","source":"רשות המסים, מועדי דיווח 2026 (gov.il pa151025-2; מראה efraty.com/?p=5144)","status":"verified"},{"date":"29.10.2026","what":"דוחות 2025 — מכסה ראשונה 10% (הסדר ארכות)","who":"חברות של מייצגים","source":"רשות המסים, מכתב 23.9.2026 (capitax Attachments/23092026.pdf)","status":"verified"},{"date":"15.11.2026","what":"מקדמת דמי ביטוח — אוקטובר 2026","who":"עצמאים בביטוח לאומי","source":"ב״ל, חוזר מקדמות 2024 (מקדמת חודש משולמת ב־15 בחודש שאחריו)","status":"rule"},{"date":"16.11.2026","what":"מע״מ תקופתי ומקדמות מס הכנסה — אוקטובר (דו־חודשי: ספטמבר–אוקטובר); ניכויים 102","who":"עוסקים, נישומים במקדמות, מנכים","source":"רשות המסים, מועדי דיווח 2026","status":"verified"},{"date":"23.11.2026","what":"מע״מ מפורט (874) — אוקטובר","who":"עוסקים החייבים בדוח מפורט","source":"רשות המסים, מועדי דיווח 2026","status":"verified"},{"date":"30.11.2026","what":"דוחות 2025 — מכסה 50% (הסדר ארכות)","who":"יחידים לקוחות מייצגים","source":"רשות המסים, מכתבים 28.4.2026 ו־20.8.2026 (capitax Attachments/28042026.pdf, 20082026.pdf)","status":"verified"},{"date":"15.12.2026","what":"מע״מ תקופתי ומקדמות מס הכנסה — נובמבר; מקדמת ב״ל לעצמאי — נובמבר","who":"עוסקים, נישומים במקדמות, עצמאים","source":"רשות המסים, מועדי דיווח 2026; ב״ל חוזר מקדמות 2024","status":"verified"},{"date":"16.12.2026","what":"ניכויים 102 — נובמבר","who":"מנכים/מעסיקים","source":"רשות המסים, מועדי דיווח 2026","status":"verified"},{"date":"23.12.2026","what":"מע״מ מפורט (874) — נובמבר","who":"עוסקים החייבים בדוח מפורט","source":"רשות המסים, מועדי דיווח 2026","status":"verified"},{"date":"31.12.2026","what":"דוחות 2025 — מכסה 40% (הסדר ארכות)","who":"חברות, מלכ״רים ונאמנויות של מייצגים","source":"רשות המסים, מכתבים 28.4.2026 ו־20.8.2026","status":"verified"},{"date":"31.12.2026","what":"עסק זעיר 2026: בקשת פטור מדוח והצהרת תחזית (תיאום) — במהלך שנת המס","who":"בעלי עסק זעיר (תיק 44)","source":"תקנות מס הכנסה (פטור מהגשת דין־וחשבון) התשמ״ח, תקנה 1, «הכנסה מעסק זעיר» (1)–(2)","status":"verified"},{"date":"31.12.2026","what":"הפקדות לקצבה ולקרן השתלמות שייספרו ל־2026 (לפי מועד התשלום); פנסיית חובה לשנת 2026","who":"עצמאים","source":"דע זכויותיך 2025 עמ׳ 62 («יש להפקיד … בשנת המס»)","status":"verified"},{"date":"15.1.2027","what":"מקדמת ב״ל לעצמאי — דצמבר 2026 (יום שישי)","who":"עצמאים בביטוח לאומי","source":"ב״ל, חוזר מקדמות 2024","status":"check"},{"date":"18.1.2027","what":"מע״מ תקופתי ומקדמות מס הכנסה — דצמבר (דו־חודשי: נובמבר–דצמבר); ניכויים 102","who":"עוסקים, נישומים במקדמות, מנכים","source":"רשות המסים, מועדי דיווח 2026","status":"verified"},{"date":"26.1.2027","what":"מע״מ מפורט (874) — דצמבר","who":"עוסקים החייבים בדוח מפורט","source":"רשות המסים, מועדי דיווח 2026","status":"verified"},{"date":"31.1.2027","what":"תשלום מס 10% על שכ״ד למגורים 2026 (30.1 שבת; חוק הפרשנות 10(ג)); מי ששילם מקדמות באותה שנה — לפי המקדמות","who":"משכירי דירות במסלול 10%","source":"פקודת מס הכנסה 122(א1)","status":"rule"},{"date":"31.1.2027","what":"הצהרה שנתית של עוסק פטור — 2026","who":"עוסקים פטורים","source":"הכלל שבכלי (מועדי דיווח); מקור ראשי לא נפתח בבדיקה זו","status":"check"},{"date":"15.2.2027","what":"מע״מ תקופתי ומקדמות — ינואר 2027 (ניכויים 16.2, מפורט 23.2)","who":"עוסקים, נישומים במקדמות, מנכים","source":"כלל: 15/16/23 בחודש (מועדי דיווח 2026, הערה 1); לוח 2027 טרם אומת","status":"rule"},{"date":"28.2.2027","what":"דוחות 2025 — מכסה 100% (הסדר ארכות)","who":"יחידים לקוחות מייצגים","source":"רשות המסים, מכתבים 28.4.2026 ו־20.8.2026","status":"verified"},{"date":"15.3.2027","what":"מע״מ תקופתי ומקדמות — פברואר (דו־חודשי: ינואר–פברואר); ניכויים 16.3, מפורט 23.3 (סמוך לפורים)","who":"עוסקים, נישומים במקדמות, מנכים","source":"כלל: 15/16/23 בחודש; לוח 2027 טרם אומת","status":"rule"},{"date":"31.3.2027","what":"עסק זעיר 2026: הצהרה על המחזור בפועל ותשלום (דיווח מקוצר)","who":"בעלי עסק זעיר (תיק 44)","source":"תקנות הפטור מהגשת דוח, תקנה 1, «הכנסה מעסק זעיר» (3)–(4)","status":"verified"},{"date":"31.3.2027","what":"דוחות 2025 — מכסה 100% (הסדר ארכות)","who":"חברות, מלכ״רים ונאמנויות של מייצגים","source":"רשות המסים, מכתבים 28.4.2026 ו־20.8.2026","status":"verified"},{"date":"15.4.2027","what":"מע״מ תקופתי ומקדמות — מרץ (ניכויים 16.4 שישי; מפורט 23.4 שישי, פסח) — צפוי שינוי בלוח 2027","who":"עוסקים, נישומים במקדמות, מנכים","source":"כלל: 15/16/23 בחודש; לוח 2027 טרם אומת","status":"check"}];
function UpcomingDeadlines(){const now=new Date();const t=(d:string)=>{const [dd,mm,yy]=d.split('.').map(Number);return new Date(yy,mm-1,dd)};const soon=UPCOMING.filter(u=>{const x=t(u.date);return x>=new Date(now.getFullYear(),now.getMonth(),now.getDate())&&(x.getTime()-now.getTime())/864e5<=120}).sort((a,b)=>t(a.date).getTime()-t(b.date).getTime());if(!soon.length)return null;return <section className="upcoming-deadlines" aria-label="מועדים קרובים"><h3>בקרוב · 120 הימים מהיום</h3><ul>{soon.map(u=>{const days=Math.ceil((t(u.date).getTime()-now.getTime())/864e5);return <li key={u.date+u.what}><b><bdi>{u.date.split('.').slice(0,2).join('.')}</bdi></b><span>{u.what}{u.who?<small> · {u.who}</small>:null}{u.status==='check'?<small className="to-check"> · לבדיקה</small>:null}</span><em>{days<=0?'היום':days===1?'מחר':'בעוד '+days+' ימים'}</em></li>})}</ul><p className="kn-xs kn-muted">המועדים נבדקו מול פרסומים רשמיים ב־25.10.2026. הארכה כללית או פרטנית — לפי ההודעה העדכנית.</p></section>}

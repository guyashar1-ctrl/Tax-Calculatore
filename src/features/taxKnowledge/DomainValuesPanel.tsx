// ─── «ערכים לשנה» בעמוד התחום, ו«לוח מועדים» הרוחבי (15.10.2026) ─────────────────────────────
// ‼ אותו דפוס כמו «מה מבקשים מהלקוח» (ClientAsksPanel): שורה לכל קבוצה עם ספירה, נפתחת במקום. עמוד התחום נשאר סקירה קצרה.
// ‼ ערך מהמרשם מוצג עם הביסוס שלו; שורה מהטבלה הישנה — עם התגים שלה (מוקפא / לאימות) ותג העדכניות של המאגר. אין כאן אף מספר.
// ‼ לשורה ישנה יש רק 2025 ו-2026. לשנה אחרת אומרים את זה במפורש, ולא מציגים ערך של שנה אחרת כאילו הוא שלה.

import { useEffect, useRef, useState, type ReactNode, type Ref } from 'react';
import { ruleView, formatRuleValue } from '../taxRules/registry';
import { BasisTag } from './RuleBits';
import { FreshnessBadge } from '../taxCenter/DataFreshness';
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
      {(v.legalBasis || v.note) && <div className="kn-ask-meta kn-val-meta">{[v.legalBasis, v.note].filter(Boolean).join(' · ')}</div>}
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
      {v.rule.law && <div className="kn-ask-meta kn-val-meta">{v.rule.law}</div>}
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
  const [open, setOpen] = useState<Set<string>>(() => new Set(focusGroup ? [focusGroup] : []));
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
  const hasLegacy = groups.some(g => g.refs.some(r => r.kind === 'legacy'));
  return (
    <div className="kn-asks-panel kn-values" data-values-panel={domain}>
      <div className="kn-asks-bar">
        <span className="kn-small kn-muted">ערכי {year} — לכל ערך המקור והביסוס שלו. ערך עם ● רשמי; ◐ או «לאימות» — לבדוק לפני הגשה.</span>
        {yearControl}
      </div>
      {hasLegacy && <div className="kn-val-fresh"><FreshnessBadge datasetId="topics" /></div>}
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
                {LEGACY_YEARS.filter(y => y !== year).map(y => <span key={y} className="kn-val-other">{y}: {legacyValueFor(v, y)}</span>)}
              </div>
              <div className="kn-ask-meta kn-val-meta">
                {v.note && <>{v.note} · </>}
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

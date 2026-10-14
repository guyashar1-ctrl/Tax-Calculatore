// ─── עמוד נושא ───────────────────────────────────────────────────────────────
// המסגרת המשותפת: כותרת, מה עוד פתוח (בראש, לא בתחתית), תוכן עניינים, גוף
// הנושא (שונה לכל נושא), מקורות, תחזוקה והלקוחות שהנושא נוגע להם.

import { useEffect, useMemo, useRef, useState, type ComponentType } from 'react';
import type { Client } from '../../types';
import { TOPIC_BY_ID, AREA_LABEL } from './topics';
import { weakestBasis } from '../taxRules/registry';
import { BasisTag, SourcesTable, CopyPrompt } from './RuleBits';
import type { TopicBodyProps, TocItem, TopicView } from './topics/shared';
import { QuickRead, type Lesson } from './topics/lesson';
import { PENSION_LESSON, STUDY_FUND_LESSON, WEALTH_LESSON } from './topics/lessons';
import { NI_LESSON, ADVANCES_LESSON, MANDATORY_LESSON, MICRO_LESSON } from './topics/lessonsMore';
import StudyFundBody, { STUDY_FUND_TOC } from './topics/StudyFundBody';
import PensionBody, { PENSION_TOC } from './topics/PensionBody';
import MandatoryPensionBody, { MANDATORY_TOC } from './topics/MandatoryPensionBody';
import NiBody, { NI_TOC } from './topics/NiBody';
import AdvancesBody, { ADVANCES_TOC } from './topics/AdvancesBody';
import WealthBody, { WEALTH_TOC } from './topics/WealthBody';
import MicroBusinessBody, { MICRO_TOC } from './topics/MicroBusinessBody';
import AnnualReturnBody, { ANNUAL_TOC } from './topics/AnnualReturnBody';
import Form6111Body, { FORM6111_TOC } from './topics/Form6111Body';
import { ANNUAL_LESSON, FORM6111_LESSON } from './topics/lessonsReports';
import './knowledge.css';

// ‼ נושא עם lesson מוצג בלשוניות (בקצרה · ללמוד · בתיק · מקורות). נושא בלי — ברצף, כמו קודם.
const BODIES: Record<string, { Body: ComponentType<TopicBodyProps>; toc: TocItem[]; lesson?: Lesson }> = {
  studyFund: { Body: StudyFundBody, toc: STUDY_FUND_TOC, lesson: STUDY_FUND_LESSON },
  pensionSE: { Body: PensionBody, toc: PENSION_TOC, lesson: PENSION_LESSON },
  mandatoryPension: { Body: MandatoryPensionBody, toc: MANDATORY_TOC, lesson: MANDATORY_LESSON },
  niSelfEmployed: { Body: NiBody, toc: NI_TOC, lesson: NI_LESSON },
  advances: { Body: AdvancesBody, toc: ADVANCES_TOC, lesson: ADVANCES_LESSON },
  wealth: { Body: WealthBody, toc: WEALTH_TOC, lesson: WEALTH_LESSON },
  microBusiness: { Body: MicroBusinessBody, toc: MICRO_TOC, lesson: MICRO_LESSON },
  annualReturn: { Body: AnnualReturnBody, toc: ANNUAL_TOC, lesson: ANNUAL_LESSON },
  form6111: { Body: Form6111Body, toc: FORM6111_TOC, lesson: FORM6111_LESSON },
};

export interface TopicContextClient { id: string; name: string; client: Client }

interface Props {
  topicId: string;
  year: number;
  clients?: Client[];
  /** כשנפתח מתוך תיק לקוח. */
  context?: TopicContextClient | null;
  onBackToClient?: () => void;
  onOpenClient?: (clientId: string) => void;
  onOpenTopic: (topicId: string) => void;
}

type Tab = 'quick' | TopicView | 'sources';
const TABS: { id: Tab; label: string }[] = [
  { id: 'quick', label: 'בקצרה' }, { id: 'learn', label: 'ללמוד' }, { id: 'apply', label: 'בתיק' }, { id: 'sources', label: 'מקורות' },
];

const clientName = (c: Client) => `${c.firstName ?? ''} ${c.lastName ?? ''}`.trim() || 'לקוח';

export default function TopicPage({ topicId, year, clients = [], context, onBackToClient, onOpenClient, onOpenTopic }: Props) {
  const topic = TOPIC_BY_ID[topicId];
  const entry = BODIES[topicId];
  const [onSec, setOnSec] = useState<string>('');
  const rootRef = useRef<HTMLDivElement>(null);
  const tabbed = !!entry?.lesson;
  // ‼ מתוך תיק לקוח נכנסים ל«בתיק» — שם מה שעושים עם הלקוח; אחרת «בקצרה».
  const [tab, setTab] = useState<Tab>(context ? 'apply' : 'quick');
  useEffect(() => { setTab(context ? 'apply' : 'quick'); }, [topicId, context]);

  const toc: TocItem[] = useMemo(() => {
    const all = [...(entry?.toc ?? []), { id: 'kn-sources', label: 'מקורות ותחזוקה' }];
    if (!tabbed) return all;
    if (tab === 'sources') return [{ id: 'kn-sources', label: 'מקורות ותחזוקה' }];
    if (tab === 'quick') return [];
    return all.filter(t => t.view === tab);
  }, [entry, tabbed, tab]);
  useEffect(() => {
    const secs = rootRef.current?.querySelectorAll('.kn-sec');
    if (!secs || typeof IntersectionObserver === 'undefined') return;
    const io = new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) setOnSec(e.target.id); }), { rootMargin: '-30% 0px -60% 0px' });
    secs.forEach(s => io.observe(s));
    return () => io.disconnect();
  }, [topicId, tab]);

  const touching = useMemo(() => (topic?.appliesTo ? clients.map(c => ({ c, a: topic.appliesTo!(c) })).filter(x => x.a !== 'no') : []), [clients, topic]);

  if (!topic || !entry) return <p className="kn-muted">הנושא לא נמצא.</p>;
  const { Body } = entry;
  const basis = weakestBasis(topic.ruleIds, year);
  const ctxClient = context?.client;
  const bodyCtx = ctxClient ? {
    name: context!.name,
    selfEmployedStudyFund: ctxClient.krenHashtalmutSE || undefined,
    selfEmployedPension: ctxClient.selfEmployedPensionAmount || undefined,
    mixed: ctxClient.incomeTaxType === 'both' || (ctxClient.employers ?? []).length > 0,
  } : undefined;

  const relatedRow = topic.related?.length ? (
    <div className="kn-row kn-small"><span className="kn-muted">נושאים קשורים:</span>{topic.related.map(id => TOPIC_BY_ID[id] && <button key={id} type="button" className="btn btn-secondary btn-sm" onClick={() => onOpenTopic(id)}>{TOPIC_BY_ID[id].title}</button>)}</div>
  ) : null;
  const clientsBox = topic.appliesTo ? (
      <div className="kn-box">
        <strong className="kn-small">לקוחות שהנושא עשוי לגעת בהם</strong>
        <p className="kn-xs kn-muted" style={{ margin: 0 }}>לפי מה שרשום בכרטיס. «לבדוק» = חסר מידע כדי לדעת.</p>
        {touching.length === 0 ? <span className="kn-small kn-muted">אין לקוחות כאלה ברשימה.</span> : (
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {touching.slice(0, 8).map(({ c, a }) => (
              <div key={c.id} className="kn-spread" style={{ padding: '6px 0', borderTop: '1px solid var(--hairline-2, var(--bd))' }}>
                <span className="kn-small">{clientName(c)} · <span className="kn-muted">{a === 'yes' ? 'רלוונטי' : 'לבדוק'}</span></span>
                {onOpenClient && <button type="button" className="btn btn-secondary btn-sm" onClick={() => onOpenClient(c.id)}>לתיק המס</button>}
              </div>
            ))}
            {touching.length > 8 && <span className="kn-xs kn-muted">ועוד {touching.length - 8}</span>}
          </div>
        )}
      </div>
  ) : null;

  const pickTab = (t: Tab) => {
    setTab(t);
    rootRef.current?.scrollIntoView({ block: 'start', behavior: 'auto' });
  };

  const jump = (id: string) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.scrollIntoView({ block: 'start', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
    el.focus({ preventScroll: true });
  };

  return (
    <div className={`kn-topic${toc.length === 0 ? " no-toc" : ""}`} ref={rootRef}>
      <nav className="kn-toc" aria-label="בעמוד הזה" hidden={toc.length === 0}>
        {toc.map(t => <a key={t.id} href={`#${t.id}`} className={onSec === t.id ? 'is-on' : ''} onClick={e => { e.preventDefault(); jump(t.id); }}>{t.label}</a>)}
      </nav>
      <article className="kn-page" style={{ gap: 0 }}>
        <header className="kn-head" style={{ paddingBottom: 14 }}>
          {context && (
            <div className="kn-ctx"><span><strong>נפתח מתוך התיק של {context.name}.</strong> מה שידוע בכרטיס מולא; השאר — להשלים בתיק.</span>
              {onBackToClient && <button type="button" className="btn btn-secondary btn-sm" onClick={onBackToClient}>חזרה לתיק</button>}</div>
          )}
          <div className="kn-row"><span className="kn-xs kn-muted">{AREA_LABEL[topic.area]}</span><span className={`kn-status ${topic.status}`}>{topic.status === 'usable' ? 'שמיש · עם פערים גלויים' : 'מחקר פתוח · לא סופי'}</span><BasisTag basis={basis} label={`הביסוס החלש: ${basis === 'primary' ? 'רשמי' : basis === 'derived' ? 'מחושב' : basis === 'secondary' ? 'משני' : 'לא אומת'}`} /></div>
          <h1 className="kn-title">{topic.title}</h1>
          <p className="kn-lead">{topic.lead}</p>
          <div className="kn-row kn-xs kn-muted">
            {topic.form1301.length ? <span>בטופס 1301 (2025): {topic.form1301.map(f => `חלק ${f.part}, סעיף ${f.section}`).join(' · ')}</span> : null}
            {topic.outside1301 ? <span>מחוץ לדוח: {topic.outside1301}</span> : null}
          </div>
          {/* ‼ בנושא מחקר (מקדמות, עסק זעיר) הפערים הם עיקר הידע — נשארים פתוחים לעין גם בלשוניות. */}
          {tabbed && topic.status !== 'research' ? (
            <details className="kn-gaps kn-gaps-fold">
              <summary><strong>מה עוד פתוח בנושא ({topic.gaps.length})</strong> <span className="kn-xs">— הנושא לא הושלם; פתחו לפירוט</span></summary>
              <ul>{topic.gaps.map(g => <li key={g}>{g}</li>)}</ul>
            </details>
          ) : (
            <div className="kn-gaps"><strong>מה עוד פתוח בנושא ({topic.gaps.length})</strong><ul>{topic.gaps.map(g => <li key={g}>{g}</li>)}</ul></div>
          )}
          {(!tabbed || tab === 'quick') && <div><strong className="kn-small">אחרי הנושא תוכלו:</strong><ul className="kn-outcomes">{topic.outcomes.map(o => <li key={o}>{o}</li>)}</ul></div>}
          {tabbed && (
            <div className="kn-tabs" role="tablist" aria-label="איך לקרוא את הנושא">
              {TABS.map(t => <button key={t.id} type="button" role="tab" aria-selected={tab === t.id} className={tab === t.id ? 'is-on' : ''} onClick={() => pickTab(t.id)}>{t.label}</button>)}
            </div>
          )}
        </header>

        {tabbed && tab === 'quick' && entry.lesson && <QuickRead lesson={entry.lesson} year={year} gaps={topic.gaps.length} onLearn={() => pickTab('learn')} />}
        {(!tabbed || tab === 'learn' || tab === 'apply') && <Body year={year} ctx={bodyCtx} view={tabbed ? (tab as TopicView) : undefined} />}

        {tabbed && tab === 'apply' && (clientsBox || relatedRow) && (
          <section className="kn-sec" id="kn-clients" aria-label="לקוחות ונושאים קשורים">{clientsBox}{relatedRow}</section>
        )}

        {(!tabbed || tab === 'sources') && <section className="kn-sec" id="kn-sources" aria-labelledby="kn-sources-h" tabIndex={-1}>
          <h2 id="kn-sources-h">מקורות, ביסוס ותחזוקה</h2>
          <SourcesTable ruleIds={topic.ruleIds} year={year} />
          <CopyPrompt scope={{ kind: 'topic', topicId }} label="העתק פרומפט עדכון לנושא הזה" />
          {!tabbed && relatedRow}
          {!tabbed && clientsBox}
        </section>}
      </article>
    </div>
  );
}

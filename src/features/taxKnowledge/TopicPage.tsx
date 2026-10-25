// ─── עמוד נושא ───────────────────────────────────────────────────────────────
// המסגרת המשותפת: כותרת, מצב הנושא במילים, מסלול לימוד, גוף הנושא (שונה לכל נושא),
// מקורות, תחזוקה והלקוחות שהנושא נוגע להם.
// ‼ 14.10.2026 · מסלול לימוד במקום הלשוניות «בקצרה · ללמוד · בתיק · מקורות»: מה זה → מה מבקשים מהלקוח →
//   מסמכים ומה מזינים → איך מחשבים → חריגים → מה עושים בתיק → תרגול → מקורות (learnPath.ts).
//   כל סעיף בגוף הנושא משויך לשלב; «מה מבקשים מהלקוח» נגזר מהשאלון האמיתי. אפשר לקפוץ לכל שלב, או ללכת לפי הסדר.
// ‼ תוויות הסטטוס והביסוס הקודמות הוחלפו בניסוח שאומר מה אפשר לעשות ומה לבדוק (plainStatus).

import { useEffect, useMemo, useRef, useState, type ComponentType } from 'react';
import type { Client } from '../../types';
import { TOPIC_BY_ID, AREA_LABEL } from './topics';
import { weakestBasis } from '../taxRules/registry';
import { SourcesTable, CopyPrompt } from './RuleBits';
import { SecFilter, type TopicBodyProps, type TocItem } from './topics/shared';
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
import DealerTypeBody, { DEALER_TOC, DEALER_LESSON } from './topics/DealerTypeBody';
import AnnualReturnBody, { ANNUAL_TOC } from './topics/AnnualReturnBody';
import Form6111Body, { FORM6111_TOC } from './topics/Form6111Body';
import MaternityBody, { MATERNITY_TOC, MATERNITY_LESSON } from './topics/MaternityBody';
import { ANNUAL_LESSON, FORM6111_LESSON } from './topics/lessonsReports';
import ClientAsksPanel from './ClientAsksPanel';
import { STAGES, visibleStages, clientAsksFor, documentsFor, plainStatus, stageOfSection, type Stage } from './learnPath';
import './knowledge.css';
import './learnPath.css';

const BODIES: Record<string, { Body: ComponentType<TopicBodyProps>; toc: TocItem[]; lesson?: Lesson }> = {
  studyFund: { Body: StudyFundBody, toc: STUDY_FUND_TOC, lesson: STUDY_FUND_LESSON },
  pensionSE: { Body: PensionBody, toc: PENSION_TOC, lesson: PENSION_LESSON },
  mandatoryPension: { Body: MandatoryPensionBody, toc: MANDATORY_TOC, lesson: MANDATORY_LESSON },
  niSelfEmployed: { Body: NiBody, toc: NI_TOC, lesson: NI_LESSON },
  advances: { Body: AdvancesBody, toc: ADVANCES_TOC, lesson: ADVANCES_LESSON },
  wealth: { Body: WealthBody, toc: WEALTH_TOC, lesson: WEALTH_LESSON },
  microBusiness: { Body: MicroBusinessBody, toc: MICRO_TOC, lesson: MICRO_LESSON },
  dealerType: { Body: DealerTypeBody, toc: DEALER_TOC, lesson: DEALER_LESSON },
  annualReturn: { Body: AnnualReturnBody, toc: ANNUAL_TOC, lesson: ANNUAL_LESSON },
  form6111: { Body: Form6111Body, toc: FORM6111_TOC, lesson: FORM6111_LESSON },
  maternity: { Body: MaternityBody, toc: MATERNITY_TOC, lesson: MATERNITY_LESSON },
};

export interface TopicContextClient { id: string; name: string; client: Client }

/** עבודה בתיק שהנושא משרת — לקישור «לעבודות מהסוג הזה». */
export interface TopicWorkLink { label: string; onOpen: () => void }

interface Props {
  topicId: string;
  year: number;
  clients?: Client[];
  /** כשנפתח מתוך תיק לקוח. */
  context?: TopicContextClient | null;
  onBackToClient?: () => void;
  onOpenClient?: (clientId: string) => void;
  onOpenTopic: (topicId: string) => void;
  /** «עבודות לקוחות» מהסוג שהנושא משרת — מהשלב «מה עושים בתיק». */
  workLinks?: TopicWorkLink[];
}

const clientName = (c: Client) => `${c.firstName ?? ''} ${c.lastName ?? ''}`.trim() || 'לקוח';
// ‼ 25.10.2026: השלב האחרון שנפתח בכל נושא — נוחות למשתמש בדפדפן הזה בלבד; בלי אחסון — פשוט אין «להמשיך»
const STAGE_KEY = (id: string) => `pivo.topicStage.${id}`;
const readStage = (id: string): Stage | null => { try { return (localStorage.getItem(STAGE_KEY(id)) as Stage | null) ?? null; } catch { return null; } };
const saveStage = (id: string, s: Stage) => { try { localStorage.setItem(STAGE_KEY(id), s); } catch { /* אין אחסון — אין «להמשיך» */ } };

export default function TopicPage({ topicId, year, clients = [], context, onBackToClient, onOpenClient, onOpenTopic, workLinks = [] }: Props) {
  const topic = TOPIC_BY_ID[topicId];
  const entry = BODIES[topicId];
  const [onSec, setOnSec] = useState<string>('');
  const rootRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLHeadingElement>(null);
  // ‼ מתוך תיק לקוח נכנסים ל«מה עושים בתיק» — שם מה שעושים עם הלקוח; אחרת מההתחלה.
  const [stage, setStage] = useState<Stage>(context ? 'next' : 'what');
  const [resume, setResume] = useState<Stage | null>(null);
  useEffect(() => { setStage(context ? 'next' : 'what'); setResume(context ? null : readStage(topicId)); }, [topicId, context]);
  useEffect(() => { if (!context && stage !== 'what') saveStage(topicId, stage); }, [topicId, stage, context]);

  const secStage = useMemo(() => new Map((entry?.toc ?? []).map(t => [t.id, stageOfSection(t)])), [entry]);
  const asks = useMemo(() => clientAsksFor(topicId), [topicId]);
  const docs = useMemo(() => documentsFor(topicId), [topicId]);
  const toc = useMemo(() => (entry?.toc ?? []).filter(t => secStage.get(t.id) === stage), [entry, secStage, stage]);
  const counts = useMemo(() => {
    const out = {} as Record<Stage, number>;
    for (const s of STAGES) out[s.id] = (entry?.toc ?? []).filter(t => secStage.get(t.id) === s.id).length;
    return out;
  }, [entry, secStage]);

  useEffect(() => {
    const secs = rootRef.current?.querySelectorAll('.kn-sec');
    if (!secs || typeof IntersectionObserver === 'undefined') return;
    const io = new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) setOnSec(e.target.id); }), { rootMargin: '-30% 0px -60% 0px' });
    secs.forEach(s => io.observe(s));
    return () => io.disconnect();
  }, [topicId, stage]);

  const touching = useMemo(() => (topic?.appliesTo ? clients.map(c => ({ c, a: topic.appliesTo!(c) })).filter(x => x.a !== 'no') : []), [clients, topic]);

  if (!topic || !entry) return <p className="kn-muted">הנושא לא נמצא.</p>;
  const { Body } = entry;
  const basis = weakestBasis(topic.ruleIds, year);
  const st = plainStatus(topic.status, basis, topic.gaps.length);
  const ctxClient = context?.client;
  const bodyCtx = ctxClient ? {
    name: context!.name,
    selfEmployedStudyFund: ctxClient.krenHashtalmutSE || undefined,
    selfEmployedPension: ctxClient.selfEmployedPensionAmount || undefined,
    mixed: ctxClient.incomeTaxType === 'both' || (ctxClient.employers ?? []).length > 0,
  } : undefined;

  // ‼ שלב בלי תוכן בנושא (אין מחשבון, אין תרגול) לא מוצג — לא שלב ריק במסלול
  // ‼ גיא (15.10): לא כופים שמונה שלבים — שלב מוצג רק כשיש בו תוכן אמיתי לנושא הזה
  const shown = visibleStages({ counts, asks: asks.length, gaps: topic.gaps.length, nextExtras: workLinks.length > 0 || !!topic.appliesTo });
  const idx = Math.max(0, shown.findIndex(s => s.id === stage));
  const cur = shown[idx] ?? STAGES[0];
  /** השלב שמוצג בפועל — שלב שלא קיים בנושא (למשל מקישור מהתיק) נופל לראשון. */
  const active = cur.id;
  const prev = idx > 0 ? shown[idx - 1] : undefined;
  const next = idx < shown.length - 1 ? shown[idx + 1] : undefined;
  const pick = (s: Stage) => {
    setStage(s); setResume(null);
    rootRef.current?.scrollIntoView({ block: 'start', behavior: 'auto' });
    // ‼ מעבר שלב מקלדת — הפוקוס עובר לכותרת השלב, כדי שקורא מסך ישמע איפה הוא
    requestAnimationFrame(() => {
      stageRef.current?.focus({ preventScroll: true });
      // בטלפון השלבים בשורה גוללת — השלב שנבחר נכנס לתצוגה
      rootRef.current?.querySelector(`[data-stage-btn="${s}"]`)?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    });
  };
  const jump = (id: string) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.scrollIntoView({ block: 'start', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
    el.focus({ preventScroll: true });
  };

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

  const gapsList = <ul>{topic.gaps.map(g => <li key={g}>{g}</li>)}</ul>;
  const form1301 = topic.form1301.length ? <span>בטופס 1301 (2025): {topic.form1301.map(f => `חלק ${f.part}, סעיף ${f.section}`).join(' · ')}</span> : null;

  return (
    <div className={`kn-topic${toc.length === 0 ? ' no-toc' : ''}`} ref={rootRef} data-topic={topicId} data-stage={active}>
      <nav className="kn-toc" aria-label="בשלב הזה" hidden={toc.length === 0}>
        {toc.map(t => <a key={t.id} href={`#${t.id}`} className={onSec === t.id ? 'is-on' : ''} onClick={e => { e.preventDefault(); jump(t.id); }}>{t.label}</a>)}
      </nav>
      <article className="kn-page" style={{ gap: 0 }}>
        <header className="kn-head" style={{ paddingBottom: 14 }}>
          {context && (
            <div className="kn-ctx"><span><strong>נפתח מתוך התיק של {context.name}.</strong> מה שידוע בכרטיס מולא; השאר — להשלים בתיק.</span>
              {onBackToClient && <button type="button" className="btn btn-secondary btn-sm" onClick={onBackToClient}>חזרה לתיק</button>}</div>
          )}
          <span className="kn-xs kn-muted">{AREA_LABEL[topic.area]}</span>
          <h1 className="kn-title">{topic.title}</h1>
          <p className="kn-lead">{topic.lead}</p>
          <div className={`kn-state is-${st.tone}`} data-kn-state>
            <strong>{st.label}</strong>
            <span>{st.basis}.</span>
            {topic.gaps.length > 0 && <button type="button" className="kn-link" onClick={() => pick('except')}>השאלות הפתוחות ←</button>}
          </div>
          {resume && resume !== active && shown.some(s => s.id === resume) && (
            <button type="button" className="kn-link kn-resume" onClick={() => pick(resume)} data-kn-resume={resume}>להמשיך מ«{shown.find(s => s.id === resume)!.label}» ←</button>
          )}
          <ol className="kn-path" aria-label="מסלול הלימוד">
            {shown.map((s, i) => {
              return (
                <li key={s.id}>
                  <button type="button" className={active === s.id ? 'is-on' : ''} aria-current={active === s.id ? 'step' : undefined} onClick={() => pick(s.id)} data-stage-btn={s.id}>
                    <span className="kn-path-n" aria-hidden="true">{i + 1}</span>{s.label}
                  </button>
                </li>
              );
            })}
          </ol>
        </header>

        <h2 className="kn-stage-h" tabIndex={-1} ref={stageRef}>{cur.label}<small>{cur.hint}</small></h2>

        {active === 'what' && (
          <>
            {entry.lesson && <QuickRead lesson={entry.lesson} year={year} gaps={topic.gaps.length} onLearn={() => pick('ask')} />}
            <div><strong className="kn-small">אחרי הנושא תוכלו:</strong><ul className="kn-outcomes">{topic.outcomes.map(o => <li key={o}>{o}</li>)}</ul></div>
          </>
        )}

        {active === 'ask' && (
          <section className="kn-sec kn-asks" aria-label="מה מבקשים מהלקוח">
            {asks.length === 0
              ? <p className="kn-small kn-muted">לנושא הזה אין עדיין שאלות בשאלון האיסוף. מבקשים מהלקוח ביד, לפי «מה עושים בתיק».</p>
              : <ClientAsksPanel areas={asks} level={3} idPrefix={`kn-ask-${topicId}`} startOpen={asks.length <= 2 ? 'all' : 'none'}
                  client={context ? { name: context.name, onOpen: () => onBackToClient?.() } : null} />}
          </section>
        )}

        {active === 'read' && (
          <div className="kn-box kn-read-box">
            <strong className="kn-small">המסמכים שהשאלון מבקש בנושא</strong>
            {docs.length ? <ul className="kn-small" style={{ margin: 0 }}>{docs.map(d => <li key={d}>{d}</li>)}</ul> : <span className="kn-small kn-muted">השאלון לא מבקש מסמך בנושא הזה.</span>}
            <div className="kn-row kn-xs kn-muted">{form1301}{topic.outside1301 ? <span>מחוץ לדוח: {topic.outside1301}</span> : null}</div>
          </div>
        )}

        {active === 'except' && topic.gaps.length > 0 && (
          <div className="kn-gaps" data-kn-gaps><strong>שאלות מקצועיות פתוחות ({topic.gaps.length})</strong>
            <p className="kn-xs" style={{ margin: '4px 0 0' }}>אלה לא הערות קריאה: כל אחת היא שאלה שעוד לא הוכרעה במקור רשמי, ועשויה לשנות את החישוב או את הטיפול בתיק. מה שתלוי בהן לא מחושב כאילו הוכרע.</p>{gapsList}</div>
        )}

        {active === 'calc' && <p className="kn-soft">{st.canCalc}</p>}
        {(active === 'calc' || active === 'next') && topic.gaps.length > 0 && (
          <p className="kn-gaps-note" data-kn-gaps-note>
            <strong>{topic.gaps.length === 1 ? 'שאלה מקצועית אחת פתוחה' : `${topic.gaps.length} שאלות מקצועיות פתוחות`}</strong> בנושא — הן עשויות לשנות את {active === 'calc' ? 'החישוב' : 'הטיפול בתיק'}.{' '}
            <button type="button" className="kn-link" onClick={() => pick('except')}>לפירוט ←</button>
          </p>
        )}

        {/* ‼ הגוף מוצג תמיד, והסינון לפי השלב — ב-Sec (SecFilter). כך מחשבון שבחישוב לא נעלם ממצב לימוד ולהפך. */}
        {/* ‼ גם בשלב «מקורות»: נושא שמקורותיו אינם כללים במרשם (דמי לידה) כותב אותם בסעיף משלו. */}
        {(
          <SecFilter.Provider value={id => secStage.get(id) === active}>
            <Body year={year} ctx={bodyCtx} />
          </SecFilter.Provider>
        )}

        {active === 'next' && (
          <section className="kn-sec" id="kn-clients" aria-label="עבודות ולקוחות">
            {workLinks.length > 0 && (
              <div className="kn-row kn-small"><span className="kn-muted">לעבודות בתיקים:</span>
                {workLinks.map(w => <button key={w.label} type="button" className="btn btn-secondary btn-sm" onClick={w.onOpen}>{w.label}</button>)}</div>
            )}
            {clientsBox}{relatedRow}
          </section>
        )}

        {active === 'sources' && (
          <section className="kn-sec" id="kn-sources" aria-label="מקורות, ביסוס ותחזוקה" tabIndex={-1}>
            {topic.ruleIds.length > 0 && <SourcesTable ruleIds={topic.ruleIds} year={year} />}
            <CopyPrompt scope={{ kind: 'topic', topicId }} label="העתק פרומפט עדכון לנושא הזה" />
          </section>
        )}

        {!next && shown.length > 1 && (
          <div className="kn-done" data-kn-done>
            <strong>סיימת את המסלול של «{topic.title}»</strong>
            <span className="kn-small">{shown.length} שלבים. אפשר לחזור לכל שלב מהשורה למעלה.</span>
            {shown.some(s => s.id === 'practice') && active !== 'practice' && <button type="button" className="btn btn-secondary btn-sm" onClick={() => pick('practice')}>לתרגול ←</button>}
          </div>
        )}
        <nav className="kn-path-foot" aria-label="מעבר בין שלבים">
          {prev ? <button type="button" className="btn btn-secondary" onClick={() => pick(prev.id)}>→ {prev.label}</button> : <span />}
          {next && <button type="button" className="btn btn-primary" onClick={() => pick(next.id)} data-stage-next>{next.label} ←</button>}
        </nav>
      </article>
    </div>
  );
}

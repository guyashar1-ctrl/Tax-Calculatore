// ─── עמוד נושא ───────────────────────────────────────────────────────────────
// המסגרת המשותפת: כותרת, מצב הנושא במילים, גוף הנושא (שונה לכל נושא), מקורות והלקוחות שהנושא נוגע להם.
// ‼ 26.10.2026 (ההדמיה המאושרת 25.10): שלושה מצבים לאותו נושא — «ללמוד את הנושא» (מפת יחידות, ושלב אחד בכל פעם),
//   «הסיכום המקצועי» (עמודה אחת לקריאה ולחזרה) ו«יישום בתיק» (מה עושים עם הלקוח). המצב והשלב בכתובת
//   (‎learn/<תחום>/<נושא>/<summary|שלב>‎), כך ש«אחורה» ורענון חוזרים לאותה נקודה. היחידות והשנה לכל סעיף — learnPath.ts.
// ‼ מה שהיה בשלבים הקודמים לא ירד: מצב הנושא והשאלות הפתוחות בראש; «מה מבקשים מהלקוח», המקורות והשאלות הפתוחות
//   נפתחים מכל מצב; הלקוחות שהנושא נוגע בהם והעבודות — ב«יישום בתיק».

import { useEffect, useMemo, useRef, useState, type ComponentType, type MouseEvent } from 'react';
import type { Client } from '../../types';
import Modal from '../../components/ui/Modal';
import { TOPIC_BY_ID, AREA_LABEL } from './topics';
import { weakestBasis } from '../taxRules/registry';
import { SourcesTable, CopyPrompt } from './RuleBits';
import { ClaimTag } from './claim';
import { SecFilter, type TopicBodyProps, type TocItem } from './topics/shared';
import { Txt, type Lesson } from './topics/lesson';
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
import ShaamGuide from '../shaamFiling/ShaamGuide';
import { applyStepOf, clientAsksFor, courseStepsOf, documentsFor, plainStatus, readingPeriod, stepKind, unitMinutes, learningUnitsOf, topicViewOf } from './learnPath';
import { useReadingMarks } from './readingMarks';
import { clearHighlight, markPassage, peekHighlight } from './searchHighlight';
import KnowledgeArt from './KnowledgeArt';
import { libraryEntry } from './libraryModel';
import './knowledge.css';
import './learnPath.css';

export const BODIES: Record<string, { Body: ComponentType<TopicBodyProps>; toc: TocItem[]; lesson?: Lesson }> = {
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

/** פתיחת הטופס המסומן מתוך הלימוד — הדוח או הצהרת ההון, ואם יש — על הקוד. */
export interface FormTarget { domain: 'annual' | 'wealth'; code?: string; form?: string }

interface Props {
  topicId: string;
  year: number;
  clients?: Client[];
  /** כשנפתח מתוך תיק לקוח. */
  context?: TopicContextClient | null;
  onBackToClient?: () => void;
  onOpenClient?: (clientId: string) => void;
  onOpenTopic: (topicId: string) => void;
  /** «עבודות לקוחות» מהסוג שהנושא משרת — ב«יישום בתיק». */
  workLinks?: TopicWorkLink[];
  /** המצב או השלב מהכתובת: undefined = מפת הלימוד · 'summary' · מזהה סעיף. */
  section?: string | null;
  onSection?: (section: string | null) => void;
  onOpenForm?: (target: FormTarget) => void;
}

const clientName = (c: Client) => `${c.firstName ?? ''} ${c.lastName ?? ''}`.trim() || 'לקוח';

/** «מהלימוד לסעיף» — הסעיפים בטופס שהנושא מוביל אליהם, בשלבים שעוסקים בדיווח. */
const LESSON_FORMS: Record<string, { label: string; target: (section: string) => FormTarget }[]> = {
  maternity: [{ label: 'הגמלה בדוח השנתי', target: s => ({ domain: 'annual', code: s === 'ml-field' ? '250' : '194' }) }],
  studyFund: [{ label: 'הפקדת קרן השתלמות בדוח', target: () => ({ domain: 'annual', code: '136' }) }],
  pensionSE: [{ label: 'הפקדות לקצבה בדוח', target: () => ({ domain: 'annual', code: '135' }) }],
  niSelfEmployed: [{ label: 'דמי ביטוח ששולמו בדוח', target: () => ({ domain: 'annual', code: '030' }) }],
  wealth: [{ label: '1219 — הצהרת ההון המסומנת', target: () => ({ domain: 'wealth' }) }],
  annualReturn: [{ label: '1301 — הדוח המסומן', target: () => ({ domain: 'annual' }) }],
  microBusiness: [{ label: '1301 — דיווח במסלול מלא', target: () => ({ domain: 'annual' }) }],
  form6111: [{ label: '6111 — הטופס המקורי המלא', target: () => ({ domain: 'annual', form: '6111' }) }],
};
const REPORTING_STEP = /field|116c|code|docs|do$|apply|map|ar-|f6-what|f6-who|f6-struct|f6-dict/;

type Overlay = 'sources' | 'asks' | 'gaps' | 'shaam' | null;
/** נושאים שהיישום שלהם מתחיל בשאלה מי חייב להגיש — מדריך ההפקה משע״ם נפתח מהם. */
const SHAAM_GUIDE_TOPICS = new Set(['annualReturn', 'wealth', 'microBusiness']);

export default function TopicPage({ topicId, year, clients = [], context, onBackToClient, onOpenClient, onOpenTopic, workLinks = [], section = null, onSection, onOpenForm }: Props) {
  const topic = TOPIC_BY_ID[topicId];
  const entry = BODIES[topicId];
  const toc = useMemo(() => entry?.toc ?? [], [entry]);
  const units = useMemo(() => learningUnitsOf(topicId, toc), [topicId, toc]);
  const steps = useMemo(() => courseStepsOf(topicId, toc), [topicId, toc]);
  const apply = useMemo(() => applyStepOf(toc), [toc]);
  const asks = useMemo(() => clientAsksFor(topicId), [topicId]);
  const docs = useMemo(() => documentsFor(topicId), [topicId]);
  const { done, mark, saved } = useReadingMarks(topicId, toc.map(t => t.id));
  const [overlay, setOverlay] = useState<Overlay>(null);
  const [mapOpen, setMapOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const headRef = useRef<HTMLHeadingElement>(null);
  // ‼ בלי ספק לניווט (תצוגה מוטמעת) — המצב מקומי
  const [localSection, setLocalSection] = useState<string | null>(null);
  const sec = onSection ? section : localSection;
  const go = (s: string | null) => { setMapOpen(false); if (onSection) onSection(s); else setLocalSection(s); };

  // ‼ מתוך תיק לקוח נכנסים ל«יישום בתיק» — שם מה שעושים עם הלקוח
  const hasApply = !!apply || workLinks.length > 0 || !!topic?.appliesTo;
  const { current, view } = topicViewOf(sec, !!context, hasApply, toc);

  useEffect(() => {
    // Reading a unit opens at its content. Overview modes retain the shared page header.
    if (view === 'lesson') rootRef.current?.scrollIntoView({ block: 'start', behavior: 'auto' });
    else window.scrollTo({ top: 0, behavior: 'instant' });
    requestAnimationFrame(() => headRef.current?.focus({ preventScroll: true }));
    // הגיעו מתוצאת חיפוש — הקטע עצמו מסומן
    const hit = peekHighlight();
    if (!hit) return;
    const t = window.setTimeout(() => { if (rootRef.current) markPassage(rootRef.current, hit); clearHighlight(); }, 350);
    return () => window.clearTimeout(t);
  }, [current, view]);

  const touching = useMemo(() => (topic?.appliesTo ? clients.map(c => ({ c, a: topic.appliesTo!(c) })).filter(x => x.a !== 'no') : []), [clients, topic]);

  if (!topic || !entry) return <p className="kn-muted">הנושא לא נמצא.</p>;
  const { Body, lesson } = entry;
  const presentation = libraryEntry(topicId);
  const period = readingPeriod(topicId, view === 'lesson' ? current : view, year);
  const y = period.year;
  const basis = weakestBasis(topic.ruleIds, y);
  const st = plainStatus(topic.status, basis, topic.gaps.length);
  const ctxClient = context?.client;
  const bodyCtx = ctxClient ? {
    name: context!.name,
    selfEmployedStudyFund: ctxClient.krenHashtalmutSE || undefined,
    selfEmployedPension: ctxClient.selfEmployedPensionAmount || undefined,
    mixed: ctxClient.incomeTaxType === 'both' || (ctxClient.employers ?? []).length > 0,
  } : undefined;
  const resume = steps.find(s => !done.includes(s.id)) ?? steps[0];
  const readCount = steps.filter(s => done.includes(s.id)).length;

  // ‼ קישור בתוך גוף הנושא לסעיף אחר (‎#mb-cool‎) או «לפתוח במחשבון» — עוברים לשלב, לא גוללים לסעיף שאינו מוצג
  const onBodyClick = (e: MouseEvent<HTMLDivElement>) => {
    const n = (e.target as HTMLElement).closest('a,button');
    if (!n) return;
    if (n.hasAttribute('data-wd-map-link') && onOpenForm) { e.preventDefault(); onOpenForm({ domain: 'wealth' }); return; }
    const anchor = n.getAttribute('href')?.match(/^#([a-z][a-z0-9-]*)$/i)?.[1];
    if (anchor && toc.some(t => t.id === anchor)) { e.preventDefault(); go(anchor); return; }
    if (n.tagName === 'BUTTON' && n.textContent?.trim() === 'לפתוח במחשבון') {
      const calc = toc.find(t => /מחשבון/.test(t.label));
      if (calc && calc.id !== current) { e.preventDefault(); go(calc.id); }
    }
  };

  const fixedYear = period.fixed ? <span className="kn-fixed-year" title="התוכן כאן נכתב לשנה הזו" data-kn-fixed-year={y}>שנת מס {y} · קבועה</span> : null;
  const legend = (
    <p className="kn-xs kn-muted kn-claim-legend">ללא תג — מבוסס מקור · <ClaimTag status="interpretation" /> קריאה מקצועית · <ClaimTag status="open" /> לא הוכרע — אין לחשב לפיו · <b aria-hidden="true">◇</b> חושב מהחוק, לבדוק מול פרסום · <i>(ערך 2025)</i> הסכום האחרון שנקבע · <b>המלצה:</b> הצעה מקצועית, לא כלל</p>
  );
  const contextLinks = (
    <div className="kn-calm-links" data-kn-context-links>
      <button type="button" className="kn-link" onClick={() => setOverlay('sources')} data-kn-open="sources">מקורות ותחולה</button>
      <button type="button" className="kn-link" onClick={() => setOverlay('asks')} data-kn-open="asks">מה מבקשים מהלקוח</button>
      {topic.gaps.length > 0 && <button type="button" className="kn-link" onClick={() => setOverlay('gaps')} data-kn-open="gaps">{topic.gaps.length === 1 ? 'שאלה פתוחה' : `${topic.gaps.length} שאלות פתוחות`}</button>}
      {(topic.related ?? []).some(id => TOPIC_BY_ID[id]) && (
        <details><summary>נושאים קשורים</summary>
          {topic.related!.filter(id => TOPIC_BY_ID[id]).map(id => <button key={id} type="button" className="kn-link" onClick={() => onOpenTopic(id)}>{TOPIC_BY_ID[id].title} ←</button>)}
        </details>
      )}
    </div>
  );
  const lessonForms = (s: string, always = false) => {
    const specs = onOpenForm && (always || REPORTING_STEP.test(s)) ? LESSON_FORMS[topicId] ?? [] : [];
    return specs.length ? (
      <nav className="kn-lesson-forms" aria-label="מהלימוד לסעיף">
        {specs.map(f => <button key={f.label} type="button" className="btn btn-secondary btn-sm" onClick={() => onOpenForm!(f.target(s))} data-kn-lesson-form>{f.label} ←</button>)}
      </nav>
    ) : null;
  };
  const modes = (
    <nav className="kn-modes" aria-label="אופן השימוש בנושא">
      <button type="button" aria-current={view === 'plan' || view === 'lesson' ? 'page' : undefined} onClick={() => go('plan')} data-kn-mode="learn">ללמוד את הנושא</button>
      <button type="button" aria-current={view === 'summary' ? 'page' : undefined} onClick={() => go('summary')} data-kn-mode="summary">הסיכום המקצועי</button>
      {hasApply && <button type="button" aria-current={view === 'apply' ? 'page' : undefined} onClick={() => go('apply')} data-kn-mode="apply">יישום בתיק</button>}
    </nav>
  );
  const ctxBar = context ? (
    <div className="kn-ctx"><span><strong>נפתח מתוך התיק של {context.name}.</strong> מה שידוע בכרטיס מולא; השאר — להשלים בתיק.</span>
      {onBackToClient && <button type="button" className="btn btn-secondary btn-sm" onClick={onBackToClient}>חזרה לתיק</button>}</div>
  ) : null;
  const header = (
    <header className="kn-head">
      {ctxBar}
      <div className={`kn-heading-row tone-${presentation?.hue ?? 'blue'}`}>
        <div className="kn-heading-art"><KnowledgeArt name={presentation?.icon} /></div>
        <div><p className="kl-eyeline">{AREA_LABEL[topic.area]}</p>
          <h1 className="kn-title" tabIndex={-1} ref={view === 'lesson' ? undefined : headRef}>{presentation?.name ?? topic.title}</h1>
          <p className="kn-lead">{topic.lead}</p>
        </div>
      </div>
      <div className={`kn-state is-${st.tone}`} data-kn-state>
        <strong>{st.label}</strong>
        <span>{st.basis}.</span>
        {topic.gaps.length > 0 && <button type="button" className="kn-link" onClick={() => setOverlay('gaps')}>השאלות הפתוחות ←</button>}
        {fixedYear}
      </div>
      {modes}
    </header>
  );

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
  const form1301 = topic.form1301.length ? <span>בטופס 1301 (2025): {topic.form1301.map(f => `חלק ${f.part}, סעיף ${f.section}`).join(' · ')}</span> : null;

  const overlays = overlay && (
    <Modal title={overlay === 'sources' ? 'מקורות ותחולה' : overlay === 'asks' ? 'מה מבקשים מהלקוח' : overlay === 'shaam' ? 'מי חייב להגיש ומתי — הפקת רשימות משע״ם' : 'שאלות מקצועיות פתוחות'} onClose={() => setOverlay(null)} width={720}>
      {overlay === 'shaam' && <ShaamGuide initial={topicId === 'wealth' ? 'wealth' : 'annual'} />}
      {overlay === 'sources' && (
        <div className="kn-sec" id="kn-sources">
          {topic.ruleIds.length > 0 ? <SourcesTable ruleIds={topic.ruleIds} year={y} /> : <p className="kn-small kn-muted">המקורות של הנושא כתובים בגוף הסעיפים.</p>}
          <CopyPrompt scope={{ kind: 'topic', topicId }} label="העתק פרומפט עדכון לנושא הזה" />
        </div>
      )}
      {overlay === 'asks' && (
        <div className="kn-asks">
          {asks.length === 0
            ? <p className="kn-small kn-muted">לנושא הזה אין עדיין שאלות בשאלון האיסוף. מבקשים מהלקוח ביד, לפי «יישום בתיק».</p>
            : <ClientAsksPanel areas={asks} level={3} idPrefix={`kn-ask-${topicId}`} startOpen={asks.length <= 2 ? 'all' : 'none'}
                client={context ? { name: context.name, onOpen: () => onBackToClient?.() } : null} />}
          <div className="kn-box kn-read-box">
            <strong className="kn-small">המסמכים שהשאלון מבקש בנושא</strong>
            {docs.length ? <ul className="kn-small" style={{ margin: 0 }}>{docs.map(d => <li key={d}>{d}</li>)}</ul> : <span className="kn-small kn-muted">השאלון לא מבקש מסמך בנושא הזה.</span>}
            <div className="kn-row kn-xs kn-muted">{form1301}{topic.outside1301 ? <span>מחוץ לדוח: {topic.outside1301}</span> : null}</div>
          </div>
        </div>
      )}
      {overlay === 'gaps' && (
        <div className="kn-gaps" data-kn-gaps>
          <p className="kn-xs" style={{ margin: '0 0 6px' }}>כל אחת היא שאלה שעוד לא הוכרעה במקור רשמי, ועשויה לשנות את החישוב או את הטיפול. חישוב שתלוי בה — לא כאן.</p>
          <ul>{topic.gaps.map(g => <li key={g}>{g}</li>)}</ul>
        </div>
      )}
    </Modal>
  );

  // ── «הסיכום המקצועי» — עמודה אחת לקריאה ולחזרה ──
  if (view === 'summary') {
    return (
      <div className="kn-topic kn-topic-v2" ref={rootRef} data-topic={topicId} data-view="summary">
        <article className="kn-page">
          {header}
          <section className="kn-summary" aria-label="הסיכום המקצועי">
            <h2 className="kn-stage-h">מה חשוב לדעת</h2>
            {lesson ? (
              <>
                <ol className="kn-summary-points">
                  {lesson.mustKnow.map((p, i) => <li key={i}><div><Txt text={p.text} year={y} /> <ClaimTag status={p.status} /></div></li>)}
                </ol>
                {lesson.mistakes.length > 0 && (
                  <details className="kn-summary-mistakes">
                    <summary>טעויות ונקודות שחשוב לזכור</summary>
                    {lesson.mistakes.map((m, i) => (
                      <div key={i} className="kn-summary-mistake">
                        <p className="kn-muted"><Txt text={m.wrong} year={y} /></p>
                        <p><Txt text={m.right} year={y} /> <ClaimTag status={m.status} /></p>
                      </div>
                    ))}
                  </details>
                )}
                {lesson.action && (
                  <section className="kn-summary-action">
                    <h3>איך זה פוגש את תיק הלקוח?</h3>
                    <p><Txt text={lesson.action.text} year={y} /> <ClaimTag status={lesson.action.status} /></p>
                    {onOpenForm && <button type="button" className="btn btn-secondary btn-sm" onClick={() => onOpenForm({ domain: topicId === 'wealth' ? 'wealth' : 'annual' })}>לסעיפים בטופס ←</button>}
                  </section>
                )}
              </>
            ) : <p className="kn-small kn-muted">לנושא הזה אין עדיין סיכום — הלימוד המלא במפת הלימוד.</p>}
            {legend}
            <p><button type="button" className="btn btn-primary" onClick={() => go('plan')}>ללמוד את הנושא ←</button></p>
            {contextLinks}
          </section>
        </article>
        {overlays}
      </div>
    );
  }

  // ── «יישום בתיק» — מה עושים עם הלקוח ──
  if (view === 'apply') {
    const applyDone = apply ? done.includes(apply.id) : false;
    return (
      <div className="kn-topic kn-topic-v2" ref={rootRef} data-topic={topicId} data-view="apply">
        <article className="kn-page">
          {header}
          {apply && (
            <section className="kn-apply" aria-label={apply.label}>
              <h2 className="kn-stage-h">{apply.label}</h2>
              <div className="kn-lesson-body is-one" onClick={onBodyClick}>
                <SecFilter.Provider value={id => id === apply.id}><Body year={y} ctx={bodyCtx} /></SecFilter.Provider>
              </div>
              {lessonForms(apply.id, true)}
              {SHAAM_GUIDE_TOPICS.has(topicId) && <p><button type="button" className="kn-link" onClick={() => setOverlay('shaam')} data-kn-shaam-guide>מי חייב להגיש ומתי? הפקת רשימות משע״ם ←</button></p>}
              <div className="kn-read-mark">
                <button type="button" className="btn btn-secondary btn-sm" aria-pressed={applyDone} onClick={() => mark(apply.id, !applyDone)} data-kn-mark>{applyDone ? '✓ נקרא · ביטול הסימון' : 'לסמן כנקרא'}</button>
                {!saved && <span className="kn-xs kn-muted" role="status">הסימון לא נשמר בדפדפן הזה.</span>}
              </div>
            </section>
          )}
          {topic.gaps.length > 0 && <p className="kn-gaps-note" data-kn-gaps-note><strong>{topic.gaps.length === 1 ? 'שאלה מקצועית אחת פתוחה' : `${topic.gaps.length} שאלות מקצועיות פתוחות`}</strong> בנושא — הן עשויות לשנות את הטיפול בתיק. <button type="button" className="kn-link" onClick={() => setOverlay('gaps')}>לפירוט ←</button></p>}
          {(workLinks.length > 0 || clientsBox) && (
            <section className="kn-sec" id="kn-clients" aria-label="עבודות ולקוחות">
              {workLinks.length > 0 && (
                <div className="kn-row kn-small"><span className="kn-muted">לעבודות בתיקים:</span>
                  {workLinks.map(w => <button key={w.label} type="button" className="btn btn-secondary btn-sm" onClick={w.onOpen}>{w.label}</button>)}</div>
              )}
              {clientsBox}
            </section>
          )}
          <nav className="kn-path-foot" aria-label="מעבר">
            <button type="button" className="btn btn-secondary" onClick={() => go('plan')}>→ ללמוד את הנושא</button>
            <button type="button" className="btn btn-secondary" onClick={() => go('summary')}>הסיכום המקצועי</button>
          </nav>
          {legend}
          {contextLinks}
        </article>
        {overlays}
      </div>
    );
  }

  // ── שלב אחד בכל פעם ──
  if (view === 'lesson' && current) {
    const at = steps.findIndex(s => s.id === current);
    const ui = Math.max(0, units.findIndex(u => u.ids.includes(current)));
    const unit = units[ui];
    const stepIdx = unit.ids.indexOf(current);
    const item = toc.find(t => t.id === current)!;
    const prevStep = at > 0 ? steps[at - 1] : undefined;
    const nextStep = at >= 0 && at < steps.length - 1 ? steps[at + 1] : undefined;
    const last = at === steps.length - 1;
    const label = (id: string) => toc.find(t => t.id === id)?.label ?? id;
    const unitSteps = (
      <ol className="kn-unit-steps">
        {unit.ids.map((id, i) => (
          <li key={id}><button type="button" aria-current={id === current ? 'step' : undefined} onClick={() => go(id)} data-kn-step={id}>
            <span aria-label={done.includes(id) ? 'נקרא' : undefined}>{done.includes(id) ? '✓' : i + 1}</span>{label(id)}
          </button></li>
        ))}
      </ol>
    );
    return (
      <div className="kn-topic kn-topic-v2" ref={rootRef} data-topic={topicId} data-view="lesson" data-section={current}>
        <div className="kn-lesson-grid">
          <aside className="kn-unit-compass" aria-label="מפת היחידה">
            <button type="button" className="kn-link" onClick={() => go('plan')}>→ מפת הלימוד</button>
            <p className="kn-xs kn-muted">יחידה {ui + 1} מתוך {units.length}</p>
            <h2 className="kn-unit-name">{unit.name}</h2>
            {unitSteps}
            <details><summary>כל היחידות בנושא</summary>
              {units.map((u, i) => <button key={u.name} type="button" className="kn-link" onClick={() => go(u.ids.find(id => !done.includes(id)) ?? u.ids[0])}>{i + 1}. {u.name}</button>)}
            </details>
            <button type="button" className="kn-link" onClick={() => go('summary')}>הסיכום המקצועי ←</button>
          </aside>
          <article className="kn-page kn-lesson">
            {ctxBar}
            <div className="kn-lesson-top">
              <span className="kn-xs kn-muted">{topic.title}</span>
              {modes}
            </div>
            <div className="kn-lesson-line">
              <button type="button" className="kn-link kn-unit-toggle" aria-expanded={mapOpen} onClick={() => setMapOpen(o => !o)}>מפת היחידה {mapOpen ? '▴' : '▾'}</button>
              <span className="kn-xs kn-muted">שלב {stepIdx + 1} מתוך {unit.ids.length}</span>
              {fixedYear}
            </div>
            {mapOpen && <nav className="kn-unit-map" aria-label="שלבי היחידה"><button type="button" className="kn-link" onClick={() => go('plan')}>→ כל היחידות בנושא</button>{unitSteps}</nav>}
            <div className="kn-dots" aria-label={`שלב ${stepIdx + 1} מתוך ${unit.ids.length}`}>
              {unit.ids.map(id => <button key={id} type="button" aria-label={label(id)} aria-current={id === current ? 'step' : undefined} className={id === current ? 'is-current' : done.includes(id) ? 'is-read' : ''} onClick={() => go(id)} />)}
            </div>
            <p className="kn-xs kn-eyebrow">{stepKind(item) !== item.label ? `${stepKind(item)} · ` : ''}{unit.name}</p>
            <h1 className="kn-title kn-lesson-h" tabIndex={-1} ref={headRef}>{item.label}</h1>
            <div className="kn-lesson-body is-one" onClick={onBodyClick}>
              <SecFilter.Provider value={id => id === current}><Body year={y} ctx={bodyCtx} /></SecFilter.Provider>
            </div>
            {lessonForms(current)}
            {last && (
              <section className="kn-done" data-kn-done>
                <strong>{readCount >= steps.length - 1 ? 'סיימת את המסלול' : 'זה השלב האחרון'}</strong>
                {hasApply && <button type="button" className="btn btn-primary btn-sm" onClick={() => { mark(current); go('apply'); }}>יישום בתיק ←</button>}
                <button type="button" className="btn btn-secondary btn-sm" onClick={() => { mark(current); go('summary'); }}>הסיכום המקצועי</button>
              </section>
            )}
            <nav className="kn-path-foot" aria-label="מעבר בין שלבים">
              <button type="button" className="btn btn-secondary" onClick={() => go(prevStep ? prevStep.id : 'plan')}>→ {prevStep ? 'השלב הקודם' : 'מפת הלימוד'}</button>
              {nextStep && <button type="button" className="btn btn-primary" onClick={() => { mark(current); go(nextStep.id); }} data-stage-next>{stepIdx === unit.ids.length - 1 ? 'ליחידה הבאה' : 'לשלב הבא'} ←</button>}
            </nav>
            {legend}
            {contextLinks}
          </article>
        </div>
        {overlays}
      </div>
    );
  }

  // ── מפת הלימוד ──
  return (
    <div className="kn-topic kn-topic-v2" ref={rootRef} data-topic={topicId} data-view="plan">
      <article className="kn-page">
        {header}
        {lesson?.mustKnow[0] && (
          <div className="kn-brief" data-kn-brief>
            <p className="kn-xs kn-eyebrow">בקצרה</p>
            <p><Txt text={lesson.mustKnow[0].text} year={y} /></p>
            <button type="button" className="kn-link" onClick={() => go('summary')}>הסיכום המלא ←</button>
          </div>
        )}
        <div className="kn-course">
          <section aria-labelledby={`kn-units-${topicId}`}>
            <div className="kn-course-head">
              <h2 className="kn-stage-h" id={`kn-units-${topicId}`}>הדרך להבנת הנושא</h2>
              <span className="kn-xs kn-muted">{readCount} מתוך {steps.length} שלבים נקראו</span>
            </div>
            <ol className="kn-units">
              {units.map((u, i) => {
                const read = u.ids.filter(id => done.includes(id)).length;
                return (
                  <li key={u.name}>
                    <button type="button" className="kn-unit" onClick={() => go(u.ids.find(id => !done.includes(id) && id !== apply?.id) ?? u.ids[0])} data-kn-unit={i + 1}>
                      <span className="kn-unit-i" aria-hidden="true">{i + 1}</span>
                      <span className="kn-unit-body">
                        <b>{u.name}</b>
                        <span className="kn-xs kn-muted">{u.ids.map(id => toc.find(t => t.id === id)?.label).join(' · ')}</span>
                        <span className="kn-xs kn-muted">{u.ids.length === 1 ? 'שלב אחד' : `${u.ids.length} שלבים`} · {unitMinutes(u.ids.length)}{read ? ` · ${read} נקראו` : ''}</span>
                      </span>
                      <span aria-hidden="true">←</span>
                    </button>
                  </li>
                );
              })}
            </ol>
            <p className="kn-xs kn-muted">הזמן משוער. «נקרא» שומר את המקום שלך בדפדפן הזה — בלי ציון.</p>
            {contextLinks}
          </section>
          <aside className="kn-course-start">
            <h2 className="kn-stage-h">בסוף המסלול תוכלו</h2>
            <ul className="kn-outcomes">{topic.outcomes.map(o => <li key={o}>{o}</li>)}</ul>
            {resume && <button type="button" className="btn btn-primary" onClick={() => go(resume.id)} data-kn-resume={resume.id}>{readCount === steps.length ? 'לקרוא שוב מההתחלה' : readCount ? 'ממשיכים מהמקום הבא' : 'מתחילים ביחידה הראשונה'} ←</button>}
            {readCount > 0 && readCount < steps.length && resume && <p className="kn-xs kn-muted">{resume.label}</p>}
            <button type="button" className="kn-link" onClick={() => go('summary')}>צריך כרגע רק את הסיכום? ←</button>
            {st.canCalc && <p className="kn-xs kn-muted">{st.canCalc}</p>}
          </aside>
        </div>
      </article>
      {overlays}
    </div>
  );
}

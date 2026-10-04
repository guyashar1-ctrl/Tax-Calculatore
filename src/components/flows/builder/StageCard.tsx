// שלב אחד במפת המסלול — סיכום, לא טופס: למי (ענף), מה קורה בו, מה מגיע ללקוח,
// ואז הפריטים לפי התנאי שלהם. כל העריכה של השלב — ב«עריכת השלב» (StageSheet);
// פריט — בלחיצה עליו (ItemSheet).
// ‼ ארבעה פעלים נפרדים ולא ממוזגים בניסוח: פתיחה (הבקשה קיימת) · פרסום
// (מופיעה בדף) · מייל (אחד מרוכז, רק מה שחדש) · פעולה מול רשות.
import { useState, type ReactElement } from 'react';
import type { FlowIssue } from '../../../features/flows/compile';
import { onlyPhrase, whenParts, type Verdict } from '../../../features/flows/conditions';
import { groupStageItems, itemConditionParts, type ItemNode } from '../../../features/flows/preview';
import type { FlowItem, FlowStage, FlowTrigger } from '../../../features/flows/types';
import { DELIVERY_LABELS } from '../../../features/flows/types';
import type { RequestTemplate } from '../../../lib/requestTemplates';
import { ACTOR_ICON, FlIcon } from './ui';
import { ACTOR_LABELS, countsText, itemActor, perPersonTag, reachesClient, stageCounts, type PersonalConfirm } from './model';

/** שלב ארוך מציג את הראשונים, וה«עוד» נפתח לפי צורך. */
const SHOW_FIRST = 6;

export default function StageCard({ trigger, stage, title, titleOf, templates, verdict, stageVerdict, lensActive, lensLabel,
  notCreated, issues, flash, mixedAutoMail, personalConfirm, onOpenItem, onOpenStage, onAdd }: {
  trigger: FlowTrigger;
  stage: FlowStage;
  title: (i: FlowItem) => string;
  /** שם פריט לפי המפתח — ל«אחרי «X»» כשהפריט שמחכים לו בקבוצה אחרת. */
  titleOf: (itemKey: string) => string;
  templates: RequestTemplate[];
  verdict: (i: FlowItem) => Verdict;
  stageVerdict: Verdict;
  /** נבחר סוג לקוח / לקוח לדוגמה — רק אז מעמעמים. */
  lensActive: boolean;
  lensLabel: string;
  /** פריטים שהשרת לא ייצור (פגם בספרייה), עם הסיבה. */
  notCreated: ReadonlyMap<string, string>;
  issues: FlowIssue[];
  flash?: boolean;
  /** שלב «מייל אוטומטי» ברגע שיש בו גם מייל שמחכה במגש — אלה שני מיילים. */
  mixedAutoMail?: boolean;
  /**
   * ‼ «גם לבן/בת הזוג» על בקשה עם אישור אישי — לבן/בת הזוג נפתחת משימה אליך, והיא מחזיקה
   * את השלב (215: _flow_gate_steps). בלי זה הכרטיס הראה «1 ללקוח» בלבד.
   */
  personalConfirm?: (i: FlowItem) => PersonalConfirm;
  onOpenItem: (itemKey: string) => void;
  onOpenStage: () => void;
  onAdd: () => void;
}) {
  const onboarding = trigger === 'quote_approved';
  const [more, setMore] = useState(false);
  const off = (i: FlowItem) => notCreated.has(i.key) || (lensActive && verdict(i).state === 'off');
  const stageOff = lensActive && stageVerdict.state === 'off';
  const allOff = !stageOff && stage.items.length > 0 && stage.items.every(off);
  // ‼ שלב שכולו לא נפתח לסוג הזה — הסיכום מתאר את השלב עצמו (הוא מעומעם עם הסיבה), לא «אין כלום».
  const countSkip = stageOff || allOff ? (i: FlowItem) => notCreated.has(i.key) : off;
  const counts = stageCounts(stage, templates, countSkip);
  const anyClient = stage.items.some(i => !countSkip(i) && reachesClient(itemActor(i, templates)));
  // ‼ ב«כולם» — «4 ללקוח» כששניים מהם רק לחלק מהלקוחות נקרא כאילו כל לקוח מקבל 4.
  const conditionalClient = lensActive ? 0 : stage.items.filter(i => !countSkip(i)
    && reachesClient(itemActor(i, templates)) && itemConditionParts(i, onboarding).length > 0).length;
  // ‼ אישור אישי של בן/בת הזוג — משימה אליך שמחזיקה את השלב (215), גם כשהכרטיס מראה רק «ללקוח».
  const spouseTasks = !onboarding && !!personalConfirm
    && stage.items.some(i => !countSkip(i) && i.perPerson && !!personalConfirm(i));
  const branch = whenParts(stage.when);
  const stageIssues = issues.filter(x => x.stageKey === stage.key && !x.itemKey);
  const d = DELIVERY_LABELS[stage.delivery];
  const r = stage.reminder;
  const extras = [
    r && stage.delivery !== 'page' && anyClient ? `תזכורת כל ${r.afterDays} ימים על מה שעוד פתוח, עד ${r.max === 1 ? 'פעם אחת' : `${r.max} פעמים`}` : null,
    stage.notifyOffice ? 'הודעה אליך כשהשלב הושלם' : null,
  ].filter(Boolean) as string[];

  const groups = groupStageItems(stage, onboarding);
  const showGroupHeads = groups.length > 1 || groups.some(g => g.conditional);
  const hiddenIssue = issues.some(x => x.itemKey && stage.items.some(i => i.key === x.itemKey));
  const limit = more || hiddenIssue ? Infinity : SHOW_FIRST;
  let shown = 0;

  const row = (n: ItemNode, parent?: FlowItem, groupOff = false): ReactElement | null => {
    if (shown >= limit) return null;
    shown++;
    const i = n.item;
    const actor = itemActor(i, templates);
    const v = verdict(i);
    const isOff = off(i);
    const itemIssues = issues.filter(x => x.itemKey === i.key);
    const kids = n.children.map(c => row(c, i, groupOff)).filter(Boolean);
    return (
      <li key={i.key} className={`fl-item${isOff ? ' is-off' : ''}${itemIssues.length ? ' has-issue' : ''}${parent ? ' is-after' : ''}`}>
        {parent && <div className="fl-after-link">אחרי ש«{title(parent)}» הושלמה</div>}
        <button type="button" className="fl-item-btn" onClick={() => onOpenItem(i.key)} aria-label={`הגדרות «${title(i)}»`}>
          <span className={`fl-item-ic is-${actor}`} title={ACTOR_LABELS[actor]}><FlIcon name={ACTOR_ICON[actor]} size={15} /></span>
          <span className="fl-item-main">
            <span className="fl-item-name">{title(i)}</span>
            <span className="fl-item-tags">
              <span className="fl-item-who">{ACTOR_LABELS[actor]}</span>
              {i.ref.kind === 'action' && (i.mode === 'auto'
                ? <span className="of-tag is-auto">לבד, כשאפשר</span>
                : <span className="fl-item-who">· בלחיצה שלך</span>)}
              {i.optional && <span className="of-tag">לא חובה</span>}
              {i.perPerson && <span className="of-tag">{perPersonTag(personalConfirm?.(i) ?? false)}</span>}
              {i.dueInDays != null && <span className="fl-item-who">· יעד {i.dueInDays} ימים</span>}
              {n.afterOutside && <span className="of-tag">אחרי «{titleOf(n.afterOutside)}»</span>}
              {isOff && !stageOff && !groupOff && !notCreated.has(i.key) && lensActive && v.why && <span className="fl-why">לא ל{lensLabel} — {v.why}</span>}
              {itemIssues.map((x, k) => <span key={k} className="fl-issue-inline">{x.message}</span>)}
            </span>
          </span>
        </button>
        {kids.length > 0 && <ul className="fl-sub">{kids}</ul>}
      </li>
    );
  };

  const groupEls = groups.map(g => {
    const flat = (ns: ItemNode[]): FlowItem[] => ns.flatMap(n => [n.item, ...flat(n.children)]);
    const groupItems = flat(g.nodes);
    const groupOff = lensActive && !stageOff && groupItems.length > 0 && groupItems.every(i => verdict(i).state === 'off');
    const before = shown;
    const items = g.nodes.map(n => row(n, undefined, groupOff)).filter(Boolean);
    if (items.length === 0 && before >= limit) return null;
    return (
      <section key={g.label} className={`fl-group${g.conditional ? ' is-branch' : ''}${groupOff ? ' is-off' : ''}`}>
        {showGroupHeads && (
          <h5 className="fl-group-h">
            {g.conditional && <FlIcon name="branch" size={13} />}
            <span>{g.label}</span>
            {groupOff && <span className="fl-why"> · לא נפתח ל{lensLabel}</span>}
          </h5>
        )}
        <ul className="fl-items">{items}</ul>
      </section>
    );
  });
  const total = stage.items.length;

  return (
    <article className={`fl-stage${stageOff || allOff ? ' is-off' : ''}${flash ? ' is-flash' : ''}`} data-stage={stage.key}>
      <header className="fl-stage-head">
        <div className="fl-stage-titles">
          <h4 className="fl-stage-name">{stage.name || 'שלב בלי שם'}</h4>
          {branch.length > 0 && <span className="fl-branch"><FlIcon name="branch" size={13} />{onlyPhrase(branch)}</span>}
        </div>
        <button type="button" className="btn btn-sm btn-secondary fl-edit" onClick={onOpenStage}
          aria-label={`עריכת השלב «${stage.name}»`}>עריכת השלב</button>
      </header>
      {stageOff && <p className="fl-why fl-why-line">לא נפתח ל{lensLabel} — {stageVerdict.why}</p>}
      {allOff && <p className="fl-why fl-why-line">אין כאן כלום ל{lensLabel} — ומה שמחכה לשלב הזה לא יתעכב בגללו</p>}
      {stageIssues.length > 0 && <ul className="fl-issues">{stageIssues.map((x, k) => <li key={k}>{x.message}</li>)}</ul>}

      <div className="fl-sum">
        <p className="fl-sum-line"><FlIcon name="person" size={14} /><span>
          {countsText(counts, conditionalClient)}{spouseTasks ? ' · אישור בן/בת הזוג — אליך' : ''}
        </span></p>
        {/* ‼ בכרטיס — רק «איך מגיע» במילה (DELIVERY_LABELS.short). מתי יוצא מייל ומה נרשם בו — ב«עריכת
            השלב», ומה שמשותף לכמה שלבים באותו רגע — בשורת המייל של הרגע (MomentMailLine). */}
        <p className={`fl-sum-line${stage.delivery === 'auto' && anyClient ? ' is-auto' : ''}`}>
          <FlIcon name="mail" size={14} />
          {anyClient
            ? <span><b>{d.short}</b>{mixedAutoMail ? ' · מייל נפרד' : ''}</span>
            : <span>לא מגיע לדף של הלקוח{total ? ' — הכול כאן אצלך או אצל גורם חיצוני' : ''}</span>}
        </p>
        {extras.length > 0 && <p className="fl-sum-line"><FlIcon name="bell" size={14} /><span>{extras.join(' · ')}</span></p>}
      </div>

      <div className="fl-groups">{groupEls}</div>
      {total === 0 && <p className="fl-empty">עוד אין כאן כלום.</p>}
      <div className="fl-stage-foot">
        <button type="button" className="fl-add" onClick={onAdd}><FlIcon name="plus" size={14} /> הוספה לשלב</button>
        {shown < total && limit !== Infinity && (
          <button type="button" className="fl-link fl-more-btn" onClick={() => setMore(true)}>עוד {total - shown} בשלב ←</button>
        )}
        {more && total > SHOW_FIRST && (
          <button type="button" className="fl-link fl-more-btn" onClick={() => setMore(false)}>פחות</button>
        )}
      </div>
    </article>
  );
}

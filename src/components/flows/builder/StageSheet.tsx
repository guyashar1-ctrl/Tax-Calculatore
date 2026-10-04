// «עריכת השלב» — כל מה שהכרטיס רק מסכם: שם, מתי נפתח, למי, איך מגיע ללקוח
// (שלוש העובדות לכל בחירה), תזכורת, הודעה אליך, סדר בין שלבים באותו רגע, הסרה.
import type { Delivery, FlowDefinition, FlowItem, FlowStage, FlowTrigger, Opens } from '../../../features/flows/types';
import { DELIVERIES, DELIVERY_LABELS } from '../../../features/flows/types';
import { opensKey } from '../../../features/flows/preview';
import type { RequestTemplate } from '../../../lib/requestTemplates';
import { ConditionField } from './ConditionEditor';
import { FlSheet } from './ui';
import { dependentsOfStage, hasNonFixedSystem, itemActor, moveWithinMoment, patchStage, reachesClient, stagesAfter } from './model';

const parseOpens = (k: string): Opens => k === 'start' ? { after: 'start' }
  : k.startsWith('stage:') ? { after: 'stage', stage: k.slice(6) } : { after: 'item', item: k.slice(5) };

const REMINDER_DAYS = [2, 3, 5, 7, 10, 14, 21, 30];

export default function StageSheet({ def, trigger, stage, title, templates, onChange, onClose }: {
  def: FlowDefinition;
  trigger: FlowTrigger;
  stage: FlowStage;
  title: (i: FlowItem) => string;
  templates: RequestTemplate[];
  onChange: (next: FlowDefinition) => void;
  onClose: () => void;
}) {
  const onboarding = trigger === 'quote_approved';
  const deps = dependentsOfStage(def, stage.key);
  const fixedInside = stage.items.some(i => i.fixed);
  const kindsOnly = onboarding && hasNonFixedSystem(stage);
  // ‼ בקשות מערכת בקליטה נוצרות במחולל באישור ההצעה — השלב שלהן נפתח מיד.
  const lockedStart = kindsOnly && stage.opens.after === 'start';
  const set = (fn: (s: FlowStage) => FlowStage) => onChange(patchStage(def, stage.key, fn));
  const blockRemove = deps.length > 0 || fixedInside || def.stages.length === 1;
  const others = def.stages.filter(s => s.key !== stage.key);
  // ‼ מה שכבר נפתח אחרי השלב הזה (גם דרך שלב אחר) — בחירה בו הייתה סוגרת מעגל.
  const later = stagesAfter(def, stage.key);
  const cur = opensKey(stage.opens);
  const canWaitFor = others.filter(o => !later.has(o.key) || cur === `stage:${o.key}` || o.items.some(i => cur === `item:${i.key}`));
  const laterNames = others.filter(o => later.has(o.key) && !canWaitFor.includes(o)).map(o => o.name);
  // שלב שמחכה לשלב אחד מתוך כמה שנפתחים יחד — מחכה רק לו.
  const opens = stage.opens;
  const waitTarget = opens.after === 'stage' ? def.stages.find(s => s.key === opens.stage) : undefined;
  const targetSiblings = waitTarget
    ? def.stages.filter(s => s.key !== waitTarget.key && s.key !== stage.key && opensKey(s.opens) === opensKey(waitTarget.opens))
    : [];
  const sameMoment = def.stages.filter(s => opensKey(s.opens) === opensKey(stage.opens));
  const posInMoment = sameMoment.findIndex(s => s.key === stage.key);
  const anyClient = stage.items.some(i => reachesClient(itemActor(i, templates)));
  const reminder = stage.reminder ?? null;
  const dayOptions = reminder && !REMINDER_DAYS.includes(reminder.afterDays) ? [...REMINDER_DAYS, reminder.afterDays].sort((a, b) => a - b) : REMINDER_DAYS;

  return (
    <FlSheet title="עריכת השלב" sub={stage.name ? `«${stage.name}»` : undefined} onClose={onClose}
      foot={<>
        <button type="button" className="btn btn-danger" disabled={blockRemove}
          onClick={() => { onChange({ ...def, stages: def.stages.filter(s => s.key !== stage.key) }); onClose(); }}>
          הסרת השלב
        </button>
        <span className="fl-spacer" />
        <button type="button" className="btn btn-primary" onClick={onClose}>סיום</button>
      </>}>
      <label className="fl-field">
        <span>שם השלב</span>
        <input value={stage.name} data-autofocus onChange={e => set(s => ({ ...s, name: e.target.value }))} />
      </label>

      <label className="fl-field">
        <span>מתי נפתח</span>
        <select value={opensKey(stage.opens)} disabled={lockedStart}
          onChange={e => set(s => ({ ...s, opens: parseOpens(e.target.value) }))}>
          <option value="start">{onboarding ? 'מיד — באישור ההצעה' : 'מיד — כשהמסלול מתחיל'}</option>
          {!lockedStart && canWaitFor.map(o => (
            <option key={o.key} value={`stage:${o.key}`}>אחרי שהשלב «{o.name}» הושלם{later.has(o.key) ? ' — נפתח אחרי השלב הזה, מעגל' : ''}</option>
          ))}
          {!lockedStart && canWaitFor.flatMap(o => o.items.filter(i => i.ref.kind !== 'action').map(i => (
            <option key={i.key} value={`item:${i.key}`}>אחרי שהבקשה «{title(i)}» הושלמה (בשלב «{o.name}»){later.has(o.key) ? ' — מעגל' : ''}</option>
          )))}
        </select>
      </label>
      {lockedStart
        ? <p className="fl-hint">יש כאן בקשות שנוצרות באישור ההצעה (לפי מה שבהצעה) — ולכן השלב נפתח מיד.</p>
        : <p className="fl-hint">שלבים עם אותו «מתי נפתח» נפתחים יחד, במקביל. שלב שלא חל על הלקוח לא מעכב את מי שמחכה לו.</p>}
      {!lockedStart && targetSiblings.length > 0 && (
        <p className="fl-hint">מחכה רק ל«{waitTarget!.name}» — לא ל«{targetSiblings.map(x => x.name).join('», «')}», שנפתח{targetSiblings.length > 1 ? 'ים' : ''} איתו באותו רגע.</p>
      )}
      {!lockedStart && laterNames.length > 0 && (
        <p className="fl-hint">לא מופיעים כאן «{laterNames.slice(0, 3).join('», «')}»{laterNames.length > 3 ? ' ועוד' : ''} — הם נפתחים אחרי השלב הזה, ושני שלבים לא יכולים לחכות זה לזה.</p>
      )}

      <h3 className="fl-cap">למי</h3>
      <ConditionField label="השלב כולו" value={stage.when} onChange={w => set(s => ({ ...s, when: w }))}
        kindsOnly={kindsOnly}
        kindsOnlyWhy={kindsOnly ? 'יש בשלב בקשות שנוצרות לפי כללים קבועים — אפשר להגביל אותו רק לפי סוג לקוח.' : undefined} />
      <p className="fl-hint">לפריט אחד בלבד — בלחיצה על הפריט בשלב.</p>

      <h3 className="fl-cap">איך מגיע ללקוח</h3>
      {!anyClient && stage.items.length > 0 && (
        <p className="fl-hint">כרגע אין בשלב משהו שמגיע לדף של הלקוח. הבחירה תחול כשיתווסף.</p>
      )}
      <div className="fl-choices" role="radiogroup" aria-label={`איך «${stage.name}» מגיע ללקוח`}>
        {DELIVERIES.map((dv: Delivery) => {
          const l = DELIVERY_LABELS[dv];
          const on = stage.delivery === dv;
          // ‼ שלב שנפתח מיד אין לו «בהמשך» — מה שבו מופיע בדף מיד (חוץ מ«מחכה לאישורך»).
          const page = dv !== 'hold' && stage.opens.after === 'start' ? 'מופיע בדף מיד' : l.page;
          return (
            <button key={dv} type="button" role="radio" aria-checked={on}
              className={`fl-choice${on ? ' is-on' : ''}${dv === 'auto' ? ' is-auto' : ''}`}
              onClick={() => set(s => ({ ...s, delivery: dv }))}>
              <span className="fl-choice-t">{l.short}</span>
              <span className="fl-choice-l"><b>בדף:</b> {page}</span>
              <span className="fl-choice-l"><b>מייל:</b> {l.mail}</span>
              <span className="fl-choice-l"><b>מחכה לך:</b> {l.waits}</span>
            </button>
          );
        })}
      </div>

      <h3 className="fl-cap">תזכורת ללקוח</h3>
      {/* ‼ «רק בדף» לא שולח מייל — גם לא תזכורת (214: _client_announceable_steps). לא מציעים מה שלא ייצא. */}
      {stage.delivery === 'page' ? (
        <p className="fl-hint">רק כשהשלב מגיע במייל. ב«{DELIVERY_LABELS.page.short}» אין מייל, ולכן גם אין תזכורת.</p>
      ) : (
        <div className="fl-row-btns">
          <label className="fl-inline">
            <span className="fl-sr">כל כמה ימים</span>
            <select value={reminder ? String(reminder.afterDays) : ''} onChange={e => {
              const v = e.target.value;
              set(s => ({ ...s, reminder: v ? { afterDays: Number(v), max: s.reminder?.max ?? 2 } : null }));
            }}>
              <option value="">בלי תזכורת</option>
              {dayOptions.map(n => <option key={n} value={n}>כל {n} ימים, על מה שעוד פתוח</option>)}
            </select>
          </label>
          {reminder && (
            <label className="fl-inline">
              <span className="fl-sr">עד כמה פעמים</span>
              <select value={reminder.max} onChange={e => set(s => ({ ...s, reminder: { afterDays: s.reminder?.afterDays ?? 7, max: Number(e.target.value) } }))}>
                {[1, 2, 3, 4, 5].map(n => <option key={n} value={n}>{n === 1 ? 'פעם אחת' : `עד ${n} פעמים`}</option>)}
              </select>
            </label>
          )}
        </div>
      )}
      {reminder && stage.delivery !== 'page' && (
        <p className="fl-hint">מייל «תזכורת» נפרד — רק על מה שכבר נשלח ועדיין פתוח, לכל היותר אחד ביום ללקוח.</p>
      )}

      <h3 className="fl-cap">הודעה אליך</h3>
      <label className="fl-check">
        <input type="checkbox" checked={!!stage.notifyOffice} onChange={e => set(s => ({ ...s, notifyOffice: e.target.checked }))} />
        <span>מייל אליך כשהשלב הושלם<span className="fl-hint is-block">כשכל מה שחובה בשלב הושלם — כדי לדעת שהדברים זזו בלי להיכנס לבדוק.</span></span>
      </label>

      {sameMoment.length > 1 && (
        <>
          <h3 className="fl-cap">סדר ההצגה בין השלבים שנפתחים יחד</h3>
          <div className="fl-row-btns">
            <button type="button" className="btn btn-sm btn-secondary" disabled={posInMoment <= 0}
              onClick={() => onChange(moveWithinMoment(def, stage.key, -1))}>הצגה לפני</button>
            <button type="button" className="btn btn-sm btn-secondary" disabled={posInMoment >= sameMoment.length - 1}
              onClick={() => onChange(moveWithinMoment(def, stage.key, 1))}>הצגה אחרי</button>
          </div>
          <p className="fl-hint">רק סדר התצוגה — הם נפתחים באותו רגע.</p>
        </>
      )}

      {deps.length > 0 && <p className="fl-hint">אי אפשר להסיר: «{deps.map(d => d.name).join('», «')}» נפתח אחריו.</p>}
      {fixedInside && <p className="fl-hint">אי אפשר להסיר: בשלב יש את בקשת הייצוג מההצעה.</p>}
      {def.stages.length === 1 && <p className="fl-hint">במסלול חייב להיות לפחות שלב אחד.</p>}
    </FlSheet>
  );
}

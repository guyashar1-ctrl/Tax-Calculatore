// הגדרות פריט אחד במסלול: למי חל, חובה או רשות, אחרי מה, יעד, «גם לבן/בת
// הזוג», ולפעולה מול רשות — בלחיצה שלך או לבד. ומיקום: למעלה/למטה/לשלב אחר.
// ‼ (4.10.2026) מה שהפריט מצביע עליו נערך במקום אחר — ולכן קישור בראש היריעה: בקשה
// ומסמך — לשורה שלהם בספרייה; פעולה מול רשות — לשורה שלה ב«אוטומציות» (מה קרה בה).
import type { FlowIssue } from '../../../features/flows/compile';
import type { FlowDefinition, FlowItem, FlowStage, FlowTrigger } from '../../../features/flows/types';
import { actionTypeOf } from '../../../features/flows/types';
import { AUTOMATION_ACTIONS, FLOW_AUTO_FALLBACK, FLOW_AUTO_GATES } from '../../../features/automation/automationCatalog';
import type { OfficePageId } from '../../office/officeModel';
import type { RequestTemplate } from '../../../lib/requestTemplates';
import type { FirmProfile } from '../../../types/firmProfile';
import PreviewButton from '../../../features/requestPreview/PreviewButton';
import type { EditHint } from '../../../features/requestPreview/registry';
import { ConditionField } from './ConditionEditor';
import VariantsEditor from './VariantsEditor';
import { FlSeg, FlSheet } from './ui';
import { useBuilderPreview } from './BuilderPreview';
import { previewTargetOfItem } from './previewTarget';
import './builderPreview.css';
import {
  ACTOR_LABELS, dependentsOfItem, fixedGateChip, moveInList, moveItemToStage, patchItem, patchStage, perPersonHint, removeItem,
  type Actor, type PersonalConfirm,
} from './model';

/** בקשות המערכת שיש להן מצבים לפי עובדה (רשימת מסמכים / נוסח). */
const VARIANT_TYPES = new Set(['client_documents', 'prev_accountant_details']);

/** ‼ אותם שערים כמו בעמוד האוטומציות (FLOW_AUTO_GATES) — מקור אחד; הראשון («נבחר לבד») הוא הבחירה כאן. */
export const AUTO_ACTION_GATES =
  `רץ לבד רק כש: ${FLOW_AUTO_GATES.slice(1).join('; ')}. ${FLOW_AUTO_FALLBACK} ` +
  'קריאה בלבד: התוצאה מוצגת בתיק המס כהצעה, ושום דבר לא נשלח לרשות.';

export { PER_PERSON_TEXT } from './model';

export default function ItemSheet({ def, trigger, stage, item, title, actor, issues, personalConfirm = false, openList = false,
  inLibrary = false, templates, profile, onOpen, onChange, onClose }: {
  def: FlowDefinition;
  trigger: FlowTrigger;
  stage: FlowStage;
  item: FlowItem;
  title: (i: FlowItem) => string;
  actor: Actor;
  issues: FlowIssue[];
  /**
   * בבקשה יש אישור אישי — בעל הכרטיס לא מאשר במקום בן/בת הזוג, ולכן נפתחת משימה
   * אליך; 'with_page' — יש בה גם קבצים/פרטים, והם נפתחים בדף (personalConfirmOf).
   */
  personalConfirm?: PersonalConfirm | boolean;
  /** נפתח מקישור («בשימוש ב» בספרייה) — «מה הלקוח מקבל, לפי מצב» פתוח מיד. */
  openList?: boolean;
  /** הבקשה/המסמך עדיין בספרייה — רק אז יש לאן לקשר. */
  inLibrary?: boolean;
  /** בקשות הספרייה — לעובדות של «צפייה» (צירי המצב). בלעדיהן: מהעותק השמור בפריט. */
  templates?: readonly RequestTemplate[];
  /** פרופיל המשרד — ללשונית «במייל» שבמגירת «צפייה». */
  profile?: FirmProfile;
  /** מעבר לעמוד אחר במשרד (ספרייה / אוטומציות) — הבונה סוגר את היריעה ושומר את הטיוטה. */
  onOpen?: (page: OfficePageId, focus?: string) => void;
  onChange: (next: FlowDefinition) => void;
  onClose: () => void;
}) {
  const onboarding = trigger === 'quote_approved';
  const isAction = item.ref.kind === 'action';
  const isSystem = item.ref.kind === 'system';
  const idx = stage.items.findIndex(i => i.key === item.key);
  const set = (fn: (i: FlowItem) => FlowItem) => onChange(patchItem(def, item.key, fn));
  const deps = dependentsOfItem(def, item.key);
  const gate = fixedGateChip(item, onboarding);
  const canPerPerson = !onboarding && (item.ref.kind === 'template' || item.ref.kind === 'document');
  // ‼ בקשת מערכת בקליטה נפתחת רק בשלב שנפתח מיד (flow_definition_error: system_in_later_stage).
  const targets = def.stages.filter(s => !(onboarding && isSystem && !item.fixed && s.opens.after !== 'start'));
  const afterOptions = stage.items.filter(i => i.key !== item.key && i.ref.kind !== 'action');
  const required = isSystem && item.system?.requiredForClose != null ? item.system.requiredForClose : !item.optional;
  // ‼ איפה נערך מה שהפריט מצביע עליו — בשם של מה שיש שם, לא «פרטים נוספים».
  const automationId = isAction ? AUTOMATION_ACTIONS.find(a => a.actionType === actionTypeOf(item.ref))?.id : undefined;
  const source = !onOpen ? null
    : item.ref.kind === 'template' && inLibrary ? { label: 'מה הלקוח רואה ומה הוא עושה — בספרייה ←', go: () => onOpen('library', `request:${(item.ref as { templateId: string }).templateId}`) }
    : item.ref.kind === 'document' && inLibrary ? { label: 'הקובץ עצמו — בספרייה ←', go: () => onOpen('library', 'documents') }
    : automationId ? { label: 'מה קרה בפעם האחרונה — באוטומציות ←', go: () => onOpen('automations', automationId) }
    : null;

  // ‼ «צפייה» — מה הלקוח מקבל מהפריט הזה. פעולה מול רשות: הלקוח לא רואה אותה, ולכן אין.
  const previewTarget = previewTargetOfItem(item, { templates, title });
  // «עריכה» במגירה: אותה פעולה כמו הקישור שלמעלה, ורק כשיש לאן — בקשה/מסמך שנמחקו מהספרייה אין להם עריכה.
  const canEditSource = !!onOpen && (isSystem || inLibrary);
  const preview = useBuilderPreview(profile, canEditSource ? (hint: EditHint, close: () => void) => {
    // ‼ «מתי נפתחת?» (rules) — זה מה שהיריעה הזאת מגדירה: רק סוגרים את המגירה ונשארים כאן. כל השאר — סוגרים ועוברים.
    close();
    if (hint.kind === 'emails') onOpen?.('emails', hint.focus || undefined);
    else if (hint.kind === 'docsShelf') onOpen?.('library', 'documents');
    else if (hint.kind === 'editor') onOpen?.('library', previewTarget?.kind === 'template' ? `request:${previewTarget.templateId}` : undefined);
  } : undefined);
  const viewRow = previewTarget && (
    <div className="bp-item-view"><PreviewButton name={title(item)} onClick={() => preview.open(previewTarget)} /></div>
  );

  if (item.fixed) {
    return (
      <FlSheet title={title(item)} sub={`בשלב «${stage.name}»`} onClose={onClose}
        foot={<><span className="fl-spacer" /><button type="button" className="btn btn-primary" onClick={onClose}>סגירה</button></>}>
        {viewRow}
        <p className="fl-sub">
          מוצג כאן כדי שהמסלול יהיה שלם. נוצר מהצעת המחיר, לפי היקף הייצוג שבה — לא מהמסלול, ולכן אין מה לערוך כאן.
          הלקוח ממלא וחותם; ההגשה לרשויות נעשית במרכז הייצוג.
        </p>
        {gate && <span className="of-tag">{gate}</span>}
        {preview.node}
      </FlSheet>
    );
  }

  return (
    <FlSheet title={title(item)} sub={<>בשלב «{stage.name}» · {ACTOR_LABELS[actor]}</>} onClose={onClose}
      foot={<>
        <button type="button" className="btn btn-danger" disabled={deps.length > 0}
          title={deps.length ? `${deps.join(', ')} מחכה לו` : undefined}
          onClick={() => { onChange(removeItem(def, item.key)); onClose(); }}>הסרה מהמסלול</button>
        <span className="fl-spacer" />
        <button type="button" className="btn btn-primary" onClick={onClose}>סיום</button>
      </>}>
      {viewRow}
      {issues.length > 0 && (
        <ul className="fl-issues">{issues.map((x, k) => <li key={k}>{x.message}</li>)}</ul>
      )}
      {deps.length > 0 && <p className="fl-hint">אי אפשר להסיר: {deps.join(', ')} מחכה לו.</p>}
      {source && <p className="fl-hint"><button type="button" className="fl-link" onClick={source.go}>{source.label}</button></p>}

      <ConditionField label="למי" extra={gate ? gate.replace(/^רק /, '').replace(' · קבוע', '') : null} value={item.when} onChange={w => set(x => ({ ...x, when: w }))}
        kindsOnly={onboarding && isSystem}
        kindsOnlyWhy={onboarding && isSystem
          ? `בקשת מערכת נוצרת לפי כללים קבועים${gate ? ` (${gate.replace(' · קבוע', '')})` : ''} — אפשר להגביל אותה רק לפי סוג לקוח.`
          : undefined} />

      {onboarding && isSystem && item.ref.kind === 'system' && VARIANT_TYPES.has(item.ref.stepType) && (
        <details className="fl-more" open={openList || undefined}>
          <summary>מה הלקוח מקבל, לפי מצב</summary>
          <VariantsEditor stepType={item.ref.stepType} value={item.system?.variants}
            onChange={variants => set(x => ({ ...x, system: { ...x.system, variants } }))} />
        </details>
      )}

      {isAction ? (
        <>
          <h3 className="fl-cap">מתי זה רץ</h3>
          <FlSeg label="מתי הפעולה רצה" value={item.mode === 'auto' ? 'auto' : 'manual'}
            onChange={m => set(x => ({ ...x, mode: m }))}
            options={[{ value: 'manual', label: 'בלחיצה שלך' }, { value: 'auto', label: 'לבד כשהשלב נפתח', auto: true }]} />
          <p className="fl-hint">
            {item.mode === 'auto' ? AUTO_ACTION_GATES
              : 'כשהשלב נפתח, הפעולה ממתינה לך בכרטיס הלקוח — לוחצים ומריצים. קריאה בלבד; התוצאה מוצגת בתיק המס כהצעה.'}
          </p>
        </>
      ) : (
        <>
          <h3 className="fl-cap">חובה ותזמון</h3>
          <label className="fl-check">
            <input type="checkbox" checked={required} onChange={e => {
              const on = e.target.checked;
              set(x => {
                const n: FlowItem = { ...x, optional: on ? undefined : true };
                if (!n.optional) delete n.optional;
                if (x.ref.kind === 'system') n.system = { ...x.system, requiredForClose: on };
                return n;
              });
            }} />
            <span>{onboarding ? 'חובה — השלב והקליטה לא נסגרים בלעדיו' : 'חובה — השלב לא מושלם בלעדיו'}</span>
          </label>
          <label className="fl-field">
            <span>נפתח בתוך השלב</span>
            <select value={item.after ?? ''} onChange={e => set(x => {
              const n = { ...x };
              if (e.target.value) n.after = e.target.value; else delete n.after;
              return n;
            })}>
              <option value="">מיד — במקביל לשאר השלב</option>
              {afterOptions.map(o => <option key={o.key} value={o.key}>אחרי ש«{title(o)}» הושלמה</option>)}
            </select>
          </label>
          <label className="fl-field is-short">
            <span>יעד ללקוח (ימים מהפתיחה)</span>
            <input type="number" inputMode="numeric" min={0} max={365} value={item.dueInDays ?? ''} placeholder="בלי יעד"
              onChange={e => {
                const v = e.target.value.trim();
                set(x => {
                  const n = { ...x };
                  if (v === '' || !Number.isFinite(Number(v))) delete n.dueInDays;
                  else n.dueInDays = Math.max(0, Math.round(Number(v)));
                  return n;
                });
              }} />
          </label>
          {canPerPerson && (
            <label className="fl-check">
              <input type="checkbox" checked={!!item.perPerson} onChange={e => set(x => {
                const n = { ...x };
                if (e.target.checked) n.perPerson = true; else delete n.perPerson;
                return n;
              })} />
              <span>
                גם לבן/בת הזוג, כשרשום/ה בכרטיס
                <span className="fl-hint is-block">
                  {perPersonHint(personalConfirm === true ? 'only' : personalConfirm)}
                </span>
              </span>
            </label>
          )}
        </>
      )}

      <h3 className="fl-cap">מיקום</h3>
      <div className="fl-row-btns">
        <button type="button" className="btn btn-sm btn-secondary" disabled={idx <= 0}
          onClick={() => onChange(patchStage(def, stage.key, s => ({ ...s, items: moveInList(s.items, idx, -1) })))}>↑ למעלה</button>
        <button type="button" className="btn btn-sm btn-secondary" disabled={idx < 0 || idx >= stage.items.length - 1}
          onClick={() => onChange(patchStage(def, stage.key, s => ({ ...s, items: moveInList(s.items, idx, 1) })))}>↓ למטה</button>
        {targets.length > 1 && (
          <select value={stage.key} aria-label="העברה לשלב" onChange={e => {
            onChange(moveItemToStage(def, item.key, e.target.value));
          }}>
            {targets.map(s => <option key={s.key} value={s.key}>{s.key === stage.key ? `בשלב «${s.name}»` : `העברה ל«${s.name}»`}</option>)}
          </select>
        )}
      </div>
      <p className="fl-hint">הסדר הוא רק סדר ההצגה בדף. מה שבאותו שלב נפתח במקביל, אלא אם נבחר «אחרי».</p>
      {preview.node}
    </FlSheet>
  );
}

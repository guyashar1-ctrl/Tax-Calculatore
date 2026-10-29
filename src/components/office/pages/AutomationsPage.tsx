// קטלוג הפעולות: תיאור, הפעלה והגדרות בלבד. הרצות ותוצאות נשארות בכרטיס הלקוח וביומנים.
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import type { Client } from '../../../types';
import type { FirmProfile } from '../../../types/firmProfile';
import { AUTOMATION_ACTIONS, FLOW_AUTO_FALLBACK, FLOW_AUTO_GATES, type ClientTarget } from '../../../features/automation/automationCatalog';
import { automationRows, intakeMoments, intakeStageMeta, resolveAutomationFocus, INTAKE_FIRST_DELIVERY, MECHANISM_ROW_IDS, type AutoRow, type StageUse } from '../../../features/automation/automationList';
import { filterActionRows, ACTION_FILTERS, PLANNED_BOOKKEEPING, type ActionFilter } from '../../../features/automation/actionGuide';
import { loadOfficeFlows } from '../../../features/flows/api';
import { AUTO_MAIL_RECORDED, DELIVERY_LABELS, type OfficeFlow } from '../../../features/flows/types';
import { NOTIFICATION_GROUPS, isNotificationEnabled } from '../../../../supabase/functions/_shared/accountantNotifications.ts';
import { emailTemplateTitle, type SavedTemplateKey } from '../../../../supabase/functions/_shared/stepTemplates.ts';
import { repReminderConfig, withRepReminder } from '../RepresentationSettingsSection';
import { FIRM_NOTIFICATIONS, setNotification } from '../notificationPrefs';
import { GoTo } from '../officeUi';
import type { OfficePageId } from '../officeModel';
import type { ActivityFilter } from './activityFilter';
import { EXPIRY_SUBJECT, Num, REP_REMINDERS, Switch, reminderSubjectsText } from './reminderSpecs';
import './actions.css';

const SWITCHABLE = FIRM_NOTIFICATIONS.filter(n => !n.definedIn);
const ROW_IDS = [...MECHANISM_ROW_IDS, ...AUTOMATION_ACTIONS.filter(a => a.actionType).map(a => a.id), PLANNED_BOOKKEEPING.id];
const flowAnchor = (flowId: string, stageKey?: string) => 'flow:' + flowId + (stageKey ? ':' + stageKey : '');
const FLOW_MAIL_TEMPLATES: { key: SavedTemplateKey; when: string }[] = [
  { key: 'process_open', when: 'ללקוח שעוד לא קיבל מייל על הדף' },
  { key: 'process_open_later', when: 'ללקוח שכבר קיבל' },
  { key: 'documents_sent', when: 'כשנפתחו רק מסמכים' },
];
interface Props {
  clients: Client[]; focus?: string | null; go: (p: OfficePageId, focus?: string) => void;
  onOpenClient?: (clientId: string, tab: 'taxfile' | 'journey' | 'log', target?: ClientTarget) => void;
  draft: FirmProfile; setDraft: React.Dispatch<React.SetStateAction<FirmProfile>>;
  openLog: (f: ActivityFilter) => void;
}
// החזרה מהנוהל או מהגדרה שומרת חיפוש, פתיחה ומיקום — כמו בעמוד הקודם.
const VIEW_KEY = 'pivo.office.actions.view';
interface SavedView { query: string; group: ActionFilter; open: string | null; y: number; at: number }
function readView(): SavedView | null {
  try {
    const saved = JSON.parse(sessionStorage.getItem(VIEW_KEY) ?? 'null') as SavedView | null;
    return saved && Date.now() - saved.at < 30 * 60_000 && typeof saved.query === 'string'
      && ACTION_FILTERS.some(g => g.id === saved.group) ? saved : null;
  } catch { return null; }
}
export default function AutomationsPage({ focus, go: navigate, draft, setDraft }: Props) {
  const saved = useMemo(() => focus ? null : readView(), [focus]);
  const [flows, setFlows] = useState<OfficeFlow[] | null>(null);
  const [flowsError, setFlowsError] = useState(false);
  const [loadKey, setLoadKey] = useState(0);
  useEffect(() => {
    let alive = true;
    void loadOfficeFlows().then(r => { if (alive) { setFlowsError(!r.ok); setFlows(r.ok ? r.flows.filter(f => f.status !== 'archived') : null); } });
    return () => { alive = false; };
  }, [loadKey]);
  const onboarding = (flows ?? []).find(f => f.trigger === 'quote_approved') ?? null;
  const moments = useMemo(() => onboarding ? intakeMoments(onboarding) : [], [onboarding]);
  const settings = draft.settings ?? {};
  const officeEmail = (draft.email ?? '').trim();
  const rows = useMemo(() => automationRows({ flows, flowsError,
    expiryOn: isNotificationEnabled(settings, 'quotation_expiry_reminder'),
    repOn: REP_REMINDERS.filter(r => repReminderConfig(draft, r.audience).enabled).length,
    repTotal: REP_REMINDERS.length,
    firmOn: SWITCHABLE.filter(n => isNotificationEnabled(settings, n.kind)).length,
    firmTotal: SWITCHABLE.length, officeEmail, actions: AUTOMATION_ACTIONS,
  }), [flows, flowsError, draft, settings, officeEmail]);
  const [query, setQuery] = useState(saved?.query ?? '');
  const [group, setGroup] = useState<ActionFilter>(saved?.group ?? 'all');
  const landed = useMemo(() => resolveAutomationFocus(focus, { rowIds: ROW_IDS,
    repAudiences: REP_REMINDERS.map(r => r.audience), notificationKinds: FIRM_NOTIFICATIONS.map(n => n.kind) }), [focus]);
  const [open, setOpen] = useState<string | null>(landed?.row ?? saved?.open ?? null);
  useEffect(() => {
    if (!landed) return;
    if (landed.row) setOpen(landed.row);
    const frame = requestAnimationFrame(() => {
      const selector = landed.sub ? '[data-rem="' + CSS.escape(landed.sub) + '"]'
        : landed.row ? '[data-auto="' + CSS.escape(landed.row) + '"]' : '[data-auto-group="' + landed.group + '"]';
      document.querySelector(selector)?.scrollIntoView({ block: 'center' });
    });
    return () => cancelAnimationFrame(frame);
  }, [landed]);
  useEffect(() => {
    if (!saved) return;
    try { sessionStorage.removeItem(VIEW_KEY); } catch { /* אחסון חסום */ }
    const frame = requestAnimationFrame(() => window.scrollTo(0, saved.y));
    return () => cancelAnimationFrame(frame);
  }, [saved]);
  const go = (page: OfficePageId, target?: string) => {
    try { sessionStorage.setItem(VIEW_KEY, JSON.stringify({query, group, open, y: window.scrollY, at: Date.now()})); }
    catch { /* ניווט זמין גם בלי אחסון */ }
    navigate(page, target);
  };
  const shown = filterActionRows(rows, query, group);
  const plannedShown = filterActionRows([PLANNED_BOOKKEEPING], query, group).length > 0;
  const stageLinks = (uses: StageUse[], empty: ReactNode) => uses.length === 0 ? <div>{empty}</div> : <ul className="of-autop-uses">
    {uses.map(u => <li key={u.flowId + ':' + u.stageKey}>
      <GoTo onClick={() => go('flows', flowAnchor(u.flowId, u.stageKey))}>{u.flowName} · {u.stageName}</GoTo>
      {u.detail && <span className="of-muted">{u.detail}</span>}
    </li>)}
  </ul>;
  function detail(r: AutoRow): ReactNode {
    switch (r.id) {
      case 'flow-mail':
        return (<>
          <dl className="of-auto-dl">
            <dt>איפה מגדירים</dt>
            <dd>
              בשלב במסלול — «איך מגיע ללקוח»: «{DELIVERY_LABELS.auto.short}».
              {stageLinks(r.uses ?? [], <GoTo onClick={() => go('flows')}>למסלולים</GoTo>)}
            </dd>
            <dt>מה הלקוח מקבל</dt>
            <dd>
              {AUTO_MAIL_RECORDED}. הנוסח — לפי הלקוח:
              <ul className="of-autop-uses">
                {FLOW_MAIL_TEMPLATES.map(t => (
                  <li key={t.key}>
                    <GoTo onClick={() => go('emails', `tpl:${t.key}`)}>{emailTemplateTitle(t.key)}</GoTo>
                    <span className="of-muted">{t.when}</span>
                  </li>
                ))}
              </ul>
            </dd>
            <dt>לעצור לפני שיוצא</dt>
            <dd>בכרטיס הלקוח — «אל תשלח לבד», כל עוד המייל לא יצא. עצירת המסלול אצל הלקוח עוצרת גם אותו.</dd>
          </dl>

        </>);
      case 'flow-reminder':
        return (<>
          <dl className="of-auto-dl">
            <dt>איפה מגדירים</dt>
            <dd>
              בשלב במסלול — «תזכורת». בשלב «{DELIVERY_LABELS.page.short}» אין מייל ולכן גם אין תזכורת.
              {stageLinks(r.uses ?? [], <GoTo onClick={() => go('flows')}>למסלולים</GoTo>)}
            </dd>
            <dt>מה הלקוח מקבל</dt>
            <dd><GoTo onClick={() => go('emails', 'tpl:portal_reminder')}>הנוסח של התזכורת</GoTo></dd>
            {/* ‼ השרת לא שולח תזכורת לבד לריצה בעצירה (214: _client_notice_items); בחידוש — כרגיל. */}
            <dt>לעצור</dt>
            <dd>עצירת המסלול אצל הלקוח עוצרת גם את התזכורת; בחידוש היא ממשיכה.</dd>
            <dt>ידנית</dt>
            <dd>«תזכורת» בכרטיס הלקוח — כמה ימים אחרי המייל האחרון.</dd>
          </dl>

        </>);
      case 'expiry': {
        const on = isNotificationEnabled(settings, 'quotation_expiry_reminder');
        return (<>
          <ul className="of-arows">
            <li className="of-arow" data-rem="expiry">
              <Switch checked={on} label="תזכורת לפני שהצעת מחיר פוקעת"
                onChange={v => setDraft(d => setNotification(d, 'quotation_expiry_reminder', v))} />
              <div className="of-arow-main">
                <div className="of-arow-title">{on ? 'פעילה — יוצאת לבד' : 'כבויה — לא יוצאת'}</div>
                <div className="of-arow-subject">«{EXPIRY_SUBJECT}» · נוסח קבוע</div>
              </div>
            </li>
          </ul>

        </>);
      }
      case 'rep-reminders':
        return (<>
          <ul className="of-arows">
            {REP_REMINDERS.map(rr => {
              const cfg = repReminderConfig(draft, rr.audience);
              const patch = (p: Parameters<typeof withRepReminder>[2]) => setDraft(d => withRepReminder(d, rr.audience, p));
              return (
                <li key={rr.audience} className="of-arow" data-rem={rr.audience}>
                  <Switch checked={cfg.enabled} label={`תזכורת ${rr.name}`} onChange={on => patch({ enabled: on })} />
                  <div className="of-arow-main">
                    <div className="of-arow-title">{rr.name}</div>
                    <div className="of-arow-meta">
                      {rr.who}
                      {cfg.enabled && (
                        <span className="of-arow-params">
                          {' · '}אחרי <Num value={cfg.afterDays} min={1} max={60} label="אחרי כמה ימים" onChange={n => patch({ afterDays: n })} /> ימים,
                          {' '}עד <Num value={cfg.maxReminders} min={1} max={5} label="כמה תזכורות לכל היותר" onChange={n => patch({ maxReminders: n })} /> פעמים
                        </span>
                      )}
                    </div>
                    <div className="of-arow-subject">{reminderSubjectsText(rr)} · נוסח קבוע</div>
                  </div>
                </li>
              );
            })}
          </ul>
          {/* ‼ השרת לא שולח אותן כשמסלול הקליטה של הלקוח בעצירה (נבדק בכל תזכורת, לפני היציאה). */}
          <p className="of-muted of-autop-more">עצירת מסלול הקליטה אצל הלקוח עוצרת גם אותן.</p>
          <p className="of-muted of-autop-more">
            מה הלקוח רואה כשצריך לאשר באזור האישי — <GoTo onClick={() => go('emails', 'rep:portal')}>הכרטיס</GoTo>
            {' · '}<GoTo onClick={() => go('emails', 'rep:guide')}>המדריך המצולם</GoTo>
          </p>

        </>);
      case 'auto-request':
        return (<>
          <dl className="of-auto-dl">
            <dt>איפה מגדירים</dt>
            <dd>בבקשה עצמה, בכרטיס הלקוח: בבקשה לגורם חיצוני בוחרים «ביצוע: אוטומטי ⚡». בקשה ללקוח לא שולחת מייל משלה — היא מופיעה בדף שלו.</dd>
            {/* ‼ 216: execute_automatic_step מדלג על ריצה בעצירה; resume_flow_run מריץ שוב. */}
            <dt>מתי בדיוק</dt>
            <dd>רק אחרי שהבקשה פורסמה, ורק כשכל מה שהיא מחכה לו הושלם — פעם אחת. טיוטה לא שולחת, ובקשה במסלול שנעצר לא נשלחת עד החידוש.</dd>
            <dt>איפה עוד רואים</dt>
            <dd>בבקשה עצמה («בוצע אוטומטית»), ובלשונית «פעילות» של הלקוח.</dd>
          </dl>

        </>);
      case 'notifications':
        return (<>
          <p className={`of-asec-sub${officeEmail ? '' : ' is-error'}`}>
            {officeEmail
              ? <>נשלח אל <bdi className="of-ltr">{officeEmail}</bdi> · <GoTo onClick={() => go('profile', 'details')}>שינוי הכתובת</GoTo></>
              : <>אין אימייל למשרד, ולכן שום הודעה לא נשלחת. <GoTo onClick={() => go('profile', 'details')}>הוספת כתובת</GoTo></>}
          </p>
          {NOTIFICATION_GROUPS.map(group => {
            const items = SWITCHABLE.filter(n => n.group === group);
            if (items.length === 0) return null;
            return (
              <div key={group} className="of-agroup">
                <div className="of-agroup-title">{group}</div>
                <ul className="of-arows">
                  {items.map(n => (
                    <li key={n.kind} className="of-arow is-compact" data-rem={n.kind}>
                      <Switch checked={isNotificationEnabled(settings, n.kind)} label={n.label}
                        onChange={v => setDraft(d => setNotification(d, n.kind, v))} />
                      <div className="of-arow-main">
                        <div className="of-arow-title">{n.label}</div>
                        <div className="of-arow-meta">{n.hint}</div>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}

        </>);
      case 'flow-notify':
        return (<>
          <dl className="of-auto-dl">
            <dt>איפה מגדירים</dt>
            <dd>
              בשלב במסלול — «הודעה אליך כשהשלב הושלם».
              {stageLinks(r.uses ?? [], <GoTo onClick={() => go('flows')}>למסלולים</GoTo>)}
            </dd>
          </dl>

        </>);
      case 'intake':
        if (!onboarding) {
          if (flowsError) return <p className="of-muted">המסלולים לא נטענו. <GoTo onClick={() => go('flows')}>למסלולים</GoTo></p>;
          // ‼ משרד חדש — לא חוסר: המסלול נוצר באישור הראשון (כמו שאומר «מסלולים»).
          // כאן רק מה שלא נאמר בשורה: איך זה מגיע ללקוח, ואיפה עורכים אחר כך.
          return (
            <dl className="of-auto-dl">
              <dt>איך מגיע ללקוח</dt>
              <dd>{DELIVERY_LABELS[INTAKE_FIRST_DELIVERY].long}.</dd>
              <dt>איפה עורכים</dt>
              <dd>במסלולים — מהרגע שהמסלול נוצר. <GoTo onClick={() => go('flows')}>למסלולים</GoTo></dd>
            </dl>
          );
        }
        return (<>
          <p className="of-asec-sub">מה נפתח ומתי — לפי סדר הביצוע. מסלולים אחרים נפתחים רק כשמפעילים אותם מכרטיס הלקוח.</p>
          <ol className="of-al-moments">
            {moments.map(m => (
              <li key={m.key} className="of-al-moment">
                <div className="of-al-moment-head">
                  <span className="of-al-moment-label">{m.label}</span>
                  {m.stages.length > 1 && <span className="of-tag">במקביל</span>}
                </div>
                <ul className="of-al-mstages">
                  {m.stages.map(s => (
                    <li key={s.key} className="of-al-mstage">
                      <div className="of-al-mstage-title">
                        <span className="of-al-mstage-name">{s.name}</span>
                        {s.condition && <span className="of-tag is-off">{s.condition}</span>}
                        <GoTo onClick={() => go('flows', flowAnchor(onboarding.id, s.key))}>עריכה</GoTo>
                      </div>
                      <div className="of-arow-meta">{intakeStageMeta(s)}</div>
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ol>

        </>);
      default:
        return r.action ? actionDetail(r) : null;
    }
  }


  function actionDetail(r: AutoRow) {
    const a = r.action!;
    return <dl className="of-auto-dl">
      <dt>איך מפעילים</dt><dd>{a.manual ?? a.trigger}</dd>
      <dt>מה הפעולה עושה</dt><dd>{a.what}</dd>
      {a.automatic && <><dt>מתי רצה לבד</dt><dd>{a.automatic}</dd></>}
      {a.flow && <><dt>במסלולים</dt><dd>{stageLinks(r.uses ?? [], <GoTo onClick={() => go('flows')}>הגדרה בכללי פתיחה</GoTo>)}
        <details><summary>התנאים להפעלה אוטומטית</summary><ul>{FLOW_AUTO_GATES.map(g => <li key={g}>{g}</li>)}</ul>{FLOW_AUTO_FALLBACK}</details>
      </dd></>}
      <dt>צריך מראש</dt><dd><ul className="of-auto-needs">{a.needs.map(n => <li key={n}>{n}</li>)}</ul><GoTo onClick={() => go('connections')}>בדיקת החיבורים</GoTo></dd>
      <dt>איפה רואים תוצאה</dt><dd>{a.results}</dd>
      {a.system === 'paperless' && <><dt>נוהל המשרד</dt><dd><GoTo onClick={() => go('bookkeeping')}>תורת הנהלת החשבונות</GoTo></dd></>}
    </dl>;
  }
  function row(r: AutoRow, planned = false) {
    const expanded = open === r.id;
    const bodyId = 'action-guide-' + r.id;
    return <li key={r.id} className="oa-row" data-auto={r.id} data-auto-group={planned ? undefined : r.group}>
      <div className="oa-row-head">
        <div><h2>{r.name}</h2><p>{r.effect}</p></div>
        <span className={'oa-mode' + (planned ? ' is-planned' : '')}>{planned ? 'דרך קלוד · בתכנון' : r.action ? r.action.mode : 'לפי הגדרה'}</span>
        <button type="button" className="oa-how" aria-label={"איך מפעילים — " + r.name} aria-expanded={expanded} aria-controls={bodyId} onClick={() => setOpen(expanded ? null : r.id)}>
          איך מפעילים <span aria-hidden="true">{expanded ? '−' : '+'}</span>
        </button>
      </div>
      {expanded && <div className="oa-body" id={bodyId}>{planned ? <>
        <p>הסוכן עדיין לא מותקן. לאחר הקמתו תוצג כל חשבונית עם הסיווג המוצע והסבר, ורק אישור שלך יאפשר ביצוע.</p>
        <GoTo onClick={() => go('bookkeeping')}>תורת הנהלת החשבונות שעליה יתבסס הסוכן</GoTo>
      </> : <><p className="oa-trigger"><b>מה מפעיל:</b> {r.trigger}</p>{detail(r)}</>}</div>}
    </li>;
  }
  return <div className="oa-catalog" dir="rtl">
    <div className="oa-tools">
      <label className="oa-search">חיפוש פעולה<input type="search" placeholder="למשל: פייפרלס, ייצוג, תזכורת" value={query} onChange={e => setQuery(e.target.value)} /></label>
      <div className="oa-filters" role="group" aria-label="תחום פעולה">{ACTION_FILTERS.map(g => <button key={g.id} type="button" aria-pressed={group === g.id} onClick={() => setGroup(g.id)}>{g.label}</button>)}</div>
    </div>
    {flowsError && <p className="of-error-box" role="alert">לא הצלחנו לטעון את הגדרות המסלולים. ההוראות זמינות; מצב ההפעלה טרם אומת. <button type="button" className="of-link" onClick={() => { setFlowsError(false); setFlows(null); setLoadKey(k => k + 1); }}>לנסות שוב</button></p>}
    <p className="oa-count" role="status">{shown.length + Number(plannedShown)} פעולות</p>
    <ul className="oa-list">{plannedShown && row(PLANNED_BOOKKEEPING, true)}{shown.map(r => row(r))}</ul>
    {!shown.length && !plannedShown && <p className="oa-empty">לא נמצאה פעולה מתאימה. <button type="button" className="of-link" onClick={() => { setQuery(''); setGroup('all'); }}>ניקוי חיפוש וסינון</button></p>}
  </div>;
}

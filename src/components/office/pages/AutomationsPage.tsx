// «אוטומציות» — כל מה שקורה לבד, ברשימה אחת (סבב 4, 3.10.2026): לכל אוטומציה
// מה מפעיל אותה, מה קורה, והתוצאה האחרונה עם הזמן. לחיצה על שורה פותחת את
// התוצאות, איפה מגדירים, ומה צריך מראש. ראה docs/DESIGN-FLOWS-R3.md §6.
//
// ‼ שורה = מנגנון (automationList.ts): «מייל מרוכז כשנפתח שלב» הוא שורה אחת גם
// כשהוא מסומן ב-12 שלבים — הרשימה לא מתארכת עם המסלולים.
// ‼ מה שמוגדר בשלב של מסלול (מייל לבד, תזכורת, קריאה לבד, הודעה כשהשלב הושלם)
// — מוצג כאן לקריאה בלבד, עם קישור לשלב. מקור אחד: המסלול. מה שאינו שייך
// למסלול (תזכורת פקיעה, תזכורות הייצוג, ההודעות למשרד) — נערך כאן, בטיוטת המשרד.
// ‼ חיבור ≠ פעולה: שורת החיבורים היא מצב (useShaamReadiness), והיא לבדה לא
// מריצה כלום. יכולת ≠ הצלחה: «תוצאה אחרונה» נקראת לכל שורה בנפרד —
// ריצות, יומן המיילים, והודעות ללקוח (useAutomationResults); «לא ידוע» או
// «ישן» אינם הצלחה — ראה automationCatalog.
// ‼ אין כאן כפתור הרצה: מריצים מהמקום שבו יש לקוח והקשר (תיק מס, מרכז הייצוג).
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { Client } from '../../../types';
import type { FirmProfile } from '../../../types/firmProfile';
import { supabase } from '../../../lib/supabase';
import { useShaamReadiness } from '../../../hooks/shaamReadiness';
import {
  AUTOMATION_ACTIONS, AUTOMATION_ACTION_TYPES, FLOW_AUTO_FALLBACK, FLOW_AUTO_GATES,
  summarizeRun, runIsStale, runTime, type ClientTarget,
} from '../../../features/automation/automationCatalog';
import {
  ATTENTION_PER_ROW, AUTO_GROUPS, FLOW_DONE_KIND, INTAKE_FIRST_DELIVERY, MECHANISM_ROW_IDS, NOTICE_NEW_KINDS, REP_REMINDER_KINDS,
  attentionEvents, automationRows, intakeMoments, intakeStageMeta, jobEvent,
  resolveAutomationFocus, rowEvents, waitEvent,
  type AutoRow, type ResultTone, type RowEvent, type StageUse,
} from '../../../features/automation/automationList';
import { ACTION_WAIT_REASON, loadOfficeFlows, RUN_STATUS_LABELS } from '../../../features/flows/api';
import { AUTO_MAIL_RECORDED, DELIVERY_LABELS, type OfficeFlow, type RunStatus } from '../../../features/flows/types';
import {
  NOTIFICATION_BY_KIND, NOTIFICATION_GROUPS, isNotificationEnabled,
} from '../../../../supabase/functions/_shared/accountantNotifications.ts';
import { emailTemplateTitle, type SavedTemplateKey } from '../../../../supabase/functions/_shared/stepTemplates.ts';
import { repReminderConfig, withRepReminder } from '../RepresentationSettingsSection';
import { FIRM_NOTIFICATIONS, setNotification } from '../notificationPrefs';
import { GoTo } from '../officeUi';
import type { OfficePageId } from '../officeModel';
import { EventRuns, RunDot, fmtWhen } from './recentSends';
import type { ActivityFilter } from './activityFilter';
import { EXPIRY_SUBJECT, Num, REP_REMINDERS, Switch, reminderSubjectsText } from './reminderSpecs';
import { useAutomationResults } from './useAutomationResults';

const RUNS_SHOWN = 5;

type FlowRow = OfficeFlow & { activeRuns?: number };
interface RunRow { id: string; clientId: string; status: RunStatus; startedAt: string }
type ClientTab = 'taxfile' | 'journey' | 'log';

/** מתגי ההודעות אליך שנערכים כאן — בלי «שלב במסלול הושלם», שמוגדר בשלב עצמו. */
const SWITCHABLE = FIRM_NOTIFICATIONS.filter(n => !n.definedIn);
const ROW_IDS = [...MECHANISM_ROW_IDS, ...AUTOMATION_ACTIONS.filter(a => a.actionType).map(a => a.id)];
const REP_NAME_BY_KIND: Record<string, string> = Object.fromEntries(
  REP_REMINDERS.map(r => [`representation_reminder_${r.audience}`, r.name]));

const flowAnchor = (flowId: string, stageKey?: string) => `flow:${flowId}${stageKey ? `:${stageKey}` : ''}`;

/**
 * ‼ המייל המרוכז שיוצא לבד הוא אחד משלושה נוסחים — השרת בוחר לפי הלקוח
 * (send-process-open-email → savedTemplateKey). קישור לנוסח אחד בלבד («מייל ראשון»)
 * שלח לערוך מייל שלקוח במסלול שנתי לא מקבל.
 */
const FLOW_MAIL_TEMPLATES: { key: SavedTemplateKey; when: string }[] = [
  { key: 'process_open', when: 'ללקוח שעוד לא קיבל מייל על הדף' },
  { key: 'process_open_later', when: 'ללקוח שכבר קיבל' },
  { key: 'documents_sent', when: 'כשנפתחו רק מסמכים' },
];


// ── חזרה למקום: יציאה מקישור בשורה (שלב במסלול, כרטיס לקוח, יומן) ו«אחורה» ─
// ‼ הדף ארוך בטלפון; בלי זה «אחורה» החזיר לראש הדף עם השורה סגורה.
const RETURN_KEY = 'pivo.office.automations.return';
const RETURN_TTL_MS = 30 * 60_000;
interface ReturnTicket { open: string[]; row?: string | null; top?: number; y: number; at: number }
function peekTicket(): ReturnTicket | null {
  try {
    const t = JSON.parse(sessionStorage.getItem(RETURN_KEY) ?? 'null') as ReturnTicket | null;
    return t && Date.now() - t.at < RETURN_TTL_MS ? t : null;
  } catch { return null; }
}

function Status({ tone, children }: { tone: 'on' | 'off' | 'warn'; children: ReactNode }) {
  return <span className={`of-conn-state is-${tone}`}><span className="of-conn-dot" aria-hidden="true" />{children}</span>;
}

const STATE_TAG: Record<AutoRow['state']['tone'], string> = { on: 'is-on', off: 'is-off', manual: '', warn: 'is-warn' };

/** התוצאה האחרונה של שורה — מה שמוצג בשורה הסגורה. which — איזה מייל (תזכורת / הודעה). */
interface Last { tone: ResultTone | 'none'; text: string; which?: string; clientId?: string; at?: string }

/** פריט ב«צריך אותך»: השורה, מה קרה, ולאיזה לקוח — עם קישור לאן שמכריעים. */
interface Attn { key: string; row: AutoRow; text: string; clientId?: string; event?: RowEvent; more?: number }

/** לאן «להתחברות» מוביל ב«חיבורים» — ומה כתוב על הקישור. */
const CONNECT_LINK: Record<NonNullable<RowEvent['connect']>, { focus: string; text: string }> = {
  shaam: { focus: 'login:shaam', text: 'להתחברות לשע״ם ←' },
  btl: { focus: 'login:btl', text: 'להתחברות לביטוח לאומי ←' },
  worker: { focus: 'login:worker', text: 'למחשב העבודה ←' },
};

export default function AutomationsPage({ clients, focus, go, onOpenClient, draft, setDraft, openLog }: {
  clients: Client[];
  /** מזהה שורה · ‎'reminders'‎ · ‎'notifications'‎ · ‎'rem-<מפתח>'‎ · ‎'intake'‎ · מזהה פעולה (shaam-sync…). */
  focus?: string | null;
  go: (p: OfficePageId, focus?: string) => void;
  /**
   * ‼ target — איפה בתוך הלשונית (כרטיס הרשות, מרכז הייצוג, המייל ביומן); המעטפת
   * היא שנוחתת עליו (ClientTarget). בלעדיו — ראש הלשונית.
   */
  onOpenClient?: (clientId: string, tab: ClientTab, target?: ClientTarget) => void;
  draft: FirmProfile;
  setDraft: React.Dispatch<React.SetStateAction<FirmProfile>>;
  openLog: (f: ActivityFilter) => void;
}) {
  // ── המסלולים: מה מוגדר לקרות לבד ─────────────────────────────────────────
  const [flows, setFlows] = useState<FlowRow[] | null>(null);
  const [flowsError, setFlowsError] = useState(false);
  const [flowsKey, setFlowsKey] = useState(0);
  useEffect(() => {
    let alive = true;
    void loadOfficeFlows().then(r => {
      if (!alive) return;
      setFlowsError(!r.ok);
      setFlows(r.ok ? r.flows.filter(f => f.status !== 'archived') : null);
    });
    return () => { alive = false; };
  }, [flowsKey]);
  const onboarding = (flows ?? []).find(f => f.trigger === 'quote_approved') ?? null;
  const moments = useMemo(() => (onboarding ? intakeMoments(onboarding) : []), [onboarding]);

  // ── הגדרות המשרד ──────────────────────────────────────────────────────────
  const settings = draft.settings ?? {};
  const officeEmail = (draft.email ?? '').trim();
  const rows = useMemo(() => automationRows({
    flows, flowsError,
    expiryOn: isNotificationEnabled(settings, 'quotation_expiry_reminder'),
    repOn: REP_REMINDERS.filter(r => repReminderConfig(draft, r.audience).enabled).length,
    repTotal: REP_REMINDERS.length,
    firmOn: SWITCHABLE.filter(n => isNotificationEnabled(settings, n.kind)).length,
    firmTotal: SWITCHABLE.length,
    officeEmail,
    actions: AUTOMATION_ACTIONS,
  }), [flows, flowsError, draft, settings, officeEmail]);

  // ── הגעה מעמוד אחר: שורה פתוחה, וגלילה אליה; או חזרה למקום שממנו יצאת ────
  const landed = useMemo(() => resolveAutomationFocus(focus, {
    rowIds: ROW_IDS,
    repAudiences: REP_REMINDERS.map(r => r.audience),
    notificationKinds: FIRM_NOTIFICATIONS.map(n => n.kind),
  }), [focus]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const ticket = useMemo(() => (landed ? null : peekTicket()), []);
  const [open, setOpen] = useState<Set<string>>(() => new Set(landed?.row ? [landed.row] : ticket?.open ?? []));
  const openRef = useRef(open);
  openRef.current = open;
  const toggle = (id: string) => setOpen(s => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const reveal = useCallback((id: string) => {
    setOpen(s => new Set(s).add(id));
    requestAnimationFrame(() => {
      const el = document.querySelector(`[data-auto="${CSS.escape(id)}"]`);
      el?.scrollIntoView({ block: 'start', behavior: 'smooth' });
      el?.classList.add('is-flash');
    });
  }, []);
  // ‼ גלילה אחת לכל הגעה: השורה כבר פתוחה ברינדור הראשון (state התחלתי).
  useEffect(() => {
    if (!landed) return;
    const el = landed.sub ? document.querySelector(`[data-rem="${CSS.escape(landed.sub)}"]`)
      : landed.row ? document.querySelector(`[data-auto="${CSS.escape(landed.row)}"]`)
      : document.querySelector(`[data-auto-group="${landed.group}"]`);
    el?.scrollIntoView({ block: landed.sub ? 'center' : 'start' });
    if (landed.row || landed.sub) el?.classList.add('is-flash');
  }, [landed]);
  // חזרה: אותן שורות פתוחות, והשורה שממנה יצאת באותו גובה במסך. ‼ אחרי הציור —
  // המעטפת גוללת לראש העמוד באותו מעבר, והתוצאות נטענות ומזיזות את הגובה.
  useEffect(() => {
    if (!ticket) return;
    try { sessionStorage.removeItem(RETURN_KEY); } catch { /* אחסון חסום */ }
    const place = () => {
      const el = ticket.row ? document.querySelector(`[data-auto="${CSS.escape(ticket.row)}"]`) : null;
      if (el && ticket.top !== undefined) window.scrollBy(0, el.getBoundingClientRect().top - ticket.top);
      else window.scrollTo(0, ticket.y);
    };
    const raf = requestAnimationFrame(place);
    const t = window.setTimeout(place, 500);
    return () => { cancelAnimationFrame(raf); window.clearTimeout(t); };
  }, [ticket]);
  const lastRow = useRef<string | null>(null);
  const leave = useCallback(() => {
    try {
      const row = lastRow.current;
      const el = row ? document.querySelector(`[data-auto="${CSS.escape(row)}"]`) : null;
      const t: ReturnTicket = { open: [...openRef.current], row, top: el?.getBoundingClientRect().top, y: window.scrollY, at: Date.now() };
      sessionStorage.setItem(RETURN_KEY, JSON.stringify(t));
    } catch { /* אחסון חסום — החזרה תהיה לראש העמוד */ }
  }, []);
  const goTo = (p: OfficePageId, f?: string) => { leave(); go(p, f); };
  // ‼ כרטיס הלקוח נפתח מלמעלה: בלי זה הוא נפתח בגובה שבו היית כאן — בטלפון, בתחתית
  // תיק המס, בלי שם הלקוח ובלי הלשוניות. הגובה כאן נשמר ב-leave לפני כן («אחורה»).
  const openClient = onOpenClient ? (id: string, tab: ClientTab, target?: ClientTarget) => {
    leave();
    window.scrollTo({ top: 0 });
    onOpenClient(id, tab, target);
  } : undefined;
  const toLog = (f: ActivityFilter) => { leave(); openLog(f); };

  // ── מה קרה: לכל שורה בנפרד ────────────────────────────────────────────────
  const res = useAutomationResults(rows, AUTOMATION_ACTION_TYPES);
  const now = res.now;

  // ‼ הריצות של מסלול הקליטה — מי נכנס אליו ומתי. נקרא ישירות (קריאה בלבד, RLS).
  const [runs, setRuns] = useState<RunRow[] | null>(null);
  const [runsError, setRunsError] = useState(false);
  useEffect(() => {
    if (!onboarding) return;
    let alive = true;
    void supabase.from('flow_runs').select('id,client_id,status,started_at')
      .eq('flow_id', onboarding.id).order('started_at', { ascending: false }).limit(RUNS_SHOWN)
      .then(({ data, error }) => {
        if (!alive) return;
        setRunsError(!!error);
        setRuns(error ? [] : ((data ?? []) as { id: string; client_id: string; status: RunStatus; started_at: string }[])
          .map(r => ({ id: r.id, clientId: r.client_id, status: r.status, startedAt: r.started_at })));
      });
    return () => { alive = false; };
  }, [onboarding?.id]);

  const nameOf = useCallback((id?: string | null) => {
    const c = id ? clients.find(x => x.id === id) : undefined;
    return c ? `${c.firstName ?? ''} ${c.lastName ?? ''}`.trim() : '';
  }, [clients]);

  /** התוצאות של שורה: null — נטען · 'error' — לא נטען. */
  const eventsOf = useCallback((r: AutoRow): RowEvent[] | 'error' | null => {
    const src = r.source;
    if (src.type === 'emails') {
      const m = res.mails[r.id];
      const n = src.notices ? res.notices[src.notices] : [];
      if (m === 'error' || n === 'error') return 'error';
      if (!m || !n) return null;
      return rowEvents(m, n, now);
    }
    if (src.type === 'jobs') {
      const j = res.jobs[src.actionType];
      if (j === 'error') return 'error';
      if (!j) return null;
      // ‼ גם קריאה במסלול שלא רצה וממתינה לך — היא לא משימה, אבל היא המצב האמיתי.
      const waits = Array.isArray(res.waits)
        ? res.waits.filter(w => w.actionType === src.actionType).map(w => waitEvent(w, ACTION_WAIT_REASON)) : [];
      return [...j.map(jobEvent), ...waits].sort((a, b) => String(b.at ?? '').localeCompare(String(a.at ?? '')));
    }
    return null;
  }, [res.mails, res.notices, res.jobs, res.waits, now]);

  // ‼ הודעה ללקוח פותחת את «בקשות» (שם המגש שבו מכריעים); מייל אחר — את «פעילות».
  const tabOf = (r: AutoRow): ClientTab => (r.action ? r.action.clientTab
    : r.source.type === 'emails' && r.source.notices ? 'journey' : 'log');
  /** איפה בתוך הלשונית: כרטיס הרשות / מרכז הייצוג לפעולה; המייל עצמו ב«פעילות». */
  const targetOf = (r: AutoRow, e?: RowEvent): ClientTarget | undefined => (r.action ? r.action.clientTarget
    : tabOf(r) === 'log' && e?.email?.id ? `log:${e.email.id}` : undefined);
  /** איזה מייל מתוך השורה — כשבשורה כמה סוגים (איזו תזכורת, איזו הודעה אליך). */
  const whichOf = (r: AutoRow, e: RowEvent): string | undefined => {
    const kind = e.email?.kind;
    if (!kind) return undefined;
    if (r.id === 'rep-reminders') return REP_NAME_BY_KIND[kind];
    if (r.id === 'notifications') return NOTIFICATION_BY_KIND[kind.replace(/^notify_/, '')]?.label ?? e.email?.subject;
    return undefined;
  };

  const lastOf = (r: AutoRow): Last => {
    const src = r.source;
    if (src.type === 'emails' || src.type === 'jobs') {
      const evs = eventsOf(r);
      if (evs === null) return { tone: 'muted', text: 'טוען…' };
      if (evs === 'error') return { tone: 'muted', text: 'לא נטען' };
      const e = evs[0];
      if (!e) {
        return { tone: 'muted', text: src.type === 'jobs' ? 'עוד לא רצה'
          : r.id === 'notifications' || r.id === 'flow-notify' ? 'עוד לא נשלחה' : 'עוד לא יצא' };
      }
      return { tone: e.tone, text: e.label, which: whichOf(r, e), clientId: e.clientId, at: e.timeInLabel ? undefined : e.at };
    }
    if (src.type === 'runs') {
      const run = runs?.[0];
      if (run) return { tone: 'ok', text: 'נפתח', clientId: run.clientId, at: run.startedAt };
      const active = onboarding?.activeRuns ?? 0;
      if (runs === null) return { tone: 'muted', text: 'טוען…' };
      if (runsError && !active) return { tone: 'muted', text: 'לא נטען' };
      return { tone: 'muted', text: active ? `${active} לקוחות באמצע הקליטה` : 'עוד לא נפתח לאף לקוח' };
    }
    return { tone: src.text ? 'muted' : 'none', text: src.text || '—' };
  };

  // ‼ «צריך אותך» — רק מה שמחייב פעולה (raisesAttention): לכל לקוח התוצאה האחרונה
  // שלו, מהשבוע האחרון, במנגנון שפועל; ו«לא ידוע אם יצא/נקלט» תמיד. ועוד הגדרה חסרה.
  // ‼ עד ATTENTION_PER_ROW לכל שורה; השאר — «ועוד N», שפותח את השורה עם כל התוצאות.
  const attention: Attn[] = [];
  for (const r of rows) {
    if (r.state.tone === 'warn' && !flowsError) { attention.push({ key: r.id, row: r, text: r.state.label }); continue; }
    const evs = eventsOf(r);
    if (!Array.isArray(evs)) continue;
    const list = attentionEvents(evs, { on: r.state.tone !== 'off', now });
    for (const e of list.slice(0, ATTENTION_PER_ROW)) {
      attention.push({ key: `${r.id}:${e.id}`, row: r, text: e.label, clientId: e.clientId, event: e });
    }
    if (list.length > ATTENTION_PER_ROW) {
      attention.push({ key: `${r.id}:more`, row: r, text: `ועוד ${list.length - ATTENTION_PER_ROW}`, more: list.length - ATTENTION_PER_ROW });
    }
  }

  // ── חיבורים ─────────────────────────────────────────────────────────────
  const rd = useShaamReadiness();
  const st = rd.status as Record<string, { connected?: boolean } | undefined>;
  const workerOn = !rd.workerOffline || !rd.btlWorkerOffline;
  const shaamOn = !rd.workerOffline && !!st.shaam?.connected;
  const btlOn = !rd.btlWorkerOffline && !!st.btl?.connected;

  function lastLine(r: AutoRow) {
    const l = lastOf(r);
    const who = nameOf(l.clientId);
    return (
      <>
        {l.tone !== 'none' && <RunDot tone={l.tone} />}
        <span className="of-al-last-text">
          {l.text}{l.which ? ` · ${l.which}` : ''}{who ? ` · ${who}` : ''}{l.at ? <span className="of-al-when"> · {fmtWhen(l.at, now)}</span> : null}
        </span>
      </>
    );
  }

  const stageLinks = (uses: StageUse[], empty: ReactNode) => (uses.length === 0 ? <div>{empty}</div> : (
    <ul className="of-autop-uses">
      {uses.map(u => (
        <li key={`${u.flowId}:${u.stageKey}`}>
          <GoTo onClick={() => goTo('flows', flowAnchor(u.flowId, u.stageKey))}>{u.flowName} ← {u.stageName}</GoTo>
          {u.detail && (u.auto === undefined
            ? <span className="of-muted">{u.detail}</span>
            : <span className={`of-tag ${u.auto ? 'is-auto' : 'is-off'}`}>{u.detail}</span>)}
        </li>
      ))}
    </ul>
  ));

  const results = (title: string, body: ReactNode, more?: ReactNode) => (
    <div className="of-auto-runs">
      <h4 className="of-auto-runs-title">{title}</h4>
      {body}
      {more && <p className="of-muted of-autop-more">{more}</p>}
    </div>
  );

  const eventResults = (r: AutoRow, empty: string, opts: { title?: string; log?: ActivityFilter; noteOf?: (e: RowEvent) => string | undefined } = {}) => {
    const evs = eventsOf(r);
    const tab = tabOf(r);
    return results(opts.title ?? 'מה יצא לאחרונה',
      evs === null ? <p className="of-muted">טוען…</p>
        : evs === 'error' ? <p className="of-muted">לא נטען — זה לא אומר שלא יצא.</p>
        : <EventRuns list={evs} clients={clients} now={now} empty={empty} noteOf={opts.noteOf}
            onOpenClient={openClient ? (id, e) => openClient(id, tab, targetOf(r, e)) : undefined} />,
      opts.log && <GoTo onClick={() => toLog(opts.log!)}>ביומן המיילים ←</GoTo>);
  };

  function detail(r: AutoRow): ReactNode {
    switch (r.id) {
      case 'flow-mail':
        return (<>
          <dl className="of-auto-dl">
            <dt>איפה מגדירים</dt>
            <dd>
              בשלב במסלול — «איך מגיע ללקוח»: «{DELIVERY_LABELS.auto.short}».
              {stageLinks(r.uses ?? [], <GoTo onClick={() => goTo('flows')}>למסלולים ←</GoTo>)}
            </dd>
            <dt>מה הלקוח מקבל</dt>
            <dd>
              {AUTO_MAIL_RECORDED}. הנוסח — לפי הלקוח:
              <ul className="of-autop-uses">
                {FLOW_MAIL_TEMPLATES.map(t => (
                  <li key={t.key}>
                    <GoTo onClick={() => goTo('emails', `tpl:${t.key}`)}>{emailTemplateTitle(t.key)} ←</GoTo>
                    <span className="of-muted">{t.when}</span>
                  </li>
                ))}
              </ul>
            </dd>
            <dt>לעצור לפני שיוצא</dt>
            <dd>בכרטיס הלקוח — «אל תשלח לבד», כל עוד המייל לא יצא. עצירת המסלול אצל הלקוח עוצרת גם אותו.</dd>
          </dl>
          {eventResults(r, 'עוד לא יצא מייל מרוכז לבד.', { title: 'מה קרה לאחרונה', log: { label: 'מיילים מרוכזים אוטומטיים', kinds: NOTICE_NEW_KINDS, origin: 'auto' } })}
        </>);
      case 'flow-reminder':
        return (<>
          <dl className="of-auto-dl">
            <dt>איפה מגדירים</dt>
            <dd>
              בשלב במסלול — «תזכורת». בשלב «{DELIVERY_LABELS.page.short}» אין מייל ולכן גם אין תזכורת.
              {stageLinks(r.uses ?? [], <GoTo onClick={() => goTo('flows')}>למסלולים ←</GoTo>)}
            </dd>
            <dt>מה הלקוח מקבל</dt>
            <dd><GoTo onClick={() => goTo('emails', 'tpl:portal_reminder')}>הנוסח של התזכורת ←</GoTo></dd>
            {/* ‼ השרת לא שולח תזכורת לבד לריצה בעצירה (214: _client_notice_items); בחידוש — כרגיל. */}
            <dt>לעצור</dt>
            <dd>עצירת המסלול אצל הלקוח עוצרת גם את התזכורת; בחידוש היא ממשיכה.</dd>
            <dt>ידנית</dt>
            <dd>«תזכורת» בכרטיס הלקוח — כמה ימים אחרי המייל האחרון.</dd>
          </dl>
          {eventResults(r, 'עוד לא יצאה תזכורת לבד.', { title: 'מה קרה לאחרונה', log: { label: 'תזכורות אוטומטיות על מה שממתין בדף', kinds: ['portal_reminder'], origin: 'auto' } })}
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
          {eventResults(r, 'לא יצאה עדיין.', { log: { label: 'תזכורות להצעת מחיר', kinds: ['quotation_reminder'] } })}
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
            מה הלקוח רואה כשצריך לאשר באזור האישי — <GoTo onClick={() => goTo('emails', 'rep:portal')}>הכרטיס והמדריך המצולם ←</GoTo>
          </p>
          {eventResults(r, 'עוד לא יצאה תזכורת.', {
            noteOf: e => (e.email?.kind ? REP_NAME_BY_KIND[e.email.kind] : undefined),
            log: { label: 'תזכורות ייצוג', kinds: REP_REMINDER_KINDS },
          })}
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
          {eventResults(r, 'עוד לא יצא מייל אוטומטי לגורם חיצוני.')}
        </>);
      case 'notifications':
        return (<>
          <p className={`of-asec-sub${officeEmail ? '' : ' is-error'}`}>
            {officeEmail
              ? <>נשלח אל <bdi className="of-ltr">{officeEmail}</bdi> · <GoTo onClick={() => goTo('profile', 'details')}>שינוי הכתובת</GoTo></>
              : <>אין אימייל למשרד, ולכן שום הודעה לא נשלחת. <GoTo onClick={() => goTo('profile', 'details')}>הוספת כתובת</GoTo></>}
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
          {eventResults(r, 'עוד לא נשלחה אליך הודעה.', { log: { label: 'התראות למשרד', internal: true } })}
        </>);
      case 'flow-notify':
        return (<>
          <dl className="of-auto-dl">
            <dt>איפה מגדירים</dt>
            <dd>
              בשלב במסלול — «הודעה אליך כשהשלב הושלם».
              {stageLinks(r.uses ?? [], <GoTo onClick={() => goTo('flows')}>למסלולים ←</GoTo>)}
            </dd>
          </dl>
          {eventResults(r, 'עוד לא נשלחה.', { log: { label: 'הודעות על שלב שהושלם', kinds: [FLOW_DONE_KIND] } })}
        </>);
      case 'intake':
        if (!onboarding) {
          if (flowsError) return <p className="of-muted">המסלולים לא נטענו. <GoTo onClick={() => goTo('flows')}>למסלולים ←</GoTo></p>;
          // ‼ משרד חדש — לא חוסר: המסלול נוצר באישור הראשון (כמו שאומר «מסלולים»).
          // כאן רק מה שלא נאמר בשורה: איך זה מגיע ללקוח, ואיפה עורכים אחר כך.
          return (
            <dl className="of-auto-dl">
              <dt>איך מגיע ללקוח</dt>
              <dd>{DELIVERY_LABELS[INTAKE_FIRST_DELIVERY].long}.</dd>
              <dt>איפה עורכים</dt>
              <dd>במסלולים — מהרגע שהמסלול נוצר. <GoTo onClick={() => goTo('flows')}>למסלולים ←</GoTo></dd>
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
                        <GoTo onClick={() => goTo('flows', flowAnchor(onboarding.id, s.key))}>עריכה ←</GoTo>
                      </div>
                      <div className="of-arow-meta">{intakeStageMeta(s)}</div>
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ol>
          {results('נפתח לאחרונה',
            runs === null ? <p className="of-muted">טוען…</p>
              : runs.length === 0 ? <p className="of-muted">{(onboarding.activeRuns ?? 0) > 0 ? `${onboarding.activeRuns} לקוחות באמצע הקליטה.` : runsError ? 'הרשימה לא נטענה — זה לא אומר שלא נפתח.' : 'עוד לא נפתח לאף לקוח.'}</p>
              : (
                <ul className="of-auto-runlist">
                  {runs.map(run => {
                    const who = nameOf(run.clientId);
                    return (
                      <li key={run.id}>
                        <RunDot tone={run.status === 'cancelled' ? 'muted' : run.status === 'paused' ? 'warn' : 'ok'} />
                        <span className="of-auto-run-main">
                          {who && openClient
                            ? <button type="button" className="of-link" onClick={() => openClient(run.clientId, 'journey')}
                                aria-label={`פתיחת ${who} · בקשות`}>{who}</button>
                            : <span className="of-auto-run-label">{who || 'לקוח'}</span>}
                          <span className="of-auto-run-meta">{RUN_STATUS_LABELS[run.status] ?? run.status} · {fmtWhen(run.startedAt, now)}</span>
                        </span>
                      </li>
                    );
                  })}
                </ul>
              ),
            <>{(onboarding.activeRuns ?? 0) > 0 && (runs?.length
                ? `${onboarding.activeRuns} לקוחות באמצע — שינוי במסלול חל על חדשים · `
                : 'שינוי במסלול חל על לקוחות חדשים · ')}
              <GoTo onClick={() => goTo('flows', flowAnchor(onboarding.id))}>למסלול הקליטה ←</GoTo></>)}
        </>);
      default:
        return r.action ? actionDetail(r) : null;
    }
  }

  function actionDetail(r: AutoRow): ReactNode {
    const a = r.action!;
    const jobs = a.actionType ? res.jobs[a.actionType] : undefined;
    const list = Array.isArray(jobs) ? jobs.slice(0, RUNS_SHOWN) : [];
    // ‼ קריאה במסלול שלא רצה (שער שלא התקיים) — כאן, עם הסיבה, ולא «עוד לא רצה».
    const waits = a.flow && Array.isArray(res.waits)
      ? res.waits.filter(w => w.actionType === a.actionType).map(w => waitEvent(w, ACTION_WAIT_REASON)) : [];
    const waitClients = new Set(waits.map(w => w.clientId)).size;
    return (<>
      <dl className="of-auto-dl">
        <dt>מה זה עושה</dt>
        <dd>{a.what}</dd>
        {a.automatic && <dt>מתי זה רץ לבד</dt>}
        {a.automatic && <dd>{a.automatic}</dd>}
        {a.flow && <dt>במסלולים</dt>}
        {a.flow && (
          <dd>
            {stageLinks(r.uses ?? [], <span className="of-muted">עוד לא באף מסלול.</span>)}
            <div className="of-al-gates">
              «לבד» רץ רק כשכל אלה מתקיימים:
              <ul className="of-auto-needs">{FLOW_AUTO_GATES.map(g => <li key={g}>{g}</li>)}</ul>
              {FLOW_AUTO_FALLBACK}
            </div>
          </dd>
        )}
        {a.needs.length > 0 && <dt>צריך מראש</dt>}
        {a.needs.length > 0 && <dd><ul className="of-auto-needs">{a.needs.map(n => <li key={n}>{n}</li>)}</ul></dd>}
        <dt>איפה רואים את התוצאה</dt>
        <dd>{a.results}</dd>
      </dl>
      {waits.length > 0 && results(waitClients === 1 ? 'ממתינה לך אצל לקוח אחד' : `ממתינה לך אצל ${waitClients} לקוחות`,
        <EventRuns list={waits} clients={clients} now={now} empty="" shown={RUNS_SHOWN}
          onOpenClient={openClient ? id => openClient(id, a.clientTab, a.clientTarget) : undefined} />,
        waits.length > RUNS_SHOWN ? `ועוד ${waits.length - RUNS_SHOWN}.` : undefined)}
      {a.flow && res.waits === 'error' && (
        <p className="of-muted of-autop-more">קריאות במסלולים שממתינות לך — לא נטענו. זה לא אומר שאין.</p>
      )}
      {results('הרצות אחרונות',
        jobs === 'error' ? <p className="of-muted">לא נטען — זה לא אומר שלא רצו. <button type="button" className="of-link" onClick={() => void res.reloadJobs()}>לנסות שוב</button></p>
          : jobs === undefined || jobs === null ? <p className="of-muted">טוען…</p>
          : list.length === 0 ? <p className="of-muted">עוד לא רצה אצלך.</p>
          : (
            <ul className="of-auto-runlist">
              {list.map(j => {
                const s = summarizeRun(j);
                const who = nameOf(j.clientId);
                return (
                  <li key={j.id}>
                    <RunDot tone={s.tone} />
                    <span className="of-auto-run-main">
                      <span className="of-auto-run-label">{s.label}</span>
                      {s.auto && <span className="of-tag is-auto">לבד</span>}
                      {runIsStale(j, now) && <span className="of-tag is-off">נתון ישן</span>}
                      {s.note && <span className="of-auto-run-note">{s.note}</span>}
                    </span>
                    <span className="of-auto-run-end">
                      {who && j.clientId && openClient
                        ? <button type="button" className="of-link" onClick={() => openClient(j.clientId, a.clientTab, a.clientTarget)}
                            aria-label={`פתיחת ${who} · ${a.clientTab === 'taxfile' ? 'תיק מס' : 'בקשות'}`}>{who}</button>
                        : <span>{who || 'לקוח'}</span>}
                      <span className="of-auto-run-when">{fmtWhen(runTime(j), now)}</span>
                    </span>
                  </li>
                );
              })}
            </ul>
          ))}
    </>);
  }

  const vat = AUTOMATION_ACTIONS.find(a => !a.actionType);

  return (
    <div className="of-al" onClickCapture={e => { lastRow.current = (e.target as Element).closest?.('[data-auto]')?.getAttribute('data-auto') ?? null; }}>
      {attention.length > 0 && (
        <div className="of-al-attn" role="status">
          <b>צריך אותך:</b>
          <ul>
            {attention.map(({ key, row: r, text, clientId, event, more }) => {
              const who = nameOf(clientId);
              // ‼ מה שחסר הוא חיבור — הקישור הוא «להתחברות», לא כרטיס הלקוח (שם אין מה לעשות).
              const conn = event?.connect ? CONNECT_LINK[event.connect] : null;
              return (
                <li key={key}>
                  <button type="button" className="of-link" onClick={() => reveal(r.id)}
                    aria-label={more ? `${r.name} — עוד ${more}: פתיחת השורה` : undefined}>{r.name} — {text}</button>
                  {conn && (
                    <button type="button" className="of-link of-al-attn-who" onClick={() => goTo('connections', conn.focus)}>{conn.text}</button>
                  )}
                  {who && clientId && openClient && (
                    <button type="button" className="of-link of-al-attn-who" onClick={() => openClient(clientId, tabOf(r), targetOf(r, event))}
                      aria-label={`פתיחת ${who}`}>{who} ←</button>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {flowsError && (
        <div className="of-error-box" role="alert">
          לא הצלחנו לטעון את המסלולים — זה לא אומר שאין בהם דבר שקורה לבד.{' '}
          <button type="button" className="of-link" onClick={() => { setFlowsError(false); setFlows(null); setFlowsKey(k => k + 1); }}>לנסות שוב</button>
        </div>
      )}

      {AUTO_GROUPS.map(g => {
        const list = rows.filter(r => r.group === g.id);
        return (
          <section key={g.id} className="of-al-group" data-auto-group={g.id} aria-labelledby={`of-al-g-${g.id}`}>
            <div className="of-al-ghead">
              <h2 className="of-al-gtitle" id={`of-al-g-${g.id}`}>{g.title}</h2>
              <span className="of-al-col" aria-hidden="true">מה מפעיל</span>
              <span className="of-al-col" aria-hidden="true">תוצאה אחרונה</span>
            </div>
            {g.id === 'authority' && (
              <div className="of-auto-conn">
                <ul className="of-auto-conn-list" aria-label="מצב החיבורים">
                  <li><span className="of-auto-conn-name">מחשב העבודה</span><Status tone={workerOn ? 'on' : 'warn'}>{workerOn ? 'פעיל' : 'לא פעיל'}</Status></li>
                  <li><span className="of-auto-conn-name">שע״ם</span>{rd.workerOffline ? <Status tone="warn">לא זמין</Status> : shaamOn ? <Status tone="on">מחובר</Status> : <Status tone="off">לא מחובר</Status>}</li>
                  <li><span className="of-auto-conn-name">ביטוח לאומי</span>{rd.btlWorkerOffline ? <Status tone="warn">לא זמין</Status> : btlOn ? <Status tone="on">מחובר</Status> : <Status tone="off">לא מחובר</Status>}</li>
                </ul>
                <p className="of-auto-conn-note">
                  חיבור הוא רק כניסה — לבד הוא לא מריץ דבר. <GoTo onClick={() => goTo('connections')}>לחיבורים ←</GoTo>
                </p>
              </div>
            )}
            <ul className="of-al-list">
              {list.map(r => {
                const isOpen = open.has(r.id);
                const bodyId = `of-al-b-${r.id}`;
                return (
                  <li key={r.id} className={`of-al-row${isOpen ? ' is-open' : ''}`} data-auto={r.id}>
                    <button type="button" className="of-al-head" aria-expanded={isOpen} aria-controls={bodyId}
                      onClick={() => toggle(r.id)}>
                      <span className="of-al-what">
                        <span className="of-al-title">
                          <span className="of-al-name">{r.name}</span>
                          <span className={`of-tag ${STATE_TAG[r.state.tone]}`}>{r.state.label}</span>
                        </span>
                        <span className="of-al-effect">{r.effect}</span>
                      </span>
                      <span className="of-al-trigger"><span className="of-al-k">מה מפעיל: </span>{r.trigger}</span>
                      <span className="of-al-last">{lastLine(r)}</span>
                      <span className="of-auto-chev" aria-hidden="true">{isOpen ? '−' : '+'}</span>
                    </button>
                    {isOpen && (
                      <div className="of-al-body" id={bodyId}>
                        {/* בטלפון «מה קורה» מקופל לתוך הפתיחה — השם אומר את העיקר. */}
                        <p className="of-al-effect-sm">{r.effect}</p>
                        {detail(r)}
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
            {g.id === 'authority' && (
              <p className="of-muted of-al-foot">
                {/* ‼ «תמיד בלחיצה שלך» סתר את «שליחת הטופס החתום» שממשיכה לבד כשמסמך חסר מגיע (208). */}
                אין בדיקות תקופתיות ברקע — רק מה שכתוב בעמודה «מה מפעיל». פעולה שמשנה אצל הרשות מתחילה תמיד בלחיצה שלך — רק שליחה שנעצרה בגלל מסמך חסר ממשיכה לבד כשהמסמך מגיע.
                {vat && <> {vat.name}: {vat.short}</>}
              </p>
            )}
          </section>
        );
      })}
    </div>
  );
}

// ─── «מיילים» · הנוסח של כל מייל שיוצא, ומה נשלח ─────────────────────────────
// (סבב 3, 1.10.2026) אוחדו לכאן: «נוסחי מיילים», ההודעות של «ייצוג» ו«יומן מיילים».
// רשימה אחת לפי מתי המייל יוצא; כל שורה — שם, מתי, האם הנוסח שלך, ו«עריכה».
// העריכה בחלון צד אחיד לכולם: עריכה → «החלה» → «שמירה» בתחתית המשרד.
//
// ‼ שלוש מדרגות נוסח במיילי הבקשות (מערכת → נוסח המשרד → בעריכה) נשמרו כמו
// שהיו; ראה TemplateEditor. המכתב לרו״ח הקודם — עם מרקר, וסעיפים נגזרים.
// ‼ «מה נשלח» הוא היומן עצמו (EmailActivityModule) — לקריאה בלבד.
import { useEffect, useState } from 'react';
import type { FirmProfile } from '../../../types/firmProfile';
import type { Client } from '../../../types';
import {
  emailTemplateTitle, eventOfTemplateKey, isTemplateVariant, placeholdersForKey, REQUEST_UPDATE_TEMPLATE_KEYS,
  templateForKey, WELCOME_LINE, type SavedTemplateKey, type StepEmailKind,
} from '../../../../supabase/functions/_shared/stepTemplates.ts';
import {
  DEFAULT_RELEASE_TEMPLATE, RELEASE_TEMPLATE_KEY, RELEASE_TEMPLATE_VARS, upgradeReleaseTemplateBody,
} from '../../../utils/releaseLetter';
import { TemplateEditor, type CommTemplate, type EditorSpec } from './TemplateEditor';
import EmailActivityModule from '../../EmailActivity/EmailActivityModule';
import { REP_MESSAGES, REP_MESSAGE_EMAIL_KINDS, RepMessageDrawer, isRepMessageCustom } from '../RepresentationSettingsSection';
import PaperlessLinkField, { paperlessInviteUrl, withPaperlessInviteUrl } from './PaperlessLinkField';
import { SentLine, fetchEmails } from './recentSends';
import { REP_REMINDERS, EXPIRY_SUBJECT } from './reminderSpecs';
import { repReminderConfig } from '../RepresentationSettingsSection';
import { isNotificationEnabled } from '../../../../supabase/functions/_shared/accountantNotifications.ts';
import { expiryState, repRemindersState } from '../../../features/automation/automationList';
import { emailTemplateKeyOf, type EmailMessage } from '../../../types/emailActivity';
import { GoTo } from '../officeUi';
import type { OfficePageId } from '../officeModel';
import type { ActivityFilter } from './activityFilter';
import { LinkDestinationView } from '../LinkDestinationView';
import { STEP_EMAIL_CTA, stepEmailDestinations, TAX_PERSONAL_AREA, linkHost } from '../../../features/links/linkDestinations';
import RepApprovalGuide, { RepApprovalGuideButton, REP_APPROVAL_GUIDE_GENERIC_NOTE } from '../../portal/RepApprovalGuide';
import MeetingTemplateDrawer, { MEETING_TEMPLATE_TITLES, MEETING_TEMPLATE_WHEN, isMeetingTemplateCustom } from '../../../features/meetings/MeetingTemplateDrawer';
import { MEETING_KINDS, MEETING_TEMPLATE_KEY, type MeetingKind } from '../../../../supabase/functions/_shared/meetingInvite';


type TemplateKey = SavedTemplateKey | typeof RELEASE_TEMPLATE_KEY;
export type EmailKey = TemplateKey;

/** המפרט של מייל לפי המפתח — לחלון העריכה מעמודים אחרים (בקשות ללקוחות). */
export function specForKey(key: EmailKey): TemplateSpec {
  return key === RELEASE_TEMPLATE_KEY ? RELEASE_SPEC : stepSpec(key as SavedTemplateKey);
}

/**
 * ‼ תבנית שנשמרה לפני שמשפט הפתיחה הפך לסעיף נגזר עדיין מחזיקה אותו ביחיד,
 * והיא גוברת על ברירת המחדל. משדרגים בקריאה — גם את הנוסח הפעיל וגם את עוגן
 * «נוסח המשרד», אחרת חזרה לעוגן הייתה מחזירה בדיוק את המשפט השבור.
 */
function upgradedEntry(kind: TemplateKey, entry: CommTemplate): CommTemplate {
  if (kind !== RELEASE_TEMPLATE_KEY) return entry;
  const body = entry.body === undefined ? undefined : upgradeReleaseTemplateBody(entry.body);
  const firmDefault = entry.firmDefault
    ? { ...entry.firmDefault, body: upgradeReleaseTemplateBody(entry.firmDefault.body) }
    : undefined;
  if (body === entry.body && firmDefault?.body === entry.firmDefault?.body) return entry;
  return { ...entry, ...(body !== undefined ? { body } : {}), ...(firmDefault ? { firmDefault } : {}) };
}

interface TemplateSpec extends EditorSpec {
  key: TemplateKey;
  title: string;
  /** מתי המייל יוצא — שורה אחת ברשימה. */
  when: string;
  recipient: string;
  /** סוגי המייל ביומן — לשורה «נשלחו». */
  logKinds: string[];
}

// ‼ מייל ראשון ומייל המשך הם שני נוסחים נפרדים (savedTemplateKey): נוסח «פתחנו לכם
// דף» שנשמר למייל הראשון לא יוצא ללקוח שכבר קיבל מייל. כך גם «הקישור לדף» —
// בלי פעולה נדרשת, או עם מה שממתין ללקוח.
const STEP_WHEN: Record<SavedTemplateKey, string> = {
  process_open: 'המייל הראשון ללקוח על הדף האישי — ב«שלח מייל…» בכרטיס הלקוח, או לבד בשלב שמוגדר «מייל אוטומטי»',
  process_open_later: 'כשנפתחו בקשות חדשות ללקוח שכבר קיבל מייל על הדף — ב«שלח מייל…» בכרטיס הלקוח, או לבד בשלב שמוגדר «מייל אוטומטי»',
  documents_sent: 'כשנשלחו מסמכים שהלקוח עוד לא פתח — ב«שלח מייל», או לבד לפי השלב',
  status_update: '⋯ → שליחת הקישור לדף במייל, כשאין משהו חדש להודיע עליו ואין בקשות שממתינות ללקוח',
  status_update_actions: '⋯ → שליחת הקישור לדף במייל, כשאין משהו חדש להודיע עליו ויש בקשות שממתינות ללקוח',
  // ‼ יוצא רק לגורם חיצוני (רו״ח קודם או גורם אחר) — ללקוח לא נשלחת תזכורת על בקשה בודדת.
  step_reminder: 'בבקשה לגורם חיצוני — ב«פתח טיוטת מייל לשליחה» וב«שלח תזכורת», או לבד כשהבקשה מוגדרת «אוטומטי»',
  portal_reminder: 'תזכורת — כשאתה שולח תזכורת מכרטיס הלקוח, או לבד לפי השלב',
  intake_questionnaire: 'בבקשת «עדכון סטטוס מס» — עם קישור לשאלון',
  paperless_invite: 'בבקשת «הרשמה לפייפרלס» — עם קישור ההזמנה שלך',
  retainer_request: 'בבקשת «הרשאה לתשלום חודשי»',
};

function stepSpec(key: SavedTemplateKey): TemplateSpec {
  const external = key === 'step_reminder';
  return {
    key,
    // ‼ השם — מקום אחד (emailTemplateTitle): «איך ייראה» במסלולים מפנה לשורה בשם הזה.
    title: emailTemplateTitle(key),
    when: STEP_WHEN[key],
    recipient: external ? 'לגורם החיצוני' : 'ללקוח',
    base: templateForKey(key),
    vars: placeholdersForKey(key).map(p => ({ label: p })),
    // send-step-email: לגורם חיצוני {{clientName}} הוא שם הנמען.
    ...(external ? { varLabels: { '{{clientName}}': 'שם הנמען' } } : {}),
    bodyLabel: 'גוף המייל',
    rows: 10,
    // ‼ ביומן שתי הגרסאות נרשמות באותו סוג (process_open / status_update). «נשלחו» לפי
    // הנוסח שיצא (meta.templateKey) כשהיומן שמר אותו — ראה sentOfRow.
    logKinds: [eventOfTemplateKey(key)],
  };
}

/** לגרסה (מייל המשך / עם מה שממתין) — המפתח של השורה הראשית שלה, ולהפך. */
const VARIANT_OF_BASE: Partial<Record<SavedTemplateKey, SavedTemplateKey>> = {
  process_open: 'process_open_later',
  status_update: 'status_update_actions',
};

/**
 * המיילים של שורה בעמוד. ‼ לשני נוסחים של אותו סוג יש סוג אחד ביומן; מה שמפריד ביניהם
 * הוא meta.templateKey. מייל בלי המפתח (ישן) נספר בשורה הראשית — ו-mixed אומר שזה
 * כולל את שני הנוסחים, כדי ש«מייל ראשון» לא ייראה כאילו נשלח כמה פעמים.
 */
function sentOfRow(spec: TemplateSpec, messages: EmailMessage[] | null): { messages: EmailMessage[] | null; mixed: boolean } {
  if (!messages || spec.key === RELEASE_TEMPLATE_KEY) return { messages, mixed: false };
  const key = spec.key as SavedTemplateKey;
  const variant = isTemplateVariant(key);
  const hasVariant = !!VARIANT_OF_BASE[key];
  if (!variant && !hasVariant) return { messages, mixed: false };
  const kind = eventOfTemplateKey(key);
  const mine = messages.filter(m => m.kind === kind && (emailTemplateKeyOf(m) === key || (!variant && !emailTemplateKeyOf(m))));
  return { messages: mine, mixed: hasVariant && mine.some(m => !emailTemplateKeyOf(m)) };
}

const RELEASE_SPEC: TemplateSpec = {
  key: RELEASE_TEMPLATE_KEY,
  title: 'מכתב העברת טיפול',
  when: 'בבקשת «מכתב העברת טיפול» — נשלח לרו״ח הקודם',
  recipient: 'לרו״ח הקודם',
  base: DEFAULT_RELEASE_TEMPLATE,
  vars: RELEASE_TEMPLATE_VARS.map(v => ({ label: `{{${v.name}}}`, hint: v.hint, section: v.section })),
  bodyLabel: 'גוף המכתב',
  rows: 18,
  marker: true,
  logKinds: ['release'],
};

type Item =
  | { type: 'step'; spec: TemplateSpec }
  | { type: 'rep'; id: string; label: string; when: string }
  // ‼ (07.10.2026) ההזמנה לפגישה — אותו נוסח ואותו חלון כמו בספריית הבקשות ← פגישות.
  | { type: 'meeting'; kind: MeetingKind };

const GROUPS: { title: string; items: Item[] }[] = [
  {
    title: 'עדכונים ללקוח על הבקשות',
    // ‼ «תזכורת על בקשה» יוצאת רק לגורם חיצוני — מקומה בקבוצה שלו, למטה.
    items: REQUEST_UPDATE_TEMPLATE_KEYS.filter(k => k !== 'step_reminder').map(k => ({ type: 'step' as const, spec: stepSpec(k) })),
  },
  {
    title: 'ייצוג',
    items: REP_MESSAGES.map(m => ({ type: 'rep' as const, id: m.id, label: m.label, when: m.when })),
  },
  {
    title: 'פייפרלס',
    items: (['paperless_invite', 'retainer_request'] as StepEmailKind[]).map(k => ({ type: 'step' as const, spec: stepSpec(k) })),
  },
  {
    title: 'לרו״ח הקודם ולגורם חיצוני',
    items: [{ type: 'step', spec: RELEASE_SPEC }, { type: 'step', spec: stepSpec('step_reminder') }],
  },
  {
    title: 'פגישות',
    items: MEETING_KINDS.map(kind => ({ type: 'meeting' as const, kind })),
  },
];

/** כל סוגי המייל שיש להם שורה בעמוד — לשאילתה אחת של «נשלחו לאחרונה». */
// ‼ הזמנה לפגישה יוצאת מ-Google, לא מספק הדואר — אין לה שורה ביומן המיילים.
const SENT_KINDS = [...new Set(GROUPS.flatMap(g => g.items.flatMap(i => (
  i.type === 'step' ? i.spec.logKinds : i.type === 'rep' ? REP_MESSAGE_EMAIL_KINDS[i.id] ?? [] : []))))];

function templatesOf(p: FirmProfile): Record<string, CommTemplate> {
  return ((p.settings ?? {}).commTemplates as Record<string, CommTemplate> | undefined) ?? {};
}

function isStepCustom(p: FirmProfile, key: TemplateKey): boolean {
  const e = templatesOf(p)[key];
  return !!e && (e.subject !== undefined || e.body !== undefined);
}

export default function EmailsPage({ draft, saveNow, userId, clients, onOpenClient, focus, logFilter, onClearLogFilter, onWide, go }: {
  draft: FirmProfile;
  /** חלונות העריכה שומרים מיד (useOfficeDraft.saveNow). */
  saveNow: (update: (p: FirmProfile) => FirmProfile) => Promise<string | null>;
  userId: string;
  clients: Client[];
  onOpenClient?: (clientId: string) => void;
  focus?: string | null;
  logFilter?: ActivityFilter | null;
  onClearLogFilter?: () => void;
  /** טבלת «מה נשלח» צריכה רוחב; רשימת הנוסחים — לא. */
  onWide?: (wide: boolean) => void;
  go: (p: OfficePageId, focus?: string) => void;
}) {
  const [view, setView] = useState<'wording' | 'log'>(focus === 'log' || logFilter ? 'log' : 'wording');
  useEffect(() => { if (logFilter) setView('log'); }, [logFilter]);
  useEffect(() => { onWide?.(view === 'log'); }, [view, onWide]);
  useEffect(() => () => onWide?.(false), [onWide]);
  // ‼ ‎focus='rep:<id>'‎ — קישור ישיר לחלון העריכה של הודעת ייצוג (portalCard);
  // ‎'tpl:<מפתח>'‎ — לנוסח של מייל (מ«אוטומציות»: «איך נראה המייל שיוצא לבד»).
  const [editing, setEditing] = useState<Item | null>(() => {
    if (focus?.startsWith('tpl:')) {
      const key = focus.slice(4);
      return GROUPS.flatMap(g => g.items).find(i => (i.type === 'step' && i.spec.key === key)
        || (i.type === 'meeting' && MEETING_TEMPLATE_KEY[i.kind] === key)) ?? null;
    }
    const id = focus?.startsWith('rep:') && focus !== 'rep:guide' ? focus.slice(4) : null;
    const m = id ? REP_MESSAGES.find(r => r.id === id) : undefined;
    return m ? { type: 'rep', id: m.id, label: m.label, when: m.when } : null;
  });
  // ‼ ‎focus='meetings'‎ — מהספרייה («אותו נוסח נפתח גם מ«מיילים»»): נוחתים על קבוצת הפגישות.
  useEffect(() => {
    if (focus !== 'meetings') return;
    requestAnimationFrame(() => document.getElementById('of-mgroup-meetings')?.scrollIntoView({ block: 'start' }));
  }, [focus]);
  // ‼ 04.10.2026 · המדריך המצולם — נפתח ישירות מהשורה (או מקישור ‎rep:guide‎), בלי חלון העריכה.
  const [guideOpen, setGuideOpen] = useState(focus === 'rep:guide');
  // ‼ «נשלחו N ב-30 יום» — שאילתה על סוגי המייל של העמוד ב-30 הימים האחרונים,
  // לא 200 המיילים האחרונים של המשרד (שבהם מייל נדיר נעלם).
  const [messages, setMessages] = useState<EmailMessage[] | null>(null);
  useEffect(() => {
    let alive = true;
    void fetchEmails({ kinds: SENT_KINDS }, { limit: 1000, sinceDays: 30 }).then(list => { if (alive) setMessages(list ?? []); });
    return () => { alive = false; };
  }, [userId]);

  return (
    <>
      <div className="of-seg of-view-seg" role="group" aria-label="תצוגה">
        <button type="button" aria-pressed={view === 'wording'} onClick={() => setView('wording')}>הנוסחים</button>
        <button type="button" aria-pressed={view === 'log'} onClick={() => setView('log')}>מה נשלח</button>
      </div>

      {view === 'log' ? (
        <EmailActivityModule userId={userId} clients={clients} onOpenClient={onOpenClient}
          filter={logFilter ?? null} onClearFilter={onClearLogFilter} />
      ) : (
        <>
          {GROUPS.map(g => (
            <section key={g.title} className="of-mgroup" aria-label={g.title}
              id={g.title === 'פגישות' ? 'of-mgroup-meetings' : undefined}>
              <h2 className="of-mgroup-title">{g.title}</h2>
              <ul className="of-mrows">
                {g.items.map(item => {
                  if (item.type === 'meeting') {
                    const title = MEETING_TEMPLATE_TITLES[item.kind];
                    return (
                      <li key={item.kind} className="of-mrow">
                        <div className="of-mrow-main">
                          <div className="of-mrow-title">
                            {title}
                            {isMeetingTemplateCustom(draft, item.kind) && <span className="of-tag is-on">הנוסח שלך</span>}
                          </div>
                          <div className="of-mrow-when">{MEETING_TEMPLATE_WHEN[item.kind]} · אותו נוסח בספריית הבקשות ← פגישות</div>
                        </div>
                        <button type="button" className="btn btn-secondary btn-sm" onClick={() => setEditing(item)}
                          aria-label={`עריכת הנוסח · ${title}`}>עריכה</button>
                      </li>
                    );
                  }
                  const key = item.type === 'step' ? item.spec.key : item.id;
                  const title = item.type === 'step' ? item.spec.title : item.label;
                  const when = item.type === 'step' ? item.spec.when : item.when;
                  const custom = item.type === 'step' ? isStepCustom(draft, item.spec.key) : isRepMessageCustom(draft, item.id);
                  const kinds = item.type === 'step' ? item.spec.logKinds : (REP_MESSAGE_EMAIL_KINDS[item.id] ?? []);
                  const sent = item.type === 'step' ? sentOfRow(item.spec, messages) : { messages, mixed: false };
                  const variantKey = item.type === 'step' ? VARIANT_OF_BASE[item.spec.key as SavedTemplateKey] : undefined;
                  const missingLink = item.type === 'step' && item.spec.key === 'paperless_invite' && !paperlessInviteUrl(draft).trim();
                  return (
                    <li key={key} className="of-mrow">
                      <div className="of-mrow-main">
                        <div className="of-mrow-title">
                          {title}
                          {custom && <span className="of-tag is-on">הנוסח שלך</span>}
                          {missingLink && <span className="of-tag is-warn">חסר קישור הזמנה</span>}
                        </div>
                        <div className="of-mrow-when">{when}</div>
                        {/* ‼ 04.10.2026 · המדריך המצולם שהלקוח מקבל — אותו רכיב ואותן תמונות כמו בדף
                            האישי ובמרכז הייצוג, בנוסח הכללי (בלי לקוח). קודם נפתח רק מתוך חלון העריכה. */}
                        {item.type === 'rep' && item.id === 'portal' && (
                          <div className="of-guide-line" data-testid="office-rep-guide">
                            <RepApprovalGuideButton onClick={() => setGuideOpen(true)} />
                            <a className="of-link" href={TAX_PERSONAL_AREA.url} target="_blank" rel="noopener noreferrer"
                              title={TAX_PERSONAL_AREA.access}>
                              {TAX_PERSONAL_AREA.name} ↗ <span dir="ltr" className="of-muted">{linkHost(TAX_PERSONAL_AREA.url)}</span>
                            </a>
                          </div>
                        )}
                        {/* ‼ היומן לא שמר איזה נוסח יצא — הספירה כאן כוללת גם את השורה שמתחת. */}
                        {sent.mixed && variantKey && sent.messages && sent.messages.length > 0 && (
                          <span className="of-sent">יחד עם «{emailTemplateTitle(variantKey)}»:</span>
                        )}
                        {kinds.length > 0 && <SentLine messages={sent.messages} kinds={kinds} clients={clients} emptyText="" />}
                      </div>
                      <button type="button" className="btn btn-secondary btn-sm" onClick={() => setEditing(item)}
                        aria-label={`עריכת הנוסח · ${title}`}>עריכה</button>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
          {/* ‼ «כל מייל שיוצא» כולל גם תזכורות שהנוסח שלהן קבוע (לא נערך). ההפעלה ומה יצא —
              ב«אוטומציות»; המצב כאן נגזר מאותה פונקציה (expiryState / repRemindersState). */}
          <section className="of-mgroup" aria-label="תזכורות בנוסח קבוע">
            <h2 className="of-mgroup-title">תזכורות בנוסח קבוע</h2>
            <ul className="of-mrows">
              {[
                { key: 'expiry', title: 'לפני שהצעת מחיר פוקעת', subject: `«${EXPIRY_SUBJECT}»`,
                  state: expiryState(isNotificationEnabled(draft.settings ?? {}, 'quotation_expiry_reminder')) },
                { key: 'rep-reminders', title: 'על ייצוג שממתין ללקוח', subject: 'לחתום · לאשר בביטוח לאומי (לכל אחד מבני הזוג) · לאשר באזור האישי',
                  state: repRemindersState(REP_REMINDERS.filter(r => repReminderConfig(draft, r.audience).enabled).length, REP_REMINDERS.length) },
              ].map(r => (
                <li key={r.key} className="of-mrow">
                  <div className="of-mrow-main">
                    <div className="of-mrow-title">{r.title}<span className={`of-tag ${r.state.tone === 'off' ? 'is-off' : 'is-on'}`}>{r.state.label}</span></div>
                    <div className="of-mrow-when">{r.subject}</div>
                  </div>
                  <GoTo onClick={() => go('automations', r.key)}>באוטומציות ←</GoTo>
                </li>
              ))}
            </ul>
          </section>
          <p className="of-muted">
            כאן עורכים את הנוסח. מתי מייל יוצא ומה יצא — <GoTo onClick={() => go('automations')}>ב«אוטומציות» ←</GoTo>
          </p>
        </>
      )}

      {guideOpen && (
        <RepApprovalGuide onClose={() => setGuideOpen(false)} entryUrl={TAX_PERSONAL_AREA.url}
          scopeNote={REP_APPROVAL_GUIDE_GENERIC_NOTE} />
      )}
      {editing?.type === 'rep' && (
        <RepMessageDrawer profile={draft} saveNow={saveNow} id={editing.id} onClose={() => setEditing(null)} />
      )}
      {editing?.type === 'step' && (
        <StepEmailDrawer spec={editing.spec} draft={draft} saveNow={saveNow} onClose={() => setEditing(null)} />
      )}
      {editing?.type === 'meeting' && (
        <MeetingTemplateDrawer kind={editing.kind} draft={draft} saveNow={saveNow} onClose={() => setEditing(null)} />
      )}
    </>
  );
}

// ─── חלון עריכה של מייל ──────────────────────────────────────────────────────
// ‼ אותה מעטפת כמו הודעות הייצוג (rs-drawer), ואותה התנהגות: העריכה מקומית,
// ו«שמירה» שומרת מיד — כמו כל חלון עריכה במשרד (מחירון, עובדים). קודם היו כאן
// שני שלבים («החלה» ואז «שמירה» בתחתית), וביקורת השימושיות מצאה שזה לא ברור.

/** ערכים לדוגמה — לתצוגה המקדימה בלבד. */
function sampleValues(firmName: string): Record<string, string> {
  return {
    '{{clientName}}': 'ישראל', '{{firmName}}': firmName || 'שם המשרד',
    '{{paperlessInviteUrl}}': '(הכפתור במייל)', '{{amount}}': '450 ₪', '{{billingStartMonth}}': 'נובמבר 2026',
    '{{authUrl}}': '(הכפתור במייל)', '{{requestTitle}}': 'מסמכים לפתיחת התיק', '{{requestSub}}': 'אישור ניהול חשבון, דוח שנתי אחרון',
    // ‼ אותם ערכים שהשרת ממלא (WELCOME_LINE, noticeWording.documentsPhrase) — לא נוסח אחר.
    '{{welcomeLine}}': WELCOME_LINE, '{{requestList}}': '• מסמכים לפתיחת התיק\n• עדכון סטטוס מס',
    '{{documentsPhrase}}': '2 מסמכים חדשים', '{{documentList}}': '• מדריך הוצאות מוכרות\n• אישור ניהול ספרים', '{{statusList}}': '• פתיחת התיקים ברשויות — בטיפול',
  };
}

function fillSample(text: string, values: Record<string, string>): string {
  return text.replace(/\{\{[a-zA-Z]+\}\}/g, t => values[t] ?? '[נבנה לכל לקוח]').replace(/==([^=]+)==/g, '$1');
}

export function StepEmailDrawer({ spec, draft, saveNow, onClose }: {
  spec: TemplateSpec;
  draft: FirmProfile;
  saveNow: (update: (p: FirmProfile) => FirmProfile) => Promise<string | null>;
  onClose: () => void;
}) {
  const savedEntry = upgradedEntry(spec.key, templatesOf(draft)[spec.key] ?? {});
  const [entry, setEntry] = useState<CommTemplate>(savedEntry);
  const isInvite = spec.key === 'paperless_invite';
  const savedLink = paperlessInviteUrl(draft);
  const [link, setLink] = useState(savedLink);
  const [tab, setTab] = useState<'edit' | 'preview'>('edit');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const dirty = JSON.stringify(entry) !== JSON.stringify(savedEntry) || (isInvite && link !== savedLink);

  const requestClose = () => {
    if (busy) return;
    if (dirty && !window.confirm('לסגור בלי לשמור את השינויים בנוסח?')) return;
    onClose();
  };
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') requestClose(); };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  });

  async function save() {
    setBusy(true);
    setError(null);
    const err = await saveNow(prev => {
      const prevSettings = prev.settings ?? {};
      const all = { ...(prevSettings.commTemplates as Record<string, CommTemplate> | undefined) };
      const empty = entry.subject === undefined && entry.body === undefined && !entry.firmDefault;
      if (empty) delete all[spec.key]; else all[spec.key] = entry;
      const next = { ...prev, settings: { ...prevSettings, commTemplates: all } };
      return isInvite ? withPaperlessInviteUrl(next, link) : next;
    });
    setBusy(false);
    if (err) { setError(err); return; }
    onClose();
  }

  const isSystem = entry.subject === undefined && entry.body === undefined;
  const firm = entry.firmDefault;
  const cur = { subject: entry.subject ?? spec.base.subject, body: entry.body ?? spec.base.body };
  const sameAsFirm = !!firm && firm.subject === cur.subject && firm.body === cur.body;
  const stateLabel = isSystem ? 'נוסח המערכת' : sameAsFirm ? 'הנוסח הקבוע שלך' : firm ? 'שונה מהנוסח הקבוע שלך' : 'הנוסח שלך';
  const sample = sampleValues((draft.firmName ?? '').trim());
  const signature = (draft.communication?.emailSignature ?? '').trim();
  // גרסה של מייל (מייל המשך) — אותו כפתור ואותו יעד כמו הסוג שלה.
  const mailKind: string = spec.key === RELEASE_TEMPLATE_KEY ? spec.key : eventOfTemplateKey(spec.key);

  return (
    <>
      <div className="rs-scrim" onClick={requestClose} />
      <aside className="rs-drawer" role="dialog" aria-modal="true" aria-label={`עריכה · ${spec.title}`}>
        <div className="rs-dr-head">
          <div>
            <div className="rs-dr-title">{spec.title}</div>
            <div className="rs-dr-sub">מייל {spec.recipient} · {spec.when}</div>
          </div>
          <button type="button" className="rs-dr-close" onClick={requestClose} aria-label="סגירה">✕</button>
        </div>
        <div className="rs-dr-tabs">
          <button type="button" className={`rs-dr-tab ${tab === 'edit' ? 'is-active' : ''}`} onClick={() => setTab('edit')}>עריכה</button>
          <button type="button" className={`rs-dr-tab ${tab === 'preview' ? 'is-active' : ''}`} onClick={() => setTab('preview')}>תצוגה מקדימה</button>
        </div>
        <div className="rs-dr-body">
          {tab === 'edit' ? (
            <>
              {isInvite && (
                <div style={{ marginBottom: 16 }}>
                  <PaperlessLinkField value={link} onChange={setLink} />
                </div>
              )}
              <TemplateEditor spec={spec} entry={entry} onReplace={update => setEntry(prev => update(prev))} />
              <div style={{ marginTop: 16 }}>
                <LinkDestinationView title="לאן הכפתור במייל מוביל" dests={stepEmailDestinations(mailKind)} />
              </div>
            </>
          ) : (
            <div className="rs-pv-wrap">
              <div className="rs-pv-hint">כך ייראה אצל {spec.recipient === 'ללקוח' ? 'הלקוח' : 'הנמען'}, עם ערכים לדוגמה · נושא: <b>{fillSample(cur.subject, sample)}</b></div>
              <div className="rs-mail">
                <div className="rs-mail-top"><div className="rs-mail-lockup">{sample['{{firmName}}']}</div></div>
                <div className="rs-mail-hr" />
                <div className="rs-mail-b" style={{ whiteSpace: 'pre-line' }}>{fillSample(cur.body, sample)}</div>
                {/* ‼ טקסט הכפתור כפי שהשרת כותב אותו (STEP_EMAIL_CTA), ומתחתיו — לאן הוא מוביל. */}
                {STEP_EMAIL_CTA[mailKind] && <span className="rs-mail-btn">{STEP_EMAIL_CTA[mailKind]}</span>}
                <div className="rs-mail-dest"><LinkDestinationView compact dests={stepEmailDestinations(mailKind)} /></div>
                {signature && <div className="rs-mail-foot" style={{ whiteSpace: 'pre-line' }}>{signature}</div>}
              </div>
            </div>
          )}
        </div>
        {error && <div className="rs-dr-error" role="alert">השמירה נכשלה: {error}. הנוסח עדיין כאן — אפשר לנסות שוב.</div>}
        <div className="rs-dr-foot">
          <span className="rs-dr-state">{stateLabel}</span>
          <span className="rs-spacer" />
          <button type="button" className="btn btn-sm" onClick={requestClose} disabled={busy}>ביטול</button>
          <button type="button" className="btn btn-primary btn-sm" disabled={!dirty || busy} onClick={() => void save()}>
            {busy ? 'שומר…' : 'שמירה'}
          </button>
        </div>
      </aside>
    </>
  );
}

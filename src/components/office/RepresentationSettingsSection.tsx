// ─── ייצוג · הגדרות המשרד ────────────────────────────────────────────────────
// ‼ (1.10.2026, סבב 3) כבר לא עמוד: שלושת החלקים יושבים איפה שמחפשים אותם —
//   · מה נבחר מראש בבקשת ייצוג → «בקשות ללקוחות», בשורת הייצוג (RepDefaultsEditor).
//   · הנוסח של כל הודעה בדרך → «מיילים», לצד שאר המיילים (RepMessageDrawer).
//   · התזכורות האוטומטיות → «תזכורות והתראות» (repReminderConfig/withRepReminder).
//   «מה קורה בכל שלב» מוצג בהקשר (ProcessSteps על REPRESENTATION_PROCESS).
//
// הכל נשמר תחת profile.settings.representation — עמודת jsonb קיימת, בלי
// migration — וחולק את הטיוטה ואת כפתור השמירה של כל שאר «המשרד».
//
// ‼ מה שהקוד הזה **אינו** עושה: אינו עורך את סטטוס/מחזור הבקשה, אינו נוגע
// ב"אישרתי באזור האישי" או ביעד ה-gov.il (system-owned — ראה REP_PORTAL_CARD_FIXED),
// ואינו מציע רמת ייצוג לביטוח לאומי (הרשות היחידה בלי "רמה" — REP_AUTHORITIES_WITH_LEVEL).
import { useState } from 'react';
import type { FirmProfile } from '../../types/firmProfile';
import {
  RepAuthorityKind, RepLevel,
  REP_AUTHORITY_ORDER, REP_AUTHORITIES_WITH_LEVEL, REP_AUTHORITY_LABELS, REP_LEVEL_LABELS,
} from '../../types';
import {
  RepMailKind, RepMailOverride, defaultRepMailTemplate,
  RepPortalCardOverride, REP_PORTAL_CARD_DEFAULTS, REP_PORTAL_CARD_FIXED,
  RepReminderAudience, RepReminderConfig, resolveRepReminderConfig,
} from '../../../supabase/functions/_shared/repTemplates.ts';
import type { RepStageKey } from '../../lib/representationJourney';
import './representationSettings.css';
import { LinkDestinationView } from './LinkDestinationView';
import { repMessageDestinations } from '../../features/links/linkDestinations';
import RepApprovalGuide, { RepApprovalGuideButton } from '../portal/RepApprovalGuide';
import { PortalView, type PortalItem } from '../PublicPortalPage';

// ── מודל הנתונים תחת settings.representation ────────────────────────────────
export interface RepDefaultsSettings {
  authorities: Partial<Record<RepAuthorityKind, { on: boolean; level?: RepLevel }>>;
  niSpouse: boolean;
  delivery: 'email' | 'link';
}
type RepTemplatesSettings = Partial<Record<RepMailKind, RepMailOverride>> & { portalCard?: RepPortalCardOverride };
type RepRemindersSettings = Partial<Record<RepReminderAudience, Partial<RepReminderConfig>>>;
interface RepSettings {
  defaults?: RepDefaultsSettings;
  templates?: RepTemplatesSettings;
  reminders?: RepRemindersSettings;
}

// ‼ בדיוק ברירת המחדל הקשיחה הקיימת היום ב-RepresentationOnboardingDialog —
// כך שבלי התאמות מוצג בדיוק מה שקורה כשלא נוגעים בכלום.
const SYSTEM_DEFAULT_AUTHORITIES: Record<RepAuthorityKind, { on: boolean; level: RepLevel }> = {
  incomeTax: { on: true, level: 'primary' },
  withholding: { on: false, level: 'primary' },
  vat: { on: true, level: 'primary' },
  nationalInsurance: { on: true, level: 'primary' },
};
const SYSTEM_DEFAULT_NI_SPOUSE = true;
const SYSTEM_DEFAULT_DELIVERY: 'email' | 'link' = 'link';

export function repSettingsOf(profile: FirmProfile): RepSettings {
  return ((profile.settings ?? {}) as Record<string, unknown>).representation as RepSettings ?? {};
}
function currentAuthority(rep: RepSettings, a: RepAuthorityKind): { on: boolean; level: RepLevel } {
  const ov = rep.defaults?.authorities?.[a];
  return { on: ov?.on ?? SYSTEM_DEFAULT_AUTHORITIES[a].on, level: ov?.level ?? SYSTEM_DEFAULT_AUTHORITIES[a].level };
}
function currentNiSpouse(rep: RepSettings): boolean { return rep.defaults?.niSpouse ?? SYSTEM_DEFAULT_NI_SPOUSE; }
function currentDelivery(rep: RepSettings): 'email' | 'link' { return rep.defaults?.delivery ?? SYSTEM_DEFAULT_DELIVERY; }

/** עדכון חלק אחד של settings.representation, בלי לגעת בשאר. */
function withRep(prev: FirmProfile, patch: Partial<RepSettings>): FirmProfile {
  const prevSettings = (prev.settings ?? {}) as Record<string, unknown>;
  const prevRep = (prevSettings.representation as RepSettings) ?? {};
  return { ...prev, settings: { ...prevSettings, representation: { ...prevRep, ...patch } } };
}

// ── מה הלקוח מקבל בדרך — מיילים וכרטיס ─────────────────────────────────────
type ArtifactType = 'mail' | 'portal';
interface Artifact { id: string; stage: RepStageKey; type: ArtifactType; label: string; when: string; kind: RepMailKind | 'portalCard'; }

/**
 * ההודעות של תהליך הייצוג, לפי סדר המסע. ‼ `when` הוא מה שמופיע ברשימת
 * «מיילים» — מתי זה יוצא, במילים של משרד ולא של מנגנון.
 */
const ARTIFACTS: Artifact[] = [
  { id: 'onboard', stage: 'open', type: 'mail', label: 'בקשת ייצוג — מילוי פרטים', when: 'כשפותחים בקשת ייצוג ושולחים ללקוח', kind: 'rep_onboard' },
  { id: 'sign', stage: 'sign', type: 'mail', label: 'חתימה על ייפוי הכוח', when: 'כשייפוי הכוח מוכן לחתימה', kind: 'rep_sign' },
  { id: 'ni_approve', stage: 'ni', type: 'mail', label: 'אישור הייצוג בביטוח לאומי', when: 'כשההוראות לא נכנסו למייל החתימה', kind: 'rep_ni_approve' },
  { id: 'prerequisites', stage: 'ni', type: 'mail', label: 'השלמת פרטים חסרים', when: 'כשביטוח לאומי דורש פרטים שאין בכרטיס', kind: 'rep_prerequisites' },
  { id: 'portal', stage: 'client_approval', type: 'portal', label: 'אישור הייצוג באזור האישי (כרטיס בדף הלקוח)', when: 'אחרי ההגשה לשע״ם — זירוז; חובה כששע״ם ממתינה לאישור הלקוח', kind: 'portalCard' },
  { id: 'active', stage: 'active', type: 'mail', label: 'הייצוג פעיל', when: 'בלחיצה שלך, כשהייצוג אושר', kind: 'rep_active' },
];

export const REP_MESSAGES: { id: string; label: string; when: string; portal: boolean }[] =
  ARTIFACTS.map(a => ({ id: a.id, label: a.label, when: a.when, portal: a.type === 'portal' }));

/** סוג המייל ביומן — לשורה «נשלחו» ברשימת המיילים. */
export const REP_MESSAGE_EMAIL_KINDS: Record<string, string[]> = {
  onboard: ['onboard', 'onboarding'], sign: ['sign'], ni_approve: ['ni_approve'], prerequisites: ['prerequisites', 'rep_prerequisites'], active: ['active'], portal: [],
};

function overrideFor(rep: RepSettings, art: Artifact): RepMailOverride | RepPortalCardOverride | undefined {
  if (art.type === 'portal') return rep.templates?.portalCard;
  return rep.templates?.[art.kind as RepMailKind];
}

export function isRepMessageCustom(profile: FirmProfile, id: string): boolean {
  const art = ARTIFACTS.find(a => a.id === id);
  if (!art) return false;
  const ov = overrideFor(repSettingsOf(profile), art) as Record<string, string | undefined> | undefined;
  return !!ov && Object.values(ov).some(v => v !== undefined && v !== '');
}

const FIELD_DEFS: Record<ArtifactType, [string, string, boolean?][]> = {
  mail: [['subject', 'נושא המייל'], ['heading', 'כותרת בגוף המייל'], ['body', 'טקסט', true], ['cta', 'טקסט הכפתור']],
  // ‼ title/cta של הכרטיס בכוונה לא כאן — system-owned (REP_PORTAL_CARD_FIXED), אין להם שדה עריכה בכלל.
  portal: [['sub', 'שורת משנה'], ['note', 'ההוראות ללקוח', true], ['linkLabel', 'טקסט הקישור לאזור האישי'], ['noteAfter', 'משפט מרגיע בסוף', true]],
};

// ── מה נבחר מראש בבקשת ייצוג ───────────────────────────────────────────────

/** שורת הסיכום של ברירת המחדל — «מס הכנסה, מע״מ, ביטוח לאומי (גם בן/בת זוג) · קישור להעתקה». */
export function repDefaultsSummary(profile: FirmProfile): string {
  const rep = repSettingsOf(profile);
  const names: string[] = [];
  for (const a of REP_AUTHORITY_ORDER) {
    const cur = currentAuthority(rep, a);
    if (!cur.on) continue;
    let n = REP_AUTHORITY_LABELS[a];
    if (REP_AUTHORITIES_WITH_LEVEL.includes(a) && cur.level === 'secondary') n += ` (${REP_LEVEL_LABELS.secondary})`;
    if (a === 'nationalInsurance' && currentNiSpouse(rep)) n += ' (גם בן/בת זוג)';
    names.push(n);
  }
  const delivery = currentDelivery(rep) === 'email' ? 'נשלח במייל' : 'קישור להעתקה';
  return `${names.length ? names.join(', ') : 'אף רשות לא מסומנת מראש'} · ${delivery}`;
}

/**
 * מה מסומן מראש כשפותחים בקשת ייצוג. ‼ חל רק כשאין היקף שנקבע בהצעת מחיר
 * מאושרת — היקף מההצעה תמיד גובר.
 */
export function RepDefaultsEditor({ profile, onChangeProfile }: {
  profile: FirmProfile;
  onChangeProfile: React.Dispatch<React.SetStateAction<FirmProfile>>;
}) {
  const rep = repSettingsOf(profile);
  function patchDefaults(patch: Partial<RepDefaultsSettings>) {
    onChangeProfile(prev => {
      const r = repSettingsOf(prev);
      const base: RepDefaultsSettings = {
        authorities: r.defaults?.authorities ?? {},
        niSpouse: currentNiSpouse(r),
        delivery: currentDelivery(r),
      };
      return withRep(prev, { defaults: { ...base, ...patch } });
    });
  }
  function setOn(a: RepAuthorityKind, on: boolean) {
    const authorities = { ...(rep.defaults?.authorities ?? {}) };
    authorities[a] = { on, level: currentAuthority(rep, a).level };
    patchDefaults({ authorities, niSpouse: a === 'nationalInsurance' && !on ? false : currentNiSpouse(rep) });
  }
  function setLevel(a: RepAuthorityKind, level: RepLevel) {
    const authorities = { ...(rep.defaults?.authorities ?? {}) };
    authorities[a] = { on: currentAuthority(rep, a).on, level };
    patchDefaults({ authorities });
  }
  const niOn = currentAuthority(rep, 'nationalInsurance').on;
  const delivery = currentDelivery(rep);
  return (
    <div className="rs-defaults">
      <div className="rs-opt-list">
        {REP_AUTHORITY_ORDER.filter(a => a !== 'nationalInsurance').map(a => {
          const cur = currentAuthority(rep, a);
          return (
            <div key={a} className="rs-opt-line">
              <label className="rs-opt">
                <input type="checkbox" checked={cur.on} onChange={e => setOn(a, e.target.checked)} />
                <span>{REP_AUTHORITY_LABELS[a]}</span>
              </label>
              {cur.on && (
                <div className="rs-level-row" role="group" aria-label={`דרגת ייצוג · ${REP_AUTHORITY_LABELS[a]}`}>
                  <button type="button" className={`rs-pill ${cur.level === 'primary' ? 'is-on' : ''}`} aria-pressed={cur.level === 'primary'} onClick={() => setLevel(a, 'primary')}>{REP_LEVEL_LABELS.primary}</button>
                  <button type="button" className={`rs-pill ${cur.level === 'secondary' ? 'is-on' : ''}`} aria-pressed={cur.level === 'secondary'} onClick={() => setLevel(a, 'secondary')}>{REP_LEVEL_LABELS.secondary}</button>
                </div>
              )}
            </div>
          );
        })}
        <label className="rs-opt">
          <input type="checkbox" checked={niOn} onChange={e => setOn('nationalInsurance', e.target.checked)} />
          <span>ביטוח לאומי</span>
        </label>
        <label className="rs-opt rs-opt-nested">
          <input type="checkbox" checked={currentNiSpouse(rep)} disabled={!niOn} onChange={e => patchDefaults({ niSpouse: e.target.checked })} />
          <span>ללקוח נשוי — גם לבן/בת הזוג</span>
        </label>
      </div>
      <div className="rs-opt-group">
        <div className="rs-opt-group-title">איך הקישור מגיע ללקוח</div>
        <div className="rs-seg" role="radiogroup" aria-label="איך הקישור מגיע ללקוח">
          <label className={`rs-seg-opt${delivery === 'link' ? ' is-on' : ''}`}>
            <input type="radio" name="rs-delivery" checked={delivery === 'link'} onChange={() => patchDefaults({ delivery: 'link' })} />
            קישור להעתקה (וואטסאפ / SMS)
          </label>
          <label className={`rs-seg-opt${delivery === 'email' ? ' is-on' : ''}`}>
            <input type="radio" name="rs-delivery" checked={delivery === 'email'} onChange={() => patchDefaults({ delivery: 'email' })} />
            במייל מהמשרד
          </label>
        </div>
      </div>
      <p className="of-muted" style={{ margin: '12px 0 0' }}>כשהצעת מחיר מאושרת קבעה היקף ייצוג — ההיקף שבהצעה גובר.</p>
    </div>
  );
}

// ── תזכורות הייצוג ──────────────────────────────────────────────────────────

export function repReminderConfig(profile: FirmProfile, audience: RepReminderAudience): RepReminderConfig {
  return resolveRepReminderConfig(audience, repSettingsOf(profile).reminders?.[audience]);
}

export function withRepReminder(prev: FirmProfile, audience: RepReminderAudience, patch: Partial<RepReminderConfig>): FirmProfile {
  const rep = repSettingsOf(prev);
  const reminders: RepRemindersSettings = { ...rep.reminders, [audience]: { ...repReminderConfig(prev, audience), ...patch } };
  return withRep(prev, { reminders });
}

// ── עריכת הודעה אחת — מגירה ────────────────────────────────────────────────

/**
 * חלון עריכה של הודעה אחת בתהליך הייצוג. ‼ השינוי נכנס לטיוטת המשרד רק
 * ב«החלה», וללקוחות — רק אחרי «שמירה». סגירה בלי «החלה» שואלת קודם.
 */
export function RepMessageDrawer({ profile, saveNow, id, onClose }: {
  profile: FirmProfile;
  /** שמירה מיידית (useOfficeDraft.saveNow) — החלון שומר בעצמו, כמו כל חלון עריכה. */
  saveNow: (update: (p: FirmProfile) => FirmProfile) => Promise<string | null>;
  id: string;
  onClose: () => void;
}) {
  const art = ARTIFACTS.find(a => a.id === id)!;
  const rep = repSettingsOf(profile);
  const [tab, setTab] = useState<'edit' | 'preview'>('edit');
  const [values, setValues] = useState<Record<string, string>>({ ...(overrideFor(rep, art) as Record<string, string> ?? {}) });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const dirty = JSON.stringify(values) !== JSON.stringify(overrideFor(rep, art) ?? {});
  const systemValues = art.type === 'portal'
    ? { ...REP_PORTAL_CARD_DEFAULTS } as unknown as Record<string, string>
    : defaultRepMailTemplate(art.kind as RepMailKind) as unknown as Record<string, string>;

  function requestClose() {
    if (busy) return;
    if (dirty && !window.confirm('לסגור בלי לשמור את השינויים בנוסח?')) return;
    onClose();
  }
  async function apply() {
    const cleaned = Object.fromEntries(Object.entries(values).filter(([, v]) => v.trim() !== ''));
    setBusy(true);
    setError(null);
    const err = await saveNow(prev => {
      const r = repSettingsOf(prev);
      const templates: RepTemplatesSettings = { ...r.templates };
      if (art.type === 'portal') {
        if (Object.keys(cleaned).length) templates.portalCard = cleaned as RepPortalCardOverride; else delete templates.portalCard;
      } else {
        const key = art.kind as RepMailKind;
        if (Object.keys(cleaned).length) templates[key] = cleaned as RepMailOverride; else delete templates[key];
      }
      return withRep(prev, { templates });
    });
    setBusy(false);
    if (err) { setError(err); return; }
    onClose();
  }
  function resetToDefault() {
    if (!window.confirm('לחזור לנוסח המערכת? הנוסח שלך לפריט הזה יימחק כשתשמרו.')) return;
    setValues({});
  }

  return (
    <Drawer art={art} tab={tab} onTab={setTab} values={values}
      onChange={(k, v) => setValues(prev => ({ ...prev, [k]: v }))}
      systemValues={systemValues} dirty={dirty} busy={busy} error={error}
      onClose={requestClose} onApply={() => void apply()} onResetDefault={resetToDefault} />
  );
}

// ── מגירת עריכה / תצוגה מקדימה ────────────────────────────────────────────────
function Drawer({ art, tab, onTab, values, onChange, systemValues, dirty, busy, error, onClose, onApply, onResetDefault }: {
  art: Artifact; tab: 'edit' | 'preview'; onTab: (t: 'edit' | 'preview') => void;
  values: Record<string, string>; onChange: (k: string, v: string) => void; systemValues: Record<string, string>;
  dirty: boolean; busy: boolean; error: string | null; onClose: () => void; onApply: () => void; onResetDefault: () => void;
}) {
  const merged = (k: string) => (values[k] !== undefined ? values[k] : systemValues[k]);
  const hasCustom = Object.values(values).some(v => v !== undefined && v !== '');
  const fields = FIELD_DEFS[art.type];
  const [guide, setGuide] = useState(false);
  const dests = repMessageDestinations(art.id, merged('cta'));
  // ‼ היעד מוצג מתחת לשדה שקובע את טקסט הכפתור — שם עולה השאלה «לאן זה מוביל».
  const linkField = art.type === 'portal' ? 'linkLabel' : 'cta';
  const lockedItems: string[] =
    art.id === 'sign' ? [
      'לכל חותם קישור חתימה אישי.',
      'כשביטוח לאומי כלול ויש אסמכתא — המערכת שולחת הודעה משולבת נפרדת עם שתי הפעולות, בנוסח קבוע שאינו נערך כאן.',
    ] : art.id === 'ni_approve' ? [
      'הקישור מוביל לאתר הביטוח הלאומי; דרך האישור השנייה היא בטלפון.',
      'מספר האסמכתא והמועד האחרון נלקחים מהבקשה של אותו אדם.',
    ] : art.id === 'prerequisites' ? [
      'המייל מפרט אוטומטית אילו פרטים חסרים.',
      'הקישור פותח טופס עם השדות החסרים בלבד, ותקף 14 יום.',
    ] : art.id === 'active' ? [
      'נשלח רק בלחיצה מהמשרד, אחרי תצוגה מקדימה — לעולם לא כתופעת לוואי של סימון "פעיל".',
    ] : art.id === 'portal' ? [
      'כותרת הכרטיס וטקסט הכפתור ("אישרתי באזור האישי") הם חלק מהמנגנון עצמו — קבועים ולא ניתנים לעריכה.',
      'יעד הקישור קבוע — האזור האישי של רשות המסים (למעלה).',
      'לחיצה על "אישרתי" מחזירה את הכדור למשרד לבדיקה בשע"ם. הדיווח של הלקוח לבדו אינו מפעיל את הייצוג.',
    ] : ['כפתור המייל מוביל לדף האישי של הלקוח — קישור אחד קבוע לכל אורך הקשר.'];

  return (
    <>
      <div className="rs-scrim" onClick={onClose} />
      <aside className="rs-drawer" role="dialog" aria-modal="true">
        <div className="rs-dr-head">
          <div>
            <div className="rs-dr-title">{tab === 'edit' ? 'עריכה' : 'תצוגה מקדימה'} · {art.label}</div>
            <div className="rs-dr-sub">{art.type === 'mail' ? 'מייל ללקוח' : 'כרטיס בדף האישי של הלקוח'}</div>
          </div>
          <button type="button" className="rs-dr-close" onClick={onClose} aria-label="סגירה">✕</button>
        </div>
        <div className="rs-dr-tabs">
          <button type="button" className={`rs-dr-tab ${tab === 'edit' ? 'is-active' : ''}`} onClick={() => onTab('edit')}>עריכה</button>
          <button type="button" className={`rs-dr-tab ${tab === 'preview' ? 'is-active' : ''}`} onClick={() => onTab('preview')}>תצוגה מקדימה</button>
        </div>
        <div className="rs-dr-body">
          {tab === 'edit' ? (
            <>
              {fields.map(([key, label, big]) => (
                <div className="rs-field" key={key}>
                  <label>{label}{values[key] !== undefined && values[key] !== '' ? <span className="rs-state is-custom" style={{ marginInlineStart: 6 }}>שונה</span> : null}</label>
                  {big ? (
                    <textarea rows={5} value={merged(key)} onChange={e => onChange(key, e.target.value)} />
                  ) : (
                    <input type="text" value={merged(key)} onChange={e => onChange(key, e.target.value)} />
                  )}
                  {key === linkField && <LinkDestinationView dests={dests} />}
                </div>
              ))}
              {art.type === 'portal' && (
                <div className="rs-guide-row">
                  <RepApprovalGuideButton onClick={() => setGuide(true)} />
                  <span>מוצג ללקוח בכרטיס, מתחת להוראות. שלב אחד בכל פעם, והפרטים האישיים בצילומים מוסתרים.</span>
                </div>
              )}
              <div className="rs-locked">
                <b>מה קבוע ולא משתנה כאן</b>
                <ul>{lockedItems.map((l, i) => <li key={i}>{l}</li>)}<li>השולח, החתימה והמיתוג — לפי «פרטי המשרד».</li></ul>
              </div>
            </>
          ) : (
            <Preview art={art} dests={dests} values={{ ...systemValues, ...Object.fromEntries(Object.entries(values).filter(([, v]) => v !== undefined && v !== '')) }} />
          )}
        </div>
        {error && <div className="rs-dr-error" role="alert">השמירה נכשלה: {error}. הנוסח עדיין כאן — אפשר לנסות שוב.</div>}
        <div className="rs-dr-foot">
          <button type="button" className="btn btn-ghost btn-sm" style={{ visibility: hasCustom ? 'visible' : 'hidden' }} onClick={onResetDefault}>חזרה לנוסח המערכת</button>
          <span className="rs-dr-state">{hasCustom ? 'הנוסח שלך' : 'נוסח המערכת'}</span>
          <span className="rs-spacer" />
          <button type="button" className="btn btn-sm" onClick={onClose}>ביטול</button>
          <button type="button" className="btn btn-primary btn-sm" disabled={!dirty || busy} onClick={onApply}>{busy ? 'שומר…' : 'שמירה'}</button>
        </div>
      </aside>
      {guide && <RepApprovalGuide onClose={() => setGuide(false)} entryUrl={REP_PORTAL_CARD_FIXED.linkUrl} entryInert />}
    </>
  );
}

function Preview({ art, values, dests }: {
  art: Artifact; values: Record<string, string>;
  dests: ReturnType<typeof repMessageDestinations>;
}) {
  if (art.type === 'mail') {
    return (
      <div className="rs-pv-wrap">
        <div className="rs-pv-hint">כך ייראה המייל אצל הלקוח · נושא: <b>{values.subject}</b></div>
        <div className="rs-mail">
          <div className="rs-mail-top"><div className="rs-mail-lockup">שם המשרד<small>רואה חשבון</small></div></div>
          <div className="rs-mail-hr" />
          <div className="rs-mail-h">{values.heading}</div>
          <div className="rs-mail-b">{values.body}</div>
          {art.id === 'sign' && <div className="rs-mail-block">מספר אסמכתא בביטוח הלאומי<b>A-XXXX-XXXX</b>מוצג רק כשיש אסמכתא לבקשה הזו</div>}
          {art.id === 'ni_approve' && <div className="rs-mail-block">מספר אסמכתא בביטוח הלאומי<b>A-XXXX-XXXX</b></div>}
          {art.id === 'prerequisites' && <div className="rs-mail-block">מה חסר לנו<b>לפי הבקשה הספציפית</b></div>}
          {values.cta && <span className="rs-mail-btn">{values.cta}</span>}
          <div className="rs-mail-dest"><LinkDestinationView compact dests={dests} /></div>
          <div className="rs-mail-foot">בברכה, שם המשרד · שאלות? פשוט השיבו למייל הזה.</div>
        </div>
      </div>
    );
  }
  // ‼ הכרטיס האמיתי של הדף האישי (DeclareBlock), במצב תצוגה — כך שינוי בכרטיס
  // אצל הלקוח לא משאיר כאן העתק ישן. ההסבר המלא נפתח שם ב«עוד», כמו אצל הלקוח.
  const item: PortalItem = {
    bucket: 'action', key: 'rep_approval', kind: 'declare',
    label: REP_PORTAL_CARD_FIXED.title, sub: values.sub,
    note: values.note, noteAfter: values.noteAfter,
    linkUrl: REP_PORTAL_CARD_FIXED.linkUrl, linkLabel: values.linkLabel,
    cta: REP_PORTAL_CARD_FIXED.cta, actionKind: 'portal', actionValue: 'preview',
  };
  return (
    <div className="rs-pv-wrap">
      <div className="rs-pv-hint">כך ייראה הכרטיס בדף האישי של הלקוח אחרי ההגשה למס הכנסה.</div>
      <PortalView preview embed data={{
        clientFirstName: '', firmName: 'שם המשרד', branding: {}, done: 0, total: 1, items: [item],
      }} />
    </div>
  );
}

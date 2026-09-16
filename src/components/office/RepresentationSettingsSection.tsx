// ─── «ייצוג» · ניהול המשרד ───────────────────────────────────────────────────
// המימוש נאמן לאב-הטיפוס המאושר: docs/prototypes/representation-settings.html.
// ציר מסע קבוע (6 שלבים), "מה קורה" (קריאה בלבד) מול "מה הלקוח מקבל" (עריכה).
//
// הכל נשמר תחת profile.settings.representation — עמודת jsonb קיימת, בלי
// migration חדשה — וחולק את הטיוטה ואת כפתור השמירה של כל שאר "המשרד"
// (אותו דפוס בדיוק כמו PaperlessCommSection).
//
// ‼ מה שהמסך הזה **אינו** עושה: אינו עורך את סטטוס/מחזור הבקשה, אינו נוגע
// ב"אישרתי באזור האישי" או ביעד ה-gov.il (system-owned — ראה REP_PORTAL_CARD_FIXED),
// ואינו מציע רמת ייצוג לביטוח לאומי (הרשות היחידה בלי "רמה" — REP_AUTHORITIES_WITH_LEVEL).
import { useState } from 'react';
import type { FirmProfile } from '../../types/firmProfile';
import {
  RepAuthorityKind, RepLevel,
  REP_AUTHORITY_ORDER, REP_AUTHORITIES_WITH_LEVEL, REP_AUTHORITY_LABELS, REP_LEVEL_LABELS,
} from '../../types';
import {
  RepMailKind, RepMailOverride,
  defaultRepMailTemplate, resolveRepMailTemplate,
  RepPortalCardOverride, REP_PORTAL_CARD_DEFAULTS, REP_PORTAL_CARD_FIXED, resolveRepPortalCard,
  RepReminderAudience, RepReminderConfig, resolveRepReminderConfig,
} from '../../../supabase/functions/_shared/repTemplates.ts';
import './representationSettings.css';

interface Props {
  profile: FirmProfile;
  onChangeProfile: React.Dispatch<React.SetStateAction<FirmProfile>>;
}

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
// כך שמסך זה שמנוקה מהתאמות מציג בדיוק את מה שקורה כשלא נוגעים בכלום.
const SYSTEM_DEFAULT_AUTHORITIES: Record<RepAuthorityKind, { on: boolean; level: RepLevel }> = {
  incomeTax: { on: true, level: 'primary' },
  withholding: { on: false, level: 'primary' },
  vat: { on: true, level: 'primary' },
  nationalInsurance: { on: true, level: 'primary' },
};
const SYSTEM_DEFAULT_NI_SPOUSE = true;
const SYSTEM_DEFAULT_DELIVERY: 'email' | 'link' = 'link';

function repSettingsOf(profile: FirmProfile): RepSettings {
  return ((profile.settings ?? {}) as Record<string, unknown>).representation as RepSettings ?? {};
}
function currentAuthority(rep: RepSettings, a: RepAuthorityKind): { on: boolean; level: RepLevel } {
  const ov = rep.defaults?.authorities?.[a];
  return { on: ov?.on ?? SYSTEM_DEFAULT_AUTHORITIES[a].on, level: ov?.level ?? SYSTEM_DEFAULT_AUTHORITIES[a].level };
}
function currentNiSpouse(rep: RepSettings): boolean { return rep.defaults?.niSpouse ?? SYSTEM_DEFAULT_NI_SPOUSE; }
function currentDelivery(rep: RepSettings): 'email' | 'link' { return rep.defaults?.delivery ?? SYSTEM_DEFAULT_DELIVERY; }

// ── ציר המסע: שלבים, "מה קורה", וסוגי התזכורות שלכל שלב ─────────────────────
type ArtifactType = 'mail' | 'portal';
interface Artifact { id: string; stage: number; type: ArtifactType; label: string; kind: RepMailKind | 'portalCard'; standalone?: string; }

const ARTIFACTS: Artifact[] = [
  { id: 'onboard', stage: 1, type: 'mail', label: 'מייל הזיהוי', kind: 'rep_onboard' },
  { id: 'sign', stage: 2, type: 'mail', label: 'מייל החתימה', kind: 'rep_sign' },
  { id: 'ni_approve', stage: 3, type: 'mail', label: 'הוראות אישור בביטוח הלאומי', kind: 'rep_ni_approve', standalone: 'נשלח בנפרד רק כשההוראות לא נכנסו למייל החתימה' },
  { id: 'prerequisites', stage: 3, type: 'mail', label: 'השלמת פרטים חסרים', kind: 'rep_prerequisites' },
  { id: 'portal', stage: 4, type: 'portal', label: 'כרטיס בדף האישי', kind: 'portalCard' },
  { id: 'active', stage: 5, type: 'mail', label: 'מייל "הייצוג פעיל"', kind: 'rep_active' },
];

interface StageDef { n: number; name: string; reminders?: RepReminderAudience[]; }
const STAGES: StageDef[] = [
  { n: 0, name: 'פתיחת בקשה' },
  { n: 1, name: 'זיהוי ופרטים' },
  { n: 2, name: 'חתימה על ייפוי הכוח', reminders: ['sign'] },
  { n: 3, name: 'ביטוח לאומי', reminders: ['niClient', 'niSpouse'] },
  { n: 4, name: 'הגשה ואישור', reminders: ['portal'] },
  { n: 5, name: 'הייצוג פעיל' },
];

const HAPPENS: Record<number, string[]> = {
  0: [
    'בקשת ייצוג נפתחת מכרטיס הלקוח, מלקוח חדש או מהצעת מחיר שאושרה. הבקשה מופיעה בלשונית "בקשות" של הלקוח, והכדור עובר אליו.',
    'כשהצעת מחיר מאושרת כבר קבעה את היקף הייצוג — ההיקף הזה תמיד גובר. הברירות שכאן חלות רק כשפותחים ייצוג בלי היקף שנקבע מראש.',
  ],
  1: [
    'הלקוח מקבל קישור אישי ומאובטח לדף שלו, ממלא פרטים אישיים ומשפחתיים ומצלם תעודה מזהה. בזוג — לכל אחד קישור לפרטיו שלו, בלי לראות את של האחר.',
    'כשהטופס נשלח, הכדור חוזר למשרד: להזין ברשויות ולהפיק את ייפוי הכוח.',
  ],
  2: [
    'המשרד מפיק את ייפוי הכוח (טופס 2279א׳5 — מסמך לכל אדם, כי ההגשה בשע"ם היא לפי תעודת זהות) ושולח לכל חותם קישור אישי.',
    'אחרי שכולם חתמו, המשרד חותם ומחתים. כשביטוח לאומי כלול ויש כבר אסמכתא, המערכת שולחת הודעה משולבת אחת עם שתי הפעולות — כדי שהלקוח לא יקבל שני מיילים. ההודעה המשולבת הזאת בנוסח קבוע ואינה נערכת כאן; מה שכן נערך הוא מייל החתימה הרגיל, לשאר המקרים.',
  ],
  3: [
    'ביטוח לאומי מתנהל בנפרד לכל אדם — הלקוח, ובן/בת הזוג כשנבחרו. המשרד מזין את ייפוי הכוח באתר ב"ל ומקבל מספר אסמכתא ומועד אחרון.',
    'המבוטח מאשר בעצמו, באתר או בטלפון — ורק אז הייצוג בב"ל בתוקף. המשרד מסמן את האישור כשהוא מתקבל.',
    'אם חסרים פרטים שהאתר דורש (למשל שנת לידה של בן/בת הזוג), המערכת מציעה למלא במשרד או לשלוח קישור קצר להשלמה — לפני שמוצעת הזנה.',
  ],
  4: [
    'אחרי שהמשרד מגיש את ייפוי הכוח למס הכנסה, ההמתנה היא לאישור הרשות. באותו רגע נפתח ללקוח בדף האישי כרטיס שמאפשר לזרז את האישור באזור האישי של רשות המסים. זה אופציונלי ולא מעכב דבר.',
    'כשהלקוח מדווח "אישרתי", הכדור חוזר למשרד לבדיקה בשע"ם. הדיווח של הלקוח לבדו אינו מפעיל את הייצוג.',
  ],
  5: [
    'כשהרשות אישרה, המשרד מסמן שהייצוג פעיל. הסימון סוגר את הכרטיס בדף האישי ומעדכן את כרטיס הלקוח; משם הייצוג נשאר בתוקף עד ביטול מפורש.',
    'ההודעה ללקוח לא יוצאת מעצמה — המשרד שולח אותה בלחיצה, אחרי תצוגה מקדימה.',
  ],
};

const REMINDER_LABEL: Record<RepReminderAudience, { audience: string | null; when: string }> = {
  sign: { audience: null, when: 'אם לא כל החותמים חתמו' },
  niClient: { audience: 'כשהלקוח עצמו הוא מי שצריך לאשר', when: 'אם הלקוח עדיין לא אישר בביטוח הלאומי' },
  niSpouse: { audience: 'כשבן/בת הזוג הם מי שצריך לאשר', when: 'אם בן/בת הזוג עדיין לא אישרו בביטוח הלאומי' },
  portal: { audience: null, when: 'אם הלקוח לא דיווח שאישר באזור האישי' },
};

const FIELD_DEFS: Record<ArtifactType, [string, string, boolean?][]> = {
  mail: [['subject', 'נושא המייל'], ['heading', 'כותרת בגוף המייל'], ['body', 'טקסט', true], ['cta', 'טקסט הכפתור']],
  // ‼ title/cta של הכרטיס בכוונה לא כאן — system-owned (REP_PORTAL_CARD_FIXED), אין להם שדה עריכה בכלל.
  portal: [['sub', 'שורת משנה'], ['note', 'ההוראות ללקוח', true], ['linkLabel', 'טקסט הקישור לאזור האישי'], ['noteAfter', 'משפט מרגיע בסוף', true]],
};

export default function RepresentationSettingsSection({ profile, onChangeProfile }: Props) {
  const [openStages, setOpenStages] = useState<Set<number>>(new Set());
  const [drawerArt, setDrawerArt] = useState<{ id: string; mode: 'edit' | 'preview' } | null>(null);
  const [drawerTab, setDrawerTab] = useState<'edit' | 'preview'>('edit');
  const [drawerValues, setDrawerValues] = useState<Record<string, string>>({});

  const rep = repSettingsOf(profile);

  function patchRep(patch: Partial<RepSettings>) {
    onChangeProfile(prev => {
      const prevSettings = (prev.settings ?? {}) as Record<string, unknown>;
      const prevRep = (prevSettings.representation as RepSettings) ?? {};
      return { ...prev, settings: { ...prevSettings, representation: { ...prevRep, ...patch } } };
    });
  }
  function patchDefaults(patch: Partial<RepDefaultsSettings>) {
    const base: RepDefaultsSettings = {
      authorities: rep.defaults?.authorities ?? {},
      niSpouse: currentNiSpouse(rep),
      delivery: currentDelivery(rep),
    };
    patchRep({ defaults: { ...base, ...patch } });
  }
  function setAuthorityOn(a: RepAuthorityKind, on: boolean) {
    const authorities = { ...(rep.defaults?.authorities ?? {}) };
    authorities[a] = { on, level: currentAuthority(rep, a).level };
    patchDefaults({ authorities, niSpouse: a === 'nationalInsurance' && !on ? false : currentNiSpouse(rep) });
  }
  function setAuthorityLevel(a: RepAuthorityKind, level: RepLevel) {
    const authorities = { ...(rep.defaults?.authorities ?? {}) };
    authorities[a] = { on: currentAuthority(rep, a).on, level };
    patchDefaults({ authorities });
  }

  function overrideFor(art: Artifact): RepMailOverride | RepPortalCardOverride | undefined {
    if (art.type === 'portal') return rep.templates?.portalCard;
    return rep.templates?.[art.kind as RepMailKind];
  }
  function isCustom(art: Artifact): boolean {
    const ov = overrideFor(art) as Record<string, string | undefined> | undefined;
    return !!ov && Object.values(ov).some(v => v !== undefined && v !== '');
  }
  function valuesOf(art: Artifact): Record<string, string> {
    if (art.type === 'portal') return resolveRepPortalCard(rep.templates?.portalCard) as unknown as Record<string, string>;
    return resolveRepMailTemplate(art.kind as RepMailKind, rep.templates?.[art.kind as RepMailKind]) as unknown as Record<string, string>;
  }
  function systemValuesOf(art: Artifact): Record<string, string> {
    if (art.type === 'portal') return { ...REP_PORTAL_CARD_DEFAULTS } as unknown as Record<string, string>;
    return defaultRepMailTemplate(art.kind as RepMailKind) as unknown as Record<string, string>;
  }

  function toggleStage(n: number) {
    setOpenStages(prev => { const next = new Set(prev); next.has(n) ? next.delete(n) : next.add(n); return next; });
  }

  function openDrawer(id: string, mode: 'edit' | 'preview') {
    const art = ARTIFACTS.find(a => a.id === id)!;
    setDrawerValues({ ...(overrideFor(art) as Record<string, string> ?? {}) });
    setDrawerArt({ id, mode });
    setDrawerTab(mode);
  }
  function closeDrawer() { setDrawerArt(null); }
  const drawingArt = drawerArt ? ARTIFACTS.find(a => a.id === drawerArt.id)! : null;
  const drawerDirty = drawingArt
    ? JSON.stringify(drawerValues) !== JSON.stringify(overrideFor(drawingArt) ?? {})
    : false;

  function applyDrawer() {
    if (!drawingArt) return;
    const cleaned = Object.fromEntries(Object.entries(drawerValues).filter(([, v]) => v.trim() !== ''));
    if (drawingArt.type === 'portal') {
      const templates: RepTemplatesSettings = { ...rep.templates };
      if (Object.keys(cleaned).length) templates.portalCard = cleaned as RepPortalCardOverride; else delete templates.portalCard;
      patchRep({ templates });
    } else {
      const templates: RepTemplatesSettings = { ...rep.templates };
      const key = drawingArt.kind as RepMailKind;
      if (Object.keys(cleaned).length) templates[key] = cleaned as RepMailOverride; else delete templates[key];
      patchRep({ templates });
    }
    closeDrawer();
  }
  function resetDrawerToDefault() {
    if (!window.confirm('לחזור לנוסח ברירת המחדל של המערכת? הנוסח של המשרד לפריט הזה יימחק כשתשמרו.')) return;
    setDrawerValues({});
  }

  function reminderCfg(audience: RepReminderAudience): RepReminderConfig {
    return resolveRepReminderConfig(audience, rep.reminders?.[audience]);
  }
  function patchReminder(audience: RepReminderAudience, patch: Partial<RepReminderConfig>) {
    const reminders: RepRemindersSettings = { ...rep.reminders, [audience]: { ...reminderCfg(audience), ...patch } };
    patchRep({ reminders });
  }

  // ── סיכומים ────────────────────────────────────────────────────────────
  function authorityNames(): string[] {
    const out: string[] = [];
    for (const a of REP_AUTHORITY_ORDER) {
      const cur = currentAuthority(rep, a);
      if (!cur.on) continue;
      out.push(REP_AUTHORITIES_WITH_LEVEL.includes(a) ? `${REP_AUTHORITY_LABELS[a]} (${REP_LEVEL_LABELS[cur.level]})` : REP_AUTHORITY_LABELS[a]);
    }
    return out;
  }
  function stageSummary(st: StageDef): string {
    if (st.n === 0) {
      const names = authorityNames();
      return `ברירות מחדל · ${names.length ? names.join(', ') : 'ללא רשות מסומנת מראש'}`;
    }
    const arts = ARTIFACTS.filter(a => a.stage === st.n);
    const custom = arts.filter(isCustom).length;
    const parts: string[] = [];
    const mails = arts.filter(a => a.type === 'mail').length;
    const cards = arts.filter(a => a.type === 'portal').length;
    if (mails) parts.push(mails === 1 ? 'הודעה אחת' : `${mails} הודעות`);
    if (cards) parts.push('כרטיס בדף האישי');
    if (arts.length === 1) parts.push(custom ? 'מותאם' : 'ברירת מחדל');
    else parts.push(custom === 0 ? 'ברירת מחדל' : custom === 1 ? 'אחת מותאמת' : `${custom} מותאמות`);
    if (st.reminders) {
      const on = st.reminders.map(k => reminderCfg(k).enabled);
      parts.push(on.every(Boolean) ? (st.reminders.length > 1 ? 'תזכורות פעילות לשניהם' : 'תזכורות פעילות') : on.some(Boolean) ? 'תזכורת פעילה לאחד מהם' : 'תזכורות כבויות');
    }
    if (st.n === 5) parts.push('נשלחת רק בלחיצה');
    return parts.join(' · ');
  }
  const totalArtifacts = ARTIFACTS.length;
  const customCount = ARTIFACTS.filter(isCustom).length;
  const remOnCount = (['sign', 'niClient', 'niSpouse', 'portal'] as RepReminderAudience[]).filter(a => reminderCfg(a).enabled).length;

  return (
    <>
      <div className="rs-intro">
        <div className="rs-title">ייצוג</div>
        <div className="rs-lead">כך מתנהל תהליך הייצוג מול הלקוח, מהפתיחה ועד שהייצוג פעיל. המערכת מובילה את השלבים; המשרד קובע מה הלקוח קורא ומקבל בדרך.</div>
        <div className="rs-ref">
          <span>ההודעות יוצאות עם השולח, החתימה והמיתוג שהוגדרו למשרד.</span>
        </div>
      </div>

      <div className="rs-summary">
        <span>{totalArtifacts} הודעות וכרטיסים ללקוח</span>
        <span className="sep">·</span>
        <span>{customCount ? `${customCount} מותאמים על ידי המשרד` : 'הכל בנוסח ברירת המחדל'}</span>
        <span className="sep">·</span>
        <span>{remOnCount ? `תזכורות אוטומטיות: פעילות ב-${remOnCount} מתוך 4` : 'תזכורות אוטומטיות: כבויות'}</span>
      </div>

      <div className="rs-spine">
        {STAGES.map(st => {
          const open = openStages.has(st.n);
          return (
            <section key={st.n} className={`rs-stage ${open ? 'is-open' : ''}`}>
              <button type="button" className="rs-stage-head" aria-expanded={open} onClick={() => toggleStage(st.n)}>
                <span className="rs-stage-num">{st.n}</span>
                <span className="rs-stage-name">{st.name}</span>
                <span className="rs-stage-sum">{stageSummary(st)}</span>
                <svg className="rs-chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round"><path d="M6 9l6 6 6-6" /></svg>
              </button>
              {open && (
                <div className="rs-stage-body">
                  <div className="rs-cols">
                    <div>
                      <div className="rs-col-label">מה קורה <span className="rs-tag">מנוהל על ידי המערכת</span></div>
                      <div className="rs-happens">{HAPPENS[st.n].map((p, i) => <p key={i}>{p}</p>)}</div>
                    </div>
                    <div>
                      {st.n === 0 ? (
                        <DefaultsPanel rep={rep} onSetOn={setAuthorityOn} onSetLevel={setAuthorityLevel}
                          niSpouse={currentNiSpouse(rep)} onNiSpouse={v => patchDefaults({ niSpouse: v })}
                          delivery={currentDelivery(rep)} onDelivery={v => patchDefaults({ delivery: v })} />
                      ) : (
                        <>
                          <div className="rs-col-label">מה הלקוח מקבל</div>
                          {ARTIFACTS.filter(a => a.stage === st.n).map(a => (
                            <ArtifactRow key={a.id} art={a} custom={isCustom(a)}
                              title={a.type === 'mail' ? valuesOf(a).subject : REP_PORTAL_CARD_FIXED.title}
                              onEdit={() => openDrawer(a.id, 'edit')} onPreview={() => openDrawer(a.id, 'preview')} />
                          ))}
                          {st.reminders?.map(k => (
                            <ReminderBlock key={k} audience={k} cfg={reminderCfg(k)} onPatch={p => patchReminder(k, p)} />
                          ))}
                        </>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </section>
          );
        })}
      </div>

      {drawerArt && drawingArt && (
        <Drawer
          art={drawingArt}
          tab={drawerTab} onTab={setDrawerTab}
          values={drawerValues} onChange={(k, v) => setDrawerValues(prev => ({ ...prev, [k]: v }))}
          systemValues={systemValuesOf(drawingArt)}
          dirty={drawerDirty}
          onClose={closeDrawer} onApply={applyDrawer} onResetDefault={resetDrawerToDefault}
        />
      )}
    </>
  );
}

// ── שלב 0: ברירות מחדל ───────────────────────────────────────────────────────
function DefaultsPanel({ rep, onSetOn, onSetLevel, niSpouse, onNiSpouse, delivery, onDelivery }: {
  rep: RepSettings;
  onSetOn: (a: RepAuthorityKind, on: boolean) => void;
  onSetLevel: (a: RepAuthorityKind, level: RepLevel) => void;
  niSpouse: boolean; onNiSpouse: (v: boolean) => void;
  delivery: 'email' | 'link'; onDelivery: (v: 'email' | 'link') => void;
}) {
  return (
    <>
      <div className="rs-col-label">מה נבחר מראש בפתיחת בקשה</div>
      <div className="rs-opt-list">
        {REP_AUTHORITY_ORDER.filter(a => a !== 'nationalInsurance').map(a => {
          const cur = currentAuthority(rep, a);
          return (
            <div key={a}>
              <label className="rs-opt">
                <input type="checkbox" checked={cur.on} onChange={e => onSetOn(a, e.target.checked)} />
                <span>{REP_AUTHORITY_LABELS[a]}</span>
              </label>
              {cur.on && (
                <div className="rs-level-row">
                  <button type="button" className={`rs-pill ${cur.level === 'primary' ? 'is-on' : ''}`} onClick={() => onSetLevel(a, 'primary')}>{REP_LEVEL_LABELS.primary}</button>
                  <button type="button" className={`rs-pill ${cur.level === 'secondary' ? 'is-on' : ''}`} onClick={() => onSetLevel(a, 'secondary')}>{REP_LEVEL_LABELS.secondary}</button>
                </div>
              )}
            </div>
          );
        })}
        <label className="rs-opt">
          <input type="checkbox" checked={currentAuthority(rep, 'nationalInsurance').on} onChange={e => onSetOn('nationalInsurance', e.target.checked)} />
          <span>ביטוח לאומי <span className="rs-sub">אין דרגת ייצוג — מתנהל בנפרד לכל אדם</span></span>
        </label>
      </div>
      <div className="rs-opt-group">
        <div className="rs-opt-group-title">ללקוח נשוי</div>
        <label className="rs-opt">
          <input type="checkbox" checked={niSpouse} disabled={!currentAuthority(rep, 'nationalInsurance').on} onChange={e => onNiSpouse(e.target.checked)} />
          <span>לבקש ביטוח לאומי גם לבן/בת הזוג</span>
        </label>
      </div>
      <div className="rs-opt-group">
        <div className="rs-opt-group-title">איך הקישור מגיע ללקוח</div>
        <div className="rs-opt-list">
          <label className="rs-opt"><input type="radio" name="rs-delivery" checked={delivery === 'email'} onChange={() => onDelivery('email')} /><span>במייל <span className="rs-sub">מהכתובת של המשרד</span></span></label>
          <label className="rs-opt"><input type="radio" name="rs-delivery" checked={delivery === 'link'} onChange={() => onDelivery('link')} /><span>קישור להעתקה <span className="rs-sub">לוואטסאפ או SMS — שליחה ידנית מהמכשיר שלכם</span></span></label>
        </div>
      </div>
      <div className="rs-note">כשהיקף הייצוג כבר נקבע בהצעת מחיר שאושרה, ההיקף הזה תמיד גובר על הברירות שכאן — הן חלות רק על ייצוג שנפתח בלי הצעה שקדמה לו.</div>
    </>
  );
}

function ArtifactRow({ art, custom, title, onEdit, onPreview }: {
  art: Artifact; custom: boolean; title: string; onEdit: () => void; onPreview: () => void;
}) {
  return (
    <div className="rs-artifact">
      <div className="rs-art-icon" aria-hidden="true">
        <svg width={15} height={15} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round">
          {art.type === 'mail' ? <path d="M3 6h18v12H3z M3 7l9 6 9-6" /> : <path d="M4 4h7v7H4z M13 4h7v4h-7z M13 10h7v10h-7z M4 13h7v7H4z" />}
        </svg>
      </div>
      <div className="rs-art-main">
        <div className="rs-art-kind">{art.type === 'mail' ? 'מייל' : 'כרטיס בדף האישי'}{art.standalone ? ` · ${art.standalone}` : ''}</div>
        <div className="rs-art-title" title={title}>{title}</div>
        <div className="rs-art-meta"><span className={`rs-state ${custom ? 'is-custom' : ''}`}>{custom ? 'מותאם' : 'ברירת מחדל'}</span></div>
      </div>
      <div className="rs-art-actions">
        <button type="button" className="btn btn-ghost btn-sm" onClick={onPreview}>תצוגה מקדימה</button>
        <button type="button" className="btn btn-sm" onClick={onEdit}>ערוך</button>
      </div>
    </div>
  );
}

function ReminderBlock({ audience, cfg, onPatch }: { audience: RepReminderAudience; cfg: RepReminderConfig; onPatch: (p: Partial<RepReminderConfig>) => void }) {
  const meta = REMINDER_LABEL[audience];
  return (
    <div className="rs-reminders">
      <div className="rs-rem-head">
        <span className="rs-rem-title">תזכורות אוטומטיות</span>
        <span className="rs-new-tag">חדש</span>
        {meta.audience && <span className="rs-rem-audience">· {meta.audience}</span>}
        <label className="rs-switch">
          <span>{cfg.enabled ? 'פעיל' : 'כבוי'}</span>
          <input type="checkbox" checked={cfg.enabled} onChange={e => onPatch({ enabled: e.target.checked })} />
          <span className="rs-sw" />
        </label>
      </div>
      {cfg.enabled ? (
        <div className="rs-rem-body">
          {meta.when} אחרי{' '}
          <input type="number" min={1} max={60} value={cfg.afterDays} onChange={e => onPatch({ afterDays: Number(e.target.value) || 1 })} aria-label="ימים" />
          {' '}ימים — לשלוח תזכורת במייל, עד{' '}
          <input type="number" min={1} max={5} value={cfg.maxReminders} onChange={e => onPatch({ maxReminders: Number(e.target.value) || 1 })} aria-label="מספר תזכורות" />
          {' '}תזכורות.
          <div className="rs-rem-note">התזכורת יוצאת באותו נוסח ומאותו שולח, ונרשמת ב"פעילות מייל". כשמי שצריך לאשר מגיב — התזכורות נעצרות מעצמן.</div>
        </div>
      ) : (
        <div className="rs-rem-off-note">יכולת חדשה, כבויה כברירת מחדל. עד שתופעל, תזכורת יוצאת רק ידנית מכרטיס הלקוח ("שלח שוב").</div>
      )}
    </div>
  );
}

// ── מגירת עריכה / תצוגה מקדימה ────────────────────────────────────────────────
function Drawer({ art, tab, onTab, values, onChange, systemValues, dirty, onClose, onApply, onResetDefault }: {
  art: Artifact; tab: 'edit' | 'preview'; onTab: (t: 'edit' | 'preview') => void;
  values: Record<string, string>; onChange: (k: string, v: string) => void; systemValues: Record<string, string>;
  dirty: boolean; onClose: () => void; onApply: () => void; onResetDefault: () => void;
}) {
  const merged = (k: string) => (values[k] !== undefined ? values[k] : systemValues[k]);
  const hasCustom = Object.values(values).some(v => v !== undefined && v !== '');
  const fields = FIELD_DEFS[art.type];
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
      'יעד הקישור: gov.il — האזור האישי של רשות המסים. קבוע.',
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
                </div>
              ))}
              <div className="rs-locked">
                <b>מה קבוע ולא משתנה כאן</b>
                <ul>{lockedItems.map((l, i) => <li key={i}>{l}</li>)}<li>השולח, החתימה והמיתוג — לפי "ערוצי תקשורת", "חתימת מייל" ו"מותג".</li></ul>
              </div>
            </>
          ) : (
            <Preview art={art} values={{ ...systemValues, ...Object.fromEntries(Object.entries(values).filter(([, v]) => v !== undefined && v !== '')) }} />
          )}
        </div>
        <div className="rs-dr-foot">
          <button type="button" className="btn btn-ghost btn-sm" style={{ visibility: hasCustom ? 'visible' : 'hidden' }} onClick={onResetDefault}>חזרה לברירת המחדל</button>
          <span className="rs-dr-state">{hasCustom ? 'נוסח המשרד' : 'נוסח ברירת המחדל'}</span>
          <span className="rs-spacer" />
          <button type="button" className="btn btn-sm" onClick={onClose}>ביטול</button>
          <button type="button" className="btn btn-primary btn-sm" disabled={!dirty} onClick={onApply}>החל</button>
        </div>
      </aside>
    </>
  );
}

function Preview({ art, values }: { art: Artifact; values: Record<string, string> }) {
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
          <div className="rs-mail-foot">בברכה, שם המשרד · שאלות? פשוט השיבו למייל הזה.</div>
        </div>
      </div>
    );
  }
  return (
    <div className="rs-pv-wrap">
      <div className="rs-pv-hint">כך ייראה הכרטיס בדף האישי של הלקוח אחרי ההגשה למס הכנסה.</div>
      <div className="rs-portal">
        <div className="rs-portal-top"><div className="rs-mail-lockup">שם המשרד<small>הדף האישי של הלקוח</small></div></div>
        <div className="rs-portal-sec">מה צריך ממך</div>
        <div className="rs-pcard">
          <div className="rs-pcard-t">{REP_PORTAL_CARD_FIXED.title}</div>
          <div className="rs-pcard-s">{values.sub}</div>
          <div className="rs-pcard-n">{values.note}</div>
          <span className="rs-pcard-link">{values.linkLabel} ↗<small>gov.il · האזור האישי של רשות המסים</small></span>
          <div className="rs-pcard-after">{values.noteAfter}</div>
          <span className="rs-pcard-cta">{REP_PORTAL_CARD_FIXED.cta}</span>
        </div>
      </div>
    </div>
  );
}

// ─── הקומפוזר של מרכז התיק: הוספה ועריכה בתוך השלב, בלי מודל ────────────────
// המסלול המהיר (הכרעת גיא, 6+7): שם ← מי מטפל ← מה מצפים לקבל ← שמירה כטיוטה.
// כל השאר — תלויות, נדרש-לסגירה, תאריך יעד, ניסוח ללקוח — מאחורי "עוד הגדרות".
//
// ‼ הדרישות הן שדות בתוך בקשה אחת, לא משימות נפרדות.
// ‼ הכול נולד טיוטה; עריכת בקשה שפורסמה נכתבת ל-draft_payload והלקוח רואה
//   את הישן עד "עדכן את דף הלקוח" (D4).
// ‼ גורם חיצוני: מוכנות פרטי הקשר היא דרישת-מערכת, לא תלות — היא מוצגת
//   ומוסברת, אבל אי אפשר "להסיר" אותה (Correction 1).

import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { profileFromDb } from '../../lib/dbMappers';
import type { CustomRequirement, CustomRequirementKind, ExternalPartyConfig, OnboardingStep } from '../../types/onboarding';
import { REQUIREMENT_KIND_LABELS, STEP_TYPE_LABELS } from '../../types/onboarding';
import type { FirmProfile } from '../../types/firmProfile';
import type { TemplateEntry } from '../../lib/requestTemplates';
import { differsFromTemplate, saveRequestTemplate, templateCarryOver, updateRequestTemplate } from '../../lib/requestTemplates';
import TemplateCarryNote from '../portal/TemplateCarryNote';
import type { IntakeContext } from '../../lib/clientState';
import { intakeAcceptsRequired } from '../../lib/clientState';
import EmailInput from '../ui/EmailInput';
import { isManualInternal, neverOnClientPage } from '../../utils/clientFacingRows';
import { templateEntryOwner } from '../../utils/templateEntryOwner';
import PreviewButton from '../../features/requestPreview/PreviewButton';
import RequestPreviewSheet from '../../features/requestPreview/RequestPreviewSheet';
import type { PreviewTarget } from '../../features/requestPreview/targets';

/** שם הבקשה בשביל צ'יפ התלות ורשימת הבחירה.
 *  ‼ היה כאן נפילה ל-stepType הגולמי, ולכן תלות בשלב מובנה הוצגה לרו"ח
 *  כ-"client_documents" — מזהה של המסד על המסך. השם שניתן גובר, אחריו
 *  הניסוח ללקוח, ורק אז התווית העברית של הסוג. */
function depLabel(s: OnboardingStep): string {
  return String(s.payload.title ?? '').trim()
    || String(s.payload.clientTitle ?? '').trim()
    || STEP_TYPE_LABELS[s.stepType]
    || s.stepType;
}

export type Owner = 'client' | 'me' | 'external';

interface InputRow {
  key: string;
  kind: CustomRequirementKind;
  label: string;
  required: boolean;
  optionsText: string;   // select — אפשרויות מופרדות בפסיקים
  maxFiles: string;      // files — ריק = בלי תקרה
}

const KIND_ORDER: CustomRequirementKind[] = [
  'file', 'files', 'text', 'email', 'phone', 'number', 'date', 'select', 'confirm',
];

const ERRORS: Record<string, string> = {
  no_requirements: 'בקשת לקוח צריכה לפחות פריט אחד.',
  missing_requirement_label: 'לכל פריט צריך תווית.',
  select_needs_options: 'בחירה מרשימה צריכה לפחות שתי אפשרויות (מופרדות בפסיק).',
  bad_requirement_kind: 'סוג פריט לא מוכר.',
  missing_external_party: 'צריך לבחור מי הגורם החיצוני.',
  stage_not_found: 'השלב לא נמצא - נסו לרענן.',
  dependency_cycle: 'התלות הזאת יוצרת מעגל.',
  step_terminal: 'הבקשה כבר נסגרה - אי אפשר לערוך אותה.',
  not_editable: 'את הבקשה הזאת עורכים במסך שלה.',
  personal_confirm_for_subject: `«${REQUIREMENT_KIND_LABELS.confirm}» בבקשה בשם בן/בת הזוג הוא אישור אישי שלו/ה - אי אפשר לבקש אותו בדף של בעל הכרטיס. שנו את סוג הפריט או הסירו אותו.`,
};

/**
 * סוגי הפריט שמוצעים בשורה.
 * ‼ בבקשה בשם בן/בת הזוג (subjectRole 'spouse') אין «לקרוא ולאשר»: הבקשה יושבת
 * בדף של בעל הכרטיס, ואישור שם היה נותן לו לאשר במקום בן/בת הזוג (§9). שורה
 * ישנה שכבר מסומנת כך נשארת בתפריט שלה כדי שהבחירה לא תתחלף בשקט — והשמירה
 * נחסמת עד שמשנים אותה.
 */
export function requirementKindsFor(subjectRole: unknown, current?: CustomRequirementKind): CustomRequirementKind[] {
  if (subjectRole !== 'spouse') return KIND_ORDER;
  return KIND_ORDER.filter(k => k !== 'confirm' || current === 'confirm');
}

/**
 * הנושא של בקשה קיימת. ‼ «צילום תעודה לרשות המסים» (208) שומר את האדם ב-shaamIdentity.person
 * ולא ב-subjectRole — צילום של בן/בת הזוג הוא בקשה בשם בן/בת הזוג לכל דבר (§9).
 */
export function subjectRoleOf(content: Record<string, unknown> | null | undefined): unknown {
  if (!content) return undefined;
  if (content.subjectRole) return content.subjectRole;
  const sid = content.shaamIdentity as { person?: unknown } | undefined;
  return sid && typeof sid === 'object' && sid.person === 'spouse' ? 'spouse' : undefined;
}

/** אותו כלל בשמירה — לפני שהשרת דוחה (personal_confirm_for_subject). */
export function spouseConfirmError(subjectRole: unknown, kinds: CustomRequirementKind[], who: string): string | null {
  if (subjectRole !== 'spouse' || !kinds.includes('confirm')) return null;
  return `«${REQUIREMENT_KIND_LABELS.confirm}» הוא אישור אישי של ${who} - אי אפשר לבקש אותו בדף של בעל הכרטיס. שנו את סוג הפריט או הסירו אותו.`;
}

/**
 * סימון משימה פנימית — רק ביצירה עם «אני».
 * ‼ לא נגזר מהכדור: בקשה של הלקוח שהושלמה עוברת גם היא לכדור של המשרד, וסינון
 * לפי הכדור היה מוריד אותה מהדף. השרת משאיר משימה מסומנת מחוץ לדף האישי.
 * בעריכה לא שולחים כלום — המיזוג בשרת שומר את הסימון שכבר נשמר.
 */
export function internalTaskMarker(owner: Owner, editing: boolean): { internalTask?: true } {
  return owner === 'me' && !editing ? { internalTask: true } : {};
}

/**
 * «אני» — משימה פנימית נולדת מפורסמת: היא לעולם לא בדף ולא במייל של הלקוח (השרת
 * מסנן internalTask), ולכן אין לה «טיוטה» ואין מה לפרסם. ‼ הסימון internalTask נשאר
 * (internalTaskMarker): הטריגר בשרת מסמן רק בקשת משרד בלי דרישות. בקשה ללקוח ולגורם
 * חיצוני — נולדת טיוטה (D4).
 */
export const bornPublished = (owner: Owner): boolean => owner === 'me';

/**
 * שורה שלעולם לא מופיעה בדף הלקוח — משימה פנימית (internalTask) או משימת האישור
 * האישי של בן/בת הזוג (personalConfirmFor). ‼ ההגדרה ב-utils/clientFacingRows (מקור
 * אחד גם לספירה ולמקטעים); כאן רק מייצאים הלאה.
 */
export { neverOnClientPage };

/**
 * מי מטפל בבקשה קיימת — לעריכה. ‼ (סבב 4) לא לפי הכדור לבדו: בקשה של הלקוח
 * שהלקוח השלים (הכדור עבר למשרד) היא עדיין בקשה ללקוח — הקומפוזר היה פותח אותה
 * כ«אני» ומשמיט את הפריטים. ומשימה פנימית שהועברה ל«ממתין ללקוח» — עדיין פנימית.
 */
export function editOwnerOf(step: OnboardingStep): Owner {
  if (step.payload.externalParty) return 'external';
  return isManualInternal(step) ? 'me' : 'client';
}

/** הנוסח הקבוע במקום בחירת «מי מטפל» בעריכה — השרת לא מחליף בעלים בעריכה. */
export const EDIT_OWNER_TEXT: Record<Owner, string> = {
  me: 'משימה פנימית - לא מופיעה בדף של הלקוח',
  client: 'בקשה ללקוח',
  external: 'בקשה לגורם חיצוני',
};

// ─── «דלג על הבקשה» ───────────────────────────────────────────────────────────
// ‼ כאן ולא במסך הבקשות, כדי שאפשר יהיה לבדוק אותו בלי לטעון את כל המסך.

/** סיבות הדילוג שהשרת מכיר (step_satisfies_dependency, 168) — בשפה של המסך. */
const KNOWN_SKIP_REASON_TEXT: Record<string, string> = {
  not_applicable: 'אין צורך',
  not_applicable_history: 'אין צורך',
  already_connected: 'הלקוח כבר מחובר',
  transferred_rep: 'הועבר ממייצג אחר',
};

/**
 * מה נשלח לשרת ב«דלג על הבקשה» (לא פייפרלס). null = לא הוקלדה סיבה.
 * ‼ בקשה של מסלול (flowRunId): השרת סופר דילוג כ«בוצע» רק עם סיבה מוכרת. סיבה
 * חופשית השאירה את השלב במסלול פתוח לתמיד — השלב הבא לא נפתח, והספירה כבר
 * הראתה «הושלם». לכן במסלול הסיבה היא 'not_applicable', ומה שהוקלד נשמר כהערה.
 * בקשה מחוץ למסלול — כמו קודם.
 */
export function skipPayloadFor(step: { flowRunId?: string | null }, text: string | null | undefined): Record<string, string> | null {
  const t = (text ?? '').trim();
  if (!t) return null;
  return step.flowRunId
    ? { reason: 'not_applicable', note: t, skipNote: t }
    : { reason: t, note: t };
}

/** «דולג · …» ברשימת «הושלמו»: מה שהוקלד, אחרת שם הסיבה. קוד פנימי לא מוצג. */
export function skippedLabel(payload: { skipReason?: unknown; skipNote?: unknown } | null | undefined): string {
  const note = typeof payload?.skipNote === 'string' ? payload.skipNote.trim() : '';
  const reason = typeof payload?.skipReason === 'string' ? payload.skipReason.trim() : '';
  const why = note || KNOWN_SKIP_REASON_TEXT[reason] || (/^[a-z_]+$/.test(reason) ? '' : reason);
  return why ? `דולג · ${why}` : 'דולג';
}

let nextTempKey = 1;
const freshKey = () => `r${Date.now().toString(36)}${nextTempKey++}`;

function emptyRow(): InputRow {
  return { key: freshKey(), kind: 'file', label: '', required: true, optionsText: '', maxFiles: '' };
}

// ─── מה הקומפוזר יוצר — פונקציות טהורות ───────────────────────────────────────
// ‼ «צפייה» ב«＋ בקשה חדשה» מראה את הפלט של אותה בנייה (לא את ה-payload הגולמי של הנוסח בספרייה):
// הקומפוזר בונה מהשדות שעל המסך בלבד (+ ארבעת מפתחות ההעברה), ולכן מה שנוצר בפועל יכול להיות
// פחות ממה שהנוסח נושא (למשל קובץ/קישור שצורפו לנוסח). מקור אחד לשניהם — הרכיב וה«צפייה».

/** מה שהקומפוזר מחזיק על המסך, חוץ מהבעלים. */
export interface ComposerFields {
  name: string;
  rows: InputRow[];
  extKind: 'prev_accountant' | 'other';
  extContact: { name: string; email: string; phone: string };
  emailSubject: string;
  emailBody: string;
  internalNote: string;
  clientSub: string;
  clientCta: string;
  auto: boolean;
}

/** מצב הפתיחה מתוכן קיים — בקשה שנערכת, או נוסח מהספרייה. */
export function composerFieldsFromContent(content: Record<string, unknown> | null | undefined, startOwner: Owner): ComposerFields {
  const ext = content?.externalParty as ExternalPartyConfig | undefined;
  const reqs = (content?.requirements as CustomRequirement[] | undefined) ?? [];
  const own = String(content?.title ?? '').trim();
  const seen = String(content?.clientTitle ?? '').trim();
  return {
    /* ‼ בקשה שהלקוח רואה — השם מתחיל ממה שהוא רואה (clientTitle), לא מהשם הפנימי: השמירה כותבת
       את השם לשניהם, ושם פנימי שונה היה דורס בשקט את מה שבדף. משימה פנימית — השם הפנימי. */
    name: startOwner === 'me' ? (own || seen) : (seen || own),
    rows: reqs.length ? reqs.map(x => ({
      key: x.key, kind: x.kind, label: x.label, required: x.required !== false,
      optionsText: (x.options ?? []).join(', '), maxFiles: x.maxFiles ? String(x.maxFiles) : '',
    })) : [emptyRow()],
    extKind: ext?.kind ?? 'prev_accountant',
    extContact: { name: ext?.contact?.name ?? '', email: ext?.contact?.email ?? '', phone: ext?.contact?.phone ?? '' },
    emailSubject: String(content?.emailSubject ?? ''),
    emailBody: String(content?.emailBody ?? ''),
    internalNote: String(content?.internalNote ?? ''),
    clientSub: String(content?.clientSub ?? ''),
    clientCta: String(content?.clientCta ?? ''),
    auto: content?.autoAction != null && (content.autoAction as { kind?: string }).kind === 'email',
  };
}

export interface ComposerPayloadInput extends ComposerFields {
  owner: Owner;
  /** עריכה של בקשה קיימת — ולא יצירה. */
  edit: boolean;
  /** תוכן הפתיחה (נוסח מהספרייה) — ממנו עוברים ההסבר והמדריך המצולם. */
  initialContent?: Record<string, unknown>;
  /** הנושא של הבקשה (לא הבעלים) — 'spouse' כשהיא בשם בן/בת הזוג. */
  subjectRole: unknown;
  subjectWho: string;
}

/** למה אי אפשר לשמור את מה שעל המסך. null = אפשר. ‼ הסדר זהה לסדר הבדיקות שהיה ב-buildPayload. */
export function composerProblem(f: ComposerPayloadInput): string | null {
  if (!f.name.trim()) return 'צריך שם לבקשה - הוא גם מה שהלקוח יראה.';
  const activeRows = f.owner === 'client' ? f.rows.filter(r => r.label.trim()) : [];
  if (f.owner === 'client' && activeRows.length === 0) return ERRORS.no_requirements;
  for (const r of activeRows) {
    if (r.kind === 'select') {
      const opts = r.optionsText.split(',').map(s => s.trim()).filter(Boolean);
      if (opts.length < 2) return ERRORS.select_needs_options;
    }
  }
  return spouseConfirmError(f.subjectRole, activeRows.map(r => r.kind), f.subjectWho);
}

/** ה-payload שהקומפוזר שולח — בלי בדיקות (ל«צפייה» בטיוטה שעוד לא שלמה). שמירה: composerProblem קודם. */
export function composerPayload(f: ComposerPayloadInput): Record<string, unknown> {
  const { name, owner, rows, extKind, extContact, emailSubject, emailBody, internalNote, clientSub, clientCta, auto, edit, initialContent } = f;
  const title = name.trim();
  const activeRows = owner === 'client' ? rows.filter(r => r.label.trim()) : [];

  const requirements: CustomRequirement[] = activeRows.map(r => ({
    key: r.key,
    kind: r.kind,
    label: r.label.trim(),
    done: false,
    ...(r.required ? {} : { required: false }),
    ...(r.kind === 'select'
      ? { options: r.optionsText.split(',').map(s => s.trim()).filter(Boolean) } : {}),
    ...(r.kind === 'files' && Number(r.maxFiles) > 0
      ? { maxFiles: Number(r.maxFiles) } : {}),
  }));

  const externalParty: ExternalPartyConfig | undefined = owner === 'external'
    ? (extKind === 'prev_accountant'
        ? { kind: 'prev_accountant' }
        : {
            kind: 'other',
            contact: {
              name: extContact.name.trim() || undefined,
              email: extContact.email.trim() || undefined,
              phone: extContact.phone.trim() || undefined,
            },
          })
    : undefined;

  return {
    title,
    clientTitle: title,
    clientSub: clientSub.trim(),
    clientCta: clientCta.trim(),
    /* ‼ מה שהנוסח בספרייה נושא ללקוח ושאינו שדה כאן — ההסבר והמדריך המצולם. בלעדיו הבקשה
       הייתה מגיעה ללקוח בלי הסבר (נזרק בשקט). רק ביצירה ורק בבקשה ללקוח: משימה פנימית וגורם
       חיצוני לא נושאים הסבר ללקוח, ובעריכה המיזוג בשרת שומר את המפתחות שכבר נשמרו. */
    ...(!edit && owner === 'client' ? templateCarryOver(initialContent) : {}),
    ...(requirements.length ? { requirements } : {}),
    ...(externalParty ? { externalParty } : {}),
    ...internalTaskMarker(owner, !!edit),
    /* ‼ null מפורש ולא היעדר, מאותה סיבה כמו autoAction: מיזוג הפרסום
       שומר מפתחות שלא נשלחו, ולכן מחיקת נוסח שנשמר חייבת לדרוס אותו. */
    ...(owner === 'external' ? {
      emailSubject: emailSubject.trim() || null,
      emailBody: emailBody.trim() || null,
      internalNote: internalNote.trim() || null,
    } : {}),
    // ‼ null מפורש ולא היעדר: ביטול אוטומציה על בקשה שפורסמה חייב לדרוס
    // את המפתח בפרסום (merge שומר מפתחות שלא נשלחו).
    // ‼ גורם חיצוני בלבד — ראה ההערה ליד הפקד.
    autoAction: (auto && owner === 'external') ? { kind: 'email' } : null,
  };
}

/** מה שנשלח לשמירה, או למה אי אפשר. */
export function buildComposerPayload(f: ComposerPayloadInput): Record<string, unknown> | { error: string } {
  const problem = composerProblem(f);
  return problem ? { error: problem } : composerPayload(f);
}

/**
 * מה הקומפוזר יוצר מנוסח בספרייה שנפתח בו ללא שינוי — ל«צפייה» ב«＋ בקשה חדשה».
 * ‼ הבעלים כמו ב-OnboardingTab (templateEntryOwner), והנושא כמו בקומפוזר (subjectRoleOf).
 */
export function composerPreviewOfTemplate(entry: TemplateEntry | undefined): { owner: Owner; payload: Record<string, unknown> } {
  const content = (entry?.payload ?? {}) as Record<string, unknown>;
  const owner = templateEntryOwner(entry);
  const payload = composerPayload({
    ...composerFieldsFromContent(content, owner),
    owner, edit: false, initialContent: content,
    subjectRole: subjectRoleOf(content),
    subjectWho: String(content.subjectName ?? '').trim() || 'בן/בת הזוג',
  });
  return { owner, payload };
}

/** הפרופיל של המשרד — ללשונית «במייל» בצפייה. כשל ⇒ פרופיל ריק (מייל לא ממותג), לא תקלה. */
export const EMPTY_FIRM_PROFILE: FirmProfile = { id: '', branding: {}, communication: {}, settings: {} };
export async function loadFirmProfile(): Promise<FirmProfile> {
  const { data, error } = await supabase.from('profiles').select('*').limit(1).maybeSingle();
  return error || !data ? EMPTY_FIRM_PROFILE : profileFromDb(data as Record<string, unknown>);
}

export default function InlineComposer({
  clientId, stageId, editStep, initialContent, sourceTemplate, initialDeps, initialOwner, existingSteps, prevAccountant, intake, onSaved, onCancel,
}: {
  clientId: string;
  /**
   * הקשר הקליטה של הלקוח — אותו כלל בדיוק כמו בחלון הקטלוג. שתי נקודות
   * הכניסה נבדלות ב-UX (אחת מוסיפה בלחיצה, זו מרכיבה טיוטה) אבל לא בכללים.
   */
  intake: IntakeContext;
  /** שלב-העל שבו נלחץ "+ הוסף" — נגזר מההקשר, לא נשאל. null = דלי ברירת-מחדל. */
  stageId?: string | null;
  /** מי מטפל כברירת מחדל. 'me' — כשנפתח מ"+ משימה פנימית". */
  initialOwner?: Owner;
  /** מצב עריכה — אותו קומפוזר, מלא מראש. */
  editStep?: OnboardingStep;
  /**
   * תוכן פתיחה מתבנית — בקשה חדשה שנולדת מלאה במקום ריקה.
   * ‼ עותק בלבד: מרגע הפתיחה אין קשר לתבנית, ועריכה כאן לא תיגע בה לעולם.
   */
  initialContent?: Record<string, unknown>;
  /** התבנית שממנה נפתח — לזיהוי "השתנה" ולפעולות השמירה בסיום. */
  sourceTemplate?: { id: string; name: string; isSeed: boolean; entry?: TemplateEntry };
  /** כל ההורים של השלב הנערך (מטבלת התלויות) — לא רק הראשון. */
  initialDeps?: string[];
  /** בקשות פתוחות אחרות של הלקוח — לבחירת "ממתין ל…". */
  existingSteps: OnboardingStep[];
  /** פרטי הרו״ח הקודם מכרטיס הלקוח — לפתרון דרישת-הקשר של גורם חיצוני. */
  prevAccountant?: { name?: string; email?: string; phone?: string };
  /** נקרא אחרי שמירה מוצלחת, עם השלב האופטימי להצגה מיידית. */
  onSaved: (optimistic: OnboardingStep) => void;
  onCancel: () => void;
}) {
  const edit = editStep ?? null;
  const editContent: Record<string, unknown> | null = edit
    ? { ...edit.payload, ...(edit.draftPayload ?? {}) }
    : (initialContent ?? null);
  /** הנושא של הבקשה (לא הבעלים) — 'spouse' כשהיא בשם בן/בת הזוג. */
  const subjectRole = subjectRoleOf(editContent);
  const subjectWho = String(editContent?.subjectName ?? '').trim() || 'בן/בת הזוג';

  const startOwner: Owner = edit ? editOwnerOf(edit) : initialOwner ?? 'client';
  // ‼ מצב הפתיחה נגזר פעם אחת בפונקציה המשותפת (composerFieldsFromContent) — אותה שבה «צפייה» ב«＋ בקשה חדשה» בונה את מה שייווצר.
  const [init] = useState(() => composerFieldsFromContent(editContent, startOwner));
  const [name, setName] = useState(init.name);
  const [owner, setOwner] = useState<Owner>(startOwner);
  const [rows, setRows] = useState<InputRow[]>(init.rows);
  const [extKind, setExtKind] = useState<'prev_accountant' | 'other'>(init.extKind);
  const [extContact, setExtContact] = useState(init.extContact);
  /* ‼ בקשת המשך נולדת עם תלות מסומנת — ולכן ההגדרות נפתחות מיד. התנאי הוא
     כל הסיבה שהבקשה הזאת נוצרה, ולהסתיר אותו מאחורי "עוד הגדרות" היה מבקש
     מהרו"ח לאמת באמונה שמה שביקש באמת נשמר. */
  const [showAdvanced, setShowAdvanced] = useState(
    !editStep && Array.isArray(initialDeps) && initialDeps.length > 0);
  /* ── נוסח המייל של בקשה לגורם חיצוני ──────────────────────────────────
     ‼ נשמר על הבקשה עצמה, ולא רק בחלון השליחה: מייל לרו"ח קודם נכתב פעם
     אחת ונשלח אחרי שהתנאי מתקיים — לפעמים שבועות אחר כך, ולפעמים בתזכורת
     שנייה ושלישית. נוסח שחי רק ברגע השליחה היה נכתב מחדש בכל פעם.
     ריק ⇒ נופלים לנוסח הנגזר בשרת, בדיוק כמו כל הבקשות שנוצרו עד היום. */
  const [emailSubject, setEmailSubject] = useState(init.emailSubject);
  const [emailBody, setEmailBody] = useState(init.emailBody);
  /** לעיניים של הרו"ח בלבד — לא נכנס למייל ולא לדף הלקוח. */
  const [internalNote, setInternalNote] = useState(init.internalNote);
  const [clientSub, setClientSub] = useState(init.clientSub);
  const [clientCta, setClientCta] = useState(init.clientCta);
  /** ‼ ללא הקשר קליטה — תמיד false ובלי פקד, בדיוק כמו בחלון הקטלוג. */
  const requiredApplies = intakeAcceptsRequired(intake);
  const [requiredForClose, setRequiredForClose] = useState(
    edit ? edit.requiredForClose !== false : requiredApplies);
  const [dueDate, setDueDate] = useState(edit?.dueDate ?? '');
  const [deps, setDeps] = useState<string[]>(
    initialDeps && initialDeps.length > 0
      ? initialDeps
      : (edit?.dependsOnStepId ? [edit.dependsOnStepId] : []));
  /** קבוצת ההורים שאיתה נפתח הטופס — נקודת ההשוואה בשמירה. */
  const [initialDepSet] = useState<string[]>(
    initialDeps && initialDeps.length > 0
      ? initialDeps
      : (edit?.dependsOnStepId ? [edit.dependsOnStepId] : []));
  /** ביצוע אוטומטי (D3): ברירת המחדל ידני. נחמש רק אחרי "עדכן את דף הלקוח". */
  const [auto, setAuto] = useState(init.auto);
  const [depsOpen, setDepsOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /* ── מה לעשות עם התבנית ────────────────────────────────────────────────
     ‼ ברירת המחדל היא תמיד "רק ללקוח הזה". המשימה היא לשלוח בקשה נכונה
     ללקוח; ניהול תבניות הוא לוואי, ולכן הבלוק כולו מופיע רק אם באמת שינית
     משהו — ואף פעם לא חוסם את השמירה. */
  const [tplAction, setTplAction] = useState<'none' | 'update' | 'new'>('none');
  const [tplNewName, setTplNewName] = useState('');

  /** האם התוכן כבר אינו מה שהתבנית נתנה. נבדק על התוכן החי, לא על מה שנשמר. */
  const templateChanged = useMemo(() => {
    if (!sourceTemplate?.entry || edit) return false;
    return differsFromTemplate(sourceTemplate.entry, {
      title: name,
      clientSub,
      clientCta,
      requirements: rows.map(r => ({ label: r.label, kind: r.kind, required: r.required })),
    });
  }, [sourceTemplate, edit, name, clientSub, clientCta, rows]);

  const depCandidates = useMemo(
    () => existingSteps.filter(s =>
      s.id !== edit?.id &&
      !['completed', 'verified', 'cancelled', 'skipped'].includes(s.status)),
    [existingSteps, edit?.id]);

  // דרישת-הקשר של הגורם החיצוני — נגזרת, לא ניתנת להסרה (Correction 1).
  const prevEmail = prevAccountant?.email?.trim();
  const contactGap = owner === 'external'
    ? (extKind === 'prev_accountant'
        ? (prevEmail ? null : 'חסר אימייל של הרו״ח הקודם')
        : (extContact.email.trim() ? null : 'חסר אימייל של הגורם'))
    : null;

  function setRow(i: number, patch: Partial<InputRow>) {
    setRows(rs => rs.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  }
  function moveRow(i: number, dir: -1 | 1) {
    setRows(rs => {
      const j = i + dir;
      if (j < 0 || j >= rs.length) return rs;
      const next = [...rs];
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });
  }

  /** מה שעל המסך כעת — הקלט של הבנייה (composerPayload / composerProblem). */
  const composerInput = (): ComposerPayloadInput => ({
    name, owner, rows, extKind, extContact, emailSubject, emailBody, internalNote, clientSub, clientCta, auto,
    edit: !!edit, initialContent, subjectRole, subjectWho,
  });

  function buildPayload(): Record<string, unknown> | { error: string } {
    return buildComposerPayload(composerInput());
  }

  // ─── «צפייה» — מה הלקוח יראה ממה שעל המסך (טיוטה, לא נשמר) ──────────────────────────────────
  // ‼ רק בבקשה ללקוח: משימה פנימית וגורם חיצוני אינם בדף. הדוגמה תמיד נתוני דוגמה — הדף של הלקוח עצמו ב«איך זה ייראה».
  // ‼ בעריכה מראים את המיזוג שהשרת עושה (התוכן השמור + מה שעל המסך), לא את מה שעל המסך לבדו.
  const [preview, setPreview] = useState<PreviewTarget | null>(null);
  const [wantPreview, setWantPreview] = useState(false);
  const [firm, setFirm] = useState<FirmProfile | null>(null);
  useEffect(() => {
    if (!wantPreview || firm) return;
    let alive = true;
    void loadFirmProfile().then(p => { if (alive) setFirm(p); });
    return () => { alive = false; };
  }, [wantPreview, firm]);
  function openPreview() {
    const built = composerPayload(composerInput());
    setPreview({
      kind: 'draft', name: name.trim() || 'בקשה חדשה', stepType: 'custom_request', owner,
      payload: edit ? { ...(editContent ?? {}), ...built } : built,
    });
    setWantPreview(true);
  }

  async function save() {
    setError(null);
    const payload = buildPayload();
    if ('error' in payload) { setError(payload.error as string); return; }
    setBusy(true);

    if (edit) {
      const { data, error: rpcErr } = await supabase.rpc('update_onboarding_request', {
        p_step_id: edit.id,
        p_payload: payload,
        p_due_date: dueDate || null,
        p_apply_due: true,
      });
      const res = data as { ok?: boolean; error?: string; pendingEdit?: boolean } | null;
      if (rpcErr || !res?.ok) {
        setBusy(false);
        setError(ERRORS[res?.error ?? ''] ?? rpcErr?.message ?? 'השמירה נכשלה.');
        return;
      }
      /* ‼ היה כאן באג: ההשוואה הייתה מול edit.dependsOnStepId — עמודת ההורה
         היחיד, שמשקפת רק את הראשון מבין ההורים. בקשה שתלויה ב-A וב-B, שממנה
         הסירו את B, נתנה deps=['A'] מול dependsOnStepId='A' — זהה, ולכן הקריאה
         דולגה וההסרה נעלמה בשקט. משווים מול קבוצת ההורים שאיתה נפתח הטופס. */
      const before = [...initialDepSet].sort().join('|');
      const after = [...deps].sort().join('|');
      if (before !== after) {
        const { data: depData, error: depErr } = await supabase.rpc(
          'set_onboarding_step_dependencies', { p_step_id: edit.id, p_depends_on: deps });
        const depRes = depData as { ok?: boolean; error?: string } | null;
        if (depErr || !depRes?.ok) {
          setBusy(false);
          setError(ERRORS[depRes?.error ?? ''] ?? 'התלות לא נשמרה - שאר השינויים כן.');
          return;
        }
      }
      setBusy(false);
      onSaved(res.pendingEdit
        ? { ...edit, draftPayload: payload, dueDate: dueDate || undefined }
        : { ...edit, payload: { ...edit.payload, ...payload }, dueDate: dueDate || undefined });
      return;
    }

    const { data, error: rpcErr } = await supabase.rpc('create_onboarding_request', {
      p_client_id: clientId,
      p_step_type: 'custom_request',
      p_payload: payload,
      p_due_date: dueDate || null,
      p_depends_on: deps[0] ?? null,
      // ‼ בקשה ללקוח/לגורם חיצוני נולדת טיוטה (D4); משימה פנימית — מפורסמת (bornPublished).
      p_published: bornPublished(owner),
      p_required_for_close: requiredForClose,
      p_owner: owner,
      p_stage_id: stageId ?? null,
    });
    const res = data as { ok?: boolean; error?: string; stepId?: string; status?: string; heldUntilApproval?: boolean } | null;
    if (rpcErr || !res?.ok || !res.stepId) {
      setBusy(false);
      setError(ERRORS[res?.error ?? ''] ?? rpcErr?.message ?? 'היצירה נכשלה.');
      return;
    }
    if (deps.length > 1) {
      await supabase.rpc('set_onboarding_step_dependencies', { p_step_id: res.stepId, p_depends_on: deps });
    }

    /* ‼ אחרי שהבקשה כבר נוצרה, ורק אם ביקשת במפורש. כישלון כאן אינו מבטל
       את הבקשה — היא הדבר החשוב, והתבנית היא לוואי. */
    if (sourceTemplate && tplAction !== 'none') {
      const tplErr = tplAction === 'update'
        ? await updateRequestTemplate(sourceTemplate.id, res.stepId)
        : await saveRequestTemplate(res.stepId, tplNewName.trim() || name.trim() || 'תבנית חדשה');
      if (tplErr) {
        setBusy(false);
        setError('הבקשה נוצרה, אבל שמירת התבנית נכשלה. אפשר לנסות שוב מהבקשה עצמה.');
        return;
      }
    }

    setBusy(false);
    // ‼ לפני אישור ההצעה השרת מחזיק הכול לא-מפורסם (requests_held_until_approval).
    const published = bornPublished(owner) && !res.heldUntilApproval;
    onSaved({
      id: res.stepId,
      clientId,
      stepType: 'custom_request',
      track: 'custom',
      scope: 'person',
      status: (res.status as OnboardingStep['status']) ?? 'pending',
      ball: owner === 'me' ? 'me' : owner === 'external'
        ? (extKind === 'prev_accountant' ? 'prev_accountant' : 'external') : 'client',
      dependsOnStepId: deps[0],
      requiredForClose,
      dueDate: dueDate || undefined,
      stageId: stageId ?? null,
      publishedAt: published ? new Date().toISOString() : null,
      needsAttention: false,
      payload: { ...(payload as object), ...(published ? {} : { published: false }) },
      completionMethod: 'manual',
    });
  }

  const field: React.CSSProperties = {
    font: 'inherit', fontSize: 'var(--fs-13)', color: 'var(--ink-1)',
    padding: '.4rem .55rem', border: '1px solid var(--bd)', borderRadius: 'var(--radius)',
    background: 'var(--card, #fff)', minWidth: 0,
  };
  const pill = (active: boolean): React.CSSProperties => ({
    font: 'inherit', fontSize: 'var(--fs-13)', fontWeight: 600, cursor: 'pointer',
    padding: '.3rem .8rem', borderRadius: 999, minHeight: 36,
    border: `1px solid ${active ? 'var(--accent)' : 'var(--bd)'}`,
    color: active ? '#fff' : 'var(--ink-2)',
    background: active ? 'var(--accent)' : 'transparent',
  });

  return (
    <div style={{
      display: 'grid', gap: '.6rem', padding: '.7rem .75rem', margin: '.35rem 0',
      border: '1px solid var(--bd-strong, var(--bd))', borderRadius: 'var(--radius)',
      background: 'var(--surface-2)',
    }}>
      <div style={{ display: 'flex', gap: '.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
        <input
          autoFocus
          style={{ ...field, flex: 1, minWidth: 180 }}
          placeholder={owner === 'me' ? 'שם המשימה' : 'שם הבקשה'}
          value={name}
          disabled={busy}
          onChange={e => setName(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') void save(); if (e.key === 'Escape') onCancel(); }}
        />
        {/* ‼ (סבב 4) בעריכה אין בחירה: השרת לא מחליף בעלים בעריכה, וכפתורים פעילים
            הבטיחו מעבר שלא קורה (משימה שהועברה ל«לקוח» נשארה מוסתרת מהדף). */}
        {edit ? (
          <span style={{ fontSize: 'var(--fs-13)', fontWeight: 600, color: 'var(--ink-2)' }}>
            {EDIT_OWNER_TEXT[owner]}
          </span>
        ) : (
          <span role="group" aria-label="מי מטפל" style={{ display: 'inline-flex', gap: '.3rem' }}>
            <button type="button" style={pill(owner === 'client')} aria-pressed={owner === 'client'}
              onClick={() => setOwner('client')}>לקוח</button>
            <button type="button" style={pill(owner === 'me')} aria-pressed={owner === 'me'}
              onClick={() => setOwner('me')}>אני</button>
            <button type="button" style={pill(owner === 'external')} aria-pressed={owner === 'external'}
              onClick={() => setOwner('external')}>גורם חיצוני</button>
          </span>
        )}
      </div>
      {edit && (
        <span style={{ fontSize: 'var(--fs-12)', color: 'var(--ink-3)' }}>
          כדי להעביר את הבקשה למישהו אחר - הסר אותה וצור חדשה
        </span>
      )}
      {/* ‼ מה שהלקוח יקבל ואינו שדה כאן — ההסבר והמדריך המצולם מהספרייה. רק בבקשה ללקוח (המשימה
          הפנימית והגורם החיצוני לא נושאים אותם). «הצגה» פותחת את המדריך בקריאה בלבד. */}
      {owner === 'client' && (
        <TemplateCarryNote content={editContent} lead={edit ? 'מצורף ללקוח:' : 'מצורף ללקוח מהספרייה:'} />
      )}

      {/* ── לקוח: מה אני מצפה לקבל ── */}
      {owner === 'client' && (
        <div style={{ display: 'grid', gap: '.35rem' }}>
          <span style={{ fontSize: 'var(--fs-13)', fontWeight: 600, color: 'var(--ink-2)' }}>
            מה אני מצפה לקבל מהלקוח?
          </span>
          {subjectRole === 'spouse' && (
            <span style={{ fontSize: 'var(--fs-12)', color: 'var(--ink-3)', lineHeight: 1.6 }}>
              «{REQUIREMENT_KIND_LABELS.confirm}» לא מוצע כאן: זה אישור אישי של {subjectWho}, ואי אפשר לתת אותו בדף של בעל הכרטיס.
            </span>
          )}
          {rows.map((r, i) => (
            <div key={r.key} style={{ display: 'flex', gap: '.35rem', alignItems: 'center', flexWrap: 'wrap' }}>
              <span style={{ display: 'inline-flex', gap: 1 }}>
                <button type="button" className="btn btn-sm btn-ghost" aria-label="הזז למעלה"
                  style={{ padding: '0 .25rem' }} onClick={() => moveRow(i, -1)}>↑</button>
                <button type="button" className="btn btn-sm btn-ghost" aria-label="הזז למטה"
                  style={{ padding: '0 .25rem' }} onClick={() => moveRow(i, 1)}>↓</button>
              </span>
              <input
                style={{ ...field, flex: 1, minWidth: 140 }}
                placeholder="למשל: דוח שנתי אחרון"
                value={r.label}
                disabled={busy}
                onChange={e => setRow(i, { label: e.target.value })}
                onKeyDown={e => { if (e.key === 'Enter') void save(); }}
              />
              <select
                style={field}
                value={r.kind}
                disabled={busy}
                aria-label="סוג הפריט"
                onChange={e => setRow(i, { kind: e.target.value as CustomRequirementKind })}
              >
                {requirementKindsFor(subjectRole, r.kind).map(k => <option key={k} value={k}>{REQUIREMENT_KIND_LABELS[k]}</option>)}
              </select>
              <button
                type="button"
                onClick={() => setRow(i, { required: !r.required })}
                aria-pressed={r.required}
                title={r.required ? 'חובה - חוסם את השלמת הבקשה' : 'רשות - לא חוסם'}
                style={{
                  font: 'inherit', fontSize: 'var(--fs-12)', fontWeight: 600, cursor: 'pointer',
                  padding: '.2rem .55rem', borderRadius: 999, minHeight: 32,
                  border: `1px solid ${r.required ? 'var(--accent)' : 'var(--bd)'}`,
                  color: r.required ? 'var(--accent)' : 'var(--ink-3)', background: 'transparent',
                }}
              >{r.required ? 'חובה' : 'רשות'}</button>
              <button type="button" className="btn btn-sm btn-ghost" aria-label="הסרת פריט"
                onClick={() => setRows(rs => rs.filter((_, j) => j !== i))}>✕</button>
              {r.kind === 'select' && (
                <input
                  style={{ ...field, width: '100%' }}
                  placeholder="אפשרויות, מופרדות בפסיק: עוסק מורשה, עוסק פטור"
                  value={r.optionsText}
                  disabled={busy}
                  onChange={e => setRow(i, { optionsText: e.target.value })}
                />
              )}
              {r.kind === 'files' && (
                <input
                  style={{ ...field, width: 110 }}
                  placeholder="עד כמה?"
                  inputMode="numeric"
                  value={r.maxFiles}
                  disabled={busy}
                  onChange={e => setRow(i, { maxFiles: e.target.value.replace(/\D/g, '') })}
                />
              )}
            </div>
          ))}
          <button type="button" className="btn btn-sm btn-ghost" style={{ justifySelf: 'start' }}
            onClick={() => setRows(rs => [...rs, emptyRow()])}>+ עוד פריט</button>
        </div>
      )}

      {/* ── אני: מינימלי בכוונה ── */}
      {owner === 'me' && (
        <label style={{ display: 'flex', gap: '.4rem', alignItems: 'center', fontSize: 'var(--fs-13)', color: 'var(--ink-2)' }}>
          תאריך יעד (רשות):
          <input type="date" style={field} value={dueDate} disabled={busy}
            onChange={e => setDueDate(e.target.value)} />
        </label>
      )}

      {/* ── גורם חיצוני ── */}
      {owner === 'external' && (
        <div style={{ display: 'grid', gap: '.4rem' }}>
          <span role="group" aria-label="מי הגורם" style={{ display: 'inline-flex', gap: '.3rem' }}>
            <button type="button" style={pill(extKind === 'prev_accountant')}
              aria-pressed={extKind === 'prev_accountant'}
              onClick={() => setExtKind('prev_accountant')}>רו״ח קודם</button>
            <button type="button" style={pill(extKind === 'other')}
              aria-pressed={extKind === 'other'}
              onClick={() => setExtKind('other')}>גורם אחר</button>
          </span>
          {extKind === 'prev_accountant' ? (
            <div style={{ fontSize: 'var(--fs-13)', color: 'var(--ink-2)' }}>
              פרטי קשר: מתוך «פרטי רו״ח קודם» בכרטיס -
              {prevEmail
                ? <span dir="ltr" style={{ marginInlineStart: 4 }}>{prevEmail}</span>
                : <span style={{ color: 'var(--warn)' }}> טרם התקבלו</span>}
              {!prevEmail && (
                /* ‼ דרישת-מערכת, לא תלות: אי אפשר להסיר אותה. הפעולה כלפי
                   הגורם תמתין לפרטים גם בלי שום צ'יפ תלות (Correction 1). */
                <div style={{ fontSize: 'var(--fs-12)', color: 'var(--ink-3)', marginTop: 2 }}>
                  המשימה תמתין לפרטי הקשר - הם יגיעו מהבקשה «פרטי רו״ח קודם» או מהכרטיס.
                </div>
              )}
            </div>
          ) : (
            <div style={{ display: 'flex', gap: '.35rem', flexWrap: 'wrap' }}>
              <input style={{ ...field, flex: 1, minWidth: 120 }} placeholder="שם הגורם" value={extContact.name}
                disabled={busy} onChange={e => setExtContact(c => ({ ...c, name: e.target.value }))} />
              <EmailInput style={{ ...field, flex: 1, minWidth: 150 }} placeholder="אימייל"
                value={extContact.email} disabled={busy}
                onChange={e => setExtContact(c => ({ ...c, email: e.target.value }))} />
              <input style={{ ...field, width: 130, direction: 'ltr', textAlign: 'right' }} placeholder="טלפון" type="tel"
                value={extContact.phone} disabled={busy}
                onChange={e => setExtContact(c => ({ ...c, phone: e.target.value }))} />
            </div>
          )}
          {contactGap && extKind === 'other' && (
            <span style={{ fontSize: 'var(--fs-12)', color: 'var(--warn)' }}>
              {contactGap} - המשימה תמתין עד שיהיה למי לפנות.
            </span>
          )}

          {/* ── נוסח המייל ────────────────────────────────────────────────
              ריק = הנוסח הרגיל של המשרד. מה שנכתב כאן נטען לטיוטה בשליחה,
              ושם עוד אפשר לשנות — שום מייל לא יוצא בלי אישור. */}
          <label style={{ display: 'grid', gap: '.2rem', fontSize: 'var(--fs-13)', color: 'var(--ink-2)' }}>
            נושא המייל (רשות)
            <input style={field} value={emailSubject} disabled={busy}
              placeholder="ריק = הנוסח הרגיל של המשרד"
              onChange={e => setEmailSubject(e.target.value)} />
          </label>
          <label style={{ display: 'grid', gap: '.2rem', fontSize: 'var(--fs-13)', color: 'var(--ink-2)' }}>
            גוף המייל (רשות)
            <textarea
              style={{ ...field, minHeight: 92, resize: 'vertical', lineHeight: 1.6 }}
              value={emailBody}
              disabled={busy}
              placeholder="ריק = הנוסח הרגיל. אפשר להשתמש ב-{{clientName}} ו-{{firmName}}."
              onChange={e => setEmailBody(e.target.value)}
            />
          </label>
          <label style={{ display: 'grid', gap: '.2rem', fontSize: 'var(--fs-13)', color: 'var(--ink-2)' }}>
            תיאור פנימי (רק בשבילך - לא נשלח)
            <input style={field} value={internalNote} disabled={busy}
              placeholder="למשל: לוודא שמגיעות גם הכרטסות של 2024"
              onChange={e => setInternalNote(e.target.value)} />
          </label>
          {/* ‼ מה שאב-הטיפוס הראה ואין לו כיסוי בשרת — נאמר במפורש ולא
              מוצג ככפתור מת: אין היום צירוף קבצים בשום מייל יוצא במערכת. */}
          <span style={{ fontSize: 'var(--fs-12)', color: 'var(--ink-4)', lineHeight: 1.6 }}>
            צירוף קבצים למייל אינו נתמך עדיין - אפשר לכתוב בגוף המייל שהמסמכים יישלחו בנפרד.
          </span>
        </div>
      )}

      {/* ── עוד הגדרות — חשיפה הדרגתית ── */}
      <button type="button" onClick={() => setShowAdvanced(v => !v)}
        aria-expanded={showAdvanced}
        style={{
          justifySelf: 'start', background: 'none', border: 'none', padding: 0, cursor: 'pointer',
          font: 'inherit', fontSize: 'var(--fs-13)', color: 'var(--accent)', minHeight: 32,
        }}>
        {showAdvanced ? 'עוד הגדרות ▴' : 'עוד הגדרות ▾'}
      </button>

      {showAdvanced && (
        <div style={{ display: 'grid', gap: '.5rem', paddingInlineStart: '.2rem' }}>
          {/* ── התנאי ────────────────────────────────────────────────────
              ‼ שני מושגים, מנוע אחד. לבקשת לקוח התנאי הוא **מתי היא נפתחת**:
              היא כבר בדף האישי, מוצגת כשלב נעול, ונפתחת מעצמה כשהתנאי מתקיים —
              בלי שנשלח שום דבר. לבקשה לגורם חיצוני אותו תנאי הוא **מתי מותר
              לשלוח**, כי שם יש שליחה עצמאית לאדם אחר.
              המשמעות שונה, המנגנון זהה: קשת תלות אחת, נעילה אחת בשרת. מנוע
              שני היה שני מקומות שאפשר לשכוח לעדכן. */}
          <div style={{ display: 'grid', gap: '.25rem' }}>
            <span style={{ fontSize: 'var(--fs-13)', fontWeight: 600, color: 'var(--ink-2)' }}>
              {owner === 'external' ? 'מתי שולחים - רק אחרי…' : 'מתי זה נפתח ללקוח - רק אחרי…'}
            </span>
            <span style={{ fontSize: 'var(--fs-12)', color: 'var(--ink-3)', lineHeight: 1.6 }}>
              {deps.length === 0
                ? (owner === 'external' ? 'בלי תנאי - אפשר לשלוח מיד.' : 'בלי תנאי - זמין ללקוח מרגע הפרסום.')
                : (owner === 'external'
                    ? 'עד שהתנאי יתקיים הבקשה נעולה ואי אפשר לשלוח אותה.'
                    : 'הלקוח יראה את הבקשה כשלב נעול עם ההסבר מה פותח אותה, והיא תיפתח מעצמה.')}
            </span>
            <div style={{ display: 'flex', gap: '.3rem', flexWrap: 'wrap', alignItems: 'center' }}>
              {deps.map(id => {
                const s = depCandidates.find(x => x.id === id) ?? existingSteps.find(x => x.id === id);
                return (
                  <span key={id} style={{
                    display: 'inline-flex', alignItems: 'center', gap: '.25rem',
                    fontSize: 'var(--fs-12)', padding: '.15rem .5rem', borderRadius: 999,
                    border: '1px solid var(--bd)', background: 'var(--card, #fff)',
                  }}>
                    {s ? depLabel(s) : id}
                    <button type="button" aria-label="הסרת תלות" onClick={() => setDeps(d => d.filter(x => x !== id))}
                      style={{ border: 'none', background: 'none', cursor: 'pointer', color: 'var(--ink-3)', padding: 0 }}>✕</button>
                  </span>
                );
              })}
              <button type="button" className="btn btn-sm btn-ghost" onClick={() => setDepsOpen(v => !v)}>
                {depsOpen ? 'סגור' : '+ תלות'}
              </button>
            </div>
            {depsOpen && (
              <div style={{
                display: 'grid', gap: '.15rem', maxHeight: 180, overflowY: 'auto',
                border: '1px solid var(--bd)', borderRadius: 'var(--radius)', padding: '.4rem .5rem',
                background: 'var(--card, #fff)',
              }}>
                {depCandidates.length === 0 && (
                  <span style={{ fontSize: 'var(--fs-12)', color: 'var(--ink-3)' }}>אין בקשות פתוחות אחרות.</span>
                )}
                {depCandidates.map(s => (
                  <label key={s.id} style={{ display: 'flex', gap: '.4rem', alignItems: 'center', fontSize: 'var(--fs-13)' }}>
                    <input type="checkbox" checked={deps.includes(s.id)}
                      onChange={e => setDeps(d => e.target.checked ? [...d, s.id] : d.filter(x => x !== s.id))} />
                    <span>{depLabel(s)}</span>
                  </label>
                ))}
              </div>
            )}
          </div>

          {owner !== 'me' && (
            <label style={{ display: 'flex', gap: '.4rem', alignItems: 'center', fontSize: 'var(--fs-13)', color: 'var(--ink-2)' }}>
              תאריך יעד:
              <input type="date" style={field} value={dueDate} disabled={busy}
                onChange={e => setDueDate(e.target.value)} />
            </label>
          )}

          {!edit && requiredApplies && (
            <label style={{ display: 'flex', gap: '.4rem', alignItems: 'center', fontSize: 'var(--fs-13)', color: 'var(--ink-2)' }}>
              <input type="checkbox" checked={requiredForClose}
                onChange={e => setRequiredForClose(e.target.checked)} />
              חייבת להסתיים לפני סגירת הקליטה
            </label>
          )}

          {/* ── ביצוע: ידני (ברירת מחדל) / אוטומטי (D3) ──
              ‼ לגורם חיצוני בלבד. בקשה ללקוח אינה נשלחת כמייל משלה — היא
              שורה בדף האישי, ומה שיוצא ללקוח הוא עדכון הדף. "אוטומטי" על
              בקשת לקוח היה מייל פר-בקשה בדלת האחורית. */}
          {owner === 'external' && (
            <div style={{ display: 'grid', gap: '.25rem' }}>
              <span style={{ fontSize: 'var(--fs-13)', fontWeight: 600, color: 'var(--ink-2)' }}>ביצוע</span>
              <span role="group" aria-label="ביצוע" style={{ display: 'inline-flex', gap: '.3rem' }}>
                <button type="button" style={pill(!auto)} aria-pressed={!auto}
                  onClick={() => setAuto(false)}>ידני</button>
                <button type="button" style={pill(auto)} aria-pressed={auto}
                  onClick={() => setAuto(true)}>אוטומטי ⚡</button>
              </span>
              <span style={{ fontSize: 'var(--fs-12)', color: 'var(--ink-3)', lineHeight: 1.5 }}>
                {auto
                  ? <>כשכל התנאים יתמלאו - יישלח אוטומטית מייל על הבקשה
                      {owner === 'external'
                        ? (extKind === 'prev_accountant' ? ' לרו״ח הקודם' : ` ל${extContact.name.trim() || 'גורם'}`)
                        : ' ללקוח'}.
                      {' '}נחמש רק אחרי «פרסם בדף» - טיוטה לא שולחת.</>
                  : 'כשהתנאים יתמלאו הבקשה תסומן כמוכנה, והשליחה תישאר בידיים שלך.'}
              </span>
            </div>
          )}

          {owner === 'client' && (
            <div style={{ display: 'grid', gap: '.3rem' }}>
              <span style={{ fontSize: 'var(--fs-13)', fontWeight: 600, color: 'var(--ink-2)' }}>ניסוח ללקוח (רשות)</span>
              <input style={field} placeholder="משפט הסבר קצר מתחת לכותרת" value={clientSub}
                disabled={busy} onChange={e => setClientSub(e.target.value)} />
              <input style={{ ...field, maxWidth: 220 }} placeholder="טקסט הכפתור (למשל: מאשר/ת)" value={clientCta}
                disabled={busy} onChange={e => setClientCta(e.target.value)} />
            </div>
          )}
        </div>
      )}

      {error && (
        <div role="alert" style={{ fontSize: 'var(--fs-13)', color: 'var(--err)' }}>⚠ {error}</div>
      )}

      {/* ── שינית את התוכן שהתבנית נתנה ────────────────────────────────────
          ‼ מופיע רק כשבאמת שינית, ורק כשנפתחת מתבנית. מי שלא נגע לא רואה
          כאן כלום, והשמירה הרגילה אינה עוברת דרך שום החלטה. */}
      {templateChanged && sourceTemplate && (
        <div style={{
          display: 'grid', gap: '.3rem', padding: '.5rem .6rem',
          border: '1px solid var(--hairline-2)', borderRadius: 'var(--radius)',
        }}>
          <span style={{ fontSize: 'var(--fs-12)', color: 'var(--ink-3)' }}>
            שינית את התוכן של «{sourceTemplate.name}»
          </span>
          {([
            ['none', 'רק ללקוח הזה'],
            ['update', sourceTemplate.isSeed ? 'לשמור כתבנית של המשרד' : 'לעדכן גם את התבנית'],
            ['new', 'לשמור כתבנית חדשה'],
          ] as const).map(([val, label]) => (
            <label key={val} style={{ display: 'flex', gap: '.4rem', alignItems: 'center', fontSize: 'var(--fs-13)' }}>
              <input type="radio" name="tpl-action" checked={tplAction === val} disabled={busy}
                onChange={() => setTplAction(val)} />
              {label}
              {val === 'none' && (
                <span style={{ color: 'var(--ink-4)', fontSize: 'var(--fs-12)' }}>(התבנית לא תשתנה)</span>
              )}
            </label>
          ))}
          {tplAction === 'new' && (
            <input style={{ ...field, maxWidth: 260 }} placeholder="שם התבנית החדשה" value={tplNewName}
              disabled={busy} onChange={e => setTplNewName(e.target.value)} />
          )}
        </div>
      )}

      <div style={{ display: 'flex', gap: '.4rem', alignItems: 'center', flexWrap: 'wrap' }}>
        <button type="button" className="btn btn-sm btn-primary" disabled={busy} onClick={() => void save()}>
          {busy ? 'שומר…' : edit ? 'שמירה' : owner === 'me' ? 'הוסף משימה' : 'שמור כטיוטה'}
        </button>
        <button type="button" className="btn btn-sm btn-ghost" disabled={busy} onClick={onCancel}>ביטול</button>
        {owner === 'client' && name.trim() && (
          <PreviewButton name={name.trim()} onClick={openPreview} />
        )}
        {!edit && (
          <span style={{ fontSize: 'var(--fs-12)', color: 'var(--ink-3)' }}>
            {owner === 'me' ? 'משימה פנימית - לא מופיעה בדף של הלקוח' : 'הלקוח לא יראה עד «פרסם בדף»'}
          </span>
        )}
      </div>

      {/* ‼ display:contents + עצירת הבועה: המגירה היא פורטל, אבל אירועי React עולים דרך העץ — בלי זה לחיצה בתוכה
          הגיעה להורים של הקומפוזר (כרטיס שנפתח/נסגר). */}
      {preview && firm && (
        <div style={{ display: 'contents' }} onClick={e => e.stopPropagation()}>
          <RequestPreviewSheet target={preview} profile={firm} badge="טיוטה — לא נשמר"
            onClose={() => setPreview(null)} />
        </div>
      )}
    </div>
  );
}

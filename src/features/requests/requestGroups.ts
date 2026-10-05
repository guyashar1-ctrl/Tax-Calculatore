// ─── קבוצות קבועות של בקשות (הדמיה מאושרת, 05.10.2026) ─────────────────────
// ‼ קבוצה היא בית תצוגה קבוע לבקשה מורכבת — לא בקשה היסטורית שאפשר לפתוח מחדש.
// כל בקשה בה נשארת שורה עצמאית עם מחזור משלה; הקבוצה רק מחזיקה אותן יחד, בסדר
// קבוע, גם כשהאחראי או המצב משתנים — כולל מה שהושלם ומה שעוד נעול.
// ‼ הזהות לפי סוג הבקשה (step_type) ובדף האישי לפי מפתח הפריט שהשרת בונה — לעולם
// לא לפי כותרת מתורגמת.
// מקור אחד לשלושה משטחים: ספריית המשרד, «בקשות» בתיק הלקוח, והדף האישי.

import type { OnboardingStep, OnboardingStepType } from '../../types/onboarding';
import { isStepOpen } from '../../types/onboarding';

export type RequestGroupKey = 'paperless' | 'prevAccountant' | 'representation';

/** מי עושה — לתג בספרייה ובשורה. */
export type GroupActor = 'client' | 'office' | 'both' | 'clientThenOffice' | 'external';

export const GROUP_ACTOR_LABEL: Record<GroupActor, string> = {
  client: 'הלקוח',
  office: 'המשרד',
  both: 'המשרד והלקוח',
  clientThenOffice: 'הלקוח ← המשרד',
  external: 'רו״ח קודם',
};

export interface GroupMemberDef {
  stepType: OnboardingStepType;
  /** השם בתוך הקבוצה — קצר, בלי שם הקבוצה. */
  title: string;
  /** מה זה, בשורה אחת (ספרייה). */
  hint: string;
  actor: GroupActor;
  /** מתי מופיעה — כשהיא לא בכל קבוצה (ספרייה, «מתי נפתחת»). */
  when?: string;
}

export interface RequestGroupDef {
  key: RequestGroupKey;
  title: string;
  /** שורת המשנה בספרייה. */
  summary: string;
  /** בדף האישי — מה הקבוצה עושה, בשפת הלקוח. */
  clientSummary: string;
  members: GroupMemberDef[];
  /** הערה בתחתית הקבוצה בספרייה. */
  note?: string;
}

export const REQUEST_GROUPS: Record<RequestGroupKey, RequestGroupDef> = {
  paperless: {
    key: 'paperless',
    title: 'פייפרלס',
    summary: 'הרשמה · פרטי העסק · הקמה · תשלום',
    clientSummary: 'הקמת העסק והסדרת התשלום',
    members: [
      { stepType: 'paperless_invite', title: 'הרשמה לפייפרלס', hint: 'פתיחת חשבון או חיבור חשבון קיים', actor: 'client' },
      { stepType: 'business_details', title: 'פרטי העסק', hint: 'שם העסק · עבודה מהבית', actor: 'clientThenOffice' },
      { stepType: 'paperless_connection', title: 'הקמת העסק בפייפרלס', hint: 'בדיקת הגדרות העסק והשלמת החיבור', actor: 'office' },
      { stepType: 'retainer_authorization', title: 'הסדרת התשלום', hint: 'הגדרת הריטיינר והרשאת התשלום', actor: 'both',
        when: 'כשיש תשלום חודשי דרך פייפרלס' },
      { stepType: 'paperless_tax_authority', title: 'חיבור לרשות המסים', hint: 'מספרי הקצאה לחשבוניות', actor: 'client',
        when: 'לעוסק מורשה ולחברה בלבד' },
    ],
    note: 'חיבור לרשות המסים מופיע כשנדרש לפי סוג העסק.',
  },
  prevAccountant: {
    key: 'prevAccountant',
    title: 'העברת טיפול מרו״ח קודם',
    summary: 'פרטי רו״ח · מכתב העברה · קבלת חומרים',
    clientSummary: 'העברת התיק מרואה החשבון הקודם',
    members: [
      { stepType: 'prev_accountant_details', title: 'פרטי רו״ח קודם', hint: 'שם, מייל וטלפון', actor: 'client' },
      { stepType: 'release_letter', title: 'מכתב העברת טיפול', hint: 'נשלח לרו״ח הקודם במייל', actor: 'office' },
      { stepType: 'materials_received', title: 'קבלת החומרים', hint: 'מה שרו״ח הקודם מעביר אלינו', actor: 'external' },
    ],
  },
  representation: {
    key: 'representation',
    title: 'ייצוג מול הרשויות',
    summary: 'רשויות ואנשים לפי היקף הייצוג',
    clientSummary: 'ייפוי כוח מול הרשויות',
    members: [
      { stepType: 'representation', title: 'בקשת ייצוג', hint: 'טופס, חתימה והגשה לרשויות', actor: 'both' },
      { stepType: 'authority_representation', title: 'ייצוג ברשות', hint: 'לכל רשות ואדם בנפרד', actor: 'office' },
      { stepType: 'rep_client_approval', title: 'אישור הייצוג באזור האישי', hint: 'זירוז, או חובה כשרשות המסים ממתינה', actor: 'client' },
      { stepType: 'representation_upgrade', title: 'שדרוג לייצוג ראשי', hint: 'כשהמשרד רשום כמייצג משני', actor: 'office' },
      { stepType: 'file_opening', title: 'פתיחת תיקים ברשויות', hint: 'לעסק חדש', actor: 'office' },
    ],
  },
};

export const GROUP_ORDER: RequestGroupKey[] = ['paperless', 'prevAccountant', 'representation'];

const MEMBER_RANK = new Map<string, number>();
for (const g of GROUP_ORDER) REQUEST_GROUPS[g].members.forEach((m, i) => MEMBER_RANK.set(`${g}:${m.stepType}`, i));

export function memberDef(group: RequestGroupKey, stepType: OnboardingStepType): GroupMemberDef | undefined {
  return REQUEST_GROUPS[group].members.find(m => m.stepType === stepType);
}

/** סוגי הבקשות שקבוצת פייפרלס «מחזיקה» תמיד (ההרשאה — רק כשהיא דרך פייפרלס). */
const PAPERLESS_CORE: OnboardingStepType[] = ['paperless_invite', 'paperless_connection', 'business_details', 'paperless_tax_authority'];
const PREV_TYPES: OnboardingStepType[] = ['prev_accountant_details', 'release_letter', 'materials_received'];

/** קבוצת המשרד של בקשה — פייפרלס והעברת טיפול. (הייצוג נשאר ברינדור הקיים שלו בתיק.) */
export function officeGroupOf(step: Pick<OnboardingStep, 'stepType' | 'payload'>, hasPaperless: boolean): RequestGroupKey | null {
  if (step.payload && (step.payload as Record<string, unknown>).creationProblem) return null;
  if (PAPERLESS_CORE.includes(step.stepType)) return 'paperless';
  // ‼ ההרשאה לתשלום חודשי שייכת לפייפרלס רק כשהיא נוצרת בתוכו (ריטיינר בכרטיס). הסדר ידני /
  // לקוח בלי פייפרלס — בקשה בודדת.
  if (step.stepType === 'retainer_authorization' && hasPaperless
      && (step.payload as Record<string, unknown> | undefined)?.method !== 'manual_arrangement') return 'paperless';
  if (PREV_TYPES.includes(step.stepType)) return 'prevAccountant';
  return null;
}

export interface StepGroup {
  key: RequestGroupKey;
  title: string;
  /** כל הבקשות בקבוצה (גם שהושלמו ונעולות), בסדר קבוע. בלי מבוטלות. */
  steps: OnboardingStep[];
}

const isCancelled = (s: Pick<OnboardingStep, 'status'>) => s.status === 'cancelled';

/**
 * מקבצת את בקשות הלקוח לקבוצות קבועות. ‼ על כל הבקשות — פתוחות, נעולות ושהושלמו —
 * ולא רק על הפתוחות: בקשה שהושלמה נשארת בקבוצה שלה, ולא «עוברת» להיסטוריה כללית.
 * ‼ סדר יציב: סדר ההגדרה, ואחריו מועד היצירה (מחזור חדש של אותו סוג — שורה חדשה אחרי הקודמת).
 */
export function buildStepGroups(steps: OnboardingStep[]): { groups: StepGroup[]; grouped: Set<string> } {
  const live = steps.filter(s => !isCancelled(s));
  const hasPaperless = live.some(s => s.stepType === 'paperless_invite' || s.stepType === 'paperless_connection');
  const byGroup = new Map<RequestGroupKey, OnboardingStep[]>();
  for (const s of live) {
    const g = officeGroupOf(s, hasPaperless);
    if (!g) continue;
    const list = byGroup.get(g) ?? [];
    list.push(s);
    byGroup.set(g, list);
  }
  const grouped = new Set<string>();
  const groups: StepGroup[] = [];
  for (const key of GROUP_ORDER) {
    const list = byGroup.get(key);
    if (!list?.length) continue;
    list.sort((a, b) => (MEMBER_RANK.get(`${key}:${a.stepType}`) ?? 99) - (MEMBER_RANK.get(`${key}:${b.stepType}`) ?? 99)
      || String(a.createdAt ?? '').localeCompare(String(b.createdAt ?? '')));
    list.forEach(s => grouped.add(s.id));
    groups.push({ key, title: REQUEST_GROUPS[key].title, steps: list });
  }
  return { groups, grouped };
}

// ─── התקדמות ומצב הקבוצה ───────────────────────────────────────────────────

/** דילוג שהוא «כבר בוצע» (חשבון קיים, הועבר) — נספר כהושלם, לא כ«אין צורך». */
const SATISFIED_SKIPS = new Set(['already_connected', 'transferred_rep']);

export type ChildPhase = 'done' | 'notNeeded' | 'open' | 'locked';

export function childPhase(s: Pick<OnboardingStep, 'status' | 'payload'>): ChildPhase {
  if (s.status === 'completed' || s.status === 'verified') return 'done';
  if (s.status === 'skipped') {
    const reason = String((s.payload as Record<string, unknown> | undefined)?.skipReason ?? '');
    return SATISFIED_SKIPS.has(reason) ? 'done' : 'notNeeded';
  }
  if (s.status === 'locked') return 'locked';
  return 'open';
}

export interface GroupProgress {
  /** בקשות שחלות (בלי «אין צורך»). */
  applicable: number;
  done: number;
  allDone: boolean;
}

/** ‼ הספירה כוללת רק עבודה שחלה: «אין צורך» יורד גם מהמונה וגם מהמכנה. */
export function groupProgress(steps: Pick<OnboardingStep, 'status' | 'payload'>[]): GroupProgress {
  const phases = steps.map(childPhase).filter(p => p !== 'notNeeded');
  const done = phases.filter(p => p === 'done').length;
  return { applicable: phases.length, done, allDone: phases.length > 0 && done === phases.length };
}

export type ChildActor = 'me' | 'client' | 'external' | 'authority' | 'locked' | 'done';

export interface GroupChildView {
  id: string;
  title: string;
  actor: ChildActor;
  /** אצל מי ממתינים — שם פרטי / «רו״ח קודם» וכו'. */
  who?: string;
}

export interface GroupStatus {
  tag: string;
  /** מה קורה עכשיו — משפט אחד, כולל עבודה במקביל. */
  hint: string;
  tone: 'mine' | 'waiting' | 'locked' | 'done';
  /** לסידור הרשימה: 0 דורש אותך, 1 אצל אחרים, 2 בהמשך, 3 הושלם. */
  rank: number;
}

/**
 * מצב הקבוצה — נגזר מהבקשות שבה. ‼ אין «ממתין ללקוח» כללי כשיש למשרד מה לעשות:
 * עבודה במקביל נאמרת במפורש («לטיפולך: … · ממתין לאילן: …»).
 */
export function groupStatus(children: GroupChildView[], progress: GroupProgress): GroupStatus {
  const tag = progress.allDone ? 'הושלם'
    : progress.applicable > 0 ? `${progress.done} מתוך ${progress.applicable} הושלמו` : 'אין צורך';
  if (progress.allDone || progress.applicable === 0) {
    return { tag, hint: progress.applicable === 0 ? 'אף בקשה בקבוצה לא נדרשת' : 'כל הבקשות בקבוצה הושלמו', tone: 'done', rank: 3 };
  }
  const mine = children.filter(c => c.actor === 'me');
  const waiting = children.filter(c => c.actor === 'client' || c.actor === 'external' || c.actor === 'authority');
  const locked = children.filter(c => c.actor === 'locked');
  const more = (n: number) => (n > 1 ? ` ועוד ${n - 1}` : '');
  const waitPart = waiting.length
    ? `ממתין ל${waiting[0].who ?? 'לקוח'}: ${waiting[0].title}${more(waiting.length)}` : '';
  if (mine.length) {
    const minePart = `לטיפולך: ${mine[0].title}${more(mine.length)}`;
    return { tag, hint: waitPart ? `${minePart} · ${waitPart}` : minePart, tone: 'mine', rank: 0 };
  }
  if (waiting.length) {
    return { tag, hint: `השלב הבא: ${waiting[0].title} · אצל ${waiting[0].who ?? 'הלקוח'}${more(waiting.length)}`, tone: 'waiting', rank: 1 };
  }
  if (locked.length) return { tag, hint: `בהמשך: ${locked[0].title}`, tone: 'locked', rank: 2 };
  return { tag, hint: '', tone: 'waiting', rank: 1 };
}

// ─── הדף האישי ─────────────────────────────────────────────────────────────

/** מפתחות הפריטים שהשרת בונה (build_client_portal) — לפי קבוצה. */
const PORTAL_PAPERLESS_KEYS = new Set([
  'paperless_signup', 'business_details', 'paperless', 'paperless_connect', 'paperless_transfer', 'paperless_tax',
]);
const PORTAL_RETAINER_KEYS = new Set(['retainer', 'retainer_charge', 'retainer_card', 'retainer_future', 'retainer_info']);
const PORTAL_PREV_KEYS = new Set(['prev_accountant', 'prev_details']);
const PORTAL_REP_KEYS = new Set(['rep_fill', 'rep_sign', 'rep_sign_spouse', 'rep_office', 'rep_authorities', 'rep_done',
  'rep_approval', 'files', 'files_office']);

/** סדר הילדים בקבוצה בדף האישי — אותו סדר כמו בתיק. */
const PORTAL_CHILD_RANK: Record<string, number> = {
  paperless_signup: 0, business_details: 1, paperless_connect: 2, paperless_transfer: 2, paperless: 2,
  retainer_info: 3, retainer_future: 3, retainer_card: 3, retainer_charge: 3, retainer: 3, paperless_tax: 4,
  prev_details: 0, prev_accountant: 1,
  rep_fill: 0, rep_sign: 1, rep_sign_spouse: 2, rep_office: 3, rep_authorities: 4, rep_done: 5, rep_approval: 6,
  files: 7, files_office: 7,
};

/** שם הילד בקבוצה בדף — לפי המפתח (לא לפי כותרת). מפתח לא מוכר ⇒ הכותרת מהשרת. */
const PORTAL_CHILD_TITLE: Record<string, string> = {
  paperless_signup: 'הרשמה לפייפרלס', business_details: 'פרטי העסק',
  paperless_connect: 'הקמת העסק', paperless: 'הקמת העסק', paperless_transfer: 'העברת החשבון אלינו',
  retainer_info: 'הרשאת תשלום', retainer_future: 'הרשאת תשלום', retainer_card: 'הזנת כרטיס אשראי בפייפרלס',
  retainer_charge: 'החיוב החודשי', retainer: 'החיוב החודשי', paperless_tax: 'חיבור לרשות המסים',
  // ‼ בקבוצת «ייצוג מול הרשויות» — הבקשה עצמה בשמה, לא בשם הקבוצה (כמו בתיק).
  rep_done: 'בקשת ייצוג', rep_office: 'בקשת ייצוג', rep_authorities: 'בקשת ייצוג',
};

export interface PortalItemLike { key: string; kind?: string; label?: string; bucket?: string }

/**
 * הקבוצה של פריט בדף האישי. ‼ ההרשאה לתשלום — בקבוצת פייפרלס רק כשיש בדף גם פריט פייפרלס.
 * צילום התעודה לרשות המסים (identity_confirm) וייצוג לרשות×אדם (authrep_…) — בקבוצת הייצוג.
 */
export function portalItemGroup(item: PortalItemLike, hasPaperless: boolean): RequestGroupKey | null {
  if (PORTAL_PAPERLESS_KEYS.has(item.key)) return 'paperless';
  if (PORTAL_RETAINER_KEYS.has(item.key)) return hasPaperless ? 'paperless' : null;
  if (PORTAL_PREV_KEYS.has(item.key)) return 'prevAccountant';
  if (PORTAL_REP_KEYS.has(item.key) || item.key.startsWith('authrep_') || item.kind === 'identity_confirm') return 'representation';
  return null;
}

export function portalChildTitle(item: PortalItemLike): string {
  return PORTAL_CHILD_TITLE[item.key] ?? item.label ?? '';
}

export interface PortalGroup<T extends PortalItemLike> {
  key: RequestGroupKey;
  title: string;
  summary: string;
  items: T[];
}

/**
 * מקבצת את פריטי הדף לקבוצות. פריט בודד — נשאר כמו שהוא. קבוצה של פריט אחד בלבד
 * אינה קבוצה (אין מה להחזיק יחד) — הפריט נשאר בודד, בדיוק כמו קודם.
 */
export function groupPortalItems<T extends PortalItemLike>(items: T[]): { groups: PortalGroup<T>[]; singles: T[] } {
  const hasPaperless = items.some(i => PORTAL_PAPERLESS_KEYS.has(i.key));
  const by = new Map<RequestGroupKey, T[]>();
  const singles: T[] = [];
  for (const it of items) {
    const g = portalItemGroup(it, hasPaperless);
    if (!g) { singles.push(it); continue; }
    const list = by.get(g) ?? [];
    list.push(it);
    by.set(g, list);
  }
  const groups: PortalGroup<T>[] = [];
  for (const key of GROUP_ORDER) {
    const list = by.get(key);
    if (!list) continue;
    if (list.length < 2) { singles.push(...list); continue; }
    list.sort((a, b) => (PORTAL_CHILD_RANK[a.key] ?? 50) - (PORTAL_CHILD_RANK[b.key] ?? 50));
    groups.push({ key, title: REQUEST_GROUPS[key].title, summary: REQUEST_GROUPS[key].clientSummary, items: list });
  }
  return { groups, singles };
}

export interface PortalGroupStatus { tag: string; tone: 'action' | 'office' | 'future' | 'done'; rank: number }

/** מצב קבוצה בדף האישי — מה שהלקוח צריך לדעת: יש משהו בשבילו, או שזה אצלנו. */
export function portalGroupStatus(items: PortalItemLike[]): PortalGroupStatus {
  if (items.some(i => i.bucket === 'action')) return { tag: 'נדרש ממך', tone: 'action', rank: 0 };
  if (items.some(i => i.bucket === 'office')) return { tag: 'בטיפול המשרד', tone: 'office', rank: 1 };
  if (items.some(i => i.bucket === 'future')) return { tag: 'בהמשך', tone: 'future', rank: 2 };
  return { tag: 'הושלם', tone: 'done', rank: 3 };
}

/** האם יש לקבוצה עבודה פתוחה (לברירת המחדל פתוח/מקופל). */
export const groupHasOpenWork = (steps: Pick<OnboardingStep, 'status'>[]): boolean =>
  steps.some(s => isStepOpen(s.status));

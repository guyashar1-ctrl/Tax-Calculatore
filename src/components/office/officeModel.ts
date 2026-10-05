// ─── «המשרד» · מבנה העמודים, מצב הטיוטה וניקוי קבצים ─────────────────────────
// לוגיקה טהורה בלבד (בלי React), כדי שתיבדק ב-node: אילו עמודים יש, איזה חלק
// שינית, ואילו קבצים מותר למחוק מהאחסון ומתי.
//
// ‼ עמוד ≠ יחידת שמירה. רוב העמודים עורכים את אותה רשומת משרד (profiles),
// ולכן נשמרים יחד בפעולה אחת — זו כתיבה אחת, אטומית באמת. מה שנשמר במקום
// אחר (ברירת המחדל ללקוח חדש, מחירון, עובדים) נשמר בדרך שלו.

import type { FirmProfile } from '../../types/firmProfile';
import { FIRM_PRIVATE_BUCKET, LOGO_BUCKET } from '../../utils/firmBuckets';
import { GUIDE_BUCKET, LIBRARY_KEY, EXPENSES_GUIDE_KEY } from '../../lib/clientGuide';
import { NOTIFICATION_SETTINGS_KEY, ACCOUNTANT_NOTIFICATIONS } from '../../../supabase/functions/_shared/accountantNotifications.ts';

export type OfficePageId =
  | 'profile' | 'team'
  | 'library' | 'flows' | 'pricing'
  | 'emails' | 'automations' | 'connections';

export interface OfficePageDef {
  id: OfficePageId;
  /** השם בתפריט ובכותרת. */
  label: string;
  /** שורה אחת: מה יש כאן. מוצגת מתחת לכותרת ובתפריט בטלפון. */
  blurb: string;
}

/**
 * ‼ (1.10.2026, סבב 3) יעדים לפי מה שבאים לעשות, במקום 18 עמודים בשש
 * קבוצות. אין כותרות קבוצה — הסדר והקווים המפרידים אומרים את זה:
 * מי אנחנו · מה הלקוח מקבל · מה יוצא במייל · מערכות חיצוניות.
 * ראה docs/OFFICE-UX-ROUND3-2026-10-01.md.
 * ‼ (2.10.2026) «אוטומציות» — מה PIVO עושה מול הרשויות — ליד «חיבורים»:
 * חיבור הוא הכניסה, אוטומציה היא הפעולה. ראה AutomationsPage.
 * ‼ (2.10.2026, ספרייה ומסלולים) שמונה יעדים, ושלוש שאלות שמשתמש חדש שואל:
 * איפה מגדירים (ספרייה — מה מבקשים ושולחים; מסלולים — מתי ובאיזה סדר), איפה
 * רואים מה קרה לבד (אוטומציות), ואיפה פועלים (כרטיס הלקוח — לא כאן).
 * «בקשות ללקוחות», «מסמכים» ו«תזכורות והתראות» התפרקו לתוכם, כדי שכל דבר
 * יוגדר פעם אחת. ראה docs/PLAN-LIBRARY-FLOWS.md.
 */
export const OFFICE_PAGES: OfficePageDef[] = [
  { id: 'profile', label: 'פרטי המשרד', blurb: 'שם, לוגו, חתימה ועיצוב — מה שהלקוחות רואים.' },
  { id: 'team', label: 'צוות', blurb: 'עובדים, ומי מטפל באיזה לקוח.' },
  // ‼ 05.10 (הדמיה מאושרת): «ספריית הבקשות» — כל הבקשות, כולל המובנות; «כללי פתיחה» — מתי פותחים.
  // המזהים ('library', 'flows') והכתובות לא השתנו.
  { id: 'library', label: 'ספריית הבקשות', blurb: 'כל הבקשות של המשרד, כולל הבקשות המובנות, והמסמכים.' },
  { id: 'flows', label: 'כללי פתיחה', blurb: 'מתי פותחים בקשות — למי, מה, ואיך זה מגיע ללקוח.' },
  { id: 'pricing', label: 'הצעות מחיר', blurb: 'שירותים, מחירים ותבניות הצעה.' },
  { id: 'emails', label: 'מיילים', blurb: 'הנוסח של כל מייל, ומה נשלח.' },
  { id: 'automations', label: 'אוטומציות', blurb: 'מה קורה לבד, מה מפעיל את זה, ומה קרה בפעם האחרונה.' },
  { id: 'connections', label: 'חיבורים', blurb: 'שע״ם, ביטוח לאומי, מחשב העבודה ופייפרלס.' },
];

/** קו מפריד בתפריט אחרי העמודים האלה. */
export const NAV_BREAK_AFTER = new Set<OfficePageId>(['team', 'pricing']);

export const DEFAULT_OFFICE_PAGE: OfficePageId = 'profile';

const PAGE_IDS = new Set<string>(OFFICE_PAGES.map(p => p.id));

/** עמוד + מה לפתוח בו (שורה ב«פרטי המשרד», «מה נשלח» ב«מיילים» וכו'). */
export interface OfficeLocation { page: OfficePageId; focus?: string }

/**
 * שמות ישנים — מקישורים שמורים, ממיילים ומקוד שעוד מפנה לעמודים שאוחדו.
 * כתובת ישנה נוחתת על העמוד שקיבל את התוכן, ופותחת את החלק הנכון בו.
 */
const LEGACY: Record<string, OfficeLocation> = {
  details: { page: 'profile', focus: 'details' },
  identity: { page: 'profile', focus: 'details' },
  contact: { page: 'profile', focus: 'details' },
  signature: { page: 'profile', focus: 'signature' },
  logo: { page: 'profile', focus: 'logo' },
  branding: { page: 'profile', focus: 'logo' },
  design: { page: 'profile', focus: 'design' },
  email: { page: 'profile', focus: 'sender' },
  communication: { page: 'profile', focus: 'sender' },
  employees: { page: 'team' },
  // ‼ (2.10.2026) «בקשות ללקוחות» ו«מסמכים» היו עמודים. מה לקוח חדש מקבל, ייצוג
  // ו«איך זה עובד» עברו למסלול הקליטה; הבקשות השמורות והקבצים — לספרייה.
  requests: { page: 'flows' },
  intake: { page: 'flows' },
  requestDefaults: { page: 'flows' },
  guide: { page: 'flows' },
  processes: { page: 'flows' },
  representation: { page: 'flows', focus: 'representation' },
  templates: { page: 'library', focus: 'requests' },
  documents: { page: 'library', focus: 'documents' },
  clientDocs: { page: 'library', focus: 'documents' },
  quotations: { page: 'pricing' },
  messages: { page: 'emails' },
  activity: { page: 'emails', focus: 'log' },
  // פותח ישר את חלון העריכה של כרטיס «אישור באזור האישי» (מקישור / מההדגמה).
  portalCard: { page: 'emails', focus: 'rep:portal' },
  emailActivity: { page: 'emails', focus: 'log' },
  // «תזכורות והתראות» — מה שקורה לבד — אוחד לתוך «אוטומציות».
  reminders: { page: 'automations', focus: 'reminders' },
  notifications: { page: 'automations', focus: 'notifications' },
  automation: { page: 'automations' },
  shaam: { page: 'connections', focus: 'shaam' },
  shaamWarmup: { page: 'connections', focus: 'shaam' },
  paperless: { page: 'connections', focus: 'paperless' },
};

export function resolveOfficeLocation(raw: string | null | undefined): OfficeLocation | null {
  if (!raw) return null;
  if (PAGE_IDS.has(raw)) return { page: raw as OfficePageId };
  return LEGACY[raw] ?? null;
}

export function resolveOfficePage(raw: string | null | undefined): OfficePageId | null {
  return resolveOfficeLocation(raw)?.page ?? null;
}

export function pageDef(id: OfficePageId): OfficePageDef {
  return OFFICE_PAGES.find(p => p.id === id)!;
}

// ─── איזה חלק שינית ──────────────────────────────────────────────────────────

/** JSON יציב — ממיין מפתחות רקורסיבית, כי jsonb ב-Postgres מחזיר מפתחות בסדר אחר. */
export function stableStringify(v: unknown): string {
  if (v === undefined) return 'null';
  if (v === null || typeof v !== 'object') return JSON.stringify(v);
  if (Array.isArray(v)) return '[' + v.map(stableStringify).join(',') + ']';
  const obj = v as Record<string, unknown>;
  return '{' + Object.keys(obj).filter(k => obj[k] !== undefined).sort()
    .map(k => JSON.stringify(k) + ':' + stableStringify(obj[k])).join(',') + '}';
}

/** השוואה בלי שדות שהשרת מנהל (updated_at משתנה בכל שמירה). */
export function editableJson(p: FirmProfile): string {
  const { updatedAt: _u, createdAt: _c, ...rest } = p as FirmProfile & { updatedAt?: string; createdAt?: string };
  return stableStringify(rest);
}

const CLIENT_AUDIENCE_KINDS = new Set(ACCOUNTANT_NOTIFICATIONS.filter(n => n.audience === 'client').map(n => n.kind));

function pick<T extends object>(o: T | undefined, keys: string[]): Record<string, unknown> {
  const src = (o ?? {}) as Record<string, unknown>;
  return Object.fromEntries(keys.map(k => [k, src[k]]));
}

function notificationPrefs(p: FirmProfile, audience: 'firm' | 'client'): Record<string, unknown> {
  const raw = ((p.settings ?? {}) as Record<string, unknown>)[NOTIFICATION_SETTINGS_KEY];
  const all = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  return Object.fromEntries(Object.entries(all)
    .filter(([k]) => CLIENT_AUDIENCE_KINDS.has(k) === (audience === 'client')));
}

function repPart(p: FirmProfile, key: 'defaults' | 'templates' | 'reminders'): unknown {
  const rep = ((p.settings ?? {}) as Record<string, unknown>).representation as Record<string, unknown> | undefined;
  return rep?.[key] ?? null;
}

const DETAILS_FIELDS = ['firmName', 'legalName', 'representativeNumber', 'representativeType', 'email', 'phone', 'website', 'address', 'fullName'];

interface Slice { page: OfficePageId; label: string; read: (p: FirmProfile) => unknown }

/**
 * החלק ברשומת המשרד שכל עמוד עורך — עם שם החלק, לשורת השמירה («לא נשמר ·
 * לוגו · הודעות אליך»). ‼ settings.representation מתחלק בין שלושה עמודים: מה
 * נבחר מראש (מסלולים — מסלול הקליטה), הנוסחים (מיילים) והתזכורות (אוטומציות).
 * מתג תזכורת הפקיעה יושב במפתח ההתראות, אבל הוא מייל ללקוח — ולכן נספר
 * כ«תזכורות» ולא כ«הודעות אליך».
 * ‼ מסלול אינו חלק ברשומת המשרד: הוא נשמר כגרסה משלו (save_office_flow), ולכן
 * אינו כאן — הקונסולה מוסיפה את «מסלולים» לרשימת מה שלא נשמר לפי מה שהעמוד מדווח.
 */
const SLICES: Slice[] = [
  { page: 'profile', label: 'פרטי המשרד', read: p => pick(p, DETAILS_FIELDS) },
  { page: 'profile', label: 'לוגו', read: p => pick(p.branding, ['logoPath', 'logoUrl', 'logoOnDarkPath', 'logoOnDarkUrl', 'emailLogoPath', 'emailLogoUrl', 'logoScale', 'monogram']) },
  { page: 'profile', label: 'חתימה וחותמת', read: p => pick(p.branding, ['signaturePath', 'signatureUrl', 'stampPath', 'stampUrl']) },
  { page: 'profile', label: 'עיצוב', read: p => p.branding?.docDesign ?? null },
  { page: 'profile', label: 'שולח המיילים', read: p => p.communication ?? null },
  { page: 'flows', label: 'ייצוג', read: p => repPart(p, 'defaults') },
  { page: 'library', label: 'מסמכים', read: p => pick(p.settings, [LIBRARY_KEY, EXPENSES_GUIDE_KEY]) },
  { page: 'pricing', label: 'הצעות מחיר', read: p => (p.settings ?? {}).quotations ?? null },
  { page: 'emails', label: 'נוסחי מיילים', read: p => ({ c: (p.settings ?? {}).commTemplates ?? null, r: repPart(p, 'templates') }) },
  { page: 'automations', label: 'תזכורות', read: p => ({ r: repPart(p, 'reminders'), n: notificationPrefs(p, 'client') }) },
  { page: 'automations', label: 'הודעות אליך', read: p => notificationPrefs(p, 'firm') },
  { page: 'connections', label: 'שע״ם', read: p => (p.settings ?? {}).shaamWarmup ?? null },
  { page: 'connections', label: 'פייפרלס', read: p => (p.settings ?? {}).paperless ?? null },
];

const BRANDING_COVERED = new Set(['signaturePath', 'signatureUrl', 'stampPath', 'stampUrl', 'logoPath', 'logoUrl',
  'logoOnDarkPath', 'logoOnDarkUrl', 'emailLogoPath', 'emailLogoUrl', 'logoScale', 'monogram', 'docDesign']);
const SETTINGS_COVERED = new Set(['representation', 'commTemplates', LIBRARY_KEY, EXPENSES_GUIDE_KEY, 'quotations',
  NOTIFICATION_SETTINGS_KEY, 'shaamWarmup', 'paperless']);

export interface DirtyPart { page: OfficePageId | 'other'; label: string }

/** אילו חלקים שונו בטיוטה, בסדר העמודים. 'other' = שדה שאין לו עמוד (לא אמור לקרות). */
export function dirtyParts(draft: FirmProfile, saved: FirmProfile): DirtyPart[] {
  const out: DirtyPart[] = SLICES
    .filter(s => stableStringify(s.read(draft)) !== stableStringify(s.read(saved)))
    .map(s => ({ page: s.page, label: s.label }));
  const rest = (p: FirmProfile) => {
    const { branding, communication: _c, settings, updatedAt: _u, createdAt: _cr, ...top } =
      p as FirmProfile & { updatedAt?: string; createdAt?: string };
    return stableStringify({
      top: Object.fromEntries(Object.entries(top).filter(([k]) => !DETAILS_FIELDS.includes(k))),
      branding: Object.fromEntries(Object.entries(branding ?? {}).filter(([k]) => !BRANDING_COVERED.has(k))),
      settings: Object.fromEntries(Object.entries(settings ?? {}).filter(([k]) => !SETTINGS_COVERED.has(k))),
    });
  };
  if (rest(draft) !== rest(saved)) out.push({ page: 'other', label: 'הגדרות נוספות' });
  return out;
}

/** אילו עמודים שונו — כל עמוד פעם אחת. */
export function dirtyPages(draft: FirmProfile, saved: FirmProfile): (OfficePageId | 'other')[] {
  return [...new Set(dirtyParts(draft, saved).map(d => d.page))];
}

// ─── קבצים באחסון ────────────────────────────────────────────────────────────
// ‼ קודם, החלפת לוגו/חתימה/חותמת מחקה את הקובץ הקודם **מיד** — לפני שהשינוי
// נשמר. יציאה בלי שמירה השאירה את הרשומה השמורה מצביעה על קובץ שנמחק: לוגו
// שבור במיילים. עכשיו המחיקה קורית רק אחרי שמירה שהצליחה, ורק לקבצים שהרשומה
// השמורה כבר אינה מצביעה עליהם. קבצים שהועלו ולא נשמרו נמחקים בביטול.

export { LOGO_BUCKET };

/** `${bucket}:${path}` */
export type AssetRef = string;

export const assetRef = (bucket: string, path: string): AssetRef => `${bucket}:${path}`;

export function splitAssetRef(ref: AssetRef): { bucket: string; path: string } {
  const i = ref.indexOf(':');
  return { bucket: ref.slice(0, i), path: ref.slice(i + 1) };
}

interface LibraryEntry { path?: string; history?: { path?: string }[] }

/** כל קובץ שהרשומה מצביעה עליו — כולל גרסאות קודמות בספרייה, שלעולם אינן נמחקות. */
export function assetRefs(p: FirmProfile): Set<AssetRef> {
  const refs = new Set<AssetRef>();
  const b = p.branding ?? {};
  for (const path of [b.logoPath, b.logoOnDarkPath, b.emailLogoPath]) if (path) refs.add(assetRef(LOGO_BUCKET, path));
  for (const path of [b.stampPath, b.signaturePath]) if (path) refs.add(assetRef(FIRM_PRIVATE_BUCKET, path));
  const settings = (p.settings ?? {}) as Record<string, unknown>;
  const lib = settings[LIBRARY_KEY];
  if (Array.isArray(lib)) {
    for (const d of lib as LibraryEntry[]) {
      if (d?.path) refs.add(assetRef(GUIDE_BUCKET, d.path));
      for (const h of d?.history ?? []) if (h?.path) refs.add(assetRef(GUIDE_BUCKET, h.path));
    }
  }
  const legacy = settings[EXPENSES_GUIDE_KEY] as LibraryEntry | undefined;
  if (legacy?.path) refs.add(assetRef(GUIDE_BUCKET, legacy.path));
  for (const h of legacy?.history ?? []) if (h?.path) refs.add(assetRef(GUIDE_BUCKET, h.path));
  return refs;
}

/**
 * מה מוחקים אחרי שמירה שהצליחה:
 *  · קובץ מיתוג (לוגו/חתימה/חותמת) שהיה בשמור הקודם ואינו בשמור החדש — כמו
 *    שהתנהג קודם, רק אחרי השמירה ולא לפניה.
 *  · קובץ שהועלה בסבב הזה ולא נכנס לשמור (הועלה ואז הוחלף/הוסר לפני השמירה).
 * ‼ קבצי הספרייה שהיו שמורים אינם נמחקים לעולם: בקשה שכבר נשלחה נשענת עליהם.
 */
export function refsToDeleteAfterSave(prevSaved: FirmProfile, nextSaved: FirmProfile, uploaded: Set<AssetRef>): AssetRef[] {
  const prev = assetRefs(prevSaved);
  const next = assetRefs(nextSaved);
  const out = new Set<AssetRef>();
  for (const r of prev) {
    if (!next.has(r) && splitAssetRef(r).bucket !== GUIDE_BUCKET) out.add(r);
  }
  for (const r of uploaded) if (!next.has(r)) out.add(r);
  return [...out];
}

/** ביטול שינויים: מוחקים רק את מה שהועלה בסבב הזה ואינו בשמור. */
export function refsToDeleteOnDiscard(saved: FirmProfile, uploaded: Set<AssetRef>): AssetRef[] {
  const keep = assetRefs(saved);
  return [...uploaded].filter(r => !keep.has(r));
}

// ─── רשימת ההכנסות בביטוח לאומי: הצהרה ≠ שומה ────────────────────────────────
// ‼ «סכום הכנסה» ברשימת ההכנסות אינו נושא יחידה. המשמעות נגזרת מ«מקור מידע»:
//
//   «הצהרה»     · יוני–יוני 2025      · 16,500  ⇒ הכנסה **חודשית** מוצהרת.
//   «שומה עצמי» · ינואר–דצמבר 2025    · 47,800  ⇒ הכנסה **שנתית** לפי שומה.
//
// (שתי הקביעות אושרו ע"י גיא, 05.10.2026, על מקרים אמיתיים.) כל דבר אחר —
// שומה לחלק משנה, מקור מידע שאינו מוכר — נשמר כלשונו, והפירוש החודשי שלו
// «לא ידוע». לא מחלקים ב-12 שומה חלקית, לא מחלקים הצהרה בטווח החודשים
// שלה, ולא משתמשים בהכנסה כשכיר כהכנסה של עצמאי.

import { NI_FACT_KEYS } from '../../types';
import type { Client, NiIncomeEntry, NiIncomeList, PersonRole } from '../../types';
import type { FieldMeta } from '../../types/clientWorkspace';
import { niMonthsText } from './niBasisDisplay';

export type NiIncomeKind = 'declaration' | 'assessment' | 'other';
export type NiIncomeUnit = 'monthly' | 'annual' | 'unknown';

const VALID_STATUS = 'תקף';
const SELF_EMPLOYED = 'עצמאי';

const norm = (s: string | null | undefined) => (s ?? '').replace(/\s+/g, ' ').trim();

export function niIncomeKind(e: Pick<NiIncomeEntry, 'infoSource'>): NiIncomeKind {
  const s = norm(e.infoSource);
  if (/הצהרה/.test(s)) return 'declaration';
  if (/שומה/.test(s)) return 'assessment';
  return 'other';
}

/** שומה ל«ינואר–דצמבר» בלבד היא שנתית. כל טווח אחר ⇒ לא ידוע. */
export function niIncomeUnit(e: NiIncomeEntry): NiIncomeUnit {
  const kind = niIncomeKind(e);
  if (kind === 'declaration') return 'monthly';
  if (kind === 'assessment' && e.fromMonth === 1 && e.toMonth === 12) return 'annual';
  return 'unknown';
}

export interface NiIncomeMonthly {
  amount: number;
  /** true ⇒ ממוצע שחושב ב-PIVO (שנתי ÷ 12), לא נתון שב"ל רשם. */
  calculated: boolean;
}

/** ההכנסה לחודש כשהיא ידועה. שומה שנתית ⇒ ממוצע מחושב; לא ידוע ⇒ null. */
export function niIncomeMonthly(e: NiIncomeEntry): NiIncomeMonthly | null {
  const unit = niIncomeUnit(e);
  if (unit === 'monthly') return { amount: e.amount, calculated: false };
  if (unit === 'annual') return { amount: e.amount / 12, calculated: true };
  return null;
}

export function niIsSelfEmployedValid(e: NiIncomeEntry): boolean {
  return norm(e.status) === VALID_STATUS && norm(e.incomeSource) === SELF_EMPLOYED
    && Number.isFinite(e.amount) && e.amount >= 0;
}

/** «יוני 2025», «ינואר–דצמבר 2025», ובלי חודשים — «2025». */
export function niIncomePeriodText(e: NiIncomeEntry): string {
  if (e.fromMonth == null || e.toMonth == null) return String(e.year);
  return niMonthsText(Math.min(e.fromMonth, e.toMonth), Math.max(e.fromMonth, e.toMonth), e.year);
}

/** «הצהרה · יוני 2025» / «שומה עצמי · ינואר–דצמבר 2025» — מקור המידע כלשונו. */
export function niIncomeSourceText(e: NiIncomeEntry): string {
  const label = norm(e.infoSource) || 'רשימת הכנסות';
  return `${label} · ${niIncomePeriodText(e)}`;
}

const sortKey = (e: NiIncomeEntry) =>
  [String(e.year).padStart(4, '0'), String(e.toMonth ?? 0).padStart(2, '0'),
    String(e.fromMonth ?? 0).padStart(2, '0'), e.receivedDate ?? ''].join('|');

function pick(rows: NiIncomeEntry[]): { entry: NiIncomeEntry | null; ambiguous: boolean } {
  if (rows.length === 0) return { entry: null, ambiguous: false };
  const sorted = [...rows].sort((a, b) => sortKey(b).localeCompare(sortKey(a)));
  const top = sorted[0];
  const tied = sorted.filter(r => sortKey(r) === sortKey(top));
  // ‼ שתי שורות תקפות לאותה תקופה, שהתקבלו באותו יום, בסכום שונה — אין
  // דרך לדעת איזו נכונה. לא בוחרים לפי סדר הטבלה.
  if (new Set(tied.map(r => r.amount)).size > 1) return { entry: null, ambiguous: true };
  return { entry: top, ambiguous: false };
}

/**
 * ההצהרה האחרונה והשומה האחרונה של העצמאי — כל אחת בנפרד. ‼ רק שורות תקפות
 * עם «מקור הכנסה: עצמאי». אף אחת אינה «ההכנסה הנוכחית» מעצם היותה אחרונה.
 */
export function selectNiIncome(rows: readonly NiIncomeEntry[]): NiIncomeList {
  const valid = rows.filter(niIsSelfEmployedValid);
  const d = pick(valid.filter(r => niIncomeKind(r) === 'declaration'));
  const a = pick(valid.filter(r => niIncomeKind(r) === 'assessment'));
  const ambiguous = [d.ambiguous ? 'declaration' : null, a.ambiguous ? 'assessment' : null]
    .filter((x): x is 'declaration' | 'assessment' => !!x);
  return { declaration: d.entry, assessment: a.entry, ...(ambiguous.length ? { ambiguous } : {}) };
}

export function niIncomeListEmpty(l: NiIncomeList | null | undefined): boolean {
  return !l || (!l.declaration && !l.assessment && !(l.ambiguous?.length));
}

/** מפתח השוואה יציב (סדר שדות קבוע). */
export function niIncomeListKey(l: NiIncomeList | null | undefined): string {
  if (!l) return '';
  const e = (x: NiIncomeEntry | null) => x
    ? [x.year, x.fromMonth, x.toMonth, norm(x.infoSource), norm(x.incomeSource), x.amount, x.receivedDate, norm(x.status)].join('~')
    : '';
  return [e(l.declaration), e(l.assessment), [...(l.ambiguous ?? [])].sort().join(',')].join('|');
}

/**
 * שורה כפי שהעובד מחזיר — חדש (`amount`) או ישן (`monthlyAmount`, לפני 219,
 * כשכל סכום נקרא «לחודש»). ‼ בשני המקרים זה «סכום הכנסה» כלשונו.
 */
export function niIncomeEntryFromWorker(raw: unknown): NiIncomeEntry | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const amount = typeof r.amount === 'number' ? r.amount : typeof r.monthlyAmount === 'number' ? r.monthlyAmount : null;
  const year = typeof r.year === 'number' ? r.year : null;
  if (amount == null || year == null) return null;
  const num = (v: unknown) => (typeof v === 'number' ? v : null);
  const str = (v: unknown) => (typeof v === 'string' && v.trim() ? v : null);
  return {
    year, fromMonth: num(r.fromMonth), toMonth: num(r.toMonth),
    infoSource: str(r.infoSource), incomeSource: str(r.incomeSource),
    amount, receivedDate: str(r.receivedDate), status: str(r.status),
  };
}

// ─── קריאה מב"ל: שלמה, חלקית או שנכשלה ────────────────────────────────────────

/**
 * מה קריאה אחת של «רשימת הכנסות» אומרת על אדם אחד.
 *   ok:false  — לא נקרא. לא «אין», לא «ישן» — פשוט אין ראיה.
 *   partial   — עובד שלפני 219: שורה אחת שנבחרה לפי שנה. אי אפשר להסיק ממנה מה **אין**.
 *   complete  — כל שורות «הצהרה»/«שומה» הגיעו. רק קריאה שלמה רשאית לומר
 *               «אין הצהרה», לסתור הצהרה שמורה, או להציע לנקות.
 */
export type NiIncomeRead =
  | { ok: false; unavailable?: NiIncomeEvidenceGap }
  | { ok: true; list: NiIncomeList; raw: NiIncomeEntry[]; partial: boolean; complete: boolean; readAt?: string };

/**
 * למה אין ראיה עדכנית עכשיו (ולא «אין ראיה כי מעולם לא נקרא»):
 *   loading — הראיה עדיין נשלפת (או שהלקוח התחלף והקודמת אינה שלו).
 *   error   — השליפה נכשלה. בשני המקרים ערך אוטומטי אינו מאומת עד שנדע.
 */
export type NiIncomeEvidenceGap = 'loading' | 'error';

/** מקטע «רשימת הכנסות» כפי שהעובד מחזיר אותו. */
export interface NiIncomeSection {
  ok: boolean;
  value?: unknown;
  /** מ-219: השורות כלשונן — כל שורות הבחירה, ושורות הקשר עד תקרה. */
  records?: unknown[];
  rows?: number;
  omitted?: number;
  candidatesComplete?: boolean;
}

export function niIncomeReadOf(section: NiIncomeSection | undefined, readAt?: string): NiIncomeRead {
  if (!section?.ok) return { ok: false };
  const partial = !Array.isArray(section.records);
  const raw = (partial ? (section.value != null ? [section.value] : []) : section.records!)
    .map(niIncomeEntryFromWorker)
    .filter((e): e is NiIncomeEntry => !!e)
    // ‼ העובד שלפני 219 החזיר רק שורה «תקף» (selectDirectIncome סינן) — גם
    // כשהסטטוס עצמו לא נשמר בתוצאה.
    .map(e => (partial && !e.status ? { ...e, status: 'תקף' } : e));
  // ‼ שלמה = כל שורות הבחירה הגיעו. בלי הדגל (גרסת ביניים) — רק אם לא חסרה אף שורה.
  const complete = !partial && (section.candidatesComplete != null
    ? section.candidatesComplete
    : section.rows == null || section.records!.length >= section.rows);
  const list = selectNiIncome(raw);
  return {
    ok: true, raw, partial, complete, readAt,
    list: !complete && !niIncomeListEmpty(list) ? { ...list, partial: true } : list,
  };
}

/** הקריאה של כל אדם מתוך משימת btl.sync_file שהצליחה. משימה אחרת ⇒ {}. */
export function niIncomeReadsFromJob(job: { status: string; result?: unknown; finishedAt?: string; updatedAt?: string } | null | undefined): Partial<Record<PersonRole, NiIncomeRead>> {
  if (job?.status !== 'succeeded') return {};
  const persons = (job.result as { persons?: { role?: string; ok?: boolean; sections?: { directIncome?: NiIncomeSection } }[] } | undefined)?.persons;
  const out: Partial<Record<PersonRole, NiIncomeRead>> = {};
  for (const p of Array.isArray(persons) ? persons : []) {
    if (p?.role !== 'client' && p?.role !== 'spouse') continue;
    out[p.role] = p.ok ? niIncomeReadOf(p.sections?.directIncome, job.finishedAt ?? job.updatedAt) : { ok: false };
  }
  return out;
}

// ─── האם אפשר לסמוך על «הכנסה מוצהרת» שבכרטיס ─────────────────────────────────

/**
 *   none        — אין ערך.
 *   declaration — נכתב מקריאת ב"ל ותואם להצהרה (השמורה, או זו שבקריאה השלמה
 *                 האחרונה) — ואף קריאה שלמה מאוחרת לא סתרה אותה.
 *   manual      — הוזן ביד — ערך לגיטימי, נשמר כמו שהוא.
 *   unverified  — legacy: נכתב לפני 219 בלי לדעת אם זו הצהרה (כך נכתבה שומה
 *                 שנתית 47,800 «לחודש»). contradicted: הקריאה השלמה האחרונה
 *                 מב"ל לא מצאה את ההצהרה הזו (נעלמה, השתנתה, או שתי הצהרות
 *                 סותרות). בשני המקרים — לא נכנס לחישוב, להשוואה או ל-6101.
 */
export type NiIncomeTrust =
  | { kind: 'none' }
  | { kind: 'declaration'; entry: NiIncomeEntry }
  | { kind: 'manual' }
  | { kind: 'unverified'; reason: 'legacy' | 'contradicted' | 'checking' | 'unavailable'; readAt?: string };

/**
 * ‼ `latest` — הקריאה האחרונה **שהצליחה** מב"ל לאותו אדם. היא גוברת על מה
 * שאושר בעבר: הצהרה שמורה שקריאה שלמה מאוחרת לא מצאה אינה «מאומתת», עוד
 * לפני שמישהו אישר את ההצעה לעדכן. קריאה שנכשלה/חלקית אינה ראיה לכלום.
 */
export function niIncomeTrust(
  value: number | null | undefined, meta: FieldMeta | undefined, list: NiIncomeList | null | undefined,
  latest?: NiIncomeRead | null,
): NiIncomeTrust {
  if (value == null || Number.isNaN(value)) return { kind: 'none' };
  if (meta?.source !== 'automation') return { kind: 'manual' };
  // ‼ הראיה העדכנית נשלפת / נכשלה ⇒ אי אפשר לדעת אם קריאה שלמה סתרה את
  // ההצהרה השמורה. לא «מאומת» עד שנדע (ידני נשמר — נבדק למעלה).
  if (latest && !latest.ok && latest.unavailable) {
    return { kind: 'unverified', reason: latest.unavailable === 'loading' ? 'checking' : 'unavailable' };
  }
  const fresh = latest?.ok && latest.complete ? latest : null;
  const stored = list?.declaration && list.declaration.amount === value ? list.declaration : null;
  if (fresh) {
    // ‼ הקריאה השלמה האחרונה מכריעה: יש בה הצהרה בדיוק בסכום הזה ⇒ מאומת
    // (גם אם השמורה ישנה יותר). אין ⇒ השמורה (אם הייתה) נסתרה.
    const d = fresh.list.declaration;
    if (d && d.amount === value) return { kind: 'declaration', entry: d };
    return { kind: 'unverified', reason: stored ? 'contradicted' : 'legacy', readAt: fresh.readAt };
  }
  if (stored) return { kind: 'declaration', entry: stored };
  return { kind: 'unverified', reason: 'legacy' };
}

export function niIncomeTrusted(t: NiIncomeTrust): boolean {
  return t.kind === 'declaration' || t.kind === 'manual';
}

/**
 * ‼ הלקוח עצמו — לטופס 6101 ולמסכים שאינם לפי אדם. `role: 'spouse'` (הגשה על
 * בן/בת הזוג): העובדות והראיה של בן/בת הזוג, לעולם לא של הלקוח.
 */
export function niClientIncomeTrust(client: Client, latest?: NiIncomeRead | null, role: PersonRole = 'client'): NiIncomeTrust {
  const keys = NI_FACT_KEYS[role];
  return niIncomeTrust(
    client[keys.incomeBasisMonthly] as number | undefined,
    client.fieldMeta?.[keys.incomeBasisMonthly],
    client[keys.incomeList] as NiIncomeList | undefined,
    latest,
  );
}

export const NI_UNVERIFIED_INCOME_NOTE = 'טעון אימות — נקרא בעבר בלי לדעת אם זו הצהרה חודשית';

const shortDay = (iso?: string) => {
  const m = iso ? /^(\d{4})-(\d{2})-(\d{2})/.exec(iso) : null;
  return m ? `${m[3]}/${m[2]}/${m[1]}` : null;
};

/** ההסבר הקצר ל«טעון אימות», לפי הסיבה. */
export function niUnverifiedIncomeNote(t: NiIncomeTrust): string | null {
  if (t.kind !== 'unverified') return null;
  if (t.reason === 'legacy') return NI_UNVERIFIED_INCOME_NOTE;
  if (t.reason === 'checking') return 'בודק מול הקריאה האחרונה מב"ל…';
  if (t.reason === 'unavailable') return 'טעון אימות — לא ניתן היה לבדוק מול הקריאה האחרונה מב"ל';
  const d = shortDay(t.readAt);
  return `טעון אימות — בקריאה מב"ל${d ? ` ב-${d}` : ''} ההצהרה הזו לא נמצאה כתקפה`;
}

// ─── הראיה האחרונה לכל אדם — ממשימות שונות ────────────────────────────────────

/** משימה מוקלת: רק מה שנחוץ כדי לקרוא את רשימת ההכנסות. */
export interface NiIncomeEvidenceJob {
  finishedAt?: string;
  updatedAt?: string;
  result?: unknown;
}

/**
 * ‼ הקריאה **השלמה** האחרונה של כל אדם, ממשימות מהחדשה לישנה (הקורא אחראי
 * לסדר). קריאה שנכשלה / חלקית / חתוכה — או משימה שלא כללה את האדם — אינה
 * מוחקת ראיה: ממשיכים לישנה יותר. קריאה שלמה חדשה יותר גוברת.
 */
export function latestCompleteIncomeReads(
  jobsNewestFirst: Iterable<NiIncomeEvidenceJob>, roles: readonly PersonRole[],
): Partial<Record<PersonRole, NiIncomeRead>> {
  const out: Partial<Record<PersonRole, NiIncomeRead>> = {};
  for (const job of jobsNewestFirst) {
    const reads = niIncomeReadsFromJob({ status: 'succeeded', ...job });
    for (const r of roles) {
      const read = reads[r];
      if (!out[r] && read?.ok && read.complete) out[r] = read;
    }
    if (roles.every(r => out[r])) break;
  }
  return out;
}

// ─── תמונת השנה: מה ידוע, מה חסר, ומה לשאול — פונקציה טהורה ──────────────────
// ‼ השאלה ללקוח נולדת רק מכאן. מפת 1301 אינה מייצרת שאלות; היא בקרה.
// ‼ לא שואלים שוב: עובדה מאושרת, תשובה שממתינה לבדיקה, פריט שכבר נשלח ועוד
// לא נענה, או מסמך שסומן «אין לי עדיין» — כל אלה אינם «חסר».
// ‼ חלקי אינו שלם: עובדה עד ספטמבר לא מספיקה לדוח השנתי. לדוח מבקשים «מה
// השתנה מאז» ומסמך סופי — לא את אותה שאלה מחדש.
// ‼ מסמך שהתקבל אינו מידע מאושר: «התקבל, ממתין לבדיקה» ≠ «ידוע».

import type { Client } from '../../types';
import { AREAS, ITEMS, ITEM_BY_KEY, type AreaId, type InfoItem } from './catalog';
import { canRequestNow, DOCS } from './documents';
import type { EntityKind, Evidence, FactBasis, InfoAsk, Purpose, SubjectRole, YearFact } from './types';
import { accountSpan, entityRelevance, periodOfRequest, propertySpan, type Relevance } from './temporal';
import { entitiesInPeriod, isPeriodItem, listKindOf } from './structured';
import { dealerOf } from './structured';
import { crossesYearEnd, maternityPeriodOf } from './maternity';
import { FAMILY_STATUS_YEAR_KEY, familyStatusEventYear } from '../../utils/familyStatusYear';

export type ItemState =
  | 'known'             // יש עובדה מאושרת שמספיקה לתכלית
  | 'partial'           // ידוע לחלק מהשנה (עד החתך) — לדוח צריך השלמה ומסמך סופי
  | 'fromCard'          // ידוע מהכרטיס (מתמשך) — לאשר לשנה, לא לשאול מחדש
  | 'pendingReview'     // יש תשובה שממתינה לבדיקת המשרד
  | 'docReceived'       // התקבל מסמך — טרם נבדק או טרם הוזנו ממנו נתונים
  | 'asked'             // נשלח ללקוח ועוד לא נענה
  | 'unavailable'       // הלקוח סימן «אין לי עדיין» — יש מועד מעקב
  | 'notYetAvailable'   // מסמך שעוד לא אמור להיות קיים לשנה הזו
  | 'missing'           // רלוונטי, ואין עליו כלום
  | 'notApplicable';    // לא חל (לפי תשובה, כרטיס או שאלת פתיחה)

export interface Target {
  subjectRole: SubjectRole;
  entityKind?: EntityKind;
  entityRef?: string;
  /** שם הישות או האדם — לשאלה ולמסך. */
  entityLabel?: string;
  /** של מי הישות (עסק של בן/בת הזוג). */
  ownerRole?: 'client' | 'spouse';
  /** ישות זמנית: נולדה מ«כן» בשאלת פתיחה כשבתיק אין ישות כזו לאדם (provisional). */
  provisional?: boolean;
  /** מי ענה «כן» בשאלת הפתיחה שהולידה את הישות הזמנית — לשער של פריטי ההמשך. */
  gateRole?: SubjectRole;
}

/** משימת משרד מחוץ לשאלון, אחרי אישור: לעדכן את הכרטיס (הצעה עם היסטוריה) או להוסיף ישות. */
export type OfficeTask =
  | { kind: 'cardFlag'; field: string; value: boolean; factId: string }
  | { kind: 'cardChoice'; field: string; value: string; factId: string }
  | { kind: 'addEntity'; factId: string; entityRef: string; text: string }
  | { kind: 'cardEdit'; factId: string; text: string }
  | { kind: 'officeCheck' };

export interface ItemStatus extends Target {
  item: InfoItem;
  area: AreaId;
  state: ItemState;
  /** משפט קצר למשרד: למה המצב הזה. */
  detail: string;
  facts: YearFact[];
  evidence: Evidence[];
  ask?: InfoAsk;
  /** מועד שבו אפשר לבקש (מסמך שטרם זמין / סומן «אין עדיין»). */
  requestableFrom?: string;
  /** האם הלקוח הוא שעונה, והאם אפשר לשאול עכשיו. */
  askable: boolean;
  /** עובדה סותרת: התשובה הממתינה שונה ממה שאושר או מהכרטיס. */
  conflict?: string;
  /** פעולה שהמשרד צריך לעשות מחוץ לשאלון (למשל לעדכן את הכרטיס) — מכניס את הפריט ל«עכשיו» של המשרד. */
  officeAction?: string;
  /** הפעולה במבנה — כשיש לה כפתור (עדכון הכרטיס, הוספת ישות, «עודכן בתיק»). */
  officeTask?: OfficeTask;
  /** מסמך מאושר שכבר בתיק (משנה או מתהליך אחר) ושאינו שייך לתקופה — לא מבקשים שוב. */
  reusedEvidence?: Evidence;
  /**
   * 13.10.2026 · רשימת אישור של נכסים או חשבונות: הישויות שבוודאות בתקופה — רק הן מוצגות ב«זה מה שידוע לנו».
   * ישות שהתחולה שלה לא ידועה נשאלת בנפרד (period.*); ישות שבוודאות מחוץ לתקופה — לא מוצגת.
   */
  lineRefs?: string[];
}

export interface PictureInput {
  client: Client;
  taxYear: number;
  purpose: Purpose;
  /** הערכה: חודש החתך (1 עד 12). */
  cutoffMonth?: number;
  today: string;
  facts: YearFact[];
  evidence: Evidence[];
  asks: InfoAsk[];
  /** פריטים חריגים שהמשרד פתח לשנה הזו. */
  openedRare?: string[];
  /** הצהרת הון: יום ההצהרה — עובדות «נכון ל-» התאריך הזה בלבד. */
  asOfDate?: string;
  /** הצהרת הון: ראשונה או המשך. */
  declKind?: 'first' | 'followup';
  /**
   * מסמכים מאושרים מכל שנה ומכל תהליך (רק מסוג שאינו שייך לתקופה — DOCS[].durable). ‼ 12.10.2026:
   * «בלי לבקש שוב מסמך מאושר» — תעודת זהות שאושרה בקליטה לא מתבקשת שוב בדוח, וכו׳.
   */
  priorEvidence?: Evidence[];
}

export interface YearPicture {
  purpose: Purpose;
  taxYear: number;
  statuses: ItemStatus[];
  /** ללקוח: חסרים, שאפשר לשאול עכשיו. */
  toAsk: ItemStatus[];
  /** ללקוח: ידוע מהכרטיס — רשימת «זה מה שידוע לנו, עדיין נכון?». */
  toConfirm: ItemStatus[];
  /** ללקוח, לדוח: ידוע עד החתך — «מה השתנה מאז» ומסמך סופי. */
  toComplete: ItemStatus[];
  /** למשרד: להשלים בעצמו. */
  officeTodo: ItemStatus[];
  /** למשרד: לבדוק ולאשר. */
  toReview: ItemStatus[];
  /** ממתין ללקוח (נשלח / סומן «אין עדיין»). */
  waiting: ItemStatus[];
  /**
   * ‼ 12.10.2026: שאלות פתוחות (טיוטה / בדף האישי / «אין עדיין») שכבר אינן רלוונטיות — התשובה שעליה
   * נשענו שונתה ל«לא». המשרד מבטל אותן (נשמרות כמבוטלות — היסטוריה), ולא מפרסם אותן.
   */
  stale: ItemStatus[];
  counts: Record<ItemState, number>;
}

// ── עזר ──────────────────────────────────────────────────────────────────────

/** שמות הישויות לפעולת משרד — רק ישויות שיושבות ברשימה בכרטיס. */
const ENTITY_HE: Partial<Record<InfoItem['per'], string>> = { employer: 'מעסיק', business: 'עסק', property: 'נכס מושכר', account: 'חשבון השקעות', foreign_source: 'מקור הכנסה בחו״ל', fund: 'קופה' };

const isMarried = (c: Client) => c.familyStatus === 'married';
const name = (c: Client, role: 'client' | 'spouse') =>
  role === 'spouse' ? (c.spouseFirstName || c.spouse?.firstName || 'בן/בת הזוג') : (c.firstName || 'הלקוח');

const yearOverlaps = (y: number, from?: number, to?: number) => (from == null || from <= y) && (to == null || to >= y);
const yearOf = (iso?: string) => (iso ? Number(iso.slice(0, 4)) : undefined);

/** הישויות שהפריט חל עליהן, מהכרטיס. */
export function targetsFor(item: InfoItem, c: Client, y: number, facts: YearFact[]): Target[] {
  const people: ('client' | 'spouse')[] = isMarried(c) ? ['client', 'spouse'] : ['client'];
  const owner = (spouse?: boolean): 'client' | 'spouse' => (spouse ? 'spouse' : 'client');
  switch (item.per) {
    case 'couple': return [{ subjectRole: 'couple' }];
    case 'person': return people.map(r => ({ subjectRole: r, entityLabel: name(c, r) }));
    case 'employer':
      return (c.employers ?? [])
        .filter(e => yearOverlaps(y, yearOf(e.startDate), yearOf(e.endDate)))
        .map(e => ({ subjectRole: owner(e.belongsToSpouse), ownerRole: owner(e.belongsToSpouse), entityKind: 'employer' as const, entityRef: e.id, entityLabel: e.name }));
    case 'business':
      return (c.businesses ?? [])
        .filter(b => yearOverlaps(y, b.startYear, b.isClosed ? b.closedYear : undefined))
        .map(b => ({ subjectRole: owner(b.belongsToSpouse), ownerRole: owner(b.belongsToSpouse), entityKind: 'business' as const, entityRef: b.id, entityLabel: b.name }));
    case 'property':
      // ‼ הצהרת הון: כל נכס (גם דירת מגורים); שנת מס: רק מושכר
      return (c.properties ?? []).filter(p => p.isRented || item.purposes.includes('wealth'))
        .map(p => ({ subjectRole: 'couple' as const, entityKind: 'property' as const, entityRef: p.id, entityLabel: [p.address, p.city].filter(Boolean).join(', ') || 'נכס' }));
    case 'account':
      return (c.investmentAccounts ?? []).filter(a => yearOverlaps(y, undefined, a.isClosed ? a.closedYear : undefined))
        .map(a => ({ subjectRole: 'couple' as const, entityKind: 'account' as const, entityRef: a.id, entityLabel: a.institutionName }));
    case 'fund':
      return (c.pensionFunds ?? []).filter(f => f.hasSelfDeposits || item.purposes.includes('wealth'))
        .map(f => ({ subjectRole: 'client' as const, entityKind: 'fund' as const, entityRef: f.id, entityLabel: [f.institutionName, f.productName].filter(Boolean).join(' · ') }));
    case 'foreign_source':
      return (c.foreignAccounts ?? []).map(a => ({ subjectRole: 'couple' as const, entityKind: 'foreign_source' as const, entityRef: a.id, entityLabel: [a.institutionName, a.country].filter(Boolean).join(', ') || 'חו״ל' }));
    case 'child':
      return (c.children ?? []).filter(ch => ch.birthYear === y)
        .map(ch => ({ subjectRole: 'couple' as const, entityKind: 'child' as const, entityRef: ch.id, entityLabel: ch.firstName || `ילד/ה ${ch.birthYear}` }));
    case 'transaction': {
      // עסקאות נולדות מתשובות (אין רשימה בכרטיס). בלי עסקה רשומה — יעד אחד לפתיחה.
      const refs = [...new Set(facts.filter(f => f.entityKind === 'transaction' && f.entityRef).map(f => f.entityRef!))];
      return refs.length
        ? refs.map(r => ({ subjectRole: 'client' as const, entityKind: 'transaction' as const, entityRef: r, entityLabel: 'עסקה' }))
        : [{ subjectRole: 'client', entityKind: 'transaction', entityRef: 'new', entityLabel: 'עסקה' }];
    }
    default: return [];
  }
}

const sameTarget = (f: { subjectRole: SubjectRole; entityRef?: string }, t: Target) =>
  f.subjectRole === t.subjectRole && (f.entityRef ?? null) === (t.entityRef ?? null);
/** שאלה ששאלה את הזוג «מי מכם?» מכסה את שני האנשים. */
const askCovers = (a: { subjectRole: SubjectRole; entityRef?: string }, t: Target) =>
  sameTarget(a, t) || (a.subjectRole === 'couple' && (t.subjectRole === 'client' || t.subjectRole === 'spouse') && !t.entityRef);

const KNOWN_DEFAULT: Record<Purpose, FactBasis[]> = {
  estimate: ['actual', 'actual_to_date', 'forecast', 'final', 'declared', 'derived'],
  annual: ['actual', 'final', 'declared', 'derived'],
  // הצהרת הון: עובדה נכונה ליום ההצהרה — מדווחת או בפועל
  wealth: ['actual', 'final', 'declared', 'derived'],
  // קליטה: עובדה נכונה ליום הקליטה — מדווחת או בפועל
  intake: ['actual', 'final', 'declared', 'derived'],
};

/** האם העובדה מכסה את כל השנה (לדוח) — סופי, שנה, או חודשים עד דצמבר. */
export function coversFullYear(f: YearFact, y: number): boolean {
  if (f.basis === 'final') return true;
  if (f.basis === 'actual_to_date' || f.basis === 'forecast') return false;
  if (f.periodKind === 'year' || f.periodKind === 'as_of' || f.periodKind === 'transaction' || f.periodKind === 'carry_forward') return true;
  return !!f.periodTo && f.periodTo >= `${y}-12-31`;
}

const monthName = (iso?: string) => {
  const m = iso ? Number(iso.slice(5, 7)) : 0;
  return ['', 'ינואר', 'פברואר', 'מרץ', 'אפריל', 'מאי', 'יוני', 'יולי', 'אוגוסט', 'ספטמבר', 'אוקטובר', 'נובמבר', 'דצמבר'][m] ?? '';
};

/** האם יש בכרטיס משהו לאשר לפריט. */
export function cardHas(item: InfoItem, c: Client, t: Target): boolean {
  if (!item.cardKeys?.length) return false;
  const src = t.subjectRole === 'spouse' ? (c.spouse as unknown as Record<string, unknown> | undefined) : (c as unknown as Record<string, unknown>);
  // מעסיקים ועסקים שייכים לאדם: לבן/בת הזוג — רק שלו/ה
  if (item.cardKeys.includes('employers'))
    return (c.employers ?? []).some(e => !!e.belongsToSpouse === (t.subjectRole === 'spouse'));
  if (item.cardKeys.includes('businesses')) return (c.businesses ?? []).some(b => !!b.belongsToSpouse === (t.subjectRole === 'spouse'));
  return item.cardKeys.some(k => {
    const v = (src ?? {})[k] ?? (t.subjectRole === 'couple' ? (c as unknown as Record<string, unknown>)[k] : undefined);
    // ‼ 0 אינו נתון: כרטיס נולד עם אפסים וכבויים («לא ידוע» ≠ «אין»)
    return Array.isArray(v) ? v.length > 0 : typeof v === 'number' ? v > 0 : v !== undefined && v !== null && v !== '' && v !== false;
  });
}

/** ‼ 16.10.2026 · המצב המשפחתי שהלקוח בחר בקליטה (מאושר או ממתין, האחרון) — כדי לשאול את שנת המצב שנבחר, לא של הכרטיס. */
function familyStatusAnswered(facts: YearFact[]): Client['familyStatus'] | undefined {
  const f = facts.filter(x => x.itemKey === 'intake.family' && (x.status === 'accepted' || x.status === 'pending') && x.answer === 'value' && typeof x.value === 'string')
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
  return f ? (f.value as Client['familyStatus']) : undefined;
}

/** מצב שאלת הפתיחה לאדם: מעובדות (מאושרות או ממתינות) ומהכרטיס. */
function screenerState(key: string, role: SubjectRole, c: Client, facts: YearFact[], y: number): 'yes' | 'no' | 'unknown' {
  const live = facts.filter(f => f.itemKey === key && f.subjectRole === role && (f.status === 'accepted' || f.status === 'pending'));
  const latest = live.sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
  if (latest) return latest.answer === 'value' && latest.value !== false ? 'yes' : 'no';
  const it = ITEMS.find(i => i.key === key);
  // רשימה בכרטיס (מעסיקים, עסקים) = מצב עדכני ⇒ «כן». סכום שנתי מהעבר (תרומות 2024) = רמז לאישור, לא «כן» לשנה הזו.
  if (it && (it.kind === 'confirm' || it.key === 'salary.worked') && cardHas(it, c, { subjectRole: role })) return 'yes';
  // שאלת פתיחה שהכרטיס עונה עליה דרך פריט האישור שלה (מעסיקים בכרטיס ⇒ «עובד כשכיר»)
  const cov = it?.coveredBy ? ITEM_BY_KEY[it.coveredBy] : undefined;
  if (cov && cardHas(cov, c, { subjectRole: role })) return 'yes';
  // ‼ 13.10.2026 · רשום בתיק כעוסק (סוג עוסק / מע״מ) — «עצמאי?» כבר ידוע; נשאלים רק פרטי העסק החסרים
  if (key === 'intake.selfEmployed' && dealerOf(c, role)) return 'yes';
  // שאלות פתיחה ש«כן» שלהן נגזר ישירות מרשימה בכרטיס
  if (key === 'rent.properties') return (c.properties ?? []).some(p => p.isRented) ? 'yes' : 'unknown';
  if (key === 'capital.accounts') return (c.investmentAccounts ?? []).length ? 'yes' : 'unknown';
  void y;
  return 'unknown';
}

// ── ישות זמנית ───────────────────────────────────────────────────────────────
// ‼ 12.10.2026 (גיא: «כן» בלי ישות קיימת צריך להוביל להשלמת הפרטים ולבקשת המסמכים, בלי להיתקע): הלקוח ענה
//   «כן» בשאלת פתיחה (עבד כשכיר, יש מקור בחו״ל, מפקיד לקופה, משכיר נכס…), ובתיק אין לאדם הזה אף ישות כזו.
//   עד עכשיו נוצרה רק «משימה למשרד». עכשיו נולדת ישות זמנית עם מזהה קבוע: נשאלים עליה הפרטים (onlyNew) והמסמך
//   (106 «מהמעסיק החדש»). כשהמשרד מוסיף אותה לתיק («הוסף לתיק»), הישות נכנסת לכרטיס **עם אותו מזהה** — וכך
//   התשובות והמסמך שכבר הועלו נשארים משויכים אליה, בלי שיוך מחדש ובלי לבקש שוב.
// ‼ עסק אינו כאן: הוא אינו במסלול ההצעות לתיק, ולכן «כן» לעסק בלי עסק בכרטיס = משימה למשרד (פתיחה בכרטיס).
export const PROVISIONAL: Partial<Record<InfoItem['per'], { prefix: string; label: string; subject: (role: SubjectRole) => SubjectRole }>> = {
  employer: { prefix: 'emp', label: 'המעסיק החדש', subject: r => r },
  property: { prefix: 'prop', label: 'הנכס החדש', subject: () => 'couple' },
  account: { prefix: 'inv', label: 'החשבון החדש', subject: () => 'couple' },
  foreign_source: { prefix: 'frn', label: 'המקור החדש בחו״ל', subject: () => 'couple' },
  fund: { prefix: 'fund', label: 'הקופה החדשה', subject: () => 'client' },
};
/** מזהה הישות הזמנית — הוא גם המזהה שהישות מקבלת בכרטיס כשהמשרד מוסיף אותה. */
export const provisionalRef = (per: InfoItem['per'], gateRole: SubjectRole, scope: string | number) =>
  `${PROVISIONAL[per]?.prefix ?? 'ent'}-new-${gateRole}-${scope}`;
export const isProvisionalRef = (ref?: string | null) => !!ref && /-new-(client|spouse|couple)-/.test(ref);
const provisionalScope = (purpose: Purpose, y: number) => (purpose === 'intake' ? 'intake' : String(y));
const gateRoleOfRef = (ref: string): SubjectRole => (ref.match(/-new-(client|spouse|couple)-/)?.[1] as SubjectRole) ?? 'client';

// ── החישוב ───────────────────────────────────────────────────────────────────

export function buildYearPicture(inp: PictureInput): YearPicture {
  const { client: c, taxYear: y, purpose, facts, evidence, asks, today } = inp;
  const opened = new Set(inp.openedRare ?? []);
  const statuses: ItemStatus[] = [];
  // ‼ מי שתואר/שחרור/יישוב לא נשאלו אצלו כי הכרטיס ריק או ישן — רק לו נשאלת household.creditChanges.
  const gatedByCard = new Map<SubjectRole, string[]>();
  const gate = (role: SubjectRole, what: string) => {
    const roles: SubjectRole[] = role === 'couple' ? ['client', ...(c.spouse ? ['spouse' as const] : [])] : [role];
    for (const r of roles) gatedByCard.set(r, [...(gatedByCard.get(r) ?? []), what]);
  };
  const GATED_LABEL: Record<string, string> = { 'household.degree': 'תואר', 'household.release': 'שחרור', 'household.settlement': 'יישוב' };
  const people: ('client' | 'spouse')[] = isMarried(c) ? ['client', 'spouse'] : ['client'];
  const scope = provisionalScope(purpose, y);

  /** יעדי הפריט: הישויות בכרטיס, ועוד ישות זמנית לכל מי שענה «כן» ואין לו ישות כזו בתיק. */
  function targetsWithProvisional(item: InfoItem): Target[] {
    const card = item.onlyNew ? [] : targetsFor(item, c, y, facts);
    const pv = PROVISIONAL[item.per];
    if (!pv || !item.after) return card;
    const after = ITEM_BY_KEY[item.after];
    const all = targetsFor(item, c, y, facts);
    const onCard = new Set(all.map(t => t.entityRef));
    const out = [...card];
    const add = (gateRole: SubjectRole) => {
      const ref = provisionalRef(item.per, gateRole, scope);
      if (onCard.has(ref) || out.some(t => t.entityRef === ref)) return; // כבר בכרטיס — יעד רגיל עם אותו מזהה
      const owner: 'client' | 'spouse' = gateRole === 'spouse' ? 'spouse' : 'client';
      out.push({ subjectRole: pv.subject(gateRole === 'couple' ? 'client' : gateRole), entityKind: item.per as EntityKind, entityRef: ref,
        entityLabel: `${pv.label}${gateRole === 'spouse' ? ` (${name(c, 'spouse')})` : ''}`, ownerRole: owner, provisional: true, gateRole });
    };
    if (after?.kind === 'screener') {
      const roles: SubjectRole[] = after.per === 'couple' ? ['couple'] : people;
      for (const r of roles) {
        // יש כבר ישות כזו לאדם (מעסיק — לפי בעלים; נכס/חשבון/מקור/קופה — של משק הבית) ⇒ אין ישות זמנית
        const has = all.some(t => (item.per === 'employer' ? t.ownerRole === (r === 'couple' ? 'client' : r) : true) && !isProvisionalRef(t.entityRef));
        if (!has && screenerState(item.after, r, c, facts, y) === 'yes') add(r);
      }
    }
    // ישות זמנית שכבר יש עליה שאלה, תשובה או מסמך — נשארת ביעדים גם כשהשער השתנה (כדי שהשאלה תסומן כלא רלוונטית)
    const refs = new Set<string>([
      ...asks.filter(a => a.itemKey === item.key && isProvisionalRef(a.entityRef)).map(a => a.entityRef!),
      ...facts.filter(f => f.itemKey === item.key && isProvisionalRef(f.entityRef)).map(f => f.entityRef!),
      ...(item.docKind ? evidence.filter(e => e.docKind === item.docKind && isProvisionalRef(e.entityRef)).map(e => e.entityRef!) : []),
    ]);
    for (const ref of refs) if (ref.endsWith(`-${scope}`)) add(gateRoleOfRef(ref));
    return out;
  }

  // ── 13.10.2026 · תחולה בזמן: נכסים וחשבונות מהתיק — רק מה שבוודאות בתקופה; «לא ידוע» נשאל בנפרד ──
  // ‼ קליטה מתארת את המצב היום — בלי סינון. דוח/הערכה — השנה (עד החתך); הצהרת הון — יום ההצהרה.
  const temporal = purpose === 'annual' || purpose === 'estimate' || purpose === 'wealth';
  const period = periodOfRequest(purpose, y, { cutoffMonth: inp.cutoffMonth, asOfDate: inp.asOfDate });
  const rels = {
    property: temporal ? entitiesInPeriod('property', c, period, facts, y, purpose as 'annual') : [],
    account: temporal ? entitiesInPeriod('account', c, period, facts, y, purpose as 'annual') : [],
  };
  const relOf = (kind: EntityKind | undefined, ref?: string): Relevance | null => {
    if (!temporal || !ref || (kind !== 'property' && kind !== 'account') || isProvisionalRef(ref)) return null;
    return rels[kind].find(e => e.ref === ref)?.rel ?? null;
  };
  /** התחולה לפי הכרטיס בלבד — כדי לדעת אם לשאול את שאלת התחולה (תשובה מפורשת לא נכנסת כאן). */
  const cardOnlyRel = (kind: 'property' | 'account', ref: string): Relevance => {
    const p = kind === 'property' ? (c.properties ?? []).find(x => x.id === ref) : undefined;
    const a = kind === 'account' ? (c.investmentAccounts ?? []).find(x => x.id === ref) : undefined;
    return entityRelevance(period, p ? propertySpan(p as never) : a ? accountSpan(a as never) : {}, null);
  };

  for (const item of ITEMS) {
    if (!item.purposes.includes(purpose)) continue;
    if (purpose === 'wealth' && item.declKind && item.declKind !== (inp.declKind ?? 'first')) continue;
    // ‼ הצהרת הון: רק עובדות «נכון ל-» יום ההצהרה הזה (שתי הצהרות באותה שנה — נפרדות)
    // ‼ קליטה: אותו כלל — «נכון ליום הקליטה» של הבקשה הזו
    const itemFacts = facts.filter(f => f.itemKey === item.key && ((purpose !== 'wealth' && purpose !== 'intake') || !inp.asOfDate || f.periodTo === inp.asOfDate));
    if (item.rare && !opened.has(item.key) && itemFacts.length === 0) continue;
    if (item.key.endsWith('.changesSince')) continue; // נוסף למטה, רק לתחום שידוע חלקית

    for (const t of targetsWithProvisional(item)) {
      const tf = itemFacts.filter(f => sameTarget(f, t));
      const tev = item.docKind
        ? evidence.filter(e => e.docKind === item.docKind && (e.taxYear == null || e.taxYear === y) && e.subjectRole === t.subjectRole && (e.entityRef ?? null) === (t.entityRef ?? null))
        : [];
      const ask = asks.find(a => a.itemKey === item.key && askCovers(a, t) && a.state !== 'cancelled' && a.state !== 'answered');
      // ‼ 13.10.2026 · תחולה: שאלת התחולה עצמה — רק לישות שהכרטיס לא יודע עליה (או שכבר נשאלה/נענתה).
      //   פריט שתלוי בישות — רק כשהישות בוודאות בתקופה; «לא ידוע» מחכה לתשובה, «מחוץ לתקופה» — לא חל.
      if (temporal && (t.entityKind === 'property' || t.entityKind === 'account') && t.entityRef && !isProvisionalRef(t.entityRef)) {
        if (isPeriodItem(item.key)) {
          if (cardOnlyRel(t.entityKind, t.entityRef) !== 'unknown' && tf.length === 0 && !ask) continue;
        } else {
          const r = relOf(t.entityKind, t.entityRef);
          if (r === 'out' && tf.length === 0 && !ask) continue;
          if (r === 'unknown' && tf.length === 0 && !ask) continue;
        }
      }
      const base = { ...t, item, area: item.area, facts: tf, evidence: tev, ask } as const;
      const push = (state: ItemState, detail: string, extra: Partial<ItemStatus> = {}) =>
        statuses.push({ ...base, state, detail, askable: item.who === 'client' && (state === 'missing' || state === 'fromCard' || state === 'partial'), ...extra });

      // 0. לא שואלים מה שהכרטיס כבר עונה: מעסיקים בכרטיס ⇒ אישור הרשימה, לא «עבדת כשכיר?»
      if (item.coveredBy && tf.length === 0 && !ask) {
        const cov = ITEMS.find(i => i.key === item.coveredBy);
        if (cov && cardHas(cov, c, t)) continue;
      }
      // ‼ 13.10.2026 · «האם עצמאי?» לא נשאל כשהתיק כבר יודע שהאדם רשום כעוסק (הפרטים החסרים — בפריט הפרטים)
      if (item.key === 'intake.selfEmployed' && tf.length === 0 && !ask && t.subjectRole !== 'couple'
        && dealerOf(c, t.subjectRole)) continue;
      if (item.onlyIfOnCard && tf.length === 0 && !ask && !cardHas(item, c, t)) { if (GATED_LABEL[item.key]) gate(t.subjectRole, GATED_LABEL[item.key]); continue; }
      if (item.onlyMarried && !isMarried(c)) continue;
      // פרטי עסק חדש — רק כשבכרטיס אין לאדם עסק (אחרת: אישור העסק שבכרטיס)
      if (item.noCardEntity === 'businesses' && tf.length === 0 && !ask && (c.businesses ?? []).some(b => !b.isClosed && !!b.belongsToSpouse === (t.subjectRole === 'spouse'))) continue;
      // תואר ושחרור מזכים בנקודות רק בשנים שאחרי הסיום/השחרור — מה שהסתיים מזמן לא נשאל
      if ((item.key === 'household.degree' || item.key === 'household.release') && tf.length === 0 && !ask) {
        const d = (t.subjectRole === 'spouse' ? c.spouse : c) as unknown as Record<string, number | undefined> | undefined;
        const yr = item.key === 'household.degree' ? d?.academicDegreeYear : (d?.idfReleaseYear || d?.nationalServiceYear);
        if (!yr || yr < y - 4) { gate(t.subjectRole, GATED_LABEL[item.key]); continue; }
      }
      if (item.key === 'household.creditChanges' && tf.length === 0 && !ask && !gatedByCard.has(t.subjectRole)) continue;
      // הוצאות השכרה רלוונטיות רק במסלול הרגיל (בפטור ובמסלול 10% אין ניכוי הוצאות)
      if (item.key === 'rent.expenses' && tf.length === 0 && !ask) {
        const tracks = (c.properties ?? []).filter(p => p.isRented).map(p => p.rentalTaxTrack ?? c.rentalTaxTrack);
        if (tracks.length > 0 && tracks.every(tr => tr && tr !== 'regular')) continue;
      }

      // ‼ 16.10.2026 · ממתי המצב המשפחתי — רק למצב הזה (תשובת הלקוח בקליטה, אחרת הכרטיס), ורק כשבכרטיס אין שנה.
      //   כשיש שנה — היא חלק מאישור «המצב המשפחתי» (cardLines). המקור: utils/familyStatusYear.ts
      if (item.familyYearFor && tf.length === 0 && !ask) {
        const status = familyStatusAnswered(facts) ?? c.familyStatus;
        if (status !== item.familyYearFor || familyStatusEventYear({ ...c, familyStatus: status })) continue;
      }

      // ‼ 16.10.2026 · פריסת דמי לידה — רק כשתקופת הזכאות של האדם חוצה את 31.12 של השנה הזו (או כשכבר נרשמה כאן החלטה)
      if (item.key === 'niBenefits.maternitySpread' && tf.length === 0 && !ask) {
        const per = maternityPeriodOf(facts, t.subjectRole);
        if (!per || !crossesYearEnd(per.from, per.to) || ![per.from, per.to].some(d => Number(d.slice(0, 4)) === y)) continue;
      }

      // 1. שאלת פתיחה שקודמת לפריט
      if (item.after) {
        const role: SubjectRole = t.ownerRole ?? (t.subjectRole === 'couple' ? 'client' : t.subjectRole);
        // ישות זמנית: השער הוא התשובה של מי שענה «כן» — לא של משק הבית
        const gate = t.gateRole ? screenerState(item.after, t.gateRole, c, facts, y)
          : screenerState(item.after, item.per === 'couple' || t.subjectRole === 'couple' ? 'couple' : role, c, facts, y);
        const gate2 = gate === 'unknown' && (t.subjectRole === 'couple') && !t.gateRole ? screenerState(item.after, 'client', c, facts, y) : gate;
        if (gate2 === 'no') { push('notApplicable', 'לפי שאלת הפתיחה — לא חל'); continue; }
        if (gate2 === 'unknown') continue; // מחכה לשאלת הפתיחה; לא נספר כחסר ולא נשאל לפניה
      }

      const known = item.knownBasis?.[purpose] ?? KNOWN_DEFAULT[purpose];
      const accepted = tf.filter(f => f.status === 'accepted');
      const pending = tf.filter(f => f.status === 'pending');

      // 2. תשובה ש«לא חל» / «לא» / «אפס» שאושרה — סוגרת
      const closing = accepted.find(f => f.answer !== 'value');
      if (closing) { push(closing.answer === 'zero' ? 'known' : 'notApplicable', closing.answer === 'zero' ? 'אושר: אפס' : closing.answer === 'no' ? 'אושר: לא' : 'אושר: לא רלוונטי'); continue; }

      // 3. ידוע
      const full = accepted.filter(f => known.includes(f.basis as never) && (purpose !== 'annual' || coversFullYear(f, y)));
      if (full.length) {
        // ממתינה שונה ממה שאושר = סתירה לבדיקה
        const p = pending.find(f => f.answer === 'value' && JSON.stringify(f.value) !== JSON.stringify(full[0].value) && f.clientAssertion !== 'unchanged');
        if (p) { push('pendingReview', 'תשובה חדשה סותרת מידע שאושר', { conflict: 'שונה ממה שאושר' }); continue; }
        if (pending.length) { push('pendingReview', 'ממתין לבדיקה'); continue; }
        push('known', describeKnown(full[0])); continue;
      }

      // 4. ממתין לבדיקה
      if (pending.length) {
        const card = cardHas(item, c, t);
        const p = pending[0];
        const conflict = p.clientAssertion === 'changed' && card ? 'הלקוח דיווח על שינוי ממה שבכרטיס' : undefined;
        push('pendingReview', p.clientAssertion === 'unchanged' ? 'הלקוח אישר שאין שינוי' : p.source === 'legacy_questionnaire' ? 'תשובה מהשאלון הקודם' : p.source === 'card_migration' ? 'הועבר מהכרטיס — לאשר שנה' : 'ממתין לבדיקה', { conflict });
        continue;
      }

      // 5. ידוע חלקית (עד החתך) — לדוח
      const partial = accepted.filter(f => known.includes(f.basis as never) || f.basis === 'actual_to_date' || f.basis === 'forecast');
      if (purpose === 'annual' && (partial.length || accepted.some(f => f.basis === 'actual_to_date'))) {
        const to = partial.map(f => f.periodTo).filter(Boolean).sort().pop();
        push('partial', `ידוע עד ${monthName(to) || 'החתך'} — להשלים ליתרת השנה`);
        continue;
      }

      // 6. מסמך
      if (item.kind === 'document') {
        const okDoc = tev.find(e => e.review === 'accepted');
        if (okDoc) { push('known', `${DOCS[item.docKind!].label} נבדק ואושר`); continue; }
        const rec = tev.find(e => e.review === 'needs_review');
        if (rec) { push('docReceived', `${DOCS[item.docKind!].label} התקבל — ${rec.identityMatch === 'mismatch' ? 'לא תואם ללקוח' : rec.periodMatch === 'mismatch' ? 'לא תואם לתקופה' : 'טרם נבדק'}`); continue; }
        // ‼ מסמך שאינו שייך לתקופה ושכבר אושר (בקליטה, בשנה אחרת, בהצהרה קודמת) — לא מבקשים שוב. אבל בהצהרת
        //   המשך, מסמך שנשאל אחרי «מה השתנה מאז» הוא על השינוי — חייב להיות חדש.
        const changeGated = purpose === 'wealth' && inp.declKind === 'followup' && !!item.after && !!ITEM_BY_KEY[item.after]?.followupQuestion;
        const prior = DOCS[item.docKind!].durable && !changeGated && !ask
          ? (inp.priorEvidence ?? []).filter(e => e.review === 'accepted' && e.docKind === item.docKind && e.subjectRole === t.subjectRole && (e.entityRef ?? null) === (t.entityRef ?? null))
            .sort((a, b) => String(b.reviewedAt ?? b.receivedAt).localeCompare(String(a.reviewedAt ?? a.receivedAt)))[0]
          : undefined;
        if (prior) { push('known', `${DOCS[item.docKind!].label} כבר בתיק — אושר ב-${fmt(String(prior.reviewedAt ?? prior.receivedAt).slice(0, 10))}${prior.taxYear && prior.taxYear !== y ? ` (${prior.taxYear})` : ''}; לא מבקשים שוב`, { reusedEvidence: prior }); continue; }
      }
      // סכום שהמשרד מזין ממסמך שהתקבל
      if (item.kind === 'amount' && item.who === 'office') {
        const docs = evidence.filter(e => (e.taxYear == null || e.taxYear === y) && (e.entityRef ?? null) === (t.entityRef ?? null) && e.review !== 'rejected');
        if (docs.length) { push('docReceived', 'יש מסמך — להזין ממנו את הסכומים ולאשר'); continue; }
      }

      // 7. כבר נשאל / סומן «אין עדיין»
      if (ask?.state === 'unavailable' && ask.unavailable) {
        const due = ask.unavailable.followUpOn <= today;
        // ‼ 13.10.2026 · «אין לי — צריך עזרה» אינו המתנה ללקוח: הכדור אצל המשרד, מיד ולא במועד התזכורת
        if (ask.unavailable.code === 'needHelp') { push('unavailable', `«${ask.unavailable.reason}» — הלקוח ביקש עזרה להשיג את המסמך; לטפל במשרד`, { requestableFrom: ask.unavailable.followUpOn }); continue; }
        push('unavailable', due ? `הגיע מועד התזכורת (${fmt(ask.unavailable.followUpOn)}) — לבדוק עם הלקוח אם המסמך כבר אצלו` : `«${ask.unavailable.reason}» — תזכורת משרד מ-${fmt(ask.unavailable.followUpOn)}`, { requestableFrom: ask.unavailable.followUpOn });
        continue;
      }
      if (ask) { push('asked', ask.state === 'draft' ? 'מוכן לשליחה' : 'נשלח ללקוח — ממתין לתשובה'); continue; }

      // 8. מסמך שעוד לא אמור להיות קיים
      if (purpose === 'wealth' && item.kind === 'document' && inp.asOfDate && today <= inp.asOfDate && item.docKind !== 'realEstateDocs' && item.docKind !== 'loanDocs' && item.docKind !== 'vehicleDocs' && item.docKind !== 'prevWealthDeclaration') {
        const from = addDay(inp.asOfDate);
        push('notYetAvailable', `אישור «נכון ליום ההצהרה» קיים רק אחריו — אפשר לבקש מ-${fmt(from)}`, { requestableFrom: from });
        continue;
      }
      if (item.kind === 'document' && item.docKind && !canRequestNow(item.docKind, y, today)) {
        const from = DOCS[item.docKind].availableFrom!(y);
        push('notYetAvailable', `${DOCS[item.docKind].why} — תזכורת משרד מ-${fmt(from)} (הערכה; המסמך יכול להגיע מוקדם או מאוחר)`, { requestableFrom: from });
        continue;
      }

      // 9. מהכרטיס — לאשר
      if (item.kind === 'confirm' || (item.kind === 'screener' && cardHas(item, c, t))) {
        // ‼ 13.10.2026 · רשימת נכסים/חשבונות לתקופה: רק מה שבוודאות בתקופה. אין כאלה (הכול «לא ידוע» או מחוץ
        //   לתקופה) ⇒ לא שואלים את הרשימה — התחולה נשאלת לכל ישות בנפרד, ומה שמחוץ לתקופה לא חל.
        const lk = temporal ? listKindOf(item.key) : undefined;
        if (lk && cardHas(item, c, t)) {
          const inRefs = rels[lk].filter(e => e.rel === 'in' && (lk !== 'property' || purpose === 'wealth' || (c.properties ?? []).find(p => p.id === e.ref)?.isRented)).map(e => e.ref);
          if (!inRefs.length) { push('notApplicable', 'אין ברשימה מה שבוודאות בתקופה — התחולה נשאלת לכל פריט בנפרד'); continue; }
          push('fromCard', 'ידוע מהכרטיס — לאשר שעדיין נכון', { lineRefs: inRefs }); continue;
        }
        if (cardHas(item, c, t)) { push('fromCard', 'ידוע מהכרטיס — לאשר שעדיין נכון'); continue; }
      }

      push('missing', item.who === 'office' ? 'להשלים במשרד' : 'חסר');
    }
  }

  // «כן» לשינוי שמזכה בהנחה, והכרטיס עדיין לא יודע ⇒ המשרד מעדכן את הכרטיס. אחרי העדכון הפריט
  // עצמו (תואר/שחרור/יישוב) עולה לאישור הרגיל, והפעולה נעלמת.
  for (const s of statuses) {
    if (s.item.key !== 'household.creditChanges' || !gatedByCard.has(s.subjectRole)) continue;
    const yes = s.facts.find(f => f.status === 'accepted' && f.answer === 'value' && f.value !== false);
    if (yes) s.officeAction = `הלקוח דיווח על שינוי (${gatedByCard.get(s.subjectRole)!.join(' / ')}) — לעדכן את הכרטיס ולבקש אישור או מסמך`;
  }

  // ‼ 12.10.2026: «כן» בשאלת פתיחה, ופריטי ההמשך הם לכל ישות בתיק (מעסיק, חשבון, מקור בחו״ל, קופה, נכס)
  //   — אבל בתיק אין אף ישות כזו לאדם הזה. עד עכשיו לא התבקש שום מסמך, ואיש לא ידע. המשרד מוסיף את
  //   הישות לתיק המס, ומשם בקשות המסמך לכל ישות עולות לבד (לשנה הזו).
  for (const s of statuses) {
    if (s.item.kind !== 'screener' || s.officeAction) continue;
    const yes = s.facts.find(f => f.status === 'accepted' && f.answer === 'value' && f.value !== false);
    if (!yes) continue;
    // ‼ ישות שיש לה מסלול זמני (מעסיק, נכס, חשבון, מקור בחו״ל, קופה) — נשאלת כבר כ«חדשה»; כאן רק מה שאין לו (עסק)
    const followers = ITEMS.filter(i => i.after === s.item.key && i.purposes.includes(purpose) && ENTITY_HE[i.per] && !PROVISIONAL[i.per] && !(i.rare && !opened.has(i.key)));
    const empty = followers.filter(i => !targetsFor(i, c, y, facts).some(t => t.subjectRole === s.subjectRole || t.subjectRole === 'couple' || s.subjectRole === 'couple'));
    if (empty.length === 0) continue;
    const kinds = [...new Set(empty.map(i => ENTITY_HE[i.per]!))];
    s.officeAction = `«כן», ובתיק אין ${kinds.join(' / ')} — להוסיף לתיק המס, ואז יתבקשו: ${empty.map(i => i.label).join(', ')}`;
  }

  // ── משימות משרד אחרי אישור: עדכון הכרטיס (קליטה), הוספת ישות זמנית לתיק ──
  // ‼ אישור התשובה אינו עדכון הכרטיס: הכרטיס משתנה רק דרך הצעה עם מקור והיסטוריה (או עריכה ידנית של המשרד,
  //   ואז «עודכן בתיק»). תשובה מאושרת שעוד לא נכנסה לכרטיס — משימה גלויה ב«להשלים במשרד», לא נעלמת.
  const latestAccepted = (s: ItemStatus) => s.facts.filter(f => f.status === 'accepted').sort((a, b) => (b.decidedAt ?? b.createdAt).localeCompare(a.decidedAt ?? a.createdAt))[0];
  const cardRec = c as unknown as Record<string, unknown>;
  for (const s of statuses) {
    if (s.officeAction) continue;
    const f = latestAccepted(s);
    if (!f) continue;
    const doneInCard = f.source === 'office' && !!f.value && typeof f.value === 'object' && (f.value as { cardUpdated?: boolean }).cardUpdated;
    if (doneInCard) continue;
    // ישות זמנית שאושרו עליה פרטים — להוסיף לתיק (עם אותו מזהה)
    if (s.provisional && s.item.onlyNew && f.answer === 'value' && s.entityRef) {
      s.officeAction = `${s.entityLabel}: «${String(typeof f.value === 'string' ? f.value : '')}» — להוסיף לתיק המס; התשובות והמסמך שכבר הועלו יישארו משויכים`;
      s.officeTask = { kind: 'addEntity', factId: f.id, entityRef: s.entityRef, text: typeof f.value === 'string' ? f.value : '' };
      continue;
    }
    if (purpose !== 'intake') continue;
    if (s.item.cardFlag && (f.answer === 'value' || f.answer === 'no')) {
      const yes = f.answer === 'value' && f.value !== false;
      const meta = (c.fieldMeta ?? {}) as Record<string, unknown>;
      // הכרטיס כבר אומר את אותו דבר (ונרשם שנבדק) — אין מה לעדכן. ‼ false בלי רישום = «לא ידוע», לא «אין».
      if (!!cardRec[s.item.cardFlag] === yes && (yes || meta[s.item.cardFlag])) continue;
      s.officeAction = `אושר: «${yes ? 'כן' : 'לא'}» — לעדכן בכרטיס`;
      s.officeTask = { kind: 'cardFlag', field: s.item.cardFlag, value: yes, factId: f.id };
      continue;
    }
    if (s.item.cardChoice && f.answer === 'value' && typeof f.value === 'string') {
      if (cardRec[s.item.cardChoice] === f.value) continue;
      s.officeAction = 'אושרה בחירה שונה ממה שבכרטיס — לעדכן בכרטיס';
      s.officeTask = { kind: 'cardChoice', field: s.item.cardChoice, value: f.value, factId: f.id };
      continue;
    }
    // ‼ 16.10.2026 · שנת הנישואין / הגירושין / הפטירה — הדרך הרגילה היא «אשר ועדכן בתיק» (recordToCard). אושרה בלי לעדכן ⇒
    //   משימה גלויה: «רשום שנה» בתיק המס; נעלמת כשהכרטיס אומר אותה שנה (או «עודכן בתיק»).
    if (s.item.familyYearFor && f.answer === 'value') {
      const field = FAMILY_STATUS_YEAR_KEY[s.item.familyYearFor]!;
      const yr = Number((f.value as { items?: { year?: unknown }[] } | null)?.items?.[0]?.year);
      if (Number.isInteger(yr) && yr > 0) {
        if (cardRec[field] === yr) continue;
        s.officeAction = `הלקוח מסר: ${s.item.label} ${yr} — לרשום בתיק המס: «משפחה ובן/בת זוג» ← «רשום שנה»`;
        s.officeTask = { kind: 'cardEdit', factId: f.id, text: `${s.item.label} ${yr}` };
        continue;
      }
    }
    // שינוי שתואר במילים (אישור «משהו השתנה», תשובה כשהכרטיס ריק, פרטי עסק חדש) — המשרד מעדכן בכרטיס
    const words = f.clientAssertion === 'changed' ? String((f.value as { note?: string })?.note ?? '')
      : (s.item.kind === 'confirm' || s.item.kind === 'detail') && typeof f.value === 'string' ? f.value : '';
    if (words) {
      s.officeAction = `הלקוח מסר: «${words}» — לעדכן בכרטיס, ואז «עודכן בתיק»`;
      s.officeTask = { kind: 'cardEdit', factId: f.id, text: words };
    }
  }
  // פריט שהמשרד בודק בעצמו ומסמן «בוצע» (יישור קו) — עד שסומן
  for (const s of statuses) if (s.item.who === 'office' && s.item.kind === 'screener' && purpose === 'intake' && s.state === 'missing') s.officeTask = { kind: 'officeCheck' };

  // «מה השתנה מאז» — שאלה אחת לתחום שיש בו מידע חלקי (עד החתך), במקום לחזור על השאלות
  if (purpose === 'annual') {
    const partialAreas = [...new Set(statuses.filter(s => s.state === 'partial').map(s => s.area))];
    for (const area of partialAreas) {
      const item = ITEMS.find(i => i.key === `${area}.changesSince`);
      if (!item) continue;
      const tf = facts.filter(f => f.itemKey === item.key && f.subjectRole === 'couple');
      const ask = asks.find(a => a.itemKey === item.key && a.state !== 'cancelled' && a.state !== 'answered');
      const accepted = tf.find(f => f.status === 'accepted');
      const pending = tf.find(f => f.status === 'pending');
      const since = statuses.filter(s => s.area === area && s.state === 'partial').flatMap(s => s.facts.map(f => f.periodTo)).filter(Boolean).sort().pop();
      const state: ItemState = accepted ? 'known' : pending ? 'pendingReview' : ask ? 'asked' : 'missing';
      statuses.push({ subjectRole: 'couple', item, area, state, detail: state === 'missing' ? `ידוע עד ${monthName(since) || 'החתך'} — לשאול מה השתנה מאז` : state === 'known' ? 'אושר' : state === 'asked' ? 'נשלח ללקוח' : 'ממתין לבדיקה', facts: tf, evidence: [], ask, askable: state === 'missing', entityLabel: monthName(since) });
    }
  }

  const counts = Object.fromEntries(
    (['known', 'partial', 'fromCard', 'pendingReview', 'docReceived', 'asked', 'unavailable', 'notYetAvailable', 'missing', 'notApplicable'] as ItemState[])
      .map(s => [s, statuses.filter(x => x.state === s).length]),
  ) as Record<ItemState, number>;

  return {
    purpose, taxYear: y, statuses,
    // אישור מהכרטיס כשבכרטיס אין כלום — נשאל רק כשיש לו שאלה מובנית (whenEmpty); אחרת «לא ידוע», לא «אין אצלנו פרטים»
    toAsk: statuses.filter(s => s.item.who === 'client' && s.state === 'missing' && (s.item.kind !== 'confirm' || !!s.item.whenEmpty)),
    toConfirm: statuses.filter(s => s.state === 'fromCard' && s.item.who === 'client'),
    toComplete: statuses.filter(s => s.state === 'partial' && s.item.who === 'client'),
    // מסמך שאושר ומחכה להזנת הסכומים ממנו — ראשון (המסמך כבר כאן)
    officeTodo: statuses.filter(s => !!s.officeAction || s.item.who === 'office' && (s.state === 'missing' || s.state === 'partial' || s.state === 'fromCard' || (s.state === 'docReceived' && s.item.kind !== 'document')))
      .sort((a, b) => Number(b.state === 'docReceived') - Number(a.state === 'docReceived')),
    toReview: statuses.filter(s => s.state === 'pendingReview' || (s.state === 'docReceived' && s.item.kind === 'document')),
    waiting: statuses.filter(s => s.state === 'asked' || s.state === 'unavailable'),
    // שאלה פתוחה על פריט שכבר «לא חל» (השער שונה) — לבטל
    stale: statuses.filter(s => s.state === 'notApplicable' && !!s.ask && ['draft', 'published', 'unavailable'].includes(s.ask.state)),
    counts,
  };
}

function describeKnown(f: YearFact): string {
  const src = f.source === 'portal' ? 'מהלקוח' : f.source === 'document' ? 'ממסמך' : f.source === 'card_migration' ? 'מהכרטיס' : f.source === 'legacy_questionnaire' ? 'מהשאלון' : 'מהמשרד';
  const basis = f.basis === 'final' ? 'סופי' : f.basis === 'forecast' ? 'תחזית' : f.basis === 'actual_to_date' ? `עד ${monthName(f.periodTo)}` : '';
  return ['אושר', src, basis].filter(Boolean).join(' · ');
}

const addDay = (iso: string) => { const d = new Date(iso + 'T00:00:00'); d.setDate(d.getDate() + 1); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const fmt = (iso: string) => `${iso.slice(8, 10)}.${iso.slice(5, 7)}.${iso.slice(0, 4)}`;

/** סדר התחומים במסך. */
export const AREA_ORDER: AreaId[] = AREAS.map(a => a.id);

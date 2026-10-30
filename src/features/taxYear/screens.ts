// ─── הדף האישי: מהשאלות למסכים (16.10.2026, «בקשה אחת לתיק המס» שלב 2) ─────────────────────────
// ‼ טהור. שאלה = שורה בשרת; מסך = מה שהלקוח רואה. כל אישורי הכרטיס («זה מה שידוע לנו») שעוד לא נענו מתקבצים
//   למסך אחד «מה שכבר ידוע לנו — נכון?»; «יש שינוי» בשורה פותח את השאלה שלה (עריכה מובנית) כמסך משלה.
// ‼ הסדר: אישורים → מסך הרשת → של מי / איפה ושאר השאלות → מסמכים (בהיכרות אין).

import type { InfoAsk } from './types';
import { ITEM_BY_KEY, CHECKLIST_LABEL, CHECKLIST_TITLE } from './catalog';
import { GRID_KEYS } from './asks';

/** 21.10.2026 · «לימודים וצבא» — מסך אחד לכל בני הבית, בסוף השאלות (flowDraft.ts › walkScreens). */
export const STUDIES_KEY = 'household.studies';

export type Screen =
  | { kind: 'confirmAll'; asks: InfoAsk[] }
  | { kind: 'ask'; ask: InfoAsk }
  /** 20.10.2026 · אותה שאלת בחירה לכמה אנשים («מה שולם מביטוח לאומי?» לכל אחד מבני הזוג) — מסך אחד, כרטיס לכל אדם. */
  | { kind: 'group'; asks: InfoAsk[] }
  /** 22.10.2026 · סבב 2.1: שאלות כן/לא שנפתחו מאותו נושא (חו״ל, מכירה, נכס מושכר, עסק) — מסך סימון אחד.  — הנושא. */
  | { kind: 'checklist'; asks: InfoAsk[]; parent: string };

// ‼ שאלות ההמשך של מסך הרשת («של מי / איפה», «מי מכם?») — מיד אחריו, לפני שאר השאלות (ילדים, חשבון בנק)
// ‼ 19.10.2026 · מסך רשת קטן בתוך ענף (למשל «מה קרה?» ⇒ «מה {בן/בת הזוג} קיבל/ה») — שאלת המשך, לא הרשת הראשית;
//   ובתוך שאלות שנפתחו יחד — לפי prompt.order (כך שהתאריך בא לפני «מה התקבל», והמסמכים בסוף).
// ‼ 22.10.2026 · ילדים וכתובת שאין בתיק — מיד אחרי «זה עדיין נכון?» (פרטי המשפחה יחד), לא אחרי כל הכסף
// ‼ 290 · מין ותאריך הלידה של בן/בת הזוג — גם הם עם פרטי המשפחה, מוקדם
const FAMILY_FIRST = ['household.children', 'household.address', 'household.spouseBasics'];
// ‼ 30.10.2026 · הערכת מס: הצפי של העסק — עם מסכי הריבועים של האדם (אחרי «מה מתאים לך», לפני «הכנסה נוספת»; prompt.order 0.5)
const FORECAST_KEY = 'business.forecastMonths';
const RANK = (a: InfoAsk) => (a.prompt.input.kind === 'confirm' || a.prompt.knownRow ? 0 : FAMILY_FIRST.includes(a.itemKey) ? 0.5 : a.itemKey === FORECAST_KEY ? 1 : a.prompt.input.kind === 'multi' && GRID_KEYS.includes(a.itemKey) ? 1
  : a.prompt.input.kind === 'file' ? 4 : (ITEM_BY_KEY[a.itemKey]?.after || a.prompt.input.kind === 'who' || a.prompt.input.kind === 'multi') ? 2 : 3);
export const sortAsks = (asks: InfoAsk[]) => [...asks].sort((a, b) => RANK(a) - RANK(b) || (a.prompt.order ?? 0) - (b.prompt.order ?? 0));

/**
 * המסכים. `opened` — אישורים שהלקוח סימן בהם «יש שינוי» (או שכבר נענו) — כל אחד מסך משלו, מיד אחרי מסך האישור.
 * שני אישורים ומעלה שעוד פתוחים ⇒ מסך אישור אחד; אישור יחיד נשאר מסך רגיל (אין מה לקבץ).
 */
export function buildScreens(asks: InfoAsk[], opened: ReadonlySet<string>, opts: { knownAll?: boolean } = {}): Screen[] {
  const list = groupSame(buildScreensRaw(asks, opened, opts));
  return opts.knownAll ? checklists(list) : list;
}

/** הנושא של שאלת כן/לא שאפשר לסמן ברשימה — או null. */
export const checklistParent = (a: InfoAsk): string | null => {
  const parent = ITEM_BY_KEY[a.itemKey]?.after;
  return a.prompt.input.kind === 'yesno' && parent && CHECKLIST_TITLE[parent] && CHECKLIST_LABEL[a.itemKey] ? parent : null;
};

/**
 * ‼ 22.10.2026 · שאלות כן/לא מאותו נושא ואותה ישות — מסך סימון אחד, במקום הראשונה שבהן.
 *   נכס אחד: מה ששייך לנכס («יש עוד בעלים») ומה ששייך לזוג («דמי מפתח») — אותו מסך; שתי ישויות — לא.
 *   רץ גם על הזרימה כולה (flowDraft › walkScreens): שאלה שנפתחה משורה ושאלה מהרשימה הראשית נפגשות.
 */
export function checklists(list: Screen[]): Screen[] {
  const out: Screen[] = [];
  const parentOf = (s: Screen) => (s.kind === 'checklist' ? s.parent : s.kind === 'ask' ? checklistParent(s.ask) : null);
  const refs = (l: InfoAsk[]) => new Set(l.map(y => y.entityRef ?? '').filter(Boolean));
  for (const s of list) {
    const parent = parentOf(s);
    if (!parent) { out.push(s); continue; }
    const mine = screenAsks(s);
    const near = out.filter(o => parentOf(o) === parent && screenAsks(o)[0].subjectRole === mine[0].subjectRole);
    const same = near.find(o => { const r = refs(screenAsks(o)), m = refs(mine); return r.size === m.size && [...m].every(x => r.has(x)); });
    const tgt = same ?? (near.length === 1 && new Set([...refs(screenAsks(near[0])), ...refs(mine)]).size <= 1 ? near[0] : undefined);
    if (tgt) { out[out.indexOf(tgt)] = { kind: 'checklist', parent, asks: [...screenAsks(tgt), ...mine] }; continue; }
    out.push(s);
  }
  // שאלה אחת בלבד — נשארת מסך כן/לא רגיל
  return out.map(s => (s.kind === 'checklist' && s.asks.length === 1 ? { kind: 'ask' as const, ask: s.asks[0] } : s));
}

/** מסכים רצופים של אותה שאלת בחירה (לא מסך הרשת) לאנשים שונים — מסך אחד. */
function groupSame(list: Screen[]): Screen[] {
  const out: Screen[] = [];
  for (const s of list) {
    const prev = out[out.length - 1];
    const groupable = (x: Screen | undefined): x is Extract<Screen, { kind: 'ask' } | { kind: 'group' }> => !!x && x.kind !== 'confirmAll'
      && screenAsks(x).every(a => (a.prompt.input.kind === 'multi' && !GRID_KEYS.includes(a.itemKey)) || a.itemKey === STUDIES_KEY);
    if (groupable(s) && groupable(prev) && screenAsks(prev)[0].itemKey === screenAsks(s)[0].itemKey) {
      out[out.length - 1] = { kind: 'group', asks: [...screenAsks(prev), ...screenAsks(s)] };
      continue;
    }
    out.push(s);
  }
  return out;
}

function buildScreensRaw(asks: InfoAsk[], opened: ReadonlySet<string>, opts: { knownAll?: boolean }): Screen[] {
  const sorted = sortAsks(asks);
  // ‼ 21.10.2026 · סבב 2 (השאלון השנתי, knownAll): גם שורה ממולאת מהכרטיס (חשבון להחזר) בתוך «זה עדיין נכון?», וגם שורה אחת היא מסך כזה
  const confirms = sorted.filter(a => a.prompt.input.kind === 'confirm' || (opts.knownAll && a.prompt.knownRow));
  const grouped = confirms.filter(a => a.state === 'published' && !opened.has(a.id));
  if (grouped.length < (opts.knownAll ? 1 : 2)) return sorted.map(a => ({ kind: 'ask', ask: a }));
  // ‼ השורות שסומנו «יש שינוי» — מיד אחרי מסך האישור (לא במקומן הממוין), כדי שהתיקון יבוא ברצף
  const openedList = confirms.filter(a => a.state === 'published' && opened.has(a.id));
  const out: Screen[] = [];
  let placed = false;
  for (const a of sorted) {
    if (grouped.includes(a) || openedList.includes(a)) {
      if (!placed) { out.push({ kind: 'confirmAll', asks: grouped }, ...openedList.map(ask => ({ kind: 'ask' as const, ask }))); placed = true; }
      continue;
    }
    out.push({ kind: 'ask', ask: a });
  }
  return out;
}

/** המסך הראשון שעוד לא נענה (חזרה אחרי «שמירה ויציאה»). -1 = הכול נענה. */
export function firstOpenScreen(screens: Screen[]): number {
  return screens.findIndex(s => screenAsks(s).some(a => a.state === 'published'));
}

export const screenAsks = (s: Screen): InfoAsk[] => (s.kind === 'ask' ? [s.ask] : s.asks);

// ── 27.10.2026 · הצהרת הון בפרקים (docs/proposals/2026-10-27-wealth-declaration.html) ─────────────────────────────
// ‼ המשפחה · מה יש לכם · רמת חיים · מה נכנס — הסדר והצבע של כל פרק (כמו בדוח השנתי). רק כשכל השאלות של הצהרת הון.
export type WealthPart = 'family' | 'have' | 'living' | 'flows';
export const WEALTH_PARTS: { id: WealthPart; label: string }[] = [
  { id: 'family', label: 'המשפחה' }, { id: 'have', label: 'מה יש לכם' }, { id: 'living', label: 'רמת חיים' }, { id: 'flows', label: 'מה נכנס' },
];
export const isWealthQuestionnaire = (asks: InfoAsk[]) => asks.length > 0 && asks.some(a => a.itemKey.startsWith('wealth.'))
  && asks.every(a => a.itemKey.startsWith('wealth.') || a.itemKey.startsWith('household.'));
export function wealthPartOf(s: Screen): WealthPart {
  const k = screenAsks(s)[0]?.itemKey ?? '';
  if (s.kind === 'confirmAll' || k.startsWith('household.') || k === 'wealth.household') return 'family';
  if (k === 'wealth.since.living') return 'living';
  if (k === 'wealth.since.sources' || k === 'wealth.since.uses') return 'flows';
  return 'have';
}
/** המסכים לפי הפרקים (יציב בתוך כל פרק); שאלון אחר — כמו שהוא. */
export function orderScreens(asks: InfoAsk[], opened: ReadonlySet<string>): Screen[] {
  const sc = buildScreens(asks, opened);
  if (!isWealthQuestionnaire(asks)) return sc;
  const rank = (s: Screen) => WEALTH_PARTS.findIndex(p => p.id === wealthPartOf(s));
  return sc.map((s, i) => ({ s, i })).sort((a, b) => rank(a.s) - rank(b.s) || a.i - b.i).map(x => x.s);
}

// ─── «ספרייה» — מה מוצג בשורה, חיפוש ומיון (3.10.2026, סבב 3 §4) ─────────────
// ‼ טהור: בלי React ובלי שרת, כדי שהבדיקות ינעלו את מה שמשתמש רואה.
//   · רשימה אחת לפי א״ב — בקשות של המשרד ונוסחים מוכנים יחד. «נוסח מוכן» הוא
//     סימון שקט, לא קבוצה נפרדת.
//   · כל בקשה פעם אחת (4.10.2026): נוסח מוכן מסוג קבוע («מסמכים מהלקוח», «פרטי
//     הרו״ח הקודם») הוא גם בקשת המערכת שהקליטה פותחת — «בשימוש ב» שלו סופר גם את
//     הפריט מאותו סוג במסלול הקליטה, והוא לא מופיע שוב בקטע הקליטה.

import { matchesPreset, isSeedTemplate, type RequestTemplate } from '../../../../lib/requestTemplates';
import {
  metaFor, CATALOG_STEP_TYPES, SYSTEM_DEPENDS_ON, CLIENT_KIND_LABELS, CLIENT_KIND_ORDER, type ClientKind,
} from '../../../../types/journeyDefaults';
import { libraryEntryGap, REPEATABLE_STEP_TYPES } from '../../../../features/flows/compile';
import { systemGate, systemName } from '../../../../features/flows/preview';
import { DELIVERY_LABELS, type Delivery } from '../../../../features/flows/types';
import { templateEntryOwner } from '../../../../utils/templateEntryOwner';

export const entryOf = (t: RequestTemplate) => t.entries[0];

/**
 * בקשת המערכת שהשורה בספרייה עומדת לה: נוסח מוכן מסוג קבוע, או העותק של המשרד
 * שלו (אותו seed_key). ‼ זו השורה שבה «מסמכים מהלקוח» מופיעה — עם «בשימוש ב: קליטת
 * לקוח חדש ← פתיחת התיק» — ולכן הקליטה לא מציגה אותה שוב. בקשה מאותו סוג בלי
 * seed_key (נשמרה מבקשה של לקוח) — לא: הפריט בקליטה אינו שלה.
 */
export function systemTypeOf(t: RequestTemplate): string | null {
  const st = entryOf(t)?.stepType;
  return st && st !== 'custom_request' && t.seedKey === st ? st : null;
}

/**
 * סוגים קבועים שהכרטיס קורא מהספרייה — «＋ בקשה חדשה»: «מסמכים מהלקוח» ממלאת מראש
 * את הרשימה מהשורה כאן, ו«עדכון סטטוס מס» את הנוסח (AddRequestDialog · seedPayload).
 */
const CARD_READS = ['client_documents', 'intake_questionnaire'];

/**
 * ‼ שורה שהנוסח שלה בספרייה לא מגיע לאף לקוח: סוג קבוע של הקליטה שהכרטיס לא קורא
 * ושלא חוזר במסלול (למשל «פרטי הרו״ח הקודם» — בקליטה הנוסח הוא של הפריט במסלול
 * הקליטה, ובכרטיס «חומרים מרו״ח קודם» בנוסח קבוע). «עריכה» שלה נוחתת על הפריט
 * במסלול הקליטה — שם מגדירים מה לקוח חדש מקבל.
 */
export function editsInIntake(t: RequestTemplate): boolean {
  const st = entryOf(t)?.stepType || 'custom_request';
  return CATALOG_STEP_TYPES.includes(st) && !REPEATABLE_STEP_TYPES.includes(st) && !CARD_READS.includes(st);
}
/**
 * מי יבצע בפועל בקשה שנוצרת מהרשומה — אותו כלל כמו בשרת (_template_entry_owner): בעלים
 * «המשרד» בלי «משימה של המשרד» מפורשת, על בקשה עם פריטים ללקוח, נוצר כבקשה ללקוח.
 */
export const ownerOf = (t: RequestTemplate) => templateEntryOwner(entryOf(t));
export const payloadOf = (t: RequestTemplate) => (entryOf(t)?.payload ?? {}) as Record<string, unknown>;

export function listOf(p: Record<string, unknown>): { key?: string; label?: string; kind?: string }[] {
  const l = Array.isArray(p.requirements) ? p.requirements : Array.isArray(p.checklist) ? p.checklist : [];
  return l as { key?: string; label?: string; kind?: string }[];
}

export function clientTitleOf(t: RequestTemplate): string {
  const p = payloadOf(t);
  const e = entryOf(t);
  return String(p.clientTitle ?? p.title ?? (e && e.stepType !== 'custom_request' ? metaFor(e.stepType).name : '') ?? '');
}

/** בקשה שהשרת לא ייצור — אותו כלל כמו בבונה המסלולים (libraryEntryGap). */
export function gapText(t: RequestTemplate): string | null {
  const e = entryOf(t);
  const gap = e ? libraryEntryGap(e.stepType || 'custom_request', templateEntryOwner(e), e.payload) : null;
  return gap === 'no_items' ? 'אין בבקשה מה למלא — היא לא תיפתח ללקוח עד שמוסיפים פריטים'
    : gap === 'no_documents' ? 'אין רשימת מסמכים — במסלול שנתי או ידני היא לא תיפתח עד שמוסיפים מסמכים'
    : null;
}

/**
 * אפשר לשבץ במסלול: בקשה חופשית בכל מסלול, ובמסלול שחוזר גם מה שחוזר
 * (REPEATABLE_STEP_TYPES — אותו כלל כמו ההוספה לשלב). סוג «אחד ללקוח» (פרטי
 * הרו״ח הקודם, שאלון…) נשלח רק מכרטיס הלקוח — בקליטה המערכת פותחת אותו לבד.
 */
export function canBeInFlow(t: RequestTemplate): boolean {
  const st = entryOf(t)?.stepType || 'custom_request';
  return st === 'custom_request' || REPEATABLE_STEP_TYPES.includes(st);
}

/** «נוסח מוכן»: מובנית שלא נערכה, או עותק של המשרד שזהה לה. */
export const isPreset = (t: RequestTemplate) => isSeedTemplate(t) || matchesPreset(t);
/** יש לאן לחזור: עותק של המשרד שנערך, והנוסח המוכן שלו קיים. */
export const canRevertToPreset = (t: RequestTemplate) => !isSeedTemplate(t) && !!t.preset && !matchesPreset(t);

const joinHe = (words: string[]) =>
  words.length <= 1 ? (words[0] ?? '') : `${words.slice(0, -1).join(', ')} ו${words[words.length - 1]}`;

/**
 * לאילו סוגי לקוח — הרשימה הקצרה מבין השתיים: «רק לחברה», «לא להחזר מס». כל הסוגים
 * (או אף אחד) — ריק. ‼ כך שתי שורות באותו שם מ-216 (בקשה שהייתה שונה לפי סוג לקוח)
 * נבדלות ב«בשימוש ב».
 */
export function kindsNote(kinds: readonly ClientKind[]): string {
  if (!kinds.length || kinds.length >= CLIENT_KIND_ORDER.length) return '';
  const excluded = CLIENT_KIND_ORDER.filter(k => !kinds.includes(k));
  return excluded.length < kinds.length
    ? excluded.map((k, i) => `${i ? 'ולא ' : 'לא '}ל${CLIENT_KIND_LABELS[k]}`).join(' ')
    : `רק ל${joinHe(kinds.map(k => CLIENT_KIND_LABELS[k]))}`;
}

/**
 * מי עושה ומה — במילים של הלקוח: «הלקוח מעלה ומאשר · 3 פריטים».
 * ‼ משימה של המשרד לא מופיעה אצל הלקוח — אומרים את זה במקום «הלקוח רואה».
 */
export function actorText(t: RequestTemplate): string {
  const e = entryOf(t);
  const owner = ownerOf(t);
  if (owner === 'me') return 'משימה למשרד — הלקוח לא רואה אותה';
  if (owner === 'external') return 'גורם חיצוני';
  const stepType = e?.stepType || 'custom_request';
  const items = listOf(payloadOf(t));
  const n = items.length;
  if (stepType === 'client_documents') {
    // הכותרת ללקוח נגזרת מהרשימה («להעלות 2 מסמכים») — מה שמעניין כאן הוא אילו.
    const labels = items.map(x => String(x.label ?? '').trim()).filter(Boolean);
    if (!labels.length) return 'הלקוח מעלה';
    const shown = labels.slice(0, 3).join(', ');
    return `הלקוח מעלה: ${shown}${labels.length > 3 ? ` ועוד ${labels.length - 3}` : ''}`;
  }
  if (stepType !== 'custom_request') return metaFor(stepType).owner;
  const kinds = new Set(items.map(x => String(x.kind ?? '')));
  const verbs: string[] = [];
  if (kinds.has('file') || kinds.has('files')) verbs.push('מעלה');
  if ([...kinds].some(k => k && !['file', 'files', 'confirm'].includes(k))) verbs.push('ממלא');
  if (kinds.has('confirm') || kinds.has('')) verbs.push('מאשר');
  const base = verbs.length ? `הלקוח ${joinHe(verbs)}` : 'הלקוח';
  // רווח קשיח משני צידי הנקודה — שבירת שורה לא משאירה «·» בקצה.
  return n > 1 ? `${base}\u00A0·\u00A0${n} פריטים` : base;
}

/** מה הלקוח רואה בדף — או שהוא לא רואה כלום (משימה של המשרד). */
export function seesText(t: RequestTemplate): string | null {
  const e = entryOf(t);
  if (ownerOf(t) === 'me') return null;
  // בקשת מסמכים: הכותרת נגזרת מהרשימה, ו«מי עושה» כבר אומר אילו מסמכים.
  if (e?.stepType && metaFor(e.stepType).derivedCopy) return null;
  return `הלקוח רואה: ${clientTitleOf(t) || t.name}`;
}

// ─── חיפוש ───────────────────────────────────────────────────────────────────

/**
 * ‼ «רו״ח», «רו"ח» ו«רוח» — אותו דבר למי שמקליד. מורידים גרש/גרשיים/מרכאות
 * וניקוד, ומאחדים רווחים.
 */
export function normalizeForSearch(s: string): string {
  return s
    .replace(/[֑-ׇ]/g, '')
    .replace(/["'״׳`«»“”„]/g, '')
    .replace(/[-–—־]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

export function searchTextOf(t: RequestTemplate): string {
  const p = payloadOf(t);
  return normalizeForSearch([
    t.name, clientTitleOf(t), String(p.clientSub ?? ''), ...listOf(p).map(x => String(x.label ?? '')),
  ].join(' '));
}

/** כל מילה בחיפוש צריכה להופיע — בשם, במה שהלקוח רואה או בפריטים. */
export function matchesQuery(haystack: string, query: string): boolean {
  const words = normalizeForSearch(query).split(' ').filter(Boolean);
  return words.every(w => haystack.includes(w));
}

// ─── מיון וקיבוץ לפי אות ─────────────────────────────────────────────────────

const collator = new Intl.Collator('he', { sensitivity: 'base', numeric: true });
const FINALS: Record<string, string> = { ך: 'כ', ם: 'מ', ן: 'נ', ף: 'פ', ץ: 'צ' };
const LETTER = /[א-תA-Za-z0-9]/;

/** המפתח למיון: בלי מרכאות/סימנים בתחילת השם — אחרת «‎«אישור…» נופל לקבוצה משלו. */
const sortKey = (name: string) => {
  const i = name.search(LETTER);
  return i < 0 ? name : name.slice(i);
};

export function firstLetter(name: string): string {
  const m = name.match(LETTER);
  if (!m) return '#';
  const c = m[0];
  if (/[א-ת]/.test(c)) return FINALS[c] ?? c;
  return /[0-9]/.test(c) ? '#' : c.toUpperCase();
}

export function sortByName<T extends { name: string }>(list: T[]): T[] {
  return [...list].sort((a, b) => collator.compare(sortKey(a.name), sortKey(b.name)) || a.name.localeCompare(b.name));
}

export interface LetterGroup<T> { letter: string; items: T[] }

/** רצף ממוין ⇒ קבוצות לפי האות הראשונה, בסדר המיון. */
export function groupByLetter<T extends { name: string }>(sorted: T[]): LetterGroup<T>[] {
  const out: LetterGroup<T>[] = [];
  for (const t of sorted) {
    const l = firstLetter(t.name);
    const last = out[out.length - 1];
    const same = out.find(g => g.letter === l);
    if (last && last.letter === l) last.items.push(t);
    else if (same) same.items.push(t);
    else out.push({ letter: l, items: [t] });
  }
  return out;
}

/** מכמה שורות מציגים כותרת אות — רשימה קצרה לא צריכה אינדקס. */
export const GROUP_FROM = 12;

// ─── נפתחות אוטומטית בקליטה ──────────────────────────────────────────────────

/**
 * השם בקטע «נפתחות אוטומטית בקליטה» — אותו שם כמו בפריט במסלול הקליטה (systemName).
 * ‼ (4.10.2026) בלי שם תיאורי נפרד: סוג שיש לו שורה בספרייה (systemTypeOf) לא מופיע
 * בקטע בכלל, ולכן אין מה להבדיל.
 */
export const autoLabel = (stepType: string) => systemName(stepType);

/**
 * מתי נפתחת — השער הקבוע מהמחולל (systemGate, אותו כלל שהשרת אוכף), הסדר
 * הקבוע (SYSTEM_DEPENDS_ON), והגבלת סוג הלקוח מהפריט במסלול הקליטה.
 */
export function autoWhenText(stepType: string, kinds: ClientKind[] | null): string {
  const parts: string[] = [];
  if (stepType === 'representation') parts.push('כשההצעה כוללת ייצוג — לפי ההיקף שבהצעה');
  else if (stepType === 'client_documents') parts.push('לכל לקוח חדש — הרשימה לפי מצב הלקוח');
  else parts.push(systemGate(stepType, {}).rule ?? 'לכל לקוח חדש');
  const dep = SYSTEM_DEPENDS_ON[stepType];
  if (dep) parts.push(`אחרי «${systemName(dep)}»`);
  // ‼ הרשימה הקצרה מבין השתיים: «לא להחזר מס» ולא «רק לעוסק פטור, עוסק מורשה, חברה וייצוג בלבד».
  // סוג שהשער עצמו כבר אומר («פייפרלס, ולעוסק מורשה או חברה») — לא חוזרים עליו.
  if (kinds && !kinds.every(k => parts[0].includes(CLIENT_KIND_LABELS[k]))) {
    const note = kindsNote(kinds);
    if (note) parts.push(note);
  }
  return parts.join(' · ');
}

/**
 * מה קורה ללקוח כשהמערכת פותחת אותן — «איך מגיע ללקוח» של השלב שבו הן יושבות
 * (DELIVERY_LABELS, בלי ניסוח חדש). ‼ «לבד» לבד נקרא כמו «נשלח ללקוח אוטומטית».
 */
export function autoHintText(delivery: Delivery | null): string {
  const base = 'נוצרות לבד כשלקוח מאשר הצעת מחיר';
  if (!delivery) return `${base}. מגדירים במסלול הקליטה.`;
  const d = DELIVERY_LABELS[delivery];
  return `${base} · ${d.short} — ${d.mail}.`;
}

/**
 * הספירה בכותרת הקטע. ‼ (4.10.2026) הקטע מונה רק מה שנפתח בפועל — מה שלא במסלול
 * הקליטה מקופל לשורה אחת בסופו («ועוד 7 שלא במסלול הקליטה»), כי «נפתחות אוטומטית»
 * מעל שבע שורות של «לא נפתחת» סתר את עצמו. בחיפוש — כמה מתאימות מתוך הכול.
 */
export function autoCountText(c: { shown: number; total: number; inFlow: number; searching: boolean; known: boolean }): string {
  if (c.searching) return c.shown === c.total ? String(c.total) : `${c.shown} מתוך ${c.total}`;
  return String(c.known ? c.inFlow : c.total);
}

/** השורה המקופלת בסוף הקטע — מה שלא במסלול הקליטה, עם הקישור להוספה. */
export const autoOffText = (n: number) => (n === 1 ? 'ועוד אחת שלא במסלול הקליטה' : `ועוד ${n} שלא במסלול הקליטה`);

/**
 * שורת התוצאה בחיפוש כשאין בקשה כזו ברשימה. ‼ סופרים רק מה שנפתח באמת — «יש 4 שנפתחות»
 * כשאף אחת מהן לא במסלול הקליטה היה הבטחה שקרית.
 */
export function autoResultText(open: number, off: number): string | null {
  if (open > 0) {
    const head = open === 1 ? 'יש אחת שנפתחת אוטומטית בקליטה' : `יש ${open} שנפתחות אוטומטית בקליטה`;
    return `אין בקשה כזו ברשימה — ${head}${off > 0 ? ` · ${off === 1 ? 'ועוד אחת' : `ועוד ${off}`} שלא במסלול הקליטה` : ''}.`;
  }
  if (off > 0) {
    return `אין בקשה כזו ברשימה — ${off === 1 ? 'יש אחת' : `יש ${off}`} שאפשר להוסיף למסלול הקליטה.`;
  }
  return null;
}

/** «N בקשות לא ייפתחו כמו שהן» — מעל רשימה ארוכה, כדי שלא יימצאו רק בגלילה. */
export const gapsLineText = (n: number) => (n === 1 ? 'בקשה אחת לא תיפתח כמו שהיא' : `${n} בקשות לא ייפתחו כמו שהן`);

// ─── מסלול הלימוד של נושא — מהשאלה «מה זה» ועד «מה עושים בתיק» (14.10.2026) ─────────────────────
// ‼ גיא (14.10): הלמידה צריכה להיות מעשית — מה זה, מתי רלוונטי, מה מבקשים מהלקוח, איך קוראים את המסמכים,
//   מה מזינים, איך מתקבל החישוב, חריגים, ומה עושים אחר כך. התוכן כבר קיים בגופי הנושאים; כאן רק הסדר:
//   כל סעיף (Sec) משויך לשלב, ו«מה מבקשים מהלקוח» נגזר משאלון האיסוף האמיתי (catalog.ts) — לא טקסט נפרד שיתיישן.
// ‼ טהור — נבדק ב-node.

import { AREAS, ITEMS, type AreaId } from '../taxYear/catalog';
import { DOCS } from '../taxYear/documents';
import type { TocItem } from './topics/shared';
import type { Basis } from '../taxRules/types';

export type Stage = 'what' | 'ask' | 'read' | 'calc' | 'except' | 'next' | 'practice' | 'sources';

export const STAGES: { id: Stage; label: string; hint: string }[] = [
  { id: 'what', label: 'מה זה ומתי חל', hint: 'בקצרה, המושגים, ולמי זה רלוונטי' },
  { id: 'ask', label: 'מה מבקשים מהלקוח', hint: 'השאלות והמסמכים — כפי שהם יוצאים בשאלון' },
  { id: 'read', label: 'מסמכים ומה מזינים', hint: 'איך קוראים את המסמך ולאיזה שדה זה הולך' },
  { id: 'calc', label: 'איך מחשבים', hint: 'המנגנון, מחשבון ודוגמאות פתורות' },
  { id: 'except', label: 'חריגים ושאלות פתוחות', hint: 'מה שובר את הכלל, ומה עוד לא הוכרע מקצועית' },
  { id: 'next', label: 'מה עושים בתיק', hint: 'הצעדים בתיק הלקוח — גם ביד, בלי המערכת' },
  { id: 'practice', label: 'תרגול', hint: 'שאלות קצרות לבדיקה עצמית' },
  { id: 'sources', label: 'מקורות', hint: 'מאיפה כל ערך, ומה הביסוס שלו' },
];
/** השלבים שיש בהם תוכן לנושא — גיא (15.10): לא כופים שמונה שלבים. «מה זה» ו«מקורות» תמיד. */
export function visibleStages(x: { counts: Partial<Record<Stage, number>>; asks: number; gaps: number; nextExtras: boolean }) {
  const n = (k: Stage) => x.counts[k] ?? 0;
  const has: Record<Stage, boolean> = {
    what: true, ask: x.asks > 0 || n('ask') > 0, read: n('read') > 0, calc: n('calc') > 0,
    except: n('except') > 0 || x.gaps > 0, next: n('next') > 0 || x.nextExtras, practice: n('practice') > 0, sources: true,
  };
  return STAGES.filter(s => has[s.id]);
}

export const STAGE_LABEL = Object.fromEntries(STAGES.map(s => [s.id, s.label])) as Record<Stage, string>;

// ‼ שיוך מפורש רק כשהכותרת לא מספיקה. השאר — לפי הכותרת (stageOfSection).
const OVERRIDE: Record<string, Stage> = {
  'ar-flow': 'what', 'ar-annex': 'read', 'ar-docs': 'read', 'ar-code': 'read',
  'wd-2': 'what', 'wd-3': 'read', 'wd-fields': 'read', 'wd-4': 'read', 'wd-q': 'ask',
  'f6-struct': 'read', 'f6-dict': 'read',
  'mb-to': 'read', 'mb-5': 'read',
  'ad-5': 'ask', 'ad-open': 'except',
};

/** לאיזה שלב שייך סעיף בנושא. */
export function stageOfSection(t: TocItem): Stage {
  if (OVERRIDE[t.id]) return OVERRIDE[t.id];
  const l = t.label;
  if (/תרגול/.test(l)) return 'practice';
  if (/טעויות|חריגים|חריגה|צינון|מה פתוח|מה לא מחושב|מה ידוע ומה לא/.test(l)) return 'except';
  if (/מושגי יסוד|^מה זה|מי חייב|מי זכאי/.test(l)) return 'what';
  if (t.view === 'apply') return 'next';
  return 'calc';
}

// ‼ התחומים בשאלון שהנושא נשען עליהם — «מה מבקשים מהלקוח» בדיוק כמו שהשאלון שולח.
const TOPIC_AREAS: Record<string, AreaId[]> = {
  annualReturn: ['salary', 'business', 'capital', 'rent', 'savings', 'donations', 'household', 'filing'],
  pensionSE: ['savings'], studyFund: ['savings'], mandatoryPension: ['savings', 'business'],
  niSelfEmployed: ['business', 'niBenefits', 'payments'], advances: ['payments', 'business'],
  microBusiness: ['business'], form6111: ['business'],
  wealth: ['wRealEstate', 'wBank', 'wSecurities', 'wFunds', 'wVehicles', 'wLiabilities', 'wBusiness'],
};

export interface ClientAsk { key: string; label: string; question?: string; doc?: string; byOffice: boolean; rare: boolean }
export interface ClientAskArea { id: AreaId; title: string; parts1301: string[]; annexes: string[]; asks: ClientAsk[] }

// ‼ בשאלון האמיתי השדות האלה מתמלאים לכל לקוח (asks.ts). כאן — דוגמה כללית, כדי שלא יוצגו סוגריים מסולסלים.
const SAMPLE: Record<string, string> = { name: 'הלקוח', entity: '‹שם הקופה או הגוף›', since: '‹מועד הבדיקה הקודמת›', period: '‹התקופה›', id: '‹מספר›' };
const sample = (q: string) => q.replace(/\{(\w+)\}/g, (_, k: string) => SAMPLE[k] ?? '‹…›');

/** «מה מבקשים מהלקוח» לנושא — מהשאלון האמיתי, לפי תחום. ‼ שאלה שהמשרד עונה עליה מסומנת, לא מוסתרת. */
export function clientAsksFor(topicId: string): ClientAskArea[] {
  const areas = TOPIC_AREAS[topicId] ?? [];
  return areas.map(id => {
    const a = AREAS.find(x => x.id === id);
    const asks = ITEMS.filter(i => i.area === id)
      .map(i => ({ key: i.key, label: sample(i.label), question: i.question ? sample(i.question) : undefined, doc: i.docKind ? DOCS[i.docKind]?.label : undefined, byOffice: i.who === 'office', rare: !!i.rare }));
    return { id, title: a?.title ?? id, parts1301: a?.parts1301 ?? [], annexes: a?.annexes ?? [], asks };
  }).filter(x => x.asks.length > 0);
}

/** המסמכים שהשאלון מבקש בנושא — בלי כפילויות, לשלב «מסמכים ומה מזינים». */
export function documentsFor(topicId: string): string[] {
  return [...new Set(clientAsksFor(topicId).flatMap(a => a.asks.map(x => x.doc).filter((d): d is string => !!d)))];
}

// ── מצב הנושא במילים — במקום «שמיש · עם פערים» ו«מקור משני» ──────────────────────
export interface PlainStatus { label: string; tone: 'ok' | 'check' | 'stop'; basis: string; canCalc: string }

/** מה אפשר לעשות עם הנושא — בשפה פשוטה. ‼ לא מסתיר מגבלה: הביסוס החלש ביותר קובע. */
export function plainStatus(status: 'usable' | 'research', basis: Basis, gaps: number): PlainStatus {
  // ‼ גיא (15.10): פער מקצועי אינו «נקודה לבדיקה» בקריאה — זו שאלה שלא הוכרעה
  const points = gaps === 0 ? '' : gaps === 1 ? ' · שאלה מקצועית אחת פתוחה' : ` · ${gaps} שאלות מקצועיות פתוחות`;
  const basisText: Record<Basis, string> = {
    primary: 'כל הערכים ממקור רשמי',
    derived: 'חלק מהערכים חושבו מהחוק — לבדוק מול פרסום רשמי לפני הגשה',
    secondary: 'חלק מהערכים ממקור לא רשמי (מאמר, אתר מקצועי) — לאמת לפני הגשה',
    unverified: 'יש ערך שלא אומת — לא לחשב לפיו',
  };
  if (status === 'research') return { label: `בבירור — ללמידה, לא לחישוב סופי${points}`, tone: 'stop', basis: basisText[basis], canCalc: 'המחשבונים כאן להמחשה. את החישוב בתיק עושים ביד, ובודקים מול המקור.' };
  if (basis === 'unverified') return { label: `אפשר ללמוד; לחשב בזהירות${points}`, tone: 'stop', basis: basisText[basis], canCalc: 'חלק מהחישוב נשען על ערך שלא אומת — המחשבון מסמן אותו, ולא מסתמכים עליו בתיק.' };
  return { label: `אפשר ללמוד ולעבוד לפיו${points}`, tone: basis === 'primary' && gaps === 0 ? 'ok' : 'check', basis: basisText[basis],
    canCalc: basis === 'primary' ? 'המחשבונים כאן נשענים על ערכים רשמיים לשנה.' : 'המחשבונים עובדים; ערך שאינו רשמי מסומן לידו — לאמת לפני הגשה.' };
}

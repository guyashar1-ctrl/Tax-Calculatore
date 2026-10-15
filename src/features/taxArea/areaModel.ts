// ─── «מס» — אזור אחד לעבודה בתיקי הלקוחות וללמידה מקצועית (14.10.2026) ─────────────────────
// ‼ גיא (14.10): «ידע מס» (בסרגל) ו«עבודת מס» (בתפריט החשבון, בתוך «המשרד») היו דומים מדי בשם ובמקומות שונים.
//   עכשיו: כניסה אחת «מס» בסרגל, ובתוכה שני מרחבים בשמות שאי אפשר לבלבל —
//   «עבודות לקוחות» (מה פתוח אצל מי, מה חסר ומה הבא) ו«ידע מקצועי» (ללמוד תחום ולעבוד לפיו, גם ביד).
// ‼ לכל סוג עבודה ולכל תחום מקצועי — כניסה משלו בצד. «כל העבודות» היא סקירה, לא תחליף לכניסות.
// ‼ טהור (בלי React) — נבדק ב-node. הכתובת: ‎#/tax/work/<section>‎ · ‎#/tax/learn/<domain>[/<item>]‎.

import type { WorkKind } from '../taxYear/taxWork';
import type { AreaId } from '../taxYear/catalog';
import type { Tool } from '../taxCenter/taxCenterNav';
import { AVAILABLE } from '../taxKnowledge/availability';

export type AreaMode = 'work' | 'learn';
export const MODE_LABEL: Record<AreaMode, string> = { work: 'עבודות לקוחות', learn: 'ידע מקצועי' };
export const MODE_HINT: Record<AreaMode, string> = {
  work: 'מה פתוח אצל כל לקוח, מה חסר ומה הצעד הבא',
  learn: 'ללמוד תחום מההתחלה ועד עבודה בתיק — גם בלי המערכת',
};

// ── עבודות לקוחות ──────────────────────────────────────────────────────────────
export type WorkSection = 'all' | WorkKind;
export interface WorkSectionDef {
  id: WorkSection;
  label: string;
  /** מה זו העבודה — שורה אחת, בשפת המשרד. */
  lead: string;
  /** איך פותחים עבודה מהסוג הזה. */
  howToOpen: string;
  /** התחום המקצועי שמסביר אותה. */
  domain?: DomainId;
  /** אפשר להוסיף מכאן ללקוח אחד או לכמה (AddTaxWorkDialog). */
  addKind?: 'annual' | 'wealth';
}

export const WORK_SECTIONS: WorkSectionDef[] = [
  { id: 'all', label: 'כל העבודות', lead: 'סקירה של כל העבודות הפתוחות — איחורים ומועדים קרובים בראש.', howToOpen: 'כל סוג נפתח מהעמוד שלו או מתיק הלקוח.' },
  { id: 'intake', label: 'קליטה והשלמת תיק', lead: 'פרטים קבועים שחסרים בתיק המס של לקוח חדש — שאלון השלמה, מסמכים ואישור בתיק.', howToOpen: 'נפתחת מתיק הלקוח: «עדכון ויישור קו» ← «הכן שאלון השלמה».', domain: 'annual' },
  { id: 'annual', label: 'דוחות שנתיים', lead: 'איסוף המידע והמסמכים לדוח של שנה — גם לשנה קודמת.', howToOpen: '«＋ דוח שנתי» — ללקוח אחד או לכמה, עם מקור ומועד.', domain: 'annual', addKind: 'annual' },
  { id: 'wealth', label: 'הצהרות הון', lead: 'הצהרה ליום מסוים — ראשונה או המשך, עם המועד שבדרישה.', howToOpen: '«＋ הצהרת הון» — ללקוח אחד או לכמה, עם המכתב אם התקבל.', domain: 'wealth', addKind: 'wealth' },
  ...(AVAILABLE.taxEstimate ? [{ id: 'estimate' as const, label: 'הערכות מס', lead: 'הערכה לשנה לפי חודש חתך — חבות, מקדמות ומה לשלם.', howToOpen: 'נפתחת מתיק הלקוח: «דוחות והצהרות» ← «＋ הערכת מס».', domain: 'advances' as const }] : []),
];
export const WORK_BY_ID = Object.fromEntries(WORK_SECTIONS.map(s => [s.id, s])) as Record<WorkSection, WorkSectionDef>;

// ── ידע מקצועי ─────────────────────────────────────────────────────────────────
export type DomainId = 'annual' | 'credits' | 'savings' | 'ni' | 'advances' | 'business' | 'rent' | 'wealth' | 'reference';

/** פריט בתוך תחום: נושא לימוד (מסלול מלא) או כלי (מחשבון, מילון, טבלה). */
export type DomainItem =
  | { kind: 'topic'; id: string; label: string; purpose: string }
  | { kind: 'tool'; id: Tool; label: string; purpose: string };

export interface DomainDef {
  id: DomainId;
  label: string;
  /** מה התחום — משפט אחד. */
  what: string;
  /** מתי הוא רלוונטי ללקוח. */
  when: string;
  items: DomainItem[];
  /** סוגי העבודה שבהם משתמשים בתחום. */
  workKinds: WorkKind[];
  /** פריטי השאלון ללקוח שקשורים לתחום (catalog.ts) — «מה מבקשים מהלקוח». */
  catalogAreas: AreaId[];
}

// ‼ «הדוח השנתי» ו«טופס 1301» היו שתי כניסות שנראו כפולות. עכשיו שתיהן בתחום אחד, עם תפקיד ברור לכל אחת:
//   ללמוד להכין דוח (מהמסמך לשדה) מול בדיקת הטופס לשנה ומוכנות לקוח.
export const DOMAINS: DomainDef[] = [
  { id: 'annual', label: 'דוח שנתי', what: 'הכנת הדוח השנתי ליחיד: אילו טפסים ונספחים, איך עוברים מכל מסמך לשדה, ואיך בודקים לפני הגשה.',
    when: 'לכל לקוח שמגיש דוח — עצמאי, בעל הכנסות נוספות, או מי שרוצה החזר.',
    items: [
      { kind: 'topic', id: 'annualReturn', label: 'הכנת הדוח: מהמסמך לשדה', purpose: 'ללמוד את התהליך — מסמכים, נספחים, קודים, בני זוג ובדיקות' },
      { kind: 'tool', id: 'map1301', label: 'טופס 1301 לשנה — שדות ומוכנות', purpose: 'לבדוק מה השתנה בטופס, ומה מוכן או חסר אצל לקוח מסוים' },
    ],
    workKinds: ['annual', 'intake'], catalogAreas: ['salary', 'capital', 'foreign', 'donations', 'special', 'filing'] },
  { id: 'credits', label: 'נקודות זיכוי ומדרגות', what: 'כמה נקודות זיכוי מגיעות ולמה, מדרגות המס, מס יסף והטבת יישובים.',
    when: 'בכל חישוב מס — הערכה, דוח או בדיקת החזר.',
    items: [
      { kind: 'tool', id: 'wizard', label: 'אשף נקודות זיכוי', purpose: 'עונים על שאלות — מקבלים את הנקודות וההסבר לכל אחת' },
      { kind: 'tool', id: 'incomeTax', label: 'מדרגות ומס יסף', purpose: 'המדרגות לשנה, מס יסף וחישוב מהיר' },
      { kind: 'tool', id: 'settlements', label: 'יישובים מוטבים', purpose: 'האם היישוב מזכה, ובכמה' },
    ],
    workKinds: ['annual', 'estimate'], catalogAreas: ['household'] },
  { id: 'savings', label: 'פנסיה וקרן השתלמות', what: 'ניכוי וזיכוי על הפקדות לפנסיה ולקרן השתלמות, ופנסיית חובה לעצמאים.',
    when: 'לעצמאי או לשכיר־עצמאי שמפקיד, או שצריך לבדוק אם כדאי להפקיד לפני סוף השנה.',
    items: [
      { kind: 'topic', id: 'pensionSE', label: 'פנסיה לעצמאי', purpose: 'ניכוי בשני מסלולים, זיכוי, גיל 50 ועמית מוטב' },
      { kind: 'topic', id: 'studyFund', label: 'קרן השתלמות', purpose: 'ניכוי בשנת ההפקדה ופטור במשיכה — שתי תקרות' },
      { kind: 'topic', id: 'mandatoryPension', label: 'פנסיית חובה לעצמאים', purpose: 'מי חייב, כמה, ומה ההבדל מהטבת המס' },
    ],
    workKinds: ['annual', 'estimate'], catalogAreas: ['savings'] },
  { id: 'ni', label: 'ביטוח לאומי', what: 'דמי ביטוח לעצמאי: על איזו הכנסה, מקדמות, תיקון ושומה סופית.',
    when: 'לכל עצמאי, ולשכיר שיש לו גם הכנסה מעסק.',
    items: [
      { kind: 'topic', id: 'niSelfEmployed', label: 'ביטוח לאומי לעצמאי', purpose: 'חישוב, מקדמות ותיקון — עם מחשבון רבעוני' },
      { kind: 'tool', id: 'ni', label: 'שיעורים ותקרות', purpose: 'הטבלאות לשנה לכל סוגי המבוטחים' },
    ],
    workKinds: ['estimate', 'annual'], catalogAreas: ['niBenefits'] },
  { id: 'advances', label: 'מקדמות והערכת מס', what: 'הערכה לפי חודש חתך: אמת מול תחזית, מקדמות במס הכנסה ובביטוח לאומי, ומה עושים אם משנים.',
    when: 'באמצע שנה — כשהכנסות העסק השתנו, או לפני המלצה ללקוח על מקדמות.',
    items: [
      { kind: 'topic', id: 'advances', label: 'מקדמות והערכת מס', purpose: 'חודש חתך, ארבעה תאריכים, ומה קורה לחודשים שעברו' },
    ],
    workKinds: ['estimate'], catalogAreas: ['payments'] },
  { id: 'business', label: 'עסק וניהול ספרים', what: 'עסק זעיר, סיווג הוצאות, ניהול ספרים ו-6111 — מה מותר לנכות ואיך מדווחים.',
    when: 'לכל עוסק — פטור, מורשה או עסק זעיר.',
    items: [
      { kind: 'topic', id: 'microBusiness', label: 'עסק זעיר', purpose: 'ניכוי 30%, תקרה, חריגה וצינון' },
      { kind: 'topic', id: 'form6111', label: 'טופס 6111 ומילון סיווג', purpose: 'מי חייב, מבנה הקודים, וסיווג הוצאה לקוד' },
      { kind: 'tool', id: 'expenses', label: 'הוצאות מוכרות', purpose: '«אפשר לנכות את זה?» — מס הכנסה ומע״מ, עם מקורות' },
      { kind: 'tool', id: 'bookkeeping', label: 'ניהול ספרים', purpose: 'איזו תוספת ואילו ספרים העוסק חייב לנהל' },
    ],
    workKinds: ['annual', 'intake'], catalogAreas: ['business'] },
  { id: 'rent', label: 'שכר דירה ונדל״ן', what: 'מיסוי שכר דירה למגורים — פטור, 10% או מס שולי — ומכירת נכסים.',
    when: 'ללקוח שמשכיר דירה, או שמכר נכס השנה.',
    items: [
      { kind: 'tool', id: 'rental', label: 'מחשבון שכר דירה', purpose: 'השוואת שלושת המסלולים, כולל הפטור המתקפל' },
    ],
    workKinds: ['annual', 'estimate'], catalogAreas: ['rent', 'sales'] },
  { id: 'wealth', label: 'הצהרת הון', what: 'הצהרה ראשונה או המשך: מועד, הטופס שדה אחר שדה, איך רושמים והשוואת הון.',
    when: 'כשהגיעה דרישה מפקיד השומה, או לפני כשמתכננים.',
    items: [
      { kind: 'topic', id: 'wealth', label: 'הצהרת הון והשוואת הון', purpose: 'המועד, 1219 שדה אחר שדה, השאלון והתהליך ביד' },
    ],
    workKinds: ['wealth'], catalogAreas: ['wRealEstate', 'wBank', 'wSecurities', 'wFunds', 'wLiabilities', 'wVehicles'] },
  { id: 'reference', label: 'ערכים ומקורות', what: 'ערכים לפי נושא (פרישה, מע״מ, רכב, מועדים) ועדכניות המאגר — מה נבדק, מתי, ומה פתוח.',
    when: 'כשצריך מספר לשנה, או לפני עדכון שנתי של הידע.',
    items: [
      { kind: 'tool', id: 'topics', label: 'ערכים לפי נושא', purpose: 'פרישה, מע״מ, חברות, מקרקעין, רכב, מועדים ועוד' },
      { kind: 'tool', id: 'maintenance', label: 'עדכניות ותחזוקה', purpose: 'ביסוס לכל כלל, בדיקת כיסוי, ופרומפט עדכון' },
    ],
    workKinds: [], catalogAreas: [] },
];
export const DOMAIN_BY_ID = Object.fromEntries(DOMAINS.map(d => [d.id, d])) as Record<DomainId, DomainDef>;

/** התחום של נושא או כלי — לקישור ישן (נושא בלבד) ולחזרה מתיק הלקוח. */
export function domainOf(itemId: string): DomainId | undefined {
  return DOMAINS.find(d => d.items.some(i => i.id === itemId))?.id;
}

// ── הכתובת ─────────────────────────────────────────────────────────────────────
export type AreaPath =
  | { mode: 'work'; section: WorkSection }
  | { mode: 'learn'; domain?: DomainId; item?: string };

export const DEFAULT_AREA_PATH: AreaPath = { mode: 'work', section: 'all' };

/** ‎"work/annual"‎ · ‎"learn/savings/pensionSE"‎ — מה שאחרי ‎#/tax/‎. קטע לא מוכר נופל לראש המרחב, לא לשגיאה. */
export function parseAreaPath(raw: string | undefined): AreaPath {
  const [mode, a, b] = (raw ?? '').split('/').filter(Boolean);
  if (mode === 'learn') {
    if (!a) return { mode: 'learn' };
    // קישור ישן לנושא בלי תחום (‎learn/pensionSE‎) — נוחת בתחום שלו
    if (!DOMAIN_BY_ID[a as DomainId]) {
      const d = domainOf(a);
      return d ? { mode: 'learn', domain: d, item: a } : { mode: 'learn' };
    }
    const dom = DOMAIN_BY_ID[a as DomainId];
    return b && dom.items.some(i => i.id === b) ? { mode: 'learn', domain: dom.id, item: b } : { mode: 'learn', domain: dom.id };
  }
  if (mode === 'work') return { mode: 'work', section: (a && WORK_BY_ID[a as WorkSection] ? a : 'all') as WorkSection };
  return DEFAULT_AREA_PATH;
}

export function formatAreaPath(p: AreaPath): string {
  if (p.mode === 'work') return `work/${p.section}`;
  return ['learn', p.domain, p.domain ? p.item : undefined].filter(Boolean).join('/');
}

/** הפריט בתחום שנפתח, או undefined כשמוצג עמוד התחום עצמו. */
export function itemOf(p: AreaPath): DomainItem | undefined {
  if (p.mode !== 'learn' || !p.domain || !p.item) return undefined;
  return DOMAIN_BY_ID[p.domain].items.find(i => i.id === p.item);
}

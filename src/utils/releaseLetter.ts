// ─── מכתב העברת הטיפול לרו"ח קודם ────────────────────────────────────────────
// רלוונטי רק כשהליד עובר מרו"ח אחר. מכין מייל (הרו"ח בודק ושולח, לא אוטומטי),
// ואחרי השליחה נשמר PDF של המייל במסמכי הלקוח — כך שרואים בדיוק מה נשלח,
// ממי (כתובת המשרד) ולאן (מייל הרו"ח הקודם), עם הנושא, התוכן והתאריך.
//
// ‼ מודל ההעברה (הכרעת גיא 2026-08-18): לא "שחרור תיק" ולא "הלקוח מפסיק את
// ההתקשרות מתאריך X" — אלא תיאום מקצועי בין שני משרדים: גבול טיפול שוטף אחד
// (תקופת דיווח), עבודות שנשארו אצל הקודם, ופסקת ייצוג שנגזרת מהן אוטומטית
// (דוח שנתי / הצהרת הון מוגשים רק על ידי המייצג הראשי).

import { PDFDocument, rgb, type RGB } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import { embedPdfFonts, layoutMixed, measureMixed } from './pdfHebrew';
import type { QuotationBrand } from '../components/quotations/quotationBranding';
import { esc, emailFont, buildBrandedEmail } from './brandedEmail';
import {
  ADDITIONAL_MATERIAL_KEY, ADDITIONAL_MATERIAL_LABEL, isOptionalMaterialKey,
  isBlockingOutstanding,
  type TransitionOutstandingItem, type TransitionOutstandingKind,
} from '../types/onboarding';

export interface ReleaseContext {
  clientName: string;
  prevAccountantName?: string;
  /**
   * מספר התיק במס הכנסה — ת.ז. של בעל התיק (הכרעת גיא 2026-08-20). זה מה
   * שמזהה את התיק אצל הרו״ח הקודם, בשונה משם העסק שהופיע כאן קודם ולא זיהה
   * כלום (ואצל עוסק שנקרא על שמו אף הופיע פעמיים).
   */
  taxFileNumber?: string;
  /**
   * בן/בת הזוג, כשהלקוח נשוי. ‼ הכרעת גיא (2026-08-20): במקום לברר מי בן
   * הזוג הרשום ולנסח סביבו, המכתב פשוט נוקב בשני השמות ובשתי הת״זים — כך
   * הרו״ח הקודם מזהה את התיק בוודאות בלי שנצטרך להכריע במקומו.
   */
  spouse?: { name: string; idNumber?: string };
}

/** פריט חומר שאפשר לבקש מהרו"ח הקודם. `key` תואם לצ'קליסט של שלב קבלת החומרים. */
export interface ReleaseMaterial {
  key: string;
  label: string;
  checked: boolean;
  /**
   * פריט רשות — הרו"ח הקודם מעלה אליו מה שלדעתו צריך לעבור, ואי-העלאה אינה
   * חוסרת. ‼ אינו נספר בהתקדמות ואינו חוסם את השלמת קבלת החומרים (לא במסך
   * ולא ב-portal-upload-document), אחרת "לפי שיקול דעתך" היה הופך לדרישה.
   */
  optional?: boolean;
  /**
   * חשוב במיוחד — עדיפות תקשורתית. ‼ אינו הופך את השאר לרשות: כל הפריטים
   * נשארים מבוקשים. משפיע על סדר (ראשון) ועל הבלטה מאופקת.
   */
  priority?: boolean;
}

/**
 * סדר התצוגה: חשובים ראשונים, והשאר בסדר שנקבע. ‼ מיון יציב — פריט שהמשרד
 * הזיז ידנית שומר על מקומו בתוך הקבוצה שלו.
 */
export function byPriorityFirst<T extends { priority?: boolean }>(items: T[]): T[] {
  return items
    .map((m, i) => ({ m, i }))
    .sort((a, b) => Number(!!b.m.priority) - Number(!!a.m.priority) || a.i - b.i)
    .map(x => x.m);
}

// ─── הבלטה בטקסט המכתב ───────────────────────────────────────────────────────
// ‼ הייצוג המינימלי והבטוח ביותר: המכתב נשאר **טקסט פשוט** בכל מקום שהוא
// נשמר (payload, PDF, טיוטה), והסימון הוא זוג `==` סביב הקטע. אין אחסון HTML,
// ולכן אין שום נתיב הזרקה — ההמרה ל-HTML קורית רק ברינדור, אחרי בריחה.
// ‼ שורה בודדת בכוונה: סימון שלא נסגר באותה שורה מוצג כפשוטו ואינו "בולע" את
// המשך המכתב.
export const HIGHLIGHT_MARK = '==';
const HIGHLIGHT_RE = /==([^=\n]+)==/g;

/** מסיר את סימוני ההבלטה ומשאיר את הטקסט — ל-PDF ולכל מקום שאינו מרנדר אותם. */
export function stripHighlightMarks(text: string): string {
  return text.replace(HIGHLIGHT_RE, '$1');
}

/** האם יש בטקסט סימון הבלטה תקין. */
export function hasHighlightMarks(text: string): boolean {
  HIGHLIGHT_RE.lastIndex = 0;
  return HIGHLIGHT_RE.test(text);
}

/** פירוק שורה לקטעים עם/בלי הבלטה — משמש גם ברינדור HTML וגם ב-PDF. */
export function splitHighlights(line: string): { text: string; mark: boolean }[] {
  const out: { text: string; mark: boolean }[] = [];
  let last = 0;
  HIGHLIGHT_RE.lastIndex = 0;
  for (const m of line.matchAll(HIGHLIGHT_RE)) {
    const at = m.index ?? 0;
    if (at > last) out.push({ text: line.slice(last, at), mark: false });
    out.push({ text: m[1], mark: true });
    last = at + m[0].length;
  }
  if (last < line.length) out.push({ text: line.slice(last), mark: false });
  return out.length ? out : [{ text: line, mark: false }];
}

/**
 * הפעלה/כיבוי של המרקר על הקטע הנבחר — הלוגיקה שמאחורי הכפתור, משותפת לחלון
 * המכתב ולעורך התבנית. מחזיר את הטקסט החדש ואת הבחירה שצריכה להישאר מסומנת,
 * או null כשלא נבחר כלום.
 */
export function toggleHighlightAt(
  text: string, start: number, end: number,
): { text: string; selection: [number, number] } | null {
  if (start === end) return null;
  const before = text.slice(0, start);
  const sel = text.slice(start, end);
  const after = text.slice(end);
  // כבר מובלט — בתוך הבחירה או מסביבה: מסירים.
  if (before.endsWith(HIGHLIGHT_MARK) && after.startsWith(HIGHLIGHT_MARK)) {
    return {
      text: before.slice(0, -HIGHLIGHT_MARK.length) + sel + after.slice(HIGHLIGHT_MARK.length),
      selection: [start - HIGHLIGHT_MARK.length, end - HIGHLIGHT_MARK.length],
    };
  }
  if (hasHighlightMarks(sel)) {
    const cleaned = stripHighlightMarks(sel);
    return { text: before + cleaned + after, selection: [start, start + cleaned.length] };
  }
  // ‼ סימון חייב להיות בתוך שורה אחת — מרקר שחוצה שורות אינו מרונדר.
  const marked = sel.split('\n')
    .map(l => (l.trim() ? `${HIGHLIGHT_MARK}${l}${HIGHLIGHT_MARK}` : l)).join('\n');
  return { text: before + marked + after, selection: [start, start + marked.length] };
}

// המפתח והתווית של הפריט הפתוח חיים ב-types/onboarding.ts (מקור אחד), ומיוצאים
// גם מכאן כדי שמי שמרכיב את המכתב לא יצטרך לדעת משני מקומות.
export { ADDITIONAL_MATERIAL_KEY, ADDITIONAL_MATERIAL_LABEL, isOptionalMaterialKey };

/**
 * ברירת המחדל — מה שגיא מבקש בפועל מרו״ח קודם (הכרעה 2026-08-20): קובץ מבנה
 * אחיד וכרטסת רווח והפסד, שניהם לשנה השוטפת ולשנה הקודמת. ‼ השאר נשארים
 * ברשימה כאפשרויות מסומנות-לא — הם עדיין נחוצים בחלק מהתיקים, והמרחק אליהם
 * הוא לחיצה אחת בכרטיס.
 */
export const RELEASE_MATERIALS: ReleaseMaterial[] = [
  // ‼ ארבע בקשות ולא שתיים (הכרעת גיא 2026-08-23): "של השנה ושנה קודמת" הוא
  // שני קבצים נפרדים, ופריט אחד לשניהם אינו ניתן למעקב — הרו"ח הקודם ששלח
  // רק את השנה השוטפת סימן "התקבל", ואצלנו נרשם שהכל הגיע.
  { key: 'uniform_file', label: 'קובץ מבנה אחיד - השנה', checked: true },
  { key: 'uniform_file_prev', label: 'קובץ מבנה אחיד - שנה קודמת', checked: true },
  { key: 'pnl_current', label: 'כרטסת רווח והפסד באקסל - השנה', checked: true },
  { key: 'pnl_prev', label: 'כרטסת רווח והפסד באקסל - שנה קודמת', checked: true },
  { key: 'ledgers', label: 'כרטסות הנהלת חשבונות', checked: false },
  { key: 'depreciation', label: 'טופס פחת', checked: false },
  { key: 'last_return', label: 'דוח שנתי אחרון', checked: false },
  { key: 'capital_declaration', label: 'הצהרת הון אחרונה', checked: false },
  { key: 'trial_balance', label: 'מאזן בוחן', checked: false },
  { key: ADDITIONAL_MATERIAL_KEY, label: ADDITIONAL_MATERIAL_LABEL, checked: true, optional: true },
];

export interface ReleaseOptions {
  /**
   * התקופה האחרונה שבטיפול הרו"ח הקודם ('YYYY-MM'). חובה — היא גבול האחריות.
   * ‼ תקופת דיווח אחת לכל המסים, לא תאריך קלנדרי (הכרעת גיא 2026-08-18).
   */
  lastPeriodPrev: string;
  materials: ReleaseMaterial[];
  /**
   * העבודות שנשארו אצל הרו"ח הקודם. דוח שנתי / הצהרת הון גוררים את פסקת
   * הייצוג (הקודם נשאר ראשי עד ההגשה) — אוטומטית, בלי שאלה נוספת למשרד.
   */
  outstandingItems?: TransitionOutstandingItem[];
  /**
   * האם הלקוח מכותב בפועל. ‼ ברירת המחדל היא כן, וזה גם מה שקורה תמיד כשיש
   * מייל בכרטיס — הלקוח הוא זה שמעביר את הטיפול, ולא נכון שיגלה על המכתב
   * בדיעבד. השדה קיים כדי שהמשפט "הלקוח מכותב" לא ייכתב כשאין מייל ולא נשלח
   * עותק: מכתב שמצהיר על כיתוב שלא קרה מטעה את הרו"ח הקודם.
   */
  ccClient?: boolean;
  /**
   * התבנית המשרדית. חסרה ⇒ שלד ברירת המחדל. ‼ התבנית קובעת רק את **הטקסט
   * הקבוע ואת סדר הסעיפים**; תוכן הסעיפים עצמם נגזר מהשדות שכאן ואי אפשר
   * לנסח אותו בתבנית — אחרת מכתב שנשלח היה יכול לסתור את מה שסוכם בפועל.
   */
  template?: ReleaseTemplate;
}

export function defaultReleaseSubject(ctx: ReleaseContext, template?: ReleaseTemplate): string {
  return fillVars(template?.subject ?? DEFAULT_RELEASE_TEMPLATE.subject, scalarVars(ctx, ''));
}

/** 'YYYY-MM' → 'MM/YYYY' — צורת הכתיבה המקובלת לתקופת דיווח. */
export function periodLabel(ym: string): string {
  const m = /^(\d{4})-(\d{2})$/.exec((ym || '').trim());
  return m ? `${m[2]}/${m[1]}` : ym;
}

/** התקופה שאחרי — ממנה מתחיל הטיפול שלנו. נגזרת, לא מוזנת. */
export function nextPeriod(ym: string): string {
  const m = /^(\d{4})-(\d{2})$/.exec((ym || '').trim());
  if (!m) return ym;
  const mo = Number(m[2]);
  return mo >= 12 ? `${Number(m[1]) + 1}-01` : `${m[1]}-${String(mo + 1).padStart(2, '0')}`;
}

/**
 * הניסוחים של עבודה חוסמת בתוך משפט — יידוע, פועל בזמן ובמין הנכונים.
 * outstandingLabel נותן את שם הפריט ("דוח שנתי לשנת 2025"); כאן הצורה המיודעת
 * שנכנסת למשפט ("הדוח השנתי לשנת 2025 יוגש...").
 */
function blockingPhrases(item: TransitionOutstandingItem): {
  subject: string; verb: string; until: string; copy: string;
} {
  if (item.kind === 'capital_declaration') {
    return {
      subject: item.year ? `הצהרת ההון לשנת ${item.year}` : 'הצהרת ההון',
      verb: 'תוגש', until: 'עד להגשתה', copy: 'העתק מההצהרה שהוגשה',
    };
  }
  return {
    subject: item.year ? `הדוח השנתי לשנת ${item.year}` : 'הדוח השנתי',
    verb: 'יוגש', until: 'עד להגשתו', copy: 'העתק מהדוח שהוגש',
  };
}

// ─── ארבעת הסעיפים הנגזרים ───────────────────────────────────────────────────
// ‼ כל אחד מהם מוחזר כטקסט מוכן (אולי רב-שורתי, אולי ריק) ונכנס לשלד במקום
// המשתנה שלו. הם **אינם ניתנים לניסוח בתבנית**: הם מתארים את מה שסוכם בפועל
// עם הלקוח, ומשרד שיוכל לנסח אותם מחדש יוכל לשלוח מכתב שסותר את הסיכום.

/** ‼ חלוקת האחריות השוטפת — תקופת דיווח, לא "הפסקת התקשרות מתאריך": האחריות
 *  המקצועית נחתכת לפי תקופות, והנוסח הישן נשמע כהודעת פיטורין. */
function periodParagraph(opts: ReleaseOptions): string {
  if (!opts.lastPeriodPrev?.trim()) return '';
  return `בהתאם לסיכום עם הלקוח, הטיפול השוטף יעבור למשרדנו החל מתקופת הדיווח ${periodLabel(nextPeriod(opts.lastPeriodPrev))}. ` +
    `נודה להשלמת הדיווחים השוטפים עד וכולל תקופת ${periodLabel(opts.lastPeriodPrev)}.`;
}

/** ‼ פסקת הייצוג נגזרת מהעבודות החוסמות ואינה מוזנת ביד: דוח שנתי והצהרת הון
 *  מוגשים רק על ידי המייצג הראשי — ולכן הקודם נשאר ראשי עד ההגשה, והלקוח לא
 *  נשאר בלי מייצג באמצע. עבודה אחת — משפט אחד; כמה — פסקה אחת. */
/**
 * רשימה בתוך משפט: "א, ב וג". ‼ הכרעת גיא (2026-08-20) — המכתב נקרא כמכתב
 * בין שני משרדים, לא כטופס. שורות תבליט ירדו מהנוסח הנבנה; הרינדור שלהן
 * נשאר לטובת מכתב שנוסח ידנית ולמייל ההמשך.
 */
function joinHe(items: string[]): string {
  if (items.length <= 1) return items[0] ?? '';
  return `${items.slice(0, -1).join(', ')} ו${items[items.length - 1]}`;
}

function outstandingSection(opts: ReleaseOptions): string {
  const outstanding = (opts.outstandingItems ?? []).filter(i => i.label.trim());
  const blocking = outstanding.filter(isBlockingOutstanding);
  const others = outstanding.filter(i => !isBlockingOutstanding(i));
  const blocks: string[] = [];

  if (blocking.length === 1) {
    const s = blockingPhrases(blocking[0]);
    blocks.push(
      `כמו כן, בהתאם לסיכום עם הלקוח, ${s.subject} ${s.verb} על ידי משרדך. ` +
      `${s.until} יישאר משרדך המייצג הראשי, ומשרדנו יירשם בשלב זה כמייצג משני. ` +
      `נודה לעדכון לאחר ההגשה ולהעברת ${s.copy}, כדי שנוכל להשלים את העברת הייצוג הראשי למשרדנו.`);
  } else if (blocking.length > 1) {
    blocks.push(
      `כמו כן, בהתאם לסיכום עם הלקוח, יושלמו על ידי משרדך ${joinHe(blocking.map(b => b.label.trim()))}. ` +
      'עד להשלמת ההגשות יישאר משרדך המייצג הראשי, ומשרדנו יירשם בשלב זה כמייצג משני. ' +
      'נודה לעדכון לאחר כל הגשה ולהעברת העתק מכל מסמך שהוגש, כדי שנוכל להשלים את העברת הייצוג הראשי למשרדנו.');
  }

  // עבודה חופשית — מופיעה ומבוקש עליה עדכון, בלי להמציא לה השלכת ייצוג.
  if (others.length === 1) {
    blocks.push(
      `${blocking.length ? 'בנוסף' : 'כמו כן'}, למיטב ידיעתנו נמצא בטיפולך: ${others[0].label.trim()}. ` +
      'נודה לעדכון עם ההשלמה.');
  } else if (others.length > 1) {
    blocks.push(
      `${blocking.length ? 'בנוסף' : 'כמו כן'}, למיטב ידיעתנו נמצאים בטיפולך ` +
      `${joinHe(others.map(o => o.label.trim()))}. נודה לעדכון עם השלמתם.`);
  }

  // מעבר נקי — אומרים זאת במפורש ומזמינים תיקון: זה מה שמונע ממשהו ליפול
  // בין המשרדים כשמסתבר שבכל זאת נשארה עבודה פתוחה.
  if (!outstanding.length) {
    blocks.push('למיטב ידיעתנו לא נותרו בטיפולך דוחות או עבודות פתוחות. אם ידוע לך אחרת - נשמח לעדכון.');
  }

  return blocks.join('\n\n');
}

function materialsSection(opts: ReleaseOptions): string {
  // חשובים ראשונים — גם בנוסח עצמו, כדי שמי שקורא במהירות יראה אותם קודם.
  const picked = byPriorityFirst(opts.materials.filter(m => m.checked && !m.optional));
  const openItem = opts.materials.find(m => m.checked && m.optional);
  const sentences: string[] = [];
  if (picked.length) {
    // ‼ "חשוב במיוחד" מסומן במרקר ולא במנגנון משלו (הכרעת גיא 2026-08-20):
    // אותו צהוב, ולכן הוא כבר עובד בעורך, במייל, ב-PDF ובדף של הרו"ח הקודם.
    // מרגע שהוא טקסט בגוף המכתב אפשר גם להסיר אותו ידנית, כמו כל סימון.
    sentences.push(`נודה לקבלת ${joinHe(picked.map(m => {
      const label = m.label.trim();
      return m.priority ? `${HIGHLIGHT_MARK}${label}${HIGHLIGHT_MARK}` : label;
    }))}.`);
  }
  // ‼ בקשה פתוחה, לא פריט ברשימה: אנחנו לא יודעים מה עוד קיים אצלו, והוא כן.
  if (openItem) {
    sentences.push('אם יש בידיך חומר נוסף שלדעתך נכון שיעבור אלינו - נשמח לקבל גם אותו.');
  }
  // פסקה אחת: שתי בקשות שקשורות זו לזו לא נקראות כשני עניינים נפרדים.
  return sentences.join(' ');
}

/** ‼ נכתב רק כשהעותק באמת יוצא: המשפט הזה הוא הצהרה לרו"ח הקודם שהלקוח יודע
 *  על המכתב, ומכתב שמצהיר על כיתוב שלא קרה מטעה אותו. */
function ccLine(opts: ReleaseOptions): string {
  return opts.ccClient !== false ? 'הלקוח מכותב למכתב זה.' : '';
}

// ─── התבנית המשרדית ──────────────────────────────────────────────────────────
// ‼ השלד הוא הטקסט הקבוע + מיקום ארבעת הסעיפים. המשרד עורך אותו במסך ההגדרות
// (settings.commTemplates.release_letter), והוא נשמר כטקסט פשוט — כמו המכתב
// עצמו. משרד שלא נגע בו מקבל בדיוק את הנוסח שלמטה, תו בתו.

export interface ReleaseTemplate { subject: string; body: string }

/** המפתח שתחתיו נשמרת הדריסה המשרדית, לצד תבניות מיילי השלבים. */
export const RELEASE_TEMPLATE_KEY = 'release_letter';

const SECTION_VARS = ['clientIntro', 'periodParagraph', 'outstandingSection', 'materialsSection', 'ccLine'] as const;
type SectionVar = typeof SECTION_VARS[number];

/** המשתנים והסבר קצר לכל אחד — מוצג כמקרא במסך ההגדרות. */
export const RELEASE_TEMPLATE_VARS: { name: string; hint: string; section?: boolean }[] = [
  { name: 'prevAccountantName', hint: 'שם הרו״ח הקודם' },
  { name: 'clientName', hint: 'שם הלקוח' },
  { name: 'clientRef', hint: 'שם הלקוח ות.ז. - ואצל זוג נשוי, שניהם' },
  { name: 'firmName', hint: 'שם המשרד שלך' },
  { name: 'clientIntro', hint: 'משפט הפתיחה - מי פנה אלינו', section: true },
  { name: 'periodParagraph', hint: 'פסקת חלוקת התקופות', section: true },
  { name: 'outstandingSection', hint: 'העבודות שנשארו פתוחות ופסקת הייצוג', section: true },
  { name: 'materialsSection', hint: 'רשימת החומרים המבוקשים', section: true },
  { name: 'ccLine', hint: 'המשפט "הלקוח מכותב"', section: true },
];

export const DEFAULT_RELEASE_TEMPLATE: ReleaseTemplate = {
  subject: 'העברת הטיפול בתיק - {{clientName}}',
  body: [
    'לכבוד {{prevAccountantName}},',
    '',
    'הנדון: העברת הטיפול בתיק - {{clientName}}',
    '',
    '{{clientIntro}}',
    '',
    '{{periodParagraph}}',
    '',
    '{{outstandingSection}}',
    '',
    '{{materialsSection}}',
    '',
    // ‼ מודל האינטראקציה (הכרעת גיא 2026-08-18): לא מבקשים אישור ולא חתימה —
    // מי שיש לו מניעה מודיע בתשובה למייל. ציטוט כלל 16 נשמר כלשונו: הוא מה
    // שנותן למכתב את משמעותו המקצועית, ורק אופן המענה הוא שהתנסח מחדש.
    'בהתאם לכלל 16 לכללי ההתנהגות המקצועית של לשכת רואי חשבון בישראל - ' +
    'אם קיימת מניעה או הסתייגות להעברת התיק, נודה לעדכון במייל חוזר ' +
    'בתוך כ־3 ימי עסקים.',
    '',
    '{{ccLine}}',
    '',
    'בברכה,',
    '{{firmName}}',
  ].join('\n'),
};

/**
 * משפט הפתיחה כפי שהיה כתוב בשלד עד 2026-08-20, לפני שהפך לסעיף נגזר.
 * ‼ תבנית משרדית שנשמרה לפני כן עדיין מחזיקה אותו, והיא גוברת על ברירת
 * המחדל — ולכן מכתב לזוג נשוי יצא "פנה... בענייניו" במקום "פנו... בענייניהם".
 */
const LEGACY_INTRO_LINE =
  '{{clientRef}} פנה למשרדנו להמשך הטיפול בענייניו, לרבות ייצוג מול הרשויות, הנהלת חשבונות ודוחות.';

/**
 * מחליף את משפט הפתיחה הישן בסעיף הנגזר. ‼ רק בהתאמה מדויקת של השורה
 * כולה — משרד שניסח משפט משלו שומר עליו כלשונו, גם אם הוא ביחיד.
 */
export function upgradeReleaseTemplateBody(body: string): string {
  if (!body.includes(LEGACY_INTRO_LINE)) return body;
  return body.split('\n')
    .map(l => (l.trim() === LEGACY_INTRO_LINE ? '{{clientIntro}}' : l))
    .join('\n');
}

/** התבנית של המשרד, עם נפילה לשלד ברירת המחדל בכל שדה חסר או ריק. */
export function releaseTemplateFrom(settings: Record<string, unknown> | null | undefined): ReleaseTemplate {
  const all = (settings ?? {}).commTemplates as Record<string, { subject?: string; body?: string }> | undefined;
  const saved = all?.[RELEASE_TEMPLATE_KEY];
  const pick = (v: unknown, fallback: string) =>
    typeof v === 'string' && v.trim() ? v : fallback;
  return {
    subject: pick(saved?.subject, DEFAULT_RELEASE_TEMPLATE.subject),
    body: upgradeReleaseTemplateBody(pick(saved?.body, DEFAULT_RELEASE_TEMPLATE.body)),
  };
}

const nameWithId = (name: string, id?: string) => {
  const n = name.trim();
  const i = (id ?? '').trim();
  return i ? `${n}, ת.ז. ${i}` : n;
};

const spouseOf = (ctx: ReleaseContext) =>
  (ctx.spouse?.name?.trim() ? ctx.spouse : undefined);

const hasAnyId = (ctx: ReleaseContext) =>
  !!(ctx.taxFileNumber?.trim() || spouseOf(ctx)?.idNumber?.trim());

/** מי הלקוח — שם ות.ז., ואצל זוג נשוי שניהם. בלי פועל, כדי שאפשר יהיה לבנות
 *  סביבו משפט משלך בתבנית. */
function clientRef(ctx: ReleaseContext): string {
  const me = nameWithId(ctx.clientName, ctx.taxFileNumber);
  const sp = spouseOf(ctx);
  if (!sp) return me;
  // הפסיק לפני ו' נדרש רק כשיש פסקאות ת.ז. באמצע, אחרת "א, וב" נקרא שבור.
  return `${me}${hasAnyId(ctx) ? ', ו' : ' ו'}${nameWithId(sp.name, sp.idNumber)}`;
}

/**
 * משפט הפתיחה. ‼ נגזר ולא נכתב בתבנית, כי אצל זוג נשוי הפועל והכינוי משתנים
 * ("פנו... בענייניהם" מול "פנה... בענייניו"), ותבנית אחת אינה יכולה להיות
 * נכונה בשני המקרים. מי שרוצה לנסח אחרת ישתמש ב-{{clientRef}} ויכתוב משפט משלו.
 */
function clientIntro(ctx: ReleaseContext): string {
  const sep = hasAnyId(ctx) ? ', ' : ' ';
  const tail = 'למשרדנו להמשך הטיפול';
  return spouseOf(ctx)
    ? `${clientRef(ctx)}${sep}פנו ${tail} בענייניהם, לרבות ייצוג מול הרשויות, הנהלת חשבונות ודוחות.`
    : `${clientRef(ctx)}${sep}פנה ${tail} בענייניו, לרבות ייצוג מול הרשויות, הנהלת חשבונות ודוחות.`;
}

function scalarVars(ctx: ReleaseContext, firmName: string): Record<string, string> {
  return {
    prevAccountantName: ctx.prevAccountantName?.trim() || 'רו״ח הנכבד',
    clientName: ctx.clientName,
    clientRef: clientRef(ctx),
    firmName,
  };
}

/** משתנה שנשאר בלי ערך מוצג כפי שהוא — כך רואים את הטעות במקום לשלוח חור. */
function fillVars(line: string, vars: Record<string, string>): string {
  return line.replace(/\{\{(\w+)\}\}/g, (whole, k: string) => (k in vars ? vars[k] : whole));
}

/** שורה שכולה משתנה-סעיף, ואולי עטופה במרקר. רק כזו מתרחבת לסעיף שלם. */
function sectionOnLine(line: string): { name: SectionVar; marked: boolean } | null {
  const m = /^(==)?\{\{(\w+)\}\}(==)?$/.exec(line.trim());
  if (!m) return null;
  const name = m[2] as SectionVar;
  if (!SECTION_VARS.includes(name)) return null;
  return { name, marked: !!m[1] && !!m[3] };
}

/**
 * שלד → מכתב. ‼ סעיף שהתרוקן לא משאיר חור: השורה שלו יורדת, ואם נוצרו שתי
 * שורות ריקות צמודות — אחת מהן יורדת גם היא. שורה ריקה שהמשרד כתב בכוונה
 * במקום אחר נשארת.
 */
export function renderReleaseTemplate(
  templateBody: string, ctx: ReleaseContext, firmName: string, opts: ReleaseOptions,
): string {
  const sections: Record<SectionVar, string> = {
    clientIntro: clientIntro(ctx),
    periodParagraph: periodParagraph(opts),
    outstandingSection: outstandingSection(opts),
    materialsSection: materialsSection(opts),
    ccLine: ccLine(opts),
  };
  const vars = { ...scalarVars(ctx, firmName), ...sections };

  // null = שורת סעיף שהתרוקנה. מסומנת ומנוקה בשלב השני.
  const raw: (string | null)[] = [];
  for (const line of templateBody.split('\n')) {
    const section = sectionOnLine(line);
    if (!section) { raw.push(fillVars(line, vars)); continue; }
    const text = sections[section.name];
    if (!text) { raw.push(null); continue; }
    for (const l of text.split('\n')) {
      // ‼ המרקר חייב להיסגר בתוך שורה אחת — ולכן כל שורה בסעיף נעטפת לחוד.
      raw.push(section.marked && l.trim() ? `${HIGHLIGHT_MARK}${stripHighlightMarks(l)}${HIGHLIGHT_MARK}` : l);
    }
  }

  const out: string[] = [];
  for (let i = 0; i < raw.length; i++) {
    const line = raw[i];
    if (line !== null) { out.push(line); continue; }
    const prevBlank = out.length > 0 && out[out.length - 1].trim() === '';
    const next = raw[i + 1];
    if (prevBlank && next !== null && next !== undefined && next.trim() === '') i++;
  }

  return out.join('\n').replace(/^\n+/, '').replace(/\n+$/, '');
}

export function defaultReleaseBody(ctx: ReleaseContext, firmName: string, opts: ReleaseOptions): string {
  return renderReleaseTemplate(
    opts.template?.body ?? DEFAULT_RELEASE_TEMPLATE.body, ctx, firmName, opts);
}

// ─── הטיוטה ──────────────────────────────────────────────────────────────────
// ‼ הטיוטה חיה על שלב מכתב השחרור (payload.releaseDraft) ולא בזיכרון החלון:
// עד היום כל מה שהורכב נמחק ברגע שסגרו את החלון בלי לשלוח, ולכן אי אפשר היה
// להראות בכרטיס מה בדיוק עומדים לבקש. אותה צורה נקראת בכרטיס ובחלון.

export interface ReleaseDraft {
  materials: ReleaseMaterial[];
  /** 'YYYY-MM' — התקופה האחרונה בטיפול הרו"ח הקודם. */
  lastPeriodPrev: string;
  /** העבודות שנשארו אצלו — דוח שנתי / הצהרת הון / חופשי. */
  outstandingItems: TransitionOutstandingItem[];
  ccClient: boolean;
  subject: string;
  body: string;
  /** הרו"ח נגע בנוסח ⇒ המערכת מפסיקה לבנות אותו מחדש מהשדות. */
  bodyEdited: boolean;
}

// המודל מיוצא גם מכאן — מי שמרכיב את המכתב לא צריך לדעת משני מקומות.
export type { TransitionOutstandingItem, TransitionOutstandingKind };

/** פריט עבודה פתוחה חדש — מפתח ייחודי משלו (הזהות אינה תלויה בשנה). */
export function newOutstandingItem(
  kind: TransitionOutstandingKind, year?: number, label?: string,
): TransitionOutstandingItem {
  return {
    key: `out_${kind}_${Date.now().toString(36)}${Math.floor(Math.random() * 100)}`,
    kind,
    ...(year ? { year } : {}),
    label: label ?? '',
  };
}

/** שורת עבודות פתוחות שנקראה מהמסד — כל שדה עשוי להיות חסר או מטיפוס אחר. */
export function outstandingFromStored(raw: unknown): TransitionOutstandingItem[] | null {
  if (!Array.isArray(raw)) return null;
  const out: TransitionOutstandingItem[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const r = item as Record<string, unknown>;
    const key = String(r.key ?? '').trim();
    if (!key) continue;
    const kind: TransitionOutstandingKind =
      r.kind === 'annual_report' || r.kind === 'capital_declaration' ? r.kind : 'other';
    out.push({
      key, kind,
      ...(typeof r.year === 'number' && Number.isFinite(r.year) ? { year: r.year } : {}),
      label: String(r.label ?? '').trim(),
      ...(typeof r.filedAt === 'string' && r.filedAt ? { filedAt: r.filedAt } : {}),
    });
  }
  // ‼ מערך ריק הוא ערך לגיטימי ("לא נשאר כלום") — לא נופלים ממנו לברירת מחדל.
  return out;
}

/** שורה שנקראה מהמסד — כל שדה עשוי להיות חסר או מטיפוס אחר. */
export function materialsFromStored(raw: unknown): ReleaseMaterial[] | null {
  if (!Array.isArray(raw)) return null;
  const out: ReleaseMaterial[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const r = item as Record<string, unknown>;
    const key = String(r.key ?? '').trim();
    if (!key) continue;
    out.push({
      key,
      label: String(r.label ?? '').trim(),
      checked: r.checked === undefined ? true : !!r.checked,
      ...(r.optional || isOptionalMaterialKey(key) ? { optional: true } : {}),
      ...(r.priority ? { priority: true } : {}),
    });
  }
  return out.length ? out : null;
}

export function newReleaseDraft(
  ctx: ReleaseContext, firmName: string, todayISO: string, template?: ReleaseTemplate,
): ReleaseDraft {
  const materials = RELEASE_MATERIALS.map(m => ({ ...m }));
  // ברירת המחדל: החודש הנוכחי. בחירה מפורשת של המשרד — לא נגזרת מחודש החיוב
  // (הכרעת גיא 2026-08-18: אחריות מקצועית וגבייה הם שני דברים).
  const lastPeriodPrev = todayISO.slice(0, 7);
  return {
    materials,
    lastPeriodPrev,
    outstandingItems: [],
    ccClient: true,
    subject: defaultReleaseSubject(ctx, template),
    body: defaultReleaseBody(ctx, firmName, { lastPeriodPrev, materials, template }),
    bodyEdited: false,
  };
}

/** קריאת הטיוטה מה-payload של השלב, עם נפילה לברירת המחדל בכל שדה חסר. */
export function readReleaseDraft(
  stored: unknown, ctx: ReleaseContext, firmName: string, todayISO: string,
  template?: ReleaseTemplate,
): ReleaseDraft {
  const base = newReleaseDraft(ctx, firmName, todayISO, template);
  if (!stored || typeof stored !== 'object') return base;
  const d = stored as Record<string, unknown>;
  const materials = materialsFromStored(d.materials) ?? base.materials;
  // טיוטות מהמודל הישן: תאריך ההפסקה הופך לתקופה (החודש שלו), ושורות
  // ה"דוחות שהוא חייב" + "הלקוח שילם עבור" הופכות לפריטי עבודה חופשיים —
  // המידע לא נמחק בשקט, והמשרד יכול למבנות אותו מחדש בלחיצה.
  const lastPeriodPrev =
    typeof d.lastPeriodPrev === 'string' && /^\d{4}-\d{2}$/.test(d.lastPeriodPrev)
      ? d.lastPeriodPrev
      : typeof d.serviceEndDate === 'string' && /^\d{4}-\d{2}/.test(d.serviceEndDate)
        ? d.serviceEndDate.slice(0, 7)
        : base.lastPeriodPrev;
  const legacyLines = [
    ...(typeof d.outstanding === 'string' ? d.outstanding.split('\n') : []),
    ...(typeof d.paidThroughLabel === 'string' && d.paidThroughLabel.trim() ? [d.paidThroughLabel] : []),
  ].map(t => t.trim()).filter(Boolean);
  const outstandingItems = outstandingFromStored(d.outstandingItems)
    ?? legacyLines.map((t, i) => ({ key: `out_legacy_${i}`, kind: 'other' as const, label: t }));
  const bodyEdited = !!d.bodyEdited;
  const subject = typeof d.subject === 'string' && d.subject.trim() ? d.subject : base.subject;
  // נוסח שנערך ידנית נשמר כלשונו; נוסח שלא נגעו בו נבנה מחדש מהשדות ששמורים,
  // כדי שפריט שנוסף בכרטיס יופיע במכתב בלי שיצטרכו לפתוח אותו.
  // ‼ הכיתוב ללקוח אינו נקרא מהטיוטה יותר (הכרעת גיא 2026-08-18): הלקוח מכותב
  // תמיד כשיש לו מייל בכרטיס. טיוטה ישנה ששמרה false לא תשתיק אותו בשקט.
  const ccClient = true;
  const body = bodyEdited && typeof d.body === 'string' && d.body.trim()
    ? d.body
    : defaultReleaseBody(ctx, firmName, { lastPeriodPrev, materials, outstandingItems, ccClient, template });
  return {
    materials, lastPeriodPrev, outstandingItems, ccClient,
    subject, body, bodyEdited,
  };
}

/**
 * מייל המשך — פריטים שנוספו אחרי שהמכתב כבר נשלח. לא מכתב שחרור שני: אותו
 * קישור, אותו תיק, רק תוספת לרשימה.
 */
export function followUpBody(
  ctx: ReleaseContext, firmName: string, items: string[], link?: string,
): string {
  const to = ctx.prevAccountantName?.trim() ? ctx.prevAccountantName.trim() : 'רו״ח הנכבד';
  const lines: string[] = [
    `לכבוד ${to},`,
    '',
    `בהמשך למכתבנו בעניין העברת הטיפול בתיק ${ctx.clientName}, ` +
    `נבקש להוסיף לרשימת החומרים ${joinHe(items.map(t => t.trim()).filter(Boolean))}.`,
    '',
  ];
  if (link) {
    lines.push('אפשר להעלות באותו קישור שנשלח:', link, '');
  }
  lines.push('תודה,', firmName);
  return lines.join('\n');
}

export function followUpSubject(ctx: ReleaseContext): string {
  return `תוספת לבקשת החומרים - ${ctx.clientName}`;
}

// ─── HTML של המייל ───────────────────────────────────────────────────────────
// ‼ עד 2026-08-18 המייל הזה נבנה בתבנית ידנית משלו, שהגדירה כיוון רק על תגית
// ה-<html> החיצונית. ג'ימייל מסיר את <html>/<body> ומרנדר רק את מה שבפנים —
// ולכן הכיוון נמחק והמכתב העברי הוצג כמייל שמאלי. הפתרון כבר היה קיים בבנאי
// המשותף (buildBrandedEmail), ששם dir ויישור על **כל תא**. כאן רק עוברים
// אליו, במקום לשכפל את הפתרון פעם שנייה.

/** רצפים לועזיים שחייבים להישאר קריאים בתוך משפט עברי (מייל, קישור, קובץ). */
const LTR_RUN = /([A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}|https?:\/\/[^\s<]+|www\.[^\s<]+|[A-Za-z0-9_-]+\.(?:pdf|xlsx?|docx?|csv|zip|jpe?g|png))/g;

/**
 * טקסט משתמש → HTML בטוח לשורה אחת: בריחה מלאה, ואז שתי הוספות בלבד —
 * הבלטה (`==...==`) ועטיפת רצפים לועזיים ב-dir="ltr" כדי שפיסוק עברי לא יקפוץ
 * לצד הלא נכון. ‼ הבריחה קודמת להכל, ולכן אין שום נתיב להזרקת HTML.
 */
/**
 * ‼ פריט "חשוב במיוחד" אינו מטופל כאן: הוא מגיע כבר עטוף במרקר מ-materialsSection,
 * ולכן הוא צהוב בכל מקום שהמכתב מרונדר בו — בלי מנגנון הבלטה שני.
 */
function inlineHtml(line: string, brand: QuotationBrand): string {
  return splitHighlights(line).map(part => {
    const safe = esc(part.text).replace(
      LTR_RUN, '<span dir="ltr" style="unicode-bidi:isolate;">$1</span>');
    // מרקר צהוב עדין. background-color ולא <mark>: תוכנות מייל אינן מעצבות
    // <mark> באופן אחיד, וצבע ישיר עובד בכולן.
    return part.mark
      ? `<span style="background-color:#fdf3c4;padding:0 2px;border-radius:2px;color:${brand.ink};">${safe}</span>`
      : safe;
  }).join('');
}

/**
 * גוף המכתב (טקסט פשוט) → HTML עם מבנה אמיתי: שורות "• " הופכות לרשימה
 * (<ul> מיושרת ימין) ולא לתווים בתוך פסקה, ושורות ריקות מפרידות פסקאות.
 * `materials` משמש רק לזיהוי פריט חשוב לפי הניסוח שלו — בלעדיו הכל מרונדר
 * כרגיל, וכך מכתב שנערך ידנית לא נשבר.
 */
function letterBodyToHtml(
  bodyText: string, brand: QuotationBrand, materials?: ReleaseMaterial[],
): string {
  const f = emailFont(brand);
  const priorityLabels = new Set(
    (materials ?? []).filter(m => m.priority && m.checked).map(m => m.label.trim()));
  const lines = bodyText.replace(/\r\n/g, '\n').split('\n');
  const out: string[] = [];
  let bullets: string[] = [];

  const flushBullets = () => {
    if (!bullets.length) return;
    out.push(
      `<ul dir="rtl" style="direction:rtl;text-align:right;margin:6px 0 12px;padding:0 20px 0 0;list-style-position:outside;">`
      + bullets.join('') + `</ul>`);
    bullets = [];
  };

  for (const raw of lines) {
    const line = raw.trimEnd();
    const bullet = /^\s*[•\-*]\s+(.*)$/.exec(line);
    if (bullet) {
      const label = bullet[1].trim();
      const isPriority = priorityLabels.has(stripHighlightMarks(label).trim());
      // ‼ הבלטה מאופקת: תג קטן ליד הפריט, לא צבע על כל השורה. שאר הפריטים
      // נשארים באותה רשימה ובאותו משקל — הם עדיין מבוקשים.
      const tag = isPriority
        ? ` <span style="font-family:${f};font-size:11.5px;font-weight:700;color:${brand.ink};background-color:#fdf3c4;padding:1px 7px;border-radius:999px;white-space:nowrap;">חשוב במיוחד</span>`
        : '';
      bullets.push(
        `<li dir="rtl" style="direction:rtl;text-align:right;font-family:${f};font-size:14.5px;`
        + `line-height:1.9;color:${brand.ink};${isPriority ? 'font-weight:600;' : ''}">`
        + inlineHtml(label, brand) + tag + `</li>`);
      continue;
    }
    flushBullets();
    if (!line.trim()) continue;
    out.push(
      `<div dir="rtl" style="direction:rtl;text-align:right;font-family:${f};font-size:14.5px;`
      + `line-height:1.85;color:${brand.ink};padding-bottom:10px;">${inlineHtml(line, brand)}</div>`);
  }
  flushBullets();
  return out.join('');
}

/** האם השורות האחרונות הן חתימת המכתב — הבנאי המשותף מרנדר אותה בתחתית בעצמו. */
function splitTrailingSignature(bodyText: string): { body: string; signature?: string } {
  const lines = bodyText.replace(/\r\n/g, '\n').split('\n');
  for (let i = lines.length - 1; i >= 0 && i >= lines.length - 4; i--) {
    if (/^\s*(בברכה|בכבוד רב)\s*,?\s*$/.test(lines[i])) {
      const signature = lines.slice(i).filter(l => l.trim()).join('\n');
      return { body: lines.slice(0, i).join('\n').trimEnd(), signature };
    }
  }
  return { body: bodyText };
}

export interface ReleaseEmailOptions {
  /** קישור לדף העברת החומרים — הופך לכפתור הראשי. חסר ⇒ מייל בלי CTA. */
  uploadUrl?: string;
  /** רשימת החומרים — לזיהוי פריט חשוב בלבד. */
  materials?: ReleaseMaterial[];
  /** כותרת המייל הגדולה. ברירת מחדל: הנדון. */
  heading?: string;
}

/**
 * HTML ממותג לשליחה בפועל, דרך המעטפת האחידה של כל מיילי המשרד.
 * ‼ הפעולה הראשית היא **העברת החומרים** ולא אישור הבקשה: הרו"ח הקודם אינו
 * מתבקש לחתום או לאשר (הכרעת גיא 2026-08-18). מי שיש לו מניעה משיב למייל,
 * וזה כתוב בגוף המכתב עצמו (כלל 16).
 */
export function buildReleaseEmailHtml(
  bodyText: string, brand: QuotationBrand, opts: ReleaseEmailOptions = {},
): string {
  const f = emailFont(brand);
  const { body, signature } = splitTrailingSignature(bodyText);
  const heading = opts.heading?.trim() || 'העברת חומרים';
  const replyLine =
    `<tr><td dir="rtl" align="right" style="direction:rtl;text-align:right;padding:2px 40px 18px;">`
    + `<div style="font-family:${f};font-size:13px;color:${brand.muted};line-height:1.7;">`
    + `נוח יותר במייל? אפשר להשיב להודעה הזאת ולצרף את הקבצים.</div></td></tr>`;

  return buildBrandedEmail(brand, {
    heading,
    bodyHtml: letterBodyToHtml(body, brand, opts.materials),
    ...(opts.uploadUrl
      ? { ctaLabel: 'להעברת החומרים', ctaHref: opts.uploadUrl, ctaArrow: true, showLinkFallback: true }
      : {}),
    afterCtaHtml: replyLine,
    ...(signature ? { signature } : {}),
  });
}

// PDF שמשקף את המייל שנשלח — כותרות מאת/אל/תאריך/נושא ואז גוף המכתב.
export async function generateReleaseEmailPdf(rec: {
  from: string; to: string; date: string; subject: string; bodyText: string;
  /** הקישור שנשלח ככפתור. נרשם בסוף הראיה — אחרת "מה בדיוק נשלח" חסר אותו. */
  uploadUrl?: string;
}, brand: QuotationBrand): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);
  const fonts = await embedPdfFonts(doc);
  const ink = hexToRgb(brand.ink);
  const accent = hexToRgb(brand.accent);
  const gray = hexToRgb(brand.muted);
  const A4 = { w: 595.28, h: 841.89 };
  const M = 50, RIGHT = A4.w - M;

  let page = doc.addPage([A4.w, A4.h]);
  let y = A4.h - M;
  const rtl = (text: string, size: number, color: RGB, yy: number) => {
    const segs = layoutMixed(text);
    const w = measureMixed(segs, size, fonts);
    let cx = RIGHT - w;
    for (const seg of segs) { const f = seg.rtl ? fonts.hebrew : fonts.latin; page.drawText(seg.text, { x: cx, y: yy, size, font: f, color }); cx += f.widthOfTextAtSize(seg.text, size); }
  };
  /**
   * שורת גוף המכתב, עם הבלטה. ‼ הציור נעשה בשני מעברים על אותה שורה: קודם
   * מלבנים צהובים מתחת לקטעים המובלטים, ואז הטקסט מעליהם. הרוחב של כל קטע
   * נמדד בנפרד ומצטבר משמאל לימין — אותה מתמטיקה של rtl() למעלה, ולכן
   * ההבלטה יושבת בדיוק מתחת למילים שלה גם בשורה מעורבת עברית-לועזית.
   */
  const rtlMarked = (parts: { text: string; mark: boolean }[], size: number, yy: number) => {
    // הסדר הוויזואלי הוא ימין-לשמאל: הקטע הראשון בטקסט מצויר הכי ימינה.
    const measured = parts.map(p => {
      const segs = layoutMixed(p.text);
      return { ...p, segs, w: measureMixed(segs, size, fonts) };
    });
    const total = measured.reduce((s, p) => s + p.w, 0);
    let cx = RIGHT - total;
    for (const p of [...measured].reverse()) {
      if (p.mark && p.w > 0) {
        page.drawRectangle({
          x: cx - 1, y: yy - size * 0.22, width: p.w + 2, height: size * 1.16,
          color: rgb(0.99, 0.95, 0.77),
        });
      }
      cx += p.w;
    }
    cx = RIGHT - total;
    for (const p of [...measured].reverse()) {
      for (const seg of p.segs) {
        const f = seg.rtl ? fonts.hebrew : fonts.latin;
        page.drawText(seg.text, { x: cx, y: yy, size, font: f, color: ink });
        cx += f.widthOfTextAtSize(seg.text, size);
      }
    }
  };
  const ensure = (need: number) => { if (y - need < M) { page = doc.addPage([A4.w, A4.h]); y = A4.h - M; } };

  page.drawRectangle({ x: 0, y: A4.h - 5, width: A4.w, height: 5, color: accent });
  rtl(brand.firmName, 15, ink, y); y -= 30;
  rtl('העברת הטיפול בתיק - רו״ח קודם', 12, accent, y); y -= 22;

  // בלוק כותרות המייל
  for (const [label, val] of [['מאת', rec.from], ['אל', rec.to], ['תאריך', rec.date], ['נושא', rec.subject]]) {
    ensure(18);
    rtl(`${label}: ${val}`, 10.5, gray, y);
    y -= 17;
  }
  y -= 6;
  page.drawRectangle({ x: M, y, width: A4.w - M * 2, height: 0.6, color: hexToRgb(brand.border) });
  y -= 18;

  // גוף המכתב — עם ההבלטות שסומנו בו (ראה rtlMarked).
  for (const paragraph of rec.bodyText.split('\n')) {
    for (const line of wrapMarked(paragraph, 92)) {
      ensure(16);
      if (line.some(p => p.mark)) rtlMarked(line, 11, y);
      else rtl(line.map(p => p.text).join('') || ' ', 11, ink, y);
      y -= 16;
    }
  }

  if (rec.uploadUrl) {
    y -= 10;
    ensure(34);
    rtl('הכפתור במייל הוביל אל:', 10.5, gray, y); y -= 15;
    // כתובת לועזית — משמאל לימין, כמו שהיא.
    page.drawText(rec.uploadUrl, { x: M, y, size: 9, font: fonts.latin, color: gray });
  }
  return doc.save();
}

/**
 * גלישת שורות ששומרת על סימוני ההבלטה. ‼ הגלישה חייבת לעבוד על הטקסט
 * **בלי** תווי הסימון — אחרת "==" נספר ברוחב השורה, ובשורה שנשברה באמצע
 * הסימון היה נחתך לשניים ומופיע כטקסט.
 */
function wrapMarked(paragraph: string, maxChars: number): { text: string; mark: boolean }[][] {
  const words: { text: string; mark: boolean }[] = [];
  for (const part of splitHighlights(paragraph)) {
    const chunks = part.text.split(/(\s+)/).filter(s => s !== '');
    for (const c of chunks) words.push({ text: c, mark: part.mark });
  }
  if (!words.length) return [[{ text: '', mark: false }]];

  const lines: { text: string; mark: boolean }[][] = [];
  let line: { text: string; mark: boolean }[] = [];
  let len = 0;
  for (const w of words) {
    const isSpace = /^\s+$/.test(w.text);
    if (len + w.text.length > maxChars && len > 0 && !isSpace) {
      lines.push(mergeAdjacent(line));
      line = []; len = 0;
    }
    if (isSpace && len === 0) continue;   // רווח בתחילת שורה שנשברה
    line.push(w);
    len += w.text.length;
  }
  if (line.length) lines.push(mergeAdjacent(line));
  return lines.length ? lines : [[{ text: '', mark: false }]];
}

/** איחוד מילים סמוכות בעלות אותו סימון — פחות מקטעים, מדידה יציבה יותר. */
function mergeAdjacent(parts: { text: string; mark: boolean }[]): { text: string; mark: boolean }[] {
  const out: { text: string; mark: boolean }[] = [];
  for (const p of parts) {
    const prev = out[out.length - 1];
    if (prev && prev.mark === p.mark) prev.text += p.text;
    else out.push({ ...p });
  }
  return out;
}

function hexToRgb(hex: string): RGB {
  const m = /^#?([0-9a-f]{6})$/i.exec((hex || '').trim());
  if (!m) return rgb(0.1, 0.1, 0.1);
  const int = parseInt(m[1], 16);
  return rgb(((int >> 16) & 255) / 255, ((int >> 8) & 255) / 255, (int & 255) / 255);
}


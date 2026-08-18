// ─── מכתב שחרור לרו"ח קודם ───────────────────────────────────────────────────
// רלוונטי רק כשהליד עובר מרו"ח אחר. מכין מייל (הרו"ח בודק ושולח, לא אוטומטי),
// ואחרי השליחה נשמר PDF של המייל במסמכי הלקוח — כך שרואים בדיוק מה נשלח,
// ממי (כתובת המשרד) ולאן (מייל הרו"ח הקודם), עם הנושא, התוכן והתאריך.

import { PDFDocument, rgb, type RGB } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import { embedPdfFonts, layoutMixed, measureMixed } from './pdfHebrew';
import type { QuotationBrand } from '../components/quotations/quotationBranding';
import { esc, emailFont, buildBrandedEmail } from './brandedEmail';
import {
  ADDITIONAL_MATERIAL_KEY, ADDITIONAL_MATERIAL_LABEL, isOptionalMaterialKey,
} from '../types/onboarding';

export interface ReleaseContext {
  clientName: string;
  businessName?: string;
  prevAccountantName?: string;
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

// המפתח והתווית של הפריט הפתוח חיים ב-types/onboarding.ts (מקור אחד), ומיוצאים
// גם מכאן כדי שמי שמרכיב את המכתב לא יצטרך לדעת משני מקומות.
export { ADDITIONAL_MATERIAL_KEY, ADDITIONAL_MATERIAL_LABEL, isOptionalMaterialKey };

/** ברירת המחדל — הרשימה שגיא מבקש בפועל. כרטסות ראשונות כי הן העיקר. */
export const RELEASE_MATERIALS: ReleaseMaterial[] = [
  { key: 'ledgers', label: 'כרטסות הנהלת חשבונות', checked: true },
  { key: 'uniform_file', label: 'קובץ מבנה אחיד', checked: true },
  { key: 'excel_ledger', label: 'כרטסת בפורמט אקסל', checked: true },
  { key: 'depreciation', label: 'טופס פחת', checked: true },
  { key: 'last_return', label: 'דוח שנתי אחרון', checked: true },
  { key: 'capital_declaration', label: 'הצהרת הון אחרונה', checked: true },
  { key: 'pnl_current', label: 'כרטסת רווח והפסד לשנה השוטפת', checked: true },
  { key: 'trial_balance', label: 'מאזן בוחן', checked: false },
  { key: ADDITIONAL_MATERIAL_KEY, label: ADDITIONAL_MATERIAL_LABEL, checked: true, optional: true },
];

export interface ReleaseOptions {
  /** מתי ההתקשרות עם הרו"ח הקודם מסתיימת. חובה — בלעדיו המכתב חסר תוקף. */
  serviceEndDate: string;              // 'YYYY-MM-DD'
  materials: ReleaseMaterial[];
  /**
   * הלקוח כבר שילם לקודם על דוחות שטרם הוגשו: הקודם נשאר מייצג ראשי עד ההגשה,
   * ואנחנו נרשמים כמשני. ראה את מכתב הדוגמה של רו"ח נדב צייגר.
   */
  paidThroughLabel?: string;           // "דוחות שנתיים לשנת 2025 והנהלת חשבונות עד פברואר 2026"
  /** דיווחים או דוחות שהקודם עדיין חייב ללקוח — שורות חופשיות. */
  outstanding?: string[];
}

export function defaultReleaseSubject(ctx: ReleaseContext): string {
  return `שחרור תיק — ${ctx.clientName}`;
}

function formatHebrewDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
}

export function defaultReleaseBody(ctx: ReleaseContext, firmName: string, opts: ReleaseOptions): string {
  const to = ctx.prevAccountantName?.trim() ? ctx.prevAccountantName.trim() : 'רו״ח הנכבד';
  const who = ctx.businessName?.trim() ? `${ctx.clientName} (${ctx.businessName})` : ctx.clientName;
  // חשובים ראשונים — גם בנוסח עצמו, כדי שמי שקורא במהירות יראה אותם קודם.
  const picked = byPriorityFirst(opts.materials.filter(m => m.checked && !m.optional));
  const openItem = opts.materials.find(m => m.checked && m.optional);

  const lines: string[] = [
    `לכבוד ${to},`,
    '',
    `הנדון: שחרור תיק — ${ctx.clientName}`,
    '',
    `${who} פנה אלינו לייצוגו כרואי חשבון, לרבות ייצוג מול הרשויות, הנהלת חשבונות ודוחות שנתיים.`,
    `לפיכך, הלקוח מפסיק את ההתקשרות עמך החל מתאריך ${formatHebrewDate(opts.serviceEndDate)}.`,
    '',
  ];

  if (picked.length) {
    lines.push('נודה לקבלת החומרים הבאים:');
    picked.forEach(m => lines.push(`• ${m.label}`));
    lines.push('');
  }

  // ‼ בקשה פתוחה, לא פריט ברשימה: אנחנו לא יודעים מה עוד קיים אצלו, והוא כן.
  if (openItem) {
    lines.push('אם יש בידיך חומר נוסף שלדעתך נכון שיעבור אלינו — נשמח לקבל גם אותו.');
    lines.push('');
  }

  if (opts.outstanding?.length) {
    lines.push('כמו כן, למיטב ידיעתנו טרם הושלמו מול הלקוח:');
    opts.outstanding.filter(t => t.trim()).forEach(t => lines.push(`• ${t.trim()}`));
    lines.push('נודה לעדכון לגבי מועד ההשלמה.');
    lines.push('');
  }

  // ‼ הפסקה הזו היא הסיבה שהלקוח לא נשאר בלי מייצג באמצע: כשהוא כבר שילם
  // על דוחות שטרם הוגשו, מי שקיבל את הכסף נשאר הראשי עד שיגיש.
  if (opts.paidThroughLabel?.trim()) {
    lines.push(
      `להבנתנו, כיוון שהלקוח כבר ביצע תשלום עבור ${opts.paidThroughLabel.trim()}, ` +
      'משרדך יישאר מייצג ראשי עד להגשתם. נירשם כמייצג משני, ולאחר ההגשה נעבור להיות המייצג הראשי.');
    lines.push('');
  }

  // ‼ מודל האינטראקציה (הכרעת גיא 2026-08-18): לא מבקשים אישור ולא חתימה —
  // מי שיש לו מניעה מודיע בתשובה למייל. ציטוט כלל 16 נשמר כלשונו: הוא מה
  // שנותן למכתב את משמעותו המקצועית, ורק אופן המענה הוא שהתנסח מחדש.
  lines.push(
    'בהתאם לכלל 16 לכללי ההתנהגות המקצועית של לשכת רואי חשבון בישראל — ' +
    'אם קיימת מניעה או הסתייגות להעברת התיק, נודה לעדכון במייל חוזר ' +
    'בתוך כ־3 ימי עסקים.',
    '',
    'הלקוח מכותב למכתב זה.',
    '',
    'בברכה,',
    firmName,
  );

  return lines.join('\n');
}

// ─── הטיוטה ──────────────────────────────────────────────────────────────────
// ‼ הטיוטה חיה על שלב מכתב השחרור (payload.releaseDraft) ולא בזיכרון החלון:
// עד היום כל מה שהורכב נמחק ברגע שסגרו את החלון בלי לשלוח, ולכן אי אפשר היה
// להראות בכרטיס מה בדיוק עומדים לבקש. אותה צורה נקראת בכרטיס ובחלון.

export interface ReleaseDraft {
  materials: ReleaseMaterial[];
  serviceEndDate: string;
  paidThroughLabel: string;
  outstanding: string;
  ccClient: boolean;
  subject: string;
  body: string;
  /** הרו"ח נגע בנוסח ⇒ המערכת מפסיקה לבנות אותו מחדש מהשדות. */
  bodyEdited: boolean;
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

export function newReleaseDraft(ctx: ReleaseContext, firmName: string, todayISO: string): ReleaseDraft {
  const materials = RELEASE_MATERIALS.map(m => ({ ...m }));
  return {
    materials,
    serviceEndDate: todayISO,
    paidThroughLabel: '',
    outstanding: '',
    ccClient: true,
    subject: defaultReleaseSubject(ctx),
    body: defaultReleaseBody(ctx, firmName, { serviceEndDate: todayISO, materials }),
    bodyEdited: false,
  };
}

/** קריאת הטיוטה מה-payload של השלב, עם נפילה לברירת המחדל בכל שדה חסר. */
export function readReleaseDraft(
  stored: unknown, ctx: ReleaseContext, firmName: string, todayISO: string,
): ReleaseDraft {
  const base = newReleaseDraft(ctx, firmName, todayISO);
  if (!stored || typeof stored !== 'object') return base;
  const d = stored as Record<string, unknown>;
  const materials = materialsFromStored(d.materials) ?? base.materials;
  const serviceEndDate = typeof d.serviceEndDate === 'string' && d.serviceEndDate ? d.serviceEndDate : base.serviceEndDate;
  const paidThroughLabel = typeof d.paidThroughLabel === 'string' ? d.paidThroughLabel : '';
  const outstanding = typeof d.outstanding === 'string' ? d.outstanding : '';
  const bodyEdited = !!d.bodyEdited;
  const subject = typeof d.subject === 'string' && d.subject.trim() ? d.subject : base.subject;
  // נוסח שנערך ידנית נשמר כלשונו; נוסח שלא נגעו בו נבנה מחדש מהשדות ששמורים,
  // כדי שפריט שנוסף בכרטיס יופיע במכתב בלי שיצטרכו לפתוח אותו.
  const body = bodyEdited && typeof d.body === 'string' && d.body.trim()
    ? d.body
    : defaultReleaseBody(ctx, firmName, {
        serviceEndDate, materials,
        paidThroughLabel,
        outstanding: outstanding.split('\n').filter(t => t.trim()),
      });
  return {
    materials, serviceEndDate, paidThroughLabel, outstanding,
    ccClient: d.ccClient === undefined ? true : !!d.ccClient,
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
    `בהמשך למכתב השחרור בעניין ${ctx.clientName}, נבקש להוסיף לרשימת החומרים:`,
    ...items.map(t => `• ${t}`),
    '',
  ];
  if (link) {
    lines.push('אפשר להעלות באותו קישור שנשלח:', link, '');
  }
  lines.push('תודה,', firmName);
  return lines.join('\n');
}

export function followUpSubject(ctx: ReleaseContext): string {
  return `תוספת לבקשת החומרים — ${ctx.clientName}`;
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
  rtl('מכתב שחרור — רו״ח קודם', 12, accent, y); y -= 22;

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


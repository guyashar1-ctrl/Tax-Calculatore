// ─── מכתב שחרור לרו"ח קודם ───────────────────────────────────────────────────
// רלוונטי רק כשהליד עובר מרו"ח אחר. מכין מייל (הרו"ח בודק ושולח, לא אוטומטי),
// ואחרי השליחה נשמר PDF של המייל במסמכי הלקוח — כך שרואים בדיוק מה נשלח,
// ממי (כתובת המשרד) ולאן (מייל הרו"ח הקודם), עם הנושא, התוכן והתאריך.

import { PDFDocument, rgb, type RGB } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import { embedPdfFonts, layoutMixed, measureMixed } from './pdfHebrew';
import type { QuotationBrand } from '../components/quotations/quotationBranding';
import { esc, emailFont, emailHeaderRow } from './brandedEmail';
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
  const picked = opts.materials.filter(m => m.checked && !m.optional);
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

  lines.push(
    'בהתאם לכלל 16 לכללי ההתנהגות המקצועית של לשכת רואי חשבון בישראל, ' +
    'אנא השב/י לנו במייל בתוך כ-3 ימי עסקים אם קיימת התנגדות למעבר.',
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

// HTML ממותג לשליחה בפועל — נגזר במלואו מטוקני העיצוב (אותה שפה של כל המיילים).
export function buildReleaseEmailHtml(bodyText: string, brand: QuotationBrand): string {
  const f = emailFont(brand);
  const contact = [brand.phone, brand.email].filter((v): v is string => Boolean(v)).map(esc).join(' · ');
  return `<!DOCTYPE html><html dir="rtl" lang="he"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:${brand.pageBg};font-family:${f};color:${brand.ink};">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${brand.pageBg};padding:24px 0;"><tr><td align="center">
    <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:${brand.cardBg};border:1px solid ${brand.border};border-radius:${brand.radius + 4}px;overflow:hidden;box-shadow:0 6px 24px rgba(0,0,0,.06);">
      ${emailHeaderRow(brand)}
      <tr><td style="padding:${brand.headerStyle === 'minimal' ? '20' : '24'}px 40px 26px;font-family:${f};font-size:14.5px;line-height:1.8;color:${brand.ink};white-space:pre-line;">${esc(bodyText)}</td></tr>
      ${contact ? `<tr><td style="padding:0 40px 28px;"><div style="border-top:1px solid ${brand.border};padding-top:14px;font-family:${f};font-size:12px;color:${brand.muted};">${contact}</div></td></tr>` : ''}
    </table>
  </td></tr></table>
</body></html>`;
}

// PDF שמשקף את המייל שנשלח — כותרות מאת/אל/תאריך/נושא ואז גוף המכתב.
export async function generateReleaseEmailPdf(rec: {
  from: string; to: string; date: string; subject: string; bodyText: string;
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

  // גוף המכתב
  for (const paragraph of rec.bodyText.split('\n')) {
    for (const line of wrap(paragraph, 92)) {
      ensure(16);
      rtl(line || ' ', 11, ink, y);
      y -= 16;
    }
  }
  return doc.save();
}

function wrap(text: string, maxChars: number): string[] {
  if (!text) return [''];
  const out: string[] = []; let line = '';
  for (const word of text.split(/\s+/)) {
    if ((line + ' ' + word).trim().length > maxChars) { if (line) out.push(line); line = word; }
    else line = (line + ' ' + word).trim();
  }
  if (line) out.push(line);
  return out.length ? out : [''];
}

function hexToRgb(hex: string): RGB {
  const m = /^#?([0-9a-f]{6})$/i.exec((hex || '').trim());
  if (!m) return rgb(0.1, 0.1, 0.1);
  const int = parseInt(m[1], 16);
  return rgb(((int >> 16) & 255) / 255, ((int >> 8) & 255) / 255, (int & 255) / 255);
}


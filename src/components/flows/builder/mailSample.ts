// ─── «איך ייראה» — המייל המרוכז ללקוח, לדוגמה ──────────────────────────────
// ‼ אותו קוד שהשרת שולח: הנוסח (stepTemplates — כולל הנוסח של המשרד מ«מיילים»)
// והמעטפת הממותגת (designSystem). מה שהשרת מוסיף סביבם — הכותרת, הבלוק
// «ושלחנו לכם…» והשורה הקטנה מתחת — מועתק כאן מ-send-process-open-email
// (event process_open / documents_sent). שינוי שם בלי שינוי כאן ⇒ התצוגה משקרת.
// ‼ איזה נוסח שמור חל, הכותרת, שורת הפתיחה והכפתור — noticeWording + withIntroLine,
// אותן פונקציות שהשרת מפעיל. templateTitle = שם השורה בעמוד «מיילים», בדיוק.
import type { FirmProfile } from '../../../types/firmProfile';
import {
  emailTemplateTitle, noticeWording, renderTemplate, withIntroLine,
  type FirstPageEmail, type SavedTemplateKey, type StepEmailTemplate,
} from '../../../../supabase/functions/_shared/stepTemplates.ts';
import { buildBrandedEmail, emailFont, esc } from '../../../utils/brandedEmail';
import { deriveQuotationBrand } from '../../quotations/quotationBranding';

export interface MailSampleInput {
  requests: string[];
  documents: string[];
  /**
   * מייל הדף הראשון של הלקוח (firstPageEmailKind): 'welcome' — קליטה פתוחה («ברוכים הבאים»);
   * 'introduce' — לקוח ותיק («פתחנו לכם דף אישי» ושורה שמציגה את הדף); null — כבר קיבל.
   */
  first: FirstPageEmail;
  clientFirst: string;
  clientLast: string;
}

export interface MailSample {
  subject: string;
  html: string;
  event: 'process_open' | 'documents_sent';
  /** המפתח של הנוסח השמור שחל על המייל הזה. */
  templateKey: SavedTemplateKey;
  /** שם השורה בעמוד «מיילים» שבה הנוסח נערך. */
  templateTitle: string;
}

export function consolidatedMailSample(profile: FirmProfile, input: MailSampleInput): MailSample {
  const brand = deriveQuotationBrand(profile);
  const event = input.requests.length === 0 && input.documents.length > 0 ? 'documents_sent' : 'process_open';
  const wording = noticeWording({
    event, first: input.first, clientFirst: input.clientFirst, documentsCount: input.documents.length,
  });
  const { templateKey, base } = wording;
  const saved = (((profile.settings ?? {}) as Record<string, unknown>).commTemplates as Record<string, Partial<StepEmailTemplate>> | undefined)?.[templateKey] ?? {};
  const merged: StepEmailTemplate = {
    subject: String(saved.subject ?? base.subject).trim() || base.subject,
    body: String(saved.body ?? base.body),
  };
  const line = (t: string) => `· ${t.trim()}`;
  const clientFull = `${input.clientFirst} ${input.clientLast}`.trim();
  const filled = renderTemplate(merged, {
    clientName: clientFull,
    firmName: brand.firmName,
    requestList: input.requests.map(line).join('\n'),
    documentList: input.documents.map(line).join('\n'),
    documentsPhrase: wording.documentsPhrase,
    statusList: '',
    welcomeLine: wording.welcomeLine,
  });
  const rendered = { ...filled, body: withIntroLine(filled.body, merged.body, wording) };
  const block = (title: string, text: string) =>
    `<tr><td dir="rtl" align="right" style="text-align:right;padding:18px 40px 4px;">`
    + `<div style="border-top:1px solid ${brand.border};padding-top:14px;">`
    + `<div style="font-family:${emailFont(brand)};font-size:12.5px;font-weight:700;color:${brand.muted};letter-spacing:.02em;">${esc(title)}</div>`
    + `<div style="font-family:${emailFont(brand)};font-size:13.5px;color:${brand.muted};line-height:1.7;padding-top:5px;">`
    + esc(text).replace(/\n/g, '<br />') + `</div></div></td></tr>`;
  const afterCta = event === 'process_open' && input.documents.length > 0
    ? block(input.documents.length === 1 ? 'ושלחנו לכם מסמך חדש' : `ושלחנו לכם ${input.documents.length} מסמכים חדשים`,
      input.documents.map(line).join('\n'))
    : '';
  const waiting = input.requests.length;
  const html = buildBrandedEmail(brand, {
    heading: wording.heading,
    bodyHtml: esc(rendered.body).replace(/\n/g, '<br />'),
    afterCtaHtml: afterCta,
    ctaLabel: wording.ctaLabel,
    // ‼ קישור לדוגמה, לא הקישור האישי של לקוח אמיתי.
    ctaHref: `${typeof window === 'undefined' ? '' : window.location.origin}/?portal=…`,
    ctaArrow: true,
    showLinkFallback: true,
    footerTagline: event === 'process_open'
      ? (waiting === 1 ? 'פעולה אחת ממתינה' : waiting > 1 ? `${waiting} פעולות ממתינות` : undefined)
      : undefined,
  });
  return { subject: rendered.subject, html, event, templateKey, templateTitle: emailTemplateTitle(templateKey) };
}

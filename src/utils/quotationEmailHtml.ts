// מחולל ה-HTML של מייל ההצעה — מקור יחיד לתצוגה המקדימה בסטודיו/בבונה ולשליחה,
// כדי שהמייל ייראה זהה למה שהוצג.
//
// המעטפת היא buildBrandedEmail המשותפת (supabase/functions/_shared/designSystem)
// — אותה מעטפת שנשלחת בבקשות הייצוג. עד 2026-07-30 היה כאן HTML מקומי משלו,
// והוא נפל ל-LTR בג'ימייל: ג'ימייל מסיר את <html>/<body> ואיתם dir="rtl",
// ורק כיוון שיושב על כל td/div שורד. במקום לתקן פעמיים — יש מעטפת אחת.
//
// ‼ החלטה עסקית (גיא, 2026-07-30): במייל אין מחירים. מספר שנקרא בתיבה, בין
// דברים, נשפט כהוצאה; אותו מספר בעמוד ההצעה — אחרי רשימת השירותים ואחרי
// "כלול במחיר" — נשפט כמחיר עבור משהו. המייל מוכר את הליווי ואת היחס האישי,
// ואומר במפורש איפה המחיר. זו לא הסתרה: השורה "המחיר המלא בעמוד ההצעה"
// מפורשת, וזה גם מה שמייצר את הקליק שמסמן לנו "נצפתה".

import type { QuotationItem } from '../types/quotations';
import { itemDisplayName } from './quotationCalc';
import type { QuotationBrand } from '../components/quotations/quotationBranding';
import { buildBrandedEmail, emailFont, emailTint, esc } from './brandedEmail';

export interface QuotationEmailData {
  quotationNumber: string;
  recipientName: string;
  businessName?: string;
  items: QuotationItem[];
  vatRate: number;
  message?: string;
  quotationLink: string;
  expiresAt?: string;
}

export function buildQuotationEmailHtml(data: QuotationEmailData, brand: QuotationBrand): string {
  const firstName = (data.recipientName || '').trim().split(/\s+/)[0] || '';
  const f = emailFont(brand);
  const rad = brand.radius;
  const cardTint = emailTint(brand.pageBg);

  // שמות השירותים בלבד — הם עוגן הערך שמצדיק את המחיר בעמוד הבא.
  // ה"כלול במחיר" מסומן ככזה: זו הטבה, ושווה שתיראה כבר כאן.
  const priced = data.items.filter(i => i.category !== 'included');
  const included = data.items.filter(i => i.category === 'included');
  // ההערה לשורה מופיעה בעמוד ההצעה, ולכן גם כאן — הלקוח קורא את המייל קודם,
  // ו"כולל שנתיים אחורה" ליד שם השירות הוא לרוב בדיוק מה שסגר את העסקה.
  const serviceRow = (label: string, tag?: string, note?: string) => `<tr>
      <td dir="rtl" align="right" style="text-align:right;padding:5px 0;font-family:${f};font-size:14px;color:${brand.ink};line-height:1.5;">
        <span style="color:${brand.accent};font-weight:700;">✓</span>&nbsp;${esc(label)}${tag ? `<span style="font-size:11.5px;color:${brand.muted};">&nbsp;·&nbsp;${esc(tag)}</span>` : ''}
        ${note ? `<div dir="rtl" style="text-align:right;font-family:${f};font-size:12px;color:${brand.accent};line-height:1.5;padding:2px 18px 0 0;">${esc(note)}</div>` : ''}
      </td>
    </tr>`;

  const servicesCard = data.items.length > 0 ? `<tr><td dir="rtl" align="right" style="text-align:right;padding:20px 40px 4px;">
    <table dir="rtl" role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid ${brand.border};border-radius:${rad}px;background:${cardTint};">
      <tr><td dir="rtl" align="right" style="text-align:right;padding:16px 18px 8px;font-family:${f};font-size:11px;font-weight:700;letter-spacing:.08em;color:${brand.muted};">מה תקבל במסגרת הליווי</td></tr>
      <tr><td dir="rtl" align="right" style="text-align:right;padding:0 18px 14px;">
        <table dir="rtl" role="presentation" width="100%" cellpadding="0" cellspacing="0">
          ${priced.map(i => serviceRow(itemDisplayName(i), undefined, i.clientNote?.trim() || undefined)).join('')}
          ${included.map(i => serviceRow(itemDisplayName(i), 'כלול ללא תוספת', i.clientNote?.trim() || undefined)).join('')}
        </table>
      </td></tr>
    </table>
  </td></tr>` : '';

  const messageBlock = data.message?.trim()
    ? `<tr><td dir="rtl" align="right" style="text-align:right;padding:14px 40px 4px;">
        <div dir="rtl" style="border-inline-start:3px solid ${brand.accent};border-right:3px solid ${brand.accent};background:${cardTint};border-radius:${rad}px;padding:14px 16px;font-family:${f};font-size:14.5px;color:${brand.ink};line-height:1.75;white-space:pre-line;text-align:right;">${esc(data.message)}</div>
      </td></tr>`
    : '';

  // יחס אישי נמדד בפרטים שאפשר לבדוק, לא בתארים. "זמין בוואטסאפ ובנייד"
  // הוא הבטחה קונקרטית; "שירות אישי ומקצועי" הוא רעש שכל אחד כותב.
  const wa = whatsappLink(brand.phone);
  const phoneText = brand.phone ? esc(brand.phone) : '';
  const availability = `<tr><td dir="rtl" align="right" style="text-align:right;padding:16px 40px 4px;">
    <div dir="rtl" style="font-family:${f};font-size:14px;color:${brand.ink};line-height:1.75;text-align:right;">
      אני אהיה איש הקשר שלך לאורך כל הדרך.
      ${phoneText ? `לכל שאלה אפשר לפנות אליי ישירות בטלפון או בוואטסאפ${wa ? ` <a href="${wa}" style="color:${brand.accent};font-weight:600;text-decoration:none;">${phoneText}</a>` : ` <span style="font-weight:600;" dir="ltr">${phoneText}</span>`}.` : 'לכל שאלה אפשר לפנות אליי ישירות בטלפון או בוואטסאפ.'}
    </div>
  </td></tr>`;

  const pricePointer = `<tr><td dir="rtl" align="right" style="text-align:right;padding:14px 40px 0;">
    <div dir="rtl" style="font-family:${f};font-size:14px;font-weight:600;color:${brand.ink};line-height:1.7;text-align:right;">
      המחיר שסיכמנו מופיע בעמוד ההצעה.
    </div>
  </td></tr>`;

  const expiryLabel = data.expiresAt
    ? new Date(data.expiresAt).toLocaleDateString('he-IL', { day: 'numeric', month: 'long', year: 'numeric' })
    : null;

  return buildBrandedEmail(brand, {
    heading: `${firstName ? esc(firstName) + ', ' : ''}זו ההצעה שהכנתי עבורך.`,
    bodyHtml: `ההצעה מבוססת על מה שסיכמנו ומותאמת לצרכים של ${data.businessName ? esc(data.businessName) : 'העסק שלך'}. הפרטים המלאים והאישור נמצאים בעמוד ההצעה.`,
    tag: `הצעה מס׳ ${data.quotationNumber}`,
    extraHtml: servicesCard + messageBlock + availability + pricePointer,
    ctaLabel: 'צפייה ואישור ההצעה',
    ctaHref: data.quotationLink,
    footerNote: expiryLabel ? `ההצעה בתוקף עד ${expiryLabel}.` : 'לצפייה בפרטים המלאים ולאישור — לחיצה אחת.',
    showLinkFallback: true,
  });
}

// קישור וואטסאפ למספר ישראלי (05X…) — רק אם המספר נראה תקין. מספר בפורמט
// אחר מוצג כטקסט, כדי שלא ייווצר קישור שבור במייל שיוצא ללקוח.
function whatsappLink(phone?: string): string | null {
  const digits = (phone ?? '').replace(/\D/g, '');
  if (/^05\d{8}$/.test(digits)) return `https://wa.me/972${digits.slice(1)}`;
  if (/^9725\d{8}$/.test(digits)) return `https://wa.me/${digits}`;
  return null;
}

// ═══════════════════════════════════════════════════════════════════════════
//  מערכת העיצוב — מקור האמת היחיד (Single Source of Truth)
// ═══════════════════════════════════════════════════════════════════════════
//  כל התבניות, הצבעים, הפונטים, הטוקנים ורינדור המיילים מוגדרים כאן. בלבד.
//
//  נצרך משתי הסביבות מאותו קובץ ממש:
//    • Frontend (Vite/TS):  import { ... } from '../../supabase/functions/_shared/designSystem.ts'
//    • Edge Functions (Deno): import { ... } from '../_shared/designSystem.ts'
//
//  לכן הקובץ הזה חייב להישאר "טהור": בלי React, בלי DOM, בלי Deno API,
//  בלי ייבוא חיצוני. רק טיפוסים, דאטה ופונקציות טהורות שמחזירות מחרוזות.
//
//  הוספת תבנית חדשה / מאפיין עיצוב חדש (הצללה, ריווח, גרדיאנט…) — כאן, פעם אחת,
//  והוא זמין אוטומטית באתר, בעמודי הלקוח, ב-PDF ובכל מייל.
// ═══════════════════════════════════════════════════════════════════════════

// ─────────────────────────── טיפוסים ───────────────────────────

export type HeaderStyle = 'minimal' | 'centered' | 'band';
export type ButtonStyle = 'solid' | 'outline' | 'pill';
export type CornerStyle = 'sharp' | 'rounded' | 'soft';

/** טוקני העיצוב של תבנית — כל מאפיין חדש נוסף כאן ומתפשט לכל המערכת. */
export interface DesignTokens {
  ink: string;        // צבע כהה ראשי — כותרות ומשטח ה-CTA
  accent: string;     // אקסנט — כפתורים, מחירים, הדגשות
  pageBg: string;     // רקע העמוד
  cardBg: string;     // רקע הכרטיס
  border: string;     // קווי הפרדה
  muted: string;      // טקסט משני
  headerStyle: HeaderStyle;
  buttonStyle: ButtonStyle;
  corner: CornerStyle;
  font: string;
}

export interface DesignPreset extends DesignTokens {
  id: string;
  label: string;
  description: string;
}

/** בחירת העיצוב של המשרד — נשמר ב-profiles.branding.docDesign */
export interface DocDesign {
  preset?: string;
  ink?: string;
  accent?: string;
  pageBg?: string;
  cardBg?: string;
  border?: string;
  muted?: string;
  font?: string;
  headerStyle?: HeaderStyle;
  buttonStyle?: ButtonStyle;
  corner?: CornerStyle;
}

/** מבנה ה-jsonb של profiles.branding (זהה בשתי הסביבות) */
export interface BrandingJson {
  theme?: string;
  accentColor?: string;
  font?: string;
  monogram?: string;
  logoUrl?: string;
  docDesign?: DocDesign;
}

/** קלט מנורמל ל-resolveBrand — כל סביבה ממפה אליו את המבנה שלה */
export interface BrandInput {
  firmName?: string;
  branding?: BrandingJson;
  email?: string;
  phone?: string;
  website?: string;
  address?: string;
  emailSignature?: string;
}

/** המותג המלא אחרי פענוח — זהות + טוקני עיצוב מוכנים לשימוש */
export interface ResolvedBrand {
  firmName: string;
  monogram: string;
  logoUrl?: string;
  email?: string;
  phone?: string;
  website?: string;
  address?: string;
  emailSignature?: string;
  font: string;
  ink: string;
  accent: string;
  pageBg: string;
  cardBg: string;
  border: string;
  muted: string;
  radius: number;
  headerStyle: HeaderStyle;
  buttonStyle: ButtonStyle;
  presetId: string;
}

// ─────────────────────────── דאטה ───────────────────────────

export const CORNER_RADIUS: Record<CornerStyle, number> = { sharp: 4, rounded: 12, soft: 20 };

export const FONT_CHOICES = ['Heebo', 'Assistant', 'Rubik', 'Frank Ruhl Libre', 'Secular One'];

export const HEADER_STYLE_LABELS: Record<HeaderStyle, string> = {
  minimal: 'מינימלי (לוגו בצד)',
  centered: 'ממורכז',
  band: 'רצועת צבע',
};
export const BUTTON_STYLE_LABELS: Record<ButtonStyle, string> = {
  solid: 'מלא',
  outline: 'קו מתאר',
  pill: 'מעוגל (גלולה)',
};
export const CORNER_STYLE_LABELS: Record<CornerStyle, string> = {
  sharp: 'חד',
  rounded: 'מעוגל',
  soft: 'רך מאוד',
};

/** ערכות המותג הישנות — נשמרות כנפילה-אחורה למשרדים שטרם בחרו תבנית */
export const LEGACY_THEMES: Record<string, { ink: string; accent: string }> = {
  monochrome: { ink: '#1A1A1A', accent: '#4F46E5' },
  navy: { ink: '#0E1F3A', accent: '#C9A75A' },
  emerald: { ink: '#0B3B36', accent: '#10B981' },
};

export const DEFAULT_PRESET_ID = 'minimal-light';

/** ★ התבניות — להוסיף תבנית חדשה: כאן בלבד. */
export const DESIGN_PRESETS: DesignPreset[] = [
  {
    id: 'minimal-light', label: 'מינימל בהיר', description: 'נקי, אוורירי, אינדיגו עדין — ברירת המחדל',
    ink: '#1A1A1A', accent: '#4F46E5', pageBg: '#F4F3EF', cardBg: '#FFFFFF',
    border: '#EDECE7', muted: '#6B6A63', headerStyle: 'minimal', buttonStyle: 'solid', corner: 'soft', font: 'Heebo',
  },
  {
    id: 'navy-lux', label: 'נייבי יוקרתי', description: 'רשמי ומכובד, נייבי עמוק עם זהב',
    ink: '#0E1F3A', accent: '#C9A75A', pageBg: '#F4F5F8', cardBg: '#FFFFFF',
    border: '#E6E8EE', muted: '#5C6474', headerStyle: 'band', buttonStyle: 'solid', corner: 'rounded', font: 'Frank Ruhl Libre',
  },
  {
    id: 'emerald-fresh', label: 'אמרלד רענן', description: 'מודרני ונקי, ירוק ביתי ואמין',
    ink: '#0B3B36', accent: '#10B981', pageBg: '#F1F6F4', cardBg: '#FFFFFF',
    border: '#E1EBE7', muted: '#5A6B66', headerStyle: 'centered', buttonStyle: 'pill', corner: 'soft', font: 'Assistant',
  },
  {
    id: 'warm-cream', label: 'קרם חם', description: 'חמים ומזמין, גווני קרם וטרקוטה',
    ink: '#2A2622', accent: '#B4703A', pageBg: '#F7F3EC', cardBg: '#FFFDF9',
    border: '#EBE4D8', muted: '#7A7167', headerStyle: 'minimal', buttonStyle: 'solid', corner: 'soft', font: 'Frank Ruhl Libre',
  },
  {
    id: 'mono-editorial', label: 'מונוכרום חד', description: 'עריכתי ונועז, שחור-לבן עם פינות חדות',
    ink: '#111111', accent: '#111111', pageBg: '#FAFAFA', cardBg: '#FFFFFF',
    border: '#E5E5E5', muted: '#6B7280', headerStyle: 'band', buttonStyle: 'outline', corner: 'sharp', font: 'Secular One',
  },
  {
    id: 'soft-pastel', label: 'פסטל עדין', description: 'רך ונעים, סגול פסטלי ופינות מעוגלות',
    ink: '#2E2A4A', accent: '#7C6FE0', pageBg: '#F6F4FB', cardBg: '#FFFFFF',
    border: '#EAE6F5', muted: '#6A6486', headerStyle: 'centered', buttonStyle: 'pill', corner: 'soft', font: 'Rubik',
  },
  {
    id: 'tech-blue', label: 'טק כחול', description: 'מודרני והייטקי, כחול חי על רקע נקי',
    ink: '#0F172A', accent: '#2563EB', pageBg: '#F1F5F9', cardBg: '#FFFFFF',
    border: '#E2E8F0', muted: '#64748B', headerStyle: 'band', buttonStyle: 'pill', corner: 'rounded', font: 'Assistant',
  },
  {
    id: 'black-gold', label: 'שחור־זהב', description: 'יוקרה מקסימלית, שחור עמוק עם זהב',
    ink: '#111111', accent: '#C6A15B', pageBg: '#F4F2EE', cardBg: '#FFFFFF',
    border: '#E8E4DC', muted: '#6E6A62', headerStyle: 'band', buttonStyle: 'solid', corner: 'sharp', font: 'Frank Ruhl Libre',
  },
  {
    id: 'wine-elegant', label: 'בורדו קלאסי', description: 'חם ומכובד, גוון יין עם קרם',
    ink: '#4A1F2B', accent: '#9B2D3F', pageBg: '#F8F3F1', cardBg: '#FFFDFC',
    border: '#EEE0DD', muted: '#7C6660', headerStyle: 'centered', buttonStyle: 'solid', corner: 'soft', font: 'Frank Ruhl Libre',
  },
  {
    id: 'teal-clean', label: 'טורקיז נקי', description: 'רענן ומינימלי, טורקיז על לבן',
    ink: '#0F3B3A', accent: '#0EA5A5', pageBg: '#F0F7F6', cardBg: '#FFFFFF',
    border: '#DEEDEB', muted: '#557370', headerStyle: 'minimal', buttonStyle: 'pill', corner: 'soft', font: 'Rubik',
  },
  {
    id: 'graphite', label: 'גרפיט', description: 'מאופק ורציני, אפור פחם מונוכרומטי',
    ink: '#1F2933', accent: '#3D4B5C', pageBg: '#F5F6F7', cardBg: '#FFFFFF',
    border: '#E4E7EA', muted: '#66727E', headerStyle: 'minimal', buttonStyle: 'solid', corner: 'rounded', font: 'Assistant',
  },
  {
    id: 'sunset-warm', label: 'כתום שקיעה', description: 'אנרגטי ומזמין, כתום חם וקורן',
    ink: '#3A2417', accent: '#E0672E', pageBg: '#FBF4EE', cardBg: '#FFFDFB',
    border: '#F0E3D8', muted: '#84695A', headerStyle: 'centered', buttonStyle: 'pill', corner: 'soft', font: 'Rubik',
  },
  {
    id: 'forest-deep', label: 'ירוק יער', description: 'טבעי ובוטח, ירוק עמוק ואדמתי',
    ink: '#1B2E20', accent: '#2F7D4F', pageBg: '#F1F5F0', cardBg: '#FFFFFF',
    border: '#E1EADD', muted: '#5C6B5D', headerStyle: 'band', buttonStyle: 'solid', corner: 'rounded', font: 'Assistant',
  },
];

export function findPreset(id?: string): DesignPreset {
  return DESIGN_PRESETS.find(p => p.id === id) ?? DESIGN_PRESETS[0];
}

// ─────────────────────────── פענוח המותג ───────────────────────────

/** ראשי תיבות מתוך שם המשרד */
export function deriveMonogram(firmName?: string): string {
  if (!firmName) return '★';
  const words = firmName
    .replace(/משרד|רואי|חשבון|רו״ח|רו"ח|ושות׳|ושות'|בע״מ|בע"מ/g, '')
    .trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return firmName.trim().slice(0, 2);
  if (words.length === 1) return words[0].slice(0, 2);
  return (words[0][0] || '') + (words[1][0] || '');
}

/**
 * ★ פענוח יחיד לכל המערכת: תבנית כבסיס + כיוונונים אישיים דורסים.
 * אם לא נבחרה תבנית — נופלים למותג הישן (theme/accentColor) כדי לא לשנות
 * מראה של משרדים ותיקים שטרם נכנסו לסטודיו.
 */
export function resolveBrand(input: BrandInput): ResolvedBrand {
  const branding = input.branding ?? {};
  const dd = branding.docDesign ?? {};
  const structural = findPreset(DEFAULT_PRESET_ID);
  const legacy = LEGACY_THEMES[branding.theme ?? 'monochrome'] ?? LEGACY_THEMES.monochrome;

  const base: DesignTokens = dd.preset
    ? findPreset(dd.preset)
    : {
        ...structural,
        ink: legacy.ink,
        accent: (branding.accentColor && branding.accentColor.trim()) || legacy.accent,
        font: branding.font || structural.font,
      };

  const corner: CornerStyle = dd.corner || base.corner;

  return {
    firmName: (input.firmName || '').trim() || 'משרד רואי חשבון',
    monogram: (branding.monogram || deriveMonogram(input.firmName)).slice(0, 2),
    logoUrl: branding.logoUrl,
    email: input.email,
    phone: input.phone,
    website: input.website,
    address: input.address,
    emailSignature: input.emailSignature,
    font: dd.font || base.font,
    ink: dd.ink || base.ink,
    accent: dd.accent || (branding.accentColor && branding.accentColor.trim()) || base.accent,
    pageBg: dd.pageBg || base.pageBg,
    cardBg: dd.cardBg || base.cardBg,
    border: dd.border || base.border,
    muted: dd.muted || base.muted,
    radius: CORNER_RADIUS[corner],
    headerStyle: dd.headerStyle || base.headerStyle,
    buttonStyle: dd.buttonStyle || base.buttonStyle,
    presetId: dd.preset || 'custom',
  };
}

// ─────────────────────────── רינדור מיילים ───────────────────────────
// מחרוזות טהורות — נצרך גם מהאתר (תצוגה מקדימה/שליחה) וגם מה-Edge Functions.

export function esc(s: string): string {
  return String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));
}

export function emailFont(brand: ResolvedBrand): string {
  return `'${brand.font}',Arial,Helvetica,sans-serif`;
}

/** גוון עדין כהה יותר מרקע העמוד — לכרטיסים פנימיים */
export function emailTint(hex: string): string {
  const m = /^#?([0-9a-f]{6})$/i.exec((hex || '').trim());
  if (!m) return '#FAFAF8';
  const n = parseInt(m[1], 16);
  const r = Math.max(0, ((n >> 16) & 255) - 5), g = Math.max(0, ((n >> 8) & 255) - 5), b = Math.max(0, (n & 255) - 5);
  return `rgb(${r},${g},${b})`;
}

/** כותרת ממותגת לפי סגנון. tag = טקסט קטן בצד (אופציונלי). */
export function emailHeaderRow(brand: ResolvedBrand, tag?: string): string {
  const f = emailFont(brand);
  const mark = brand.logoUrl
    ? `<img src="${esc(brand.logoUrl)}" alt="${esc(brand.firmName)}" style="max-height:40px;max-width:180px;border:0;" />`
    : `<table role="presentation" cellpadding="0" cellspacing="0" border="0" dir="rtl"><tr>`
      + `<td style="width:38px;height:38px;border:1.5px solid ${brand.ink};border-radius:50%;text-align:center;vertical-align:middle;color:${brand.ink};font-family:${f};font-size:15px;font-weight:600;">${esc(brand.monogram)}</td>`
      + `<td style="padding-right:10px;color:${brand.ink};font-family:${f};font-size:17px;font-weight:600;">${esc(brand.firmName)}</td></tr></table>`;
  const markDark = brand.logoUrl
    ? `<img src="${esc(brand.logoUrl)}" alt="${esc(brand.firmName)}" style="max-height:38px;max-width:180px;border:0;" />`
    : `<span style="color:#ffffff;font-family:${f};font-size:17px;font-weight:600;">${esc(brand.firmName)}</span>`;
  const tagHtml = tag ? `<span style="font-family:${f};font-size:11.5px;color:${brand.muted};">${esc(tag)}</span>` : '';

  if (brand.headerStyle === 'band') {
    return `<tr><td style="background:${brand.ink};padding:22px 40px;">`
      + `<table role="presentation" width="100%"><tr><td>${markDark}</td>`
      + `<td align="left" style="font-family:${f};font-size:11.5px;color:rgba(255,255,255,.65);">${tag ? esc(tag) : ''}</td></tr></table></td></tr>`;
  }
  if (brand.headerStyle === 'centered') {
    return `<tr><td align="center" style="padding:30px 40px 6px;border-bottom:1px solid ${brand.border};">${mark}${tag ? `<div style="padding-top:8px;">${tagHtml}</div>` : ''}</td></tr>`;
  }
  return `<tr><td style="padding:30px 40px 0;"><table role="presentation" width="100%"><tr><td>${mark}</td><td align="left">${tagHtml}</td></tr></table></td></tr>`;
}

/** כפתור CTA לפי סגנון */
export function emailButton(brand: ResolvedBrand, label: string, href: string, arrow = false): string {
  const f = emailFont(brand);
  const btnRad = brand.buttonStyle === 'pill' ? 999 : Math.max(brand.radius, 8);
  const text = esc(label) + (arrow ? '&nbsp;&nbsp;←' : '');
  const inner = `<a href="${esc(href)}" style="display:block;padding:15px 20px;font-family:${f};font-size:16px;font-weight:700;text-decoration:none;text-align:center;border-radius:${btnRad}px;`;
  return brand.buttonStyle === 'outline'
    ? `${inner}color:${brand.accent};border:2px solid ${brand.accent};">${text}</a>`
    : `${inner}color:#ffffff;background:${brand.accent};">${text}</a>`;
}

export interface BrandedEmailContent {
  heading: string;
  bodyHtml: string;           // HTML מוכן (השתמש ב-esc על טקסט משתמש)
  tag?: string;               // טקסט קטן בכותרת
  extraHtml?: string;         // בלוק נוסף מעל ה-CTA (למשל כרטיס סיכום)
  ctaLabel?: string;
  ctaHref?: string;
  ctaArrow?: boolean;
  footerNote?: string;
  showLinkFallback?: boolean;
  signature?: string;
  footerTagline?: string;     // שורה קטנה מתחת לכרטיס
}

/** ★ מעטפת המייל האחידה — כל מייל ללקוח נבנה ממנה */
export function buildBrandedEmail(brand: ResolvedBrand, c: BrandedEmailContent): string {
  const f = emailFont(brand);
  const rad = brand.radius;
  const cta = c.ctaLabel && c.ctaHref
    ? `<tr><td style="padding:8px 40px 8px;">${emailButton(brand, c.ctaLabel, c.ctaHref, c.ctaArrow)}`
      + (c.footerNote ? `<div style="text-align:center;padding-top:10px;font-family:${f};font-size:12px;color:${brand.muted};">${esc(c.footerNote)}</div>` : '')
      + (c.showLinkFallback ? `<div dir="ltr" style="text-align:center;padding-top:6px;font-family:${f};font-size:11px;color:${brand.muted};word-break:break-all;">${esc(c.ctaHref)}</div>` : '')
      + `</td></tr>`
    : '';
  const sig = (c.signature ?? brand.emailSignature ?? '').trim() || `בברכה,\n${brand.firmName}`;
  const contactLine = [brand.phone, brand.email].filter(Boolean).map(v => esc(v as string)).join(' · ');

  return `<!DOCTYPE html>
<html dir="rtl" lang="he"><head><meta charset="utf-8" /><meta name="viewport" content="width=device-width,initial-scale=1" /></head>
<body style="margin:0;padding:0;background:${brand.pageBg};font-family:${f};color:${brand.ink};">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${brand.pageBg};padding:24px 0;"><tr><td align="center">
    <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:${brand.cardBg};border:1px solid ${brand.border};border-radius:${rad + 4}px;overflow:hidden;box-shadow:0 6px 24px rgba(0,0,0,.06);">
      ${emailHeaderRow(brand, c.tag)}
      <tr><td style="padding:${brand.headerStyle === 'minimal' ? '22' : '26'}px 40px 6px;">
        <div style="font-family:${f};font-size:24px;font-weight:700;letter-spacing:-.02em;color:${brand.ink};">${esc(c.heading)}</div>
        <div style="font-family:${f};font-size:15px;color:${brand.muted};line-height:1.7;padding-top:9px;">${c.bodyHtml}</div>
      </td></tr>
      ${c.extraHtml ?? ''}
      ${cta}
      <tr><td style="padding:20px 40px 32px;border-top:1px solid ${brand.border};">
        <div style="font-family:${f};font-size:13px;color:${brand.muted};line-height:1.7;white-space:pre-line;">${esc(sig)}</div>
        ${contactLine ? `<div style="font-family:${f};font-size:12px;color:${brand.muted};padding-top:8px;">${contactLine}</div>` : ''}
      </td></tr>
    </table>
    ${c.footerTagline ? `<div style="font-family:${f};font-size:11px;color:${brand.muted};text-align:center;margin-top:14px;">${esc(c.footerTagline)}</div>` : ''}
  </td></tr></table>
</body></html>`;
}

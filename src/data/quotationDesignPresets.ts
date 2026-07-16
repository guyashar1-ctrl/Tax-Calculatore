// ─── תבניות עיצוב להצעת מחיר ולעמוד הלקוח ──────────────────────────────────
// כל תבנית היא חבילת טוקנים מתואמת (צבעים, פינות, כותרת, כפתור, פונט).
// נבחרת בסטודיו העיצוב; אפשר אחר כך לכוונן כל פרמטר בנפרד. נשמר ב-branding.

export type HeaderStyle = 'minimal' | 'centered' | 'band';
export type ButtonStyle = 'solid' | 'outline' | 'pill';
export type CornerStyle = 'sharp' | 'rounded' | 'soft';

export interface DesignTokens {
  ink: string;        // צבע כהה ראשי — כותרות ומשטח ה-CTA
  accent: string;     // צבע אקסנט — כפתורים, מחירים, הדגשות
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

export const DESIGN_PRESETS: DesignPreset[] = [
  {
    id: 'minimal-light',
    label: 'מינימל בהיר',
    description: 'נקי, אוורירי, אינדיגו עדין — ברירת המחדל',
    ink: '#1A1A1A', accent: '#4F46E5', pageBg: '#F4F3EF', cardBg: '#FFFFFF',
    border: '#EDECE7', muted: '#6B6A63', headerStyle: 'minimal', buttonStyle: 'solid', corner: 'soft', font: 'Heebo',
  },
  {
    id: 'navy-lux',
    label: 'נייבי יוקרתי',
    description: 'רשמי ומכובד, נייבי עמוק עם זהב',
    ink: '#0E1F3A', accent: '#C9A75A', pageBg: '#F4F5F8', cardBg: '#FFFFFF',
    border: '#E6E8EE', muted: '#5C6474', headerStyle: 'band', buttonStyle: 'solid', corner: 'rounded', font: 'Frank Ruhl Libre',
  },
  {
    id: 'emerald-fresh',
    label: 'אמרלד רענן',
    description: 'מודרני ונקי, ירוק ביתי ואמין',
    ink: '#0B3B36', accent: '#10B981', pageBg: '#F1F6F4', cardBg: '#FFFFFF',
    border: '#E1EBE7', muted: '#5A6B66', headerStyle: 'centered', buttonStyle: 'pill', corner: 'soft', font: 'Assistant',
  },
  {
    id: 'warm-cream',
    label: 'קרם חם',
    description: 'חמים ומזמין, גווני קרם וטרקוטה',
    ink: '#2A2622', accent: '#B4703A', pageBg: '#F7F3EC', cardBg: '#FFFDF9',
    border: '#EBE4D8', muted: '#7A7167', headerStyle: 'minimal', buttonStyle: 'solid', corner: 'soft', font: 'Frank Ruhl Libre',
  },
  {
    id: 'mono-editorial',
    label: 'מונוכרום חד',
    description: 'עריכתי ונועז, שחור-לבן עם פינות חדות',
    ink: '#111111', accent: '#111111', pageBg: '#FAFAFA', cardBg: '#FFFFFF',
    border: '#E5E5E5', muted: '#6B7280', headerStyle: 'band', buttonStyle: 'outline', corner: 'sharp', font: 'Secular One',
  },
  {
    id: 'soft-pastel',
    label: 'פסטל עדין',
    description: 'רך ונעים, סגול פסטלי ופינות מעוגלות',
    ink: '#2E2A4A', accent: '#7C6FE0', pageBg: '#F6F4FB', cardBg: '#FFFFFF',
    border: '#EAE6F5', muted: '#6A6486', headerStyle: 'centered', buttonStyle: 'pill', corner: 'soft', font: 'Rubik',
  },
];

export const DEFAULT_PRESET_ID = 'minimal-light';

export function findPreset(id?: string): DesignPreset {
  return DESIGN_PRESETS.find(p => p.id === id) ?? DESIGN_PRESETS[0];
}

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
  {
    id: 'tech-blue',
    label: 'טק כחול',
    description: 'מודרני והייטקי, כחול חי על רקע נקי',
    ink: '#0F172A', accent: '#2563EB', pageBg: '#F1F5F9', cardBg: '#FFFFFF',
    border: '#E2E8F0', muted: '#64748B', headerStyle: 'band', buttonStyle: 'pill', corner: 'rounded', font: 'Assistant',
  },
  {
    id: 'black-gold',
    label: 'שחור־זהב',
    description: 'יוקרה מקסימלית, שחור עמוק עם זהב',
    ink: '#111111', accent: '#C6A15B', pageBg: '#F4F2EE', cardBg: '#FFFFFF',
    border: '#E8E4DC', muted: '#6E6A62', headerStyle: 'band', buttonStyle: 'solid', corner: 'sharp', font: 'Frank Ruhl Libre',
  },
  {
    id: 'wine-elegant',
    label: 'בורדו קלאסי',
    description: 'חם ומכובד, גוון יין עם קרם',
    ink: '#4A1F2B', accent: '#9B2D3F', pageBg: '#F8F3F1', cardBg: '#FFFDFC',
    border: '#EEE0DD', muted: '#7C6660', headerStyle: 'centered', buttonStyle: 'solid', corner: 'soft', font: 'Frank Ruhl Libre',
  },
  {
    id: 'teal-clean',
    label: 'טורקיז נקי',
    description: 'רענן ומינימלי, טורקיז על לבן',
    ink: '#0F3B3A', accent: '#0EA5A5', pageBg: '#F0F7F6', cardBg: '#FFFFFF',
    border: '#DEEDEB', muted: '#557370', headerStyle: 'minimal', buttonStyle: 'pill', corner: 'soft', font: 'Rubik',
  },
  {
    id: 'graphite',
    label: 'גרפיט',
    description: 'מאופק ורציני, אפור פחם מונוכרומטי',
    ink: '#1F2933', accent: '#3D4B5C', pageBg: '#F5F6F7', cardBg: '#FFFFFF',
    border: '#E4E7EA', muted: '#66727E', headerStyle: 'minimal', buttonStyle: 'solid', corner: 'rounded', font: 'Assistant',
  },
  {
    id: 'sunset-warm',
    label: 'כתום שקיעה',
    description: 'אנרגטי ומזמין, כתום חם וקורן',
    ink: '#3A2417', accent: '#E0672E', pageBg: '#FBF4EE', cardBg: '#FFFDFB',
    border: '#F0E3D8', muted: '#84695A', headerStyle: 'centered', buttonStyle: 'pill', corner: 'soft', font: 'Rubik',
  },
  {
    id: 'forest-deep',
    label: 'ירוק יער',
    description: 'טבעי ובוטח, ירוק עמוק ואדמתי',
    ink: '#1B2E20', accent: '#2F7D4F', pageBg: '#F1F5F0', cardBg: '#FFFFFF',
    border: '#E1EADD', muted: '#5C6B5D', headerStyle: 'band', buttonStyle: 'solid', corner: 'rounded', font: 'Assistant',
  },
];

export const DEFAULT_PRESET_ID = 'minimal-light';

export function findPreset(id?: string): DesignPreset {
  return DESIGN_PRESETS.find(p => p.id === id) ?? DESIGN_PRESETS[0];
}

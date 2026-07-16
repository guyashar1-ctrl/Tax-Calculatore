// תבניות העיצוב — מוגדרות במקום אחד בלבד, במערכת העיצוב המשותפת:
//   supabase/functions/_shared/designSystem.ts
// הקובץ הזה הוא רק שער נוחות לצד-הלקוח (כדי לא לשנות נתיבי ייבוא קיימים).
// ⚠ אין להגדיר כאן תבניות/צבעים — הכל במקור האמת היחיד.

export {
  DESIGN_PRESETS,
  DEFAULT_PRESET_ID,
  CORNER_RADIUS,
  FONT_CHOICES,
  HEADER_STYLE_LABELS,
  BUTTON_STYLE_LABELS,
  CORNER_STYLE_LABELS,
  LEGACY_THEMES,
  findPreset,
  deriveMonogram,
} from '../../supabase/functions/_shared/designSystem.ts';

export type {
  HeaderStyle,
  ButtonStyle,
  CornerStyle,
  DesignTokens,
  DesignPreset,
  DocDesign,
  BrandingJson,
  ResolvedBrand,
} from '../../supabase/functions/_shared/designSystem.ts';

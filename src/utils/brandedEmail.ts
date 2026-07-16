// ליבת עיצוב המיילים ללקוח — מוגדרת במקום אחד בלבד, במערכת העיצוב המשותפת:
//   supabase/functions/_shared/designSystem.ts
// הקובץ הזה הוא רק שער נוחות לצד-הלקוח. אותן פונקציות בדיוק נצרכות ע"י
// ה-Edge Functions ששולחות מיילים — אין שתי מעטפות ואין צבעים קשיחים.

export {
  esc,
  emailFont,
  emailTint,
  emailHeaderRow,
  emailButton,
  buildBrandedEmail,
} from '../../supabase/functions/_shared/designSystem.ts';

export type { BrandedEmailContent } from '../../supabase/functions/_shared/designSystem.ts';

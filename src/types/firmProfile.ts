// ─── פרופיל המשרד — מקור האמת לזהות ולמיתוג של כל חוויות הלקוח ─────────────────
// מורחב מטבלת profiles. זהות-ליבה בשדות מובנים; מיתוג ותקשורת במבני jsonb גמישים
// כדי שמודולים עתידיים ייכנסו בלי migration בכל פעם.

export type BrandTheme = 'monochrome' | 'navy' | 'emerald';

export interface FirmBranding {
  theme?: BrandTheme;
  accentColor?: string; // hex, למשל #4F46E5
  font?: string;        // למשל 'Heebo'
  monogram?: string;    // ראשי תיבות — דריסה ידנית; אחרת נגזר משם המשרד
  logoPath?: string;    // נתיב הקובץ ב-Storage (bucket: firm-logos) — לצורך החלפה/מחיקה
  logoUrl?: string;     // כתובת ציבורית ללוגו — ברירת המחדל לכל מקום שלא הוגדר לו לוגו ייעודי
  logoOnDarkPath?: string; // גרסה לרקע כהה (yashar-logo-white / -light) — נתיב ב-Storage
  logoOnDarkUrl?: string;  // גרסה לרקע כהה — לרצועות הכהות במיילים ובעמודי הלקוח
  emailLogoPath?: string;  // גרסה למיילים — נתיב ב-Storage
  emailLogoUrl?: string;   // גרסה למיילים — חייבת PNG/JPG: תוכנות מייל לא מציגות SVG
  stampPath?: string;   // נתיב חותמת המשרד ב-Storage — לצורך החלפה/מחיקה
  stampUrl?: string;    // כתובת ציבורית לחותמת — מוטבעת על טפסי ייפוי כוח חתומים
  signaturePath?: string; // נתיב חתימת הרו"ח הדיגיטלית ב-Storage
  signatureUrl?: string;  // כתובת ציבורית לחתימה — הוספה בלחיצה על מסמכים לחתימה
  docDesign?: FirmDocDesign; // עיצוב עמוד הלקוח (הצעה/ייצוג) — נערך בסטודיו העיצוב
}

// עיצוב המסמכים ללקוח — תבנית + כיוונונים. שדות ריקים יורשים מהתבנית.
export interface FirmDocDesign {
  preset?: string;      // מזהה תבנית עיצוב
  accent?: string;      // צבע אקסנט (דורס)
  ink?: string;         // צבע כהה ראשי (דורס)
  pageBg?: string;      // רקע העמוד (דורס)
  cardBg?: string;      // רקע הכרטיס (דורס)
  font?: string;        // פונט (דורס)
  headerStyle?: 'minimal' | 'centered' | 'band';
  buttonStyle?: 'solid' | 'outline' | 'pill';
  corner?: 'sharp' | 'rounded' | 'soft';
}

export type PreferredLanguage = 'he' | 'en';

export interface FirmCommunication {
  senderEmail?: string;
  replyTo?: string;
  whatsapp?: string;
  calendarLink?: string;
  preferredLanguage?: PreferredLanguage;
  emailSignature?: string;
}

export interface FirmProfile {
  id: string;
  email?: string;
  fullName?: string;
  firmName?: string;
  legalName?: string;
  representativeNumber?: string;
  representativeType?: string;
  phone?: string;
  website?: string;
  address?: string;
  branding: FirmBranding;
  communication: FirmCommunication;
  settings: Record<string, unknown>;
}

export const BRAND_THEMES: { id: BrandTheme; label: string; ink: string; accent: string }[] = [
  { id: 'monochrome', label: 'מינימל מונוכרום', ink: '#1A1A1A', accent: '#4F46E5' },
  { id: 'navy', label: 'נייבי קלאסי', ink: '#0E1F3A', accent: '#C9A75A' },
  { id: 'emerald', label: 'אמרלד מודרני', ink: '#0B3B36', accent: '#10B981' },
];

export const REP_TYPE_OPTIONS = ['רואה חשבון', 'יועץ מס', 'עורך דין'];

export const FONT_OPTIONS = ['Heebo', 'Assistant', 'Rubik'];

// ─── בחירת הלוגו לפי המקום שבו הוא מוצג ──────────────────────────────────────
// שלושה מקומות, כל אחד עם דרישות אחרות:
//   app   — בתוך המערכת ובעמודי הלקוח על רקע בהיר. כל פורמט, כולל SVG.
//   dark  — רצועות כהות (ראש המייל, ראש הצעת המחיר). דורש גרסה בהירה של הלוגו.
//   email — גוף המייל. חייב PNG/JPG — ג׳ימייל ואאוטלוק לא מציגים SVG.
// מקום שלא הוגדר לו לוגו ייעודי נופל ללוגו הראשי, כך שהתנהגות קיימת לא משתנה.
export type LogoSurface = 'app' | 'dark' | 'email';

export const LOGO_SURFACE_LABELS: Record<LogoSurface, string> = {
  app: 'לוגו ראשי',
  dark: 'לוגו לרקע כהה',
  email: 'לוגו למיילים',
};

export function resolveLogo(branding: FirmBranding | undefined, surface: LogoSurface): string | undefined {
  if (!branding) return undefined;
  if (surface === 'dark') return branding.logoOnDarkUrl || branding.logoUrl;
  if (surface === 'email') return branding.emailLogoUrl || branding.logoUrl;
  return branding.logoUrl;
}

/** true אם המקום הזה משתמש בלוגו הראשי כי לא הוגדרה לו גרסה משלו */
export function isLogoFallback(branding: FirmBranding | undefined, surface: LogoSurface): boolean {
  if (!branding?.logoUrl) return false;
  if (surface === 'dark') return !branding.logoOnDarkUrl;
  if (surface === 'email') return !branding.emailLogoUrl;
  return false;
}

/** ראשי תיבות לברירת מחדל מתוך שם המשרד (עד 2 אותיות משמעותיות) */
export function deriveMonogram(firmName?: string): string {
  if (!firmName) return '★';
  const words = firmName
    .replace(/משרד|רואי|חשבון|רו״ח|רו"ח|ושות׳|ושות'|בע״מ|בע"מ/g, '')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (words.length === 0) return firmName.trim().slice(0, 2);
  if (words.length === 1) return words[0].slice(0, 2);
  return (words[0][0] || '') + (words[1][0] || '');
}

// ─── טפסים חכמים שהלקוח ממלא וחותם בדף האישי (247) ─────────────────────────
// הטופס = PDF רשמי + מלאי שדות (FieldDef, אותו מנוע פריסה וייצוא של 6101) +
// שאלון. ‼ הנתונים שטוחים: מפתח ⇒ מחרוזת. «מה בכרטיס» מחושב בשרת (_scf_card)
// ונשלח כמו שהוא; תשובה לשדה כרטיס נכתבת לכרטיס בשרת (_scf_apply), ותשובה
// שאין לה בית בכרטיס נשמרת על ההגשה. המפתחות כאן = המפתחות ב-_scf_spec.

import type { FieldDef, SmartFormTemplate } from '../types';

export type ClientFormKey = 'ita-4440' | 'vat-821';

/** הנתונים שעל הטופס: הכרטיס ∪ התשובות (∪ signDate בנעילה). ריק = חסר. */
export type CfData = Record<string, string | undefined>;

export type CfInput =
  | 'text' | 'hebrew' | 'textarea' | 'date' | 'month' | 'id' | 'phone' | 'zip' | 'house'
  | 'number' | 'money' | 'choice' | 'check' | 'bank' | 'branch' | 'account';

export interface CfField {
  key: string;
  label: string;
  input: CfInput;
  /** card = נשמר בכרטיס הלקוח; filing = רק בטופס הזה. ‼ חייב להתאים ל-_scf_spec. */
  store: 'card' | 'filing';
  required?: boolean | ((d: CfData) => boolean);
  showIf?: (d: CfData) => boolean;
  options?: { value: string; label: string }[];
  hint?: string;
  placeholder?: string;
  /** ערך מוצע (נשלח רק כשהלקוח מאשר במסך — לא נכתב לבד). */
  suggest?: (d: CfData) => string | undefined;
  /** רוחב בשורה: חצי מסך במחשב (שדות קצרים זה לצד זה). */
  half?: boolean;
}

/** מסך בשאלון: קבוצת שדות שנשאלת יחד. מופיע רק כשחסר בו משהו (או כשהלקוח בחר «עריכה»). */
export interface CfScreen {
  id: string;
  title: string | ((d: CfData) => string);
  hint?: string | ((d: CfData) => string);
  why?: string;
  fields: CfField[];
  /** כל המסך רלוונטי? (למשל מען למכתבים רק כשאין בכרטיס). */
  showIf?: (d: CfData) => boolean;
  /** מסך שנשאל תמיד (הצהרה — גם כשיש ערך, הלקוח מאשר). ברירת מחדל: רק כשחסר. */
  always?: boolean;
  /** פרטי זהות: לא נערכים מהדף — תיקון במשרד. */
  identity?: boolean;
  /** רק המשרד ממלא (למשל פקיד השומה) — לא נשאל בדף האישי. */
  officeOnly?: boolean;
  /** לפני שליחה: השלמות נגזרות (למשל «העסק בבית» ⇒ כתובת העסק = כתובת המגורים). */
  toSave?: (values: CfData, d: CfData) => CfData;
}

export interface ClientFormDef {
  key: ClientFormKey;
  template: SmartFormTemplate;
  /** הכותרת שהלקוח רואה. */
  clientTitle: string;
  /** הרשות שמקבלת את הטופס — לשורות «המשרד מגיש ל…». */
  authorityLabel: string;
  intro: string;
  /** משפטי ההצהרה שהלקוח מאשר לפני החתימה. */
  declaration: string;
  /** הערה גלויה לפני החתימה (למשל: נדרש אישור עו״ד). */
  signNote?: string;
  screens: CfScreen[];
  /** הערך לשדה בטופס, לפי הנתונים. ‼ כל עיצוב (תאריך, קידומת, פיצול) — כאן. */
  valueOf: (field: FieldDef, d: CfData) => string | boolean | undefined;
  /** שדה מצויר בהגשה הזו? (למשל עמודת בן/בת הזוג לפי מגדר). */
  isActive: (field: FieldDef, d: CfData) => boolean;
  /** נתוני דוגמה (לתבנית בספרייה ולבדיקות) — לא אדם אמיתי. */
  sample: CfData;
}

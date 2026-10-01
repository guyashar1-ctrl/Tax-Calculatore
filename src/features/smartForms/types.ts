// ─── טפסים חכמים — המודל המשותף ────────────────────────────────────────────
// «טופס חכם» = PDF רשמי של רשות (שטוח, בלי שדות AcroForm) + מלאי שדות
// סמנטי שנמדד על הקובץ הזה בדיוק. המלאי קשור לגרסת הטופס ולטביעת ה-SHA-256
// של הקובץ: קובץ אחר ⇒ המיפוי אינו חל, גם אם הוא «נראה אותו דבר».
//
// ‼ כל הקואורדינטות במרחב העמוד של ה-PDF: נקודות (1/72 אינץ'), ראשית בפינה
// השמאלית-התחתונה של ה-MediaBox, בלי סיבוב. התצוגה המקדימה אינה ממקמת
// שכבה משלה — היא מציגה את ה-PDF שהייצוא הפיק (ראה exportPdf.ts), ולכן אין
// «תצוגה» ו«ייצוא» שיכולים לסטות זה מזה.

/** מלבן במרחב העמוד (נקודות, ראשית שמאל-תחתון). */
export interface PdfRect { x: number; y: number; w: number; h: number; }

export type FieldKind =
  /** טקסט חופשי בתא/על קו. עברית, לטינית או מעורב. */
  | 'text'
  /** ספרה אחת לכל תיבה (ת"ז, טלפון, חודש/שנה). */
  | 'digits'
  /** תיבת סימון מודפסת — מסמנים X בתוכה. */
  | 'checkbox'
  /** חתימה — תמונה, בתוך מלבן, על הקו. */
  | 'signature';

/** מי מספק את הערך בדרך כלל — לא «מי מילא בפועל» (זה נשמר על הערך). */
export type FieldProvenance =
  | 'client_record'    // כרטיס הלקוח ב-PIVO
  | 'btl_sync'         // קריאה מפורטל המייצגים של ב"ל (btl.sync_file)
  | 'derived'          // נגזר מנתון אחר (למשל פירוק כתובת)
  | 'filing'           // נתון של ההגשה הזו בלבד (הצהרה, ערכים מבוקשים)
  | 'system';          // נקבע על ידי PIVO (תאריך ההצהרה, הערת נספח)

export type Requiredness =
  | 'always'           // חובה בכל הגשה
  | 'when_applicable'  // חובה כשהסעיף שלו רלוונטי לתרחיש
  | 'optional'
  | 'signer';          // חתימה — חובה כשהחותם נדרש

/** מה עושים כשהטקסט לא נכנס. */
export type OverflowRule =
  | 'shrink'           // הקטנה עד הגודל המינימלי; מעבר לזה — שגיאה חוסמת
  | 'shrink_wrap2'     // הקטנה, ואז שתי שורות; מעבר לזה — שגיאה חוסמת
  | 'appendix'         // השורות העודפות עוברות לנספח מפורש (טבלת העיסוקים)
  | 'reject'           // אורך קבוע (ספרות) — ערך ארוך מדי הוא שגיאה
  | 'none';

export interface FieldDef {
  /** מזהה סמנטי יציב. לעולם לא משתנה בין גרסאות מיפוי של אותו טופס. */
  id: string;
  /** המפתח בנתוני הטופס (ראה Btl6101Data). */
  dataKey: string;
  label: string;
  page: number;
  /** האזור שהערך מצויר בו. לספרות — המלבן של כל התיבות יחד. */
  box: PdfRect;
  kind: FieldKind;
  /** קו הבסיס של הטקסט. חסר ⇒ ממורכז אנכית בתוך box. */
  baseline?: number;
  /**
   * הקצה העליון של קו הכתיבה המודפס מתחת לשדה (נמדד). כשקיים: טקסט עם זנב
   * תחתון (g, p, ק, פסיק) מורם עד שהזנב לא נוגע בקו, וחתימה נחה עליו.
   */
  line?: number;
  align?: 'right' | 'left' | 'center';
  /** גבולות התיבות לספרות (n+1 ערכי x משמאל לימין). */
  cells?: number[];
  /**
   * קבוצות תיבות: ‏[4,7] = קידומת בארבע תיבות ואחריה מספר בשבע. הערך
   * מתפצל לקבוצות לפי formatRule; קבוצה שמקבלת פחות ספרות מיושרת לימין
   * (צמודה למספר).
   */
  groups?: number[];
  fontSize: number;
  minFontSize: number;
  /** נתיב המקור ב-PIVO — תיעודי, לתיוג ולדוח המלאי. */
  source: string;
  /** כלל העיצוב/ההמרה — תיעודי; המימוש ב-layout/resolve. */
  formatRule: string;
  /** באילו תרחישים הסעיף רלוונטי. 'always' = בכל הגשה. */
  applies: 'always' | string[];
  required: Requiredness;
  validation?: string;
  provenance: FieldProvenance;
  /** האם הערך דורש אישור מפורש של הלקוח (הצהרה) ולא רק העתקה מהכרטיס. */
  clientConfirmation: boolean;
  overflow: OverflowRule;
  /** לחתימה: מי חותם. */
  signer?: 'client' | 'spouse';
  /** מקטע בטופס — לקיבוץ במסך. */
  section: string;
}

/** אזור שנראה בטופס ובכוונה אינו ממופה — מתועד כדי שלא «ייגלה מחדש». */
export interface UnmappedArea {
  id: string;
  page: number;
  box: PdfRect;
  label: string;
  reason: string;
}

export interface SmartFormTemplate {
  key: string;
  title: string;
  authority: 'btl';
  formNumber: string;
  /** הגרסה כפי שמודפסת בתחתית הטופס («06.2026»). */
  version: string;
  /** SHA-256 של הקובץ הריק שהמיפוי נמדד עליו. */
  sha256: string;
  /** גרסת המיפוי (עולה כשמזיזים שדה על אותו קובץ). */
  mappingVersion: number;
  pageCount: number;
  pageSize: { width: number; height: number };
  /** הנתיב הציבורי של הקובץ הריק (public/). */
  fileUrl: string;
  fields: FieldDef[];
  unmapped: UnmappedArea[];
}

// ── תוצאת הפריסה: פעולות ציור במרחב העמוד ──────────────────────────────────

export type DrawOp =
  | { kind: 'text'; page: number; fieldId: string; text: string; x: number; y: number; size: number; align: 'right' | 'left' | 'center'; width: number }
  | { kind: 'check'; page: number; fieldId: string; box: PdfRect }
  | { kind: 'signature'; page: number; fieldId: string; signer: 'client' | 'spouse'; box: PdfRect; line?: number }
  | { kind: 'appendix'; page: number; rows: string[][]; header: string[]; title: string; idNumber: string; name: string };

/** בעיית פריסה — נחסמת לפני נעילה לחתימה, לעולם לא נחתכת בשקט. */
export interface LayoutIssue {
  fieldId: string;
  code: 'overflow' | 'bad_length' | 'bad_chars';
  message: string;
}

export interface LayoutResult {
  ops: DrawOp[];
  issues: LayoutIssue[];
  /** מספר העמודים בפלט (3, או 4 עם נספח). */
  pageCount: number;
}

/** גבולות הדיו של טקסט ביחס לנקודת ההתחלה וקו הבסיס (נק'), ורוחב ההתקדמות. */
export interface InkBox { minX: number; maxX: number; minY: number; maxY: number; advance: number }

/**
 * מדידת רוחב טקסט בגודל נתון — מוזרק כדי שאותה פריסה תרוץ בדפדפן ובבדיקות.
 * `ink` (רשות): גבולות הדיו מתוך הגליפים עצמם — למרכוז אופטי של ספרה בתא
 * ולהרמת זנבות מעל קו. בלעדיו הפריסה נשענת על רוחב ההתקדמות בלבד.
 */
export type MeasureText = ((text: string, size: number) => number) & { ink?: (text: string, size: number) => InkBox };

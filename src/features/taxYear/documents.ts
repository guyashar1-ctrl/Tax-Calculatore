// ─── מסמכים: שם, ומתי אפשר לבקש אותם ─────────────────────────────────────────
// ‼ אין חודש אחיד לכל המסמכים (החלטת גיא 11.10.2026). לכל סוג מסמך ולכל שנה —
// מתי הוא זמין בדרך כלל. אלה ברירות מחדל של המשרד לפי הנוהג, לא מועדים בחוק:
// מוצג למשרד «תזכורת משרד מ-…» (הערכה, לא מועד זמינות), ולא נשלחת הודעה אוטומטית ללקוח.

import type { DocKind } from './types';

export interface DocInfo {
  label: string;
  /** מתי המסמך לשנה Y זמין בדרך כלל, כ-[שנה יחסית, חודש, יום]. null = זמין מיד (אין המתנה). */
  availableFrom: ((taxYear: number) => string) | null;
  /** למה זה המועד — מוצג למשרד. */
  why: string;
  /** האם יש היום חילוץ אוטומטי לסוג הזה. אין — המשרד מזין מהמסמך. */
  extraction: 'not_supported';
  /**
   * מסמך שאינו שייך לתקופה (תעודת זהות, תעודת עוסק, חוזה רכישה, אישור זכאות לתואר): מסמך מאושר לאותו אדם
   * ולאותה ישות — מכל שנה ומכל תהליך — מספיק, ולא מבקשים אותו שוב. ‼ מסמך לתקופה (106, 867, אישור
   * יתרות ליום הצהרה, תלוש, חוזה שכירות לשנה) לעולם אינו מועבר משנה לשנה.
   */
  durable?: boolean;
}

const ymd = (y: number, m: number, d: number) => `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;

export const DOCS: Record<DocKind, DocInfo> = {
  form106: { label: 'טופס 106', availableFrom: y => ymd(y + 1, 3, 1), why: 'מעסיקים מוסרים בדרך כלל עד סוף מרץ של השנה שאחרי', extraction: 'not_supported' },
  payslipToDate: { label: 'תלוש עם נתונים מצטברים', availableFrom: null, why: 'התלוש האחרון זמין כל חודש', extraction: 'not_supported' },
  form867: { label: 'טופס 867', availableFrom: y => ymd(y + 1, 3, 1), why: 'בנקים ובתי השקעות מנפיקים בדרך כלל עד סוף מרץ', extraction: 'not_supported' },
  fundAnnualCert: { label: 'אישור שנתי מקופה', availableFrom: y => ymd(y + 1, 3, 1), why: 'קופות מנפיקות אישור שנתי למס בדרך כלל עד סוף מרץ', extraction: 'not_supported' },
  // 16.10.2026 · ההודעה של ב״ל על חישוב דמי הלידה — ממנה התאריכים «מ… עד…» ומספר הימים (לפריסה בין שנים)
  niMaternityNotice: { label: 'הודעת ביטוח לאומי על חישוב דמי הלידה', availableFrom: null, why: 'נשלחת כשדמי הלידה מאושרים; נמצאת גם באזור האישי באתר ביטוח לאומי', extraction: 'not_supported' },
  niAnnualCert: { label: 'אישור שנתי מביטוח לאומי', availableFrom: y => ymd(y + 1, 2, 1), why: 'ביטוח לאומי מעמיד אישור שנתי בדרך כלל בתחילת השנה שאחרי', extraction: 'not_supported' },
  annualPnl: { label: 'דוח רווח והפסד שנתי', availableFrom: y => ymd(y + 1, 2, 1), why: 'אחרי סגירת חודש דצמבר בספרים', extraction: 'not_supported' },
  pnlToDate: { label: 'דוח רווח והפסד עד החתך', availableFrom: null, why: 'זמין אחרי סגירת חודש החתך בספרים', extraction: 'not_supported' },
  depreciationReport: { label: 'דוח פחת', availableFrom: y => ymd(y + 1, 2, 1), why: 'מופק עם הספרים השנתיים', extraction: 'not_supported' },
  assetInvoices: { label: 'חשבוניות רכוש קבוע', availableFrom: null, why: 'קיימות ממועד הקנייה או המכירה', extraction: 'not_supported' },
  rentalContract: { label: 'חוזה שכירות', availableFrom: null, why: 'קיים ממועד החתימה', extraction: 'not_supported' },
  donationReceipts: { label: 'קבלות על תרומות', availableFrom: null, why: 'ניתנות בזמן התרומה', extraction: 'not_supported' },
  saleContract: { label: 'חוזה מכר', availableFrom: null, why: 'קיים ממועד העסקה', extraction: 'not_supported', durable: true },
  purchaseDocs: { label: 'מסמכי רכישה', availableFrom: null, why: 'קיימים ממועד הקנייה', extraction: 'not_supported', durable: true },
  shevachAssessment: { label: 'שומת מס שבח', availableFrom: null, why: 'מתקבלת אחרי הדיווח על העסקה', extraction: 'not_supported', durable: true },
  foreignStatement: { label: 'דוח שנתי מגורם בחו״ל', availableFrom: y => ymd(y + 1, 3, 1), why: 'דוחות שנתיים מחו״ל מגיעים בדרך כלל ברבעון הראשון', extraction: 'not_supported' },
  // ני״ע בחו״ל: הדוח לשנה קיים אחרי סוף השנה; 1042-S מונפק בדרך כלל עד אמצע מרץ. הערכה, לא מועד בחוק.
  foreignTradeReport: { label: 'דוח עסקאות מפורט מברוקר בחו״ל', availableFrom: y => ymd(y + 1, 1, 15), why: 'אחרי סוף השנה; מייצאים מאתר הברוקר (ב-IBKR: Flex Query, «Closed Lots»)', extraction: 'not_supported' },
  foreignTaxCert: { label: 'אישור מס זר', availableFrom: y => ymd(y + 1, 3, 15), why: 'מברוקר אמריקאי (1042-S) בדרך כלל עד אמצע מרץ; מבנק זר — לפי הבנק', extraction: 'not_supported' },
  prevAssessment: { label: 'שומה או דוח קודם', availableFrom: null, why: 'מהשנה הקודמת', extraction: 'not_supported' },
  degreeCert: { label: 'אישור זכאות לתואר', availableFrom: null, why: 'מהמוסד', extraction: 'not_supported', durable: true },
  microRegistration: { label: 'רישום כבעל עסק זעיר וסוג התיק', availableFrom: null, why: 'צילום מהאזור האישי במס הכנסה או משע״ם — עם תאריך הרישום', extraction: 'not_supported', durable: true },
  taxCoordination: { label: 'אישור תיאום מס', availableFrom: null, why: 'מהאזור האישי — עם השיעור שנקבע', extraction: 'not_supported' },
  // הצהרת הון (230): אישורים «נכון ליום ההצהרה». ‼ זמינים רק אחרי יום ההצהרה — נבדק בתמונה (picture.ts), לא כאן.
  bankBalanceCert: { label: 'אישור יתרות בנק', availableFrom: null, why: 'נכון ליום ההצהרה; מופק מאתר הבנק', extraction: 'not_supported' },
  fundWealthCert: { label: 'אישור קופה להצהרת הון', availableFrom: null, why: 'נכון ליום ההצהרה; מבקשים מהקופה', extraction: 'not_supported' },
  securitiesCost: { label: 'תדפיס עלות ניירות ערך', availableFrom: null, why: 'נכון ליום ההצהרה; מהבנק או מהברוקר', extraction: 'not_supported' },
  cryptoStatement: { label: 'פירוט מטבעות דיגיטליים', availableFrom: null, why: 'קובץ יתרות מהזירה וכתובות ארנק', extraction: 'not_supported' },
  realEstateDocs: { label: 'מסמכי נדל״ן', availableFrom: null, why: 'קיימים ממועד הרכישה', extraction: 'not_supported', durable: true },
  loanDocs: { label: 'הסכם הלוואה', availableFrom: null, why: 'קיים ממועד ההלוואה', extraction: 'not_supported', durable: true },
  liabilityBalanceCert: { label: 'אישור יתרת הלוואה', availableFrom: null, why: 'נכון ליום ההצהרה; מהבנק', extraction: 'not_supported' },
  vehicleDocs: { label: 'רישיון רכב ומסמכי קנייה', availableFrom: null, why: 'קיימים ממועד הקנייה', extraction: 'not_supported', durable: true },
  valuablesList: { label: 'רשימת תכולה ותכשיטים', availableFrom: null, why: 'הלקוח מכין; או דוח שמאי מהביטוח', extraction: 'not_supported' },
  businessBalance: { label: 'מאזן ואישור רו״ח', availableFrom: null, why: 'מרואה החשבון של החברה', extraction: 'not_supported' },
  prevWealthDeclaration: { label: 'הצהרת ההון הקודמת', availableFrom: null, why: 'בתיק המשרד או אצל הלקוח', extraction: 'not_supported', durable: true },
  demandLetter: { label: 'מכתב הדרישה', availableFrom: null, why: 'מהלקוח או ממסך המייצג', extraction: 'not_supported', durable: true },
  // קליטה והשלמת תיק המס (236). ‼ «durable» — לא מבקשים שוב מסמך מאושר; אישור לתקופה (קצבה, ביטוח, תושבות לשנה) מבקשים לפי צורך.
  idCard: { label: 'תעודת זהות עם הספח', availableFrom: null, why: 'אצל הלקוח; הספח מראה כתובת, בן/בת זוג וילדים', extraction: 'not_supported', durable: true },
  settlementCert: { label: 'אישור תושבות ביישוב', availableFrom: null, why: 'מהרשות המקומית, לשנה הרלוונטית', extraction: 'not_supported' },
  creditCerts: { label: 'אישור זכאות לתואר או תעודת שחרור', availableFrom: null, why: 'מהמוסד או מצה״ל / השירות הלאומי', extraction: 'not_supported', durable: true },
  specialStatusCert: { label: 'תעודת עולה, אישור תושב חוזר או אישור נכות', availableFrom: null, why: 'ממשרד הקליטה, מרשות המסים או מהגורם שקבע את הנכות', extraction: 'not_supported', durable: true },
  businessCert: { label: 'תעודת עוסק ואישור פתיחת תיק', availableFrom: null, why: 'מהאזור האישי במע״מ ובמס הכנסה, או מהלקוח', extraction: 'not_supported', durable: true },
  // 19.10.2026 · אירוע משפחתי ופטירה (docs/tax-foundation/research/spouse-death-year-2026-10-19.md)
  deathDocs: { label: 'תעודת פטירה וצו ירושה', availableFrom: null, why: 'תעודת הפטירה ממשרד הפנים; צו ירושה או קיום צוואה — מהרשם לענייני ירושה, אם כבר ניתן', extraction: 'not_supported', durable: true },
  severanceDocs: { label: 'טופס 161 ו-161ב מהמעסיק', availableFrom: null, why: 'המעסיק ממלא את 161 כשהעבודה נגמרת (גם בפטירה); חלק ב׳ ממלא השאיר', extraction: 'not_supported', durable: true },
  insurancePayout: { label: 'מכתב מחברת הביטוח או מהקופה על התשלום', availableFrom: null, why: 'החברה שולחת מכתב תשלום למוטבים', extraction: 'not_supported', durable: true },
  divorceDocs: { label: 'הסכם או פסק דין גירושין', availableFrom: null, why: 'מבית המשפט או מבית הדין', extraction: 'not_supported', durable: true },
  marriageDocs: { label: 'תעודת נישואין', availableFrom: null, why: 'ממשרד הפנים או מהרבנות', extraction: 'not_supported', durable: true },
  // 20.10.2026 · פערי יריב (בדיקת השלמות — docs/plans/2026-10-20-simplicity-roadmap.md §5)
  sickPayout: { label: 'אישור על פדיון ימי מחלה או חופשה', availableFrom: null, why: 'מהמעסיק: הסכום, המס שנוכה ותאריך התשלום', extraction: 'not_supported', durable: true },
  capitalizationDocs: { label: 'מכתב ההיוון וטופס 161ד', availableFrom: null, why: 'מהגורם שמשלם את הקצבה (קרן, מינהלת הגמלאות); 161ד — אם הוגש לפקיד השומה', extraction: 'not_supported', durable: true },
  equityCert: { label: 'אישור מהנאמן על מניות או אופציות מהעבודה', availableFrom: null, why: 'מהנאמן או מחברת ניהול התוכנית (ESOP, IBI, אקסלנס ועוד): מה הוקצה, מומש ונמכר בשנה', extraction: 'not_supported' },
  allowanceCert: { label: 'אישור על קצבה או תלוש פנסיה', availableFrom: null, why: 'מהגורם המשלם (קרן פנסיה, ביטוח לאומי)', extraction: 'not_supported' },
  insuranceCert: { label: 'אישור שנתי מחברת הביטוח', availableFrom: null, why: 'מחברת הביטוח; או הפוליסה', extraction: 'not_supported' },
  authorityLetter: { label: 'מכתב או דרישה מרשות', availableFrom: null, why: 'מהלקוח או מאתר הרשות', extraction: 'not_supported' },
  bankAccountCert: { label: 'אישור ניהול חשבון', availableFrom: null, why: 'מאתר הבנק, או צילום צ׳ק', extraction: 'not_supported', durable: true },
  // 12.10.2026 · שדות נספחים (מפת הכיסוי)
  inventoryCount: { label: 'ספירת מלאי לסוף השנה', availableFrom: null, why: 'נעשית ב-31 בדצמבר; הרשימה זמינה מיד אחרי', extraction: 'not_supported' },
  payrollReport: { label: 'דוח שכר שנתי (טופס 126)', availableFrom: null, why: 'מוגש לרשות עד סוף אפריל; מי שמכין את המשכורות מפיק אותו', extraction: 'not_supported' },
  badDebtDocs: { label: 'אסמכתאות לחוב שלא ייגבה', availableFrom: null, why: 'קיימות מהחשבונית ומהליכי הגבייה', extraction: 'not_supported' },
  vehicleLicense: { label: 'רישיון רכב', availableFrom: null, why: 'בידי הלקוח', extraction: 'not_supported', durable: true },
  partnershipAgreement: { label: 'הסכם שותפות ותעודת רישום', availableFrom: null, why: 'קיימים ממועד הקמת השותפות', extraction: 'not_supported', durable: true },
  premisesLease: { label: 'חוזה השכירות של העסק', availableFrom: null, why: 'קיים ממועד החתימה', extraction: 'not_supported' },
  priorDepreciation: { label: 'טבלת פחת של השנה הקודמת', availableFrom: null, why: 'מהדוח הקודם (במשרד או אצל הרו״ח הקודם)', extraction: 'not_supported' },
  businessUseDocs: { label: 'מסמכי נכס ששימש לעסק (נסח, קנייה, שכירות)', availableFrom: null, why: 'קיימים ממועד הקנייה וההשכרה', extraction: 'not_supported' },
  keyMoneyContract: { label: 'חוזה דמי מפתח', availableFrom: null, why: 'קיים ממועד העסקה', extraction: 'not_supported' },
  ownRentDocs: { label: 'חוזה שכירות למגורי הלקוח / קבלות בית אבות', availableFrom: null, why: 'קיימים ממועד החתימה או התשלום', extraction: 'not_supported' },
  otherPropertyDocs: { label: 'מסמכי הכנסה מרכוש אחר', availableFrom: null, why: 'חוזה, חשבוניות או דוח תמלוגים', extraction: 'not_supported' },
  foreignWorkDocs: { label: 'אישורי שכר, עסק או קצבה מחו״ל', availableFrom: null, why: 'מהמעסיק, מהעסק או מהגוף המשלם בחו״ל', extraction: 'not_supported' },
  foreignLease: { label: 'חוזה שכירות ודוח הכנסות של נכס בחו״ל', availableFrom: null, why: 'קיימים ממועד החתימה', extraction: 'not_supported' },
  foreignCompanyStatements: { label: 'דוחות כספיים של חברה זרה', availableFrom: null, why: 'לפי מועד סגירת הדוחות בחברה', extraction: 'not_supported' },
  saleExpenseDocs: { label: 'חשבוניות השבחה והוצאות מכירה', availableFrom: null, why: 'קיימות ממועד ההוצאה', extraction: 'not_supported' },
  specialDealDocs: { label: 'מסמכי עסקה מיוחדת', availableFrom: null, why: 'קיימים ממועד העסקה', extraction: 'not_supported' },
  other: { label: 'מסמך', availableFrom: null, why: '', extraction: 'not_supported' },
};

const addDays = (iso: string, n: number) => {
  const d = new Date(iso + 'T00:00:00');
  d.setDate(d.getDate() + n);
  return ymd(d.getFullYear(), d.getMonth() + 1, d.getDate());
};

/**
 * מועד המעקב למסמך שהלקוח סימן «אין לי עדיין».
 * לפני המועד הרגיל — המועד הרגיל. אחריו (או כשאין המתנה) — 30 יום מהיום,
 * כי המסמך כבר אמור להיות קיים ומשהו מעכב אותו.
 */
export function followUpFor(doc: DocKind, taxYear: number, todayIso: string): { followUpOn: string; why: string } {
  const info = DOCS[doc];
  const usual = info.availableFrom?.(taxYear);
  if (usual && usual > todayIso) return { followUpOn: usual, why: info.why };
  return { followUpOn: addDays(todayIso, 30), why: usual ? `${info.why}; המועד עבר — לבדוק שוב בעוד חודש` : 'לבדוק שוב בעוד חודש' };
}

/** האם כבר אפשר לבקש את המסמך לשנה הזו. */
export function canRequestNow(doc: DocKind, taxYear: number, todayIso: string): boolean {
  const usual = DOCS[doc].availableFrom?.(taxYear);
  return !usual || usual <= todayIso;
}

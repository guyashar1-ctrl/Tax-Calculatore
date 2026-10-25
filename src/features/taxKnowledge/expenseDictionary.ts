// ─── מילון סיווג הוצאות והכנסות — משותף לפייפרלס ולמשרד (R14) ─────────────────
// ‼ ארבע הכרעות נפרדות בכל שורה, ואין להסיק אחת מאחרת: סיווג חשבונאי · קוד 6111 · הכרה במס הכנסה · מע״מ תשומות.
// ‼ הסיווג לפי מהות העסקה והעסק — הספק לבדו לא קובע (Google Ads = פרסום; Google Workspace = תוכנה).
// ‼ קודי 6111 לשנת 2025 מטופס 6111 (מעודכן 11.2025) ומבנה הקובץ (28.05.2026). codeStatus 'interpretation' = אין בטופס
//   קוד ייעודי והמיפוי הוא המלצה — ממתין להחלטת המשרד (למשל מנויי תוכנה ⇒ 3680, תקשורת ⇒ 3650).
// ‼ הכללים במס הכנסה ובמע״מ מקוצרים; המקור המלא — «הוצאות מוכרות» (data/expenseKnowledge.ts) והמדריך 2025.
// מחקר: docs/tax-foundation/research/form6111-expense-dictionary-2026-10-13.md (§2).
// ‼ שם/קוד מפייפרלס: רשימת הקטגוריות של פייפרלס עוד לא התקבלה — העמודה ריקה עד שגיא ישלח ייצוא.

import type { ClaimStatus } from './claim';

export type DictGroup = 'income' | 'cogs' | 'office' | 'digital' | 'vehicle' | 'people' | 'finance' | 'hospitality' | 'assets' | 'notExpense';
export const DICT_GROUP_HE: Record<DictGroup, string> = {
  income: 'הכנסות', cogs: 'עלות מכר ועבודה ישירה', office: 'משרד ותפעול', digital: 'תוכנה, תקשורת ודיגיטל', vehicle: 'רכב, נסיעות ולינה',
  people: 'שכר ושירותים מקצועיים', finance: 'ביטוח, מימון ועמלות', hospitality: 'כיבוד, מתנות, השתלמות, תרומות וקנסות', assets: 'נכסים קבועים', notExpense: 'מה שאינו הוצאה',
};

export interface DictEntry {
  key: string;
  group: DictGroup;
  name: string;
  examples: string;
  /** קוד 6111 לשנת 2025 (או «מאזן …» / «לא ברווח והפסד»). */
  code6111: string;
  codeStatus: ClaimStatus;
  /** שורה בנספח 1320. */
  line1320?: string;
  incomeTax: string;
  vat: string;
  note?: string;
  /** מעמד הכלל במס הכנסה ובמע״מ. */
  ruleStatus: ClaimStatus;
  /** שם/קוד הקטגוריה בפייפרלס — כשיתקבל ייצוא. */
  paperless?: string;
}

const E = (key: string, group: DictGroup, name: string, examples: string, code6111: string, codeStatus: ClaimStatus, line1320: string | undefined, incomeTax: string, vat: string, ruleStatus: ClaimStatus, note?: string): DictEntry =>
  ({ key, group, name, examples, code6111, codeStatus, line1320, incomeTax, vat, ruleStatus, note });

export const DICTIONARY_TAX_YEAR = 2025;

export const DICTIONARY: DictEntry[] = [
  // הכנסות
  E('revenue-services-il', 'income', 'הכנסות משירותים בארץ', 'שכר טרחה, ייעוץ, ריטיינר', '1030', 'verified', '1', 'הכנסה מעסק', 'עוסק מורשה — 18%; עוסק פטור — בלי מע״מ', 'verified', 'לא לקזז מול הוצאות'),
  E('revenue-sales-il', 'income', 'מכירות בארץ', 'מכירת מוצרים', '1010', 'verified', '1', 'הכנסה מעסק', '18%', 'verified'),
  E('revenue-services-abroad', 'income', 'שירותים ללקוח בחו״ל', 'פרילנס ללקוח זר', '1040', 'verified', '1', 'הכנסה מעסק', 'שיעור אפס לפי סעיף 30 — לא נבדק', 'open'),
  E('revenue-other-business', 'income', 'הכנסות אחרות מהעסק', 'פיצוי «חרבות ברזל» על נזק עקיף, החזרים', '1090 (או 5290)', 'interpretation', '1', 'הכנסה מעסק (1320 שורה 1 כוללת פיצוי נזק עקיף)', 'פיצוי בגין נזק עקיף ממלחמה אינו חייב במע״מ; מענק אחר נבדק לפי המסלול שלו', 'open'),
  E('grant-income', 'income', 'מענקים', 'רשות החדשנות, מענק השקעה', '5270 (מו״פ: 2570)', 'verified', '1', 'מענק לנכס בר־פחת בתוך 5 שנים מקטין את מחיר הנכס', 'פתוח', 'open', 'בטופס מודפס 2570 בטעות — בקובץ 5270'),
  E('finance-income', 'income', 'ריבית והפרשי שער בעסק', 'ריבית בחשבון העסק', '5110 / 5130', 'verified', undefined, 'אין לקזז הכנסות ריבית מהוצאות ריבית', 'אין', 'verified', 'ריבית מפיקדון פרטי — 1301, לא העסק'),
  E('asset-sale-gain', 'income', 'מכירת רכוש קבוע', 'מכירת מחשב או רכב של העסק', '5210 / 5310 · התאמה 170', 'verified', undefined, 'רווח הון (1399 / 1342)', 'עסקה חייבת', 'verified'),
  // עלות מכר
  E('cogs-goods-il', 'cogs', 'קניית סחורה בארץ', 'סחורה לחנות', '1320', 'verified', '2ב', 'מלא, דרך עלות המכר', 'מלא כנגד חשבונית מס', 'verified', 'מלאי: 1400 / 1450'),
  E('cogs-goods-abroad', 'cogs', 'קניית סחורה מחו״ל', 'יבוא, AliExpress לסחורה', '1340', 'verified', '2ב', 'מלא', 'מע״מ יבוא לפי רשימון', 'verified'),
  E('subcontractor-direct', 'cogs', 'קבלן משנה לעבודת לקוח', 'מעצב או מתכנת שמבצע פרויקט', '1310', 'interpretation', '4', 'מלא; חובת ניכוי במקור', 'מלא כנגד חשבונית מס', 'verified', 'שאינו ישיר — «עבודות חוץ» 3520'),
  // משרד
  E('rent-office', 'office', 'שכירות משרד או חנות', 'שכירות חודשית', '3570', 'verified', '11', 'מלא; פרטי המשכיר בחלק ד׳ של 1320; ניכוי במקור', 'מלא כנגד חשבונית; משכיר פרטי — פתוח', 'verified'),
  E('home-office', 'office', 'משרד בבית (חלק יחסי)', 'חלק משכירות, ארנונה, חשמל', 'לפי מהות: 3570 / 3575 / 3590', 'interpretation', 'לפי מהות', 'החלק העסקי המבוסס על שימוש בפועל ומסמכים; אין שיעור אחיד לכל משרד ביתי', 'לפי יחס השימוש המוכח; רק בשימוש בלתי מסוים ובהיעדר קביעת מנהל — ⅔ כשהעיקר עסקי או ¼ כשהעיקר פרטי', 'interpretation', 'האחוז נקבע ברמת העסק והשנה, לא לכל קבלה'),
  E('municipal-tax', 'office', 'ארנונה', 'ארנונה עסקית', '3575', 'verified', '13', 'בעסק מלא; בבית יחסי', 'אין מע״מ', 'interpretation'),
  E('utilities', 'office', 'חשמל ומים', 'חשמל בעסק', '3590', 'verified', '8', 'בעסק מלא', 'לפי שימוש בעסקאות חייבות; בבית — יחס מוכח, או כללי תקנה 18 לשימוש בלתי מסוים', 'verified'),
  E('repairs-maintenance', 'office', 'אחזקה ותיקונים שוטפים', 'טכנאי, תיקון מזגן', '3550', 'verified', '8', 'שוטף מלא; שיפוץ — הוני', 'מלא', 'verified'),
  E('office-supplies', 'office', 'הוצאות משרדיות', 'נייר, דיו, הדפסות', '3680', 'verified', '9', 'מלא', 'מלא', 'verified'),
  E('business-licenses', 'office', 'אגרות ורישוי עסק', 'רישיון עסק, אגרת רשם', '3575', 'verified', '13', 'מלא; קנס — לא', 'אין מע״מ על אגרות', 'interpretation'),
  E('professional-dues', 'office', 'דמי חבר מקצועיים', 'לשכת רו״ח / עו״ד', '3690 (או 3600)', 'interpretation', '16', 'מלא', 'אין חשבונית מס', 'interpretation'),
  // דיגיטל
  E('software-subscription', 'digital', 'מנויי תוכנה ו-SaaS', 'Claude, ChatGPT, Google Workspace, Microsoft 365, Adobe, Canva, תוכנת הנהלת חשבונות, CRM', '3680 (חלופות 3550 / 3690)', 'interpretation', '9', 'מנוי שוטף — מלא; שנתי מראש — נפרס על התקופה', 'ספק ישראלי — מלא; ספק זר — חשבונית עצמית. ספק זר שגובה מע״מ ישראלי — פתוח', 'interpretation', 'חשבון פרטי או משפחתי — רק החלק העסקי'),
  E('software-license', 'digital', 'רישיון תוכנה קבוע / פיתוח מערכת', 'רישיון לצמיתות, פיתוח ייעודי', 'מאזן 8050 / 8090 · פחת 3580', 'verified', '17', 'הוני; פחת (שיעור לתוכנה — בפרקטיקה 33%, לא מפורש)', 'מלא בשנת הרכישה', 'open'),
  E('hosting-domain', 'digital', 'אחסון אתר ודומיין', 'אחסון, דומיין, CDN, AWS', '3650 (או 3620 כשחלק משיווק)', 'interpretation', '9', 'שוטף מלא; בניית אתר — הונית', 'ספק זר — חשבונית עצמית', 'interpretation'),
  E('internet', 'digital', 'אינטרנט', 'ספק אינטרנט, תשתית', '3650', 'interpretation', '9', 'במשרד מלא; בבית יחסי', 'בבית ⅔ או ¼', 'interpretation'),
  E('mobile-phone', 'digital', 'טלפון נייד — שימוש', 'חבילת סלולר', '3650', 'interpretation', '9', 'הנמוך מבין 1,380 ₪ לשנה או מחצית ההוצאה — אינו מוכר', '⅔ (או ¼)', 'verified', 'המכשיר עצמו — נכס (מחשבים וטלפונים)'),
  E('landline-home', 'digital', 'טלפון קווי בבית', 'קו ביתי', '3650', 'interpretation', '9', 'רק אם הבית עיקר העסק; כללי סכום במדריך', '¼ (או ⅔)', 'verified'),
  E('advertising', 'digital', 'פרסום ושיווק', 'Google Ads, Meta, דפוס, משפיענים', '3620 (מערך מכירה: 3120)', 'verified', '16', 'מלא', 'ספק זר — חשבונית עצמית', 'interpretation', 'פריט פרסומי ממותג — פרסום, לא מתנה'),
  // רכב
  E('vehicle-fuel', 'vehicle', 'דלק', 'תחנת דלק (גם בסופר)', '3567 (החזר בלו 3568)', 'verified', '7', 'בסל הרכב: הגבוה מבין 45% או ההוצאות פחות שווי השימוש', '⅔ או ¼', 'verified', 'הלא־מוכר מוחזר בדוח ההתאמה (110)'),
  E('vehicle-maintenance', 'vehicle', 'אחזקת רכב וביטוח רכב', 'טיפול, טסט, צמיגים, ביטוח רכב', '3566', 'verified', '7', 'באותו סל; פרטי הרכב וקריאות מונה בחלק ג׳ של 1320 — תנאי', '⅔ או ¼; ביטוח — אין מע״מ', 'verified'),
  E('vehicle-leasing', 'vehicle', 'ליסינג', 'ליסינג תפעולי', '3566', 'verified', '7', 'בתוך סל הרכב', '⅔ או ¼ — לאמת לליסינג', 'interpretation'),
  E('vehicle-purchase', 'vehicle', 'רכישת רכב', 'קניית רכב פרטי', 'מאזן 8040', 'verified', '7', 'הוני; פחת בסל המוגבל', 'אסור ברכב פרטי (תקנה 14)', 'verified'),
  E('parking-travel', 'vehicle', 'חניה בנסיעות וכבישי אגרה', 'חניון בפגישה, כביש 6', '3566', 'verified', '7', 'בתוך סל הרכב', '⅔ או ¼', 'verified'),
  E('public-transport', 'vehicle', 'תחבורה ציבורית ומוניות', 'רב־קו, מונית לפגישה', '3560', 'verified', '12', 'בייצור הכנסה — מלא; מהבית לעסק — לא', 'לרוב אין חשבונית מס', 'verified'),
  E('lodging-il', 'vehicle', 'לינה בארץ', 'מלון בכנס רחוק', '3560', 'verified', '12', 'מ-100 ק״מ: עד 156$ מלא; מעל — 75% בטווח', 'לינה — כן; ארוחות — לא', 'verified'),
  E('travel-abroad', 'vehicle', 'נסיעה לחו״ל', 'טיסה, מלון, שכירת רכב', '3660', 'verified', '12', 'נסיעה הכרחית; תקרות לינה ושהייה בדולרים; חלק פרטי — לא', 'לרוב אין', 'verified'),
  // אנשים
  E('salaries', 'people', 'שכר עבודה', 'תלושים', '3511 (עובדי ביצוע: 1306)', 'verified', '3ב', 'מלא; בני משפחה — עבודה בפועל ושכר סביר', 'לא עסקה', 'interpretation'),
  E('outsourced-services', 'people', 'עבודות חוץ שאינן ישירות', 'עוזר וירטואלי, תמיכה טכנית', '3520', 'interpretation', '4 עד 5', 'מלא; ניכוי במקור לפי העניין', 'מלא כנגד חשבונית מס', 'interpretation'),
  E('accounting-fees', 'people', 'הנהלת חשבונות ורו״ח', 'שכר טרחת רו״ח, הכנת הדוח', '3540', 'verified', '10', 'מלא (17(11)); במזומן — בשנת התשלום', 'מלא', 'verified'),
  E('legal-fees', 'people', 'הוצאות משפטיות', 'עו״ד בעניין עסקי', '3665', 'verified', '5', 'מלא כשקשור לעסק; עניין פרטי — לא', 'מלא', 'interpretation'),
  // מימון
  E('business-insurance', 'finance', 'ביטוח עסקי ואחריות מקצועית', 'תכולה, צד ג׳, חבות מעבידים, אחריות מקצועית', '3515', 'verified', '14', 'מלא', 'אין — פרמיה ללא מע״מ', 'interpretation', 'ביטוח רכב — ברכב; אכ״ע של בעל העסק — לא כאן'),
  E('disability-insurance-owner', 'finance', 'אובדן כושר עבודה של בעל העסק', 'פוליסת אכ״ע', 'לא ברווח והפסד', 'verified', '—', 'ניכוי בדוח: 112/113, עד 3.5% ועד 399,480 ₪', 'אין', 'verified'),
  E('bank-fees', 'finance', 'עמלות בנק', 'עמלות חשבון והעברות', '5010 (או 3100)', 'interpretation', '6 / 16', 'מוכר כשעסקי', 'אין', 'interpretation', 'הבחירה בין מימון ל-3100 — החלטת משרד'),
  E('card-clearing-fees', 'finance', 'עמלות סליקה ואשראי', 'חברת אשראי, ספק סליקה', '3100', 'verified', '16', 'מלא', 'בנק / חברת אשראי — אין; ספק שאינו מוסד כספי — פתוח', 'open'),
  E('interest-business', 'finance', 'ריבית על הלוואה עסקית', 'ריבית, הצמדה', '5010', 'verified', '6', 'מוכר אם האשראי שימש בייצור ההכנסה', 'אין', 'verified', 'קרן ההלוואה אינה הוצאה'),
  E('tax-interest-fines', 'finance', 'ריבית וקנסות על חוב מס', 'פיגורים במע״מ או בב״ל', '5051 · התאמה 182 או 190', 'verified', '16', 'לא מוכר', '—', 'interpretation'),
  E('bad-debts', 'finance', 'חובות אבודים', 'לקוח שלא שילם', '3610', 'verified', '15', 'בתנאים; רק בשיטה המצטברת', 'החזר מס עסקאות בתנאים', 'verified'),
  // כיבוד ותרומות
  E('refreshments-onsite', 'hospitality', 'כיבוד קל במקום העסק', 'קפה, עוגיות לאורחים', '3625 · 20% בהתאמה 110', 'verified', '16', '80%, רק במקום העסק', 'בפועל לא מקזזים', 'verified', 'קבלה מסופרמרקט — לפי מה שנקנה, לא לפי החנות'),
  E('meals-hospitality', 'hospitality', 'ארוחות ואירוח בארץ', 'מסעדה עם לקוח', '3625 · מלוא הסכום בהתאמה 110', 'verified', '16 + 20', 'לא מוכר (אורח מחו״ל — חריג)', 'אסור', 'interpretation'),
  E('gifts-business', 'hospitality', 'מתנות ללקוחות ולספקים', 'שי לחג', '3625 · העודף בהתאמה 110', 'verified', '16', 'עד 240 ₪ לאדם לשנה, עם פרטי המקבל', 'בפועל לא מקזזים', 'verified'),
  E('professional-training', 'hospitality', 'השתלמויות, כנסים וספרות מקצועית', 'קורס מקצועי, ספר, מנוי מקצועי', '3600', 'verified', '16', 'שמירה על ידע קיים — כן; מקצוע חדש — לא', 'מלא כשעסקי', 'interpretation'),
  E('donations', 'hospitality', 'תרומות', 'תרומה למוסד מוכר', '3625 · מוחזר בהתאמה 183', 'verified', '20', 'לא הוצאה — זיכוי 35% לפי סעיף 46 בדוח', 'אין', 'verified', 'חסות עם תמורה פרסומית — פרסום'),
  E('fines', 'hospitality', 'קנסות', 'דוח חניה, עיצום', '3625 · מוחזר בהתאמה 190', 'interpretation', '20', 'לא מוכר', 'אין', 'verified'),
  // נכסים
  E('equipment-computers', 'assets', 'מחשבים וטלפונים', 'מחשב נייד, מסך, סמארטפון', 'מאזן 8050 · פחת 3580', 'verified', '17 (1342)', 'פחת 33%', 'מלא בשנת הרכישה; מעורב — ⅔ או ¼', 'verified', 'אין בחוק סף לניכוי מיידי — מדיניות משרד (פתוח)'),
  E('equipment-furniture', 'assets', 'ריהוט', 'שולחן, כיסא', 'מאזן 8060 · פחת 3580', 'verified', '17', 'פחת 6%', 'מלא', 'verified'),
  E('equipment-general', 'assets', 'ציוד ומכונות', 'מכונה, מזגן', 'מאזן 8030 · פחת 3580', 'verified', '17', 'ציוד כללי 7%; מיזוג 10%', 'מלא', 'verified'),
  E('leasehold-improvements', 'assets', 'שיפורים במושכר', 'שיפוץ משרד שכור', 'מאזן 8020 · פחת 3580', 'verified', '17', 'הוני', 'מלא', 'interpretation'),
  // לא הוצאה
  E('owner-draw', 'notExpense', 'משיכות בעלים', 'העברה לחשבון פרטי', 'מאזן 9910', 'interpretation', undefined, 'לא הוצאה', '—', 'interpretation'),
  E('owner-ni', 'notExpense', 'ביטוח לאומי של בעל העסק', 'דמי ביטוח כעצמאי', 'לא ברווח והפסד', 'verified', undefined, 'בדוח: ניכוי 52% (030), בלי בריאות וקנסות', '—', 'verified'),
  E('owner-pension-studyfund', 'notExpense', 'פנסיה וקרן השתלמות של בעל העסק', 'הפקדה עצמאית', 'לא ברווח והפסד', 'verified', undefined, 'בדוח: 135/180, 136/137', '—', 'verified'),
  E('vat-payments', 'notExpense', 'תשלומי מע״מ ומקדמות', 'דוח תקופתי, מקדמות מס הכנסה', 'מאזן', 'interpretation', undefined, 'לא הוצאה', '—', 'interpretation'),
  E('loan-principal', 'notExpense', 'קרן הלוואה', 'החזר חודשי', 'מאזן 9120 / 9620', 'verified', undefined, 'רק הריבית היא הוצאה', '—', 'verified'),
  E('personal-expense', 'notExpense', 'הוצאה פרטית', 'קניות לבית, בילוי', 'לא ברווח והפסד', 'verified', undefined, 'לא מוכר — הספק לבדו לא מעיד', '—', 'verified'),
  E('uncategorized', 'notExpense', 'לא מסווג — לבדיקה', 'עסקה לא ברורה', '—', 'interpretation', undefined, 'אסור לשדר 6111 כשיש יתרה כאן', '—', 'interpretation'),
];

/** טבלה להעתקה לפייפרלס או לגיליון — עמודות קבועות, טאב ביניהן. */
export function dictionaryTsv(entries: DictEntry[] = DICTIONARY): string {
  const head = ['מפתח', 'קבוצה', 'שם', 'דוגמאות', `קוד 6111 (${DICTIONARY_TAX_YEAR})`, 'מעמד הקוד', 'שורה ב-1320', 'מס הכנסה', 'מע״מ תשומות', 'הערה', 'שם בפייפרלס'];
  const st = (s: ClaimStatus) => (s === 'verified' ? 'מאומת' : s === 'interpretation' ? 'המלצה — להחלטת המשרד' : 'פתוח');
  const clean = (s?: string) => (s ?? '').replace(/[\t\n]/g, ' ');
  return [head.join('\t'), ...entries.map(e => [e.key, DICT_GROUP_HE[e.group], e.name, e.examples, e.code6111, st(e.codeStatus), e.line1320 ?? '', e.incomeTax, e.vat, e.note ?? '', e.paperless ?? ''].map(clean).join('\t'))].join('\n');
}

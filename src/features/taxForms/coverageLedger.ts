// ─── רשימת הכיסוי הסגורה — כל מה שהטפסים הרשמיים שואלים, ומאיפה המערכת יודעת אותו (31.10.2026) ──────────────
// ‼ גיא (31.10.2026, אחרי ביקורת הדוח השנתי והצהרת ההון): «אסור לך לעשות טעויות כאלה… כל פעם לעבור על כל הדוח, כל הפקודה וכל
//   התקנות». הכלל: כל שאלון סוגר 100% מקלטי החישוב — שאלה ללקוח, קריאה מרשות, מסמך שהלקוח העלה (הקלדה לידו), או מה שגיא קבע
//   שהוא של המשרד (רו״ה, 1320, פחת, הפסדים מועברים, מקדמות, ניכוי במקור, ב״ל כעצמאי — 30.10.2026). בלי הקלדה חופשית במשרד.
// ‼ הרשימה נבנית מהמקור הרשמי, לא מהקוד: שורה לכל שדה בקטלוג 1301 (305, נקרא מהטופס ומפרק ד במדריך), לכל נספח, ולכל שורה
//   ב-1219 (wealthFormGuide). הבדיקה (__tests__/coverageLedger.test.ts) נופלת כשחסרה שורה, כשמקור לא קיים, כששאלה שנתית
//   אינה מגיעה לשום חישוב, וכשפער חדש נוסף בלי שנרשם.
// ‼ ארבעה מצבים — ואין חמישי:
//   covered — המערכת ממלאת את השדה, וכל נתון בו מגיע ממקור מותר.
//   blocks  — המערכת לא מחשבת; כשזה חל, תשובת הלקוח עוצרת את הדוח («גיליון חלקי» / חוסם) ושם הנושא מופיע. לא נעלם.
//   open    — פער: נעלם בשקט, מוקלד במשרד בלי מסמך, או מסומן «לא» לבד בלי שאלה. הבדיקה סופרת אותם; היעד — אפס.
//   na      — לא שלנו למלא (משרד השומה, מדבקה, חתימה בסט, שדה רשות שהטופס לא מחייב) — תמיד עם הסיבה.
// ‼ מקורות (from): q:<פריט שאלון של הלקוח> · o:<פריט של המשרד מהרשימה הסגורה OFFICE_ITEMS> · doc:<שורה בתבנית מסמך>
//   · card:<שדה בכרטיס> · auth:<קריאה מרשות> · calc (נגזר משדות אחרים). שורת open רשאית לצטט כל פריט קיים — זה מה שחסר בו.

export type LedgerStatus = 'covered' | 'blocks' | 'open' | 'na';
export interface LedgerRow { s: LedgerStatus; from?: string[]; note: string }

/** פריטי משרד שמותרים כמקור (גיא, 30.10.2026): עבודת המשרד עצמו, או הקלדה ליד מסמך שהלקוח העלה / קריאה מרשות. */
export const OFFICE_ITEMS: Record<string, string> = {
  'business.profit': 'רו״ה — המשרד (פייפרלס / הספרים)',
  'business.books': 'רו״ה — המשרד',
  'business.depreciation': 'דוח פחת 1342 — המשרד',
  'business.priorDepreciation': 'פחת משנה קודמת — המשרד',
  'business.microTrack': 'מסלול עסק זעיר — לפי הרישום ברשות',
  'business.microRegistration': 'אישור רישום כעסק זעיר — רשות',
  'carryForward.balances': 'הפסדים מועברים — המשרד (שומה קודמת)',
  'payments.advances': 'מקדמות — המשרד משע״ם',
  'payments.withholding': 'ניכוי במקור — המשרד משע״ם / אישורי ניכוי',
  'payments.niPaid': 'ב״ל ששולם כעצמאי — אישור שנתי מב״ל, הקלדה לידו',
  'wealth.business.total': 'הון העסק — מהמאזן, המשרד',
  'wealth.business.books': 'מאזן העסק — המשרד',
  'wealth.prevDeclaration': 'הצהרת ההון הקודמת — המסמך שהוגש',
};
/** קריאות מרשות ועבודות משרד שאינן פריט בשאלון. */
export const AUTH_SOURCES = ['shaam', 'btl'] as const;
export const OFFICE_WORK = ['books1320', 'dep1342', 'filing'] as const;

const c = (from: string[], note: string): LedgerRow => ({ s: 'covered', from, note });
const b = (from: string[], note: string): LedgerRow => ({ s: 'blocks', from, note });
const o = (from: string[], note: string): LedgerRow => ({ s: 'open', from, note });
const na = (note: string): LedgerRow => ({ s: 'na', note });
const range = (a: number, z: number) => Array.from({ length: z - a + 1 }, (_, i) => `F${String(a + i).padStart(3, '0')}`);
const each = (ids: string[], row: LedgerRow) => Object.fromEntries(ids.map(id => [id, row]));

const NO_Q = 'מסומן «לא» לבד — אין שאלה ללקוח';
const OFFICE_Q = 'נשאל רק את המשרד (פריט נדיר) — לא את הלקוח';

// ── 1301 / 2025 — לפי מזהה בקטלוג (src/features/taxForms/data/form1301-2025.catalog.json) ──
export const LEDGER_1301: Record<string, LedgerRow> = {
  // חלק א׳ — פרטים כלליים והצהרות
  F001: c(['card:familyStatus', 'calc'], 'נגזר: נשוי/אה ומי בדוח'),
  F002: c(['calc'], 'נגזר ממי שבדוח'),
  F003: o(['calc'], 'דוח מרצון לשם החזר — מסומן «לא» לבד; צריך להיגזר מחובת ההגשה (GMF 154)'),
  F004: c(['card:spouseWorking', 'card:businesses'], 'נגזר מעבודה/עסק של בן/בת הזוג בכרטיס'),
  F005: c(['card:spouseWorking', 'card:businesses'], 'נגזר מעבודה/עסק של בן/בת הזוג בכרטיס'),
  F006: o([], `בן/בת זוג עוזר/ת בעסק — ${NO_Q} (משפיע על נקודות, סעיף 63)`),
  F007: o([], `«מקור הכנסה משותף» (66(ד)) — ${NO_Q}; קובע חישוב נפרד או מאוחד`),
  F008: na('הסכמת בן/בת הזוג לצפייה בתרומות במקוון — פרוצדורה של המשדר'),
  F009: na('ייפוי כוח לצפייה בתרומות — פרוצדורה של המשדר (יש ייפוי כוח מהייצוג)'),
  F010: c(['o:business.microTrack'], 'מסלול עסק זעיר לשנה'),
  F011: c(['o:business.microTrack'], 'ויתור על מסלול זעיר — מסלול השנה'),
  F012: c(['q:household.aliyahDetails', 'card:isNewImmigrant', 'card:isReturningResident'], 'עולה / תושב חוזר — מהשאלון לכרטיס'),
  F013: o(['q:household.aliyahDetails'], 'תאריך הגעה מלא — בכרטיס רק שנה וחודש; היום מוקלד במשרד'),
  F014: o(['q:household.aliyahDetails'], 'תאריך הגעה מלא (בן/בת זוג) — בכרטיס רק שנה וחודש'),
  F015: o([], `נכסים בחו״ל מעל 2,086,000 — ${NO_Q}`),
  F016: c(['calc'], 'נגזר מההכנסות בדוח'),
  F017: o([], `מחזור ני״ע סחירים מעל 2,810,000 — ${NO_Q}`),
  F018: b(['q:companies.controlled'], 'חברת מעטים 62א — «כן» עוצר («חברה בשליטה»)'),
  F019: o([], `הכנסות מפעילות באינטרנט — ${NO_Q}`),
  F020: o([], `הכנסות מאנרגיות מתחדשות — ${NO_Q}`),
  F021: o(['q:sales.sold'], 'מימוש מטבע וירטואלי — נשאל ב«מכירה», אבל הסימון כאן לא מחובר ויוצא «לא»'),
  F022: b(['q:special.disabilityDetails', 'card:disabilityPercentage'], 'נכה/עיוור 9(5) — מהכרטיס; «כן» עוצר (הפטור לא מחושב בדוח)'),
  F023: b(['q:special.disabilityDetails', 'card:disabilityPercentage'], '9(5) עם גמלת משרד הביטחון — מהכרטיס; עוצר'),
  F024: o(['o:special.moneyAbroad'], `העברת כספים לחו״ל מעל 500,000 — ${OFFICE_Q}`),
  F025: o(['doc:106.employerDeposits'], 'נספח 134 (הפקדות מעביד מעל התקרה) — קבוע «לא»; צריך להיגזר מנתוני 106'),
  F026: o(['q:niBenefits.maternity'], 'בקשת פריסת דמי לידה — בחירה של הלקוח שלא נשאלת'),
  F027: o(['o:special.nonResident'], `תושבות — ${OFFICE_Q}`),
  ...each(['F028', 'F029', 'F030', 'F031'], o(['o:special.trust'], `נאמנות — ${OFFICE_Q}; «כן» עוצר`)),
  F032: o([], `מכירת יחידות בשותפות נפט — ${NO_Q}`),
  F033: o([], `מניות מוקצות בחילוף מניות — ${NO_Q}`),
  F034: o(['card:isKibbutzMember'], 'חבר קיבוץ — מהכרטיס, אבל אין שאלה שכותבת אותו (special.kibbutz של המשרד לא מחובר)'),
  F035: o(['card:isKibbutzMember'], 'מספר תיק הקיבוץ — לא נאסף'),
  F036: o(['card:isKibbutzMember'], 'הכנסה מועברת לקיבוץ — לא נאסף'),
  F037: o([], `נכס מהוראת השעה (סעיף 6) — ${NO_Q}`),
  F038: o([], `נכס מהוראת השעה שיצא מהרשות — ${NO_Q}`),
  F039: o([], `הכנסות מבניין 8א(ג) — ${NO_Q}`),
  F040: o([], `בעל שליטה בחבר בני אדם תושב חוץ — ${NO_Q}`),
  F041: o([], `זכויות בחבר בני אדם תושב חוץ — ${NO_Q}`),
  F042: o([], `עסקאות עם צד קשור בחו״ל (85א) — ${NO_Q}`),
  ...each(['F043', 'F044', 'F045'], o(['o:special.reportablePosition'], `פעולה / חוות דעת / עמדה חייבת בדיווח — ${OFFICE_Q}`)),
  F046: o([], `משק חקלאי (1220) — ${NO_Q}`),
  F047: o(['o:special.partnership'], `שותפות (1504) — ${OFFICE_Q}`),
  F048: c(['o:business.books'], 'ניהול ספרים — מהספרים (המשרד)'),
  F049: c(['o:business.books'], 'סעיף בהוראות ניהול ספרים — המשרד'),
  F050: c(['card:vatStatus'], 'עוסק פטור — מהכרטיס'),
  F051: c(['o:business.books'], 'כפולה / חד־צידית — מניהול הספרים ב-1320'),
  F052: c(['o:business.books'], 'קופה רושמת — מניהול הספרים ב-1320'),
  F053: c(['o:business.books'], 'הפקת חשבונית — ניהול הספרים (ברירת מחדל ממוחשב)'),
  F054: c(['calc'], 'נגזר מהמחזור'),

  // חלק ב׳ — פרטים אישיים, הצהרה ומסייע
  F055: c(['card:idNumber', 'card:taxFiles'], 'מספר תיק — כרטיס'),
  F056: na('מדבקה — בדוח מודפס בלבד'),
  F057: c(['card:idNumber'], 'ת״ז — כרטיס'),
  F058: c(['card:lastName'], 'שם משפחה — כרטיס'),
  F059: c(['card:firstName'], 'שם פרטי — כרטיס'),
  F060: c(['q:filing.fatherName'], 'שם האב — שאלון'),
  F061: c(['card:birthDate'], 'תאריך לידה — כרטיס'),
  F062: c(['card:spouseIdNumber'], 'ת״ז בן/בת הזוג — כרטיס'),
  F063: c(['card:spouseLastName'], 'שם משפחה בן/בת הזוג — כרטיס'),
  F064: c(['card:spouseFirstName'], 'שם פרטי בן/בת הזוג — כרטיס'),
  F065: c(['q:filing.fatherName'], 'שם האב של בן/בת הזוג — שאלון'),
  F066: c(['q:household.spouseBasics', 'card:spouse'], 'תאריך לידה בן/בת הזוג — שאלון לכרטיס'),
  F067: c(['q:household.maritalAtYearEnd', 'card:familyStatus'], 'מצב משפחתי בשנת המס — כרטיס + שנת האירוע'),
  F068: o(['calc'], 'סימון «שינוי מאז הדוח הקודם» — לא מסומן לעולם; אפשר להשוות לדוח הקודם'),
  F069: c(['q:household.address', 'card:address', 'card:zipCode'], 'כתובת ומיקוד — שאלון לכרטיס'),
  F070: na('כתובת למשלוח — לתושב חוץ בלבד (תושב חוץ — ראו F027)'),
  F071: na('כתובת מגורים — לתושב חוץ בלבד (תושב חוץ — ראו F027)'),
  F072: c(['card:email'], 'דוא״ל — כרטיס'),
  F073: c(['card:landlinePhone'], 'טלפון בבית — כרטיס (רשות)'),
  F074: na('טלפון בעבודה — רשות, הטופס לא מחייב'),
  F075: na('טלפון בעבודה בן/בת הזוג — רשות'),
  F076: c(['card:phone'], 'נייד — כרטיס'),
  F077: na('העדפת קבלת הודעות — רשות'),
  F078: na('העדפת קבלת הודעות — רשות'),
  F079: c(['card:businessDescription', 'card:employers'], 'העיסוק — כרטיס'),
  ...each(['F080', 'F081', 'F082', 'F083', 'F084'], c(['card:businesses', 'card:taxFiles'], 'פרטי העסק ותיקים — כרטיס')),
  F085: c(['q:salary.employers', 'card:employers'], 'שמות המעבידים — שאלון לכרטיס'),
  ...each(['F086', 'F087', 'F088', 'F089', 'F090', 'F091', 'F092'], c(['card:spouse', 'card:businesses', 'card:employers', 'card:taxFiles'], 'עיסוק, עסק ומעבידים של בן/בת הזוג — כרטיס')),
  ...each(['F093', 'F094', 'F095', 'F096'], c(['q:filing.refundAccount'], 'חשבון להחזר — שאלון')),
  ...each(['F097', 'F098', 'F099'], na('תאריך וחתימות — בסט שהלקוח חותם עליו')),
  ...each(range(100, 107), na('פרטי המסייע — פרטי המשרד, בהגשה')),

  // חלק ג׳ — הכנסות מיגיעה אישית
  F108: c(['o:business.profit', 'doc:pnl.profit', 'o:business.books'], 'עסק — רווח לפי הספרים, או 30% במסלול זעיר'),
  F109: b(['q:niBenefits.received'], 'תקבולי ב״ל כעצמאי (250/270) — לא מחושב; «כן» עוצר'),
  F110: b(['q:niBenefits.received'], 'תקבולי ב״ל כשכיר שלא ב-106: מילואים, לידה, אבטלה (194/196) — לא מחושב; «כן» עוצר'),
  F111: c(['doc:106.gross'], 'משכורת — טופסי 106'),
  F112: o([], 'עבודה במשמרות בתעשייה (068/069) — אין שאלה; נכנס בשקט כמשכורת רגילה'),
  F113: o(['q:pension.received', 'q:savings.withdrawal'], 'קצבאות ומענקי פרישה (258/272) — נשאל, לא נכנס לחישוב ולא עוצר'),
  F114: o(['q:savings.withdrawal'], 'מענקי פרישה בפריסה 8(ג) (358/372) — נשאל, לא נכנס ולא עוצר'),
  F115: o([], 'השכרת נכס ששימש בעסק מעל 10 שנים (120/220) — אין שאלה'),
  F116: o(['q:income.other', 'o:special.otherIncome'], 'הכנסות אחרות מיגיעה אישית — הסכום מוקלד במשרד ונכנס למס, אבל לא לשום שדה'),

  // חלק ד׳ — הכנסות שלא מיגיעה אישית
  F117: b(['q:rent.properties', 'q:rent.income'], 'שכר דירה במסלול הרגיל (201/301) — לא מחושב (הוצאות ופחת); עוצר'),
  F118: b(['q:companies.controlled'], '«חברת בית» — חברה בשליטה; עוצר'),
  F119: b(['q:companies.controlled'], 'חברה משפחתית — עוצר'),
  F120: o(['q:income.other', 'o:special.otherIncome'], 'הכנסות אחרות שלא מיגיעה אישית (205) — מוקלד במשרד, לא נכנס לשדה'),
  F121: o(['q:income.other'], 'פירוט ההכנסות האחרות — לא נאסף'),
  F299: b(['q:companies.controlled'], 'הכנסות מועברות מחברות משפחתיות — עוצר'),

  // חלק ה׳ — שיעורי מס מיוחדים
  F122: o(['q:income.royalties'], 'פטנט / תמלוגים / הכנסה לאחר פטירה (214) — נשאל, לא נכנס ולא עוצר'),
  F123: c(['doc:867.securitiesInterest15'], 'ריבית ורווחים מני״ע 15% — 867'),
  F124: o(['doc:867.securitiesInterest15'], 'ריבית ני״ע עד 20% (228) — אין שורה בתבנית 867'),
  F125: o(['doc:867.securitiesInterest15'], 'ריבית ני״ע עד 25% (257) — אין שורה בתבנית 867'),
  F126: o(['doc:867.dividend'], 'דיבידנד ממפעל מאושר/מוטב 20% (275) — אין שורה בתבנית'),
  F127: o(['doc:867.dividend', 'q:capital.relatedParty'], 'דיבידנד 25% — הסכום מ-867, אבל השיעור נקבע בהכרעת משרד ולא מתשובת הלקוח (בעל מניות מהותי)'),
  F128: b(['q:companies.controlled'], 'דיבידנד לבעל מניות מהותי 30% — חברה בשליטה; עוצר'),
  F129: o(['q:foreign.company'], 'דיבידנד רעיוני חמי״ז (276) — נשאל ב«חו״ל», לא מחובר'),
  F130: o(['doc:867.securitiesInterest15'], 'ריבית ני״ע ומניות הניתנות לפדיון (051) — אין שורה בתבנית'),
  F131: c(['doc:867.depositInterest15'], 'ריבית פיקדונות 15% — 867'),
  F132: o(['doc:867.depositInterest15'], 'ריבית פיקדונות עד 20% (226) — אין שורה בתבנית'),
  F133: o(['doc:867.depositInterest25', 'q:capital.relatedParty'], 'ריבית פיקדונות 25% — הסכום מ-867, השיעור בהכרעת משרד'),
  F134: o(['q:rent.income', 'q:rent.ownRent'], 'שכר דירה 10% — ההכנסה מהלקוח; המסלול נבחר במשרד וניכוי שכר הדירה למגורים מוקלד במשרד'),
  F135: b(['q:foreign.rentalProperty'], 'שכר דירה בחו״ל 15% — חו״ל; עוצר'),
  F136: o(['q:income.prize', 'o:special.gambling'], 'הימורים, הגרלות ופרסים 35% (286) — נשאל, לא נכנס ולא עוצר'),
  F137: o([], 'השכרת מקרקעין לאנרגיות מתחדשות 31% — אין שאלה'),
  F138: o([], 'חוק חלוקה לחיסכון פנסיוני 20% — אין שאלה'),
  F139: o(['q:savings.withdrawal'], 'משיכה שלא כדין מקופת גמל 35% (213) — נשאל, לא נכנס ולא עוצר'),
  ...each(['F140', 'F141', 'F142'], o([], 'הכנסות אחרות בשיעור מיוחד — אין שאלה')),
  ...each(['F143', 'F144', 'F145', 'F146'], o([], `הוראת השעה רווחים לא מחולקים — ${NO_Q}`)),
  F147: b(['q:companies.controlled'], 'דיבידנד רעיוני בשרשור — חברה בשליטה; עוצר'),
  F148: b(['q:companies.controlled'], 'דיבידנד רעיוני בשרשור — חברה בשליטה; עוצר'),
  F300: o(['doc:867.securitiesInterest15'], 'ריבית ני״ע שנצמחה לפני 2006 (10%) — אין שורה בתבנית'),
  F301: o(['doc:867.depositInterest15'], 'ריבית פיקדונות שנצמחה לפני 2006 (10%) — אין שורה בתבנית'),

  // חלק ו׳–ט׳
  F149: o(['o:special.financialInstitution'], `מוסד כספי — ${OFFICE_Q}`),
  F150: b(['q:special.disabilityDetails'], 'פטור 9(5) שהופחת מהעסק — עוצר'),
  F151: b(['o:carryForward.balances'], 'הפסדים שקוזזו מעסק — הפסדים מועברים לא נתמכים; עוצר'),
  F152: c(['doc:pnl.turnover'], 'מחזור — רו״ה'),
  F153: b(['q:sales.sold'], 'מכירות — רווח הון ושבח; עוצר'),
  F154: b(['q:sales.sold'], 'מכירות — עוצר'),
  F155: b(['q:sales.sold', 'doc:867.gains'], 'מכירת ני״ע סחירים — נספח ג׳; עוצר'),
  F305: b(['q:sales.sold'], 'ניכוי במקור מרווח הון — עוצר'),
  F156: b(['q:foreign.income'], 'הכנסות חו״ל — נספח ד׳; עוצר'),

  // חלק י׳ — פטורים
  F157: b(['q:special.disabilityDetails'], 'הכנסה פטורה 9(5) — עוצר'),
  F158: o(['q:rent.income'], 'שכר דירה פטור — ההכנסה מהלקוח, אבל המסלול (פטור/10%/רגיל) נבחר ביד במשרד'),
  F159: b(['q:companies.controlled'], 'דיבידנד ממקור רעיוני — עוצר'),
  F160: o(['q:pension.received'], 'קצבאות פטורות — נשאל, לא נכנס ולא עוצר'),
  F161: o([], 'מקורות פטורים אחרים — אין שאלה'),
  F162: o(['calc'], 'סה״כ פטורים — חסר כי 160/161 חסרים'),
  F302: o(['q:pension.received'], 'קצבאות פטורות (101/102) — נשאל, לא נכנס'),

  // חלק יא׳ — פרטים נוספים ויתרות
  F163: o(['o:business.books'], 'ערך המלאי — בספרים, לא מועבר לשדה'),
  F164: o(['o:business.books'], 'רווח גולמי — בספרים, לא מועבר לשדה'),
  F165: b(['o:carryForward.balances'], 'הפסד עסקי שקוזז — הפסדים מועברים; עוצר'),
  F166: o(['o:special.trust'], `חלוקות מנאמנות — ${OFFICE_Q}`),
  F167: o([], 'הפסד הון מהשקעה בחברת מו״פ — אין שאלה'),
  ...each(['F168', 'F169', 'F170', 'F171', 'F172', 'F173', 'F174', 'F175'], b(['q:companies.controlled'], 'משיכות 3(ט1) / הכנסה מועברת 62א — חברה בשליטה; עוצר')),
  ...each(['F176', 'F177', 'F178', 'F179', 'F180'], b(['o:carryForward.balances'], 'יתרות להעברה — 1344 לא נתמך; עוצר')),

  // חלק יב׳ — ניכויים אישיים
  F181: o(['doc:ins.disability'], 'אובדן כושר עבודה כעצמאי (112/113) — נאסף ליד המסמך, לא נכנס לשדה ולא לחישוב'),
  F182: o([], 'אובדן כושר עבודה לשכיר לפי 134 (206/207) — אין'),
  F183: c(['doc:fund.studyFund'], 'קרן השתלמות כעצמאי — אישור הקופה'),
  F184: c(['doc:106.studyFundSalary'], 'משכורת לקרן השתלמות — 106'),
  F185: c(['doc:fund.pension'], 'פנסיה כעצמאי — אישור הקופה'),
  F186: c(['doc:ni.paid', 'doc:ni.refunds'], 'ב״ל ששולם כעצמאי — אישור ב״ל'),
  F187: o([], 'מימון מחקר מדעי 20א — אין שאלה'),
  F188: o([], 'חיפושי נפט (858י) — אין שאלה'),
  F189: o([], 'השקעה בסרטים — אין שאלה'),
  F190: c(['doc:106.insured'], 'הכנסה מבוטחת — 106'),
  F191: c(['doc:106.employerDeposits'], 'הפקדות המעביד — 106'),
  F192: o([], 'השתתפות זמנית — הפחתת דמי הבראה (011/012) — אין שורה בתבנית 106'),
  F303: o(['calc'], 'בחירה במסלול «יחיד» לעמית מוטב — נבחר ביד; אפשר לבחור לבד את הזול'),
  F304: o(['doc:ni.assessmentDiff'], 'ב״ל ששולם על שנים קודמות (130/189) — נאסף ליד המסמך, לא נכנס'),

  // חלק יג׳ — נקודות זיכוי
  F193: o(['o:special.nonResident'], `תושב — ${OFFICE_Q}`),
  F194: o([], `זיכוי בן/בת זוג בחישוב נפרד — ${NO_Q}`),
  F195: o([], `בן/בת זוג עוזר/ת בעסק — ${NO_Q}`),
  ...each(range(196, 219), c(['q:household.children', 'card:children'], 'ילדים לפי גיל וחזקה — שאלון לכרטיס')),
  ...each(range(220, 225), b(['card:familyStatus', 'card:children'], '«ילד להורה אחד» — לא נקבע; מופיע כלא נתמך')),
  ...each(range(226, 229), b(['card:children'], 'דחיית נקודת ילד (116ד) — מופיע כלא נתמך')),
  F230: c(['card:familyStatus'], 'הורה יחיד — כרטיס'),
  F231: o([], `הורה יחיד שמנהל משק בית משותף — ${NO_Q}`),
  F232: c(['card:familyStatus', 'card:children'], 'השתתפות בכלכלת ילדים — כרטיס'),
  F233: b(['q:household.alimonyPaid', 'card:paysAlimonyToEx'], 'מזונות לבן זוג לשעבר — הנקודה מחושבת, השדה מופיע כלא נתמך'),
  F234: c(['q:household.disabledChildDetails', 'card:children'], 'ילדים עם מוגבלות — שאלון לכרטיס'),
  F235: o(['q:household.aliyahDetails'], 'תאריך העלייה המלא — היום מוקלד במשרד'),
  F236: o(['q:household.aliyahDetails'], 'תאריך העלייה המלא (בן/בת זוג) — היום מוקלד במשרד'),
  F237: o(['q:household.aliyahDetails'], 'תאריך החזרה (תושב חוזר) — מוקלד במשרד'),
  F238: c(['q:household.studies', 'card:idfReleaseMonth', 'card:idfReleaseYear'], 'חודש ושנת שחרור — שאלון לכרטיס'),
  F239: c(['q:household.studies', 'card:serviceMonths'], 'חודשי שירות — שאלון לכרטיס'),
  F240: c(['q:household.studies', 'card:academicDegreeType'], 'קוד התואר — מסוג התואר (דוקטורט — המשרד)'),
  F241: c(['q:household.studies', 'card:academicDegreeYear'], 'שנת סיום — שאלון לכרטיס'),
  F242: o(['q:household.studies'], 'שנת סיום התמחות — לא נשאל'),

  // חלק יד׳ — זיכויים בעד תשלומים
  F243: o(['doc:ins.life'], 'ביטוח חיים — הסכום בשדה, אבל הזיכוי (45א) לא מחושב; נסגר במס שמוקלד ביד'),
  F244: o([], 'ביטוח קצבת שאירים (140/240) — אין'),
  F245: c(['doc:106.employeePension'], 'הפקדות העובד לקצבה — 106'),
  F246: na('לפי המדריך כל ההפקדה כעצמאי נרשמת ב-135/180 ורשות המסים מפצלת; 268/269 רק בבחירת זיכוי'),
  F247: o(['q:household.relativeCare'], 'החזקת בן משפחה במוסד (132/232, סעיף 44) — נשאל, לא נכנס ולא עוצר'),
  F248: c(['q:donations.amount', 'doc:don.total'], 'תרומות — קבלות'),
  F249: o([], 'תרומות למוסדות בארה״ב — אין'),
  F250: o([], 'תרומות מעל התקרה משלוש השנים הקודמות — אין'),
  F251: o([], 'הוצאות הנצחה — אין שאלה'),
  F252: o([], 'השקעה בחברות מו״פ (991) — אין שאלה'),
  F253: o([], 'תושב אילת — הכנסה שהופקה באילת — אין שאלה'),
  ...each(['F254', 'F255', 'F256'], c(['q:household.settlement', 'card:qualifyingSettlementId'], 'יישוב מזכה — כתובת לכרטיס, אישור לשנה')),
  ...each(['F257', 'F258', 'F259'], o(['q:household.address'], 'מעבר ליישוב מזכה אחר באמצע השנה — לא נשאל (מניח שלא)')),
  F260: o([], 'תוספת פעילות רמה א׳ (זיכוי «חייל») — אין שאלה'),

  // חלק טו׳ — מחזור למקדמות וניכויים במקור
  F261: o(['doc:pnl.turnover'], 'מחזור למקדמות (294) — אפשר לגזור, לא מופק'),
  F262: c(['doc:106.withheld'], 'מס שנוכה ממשכורת — 106'),
  F263: c(['doc:867.withheldDeposit'], 'ניכוי במקור מריבית — 867'),
  F264: b(['q:companies.controlled'], 'זיכוי מס חברות 62א — עוצר'),
  F265: c(['doc:pnl.customerWithholding', 'doc:867.withheldSecurities', 'o:payments.withholding'], 'ניכויים במקור אחרים'),
  F266: b(['q:sales.sold'], 'מס שבח — מכירה; עוצר'),
  F267: b(['q:companies.controlled'], 'מקדמות בחברה משפחתית / 62א — עוצר'),

  // לשימוש המשדר
  F268: o(['calc'], 'קוד חישוב נפרד — נגזר מ-F007, שמסומן «לא» לבד'),
  F269: o(['calc'], 'סוג החישוב — תמיד «נפרד»; 66(ד) לא נבדק'),
  F270: c(['o:business.microTrack'], 'קוד עסק זעיר — מסלול השנה'),
  F271: o(['o:special.reportablePosition'], `פעולה חייבת בדיווח / מחירי העברה — ${OFFICE_Q}`),
  F272: o(['o:special.reportablePosition'], `חוות דעת / עמדה — ${OFFICE_Q}`),
  F273: o(['o:special.reportablePosition'], 'מספר עמדה — לא נאסף'),
  F274: o(['calc'], 'ניכויים במקור גבוהים מההכנסות — לא מסומן; אפשר לגזור'),
  F275: o(['q:income.royalties'], 'מס מוגבל ל-35% — לא מחושב'),
  F276: o(['o:special.trust'], `נאמנות — ${OFFICE_Q}`),
  F277: o(['calc'], 'קוד אינטרנט / אנרגיות — נגזר מ-F019/F020 שמסומנים «לא» לבד'),
  F278: o([], 'סיום בנייה (702) — נגזר מ-F039 שמסומן «לא» לבד'),
  F279: c(['o:business.books'], 'ניהול ספרים — תיעוד פנים'),
  F280: b(['q:companies.controlled'], 'חברה משפחתית / 62א — עוצר'),
  F281: o(['calc'], 'נכס בחו״ל — נגזר מ-F015 שמסומן «לא» לבד'),
  ...each(['F282', 'F283', 'F284'], b(['q:household.aliyahDetails'], 'עולה / תושב חוזר — חודשי הזכאות לשידור; מופיע כלא מופק')),
  ...each(['F285', 'F286'], b(['card:qualifyingSettlementId'], 'יישוב מזכה — אחוז וקוד תקרה לשידור; מופיע כלא מופק')),
  F287: o([], 'זיכוי «חייל» — אין שאלה'),
  F288: o([], 'חלוקה מרווחים לפי סעיף 77 (25%) — אין שאלה'),
  F289: o([], 'חלוקה מרווחים לפי סעיף 77 (30%) — אין שאלה'),
  F290: o(['card:isKibbutzMember'], 'מספר תיק הקיבוץ — לא נאסף'),
  ...each(range(291, 298), na('לשימוש משרד השומה')),
};

/**
 * קודים שהמדריך הרשמי מפרט («שדות נוספים», עמ׳ 37–40) ואינם בקטלוג 1301 — נמצאו בקריאה העצמאית של המדריך
 * (data/guide1301-2025.codes.json, 31.10.2026). המפתח: הקודים, מופרדים ב-«/».
 */
export const LEDGER_GUIDE_EXTRA: Record<string, LedgerRow> = {
  '093/193': o(['card:qualifyingSettlementId'], 'זיכוי תושבות בכפר ורדים — אין טיפול מיוחד'),
  '353': na('ריבית והפרשי הצמדה על החזר — רשות המסים מחשבת'),
  '105/106': o([], 'עובד מדע בשנת שבתון (מס מוגבל 35%) — אין שאלה'),
  '149/169': o([], 'הכנסה ממפעל מאושר בחקלאות (עד 30%) — אין שאלה'),
  '164': b(['q:companies.controlled'], 'תשלומים אחרים לבעלי שליטה — חברה בשליטה; עוצר'),
  '210/310': o(['q:rent.keyMoney'], 'דמי מפתח (מס מוגבל 35%) — נשאל, לא נכנס'),
  '009': o(['q:savings.withdrawal'], 'יתרת שנות מס בפריסת פיצויי פיטורים — נשאל «משיכה / פיצויים», לא נכנס'),
  '091/191': o([], 'הפרשי שער ליהלומן — אין שאלה'),
  '018/019': b(['q:companies.controlled'], 'שכר חבר בחברה משפחתית (64א) — חברה בשליטה; עוצר'),
  '114': b(['q:sales.sold'], 'חיוב מס שבח שונה — מכירה; עוצר'),
  '128': o([], 'הפחתה לקבלנים לפי סעיף 12 לחוק התיאומים — אין שאלה'),
  '138': o([], 'נקודות זיכוי לעובד זר חוקי — אין שאלה'),
  '148': o([], 'נקודות זיכוי לתושב «האזור» — אין שאלה'),
  '188': b(['q:foreign.income'], 'זיכוי מיוחד חו״ל — חו״ל; עוצר'),
  '229': o([], 'הכנסה חריגה מקרנות השקעה במקרקעין (70%) — אין שאלה'),
  '243': o(['doc:867.withheldDeposit'], 'טיפול מיוחד בהחזר מס שנוכה מריבית (פטור גיל / 9ד) — לא מסומן'),
};

// ── נספחי 1301 (ANNEX_CATALOG_2025) — לכל נספח: האם מופק, ומאיפה ──
export const LEDGER_ANNEXES: Record<string, LedgerRow> = {
  '1320': c(['o:business.books', 'o:business.profit'], 'רווח והפסד לכל עסק — המשרד (רו״ה / פייפרלס)'),
  '1321': o(['q:rent.income', 'q:rent.ownRent', 'q:rent.singleApartment'], 'מסלול 10% מופק, אבל ניכוי שכר הדירה למגורים, «דירה יחידה» וגוש/חלקה מוקלדים במשרד; מסלול רגיל — עוצר'),
  '1322': b(['q:sales.sold', 'doc:867.gains'], 'רווח הון מני״ע — עוצר'),
  '1324': b(['q:foreign.income'], 'הכנסות חו״ל — עוצר'),
  '1399י': b(['q:sales.sold'], 'מכירת נכס — עוצר'),
  '1344': b(['o:carryForward.balances'], 'הפסדים מועברים — עוצר'),
  '1342': c(['o:business.depreciation'], 'פחת — המשרד'),
  '1343': b(['o:business.books'], 'ניכוי נוסף בשל פחת — עוצר'),
  '134': o(['doc:106.employerDeposits'], 'הפקדות מעביד מעל התקרה — לא מחושב, ולא עוצר (F025 קבוע «לא»)'),
  '119': b(['q:household.studies'], 'פרטי התואר (מוסד, תחום) — מופיע כלא מופק; מצרפים במקוון'),
  '116ד': b(['card:children'], 'דחיית נקודת ילד — מופיע כלא נתמך'),
};

// ── 1219 / הצהרת הון — לכל שורה ב-wealthFormGuide (WEALTH_PARTS) ──
const W_SUM = 'המשרד מקליד סכום אחד לסעיף; הלקוח נותן פרטים ומסמכים, והסכום לא נבנה מהם';
export const LEDGER_1219: Record<string, LedgerRow> = {
  '10': o(['q:wealth.realEstate.details', 'o:wealth.realEstate.total'], `נדל״ן בארץ — ${W_SUM}`),
  '20': o(['q:wealth.realEstate.details', 'o:wealth.realEstateAbroad.total'], `נדל״ן בחו״ל — ${W_SUM}`),
  '30': o(['q:wealth.bank.accounts', 'o:wealth.bank.total'], `בנקים — ${W_SUM}; אין תבנית לאישור יתרה`),
  '40': o(['q:wealth.crypto.has', 'o:wealth.crypto.total'], `נכסים דיגיטליים — ${W_SUM}`),
  '50': c(['q:wealth.cash'], 'מזומן — סכום מהלקוח'),
  '60': o(['q:wealth.funds.list', 'o:wealth.funds.total'], `ביטוח, גמל, פנסיה — ${W_SUM}; אין תבנית לאישור הקופה`),
  '70': o(['q:wealth.securities.list', 'o:wealth.securities.total'], `ני״ע — ${W_SUM}`),
  '80': o(['q:wealth.loansGiven.details', 'o:wealth.loansGiven.total'], 'הלוואות שנתתם — הלקוח נותן יתרה לכל הלוואה, אבל המשרד מקליד את הסכום'),
  '90': o(['q:wealth.vehicles.details', 'o:wealth.vehicles.total'], 'רכב — הלקוח נותן מחיר קנייה, אבל המשרד מקליד את הסכום'),
  '100': o(['q:wealth.valuables.has', 'o:wealth.valuables.total'], `תכשיטים ואומנות — ${W_SUM}`),
  '110': o(['q:wealth.contents', 'o:wealth.homeContents.total'], `תכולת בית — ${W_SUM}`),
  '120': o(['q:wealth.partD.has', 'o:wealth.other.total'], `רכוש אחר — ${W_SUM}`),
  '130': o(['q:wealth.mortgage.has', 'o:wealth.liabilities.total'], `התחייבויות לבנקים — ${W_SUM}; אין תבנית לאישור יתרת משכנתא`),
  '140': o(['q:wealth.loansReceived.details', 'o:wealth.loansReceived.total'], 'הלוואות שלקחתם — הלקוח נותן יתרה, אבל המשרד מקליד את הסכום'),
  '300 עד 340': o(['o:wealth.business.total'], 'עסק עם מאזן — רק סכום אחד להון העסקים; השורות 300–340 לא מופקות'),
  '350 עד 390': o(['o:wealth.business.total'], 'שותפות — לא מופק בנפרד'),
  '400 עד 440': o(['q:wealth.companies.has', 'o:wealth.business.total'], 'חברה — מניות, חו״ז והלוואות; לא מופק בנפרד'),
  '500 עד 540': o([], 'עסק בלי מאזן — רכוש שוטף (קופה, המחאות, לקוחות): אין שאלה'),
  '550': o([], 'עסק בלי מאזן — מלאי: אין שאלה'),
  '560': o([], 'עסק בלי מאזן — רכוש שוטף אחר: אין שאלה'),
  '570 עד 600': o([], 'עסק בלי מאזן — בנקים, ני״ע וחייבים של העסק: אין שאלה'),
  '610 עד 660': o([], 'עסק בלי מאזן — נדל״ן, רכב וציוד בעסק: אין שאלה'),
  '680 עד 720': o([], 'עסק בלי מאזן — ספקים, המחאות והלוואות: אין שאלה'),
  '730 עד 800': o(['calc'], 'סיכומים — 800 מחושב, 740–770 של חלק ג׳ חסרים'),
  'ד׳ 1': c(['q:wealth.partD.details'], 'כספות — שאלון (רשומה לכל כספת)'),
  'ד׳ 2': o([], 'ייפוי כוח / אפוטרופוס / זכות חתימה ברכוש של אחר — אין שאלה'),
  'ד׳ 3': o([], 'רכוש שאינו בבעלותך ולא דווח — אין שאלה'),
  'ד׳ 4': c(['o:wealth.prevDeclaration'], 'הון נטו מההצהרה הקודמת — מהמערכת, או מהמסמך שהוגש'),
  'הצהרות': na('הצהרת שלמות וחתימה — בסט שהלקוח חותם עליו; פרטי המסייע — המשרד'),
};

/** גישור הון (bridge.ts › computeBridge) — כל קלט. */
export const LEDGER_BRIDGE: Record<string, LedgerRow> = {
  prevTotal: c(['o:wealth.prevDeclaration'], 'ההון בהצהרה הקודמת'),
  nowTotal: o(['calc'], 'ההון ליום ההצהרה — נשען על סכומי הסעיפים שהמשרד מקליד'),
  liabilities: o(['calc'], 'התחייבויות בקודמת ועכשיו — מאותם סכומים מוקלדים'),
  incomes: o(['o:wealth.bridge.income'], 'הכנסה ומס לכל שנה — מוקלד במשרד; אפשר מהדוחות השנתיים במערכת ומשע״ם'),
  livingTable: o(['calc'], 'לוח הוצאות המחיה של הרשות — יש רק 2020–2022; לשנים אחרות נלקח הלוח הקרוב'),
  life: c(['q:wealth.since.living'], 'רמת חיים — הלקוח'),
  moneyIn: c(['q:wealth.since.sources'], 'מה נכנס — הלקוח'),
  moneyOut: c(['q:wealth.since.uses'], 'מה יצא — הלקוח'),
  persons: c(['card:familyStatus', 'card:children'], 'נפשות בבית לכל שנה — כרטיס'),
};

/** פריטים שנשאלים גם בדוח השנתי ואינם נדרשים לו — עם הסיבה (לא פער). */
export const QUESTION_BY_DESIGN: Record<string, string> = {
  'period.property': 'תקופת ההשכרה — להערכת המס (חלק מהשנה); בדוח השנתי הסכום לשנה הוא הסכום בפועל',
  'period.account': 'תקופת החשבון — להערכת המס; בדוח השנתי — 867 לשנה',
  'wealth.period.property': 'תקופת הבעלות בנכס — רק לשאלה אם הנכס היה ביום ההצהרה',
  'wealth.period.account': 'תקופת החשבון — רק לשאלה אם החשבון היה ביום ההצהרה',
  'annual.officeDecision': 'הערת המשרד על הסבב — לא קלט לחישוב',
  'household.creditChanges': 'שער למסך «לימודים וצבא» (household.studies ⇒ כרטיס ⇒ נקודות זיכוי)',
  'household.disabledChild': 'שער ל«איזה ילד ולמי הנקודות» (household.disabledChildDetails ⇒ כרטיס)',
  'niBenefits.kindUnemployment': 'אפשרות במסך הגמלאות, אחרי «קיבלת מב״ל» — הנושא עוצר את הדוח (F109/F110)',
  'niBenefits.kindReserve': 'אפשרות במסך הגמלאות, אחרי «קיבלת מב״ל» — הנושא עוצר את הדוח (F109/F110)',
  'niBenefits.kindInjury': 'אפשרות במסך הגמלאות, אחרי «קיבלת מב״ל» — הנושא עוצר את הדוח (F109/F110)',
  'niBenefits.kindDisability': 'אפשרות במסך הגמלאות, אחרי «קיבלת מב״ל» — הנושא עוצר את הדוח (F109/F110)',
  'niBenefits.kindOther': 'אפשרות במסך הגמלאות, אחרי «קיבלת מב״ל» — הנושא עוצר את הדוח (F109/F110)',
  'salary.spouseIncomeEstimate': 'אומדן להערכת המס; בדוח השנתי — טופסי 106 בפועל',
  'special.reserveCombatDays': 'הוחלף ב-household.reserveDays (נכתב לכרטיס)',
};

/**
 * שאלות בשאלון השנתי ובהצהרת ההון שלא מגיעות לשום חישוב, שדה או כרטיס — ולמה.
 * ‼ כל פריט כאן הוא פער פתוח (הלקוח עונה, ואין לזה תוצאה). הבדיקה מוודאת שהרשימה מדויקת: פריט שחובר — יוצא ממנה.
 */
export const QUESTION_GAPS: Record<string, string> = {
  'pension.received': 'קצבה — נשאל, לא נכנס לחישוב (F113, F160)',
  'savings.withdrawal': 'משיכה מקופה / פיצויים — נשאל, לא נכנס (F113, F114, F139)',
  'salary.equity': 'מניות / אופציות מהעבודה (102) — נשאל, לא נכנס',
  'household.relativeCare': 'קרוב במוסד (סעיף 44) — נשאל, לא נכנס (F247)',
  'income.other': 'הכנסה אחרת — נשאל; הסכום מוקלד במשרד ולא נכנס לשדה',
  'income.prize': 'פרס / זכייה — נשאל, לא נכנס (F136)',
  'income.royalties': 'תמלוגים — נשאל, לא נכנס (F122)',
  'income.unlisted': 'הכנסה אחרת שלא ברשימה — נשאל, לא נכנס',
  'rent.track': 'מסלול המס על השכירות (פטור / 10% / רגיל) — נבחר ביד במשרד; אפשר לבחור לבד את הזול',
  'rent.newRental': 'נכס חדש להשכרה — פותח רק חוזה; הנכס וההכנסה ממנו לא נכנסים לבד',
  'rent.expenses': 'הוצאות שכירות — נשאל, לא נכנס (במסלול הרגיל — עוצר בלעדיו)',
  'rent.ownRent': 'שכר דירה ששולם למגורים — נשאל כן/לא; הסכום מוקלד במשרד',
  'rent.singleApartment': '«דירה יחידה» — נשאל, אבל הדוח קורא סימון של המשרד',
  'rent.coOwned': 'נכס בשותפות — נשאל, ההכנסה לא מתחלקת לפי חלק',
  'rent.coOwners': 'פרטי השותפים — לא נקרא',
  'rent.keyMoney': 'דמי מפתח — נשאל, לא נכנס',
  'rent.businessUse': 'נכס ששימש בעסק — נשאל, לא נכנס (F115)',
  'rent.otherProperty': 'נכס אחר — נשאל, לא נכנס',
  'capital.relatedParty': 'בעל מניות מהותי / צד קשור — נשאל, אבל השיעור נקבע בהכרעת משרד',
  'household.childDeferral': 'דחיית נקודת ילד — פריט משרד שלא נקרא בשום מקום',
  'household.creditEmployer': 'נקודות אצל המעסיק — פריט משרד שלא נקרא',
  'business.selfDeposits': 'הפקדות כעצמאי לפי עסק — פריט משרד שלא נקרא',
  'special.kibbutz': 'חבר קיבוץ — פריט משרד שלא נקרא (הטופס קורא את הכרטיס)',
  'special.gambling': 'הימורים ופרסים — פריט משרד שלא מועבר לחישוב',
  'rent.businessUseAmounts': 'סכומי השימוש בעסק — לא נקרא',
  'wealth.spouseSeparate': 'הצהרה נפרדת לבני זוג — פריט משרד שלא נקרא',
  'wealth.realEstate.details': 'פרטי הנדל״ן — אין סכום שנבנה מהם',
  'wealth.bank.accounts': 'חשבונות הבנק — אין סכום שנבנה מהם',
  'wealth.loansGiven.details': 'הלוואות שנתתם — היתרה לא נסכמת',
  'wealth.loansReceived.details': 'הלוואות שלקחתם — היתרה לא נסכמת',
  'wealth.vehicles.details': 'רכבים — מחיר הקנייה לא נסכם',
  'salary.employerDetails': 'פרטי מעסיק חדש — לא נכנס לכרטיס דרך השאלון, ולכן המשכורת ממנו לא נכנסת לדוח',
  'niBenefits.maternitySpread': 'פריסת דמי לידה — פריט משרד; הבחירה לא נשאלת (F026)',
  'capital.owner': 'של מי החשבון — נשאל, לא נקרא (הייחוס לפי מי שהעלה את 867)',
  'capital.totals': 'סכום כולל של שוק ההון — פריט משרד שלא נקרא בדוח',
  'foreign.totals': 'סכום כולל של חו״ל — פריט משרד שלא נקרא',
  'savings.fundDetails': 'פרטי הקופה — נשאל, לא נקרא',
  'household.newChild': 'נולד ילד — פותח רק תעודת לידה; הילד נכנס לכרטיס רק אם עודכנה רשימת הילדים',
  'household.familyChange': 'אירוע משפחתי — נאסף, לא משפיע על החישוב (המצב בכרטיס משתנה בידי המשרד)',
  'family.eventDeath': 'פטירה בשנה — נאסף, לא נכנס (שנת פטירה: דוח משותף, קצבת שאירים)',
  'family.eventDivorce': 'גירושין בשנה — נאסף, לא נכנס',
  'family.eventMarriage': 'נישואים בשנה — נאסף, לא נכנס',
  'family.death': 'פרטי הפטירה — לא נקרא',
  'family.deathGotSalary': 'משכורת אחרונה של הנפטר/ת — לא נקרא',
  'family.deathGotPension': 'קצבה של הנפטר/ת — לא נקרא',
  'family.deathGotNi': 'גמלה מב״ל של הנפטר/ת — לא נקרא',
  'family.deathGotDisabilityIns': 'ביטוח אובדן כושר של הנפטר/ת — לא נקרא',
  'family.payoutSeverance': 'פיצויי פטירה — לא נקרא',
  'family.payoutLifeIns': 'ביטוח חיים ששולם — לא נקרא',
  'family.payoutFund': 'כספי קופה ששולמו — לא נקרא',
  'family.payoutMortgage': 'ביטוח משכנתא — לא נקרא',
  'family.payoutSickDays': 'פדיון ימי מחלה — לא נקרא',
  'family.pensionCapitalized': 'היוון קצבה — לא נקרא',
  'family.survivorPaidWhen': 'ממתי קצבת שאירים — לא נקרא',
  'family.survivorFromFund': 'קצבת שאירים מקופה — לא נקרא',
  'family.survivorFromState': 'קצבת שאירים מהמדינה — לא נקרא',
  'family.survivorFromBtl': 'קצבת שאירים מב״ל — לא נקרא',
  'family.divorce': 'פרטי הגירושין — לא נקרא',
  'family.marriage': 'פרטי הנישואים — לא נקרא',
  'wealth.business.books': 'מאזן העסק להצהרת ההון — רק סכום אחד; השורות 300–440 לא מופקות',
  'household.changesSince': '«השתנה משהו מאז?» — «כן» לא פותח שום שאלה ולא עוצר',
  'salary.changesSince': '«השתנה משהו מאז?» — «כן» לא פותח שום שאלה ולא עוצר',
  'business.changesSince': '«השתנה משהו מאז?» — «כן» לא פותח שום שאלה ולא עוצר',
  'niBenefits.changesSince': '«השתנה משהו מאז?» — «כן» לא פותח שום שאלה ולא עוצר',
  'rent.changesSince': '«השתנה משהו מאז?» — «כן» לא פותח שום שאלה ולא עוצר',
  'capital.changesSince': '«השתנה משהו מאז?» — «כן» לא פותח שום שאלה ולא עוצר',
  'sales.changesSince': '«השתנה משהו מאז?» — «כן» לא פותח שום שאלה ולא עוצר',
  'foreign.changesSince': '«השתנה משהו מאז?» — «כן» לא פותח שום שאלה ולא עוצר',
  'savings.changesSince': '«השתנה משהו מאז?» — «כן» לא פותח שום שאלה ולא עוצר',
  'donations.changesSince': '«השתנה משהו מאז?» — «כן» לא פותח שום שאלה ולא עוצר',
};

/**
 * «כן» שנעלם (בדיקת התנהגות, 31.10.2026): שאלות פתיחה של הדוח השנתי שתשובת «כן» עליהן — בלי הנתון שהן פותחות — משאירה
 * את הדוח «גיליון מלא». ‼ הכלל: «כן» בלי הנתון ⇒ הדוח לא מלא (חסר / עוצר). הבדיקה מריצה את המנוע לכל שאלה, והרשימה חייבת
 * להיות מדויקת — שאלה שתוקנה יוצאת ממנה; שאלה חדשה שנעלמת — נופלת. היעד: רשימה ריקה.
 */
export const SILENT_YES: string[] = [
  // משק הבית ושינויים
  'household.creditChanges', 'household.aliyah', 'household.reserveDuty', 'household.relativeCare', 'household.newChild', 'household.disabledChild',
  'household.familyChange', 'special.disability',
  'family.eventDeath', 'family.eventDivorce', 'family.eventMarriage', 'family.deathGotSalary', 'family.deathGotPension', 'family.deathGotNi',
  'family.deathGotDisabilityIns', 'family.payoutSeverance', 'family.payoutLifeIns', 'family.payoutFund', 'family.payoutMortgage', 'family.payoutSickDays',
  'family.survivorFromFund', 'family.survivorFromState', 'family.survivorFromBtl',
  // עבודה, עסק וגמלאות
  'salary.worked', 'salary.equity', 'pension.received', 'savings.withdrawal', 'business.started',
  'business.assetsChanged', 'business.inventory', 'business.employees', 'business.badDebts', 'business.vehicle', 'business.partnership',
  'business.rentsPremises', 'business.microExclusions',
  'niBenefits.maternity', 'niBenefits.kindUnemployment', 'niBenefits.kindReserve', 'niBenefits.kindInjury', 'niBenefits.kindDisability', 'niBenefits.kindOther',
  // נכסים, השקעות וחו״ל
  'rent.newRental', 'rent.singleApartment', 'rent.businessUse', 'rent.coOwned', 'rent.keyMoney', 'rent.ownRent', 'rent.otherProperty',
  'capital.newAccount', 'capital.relatedParty', 'sales.circumstances', 'sales.specialDeal',
  'foreign.securitiesSold', 'foreign.work', 'foreign.rentalProperty', 'foreign.company', 'foreign.taxRefund',
  // חיסכון, תרומות והכנסות אחרות
  'savings.selfDeposits', 'savings.insurance', 'donations.given', 'income.other', 'income.prize', 'income.royalties', 'income.unlisted',
  'special.kibbutz', 'special.moneyAbroad',
  // «השתנה משהו מאז השנה שעברה?» — «כן» בלי פירוט
  'household.changesSince', 'salary.changesSince', 'business.changesSince', 'niBenefits.changesSince', 'rent.changesSince', 'capital.changesSince',
  'sales.changesSince', 'foreign.changesSince', 'savings.changesSince', 'donations.changesSince',
];
/** מסכי בחירה מרובה — האפשרויות בהם הן פריטים בפני עצמם ונבדקות כל אחת; המסך עצמו אינו שאלה. */
export const NOT_A_QUESTION: Record<string, string> = {
  'annual.whatHappened': 'מסך «מה קרה השנה?» — כל אפשרות היא פריט שנבדק לבד',
  'annual.lessTax': 'מסך «מה יכול להוריד לך מס?» — כל אפשרות היא פריט שנבדק לבד',
  'household.childChange': 'מסך «מה השתנה בילדים?» — האפשרויות נבדקות לבד',
  'household.familyEvent': 'מסך «מה קרה?» (נישואים / גירושים / פטירה) — האפשרויות נבדקות לבד',
  'niBenefits.kinds': 'מסך «איזו גמלה?» — האפשרויות נבדקות לבד',
  'income.otherKinds': 'מסך «איזו הכנסה אחרת?» — האפשרויות נבדקות לבד',
  'family.deathIncome': 'מסך בחירה — האפשרויות נבדקות לבד',
  'family.deathPayouts': 'מסך בחירה — האפשרויות נבדקות לבד',
  'family.survivorPensions': 'מסך בחירה — האפשרויות נבדקות לבד',
};

export type LedgerCounts = Record<LedgerStatus, number>;
const countOf = (rows: Record<string, LedgerRow>): LedgerCounts => {
  const out: LedgerCounts = { covered: 0, blocks: 0, open: 0, na: 0 };
  for (const r of Object.values(rows)) out[r.s]++;
  return out;
};
/** הספירה לדיווח — לכל רשימה. */
export function ledgerSummary() {
  return {
    form1301: countOf(LEDGER_1301), guideExtra: countOf(LEDGER_GUIDE_EXTRA), annexes: countOf(LEDGER_ANNEXES), form1219: countOf(LEDGER_1219), bridge: countOf(LEDGER_BRIDGE),
    questionsNoUse: Object.keys(QUESTION_GAPS).length, silentYes: SILENT_YES.length,
  };
}

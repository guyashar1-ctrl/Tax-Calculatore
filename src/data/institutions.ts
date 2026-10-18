// ─── רשימות סגורות לשאלון ההיכרות: בנקים, בתי השקעות, קופות, מבטחים, זירות קריפטו, מדינות (16.10.2026) ──
// ‼ גיא (16.10.2026): «כל תשובה מרשימה» — הלקוח בוחר של מי ואיפה; טקסט חופשי רק לשם המעסיק/העסק. הרשימה
//   אינה חייבת להיות מלאה: «אחר» הוא תשובה לגיטימית שהמשרד מברר. ‼ המזהה (id) הוא זהות של תשובה שמורה —
//   לא לשנות; שם (label) מותר לתקן.
// ‼ מקור אחד: השרת מאמת ש«איפה» מתוך הרשימה הזו — scripts/sql/253/build-items.mjs מייצר ממנה את
//   _tax_institutions(). שינוי כאן = מיגרציה חדשה (כמו _tax_year_items).
//
// מקורות ותאריכים:
//   · בנקים — רשימת התאגידים הבנקאיים של בנק ישראל, לפי קוד בנק (אותו מקור של public/data/bank-branches.json,
//     data.gov.il «סניפי בנקים פיזיים», 12.10.2026). בלי גופים שאינם בנק לפיקדונות (חברות כרטיסי אשראי, מס״ב, שב״א).
//   · בתי השקעות — חברי הבורסה ובתי ההשקעות הגדולים (אתר הבורסה לני״ע, רשימת החברים; נערך ידנית 16.10.2026).
//   · קופות וגופים מוסדיים — הגופים המנהלים קרנות פנסיה, קרנות השתלמות וקופות גמל לפי אתר רשות שוק ההון,
//     ביטוח וחיסכון («גמל נט» / «פנסיה נט»; נערך ידנית 16.10.2026).
//   · חברות ביטוח — מבטחים בענפי חיים ובריאות לפי רשות שוק ההון (נערך ידנית 16.10.2026).
//   · זירות קריפטו — הזירות הנפוצות בישראל (נערך ידנית 16.10.2026; אין רשימה רשמית).
//   · מדינות — שמות בעברית, מזהה ISO 3166-1 alpha-2 (נערך 16.10.2026; המדינות הנפוצות אצל לקוחות ישראלים).

export type InstitutionListId = 'accounts' | 'funds' | 'insurers' | 'crypto' | 'countries' | 'allowancePayers' | 'bookkeepers' | 'software';

export interface InstitutionEntry {
  /** זהות קבועה. בנק — 'bank-<קוד>'. */
  id: string;
  label: string;
  /** מילים נוספות לחיפוש (שם באנגלית, כינוי). */
  aliases?: string[];
}

export interface InstitutionList {
  id: InstitutionListId;
  /** כותרת לשדה «איפה?» */
  title: string;
  /** מקור ותאריך — לתצוגה למשרד. */
  source: string;
  asOf: string;
  items: InstitutionEntry[];
}

const OTHER: InstitutionEntry = { id: 'other', label: 'אחר (לא ברשימה)' };

/** בנקים לפי קוד בנק ישראל. */
export const BANKS: InstitutionEntry[] = [
  { id: 'bank-12', label: 'בנק הפועלים', aliases: ['hapoalim', 'פועלים', '12'] },
  { id: 'bank-10', label: 'בנק לאומי', aliases: ['leumi', '10'] },
  { id: 'bank-20', label: 'בנק מזרחי טפחות', aliases: ['mizrahi', 'tefahot', 'מזרחי', 'טפחות', '20'] },
  { id: 'bank-11', label: 'בנק דיסקונט', aliases: ['discount', '11'] },
  { id: 'bank-31', label: 'הבנק הבינלאומי', aliases: ['בינלאומי', 'fibi', '31'] },
  { id: 'bank-04', label: 'בנק יהב', aliases: ['yahav', '04', '4'] },
  { id: 'bank-14', label: 'בנק אוצר החייל', aliases: ['otsar', 'אוצר', '14'] },
  { id: 'bank-17', label: 'בנק מרכנתיל דיסקונט', aliases: ['mercantile', 'מרכנתיל', '17'] },
  { id: 'bank-18', label: 'One Zero — הבנק הדיגיטלי', aliases: ['one zero', 'וואן זירו', '18'] },
  { id: 'bank-46', label: 'בנק מסד', aliases: ['massad', '46'] },
  { id: 'bank-52', label: 'בנק פועלי אגודת ישראל', aliases: ['פאג״י', 'pagi', '52'] },
  { id: 'bank-54', label: 'בנק ירושלים', aliases: ['jerusalem', '54'] },
  { id: 'bank-26', label: 'יו-בנק', aliases: ['ubank', 'u-bank', '26'] },
  { id: 'bank-03', label: 'בנק אש ישראל', aliases: ['esh', '03', '3'] },
  { id: 'bank-22', label: 'Citibank', aliases: ['סיטי', '22'] },
  { id: 'bank-23', label: 'HSBC', aliases: ['23'] },
  { id: 'bank-39', label: 'SBI State Bank of India', aliases: ['39'] },
];

export const INVESTMENT_HOUSES: InstitutionEntry[] = [
  { id: 'ih-ibi', label: 'IBI בית השקעות', aliases: ['איי.בי.איי', 'אי בי אי'] },
  { id: 'ih-meitav', label: 'מיטב', aliases: ['meitav', 'מיטב דש'] },
  { id: 'ih-altshuler', label: 'אלטשולר שחם', aliases: ['altshuler'] },
  { id: 'ih-psagot', label: 'פסגות', aliases: ['psagot'] },
  { id: 'ih-more', label: 'מור', aliases: ['more'] },
  { id: 'ih-analyst', label: 'אנליסט', aliases: ['analyst'] },
  { id: 'ih-harel-fin', label: 'הראל פיננסים', aliases: ['harel'] },
  { id: 'ih-excellence', label: 'אקסלנס (הפניקס)', aliases: ['excellence', 'הפניקס'] },
  { id: 'ih-yelin', label: 'ילין לפידות', aliases: ['yelin'] },
  { id: 'ih-infinity', label: 'אינפיניטי', aliases: ['infinity'] },
  { id: 'ih-ibkr', label: 'Interactive Brokers', aliases: ['אינטראקטיב', 'ibkr'] },
  { id: 'ih-etoro', label: 'eToro', aliases: ['איטורו'] },
];

export const FUND_MANAGERS: InstitutionEntry[] = [
  { id: 'fund-menora', label: 'מנורה מבטחים', aliases: ['menora'] },
  { id: 'fund-harel', label: 'הראל', aliases: ['harel'] },
  { id: 'fund-clal', label: 'כלל ביטוח ופנסיה', aliases: ['clal', 'כלל'] },
  { id: 'fund-migdal', label: 'מגדל', aliases: ['migdal'] },
  { id: 'fund-phoenix', label: 'הפניקס', aliases: ['phoenix'] },
  { id: 'fund-altshuler', label: 'אלטשולר שחם גמל ופנסיה', aliases: ['altshuler'] },
  { id: 'fund-meitav', label: 'מיטב גמל ופנסיה', aliases: ['meitav'] },
  { id: 'fund-more', label: 'מור גמל ופנסיה', aliases: ['more'] },
  { id: 'fund-analyst', label: 'אנליסט', aliases: ['analyst'] },
  { id: 'fund-yelin', label: 'ילין לפידות', aliases: ['yelin'] },
  { id: 'fund-infinity', label: 'אינפיניטי', aliases: ['infinity'] },
  { id: 'fund-hachshara', label: 'הכשרה', aliases: ['hachshara'] },
  { id: 'fund-ayalon', label: 'איילון', aliases: ['ayalon'] },
  { id: 'fund-slice', label: 'סלייס גמל', aliases: ['slice'] },
  { id: 'fund-amitim', label: 'עמיתים (קרנות פנסיה ותיקות)', aliases: ['amitim', 'מבטחים הוותיקה'] },
];

export const INSURERS: InstitutionEntry[] = [
  { id: 'ins-harel', label: 'הראל', aliases: ['harel'] },
  { id: 'ins-migdal', label: 'מגדל', aliases: ['migdal'] },
  { id: 'ins-clal', label: 'כלל ביטוח', aliases: ['clal'] },
  { id: 'ins-phoenix', label: 'הפניקס', aliases: ['phoenix'] },
  { id: 'ins-menora', label: 'מנורה מבטחים', aliases: ['menora'] },
  { id: 'ins-ayalon', label: 'איילון', aliases: ['ayalon'] },
  { id: 'ins-hachshara', label: 'הכשרה', aliases: ['hachshara'] },
  { id: 'ins-direct', label: 'ביטוח ישיר (איי.די.איי)', aliases: ['idi', 'ישיר'] },
  { id: 'ins-shlomo', label: 'שלמה ביטוח', aliases: ['shlomo'] },
  { id: 'ins-wesure', label: 'ווישור', aliases: ['wesure'] },
  { id: 'ins-libra', label: 'ליברה', aliases: ['libra'] },
  { id: 'ins-aig', label: 'AIG ישראל', aliases: ['איי.איי.ג׳י'] },
];

export const CRYPTO_EXCHANGES: InstitutionEntry[] = [
  { id: 'cx-bit2c', label: 'Bit2C', aliases: ['ביט2סי'] },
  { id: 'cx-bitsofgold', label: 'Bits of Gold', aliases: ['ביטס אוף גולד'] },
  { id: 'cx-binance', label: 'Binance', aliases: ['ביננס'] },
  { id: 'cx-coinbase', label: 'Coinbase', aliases: ['קוינבייס'] },
  { id: 'cx-kraken', label: 'Kraken', aliases: ['קרייקן'] },
  { id: 'cx-etoro', label: 'eToro', aliases: ['איטורו'] },
  { id: 'cx-bybit', label: 'Bybit' },
  { id: 'cx-okx', label: 'OKX' },
  { id: 'cx-wallet', label: 'ארנק פרטי (לא בזירה)', aliases: ['wallet', 'ledger', 'ארנק קר'] },
];

export const COUNTRIES: InstitutionEntry[] = [
  { id: 'us', label: 'ארצות הברית', aliases: ['ארה״ב', 'usa', 'אמריקה'] }, { id: 'gb', label: 'בריטניה', aliases: ['אנגליה', 'uk', 'לונדון'] },
  { id: 'de', label: 'גרמניה', aliases: ['germany'] }, { id: 'fr', label: 'צרפת', aliases: ['france'] }, { id: 'cy', label: 'קפריסין', aliases: ['cyprus'] },
  { id: 'gr', label: 'יוון', aliases: ['greece'] }, { id: 'pt', label: 'פורטוגל', aliases: ['portugal'] }, { id: 'es', label: 'ספרד', aliases: ['spain'] },
  { id: 'it', label: 'איטליה', aliases: ['italy'] }, { id: 'nl', label: 'הולנד', aliases: ['netherlands'] }, { id: 'be', label: 'בלגיה', aliases: ['belgium'] },
  { id: 'ch', label: 'שווייץ', aliases: ['switzerland'] }, { id: 'at', label: 'אוסטריה', aliases: ['austria'] }, { id: 'se', label: 'שוודיה', aliases: ['sweden'] },
  { id: 'no', label: 'נורווגיה', aliases: ['norway'] }, { id: 'dk', label: 'דנמרק', aliases: ['denmark'] }, { id: 'fi', label: 'פינלנד', aliases: ['finland'] },
  { id: 'ie', label: 'אירלנד', aliases: ['ireland'] }, { id: 'pl', label: 'פולין', aliases: ['poland'] }, { id: 'cz', label: 'צ׳כיה', aliases: ['czech'] },
  { id: 'hu', label: 'הונגריה', aliases: ['hungary'] }, { id: 'ro', label: 'רומניה', aliases: ['romania'] }, { id: 'bg', label: 'בולגריה', aliases: ['bulgaria'] },
  { id: 'ru', label: 'רוסיה', aliases: ['russia'] }, { id: 'ua', label: 'אוקראינה', aliases: ['ukraine'] }, { id: 'ge', label: 'גאורגיה', aliases: ['georgia'] },
  { id: 'tr', label: 'טורקיה', aliases: ['turkey'] }, { id: 'ae', label: 'איחוד האמירויות', aliases: ['דובאי', 'uae'] },
  { id: 'ca', label: 'קנדה', aliases: ['canada'] }, { id: 'au', label: 'אוסטרליה', aliases: ['australia'] }, { id: 'nz', label: 'ניו זילנד', aliases: ['new zealand'] },
  { id: 'br', label: 'ברזיל', aliases: ['brazil'] }, { id: 'ar', label: 'ארגנטינה', aliases: ['argentina'] }, { id: 'mx', label: 'מקסיקו', aliases: ['mexico'] },
  { id: 'za', label: 'דרום אפריקה', aliases: ['south africa'] }, { id: 'in', label: 'הודו', aliases: ['india'] }, { id: 'cn', label: 'סין', aliases: ['china'] },
  { id: 'hk', label: 'הונג קונג', aliases: ['hong kong'] }, { id: 'sg', label: 'סינגפור', aliases: ['singapore'] }, { id: 'jp', label: 'יפן', aliases: ['japan'] },
  { id: 'kr', label: 'דרום קוריאה', aliases: ['korea'] }, { id: 'th', label: 'תאילנד', aliases: ['thailand'] }, { id: 'ph', label: 'הפיליפינים', aliases: ['philippines'] },
  { id: 'vn', label: 'וייטנאם', aliases: ['vietnam'] },
];

export const ALLOWANCE_PAYERS: InstitutionEntry[] = [
  { id: 'ap-btl', label: 'ביטוח לאומי', aliases: ['המוסד לביטוח לאומי', 'בל'] },
  { id: 'ap-pension', label: 'קרן פנסיה', aliases: ['פנסיה'] },
  { id: 'ap-insurer', label: 'חברת ביטוח', aliases: ['ביטוח מנהלים'] },
  { id: 'ap-mod', label: 'משרד הביטחון', aliases: ['אגף השיקום', 'צה״ל'] },
  { id: 'ap-employer', label: 'מעסיק קודם (פנסיה תקציבית)', aliases: ['מדינה', 'עירייה'] },
  { id: 'ap-treasury', label: 'משרד האוצר (גמלאות)', aliases: ['מינהלת הגמלאות'] },
];

export const BOOKKEEPERS: InstitutionEntry[] = [
  { id: 'bk-self', label: 'אני בעצמי' },
  { id: 'bk-external', label: 'מנהל/ת חשבונות חיצוני/ת' },
  { id: 'bk-prev-cpa', label: 'רואה החשבון הקודם' },
  { id: 'bk-family', label: 'בן/בת משפחה' },
  { id: 'bk-none', label: 'עוד לא התחלתי' },
  { id: 'bk-unsure', label: 'לא יודע/ת' },
];

export const SOFTWARE: InstitutionEntry[] = [
  { id: 'sw-greeninvoice', label: 'חשבונית ירוקה', aliases: ['green invoice'] },
  { id: 'sw-icount', label: 'iCount', aliases: ['אייקאונט'] },
  { id: 'sw-morning', label: 'Morning', aliases: ['מורנינג'] },
  { id: 'sw-rivhit', label: 'ריווחית', aliases: ['rivhit'] },
  { id: 'sw-sumit', label: 'SUMIT', aliases: ['סאמיט'] },
  { id: 'sw-ezcount', label: 'EZcount', aliases: ['איזיקאונט'] },
  { id: 'sw-hashavshevet', label: 'חשבשבת', aliases: ['hashavshevet'] },
  { id: 'sw-priority', label: 'פריוריטי', aliases: ['priority'] },
  { id: 'sw-invoice4u', label: 'Invoice4U' },
  { id: 'sw-manual', label: 'אקסל או פנקס ידני', aliases: ['excel', 'ידני'] },
  { id: 'sw-none', label: 'אין עדיין' },
];

export const INSTITUTION_LISTS: Record<InstitutionListId, InstitutionList> = {
  accounts: { id: 'accounts', title: 'באיזה בנק או בית השקעות?', source: 'בנק ישראל (קודי בנק) · הבורסה לני״ע (חברי בורסה)', asOf: '2026-10-16', items: [...BANKS, ...INVESTMENT_HOUSES, OTHER] },
  funds: { id: 'funds', title: 'באיזו חברה?', source: 'רשות שוק ההון, ביטוח וחיסכון — גופים מנהלים', asOf: '2026-10-16', items: [...FUND_MANAGERS, OTHER] },
  insurers: { id: 'insurers', title: 'באיזו חברת ביטוח?', source: 'רשות שוק ההון, ביטוח וחיסכון — מבטחים', asOf: '2026-10-16', items: [...INSURERS, OTHER] },
  crypto: { id: 'crypto', title: 'באיזו זירה?', source: 'זירות נפוצות בישראל (אין רשימה רשמית)', asOf: '2026-10-16', items: [...CRYPTO_EXCHANGES, OTHER] },
  countries: { id: 'countries', title: 'באיזו מדינה?', source: 'ISO 3166-1', asOf: '2026-10-16', items: [...COUNTRIES, OTHER] },
  allowancePayers: { id: 'allowancePayers', title: 'ממי?', source: 'סוגי משלמי קצבה (נערך במשרד)', asOf: '2026-10-16', items: [...ALLOWANCE_PAYERS, OTHER] },
  bookkeepers: { id: 'bookkeepers', title: 'מי מנהל את הספרים?', source: 'נערך במשרד', asOf: '2026-10-16', items: BOOKKEEPERS },
  software: { id: 'software', title: 'באיזו תוכנה מוציאים חשבוניות?', source: 'תוכנות נפוצות (נערך במשרד)', asOf: '2026-10-16', items: [...SOFTWARE, OTHER] },
};

const norm = (s: string) => s.toLowerCase().replace(/["'״׳\-.\s]/g, '');
/** חיפוש ברשימה — לפי שם, כינוי או קוד; ריק = כל הרשימה. «אחר» תמיד נשאר. */
export function searchInstitutions(list: InstitutionListId, query: string): InstitutionEntry[] {
  const q = norm(query);
  const items = INSTITUTION_LISTS[list].items;
  if (!q) return items;
  return items.filter(e => norm(e.label).includes(q) || (e.aliases ?? []).some(a => norm(a).includes(q)) || e.id === 'other');
}
export const institutionLabel = (list: InstitutionListId, id: string): string => INSTITUTION_LISTS[list].items.find(e => e.id === id)?.label ?? id;
/** לשרת (build-items.mjs): מזהה ← שם, לכל רשימה. */
export const institutionMap = (): Record<InstitutionListId, Record<string, string>> =>
  Object.fromEntries(Object.values(INSTITUTION_LISTS).map(l => [l.id, Object.fromEntries(l.items.map(e => [e.id, e.label]))])) as Record<InstitutionListId, Record<string, string>>;

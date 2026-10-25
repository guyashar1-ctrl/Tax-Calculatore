// ─────────────────────────────────────────────────────────────────────────────
// מודל ידע — ניהול ספרים (הוראות מס הכנסה (ניהול פנקסי חשבונות), תשל"ג-1973)
//
// עקרון: כל עוסק משתייך לתוספת אחת לפי סוג העסק; בתוך התוספת, החובות נקבעות
// לפי מדרגה (מחזור / מועסקים). המודל משקף את זה ישירות:
//   סוג עסק → תוספת → מדרגה → ספרים + תיעוד.
// כל נתון נושא sectionRef למקור בהוראות. ערכי הסף הועתקו מהנוסח המשולב
// המעודכן — אין כאן מספר שלא הופיע במקור.
// ─────────────────────────────────────────────────────────────────────────────

export type AddendumId =
  | 'a' | 'b' | 'c' | 'd' | 'e' | 'f' | 'g' | 'h'
  | 'i' | 'j' | 'k' | 'l' | 'n' | 'o' | 'p';

/** תנאי כניסה למדרגה בתוך תוספת */
/** A source the bookkeeping rule was checked against: official text, gazette scan or consolidated reproduction. */
export interface SourceRef {
  id?: string;
  title: string;
  url: string;
  kind?: string;
  locator?: string;
  yearScope?: string;
  [key: string]: unknown;
}

export interface TierCondition {
  /** מחזור שנתי מעל סכום זה (₪) */
  turnoverAboveILS?: number;
  /** מחזור שנתי עד סכום זה (₪, כולל) */
  turnoverUpToILS?: number;
  /** מספר מועסקים מינימלי */
  employeesAtLeast?: number;
  /** מספר מועסקים מקסימלי (עד וכולל) */
  employeesAtMost?: number;
  /** יותר ממספר מועסקים זה (לא כולל) — כלשון התוספת; מוצג, ההכרעה במסלול הייעודי */
  employeesAbove?: number;
  /** 'or' = מספיק תנאי אחד (מחזור או מועסקים); 'and' = שניהם */
  logic?: 'or' | 'and';
  /** תנאי שאינו מחזור/מועסקים (מספר רכבים, תלמידים, תפקיד...) — מוכרע ידנית */
  custom?: boolean;
  /** ניסוח התנאי בשפה ברורה — לתצוגה. תמיד קיים. */
  asWritten: string;
}

export interface RequiredBook {
  /** שם הספר/המסמך */
  name: string;
  /** סעיף בתוספת */
  sectionRef?: string;
  /** פרטים ספציפיים לתוספת הזו (אם יש) */
  details?: string;
}

export interface AddendumTier {
  id: string;
  /** שם קצר לתצוגה, למשל: "עסק גדול — חשבונאות כפולה" */
  label: string;
  /** האם המדרגה מחייבת הנהלת חשבונות כפולה */
  doubleEntry: boolean;
  condition: TierCondition;
  requiredBooks: RequiredBook[];
  /** תיעוד נדרש בשפה חופשית (חשבוניות, שוברי קבלה, תעודות משלוח...) */
  requiredDocs?: string;
  notes?: string[];
  /** where the rule was read (research provenance, 25.10.2026) */
  sourceRefs?: SourceRef[];
}

/** ספר ייחודי לתוספת — מה הוא ומה רושמים בו */
export interface SpecialBook {
  name: string;
  whatIsRecorded: string;
}

export interface BookkeepingAddendum {
  id: AddendumId;
  /** האות העברית הרשמית: א', ב'... */
  letter: string;
  title: string;
  icon: string;
  /** על מי חלה — ההגדרה בשפה ברורה, נאמנה למקור */
  appliesTo: string;
  /** מונחים שהוגדרו בתוספת */
  definitions: { term: string; definition: string }[];
  /** המדרגות — מסודרות מהמחמירה (עסק גדול) לקלה */
  tiers: AddendumTier[];
  /** מה האשף שואל כדי להכריע מדרגה */
  wizard: {
    askTurnover: boolean;
    askEmployees: boolean;
    /** שאלה ייחודית (מספר רכבים / תלמידים / תת-תפקיד) במקום או בנוסף */
    customQuestion?: string;
  };
  /** מתי חובה קופה רושמת */
  cashRegister?: string;
  /** כללי מלאי/מפקד אם יש */
  inventoryRules?: string;
  /** ספרים ייחודיים לתוספת */
  specialBooks?: SpecialBook[];
  /** הערות מיוחדות (הקלות פנימיות, חריגים, מסלולים מיוחדים) */
  specialNotes?: string[];
  /** פריטים שדורשים אימות ידני נוסף */
  needsReview?: string[];
  /** where the rule was read (research provenance, 25.10.2026) */
  sourceRefs?: SourceRef[];
}

/** ערך במילון הספרים והתיעוד */
export interface BookDefinition {
  id: string;
  name: string;
  /** שמות נוספים/כינויים */
  aka?: string[];
  kind: 'book' | 'doc';
  icon: string;
  /** מה זה — משפט אחד ברור */
  whatIsIt: string;
  /** מה רושמים בו — רשימת השדות/הפרטים */
  whatIsRecorded: string[];
  /** מתי ואיך רושמים (מועדים מפרק ד') */
  whenRecorded?: string;
  /** טעויות נפוצות שמובילות לפסילה */
  commonMistakes?: string[];
  /** מקור בהוראות */
  sectionRef: string;
  /** where the rule was read (research provenance, 25.10.2026) */
  sourceRefs?: SourceRef[];
}

/** רשומה במיפוי סוגי העסקים → תוספת */
export interface BusinessTypeEntry {
  label: string;
  keywords: string[];
  addendumId: AddendumId;
  /** למה סווג כך */
  reasoning?: string;
  /** הסתייגות למקרי גבול ("נגר שמייצר = יצרן, נגר שמתקן = נותן שירות") */
  caveat?: string | null;
  confidence: 'high' | 'medium';
  /** where the rule was read (research provenance, 25.10.2026) */
  sourceRefs?: SourceRef[];
}

/** שאלת הכרעה למי שלא מצא את העסק ברשימה */
export interface DecisionQuestion {
  question: string;
  yesAddendum?: AddendumId;
  /** אם אין תשובה חיובית לאף שאלה — נופלים לסעיף הסל (יא') */
}

export const ADDENDUM_ICONS: Record<AddendumId, string> = {
  a: '🏭', b: '📦', c: '🛒', d: '🏗️', e: '⚖️', f: '🩺', g: '🚗', h: '🏫',
  i: '🏠', j: '🚙', k: '🧰', l: '🚜', n: '⛽', o: '🛡️', p: '💎',
};

// ─── חיפוש (אותה גישה כמו מודול ההוצאות) ────────────────────────────────────

const normalize = (s: string) =>
  s.replace(/["'׳״]/g, '')
   .replace(/\s+/g, ' ')
   .trim()
   .toLowerCase();

export function searchBusinessTypes(entries: BusinessTypeEntry[], query: string): BusinessTypeEntry[] {
  const q = normalize(query);
  if (!q) return entries;
  const words = q.split(' ').filter(w => w.length >= 2).flatMap(w => {
    const v = [w];
    if (w.length >= 4 && /^[מבלכשה]/.test(w)) v.push(w.slice(1));
    return v;
  });
  const score = (e: BusinessTypeEntry, term: string): number => {
    const label = normalize(e.label);
    const kws = e.keywords.map(normalize);
    const ws = (s: string) => s.split(/[\s/\-]+/);
    if (term.length <= 2) return ws(label).includes(term) ? 75 : kws.some(k => ws(k).includes(term)) ? 55 : 0;
    if (label === term) return 100;
    if (ws(label).some(w => w.startsWith(term))) return 80;
    if (kws.some(k => k === term)) return 70;
    if (kws.some(k => ws(k).some(w => w.startsWith(term)))) return 50;
    return 0;
    if (label === term) return 100;
    if (label.startsWith(term)) return 80;
    if (kws.some(k => k === term)) return 70;
    if (label.includes(term)) return 60;
    if (kws.some(k => k.startsWith(term) || term.startsWith(k))) return 50;
    if (kws.some(k => k.includes(term) || term.includes(k))) return 40;
    return 0;
  };
  return entries
    .map(e => ({ e, s: Math.max(score(e, q), ...words.map(w => score(e, w) * 0.9)) }))
    .filter(x => x.s > 0)
    .sort((a, b) => b.s - a.s)
    .map(x => x.e);
}

/**
 * התאמת מדרגה אוטומטית לפי מחזור ומועסקים.
 * המדרגות מסודרות מהמחמירה לקלה — המדרגה הראשונה שתנאיה מתקיימים תופסת.
 * מחזירה null כשהתוספת דורשת הכרעה ידנית (תנאי custom — רכבים/תלמידים/תפקיד).
 */

export function bookkeepingFields(id:string):any[]{
 const select=(key:string,label:string,options:string[])=>({key,label,options});
 const number=(key:string,label:string)=>({key,label});
 const fields:any[]=[select('vatExempt','האם חל על פעילות זו הפטור לפי 31(3) לחוק מע״מ?',['לא','כן']),select('relief','האם יש הקלה אישית נוספת, מעבר למסלולים המפורשים להלן?',['לא','כן'])];
 if(id==='b')fields.push(select('tobacco','האם עיקר העסק מכירת סיגריות ומוצרי טבק?',['לא','כן']),number('tobaccoSales','מכירות סיגריות וטבק מתוך המחזור (כולל מע״מ; אם נבחר כן)'));
 if(id==='c')fields.push(select('retailKind','סוג החנות',['רגילה','תכשיטים / תמרוקים / בית מרקחת / אופטיקאי']),select('soleRoute','מסלול מיוחד לעוסק יחיד',['רגיל לפי מחזור ומועסקים','כל תנאי 2(ה) ו־2(ו) מתקיימים ובוחר בחלופה','הרשאת מנהל מפורשת ל2(ז)']));
 if(id==='d')fields.push(number('constructionCost','עלות בנייה מנורמלת כהגדרה (ללא קרקע, כולל פחת ישיר)'));
 if(id==='e')fields.push(select('dental','האם מדובר בטכנאי שיניים?',['לא','כן']));
 if(id==='f')fields.push(select('dental','האם מדובר ברופא/מרפא שיניים?',['לא','כן']));
 if(id==='g')fields.push(number('vehicles','מספר כלי רכב ללימוד נהיגה מלבד אופנועים'),number('motorcycles','מספר אופנועים ללימוד נהיגה'));
 if(id==='h')fields.push(number('students','מספר תלמידים ממוצע לפי תחשיב מתועד'));
 if(id==='i'||id==='j')fields.push(select('role','מה הפעילות שנבדקת?',['סוחר','מתווך']),number('commission','עמלה שנתית (למתווך בלבד)'));
 if(id==='i')fields.push(number('stock','עלות מלאי לסוף השנה הקובעת (לסוחר בלבד)'));
 if(id==='k')fields.push(select('service','סוג השירות',['שירות רגיל','מוסך','מונית']));
 if(id==='l')fields.push(select('plantationsOnly','האם כל המחזור בחקלאות נובע מנטיעות?',['לא','כן']),number('dunams','שטח נטיעות כולל בדונמים (אם כל המחזור מנטיעות)'));
 if(id==='n')fields.push(select('fuelRole','סוג הפעילות',['תחנת דלק','סיכה או רחיצה בלבד']));
 if(id==='o')fields.push(select('insuranceRole','לפי ההגדרה המשפטית',['סוכן ביטוח','סוכן מורשה להדפסת פוליסות']));
 if(id==='p')fields.push(select('diamondRole','מהו עיקר העיסוק?',['מסחר / עיבוד עצמי','עיבוד מחומר גלם של אחרים או תיווך']));
 return fields;
}
export function matchTier(addendum:BookkeepingAddendum,turnoverILS:number|null,employees:number|null,facts:Record<string,string>={}):AddendumTier|null{
 const f:any=facts,id=addendum.id,tiers=addendum.tiers;
 const t=(key:string)=>tiers.find(t=>t.id===key)||null;
 const n=(key:string)=>f[key]!==undefined&&String(f[key]).trim()!==''&&Number.isFinite(Number(f[key]))&&Number(f[key])>=0?Number(f[key]):null;
 if(!f.vatExempt||!f.relief)return null;
 if(f.vatExempt==='כן')return {id:'exempt31',label:'מינימום לפי 2א — פעילות שסעיף 31(3) חל עליה',doubleEntry:false,condition:{asWritten:'הקלה ממבחני התוספות לפי 2א; אינו מסלול בעל עסק זעיר במס הכנסה.'},requiredBooks:[{name:'שוברי קבלה או ספר פדיון יומי',sectionRef:'2א(1)'},{name:'תיק תיעוד חוץ',sectionRef:'2א(2)'}],requiredDocs:'המינימום אינו פטור ממסמכים לפי דין אחר או מהתנאים להפקתם.'};
 if(f.relief==='כן')return null;
 if(turnoverILS!==null&&(!Number.isFinite(turnoverILS)||turnoverILS<0))return null;
 if(employees!==null&&(!Number.isFinite(employees)||employees<0))return null;
 let x=turnoverILS,e=employees;
 if(id==='e')return f.dental?t(f.dental==='כן'?'e2':'e1'):null;
 if(id==='f')return f.dental?t(f.dental==='כן'?'f2':'f1'):null;
 if(id==='g'){const v=n('vehicles'),m=n('motorcycles');return v===null||m===null||!Number.isInteger(v)||!Number.isInteger(m)?null:t(Math.ceil(v+m/3)>=5?'g1':'g2');}
 if(id==='h'){const s=n('students');return s===null?null:t(s>150?'h1':'h2');}
 if(id==='n')return f.fuelRole?t(f.fuelRole==='תחנת דלק'?'n1':'n2'):null;
 if(id==='o')return f.insuranceRole?t(f.insuranceRole==='סוכן ביטוח'?'o2':'o1'):null;
 if(id==='p')return f.diamondRole?t(f.diamondRole==='מסחר / עיבוד עצמי'?'p1':'p2'):null;
 if(id==='i'||id==='j'){
  if(!f.role)return null;
  if(f.role==='מתווך'){const c=n('commission');return c===null?null:t(id+(c>(id==='i'?620000:460000)?'1':'2'));}
  if(x===null)return null;const stock=id==='i'?n('stock'):0;return stock===null?null:t(id+(x+stock>11400000?'1':'2'));
 }
 if(id==='l'){
  if(!f.plantationsOnly)return null;
  if(f.plantationsOnly==='כן'){const d=n('dunams');return d===null?null:t(d>375?'l1':d>200?'l2':'l3');}
  return x===null?null:t(x>5100000?'l1':x>1400000?'l2':'l3');
 }
 if(id==='k'){
  if(!f.service)return null;
  if(f.service==='מונית')return t('k-taxi');
  if(f.service==='מוסך')return x===null?null:t(x>2950000?'k-garage1':x>1400000?'k-garage2':'k-garage3');
 }
 if(id==='c'){
  if(!f.retailKind||!f.soleRoute)return null;
  if(f.soleRoute==='כל תנאי 2(ה) ו־2(ו) מתקיימים ובוחר בחלופה')return t('c-sole');
  if(f.soleRoute==='הרשאת מנהל מפורשת ל2(ז)')return t('c-authorized');
 }
 if(id==='b'){
  if(!f.tobacco)return null;
  if(f.tobacco==='כן'){const sales=n('tobaccoSales');if(x===null||sales===null||sales>x)return null;x=x-sales+sales*.6;}
 }
 if(id==='d'){
  const cost=n('constructionCost');if(x===null||cost===null)return null;
  const z=Math.max(x,cost);if(z>3800000)return t('d1');if(e===null)return null;
  if(z>1010000&&z<=3800000||cost<1010000&&e>=6)return t('d2');
  return z<=1010000&&e<=5?t('d3'):null;
 }
 if(x===null)return null;
 // Where the turnover limb alone establishes the highest tier, missing employees cannot reduce it.
 if(id==='a'&&x>10100000)return t('a1');
 if(id==='b'&&x>10100000)return t('b1');
 if(id==='c'&&x>3800000)return t('c1');
 if(id==='k'&&x>2150000)return t('k1');
 if(e===null)return null;
 // Literal monetary comparisons and fractional employee counts: never a lowest-tier fallback.
 if(id==='a'){
  if(x===3800000&&e>=18)return null;
  if(x>3800000&&x<=10100000||x<3800000&&e>=18)return t('a2');
  if(x>2150000&&x<=3800000||x<2150000&&e>6&&e<=17)return t('a3');
  return x<=2150000&&e<=6?t('a4'):null;
 }
 if(id==='b'){
  if(e>=6)return t('b1');if(x>3800000&&x<=10100000||x<3800000&&(e===4||e===5))return t('b2');
  return x<=3800000&&e<=3?t('b3'):null;
 }
 if(id==='c'){
  if(e>=7)return t('c1');
  if(f.retailKind==='רגילה'&&x===2150000&&e>=5)return null;
  if(f.retailKind!=='רגילה'&&x<=3800000&&e<7||x>2150000&&x<=3800000||x<2150000&&(e===5||e===6))return t('c2');
  if(x>350000&&x<=2150000||x<=350000&&(e===3||e===4))return t('c3');
  return x<=350000&&e<=2?t('c4'):null;
 }
 if(id==='k')return x>820000&&x<=2150000||x<820000&&e>=5?t('k2'):x<=820000&&e<5?t('k3'):null;
 return null;
}

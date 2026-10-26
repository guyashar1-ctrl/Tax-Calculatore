import { DOMAINS, domainOf, type AreaPath, type DomainId } from '../taxArea/areaModel';
import { TOPICS } from './topics';

export const SHELVES = [
  { id: 'all', name: 'כל התחומים' },
  { id: 'business', name: 'עסק ועצמאים' },
  { id: 'savings', name: 'פנסיה וחיסכון' },
  { id: 'reports', name: 'דוחות והון' },
  { id: 'ni', name: 'ביטוח לאומי ושכר' },
  { id: 'tax', name: 'מס, זיכויים ונדל״ן' },
] as const;
export type ShelfId = typeof SHELVES[number]['id'];
export type MotifName = 'orbit' | 'branch' | 'pages' | 'sprout' | 'layers' | 'shield' | 'chart' | 'grid' | 'house';
export interface LibraryEntry {
  id: string; group: ShelfId; name: string; line: string; tags: string;
  icon: MotifName; hue: string; domain?: boolean;
}
// Presentation metadata from the approved illustration. Professional text, units and progress stay in their existing models.
const PRESENTATION: LibraryEntry[] = [
  { id: 'pensionSE', group: 'savings', name: 'פנסיה והטבות מס', line: 'מהפקדה לחיסכון — להבנת הניכוי, הזיכוי והמסלול המתאים.', tags: 'ניכוי וזיכוי · מסלולים · דוגמאות', icon: 'orbit', hue: 'blue' },
  { id: 'microBusiness', group: 'business', name: 'בעל עסק זעיר', line: 'להבין את תנאי המסלול, את החישוב ואת הדרך לדווח.', tags: 'זכאות · הוצאות · דיווח', icon: 'branch', hue: 'indigo' },
  { id: 'annualReturn', group: 'reports', name: 'הדוח השנתי', line: 'לחבר בין המידע של הלקוח, המסמכים והסעיפים בדוח.', tags: '1301 · נספחים · בדיקות', icon: 'pages', hue: 'slate' },
  { id: 'studyFund', group: 'savings', name: 'קרן השתלמות', line: 'להבחין בין ההטבות ולהבין איך ניגשים להפקדה.', tags: 'עצמאי · שכיר ועצמאי · תקרות', icon: 'sprout', hue: 'teal' },
  { id: 'dealerType', group: 'business', name: 'עוסק פטור או מורשה', line: 'להבין איך סוג העיסוק והמחזור משפיעים על הרישום.', tags: 'מע״מ · מחזור · פתיחת עסק', icon: 'branch', hue: 'indigo' },
  { id: 'wealth', group: 'reports', name: 'הצהרת הון', line: 'לבנות תמונת נכסים והתחייבויות, ולדעת מה לבדוק.', tags: '1219 · רישום · השוואת הון', icon: 'layers', hue: 'slate' },
  { id: 'niSelfEmployed', group: 'ni', name: 'ביטוח לאומי לעצמאי', line: 'להבין את בסיס ההכנסה, המקדמות וההתחשבנות.', tags: 'דמי ביטוח · מקדמות · שומה', icon: 'shield', hue: 'teal' },
  { id: 'mandatoryPension', group: 'savings', name: 'פנסיית חובה', line: 'להפריד בין חובת ההפקדה לבין הטבות המס על החיסכון.', tags: 'חובה · הכנסה · חישוב', icon: 'orbit', hue: 'blue' },
  { id: 'advances', group: 'business', name: 'מקדמות והערכת מס', line: 'לחבר נתונים במהלך השנה לתחזית ולבדיקה מסודרת.', tags: 'חודש חתך · תחזית · תשלומים', icon: 'chart', hue: 'indigo' },
  { id: 'form6111', group: 'reports', name: '6111 וסיווג הוצאות', line: 'לקרוא את מבנה הדיווח ולהבחין בין סוגי הסיווגים.', tags: 'דוחות כספיים · הוצאות · התאמה', icon: 'grid', hue: 'slate' },
  { id: 'maternity', group: 'ni', name: 'דמי לידה בדוח', line: 'לעבור מהאישור לבדיקת השנה, הסעיף והפריסה.', tags: 'אישור שנתי · פריסה · דוגמאות', icon: 'shield', hue: 'teal' },
  { id: 'credits', group: 'tax', name: 'נקודות זיכוי ומשפחה', line: 'ערכי מס והסברים לזכאות ולמצב המשפחתי.', tags: 'זכאות · משפחה · ערכים', icon: 'orbit', hue: 'amber', domain: true },
  { id: 'salary', group: 'ni', name: 'שכירים ושכר', line: 'נתוני שכר, שווי ובדיקות הקשורות להכנסה מעבודה.', tags: 'שכר · שווי · נתונים', icon: 'pages', hue: 'teal', domain: true },
  { id: 'rent', group: 'tax', name: 'שכר דירה ונדל״ן', line: 'הסברים וערכים לבדיקת מסלולי המיסוי.', tags: 'שכירות · מקרקעין · מסלולים', icon: 'house', hue: 'amber', domain: true },
  { id: 'companies', group: 'tax', name: 'נתוני מס לחברות', line: 'טבלאות וערכים לחברות ולבעלי שליטה.', tags: 'חברות · דיבידנד · ערכים', icon: 'layers', hue: 'amber', domain: true },
];
export const LIBRARY_ENTRIES: LibraryEntry[] = [
  ...PRESENTATION.filter(e => e.domain ? DOMAINS.some(d => d.id === e.id) : TOPICS.some(t => t.id === e.id)),
  ...TOPICS.filter(t => !PRESENTATION.some(e => e.id === t.id)).map(t => ({ id: t.id, group: 'all' as const, name: t.title, line: t.lead, tags: '', icon: 'pages' as const, hue: 'slate' })),
];
export const libraryEntry = (id: string) => LIBRARY_ENTRIES.find(e => e.id === id);
export const entryPath = (e: LibraryEntry): AreaPath => e.domain
  ? { mode: 'learn', domain: e.id as DomainId }
  : { mode: 'learn', domain: domainOf(e.id), item: e.id, sub: 'plan' };
export const LIBRARY_TOOLS = DOMAINS.flatMap(d => d.items.filter(i => i.kind === 'tool' && !['map1301', 'maintenance'].includes(i.id)).map(i => ({ ...i, domain: d.id })));

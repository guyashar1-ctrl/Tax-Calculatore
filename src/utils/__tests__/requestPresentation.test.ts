// ─── שם קצר ומצב אחד לשורת בקשה (utils/requestPresentation.ts) ──────────────
import { test, equal, assert, type TestCase } from '../../testkit/tinyTest';
import { splitRequestTitle, rowStateFor, NAME_MAX } from '../requestPresentation';

export const TESTS: TestCase[] = [
  test('שם קצר נשאר כמו שהוא, בלי פירוט', () => {
    const r = splitRequestTitle('חוזה שכירות למשרד');
    equal(r.name, 'חוזה שכירות למשרד');
    equal(r.detail, undefined);
  }),
  test('מקף ארוך מפריד בין השם לפירוט', () => {
    const r = splitRequestTitle('מסמכים לפתיחת התיק — אישורי בנק, דוחות שנתיים קודמים וטופסי 106');
    equal(r.name, 'מסמכים לפתיחת התיק');
    equal(r.detail, 'אישורי בנק, דוחות שנתיים קודמים וטופסי 106');
  }),
  test('נקודתיים מפרידות בין השם לפירוט', () => {
    const r = splitRequestTitle('אישורי ניכוי: מכל הלקוחות העסקיים לשנת 2025');
    equal(r.name, 'אישורי ניכוי');
    equal(r.detail, 'מכל הלקוחות העסקיים לשנת 2025');
  }),
  test('כותרת ארוכה בלי מפריד נחתכת בגבול מילה, והמלאה עוברת לפירוט', () => {
    const t = 'אישורי ניכוי מס במקור מכל הלקוחות העסקיים לשנת 2025 כולל אישור מרואה החשבון של החברה האם';
    const r = splitRequestTitle(t);
    assert(r.name.length <= NAME_MAX + 1, `name too long: ${r.name}`);
    assert(r.name.endsWith('…'), 'truncated name ends with …');
    equal(r.detail, t);
    assert(!/\s…$/.test(r.name), 'no space before …');
  }),
  test('כותרת שנכנסת בשורה נשארת שלמה גם עם מקף', () => {
    equal(splitRequestTitle('טופס 6101 — עדכון פרטים בביטוח לאומי').name, 'טופס 6101 — עדכון פרטים בביטוח לאומי');
  }),
  test('מספר בתוך שם (6101) אינו מפריד בכותרת ארוכה', () => {
    equal(splitRequestTitle('טופס 6101 — עדכון פרטים בביטוח לאומי לשני בני הזוג ולילדים').name, 'טופס 6101');
  }),
  test('רווחים כפולים מנורמלים', () => {
    equal(splitRequestTitle('  צילום   תעודת זהות ').name, 'צילום תעודת זהות');
  }),
  test('מצב: בעיה גוברת על הכול', () => {
    equal(rowStateFor({ kind: 'mine', tone: 'red', status: 'blocked', draft: true }).text, 'חסום');
    equal(rowStateFor({ kind: 'mine', tone: 'red', status: 'in_progress' }).text, 'דורש טיפול');
  }),
  test('מצב: טיוטה ולא «ממתין ל…» — הלקוח עוד לא רואה אותה', () => {
    const s = rowStateFor({ kind: 'waiting', tone: 'gray', waitingOn: 'client', status: 'pending', draft: true, clientFirstName: 'שרון' });
    equal(s.text, 'טיוטה'); equal(s.tone, 'amber');
  }),
  test('מצב: בדף בלי הודעה — «בדף, בלי מייל» (לא «טרם נשלח», שנקרא כאילו הלקוח לא רואה)', () => {
    equal(rowStateFor({ kind: 'waiting', tone: 'gray', waitingOn: 'client', status: 'waiting_client', unsent: true }).text, 'בדף, בלי מייל');
  }),
  test('מצב: אצל מי — בשם הפרטי', () => {
    equal(rowStateFor({ kind: 'waiting', tone: 'gray', waitingOn: 'client', status: 'waiting_client', clientFirstName: 'שרון' }).text, 'ממתין לשרון');
    equal(rowStateFor({ kind: 'waiting', tone: 'gray', waitingOn: 'spouse', status: 'waiting_client', spouseFirstName: 'רותם' }).text, 'ממתין לרותם');
    equal(rowStateFor({ kind: 'waiting', tone: 'gray', waitingOn: 'prev_accountant', status: 'waiting_client' }).text, 'ממתין לרו״ח הקודם');
  }),
  test('מצב: נעול — «בהמשך», בלי הסבר מה חוסם (הוא בפתיחה)', () => {
    equal(rowStateFor({ kind: 'waiting', tone: 'gray', waitingOn: 'locked', status: 'locked' }).text, 'בהמשך');
  }),
  test('מצב: אצלי — «לטיפולך»', () => {
    const s = rowStateFor({ kind: 'mine', tone: 'blue', status: 'pending' });
    equal(s.text, 'לטיפולך'); equal(s.tone, 'blue');
  }),
  test('כל מצב קצר — עד שלוש מילים', () => {
    const all = [
      rowStateFor({ kind: 'waiting', tone: 'gray', waitingOn: 'external', status: 'waiting_client' }),
      rowStateFor({ kind: 'waiting', tone: 'gray', waitingOn: 'paperless', status: 'waiting_client' }),
      rowStateFor({ kind: 'waiting', tone: 'gray', waitingOn: 'pivo', status: 'in_progress' }),
      rowStateFor({ kind: 'done', tone: 'gray', status: 'completed' }),
    ];
    for (const s of all) assert(s.text.split(' ').length <= 3, s.text);
  }),
];

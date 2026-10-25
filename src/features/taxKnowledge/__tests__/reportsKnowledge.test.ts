// ידע המס — הדוח השנתי, 6111 ומילון הסיווג, 1219, R01 עד R14 ופרומפט «טופס לשנה חדשה» (13.10.2026).
// ‼ הבדיקות בודקות מול המקור (קטלוג 1301/2025 שנקרא מהטופס), לא מול מה שהקוד הפיק.
import { test, equal, assert } from '../../../testkit/tinyTest';
import type { TestCase } from '../../../testkit/tinyTest';
import catalogJson from '../../taxForms/data/form1301-2025.catalog.json';
import { SOURCE_DOCS, ANNEX_NEEDS } from '../sourceDocs';
import { DICTIONARY, dictionaryTsv } from '../expenseDictionary';
import { WEALTH_PARTS } from '../wealthFormGuide';
import { RESEARCH_LEADS } from '../researchLeads';
import { buildMaintenancePrompt, NEW_FORM_TARGETS } from '../maintenancePrompt';
import { TOPICS, TOPIC_BY_ID } from '../topics';

type CatField = { codes: { registered?: string | null; spouse?: string | null; joint?: string | null } | null };
const FIELDS = (catalogJson as unknown as { fields: CatField[] }).fields;
const pairExists = (a: string, b: string) => FIELDS.some(f => f.codes && f.codes.registered === a && f.codes.spouse === b);
const codeExists = (c: string) => FIELDS.some(f => f.codes && [f.codes.registered, f.codes.spouse, f.codes.joint].includes(c));

export const TESTS: TestCase[] = [
  test('מסמכי מקור: כל צמד קודים «רשום/בן־בת זוג» קיים בקטלוג 1301/2025 בדיוק כצמד', () => {
    const bad: string[] = [];
    for (const d of SOURCE_DOCS) for (const r of d.rows) {
      for (const m of r.code.matchAll(/(?<![\d/])(\d{3})\/(\d{3})(?![\d/])/g)) {
        if (!pairExists(m[1], m[2])) bad.push(`${d.id}: ${m[0]} (${r.what})`);
      }
    }
    equal(bad.join(' | '), '');
  }),

  test('מסמכי מקור: קוד בודד (042, 043, 040, 256, 209…) קיים בקטלוג', () => {
    const bad: string[] = [];
    for (const d of SOURCE_DOCS) for (const r of d.rows) {
      // קוד אחרי «13xx:» שייך לנספח (למשל 1324: 439) — לא לקטלוג 1301
      const in1301 = r.code.split('·').map(seg => seg.replace(/13\d\d:.*$/, '')).join('·');
      const singles = [...in1301.matchAll(/(?<![\d/])(\d{3})(?![\d/])/g)].map(m => m[1]).filter(c => !['106', '867', '134'].includes(c) && !/^1[23]\d\d$/.test(c));
      for (const c of singles) if (!codeExists(c) && !/^13\d\d$|^1399$/.test(c)) bad.push(`${d.id}: ${c}`);
    }
    equal(bad.join(' | '), '');
  }),

  test('מסמכי מקור: לכל מסמך ארבעת הצעדים — זיהוי, שורות, בדיקה, טעויות וחוסר', () => {
    for (const d of SOURCE_DOCS) {
      assert(d.identify.length > 0 && d.rows.length > 0 && d.check.length > 0 && d.mistakes.length > 0 && d.missing.length > 0, d.id);
      assert(d.rows.every(r => ['verified', 'interpretation', 'open'].includes(r.status)), `${d.id}: סטטוס`);
    }
    assert(['106', 'btl-se', 'funds', '867', 'broker'].every(id => SOURCE_DOCS.some(d => d.id === id)), 'המסמכים שגיא ביקש: 106, ב״ל, קופות, 867, ברוקר');
    assert(SOURCE_DOCS.find(d => d.id === 'broker')!.rows.some(r => r.what.includes('Closed Lots')), 'IBKR ברמת המנה');
    assert(SOURCE_DOCS.find(d => d.id === 'broker')!.missing.some(m => m.includes('סיכום')), 'מקרה «רק סיכום»');
  }),

  test('«איזה נספח צריך»: 6111 מסומן פתוח (הסף סותר), לא «מאומת»', () => {
    const f = ANNEX_NEEDS.find(a => a.id === 'business')!.forms.find(x => x.form === '6111')!;
    equal(f.status, 'open');
    // 25.10.2026: הספים הישנים (256,410 / 254,777) הוחלפו בסף 2025 — 300,000 כולל מע״מ; הגבול המדויק פתוח וההמלצה מסומנת
    assert(f.why.includes('300,000') && f.why.includes('המלצה'), 'הסף, הגבול הפתוח וההמלצה בגלוי');
  }),

  test('מילון הסיווג: מפתחות ייחודיים; Claude/ChatGPT בתוכנה; תרומה וקנס אינם הוצאה מוכרת; הספק לבדו לא קובע', () => {
    equal(new Set(DICTIONARY.map(e => e.key)).size, DICTIONARY.length);
    const sw = DICTIONARY.find(e => e.key === 'software-subscription')!;
    assert(sw.examples.includes('Claude') && sw.examples.includes('ChatGPT'), 'דוגמאות של גיא');
    equal(sw.codeStatus, 'interpretation');
    assert(DICTIONARY.find(e => e.key === 'donations')!.incomeTax.includes('זיכוי'), 'תרומה — זיכוי, לא הוצאה');
    assert(DICTIONARY.find(e => e.key === 'fines')!.incomeTax.includes('לא מוכר'), 'קנס לא מוכר');
    assert(DICTIONARY.find(e => e.key === 'personal-expense')!.incomeTax.includes('הספק לבדו'), 'הספק אינו קובע');
  }),

  test('מילון — העתקה לטבלה: כותרת + שורה לכל קטגוריה, 11 עמודות בכל שורה, בלי טאב או שורה בתוך תא', () => {
    const tsv = dictionaryTsv();
    const lines = tsv.split('\n');
    equal(lines.length, DICTIONARY.length + 1);
    assert(lines.every(l => l.split('\t').length === 11), 'מספר עמודות קבוע');
    assert(lines[0].includes('קוד 6111') && lines[0].includes('שם בפייפרלס'), 'כותרות');
  }),

  test('1219: כל חלק עם שדות; הסעיפים החדשים (20, 40, ד׳ 3, ד׳ 4) מסומנים; ני״ע — עלות, לא שווי', () => {
    equal(WEALTH_PARTS.map(p => p.id).join(','), 'a,b,c,d');
    const all = WEALTH_PARTS.flatMap(p => p.rows);
    assert(['20', '40', 'ד׳ 3', 'ד׳ 4'].every(f => all.find(r => r.field === f)?.isNew), 'חדשים');
    assert(all.find(r => r.field === '70')!.record.includes('ההשקעה בפועל'), 'עלות');
    assert(all.find(r => r.field === '60')!.record.includes('כל ההפקדות'), 'קופות — כל ההפקדות');
  }),

  test('R01 עד R14: כל ארבעה-עשר קיימים; R03 נסגר עם קירשבלום; לא כולם «נסגר»', () => {
    equal(RESEARCH_LEADS.map(l => l.id).join(','), Array.from({ length: 14 }, (_, i) => `R${String(i + 1).padStart(2, '0')}`).join(','));
    const r3 = RESEARCH_LEADS.find(l => l.id === 'R03')!;
    assert(r3.state === 'closed' && r3.found.includes('קירשבלום'), 'R03');
    assert(RESEARCH_LEADS.some(l => l.state !== 'closed'), 'אין «הכול נסגר»');
    assert(RESEARCH_LEADS.filter(l => l.state !== 'closed').every(l => !!l.open), 'לכל פתוח/חלקי — מה פתוח');
  }),
  test('מפת היכולות R01 עד R14: שש יכולות נפרדות לכל דרישה; כל «חלקי» מוסבר; «מחושב» אינו «לא נבדק»; הסבר אינו מחליף חישוב', () => {
    const keys = ['research', 'explain', 'eligibility', 'compute', 'automation', 'tested'];
    for (const l of RESEARCH_LEADS) {
      equal(Object.keys(l.levels).sort().join(','), [...keys].sort().join(','), `${l.id}: שש יכולות`);
      for (const k of keys) if (l.levels[k as keyof typeof l.levels] === 'partial') assert(!!l.levelNotes?.[k as keyof typeof l.levels], `${l.id}: «חלקי» ב-${k} בלי הסבר`);
      if (l.levels.compute === 'done') assert(l.levels.tested !== 'no' && l.levels.tested !== 'na', `${l.id}: מחושב ולא נבדק`);
    }
    assert(RESEARCH_LEADS.some(l => l.levels.explain === 'done' && l.levels.compute === 'no'), 'יש דרישות שמוסברות ולא מחושבות — והמפה מראה את זה');
    assert(!RESEARCH_LEADS.every(l => l.levels.automation === 'done'), 'אין «הכול אוטומטי»');
  }),

  test('פרומפט «טופס לשנה חדשה»: שנת מס ≠ שנת פרסום; עדכון בפועל; בלי לשכתב הערכות; בלי «הכול אומת»; לכל טופס ברשימה', () => {
    for (const t of NEW_FORM_TARGETS) {
      const p = buildMaintenancePrompt({ kind: 'newForm', formId: t.formId, taxYear: 2026 });
      assert(p.includes(`טופס ${t.label} לשנת המס 2026`) && p.includes('ב-2027'), `${t.formId}: שנה ופרסום`);
      assert(p.includes('עדכון בפועל') && p.includes('לא רק דוח'), `${t.formId}: מוביל לעדכון`);
      assert(p.includes('אסור: לשנות תשובות לקוח') && p.includes('נדרשת בדיקה'), `${t.formId}: לא משכתבים`);
      assert(p.includes('בלי «הכול אומת»'), `${t.formId}: בלי תווית גורפת`);
      assert(p.includes(t.touches.split(',')[0].trim()), `${t.formId}: הרכיבים שנוגעים`);
    }
  }),

  test('פרומפט לכל המאגר כולל את R01 עד R14 ואת שני הנושאים החדשים', () => {
    const p = buildMaintenancePrompt({ kind: 'all' });
    assert(p.includes('R03') && p.includes('R14'), 'קצות החוט');
    assert(p.includes(TOPIC_BY_ID.annualReturn.title) && p.includes(TOPIC_BY_ID.form6111.title), 'נושאים חדשים');
    assert(TOPICS.length >= 9, 'לפחות 9 נושאים');
  }),
];

// ─── שמירה: רשימת הכיסוי הסגורה (31.10.2026) ────────────────────────────────────────────────────────────
// ‼ גיא (31.10.2026): «לפני שאתה מבצע נחשוב איך אפשר להימנע מזה ב-100%». הבדיקה נופלת כש:
//   · לשדה בטופס הרשמי (1301, נספח, 1219) אין שורה ברשימה — כלומר אף אחד לא שאל מאיפה הוא מגיע;
//   · מקור ברשימה לא קיים (פריט, שורת מסמך, שדה כרטיס), או ששדה «מכוסה» נשען על הקלדת משרד שלא ברשימה הסגורה;
//   · שדה סכום «מכוסה» שהמנוע לא מפיק;
//   · שאלה בשאלון לא מגיעה לשום חישוב, שדה או כרטיס, ואינה רשומה כפער;
//   · «כן» לשאלה, בלי הנתון שהיא פותחת, משאיר את הדוח «גיליון מלא» — ואינו רשום כפער (בדיקת התנהגות על המנוע עצמו);
//   · הספירה זזה בלי שעודכנה כאן — כל תיקון וכל פער חדש נראים בשינוי הזה.

import { test, assert, equal } from '../../../testkit/tinyTest';
import type { TestCase } from '../../../testkit/tinyTest';
import type { Client } from '../../../types';
import { CATALOG_1301_2025, ANNEX_CATALOG_2025, DRAFT_FILL_1301 } from '../coverage1301';
import { LEDGER_1301, LEDGER_GUIDE_EXTRA, LEDGER_ANNEXES, LEDGER_1219, LEDGER_BRIDGE, OFFICE_ITEMS, AUTH_SOURCES, OFFICE_WORK, QUESTION_GAPS, QUESTION_BY_DESIGN, SILENT_YES, NOT_A_QUESTION, ledgerSummary, type LedgerRow } from '../coverageLedger';
import { ANNUAL_FOLLOW } from '../../taxYear/asks';
import { ITEMS, ITEM_BY_KEY } from '../../taxYear/catalog';
import { DOC_TEMPLATES, TEMPLATE_DOC_KINDS } from '../../annualReturn/docTemplates';
import { WEALTH_PARTS } from '../../taxKnowledge/wealthFormGuide';
import { updatesCard } from '../../taxYear/recordToCard';
import { computeReturn } from '../../annualReturn/engine';
import { baseCard, booksFor, draft, fact, filingFacts } from '../../annualReturn/__tests__/fixtures';
import GUIDE from '../data/guide1301-2025.codes.json';
import TYPES_SRC from '../../../types/index.ts?raw';
import ENGINE_SRC from '../../annualReturn/engine.ts?raw';
import FORMFIELDS_SRC from '../../annualReturn/formFields.ts?raw';
import WEALTH_SRC from '../../wealthDeclaration/engine.ts?raw';

// ‼ הספירה הנוכחית. תיקון ⇒ מזיזים שורה מ-open ל-covered ברשימה ומעדכנים כאן; פער חדש ⇒ נראה כאן במפורש.
const EXPECTED = {
  form1301: { covered: 101, blocks: 56, open: 119, na: 29 },
  guideExtra: { covered: 0, blocks: 4, open: 11, na: 1 },
  annexes: { covered: 2, blocks: 7, open: 2, na: 0 },
  form1219: { covered: 3, blocks: 0, open: 25, na: 1 },
  bridge: { covered: 5, blocks: 0, open: 4, na: 0 },
  questionsNoUse: 70,
  silentYes: 77,
};

const clientBlock = TYPES_SRC.slice(TYPES_SRC.indexOf('export interface Client {'), TYPES_SRC.indexOf('\n}', TYPES_SRC.indexOf('export interface Client {')));
const clientHas = (k: string) => new RegExp(`\\n\\s+${k}\\??:`).test(clientBlock);
const DOC_LINES = new Set(Object.values(DOC_TEMPLATES).flat().flatMap(t => t.lines.map(l => l.key)));
const ALL: [string, Record<string, LedgerRow>][] = [['1301', LEDGER_1301], ['מדריך', LEDGER_GUIDE_EXTRA], ['נספחים', LEDGER_ANNEXES], ['1219', LEDGER_1219], ['גישור', LEDGER_BRIDGE]];

/** בעיה במקור אחד — או undefined. */
function badSource(src: string, status: LedgerRow['s']): string | undefined {
  const [kind, ...rest] = src.split(':');
  const v = rest.join(':');
  if (src === 'calc') return undefined;
  if (kind === 'q') { const i = ITEM_BY_KEY[v]; return !i ? `אין פריט ${v}` : i.who !== 'client' ? `${v} הוא פריט של המשרד — כתבו o:` : undefined; }
  if (kind === 'o') { const i = ITEM_BY_KEY[v]; return !i ? `אין פריט ${v}` : status === 'covered' && !OFFICE_ITEMS[v] ? `${v} — הקלדת משרד שלא ברשימה הסגורה (OFFICE_ITEMS)` : undefined; }
  if (kind === 'doc') return DOC_LINES.has(v) ? undefined : `אין שורת מסמך ${v}`;
  if (kind === 'card') return clientHas(v) ? undefined : `אין שדה ${v} בכרטיס`;
  if (kind === 'auth') return (AUTH_SOURCES as readonly string[]).includes(v) ? undefined : `רשות לא מוכרת ${v}`;
  if (kind === 'office') return (OFFICE_WORK as readonly string[]).includes(v) ? undefined : `עבודת משרד לא מוכרת ${v}`;
  return `סוג מקור לא מוכר: ${src}`;
}

/** הפריטים שהשאלון השנתי והצהרת ההון שואלים (לא קליטה, לא הערכה בלבד). ‼ מסמך הוא אסמכתה שמצורפת לסט — הקלט לחישוב
 *  הוא הסכום או העובדה שהוא מגבה, והם שנבדקים כאן. */
const inScope = ITEMS.filter(i => !i.key.startsWith('intake.') && !NOT_A_QUESTION[i.key] && i.kind !== 'document'
  && (i.purposes.includes('annual') || i.purposes.includes('wealth') || (i.purposes.length === 0 && !['business.forecast', 'business.oneOffs', 'business.inPaperless', 'business.forecastMonths', 'salary.payslipToDate', 'savings.depositsEstimate', 'estimate.applied', 'wealth.bridge.income'].includes(i.key))));

/** השרשרת «נשאל אחרי» של פריט — עד שאלת הפתיחה. */
const chainOf = (key: string): string[] => { const out: string[] = []; for (let k = ITEM_BY_KEY[key]?.after; k && !out.includes(k); k = ITEM_BY_KEY[k]?.after) out.push(k); return out; };
/** חומר לעבודת המשרד שגיא הגדיר כשלו (רו״ה, 1320, פחת) — כל מה שנשאל תחת העסק. */
const OFFICE_BOOKS_ROOTS = ['business.active', 'business.started'];

/** פריט שמגיע לחישוב, לשדה, לכרטיס, לעבודת המשרד המותרת — או לנושא שעוצר את הדוח בגלוי. */
function consumedSet(): Set<string> {
  const used = new Set<string>(Object.keys(QUESTION_BY_DESIGN));
  const blockGates = new Set<string>();
  for (const [, rows] of ALL) for (const r of Object.values(rows)) if (r.s === 'covered' || r.s === 'blocks') for (const f of r.from ?? []) if (/^[qo]:/.test(f)) {
    used.add(f.slice(2));
    // רק שאלת פתיחה שעוצרת את כל הנושא (מכירה, חו״ל, חברה, גמלאות) — לא «הנכסים שלך», שחלקם מחושב
    if (r.s === 'blocks' && ITEM_BY_KEY[f.slice(2)]?.kind === 'screener') blockGates.add(f.slice(2));
  }
  const literal = (k: string) => [ENGINE_SRC, FORMFIELDS_SRC, WEALTH_SRC].some(s => s.includes(`'${k}'`));
  for (const i of ITEMS) {
    const chain = chainOf(i.key);
    if (updatesCard(i.key) || literal(i.key)) used.add(i.key);
    if (i.kind === 'document' && i.docKind && (TEMPLATE_DOC_KINDS as string[]).includes(i.docKind)) used.add(i.key);
    // אישור של מה שכבר בכרטיס (התואר, השחרור, הנכסים) — הכרטיס הוא מה שהחישוב קורא
    if (i.kind === 'confirm' && (i.onlyIfOnCard || i.cardKeys?.length)) used.add(i.key);
    if (chain.some(k => OFFICE_BOOKS_ROOTS.includes(k)) || chain.some(k => blockGates.has(k))) used.add(i.key);
  }
  // שאלת פתיחה שפותחת פריט שמגיע — גם היא מגיעה (לפי «נשאל אחרי» ולפי מה שנפתח מהאריח בדוח השנתי)
  const followers = (k: string) => [...ITEMS.filter(f => f.after === k).map(f => f.key), ...(ANNUAL_FOLLOW[k] ?? [])];
  for (let changed = true; changed;) {
    changed = false;
    for (const i of ITEMS) if (!used.has(i.key) && followers(i.key).some(f => used.has(f))) { used.add(i.key); changed = true; }
  }
  return used;
}

const BIZ = { id: 'bz1', name: 'ייעוץ דוד', kind: 'osek_morshe', address: { street: 'הרצל', houseNumber: '10', city: 'תל אביב' } };
/** עצמאי מלא — «גיליון מלא» בלי שום «כן» נוסף (כמו scenarios.test.ts). */
function returnWithYes(key?: string) {
  const client = baseCard({ businesses: [BIZ] } as unknown as Partial<Client>);
  const facts = [fact('business.profit', 'client', { profit: 300_000, turnover: 400_000 }, { entityRef: 'bz1' }), fact('payments.niPaid', 'client', 40_000), fact('payments.advances', 'client', 50_000),
    fact('savings.selfAmounts', 'client', { pension: 20_000, studyFund: 10_000 }), ...filingFacts({ except: key ? [key] : [], extraDecl: { X6111: false } }),
    ...(key ? [fact(key, 'client', true), fact(key, 'couple', true)] : [])];
  return computeReturn({ client, draft: draft({ books: { bz1: booksFor(400_000, 300_000) } }), facts, evidence: [] });
}

export const TESTS: TestCase[] = [
  test('1301: לכל שדה בקטלוג (305) יש שורה ברשימה, ואין שורה בלי שדה', () => {
    const ids = new Set(CATALOG_1301_2025.map(e => e.id));
    const missing = [...ids].filter(id => !LEDGER_1301[id]);
    const extra = Object.keys(LEDGER_1301).filter(id => !ids.has(id));
    assert(!missing.length && !extra.length, `חסרות: ${missing.join(', ')} · מיותרות: ${extra.join(', ')}`);
  }),

  test('המדריך הרשמי (קריאה עצמאית): כל קוד שבמדריך — בקטלוג 1301 או בשורה נוספת ברשימה', () => {
    const inCatalog = new Set(CATALOG_1301_2025.flatMap(e => Object.values(e.codes ?? {}).filter(Boolean).map(c => String(c).padStart(3, '0'))));
    const extra = new Set(Object.keys(LEDGER_GUIDE_EXTRA).flatMap(k => k.split('/')));
    const guideCodes = (GUIDE as { codes: { code?: string | null; spouseCode?: string | null; jointCode?: string | null }[] }).codes
      .flatMap(c => [c.code, c.spouseCode, c.jointCode]).filter((c): c is string => !!c).map(c => String(c).padStart(3, '0'));
    const missing = [...new Set(guideCodes)].filter(c => !inCatalog.has(c) && !extra.has(c));
    const stale = [...extra].filter(c => inCatalog.has(c));
    assert(!missing.length, `קודים במדריך בלי שורה: ${missing.join(', ')}`);
    assert(!stale.length, `כבר בקטלוג — להוציא מהשורות הנוספות: ${stale.join(', ')}`);
  }),

  test('נספחים ו-1219: לכל נספח בקטלוג ולכל שורה בהוראות 1219 יש שורה', () => {
    const annexIds = ANNEX_CATALOG_2025.map(a => a.formId);
    assert(annexIds.every(id => LEDGER_ANNEXES[id]) && Object.keys(LEDGER_ANNEXES).every(id => annexIds.includes(id)), `נספחים: ${annexIds.filter(id => !LEDGER_ANNEXES[id]).join(', ')}`);
    const fields = WEALTH_PARTS.flatMap(p => p.rows.map(r => r.field));
    const missing = fields.filter(f => !LEDGER_1219[f]);
    assert(!missing.length && Object.keys(LEDGER_1219).every(f => fields.includes(f)), `1219 חסרות: ${missing.join(', ')}`);
  }),

  test('כל מקור קיים; «מכוסה» רק ממקור מותר; «עוצר» — עם השאלה שעוצרת; «לא שלנו» ו«פער» — עם הסבר', () => {
    const errs: string[] = [];
    for (const [name, rows] of ALL) for (const [id, r] of Object.entries(rows)) {
      if (!r.note.trim()) errs.push(`${name} ${id}: בלי הסבר`);
      if (r.s === 'covered' && !(r.from ?? []).length) errs.push(`${name} ${id}: מכוסה בלי מקור`);
      if (r.s === 'blocks' && !(r.from ?? []).some(f => /^(q|o|card):/.test(f))) errs.push(`${name} ${id}: עוצר בלי שאלה / כרטיס שמפעילים אותו`);
      for (const f of r.from ?? []) { const b = badSource(f, r.s); if (b) errs.push(`${name} ${id}: ${b}`); }
    }
    assert(!errs.length, errs.join('\n'));
  }),

  test('1301: שדה סכום «מכוסה» — המנוע מפיק אותו (DRAFT_FILL_1301)', () => {
    const bad = CATALOG_1301_2025.filter(e => e.kind === 'amount' && LEDGER_1301[e.id]?.s === 'covered'
      && !Object.values(e.codes ?? {}).some(cd => cd && DRAFT_FILL_1301[cd]));
    assert(!bad.length, bad.map(e => `${e.id} ${e.label.slice(0, 40)}`).join('\n'));
  }),

  test('כל שאלה בדוח השנתי ובהצהרת ההון מגיעה לחישוב, לשדה או לכרטיס — או רשומה כפער (QUESTION_GAPS, מדויק)', () => {
    const used = consumedSet();
    const unused = inScope.filter(i => !used.has(i.key)).map(i => i.key);
    const notListed = unused.filter(k => !QUESTION_GAPS[k]);
    const fixed = Object.keys(QUESTION_GAPS).filter(k => !unused.includes(k));
    assert(!notListed.length, `שאלות שלא מגיעות לשום מקום ואינן רשומות כפער:\n${notListed.join('\n')}`);
    assert(!fixed.length, `כבר מחוברות — להוציא מ-QUESTION_GAPS:\n${fixed.join('\n')}`);
  }),

  test('«כן» בלי הנתון ⇒ הדוח לא «גיליון מלא» — לכל שאלת פתיחה; מה שעדיין נעלם רשום ב-SILENT_YES (מדויק)', () => {
    equal(returnWithYes().status, 'completeWorksheet', 'תיק הבסיס חייב להיות מלא');
    const screeners = inScope.filter(i => i.kind === 'screener' && !i.key.startsWith('wealth.'));
    const silent = screeners.filter(i => returnWithYes(i.key).status === 'completeWorksheet').map(i => i.key);
    const notListed = silent.filter(k => !SILENT_YES.includes(k));
    const fixed = SILENT_YES.filter(k => !silent.includes(k));
    assert(!notListed.length, `«כן» שנעלם ואינו רשום:\n${notListed.join('\n')}`);
    assert(!fixed.length, `כבר עוצרות — להוציא מ-SILENT_YES:\n${fixed.join('\n')}`);
  }),

  test('הספירה — כל שינוי בכיסוי נראה כאן', () => {
    const s = ledgerSummary();
    for (const k of ['form1301', 'guideExtra', 'annexes', 'form1219', 'bridge', 'questionsNoUse', 'silentYes'] as const) equal(JSON.stringify(s[k]), JSON.stringify(EXPECTED[k]), k);
  }),
];

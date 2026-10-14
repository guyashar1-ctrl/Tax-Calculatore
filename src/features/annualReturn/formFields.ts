// ─── הדוח השנתי: בדיקת כיסוי מפורשת לכל שדה ונספח בטופס 1301@2025 — ללקוח הזה ─────────
// ‼ «מלא» אינו «אין חוסמים בהכנסות». לכל אחד מ-305 השדות בקטלוג נקבע: האם הוא נדרש ללקוח, ואם כן — האם יש לו
//   ערך ומאיפה, חסר נתון, או שהמערכת אינה מפיקה אותו. כך גם לנספחים. גיליון שחסר בו שדה או נספח רלוונטי —
//   «גיליון עבודה חלקי», גם כשאין חוסמים בחישוב. ‼ השלמה מקצועית אינה סוגרת חוסר במיפוי, בתוצר או בנספח.
// ‼ מקור אחד: פרטים קבועים מהכרטיס; הצהרות, פרטים שהכרטיס עוד לא מחזיק וחשבון להחזר — עובדות שנת המס
//   (`filing.declarations`, `filing.identity`, `filing.refundAccount`); הכנסות וניכויים — שדות המנוע.

import type { Client } from '../../types';
import type { YearFact } from '../taxYear/types';
import type { Person } from '../taxEstimate/types';
import { CATALOG_1301_2025, ANNEX_CATALOG_2025 } from '../taxForms/coverage1301';
import type { ReturnField, ReturnDraft } from './types';

export type Need = 'required' | 'applies' | 'optional' | 'notRelevant' | 'office';
export type RowState = 'filled' | 'missing' | 'notSupported' | 'notRelevant' | 'office' | 'empty';
/** איך משלימים שורה חסרה — הכפתור/המקום הנכון במוצר. */
export type Fix = 'declaration' | 'identity' | 'refund' | 'card' | 'yearFact' | 'none';
export interface CoverageRow {
  id: string; part: string; section?: string; code?: string; label: string; kind: string;
  person?: Person | 'joint';
  need: Need; state: RowState;
  value?: string | number | boolean;
  /** מאיפה הערך (או למה חסר / לא נתמך). */
  source: string;
  fix?: Fix;
}
export interface AnnexCoverage { formId: string; title: string; need: 'required' | 'notRelevant' | 'unknown'; reason: string; produced: 'full' | 'partial' | 'none' | 'notNeeded'; note?: string; entityRef?: string }
export interface FormCoverage {
  rows: CoverageRow[];
  annexes: AnnexCoverage[];
  counts: { relevant: number; filled: number; missing: number; notSupported: number; office: number };
  /** ערכים להפקה (זהות, הצהרות, נקודות זיכוי) — נוספים לשדות המנוע. */
  produced: ReturnField[];
}

type Entry = { id: string; part: string; section: string | null; codes: Record<string, string | null> | null; label: string; kind: string };
const CAT = CATALOG_1301_2025 as unknown as Entry[];

interface Ctx {
  client: Client; year: number; persons: Person[]; facts: YearFact[]; draft: ReturnDraft;
  fields: ReturnField[]; balance: number; bizPersons: Person[]; salaryPersons: Person[];
  gaps: { code: string }[];
  annex1320?: { entityRef: string; lines: Record<string, number>; complete: boolean; problems: string[] }[];
  annex1321?: { complete: boolean; problems: string[] };
}

// ── גישה לעובדות שנת המס ──
const accepted = (c: Ctx, key: string, role?: string) => c.facts.filter(f => f.itemKey === key && f.taxYear === c.year && f.status === 'accepted' && (role == null || f.subjectRole === role))
  .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
/** שאלת פתיחה: «כן» / «לא» / לא ידוע. */
export function screener(c: Pick<Ctx, 'facts' | 'year'>, key: string, role?: string): 'yes' | 'no' | 'unknown' {
  const f = accepted(c as Ctx, key, role)[0] ?? (role ? accepted(c as Ctx, key, 'couple')[0] : undefined);
  if (!f) return 'unknown';
  if (f.answer === 'no' || f.answer === 'not_applicable' || f.answer === 'zero') return 'no';
  return 'yes';
}
const objFact = (c: Ctx, key: string): Record<string, unknown> => {
  const v = accepted(c, key)[0]?.value;
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
};

/** הצהרות חלק א׳ שאין להן מקור אחר — המשרד מסמן כן/לא (עובדת שנת המס `filing.declarations`). */
export const DECLARATIONS: { id: string; when: (c: Ctx) => boolean; screener?: string; unsupportedIfYes?: boolean; note?: string }[] = [
  { id: 'F003', when: () => true, note: 'דוח למרות שאינו חייב — בקשת החזר' },
  { id: 'F006', when: c => c.client.familyStatus === 'married' && c.bizPersons.length > 0 },
  { id: 'F007', when: c => c.client.familyStatus === 'married' && c.persons.length > 1 },
  { id: 'F008', when: c => c.client.familyStatus === 'married' && c.fields.some(f => f.code === '037' || f.code === '237') },
  { id: 'F009', when: c => c.client.familyStatus === 'married' && c.fields.some(f => f.code === '037' || f.code === '237') },
  { id: 'F015', when: () => true, note: 'נכסים בחו״ל מעל 2,086,000' },
  { id: 'F017', when: c => (c.client.investmentAccounts ?? []).length > 0 },
  { id: 'F018', when: () => true, screener: 'companies.controlled', unsupportedIfYes: true },
  { id: 'F019', when: c => c.bizPersons.length > 0 },
  { id: 'F020', when: () => true },
  { id: 'F021', when: () => true, unsupportedIfYes: true },
  { id: 'F022', when: () => true, unsupportedIfYes: true },
  { id: 'F023', when: () => true, unsupportedIfYes: true },
  { id: 'F024', when: () => true, screener: 'special.moneyAbroad' },
  { id: 'F026', when: c => screener(c, 'niBenefits.received') === 'yes' },
  { id: 'F032', when: () => true, unsupportedIfYes: true },
  { id: 'F033', when: () => true, unsupportedIfYes: true },
  { id: 'F037', when: () => true, unsupportedIfYes: true },
  { id: 'F038', when: () => true, unsupportedIfYes: true },
  { id: 'F039', when: c => c.bizPersons.length > 0, unsupportedIfYes: true },
  { id: 'F040', when: () => true, unsupportedIfYes: true },
  { id: 'F041', when: () => true, unsupportedIfYes: true },
  { id: 'F042', when: () => true, unsupportedIfYes: true },
  { id: 'F046', when: c => c.bizPersons.length > 0, unsupportedIfYes: true },
  { id: 'F052', when: c => c.bizPersons.length > 0 },
];

/** פרטים שהכרטיס עוד לא מחזיק — עובדת שנת המס `filing.identity` (פער כרטיס מתועד). */
export const IDENTITY_KEYS = ['fatherName', 'spouseFatherName', 'zip', 'releaseDate', 'serviceMonths', 'spouseReleaseDate', 'spouseServiceMonths', 'degreeCode', 'spouseDegreeCode', 'aliyahDate', 'spouseAliyahDate', 'returningDate', 'spouseReturningDate'] as const;
export type IdentityKey = typeof IDENTITY_KEYS[number];
export const IDENTITY_LABEL: Record<IdentityKey, string> = {
  fatherName: 'שם האב — בן הזוג הרשום', spouseFatherName: 'שם האב — בן/בת הזוג', zip: 'מיקוד', releaseDate: 'חודש ושנת השחרור (MMYYYY)',
  serviceMonths: 'חודשי שירות מלאים', spouseReleaseDate: 'בן/בת הזוג — חודש ושנת השחרור', spouseServiceMonths: 'בן/בת הזוג — חודשי שירות',
  degreeCode: 'קוד התואר לפי טופס 119', spouseDegreeCode: 'בן/בת הזוג — קוד התואר', aliyahDate: 'תאריך העלייה', spouseAliyahDate: 'בן/בת הזוג — תאריך העלייה',
  returningDate: 'תאריך החזרה (תושב חוזר)', spouseReturningDate: 'בן/בת הזוג — תאריך החזרה',
};

/** שאלות פתיחה שהדוח צריך תשובה עליהן — בלי תשובה זה «לא ידוע», לא «אין». */
export const RETURN_SCREENERS: { key: string; label: string; area: string }[] = [
  { key: 'sales.sold', label: 'מכירת נכס, מניות או קריפטו', area: 'ח' }, { key: 'foreign.income', label: 'הכנסות או נכסים בחו״ל', area: 'ט' },
  { key: 'companies.controlled', label: 'חברה בשליטה', area: 'ה' }, { key: 'niBenefits.received', label: 'גמלאות ביטוח לאומי', area: 'ג' },
  { key: 'special.trust', label: 'נאמנות', area: 'א' }, { key: 'special.partnership', label: 'שותפות', area: 'א' },
  { key: 'special.reportablePosition', label: 'פעולה או עמדה חייבת בדיווח', area: 'א' }, { key: 'special.nonResident', label: 'תושבות', area: 'יג' },
  { key: 'special.financialInstitution', label: 'מוסד כספי', area: 'ו' }, { key: 'savings.insurance', label: 'ביטוח חיים ואובדן כושר עבודה', area: 'יב' },
  { key: 'donations.given', label: 'תרומות', area: 'יד' },
];

/** כתובת עסק בכרטיס היא מבנה (רחוב, מספר, עיר, מיקוד) — לטקסט אחד לשדה. */
const addrText = (a: unknown): string | undefined => {
  if (!a) return undefined;
  if (typeof a === 'string') return a.trim() || undefined;
  const x = a as { street?: string; houseNumber?: string; city?: string; zip?: string };
  const t = [[x.street, x.houseNumber].filter(Boolean).join(' '), x.city, x.zip].filter(Boolean).join(', ');
  return t || undefined;
};
const band = (age: number): number | null => (age < 0 || age > 18 ? null : age === 0 ? 0 : age <= 2 ? 1 : age === 3 ? 2 : age <= 5 ? 3 : age <= 17 ? 4 : 5);

/** בדיקת הכיסוי — לכל שדה בקטלוג ולכל נספח. */
export function buildCoverage(c: Ctx): FormCoverage {
  const { client, year } = c;
  const married = client.familyStatus === 'married';
  const sp = client.spouse;
  const decl = objFact(c, 'filing.declarations');
  const ident = objFact(c, 'filing.identity');
  const refund = objFact(c, 'filing.refundAccount');
  const hasSpouseInReport = c.persons.includes('spouse');
  const byCode = new Map<string, ReturnField[]>();
  for (const f of c.fields) byCode.set(f.code, [...(byCode.get(f.code) ?? []), f]);
  const rows: CoverageRow[] = [];
  const produced: ReturnField[] = [];
  const put = (e: Entry, r: Omit<CoverageRow, 'id' | 'part' | 'label' | 'kind' | 'section'> & { produce?: boolean }) => {
    rows.push({ id: e.id, part: e.part, section: e.section ?? undefined, label: e.label, kind: e.kind, ...r });
    if (r.produce && r.state === 'filled' && r.value !== undefined && !(e.kind === 'checkbox' && r.value === false) && !(e.kind === 'count' && r.value === 0)) {
      // ‼ מזהה הקטלוג (F###), לא קוד הטופס: כמה שורות חולקות קוד (ילדים לפי גיל, שנת התואר וקודו); הקובץ מרכיב מהן את הקוד
      produced.push({ code: e.id, part: e.part, section: e.section ?? undefined, label: e.label, person: r.person ?? 'client',
        kind: e.kind === 'amount' ? 'amount' : e.kind === 'checkbox' ? 'checkbox' : 'text',
        amount: e.kind === 'amount' ? Number(r.value) : undefined, checked: e.kind === 'checkbox' ? r.value === true : undefined,
        text: typeof r.value === 'string' || typeof r.value === 'number' ? String(r.value) : e.kind === 'yesno' ? (r.value ? 'כן' : 'לא') : undefined,
        source: { kind: 'card', text: r.source } });
    }
  };
  const fromCard = (e: Entry, v: unknown, src: string, opts: { need?: Need; fix?: Fix; person?: Person; code?: string } = {}) => {
    const has = v != null && v !== '' && !(typeof v === 'number' && isNaN(v));
    put(e, { need: opts.need ?? 'required', state: has ? 'filled' : opts.need === 'optional' ? 'empty' : 'missing', value: has ? (v as string | number | boolean) : undefined,
      source: has ? src : `חסר: ${src}`, fix: has ? undefined : opts.fix ?? 'card', person: opts.person, code: opts.code, produce: true });
  };
  const notRel = (e: Entry, why: string) => put(e, { need: 'notRelevant', state: 'notRelevant', source: why });
  const office = (e: Entry, why: string) => put(e, { need: 'office', state: 'office', source: why });
  const declRow = (e: Entry, d: typeof DECLARATIONS[number]) => {
    if (!d.when(c)) return notRel(e, 'לא חל לפי הנתונים');
    const sc = d.screener ? screener(c, d.screener) : 'unknown';
    const v = sc !== 'unknown' ? sc === 'yes' : typeof decl[e.id] === 'boolean' ? (decl[e.id] as boolean) : undefined;
    if (v === undefined) return put(e, { need: 'required', state: 'missing', source: 'הצהרה בהגשה — לסמן כן/לא', fix: 'declaration' });
    if (v && d.unsupportedIfYes) return put(e, { need: 'required', state: 'notSupported', value: true, source: 'סומן «כן» — הנושא אינו נתמך בהכנה האוטומטית (נספח/כלל)' });
    put(e, { need: 'required', state: 'filled', value: v, source: sc !== 'unknown' ? `שאלת פתיחה בשנת המס (${d.screener})` : 'הצהרת משרד בשנת המס', produce: true });
  };

  // ── מקורות הכנסה שהשנה צריכה לדעת עליהם: שאלת פתיחה שלא נענתה = «לא ידוע», לא «אין» ──
  const SCREENERS = RETURN_SCREENERS;
  const unknownScreeners = SCREENERS.filter(s => screener(c, s.key) === 'unknown');

  for (const e of CAT) {
    const sec = e.section ?? '';
    // ── שימוש המשדר / הצהרה וחתימה / פרטי המסייע ──
    // ‼ «לשימוש המשדר» — ממלא מי שמשדר (המשרד / PIVO), לא פקיד השומה. רק F291–F298 הם של משרד השומה.
    if (e.part === 'לשימוש המשדר') { transmitterRow(e); continue; }
    if (sec === 'הצהרה' || sec === 'מסייע') { office(e, sec === 'מסייע' ? 'פרטי המשרד — בהגשה' : 'חתימה ותאריך — בהגשה'); continue; }
    // ── חלק א׳ ──
    if (e.part === 'א') {
      switch (e.id) {
        case 'F001': put(e, { need: 'required', state: 'filled', value: married && hasSpouseInReport, source: married ? (hasSpouseInReport ? 'נשוי/אה — הכנסות שני בני הזוג בדוח' : 'נשוי/אה — רק הכנסות המגיש') : 'לא נשוי/אה', produce: true }); continue;
        case 'F002': put(e, { need: 'required', state: 'filled', value: !(married && hasSpouseInReport), source: 'נגזר ממי שבדוח', produce: true }); continue;
        case 'F004': case 'F005': {
          if (!married || hasSpouseInReport) { notRel(e, married ? 'בן/בת הזוג בדוח' : 'לא נשוי/אה'); continue; }
          const v = typeof decl[e.id] === 'boolean' ? decl[e.id] as boolean : e.id === 'F005' && client.spouseWorking === false && client.fieldMeta?.spouseWorking ? true : undefined;
          if (v === undefined) put(e, { need: 'required', state: 'missing', source: 'נשוי/אה ובן/בת הזוג לא בדוח — מגיש/ה בנפרד, או שאין לו/ה הכנסה?', fix: 'declaration' });
          else put(e, { need: 'required', state: 'filled', value: v, source: 'הצהרת משרד', produce: true });
          continue;
        }
        case 'F010': case 'F011': {
          const has = c.fields.some(f => f.code === e.id);
          put(e, { need: c.bizPersons.length ? 'required' : 'notRelevant', state: c.bizPersons.length ? 'filled' : 'notRelevant', value: has, source: 'מסלול העסק לשנה (עסק זעיר)', produce: true });
          continue;
        }
        case 'F012': { const rel = !!(client.isNewImmigrant || client.isReturningResident || sp?.isNewImmigrant || sp?.isReturningResident); put(e, { need: rel ? 'required' : 'notRelevant', state: rel ? 'filled' : 'notRelevant', value: rel, source: 'עולה / תושב חוזר — מהכרטיס', produce: true }); continue; }
        case 'F013': case 'F014': {
          const p = e.id === 'F013' ? client : sp; const rel = !!(p?.isNewImmigrant || p?.isReturningResident);
          if (!rel) { notRel(e, 'לא עולה / תושב חוזר'); continue; }
          fromCard(e, ident[e.id === 'F013' ? (client.isNewImmigrant ? 'aliyahDate' : 'returningDate') : (sp?.isNewImmigrant ? 'spouseAliyahDate' : 'spouseReturningDate')], 'תאריך הגעה (בכרטיס רק השנה)', { fix: 'identity' });
          continue;
        }
        case 'F016': { const tot = c.fields.filter(f => ['158', '172', '150', '170'].includes(f.code)).reduce((a, f) => a + (f.amount ?? 0), 0); put(e, { need: 'required', state: 'filled', value: tot > 721_560, source: 'נגזר מההכנסות בדוח (בדיקה גסה מול 721,560)', produce: true }); continue; }
        case 'F025': put(e, { need: 'required', state: 'filled', value: false, source: 'נספח 134 לא מצורף (לא נתמך — ראו נספחים)', produce: true }); continue;
        case 'F027': { const s = screener(c, 'special.nonResident'); put(e, s === 'unknown' ? { need: 'required', state: 'missing', source: 'תושבות לא אושרה לשנה', fix: 'yearFact' } : s === 'yes' ? { need: 'required', state: 'notSupported', source: 'תושב חוץ — לא נתמך' } : { need: 'required', state: 'filled', value: false, source: 'תושב ישראל (שאלת פתיחה)', produce: true }); continue; }
        case 'F028': case 'F029': case 'F030': case 'F031': { const s = screener(c, 'special.trust'); put(e, s === 'unknown' ? { need: 'required', state: 'missing', source: 'נאמנות — שאלת פתיחה לא נענתה', fix: 'yearFact' } : s === 'yes' ? { need: 'required', state: 'notSupported', source: 'נאמנות — לא נתמך' } : { need: 'required', state: 'filled', value: false, source: 'אין נאמנות (שאלת פתיחה)', produce: true }); continue; }
        case 'F034': case 'F035': case 'F036': { const k = !!client.isKibbutzMember; if (!k) { if (e.id === 'F034') put(e, { need: 'required', state: 'filled', value: false, source: 'לא חבר קיבוץ (כרטיס)', produce: true }); else notRel(e, 'לא חבר קיבוץ'); continue; } put(e, { need: 'required', state: 'notSupported', source: 'חבר קיבוץ — לא נתמך' }); continue; }
        case 'F043': case 'F044': case 'F045': { const s = screener(c, 'special.reportablePosition'); put(e, s === 'unknown' ? { need: 'required', state: 'missing', source: 'פעולה/עמדה חייבת בדיווח — לא נענה', fix: 'yearFact' } : s === 'yes' ? { need: 'required', state: 'notSupported', source: 'חייב בדיווח — לא נתמך' } : { need: 'required', state: 'filled', value: false, source: 'לא (שאלת פתיחה)', produce: true }); continue; }
        case 'F047': { const s = screener(c, 'special.partnership'); put(e, s === 'unknown' ? { need: 'required', state: 'missing', source: 'שותפות — לא נענה', fix: 'yearFact' } : s === 'yes' ? { need: 'required', state: 'notSupported', source: 'שותפות (1504) — לא נתמך' } : { need: 'required', state: 'filled', value: false, source: 'אין שותפות (שאלת פתיחה)', produce: true }); continue; }
        case 'F048': case 'F049': case 'F050': case 'F051': case 'F053': {
          if (!c.bizPersons.length) { notRel(e, 'אין עסק'); continue; }
          const v = decl[e.id];
          if (e.id === 'F050') { const ex = client.vatStatus === 'exemptDealer'; put(e, { need: 'required', state: 'filled', value: ex, source: 'סוג העוסק — מהכרטיס', produce: true }); continue; }
          if (v === undefined || v === '') put(e, { need: 'required', state: 'missing', source: 'ניהול ספרים — לפי הוראות ניהול ספרים (המשרד)', fix: 'declaration' });
          else put(e, { need: 'required', state: 'filled', value: v as string | boolean, source: 'הצהרת משרד', produce: true });
          continue;
        }
        case 'F054': { if (!c.bizPersons.length) { notRel(e, 'אין עסק'); continue; } const t = c.fields.filter(f => f.code === '238' || f.code === '239').reduce((a, f) => a + (f.amount ?? 0), 0); put(e, { need: 'required', state: 'filled', value: t > 256_410, source: 'נגזר מהמחזור (238/239)', produce: true }); continue; }
      }
      const d = DECLARATIONS.find(x => x.id === e.id);
      if (d) { declRow(e, d); continue; }
      notRel(e, 'לא חל לפי הנתונים');
      continue;
    }
    // ── חלק ב׳ — פרטים אישיים ──
    if (e.part === 'ב') {
      const spouseRel = married;
      const bizRel = (p: Person) => c.bizPersons.includes(p);
      const salRel = (p: Person) => c.salaryPersons.includes(p);
      const itFile = (client.taxFiles ?? []).find(t => t.authority === 'income_tax' && t.owner !== 'spouse')?.fileNumber;
      switch (e.id) {
        case 'F055': fromCard(e, itFile || client.idNumber, itFile ? 'מספר תיק מס הכנסה (כרטיס)' : 'ת״ז (מספר התיק הוא ת״ז של אחד מבני הזוג)'); continue;
        case 'F056': notRel(e, 'מדבקה — בדוח מודפס בלבד'); continue;
        case 'F057': fromCard(e, client.idNumber, 'ת״ז — כרטיס'); continue;
        case 'F058': fromCard(e, client.lastName, 'שם משפחה — כרטיס'); continue;
        case 'F059': fromCard(e, client.firstName, 'שם פרטי — כרטיס'); continue;
        case 'F060': fromCard(e, ident.fatherName, 'שם האב (לא נשמר בכרטיס)', { fix: 'identity' }); continue;
        case 'F061': fromCard(e, client.birthDate, 'תאריך לידה — כרטיס'); continue;
        case 'F062': case 'F063': case 'F064': case 'F065': case 'F066': {
          if (!spouseRel) { notRel(e, 'לא נשוי/אה'); continue; }
          const v = e.id === 'F062' ? (client.spouseIdNumber || sp?.idNumber) : e.id === 'F063' ? (client.spouseLastName || sp?.lastName) : e.id === 'F064' ? (client.spouseFirstName || sp?.firstName)
            : e.id === 'F065' ? ident.spouseFatherName : sp?.birthDate;
          fromCard(e, v, e.id === 'F065' ? 'שם האב של בן/בת הזוג (לא נשמר בכרטיס)' : 'פרטי בן/בת הזוג — כרטיס', { fix: e.id === 'F065' ? 'identity' : 'card' });
          continue;
        }
        case 'F067': { const m: Record<string, string> = { single: 'רווק/ה', married: 'נשוי/אה', divorced: 'גרוש/ה', widowed: 'אלמן/ה', singleParent: 'גרוש/ה / הורה יחיד' }; fromCard(e, m[client.familyStatus], 'מצב משפחתי — כרטיס'); continue; }
        case 'F068': put(e, { need: 'optional', state: 'empty', source: 'סימון שינוי מאז הדוח הקודם — לפי הצורך' }); continue;
        case 'F069': fromCard(e, client.address && client.city ? `${client.address}, ${client.city}${(client.zipCode || ident.zip) ? ` ${client.zipCode || ident.zip}` : ''}` : undefined, 'כתובת כולל מיקוד — כרטיס'); if (client.address && client.city && !(client.zipCode || ident.zip)) { rows[rows.length - 1].state = 'missing'; rows[rows.length - 1].source = 'חסר מיקוד'; rows[rows.length - 1].fix = 'identity'; produced.pop(); } continue;
        case 'F070': case 'F071': notRel(e, 'לתושב חוץ בלבד'); continue;
        case 'F072': fromCard(e, client.email, 'דוא״ל — כרטיס', { need: 'optional' }); continue;
        case 'F073': fromCard(e, client.landlinePhone, 'טלפון בבית — כרטיס', { need: 'optional' }); continue;
        case 'F074': case 'F075': put(e, { need: 'optional', state: 'empty', source: 'טלפון בעבודה — לא נשמר' }); continue;
        case 'F076': fromCard(e, client.phone, 'טלפון נייד — כרטיס', { need: 'optional' }); continue;
        case 'F077': case 'F078': put(e, { need: 'optional', state: 'empty', source: 'העדפת הודעות — לפי בחירת הלקוח' }); continue;
        case 'F079': fromCard(e, client.businessDescription || (salRel('client') ? 'שכיר/ה' : undefined), 'העיסוק העיקרי — כרטיס', { need: bizRel('client') || salRel('client') ? 'required' : 'optional' }); continue;
        case 'F080': case 'F081': case 'F082': case 'F083': case 'F084': {
          if (!bizRel('client')) { notRel(e, 'אין עסק לבן הזוג הרשום'); continue; }
          const b = (client.businesses ?? []).find(x => !(x as { belongsToSpouse?: boolean }).belongsToSpouse) as { name?: string; address?: unknown } | undefined;
          const vat = (client.taxFiles ?? []).find(t => t.authority === 'vat' && t.owner !== 'spouse')?.fileNumber;
          const ded = (client.taxFiles ?? []).find(t => t.authority === 'deductions' && t.owner !== 'spouse')?.fileNumber;
          const v = e.id === 'F080' ? b?.name : e.id === 'F081' ? addrText(b?.address) : e.id === 'F082' ? itFile || client.idNumber : e.id === 'F083' ? ded : vat;
          fromCard(e, v, e.id === 'F083' ? 'תיק ניכויים (רק למעסיק)' : 'פרטי העסק — כרטיס', { need: e.id === 'F083' ? 'optional' : 'required' });
          continue;
        }
        case 'F085': { if (!salRel('client')) { notRel(e, 'אין משכורת'); continue; } fromCard(e, (client.employers ?? []).filter(x => !(x as { belongsToSpouse?: boolean }).belongsToSpouse).map(x => x.name).filter(Boolean).join(', ') || undefined, 'שמות המעבידים — כרטיס'); continue; }
        case 'F086': case 'F087': case 'F088': case 'F089': case 'F090': case 'F091': case 'F092': {
          if (!hasSpouseInReport) { notRel(e, 'בן/בת הזוג לא בדוח'); continue; }
          if (e.id === 'F092') { if (!salRel('spouse')) { notRel(e, 'אין משכורת לבן/בת הזוג'); continue; } fromCard(e, (client.employers ?? []).filter(x => (x as { belongsToSpouse?: boolean }).belongsToSpouse).map(x => x.name).filter(Boolean).join(', ') || undefined, 'מעבידי בן/בת הזוג — כרטיס'); continue; }
          if (e.id === 'F086') { fromCard(e, sp?.businessDescription || (salRel('spouse') ? 'שכיר/ה' : undefined), 'העיסוק של בן/בת הזוג — כרטיס'); continue; }
          if (!bizRel('spouse')) { notRel(e, 'אין עסק לבן/בת הזוג'); continue; }
          const b = (client.businesses ?? []).find(x => (x as { belongsToSpouse?: boolean }).belongsToSpouse) as { name?: string; address?: unknown } | undefined;
          const vat = (client.taxFiles ?? []).find(t => t.authority === 'vat' && t.owner === 'spouse')?.fileNumber;
          const v = e.id === 'F087' ? b?.name : e.id === 'F088' ? addrText(b?.address) : e.id === 'F089' ? (client.spouseIdNumber || sp?.idNumber) : e.id === 'F090' ? undefined : vat;
          fromCard(e, v, 'עסק בן/בת הזוג — כרטיס', { need: e.id === 'F090' ? 'optional' : 'required', person: 'spouse' });
          continue;
        }
        case 'F093': case 'F094': case 'F095': case 'F096': {
          const need: Need = c.balance < 0 ? 'required' : 'optional';
          const v = e.id === 'F093' ? refund.account : e.id === 'F094' ? (refund.branch && refund.bank ? `${String(refund.bank).padStart(2, '0')}${String(refund.branch).padStart(3, '0')}` : undefined) : e.id === 'F095' ? refund.bank : refund.holder;
          fromCard(e, v, c.balance < 0 ? 'חשבון להחזר — על שם בן הזוג הרשום (filing.refundAccount)' : 'חשבון להחזר — רק אם יש החזר', { need, fix: 'refund', code: e.codes?.registered ?? undefined });
          continue;
        }
      }
      notRel(e, 'לא חל');
      continue;
    }
    // ── חלק יג — נקודות זיכוי ──
    if (e.part === 'יג') { creditRow(e); continue; }
    if (e.part === 'יד' && /^F25[4-9]$/.test(e.id)) {
      if (!client.qualifyingSettlementId) { notRel(e, 'אין יישוב מזכה'); continue; }
      if (e.id === 'F257' || e.id === 'F258' || e.id === 'F259') { notRel(e, 'לא עבר ליישוב מזכה אחר (לפי הכרטיס)'); continue; }
      if (!accepted(c, 'household.settlement')[0]) { put(e, { need: 'required', state: 'missing', source: 'יישוב מזכה — לאשר לשנה (שם ותקופת מגורים)', fix: 'yearFact' }); continue; }
      put(e, { need: 'required', state: 'filled', value: e.id === 'F254' ? String(client.qualifyingSettlementId) : e.id === 'F255' ? `01/01/${year}` : `31/12/${year}`, source: 'יישוב מזכה — אושר לשנה (מגורים כל השנה)', produce: true });
      continue;
    }
    // ── חלקי הכנסות, ניכויים, זיכויים ותשלומים: מה שהמנוע מילא; מה שחל ולא נתמך — מהפערים ──
    const codes = Object.values(e.codes ?? {}).filter(Boolean) as string[];
    const filled = codes.flatMap(cd => byCode.get(cd) ?? []);
    if (filled.length) {
      for (const f of filled) rows.push({ id: e.id, part: e.part, section: sec, code: f.code, label: e.label, kind: e.kind, person: f.person, need: 'applies', state: 'filled', value: f.kind === 'amount' ? f.amount : f.checked, source: f.source.text });
      continue;
    }
    const unsup = UNSUPPORTED_BY_PART[e.part]?.(c);
    if (unsup) { rows.push({ id: e.id, part: e.part, section: sec, code: codes[0], label: e.label, kind: e.kind, need: 'applies', state: 'notSupported', source: unsup }); continue; }
    const unknown = unknownScreeners.find(s => s.area === e.part);
    rows.push({ id: e.id, part: e.part, section: sec, code: codes[0], label: e.label, kind: e.kind, need: unknown ? 'required' : 'notRelevant', state: unknown ? 'missing' : 'notRelevant',
      source: unknown ? `לא ידוע אם יש ${unknown.label} — שאלת פתיחה לא נענתה` : 'אין נתון שחל', fix: unknown ? 'yearFact' : undefined });
  }

  // ── «לשימוש המשדר» ──
  function transmitterRow(e: Entry) {
    const code = e.codes?.registered ?? undefined;
    const yes = (id: string) => decl[id] === true;
    switch (e.id) {
      case 'F268': {
        if (!married || !hasSpouseInReport) return notRel(e, 'רק בחישוב נפרד של בני זוג');
        const v = decl['F007'];
        put(e, v === undefined ? { need: 'required', state: 'missing', source: 'מקור הכנסה משותף (66(ד)) — הצהרה', fix: 'declaration', code }
          : v ? { need: 'required', state: 'notSupported', source: 'מקור הכנסה משותף — לא נתמך', code }
          : { need: 'required', state: 'filled', value: '2', source: 'אין מקור הכנסה משותף', code, produce: true });
        return;
      }
      case 'F269': put(e, { need: 'required', state: 'filled', value: '1', source: 'חישוב נפרד/יחיד — כך מחשב המנוע (כל אדם עם הכנסותיו)', produce: true }); return;
      case 'F270': {
        const ownerOf = (id: string): Person | undefined => { const b = (client.businesses ?? []).find(x => x.id === id); return b ? ((b as { belongsToSpouse?: boolean }).belongsToSpouse ? 'spouse' : 'client') : undefined; };
        const tracks = [...new Set(Object.entries(c.draft.micro).filter(([, m]) => m.track === 'micro').map(([id]) => ownerOf(id)).filter((p): p is Person => !!p && c.persons.includes(p)))];
        if (!tracks.length) return notRel(e, 'אין עסק זעיר');
        put(e, { need: 'required', state: 'filled', value: tracks.length === 2 ? '443' : tracks[0] === 'client' ? '441' : '442', source: 'מסלול עסק זעיר לשנה', code, produce: true });
        return;
      }
      case 'F271': {
        if (decl['F042'] === undefined) return put(e, { need: 'required', state: 'missing', source: 'עסקאות עם צדדים קשורים בחו״ל (F042) — הצהרה', fix: 'declaration', code });
        const any = yes('F042') || screener(c, 'special.reportablePosition') === 'yes';
        put(e, any ? { need: 'required', state: 'notSupported', source: 'פעולה חייבת בדיווח / מחירי העברה — לא נתמך', code } : { need: 'required', state: 'filled', value: '9', source: 'אין', code, produce: true });
        return;
      }
      case 'F272': {
        const s = screener(c, 'special.reportablePosition');
        if (s === 'unknown') return put(e, { need: 'required', state: 'missing', source: 'עמדה / חוות דעת חייבת בדיווח — לא נענה', fix: 'yearFact', code });
        put(e, s === 'yes' ? { need: 'required', state: 'notSupported', source: 'עמדה חייבת בדיווח — לא נתמך', code } : { need: 'required', state: 'filled', value: '9', source: 'לא בשניהם', code, produce: true });
        return;
      }
      case 'F273': return notRel(e, 'אין עמדה חייבת בדיווח');
      case 'F274': return put(e, { need: 'optional', state: 'empty', source: 'ניכויים במקור גבוהים מההכנסות — רק כשקורה' });
      case 'F275': return notRel(e, 'מס מוגבל ל-35% — לא חל');
      case 'F276': return notRel(e, 'אין נאמנות');
      case 'F277': {
        const i = yes('F019'), en = yes('F020');
        if (!i && !en) return notRel(e, 'אין הכנסות אינטרנט / אנרגיות');
        put(e, { need: 'required', state: 'filled', value: i && en ? '4' : i ? '2' : '3', source: 'לפי הצהרות F019/F020', code, produce: true });
        return;
      }
      case 'F278': return yes('F039') ? put(e, { need: 'required', state: 'notSupported', source: 'סיום בנייה (702) — לא נתמך', code }) : notRel(e, 'אין סיום בנייה');
      case 'F279': {
        if (!c.bizPersons.length) return notRel(e, 'אין עסק');
        const v = decl['F053'];
        put(e, v === undefined ? { need: 'required', state: 'missing', source: 'הפקת חשבונית: ממוחשב / ידני — הצהרה', fix: 'declaration', code }
          : { need: 'required', state: 'filled', value: v === 'manual' ? '2' : '1', source: 'הצהרת משרד', code, produce: true });
        return;
      }
      case 'F280': return notRel(e, 'אין חברה משפחתית / 62א');
      case 'F281': return yes('F015') ? put(e, { need: 'required', state: 'filled', value: '1', source: 'נכס בחו״ל (F015)', code, produce: true }) : notRel(e, 'אין נכס בחו״ל מעל הסף');
      case 'F282': case 'F283': case 'F284': {
        const rel = !!(client.isNewImmigrant || client.isReturningResident || sp?.isNewImmigrant || sp?.isReturningResident);
        return rel ? put(e, { need: 'required', state: 'notSupported', source: 'עולה חדש / תושב חוזר — תאריך וחודשי הזכאות לשידור — לא מופק', code }) : notRel(e, 'לא עולה / תושב חוזר');
      }
      case 'F285': case 'F286': return client.qualifyingSettlementId ? put(e, { need: 'required', state: 'notSupported', source: 'יישוב מזכה — אחוז הנחה, קוד תקרה וחודשים לשידור — לא מופק', code }) : notRel(e, 'אין יישוב מזכה');
      case 'F287': return notRel(e, 'זיכוי ״חייל״ (תוספת פעילות) — לא חל');
      case 'F288': case 'F289': return notRel(e, 'חלוקה מרווחים (סעיף 77) — לא חל');
      case 'F290': return client.isKibbutzMember ? put(e, { need: 'required', state: 'notSupported', source: 'חבר קיבוץ — לא נתמך', code }) : notRel(e, 'לא חבר קיבוץ');
    }
    office(e, 'לשימוש משרד השומה');
  }

  // ── נקודות זיכוי (חלק יג) — מאותם נתוני כרטיס שהחישוב משתמש בהם ──
  function creditRow(e: Entry) {
    const code = e.codes?.registered ?? e.codes?.spouse ?? undefined;
    const kids = client.children ?? [];
    const childCount = (custodyOk: (k: typeof kids[number]) => boolean, b: number) => kids.filter(k => custodyOk(k) && band(year - Number((k.birthDate || '').slice(0, 4))) === b).length;
    const childBandIdx = (id: string, first: number) => Number(id.slice(1)) - first;
    switch (true) {
      case e.id === 'F193': { const s = screener(c, 'special.nonResident'); put(e, s === 'unknown' ? { need: 'required', state: 'missing', source: 'תושבות לא אושרה לשנה', fix: 'yearFact', code } : s === 'yes' ? { need: 'required', state: 'notSupported', source: 'תושב חוץ', code } : { need: 'required', state: 'filled', value: true, source: 'תושב ישראל', code, produce: true }); return; }
      case e.id === 'F194': case e.id === 'F195': { if (!married) return notRel(e, 'לא נשוי/אה'); const v = decl[e.id]; put(e, v === undefined ? { need: 'required', state: 'missing', source: e.id === 'F194' ? 'נקודות בן/בת זוג בחישוב נפרד — הצהרת משרד' : 'בן/בת הזוג עוזר/ת בעסק — הצהרת משרד', fix: 'declaration', code } : { need: 'required', state: 'filled', value: v as boolean, source: 'הצהרת משרד', code, produce: true }); return; }
      case /^F(19[6-9]|20[0-1])$/.test(e.id): case /^F(20[2-7])$/.test(e.id): {
        const reg = Number(e.id.slice(1)) <= 201, b = childBandIdx(e.id, reg ? 196 : 202);
        if (!reg && !married) return notRel(e, 'לא נשוי/אה');
        const n = childCount(k => !k.custody || k.custody === 'self' || k.custody === 'shared', b);
        if (!kids.length) return notRel(e, 'אין ילדים בכרטיס');
        put(e, { need: 'required', state: 'filled', value: n, source: 'ילדים בחזקה לפי תאריכי הלידה בכרטיס', person: reg ? 'client' : 'spouse', code, produce: n > 0 });
        return;
      }
      case /^F(20[8-9]|21[0-3])$/.test(e.id): case /^F(21[4-9])$/.test(e.id): {
        const reg = Number(e.id.slice(1)) <= 213, b = childBandIdx(e.id, reg ? 208 : 214);
        const n = childCount(k => k.custody === (reg ? 'spouse' : 'self'), b);
        if (!kids.length || (!reg && !married)) return notRel(e, 'לא חל');
        put(e, { need: 'required', state: 'filled', value: n, source: 'ילדים שאינם בחזקת ההורה — כרטיס', person: reg ? 'client' : 'spouse', code, produce: n > 0 });
        return;
      }
      case /^F22[0-5]$/.test(e.id): { if (client.familyStatus !== 'singleParent') return notRel(e, 'לא הורה יחיד'); put(e, { need: 'required', state: 'notSupported', source: '«ילד להורה אחד» — לא נקבע מהכרטיס (אין סימון הורה שני רשום)', code }); return; }
      case /^F22[6-9]$/.test(e.id): { const born = kids.some(k => Number((k.birthDate || '').slice(0, 4)) === year); if (!born) return notRel(e, 'לא נולד ילד בשנה'); put(e, { need: 'required', state: 'notSupported', source: 'דחיית נקודה (116ד) — לא נתמך', code }); return; }
      case e.id === 'F230': put(e, client.familyStatus === 'singleParent' ? { need: 'required', state: 'filled', value: true, source: 'הורה יחיד — כרטיס', code, produce: true } : { need: 'notRelevant', state: 'notRelevant', source: 'לא הורה יחיד' }); return;
      case e.id === 'F231': if (client.familyStatus !== 'singleParent') return notRel(e, 'לא הורה יחיד'); put(e, decl[e.id] === undefined ? { need: 'required', state: 'missing', source: 'משק בית משותף עם יחיד אחר — הצהרה', fix: 'declaration' } : { need: 'required', state: 'filled', value: decl[e.id] as boolean, source: 'הצהרת משרד', produce: true }); return;
      case e.id === 'F232': { const rel = client.familyStatus === 'divorced' && kids.length > 0; put(e, rel ? { need: 'required', state: 'filled', value: true, source: 'גרוש/ה עם ילדים — השתתפות בכלכלה (כרטיס; לאמת)', code, produce: true } : { need: 'notRelevant', state: 'notRelevant', source: 'לא חל' }); return; }
      case e.id === 'F233': { const rel = kids.some(k => (k.monthlyAlimonyPaid ?? 0) > 0) && married; put(e, rel ? { need: 'required', state: 'notSupported', source: 'מזונות לבן זוג לשעבר — לא נתמך', code } : { need: 'notRelevant', state: 'notRelevant', source: 'לא חל' }); return; }
      case e.id === 'F234': { const n = kids.filter(k => k.hasDisability).length; put(e, n ? { need: 'required', state: 'filled', value: n, source: 'ילדים עם מוגבלות — כרטיס', code, produce: true } : { need: 'notRelevant', state: 'notRelevant', source: 'אין' }); return; }
      case e.id === 'F235': case e.id === 'F236': { const p = e.id === 'F235' ? client : sp; if (!p?.isNewImmigrant) return notRel(e, 'לא עולה'); fromCard(e, ident[e.id === 'F235' ? 'aliyahDate' : 'spouseAliyahDate'], 'תאריך העלייה (בכרטיס רק השנה)', { fix: 'identity' }); return; }
      case e.id === 'F237': { if (!client.isReturningResident && !sp?.isReturningResident) return notRel(e, 'לא תושב חוזר'); fromCard(e, ident.returningDate, 'תאריך החזרה', { fix: 'identity', code }); return; }
      case e.id === 'F238': case e.id === 'F239': {
        const rows2: [Person, boolean | undefined, number | undefined, string, string][] = [['client', client.completedIdf || client.completedNationalService, client.idfReleaseYear || client.nationalServiceYear, 'releaseDate', 'serviceMonths'],
          ['spouse', sp?.completedIdf || sp?.completedNationalService, sp?.idfReleaseYear || sp?.nationalServiceYear, 'spouseReleaseDate', 'spouseServiceMonths']];
        let any = false;
        for (const [p, did, yr, dk, mk] of rows2) {
          if (!did || !yr || yr < year - 3 || (p === 'spouse' && !married)) continue;
          any = true;
          const v = e.id === 'F238' ? ident[dk] : ident[mk];
          put(e, { need: 'required', state: v != null && v !== '' ? 'filled' : 'missing', value: v as string | number | undefined, person: p, code: p === 'client' ? e.codes?.registered ?? undefined : e.codes?.spouse ?? undefined,
            source: v != null && v !== '' ? 'פרטי שחרור (filing.identity)' : `חסר: ${e.id === 'F238' ? 'חודש השחרור' : 'חודשי שירות'} — בכרטיס רק שנה (החישוב מניח 24 חודשים)`, fix: v != null && v !== '' ? undefined : 'identity', produce: true });
        }
        if (!any) notRel(e, 'אין שחרור ב-3 השנים שלפני');
        return;
      }
      case e.id === 'F240': case e.id === 'F241': case e.id === 'F242': {
        const rel = (p?: { hasAcademicDegree?: boolean; academicDegreeYear?: number }) => !!p?.hasAcademicDegree && !!p.academicDegreeYear && p.academicDegreeYear >= year - 6 && p.academicDegreeYear < year;
        const ps: [Person, boolean][] = [['client', rel(client)], ['spouse', married && rel(sp ?? undefined)]];
        if (!ps.some(([, r]) => r)) return notRel(e, 'אין תואר שמזכה השנה');
        for (const [p, r] of ps) {
          if (!r) continue;
          const code2 = p === 'client' ? e.codes?.registered ?? undefined : e.codes?.spouse ?? undefined;
          if (e.id === 'F242') { notRel(e, 'התמחות — לא בכרטיס'); continue; }
          const v = e.id === 'F240' ? ident[p === 'client' ? 'degreeCode' : 'spouseDegreeCode'] : (p === 'client' ? client.academicDegreeYear : sp?.academicDegreeYear);
          put(e, { need: 'required', state: v ? 'filled' : 'missing', value: v as string | number | undefined, person: p, code: code2, source: v ? (e.id === 'F240' ? 'קוד לפי טופס 119' : 'שנת הסיום — כרטיס') : 'חסר קוד התואר לפי טופס 119', fix: v ? undefined : 'identity', produce: true });
        }
        return;
      }
    }
    notRel(e, 'לא חל לפי הכרטיס');
  }

  // ── נספחים ──
  const annexes: AnnexCoverage[] = [];
  const title = (id: string) => (ANNEX_CATALOG_2025 as { formId: string; title: string }[]).find(a => a.formId === id)?.title ?? id;
  const bizList = (client.businesses ?? []).filter(b => !(b as { isClosed?: boolean }).isClosed && c.persons.includes((b as { belongsToSpouse?: boolean }).belongsToSpouse ? 'spouse' : 'client'));
  for (const b of bizList) {
    const m = c.draft.micro[b.id];
    if (m?.track === 'micro') { annexes.push({ formId: '1320', title: title('1320'), need: 'notRelevant', reason: `${b.name || 'עסק'} — עסק זעיר (30% מהמחזור)`, produced: 'notNeeded', entityRef: b.id }); continue; }
    const books = c.draft.books?.[b.id];
    const done = c.annex1320?.find(a => a.entityRef === b.id);
    annexes.push({ formId: '1320', title: title('1320'), need: 'required', reason: `${b.name || 'עסק'} — הכנסה מעסק`, entityRef: b.id,
      produced: done?.complete ? 'full' : books ? 'partial' : 'none', note: done?.complete ? 'שורות רווח והפסד, ניהול ספרים ותיאומים — הושלמו' : done?.problems.join(' · ') || 'חסרות שורות רווח והפסד (1320) לפי הספרים' });
    if ((done?.lines['17'] ?? 0) > 0) annexes.push({ formId: '1342', title: title('1342'), need: 'required', reason: `${b.name || 'עסק'} — פחת (שורה 17)`, produced: 'none', note: 'פירוט רכוש קבוע — לא נתמך', entityRef: b.id });
    if ((done?.lines['21'] ?? 0) > 0) annexes.push({ formId: '1343', title: title('1343'), need: 'required', reason: `${b.name || 'עסק'} — ניכוי נוסף בשל פחת (שורה 21)`, produced: 'none', note: 'לא נתמך', entityRef: b.id });
    if (books?.answers['double'] === true) annexes.push({ formId: '6111', title: 'דוח מותאם לרשות המסים (6111)', need: 'required', reason: `${b.name || 'עסק'} — הנהלת חשבונות כפולה`, produced: 'none', note: 'משודר בנפרד, מקוון בלבד — לא מופק במערכת', entityRef: b.id });
  }
  // ‼ 6111 מעל סף המחזור: מבנה הקובץ מבחין «חייב / לא חייב» (שדה 8) — לכן הצהרת משרד, לא הנחה מהמחזור לבד.
  //   הסף המחייב: 300,000 ₪ כולל מע״מ («מחזור» בהוראות ניהול פנקסים כולל מסים עקיפים — research/open-law-questions §1).
  //   256,410 (טופס) ו-254,777 (מבנה הקובץ) — תוויות המרה ישנות (17%, 17.75%). כאן המחזור ללא מע״מ, ולכן הסף 300,000 ÷ 1.18 = 254,237
  //   (מחזור שכולו ב-18%); מחזור פטור / אפס / שנה קודמת — ההצהרה של המשרד מכריעה.
  const turnoverAll = c.fields.filter(f => f.code === '238' || f.code === '239').reduce((a, f) => a + (f.amount ?? 0), 0);
  if (bizList.length && turnoverAll > 254_237 && !annexes.some(a => a.formId === '6111')) {
    const v = decl['X6111'];
    rows.push({ id: 'X6111', part: 'א', label: 'חייב בטופס 6111 (דוח מותאם) — מחזור מעל הסף', kind: 'yesno', need: 'required', state: v === undefined ? 'missing' : 'filled', value: v as boolean | undefined,
      source: v === undefined ? 'הצהרה: האם חייב ב-6111 — מחזור כולל מע״מ מעל 300,000 (בשנת הדוח או בשנה הקודמת)' : 'הצהרת משרד', fix: v === undefined ? 'declaration' : undefined });
    if (v === true) annexes.push({ formId: '6111', title: 'דוח מותאם לרשות המסים (6111)', need: 'required', reason: 'חייב ב-6111 (הצהרת משרד)', produced: 'none', note: 'משודר בנפרד, מקוון בלבד — לא מופק במערכת' });
  }
  const rentTracks = new Set((client.properties ?? []).filter(p => p.isRented).map(p => p.rentalTaxTrack ?? client.rentalTaxTrack ?? 'unknown'));
  if (rentTracks.has('flat10') && !rentTracks.has('regular') && !rentTracks.has('unknown')) annexes.push({ formId: '1321', title: title('1321'), need: 'required', reason: 'שכר דירה למגורים במסלול 10% (סעיף 3)',
    produced: c.annex1321?.complete ? 'full' : c.annex1321 ? 'partial' : 'none', note: c.annex1321?.complete ? 'הכנסה, ניכוי שכר דירה למגורים ופרטי הדירות — הושלמו' : c.annex1321?.problems.join(' · ') || 'אין עדיין הכנסה לשנה' });
  else if (rentTracks.has('regular') || rentTracks.has('unknown')) annexes.push({ formId: '1321', title: title('1321'), need: rentTracks.has('unknown') ? 'unknown' : 'required',
    reason: 'שכר דירה במסלול הרגיל', produced: 'none', note: 'הוצאות ופחת (1342) — לא נתמך' });
  const s = (k: string) => screener(c, k);
  if (c.gaps.some(g => g.code === 'capital_gains')) annexes.push({ formId: '1322', title: title('1322'), need: 'required', reason: 'רווח הון מניירות ערך', produced: 'none', note: 'לא נתמך' });
  if (s('foreign.income') !== 'no') annexes.push({ formId: '1324', title: title('1324'), need: s('foreign.income') === 'yes' ? 'required' : 'unknown', reason: 'הכנסות מחו״ל', produced: 'none', note: s('foreign.income') === 'yes' ? 'לא נתמך' : 'שאלת פתיחה לא נענתה' });
  if (s('sales.sold') !== 'no') annexes.push({ formId: '1399י', title: title('1399י'), need: s('sales.sold') === 'yes' ? 'required' : 'unknown', reason: 'מכירת נכס', produced: 'none', note: s('sales.sold') === 'yes' ? 'לא נתמך' : 'שאלת פתיחה לא נענתה' });
  if (c.gaps.some(g => g.code === 'carryForward')) annexes.push({ formId: '1344', title: title('1344'), need: 'required', reason: 'הפסדים מועברים', produced: 'none', note: 'לא נתמך' });
  const degreeRows = rows.filter(r => r.id === 'F240' && r.need === 'required');
  if (degreeRows.length) annexes.push({ formId: '119', title: title('119'), need: 'required', reason: 'נקודות זיכוי לתואר', produced: 'none', note: 'טופס 119 (מוסד, תחום, תאריך, שנות לימוד) — לא מופק; מצרפים במערכת המקוונת' });

  const rel = rows.filter(r => r.need === 'required' || r.need === 'applies');
  return {
    rows, annexes, produced,
    counts: { relevant: rel.length, filled: rel.filter(r => r.state === 'filled').length, missing: rel.filter(r => r.state === 'missing').length,
      notSupported: rel.filter(r => r.state === 'notSupported').length + annexes.filter(a => a.need !== 'notRelevant' && a.produced !== 'full' && a.produced !== 'notNeeded').length,
      office: rows.filter(r => r.need === 'office').length },
  };
}

/** חלקים שהלקוח צריך ואין להם מימוש — לפי הפערים שהמנוע זיהה. */
const UNSUPPORTED_BY_PART: Record<string, (c: Ctx) => string | undefined> = {
  ח: c => (c.gaps.some(g => g.code === 'capital_gains' || g.code === 'sales') ? 'רווח הון / מכירת נכס — לא נתמך (נספחים 1322 / 1399י)' : undefined),
  ט: c => (c.gaps.some(g => g.code === 'foreign') ? 'הכנסות מחו״ל — לא נתמך (נספח 1324)' : undefined),
  יא: c => (c.gaps.some(g => g.code === 'carryForward') ? 'הפסדים ויתרות להעברה — לא נתמך (1344)' : undefined),
  ו: c => (c.gaps.some(g => g.code === 'financialInstitution') ? 'מוסד כספי — לא נתמך' : undefined),
};

export type CoverageCtx = Ctx;

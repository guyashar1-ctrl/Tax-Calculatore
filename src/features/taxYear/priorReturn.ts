// ─── 19.10.2026 · הדוח של שנה שעברה כנקודת פתיחה לשאלון הדוח השנתי ────────────────────────────────────────────
// ‼ ההמחשה המאושרת: docs/proposals/2026-10-19-simple-annual-questionnaire.html, לשונית «לפני השליחה».
// ‼ הקריאה (ocr-document, docType prior_return) היא הצעה, לא נתון: המשרד מסמן, מתקן שם ובוחר «של מי» — ורק אז
//   (1) מה שיש לו מקום בכרטיס (מעסיק, חשבון, קופה, ביטוח חיים) נכנס דרך apply_tax_facts, עם הערך הקודם בהיסטוריה;
//   (2) מה שאין לו מקום בכרטיס (קצבה, פטור נכות של בן/בת הזוג, תרומות…) מוצג ללקוח כאריח מסומן «ב-{שנה}: …».
// ‼ נבדק על שני סטים אמיתיים (19.10): הישויות נמצאו, אבל «של מי» התהפך בסט אחד, שמות שובשו, וילדים «הומצאו».
//   לכן: ילדים והערות חופשיות לא נקראים; «של מי» ושם — ניתנים לתיקון בכל שורה; התאמה לכרטיס סובלת שיבוש.
// ‼ הכרטיס חדש מהדוח: מה שכבר בכרטיס לא נדרס (מצב משפחתי, נכות שכבר נרשמה) — רק מה שחסר מתווסף.

import type { Client, EmployerInfo, InvestmentAccount, PensionFundInfo } from '../../types';
import type { ProposedFact } from '../../types/taxFacts';

type Side = 'registered' | 'spouse' | 'joint';
export interface PriorReading {
  taxYear?: number;
  registered?: { firstName?: string; lastName?: string } | null;
  spouse?: { firstName?: string; lastName?: string } | null;
  familyStatus?: string;
  employers?: { name?: string; side?: Side; evidence?: string }[];
  businesses?: { name?: string; side?: Side; evidence?: string }[];
  pensions?: { payer?: string; side?: Side; survivors?: boolean; evidence?: string }[];
  disability?: { side?: Side; percent?: number; evidence?: string }[];
  accounts?: { institution?: string; side?: Side; evidence?: string }[];
  lifeInsurance?: { insurer?: string; side?: Side; evidence?: string }[];
  pensionDeposits?: { institution?: string; side?: Side; evidence?: string }[];
  rental?: boolean; foreign?: boolean; capitalGains?: boolean; donations?: boolean;
  niBenefits?: { kind?: string; side?: Side }[];
}

export type PrepPerson = 'client' | 'spouse' | 'joint';
/** card = נכנס לכרטיס באישור · tile = אריח מסומן מראש בשאלון · note = לידיעה בלבד (אין לאן להכניס אוטומטית). */
export type PrepKind = 'employer' | 'account' | 'pensionDeposit' | 'lifeInsurance' | 'disability' | 'pension' | 'niBenefit' | 'business' | 'rental' | 'foreign' | 'donations';
export interface PrepRow {
  id: string;
  kind: PrepKind;
  /** מה זה, במילים של המשרד. */
  title: string;
  name: string;
  person: PrepPerson;
  evidence?: string;
  /** כבר בכרטיס (התאמה סובלנית) — מוצג, לא מוצע שוב. */
  inCard?: string;
  percent?: number;
  on: boolean;
}

export const PREP_TITLE: Record<PrepKind, string> = {
  employer: 'משכורת', account: 'חשבון בנק או השקעות', pensionDeposit: 'הפקדה פרטית לקופה', lifeInsurance: 'ביטוח חיים',
  disability: 'פטור נכות', pension: 'קצבה או פנסיה', niBenefit: 'תשלום מביטוח לאומי', business: 'עסק', rental: 'השכרת נכס',
  foreign: 'הכנסה מחו״ל', donations: 'תרומות',
};

/** לאיזה אריח בשאלון שייכת שורה שאין לה מקום בכרטיס. */
const TILE_OF: Partial<Record<PrepKind, string>> = {
  pension: 'pension.received', disability: 'special.disability', niBenefit: 'niBenefits.received', rental: 'rent.newRental',
  foreign: 'foreign.income', donations: 'donations.given', lifeInsurance: 'savings.insurance', pensionDeposit: 'savings.selfDeposits',
};

// ── התאמה סובלנית לשמות: «היפגר פד רובוטיקס בע״מ» = «הייפר פוד רובוטיקס» ─────────────────────────────────────
const STOP = new Set(['בעמ', 'בע', 'מ', 'חברה', 'לביטוח', 'ביטוח', 'בנק', 'בית', 'השקעות', 'ושות', 'לעובדי', 'המדינה', 'ltd', 'בעמ.']);
const norm = (s: string) => s.replace(/["'״׳.,()\-–—]/g, ' ').replace(/\s+/g, ' ').trim().toLowerCase();
const tokens = (s: string) => norm(s).split(' ').filter(t => t.length >= 3 && !STOP.has(t));
function lev(a: string, b: string): number {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++)
    d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return d[a.length][b.length];
}
/** אותו גוף? מילה משמעותית משותפת (גם עם שגיאת כתיב אחת לכל 4 אותיות), או מחרוזת כמעט זהה. */
export function sameBody(a: string, b: string): boolean {
  const na = norm(a), nb = norm(b);
  if (!na || !nb) return false;
  if (na === nb || na.includes(nb) || nb.includes(na)) return true;
  const ta = tokens(a), tb = tokens(b);
  if (ta.some(x => tb.some(y => x === y || (Math.min(x.length, y.length) >= 4 && lev(x, y) <= Math.floor(Math.max(x.length, y.length) / 4))))) return true;
  return lev(na, nb) <= Math.floor(Math.max(na.length, nb.length) * 0.25);
}

const firstOf = (s?: string) => (s ?? '').trim().split(/\s+/)[0] ?? '';

/**
 * «רשום» בדוח הוא לא בהכרח בעל הכרטיס: כשהשם של «בן/בת הזוג» בדוח הוא בעל הכרטיס — מתהפך.
 * ‼ שם פרטי בדוח יכול להיות שם רשמי (צבי) מול כינוי בכרטיס (יריב) — לכן ההכרעה רק כשיש התאמה חיובית להיפוך.
 */
export function sideMapper(client: Client, r: PriorReading): (s?: Side) => PrepPerson {
  const cf = firstOf(client.firstName), sf = firstOf(r.spouse?.firstName), rf = firstOf(r.registered?.firstName);
  const swapped = !!cf && !!sf && sf === cf && rf !== cf;
  return s => s === 'joint' ? 'joint' : s === 'spouse' ? (swapped ? 'client' : 'spouse') : (swapped ? 'spouse' : 'client');
}

/** השורות למסך «לפני השליחה». מה שכבר בכרטיס — מסומן «כבר בתיק», בלי תיבה. */
export function priorReturnRows(client: Client, r: PriorReading): PrepRow[] {
  const side = sideMapper(client, r);
  const rows: PrepRow[] = [];
  let n = 0;
  const push = (kind: PrepKind, name: string, s: Side | undefined, extra: Partial<PrepRow> = {}) => {
    const clean = (name ?? '').trim();
    if (!clean && !['disability', 'rental', 'foreign', 'donations'].includes(kind)) return;
    const person = extra.person ?? side(s);
    // אותו גוף פעמיים בקריאה (106 משני עמודים) — שורה אחת
    if (clean && rows.some(x => x.kind === kind && x.person === person && sameBody(x.name, clean))) return;
    rows.push({ id: `pr${++n}`, kind, title: PREP_TITLE[kind], name: clean, person, on: !extra.inCard, ...extra });
  };
  const inCard = <T,>(list: T[] | undefined, label: (e: T) => string, name: string) => (list ?? []).map(label).find(l => sameBody(l, name));

  for (const e of r.employers ?? []) {
    const person = side(e.side);
    const match = (client.employers ?? []).filter(x => !!x.belongsToSpouse === (person === 'spouse')).map(x => x.name).find(l => sameBody(l, e.name ?? ''));
    push('employer', e.name ?? '', e.side, { evidence: e.evidence, inCard: match });
  }
  for (const a of r.accounts ?? []) push('account', a.institution ?? '', a.side, { evidence: a.evidence, inCard: inCard(client.investmentAccounts, x => x.institutionName, a.institution ?? '') });
  for (const f of r.pensionDeposits ?? []) push('pensionDeposit', f.institution ?? '', f.side, { evidence: f.evidence, inCard: inCard(client.pensionFunds, x => x.institutionName, f.institution ?? '') });
  for (const l of r.lifeInsurance ?? []) {
    const person = side(l.side);
    push('lifeInsurance', l.insurer ?? '', l.side, { evidence: l.evidence, inCard: person === 'client' && client.hasLifeInsurance ? 'מסומן בכרטיס' : undefined });
  }
  for (const d of r.disability ?? []) {
    const person = side(d.side);
    push('disability', d.percent ? `${d.percent}%` : '', d.side, { evidence: d.evidence, percent: d.percent,
      inCard: person === 'client' && (client.disabilityPercentage ?? 0) > 0 ? `${client.disabilityPercentage}% בכרטיס` : undefined });
  }
  for (const p of r.pensions ?? []) push('pension', `${p.payer ?? ''}${p.survivors ? ' (שאירים)' : ''}`, p.side, { evidence: p.evidence });
  for (const b of r.niBenefits ?? []) push('niBenefit', b.kind ?? '', b.side);
  for (const b of r.businesses ?? []) {
    const person = side(b.side);
    const match = (client.businesses ?? []).filter(x => !!x.belongsToSpouse === (person === 'spouse')).map(x => x.name ?? '').find(l => sameBody(l, b.name ?? ''));
    push('business', b.name ?? '', b.side, { evidence: b.evidence, inCard: match });
  }
  if (r.rental) push('rental', '', 'registered', { person: 'joint' });
  if (r.foreign) push('foreign', '', 'registered', { person: 'joint' });
  if (r.donations) push('donations', '', 'registered', { person: 'joint' });
  return rows;
}

/** מה השורה עושה כשהיא מסומנת — הטקסט שליד התיבה. */
export function rowEffect(row: PrepRow, client: Client, prevYear: number): string {
  const who = personLabel(row.person, client);
  if (row.inCard) return `כבר בתיק (${row.inCard})`;
  if (row.kind === 'business') return 'לא בתיק — עסקים מוסיפים בכרטיס; השאלון ישאל עליו רק אם הוא בכרטיס';
  if (cardTarget(row)) return `ייכנס לכרטיס (${who}), והשאלון ישאל «עדיין?» ויבקש את האישור השנתי`;
  // ‼ מי שרואה את השאלון הוא בעל/ת הכרטיס — גם כשהשורה של בן/בת הזוג
  return `${client.firstName || 'הלקוח'} יראה בשאלון את «${PREP_TITLE[row.kind]}» מסומן מראש, עם «ב-${prevYear}: …»`;
}

export const personLabel = (p: PrepPerson, c: Client, spouseName?: string) =>
  p === 'joint' ? 'משותף' : p === 'spouse' ? (c.spouseFirstName || c.spouse?.firstName || spouseName || 'בן/בת הזוג') : (c.firstName || 'הלקוח');

/** לאיזה שדה בכרטיס השורה נכנסת — או undefined כשאין לה מקום שם (ואז היא אריח). */
function cardTarget(row: PrepRow): 'employers' | 'investmentAccounts' | 'pensionFunds' | 'hasLifeInsurance' | 'disabilityPercentage' | undefined {
  if (row.kind === 'employer') return row.person === 'joint' ? undefined : 'employers';
  if (row.kind === 'account') return 'investmentAccounts';
  if (row.kind === 'pensionDeposit') return 'pensionFunds';
  if (row.kind === 'lifeInsurance') return row.person === 'client' ? 'hasLifeInsurance' : undefined;
  if (row.kind === 'disability') return row.person === 'client' && (row.percent ?? 0) > 0 ? 'disabilityPercentage' : undefined;
  return undefined;
}

/** מה המשרד אישר — כמה שהוא ייכנס לשאלון: אריחים מסומנים מראש עם «ב-{שנה}: …», ושם בן/בת הזוג לנוסח. */
export interface LastYearHints {
  year: number; tiles: Record<string, string>; spouseName?: string;
  /** 20.10.2026 · של מי כל אריח בדוח הקודם — כדי שמה שהיה של בן/בת זוג שנפטר/ה ייכנס לענף שלו/ה, לא לאריח של הלקוח. */
  tilePeople?: Record<string, PrepPerson[]>;
}

const newId = (p: string) => `${p}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

/**
 * השורות המסומנות ⇒ הצעות לכרטיס (אחת לכל שדה — כל הישויות החדשות יחד, כדי שהשנייה לא תיפול כ-stale על הראשונה)
 * + רמזים לשאלון. ‼ שורה «כבר בתיק» או שלא סומנה — לא נוגעים בה.
 */
export function priorReturnApply(client: Client, rows: PrepRow[], r: PriorReading, source: { year: number; fileName: string }): { proposals: ProposedFact[]; hints: LastYearHints } {
  const on = rows.filter(x => x.on && !x.inCard);
  const note = `מהדוח שהוגש ל-${source.year} («${source.fileName}»), אושר במשרד לפני שאלון הדוח השנתי`;
  const proposals: ProposedFact[] = [];
  const addList = <T extends { id: string }>(field: 'employers' | 'investmentAccounts' | 'pensionFunds', kindHe: string, added: T[], label: (e: T) => string) => {
    if (!added.length) return;
    const current = ((client as unknown as Record<string, unknown>)[field] as T[] | undefined) ?? [];
    proposals.push({
      fieldKey: field, label: `${kindHe} מהדוח שהוגש ל-${source.year}: ${added.map(label).join(', ')}`,
      oldValue: { display: `${current.length} ברשימה`, patch: { [field]: current } },
      newValue: { display: `נוספו: ${added.map(label).join(', ')}`, patch: { [field]: [...current, ...added] } },
      note,
    });
  };
  addList<EmployerInfo>('employers', 'מעסיקים',
    on.filter(x => cardTarget(x) === 'employers').map(x => ({ id: newId('emp'), name: x.name, ...(x.person === 'spouse' ? { belongsToSpouse: true } : {}) }) as EmployerInfo), e => e.name);
  addList<InvestmentAccount>('investmentAccounts', 'חשבונות',
    on.filter(x => cardTarget(x) === 'investmentAccounts').map(x => ({ id: newId('inv'), institutionName: x.name, kind: 'other' }) as InvestmentAccount), e => e.institutionName);
  addList<PensionFundInfo>('pensionFunds', 'קופות',
    on.filter(x => cardTarget(x) === 'pensionFunds').map(x => ({ id: newId('fund'), institutionName: x.name, kind: 'other', hasSelfDeposits: true }) as PensionFundInfo), e => e.institutionName);
  if (on.some(x => cardTarget(x) === 'hasLifeInsurance') && !client.hasLifeInsurance)
    proposals.push({ fieldKey: 'hasLifeInsurance', label: `ביטוח חיים — מהדוח שהוגש ל-${source.year}`,
      oldValue: { display: 'לא', patch: { hasLifeInsurance: client.hasLifeInsurance ?? null } }, newValue: { display: 'כן', patch: { hasLifeInsurance: true } }, note });
  const dis = on.find(x => cardTarget(x) === 'disabilityPercentage');
  if (dis && !((client.disabilityPercentage ?? 0) > 0))
    proposals.push({ fieldKey: 'disabilityPercentage', label: `אחוזי נכות — מהדוח שהוגש ל-${source.year}`,
      oldValue: { display: '—', patch: { disabilityPercentage: client.disabilityPercentage ?? null } }, newValue: { display: `${dis.percent}%`, patch: { disabilityPercentage: dis.percent } }, note });

  const spouseName = client.spouseFirstName || client.spouse?.firstName ? undefined : firstOf(r.spouse?.firstName) || undefined;
  const tiles: Record<string, string> = {};
  const tilePeople: Record<string, PrepPerson[]> = {};
  for (const x of on) {
    if (cardTarget(x)) continue;
    const tile = TILE_OF[x.kind];
    if (!tile) continue;
    const who = personLabel(x.person, client, spouseName);
    const text = [x.name, x.person === 'joint' ? '' : who].filter(Boolean).join(' · ');
    tiles[tile] = tiles[tile] ? `${tiles[tile]}; ${text}` : text;
    tilePeople[tile] = [...(tilePeople[tile] ?? []), x.person];
  }
  return { proposals, hints: { year: source.year, tiles, tilePeople, ...(spouseName ? { spouseName } : {}) } };
}

/** הסט שהוגש לשנה הקודמת בין מסמכי הלקוח: תווית «סט שהוגש…», קטגוריה 1301, או שם קובץ שאומר את זה. */
export function isPriorReturnDoc(d: { fileName: string; category?: string; year?: number | string; label?: string | null }, year: number): boolean {
  if (String(d.year) !== String(year - 1)) return false;
  if (d.category === 'form_1301') return true;
  if (d.label && /סט שהוגש|דוח שנתי|1301/.test(d.label)) return true;
  return /1301|סט שהוגש|דוח מס|דוח שנתי/.test(d.fileName) && /\.pdf$/i.test(d.fileName);
}

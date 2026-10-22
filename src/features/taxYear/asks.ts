// ─── שאלות ללקוח ותשובות → עובדות ─────────────────────────────────────────────
// ‼ הטקסט ללקוח נשמר כצילום ברגע היצירה (InfoAsk.prompt) — הדף האישי והשרת לא
// גוזרים אותו מחדש מהקטלוג. כך שינוי ניסוח לא משנה שאלה שכבר נשלחה.
// ‼ תשובה היא עובדה ממתינה. «הלקוח אישר שאין שינוי» ≠ אישור מקצועי: גם היא
// ממתינה, והמשרד מאשר אותה במרוכז.
// ‼ תשובה להערכה נשמרת עם התקופה שלה (ינואר עד החתך), ולכן בדוח השנתי היא חלקית.

import type { Client } from '../../types';
import { AREA_BY_ID, ITEMS, ITEM_BY_KEY, type InfoItem, CATALOG_VERSION, ANNUAL_TILE_EXAMPLE, ANNUAL_TILE_LESS } from './catalog';
import { genderize, genderOf, addresseeOf } from './gender';
import { DOCS, followUpFor } from './documents';
import { PROVISIONAL, provisionalRef, type ItemStatus } from './picture';
import type { AskPrompt, EntityKind, FactAnswer, FactBasis, InfoAsk, MultiFollowUp, MultiOption, PeriodKind, Purpose, SubjectRole, UnavailableCode, YearFact } from './types';
import type { LastYearHints } from './priorReturn';
import { cleanEntity, entityValid, visibleFields, type EntityItem } from './entities';
import { hintFor } from './hints';
import { RECORD_OF, isPeriodItem, dealerOf } from './structured';
import { initialFromCard } from './records';
import { periodOfRequest, periodWords, propertySpan, accountSpan, spanText } from './temporal';
import { DEALER_KIND_LABELS } from '../taxFile/editModel';
import { familyStatusEventYear } from '../../utils/familyStatusYear';

const FAMILY: Record<string, [string, string, string]> = {
  single: ['רווק', 'רווקה', 'רווק/ה'], married: ['נשוי', 'נשואה', 'נשוי/אה'], divorced: ['גרוש', 'גרושה', 'גרוש/ה'],
  widowed: ['אלמן', 'אלמנה', 'אלמן/ה'], singleParent: ['הורה יחיד', 'הורה יחידה', 'הורה יחיד/ה'],
};
const familyWord = (c: Client) => { const w = FAMILY[c.familyStatus]; return w ? w[c.gender === 'male' ? 0 : c.gender === 'female' ? 1 : 2] : c.familyStatus; };
const MONTHS = ['', 'ינואר', 'פברואר', 'מרץ', 'אפריל', 'מאי', 'יוני', 'יולי', 'אוגוסט', 'ספטמבר', 'אוקטובר', 'נובמבר', 'דצמבר'];

/** מה ידוע מהכרטיס — שורות קצרות לרשימת «זה מה שידוע לנו». */
export function cardLines(item: InfoItem, c: Client, s: Pick<ItemStatus, 'subjectRole'> & { lineRefs?: string[] }): string[] {
  const spouse = s.subjectRole === 'spouse';
  // ‼ 13.10.2026 · רשימה לתקופה: רק הישויות שבוודאות בתקופה (picture.ts › lineRefs), עם התאריכים הידועים
  const only = <T extends { id: string }>(list: T[]) => (s.lineRefs ? list.filter(x => s.lineRefs!.includes(x.id)) : list);
  const propDates = (p: Parameters<typeof propertySpan>[0]) => { const t = spanText(propertySpan(p), { from: 'נרכש', to: 'נמכר' }); return t ? ` · ${t}` : ''; };
  switch (item.key) {
    case 'household.maritalAtYearEnd':
      return [`${familyWord(c)}${familyStatusEventYear(c) ? ` מ-${familyStatusEventYear(c)}` : ''}${c.familyStatus === 'married' && (c.spouseFirstName || c.spouse?.firstName) ? ` · ${c.spouseFirstName || c.spouse?.firstName}` : ''}`];
    case 'household.children':
      return (c.children ?? []).map(ch => `${ch.firstName || 'ילד'} — שנת לידה ${ch.birthYear}`);
    case 'household.settlement':
      // ‼ בדוח לשנה — «כל השנה» היא השאלה: מי שעבר באמצע השנה לא מקבל זיכוי מלא
      return [c.city ? `גר/ה ב${c.city} כל השנה` : 'יישוב המגורים'];
    case 'household.degree': {
      const d = spouse ? c.spouse : c;
      return d?.hasAcademicDegree ? [`תואר${d.academicDegreeYear ? ` שהסתיים ב-${d.academicDegreeYear}` : ''}`] : [];
    }
    case 'household.release': {
      const d = spouse ? c.spouse : c;
      const y = d?.completedIdf ? d.idfReleaseYear : d?.completedNationalService ? d.nationalServiceYear : undefined;
      return y ? [`שוחרר/ה משירות ב-${y}`] : [];
    }
    case 'salary.worked':
    case 'salary.employers':
      return (c.employers ?? []).filter(e => !!e.belongsToSpouse === spouse).map(e => `עובד/ת ב${e.name}`);
    case 'business.active':
      return (c.businesses ?? []).filter(b => !!b.belongsToSpouse === spouse && !b.isClosed).map(b => `עסק: ${b.name}`);
    case 'rent.properties':
      return only((c.properties ?? []).filter(p => p.isRented)).map(p => `מושכר: ${[p.address, p.city].filter(Boolean).join(', ')}${propDates(p as never)}`);
    case 'capital.accounts':
      return only((c.investmentAccounts ?? []).filter(a => s.lineRefs || !a.isClosed)).map(a => {
        const t = spanText(accountSpan(a as never), { from: 'נפתח', to: 'נסגר' });
        return `חשבון ב${a.institutionName}${a.accountNumber ? ` (מסתיים ב-${String(a.accountNumber).slice(-4)})` : ''}${t ? ` · ${t}` : ''}`;
      });
    case 'foreign.income':
      return (c.foreignAccounts ?? []).map(a => `${a.institutionName || 'חשבון'}${a.country ? ` · ${a.country}` : ''}`);
    case 'savings.selfDeposits':
      return (c.pensionFunds ?? []).filter(f => f.hasSelfDeposits).map(f => `מפקיד/ה ל${f.institutionName}`);
    case 'savings.insurance':
      return [c.hasLifeInsurance ? 'ביטוח חיים פרטי' : '', c.hasDisabilityInsurance ? 'ביטוח אובדן כושר עבודה' : ''].filter(Boolean);
    case 'donations.given':
      return c.donationsAnnual ? ['תרם/ה בשנים קודמות'] : [];
    // ── 230 · הצהרת הון: כל מה שבכרטיס, לא רק מה שמניב הכנסה ──
    case 'wealth.household':
      return [
        `${[c.firstName, c.lastName].filter(Boolean).join(' ')}`,
        ...(c.familyStatus === 'married' ? [`${c.spouseFirstName || c.spouse?.firstName || 'בן/בת הזוג'} (בן/בת זוג)`] : []),
        ...(c.children ?? []).map(ch => `${ch.firstName || 'ילד'} — שנת לידה ${ch.birthYear}`),
      ].filter(Boolean);
    case 'wealth.realEstate.list':
      return only(c.properties ?? []).map(p => `${[p.address, p.city].filter(Boolean).join(', ')}${propDates(p as never)}${p.isRented ? ' · מושכר' : ''}`);
    case 'wealth.bank.foreign':
      return (c.foreignAccounts ?? []).map(a => `${a.institutionName || 'חשבון'}${a.country ? ` · ${a.country}` : ''}`);
    case 'wealth.funds.list':
      return (c.pensionFunds ?? []).map(f => `${f.institutionName}${f.productName ? ` · ${f.productName}` : ''}`);
    case 'wealth.securities.list':
      return only((c.investmentAccounts ?? []).filter(a => s.lineRefs || !a.isClosed)).map(a => `תיק ב${a.institutionName}${a.accountNumber ? ` (מסתיים ב-${String(a.accountNumber).slice(-4)})` : ''}`);
    // ── 236 · קליטה והשלמת תיק המס: מה שבכרטיס, לאישור ──
    case 'intake.family':
      return [`${familyWord(c)}${familyStatusEventYear(c) ? ` מ-${familyStatusEventYear(c)}` : ''}${c.familyStatus === 'married' && (c.spouseFirstName || c.spouse?.firstName) ? ` · ${c.spouseFirstName || c.spouse?.firstName}` : ''}`];
    case 'intake.children':
      return (c.children ?? []).map(ch => `${ch.firstName || 'ילד'} — שנת לידה ${ch.birthYear}`);
    case 'household.address':
    case 'intake.address':
      return c.city || c.address ? [[c.address, c.city].filter(Boolean).join(', ') + (c.zipCode ? ` · מיקוד ${c.zipCode}` : '')] : [];
    case 'intake.settlement':
      return [c.city ? `גר/ה ב${c.city}` : 'יישוב המגורים'];
    case 'intake.employers':
      return (c.employers ?? []).filter(e => !!e.belongsToSpouse === spouse && !e.endDate).map(e => `עובד/ת ב${e.name}${e.startDate ? ` מ-${e.startDate.slice(0, 4)}` : ''}`);
    case 'intake.business':
      return (c.businesses ?? []).filter(b => !!b.belongsToSpouse === spouse && !b.isClosed).map(b => `עסק: ${b.name}${b.description ? ` · ${b.description}` : ''}${b.startYear ? ` · מ-${b.startYear}` : ''}`);
    case 'intake.rentals':
      return (c.properties ?? []).filter(p => p.isRented).map(p => `מושכר: ${[p.address, p.city].filter(Boolean).join(', ')}`);
    case 'intake.investments':
      return (c.investmentAccounts ?? []).filter(a => !a.isClosed).map(a => `חשבון ב${a.institutionName}`);
    case 'intake.funds':
      return (c.pensionFunds ?? []).map(f => `${f.institutionName}${f.productName ? ` · ${f.productName}` : ''}`);
    case 'intake.bankAccount':
      return (c.bankAccounts ?? []).map(b => `${b.bankName}${b.branchNumber ? ` · סניף ${b.branchNumber}` : ''}${b.accountNumber ? ` · חשבון שמסתיים ב-${String(b.accountNumber).slice(-4)}` : ''}`);
    default: return [];
  }
}

export interface AskCtx {
  client: Client; taxYear: number; purpose: Purpose; cutoffMonth?: number;
  /** הצהרת הון: יום ההצהרה, ראשונה/המשך, ומה ידוע מההצהרה הקודמת לכל תחום (להצגה ללקוח). */
  asOfDate?: string; declKind?: 'first' | 'followup'; previousByArea?: Record<string, string>;
  /** 19.10.2026 · דוח שנתי: מה המשרד אישר מהדוח של שנה שעברה (priorReturn.ts) — אריחים מסומנים מראש ושם בן/בת הזוג. */
  lastYear?: LastYearHints;
}
const heDate = (iso?: string) => (iso ? `${iso.slice(8, 10)}.${iso.slice(5, 7)}.${iso.slice(0, 4)}` : '');

const personName = (c: Client, role: string) =>
  role === 'spouse' ? (c.spouseFirstName || c.spouse?.firstName || 'בן/בת הזוג') : role === 'couple' ? 'אתם' : 'את/ה';

/**
 * ‼ 12.10.2026: «ל{name}» ו«של {name}» יצאו ללקוח «לאת/ה» ו«של את/ה». לפנייה ישירה — «לך» / «שלך» (ולזוג — «לכם»
 *   / «שלכם»); לבן/בת הזוג — «לרחל» / «של רחל». וכל המופעים מוחלפים, לא רק הראשון.
 */
export function fillTemplate(t: string, c: Client, role: string): string {
  const nm = personName(c, role);
  const direct = role !== 'spouse';
  return t
    .split('של {name}').join(direct ? (role === 'couple' ? 'שלכם' : 'שלך') : `של ${nm}`)
    .split('ל{name}').join(direct ? (role === 'couple' ? 'לכם' : 'לך') : `ל${nm}`)
    .split('{name}').join(nm);
}

/** הטקסט ללקוח לפריט — כולל הנושא בכותרת כשהשאלה על בן/בת הזוג. */
/**
 * ‼ 20.10.2026 · בלי לוכסנים (gender.ts): הכותרת, ההסבר וה«למה» — לפי המין של מי שעליו השאלה; בשאלה לזוג שמזכירה את
 *   בן/בת הזוג («מתי רחל נפטרה?») — לפי בן/בת הזוג. addressee — איך פונים ללקוח בכפתורים («לא בטוח» / «לא בטוחה» / «לא בטוחים»).
 */
export function voice(p: AskPrompt, c: Client, role: string): AskPrompt {
  const sp = c.spouseFirstName || c.spouse?.firstName;
  const g = (t: string) => genderOf(c, role === 'spouse' || (role === 'couple' && !!sp && t.includes(sp)) ? 'spouse' : 'client');
  const v = (t?: string) => (t ? genderize(t, g(t)) : t);
  const addressee = addresseeOf(c);
  const unsure = addressee === 'm' ? 'לא בטוח' : addressee === 'f' ? 'לא בטוחה' : 'לא בטוחים';
  const input = p.input.kind === 'choice' ? { ...p.input, options: p.input.options.map(o => ({ ...o, label: o.label === 'לא בטוח/ה' ? unsure : v(o.label)! })) } : p.input;
  return { ...p, title: v(p.title)!, why: v(p.why) ?? '', ...(p.hint ? { hint: v(p.hint) } : {}), input, addressee };
}

export function promptFor(s: ItemStatus, ctx: AskCtx): AskPrompt {
  return voice(promptForRaw(s, ctx), ctx.client, s.subjectRole);
}

function promptForRaw(s: ItemStatus, ctx: AskCtx): AskPrompt {
  const it = s.item;
  const c = ctx.client;
  const subjName = s.subjectRole === 'spouse' ? (c.spouseFirstName || c.spouse?.firstName || 'בן/בת הזוג') : undefined;
  const fill = (t: string) => fillTemplate(t, c, s.subjectRole)
    .split('{year}').join(String(ctx.taxYear)).split('{spouse}').join(c.spouseFirstName || c.spouse?.firstName || 'בן/בת הזוג')
    .split('{entity}').join(s.entityLabel ?? '')
    .split('{since}').join(s.entityLabel ? `סוף ${s.entityLabel}` : 'ההערכה');
  // ‼ הצהרת המשך: «מה השתנה מאז» במקום השאלה המלאה, ומה שידוע מההצהרה הקודמת בתחום
  const followup = ctx.purpose === 'wealth' && ctx.declKind === 'followup';
  const qText = (followup && it.followupQuestion) || it.question;
  const title = fill(qText ?? it.label);
  const prev = followup ? ctx.previousByArea?.[it.area] : undefined;
  const why = [it.why ?? '', prev ? `בהצהרה הקודמת: ${prev}` : '', ctx.purpose === 'wealth' && ctx.asOfDate ? `נכון ל-${heDate(ctx.asOfDate)}` : ''].filter(Boolean).join(' · ');
  // ‼ 13.10.2026 · על איזו תקופה שואלים — גלוי ליד השאלה (לא רק בכותרת התהליך). קליטה מתארת את היום — בלי.
  const period = ctx.purpose === 'intake' ? undefined : periodOfRequest(ctx.purpose, ctx.taxYear, { cutoffMonth: ctx.cutoffMonth, asOfDate: ctx.asOfDate });
  const periodText = period ? periodWords(period) : undefined;
  const fillP = (t: string) => fill(t).split('{period}').join(periodText ?? 'היום');
  const hintRaw = hintFor(it.key, periodText);
  const hint = hintRaw ? fillTemplate(hintRaw, c, s.subjectRole).split('{entity}').join(s.entityLabel ?? '') : undefined;
  const base = { why, hint, periodText, subjectName: subjName };
  const schema = RECORD_OF[it.key];
  const role = s.subjectRole;
  // ‼ בדף האישי אין כרטיס — שמות בני הזוג (לבחירת «על שם מי») נשמרים בשאלה עצמה
  const people: Record<string, string> = { clientName: c.firstName || 'אני', ...(c.familyStatus === 'married' ? { spouseName: c.spouseFirstName || c.spouse?.firstName || 'בן/בת הזוג', married: '1' } : {}),
    // ‼ 20.10.2026 · מעסיק בדוח השנתי: חודשים בתוך השנה בלבד (records.ts › 'monthIn')
    ...(ctx.purpose === 'annual' && schema === 'employer' ? { taxYear: String(ctx.taxYear) } : {}) };
  if (it.kind === 'confirm' || (s.state === 'fromCard' && it.cardKeys)) {
    const lines = cardLines(it, c, s);
    // ‼ בכרטיס אין כלום לאשר — שאלה מובנית (רשומה: ילדים, חשבון בנק; או בחירה) במקום «אין אצלנו פרטים»
    if (!lines.length && it.whenEmpty) {
      const w = it.whenEmpty;
      if (schema) return { ...base, title: fillP(w.question), input: { kind: 'record', schema, context: people } };
      return { ...base, title: fillP(w.question), input: w.input === 'choice' && w.options ? { kind: 'choice', options: w.options } : { kind: 'text' } };
    }
    // «משהו השתנה» — עריכה של מה שבתיק בשדות נפרדים, כשיש לפריט רשומה מובנית
    const initial = schema ? initialFromCard(schema, c, role) : [];
    return {
      // ‼ 19.10.2026 · שאלת פתיחה שידועה מהכרטיס (ביטוח חיים, תרומות) — הכותרת היא הנושא, לא השאלה («האם לך יש…? — זה מה שידוע לנו»)
      ...base, title: `${it.kind === 'screener' ? it.label : fillP(qText ?? it.label)}${periodText && listOrTimed(it.key) ? ` ${periodText}` : ''} — זה מה שידוע לנו`,
      input: { kind: 'confirm', lines: lines.length ? lines : ['אין אצלנו פרטים'], ...(schema ? { edit: { schema, initial, context: people } } : {}) },
    };
  }
  if (it.kind === 'document' && it.docKind) return { ...base, title: fillP(qText ?? DOCS[it.docKind].label), input: { kind: 'file', docKind: it.docKind } };
  // ‼ 16.10.2026 · «של מי / איפה» — רשימות סגורות; «של מי» רק לזוג נשוי (ליחיד התשובה ידועה — השדה יורד מהמפרט)
  if (it.input === 'entity' && it.entity) {
    const spec = { ...it.entity, fields: visibleFields(it.entity, people) };
    // ‼ 13.10.2026 (גיא): בתיק ידוע שהאדם רשום כעוסק אבל העסק עצמו לא רשום — מציגים את מה שידוע ומבקשים להשלים
    const dealer = it.key === 'intake.businessDetails' ? dealerOf(c, role) : null;
    const lead = dealer ? `רשום/ה אצלנו כ${DEALER_KIND_LABELS[dealer]}. ` : '';
    const initial = dealer ? [{ dealer: dealer === 'licensed' ? 'murshe' : dealer === 'exempt' ? 'patur' : dealer === 'company' ? 'company' : '' }] : undefined;
    return { ...base, title: `${lead}${fillP(qText ?? it.label)}`, input: { kind: 'entity', spec, context: people, ...(initial ? { initial } : {}) } };
  }
  // ‼ רשומה מובנית: פרטים (מעסיק, נכס, חשבון…) ושאלות התחולה — שדות נפרדים
  if (schema && (it.kind === 'detail' || it.input === 'record')) {
    const context: Record<string, string> = { ...people, ...(isPeriodItem(it.key) ? (period && period.from === period.to ? { day: '1' } : { periodNoun: 'השנה' }) : {}) };
    // ‼ 13.10.2026 (גיא): בתיק ידוע שהאדם רשום כעוסק אבל העסק עצמו לא רשום — מציגים את מה שידוע ומבקשים להשלים
    const dealer = it.key === 'intake.businessDetails' ? dealerOf(c, role) : null;
    const lead = dealer ? `רשום/ה אצלנו כ${DEALER_KIND_LABELS[dealer]}. ` : '';
    const initial = dealer ? [{ dealer: dealer === 'licensed' ? 'murshe' : dealer === 'exempt' ? 'patur' : dealer === 'company' ? 'company' : '' }] : undefined;
    return { ...base, title: `${lead}${fillP(qText ?? it.label)}`, input: { kind: 'record', schema, ...(initial ? { initial } : {}), ...(Object.keys(context).length ? { context } : {}) } };
  }
  if (it.input === 'amount') return { ...base, title: fillP(qText ?? it.label), input: { kind: 'amount' } };
  if (it.input === 'text') return { ...base, title: fillP(qText ?? it.label), input: { kind: 'text' } };
  if (it.input === 'choice' && it.options) return { ...base, title: fillP(qText ?? it.label), input: { kind: 'choice', options: it.options } };
  void title;
  return { ...base, title: fillP(qText ?? it.label), input: { kind: 'yesno', followUp: { kind: 'text' } } };
}

/** רשימות שתלויות בתקופה (מעסיקים, נכסים, חשבונות) — התקופה נכנסת לכותרת: «מקומות העבודה בשנת 2025 — זה מה שידוע לנו». */
const listOrTimed = (key: string) => ['salary.employers', 'rent.properties', 'capital.accounts', 'wealth.realEstate.list', 'wealth.securities.list', 'wealth.funds.list', 'wealth.bank.foreign', 'business.active', 'household.maritalAtYearEnd'].includes(key);

/** רשומה בתוכנית השאלות — שאלה אחת ללקוח, שיכולה לכסות שני אנשים («מי מכם?»). */
export interface AskPlanEntry {
  key: string;
  statuses: ItemStatus[];
  itemKey: string;
  subjectRole: ItemStatus['subjectRole'];
  entityKind?: ItemStatus['entityKind'];
  entityRef?: string;
  prompt: AskPrompt;
  /** למשרד: מה נשאל ועל מי. */
  label: string;
}

/**
 * מהסטטוסים שאפשר לשאול → שאלות. לזוג, שאלת פתיחה שחסרה לשניהם הופכת לשאלה אחת
 * «מי מכם?» (העובדות נשמרות לכל אדם בנפרד). שאר הפריטים — שאלה לכל יעד.
 */
export function buildAskPlan(statuses: ItemStatus[], ctx0: AskCtx): AskPlanEntry[] {
  // ‼ שם בן/בת הזוג מהדוח הקודם — לנוסח בלבד (כרטיס בלי שם, למשל אלמן/ה), לא נכתב לכרטיס
  const ctx = ctx0.lastYear?.spouseName && !ctx0.client.spouseFirstName && !ctx0.client.spouse?.firstName
    ? { ...ctx0, client: { ...ctx0.client, spouseFirstName: ctx0.lastYear.spouseName } } : ctx0;
  const c = ctx.client;
  const out: AskPlanEntry[] = [];
  const used = new Set<ItemStatus>();
  const married = c.familyStatus === 'married';
  // ‼ 16.10.2026 · היכרות: כל שאלות הפתיחה — מסך רשת אחד «סמנו מה יש לכם» (קיבוץ; העובדות נשמרות לכל מפתח)
  const grid = ctx.purpose === 'intake' || ctx.purpose === 'annual' ? buildMultiEntry(statuses, ctx) : null;
  if (grid) { for (const s of grid.statuses) used.add(s); }
  for (const s of statuses) {
    if (used.has(s)) continue;
    // המסך נכנס במקום שאלת הפתיחה הראשונה — אחרי האישורים מהכרטיס
    if (grid && !out.includes(grid) && s.item.kind === 'screener') out.push(grid);
    // ‼ 19.10.2026 · מה שידוע מהכרטיס (fromCard) — אישור «זה מה שידוע לנו», לא «מי מכם?»
    const pair = married && s.item.coupleQuestion && s.item.per === 'person' && !s.entityRef && s.state !== 'fromCard'
      ? statuses.find(o => o !== s && o.item.key === s.item.key && !o.entityRef && o.state !== 'fromCard' && o.subjectRole !== s.subjectRole && (o.subjectRole === 'client' || o.subjectRole === 'spouse'))
      : undefined;
    if (pair) {
      used.add(s); used.add(pair);
      out.push({
        key: `${s.item.key}|couple`, statuses: [s, pair], itemKey: s.item.key, subjectRole: 'couple',
        prompt: {
          templateVersion: CATALOG_VERSION,
          title: (ctx.purpose === 'wealth' && ctx.declKind === 'followup' && s.item.followupQuestion) || s.item.coupleQuestion!,
          // ‼ 13.10.2026 · גם לשאלה «מי מכם?» — ההסבר הגלוי והתקופה (לא רק «למה שואלים»)
          ...(({ why, hint, periodText }) => ({ why, hint, periodText }))(promptFor(s, ctx)),
          input: { kind: 'who', clientName: c.firstName || 'אני', spouseName: c.spouseFirstName || c.spouse?.firstName || 'בן/בת הזוג' },
        },
        label: `${s.item.label} · שניכם (שאלה אחת)`,
      });
      continue;
    }
    used.add(s);
    out.push({
      key: `${s.item.key}|${s.subjectRole}|${s.entityRef ?? ''}`, statuses: [s], itemKey: s.item.key, subjectRole: s.subjectRole,
      entityKind: s.entityKind, entityRef: s.entityRef === 'new' ? undefined : s.entityRef, prompt: { ...promptFor(s, ctx), templateVersion: CATALOG_VERSION },
      label: s.item.label,
    });
  }
  if (grid && !out.includes(grid)) out.push(grid);
  return out;
}

// ── 16.10.2026 · מסך הרשת «סמנו מה יש לכם» ─────────────────────────────────────────────────────────
// ‼ אריח = שאלת פתיחה (tile). לזוג נשוי, שאלת פתיחה לאדם הופכת לשאלה של משק הבית («מישהו מכם») — העובדה
//   נשמרת לתפקיד 'couple', ו«של מי» נשאל במסך ההמשך (של מי / איפה). ליחיד — לתפקיד 'client'.
// ‼ שאלת ההמשך היא צילום בתוך האריח (followUp): השרת פותח אותה כשמסמנים (portal_submit_tax_info, 253) — בלי
//   סבב נוסף מול המשרד. ישות חדשה מקבלת את אותו מזהה זמני שהתמונה הייתה נותנת לה (picture.ts › provisional).
// ‼ 19.10.2026 · גם בדוח השנתי: «מה היה לכם ב-{שנה}?» (ANNUAL_GRID_KEY). לכל אריח שסומן נפתחים מיד המסמך שלו ושאלה
//   קצרה כשצריך (ANNUAL_FOLLOW) — כמה שאלות יחד (followUps, 262). כך השאלון נגמר בסבב אחד, והמסמכים נבנים מהתשובות.
export const GRID_KEY = 'intake.whatYouHave';
export const ANNUAL_GRID_KEY = 'annual.whatHappened';
export const GRID_KEYS = [GRID_KEY, ANNUAL_GRID_KEY];

/**
 * ‼ 20.10.2026 · בקשת דוח שנתי שנפתחה בגרסה הקודמת של השאלון: שאלת פתיחה נפרדת לכל נושא («מי מכם?» / כן-לא)
 *   במקום מסך הריבועים. לבקשה כזו לא מוסיפים שאלות בגרסה החדשה — זה מה שערבב שני שאלונים אצל הלקוח (גיא ישר, 19.10).
 *   מציעים «סגור ופתח מחדש» (התשובות נשמרות לשנה, ולא נשאלות שוב). אריח נדיר נשאל לבד גם בגרסה החדשה — לא נספר.
 */
export function isLegacyAnnual(asks: { itemKey: string; state: string; prompt: AskPrompt }[]): boolean {
  return asks.some(a => {
    if (a.state === 'cancelled' || GRID_KEYS.includes(a.itemKey)) return false;
    const it = ITEM_BY_KEY[a.itemKey];
    return !!it && it.kind === 'screener' && !!it.tile && !it.rare && (a.prompt.input.kind === 'who' || a.prompt.input.kind === 'yesno');
  });
}
const GRID_ORDER = ['intake.employed', 'intake.selfEmployed', 'intake.rents', 'intake.hasInvestments', 'intake.selfDeposits', 'intake.foreign', 'intake.crypto',
  'intake.allowances', 'intake.insurance', 'intake.credits', 'intake.special'];
const ANNUAL_ORDER = ['household.familyChange', 'salary.worked', 'salary.equity', 'pension.received', 'niBenefits.received', 'rent.newRental', 'rent.otherProperty', 'capital.newAccount',
  'savings.selfDeposits', 'savings.insurance', 'donations.given', 'special.disability', 'household.creditChanges', 'foreign.income', 'sales.sold'];
/** מה נפתח מיד כשמסמנים אריח בדוח השנתי. מסמך לישות שאינה בתיק — עם המזהה הזמני (כמו בהיכרות). */
export const ANNUAL_FOLLOW: Record<string, string[]> = {
  'household.familyChange': ['household.familyEvent'],
  'salary.worked': ['salary.form106'], 'salary.equity': ['salary.equityDocs'], 'pension.received': ['pension.certs'], 'niBenefits.received': [] /* 20.10.2026 · niKindsAsks; האישור — המשרד */,
  'rent.newRental': ['rent.contract'], 'rent.otherProperty': ['rent.otherPropertyDocs'], 'capital.newAccount': ['capital.form867'],
  'savings.selfDeposits': ['savings.fundCerts'], 'savings.insurance': ['savings.insuranceCert'], 'donations.given': ['donations.receipts'],
  'special.disability': ['special.disabilityCert'], 'household.creditChanges': ['household.degreeDocs'],
  'foreign.income': ['foreign.statements'], 'sales.sold': ['sales.docs'],
};
/** כותרת למסמך שנפתח מהרשת לישות שעוד אין לה שם — «מכל מעסיק», לא «מהמעסיק החדש». */
const GRID_DOC_TITLE: Record<string, string> = {
  'salary.form106': 'טופס 106 — מכל מעסיק',
  'capital.form867': 'האישור השנתי מכל בנק או בית השקעות',
  'savings.fundCerts': 'האישור השנתי מכל קופה שהפקדתם אליה בעצמכם',
  'rent.contract': 'חוזה השכירות של הדירה או הנכס',
  'foreign.statements': 'הדוחות השנתיים מחו״ל (בנק, ברוקר או מעסיק)',
};
const spouseNameOf = (c: Client) => c.spouseFirstName || c.spouse?.firstName || 'בן/בת הזוג';

function buildMultiEntry(statuses: ItemStatus[], ctx: AskCtx): AskPlanEntry | null {
  const c = ctx.client;
  const married = c.familyStatus === 'married';
  const annual = ctx.purpose === 'annual';
  const gridKey = annual ? ANNUAL_GRID_KEY : GRID_KEY;
  const item = ITEM_BY_KEY[gridKey];
  const tiles = statuses.filter(s => s.item.kind === 'screener' && s.item.who === 'client' && !!s.item.tile && s.state === 'missing' && !s.entityRef
    && s.item.purposes.includes(ctx.purpose) && !s.item.rare);
  if (!tiles.length || !item) return null;
  const byKey = new Map<string, ItemStatus[]>();
  for (const s of tiles) byKey.set(s.item.key, [...(byKey.get(s.item.key) ?? []), s]);
  const order = annual ? ANNUAL_ORDER : GRID_ORDER;
  const options: MultiOption[] = [...byKey.entries()].map(([key, group]) => {
    const it = group[0].item;
    const role: SubjectRole = it.per === 'couple' ? 'couple' : married ? 'couple' : 'client';
    const hintRaw = hintFor(key, undefined);
    const base0 = { key, role, label: it.tile!, hint: hintRaw ? fillTemplate(hintRaw, c, role) : undefined };
    if (!annual) return { ...base0, followUp: gridFollowUp(it, role, ctx) };
    // ‼ 20.10.2026 · ריבוע = שם + דוגמה גלויה + קבוצה (בהשראת «תיאום מס»). «שינוי במשפחה ב-{שנה}» — הדוגמה לפי המצב בכרטיס,
    //   כדי שנשוי מ-2023 לא יתהה אם «נישואין» נוגע לו (גיא).
    const deathYear = knownFamilyEvent(c, ctx.taxYear) === 'death';
    const example = key === 'household.familyChange' ? (married ? 'גירושין, פרידה או פטירה' : 'חתונה, גירושין או פרידה')
      : key === 'special.disability' && deathYear ? `שלך — של ${spouseNameOf(c)} נשאל בנפרד` : ANNUAL_TILE_EXAMPLE[key];
    const base = { ...base0, label: key === 'household.familyChange' ? `שינוי במשפחה ב-${ctx.taxYear}` : base0.label,
      ...(example ? { example } : {}), group: (ANNUAL_TILE_LESS.has(key) ? 'less' : 'in') as 'less' | 'in',
      ...(key === 'niBenefits.received' ? { ours: ['האישור השנתי מביטוח לאומי'] } : {}) };
    // ‼ 19.10.2026 · אירוע שכבר בכרטיס בשנת הדוח (אלמן/ה מ-{שנה}) — האריח מסומן ופותח ישר את הענף, בלי «מה קרה?»
    const known = key === 'household.familyChange' ? knownFamilyEvent(c, ctx.taxYear) : null;
    if (known) {
      const b = familyBranches(ctx)[known];
      return { ...base, label: b.label, example: undefined, note: 'ידוע לנו מהתיק', preset: true, ...(b.followUps?.length ? { followUps: b.followUps } : {}) };
    }
    const followUps = key === 'niBenefits.received' ? niKindsAsks(role, ctx)
      : (ANNUAL_FOLLOW[key] ?? []).map((k, i) => annualFollowUp(k, role, ctx, i)).filter((x): x is MultiFollowUp => !!x);
    // ‼ 20.10.2026 · בשנת הפטירה, מה שהיה בדוח הקודם רק של בן/בת הזוג (קצבה, פטור נכות) שייך לענף הפטירה — לא אריח של הלקוח
    const last = spouseOnlyInDeathYear(ctx, key) ? undefined : ctx.lastYear?.tiles[key];
    return { ...base, ...(followUps.length ? { followUps } : {}), ...(last ? { note: `ב-${ctx.lastYear!.year}: ${last}`, preset: true } : {}) };
  }).sort((a, b) => (order.indexOf(a.key) + 1 || 99) - (order.indexOf(b.key) + 1 || 99));
  const why = item.why ?? '';
  return {
    key: `${gridKey}|couple`, statuses: tiles, itemKey: gridKey, subjectRole: 'couple',
    prompt: { templateVersion: CATALOG_VERSION, title: (item.question ?? item.label).split('{year}').join(String(ctx.taxYear)), why,
      hint: married ? 'מסמנים גם אם זה רק של אחד מכם.' : undefined, input: { kind: 'multi', options },
      addressee: addresseeOf(c), ...(annual ? { known: knownLines(c) } : {}) },
    label: `${item.label} · ${options.length} אריחים`,
  };
}

/**
 * ‼ 20.10.2026 · «מה שולם מביטוח לאומי?» — מסך בחירה לכל אדם (לזוג: שני כרטיסים במסך אחד — screens.ts). «דמי לידה» רק כשמסמנים
 *   אותו (לא שאלה לכל מי שקיבל משהו — יריב, אלמן, נשאל «דמי לידה?»). את האישור השנתי המשרד מוציא (niBenefits.cert, who: office).
 */
function niKindsAsks(role: SubjectRole, ctx: AskCtx): MultiFollowUp[] {
  const roles: SubjectRole[] = role === 'couple' ? ['client', 'spouse'] : [role];
  // לזוג — שני כרטיסים במסך אחד; לכל כרטיס השם (בן/בת הזוג כבר עם שם — promptFor)
  return roles.map((r, i) => branchAsk('niBenefits.kinds', r, ctx, 0.5 + i / 10, { ...(roles.length > 1 && r === 'client' && ctx.client.firstName ? { subjectName: ctx.client.firstName } : {}), input: { kind: 'multi', options: [
    opt('niBenefits.kindUnemployment', r, 'אבטלה', []), opt('niBenefits.kindReserve', r, 'מילואים', []), opt('niBenefits.maternity', r, 'דמי לידה', []),
    opt('niBenefits.kindInjury', r, 'דמי פגיעה בעבודה', []), opt('niBenefits.kindDisability', r, 'נכות', []), opt('niBenefits.kindOther', r, 'אחר', []),
  ] } })).filter((x): x is MultiFollowUp => !!x);
}

/** 20.10.2026 · «מה כבר ידוע לנו» לפני הריבועים — מוצג, לא נשאל (גיא: «מה זה אם היה לי נישואין? אני נשוי מ-2023»). */
export function knownLines(c: Client): [string, string][] {
  const out: [string, string][] = [];
  const since = familyStatusEventYear(c);
  const sp = c.spouseFirstName || c.spouse?.firstName;
  if (c.familyStatus === 'married') out.push(['מצב משפחתי', `נשואים${since ? ` מ-${since}` : ''}`]);
  else if (c.familyStatus) out.push(['מצב משפחתי', `${familyWord(c)}${since ? ` מ-${since}` : ''}`]);
  const kids = c.children ?? [];
  if (kids.length) out.push(['ילדים', `${kids.length}${kids.some(k => k.birthYear) ? ` · נולדו ב-${kids.map(k => k.birthYear).filter(Boolean).join(', ')}` : ''}`]);
  const work = (spouse: boolean) => (c.employers ?? []).filter(e => !!e.belongsToSpouse === spouse && !e.endDate).map(e => e.name).filter(Boolean);
  if (work(false).length) out.push([c.firstName || 'עבודה', work(false).join(', ')]);
  if (sp && work(true).length) out.push([sp, work(true).join(', ')]);
  return out;
}

/** סטטוס «חסר» מדומה לפריט שנפתח מהרשת — כדי לבנות לו את הנוסח מאותה פונקציה (promptFor). */
const fakeStatus = (it: InfoItem, t: Partial<ItemStatus>) =>
  ({ subjectRole: 'couple', ...t, item: it, area: it.area, state: 'missing', detail: '', facts: [], evidence: [], askable: true } as ItemStatus);

/**
 * שאלה אחת שנפתחת מאריח בדוח השנתי (או מבחירה בענף, למשל «בן/בת הזוג נפטר/ה»).
 * ‼ ישות שאינה בתיק (מעסיק, חשבון, נכס, קופה, מקור בחו״ל) — המזהה הזמני של התמונה; ‼ הענף המשפחתי — familyBranch.
 */
function annualFollowUp(itemKey: string, role: SubjectRole, ctx: AskCtx, order: number): MultiFollowUp | null {
  const it = ITEM_BY_KEY[itemKey];
  if (!it) return null;
  if (itemKey === 'household.familyEvent') return { itemKey, subjectRole: 'couple', prompt: familyEventPrompt(ctx, order) };
  const pv = PROVISIONAL[it.per];
  const subjectRole: SubjectRole = pv ? pv.subject(role === 'couple' ? 'client' : role) : it.per === 'couple' ? 'couple' : role;
  const target = pv
    ? { subjectRole: role === 'couple' && it.per === 'employer' ? 'couple' as SubjectRole : subjectRole, entityKind: it.per as EntityKind,
        entityRef: provisionalRef(it.per, role, ctx.taxYear), entityLabel: pv.label, provisional: true, gateRole: role }
    : { subjectRole };
  const p = promptFor(fakeStatus(it, target), ctx);
  const title = GRID_DOC_TITLE[itemKey] ?? p.title;
  return { itemKey, subjectRole: target.subjectRole, entityKind: 'entityKind' in target ? target.entityKind : undefined,
    entityRef: 'entityRef' in target ? target.entityRef : undefined, prompt: { ...p, title, templateVersion: CATALOG_VERSION, order } };
}

/** שאלה של הענף (פטירה, גירושין, נישואין) — לפי מפתח, לתפקיד שנקבע בענף. */
function branchAsk(itemKey: string, subjectRole: SubjectRole, ctx: AskCtx, order: number, patch: Partial<AskPrompt> = {}): MultiFollowUp | null {
  const it = ITEM_BY_KEY[itemKey];
  if (!it) return null;
  const p = promptFor(fakeStatus(it, { subjectRole }), ctx);
  return { itemKey, subjectRole, prompt: { ...p, ...patch, templateVersion: CATALOG_VERSION, order } };
}

/** 20.10.2026 · «מתי התחילו לשלם את קצבת השאירים» — עם השנים עצמן בתשובות. */
const survivorPaidWhen = (ctx: AskCtx) => branchAsk('family.survivorPaidWhen', 'couple', ctx, 4.5, { input: { kind: 'choice', options: [
  { value: 'thisYear', label: `כבר ב-${ctx.taxYear}` }, { value: 'nextYearRetro', label: `רק ב-${ctx.taxYear + 1} — עם תשלום רטרואקטיבי` },
  { value: 'notYet', label: 'עוד לא התחילו לשלם' }, { value: 'notSure', label: 'לא בטוח/ה' }] } });

/** «בחירה» בתוך ענף: אפשרות במסך רשת קטן, עם השאלות שהיא פותחת. */
const opt = (key: string, role: SubjectRole, label: string, followUps: (MultiFollowUp | null)[], hint?: string): MultiOption => {
  const f = followUps.filter((x): x is MultiFollowUp => !!x);
  return { key, role, label, ...(hint ? { hint } : {}), ...(f.length ? { followUps: f } : {}) };
};

/**
 * ‼ 19.10.2026 · «מה קרה?» — הענף המשפחתי בשנת הדוח. לנשוי/אה: פטירה או גירושין; לאחרים: נישואין.
 * פטירה: התאריך וצו הירושה · מה בן/בת הזוג קיבל/ה עד הפטירה · כספים בגלל הפטירה · קצבאות שאירים · תעודת פטירה.
 * ‼ הטון עדין, ובלי מונחים מקצועיים — את ההכרעות (חיתוך ביום הפטירה, הפיצויים, פטור הנכות) עושה המשרד.
 *   המקור: docs/tax-foundation/research/spouse-death-year-2026-10-19.md.
 */
/** מה שבדוח הקודם היה רק של בן/בת הזוג, כשבן/בת הזוג נפטר/ה בשנת הדוח (הכרטיס יודע). */
function spouseOnlyInDeathYear(ctx: AskCtx, tile: string): boolean {
  const people = ctx.lastYear?.tilePeople?.[tile];
  return knownFamilyEvent(ctx.client, ctx.taxYear) === 'death' && !!people?.length && people.every(p => p === 'spouse');
}
/** ענף הפטירה: מה שהיה של בן/בת הזוג בדוח הקודם — מסומן מראש, עם «ב-{שנה}: …». */
const lastYearOf = (ctx: AskCtx, tile: string, o: MultiOption): MultiOption =>
  spouseOnlyInDeathYear(ctx, tile) && ctx.lastYear?.tiles[tile] ? { ...o, preset: true, note: `ב-${ctx.lastYear.year}: ${ctx.lastYear.tiles[tile]}` } : o;

/** ‼ 19.10.2026 · האירוע המשפחתי של שנת הדוח, כשהוא כבר רשום בכרטיס (המצב היום + שנת האירוע). */
export function knownFamilyEvent(c: Client, taxYear: number): 'death' | 'divorce' | 'marriage' | null {
  if (c.familyStatus === 'widowed' && c.widowhoodYear === taxYear) return 'death';
  if (c.familyStatus === 'divorced' && c.divorceYear === taxYear) return 'divorce';
  if (c.familyStatus === 'married' && c.marriageYear === taxYear) return 'marriage';
  return null;
}

function familyEventPrompt(ctx: AskCtx, order: number): AskPrompt {
  const married = ctx.client.familyStatus === 'married';
  const it = ITEM_BY_KEY['household.familyEvent'];
  const b = familyBranches(ctx);
  return {
    templateVersion: CATALOG_VERSION, order, title: it?.question ?? 'מה קרה?', why: it?.why ?? '',
    input: { kind: 'multi', options: married ? [b.death, b.divorce] : [b.marriage, b.divorce] },
  };
}

function familyBranches(ctx: AskCtx): Record<'death' | 'divorce' | 'marriage', MultiOption> {
  const c = ctx.client;
  const sp = spouseNameOf(c);
  const named = !!(c.spouseFirstName || c.spouse?.firstName);
  // ‼ מעסיק של בן/בת הזוג בכרטיס — ה-106 שלו כבר נשאל לפי הישות (גם אצל אלמן/ה); כאן רק כשאין
  const spouseEmployerAsked = (c.employers ?? []).some(e => !!e.belongsToSpouse);
  const death = opt('family.eventDeath', 'couple', named ? genderize(`${sp} נפטר/ה`, genderOf(c, 'spouse')) : genderize('בן/בת הזוג נפטר/ה', genderOf(c, 'spouse')), [
    branchAsk('family.death', 'couple', ctx, 1, { hint: 'אנחנו משתתפים בצערך. נשאל רק את מה שצריך כדי לסדר את הדוח — ואת השאר נעשה אנחנו.' }),
    branchAsk('family.deathIncome', 'couple', ctx, 2, { input: { kind: 'multi', options: [
      opt('family.deathGotSalary', 'spouse', 'משכורת', spouseEmployerAsked ? [] : [annualFollowUp('salary.form106', 'spouse', ctx, 6)]),
      lastYearOf(ctx, 'pension.received', opt('family.deathGotPension', 'spouse', 'קצבה או פנסיה', [branchAsk('pension.certs', 'spouse', ctx, 7),
        // ‼ 20.10.2026 · היוון + 161ד: «כן» פותח מיד את המכתב (onYes — «סבב אחד»)
        branchAsk('family.pensionCapitalized', 'couple', ctx, 7.5, { onYes: [branchAsk('family.capitalizationDocs', 'couple', ctx, 7.6)].filter((x): x is MultiFollowUp => !!x) })])),
      // ‼ 20.10.2026 · ביטוח לאומי — המשרד מוציא את האישור (העובדה niBenefits.received של בן/בת הזוג ⇒ niBenefits.cert במשימות המשרד)
      opt('niBenefits.received', 'spouse', 'דמי מחלה או קצבת נכות מביטוח לאומי', []),
      // ‼ 20.10.2026 · נכות או מחלה קשה של מי שנפטר/ה — כאן, לא בריבוע של הלקוח (גיא: «אשתו נפטרה מסרטן — לא ברור אם לסמן»)
      lastYearOf(ctx, 'special.disability', opt('special.disability', 'spouse', 'נכות או מחלה קשה, עם אחוזי נכות', [branchAsk('special.disabilityCert', 'spouse', ctx, 8.5)])),
      opt('family.deathGotDisabilityIns', 'spouse', 'אובדן כושר עבודה מחברת ביטוח', [branchAsk('family.disabilityInsDocs', 'spouse', ctx, 9)]),
    ] } }),
    branchAsk('family.deathPayouts', 'couple', ctx, 3, { input: { kind: 'multi', options: [
      opt('family.payoutSeverance', 'couple', 'פיצויים או מענק מהמעסיק', [branchAsk('family.severanceDocs', 'couple', ctx, 10)]),
      opt('family.payoutLifeIns', 'couple', 'ביטוח חיים', [branchAsk('family.payoutDocs', 'couple', ctx, 11)]),
      opt('family.payoutFund', 'couple', 'כסף מקופת גמל או פנסיה', [branchAsk('family.payoutDocs', 'couple', ctx, 11)]),
      opt('family.payoutMortgage', 'couple', 'ביטוח משכנתה (שולם לבנק)', []),
      opt('family.payoutSickDays', 'couple', 'פדיון ימי מחלה או חופשה', [branchAsk('family.sickPayDocs', 'couple', ctx, 10.5)]),
    ] } }),
    branchAsk('family.survivorPensions', 'couple', ctx, 4, { input: { kind: 'multi', options: [
      // ‼ 20.10.2026 · אישור לכל משלם, ושאלה אחת «מתי התחילו לשלם» (משותפת לכל המשלמים — השרת פותח אותה פעם אחת)
      opt('family.survivorFromFund', 'couple', 'קרן פנסיה או חברת ביטוח', [branchAsk('family.survivorDocs', 'couple', ctx, 12), survivorPaidWhen(ctx)]),
      opt('family.survivorFromState', 'couple', 'המדינה (גמלאות)', [branchAsk('family.survivorDocsState', 'couple', ctx, 12.1), survivorPaidWhen(ctx)]),
      { ...opt('family.survivorFromBtl', 'couple', 'ביטוח לאומי', [survivorPaidWhen(ctx)]), ours: ['האישור מביטוח לאומי על קצבת השאירים'] },
    ] } }),
    branchAsk('family.deathDocs', 'couple', ctx, 5),
  ]);
  const divorce = opt('family.eventDivorce', 'couple', 'התגרשנו או נפרדנו', [
    branchAsk('family.divorce', 'couple', ctx, 1), branchAsk('family.divorceDocs', 'couple', ctx, 2)]);
  const marriage = opt('family.eventMarriage', 'couple', 'התחתנתי', [
    branchAsk('family.marriage', 'couple', ctx, 1), branchAsk('family.marriageSpouseDocs', 'couple', ctx, 2)]);
  return { death, divorce, marriage };
}

/** מה נפתח כשמסמנים אריח: פריט «של מי / איפה» של התחום (ישות חדשה — עם המזהה הזמני), או «מי מכם?» לזוג כשאין פריט כזה. */
function gridFollowUp(screener: InfoItem, role: SubjectRole, ctx: AskCtx): MultiOption['followUp'] | undefined {
  const c = ctx.client;
  const next = ITEMS.find(i => i.after === screener.key && i.purposes.includes('intake') && i.who === 'client' && i.input !== 'file' && i.kind !== 'document');
  if (next) {
    const pv = PROVISIONAL[next.per];
    const gateRole: SubjectRole = role;
    const target: Pick<ItemStatus, 'subjectRole' | 'entityKind' | 'entityRef' | 'entityLabel' | 'provisional' | 'gateRole' | 'ownerRole'> = pv
      ? { subjectRole: pv.subject(gateRole === 'couple' ? 'client' : gateRole), entityKind: next.per as EntityKind, entityRef: provisionalRef(next.per, gateRole, 'intake'),
          entityLabel: pv.label, ownerRole: gateRole === 'spouse' ? 'spouse' : 'client', provisional: true, gateRole }
      : { subjectRole: next.per === 'couple' ? 'couple' : role };
    const s = { ...target, item: next, area: next.area, state: 'missing', detail: '', facts: [], evidence: [], askable: true } as ItemStatus;
    return { itemKey: next.key, subjectRole: s.subjectRole, entityKind: s.entityKind, entityRef: s.entityRef, prompt: { ...promptFor(s, ctx), templateVersion: CATALOG_VERSION } };
  }
  // אין פריט המשך (תואר/שחרור, עלייה/נכות): לזוג — «מי מכם?» על אותה שאלת פתיחה; ליחיד — התשובה כבר לאדם
  if (role === 'couple' && screener.per === 'person' && screener.coupleQuestion) {
    const s = { subjectRole: 'client', item: screener, area: screener.area, state: 'missing', detail: '', facts: [], evidence: [], askable: true } as ItemStatus;
    const { why, hint } = promptFor(s, ctx);
    return { itemKey: screener.key, subjectRole: 'couple', prompt: { templateVersion: CATALOG_VERSION, title: screener.coupleQuestion, why, hint,
      input: { kind: 'who', clientName: c.firstName || 'אני', spouseName: c.spouseFirstName || c.spouse?.firstName || 'בן/בת הזוג' } } };
  }
  return undefined;
}

/** פריט שאלה חדש (טיוטה) לבקשת «השלמת מידע». */
export function newAsk(s: ItemStatus, ctx: AskCtx, ids: { id: string; stepId: string; parentStepId: string; now: string }): InfoAsk {
  return {
    id: ids.id, clientId: ctx.client.id, taxYear: ctx.taxYear, stepId: ids.stepId, parentStepId: ids.parentStepId,
    itemKey: s.item.key, subjectRole: s.subjectRole, entityKind: s.entityKind, entityRef: s.entityRef,
    prompt: { ...promptFor(s, ctx), templateVersion: CATALOG_VERSION }, state: 'draft', createdAt: ids.now,
  };
}

/**
 * «החזר ללקוח לתיקון»: אותה שאלה שוב (אותו פריט, אדם וישות), עם הערת המשרד.
 * ‼ התשובה הקודמת לא נמחקת — היא נדחית עם ההערה ונשארת בהיסטוריה; השאלה החדשה היא שורה חדשה
 *   (פריט פתוח אחד לזהות — השרת לא ייצור כפילות אם כבר יש שאלה פתוחה).
 * מקור הנוסח: השאלה שהולידה את התשובה או את המסמך; בלעדיה (שאלון ישן, מעבר מהכרטיס) — מהקטלוג.
 * null = אין מה לשאול את הלקוח (פריט של המשרד, או פריט לא מוכר).
 */
export function correctionAsk(
  from: { factId?: string; evidenceId?: string; askId?: string; itemKey: string; subjectRole: InfoAsk['subjectRole']; entityKind?: InfoAsk['entityKind']; entityRef?: string },
  asks: Pick<InfoAsk, 'id' | 'itemKey' | 'subjectRole' | 'entityKind' | 'entityRef' | 'prompt' | 'answeredFactIds' | 'evidenceIds'>[],
  statuses: ItemStatus[], ctx: AskCtx, note: string,
): Pick<InfoAsk, 'itemKey' | 'subjectRole' | 'entityKind' | 'entityRef' | 'prompt'> | null {
  const text = note.trim();
  if (!text) return null;
  // השרת רושם על כל תשובה וכל קובץ את השאלה שלהם (ask_id); answeredFactIds/evidenceIds — במסלול המדומה
  const origin = asks.find(a => (from.askId && a.id === from.askId) || (from.factId && a.answeredFactIds?.includes(from.factId)) || (from.evidenceId && a.evidenceIds?.includes(from.evidenceId)));
  if (origin) {
    return { itemKey: origin.itemKey, subjectRole: origin.subjectRole, entityKind: origin.entityKind, entityRef: origin.entityRef,
      prompt: { ...origin.prompt, correction: text } };
  }
  const it = ITEM_BY_KEY[from.itemKey];
  if (!it || it.who === 'office') return null;
  const s = statuses.find(x => x.item.key === from.itemKey && x.subjectRole === from.subjectRole && (x.entityRef ?? null) === (from.entityRef ?? null));
  if (!s) return null;
  return { itemKey: s.item.key, subjectRole: s.subjectRole, entityKind: s.entityKind, entityRef: s.entityRef,
    prompt: { ...promptFor(s, ctx), templateVersion: CATALOG_VERSION, correction: text } };
}

// ── תשובות ───────────────────────────────────────────────────────────────────

/** מה הלקוח שולח. `unavailable` = «אין לי עדיין» (למסמך בלבד). */
export type AskAnswer =
  | { kind: 'yes'; note?: string }
  | { kind: 'no' }
  | { kind: 'notSure'; note?: string }
  | { kind: 'amount'; amount: number }
  | { kind: 'text'; text: string }
  | { kind: 'choice'; value: string }
  | { kind: 'unchanged' }
  | { kind: 'changed'; note: string }
  | { kind: 'file'; fileName: string; documentId?: string }
  /** 13.10.2026 · `code` — למה אין מסמך: אעלה בהמשך / עוד לא קיבלתי / צריך עזרה. בלי code — «אין לי עדיין» הישן. */
  | { kind: 'unavailable'; reason: string; code?: UnavailableCode }
  /** לזוג: מי מכם. */
  | { kind: 'who'; value: 'none' | 'client' | 'spouse' | 'both' }
  /**
   * 13.10.2026 · רשומה מובנית. `value` — כפי שנשמר בעובדה: לרשימה `{ items }`, לשאלת תחולה — הרשומה עצמה.
   * `none` — «אין» (למשל אין ילדים) ⇒ עובדה 'no'. `assertion: 'changed'` — תיקון למה שבתיק («משהו השתנה»).
   */
  | { kind: 'record'; value: unknown; none?: boolean; assertion?: 'changed'; was?: string[] }
  /** 16.10.2026 · מסך הרשת: המפתחות שסומנו. כל אריח שלא סומן ⇒ «לא». */
  | { kind: 'multi'; selected: string[]; note?: string /* 20.10.2026 · «משהו לא נכון?» ⇒ הערה למשרד (267) */ }
  /** 16.10.2026 · של מי / איפה — פריטים עם שדות סגורים (entities.ts). */
  | { kind: 'entity'; items: EntityItem[] };

export interface AnswerResult {
  facts: Omit<YearFact, 'id' | 'createdAt'>[];
  /** 16.10.2026 · מסך הרשת: שאלות ההמשך של מה שסומן — נפתחות מיד (מפורסמות), בלי סבב מול המשרד. */
  followUps?: NonNullable<MultiOption['followUp']>[];
  /** מסמך שהועלה — נרשם כראיה «התקבל, ממתין לבדיקה». */
  evidence?: { docKind: NonNullable<InfoItem['docKind']>; fileName: string; documentId?: string };
  unavailable?: { reason: string; followUpOn: string };
  /** «לא בטוח» — למשרד, לא שאלה נוספת ללקוח. */
  officeNote?: string;
}

const pad = (n: number) => String(n).padStart(2, '0');
const lastDay = (y: number, m: number) => new Date(y, m, 0).getDate();

/** התקופה והבסיס של תשובה, לפי התכלית. */
export function periodFor(ctx: AskCtx, it: InfoItem): { periodKind: PeriodKind; periodFrom?: string; periodTo?: string; basis: FactBasis } {
  const y = ctx.taxYear;
  // הצהרת הון: כל עובדה «נכון ליום ההצהרה» — זהה ל-230 (portal_submit_tax_info).
  // קליטה (236): «נכון ליום הקליטה» — אותו מבנה, לא שנה.
  if (ctx.purpose === 'wealth' || ctx.purpose === 'intake') return { periodKind: 'as_of', periodTo: ctx.asOfDate, basis: it.kind === 'amount' ? 'declared' : 'actual' };
  if (it.key.endsWith('.changesSince')) return { periodKind: 'year', periodFrom: `${y}-01-01`, periodTo: `${y}-12-31`, basis: 'actual' };
  if (ctx.purpose === 'estimate') {
    const m = ctx.cutoffMonth ?? 12;
    if (it.key === 'business.forecast' || it.key === 'capital.estimate') return { periodKind: 'year', periodFrom: `${y}-01-01`, periodTo: `${y}-12-31`, basis: 'forecast' };
    return { periodKind: 'months', periodFrom: `${y}-01-01`, periodTo: `${y}-${pad(m)}-${pad(lastDay(y, m))}`, basis: m === 12 ? 'actual' : 'actual_to_date' };
  }
  return { periodKind: 'year', periodFrom: `${y}-01-01`, periodTo: `${y}-12-31`, basis: it.kind === 'amount' ? 'declared' : 'actual' };
}

/** תשובה → עובדות ממתינות. אין כאן כתיבה; הקורא (שרת / מדמה) שומר. */
/** ‼ אותו כלל כמו השרת (264): אילו מההמשכים נפתחים לתשובה הזו. */
export function onYesFor(p: AskPrompt, answer: AskAnswer): MultiFollowUp[] {
  const list = p.onYes ?? [];
  if (!list.length) return [];
  switch (answer.kind) {
    case 'yes': case 'unchanged': return list;
    case 'who': {
      if (answer.value === 'none') return [];
      const roles = answer.value === 'both' ? ['client', 'spouse'] : [answer.value];
      return list.filter(f => f.subjectRole === 'couple' || roles.includes(f.subjectRole));
    }
    case 'record': {
      if (answer.none || answer.assertion === 'changed' || !answer.value || typeof answer.value !== 'object') return [];
      const ip = (answer.value as { inPeriod?: unknown }).inPeriod;
      return ip === 'all' || ip === 'part' ? list : [];
    }
    default: return [];
  }
}

/**
 * תשובה ⇒ עובדות. ‼ 20.10.2026 · וגם מה שהתשובה פותחת מיד (prompt.onYes — «סבב אחד»), באותו כלל כמו השרת (264).
 */
export function answerToFacts(ask: InfoAsk, answer: AskAnswer, ctx: AskCtx, today: string): AnswerResult {
  const r = factsOfAnswer(ask, answer, ctx, today);
  const more = onYesFor(ask.prompt, answer);
  return more.length ? { ...r, followUps: [...(r.followUps ?? []), ...more] } : r;
}

function factsOfAnswer(ask: InfoAsk, answer: AskAnswer, ctx: AskCtx, today: string): AnswerResult {
  const it = ITEM_BY_KEY[ask.itemKey];
  if (!it) throw new Error(`פריט לא מוכר: ${ask.itemKey}`);
  const p = periodFor(ctx, it);
  const base = {
    clientId: ask.clientId, taxYear: ask.taxYear, itemKey: ask.itemKey, subjectRole: ask.subjectRole,
    entityKind: ask.entityKind, entityRef: ask.entityRef, ...p,
    source: 'portal' as const, requestId: ask.parentStepId, askId: ask.id, status: 'pending' as const,
  };
  const fact = (answerState: FactAnswer, value?: unknown, extra: Partial<YearFact> = {}) => ({ ...base, answer: answerState, value, ...extra });

  switch (answer.kind) {
    case 'who': {
      if (!['none', 'client', 'spouse', 'both'].includes(answer.value)) throw new Error('תשובה לא מוכרת');
      const yes = (r: 'client' | 'spouse') => answer.value === 'both' || answer.value === r;
      return { facts: (['client', 'spouse'] as const).map(r => ({ ...base, subjectRole: r, answer: yes(r) ? 'value' as const : 'no' as const, value: yes(r) ? true : undefined })) };
    }
    case 'yes': return { facts: [fact('value', answer.note ? { yes: true, note: answer.note } : true)] };
    case 'no': return { facts: [fact('no')] };
    case 'notSure': return { facts: [], officeNote: answer.note || 'הלקוח לא בטוח' };
    case 'amount':
      if (!Number.isFinite(answer.amount) || answer.amount < 0) throw new Error('סכום לא תקין');
      return { facts: [answer.amount === 0 ? fact('zero', 0) : fact('value', answer.amount)] };
    case 'text': {
      const t = answer.text.trim();
      if (!t) throw new Error('תשובה ריקה');
      return { facts: [fact('value', t)] };
    }
    case 'choice': return { facts: [fact('value', answer.value)] };
    case 'unchanged':
      // הצהרת לקוח בלבד. התקופה: עד היום/החתך בהערכה, השנה כולה בדוח.
      return { facts: [fact('value', { unchanged: true, lines: ask.prompt.input.kind === 'confirm' ? ask.prompt.input.lines : [] }, { clientAssertion: 'unchanged', confirmsCardKey: it.cardKeys?.[0] })] };
    case 'changed': {
      const n = answer.note.trim();
      if (!n) throw new Error('נא לכתוב מה השתנה');
      return { facts: [fact('value', { changed: true, note: n, was: ask.prompt.input.kind === 'confirm' ? ask.prompt.input.lines : [] }, { clientAssertion: 'changed' })] };
    }
    case 'file':
      if (!it.docKind) throw new Error('הפריט אינו מסמך');
      return { facts: [], evidence: { docKind: it.docKind, fileName: answer.fileName, documentId: answer.documentId } };
    case 'unavailable': {
      if (!it.docKind) throw new Error('«אין לי עדיין» רק למסמך');
      const reason = answer.reason.trim() || UNAVAILABLE_LABEL[answer.code ?? 'legacy'];
      return { facts: [], unavailable: { reason, followUpOn: followUpFor(it.docKind, ask.taxYear, today).followUpOn, ...(answer.code ? { code: answer.code } : {}) } };
    }
    case 'multi': {
      if (ask.prompt.input.kind !== 'multi') throw new Error('השאלה אינה מסך רשת');
      if (!Array.isArray(answer.selected) || answer.selected.some(k => typeof k !== 'string')) throw new Error('תשובה לא מוכרת');
      const opts = ask.prompt.input.options;
      const unknown = answer.selected.filter(k => !opts.some(o => o.key === k));
      if (unknown.length) throw new Error(`אריח לא מוכר: ${unknown[0]}`);
      const facts = opts.map(o => {
        const oi = ITEM_BY_KEY[o.key];
        const yes = answer.selected.includes(o.key);
        return { ...base, itemKey: o.key, subjectRole: o.role, entityKind: undefined, entityRef: undefined, ...(oi ? periodFor(ctx, oi) : p), answer: yes ? 'value' as const : 'no' as const, value: yes ? true : undefined };
      });
      return { facts, followUps: opts.filter(o => answer.selected.includes(o.key)).flatMap(o => [...(o.followUp ? [o.followUp] : []), ...(o.followUps ?? [])]) };
    }
    case 'entity': {
      if (ask.prompt.input.kind !== 'entity') throw new Error('השאלה אינה «של מי / איפה»');
      const { spec, context } = ask.prompt.input;
      if (!Array.isArray(answer.items) || !answer.items.length || answer.items.length > 20) throw new Error('רשומה ריקה');
      if (!entityValid(spec, answer.items, context)) throw new Error('חלק מהפרטים לא תקינים');
      return { facts: [fact('value', { items: answer.items.map(i => cleanEntity(spec, i, context)) })] };
    }
    case 'record': {
      if (answer.none) return { facts: [fact('no')] };
      if (answer.value == null || typeof answer.value !== 'object') throw new Error('רשומה ריקה');
      return { facts: [fact('value', answer.assertion === 'changed' ? { changed: true, record: answer.value, was: answer.was ?? [] } : answer.value,
        answer.assertion === 'changed' ? { clientAssertion: 'changed' } : {})] };
    }
  }
}

/** למה אין מסמך — ללקוח ולמשרד. 'legacy' = «אין לי עדיין» שנשמר לפני 13.10.2026, בלי משמעות ידועה. */
export const UNAVAILABLE_LABEL: Record<UnavailableCode | 'legacy', string> = {
  later: 'אעלה בהמשך', notYet: 'עוד לא קיבלתי את המסמך', needHelp: 'אין לי — צריך עזרה', legacy: 'אין לי עדיין',
};

/** כותרת התחום ללקוח (מקבץ שאלות בדף האישי). */
export const clientAreaTitle = (itemKey: string) => AREA_BY_ID[ITEM_BY_KEY[itemKey]?.area]?.clientTitle ?? '';
export { MONTHS };

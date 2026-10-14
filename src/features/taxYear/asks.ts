// ─── שאלות ללקוח ותשובות → עובדות ─────────────────────────────────────────────
// ‼ הטקסט ללקוח נשמר כצילום ברגע היצירה (InfoAsk.prompt) — הדף האישי והשרת לא
// גוזרים אותו מחדש מהקטלוג. כך שינוי ניסוח לא משנה שאלה שכבר נשלחה.
// ‼ תשובה היא עובדה ממתינה. «הלקוח אישר שאין שינוי» ≠ אישור מקצועי: גם היא
// ממתינה, והמשרד מאשר אותה במרוכז.
// ‼ תשובה להערכה נשמרת עם התקופה שלה (ינואר עד החתך), ולכן בדוח השנתי היא חלקית.

import type { Client } from '../../types';
import { AREA_BY_ID, ITEM_BY_KEY, type InfoItem, CATALOG_VERSION } from './catalog';
import { DOCS, followUpFor } from './documents';
import type { ItemStatus } from './picture';
import type { AskPrompt, FactAnswer, FactBasis, InfoAsk, PeriodKind, Purpose, UnavailableCode, YearFact } from './types';
import { hintFor } from './hints';
import { RECORD_OF, isPeriodItem, dealerOf } from './structured';
import { initialFromCard } from './records';
import { periodOfRequest, periodWords, propertySpan, accountSpan, spanText } from './temporal';
import { DEALER_KIND_LABELS } from '../taxFile/editModel';

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
      return [`${familyWord(c)}${c.familyStatus === 'married' && c.marriageYear ? ` מ-${c.marriageYear}` : ''}${c.familyStatus === 'married' && (c.spouseFirstName || c.spouse?.firstName) ? ` · ${c.spouseFirstName || c.spouse?.firstName}` : ''}`];
    case 'household.children':
      return (c.children ?? []).map(ch => `${ch.firstName || 'ילד/ה'} — נולד/ה ב-${ch.birthYear}`);
    case 'household.settlement':
      return [c.city ? `גר/ה ב${c.city}` : 'יישוב המגורים'];
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
        ...(c.children ?? []).map(ch => `${ch.firstName || 'ילד/ה'} — נולד/ה ב-${ch.birthYear}`),
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
      return [`${familyWord(c)}${c.familyStatus === 'married' && c.marriageYear ? ` מ-${c.marriageYear}` : ''}${c.familyStatus === 'married' && (c.spouseFirstName || c.spouse?.firstName) ? ` · ${c.spouseFirstName || c.spouse?.firstName}` : ''}`];
    case 'intake.children':
      return (c.children ?? []).map(ch => `${ch.firstName || 'ילד/ה'} — נולד/ה ב-${ch.birthYear}`);
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
export function promptFor(s: ItemStatus, ctx: AskCtx): AskPrompt {
  const it = s.item;
  const c = ctx.client;
  const subjName = s.subjectRole === 'spouse' ? (c.spouseFirstName || c.spouse?.firstName || 'בן/בת הזוג') : undefined;
  const fill = (t: string) => fillTemplate(t, c, s.subjectRole)
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
  const people: Record<string, string> = { clientName: c.firstName || 'אני', ...(c.familyStatus === 'married' ? { spouseName: c.spouseFirstName || c.spouse?.firstName || 'בן/בת הזוג', married: '1' } : {}) };
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
      ...base, title: `${fillP(qText ?? it.label)}${periodText && listOrTimed(it.key) ? ` ${periodText}` : ''} — זה מה שידוע לנו`,
      input: { kind: 'confirm', lines: lines.length ? lines : ['אין אצלנו פרטים'], ...(schema ? { edit: { schema, initial, context: people } } : {}) },
    };
  }
  if (it.kind === 'document' && it.docKind) return { ...base, title: fillP(qText ?? DOCS[it.docKind].label), input: { kind: 'file', docKind: it.docKind } };
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
export function buildAskPlan(statuses: ItemStatus[], ctx: AskCtx): AskPlanEntry[] {
  const c = ctx.client;
  const out: AskPlanEntry[] = [];
  const used = new Set<ItemStatus>();
  const married = c.familyStatus === 'married';
  for (const s of statuses) {
    if (used.has(s)) continue;
    const pair = married && s.item.coupleQuestion && s.item.per === 'person' && !s.entityRef
      ? statuses.find(o => o !== s && o.item.key === s.item.key && !o.entityRef && o.subjectRole !== s.subjectRole && (o.subjectRole === 'client' || o.subjectRole === 'spouse'))
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
  return out;
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
  | { kind: 'record'; value: unknown; none?: boolean; assertion?: 'changed'; was?: string[] };

export interface AnswerResult {
  facts: Omit<YearFact, 'id' | 'createdAt'>[];
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
export function answerToFacts(ask: InfoAsk, answer: AskAnswer, ctx: AskCtx, today: string): AnswerResult {
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

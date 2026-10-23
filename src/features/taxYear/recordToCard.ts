// ─── 13.10.2026 · תשובה מובנית ← עדכון בתיק (ילדים, חשבון בנק, מעסיקים, כתובת, תאריכי ישות) ──────────────────
// ‼ התשובה של הלקוח אינה כותבת לכרטיס. המשרד מאשר, ורק אז נבנית הצעה עם תמונת המצב שהלקוח ראה (old_value):
//   הכרטיס השתנה בינתיים ⇒ ההצעה נשארת ממתינה בתיק המס, לא נדרסת (apply_tax_facts).
// ‼ השמטה אינה מחיקה: ילד, חשבון או מעסיק שהיו בתיק ולא הופיעו בתשובה — מוצגים למשרד, שמכריע לכל אחד במפורש:
//   להשאיר, לתקן, «נרשם בטעות» (יוצא מהרשימה) או לסיים תוקף (חשבון נסגר / העבודה הסתיימה). ההכרעה נכנסת לאותה
//   הצעה, והערך הקודם נשמר בהיסטוריית התיק (tax_fact_changes.old_value). בלי הכרעה — נשאר כפי שהוא.
// ‼ אין כפילות: פריט מהתיק חוזר עם אותו מזהה (initialFromCard), ולכן עדכון שלו אינו הוספה.
// ‼ טקסט חופשי ישן אינו מפוענח — רק רשומה מובנית (value.items / value.record.items) נכנסת לכאן.

import { composeAddress } from '../../utils/ilAddress';
import type { BankAccountInfo, Child, Client, EmployerInfo } from '../../types';
import type { ProposedFact } from '../../types/taxFacts';
import type { DatedValue } from './temporal';
import { RECORD_OF } from './structured';
import { CUSTODY_OF_LIVES, type RecordValue } from './records';

type From = { factId: string; itemKey: string; year: number };

/** הרשומות שבתשובה, אם זו תשובה מובנית (כולל «משהו השתנה» עם רשומה). */
export function recordItems(value: unknown): RecordValue[] | null {
  if (!value || typeof value !== 'object') return null;
  const v = value as { items?: unknown; record?: { items?: unknown }; changed?: boolean };
  const list = Array.isArray(v.items) ? v.items : v.changed && v.record && Array.isArray(v.record.items) ? v.record.items : null;
  return list ? (list.filter(x => x && typeof x === 'object') as RecordValue[]) : null;
}

const s = (v: unknown) => (typeof v === 'string' ? v.trim() : v == null ? '' : String(v));
const he = (iso?: string) => (iso ?? '').slice(0, 10).split('-').reverse().join('.');
const newId = (p: string) => `${p}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
const snap = (c: Client, k: string) => (c as unknown as Record<string, unknown>)[k];
const dated = (v: unknown): string => {
  const d = v as DatedValue | undefined;
  return d && d.date && d.precision !== 'unknown' ? d.date.slice(0, 10) : '';
};
const isoDay = (v: string) => /^\d{4}-\d{2}-\d{2}$/.test(v);

export type OmittedKind = 'child' | 'bank' | 'employer';

/** פריט שהיה בתיק ולא הופיע בתשובה. */
export interface Omitted {
  id: string;
  kind: OmittedKind;
  label: string;
  /** אילו הכרעות אפשריות לסוג הזה. */
  can: OmitAction[];
  /** שדות לתיקון (ערכים נוכחיים). */
  fields: { key: string; label: string; value: string; type: 'text' | 'date' | 'digits' }[];
}

export type OmitAction = 'keep' | 'fix' | 'error' | 'end';
export type OmitDecision =
  | { action: 'keep' }
  | { action: 'error' }
  | { action: 'end'; date: string }
  | { action: 'fix'; patch: Record<string, string> };

export const OMIT_LABEL: Record<OmitAction, string> = {
  keep: 'להשאיר בתיק כמו שהוא', fix: 'לתקן פרטים', error: 'נרשם בטעות — להוציא מהתיק', end: 'לסיים תוקף',
};
export const END_LABEL: Record<OmittedKind, string> = { child: '', bank: 'החשבון נסגר', employer: 'העבודה הסתיימה' };

export interface CardUpdatePlan {
  proposals: ProposedFact[];
  /** מה יקרה, בעברית — למשרד, לפני האישור. */
  lines: string[];
  /** מה שהיה בתיק ולא הופיע בתשובה — ממתין להכרעה מפורשת. */
  omitted: Omitted[];
}

/**
 * ‼ 290 · תשובה שאינה רשומה ובכל זאת מעדכנת את התיק: כן/לא (מזונות לבן/בת זוג לשעבר — 40א) ובחירה (סעיף 37 — בן/בת זוג בלי הכנסה).
 *   ל«לא» אין ערך בעובדה (value = null) — וגם הוא נכתב: «לא» ≠ «לא ידוע».
 */
const SIMPLE_CARD: Record<string, (c: Client, value: unknown, from: From, spouse: boolean) => CardUpdatePlan | null> = {
  'household.alimonyPaid': (c, v, from, spouse) => alimonyPlan(c, v, from, spouse),
  'household.noIncomeSpouse': (c, v, from) => noIncomePlan(c, v, from),
};
/** סכמות רשומה שמעדכנות את התיק. */
const CARD_SCHEMAS = ['children', 'bank', 'address', 'employer', 'familyYear', 'studies', 'aliyah', 'disability', 'spouseBasics', 'reserveDays', 'childDisability', 'childSupport'];
/** פרטים שאינם ישות חדשה (מותר שהמפתח יסתיים ב-Details). */
const NOT_ENTITY = ['aliyah', 'disability', 'childDisability'];

/** איזה פריט יודע לעדכן את התיק. */
export const updatesCard = (itemKey: string) => !!SIMPLE_CARD[itemKey] || (CARD_SCHEMAS.includes(RECORD_OF[itemKey] ?? '')
  // ‼ «מעסיק חדש» (פרטי ישות שנולדה מ«כן») נכנס לתיק ב«הוסף לתיק» עם אותו מזהה זמני — לא כאן, כדי לא להוסיף פעמיים.
  //   290: פרטי עלייה ונכות אינם ישות — הם כן כאן.
  && (!/Details$/.test(itemKey) || NOT_ENTITY.includes(RECORD_OF[itemKey] ?? '')));

export function cardUpdateFor(c: Client, itemKey: string, value: unknown, from: From, subjectRole: string = 'client', decisions: Record<string, OmitDecision> = {}): CardUpdatePlan | null {
  const simple = SIMPLE_CARD[itemKey];
  if (simple) return simple(c, value, from, subjectRole === 'spouse');
  const schema = RECORD_OF[itemKey];
  const items = recordItems(value);
  if (!items) return null;
  if (schema === 'children') return childrenPlan(c, items, from, decisions);
  if (schema === 'employer') return employerPlan(c, items, from, subjectRole === 'spouse', decisions);
  if (!items.length) return null;
  if (schema === 'bank') return bankPlan(c, items[0], from, decisions);
  if (schema === 'address') return addressPlan(c, items[0], from);
  if (schema === 'familyYear') return familyYearPlan(c, itemKey, items[0], from);
  if (schema === 'studies') return studiesPlan(c, items, from, subjectRole === 'spouse');
  if (schema === 'aliyah') return aliyahPlan(c, items[0], from, subjectRole === 'spouse');
  if (schema === 'disability') return disabilityPlan(c, items[0], from, subjectRole === 'spouse');
  if (schema === 'spouseBasics') return spouseBasicsPlan(c, items[0], from);
  if (schema === 'reserveDays') return reservePlan(c, items[0], from, subjectRole === 'spouse');
  if (schema === 'childDisability') return childDisabilityPlan(c, items, from);
  if (schema === 'childSupport') return childSupportPlan(c, items, from);
  return null;
}

/** החלת ההכרעות על השמטות — משותף לכל הרשימות. */
function applyOmissions<T extends { id: string }>(list: T[], omitted: Omitted[], decisions: Record<string, OmitDecision>, end: (x: T, date: string) => T, fix: (x: T, patch: Record<string, string>) => T, lines: string[]): T[] {
  let out = list;
  for (const o of omitted) {
    const d = decisions[o.id];
    if (!d || d.action === 'keep') continue;
    if (d.action === 'error') { out = out.filter(x => x.id !== o.id); lines.push(`יוצא מהתיק — נרשם בטעות: ${o.label}`); }
    else if (d.action === 'end' && o.can.includes('end') && isoDay(d.date)) { out = out.map(x => (x.id === o.id ? end(x, d.date) : x)); lines.push(`${END_LABEL[o.kind]}: ${o.label} — ${he(d.date)}`); }
    else if (d.action === 'fix') {
      const patch = Object.fromEntries(Object.entries(d.patch).map(([k, v]) => [k, s(v)]).filter(([k, v]) => o.fields.some(f => f.key === k && f.value !== v)));
      if (Object.keys(patch).length) { out = out.map(x => (x.id === o.id ? fix(x, patch) : x)); lines.push(`תיקון: ${o.label} — ${Object.entries(patch).map(([k, v]) => `${o.fields.find(f => f.key === k)?.label}: ${k.endsWith('Date') ? he(String(v)) : String(v)}`).join(', ')}`); }
    }
  }
  return out;
}

function childrenPlan(c: Client, items: RecordValue[], from: From, decisions: Record<string, OmitDecision>): CardUpdatePlan {
  const current = (c.children ?? []) as Child[];
  const lines: string[] = [];
  let next: Child[] = current.map(ch => ({ ...ch }));
  for (const r of items) {
    const birthDate = s(r.birthDate).slice(0, 10);
    const firstName = s(r.firstName);
    if (!firstName || !isoDay(birthDate)) continue;
    const livesWith = s(r.livesWith);
    // ‼ 290 · «איפה גר/ה» ⇒ גם המשמורת (Child.custody) — ממנה החישוב קובע את מסלול נקודות הילדים של הורה שאינו נשוי (40(ב))
    const custody = CUSTODY_OF_LIVES[livesWith];
    const lives = custody ? { livesWithTaxpayer: livesWith === 'withUs' || livesWith === 'shared', custody } : {};
    const i = r.id ? next.findIndex(x => x.id === r.id) : -1;
    if (i >= 0) {
      const was = next[i];
      const sameLives = !custody || (was.livesWithTaxpayer === lives.livesWithTaxpayer && was.custody === custody);
      if (was.firstName === firstName && was.birthDate === birthDate && sameLives) continue;
      next[i] = { ...was, firstName, birthDate, birthYear: Number(birthDate.slice(0, 4)), ...lives };
      lines.push(`עדכון: ${was.firstName || 'ילד/ה'}${was.birthDate !== birthDate ? ` — תאריך לידה ${was.birthDate ? he(was.birthDate) : '—'} ← ${he(birthDate)}` : ''}${was.firstName !== firstName ? ` — שם ← ${firstName}` : ''}${!sameLives ? ` — גר/ה: ${LIVES_HE[livesWith]}` : ''}`);
    } else {
      // ‼ ילד «חדש» עם אותו שם ותאריך לידה כמו ילד קיים — אותו ילד, לא כפילות
      if (next.some(x => x.firstName === firstName && x.birthDate === birthDate)) continue;
      next.push({ id: newId('child'), firstName, birthDate, birthYear: Number(birthDate.slice(0, 4)), hasDisability: false, ...lives });
      lines.push(`נוסף: ${firstName}, נולד/ה ${he(birthDate)}${custody ? ` — גר/ה: ${LIVES_HE[livesWith]}` : ''}`);
    }
  }
  const answered = new Set(items.map(r => s(r.id)).filter(Boolean));
  // ‼ ילד לא מסתיים «בתוקף» — הוא נשאר, מתוקן, או יוצא כי נרשם בטעות
  const omitted: Omitted[] = current.filter(ch => !answered.has(ch.id)).map(ch => ({
    id: ch.id, kind: 'child', label: `${ch.firstName || 'ילד/ה'}${ch.birthDate ? `, נולד/ה ${he(ch.birthDate)}` : ch.birthYear ? `, נולד/ה ${ch.birthYear}` : ''}`,
    can: ['keep', 'fix', 'error'],
    fields: [{ key: 'firstName', label: 'שם פרטי', value: ch.firstName ?? '', type: 'text' }, { key: 'birthDate', label: 'תאריך לידה', value: ch.birthDate ?? '', type: 'date' }],
  }));
  next = applyOmissions(next, omitted, decisions, x => x, (x, p) => ({ ...x, ...p, ...(p.birthDate && isoDay(p.birthDate) ? { birthYear: Number(p.birthDate.slice(0, 4)) } : {}) }), lines);
  return finish('children', 'ילדים', c, current, next, lines, omitted, from, `${current.length} ילדים`);
}

function employerPlan(c: Client, items: RecordValue[], from: From, spouse: boolean, decisions: Record<string, OmitDecision>): CardUpdatePlan {
  const all = (c.employers ?? []) as EmployerInfo[];
  const mine = all.filter(e => !!e.belongsToSpouse === spouse && !e.endDate);
  const lines: string[] = [];
  let next: EmployerInfo[] = all.map(e => ({ ...e }));
  for (const r of items) {
    const name = s(r.name);
    if (!name) continue;
    const start = dated(r.startDate), end = dated(r.endDate);
    const i = r.id ? next.findIndex(x => x.id === r.id) : -1;
    if (i >= 0) {
      const was = next[i];
      const patch: Partial<EmployerInfo> = {};
      if (was.name !== name) patch.name = name;
      if (start && was.startDate?.slice(0, 10) !== start) patch.startDate = start;
      if (end && was.endDate?.slice(0, 10) !== end) patch.endDate = end;
      if (s(r.role) && was.role !== s(r.role)) patch.role = s(r.role);
      if (!Object.keys(patch).length) continue;
      next[i] = { ...was, ...patch };
      lines.push(`עדכון: ${was.name}${patch.name ? ` ← ${name}` : ''}${patch.startDate ? ` · מ-${he(start)}` : ''}${patch.endDate ? ` · הסתיים ${he(end)}` : ''}`);
    } else {
      if (next.some(x => !!x.belongsToSpouse === spouse && x.name === name && !x.endDate)) continue;
      next.push({ id: newId('emp'), name, ...(start ? { startDate: start } : {}), ...(end ? { endDate: end } : {}), ...(s(r.role) ? { role: s(r.role) } : {}), ...(spouse ? { belongsToSpouse: true } : {}) });
      lines.push(`נוסף: ${name}${start ? ` · מ-${he(start)}` : ''}`);
    }
  }
  const answered = new Set(items.map(r => s(r.id)).filter(Boolean));
  const omitted: Omitted[] = mine.filter(e => !answered.has(e.id)).map(e => ({
    id: e.id, kind: 'employer', label: `${e.name}${e.startDate ? ` (מ-${he(e.startDate)})` : ''}`,
    can: ['keep', 'fix', 'error', 'end'],
    fields: [{ key: 'name', label: 'שם המעסיק', value: e.name, type: 'text' }, { key: 'startDate', label: 'ממתי', value: e.startDate?.slice(0, 10) ?? '', type: 'date' }],
  }));
  next = applyOmissions(next, omitted, decisions, (x, date) => ({ ...x, endDate: date }), (x, p) => ({ ...x, ...p }), lines);
  return finish('employers', 'מעסיקים', c, all, next, lines, omitted, from, `${mine.length} מעסיקים פעילים`);
}

function bankPlan(c: Client, r: RecordValue, from: From, decisions: Record<string, OmitDecision>): CardUpdatePlan | null {
  const current = (c.bankAccounts ?? []) as BankAccountInfo[];
  const foreign = r.foreign === 'yes';
  const fields: Partial<BankAccountInfo> & { bankCode?: string; country?: string; owners?: string } = foreign
    ? { bankName: s(r.bankName), accountNumber: s(r.iban), country: s(r.country), notes: `חשבון בחו״ל · ${s(r.country)}` }
    : { bankName: s(r.bankName) || `בנק ${s(r.bankCode)}`, bankCode: s(r.bankCode), branchNumber: s(r.branchCode), branchName: s(r.branchName) || undefined, accountNumber: s(r.accountNumber) };
  if (r.owners) fields.owners = s(r.owners);
  if (!fields.bankName || !fields.accountNumber) return null;
  const digits = (v: unknown) => s(v).replace(/^0+/, '');
  const same = (b: BankAccountInfo) => digits(b.accountNumber) === digits(fields.accountNumber) && (foreign || digits(b.branchNumber) === digits(fields.branchNumber));
  const byId = r.id ? current.find(b => b.id === r.id) : undefined;
  const match = byId && same(byId) ? byId : current.find(same);
  const lines: string[] = [];
  let next: BankAccountInfo[];
  if (match) {
    const merged = { ...match, ...fields, isPrimary: true };
    const changed = JSON.stringify(merged) !== JSON.stringify({ ...match, isPrimary: true }) || !match.isPrimary;
    next = current.map(b => (b.id === match.id ? merged : { ...b, isPrimary: false }));
    if (changed) lines.push(`החשבון להחזרים: ${fields.bankName}${fields.branchNumber ? ` · סניף ${fields.branchNumber}` : ''} · חשבון ${fields.accountNumber}`);
  } else {
    next = [...current.map(b => ({ ...b, isPrimary: false })), { id: newId('bank'), ...fields, isPrimary: true } as BankAccountInfo];
    lines.push(`חשבון חדש להחזרים: ${fields.bankName}${fields.branchNumber ? ` · סניף ${fields.branchNumber}` : ''} · חשבון ${fields.accountNumber}`);
  }
  // ‼ החשבון שהיה להחזרים (או היחיד בתיק) — לא נמחק; המשרד מכריע: נשאר (לא להחזרים), תיקון, טעות, או «נסגר»
  const omitted: Omitted[] = current.filter(b => b.id !== match?.id && !b.closedAt && (b.isPrimary || current.length === 1)).map(b => ({
    id: b.id, kind: 'bank', label: `${b.bankName}${b.branchNumber ? ` · סניף ${b.branchNumber}` : ''}${b.accountNumber ? ` · חשבון ${b.accountNumber}` : ''}${b.isPrimary ? ' (היה החשבון להחזרים)' : ''}`,
    can: ['keep', 'fix', 'error', 'end'],
    fields: [{ key: 'bankName', label: 'בנק', value: b.bankName, type: 'text' }, { key: 'branchNumber', label: 'סניף', value: b.branchNumber ?? '', type: 'digits' }, { key: 'accountNumber', label: 'חשבון', value: b.accountNumber ?? '', type: 'digits' }],
  }));
  next = applyOmissions(next, omitted, decisions, (x, date) => ({ ...x, isPrimary: false, closedAt: date }), (x, p) => ({ ...x, ...p }), lines);
  if (!lines.length) lines.push('החשבון כבר רשום בתיק כחשבון להחזרים');
  return finish('bankAccounts', 'חשבון בנק להחזרים', c, current, next, lines, omitted, from, current.map(b => b.bankName).join(', ') || 'אין');
}

function finish<T>(fieldKey: string, title: string, c: Client, current: T[], next: T[], lines: string[], omitted: Omitted[], from: From, oldDisplay: string): CardUpdatePlan {
  const changed = JSON.stringify(current) !== JSON.stringify(next);
  return {
    proposals: changed ? [{
      fieldKey, label: `${title} — מתשובה מאושרת`,
      oldValue: { display: oldDisplay, patch: { [fieldKey]: snap(c, fieldKey) ?? [] } },
      newValue: { display: lines.join(' · '), patch: { [fieldKey]: next } },
      note: `תשובה מאושרת (${from.itemKey}, ${from.year}); עובדה ${from.factId}`,
    }] : [],
    lines: changed ? lines : lines.length ? lines : [`אין שינוי ב${title}`],
    omitted,
  };
}

function addressPlan(c: Client, r: RecordValue, from: From): CardUpdatePlan | null {
  const city = s(r.city);
  // אותו פורמט כמו הטופס (ilAddress) — השרת מפרק ממנו רחוב, מספר ודירה (285)
  const street = composeAddress(s(r.street), s(r.houseNumber), s(r.apartment));
  const zip = s(r.zip);
  if (!city || !street) return null;
  const want: Record<string, string> = { city, address: street, ...(zip ? { zipCode: zip } : {}) };
  const LABEL: Record<string, string> = { city: 'יישוב', address: 'כתובת', zipCode: 'מיקוד' };
  const proposals: ProposedFact[] = [];
  const lines: string[] = [];
  for (const [k, v] of Object.entries(want)) {
    const cur = s(snap(c, k));
    if (cur === v) continue;
    proposals.push({
      fieldKey: k, label: `${LABEL[k]} — מתשובה מאושרת`,
      oldValue: { display: cur || '—', patch: { [k]: snap(c, k) ?? null } },
      newValue: { display: v, patch: { [k]: v } },
      note: `תשובה מאושרת (${from.itemKey}, ${from.year}); עובדה ${from.factId}`,
    });
    lines.push(`${LABEL[k]}: ${cur || '—'} ← ${v}`);
  }
  return { proposals, lines: lines.length ? lines : ['הכתובת זהה למה שבתיק'], omitted: [] };
}

// ‼ 288 · «לימודים וצבא» ⇒ התיק: תואר + שנה, שחרור + חודש + חודשי שירות. לבעל/ת התיק — עובדות מנוהלות;
//   לבן/בת הזוג — הצעה אחת «spouse» שממוזגת לתוך האובייקט (288). לימודי מקצוע — אין שדה בתיק: שורה למשרד.
function studiesPlan(c: Client, items: RecordValue[], from: From, spouse: boolean): CardUpdatePlan | null {
  const want: Record<string, unknown> = {};
  const lines: string[] = [];
  const degrees = items.filter(r => ['ba', 'ma'].includes(s(r.kind)) && Number(r.year) > 0).sort((a, b) => Number(b.year) - Number(a.year));
  if (degrees[0]) Object.assign(want, { hasAcademicDegree: true, academicDegreeType: s(degrees[0].kind) === 'ma' ? 'master' : 'bachelor', academicDegreeYear: Number(degrees[0].year) });
  const army = items.find(r => s(r.kind) === 'army' && Number(r.year) > 0);
  if (army) {
    const idf = s(army.branch) !== 'national';
    Object.assign(want, idf
      ? { completedIdf: true, idfReleaseYear: Number(army.year), completedNationalService: false }
      : { completedNationalService: true, nationalServiceYear: Number(army.year), completedIdf: false });
    if (Number(army.month) >= 1) want.idfReleaseMonth = Number(army.month);
    if (Number(army.months) > 0) want.serviceMonths = Number(army.months);
  }
  if (items.some(r => s(r.kind) === 'pro')) lines.push('לימודי מקצוע — אין להם שדה בתיק; לבדוק את הזכאות (סעיף 40ג) ידנית');
  return personPlan(c, want, from, spouse, 'לימודים ושירות', lines);
}

const PERSON_HE: Record<string, string> = { hasAcademicDegree: 'תואר', academicDegreeType: 'סוג התואר', academicDegreeYear: 'שנת התואר', completedIdf: 'שירות צבאי',
  idfReleaseYear: 'שנת השחרור', completedNationalService: 'שירות לאומי', nationalServiceYear: 'שנת סיום השירות', idfReleaseMonth: 'חודש השחרור', serviceMonths: 'חודשי שירות',
  isNewImmigrant: 'עולה חדש/ה', aliyahYear: 'שנת העלייה', aliyahMonth: 'חודש העלייה', isReturningResident: 'תושב/ת חוזר/ת', returningYear: 'שנת החזרה',
  disabilityPercentage: 'אחוזי נכות', paysAlimonyToEx: 'מזונות לבן/בת זוג לשעבר', gender: 'מין', birthDate: 'תאריך לידה',
  reserveCombatDaysPrevYear: 'ימי מילואים כלוחם/ת (שנה קודמת)', spouseNoIncomeEligible: 'בן/בת זוג בלי הכנסה (סעיף 37)' };
const showV = (v: unknown) => (v === true ? 'כן' : v === false ? 'לא' : v === 'female' ? 'אישה' : v === 'male' ? 'גבר' : v == null || v === '' ? '—' : String(v));

/**
 * ‼ 288/290 · עובדות של אדם ⇒ הצעות. לבעל/ת התיק — עובדה מנוהלת לכל שדה; לבן/בת הזוג — הצעה אחת «spouse» שממוזגת
 *   לתוך האובייקט (288). אין עדיין אובייקט spouse ⇒ נזרעים השם והת.ז. מהעמודות השטוחות, כדי שלא ייווצר בן/בת זוג בלי שם.
 */
function personPlan(c: Client, want: Record<string, unknown>, from: From, spouse: boolean, what: string, lines: string[] = []): CardUpdatePlan {
  const base = (spouse ? c.spouse ?? {} : c) as unknown as Record<string, unknown>;
  const changed = Object.entries(want).filter(([k, v]) => base[k] !== v);
  if (!changed.length) return { proposals: [], lines: lines.length ? lines : ['זהה למה שבתיק'], omitted: [] };
  for (const [k, v] of changed) lines.push(`${spouse ? 'בן/בת הזוג · ' : ''}${PERSON_HE[k] ?? k}: ${showV(base[k])} ← ${showV(v)}`);
  const note = `תשובה מאושרת (${from.itemKey}, ${from.year}); עובדה ${from.factId}`;
  const seed: Record<string, string> = {};
  if (spouse && !c.spouse) {
    for (const [k, v] of [['firstName', c.spouseFirstName], ['lastName', c.spouseLastName], ['idNumber', c.spouseIdNumber]] as const) if (s(v)) seed[k] = s(v);
  }
  const proposals: ProposedFact[] = spouse
    ? [{ fieldKey: 'spouse', label: `פרטי בן/בת הזוג — ${what}, מתשובה מאושרת`,
        oldValue: { display: 'לפני העדכון', patch: { spouse: c.spouse ?? null } },
        newValue: { display: changed.map(([k, v]) => `${PERSON_HE[k] ?? k}: ${showV(v)}`).join(', '), patch: { spouse: { ...seed, ...Object.fromEntries(changed) } } }, note }]
    : changed.map(([k, v]) => ({ fieldKey: k, label: `${PERSON_HE[k] ?? k} — מתשובה מאושרת`,
        oldValue: { display: showV(base[k]), patch: { [k]: base[k] ?? null } }, newValue: { display: showV(v), patch: { [k]: v } }, note }));
  return { proposals, lines, omitted: [] };
}

const LIVES_HE: Record<string, string> = { withUs: 'איתנו', otherParent: 'אצל ההורה השני', shared: 'משמורת משותפת' };

// ‼ 290 · עלייה או חזרה ⇒ עולה + שנה + חודש (סעיף 35 סופר חודשי ותק), או תושב/ת חוזר/ת + שנה. המעמד השני לא נמחק בשקט.
function aliyahPlan(c: Client, r: RecordValue, from: From, spouse: boolean): CardUpdatePlan | null {
  const y = Number(s(r.year)), m = Number(s(r.month));
  if (!Number.isInteger(y) || y < 1900) return null;
  const status = s(r.status);
  const want: Record<string, unknown> = status === 'returning' ? { isReturningResident: true, returningYear: y }
    : status === 'immigrant' ? { isNewImmigrant: true, aliyahYear: y, ...(m >= 1 && m <= 12 ? { aliyahMonth: m } : {}) } : {};
  if (!Object.keys(want).length) return null;
  const d = (spouse ? c.spouse : c) as { isNewImmigrant?: boolean; isReturningResident?: boolean } | null | undefined;
  const lines = status === 'returning' && d?.isNewImmigrant ? ['בתיק רשום/ה גם כעולה — לבדוק איזה מעמד נכון']
    : status === 'immigrant' && d?.isReturningResident ? ['בתיק רשום/ה גם כתושב/ת חוזר/ת — לבדוק איזה מעמד נכון'] : [];
  return personPlan(c, want, from, spouse, 'עלייה', lines);
}

// ‼ 290 · אחוזי נכות ⇒ disabilityPercentage. «ממתי» אין לו שדה בתיק — שורה למשרד כשהנכות התחילה בשנת הדוח (9(5): 185 יום).
function disabilityPlan(c: Client, r: RecordValue, from: From, spouse: boolean): CardUpdatePlan | null {
  if (s(r.determined) !== 'yes') return { proposals: [], lines: ['עוד לא נקבעו אחוזי נכות — אין מה לעדכן בתיק'], omitted: [] };
  const pct = Number(s(r.percent));
  if (!(pct > 0 && pct <= 100)) return null;
  const m = Number(s(r.month));
  const lines = Number(s(r.year)) === from.year ? [`הנכות מ-${m >= 1 ? `${String(m).padStart(2, '0')}/` : ''}${from.year} — לבדוק את תקופת הפטור (9(5))`] : [];
  return personPlan(c, { disabilityPercentage: pct }, from, spouse, 'נכות', lines);
}

// ‼ 290 · סעיף 40א — רק לנשואים (נשוי/אה בשנית). «כן» ⇒ true, «לא» (value = null) ⇒ false.
function alimonyPlan(c: Client, value: unknown, from: From, spouse: boolean): CardUpdatePlan | null {
  if (c.familyStatus !== 'married') return null;
  const yes = value === true || (!!value && typeof value === 'object' && (value as { yes?: unknown }).yes === true);
  if (!yes && value != null && value !== false) return null;
  return personPlan(c, { paysAlimonyToEx: yes }, from, spouse, 'מזונות לבן/בת זוג לשעבר');
}

// ‼ 290 · מין ותאריך לידה של בן/בת הזוג ⇒ clients.spouse (בלי מין הזיכויים שלהם לא מחושבים; תאריך הלידה — נקודת «נער/ה»).
function spouseBasicsPlan(c: Client, r: RecordValue, from: From): CardUpdatePlan | null {
  if (c.familyStatus !== 'married') return null;
  const gender = s(r.gender), birthDate = s(r.birthDate).slice(0, 10);
  const want: Record<string, unknown> = { ...(gender === 'female' || gender === 'male' ? { gender } : {}), ...(isoDay(birthDate) ? { birthDate } : {}) };
  if (!Object.keys(want).length) return null;
  return personPlan(c, want, from, true, 'מין ותאריך לידה');
}

// ‼ 290 · סעיף 39ב — ימי מילואים כלוחם/ת בשנה שלפני ⇒ reserveCombatDaysPrevYear (לבן/בת הזוג — במיזוג).
function reservePlan(c: Client, r: RecordValue, from: From, spouse: boolean): CardUpdatePlan | null {
  const days = Number(s(r.days));
  if (!Number.isInteger(days) || days < 0 || days > 366) return null;
  return personPlan(c, { reserveCombatDaysPrevYear: days }, from, spouse, 'מילואים');
}

// ‼ 290 · סעיף 37 — בחירה אחת: גיל פרישה / עיוור / נכה ⇒ זכאות; «אף אחד» / «הייתה הכנסה» ⇒ לא זכאי («לא» ≠ «לא ידוע»).
function noIncomePlan(c: Client, value: unknown, from: From): CardUpdatePlan | null {
  if (c.familyStatus !== 'married' || typeof value !== 'string') return null;
  const yes = ['retirement', 'blind', 'disabled'].includes(value);
  if (!yes && !['none', 'hadIncome'].includes(value)) return null;
  const lines = yes ? [`לבדוק אישור — ${value === 'retirement' ? 'גיל הפרישה' : value === 'blind' ? 'עיוורון' : 'נכות'}`] : [];
  return personPlan(c, { spouseNoIncomeEligible: yes }, from, false, 'סעיף 37', lines);
}

const kidName = (k: Child) => k.firstName || (k.birthYear ? `ילד/ה ${k.birthYear}` : 'ילד/ה');

// ‼ 290 · סעיף 45 — ילד עם מוגבלות ⇒ hasDisability; לזוג — למי הנקודות (disabilityPointsTo, יחסית לכרטיס). לא מוריד סימון קיים.
function childDisabilityPlan(c: Client, items: RecordValue[], from: From): CardUpdatePlan {
  const current = (c.children ?? []) as Child[];
  const married = c.familyStatus === 'married';
  const lines: string[] = [];
  const next = current.map(k => ({ ...k }));
  for (const r of items) {
    const k = next.find(x => x.id === s(r.child));
    if (!k) { lines.push('ילד שלא בתיק — להוסיף אותו קודם לרשימת הילדים'); continue; }
    const to = married && (r.pointsTo === 'client' || r.pointsTo === 'spouse') ? r.pointsTo : undefined;
    if (k.hasDisability && (!to || k.disabilityPointsTo === to)) continue;
    k.hasDisability = true;
    if (to) k.disabilityPointsTo = to;
    lines.push(`${kidName(k)} — ילד/ה עם מוגבלות${to ? ` · הנקודות ל${to === 'spouse' ? (c.spouseFirstName || c.spouse?.firstName || 'בן/בת הזוג') : (c.firstName || 'בעל/ת התיק')}` : ''}`);
  }
  return finish('children', 'ילדים', c, current, next, lines, [], from, `${current.filter(k => k.hasDisability).length} ילדים עם מוגבלות`);
}

// ‼ 290 · מזונות ילדים ששולמו ⇒ Child.monthlyAlimonyPaid (לכל ילד, בחודש) — «משתתף בכלכלת ילדיו».
function childSupportPlan(c: Client, items: RecordValue[], from: From): CardUpdatePlan {
  const current = (c.children ?? []) as Child[];
  const lines: string[] = [];
  const next = current.map(k => ({ ...k }));
  for (const r of items) {
    const k = next.find(x => x.id === s(r.child));
    const amt = Number(s(r.monthly));
    if (!k) { lines.push('ילד שלא בתיק — להוסיף אותו קודם לרשימת הילדים'); continue; }
    if (!(amt >= 0) || k.monthlyAlimonyPaid === amt) continue;
    k.monthlyAlimonyPaid = amt;
    lines.push(`${kidName(k)} — מזונות ${amt.toLocaleString('he-IL')} ₪ בחודש`);
  }
  return finish('children', 'ילדים', c, current, next, lines, [], from, `${current.filter(k => (k.monthlyAlimonyPaid ?? 0) > 0).length} ילדים עם מזונות`);
}

// ‼ 16.10.2026 · ממתי המצב המשפחתי: intake.marriageYear ⇒ marriageYear (וכו׳) — שם השדה הוא סוף מפתח הפריט.
//   עובדה מנוהלת (249ג + GOVERNED_FACT_KEYS) — לכן apply_tax_facts יכולה לכתוב אותה עם הערך הקודם.
const FAMILY_YEAR_HE: Record<string, string> = { marriageYear: 'שנת הנישואין', divorceYear: 'שנת הגירושין', widowhoodYear: 'שנת הפטירה' };
function familyYearPlan(c: Client, itemKey: string, r: RecordValue, from: From): CardUpdatePlan | null {
  const field = itemKey.replace(/^intake[.]/, '');
  const label = FAMILY_YEAR_HE[field];
  const y = Number(s(r.year));
  if (!label || !Number.isInteger(y) || y < 1900) return null;
  const cur = snap(c, field);
  if (cur === y) return { proposals: [], lines: [label + ' זהה למה שבתיק'], omitted: [] };
  return {
    proposals: [{
      fieldKey: field, label: label + ' — מתשובה מאושרת',
      oldValue: { display: cur == null ? '—' : String(cur), patch: { [field]: cur ?? null } },
      newValue: { display: String(y), patch: { [field]: y } },
      note: 'תשובה מאושרת (' + from.itemKey + ', ' + from.year + '); עובדה ' + from.factId,
    }],
    lines: [label + ': ' + (cur == null ? '—' : String(cur)) + ' ← ' + y], omitted: [],
  };
}

// ── תחולה: «בחלק מהשנה, מ… עד…» ← תאריכי הישות בתיק ──────────────────────────────────────
// ‼ רק כשהלקוח נתן תאריך (גם משוער). «כל השנה» / «לא» אינם תאריך — לא נכתב דבר.
export function periodDatesPatch(c: Client, entityKind: string | undefined, entityRef: string | undefined, value: unknown): { kind: 'properties' | 'investmentAccounts'; id: string; patch: Record<string, unknown>; text: string } | null {
  if (!entityRef || !value || typeof value !== 'object') return null;
  const v = value as { inPeriod?: string; from?: DatedValue; to?: DatedValue };
  const fromD = v.from?.date && v.from.precision !== 'unknown' ? v.from : undefined;
  const toD = v.to?.date && v.to.precision !== 'unknown' ? v.to : undefined;
  if (!fromD && !toD) return null;
  const isProp = entityKind === 'property' || (c.properties ?? []).some(p => p.id === entityRef);
  if (isProp) {
    if (!(c.properties ?? []).some(p => p.id === entityRef)) return null;
    const patch: Record<string, unknown> = {};
    if (fromD) Object.assign(patch, { purchaseDate: fromD.date, purchasePrecision: fromD.precision });
    if (toD) Object.assign(patch, { soldDate: toD.date, soldPrecision: toD.precision, isSold: true });
    return { kind: 'properties', id: entityRef, patch, text: [fromD && `נרכש ${he(fromD.date)}`, toD && `נמכר ${he(toD.date)}`].filter(Boolean).join(' · ') };
  }
  if (!(c.investmentAccounts ?? []).some(a => a.id === entityRef)) return null;
  const patch: Record<string, unknown> = {};
  if (fromD) Object.assign(patch, { openedDate: fromD.date, openedPrecision: fromD.precision });
  if (toD) Object.assign(patch, { closedDate: toD.date, isClosed: true });
  return { kind: 'investmentAccounts', id: entityRef, patch, text: [fromD && `נפתח ${he(fromD.date)}`, toD && `נסגר ${he(toD.date)}`].filter(Boolean).join(' · ') };
}

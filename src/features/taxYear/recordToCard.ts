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
import type { RecordValue } from './records';

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

/** איזה פריט יודע לעדכן את התיק. */
export const updatesCard = (itemKey: string) => ['children', 'bank', 'address', 'employer', 'familyYear'].includes(RECORD_OF[itemKey] ?? '')
  // ‼ «מעסיק חדש» (פרטי ישות שנולדה מ«כן») נכנס לתיק ב«הוסף לתיק» עם אותו מזהה זמני — לא כאן, כדי לא להוסיף פעמיים
  && !/Details$/.test(itemKey);

export function cardUpdateFor(c: Client, itemKey: string, value: unknown, from: From, subjectRole: string = 'client', decisions: Record<string, OmitDecision> = {}): CardUpdatePlan | null {
  const schema = RECORD_OF[itemKey];
  const items = recordItems(value);
  if (!items) return null;
  if (schema === 'children') return childrenPlan(c, items, from, decisions);
  if (schema === 'employer') return employerPlan(c, items, from, subjectRole === 'spouse', decisions);
  if (!items.length) return null;
  if (schema === 'bank') return bankPlan(c, items[0], from, decisions);
  if (schema === 'address') return addressPlan(c, items[0], from);
  if (schema === 'familyYear') return familyYearPlan(c, itemKey, items[0], from);
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
    const lives = livesWith ? { livesWithTaxpayer: livesWith === 'withUs' || livesWith === 'shared' } : {};
    const i = r.id ? next.findIndex(x => x.id === r.id) : -1;
    if (i >= 0) {
      const was = next[i];
      if (was.firstName === firstName && was.birthDate === birthDate && (!livesWith || was.livesWithTaxpayer === lives.livesWithTaxpayer)) continue;
      next[i] = { ...was, firstName, birthDate, birthYear: Number(birthDate.slice(0, 4)), ...lives };
      lines.push(`עדכון: ${was.firstName || 'ילד/ה'}${was.birthDate !== birthDate ? ` — תאריך לידה ${was.birthDate ? he(was.birthDate) : '—'} ← ${he(birthDate)}` : ''}${was.firstName !== firstName ? ` — שם ← ${firstName}` : ''}`);
    } else {
      // ‼ ילד «חדש» עם אותו שם ותאריך לידה כמו ילד קיים — אותו ילד, לא כפילות
      if (next.some(x => x.firstName === firstName && x.birthDate === birthDate)) continue;
      next.push({ id: newId('child'), firstName, birthDate, birthYear: Number(birthDate.slice(0, 4)), hasDisability: false, ...lives });
      lines.push(`נוסף: ${firstName}, נולד/ה ${he(birthDate)}`);
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

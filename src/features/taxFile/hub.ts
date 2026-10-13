// ─── תיק המס כמרכז: קשר דו־כיווני עם השאלונים, וזיהוי מה השתנה מאז אישור ─────────────────
// ‼ התיק הוא מקור המידע. שאלוני הקליטה, הערכת המס, הדוח השנתי והצהרת ההון אוספים ומעדכנים אותו — לא מאגרים
//   מקבילים. פרט מתמשך בכרטיס (עם היסטוריה ב-tax_fact_changes); סכום שנתי לשנה ולתקופה (tax_year_facts);
//   נתון הון ליום ההצהרה (as_of).
// ‼ ישות חדשה שהתגלתה בשאלון (למשל דירה שלא הייתה רשומה) — הצעת שינוי לתיק, שהמשרד מאשר בלשונית «תיק מס».
//   אף פעם לא כתיבה ישירה, ואף פעם לא שינוי אוטומטי של תוצר מאושר.
// ‼ תוצר מאושר (הערכה, דוח) שומר תמונת מצב של הישויות בתיק. שינוי אחריו — «לבדיקה» (מצב נגזר), לא שכתוב.

import type { Client } from '../../types';
import type { ProposedFact } from '../../types/taxFacts';
import type { YearFact } from '../taxYear/types';

/** ישויות בתיק שמזוהות לאורך כל התהליכים (המזהה — entityRef בעובדות). */
export type CardEntityKind = 'properties' | 'investmentAccounts' | 'employers' | 'businesses' | 'foreignAccounts' | 'pensionFunds';
const KIND_HE: Record<CardEntityKind, string> = { properties: 'נכס', investmentAccounts: 'חשבון השקעות', employers: 'מעסיק', businesses: 'עסק', foreignAccounts: 'מקור בחו״ל', pensionFunds: 'קופה' };
const PREFIX: Record<CardEntityKind, string> = { properties: 'prop', investmentAccounts: 'inv', employers: 'emp', businesses: 'biz', foreignAccounts: 'frn', pensionFunds: 'fund' };

/** איזה שאלון יכול לחשוף ישות חדשה — ולאיזה מערך בתיק היא שייכת. «עסקים» אינם במסלול ההצעות (אין להם היסטוריה). */
export const NEW_ENTITY_ITEMS: Record<string, Exclude<CardEntityKind, 'businesses'>> = {
  'wealth.realEstate.details': 'properties', 'wealth.realEstate.list': 'properties', 'rent.properties': 'properties',
  'capital.accounts': 'investmentAccounts', 'salary.employers': 'employers',
  // 12.10.2026 · פרטי ישות «חדשה» (נולדה מ«כן» בלי ישות בתיק) — שנת מס וקליטה
  'salary.employerDetails': 'employers', 'foreign.sourceDetails': 'foreignAccounts', 'savings.fundDetails': 'pensionFunds',
  'intake.employerDetails': 'employers', 'intake.propertyDetails': 'properties', 'intake.accountDetails': 'investmentAccounts',
  'intake.foreignDetails': 'foreignAccounts', 'intake.fundDetails': 'pensionFunds',
  'intake.employers': 'employers', 'intake.rentals': 'properties', 'intake.investments': 'investmentAccounts',
};

export const entityLabel = (kind: CardEntityKind, e: Record<string, unknown>): string =>
  kind === 'properties' ? [e.address, e.city].filter(Boolean).join(', ') || 'נכס'
    : kind === 'investmentAccounts' ? String(e.institutionName ?? 'חשבון')
      : kind === 'foreignAccounts' ? [e.institutionName, e.country].filter(Boolean).join(', ') || 'חו״ל'
        : kind === 'pensionFunds' ? [e.institutionName, e.productName].filter(Boolean).join(' · ') || 'קופה'
          : String(e.name ?? KIND_HE[kind]);

/**
 * הצעת שינוי לתיק: המערך כולו, עם הישות החדשה (כך עובד accept_tax_fact_change — old_value הוא תמונת המצב, ואם
 * המערך השתנה בינתיים האישור נדחה כ-stale_conflict במקום לדרוס).
 */
export function newEntityProposal(client: Client, kind: Exclude<CardEntityKind, 'businesses'>, entity: Record<string, unknown>, from: { factId: string; itemKey: string; year: number }, fixedId?: string): ProposedFact {
  const current = ((client as unknown as Record<string, unknown>)[kind] as Record<string, unknown>[] | undefined) ?? [];
  // ‼ ישות זמנית (picture.ts › provisionalRef) נכנסת לכרטיס עם אותו מזהה — כך התשובות והמסמך שכבר הועלו נשארים שלה
  if (fixedId && current.some(e => e.id === fixedId)) throw new Error(`entity_exists:${fixedId}`);
  const id = fixedId ?? `${PREFIX[kind]}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  const added = { ...entity, id };
  return {
    fieldKey: kind,
    label: `${KIND_HE[kind]} חדש מהשאלון: ${entityLabel(kind, added)}`,
    oldValue: { display: `${current.length} ב${KIND_HE[kind] === 'נכס' ? 'נכסים' : 'רשימה'}`, patch: { [kind]: current } },
    newValue: { display: `נוסף: ${entityLabel(kind, added)}`, patch: { [kind]: [...current, added] } },
    note: `התגלה בשאלון (${from.itemKey}, ${from.year}); עובדה ${from.factId}`,
  };
}

/** תמונת מצב של הישויות בתיק — נשמרת עם כל גרסה מאושרת (input_facts), כדי לזהות שינוי אחריה. */
export function cardSnapshot(client: Client): { id: string; value: unknown }[] {
  const pick = (k: CardEntityKind, f: (e: Record<string, unknown>) => unknown) =>
    ({ id: `card:${k}`, value: (((client as unknown as Record<string, unknown>)[k] as Record<string, unknown>[] | undefined) ?? []).map(f).sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b))) });
  return [
    pick('properties', e => ({ id: e.id, label: entityLabel('properties', e), rented: !!e.isRented, track: e.rentalTaxTrack ?? null })),
    pick('investmentAccounts', e => ({ id: e.id, label: entityLabel('investmentAccounts', e), closed: !!e.isClosed })),
    pick('employers', e => ({ id: e.id, label: entityLabel('employers', e), spouse: !!e.belongsToSpouse })),
    pick('businesses', e => ({ id: e.id, label: entityLabel('businesses', e), closed: !!e.isClosed, spouse: !!e.belongsToSpouse })),
    { id: 'card:familyStatus', value: client.familyStatus ?? null },
    { id: 'card:children', value: (client.children ?? []).length },
  ];
}

export interface ImpactItem {
  kind: 'card_added' | 'card_removed' | 'card_changed' | 'fact_changed' | 'fact_new';
  text: string;
  /** למה זה עשוי להשפיע על התוצר. */
  affects: string;
}

const AFFECTS: Record<string, string> = {
  'card:properties': 'שכר דירה, נכסים בהצהרת הון', 'card:investmentAccounts': 'ריבית, דיבידנד ורווחי הון',
  'card:employers': 'משכורת וניכוי במקור', 'card:businesses': 'הכנסה מעסק ומקדמות', 'card:familyStatus': 'נקודות זיכוי וחישוב משותף', 'card:children': 'נקודות זיכוי',
};

/**
 * מה השתנה בתיק מאז שהתוצר אושר: ישויות שנוספו/הוסרו/השתנו, עובדות שהתוצר נשען עליהן ושונו, ועובדות חדשות
 * שאושרו לאותה שנה אחרי האישור. ‼ לא משנה את התוצר — רק אומר מה לבדוק.
 */
export function changesSinceApproval(input: { inputFacts: { id: string; value: unknown }[]; approvedAt?: string; client: Client; facts: YearFact[]; taxYear: number }): ImpactItem[] {
  const out: ImpactItem[] = [];
  const now = new Map(cardSnapshot(input.client).map(x => [x.id, x.value]));
  for (const x of input.inputFacts.filter(y => y.id.startsWith('card:'))) {
    const cur = now.get(x.id);
    if (Array.isArray(x.value) && Array.isArray(cur)) {
      const was = new Map((x.value as { id: string; label: string }[]).map(e => [e.id, e])), is = new Map((cur as { id: string; label: string }[]).map(e => [e.id, e]));
      for (const [id, e] of is) if (!was.has(id)) out.push({ kind: 'card_added', text: `נוסף לתיק: ${e.label}`, affects: AFFECTS[x.id] ?? '' });
      for (const [id, e] of was) if (!is.has(id)) out.push({ kind: 'card_removed', text: `הוסר מהתיק: ${e.label}`, affects: AFFECTS[x.id] ?? '' });
      for (const [id, e] of is) if (was.has(id) && JSON.stringify(was.get(id)) !== JSON.stringify(e)) out.push({ kind: 'card_changed', text: `השתנה בתיק: ${e.label}`, affects: AFFECTS[x.id] ?? '' });
    } else if (JSON.stringify(x.value) !== JSON.stringify(cur)) out.push({ kind: 'card_changed', text: x.id === 'card:familyStatus' ? 'מצב משפחתי השתנה בתיק' : 'מספר הילדים בתיק השתנה', affects: AFFECTS[x.id] ?? '' });
  }
  const accepted = new Map(input.facts.filter(f => f.status === 'accepted').map(f => [f.id, f]));
  const used = new Set(input.inputFacts.map(f => f.id));
  for (const x of input.inputFacts.filter(y => !y.id.startsWith('card:'))) {
    const f = accepted.get(x.id);
    if (!f) out.push({ kind: 'fact_changed', text: `נתון שהתוצר נשען עליו הוחלף או בוטל (${x.id})`, affects: 'החישוב' });
    else if (JSON.stringify(f.value) !== JSON.stringify(x.value)) out.push({ kind: 'fact_changed', text: `נתון שהתוצר נשען עליו שונה: ${f.itemKey}`, affects: 'החישוב' });
  }
  if (input.approvedAt) {
    for (const f of input.facts) {
      if (f.status !== 'accepted' || f.taxYear !== input.taxYear || used.has(f.id) || f.periodKind === 'as_of') continue;
      if ((f.decidedAt ?? f.createdAt) > input.approvedAt) out.push({ kind: 'fact_new', text: `נתון חדש אושר לשנה אחרי האישור: ${f.itemKey}`, affects: 'עשוי לשנות את התוצאה' });
    }
  }
  return out;
}

// ── עדכון ישות קיימת וסתירה בין תשובה לתיק ──────────────────────────────────────
// ‼ תשובה שאומרת משהו אחר על ישות שכבר בתיק (הדירה כבר לא מושכרת, החשבון נסגר, המעסיק הסתיים) — לא כותבים
//   ולא מתעלמים: מציגים «סותר את התיק», והמשרד מכריע — עדכון בתיק = הצעת שינוי לאישור, עם תמונת המצב הקודמת.

/** השדות בכל ישות שתשובה בשנת המס יכולה לסתור. */
export const ENTITY_FIELDS: Record<Exclude<CardEntityKind, 'businesses'>, { key: string; label: string; kind: 'bool' | 'text' | 'date' }[]> = {
  properties: [{ key: 'isRented', label: 'מושכר', kind: 'bool' }, { key: 'address', label: 'כתובת', kind: 'text' }, { key: 'city', label: 'עיר', kind: 'text' }],
  investmentAccounts: [{ key: 'isClosed', label: 'נסגר', kind: 'bool' }, { key: 'institutionName', label: 'הגוף המנהל', kind: 'text' }],
  employers: [{ key: 'endDate', label: 'תאריך סיום', kind: 'date' }, { key: 'name', label: 'שם', kind: 'text' }],
  foreignAccounts: [{ key: 'institutionName', label: 'הגוף', kind: 'text' }, { key: 'country', label: 'מדינה', kind: 'text' }],
  pensionFunds: [{ key: 'institutionName', label: 'החברה', kind: 'text' }, { key: 'hasSelfDeposits', label: 'הפקדה עצמאית', kind: 'bool' }],
};
const KIND_OF_FACT: Record<string, Exclude<CardEntityKind, 'businesses'>> = { property: 'properties', account: 'investmentAccounts', employer: 'employers' };

export interface EntityConflict { factId: string; kind: Exclude<CardEntityKind, 'businesses'>; entityId: string; entityLabel: string; field: string; fieldLabel: string; card: unknown; answer: unknown }

/** סתירות בין עובדות שנת המס (שאושרו או ממתינות) לבין ישויות קיימות בתיק. */
export function entityConflicts(client: Client, facts: YearFact[]): EntityConflict[] {
  const out: EntityConflict[] = [];
  for (const f of facts) {
    if (!f.entityRef || f.status === 'rejected' || f.status === 'superseded' || !f.value || typeof f.value !== 'object' || Array.isArray(f.value)) continue;
    const kind = (f.entityKind && KIND_OF_FACT[f.entityKind]) || (['properties', 'investmentAccounts', 'employers'] as const).find(k => ((client as unknown as Record<string, { id: string }[] | undefined>)[k] ?? []).some(e => e.id === f.entityRef));
    if (!kind) continue;
    const ent = ((client as unknown as Record<string, Record<string, unknown>[] | undefined>)[kind] ?? []).find(e => e.id === f.entityRef);
    if (!ent) continue;
    const v = f.value as Record<string, unknown>;
    for (const fd of ENTITY_FIELDS[kind]) {
      if (!(fd.key in v)) continue;
      const card = ent[fd.key], ans = v[fd.key];
      const same = fd.kind === 'bool' ? !!card === !!ans : String(card ?? '').trim() === String(ans ?? '').trim();
      if (!same) out.push({ factId: f.id, kind, entityId: String(ent.id), entityLabel: entityLabel(kind, ent), field: fd.key, fieldLabel: fd.label, card, answer: ans });
    }
  }
  return out;
}

/** הצעת עדכון לישות קיימת: המערך כולו, עם הישות המעודכנת (אישור על תיק שהשתנה בינתיים — סתירה, לא דריסה). */
export function updateEntityProposal(client: Client, kind: Exclude<CardEntityKind, 'businesses'>, entityId: string, patch: Record<string, unknown>, from: { factId: string; itemKey: string; year: number }): ProposedFact {
  const current = ((client as unknown as Record<string, unknown>)[kind] as Record<string, unknown>[] | undefined) ?? [];
  const before = current.find(e => e.id === entityId);
  if (!before) throw new Error(`entity_not_found:${entityId}`);
  const after = { ...before, ...patch };
  const what = Object.entries(patch).map(([k, v]) => `${ENTITY_FIELDS[kind].find(x => x.key === k)?.label ?? k}: ${String(before[k] ?? '—')} ← ${String(v ?? '—')}`).join(' · ');
  return {
    fieldKey: kind,
    label: `עדכון ${KIND_HE[kind]} בתיק: ${entityLabel(kind, before)} — ${what}`,
    oldValue: { display: entityLabel(kind, before), patch: { [kind]: current } },
    newValue: { display: what, patch: { [kind]: current.map(e => (e.id === entityId ? after : e)) } },
    note: `לפי תשובה בשנת המס (${from.itemKey}, ${from.year}); עובדה ${from.factId}`,
  };
}

// ── 236 · עדכון שדה בכרטיס מתשובה מאושרת בקליטה (כן/לא, בחירה) ───────────────────
// ‼ אותו מסלול כמו כל שינוי בתיק: הצעה עם ערך קודם (old_value) — אם הכרטיס השתנה בינתיים, האישור נדחה
//   כ-stale_conflict במקום לדרוס. המקור: התשובה בשאלון (source_ref = tax_year_fact:<id>).
const CARD_FIELD_HE: Record<string, string> = {
  hasRentalIncome: 'משכיר נכס', hasInvestments: 'יש תיק השקעות', hasCrypto: 'מטבעות דיגיטליים', familyStatus: 'מצב משפחתי',
};
const FAMILY_HE: Record<string, string> = { single: 'רווק/ה', married: 'נשוי/אה', divorced: 'גרוש/ה', widowed: 'אלמן/ה', singleParent: 'הורה יחיד/ה' };
export function cardFieldProposal(client: Client, field: string, value: unknown, from: { factId: string; itemKey: string }): ProposedFact {
  const cur = (client as unknown as Record<string, unknown>)[field];
  const show = (v: unknown) => (typeof v === 'boolean' ? (v ? 'כן' : 'לא') : field === 'familyStatus' ? (FAMILY_HE[String(v)] ?? String(v ?? '—')) : String(v ?? '—'));
  return {
    fieldKey: field,
    label: `${CARD_FIELD_HE[field] ?? field} — מהקליטה`,
    oldValue: { display: show(cur), patch: { [field]: cur ?? null } },
    newValue: { display: show(value), patch: { [field]: value } },
    note: `תשובה מאושרת בקליטה (${from.itemKey}); עובדה ${from.factId}`,
  };
}

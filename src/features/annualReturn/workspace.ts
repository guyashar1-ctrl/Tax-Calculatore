// ─── הדוח השנתי במשרד: «חומרים» ליד «הדוח» (25.10.2026; docs/proposals/2026-10-25-annual-office-return.html, גיא אישר) ─────────
// ‼ טהור. מה שהמסך צריך כדי לענות על שתי שאלות בלבד: מה עוד חסר (חומרים) ומה כבר בדוח (המנוע — computeReturn).
// ‼ גיא: «התשובות נכנסות לדוח ולתיק לבד. לא רוצה מיליון אישורים» ⇒ autoAcceptPlan — מה שאפשר לבד, לבד;
//   מה שבאמת צריך הכרעה (שינוי בתיק שהתשובה לא מכסה עד הסוף) — שורה אחת, לא תור אישורים.

import type { Client } from '../../types';
import type { Evidence, InfoAsk, SubjectRole, YearFact } from '../taxYear/types';
import type { ItemStatus } from '../taxYear/picture';
import { DOCS } from '../taxYear/documents';
import { ITEM_BY_KEY } from '../taxYear/catalog';
import { cardUpdateFor, updatesCard, type CardUpdatePlan } from '../taxYear/recordToCard';
import { entitiesFor, templateFor } from './docTemplates';
import type { ReturnField, ReturnOutputs } from './types';

/** של מי: הלקוח, בן/בת הזוג, או משותף. */
export type Who = 'client' | 'spouse' | 'home';
export const whoOf = (r: SubjectRole | string): Who => (r === 'spouse' ? 'spouse' : r === 'client' ? 'client' : 'home');

/**
 * חומר אחד:
 *   wait  — מחכים ללקוח (או סימן «אחר כך»)
 *   here  — הגיע, ויש מה להקליד ממנו
 *   got   — הגיע, ואין ממנו מספרים (תעודה, אישור) — מספיק שהגיע
 *   mine  — אצל המשרד (מסמך שהמשרד מוציא או מכין, למשל רווח והפסד)
 *   done  — הוזן / נבדק
 */
export type MatState = 'wait' | 'here' | 'got' | 'mine' | 'done';
export interface Material {
  key: string;
  who: Who;
  title: string;
  sub?: string;
  state: MatState;
  docKind?: string;
  /** יש תבנית הזנה (106, 867, רו״ה…) — «הזנה». */
  enterable: boolean;
  evidence?: Evidence;
  ask?: InfoAsk;
  entityRef?: string;
  subjectRole: SubjectRole;
}

const docLabel = (k?: string) => (k ? (DOCS as Record<string, { label: string }>)[k]?.label ?? k : 'מסמך');
const isFileAsk = (a: InfoAsk) => a.prompt.input.kind === 'file';
const docKindOf = (a: InfoAsk) => (a.prompt.input.kind === 'file' ? a.prompt.input.docKind : undefined);
const live = (e: Evidence) => e.review !== 'rejected';

/** שם הישות (מעסיק, עסק, חשבון) מהכרטיס — לכותרת «טופס 106 · כהן ושות׳». */
export function entityName(c: Client, ref?: string): string | undefined {
  if (!ref) return undefined;
  return (c.employers ?? []).find(e => e.id === ref)?.name ?? (c.businesses ?? []).find(b => b.id === ref)?.name
    ?? (c.investmentAccounts ?? []).find(a => a.id === ref)?.institutionName ?? (c.pensionFunds ?? []).find(f => f.id === ref)?.institutionName ?? undefined;
}

/** האם כבר הוזנו שורות מקור מהמסמך הזה (record_source_lines ⇒ עובדות מאושרות עם evidenceId). */
export const enteredFrom = (facts: YearFact[], ev: Evidence) => ev.extraction === 'office_entered' || facts.some(f => f.evidenceId === ev.id && f.status === 'accepted');

export function materialsOf(input: { client: Client; year: number; stepId: string; asks: InfoAsk[]; evidence: Evidence[]; facts: YearFact[]; statuses: ItemStatus[] }): Material[] {
  const { client, year, stepId, asks, evidence, facts, statuses } = input;
  const out: Material[] = [];
  const mineAsks = asks.filter(a => a.parentStepId === stepId && a.state !== 'cancelled' && a.state !== 'draft' && isFileAsk(a));
  const used = new Set<string>();
  for (const a of mineAsks) {
    const kind = docKindOf(a);
    const enterable = !!(kind && templateFor(kind as never, year));
    const evs = evidence.filter(e => e.askId === a.id && live(e));
    if (!evs.length) {
      const later = a.state === 'unavailable';
      out.push({ key: `ask-${a.id}`, who: whoOf(a.subjectRole), title: a.prompt.title || docLabel(kind), state: 'wait', docKind: kind, enterable, ask: a, subjectRole: a.subjectRole,
        entityRef: a.entityRef, sub: later ? (a.unavailable?.reason ?? 'אשלח אחר כך') : 'ממתין ללקוח' });
      continue;
    }
    for (const ev of evs) {
      used.add(ev.id);
      const ent = entityName(client, ev.entityRef ?? a.entityRef);
      const title = `${docLabel(ev.docKind)}${ent ? ` · ${ent}` : ''}`;
      const done = enteredFrom(facts, ev) || (!enterable && ev.review === 'accepted');
      out.push({ key: `ev-${ev.id}`, who: whoOf(ev.subjectRole), title, state: done ? 'done' : enterable ? 'here' : 'got', docKind: ev.docKind, enterable, evidence: ev, ask: a,
        subjectRole: ev.subjectRole, entityRef: ev.entityRef ?? a.entityRef, sub: done ? (enterable ? 'הוזן' : 'התקבל') : ev.fileName ?? 'הגיע' });
    }
  }
  // מסמכים שהגיעו בלי שאלה (המשרד העלה, או מסמך שנשמר מקודם לשנה הזו)
  for (const ev of evidence.filter(e => live(e) && !used.has(e.id) && (e.taxYear == null || e.taxYear === year) && !e.askId)) {
    const enterable = !!templateFor(ev.docKind, year);
    if (!enterable) continue;
    const ent = entityName(client, ev.entityRef);
    const done = enteredFrom(facts, ev);
    out.push({ key: `ev-${ev.id}`, who: whoOf(ev.subjectRole), title: `${docLabel(ev.docKind)}${ent ? ` · ${ent}` : ''}`, state: done ? 'done' : 'here', docKind: ev.docKind, enterable,
      evidence: ev, subjectRole: ev.subjectRole, entityRef: ev.entityRef, sub: done ? 'הוזן' : ev.fileName ?? 'הגיע' });
  }
  // מסמכים שהמשרד מוציא או מכין (who: 'office') — רווח והפסד, אישור שנתי מביטוח לאומי…
  for (const s of statuses.filter(x => x.item.who === 'office' && x.item.kind === 'document' && x.state !== 'notApplicable')) {
    const kind = s.item.docKind;
    if (kind && out.some(m => m.docKind === kind && m.subjectRole === s.subjectRole && (m.entityRef ?? '') === (s.entityRef ?? '') && m.state !== 'wait')) continue;
    const t = kind ? templateFor(kind as never, year) : undefined;
    // ‼ מסמך לעסק כשהעסק עוד לא בכרטיס (ריבוע «עבדתי עם חשבוניות») — אין לאן להקליד; קודם פותחים את העסק בכרטיס
    const noEntity = t?.template.per === 'business' && !s.entityRef && entitiesFor(t.template, client, s.subjectRole === 'spouse' ? 'spouse' : 'client').length === 0;
    const enterable = !!t && !noEntity;
    const done = s.state === 'known';
    const ent = s.entityLabel && s.entityLabel !== client.firstName ? ` · ${s.entityLabel}` : '';
    out.push({ key: `office-${s.item.key}|${s.subjectRole}|${s.entityRef ?? ''}`, who: whoOf(s.subjectRole), title: `${s.item.label}${ent}`, docKind: kind, enterable,
      state: done ? 'done' : s.state === 'notYetAvailable' ? 'wait' : 'mine', subjectRole: s.subjectRole, entityRef: s.entityRef,
      sub: done ? 'הוזן' : s.state === 'notYetAvailable' ? (s.requestableFrom ? `אפשר מ-${s.requestableFrom.slice(0, 10).split('-').reverse().join('.')}` : 'עוד לא זמין') : noEntity ? 'לפתוח את העסק בכרטיס ולהפיק מפייפרלס' : 'אצלך' });
  }
  return out;
}

/** מוכן להדפסה: אין מה שמחכה ללקוח ואין מה להקליד. */
export const isReady = (mats: Material[]) => mats.length > 0 && mats.every(m => m.state === 'done' || m.state === 'got');

// ── התשובות נכנסות לבד ───────────────────────────────────────────────────────────────────────────────
export interface AutoPlan {
  /** תשובות שמעדכנות את הכרטיס ואפשר לעדכן עד הסוף — עדכון ואז אישור. */
  card: { fact: YearFact; plan: CardUpdatePlan }[];
  /** כל שאר התשובות — אישור (נכנסות לדוח). */
  accept: YearFact[];
  /** עדכון כרטיס שצריך הכרעה (התשובה לא מכסה את כל מה שבכרטיס) — התשובה נכנסת לדוח, הכרטיס מחכה לשורה אחת. */
  needsDecision: { fact: YearFact; plan: CardUpdatePlan }[];
}

/** ‼ רק תשובות הלקוח לבקשה הזו (portal · pending), ורק אחרי שסיים לענות — לא באמצע השאלון. */
export function autoAcceptPlan(client: Client, facts: YearFact[], stepId: string): AutoPlan {
  const pending = facts.filter(f => f.requestId === stepId && f.status === 'pending' && f.source === 'portal');
  const plan: AutoPlan = { card: [], accept: [], needsDecision: [] };
  for (const f of pending) {
    const p = updatesCard(f.itemKey) ? cardUpdateFor(client, f.itemKey, f.value, { factId: f.id, itemKey: f.itemKey, year: f.taxYear }, f.subjectRole) : null;
    if (p && (p.proposals.length || p.omitted.length)) {
      if (p.omitted.length) { plan.needsDecision.push({ fact: f, plan: p }); plan.accept.push(f); } else plan.card.push({ fact: f, plan: p });
      continue;
    }
    plan.accept.push(f);
  }
  return plan;
}

// ── «הדוח» — הסיכום ────────────────────────────────────────────────────────────────────────────────
export interface SumRow { code: string; label: string; person: ReturnField['person']; amount: number; from: string }
const FROM_DOC: Record<string, string> = { verified: 'מסמך', read: 'מהרשות', manual: 'הוזן' };
/** מאיפה הסכום, במילה אחת: «106», «מהשאלון», «מהתיק», «חישוב». */
export function fromOf(f: ReturnField): string {
  const s = f.source;
  if (s.kind === 'card') return 'מהתיק';
  if (s.kind === 'calculation') return 'חישוב';
  if (s.kind === 'manual') return 'ידני';
  if (s.kind === 'completion') return 'השלמה';
  const docs = [...new Set((s.lines ?? []).map(l => l.docLabel).filter(Boolean))];
  if (docs.length) return docs.length === 1 ? docs[0].replace(/^טופס /, '').replace(/ — .*/, '') : `${docs.length} מסמכים`;
  return FROM_DOC[s.trust ?? ''] === 'הוזן' ? 'מהשאלון' : FROM_DOC[s.trust ?? ''] ?? 'מהשאלון';
}
/** השורות שיש בהן סכום — לפי אדם (הלקוח · בן/בת הזוג · משותף), בסדר הטופס. */
export function summaryRows(out: ReturnOutputs): SumRow[] {
  return out.fields.filter(f => f.kind === 'amount' && typeof f.amount === 'number' && f.amount !== 0)
    .map(f => ({ code: f.code, label: f.label, person: f.person, amount: f.amount as number, from: fromOf(f) }));
}
/** כמה מהדוח מלא — שדות רלוונטיים שמולאו מתוך כל הרלוונטיים (בדיקת הכיסוי של המנוע). */
export function filledPct(out: ReturnOutputs): number {
  const c = out.formCoverage.counts;
  return c.relevant ? Math.round((c.filled / c.relevant) * 100) : 0;
}
/** הנספחים שנדרשים ללקוח הזה (לא כל הרשימה). */
export function neededAnnexes(out: ReturnOutputs): { formId: string; title: string }[] {
  const seen = new Set<string>();
  return out.formCoverage.annexes.filter(a => a.need === 'required' && !seen.has(a.formId) && (seen.add(a.formId), true)).map(a => ({ formId: a.formId, title: a.title }));
}
/** «החזר 3,420 ₪» / «לתשלום 1,200 ₪» / null כשחסר נתון (המנוע אומר incomplete — לא מציגים מספר). */
export function balanceText(out: ReturnOutputs): string | null {
  const h = out.household;
  if (h.incomplete) return null;
  const n = Math.round(Math.abs(h.balance));
  if (!n) return 'מאוזן';
  return h.balance < 0 ? `החזר ${n.toLocaleString('he-IL')} ₪` : `לתשלום ${n.toLocaleString('he-IL')} ₪`;
}
export const itemLabel = (k: string) => ITEM_BY_KEY[k]?.label ?? k;

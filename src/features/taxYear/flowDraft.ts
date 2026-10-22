// ─── שאלון הדוח השנתי: הכול טיוטה עד «שליחה למשרד» (20.10.2026) ──────────────────────────────────────────────
// ‼ גיא: «כל עוד לא סיימנו את השאלון — למה שזה יהיה נעול ו"נשלח למשרד"? שיהיה ניתן לחזור ממש אחורה».
//   עד עכשיו כל מסך נשלח לשרת מיד וננעל. עכשיו: התשובות בטיוטה (בדפדפן + saved_draft בשרת), וההמשך שתשובה פותחת —
//   מחושב כאן מאותם צילומים שהשרת פותח (option.followUps / followUp / prompt.onYes — 262, 264), כך שהלקוח רואה את
//   השאלות הבאות בלי שום דבר שנשלח. ב«שליחה» — התשובות נשלחות לפי הסדר, והשרת פותח את ההמשך כמו קודם.
// ‼ טהור (בלי React). זהות שאלה = פריט + תפקיד + ישות — כמו האינדקס של 229 («פעם אחת לזהות»).
// ‼ מסמכים לא נשאלים באמצע: הם ברשימה אחת בסוף, אחרי השליחה (גיא: «כל המסמכים — רק בסוף, בצורה מסודרת»).

import type { InfoAsk, MultiFollowUp, AskPrompt } from './types';
import { buildScreens, screenAsks, STUDIES_KEY, type Screen } from './screens';
import { onYesFor, onChangedFor, onValueFor, type AskAnswer } from './asks';
import { answerValid, schemaFor, type RecordAnswer } from './records';
import { cleanEntity, entityValid, type EntityItem } from './entities';
import type { UnavailableCode } from './types';
import { UNAVAILABLE_LABEL } from './asks';
import { INSTITUTION_LISTS } from '../../data/institutions';

export type Draft = { choice?: string; text?: string; amount?: string; note?: string; reason?: string; record?: RecordAnswer; code?: UnavailableCode | 'notRelevant';
  /** מסך הרשת: המפתחות שסומנו; `none` — «אין לנו אף אחד מאלה». */
  selected?: string[]; none?: boolean;
  /** של מי / איפה. */
  items?: EntityItem[] };

export const askIdentity = (a: { itemKey: string; subjectRole: string; entityRef?: string | null }) => `${a.itemKey}|${a.subjectRole}|${a.entityRef ?? ''}`;

const VIRTUAL = 'v:';
export const isVirtual = (a: { id: string }) => a.id.startsWith(VIRTUAL);

/** הערך שמוצג במסך כשעוד אין טיוטה: אריחים שסומנו מראש (הדוח הקודם / אירוע מהכרטיס). */
export function shownDraft(ask: InfoAsk, d: Draft | undefined): Draft {
  if (d) return d;
  if (ask.prompt.input.kind === 'multi' && ask.prompt.input.options.some(o => o.preset)) return { selected: ask.prompt.input.options.filter(o => o.preset).map(o => o.key) };
  return {};
}

function recordOf(ask: InfoAsk, d: Draft) {
  const input = ask.prompt.input;
  const schemaId = input.kind === 'record' ? input.schema : input.kind === 'confirm' && d.choice === 'changed' ? input.edit?.schema : undefined;
  const ctx = input.kind === 'record' ? input.context : input.kind === 'confirm' ? input.edit?.context : undefined;
  const schema = schemaId ? schemaFor(schemaId, undefined, ctx) : undefined;
  const value: RecordAnswer = d.record ?? { items: ((input.kind === 'record' ? input.initial : input.kind === 'confirm' ? input.edit?.initial : undefined) as RecordAnswer['items']) ?? [] };
  return { schema, value };
}

/** התשובה מהטיוטה — או null כשעוד חסר משהו. ‼ אותם כללים כמו המסך (TaxInfoFlow › answerOf). */
export function draftToAnswer(ask: InfoAsk, d: Draft): AskAnswer | null {
  const input = ask.prompt.input;
  const kind = input.kind;
  if (kind === 'confirm') {
    const { schema, value } = recordOf(ask, d);
    if (d.choice === 'yes') return { kind: 'unchanged' };
    if (d.choice === 'changed' && schema) return answerValid(schema, value) ? { kind: 'record', value: { items: value.items }, none: value.none, assertion: 'changed', was: input.kind === 'confirm' ? input.lines : [] } : null;
    return d.choice === 'changed' && d.text?.trim() ? { kind: 'changed', note: d.text } : null;
  }
  if (kind === 'record') {
    const { schema, value } = recordOf(ask, d);
    if (!schema || !answerValid(schema, value)) return null;
    return value.none ? { kind: 'record', value: null, none: true } : { kind: 'record', value: schema.id === 'period' ? value.items[0] : { items: value.items } };
  }
  if (kind === 'multi') return d.none || (d.selected?.length ?? 0) > 0 ? { kind: 'multi', selected: d.none ? [] : d.selected ?? [], ...(d.note?.trim() ? { note: d.note.trim() } : {}) } : null;
  if (kind === 'entity' && input.kind === 'entity') {
    const items = d.items ?? (input.initial?.length ? input.initial : [{}]);
    return entityValid(input.spec, items, input.context) ? { kind: 'entity', items: items.map(it => cleanEntity(input.spec, it, input.context)) } : null;
  }
  if (kind === 'who') return d.choice === 'notSure' ? { kind: 'notSure', note: d.text?.trim() || undefined } : d.choice && ['none', 'client', 'spouse', 'both'].includes(d.choice) ? { kind: 'who', value: d.choice as 'none' | 'client' | 'spouse' | 'both' } : null;
  if (kind === 'yesno') return d.choice === 'yes' ? { kind: 'yes', note: d.text?.trim() || undefined } : d.choice === 'no' ? { kind: 'no' } : d.choice === 'notSure' ? { kind: 'notSure', note: d.text?.trim() || undefined } : null;
  if (kind === 'amount') return d.choice === 'notSure' ? { kind: 'notSure' } : d.amount !== undefined && d.amount !== '' && Number(d.amount) >= 0 ? { kind: 'amount', amount: Number(d.amount) } : null;
  if (kind === 'text') return d.text?.trim() ? { kind: 'text', text: d.text } : null;
  if (kind === 'choice') return d.choice ? { kind: 'choice', value: d.choice } : null;
  if (kind === 'file') {
    if (d.code === 'notRelevant') return { kind: 'notSure', note: `המסמך לא רלוונטי לדברי הלקוח${d.reason?.trim() ? `: ${d.reason.trim()}` : ''}` };
    if (d.code) return { kind: 'unavailable', code: d.code, reason: d.reason?.trim() || UNAVAILABLE_LABEL[d.code] };
  }
  return null;
}

/** מה תשובה (בטיוטה) פותחת — ‼ אותו כלל כמו השרת: 262 (אריחים), 264 (onYes). */
export function opensOf(ask: InfoAsk, a: AskAnswer): MultiFollowUp[] {
  if (a.kind === 'multi' && ask.prompt.input.kind === 'multi') {
    return ask.prompt.input.options.filter(o => a.selected.includes(o.key)).flatMap(o => [...(o.followUps ?? []), ...(o.followUp ? [o.followUp] : [])]);
  }
  // ‼ 21.10.2026 · סבב 2: גם «השתנה» (onChanged) וערך ברשומה (onValue) — אותו כלל כמו השרת (286)
  return [...onYesFor(ask.prompt, a), ...onChangedFor(ask.prompt, a), ...onValueFor(ask.prompt, a)];
}

/** שאלה וירטואלית זוכרת מי פתח אותה — כדי שתבוא מיד אחרי השאלה הזו (walkScreens). */
export type VirtualAsk = InfoAsk & { openedBy?: string };
const virtualAsk = (f: MultiFollowUp, parent: InfoAsk): VirtualAsk => ({
  openedBy: parent.id,
  id: `${VIRTUAL}${askIdentity(f)}`, clientId: parent.clientId, taxYear: parent.taxYear, stepId: parent.stepId, parentStepId: parent.parentStepId,
  itemKey: f.itemKey, subjectRole: f.subjectRole, entityKind: f.entityKind, entityRef: f.entityRef, prompt: f.prompt as AskPrompt,
  state: 'published', createdAt: parent.createdAt,
});

/**
 * השאלות שהלקוח רואה עכשיו: האמיתיות (מהשרת) + מה שהטיוטה פותחת (וירטואליות, עד השליחה).
 * שאלה שכבר קיימת (אמיתית או וירטואלית) לאותה זהות — לא נוספת שוב. עומק מוגבל.
 */
export function expandWithDrafts(asks: InfoAsk[], drafts: Record<string, Draft>, depth = 5): InfoAsk[] {
  const out = asks.filter(a => a.state !== 'cancelled' && a.state !== 'draft');
  const seen = new Set(out.map(askIdentity));
  let frontier = out;
  for (let k = 0; k < depth && frontier.length; k++) {
    const next: InfoAsk[] = [];
    for (const a of frontier) {
      if (a.state !== 'published') continue;
      const d = drafts[askIdentity(a)];
      const ans = d ? draftToAnswer(a, d) : null;
      // ‼ 21.10.2026 · «השתנה» פותח את מה שבתוך השורה מיד — גם לפני שהשינוי עצמו מלא (נולד ילד ⇐ השם והתאריך נכתבים אחרי הבחירה)
      const opens = ans ? opensOf(a, ans) : d?.choice === 'changed' ? (a.prompt.onChanged ?? []).filter(f => f.prompt.inline) : [];
      for (const f of opens) {
        const id = askIdentity(f);
        if (seen.has(id)) continue;
        seen.add(id);
        next.push(virtualAsk(f, a));
      }
    }
    out.push(...next);
    frontier = next;
  }
  return out;
}

/**
 * ‼ 21.10.2026 · סדר המסכים: מה שתשובה פותחת — מיד אחרי המסך שפתח אותו (לא במקום הממוין הכללי). אחרת אישור «זה מה שידוע לנו»
 *   שנפתח מתשובה מאוחרת הצטרף למסך האישורים הראשון — הלקוח לא ראה אותו, ו«שליחה» נחסמה («חסר»).
 */
export function walkScreens(asks: InfoAsk[], opened: ReadonlySet<string>): Screen[] {
  const live = asks.filter(a => a.prompt.input.kind !== 'file');
  const kids = new Map<string, InfoAsk[]>();
  for (const a of live) {
    const by = (a as VirtualAsk).openedBy;
    if (isVirtual(a) && by) kids.set(by, [...(kids.get(by) ?? []), a]);
  }
  // ‼ 21.10.2026 · סבב 2: שאלה «בתוך השורה» (inline) אינה מסך — מה שהיא פותחת בא מיד אחרי המסך של השורה;
  //   «לימודים וצבא» של כל בני הבית — מסך אחד בסוף (גם מה שבתיק וגם מה שנפתח מריבוע).
  const studies: InfoAsk[] = [];
  const kidsOf = (a: InfoAsk): InfoAsk[] => (kids.get(a.id) ?? []).flatMap(k => (k.prompt.inline ? kidsOf(k) : [k]))
    .filter(k => (k.itemKey === STUDIES_KEY ? (studies.push(k), false) : true));
  const place = (list: Screen[], depth: number): Screen[] => list.flatMap(s => {
    const ch = depth < 6 ? screenAsks(s).flatMap(a => [...kidsOf(a), ...inlineOf(live, a).filter(x => !isVirtual(x)).flatMap(kidsOf)]) : [];
    return ch.length ? [s, ...place(buildScreens(ch, opened, { knownAll: true }), depth + 1)] : [s];
  });
  const top = live.filter(a => (!isVirtual(a) || !(a as VirtualAsk).openedBy) && !a.prompt.inline);
  const main = place(buildScreens(top.filter(a => a.itemKey !== STUDIES_KEY), opened, { knownAll: true }), 0);
  const seen = new Set<string>();
  const allStudies = [...top.filter(a => a.itemKey === STUDIES_KEY), ...studies].filter(a => (seen.has(askIdentity(a)) ? false : (seen.add(askIdentity(a)), true)))
    .sort((a, b) => (a.subjectRole === 'client' ? 0 : 1) - (b.subjectRole === 'client' ? 0 : 1));
  return allStudies.length ? [...main, ...place(buildScreens(allStudies, opened, { knownAll: true }), 1)] : main;
}

/** 21.10.2026 · השאלות «בתוך השורה» של שורת אישור (בחירה קטנה: נפרדנו / נולד ילד) — מוצגות בה, לא כמסך. */
export function inlineOf(asks: InfoAsk[], parent: InfoAsk): InfoAsk[] {
  return asks.filter(a => a.prompt.inline && ((a as VirtualAsk).openedBy === parent.id || (!isVirtual(a) && !!parent.prompt.onChanged?.some(f => askIdentity(f) === askIdentity(a)))));
}

/** מה נשלח עכשיו: שאלות אמיתיות פתוחות (לא מסמך) שיש להן תשובה בטיוטה. */
export function readyToSend(asks: InfoAsk[], drafts: Record<string, Draft>): { ask: InfoAsk; answer: AskAnswer }[] {
  return asks.filter(a => a.state === 'published' && !isVirtual(a) && a.prompt.input.kind !== 'file')
    .map(a => { const d = drafts[askIdentity(a)]; return { ask: a, answer: d ? draftToAnswer(a, d) : null }; })
    .filter((x): x is { ask: InfoAsk; answer: AskAnswer } => !!x.answer);
}

/** שורה קצרה לתשובה — למסך «רגע לפני ששולחים». */
export function answerText(ask: InfoAsk, d: Draft | undefined): string {
  if (!d) return '';
  const a = draftToAnswer(ask, d);
  if (!a) return '';
  const input = ask.prompt.input;
  switch (a.kind) {
    case 'multi': return input.kind === 'multi' ? (a.selected.length ? input.options.filter(o => a.selected.includes(o.key)).map(o => o.label).join(' · ') : 'אף אחד מאלה') : '';
    case 'yes': return 'כן';
    case 'no': return 'לא';
    case 'notSure': return 'לא בטוח — המשרד יבדוק';
    case 'unchanged': return 'נכון';
    case 'changed': return `יש שינוי: ${a.note}`;
    case 'amount': return `${a.amount.toLocaleString('he-IL')} ₪`;
    case 'text': return a.text;
    case 'choice': return input.kind === 'choice' ? input.options.find(o => o.value === a.value)?.label ?? a.value : a.value;
    case 'who': return input.kind === 'who' ? (a.value === 'none' ? 'לא' : a.value === 'client' ? input.clientName : a.value === 'spouse' ? input.spouseName : 'שניכם') : '';
    case 'record': {
      const { schema, value } = recordOf(ask, d);
      if (a.none) return schema?.noneLabel ?? 'אין';
      return schema ? value.items.map(r => schema.summary(r)).filter(Boolean).join(' · ') : '';
    }
    case 'entity': {
      if (input.kind !== 'entity') return '';
      const who = (v: string) => (v === 'client' ? input.context?.clientName : v === 'spouse' ? input.context?.spouseName : v === 'both' ? 'שניכם' : v);
      const opt = (f: { options?: { value: string; label: string }[] }, v: string) => f.options?.find(o => o.value === v)?.label ?? v;
      return a.items.map(it => input.spec.fields.map(f => {
        const v = (it as Record<string, string>)[f.key];
        if (!v) return '';
        return f.type === 'list' && f.list ? INSTITUTION_LISTS[f.list].items.find(e => e.id === v)?.label ?? v : f.type === 'who' ? who(v) : f.type === 'choice' ? opt(f, v) : v;
      }).filter(Boolean).join(' · ')).join(' | ');
    }
    default: return '';
  }
}

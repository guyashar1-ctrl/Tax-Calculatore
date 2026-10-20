// ─── 20.10.2026 · «סבב אחד» — מה שתשובה פותחת, מוכן מראש בתוך השאלה ──────────────────────────────────────────
// ‼ למה (בדיקת השלמות, 20.10 — docs/plans/2026-10-20-simplicity-roadmap.md §5): השאלון של הדוח השנתי לא נגמר בסבב אחד.
//   «כן» לדמי ביטוח לאומי ⇒ «דמי לידה?» רק בסבב הבא; «עדיין יש ביטוח חיים» ⇒ האישור השנתי רק בסבב הבא; «החשבון היה קיים
//   ב-2025» ⇒ ה-867 רק בסבב הבא — והמשרד היה צריך ללחוץ «הכן ופרסם» שוב ושוב. גיא: שאלון אחד, בלי סבב שני.
// ‼ איך: לכל שאלה שתשובה חיובית בה פותחת המשך (כן/לא, «מי מכם?», אישור «זה מה שידוע», תחולה של ישות, אריח ברשת) —
//   שואלים את המנוע עצמו «מה הייתי שואל אם התשובה הייתה כן?» (תמונה עם עובדה משוערת, אותו buildYearPicture ואותו
//   buildAskPlan), ושומרים את התשובה בתוך השאלה (prompt.onYes / option.followUps). השרת פותח אותן מיד כשהלקוח עונה כן
//   (264, כמו followUps של 262) — צילום שנשמר בזמן ההכנה במשרד, לא נוסח מהדפדפן. אין כאן כלל חדש: רק הקדמה של הסבב הבא.
// ‼ עומק מוגבל (2): שרשרת ארוכה יותר — נשארת ל«הכן ופרסם» של המשרד, כמו קודם.

import { buildYearPicture, type ItemStatus, type PictureInput } from './picture';
import { buildAskPlan, answerToFacts, GRID_KEYS, type AskCtx, type AskPlanEntry, type AskAnswer } from './asks';
import type { AskPrompt, InfoAsk, MultiFollowUp, YearFact } from './types';

const identity = (a: { itemKey: string; subjectRole: string; entityRef?: string }) => `${a.itemKey}|${a.subjectRole}|${a.entityRef ?? ''}`;
/**
 * ‼ 20.10.2026 · ישות חדשה (מזהה זמני «-new-»): מה שכבר נשאל עליה — לא נשאל שוב בתפקיד אחר. האריח «משכורת» לזוג פותח
 *   «טופס 106 — מכל מעסיק» (שניכם); ההקדמה הוסיפה לאותו מעסיק חדש עוד 106 «של {לקוח}» — ובסוף שני מסמכים זהים (גיא, דין).
 */
const entityKey = (a: { itemKey: string; entityRef?: string }) => (a.entityRef && /-new-/.test(a.entityRef) ? `${a.itemKey}|*|${a.entityRef}` : '');
const isTaken = (taken: Set<string>, a: { itemKey: string; subjectRole: string; entityRef?: string }) => taken.has(identity(a)) || (!!entityKey(a) && taken.has(entityKey(a)));
const withEntity = (list: { itemKey: string; subjectRole: string; entityRef?: string }[]) => list.flatMap(a => [identity(a), ...(entityKey(a) ? [entityKey(a)] : [])]);

/** איזו תשובה היא «כן» לשאלה הזו — או null כשאין לה המשך. ‼ אותו כלל כמו בשרת (264) וב-answerToFacts. */
export function yesAnswerOf(p: AskPrompt): AskAnswer | null {
  switch (p.input.kind) {
    case 'yesno': return { kind: 'yes' };
    case 'who': return { kind: 'who', value: 'both' };
    case 'confirm': return { kind: 'unchanged' };
    case 'record': return p.input.schema === 'period' ? { kind: 'record', value: { inPeriod: 'all' } } : null;
    default: return null;
  }
}

const HYP_AT = '9999-12-31T00:00:00.000Z';
let hypSeq = 0;
const fakeAsk = (e: { itemKey: string; subjectRole: InfoAsk['subjectRole']; entityKind?: InfoAsk['entityKind']; entityRef?: string; prompt: AskPrompt }, ctx: AskCtx): InfoAsk =>
  ({ id: `plan-${++hypSeq}`, clientId: ctx.client.id, taxYear: ctx.taxYear, stepId: 'plan', parentStepId: 'plan', itemKey: e.itemKey, subjectRole: e.subjectRole,
     entityKind: e.entityKind, entityRef: e.entityRef, prompt: e.prompt, state: 'published', createdAt: HYP_AT }) as InfoAsk;
const asFacts = (rows: ReturnType<typeof answerToFacts>['facts']): YearFact[] =>
  rows.map(f => ({ ...f, id: `hyp-${++hypSeq}`, createdAt: HYP_AT }) as unknown as YearFact);

/** פריט שנכנס למסך הרשת (אריח) — לא «המשך» של שאלה אחרת. */
const isGridMaterial = (s: ItemStatus) => GRID_KEYS.includes(s.item.key) || (s.item.kind === 'screener' && !!s.item.tile);

const toFollowUp = (e: AskPlanEntry): MultiFollowUp =>
  ({ itemKey: e.itemKey, subjectRole: e.subjectRole, ...(e.entityKind ? { entityKind: e.entityKind } : {}), ...(e.entityRef ? { entityRef: e.entityRef } : {}), prompt: e.prompt });

/**
 * מה המנוע היה שואל אם התשובות המשוערות היו נכונות — רק מה שחדש (לא בתוכנית, לא שאלה קיימת, לא אריח),
 * ולכל אחד מהם (עד העומק) — ההמשך שלו.
 */
function speculate(inp: PictureInput, ctx: AskCtx, facts: YearFact[], asks: InfoAsk[], taken: Set<string>, depth: number): MultiFollowUp[] {
  const pic = buildYearPicture({ ...inp, facts, asks });
  const fresh = [...pic.toConfirm, ...pic.toAsk].filter(s => !isGridMaterial(s) && !isTaken(taken, { itemKey: s.item.key, subjectRole: s.subjectRole, entityRef: s.entityRef === 'new' ? undefined : s.entityRef }));
  if (!fresh.length) return [];
  const plan = buildAskPlan(fresh, ctx).filter(e => !GRID_KEYS.includes(e.itemKey) && !isTaken(taken, e));
  if (!plan.length) return [];
  const planned = plan.map(e => fakeAsk(e, ctx));
  const nextTaken = new Set([...taken, ...withEntity(plan)]);
  const nextAsks = [...asks, ...planned];
  return plan.map((e, i) => {
    const yes = depth > 1 ? yesAnswerOf(e.prompt) : null;
    if (!yes) return toFollowUp(e);
    const more = speculate(inp, ctx, [...facts, ...asFacts(answerToFacts(planned[i], yes, ctx, inp.today).facts)], nextAsks, nextTaken, depth - 1);
    return toFollowUp(more.length ? { ...e, prompt: { ...e.prompt, onYes: more } } : e);
  });
}

/**
 * התוכנית, כשלכל שאלה מצורף מראש מה שתשובה חיובית בה תפתח — כדי שהשאלון ייגמר בסבב אחד.
 * ‼ inp — אותו קלט שממנו נבנתה התוכנית (buildYearPicture); ctx — אותו ctx של buildAskPlan.
 */
export function withOneRound(plan: AskPlanEntry[], inp: PictureInput, ctx: AskCtx, depth = 2): AskPlanEntry[] {
  if (ctx.purpose !== 'annual' || !plan.length) return plan;
  const planned = plan.map(e => fakeAsk(e, ctx));
  const asks = [...inp.asks, ...planned];
  const taken = new Set([...withEntity(inp.asks.filter(a => a.state !== 'cancelled')), ...withEntity(plan)]);
  return plan.map((e, i) => {
    const inpE = e.prompt.input;
    if (inpE.kind === 'multi') {
      const options = inpE.options.map(o => {
        const existing = [...(o.followUp ? [o.followUp] : []), ...(o.followUps ?? [])];
        // ‼ 20.10.2026 · מה שכבר אפשרות במסך בחירה שנפתח מהאריח («דמי לידה» ב«מה שולם מביטוח לאומי?») — לא נשאל שוב לבד
        const asOptions = existing.flatMap(f => (f.prompt.input.kind === 'multi' ? f.prompt.input.options.map(x => identity({ itemKey: x.key, subjectRole: x.role })) : []));
        const optTaken = new Set([...taken, ...withEntity(existing), ...asOptions]);
        const optAsks = [...asks, ...existing.map(f => fakeAsk(f, ctx))];
        const yesFacts = asFacts(answerToFacts(planned[i], { kind: 'multi', selected: [o.key] }, ctx, inp.today).facts.filter(f => f.itemKey === o.key));
        const more = speculate(inp, ctx, [...inp.facts, ...yesFacts], optAsks, optTaken, depth);
        return more.length ? { ...o, followUps: [...(o.followUps ?? []), ...more] } : o;
      });
      return { ...e, prompt: { ...e.prompt, input: { ...inpE, options } } };
    }
    const yes = yesAnswerOf(e.prompt);
    if (!yes) return e;
    const more = speculate(inp, ctx, [...inp.facts, ...asFacts(answerToFacts(planned[i], yes, ctx, inp.today).facts)], asks, taken, depth);
    return more.length ? { ...e, prompt: { ...e.prompt, onYes: more } } : e;
  });
}

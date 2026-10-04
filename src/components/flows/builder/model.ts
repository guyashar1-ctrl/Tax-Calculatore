// ─── בונה המסלולים · לוגיקה טהורה (בלי React) ───────────────────────────────
// מה שהמסך צריך לדעת על מסלול ואינו נמצא ב-features/flows: מי עושה כל פריט,
// אילו פעולות מול רשות קיימות, בדיקות שהשרת עושה ו-validateFlow לא, והטקסט
// לכל קוד שגיאה או סיבת דילוג שחוזרים מהשרת.
//
// ‼ כל בדיקה כאן היא העתק של בדיקה ב-flow_definition_error (215). המסך מונע
// שמירה שהשרת ידחה, במקום להציג אחר כך קוד שאיש לא מבין.

import type { ClientDocument } from '../../../lib/clientGuide';
import { buildDocumentRequestPayload } from '../../../lib/clientGuide';
import { templateForRef, type RequestTemplate } from '../../../lib/requestTemplates';
import type { LibraryLookup, FlowIssue } from '../../../features/flows/compile';
import { REPEATABLE_STEP_TYPES, hasPersonalConfirm, itemTitle, libraryEntryGap } from '../../../features/flows/compile';
import { LENS_KINDS, SAMPLE_FACTS, opensKey, systemGate, systemName, type Lens } from '../../../features/flows/preview';
import type { Verdict } from '../../../features/flows/conditions';
import type { FlowDefinition, FlowItem, FlowStage, FlowTrigger, ItemRef, When } from '../../../features/flows/types';
import { CLIENT_KIND_ORDER, metaFor, type ClientKind } from '../../../types/journeyDefaults';
import { FLOW_ACTIONS, actionTypeOf } from '../../../features/flows/types';
import { templateEntryOwner } from '../../../utils/templateEntryOwner';

// ── פעולות מול רשות ─────────────────────────────────────────────────────────

/**
 * ‼ השרת קורא ref.actionType (215: flow_definition_error, _flow_run_action),
 * והטיפוס ב-TS מגדיר actionId. כותבים את שניהם עם אותו ערך, וקוראים קודם
 * את actionType — כך הגדרה ששמורה בשרת נקראת נכון גם אם נוצרה בלי actionId.
 */
export const actionRef = (type: string): ItemRef =>
  ({ kind: 'action', actionId: type, actionType: type }) as ItemRef;
export const actionName = (type: string) => FLOW_ACTIONS.find(a => a.type === type)?.name ?? 'פעולה מול רשות';

/**
 * הגדרה כפי שהבונה עובד עליה: לכל פעולה מול רשות — שני השדות (actionRef).
 * ‼ הגדרה שנוצרה עם actionId בלבד הייתה מוצגת בשם הנכון (actionTypeOf) אבל
 * נפסלת בשמירה (validateFlow קורא actionType) — ונשמרת בלי השדה שהשרת קורא.
 */
export function normalizeDefinition(def: FlowDefinition): FlowDefinition {
  return {
    ...def,
    stages: def.stages.map(s => ({
      ...s,
      items: s.items.map(i => {
        if (i.ref.kind !== 'action') return i;
        const t = actionTypeOf(i.ref);
        return i.ref.actionType === t && i.ref.actionId === t ? i : { ...i, ref: actionRef(t) };
      }),
    })),
  };
}

// ── מי עושה ─────────────────────────────────────────────────────────────────
export type Actor = 'client' | 'office' | 'external' | 'document' | 'action';
export const ACTOR_LABELS: Record<Actor, string> = {
  client: 'הלקוח',
  office: 'אתה',
  external: 'גורם חיצוני',
  document: 'מסמך ללקוח',
  action: 'פעולה מול רשות',
};

/** מי מבצע בקשת מערכת — נגזר מ-REQUEST_META (extern / «בטיפול המשרד»), לא רשימה שנייה. */
export function systemActor(stepType: string): Actor {
  const m = metaFor(stepType);
  return m.extern ? 'external' : m.owner.includes('המשרד') ? 'office' : 'client';
}

export function itemActor(item: FlowItem, templates: RequestTemplate[]): Actor {
  switch (item.ref.kind) {
    case 'action': return 'action';
    case 'document': return 'document';
    case 'system': return systemActor(item.ref.stepType);
    case 'template': {
      // ‼ מי מבצע — אותו כלל כמו בשרת (_template_entry_owner): בעלים «המשרד» על בקשה עם
      // פריטים ללקוח, בלי «משימה של המשרד» מפורשת, נוצר כבקשה ללקוח.
      const entry = templateForRef(templates, item.ref.templateId)?.entries[0];
      if (!entry) return 'client';
      const owner = templateEntryOwner(entry);
      return owner === 'me' ? 'office' : owner;
    }
  }
}

/** מה שמגיע לדף של הלקוח — רק על זה «איך מגיע ללקוח» ותזכורת אומרים משהו. */
export const reachesClient = (a: Actor) => a === 'client' || a === 'document';

// ── הספרייה כפי שהתרגום והשמות צריכים אותה ─────────────────────────────────
export function buildLibraryLookup(templates: RequestTemplate[], docs: ClientDocument[]): LibraryLookup {
  return {
    template: (id) => {
      const t = templateForRef(templates, id);
      const e = t?.entries[0];
      if (!t || !e) return undefined;
      // owner — מי יבצע בפועל (templateEntryOwner), לא מה שנשמר; כך libraryEntryGap בודק את מה שהשרת ייצור.
      return { name: t.name, stepType: e.stepType || 'custom_request', owner: templateEntryOwner(e), payload: e.payload ?? {}, requiredForClose: e.requiredForClose };
    },
    document: (id) => {
      const d = docs.find(x => x.id === id);
      return d ? { name: d.label, payload: buildDocumentRequestPayload(d) } : undefined;
    },
  };
}

export const titleFor = (lib: LibraryLookup) => (item: FlowItem) => itemTitle(item, lib, systemName, actionName);

/** הצ'יפ הקבוע של בקשת מערכת בקליטה — «רק כשיש רו״ח קודם · קבוע». */
export function fixedGateChip(item: FlowItem, onboarding: boolean): string | null {
  if (!onboarding || item.ref.kind !== 'system') return null;
  const rule = systemGate(item.ref.stepType, {}).rule;
  return rule ? `רק ${rule} · קבוע` : null;
}

// ── בדיקות של המסך בלבד ────────────────────────────────────────────────────
// ‼ בדיקות המבנה שהשרת עושה (flow_definition_error) יושבות ב-validateFlow
// (features/flows/compile.ts) — מקום אחד. כאן רק מה שהוא שדה בטופס.
/**
 * בקשה מהספרייה שהשרת לא ייצור ללקוח: בקשה חופשית בלי מה למלא (validate_requirements),
 * או — במסלול שחוזר (לא הקליטה) — בקשת מסמכים בלי רשימת מסמכים, שהופכת שם
 * לבקשה חופשית (_flow_item_spec). בקליטה רשימה ריקה מקבלת את רשימת ברירת המחדל.
 * ‼ מוצג תמיד, לא רק בניסיון שמירה — זה פגם בספרייה, לא טעות בעריכה הנוכחית,
 * ובלי זה המשרד מגלה אותו רק כ«דולגה» אצל הלקוח.
 */
/**
 * האם לפריט יש אישור אישי — ואז לבן/בת הזוג נפתחת משימה אליך, ובדף רק החלק של
 * הקבצים/הפרטים אם יש כזה (_flow_has_personal_confirm, 215; refHasPagePart).
 * ‼ כלל אחד לבונה, לחלון ההפעלה ולחלון «הפרטים השתנו».
 * ‼ מסמך מהספרייה — תמיד כן: בקשת המסמך כוללת תמיד «עברתי על…» (_document_request_payload),
 * גם כשהמסמך כבר נמחק מהספרייה (השרת בונה אותה מהעותק באותה צורה). לכן לא תלוי בטעינת הספרייה.
 * בקשה מהספרייה — לפי הנוסח שלה; נמחקה מהספרייה ⇒ לפי העותק שנשמר בפריט, כמו השרת.
 */
export function refHasPersonalConfirm(
  ref: { kind: string },
  lib: { template: (id: string) => { payload?: Record<string, unknown> } | undefined } | null,
  snapshotPayload?: Record<string, unknown>,
): boolean {
  if (ref.kind === 'document') return true;
  if (ref.kind !== 'template') return false;
  const id = (ref as { templateId?: string }).templateId ?? '';
  return hasPersonalConfirm(lib?.template(id)?.payload ?? snapshotPayload);
}

/**
 * מה נפתח לבן/בת הזוג בבקשה «לכל אדם» שיש בה אישור אישי (_flow_materialize, 215):
 *   · false — אין אישור אישי: הבקשה כולה בדף של בעל הכרטיס, בשם בן/בת הזוג;
 *   · 'only' — כולה אישור אישי (למשל מסמך מהספרייה): רק משימה אליך;
 *   · 'with_page' — יש בה גם קבצים/פרטים: החלק הזה בדף של בעל הכרטיס בשם בן/בת
 *     הזוג (משק בית שמגיש יחד), והאישור עצמו — משימה אליך.
 * ‼ truthy ⇔ יש אישור אישי — כמו הבוליאני שהיה כאן.
 */
export type PersonalConfirm = false | 'only' | 'with_page';

/** יש בבקשה פריט שאינו אישור אישי — כמו המסנן ב-_flow_materialize (kind <> 'confirm'). */
export const hasPagePart = (payload: Record<string, unknown> | undefined) =>
  Array.isArray(payload?.requirements)
  && (payload!.requirements as { kind?: unknown }[]).some(r => typeof r?.kind === 'string' && r.kind !== 'confirm');

/**
 * האם לבקשה יש חלק שנפתח בדף גם לבן/בת הזוג (קבצים/פרטים, לא אישור).
 * ‼ מסמך מהספרייה — לא: בקשת המסמך היא רק «פתיחת…» ו«עברתי על…» (buildDocumentRequestPayload).
 */
export function refHasPagePart(
  ref: { kind: string },
  lib: { template: (id: string) => { payload?: Record<string, unknown> } | undefined } | null,
  snapshotPayload?: Record<string, unknown>,
): boolean {
  if (ref.kind !== 'template') return false;
  const id = (ref as { templateId?: string }).templateId ?? '';
  return hasPagePart(lib?.template(id)?.payload ?? snapshotPayload);
}

/** refHasPersonalConfirm + refHasPagePart — מה נפתח לבן/בת הזוג (PersonalConfirm). */
export function refPersonalConfirm(
  ref: { kind: string },
  lib: { template: (id: string) => { payload?: Record<string, unknown> } | undefined } | null,
  snapshotPayload?: Record<string, unknown>,
): PersonalConfirm {
  if (!refHasPersonalConfirm(ref, lib, snapshotPayload)) return false;
  return refHasPagePart(ref, lib, snapshotPayload) ? 'with_page' : 'only';
}

/** בקשה עם אישור אישי — לבן/בת הזוג נפתחת משימה אליך (ואולי גם החלק שבדף). */
export function personalConfirmOf(item: FlowItem, lib: LibraryLookup): PersonalConfirm {
  return refPersonalConfirm(item.ref, lib, item.snapshot?.payload);
}

/**
 * הצעת «גם לבן/בת הזוג» בחלון «הפרטים השתנו» — ‼ השרת קודם (personalConfirm,
 * pagePart מ-flow_run_suggestions); שדה שחסר (שרת ישן) — לפי הספרייה במסך.
 */
export function suggestionPersonalConfirm(
  s: { personalConfirm?: boolean; pagePart?: boolean }, fromLibrary: PersonalConfirm,
): PersonalConfirm {
  const confirm = typeof s.personalConfirm === 'boolean' ? s.personalConfirm : !!fromLibrary;
  if (!confirm) return false;
  const page = typeof s.pagePart === 'boolean' ? s.pagePart : fromLibrary === 'with_page';
  return page ? 'with_page' : 'only';
}

export const PER_PERSON_TEXT = 'יופיע בדף של בעל הכרטיס עם השם של בן/בת הזוג, והמייל יגיע אליו.';

/** ההסבר ליד «גם לבן/בת הזוג» בבונה. */
export function perPersonHint(pc: PersonalConfirm): string {
  if (pc === 'only') {
    return 'יש בבקשה אישור אישי (למשל «עברתי על…»), ובעל הכרטיס לא יכול לאשר במקום בן/בת הזוג. לכן לבן/בת הזוג לא תיפתח בקשה בדף — תיפתח לך משימה: להשיג ממנו/ה את האישור, או לסמן «אין צורך».';
  }
  if (pc === 'with_page') {
    return 'יש בבקשה אישור אישי (למשל «עברתי על…»), ובעל הכרטיס לא יכול לאשר במקום בן/בת הזוג. לכן לבן/בת הזוג: החלק של הקבצים והפרטים יופיע בדף של בעל הכרטיס עם השם של בן/בת הזוג, והאישור עצמו — משימה אליך: להשיג אותו ממנו/ה, או לסמן «אין צורך».';
  }
  return `${PER_PERSON_TEXT} בן/בת זוג עם כרטיס משלו לא נכלל/ת.`;
}

/**
 * התגית על פריט «גם לבן/בת הזוג» במפה. ‼ עם אישור אישי — מה שנפתח לבן/בת הזוג הוא משימה
 * אליך (ואולי גם החלק שבדף), לא עוד בקשה בדף; בלי זה הכרטיס הסתיר משימה שמחזיקה את השלב.
 */
export function perPersonTag(pc: PersonalConfirm): string {
  if (pc === 'only') return 'לבן/בת הזוג: משימה אליך';
  if (pc === 'with_page') return 'לבן/בת הזוג: קבצים בדף · האישור — משימה אליך';
  return 'גם לבן/בת הזוג';
}

/** חלון «הפרטים השתנו» — מה ייפתח ל{spouse} אם לוחצים «להוסיף». */
export function spouseAddText(pc: PersonalConfirm, owner: string, spouse: string): string {
  if (pc === 'only') return `תיפתח לך משימה להשיג את האישור האישי של ${spouse} — לא בדף ולא במייל`;
  if (pc === 'with_page') {
    return `הקבצים והפרטים יופיעו בדף של ${owner} עם השם של ${spouse}, ומייל עליהם — ל${owner}. האישור האישי — משימה אליך, לא בדף ולא במייל`;
  }
  // ‼ המייל תמיד לבעל הכרטיס (214) — לבן/בת הזוג אין מייל משלו.
  return `יופיע בדף של ${owner} עם השם של ${spouse}, ומייל עליו — ל${owner}`;
}

/** חלון ההפעלה — מה נפתח לבן/בת הזוג, כהמשך לשורת הפריט. */
export function planSpouseText(pc: PersonalConfirm, owner: string): string {
  if (pc === 'only') return ' · לבן/בת הזוג: משימה אליך להשיג את האישור האישי (אין לו/ה דף משלו)';
  if (pc === 'with_page') return ` · לבן/בת הזוג: הקבצים והפרטים — בדף של ${owner}, והאישור האישי — משימה אליך`;
  return ` · גם לבן/בת הזוג — בדף של ${owner}`;
}

export function libraryIssues(def: FlowDefinition, lib: LibraryLookup, trigger: FlowTrigger): FlowIssue[] {
  const out: FlowIssue[] = [];
  const repeatable = trigger !== 'quote_approved';
  for (const s of def.stages) for (const i of s.items) {
    // ‼ מסמך שהוסר מהספרייה — השרת לא יוצר אותו (אין עותק שמור למסמך: _flow_item_spec),
    // ואצל כל לקוח נפתחת שורה אדומה «לא נוצרה». עדיף לתפוס כאן, פעם אחת.
    if (i.ref.kind === 'document') {
      if (!lib.document(i.ref.docId)) {
        const name = i.snapshot?.title?.trim();
        out.push({
          itemKey: i.key, notCreated: 'הוסר מהספרייה',
          message: `${name ? `המסמך «${name}»` : 'המסמך'} הוסר מהספרייה — לא ייווצר אצל אף לקוח. מעלים אותו שוב בספרייה, או מסירים אותו מהמסלול`,
        });
      }
      continue;
    }
    if (i.ref.kind !== 'template') continue;
    const t = lib.template(i.ref.templateId);
    // ‼ בקשה שנמחקה מהספרייה — השרת יוצר אותה מהעותק שנשמר בפריט; בלי עותק — לא נוצרת.
    if (!t) {
      if (!i.snapshot) {
        out.push({
          itemKey: i.key, notCreated: 'נמחקה מהספרייה',
          message: 'בקשה שנמחקה מהספרייה, ואין לה עותק שמור — לא תיווצר אצל אף לקוח. מסירים אותה מהמסלול ומוסיפים בקשה אחרת',
        });
      }
      continue;
    }
    if (repeatable && !REPEATABLE_STEP_TYPES.includes(t.stepType)) {
      out.push({ itemKey: i.key, message: `«${t.name}» נוצרת פעם אחת ללקוח — לא חוזרת בכל הפעלה. מסירים אותה מהמסלול`, notCreated: 'נוצרת פעם אחת ללקוח' });
      continue;
    }
    const gap = libraryEntryGap(t.stepType, t.owner, t.payload);
    if (gap === 'no_items') {
      out.push({ itemKey: i.key, message: `בבקשה «${t.name}» בספרייה אין מה למלא — מוסיפים לה פריטים בספרייה, או מסירים אותה מהמסלול`, notCreated: 'אין בה מה למלא' });
    } else if (gap === 'no_documents' && trigger !== 'quote_approved') {
      out.push({ itemKey: i.key, message: `בבקשה «${t.name}» בספרייה אין רשימת מסמכים — מוסיפים מסמכים בספרייה, או מסירים אותה מהמסלול`, notCreated: 'אין רשימת מסמכים' });
    }
  }
  return out;
}

export function extraIssues(def: FlowDefinition, trigger: FlowTrigger, lib?: LibraryLookup): FlowIssue[] {
  const out: FlowIssue[] = lib ? libraryIssues(def, lib, trigger) : [];
  for (const s of def.stages) for (const i of s.items) {
    if (i.after === i.key) out.push({ itemKey: i.key, message: 'פריט לא נפתח אחרי עצמו' });
    if (i.dueInDays != null && (!Number.isInteger(i.dueInDays) || i.dueInDays < 0 || i.dueInDays > 365)) {
      out.push({ itemKey: i.key, message: 'יעד בימים: מספר שלם עד 365' });
    }
  }
  return out;
}

/** כל מה שחוסם שמירה, בלי כפילויות באותו מקום. */
export function allIssues(def: FlowDefinition, trigger: FlowTrigger, validate: (d: FlowDefinition, o: { onboarding: boolean }) => FlowIssue[], lib?: LibraryLookup): FlowIssue[] {
  const seen = new Set<string>();
  return [...validate(def, { onboarding: trigger === 'quote_approved' }), ...extraIssues(def, trigger, lib)].filter(x => {
    const k = `${x.stageKey ?? ''}|${x.itemKey ?? ''}|${x.message}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

// ── שינויים בהגדרה ──────────────────────────────────────────────────────────
/** מי מצביע על הפריט — כדי לא להסיר פריט ששלב או פריט אחר מחכים לו. */
export function dependentsOfItem(def: FlowDefinition, itemKey: string): string[] {
  const out: string[] = [];
  for (const s of def.stages) {
    if (s.opens.after === 'item' && s.opens.item === itemKey) out.push(`השלב «${s.name}»`);
    for (const i of s.items) if (i.after === itemKey) out.push('פריט באותו שלב');
  }
  return out;
}

export function dependentsOfStage(def: FlowDefinition, stageKey: string): FlowStage[] {
  const stage = def.stages.find(s => s.key === stageKey);
  const keys = new Set(stage?.items.map(i => i.key) ?? []);
  return def.stages.filter(s => s.key !== stageKey
    && ((s.opens.after === 'stage' && s.opens.stage === stageKey) || (s.opens.after === 'item' && keys.has(s.opens.item))));
}

/**
 * כל השלבים שנפתחים אחרי השלב — ישירות או דרך שלב אחר. ‼ «מתי נפתח» שמצביע על
 * אחד מהם (או על פריט שבו) היה סוגר מעגל, והמפה הייתה מאבדת את ההתחלה שלה.
 */
export function stagesAfter(def: FlowDefinition, stageKey: string): Set<string> {
  const out = new Set<string>();
  const queue = [stageKey];
  while (queue.length) {
    for (const d of dependentsOfStage(def, queue.shift()!)) {
      if (d.key === stageKey || out.has(d.key)) continue;
      out.add(d.key);
      queue.push(d.key);
    }
  }
  return out;
}

export const patchStage = (def: FlowDefinition, key: string, fn: (s: FlowStage) => FlowStage): FlowDefinition =>
  ({ ...def, stages: def.stages.map(s => s.key === key ? fn(s) : s) });

export const patchItem = (def: FlowDefinition, itemKey: string, fn: (i: FlowItem) => FlowItem): FlowDefinition =>
  ({ ...def, stages: def.stages.map(s => s.items.some(i => i.key === itemKey) ? { ...s, items: s.items.map(i => i.key === itemKey ? fn(i) : i) } : s) });

export function removeItem(def: FlowDefinition, itemKey: string): FlowDefinition {
  return { ...def, stages: def.stages.map(s => ({ ...s, items: s.items.filter(i => i.key !== itemKey) })) };
}

/**
 * העברה לשלב אחר. ‼ «אחרי» מתייחס לאותו שלב בלבד — לכן הוא נמחק בהעברה,
 * וגם מפריטים בשלב הישן שחיכו לפריט שעזב.
 */
export function moveItemToStage(def: FlowDefinition, itemKey: string, toStage: string): FlowDefinition {
  const from = def.stages.find(s => s.items.some(i => i.key === itemKey));
  const item = from?.items.find(i => i.key === itemKey);
  if (!from || !item || from.key === toStage) return def;
  const moved: FlowItem = { ...item };
  delete moved.after;
  return {
    ...def,
    stages: def.stages.map(s => s.key === from.key
      ? { ...s, items: s.items.filter(i => i.key !== itemKey).map(i => i.after === itemKey ? withoutAfter(i) : i) }
      : s.key === toStage ? { ...s, items: [...s.items, moved] } : s),
  };
}

function withoutAfter(i: FlowItem): FlowItem {
  const n = { ...i };
  delete n.after;
  return n;
}

export function moveInList<T>(list: T[], idx: number, delta: number): T[] {
  const j = idx + delta;
  if (idx < 0 || j < 0 || j >= list.length) return list;
  const a = [...list];
  [a[idx], a[j]] = [a[j], a[idx]];
  return a;
}

/**
 * סדר ההצגה בין שלבים שנפתחים באותו רגע. ‼ מחליף מקום רק עם שלב שיש לו אותו
 * «נפתח» — מיקום ברשימה אינו סדר ביצוע, ולכן אין «למעלה» אל רגע אחר.
 */
export function moveWithinMoment(def: FlowDefinition, stageKey: string, delta: -1 | 1): FlowDefinition {
  const idx = def.stages.findIndex(s => s.key === stageKey);
  if (idx < 0) return def;
  const k = opensKey(def.stages[idx].opens);
  let j = idx + delta;
  while (j >= 0 && j < def.stages.length && opensKey(def.stages[j].opens) !== k) j += delta;
  if (j < 0 || j >= def.stages.length) return def;
  const a = [...def.stages];
  [a[idx], a[j]] = [a[j], a[idx]];
  return { ...def, stages: a };
}

// ── סיכום שלב ולפי רגע: מה קורה ומה מגיע ללקוח ────────────────────────────
/**
 * סוגי הבקשות שנכללים במייל המרוכז ללקוח — לפי _client_announceable_steps (214):
 * ייצוג, שאלון והרשאת תשלום — יש להם מייל משלהם; בקשה של המשרד או של גורם חיצוני —
 * לא מגיעה ללקוח בכלל. ‼ כבר לא העתק מדויק: בשרת נכלל גם rep_client_approval, אבל
 * רק כששע״ם דורשת את האישור (payload.requiredBy = 'shaam') — ורק במייל ידני ובתזכורת
 * ידנית, אף פעם לא לבד. במסלול הוא נשאר 'own': הוא נולד כשהבקשה מוגשת לשע״ם (לא
 * מפריט במסלול), ולעולם לא יוצא במייל המרוכז «לבד» של שלב — ולכן אינו ברשימה.
 */
export const CLIENT_EMAIL_STEP_TYPES = ['client_documents', 'custom_request', 'paperless_tax_authority', 'paperless_invite', 'prev_accountant_details'];

export type MailRoute = 'email' | 'own' | 'none';

/** האם הפריט נכנס למייל המרוכז ללקוח, יש לו מייל משלו, או שהוא לא מגיע ללקוח. */
export function mailRoute(item: FlowItem, lib: LibraryLookup, templates: RequestTemplate[]): MailRoute {
  const actor = itemActor(item, templates);
  if (!reachesClient(actor)) return 'none';
  if (item.ref.kind === 'document') return 'email';
  if (item.ref.kind === 'system') return CLIENT_EMAIL_STEP_TYPES.includes(item.ref.stepType) ? 'email' : 'own';
  if (item.ref.kind === 'template') {
    const t = lib.template(item.ref.templateId);
    const st = t?.stepType ?? item.snapshot?.stepType ?? 'custom_request';
    if (t?.payload && (t.payload as Record<string, unknown>).messageOnly === true) return 'none';
    return CLIENT_EMAIL_STEP_TYPES.includes(st) ? 'email' : 'own';
  }
  return 'none';
}

export interface StageCounts { client: number; office: number; external: number; actionsAuto: number; actionsManual: number }

/** «5 ללקוח · 1 לך · 2 לגורם חיצוני» — רק מה שייפתח (skip = מה שהעדשה או הספרייה מוציאות). */
export function stageCounts(stage: FlowStage, templates: RequestTemplate[], skip: (i: FlowItem) => boolean = () => false): StageCounts {
  const c: StageCounts = { client: 0, office: 0, external: 0, actionsAuto: 0, actionsManual: 0 };
  for (const i of stage.items) {
    if (skip(i)) continue;
    const a = itemActor(i, templates);
    if (a === 'client' || a === 'document') c.client++;
    else if (a === 'office') c.office++;
    else if (a === 'external') c.external++;
    else if (i.mode === 'auto') c.actionsAuto++;
    else c.actionsManual++;
  }
  return c;
}

/**
 * @param conditional כמה מהפריטים ללקוח חלים רק על חלק מהלקוחות (תנאי פריט או שער קבוע) —
 *   ‼ ב«כולם» אומרים «2 לכל לקוח · עוד 2 לפי הלקוח», לא «4 ללקוח» שנקרא כאילו כל לקוח מקבל 4.
 */
export function countsText(c: StageCounts, conditional = 0): string {
  const parts: string[] = [];
  const cond = Math.min(conditional, c.client);
  if (c.client && cond === 0) parts.push(`${c.client} ללקוח`);
  else if (c.client && cond === c.client) parts.push(`${cond} ללקוח — לפי הלקוח`);
  else if (c.client) parts.push(`${c.client - cond} לכל לקוח · עוד ${cond} לפי הלקוח`);
  if (c.office) parts.push(`${c.office} לך`);
  if (c.external) parts.push(`${c.external} לגורם חיצוני`);
  const acts = c.actionsAuto + c.actionsManual;
  if (acts) {
    const what = acts === 1 ? 'קריאה מהרשות' : `${acts} קריאות מהרשות`;
    parts.push(c.actionsManual === 0 ? `${what} — לבד, כשאפשר` : c.actionsAuto === 0 ? `${what} — בלחיצה שלך` : what);
  }
  return parts.length ? parts.join(' · ') : 'אין כאן כלום עדיין';
}

export interface MailEntry { key: string; title: string; isDocument: boolean; depends: boolean; stageKey: string }
export interface MomentMail {
  /** «בדף מיד, מייל כשתשלח» — מייל מרוכז שממתין במגש. */
  approve: MailEntry[];
  /** «מייל אוטומטי» — יוצא לבד, רק עם הפריטים של שלבי «לבד» (214: origin auto). */
  auto: MailEntry[];
  /** «מחכה לאישורך» — לא בדף עד «פרסם בדף». */
  hold: MailEntry[];
  /** «בדף, בלי מייל». */
  page: MailEntry[];
  /** מגיע ללקוח במייל משלו (ייצוג, שאלון, הרשאת תשלום). */
  own: MailEntry[];
}

/**
 * מה יוצא ללקוח ברגע אחד. ‼ רק מה שנפתח ברגע עצמו: פריט «אחרי» נפתח מאוחר יותר
 * ונכנס למייל של אז. ‼ מייל «לבד» כולל רק פריטים של שלבי «לבד»; את השאר שולחים
 * מהמגש — כמו _client_notice_items בשרת.
 */
export function momentMail(def: FlowDefinition, stageKeys: string[], lib: LibraryLookup, templates: RequestTemplate[],
  title: (i: FlowItem) => string, verdict: (s: FlowStage, i: FlowItem) => Verdict, notCreated: ReadonlySet<string>): MomentMail {
  const out: MomentMail = { approve: [], auto: [], hold: [], page: [], own: [] };
  for (const key of stageKeys) {
    const s = def.stages.find(x => x.key === key);
    if (!s) continue;
    for (const i of s.items) {
      if (i.after || notCreated.has(i.key)) continue;
      const v = verdict(s, i);
      if (v.state === 'off') continue;
      const route = mailRoute(i, lib, templates);
      if (route === 'none') continue;
      const e: MailEntry = { key: i.key, title: title(i), isDocument: i.ref.kind === 'document', depends: v.state === 'depends', stageKey: s.key };
      if (route === 'own') out.own.push(e);
      else out[s.delivery].push(e);
    }
  }
  return out;
}

// ── «איך ייראה» — לאיזה לקוח לדוגמה, ולמה אין מייל ─────────────────────────
export const lensValue = (l: Lens) => l.t === 'sample' ? `s${l.i}` : l.t === 'kind' ? `k:${l.kind}` : 's0';
const MAIL_CANDIDATES: Lens[] = [
  ...SAMPLE_FACTS.map((_, i): Lens => ({ t: 'sample', i })),
  ...LENS_KINDS.map((kind): Lens => ({ t: 'kind', kind })),
];
const hasMail = (m: MomentMail) => m.approve.length + m.auto.length + m.hold.length > 0;

/**
 * ‼ «כולם» אינו לקוח — מציגים את הלקוח הראשון לדוגמה שמקבל מייל ברגע הזה,
 * ולא תמיד את הראשון ברשימה (שאולי לא מקבל כלום ונראה כאילו אין מייל).
 */
export function firstLensWithMail(initial: Lens, mailFor: (l: Lens) => MomentMail): { lens: Lens; picked: boolean } {
  if (initial.t !== 'all') return { lens: initial, picked: false };
  const hit = MAIL_CANDIDATES.find(l => hasMail(mailFor(l)));
  return { lens: hit ?? MAIL_CANDIDATES[0], picked: !!hit && lensValue(hit) !== 's0' };
}

/** למה אין מייל ללקוח הזה ברגע הזה — לפי מה שבאמת קורה לו בו. */
export function noMailText(m: MomentMail): string {
  const own = m.own.map(e => `«${e.title}»`).join(', ');
  const ownMail = m.own.length > 1 ? 'כל אחת במייל נפרד משלה' : 'במייל נפרד משלה';
  if (m.page.length) {
    // ‼ «רק בדף — בלי מייל ובלי תזכורות» (DELIVERY_LABELS.page), לא «בדף, בלי מייל» — כך נקרא
    // הסימן בשורת הבקשה, שמשמעותו ההפוכה: המייל עוד יכול לצאת.
    return `ללקוח הזה לא יוצא מייל מרוכז ברגע הזה. רק בדף — בלי מייל ובלי תזכורות: ${m.page.map(e => e.title).join(' · ')}.`
      + (own ? ` ${own} — ${ownMail}.` : '');
  }
  if (own) return `ללקוח הזה לא יוצא מייל מרוכז ברגע הזה — רק ${own}, ${ownMail}.`;
  return 'ללקוח הזה לא נפתח ברגע הזה שום דבר שמגיע לדף שלו — ולכן גם אין מייל.';
}

/** תנאי ריק נשמר כ«אין תנאי» — כך diff לא מראה שינוי מדומה. */
export function cleanWhen(w: When | undefined): When | undefined {
  if (!w) return undefined;
  const kinds = w.kinds?.length ? w.kinds : undefined;
  const facts = w.facts?.length ? w.facts : undefined;
  if (!kinds && !facts) return undefined;
  return { ...(kinds ? { kinds } : {}), ...(facts ? { facts } : {}) };
}

/** לאילו סוגי לקוח בקשת מערכת עוד לא קיימת במסלול (בתוך תחום השלב). */
export function freeKindsForSystem(def: FlowDefinition, stage: FlowStage, stepType: string): ClientKind[] {
  const scope = stage.when?.kinds?.length ? stage.when.kinds : CLIENT_KIND_ORDER;
  return scope.filter(kind => !def.stages.some(s => s.items.some(i =>
    i.ref.kind === 'system' && !i.fixed && i.ref.stepType === stepType
    && (!s.when?.kinds?.length || s.when.kinds.includes(kind))
    && (!i.when?.kinds?.length || i.when.kinds.includes(kind)))));
}


const isSystem = (i: FlowItem) => i.ref.kind === 'system' && !i.fixed;
export const hasNonFixedSystem = (stage: FlowStage) => stage.items.some(isSystem);

/** על מי השמירה לא חלה — מי שכבר באמצע, ובאיזו גרסה. */
export function runsText(runsByVersion: Record<string, number> | undefined, current: number): string {
  const entries = Object.entries(runsByVersion ?? {}).filter(([, n]) => n > 0);
  const total = entries.reduce((a, [, n]) => a + n, 0);
  if (total === 0) return 'חל על לקוחות חדשים בלבד. אין כרגע לקוחות באמצע המסלול.';
  const who = total === 1 ? 'לקוח אחד באמצע ממשיך' : `${total} לקוחות באמצע ממשיכים`;
  const ver = entries.length === 1 ? `בגרסה ${entries[0][0]}` : `בגרסה שבה התחילו (עד ${current})`;
  return `חל על לקוחות חדשים בלבד. ${who} ${ver} — אפשר לעדכן כל אחד מהכרטיס שלו.`;
}


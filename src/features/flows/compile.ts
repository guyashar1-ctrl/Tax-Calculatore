// ─── מסלול הקליטה → חמש הרשימות שהמחולל הקיים קורא ─────────────────────────
// ‼ המחולל (generate_onboarding_steps) נשאר היצרן היחיד של בקשות הקליטה. מסלול
// הקליטה אינו מנוע שני: בשמירה הוא מתורגם לאותו מבנה שהמשרד ערך עד היום —
// רשימה לכל סוג לקוח ב-office_journey_defaults — והשרת שומר את שני הדברים
// יחד (save_office_flow). הכיוון ההפוך (חמש רשימות → מסלול) קורה פעם אחת
// בשרת: ensure_onboarding_flow ב-216.
//
// ‼ כללי התרגום נגזרים מהמחולל, לא מהמסך:
//   · בקשת מערכת = רשומה אחת לכל סוג שלב בכל סוג לקוח (journey_default_entry
//     לוקחת את הראשונה). שני פריטים מאותו סוג שחלים על אותו סוג לקוח — שגיאה.
//   · תנאי עובדה על בקשת מערכת אינו ניתן לאכיפה (השערים במחולל קבועים) —
//     שגיאה, במקום הבטחה שהשרת לא יקיים.
//   · בקשה מהספרייה = רשומת משרד: templateId (השרת קורא את הנוסח בזמן היצירה),
//     תנאי העובדות ב-when, וה-payload כגיבוי בלבד.

import type { DefaultEntry, DefaultVariant } from '../../types/journeyDefaults';
import { CLIENT_KIND_ORDER, variantLabel } from '../../types/journeyDefaults';
import type { ClientKind, FlowDefinition, FlowItem, FlowStage, When } from './types';
import { FLOW_ACTION_TYPES, actionTypeOf } from './types';

/**
 * ‼ מה המחולל עושה כשלפריט אין רשימה משלו (system: {} ⇒ variants: []): journey_default_variant
 * מחזיר null, ו-generate_onboarding_steps (216) נופל לרשימות הקבועות לפי מצב הלקוח — אותן
 * רשימות שהזריעה הראשונה של כל משרד כותבת (135: default_journey_entries). העורך מציג אותן,
 * ועריכה מתחילה מהן. שינוי באחד בלי השני ⇒ המסך משקר.
 */
export const BUILT_IN_VARIANTS: Record<string, DefaultVariant[]> = {
  client_documents: [
    { key: 'new_business', fact: 'new_business', items: [
      { key: 'vat_cert', label: 'תעודת עוסק' }, { key: 'id_card', label: 'צילום תעודת זהות' }, { key: 'bank_confirm', label: 'אישור ניהול חשבון בנק' }] },
    { key: 'has_prev', fact: 'has_prev', items: [
      { key: 'bank_confirm', label: 'אישור ניהול חשבון בנק' }, { key: 'last_return', label: 'דוח שנתי אחרון' }, { key: 'form106', label: 'טופס 106' }] },
    { key: 'default', fact: null, items: [
      { key: 'id_card', label: 'צילום תעודת זהות' }, { key: 'bank_confirm', label: 'אישור ניהול חשבון בנק' }] },
  ],
  prev_accountant_details: [
    { key: 'no_email', fact: 'no_prev_email',
      copy: { clientTitle: 'פרטי רואה החשבון הקודם שלך', clientSub: 'שם, אימייל וטלפון - כדי שנפנה אליו בשמך', clientCta: 'למילוי' },
      items: [{ key: 'name', label: 'שם רואה החשבון' }, { key: 'email', label: 'כתובת אימייל' }, { key: 'phone', label: 'טלפון' }] },
    { key: 'default', fact: null,
      copy: { clientTitle: 'לאשר את פרטי רואה החשבון הקודם', clientSub: 'הפרטים שאצלנו מוצגים למילוי מראש - רק לוודא שהם נכונים', clientCta: 'לאישור' },
      items: [{ key: 'confirm', label: 'אישור שהפרטים נכונים' }] },
  ],
};

export interface LibraryLookup {
  /** תבנית בקשה מהספרייה: הסוג, ה-payload, והשם לתצוגה. */
  template(id: string): { name: string; stepType: string; owner?: string; payload: Record<string, unknown>; requiredForClose?: boolean } | undefined;
  /** מסמך מהספרייה → ה-payload של «שליחת מסמך» (buildDocumentRequestPayload). */
  document(id: string): { name: string; payload: Record<string, unknown> } | undefined;
}

export interface CompiledEntry extends DefaultEntry {
  stageKey: string;
  flowItemKey: string;
  templateId?: string;
  when?: When;
}

export type Compiled = Record<ClientKind, CompiledEntry[]>;

export interface FlowIssue {
  stageKey?: string; itemKey?: string; message: string;
  /** הפריט לא ייווצר בכלל (לא רק אזהרה) — במשפט קצר, ל«מה יקרה». */
  notCreated?: string;
}

/** סוגי בקשה מהספרייה שנוצרים מחדש בכל ריצה של מסלול שחוזר — אותו כלל כמו _flow_item_spec (not_repeatable). */
export const REPEATABLE_STEP_TYPES = ['custom_request', 'client_documents'];

/**
 * בקשה שיש בה אישור אישי (פריט confirm). ‼ לא נפתחת לבן/בת הזוג בדף של בעל הכרטיס —
 * הוא היה מאשר במקומו/ה. אותו כלל כמו _flow_has_personal_confirm בשרת.
 */
export const hasPersonalConfirm = (payload: Record<string, unknown> | undefined) =>
  Array.isArray(payload?.requirements) && (payload!.requirements as { kind?: string }[]).some(r => r.kind === 'confirm');

/** יש במסלול פעולה מול רשות שמוגדרת «לבד» — ההפעלה צריכה הרשאה מפורשת. */
export const hasAutoActions = (def: FlowDefinition) =>
  def.stages.some(s => s.items.some(i => i.ref.kind === 'action' && i.mode === 'auto'));

/**
 * בקשה בספרייה שהשרת לא ייצור ללקוח — מקום אחד לספרייה ולבונה המסלולים:
 *   · 'no_items' — בקשה חופשית שהלקוח ממלא, בלי פריטים (validate_requirements);
 *   · 'no_documents' — בקשת מסמכים בלי רשימה. במסלול שחוזר היא הופכת לבקשה
 *     חופשית (_flow_item_spec) ומדולגת; בקליטה מקבלת את רשימת ברירת המחדל.
 */
export function libraryEntryGap(stepType: string, owner: string | undefined, payload: Record<string, unknown> | undefined): 'no_items' | 'no_documents' | null {
  const nonEmpty = (v: unknown) => Array.isArray(v) && v.length > 0;
  if (stepType === 'custom_request' && (owner ?? 'client') === 'client' && !nonEmpty(payload?.requirements)) return 'no_items';
  if (stepType === 'client_documents' && !nonEmpty(payload?.checklist)) return 'no_documents';
  return null;
}

/** מה חל על סוג לקוח: תנאי השלב ∧ תנאי הפריט, בחלק של הסוגים בלבד. */
function kindApplies(kind: ClientKind, ...ws: (When | undefined)[]): boolean {
  return ws.every(w => !w?.kinds?.length || w.kinds.includes(kind));
}

function factsOf(...ws: (When | undefined)[]): When | undefined {
  const facts = ws.flatMap(w => w?.facts ?? []);
  return facts.length ? { facts } : undefined;
}

const itemIndex = (def: FlowDefinition) => {
  const m = new Map<string, { item: FlowItem; stage: FlowStage }>();
  for (const stage of def.stages) for (const item of stage.items) m.set(item.key, { item, stage });
  return m;
};

/** בדיקות מבנה שהשרת בודק שוב (flow_definition_valid). מחזיר רשימה ריקה כשתקין. */
export function validateFlow(def: FlowDefinition, opts: { onboarding: boolean }): FlowIssue[] {
  const issues: FlowIssue[] = [];
  const stageKeys = new Set<string>();
  const items = itemIndex(def);
  const seenItem = new Set<string>();
  if (def.stages.length === 0) issues.push({ message: 'אין במסלול אף שלב' });

  for (const stage of def.stages) {
    if (stageKeys.has(stage.key)) issues.push({ stageKey: stage.key, message: 'שני שלבים עם אותו מזהה' });
    stageKeys.add(stage.key);
    if (!stage.name.trim()) issues.push({ stageKey: stage.key, message: 'לשלב אין שם' });
    for (const item of stage.items) {
      if (seenItem.has(item.key)) issues.push({ itemKey: item.key, message: 'שני פריטים עם אותו מזהה' });
      seenItem.add(item.key);
      if (item.after) {
        const a = items.get(item.after);
        if (!a) issues.push({ itemKey: item.key, message: 'נפתח אחרי פריט שלא קיים' });
        else if (a.stage.key !== stage.key) issues.push({ itemKey: item.key, message: '«אחרי» מתייחס לפריט באותו שלב בלבד' });
      }
      if (item.ref.kind === 'action' && item.perPerson) {
        issues.push({ itemKey: item.key, message: 'פעולה מול רשות אינה «לכל אדם» במסלול' });
      }
      if (opts.onboarding && item.ref.kind === 'system' && !item.fixed && factsOf(stage.when, item.when)) {
        issues.push({ itemKey: item.key, message: 'בקשת מערכת נוצרת לפי כללים קבועים — אפשר להגביל אותה רק לפי סוג לקוח' });
      }
      if (item.ref.kind === 'action' && !(FLOW_ACTION_TYPES as readonly string[]).includes(actionTypeOf(item.ref))) {
        issues.push({ itemKey: item.key, message: 'הפעולה הזו לא נתמכת במסלול' });
      }
      if (item.ref.kind === 'system' && !item.fixed) {
        if (!opts.onboarding) issues.push({ itemKey: item.key, message: 'בקשת מערכת נוצרת רק במסלול הקליטה' });
        else if (stage.opens.after !== 'start') issues.push({ itemKey: item.key, message: 'בקשת מערכת נפתחת רק בשלב שנפתח מיד' });
      }
      if (item.perPerson && (opts.onboarding || item.ref.kind === 'system' || item.ref.kind === 'action')) {
        issues.push({ itemKey: item.key, message: '«גם לבן/בת הזוג» רק לבקשה מהספרייה במסלול ידני או שנתי' });
      }
      if (item.after && (item.ref.kind === 'action' || items.get(item.after)?.item.ref.kind === 'action')) {
        issues.push({ itemKey: item.key, message: 'פעולה מול רשות לא מחכה לפריט ואין מה לחכות לה' });
      }
      // ‼ מצב בלי מסמכים אינו «הלקוח לא יקבל כלום»: המחולל יוצר ממנו «להעלות 0 מסמכים» —
      // בקשה ריקה בדף של לקוח חדש. (פריט בלי רשימה משלו נופל לרשימות הקבועות — תקין.)
      if (opts.onboarding && item.ref.kind === 'system' && item.ref.stepType === 'client_documents') {
        for (const v of item.system?.variants ?? []) {
          if ((v.items ?? []).some(x => String(x.label ?? '').trim())) continue;
          issues.push({
            itemKey: item.key,
            message: `במצב «${variantLabel(v.key, v.fact)}» אין מסמכים — לקוח במצב הזה יקבל בקשה ריקה. מוסיפים מסמך${v.fact === null ? '' : ', או מסירים את המצב'}`,
          });
        }
      }
    }
  }
  // שלב שנפתח אחרי שלב/פריט שלא קיים, או מעגל
  for (const stage of def.stages) {
    const o = stage.opens;
    if (o.after === 'stage' && !stageKeys.has(o.stage)) issues.push({ stageKey: stage.key, message: 'נפתח אחרי שלב שלא קיים' });
    if (o.after === 'item' && !items.has(o.item)) issues.push({ stageKey: stage.key, message: 'נפתח אחרי פריט שלא קיים' });
    if (o.after === 'item' && items.get(o.item)?.item.ref.kind === 'action') {
      issues.push({ stageKey: stage.key, message: 'שלב לא נפתח אחרי פעולה מול רשות — אין לה «הושלם»' });
    }
    if (o.after === 'item' && items.get(o.item)?.stage.key === stage.key) {
      issues.push({ stageKey: stage.key, message: 'שלב לא נפתח אחרי פריט שנמצא בתוכו' });
    }
    if (stage.reminder && (stage.reminder.afterDays < 1 || stage.reminder.afterDays > 60 || stage.reminder.max < 1 || stage.reminder.max > 5)) {
      issues.push({ stageKey: stage.key, message: 'תזכורת: כל 1–60 ימים, עד 5 פעמים' });
    }
    if (o.after === 'stage' && o.stage === stage.key) issues.push({ stageKey: stage.key, message: 'שלב לא יכול להיפתח אחרי עצמו' });
  }
  const parentOf = (s: FlowStage): string | null =>
    s.opens.after === 'stage' ? s.opens.stage
      : s.opens.after === 'item' ? (items.get(s.opens.item)?.stage.key ?? null) : null;
  for (const stage of def.stages) {
    const seen = new Set<string>([stage.key]);
    let cur = parentOf(stage);
    while (cur) {
      if (seen.has(cur)) { issues.push({ stageKey: stage.key, message: 'השלבים נפתחים זה אחרי זה במעגל' }); break; }
      seen.add(cur);
      const next = def.stages.find(s => s.key === cur);
      cur = next ? parentOf(next) : null;
    }
  }
  // אותה בקשת מערכת פעמיים לאותו סוג לקוח
  if (opts.onboarding) {
    for (const kind of CLIENT_KIND_ORDER) {
      const seenType = new Map<string, string>();
      for (const stage of def.stages) for (const item of stage.items) {
        if (item.ref.kind !== 'system' || item.fixed || !kindApplies(kind, stage.when, item.when)) continue;
        const prev = seenType.get(item.ref.stepType);
        if (prev) issues.push({ itemKey: item.key, message: 'אותה בקשת מערכת מופיעה פעמיים לאותו סוג לקוח' });
        else seenType.set(item.ref.stepType, item.key);
      }
    }
  }
  return issues;
}

/**
 * התרגום עצמו. מחזיר רשומות לכל אחד מחמשת הסוגים, בסדר המסלול
 * (שלב × פריט), עם sortIndex מחדש — כמו שמירה במסך הישן.
 */
export function compileOnboarding(def: FlowDefinition, lib: LibraryLookup): Compiled {
  const items = itemIndex(def);
  const out = {} as Compiled;
  for (const kind of CLIENT_KIND_ORDER) {
    const list: CompiledEntry[] = [];
    for (const stage of def.stages) {
      for (const item of stage.items) {
        if (item.fixed || item.ref.kind === 'action') continue;
        if (!kindApplies(kind, stage.when, item.when)) continue;
        const after = item.after ? items.get(item.after)?.item : undefined;
        const base = {
          enabled: true,
          sortIndex: 0,
          dueInDays: item.dueInDays ?? null,
          stageKey: stage.key,
          flowItemKey: item.key,
        };
        if (item.ref.kind === 'system') {
          list.push({
            ...base,
            key: item.ref.stepType,
            stepType: item.ref.stepType,
            source: 'system',
            requiredForClose: item.system?.requiredForClose ?? (item.optional ? false : null),
            dependsOn: after?.ref.kind === 'system' ? after.ref.stepType : null,
            variants: item.system?.variants ?? [],
            ...(item.system?.authorities ? { authorities: item.system.authorities } : {}),
          });
          continue;
        }
        const resolved = item.ref.kind === 'template'
          ? lib.template(item.ref.templateId)
          : lib.document(item.ref.docId);
        const payload = resolved?.payload ?? item.snapshot?.payload ?? null;
        const stepType = item.ref.kind === 'template'
          ? (lib.template(item.ref.templateId)?.stepType ?? item.snapshot?.stepType ?? 'custom_request')
          : 'custom_request';
        list.push({
          ...base,
          key: item.entryKey || item.key,
          stepType,
          source: 'office',
          requiredForClose: !item.optional,
          dependsOn: null,
          variants: [],
          payload: payload as Record<string, unknown> | null,
          ...(item.ref.kind === 'template' ? { templateId: item.ref.templateId } : { documentId: item.ref.docId }),
          ...(factsOf(stage.when, item.when) ? { when: factsOf(stage.when, item.when) } : {}),
        });
      }
    }
    list.forEach((e, i) => { e.sortIndex = (i + 1) * 10; });
    out[kind] = list;
  }
  return out;
}

/** שם תצוגה לפריט — מהספרייה, ואם נמחק משם — מהעותק. */
export function itemTitle(item: FlowItem, lib: LibraryLookup, systemName: (stepType: string) => string,
  actionName: (id: string) => string): string {
  switch (item.ref.kind) {
    case 'system': return systemName(item.ref.stepType);
    case 'template': return lib.template(item.ref.templateId)?.name ?? item.snapshot?.title ?? 'בקשה שנמחקה מהספרייה';
    case 'document': return lib.document(item.ref.docId)?.name ?? item.snapshot?.title ?? 'מסמך שנמחק מהספרייה';
    case 'action': return actionName(actionTypeOf(item.ref));
  }
}

// ─── «מה יקרה» — לפני השמירה וההפעלה ────────────────────────────────────────
// ‼ תצוגה בלבד; ההחלטה בשרת. לכן כל כלל כאן הוא העתק מפורש של כלל בשרת:
//   · תנאים — whenMatches (שוויון מוכח מול flow_when_matches).
//   · בקשות המערכת בקליטה — השערים הקבועים של generate_onboarding_steps
//     (174:388-601). שינוי שם בלי שינוי כאן ⇒ התצוגה משקרת.

import { CLIENT_KIND_LABELS, CLIENT_KIND_ORDER, metaFor, type ClientKind } from '../../types/journeyDefaults';
import { VERDICT_ON, onlyPhrase, whenMatches, whenParts, whenVerdict, whyNot, type Verdict } from './conditions';
import type { ClientFacts, Delivery, FlowDefinition, FlowItem, FlowStage, FlowTrigger, Opens, When } from './types';
import { DELIVERY_LABELS } from './types';

/** השער הקבוע של בקשת מערכת במחולל — ומשפט שמסביר אותו. */
export function systemGate(stepType: string, f: ClientFacts): { applies: boolean; rule: string | null } {
  const needsPaperless = (f.monthly === true || f.paperless === true);
  switch (stepType) {
    case 'representation': return { applies: f.rep === true, rule: 'כשההצעה כוללת ייצוג' };
    case 'prev_accountant_details':
    case 'release_letter':
    case 'materials_received': return { applies: f.has_prev === true, rule: 'כשיש רו״ח קודם' };
    case 'paperless_invite':
    case 'paperless_connection': return { applies: needsPaperless, rule: 'כשההצעה כוללת שירות חודשי או הנהלת חשבונות' };
    case 'paperless_tax_authority': return { applies: needsPaperless && f.licensed === true, rule: 'כשיש פייפרלס — לעוסק מורשה או חברה' };
    case 'retainer_authorization': return { applies: f.monthly === true, rule: 'כשיש סכום חודשי בהצעה' };
    default: return { applies: true, rule: null };
  }
}

export const SYSTEM_NAMES: Record<string, string> = {
  representation: 'בקשת ייצוג (מההצעה)',
};
export const systemName = (stepType: string) => SYSTEM_NAMES[stepType] ?? metaFor(stepType).name;

/**
 * ‼ סוג עוסק לא ידוע אינו «לא מתאים»: פריט/שלב שמוגבל לסוגי עוסק מחכה לו (217 —
 * kind_unknown / waitingKind), ולא «רק לעוסק מורשה». אותו משפט בתצוגה ובשרת.
 */
export const KIND_UNKNOWN_TEXT = 'סוג העוסק לא ידוע';

/** תנאי עם סוגי לקוח, כשסוג העוסק של הלקוח לא ידוע. */
const waitsForKind = (when: When | undefined, facts: ClientFacts) => !facts.kind && !!when?.kinds?.length;

export interface PlannedItem {
  key: string;
  title: string;
  applies: boolean;
  why: string | null;
  /** לא ייפתח עכשיו כי סוג העוסק לא ידוע — ייתכן שייפתח אחרי שיקבעו אותו. */
  kindUnknown?: boolean;
  kind: FlowItem['ref']['kind'];
  optional: boolean;
  after?: string;
  roles: ('client' | 'spouse')[];
  mode?: 'auto' | 'manual';
}

export interface PlannedStage {
  key: string;
  name: string;
  opensNow: boolean;
  opensLabel: string;
  delivery: Delivery;
  deliveryLabel: string;
  applies: boolean;
  why: string | null;
  /** השלב מוגבל לסוגי עוסק וסוג העוסק לא ידוע — יחכה לו (לא «לא חל»). */
  kindUnknown?: boolean;
  items: PlannedItem[];
  parallelWith: string[];
}

export function opensLabel(stage: FlowStage, def: FlowDefinition, title: (item: FlowItem) => string): string {
  const o = stage.opens;
  if (o.after === 'start') return 'מיד כשהמסלול מתחיל';
  if (o.after === 'stage') return `אחרי שהשלב «${def.stages.find(s => s.key === o.stage)?.name ?? '?'}» הושלם`;
  const it = def.stages.flatMap(s => s.items).find(i => i.key === o.item);
  return `אחרי שהבקשה «${it ? title(it) : '?'}» הושלמה`;
}

/** תכנון ללקוח לדוגמה (או אמיתי): מה ייפתח, מה לא ולמה, ואיך זה מגיע אליו. */
export function planFor(def: FlowDefinition, trigger: FlowTrigger, facts: ClientFacts,
  title: (item: FlowItem) => string): PlannedStage[] {
  const onboarding = trigger === 'quote_approved';
  return def.stages.map(stage => {
    const stageApplies = whenMatches(stage.when, facts);
    const stageKind = waitsForKind(stage.when, facts);
    // ‼ סוג לא ידוע — לא «רק לעוסק מורשה» (whyNot): הסיבה היא שהסוג לא ידוע.
    const stageWhy = stageApplies ? null : stageKind ? KIND_UNKNOWN_TEXT : whyNot(stage.when, facts);
    const items: PlannedItem[] = stage.items.map(item => {
      let applies = stageApplies && whenMatches(item.when, facts);
      const itemKind = !stageApplies ? stageKind : waitsForKind(item.when, facts);
      let why = !stageApplies ? stageWhy : itemKind ? KIND_UNKNOWN_TEXT : whyNot(item.when, facts);
      if (applies && onboarding && item.ref.kind === 'system') {
        const g = systemGate(item.ref.stepType, facts);
        if (!g.applies) { applies = false; why = g.rule ? `רק ${g.rule}` : null; }
      }
      const roles: ('client' | 'spouse')[] = item.perPerson && facts.hasSpouse ? ['client', 'spouse'] : ['client'];
      return {
        key: item.key, title: title(item), applies, why, kind: item.ref.kind,
        kindUnknown: !applies && itemKind,
        optional: !!item.optional, after: item.after, roles, mode: item.mode,
      };
    });
    const parallelWith = def.stages
      .filter(s => s.key !== stage.key && JSON.stringify(s.opens) === JSON.stringify(stage.opens))
      .map(s => s.name);
    return {
      key: stage.key, name: stage.name, opensNow: stage.opens.after === 'start',
      opensLabel: opensLabel(stage, def, title), delivery: stage.delivery,
      deliveryLabel: DELIVERY_LABELS[stage.delivery].long,
      applies: stageApplies, why: stageWhy, kindUnknown: !stageApplies && stageKind, items, parallelWith,
    };
  });
}

/** סיכום השינויים בין שתי גרסאות — לחלון השמירה ול«לעדכן את הלקוח». */
export function flowDiff(prev: FlowDefinition, next: FlowDefinition) {
  const items = (d: FlowDefinition) => new Map(d.stages.flatMap(s => s.items.map(i => [i.key, { item: i, stage: s.key }] as const)));
  const a = items(prev), b = items(next);
  const added = [...b.keys()].filter(k => !a.has(k));
  const removed = [...a.keys()].filter(k => !b.has(k));
  const changed = [...b.keys()].filter(k => a.has(k) && JSON.stringify(a.get(k)) !== JSON.stringify(b.get(k)));
  const stagesA = new Map(prev.stages.map(s => [s.key, JSON.stringify({ ...s, items: undefined })]));
  const stageChanged = next.stages.filter(s => stagesA.has(s.key) && stagesA.get(s.key) !== JSON.stringify({ ...s, items: undefined })).map(s => s.key);
  const stagesAdded = next.stages.filter(s => !stagesA.has(s.key)).map(s => s.key);
  const stagesRemoved = prev.stages.filter(s => !next.stages.some(x => x.key === s.key)).map(s => s.key);
  return { added, removed, changed, stageChanged, stagesAdded, stagesRemoved,
           empty: !added.length && !removed.length && !changed.length && !stageChanged.length && !stagesAdded.length && !stagesRemoved.length };
}

let seq = 0;
/** מזהה קצר לשלב/פריט חדש. ‼ יציב לאורך גרסאות — לא נגזר מהשם. */
export const newKey = (prefix: string) => `${prefix}${Date.now().toString(36)}${(seq++).toString(36)}`;

export const blankDefinition = (): FlowDefinition => ({
  stages: [{ key: newKey('s'), name: 'שלב ראשון', opens: { after: 'start' }, delivery: 'approve', reminder: null, notifyOffice: false, items: [] }],
});

// ─── מפת הביצוע: רגעים, ענפים, ומה מקבל כל סוג לקוח ─────────────────────────
// ‼ הסדר נגזר מ-opens בלבד — לא ממיקום ברשימה. def.stages קובע רק את סדר
// ההצגה בתוך אותו רגע. שלבים עם אותו opens נפתחים באותו רגע, כלומר במקביל.

export const opensKey = (o: Opens) => o.after === 'start' ? 'start' : o.after === 'stage' ? `stage:${o.stage}` : `item:${o.item}`;

export interface Moment {
  key: string;
  opens: Opens;
  /** כמה המתנות לפניו: 0 = בהתחלה. */
  depth: number;
  stageKeys: string[];
  label: string;
  /** השלב שהרגע מחכה לו (או השלב של הפריט שהוא מחכה לו) — לקישור בכותרת. */
  waitsFor?: { stageKey: string; name: string; itemKey?: string };
}

/**
 * עומק כל שלב בשרשרת «נפתח אחרי». ‼ מעגל או הפניה לשלב/פריט שנמחקו —
 * validateFlow מסמן אותם; כאן הם רק נופלים לרגע ההתחלה, כדי שהמפה לא תקרוס.
 */
export function stageDepths(def: FlowDefinition): Map<string, number> {
  const byKey = new Map(def.stages.map(s => [s.key, s]));
  const stageOfItem = new Map(def.stages.flatMap(s => s.items.map(i => [i.key, s.key] as const)));
  const memo = new Map<string, number>();
  const walking = new Set<string>();
  const depth = (key: string): number => {
    const hit = memo.get(key);
    if (hit !== undefined) return hit;
    const s = byKey.get(key);
    if (!s || walking.has(key)) return 0;
    walking.add(key);
    const o = s.opens;
    const parent = o.after === 'stage' ? o.stage : o.after === 'item' ? stageOfItem.get(o.item) : undefined;
    const d = parent && byKey.has(parent) && parent !== key && !walking.has(parent) ? depth(parent) + 1 : 0;
    walking.delete(key);
    memo.set(key, d);
    return d;
  };
  for (const s of def.stages) depth(s.key);
  return memo;
}

/** הרגעים לפי סדר הביצוע: עומק, ואז סדר ההצגה של השלב הראשון בכל רגע. */
export function flowMoments(def: FlowDefinition, opts: { onboarding: boolean; title: (item: FlowItem) => string }): Moment[] {
  const depths = stageDepths(def);
  const order = new Map(def.stages.map((s, i) => [s.key, i]));
  const items = new Map(def.stages.flatMap(s => s.items.map(i => [i.key, { item: i, stage: s }] as const)));
  const byKey = new Map<string, Moment>();
  for (const s of def.stages) {
    const k = opensKey(s.opens);
    const m = byKey.get(k);
    if (m) { m.stageKeys.push(s.key); continue; }
    const o = s.opens;
    let label = opts.onboarding ? 'באישור ההצעה' : 'כשהמסלול מתחיל';
    let waitsFor: Moment['waitsFor'];
    if (o.after === 'stage') {
      const p = def.stages.find(x => x.key === o.stage);
      label = `אחרי שהשלב «${p?.name || 'שלב שהוסר'}» הושלם`;
      if (p) waitsFor = { stageKey: p.key, name: p.name };
    } else if (o.after === 'item') {
      const hit = items.get(o.item);
      const t = hit ? opts.title(hit.item) : 'פריט שהוסר';
      label = `אחרי שהבקשה «${t}» הושלמה`;
      if (hit) waitsFor = { stageKey: hit.stage.key, name: hit.stage.name, itemKey: o.item };
    }
    byKey.set(k, { key: k, opens: o, depth: depths.get(s.key) ?? 0, stageKeys: [s.key], label, waitsFor });
  }
  const first = (m: Moment) => Math.min(...m.stageKeys.map(k => order.get(k) ?? 0));
  return [...byKey.values()].sort((a, b) => a.depth - b.depth || first(a) - first(b));
}

// ── במקביל, או אחד מהשניים ─────────────────────────────────────────────────
const kindsDisjoint = (a: When | undefined, b: When | undefined) =>
  !!(a?.kinds?.length && b?.kinds?.length && !a.kinds.some(k => b.kinds!.includes(k)));

/**
 * שני תנאים שלא ייתכן שיתקיימו לאותו לקוח: סוגי לקוח זרים, או אותה עובדה בשני
 * הכיוונים. ‼ רק מה שוודאי — חפיפה חלקית («עוסק מורשה וחברה» מול «חברה») נחשבת
 * «יכולים להיפתח יחד».
 */
export function exclusiveWhen(a: When | undefined, b: When | undefined): boolean {
  if (kindsDisjoint(a, b)) return true;
  return (a?.facts ?? []).some(f => (b?.facts ?? []).some(g => g.key === f.key && g.is !== f.is));
}

/**
 * מסלול ריצה אחד בתוך רגע: שלב אחד, או חלופות — שלבים שלא ייתכן שייפתחו לאותו
 * לקוח (ענפים לפי סוג/עובדה). חלופות הן «או», לא «במקביל».
 */
export interface Lane { stageKeys: string[]; alt: boolean; byKind: boolean }

/** השלבים של רגע אחד (בסדר ההצגה) כמסלולים שרצים במקביל. */
export function momentLanes(stages: FlowStage[]): Lane[] {
  const used = new Set<string>();
  const lanes: Lane[] = [];
  for (const s of stages) {
    if (used.has(s.key)) continue;
    const group = [s];
    for (const t of stages) {
      if (used.has(t.key) || group.includes(t)) continue;
      if (group.every(g => exclusiveWhen(g.when, t.when))) group.push(t);
    }
    for (const g of group) used.add(g.key);
    const alt = group.length > 1;
    const byKind = alt && group.every(g => group.every(h => g === h || kindsDisjoint(g.when, h.when)));
    lanes.push({ stageKeys: group.map(g => g.key), alt, byKind });
  }
  return lanes;
}

/**
 * עם מי מסלול נפתח — שמות השלבים במסלולים שלפניו שיכולים להיפתח לאותו לקוח,
 * מסלול לכל רשימה (חלופות של אותו מסלול — «או»). ‼ לא «השלב הקודם ברשימה»:
 * ענף של עוסק פטור אינו «במקביל» לענף של חברה.
 */
export function lanePartners(stages: FlowStage[], lanes: Lane[], idx: number): string[][] {
  const byKey = new Map(stages.map(s => [s.key, s]));
  const of = (l: Lane) => l.stageKeys.map(k => byKey.get(k)).filter((s): s is FlowStage => !!s);
  const mine = lanes[idx] ? of(lanes[idx]) : [];
  return lanes.slice(0, idx)
    .map(l => of(l).filter(s => mine.some(m => !exclusiveWhen(m.when, s.when))).map(s => s.name))
    .filter(names => names.length > 0);
}

/**
 * רגעים שלא מחכים לרגע שמעליהם במפה — הם מחכים לשלב ברגע מוקדם יותר. ‼ על
 * הציר שני רגעים צמודים נראים כשרשרת; כאן מסמנים מתי זו לא שרשרת.
 */
export function detachedMoments(moments: Moment[]): Set<string> {
  const out = new Set<string>();
  moments.forEach((m, i) => {
    if (i > 0 && m.waitsFor && !moments[i - 1].stageKeys.includes(m.waitsFor.stageKey)) out.add(m.key);
  });
  return out;
}

/** «＋ שלב חדש» — אחרי השלב האחרון ברגע האחרון, לא אחרי מה שאחרון ברשימה. */
export function defaultOpensForNewStage(def: FlowDefinition): Opens {
  if (!def.stages.length) return { after: 'start' };
  const moments = flowMoments(def, { onboarding: false, title: () => '' });
  const last = moments[moments.length - 1];
  const key = last.stageKeys[last.stageKeys.length - 1];
  return { after: 'stage', stage: key };
}

// ── מה מקבל כל סוג לקוח ────────────────────────────────────────────────────
/** «כולם» · סוג לקוח (רק הסוג ידוע) · לקוח לדוגמה (הכול ידוע). */
export type Lens = { t: 'all' } | { t: 'kind'; kind: ClientKind } | { t: 'sample'; i: number };

export interface LensFacts { facts: ClientFacts; known: 'all' | ReadonlySet<string>; label: string }

/** הסוגים שבהם «עוסק מורשה או חברה» נקבע מהסוג עצמו. */
const LICENSED_BY_KIND: Partial<Record<ClientKind, boolean>> = { exempt_dealer: false, licensed_dealer: true, company: true };

/**
 * ‼ «עוסק מורשה או חברה» (licensed) נגזר בשרת גם מהסוג וגם מהרשומה של הלקוח
 * (215:79, 216:521 — dealer_type / vat_status). לכן הוא ידוע רק לעוסק פטור,
 * לעוסק מורשה ולחברה; לקוח «ייצוג בלבד» או «החזר מס» יכול להיות עוסק מורשה —
 * אצלו זה «תלוי». כל השאר (ייצוג, רו״ח קודם, נשוי/אה…) — לא ידוע.
 */
export function lensFacts(lens: Lens): LensFacts {
  if (lens.t === 'sample') {
    const s = SAMPLE_FACTS[lens.i] ?? SAMPLE_FACTS[0];
    return { facts: s.facts, known: 'all', label: s.label };
  }
  if (lens.t === 'kind') {
    const lic = LICENSED_BY_KIND[lens.kind];
    return lic === undefined
      ? { facts: { kind: lens.kind }, known: new Set(['kind']), label: CLIENT_KIND_LABELS[lens.kind] }
      : { facts: { kind: lens.kind, licensed: lic }, known: new Set(['kind', 'licensed']), label: CLIENT_KIND_LABELS[lens.kind] };
  }
  return { facts: {}, known: new Set(), label: 'כל הלקוחות' };
}

const GATE_KEYS = ['rep', 'has_prev', 'monthly', 'paperless', 'licensed'] as const;

/**
 * השער הקבוע של בקשת מערכת, כשחלק מהעובדות לא ידוע: מריצים את systemGate עצמו
 * על כל הצירופים של מה שלא ידוע — כך אין כאן עותק שני של הכלל.
 */
export function systemVerdict(stepType: string, lf: LensFacts): Verdict {
  const unknown = GATE_KEYS.filter(k => lf.known !== 'all' && !lf.known.has(k));
  let yes = 0, no = 0;
  for (let mask = 0; mask < (1 << unknown.length); mask++) {
    const f: ClientFacts = { ...lf.facts };
    unknown.forEach((k, i) => { f[k] = (mask & (1 << i)) !== 0; });
    if (systemGate(stepType, f).applies) yes++; else no++;
  }
  const rule = systemGate(stepType, lf.facts).rule;
  if (no === 0) return VERDICT_ON;
  return { state: yes === 0 ? 'off' : 'depends', why: rule ? `רק ${rule}` : null };
}

const worst = (vs: Verdict[]): Verdict =>
  vs.find(v => v.state === 'off') ?? vs.find(v => v.state === 'depends') ?? VERDICT_ON;

export function stageVerdict(stage: FlowStage, lf: LensFacts): Verdict {
  return whenVerdict(stage.when, lf.facts, lf.known);
}

/** האם הפריט ייפתח לסוג/ללקוח הזה — תנאי השלב, תנאי הפריט, והשער הקבוע בקליטה. */
export function itemVerdict(stage: FlowStage, item: FlowItem, onboarding: boolean, lf: LensFacts): Verdict {
  const vs = [stageVerdict(stage, lf), whenVerdict(item.when, lf.facts, lf.known)];
  if (onboarding && item.ref.kind === 'system') vs.push(systemVerdict(item.ref.stepType, lf));
  return worst(vs);
}

// ── הענפים בתוך שלב ────────────────────────────────────────────────────────
/** התנאי של פריט כמשפט — תנאי הפריט ועוד השער הקבוע של בקשת מערכת בקליטה. */
export function itemConditionParts(item: FlowItem, onboarding: boolean): string[] {
  const parts = whenParts(item.when);
  if (onboarding && item.ref.kind === 'system') {
    const rule = systemGate(item.ref.stepType, {}).rule;
    if (rule) parts.push(rule);
  }
  return [...new Set(parts)];
}

export const ALL_CLIENTS_LABEL = 'לכל הלקוחות';

export interface ItemNode { item: FlowItem; children: ItemNode[]; afterOutside?: string }
export interface ItemGroup { label: string; conditional: boolean; nodes: ItemNode[]; size: number }

/**
 * פריטי השלב לפי התנאי שלהם: «לכל הלקוחות» קודם, ואז קבוצה לכל תנאי לפי סדר
 * ההופעה. פריט «אחרי» יושב מתחת לפריט שהוא מחכה לו כשהם באותה קבוצה; אחרת
 * הוא נשאר בקבוצה שלו עם הפניה (afterOutside). ‼ מעגל של «אחרי» — validateFlow
 * מסמן; כאן כל פריט מוצג פעם אחת בדיוק.
 */
export function groupStageItems(stage: FlowStage, onboarding: boolean): ItemGroup[] {
  const labelOf = (i: FlowItem) => {
    const parts = itemConditionParts(i, onboarding);
    return onlyPhrase(parts);
  };
  const labels = new Map(stage.items.map(i => [i.key, labelOf(i)]));
  const keys = new Set(stage.items.map(i => i.key));
  const order: string[] = [];
  for (const i of stage.items) {
    const l = labels.get(i.key)!;
    if (!order.includes(l)) order.push(l);
  }
  order.sort((a, b) => (a === ALL_CLIENTS_LABEL ? -1 : b === ALL_CLIENTS_LABEL ? 1 : 0));
  const placed = new Set<string>();
  const nodeOf = (i: FlowItem, label: string): ItemNode => {
    placed.add(i.key);
    const children = stage.items
      .filter(c => c.after === i.key && !placed.has(c.key) && labels.get(c.key) === label)
      .map(c => nodeOf(c, label));
    return { item: i, children };
  };
  const count = (n: ItemNode): number => 1 + n.children.reduce((a, c) => a + count(c), 0);
  return order.map(label => {
    const nodes: ItemNode[] = [];
    for (const i of stage.items) {
      if (placed.has(i.key) || labels.get(i.key) !== label) continue;
      const parentHere = i.after && i.after !== i.key && keys.has(i.after) && labels.get(i.after) === label;
      if (parentHere && !placed.has(i.after!) && reachesRoot(stage, i.key)) continue;
      const node = nodeOf(i, label);
      if (i.after && i.after !== i.key && !parentHere) node.afterOutside = i.after;
      nodes.push(node);
    }
    // מה שלא שובץ (מעגל של «אחרי») — מוצג בכל זאת, בראש הקבוצה שלו.
    for (const i of stage.items) {
      if (!placed.has(i.key) && labels.get(i.key) === label) nodes.push(nodeOf(i, label));
    }
    return { label, conditional: label !== ALL_CLIENTS_LABEL, nodes, size: nodes.reduce((a, n) => a + count(n), 0) };
  });
}

/** שרשרת «אחרי» של הפריט מגיעה לפריט שאינו מחכה לאיש בשלב — כלומר אין מעגל. */
function reachesRoot(stage: FlowStage, key: string): boolean {
  const byKey = new Map(stage.items.map(i => [i.key, i]));
  const seen = new Set<string>();
  let cur = byKey.get(key);
  while (cur?.after && byKey.has(cur.after)) {
    if (seen.has(cur.key)) return false;
    seen.add(cur.key);
    cur = byKey.get(cur.after);
  }
  return true;
}

export const LENS_KINDS: ClientKind[] = CLIENT_KIND_ORDER;

/** לקוחות לדוגמה ל«מה יקרה» — סוג + עובדות, בלי נתונים אישיים. */
export const SAMPLE_FACTS: { label: string; facts: ClientFacts }[] = [
  { label: 'עוסק מורשה, עם רו״ח קודם, הנהלת חשבונות, ייצוג', facts: { kind: 'licensed_dealer', has_prev: true, monthly: true, paperless: true, rep: true, licensed: true } },
  { label: 'עוסק פטור, עסק חדש, ייצוג', facts: { kind: 'exempt_dealer', new_business: true, rep: true } },
  { label: 'חברה, נשוי/אה, הנהלת חשבונות', facts: { kind: 'company', married: true, hasSpouse: true, monthly: true, paperless: true, licensed: true, rep: true } },
  { label: 'החזר מס', facts: { kind: 'tax_refund' } },
];

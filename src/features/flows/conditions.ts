// ─── תנאים: אותה סמנטיקה בדיוק כמו flow_when_matches בשרת (215) ─────────────
// ‼ השוויון מוכח בבדיקה: fixtures/whenCases.json רץ גם כאן (בדיקת יחידה) וגם
// מול השרת (scripts/staging-test-flows.mjs). שינוי כאן בלי שינוי שם — שבור.

import { CLIENT_KIND_LABELS, type ClientKind } from '../../types/journeyDefaults';
import type { ClientFacts, FlowFactKey, When } from './types';
import { FLOW_FACT_LABELS } from './types';

/**
 * ריק = חל. סוגים: אחד מהם (סוג לא ידוע אינו מתאים לרשימה לא ריקה).
 * עובדות: כולן חייבות להתקיים; עובדה שלא ידועה נחשבת false — כמו בשרת,
 * שם jsonb חסר הופך ל-false ולא ל-NULL שבולע את התנאי.
 */
export function whenMatches(when: When | undefined | null, facts: ClientFacts): boolean {
  if (!when) return true;
  if (when.kinds && when.kinds.length > 0) {
    if (!facts.kind || !when.kinds.includes(facts.kind)) return false;
  }
  for (const f of when.facts ?? []) {
    if ((facts[f.key] === true) !== f.is) return false;
  }
  return true;
}

/** «רק: עוסק מורשה · חברה» / «מגיע מרו״ח אחר» — צ'יפים קצרים, בלי תחביר. */
export function whenChips(when: When | undefined | null): string[] {
  if (!when) return [];
  const out: string[] = [];
  if (when.kinds?.length) out.push(when.kinds.map(k => CLIENT_KIND_LABELS[k]).join(' · '));
  for (const f of when.facts ?? []) out.push(f.is ? FLOW_FACT_LABELS[f.key].yes : FLOW_FACT_LABELS[f.key].no);
  return out;
}

/** «א, ב וג» — רשימה בעברית, בלי «·» שנראה כמו תחביר. */
export function heList(xs: string[]): string {
  if (xs.length <= 1) return xs[0] ?? '';
  return `${xs.slice(0, -1).join(', ')} ו${xs[xs.length - 1]}`;
}

/** איך כל עובדה נקראת במשפט «רק …». ‼ תצוגה בלבד — הסמנטיקה ב-whenMatches. */
const FACT_PHRASES: Record<FlowFactKey, { yes: string; no: string }> = {
  married: { yes: 'כשנשוי/אה', no: 'כשלא נשוי/אה' },
  has_prev: { yes: 'כשמגיע מרו״ח אחר', no: 'כשאין רו״ח קודם' },
  new_business: { yes: 'לעסק חדש', no: 'לעסק קיים' },
  monthly: { yes: 'כשיש שירות חודשי בהצעה', no: 'כשאין שירות חודשי בהצעה' },
  paperless: { yes: 'כשיש פייפרלס או הנהלת חשבונות', no: 'כשאין פייפרלס' },
  licensed: { yes: 'לעוסק מורשה או חברה', no: 'למי שאינו עוסק מורשה או חברה' },
  rep: { yes: 'כשההצעה כוללת ייצוג', no: 'כשההצעה לא כוללת ייצוג' },
  no_prev_email: { yes: 'כשאין מייל של הרו״ח הקודם', no: 'כשיש מייל של הרו״ח הקודם' },
};
export const factPhrase = (key: FlowFactKey, is: boolean) => FACT_PHRASES[key][is ? 'yes' : 'no'];
const ALL_BUT = 'לכולם חוץ מ';
/** «לעוסק מורשה וחברה»; כשחסר רק סוג אחד — «לכולם חוץ מהחזר מס», במקום רשימה של ארבעה. */
export function kindsPhrase(kinds: ClientKind[]): string {
  const all = Object.keys(CLIENT_KIND_LABELS) as ClientKind[];
  const rest = all.filter(k => !kinds.includes(k));
  if (kinds.length >= 3 && rest.length === 1) return `${ALL_BUT}${CLIENT_KIND_LABELS[rest[0]]}`;
  return `ל${heList(kinds.map(k => CLIENT_KIND_LABELS[k]))}`;
}

/** «רק לעוסק פטור, כשנשוי/אה» · «לכולם חוץ מהחזר מס» · «לכל הלקוחות». */
export function onlyPhrase(parts: string[]): string {
  if (!parts.length) return 'לכל הלקוחות';
  return parts[0].startsWith(ALL_BUT) ? parts.join(', ') : `רק ${parts.join(', ')}`;
}

/** חלקי התנאי כמשפט: «לעוסק מורשה וחברה», «כשנשוי/אה». ריק = לכולם. */
export function whenParts(when: When | undefined | null): string[] {
  if (!when) return [];
  const out: string[] = [];
  if (when.kinds?.length) out.push(kindsPhrase(when.kinds));
  for (const f of when.facts ?? []) out.push(factPhrase(f.key, f.is));
  return out;
}

/** למה הפריט לא חל — התנאי הראשון שלא מתקיים, במשפט אחד. */
export function whyNot(when: When | undefined | null, facts: ClientFacts): string | null {
  if (!when) return null;
  if (when.kinds?.length && (!facts.kind || !when.kinds.includes(facts.kind))) {
    return onlyPhrase([kindsPhrase(when.kinds)]);
  }
  for (const f of when.facts ?? []) {
    if ((facts[f.key] === true) !== f.is) return `רק ${factPhrase(f.key, f.is)}`;
  }
  return null;
}

/** תשובה בשלוש: חל / לא חל / תלוי במה שעוד לא ידוע (כשבוחרים רק סוג לקוח, או «כולם»). */
export type VerdictState = 'on' | 'off' | 'depends';
export interface Verdict { state: VerdictState; why: string | null }
export const VERDICT_ON: Verdict = { state: 'on', why: null };

/**
 * כמו whenMatches, כשרק חלק מהעובדות ידוע. ‼ כשהכול ידוע (known='all') התשובה
 * זהה ל-whenMatches — כולל «סוג לא ידוע אינו מתאים» ו«עובדה חסרה = false» —
 * ובדיקת היחידה מריצה את WHEN_CASES על שתיהן.
 */
export function whenVerdict(when: When | undefined | null, facts: ClientFacts, known: 'all' | ReadonlySet<string>): Verdict {
  if (!when) return VERDICT_ON;
  const isKnown = (k: string) => known === 'all' || known.has(k);
  const unknown: string[] = [];
  if (when.kinds?.length) {
    if (!isKnown('kind')) unknown.push(kindsPhrase(when.kinds));
    else if (!facts.kind || !when.kinds.includes(facts.kind)) return { state: 'off', why: onlyPhrase([kindsPhrase(when.kinds)]) };
  }
  for (const f of when.facts ?? []) {
    if (!isKnown(f.key)) unknown.push(factPhrase(f.key, f.is));
    else if ((facts[f.key] === true) !== f.is) return { state: 'off', why: `רק ${factPhrase(f.key, f.is)}` };
  }
  return unknown.length ? { state: 'depends', why: onlyPhrase(unknown) } : VERDICT_ON;
}

export const isEmptyWhen = (w: When | undefined | null) =>
  !w || ((!w.kinds || w.kinds.length === 0) && (!w.facts || w.facts.length === 0));

// ─── בדיקות: לכל ערך בית אחד בתחום, ושום שורה לא הולכת לאיבוד (15.10.2026) ─────────────────
// ‼ מה נעול כאן:
//   · כל שורה בטבלת הערכים הישנה — או בבית אחד בדיוק, או ברשימת «מכוסה במקום אחר» עם מה שמכסה אותה.
//     שורה יתומה (כמו שתי השורות שהוסתרו עם «פנסיה וגמל») או שורה בשני בתים — נכשל.
//   · כל הפניה לכלל במרשם — לכלל שקיים; כל קבוצה בתחום שקיים, עם תוכן.
//   · לכל תחום בשאלון יש תחום בידע (היום נכשל על «חברות בשליטה» ו«יתרות משנים קודמות»).
//   · לוח המועדים מציג את כל שורות המועדים, וכל אחת מפנה לתחום אחד.
//   · קישור ישן ל«ערכים לפי נושא» לא נופל, וכל יעד ב«לאן עבר» קיים.

import { test, equal, assert } from '../../../testkit/tinyTest';
import type { TestCase } from '../../../testkit/tinyTest';
import { KNOWLEDGE_TOPICS } from '../../../data/taxKnowledge';
import { getRule } from '../../taxRules/registry';
import { AREAS } from '../../taxYear/catalog';
import { DOMAINS, DOMAIN_BY_ID, askAreasOf, formatAreaPath, parseAreaPath } from '../../taxArea/areaModel';
import { COVERED_ELSEWHERE, DEADLINE_HOME, DOMAIN_VALUES, MOVED_GROUPS, legacyRow, legacyValueFor, searchValues, valueGroup } from '../domainValues';

const homes = () => {
  const home = new Map<string, string[]>();
  for (const [d, groups] of Object.entries(DOMAIN_VALUES)) for (const g of groups) for (const r of g.refs) {
    if (r.kind !== 'legacy' || r.shared) continue;
    const k = `${r.group}.${r.key}`;
    home.set(k, [...(home.get(k) ?? []), `${d}/${g.id}`]);
  }
  return home;
};

export const TESTS: TestCase[] = [
  test('כל שורה ישנה: בית אחד בדיוק, או מכוסה במקום אחר — אף שורה לא יתומה', () => {
    const home = homes();
    let rows = 0;
    for (const t of KNOWLEDGE_TOPICS) for (const v of t.values) {
      rows++;
      const k = `${t.id}.${v.key}`;
      const h = home.get(k) ?? [];
      const covered = COVERED_ELSEWHERE[k];
      assert(h.length + (covered ? 1 : 0) === 1, `${k}: בתים ${JSON.stringify(h)}${covered ? ` + מכוסה ב-${covered}` : ''}`);
    }
    // ‼ ספירה: מוצגות + מכוסות = כל השורות. אם נוספת שורה לטבלה בלי בית — המבחן הקודם נכשל.
    equal(home.size + Object.keys(COVERED_ELSEWHERE).length, rows);
  }),

  test('מפתחות יציבים וייחודיים בתוך כל קבוצה', () => {
    for (const t of KNOWLEDGE_TOPICS) {
      const keys = t.values.map(v => v.key);
      equal(new Set(keys).size, keys.length, t.id);
      for (const k of keys) assert(/^[a-zA-Z0-9]+$/.test(k), `${t.id}.${k}`);
    }
  }),

  test('«מכוסה במקום אחר» מצביע על משהו שקיים', () => {
    for (const [k, target] of Object.entries(COVERED_ELSEWHERE)) {
      const [g, key] = k.split('.');
      assert(!!legacyRow(g, key), `שורה לא קיימת: ${k}`);
      const [kind, id] = target.split(':');
      if (kind === 'rule') assert(!!getRule(id), `${k} → כלל לא קיים ${id}`);
      else { const [g2, k2] = id.split('.'); assert(!!legacyRow(g2, k2), `${k} → שורה לא קיימת ${id}`); assert(homes().has(id), `${k} → ${id} בלי בית`); }
    }
  }),

  test('כל הפניה — לכלל או לשורה שקיימים; כל קבוצה עם תוכן; כל תחום עם ערכים קיים', () => {
    for (const [d, groups] of Object.entries(DOMAIN_VALUES)) {
      assert(!!DOMAIN_BY_ID[d as keyof typeof DOMAIN_BY_ID], `תחום לא קיים: ${d}`);
      const ids = groups.map(g => g.id);
      equal(new Set(ids).size, ids.length, `קבוצה כפולה ב-${d}`);
      for (const g of groups) {
        assert(g.refs.length > 0, `${d}/${g.id} ריקה`);
        for (const r of g.refs) {
          if (r.kind === 'rule') assert(!!getRule(r.id), `${d}/${g.id}: כלל לא קיים ${r.id}`);
          else assert(!!legacyRow(r.group, r.key), `${d}/${g.id}: שורה לא קיימת ${r.group}.${r.key}`);
        }
      }
    }
  }),

  test('שורה משותפת (shared) מוצגת גם במקום שאינו ביתה — אבל יש לה בית', () => {
    const home = homes();
    for (const groups of Object.values(DOMAIN_VALUES)) for (const g of groups) for (const r of g.refs) {
      if (r.kind === 'legacy' && r.shared) assert(home.has(`${r.group}.${r.key}`), `${r.group}.${r.key}`);
    }
  }),

  test('אותו ערך לא מופיע פעמיים באותו עמוד תחום', () => {
    for (const [d, groups] of Object.entries(DOMAIN_VALUES)) {
      const seen = new Set<string>();
      for (const g of groups) for (const r of g.refs) {
        const k = r.kind === 'rule' ? `rule:${r.id}` : `${r.group}.${r.key}`;
        assert(!seen.has(k), `${d}: ${k}`);
        seen.add(k);
      }
    }
  }),

  // ‼ שאלון הקליטה (purposes: intake בלבד) הוא שאלון של סוג עבודה — נפתח מתיק הלקוח — ולא נושא מקצועי; לכן אינו כאן.
  test('לכל תחום בשאלון (דוח, הערכה, הצהרת הון) יש תחום בידע — כולל «חברות בשליטה» ו«יתרות משנים קודמות»', () => {
    const covered = new Set(DOMAINS.flatMap(d => askAreasOf(d)) as string[]);
    for (const a of AREAS.filter(x => x.purposes.some(p => p !== 'intake'))) assert(covered.has(a.id), `אזור שאלון בלי תחום: ${a.id}`);
  }),

  test('לוח המועדים: כל שורות המועדים, כל אחת עם תחום אחד', () => {
    const rows = KNOWLEDGE_TOPICS.find(t => t.id === 'deadlines')!.values;
    for (const v of rows) assert(!!DEADLINE_HOME[v.key] && !!DOMAIN_BY_ID[DEADLINE_HOME[v.key]], v.key);
    equal(Object.keys(DEADLINE_HOME).length, rows.length);
    equal(DOMAIN_BY_ID.reference.items.some(i => i.id === 'deadlines'), true);
  }),

  test('שנה בלי עמודה בטבלה הישנה — אין ערך (לא ערך של שנה אחרת)', () => {
    const v = legacyRow('vat', 'rate')!;
    equal(legacyValueFor(v, 2024), undefined);
    equal(legacyValueFor(v, 2026), v.value2026);
    equal(legacyValueFor(v, 2025), v.value2025);
  }),

  test('קישור ישן ל«ערכים לפי נושא» נוחת בהסבר, וכל יעד ב«לאן עבר» קיים', () => {
    for (const raw of ['learn/reference/topics', 'learn/topics']) {
      const p = parseAreaPath(raw);
      equal(p.mode === 'learn' && p.moved, true, raw);
      equal(formatAreaPath(p), 'learn', raw);
    }
    for (const m of MOVED_GROUPS) {
      if (m.group) assert(!!valueGroup(m.domain, m.group), `${m.from} → ${m.domain}/${m.group}`);
      else assert(DOMAIN_BY_ID[m.domain].items.some(i => i.id === m.item), `${m.from} → ${m.domain}/${m.item}`);
    }
    // כל קבוצה ישנה שהייתה גלויה בעמוד — מופיעה ברשימת «לאן עבר»
    for (const t of KNOWLEDGE_TOPICS.filter(t => !['pension', 'studyFund'].includes(t.id))) {
      assert(MOVED_GROUPS.some(m => m.from.startsWith(t.title.split(' (')[0])), `חסר ב«לאן עבר»: ${t.title}`);
    }
  }),

  test('קישור לקבוצת ערכים: הלוך וחזור; קבוצה לא קיימת — עמוד התחום', () => {
    equal(formatAreaPath(parseAreaPath('learn/rent/v/realEstate')), 'learn/rent/v/realEstate');
    const p = parseAreaPath('learn/rent/v/nosuch');
    equal(formatAreaPath(p), 'learn/rent');
    const q = parseAreaPath('learn/rent/v/vat');
    equal(formatAreaPath(q), 'learn/rent');
  }),

  test('חיפוש בערכים מוצא את התחום הנכון', () => {
    const find = (w: string) => searchValues([w]).map(h => h.domain);
    assert(find('מס רכישה').includes('rent'), 'מס רכישה');
    assert(find('שווי שימוש').includes('salary'), 'שווי שימוש');
    assert(find('עוסק פטור').includes('business'), 'עוסק פטור');
    assert(find('רווחים כלואים').includes('companies'), 'רווחים כלואים');
    assert(find('פיצויים').includes('savings'), 'פיצויים');
    equal(searchValues([]).length, 0);
    // כל המילים — לא «אחת מהן»: «מס רכישה» לא מחזיר את כל מה שיש בו «מס»
    assert(searchValues(['מס', 'רכישה']).every(h => h.domain === 'rent'), 'מס רכישה — רק נדל״ן');
  }),
];

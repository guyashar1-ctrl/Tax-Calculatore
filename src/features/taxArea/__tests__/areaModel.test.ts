// ─── בדיקות: «מס» — שני מרחבים, כניסה לכל סוג עבודה ולכל תחום, וכתובות ישנות (14.10.2026) ───────
// ‼ מה נעול כאן:
//   · שני המרחבים בשמות שאי אפשר לבלבל, ולכל סוג עבודה ולכל תחום — כניסה משלו.
//   · «הדוח השנתי» ו«טופס 1301» באותו תחום, עם תפקיד שונה ושם שאומר אותו.
//   · כל נושא לימוד וכל כלי שייכים לתחום אחד בדיוק — אין כניסה כפולה ואין פריט יתום.
//   · כתובת ישנה (‎#/reference‎, ‎learn/<topic>‎, ‎#/firm/taxWork‎) נוחתת במקום הנכון, לא בשגיאה.

import { test, equal, assert, deepEqual } from '../../../testkit/tinyTest';
import type { TestCase } from '../../../testkit/tinyTest';
import { DOMAINS, DOMAIN_BY_ID, MODE_LABEL, WORK_SECTIONS, advanceTrail, returnTargetOf, askAreasOf, clampYear, defaultYearFor, domainOf, formatAreaPath, itemOf, parseAreaPath, reportSeasonYear } from '../areaModel';
import { askAreasView, clientAsksFor, countsText, sumCounts, topicAskAreaIds } from '../../taxKnowledge/learnPath';
import { ITEMS } from '../../taxYear/catalog';
import { TOPICS } from '../../taxKnowledge/topics';
import { TOOLS } from '../../taxCenter/taxCenterNav';
import { AREAS } from '../../taxYear/catalog';
import { formatRoute, parseHash } from '../../../lib/appRoute';
import { valueGroupsOf } from '../../taxKnowledge/domainValues';

export const TESTS: TestCase[] = [
  test('שני מרחבים, בשמות שונים לגמרי', () => {
    equal(MODE_LABEL.work, 'עבודות לקוחות');
    equal(MODE_LABEL.learn, 'ידע מקצועי');
  }),

  test('לכל סוג עבודה כניסה משלו, עם הסבר ואיך פותחים; «כל העבודות» היא סקירה', () => {
    const ids = WORK_SECTIONS.map(s => s.id);
    equal(ids[0], 'all');
    for (const k of ['intake', 'annual', 'wealth'] as const) assert(ids.includes(k), k);
    for (const s of WORK_SECTIONS) {
      assert(s.lead.length > 15, `הסבר: ${s.id}`);
      assert(s.howToOpen.length > 10, `איך פותחים: ${s.id}`);
      if (s.domain) assert(!!DOMAIN_BY_ID[s.domain], `תחום קיים: ${s.id}`);
    }
  }),

  test('כל נושא לימוד וכל כלי — בתחום אחד בדיוק', () => {
    const seen = new Map<string, string>();
    for (const d of DOMAINS) for (const i of d.items) {
      assert(!seen.has(i.id), `${i.id} מופיע פעמיים (${seen.get(i.id)}, ${d.id})`);
      seen.set(i.id, d.id);
    }
    for (const t of TOPICS) assert(seen.has(t.id), `נושא בלי תחום: ${t.id}`);
    for (const t of TOOLS) assert(seen.has(t.key), `כלי בלי תחום: ${t.key}`);
  }),

  test('«הדוח השנתי» ו«טופס 1301» — אותו תחום, שני תפקידים, שמות שאומרים אותם', () => {
    equal(domainOf('annualReturn'), 'annual');
    equal(domainOf('map1301'), 'annual');
    const [a, b] = DOMAIN_BY_ID.annual.items;
    assert(a.label !== b.label, "line 47");
    assert(a.label.includes('הכנת הדוח'), a.label);
    // ‼ 16.10: הטופס עצמו בעמוד התחום; הפריט השני = הטופס מול תיק לקוח + הבקרה הקודמת
    assert(b.label.includes('לקוח') && b.label.includes('בקרה'), b.label);
  }),

  test('דמי לידה: נושא בתחום «ביטוח לאומי», והפניה אליו מ«דוח שנתי» ומ«שכירים» — בלי לשכפל את הנושא', () => {
    equal(domainOf('maternity'), 'ni');
    for (const d of ['annual', 'salary'] as const) assert((DOMAIN_BY_ID[d].seeAlso ?? []).some(x => x.id === 'maternity'), d);
    for (const d of DOMAINS) for (const x of d.seeAlso ?? []) {
      assert(!!domainOf(x.id) && domainOf(x.id) !== d.id, `${d.id} → ${x.id}: הפניה לתחום אחר`);
      assert(x.why.length > 15, x.id);
    }
  }),

  test('נקודות זיכוי: «מצב משפחתי בשנת המס» — לפי שנת המס, 5329 בשנת הנישואין, שנת הגירושין/פטירה פתוחה', () => {
    const n = (DOMAIN_BY_ID.credits.notes ?? []).find(x => x.id === 'familyYear');
    assert(!!n, 'יש פסקה');
    const all = n!.points.map(p => p.text).join(' ');
    for (const w of ['בשנת המס, לא היום', '4440', '5329', 'לא ידוע']) assert(all.includes(w), w);
    // 25.10.2026: שנת הגירושין/הפטירה הוכרעה לפי סעיף 41 (נקודות יחסיות) — מוצגת עם הסעיף, לא כפתוחה
    assert(n!.points.some(p => /גירושין/.test(p.text) && /41/.test(p.text)), 'שנת הגירושין — לפי סעיף 41');
    for (const d of DOMAINS) for (const x of d.notes ?? []) for (const p of x.points) assert(['verified', 'interpretation', 'open'].includes(p.status), p.text);
  }),

  test('לכל תחום: מה זה ומתי, ותחומי השאלון קיימים', () => {
    const areaIds = new Set(AREAS.map(a => a.id) as string[]);
    for (const d of DOMAINS) {
      assert(d.what.length > 20 && d.when.length > 10, d.id);
      // ‼ תחום בלי מסלול או כלי (שכירים, חברות) — מותר רק עם הסבר «טרם נכתב» וערכים לשנה
      assert(d.items.length > 0 || (!!d.learnGap && valueGroupsOf(d.id).length > 0), `תחום ריק: ${d.id}`);
      for (const a of d.catalogAreas) assert(areaIds.has(a) || a.startsWith('w'), `${d.id}: ${a}`);
    }
  }),

  test('הכתובת: הלוך וחזור', () => {
    for (const raw of ['work/all', 'work/annual', 'work/wealth', 'learn', 'learn/savings', 'learn/savings/pensionSE', 'learn/annual/map1301']) {
      equal(formatAreaPath(parseAreaPath(raw)), raw, raw);
    }
    equal(itemOf(parseAreaPath('learn/annual/map1301'))?.kind, 'tool');
    equal(itemOf(parseAreaPath('learn/savings'))?.kind, undefined);
  }),

  test('קישור ישן לנושא בלי תחום נוחת בתחום שלו; קטע לא מוכר — בראש המרחב', () => {
    deepEqual(parseAreaPath('learn/pensionSE'), { mode: 'learn', domain: 'savings', item: 'pensionSE' });
    deepEqual(parseAreaPath('learn/nosuch'), { mode: 'learn' });
    deepEqual(parseAreaPath('learn/savings/wizard'), { mode: 'learn', domain: 'savings' });
    deepEqual(parseAreaPath('work/nosuch'), { mode: 'work', section: 'all' });
    deepEqual(parseAreaPath(''), { mode: 'work', section: 'all' });
  }),

  test('בכתובת של האפליקציה: ‎#/tax/…‎, ו«ידע מס» ו«עבודת מס» הישנים נוחתים בפנים', () => {
    const r = parseHash('#/tax/learn/savings/pensionSE');
    equal(r.view, 'reference');
    equal(r.taxPath, 'learn/savings/pensionSE');
    equal(formatRoute({ view: 'reference', taxPath: 'work/annual' }), '/tax/work/annual');
    equal(parseHash('#/reference').view, 'reference');
    equal(parseHash('#/reference').taxPath, 'learn');
    const old = parseHash('#/firm/taxWork');
    equal(old.view, 'reference');
    equal(old.taxPath, 'work');
  }),

  // ── «מה מבקשים מהלקוח» בעמוד התחום (15.10.2026) ─────────────────────────────────────────
  test('הפירוט שנפתח מעמוד התחום כולל את כל מה שמסלולי הלימוד של התחום מציגים — אותו מקור, בלי רשימה שנייה', () => {
    for (const d of DOMAINS) {
      const have = new Set(askAreasOf(d));
      for (const i of d.items) if (i.kind === 'topic') for (const a of topicAskAreaIds(i.id)) assert(have.has(a), `${d.id}: ${i.id} מציג ${a} שאינו בעמוד התחום`);
    }
  }),

  test('הכמות בשורה היא בדיוק מה שהפירוט מציג: כל פריט נספר פעם אחת', () => {
    for (const d of DOMAINS) {
      const areas = askAreasView(askAreasOf(d));
      for (const a of areas) {
        const c = a.counts;
        equal(c.questions + c.documents + c.office, a.asks.length, `${d.id}/${a.id}`);
        equal(c.documents, a.asks.filter(x => x.doc).length, `מסמכים ${d.id}/${a.id}`);
      }
      const t = sumCounts(areas);
      equal(t.questions + t.documents + t.office, areas.reduce((n, a) => n + a.asks.length, 0), `סך ${d.id}`);
    }
  }),

  test('«ערכים ומקורות» בלי שאלון — אין סעיף ריק; כל תחום אחר מציג שאלות', () => {
    equal(askAreasView(askAreasOf(DOMAIN_BY_ID.reference)).length, 0);
    for (const d of DOMAINS.filter(x => x.id !== 'reference')) assert(askAreasView(askAreasOf(d)).length > 0, `תחום בלי שאלות: ${d.id}`);
  }),

  test('שכר דירה והצהרת הון — בלי מסלול לימוד לשכר דירה, ובכל זאת אפשר לראות את השאלון', () => {
    assert(!DOMAIN_BY_ID.rent.items.some(i => i.kind === 'topic'), 'שכר דירה אין בו נושא לימוד');
    const rent = askAreasView(askAreasOf(DOMAIN_BY_ID.rent));
    assert(rent.some(a => a.id === 'rent') && rent.some(a => a.id === 'sales'), 'שכר דירה ומכירת נכסים');
    const w = askAreasView(askAreasOf(DOMAIN_BY_ID.wealth));
    assert(w.some(a => a.id === 'wRealEstate'), 'הצהרת הון: נדל״ן');
    assert(w.length >= clientAsksFor('wealth').length, 'הצהרת הון: העמוד לא מציג פחות ממסלול הלימוד');
  }),

  test('למי השאלה ומתי: תנאים רק מהכללים הקיימים בקטלוג, בלי סוגריים מסולסלים', () => {
    const all = askAreasView(DOMAINS.flatMap(askAreasOf)).flatMap(a => a.asks);
    for (const x of all) {
      assert(x.audience.length > 0, `חסר «למי»: ${x.key}`);
      for (const t of [x.audience, ...x.conditions]) assert(!/[{}]/.test(t), `תבנית לא הוחלפה: ${x.key} — ${t}`);
    }
    const gated = ITEMS.find(i => i.after && i.purposes.length > 0)!;
    const ask = all.find(x => x.key === gated.key);
    assert(!!ask && ask.conditions.some(c => c.startsWith('אם התשובה ל«')), 'פריט תלוי מציג את שאלת הפתיחה שלו');
    const rare = all.find(x => x.rare);
    assert(!rare || rare.conditions.includes('רק כשהמשרד מסמן'), 'פריט חריג מסומן');
    const wealthDecl = all.filter(x => ITEMS.find(i => i.key === x.key)?.declKind);
    assert(wealthDecl.every(x => x.conditions.some(c => c === 'בהצהרה ראשונה' || c === 'בהצהרת המשך')), 'ראשונה/המשך מסומנים');
  }),

  test('«N שאלות · M מסמכים» — רק מה שיש, ובלשון יחיד', () => {
    equal(countsText({ questions: 1, documents: 0, office: 0 }), '1 שאלה');
    equal(countsText({ questions: 12, documents: 3, office: 2 }), '12 שאלות · 3 מסמכים · 2 למילוי המשרד');
    equal(countsText({ questions: 0, documents: 1, office: 0 }), '1 מסמך');
  }),
  // ‼ 16.10: מה שחסר (ביקורת מול «חשבים 360» / «כל מס») — גלוי, עם מצב מחקר, ובלי להתחזות לכלי קיים
  test('«טרם נכתב»: לכל פריט מצב מחקר, ואין כפילות עם כלי או נושא קיים', () => {
    const existing = new Set(DOMAINS.flatMap(d => d.items.map(i => i.label)));
    const all = DOMAINS.flatMap(d => (d.planned ?? []).map(x => ({ d: d.id, x })));
    assert(all.length >= 15, `${all.length}`);
    for (const { d, x } of all) {
      assert(!!x.research && !!x.purpose, `${d}: ${x.label}`);
      assert(!existing.has(x.label), `${x.label} כבר קיים`);
    }
    equal(new Set(all.map(a => a.x.label)).size, all.length);
  }),
  // 25.10.2026 — החלטת גיא: שנת ברירת המחדל לפי סוג העבודה
  test('שנת ברירת המחדל: סיכומים וטפסים — עונת הדוחות; כלים שוטפים — השנה השוטפת', () => {
    const years = [2026, 2025, 2024];
    const oct26 = new Date(2026, 9, 25), mar27 = new Date(2027, 2, 31), apr27 = new Date(2027, 3, 1);
    equal(reportSeasonYear(oct26), 2025);
    equal(reportSeasonYear(mar27), 2025, 'עד 31.3.2027 — עדיין דוחות 2025');
    equal(reportSeasonYear(apr27), 2026);
    equal(defaultYearFor({ mode: 'learn', domain: 'annual' }, years, oct26), 2025, 'עמוד הטופס');
    equal(defaultYearFor(parseAreaPath('learn/savings/pensionSE'), years, oct26), 2025, 'נושא לימוד');
    equal(defaultYearFor(parseAreaPath('learn/ni/ni'), years, oct26), 2026, 'ב״ל — כלי שוטף');
    equal(defaultYearFor(parseAreaPath('learn/credits/settlements'), years, oct26), 2026, 'יישובים — כלי שוטף');
    equal(defaultYearFor({ mode: 'learn', domain: 'ni' }, years, oct26), 2026, 'תחום בלי טופס');
    equal(clampYear(2027, years), 2026, 'שנה בלי נתונים ⇒ האחרונה שיש, לא שנה מומצאת');
  }),
  test('קוד סעיף בכתובת: ‎learn/annual/c/158‎ נשמר בהלוך-חזור, ורק בתחום עם טופס', () => {
    deepEqual(parseAreaPath('learn/annual/c/158'), { mode: 'learn', domain: 'annual', code: '158' });
    equal(formatAreaPath(parseAreaPath('learn/annual/c/158')), 'learn/annual/c/158');
    deepEqual(parseAreaPath('learn/ni/c/158'), { mode: 'learn', domain: 'ni' });
  }),
  // 26.10.2026: הסעיף שנבחר במפת הטופס — בכתובת, כדי ש«אחורה» ורענון יחזירו אליו
  test('סעיף בכתובת: ‎learn/annual/f/<טופס>/<סעיף>/<קוד>‎ חוזר שלם, ורק בתחום עם טופס', () => {
    for (const s of ['learn/annual/f/1301/F117/201', 'learn/annual/f/1321/1321.2', 'learn/annual/f/6111', 'learn/wealth/f/1219/1219.a.1', 'learn/annual/f/1399y/1399y.3/40']) {
      equal(formatAreaPath(parseAreaPath(s)), s, s);
    }
    deepEqual(parseAreaPath('learn/annual/f/1301/F117/201'), { mode: 'learn', domain: 'annual', form: '1301', field: 'F117', mark: '201' });
    deepEqual(parseAreaPath('learn/annual/f/1301'), { mode: 'learn', domain: 'annual', form: '1301' });
    deepEqual(parseAreaPath('learn/annual/f/1301/F117/xyz'), { mode: 'learn', domain: 'annual', form: '1301', field: 'F117' }, 'קוד לא מספרי — בלי סימון');
    deepEqual(parseAreaPath('learn/ni/f/1301/F117'), { mode: 'learn', domain: 'ni' }, 'תחום בלי טופס');
    deepEqual(parseAreaPath('learn/annual/f/<script>'), { mode: 'learn', domain: 'annual' }, 'מזהה טופס לא תקין');
    const p = { mode: 'learn' as const, domain: 'annual' as const, form: '1301', field: 'F/1' };
    deepEqual(parseAreaPath(formatAreaPath(p)), p, '«/» במזהה הסעיף מקודד');
  }),
  test('מסמך מקור בכתובת: ‎learn/annual/d/<מסמך>‎ — רק מסמך שקיים, ורק בדוח השנתי', () => {
    deepEqual(parseAreaPath('learn/annual/d/106'), { mode: 'learn', domain: 'annual', doc: '106' });
    equal(formatAreaPath(parseAreaPath('learn/annual/d/btl-se')), 'learn/annual/d/btl-se');
    deepEqual(parseAreaPath('learn/annual/d/nope'), { mode: 'learn', domain: 'annual' });
    deepEqual(parseAreaPath('learn/wealth/d/106'), { mode: 'learn', domain: 'wealth' });
  }),
  // 26.10.2026: הכלים כתבו ‎#tool/…‎ (מההדמיה) — כתובת שהאפליקציה לא מכירה, והמשתמש נזרק מ«מס». הבחירה בכלי — בתוך הכתובת של «מס»
  test('בחירה בתוך כלי: ‎learn/business/bookkeeping/<פעילות>‎ — גם שם עם «/» חוזר שלם', () => {
    const p = { mode: 'learn' as const, domain: 'business' as const, item: 'bookkeeping', sub: 'פאב / בר' };
    const s = formatAreaPath(p);
    equal(s.split('/').length, 4, 'ה-«/» שבשם מקודד, לא מפצל את הכתובת');
    deepEqual(parseAreaPath(s), p);
    deepEqual(parseAreaPath('learn/business/expenses/vehicle'), { mode: 'learn', domain: 'business', item: 'expenses', sub: 'vehicle' });
    deepEqual(parseAreaPath('learn/business/expenses'), { mode: 'learn', domain: 'business', item: 'expenses' });
  }),
  // 26.10.2026: «חזרה ל…» — לעמוד שממנו הגיעו, לא לפירור
  test('שביל החזרה: נושא ← טופס ← חזרה לנושא באותו מצב; שלבים באותו נושא לא מוסיפים צעד', () => {
    let tr = advanceTrail([], 'learn');
    tr = advanceTrail(tr, 'learn/savings/pensionSE');
    equal(returnTargetOf(tr), null, 'מהספרייה — אין «חזרה» (הפירורים מספיקים)');
    tr = advanceTrail(tr, 'learn/savings/pensionSE/pn-0');
    tr = advanceTrail(tr, 'learn/savings/pensionSE/apply');
    equal(tr.length, 2, 'שלבים באותו נושא מחליפים זה את זה');
    tr = advanceTrail(tr, 'learn/annual/c/135');
    equal(returnTargetOf(tr), 'learn/savings/pensionSE/apply', 'מהטופס — חזרה לנושא, לאותו מצב');
    tr = advanceTrail(tr, 'learn/savings/pensionSE/apply');
    equal(tr.length, 2, 'חזרה לעמוד הקודם מקצרת את השביל');
    tr = advanceTrail(['learn', 'learn/savings'], 'learn/savings/pensionSE');
    equal(returnTargetOf(tr), null, 'מהתחום שלו — הפירור כבר שם');
  }),
];

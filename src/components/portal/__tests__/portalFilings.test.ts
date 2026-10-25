// ─── בדיקות: «הדוחות שלך» ו«הדבר הבא» בדף האישי (280) ──────────────────────────────────────
// ‼ מה נעול כאן:
//   · כרטיס לשנה, החדשה ראשונה; שנה עם משהו פתוח — פתוחה; החדשה מבין השנים שהוגשו — כרטיס משלה;
//     הישנות ממנה (2+) — כרטיס אחד «2021–2023 · הכול הוגש».
//   · התג לפי המצב מהשרת: הוגש / צריך ממך / בהכנה אצלנו / בלי תג / אין חובת הגשה; תאריכים d.m.yyyy.
//   · «הדבר הבא» בוחר מהפריטים הקיימים: המועד הקרוב (לפי החובה שמצביעה על הבקשה), אחרת הראשון;
//     לא הודעה ולא פעולה של בן/בת הזוג; בלי מה לעשות — אין כרטיס.
//   · הקטע לא מוצג כשאין שורות; אין בו מספר תיק/קנס; הדוגמה בלי רשת ועם שמות הדוגמה.

import { createElement } from 'react';
// @ts-expect-error TS7016 — אין הצהרת טיפוסים ל-react-dom/server.browser
import { renderToStaticMarkup } from 'react-dom/server.browser';
import { test, assert, equal, deepEqual } from '../../../testkit/tinyTest';
import type { TestCase } from '../../../testkit/tinyTest';
import {
  buildFilingCards, dm, dmy, dueByStep, pickNextAction, sampleFilings, yearsLabel,
  type PortalFilingItem, type PortalFilingsData,
} from '../portalFilingsModel';
import { PortalFilingsSection } from '../PortalFilings';
import { PortalView, niForwardText } from '../../PublicPortalPage';
import type { PortalData, PortalItem } from '../../PublicPortalPage';
import { REP_PORTAL_CARD_FIXED } from '../../../../supabase/functions/_shared/repTemplates.ts';

const filed = (year: number, filedOn: string): { year: number; items: PortalFilingItem[] } =>
  ({ year, items: [{ kind: 'annual', role: 'client', person: 'דוד', filedOn, status: 'filed' }] });

const DATA: PortalFilingsData = {
  ok: true, sourceDate: '2026-10-19',
  years: [
    filed(2022, '2023-05-29'),
    { year: 2025, items: [
      { kind: 'annual', role: 'client', person: 'דוד', legalDue: '2026-11-30', status: 'office' },
      { kind: 'wealth', role: 'client', person: 'דוד', legalDue: '2026-12-31', status: 'client', stepId: 'step-w' },
      { kind: 'annual', role: 'spouse', person: 'רותי', required: false, status: 'not_required' },
    ] },
    filed(2024, '2025-05-14'),
    filed(2023, '2024-06-02'),
    filed(2021, '2022-07-11'),
  ],
};

const portalData = (items: PortalItem[]): PortalData => ({ clientFirstName: 'דוד', firmName: 'רו״ח לדוגמה', branding: {}, done: 0, total: items.length, items });

export const TESTS: TestCase[] = [
  test('תאריכים: d.m.yyyy ו-d.m בלי אפסים מובילים; ערך ריק ⇒ ריק', () => {
    equal(dmy('2026-05-04'), '4.5.2026');
    equal(dm('2026-10-09'), '9.10');
    equal(dmy(undefined), '');
  }),

  test('שנים: רצופות ⇒ טווח; לא רצופות ⇒ רשימה', () => {
    equal(yearsLabel([2023, 2021, 2022]), '2021–2023');
    equal(yearsLabel([2019, 2021]), '2019, 2021');
    equal(yearsLabel([2020]), '2020');
  }),

  test('כרטיסים: 2025 פתוח, 2024 לבד וסגור, 2021–2023 בכרטיס אחד סגור; כותרת «לפי שע״ם · 19.10»', () => {
    const { header, cards } = buildFilingCards(DATA, 'דוד');
    equal(header, 'לפי שע״ם · 19.10');
    deepEqual(cards.map(c => c.label), ['2025', '2024', '2021–2023']);
    deepEqual(cards.map(c => c.openByDefault), [true, false, false]);
    deepEqual(cards.map(c => c.summary), ['2 פתוחים', 'הכול הוגש', 'הכול הוגש']);
    deepEqual(cards.map(c => c.allFiled), [false, true, true]);
    deepEqual(cards[2].rows.map(r => r.title), ['דוח שנתי 2023', 'דוח שנתי 2022', 'דוח שנתי 2021']);
    assert(cards[2].rows.every(r => !r.pill), 'בכרטיס של כמה שנים — בלי תג בכל שורה');
  }),

  test('שורות: התג והמועד לפי המצב מהשרת', () => {
    const [y25, y24] = buildFilingCards(DATA, 'דוד').cards;
    const [annual, wealth, spouse] = y25.rows;
    deepEqual(annual.pill, { tone: 'us', text: 'בהכנה אצלנו' });
    deepEqual(annual.when, { main: '30.11.2026', sub: 'מועד הגשה' });
    deepEqual(wealth.pill, { tone: 'you', text: 'צריך ממך' });
    deepEqual(wealth.when, { main: '31.12.2026', sub: 'לפי הדרישה' });
    deepEqual(spouse.pill, { tone: 'no', text: 'אין חובת הגשה' });
    assert(spouse.muted && !spouse.when && spouse.person === 'רותי', 'אין חובה — שורה שקטה, בשם בן/בת הזוג');
    deepEqual(y24.rows[0].pill, { tone: 'done', text: 'הוגש' });
    deepEqual(y24.rows[0].when, { main: '14.5.2025', sub: 'הוגש' });
  }),

  test('בלי בקשה מקושרת ⇒ בלי תג; בלי מועד ⇒ «מועד לא ידוע»; בלי שם ⇒ השם מהדף / «בן/בת הזוג»', () => {
    const { cards } = buildFilingCards({ ok: true, years: [{ year: 2023, items: [
      { kind: 'annual', role: 'client', legalDue: '2024-05-31', status: 'none' },
      { kind: 'annual', role: 'spouse', status: 'none' },
    ] }] }, 'דוד');
    const [a, b] = cards[0].rows;
    assert(!a.pill && a.when?.main === '31.5.2024' && a.person === 'דוד', 'בלי תג, עם המועד ושם הלקוח');
    assert(!b.pill && b.when?.main === 'מועד לא ידוע' && b.person === 'בן/בת הזוג', 'מועד לא ידוע');
    equal(cards[0].summary, '2 פתוחים');
    equal(buildFilingCards({ ok: true, years: [{ year: 2023, items: [a].map(() => ({ kind: 'annual', role: 'client', status: 'none' }) as PortalFilingItem) }] }).cards[0].summary, 'פתוח אחד');
  }),

  test('שנה ישנה אחת שהוגשה — כרטיס משלה (אין מה לאחד); שנה של «אין חובה» בלבד — «אין חובת הגשה» בלי ✓', () => {
    const { cards } = buildFilingCards({ ok: true, years: [filed(2024, '2025-05-01'), filed(2023, '2024-05-01'),
      { year: 2022, items: [{ kind: 'annual', role: 'client', required: false, status: 'not_required' }] }] });
    deepEqual(cards.map(c => c.label), ['2024', '2022–2023']);
    const only = buildFilingCards({ ok: true, years: [filed(2024, '2025-05-01'), filed(2023, '2024-05-01')] }).cards;
    deepEqual(only.map(c => c.label), ['2024', '2023']);
    const nr = buildFilingCards({ ok: true, years: [{ year: 2022, items: [{ kind: 'annual', role: 'client', required: false, status: 'not_required' }] }] }).cards[0];
    assert(nr.summary === 'אין חובת הגשה' && !nr.allFiled, 'אין חובה ≠ הוגש');
  }),

  test('אין נתונים / שגיאה / שנים ריקות ⇒ אין כרטיסים, והקטע לא מוצג', () => {
    equal(buildFilingCards(null).cards.length, 0);
    equal(buildFilingCards({ ok: false, years: [] }).cards.length, 0);
    equal(buildFilingCards({ ok: true, years: [{ year: 2025, items: [] }] }).cards.length, 0);
    equal(renderToStaticMarkup(createElement(PortalFilingsSection, { data: null, fallbackFirstName: 'דוד' })), '');
  }),

  test('הקטע: כותרת, שנים, תגים — ובלי מספר תיק, קנס או מצב פנימי', () => {
    const html = renderToStaticMarkup(createElement(PortalFilingsSection, { data: DATA, fallbackFirstName: 'דוד' }));
    for (const s of ['הדוחות שלך', 'לפי שע״ם · 19.10', '2021–2023', 'בהכנה אצלנו', 'צריך ממך', 'אין חובת הגשה', 'הוגש', '30.11.2026', 'רותי'])
      assert(html.includes(s), `חסר: ${s}`);
    assert(!/קנס|fine|needs_review|fileNumber/.test(html), 'אין מידע פנימי');
    assert(/aria-expanded="true"/.test(html) && /aria-expanded="false"/.test(html), 'שנה פתוחה פתוחה; שהוגשו — סגורות');
    assert(/dir="ltr"[^>]*>2021–2023</.test(html), 'טווח השנים משמאל לימין');
  }),

  test('dueByStep: רק חובות שאצל הלקוח עם בקשה ומועד; המוקדם מביניהם', () => {
    const due = dueByStep({ ok: true, years: [
      { year: 2025, items: [
        { kind: 'wealth', role: 'client', legalDue: '2026-12-31', status: 'client', stepId: 's1' },
        { kind: 'annual', role: 'client', legalDue: '2026-11-30', status: 'client', stepId: 's1' },
        { kind: 'annual', role: 'client', legalDue: '2026-01-01', status: 'office', stepId: 's2' },
      ] }] });
    deepEqual([...due.entries()], [['s1', '2026-11-30']]);
  }),

  test('הדבר הבא: המועד הקרוב; בלי מועדים — הראשון; לא הודעה ולא של אדם אחר; ריק ⇒ null', () => {
    const items = [
      { key: 'a', actionValue: 'x' },
      { key: 'b', actionValue: 's-late' },
      { key: 'c', actionValue: 's-soon' },
      { key: 'm', kind: 'message' },
      { key: 'p', forPerson: 'רותי', actionValue: 's-sooner' },
    ];
    const due = new Map([['s-late', '2026-12-31'], ['s-soon', '2026-11-30'], ['s-sooner', '2026-01-01']]);
    deepEqual(pickNextAction(items, due), { item: items[2], due: '2026-11-30' });
    deepEqual(pickNextAction(items, new Map()), { item: items[0] });
    equal(pickNextAction([{ key: 'm', kind: 'message' }], new Map()), null);
    equal(pickNextAction([], new Map()), null);
  }),

  test('בדף: «הדבר הבא» הוא סימון על הבקשה עצמה — אין כרטיס נפרד, ואף בקשה לא מופיעה פעמיים', () => {
    const items: PortalItem[] = [
      { bucket: 'action', key: 'docs', label: 'מסמכים שביקשנו', sub: '1 מתוך 3 התקבלו', actionKind: 'portal', actionValue: 'st1', kind: 'documents', checklist: [
        { key: 'a', label: 'א', done: true }, { key: 'b', label: 'ב', done: false }, { key: 'c', label: 'ג', done: false }] },
      { bucket: 'action', key: 'taxinfo_q', label: 'הדוח השנתי 2025', sub: '3 שאלות', actionKind: 'taxInfo', actionValue: 'st2' },
    ];
    const count = (html: string, s: string) => html.split(s).length - 1;
    const html = renderToStaticMarkup(createElement(PortalView, { data: portalData(items), mode: 'sample' }));
    assert(!/portal-next/.test(html), 'אין כרטיס נפרד');
    equal(count(html, 'הדבר הבא'), 1, 'סימון אחד');
    assert(/data-pp-key="docs" data-pp-next=""/.test(html), 'בלי מועדים — הראשון מסומן');
    equal(count(html, '>מסמכים שביקשנו<'), 1); equal(count(html, '>הדוח השנתי 2025<'), 1);
    assert(!html.includes('ממתינות לך'), 'בלי שורת סיכום — הבקשות עצמן הן הדף (25.10)');
    const one = renderToStaticMarkup(createElement(PortalView, { data: portalData([items[1]]), mode: 'sample' }));
    equal(count(one, '>הדוח השנתי 2025<'), 1, 'בקשה אחת — פעם אחת בלבד');
    assert(!one.includes('הדבר הבא') && !one.includes('יש בקשה אחת שממתינה לך'), 'בקשה יחידה — בלי סימון ובלי שורה שחוזרת עליה');
  }),

  test('דוגמה: שמות הדוגמה, יחסי לשנה הנוכחית, כל המצבים — ובלי רשת', async () => {
    const g = globalThis as Record<string, unknown>;
    const realFetch = g.fetch; let called = false;
    g.fetch = () => { called = true; throw new Error('fetch אסור'); };
    try {
      const s = sampleFilings({ now: new Date('2026-10-21T10:00:00Z') });
      equal(s.years[0].year, 2025);
      deepEqual([...new Set(s.years.flatMap(y => y.items.map(i => i.person)))], ['ישראל', 'ישראלה']);
      deepEqual([...new Set(s.years.flatMap(y => y.items.map(i => i.status)))].sort(), ['client', 'filed', 'not_required', 'office']);
      deepEqual(buildFilingCards(s).cards.map(c => c.label), ['2025', '2024', '2021–2023']);
      const { samplePortalActions } = await import('../portalActions');
      const loaded = await samplePortalActions().loadFilings();
      // ‼ «צפייה» בספרייה = בקשה אחת כפי שהלקוח מקבל אותה; «הדוחות שלך» אינו חלק מבקשה — לא מוצג שם
      equal(loaded, null, 'בצפייה בבקשה — בלי «הדוחות שלך»');
      assert(!called, 'בלי fetch');
    } finally { g.fetch = realFetch; }
  }),
  test('ב״ל לבן זוג בלי מייל: «לשלוח לאוריה» + הודעה עם אסמכתא, מועד וקישור — בלי קישור לדף', () => {
    const item: PortalItem = { bucket: 'action', key: 'authrep_s', kind: 'ni_approval', label: 'אוריה מנחם — אישור ייפוי הכוח בביטוח הלאומי',
      forPerson: 'אוריה מנחם', actionKind: 'portal', actionValue: 's', linkUrl: 'https://www.btl.gov.il/x',
      refs: [{ label: 'אסמכתא', value: '75791152' }, { label: 'לאשר עד', value: '20.12.2026' }] };
    const text = niForwardText(item, 'רו״ח לדוגמה');
    assert(text.startsWith('אוריה, צריך לאשר בביטוח הלאומי את ייפוי הכוח לרו״ח לדוגמה.'), text);
    assert(text.includes('אסמכתא: 75791152 · עד 20.12.2026') && text.includes('לאישור: https://www.btl.gov.il/x'), text);
    assert(!/portal=|token/i.test(text), 'בלי טוקן של הדף');
    const html = renderToStaticMarkup(createElement(PortalView, { data: portalData([item]), mode: 'sample' }));
    assert(html.includes('לשלוח לאוריה'), 'הכפתור בכרטיס של אוריה');
    const own = renderToStaticMarkup(createElement(PortalView, { data: portalData([{ ...item, forPerson: undefined, key: 'authrep_c' }]), mode: 'sample' }));
    assert(!own.includes('לשלוח ל'), 'בכרטיס של בעלת הכרטיס — אין למי להעביר');
  }),
  test('26.10 · הדף נפתח כרשימה קצרה: שורה לבקשה, בלי הכפתורים; האופציונלי אחרון ואינו «הדבר הבא»', () => {
    const items: PortalItem[] = [
      { bucket: 'action', key: 'rep_approval', kind: 'declare', label: REP_PORTAL_CARD_FIXED.title, actionKind: 'portal', actionValue: 'r1', note: 'באזור האישי מסמנים' },
      { bucket: 'action', key: 'docs', label: 'להעלות 2 מסמכים', actionKind: 'portal', actionValue: 'd1', kind: 'documents', checklist: [
        { key: 'a', label: 'א', done: true }, { key: 'b', label: 'ב', done: false }] },
      { bucket: 'action', key: 'authrep_s', kind: 'ni_approval', label: 'אוריה — אישור ייפוי הכוח בביטוח הלאומי', forPerson: 'אוריה',
        actionKind: 'portal', actionValue: 's', linkUrl: 'https://www.btl.gov.il/x', refs: [{ label: 'אסמכתא', value: '75791152' }] },
    ];
    const html = renderToStaticMarkup(createElement(PortalView, { data: portalData(items), mode: 'sample' }));
    const rows = html.match(/data-pp-row/g) ?? [];
    equal(rows.length, 3, 'שורה לכל בקשה, גם של אוריה');
    assert(!html.includes('לאישור באתר') && !html.includes('באזור האישי מסמנים'), 'הכפתורים וההוראות רק אחרי לחיצה');
    assert(html.indexOf('>להעלות 2 מסמכים<') < html.indexOf(`>${REP_PORTAL_CARD_FIXED.title}<`), 'האופציונלי אחרי מה שנדרש');
    assert(/data-pp-key="docs" data-pp-next=""/.test(html), '«הדבר הבא» — מה שנדרש, לא הזירוז');
  }),
];

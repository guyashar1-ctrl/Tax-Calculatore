// ─── בדיקות: שלושה מצבים לדף האישי, ופעולות מוזרקות (D4) ──────────────────────
// ‼ מה נעול כאן:
//   · הדף הציבורי (?portal=) תמיד live: אינו מעביר mode/actions ולכן אינו יכול להגיע ל-sample.
//   · בקובץ הדף עצמו אין שום פנייה ללקוח המסד — כל פעולה עוברת ב-PortalActions.
//   · samplePortalActions אינו מזכיר לקוח מסד/fetch/פתיחת חלון, וגם בפועל לא נוגע בהם:
//     כל פעולה מחזירה «בוצע בדוגמה» בלי רשת.
//   · ברירת המחדל של PortalView לפי preview/טוקן — ובפועל (רינדור) מה כבוי ומה חי בכל מצב.

import { createElement } from 'react';
// ‼ גרסת הדפדפן של הרינדור הסטטי: גרסת node דורשת את `stream`, שאגד הבדיקות (ESM) אינו יכול לטעון. בלי הצהרת טיפוסים.
// @ts-expect-error TS7016 — אין הצהרת טיפוסים ל-react-dom/server.browser
import { renderToStaticMarkup } from 'react-dom/server.browser';
import { test, assert, equal, deepEqual } from '../../../testkit/tinyTest';
import type { TestCase } from '../../../testkit/tinyTest';
import PAGE_RAW from '../../PublicPortalPage.tsx?raw';
import ACTIONS_RAW from '../portalActions.ts?raw';
import { PortalView } from '../../PublicPortalPage';
import type { PortalData, PortalItem } from '../../PublicPortalPage';
import {
  livePortalActions, officeViewActions, samplePortalActions, SAMPLE_SIMULATED_TEXT,
  type PortalLinkedKind,
} from '../portalActions';

const PAGE = PAGE_RAW.replace(/\r\n/g, '\n');
const ACTIONS = ACTIONS_RAW.replace(/\r\n/g, '\n');

/** הגוף של פונקציה מיוצאת/רגילה אחת בקובץ הפעולות — עד ה-} שבתחילת שורה. */
function sliceOf(src: string, head: string): string {
  const start = src.indexOf(head);
  assert(start >= 0, `לא נמצאה ${head}`);
  const end = src.indexOf('\n}\n', start);
  assert(end > start, `לא נמצא סוף ל-${head}`);
  return src.slice(start, end + 2);
}

/** ‼ כל מה שמדבר עם השרת או עם הדפדפן מחוץ לדף — אסור בקוד של הדוגמה. */
const FORBIDDEN_IN_SAMPLE = /supabase|SUPABASE_URL|fetch\(|window\.open|window\.location|XMLHttpRequest|sendBeacon|\.rpc\(|functions\.invoke|flushAccountantNotifications|portalSubmitBusinessDetails|confirmOpenedLive|resourceHrefLive/;

/** מריץ פעולה עם fetch ו-window.open שזורקים אם נקראים, ומחזיר מה נקרא. */
async function withTrappedNetwork(run: () => Promise<void>): Promise<string[]> {
  const g = globalThis as Record<string, unknown>;
  const calls: string[] = [];
  const realFetch = g.fetch;
  const hadWindow = 'window' in g;
  const realWindow = g.window;
  g.fetch = () => { calls.push('fetch'); throw new Error('fetch אסור בדוגמה'); };
  g.window = {
    open: () => { calls.push('window.open'); throw new Error('window.open אסור בדוגמה'); },
    location: { origin: 'http://localhost', assign: () => { calls.push('location.assign'); throw new Error('ניווט אסור בדוגמה'); } },
  };
  try {
    await run();
  } finally {
    g.fetch = realFetch;
    if (hadWindow) g.window = realWindow; else delete g.window;
  }
  return calls;
}

const DATA = (items: PortalItem[]): PortalData => ({
  clientFirstName: 'נועה', firmName: 'משרד בדיקה', branding: {}, done: 0, total: items.length, items,
});

const DECLARE: PortalItem = {
  bucket: 'action', key: 'k_declare', label: 'חיבור לרשות המסים', actionKind: 'portal', actionValue: 's-declare',
  kind: 'declare', cta: 'ביצעתי', linkUrl: 'https://www.gov.il/he/service/personal_area_taxes', draft: true,
};
const ONBOARD: PortalItem = {
  bucket: 'action', key: 'k_onboard', label: 'מילוי פרטים', actionKind: 'onboard', actionValue: 'tok-1',
};

type ViewProps = Partial<Parameters<typeof PortalView>[0]>;
/** רינדור סטטי של הדף עם הפריטים — בלי אפקטים, ולכן בלי רשת. */
function render(items: PortalItem[], props: ViewProps): string {
  const g = globalThis as Record<string, unknown>;
  const hadWindow = 'window' in g;
  const realWindow = g.window;
  g.window = { location: { origin: 'http://localhost' } };
  try {
    return renderToStaticMarkup(createElement(PortalView, { data: DATA(items), embed: true, ...props }));
  } finally {
    if (hadWindow) g.window = realWindow; else delete g.window;
  }
}
const confirmButton = (html: string) => html.match(/<button[^>]*>ביצעתי<\/button>/)?.[0] ?? '';

export const TESTS: TestCase[] = [
  test('הדף הציבורי: PortalView בלי mode ובלי actions — sample אינו נגיש מהקישור של הלקוח', () => {
    const start = PAGE.indexOf('export default function PublicPortalPage');
    assert(start > 0, 'לא נמצא הדף הציבורי');
    const page = PAGE.slice(start);
    assert(/<PortalView data=\{data\} token=\{token\} onReload=\{reload\} \/>/.test(page), 'הדף הציבורי מרנדר PortalView עם data/token/onReload בלבד');
    assert(!/\bmode=|\bactions=|sampleHooks|samplePortalActions/.test(page), 'אין mode/actions/sample בדף הציבורי');
    assert(!/mode="sample"/.test(PAGE) && !/mode: 'sample'/.test(PAGE), 'בקובץ הדף אין שום הפעלה של sample');
  }),

  test('בקובץ הדף האישי אין פנייה ללקוח המסד — הכול דרך PortalActions', () => {
    assert(!/\bsupabase\./.test(PAGE), 'אין supabase. בקובץ הדף');
    assert(!/from '[^']*lib\/supabase'/.test(PAGE), 'אין ייבוא של lib/supabase');
    assert(!/SUPABASE_URL|flushAccountantNotifications|portalSubmitBusinessDetails/.test(PAGE), 'אין גישה ישירה לתשתית שליחה');
    assert(!/\bfetch\(/.test(PAGE), 'אין fetch בקובץ הדף');
    assert(/loadClientPortal</.test(PAGE), 'טעינת הדף החי עוברת דרך portalActions.loadClientPortal');
  }),

  test('samplePortalActions: בקוד אין לקוח מסד, fetch, פתיחת חלון או ניווט', () => {
    const sample = sliceOf(ACTIONS, 'export function samplePortalActions(');
    assert(sample.length > 200, 'הפרוסה קצרה מדי — החיתוך נכשל');
    assert(!FORBIDDEN_IN_SAMPLE.test(sample), `בדוגמה: ${sample.match(FORBIDDEN_IN_SAMPLE)?.[0]}`);
    const office = ACTIONS.slice(ACTIONS.indexOf('export const officeViewActions'));
    assert(!FORBIDDEN_IN_SAMPLE.test(office), `בתצוגה במשרד: ${office.match(FORBIDDEN_IN_SAMPLE)?.[0]}`);
  }),

  test('רק livePortalActions ועוזריו (טעינה, פתיחה, כתובת קובץ) נוגעים בלקוח המסד וב-fetch', () => {
    let rest = ACTIONS;
    for (const head of ['export async function loadClientPortal<', 'async function confirmOpenedLive(', 'function resourceHrefLive(', 'export function livePortalActions(']) {
      const s = sliceOf(rest, head);
      rest = rest.replace(s, '');
    }
    const code = rest.replace(/^import[\s\S]*?;\n/gm, '').split('\n')
      .filter(l => !l.trim().startsWith('//') && !l.trim().startsWith('*') && !l.trim().startsWith('/**')).join('\n');
    assert(!/\bsupabase\b|SUPABASE_URL|fetch\(|flushAccountantNotifications|portalSubmitBusinessDetails/.test(code), `מחוץ ל-live: ${code.match(/\bsupabase\b|SUPABASE_URL|fetch\(|flushAccountantNotifications|portalSubmitBusinessDetails/)?.[0]}`);
  }),

  test('samplePortalActions בפועל: כל פעולה «בוצעה בדוגמה», בלי fetch ובלי window.open', async () => {
    const opened: [PortalLinkedKind, string | undefined][] = [];
    const calls = await withTrappedNetwork(async () => {
      const a = samplePortalActions({ onOpenLinked: (k, v) => { opened.push([k, v]); } });
      equal(a.mode, 'sample');
      deepEqual(await a.submitStep('s1', { key: 'k', value: 'v' }), { ok: true, simulated: true });
      const up = await a.uploadDocument({ stepId: 's1', itemKey: 'd1', file: new File([], 'x.pdf'), tokenKind: 'portal' });
      deepEqual(up, { ok: true, simulated: true });
      const biz = await a.submitBusinessDetails('s2', {
        businessName: 'עסק', expectedBusinessName: 'עסק',
        homeOffice: { hasDedicatedRoom: false, totalRooms: null, businessRooms: null, note: null },
      });
      equal(biz.ok, true);
      equal((biz as { simulated?: boolean }).simulated, true);
      equal(await a.confirmOpened('https://abc.supabase.co/functions/v1/portal-open-document?x=1'), true, 'גם כתובת שלנו נחשבת «נפתחה» בלי לבדוק אותה');
      equal(await a.confirmOpened(null), true);
      a.notifyAccountant();
      a.openLinked('onboard', 'tok');
      a.openLinked('sign-form');
      equal(a.resourceHref('s1', { url: 'https://example.com/a.pdf' }), 'https://example.com/a.pdf', 'קובץ מספריית המשרד נפתח');
      equal(a.resourceHref('s1', { documentId: 'doc-1' }), null, 'קובץ מתיק הלקוח — אין לו כתובת בדוגמה');
    });
    deepEqual(calls, [], 'לא נקראו fetch / window.open / ניווט');
    deepEqual(opened, [['onboard', 'tok'], ['sign-form', undefined]], 'openLinked מגיע רק ל-hook שהוזרק');
  }),

  test('samplePortalActions בלי hooks: openLinked לא זורק; officeViewActions: שום פעולה לא מצליחה ולא נוגעת ברשת', async () => {
    const calls = await withTrappedNetwork(async () => {
      samplePortalActions().openLinked('quote', 'q1');
      const o = officeViewActions;
      equal(o.mode, 'officeView');
      equal((await o.submitStep('s', {})).ok, false);
      equal((await o.uploadDocument({ stepId: 's', itemKey: 'i', file: new File([], 'x.pdf') })).ok, false);
      equal((await o.submitBusinessDetails('s', {
        businessName: 'x', expectedBusinessName: 'x',
        homeOffice: { hasDedicatedRoom: false, totalRooms: null, businessRooms: null, note: null },
      })).ok, false);
      equal(await o.confirmOpened('https://example.com/a.pdf'), false);
      o.notifyAccountant();
      o.openLinked('intake', 'i1');
    });
    deepEqual(calls, []);
  }),

  test('livePortalActions: כתובת קובץ פרטי נבנית כמו תמיד (portal-open-document עם הטוקן), וקובץ ציבורי נפתח ישירות', () => {
    const live = livePortalActions('tok-live');
    equal(live.mode, 'live');
    const href = live.resourceHref('step-1', { documentId: 'doc-9' }) ?? '';
    assert(href.includes('/functions/v1/portal-open-document?'), href);
    assert(href.includes('token=tok-live') && href.includes('stepId=step-1') && href.includes('docId=doc-9'), href);
    equal(live.resourceHref('step-1', { url: 'https://example.com/a.pdf' }), 'https://example.com/a.pdf');
    equal(live.resourceHref(undefined, { documentId: 'doc-9' }), null, 'בלי מזהה בקשה אין קישור');
    assert(SAMPLE_SIMULATED_TEXT.startsWith('בתצוגה לדוגמה') && SAMPLE_SIMULATED_TEXT.includes('לא נשמר ולא נשלח דבר'), 'הניסוח המחייב');
  }),

  test('PortalView — ברירת המחדל: preview או בלי טוקן ⇒ תצוגה במשרד (כבוי); עם טוקן ⇒ חי', () => {
    const items = [DECLARE];
    assert(/disabled/.test(confirmButton(render(items, { preview: true }))), 'preview ⇒ כבוי');
    assert(/disabled/.test(confirmButton(render(items, {}))), 'בלי טוקן ⇒ כבוי');
    assert(/disabled/.test(confirmButton(render(items, { preview: true, token: 't' }))), 'preview גובר על טוקן');
    const live = confirmButton(render(items, { token: 't' }));
    assert(live.length > 0 && !/disabled/.test(live), 'עם טוקן ⇒ חי');
    assert(!render(items, { token: 't' }).includes('טיוטה'), 'בחי אין תג טיוטה');
  }),

  test('PortalView — mode מפורש גובר: sample חי מקומית; officeView כבוי; live בלי טוקן הופך לתצוגה במשרד', () => {
    const items = [DECLARE];
    const sample = render(items, { mode: 'sample' });
    assert(confirmButton(sample).length > 0 && !/disabled/.test(confirmButton(sample)), 'sample: הכפתור פעיל');
    assert(!sample.includes('טיוטה'), 'sample: אין תגי טיוטה');
    assert(/<a href="https:\/\/www\.gov\.il[^"]*" target="_blank" rel="noopener noreferrer"/.test(sample), 'sample: הקישור הציבורי נפתח בלשונית חדשה');
    const office = render(items, { mode: 'officeView', token: 't' });
    assert(/disabled/.test(confirmButton(office)), 'officeView: כבוי גם עם טוקן');
    assert(office.includes('טיוטה'), 'officeView: תג טיוטה');
    assert(!/<a href="https:\/\/www\.gov\.il/.test(office), 'officeView: הקישור אינרטי');
    assert(/disabled/.test(confirmButton(render(items, { mode: 'live' }))), 'live בלי טוקן ⇒ תצוגה במשרד');
  }),

  test('PortalView — קישור עם טוקן: חי = <a> אמיתי; דוגמה = כפתור בלי כתובת (openLinked); תצוגה במשרד = אינרטי', () => {
    const items = [ONBOARD];
    const live = render(items, { token: 't' });
    assert(live.includes('href="http://localhost/?onboard=tok-1"'), 'חי: קישור ממודרג כמו תמיד');
    const sample = render(items, { mode: 'sample' });
    assert(!sample.includes('?onboard='), 'דוגמה: אין כתובת עם הטוקן בדף');
    assert(/<button type="button"[^>]*>להמשך ←<\/button>/.test(sample), 'דוגמה: כפתור');
    const office = render(items, { preview: true });
    assert(!office.includes('?onboard=') && !/<button[^>]*>להמשך/.test(office), 'תצוגה במשרד: אינרטי');
  }),
];

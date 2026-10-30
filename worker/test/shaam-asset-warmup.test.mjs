// 30.10.2026 · הורדה מראש של קבצי רישום הייצוג — החילוץ מה-HTML, והקוד שרץ בדף (עם fetch מדומה).
import test from 'node:test';
import assert from 'node:assert/strict';
import { assetUrlsFromHtml, warmExpression, warmRepresentationAssets, _resetWarmState } from '../src/shaamAssetWarmup.mjs';

const ORIGIN = 'https://shaam.taxes.gov.il';
const PAGE = `${ORIGIN}/srmyzgipuykoach/?newTab=1`;
// תבנית מוקטנת של הדף שנצפה חי (30.10): נתיבים יחסיים, ‎?gdv=‎, קובץ חיצוני, קישור שאינו CSS.
const HTML = `<html><head><title>רשות המיסים - מערכת לרישום ייצוג</title>
<script type="text/javascript" src="/srMyzgIpuyKoach/ruxitagent.js" data-x="1"></script>
<script src="../shaamAngularLibTemp/kendo/kendo.all.min.js?gdv=abc" type="text/javascript"></script>
<script src="Scripts/app.js"></script>
<script src="Scripts/app.js"></script>
<script src="https://cdn.example.com/x.js"></script>
<link rel="stylesheet" href="../ShaamMaster2010/bootstrap/styles/bootstrap.min.css?gdv=abc" />
<link rel="icon" href="/favicon.ico" />
</head><body></body></html>`;

test('assetUrlsFromHtml: קבצי קוד ועיצוב באותו אתר, בלי כפילויות ובלי קבצים חיצוניים', () => {
  const urls = assetUrlsFromHtml(HTML, PAGE, ORIGIN);
  assert.deepEqual(urls, [
    `${ORIGIN}/srMyzgIpuyKoach/ruxitagent.js`,
    `${ORIGIN}/shaamAngularLibTemp/kendo/kendo.all.min.js?gdv=abc`,
    `${ORIGIN}/srmyzgipuykoach/Scripts/app.js`,
    `${ORIGIN}/ShaamMaster2010/bootstrap/styles/bootstrap.min.css?gdv=abc`,
  ]);
});

/** מריץ את הביטוי שנשלח לדף בסביבה מדומה: window, location ו-fetch. */
async function runInFakePage({ html = HTML, cachedUrls = [], failUrls = [] } = {}) {
  const requests = [];
  const g = globalThis;
  g.window = {};
  g.location = { origin: ORIGIN };
  g.fetch = async (u, opts = {}) => {
    const url = String(u).startsWith('/') ? ORIGIN + u : String(u);
    requests.push({ url, cache: opts.cache ?? 'default' });
    if (opts.cache === 'only-if-cached') return { ok: cachedUrls.includes(url), status: cachedUrls.includes(url) ? 200 : 504 };
    if (url.endsWith('/srmyzgipuykoach/')) return { ok: true, status: 200, url: PAGE, text: async () => html };
    if (failUrls.includes(url)) throw new Error('network');
    return { ok: true, status: 200, arrayBuffer: async () => new ArrayBuffer(8) };
  };
  // eslint-disable-next-line no-eval
  const started = (0, eval)(warmExpression());
  for (let i = 0; i < 50 && g.window.__pivoRepWarm?.running; i++) await new Promise((r) => setTimeout(r, 1));
  return { started, run: g.window.__pivoRepWarm, requests };
}

test('הקוד בדף: מוריד רק מה שלא במטמון, ומסמן הצלחה', async () => {
  const kendo = `${ORIGIN}/shaamAngularLibTemp/kendo/kendo.all.min.js?gdv=abc`;
  const others = assetUrlsFromHtml(HTML, PAGE, ORIGIN).filter((u) => u !== kendo);
  const { started, run, requests } = await runInFakePage({ cachedUrls: others });
  assert.deepEqual(started, { state: 'started' });
  assert.equal(run.running, false);
  assert.deepEqual(run.result, { ok: true, total: 4, cached: 3, fetched: 1, failed: 0 });
  const downloaded = requests.filter((r) => r.cache === 'default' && !r.url.endsWith('/srmyzgipuykoach/')).map((r) => r.url);
  assert.deepEqual(downloaded, [kendo], 'רק kendo ירד — השאר כבר במטמון');
});

test('הקוד בדף: הפניה למסך כניסה ⇒ לא מוריד כלום', async () => {
  const { run, requests } = await runInFakePage({ html: '<html><title>כניסה</title></html>' });
  assert.equal(run.result.ok, false);
  assert.equal(run.result.reason, 'not_the_system');
  assert.equal(requests.length, 1, 'רק בקשת ה-HTML');
});

test('הקוד בדף: קובץ שנכשל ⇒ ok=false (הסבב הבא ינסה שוב)', async () => {
  const kendo = `${ORIGIN}/shaamAngularLibTemp/kendo/kendo.all.min.js?gdv=abc`;
  const { run } = await runInFakePage({ failUrls: [kendo] });
  assert.equal(run.result.ok, false);
  assert.equal(run.result.failed, 1);
});

test('warmRepresentationAssets: לא באתר של שע״ם ⇒ לא נוגע בדף', async () => {
  _resetWarmState();
  let evaluated = 0;
  const page = { url: () => 'https://other.example/x', evaluate: async () => { evaluated++; return null; } };
  const r = await warmRepresentationAssets(page);
  assert.equal(r.state, 'wrong_origin');
  assert.equal(evaluated, 0);
});

test('warmRepresentationAssets: אחרי הצלחה — לא מתחיל שוב עד שעה', async () => {
  _resetWarmState();
  const logs = [];
  let starts = 0;
  const page = {
    url: () => `${ORIGIN}/gmf-main-menu/main/home`,
    evaluate: async (fn) => {
      if (typeof fn === 'function') return { id: 'r1', running: false, result: { ok: true, total: 4, cached: 4, fetched: 0, failed: 0 }, ms: 1200 };
      starts++;
      return { state: 'started' };
    },
  };
  const t = 1_000_000;
  const first = await warmRepresentationAssets(page, { log: (m) => logs.push(m), now: t });
  assert.equal(first.state, 'fresh', 'התוצאה מהדף נקראה, ונרשמה הצלחה');
  assert.equal(starts, 0);
  assert.match(logs[0], /במטמון/);
  const later = await warmRepresentationAssets(page, { log: (m) => logs.push(m), now: t + 61 * 60_000 });
  assert.equal(later.state, 'started', 'אחרי שעה — בודקים שוב');
  assert.equal(logs.length, 1, 'אותה ריצה לא נרשמת פעמיים');
});

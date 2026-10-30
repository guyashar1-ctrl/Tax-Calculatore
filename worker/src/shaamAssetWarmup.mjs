// shaamAssetWarmup.mjs — מורידים מראש, ברקע, את קבצי הקוד של מערכת רישום הייצוג.
//
// ‼ 30.10.2026 · נמדד חי: המערכת לא מציגה כלום עד ש-~170 קבצי קוד יורדים, ובהם קובץ
// אחד של 3.9MB (kendo.all.min.js) שבלי עותק במטמון לקח 16 שניות עד יותר מ-150. שע״ם
// מתירה לשמור אותם שבוע (max-age=604800). אחרי שהם במטמון — המערכת נפתחת תוך שניות.
// לכן מיד כשהחיבור לשע״ם מוכן, הדף הפתוח (פורטל/GMF, אותו אתר ואותה עוגייה) מוריד
// אותם בעצמו, בלי ניווט ובלי לחיצה. כשהגרסה משתנה בשע״ם (פרמטר ‎?gdv=‎) — הרשימה
// נלקחת מה-HTML החי, ולכן הגרסה החדשה יורדת לבד.
//
// ‼ רץ **בתוך** הדף ולא נחכה לו: ההורדה יכולה לקחת דקות, ולולאת הנורית לא נעצרת בשבילה.
// התוצאה נשמרת ב-window, והסבב הבא קורא אותה ורושם ביומן. ניווט של הלשונית קוטע את
// ההורדה — הסבב הבא פשוט מתחיל שוב (קבצים שכבר במטמון נבדקים ב-only-if-cached, בלי רשת).

export const SHAAM_ORIGIN = 'https://shaam.taxes.gov.il';
export const REPRESENTATION_WARM_PATH = '/srmyzgipuykoach/';
/** אחרי הצלחה — בודקים שוב רק כעבור שעה (גרסה חדשה בשע״ם, מטמון שנמחק). */
export const WARM_OK_INTERVAL_MS = 60 * 60_000;
/** ריצה שנתקעה (לשונית קפואה) — אחרי 15 דקות מותר להתחיל ריצה חדשה. */
export const WARM_STALE_MS = 15 * 60_000;

let lastOkAtMs = 0;
let lastLoggedRun = null;

/** קבצי הקוד והעיצוב באותו אתר מתוך ה-HTML של המערכת — בלי כפילויות. */
export function assetUrlsFromHtml(html, pageUrl, origin = SHAAM_ORIGIN) {
  const out = new Set();
  const re = /<script\b[^>]*\bsrc\s*=\s*"([^"]+)"|<link\b[^>]*\bhref\s*=\s*"([^"]+)"/gi;
  for (const m of html.matchAll(re)) {
    const raw = m[1] ?? m[2];
    if (!raw) continue;
    let u;
    try { u = new URL(raw, pageUrl); } catch { continue; }
    if (u.origin !== origin) continue;
    if (m[2] && !/\.css(\?|$)/i.test(u.pathname + u.search)) continue;
    out.add(u.href);
  }
  return [...out];
}

/**
 * הקוד שרץ בדף. מקבל את הנתיב ואת הפונקציה שמחלצת כתובות (אותה פונקציה שנבדקת ביחידה —
 * לא עותק; מורכבת לביטוי ב-warmExpression, כי new Function בדף עלול להיחסם ב-CSP).
 * מחזיר מיד; ההורדה ממשיכה ב-window.__pivoRepWarm.
 */
function inPageWarm({ path, staleMs }, extract) {
  const w = window;
  const st = w.__pivoRepWarm;
  if (st?.running && Date.now() - st.startedAt < staleMs) return { state: 'running' };
  const run = { running: true, startedAt: Date.now(), id: Math.random().toString(36).slice(2) };
  w.__pivoRepWarm = run;
  (async () => {
    try {
      const res = await fetch(path, { credentials: 'include' });
      const html = await res.text();
      // ‼ הפניה למסך כניסה / דף אחר — לא מורידים כלום, ולא מנסים להיכנס.
      if (!/מערכת לרישום ייצוג/.test(html)) { run.result = { ok: false, reason: 'not_the_system', status: res.status }; return; }
      const urls = extract(html, res.url || new URL(path, location.origin).href, location.origin);
      const queue = [...urls];
      let cached = 0; let fetched = 0; let failed = 0;
      const one = async (u) => {
        try {
          const c = await fetch(u, { cache: 'only-if-cached', mode: 'same-origin', credentials: 'include' });
          if (c.ok) { cached++; return; }
        } catch { /* לא במטמון */ }
        try {
          const r = await fetch(u, { credentials: 'include' });
          await r.arrayBuffer();
          if (r.ok) fetched++; else failed++;
        } catch { failed++; }
      };
      await Promise.all(Array.from({ length: 4 }, async () => { while (queue.length) await one(queue.shift()); }));
      run.result = { ok: failed === 0, total: urls.length, cached, fetched, failed };
    } catch (e) {
      run.result = { ok: false, reason: String(e).slice(0, 120) };
    } finally {
      run.running = false;
      run.doneAt = Date.now();
    }
  })();
  return { state: 'started' };
}

/** התוצאה האחרונה שנשמרה בדף (בלי להתחיל ריצה). */
function inPageResult() {
  const st = window.__pivoRepWarm;
  return st ? { id: st.id, running: !!st.running, result: st.result ?? null, ms: (st.doneAt ?? Date.now()) - st.startedAt } : null;
}

/** נקרא מהסבב של הנורית, רק כשהחיבור לשע״ם מוכן ואין מסך כניסה פתוח. לא זורק. */
export async function warmRepresentationAssets(page, { log, now = Date.now() } = {}) {
  try {
    if (new URL(page.url()).origin !== SHAAM_ORIGIN) return { state: 'wrong_origin' };
  } catch { return { state: 'wrong_origin' }; }

  const prev = await page.evaluate(inPageResult).catch(() => null);
  if (prev && !prev.running && prev.result && prev.id !== lastLoggedRun) {
    lastLoggedRun = prev.id;
    const r = prev.result;
    if (r.ok) lastOkAtMs = now;
    log?.(r.ok
      ? `קבצי רישום הייצוג במטמון (${r.total}: ${r.cached} כבר היו, ${r.fetched} ירדו עכשיו · ${Math.round(prev.ms / 1000)} ש׳)`
      : `הורדה מראש של רישום הייצוג לא הושלמה (${r.reason ?? `${r.failed} קבצים נכשלו`}) — אנסה שוב בסבב הבא`);
  }
  if (prev?.running) return { state: 'running' };
  if (lastOkAtMs && now - lastOkAtMs < WARM_OK_INTERVAL_MS) return { state: 'fresh' };

  const started = await page.evaluate(warmExpression()).catch(() => null);
  return started ?? { state: 'error' };
}

/** הביטוי שנשלח לדף — CDP מריץ אותו ישירות, בלי eval בתוך הדף. */
export function warmExpression() {
  const args = JSON.stringify({ path: REPRESENTATION_WARM_PATH, staleMs: WARM_STALE_MS });
  return `(${inPageWarm.toString()})(${args}, ${assetUrlsFromHtml.toString()})`;
}

/** לבדיקות בלבד. */
export function _resetWarmState() { lastOkAtMs = 0; lastLoggedRun = null; }

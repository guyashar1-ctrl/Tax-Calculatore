// pdfBuilds.mjs — הכנת PDF ברקע לצילומים המזהים (211).
//
// ‼ למה כאן: השרת (document-pdf) בונה רק JPG/PNG/PDF שנשמרים כמו שהם. HEIC/WebP,
// קבצים עם כמה פריימים, וכל מה שחורג מ-30MB צריכים פענוח ודחיסה של Chrome —
// והעובד הזה כבר רץ ברקע במחשב המשרד, בלי קשר לשום דף פתוח באתר.
// ‼ איך: Chrome ללא-ראש **נפרד** (לא חלון שע״ם/ב"ל, לא הפרופיל שלהם) פותח את דף
// ההמרה של האתר (pdf-converter.html) — אותו קוד המרה בדיוק כמו באתר. הדף מוריד
// את המקורות ומעלה את התוצאה בכתובות חתומות וקצרות; לכאן חוזרת רק תוצאה.
// ‼ לא נוגע בשע״ם, לא באישור הלקוח ולא בהגשה. כשל ⇒ מדווח כשל, לעולם לא «מוכן».
import { chromium } from 'playwright-core';
import { pdfClaim, pdfComplete, pdfFail } from './apiClient.mjs';
import { SITE_URL, PDF_POLL_SECONDS, PDF_MAX_BYTES } from './config.mjs';

export const CONVERTER_URL = `${SITE_URL}/pdf-converter.html`;
const JOB_TIMEOUT_MS = 4 * 60_000;
const IDLE_CLOSE_MS = 3 * 60_000;

let browser = null;
let context = null;
let lastUsed = 0;
let progressLog = null;

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

async function ensureContext() {
  if (!browser?.isConnected()) {
    browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--no-first-run', '--disable-extensions'] });
    context = null;
  }
  context ??= await browser.newContext();
  return context;
}

async function closeIfIdle() {
  if (browser && Date.now() - lastUsed > IDLE_CLOSE_MS) {
    await browser.close().catch(() => {});
    browser = null;
    context = null;
  }
}

/** משימה אחת בדף נקי. ‼ טיימאאוט ⇒ זמני (ננסה שוב), לא «מוכן». */
async function convert(job) {
  const ctx = await ensureContext();
  const page = await ctx.newPage();
  // שלבי ההמרה (הורדה/בנייה/העלאה) ביומן — כדי שתקלה תיראה איפה קרתה.
  page.on('console', (m) => { if (m.type() === 'debug' && m.text().startsWith('pdf:')) progressLog?.(`   ${m.text()}`); });
  page.on('crash', () => progressLog?.('   ✗ דף ההמרה קרס (זיכרון?)'));
  let timer;
  try {
    const resp = await page.goto(CONVERTER_URL, { waitUntil: 'load', timeout: 60_000 });
    if (!resp || !resp.ok()) throw new Error(`converter_page_${resp?.status() ?? 'no_response'}`);
    await page.waitForFunction(() => (window.pivoPdfConverter?.version ?? 0) >= 1, null, { timeout: 30_000 });
    return await Promise.race([
      page.evaluate((j) => window.pivoPdfConverter.run(j), job),
      new Promise((_, rej) => { timer = setTimeout(() => rej(new Error('timeout')), JOB_TIMEOUT_MS); }),
    ]);
  } finally {
    clearTimeout(timer);
    await page.close().catch(() => {});
    lastUsed = Date.now();
  }
}

/** סבב אחד. @returns true כשהייתה עבודה (מיד סבב נוסף). */
export async function tickPdfBuilds(log) {
  progressLog = log;
  const r = await pdfClaim(2).catch((e) => ({ ok: false, error: e?.message ?? String(e) }));
  if (!r?.ok) {
    if (r?.error && r.error !== 'unknown_op') log(`✗ PDF: תפיסת עבודה נכשלה — ${r.error}`);
    await closeIfIdle();
    return false;
  }
  if (!r.builds?.length) { await closeIfIdle(); return false; }

  for (const b of r.builds) {
    log(`📄 PDF ${b.id} · ${b.sources.length === 1 ? 'קובץ אחד' : `${b.sources.length} קבצים`}`);
    let res;
    try {
      res = await convert({ sources: b.sources, uploads: b.uploads, maxBytes: PDF_MAX_BYTES });
    } catch (e) {
      res = { ok: false, code: 'transient', message: 'תקלה זמנית בהכנת ה-PDF במחשב המשרד.', next: 'ניסיון נוסף יתבצע אוטומטית.', transient: true, detail: e?.message };
    }
    if (res?.ok) {
      const c = await pdfComplete(b.id, b.fingerprint, { original: res.original, submission: res.submission })
        .catch((e) => ({ ok: false, error: e?.message ?? String(e) }));
      if (c?.ok) {
        const sub = c.submissionState === 'same' ? 'המקור הוא גם קובץ ההגשה'
          : c.submissionState === 'auto' ? 'גרסת הגשה דחוסה ברזולוציה מלאה'
          : `גרסת הגשה ${res.submission?.mode === 'downscaled' ? 'מוקטנת' : 'דחוסה מחדש'} — ממתינה לבדיקת המשרד`;
        log(`✓ PDF מוכן (${res.ms}ms) · ${sub}`);
      } else if (c?.error === 'stale') {
        log('↺ PDF: הצילום הוחלף בזמן ההמרה — התוצאה נזרקה, בנייה חדשה תרוץ');
      } else {
        // ‼ התוצאה לא נשמרה ⇒ לא «מוכן». חוזר לתור.
        log(`✗ PDF: שמירת התוצאה נכשלה — ${c?.error ?? 'unknown'}${c?.detail ? ` (${c.detail})` : ''}`);
        await pdfFail(b.id, b.fingerprint, { code: 'transient', message: 'שמירת ה-PDF נכשלה.', next: 'ניסיון נוסף יתבצע אוטומטית.', retry: true }).catch(() => {});
      }
      continue;
    }
    const which = typeof res?.partIndex === 'number' && b.sources.length > 1
      ? ` (קובץ ${res.partIndex + 1} מתוך ${b.sources.length}: ${b.sources[res.partIndex]?.fileName ?? ''})` : '';
    log(`✗ PDF ${b.id}: ${res?.code} — ${res?.message}${which}${res?.detail ? ` [${res.detail}]` : ''}`);
    await pdfFail(b.id, b.fingerprint, {
      code: res?.code ?? 'transient', message: `${res?.message ?? 'ההמרה נכשלה.'}${which}`,
      next: res?.next ?? '', retry: !!res?.transient,
    }).catch(() => {});
  }
  return true;
}

/** לולאה נפרדת מלולאת המשימות: Chrome נפרד, אין תחרות על חיבור CDP של שע״ם/ב"ל. */
export function startPdfLoop(log, isStopping) {
  log(`המרת PDF ברקע: ${CONVERTER_URL} · תשאול כל ${PDF_POLL_SECONDS}s${PDF_MAX_BYTES !== 30 * 1024 * 1024 ? ` · ‼ תקרת בדיקה ${(PDF_MAX_BYTES / 1048576).toFixed(2)}MB` : ''}`);
  const done = (async () => {
    while (!isStopping()) {
      const found = await tickPdfBuilds(log).catch((e) => { log('✗ PDF: תקלה בלולאה —', e?.message ?? e); return false; });
      if (!found && !isStopping()) await sleep(PDF_POLL_SECONDS * 1000);
    }
    await browser?.close().catch(() => {});
  })();
  return done;
}

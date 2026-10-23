#!/usr/bin/env node
/**
 * pre-push-check.mjs — הבדיקה שרצה לפני כל push (מ-.githooks/pre-push).
 *
 * ‼ למה (21.10.2026, ליאת ואוריה): 2,060 בדיקות היחידה רצו רק כשמישהו זכר, ואין CI. שינוי
 *   (269) עלה לאתר ושבר כלל שחי בקובץ אחר. מעכשיו push ל-master לא יוצא בלי:
 *     1. tsc + כל בדיקות היחידה (כשהשתנה קוד).
 *     2. בדיקות staging של התחומים שהשתנו — לפי scripts/impact-map.json (run=true).
 *     3. הבדיקה החיה של הכללים בייצור (prod-invariants-check — קריאה בלבד).
 *   קובץ בתחום שלא במפה ⇒ אזהרה («להוסיף שורה»), לא עצירה.
 * ‼ דילוג: PIVO_SKIP_CHECKS="<סיבה>" — רק עם סיבה, והיא מודפסת. לכתוב אותה גם בקומיט.
 */
import { spawnSync, execFileSync } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

const ROOT = resolve(process.cwd());
const CONFIG_ROOT = resolve(process.env.PIVO_CONFIG_ROOT || ROOT);
const t0 = Date.now();
const say = (s) => process.stderr.write(s + '\n');

const skip = process.env.PIVO_SKIP_CHECKS;
if (skip !== undefined) {
  if (!skip.trim() || skip.trim() === '1') { say('✋ PIVO_SKIP_CHECKS דורש סיבה במילים (PIVO_SKIP_CHECKS="...").'); process.exit(1); }
  say(`⚠ הבדיקה שלפני push דולגה. הסיבה: ${skip}`);
  process.exit(0);
}

// ── מה נדחף ────────────────────────────────────────────────────────────────
const ZERO = /^0+$/;
const stdin = (() => { try { return readFileSync(0, 'utf8'); } catch { return ''; } })();
const changed = new Set();
for (const line of stdin.split('\n').filter(Boolean)) {
  const [, localSha, remoteRef, remoteSha] = line.trim().split(/\s+/);
  if (!localSha || ZERO.test(localSha)) continue;          // מחיקת ענף
  if (!/refs\/heads\/master$/.test(remoteRef ?? '')) continue; // רק master = שחרור לאתר
  let base = remoteSha;
  if (!base || ZERO.test(base)) {
    try { base = execFileSync('git', ['merge-base', localSha, 'origin/master'], { encoding: 'utf8' }).trim(); } catch { base = ''; }
  }
  const range = base ? [`${base}..${localSha}`] : [localSha, '-1'];
  const out = execFileSync('git', ['diff', '--name-only', ...range], { encoding: 'utf8' });
  out.split('\n').filter(Boolean).forEach(f => changed.add(f.replace(/\\/g, '/')));
}
if (changed.size === 0) process.exit(0);
say(`בדיקה לפני push ל-master · ${changed.size} קבצים`);

// ── עזרים ──────────────────────────────────────────────────────────────────
const globRe = (g) => new RegExp('^' + g.replace(/[.+^${}()|\\]/g, '\\$&')
  .replace(/\*\*\//g, '(?:.*/)?').replace(/\*\*/g, '.*').replace(/\*/g, '[^/]*').replace(/\?/g, '.') + '$');
const run = (label, cmd, args) => {
  const s = Date.now();
  say(`\n▶ ${label}`);
  const r = spawnSync(cmd, args, { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'], encoding: 'utf8', maxBuffer: 64 << 20 });
  const all = `${r.stdout ?? ''}${r.stderr ?? ''}`;
  // ‼ באג ידוע של Node ב-Windows: קריסה ביציאה («UV_HANDLE_CLOSING») אחרי שהבדיקה כבר הסתיימה.
  //   נחשב עובר רק כשהסיכום של הבדיקה עצמה אומר «0 נכשלו».
  const exitCrash = r.status !== 0 && /UV_HANDLE_CLOSING/.test(all) && /(^|\s)0 נכשלו/.test(all);
  const ok = r.status === 0 || exitCrash;
  // בכישלון — קודם השורות שנכשלו (עם שתי שורות אחריהן), ואז הסוף.
  const lines = all.trim().split('\n');
  const failLines = ok ? [] : lines.flatMap((l, i) => (/^\s*✗/.test(l) ? lines.slice(i, i + 3) : [])).slice(0, 30);
  const tail = (ok ? lines.slice(-1) : [...failLines, ...(failLines.length ? ['…'] : []), ...lines.slice(-6)]).join('\n');
  say(`${ok ? '  ✓' : '  ✗'} ${label} (${Math.round((Date.now() - s) / 1000)}ש')${tail ? '\n' + tail.replace(/^/gm, '    ') : ''}`);
  return ok;
};
let failed = [];

// ── 1 · tsc + בדיקות יחידה ─────────────────────────────────────────────────
const codeChanged = [...changed].some(f => /^(src|scripts|supabase\/functions|worker)\//.test(f) || f === 'package.json');
if (codeChanged) {
  const tsc = resolve(ROOT, 'node_modules/typescript/bin/tsc');
  if (!existsSync(tsc)) { say('✋ אין node_modules בעותק הזה — אי אפשר לבדוק. (קישור: mklink /J node_modules …)'); process.exit(1); }
  if (!run('tsc --noEmit', process.execPath, [tsc, '--noEmit', '-p', '.'])) failed.push('tsc');
  if (!run('בדיקות יחידה', process.execPath, ['scripts/run-unit-tests.mjs'])) failed.push('unit');
}

// ── 2 · staging לפי מפת ההשפעה ─────────────────────────────────────────────
const map = JSON.parse(readFileSync(resolve(ROOT, 'scripts/impact-map.json'), 'utf8'));
const toRun = new Map(); const reminders = new Set(); const hitAreas = [];
const matched = new Set();
for (const area of map.areas) {
  const res = area.globs.map(globRe);
  const files = [...changed].filter(f => res.some(r => r.test(f)));
  if (!files.length) continue;
  files.forEach(f => matched.add(f));
  hitAreas.push(area);
  for (const s of area.suites) (s.run ? toRun.set(s.script, area.name) : reminders.add(s.script));
}
const unmapped = [...changed].filter(f => !matched.has(f) && map.watched.some(w => f.startsWith(w))
  && !/__tests__|\.test\.|\.md$|\.css$/.test(f));
if (hitAreas.length) say(`\nתחומים שהשתנו: ${hitAreas.map(a => a.name).join(' · ')}`);
const invs = [...new Set(hitAreas.flatMap(a => a.invariants ?? []))];
if (invs.length) say(`כללים שעלולים להיפגע (docs/INVARIANTS.md): ${invs.join(', ')}`);
if (toRun.size) {
  const envOk = existsSync(resolve(CONFIG_ROOT, '.env.staging')) && existsSync(resolve(ROOT, 'STAGING_USER_ID'));
  if (!envOk) {
    say('✋ חסרים .env.staging / STAGING_USER_ID בעותק הזה — בדיקות ה-staging של התחום לא יכולות לרוץ.');
    failed.push('staging-env');
  } else {
    for (const script of toRun.keys()) {
      const [file, ...args] = script.split(' ');
      if (!run(`staging · ${script}`, process.execPath, [`scripts/${file}`, ...args])) failed.push(script);
    }
  }
}
if (reminders.size) say(`\nתזכורת — בדיקות של התחום שעוד לא רצות לבד: ${[...reminders].join(', ')}`);
if (unmapped.length) say(`\n⚠ קבצים בתחום שאין לו שורה ב-scripts/impact-map.json (להוסיף):\n   ${unmapped.slice(0, 12).join('\n   ')}`);

// ── 3 · הכללים החיים בייצור (קריאה בלבד) ───────────────────────────────────
if (existsSync(resolve(CONFIG_ROOT, '.env.local'))) {
  if (!run('כללים חיים בייצור (קריאה בלבד)', process.execPath, ['scripts/prod-invariants-check.mjs'])) failed.push('prod-invariants');
} else {
  say('⚠ אין .env.local — הבדיקה החיה בייצור לא רצה.');
}

const secs = Math.round((Date.now() - t0) / 1000);
if (failed.length) {
  say(`\n✋ push נעצר (${secs}ש'): ${failed.join(', ')}. לתקן ולנסות שוב. דילוג רק עם סיבה: PIVO_SKIP_CHECKS="..."`);
  process.exit(1);
}
say(`\n✓ הכול עבר (${secs}ש') — ממשיכים ב-push.`);

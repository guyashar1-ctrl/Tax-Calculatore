// codeVersion.mjs — איזה קוד העובד מריץ בפועל, ואיזה קוד נמצא כרגע על הדיסק.
//
// ‼ 14.10.2026 · עדכון קבצים אינו עדכון של העובד. Node טוען את הקוד פעם אחת
// בהפעלה; העובד של המשרד רץ מ-11.10 והמשיך להריץ את הקוד הישן גם אחרי
// ש-worker-production עבר לגרסה החדשה ב-13.10 — ושלוש שליחות לשע״ם נעצרו על
// שומר שכבר הוסר. מכאן: הקומיט שנטען בהפעלה נשלח בכל פעימה (automation_workers.version),
// ומשימה לא רצה כשהקוד על הדיסק כבר אחר מזה שבזיכרון.
//
// קריאה ישירה של .git (בלי להריץ git): HEAD מנותק = sha; ענף = ref, קובץ או packed-refs.
// worktree: .git הוא קובץ «gitdir: …», וה-refs המשותפים יושבים ב-commondir.

import { readFileSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');

const read = (p) => { try { return readFileSync(p, 'utf8').trim(); } catch { return null; } };

function gitDirs(root) {
  const dotGit = join(root, '.git');
  let gitDir = dotGit;
  try {
    if (statSync(dotGit).isFile()) {
      const m = /^gitdir:\s*(.+)$/m.exec(read(dotGit) ?? '');
      if (!m) return null;
      gitDir = resolve(root, m[1].trim());
    }
  } catch { return null; }
  const common = read(join(gitDir, 'commondir'));
  return { gitDir, commonDir: common ? resolve(gitDir, common) : gitDir };
}

/** הקומיט שעל הדיסק עכשיו (40 תווים), או null כשאין דרך לדעת. */
export function diskCommit(root = REPO_ROOT) {
  const dirs = gitDirs(root);
  if (!dirs) return null;
  const head = read(join(dirs.gitDir, 'HEAD'));
  if (!head) return null;
  if (/^[0-9a-f]{40}$/.test(head)) return head;
  const ref = /^ref:\s*(.+)$/.exec(head)?.[1];
  if (!ref) return null;
  for (const d of [dirs.gitDir, dirs.commonDir]) {
    const v = read(join(d, ref));
    if (v && /^[0-9a-f]{40}$/.test(v)) return v;
  }
  const packed = read(join(dirs.commonDir, 'packed-refs')) ?? '';
  const line = packed.split('\n').find((l) => l.endsWith(` ${ref}`));
  return line ? line.slice(0, 40) : null;
}

/** הקומיט שנטען בהפעלת התהליך — נקבע פעם אחת, בטעינת המודול. */
export const STARTUP_COMMIT = diskCommit();

/** טהורה: מחרוזת הגרסה לפעימה — `0.1.0+5cd52a1`, ובקוד שהתיישן גם `→<חדש>`. */
export function versionLabel(base, startup, disk) {
  if (!startup) return base;
  const s = startup.slice(0, 7);
  return disk && disk !== startup ? `${base}+${s}→${disk.slice(0, 7)}` : `${base}+${s}`;
}

/**
 * טהורה: האם הקוד בזיכרון כבר אינו הקוד שעל הדיסק.
 * ‼ רק כששני הצדדים ידועים. בלי git (התקנה שאינה clone) — לא עוצרים על ניחוש.
 */
export function codeIsStale(startup, disk) {
  return !!startup && !!disk && startup !== disk;
}

#!/usr/bin/env node
/**
 * src-stamp.mjs — מדפיס את חותמת המקור הנוכחית מהדיסק.
 *
 * ‼ קיים כדי שבדיקת דפדפן תוכל לוודא שהיא רצה על הקוד הנוכחי. אותו חישוב
 * בדיוק נמצא ב-vite.config.ts, ולכן השוואה בין הערך שהדף מחזיק לבין הפלט
 * כאן מגלה מיד אם הדפדפן נשאר על גרסה ישנה.
 */
import { execSync } from 'node:child_process';
import { readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

let head = 'nogit';
try { head = execSync('git rev-parse --short HEAD').toString().trim(); } catch { /* אין ריפו */ }
let newest = 0;
const walk = (dir) => {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) walk(p);
    else { const m = statSync(p).mtimeMs; if (m > newest) newest = m; }
  }
};
walk('src');
console.log(`${head}.${Math.round(newest)}`);

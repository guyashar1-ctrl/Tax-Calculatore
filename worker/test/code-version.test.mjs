// ─── 14.10.2026 · איזה קוד העובד מריץ, ומה קורה כשהדיסק התקדם בלי הפעלה מחדש ───
// המקרה: worker-production עבר ל-5cd52a1, התהליך מ-11.10 המשיך עם הקוד הישן,
// ושלוש שליחות לשע״ם נעצרו על שומר שכבר הוסר — בלי שום סימן לכך במסך.

import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { diskCommit, versionLabel, codeIsStale, STARTUP_COMMIT } from '../src/codeVersion.mjs';

const A = 'a'.repeat(40);
const B = 'b'.repeat(40);
const repo = (files) => {
  const root = mkdtempSync(join(tmpdir(), 'pivo-codever-'));
  for (const [p, body] of Object.entries(files)) {
    mkdirSync(join(root, p, '..'), { recursive: true });
    writeFileSync(join(root, p), body);
  }
  return root;
};

test('דיסק · HEAD מנותק (כמו worker-production) ⇒ ה-sha', () => {
  assert.equal(diskCommit(repo({ '.git/HEAD': `${A}\n` })), A);
});

test('דיסק · ענף: קובץ ref, ואם אין — packed-refs', () => {
  assert.equal(diskCommit(repo({ '.git/HEAD': 'ref: refs/heads/master\n', '.git/refs/heads/master': `${A}\n` })), A);
  assert.equal(diskCommit(repo({ '.git/HEAD': 'ref: refs/heads/master\n', '.git/packed-refs': `# pack\n${B} refs/heads/master\n` })), B);
});

test('דיסק · worktree (.git הוא קובץ gitdir) — ה-refs מה-commondir', () => {
  const main = repo({ '.git/refs/heads/x': `${B}\n`, '.git/worktrees/w/HEAD': 'ref: refs/heads/x\n', '.git/worktrees/w/commondir': '../..\n' });
  const wt = repo({ '.git': `gitdir: ${join(main, '.git/worktrees/w')}\n` });
  assert.equal(diskCommit(wt), B);
});

test('דיסק · אין .git / HEAD פגום ⇒ null (לא ניחוש)', () => {
  assert.equal(diskCommit(repo({ 'x.txt': '' })), null);
  assert.equal(diskCommit(repo({ '.git/HEAD': 'garbage' })), null);
});

test('גרסה · הקומיט שנטען, ו«→חדש» כשהדיסק התקדם', () => {
  assert.equal(versionLabel('0.1.0', A, A), '0.1.0+aaaaaaa');
  assert.equal(versionLabel('0.1.0', A, B), '0.1.0+aaaaaaa→bbbbbbb');
  assert.equal(versionLabel('0.1.0', null, B), '0.1.0');
});

test('ישן · רק כששני הצדדים ידועים ושונים', () => {
  assert.equal(codeIsStale(A, B), true);
  assert.equal(codeIsStale(A, A), false);
  assert.equal(codeIsStale(null, B), false);
  assert.equal(codeIsStale(A, null), false);
});

test('הריפו הזה · הקומיט בהפעלה נקרא', () => {
  assert.match(STARTUP_COMMIT ?? '', /^[0-9a-f]{40}$/);
});

test('index · השומר רץ לפני preflight ולפני ה-handler, ומסיים בכשל מפורש בלי לגעת', () => {
  const src = readFileSync(new URL('../src/index.mjs', import.meta.url), 'utf8');
  const runJob = src.slice(src.indexOf('async function runJob('), src.indexOf('\n}\n', src.indexOf('async function runJob(')));
  const guard = runJob.indexOf('codeIsStale(STARTUP_COMMIT, disk)');
  assert.ok(guard > 0);
  assert.ok(guard < runJob.indexOf('h.preflight') && guard < runJob.indexOf('h.run('));
  assert.ok(runJob.slice(guard, runJob.indexOf('h.preflight')).includes("fail(WORKER_ID, job.id, 'worker_code_stale'"));
  // ‼ הפעימה מדווחת את הקומיט — לא קבוע.
  assert.ok(!/heartbeat\([^)]*\bVERSION\b/.test(src));
  assert.equal((src.match(/LEASE_SECONDS, version\(\)\)/g) || []).length, 3);
});

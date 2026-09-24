// ─── מחשב עבודה (203): רישום, זהות, ב״ל כפעולה משנה ────────────────────────
//   node --test worker/test/workstation.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { mergeEnv } from '../src/register.mjs';

const src = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');

test('רישום: .env מקבל זהות+אסימון, הסוד המשותף יורד, שאר ההגדרות נשמרות', () => {
  const before = '# הערה\nPIVO_FUNCTION_URL=https://x\nPIVO_WORKER_SECRET=old\nPIVO_USER_ID=u\nPIVO_MONITOR=btl\n';
  const after = mergeEnv(before, { PIVO_WORKER_ID: 'ws-1', PIVO_WORKER_TOKEN: 't', PIVO_USER_ID: 'u2' }, ['PIVO_WORKER_SECRET']);
  assert.ok(!after.includes('PIVO_WORKER_SECRET'));
  assert.ok(after.includes('# הערה') && after.includes('PIVO_MONITOR=btl') && after.includes('PIVO_FUNCTION_URL=https://x'));
  assert.ok(after.includes('PIVO_WORKER_ID=ws-1') && after.includes('PIVO_WORKER_TOKEN=t') && after.includes('PIVO_USER_ID=u2'));
  assert.equal((after.match(/PIVO_USER_ID=/g) || []).length, 1, 'לא משכפל מפתח קיים');
});

test('אימות: אסימון (x-worker-token) מועדף, ומופע נשלח בכל פנייה', () => {
  const s = src('../src/apiClient.mjs');
  assert.ok(s.includes("'x-worker-instance': INSTANCE_ID"));
  assert.ok(/if \(WORKER_TOKEN\) \{ h\['x-worker-id'\] = WORKER_ID; h\['x-worker-token'\] = WORKER_TOKEN; \}/.test(s));
});

test('10 · ב״ל: externalAttempt נרשם לפני «הוספה», ובלי רישום — לא לוחצים', () => {
  const s = src('../src/handlers/btlCreateRepresentation.mjs');
  const mark = s.indexOf("externalAttempt: { at:");
  const click = s.indexOf('await submitAddPoaForm(');
  assert.ok(mark > 0 && click > mark, 'הסימן לפני הלחיצה');
  const between = s.slice(mark, click);
  assert.ok(between.includes("'progress_write_failed_before_external'"), 'כשל רישום עוצר לפני הלחיצה');
  assert.ok(s.indexOf('openPoaTrackingScreen(page)') < mark, 'בדיקת «מעקב ייפוי כוח» (קריאה) לפני כל הזנה');
});

test('12 · תהליך כפול: הזהות תפוסה ⇒ לא מריצים, ולא נכנסים ללולאת לוג', () => {
  const s = src('../src/index.mjs');
  assert.ok(s.includes("if (j?.blocked) { noteBlocked(j.blocked); return false; }"));
});

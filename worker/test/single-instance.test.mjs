// ─── עובד אחד לכל id — הבסיס שמאפשר ל-watchdog להפעיל שוב ושוב ─────────────
//   node --test worker/test/single-instance.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { acquireSingleInstance, lockPortFor } from '../src/singleInstance.mjs';

test('פורט יציב לכל id, בטווח, ושונה בין ids שונים', () => {
  const a = lockPortFor('guy-office-pc');
  assert.equal(a, lockPortFor('guy-office-pc'));
  assert.ok(a >= 47000 && a < 48000);
  assert.notEqual(a, lockPortFor('staging-worker'));
});

test('הפעלה שנייה עם אותו id נדחית; אחרי שהראשון מת — מותר שוב', async () => {
  const port = 47999;
  const first = await acquireSingleInstance('x', { port });
  assert.equal(first.ok, true);
  const second = await acquireSingleInstance('x', { port });
  assert.equal(second.ok, false, 'עובד שני לא עולה');
  await first.release();
  const third = await acquireSingleInstance('x', { port });
  assert.equal(third.ok, true, 'הנעילה משתחררת עם התהליך — לא נשאר «נעול לנצח»');
  await third.release();
});

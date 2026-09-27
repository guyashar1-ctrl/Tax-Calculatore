// ‼ הכלל שנבדק כאן (27.09.2026): מהרגע שחלון ב״ל פתוח ולא מחובר, מציצים בו
// כל 2 שניות — ולא ממתינים לסבב של 30 שניות. וההמתנה הצפופה נגמרת בשלושה
// מקרים בלבד: התחברות, סגירת החלון, או 10 דקות בלי התחברות.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  initialBtlWatch, afterBtlCheck, watchingBtlLogin, btlPeekDue, afterBtlPeek, loopSleepMs,
  BTL_LOGIN_WATCH_MS, FAST_LOOP_AFTER_LOGIN_MS,
} from '../src/btlLoginWatch.mjs';

const T0 = 1_000_000;
const POLL = 5_000;

test('בלי חלון ב״ל — קצב רגיל, בלי הצצות', () => {
  const w = afterBtlCheck(initialBtlWatch(), T0, { connected: false, windowOpen: false, wasConnected: false });
  assert.equal(watchingBtlLogin(w, T0), false);
  assert.equal(btlPeekDue(w, T0), false);
  assert.equal(loopSleepMs(w, T0, POLL), POLL);
});

test('חלון פתוח על מסך הכניסה ⇒ הצצה מיד, ושוב כל 2 שניות, ולולאה של 2 שניות', () => {
  let w = afterBtlCheck(initialBtlWatch(), T0, { connected: false, windowOpen: true, wasConnected: false });
  assert.equal(btlPeekDue(w, T0), true);
  w = afterBtlPeek(w, T0, { connected: false, windowOpen: true });
  assert.equal(btlPeekDue(w, T0 + 1_000), false);
  assert.equal(btlPeekDue(w, T0 + 2_000), true);
  assert.equal(loopSleepMs(w, T0 + 1_000, POLL), 2_000);
});

test('סבב רגיל נוסף בזמן ההמתנה לא מאפס את שעון 10 הדקות', () => {
  let w = afterBtlCheck(initialBtlWatch(), T0, { connected: false, windowOpen: true, wasConnected: false });
  w = afterBtlCheck(w, T0 + 30_000, { connected: false, windowOpen: true, wasConnected: false });
  assert.equal(w.since, T0);
});

test('התחברות שזוהתה בהצצה ⇒ ההמתנה נגמרת, וחצי דקה של לולאה צפופה לתפיסת המשימה', () => {
  let w = afterBtlCheck(initialBtlWatch(), T0, { connected: false, windowOpen: true, wasConnected: false });
  w = afterBtlPeek(w, T0 + 6_000, { connected: true, windowOpen: true });
  assert.equal(watchingBtlLogin(w, T0 + 6_000), false);
  assert.equal(btlPeekDue(w, T0 + 8_000), false);
  assert.equal(loopSleepMs(w, T0 + 20_000, POLL), 2_000);
  assert.equal(loopSleepMs(w, T0 + 6_000 + FAST_LOOP_AFTER_LOGIN_MS, POLL), POLL);
});

test('התחברות שזוהתה בסבב הרגיל ⇒ גם היא פותחת חצי דקה של לולאה צפופה', () => {
  let w = afterBtlCheck(initialBtlWatch(), T0, { connected: false, windowOpen: true, wasConnected: false });
  w = afterBtlCheck(w, T0 + 30_000, { connected: true, windowOpen: true, wasConnected: false });
  assert.equal(watchingBtlLogin(w, T0 + 30_000), false);
  assert.equal(loopSleepMs(w, T0 + 40_000, POLL), 2_000);
});

test('כבר מחובר ⇒ סבב רגיל לא פותח שוב לולאה צפופה', () => {
  const w = afterBtlCheck(initialBtlWatch(), T0, { connected: true, windowOpen: true, wasConnected: true });
  assert.equal(loopSleepMs(w, T0 + 1_000, POLL), POLL);
});

test('החלון נסגר באמצע ההמתנה ⇒ חזרה לקצב רגיל', () => {
  let w = afterBtlCheck(initialBtlWatch(), T0, { connected: false, windowOpen: true, wasConnected: false });
  w = afterBtlPeek(w, T0 + 2_000, { connected: false, windowOpen: false });
  assert.equal(watchingBtlLogin(w, T0 + 2_000), false);
  assert.equal(loopSleepMs(w, T0 + 3_000, POLL), POLL);
});

test('חלון שנשכח על מסך הכניסה ⇒ אחרי 10 דקות חוזרים לקצב הרגיל', () => {
  const w = afterBtlCheck(initialBtlWatch(), T0, { connected: false, windowOpen: true, wasConnected: false });
  assert.equal(btlPeekDue(w, T0 + BTL_LOGIN_WATCH_MS - 1), true);
  assert.equal(btlPeekDue(w, T0 + BTL_LOGIN_WATCH_MS), false);
  assert.equal(loopSleepMs(w, T0 + BTL_LOGIN_WATCH_MS, POLL), POLL);
});

test('קצב תשאול שהוגדר קצר מ-2 שניות לא מואט', () => {
  const w = afterBtlCheck(initialBtlWatch(), T0, { connected: false, windowOpen: true, wasConnected: false });
  assert.equal(loopSleepMs(w, T0, 1_000), 1_000);
});

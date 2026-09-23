// ─── רתמת בדיקות זעירה ──────────────────────────────────────────────────────
// ‼ בלי תלות חדשה: אין בפרויקט מריץ בדיקות, והוספת אחד היא החלטה בפני
// עצמה. הקבצים כאן הם TypeScript רגיל שנכלל ב-tsconfig (ולכן `tsc` בודק
// אותם), ו-`scripts/run-unit-tests.mjs` מאגד אותם עם esbuild שכבר מותקן
// ומריץ ב-Node. אפס תלויות חדשות, ובדיקות שנשברות כשהטיפוסים נשברים.

export interface TestCase {
  name: string;
  fn: () => void;
}

export function test(name: string, fn: () => void): TestCase {
  return { name, fn };
}

export class AssertionError extends Error {}

export function assert(cond: unknown, message: string): asserts cond {
  if (!cond) throw new AssertionError(message);
}

export function equal<T>(actual: T, expected: T, message?: string): void {
  if (!Object.is(actual, expected)) {
    throw new AssertionError(
      `${message ? message + ' — ' : ''}expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`,
    );
  }
}

export function deepEqual(actual: unknown, expected: unknown, message?: string): void {
  const a = JSON.stringify(actual), b = JSON.stringify(expected);
  if (a !== b) {
    throw new AssertionError(`${message ? message + ' — ' : ''}expected ${b}, got ${a}`);
  }
}

export function includes(haystack: readonly unknown[], needle: unknown, message?: string): void {
  if (!haystack.some(x => Object.is(x, needle))) {
    throw new AssertionError(`${message ? message + ' — ' : ''}${JSON.stringify(haystack)} does not include ${JSON.stringify(needle)}`);
  }
}

export function excludes(haystack: readonly unknown[], needle: unknown, message?: string): void {
  if (haystack.some(x => Object.is(x, needle))) {
    throw new AssertionError(`${message ? message + ' — ' : ''}${JSON.stringify(haystack)} must not include ${JSON.stringify(needle)}`);
  }
}

/** מריץ סדרה ומחזיר סיכום. אין תלות ב-process/console כאן — המריץ מדפיס. */
export function runSuite(suite: TestCase[]): { name: string; error?: string }[] {
  return suite.map(t => {
    try {
      t.fn();
      return { name: t.name };
    } catch (e) {
      return { name: t.name, error: e instanceof Error ? e.message : String(e) };
    }
  });
}

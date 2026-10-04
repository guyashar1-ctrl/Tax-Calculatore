// ─── בדיקות: שינוי בקטלוג ההצעות מגיע לכל המופעים ───────────────────────────
// ‼ בונה ההצעה (App) ו«הצעות מחיר» (הגדרות) מחזיקים מופעים נפרדים של ה-hook.
// תבנית שנשמרה בהגדרות חייבת להגיע לבונה בלי רענון.

import { test, equal } from '../../testkit/tinyTest';
import type { TestCase } from '../../testkit/tinyTest';
import {
  QUOTATION_CATALOG_EVENT, notifyQuotationCatalogChanged, onQuotationCatalogChanged,
} from '../useQuotationCatalog';
import src from '../useQuotationCatalog.ts?raw';

function withWindow(run: () => void) {
  const g = globalThis as { window?: unknown };
  const prev = g.window;
  g.window = new EventTarget();
  try { run(); } finally { g.window = prev; }
}

export const TESTS: TestCase[] = [
  test('הודעה על שינוי מגיעה למאזין, ואחרי ביטול ההרשמה כבר לא', () => withWindow(() => {
    let hits = 0;
    const off = onQuotationCatalogChanged(() => { hits++; });
    notifyQuotationCatalogChanged();
    equal(hits, 1);
    off();
    notifyQuotationCatalogChanged();
    equal(hits, 1);
    equal(QUOTATION_CATALOG_EVENT, 'pivo:quotation-catalog');
  })),
  test('בלי window (שרת/בדיקות) — לא נופל', () => {
    const off = onQuotationCatalogChanged(() => {});
    notifyQuotationCatalogChanged();
    off();
  }),
  test('כל הוספה/עדכון/מחיקה מודיעה, והטעינה תלויה במונה', () => {
    const text = String(src).replace(/\r\n/g, '\n');
    equal((text.match(/notifyQuotationCatalogChanged\(\);/g) ?? []).length, 6);
    equal(text.includes('}, [userId, reloadTick]);'), true);
  }),
];

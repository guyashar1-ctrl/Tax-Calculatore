// ─── לשונית ישנה אחרי שחרור: מזהים «קובץ המסך נמחק» ולא שגיאות אחרות (25.10.2026) ───

import { test, assert } from '../../testkit/tinyTest';
import type { TestCase } from '../../testkit/tinyTest';
import { isStaleChunkError } from '../staleChunk';

export const TESTS: TestCase[] = [
  test('קובץ מסך שנמחק בשחרור — Chrome, Firefox, Safari; שגיאה רגילה — לא', () => {
    assert(isStaleChunkError(new TypeError('Failed to fetch dynamically imported module: https://x/assets/TaxArea-abc.js')), 'Chrome');
    assert(isStaleChunkError(new TypeError('error loading dynamically imported module')), 'Firefox');
    assert(isStaleChunkError(new TypeError('Importing a module script failed.')), 'Safari');
    assert(isStaleChunkError(new Error('Unable to preload CSS for /assets/x.css')), 'vite CSS');
    assert(!isStaleChunkError(new TypeError("Cannot read properties of undefined (reading 'id')")), 'נתון פגום — הודעת השגיאה הרגילה');
    assert(!isStaleChunkError(null), 'בלי שגיאה');
  }),
];

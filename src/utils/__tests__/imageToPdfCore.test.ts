// ─── הליבה של ההמרה ל-PDF — מה שהשרת מריץ (01.10.2026) ───────────────────────
// ‼ הבדיקה בדפדפן (scripts/qa/run-pdf-conversion-qa.mjs) עוברת דרך הפענוח של
// הדפדפן — PNG שקוף שם בכלל לא מגיע לליבה. כאן המסלול של השרת עצמו (UPNG +
// פיקסלים גולמיים), שבו נמצא באג אמיתי: UPNG עטוף ב-default תחת Node.

import { test, equal, assert } from '../../testkit/tinyTest';
import type { TestCase } from '../../testkit/tinyTest';
import { PDFDocument, degrees, drawImage } from 'pdf-lib';
import UPNG from '@pdf-lib/upng';
import {
  buildDocumentPdfWith, sniffFormat, needsBrowserDecoder, pdfVersionIdFor, backdropFor, ImageConversionError,
  type PdfLib,
} from '../../../supabase/functions/_shared/imageToPdfCore';

const LIB = { PDFDocument, degrees, UPNG, drawImageOp: drawImage } as unknown as PdfLib;
const SERVER_LIB_NO_UPNG = { PDFDocument, degrees } as unknown as PdfLib;

/** PNG אמיתי בגודל w×h, RGBA, צבע אחד ושקיפות נתונה — נבנה עם UPNG עצמו. */
function rgbaPng(w: number, h: number, rgba: [number, number, number, number]): Uint8Array {
  const buf = new Uint8Array(w * h * 4);
  for (let i = 0; i < buf.length; i += 4) buf.set(rgba, i);
  const lib = (UPNG as unknown as { encode?: unknown; default?: typeof UPNG }).encode ? UPNG : (UPNG as unknown as { default: typeof UPNG }).default;
  return new Uint8Array(lib.encode([buf.buffer], w, h, 0));
}
const head = (s: string, extra: number[] = []) => new Uint8Array([...s].map(c => c.charCodeAt(0)).concat(extra));
const ftyp = (major: string, compat: string[] = []) => {
  const body = [...'ftyp', ...major, ...'\0\0\0\0', ...compat.join('')].map(c => c.charCodeAt(0));
  const size = body.length + 4;
  return new Uint8Array([0, 0, 0, size, ...body]);
};

export const TESTS: TestCase[] = [
  test('זיהוי סוג לפי התוכן — כל הפורמטים שמגיעים מטלפונים וסורקים', () => {
    equal(sniffFormat(new Uint8Array([0xff, 0xd8, 0xff, 0xe0])), 'jpeg');
    equal(sniffFormat(rgbaPng(1, 1, [0, 0, 0, 255])), 'png');
    equal(sniffFormat(head('%PDF-1.7')), 'pdf');
    equal(sniffFormat(head('RIFF\0\0\0\0WEBPVP8 ')), 'webp');
    equal(sniffFormat(ftyp('heic')), 'heic');
    equal(sniffFormat(ftyp('mif1', ['mif1', 'heic'])), 'heic');
    equal(sniffFormat(ftyp('mif1', ['avif'])), 'avif', 'mif1 עם avif ⇒ AVIF ולא HEIC');
    equal(sniffFormat(head('GIF89a')), 'gif');
    equal(sniffFormat(head('BM', [0, 0])), 'bmp');
    equal(sniffFormat(new Uint8Array([0x49, 0x49, 0x2a, 0x00])), 'tiff');
    equal(sniffFormat(head('<?xml version="1.0"?><svg ')), 'svg');
    equal(sniffFormat(new Uint8Array([1, 2, 3, 4, 5])), 'unknown');
    assert(['heic', 'webp', 'avif', 'gif', 'bmp', 'tiff'].every(f => needsBrowserDecoder(f as never)), 'אלה — לדפדפן');
    assert(!['jpeg', 'png', 'pdf'].some(f => needsBrowserDecoder(f as never)), 'אלה — ישירות');
  }),

  test('שרת · PNG שקוף עם תוכן כהה ⇒ רקע לבן, בלי אובדן, עמוד אחד', async () => {
    const r = await buildDocumentPdfWith(LIB, [rgbaPng(40, 30, [20, 20, 20, 255])]);
    equal(r.pageCount, 1);
    equal(r.lossless, true);
    const png = rgbaPng(40, 30, [10, 10, 10, 128]);
    const r2 = await buildDocumentPdfWith(LIB, [png]);
    equal(r2.parts[0].flattened, 'white');
  }),

  test('שרת · PNG שקוף עם תוכן לבן ⇒ רקע אפור, והערה גלויה (התוכן לא נעלם)', async () => {
    // חצי שקוף לגמרי, חצי לבן אטום — כמו לוגו לבן על רקע שקוף.
    const w = 20, h = 20, buf = new Uint8Array(w * h * 4);
    for (let i = 0; i < w * h; i++) { const o = i * 4; if (i % 2) buf.set([255, 255, 255, 255], o); else buf.set([0, 0, 0, 0], o); }
    const lib = (UPNG as unknown as { encode?: unknown }).encode ? UPNG : (UPNG as unknown as { default: typeof UPNG }).default;
    const png = new Uint8Array(lib.encode([buf.buffer], w, h, 0));
    const r = await buildDocumentPdfWith(LIB, [png]);
    equal(r.parts[0].flattened, 'grey');
    assert(r.notes.some(n => /רקע אפור/.test(n)), r.notes.join(' | '));
    equal(backdropFor(buf).tone, 'grey');
  }),

  test('שרת · בלי UPNG (תאימות לאחור) ⇒ PNG שקוף עדיין עובר', async () => {
    const r = await buildDocumentPdfWith(SERVER_LIB_NO_UPNG, [rgbaPng(4, 4, [0, 0, 0, 100])]);
    equal(r.pageCount, 1);
  }),

  test('שרת · HEIC/WebP ⇒ «needs_decoder» (לדפדפן), לא כשל שקט ולא PDF חלקי', async () => {
    for (const bytes of [ftyp('heic'), head('RIFF\0\0\0\0WEBPVP8 ')]) {
      let err: unknown;
      try { await buildDocumentPdfWith(LIB, [rgbaPng(2, 2, [0, 0, 0, 255]), bytes]); } catch (e) { err = e; }
      assert(err instanceof ImageConversionError, 'נזרקה שגיאת המרה');
      equal((err as ImageConversionError).code, 'needs_decoder');
      equal((err as ImageConversionError).partIndex, 1, 'מסומן איזה חלק');
    }
  }),

  test('מגבלת גודל ⇒ «too_large» עם מספרים, לא דחיסה שקטה', async () => {
    let err: unknown;
    try { await buildDocumentPdfWith(LIB, [rgbaPng(8, 8, [0, 0, 0, 255])], { maxBytes: 50 }); } catch (e) { err = e; }
    assert(err instanceof ImageConversionError && err.code === 'too_large' && /מותר עד/.test(err.message), String(err));
  }),

  test('מזהה ה-PDF הנגזר — אותה נוסחה כמו במסד (_pdf_build_id) ובעובד', async () => {
    const a = await pdfVersionIdFor(['b-2', 'a-1']);
    const b = await pdfVersionIdFor(['a-1', 'b-2']);
    equal(a, b, 'לא תלוי בסדר');
    assert(/^pdf-[0-9a-f]{24}$/.test(a), a);
  }),
];

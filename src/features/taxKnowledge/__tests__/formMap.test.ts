// ─── בדיקות: מפת הטופס — מיקום רק ממה שמודפס בטופס, וכל שדה בבית אחד (16.10.2026) ─────────────────
// ‼ מה נעול כאן:
//   · כל סימון יושב בתוך העמוד, על עמוד שקיים — ובטופס 1301 לפחות 200 קודים מוקמו (נמדד 16.10: 232).
//   · כל שדה בקטלוג — או מסומן, או ברשימת «בלי סימון» עם סיבה. שום שדה לא נעלם.
//   · «אתר שדה לפי קוד» מחזיר את כל ההתאמות (40 ⇒ 1301 + 1399י + 1219), ו«42» מוצא את 042.
//   · ההסבר: «מה ממלאים» מהקטלוג, «מאיפה» כולל את המסמך (158 ⇒ טופס 106), ו«ללמוד לעומק» לנושא קיים.
//   · מצב לקוח: לא «[object Object]», ונתון מהכרטיס הוא «לאישור» — לא «ידוע».

import { test, equal, assert } from '../../../testkit/tinyTest';
import type { TestCase } from '../../../testkit/tinyTest';
import type { Client } from '../../../types';
import { TOPIC_BY_ID } from '../topics';
import {
  LAYOUTS, MAP_FORMS, clientStateOf, explainOf, fieldsOf, findByCode, learnTopicsOf, markersOf, relatedFormsOf, sourcesOf, unplacedOf, wealthCodes,
} from '../formMap/model';
import { splitByYear } from '../topics/MaternityBody';

export const TESTS: TestCase[] = [
  test('כל סימון בתוך העמוד ועל עמוד שקיים', () => {
    for (const f of MAP_FORMS) {
      const L = LAYOUTS[f.slug];
      for (const a of L.anchors) {
        const [x, y, w, h] = a.box;
        assert(a.page >= 1 && a.page <= L.pages.length, `${f.slug} ${a.code}: עמוד ${a.page}`);
        assert(x >= 0 && y >= 0 && w > 0 && h > 0 && x + w <= 1.001 && y + h <= 1.001, `${f.slug} ${a.code}: ${a.box.join(',')}`);
      }
      assert(L.pages.every(p => p.img.startsWith(`/forms/2025/${f.slug}/`)), `${f.slug}: תמונות העמודים`);
    }
  }),

  test('1301: לפחות 200 קודים מוקמו, ושום קוד לא «מעורפל»', () => {
    const L = LAYOUTS['1301'];
    assert(new Set(L.anchors.map(a => a.code)).size >= 200, `${new Set(L.anchors.map(a => a.code)).size}`);
    equal(L.ambiguous.length, 0);
  }),

  test('כל שדה בקטלוג — מסומן או ברשימה עם סיבה; אף שדה לא נעלם', () => {
    for (const f of MAP_FORMS) {
      const placed = new Set(markersOf(f.slug).flatMap(m => m.fields.map(x => x.field.key)));
      const un = new Set(unplacedOf(f.slug).map(u => u.field.key));
      for (const fl of fieldsOf(f.slug)) assert(placed.has(fl.key) !== un.has(fl.key), `${f.slug} ${fl.key}: ${placed.has(fl.key) ? 'מסומן' : ''}${un.has(fl.key) ? ' ברשימה' : ''}`);
    }
    equal(fieldsOf('1301').length, 305);
  }),

  test('שדה ששני בני הזוג חולקים שורה — קוד לכל אחד, באותו עמוד', () => {
    const f = fieldsOf('1301').find(x => x.codes.some(c => c.code === '158'))!;
    equal(f.codes.map(c => `${c.code}:${c.role}`).join(), '158:registered,172:spouse');
    const pages = f.codes.map(c => markersOf('1301').find(m => m.code === c.code)?.page);
    equal(pages.join(), '2,2');
  }),

  test('אתר שדה לפי קוד: כל ההתאמות, «42» ⇒ 042', () => {
    const h40 = findByCode('40');
    assert(['1301', '1399y', '1219'].every(s => h40.some(h => h.slug === s)), h40.map(h => `${h.slug}:${h.code}`).join());
    assert(findByCode('42').some(h => h.slug === '1301' && h.code === '042' && h.page === 4), '042 בעמ׳ 4');
    equal(findByCode('').length, 0);
    equal(findByCode('abc').length, 0);
    // 1219 אינו טופס שנתי — לא מוצגת שנה
    assert(h40.filter(h => h.slug === '1219').every(h => h.taxYear === null), '1219 בלי שנה');
  }),

  test('הסבר ליד השדה: מה ממלאים, מאיפה (מסמך), ללמוד לעומק לנושא קיים', () => {
    const f = fieldsOf('1301').find(x => x.codes.some(c => c.code === '158'))!;
    assert(!!explainOf(f).what, 'מה ממלאים');
    const src = sourcesOf(f);
    assert(src.documents.some(d => d.label === 'טופס 106'), JSON.stringify(src.documents));
    assert(src.questions.length > 0 && src.questions[0].strong, 'שאלה בשאלון שמבקשת את 106 — ראשונה');
    assert(src.file?.label === 'חלקי בתיק', String(src.file?.label));
    for (const ff of fieldsOf('1301')) for (const t of learnTopicsOf(ff)) assert(!!TOPIC_BY_ID[t.id], `${ff.key} ⇒ ${t.id}`);
    // פנסיה לעצמאי (135/180) — לפי הקוד, לא לפי החלק
    const p = fieldsOf('1301').find(x => x.codes.some(c => c.code === '135'))!;
    equal(learnTopicsOf(p)[0].how, 'code');
  }),

  test('1219: «300 עד 340» ⇒ חמישה קודים; שורה 30 עם בדיקה וטעות נפוצה', () => {
    equal(wealthCodes('300 עד 340').join(), '300,310,320,330,340');
    equal(wealthCodes('ד׳ 1').length, 0);
    const bank = fieldsOf('1219').find(x => x.codes.some(c => c.code === '30'))!;
    const ex = explainOf(bank);
    assert(!!ex.what && !!ex.check && !!ex.mistake, JSON.stringify(ex));
    assert(sourcesOf(bank).questions.length > 0, 'שאלות הון לבנקים');
  }),

  test('מצב לקוח: נתון מהכרטיס הוא «לאישור», ורשימה לא מוצגת «[object Object]»', () => {
    const client = { id: 'c1', firstName: 'דנה', lastName: 'לוי', employers: [{ name: 'א' }, { name: 'ב' }] } as unknown as Client;
    const f = fieldsOf('1301').find(x => x.codes.some(c => c.code === '158'))!;
    const st = clientStateOf(f, client);
    equal(st.state, 'verify');
    assert(!/object Object/.test(st.reason), st.reason);
    const empty = clientStateOf(f, { id: 'c2' } as unknown as Client);
    assert(empty.state !== 'known', empty.state);
  }),

  // ‼ 16.10 (דמי לידה): 116ג במפה, ושדות 1301 הרלוונטיים מפנים אליו ולנושא
  test('דמי לידה: 250, 194, 040 והסימון בעמ׳ 1 ⇒ «טופס קשור: 116ג» ונושא «דמי לידה»', () => {
    const f1301 = fieldsOf('1301');
    const byCode = (c: string) => f1301.find(f => f.codes.some(x => x.code === c))!;
    for (const c of ['250', '194', '040']) {
      const f = byCode(c);
      assert(!!f, c);
      equal(relatedFormsOf(f)[0]?.slug, '116c');
      assert(learnTopicsOf(f).some(t => t.id === 'maternity'), `${c}: ללמוד לעומק — דמי לידה`);
    }
    const mark = f1301.find(f => f.key === 'F026')!;
    equal(relatedFormsOf(mark)[0]?.slug, '116c');
    equal(learnTopicsOf(mark)[0]?.id, 'maternity');
    equal(relatedFormsOf(byCode('158')).length, 0);
  }),

  test('116ג: סוג 9 «דמי לידה / מילואים» מסומן על תיבת הסימון, עם הוראה מאומתת', () => {
    const f = fieldsOf('116c').find(x => x.label.startsWith('דמי לידה'))!;
    assert(!!f && !!f.instruction && f.claim === 'verified', 'הוראה');
    const m = markersOf('116c').find(x => x.fields.some(y => y.field.key === f.key));
    assert(!!m, 'יש סימון');
    // check = התווית יחד עם הריבוע שלה — לא הפסקה שמעליה
    equal(m!.how, 'check');
    assert(m!.box[3] < 0.03 && m!.page === 1, `שורה אחת: ${m!.box.join(',')}`);
    assert(TOPIC_BY_ID.maternity && learnTopicsOf(f)[0]?.id === 'maternity', 'נושא');
  }),

  test('חלוקה לפי ימי זכאות: נייר העבודה (24/81) ו«דע זכויותיך» (61/44)', () => {
    const r = splitByYear('2023-12-08', '2024-03-21', 39_942, 256);
    equal(r.map(x => `${x.year}:${x.days}:${x.income}:${x.tax}`).join(' '), '2023:24:9129.6:58.5 2024:81:30812.4:197.5');
    equal(splitByYear('2024-11-01', '2025-02-13', 105, 0).map(x => x.days).join('/'), '61/44');
    equal(splitByYear('2025-03-01', '2025-04-25', 1, 0).length, 1);
    equal(splitByYear('2025-05-01', '2025-04-01', 1, 0).length, 0);
  }),
];

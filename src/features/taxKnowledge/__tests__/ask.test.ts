// ─── בדיקות: «שאל» — מאגר הכללים, החיפוש המיידי ופרומט העדכון (21.10.2026) ──────────
// ‼ מה נעול כאן:
//   · המאגר שבקובץ זהה למה שנבנה עכשיו מהנושאים — שינוי בידע בלי `node scripts/knowledge-corpus.mjs` נופל כאן,
//     אחרת «שאל» והפונקציה בשרת עונים מנוסח ישן.
//   · השאלה של גיא מ-21.10 («קרן השתלמות לעוסק זעיר») מוצאת בראש את הכלל של 17(5א) בעסק זעיר.
//   · חילוץ טענה: התג נקשר ליחידה השלמה (שורה בטבלה עם הכותרת, טעות+תיקון), לא לתא או למילה.
//   · פרומט העדכון כולל את הפריטים הממתינים מהתואר ואת השאלות הפתוחות, ומחליף את הגבול הכללי בגבול הסבב.

import { test, equal, assert } from '../../../testkit/tinyTest';
import type { TestCase } from '../../../testkit/tinyTest';
import { buildCorpus } from '../corpus/buildCorpus';
import { claimsFromHtml } from '../corpus/htmlClaims';
import corpus from '../corpus/corpus.json';
import type { KnowledgeRule } from '../corpus/types';
import { normWord, searchRules } from '../ask/localSearch';
import { buildUpdatePrompt } from '../ask/updatePrompt';

const RULES = corpus as KnowledgeRule[];

export const TESTS: TestCase[] = [
  test('המאגר בקובץ זהה לבנייה מהנושאים (אחרת: node scripts/knowledge-corpus.mjs)', () => {
    const fresh = buildCorpus();
    equal(fresh.length, RULES.length, 'מספר הכללים');
    const diff = fresh.findIndex((r, i) => JSON.stringify(r) !== JSON.stringify(RULES[i]));
    equal(diff, -1, diff >= 0 ? `שונה: ${fresh[diff].id}` : '');
  }),
  test('מזהים ייחודיים, ולכל כלל מעמד ונוסח', () => {
    equal(new Set(RULES.map(r => r.id)).size, RULES.length);
    assert(RULES.every(r => ['verified', 'interpretation', 'open'].includes(r.status) && r.text.length >= 12), 'כלל בלי מעמד או קצר מדי');
  }),
  test('«קרן השתלמות לעוסק זעיר» — הכלל של 17(5א) בעסק זעיר בראש', () => {
    const top = searchRules(RULES, 'קרן השתלמות לעוסק זעיר', 3);
    assert(top.some(h => h.rule.topic === 'microBusiness' && h.rule.text.includes('17(5א)')), top.map(h => h.rule.id).join(', '));
  }),
  test('נרמול: «עוסק» = «עסק», אותיות שימוש, ב״ל', () => {
    assert(normWord('לעוסק').includes('עסק'), 'לעוסק');
    assert(normWord('ב״ל').includes('ביטוח'), 'ב״ל');
    assert(normWord('והשתלמות').includes('השתלמות'), 'והשתלמות');
  }),
  test('חילוץ: שורה בטבלה עם הכותרת, טעות עם התיקון, בלי המקרא', () => {
    const html = '<section id="s1"><h2>השוואה</h2><table><thead><tr><th>מצב</th><th>מקוצר</th></tr></thead><tbody>'
      + '<tr><td>קרן השתלמות</td><td>אין שדה <span class="kn-claim verified">מאומת</span></td></tr></tbody></table>'
      + '<div class="kn-mistake"><div class="kn-mistake-wrong"><span>טעות</span><span>לנכות הכול</span></div>'
      + '<div class="kn-mistake-right"><span>נכון</span><span>רק עד התקרה</span> <span class="kn-claim open">פתוח</span></div></div>'
      + '<p class="kn-legend-claims"><span class="kn-claim verified">מאומת</span> מקור רשמי שנקרא</p></section>';
    const c = claimsFromHtml(html);
    equal(c.length, 2, JSON.stringify(c));
    equal(c[0].text, '(מצב | מקוצר) קרן השתלמות | אין שדה');
    equal(c[0].sectionTitle, 'השוואה');
    assert(c[1].text.includes('לנכות הכול') && c[1].text.includes('רק עד התקרה') && c[1].status === 'open', c[1].text);
  }),
  test('פרומט העדכון: פריטים מהתואר, שאלות פתוחות, וגבול הסבב', () => {
    const p = buildUpdatePrompt({
      ruleCount: 822,
      inbox: [{ id: 'i1', title: 'מיסוי בינלאומי — שיעור 4', files: [{ path: 'u/i1/a.pdf', name: 'a.pdf', size: 1 }], status: 'waiting', createdAt: '2026-10-21T10:00:00Z' },
        { id: 'i2', title: 'נקלט כבר', files: [], status: 'ingested', createdAt: '2026-10-20T10:00:00Z' }],
      questions: [{ id: 'q1', question: 'מענק מילואים לעצמאי — חייב בב״ל?', createdAt: '2026-10-21T10:00:00Z', answerable: false }],
    });
    assert(p.includes('[i1] מיסוי בינלאומי') && p.includes('u/i1/a.pdf'), 'פריט ממתין');
    assert(!p.includes('[i2]'), 'פריט שנקלט לא נכנס');
    assert(p.includes('[q1]'), 'שאלה פתוחה');
    assert(p.includes('גבולות הסבב הזה') && !p.includes('\nגבולות: אין commit'), 'הגבול הוחלף');
    assert(p.includes('node scripts/knowledge-corpus.mjs'), 'בניית המאגר');
  }),
];

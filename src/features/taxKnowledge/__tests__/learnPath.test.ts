// ─── בדיקות: מסלול הלימוד ומצב הנושא במילים (14.10.2026) ─────────────────────────────────────
// ‼ מה נעול כאן:
//   · כל סעיף בכל נושא משויך לשלב, ולכל נושא יש לפחות «מה זה» ו«מה עושים בתיק».
//   · «מה מבקשים מהלקוח» נגזר מהשאלון האמיתי — בששת הנושאים שגיא ביקש לבדוק יש שאלות.
//   · אין יותר «שמיש · עם פערים» או «מקור משני» בלי הסבר: המצב אומר מה אפשר לעשות ומה לבדוק.
//   · נושא בבירור לעולם לא מוצג כבסיס לחישוב סופי; ערך שלא אומת — «לא לחשב לפיו».

import { test, equal, assert } from '../../../testkit/tinyTest';
import type { TestCase } from '../../../testkit/tinyTest';
import { STAGES, visibleStages, clientAsksFor, documentsFor, plainStatus, stageOfSection, type Stage } from '../learnPath';
import { TOPICS } from '../topics';
import { STUDY_FUND_TOC } from '../topics/StudyFundBody';
import { PENSION_TOC } from '../topics/PensionBody';
import { MANDATORY_TOC } from '../topics/MandatoryPensionBody';
import { NI_TOC } from '../topics/NiBody';
import { ADVANCES_TOC } from '../topics/AdvancesBody';
import { WEALTH_TOC } from '../topics/WealthBody';
import { MICRO_TOC } from '../topics/MicroBusinessBody';
import { ANNUAL_TOC } from '../topics/AnnualReturnBody';
import { FORM6111_TOC } from '../topics/Form6111Body';
import { MATERNITY_TOC } from '../topics/MaternityBody';
import TOPIC_PAGE from '../TopicPage.tsx?raw';

const TOCS = { studyFund: STUDY_FUND_TOC, pensionSE: PENSION_TOC, mandatoryPension: MANDATORY_TOC, niSelfEmployed: NI_TOC, advances: ADVANCES_TOC,
  wealth: WEALTH_TOC, microBusiness: MICRO_TOC, annualReturn: ANNUAL_TOC, form6111: FORM6111_TOC, maternity: MATERNITY_TOC } as const;

export const TESTS: TestCase[] = [
  test('שמונה שלבים, בסדר שגיא ביקש', () => {
    equal(STAGES.map(s => s.id).join(','), 'what,ask,read,calc,except,next,practice,sources');
  }),

  test('כל נושא: לכל סעיף שלב, ויש «מה זה» ו«מה עושים בתיק»', () => {
    for (const t of TOPICS) {
      const toc = TOCS[t.id as keyof typeof TOCS];
      assert(!!toc, `אין תוכן עניינים לנושא ${t.id}`);
      const stages = new Set<Stage>(toc.map(stageOfSection));
      assert(stages.has('what'), `${t.id}: אין «מה זה»`);
      assert(stages.has('next'), `${t.id}: אין «מה עושים בתיק»`);
    }
  }),

  test('שיוכים שהכותרת לבדה הייתה מפספסת', () => {
    equal(stageOfSection({ id: 'ar-docs', label: 'ממסמך לשדה', view: 'learn' }), 'read');
    equal(stageOfSection({ id: 'wd-fields', label: 'שדה אחר שדה', view: 'learn' }), 'read');
    equal(stageOfSection({ id: 'x', label: 'טעויות נפוצות', view: 'learn' }), 'except');
    equal(stageOfSection({ id: 'x', label: 'תרגול', view: 'learn' }), 'practice');
    equal(stageOfSection({ id: 'x', label: 'מה עושים בתיק', view: 'apply' }), 'next');
  }),

  test('«מה מבקשים מהלקוח» — מהשאלון, בכל אחד מהנושאים שגיא ביקש לבדוק', () => {
    for (const id of ['pensionSE', 'studyFund', 'niSelfEmployed', 'advances', 'microBusiness', 'annualReturn', 'wealth', 'form6111']) {
      const asks = clientAsksFor(id);
      assert(asks.length > 0 && asks.some(a => a.asks.length > 0), `אין שאלות ל-${id}`);
      for (const a of asks) for (const x of a.asks) assert(!/[{}]/.test(x.question ?? '') && !/[{}]/.test(x.label), `תבנית לא הוחלפה: ${x.key} — ${x.question ?? x.label}`);
    }
    assert(documentsFor('annualReturn').length > 0, 'בדוח השנתי מבקשים מסמכים');
  }),

  test('המצב במילים: נושא בבירור אינו בסיס לחישוב סופי', () => {
    const r = plainStatus('research', 'primary', 0);
    equal(r.tone, 'stop');
    assert(r.label.includes('לא לחישוב סופי'), r.label);
  }),

  test('המצב במילים: ערך שלא אומת — לא לחשב לפיו; משני — לאמת לפני הגשה', () => {
    assert(plainStatus('usable', 'unverified', 2).basis.includes('לא לחשב לפיו'), "line 66");
    assert(plainStatus('usable', 'secondary', 2).basis.includes('לאמת לפני הגשה'), "line 67");
    const ok = plainStatus('usable', 'primary', 0);
    equal(ok.tone, 'ok');
    assert(plainStatus('usable', 'primary', 3).label.includes('3 שאלות מקצועיות פתוחות'), "line 70");
    assert(plainStatus('usable', 'primary', 1).label.includes('שאלה מקצועית אחת פתוחה'), "line 71");
  }),

  test('התוויות הישנות לא חזרו לעמוד הנושא', () => {
    for (const old of ['שמיש · עם פערים', 'הביסוס החלש:', 'מחקר פתוח · לא סופי']) assert(!TOPIC_PAGE.includes(old), old);
  }),
  test('לא כופים שמונה שלבים: שלב בלי תוכן לא מוצג; «מה זה» ו«מקורות» תמיד', () => {
    const ids = (x: Parameters<typeof visibleStages>[0]) => visibleStages(x).map(s => s.id).join(',');
    equal(ids({ counts: {}, asks: 0, gaps: 0, nextExtras: false }), 'what,sources');
    equal(ids({ counts: { calc: 2, next: 1 }, asks: 3, gaps: 0, nextExtras: false }), 'what,ask,calc,next,sources');
    assert(ids({ counts: {}, asks: 0, gaps: 2, nextExtras: false }).includes('except'), 'פער מקצועי פותח את שלב «חריגים ושאלות פתוחות» גם בלי סעיף');
    for (const t of TOPICS) {
      const toc = TOCS[t.id as keyof typeof TOCS];
      const counts: Partial<Record<string, number>> = {};
      for (const x of toc) { const k = stageOfSection(x); counts[k] = (counts[k] ?? 0) + 1; }
      const v = visibleStages({ counts, asks: clientAsksFor(t.id).length, gaps: t.gaps.length, nextExtras: true }).map(s => s.id);
      assert(!v.includes('read') || (counts.read ?? 0) > 0, `${t.id}: «מסמכים» בלי תוכן`);
    }
  }),

  test('פער מקצועי מוצג כשאלה פתוחה — לא כ«נקודה לבדיקה» או הערת קריאה', () => {
    assert(!/נקודות? לבדיקה|נקודה אחת/.test(plainStatus('usable', 'primary', 2).label), 'בלי «נקודות לבדיקה»');
    assert(plainStatus('research', 'primary', 2).label.includes('2 שאלות מקצועיות פתוחות'), 'גם בנושא בבירור');
    assert(TOPIC_PAGE.includes('data-kn-gaps-note') && TOPIC_PAGE.includes('אלה לא הערות קריאה'), 'הפערים מוצגים גם בחישוב ובתיק, עם הסבר');
  }),
];

// ─── חיפוש מיידי בכללים — בזמן ההקלדה, בלי רשת ──────────────────────────────────
// ‼ 21.10.2026: גיא חיפש «קרן השתלמות לעוסק זעיר» ולא מצא — החיפוש הישן בדק רק שמות נושאים, ו«עוסק» ≠ «עסק».
//   כאן: כל הכללים (נוסח + איפה), עברית מנורמלת (אותיות שימוש, גרשיים, כתיב מלא/חסר נפוץ), ומילים נרדפות.
// ‼ טהור. התשובה המנוסחת — בשרת (knowledge-answer); זה רק «מה כתוב אצלנו», מיד.

import type { KnowledgeRule } from '../corpus/types';

/** מילה ← צורה אחת. ביטוי של כמה מילים נכתב כצורה מחוברת ונבדק גם כך. */
const SYN: Record<string, string> = {
  עוסק: 'עסק', עוסקת: 'עסק', עסקים: 'עסק', עיסוק: 'עסק', זעירה: 'זעיר', זעירים: 'זעיר',
  קהש: 'השתלמות', השתלמויות: 'השתלמות', קרנות: 'קרן',
  בל: 'ביטוח', בטל: 'ביטוח', ביטוחלאומי: 'ביטוח', מעמ: 'מעמ', מעמים: 'מעמ',
  פנסייה: 'פנסיה', פנסיות: 'פנסיה', גמל: 'גמל', קצבה: 'קצבה', קצבאות: 'קצבה',
  תקרת: 'תקרה', תקרות: 'תקרה', מקדמה: 'מקדמות', מקדמת: 'מקדמות',
  הצהרה: 'הצהרת', הצהרות: 'הצהרת', הון: 'הון', דוחות: 'דוח', דוחה: 'דוח', דיווח: 'דיווח', דיווחים: 'דיווח',
  ניכויים: 'ניכוי', זיכויים: 'זיכוי', נקודה: 'נקודות', שכיר: 'שכיר', שכירה: 'שכיר', שכירים: 'שכיר',
  עצמאית: 'עצמאי', עצמאים: 'עצמאי', ילדים: 'ילד', לידה: 'לידה', מילואים: 'מילואים',
};
const STOP = new Set(['של', 'את', 'על', 'עם', 'יש', 'אם', 'מה', 'האם', 'איך', 'כמה', 'לא', 'גם', 'או', 'זה', 'זו', 'הוא', 'היא', 'כל', 'אני', 'לי', 'אצל', 'מי', 'מתי', 'למה', 'כן', 'אפשר', 'צריך', 'מגיע']);
const PREFIX = /^(?:ו|ה|ב|ל|מ|ש|כ|וה|וב|ול|ומ|וש|שה|שב|של|מה|כש|לכ|בה|לה|מב)(?=[א-ת]{3,})/;

/** מילה מנורמלת: בלי ניקוד וגרשיים; ה«בסיס» — בלי אותיות שימוש בתחילתה, ואחרי מילים נרדפות. */
export function normWord(w: string): string[] {
  const plain = w.replace(/[֑-ׇ]/g, '').replace(/[״׳"'`]/g, '').replace(/[^\p{L}\p{N}()]/gu, '');
  if (!plain) return [];
  const forms = new Set<string>([plain]);
  if (SYN[plain]) forms.add(SYN[plain]);
  const bare = plain.replace(PREFIX, '');
  if (bare !== plain) { forms.add(bare); if (SYN[bare]) forms.add(SYN[bare]); }
  return [...forms];
}

export function queryTerms(q: string): string[][] {
  return q.split(/[\s,.?!:;/\\|–—-]+/).map(w => w.trim()).filter(w => w.length > 1)
    .map(normWord).filter(f => f.length && !STOP.has(f[0]));
}

interface Indexed { rule: KnowledgeRule; words: string[]; head: string[] }
const indexCache = new WeakMap<KnowledgeRule[], Indexed[]>();
function index(rules: KnowledgeRule[]): Indexed[] {
  let ix = indexCache.get(rules);
  if (!ix) {
    const words = (s: string) => [...new Set(s.split(/[\s,.?!:;/\\|–—«»()-]+/).flatMap(normWord))];
    ix = rules.map(rule => ({ rule, words: words(rule.text), head: words(rule.where ?? '') }));
    indexCache.set(rules, ix);
  }
  return ix;
}

const hit = (forms: string[], words: string[]) =>
  words.some(w => forms.some(f => w === f || (f.length >= 3 && w.startsWith(f)) || (w.length >= 4 && f.startsWith(w))));

export interface RuleHit { rule: KnowledgeRule; score: number; coverage: number }

/**
 * הכללים שהכי מתאימים לשאלה. coverage = חלק המילים שנמצאו (1 = כולן).
 * ‼ מילה ב«איפה» (שם הנושא והסעיף) שווה יותר — «קרן השתלמות» בנושא «עסק זעיר» הוא בדיוק מה שמחפשים.
 */
export function searchRules(rules: KnowledgeRule[], q: string, limit = 8): RuleHit[] {
  const terms = queryTerms(q);
  if (!terms.length) return [];
  const out: RuleHit[] = [];
  for (const x of index(rules)) {
    let score = 0, found = 0;
    for (const forms of terms) {
      const inText = hit(forms, x.words), inHead = hit(forms, x.head);
      if (inText || inHead) { found++; score += (inText ? 2 : 0) + (inHead ? 1.5 : 0); }
    }
    if (!found) continue;
    const coverage = found / terms.length;
    // מאומת קודם; ערך לשנה — רק כשהשאלה לא מצאה טענה טובה יותר
    score = score * coverage * coverage + (x.rule.status === 'verified' ? 0.3 : 0) - (x.rule.kind === 'value' ? 0.5 : 0) - x.rule.text.length / 4000;
    out.push({ rule: x.rule, score, coverage });
  }
  return out.sort((a, b) => b.score - a.score).slice(0, limit);
}

// ─────────────────────────────────────────────────────────────────────────────
// מודל ידע — נושא הוצאה במרכז הידע
// המבנה גנרי בכוונה: מודולי ידע עתידיים (ביטוח לאומי, שכר, מקרקעין...)
// ישתמשו באותה תבנית של "נושא ידע" עם ורדיקטים, מקורות ופסיקה.
// ─────────────────────────────────────────────────────────────────────────────

export type IncomeTaxVerdict = 'full' | 'partial' | 'conditional' | 'denied' | 'special';
export type VatVerdict = 'full' | 'twoThirds' | 'quarter' | 'denied' | 'conditional' | 'notApplicable';
export type RiskLevel = 'low' | 'medium' | 'high';

export interface LegalSource {
  name: string;
  ref?: string;
  gist: string;
}

export interface CaseLawEntry {
  name: string;
  year?: number;
  whyItMatters: string;
  practicalImplication: string;
  summary: string;
}

export interface CircularEntry {
  name: string;
  /** מספר רשמי, למשל: חוזר מס הכנסה 2/2012 */
  number?: string;
  summary?: string;
  whatChanged: string;
  whyItMatters?: string;
  whenToApply?: string;
}

export type ConfidenceLevel = 'high' | 'medium' | 'low';

export interface ConfidenceInfo {
  level: ConfidenceLevel;
  /** הסבר — במיוחד כשהחוק/פסיקה/עמדת הרשות מושכים לכיוונים שונים */
  reason: string;
}

export interface WorkedExample {
  scenario: string;
  answer: string;
}

export interface ExpenseTopic {
  id: string;
  title: string;
  icon: string;
  keywords: string[];
  riskLevel: RiskLevel;
  riskNote?: string;
  summary: string;
  incomeTax: {
    verdict: IncomeTaxVerdict;
    shortLabel: string;
    detail: string[];
  };
  vat: {
    verdict: VatVerdict;
    shortLabel: string;
    detail: string[];
    /** הבסיס החוקי לקיזוז/איסור — סעיף/תקנה מדויקים */
    legalBasis?: string;
    /** חריגים נפוצים לכלל */
    exceptions?: string[];
    /** טעויות קיזוז נפוצות בנושא */
    mistakes?: string[];
  };
  /** רמת ודאות מקצועית — medium/low כשנדרש שיקול דעת או שיש עמדות סותרות */
  confidence?: ConfidenceInfo;
  mainSource: string;
  legalSources: LegalSource[];
  caseLaw: CaseLawEntry[];
  circulars: CircularEntry[];
  examples: WorkedExample[];
  clientQuestions: string[];
  clientAnswer: string;
  commonMistakes: string[];
  warnings: string[];
}

// ─── תוויות וצבעים לוורדיקטים ───────────────────────────────────────────────

export const INCOME_TAX_VERDICT_META: Record<IncomeTaxVerdict, { label: string; color: string; bg: string }> = {
  full:        { label: 'מוכר',          color: 'var(--chip-green-tx)', bg: 'var(--chip-green-bg)' },
  partial:     { label: 'מוכר חלקית',    color: 'var(--warn)', bg: 'var(--chip-yellow-bg)' },
  conditional: { label: 'מוכר בתנאים',   color: 'var(--chip-blue-tx)', bg: 'var(--soft)' },
  denied:      { label: 'לא מוכר',       color: 'var(--err)', bg: 'var(--chip-red-bg)' },
  special:     { label: 'מנגנון מיוחד',  color: 'var(--info)', bg: 'var(--chip-violet-bg)' },
};

export const VAT_VERDICT_META: Record<VatVerdict, { label: string; color: string; bg: string }> = {
  full:          { label: 'קיזוז מלא',    color: 'var(--chip-green-tx)', bg: 'var(--chip-green-bg)' },
  twoThirds:     { label: '2/3',          color: 'var(--warn)', bg: 'var(--chip-yellow-bg)' },
  quarter:       { label: '1/4',          color: 'var(--warn)', bg: 'var(--chip-yellow-bg)' },
  conditional:   { label: 'בתנאים',       color: 'var(--chip-blue-tx)', bg: 'var(--soft)' },
  denied:        { label: 'אסור בקיזוז',  color: 'var(--err)', bg: 'var(--chip-red-bg)' },
  notApplicable: { label: 'לא רלוונטי',   color: 'var(--tx2)', bg: 'var(--s2)' },
};

export const RISK_META: Record<RiskLevel, { label: string; color: string; icon: string }> = {
  low:    { label: 'סיכון נמוך',   color: 'var(--chip-green-tx)', icon: '🟢' },
  medium: { label: 'סיכון בינוני', color: 'var(--warn)', icon: '🟡' },
  high:   { label: 'סיכון גבוה',   color: 'var(--err)', icon: '🔴' },
};

export const CONFIDENCE_META: Record<ConfidenceLevel, { label: string; color: string; bg: string }> = {
  high:   { label: 'ודאות גבוהה — דין מיושב',          color: 'var(--chip-green-tx)', bg: 'var(--chip-green-bg)' },
  medium: { label: 'ודאות בינונית — תלוי נסיבות',       color: 'var(--warn)', bg: 'var(--chip-yellow-bg)' },
  low:    { label: 'ודאות נמוכה — נדרש שיקול דעת',      color: 'var(--err)', bg: 'var(--chip-red-bg)' },
};

// ─── חיפוש חכם ───────────────────────────────────────────────────────────────

const normalize = (s: string) =>
  s.replace(/["'׳״]/g, '')
   .replace(/\s+/g, ' ')
   .trim()
   .toLowerCase();

/**
 * חיפוש לפי כותרת + מילות מפתח. "חליפה" → ביגוד, "מסעדה" → ארוחות עסקיות.
 * מחזיר מדורג: התאמת כותרת מלאה > תחילית כותרת > מילת מפתח > הופעה בטקסט.
 */
function scoreAgainst(t: ExpenseTopic, q: string): number {
  const title = normalize(t.title);
  const kws = t.keywords.map(normalize);
  if (title === q) return 100;
  if (title.startsWith(q)) return 80;
  if (kws.some(k => k === q)) return 70;
  if (title.includes(q)) return 60;
  if (kws.some(k => k.startsWith(q) || q.startsWith(k))) return 50;
  if (kws.some(k => k.includes(q) || q.includes(k))) return 40;
  if (normalize(t.summary).includes(q)) return 20;
  return 0;
}

const STOPWORDS = new Set(['של', 'על', 'את', 'עם', 'אני', 'הוא', 'היא', 'לי', 'מה', 'זה', 'או']);

export function searchExpenseTopics(topics: ExpenseTopic[], query: string): ExpenseTopic[] {
  const q = normalize(query);
  if (!q) return topics;
  // מילים בודדות מהשאילתה — כולל הסרת מ"ם/בי"ת שימוש ("מהבית" → "הבית", "בבית" → "בית")
  const words = q.split(' ')
    .filter(w => w.length >= 2 && !STOPWORDS.has(w))
    .flatMap(w => {
      const variants = [w];
      if (w.length >= 4 && /^[מבלכשה]/.test(w)) variants.push(w.slice(1));
      if (w.length >= 5 && /^[מבלכש]ה/.test(w)) variants.push(w.slice(2));
      return variants;
    });
  const scored = topics
    .map(t => {
      let score = scoreAgainst(t, q);
      for (const w of words) {
        score = Math.max(score, scoreAgainst(t, w) * 0.9);
      }
      return { t, score };
    })
    .filter(x => x.score > 0)
    .sort((a, b) => b.score - a.score);
  return scored.map(x => x.t);
}

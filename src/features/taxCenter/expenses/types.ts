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
  full:        { label: 'מוכר',          color: '#15803d', bg: '#ecfdf5' },
  partial:     { label: 'מוכר חלקית',    color: '#b45309', bg: '#fef9c3' },
  conditional: { label: 'מוכר בתנאים',   color: '#1d4ed8', bg: '#eff6ff' },
  denied:      { label: 'לא מוכר',       color: '#b91c1c', bg: '#fef2f2' },
  special:     { label: 'מנגנון מיוחד',  color: '#6d28d9', bg: '#faf5ff' },
};

export const VAT_VERDICT_META: Record<VatVerdict, { label: string; color: string; bg: string }> = {
  full:          { label: 'קיזוז מלא',    color: '#15803d', bg: '#ecfdf5' },
  twoThirds:     { label: '2/3',          color: '#b45309', bg: '#fef9c3' },
  quarter:       { label: '1/4',          color: '#b45309', bg: '#fef9c3' },
  conditional:   { label: 'בתנאים',       color: '#1d4ed8', bg: '#eff6ff' },
  denied:        { label: 'אסור בקיזוז',  color: '#b91c1c', bg: '#fef2f2' },
  notApplicable: { label: 'לא רלוונטי',   color: '#6b7280', bg: '#f9fafb' },
};

export const RISK_META: Record<RiskLevel, { label: string; color: string; icon: string }> = {
  low:    { label: 'סיכון נמוך',   color: '#15803d', icon: '🟢' },
  medium: { label: 'סיכון בינוני', color: '#b45309', icon: '🟡' },
  high:   { label: 'סיכון גבוה',   color: '#b91c1c', icon: '🔴' },
};

export const CONFIDENCE_META: Record<ConfidenceLevel, { label: string; color: string; bg: string }> = {
  high:   { label: 'ודאות גבוהה — דין מיושב',          color: '#15803d', bg: '#ecfdf5' },
  medium: { label: 'ודאות בינונית — תלוי נסיבות',       color: '#b45309', bg: '#fef9c3' },
  low:    { label: 'ודאות נמוכה — נדרש שיקול דעת',      color: '#b91c1c', bg: '#fef2f2' },
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
export function searchExpenseTopics(topics: ExpenseTopic[], query: string): ExpenseTopic[] {
  const q = normalize(query);
  if (!q) return topics;
  const scored = topics
    .map(t => {
      const title = normalize(t.title);
      const kws = t.keywords.map(normalize);
      let score = 0;
      if (title === q) score = 100;
      else if (title.startsWith(q)) score = 80;
      else if (title.includes(q)) score = 60;
      else if (kws.some(k => k === q)) score = 70;
      else if (kws.some(k => k.startsWith(q) || q.startsWith(k))) score = 50;
      else if (kws.some(k => k.includes(q) || q.includes(k))) score = 40;
      else if (normalize(t.summary).includes(q)) score = 20;
      return { t, score };
    })
    .filter(x => x.score > 0)
    .sort((a, b) => b.score - a.score);
  return scored.map(x => x.t);
}

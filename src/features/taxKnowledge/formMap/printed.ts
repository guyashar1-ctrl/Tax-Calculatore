// ─── טופס 6111 במפת הטופס — עמודי הטופס בלבד (26.10.2026) ─────────────────────────────────────
// ‼ ההמחשה שאושרה (docs/proposals/2026-10-24-knowledge-codex, printed-reference): צילום פרסום הרשות לשנת 2025 (עדכון 11.2025)
//   בעותק נגיש, עשרה עמודים. אין שדות ואין סימונים — לא מסמנים בלי מיקום מאומת. הסיווג עצמו — בנושא «טופס 6111 ומילון סיווג».

export interface PrintedPage { n: number; w: number; h: number; img: string }
export interface PrintedForm {
  slug: '6111'; formId: string; taxYear: number; short: string; edition: string;
  /** הטופס בעותק הנגיש (הצילום נעשה ממנו) ודברי ההסבר הרשמיים. */
  pdf: string; clarification: string;
  /** נושא הלימוד שמסביר את הטופס. */
  topic: string;
  pages: PrintedPage[];
}

export const PRINTED_6111: PrintedForm = {
  slug: '6111', formId: '6111', taxYear: 2025, short: '6111 · דוחות כספיים', edition: 'עדכון 11.2025',
  pdf: 'https://claltax.com/wp-content/uploads/2026/04/Service_Pages_Income_tax_annual-report-2026_6111-2025.pdf',
  clarification: 'https://www.gov.il/BlobFolder/service/reporting-and-payment-2025-annual-tax-report-for-individuals/he/Service_Pages_Income_tax_annual-report-2026_6111-2025-clarification.pdf',
  topic: 'form6111',
  pages: Array.from({ length: 10 }, (_, i) => ({ n: i + 1, w: 982, h: 1389, img: `/forms/2025/6111/p${i + 1}.webp` })),
};

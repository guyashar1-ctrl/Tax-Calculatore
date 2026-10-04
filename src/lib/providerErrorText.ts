// ─── תשובת ספק הדואר → משפט בעברית ──────────────────────────────────────────
// ‼ מקום אחד: באנר ההתראות שנכשלו וחלון השליחה ללקוח. תשובת הספק הגולמית
// (JSON באנגלית) לא אומרת לרו"ח כלום.

/** הסיבה במשפט. מה שלא מזוהה — «שירות המייל דחה את השליחה», בלי הקוד. */
export function failureReasonText(error: string): string {
  const e = error.toLowerCase();
  if (/api key|"statuscode":\s*40[13]|unauthori[sz]ed|restricted_api_key/.test(e)) return 'הגדרת שליחת המיילים במערכת לא תקינה';
  if (e.startsWith('resend_unreachable') || /"statuscode":\s*5\d\d|timeout|failed to fetch|network/.test(e)) return 'שירות המייל לא היה זמין';
  if (/[֐-׿]/.test(error)) return error;
  return 'שירות המייל דחה את השליחה';
}

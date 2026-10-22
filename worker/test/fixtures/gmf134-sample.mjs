// gmf134-sample.mjs — תשובת getTikData סינתטית של 134, באותו מבנה שנצפה חי 23.10.2026. ‼ נתוני דמה.

/** `missing` — { 202607: 'לא דווח' } ⇒ התקופה שמתחילה ב-202607 לא דווחה (והמונה עולה). */
export function tik134({ missing = {} } = {}) {
  const row = (from, to, status, code) => ({ misMikForSchum: 'x', tkufaMe: from, tkufa: to, kodMazavDvc: code, mazavDvc: status });
  const periods = [[202601, 202602], [202603, 202604], [202605, 202606], [202607, 202608]].map(([f, t]) =>
    (missing[f] ? row(f, t, missing[f], 2) : row(f, t, 'דווח', 1)));
  return {
    sugMikStr: 'דו-חדשי', shrMik: 15,
    moneDvcChaser: Object.keys(missing).length,
    lstTkufot: [
      ...periods,
      row(202609, 202610, 'טרם הגיע המועד', 15),
      row(202611, 202612, 'טרם הגיע המועד', 15),
      { misMikForSchum: null, tkufaMe: 998, tkufa: 998, mazavDvc: '' },
    ],
  };
}

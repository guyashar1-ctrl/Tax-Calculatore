// ─── דוגמאות סינתטיות של הדפסת מסוף שע״ם — לבדיקות ולהדגמה (16.10.2026) ─────────────────────────────
// ‼ דוגמה בלבד: שמות ומספרי תיק מומצאים. הפריסה (עמודות, כותרות, סימון «ח», מועדים, «ש״מ לא קיימת») נבנתה לפי
//   צילום 19 (IDOM ראשי 4, מיון לפי תיק) ולפי ה-PDF האמיתי של AHZM (לא הגישו ללא קנס) — בלי נתוני לקוח אמיתיים.
//   ‼ פענוח PDF מהמסלול השנתי החדש **לא נבדק על קובץ אמיתי** — אין עדיין PDF כזה (ראו הבריף).
// ‼ כל שורה = תאים [עמודה, טקסט לוגי]; הממיר מייצר קטעי טקסט כפי ש-pdfjs מחזיר מהדפסת «Print To PDF» (6pt לתו, 12pt לשורה).

import type { PdfTextItem } from '../parse/grid';
import type { WealthGroup } from '../parse/parseShaam';

export type Cell = [col: number, text: string];
const HEB = /[֐-׿]/;

export function itemsFromLines(lines: Cell[][], pitch = 6, lineH = 12, top = 820): PdfTextItem[] {
  const out: PdfTextItem[] = [];
  lines.forEach((cells, row) => {
    for (const [col, text] of cells) {
      if (!text) continue;
      out.push({ x: col * pitch, y: top - row * lineH, width: text.length * pitch, str: text, dir: HEB.test(text) ? 'rtl' : 'ltr' });
    }
  });
  return out;
}

const dashes = (runs: [number, number][], sep = ' ') => {
  let s = '';
  for (const [a, b] of runs) { s = s.padEnd(a, sep === ' ' ? ' ' : sep); s += '-'.repeat(b - a + 1); }
  return s;
};

// ── IDOM · «פירוט המיוצגים לשנת מס» — המסלול הנכון (עם «חייב בהגשה») ───────────────────────────────
const IDOM_RUNS: [number, number][] = [[1, 5], [7, 16], [18, 27], [29, 32], [34, 36], [38, 39], [41, 43], [45, 66], [68, 76]];
export interface AnnualRow { file: string; name: string; required?: boolean; due?: string; filed?: string; section?: string; ft?: string; branch?: string; office?: string; noAssessment?: boolean }

export function idomPage(o: { year: number; produced?: string; page?: number; rows: AnnualRow[] }): Cell[][] {
  const head: Cell[][] = [
    [[0, o.produced ?? '15/10/2026'], [11, 'MZQE'], [33, 'ע\'י: משרד דוגמה'], [61, 'IDOM'], [66, 'שע\'מ/מ\'ה-שומה/']],
    [[0, String(o.page ?? 1)], [4, 'דף:'], [22, String(o.year)], [28, 'פירוט המיוצגים לשנת מס'], [62, '000000000'], [72, 'מייצג:']],
    [[18, '====================================']],
    [[2, 'חייב'], [7, 'מועד חוקי/'], [20, 'תאריך'], [29, 'סעיף']],
    [[1, 'בהגשה'], [7, 'תאריך ארכה'], [21, 'הגשה'], [29, 'שומה'], [34, 'ס.ת'], [38, 'ח'], [41, 'פ.ש'], [47, 'שם משפחה ופרטי'], [68, 'מספר תיק']],
    [[0, dashes(IDOM_RUNS)]],
  ];
  const body: Cell[][] = o.rows.map(r => r.noAssessment
    ? [[18, 'ש"מ לא קיימת'], [45, r.name], [68, r.file], [78, '_']]
    : [[4, r.required ? 'ח' : ''], [7, r.due ?? ''], [18, r.filed ?? ''], [30, r.section ?? ''], [34, r.ft ?? ''], [38, r.branch ?? ''], [41, r.office ?? ''], [45, r.name], [68, r.file], [78, '_']]);
  while (body.length < 14) body.push([[78, '_']]);
  return [...head, ...body,
    [[0, '-'.repeat(79)]],
    [[2, 'יציאה - CLEAR'], [24, 'נתונים נוספים - PF1'], [48, 'תפריט - PF3'], [64, 'הפעלה - ENTER']],
    [[5, 'הדרכה - PF10'], [24, 'ISUF - PF5 + X סמן'], [48, 'קדימה - PF8'], [64, 'אחורה - PF7']]];
}

/** צילום 19 — אותה תבנית, שמות ומספרים מומצאים. 3 פתוחות (31.10, 30.11, 30.11), 2 הוגשו, הקשר בלי «ח», ש״מ לא קיימת. */
export const ANNUAL_SAMPLE_ROWS: AnnualRow[] = [
  { file: '000000018', name: 'דוגמה ראשון א', required: true, due: '31/10/2026', ft: '30', branch: '10', office: '39' },
  { file: '000000026', name: 'דוגמה זוג ו/או ב', required: true, due: '30/09/2026', filed: '07/06/2026', section: '00', ft: '52', branch: '01', office: '45' },
  { file: '000000034', name: 'דוגמה שלישי', required: true, due: '30/11/2026', ft: '42', branch: '03', office: '24' },
  { file: '000000042', name: 'דוגמה רביעי ו/או ג', noAssessment: true },
  { file: '000000059', name: 'דוגמה חמישי', required: true, due: '30/09/2026', filed: '13/05/2026', section: '00', ft: '42', branch: '04', office: '52' },
  { file: '000000067', name: 'דוגמה שישי', due: '30/04/2026', section: '14', ft: '91', branch: '18', office: '26' },
  { file: '000000075', name: 'דוגמה שביעי', required: true, due: '30/11/2026', ft: '42', branch: '02', office: '24' },
  { file: '000000083', name: 'דוגמה שמיני', due: '30/04/2026', section: '14', ft: '91', branch: '17', office: '21' },
  { file: '000000091', name: 'דוגמה תשיעי', due: '30/04/2026', section: '14', ft: '91', branch: '17', office: '39' },
  { file: '000000109', name: 'דוגמה עשירי', due: '30/04/2026', section: '14', ft: '91', branch: '17', office: '39' },
];

// ── IDOM · המסלול הישן (1/5) — בלי «חייב בהגשה» ─────────────────────────────────────────────────────
export function idomLegacyPage(): Cell[][] {
  const runs: [number, number][] = [[0, 3], [5, 12], [14, 17], [19, 26], [28, 31], [33, 35], [37, 38], [40, 42], [44, 65], [67, 75]];
  return [
    [[0, '15/10/2026'], [11, 'MZF@'], [33, 'ע\'י: משרד דוגמה'], [59, 'IDOM'], [64, 'שע\'ם/מ\'ה-שומה/']],
    [[0, '1'], [4, 'דף:'], [22, '2025'], [28, 'פירוט המיוצגים לשנת מס'], [62, '000000000'], [72, 'מייצג:']],
    [[18, '====================================']],
    [[0, 'מעקב'], [6, 'ארכה/'], [20, 'טיפול'], [28, 'סעיף']],
    [[0, 'הגשה'], [7, 'הגשה'], [14, 'גרסה'], [20, 'אחרון'], [28, 'ס.ת שומה'], [38, 'ח'], [40, 'פ.ש'], [48, 'שם משפחה ופרטי'], [67, 'מספר תיק']],
    [[0, dashes(runs)]],
    [[0, '00 31/10/2026'], [33, '30'], [37, '10'], [41, '39'], [50, 'דוגמה ראשון'], [67, '000000018'], [77, '_']],
    [[0, '00 30/04/2026'], [29, '14'], [33, '91'], [37, '18'], [41, '26'], [50, 'דוגמה שישי'], [67, '000000067'], [77, '_']],
    [[0, '-'.repeat(79)]],
    [[2, 'יציאה - CLEAR'], [64, 'הפעלה - ENTER']],
  ];
}

// ── AHZM · רשימת דרישות להצהרת הון — לפי ה-PDF האמיתי (לא הגישו ללא קנס), שמות ומספרים מומצאים ─────────────
const TITLE: Record<WealthGroup, string> = {
  unfiled_no_fine: 'מיוצגים שלא הגישו את ההצהרה ולא חייבים בקנס (מיון / בחירה לפי מספר תיק )',
  unfiled_fine: 'מיוצגים שלא הגישו את ההצהרה וחייבים בקנס (מיון / בחירה לפי מספר תיק )',
  filed_fine: 'מיוצגים שהגישו את ההצהרה וחייבים בקנס (מיון / בחירה לפי מספר תיק )',
  filed_no_fine: 'מיוצגים שהגישו את ההצהרה ולא חייבים בקנס (מיון / בחירה לפי מספר תיק )',
};
export interface WealthRow { file: string; name: string; year: string; due?: string; ft?: string; office?: string }

export function ahzmPage(o: { group: WealthGroup; page?: number; total?: number; produced?: string; rows: WealthRow[]; empty?: boolean }): Cell[][] {
  const bar = (cells: Cell[]): Cell[] => [[7, '|'], [14, '|'], [27, '|'], [32, '|'], [37, '|'], [61, '|'], [75, '|'], ...cells];
  const head: Cell[][] = [
    [[11, 'ע\'י: משרד דוגמה'], [55, 'שע\'מ / AHZM / הצהרת הון']],
    [[0, o.produced ?? '16/10/26'], [10, '01:05:49']],
    [[3, TITLE[o.group]]],
    [[3, '-'.repeat(73)]],
    [[0, String(o.total ?? 1)], [4, 'מתוך'], [9, String(o.page ?? 1)], [12, 'דף:']],
    [[24, '000000000'], [34, 'מספר מייצג:'], [55, 'משרד דוגמה'], [67, 'שם מייצג:']],
    [], [],
  ];
  if (o.empty) return [...head, [[20, 'אין תיקים שבקשת']], [[0, '-'.repeat(79)]]];
  const table: Cell[][] = [
    bar([[10, 'שנה'], [16, 'מועד  חוקי'], [28, 'סוג'], [33, 'פקיד'], [48, 'שם'], [66, 'מספר']]),
    bar([[17, 'להגשה עד'], [28, 'תיק'], [33, 'שומה'], [67, 'תיק']]),
    [[7, '|------+------------+----+----|-----------------------+-------------|']],
    ...o.rows.map(r => bar([[9, r.year], [16, r.due ?? ''], [29, r.ft ?? '52'], [34, r.office ?? '45'], [42, r.name], [65, r.file], [77, '1']])),
  ];
  while (table.length < 14) table.push(bar([]));
  return [...head, ...table, [[0, '-'.repeat(79)]], [[0, 'הדרכה -PF10'], [14, 'כניסה - PF3'], [54, 'PF7 - אחורה'], [68, 'PF8 - קדימה']]];
}

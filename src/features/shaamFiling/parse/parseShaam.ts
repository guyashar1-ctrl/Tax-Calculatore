// ─── פענוח עמוד מרשימות שע״ם: מעקב הגשת דוחות (IDOM) ודרישות הצהרות הון (AHZM) — 16.10.2026 ──────
// ‼ חוזה הפענוח (docs/CLAUDE-SHAAM-FILING-IMPORT-BRIEF-2026-10-16.md):
//   · העמודות נקבעות מקו המקפים שמתחת לכותרות ומהכותרות עצמן — לא מסדר הטקסט ולא מ-regexp רציף.
//   · דוח שנתי: «ח» בעמודת «חייב בהגשה» + תאריך הגשה ריק = דרישה פתוחה לפי שע״ם; המועד = «מועד חוקי/תאריך ארכה»
//     באותה שורה. תאריך הגשה קיים = הגשה רשומה. ‼ אין להסיק חובה ממועד בלבד, מסוג תיק 91, מסעיף שומה 14 או מקוד 00.
//   · קובץ שנתי בלי עמודת «חייב בהגשה» (המסלול הישן) — «חסר סימון חבות»; אף שורה לא הופכת לחובה.
//   · «ש״מ לא קיימת» = נתון לא זמין, לא הוכחת פטור.
//   · הצהרות הון: ארבע קבוצות, אחת בכל הפקה; «אין תיקים שבקשת» = הקבוצה נבדקה וריקה (רק היא).
//   · שנת הצהרת הון נשמרת כפי שמופיעה — לא הופכים אותה ל-31 בדצמבר.
//   · מועד חסר = לא ידוע; תאריך לא תקין נשמר כפי שנקרא ומסומן לבדיקה.
// ‼ טהור. תוכן הקובץ הוא נתון לא מהימן.

import { hasHebrew, toLogical, type Grid } from './grid';

export type ListKind = 'annual' | 'wealth';
/** ארבע הקבוצות של AHZM. */
export type WealthGroup = 'unfiled_no_fine' | 'unfiled_fine' | 'filed_fine' | 'filed_no_fine';
export const WEALTH_GROUP_LABEL: Record<WealthGroup, string> = {
  unfiled_no_fine: 'לא הגישו ולא חייבים בקנס',
  unfiled_fine: 'לא הגישו וחייבים בקנס',
  filed_fine: 'הגישו וחייבים בקנס',
  filed_no_fine: 'הגישו ולא חייבים בקנס',
};

export type PageStatus =
  | 'ok'               // נקרא, יש שורות
  | 'empty_confirmed'  // הודעת «אין תיקים שבקשת» — הקבוצה נבדקה וריקה
  | 'legacy_annual'    // רשימה שנתית בלי עמודת «חייב בהגשה»
  | 'unsupported'      // מסך שע״ם אחר (ריכוז PF2, תפריט…) — לא רשימה לקליטה
  | 'unrelated'        // לא מסך שע״ם מוכר
  | 'unreadable'       // אין שכבת טקסט / רשת לא קבועה / כותרות חסרות
  ;

export interface ParsedRow {
  /** מספר השורה בטבלה בעמוד (1 = השורה הראשונה מתחת לכותרות). */
  line: number;
  fileNumber: string;
  /** השם כפי שנקלט. */
  name: string;
  office?: string;
  fileType?: string;
  section?: string;
  /** עמודה «ח» שבין פ.ש לס.ת ברשימה השנתית — נשמרת כמות שהיא (משמעות לא מאומתת). */
  branch?: string;
  /** השנה כפי שמופיעה (בהון — עמודת «שנה»; בשנתי — שנת המס שבכותרת). */
  yearShown: string;
  /** סימון חבות מפורש: true = «ח»; false = עמודה קיימת וריקה; undefined = אין עמודה. */
  required?: boolean;
  legalDue?: string;
  legalDueRaw?: string;
  filedOn?: string;
  filedOnRaw?: string;
  /** «ש״מ לא קיימת» — נתון לא זמין. */
  noAssessment?: boolean;
  problems: string[];
}

export interface ParsedPage {
  status: PageStatus;
  kind?: ListKind;
  group?: WealthGroup;
  taxYear?: number;
  /** זמן ההפקה כפי שמופיע במסך. */
  producedRaw?: string;
  /** תאריך ההפקה (ISO) — להשוואה בין קבצים. */
  producedOn?: string;
  producedAt?: string;
  page?: number;
  pageTotal?: number;
  rows: ParsedRow[];
  problems: string[];
  /** עמודות שזוהו — לבקרה ולבדיקות. */
  columns?: string[];
}

const DASH_LINE = /^[\s\-+|=]+$/;

/** תאריך dd/mm/yyyy או dd.mm.yyyy (או yy) → ISO; לא תקין → undefined. */
export function parseShaamDate(raw: string): string | undefined {
  const m = raw.trim().match(/^(\d{1,2})[./](\d{1,2})[./](\d{2}|\d{4})$/);
  if (!m) return undefined;
  const d = Number(m[1]), mo = Number(m[2]);
  let y = Number(m[3]);
  if (m[3].length === 2) y += 2000;
  if (mo < 1 || mo > 12 || d < 1 || d > 31 || y < 1990 || y > 2100) return undefined;
  const dt = new Date(Date.UTC(y, mo - 1, d));
  if (dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d) return undefined;
  return `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

type Col = 'fileNumber' | 'name' | 'office' | 'fileType' | 'section' | 'branch' | 'required' | 'legalDue' | 'filedOn' | 'year' | 'unknown';

/** סיווג עמודה לפי הכותרת שלה (לוגית, כל שורות הכותרת יחד). ‼ הסדר חשוב: «פקיד שומה» לפני «סעיף שומה». */
export function classifyHeader(h: string): Col {
  const t = h.replace(/\s+/g, ' ').trim();
  if (/חייב|בהגשה/.test(t)) return 'required';
  if (/מספר/.test(t) && /תיק/.test(t)) return 'fileNumber';
  if (/מועד|ארכה/.test(t)) return 'legalDue';
  if (/תאריך/.test(t) && /הגשה/.test(t)) return 'filedOn';
  if (/פקיד|פ\.ש/.test(t)) return 'office';
  if (/סעיף/.test(t)) return 'section';
  if (/סוג|ס\.ת/.test(t)) return 'fileType';
  if (/שם/.test(t)) return 'name';
  if (/^שנה$/.test(t)) return 'year';
  if (/^ח$/.test(t)) return 'branch';
  return 'unknown';
}

/** רצפי מקפים בשורת ההפרדה → טווחי עמודות [התחלה, סוף]. */
function dashRuns(line: string): [number, number][] {
  const out: [number, number][] = [];
  let start = -1;
  for (let i = 0; i <= line.length; i++) {
    const ch = line[i];
    if (ch === '-' || ch === '=') { if (start < 0) start = i; }
    else if (start >= 0) { out.push([start, i - 1]); start = -1; }
  }
  return out;
}

const cut = (line: string, [a, b]: [number, number]) => (line.slice(a, b + 1) ?? '').replace(/\|/g, ' ').trim();
const inText = (ch?: string) => !!ch && ch !== ' ' && ch !== '|';
/**
 * ‼ ב-PDF אמיתי (31.10.2026) «תאריך הגשה» של 10 תווים מודפס מתחת ל-9 מקפים — התו האחרון יושב ברווח שבין העמודות.
 * תא בשורת נתונים מתרחב לתוך הרווח שלידו כשיש בו תו — עד העמודה השכנה, לא לתוכה.
 */
function widen(line: string, runs: [number, number][], i: number): [number, number] {
  let [a, b] = runs[i];
  const lo = i > 0 ? runs[i - 1][1] + 1 : 0, hi = i + 1 < runs.length ? runs[i + 1][0] - 1 : line.length - 1;
  // רק כשהטקסט של התא נוגע בקצה העמודה — כדי שהתו ברווח לא «יידבק» גם לעמודה השכנה
  while (a - 1 >= lo && inText(line[a]) && inText(line[a - 1])) a--;
  while (b + 1 <= hi && inText(line[b]) && inText(line[b + 1])) b++;
  return [a, b];
}

/** מסך מסוף מתחיל בשורת הכותרת «שע״מ / AHZM / …» (או IDOM); מסך שלם תופס יותר משמונה שורות. */
const SCREEN_TITLE = /\b(?:AHZM|IDOM)\b/;
const MIN_SCREEN_LINES = 8;

/**
 * ‼ 31.10.2026 (נצפה בהקלטה של גיא + קובץ אמיתי): Copy על המסך הראשון, Copy Append על הבאים ו-Print Clipboard
 * מדפיסים כמה מסכים זה מתחת לזה **באותו עמוד PDF**. כל מסך נקרא לבד, מהכותרת שלו ועד הכותרת הבאה.
 * עמוד עם מסך אחד — כמו שהוא (כולל מה שמעל הכותרת).
 */
export function splitScreens(grid: Grid): Grid[] {
  const starts: number[] = [];
  grid.lines.forEach((l, i) => {
    if (SCREEN_TITLE.test(toLogical(l)) && (!starts.length || i - starts[starts.length - 1] >= MIN_SCREEN_LINES)) starts.push(i);
  });
  if (starts.length < 2) return [grid];
  return starts.map((s, k) => ({ ...grid, lines: grid.lines.slice(s, starts[k + 1] ?? grid.lines.length) }));
}

/** עמוד PDF → מסך אחד או כמה. */
export const parseScreens = (grid: Grid): ParsedPage[] => splitScreens(grid).map(parseGrid);

export function parseGrid(grid: Grid): ParsedPage {
  const problems: string[] = [];
  const lines = grid.lines;
  if (!lines.some(l => l.trim())) return { status: 'unreadable', rows: [], problems: ['אין שכבת טקסט בעמוד (אולי צילום או סריקה)'] };
  if (grid.irregular) return { status: 'unreadable', rows: [], problems: ['הקובץ אינו הדפסת מסוף רגילה — העמודות לא ניתנות לזיהוי בביטחון'] };
  const logical = lines.map(toLogical);
  const all = logical.join('\n');
  const kind: ListKind | undefined = /\bIDOM\b/.test(all) ? 'annual' : /\bAHZM\b/.test(all) ? 'wealth' : undefined;
  if (!kind) return { status: 'unrelated', rows: [], problems: ['לא נמצאה כותרת של רשימת שע״ם מוכרת (IDOM / AHZM)'] };

  // זמן הפקה כפי שמופיע
  let producedRaw: string | undefined, producedOn: string | undefined, producedAt: string | undefined;
  const head = logical.slice(0, 4).join(' ');
  const dt = head.match(/(\d{2}\/\d{2}\/\d{2,4})(?:\s+(\d{2}:\d{2}(?::\d{2})?))?/);
  if (dt) {
    producedRaw = dt[2] ? `${dt[1]} ${dt[2]}` : dt[1];
    producedOn = parseShaamDate(dt[1]);
    if (producedOn && dt[2]) producedAt = `${producedOn}T${dt[2].length === 5 ? dt[2] + ':00' : dt[2]}`;
  }
  if (!producedOn) problems.push('לא נמצא תאריך הפקה בכותרת');

  // עמוד
  let page: number | undefined, pageTotal: number | undefined;
  for (const l of logical.slice(0, 8)) {
    const m = l.match(/דף\s*:\s*(\d+)(?:\s+מתוך\s+(\d+))?/);
    if (m) { page = Number(m[1]); if (m[2]) pageTotal = Number(m[2]); break; }
  }

  let group: WealthGroup | undefined, taxYear: number | undefined;
  if (kind === 'wealth') {
    const title = logical.slice(0, 6).join(' ');
    const unfiled = /שלא\s+הגישו/.test(title), filed = !unfiled && /שהגישו/.test(title);
    const noFine = /ולא\s+חייבים\s+בקנס/.test(title), fine = !noFine && /וחייבים\s+בקנס/.test(title);
    if ((unfiled || filed) && (noFine || fine)) group = `${unfiled ? 'unfiled' : 'filed'}_${noFine ? 'no_fine' : 'fine'}` as WealthGroup;
    if (/אין\s+תיקים\s+שבקשת/.test(all)) {
      return { status: group ? 'empty_confirmed' : 'unsupported', kind, group, producedRaw, producedOn, producedAt, page, pageTotal, rows: [],
        problems: group ? [] : ['הודעת «אין תיקים» בלי שם הקבוצה — לא ניתן לדעת איזו קבוצה נבדקה'] };
    }
    if (!group) return { status: 'unsupported', kind, producedRaw, producedOn, rows: [], problems: ['מסך הצהרות הון שאינו אחת מארבע רשימות הדרישות (למשל ריכוז PF2 או תפריט)'] };
  } else {
    const ty = all.match(/לשנת\s+מס\s+(\d{4})/);
    if (ty) taxYear = Number(ty[1]);
    else return { status: 'unsupported', kind, producedRaw, producedOn, rows: [], problems: ['מסך IDOM שאינו «פירוט המיוצגים לשנת מס»'] };
  }

  // שורת ההפרדה שמתחת לכותרות: לפחות שלוש עמודות
  const sepIdx = lines.findIndex(l => l.trim().length > 20 && DASH_LINE.test(l) && dashRuns(l).length >= 3);
  if (sepIdx < 1) return { status: 'unreadable', kind, group, taxYear, producedRaw, producedOn, producedAt, page, pageTotal, rows: [], problems: ['לא נמצאו כותרות העמודות'] };
  const runs = dashRuns(lines[sepIdx]);
  // שורות הכותרת: עד שלוש שורות שמעל ההפרדה, עד שורה ריקה או שורת מקפים
  const headerLines: string[] = [];
  for (let k = sepIdx - 1; k >= 0 && headerLines.length < 3; k--) {
    if (!lines[k].trim() || DASH_LINE.test(lines[k])) break;
    headerLines.unshift(lines[k]);
  }
  const cols = runs.map(r => classifyHeader(headerLines.map(h => toLogical(cut(h, r))).join(' ')));
  const at = (c: Col) => cols.indexOf(c);
  const iFile = at('fileNumber'), iName = at('name');
  if (iFile < 0 || iName < 0) return { status: 'unreadable', kind, group, taxYear, producedRaw, producedOn, producedAt, page, pageTotal, rows: [], problems: ['חסרות עמודות «מספר תיק» או «שם»'], columns: cols };
  const legacy = kind === 'annual' && at('required') < 0;

  const rows: ParsedRow[] = [];
  let line = 0;
  for (let k = sepIdx + 1; k < lines.length; k++) {
    const raw = lines[k];
    if (!raw.trim()) continue;
    if (DASH_LINE.test(raw)) {
      if (raw.replace(/[\s|]/g, '').length > 0) break; // קו התחתית — סוף הטבלה
      line++; continue;                                // שורת טבלה ריקה (רק קווים)
    }
    const lg = toLogical(raw);
    if (/PF\d|ENTER|CLEAR/.test(lg)) break;
    line++;
    const cell = (c: Col) => { const i = at(c); if (i < 0) return undefined; const v = cut(raw, widen(raw, runs, i)); return hasHebrew(v) ? toLogical(v) : v; };
    const fileRaw = (cell('fileNumber') ?? '').replace(/\s/g, '');
    const name = (cell('name') ?? '').replace(/\s+/g, ' ').trim();
    const rp: string[] = [];
    if (!/^\d{5,9}$/.test(fileRaw)) {
      if (!fileRaw && !name) continue;
      rp.push(fileRaw ? `מספר תיק לא תקין: ${fileRaw}` : 'שורה בלי מספר תיק');
    }
    const noAssessment = /לא\s+קי?ימת/.test(lg);   // ‼ שע״ם כותב «שמ לא קימת» (נצפה ב-PDF אמיתי, 31.10.2026)
    const r: ParsedRow = {
      line, fileNumber: fileRaw, name, problems: rp,
      office: cell('office') || undefined, fileType: cell('fileType') || undefined, section: noAssessment ? undefined : cell('section') || undefined,
      branch: cell('branch') || undefined,
      yearShown: kind === 'wealth' ? (cell('year') ?? '') : String(taxYear),
    };
    if (noAssessment) r.noAssessment = true;
    if (kind === 'wealth' && !/^\d{4}$/.test(r.yearShown)) rp.push(r.yearShown ? `שנה לא תקינה: ${r.yearShown}` : 'חסרה שנה');
    if (!legacy && at('required') >= 0) {
      const v = cell('required') ?? '';
      if (v === 'ח') r.required = true;
      else if (!v) r.required = false;
      else rp.push(`סימון חבות לא מוכר: ${v}`);
    }
    if (!noAssessment) {
      const due = cell('legalDue');
      if (due) { r.legalDueRaw = due; r.legalDue = parseShaamDate(due); if (!r.legalDue) rp.push(`מועד לא תקין: ${due}`); }
      const filed = cell('filedOn');
      if (filed) { r.filedOnRaw = filed; r.filedOn = parseShaamDate(filed); if (!r.filedOn) rp.push(`תאריך הגשה לא תקין: ${filed}`); }
    }
    rows.push(r);
  }

  if (legacy) {
    // ‼ השורות לא חוזרות בכלל — כדי שאף מסך לא יציג אותן כחייבים
    return { status: 'legacy_annual', kind, taxYear, producedRaw, producedOn, producedAt, page, pageTotal, rows: [], columns: cols,
      problems: [`חסרה עמודת «חייב בהגשה» — זו הפקה מהמסלול הישן (${rows.length} שורות לא נקלטו). אין לקבוע ממנה מי חייב. הפיקו מחדש: IDOM ← אפשרות 4 («מעקב הגשת דוחות — כללי») ← סוג רשימה 1.`] };
  }
  if (!rows.length) problems.push('לא נמצאו שורות בטבלה');
  return { status: rows.length ? 'ok' : 'unreadable', kind, group, taxYear, producedRaw, producedOn, producedAt, page, pageTotal, rows, problems, columns: cols };
}

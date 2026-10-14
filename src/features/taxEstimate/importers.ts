// ─── הערכת מס: קליטת נתונים מקבצים ומהדבקה (שלב 3) ──────────────────────────
// ‼ טהור (חוץ מ-readXlsx, שמשתמש ב-DecompressionStream של הדפדפן/Node). שום דבר לא נכנס להערכה
//   בלי תצוגה ואישור של המשרד; מה שלא נקרא בוודאות מוצג כאזהרה, לא כ-0.
// מבנים מוכרים (נבדקו מול דוגמה ומול מסגרות הקלטה, לא מול ייצוא Excel אמיתי):
//   · רו״ה פייפרלס: «קוד מיון» | 01/26 … 12/26 | «סכום»; שורות «סך הכנסות», «סך הוצאות», «סך רווח והפסד».
//   · 134 (שע״ם): «תקופה», «מצב דיווח», «מחזור», «חיוב», «תשלומים», «ניכוי במקור», «תאריך עדכון».
//   · ESNA (מע״מ): «תקופה», «עסקאות חייבות», «עסקאות פטורות», «עסקאות אקראי», …; שורת «סה"כ».

import type { AuthorityPeriod } from './types';

/** מספר מטקסט: פסיקים, ₪, מינוס בהתחלה או בסוף, סוגריים. ריק / לא מספר ⇒ undefined (לא 0). */
export function parseAmount(raw: string | undefined): number | undefined {
  if (raw == null) return undefined;
  let s = String(raw).replace(/[‎‏‪-‮]/g, '').replace(/[₪\s]/g, '').replace(/,/g, '');
  if (!s || s === '-' || s === '—') return undefined;
  let neg = false;
  if (/^\(.*\)$/.test(s)) { neg = true; s = s.slice(1, -1); }
  if (s.endsWith('-')) { neg = !neg; s = s.slice(0, -1); }
  if (s.startsWith('-')) { neg = !neg; s = s.slice(1); }
  if (!/^\d+(\.\d+)?$/.test(s)) return undefined;
  const n = Number(s);
  return neg ? -n : n;
}

/** טבלה מטקסט: CSV (עם מרכאות), טאבים, או רווחים כפולים (הדבקה ממסך). */
export function parseTable(text: string): string[][] {
  const lines = text.replace(/\r\n?/g, '\n').split('\n').filter(l => l.trim());
  const tabbed = lines.some(l => l.includes('\t'));
  const csv = !tabbed && lines.filter(l => l.includes(',')).length >= Math.max(2, lines.length / 2) && lines.some(l => /,("|[^\d\s])/.test(l) || /^[^,]*[א-תA-Za-z][^,]*,/.test(l));
  return lines.map(l => {
    if (tabbed) return l.split('\t').map(c => c.trim());
    if (csv) {
      const out: string[] = []; let cur = '', q = false;
      for (let i = 0; i < l.length; i++) {
        const ch = l[i];
        if (q) { if (ch === '"' && l[i + 1] === '"') { cur += '"'; i++; } else if (ch === '"') q = false; else cur += ch; }
        else if (ch === '"') q = true; else if (ch === ',') { out.push(cur.trim()); cur = ''; } else cur += ch;
      }
      out.push(cur.trim());
      return out;
    }
    return l.split(/\s{2,}/).map(c => c.trim());
  });
}

// ── XLSX מינימלי: zip (stored/deflate) → sharedStrings + הגיליון הראשון ──
async function inflateRaw(data: Uint8Array): Promise<Uint8Array> {
  const ds = new DecompressionStream('deflate-raw');
  const stream = new Blob([data as BlobPart]).stream().pipeThrough(ds);
  return new Uint8Array(await new Response(stream).arrayBuffer());
}
async function unzip(buf: ArrayBuffer): Promise<Map<string, Uint8Array>> {
  const b = new Uint8Array(buf), dv = new DataView(buf), out = new Map<string, Uint8Array>();
  // מרכז הספרייה: חיפוש EOCD מהסוף
  let eocd = -1;
  for (let i = b.length - 22; i >= Math.max(0, b.length - 65_557); i--) if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
  if (eocd < 0) throw new Error('לא קובץ Excel תקין (zip)');
  const n = dv.getUint16(eocd + 10, true);
  let p = dv.getUint32(eocd + 16, true);
  const dec = new TextDecoder();
  for (let k = 0; k < n; k++) {
    const method = dv.getUint16(p + 10, true), csize = dv.getUint32(p + 20, true);
    const nlen = dv.getUint16(p + 28, true), elen = dv.getUint16(p + 30, true), clen = dv.getUint16(p + 32, true);
    const local = dv.getUint32(p + 42, true);
    const name = dec.decode(b.subarray(p + 46, p + 46 + nlen));
    const lnlen = dv.getUint16(local + 26, true), lelen = dv.getUint16(local + 28, true);
    const start = local + 30 + lnlen + lelen;
    const raw = b.subarray(start, start + csize);
    out.set(name, method === 0 ? raw : method === 8 ? await inflateRaw(raw) : new Uint8Array());
    p += 46 + nlen + elen + clen;
  }
  return out;
}
const xmlText = (s: string) => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');
const colIndex = (ref: string) => { const m = /^([A-Z]+)/.exec(ref)?.[1] ?? 'A'; let n = 0; for (const ch of m) n = n * 26 + (ch.charCodeAt(0) - 64); return n - 1; };

/** הגיליון הראשון של קובץ xlsx כטבלת מחרוזות. */
export async function readXlsx(buf: ArrayBuffer): Promise<string[][]> {
  const files = await unzip(buf);
  const dec = new TextDecoder();
  const ss = files.get('xl/sharedStrings.xml');
  const shared = ss ? [...dec.decode(ss).matchAll(/<si>([\s\S]*?)<\/si>/g)].map(m => xmlText([...m[1].matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map(t => t[1]).join(''))) : [];
  const sheetName = [...files.keys()].filter(k => /^xl\/worksheets\/sheet\d+\.xml$/.test(k)).sort()[0];
  if (!sheetName) throw new Error('אין גיליון בקובץ');
  const xml = dec.decode(files.get(sheetName)!);
  const rows: string[][] = [];
  for (const r of xml.matchAll(/<row[^>]*>([\s\S]*?)<\/row>/g)) {
    const row: string[] = [];
    for (const c of r[1].matchAll(/<c ([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const attrs = c[1], inner = c[2] ?? '';
      const ref = /r="([A-Z]+\d+)"/.exec(attrs)?.[1] ?? '';
      const t = /t="(\w+)"/.exec(attrs)?.[1];
      const v = /<v>([\s\S]*?)<\/v>/.exec(inner)?.[1];
      const is = /<is>[\s\S]*?<t[^>]*>([\s\S]*?)<\/t>/.exec(inner)?.[1];
      const val = t === 's' && v != null ? shared[Number(v)] ?? '' : t === 'inlineStr' ? xmlText(is ?? '') : v != null ? xmlText(v) : '';
      row[ref ? colIndex(ref) : row.length] = val;
    }
    rows.push(Array.from(row, x => x ?? ''));
  }
  return rows;
}

// ── רו״ה ──
export interface PnlRow { label: string; months: (number | undefined)[]; total?: number; kind: 'section' | 'item' | 'total' }
export interface PnlImport {
  name?: string;
  taxId?: string;
  year?: number;
  /** לכל חודש 1..12: הכנסות, הוצאות ורווח — undefined כשהחודש ריק. */
  months: { m: number; income?: number; expenses?: number; profit?: number }[];
  lastMonthWithData: number;
  rows: PnlRow[];
  /** קטגוריות הוצאה (שורות פריט תחת «הוצאות») — לתיאומי מס. */
  expenseCategories: { label: string; total: number; toMonth: (m: number) => number }[];
  warnings: string[];
}

const MONTH_RE = /^(0?[1-9]|1[0-2])\/(\d{2}|\d{4})$/;
/** רו״ה בטבלה: מוצא את שורת הכותרת (חודשים), את שורות הסיכום, ובודק עקביות. */
export function parsePnl(table: string[][]): PnlImport {
  const warnings: string[] = [];
  let hi = -1, monthCols: { col: number; m: number; y: number }[] = [];
  for (let i = 0; i < table.length && hi < 0; i++) {
    const cols = table[i].map((c, j) => ({ c: c.trim(), j })).filter(x => MONTH_RE.test(x.c));
    if (cols.length >= 3) {
      hi = i;
      monthCols = cols.map(x => { const [mm, yy] = x.c.split('/'); return { col: x.j, m: Number(mm), y: yy.length === 2 ? 2000 + Number(yy) : Number(yy) }; });
    }
  }
  if (hi < 0) return { months: [], lastMonthWithData: 0, rows: [], expenseCategories: [], warnings: ['לא נמצאה שורת כותרת עם חודשים (01/26 …) — לא נראה כמו רו״ה של פייפרלס'] };
  const years = [...new Set(monthCols.map(x => x.y))];
  if (years.length > 1) warnings.push(`בדוח יותר משנה אחת (${years.join(', ')}) — נקראת ${years[0]} בלבד`);
  const year = years[0];
  const head = table[hi].map(c => c.trim());
  const totalCol = head.findIndex(c => c === 'סכום' || c === 'סה"כ' || c === 'סה״כ');
  const labelCol = head.findIndex((c, j) => j !== totalCol && !MONTH_RE.test(c) && /[א-ת]/.test(c));
  // זיהוי: «<שם> - עוסק מורשה <מספר>» בשורות שלפני הכותרת
  const pre = table.slice(0, hi).map(r => r.join(' ')).join(' ');
  const idm = /(עוסק\s+(?:מורשה|פטור)|ח\.?\s?פ\.?|ע\.?\s?מ\.?)\s*[:\-]?\s*(\d{8,9})/.exec(pre) ?? /(\d{9})/.exec(pre);
  const taxId = idm ? (idm[2] ?? idm[1]) : undefined;
  const name = /^\s*(.+?)\s+-\s+עוסק/.exec(pre)?.[1]?.trim();
  if (!taxId) warnings.push('לא נמצא מספר עוסק בכותרת — הזיהוי מול הכרטיס לפי שם בלבד');
  const rows: PnlRow[] = [];
  for (const r of table.slice(hi + 1)) {
    const label = (labelCol >= 0 ? r[labelCol] : r.find(c => /[א-ת]/.test(c)) ?? '').trim();
    if (!label || /^הופק|^עמוד \d/.test(label)) continue;
    const months: (number | undefined)[] = Array(12).fill(undefined);
    for (const mc of monthCols) if (mc.y === year) months[mc.m - 1] = parseAmount(r[mc.col]);
    const total = totalCol >= 0 ? parseAmount(r[totalCol]) : undefined;
    const has = months.some(v => v != null) || total != null;
    rows.push({ label, months, total, kind: /^סך /.test(label) ? 'total' : has ? 'item' : 'section' });
  }
  const find = (re: RegExp) => rows.find(r => re.test(r.label));
  const inc = find(/^סך הכנסות$/) ?? find(/^סך הכנסות/);
  const exp = find(/^סך הוצאות$/);
  const prof = find(/^סך רווח והפסד$/) ?? find(/^(סך )?רווח/);
  if (!inc) warnings.push('לא נמצאה שורת «סך הכנסות»');
  if (!exp) warnings.push('לא נמצאה שורת «סך הוצאות»');
  if (!prof) warnings.push('לא נמצאה שורת «סך רווח והפסד» — הרווח יחושב מהכנסות פחות הוצאות');
  const months = Array.from({ length: 12 }, (_, i) => {
    const income = inc?.months[i], expenses = exp?.months[i];
    let profit = prof?.months[i];
    if (profit == null && (income != null || expenses != null)) profit = (income ?? 0) - (expenses ?? 0);
    if (profit != null && (income != null || expenses != null) && Math.abs(profit - ((income ?? 0) - (expenses ?? 0))) > 1)
      warnings.push(`חודש ${i + 1}: רווח ${profit} ≠ הכנסות ${income ?? 0} − הוצאות ${expenses ?? 0}`);
    return { m: i + 1, income, expenses, profit };
  });
  for (const r of [inc, exp, prof]) {
    if (r?.total != null) { const s = r.months.reduce<number>((a, v) => a + (v ?? 0), 0); if (Math.abs(s - r.total) > 1) warnings.push(`«${r.label}»: סכום החודשים ${s} ≠ עמודת «סכום» ${r.total}`); }
  }
  const lastMonthWithData = months.reduce((a, x) => (x.income != null || x.expenses != null || x.profit != null ? x.m : a), 0);
  // קטגוריות הוצאה: פריטים שבין «הוצאות» ל«סך הוצאות»
  const si = rows.findIndex(r => r.label === 'הוצאות'), ei = exp ? rows.indexOf(exp) : rows.length;
  const expenseCategories = rows.slice(si >= 0 ? si + 1 : 0, ei).filter(r => r.kind === 'item').map(r => ({
    label: r.label, total: r.total ?? r.months.reduce<number>((a, v) => a + (v ?? 0), 0),
    toMonth: (m: number) => r.months.slice(0, m).reduce<number>((a, v) => a + (v ?? 0), 0),
  }));
  return { name, taxId, year, months, lastMonthWithData, rows, expenseCategories, warnings };
}

/** סכום הרו״ה עד חודש «סגור עד», עם מה שצריך לבדוק: חודשים ריקים לפני הסגירה ונתונים אחריה. */
export function pnlToCutoff(p: PnlImport, closedThrough: number) {
  const upto = p.months.slice(0, closedThrough);
  const emptyBefore = upto.filter(x => x.income == null && x.expenses == null && x.profit == null).map(x => x.m);
  const after = p.months.slice(closedThrough).filter(x => x.income != null || x.expenses != null).map(x => x.m);
  const firstData = p.months.find(x => x.income != null || x.expenses != null)?.m;
  return {
    profit: upto.reduce((a, x) => a + (x.profit ?? 0), 0),
    turnover: upto.reduce((a, x) => a + (x.income ?? 0), 0),
    /** חודשים שנמדדו בפועל: מהחודש הראשון עם נתונים ועד הסגירה (עסק שנפתח באמצע השנה). */
    monthsMeasured: firstData && firstData <= closedThrough ? closedThrough - firstData + 1 : 0,
    checks: [
      ...(emptyBefore.length ? [`חודשים בלי שום נתון לפני הסגירה: ${emptyBefore.join(', ')} — לבדוק אם זה באמת 0 או שהספרים לא הוזנו`] : []),
      ...(after.length ? [`יש נתונים אחרי חודש הסגירה (${after.join(', ')}) — לא נכנסים כ«בפועל»; הם חלקיים`] : []),
    ],
  };
}

// ── 134 / ESNA ──
const PERIOD_RE = /^(?:(\d{1,2})\s*[-–]\s*)?(\d{1,2})\/(\d{4})$|^(\d{4})[/-](\d{1,2})$/;
function periodOf(cell: string): string | undefined {
  const m = PERIOD_RE.exec(cell.trim());
  if (!m) return undefined;
  const mm = Number(m[2] ?? m[5]), yy = Number(m[3] ?? m[4]);
  if (!(mm >= 1 && mm <= 12)) return undefined;
  return `${yy}-${String(mm).padStart(2, '0')}`;
}
const headIdx = (head: string[], ...labels: string[]) => head.findIndex(h => labels.some(l => h.replace(/\s+/g, ' ').trim() === l));

/**
 * ‼ readOn אינו נלקח מהמסך: «עודכן ב» ב-134 הוא מועד עדכון החלטת המקדמה, לא היום שבו המשרד צפה במסך
 *   (research/it134-esna-evidence-2026-10-13.md §3). מי שקולט רושם את יום הקליטה; התאריך מהמסך — decisionUpdatedOn, למידע.
 */
export interface PeriodImport { periods: AuthorityPeriod[]; readOn?: string; decisionUpdatedOn?: string; warnings: string[]; skipped: string[] }

/** טבלת התקופות ממסך 134 — מהדבקה. בלי כותרת: הסדר הידוע של המסך. */
export function parse134(table: string[][]): PeriodImport {
  const warnings: string[] = [], skipped: string[] = [];
  const hi = table.findIndex(r => r.some(c => c.trim() === 'מחזור') && r.some(c => c.trim() === 'תקופה'));
  const head = hi >= 0 ? table[hi].map(c => c.trim()) : [];
  const ix = hi >= 0
    ? { p: headIdx(head, 'תקופה'), s: headIdx(head, 'מצב דיווח'), t: headIdx(head, 'מחזור'), c: headIdx(head, 'חיוב'), pay: headIdx(head, 'תשלומים'), w: headIdx(head, 'ניכוי במקור') }
    : { p: 0, s: 1, t: 2, c: 3, pay: 4, w: 5 };
  if (hi < 0) warnings.push('לא נמצאה שורת כותרת — העמודות נקראו לפי הסדר במסך 134 (תקופה, מצב, מחזור, חיוב, תשלומים, ניכוי במקור). לבדוק.');
  const upd = table.map(r => r.join(' ')).join(' ').match(/עודכן ב[- :]*(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  const periods: AuthorityPeriod[] = [];
  for (const r of table.slice(hi + 1)) {
    const per = periodOf(r[ix.p] ?? '') ?? (r.map(periodOf).find(Boolean));
    if (!per) { if (r.some(c => /\d/.test(c))) skipped.push(r.join(' | ')); continue; }
    const st = (ix.s >= 0 ? r[ix.s] : '') ?? '';
    // ‼ «לא דווח» מכיל «דווח» — נבדק קודם; מצב שלא נצפה בהקלטה נשאר «לא ידוע», לא «דווח»
    const notReported = /לא\s*דווח|טרם\s*דווח|חסר/.test(st);
    if (notReported) warnings.push(`${per}: מצב «${st.trim()}» — נקרא כ«לא ידוע», לא כ«דווח»`);
    const state: AuthorityPeriod['state'] = /טרם הגיע/.test(st) ? 'not_due' : !notReported && /(^|\s)דווח/.test(st) ? 'reported' : 'unknown';
    periods.push({ period: per, state, turnover: parseAmount(r[ix.t]), charged: parseAmount(r[ix.c]), paid: parseAmount(r[ix.pay]), withheld: ix.w >= 0 ? parseAmount(r[ix.w]) : undefined });
  }
  if (skipped.length) warnings.push(`${skipped.length} שורות עם מספרים לא זוהו כתקופה — לא נקראו`);
  const dup = periods.map(p => p.period).filter((p, i, a) => a.indexOf(p) !== i);
  if (dup.length) warnings.push(`תקופה מופיעה פעמיים: ${[...new Set(dup)].join(', ')}`);
  return { periods, decisionUpdatedOn: upd ? `${upd[3]}-${upd[2].padStart(2, '0')}-${upd[1].padStart(2, '0')}` : undefined, warnings, skipped };
}

/** סיכומי דיווח ESNA — מחזור לכל תקופה = עסקאות חייבות + פטורות. «אקראי» מוצג בנפרד. */
export function parseEsna(table: string[][]): PeriodImport & { random: { period: string; amount: number }[] } {
  const warnings: string[] = [], skipped: string[] = [];
  const hi = table.findIndex(r => r.some(c => c.includes('עסקאות חייבות')));
  if (hi < 0) return { periods: [], warnings: ['לא נמצאה כותרת «עסקאות חייבות» — לא נראה כמו סיכומי ESNA'], skipped, random: [] };
  const head = table[hi].map(c => c.trim());
  const ix = { p: headIdx(head, 'תקופה'), tx: head.findIndex(h => h.includes('עסקאות חייבות')), ex: head.findIndex(h => h.includes('עסקאות פטורות')), rnd: head.findIndex(h => h.includes('עסקאות אקראי')) };
  const periods: AuthorityPeriod[] = [], random: { period: string; amount: number }[] = [];
  for (const r of table.slice(hi + 1)) {
    if (r.some(c => /^סה"?כ|סה״כ/.test(c.trim()))) continue;
    const per = periodOf(r[ix.p >= 0 ? ix.p : 0] ?? '');
    if (!per) { if (r.some(c => /\d/.test(c))) skipped.push(r.join(' | ')); continue; }
    const tx = parseAmount(r[ix.tx]), ex = ix.ex >= 0 ? parseAmount(r[ix.ex]) : undefined;
    if (tx == null && ex == null) { periods.push({ period: per, state: 'unknown' }); continue; }
    periods.push({ period: per, state: 'reported', turnover: (tx ?? 0) + (ex ?? 0) });
    const rnd = ix.rnd >= 0 ? parseAmount(r[ix.rnd]) : undefined;
    if (rnd) random.push({ period: per, amount: rnd });
  }
  if (random.length) warnings.push(`עסקאות אקראי (${random.length} תקופות) לא נכללו במחזור — לבדוק אם הן חלק מהעסק`);
  // ‼ אין הגדרה רשמית לעמודות ESNA — «מחזור = חייבות + פטורות» הוא הנחה של הקליטה (research/it134-esna-evidence-2026-10-13.md)
  if (periods.some(p => p.state === 'reported')) warnings.push('המחזור לכל תקופה = עסקאות חייבות + פטורות — הנחה של הקליטה, לא הגדרה רשמית של המסך. לבדוק מול הדוח');
  if (skipped.length) warnings.push(`${skipped.length} שורות לא זוהו כתקופה — לא נקראו`);
  return { periods, warnings, skipped, random };
}

/** האם מספר מזהה שמופיע במסמך שייך ללקוח (ת״ז, ת״ז בן/בת הזוג או מספר עוסק בכרטיס). */
export function identityMatches(docId: string | undefined, known: (string | undefined)[]): 'match' | 'mismatch' | 'unknown' {
  if (!docId) return 'unknown';
  const norm = (s?: string) => (s ?? '').replace(/\D/g, '').replace(/^0+/, '');
  const ks = known.map(norm).filter(Boolean);
  if (!ks.length) return 'unknown';
  return ks.includes(norm(docId)) ? 'match' : 'mismatch';
}

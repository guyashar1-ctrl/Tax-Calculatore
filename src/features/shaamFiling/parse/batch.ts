// ─── כמה קבצים / כמה עמודים → אצווה אחת לשרת + כיסוי (16.10.2026) ──────────────────────────────────
// ‼ כיסוי: לכל רשימה (שנתי לפי שנה; הון לפי קבוצה) — אילו עמודים נקראו, האם ידוע כמה יש, מה חסר ומה כפול.
//   עמוד כפול זהה — מתעלמים; עמוד כפול שונה — סתירה, ושתי הגרסאות לא נקלטות מאותו עמוד.
//   «אין תיקים שבקשת» — הקבוצה נבדקה וריקה. קבוצת הון שלא באף קובץ הון באצווה — נבדקה וריקה (גיא, 31.10.2026).
// ‼ טהור.

import { WEALTH_GROUP_LABEL, type ListKind, type PageStatus, type ParsedPage, type ParsedRow, type WealthGroup } from './parseShaam';

export interface ParsedFile {
  /** מזהה מקומי לקובץ (sha256 כשיש). */
  key: string;
  fileName: string;
  size: number;
  sha256?: string;
  /** נתיב בדלי אחרי העלאה. */
  storagePath?: string;
  pages: ParsedPage[];
  /** כשל קריאה של הקובץ כולו (PDF פגום, לא PDF). */
  error?: string;
}

export interface FileVerdict {
  key: string;
  fileName: string;
  /** סיכום לקובץ: מה זוהה בו. */
  label: string;
  tone: 'ok' | 'warn' | 'bad';
  messages: string[];
  kind?: ListKind;
  group?: WealthGroup;
  taxYear?: number;
  rows: number;
  usable: boolean;
}

export interface Coverage {
  /** הפקה אחת של רשימה: רשימה + זמן ההפקה. ‼ שתי הפקות (תאריכים שונים) — שתי צילומי מצב, לא עמודים סותרים. */
  listKey: string;
  /** 'annual:2025' · 'wealth:unfiled_no_fine' */
  list: string;
  label: string;
  pagesSeen: number[];
  pageTotal?: number;
  missing: number[];
  duplicates: number[];
  conflicts: number[];
  empty: boolean;
  rows: number;
  producedOn?: string;
}

export interface BatchSource {
  /** 'manual' — מקור בלי קובץ (למשל שאילתה 154 מיישור הקו). ברירת מחדל בשרת: 'pdf'. */
  method?: 'pdf' | 'manual';
  key: string; fileName: string; sha256?: string; size?: number; storagePath?: string; kind: ListKind; group?: WealthGroup; taxYear?: number;
  producedRaw?: string; producedOn?: string; status: 'ok' | 'empty_confirmed' | 'partial'; pages: { page?: number; pageTotal?: number; status: PageStatus; rows: number }[];
  note?: string;
}

const WEALTH_GROUPS: WealthGroup[] = ['unfiled_no_fine', 'unfiled_fine', 'filed_fine', 'filed_no_fine'];
export const ABSENT_GROUP_NOTE = 'לא מופיעה בקובץ ההון — נחשבת נבדקה וריקה';
export interface BatchRow extends Omit<ParsedRow, 'line'> { sourceKey: string; page?: number; line: number }
export interface Batch { sources: BatchSource[]; rows: BatchRow[] }

const pageSig = (p: ParsedPage) => JSON.stringify(p.rows.map(r => [r.fileNumber, r.name, r.legalDueRaw, r.filedOnRaw, r.required, r.yearShown]));
const listOf = (p: ParsedPage) => (p.kind === 'annual' ? `annual:${p.taxYear}` : `wealth:${p.group}`);
const listKeyOf = (p: ParsedPage) => `${listOf(p)}@${p.producedRaw ?? ''}`;
const listLabel = (p: ParsedPage) => (p.kind === 'annual' ? `דוחות שנתיים · שנת מס ${p.taxYear}` : `הצהרות הון · ${WEALTH_GROUP_LABEL[p.group!]}`);

const STATUS_TEXT: Record<PageStatus, string> = {
  ok: 'נקרא',
  empty_confirmed: 'הקבוצה נבדקה וריקה («אין תיקים שבקשת»)',
  legacy_annual: 'חסר סימון חבות — לא נקלט',
  unsupported: 'מסך שע״ם שאינו רשימה לקליטה',
  unrelated: 'לא רשימה משע״ם',
  unreadable: 'לא ניתן לקריאה',
};

export function fileVerdict(f: ParsedFile): FileVerdict {
  const base = { key: f.key, fileName: f.fileName };
  if (f.error) return { ...base, label: 'הקובץ לא נפתח', tone: 'bad', messages: [f.error], rows: 0, usable: false };
  if (!f.pages.length) return { ...base, label: 'אין עמודים בקובץ', tone: 'bad', messages: [], rows: 0, usable: false };
  const good = f.pages.filter(p => p.status === 'ok' || p.status === 'empty_confirmed');
  const first = good[0] ?? f.pages[0];
  const rows = good.reduce((n, p) => n + p.rows.length, 0);
  const messages = [...new Set(f.pages.flatMap(p => p.problems))];
  const kinds = new Set(good.map(listOf));
  if (kinds.size > 1) messages.push('בקובץ יש עמודים מכמה רשימות — כל עמוד נקלט לרשימה שלו');
  if (!good.length) {
    return { ...base, label: STATUS_TEXT[first.status], tone: first.status === 'legacy_annual' ? 'warn' : 'bad', messages, rows: 0, usable: false, kind: first.kind, taxYear: first.taxYear };
  }
  const bad = f.pages.length - good.length;
  if (bad) messages.push(`${bad} מתוך ${f.pages.length} עמודים לא נקראו`);
  const label = first.status === 'empty_confirmed' && rows === 0 ? `${listLabel(first)} — ${STATUS_TEXT.empty_confirmed}` : `${listLabel(first)} · ${rows} שורות`;
  const rowProblems = good.flatMap(p => p.rows).filter(r => r.problems.length).length;
  if (rowProblems) messages.push(`${rowProblems} שורות עם בעיה — יוצגו לבדיקה`);
  return { ...base, label, tone: bad || rowProblems ? 'warn' : 'ok', messages, rows, usable: true, kind: first.kind, group: first.group, taxYear: first.taxYear };
}

/** כל הקבצים → אצווה לשרת + כיסוי לכל רשימה. */
export function buildBatch(files: ParsedFile[]): { batch: Batch; coverage: Coverage[] } {
  const sources: BatchSource[] = [];
  const rows: BatchRow[] = [];
  const cov = new Map<string, Coverage & { sigs: Map<number, string> }>();
  for (const f of files) {
    if (f.error) continue;
    // עמוד לכל רשימה בקובץ: מקור לכל (קובץ × רשימה)
    const byList = new Map<string, ParsedPage[]>();
    for (const p of f.pages) {
      if (p.status !== 'ok' && p.status !== 'empty_confirmed') continue;
      const k = listKeyOf(p);
      byList.set(k, [...(byList.get(k) ?? []), p]);
    }
    for (const [lk, pages] of byList) {
      const p0 = pages[0];
      const sourceKey = byList.size > 1 ? `${f.key}#${lk}` : f.key;
      let c = cov.get(lk);
      if (!c) { c = { listKey: lk, list: listOf(p0), label: listLabel(p0), pagesSeen: [], missing: [], duplicates: [], conflicts: [], empty: false, rows: 0, sigs: new Map() }; cov.set(lk, c); }
      const keep: ParsedPage[] = [];
      for (const p of pages) {
        if (p.pageTotal) c.pageTotal = Math.max(c.pageTotal ?? 0, p.pageTotal);
        if (p.producedOn && (!c.producedOn || p.producedOn > c.producedOn)) c.producedOn = p.producedOn;
        if (p.status === 'empty_confirmed') { c.empty = true; keep.push(p); continue; }
        const n = p.page;
        if (n !== undefined && c.sigs.has(n)) {
          if (c.sigs.get(n) === pageSig(p)) { if (!c.duplicates.includes(n)) c.duplicates.push(n); continue; }
          if (!c.conflicts.includes(n)) c.conflicts.push(n);
          continue;
        }
        if (n !== undefined) { c.sigs.set(n, pageSig(p)); c.pagesSeen.push(n); }
        keep.push(p);
      }
      sources.push({
        key: sourceKey, fileName: f.fileName, sha256: f.sha256 ? (byList.size > 1 ? `${f.sha256}#${lk}` : f.sha256) : undefined, size: f.size, storagePath: f.storagePath,
        kind: p0.kind!, group: p0.group, taxYear: p0.taxYear, producedRaw: p0.producedRaw, producedOn: p0.producedOn,
        // ‼ «חלקי» = בקובץ עמוד שלא נקרא; קובץ משותף עם כמה קבוצות (31.10) אינו חלקי
        status: pages.every(p => p.status === 'empty_confirmed') ? 'empty_confirmed' : f.pages.every(p => p.status === 'ok' || p.status === 'empty_confirmed') ? 'ok' : 'partial',
        pages: pages.map(p => ({ page: p.page, pageTotal: p.pageTotal, status: p.status, rows: p.rows.length })),
      });
      for (const p of keep) for (const r of p.rows) { rows.push({ ...r, sourceKey, page: p.page }); c.rows++; }
    }
  }
  // עמודים בסתירה — השורות שלהם לא נקלטות משום גרסה (עד שמעלים מחדש)
  const conflicted = new Set<string>();
  for (const c of cov.values()) for (const n of c.conflicts) conflicted.add(`${c.listKey}|${n}`);
  const srcList = new Map(sources.map(s => [s.key, `${s.kind === 'annual' ? `annual:${s.taxYear}` : `wealth:${s.group}`}@${s.producedRaw ?? ''}`]));
  // ‼ אותו תיק באותה רשימה בשני קבצים — הקובץ שהופק מאוחר יותר קודם (השרת לוקח את הראשון ומסמן את השני «כפול»)
  const prod = new Map(sources.map(s => [s.key, s.producedOn ?? '']));
  const finalRows = rows.filter(r => !(r.page !== undefined && conflicted.has(`${srcList.get(r.sourceKey)}|${r.page}`)))
    .map((r, k) => ({ r, k })).sort((a, b) => (prod.get(b.r.sourceKey) ?? '').localeCompare(prod.get(a.r.sourceKey) ?? '') || a.k - b.k).map(x => x.r);
  const coverage = [...cov.values()].map(({ sigs: _s, ...c }) => {
    const seen = [...c.pagesSeen].sort((a, b) => a - b);
    const top = c.pageTotal ?? (seen.length ? seen[seen.length - 1] : 0);
    const missing: number[] = [];
    for (let k = 1; k <= top; k++) if (!seen.includes(k)) missing.push(k);
    return { ...c, pagesSeen: seen, missing, rows: finalRows.filter(r => srcList.get(r.sourceKey) === c.listKey).length };
  });
  // ‼ 31.10.2026 (גיא): הצהרות הון = קובץ אחד עם ארבע הקבוצות (Copy, Copy Append, Print Clipboard). קבוצה שהציגה
  //   «אין תיקים שבקשת» לא מועתקת — לכן קבוצה שאינה באף קובץ הון באצווה נרשמת «נבדקה וריקה», צמודה לקובץ האחרון.
  const wealth = sources.filter(s => s.kind === 'wealth').sort((a, b) => (b.producedOn ?? '').localeCompare(a.producedOn ?? ''));
  const base = wealth[0];
  if (base) {
    const fileKey = base.key.split('#')[0], fileSha = base.sha256?.split('#')[0];
    for (const g of WEALTH_GROUPS.filter(g => !wealth.some(s => s.group === g))) {
      const lk = `wealth:${g}@${base.producedRaw ?? ''}`;
      sources.push({
        key: `${fileKey}#absent:${lk}`, fileName: base.fileName, sha256: fileSha ? `${fileSha}#absent:${lk}` : undefined, size: base.size, storagePath: base.storagePath,
        kind: 'wealth', group: g, producedRaw: base.producedRaw, producedOn: base.producedOn, status: 'empty_confirmed', pages: [], note: ABSENT_GROUP_NOTE,
      });
      coverage.push({ listKey: lk, list: `wealth:${g}`, label: `הצהרות הון · ${WEALTH_GROUP_LABEL[g]}`, pagesSeen: [], missing: [], duplicates: [], conflicts: [], empty: true, rows: 0, producedOn: base.producedOn });
    }
  }
  return { batch: { sources, rows: finalRows }, coverage };
}

export function coverageText(c: Coverage): string {
  if (c.empty && !c.rows) return 'נבדקה וריקה';
  const parts: string[] = [];
  parts.push(c.pageTotal ? `עמודים ${c.pagesSeen.join(', ') || '—'} מתוך ${c.pageTotal}` : c.pagesSeen.length ? `עמודים ${c.pagesSeen.join(', ')} (סה״כ העמודים לא מופיע ברשימה)` : 'עמוד בלי מספר');
  if (c.missing.length) parts.push(`חסרים ${c.missing.join(', ')}`);
  if (c.duplicates.length) parts.push(`עמוד כפול (זהה) ${c.duplicates.join(', ')} — נקלט פעם אחת`);
  if (c.conflicts.length) parts.push(`עמוד ${c.conflicts.join(', ')} הועלה פעמיים בתוכן שונה — לא נקלט; העלו את הגרסה הנכונה`);
  return parts.join(' · ');
}

// ─── «הדוחות שלך» ו«הדבר הבא» בדף האישי (280) — המודל, בלי React ─────────────────────────
// ‼ המצב של כל חובה (הוגש / צריך ממך / בהכנה אצלנו / בלי תג / אין חובה) נגזר בשרת
//   (_portal_filings, supabase/280-portal-filings.sql). כאן רק מסדרים לתצוגה: כרטיס לשנה,
//   שנים ישנות שהוגשו כולן — בכרטיס אחד, ותאריכים בעברית.
// ‼ «הדבר הבא» לא מחשב שום דבר חדש: הוא בוחר אחד מהפריטים שהדף כבר מציג ב«מה צריך ממך»
//   (הקרוב ביותר במועד לפי החובות שלמעלה, ואם אין מועד — הראשון).

export type FilingKind = 'annual' | 'wealth';
export type FilingStatus = 'filed' | 'client' | 'office' | 'none' | 'not_required';

export interface PortalFilingItem {
  kind: FilingKind;
  role: 'client' | 'spouse';
  /** השם הפרטי מהכרטיס (בן/בת הזוג — שלו/ה). חסר ⇒ הדף משלים. */
  person?: string;
  required?: boolean;
  legalDue?: string;
  filedOn?: string;
  status: FilingStatus;
  /** רק כש-status='client': הבקשה שבדף (actionValue של הפריט ב«מה צריך ממך»). */
  stepId?: string;
}

export interface PortalFilingsData {
  ok: boolean;
  error?: string;
  /** תאריך הרשימה החדשה של המשרד משע״ם (YYYY-MM-DD). */
  sourceDate?: string;
  years: { year: number; items: PortalFilingItem[] }[];
}

export const FILING_KIND_LABEL: Record<FilingKind, string> = { annual: 'דוח שנתי', wealth: 'הצהרת הון' };

export type PillTone = 'you' | 'us' | 'done' | 'no';

export interface FilingRow {
  key: string;
  title: string;
  person: string;
  pill?: { tone: PillTone; text: string };
  /** עמודת המועד: התאריך (או «מועד לא ידוע») ומה הוא. */
  when?: { main: string; sub?: string };
  muted: boolean;
}

export interface FilingYearCard {
  key: string;
  /** «2025» או «2021–2023». */
  label: string;
  summary: string;
  /** אין בשנה (או בשנים) שום דבר פתוח. */
  settled: boolean;
  /** ✓ ליד הסיכום — יש הגשה ואין שום דבר פתוח. */
  allFiled: boolean;
  openByDefault: boolean;
  rows: FilingRow[];
}

/** «2026-11-30» ⇒ «30.11.2026» (בלי אפסים מובילים, כמו בהדמיה). */
export function dmy(iso: string | undefined | null): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso ?? '');
  return m ? `${Number(m[3])}.${Number(m[2])}.${m[1]}` : '';
}

/** «2026-10-19» ⇒ «19.10». */
export function dm(iso: string | undefined | null): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso ?? '');
  return m ? `${Number(m[3])}.${Number(m[2])}` : '';
}

const isOpen = (i: PortalFilingItem) => i.status === 'client' || i.status === 'office' || i.status === 'none';

function rowOf(i: PortalFilingItem, idx: string, fallbackFirstName: string, withYear: number | null): FilingRow {
  const title = FILING_KIND_LABEL[i.kind] + (withYear != null ? ` ${withYear}` : '');
  const person = i.person || (i.role === 'spouse' ? 'בן/בת הזוג' : fallbackFirstName);
  const dueWhen = (): FilingRow['when'] => i.legalDue
    ? { main: dmy(i.legalDue), sub: i.kind === 'wealth' ? 'לפי הדרישה' : 'מועד הגשה' }
    : { main: 'מועד לא ידוע' };
  switch (i.status) {
    case 'filed':
      return {
        key: idx, title, person, muted: false,
        // ‼ בכרטיס של כמה שנים שהוגשו — בלי תג בכל שורה (הכרטיס כבר אומר «הכול הוגש»), כמו בהדמיה.
        pill: withYear != null ? undefined : { tone: 'done', text: 'הוגש' },
        when: i.filedOn ? { main: dmy(i.filedOn), sub: 'הוגש' } : undefined,
      };
    case 'client':
      return { key: idx, title, person, muted: false, pill: { tone: 'you', text: 'צריך ממך' }, when: dueWhen() };
    case 'office':
      return { key: idx, title, person, muted: false, pill: { tone: 'us', text: 'בהכנה אצלנו' }, when: dueWhen() };
    case 'not_required':
      return { key: idx, title, person, muted: true, pill: { tone: 'no', text: 'אין חובת הגשה' } };
    default:
      return { key: idx, title, person, muted: false, when: dueWhen() };
  }
}

function summaryOf(items: PortalFilingItem[]): { summary: string; settled: boolean; allFiled: boolean } {
  const open = items.filter(isOpen).length;
  if (open > 0) return { summary: open === 1 ? 'פתוח אחד' : `${open} פתוחים`, settled: false, allFiled: false };
  if (items.some(i => i.status === 'filed')) return { summary: 'הכול הוגש', settled: true, allFiled: true };
  return { summary: 'אין חובת הגשה', settled: true, allFiled: false };
}

/** שנים ⇒ «2021–2023» כשהן רצופות; אחרת רשימה («2019, 2021»). */
export function yearsLabel(years: number[]): string {
  const ys = [...years].sort((a, b) => a - b);
  if (ys.length === 1) return String(ys[0]);
  const contiguous = ys.every((y, i) => i === 0 || y === ys[i - 1] + 1);
  return contiguous ? `${ys[0]}–${ys[ys.length - 1]}` : ys.join(', ');
}

/**
 * כרטיס לכל שנה, החדשה ראשונה. שנה עם משהו פתוח — כרטיס משלה, פתוח. מהשנים שאין בהן שום דבר פתוח:
 * החדשה מביניהן — כרטיס משלה (סגור); כל הישנות ממנה (שתיים ומעלה) — כרטיס אחד סגור («2021–2023 · הכול הוגש»).
 */
export function buildFilingCards(data: PortalFilingsData | null | undefined, fallbackFirstName = ''): {
  header: string | null; cards: FilingYearCard[];
} {
  const years = (data?.ok ? data.years : [])
    .filter(y => y.items?.length)
    .sort((a, b) => b.year - a.year);
  if (!years.length) return { header: null, cards: [] };

  const settledYears = years.filter(y => summaryOf(y.items).settled);
  const newestSettled = settledYears[0]?.year;
  const older = settledYears.filter(y => y.year !== newestSettled);
  const merge = older.length >= 2 ? new Set(older.map(y => y.year)) : new Set<number>();

  const cards: FilingYearCard[] = [];
  let mergedPlaced = false;
  for (const y of years) {
    if (merge.has(y.year)) {
      if (mergedPlaced) continue;
      mergedPlaced = true;
      const group = years.filter(x => merge.has(x.year));
      const items = group.flatMap(g => g.items);
      const s = summaryOf(items);
      cards.push({
        key: `y-${group.map(g => g.year).join('-')}`,
        label: yearsLabel(group.map(g => g.year)),
        ...s, openByDefault: false,
        rows: group.flatMap(g => g.items.map((i, n) => rowOf(i, `${g.year}-${n}`, fallbackFirstName, g.year))),
      });
      continue;
    }
    const s = summaryOf(y.items);
    cards.push({
      key: `y-${y.year}`, label: String(y.year), ...s, openByDefault: !s.settled,
      rows: y.items.map((i, n) => rowOf(i, `${y.year}-${n}`, fallbackFirstName, null)),
    });
  }
  return { header: data?.sourceDate ? `לפי שע״ם · ${dm(data.sourceDate)}` : null, cards };
}

/** הבקשה שבדף ⇒ המועד של החובה שהיא משרתת (רק חובות שאצל הלקוח). המוקדם מביניהם. */
export function dueByStep(data: PortalFilingsData | null | undefined): Map<string, string> {
  const out = new Map<string, string>();
  for (const y of data?.ok ? data.years : []) {
    for (const i of y.items) {
      if (i.status !== 'client' || !i.stepId || !i.legalDue) continue;
      const cur = out.get(i.stepId);
      if (!cur || i.legalDue < cur) out.set(i.stepId, i.legalDue);
    }
  }
  return out;
}

/** מה שצריך מ«הדבר הבא» מפריט בדף — בלי לתלות את המודל בטיפוס של הדף. */
export interface NextCandidate { key: string; actionValue?: string; stepId?: string; kind?: string; forPerson?: string }

/**
 * «הדבר הבא»: מבין מה שממתין ללקוח (בסדר שבו הדף מציג אותו) — זה עם המועד הקרוב ביותר; אין מועדים ⇒ הראשון.
 * ‼ לא הודעה מהמשרד ולא פעולה של אדם אחר במשק הבית.
 */
export function pickNextAction<T extends NextCandidate>(ordered: T[], due: Map<string, string>): { item: T; due?: string } | null {
  const list = ordered.filter(i => i.kind !== 'message' && !i.forPerson);
  if (!list.length) return null;
  let best: { item: T; due?: string } | null = null;
  for (const item of list) {
    const d = due.get(item.actionValue ?? '') ?? due.get(item.stepId ?? '');
    if (d && (!best?.due || d < best.due)) best = { item, due: d };
  }
  return best ?? { item: list[0] };
}

/**
 * נתוני דוגמה — «צפייה» בספרייה ובהדגמה. ‼ בלי רשת. השנים יחסיות לשנה הנוכחית כדי שהדוגמה לא תתיישן.
 * השמות — שמות הדוגמה הקבועים (CLAUDE.md §12.6), אלא אם ההדגמה מבקשת אחרים.
 */
export function sampleFilings(opts: { client?: string; spouse?: string | null; now?: Date } = {}): PortalFilingsData {
  const now = opts.now ?? new Date();
  const y = now.getFullYear() - 1;
  const client = opts.client ?? 'ישראל';
  const spouse = opts.spouse === undefined ? 'ישראלה' : opts.spouse;
  const iso = (yy: number, mm: number, dd: number) => `${yy}-${String(mm).padStart(2, '0')}-${String(dd).padStart(2, '0')}`;
  const filed = (yr: number, d: string): { year: number; items: PortalFilingItem[] } =>
    ({ year: yr, items: [{ kind: 'annual', role: 'client', person: client, required: true, legalDue: iso(yr + 1, 5, 31), filedOn: d, status: 'filed' }] });
  return {
    ok: true,
    sourceDate: iso(now.getFullYear(), now.getMonth() + 1, Math.min(now.getDate(), 28)),
    years: [
      { year: y, items: [
        { kind: 'annual', role: 'client', person: client, required: true, legalDue: iso(y + 1, 11, 30), status: 'office' },
        { kind: 'wealth', role: 'client', person: client, legalDue: iso(y + 1, 12, 31), status: 'client' },
        ...(spouse ? [{ kind: 'annual' as const, role: 'spouse' as const, person: spouse, required: false, status: 'not_required' as const }] : []),
      ] },
      filed(y - 1, iso(y, 5, 14)),
      filed(y - 2, iso(y - 1, 6, 2)),
      filed(y - 3, iso(y - 2, 5, 29)),
      filed(y - 4, iso(y - 3, 7, 11)),
    ],
  };
}

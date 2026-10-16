// ─── מפת הטופס — הטופס הרשמי עם סימון על כל שדה (16.10.2026) ───────────────────────────────────
// ‼ גיא (16.10): «דוח שנתי» הוא הטופס עצמו, לא מאמר. לכל שדה: שם וקוד, מה ממלאים, מאיפה המידע מגיע (מסמך,
//   שאלה בשאלון, נתון בתיק), מי מבני הזוג, הסבר קצר וקישור «ללמוד לעומק». ואיתור שדה לפי קוד.
// ‼ טהור (בלי React). המיקום — רק מה שנמצא בטופס הרשמי (scripts/forms/build-form-layouts.mjs): קוד מודפס בתוך תיבה.
//   שדה בלי מיקום אמין אינו מצויר — הוא ברשימת «בלי סימון בטופס», עם הסיבה.
// ‼ אין כאן תוכן מקצועי חדש: ההסבר מהקטלוג (form1301/annexes), מהשדות הממופים, ממפת הכיסוי ומהנושאים. חסר = «טרם נכתב».

import type { Client } from '../../../types';
import { CATALOG_1301_2025, ANNEX_CATALOG_2025, ANNEX_INFO_2025, DRAFT_FILL_1301, FILE_LABEL, SOURCE_LABEL_HE, coverage1301, type AnnexInfoItem, type CoverageRow, type FileState } from '../../taxForms/coverage1301';
import { FIELDS_1301_2025 } from '../../taxForms/form1301';
import { fieldReadiness } from '../../taxForms/engine';
import type { FormField, ReadinessStatus } from '../../taxForms/types';
import { AREAS, ITEMS, AREA_BY_ID, type InfoItem } from '../../taxYear/catalog';
import { WEALTH_AREAS, WEALTH_ITEMS } from '../../taxYear/wealthCatalog';
import { INTAKE_AREAS, INTAKE_ITEMS } from '../../taxYear/intakeCatalog';
import { DOCS } from '../../taxYear/documents';
import type { DocKind, YearFact } from '../../taxYear/types';
import { TOPICS } from '../topics';
import { WEALTH_PARTS, type WealthRow } from '../wealthFormGuide';
import type { ClaimStatus } from '../claim';
import l1301 from '../../taxForms/data/form1301-2025.layout.json';
import l1320 from '../../taxForms/data/form1320-2025.layout.json';
import l1321 from '../../taxForms/data/form1321-2025.layout.json';
import l1322 from '../../taxForms/data/form1322-2025.layout.json';
import l1324 from '../../taxForms/data/form1324-2025.layout.json';
import l1399y from '../../taxForms/data/form1399y-2025.layout.json';
import l1344 from '../../taxForms/data/form1344-2025.layout.json';
import l1343 from '../../taxForms/data/form1343-2025.layout.json';
import l1342 from '../../taxForms/data/form1342-2025.layout.json';
import l134 from '../../taxForms/data/form134-2025.layout.json';
import l1219 from '../../taxForms/data/form1219-2025.layout.json';
import l119 from '../../taxForms/data/form119-2025.layout.json';
import l116d from '../../taxForms/data/form116d-2025.layout.json';
import l116c from '../../taxForms/data/form116c-2025.layout.json';
import cat116c from '../../taxForms/data/form116c.catalog.json';

// ── הנתונים מהבנייה ──────────────────────────────────────────────────────────
export type Box = [number, number, number, number];
export interface Anchor { code: string; page: number; how: 'box' | 'label' | 'row'; box: Box; label: Box }
export interface LayoutPage { n: number; w: number; h: number; img: string; textLayer: boolean }
export interface Layout {
  formId: string; slug: string; taxYear: number; title: string;
  source: { url: string; fetchedOn: string; sha256: string; pdf: string; pagesInPdf: number };
  pages: LayoutPage[]; anchors: Anchor[]; ambiguous: { code: string; where: string[] }[]; missing: string[];
  /** ‼ 16.10 (סבב 2): שדה בלי קוד מודפס — לפי התווית שלו בטופס (התאמה חד-משמעית בלבד). */
  labelAnchors?: LabelAnchor[];
  labelUnplaced?: { field: string; why: 'noLabel' | 'noMatch' | 'ambiguous' | 'shared' | 'outside' }[];
}
export interface LabelAnchor { field: string; page: number; how: 'check' | 'row' | 'cell' | 'text'; box: Box; label: Box; score: number }

export type FormSlug = '1301' | '1320' | '1321' | '1322' | '1324' | '1399y' | '1344' | '1343' | '1342' | '134' | '119' | '116d' | '116c' | '1219';
export const LAYOUTS: Record<FormSlug, Layout> = {
  '1301': l1301, '1320': l1320, '1321': l1321, '1322': l1322, '1324': l1324, '1399y': l1399y,
  '1344': l1344, '1343': l1343, '1342': l1342, '134': l134, '119': l119, '116d': l116d, '116c': l116c, '1219': l1219,
} as unknown as Record<FormSlug, Layout>;

/** הטפסים במפה: 1301 והנספחים שלו בתחום «דוח שנתי», 1219 בתחום «הצהרת הון». 116ד הרגיל סרוק — עמוד ורשימה, בלי סימון. */
export interface MapForm { slug: FormSlug; formId: string; short: string; domain: 'annual' | 'wealth'; role: 'main' | 'annex' }
export const MAP_FORMS: MapForm[] = [
  { slug: '1301', formId: '1301', short: '1301 — הדוח', domain: 'annual', role: 'main' },
  { slug: '1320', formId: '1320', short: '1320 · עסק', domain: 'annual', role: 'annex' },
  { slug: '1321', formId: '1321', short: '1321 · שאינה מעסק', domain: 'annual', role: 'annex' },
  { slug: '1322', formId: '1322', short: '1322 · ני״ע', domain: 'annual', role: 'annex' },
  { slug: '1324', formId: '1324', short: '1324 · חו״ל', domain: 'annual', role: 'annex' },
  { slug: '1399y', formId: '1399י', short: '1399י · מכירת נכס', domain: 'annual', role: 'annex' },
  { slug: '1344', formId: '1344', short: '1344 · הפסדים', domain: 'annual', role: 'annex' },
  { slug: '1343', formId: '1343', short: '1343 · פחת נוסף', domain: 'annual', role: 'annex' },
  { slug: '1342', formId: '1342', short: '1342 · פחת', domain: 'annual', role: 'annex' },
  { slug: '134', formId: '134', short: '134 · הפקדות מעביד', domain: 'annual', role: 'annex' },
  { slug: '119', formId: '119', short: '119 · תואר אקדמי', domain: 'annual', role: 'annex' },
  { slug: '116d', formId: '116ד', short: '116ד · דחיית נקודת זיכוי', domain: 'annual', role: 'annex' },
  { slug: '116c', formId: '116ג', short: '116ג · בקשה לפריסה', domain: 'annual', role: 'annex' },
  { slug: '1219', formId: '1219', short: '1219 — הצהרת הון', domain: 'wealth', role: 'main' },
];
export const MAP_FORM_BY_SLUG = Object.fromEntries(MAP_FORMS.map(f => [f.slug, f])) as Record<FormSlug, MapForm>;
export const NOT_BUILT: { formId: string; why: string }[] = [];
export const formsOfDomain = (d: 'annual' | 'wealth') => MAP_FORMS.filter(f => f.domain === d);

// ── שדה במפה ─────────────────────────────────────────────────────────────────
export type Role = 'registered' | 'spouse' | 'joint' | 'form';
export const ROLE_LABEL: Record<Role, string> = { registered: '«בן הזוג הרשום» (או מי שאינו נשוי)', spouse: 'בן/בת הזוג', joint: 'שני בני הזוג יחד', form: '' };
export const ROLE_SHORT: Record<Role, string> = { registered: 'בן הזוג הרשום', spouse: 'בן/בת הזוג', joint: 'שני בני הזוג', form: '' };

export interface MapField {
  key: string;
  slug: FormSlug;
  formId: string;
  part?: string;
  section?: string | null;
  label: string;
  kind?: string;
  codes: { code: string; role: Role }[];
  instruction?: string | null;
  documents: string[];
  guidePage?: number | null;
  uncertain?: boolean;
  /** 1219 — הכלל מהמדריך לטופס (wealthFormGuide). */
  wealth?: WealthRow;
  /** ביסוס ההוראה (116ג). */
  claim?: ClaimStatus;
}

const catalogFields: MapField[] = CATALOG_1301_2025.map(e => {
  const raw = (e.codes ?? {}) as Partial<Record<'registered' | 'spouse' | 'joint', string | null>>;
  const codes = (['registered', 'spouse', 'joint'] as const).flatMap(r => (raw[r] ? [{ code: String(raw[r]), role: r as Role }] : []));
  return { key: e.id, slug: '1301' as const, formId: '1301', part: e.part, section: e.section, label: e.label, kind: e.kind, codes, instruction: e.instruction, documents: e.documents ?? [], guidePage: e.guidePage, uncertain: e.uncertain };
});

type AnnexField = { section?: string; code?: string | null; label: string; kind?: string; instruction?: string | null; uncertain?: boolean };
const annexFields = (slug: FormSlug): MapField[] => {
  const a = ANNEX_CATALOG_2025.find(x => x.formId === MAP_FORM_BY_SLUG[slug].formId);
  return ((a?.fields ?? []) as AnnexField[]).map((f, n) => ({
    key: `${slug}.${n + 1}`, slug, formId: MAP_FORM_BY_SLUG[slug].formId, section: f.section ?? null, label: f.label, kind: f.kind,
    codes: f.code ? String(f.code).split('/').map(c => ({ code: c.trim(), role: 'form' as Role })) : [],
    instruction: f.instruction, documents: [], uncertain: f.uncertain,
  }));
};

/** «300 עד 340» ⇒ 300, 310 … 340 (הקודים ב-1219 הם כפולות של 10). «ד׳ 1» — אין קוד. */
export function wealthCodes(field: string): string[] {
  const m = field.match(/^(\d+)\s*עד\s*(\d+)$/);
  if (m) { const out: string[] = []; for (let c = +m[1]; c <= +m[2]; c += 10) out.push(String(c)); return out; }
  return /^\d+$/.test(field) ? [field] : [];
}
// ‼ 116ג (16.10): לא בקטלוג הנספחים — קטלוג משלו מהטופס עצמו (12.2023); הוראה רק היכן שהמחקר מכסה (דמי לידה ומילואים)
type Cat116 = { section: string; label: string; kind: string; instruction: string | null; status?: ClaimStatus };
const fields116c: MapField[] = (cat116c as unknown as { fields: Cat116[] }).fields.map((f, n) => ({
  key: `116c.${n + 1}`, slug: '116c' as const, formId: '116ג', section: f.section, label: f.label, kind: f.kind, codes: [], instruction: f.instruction, documents: [], claim: f.status,
}));
const wealthFields: MapField[] = WEALTH_PARTS.flatMap(p => p.rows.map((r, n) => ({
  key: `1219.${p.id}.${n + 1}`, slug: '1219' as const, formId: '1219', part: p.title, section: r.field, label: r.title,
  codes: wealthCodes(r.field).map(code => ({ code, role: 'form' as Role })), instruction: r.record, documents: r.doc ? [r.doc] : [], wealth: r,
})));

const FIELDS: Record<FormSlug, MapField[]> = Object.fromEntries(MAP_FORMS.map(f => [f.slug,
  f.slug === '1301' ? catalogFields : f.slug === '1219' ? wealthFields : f.slug === '116c' ? fields116c : annexFields(f.slug)])) as Record<FormSlug, MapField[]>;
export const fieldsOf = (slug: FormSlug) => FIELDS[slug];

// ── סימונים על עמוד ─────────────────────────────────────────────────────────
/** code ריק — סימון לפי תווית (שדה בלי קוד מודפס). */
export interface Marker { id: string; slug: FormSlug; page: number; code: string; box: Box; how: Anchor['how'] | LabelAnchor['how']; byLabel?: boolean; fields: { field: MapField; role: Role }[] }

/** תפקיד לפי מילות התווית — לשדות בלי קוד (פרטי «בן הזוג הרשום» / «בן/בת הזוג»). */
const roleOfLabel = (f: MapField): Role => (/בן הזוג הרשום|בן זוג רשום/.test(f.label) ? 'registered' : /בן\/בת הזוג/.test(f.label) && !/^הדוח|הכנסותי|זוגי/.test(f.label) ? 'spouse' : 'form');

export function markersOf(slug: FormSlug): Marker[] {
  const L = LAYOUTS[slug];
  const byCode: Marker[] = L.anchors.map((a, n) => ({
    id: `${slug}-${a.page}-${a.code}-${n}`, slug, page: a.page, code: a.code, box: a.box, how: a.how,
    fields: FIELDS[slug].flatMap(f => f.codes.filter(c => c.code === a.code).map(c => ({ field: f, role: c.role }))),
  }));
  // ‼ שני שדות על אותה תווית מודפסת (שורת «העיסוק העיקרי» לרשום ולבן/בת הזוג) — סימון אחד עם שני השדות
  const byKey = new Map(FIELDS[slug].map(f => [f.key, f]));
  const groups = new Map<string, LabelAnchor[]>();
  for (const a of L.labelAnchors ?? []) { const k = `${a.page}|${a.box.join(',')}`; groups.set(k, [...(groups.get(k) ?? []), a]); }
  const byLabel: Marker[] = [...groups.values()].map(g => ({
    id: `${slug}-${g[0].page}-L-${g[0].field}`, slug, page: g[0].page, code: '', box: g[0].box, how: g[0].how, byLabel: true,
    fields: g.flatMap(a => { const f = byKey.get(a.field); return f ? [{ field: f, role: roleOfLabel(f) }] : []; }),
  })).filter(m => m.fields.length);
  return [...byCode, ...byLabel];
}
export const markersOnPage = (slug: FormSlug, page: number) => markersOf(slug).filter(m => m.page === page);

export type UnplacedWhy = 'noCode' | 'notPrinted' | 'ambiguous' | 'noText';
export const UNPLACED_LABEL: Record<UnplacedWhy, string> = {
  noCode: 'בלי קוד מודפס, והתווית שלו לא נמצאה בטופס באופן חד-משמעי — לא מסומן (לא מסמנים בניחוש)',
  noText: 'הטופס הרשמי סרוק (בלי שכבת טקסט) — אי אפשר לאתר שדות; העמוד מוצג, השדות כאן',
  notPrinted: 'הקוד לא מודפס בטופס הרגיל (שדה שידור או משרד) — לא מסומן',
  ambiguous: 'הקוד מופיע בטופס יותר מפעם אחת ולא הוכרע — לא מסומן',
};
/** שדות שאין להם סימון — עם הסיבה. לא ממציאים מיקום. */
export function unplacedOf(slug: FormSlug): { field: MapField; why: UnplacedWhy }[] {
  const L = LAYOUTS[slug];
  const placed = new Set(L.anchors.map(a => a.code));
  const amb = new Set(L.ambiguous.map(a => a.code));
  const byLabel = new Set((L.labelAnchors ?? []).map(a => a.field));
  const scanned = L.pages.every(p => !p.textLayer);
  return FIELDS[slug].flatMap((f): { field: MapField; why: UnplacedWhy }[] => {
    if (byLabel.has(f.key)) return [];
    if (!f.codes.length) return [{ field: f, why: scanned ? 'noText' : 'noCode' }];
    if (f.codes.some(c => placed.has(c.code))) return [];
    return [{ field: f, why: f.codes.some(c => amb.has(c.code)) ? 'ambiguous' : 'notPrinted' }];
  });
}

// ── אתר שדה לפי קוד ─────────────────────────────────────────────────────────
export interface CodeHit { slug: FormSlug; formId: string; title: string; /** 1219 — לא טופס שנתי (הצהרה ליום מסוים) */ taxYear: number | null; code: string; role: Role; field: MapField; page?: number; markerId?: string }

/** כל ההתאמות — בכל הטפסים, לכל בני הזוג. «42» מוצא גם «042». לא בוחרים אחת בשקט. */
export function findByCode(q: string): CodeHit[] {
  const raw = q.trim().replace(/^0+(?=\d)/, '');
  if (!/^\d{1,3}$/.test(raw)) return [];
  const hits: CodeHit[] = [];
  for (const f of MAP_FORMS) {
    const marks = markersOf(f.slug);
    for (const field of FIELDS[f.slug]) for (const c of field.codes) {
      if (c.code.replace(/^0+(?=\d)/, '') !== raw) continue;
      const m = marks.find(x => x.code === c.code);
      hits.push({ slug: f.slug, formId: f.formId, title: LAYOUTS[f.slug].title, taxYear: f.slug === '1219' ? null : LAYOUTS[f.slug].taxYear, code: c.code, role: c.role, field, page: m?.page, markerId: m?.id });
    }
  }
  return hits;
}

/**
 * ‼ חיפוש אחד לכל המקומות (מפת הטופס ו«איתור שדה» בנושא הדוח השנתי): קוד ⇐ findByCode; מילים ⇐ כל המילים בשם השדה או בהוראה,
 * בכל הטפסים. שדה בלי קוד מוחזר עם code ריק. לא בוחרים אחת בשקט.
 */
export function findFields(q: string, limit = 40): CodeHit[] {
  const t = q.trim();
  if (!t) return [];
  if (/^\d{1,3}$/.test(t)) return findByCode(t);
  const words = t.split(/\s+/).filter(w => w.length >= 2);
  if (!words.length) return [];
  const hits: CodeHit[] = [];
  for (const f of MAP_FORMS) {
    const marks = markersOf(f.slug);
    for (const field of FIELDS[f.slug]) {
      const hay = `${field.label} ${field.instruction ?? ''}`;
      if (!words.every(w => hay.includes(w))) continue;
      const m = marks.find(x => x.fields.some(y => y.field.key === field.key));
      const c = field.codes[0];
      hits.push({ slug: f.slug, formId: f.formId, title: LAYOUTS[f.slug].title, taxYear: f.slug === '1219' ? null : LAYOUTS[f.slug].taxYear,
        code: c?.code ?? '', role: c?.role ?? 'form', field, page: m?.page, markerId: m?.id });
      if (hits.length >= limit) return hits;
    }
  }
  return hits;
}

// ── מאיפה המידע מגיע ────────────────────────────────────────────────────────
/** שם המסמך במילים: «106» ⇒ «טופס 106». */
export const docLabel = (d: string) => (/^\d/.test(d) ? `טופס ${d}` : d);

const DOC_KIND_OF: Record<string, DocKind> = {
  '106': 'form106', '867': 'form867', '867א': 'form867', '867ב': 'form867', '867ו': 'form867',
  'אישור קופה': 'fundAnnualCert', 'אישור שנתי קופת גמל': 'fundAnnualCert', 'אישור שנתי קרן השתלמות': 'fundAnnualCert',
  'אישור ביטוח לאומי': 'niAnnualCert', 'אישור שנתי ביטוח לאומי': 'niAnnualCert',
  '1320': 'annualPnl', 'דוח רווח והפסד': 'annualPnl', 'קבלות תרומה': 'donationReceipts', 'ריכוז תרומות': 'donationReceipts',
  'שומת מס שבח': 'shevachAssessment', '1324': 'foreignStatement', '119': 'degreeCert', 'אישור סיום לימודים': 'degreeCert',
  'אישור חברת ביטוח': 'insuranceCert',
};

export interface FieldSources {
  documents: { label: string; known: boolean }[];
  /** שאלות בשאלון שמכסות את השדה: לפי המסמך (חזק) ואז לפי החלק בטופס / הנספח. */
  questions: { item: InfoItem; area: string; strong: boolean }[];
  file?: { state: FileState; label: string; note: string; keys: string[] };
  annexInfo?: { label: string; source: string; note: string }[];
  draft?: string;
}

const ANNUAL_ITEMS = ITEMS.filter(i => i.purposes.includes('annual'));
/** פריטי קליטה שאין להם cardKeys אבל הם כותבים לאותו נתון בכרטיס (עסק חדש ⇐ businesses). */
const INTAKE_CARD_ALIAS: Record<string, string[]> = { 'intake.businessDetails': ['businesses', 'businessName', 'businessDescription'] };
const INTAKE_KEYS = new Set(INTAKE_ITEMS.map(i => i.key));
const COVERAGE = new Map<string, CoverageRow>(coverage1301().map(r => [r.entry.id, r]));
export const coverageOf = (key: string) => COVERAGE.get(key);

function wealthAreasOf(f: MapField): string[] {
  const code = +(f.codes[0]?.code ?? NaN);
  if (f.section?.startsWith('ד׳')) return ['wPartD'];
  if (Number.isFinite(code) && code >= 300) return ['wBusiness'];
  if (Number.isFinite(code)) {
    const sec = code / 10;
    return WEALTH_AREAS.filter(a => {
      const t = a.form1219 ?? '';
      if (!t.startsWith('חלק א׳')) return false;
      const r = t.match(/סעיפים (\d+) עד (\d+)/); if (r) return sec >= +r[1] && sec <= +r[2];
      const one = t.match(/סעיף (\d+)/); return !!one && +one[1] === sec;
    }).map(a => a.id);
  }
  return [];
}

export function sourcesOf(f: MapField): FieldSources {
  const docKinds = new Set(f.documents.map(d => DOC_KIND_OF[d]).filter(Boolean));
  const documents = f.documents.map(d => ({ label: DOC_KIND_OF[d] ? DOCS[DOC_KIND_OF[d]].label : docLabel(d), known: !!DOC_KIND_OF[d] }));
  let pool: { item: InfoItem; strong: boolean }[] = [];
  if (f.slug === '1301') {
    // ‼ קשר חזק: אותו מסמך, או שהשאלה מאשרת את אותו נתון בכרטיס שמפת הכיסוי קושרת לשדה. השאר — «באותו חלק בדוח».
    const fileKeys = new Set(COVERAGE.get(f.key)?.fileKeys ?? []);
    //   שאלת פתיחה («עבדת כשכיר?») עונה רק על שדה כן/לא; לשדה סכום — שאלת הסכום באותו תחום (‎salary.amounts‎ ⇐ 158).
    const inPart = ANNUAL_ITEMS.filter(i => f.part && i.covers?.parts?.includes(f.part));
    const base = (i: InfoItem) => (!!i.docKind && docKinds.has(i.docKind)) || (i.cardKeys ?? []).some(k => fileKeys.has(k));
    const choice = f.kind === 'checkbox' || f.kind === 'yesno' || f.kind === 'code';
    const amountField = f.kind === 'amount' || f.kind === 'count' || f.kind === 'percent';
    const areas = new Set(inPart.filter(base).map(i => i.area));
    pool = inPart.map(i => ({ item: i, strong: (base(i) && (choice || i.kind !== 'screener')) || (amountField && i.kind === 'amount' && areas.has(i.area)) }));
    // ‼ פרטים קבועים (חלק ב: חשבון בנק, מצב משפחתי, כתובת, עסק, מעבידים) נאספים בשאלון הקליטה — קשר לפי אותו נתון בכרטיס
    if (fileKeys.size) for (const i of INTAKE_ITEMS) if ([...(i.cardKeys ?? []), ...(INTAKE_CARD_ALIAS[i.key] ?? [])].some(k => fileKeys.has(k)) && i.kind !== 'screener') pool.push({ item: i, strong: true });
  } else if (f.slug === '1219') {
    const areas = new Set(wealthAreasOf(f));
    pool = WEALTH_ITEMS.filter(i => areas.has(i.area)).map(i => ({ item: i, strong: true }));
  } else {
    const areas = new Set(AREAS.filter(a => a.annexes.includes(f.formId)).map(a => a.id));
    pool = ANNUAL_ITEMS.filter(i => areas.has(i.area) || i.covers?.annexItems?.some(k => k.startsWith(`${f.formId}.`)))
      .map(i => ({ item: i, strong: !!i.covers?.annexItems?.some(k => k.startsWith(`${f.formId}.`)) }));
  }
  const areaTitle = (i: InfoItem) => (AREA_BY_ID[i.area] ?? WEALTH_AREAS.find(a => a.id === i.area) ?? INTAKE_AREAS.find(a => a.id === i.area))?.title ?? '';
  const questions = [...pool.filter(p => p.strong), ...pool.filter(p => !p.strong)].map(p => ({ ...p, area: areaTitle(p.item) }));
  const out: FieldSources = { documents, questions };
  if (f.slug === '1301') {
    const cov = COVERAGE.get(f.key);
    if (cov) out.file = { state: cov.file, label: FILE_LABEL[cov.file], note: cov.fileNote, keys: cov.fileKeys };
    const d = f.codes.map(c => DRAFT_FILL_1301[c.code]).find(Boolean) ?? DRAFT_FILL_1301[f.key];
    if (d) out.draft = d;
  } else if (f.slug !== '1219') {
    const info = ANNEX_INFO_2025.find(a => a.formId === f.formId);
    const code = f.codes[0]?.code;
    const hit = (it: AnnexInfoItem) => it.annexFields.some(x => x === f.label || (code && x.startsWith(`[${code}]`)));
    const items = info?.items.filter(hit) ?? [];
    if (items.length) out.annexInfo = items.map(it => ({ label: it.label, source: SOURCE_LABEL_HE[it.source], note: it.note }));
  }
  return out;
}

// ── הסבר קצר ────────────────────────────────────────────────────────────────
const MAPPED_BY_CODE = new Map<string, FormField>();
for (const m of FIELDS_1301_2025) for (const c of [m.codes.registered, m.codes.spouse]) if (c) MAPPED_BY_CODE.set(c, m);
export const mappedFieldOf = (f: MapField) => (f.slug === '1301' ? f.codes.map(c => MAPPED_BY_CODE.get(c.code)).find(Boolean) : undefined);

export interface Explain { what: string | null; meaning: string | null; check: string | null; mistake?: string; status?: ClaimStatus }
/** «מה ממלאים» מהקטלוג/מהמדריך; «מה זה אומר» מהשדה הממופה; לבדיקה — מהמדריך ל-1219. ריק = «טרם נכתב». */
export function explainOf(f: MapField): Explain {
  if (f.wealth) return { what: f.wealth.record, meaning: null, check: f.wealth.check && f.wealth.check !== '—' ? f.wealth.check : null, mistake: f.wealth.mistake, status: f.wealth.status };
  const m = mappedFieldOf(f);
  return { what: f.instruction ?? null, meaning: m?.meaning ?? null, check: m?.fillCheck ?? null, status: f.claim };
}

// ── טופס קשור (16.10: דמי לידה) ─────────────────────────────────────────────
/** שדות 1301 שבהם הפריסה רלוונטית: סימון «מבקש/ת פריסת דמי לידה» (F026), 250/270 (עצמאית), 194/196 (שכירה, לא ב-106), 040/042 (המס שנוכה). */
const MATERNITY_CODES = new Set(['250', '270', '194', '196', '040', '042']);
const isMaternityField = (f: MapField) => f.slug === '1301' && (f.key === 'F026' || f.codes.some(c => MATERNITY_CODES.has(c.code)));
export function relatedFormsOf(f: MapField): { slug: FormSlug; label: string; why: string }[] {
  return isMaternityField(f) ? [{ slug: '116c', label: '116ג — בקשה לפריסה', why: 'כשדמי לידה מתפרסים לשנה הקודמת או העוקבת' }] : [];
}

// ── ללמוד לעומק ─────────────────────────────────────────────────────────────
const codesIn = (s: string) => s.match(/\d{3}/g) ?? [];
/** הנושא שמסביר את השדה: לפי קוד (מהנושא עצמו), אחר כך לפי החלק בדוח, ובסוף — הכנת הדוח / הצהרת הון. */
export function learnTopicsOf(f: MapField): { id: string; title: string; how: 'code' | 'part' | 'default' }[] {
  const avail = TOPICS.filter(t => t.status !== undefined);
  if (f.slug === '1219') return avail.filter(t => t.id === 'wealth').map(t => ({ id: t.id, title: t.title, how: 'default' as const }));
  // ‼ 16.10: 116ג וסימון הפריסה ב-1301 ⇐ נושא דמי הלידה (לפני ההתאמה לפי קוד, שמחזירה גם נושאים כלליים)
  if (f.slug === '116c' || f.key === 'F026') return avail.filter(t => t.id === 'maternity').map(t => ({ id: t.id, title: t.title, how: 'default' as const }));
  if (f.slug === '1301') {
    const codes = new Set(f.codes.map(c => c.code));
    const byCode = avail.filter(t => t.form1301.some(r => codesIn(r.fields).some(c => codes.has(c))));
    if (byCode.length) return byCode.map(t => ({ id: t.id, title: t.title, how: 'code' as const }));
    const byPart = avail.filter(t => t.form1301.some(r => r.part === f.part));
    if (byPart.length) return byPart.map(t => ({ id: t.id, title: t.title, how: 'part' as const }));
  }
  return avail.filter(t => t.id === 'annualReturn').map(t => ({ id: t.id, title: t.title, how: 'default' as const }));
}

// ── מצב השדה אצל לקוח ───────────────────────────────────────────────────────
// ‼ 16.10 (סבב 2): «אושר במשרד» (עובדה לשנה שהמשרד אישר — tax_year_facts accepted) ≠ «התקבלה תשובה מהלקוח» (pending,
//   ממתינה לבדיקה) ≠ «לאישור» (יש נתון בכרטיס — מצב עדכני, לא לשנת המס). שלושה צבעים ושלוש תוויות.
export type ClientFieldState = 'approved' | 'answered' | 'known' | 'verify' | 'missing' | 'office' | 'na' | 'unknown';
export const CLIENT_STATE_LABEL: Record<ClientFieldState, string> = {
  approved: 'אושר במשרד', answered: 'התקבלה תשובה מהלקוח', known: 'ידוע', verify: 'לאישור (מהכרטיס)', missing: 'חסר', office: 'במשרד, בהגשה', na: 'לא חל', unknown: 'לא ידוע אם חל',
};
/** השאלות בשאלון שהתשובה עליהן היא התשובה לשדה (רק הקשר החזק). */
export const answerItemsOf = (f: MapField): string[] => sourcesOf(f).questions.filter(q => q.strong).map(q => q.item.key);
const READINESS_TO_STATE: Record<ReadinessStatus, ClientFieldState> = { ready: 'known', verify: 'verify', missing: 'missing', notApplicable: 'na', unknownApplicability: 'unknown' };
const hasValue = (v: unknown) => !(v === undefined || v === null || v === '' || (Array.isArray(v) && v.length === 0));

/**
 * מצב השדה מול כרטיס הלקוח. ‼ הכרטיס מחזיק מצב עדכני, לא תשובות לשנת המס — לכן ערך מהכרטיס הוא «לאישור», לא «ידוע».
 * שדה ממופה — לפי fieldReadiness (אותו מנוע כמו «מוכנות לקוח»); אחר — לפי מפת הכיסוי ומה שיש בפועל בכרטיס.
 */
export function clientStateOf(f: MapField, client: Client, facts: readonly YearFact[] = [], taxYear = 2025, role?: Role): { state: ClientFieldState; reason: string } {
  const keys = new Set(answerItemsOf(f));
  const subj = role === 'registered' ? 'client' : role === 'spouse' ? 'spouse' : undefined;
  // ‼ פריט קליטה הוא פרט קבוע «נכון ליום» — לא לשנת מס מסוימת; נספר בכל שנה
  const mine = facts.filter(x => keys.has(x.itemKey) && (f.slug === '1219' || INTAKE_KEYS.has(x.itemKey) || x.taxYear === taxYear) && (!subj || x.subjectRole === subj || x.subjectRole === 'couple'));
  const label = (x: YearFact) => sourcesOf(f).questions.find(q => q.item.key === x.itemKey)?.item.label ?? x.itemKey;
  const ok = mine.filter(x => x.status === 'accepted');
  if (ok.length) return { state: 'approved', reason: `${ok[0].decidedAt ? `ב-${ok[0].decidedAt.slice(0, 10).split('-').reverse().join('.')}: ` : ''}${[...new Set(ok.map(label))].join(', ')}.` };
  const pend = mine.filter(x => x.status === 'pending');
  if (pend.length) return { state: 'answered', reason: `התקבלה תשובה מהלקוח — ממתינה לבדיקת המשרד: ${[...new Set(pend.map(label))].join(', ')}.` };
  if (f.slug === '1219') return { state: 'missing', reason: 'אין עדיין תשובה מאושרת בשאלון ההון.' };
  if (f.slug !== '1301') return { state: 'unknown', reason: 'אין תשובה בשאלון לשדה הזה; מצב מהכרטיס מוצג רק לשדות 1301.' };
  const m = mappedFieldOf(f);
  if (m) {
    const r = fieldReadiness(m, { facts: client as unknown as Record<string, unknown>, fieldMeta: client.fieldMeta as never, taxYear }, []);
    return { state: READINESS_TO_STATE[r.status], reason: r.reason };
  }
  const cov = COVERAGE.get(f.key);
  if (!cov) return { state: 'unknown', reason: 'לא סווג.' };
  if (cov.file === 'office') return { state: 'office', reason: cov.fileNote || 'ממולא בהגשה.' };
  if (cov.file === 'notChecked') return { state: 'unknown', reason: cov.fileNote };
  const card = client as unknown as Record<string, unknown>;
  const present = cov.fileKeys.filter(k => hasValue(card[k]));
  if (present.length && (cov.file === 'inFile' || cov.file === 'partialInFile')) {
    return { state: 'verify', reason: `בכרטיס: ${present.join(', ')}${cov.fileNote ? ` — ${cov.fileNote}` : ''}. לאמת לשנת ${taxYear}.` };
  }
  return { state: 'missing', reason: cov.fileNote || 'אין בתיק — מסמך או תשובת הלקוח.' };
}

/** סיכום לכל הטופס אצל הלקוח — לשורת המצב. */
export function clientSummary(slug: FormSlug, client: Client, facts: readonly YearFact[] = []): Partial<Record<ClientFieldState, number>> {
  const out: Partial<Record<ClientFieldState, number>> = {};
  for (const f of FIELDS[slug]) { const s = clientStateOf(f, client, facts).state; out[s] = (out[s] ?? 0) + 1; }
  return out;
}

// ─── בדיקת המשרד: קיבוץ התשובות הממתינות ─────────────────────────────────────
// ‼ «הלקוח אישר שאין שינוי» אינו אישור מקצועי: הוא ממתין כמו כל תשובה, אבל
// מקובץ לאישור מרוכז עם פירוט נגיש (החלטת גיא 11.10.2026). סכומים, שינויים
// וסתירות — כל אחד בנפרד.
// ‼ סתירה בין שני המסלולים (שאלון ישן ודף אישי) לא נפתרת בשקט: שתי התשובות
// נשמרות והמשרד מכריע. אין דריסה.

import { AREA_BY_ID, ITEM_BY_KEY } from './catalog';
import type { Evidence, YearFact } from './types';
import { RECORD_OF } from './structured';
import { recordLines, schemaFor } from './records';
import { recordItems } from './recordToCard';

export interface ReviewRow {
  fact: YearFact;
  label: string;
  areaTitle: string;
  /** מה הלקוח ענה, בעברית. */
  answerText: string;
  /** מה ידוע היום (עובדה מאושרת או הכרטיס) — כשיש. */
  knownText?: string;
  conflict?: string;
}

export interface ReviewGroups {
  /** אישור מרוכז: «הלקוח אישר שאין שינוי». */
  unchanged: ReviewRow[];
  /** אישור מרוכז: «לא» בלי סתירה (אין בתחום) — עם פירוט. */
  negatives: ReviewRow[];
  /** אחד אחד: שינויים, סכומים, «כן» שפותח פירוט, וסתירות. */
  individual: ReviewRow[];
  /** תשובות מהשאלון הקודם. */
  legacy: ReviewRow[];
  /** מסמכים שהתקבלו וטרם נבדקו. */
  documents: Evidence[];
}

const money = (n: number) => `${n.toLocaleString('he-IL')} ₪`;

/** שמות רכיבים בסכום מפורט (ברוטו / מס שנוכה…) — להצגה למשרד. */
const PART_HE: Record<string, string> = { gross: 'ברוטו', withheld: 'מס שנוכה', profit: 'רווח', turnover: 'מחזור', customerWithholding: 'ניכוי מלקוחות',
  interest: 'ריבית', dividend: 'דיבידנד', gains: 'רווח הון', pension: 'פנסיה', studyFund: 'קרן השתלמות', life: 'ביטוח חיים' };

export function describeValue(f: Pick<YearFact, 'answer' | 'value'> & { itemKey?: string }): string {
  // ‼ 13.10.2026 · תשובה מובנית (ילדים, בנק, כתובת, תחולה…) — בשורות קריאות, לא כאובייקט
  const sid = f.itemKey ? RECORD_OF[f.itemKey] : undefined;
  if (sid && f.answer !== 'no' && f.value && typeof f.value === 'object') {
    const items = sid === 'period' && !recordItems(f.value) ? [f.value as Record<string, unknown>] : recordItems(f.value);
    if (items) {
      const text = recordLines(schemaFor(sid), items).join(' · ') || '—';
      return (f.value as { changed?: boolean }).changed ? `השתנה: ${text}` : text;
    }
  }
  if (f.answer === 'no') return 'לא';
  if (f.answer === 'zero') return '0 ₪';
  if (f.answer === 'not_applicable') return 'לא רלוונטי';
  const v = f.value as unknown;
  if (v === true) return 'כן';
  if (v === false) return 'לא';
  if (typeof v === 'number') return money(v);
  if (typeof v === 'string') return v;
  if (v && typeof v === 'object') {
    const o = v as Record<string, unknown>;
    if (o.unchanged) return 'אין שינוי';
    if (o.changed) return `השתנה: ${String(o.note ?? '')}`;
    if (o.yes) return `כן — ${String(o.note ?? '')}`;
    return Object.entries(o).filter(([k]) => k !== 'fromLegacy').map(([k, x]) => `${PART_HE[k] ? `${PART_HE[k]} ` : ''}${typeof x === 'number' ? money(x) : typeof x === 'boolean' ? (x ? 'כן' : 'לא') : String(x)}`).join(' · ') || 'כן';
  }
  return '—';
}

const identity = (f: YearFact) => [f.itemKey, f.subjectRole, f.entityRef ?? ''].join('|');

export function groupForReview(facts: YearFact[], evidence: Evidence[]): ReviewGroups {
  const pending = facts.filter(f => f.status === 'pending');
  const accepted = facts.filter(f => f.status === 'accepted');
  const rows = pending.map((f): ReviewRow => {
    const item = ITEM_BY_KEY[f.itemKey];
    const prev = accepted.filter(a => identity(a) === identity(f)).sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
    const twin = pending.find(o => o.id !== f.id && identity(o) === identity(f) && o.source !== f.source && describeValue(o) !== describeValue(f));
    let conflict: string | undefined;
    if (f.clientAssertion === 'changed') conflict = 'הלקוח דיווח על שינוי ממה שידוע';
    else if (prev && f.clientAssertion !== 'unchanged' && describeValue(prev) !== describeValue(f)) conflict = `שונה ממה שאושר (${describeValue(prev)})`;
    else if (twin) conflict = `תשובה אחרת ממסלול נוסף: ${describeValue(twin)} (${twin.source === 'legacy_questionnaire' ? 'שאלון קודם' : 'דף אישי'})`;
    return {
      fact: f,
      label: item?.label ?? f.itemKey,
      areaTitle: item ? AREA_BY_ID[item.area].title : '',
      answerText: describeValue(f),
      knownText: prev ? describeValue(prev) : f.clientAssertion === 'unchanged' && f.value && typeof f.value === 'object' ? ((f.value as { lines?: string[] }).lines ?? []).join(' · ') : undefined,
      conflict,
    };
  });
  return {
    unchanged: rows.filter(r => r.fact.clientAssertion === 'unchanged' && !r.conflict),
    negatives: rows.filter(r => r.fact.answer === 'no' && !r.conflict && r.fact.source !== 'legacy_questionnaire'),
    individual: rows.filter(r => r.fact.source !== 'legacy_questionnaire' && (r.fact.clientAssertion !== 'unchanged' || r.conflict) && !(r.fact.answer === 'no' && !r.conflict)),
    legacy: rows.filter(r => r.fact.source === 'legacy_questionnaire' && r.fact.clientAssertion !== 'unchanged'),
    documents: evidence.filter(e => e.review === 'needs_review'),
  };
}

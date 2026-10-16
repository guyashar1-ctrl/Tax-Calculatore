// ─── טפסי מס — השוואת גרסאות, מוכנות שדה ובקשות ממוקדות ───────────────────
// ‼ שלושה עקרונות:
//   1. לא ממציאים תשובה. «לא» / 0 בכרטיס בלי מקור מתועד הם «לא ידוע» (לקוח חדש
//      נולד עם false) — לא «אין».
//   2. לא מבקשים שוב מידע תקף שכבר קיים: תשובה לאותה שנה, על שדה שמשמעותו לא
//      השתנתה, היא «מוכן» גם אם מספר השדה זז.
//   3. שינוי בטופס מייצר בקשה ממוקדת לשדה שהשתנה — והתשובה הקודמת נשמרת לצדה.

import type {
  AnnexChange, AnnexRule, FieldAnswer, FieldChange, FieldContext, FieldReadiness, FormField, FormFollowUp, Tri,
} from './types';

const codesText = (f: FormField) => [f.codes.registered, f.codes.spouse].filter(Boolean).join('/') || '—';

/** מה השתנה בין שתי גרסאות של טופס, לפי מפתח סמנטי. */
export function diffFormVersions(prev: readonly FormField[], next: readonly FormField[]): FieldChange[] {
  const out: FieldChange[] = [];
  const before = new Map(prev.map(f => [f.key, f]));
  const after = new Map(next.map(f => [f.key, f]));
  for (const [key, b] of before) if (!after.has(key)) out.push({ kind: 'removed', fieldKey: key, label: b.label, before: codesText(b) });
  for (const [key, a] of after) {
    const b = before.get(key);
    if (!b) { out.push({ kind: 'added', fieldKey: key, label: a.label, after: codesText(a) }); continue; }
    if (codesText(a) !== codesText(b)) out.push({ kind: 'codeChanged', fieldKey: key, label: a.label, before: codesText(b), after: codesText(a) });
    if (a.section !== b.section) out.push({ kind: 'sectionChanged', fieldKey: key, label: a.label, before: `סעיף ${b.section}`, after: `סעיף ${a.section}` });
    if (a.kind !== b.kind) out.push({ kind: 'kindChanged', fieldKey: key, label: a.label, before: b.kind, after: a.kind });
    if (a.meaning !== b.meaning) out.push({ kind: 'meaningChanged', fieldKey: key, label: a.label, before: b.meaning, after: a.meaning });
    if (a.relevantWhen !== b.relevantWhen) out.push({ kind: 'conditionChanged', fieldKey: key, label: a.label, before: b.relevantWhen, after: a.relevantWhen });
    const calc = (f: FormField) => f.calculation ? `${f.calculation.ruleIds.join(',')} · ${f.calculation.description}` : '';
    if (calc(a) !== calc(b)) out.push({ kind: 'calculationChanged', fieldKey: key, label: a.label, before: calc(b), after: calc(a) });
    const ev = (f: FormField) => (f.evidence ?? []).join(' · ');
    if (ev(a) !== ev(b)) out.push({ kind: 'evidenceChanged', fieldKey: key, label: a.label, before: ev(b), after: ev(a) });
  }
  return out;
}

export function diffAnnexes(prev: readonly AnnexRule[], next: readonly AnnexRule[]): AnnexChange[] {
  const out: AnnexChange[] = [];
  const b = new Map(prev.map(a => [a.formId, a]));
  const a = new Map(next.map(x => [x.formId, x]));
  for (const [id, x] of b) if (!a.has(id)) out.push({ kind: 'removed', formId: id, title: x.title });
  for (const [id, x] of a) {
    const y = b.get(id);
    if (!y) out.push({ kind: 'added', formId: id, title: x.title, after: x.requiredWhen });
    else if (y.requiredWhen !== x.requiredWhen) out.push({ kind: 'conditionChanged', formId: id, title: x.title, before: y.requiredWhen, after: x.requiredWhen });
  }
  return out;
}

/** שינוי שמחייב לבדוק תשובה קיימת (ולא רק לעדכן את המיפוי). */
const SUBSTANTIVE = new Set<FieldChange['kind']>(['kindChanged', 'meaningChanged', 'conditionChanged', 'calculationChanged', 'evidenceChanged']);

function latestAnswer(answers: readonly FieldAnswer[], key: string, taxYear: number): FieldAnswer | undefined {
  return answers.filter(a => a.fieldKey === key && a.taxYear === taxYear && a.state.kind !== 'missing')
    .sort((x, y) => y.answeredAt.localeCompare(x.answeredAt))[0];
}

/**
 * נתון בתיק כנקודת התחלה. ‼ false/0 בלי מקור מתועד = לא ידוע.
 * מחזיר undefined כשאין בו שימוש.
 */
function factHint(field: FormField, ctx: FieldContext): { text: string; documented: boolean } | undefined {
  if (!field.fact) return undefined;
  const v = ctx.facts[field.fact.key];
  const meta = ctx.fieldMeta?.[field.fact.key];
  const documented = !!meta?.source;
  if (v === undefined || v === null || v === '') return undefined;
  if ((v === false || v === 0) && !documented) return undefined;
  // ‼ 16.10: רשימה (מעבידים, ילדים) הוצגה «[object Object]» — מציגים כמה רשומות יש בכרטיס
  if (Array.isArray(v) && v.length === 0) return undefined;
  const text = Array.isArray(v) ? (v.length === 1 ? 'רשומה אחת' : `${v.length} רשומות`)
    : typeof v === 'boolean' ? (v ? 'כן' : 'לא') : typeof v === 'number' ? v.toLocaleString('he-IL') : typeof v === 'object' ? 'יש נתון' : String(v);
  return { text, documented };
}

const askWho = (f: FormField): 'client' | 'office' | 'document' =>
  f.sources.includes('document') ? 'document' : f.sources.includes('client') ? 'client' : 'office';

/**
 * מוכנות שדה אחד לשנת מס מול התיק והתשובות הקיימות.
 * @param definitionsByVersion — הגדרות השדה בגרסאות קודמות (לזיהוי שינוי משמעות).
 */
export function fieldReadiness(
  field: FormField, ctx: FieldContext, answers: readonly FieldAnswer[],
  definitionsByVersion: Readonly<Record<string, readonly FormField[]>> = {},
): FieldReadiness {
  const rel: Tri = field.relevance?.(ctx) ?? 'unknown';
  const answer = latestAnswer(answers, field.key, ctx.taxYear);
  // ‼ שדה שמשמעותו לא אומתה מול הטופס לא «מוכן» לעולם — גם כשיש תשובה.
  if (field.basis === 'unverified' || field.basis === 'secondary') {
    return { fieldKey: field.key, status: 'verify', reason: 'משמעות השדה בגרסה הזו לא אומתה מול הטופס — לא ממלאים עד שתאומת.', ask: { who: 'office', what: `לאמת את ${field.label} מול ${field.formVersionId}` }, answer };
  }

  if (answer) {
    if (answer.state.kind === 'notApplicable' && rel === 'yes') {
      return { fieldKey: field.key, status: 'verify', reason: `נרשם «לא רלוונטי» (${answer.state.reason}), אבל לפי התיק הסעיף חל — להכריע.`, ask: { who: 'office', what: field.relevantWhen }, answer };
    }
    if (answer.formVersionId !== field.formVersionId) {
      const prevDef = definitionsByVersion[answer.formVersionId]?.find(f => f.key === field.key);
      const changes = prevDef ? diffFormVersions([prevDef], [field]).filter(c => SUBSTANTIVE.has(c.kind)) : [];
      if (!prevDef) return { fieldKey: field.key, status: 'verify', reason: `התשובה ניתנה מול גרסה ${answer.formVersionId} שההגדרה שלה לא שמורה — לאמת מול ${field.formVersionId}.`, ask: { who: 'office', what: field.label }, answer };
      if (changes.length) return { fieldKey: field.key, status: 'verify', reason: `הטופס השתנה מאז התשובה (${changes.map(c => CHANGE_LABEL[c.kind]).join(', ')}) — התשובה הקודמת נשמרת; לאמת אותה.`, ask: { who: askWho(field), what: field.label }, answer };
    }
    return { fieldKey: field.key, status: answer.state.kind === 'notApplicable' ? 'notApplicable' : 'ready', reason: `${answer.sourceLabel} · ${answer.answeredAt}`, answer };
  }

  if (rel === 'no') return { fieldKey: field.key, status: 'notApplicable', reason: `לפי התיק לא חל: ${field.relevantWhen}` };
  if (rel === 'unknown') return { fieldKey: field.key, status: 'unknownApplicability', reason: `לא ידוע אם חל: ${field.relevantWhen}`, ask: { who: field.sources.includes('client') ? 'client' : 'office', what: field.relevantWhen } };

  const hint = factHint(field, ctx);
  if (hint) {
    const period = field.fact!.scope === 'taxYear' ? `לשנת ${ctx.taxYear}` : 'נתון עדכני בכרטיס, לא של שנה מסוימת';
    return { fieldKey: field.key, status: 'verify', reason: `${field.fact!.label}: ${hint.text} (${period}${hint.documented ? '' : ', בלי מקור מתועד'}) — לאמת ${field.evidence?.length ? `מול ${field.evidence.join(' / ')}` : `לשנת ${ctx.taxYear}`}.`, ask: { who: askWho(field), what: field.label } };
  }
  return { fieldKey: field.key, status: 'missing', reason: 'חל ואין מידע בתיק.', ask: { who: askWho(field), what: field.evidence?.length ? `${field.label} — ${field.evidence.join(' / ')}` : field.label } };
}

export const CHANGE_LABEL: Record<FieldChange['kind'], string> = {
  added: 'שדה חדש', removed: 'שדה הוסר', codeChanged: 'מספר השדה השתנה', sectionChanged: 'מספר הסעיף השתנה', kindChanged: 'סוג השדה השתנה',
  meaningChanged: 'המשמעות השתנתה', conditionChanged: 'תנאי המילוי השתנה', calculationChanged: 'החישוב השתנה', evidenceChanged: 'האסמכתה השתנתה',
};

/**
 * מה עושים בתיק אחד אחרי שגרסה חדשה של הטופס נקראה.
 * ‼ שום תשובה לא נמחקת: שדה שהוסר — התשובה עוברת לארכיון; שינוי מהותי — בדיקה
 * של התשובה הקיימת; שינוי מספר בלבד — עדכון מיפוי, בלי לפנות ללקוח.
 */
export function followUpsForChange(
  changes: readonly FieldChange[], nextFields: readonly FormField[], ctx: FieldContext, answers: readonly FieldAnswer[],
): FormFollowUp[] {
  const out: FormFollowUp[] = [];
  const byKey = new Map(nextFields.map(f => [f.key, f]));
  const keys = [...new Set(changes.map(c => c.fieldKey))];
  for (const key of keys) {
    const kinds = changes.filter(c => c.fieldKey === key);
    const label = kinds[0].label;
    const kept = latestAnswer(answers, key, ctx.taxYear);
    if (kinds.some(c => c.kind === 'removed')) {
      if (kept) out.push({ fieldKey: key, label, kind: 'archiveAnswer', why: 'השדה הוסר מהטופס — התשובה נשמרת לתיעוד ולא תמולא.', keptAnswer: kept });
      continue;
    }
    const field = byKey.get(key);
    if (!field) continue;
    const substantive = kinds.filter(c => SUBSTANTIVE.has(c.kind));
    if (!substantive.length && kinds.every(c => c.kind === 'codeChanged' || c.kind === 'sectionChanged')) {
      out.push({ fieldKey: key, label, kind: 'mappingOnly', why: `${kinds.map(c => `${CHANGE_LABEL[c.kind]}: ${c.before} ← ${c.after}`).join('; ')}. אותה משמעות — אין פנייה ללקוח.`, keptAnswer: kept });
      continue;
    }
    if (kept && substantive.length) {
      out.push({ fieldKey: key, label, kind: 'verifyExisting', who: askWho(field), why: `${substantive.map(c => CHANGE_LABEL[c.kind]).join(', ')} — לבדוק את התשובה הקיימת מול ההגדרה החדשה.`, keptAnswer: kept });
      continue;
    }
    const r = fieldReadiness(field, ctx, answers);
    if (r.status === 'missing' || r.status === 'unknownApplicability' || r.status === 'verify') {
      out.push({ fieldKey: key, label, kind: 'ask', who: r.ask?.who ?? askWho(field), why: `${kinds.map(c => CHANGE_LABEL[c.kind]).join(', ')}: ${r.reason}` });
    }
  }
  return out;
}

export function annexReadiness(rules: readonly AnnexRule[], ctx: FieldContext): { rule: AnnexRule; required: Tri }[] {
  return rules.map(rule => ({ rule, required: rule.relevance?.(ctx) ?? 'unknown' }));
}

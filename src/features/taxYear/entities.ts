// ─── «של מי / איפה»: אימות ותצוגה של תשובה ברשימות סגורות (16.10.2026, «בקשה אחת לתיק המס» שלב 2) ──────
// ‼ טהור (בלי React): אותם כללים בדף האישי, במדמה ובבדיקות. השרת (253) מאמת שוב — «איפה» רק מתוך הרשימה.
// ‼ שם המעסיק/העסק (type 'name') הוא השדה החופשי היחיד; כל השאר — מפתח מרשימה או מבחירה.

import { INSTITUTION_LISTS, institutionLabel } from '../../data/institutions';
import type { EntityField, EntitySpec } from './types';

export type EntityItem = Record<string, string>;

export const WHO_OPTIONS = (names?: Record<string, string>) => [
  { value: 'client', label: names?.clientName || 'אני' },
  ...(names?.married ? [{ value: 'spouse', label: names.spouseName || 'בן/בת הזוג' }, { value: 'both', label: 'שנינו' }] : []),
];

/** השדות שמוצגים ללקוח הזה: «של מי» רק לזוג נשוי (ליחיד התשובה ידועה). */
export function visibleFields(spec: EntitySpec, names?: Record<string, string>): EntityField[] {
  return spec.fields.filter(f => f.type !== 'who' || !!names?.married);
}

export const NAME_MAX = 120;

/** שגיאה לכל שדה (ריק = תקין). `names.married` — האם «של מי» נדרש. */
export function validateEntity(spec: EntitySpec, item: EntityItem, names?: Record<string, string>): Record<string, string> {
  const err: Record<string, string> = {};
  for (const f of visibleFields(spec, names)) {
    const v = (item[f.key] ?? '').toString().trim();
    if (!v) { if (f.required) err[f.key] = 'חסר'; continue; }
    if (f.type === 'who' && !WHO_OPTIONS(names).some(o => o.value === v)) err[f.key] = 'לבחור מהרשימה';
    else if (f.type === 'list' && f.list && !INSTITUTION_LISTS[f.list].items.some(e => e.id === v)) err[f.key] = 'לבחור מהרשימה';
    else if (f.type === 'choice' && !(f.options ?? []).some(o => o.value === v)) err[f.key] = 'לבחור מהרשימה';
    else if (f.type === 'name' && v.length > NAME_MAX) err[f.key] = `עד ${NAME_MAX} תווים`;
  }
  return err;
}

export const entityValid = (spec: EntitySpec, items: EntityItem[], names?: Record<string, string>) =>
  items.length > 0 && items.every(i => Object.keys(validateEntity(spec, i, names)).length === 0);

/** ניקוי לפני שליחה: רק השדות שבמפרט, מקוצצים; «איפה» עם השם לצד המזהה (השרת כותב אותו שוב מהרשימה שלו). */
export function cleanEntity(spec: EntitySpec, item: EntityItem, names?: Record<string, string>): EntityItem {
  const out: EntityItem = {};
  for (const f of visibleFields(spec, names)) {
    const v = (item[f.key] ?? '').toString().trim();
    if (!v) continue;
    out[f.key] = f.type === 'name' ? v.slice(0, NAME_MAX) : v;
    if (f.type === 'list' && f.list) out[`${f.key}Label`] = institutionLabel(f.list, v);
  }
  return out;
}

const WHO_HE: Record<string, string> = { client: 'הלקוח', spouse: 'בן/בת הזוג', both: 'שניהם' };

/** שורה קריאה לכל פריט — למשרד («של רחל · בנק הפועלים»). `names` — שמות במקום תפקידים, כשיש. */
export function entityLines(spec: EntitySpec | undefined, items: EntityItem[], names?: Record<string, string>): string[] {
  return items.map(it => {
    const parts: string[] = [];
    const fields = spec?.fields ?? Object.keys(it).filter(k => !k.endsWith('Label')).map(k => ({ key: k, label: k, type: k === 'who' ? 'who' : k === 'where' ? 'list' : 'name' } as EntityField));
    for (const f of fields) {
      const v = it[f.key];
      if (!v) continue;
      if (f.type === 'who') parts.push(`של ${names?.[v === 'client' ? 'clientName' : v === 'spouse' ? 'spouseName' : ''] || WHO_HE[v] || v}`);
      else if (f.type === 'list') parts.push(it[`${f.key}Label`] || (f.list ? institutionLabel(f.list, v) : v));
      else if (f.type === 'choice') parts.push((f.options ?? []).find(o => o.value === v)?.label ?? v);
      else parts.push(v);
    }
    return parts.join(' · ');
  }).filter(Boolean);
}

/** האם ערך עובדה הוא תשובת «של מי / איפה» (ולא רשומה מובנית של records.ts). */
export const isEntityValue = (v: unknown): v is { items: EntityItem[] } =>
  !!v && typeof v === 'object' && Array.isArray((v as { items?: unknown }).items)
  && (v as { items: unknown[] }).items.every(x => !!x && typeof x === 'object' && Object.values(x as object).every(y => typeof y === 'string'))
  && (v as { items: Record<string, unknown>[] }).items.some(x => 'who' in x || 'where' in x || 'when' in x || 'keeper' in x);

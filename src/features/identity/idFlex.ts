// ─── צילום תעודה מזהה — העלאה גמישה: תיוג לכל תמונה, בדיקת שלמות, סדר העמודים (גיא, 16.10.2026) ──
// ‼ גיא (16.10): «לקוח שרוצה להעלות קדמי, אחורי וספח בתמונה אחת? או קדמי וספח יחד והאחורי בנפרד?»
//   לכן אין יותר שלוש תיבות קבועות (536e4c2). אזור העלאה אחד לכל אדם; אחרי כל תמונה — בחירה סגורה
//   מה היא (קדמי / אחורי / ספח / קדמי+ספח / הכול יחד), ברירת מחדל לפי הסדר, ובדיקה שהסט שלם
//   (קדמי + אחורי + ספח, בכל שילוב) לפני «אישור ושליחה». מה שחסר נאמר במפורש: «עוד חסר: אחורי, ספח».
// ‼ רישיון נהיגה — קדמי ואחורי (אין ספח); דרכון — עמוד התמונה בלבד, בלי תיוג.
// ‼ טהור — בלי React. אותם כללים בדפדפן ובבדיקות. ה-PDF נבנה פעם אחת באישור, לפי סדר העמודים כאן,
//   ומה כל עמוד נשמר כ«הרכב» (parts) ליד הרשומה — כדי שבמשרד יראו מה הגיע ואיך.

export type IdDocKind = 'idCard' | 'driverLicense' | 'passport' | 'idOrLicense';
/** איזה סט נדרש בפועל. idOrLicense מוכרע על ידי הלקוח בבחירה אחת (ברירת המחדל: תעודת זהות). */
export type IdSetKind = 'idCard' | 'driverLicense' | 'passport';
export type IdSide = 'front' | 'back' | 'appendix';
export type IdTag = 'front' | 'back' | 'appendix' | 'frontAppendix' | 'all' | 'page';

export const SIDE_LABELS: Record<IdSide, string> = { front: 'קדמי', back: 'אחורי', appendix: 'ספח' };

/** הכיתוב בבחירה (ארוך) והכיתוב הקצר (ברשימת ההרכב ובמשרד). */
export const TAG_LABELS: Record<IdTag, string> = {
  front: 'צד קדמי',
  back: 'צד אחורי',
  appendix: 'ספח',
  frontAppendix: 'קדמי + ספח יחד',
  all: 'הכול יחד (קדמי, אחורי וספח)',
  page: 'עמוד התמונה',
};
export const TAG_SHORT: Record<IdTag, string> = {
  front: 'קדמי', back: 'אחורי', appendix: 'ספח', frontAppendix: 'קדמי+ספח', all: 'הכול יחד', page: 'עמוד',
};

/** אילו צדדים תמונה מתויגת מכסה. */
const TAG_SIDES: Record<IdTag, IdSide[]> = {
  front: ['front'], back: ['back'], appendix: ['appendix'],
  frontAppendix: ['front', 'appendix'], all: ['front', 'back', 'appendix'], page: [],
};

/** סדר העמודים ב-PDF: קדמי לפני אחורי, ספח בסוף; צילום משולב נכנס במקום החלק הראשון שבו. */
const PAGE_ORDER: IdTag[] = ['front', 'frontAppendix', 'all', 'back', 'appendix', 'page'];

export function setKindFor(kind: IdDocKind, chosen?: 'idCard' | 'driverLicense'): IdSetKind {
  if (kind === 'idOrLicense') return chosen ?? 'idCard';
  return kind;
}

export function requiredSides(set: IdSetKind): IdSide[] {
  if (set === 'passport') return [];
  return set === 'driverLicense' ? ['front', 'back'] : ['front', 'back', 'appendix'];
}

/** הבחירה הסגורה שמוצגת ליד כל תמונה. דרכון — אין בחירה. */
export function tagOptions(set: IdSetKind): { value: IdTag; label: string }[] {
  if (set === 'passport') return [];
  if (set === 'driverLicense') {
    return [
      { value: 'front', label: TAG_LABELS.front },
      { value: 'back', label: TAG_LABELS.back },
      { value: 'all', label: 'שני הצדדים יחד' },
    ];
  }
  return (['front', 'back', 'appendix', 'frontAppendix', 'all'] as IdTag[]).map(value => ({ value, label: TAG_LABELS[value] }));
}

/** כיתוב התג לפי הסט — «שני הצדדים יחד» ברישיון, ולא «קדמי, אחורי וספח». */
export function tagLabel(set: IdSetKind, tag: IdTag): string {
  return tagOptions(set).find(o => o.value === tag)?.label ?? TAG_LABELS[tag];
}

export function coveredSides(tags: IdTag[]): Set<IdSide> {
  const s = new Set<IdSide>();
  for (const t of tags) for (const side of TAG_SIDES[t] ?? []) s.add(side);
  return s;
}

export function missingSides(set: IdSetKind, tags: IdTag[]): IdSide[] {
  const covered = coveredSides(tags);
  return requiredSides(set).filter(s => !covered.has(s));
}

/**
 * ברירת מחדל חכמה לפי הסדר: הצד הראשון שעוד לא כוסה (קדמי ⇒ אחורי ⇒ ספח). קובץ PDF — סריקה,
 * וסריקה בדרך כלל מכילה הכול ⇒ «הכול יחד». כשהכול כבר כוסה — ספח נוסף (ספח בכמה עמודים).
 */
export function defaultTag(set: IdSetKind, existing: IdTag[], file: { type?: string; name?: string }): IdTag {
  if (set === 'passport') return 'page';
  if (file.type === 'application/pdf' || /\.pdf$/i.test(file.name ?? '')) return 'all';
  const missing = missingSides(set, existing);
  if (missing.length) return missing[0];
  return set === 'idCard' ? 'appendix' : 'front';
}

/** אפשר לאשר רק כשיש לפחות תמונה אחת והסט שלם. */
export function idSetComplete(set: IdSetKind, tags: IdTag[]): boolean {
  return tags.length > 0 && missingSides(set, tags).length === 0;
}

/** «עוד חסר: אחורי, ספח» — או null כשהסט שלם (או כשעוד לא צורף כלום). */
export function missingText(set: IdSetKind, tags: IdTag[]): string | null {
  if (!tags.length) return null;
  const m = missingSides(set, tags);
  return m.length ? `עוד חסר: ${m.map(s => SIDE_LABELS[s]).join(', ')}` : null;
}

/** המשפט הירוק כשהסט שלם. */
export function completeText(set: IdSetKind): string {
  if (set === 'passport') return 'עמוד התמונה התקבל';
  if (set === 'driverLicense') return 'שני הצדדים התקבלו';
  return 'הסט שלם: קדמי, אחורי וספח';
}

/** סידור לפי סדר העמודים; בתוך אותו תג — לפי סדר הצירוף. */
export function orderForPdf<T extends { tag: IdTag }>(items: T[]): T[] {
  return items.map((it, i) => ({ it, i }))
    .sort((a, b) => (PAGE_ORDER.indexOf(a.it.tag) - PAGE_ORDER.indexOf(b.it.tag)) || (a.i - b.i))
    .map(x => x.it);
}

export interface IdPartEntry { page: number; part: string; tag: IdTag; name: string; type: string; size: number; rotation?: number }
export type IdPartsManifest = IdPartEntry[];

/** ההרכב שנשמר ליד הרשומה: עמוד ⇒ מה הוא. בלי תוכן הקובץ. */
export function partsManifest(set: IdSetKind, items: { tag: IdTag; name: string; type: string; size: number; rotation?: number }[]): IdPartsManifest {
  return orderForPdf(items).map((f, i) => ({
    page: i + 1, part: tagLabel(set, f.tag), tag: f.tag, name: f.name, type: f.type, size: f.size,
    ...(f.rotation ? { rotation: f.rotation } : {}),
  }));
}

/** «קדמי+ספח · אחורי» — תיאור קצר להצגה במשרד. */
export function partsSummary(parts: { tag?: string; part?: string }[] | null | undefined): string {
  if (!parts?.length) return '';
  return parts.map(p => (p.tag && TAG_SHORT[p.tag as IdTag]) || p.part || '').filter(Boolean).join(' · ');
}

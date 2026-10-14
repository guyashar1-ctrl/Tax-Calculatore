// ─── מסמך אחד מכמה קבצים: אילו חלקים, באיזה סדר, ומתי אפשר לשלוח (13.10.2026) ─────────────
// ‼ הרחבה של צדדי התעודה (idSides.ts, 536e4c2 — «מקרה ויסמרק») לכל מסמך בשאלון: תעודת זהות — קדמי,
//   אחורי לפי הצורך וספח בכמה עמודים; רישיון רכב — קדמי ואחורי; כל מסמך אחר — עמודים. או «קובץ אחד
//   שמכיל הכול». שום דבר לא נשלח עד האישור; אז נבנה PDF אחד בסדר החלקים (buildIdPdf), וזה מה שנשמר.
// ‼ טהור — בלי React. אותם כללים לבדיקות.
// ‼ חלק אחד לכל תמונה (בחירה יחידה) — לא תיבות סימון שמאפשרות «קדמי» ו«אחורי» לאותה תמונה.

export interface PartDef {
  slot: string;
  label: string;
  /** נדרש לפני שליחה. */
  required: boolean;
  /** כמה קבצים לאותו חלק (ספח בכמה עמודים, מסמך בכמה עמודים). */
  multi?: boolean;
  hint?: string;
}

export interface DocPartsSpec { parts: PartDef[]; singleLabel: string }

/** החלקים לפי סוג המסמך בשאלון (DocKind). מסמך שאינו כאן — עמודים. */
export function partsFor(docKind: string): DocPartsSpec {
  switch (docKind) {
    case 'idCard': return {
      singleLabel: 'קובץ אחד שמכיל את הכול (קדמי, אחורי וספח)',
      parts: [
        { slot: 'front', label: 'צד קדמי', required: true },
        { slot: 'back', label: 'צד אחורי', required: false, hint: 'בתעודה החכמה יש פרטים גם מאחור' },
        { slot: 'appendix', label: 'ספח — כל העמודים', required: true, multi: true, hint: 'ספח בכמה עמודים — כל עמוד בנפרד, או כמה תמונות יחד' },
      ],
    };
    case 'vehicleLicense': return {
      singleLabel: 'קובץ אחד עם שני הצדדים',
      parts: [{ slot: 'front', label: 'צד קדמי', required: true }, { slot: 'back', label: 'צד אחורי', required: false }],
    };
    default: return {
      singleLabel: 'קובץ אחד שמכיל את כל המסמך',
      parts: [{ slot: 'pages', label: 'המסמך', required: true, multi: true, hint: 'אפשר כמה תמונות או קבצים — כל עמוד בנפרד' }],
    };
  }
}

export interface PartFile { id: string; slot: string; name: string; type: string; size: number; rotation?: 0 | 90 | 180 | 270 }

export type PartsMode = 'parts' | 'single';

/** מה עוד חסר — או null כשאפשר לשלוח. */
export function partsMissing(spec: DocPartsSpec, mode: PartsMode, files: PartFile[]): string | null {
  if (mode === 'single') return files.some(f => f.slot === 'single') ? null : 'צריך לצרף את הקובץ';
  if (files.some(f => f.slot === 'unassigned')) return 'לכל תמונה צריך לבחור איזה חלק היא';
  const missing = spec.parts.filter(p => p.required && !files.some(f => f.slot === p.slot)).map(p => p.label);
  return missing.length ? `חסר: ${missing.join(', ')}` : null;
}

/** סדר העמודים ב-PDF: לפי סדר החלקים, ובתוך חלק — לפי הסדר שהלקוח קבע. */
export function orderedParts(spec: DocPartsSpec, mode: PartsMode, files: PartFile[]): PartFile[] {
  if (mode === 'single') return files.filter(f => f.slot === 'single').slice(0, 1);
  return spec.parts.flatMap(p => files.filter(f => f.slot === p.slot));
}

/** עקיבות לקבצי המקור — נשמר ליד הראיה (מה צורף, באיזה סדר ולאיזה חלק). בלי תוכן הקובץ. */
export function partsManifest(spec: DocPartsSpec, mode: PartsMode, files: PartFile[]) {
  const label = (slot: string) => (slot === 'single' ? spec.singleLabel : spec.parts.find(p => p.slot === slot)?.label ?? slot);
  return orderedParts(spec, mode, files).map((f, i) => ({ page: i + 1, part: label(f.slot), name: f.name, type: f.type, size: f.size, ...(f.rotation ? { rotation: f.rotation } : {}) }));
}

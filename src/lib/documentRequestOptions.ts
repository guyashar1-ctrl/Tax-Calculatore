// ─── רשימת המסמכים שאפשר לבקש מלקוח ─────────────────────────────────────────
// זהו **התפריט**: מה מוצע לסימון כשמרכיבים בקשת "מסמכים מהלקוח". מה שמסומן
// כברירת מחדל מגיע ממקום אחר לגמרי — התבנית (journey_templates) — ושני
// הדברים בכוונה נפרדים: הוספת מסמך לתפריט לא אמורה לשנות את מה שנשלח
// אוטומטית ללקוח הבא.
//
// ‼ המובנים אינם ניתנים למחיקה: הם לא נשמרים בהגדרות, ולכן אין מה להסיר.
// מה שהמשרד הוסיף בעצמו יושב ב-settings ואפשר להסיר אותו.

type Settings = Record<string, unknown>;

/** המפתח בהגדרות המשרד שמחזיק את המסמכים שהמשרד הוסיף בעצמו. */
export const DOC_OPTIONS_KEY = 'documentRequestOptions';

export const BUILT_IN_DOC_OPTIONS: string[] = [
  'תצלום תעודת זהות',
  'תצלום ספח תעודת זהות',
  'תצלום רישיון נהיגה',
  'תצלום דרכון',
  'אישור ניהול חשבון בנק',
];

const clean = (s: string) => s.trim().replace(/\s+/g, ' ');

/** המסמכים שהמשרד הוסיף. שמות ריקים או כפולים מסוננים — הרשימה מוצגת כמות שהיא. */
export function customDocOptions(settings: Settings | null | undefined): string[] {
  const raw = (settings ?? {})[DOC_OPTIONS_KEY];
  if (!Array.isArray(raw)) return [];
  const seen = new Set(BUILT_IN_DOC_OPTIONS);
  const out: string[] = [];
  for (const item of raw) {
    if (typeof item !== 'string') continue;
    const label = clean(item);
    if (!label || seen.has(label)) continue;
    seen.add(label);
    out.push(label);
  }
  return out;
}

/** כל התפריט, בסדר התצוגה: המובנים ואז מה שנוסף. */
export const allDocOptions = (settings: Settings | null | undefined): string[] =>
  [...BUILT_IN_DOC_OPTIONS, ...customDocOptions(settings)];

export function withDocOption(settings: Settings | null | undefined, label: string): Settings {
  const next = clean(label);
  const current = customDocOptions(settings);
  if (!next || BUILT_IN_DOC_OPTIONS.includes(next) || current.includes(next)) {
    return { ...(settings ?? {}) };
  }
  return { ...(settings ?? {}), [DOC_OPTIONS_KEY]: [...current, next] };
}

export function withoutDocOption(settings: Settings | null | undefined, label: string): Settings {
  const target = clean(label);
  return {
    ...(settings ?? {}),
    [DOC_OPTIONS_KEY]: customDocOptions(settings).filter(l => l !== target),
  };
}

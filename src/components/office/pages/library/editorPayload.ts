// ─── מה העורך כותב בבקשה — בנייה אחת לשמירה ולתצוגה החיה ─────────────────────
// ‼ טהור: אותה פונקציה בונה את ה-payload ש«שמירה» שולחת ל-upsert_library_request ואת ה-payload
// ש«מה הלקוח רואה» שולח ל-preview_request_sample (טיוטה). אין עותק שני של הכללים — מה שרואים
// בכרטיס החי הוא מה שיישמר. השרת הוא שמצייר את הכרטיס; כאן רק מרכיבים את מה שהוא מקבל.

export interface EditorListEntry {
  key: string;
  label: string;
  kind: string;
  /** שדות נוספים מהפריט השמור (חובה, אפשרויות, מספר קבצים) — עוברים כמות שהם. */
  rest: Record<string, unknown>;
}

export interface EditorFields {
  /** בקשה חופשית (custom_request): השם גם כותרת הבקשה. */
  custom: boolean;
  /** הלקוח רואה נוסח שהמשרד כותב (כותרת, שורה, כפתור) — לא נגזר מרשימה. */
  showCopy: boolean;
  /** הכותרת והשורה נגזרות מרשימת המסמכים (client_documents). */
  derivedCopy: boolean;
  listKey: 'requirements' | 'checklist' | null;
  name: string;
  clientTitle: string;
  clientSub: string;
  clientCta: string;
  items: EditorListEntry[];
}

export interface EditorPayloadInput extends EditorFields {
  /** ה-payload השמור — כל מה שהעורך אינו עורך עובר כמות שהוא. */
  orig: Record<string, unknown>;
}

/** «להעלות מסמך אחד» / «להעלות 3 מסמכים» — כמו במחולל. */
export const derivedDocumentsTitle = (count: number): string =>
  count === 1 ? 'להעלות מסמך אחד' : 'להעלות ' + count + ' מסמכים';

/** פריטים בעלי שם בלבד — שורה ריקה אינה פריט. */
export const keptItems = (items: EditorListEntry[]): EditorListEntry[] => items.filter(x => x.label.trim());

/**
 * כותב על עותק של ה-payload השמור את מה שהעורך עורך (שם, נוסח ללקוח, הרשימה). ‼ העותק מגיע מהקורא
 * (`{ ...orig }`) — כך ברור שהמפתחות שהעורך לא עורך עוברים כמות שהם.
 */
export function writeEditorFields(payload: Record<string, unknown>, i: EditorFields): Record<string, unknown> {
  const nm = i.name.trim();
  const kept = keptItems(i.items);
  if (i.custom) payload.title = nm;
  if (i.showCopy) {
    payload.clientTitle = i.clientTitle.trim() || nm;
    payload.clientSub = i.clientSub.trim();
    payload.clientCta = i.clientCta.trim() || 'למילוי';
  }
  if (i.listKey === 'checklist') {
    payload.checklist = kept.map(x => ({ key: x.key, label: x.label.trim(), done: false }));
    // ‼ «הכותרת שהלקוח רואה נגזרת מהרשימה» — בלי זה נשאר «להעלות 2 מסמכים» אחרי שהרשימה גדלה
    // ל-4, והטקסט הישן הגיע לדף ולמייל.
    if (i.derivedCopy) {
      payload.clientTitle = derivedDocumentsTitle(kept.length);
      payload.clientSub = kept.map(x => x.label.trim()).join(' · ');
    }
  } else if (i.listKey === 'requirements') {
    payload.requirements = kept.map(x => ({ required: true, ...x.rest, key: x.key, kind: x.kind, label: x.label.trim(), done: false }));
  }
  return payload;
}

export const buildEditorPayload = (i: EditorPayloadInput): Record<string, unknown> => writeEditorFields({ ...i.orig }, i);

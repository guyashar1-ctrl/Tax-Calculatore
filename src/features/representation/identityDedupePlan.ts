// ─── העלאה מהמשרד: מה עושים עם קובץ זהה (213) — טהורה, ראה identityDedupe.ts ───

export type OfficeUploadPlan =
  | { kind: 'already'; documentId: string }   // כבר משויך לאדם הזה
  | { kind: 'reuse'; documentId: string }     // בתיק, לא משויך לאף אחד
  | { kind: 'new' };                          // להעלות רשומה חדשה

/** טהורה: מה עושים, לפי הזהים שנמצאו ולפי השיוך הקיים. */
export function planOfficeUpload(identical: string[], mine: string[], other: string[]): OfficeUploadPlan {
  const already = identical.find(id => mine.includes(id));
  if (already) return { kind: 'already', documentId: already };
  const free = identical.find(id => !other.includes(id));
  if (free) return { kind: 'reuse', documentId: free };
  return { kind: 'new' };
}

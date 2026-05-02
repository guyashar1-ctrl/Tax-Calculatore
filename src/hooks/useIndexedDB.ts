// ─── useIndexedDB → גשר ל-Supabase Storage ────────────────────────────
// קודם הקבצים נשמרו ב-IndexedDB של הדפדפן. עכשיו הם נשמרים ב-Supabase Storage
// (bucket 'client-documents'). הקובץ הזה משאיר את הסיגנטורה הישנה לתאימות
// אחורה — `useDocumentDB()` עדיין עובד אבל מאחורי הקלעים מדבר עם הענן.
//
// קוד הגירה (קריאה מ-IndexedDB הישן) נמצא ב-utils/legacyIndexedDB.ts.

export {
  useDocumentStore as useDocumentDB,
  isPlaceholderDoc,
  DOC_CATEGORY_LABELS,
} from './useDocumentStore';
export type { StoredDoc, DocCategory } from './useDocumentStore';

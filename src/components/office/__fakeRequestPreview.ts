// ─── מסד מדומה · «צפייה» בבקשה (05.10.2026) ──────────────────────────────────────
// ‼ פיתוח בלבד (office-app). preview_request_sample נבנית בשרת באותו קוד של הדף האמיתי, ולכן ההדגמה לא מייצרת אותה
// מחדש: היא מחזירה תשובה שנלכדה מ-staging (scripts/capture-request-preview-fixtures.mjs) לפי מפתח הבקשה.
// בקשה שלא נלכדה ⇒ no_fixture («אין דוגמה בהדגמה») — לא ציור מומצא.
// ‼ ה-JSON נטען בייבוא דינמי — קוד שרץ רק תחת FAKE_ACTIVE, כך שהוא לא נכנס לחבילת הייצוג.

import { requestKey } from '../../features/requestPreview/api';
import type { PreviewRequest } from '../../features/requestPreview/types';

type Row = Record<string, unknown>;

export async function previewRpc(request: PreviewRequest, firm: { firmName: string; branding: unknown }): Promise<{ data: Row; error: null }> {
  const mod = await import('./__fixtures__/requestPreview.json');
  const fixtures = ((mod as { default?: { fixtures?: Record<string, Row> } }).default ?? mod as { fixtures?: Record<string, Row> }).fixtures ?? {};
  const hit = fixtures[requestKey(request)];
  if (!hit) return { data: { ok: false, error: 'no_fixture' }, error: null };
  // המיתוג ושם המשרד — של משרד ההדגמה (נתונים, לא נוסח).
  return { data: { ...hit, firmName: firm.firmName, branding: firm.branding }, error: null };
}

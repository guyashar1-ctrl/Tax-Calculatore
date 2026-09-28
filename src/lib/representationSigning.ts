// ─── 208 · לפני השליחה לחתימה — שלוש פעולות שרת ─────────────────────────────
// ‼ כל אחת כתיבה אחת בשרת, ולכן הדפדפן לא כותב סטטוס, היקף או מעקב שע״ם בעצמו.
//   • prepare_request_for_signing — «שלח ללקוח»: דרישות המסמכים של שע״ם הופכות
//     לפריטים בדף האישי (העלאה / אישור), והבקשה עוברת ל«ממתין לחתימה».
//   • remove_authority_before_signing — «הסר מהבקשה» לפני השליחה.
//   • confirm_shaam_request_cancelled — המשרד מאשר שביטל בשע״ם את הבקשה הישנה.

import { supabase } from './supabase';
import type { RepTarget } from '../types';

export interface PreparedDocument {
  submissionKey: string;
  person: RepTarget;
  kind: string;
  label: string;
  /** confirm = הלקוח יתבקש לאשר צילום שבתיק · confirmed = כבר אישר · upload = יתבקש להעלות. */
  action: 'confirm' | 'confirmed' | 'upload' | 'ambiguous' | string;
}

export type PrepareResult =
  | { ok: true; status: string; documents: PreparedDocument[] }
  | { ok: false; error: string; reason?: string; documents?: PreparedDocument[] };

const PREPARE_ERRORS: Record<string, string> = {
  not_found: 'הבקשה לא נמצאה.',
  forbidden: 'אין הרשאה לבקשה הזו.',
  no_form: 'אין טופס לחתימה - הפיקו את הטופס קודם.',
  unassigned_identity: 'יש בתיק צילום תעודה שלא שויך לאף אדם, ולכן לא ברור אם הוא הצילום שרשות המסים דורשת.',
};

/**
 * @param askUnassigned יש בתיק צילום לא משויך, והמשרד בחר לבקש מהלקוח צילום בכל זאת.
 */
export async function prepareRequestForSigning(requestId: string, opts: { askUnassigned?: boolean } = {}): Promise<PrepareResult> {
  const { data, error } = await supabase.rpc('prepare_request_for_signing', {
    p_request_id: requestId, p_ask_unassigned: !!opts.askUnassigned,
  });
  if (error) return { ok: false, error: `ההכנה לשליחה נכשלה: ${error.message}` };
  const res = data as { ok?: boolean; reason?: string; status?: string; documents?: PreparedDocument[] } | null;
  if (!res?.ok) {
    return {
      ok: false, reason: res?.reason, documents: res?.documents,
      error: PREPARE_ERRORS[res?.reason ?? ''] ?? `ההכנה לשליחה נכשלה (${res?.reason ?? 'לא ידוע'})`,
    };
  }
  return { ok: true, status: res.status ?? '', documents: res.documents ?? [] };
}

/** משפט אחד לכל מסמך שנוסף לתהליך הלקוח — להודעה שאחרי השליחה. */
export function preparedDocumentsSentence(docs: PreparedDocument[], nameOf: (p: RepTarget) => string): string {
  const parts = docs.map(d => {
    const who = nameOf(d.person);
    if (d.action === 'upload') return `בקשה להעלות ${d.label} של ${who}`;
    if (d.action === 'confirm') return `בקשה מ${who} לאשר את הצילום שבתיק או להחליף`;
    return '';
  }).filter(Boolean);
  return parts.length ? `נוסף לדף האישי: ${parts.join(' · ')}` : '';
}

export type RemoveAuthorityResult =
  | { ok: true; replacement: string[]; affected: string[] }
  | { ok: false; error: string };

const REMOVE_ERRORS: Record<string, string> = {
  already_sent: 'הטופס כבר נשלח ללקוח לחתימה - אי אפשר להסיר רשות בשלב הזה.',
  already_active: 'הייצוג ברשות הזו כבר נקלט - אין מה להסיר.',
  automation_running: 'פתיחת הבקשה בשע״ם רצה עכשיו - המתינו שתסתיים ונסו שוב.',
  last_authority: 'זו רשות השע״ם היחידה בבקשה - אין מה להשאיר.',
  not_requested: 'לא התבקש ייצוג ברשות הזו.',
  bad_authority: 'רשות לא מוכרת.',
  not_found: 'הבקשה לא נמצאה.',
  forbidden: 'אין הרשאה לבקשה הזו.',
};

export async function removeAuthorityBeforeSigning(
  requestId: string, authority: 'incomeTax' | 'vat' | 'withholding', person?: RepTarget,
): Promise<RemoveAuthorityResult> {
  const { data, error } = await supabase.rpc('remove_authority_before_signing', {
    p_request_id: requestId, p_authority: authority, p_person: person ?? null,
  });
  if (error) return { ok: false, error: `ההסרה נכשלה: ${error.message}` };
  const res = data as { ok?: boolean; reason?: string; affected?: string[]; replacement?: string[] } | null;
  if (!res?.ok) return { ok: false, error: REMOVE_ERRORS[res?.reason ?? ''] ?? `ההסרה נכשלה (${res?.reason ?? 'לא ידוע'})` };
  return { ok: true, affected: res.affected ?? [], replacement: res.replacement ?? [] };
}

export async function confirmShaamRequestCancelled(requestId: string, submissionKey: string): Promise<string | null> {
  const { data, error } = await supabase.rpc('confirm_shaam_request_cancelled', {
    p_request_id: requestId, p_submission_key: submissionKey,
  });
  if (error) return `השמירה נכשלה: ${error.message}`;
  const res = data as { ok?: boolean; reason?: string } | null;
  if (!res?.ok) return res?.reason === 'no_replacement' ? 'אין בקשה שממתינה לביטול.' : `השמירה נכשלה (${res?.reason ?? 'לא ידוע'})`;
  return null;
}

// ═══════════════════════════════════════════════════════════════════════════
//  החלטות של מייל הדף האישי (send-process-open-email) — טהור, נבדק מ-src.
// ═══════════════════════════════════════════════════════════════════════════
//  בלי Deno ובלי DOM: הפונקציה בשרת מייבאת מכאן, ובדיקות היחידה בודקות את
//  אותו קוד בדיוק.
// ═══════════════════════════════════════════════════════════════════════════

export type NoticeKindName = 'new' | 'reminder' | 'update';

/**
 * ‼ אותו כלל כמו claim_client_notice: «חדש» או «תזכורת» בלי פריטים ⇒ אין מה לשלוח.
 * תצוגה מקדימה עם רשימה ריקה — שאחריה השליחה נכשלת — מראה מייל שלא ייצא לעולם.
 * «הקישור לדף» (update) נבדק בנפרד, לפי מה שבדף.
 */
export function previewGuard(kind: NoticeKindName, items: readonly unknown[]): 'nothing_to_announce' | null {
  return kind !== 'update' && items.length === 0 ? 'nothing_to_announce' : null;
}

export function previewGuardText(kind: NoticeKindName): string {
  return kind === 'reminder'
    ? 'אין כרגע על מה להזכיר ללקוח — אין בקשה שהוא קיבל עליה מייל ועדיין ממתינה לו.'
    : 'אין כאן משהו חדש שהלקוח עוד לא קיבל עליו מייל. כדי לשלוח לו רק את הקישור לדף: ⋯ ← «שליחת הקישור לדף במייל».';
}

export interface RpcReply {
  data: unknown;
  error: { message?: string } | null;
}

/** «נרשם» רק כשהשרת אמר ok:true — תשובה ריקה אינה ראיה. */
export function noticeRecorded(r: RpcReply): boolean {
  return !r.error && (r.data as { ok?: unknown } | null)?.ok === true;
}

/**
 * ‼ המייל כבר יצא (תשובת הצלחה מהספק). כשל ברישום נוסה פעם אחת נוספת, עם אותו
 * אסימון: complete_client_notice אידמפוטנטית — אם הקריאה הראשונה דווקא נקלטה,
 * השנייה מחזירה alreadyRecorded. בלי הניסיון הזה ההודעה נשארת «נשלחת» ואחרי
 * עשר דקות הופכת ל«לא ידוע», והבקשות לא מסומנות כנמסרו.
 */
export async function completeWithOneRetry(
  call: () => PromiseLike<RpcReply>,
): Promise<{ logged: boolean; attempts: number; last: RpcReply }> {
  const first = await call();
  if (noticeRecorded(first)) return { logged: true, attempts: 1, last: first };
  const second = await call();
  return { logged: noticeRecorded(second), attempts: 2, last: second };
}

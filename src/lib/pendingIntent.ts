// ─── כוונה שעוברת בין מסכים ──────────────────────────────────────────────────
// «שליחה ללקוח» מספריית המסמכים במשרד פותחת את כרטיס הלקוח, ושם — את חלון
// «שליחת מסמכים ללקוח» עם הקובץ כבר בפנים. ‼ אותו חלון ואותה בקשה בדיוק כמו
// מ«＋ בקשה חדשה» (CLAUDE.md §9: עבודה שמתחילה ממסך אחר חייבת להפוך לבקשה).
// הכוונה נצרכת פעם אחת, ורק בכרטיס של הלקוח שנבחר.

export interface SendOfficeDocsIntent {
  kind: 'send-office-docs';
  clientId: string;
  docs: { officeId: string; label: string; fileName?: string }[];
}

let pending: SendOfficeDocsIntent | null = null;

export function setPendingIntent(i: SendOfficeDocsIntent | null) {
  pending = i;
}

export function takePendingIntent(clientId: string): SendOfficeDocsIntent | null {
  if (!pending || pending.clientId !== clientId) return null;
  const p = pending;
  pending = null;
  return p;
}

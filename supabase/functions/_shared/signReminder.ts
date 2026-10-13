// ─── מתי מגיעה תזכורת חתימה על ייפוי הכוח (representation-reminders §1) ───────
// ‼ טהור (בלי Deno ובלי supabase) — כדי שהכלל ייבדק בלי להריץ את מנגנון התזכורות.
// ‼ 240 (12.10.2026): «אשר והוסף לדף הלקוח» מעביר ל«ממתין לחתימה» בלי מייל, והמשרד
// מחליט מתי לשלוח את עדכון הדף. «תזכורת» על בקשה שהלקוח עוד לא קיבל עליה שום הודעה
// הייתה בפועל ההודעה הראשונה — ולכן אין תזכורת לפני מייל שנשא את החתימה
// (signatureEmailSentAt, נגזר מראיה — 239) או תזכורת קודמת.

export type SignReminderDecision = 'not_notified' | 'capped' | 'not_due' | 'due';

export interface SignReminderInput {
  /** execution.reminders.sign של הבקשה. */
  rem?: { count?: number | string | null; lastSentAt?: string | null } | null;
  /** execution.signatureEmailSentAt — מייל (חתימה / דף) שנשא את קישור החתימה. */
  signatureEmailSentAt?: string | null;
  now: Date;
  afterDays: number;
  maxReminders: number;
}

function daysSince(iso: string, now: Date): number {
  return (now.getTime() - new Date(iso).getTime()) / 86_400_000;
}

export function signReminderDecision({ rem, signatureEmailSentAt, now, afterDays, maxReminders }: SignReminderInput): SignReminderDecision {
  const count = Number(rem?.count || 0);
  if (count >= maxReminders) return 'capped';
  const notifiedAt = rem?.lastSentAt || signatureEmailSentAt || null;
  if (!notifiedAt) return 'not_notified';
  return daysSince(notifiedAt, now) < afterDays ? 'not_due' : 'due';
}

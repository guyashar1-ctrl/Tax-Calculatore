// מרכז התקשורת — רשומת מייל יוצא. מבנה עצמאי, ניתן לקידום למרכז תקשורת מלא.

export type EmailStatus =
  | 'sent'
  | 'delivered'
  | 'delivery_delayed'
  | 'bounced'
  | 'complained'
  | 'opened'
  | 'clicked'
  | 'failed';

export interface EmailMessage {
  id: string;
  clientId?: string;
  requestId?: string;
  resendId?: string;
  toEmail: string;
  subject?: string;
  kind?: string;
  status: EmailStatus;
  error?: string;
  sentAt: string;
  deliveredAt?: string;
  openedAt?: string;
  clickedAt?: string;
  meta?: Record<string, unknown>;
  createdAt?: string;
}

export const EMAIL_STATUS_LABEL: Record<EmailStatus, string> = {
  sent: 'נשלח',
  delivered: 'נמסר',
  delivery_delayed: 'מתעכב',
  bounced: 'הוקפץ',
  complained: 'סומן כספאם',
  opened: 'נפתח',
  clicked: 'נלחץ',
  failed: 'נכשל',
};

// bg/fg/dot — צבעים תואמי כהה/בהיר דרך ערכים מפורשים
export const EMAIL_STATUS_STYLE: Record<EmailStatus, { bg: string; fg: string; dot: string }> = {
  sent: { bg: 'var(--chip-blue-bg)', fg: 'var(--chip-blue-tx)', dot: 'var(--br)' },
  delivered: { bg: 'var(--chip-green-bg)', fg: 'var(--chip-green-tx)', dot: 'var(--ok)' },
  delivery_delayed: { bg: 'var(--chip-amber-bg)', fg: 'var(--chip-amber-tx)', dot: 'var(--warn)' },
  opened: { bg: 'var(--chip-violet-bg)', fg: 'var(--chip-violet-tx)', dot: 'var(--info)' },
  clicked: { bg: 'var(--chip-violet-bg)', fg: 'var(--chip-violet-tx)', dot: 'var(--info)' },
  bounced: { bg: 'var(--chip-red-bg)', fg: 'var(--chip-red-tx)', dot: 'var(--err)' },
  complained: { bg: 'var(--chip-red-bg)', fg: 'var(--chip-red-tx)', dot: 'var(--err)' },
  failed: { bg: 'var(--chip-red-bg)', fg: 'var(--chip-red-tx)', dot: 'var(--err)' },
};

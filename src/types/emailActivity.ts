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
  sent: { bg: '#E6F1FB', fg: '#0C447C', dot: '#378ADD' },
  delivered: { bg: '#E1F5EE', fg: '#0F6E56', dot: '#1D9E75' },
  delivery_delayed: { bg: '#FAEEDA', fg: '#854F0B', dot: '#EF9F27' },
  opened: { bg: '#EEEDFE', fg: '#3C3489', dot: '#7F77DD' },
  clicked: { bg: '#EEEDFE', fg: '#26215C', dot: '#534AB7' },
  bounced: { bg: '#FCEBEB', fg: '#A32D2D', dot: '#E24B4A' },
  complained: { bg: '#FCEBEB', fg: '#A32D2D', dot: '#E24B4A' },
  failed: { bg: '#FCEBEB', fg: '#A32D2D', dot: '#E24B4A' },
};

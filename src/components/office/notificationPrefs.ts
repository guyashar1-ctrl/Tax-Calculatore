// מתגי ההתראות ותזכורת הפקיעה — כתיבה לטיוטה.
// ‼ הרשימה נגזרת מהקטלוג המשותף (accountantNotifications.ts). נשמר רק מה ששונה:
// מתג שחוזר לברירת המחדל יורד מההגדרות.
import type { FirmProfile } from '../../types/firmProfile';
import {
  ACCOUNTANT_NOTIFICATIONS, NOTIFICATION_SETTINGS_KEY, readNotificationPrefs,
} from '../../../supabase/functions/_shared/accountantNotifications.ts';

export function setNotification(p: FirmProfile, kind: string, on: boolean): FirmProfile {
  const settings = p.settings ?? {};
  const def = ACCOUNTANT_NOTIFICATIONS.find(n => n.kind === kind);
  const next = { ...readNotificationPrefs(settings) };
  if (def && on === def.defaultOn) delete next[kind];
  else next[kind] = on;
  return { ...p, settings: { ...settings, [NOTIFICATION_SETTINGS_KEY]: next } };
}

/** התראות אל המשרד — בלי תזכורת הפקיעה, שהיא מייל ללקוח. */
export const FIRM_NOTIFICATIONS = ACCOUNTANT_NOTIFICATIONS.filter(n => n.audience !== 'client');

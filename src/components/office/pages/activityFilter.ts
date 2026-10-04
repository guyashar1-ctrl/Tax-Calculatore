// סינון יומן המיילים כשמגיעים אליו מעמוד אחר («מה יצא ←»).
import type { EmailMessage } from '../../../types/emailActivity';
import { isInternalEmailKind } from '../../../types/emailActivity';
import { emailOrigin } from '../../../features/automation/automationList';

export interface ActivityFilter {
  /** מה מוצג למשתמש: «מסנן: תזכורות ייצוג». */
  label: string;
  /** סוגי מייל (התאמה מלאה). */
  kinds?: string[];
  /** רק התראות פנימיות למשרד. */
  internal?: boolean;
  /** רק מה שיצא לבד (meta.origin) — «מה יצא ←» מעמוד «אוטומציות». */
  origin?: 'auto';
}

export function matchesFilter(m: EmailMessage, f: ActivityFilter | null): boolean {
  if (!f) return true;
  if (f.origin && emailOrigin(m) !== f.origin) return false;
  if (f.internal) return isInternalEmailKind(m.kind);
  if (f.kinds?.length) return !!m.kind && f.kinds.includes(m.kind);
  return true;
}

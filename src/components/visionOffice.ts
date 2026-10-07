// ─── מפת הדרך · הלבנים בקיר «המשרד מכניס» באות מ-PIVO ───────────────────────
// גיא, 7.10.2026: «למה זה לא נותן לי לבחור מהלקוחות שלי? הרי יש בכרטיס לקוח את
// תנאי התשלום». לכן אין בדף רשימת לקוחות משלו: כל לקוח שיש לו ריטיינר חודשי
// בהסכם (לשונית «הסכם ותשלומים») הוא לבנה, בדיוק לפי מה שכתוב שם.
// ‼ מקור אחד: ההתקשרויות (engagements). ההתקשרות הנוכחית נבחרת ב-currentEngagement,
//   ההגדרה היחידה במסך — לא מסנן מקומי.

import type { Client } from '../types';
import type { Engagement } from '../types/onboarding';
import { currentEngagement, todayKey } from '../utils/engagementSelectors';

export interface VisionClient {
  id: string;
  name: string;
  type: 'patur' | 'murshe' | 'company' | 'other';
  /** ריטיינר חודשי לפני מע״מ — monthlyTotal של ההסכם */
  monthly: number;
  /** 'YYYY-MM-DD' — מתי אושר ההסכם החודשי הראשון: מאז הוא לבנה */
  approved: string;
  /** 'YYYY-MM' — מתי התחיל (או יתחיל) לשלם */
  from: string;
  /** 'YYYY-MM-DD' — מתי ההסכם החודשי האחרון הסתיים. null = עדיין משלם */
  ended: string | null;
}

const day = (s?: string | null) => (s ?? '').slice(0, 10);
const approvedKey = (e: Engagement) => day(e.approvedAt) || day(e.effectiveFrom) || day(e.createdAt);

// לחברה — שם העסק; לאדם — השם שלו (כמו ספריית האנשים)
function nameOf(c: Client, type: VisionClient['type']): string {
  const person = `${c.firstName ?? ''} ${c.lastName ?? ''}`.trim();
  return (type === 'company' && c.businessName?.trim()) || person || c.businessName?.trim() || 'לקוח';
}

function kindOf(c: Client): VisionClient['type'] {
  if (c.type === 'company' || c.dealerType === 'company') return 'company';
  if (c.vatStatus === 'exemptDealer') return 'patur';
  if (c.vatStatus === 'authorizedDealer') return 'murshe';
  if (c.dealerType === 'exempt') return 'patur';
  if (c.dealerType === 'licensed') return 'murshe';
  return 'other';
}

export function visionClients(clients: Client[], engagements: Engagement[], today = todayKey()): VisionClient[] {
  const out: VisionClient[] = [];
  for (const c of clients) {
    const monthlyOnes = engagements
      .filter(e => e.clientId === c.id && e.status !== 'cancelled' && (e.monthlyTotal ?? 0) > 0 && approvedKey(e))
      .sort((a, b) => approvedKey(a).localeCompare(approvedKey(b)));
    if (!monthlyOnes.length) continue;
    const first = monthlyOnes[0];
    const cur = currentEngagement(engagements, c.id, today);
    // חידוש שאושר וטרם נכנס לתוקף — הלקוח ממשיך, גם אם בין שני הסכמים
    const scheduled = monthlyOnes.filter(e => e.status === 'scheduled');
    const live = (cur && (cur.monthlyTotal ?? 0) > 0 ? cur : undefined) ?? scheduled[scheduled.length - 1];
    const last = live ?? monthlyOnes[monthlyOnes.length - 1];
    const ends = monthlyOnes.map(e => day(e.endedAt) || day(e.updatedAt)).filter(Boolean).sort();
    const ended = live ? null : ends[ends.length - 1] || today;
    const type = kindOf(c);
    out.push({
      id: c.id,
      name: nameOf(c, type),
      type,
      monthly: Math.round(last.monthlyTotal ?? 0),
      approved: approvedKey(first),
      from: first.billingStartMonth || approvedKey(first).slice(0, 7),
      ended,
    });
  }
  return out.sort((a, b) => a.approved.localeCompare(b.approved));
}

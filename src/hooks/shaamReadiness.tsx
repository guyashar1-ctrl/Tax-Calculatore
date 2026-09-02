// ─── מצב המוכנות של שע״ם — מקור אמת אחד לכל המוצר ──────────────────────────
//
// ‼ למה זה קיים: הכותרת והפקדים בשדות הציגו שני דברים שונים באותו רגע —
// הכותרת ירוקה, והפקד בשדה "החיבור לשע״ם אינו מוכן". הסיבה: הכותרת קראה
// **מצב** (שורת העובד, ארבע שכבות + פעימת לב), והפקד הציג **אירוע** —
// ההודעה של המשימה האחרונה, שנשלפה בלי שום הגבלת גיל. משימה שנכשלה אתמול
// המשיכה להכריז "לא מוכן" גם אחרי שהחיבור עלה.
//
// מעכשיו יש חוזה אחד: הספק הזה מושך את שורת העובד פעם אחת, גוזר מוכנות,
// וכולם קוראים ממנו. הכותרת ופקדי השדות לא יכולים לסתור זה את זה, כי אין
// להם שני מקורות.
//
// ‼ הכללים, במקום אחד:
//   · מוכן = ארבע השכבות מוכנות **וגם** פעימת הלב טרייה.
//   · פעימת לב ישנה מ-WORKER_STALE_AFTER_MS ⇒ לא מוכן. מצב לא ידוע אינו ירוק.
//   · אין שורת עובד כלל ⇒ לא מוכן.
// שום מסך לא מוסיף כלל משלו.

import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { supabase } from '../lib/supabase';
import { automationWorkerFromDb } from '../lib/dbMappers';
import { WORKER_STALE_AFTER_MS } from '../types/automation';
import type { AutomationWorkerStatus } from '../types/automation';

const POLL_MS = 4000;

/** שכבות שע״ם שהעובד מדווח עליהן. */
export type ShaamLayer = 'portal' | 'gmf' | 'vat' | 'nikui';

/**
 * מה כל יכולת דורשת בפועל — נגזר מהמימוש של ה-handler, לא מהתחושה.
 *
 * ‼ «מוכנות גלובלית» ו«מוכנות לפעולה» אינם אותו דבר. הנורית בכותרת אומרת
 * «הכול מוכן ליום עבודה», אבל פעולה בודדת נחסמת רק על מה שהיא באמת צריכה.
 * חסימת קריאת 134 בגלל שמע״מ לא מוכנה היא חסימה על תלות שאינה קיימת.
 *
 * shaam.read_134 (shaamSyncIncomeTaxFile): attach → probeServerSession →
 * openAdvancesInfo. כלומר עובד חי + פורטל מאומת + GMF. מע״מ ומגן אינן
 * נוגעות בו.
 *
 * ‼ אוטומציה חדשה מצהירה כאן על התלויות שלה — לא במסך שמציג אותה.
 */
export const SHAAM_CAPABILITIES: Record<string, ShaamLayer[]> = {
  'shaam.read_134': ['portal', 'gmf'],
};

/** מפתח היכולת של קריאת שאילתה 134. */
export const SHAAM_READ_134 = 'shaam.read_134';

export interface ShaamCapability {
  /** אפשר להריץ **את הפעולה הזאת** עכשיו. */
  ready: boolean;
  /** התלות שחוסמת בפועל — לא «שע״ם לא מוכנה» באופן כללי. */
  blockedReason: string | null;
}

export interface ShaamReadiness {
  /** מוכן להריץ אוטומציה **עכשיו**. ירוק בכותרת = הערך הזה, ותו לא. */
  ready: boolean;
  /** אין עובד, או שפעימת הלב שלו ישנה מדי. */
  workerOffline: boolean;
  status: AutomationWorkerStatus;
  /** מה חוסם — משפט אחד לרו"ח. null כשמוכן. */
  blockedReason: string | null;
  /**
   * מוכנות לפעולה מסוימת, נגזרת מ**אותו** מצב עובד. לא שליפה נוספת ולא
   * מקור אמת שני — רק חיתוך אחר של אותה אמת.
   */
  capability: (name: string) => ShaamCapability;
  refresh: () => Promise<void>;
}

const UNKNOWN_REASON = 'מצב החיבור לשע״ם אינו ידוע.';

const FALLBACK: ShaamReadiness = {
  ready: false,
  workerOffline: true,
  status: {},
  blockedReason: UNKNOWN_REASON,
  capability: () => ({ ready: false, blockedReason: UNKNOWN_REASON }),
  refresh: async () => {},
};

const Ctx = createContext<ShaamReadiness>(FALLBACK);

/** ‼ ברירת המחדל היא **לא מוכן**: רכיב מחוץ לספק לא יראה ירוק בטעות. */
export function useShaamReadiness(): ShaamReadiness {
  return useContext(Ctx);
}

export function ShaamReadinessProvider({ userId, children }: { userId?: string; children: ReactNode }) {
  const [status, setStatus] = useState<AutomationWorkerStatus>({});
  const [workerOffline, setWorkerOffline] = useState(true);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  const refresh = useCallback(async () => {
    if (!userId) { setWorkerOffline(true); setStatus({}); return; }
    const { data } = await supabase.from('automation_workers').select('*')
      .order('last_seen_at', { ascending: false }).limit(1).maybeSingle();
    const w = data ? automationWorkerFromDb(data) : null;
    // ‼ התיישנות דטרמיניסטית: פעימת לב ישנה מדי היא "לא יודעים", ו"לא
    // יודעים" אינו ירוק. בלי זה עובד שנפל בשקט היה נשאר ירוק לנצח.
    const stale = !w || !(Date.now() - new Date(w.lastSeenAt).getTime() < WORKER_STALE_AFTER_MS);
    setWorkerOffline(stale);
    setStatus(stale ? {} : (w?.status ?? {}));
  }, [userId]);

  useEffect(() => {
    void refresh();
    if (timer.current) clearInterval(timer.current);
    timer.current = setInterval(() => { void refresh(); }, POLL_MS);
    return () => { if (timer.current) clearInterval(timer.current); };
  }, [refresh]);

  const shaam = !!status.shaam?.connected;
  const gmf = !!status.gmf?.ready;
  const vat = !!status.vat?.ready;
  const nikui = !!status.nikui?.ready;
  const ready = !workerOffline && shaam && gmf && vat && nikui;

  const WORKER_OFF = 'מחשב האוטומציה אינו פעיל, ולכן אי אפשר לקרוא משע״ם.';
  const LAYER_REASON: Record<ShaamLayer, string> = {
    portal: 'אין חיבור פעיל לפורטל שע״ם.',
    gmf: 'מערכת גביית מס הכנסה אינה מוכנה — יש להשלים את החיבור בחלון שע״ם.',
    vat: 'מערכת מע״מ אינה מוכנה — יש להשלים את החיבור בחלון שע״ם.',
    nikui: 'מערכת מגן (ניכויים) אינה מוכנה — יש להשלים את החיבור בחלון שע״ם.',
  };
  const LAYER_OK: Record<ShaamLayer, boolean> = { portal: shaam, gmf, vat, nikui };

  const blockedReason = workerOffline ? WORKER_OFF
    : (['portal', 'gmf', 'vat', 'nikui'] as ShaamLayer[]).find(l => !LAYER_OK[l]) !== undefined
      ? LAYER_REASON[(['portal', 'gmf', 'vat', 'nikui'] as ShaamLayer[]).find(l => !LAYER_OK[l])!]
      : null;

  /**
   * ‼ נחסם רק על מה שהפעולה באמת צריכה, והסיבה מצביעה על התלות החוסמת
   * עצמה — לא על «שע״ם לא מוכנה» כללי. יכולת לא מוכרת נחשבת חסומה, כדי
   * שהוספת אוטומציה בלי הצהרת תלויות לא תיפתח בטעות.
   */
  function capability(name: string): ShaamCapability {
    if (workerOffline) return { ready: false, blockedReason: WORKER_OFF };
    const needed = SHAAM_CAPABILITIES[name];
    if (!needed) return { ready: false, blockedReason: UNKNOWN_REASON };
    const missing = needed.find(l => !LAYER_OK[l]);
    return missing
      ? { ready: false, blockedReason: LAYER_REASON[missing] }
      : { ready: true, blockedReason: null };
  }

  return (
    <Ctx.Provider value={{ ready, workerOffline, status, blockedReason, capability, refresh }}>
      {children}
    </Ctx.Provider>
  );
}

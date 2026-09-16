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
// ‼ שלושה מושגים שונים, שבעבר נדחסו לדגל "פורטל" אחד:
//   · BOOTSTRAP — פורטל שע״ם (כרטיס חכם + PIN) הוא הדרך להקים/להקים-מחדש
//     סשן. זה shaam.connect בכותרת, לא תלות של פעולת קריאה.
//   · CAPABILITY — כל תת-מערכת (GMF/מע״מ/מגן) נמדדת ונקראת **בנפרד**.
//     סשן GMF יכול להיות חי לגמרי בזמן שהפורטל דורש אימות מחדש — נצפה
//     בפועל, ולכן פעולה בודדת נחסמת רק על מה שהיא באמת צריכה.
//   · GLOBAL — הכותרת היא סיכום, לא תלות: כל הרשויות מוכנות ליום עבודה.
// ראה docs/PIVO-AUTOMATION-FOUNDATION.html לניתוח המלא של ההפרדה הזאת.
//
// ‼ הכללים, במקום אחד (עודכן 16.09.2026 — תיקון מוצר: הנורית לא ממתינה
// יותר להכנת כל היכולות):
//   · מוכנות **גלובלית** (הנורית בכותרת) = פורטל מחובר **וגם** החיבור הטרי
//     הזה עבר את שער GMF (status.shaam.bootstrapped — דגל מחזור-חיים
//     שהצופה מאפס כשהחלון נסגר), וגם פעימת הלב טרייה. מע״מ/מגן/ייצוג
//     מוכנות **בנפרד** (warmupSummary למטה) ואינן חוסמות את הנורית.
//   · מוכנות **ליכולת** נגזרת מ-SHAAM_CAPABILITIES: רק השכבות שהפעולה
//     הזאת מצהירה עליהן — בלתי תלוי בנורית הגלובלית.
//   · פעימת לב ישנה מ-WORKER_STALE_AFTER_MS ⇒ לא מוכן. מצב לא ידוע אינו
//     ירוק. אותו עיקרון חל **לכל שכבת GMF/מע״מ/מגן בנפרד**: מדידה ישנה
//     מ-SUBSYSTEM_STALE_AFTER_MS (checkedAt) נחשבת "לא ידוע" גם אם
//     ready=true — ראה ההגדרה שם למה.
//   · אין שורת עובד כלל ⇒ לא מוכן.
// שום מסך לא מוסיף כלל משלו.

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { supabase } from '../lib/supabase';
import { automationWorkerFromDb } from '../lib/dbMappers';
import { WORKER_STALE_AFTER_MS, SUBSYSTEM_STALE_AFTER_MS } from '../types/automation';
import type { AutomationWorkerStatus } from '../types/automation';

const POLL_MS = 4000;

/**
 * ‼ "מוכן" של שכבת Tier-B דורש גם checkedAt טרי — לא רק ready=true.
 * הצופה מדווח checkedAt של המדידה **הישירה** האחרונה (ראה
 * connectionMonitor.mjs), כולל כשהפורטל למטה והערך רק נשמר מסבב קודם.
 * בלי הבדיקה כאן, ערך ששמור מזמן היה מוצג "מוכן" בלי גבול זמן.
 * ‼ ברמת המודול ולא בתוך הרכיב: גם המשיכה וגם החישוב קוראים לה, ופונקציה
 * שנוצרת מחדש בכל רינדור הייתה מחזירה את בעיית הזהות מהדלת האחורית.
 */
const freshLayer = (layer?: { ready: boolean; checkedAt?: string }): boolean => {
  if (!layer?.ready || !layer.checkedAt) return false;
  return Date.now() - new Date(layer.checkedAt).getTime() < SUBSYSTEM_STALE_AFTER_MS;
};

/** שכבות שע״ם שהעובד מדווח עליהן. */
export type ShaamLayer = 'portal' | 'gmf' | 'vat' | 'nikui' | 'representation';

/**
 * 168: רשימת ברירת המחדל של warm-up, וגם סדר העדיפות שלו — לתצוגת ה-N/M
 * בפירוט הכפתור (warmupSummary) בלבד. ‼ מאז התיקון (16.09.2026): הנורית
 * הגלובלית **אינה** נגזרת מהרשימה הזו יותר — היא נגזרת מפורטל + bootstrap
 * ב-GMF (ready למטה). הרשימה שהמשרד בחר (profiles.settings.shaamWarmup.
 * capabilities) קובעת רק אילו יכולות מוצגות בסיכום ההכנה, לא את הירוק.
 * הסרה מהרשימה פירושה "לא להציג בסיכום", לא "לא זמינה" — capability()
 * למטה לא תלויה בבחירה הזאת בכלל, ראה פרק 16 §16.1.
 */
export const DEFAULT_WARMUP_LAYERS: ShaamLayer[] = ['gmf', 'vat', 'nikui', 'representation'];

/**
 * שכבה שיכולת יכולה להיות תלויה בה. ‼ `btl` אינה שכבה של שע״ם: לביטוח
 * לאומי חלון Chrome ופרופיל משלו, שער אימות משלו, ומצב חיבור שהעובד מדווח
 * בנפרד (`status.btl`). היא נכנסת לכאן כדי שיכולת אחת תדע להיחסם על
 * **התלות שלה** — ולא כדי לאחד את שני הסשנים. המוכנות הגלובלית בכותרת
 * (`ready`) ממשיכה להיגזר משכבות שע״ם בלבד, בלי שינוי.
 */
export type ReadinessLayer = ShaamLayer | 'btl';

/**
 * מה כל יכולת דורשת בפועל — נגזר מהמימוש של ה-handler, לא מהתחושה.
 *
 * ‼ «מוכנות גלובלית» ו«מוכנות לפעולה» אינם אותו דבר. הנורית בכותרת אומרת
 * «הכול מוכן ליום עבודה», אבל פעולה בודדת נחסמת רק על מה שהיא באמת צריכה.
 * חסימת קריאת 134 בגלל שמע״מ לא מוכנה היא חסימה על תלות שאינה קיימת.
 *
 * shaam.read_134 (shaamSyncIncomeTaxFile): attach → openAdvancesInfo, שבודקת
 * ישירות את GMF (נתיב, שדה סיסמה, חומת אימות). כלומר עובד חי + GMF —
 * **לא** פורטל: סשן GMF שכבר בעבודה אינו תלוי בכך שהפורטל מדווח מוכן
 * ברגע הזה, ו-handler ה-134 עצמו כבר לא בודק את הפורטל (הוסר מכוון —
 * ראה worker/src/handlers/shaamSyncIncomeTaxFile.mjs). מע״מ ומגן אינן
 * נוגעות בו כלל.
 *
 * ‼ אוטומציה חדשה מצהירה כאן על התלויות שלה — לא במסך שמציג אותה.
 */
export const SHAAM_CAPABILITIES: Record<string, ReadinessLayer[]> = {
  'shaam.read_134': ['gmf'],
  // ‼ קריאה ממע״מ תלויה בשכבת מע״מ בלבד — לא ב-GMF ולא במגן. הרשומה כאן
  // מוצהרת מראש כדי שכשייבנה ה-handler, החיבור יהיה טבלה ולא עריכת מסך.
  'shaam.read_vat': ['vat'],
  // ‼ ב״ל תלויה **רק** בחיבור ב״ל. הפרדה זו היא העיקר: סשן שע״ם שנפל
  // אינו אמור לחסום קריאה מב״ל, ולהפך.
  'btl.read_file': ['btl'],
  // ‼ 168/פרק 16 §16.5: מוכנות = גישה מאומתת ושמישה למסך רשימת המיוצגים —
  // לא הוכחת הרשאה לשדר בקשת ייצוג. אין עדיין פעולה עסקית שמשתמשת בזה;
  // מוצהר מראש לפי אותה מוסכמה (ה-134/מע״מ הוצהרו לפני שהיה handler).
  'shaam.representation_readiness': ['representation'],
};

/** מפתח היכולת של קריאת שאילתה 134. */
export const SHAAM_READ_134 = 'shaam.read_134';
/** קריאת פרטי תיק מע״מ ממערכת הגבייה. */
export const SHAAM_READ_VAT = 'shaam.read_vat';
/** קריאת פרטי תיק מפורטל המייצגים של ביטוח לאומי. */
export const BTL_READ_FILE = 'btl.read_file';
/** גישה שמישה למסך רשימת המיוצגים — לא שידור ייצוג. */
export const SHAAM_REPRESENTATION_READINESS = 'shaam.representation_readiness';

export interface ShaamCapability {
  /** אפשר להריץ **את הפעולה הזאת** עכשיו. */
  ready: boolean;
  /** התלות שחוסמת בפועל — לא «שע״ם לא מוכנה» באופן כללי. */
  blockedReason: string | null;
  /**
   * 168: השכבה הספציפית שחוסמת (gmf/vat/nikui/representation/portal), אם
   * ידועה — כדי שהמסך שמזמין את הפעולה יוכל לבקש שחזור נקודתי
   * (shaam.ensure_capability) בלי לנחש איזו capability לשלוח.
   */
  missingLayer?: ReadinessLayer;
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
  /** 168: הרשימה שהמשרד בחר להכין מראש (profiles.settings.shaamWarmup). */
  selectedLayers: ShaamLayer[];
  /** 168: סיכום N/M לפי הרשימה שנבחרה — לפירוט בכפתור הכותרת. */
  warmupSummary: { ready: number; total: number; layers: Record<ShaamLayer, boolean> };
  refresh: () => Promise<void>;
}

const UNKNOWN_REASON = 'מצב החיבור לשע״ם אינו ידוע.';

const FALLBACK: ShaamReadiness = {
  ready: false,
  workerOffline: true,
  status: {},
  blockedReason: UNKNOWN_REASON,
  capability: () => ({ ready: false, blockedReason: UNKNOWN_REASON }),
  selectedLayers: DEFAULT_WARMUP_LAYERS,
  warmupSummary: { ready: 0, total: DEFAULT_WARMUP_LAYERS.length, layers: {} as Record<ShaamLayer, boolean> },
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
  const [selectedLayers, setSelectedLayers] = useState<ShaamLayer[]>(DEFAULT_WARMUP_LAYERS);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  // ‼ נמשך פעם אחת (לא בכל תשאול 4 שניות): זו הגדרה שמשתנה לעיתים רחוקות,
  // לא מצב חי. עדכון מ-FirmProfileConsole ייכנס לתוקף ברענון/כניסה מחדש —
  // ברירת המחדל שנפתחה בפרק 16, לא מנגנון סנכרון בזמן אמת חדש.
  useEffect(() => {
    if (!userId) { setSelectedLayers(DEFAULT_WARMUP_LAYERS); return; }
    let cancelled = false;
    (async () => {
      const { data } = await supabase.from('profiles').select('settings').eq('id', userId).maybeSingle();
      if (cancelled) return;
      const configured = (data?.settings as any)?.shaamWarmup?.capabilities;
      setSelectedLayers(Array.isArray(configured) && configured.length ? configured : DEFAULT_WARMUP_LAYERS);
    })();
    return () => { cancelled = true; };
  }, [userId]);
  /**
   * ‼ פעימה שמסמנת "המסקנה השתנתה", לא "נמשך מידע". שכבת Tier-B מתיישנת
   * בזמן בלי ששום שדה במסד משתנה, ולכן בלי הפעימה הזאת ערך ששמור מזמן היה
   * נשאר "מוכן" לנצח — אין מה שיגרום לחישוב מחדש. היא עולה רק כשהמסקנה
   * באמת התהפכה, ולכן משיכה שמחזירה בדיוק את אותו מצב אינה מרנדרת דבר.
   */
  const [verdictTick, setVerdictTick] = useState(0);
  const verdictRef = useRef<string>('');

  const refresh = useCallback(async () => {
    if (!userId) {
      setWorkerOffline(true);
      setStatus(prev => (Object.keys(prev).length === 0 ? prev : {}));
      return;
    }
    const { data } = await supabase.from('automation_workers').select('*')
      .order('last_seen_at', { ascending: false }).limit(1).maybeSingle();
    const w = data ? automationWorkerFromDb(data) : null;
    // ‼ התיישנות דטרמיניסטית: פעימת לב ישנה מדי היא "לא יודעים", ו"לא
    // יודעים" אינו ירוק. בלי זה עובד שנפל בשקט היה נשאר ירוק לנצח.
    const stale = !w || !(Date.now() - new Date(w.lastSeenAt).getTime() < WORKER_STALE_AFTER_MS);
    const next: AutomationWorkerStatus = stale ? {} : (w?.status ?? {});
    setWorkerOffline(stale);
    // ‼ שומרים את הזהות כשהתוכן זהה. אובייקט חדש בכל משיכה הוא ערך חדש
    // בכל הקוראים, וזה מה שהפך פעימה של 4 שניות לרינדור של כל העץ.
    setStatus(prev => (JSON.stringify(prev) === JSON.stringify(next) ? prev : next));
    const verdict = [
      stale, freshLayer(next.gmf), freshLayer(next.vat), freshLayer(next.nikui), freshLayer(next.representation),
      !!next.shaam?.connected, !!next.shaam?.bootstrapped, !!next.btl?.connected,
    ].join('|');
    if (verdict !== verdictRef.current) {
      verdictRef.current = verdict;
      setVerdictTick(t => t + 1);
    }
  }, [userId]);

  useEffect(() => {
    void refresh();
    if (timer.current) clearInterval(timer.current);
    // ‼ לשונית ברקע לא מושכת: אין מי שיראה את הנורית, והמשיכה כל 4 שניות
    // המשיכה גם כשהחלון היה ממוזער שעות. בחזרה ללשונית מושכים מיד.
    timer.current = setInterval(() => {
      if (document.visibilityState !== 'visible') return;
      void refresh();
    }, POLL_MS);
    const onVisible = () => { if (document.visibilityState === 'visible') void refresh(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      if (timer.current) clearInterval(timer.current);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [refresh]);

  /**
   * ‼ ערך הקשר יציב. קודם הוא נבנה מחדש בכל רינדור, וצרכן אחד
   * (useAuthorityConnections) החזיק אותו ברשימת התלויות של useCallback —
   * ולכן כל משיכה יצרה refresh חדש, שהריץ את ה-effect, שמשך שוב. לולאה
   * שהוגבלה רק בזמן הרשת: ~22 בקשות בשנייה בכל מסך, בלי הפסקה.
   * ראה docs/AUDIT-STATE-CONSISTENCY-2026-09-04.md §7.
   */
  const value = useMemo<ShaamReadiness>(() => {
    const shaam = !!status.shaam?.connected;
    const gmf = freshLayer(status.gmf);
    const vat = freshLayer(status.vat);
    const nikui = freshLayer(status.nikui);
    const representation = freshLayer(status.representation);

    const WORKER_OFF = 'מחשב האוטומציה אינו פעיל, ולכן אי אפשר לקרוא משע״ם.';
    const LAYER_REASON: Record<ReadinessLayer, string> = {
      portal: 'אין חיבור פעיל לפורטל שע״ם.',
      gmf: 'מערכת גביית מס הכנסה אינה מוכנה — יש להשלים את החיבור בחלון שע״ם.',
      vat: 'מערכת מע״מ אינה מוכנה — יש להשלים את החיבור בחלון שע״ם.',
      nikui: 'מערכת מגן (ניכויים) אינה מוכנה — יש להשלים את החיבור בחלון שע״ם.',
      representation: 'מערכת רישום הייצוג אינה מוכנה — יש להשלים התחברות נפרדת בחלון שע״ם.',
      btl: 'אין חיבור פעיל לביטוח לאומי — יש להתחבר מהכפתור «ביטוח לאומי» בכותרת.',
    };
    // ‼ ב״ל נגזרת מ-status.btl בלבד, ולא מאף שכבת שע״ם. «הדפדפן פתוח» אינו
    // מוכנות: הצופה מדווח connected רק אחרי שראה סשן מאומת בחלון של ב״ל.
    const LAYER_OK: Record<ReadinessLayer, boolean> = {
      portal: shaam, gmf, vat, nikui, representation,
      btl: !workerOffline && !!status.btl?.connected,
    };

    // ‼ תיקון מוצר (16.09.2026): הנורית הגלובלית = פורטל + bootstrap ב-GMF
    // של החיבור הטרי (דגל מחזור-חיים מהצופה, בלי התיישנות שעון — אחרת
    // הירוק היה נופל 10 דקות אחרי שהצופה עבר למע״מ). מע״מ/מגן/ייצוג הן
    // "מוכנות ליכולת" ולא תנאי לחיבור — ראה ההערה הראשית. warmupLayers/
    // warmupSummary נשארים לתצוגת "N מתוך M" בפירוט הכפתור — לא קלט ל-ready.
    const bootstrapped = !!status.shaam?.bootstrapped;
    const warmupLayers = selectedLayers.length ? selectedLayers : DEFAULT_WARMUP_LAYERS;
    const ready = !workerOffline && shaam && bootstrapped;

    const blockedReason = workerOffline ? WORKER_OFF
      : !shaam ? LAYER_REASON.portal
      : !bootstrapped ? LAYER_REASON.gmf
      : null;

    const warmupSummary = {
      ready: warmupLayers.filter(l => LAYER_OK[l]).length,
      total: warmupLayers.length,
      layers: Object.fromEntries(warmupLayers.map(l => [l, LAYER_OK[l]])) as Record<ShaamLayer, boolean>,
    };

    /**
     * ‼ נחסם רק על מה שהפעולה באמת צריכה, והסיבה מצביעה על התלות החוסמת
     * עצמה — לא על «שע״ם לא מוכנה» כללי. יכולת לא מוכרת נחשבת חסומה, כדי
     * שהוספת אוטומציה בלי הצהרת תלויות לא תיפתח בטעות. ‼ לא תלוי ב-selectedLayers
     * בכוונה: הסרה מרשימת ה-warm-up אינה ביטול היכולת (פרק 16 §16.1).
     */
    function capability(name: string): ShaamCapability {
      if (workerOffline) return { ready: false, blockedReason: WORKER_OFF };
      const needed = SHAAM_CAPABILITIES[name];
      if (!needed) return { ready: false, blockedReason: UNKNOWN_REASON };
      const missing = needed.find(l => !LAYER_OK[l]);
      return missing
        ? { ready: false, blockedReason: LAYER_REASON[missing], missingLayer: missing }
        : { ready: true, blockedReason: null };
    }

    return { ready, workerOffline, status, blockedReason, capability, selectedLayers: warmupLayers, warmupSummary, refresh };
    // ‼ verdictTick נמצא כאן בכוונה אף שאינו נקרא בגוף: הוא מה שמכריח חישוב
    // מחדש כששכבה התיישנה בזמן בלי ששום שדה השתנה.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, workerOffline, refresh, verdictTick, selectedLayers]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

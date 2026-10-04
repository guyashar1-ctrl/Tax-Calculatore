// ─── טוען «מוכן לשליחה» — לקוח אחד פעיל, תשובות ישנות נזרקות ─────────────────
// ‼ הרגרסיה (22.09.2026, ייצור): מעבר לקוח א' → לקוח ב' בלי רענון השאיר במגש
// «שלח בקשות» את הפריטים והנמענים של א' תחת השם של ב'. שתי סיבות, שתיהן כאן:
//   1. המצב הקודם נשאר על המסך עד שהתשובה של ב' הגיעה (ולא אופס מיד).
//   2. בקשה שיצאה עבור א' (רענון מאוחר) יכלה להגיע **אחרי** התשובה של ב'
//      ולדרוס אותה — מרוץ בין שתי תשובות של שני לקוחות.
// הפתרון: מונה בקשה + הלקוח הפעיל. תשובה מתקבלת רק אם היא של הבקשה האחרונה
// **וגם** של הלקוח שעדיין פעיל. הכול כאן טהור (בלי React, בלי supabase) —
// כדי שאפשר יהיה לבדוק את המרוץ בסקריפט (scripts/test-ready-to-send-race.ts).

export interface ReadyOwnerItem {
  stepId: string;
  stepType: string;
  title?: string;
  publishedAt: string;
  /** תוכן שהשתנה אחרי הפרסום (פריט שנוסף, עריכה שפורסמה, פתיחה מחדש) — 192. */
  changedAt?: string;
  /**
   * איך הפריט מגיע ללקוח (שלב במסלול: auto / approve / hold; בלי — כמו approve).
   * ‼ המייל שיוצא לבד כולל רק פריטים של 'auto' מריצה שאינה בעצירה (214) —
   * כל השאר יוצאים רק במייל שהרו"ח שולח.
   */
  delivery?: string;
}

export interface ReadyPerson {
  role: 'client' | 'spouse';
  name: string;
  email?: string;
  stepId: string;
  requestId: string;
  referenceNumber: string;
  deadline?: string;
}

/** 214: פריט בהודעה — מה שהשרת יפרט במייל (נבחר שם, לא בדפדפן). */
export interface ReadyNoticeItem {
  stepId: string;
  stepType: string;
  version: number;
  title?: string;
  isDocument?: boolean;
  delivery?: string;
}

/**
 * למה לא ידוע אם המייל יצא — נקבע בשרת (client_ready_to_send). ‼ אף אחת מהסיבות
 * אינה «לא נשלח»: בכולן ייתכן שהמייל הגיע.
 */
export type UnknownCause = 'cut_off' | 'no_answer' | 'provider_error' | 'provider_busy' | 'accepted_no_id' | 'retry_rejected';

/**
 * הודעה ללקוח שלא ידוע אם יצאה. ‼ השדות שאחרי `items` חדשים (214, client_ready_to_send) —
 * שרת ישן לא שולח אותם, ואז `at` הוא הניסיון האחרון והמגש נופל למסלול השמרני
 * (unknownRowModel). ‼ השרת עוטף ב-jsonb_strip_nulls (רקורסיבי): שדה שערכו null
 * (retryUntil, toEmail, subject…) מגיע חסר ולא null — ולכן כולם אופציונליים.
 */
export interface ReadyUnknownNotice {
  noticeId: string;
  /** הניסיון הראשון (שרת ישן: הניסיון האחרון). */
  at: string;
  kind: string;
  subject?: string | null;
  items: number;
  /** הניסיון האחרון. */
  lastTriedAt?: string | null;
  /** עד מתי «שלח שוב (אותו מייל)» לא ישלח פעמיים (23 שעות מהניסיון הראשון). null — אין גוף לשלוח שוב. */
  retryUntil?: string | null;
  /** לאן נשלח (אם בכלל) — הכתובת שנתפסה בשליחה. */
  toEmail?: string | null;
  /** הכתובת בכרטיס שונה מ-toEmail (נקבע בשרת). */
  recipientChanged?: boolean;
  /** 'auto' — הופעלה לבד לפי המסלול; 'manual' — בלחיצה. */
  origin?: string | null;
  attempts?: number | null;
  cause?: UnknownCause | string | null;
  /** הבקשות שבמייל, ואם הן עדיין פתוחות. */
  itemList?: { title: string; stillOpen: boolean }[];
}

export interface ReadyToSend {
  owner: {
    email?: string;
    lastSentAt?: string | null;
    /** «חדש» — גרסה שטרם נמסרה ללקוח (214; קודם: השוואת זמנים, 192). */
    items: ReadyOwnerItem[];
    /** טביעת הפריטים — נשלחת בחזרה בשליחה; שונה ⇒ items_changed. */
    fingerprint?: string;
    /** מה שכבר נמסר ועדיין פתוח — לתזכורת. */
    reminder?: { items: ReadyNoticeItem[]; fingerprint?: string; lastReminderAt?: string | null };
    /** הודעה אוטומטית שממתינה בתור (שלב «לבד»). */
    queued?: { noticeId: string; dueAt: string; kind: string; kickAttempts?: number; lastKickedAt?: string | null } | null;
    /** הודעות שלא ידוע אם יצאו — חוסמות «חדש» עד הכרעה. */
    unknown?: ReadyUnknownNotice[];
    /** הודעה בתנועה עכשיו (חכירה חיה). */
    inFlight?: boolean;
  };
  persons: ReadyPerson[];
}

export const EMPTY_READY: ReadyToSend = { owner: { items: [] }, persons: [] };

export type ReadyRpcResult =
  | { data: (Partial<ReadyToSend> & { ok?: boolean; error?: string }) | null; error: { message: string } | null };

export interface ReadyLoaderState {
  clientId: string | undefined;
  ready: ReadyToSend;
  loading: boolean;
  error: string | null;
}

/**
 * יוצר טוען עם לקוח פעיל אחד. `setClient` מאפס מיד; `load` מביא ומתעלם
 * מתשובות שאינן של הבקשה האחרונה של הלקוח הפעיל.
 */
export function createReadyToSendLoader(
  rpc: (clientId: string) => Promise<ReadyRpcResult>,
  onChange: (state: ReadyLoaderState) => void,
) {
  let state: ReadyLoaderState = { clientId: undefined, ready: EMPTY_READY, loading: false, error: null };
  let seq = 0;
  const emit = (patch: Partial<ReadyLoaderState>) => { state = { ...state, ...patch }; onChange(state); };

  return {
    /** מעבר לקוח: מאפס מיד את מה שמוצג — שום דבר של הלקוח הקודם לא נשאר על המסך. */
    setClient(clientId: string | undefined) {
      if (clientId === state.clientId) return;
      seq++;
      emit({ clientId, ready: EMPTY_READY, loading: !!clientId, error: null });
    },
    async load() {
      const cid = state.clientId;
      if (!cid) { emit({ ready: EMPTY_READY, loading: false, error: null }); return; }
      const my = ++seq;
      emit({ loading: true });
      let result: ReadyRpcResult;
      try {
        result = await rpc(cid);
      } catch (e) {
        result = { data: null, error: { message: e instanceof Error ? e.message : String(e) } };
      }
      // ‼ תשובה ישנה (בקשה מאוחרת יותר יצאה) או של לקוח אחר — נזרקת.
      if (my !== seq || state.clientId !== cid) return;
      const res = result.data;
      if (result.error || !res?.ok) {
        emit({ loading: false, error: result.error?.message ?? res?.error ?? 'לא הצלחתי לבדוק מה מוכן לשליחה.' });
        return;
      }
      emit({
        loading: false,
        error: null,
        ready: {
          // ‼ כל שדות 214 עוברים (טביעה, תזכורת, תור, לא-ידוע, בתנועה) — העתקה
          // של שלושה שדות בלבד השמיטה אותם בשקט, והמגש לא ראה הודעה שלא ידוע אם יצאה.
          owner: { ...res.owner, email: res.owner?.email, lastSentAt: res.owner?.lastSentAt ?? null, items: res.owner?.items ?? [] },
          persons: res.persons ?? [],
        },
      });
    },
    get state() { return state; },
  };
}

/** כמה מיילים ייצאו מ«שלח בקשות» — נמען לכל קבוצה. */
export function readyRecipientCount(r: ReadyToSend): number {
  return (r.owner.items.length > 0 ? 1 : 0) + r.persons.length;
}

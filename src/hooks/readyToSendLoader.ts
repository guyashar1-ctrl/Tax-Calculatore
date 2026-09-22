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

export interface ReadyToSend {
  owner: { email?: string; lastSentAt?: string | null; items: ReadyOwnerItem[] };
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
          owner: { email: res.owner?.email, lastSentAt: res.owner?.lastSentAt ?? null, items: res.owner?.items ?? [] },
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

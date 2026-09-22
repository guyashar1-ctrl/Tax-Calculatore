// ─── מה מוכן לצאת ללקוח ולאנשי משק הבית — קריאה אחת, מקור אחד ─────────────────
// עוטף את client_ready_to_send (מיגרציה 192). המגש «שלח בקשות», גלולת
// «טרם נשלח» על הכרטיסים ותת-הכותרת «הדף נשלח לאחרונה…» קוראים כולם מכאן —
// אם היו גוזרים כל אחד לבד, המונים היו סוטים זה מזה כמו "פתוחות" הישן.
//
// ‼ מעבר לקוח בלי רענון: המצב מתאפס מיד, ותשובה של הלקוח הקודם שמגיעה
// באיחור נזרקת (ראה readyToSendLoader — שם הלוגיקה, כאן רק החיבור ל-React).

import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabase';
import { createReadyToSendLoader, EMPTY_READY, type ReadyLoaderState, type ReadyRpcResult } from './readyToSendLoader';

export type { ReadyOwnerItem, ReadyPerson, ReadyToSend } from './readyToSendLoader';
export { EMPTY_READY, readyRecipientCount } from './readyToSendLoader';

const rpc = async (clientId: string): Promise<ReadyRpcResult> => {
  const { data, error } = await supabase.rpc('client_ready_to_send', { p_client_id: clientId });
  return { data: data as ReadyRpcResult['data'], error: error ? { message: error.message } : null };
};

export function useReadyToSend(clientId: string | undefined, refreshKey: unknown) {
  const [state, setState] = useState<ReadyLoaderState>({ clientId, ready: EMPTY_READY, loading: !!clientId, error: null });
  // טוען אחד לכל חיי הרכיב — המונה שלו הוא מה שמגן מפני תשובה ישנה.
  const loader = useMemo(() => createReadyToSendLoader(rpc, setState), []);

  // ‼ שינוי לקוח מאפס לפני הבאה — הרינדור הבא כבר מציג "ריק/טוען", לא את הקודם.
  useEffect(() => { loader.setClient(clientId); }, [loader, clientId]);
  useEffect(() => { void loader.load(); }, [loader, clientId, refreshKey]);

  // ‼ מצב של לקוח אחר לעולם לא מוצג — גם אם setState רץ לפני ש-setClient הספיק.
  const current = state.clientId === clientId ? state : { clientId, ready: EMPTY_READY, loading: !!clientId, error: null };
  return { ready: current.ready, loading: current.loading, error: current.error, reload: () => loader.load() };
}

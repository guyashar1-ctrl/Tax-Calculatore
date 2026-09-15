import { useCallback, useEffect, useRef, useState } from 'react';
import type { Client, LifecycleStage } from '../types';
import { supabase } from '../lib/supabase';
import { clientFromDb, clientToDb, clientPatchToDb, sameValue } from '../lib/dbMappers';
import { keepIfSame } from './useLivePulse';
import { GOVERNED_FACT_KEYS, GOVERNED_FIELD_LABELS } from '../types/taxFacts';
import { SAMPLE_CLIENTS } from '../data/sampleClients';
import { enrichClientsWithWorkspace } from '../data/sampleClientWorkspace';

/** מה המסך יודע על השמירה: אילו שדות המשתמש ערך, ועל איזו גרסה של השורה. */
export interface ClientSaveMeta {
  /** מפתחות Client (camelCase) שהמשתמש ערך בפועל. בלעדיהם — הבדל מול המטמון. */
  fields?: readonly string[];
  /** updated_at של העותק שהמסך טען. מסירה = בדיקה קפדנית: stale נזרק, לא נכתב. */
  expectedUpdatedAt?: string;
}

/** השורה השתנתה בשרת מאז שנטענה; `fresh` הוא מה שיש שם עכשיו. שום דבר לא נכתב. */
export class StaleClientError extends Error {
  readonly fresh: Client;
  constructor(fresh: Client) {
    super('הכרטיס עודכן בינתיים במקום אחר (למשל מהדף האישי של הלקוח או מיישור קו). טענו את הגרסה העדכנית — השינויים שלך נשארו במסך; בדוק אותם ולחץ שמור שוב.');
    this.name = 'StaleClientError';
    this.fresh = fresh;
  }
}

interface UpdateClientFieldsResult {
  ok: boolean;
  error?: string;
  field?: string;
  client?: Record<string, unknown>;
}

function updateClientErrorMessage(res: UpdateClientFieldsResult): string {
  switch (res.error) {
    case 'unauthenticated': return 'לא מחובר — יש להתחבר מחדש.';
    case 'forbidden': return 'אין הרשאה לערוך את הכרטיס הזה.';
    case 'client_not_found': return 'הכרטיס לא נמצא (ייתכן שנמחק).';
    case 'governed_field': return `השדה "${res.field}" הוא עובדת מס מנוהלת ונכתב רק דרך תיק המס.`;
    case 'blocked_field': return `השדה "${res.field}" נכתב על ידי השרת בלבד.`;
    case 'unknown_field': return `שדה לא מוכר: "${res.field}".`;
    default: return `שמירת הכרטיס נכשלה: ${res.error ?? 'שגיאה לא ידועה'}`;
  }
}

// DEV-only local brand-QA seed (see DEV_BYPASS_AUTHZ in useAuth). Compiled out of prod builds.
// ‼ ?real-clients מכבה רק את ההזרקה ומשאיר את מעקף ההרשאה: בלי זה אי אפשר
// לבדוק מקומית זרימה שכותבת למסד, כי לקוחות הדמה אינם שייכים לחשבון ולכן כל
// קריאה לשרת עליהם חוזרת כ"אין הרשאה".
const DEV_SEED = import.meta.env.DEV
  && import.meta.env.VITE_DEV_BYPASS_AUTHZ === 'true'
  && !(typeof window !== 'undefined'
    && new URLSearchParams(window.location.search).has('real-clients'));
const DEV_CLIENTS = DEV_SEED ? enrichClientsWithWorkspace(SAMPLE_CLIENTS) : [];

export function useClients(userId: string | undefined) {
  const [clients, setClients] = useState<Client[]>(DEV_CLIENTS);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // העותק העדכני ביותר שבזיכרון — הבסיס ל"מה באמת השתנה" בשמירה חלקית.
  const clientsRef = useRef(clients);
  clientsRef.current = clients;

  useEffect(() => {
    if (DEV_SEED) { setClients(DEV_CLIENTS); setLoading(false); return; }
    if (!userId) {
      setClients([]);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    (async () => {
      const { data, error } = await supabase
        .from('clients')
        .select('*')
        .order('created_at', { ascending: true });
      if (cancelled) return;
      if (error) {
        setError(error.message);
        setLoading(false);
        return;
      }
      setClients((data ?? []).map(clientFromDb));
      setError(null);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [userId]);

  /**
   * ‼ lifecycle_stage נגזר בשרת (טריגר על quotations/engagements), ולכן שליחת
   * הצעה משנה את שלב הכרטיס בלי שהדפדפן כתב אליו כלום. בלי המשיכה הזו הכרטיס
   * נשאר על הערך שנטען בכניסה למערכת — וכך דף המסע הציג "לבנות הצעת מחיר"
   * דקות אחרי שההצעה כבר נשלחה, עד שהמשתמש רענן את הדף.
   * משמשת גם כשהכרטיס נולד בשרת (ensure_client_for_quotation) ועדיין אינו
   * ברשימה המקומית — ולכן מוסיפה ולא רק מחליפה.
   */
  async function refreshClient(id: string): Promise<Client | null> {
    if (DEV_SEED) return null;
    const { data, error } = await supabase.from('clients').select('*').eq('id', id).maybeSingle();
    if (error || !data) return null;
    const fresh = clientFromDb(data);
    setClients(prev => prev.some(c => c.id === fresh.id)
      ? prev.map(c => c.id === fresh.id ? fresh : c)
      : [...prev, fresh]);
    return fresh;
  }

  /** משיכה שקטה של כל הרשימה — בלי מצב טעינה, לשימוש הפעימה החיה. */
  const refreshClients = useCallback(async () => {
    if (DEV_SEED || !userId) return;
    const { data, error } = await supabase
      .from('clients')
      .select('*')
      .order('created_at', { ascending: true });
    if (error) return;
    // ‼ פעימה שלא שינתה דבר לא מחליפה את המערך — ראה keepIfSame.
    const next = (data ?? []).map(clientFromDb);
    setClients(prev => keepIfSame(prev, next));
  }, [userId]);

  async function addClient(client: Client): Promise<Client> {
    if (!userId) throw new Error('Not signed in');
    const row = clientToDb(client, userId);
    const { data, error } = await supabase.from('clients').insert(row).select().single();
    if (error) {
      console.error('addClient failed:', error, 'row sent:', row);
      throw error;
    }
    const inserted = clientFromDb(data);
    setClients(prev => [...prev, inserted]);
    return inserted;
  }

  /**
   * ‼ שמירה חלקית — המנגנון היחיד לעדכון כרטיס מהדפדפן (A8/T2, 166).
   *
   * הגרסה הקודמת החזירה למסד את *כל* השורה מהעותק שבזיכרון. העותק הזה נטען
   * בכניסה למערכת, ובינתיים השרת כותב לכרטיס בעצמו (שלב חיים, עובדות מס
   * מיישור קו, provenance ב-field_meta, מצב ייצוג) — וכל שמירה של שדה אחד
   * דרסה בשקט את כולם. עכשיו:
   *  1. נשלחים רק השדות שהשתנו: `meta.fields` כשהמסך יודע מה המשתמש ערך
   *     (ClientWorkspace), ואחרת ההבדל מול העותק העדכני ביותר שבזיכרון —
   *     שהוא בדיוק הבסיס שהקוראים ב-App פורשים ממנו (`{ ...c, ...patch }`).
   *  2. עובדות מס מנוהלות (GOVERNED_FACT_KEYS) אינן נכתבות ישירות — הן
   *     עוברות ב-p_facts דרך record_manual_fact_change, באותה טרנזקציה.
   *  3. בדיקת updated_at בשרת: אם השורה השתנתה מאז שנטענה, השרת מחזיר
   *     'stale' ולא כותב כלום. עם `meta.expectedUpdatedAt` (המסך) זה נזרק
   *     כ-StaleClientError עם השורה העדכנית, כדי שהמסך יטען אותה ויאמר
   *     למשתמש. בלי meta (קורא תכנותי שכוונתו היא ה-patch עצמו) מנסים פעם
   *     אחת נוספת על השורה העדכנית — עדיין רק מפתחות ה-patch, ולא דריסה.
   */
  async function updateClient(client: Client, meta?: ClientSaveMeta): Promise<Client> {
    // כרטיס שעוד לא במטמון (נולד בשרת לפני רגע) — מושכים אותו קודם, אחרת
    // "ההבדל" היה כל השדות, כולל עובדות מנוהלות שאיש לא ערך.
    const base = clientsRef.current.find(c => c.id === client.id)
      ?? (await refreshClient(client.id)) ?? undefined;
    const src = client as unknown as Record<string, unknown>;
    const baseRec = (base ?? {}) as unknown as Record<string, unknown>;
    const keys = meta?.fields
      ? Array.from(new Set(meta.fields))
      : Array.from(new Set([...Object.keys(src), ...Object.keys(baseRec)]))
          .filter(k => !base || !sameValue(src[k], baseRec[k]));

    const plain: Partial<Client> = {};
    const facts: Record<string, unknown> = {};
    for (const k of keys) {
      if (k === 'id' || k === 'userId' || k === 'createdAt' || k === 'updatedAt') continue;
      if (GOVERNED_FACT_KEYS.has(k)) {
        const v = src[k];
        // '' לעמודת מספר/תאריך נופל בשרת; ניקוי עובדה = null (מיגרציה 145).
        facts[k] = v === undefined || v === '' ? null : v;
      } else {
        (plain as Record<string, unknown>)[k] = src[k];
      }
    }
    const patch = clientPatchToDb(plain);
    const hasFacts = Object.keys(facts).length > 0;
    if (Object.keys(patch).length === 0 && !hasFacts) return base ?? client;

    const factsLabel = hasFacts
      ? `עדכון בתיק · ${Object.keys(facts).map(k => GOVERNED_FIELD_LABELS[k] ?? k).join(', ')}`
      : null;

    const call = (expected: string | null) => supabase.rpc('update_client_fields', {
      p_client_id: client.id,
      p_patch: patch,
      p_expected_updated_at: expected,
      p_facts: hasFacts ? facts : null,
      p_facts_label: factsLabel,
    });

    let { data, error } = await call(meta?.expectedUpdatedAt ?? base?.updatedAt ?? null);
    if (error) throw new Error(`שמירת הכרטיס נכשלה: ${error.message}`);
    let res = data as UpdateClientFieldsResult;

    if (!res.ok && res.error === 'stale' && res.client) {
      const fresh = clientFromDb(res.client);
      setClients(prev => prev.map(c => c.id === fresh.id ? fresh : c));
      if (meta?.expectedUpdatedAt) throw new StaleClientError(fresh);
      console.warn('[clients] הכרטיס השתנה בשרת מאז הטעינה — מנסים שוב את אותו patch על השורה העדכנית:', Object.keys(patch));
      ({ data, error } = await call(fresh.updatedAt));
      if (error) throw new Error(`שמירת הכרטיס נכשלה: ${error.message}`);
      res = data as UpdateClientFieldsResult;
    }

    if (!res.ok) {
      if (res.error === 'stale' && res.client) throw new StaleClientError(clientFromDb(res.client));
      throw new Error(updateClientErrorMessage(res));
    }
    const updated = clientFromDb(res.client!);
    setClients(prev => prev.some(c => c.id === updated.id)
      ? prev.map(c => c.id === updated.id ? updated : c)
      : [...prev, updated]);
    return updated;
  }

  /**
   * העברה לארכיון והחזרה ממנו — הכתיבה היחידה של lifecycle_stage מהדפדפן.
   * כותבת את העמודה הזו בלבד, ולכן אינה יכולה לדרוס שדה אחר בכרטיס.
   * החזרה מארכיון נכתבת כ-'active'; ריצת refresh_lifecycle_stages היומית
   * תדייק אותה לשלב האמיתי (למשל 'onboarding') אם צריך.
   */
  async function setClientLifecycleStage(id: string, stage: LifecycleStage): Promise<void> {
    const { data, error } = await supabase
      .from('clients')
      .update({ lifecycle_stage: stage })
      .eq('id', id)
      .select()
      .single();
    if (error) throw error;
    const updated = clientFromDb(data);
    setClients(prev => prev.map(c => c.id === updated.id ? updated : c));
  }

  /**
   * מציב לקוח שכבר נכתב בשרת (למשל דרך RPC טרנזקציוני כמו
   * accept_tax_fact_change/record_manual_fact_change) בקאש המקומי, בלי
   * כתיבה נוספת. מיועד לכיווץ סטייל אחרי כתיבה שקרתה מחוץ ל-updateClient.
   */
  function applyClientLocally(client: Client): void {
    setClients(prev => prev.map(c => c.id === client.id ? client : c));
  }

  /**
   * ‼ מחיקה דרך delete_client (169) ולא DELETE ישיר: הצעות שטרם אושרו מבוטלות
   * עם אירוע, בקשות הייצוג נמחקות, והמסד מסרב כשיש התקשרות חיה — אלא אם
   * הדיאלוג העביר `force` אחרי שהמשתמש ראה את האזהרה. ראה ClientDeleteDialog.
   */
  async function deleteClient(id: string, opts?: { force?: boolean }): Promise<void> {
    const { data, error } = await supabase.rpc('delete_client', {
      p_client_id: id, p_force: !!opts?.force,
    });
    if (error) throw new Error(`מחיקת הלקוח נכשלה: ${error.message}`);
    const res = data as { ok: boolean; error?: string; storage_paths?: string[] } | null;
    if (!res?.ok) {
      if (res?.error === 'active_engagement') {
        throw new Error('ללקוח יש התקשרות פעילה על הצעה מאושרת. המחיקה נעצרה.');
      }
      if (res?.error === 'not_found') {
        // כבר לא קיים — מסירים מהרשימה המקומית וזהו.
        setClients(prev => prev.filter(c => c.id !== id));
        return;
      }
      throw new Error(`מחיקת הלקוח נכשלה: ${res?.error ?? 'שגיאה לא ידועה'}`);
    }
    // ‼ הקבצים באחסון נמחקים רק דרך ה-Storage API (Supabase חוסמת מחיקה
    // ב-SQL). השרת החזיר את הנתיבים של המסמכים שנמחקו בגרירה — מוחקים אותם
    // כאן, אחרת הם נשארים יתומים באחסון בלי שום מסך שרואה אותם.
    const paths = res.storage_paths ?? [];
    if (paths.length > 0) {
      const { error: rmErr } = await supabase.storage.from('client-documents').remove(paths);
      if (rmErr) console.warn('[deleteClient] מחיקת הקבצים מהאחסון נכשלה', paths, rmErr);
    }
    setClients(prev => prev.filter(c => c.id !== id));
  }

  /**
   * קישור שני כרטיסים כבני זוג — כתיבה אחת בשרת לשני הצדדים (169).
   * ‼ במקום addClient + updateClient נפרדים: כישלון של השני השאיר קישור
   * חד-כיווני. השרת מסרב אם אחד מהם כבר מקושר לאדם אחר.
   */
  async function linkSpouseClients(aId: string, bId: string): Promise<void> {
    const { data, error } = await supabase.rpc('link_spouse_clients', { p_a: aId, p_b: bId });
    if (error) throw new Error(`קישור בני הזוג נכשל: ${error.message}`);
    const res = data as { ok: boolean; error?: string } | null;
    if (!res?.ok) {
      throw new Error(res?.error === 'already_linked'
        ? 'אחד הכרטיסים כבר מקושר לבן/בת זוג אחר/ת. יש לנתק קודם.'
        : `קישור בני הזוג נכשל: ${res?.error ?? 'שגיאה לא ידועה'}`);
    }
    await Promise.all([refreshClient(aId), refreshClient(bId)]);
  }

  /** ניתוק הקישור משני הצדדים. הכרטיס השני נשאר לקוח — רק לא "בן/בת הזוג של". */
  async function unlinkSpouseClients(id: string): Promise<void> {
    const { data, error } = await supabase.rpc('unlink_spouse_clients', { p_a: id });
    if (error) throw new Error(`ניתוק בני הזוג נכשל: ${error.message}`);
    const res = data as { ok: boolean; error?: string; partner?: string | null } | null;
    if (!res?.ok) throw new Error(`ניתוק בני הזוג נכשל: ${res?.error ?? 'שגיאה לא ידועה'}`);
    await Promise.all([refreshClient(id), res.partner ? refreshClient(res.partner) : Promise.resolve(null)]);
  }

  async function bulkAddClients(toAdd: Client[]): Promise<Client[]> {
    if (!userId) throw new Error('Not signed in');
    if (toAdd.length === 0) return [];
    const rows = toAdd.map(c => clientToDb(c, userId));
    const { data, error } = await supabase.from('clients').insert(rows).select();
    if (error) throw error;
    const inserted = (data ?? []).map(clientFromDb);
    setClients(prev => [...prev, ...inserted]);
    return inserted;
  }

  return {
    clients, loading, error, addClient, updateClient, deleteClient, bulkAddClients,
    setClientLifecycleStage, applyClientLocally, refreshClient, refreshClients,
    linkSpouseClients, unlinkSpouseClients,
  };
}

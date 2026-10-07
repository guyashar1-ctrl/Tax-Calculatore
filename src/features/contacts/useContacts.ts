// ─── אנשי קשר — טעינה ושמירה ────────────────────────────────────────────────
// הדפדפן כותב ישירות (RLS: רק לבעלים, ורק למשתמש מורשה — 226). גם calendar-meeting
// שומר איש קשר כשמסמנים «שמור כאיש קשר» בזימון; לכן רענון אחרי שליחת זימון.

import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { contactFromDb, contactToDb, type Contact } from './contactModel';

export interface ContactsApi {
  contacts: Contact[];
  loading: boolean;
  refresh: () => Promise<void>;
  add: (c: Omit<Contact, 'id'>) => Promise<Contact>;
  update: (c: Partial<Contact> & { id: string }) => Promise<Contact>;
  remove: (id: string) => Promise<void>;
}

/** ‼ 23505 = אותו מייל כבר שמור (אינדקס ייחודי) — אומרים את זה בעברית. */
function friendly(error: { code?: string; message?: string }): Error {
  if (error.code === '23505') return new Error('כבר יש איש קשר עם המייל הזה.');
  return new Error('השמירה נכשלה. נסו שוב.');
}

export function useContacts(userId: string | undefined): ContactsApi {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!userId) return;
    const { data, error } = await supabase.from('contacts').select('*').order('full_name', { ascending: true });
    if (!error) setContacts((data ?? []).map(contactFromDb));
    setLoading(false);
  }, [userId]);

  useEffect(() => {
    if (!userId) { setContacts([]); setLoading(false); return; }
    refresh();
  }, [userId, refresh]);

  const add = useCallback(async (c: Omit<Contact, 'id'>) => {
    if (!userId) throw new Error('Not signed in');
    const { data, error } = await supabase.from('contacts')
      .insert({ ...contactToDb(c), user_id: userId }).select().single();
    if (error) throw friendly(error);
    const row = contactFromDb(data);
    setContacts(prev => [...prev, row]);
    return row;
  }, [userId]);

  const update = useCallback(async (c: Partial<Contact> & { id: string }) => {
    const { data, error } = await supabase.from('contacts').update(contactToDb(c)).eq('id', c.id).select().single();
    if (error) throw friendly(error);
    const row = contactFromDb(data);
    setContacts(prev => prev.map(x => (x.id === row.id ? row : x)));
    return row;
  }, []);

  const remove = useCallback(async (id: string) => {
    const { error } = await supabase.from('contacts').delete().eq('id', id);
    if (error) throw new Error('המחיקה נכשלה. נסו שוב.');
    setContacts(prev => prev.filter(x => x.id !== id));
  }, []);

  return { contacts, loading, refresh, add, update, remove };
}

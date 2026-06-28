import { useEffect, useState } from 'react';
import type { FirmProfile } from '../types/firmProfile';
import { supabase } from '../lib/supabase';
import { profileFromDb, profileToDb } from '../lib/dbMappers';

export function useFirmProfile(userId: string | undefined) {
  const [profile, setProfile] = useState<FirmProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!userId) {
      setProfile(null);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    (async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .single();
      if (cancelled) return;
      if (error) {
        setError(error.message);
        setLoading(false);
        return;
      }
      setProfile(profileFromDb(data));
      setError(null);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [userId]);

  /** שמירת הפרופיל (הרשומה כבר קיימת מרגע ההרשמה — עדכון בלבד). */
  async function saveProfile(next: FirmProfile): Promise<FirmProfile> {
    if (!userId) throw new Error('Not signed in');
    const row = profileToDb(next);
    const { data, error } = await supabase
      .from('profiles')
      .update(row)
      .eq('id', userId)
      .select()
      .single();
    if (error) throw error;
    const saved = profileFromDb(data);
    setProfile(saved);
    return saved;
  }

  return { profile, loading, error, saveProfile };
}

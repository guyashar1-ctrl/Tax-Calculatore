// ─── טיוטת רשומת המשרד · שמירה אחת, ניקוי קבצים רק אחרי הצלחה ────────────────
// כל העמודים שעורכים את רשומת המשרד (profiles) עובדים על הטיוטה הזאת. השמירה
// היא עדכון אחד של שורה אחת — ולכן "נשמר" כאן אמת לכל העמודים יחד.
//
// ‼ קבצים: העלאה נכנסת לאחסון מיד (אין דרך אחרת להציג תצוגה מקדימה), אבל
// הרשומה מצביעה עליהם רק אחרי שמירה. קובץ קודם נמחק רק אחרי שמירה שהצליחה;
// ביטול מוחק רק את מה שהועלה ולא נשמר. כך שום ביטול לא משאיר הפניה לקובץ שנמחק.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { FirmProfile } from '../../types/firmProfile';
import { supabase } from '../../lib/supabase';
import {
  dirtyParts, editableJson, refsToDeleteAfterSave, refsToDeleteOnDiscard, splitAssetRef,
  type AssetRef, type DirtyPart, type OfficePageId,
} from './officeModel';

export type SaveStatus = 'idle' | 'saving' | 'saved' | 'error';

export interface OfficeDraft {
  draft: FirmProfile;
  setDraft: React.Dispatch<React.SetStateAction<FirmProfile>>;
  saved: FirmProfile;
  dirty: boolean;
  dirtyPages: (OfficePageId | 'other')[];
  /** מה בדיוק שונה — לשורת השמירה. */
  dirtyParts: DirtyPart[];
  status: SaveStatus;
  error: string | null;
  save: () => Promise<boolean>;
  discard: () => void;
  /**
   * שמירה מיידית של שינוי אחד — לחלון עריכה (נוסח מייל). ‼ נבנית על **השמור**,
   * לא על הטיוטה: שינויים אחרים שעוד לא נשמרו לא נגררים איתה. מחזירה הודעת שגיאה או null.
   */
  saveNow: (update: (p: FirmProfile) => FirmProfile) => Promise<string | null>;
  /** נקרא אחרי כל העלאה לאחסון — כדי לדעת מה מותר למחוק בביטול. */
  noteUpload: (ref: AssetRef) => void;
  /** קבצים שהמחיקה שלהם נכשלה אחרי השמירה. לא חוסם — רק נרשם. */
  cleanupWarning: string | null;
}

async function removeRefs(refs: AssetRef[]): Promise<number> {
  const byBucket = new Map<string, string[]>();
  for (const r of refs) {
    const { bucket, path } = splitAssetRef(r);
    byBucket.set(bucket, [...(byBucket.get(bucket) ?? []), path]);
  }
  let failed = 0;
  for (const [bucket, paths] of byBucket) {
    try {
      const { error } = await supabase.storage.from(bucket).remove(paths);
      if (error) failed += paths.length;
    } catch {
      failed += paths.length;
    }
  }
  return failed;
}

export function extractErr(e: unknown): string {
  if (typeof e === 'string') return e;
  if (e && typeof e === 'object') {
    const o = e as { message?: string; details?: string; hint?: string };
    const parts = [o.message, o.details, o.hint].filter(Boolean);
    if (parts.length) return parts.join(' - ');
  }
  return 'השמירה נכשלה';
}

export function useOfficeDraft(profile: FirmProfile, onSave: (p: FirmProfile) => Promise<void> | void): OfficeDraft {
  const [draft, setDraft] = useState<FirmProfile>(profile);
  const [status, setStatus] = useState<SaveStatus>('idle');
  const [error, setError] = useState<string | null>(null);
  const [cleanupWarning, setCleanupWarning] = useState<string | null>(null);
  const uploaded = useRef<Set<AssetRef>>(new Set());

  const draftJson = useMemo(() => editableJson(draft), [draft]);
  const savedJson = useMemo(() => editableJson(profile), [profile]);
  const dirty = draftJson !== savedJson;
  const parts = useMemo(() => (dirty ? dirtyParts(draft, profile) : []), [dirty, draft, profile]);
  const pages = useMemo(() => [...new Set(parts.map(p => p.page))], [parts]);

  // הטיוטה מאמצת את השמור כשאין שינויים פתוחים (אחרי שמירה, או עדכון ממקום אחר).
  const dirtyRef = useRef(dirty);
  dirtyRef.current = dirty;
  useEffect(() => {
    if (!dirtyRef.current) setDraft(profile);
  }, [profile]);

  // "נשמר" נעלם אחרי רגע — זו הודעה על פעולה, לא מצב קבוע.
  useEffect(() => {
    if (status !== 'saved') return;
    const t = setTimeout(() => setStatus(s => (s === 'saved' ? 'idle' : s)), 2600);
    return () => clearTimeout(t);
  }, [status]);

  // עריכה אחרי כשל מחזירה את הכפתור למצב רגיל — ההודעה נשארת עד השמירה הבאה.
  useEffect(() => {
    if (dirty && status === 'saved') setStatus('idle');
  }, [dirty, status]);

  const profileRef = useRef(profile);
  profileRef.current = profile;
  const draftRef = useRef(draft);
  draftRef.current = draft;

  const save = useCallback(async () => {
    const toSave = draftRef.current;
    const before = profileRef.current;
    // ‼ צילום של מה שהועלה עד עכשיו. קובץ שיועלה בזמן השמירה אינו חלק ממנה,
    // ואסור שהניקוי שאחריה ימחק אותו.
    const uploadedNow = new Set(uploaded.current);
    setStatus('saving');
    setError(null);
    try {
      await onSave(toSave);
    } catch (e) {
      setStatus('error');
      setError(extractErr(e));
      return false;
    }
    setStatus('saved');
    // הניקוי אחרי שהשמירה הצליחה — מול מה שנשמר בפועל, לא מול מה שבטיוטה עכשיו.
    const stale = refsToDeleteAfterSave(before, toSave, uploadedNow);
    for (const r of uploadedNow) uploaded.current.delete(r);
    if (stale.length) {
      const failed = await removeRefs(stale);
      setCleanupWarning(failed ? `${failed} קבצים ישנים לא נמחקו מהאחסון. אין לזה השפעה על מה שנשמר.` : null);
    }
    return true;
  }, [onSave]);

  const discard = useCallback(() => {
    const orphans = refsToDeleteOnDiscard(profileRef.current, uploaded.current);
    uploaded.current = new Set();
    setDraft(profileRef.current);
    setStatus('idle');
    setError(null);
    if (orphans.length) void removeRefs(orphans);
  }, []);

  const noteUpload = useCallback((ref: AssetRef) => { uploaded.current.add(ref); }, []);

  const saveNow = useCallback(async (update: (p: FirmProfile) => FirmProfile): Promise<string | null> => {
    const next = update(profileRef.current);
    try {
      await onSave(next);
    } catch (e) {
      return extractErr(e);
    }
    setDraft(d => update(d));
    setStatus('saved');
    return null;
  }, [onSave]);

  return {
    draft, setDraft, saved: profile, dirty, dirtyPages: pages, dirtyParts: parts, status, error,
    save, discard, noteUpload, saveNow, cleanupWarning,
  };
}

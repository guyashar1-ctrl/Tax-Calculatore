// ─── מפת הדרך לעצמאות · הלשונית ─────────────────────────────────────────────
// הדף עצמו הוא public/vision/index.html: דף עצמאי, שנבנה ונבדק כך (docs/vision/README.md).
// כאן הוא רץ במסגרת, והלשונית נותנת לו מקום לשמור: מסמכי JSON לכל משתמש ב-vision_docs (227).
// ‼ הדף מדבר עם הלשונית באותו ממשק שהוא מקבל כשהוא רץ ב-Claude
//   (use('db') → doc(path).get / set / onSnapshot), ולכן הוא לא יודע כלום על Supabase.
// ‼ אין כאן נתוני משרד: «הלקוחות» בדף הם לבנים בקיר של התוכנית האישית, לא רשומות ב-clients.

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '../lib/supabase';
import './VisionPage.css';

type Body = Record<string, unknown>;
interface Snapshot {
  exists: boolean;
  data(): Body | undefined;
  metadata: { hasPendingWrites: boolean; fromCache: boolean };
}
type Listener = (snap: Snapshot) => void;
interface VisionDoc {
  get(): Promise<Snapshot>;
  set(body: Body): Promise<void>;
  onSnapshot(cb: Listener, onError?: (e: unknown) => void): () => void;
}
export interface VisionHost {
  use(name: string): Promise<unknown>;
  /** קורא שוב את המסמכים שהדף מאזין להם — כשחוזרים ללשונית מהטלפון או מחלון אחר */
  refresh(): Promise<void>;
}

declare global {
  interface Window { __pivoVision?: VisionHost }
}

const DOC_ID = /^[a-z0-9-]{1,40}$/;
const fail = (code: string, message: string) => ({ code, message });

/** JSON עם מפתחות ממוינים: jsonb מחזיר את המפתחות בסדר שלו, ואותו תוכן לא צריך להיראות כשינוי. */
function canon(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(canon).join(',')}]`;
  if (v && typeof v === 'object') {
    return `{${Object.keys(v as Body).sort().map(k => `${JSON.stringify(k)}:${canon((v as Body)[k])}`).join(',')}}`;
  }
  return JSON.stringify(v ?? null);
}

export function createVisionHost(userId: string): VisionHost {
  const listeners = new Map<string, Set<Listener>>();
  const seen = new Map<string, string>();
  // ‼ הכתיבות רצות כאן, בחלון של PIVO, ולא במסגרת: מעבר ללשונית אחרת מסיר את המסגרת,
  // ומה שחיכה בתוכה לא ממשיך. לכל מסמך תור אחד — כתיבה מאוחרת לא תעקוף מוקדמת.
  const queue = new Map<string, Promise<unknown>>();
  const busy = new Map<string, number>();
  const ver = new Map<string, number>();
  const bump = (id: string) => ver.set(id, (ver.get(id) ?? 0) + 1);
  const snap = (body: Body | null): Snapshot => ({
    exists: !!body,
    data: () => (body ? JSON.parse(JSON.stringify(body)) as Body : undefined),
    metadata: { hasPendingWrites: false, fromCache: false },
  });

  async function read(id: string): Promise<Body | null> {
    const { data, error } = await supabase
      .from('vision_docs').select('body').eq('user_id', userId).eq('doc_id', id).maybeSingle();
    if (error) throw fail('unavailable', error.message);
    return ((data as { body?: Body } | null)?.body) ?? null;
  }

  async function write(id: string, body: Body): Promise<void> {
    const row = { body, updated_at: new Date().toISOString() };
    const up = await supabase
      .from('vision_docs').update(row).eq('user_id', userId).eq('doc_id', id).select('doc_id');
    if (up.error) throw fail(up.error.code === '23514' ? 'invalid_argument' : 'unavailable', up.error.message);
    if (up.data && up.data.length) return;
    const ins = await supabase.from('vision_docs').insert({ user_id: userId, doc_id: id, ...row });
    if (!ins.error) return;
    // ‼ שתי לשוניות יצרו את אותו מסמך באותו רגע — השנייה מעדכנת את מה שהראשונה יצרה
    if (ins.error.code === '23505') {
      const again = await supabase.from('vision_docs').update(row).eq('user_id', userId).eq('doc_id', id);
      if (!again.error) return;
      throw fail('unavailable', again.error.message);
    }
    throw fail(ins.error.code === '23514' ? 'invalid_argument' : 'unavailable', ins.error.message);
  }

  function doc(path: string): VisionDoc {
    const id = path.replace(/^vision\//, '');
    if (!DOC_ID.test(id)) throw new TypeError(`vision: מזהה מסמך לא תקין: ${path}`);
    return {
      async get() { const body = await read(id); seen.set(id, canon(body)); return snap(body); },
      set(body) {
        busy.set(id, (busy.get(id) ?? 0) + 1);
        bump(id);
        const run = (queue.get(id) ?? Promise.resolve()).catch(() => undefined)
          .then(() => write(id, body))
          .then(() => { seen.set(id, canon(body)); })
          .finally(() => { busy.set(id, (busy.get(id) ?? 1) - 1); bump(id); });
        queue.set(id, run);
        return run;
      },
      onSnapshot(cb) {
        let set = listeners.get(id);
        if (!set) { set = new Set(); listeners.set(id, set); }
        set.add(cb);
        return () => { listeners.get(id)?.delete(cb); };
      },
    };
  }

  async function refresh() {
    await Promise.all([...listeners.entries()].filter(([, set]) => set.size > 0).map(async ([id, set]) => {
      // ‼ קריאה שחפפה כתיבה עלולה להחזיר את מה שהיה לפניה — ולהחזיר לדף טקסט שכבר שונה
      if (busy.get(id)) return;
      const v = ver.get(id);
      try {
        const body = await read(id), c = canon(body);
        if (busy.get(id) || ver.get(id) !== v || c === seen.get(id)) return;
        seen.set(id, c);
        set.forEach(cb => { try { cb(snap(body)); } catch { /* מאזין של דף שכבר נסגר */ } });
      } catch { /* בפעם הבאה שחוזרים ללשונית */ }
    }));
  }

  const db = { doc };
  // הדף אישי: מי שנכנס הוא הבעלים של הנתונים שלו (ההרשאה נאכפת במסד, 227)
  const user = { isOwner: async () => true, canEdit: async () => true, can: async () => true };
  return {
    use: async (name: string) => (name === 'db' ? db : name === 'user' ? user : null),
    refresh,
  };
}

export default function VisionPage({ userId, active }: { userId: string; active: boolean }) {
  // ‼ הדף במסגרת מחפש את window.parent.__pivoVision ברגע שהוא עולה — לכן הוא נקבע כבר
  // ברינדור, לפני שהמסגרת נטענת.
  const host = useMemo(() => {
    const h = createVisionHost(userId);
    window.__pivoVision = h;
    return h;
  }, [userId]);
  const activeRef = useRef(active);
  activeRef.current = active;

  useEffect(() => {
    window.__pivoVision = host;
    const onBack = () => { if (activeRef.current && document.visibilityState === 'visible') void host.refresh(); };
    document.addEventListener('visibilitychange', onBack);
    window.addEventListener('focus', onBack);
    return () => {
      document.removeEventListener('visibilitychange', onBack);
      window.removeEventListener('focus', onBack);
      if (window.__pivoVision === host) delete window.__pivoVision;
    };
  }, [host]);

  // חוזרים ללשונית: מה שנכתב בינתיים בטלפון נכנס לדף
  useEffect(() => { if (active) void host.refresh(); }, [active, host]);

  // הדף ממלא את כל המקום מתחת לכותרת, ובטלפון — עד הסרגל התחתון. הגלילה בתוך הדף.
  const boxRef = useRef<HTMLDivElement>(null);
  const [height, setHeight] = useState<number>(() => Math.max(360, window.innerHeight - 60));
  useLayoutEffect(() => {
    if (!active) return;
    window.scrollTo(0, 0);
    const fit = () => {
      const el = boxRef.current;
      if (!el) return;
      const top = el.getBoundingClientRect().top + window.scrollY;
      const nav = document.querySelector('.mobile-nav');
      const navH = nav && getComputedStyle(nav).display !== 'none' ? nav.getBoundingClientRect().height : 0;
      setHeight(Math.max(360, Math.round(window.innerHeight - top - navH)));
    };
    fit();
    window.addEventListener('resize', fit);
    const ro = new ResizeObserver(fit);
    ro.observe(document.body);
    return () => { window.removeEventListener('resize', fit); ro.disconnect(); };
  }, [active]);

  return (
    <div ref={boxRef} className="vision-host" style={{ height }} hidden={!active}>
      <iframe className="vision-frame" src="/vision/index.html" title="מפת הדרך לעצמאות" />
    </div>
  );
}

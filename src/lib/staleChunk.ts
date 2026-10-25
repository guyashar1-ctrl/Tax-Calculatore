// ─── לשונית ישנה אחרי שחרור ─────────────────────────────────────────────────
// גיא (25.10.2026): «המערכת לא עולה». כל שחרור מוחק את הקבצים של הגרסה הקודמת; לשונית
// שנפתחה לפני כן ומנסה לטעון מסך שעוד לא נטען בה מקבלת 404 — והמסך לא עולה.
// במקרה כזה המסך המבוקש ממילא לא יכול להיפתח, ולכן מרעננים לבד לגרסה החדשה.
// ‼ פעם אחת בכל 30 שניות (sessionStorage) — אם הקובץ באמת חסר, לא נכנסים ללולאת רענון.
// (NewVersionBanner רק מציע רענון — שם הרו"ח עשוי להיות באמצע הקלדה. כאן אין מה לשמור.)

const KEY = 'pivo_stale_chunk_reload_at';
const WINDOW_MS = 30_000;

/** שגיאת טעינה של קובץ מסך — הניסוחים של Chrome, Firefox ו-Safari, ושל vite. */
export function isStaleChunkError(err: unknown): boolean {
  const msg = String((err as { message?: unknown })?.message ?? err ?? '');
  return /Failed to fetch dynamically imported module|error loading dynamically imported module|Importing a module script failed|Unable to preload CSS|ChunkLoadError/i.test(msg);
}

/** מרענן לגרסה החדשה — אלא אם כבר רוענן בחצי הדקה האחרונה. מחזיר האם רענן. */
export function reloadForNewVersion(now: number = Date.now()): boolean {
  try {
    const last = Number(sessionStorage.getItem(KEY) || 0);
    if (now - last < WINDOW_MS) return false;
    sessionStorage.setItem(KEY, String(now));
  } catch { /* אין אחסון — מרעננים פעם אחת בכל זאת */ }
  window.location.reload();
  return true;
}

export function installReloadOnStaleChunk(): void {
  if (typeof window === 'undefined') return;
  window.addEventListener('vite:preloadError', (event) => {
    if (reloadForNewVersion()) event.preventDefault();
  });
}

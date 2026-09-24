// ─── כמה מחשבי עבודה ⇒ תמונה אחת של מה אפשר להריץ עכשיו (203) ──────────────
//
// ‼ עד 24.09.2026 המסך קרא את «העובד האחרון» בלבד, ולכן מחשב אחד כבוי (או
// מחשב שני דלוק בלי שע״ם) קבע את כל התמונה. כאן כל מחשב חי נחשב, וכל רשות
// נלקחת מהמחשב הכי מוכן **עבורה**:
//   · מחשב חי  = פעימת לב טרייה ולא בוטל.
//   · שע״ם    = מהמחשב החי שיש לו יכולת שע״ם ושהחיבור בו הכי מתקדם.
//   · ב״ל     = באותו אופן, בנפרד לגמרי — מחשב עם שע״ם מחובר אינו אומר
//               דבר על ב״ל.
// ארבעה דברים נפרדים: מחשב חי · יכולת (shaam/btl) · סשן מחובר · מחזור חיים.

import type { AutomationWorkerStatus } from '../../types/automation';
import { WORKER_STALE_AFTER_MS } from '../../types/automation';

export interface WorkstationRow {
  workerId: string;
  lastSeenAt: string;
  revokedAt?: string | null;
  capabilities?: string[] | null;
  status?: AutomationWorkerStatus | null;
}

export interface WorkstationPicture {
  /** אין אף מחשב עבודה חי. */
  noWorkstation: boolean;
  /** אין מחשב חי עם יכולת שע״ם / ב״ל. */
  shaamOffline: boolean;
  btlOffline: boolean;
  /** המצב המאוחד: שכבות שע״ם מהמחשב הטוב לשע״ם, ב״ל מהטוב לב״ל. */
  status: AutomationWorkerStatus;
  /** כמה מחשבים חיים — לתצוגה בלבד. */
  liveCount: number;
}

const SHAAM_KEYS = ['shaam', 'gmf', 'vat', 'nikui', 'representation'] as const;

const has = (w: WorkstationRow, cap: 'shaam' | 'btl') =>
  !w.capabilities || w.capabilities.length === 0 || w.capabilities.includes(cap);

function shaamScore(s: AutomationWorkerStatus | null | undefined): number {
  if (!s) return 0;
  let n = 0;
  if (s.shaam?.connected) n += 100;
  if (s.shaam?.bootstrapped) n += 50;
  for (const k of ['gmf', 'vat', 'nikui', 'representation'] as const) if (s[k]?.ready) n += 1;
  return n;
}

/** טהורה. `now` מוזרק כדי שתיבדק. */
export function workstationPicture(rows: WorkstationRow[], now: number = Date.now()): WorkstationPicture {
  const live = rows.filter(w => !w.revokedAt && now - new Date(w.lastSeenAt).getTime() < WORKER_STALE_AFTER_MS);
  const byRecency = (a: WorkstationRow, b: WorkstationRow) =>
    new Date(b.lastSeenAt).getTime() - new Date(a.lastSeenAt).getTime() || a.workerId.localeCompare(b.workerId);

  const shaamCandidates = live.filter(w => has(w, 'shaam'))
    .sort((a, b) => shaamScore(b.status) - shaamScore(a.status) || byRecency(a, b));
  const btlCandidates = live.filter(w => has(w, 'btl'))
    .sort((a, b) => Number(!!b.status?.btl?.connected) - Number(!!a.status?.btl?.connected) || byRecency(a, b));

  const status: AutomationWorkerStatus = {};
  const bestShaam = shaamCandidates[0]?.status ?? null;
  if (bestShaam) for (const k of SHAAM_KEYS) if (bestShaam[k]) (status as Record<string, unknown>)[k] = bestShaam[k];
  const bestBtl = btlCandidates[0]?.status ?? null;
  if (bestBtl?.btl) status.btl = bestBtl.btl;

  return {
    noWorkstation: live.length === 0,
    shaamOffline: shaamCandidates.length === 0,
    btlOffline: btlCandidates.length === 0,
    status,
    liveCount: live.length,
  };
}

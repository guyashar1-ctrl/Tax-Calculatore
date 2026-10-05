// ─── הקריאה האחרונה שהצליחה מ«רשימת הכנסות» בב"ל — לכל אדם (219) ────────────
// ‼ מקור אחד לכרטיס הרשויות, לטופס 6101 ולתמונת המצב: האם הצהרה שמורה עדיין
// מאומתת נקבע מול הקריאה **השלמה** האחרונה של אותו אדם (niIncomeTrust), לא
// מול המשימה האחרונה בכלל. הלוגיקה ב-btlIncomeEvidence (נבדקת בלי React);
// כאן רק חיווט. טעינה / שגיאה / לקוח אחר ⇒ «אין אימות» (לא «מאומת»).

import { useEffect, useMemo, useState } from 'react';
import type { AutomationJob } from '../types/automation';
import type { PersonRole } from '../types';
import { BTL_SYNC_FILE_ACTION_TYPE } from '../types/automation';
import { fetchSucceededJobsPage } from '../lib/automationJobs';
import {
  collectIncomeEvidence, deriveIncomeReads, incomeEvidenceKey, liveIncomeReads, retainCompleteReads,
} from '../features/nationalInsurance/btlIncomeEvidence';
import type { FetchIncomeJobsPage, IncomeEvidenceState, NiIncomeReads } from '../features/nationalInsurance/btlIncomeEvidence';

export type { NiIncomeReads };

/** ‼ למסכי בדיקה בלבד (?test-*): מקור משימות מדומה, בלי מסד. בייצור — תמיד null. */
let harnessFetcher: ((clientId: string) => FetchIncomeJobsPage) | null = null;
export function setIncomeEvidenceFetcherForHarness(f: ((clientId: string) => FetchIncomeJobsPage) | null) { harnessFetcher = f; }

const CLIENT_ONLY: readonly PersonRole[] = ['client'];
const CLIENT_AND_SPOUSE: readonly PersonRole[] = ['client', 'spouse'];
const NONE: NiIncomeReads = {};

/**
 * @param liveJob המשימה שהמסך כבר מחזיק (אם יש). הצליחה ⇒ הקריאה שלה גוברת
 *   על ההיסטוריה (וחוסכת המתנה). אחרת ההיסטוריה נשלפת פעם אחת ללקוח.
 * @param withSpouse לשלוף גם את בן/בת הזוג (כרטיס שבו הם עורכים אותם).
 */
export function useBtlIncomeReads(
  clientId: string | undefined, liveJob?: AutomationJob | null, withSpouse = false,
): NiIncomeReads {
  const roles = withSpouse ? CLIENT_AND_SPOUSE : CLIENT_ONLY;
  const key = clientId ? incomeEvidenceKey(clientId, roles) : '';
  // ‼ משימה חיה בנפרד מהמצב — מזהה/סטטוס, לא זהות האובייקט (מתעדכן בכל סקר).
  const liveKey = `${liveJob?.clientId ?? ''}:${liveJob?.id ?? ''}:${liveJob?.status ?? ''}:${liveJob?.finishedAt ?? ''}`;
  const liveReads = useMemo(() => liveIncomeReads(clientId, liveJob),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [clientId, liveKey]);

  // ‼ הזיכרון של המסך: הקריאה השלמה האחרונה לכל אדם שנצפתה במשימה חיה. נשמר
  // כשמשימה B מחליפה את A (בתור/רצה/רק בן-זוג/מקטע שנכשל) — אחרת הסתירה של A
  // הייתה נעלמת והאמון בהצהרה הישנה חוזר. ממוזג **באותו רינדור** (לא רק
  // באפקט), כך שאין חלון שבו A כבר לא חיה ועוד לא נשמרה. לקוח אחר ⇒ זיכרון ריק.
  const [memory, setMemory] = useState<{ key: string; reads: NiIncomeReads }>({ key: '', reads: {} });
  const remembered = memory.key === key ? memory.reads : NONE;
  const retained = useMemo(() => retainCompleteReads(remembered, liveReads, roles),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [remembered, liveReads, key]);
  useEffect(() => {
    if (key && retained !== remembered) setMemory({ key, reads: retained });
  }, [key, retained, remembered]);

  // ‼ ההיסטוריה: בכניסה, ושוב כשמשימה חיה של הלקוח מסתיימת בהצלחה (גיבוי —
  // לא התיקון עצמו). שליפה שמאחרת לא דורסת קריאה חיה חדשה ממנה (deriveIncomeReads
  // בוחר לפי מועד), ומצב של לקוח אחר אינו נקרא (key).
  const historyTick = liveJob?.clientId === clientId && liveJob?.status === 'succeeded' ? liveJob.id : '';
  const [state, setState] = useState<IncomeEvidenceState | null>(null);
  useEffect(() => {
    if (!clientId) return;
    let alive = true;
    void collectIncomeEvidence(
      harnessFetcher?.(clientId) ?? ((offset, limit) => fetchSucceededJobsPage(clientId, BTL_SYNC_FILE_ACTION_TYPE, offset, limit)), roles,
    )
      .then(reads => { if (alive) setState({ key, status: 'ready', reads }); })
      .catch(() => { if (alive) setState({ key, status: 'error' }); });
    return () => { alive = false; };
    // roles קבוע לפי withSpouse; key מכיל את שניהם.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, historyTick]);

  // ‼ אובייקט יציב — הכרטיס בונה את השורות מחדש רק כשהראיה עצמה משתנה.
  return useMemo(() => deriveIncomeReads({ clientId, roles, state, liveReads, retained }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [clientId, key, state, liveReads, retained]);
}

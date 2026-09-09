// ─── קליטת שאלון שהלקוח מילא בעצמו אל תוך תיק המס ──────────────────────────
// מקור: docs/TAX-FILE-V6-READINESS.md §C0 — «החסם המרכזי».
//
// ‼ הבעיה שזה פותר: PublicIntake כותב **רק** ל-annual_report_answers ולמודל
// הסשן. הוא לא קורא ל-propose_tax_facts, ולכן לקוח יכול להשלים שאלון מלא
// ולייצר אפס עובדות בתיק. הסנכרון היחיד שקיים היה SyncConfirmation — מסך
// של הרו"ח בדוח השנתי.
//
// ‼ למה הקליטה קורית כאן ולא בשרת בסיום השאלון: לוגיקת ההתאמה היא TypeScript
// (reconcile.ts) ומשותפת עם מסך הדוח השנתי. שכפולה ל-SQL הייתה יוצרת בדיוק
// את שני העותקים שהמהלך הזה בא לחסל. בנוסף, ל-propose_tax_facts יש
// auth.uid() — ללקוח אין סשן, לרו"ח יש. לכן הקליטה רצה פעם אחת, בדפדפן של
// הרו"ח, כשהוא פותח את תיק המס.
//
// ‼ facts_synced_at על הסשן מבטיח שזה קורה **פעם אחת בלבד** לכל סשן.

import type { Client } from '../types';
import type { AnnualReportSession } from '../features/annualReport/types';
import { computeDiffs, toProposedFact, isApplicable } from '../features/annualReport/reconcile';
import type { Diff } from '../features/annualReport/reconcile';
import { proposeTaxFacts, applyTaxFacts } from './taxFacts';
import { clientFromDb } from './dbMappers';
import { supabase } from './supabase';

export interface IntakeSyncResult {
  /** עדכונים שנקלטו ישירות — אין להם ערך קודם בתיק, ולכן אין מה להכריע. */
  applied: { label: string; value: string }[];
  /** סתירות אמיתיות — נשארו ממתינות להכרעת הרו"ח בתיק המס. */
  conflicts: number;
  client?: Client;
  error?: string;
}

/**
 * האם הדיף הוא «חדש» (לא ידענו) או «סתירה» (ידענו משהו אחר).
 * ‼ זו ההבחנה שמונעת ערימת החלטות מיותרות: ערך שלא ידענו אינו מחלוקת.
 *
 * ‼ `false` ו-0 אינם תשובה כשלעצמם. לקוח נולד בכרטיס עם בוליאנים כבויים
 * ומספרים אפסיים, ולכן «לא מסומן» פירושו כמעט תמיד «לא נשאל» ולא «נבדק,
 * ואין». כשספרנו אותם כתשובה, כל «כן» של הלקוח נחת כסתירה — בדיוק הערימה
 * שהמנגנון הזה בא למנוע.
 *
 * ‼ מה שמכריע הוא field_meta, פנקס הידיעה של V6 — בדיוק כמו ב-taxKnowledge:
 *   · אין רשומה + הערך ריק/כבוי  ⇒ לא ידענו  ⇒ נקלט ישירות
 *   · יש רשומה                   ⇒ נשאל ונענה ⇒ תשובה שונה היא סתירה
 *   · ערך אמיתי בכרטיס           ⇒ מידע קיים  ⇒ סתירה, גם בלי פרובננס,
 *     כדי שערך שהרו"ח הקליד ידנית לא יידרס בשקט.
 */
function isNewFact(d: Diff, client: Client): boolean {
  const patch = d.apply(client);
  const rec = client as unknown as Record<string, unknown>;
  const meta = client.fieldMeta ?? {};
  return Object.keys(patch).every(k => {
    if (meta[k as keyof typeof meta]) return false;
    const cur = rec[k];
    if (cur === undefined || cur === null || cur === '') return true;
    if (Array.isArray(cur)) return cur.length === 0;
    if (typeof cur === 'boolean') return cur === false;
    if (typeof cur === 'number') return cur === 0;
    return false;
  });
}

/**
 * קולט סשן שאלון שהושלם. עדכון שאינו סותר נכנס מיד; סתירה נשארת ממתינה.
 * אידמפוטנטי: סשן שכבר נקלט מסומן ב-facts_synced_at ולא ייקלט שוב.
 */
export async function syncIntakeSession(
  session: SyncableSession,
  client: Client,
): Promise<IntakeSyncResult> {
  const diffs = computeDiffs(session, client);
  const applicable = diffs.filter(d => isApplicable(d, client));

  const fresh = applicable.filter(d => isNewFact(d, client));
  const conflicting = applicable.filter(d => !isNewFact(d, client));

  let latest = client;
  const applied: { label: string; value: string }[] = [];

  // ── חדשים: קריאה אחת שמציעה ומחילה את כולם בטרנזקציה אחת ──────────────────
  // ‼ עד מיגרציה 162 זה היה לולאה של propose→accept, וה-accept מעולם לא רץ:
  // propose לא החזירה מזהה, `res.change?.id` היה תמיד undefined, וה-continue
  // דילג על כל פריט. התוצאה: אפס עובדות נכתבו, ו-facts_synced_at נכתב בכל
  // מקרה — כך שהסשן נחשב "נקלט" ולא נקלט שוב לעולם.
  if (fresh.length > 0) {
    const pairs = fresh.map(d => ({ d, fact: toProposedFact(d, latest) }));
    const res = await applyTaxFacts(
      client.id, 'questionnaire', session.id, pairs.map(p => p.fact));

    // ‼ כישלון עוצר כאן, **לפני** חותמת הקליטה. כך ניסיון חוזר עדיין אפשרי.
    if (!res.ok) {
      return { applied: [], conflicts: 0, error: res.error ?? 'קליטת השאלון נכשלה' };
    }
    if (res.client) latest = clientFromDb(res.client);
    for (const outcome of res.results ?? []) {
      if (outcome.outcome === 'pending_conflict') continue;
      const hit = pairs.find(p => p.fact.fieldKey === outcome.fieldKey);
      if (hit) applied.push({ label: hit.d.label, value: hit.d.fromQuestionnaire });
    }
  }

  // ── סותרים: מציעים בלבד. ההכרעה של הרו"ח, בתיק המס. ──
  if (conflicting.length > 0) {
    const proposed = await proposeTaxFacts(
      client.id, 'questionnaire', session.id,
      conflicting.map(d => toProposedFact(d, latest)),
    );
    if (!proposed.ok) {
      return {
        applied,
        conflicts: conflicting.length,
        client: latest === client ? undefined : latest,
        error: proposed.error ?? 'רישום הסתירות נכשל',
      };
    }
  }

  // ‼ החותמת נכתבת רק אחרי ששני השלבים למעלה הצליחו. היא צורכת את
  // האידמפוטנטיות של הסשן, ולכן אסור לה להיכתב על ריצה שלא כתבה כלום.
  const { error } = await supabase
    .from('annual_report_sessions')
    .update({ facts_synced_at: new Date().toISOString() })
    .eq('id', session.id);

  return {
    applied,
    conflicts: conflicting.length,
    client: latest === client ? undefined : latest,
    error: error?.message,
  };
}

/**
 * מה שקליטת השאלון באמת צריכה מהסשן. ‼ מכוון שזה צר: computeDiffs נוגע רק
 * ב-model, ו-sourceRef צריך את ה-id. טיפוס מלא כאן היה מחייב יציקה שקרית.
 */
export type SyncableSession = Pick<AnnualReportSession, 'id' | 'model'> & { completedAt?: string };

/** הסשן האחרון שהושלם וטרם נקלט. null = אין מה לקלוט. */
export async function findUnsyncedSession(clientId: string): Promise<SyncableSession | null> {
  const { data, error } = await supabase
    .from('annual_report_sessions')
    .select('id, model, completed_at')
    .eq('client_id', clientId)
    .is('facts_synced_at', null)
    .not('completed_at', 'is', null)
    .order('completed_at', { ascending: false })
    .limit(1);
  if (error || !data?.length) return null;
  const row = data[0] as Record<string, unknown>;
  return {
    id: row.id as string,
    model: row.model as AnnualReportSession['model'],
    completedAt: (row.completed_at as string | null) ?? undefined,
  };
}

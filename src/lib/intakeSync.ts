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
import { proposeTaxFacts } from './taxFacts';
import { supabase } from './supabase';
import { legacyModelToFacts, LEGACY_ANNUAL_CARD_KEYS, reconcileLegacyRound, sessionNeedsSync } from '../features/taxYear/transfer';
import { recordLegacyFacts } from '../features/taxYear/api';

export interface IntakeSyncResult {
  /** עדכונים שנקלטו ישירות — אין להם ערך קודם בתיק, ולכן אין מה להכריע.
   *  ‼ מ-12.10.2026 תמיד ריק: כל תשובה ממתינה לאישור (ראו pending). נשאר לתאימות. */
  applied: { label: string; value: string }[];
  /** 12.10.2026: תשובות שמחכות לאישור המשרד בתיק המס — חדשות וסותרות כאחד. */
  pending?: { label: string; value: string }[];
  /** סתירות אמיתיות — נשארו ממתינות להכרעת הרו"ח בתיק המס (מתוך pending). */
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

/** סשן שאלון שהושלם — מה שהקליטה צריכה ממנו. */
export type SyncableSession = Pick<AnnualReportSession, 'id' | 'model'> & { completedAt?: string };

/**
 * קולט סשן שאלון שהושלם — כהצעות לתיק, לא ככתיבה.
 * ‼ 12.10.2026 (גיא: «בדיקת המשרד → אישור → עדכון תיק המס» בכל המסלולים): כל תשובה, גם כזו שלא
 *   סותרת את הכרטיס, נכנסת כהצעה ממתינה, והמשרד מאשר בתיק המס («אשר הכול» לקבוצה). עד אז נכנס
 *   ישירות כל מה שלא סתר — וכך תשובת לקוח הפכה לנתון בתיק בלי שאיש בדק אותה.
 * אידמפוטנטי לכל סבב: facts_synced_at נכתב אחרי שהכול נרשם. סבב חדש (הלקוח פתח שוב וסיים) נקלט
 *   שוב — ראו findUnsyncedSession; תשובה שלא השתנתה לא נרשמת פעמיים.
 */
export async function syncIntakeSession(
  session: SyncableSession,
  client: Client,
): Promise<IntakeSyncResult> {
  // ‼ 229 (החלטת גיא 11.10.2026): קישור ישן שכבר נשלח ממשיך לעבוד, והתשובות נשמרות
  // לשנת הסשן כעובדות ממתינות — לא לכרטיס. מזהה המקור (סשן + פריט) מונע כפילות בקליטה חוזרת,
  // וסתירה מול תשובה מהדף האישי מוצגת למשרד ולא נדרסת.
  // ‼ סבב שני של אותו סשן: תשובה זהה לקודמת לא נרשמת שוב; תשובה ששונתה נרשמת כעובדה חדשה ליד
  //   הקודמת (מזהה מקור עם מועד הסבב) — ההיסטוריה נשמרת, והמשרד רואה את שתיהן.
  const legacyAll = legacyModelToFacts(session.model, { id: session.id, clientId: client.id, taxYear: session.model.taxYear });
  const legacy = await onlyChangedLegacy(client.id, session, legacyAll);
  if (legacy.length > 0) {
    const rec = await recordLegacyFacts(client.id, session.id, legacy);
    if (!rec.ok) return { applied: [], conflicts: 0, error: rec.error };
  }

  // סכומים שנתיים לא נכתבים עוד לכרטיס — הם בשנת הסשן (למעלה).
  const diffs = computeDiffs(session, client)
    .filter(d => !Object.keys(d.apply(client)).some(k => LEGACY_ANNUAL_CARD_KEYS.has(k)));
  const applicable = diffs.filter(d => isApplicable(d, client));
  const conflicts = applicable.filter(d => !isNewFact(d, client)).length;

  if (applicable.length > 0) {
    const proposed = await proposeTaxFacts(
      client.id, 'questionnaire', session.id,
      applicable.map(d => toProposedFact(d, client)),
    );
    // ‼ כישלון עוצר כאן, **לפני** חותמת הקליטה. כך ניסיון חוזר עדיין אפשרי.
    if (!proposed.ok) return { applied: [], conflicts, error: proposed.error ?? 'רישום התשובות לאישור נכשל' };
  }

  // ‼ החותמת נכתבת רק אחרי ששני השלבים למעלה הצליחו. היא צורכת את
  // האידמפוטנטיות של הסבב, ולכן אסור לה להיכתב על ריצה שלא כתבה כלום.
  const { error } = await supabase
    .from('annual_report_sessions')
    .update({ facts_synced_at: new Date().toISOString() })
    .eq('id', session.id);

  return {
    applied: [],
    pending: applicable.map(d => ({ label: d.label, value: d.fromQuestionnaire })),
    conflicts,
    error: error?.message,
  };
}

/** עובדות השאלון הישן שעוד לא נרשמו בדיוק כך לסשן הזה (ומזהה מקור חדש לתשובה ששונתה). */
async function onlyChangedLegacy(clientId: string, session: SyncableSession, facts: ReturnType<typeof legacyModelToFacts>) {
  if (facts.length === 0) return facts;
  const { data } = await supabase.from('tax_year_facts')
    .select('item_key, subject_role, answer, value, source_ref')
    .eq('client_id', clientId).eq('source', 'legacy_questionnaire').like('source_ref', `${session.id}%`);
  const rows = (data ?? []) as { item_key: string; subject_role: string; answer: string; value: unknown; source_ref: string }[];
  if (rows.length === 0) return facts;
  return reconcileLegacyRound(facts, rows, session.completedAt ?? new Date().toISOString());
}


/**
 * הסשן האחרון שהושלם וטרם נקלט. null = אין מה לקלוט.
 * ‼ 12.10.2026: «טרם נקלט» כולל סשן שהלקוח פתח מחדש וסיים **אחרי** הקליטה הקודמת (reopen_intake
 *   לא מאפס את facts_synced_at). עד עכשיו סבב כזה לא נקלט לעולם — והתשובות החדשות אבדו.
 */
export async function findUnsyncedSession(clientId: string): Promise<SyncableSession | null> {
  const { data, error } = await supabase
    .from('annual_report_sessions')
    .select('id, model, completed_at, facts_synced_at')
    .eq('client_id', clientId)
    .not('completed_at', 'is', null)
    .order('completed_at', { ascending: false })
    .limit(1);
  if (error || !data?.length) return null;
  const row = data[0] as Record<string, unknown>;
  if (!sessionNeedsSync(row.completed_at as string | null, row.facts_synced_at as string | null)) return null;
  return {
    id: row.id as string,
    model: row.model as AnnualReportSession['model'],
    completedAt: (row.completed_at as string | null) ?? undefined,
  };
}


/**
 * 236 · «החלף בקליטה» — השאלון הישן יורד, בלי לאבד את מה שהלקוח כבר ענה.
 * ‼ קודם קולטים את התשובות שכבר ניתנו (גם בסשן שלא הושלם) כהצעות לאישור בתיק המס — ורק אחר כך
 *   מבטלים את השאלון בשרת. כישלון בקליטה עוצר לפני הביטול. לקוח שימשיך בכל זאת בקישור הישן וייסים —
 *   הסבב החדש ייקלט שוב כהצעות (findUnsyncedSession), לא יאבד.
 */
export async function replaceLegacyIntake(client: Client, intakeStepId: string, legacySince?: string): Promise<{ ok: boolean; imported: number; error?: string }> {
  let imported = 0;
  const { data } = await supabase
    .from('annual_report_sessions')
    .select('id, model, completed_at, facts_synced_at, created_at')
    .eq('client_id', client.id)
    .is('superseded_by', null)
    .order('created_at', { ascending: false })
    .limit(1);
  const row = (data ?? [])[0] as Record<string, unknown> | undefined;
  // הסשן של השאלון הזה — לא סשן משנה קודמת שכבר נקלט
  const ofThisQuestionnaire = row && (!legacySince || String(row.created_at ?? '').slice(0, 10) >= legacySince);
  const pendingRound = row && (!row.facts_synced_at || (row.completed_at && sessionNeedsSync(row.completed_at as string, row.facts_synced_at as string)));
  if (row && ofThisQuestionnaire && pendingRound && row.model && Object.keys(row.model as object).length > 0) {
    const res = await syncIntakeSession({ id: row.id as string, model: row.model as AnnualReportSession['model'], completedAt: (row.completed_at as string | null) ?? undefined }, client);
    if (res.error) return { ok: false, imported: 0, error: res.error };
    imported = res.pending?.length ?? 0;
  }
  const { data: r, error } = await supabase.rpc('replace_legacy_intake', { p_intake_step_id: intakeStepId });
  if (error) return { ok: false, imported, error: error.message };
  const out = r as { ok?: boolean; error?: string } | null;
  if (out?.ok === false) return { ok: false, imported, error: out.error };
  return { ok: true, imported };
}

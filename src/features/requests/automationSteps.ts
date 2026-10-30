// ─── אוטומציה היא נקודה רגילה בשרשרת (313, שלב 4) ──────────────────────────────
// ‼ נקודת אוטומציה = משימה של המשרד (payload.automation) — לא בדף של הלקוח. כשמגיע תורה
// קריאה רצה לבד בשרת (_automation_step_kick); כתיבה ברשות מחכה ללחיצה על הכפתור בשם
// הפעולה, בוורוד של המערכת. ריצה שהצליחה — מכל מקום — סוגרת את הנקודה (ירוק).
// ההגדרה של כל פעולה נשארת בעמוד «אוטומציות» (automationCatalog.ts); כאן רק מה שהשורה צריכה.
import { supabase } from '../../lib/supabase';
import type { Client } from '../../types';
import {
  BTL_SYNC_FILE_ACTION_TYPE, SHAAM_ISSUE_CERTIFICATES_ACTION_TYPE, SHAAM_SYNC_INCOME_TAX_ACTION_TYPE,
} from '../../types/automation';
import { FLOW_ACTION_NAMES, STEP_ACTION_NAMES, STEP_ACTION_TYPES } from '../flows/types';
import { AUTHORITY_AUTOMATION, certificateEntityInput } from '../taxFile/authorityAutomation';
import { BTL_READ_FILE, SHAAM_READ_134 } from '../../hooks/shaamReadiness';

export interface AutomationStepAction {
  type: typeof STEP_ACTION_TYPES[number];
  /** השם — כמו בכל המערכת (FLOW_ACTION_NAMES). */
  name: string;
  /** הכפתור בשורה: אומר בדיוק מה הוא עושה. */
  act: string;
  /** בזמן הריצה, בוורוד. */
  runText: string;
  /** קריאה רצה לבד כשמגיע תורה; כתיבה — בלחיצה בלבד. */
  mode: 'read' | 'write';
  /** החיבור שהפעולה צריכה (useAutomationGate). */
  capability: string;
}

export const AUTOMATION_STEP_ACTIONS: AutomationStepAction[] = [
  { type: SHAAM_SYNC_INCOME_TAX_ACTION_TYPE, name: FLOW_ACTION_NAMES[SHAAM_SYNC_INCOME_TAX_ACTION_TYPE],
    act: 'קרא משע״ם', runText: 'קורא משע״ם…', mode: 'read', capability: SHAAM_READ_134 },
  { type: BTL_SYNC_FILE_ACTION_TYPE, name: FLOW_ACTION_NAMES[BTL_SYNC_FILE_ACTION_TYPE],
    act: 'קרא מביטוח לאומי', runText: 'קורא מביטוח לאומי…', mode: 'read', capability: BTL_READ_FILE },
  { type: SHAAM_ISSUE_CERTIFICATES_ACTION_TYPE, name: STEP_ACTION_NAMES[SHAAM_ISSUE_CERTIFICATES_ACTION_TYPE],
    act: 'הנפק אישורים', runText: 'מנפיק בשע״ם…', mode: 'write', capability: SHAAM_READ_134 },
];

/** הפעולה של נקודה — או null כשאינה נקודת אוטומציה. */
export function automationOf(step: { payload?: unknown }): AutomationStepAction | null {
  const t = ((step.payload as { automation?: { actionType?: string } } | undefined)?.automation)?.actionType;
  return AUTOMATION_STEP_ACTIONS.find(a => a.type === t) ?? null;
}

/** הקלט לריצה מהכרטיס — אותן פונקציות כמו הכפתור בתיק המס. */
export function automationStepInput(a: AutomationStepAction, client: Client, spouseClient?: Client):
  { input: Record<string, unknown> } | { blocked: string } {
  if (a.type === SHAAM_ISSUE_CERTIFICATES_ACTION_TYPE) {
    const c = certificateEntityInput(client);
    return 'blocked' in c ? c : { input: { certEntity: c.certEntity } };
  }
  const spec = a.type === SHAAM_SYNC_INCOME_TAX_ACTION_TYPE ? AUTHORITY_AUTOMATION.income_tax : AUTHORITY_AUTOMATION.national_insurance;
  return spec?.buildInput?.(client, spouseClient) ?? { blocked: 'אין לפעולה הזו קלט בכרטיס.' };
}

export const ADD_AUTOMATION_ERROR_TEXT: Record<string, string> = {
  forbidden: 'אין הרשאה.',
  not_supported: 'הפעולה הזו לא יכולה להיות נקודה ברשימה.',
  network: 'לא הצלחנו להגיע לשרת. שום דבר לא נשמר — נסו שוב.',
};

export async function addAutomationStep(clientId: string, actionType: string):
  Promise<{ ok: true; stepId: string; existed: boolean } | { ok: false; error: string }> {
  const { data, error } = await supabase.rpc('add_automation_step', { p_client_id: clientId, p_action_type: actionType });
  if (error) return { ok: false, error: 'network' };
  const r = (data ?? {}) as { ok?: boolean; error?: string; stepId?: string; existed?: boolean };
  return r.ok && r.stepId ? { ok: true, stepId: r.stepId, existed: !!r.existed } : { ok: false, error: r.error ?? 'unknown' };
}

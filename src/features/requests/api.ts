// ─── פרטי העסק ועבודה מהבית — הקריאות לשרת (220) ────────────────────────────
// ‼ כל כתיבה דרך פונקציה בשרת. הטבלאות לקריאה בלבד מהדפדפן (RLS); הגבלת 25%,
// «התשובות השתנו» ו«לא עדכני» נאכפות שם — המסך רק מסביר.
import { supabase } from '../../lib/supabase';
import type { HomeOfficeHistory, ValidHomeOffice } from './homeOffice';
import { APPROVE_ERROR_TEXT, HOME_OFFICE_ERROR_TEXT, type HomeOfficeError } from './homeOffice';

export type HomeOfficeResult =
  | ({ ok: true; step?: string | null; answersId?: string; approvalId?: string; noop?: boolean } & HomeOfficeHistory)
  | ({ ok: false; error: string; message: string } & Partial<HomeOfficeHistory>);

export function homeOfficeErrorText(code: string | undefined): string {
  if (!code) return 'הפעולה נכשלה. נסו שוב.';
  return HOME_OFFICE_ERROR_TEXT[code as HomeOfficeError] ?? APPROVE_ERROR_TEXT[code] ?? `הפעולה נכשלה (${code}).`;
}

async function call(name: string, args: Record<string, unknown>): Promise<HomeOfficeResult> {
  const { data, error } = await supabase.rpc(name, args);
  if (error) return { ok: false, error: 'network', message: 'לא הצלחנו להגיע לשרת. שום דבר לא נשמר — נסו שוב.' };
  const r = (data ?? {}) as Record<string, unknown>;
  if (r.ok) return { answers: [], approvals: [], ...(r as object) } as unknown as HomeOfficeResult;
  return { ...(r as object), ok: false, error: String(r.error ?? 'unknown'), message: homeOfficeErrorText(String(r.error ?? '')) } as HomeOfficeResult;
}

export const loadHomeOffice = (clientId: string) => call('get_home_office', { p_client_id: clientId });

export const saveHomeOfficeAnswers = (clientId: string, v: ValidHomeOffice) => call('save_home_office_answers', {
  p_client_id: clientId,
  p_data: { hasDedicatedRoom: v.hasDedicatedRoom, totalRooms: v.totalRooms, businessRooms: v.businessRooms, note: v.note },
});

export const approveHomeOffice = (clientId: string, answersId: string, percent: number, effectiveFrom: string, note: string) =>
  call('approve_home_office', {
    p_client_id: clientId, p_answers_id: answersId, p_percent: percent, p_effective_from: effectiveFrom, p_note: note || null,
  });

export const confirmHomeOfficeInPaperless = (approvalId: string) =>
  call('confirm_home_office_in_paperless', { p_approval_id: approvalId });

export interface PortalBusinessDetailsInput {
  businessName: string;
  /** השם שהדף הציג — כדי שהשרת יזהה שינוי של המשרד בינתיים (stale). */
  expectedBusinessName: string;
  homeOffice: ValidHomeOffice;
}

export type PortalBusinessDetailsResult =
  | { ok: true; step?: string | null; noop?: boolean }
  | { ok: false; error: string; message: string; businessName?: string | null };

const PORTAL_ERROR_TEXT: Record<string, string> = {
  missing_business_name: 'צריך למלא את שם העסק.',
  not_published: 'הבקשה הזאת עוד לא פתוחה. רעננו את הדף.',
  locked: 'הבקשה הזאת עוד לא פתוחה. רעננו את הדף.',
  invalid: 'הקישור אינו תקין או שפג תוקפו. בקשו מהמשרד קישור חדש.',
  step_not_found: 'הבקשה לא נמצאה. רעננו את הדף.',
};

export async function portalSubmitBusinessDetails(token: string, stepId: string, input: PortalBusinessDetailsInput): Promise<PortalBusinessDetailsResult> {
  const { data, error } = await supabase.rpc('portal_submit_business_details', {
    p_token: token, p_step_id: stepId,
    p_data: {
      businessName: input.businessName.trim(),
      expectedBusinessName: input.expectedBusinessName,
      homeOffice: input.homeOffice,
    },
  });
  if (error) return { ok: false, error: 'network', message: 'לא הצלחנו לשלוח. הפרטים לא נשמרו — נסו שוב.' };
  const r = (data ?? {}) as Record<string, unknown>;
  if (r.ok) return { ok: true, step: (r.step as string) ?? null, noop: !!r.noop };
  const code = String(r.error ?? 'unknown');
  if (code === 'stale') {
    return { ok: false, error: code, businessName: (r.businessName as string) ?? null,
      message: `המשרד עדכן בינתיים את שם העסק ל«${String(r.businessName ?? '')}». בדקו שהשם נכון ושלחו שוב.` };
  }
  return { ok: false, error: code, message: PORTAL_ERROR_TEXT[code] ?? homeOfficeErrorText(code) };
}

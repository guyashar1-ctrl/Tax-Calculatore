// ─── טפסי הלקוח מול השרת (247) ───────────────────────────────────────────────
// ‼ הדף האישי: ארבע פונקציות anon בטוקן הדף (portal_smart_form_*). המשרד: פתיחה,
// מילוי במשרד ותצוגה (smart_form_client_*); ההגשה, התשובה והסגירה — smart_form_advance
// המשותף עם 6101, והקובץ החתום — smart_form_attach_signed_pdf.

import { supabase } from '../../../lib/supabase';
import type { MappingFields } from '../mappingCore';
import type { CfData, ClientFormKey } from './types';

type Rpc = { ok?: boolean; error?: string } & Record<string, unknown>;
const call = async (fn: string, args: Record<string, unknown>): Promise<Rpc> => {
  const { data, error } = await supabase.rpc(fn, args);
  if (error) return { ok: false, error: error.message.includes('Failed to fetch') ? 'network' : error.message };
  return (data as Rpc) ?? { ok: false, error: 'empty' };
};

export interface ClientFormView {
  ok: boolean;
  error?: string;
  templateKey: ClientFormKey;
  title?: string;
  authority?: 'ita' | 'vat';
  firmName?: string;
  state: string;
  revisionState: 'draft' | 'locked' | 'signed' | 'superseded';
  card: CfData;
  answers: CfData;
  data: CfData;
  contentSha256: string | null;
  mappingVersion: number;
  activeMappingVersion: number;
  mapping: MappingFields;
  /** דף אישי: חתימת הלקוח עצמו אחרי שחתם. */
  signature?: string | null;
  signedAt?: string | null;
  missing?: string[];
  field?: string;
  // ── משרד בלבד ──
  signatures?: Record<string, string>;
  signedDocumentId?: string | null;
  stepId?: string | null;
  revision?: number;
}

const asView = (r: Rpc) => r as unknown as ClientFormView;

// ── הדף האישי ────────────────────────────────────────────────────────────────
export const portalGet = async (token: string, stepId: string) => asView(await call('portal_smart_form_get', { p_token: token, p_step_id: stepId }));
export const portalSave = async (token: string, stepId: string, values: CfData) =>
  asView(await call('portal_smart_form_save', { p_token: token, p_step_id: stepId, p_values: values }));
export const portalPrepare = async (token: string, stepId: string) => asView(await call('portal_smart_form_prepare', { p_token: token, p_step_id: stepId }));
export const portalSign = async (token: string, stepId: string, png: string, contentSha256: string, consent: boolean) =>
  call('portal_smart_form_sign', { p_token: token, p_step_id: stepId, p_png: png, p_content_sha256: contentSha256, p_consent: consent });

// ── המשרד ────────────────────────────────────────────────────────────────────
export const startClientForm = (clientId: string, key: ClientFormKey, published: boolean) =>
  call('smart_form_client_start', { p_client_id: clientId, p_template_key: key, p_published: published });
export const officeView = async (filingId: string) => asView(await call('smart_form_client_view', { p_filing_id: filingId }));
export const officeFill = (filingId: string, values: CfData) => call('smart_form_client_fill', { p_filing_id: filingId, p_values: values });

/** שגיאות שרת ⇒ משפט ללקוח/למשרד. */
export function clientFormErrorText(code?: string, field?: string): string {
  switch (code) {
    case 'network': return 'אין חיבור כרגע. נסו שוב בעוד רגע.';
    case 'invalid': case 'step_not_found': case 'not_available': return 'הטופס אינו זמין כרגע. אפשר לפנות למשרד.';
    case 'not_published': return 'הטופס עוד לא נפתח עבורך.';
    case 'not_editable': return 'הטופס כבר אינו פתוח לעריכה.';
    case 'already_signed': return 'הטופס כבר נחתם, ולכן אי אפשר לשנות אותו מכאן. לשינוי — פנו למשרד.';
    case 'identity_in_card': return 'פרטי הזהות כבר רשומים במשרד. לתיקון — פנו למשרד.';
    case 'missing': return 'חסרים עוד פרטים לפני החתימה.';
    case 'content_changed': return 'הטופס השתנה מאז שנפתח. נא לרענן ולעבור עליו שוב.';
    case 'mapping_outdated': return 'הטופס עודכן. נא לרענן ולעבור עליו שוב לפני החתימה.';
    case 'consent_required': return 'יש לאשר את ההצהרה לפני החתימה.';
    case 'bad_signature_image': return 'החתימה ריקה — יש לחתום בתיבה.';
    case 'not_signable': return 'הטופס אינו ממתין לחתימה כרגע.';
    case 'hebrew_only': return 'כתובת ויישוב — בעברית בלבד.';
    case 'bad_id': return 'מספר הזהות לא תקין.';
    case 'bad_phone': return 'מספר הטלפון לא תקין.';
    case 'bad_zip': return 'מיקוד — 7 ספרות.';
    case 'bad_date': return 'התאריך לא תקין.';
    case 'not_married': return 'התצהיר מיועד לבני זוג נשואים — בכרטיס המצב המשפחתי אינו «נשוי/אה». יש לעדכן את הכרטיס קודם.';
    case 'individual_only': return 'טופס 821 כאן מיועד לעוסק יחיד. לחברה — הגשה ידנית.';
    case 'forbidden': return 'אין הרשאה.';
    default: return field ? `הפרט «${field}» לא נשמר. נסו שוב.` : 'הפעולה לא הצליחה. נסו שוב.';
  }
}

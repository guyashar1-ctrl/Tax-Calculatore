// ─── טפסים חכמים — גישה לשרת (206) ─────────────────────────────────────────
// כל כתיבה עוברת ב-RPC (בעלות + הרשאה + יומן); הקריאה ישירה מהטבלאות תחת RLS.

import { supabase } from '../../lib/supabase';
import type { Btl6101Data, Btl6101Purpose } from './btl6101/model';
import type { ProfessionalConfirmations, RequiredAttachment } from './btl6101/resolve';

export type FilingState =
  | 'draft' | 'waiting_client_info' | 'review' | 'awaiting_signatures' | 'signed'
  | 'awaiting_client_submission' | 'submitted' | 'info_requested' | 'result_received' | 'closed' | 'cancelled';

export const FILING_STATE_LABELS: Record<FilingState, string> = {
  draft: 'טיוטה',
  waiting_client_info: 'ממתין למידע מהלקוח',
  review: 'לבדיקה מקצועית',
  awaiting_signatures: 'ממתין לחתימות',
  signed: 'נחתם',
  awaiting_client_submission: 'הלקוח מגיש באזור האישי',
  submitted: 'הוגש — ממתין לביטוח לאומי',
  info_requested: 'ביטוח לאומי ביקש מידע נוסף',
  result_received: 'התקבלה תשובה רשמית',
  closed: 'הושלם',
  cancelled: 'בוטל',
};

export interface FilingValues {
  entered: Partial<Btl6101Data>;
  confirmed: Record<string, 'client' | 'office'>;
  /** אישורים מקצועיים עם סיבה (למשל התחלה והפסקה באותו טופס). */
  professional?: ProfessionalConfirmations;
}

export interface FilingFlags { contactNotOwn?: boolean; separateMailing?: boolean }

export interface Signer {
  role: 'client' | 'spouse';
  name: string;
  idNumber?: string;
  required: boolean;
  status: 'pending' | 'signed';
  signedAt?: string;
  method?: 'in_office' | 'remote_link';
}

export interface Revision {
  id: string;
  filingId: string;
  revision: number;
  templateKey: string;
  templateVersion: string;
  templateSha256: string;
  mappingVersion: number;
  purposes: Btl6101Purpose[];
  values: FilingValues;
  snapshot: {
    data: Btl6101Data; fields?: Record<string, { status: string; source: string; at?: string }>; warnings?: string[]; btl?: unknown;
    professional?: ProfessionalConfirmations; requiredAttachments?: RequiredAttachment[];
  } | null;
  contentSha256: string | null;
  state: 'draft' | 'locked' | 'signed' | 'superseded';
  signers: Signer[];
  signatures: Partial<Record<'client' | 'spouse', { png: string; signedAt: string; method: string }>>;
  signTokens: Partial<Record<'client' | 'spouse', { expiresAt: string; issuedAt: string }>>;
  signedDocumentId: string | null;
  signedPdfSha256: string | null;
  createdAt: string;
  lockedAt: string | null;
  signedAt: string | null;
  supersededAt: string | null;
}

/** lockedRequirement — נקבע בשרת בנעילה (לפי הכללים); אינו יורד ואינו הופך לרשות. */
export interface Attachment { key: string; label: string; required: boolean; documentId?: string | null; lockedRequirement?: boolean }

export interface Filing {
  id: string;
  clientId: string;
  templateKey: 'btl-6101';
  subjectRole: 'client' | 'spouse';
  purposes: Btl6101Purpose[];
  flags: FilingFlags;
  state: FilingState;
  currentRevision: number;
  stepId: string | null;
  missingInfo: { keys: string[]; note?: string; requestedAt: string } | null;
  attachments: Attachment[];
  submission: { channel?: string; submittedAt?: string; reference?: string; evidenceDocumentId?: string; handedOffAt?: string; note?: string } | null;
  outcome: { status?: 'approved' | 'rejected' | 'partial'; summary?: string; receivedAt?: string; reference?: string; evidenceDocumentId?: string; btlSyncAt?: string; infoRequest?: { note: string; receivedAt: string } } | null;
  followUp: { kind: string; owner: string; stepId: string; title?: string } | null;
  createdAt: string;
  updatedAt: string;
  closedAt: string | null;
}

/** מה שהשרת כותב על שלב «בקשות» (payload.smartForm) — היטל של ההגשה. */
export interface SmartFormProjection {
  filingId: string; templateKey: string; state: FilingState; stateLabel?: string;
  waitingOn?: 'client' | 'spouse' | 'authority' | null; revision?: number; purposes?: string[]; subjectRole?: string;
}

export interface FilingEvent { id: number; revision: number | null; at: string; actor: string; kind: string; detail: Record<string, unknown> }

type Row = Record<string, unknown>;

const filingFromRow = (r: Row): Filing => ({
  id: r.id as string, clientId: r.client_id as string, templateKey: r.template_key as 'btl-6101',
  subjectRole: r.subject_role as 'client', purposes: (r.purposes as Btl6101Purpose[]) ?? [],
  flags: (r.flags as FilingFlags) ?? {}, state: r.state as FilingState, currentRevision: r.current_revision as number,
  stepId: (r.step_id as string) ?? null, missingInfo: (r.missing_info as Filing['missingInfo']) ?? null,
  attachments: (r.attachments as Attachment[]) ?? [], submission: (r.submission as Filing['submission']) ?? null,
  outcome: (r.outcome as Filing['outcome']) ?? null, followUp: (r.follow_up as Filing['followUp']) ?? null,
  createdAt: r.created_at as string, updatedAt: r.updated_at as string, closedAt: (r.closed_at as string) ?? null,
});

const revisionFromRow = (r: Row): Revision => {
  const tokens = (r.sign_tokens as Record<string, { expiresAt: string; issuedAt: string }>) ?? {};
  return {
    id: r.id as string, filingId: r.filing_id as string, revision: r.revision as number,
    templateKey: r.template_key as string, templateVersion: r.template_version as string,
    templateSha256: r.template_sha256 as string, mappingVersion: r.mapping_version as number,
    purposes: (r.purposes as Btl6101Purpose[]) ?? [],
    values: {
      entered: (r.values as Partial<FilingValues> | null)?.entered ?? {},
      confirmed: (r.values as Partial<FilingValues> | null)?.confirmed ?? {},
      professional: (r.values as Partial<FilingValues> | null)?.professional ?? {},
    },
    snapshot: (r.snapshot as Revision['snapshot']) ?? null, contentSha256: (r.content_sha256 as string) ?? null,
    state: r.state as Revision['state'], signers: (r.signers as Signer[]) ?? [],
    signatures: (r.signatures as Revision['signatures']) ?? {},
    // ‼ רק תפוגה — הטביעה של הטוקן אינה נחוצה למסך.
    signTokens: Object.fromEntries(Object.entries(tokens).map(([k, v]) => [k, { expiresAt: v.expiresAt, issuedAt: v.issuedAt }])),
    signedDocumentId: (r.signed_document_id as string) ?? null, signedPdfSha256: (r.signed_pdf_sha256 as string) ?? null,
    createdAt: r.created_at as string, lockedAt: (r.locked_at as string) ?? null, signedAt: (r.signed_at as string) ?? null,
    supersededAt: (r.superseded_at as string) ?? null,
  };
};

export async function loadFiling(filingId: string): Promise<{ filing: Filing; revisions: Revision[]; events: FilingEvent[] }> {
  const [f, r, e] = await Promise.all([
    supabase.from('smart_form_filings').select('*').eq('id', filingId).single(),
    supabase.from('smart_form_revisions').select('*').eq('filing_id', filingId).order('revision'),
    supabase.from('smart_form_events').select('id, revision, at, actor, kind, detail').eq('filing_id', filingId).order('id'),
  ]);
  if (f.error) throw new Error(f.error.message);
  if (r.error) throw new Error(r.error.message);
  return {
    filing: filingFromRow(f.data as Row),
    revisions: (r.data as Row[]).map(revisionFromRow),
    events: ((e.data ?? []) as FilingEvent[]),
  };
}

export async function loadClientFilings(clientId: string): Promise<Filing[]> {
  const { data, error } = await supabase.from('smart_form_filings').select('*').eq('client_id', clientId).order('created_at', { ascending: false });
  if (error) throw new Error(error.message);
  return (data as Row[]).map(filingFromRow);
}

export interface RpcResult { ok: boolean; error?: string; [k: string]: unknown }

async function call(fn: string, args: Record<string, unknown>): Promise<RpcResult> {
  const { data, error } = await supabase.rpc(fn, args);
  if (error) return { ok: false, error: error.message };
  return data as RpcResult;
}

export const startFiling = (clientId: string, purposes: Btl6101Purpose[]) =>
  call('smart_form_start', { p_client_id: clientId, p_template_key: 'btl-6101', p_subject_role: 'client', p_purposes: purposes });

export const saveDraft = (filingId: string, revision: number, purposes: Btl6101Purpose[], flags: FilingFlags, values: FilingValues) =>
  call('smart_form_save', { p_filing_id: filingId, p_revision: revision, p_purposes: purposes, p_flags: flags, p_values: values });

export const newRevision = (filingId: string, reason: string) =>
  call('smart_form_new_revision', { p_filing_id: filingId, p_reason: reason });

export const lockForSignature = (filingId: string, revision: number, snapshot: unknown, signers: { role: 'client' | 'spouse'; name: string; idNumber?: string }[]) =>
  call('smart_form_lock', { p_filing_id: filingId, p_revision: revision, p_snapshot: snapshot, p_signers: signers });

export const captureSignature = (filingId: string, revision: number, role: 'client' | 'spouse', png: string, contentSha256: string, attestation: string) =>
  call('smart_form_capture_signature', { p_filing_id: filingId, p_revision: revision, p_role: role, p_png: png, p_content_sha256: contentSha256, p_attestation: attestation });

export const issueSignLink = (filingId: string, revision: number, role: 'client' | 'spouse', days = 14) =>
  call('smart_form_issue_sign_link', { p_filing_id: filingId, p_revision: revision, p_role: role, p_days: days });

export const attachSignedPdf = (filingId: string, revision: number, documentId: string, sha256: string) =>
  call('smart_form_attach_signed_pdf', { p_filing_id: filingId, p_revision: revision, p_document_id: documentId, p_pdf_sha256: sha256 });

export const setAttachments = (filingId: string, attachments: Attachment[]) =>
  call('smart_form_set_attachments', { p_filing_id: filingId, p_attachments: attachments });

export const advanceFiling = (filingId: string, action: string, detail: Record<string, unknown> = {}) =>
  call('smart_form_advance', { p_filing_id: filingId, p_action: action, p_detail: detail });

export interface ProfileUpdate { key: 'zipCode' | 'landlinePhone' | 'mailingAddress' | 'businessAddress'; value: unknown; expected: unknown; businessId?: string }
export const applyProfileUpdates = (filingId: string, updates: ProfileUpdate[]) =>
  call('smart_form_apply_profile_updates', { p_filing_id: filingId, p_updates: updates });

// ── דף החתימה הציבורי (טוקן בלבד) ──
export interface PublicSigning {
  ok: boolean; reason?: string; alreadySigned?: boolean;
  role?: 'client' | 'spouse'; signerName?: string; firmName?: string;
  templateKey?: string; templateVersion?: string; templateSha256?: string; mappingVersion?: number;
  purposes?: Btl6101Purpose[]; data?: Btl6101Data; contentSha256?: string;
  otherSignatures?: Partial<Record<'client' | 'spouse', string>>;
  /** מתי המבוטח חתם (אם כבר חתם) — תאריך ההצהרה בעמוד 3. */
  clientSignedAt?: string | null;
}

export async function getPublicSigning(token: string): Promise<PublicSigning> {
  const { data, error } = await supabase.rpc('get_smart_form_signing', { p_token: token });
  if (error) return { ok: false, reason: 'network' };
  return data as PublicSigning;
}

export async function submitPublicSignature(token: string, png: string, contentSha256: string, consent: boolean): Promise<{ ok: boolean; reason?: string; allSigned?: boolean; alreadySigned?: boolean }> {
  const { data, error } = await supabase.rpc('submit_smart_form_signature', { p_token: token, p_png: png, p_content_sha256: contentSha256, p_consent: consent });
  if (error) return { ok: false, reason: 'network' };
  return data as { ok: boolean; reason?: string; allSigned?: boolean };
}

export const signLinkUrl = (token: string) => `${window.location.origin}/?sign-form=${token}`;

/** הודעות שגיאה מהשרת ⇒ עברית למסך. */
export function filingErrorText(code?: string): string {
  switch (code) {
    case 'stale_revision': return 'הטופס השתנה בחלון אחר — טוענים מחדש';
    case 'not_editable': case 'revision_locked': return 'הגרסה נעולה לחתימה — כדי לשנות צריך גרסה חדשה';
    case 'has_blockers': return 'יש שדות חסרים או סותרים — אי אפשר לנעול לחתימה';
    case 'spouse_signer_required': return 'חתימת בן/בת הזוג נדרשת כשבן/בת הזוג עובד/ת בעסק';
    case 'content_changed': return 'תוכן הטופס השתנה מאז שהוצג — יש לרענן ולעבור שוב על הטופס';
    case 'attestation_required': return 'יש לאשר שהחותם/ת נוכח/ת וחותם/ת בעצמו/ה';
    case 'bad_signature_image': return 'החתימה ריקה או לא תקינה';
    case 'already_signed': return 'החותם כבר חתם';
    case 'not_ready': return 'צריך קודם לשמור את המסמך החתום';
    case 'attachments_missing': return 'חסרות אסמכתאות חובה';
    case 'evidence_required': return 'נדרשת ראיה: מספר אסמכתא או מסמך';
    case 'submitted_is_final': return 'הטופס כבר הוגש — שינוי מחייב הגשה חדשה';
    case 'reason_required': return 'יש לכתוב סיבה';
    case 'stale': return 'הערך בכרטיס השתנה בינתיים — לא עודכן כדי לא לדרוס';
    case 'forbidden': return 'אין הרשאה';
    case 'required_attachment_locked': return 'אסמכתא שנקבעה כחובה בנעילה אינה ניתנת להסרה';
    case 'professional_confirmation_required': return 'נדרש אישור מקצועי עם סיבה (התחלה והפסקה באותו טופס)';
    default: return code ? `שגיאה: ${code}` : 'שגיאה';
  }
}

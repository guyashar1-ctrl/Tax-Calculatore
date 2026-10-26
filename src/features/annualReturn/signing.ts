// ─── חתימת הלקוח על סט הדוח השנתי (297; docs/proposals/2026-10-25-annual-return-signing.html, גיא אישר) ────────────────
// ‼ מה נחתם = הצילום ששולחים מהמשרד: עמוד הריכוז, 1301 והנספחים — אותם ערכים שהמסך הראה (ReturnOutputs מצומצם, בלי
//   שורות המקור והחישובים). הטביעה מחושבת בשרת; הדף שולח אותה חזרה עם החתימה ⇒ שליחה מחדש בינתיים = content_changed.
// ‼ «נחתם» — רק מהשרת (state='signed'), לא מהדפדפן.
import { supabase } from '../../lib/supabase';
import type { Client } from '../../types';
import type { ReturnField, ReturnOutputs } from './types';
import type { WealthOutputs } from '../wealthDeclaration/engine';

export type Role = 'client' | 'spouse';
export interface Signer { role: Role; name: string; gender?: 'm' | 'f' }
export interface SignSnapshot {
  kind?: 'annual';
  year: number;
  names: { client: string; spouse?: string };
  /** המסמכים שהגיעו (לעמוד הריכוז). */
  docs: { title: string; who: string }[];
  out: ReturnOutputs;
}
/** 300 · הצהרת הון — מה שהלקוח רואה וחותם עליו: סכום לכל סעיף, הסיכומים והשינוי מול ההצהרה הקודמת. */
export interface WealthSnapshot {
  kind: 'wealth';
  year: number; asOf: string;
  names: { client: string; spouse?: string };
  docs: { title: string; who: string }[];
  sections: { code: string; label: string; kind: string; amount: number | null; none: boolean }[];
  assets: number | null; liabilities: number | null; netPrivate: number | null; total: number | null;
  previous?: { asOf?: string; total: number | null }; change: number | null;
}
export type AnySnapshot = SignSnapshot | WealthSnapshot;
export const isWealthSnap = (s: AnySnapshot): s is WealthSnapshot => s.kind === 'wealth';

export interface Signing {
  id: string; requestId: string; version: number; state: 'awaiting' | 'signed' | 'superseded';
  snapshot: AnySnapshot; contentSha256: string; signers: Signer[];
  signed: Partial<Record<Role, string>>; signedAt?: string; signedDocumentId?: string;
  signatures?: Partial<Record<Role, { png: string; signedAt: string }>>;
}

const minField = (f: ReturnField): ReturnField => ({
  code: f.code, part: f.part, label: f.label, person: f.person, kind: f.kind,
  ...(f.amount != null ? { amount: f.amount } : {}), ...(f.checked != null ? { checked: f.checked } : {}), ...(f.text ? { text: f.text } : {}),
  source: { kind: f.source.kind, trust: f.source.trust, text: '', lines: (f.source.lines ?? []).map(l => ({ docLabel: l.docLabel })) } as ReturnField['source'],
});

/** הצילום לחתימה — רק מה שהלקוח רואה (הסיכום, הטופס והנספחים). */
export function signSnapshot(out: ReturnOutputs, meta: { year: number; clientName: string; spouseName?: string; docs: { title: string; who: string }[] }): SignSnapshot {
  const o = {
    taxYear: out.taxYear,
    fields: out.fields.map(minField),
    formCoverage: {
      produced: (out.formCoverage?.produced ?? []).map(minField),
      annexes: (out.formCoverage?.annexes ?? []).map(a => ({ formId: a.formId, title: a.title, need: a.need })),
      counts: out.formCoverage?.counts,
    },
    annexes: out.annexes.map(a => ({ formId: a.formId, title: a.title, rows: a.rows.map(r => ({ label: r.label, ...(r.amount != null ? { amount: r.amount } : {}), ...(r.text ? { text: r.text } : {}) })) })),
    ...(out.annex1320 ? { annex1320: out.annex1320.map(b => ({ entityRef: b.entityRef, label: b.label, lines: b.lines })) } : {}),
    ...(out.annex1321 ? { annex1321: { gross: out.annex1321.gross, ownHousingRent: out.annex1321.ownHousingRent, net: out.annex1321.net } } : {}),
    household: { balance: out.household.balance, incomplete: out.household.incomplete },
  } as unknown as ReturnOutputs;
  return { year: meta.year, names: { client: meta.clientName, ...(meta.spouseName ? { spouse: meta.spouseName } : {}) }, docs: meta.docs, out: o };
}

/** הצילום של הצהרת ההון לחתימה. */
export function wealthSnapshot(out: WealthOutputs, meta: { year: number; clientName: string; spouseName?: string; docs: { title: string; who: string }[] }): WealthSnapshot {
  return {
    kind: 'wealth', year: meta.year, asOf: out.asOf, names: { client: meta.clientName, ...(meta.spouseName ? { spouse: meta.spouseName } : {}) }, docs: meta.docs,
    sections: out.sections.map(x => ({ code: x.code, label: x.label, kind: x.kind, amount: x.amount, none: x.none })),
    assets: out.assets, liabilities: out.liabilities, netPrivate: out.netPrivate, total: out.total,
    ...(out.previous ? { previous: out.previous } : {}), change: out.change,
  };
}

/** מה שהלקוח חתם עליו מול מה שבדוח עכשיו: הסכומים והטקסטים בטופס. שונה ⇒ «השתנה מאז החתימה». */
export function snapshotKey(s: AnySnapshot): string {
  if (isWealthSnap(s)) return JSON.stringify([s.asOf, s.sections.map(x => `${x.code}|${x.amount ?? ''}|${x.none}`)]);
  const f = [...s.out.fields, ...(s.out.formCoverage?.produced ?? [])]
    .map(x => `${x.code}|${x.person}|${x.amount ?? ''}|${x.checked ?? ''}|${x.text ?? ''}`).sort();
  return JSON.stringify([f, s.out.annex1320?.map(b => b.lines) ?? null, s.out.annex1321 ?? null]);
}

/** מי חותם: הלקוח, ובדוח משותף (נשואים) — גם בן/בת הזוג. */
export function signersOf(c: Client): Signer[] {
  const g = (x?: string) => (x === 'female' ? 'f' as const : x === 'male' ? 'm' as const : undefined);
  const married = c.familyStatus === 'married';
  const spouseName = c.spouseFirstName || c.spouse?.firstName;
  return [
    { role: 'client', name: c.firstName || 'הלקוח', gender: g(c.gender) },
    ...(married && spouseName ? [{ role: 'spouse' as const, name: spouseName, gender: g((c.spouse as { gender?: string } | null | undefined)?.gender) }] : []),
  ];
}

type Row = Record<string, unknown>;
const fromRow = (r: Row): Signing => {
  const sig = (r.signatures ?? {}) as Record<string, { png: string; signedAt: string }>;
  return {
    id: String(r.id), requestId: String(r.request_id), version: Number(r.version), state: r.state as Signing['state'],
    snapshot: r.snapshot as AnySnapshot, contentSha256: String(r.content_sha256), signers: (r.signers ?? []) as Signer[],
    signed: Object.fromEntries(Object.entries(sig).map(([k, v]) => [k, v.signedAt])), signatures: sig,
    signedAt: r.signed_at ? String(r.signed_at) : undefined, signedDocumentId: r.signed_document_id ? String(r.signed_document_id) : undefined,
  };
};

/** הגרסה החיה (לא «הוחלפה») של הבקשה — או null. */
export async function loadSigning(requestId: string): Promise<Signing | null> {
  const { data, error } = await supabase.from('annual_return_signings').select('*').eq('request_id', requestId).neq('state', 'superseded').order('version', { ascending: false }).limit(1);
  if (error) throw new Error(error.message);
  return data?.[0] ? fromRow(data[0] as Row) : null;
}

type Res<T> = ({ ok: true } & T) | { ok: false; error: string };
async function call<T>(fn: string, args: Row): Promise<Res<T>> {
  const { data, error } = await supabase.rpc(fn, args);
  if (error) return { ok: false, error: error.message };
  const r = (data ?? {}) as Row;
  if (r.ok === false) return { ok: false, error: String(r.error ?? 'error') };
  return { ok: true, ...(r as T) };
}

export const sendForSigning = (requestId: string, snapshot: AnySnapshot, signers: Signer[]) =>
  call<{ id: string; version: number; contentSha256: string }>('annual_return_send_for_signing', { p_request_id: requestId, p_snapshot: snapshot, p_signers: signers });
export const storeSigned = (signingId: string, storagePath: string, fileSize: number, pdfSha256: string) =>
  call<{ documentId: string; already?: boolean }>('annual_return_store_signed', { p_signing_id: signingId, p_storage_path: storagePath, p_file_size: fileSize, p_pdf_sha256: pdfSha256 });

// ── הדף האישי ──
export interface PortalSigning { state: 'awaiting' | 'signed'; version: number; taxYear: number; contentSha256: string; snapshot: AnySnapshot; signers: (Signer & { signed: boolean; signedAt?: string })[] }
export async function portalGetSigning(token: string, stepId: string): Promise<Res<PortalSigning>> {
  return call<PortalSigning>('portal_annual_return_get', { p_token: token, p_step_id: stepId });
}
export const portalSign = (token: string, stepId: string, role: Role, png: string, contentSha256: string) =>
  call<{ allSigned: boolean }>('portal_annual_return_sign', { p_token: token, p_step_id: stepId, p_role: role, p_png: png, p_content_sha256: contentSha256, p_consent: true });

/** הודעה בעברית לקוד מהשרת. */
export function signErrorText(e: string): string {
  switch (e) {
    case 'content_changed': return 'המסמך עודכן בינתיים במשרד. פותחים שוב ורואים את הגרסה החדשה.';
    case 'already_signed': return 'כבר נחתם.';
    case 'bad_signature': return 'החתימה לא נקלטה — חותמים שוב.';
    case 'consent_required': return 'צריך לסמן את ההצהרה.';
    case 'invalid': case 'step_not_found': case 'not_published': case 'not_available': return 'המסמך לא זמין לחתימה כרגע.';
    case 'request_closed': return 'הבקשה סגורה.';
    default: return 'לא הצלחנו לשמור — נסו שוב.';
  }
}

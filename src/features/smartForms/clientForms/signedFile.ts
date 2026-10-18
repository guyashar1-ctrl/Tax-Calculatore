// ─── הקובץ החתום — מקור אחד לדף האישי ולמשרד ──────────────────────────────────
// ‼ 17.10.2026 · גיא: «המסמכים כמו אלה ישמרו במסמכים של הלקוח». הדף האישי בונה את הקובץ
//   ברגע החתימה ושולח ל-portal-signed-form (259); המשרד בונה אותו רק כגיבוי (ClientFormPanel).
//   שני הצדדים קוראים לפונקציה הזו, כדי שהקובץ ייראה אותו דבר מי שלא בנה אותו.

import { supabase } from '../../../lib/supabase';
import { renderClientForm } from './registry';
import { todayIso } from './format';
import { needsOfficeRep } from './officeRep';
import type { SmartFormTemplate } from '../types';
import type { CfData, ClientFormDef } from './types';

export async function renderSignedClientForm(def: ClientFormDef, data: CfData, opts: {
  template: SmartFormTemplate; signature: string; repName: string; clientName: string; signedAt?: string | null;
}): Promise<Uint8Array> {
  const signDate = String(data.signDate || '') || todayIso();
  const d = needsOfficeRep(def) && opts.repName ? { ...data, repName: opts.repName, repDate: signDate } : data;
  const { bytes } = await renderClientForm(def, d, {
    template: opts.template, signature: opts.signature, title: `${def.template.title} — ${opts.clientName} — חתום`,
    date: new Date(opts.signedAt ?? `${signDate}T12:00:00Z`),
  });
  return bytes;
}

/** הדף האישי: שולח את הקובץ החתום לשמירה במסמכי הלקוח. כשל אינו חוסם — למשרד יש גיבוי. */
export async function storeSignedFromPortal(token: string, stepId: string, bytes: Uint8Array): Promise<{ ok: boolean; error?: string }> {
  const form = new FormData();
  form.append('token', token);
  form.append('stepId', stepId);
  form.append('file', new File([bytes.slice().buffer as ArrayBuffer], 'signed.pdf', { type: 'application/pdf' }));
  const { data, error } = await supabase.functions.invoke('portal-signed-form', { body: form });
  if (error) return { ok: false, error: error.message };
  const r = data as { ok?: boolean; error?: string } | null;
  return r?.ok ? { ok: true } : { ok: false, error: r?.error ?? 'failed' };
}

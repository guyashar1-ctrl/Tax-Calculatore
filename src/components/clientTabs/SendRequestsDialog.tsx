// ─── «שלח בקשות» — סקירה אחת לפי נמען, מייל לכל נמען ─────────────────────────
// המודל המאושר (docs/prototypes/requests-v3-responsibility-v1.html): הרו"ח
// לוחץ פעם אחת, רואה מי יקבל מה ומאיזו כתובת, יכול להוציא נמען מהשליחה
// הזאת, לפתוח תצוגה מקדימה של המייל האמיתי, ואז שולח — והמערכת מפיקה מייל
// נפרד לכל נמען דרך **מנגנוני השליחה הקיימים**:
//   • בעל הכרטיס  → send-process-open-email (מייל הדף האישי, כמו «שלח שוב את הקישור»)
//   • אדם במשק הבית → send-onboarding-email · stage ni_approve (הוראות אישור ב"ל)
// אין כאן מסלול משלוח חדש, אין כתיבה למסד מהדפדפן: מה "נשלח" נקבע בשרת
// (record_email_sent), והנמען נפתר שם מהכרטיס ולא מהכתובת שכאן על המסך.
//
// ‼ מה מוכן לשליחה מגיע מ-client_ready_to_send (192) — אותו מקור של גלולת
// «טרם נשלח» ושל המונה על הכפתור. ‼ בקבוצת בעל הכרטיס אין הוצאה של פריט
// בודד: המייל מפרט את מה שממתין בדף (get_client_portal) ואין מעקב לכל פריט
// מה כבר נאמר לו; הוצאה מהשליחה היא ברמת הנמען. תועד ב-FINDINGS §I.

import { useEffect, useState } from 'react';
import Modal from '../ui/Modal';
import EmailInput from '../ui/EmailInput';
import InfoLines from '../ui/InfoLines';
import { supabase } from '../../lib/supabase';
import { isValidEmail } from '../../utils/email';
import { EMAIL_PREVIEW_SANDBOX, withExternalLinks } from '../../utils/emailPreviewHtml';
import { formatDate } from '../../utils/dateFormat';
import { STEP_TYPE_LABELS, type OnboardingStepType } from '../../types/onboarding';
import type { Client } from '../../types';
import type { ReadyToSend } from '../../hooks/useReadyToSend';

interface Props {
  clientId: string;
  clientName: string;
  ready: ReadyToSend;
  /** פותח את המגש כשקבוצה מסוימת במוקד — למשל מכפתור «שלח לדין את ההוראות». */
  focusKey?: string;
  /** כתובת שהוזנה כאן נכתבת לכרטיס — הקנוני, כמו ב-NiInstructionsDialog. */
  onUpdateClientFields?: (patch: Partial<Client>) => Promise<void>;
  onClose: () => void;
  /** אחרי שליחה מוצלחת אחת לפחות — הקורא מרענן בקשות/ביצוע/מוכנות. */
  onSent: () => void;
}

type GroupKind = 'page' | 'ni';
interface Group {
  key: string;
  kind: GroupKind;
  who: string;
  first: string;
  email: string;
  role?: 'client' | 'spouse';
  clientId?: string;
  stepId?: string;
  requestId?: string;
  what: string;
  subjectHint: string;
  items: { title: string; sub?: string }[];
  on: boolean;
  preview?: { subject: string; to: string; from?: string; html: string } | null;
  previewOpen: boolean;
  previewLoading: boolean;
  previewError?: string | null;
  editAddr: boolean;
  draftAddr: string;
  status?: 'sending' | 'ok' | 'err';
  error?: string;
}

const ERROR_TEXT: Record<string, string> = {
  'no client email': 'אין כתובת מייל בכרטיס.',
  no_recipient_email: 'אין כתובת מייל לנמען.',
  'not found': 'הבקשה לא נמצאה.',
  unauthorized: 'ההתחברות פגה - יש להיכנס מחדש.',
  missing_reference_number: 'חסר מספר אסמכתא של הביטוח הלאומי.',
  resend_failed: 'שרת המייל דחה את השליחה.',
  resend_unreachable: 'שרת המייל לא זמין כרגע.',
  step_mismatch: 'הבקשה והאדם אינם תואמים - רענן את המסך.',
  nothing_to_send: 'אין על מה להודיע ללקוח.',
};

async function errText(data: any, error: any): Promise<string> {
  let body = data;
  const ctx = error && (error as { context?: Response }).context;
  if (!body && ctx && typeof ctx.json === 'function') {
    try { body = await ctx.clone().json(); } catch { /* גוף שאינו JSON */ }
  }
  const code = body?.error;
  return body?.detail?.message || (code && (ERROR_TEXT[code] || code)) || error?.message || 'הפעולה נכשלה';
}

function requestBody(g: Group, preview: boolean): { fn: string; body: Record<string, unknown> } {
  if (g.kind === 'page') return { fn: 'send-process-open-email', body: { clientId: g.clientId, ...(preview ? { preview: true } : {}) } };
  return {
    fn: 'send-onboarding-email',
    body: { requestId: g.requestId, stage: 'ni_approve', niRole: g.role, stepId: g.stepId, ...(preview ? { preview: true } : {}) },
  };
}

const firstName = (full: string) => full.trim().split(/\s+/)[0] || full;

export function buildGroups(ready: ReadyToSend, clientId: string, clientName: string): Group[] {
  const groups: Group[] = [];
  if (ready.owner.items.length > 0) {
    groups.push({
      key: 'owner', kind: 'page', who: clientName, first: firstName(clientName),
      email: ready.owner.email ?? '', clientId,
      what: 'מייל אחד עם קישור לדף האישי — מפרט את מה שממתין לו',
      subjectHint: `«${firstName(clientName)}, יש דברים שממתינים לך»`,
      items: ready.owner.items.map(i => ({
        title: i.title || STEP_TYPE_LABELS[i.stepType as OnboardingStepType] || i.stepType,
        sub: i.changedAt
          ? `בדף מ-${formatDate(i.publishedAt, 'list')} · עודכן ${formatDate(i.changedAt, 'list')} · העדכון טרם נשלח`
          : `בדף מ-${formatDate(i.publishedAt, 'list')} · טרם נשלח`,
      })),
      on: true, previewOpen: false, previewLoading: false, editAddr: false, draftAddr: ready.owner.email ?? '',
    });
  }
  for (const p of ready.persons) {
    groups.push({
      key: `ni:${p.role}`, kind: 'ni', who: p.name, first: firstName(p.name), email: p.email ?? '',
      role: p.role, stepId: p.stepId, requestId: p.requestId,
      what: p.role === 'spouse' ? 'מייל ייעודי — אין לו/לה דף אישי' : 'מייל ייעודי — הוראות האישור בביטוח לאומי',
      subjectHint: `«נשאר צעד אחד בביטוח הלאומי, ${firstName(p.name)}» · אסמכתא, מועד, קישור וטלפון`,
      items: [{
        title: 'הוראות לאישור ייפוי הכוח בביטוח לאומי',
        sub: `אסמכתא ${p.referenceNumber}${p.deadline ? ` · עד ${formatDate(p.deadline, 'form')}` : ''}`,
      }],
      on: true, previewOpen: false, previewLoading: false, editAddr: false, draftAddr: p.email ?? '',
    });
  }
  return groups;
}

export default function SendRequestsDialog({ clientId, clientName, ready, focusKey, onUpdateClientFields, onClose, onSent }: Props) {
  const [groups, setGroups] = useState<Group[]>(() => buildGroups(ready, clientId, clientName));
  const [phase, setPhase] = useState<'review' | 'sending' | 'done'>('review');

  useEffect(() => {
    if (!focusKey) return;
    const el = document.getElementById(`srd-${focusKey}`);
    el?.scrollIntoView({ block: 'nearest' });
  }, [focusKey]);

  const patch = (key: string, p: Partial<Group>) =>
    setGroups(gs => gs.map(g => (g.key === key ? { ...g, ...p } : g)));

  async function togglePreview(g: Group) {
    if (g.previewOpen) { patch(g.key, { previewOpen: false }); return; }
    if (g.preview) { patch(g.key, { previewOpen: true }); return; }
    patch(g.key, { previewOpen: true, previewLoading: true, previewError: null });
    const { fn, body } = requestBody(g, true);
    try {
      const { data, error } = await supabase.functions.invoke(fn, { body });
      if (error || !data?.ok) { patch(g.key, { previewLoading: false, previewError: await errText(data, error) }); return; }
      patch(g.key, { previewLoading: false, preview: { subject: data.subject, to: data.to, from: data.from, html: data.html } });
    } catch (e) {
      patch(g.key, { previewLoading: false, previewError: e instanceof Error ? e.message : String(e) });
    }
  }

  async function saveAddr(g: Group) {
    const v = g.draftAddr.trim();
    if (!isValidEmail(v)) { patch(g.key, { error: 'נדרשת כתובת מייל תקינה.' }); return; }
    if (!onUpdateClientFields) return;
    try {
      // ‼ נכתב לכרטיס — השרת קורא משם. הכתובת שעל המסך היא רק מראה.
      await onUpdateClientFields(g.role === 'spouse' ? { spouseEmail: v } : { email: v });
      patch(g.key, { email: v, editAddr: false, error: undefined, preview: null, previewOpen: false });
    } catch (e) {
      patch(g.key, { error: e instanceof Error ? e.message : 'שמירת הכתובת נכשלה.' });
    }
  }

  const active = groups.filter(g => g.on);
  const sendable = active.filter(g => !!g.email);
  const missing = active.filter(g => !g.email).length;
  const canSend = phase === 'review' && sendable.length > 0 && missing === 0;

  async function send() {
    setPhase('sending');
    let ok = 0;
    for (const g of groups) {
      if (!g.on || !g.email) continue;
      patch(g.key, { status: 'sending', error: undefined });
      const { fn, body } = requestBody(g, false);
      try {
        const { data, error } = await supabase.functions.invoke(fn, { body });
        if (error || !data?.ok) { patch(g.key, { status: 'err', error: await errText(data, error) }); continue; }
        patch(g.key, { status: 'ok' });
        ok++;
      } catch (e) {
        patch(g.key, { status: 'err', error: e instanceof Error ? e.message : String(e) });
      }
    }
    if (ok > 0) onSent();
    setPhase('done');
  }

  const okGroups = groups.filter(g => g.status === 'ok');
  const errGroups = groups.filter(g => g.status === 'err');

  const footer = phase === 'done' ? (
    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '.5rem' }}>
      <button type="button" className="btn btn-primary" onClick={onClose}>חזרה לבקשות</button>
    </div>
  ) : (
    <div style={{ display: 'flex', alignItems: 'center', gap: '.6rem', flexWrap: 'wrap' }}>
      <span style={{ fontSize: 'var(--fs-12)', color: 'var(--ink-3)', flex: 1 }}>
        {missing > 0
          ? `⚠ ${missing === 1 ? 'לנמען אחד אין כתובת' : `${missing} נמענים בלי כתובת`} — הוסף או בטל אותו`
          : sendable.length === 0 ? 'לא נבחר דבר לשליחה'
          : sendable.length === 1 ? `מייל אחד יישלח ל${sendable[0].who}`
          : `${sendable.length} מיילים יישלחו · אחד לכל נמען`}
      </span>
      <button type="button" className="btn btn-ghost" onClick={onClose} disabled={phase === 'sending'}>ביטול</button>
      <button type="button" className="btn btn-primary" disabled={!canSend} onClick={() => void send()}>
        {phase === 'sending' ? 'שולח…' : sendable.length <= 1 ? 'שלח' : `שלח ${sendable.length} מיילים`}
      </button>
    </div>
  );

  const subtitle = phase === 'done'
    ? ''
    : groups.length === 1 ? 'נמען אחד'
    : `${groups.length} נמענים · ${groups.reduce((a, g) => a + g.items.length, 0)} פריטים · כל נמען מקבל מייל משלו`;

  return (
    <Modal title="שלח בקשות" onClose={onClose} width={720} footer={footer}>
      {subtitle && <div style={{ fontSize: 'var(--fs-12)', color: 'var(--ink-3)', marginTop: '-.4rem', marginBottom: '.4rem' }}>{subtitle}</div>}

      {phase === 'done' ? (
        <div className="srd-done">
          <div className="srd-done-mark" aria-hidden="true">{okGroups.length > 0 ? '✓' : '⚠'}</div>
          <h4>{okGroups.length === 0 ? 'לא נשלח דבר' : okGroups.length === 1 ? 'מייל אחד נשלח' : `${okGroups.length} מיילים נשלחו`}</h4>
          {okGroups.length > 0 && (
            <p>{okGroups.map(g => `${g.who} — ${g.items.length === 1 ? 'פריט אחד' : `${g.items.length} פריטים`}`).join(' · ')}</p>
          )}
          {errGroups.length > 0 && (
            <p style={{ color: 'var(--err)' }}>
              {errGroups.map(g => `${g.who}: ${g.error ?? 'השליחה נכשלה'}`).join(' · ')}
            </p>
          )}
          {okGroups.length > 0 && (
            <p style={{ marginTop: 10 }}>מה שנשלח עבר ל«ממתינים» עם «נשלח היום». נרשם ביומן המיילים.</p>
          )}
        </div>
      ) : groups.map(g => {
        const missingAddr = !g.email;
        return (
          <div key={g.key} id={`srd-${g.key}`} className={`srd-rcp ${g.on ? '' : 'is-off'}`}>
            <div className="srd-rcp-head">
              <input type="checkbox" checked={g.on} disabled={phase === 'sending'}
                aria-label={`לשלוח ל${g.who}`}
                onChange={e => patch(g.key, { on: e.target.checked })} />
              <span className="srd-who">{g.who}</span>
              {g.editAddr ? (
                <span className="srd-addr-edit">
                  <EmailInput value={g.draftAddr} placeholder="name@example.com" autoFocus
                    onChange={e => patch(g.key, { draftAddr: e.target.value, error: undefined })} />
                  <button type="button" className="btn btn-sm" onClick={() => void saveAddr(g)}>שמור בכרטיס</button>
                  <button type="button" className="btn btn-sm btn-ghost" onClick={() => patch(g.key, { editAddr: false, draftAddr: g.email, error: undefined })}>ביטול</button>
                </span>
              ) : (
                <>
                  {missingAddr
                    ? <span className="srd-addr is-missing">אין כתובת מייל בכרטיס</span>
                    : <span className="srd-addr" dir="ltr">{g.email}</span>}
                  {onUpdateClientFields && phase !== 'sending' && (
                    <button type="button" className="ui-linkbtn srd-addr-btn" onClick={() => patch(g.key, { editAddr: true })}>
                      {missingAddr ? 'הוסף' : 'שנה'}
                    </button>
                  )}
                </>
              )}
              <span className="srd-what">{g.what}</span>
            </div>
            {g.error && <div className="srd-err">⚠ {g.error}</div>}
            <div className="srd-rcp-body">
              {g.items.map((it, i) => (
                <div key={i} className="srd-item">
                  <span className="srd-item-title">{it.title}</span>
                  {it.sub && <small>{it.sub}</small>}
                </div>
              ))}
              <div className="srd-line">
                <span>{g.kind === 'page'
                  ? `מייל אחד · ${g.items.length === 1 ? 'פריט אחד' : `${g.items.length} פריטים`} · נושא: ${g.subjectHint}`
                  : `נושא: ${g.subjectHint}`}</span>
                <button type="button" className="ui-linkbtn" disabled={missingAddr || phase === 'sending'}
                  onClick={() => void togglePreview(g)}>
                  {g.previewOpen ? 'הסתר תצוגה מקדימה' : 'תצוגה מקדימה'}
                </button>
              </div>
              {g.previewOpen && (
                <div className="srd-preview">
                  {g.previewLoading && <div className="srd-preview-note">טוען את המייל…</div>}
                  {g.previewError && <div className="srd-preview-note" style={{ color: 'var(--err)' }}>⚠ {g.previewError}</div>}
                  {g.preview && (
                    <>
                      <div className="srd-preview-hdr">
                        <span>אל: <b dir="ltr">{g.preview.to}</b></span>
                        {g.preview.from && <span>מאת: <b>{g.preview.from}</b></span>}
                        <span>נושא: <b>{g.preview.subject}</b></span>
                      </div>
                      <iframe title={`תצוגה מקדימה — ${g.who}`} srcDoc={withExternalLinks(g.preview.html)}
                        sandbox={EMAIL_PREVIEW_SANDBOX} className="srd-preview-frame" />
                    </>
                  )}
                </div>
              )}
            </div>
            {g.status && (
              <div className={`srd-status is-${g.status}`}>
                {g.status === 'sending' ? 'שולח…' : g.status === 'ok' ? '✓ נשלח · נרשם ביומן' : `⚠ ${g.error ?? 'השליחה נכשלה'}`}
              </div>
            )}
          </div>
        );
      })}

      {phase === 'review' && groups.some(g => g.kind === 'page') && (
        <InfoLines style={{ fontSize: 'var(--fs-12)', color: 'var(--ink-4)', marginTop: '.7rem' }} items={[
          'המייל לדף האישי מפרט את כל מה שממתין ללקוח בדף — לא רק מה שנוסף לאחרונה.',
          'שום דבר לא יוצא לפני «שלח». נמען שהוסר יופיע שוב בפעם הבאה.',
        ]} />
      )}
    </Modal>
  );
}

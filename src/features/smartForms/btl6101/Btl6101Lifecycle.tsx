// ─── הגשת 6101: בדיקה ונעילה · חתימות · הגשה ומעקב ───────────────────────
// ‼ כל מעבר מצב בשרת (smart_form_advance ודומיו) — המסך רק מציע את הפעולה
// הבאה. «הוגש» ו«התקבלה תשובה» דורשים ראיה; פתיחת הטופס אינה משלימה דבר.

import { useEffect, useMemo, useRef, useState } from 'react';
import SignaturePad from '../../../components/SignaturePad';
import { useDocumentStore, type StoredDoc } from '../../../hooks/useDocumentStore';
import { EmptySignatureError, trimSignature } from '../signatureImage';
import { sha256Hex } from '../hash';
import { israelDate, renderBtl6101, snapshotFor } from './document';
import { requestedSummary, KEY_LABELS, type Issue, type ProfessionalConfirmations, type Resolve6101Result } from './resolve';
import { BTL6101_PURPOSE_LABELS, type Btl6101Purpose } from './model';
import { currentBtlState } from './resolve';
import { formDate } from './layout6101';
import {
  advanceFiling, attachSignedPdf, captureSignature, filingErrorText, issueSignLink, lockForSignature,
  newRevision, setAttachments, signLinkUrl, FILING_STATE_LABELS, type Attachment,
} from '../api';
import { BtlNow, formatIl, type WorkspaceCtx } from './ui';

/**
 * פותח את המסמך החתום **כפי שנשמר** (מהאחסון, לא רינדור מחדש) ומאמת את
 * הטביעה שלו מול זו שנרשמה בשרת בשמירה. ‼ טביעה שונה ⇒ לא נפתח, ומוצגת שגיאה.
 */
function OpenStoredSigned({ docId, expectedSha }: { docId: string; expectedSha: string | null }) {
  const store = useDocumentStore();
  const [state, setState] = useState<'idle' | 'busy' | 'ok' | 'mismatch' | 'error'>('idle');
  const open = async () => {
    setState('busy');
    const win = window.open('', '_blank');
    try {
      const doc = await store.getDoc(docId);
      if (!doc || doc.fileData.byteLength === 0) throw new Error('missing');
      const sha = await sha256Hex(new Uint8Array(doc.fileData));
      if (!expectedSha || sha !== expectedSha) { win?.close(); setState('mismatch'); return; }
      const url = URL.createObjectURL(new Blob([doc.fileData], { type: 'application/pdf' }));
      if (win) win.location.href = url; else window.open(url, '_blank');
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
      setState('ok');
    } catch {
      win?.close();
      setState('error');
    }
  };
  return (
    <span style={{ display: 'inline-flex', gap: '.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
      <button type="button" className="btn btn-sm btn-secondary" disabled={state === 'busy'} onClick={() => void open()}>
        {state === 'busy' ? 'פותח…' : 'פתיחת המסמך החתום'}
      </button>
      {state === 'ok' && <span className="sf-hint" data-testid="sf-stored-verified">הטביעה תואמת למה שנשמר</span>}
      {state === 'mismatch' && <span className="sf-error">הקובץ שבאחסון שונה מהקובץ שנשמר בחתימה — לא נפתח</span>}
      {state === 'error' && <span className="sf-error">לא הצלחתי לטעון את המסמך מתיק הלקוח</span>}
    </span>
  );
}

type Step = 'review' | 'sign' | 'submit';

interface Props {
  step: Step;
  ctx: WorkspaceCtx;
  resolved: Resolve6101Result;
  blockers: Issue[];
  purposes: Btl6101Purpose[];
  dirty: boolean;
  editable: boolean;
  onStep: (s: 'purpose' | 'data' | Step) => void;
  onFocusField: (k: string) => void;
  professional?: ProfessionalConfirmations;
  onProfessional?: (p: ProfessionalConfirmations) => void;
}

export default function Btl6101Lifecycle(p: Props) {
  if (p.step === 'review') return <ReviewStep {...p} />;
  if (p.step === 'sign') return <SignStep {...p} />;
  return <SubmitStep {...p} />;
}

function useAction(ctx: WorkspaceCtx) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const run = async (fn: () => Promise<{ ok: boolean; error?: string }>, after?: () => void) => {
    setBusy(true); setError(null);
    try {
      const r = await fn();
      if (!r.ok) { setError(filingErrorText(r.error)); return false; }
      await ctx.reload();
      ctx.onChanged?.();
      after?.();
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      return false;
    } finally { setBusy(false); }
  };
  return { busy, error, run, setError };
}

// ═════════════════════════════════════════════════════════════════════════
// בדיקה ונעילה
// ═════════════════════════════════════════════════════════════════════════
function ReviewStep({ ctx, resolved, blockers, purposes, dirty, editable, onStep, onFocusField, professional = {}, onProfessional }: Props) {
  const { filing, rev } = ctx;
  const { busy, error, run } = useAction(ctx);
  const warnings = resolved.issues.filter(i => i.severity !== 'blocker');
  const requested = requestedSummary(resolved.data, purposes);
  const missingKeys = blockers.filter(b => b.code === 'missing').map(b => b.key);
  const spouseSigns = purposes.includes('spouse_in_business');

  const lock = () => run(async () => {
    const snapshot = snapshotFor(resolved, [], professional);
    const signers: { role: 'client' | 'spouse'; name: string; idNumber?: string }[] = [{ role: 'client', name: `${resolved.data.firstName} ${resolved.data.lastName}`.trim(), idNumber: resolved.data.idNumber }];
    if (spouseSigns) signers.push({ role: 'spouse', name: `${resolved.data.spouseFirstName} ${resolved.data.spouseLastName}`.trim(), idNumber: resolved.data.spouseIdNumber });
    return lockForSignature(filing.id, rev.revision, snapshot, signers);
  }, () => onStep('sign'));

  const retroAny = resolved.retro.start || resolved.retro.change || resolved.retro.end;
  const startAndEnd = purposes.includes('start') && purposes.includes('end');
  return (
    <>
      {retroAny && (
        <div className="sf-banner is-warn" role="alert" style={{ marginBottom: '.7rem', fontWeight: 500 }}>
          <b>דיווח למפרע — נדרשת בדיקה מקצועית.</b>{' '}
          {[resolved.retro.start && 'תחילת עבודה', resolved.retro.change && 'שינוי היקף', resolved.retro.end && 'הפסקת עבודה'].filter(Boolean).join(', ')}
          {' '}בשנה קודמת. אפשר להכין את הטופס ולהחתים עליו, אבל אין בכך שום הבטחה שביטוח לאומי יקבל או יאשר את הבקשה.
          האסמכתאות התומכות יירשמו כחובה, ו«הוגש» ייחסם עד שיצורפו.
        </div>
      )}
      <div className="sf-section">
        <h3>מה ב"ל מחזיק כרגע, ומה מבקשים</h3>
        <div className="sf-compare">
          <div><h4>רשום בביטוח לאומי</h4><BtlNow btl={resolved.btl} /></div>
          <div className="is-requested">
            <h4>מבוקש בהגשה הזו</h4>
            {requested.length ? requested.map(r => <div key={r}>{r}</div>) : <div className="sf-note">לא נבחרה מטרה</div>}
          </div>
        </div>
        <div className="sf-note" style={{ marginTop: '.45rem' }}>
          הגשה וחתימה אינן אישור. הסיווג נקבע בביטוח לאומי, והמצב בכרטיס יתעדכן רק מתשובה רשמית או מקריאה חוזרת של הנתונים מב"ל.
        </div>
      </div>

      {resolved.definition && (
        <div className="sf-section">
          <h3>הגדרת «עובד עצמאי» <span className="sf-hint">הערכה לבדיקה המקצועית — לא החלטה</span></h3>
          <div style={{ fontSize: 'var(--fs-13)' }}>
            {resolved.definition.kind === 'meets' ? 'לפי הנתונים שהוזנו: עומד בהגדרה' : resolved.definition.kind === 'not_meets' ? 'לפי הנתונים שהוזנו: אינו עומד בהגדרה' : 'לא ניתן להעריך'}
            {' — '}{resolved.definition.reason}
          </div>
          <div className="sf-note">הנתונים הם מה שהלקוח מצהיר. אין לבחור שעות, הכנסה או תאריכים כדי להגיע לסיווג מסוים.</div>
        </div>
      )}

      {startAndEnd && (
        <ProfessionalStartEnd value={professional.startAndEnd} editable={editable}
          onChange={v => onProfessional?.({ ...professional, startAndEnd: v })} />
      )}

      <div className="sf-section">
        <h3>לפני חתימה</h3>
        {blockers.length === 0 && warnings.length === 0 && <div className="sf-okline">אין חוסרים או סתירות.</div>}
        <div className="sf-issues">
          {[...blockers, ...warnings].map((i, n) => (
            <div key={n} className={`sf-issue ${i.severity}`}>
              <span className="dot" aria-hidden="true" />
              <button type="button" onClick={() => onFocusField(i.key.split('.')[0])}>{i.message}</button>
            </div>
          ))}
        </div>
        {filing.missingInfo && filing.state === 'waiting_client_info' && (
          <div className="sf-banner is-warn">
            ממתין למידע מהלקוח: {filing.missingInfo.keys.map(k => KEY_LABELS[k] ?? k).join(', ')}{filing.missingInfo.note ? ` · ${filing.missingInfo.note}` : ''}
          </div>
        )}
      </div>

      {editable && (
        <div className="sf-section">
          <h3>הצעד הבא</h3>
          <div className="sf-actions" style={{ marginTop: 0 }}>
            <button type="button" className="btn btn-primary" disabled={busy || dirty || blockers.length > 0} onClick={() => void lock()}
              title={blockers.length ? 'יש חוסרים או סתירות' : dirty ? 'שומר…' : ''}>
              נעל לחתימה
            </button>
            {filing.state !== 'review' && (
              <button type="button" className="btn btn-secondary" disabled={busy} onClick={() => void run(() => advanceFiling(filing.id, 'to_review'))}>
                העבר לבדיקה מקצועית
              </button>
            )}
            {filing.state !== 'waiting_client_info' && missingKeys.length > 0 && (
              <button type="button" className="btn btn-secondary" disabled={busy}
                onClick={() => void run(() => advanceFiling(filing.id, 'wait_client_info', { keys: missingKeys, note: '' }))}>
                ממתין למידע מהלקוח ({missingKeys.length})
              </button>
            )}
            {filing.state === 'waiting_client_info' && (
              <button type="button" className="btn btn-secondary" disabled={busy} onClick={() => void run(() => advanceFiling(filing.id, 'info_received'))}>
                המידע התקבל
              </button>
            )}
            {filing.state === 'review' && (
              <button type="button" className="btn btn-ghost" disabled={busy} onClick={() => void run(() => advanceFiling(filing.id, 'back_to_draft'))}>חזרה לטיוטה</button>
            )}
          </div>
          <div className="sf-note" style={{ marginTop: '.4rem' }}>
            נעילה מקבעת את התוכן (טביעת SHA-256 בשרת). {spouseSigns ? 'יחתמו: המבוטח, ובנפרד בן/בת הזוג (סעיף 4).' : 'יחתום: המבוטח.'} שינוי אחרי נעילה = גרסה חדשה וחתימות מחדש.
          </div>
          {error && <div className="sf-error">{error}</div>}
        </div>
      )}
      {!editable && <div className="sf-banner">{rev.state === 'draft' ? FILING_STATE_LABELS[filing.state] : `הגרסה ננעלה ${rev.lockedAt ? formatIl(rev.lockedAt) : ''} · טביעה ${rev.contentSha256?.slice(0, 12)}…`}</div>}
    </>
  );
}

// ═════════════════════════════════════════════════════════════════════════
// חתימות
// ═════════════════════════════════════════════════════════════════════════
function SignStep({ ctx }: Props) {
  const { filing, rev, client } = ctx;
  const { busy, error, run, setError } = useAction(ctx);
  const [reason, setReason] = useState('');
  const [editOpen, setEditOpen] = useState(false);
  const store = useDocumentStore();
  const [storeState, setStoreState] = useState<'idle' | 'busy' | 'done' | 'error'>('idle');
  const [storeError, setStoreError] = useState<string | null>(null);

  // ‼ פעם אחת בלבד: ב-StrictMode האפקט רץ פעמיים, ושתי העלאות במקביל לאותו נתיב נכשלות (409).
  const storing = useRef(false);
  const storeSigned = async () => {
    if (!rev.snapshot || storing.current) return;
    storing.current = true;
    setStoreState('busy'); setStoreError(null);
    try {
      const clientSigned = rev.signers.find(s => s.role === 'client')?.signedAt;
      if (!clientSigned) throw new Error('חתימת המבוטח חסרה');
      const declarationDate = israelDate(clientSigned);
      const sig = Object.fromEntries(Object.entries(rev.signatures).map(([k, v]) => [k, v?.png]));
      const { bytes } = await renderBtl6101({ ...rev.snapshot.data, declarationDate }, rev.purposes, {
        signatures: sig, title: `טופס 6101 חתום — ${client.firstName} ${client.lastName} — גרסה ${rev.revision}`,
        date: new Date(rev.signedAt ?? clientSigned),
      });
      const sha = await sha256Hex(bytes);
      const docId = `sf6101-${filing.id}-r${rev.revision}`;
      const doc: StoredDoc = {
        id: docId, clientId: client.id,
        fileName: `6101-${client.lastName || 'client'}-${declarationDate}-v${rev.revision}.pdf`,
        fileType: 'application/pdf', fileSize: bytes.byteLength, category: 'ni_document',
        year: Number(declarationDate.slice(0, 4)), uploadedAt: new Date().toISOString(),
        description: `טופס 6101 חתום (${rev.purposes.map(p => BTL6101_PURPOSE_LABELS[p]).join(' · ')}) — גרסה ${rev.revision}`,
        notes: `SHA-256 ${sha}`, fileData: bytes.slice().buffer as ArrayBuffer, _remote: true,
      };
      await store.saveDoc(doc);
      const r = await attachSignedPdf(filing.id, rev.revision, docId, sha);
      if (!r.ok) throw new Error(filingErrorText(r.error));
      window.dispatchEvent(new CustomEvent('crm:docs-changed', { detail: { clientId: client.id } }));
      await ctx.reload();
      ctx.onChanged?.();
      setStoreState('done');
    } catch (e) {
      storing.current = false;
      setStoreState('error'); setStoreError(e instanceof Error ? e.message : String(e));
    }
  };

  const allSigned = rev.state === 'signed';
  // אחרי שכל החותמים חתמו — המסמך החתום נשמר מיד (פעולה אחת, דטרמיניסטית).
  useEffect(() => {
    if (allSigned && !rev.signedDocumentId && storeState === 'idle') void storeSigned();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allSigned, rev.signedDocumentId]);

  if (rev.state === 'draft') {
    return <div className="sf-banner">הטופס עוד לא ננעל לחתימה. «בדיקה ונעילה» ← «נעל לחתימה».</div>;
  }

  return (
    <>
      <div className="sf-section">
        <h3>חתימות <span className="sf-hint">גרסה {rev.revision} · טביעה {rev.contentSha256?.slice(0, 12)}…</span></h3>
        {rev.signers.filter(s => s.required).map(s => (
          <SignerCard key={s.role} ctx={ctx} role={s.role} name={s.name} status={s.status} signedAt={s.signedAt} method={s.method}
            linkExpiresAt={rev.signTokens[s.role]?.expiresAt} />
        ))}
      </div>

      {allSigned && (
        <div className="sf-section">
          <h3>המסמך החתום</h3>
          {rev.signedDocumentId
            ? <>
                <div className="sf-okline">נשמר בתיק הלקוח («מסמכים») · SHA-256 {rev.signedPdfSha256?.slice(0, 16)}…</div>
                <div className="sf-actions" style={{ marginTop: '.4rem' }}><OpenStoredSigned docId={rev.signedDocumentId} expectedSha={rev.signedPdfSha256} /></div>
              </>
            : storeState === 'busy' ? <div className="sf-note">מפיק ושומר את המסמך החתום…</div>
            : <>
                {storeError && <div className="sf-error">{storeError}</div>}
                <button type="button" className="btn btn-primary" onClick={() => void storeSigned()}>הפק ושמור את המסמך החתום</button>
              </>}
        </div>
      )}

      {['awaiting_signatures', 'signed'].includes(filing.state) && (
        <div className="sf-section">
          <h3>צריך לשנות משהו?</h3>
          {!editOpen ? (
            <button type="button" className="btn btn-sm btn-secondary" onClick={() => setEditOpen(true)}>ערוך — גרסה חדשה</button>
          ) : (
            <div className="sf-fields">
              <div className="sf-banner is-warn">גרסה חדשה מבטלת את כל החתימות על הגרסה הזו, והקישורים שנשלחו יפסיקו לעבוד. {allSigned ? 'המסמך החתום נשאר בתיק כהיסטוריה.' : ''}</div>
              <div className="sf-field"><label>מה משתנה ולמה</label><input value={reason} onChange={e => setReason(e.target.value)} /></div>
              <div className="sf-actions">
                <button type="button" className="btn btn-sm btn-danger" disabled={busy || !reason.trim()}
                  onClick={() => void run(() => newRevision(filing.id, reason.trim()), () => setEditOpen(false))}>צור גרסה חדשה</button>
                <button type="button" className="btn btn-sm btn-ghost" onClick={() => { setEditOpen(false); setError(null); }}>ביטול</button>
              </div>
            </div>
          )}
          {error && <div className="sf-error">{error}</div>}
        </div>
      )}
    </>
  );
}

function SignerCard({ ctx, role, name, status, signedAt, method, linkExpiresAt }: {
  ctx: WorkspaceCtx; role: 'client' | 'spouse'; name: string; status: 'pending' | 'signed'; signedAt?: string; method?: string; linkExpiresAt?: string;
}) {
  const { filing, rev } = ctx;
  const { busy, error, run, setError } = useAction(ctx);
  const [mode, setMode] = useState<'idle' | 'pad' | 'link'>('idle');
  const [png, setPng] = useState('');
  const [present, setPresent] = useState(false);
  const [link, setLink] = useState<{ url: string; expiresAt: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const roleLabel = role === 'client' ? 'המבוטח/ת' : 'בן/בת הזוג';
  const where = role === 'client' ? 'עמוד 3 — «חתימת המבוטח»' : 'עמוד 2 — «חתימת בן/בת הזוג» (סעיף 4)';

  const submitPad = () => run(async () => {
    let trimmed;
    try { trimmed = await trimSignature(png); } catch (e) {
      return { ok: false, error: e instanceof EmptySignatureError ? 'bad_signature_image' : String(e) };
    }
    return captureSignature(filing.id, rev.revision, role, trimmed.dataUrl, rev.contentSha256 ?? '',
      `${name} נכח/ה במשרד, עבר/ה על הטופס שהוצג (טביעה ${rev.contentSha256?.slice(0, 12)}) וחתם/ה בעצמו/ה`);
  }, () => setMode('idle'));

  return (
    <div className="sf-signer">
      <div className="sf-signer-head">
        <b>{roleLabel}: {name}</b>
        {status === 'signed'
          ? <span className="sf-badge sf-b-verified">חתם/ה {signedAt ? formatIl(signedAt) : ''} · {method === 'remote_link' ? 'בקישור אישי' : 'במשרד'}</span>
          : <span className="sf-badge sf-b-confirm">ממתין לחתימה</span>}
      </div>
      <div className="sf-note">מקום החתימה: {where}</div>
      {status !== 'signed' && filing.state === 'awaiting_signatures' && (
        <>
          {mode === 'idle' && (
            <div className="sf-actions" style={{ marginTop: 0 }}>
              <button type="button" className="btn btn-sm btn-primary" onClick={() => { setMode('pad'); setError(null); }}>חתימה כאן במשרד</button>
              <button type="button" className="btn btn-sm btn-secondary" disabled={busy} onClick={async () => {
                setError(null);
                const r = await issueSignLink(filing.id, rev.revision, role, 14);
                if (!r.ok) { setError(filingErrorText(r.error)); return; }
                setLink({ url: signLinkUrl(r.token as string), expiresAt: r.expiresAt as string });
                setMode('link');
                await ctx.reload();
              }}>{linkExpiresAt ? 'קישור חדש (מבטל את הקודם)' : 'קישור חתימה אישי'}</button>
              {linkExpiresAt && !link && <span className="sf-note">קישור פעיל עד {formatIl(linkExpiresAt)}</span>}
            </div>
          )}
          {mode === 'pad' && (
            <div className="sf-fields">
              <div className="sf-note">{roleLabel} חותם/ת על המסך שלפניו/ה, אחרי שעבר/ה על הטופס בתצוגה.</div>
              <div className="sf-pad"><SignaturePad value={png} onChange={setPng} height={160} /></div>
              <label className="checkbox-row" style={{ fontSize: 'var(--fs-13)' }}>
                <input type="checkbox" style={{ width: 'auto' }} checked={present} onChange={e => setPresent(e.target.checked)} />
                {name} נמצא/ת כאן, עבר/ה על הטופס שמוצג וחותם/ת בעצמו/ה
              </label>
              <div className="sf-actions">
                <button type="button" className="btn btn-sm btn-primary" disabled={busy || !png || !present} onClick={() => void submitPad()}>אישור החתימה</button>
                <button type="button" className="btn btn-sm btn-ghost" onClick={() => { setMode('idle'); setPng(''); setPresent(false); }}>ביטול</button>
              </div>
            </div>
          )}
          {mode === 'link' && link && (
            <div className="sf-fields">
              <div className="sf-link">
                <input readOnly value={link.url} onFocus={e => e.currentTarget.select()} aria-label="קישור החתימה" />
                <button type="button" className="btn btn-sm btn-secondary" onClick={async () => {
                  try { await navigator.clipboard.writeText(link.url); setCopied(true); } catch { setCopied(false); }
                }}>{copied ? 'הועתק' : 'העתקה'}</button>
              </div>
              <div className="sf-note">
                קישור אישי ל{roleLabel} בלבד, לחתימה אחת, תקף עד {formatIl(link.expiresAt)}. PIVO לא שולח אותו — העבירו בערוץ שלכם.
                אחרי החתימה המצב כאן יתעדכן.
              </div>
              <button type="button" className="btn btn-sm btn-ghost" onClick={() => setMode('idle')}>סגירה</button>
            </div>
          )}
        </>
      )}
      {error && <div className="sf-error">{error}</div>}
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════════
// הגשה ומעקב
// ═════════════════════════════════════════════════════════════════════════
const CHANNELS: { v: string; label: string }[] = [
  { v: 'representatives_portal', label: 'המשרד הגיש (מערכת המייצגים)' },
  { v: 'online_form', label: 'טופס מקוון באתר ביטוח לאומי' },
  { v: 'branch', label: 'בסניף' },
  { v: 'mail', label: 'בדואר' },
  { v: 'fax', label: 'בפקס' },
  { v: 'client_personal_area', label: 'הלקוח הגיש באזור האישי' },
];

function SubmitStep({ ctx, onStep }: Props) {
  const { filing, rev, client, revisions, events } = ctx;
  const { busy, error, run } = useAction(ctx);
  const store = useDocumentStore();
  const [docs, setDocs] = useState<StoredDoc[]>([]);
  useEffect(() => { void store.getDocsByClient(client.id).then(setDocs).catch(() => setDocs([])); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [client.id, filing.updatedAt]);

  const signedRev = [...revisions].reverse().find(r => r.state === 'signed' && r.signedDocumentId && r.revision === filing.currentRevision);
  const [channel, setChannel] = useState('representatives_portal');
  const [subDate, setSubDate] = useState(israelDate(new Date().toISOString()));
  const [reference, setReference] = useState('');
  const [evidenceDoc, setEvidenceDoc] = useState('');
  const [resStatus, setResStatus] = useState<'approved' | 'rejected' | 'partial'>('approved');
  const [resSummary, setResSummary] = useState('');
  const [resRef, setResRef] = useState('');
  const [resDoc, setResDoc] = useState('');
  const [infoNote, setInfoNote] = useState('');
  const [followUp, setFollowUp] = useState<'none' | 'reserve_duty_claim' | 'refund_check' | 'other'>('none');
  const [fuOwner, setFuOwner] = useState<'client' | 'me'>('client');
  const [fuTitle, setFuTitle] = useState('');
  const [fuNote, setFuNote] = useState('');

  const attachments: Attachment[] = filing.attachments.length ? filing.attachments : (rev.snapshot?.requiredAttachments ?? []);
  const missingAttach = attachments.filter(a => a.required && !a.documentId);
  const btlNow = useMemo(() => currentBtlState(client, israelDate(new Date().toISOString())), [client]);
  const syncedAfterSubmit = !!(filing.submission?.submittedAt && btlNow.syncedAt && btlNow.syncedAt.slice(0, 10) >= filing.submission.submittedAt);
  const docOptions = docs.filter(d => d.id !== rev.signedDocumentId);

  if (!signedRev && !['submitted', 'info_requested', 'result_received', 'closed', 'awaiting_client_submission'].includes(filing.state)) {
    return (
      <div className="sf-banner">
        {filing.state === 'signed' ? 'כל החתימות נקלטו — צריך להפיק ולשמור את המסמך החתום.' : 'ההגשה נפתחת אחרי שכל החתימות נקלטו והמסמך החתום נשמר.'}
        {filing.state === 'signed' && <div className="sf-actions"><button type="button" className="btn btn-sm btn-primary" onClick={() => onStep('sign')}>למסמך החתום</button></div>}
      </div>
    );
  }

  const saveAttachments = (next: Attachment[]) => run(() => setAttachments(filing.id, next));

  return (
    <>
      <div className="sf-section">
        <h3>המסמך החתום</h3>
        <div className="sf-okline">גרסה {rev.revision} · נשמר בתיק הלקוח · SHA-256 {rev.signedPdfSha256?.slice(0, 16)}…</div>
        <div className="sf-note">החתימות: {rev.signers.filter(s => s.required).map(s => `${s.name} (${s.signedAt ? formatIl(s.signedAt) : '—'})`).join(' · ')}</div>
        {rev.signedDocumentId && <div className="sf-actions" style={{ marginTop: '.4rem' }}><OpenStoredSigned docId={rev.signedDocumentId} expectedSha={rev.signedPdfSha256} /></div>}
      </div>

      {['signed', 'awaiting_client_submission'].includes(filing.state) && (
        <div className="sf-section">
          <h3>אסמכתאות מצורפות</h3>
          {attachments.length === 0 && <div className="sf-note">אין אסמכתאות נדרשות לפי מה שהוזן.</div>}
          {attachments.map((a, i) => (
            <div key={a.key} className="sf-field" style={{ marginBottom: '.45rem' }}>
              <label>{a.label}{a.required ? <span className="sf-req">*</span> : <span className="sf-hint">מומלץ</span>}</label>
              <select value={a.documentId ?? ''} onChange={e => void saveAttachments(attachments.map((x, j) => (j === i ? { ...x, documentId: e.target.value || null } : x)))}>
                <option value="">— לבחור מסמך מתיק הלקוח —</option>
                {docOptions.map(d => <option key={d.id} value={d.id}>{d.description || d.fileName}</option>)}
              </select>
            </div>
          ))}
        </div>
      )}

      {['signed', 'awaiting_client_submission'].includes(filing.state) && (
        <div className="sf-section">
          <h3>הגשה</h3>
          {filing.state === 'signed' && (
            <div className="sf-actions" style={{ marginTop: 0, marginBottom: '.6rem' }}>
              <button type="button" className="btn btn-sm btn-secondary" disabled={busy || missingAttach.length > 0}
                onClick={() => void run(() => advanceFiling(filing.id, 'handoff_to_client', { note: 'הלקוח מגיש באזור האישי' }))}>
                הלקוח יגיש בעצמו באזור האישי
              </button>
              <span className="sf-note">כשלמשרד אין גישה לאזור האישי של הלקוח. הסטטוס יהיה «ממתין ללקוח» עד שתירשם ראיה להגשה.</span>
            </div>
          )}
          {filing.state === 'awaiting_client_submission' && (
            <div className="sf-banner is-info" style={{ marginBottom: '.5rem' }}>ממתינים שהלקוח יגיש באזור האישי. רושמים הגשה רק עם אסמכתא או צילום אישור.</div>
          )}
          <div className="sf-fields">
            <div className="sf-row2">
              <div className="sf-field"><label>איך הוגש</label>
                <select value={filing.state === 'awaiting_client_submission' ? 'client_personal_area' : channel} disabled={filing.state === 'awaiting_client_submission'} onChange={e => setChannel(e.target.value)}>
                  {CHANNELS.map(c => <option key={c.v} value={c.v}>{c.label}</option>)}
                </select>
              </div>
              <div className="sf-field"><label>תאריך ההגשה</label><input type="date" data-ltr="" value={subDate} onChange={e => setSubDate(e.target.value)} /></div>
            </div>
            <div className="sf-row2">
              <div className="sf-field"><label>מספר אסמכתא / פנייה</label><input data-ltr="" value={reference} onChange={e => setReference(e.target.value)} /></div>
              <div className="sf-field"><label>צילום/אישור ההגשה (מסמך)</label>
                <select value={evidenceDoc} onChange={e => setEvidenceDoc(e.target.value)}>
                  <option value="">— אין —</option>
                  {docOptions.map(d => <option key={d.id} value={d.id}>{d.description || d.fileName}</option>)}
                </select>
              </div>
            </div>
          </div>
          <div className="sf-actions">
            <button type="button" className="btn btn-primary" disabled={busy || missingAttach.length > 0}
              onClick={() => void run(() => advanceFiling(filing.id, 'record_submission', {
                channel: filing.state === 'awaiting_client_submission' ? 'client_personal_area' : channel,
                submittedAt: subDate, reference: reference.trim(), evidenceDocumentId: evidenceDoc || undefined,
              }))}>רשום שהטופס הוגש</button>
            {missingAttach.length > 0 && <span className="sf-error">חסרות אסמכתאות חובה</span>}
          </div>
        </div>
      )}

      {['submitted', 'info_requested', 'result_received', 'closed'].includes(filing.state) && filing.submission && (
        <div className="sf-section">
          <h3>הוגש</h3>
          <div style={{ fontSize: 'var(--fs-13)' }}>
            {CHANNELS.find(c => c.v === filing.submission?.channel)?.label ?? filing.submission.channel} · {filing.submission.submittedAt ? formDate(filing.submission.submittedAt) : ''}
            {filing.submission.reference ? ` · אסמכתא ${filing.submission.reference}` : ''}
          </div>
          <div className="sf-compare" style={{ marginTop: '.5rem' }}>
            <div><h4>ב"ל עכשיו {btlNow.syncedAt ? `(נקרא ${formatIl(btlNow.syncedAt)})` : ''}</h4><BtlNow btl={btlNow} /></div>
            <div className="is-requested"><h4>מה הוגש</h4>{requestedSummary(rev.snapshot?.data ?? ({} as never), rev.purposes).map(r => <div key={r}>{r}</div>)}</div>
          </div>
          <div className="sf-note" style={{ marginTop: '.4rem' }}>
            {syncedAfterSubmit ? 'הנתונים מב"ל נקראו אחרי ההגשה — אפשר להשוות ולרשום את התשובה עם הקריאה כראיה.' : 'כדי לראות אם ב"ל עדכן: «בדוק מול ב"ל» בתיק המס. עד אז — ממתינים.'}
          </div>
        </div>
      )}

      {filing.state === 'submitted' && (
        <div className="sf-section">
          <h3>ביטוח לאומי ביקש מידע נוסף?</h3>
          <div className="sf-field"><label>מה התבקש</label><input value={infoNote} onChange={e => setInfoNote(e.target.value)} /></div>
          <div className="sf-actions"><button type="button" className="btn btn-sm btn-secondary" disabled={busy || !infoNote.trim()}
            onClick={() => void run(() => advanceFiling(filing.id, 'record_info_request', { note: infoNote.trim() }))}>רשום בקשת מידע</button></div>
        </div>
      )}
      {filing.state === 'info_requested' && (
        <div className="sf-section">
          <h3>בקשת מידע מב"ל</h3>
          <div className="sf-banner is-warn">{filing.outcome?.infoRequest?.note}</div>
          <div className="sf-actions"><button type="button" className="btn btn-sm btn-secondary" disabled={busy}
            onClick={() => void run(() => advanceFiling(filing.id, 'info_provided', { note: 'המידע נמסר' }))}>המידע נמסר לב"ל</button></div>
        </div>
      )}

      {['submitted', 'info_requested'].includes(filing.state) && (
        <div className="sf-section">
          <h3>תשובה רשמית מביטוח לאומי</h3>
          <div className="sf-fields">
            <div className="sf-row2">
              <div className="sf-field"><label>התשובה</label>
                <select value={resStatus} onChange={e => setResStatus(e.target.value as typeof resStatus)}>
                  <option value="approved">אושר</option><option value="partial">אושר חלקית</option><option value="rejected">נדחה</option>
                </select>
              </div>
              <div className="sf-field"><label>אסמכתא (מכתב / פנייה)</label><input data-ltr="" value={resRef} onChange={e => setResRef(e.target.value)} /></div>
            </div>
            <div className="sf-field"><label>מה נקבע</label><input value={resSummary} onChange={e => setResSummary(e.target.value)} placeholder="למשל: סווג כעצמאי מ-01/10/2026" /></div>
            <div className="sf-field"><label>מסמך התשובה</label>
              <select value={resDoc} onChange={e => setResDoc(e.target.value)}>
                <option value="">— אין —</option>
                {docOptions.map(d => <option key={d.id} value={d.id}>{d.description || d.fileName}</option>)}
              </select>
            </div>
          </div>
          <div className="sf-actions">
            <button type="button" className="btn btn-primary" disabled={busy || !resSummary.trim() || (!resRef.trim() && !resDoc && !syncedAfterSubmit)}
              onClick={() => void run(() => advanceFiling(filing.id, 'record_result', {
                status: resStatus, summary: resSummary.trim(), reference: resRef.trim(), evidenceDocumentId: resDoc || undefined,
                btlSyncAt: !resRef.trim() && !resDoc && syncedAfterSubmit ? btlNow.syncedAt : undefined,
              }))}>רשום תשובה</button>
            <span className="sf-note">נדרשת ראיה: אסמכתא, מסמך, או קריאה מב"ל אחרי ההגשה.</span>
          </div>
        </div>
      )}

      {filing.state === 'result_received' && (
        <div className="sf-section">
          <h3>התשובה: {filing.outcome?.status === 'approved' ? 'אושר' : filing.outcome?.status === 'partial' ? 'אושר חלקית' : 'נדחה'}</h3>
          <div style={{ fontSize: 'var(--fs-13)' }}>{filing.outcome?.summary}</div>
          <div className="sf-note" style={{ margin: '.35rem 0 .6rem' }}>
            המצב בכרטיס (עיסוקים וסיווג בב"ל) מתעדכן מ«בדוק מול ב"ל» בתיק המס — כך הוא נשאר מה שב"ל באמת מחזיק.
          </div>
          <h3>המשך</h3>
          <div className="sf-fields">
            <div className="sf-field"><label>נדרש המשך?</label>
              <select value={followUp} onChange={e => setFollowUp(e.target.value as typeof followUp)}>
                <option value="none">לא — לסגור</option>
                <option value="reserve_duty_claim">תגמולי מילואים / תביעה בעקבות הסיווג</option>
                <option value="refund_check">בדיקת החזר / חוב דמי ביטוח</option>
                <option value="other">אחר</option>
              </select>
            </div>
            {followUp !== 'none' && (
              <>
                <div className="sf-field"><label>מי פועל</label>
                  <select value={fuOwner} onChange={e => setFuOwner(e.target.value as 'client' | 'me')}>
                    <option value="client">הלקוח (באזור האישי — המשרד אינו רואה אותו)</option>
                    <option value="me">המשרד</option>
                  </select>
                </div>
                <div className="sf-field"><label>כותרת</label><input value={fuTitle} onChange={e => setFuTitle(e.target.value)} placeholder={followUp === 'reserve_duty_claim' ? 'הגשת תביעה לתגמולי מילואים' : ''} /></div>
                <div className="sf-field"><label>מה בדיוק צריך לעשות</label><input value={fuNote} onChange={e => setFuNote(e.target.value)} /></div>
                {fuOwner === 'client' && <div className="sf-note">תיווצר בקשה ללקוח כטיוטה (תפורסם בדף האישי רק כשתעדכנו את הדף), והיא תיסגר כשהלקוח יעלה צילום או אישור מהאזור האישי.</div>}
              </>
            )}
          </div>
          <div className="sf-actions">
            <button type="button" className="btn btn-primary" disabled={busy || (followUp !== 'none' && !fuTitle.trim())}
              onClick={() => void run(() => advanceFiling(filing.id, 'close', followUp === 'none' ? {} : {
                followUp, followUpOwner: fuOwner, followUpTitle: fuTitle.trim(), followUpNote: fuNote.trim(),
              }))}>{followUp === 'none' ? 'סגור את ההגשה' : 'סגור ופתח בקשת המשך'}</button>
          </div>
        </div>
      )}

      {filing.state === 'closed' && (
        <div className="sf-section">
          <h3>הושלם {filing.closedAt ? formatIl(filing.closedAt) : ''}</h3>
          {filing.followUp && <div className="sf-note">נפתחה בקשת המשך: {filing.followUp.title ?? filing.followUp.kind} — ב«בקשות».</div>}
        </div>
      )}

      {error && <div className="sf-error">{error}</div>}

      <div className="sf-section">
        <h3>יומן</h3>
        <div className="sf-timeline">
          {events.slice().reverse().map(e => (
            <div key={e.id}><b>{EVENT_LABELS[e.kind] ?? e.kind}</b> · {formatIl(e.at)} {new Date(e.at).toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Jerusalem' })}{e.revision ? ` · גרסה ${e.revision}` : ''}{e.actor === 'spouse' ? ' · בן/בת הזוג' : e.actor === 'client' ? ' · הלקוח' : ''}</div>
          ))}
        </div>
      </div>
    </>
  );
}

const EVENT_LABELS: Record<string, string> = {
  created: 'נפתחה הגשה', saved: 'נשמרה טיוטה', locked: 'ננעל לחתימה', signature_captured: 'נקלטה חתימה',
  sign_link_issued: 'נוצר קישור חתימה', sign_link_opened: 'קישור החתימה נפתח', all_signed: 'כל החתימות נקלטו',
  signed_pdf_stored: 'המסמך החתום נשמר', new_revision: 'גרסה חדשה (החתימות בוטלו)', attachments_updated: 'עודכנו אסמכתאות',
  wait_client_info: 'ממתין למידע מהלקוח', info_received: 'המידע התקבל', to_review: 'לבדיקה מקצועית', back_to_draft: 'חזרה לטיוטה',
  handoff_to_client: 'הועבר ללקוח להגשה', record_submission: 'נרשמה הגשה', record_info_request: 'ב"ל ביקש מידע',
  info_provided: 'המידע נמסר', record_result: 'נרשמה תשובה רשמית', close: 'נסגר', cancel: 'בוטל', profile_updated: 'עודכן כרטיס הלקוח',
};

/**
 * ‼ «התחלתי» ו«חדלתי» באותו טופס — הכרעה מקצועית מפורשת עם סיבה. הסיבה נשמרת
 * בגרסה, עוברת לצילום הנעול ונרשמת ביומן; השרת מסרב לנעול בלעדיה.
 */
function ProfessionalStartEnd({ value, editable, onChange }: {
  value?: { reason: string; confirmedAt?: string }; editable: boolean;
  onChange: (v: { reason: string; confirmedAt?: string } | undefined) => void;
}) {
  const [reason, setReason] = useState(value?.reason ?? '');
  const [ack, setAck] = useState(false);
  if (value?.reason) {
    return (
      <div className="sf-section">
        <h3>אישור מקצועי — התחלה והפסקה באותו טופס</h3>
        <div className="sf-okline">אושר{value.confirmedAt ? ` ${formatIl(value.confirmedAt)}` : ''}: {value.reason}</div>
        {editable && <button type="button" className="ui-linkbtn" style={{ color: 'var(--accent)', fontSize: 'var(--fs-12)' }} onClick={() => onChange(undefined)}>ביטול האישור</button>}
      </div>
    );
  }
  return (
    <div className="sf-section">
      <h3>אישור מקצועי — התחלה והפסקה באותו טופס</h3>
      <div className="sf-banner is-warn" style={{ marginBottom: '.5rem' }}>
        הטופס יסמן גם «התחלתי» וגם «חדלתי». זה לא נעול עד שרו"ח מאשר/ת במפורש ורושם/ת למה (למשל עיסוק קצר שכבר הסתיים).
      </div>
      <div className="sf-field"><label>הסיבה</label><input value={reason} disabled={!editable} onChange={e => setReason(e.target.value)} /></div>
      <label className="checkbox-row" style={{ fontSize: 'var(--fs-13)', marginTop: '.4rem' }}>
        <input type="checkbox" style={{ width: 'auto' }} disabled={!editable} checked={ack} onChange={e => setAck(e.target.checked)} />
        בדקתי מקצועית, והדיווח המשולב משקף את העובדות
      </label>
      <div className="sf-actions">
        <button type="button" className="btn btn-sm btn-primary" disabled={!editable || !ack || reason.trim().length < 5}
          onClick={() => onChange({ reason: reason.trim(), confirmedAt: new Date().toISOString() })}>אישור מקצועי</button>
      </div>
    </div>
  );
}

// ─── «לחתום ולשלוח לשע״ם» — לחיצה אחת אחרי שהלקוחות חתמו ──────────────────────
// גיא (25.10.2026, ליאת ואוריה): «לא ברור לי למה אין לי כפתור פשוט שיפעיל את האוטומציה».
// עד היום: «למרכז הייצוג» ← «חתום + הוסף חותמת» ← לחיצה נפרדת «שלח טופס חתום לשע״ם».
// מעכשיו: הכפתור פותח את חדר החתימה (החתימה והחותמת כבר במקום), עובר על כל הטפסים,
// ומיד אחרי האחרון לוחץ בעצמו על «שלח טופס חתום לשע״ם» — אותו רכיב ואותם שערים
// (ShaamNextActionButton: חיבור, מחשב עבודה, ניסיון שנעצר באמצע).
// ‼ «נשלח לשע״ם» נכתב רק מאישור קליטה של הרשות (194) — הלחיצה אינה ראיה.

import { useState } from 'react';
import type { Client, RepresentationRequest, RepSignatureDocument, SignatureValue } from '../types';
import { useDocumentDB } from '../hooks/useIndexedDB';
import { useAuth } from '../hooks/useAuth';
import { supabase } from '../lib/supabase';
import { repRequestFromDb } from '../lib/dbMappers';
import { signatureDocumentsOf, withLegacyMirror } from '../utils/repDocuments';
import { getRequestSigners } from '../utils/repSigners';
import { shaamSubmissions, requestScope, peopleFromClient } from '../utils/repScope';
import { submissionItOwner } from '../features/representation/repPreparation';
import { shaamRepresentationAction } from '../features/taxFile/shaamRepresentationAction';
import { shaamPreSigningDocs, shaamClientDocumentsPending } from '../features/representation/shaamPreSigningDocs';
import { loadStampRoom, stampAndStore, type Branding, type StampRoomState } from '../features/representation/stampDocument';
import SigningRoom from './signatureRequest/SigningRoom';
import ShaamNextActionButton from './ShaamNextActionButton';

interface Props {
  request: RepresentationRequest;
  linkedClient: Client;
  /** שמירת הערכים והמסמכים החתומים — אותה שמירה כמו במרכז הייצוג (App.handleSaveSignedPdf). */
  onSaveSignedPdf: (req: RepresentationRequest, values: Record<string, SignatureValue>, docs: RepSignatureDocument[]) => Promise<void> | void;
  /** משימת השליחה הסתיימה — הקורא מרענן את הבקשה והכרטיס. */
  onChanged?: () => void;
  className?: string;
  errorClassName?: string;
  /**
   * false — רק החתימה; השליחה מוצגת אצל הקורא (מרכז הייצוג, שבו אחרי החתימה המסך
   * עובר לשלב «ההגשה לשע״ם» והרכיב הזה יורד מהמסך). onStamped אומר לו לשלוח לבד.
   */
  sendInline?: boolean;
  onStamped?: () => void;
}

export default function StampAndSendShaam({
  request, linkedClient, onSaveSignedPdf, onChanged,
  className = 'btn btn-sm btn-primary', errorClassName = 'rep-track-next-err',
  sendInline = true, onStamped,
}: Props) {
  const db = useDocumentDB();
  const { user } = useAuth();
  const [room, setRoom] = useState<StampRoomState | null>(null);
  // ‼ מה שהוחתם בלחיצה הזאת — לפני שהבקשה המרועננת חוזרת מהשרת.
  const [local, setLocal] = useState<{ docs: RepSignatureDocument[]; values: Record<string, SignatureValue> } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  /** הוחתם עכשיו ⇒ השליחה יוצאת לבד. טופס שהוחתם קודם — כפתור רגיל, בלי הפעלה עצמית. */
  const [armed, setArmed] = useState(false);
  const [autoDone, setAutoDone] = useState<Set<string>>(() => new Set());
  /**
   * ‼ הבקשה המלאה מהשרת (25.10, ליאת ואוריה): ב«בקשות» הבקשה מגיעה מרשימה «רזה» בלי
   * signature_values (useRepresentationRequests, lean) — בלי החתימות של הלקוחות. חדר
   * החתימה הציג אותם ריקים, והשמירה כתבה רק את החותמת ומחקה אותן. לכן חוזרים לשרת
   * לפני פתיחת החדר, ושומרים רק מעליה.
   */
  const [full, setFull] = useState<RepresentationRequest | null>(null);

  const base = full ?? request;
  const view: RepresentationRequest = local
    ? { ...base, ...withLegacyMirror(local.docs), signatureValues: local.values }
    : base;
  const docs = signatureDocumentsOf(view);
  const stamped = docs.length > 0 && docs.every(d => !!d.signedPdfStoredId);
  const nextDoc = docs.find(d => !d.signedPdfStoredId) ?? null;

  const people = peopleFromClient(linkedClient);
  const submissions = shaamSubmissions(requestScope(view, linkedClient), people, submissionItOwner(view, linkedClient));
  // ‼ אותו שער כמו מרכז הייצוג: מסמך ששע״ם דורשת מהלקוח ועוד לא הגיע — השליחה כבויה, עם הסיבה.
  const actionFor = (sub: (typeof submissions)[number]) => {
    const tracking = view.execution?.shaam?.[sub.key];
    const pending = shaamClientDocumentsPending(shaamPreSigningDocs({
      tracking, submissionKey: sub.key, request: view, personName: sub.personName || '', signed: true,
    }));
    return shaamRepresentationAction(view.status, tracking, stamped, { clientDocumentsPending: pending });
  };
  // ‼ גם שליחה כבויה מוצגת (עם הסיבה — למשל צילום ששע״ם דורשת), כדי שאחרי החתימה
  // יהיה ברור מה עוצר. רק שליחה פעילה נלחצת לבד.
  const toSend = submissions
    .map(sub => ({ sub, action: actionFor(sub) }))
    .filter(x => x.action?.kind === 'submit');
  // ‼ אחת אחרי השנייה: ההגשה הבאה נלחצת רק כשהקודמת כבר לא ממתינה לשליחה (קליטה
  // שאושרה מוציאה אותה מהרשימה). שליחה שנכשלה עוצרת את השרשרת — הכפתורים נשארים.
  const head = toSend.find(x => !x.action?.disabled)?.sub.key ?? null;
  const nextAutoKey = head && !autoDone.has(head) ? head : null;

  // ‼ 25.10.2026 · אחרי ההגשה — אותו מקום, הצעד הבא: «בדוק אם נקלט» (בדיקה בלבד, לא משדרת).
  if (view.status === 'awaiting_authorities') {
    const checks = submissions
      .map(sub => ({ sub, action: shaamRepresentationAction(view.status, view.execution?.shaam?.[sub.key], true) }))
      .filter(x => x.action?.kind === 'check');
    if (checks.length === 0) return null;
    return (
      <>
        {checks.map(({ sub, action }) => (
          <div key={sub.key}>
            {checks.length > 1 && sub.title && (
              <div style={{ fontSize: 'var(--fs-12)', color: 'var(--ink-3)', marginBottom: '.2rem' }}>{sub.title}</div>
            )}
            <ShaamNextActionButton
              request={view} linkedClient={linkedClient} submission={sub} action={action ? { ...action, label: 'בדוק אם נקלט' } : action}
              tracking={view.execution?.shaam?.[sub.key]} married={people.married}
              onChanged={onChanged} className="btn btn-sm" errorClassName={errorClassName}
            />
          </div>
        ))}
      </>
    );
  }

  if (view.status !== 'awaiting_stamp' || docs.length === 0) return null;

  async function branding(): Promise<Branding | null> {
    if (!user?.id) return null;
    const { data } = await supabase.from('profiles').select('branding').eq('id', user.id).maybeSingle();
    return (data as { branding?: Branding } | null)?.branding ?? null;
  }

  async function open(doc: RepSignatureDocument) {
    setError('');
    setBusy(true);
    try {
      const { data, error: fetchErr } = await supabase.from('representation_requests').select('*').eq('id', request.id).single();
      if (fetchErr || !data) throw new Error('לא הצלחתי לטעון את הבקשה המלאה - נסו שוב.');
      const fresh = repRequestFromDb(data);
      // ‼ טופס שהלקוחות חתמו בלי החתימות שלהם — לא פותחים חדר שיחתום ויצרוב עותק חסר.
      const clientFields = (signatureDocumentsOf(fresh).find(d => d.key === doc.key) ?? doc).fields
        .filter(f => f.kind === 'signature' && f.signerId !== 'accountant' && f.signerId !== 'static');
      const missing = clientFields.filter(f => !fresh.signatureValues?.[f.id]);
      if (missing.length > 0) throw new Error('החתימות של הלקוחות לא נמצאו בבקשה - לא נפתח חדר חתימה. פנו לתמיכה.');
      setFull(fresh);
      setLocal(null);
      setRoom(await loadStampRoom(db, signatureDocumentsOf(fresh).find(d => d.key === doc.key) ?? doc, await branding()));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function complete(values: Record<string, SignatureValue>, fields?: Parameters<typeof stampAndStore>[5]) {
    if (!room) return;
    setBusy(true);
    try {
      const out = await stampAndStore(db, view, docs, room, values, fields);
      // ‼ שומרים מעל הבקשה המלאה (base) — לא מעל העותק הרזה שהגיע מהרשימה.
      await onSaveSignedPdf(base, out.values, out.docs);
      setLocal({ docs: out.docs, values: out.values });
      const next = out.docs.find(d => !d.signedPdfStoredId);
      if (next) {
        setRoom(await loadStampRoom(db, next, await branding()));
      } else {
        setRoom(null);
        setArmed(true);
        onStamped?.();
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setRoom(null);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      {!stamped && nextDoc && (
        <button type="button" className={className} disabled={busy} onClick={() => void open(nextDoc)}>
          {busy ? 'פותח…'
            : docs.length > 1 && docs.some(d => d.signedPdfStoredId)
              ? `המשך לחתום · ${nextDoc.title}`
              : docs.length > 1 ? `לחתום ולשלוח לשע״ם · ${docs.length} טפסים` : 'לחתום ולשלוח לשע״ם'}
        </button>
      )}
      {stamped && sendInline && toSend.map(({ sub, action }) => (
        <div key={sub.key}>
          {toSend.length > 1 && sub.title && (
            <div style={{ fontSize: 'var(--fs-12)', color: 'var(--ink-3)', marginBottom: '.2rem' }}>{sub.title}</div>
          )}
          <ShaamNextActionButton
            request={view} linkedClient={linkedClient} submission={sub} action={action}
            tracking={view.execution?.shaam?.[sub.key]} married={people.married}
            onChanged={onChanged} className="btn btn-sm" errorClassName={errorClassName}
            autoRun={armed && sub.key === nextAutoKey}
            onAutoRunDone={() => setAutoDone(prev => new Set(prev).add(sub.key))}
          />
          {action?.disabled && action.reason && (
            <div className={errorClassName} style={{ color: 'var(--ink-3)' }}>{action.reason}</div>
          )}
        </div>
      ))}
      {error && <div className={errorClassName}>{error}</div>}
      {room && (
        <SigningRoom
          pdfBytes={room.pdfBytes.slice(0)}
          pdfFileName={room.doc.pdfFileName}
          fields={room.doc.fields}
          signers={[
            ...getRequestSigners(view).map((s, i) => ({ id: s.id, source: 'manual' as const, name: s.name, email: s.email, order: i + 1 })),
            { id: 'accountant', source: 'manual' as const, name: 'אני - רו"ח', email: '', order: 99 },
          ]}
          activeSignerId="accountant"
          savedMarks={room.marks}
          initialValues={view.signatureValues || {}}
          title={busy ? 'מייצר PDF סופי…'
            : docs.length > 1 ? `חתימה + חותמת · ${room.doc.title} · ואז שליחה לשע״ם` : 'חתימה + חותמת · ואז שליחה לשע״ם'}
          adjustable
          onComplete={(v, f) => void complete(v, f)}
          onCancel={() => setRoom(null)}
        />
      )}
    </>
  );
}

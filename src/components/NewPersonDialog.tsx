// ─── "+ אדם חדש" — שלב 3 (ידני) + שלב 4 (קישור ציבורי, והמשך טיפול בליד) ─────
// המקור החזותי המחייב: docs/prototypes/customers-v3-production-reference.html
//
// ‼ באדם חדש-ידני: הוא נוצר רק ברגע אישור המסלול. שלבי הפרטים והכפילות אינם
// כותבים כלום. ביטול לפני "צור והמשך" אינו משאיר רשומה יתומה.
// "חזרה" מאפסת לבחירה הראשונה — אין מה "לשמר טיוטה של" משהו שעדיין לא נוצר.
//
// ‼ בהמשך טיפול לליד (continuationFor): האדם כבר קיים כליד. אין מה לאסוף
// ואין מה לבדוק כפילות מחדש (ההתאמה כבר נבדקה בשרת בזמן ההגשה הציבורית
// ומוצגת בכרטיס עצמו) — נפתחים ישר על שלב המסלול, אותו רכיב בדיוק.

import { useState } from 'react';
import type { Client } from '../types';
import { isValidIsraeliId } from '../utils/israeliId';
import { findDuplicateMatch, type DuplicateMatch } from '../utils/duplicateCheck';
import { useToast } from './ui/Toast';
import Modal from './ui/Modal';

export interface NewPersonBasics {
  firstName: string;
  lastName: string;
  idNumber: string;
  phone: string;
  email: string;
}

type Step = 'choose' | 'manual' | 'link' | 'route';
type Route = 'quote' | 'representation';

interface ContinuationTarget {
  fullName: string;
  phone?: string;
  email?: string;
}

interface Props {
  clients: Client[];
  onCancel: () => void;
  onOpenExisting: (clientId: string) => void;
  onConfirmQuote: (basics: NewPersonBasics) => Promise<void>;
  onConfirmRepresentation: (basics: NewPersonBasics) => Promise<void>;
  /** ממנפק/מחזיר את הטוקן הקיים. p_rotate=true מחליף — הקישור הישן מפסיק לעבוד מיד. */
  onMintApplyLink: (rotate: boolean) => Promise<string | null>;
  /** שלב 4: פתיחה ישירה על שלב המסלול, לליד קיים מקישור ציבורי. */
  continuationFor?: ContinuationTarget;
  /** לבדיקת מסך בלבד (כמו emailsOverride ב-JourneyTab) — קופץ ישר לשלב, עם נתוני דוגמה. */
  initialStepForQA?: 'manual' | 'route' | 'link' | null;
}

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}

function splitName(fullName: string): { firstName: string; lastName: string } {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  return { firstName: parts[0] ?? '', lastName: parts.slice(1).join(' ') };
}

const APPLY_ORIGIN = typeof window !== 'undefined' ? window.location.origin : '';

export default function NewPersonDialog({
  clients, onCancel, onOpenExisting, onConfirmQuote, onConfirmRepresentation,
  onMintApplyLink, continuationFor, initialStepForQA,
}: Props) {
  const { showToast } = useToast();
  const initialStep: Step = continuationFor ? 'route'
    : initialStepForQA === 'route' ? 'route'
    : initialStepForQA === 'manual' ? 'manual'
    : initialStepForQA === 'link' ? 'link'
    : 'choose';
  const [step, setStep] = useState<Step>(initialStep);
  const [fullName, setFullName] = useState(continuationFor?.fullName ?? (initialStepForQA ? 'ישראל כהן' : ''));
  const [phone, setPhone] = useState(continuationFor?.phone ?? (initialStepForQA ? '050-1234567' : ''));
  const [email, setEmail] = useState(continuationFor?.email ?? '');
  const [idNumber, setIdNumber] = useState('');
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [duplicate, setDuplicate] = useState<DuplicateMatch | null>(null);
  const [route, setRoute] = useState<Route | null>(null);
  const [busy, setBusy] = useState(false);
  const [busyError, setBusyError] = useState<string | null>(null);

  // ── שלב הקישור הציבורי ──
  const [applyToken, setApplyToken] = useState<string | null>(null);
  const [linkBusy, setLinkBusy] = useState(false);
  const [linkError, setLinkError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const applyLink = applyToken ? `${APPLY_ORIGIN}/?apply=${applyToken}` : '';

  async function openLinkStep() {
    setStep('link');
    setLinkBusy(true);
    setLinkError(null);
    try {
      const token = await onMintApplyLink(false);
      if (!token) throw new Error('לא הצלחנו להפיק קישור');
      setApplyToken(token);
    } catch (e) {
      setLinkError(e instanceof Error ? e.message : 'שגיאה בהפקת הקישור');
    } finally {
      setLinkBusy(false);
    }
  }

  async function rotateLink() {
    setLinkBusy(true);
    setLinkError(null);
    try {
      const token = await onMintApplyLink(true);
      if (!token) throw new Error('לא הצלחנו להחליף את הקישור');
      setApplyToken(token);
      showToast('הקישור הוחלף — הקישור הקודם כבר לא פעיל.');
    } catch (e) {
      setLinkError(e instanceof Error ? e.message : 'שגיאה בהחלפת הקישור');
    } finally {
      setLinkBusy(false);
    }
  }

  function resetToChoose() {
    setStep('choose');
    setFullName(''); setPhone(''); setEmail(''); setIdNumber('');
    setFieldError(null); setDuplicate(null); setRoute(null); setBusyError(null);
  }

  function handleManualContinue() {
    const name = fullName.trim();
    if (!name) { setFieldError('יש להזין שם מלא'); return; }
    if (!phone.trim() && !email.trim()) { setFieldError('יש להזין טלפון או אימייל'); return; }
    if (email.trim() && !isValidEmail(email)) { setFieldError('כתובת אימייל לא תקינה'); return; }
    if (idNumber.trim()) {
      if (!/^\d{9}$/.test(idNumber.trim())) { setFieldError('תעודת זהות חייבת להכיל 9 ספרות'); return; }
      if (!isValidIsraeliId(idNumber.trim())) { setFieldError('תעודת הזהות אינה תקינה — כדאי לבדוק את הספרות'); return; }
    }
    const match = findDuplicateMatch(clients, { idNumber, phone, email });
    setFieldError(null);
    if (match?.kind === 'exact') { setDuplicate(match); return; }   // חוסם — נשארים בשלב הזה
    setDuplicate(match);
    setStep('route');
  }

  async function handleConfirmRoute() {
    if (!route) return;
    const { firstName, lastName } = splitName(fullName);
    const basics: NewPersonBasics = { firstName, lastName, idNumber: idNumber.trim(), phone: phone.trim(), email: email.trim() };
    setBusy(true);
    setBusyError(null);
    try {
      if (route === 'quote') await onConfirmQuote(basics);
      else await onConfirmRepresentation(basics);
    } catch (e) {
      setBusy(false);
      setBusyError(e instanceof Error ? e.message : 'שגיאה ביצירת האדם');
    }
  }

  const clientName = (c: Client) => `${c.firstName} ${c.lastName}`.trim() || c.idNumber;

  const exactBlock = duplicate?.kind === 'exact' ? duplicate : null;
  const probableWarn = duplicate?.kind === 'probable' ? duplicate : null;
  const canGoBack = step !== 'choose' && !continuationFor;

  const shareText = applyLink
    ? `היי,\nכדי שאוכל להתחיל לטפל בבקשה שלך, אפשר למלא כמה פרטים בקישור הקצר הבא:\n${applyLink}\nלוקח פחות מדקה. תודה!`
    : '';
  const waHref = applyLink ? `https://wa.me/?text=${encodeURIComponent(shareText)}` : '';
  const canShare = typeof navigator !== 'undefined' && !!navigator.share;

  const footer = (
    <>
      {canGoBack && (
        <button type="button" className="ui-btn ui-btn-ghost" onClick={resetToChoose} disabled={busy}>חזרה</button>
      )}
      <div style={{ flex: 1 }} />
      <button type="button" className="ui-btn ui-btn-ghost" onClick={onCancel} disabled={busy}>
        {step === 'link' ? 'סגירה' : 'ביטול'}
      </button>
      {step === 'manual' && !exactBlock && (
        <button type="button" className="ui-btn ui-btn-primary" onClick={handleManualContinue}>המשך</button>
      )}
      {step === 'route' && (
        <button type="button" className="ui-btn ui-btn-primary" onClick={handleConfirmRoute} disabled={!route || busy}>
          {busy ? 'יוצר…' : continuationFor ? 'המשך' : 'צור והמשך'}
        </button>
      )}
    </>
  );

  return (
    <Modal title={continuationFor ? 'המשך טיפול' : 'אדם חדש'} onClose={onCancel} footer={footer} width={500}>
      {step === 'choose' && (
        <div className="np-choice">
          <button type="button" onClick={() => setStep('manual')}>
            <strong>הזנת פרטים בעצמי</strong>
            <span>יש לי שם ואמצעי קשר ואני רוצה להתחיל עכשיו.</span>
          </button>
          <button type="button" onClick={openLinkStep}>
            <strong>שליחת קישור למילוי פרטים</strong>
            <span>האדם ימלא את הפרטים בעצמו ויופיע כאן לאחר השליחה.</span>
          </button>
        </div>
      )}

      {step === 'link' && (
        <div>
          {linkBusy && !applyLink && <div className="pd-small">מפיק קישור…</div>}
          {linkError && <div className="np-error">{linkError}</div>}
          {applyLink && (
            <>
              <div className="np-linkbox">
                <div className="np-linktitle">הקישור מוכן לשליחה</div>
                <div className="pd-small" style={{ marginTop: 0, marginBottom: 10 }}>
                  בטופס החיצוני: שם ומייל הם חובה. לאחר השליחה האדם יופיע כאן כ"חדש · ממתין לטיפול".
                </div>
                <div className="np-link pd-ltr">{applyLink}</div>
                <div className="np-linkactions">
                  <button type="button" onClick={async () => {
                    try { await navigator.clipboard.writeText(applyLink); setCopied(true); setTimeout(() => setCopied(false), 2000); } catch { /* ignore */ }
                  }}>
                    {copied ? 'הועתק' : 'העתק קישור'}
                  </button>
                  <a href={waHref} target="_blank" rel="noopener noreferrer" className="np-linkactions-wa">
                    שיתוף בוואטסאפ
                  </a>
                  {canShare && (
                    <button type="button" onClick={() => { navigator.share({ text: shareText }).catch(() => {}); }}>
                      שיתוף
                    </button>
                  )}
                </div>
              </div>
              <div className="np-sim">
                <button type="button" className="ui-linkbtn" onClick={rotateLink} disabled={linkBusy}>
                  החלף קישור — הקישור הנוכחי יפסיק לעבוד
                </button>
              </div>
            </>
          )}
        </div>
      )}

      {step === 'manual' && (
        <div>
          <p style={{ fontSize: 'var(--fs-13)', color: 'var(--ink-3)', marginTop: 0, marginBottom: 16 }}>
            שם ואמצעי קשר אחד מספיקים כדי להתחיל
          </p>
          {exactBlock && (
            <div className="pd-dupbox" style={{ marginBottom: 16 }}>
              כבר קיים אדם עם תעודת הזהות הזו — {clientName(exactBlock.client)}.{' '}
              <button type="button" className="ui-linkbtn" onClick={() => onOpenExisting(exactBlock.client.id)}>
                פתח את הכרטיס הקיים
              </button>
            </div>
          )}
          <div className="np-form">
            <div className="np-field np-field-full">
              <label>שם מלא *</label>
              <input value={fullName} onChange={e => setFullName(e.target.value)} autoFocus disabled={busy} />
            </div>
            <div className="np-field">
              <label>טלפון</label>
              <input value={phone} onChange={e => setPhone(e.target.value)} placeholder="050-1234567" disabled={busy} />
            </div>
            <div className="np-field">
              <label>אימייל</label>
              <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="name@example.com" disabled={busy} />
            </div>
            <div className="np-field np-field-full">
              <label>תעודת זהות — אופציונלי</label>
              <input
                value={idNumber}
                inputMode="numeric"
                maxLength={9}
                onChange={e => setIdNumber(e.target.value.replace(/\D/g, ''))}
                placeholder="9 ספרות"
                disabled={busy}
              />
            </div>
          </div>
          {fieldError && <div className="np-error">{fieldError}</div>}
        </div>
      )}

      {step === 'route' && (
        <div>
          <div className="np-preview">{fullName.trim()} · {phone.trim() || email.trim()}</div>
          {probableWarn && (
            <div className="pd-dupbox" style={{ marginBottom: 16 }}>
              ייתכן שכבר קיים אדם תואם — {clientName(probableWarn.client)}.{' '}
              <button type="button" className="ui-linkbtn" onClick={() => onOpenExisting(probableWarn.client.id)}>
                פתח את הכרטיס
              </button>
            </div>
          )}
          <div className="np-routetitle">מה רוצים לעשות עכשיו?</div>
          <div className="np-route">
            <button
              type="button"
              className={route === 'quote' ? 'is-selected' : ''}
              onClick={() => setRoute('quote')}
              disabled={busy}
            >
              <strong>שליחת הצעת מחיר</strong>
              <span>הצעה תחילה, ולאחר אישור ממשיכים לייצוג.</span>
            </button>
            <button
              type="button"
              className={route === 'representation' ? 'is-selected' : ''}
              onClick={() => setRoute('representation')}
              disabled={busy}
            >
              <strong>התחלת ייצוג ללא הצעה</strong>
              <span>למשפחה, מקרה ללא חיוב או כשאין צורך בהצעה.</span>
            </button>
          </div>
          {busyError && <div className="np-error">{busyError}</div>}
        </div>
      )}
    </Modal>
  );
}

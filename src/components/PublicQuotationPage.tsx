// ─── עמוד ההצעה הציבורי (?quote=TOKEN) ──────────────────────────────────────
// הטוקן הוא האישור. טוען דרך get_quotation, מסמן "נצפתה", ומאפשר אישור בלבד
// (בלי דחייה/בקשת שינויים — החלטת גיא). מובייל-פירסט. הורדת PDF.

import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabase';
import type { FirmProfile } from '../types/firmProfile';
import type { QuotationItem, FutureService, QuotationRepresentation } from '../types/quotations';
import { deriveQuotationBrand } from './quotations/quotationBranding';
import QuotationWebView, { type QuotationWebViewData, type ApprovalSignature } from './quotations/QuotationWebView';
import { generateQuotationPdf, downloadPdf } from '../utils/quotationPdf';
import ClientPageState from './ui/ClientPageState';

interface Props { token: string; }

/** כמה זמן להשהות על מסך "אושר" לפני המעבר האוטומטי להשלמת הפרטים */
const AUTO_ADVANCE_MS = 2200;

interface QuotationInfo {
  quotationNumber: string;
  status: string;
  expiresAt?: string;
  vatRate: number;
  recipientName?: string;
  businessName?: string;
  notesForClient?: string;
  items: QuotationItem[];
  futureServices?: FutureService[];
  representation?: QuotationRepresentation;
  /** קיים רק לאחר אישור — הצעד הבא של הלקוח (השלמת פרטי הייצוג) */
  onboardingToken?: string;
  firm: {
    firmName?: string;
    branding?: Record<string, unknown>;
    email?: string;
    phone?: string;
    address?: string;
    emailSignature?: string;
  };
}

type Phase = 'loading' | 'invalid' | 'ready';

export default function PublicQuotationPage({ token }: Props) {
  const [phase, setPhase] = useState<Phase>('loading');
  const [info, setInfo] = useState<QuotationInfo | null>(null);
  const [status, setStatus] = useState<string>('');
  const [approving, setApproving] = useState(false);
  // הצעד הבא של הלקוח — נחשף רק לאחר אישור, ומוצג מיד באותו מסך
  const [nextStepLink, setNextStepLink] = useState<string | null>(null);
  // מעבר אוטומטי רץ רק אחרי אישור חי. לקוח שחזר לקישור מקבל את הקישור בלבד,
  // בלי שהמסך ייחטף לו מתחת לידיים.
  const [autoAdvancing, setAutoAdvancing] = useState(false);
  const [compact, setCompact] = useState(typeof window !== 'undefined' && window.innerWidth < 640);

  useEffect(() => {
    const onResize = () => setCompact(window.innerWidth < 640);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase.rpc('get_quotation', { p_token: token });
      if (cancelled) return;
      if (error || !data) { setPhase('invalid'); return; }
      const row = data as QuotationInfo;
      setInfo(row);
      setStatus(row.status);
      // לקוח שחזר לקישור אחרי שאישר — הצעד הבא ממתין לו גם עכשיו
      if (row.status === 'approved' && row.onboardingToken) {
        setNextStepLink(onboardingUrl(row.onboardingToken));
      }
      setPhase('ready');
      // סימון "נצפתה" — לא חוסם, לא מעניין אם נכשל
      supabase.rpc('mark_quotation_viewed', { p_token: token }).then(() => {});
    })();
    return () => { cancelled = true; };
  }, [token]);

  const brand = useMemo(() => {
    const firm = info?.firm;
    const pseudo: FirmProfile = {
      id: '', firmName: firm?.firmName, email: firm?.email, phone: firm?.phone,
      address: firm?.address, branding: (firm?.branding as FirmProfile['branding']) ?? {},
      communication: { emailSignature: firm?.emailSignature }, settings: {},
    };
    return deriveQuotationBrand(pseudo);
  }, [info]);

  /**
   * האישור. השרת מסמן "אושרה" וגם פותח את תהליך הייצוג (לקוח, בקשה, חותמים,
   * משימה) בטרנזקציה אחת, ומחזיר את הקישור להשלמת הפרטים. מיד לאחר מכן המסך
   * מודיע שאושר ומעביר את הלקוח לעמוד השלמת הפרטים — הוא לא צריך ללחוץ ולא
   * לחפש מייל. המייל נשלח במקביל כגיבוי, ולא חוסם: אם השליחה תיכשל, הרו"ח
   * יראה זאת וישלים בכניסה הבאה שלו.
   */
  async function handleApprove(sig: ApprovalSignature) {
    setApproving(true);
    try {
      const { data } = await supabase.rpc('approve_quotation', {
        p_token: token,
        p_signature: sig.signatureDataUrl,
        p_signer_name: sig.signerName,
      });
      // אין onboardingToken ⇒ אין מה להשלים: ללקוח כבר קיים תהליך ייצוג שמולא.
      // אסור לשלוח לו "נשאר לאמת את הזהות" ולהעביר אותו לטופס שכבר מילא.
      const result = (typeof data === 'string' ? { status: data } : data) as
        { status?: string; onboardingToken?: string; repReused?: boolean } | null;
      if (result?.status) setStatus(result.status);
      // ההתראה לרו"ח נרשמה בתור ע"י השרת; כאן רק מבקשים לרוקן אותו מיד.
      // לא חוסם ולא נבדק: אם ייכשל, הריקון יקרה בכניסה הבאה של הרו"ח.
      if (result?.status === 'approved') {
        void supabase.functions.invoke('notify-accountant', { body: { token } });
      }
      if (result?.status === 'approved' && result.onboardingToken) {
        const url = onboardingUrl(result.onboardingToken);
        setNextStepLink(url);
        setAutoAdvancing(true);
        void supabase.functions.invoke('send-onboarding-email', { body: { quotationToken: token } });
        // שהייה קצרה כדי שהלקוח יספיק לראות ש"אושר" לפני שהמסך מתחלף
        window.setTimeout(() => { window.location.href = url; }, AUTO_ADVANCE_MS);
      }
    } finally {
      setApproving(false);
    }
  }

  async function handleDownloadPdf() {
    if (!info) return;
    const bytes = await generateQuotationPdf({
      quotationNumber: info.quotationNumber,
      recipientName: info.recipientName || '',
      businessName: info.businessName,
      items: info.items, futureServices: info.futureServices, vatRate: info.vatRate,
      notesForClient: info.notesForClient, expiresAt: info.expiresAt,
      representation: info.representation,
    }, brand);
    downloadPdf(bytes, `הצעת מחיר ${info.quotationNumber}.pdf`);
  }

  if (phase === 'loading') {
    return <ClientPageState quiet body="טוען…" />;
  }
  if (phase === 'invalid' || !info) {
    return (
      <ClientPageState
        mark="🔗"
        title="הקישור אינו תקין"
        body="ייתכן שהקישור הועתק חלקית או שאינו פעיל עוד. אפשר לפנות למשרד לקבלת קישור חדש."
      />
    );
  }

  const webData: QuotationWebViewData = {
    quotationNumber: info.quotationNumber,
    recipientName: info.recipientName || 'הלקוח',
    businessName: info.businessName,
    items: info.items, futureServices: info.futureServices, vatRate: info.vatRate,
    notesForClient: info.notesForClient, expiresAt: info.expiresAt,
    representation: info.representation,
  };

  return (
    <QuotationWebView
      data={webData}
      brand={brand}
      compact={compact}
      interactive
      status={status}
      onApprove={handleApprove}
      approving={approving}
      onDownloadPdf={handleDownloadPdf}
      nextStepLink={nextStepLink ?? undefined}
      nextStepAuto={autoAdvancing}
    />
  );
}

function onboardingUrl(onboardingToken: string): string {
  return `${window.location.origin}/?onboard=${onboardingToken}`;
}


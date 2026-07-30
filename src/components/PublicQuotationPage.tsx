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

interface Props { token: string; }

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
   * משימה) בטרנזקציה אחת, ומחזיר את הקישור להשלמת הפרטים. הקישור מוצג מיד —
   * הלקוח עוד מול המסך, וזה הרגע שבו הוא ימלא. המייל נשלח במקביל כגיבוי,
   * ולא חוסם: אם השליחה תיכשל, הרו"ח יראה זאת וישלים בכניסה הבאה שלו.
   */
  async function handleApprove(sig: ApprovalSignature) {
    setApproving(true);
    try {
      const { data } = await supabase.rpc('approve_quotation', {
        p_token: token,
        p_signature: sig.signatureDataUrl,
        p_signer_name: sig.signerName,
      });
      const result = (typeof data === 'string' ? { status: data } : data) as
        { status?: string; onboardingToken?: string } | null;
      if (result?.status) setStatus(result.status);
      if (result?.status === 'approved' && result.onboardingToken) {
        setNextStepLink(onboardingUrl(result.onboardingToken));
        void supabase.functions.invoke('send-onboarding-email', { body: { quotationToken: token } });
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
    return <Centered>טוען…</Centered>;
  }
  if (phase === 'invalid' || !info) {
    return (
      <Centered>
        <div style={{ fontSize: 18, fontWeight: 600, marginBottom: 6 }}>הקישור אינו תקין</div>
        <div style={{ fontSize: 13.5, color: '#6b6a63', lineHeight: 1.6, maxWidth: 340 }}>
          ייתכן שהקישור הועתק חלקית או שאינו פעיל עוד. אפשר לפנות למשרד לקבלת קישור חדש.
        </div>
      </Centered>
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
    />
  );
}

function onboardingUrl(onboardingToken: string): string {
  return `${window.location.origin}/?onboard=${onboardingToken}`;
}

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ minHeight: '100vh', background: '#F4F3EF', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, fontFamily: "'Heebo', sans-serif", direction: 'rtl', textAlign: 'center' }}>
      <div style={{ background: '#fff', borderRadius: 16, padding: '32px 28px', boxShadow: '0 6px 24px rgba(0,0,0,.06)', color: '#6b6a63' }}>{children}</div>
    </div>
  );
}

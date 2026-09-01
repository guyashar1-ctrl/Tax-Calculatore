// מסך בדיקה לדיאלוג "קישור ייצוג חדש" (?test-repdialog).
// מציג את מה שהדיאלוג היה שולח בפועל — בלי ליצור לקוח, בלי לשלוח מייל.

import { useState } from 'react';
import RepresentationOnboardingDialog, { CreateRepresentationInput } from './RepresentationOnboardingDialog';
import QuotationRepresentationEditor from './quotations/QuotationRepresentationEditor';
import { defaultQuotationRepresentation } from '../types/quotations';
import type { QuotationRepresentation } from '../types/quotations';

export default function TestRepDialog() {
  const [sent, setSent] = useState<CreateRepresentationInput | null>(null);
  const [open, setOpen] = useState(true);
  const [repValue, setRepValue] = useState<QuotationRepresentation>(defaultQuotationRepresentation());

  return (
    <div style={{ padding: '1.5rem', direction: 'rtl' }}>
      <button className="btn btn-primary" onClick={() => { setSent(null); setOpen(true); }}>
        פתיחת הדיאלוג
      </button>
      {sent && (
        <pre id="tst-rep-sent" style={{ marginTop: '1rem', padding: '1rem', background: 'var(--surface-2)', fontSize: 12, direction: 'ltr' }}>
          {JSON.stringify(sent, null, 2)}
        </pre>
      )}
      {open && (
        <RepresentationOnboardingDialog
          isTransfer={new URLSearchParams(window.location.search).has('transfer')}
          onCreate={async (data) => { setSent(data); setOpen(false); return { link: 'https://example.test/?onboard=demo', emailSent: false }; }}
          onCancel={() => setOpen(false)}
          // ?spouse=1 — מדמה בן/בת זוג מקושר/ת שכבר מיוצג/ת בב"ל ובמס הכנסה (150)
          {...(new URLSearchParams(window.location.search).has('spouse')
            ? { alreadyRepresented: { nationalInsurance: 'הושג בקליטה של יאיר סלע', incomeTax: 'תיק משותף — הושג בקליטה של יאיר סלע' } }
            : {})}
        />
      )}

      <h3 style={{ marginTop: '2rem' }}>QuotationRepresentationEditor (155) — אותה בדיקה: מע"מ/ניכויים לא נגזרים מנישואין</h3>
      <div style={{ maxWidth: 480, border: '1px solid var(--hairline-1)', borderRadius: 8, padding: '1rem' }} id="tst-qre">
        <QuotationRepresentationEditor
          value={repValue}
          onChange={setRepValue}
          recipientName="מיכל סלע"
          recipientEmail="michal@example.test"
        />
      </div>
      <pre id="tst-qre-value" style={{ marginTop: '1rem', padding: '1rem', background: 'var(--surface-2)', fontSize: 12, direction: 'ltr' }}>
        {JSON.stringify(repValue, null, 2)}
      </pre>
    </div>
  );
}

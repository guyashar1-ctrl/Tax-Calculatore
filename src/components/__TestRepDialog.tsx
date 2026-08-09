// מסך בדיקה לדיאלוג "קישור ייצוג חדש" (?test-repdialog).
// מציג את מה שהדיאלוג היה שולח בפועל — בלי ליצור לקוח, בלי לשלוח מייל.

import { useState } from 'react';
import RepresentationOnboardingDialog, { CreateRepresentationInput } from './RepresentationOnboardingDialog';

export default function TestRepDialog() {
  const [sent, setSent] = useState<CreateRepresentationInput | null>(null);
  const [open, setOpen] = useState(true);

  return (
    <div style={{ padding: '1.5rem', direction: 'rtl' }}>
      <button className="btn btn-primary" onClick={() => { setSent(null); setOpen(true); }}>
        פתיחת הדיאלוג
      </button>
      {sent && (
        <pre style={{ marginTop: '1rem', padding: '1rem', background: 'var(--surface-2)', fontSize: 12, direction: 'ltr' }}>
          {JSON.stringify(sent, null, 2)}
        </pre>
      )}
      {open && (
        <RepresentationOnboardingDialog
          isTransfer={new URLSearchParams(window.location.search).has('transfer')}
          onCreate={async (data) => { setSent(data); setOpen(false); return { link: 'https://example.test/?onboard=demo', emailSent: false }; }}
          onCancel={() => setOpen(false)}
        />
      )}
    </div>
  );
}

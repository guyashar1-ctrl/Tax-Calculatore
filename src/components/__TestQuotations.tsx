// ─── מסך בדיקה למסך ההצעות — נתונים מדומים ───────────────────────────────────
// ‼ למה זה קיים: משתמש הבדיקות חסום ב-RLS ואין לו הצעות בכלל. הנתונים כאן
// מדמים את שלושת המצבים של כפתור המחיקה:
//   1. טיוטה                        → פח מוצג
//   2. אושרה + הלקוח קיים            → פח מוסתר (מוחקים דרך כרטיס הלקוח)
//   3. אושרה + הלקוח כבר נמחק        → פח מוצג (ההצעה שוחררה)
//
// פתיחה:  http://localhost:5173/?test-quotations   (DEV בלבד)

import { useState } from 'react';
import type { Client } from '../types';
import type { Lead, Quotation } from '../types/quotations';
import QuotationsPipeline from './quotations/QuotationsPipeline';

const CLIENTS = [
  { id: 'c1', firstName: 'אילן', lastName: 'סימנטוב' },
] as unknown as Client[];

const LEADS: Lead[] = [];

function quote(partial: Partial<Quotation>): Quotation {
  return {
    id: 'q0', quotationNumber: 'Q-2026-000', revision: 1, status: 'draft',
    publicToken: 't', items: [], vatRate: 18,
    emailSubject: '', emailMessage: '', notesForClient: '', internalNotes: '',
    events: [], snapshot: { recipientName: 'נמען בדיקה' },
    createdAt: '2026-08-01T09:00:00Z', updatedAt: '2026-08-01T09:00:00Z',
    ...partial,
  } as unknown as Quotation;
}

const QUOTATIONS: Quotation[] = [
  quote({ id: 'q1', quotationNumber: 'Q-2026-001', status: 'draft' }),
  quote({ id: 'q2', quotationNumber: 'Q-2026-002', status: 'approved', clientId: 'c1' }),
  quote({ id: 'q3', quotationNumber: 'Q-2026-003', status: 'approved', clientId: 'c-deleted' }),
];

export default function TestQuotations() {
  const [msg, setMsg] = useState('');
  const noop = async () => {};
  return (
    <div style={{ padding: '1.5rem', maxWidth: 1080, margin: '0 auto' }} dir="rtl">
      <h2 style={{ marginBottom: '.3rem' }}>בדיקת מסך ההצעות — כפתור המחיקה</h2>
      <div style={{ fontSize: 13, color: 'var(--ink-3)', marginBottom: '1rem' }}>
        צפוי: פח על Q-2026-001 (טיוטה) ועל Q-2026-003 (הלקוח נמחק) · בלי פח על Q-2026-002 (הלקוח קיים)
        {msg && <strong> · {msg}</strong>}
      </div>
      <QuotationsPipeline
        quotations={QUOTATIONS}
        leads={LEADS}
        clients={CLIENTS}
        onNew={() => setMsg('הצעה חדשה')}
        onOpen={q => setMsg(`פתיחת ${q.quotationNumber}`)}
        onConvert={q => setMsg(`המרה ${q.quotationNumber}`)}
        onRelease={q => setMsg(`מכתב שחרור ${q.quotationNumber}`)}
        onRemind={async q => { setMsg(`תזכורת ${q.quotationNumber}`); return { ok: true }; }}
        onCancel={noop}
        onDelete={async q => setMsg(`מחיקה ${q.quotationNumber}`)}
        onSaveLead={noop}
        onCreateLead={noop}
        onDeleteLead={noop}
        onNewQuotationForLead={() => {}}
      />
    </div>
  );
}

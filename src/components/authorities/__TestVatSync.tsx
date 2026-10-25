// ─── מסך בדיקה: «קריאת תיק מע״מ מהשע״ם» ─────────────────────────────────────
// ‼ כרטיס מע״מ עם לקוח מדומה ומשימה מדומה (jobOverrides). הטקסטים במשימה הם
// מה שהעובד קרא חי בשע״ם ב-25.10.2026 — כדי לראות מה הרו"ח רואה אחרי קריאה,
// בלי עובד ובלי שע״ם. לא ללחוץ כאן על הכפתור או על «אשר»: הראשון פותח קריאה
// אמיתית, השני שולח הצעות לשרת על לקוח שאינו קיים.
//
// פתיחה:  http://localhost:5173/?test-vat-sync&case=empty|exempt-was|match|failed|none

import { useEffect, useState } from 'react';
import type { Client } from '../../types';
import type { AutomationJob } from '../../types/automation';
import AuthoritiesPanel from './AuthoritiesPanel';
import { ShaamReadinessProvider } from '../../hooks/shaamReadiness';
import { supabase } from '../../lib/supabase';

const CASE = new URLSearchParams(window.location.search).get('case') ?? 'empty';
const iso = (minAgo: number) => new Date(Date.now() - minAgo * 60_000).toISOString();

const FIELDS = {
  fileType: '48 - עוסק מורשה', openingDate: '01/09/2026',
  primaryIndustry: '4799 - סוגים אחרים של מכירה קמעונית, שלא במסגרת חנויות, דוכנים או ש',
  reportingFrequency: 'דו חודשי', lastReport: '12/2025', debitAuthorization: 'לא קיימת הרשאה פעילה',
  balanceTotal: '0', balanceDebit: '0', balanceCredit: '0',
};

const BASE = {
  id: 'fixture-vat-sync', idNumber: '123456782', firstName: 'דנה', lastName: 'ישראלי', dealerType: 'licensed',
  familyStatus: 'single', phone: '', email: '', city: 'חיפה', address: '', children: [], notes: '',
  lifecycleStage: 'active', createdAt: iso(60 * 24 * 30), updatedAt: iso(60),
  taxFiles: [{ id: 'tf1', authority: 'vat', owner: 'client', repStatus: 'active', fileNumber: '123456782' }],
} as unknown as Client;

const EXEMPT_WAS = {
  ...BASE, vatFileType: 'עוסק פטור', vatOpeningDate: '2026-06-01', vatPrimaryIndustry: '4799',
  vatLastReportPeriod: '-', vatBalance: 0, vatDebitAuthorization: false,
} as Client;

const MATCH = {
  ...BASE, vatFileType: 'עוסק מורשה', vatOpeningDate: '2026-09-01', vatPrimaryIndustry: FIELDS.primaryIndustry,
  vatFrequency: 'bi_monthly', vatLastReportPeriod: '12/2025', vatBalance: 0, vatDebitAuthorization: false,
} as Client;

const ok = (fields: Record<string, string>): AutomationJob => ({
  id: 'job-vat', clientId: BASE.id, actionType: 'shaam.sync_vat_file', status: 'succeeded',
  input: { osekNumber: '123456782' }, result: { system: 'shaam', area: 'vat_file', fields, unavailable: [] },
  createdAt: iso(3), updatedAt: iso(2), finishedAt: iso(2), attempts: 1,
} as unknown as AutomationJob);

const CASES: Record<string, { client: Client; job: AutomationJob | null }> = {
  empty: { client: BASE, job: ok(FIELDS) },
  'exempt-was': { client: EXEMPT_WAS, job: ok(FIELDS) },
  match: { client: MATCH, job: ok(FIELDS) },
  failed: {
    client: BASE,
    job: { ...ok(FIELDS), status: 'failed', result: null, errorCode: 'osek_not_found',
      errorDetail: 'שע״ם: «העוסק לא קיים בקובץ מע"מ» — מספר העוסק 123456782 לא נמצא, או שאינו מיוצג על ידי המשרד.' } as unknown as AutomationJob,
  },
  none: { client: BASE, job: null },
};

export default function TestVatSync() {
  const [uid, setUid] = useState<string | undefined>(undefined);
  useEffect(() => { void supabase.auth.getUser().then(r => setUid(r.data.user?.id)); }, []);
  const c = CASES[CASE] ?? CASES.empty;
  const [client, setClient] = useState<Client>(c.client);
  return (
    <ShaamReadinessProvider userId={uid}>
      <div style={{ padding: 18, background: 'var(--bg)', minHeight: '100vh' }}>
        <div style={{ marginBottom: 14, fontSize: 12, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <b>מסך בדיקה · מע״מ</b>
          {Object.keys(CASES).map(k => <a key={k} href={`?test-vat-sync&case=${k}`}>{k}</a>)}
        </div>
        <div style={{ maxWidth: 980, margin: '0 auto' }}>
          <AuthoritiesPanel client={client} onClientPersisted={setClient} jobOverrides={{ vat: c.job }} />
        </div>
      </div>
    </ShaamReadinessProvider>
  );
}

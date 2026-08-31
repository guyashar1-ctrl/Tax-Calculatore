// מסך בדיקה (?test-spouselink) — קישור בן/בת זוג כשהוא/היא נוצר/ת ככרטיס
// נפרד (150). מרכיב את NewPersonDialog עם רשימת לקוחות קבועה בזיכרון —
// בלי DB — ומציג בדיוק מה היה נשלח הלאה, כולל seedClientFromEmbeddedSpouse.

import { useState } from 'react';
import type { Client } from '../types';
import NewPersonDialog, { type NewPersonBasics } from './NewPersonDialog';
import PersonQuickView from './PersonQuickView';
import PersonalContactsTab from './clientTabs/PersonalContactsTab';
import TaxFileTab from './clientTabs/TaxFileTab';
import ClientDossierTab from './clientTabs/ClientDossierTab';
import { buildPersonRows } from '../utils/personDirectory';
import { seedClientFromEmbeddedSpouse } from '../utils/personRepresentation';

const YAIR: Client = {
  id: 'fixture-yair', idNumber: '314667346', firstName: 'יאיר', lastName: 'סלע',
  email: 'yair@example.test', phone: '0501112222', city: '', address: '',
  birthDate: '1980-05-05', gender: 'male',
  incomeTaxType: 'employee', vatStatus: 'none', businessDescription: '', hasExemptFromWithholding: false,
  niType: 'employee', hasTaxCoordination: false, taxCoordinationDetails: '',
  familyStatus: 'married',
  spouseName: 'מיכל סלע', spouseIdNumber: '022321673', spouseWorking: true, spouseIncome: 0,
  spouseFirstName: 'מיכל', spouseLastName: 'סלע', spouseEmail: 'michal@example.test',
  spouse: null, children: [], tags: [], additionalContacts: [], activity: [],
  representationStatus: 'active',
  authorityRepresentations: {
    incomeTax: { status: 'active', level: 'primary' },
    vat: { status: 'active', level: 'primary', targets: ['client'] },
    nationalInsurance: { status: 'active', level: 'primary', targets: ['client', 'spouse'] },
  },
  taxFiles: [{ id: 'tf-it', authority: 'income_tax', owner: 'client', fileNumber: '314667346', repStatus: 'active' }],
  createdAt: '2026-08-01T08:00:00.000Z', updatedAt: '2026-08-01T08:00:00.000Z',
} as unknown as Client;

// ‼ מיכל *אחרי* הקישור — בדיוק מה ש-createPersonFromBasics ב-App.tsx היה
// יוצר: זרעה מ-seedClientFromEmbeddedSpouse, ובלי מע"מ/ניכויים/ב"ל/מ"ה
// משלה (הם דרך הקישור). ‼ יאיר גם מתעדכן עם spouseClientId — מדמים ידנית.
const MICHAL: Client = {
  ...seedClientFromEmbeddedSpouse(YAIR),
  id: 'fixture-michal', birthDate: '', gender: 'female',
  incomeTaxType: 'employee', vatStatus: 'none', businessDescription: '', hasExemptFromWithholding: false,
  niType: 'employee', hasTaxCoordination: false, taxCoordinationDetails: '',
  spouseWorking: true, spouseIncome: 0, spouse: null,
  children: [], tags: [], additionalContacts: [], activity: [],
  representationStatus: 'pending_fill',
  authorityRepresentations: {}, taxFiles: [],
  createdAt: '2026-08-31T08:00:00.000Z', updatedAt: '2026-08-31T08:00:00.000Z',
} as unknown as Client;

const YAIR_LINKED: Client = { ...YAIR, spouseClientId: MICHAL.id };
const MICHAL_LINKED: Client = { ...MICHAL, spouseClientId: YAIR_LINKED.id };

export default function TestSpouseLink() {
  const [open, setOpen] = useState(true);
  const [confirmed, setConfirmed] = useState<NewPersonBasics | null>(null);
  const [contactsClient, setContactsClient] = useState<Client>(YAIR);
  const [verified, setVerified] = useState(false);

  const yairForHousehold: Client = { ...YAIR_LINKED, registeredSpouseVerified: verified };
  const michalRow = buildPersonRows([MICHAL_LINKED], [], [])[0];
  const yairRow = buildPersonRows([YAIR_LINKED], [], [])[0];
  const noop = { label: '', run: () => {} };

  return (
    <div style={{ padding: '1.5rem', direction: 'rtl' }}>
      <div id="tst-seed" style={{ marginBottom: '1rem', fontSize: 13, background: 'var(--surface-2)', padding: '.6rem' }}>
        seedClientFromEmbeddedSpouse(יאיר): {JSON.stringify(seedClientFromEmbeddedSpouse(YAIR))}
      </div>
      <button className="btn btn-primary" onClick={() => { setConfirmed(null); setOpen(true); }}>
        פתיחת "+ אדם חדש" — הקלידו ת.ז. 022321673 (מיכל, כבר בת הזוג של יאיר)
      </button>
      {confirmed && (
        <pre id="tst-confirmed" style={{ marginTop: '1rem', padding: '1rem', background: 'var(--surface-2)', fontSize: 12, direction: 'ltr' }}>
          {JSON.stringify(confirmed, null, 2)}
        </pre>
      )}
      {open && (
        <NewPersonDialog
          clients={[YAIR]}
          onCancel={() => setOpen(false)}
          onOpenExisting={() => {}}
          onConfirmQuote={async () => {}}
          onConfirmRepresentation={async (basics) => { setConfirmed(basics); setOpen(false); }}
          onMintApplyLink={async () => null}
          onSendApplyLinkEmail={async () => {}}
        />
      )}

      <h3 style={{ marginTop: '2rem' }}>אחרי הקישור — תצוגה מהירה של כל כרטיס</h3>
      <label style={{ fontSize: 13, display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
        <input type="checkbox" checked={verified} onChange={e => setVerified(e.target.checked)} />
        בן/בת הזוג הרשום/ה אומת/ה מול שע״ם
      </label>
      <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
        <div id="tst-quickview-michal" style={{ width: 380, border: '1px solid var(--hairline-1)', borderRadius: 8 }}>
          <PersonQuickView
            row={michalRow} now={{ title: 'ממתינה למילוי פרטים' }} docs={[]} docsLoading={false}
            quickAction={null} primary={noop} onClose={() => {}}
            spouseClient={yairForHousehold}
          />
        </div>
        <div id="tst-quickview-yair" style={{ width: 380, border: '1px solid var(--hairline-1)', borderRadius: 8 }}>
          <PersonQuickView
            row={yairRow} now={{ title: 'ייצוג פעיל' }} docs={[]} docsLoading={false}
            quickAction={null} primary={noop} onClose={() => {}}
            spouseClient={MICHAL_LINKED}
          />
        </div>
      </div>

      <h3 style={{ marginTop: '2rem' }}>תיק מס (TaxFileTab) — "מול הרשויות" משני הכרטיסים</h3>
      <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', alignItems: 'flex-start' }}>
        <div id="tst-taxfile-michal" style={{ width: 480, border: '1px solid var(--hairline-1)', borderRadius: 8, padding: '0 8px' }}>
          <div style={{ fontSize: 12, fontWeight: 600, padding: '8px 0' }}>מיכל (הכרטיס המקושר החדש)</div>
          <TaxFileTab
            client={MICHAL_LINKED} spouseClient={yairForHousehold}
            onClientPersisted={() => {}} onSendQuestionnaire={() => {}}
          />
        </div>
        <div id="tst-taxfile-yair" style={{ width: 480, border: '1px solid var(--hairline-1)', borderRadius: 8, padding: '0 8px' }}>
          <div style={{ fontSize: 12, fontWeight: 600, padding: '8px 0' }}>יאיר (הכרטיס המקורי)</div>
          <TaxFileTab
            client={yairForHousehold} spouseClient={MICHAL_LINKED}
            onClientPersisted={() => {}} onSendQuestionnaire={() => {}}
          />
        </div>
      </div>

      <h3 style={{ marginTop: '2rem' }}>ההתיק (ClientDossierTab) — עורך תיקי הרשויות, מכרטיס מיכל</h3>
      <div id="tst-dossier-michal" style={{ maxWidth: 900, border: '1px solid var(--hairline-1)', borderRadius: 8 }}>
        <ClientDossierTab
          client={MICHAL_LINKED} spouseClient={yairForHousehold}
          update={() => {}} patch={() => {}} patchAndSave={async () => {}}
          employees={[]} sessions={[]}
        />
      </div>

      <h3 style={{ marginTop: '2rem' }}>PersonalContactsTab — "יש עסק, מיוצג/ת ע"י רו"ח אחר"</h3>
      <div id="tst-spouse-elsewhere" style={{ maxWidth: 640 }}>
        <div style={{ marginBottom: '.5rem', fontSize: 13 }}>
          spouseRepresentedElsewhere: {String(!!contactsClient.spouseRepresentedElsewhere)}
        </div>
        <PersonalContactsTab
          client={contactsClient}
          update={(k, v) => setContactsClient(c => ({ ...c, [k]: v }))}
          patch={(p) => setContactsClient(c => ({ ...c, ...p }))}
          employees={[]}
        />
      </div>
    </div>
  );
}

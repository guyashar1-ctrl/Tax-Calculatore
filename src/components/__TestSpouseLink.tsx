// מסך בדיקה (?test-spouselink) — קישור בן/בת זוג כשהוא/היא נוצר/ת ככרטיס
// נפרד (150). מרכיב את NewPersonDialog עם רשימת לקוחות קבועה בזיכרון —
// בלי DB — ומציג בדיוק מה היה נשלח הלאה, כולל seedClientFromEmbeddedSpouse.

import { useState } from 'react';
import type { Client, RepAuthorityKind } from '../types';
import type { Engagement } from '../types/onboarding';
import NewPersonDialog, { type NewPersonBasics } from './NewPersonDialog';
import PersonQuickView from './PersonQuickView';
import PersonalContactsTab from './clientTabs/PersonalContactsTab';
import TaxFileTab from './clientTabs/TaxFileTab';
import ClientDossierTab from './clientTabs/ClientDossierTab';
import AgreementPaymentsTab from './clientTabs/AgreementPaymentsTab';
import RepresentationOnboardingDialog, { CreateRepresentationInput } from './RepresentationOnboardingDialog';
import SpouseToClientDialog from './clientTabs/SpouseToClientDialog';
import { spouseDisplayName } from '../features/annualReport/profile';
import { buildPersonRows } from '../utils/personDirectory';
import { seedClientFromEmbeddedSpouse, resolvePersonAuthority, resolveIncomeTaxHousehold, spousePersonAuthorities } from '../utils/personRepresentation';

/** בדיוק alreadyRepresentedFor מ-App.tsx — מה שכבר הושג דרך בן/בת הזוג המקושר/ת. */
function computeAlreadyRepresented(client: Client, spouse: Client | undefined): Partial<Record<RepAuthorityKind, string>> {
  if (!spouse) return {};
  const spouseLabel = `${spouse.firstName} ${spouse.lastName}`.trim() || 'בן/בת הזוג';
  const out: Partial<Record<RepAuthorityKind, string>> = {};
  for (const a of ['vat', 'withholding', 'nationalInsurance'] as RepAuthorityKind[]) {
    const r = resolvePersonAuthority(client, spouse, a);
    if (r.represented && r.source === 'spouse') out[a] = `הושג בקליטה של ${spouseLabel}`;
  }
  const it = resolveIncomeTaxHousehold(client, spouse);
  if (it.represented && it.holder === 'spouse') {
    out.incomeTax = `תיק משותף — הושג בקליטה של ${spouseLabel}`;
  }
  return out;
}

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

// ‼ בעלות מסחרית (154) — התקשרות אחת אצל יאיר, מיכל בלי משלה. הגזירה
// (resolveBillingOwnership) קוראת את זו של יאיר בשבילה — לא מעתיקה כלום.
const ENG_YAIR_ONLY: Engagement = {
  id: 'eng-yair-1', clientId: YAIR_LINKED.id, status: 'active',
  monthlyTotal: 450, effectiveFrom: '2026-01-01', createdAt: '2026-01-01T08:00:00.000Z',
};
// ‼ תרחיש E — לשני בני הזוג יש התקשרות עצמאית משלהם. אסור שהגזירה תמזג:
// כל אחד צריך להישאר עם שלו, ו-coversSpouse צריך להיות undefined אצל שניהם.
const ENG_MICHAL_OWN: Engagement = {
  id: 'eng-michal-1', clientId: MICHAL_LINKED.id, status: 'active',
  monthlyTotal: 280, effectiveFrom: '2026-06-01', createdAt: '2026-06-01T08:00:00.000Z',
};

// ‼ תרחיש 4 (המסלול המוזהב) — יאיר מתחיל *בלי* כרטיס נפרד למיכל (רק שדות
// שטוחים על הכרטיס שלו), עם ב"ל שכבר מכסה אותה וייצוג מלא. גם בלי ת.ז.
// לבן/בת הזוג — מוכיח שהיצירה עובדת בלעדיה (תרחיש 6/F) באותו מעבר.
const YAIR_GOLDEN_BASE: Client = { ...YAIR, id: 'fixture-yair-golden', spouseIdNumber: '', spouseClientId: undefined };
const ENG_GOLDEN_YAIR: Engagement = {
  id: 'eng-yair-golden-1', clientId: YAIR_GOLDEN_BASE.id, status: 'active',
  monthlyTotal: 450, effectiveFrom: '2026-01-01', createdAt: '2026-01-01T08:00:00.000Z',
};

/** תרחיש 4 (D) — יאיר → יצירת מיכל → מצב מקושר → ייצוג רק על מה שבאמת חסר → חיוב חוזר ליאיר. */
function GoldenFlowDemo() {
  const [clients, setClients] = useState<Client[]>([YAIR_GOLDEN_BASE]);
  const [michalId, setMichalId] = useState<string | null>(null);
  const [pendingRep, setPendingRep] = useState(false);
  const [sentRep, setSentRep] = useState<CreateRepresentationInput | null>(null);
  const [log, setLog] = useState<string[]>([]);

  const yair = clients.find(c => c.id === YAIR_GOLDEN_BASE.id)!;
  const michal = michalId ? clients.find(c => c.id === michalId) : undefined;

  async function handleCreateMichal() {
    const seed = seedClientFromEmbeddedSpouse(yair);
    const created: Client = {
      id: 'fixture-michal-golden',
      idNumber: seed.idNumber ?? '', firstName: seed.firstName ?? '', lastName: seed.lastName ?? '',
      birthDate: '', gender: 'female', phone: seed.phone ?? '', email: seed.email ?? '', city: '', address: '',
      incomeTaxType: 'employee', niType: 'employee', vatStatus: 'none', businessDescription: '', hasExemptFromWithholding: false,
      hasTaxCoordination: false, taxCoordinationDetails: '',
      familyStatus: 'married', spouseWorking: false, spouseIncome: 0, spouse: null, children: [],
      isNewImmigrant: false, aliyahYear: 0, isReturningResident: false, returningYear: 0,
      disabilityPercentage: 0, disabilityType: '', hasAcademicDegree: false, academicDegreeYear: 0, academicDegreeType: '',
      completedIdf: false, idfReleaseYear: 0, completedNationalService: false, nationalServiceYear: 0,
      qualifyingSettlementId: '', qualifyingSettlementOverride: false, qualifyingSettlementCreditPoints: 0,
      hasResidentialProperty: false, propertyAddress: '', numberOfProperties: 0,
      hasPension: false, pensionFundName: '', employeePensionPct: 0, employerPensionPct: 0,
      hasKupotGemel: false, hasKrenHashtalmut: false, krenHashtalmutMonthly: 0,
      notes: '', assignedAccountantId: 'emp-self', tags: [], additionalContacts: [], activity: [],
      authorityRepresentations: {}, taxFiles: [],
      createdAt: '2026-09-01T08:00:00.000Z', updatedAt: '2026-09-01T08:00:00.000Z',
      ...seed,
    } as unknown as Client;
    setClients(list => [
      ...list.map(c => (c.id === yair.id ? { ...c, spouseClientId: created.id } : c)),
      created,
    ]);
    setMichalId(created.id);
    setLog(l => [...l, `1. נוצר כרטיס למיכל (בלי ת.ז. בן/בת זוג בכרטיס המקור) — seed: ${JSON.stringify(seed)}`]);
  }

  function openMichal() { setLog(l => [...l, '2. ניווט → כרטיס של מיכל']); }
  function openYair() { setLog(l => [...l, '5. ניווט → חזרה לכרטיס של יאיר']); }

  const alreadyForMichal = michal ? computeAlreadyRepresented(michal, yair) : {};

  return (
    <div>
      <div id="tst-golden-log" style={{ padding: '.5rem 1rem', background: 'var(--surface-2)', fontSize: 12, marginBottom: '.5rem' }}>
        {log.length === 0 ? '(אין אירועים עדיין)' : log.join(' · ')}
      </div>
      <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', alignItems: 'flex-start' }}>
        <div id="tst-golden-yair" style={{ width: 480, border: '1px solid var(--hairline-1)', borderRadius: 8, padding: '0 8px' }}>
          <div style={{ fontSize: 12, fontWeight: 600, padding: '8px 0' }}>יאיר (התיק המקורי)</div>
          <TaxFileTab
            client={yair} spouseClient={michal}
            onClientPersisted={() => {}} onSendQuestionnaire={() => {}}
            onCreateSpouseClient={handleCreateMichal}
            onOpenSpouseClient={openMichal}
          />
        </div>
        {michal && (
          <div id="tst-golden-michal" style={{ width: 480, border: '1px solid var(--hairline-1)', borderRadius: 8, padding: '0 8px' }}>
            <div style={{ fontSize: 12, fontWeight: 600, padding: '8px 0' }}>מיכל (נוצרה עכשיו)</div>
            <TaxFileTab
              client={michal} spouseClient={yair}
              onClientPersisted={() => {}} onSendQuestionnaire={() => {}}
              onOpenSpouseClient={openYair}
            />
            <div style={{ padding: '8px' }}>
              <button type="button" className="btn btn-secondary btn-sm" onClick={() => { setLog(l => [...l, '3. פתיחת דיאלוג ייצוג למיכל']); setPendingRep(true); }}>
                3. התחלת ייצוג למיכל
              </button>
            </div>
            <div style={{ fontSize: 12, fontWeight: 600, padding: '8px' }}>4. הסכם ותשלומים אצל מיכל (חיוב חוזר ליאיר)</div>
            <AgreementPaymentsTab
              client={michal} spouseClient={yair}
              quotations={[]} engagements={[ENG_GOLDEN_YAIR]} charges={[]}
              onMarkChargePaid={async c => c}
              onNewQuotation={() => setLog(l => [...l, 'onNewQuotation נקרא (לא אמור לקרות אוטומטית)'])}
              onOpenClient={openYair}
            />
          </div>
        )}
      </div>
      {pendingRep && michal && (
        <RepresentationOnboardingDialog
          onCreate={async (data) => {
            setSentRep(data);
            setPendingRep(false);
            setLog(l => [...l, '(3) הייצוג נשלח']);
            return { link: 'https://example.test/?onboard=demo', emailSent: false };
          }}
          onCancel={() => setPendingRep(false)}
          initialName={`${michal.firstName} ${michal.lastName}`.trim()}
          initialEmail={michal.email || undefined}
          alreadyRepresented={alreadyForMichal}
        />
      )}
      {sentRep && (
        <pre id="tst-golden-sent" style={{ marginTop: '1rem', padding: '1rem', background: 'var(--surface-2)', fontSize: 12, direction: 'ltr' }}>
          {JSON.stringify(sentRep, null, 2)}
        </pre>
      )}
    </div>
  );
}

// ‼ (159) שחזור מדויק של הצורה האמיתית ב-DB — לקוח ותיק: married, שדות
// spouse* שטוחים בלבד (בלי spouse blob), spouse_client_id NULL, ותיק מס
// הכנסה על taxFiles[].owner==='spouse'. זו בדיוק הצורה שהכרטיס נכשל
// עליה בייצור (129 — לקוח אמיתי, שם הוחלף לשם בדיוני לבדיקה).
const LEGACY_BASE: Client = {
  id: 'fixture-legacy', idNumber: '111222333', firstName: 'משה', lastName: 'כהן',
  email: 'moshe@example.test', phone: '0509998888', city: '', address: '',
  birthDate: '1975-01-01', gender: 'male',
  incomeTaxType: 'employee', vatStatus: 'none', businessDescription: '', hasExemptFromWithholding: false,
  niType: 'employee', hasTaxCoordination: false, taxCoordinationDetails: '',
  familyStatus: 'married',
  spouseName: 'רחל כהן', spouseIdNumber: '444555666', spouseFirstName: 'רחל', spouseLastName: 'כהן',
  spouseWorking: true, spouseIncome: 0,
  spouse: null, children: [], tags: [], additionalContacts: [], activity: [],
  representationStatus: 'active',
  authorityRepresentations: {
    incomeTax: { status: 'active', level: 'primary' },
    vat: { status: 'active', level: 'primary', targets: ['client'] },
  },
  taxFiles: [],
  createdAt: '2018-01-01T08:00:00.000Z', updatedAt: '2018-01-01T08:00:00.000Z',
} as unknown as Client;

// 1/6 — בן/בת זוג שטוח/ה, בלי כרטיס נפרד, בלי תיק מס הכנסה רשום עדיין.
const LEGACY_1_EMBEDDED_ONLY: Client = { ...LEGACY_BASE, id: 'fixture-legacy-1' };

// 2 — בדיוק המקרה בייצור: תיק מס הכנסה משותף, רשום על בן/בת הזוג (owner:'spouse'),
// בלי spouseClientId בכלל.
const LEGACY_2_IT_ON_SPOUSE: Client = {
  ...LEGACY_BASE, id: 'fixture-legacy-2',
  taxFiles: [{ id: 'tf-legacy-1', authority: 'income_tax', owner: 'spouse', fileNumber: '444555666', repStatus: 'active' }],
} as unknown as Client;

// 3 — בן/בת הזוג הפכ/ה ללקוח/ה נפרד/ת, ותיק מס הכנסה עדיין רשום על הלקוח הנוכחי.
const LEGACY_3_SPOUSE_ID = 'fixture-legacy-3-spouse';
const LEGACY_3_CLIENT: Client = {
  ...LEGACY_BASE, id: 'fixture-legacy-3', spouseClientId: LEGACY_3_SPOUSE_ID,
  taxFiles: [{ id: 'tf-legacy-3', authority: 'income_tax', owner: 'client', fileNumber: '111222333', repStatus: 'active' }],
} as unknown as Client;
const LEGACY_3_SPOUSE: Client = {
  ...LEGACY_BASE, id: LEGACY_3_SPOUSE_ID, firstName: 'רחל', lastName: 'כהן', idNumber: '444555666',
  spouseName: 'משה כהן', spouseFirstName: 'משה', spouseLastName: 'כהן', spouseIdNumber: '111222333',
  spouseClientId: 'fixture-legacy-3', taxFiles: [], authorityRepresentations: {},
} as unknown as Client;

// 4 — מקושרים, אבל התיק המשותף רשום על *בן/בת הזוג* המקושר/ת (לא על מי שהכרטיס שלו/ה פתוח).
const LEGACY_4_SPOUSE_ID = 'fixture-legacy-4-spouse';
const LEGACY_4_CLIENT: Client = {
  ...LEGACY_BASE, id: 'fixture-legacy-4', spouseClientId: LEGACY_4_SPOUSE_ID, taxFiles: [],
} as unknown as Client;
const LEGACY_4_SPOUSE: Client = {
  ...LEGACY_BASE, id: LEGACY_4_SPOUSE_ID, firstName: 'רחל', lastName: 'כהן', idNumber: '444555666',
  spouseName: 'משה כהן', spouseFirstName: 'משה', spouseLastName: 'כהן', spouseIdNumber: '111222333',
  spouseClientId: 'fixture-legacy-4',
  taxFiles: [{ id: 'tf-legacy-4', authority: 'income_tax', owner: 'client', fileNumber: '444555666', repStatus: 'active' }],
} as unknown as Client;

// 5 — יש שם לבן/בת הזוג, אין ת.ז. — היצירה/התצוגה לא אמורות להיתקע על זה.
const LEGACY_5_NO_ID: Client = { ...LEGACY_2_IT_ON_SPOUSE, id: 'fixture-legacy-5', spouseIdNumber: '' };

// 7 — לא נשוי/אה בכלל: אין כרטיס בן/בת זוג.
const LEGACY_7_UNMARRIED: Client = { ...LEGACY_BASE, id: 'fixture-legacy-7', familyStatus: 'single', spouseName: '' };

// 8 — נשוי/אה, אבל שום פרט על בן/בת הזוג לא ידוע — אסור להמציא זהות.
const LEGACY_8_UNKNOWN_SPOUSE: Client = {
  ...LEGACY_BASE, id: 'fixture-legacy-8',
  spouseName: '', spouseIdNumber: '', spouseFirstName: undefined, spouseLastName: undefined,
} as unknown as Client;

/** תרחיש 159 — צורת DB אמיתית של לקוח ותיק, בלי spouse blob ובלי spouse_client_id. */
function LegacyClientMatrix() {
  const rows: { title: string; client: Client; spouseClient?: Client }[] = [
    { title: '1. בן/בת זוג שטוח/ה בלבד, בלי תיק מס הכנסה רשום', client: LEGACY_1_EMBEDDED_ONLY },
    { title: '2/6. בדיוק הייצור: תיק מס הכנסה משותף רשום על בן/בת הזוג, בלי spouse_client_id', client: LEGACY_2_IT_ON_SPOUSE },
    { title: '3. מקושר/ת, תיק רשום על הלקוח הנוכחי', client: LEGACY_3_CLIENT, spouseClient: LEGACY_3_SPOUSE },
    { title: '4. מקושר/ת, תיק רשום על בן/בת הזוג המקושר/ת', client: LEGACY_4_CLIENT, spouseClient: LEGACY_4_SPOUSE },
    { title: '5. שם בן/בת זוג בלי ת.ז.', client: LEGACY_5_NO_ID },
    { title: '7. לא נשוי/אה — בלי כרטיס בן/בת זוג', client: LEGACY_7_UNMARRIED },
    { title: '8. נשוי/אה, שום פרט על בן/בת הזוג לא ידוע', client: LEGACY_8_UNKNOWN_SPOUSE },
  ];
  const [log, setLog] = useState<string[]>([]);
  return (
    <div>
      <div id="tst-legacy-log" style={{ padding: '.5rem 1rem', background: 'var(--surface-2)', fontSize: 12, marginBottom: '.5rem' }}>
        {log.length === 0 ? '(אין אירועים עדיין)' : log.join(' · ')}
      </div>
      <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', alignItems: 'flex-start' }}>
        {rows.map(r => (
          <div key={r.client.id} id={`tst-${r.client.id}`} style={{ width: 420, border: '1px solid var(--hairline-1)', borderRadius: 8, padding: '0 8px' }}>
            <div style={{ fontSize: 12, fontWeight: 600, padding: '8px 0' }}>{r.title}</div>
            <TaxFileTab
              client={r.client} spouseClient={r.spouseClient}
              onClientPersisted={() => {}} onSendQuestionnaire={() => {}}
              onCreateSpouseClient={() => setLog(l => [...l, `create עבור ${r.title}`])}
              onOpenSpouseClient={(id) => setLog(l => [...l, `open(${id}) עבור ${r.title}`])}
            />
          </div>
        ))}
      </div>
    </div>
  );
}

// ═══ (159) התרחיש האמיתי שדווח: גיא לקוח פעיל, נשוי לדין, ב"ל של גיא כבר
// פעיל **וגם מכסה את דין** (targets כולל spouse), ותיק מס הכנסה משותף רשום
// על דין. דין הופכת ללקוחה כי נפתח לה עסק. ═══════════════════════════════
const GUY: Client = {
  id: 'fx-guy', idNumber: '314667346', firstName: 'גיא', lastName: 'ישר',
  email: 'guy@example.test', phone: '0501112222', city: '', address: '',
  birthDate: '1985-01-01', gender: 'male',
  incomeTaxType: 'selfEmployed', vatStatus: 'authorizedDealer', businessDescription: 'ייעוץ',
  hasExemptFromWithholding: false,
  niType: 'selfEmployed', hasTaxCoordination: false, taxCoordinationDetails: '',
  familyStatus: 'married',
  spouseName: 'דין ישר', spouseIdNumber: '209422500', spouseFirstName: 'דין', spouseLastName: 'ישר',
  spouseWorking: true, spouseIncome: 0, spouse: null,
  children: [], tags: [], additionalContacts: [], activity: [],
  representationStatus: 'active',
  // ‼ בדיוק הייצור: ב"ל פעיל ומכסה **את שניהם**; מס הכנסה משותף.
  authorityRepresentations: {
    incomeTax: { status: 'active', level: 'primary' },
    vat: { status: 'active', level: 'primary', targets: ['client'] },
    nationalInsurance: { status: 'active', level: 'primary', targets: ['client', 'spouse'] },
  },
  taxFiles: [
    { id: 'tf-guy-it', authority: 'income_tax', owner: 'spouse', fileNumber: '209422500', repStatus: 'active' },
    { id: 'tf-guy-ni', authority: 'national_insurance', owner: 'client', fileNumber: '314667346', repStatus: 'active' },
  ],
  createdAt: '2024-01-01T08:00:00.000Z', updatedAt: '2024-01-01T08:00:00.000Z',
} as unknown as Client;

/** התרחיש המלא של 159 — כולל שלב המעבר הקל ודיאלוג הייצוג של דין. */
function GuyDinFlow() {
  const [clients, setClients] = useState<Client[]>([GUY]);
  const [promotionOpen, setPromotionOpen] = useState(false);
  const [dinId, setDinId] = useState<string | null>(null);
  const [repOpen, setRepOpen] = useState(false);
  const [sent, setSent] = useState<CreateRepresentationInput | null>(null);
  const [log, setLog] = useState<string[]>([]);

  const guy = clients.find(c => c.id === GUY.id)!;
  const din = dinId ? clients.find(c => c.id === dinId) : undefined;

  // מדמה בדיוק את handleSpousePromotion ב-App.tsx.
  function promote(decision: { hasBusiness: boolean; owner: 'us' | 'other' | 'undecided' }) {
    if (!decision.hasBusiness || decision.owner !== 'us') {
      if (decision.hasBusiness && decision.owner === 'other') {
        setClients(l => l.map(c => (c.id === guy.id ? { ...c, spouseRepresentedElsewhere: true } : c)));
        setLog(l => [...l, 'נסגר בלי כרטיס · נרשם "מיוצג/ת אצל רו״ח אחר"']);
      } else {
        setLog(l => [...l, 'נסגר בלי יצירת כרטיס']);
      }
      setPromotionOpen(false);
      return;
    }
    const seed = seedClientFromEmbeddedSpouse(guy);
    const created = {
      id: 'fx-din', birthDate: '', gender: 'female', city: '', address: '',
      incomeTaxType: 'selfEmployed', niType: 'selfEmployed', vatStatus: 'authorizedDealer',
      businessDescription: 'עסק חדש', hasExemptFromWithholding: false,
      hasTaxCoordination: false, taxCoordinationDetails: '',
      spouseWorking: false, spouseIncome: 0, spouse: null, children: [],
      isNewImmigrant: false, aliyahYear: 0, isReturningResident: false, returningYear: 0,
      disabilityPercentage: 0, disabilityType: '', hasAcademicDegree: false,
      academicDegreeYear: 0, academicDegreeType: '', completedIdf: false, idfReleaseYear: 0,
      completedNationalService: false, nationalServiceYear: 0,
      qualifyingSettlementId: '', qualifyingSettlementOverride: false, qualifyingSettlementCreditPoints: 0,
      hasResidentialProperty: false, propertyAddress: '', numberOfProperties: 0,
      hasPension: false, pensionFundName: '', employeePensionPct: 0, employerPensionPct: 0,
      hasKupotGemel: false, hasKrenHashtalmut: false, krenHashtalmutMonthly: 0,
      notes: '', assignedAccountantId: 'emp-self', tags: [], additionalContacts: [], activity: [],
      authorityRepresentations: {}, taxFiles: [],
      createdAt: '2026-09-01T08:00:00.000Z', updatedAt: '2026-09-01T08:00:00.000Z',
      ...seed,
    } as unknown as Client;
    setClients(l => [...l.map(c => (c.id === guy.id ? { ...c, spouseClientId: created.id } : c)), created]);
    setDinId(created.id);
    setPromotionOpen(false);
    setLog(l => [...l, 'נוצר כרטיס לדין ומקושר דו-כיווני']);
  }

  const alreadyForDin = din ? computeAlreadyRepresented(din, guy) : {};
  const spouseAlreadyForDin = din ? spousePersonAuthorities(din, guy) : {};

  return (
    <div>
      <div id="tst-guydin-log" style={{ padding: '.5rem 1rem', background: 'var(--surface-2)', fontSize: 12, marginBottom: '.5rem' }}>
        {log.length === 0 ? '(אין אירועים עדיין)' : log.join(' · ')}
      </div>
      <pre id="tst-guydin-state" style={{ padding: '.5rem 1rem', background: 'var(--surface-2)', fontSize: 11, direction: 'ltr', marginBottom: '.5rem' }}>
        {JSON.stringify({ alreadyForDin, spouseAlreadyForDin, dinCreated: !!din }, null, 1)}
      </pre>
      <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', alignItems: 'flex-start' }}>
        <div id="tst-guydin-guy" style={{ width: 460, border: '1px solid var(--hairline-1)', borderRadius: 8, padding: '0 8px' }}>
          <div style={{ fontSize: 12, fontWeight: 600, padding: '8px 0' }}>גיא (לקוח פעיל, ב"ל מכסה גם את דין)</div>
          <TaxFileTab
            client={guy} spouseClient={din}
            onClientPersisted={() => {}} onSendQuestionnaire={() => {}}
            onCreateSpouseClient={() => setPromotionOpen(true)}
            onOpenSpouseClient={() => setLog(l => [...l, 'ניווט → כרטיס דין'])}
          />
        </div>
        {din && (
          <div id="tst-guydin-din" style={{ width: 460, border: '1px solid var(--hairline-1)', borderRadius: 8, padding: '0 8px' }}>
            <div style={{ fontSize: 12, fontWeight: 600, padding: '8px 0' }}>דין (נוצרה עכשיו)</div>
            <TaxFileTab
              client={din} spouseClient={guy}
              onClientPersisted={() => {}} onSendQuestionnaire={() => {}}
              onOpenSpouseClient={() => setLog(l => [...l, 'ניווט → חזרה לגיא'])}
            />
            <div style={{ padding: 8 }}>
              <button type="button" className="btn btn-secondary btn-sm" onClick={() => setRepOpen(true)}>
                פתיחת ייצוג לדין
              </button>
            </div>
          </div>
        )}
      </div>
      {promotionOpen && (
        <SpouseToClientDialog
          spouseName={spouseDisplayName(guy)}
          knownRepresentedElsewhere={!!guy.spouseRepresentedElsewhere}
          onCancel={() => setPromotionOpen(false)}
          onConfirm={promote}
        />
      )}
      {repOpen && din && (
        <RepresentationOnboardingDialog
          onCreate={async (data) => { setSent(data); setRepOpen(false); return { link: 'x', emailSent: false }; }}
          onCancel={() => setRepOpen(false)}
          initialName={`${din.firstName} ${din.lastName}`.trim()}
          initialEmail={din.email || undefined}
          alreadyRepresented={alreadyForDin}
          spouseAlreadyRepresented={spouseAlreadyForDin}
        />
      )}
      {sent && (
        <pre id="tst-guydin-sent" style={{ marginTop: '1rem', padding: '1rem', background: 'var(--surface-2)', fontSize: 12, direction: 'ltr' }}>
          {JSON.stringify(sent, null, 2)}
        </pre>
      )}
    </div>
  );
}

export default function TestSpouseLink() {
  const [open, setOpen] = useState(true);
  const [confirmed, setConfirmed] = useState<NewPersonBasics | null>(null);
  const [contactsClient, setContactsClient] = useState<Client>(YAIR);
  const [verified, setVerified] = useState(false);
  const [createLog, setCreateLog] = useState<string[]>([]);
  const [openLog, setOpenLog] = useState<string[]>([]);
  const [quotationLog, setQuotationLog] = useState<string[]>([]);

  // מדמה בדיוק את handleCreateClientFromSpouse ב-App.tsx: זריעה + מציג את
  // מה שהיה נכתב לכרטיס החדש, בלי DB אמיתי.
  function simulateCreate(owner: Client) {
    const seed = seedClientFromEmbeddedSpouse(owner);
    setCreateLog(l => [...l, JSON.stringify(seed)]);
  }
  function simulateOpen(clientId: string) {
    setOpenLog(l => [...l, clientId]);
  }

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

      <h3 style={{ marginTop: '2rem' }}>תיק מס (TaxFileTab) — "מול הרשויות" משני הכרטיסים (תרחישים 2/5/7/H/I)</h3>
      <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', alignItems: 'flex-start' }}>
        <div id="tst-taxfile-michal" style={{ width: 480, border: '1px solid var(--hairline-1)', borderRadius: 8, padding: '0 8px' }}>
          <div style={{ fontSize: 12, fontWeight: 600, padding: '8px 0' }}>מיכל (הכרטיס המקושר החדש)</div>
          <TaxFileTab
            client={MICHAL_LINKED} spouseClient={yairForHousehold}
            onClientPersisted={() => {}} onSendQuestionnaire={() => {}}
            onCreateSpouseClient={() => simulateCreate(MICHAL_LINKED)}
            onOpenSpouseClient={simulateOpen}
          />
        </div>
        <div id="tst-taxfile-yair" style={{ width: 480, border: '1px solid var(--hairline-1)', borderRadius: 8, padding: '0 8px' }}>
          <div style={{ fontSize: 12, fontWeight: 600, padding: '8px 0' }}>יאיר (הכרטיס המקורי)</div>
          <TaxFileTab
            client={yairForHousehold} spouseClient={MICHAL_LINKED}
            onClientPersisted={() => {}} onSendQuestionnaire={() => {}}
            onCreateSpouseClient={() => simulateCreate(yairForHousehold)}
            onOpenSpouseClient={simulateOpen}
          />
        </div>
      </div>

      <h3 style={{ marginTop: '2rem' }}>SpouseRelationshipCard (158) — תרחיש 1: לא מקושר/ת, בלי עסק חיצוני</h3>
      <div id="tst-taxfile-unlinked" style={{ maxWidth: 480, border: '1px solid var(--hairline-1)', borderRadius: 8, padding: '0 8px' }}>
        <TaxFileTab
          client={YAIR} spouseClient={undefined}
          onClientPersisted={() => {}} onSendQuestionnaire={() => {}}
          onCreateSpouseClient={() => simulateCreate(YAIR)}
          onOpenSpouseClient={simulateOpen}
        />
      </div>

      <h3 style={{ marginTop: '2rem' }}>SpouseRelationshipCard (158) — תרחיש 3: לא מקושר/ת, מיוצג/ת אצל רו"ח אחר</h3>
      <div id="tst-taxfile-elsewhere" style={{ maxWidth: 480, border: '1px solid var(--hairline-1)', borderRadius: 8, padding: '0 8px' }}>
        <TaxFileTab
          client={{ ...YAIR, spouseRepresentedElsewhere: true }} spouseClient={undefined}
          onClientPersisted={() => {}} onSendQuestionnaire={() => {}}
          onCreateSpouseClient={() => simulateCreate(YAIR)}
          onOpenSpouseClient={simulateOpen}
        />
      </div>

      <h3 style={{ marginTop: '2rem' }}>ההתיק (ClientDossierTab) — עורך תיקי הרשויות, מכרטיס מיכל</h3>
      <div id="tst-dossier-michal" style={{ maxWidth: 900, border: '1px solid var(--hairline-1)', borderRadius: 8 }}>
        <ClientDossierTab
          client={MICHAL_LINKED} spouseClient={yairForHousehold}
          update={() => {}} patch={() => {}} patchAndSave={async () => {}}
          employees={[]} sessions={[]}
        />
      </div>

      <h3 style={{ marginTop: '2rem' }}>PersonalContactsTab — כניסת "פתיחת כרטיס לקוח" מאזור בן/בת הזוג (לא מקושר עדיין)</h3>
      <div id="tst-spouse-elsewhere" style={{ maxWidth: 640 }}>
        <div style={{ marginBottom: '.5rem', fontSize: 13 }}>
          spouseRepresentedElsewhere: {String(!!contactsClient.spouseRepresentedElsewhere)} |
          {' '}spouseIdNumber: "{contactsClient.spouseIdNumber}"
        </div>
        <PersonalContactsTab
          client={contactsClient}
          update={(k, v) => setContactsClient(c => ({ ...c, [k]: v }))}
          patch={(p) => setContactsClient(c => ({ ...c, ...p }))}
          employees={[]}
          onCreateSpouseClient={() => simulateCreate(contactsClient)}
          onOpenSpouseClient={simulateOpen}
        />
        {createLog.length > 0 && (
          <pre id="tst-create-log" style={{ marginTop: '1rem', padding: '.75rem', background: 'var(--surface-2)', fontSize: 12, direction: 'ltr', whiteSpace: 'pre-wrap' }}>
            {createLog.join('\n')}
          </pre>
        )}
      </div>

      <h3 style={{ marginTop: '2rem' }}>PersonalContactsTab — בן/בת הזוג כבר מקושר/ת (YAIR_LINKED) — בלי כפתור יצירה</h3>
      <div id="tst-spouse-linked" style={{ maxWidth: 640 }}>
        <PersonalContactsTab
          client={YAIR_LINKED}
          update={() => {}}
          patch={() => {}}
          employees={[]}
          onCreateSpouseClient={() => simulateCreate(YAIR_LINKED)}
          onOpenSpouseClient={simulateOpen}
        />
        {openLog.length > 0 && (
          <pre id="tst-open-log" style={{ marginTop: '1rem', padding: '.75rem', background: 'var(--surface-2)', fontSize: 12, direction: 'ltr' }}>
            {openLog.join('\n')}
          </pre>
        )}
      </div>

      <h3 style={{ marginTop: '2rem' }}>AgreementPaymentsTab (154) — א/ד: מיכל בלי התקשרות משלה, יאיר עם התקשרות</h3>
      <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', alignItems: 'flex-start' }}>
        <div id="tst-billing-michal" style={{ width: 420, border: '1px solid var(--hairline-1)', borderRadius: 8, padding: '0 8px' }}>
          <div style={{ fontSize: 12, fontWeight: 600, padding: '8px 0' }}>מיכל (בלי התקשרות עצמאית)</div>
          <AgreementPaymentsTab
            client={MICHAL_LINKED} spouseClient={YAIR_LINKED}
            quotations={[]} engagements={[ENG_YAIR_ONLY]} charges={[]}
            onMarkChargePaid={async (c) => c}
            onNewQuotation={(kind) => setQuotationLog(l => [...l, `onNewQuotation(${kind}) עבור מיכל`])}
            onOpenClient={simulateOpen}
          />
        </div>
        <div id="tst-billing-yair" style={{ width: 420, border: '1px solid var(--hairline-1)', borderRadius: 8, padding: '0 8px' }}>
          <div style={{ fontSize: 12, fontWeight: 600, padding: '8px 0' }}>יאיר (בעל ההתקשרות)</div>
          <AgreementPaymentsTab
            client={YAIR_LINKED} spouseClient={MICHAL_LINKED}
            quotations={[]} engagements={[ENG_YAIR_ONLY]} charges={[]}
            onMarkChargePaid={async (c) => c}
            onNewQuotation={(kind) => setQuotationLog(l => [...l, `onNewQuotation(${kind}) עבור יאיר`])}
            onOpenClient={simulateOpen}
          />
        </div>
      </div>

      <h3 style={{ marginTop: '2rem' }}>AgreementPaymentsTab (154) — ה: לשני בני הזוג יש התקשרות עצמאית — בלי מיזוג</h3>
      <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', alignItems: 'flex-start' }}>
        <div id="tst-billing-both-michal" style={{ width: 420, border: '1px solid var(--hairline-1)', borderRadius: 8, padding: '0 8px' }}>
          <div style={{ fontSize: 12, fontWeight: 600, padding: '8px 0' }}>מיכל (התקשרות עצמאית משלה)</div>
          <AgreementPaymentsTab
            client={MICHAL_LINKED} spouseClient={YAIR_LINKED}
            quotations={[]} engagements={[ENG_YAIR_ONLY, ENG_MICHAL_OWN]} charges={[]}
            onMarkChargePaid={async (c) => c}
            onNewQuotation={(kind) => setQuotationLog(l => [...l, `onNewQuotation(${kind}) עבור מיכל (יש לה כבר)`])}
            onOpenClient={simulateOpen}
          />
        </div>
        <div id="tst-billing-both-yair" style={{ width: 420, border: '1px solid var(--hairline-1)', borderRadius: 8, padding: '0 8px' }}>
          <div style={{ fontSize: 12, fontWeight: 600, padding: '8px 0' }}>יאיר (התקשרות עצמאית משלו)</div>
          <AgreementPaymentsTab
            client={YAIR_LINKED} spouseClient={MICHAL_LINKED}
            quotations={[]} engagements={[ENG_YAIR_ONLY, ENG_MICHAL_OWN]} charges={[]}
            onMarkChargePaid={async (c) => c}
            onNewQuotation={(kind) => setQuotationLog(l => [...l, `onNewQuotation(${kind}) עבור יאיר (יש לו כבר)`])}
            onOpenClient={simulateOpen}
          />
        </div>
      </div>

      {(openLog.length > 0 || quotationLog.length > 0) && (
        <pre id="tst-billing-log" style={{ marginTop: '1rem', padding: '.75rem', background: 'var(--surface-2)', fontSize: 12, direction: 'ltr', whiteSpace: 'pre-wrap' }}>
          {'openLog: ' + JSON.stringify(openLog) + '\n' + 'quotationLog: ' + JSON.stringify(quotationLog)}
        </pre>
      )}

      <h3 style={{ marginTop: '2rem' }}>(159) גיא → דין — שלב מעבר קל + ייצוג בלי ב"ל כפול</h3>
      <GuyDinFlow />

      <h3 style={{ marginTop: '2rem' }}>המסלול המוזהב (158, תרחיש 4) — יאיר → יצירת מיכל → הכול חוזר</h3>
      <GoldenFlowDemo />

      <h3 style={{ marginTop: '2rem' }}>צורת DB אמיתית של לקוח ותיק (159) — בלי spouse blob, בלי spouse_client_id בהכרח</h3>
      <LegacyClientMatrix />
    </div>
  );
}

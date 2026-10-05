// ─── לקוחות סינתטיים לטופס 6101 — לבדיקות, למסך הבדיקה ול-QA חזותי ─────────
// ‼ כל השמות, המספרים והכתובות בדויים. מספרי הזהות עומדים בספרת הביקורת
// (כדי לבדוק גם את מסלול «תקין»), וחלקם מתחילים באפס — אפסים מובילים הם
// מקרה קצה מחייב.

import type { Client, NiOccupation } from '../../../types';

const base = (over: Partial<Client>): Client => ({
  id: 'fx-6101', type: 'individual',
  idNumber: '', firstName: '', lastName: '', birthDate: '1985-01-01', gender: 'female',
  phone: '', email: '', city: '', address: '',
  incomeTaxType: 'selfEmployed', vatStatus: 'osek_morshe', businessDescription: '', hasExemptFromWithholding: false,
  niType: 'selfEmployed', hasTaxCoordination: false, taxCoordinationDetails: '',
  familyStatus: 'single', spouseName: '', spouseIdNumber: '', spouseWorking: false, spouseIncome: 0,
  spouse: null, fieldMeta: {},
  ...over,
} as unknown as Client);

const btlOcc = (o: Partial<NiOccupation> & Pick<NiOccupation, 'type'>): NiOccupation =>
  ({ id: `occ-${Math.random().toString(36).slice(2, 8)}`, source: 'btl_portal', ...o });

/** לקוחה עם כל הנתונים — כתובת מלאה, נייד+קווי, בנק ראשי, ב"ל מסונכרן. */
export const FX_FULL: Client = base({
  id: 'fx-6101-full',
  idNumber: '012345674', firstName: 'נועה', lastName: 'אלמוג',
  phone: '052-4491120', landlinePhone: '03-6123456', email: 'noa.almog-83@mail.example.co.il',
  city: 'תל אביב - יפו', address: 'רחוב אבן גבירול 112 כניסה ב דירה 14', zipCode: '6203854',
  familyStatus: 'married', marriageYear: 2014,
  spouseFirstName: 'עידו', spouseLastName: 'אלמוג', spouseIdNumber: '003456787',
  bankAccounts: [
    { id: 'b1', bankName: 'בנק לאומי', branchNumber: '064', branchName: 'כיכר המדינה', accountNumber: '0123456', isPrimary: true },
    { id: 'b2', bankName: 'בנק הפועלים', branchNumber: '600', accountNumber: '98765' },
  ],
  businesses: [{
    id: 'biz1', name: 'אלמוג עיצוב גרפי', kind: 'osek_morshe', description: 'מעצבת גרפית', startYear: 2025,
    revenueAnnual: 214000, netIncome: 131000,
    address: { street: 'דרך מנחם בגין', houseNumber: '132', apartment: '7', city: 'תל אביב - יפו', zip: '6701101', phone: '03-5559876' },
  }],
  vatOpeningDate: '2025-06-01',
  taxFiles: [{ id: 'tf-ded', authority: 'deductions', owner: 'client', fileNumber: '912345678', repStatus: 'active' }],
  niOccupations: [
    btlOcc({ type: 'self_employed', sourceLabel: 'עצמאי', fromDate: '2025-06-01' }),
    btlOcc({ type: 'student', sourceLabel: 'תלמיד להשכלה גבוהה', fromDate: '2023-10-01', toDate: '2026-09-30' }),
    btlOcc({ type: 'employee', sourceLabel: 'עובד', fromDate: '2022-09-01', toDate: '2025-01-16' }),
  ],
  niIncomeBasisMonthly: 16500,
  // ‼ (219) ההצהרה ששמורה לצד הסכום — בלעדיה 16,500 מקריאה אוטומטית «טעון אימות».
  niIncomeList: {
    declaration: { year: 2025, fromMonth: 6, toMonth: 6, infoSource: 'הצהרה', incomeSource: 'עצמאי', amount: 16500, receivedDate: '2025-06-15', status: 'תקף' },
    assessment: null,
  },
  niAdvanceMonthly: 2062,
  fieldMeta: {
    niOccupations: { source: 'automation', syncedAt: '2026-09-23T17:30:00Z' },
    niIncomeBasisMonthly: { source: 'automation', syncedAt: '2026-09-23T17:30:00Z' },
    bankAccounts: { source: 'manual', syncedAt: '2026-03-02T09:00:00Z' },
  },
} as Partial<Client>);

/** לקוח עם חוסרים וסתירות: בלי מיקוד, נייד שנשמר כקווי, שתי ת"ז לבן הזוג, ב"ל ישן. */
export const FX_GAPS: Client = base({
  id: 'fx-6101-gaps',
  idNumber: '301234563', firstName: 'אבי', lastName: 'שמעוני',
  phone: '', landlinePhone: '0541234567', email: 'avi@example',
  city: 'חיפה', address: 'הנביאים', familyStatus: 'married', marriageYear: 2019,
  spouseFirstName: 'רינה', spouseLastName: 'שמעוני', spouseIdNumber: '204567895',
  spouse: { firstName: 'רינה', lastName: 'שמעוני', idNumber: '045678125' } as Client['spouse'],
  bankAccounts: [
    { id: 'b1', bankName: 'מזרחי טפחות', branchNumber: '412', accountNumber: '4521' },
    { id: 'b2', bankName: 'דיסקונט', branchNumber: '011', accountNumber: '123456789' },
  ],
  niOccupations: [btlOcc({ type: 'self_employed_non_qualifying', sourceLabel: 'עצמאי שאינו עונה להגדרה', fromDate: '2024-01-01' })],
  fieldMeta: { niOccupations: { source: 'automation', syncedAt: '2026-01-10T10:00:00Z' } },
} as Partial<Client>);

/** שמות וכתובת ארוכים מאוד, יותר מ-3 תקופות עיסוק, מייל ארוך עם ספרות ומקפים. */
export const FX_LONG: Client = base({
  id: 'fx-6101-long',
  idNumber: '045678125', firstName: 'אברהם-יהושע מרדכי', lastName: 'בן-שושן אלמוג-רוזנבלום',
  phone: '0501234567', email: 'avraham-yehoshua.ben-shoshan.2026@long-subdomain.example-mail.co.il',
  city: 'קריית ביאליק', address: 'שדרות יהודית ואליעזר בן-יהודה 1234א/56', zipCode: '2704101',
  familyStatus: 'divorced', divorceYear: 2021,
  bankAccounts: [{ id: 'b1', bankName: 'הבנק הבינלאומי הראשון לישראל', branchNumber: '009', branchName: 'סניף מרכז קריות — שדרות ההסתדרות', accountNumber: '000123456', isPrimary: true }],
  niOccupations: [
    btlOcc({ type: 'self_employed', sourceLabel: 'עצמאי', fromDate: '2026-03-01' }),
    btlOcc({ type: 'not_working', sourceLabel: '( ללא עיסוק )', fromDate: '2025-11-01', toDate: '2026-02-28' }),
    btlOcc({ type: 'employee', sourceLabel: 'עובד', fromDate: '2025-05-01', toDate: '2025-10-31' }),
    btlOcc({ type: 'student', sourceLabel: 'תלמיד להשכלה גבוהה', fromDate: '2024-10-01', toDate: '2025-04-30' }),
    btlOcc({ type: 'self_employed_non_qualifying', sourceLabel: 'עצמאי שאינו עונה להגדרה', fromDate: '2024-01-01', toDate: '2024-09-30' }),
  ],
  fieldMeta: { niOccupations: { source: 'automation', syncedAt: '2026-09-20T08:00:00Z' } },
} as Partial<Client>);

export const FX_CLIENTS = { full: FX_FULL, gaps: FX_GAPS, long: FX_LONG } as const;

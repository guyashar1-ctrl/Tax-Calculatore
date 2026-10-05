// ─── נתוני דוגמה למסכים שהלקוח מגיע אליהם בקישור אישי ─────────────────────────
// «צפייה» בבקשה: המשרד רואה את המסך האמיתי של הלקוח, על נתוני דוגמה.
// ‼ אלה קלטים בלבד — שמות, רשויות, היקף. כל ניסוח שהעמוד האמיתי מקבל מהשרת
// (שם המשרד, המיתוג, הוראות) נכנס מבחוץ, ולא נכתב כאן.
// ‼ אסור לייבא מכאן שום דבר שפונה לרשת: רק `import type` מקבצי המסכים.

import type { FirmBranding } from '../../types/firmProfile';
import type { AuthorityKind, AuthorityRepresentations, OnboardingPrefill } from '../../types';
import type { OnboardingFormValues, OnboardingInfo, OnboardingViewData } from '../OnboardingPage';
import type { PublicSignViewData, Session as PublicSignSession } from '../PublicSignPage';
import type { ReleaseData } from '../PublicReleasePage';
import type { PublicIntakePageData } from '../PublicIntakePage';
import type { PublicSigning } from '../../features/smartForms/api';
import { BTL6101_TEMPLATE } from '../../features/smartForms/btl6101/template';
import { EMPTY_6101, type Btl6101Purpose } from '../../features/smartForms/btl6101/model';
import { migrateModel } from '../../features/annualReport/types';
import { getRootQuestion } from '../../features/annualReport/engine';
import { buildForm2279Fields } from '../../features/representation/shaamRepresentation';

/** המשפט שמופיע ליד פקד שבתצוגה לדוגמה היה שולח/שומר — זהה לזה של הדף האישי. */
export const SAMPLE_SIMULATED_TEXT = 'בתצוגה לדוגמה — כאן הלקוח היה שולח. לא נשמר ולא נשלח דבר.';

/** הדמויות של הדוגמה — אותן בכל המסכים. */
export const SAMPLE_PEOPLE = {
  clientFull: 'ישראל ישראלי',
  clientFirst: 'ישראל',
  clientLast: 'ישראלי',
  spouseFull: 'ישראלה ישראלי',
  spouseFirst: 'ישראלה',
  spouseLast: 'ישראלי',
  business: 'ישראלי ייעוץ (דוגמה)',
  previousAccountant: 'רו״ח לדוגמה',
  reference: 'A-0000-0000',
} as const;

export type SampleAuthority = 'incomeTax' | 'vat' | 'withholding' | 'nationalInsurance';

export interface SampleLinkedOpts {
  /** כפי שהשרת מחזיר ללקוח — לא נבחר כאן. */
  firmName: string;
  /** המיתוג של המשרד כפי שהשרת מחזיר; חסר ⇒ המראה הניטרלי. */
  branding?: FirmBranding;
  /** נשואים — מופיע גם בן/בת הזוג («ישראלה ישראלי»). */
  couple?: boolean;
  /** הרשויות שהתבקשו. ברירת מחדל: מס הכנסה. */
  authorities?: SampleAuthority[];
}

function sampleScope(authorities: SampleAuthority[], couple: boolean): AuthorityRepresentations {
  const scope: AuthorityRepresentations = {};
  for (const a of authorities) {
    scope[a] = a === 'nationalInsurance'
      ? { status: 'in_process', targets: couple ? ['client', 'spouse'] : ['client'] }
      : { status: 'in_process', level: 'primary', ...(a === 'incomeTax' ? {} : { targets: ['client'] as ['client'] }) };
  }
  return scope;
}

/** מה שהקישור `?onboard=` מציג: הפרטים האישיים, אחר כך הצילומים. */
export function sampleOnboardingData(opts: SampleLinkedOpts): OnboardingViewData {
  const couple = !!opts.couple;
  const authorities = opts.authorities?.length ? opts.authorities : ['incomeTax' as const];
  const P = SAMPLE_PEOPLE;
  const prefill: OnboardingPrefill = {
    firstName: P.clientFirst,
    lastName: P.clientLast,
    email: 'israel@example.com',
    ...(couple ? {
      familyStatus: 'married' as const,
      spouseName: P.spouseFull,
      spouseFirstName: P.spouseFirst,
      spouseLastName: P.spouseLast,
      registeredSpouse: 'client' as const,
    } : {}),
  };
  const info: OnboardingInfo = {
    clientName: P.clientFull,
    firmName: opts.firmName,
    branding: opts.branding ?? {},
    alreadySubmitted: false,
    status: 'pending_fill',
    authorities: authorities.filter((a): a is AuthorityKind => a !== 'nationalInsurance'),
    alreadySigned: false,
    prefill,
    knownFirstName: P.clientFirst,
    knownLastName: P.clientLast,
    knownEmail: 'israel@example.com',
    niIncluded: authorities.includes('nationalInsurance'),
    scope: sampleScope(authorities, couple),
    draft: {},
    spouseFill: {},
  };
  const values: OnboardingFormValues = {
    firstName: P.clientFirst, lastName: P.clientLast, idNumber: '', birthDate: '',
    secondaryType: 'parentId', secondaryValue: '',
    phone: '', email: 'israel@example.com', city: '', address: '',
    familyStatus: couple ? 'married' : '', familyYear: '',
    spouseFirstName: couple ? P.spouseFirst : '', spouseLastName: couple ? P.spouseLast : '',
    spouseIdNumber: '', spouseBirthYear: '', spousePhone: '',
    spouseBirthDate: '', spouseSecondaryType: 'parentId', spouseSecondaryValue: '',
  };
  return { info, idDocs: {}, values, phase: 'form', step: 1, resumed: false, spouseLink: '' };
}

/**
 * מה שהקישור `?sign=` מציג: חדר החתימה על טופס 2279, עם מקומות החתימה של הלקוח.
 * @param pdfBytes הטופס הריק — ראה `loadSampleForm2279Pdf`.
 * @param phase 'sign' (ברירת מחדל) · 'already'/'done' — מסכי הסיום, עם אישור הביטוח הלאומי ובחירת בן/בת הזוג.
 */
export function sampleSignData(opts: SampleLinkedOpts & { pdfBytes: ArrayBuffer; phase?: PublicSignViewData['phase'] }): PublicSignViewData {
  const couple = !!opts.couple;
  const authorities = opts.authorities?.length ? opts.authorities : ['incomeTax' as const];
  const P = SAMPLE_PEOPLE;
  // מס הכנסה אצל זוג נשוי: שניהם חותמים על אותו טופס. מע"מ/ניכויים — טופס של אדם אחד.
  const bothSign = couple && authorities.includes('incomeTax');
  const fields = buildForm2279Fields('client', bothSign);
  const session: PublicSignSession = {
    ni: authorities.includes('nationalInsurance')
      ? { referenceNumber: P.reference, deadline: new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10) }
      : null,
    signerId: 'client',
    signerRole: 'client',
    signerName: P.clientFull,
    alreadySigned: false,
    requestStatus: 'pending_signature',
    firmName: opts.firmName,
    fields,
    signersPublic: [
      { id: 'client', name: P.clientFull, signStatus: 'pending' },
      ...(bothSign ? [{ id: 'spouse', name: P.spouseFull, signStatus: 'pending' }] : []),
    ],
    values: {},
    pdfUrl: '',
    pdfFileName: 'ייפוי כוח 2279.pdf',
    spousePending: bothSign,
    spouseName: bothSign ? P.spouseFull : '',
  };
  return {
    session,
    pdfBytes: opts.pdfBytes,
    phase: opts.phase ?? 'sign',
    spouse: { pending: bothSign && (opts.phase ?? 'sign') !== 'sign', name: bothSign ? P.spouseFull : '' },
  };
}

export interface SampleReleaseOpts extends Pick<SampleLinkedOpts, 'firmName' | 'branding'> {
  /** מה ביקשנו — התוויות כפי שהשרת מחזיר אותן (ניסוח של המשרד, לא של הדוגמה). */
  materials: { key: string; label: string; priority?: boolean; optional?: boolean }[];
  /** גוף המכתב כפי שהשרת מרכיב אותו; חסר ⇒ אין «המכתב המלא». */
  letterBody?: string;
  subject?: string;
  /** עבודות שנשארו בטיפול הרו"ח הקודם, כפי שהשרת מחזיר. */
  outstanding?: { key: string; label: string }[];
  objectionDueDate?: string;
}

/** מה שהקישור `?release=` מציג: דף הרו"ח הקודם — אדם חיצוני, לא לקוח. */
export function sampleReleaseData(opts: SampleReleaseOpts): ReleaseData {
  const P = SAMPLE_PEOPLE;
  return {
    firmName: opts.firmName,
    branding: opts.branding ?? {},
    clientName: P.clientFull,
    businessName: P.business,
    prevAccountantName: P.previousAccountant,
    subject: opts.subject,
    body: opts.letterBody,
    objectionDueDate: opts.objectionDueDate,
    objectionWindowPassed: false,
    signed: false,
    materialsStepId: 'sample-step',
    materials: opts.materials.map(m => ({ key: m.key, label: m.label, done: false, ...(m.priority ? { priority: true } : {}), ...(m.optional ? { optional: true } : {}) })),
    materialsDone: 0,
    materialsTotal: opts.materials.length,
    uploads: [],
    outstanding: opts.outstanding,
  };
}

export interface SampleIntakeOpts extends Pick<SampleLinkedOpts, 'firmName' | 'branding'> {
  /** שנת המס של השאלון. ברירת מחדל: השנה שעברה. */
  taxYear?: number;
  /** 'done' — מסך התודה אחרי שהלקוח כבר מילא. */
  phase?: 'intake' | 'done';
}

/** מה שהקישור `?intake=` מציג: השאלה הראשונה של שאלון ההיכרות. */
export function sampleIntakeData(opts: SampleIntakeOpts): PublicIntakePageData {
  const model = migrateModel(null, opts.taxYear ?? new Date().getFullYear() - 1);
  model.meta = { ...(model.meta ?? {}), flow: 'onboarding' };
  return {
    info: {
      clientName: SAMPLE_PEOPLE.clientFull,
      firmName: opts.firmName,
      branding: opts.branding ?? {},
      sessionStatus: opts.phase === 'done' ? 'completed' : 'in_progress',
    },
    phase: opts.phase ?? 'intake',
    initial: { sessionId: 'sample-session', model, currentQuestionId: getRootQuestion().id },
  };
}

export interface SampleSignFormOpts extends Pick<SampleLinkedOpts, 'firmName'> {
  /** מי חותם: המבוטח (ברירת מחדל) או בן/בת הזוג, כשהוא/היא עובד/ת בעסק. */
  role?: 'client' | 'spouse';
  /** מה מוצג בטופס — ברירת מחדל: דיווח עיסוקים בשנתיים האחרונות. */
  purposes?: Btl6101Purpose[];
}

/**
 * מה שהקישור `?sign-form=` מקבל מהשרת: פרטי החותם והנתונים שעל טופס 6101.
 * ‼ הטביעה והגרסה הן של הטופס שבקוד, כדי שהדף יצייר אותו — לא פנייה לשרת.
 * את הבתים של הטופס המצויר מייצרים עם `renderSampleBtl6101` (samplePdf.ts).
 */
export function sampleSignFormInfo(opts: SampleSignFormOpts): PublicSigning {
  const P = SAMPLE_PEOPLE;
  const role = opts.role ?? 'client';
  return {
    ok: true,
    role,
    signerName: role === 'spouse' ? P.spouseFull : P.clientFull,
    firmName: opts.firmName,
    templateKey: BTL6101_TEMPLATE.key,
    templateVersion: BTL6101_TEMPLATE.version,
    templateSha256: BTL6101_TEMPLATE.sha256,
    mappingVersion: BTL6101_TEMPLATE.mappingVersion,
    mapping: {},
    purposes: opts.purposes ?? ['multi_year_report'],
    data: {
      ...EMPTY_6101,
      lastName: P.clientLast, firstName: P.clientFirst, idNumber: '012345674',
      maritalStatus: 'married', spouseLastName: P.spouseLast, spouseFirstName: P.spouseFirst, spouseIdNumber: '003456787',
      street: 'רחוב הדוגמה', houseNumber: '1', city: 'תל אביב - יפו', zip: '6100000',
      mobile: '050-0000000', email: 'israel@example.com',
      occupations: [{ from: '2025-01-01', to: '', occupation: 'עצמאי', nonWorkIncome: '', nonWorkSource: '' }],
    },
    contentSha256: 'sample',
    otherSignatures: {},
    clientSignedAt: null,
  };
}

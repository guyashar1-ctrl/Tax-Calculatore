// ─── נתונים סינתטיים לסקירה הוויזואלית ───────────────────────────────────────
// ‼ קיים רק בענף הסקירה. אינו מיועד למיזוג ל-master.
//
// למה זה קיים: נתוני הדוגמה שבריפו (SAMPLE_CLIENTS) נולדו לפני מבנה מחזור
// החיים — אין בהם lifecycleStage ואין representationStatus. התוצאה היא
// שכל שבעת הלקוחות נופלים ל"פעיל", ושלוש לשוניות מתוך חמש נשארות ריקות
// לצמיתות. אי אפשר לסקור מסך שרוב המצבים שלו אינם נגישים.
//
// כאן נבנה מערך שמכסה את חמש הלשוניות, ואת כל שלבי המסע, כדי שהסקירה
// תוכל לקבוע אם מה שאושר אכן מומש — ולא רק שהקוד מתקמפל.
// כל הכתובות הן .invalid, כל השמות בדויים, ואין כאן שום נתון אמיתי.

import type { Client, Task } from '../types';
import type { Engagement, OnboardingStep } from '../types/onboarding';
import type { Quotation, Lead } from '../types/quotations';
import type { RepresentationRequest } from '../types';
import { enrichClientWithWorkspace } from '../data/sampleClientWorkspace';

const day = 86_400_000;
export const ago = (n: number) => new Date(Date.now() - n * day).toISOString();
export const ahead = (n: number) => new Date(Date.now() + n * day).toISOString();

type Seed = Partial<Client> & { id: string; firstName: string; lastName: string };

function client(seed: Seed): Client {
  return enrichClientWithWorkspace({
    idNumber: '000000000',
    phone: '050-0000000',
    email: `${seed.id}@synthetic.invalid`,
    city: 'תל אביב',
    incomeTaxType: 'selfEmployed',
    niType: 'selfEmployed',
    vatStatus: 'authorizedDealer',
    vatFrequency: 'bi_monthly',
    pitAdvanceFrequency: 'monthly',
    taxFiles: [],
    notes: '',
    activity: [],
    ...seed,
  } as unknown as Client);
}

// ─── לידים · לשונית "לידים" ─────────────────────────────────────────────────

export const LEADS: Lead[] = [
  {
    id: 'lead-tal', fullName: 'טל אביטן', phone: '054-7781122', email: 'tal@synthetic.invalid',
    businessName: 'סטודיו אביטן · עיצוב גרפי ומיתוג', dealerType: 'exempt', status: 'new',
    hasPreviousAccountant: false, businessTransfer: false,
    referralSource: 'המלצה של אילן סימנטוב',
    notes: 'הנהלת חשבונות שוטפת + דוח שנתי; שאל על חשבות שכר לעובדת אחת.',
    convertedClientId: 'c-lead-tal', createdAt: ago(3), updatedAt: ago(3),
  },
  {
    id: 'lead-ron', fullName: 'רון ברק', phone: '052-3390011', email: 'ron@synthetic.invalid',
    businessName: 'ברק הובלות', dealerType: 'licensed', status: 'closed',
    hasPreviousAccountant: true, prevAccountantName: 'משה לוי',
    referralSource: 'חיפוש בגוגל', notes: 'ביקש הצעה ואז חזר לרו״ח הקודם.',
    convertedClientId: 'c-lead-ron', createdAt: ago(12), updatedAt: ago(4),
  },
  // ‼ אין כאן ליד בלי כרטיס בכוונה: את הרשימה שלו מזריק App דרך leadsPanel,
  // והמעטפת של הסקירה אינה משכפלת אותו. ליד כזה היה נספר בלשונית ומופיע
  // כ"3" בזמן ששתי שורות בלבד על המסך — בדיוק המונה השקרי שתוקן עכשיו.
];

// ─── לקוחות · חמש הלשוניות ───────────────────────────────────────────────────

export const CLIENTS: Client[] = [
  // ── לידים (יש להם כרטיס) ──
  client({ id: 'c-lead-tal', firstName: 'טל', lastName: 'אביטן', idNumber: '311882440',
    phone: '054-7781122', city: 'תל אביב', lifecycleStage: 'lead', vatStatus: 'exemptDealer',
    createdAt: ago(3) }),
  client({ id: 'c-lead-ron', firstName: 'רון', lastName: 'ברק', idNumber: '302114887',
    phone: '052-3390011', city: 'פתח תקווה', lifecycleStage: 'lead', createdAt: ago(12) }),

  // ── בהצעה · שניים, אחד נצפה ואחד פג תוקף ──
  client({ id: 'c-quoted-michal', firstName: 'מיכל', lastName: 'לוי', idNumber: '026558991',
    phone: '052-9911003', city: 'רמת השרון', lifecycleStage: 'quoted',
    hasPreviousAccountant: true, prevAccountantName: 'אבי כהן',
    prevAccountantEmail: 'avi@synthetic.invalid', createdAt: ago(10) }),
  client({ id: 'c-quoted-dana', firstName: 'דנה', lastName: 'בר-לב', idNumber: '312004881',
    phone: '050-8890021', city: 'הרצליה', lifecycleStage: 'quoted', createdAt: ago(55) }),

  // ── בקליטה · שלושה, עם התקשרות ובקשות פתוחות ──
  client({ id: 'c-onb-yuval', firstName: 'יובל', lastName: 'גרוסמן', idNumber: '029384756',
    phone: '054-8823001', city: 'רמת גן', lifecycleStage: 'onboarding',
    representationStatus: 'awaiting_authorities',
    spouseName: 'נועה גרוסמן', spouseIdNumber: '026558991',
    hasPreviousAccountant: true, prevAccountantName: 'אבי כהן',
    representationRequestId: 'req-yuval', createdAt: ago(24) }),
  client({ id: 'c-onb-lehem', firstName: 'מאפיית', lastName: 'לחם הארץ', idNumber: '514882301',
    phone: '03-5561220', city: 'חולון', lifecycleStage: 'onboarding',
    representationStatus: 'awaiting_accountant', representationRequestId: 'req-lehem',
    incomeTaxType: 'other', createdAt: ago(9) }),
  client({ id: 'c-onb-shmulik', firstName: 'שמוליק', lastName: 'כהן', idNumber: '301882774',
    phone: '052-2210094', city: 'רעננה', lifecycleStage: 'onboarding',
    representationStatus: 'pending_fill', representationRequestId: 'req-shmulik',
    incomeTaxType: 'both', vatStatus: 'exemptDealer', createdAt: ago(5) }),

  // ── לקוחות פעילים · אחד עם חריגות, אחד שקט, והשאר רקע ──
  client({ id: 'c-act-ilan', firstName: 'אילן', lastName: 'סימנטוב', idNumber: '029384700',
    phone: '054-8823555', city: 'תל אביב', lifecycleStage: 'active',
    representationStatus: 'active', shaamStatus: 'active',
    taxFiles: [{ id: 'tf1', authority: 'deductions', fileNumber: '9114', owner: 'client', repStatus: 'active' }],
    pinnedNote: 'אילן מעדיף שיחות אחרי 17:00. החשבונות מגיעים מהמנהלת שלו, מיכל.',
    activity: [
      { id: 'a1', kind: 'note', text: 'שיחת טלפון — סיכום רבעון', at: ago(3) },
      { id: 'a2', kind: 'note', text: 'התקבלו אישורי ניכוי', at: ago(11) },
    ],
    createdAt: ago(400) }),
  client({ id: 'c-act-orit', firstName: 'אורית', lastName: 'שפירא', idNumber: '058456789',
    phone: '058-4567890', city: 'רעננה', lifecycleStage: 'active',
    representationStatus: 'active', createdAt: ago(300) }),
  client({ id: 'c-act-natasha', firstName: 'נטשה', lastName: 'גולדברג', idNumber: '053567890',
    phone: '053-5678901', city: 'נתניה', lifecycleStage: 'active',
    representationStatus: 'active', shaamStatus: 'pending', createdAt: ago(250) }),
  client({ id: 'c-act-mohammed', firstName: 'מוחמד', lastName: 'חוסין', idNumber: '050678901',
    phone: '050-6789012', city: 'שדרות', lifecycleStage: 'active',
    representationStatus: 'active', createdAt: ago(220) }),
  client({ id: 'c-act-yossi', firstName: 'יוסי', lastName: 'אברהם', idNumber: '054345678',
    phone: '054-3456789', city: 'חיפה', lifecycleStage: 'active',
    representationStatus: 'active', createdAt: ago(180) }),
  client({ id: 'c-act-rina', firstName: 'רינה', lastName: 'פרץ', idNumber: '040112233',
    phone: '050-4412233', city: 'באר שבע', lifecycleStage: 'active',
    representationStatus: 'active', shaamStatus: 'inactive', createdAt: ago(150) }),
];

CLIENTS.push(client({ id: 'c-onb-ori', firstName: 'אורי', lastName: 'נחמיאס', idNumber: '033445566',
  phone: '052-7788990', city: 'מודיעין', lifecycleStage: 'onboarding',
  representationStatus: 'active', createdAt: ago(30) }));

export const CLIENT_BY_ID = new Map(CLIENTS.map(c => [c.id, c]));
export const LEAD_ID_BY_CLIENT = new Map(
  LEADS.filter(l => l.convertedClientId).map(l => [l.convertedClientId!, l.id]),
);

// ─── בקשות ייצוג · מזינות את צינור הייצוג בלשונית "בהצעה" ולשורות הכרטיס ──

export const REQUESTS: RepresentationRequest[] = [
  { id: 'req-yuval', clientId: 'c-onb-yuval', status: 'awaiting_authorities', createdAt: ago(24) },
  { id: 'req-lehem', clientId: 'c-onb-lehem', status: 'awaiting_accountant', createdAt: ago(9) },
  { id: 'req-shmulik', clientId: 'c-onb-shmulik', status: 'pending_fill', createdAt: ago(5) },
] as unknown as RepresentationRequest[];

// ─── התקשרויות ובקשות קליטה · מזינות את לשונית "בקליטה" ואת דף המסע ────────

export const ENGAGEMENTS: Engagement[] = [
  { id: 'eng-yuval', clientId: 'c-onb-yuval', quotationId: 'q-yuval', status: 'onboarding',
    monthlyTotal: 1180, billingStartMonth: '2026-09', approvedAt: ago(24), processPublishedAt: ago(23) },
  { id: 'eng-lehem', clientId: 'c-onb-lehem', quotationId: 'q-lehem', status: 'onboarding',
    monthlyTotal: 2400, billingStartMonth: '2026-09', approvedAt: ago(9), processPublishedAt: ago(8) },
  { id: 'eng-shmulik', clientId: 'c-onb-shmulik', quotationId: 'q-shmulik', status: 'onboarding',
    monthlyTotal: 700, billingStartMonth: '2026-10', approvedAt: ago(5) },
  { id: 'eng-ori', clientId: 'c-onb-ori', status: 'onboarding', monthlyTotal: 900, approvedAt: ago(30), processPublishedAt: ago(29) },
  { id: 'eng-ilan', clientId: 'c-act-ilan', quotationId: 'q-ilan', status: 'active',
    monthlyTotal: 1180, billingStartMonth: '2025-09', approvedAt: ago(400), activatedAt: ago(340) },
];

const step = (o: Partial<OnboardingStep> & { id: string; clientId: string; stepType: string; title: string; status: string; ball: string }) =>
  ({ engagementId: `eng-${o.clientId.split('-').pop()}`, payload: {}, sortOrder: 0, ...o } as unknown as OnboardingStep);

export const STEPS: OnboardingStep[] = [
  // יובל — הרצף המאושר המלא: ייצוג → רו״ח קודם → פייפרלס → תשלום → שאלון
  step({ id: 's-y1', clientId: 'c-onb-yuval', stepType: 'representation', title: '', status: 'completed', ball: 'me', sortOrder: 0 }),
  step({ id: 's-y2', clientId: 'c-onb-yuval', stepType: 'prev_accountant_details', title: '', status: 'completed', ball: 'client', sortOrder: 1 }),
  step({ id: 's-y3', clientId: 'c-onb-yuval', stepType: 'release_letter', title: '', status: 'waiting_client', ball: 'prev_accountant', sortOrder: 2, dueDate: ahead(2), payload: { published: true } }),
  step({ id: 's-y4', clientId: 'c-onb-yuval', stepType: 'materials_received', title: '', status: 'locked', ball: 'prev_accountant', sortOrder: 3, dependsOnStepId: 's-y3' }),
  step({ id: 's-y5', clientId: 'c-onb-yuval', stepType: 'paperless_invite', title: '', status: 'completed', ball: 'me', sortOrder: 4 }),
  step({ id: 's-y6', clientId: 'c-onb-yuval', stepType: 'paperless_connection', title: '', status: 'waiting_client', ball: 'client', sortOrder: 5, dependsOnStepId: 's-y5', payload: { published: true } }),
  step({ id: 's-y7', clientId: 'c-onb-yuval', stepType: 'retainer_authorization', title: '', status: 'locked', ball: 'client', sortOrder: 6, dependsOnStepId: 's-y6' }),
  step({ id: 's-y8', clientId: 'c-onb-yuval', stepType: 'intake_questionnaire', title: '', status: 'waiting_client', ball: 'client', sortOrder: 7, requiredForClose: true, payload: { published: true } }),
  step({ id: 's-y9', clientId: 'c-onb-yuval', stepType: 'custom_request', title: '', status: 'pending', ball: 'me', sortOrder: 8, requiredForClose: false, payload: { published: false, title: 'עדכון תמונת מס — מחזור 2026' } }),

  // מאפייה — כל הנדרש הושלם; נותרה בקשת רשות אחת בלבד (תרחיש B)
  step({ id: 's-l1', clientId: 'c-onb-lehem', stepType: 'client_documents', title: '', status: 'completed', ball: 'me', sortOrder: 0 }),
  step({ id: 's-l2', clientId: 'c-onb-lehem', stepType: 'kyc_identification', title: '', status: 'completed', ball: 'me', sortOrder: 1 }),
  step({ id: 's-l3', clientId: 'c-onb-lehem', stepType: 'custom_request', title: '', status: 'pending', ball: 'me', sortOrder: 2, requiredForClose: true, payload: { published: true, title: 'אישור רואה חשבון מבקר' } }),
  step({ id: 's-l4', clientId: 'c-onb-lehem', stepType: 'intake_questionnaire', title: '', status: 'waiting_client', ball: 'client', sortOrder: 3, requiredForClose: false, payload: { published: true } }),

  // שמוליק — ממתין ללקוח בלבד
  step({ id: 's-s1', clientId: 'c-onb-shmulik', stepType: 'intake_questionnaire', title: 'שאלון פתיחת תיק', status: 'waiting_client', ball: 'client', sortOrder: 0, payload: { published: true } }),
  step({ id: 's-s2', clientId: 'c-onb-shmulik', stepType: 'client_documents', title: 'מסמכים מהלקוח', status: 'waiting_client', ball: 'client', sortOrder: 1, payload: { published: true } }),

  // אילן — לקוח פעיל עם בקשה פתוחה אחת וטיוטה
  step({ id: 's-i1', clientId: 'c-act-ilan', stepType: 'client_documents', title: 'אישורי תרומות 2025', status: 'waiting_client', ball: 'client', sortOrder: 0, payload: { published: true } }),
  step({ id: 's-i2', clientId: 'c-act-ilan', stepType: 'custom_request', title: '', status: 'pending', ball: 'me', sortOrder: 1, payload: { published: false, title: 'עדכון תמונת מס — מחזור 2026' } }),
  step({ id: 's-i3', clientId: 'c-act-ilan', stepType: 'representation', title: 'ייפוי כוח', status: 'completed', ball: 'me', sortOrder: 2 }),

  // אורי — הרצף כולו הושלם (תרחיש C: סגירה רגילה בלי שום פתוח)
  step({ id: 's-o1', clientId: 'c-onb-ori', stepType: 'representation', title: '', status: 'completed', ball: 'me', sortOrder: 0 }),
  step({ id: 's-o2', clientId: 'c-onb-ori', stepType: 'client_documents', title: '', status: 'completed', ball: 'me', sortOrder: 1 }),
  step({ id: 's-o3', clientId: 'c-onb-ori', stepType: 'internal_setup', title: '', status: 'completed', ball: 'me', sortOrder: 2 }),
  step({ id: 's-o4', clientId: 'c-onb-ori', stepType: 'custom_request', title: '', status: 'pending', ball: 'me', sortOrder: 3, requiredForClose: false, payload: { published: false, title: 'ייבוא היסטוריה משנה קודמת' } }),
];

// ─── הצעות מחיר · מזינות את שלב "בהצעה" ואת לוח האירועים ────────────────────

const quote = (o: Partial<Quotation> & { id: string; clientId: string; quotationNumber: string }) =>
  ({ revision: 1, items: [], futureServices: [], vatRate: 18, events: [], status: 'sent', ...o } as unknown as Quotation);

export const QUOTATIONS: Quotation[] = [
  quote({
    id: 'q-michal', clientId: 'c-quoted-michal', quotationNumber: '1047', status: 'viewed',
    sentAt: ago(4), firstViewedAt: ago(2), expiresAt: ahead(9),
    representation: { authorities: ['incomeTax'] } as unknown as Quotation['representation'],
    events: [
      { type: 'created', at: ago(5) }, { type: 'sent', at: ago(4) },
      { type: 'viewed', at: ago(2) }, { type: 'reminder_sent', at: ago(1) },
    ],
    createdAt: ago(5), updatedAt: ago(1),
  }),
  quote({
    id: 'q-dana', clientId: 'c-quoted-dana', quotationNumber: '1031', status: 'sent',
    sentAt: ago(50), expiresAt: ago(40),
    events: [{ type: 'created', at: ago(51) }, { type: 'sent', at: ago(50) }],
    createdAt: ago(51), updatedAt: ago(50),
  }),
  quote({
    id: 'q-ilan', clientId: 'c-act-ilan', quotationNumber: '0981', status: 'approved',
    sentAt: ago(405), approvedAt: ago(400), expiresAt: ago(390),
    events: [{ type: 'sent', at: ago(405) }, { type: 'approved', at: ago(400) }],
    createdAt: ago(406), updatedAt: ago(400),
  }),
  quote({
    id: 'q-yuval', clientId: 'c-onb-yuval', quotationNumber: '1052', status: 'approved',
    sentAt: ago(26), approvedAt: ago(24),
    events: [{ type: 'sent', at: ago(26) }, { type: 'approved', at: ago(24) }],
    createdAt: ago(27), updatedAt: ago(24),
  }),
];

// ─── משימות ─────────────────────────────────────────────────────────────────

const task = (o: Partial<Task> & { id: string; clientId: string; title: string }) =>
  ({ status: 'open', ballWith: 'me', progress: 'new', category: 'ongoing', createdAt: ago(20), ...o } as unknown as Task);

export const TASKS: Task[] = [
  task({ id: 't1', clientId: 'c-act-ilan', title: 'להגיש דוח 102 לחודש יולי', dueDate: ago(3), category: 'institutions' }),
  task({ id: 't2', clientId: 'c-act-ilan', title: 'לחדש אישור ניכוי במקור', dueDate: ahead(4) }),
  task({ id: 't3', clientId: 'c-act-ilan', title: 'לקבל אישורי תרומות 2025', ballWith: 'client', dueDate: ahead(26), category: 'annual_report' }),
  task({ id: 't4', clientId: 'c-onb-yuval', title: 'להכין מכתב שחרור לרו״ח הקודם', dueDate: ahead(1), category: 'institutions' }),
  task({ id: 't5', clientId: 'c-onb-lehem', title: 'לסגור חיתוך מלאי 2025', dueDate: ago(1), category: 'cutoff' }),
  task({ id: 't6', clientId: 'c-onb-lehem', title: 'לברר עם פקיד השומה על תיאום מס', ballWith: 'stuck', category: 'discussions' }),
  task({ id: 't7', clientId: 'c-quoted-michal', title: 'לחזור למיכל אחרי שתקבל את ההצעה', ballWith: 'me', dueDate: ahead(2), category: 'management' }),
  task({ id: 't8', clientId: 'c-act-orit', title: 'דיווח מע״מ מרץ-אפריל 2026', ballWith: 'authority', dueDate: ahead(8) }),
  task({ id: 't9', clientId: 'c-act-natasha', title: 'תיאום מס עם פ״ש ירושלים', ballWith: 'authority', dueDate: ahead(12), category: 'institutions' }),
  task({ id: 't10', clientId: 'c-act-yossi', title: 'סגירת כרטיס ניכויים 2025', dueDate: ahead(15) }),
  task({ id: 't11', clientId: 'c-act-mohammed', title: 'תחזית תזרים 12 חודשים', dueDate: ahead(20), category: 'economic_work' }),
  task({ id: 't12', clientId: 'c-lead-tal', title: 'לחזור לטל אחרי שיקבל את ההצעה', ballWith: 'me', dueDate: ahead(3), category: 'management' }),
  task({ id: 't13', clientId: 'c-act-rina', title: 'הצהרת הון 2025 — איסוף נתונים', dueDate: ahead(30), category: 'wealth_declaration' }),
  task({ id: 't14', clientId: 'c-act-ilan', title: 'דיון שומה 2022 עם רפרנט מ״ה', status: 'done', category: 'discussions', dueDate: ago(40) }),
  task({ id: 't15', clientId: 'c-act-orit', title: 'קליטת לקוח חדש — פתיחת תיקים', status: 'done', dueDate: ago(60) }),
];

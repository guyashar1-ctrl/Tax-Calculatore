import { useEffect, useMemo, useRef, useState } from 'react';
import { formatRoute, parseHash, type View as AppRouteView } from './lib/appRoute';
import {
  Client,
  RepresentationRequest,
  RepresentationExecution,
  RequestSubmission,
  AccountantPartB,
  Task,
  TaskCategory,
  TaskProgress,
  BallWith,
  AuthorityKind,
  AuthorityRepresentations,
  RepAuthorityKind,
  RepSigner,
  RepSignatureDocument,
  SignatureValue,
  RepresentationStatus,
  REPRESENTATION_STATUS_LABELS,
  DEFAULT_REQUESTED_DOCS,
  LifecycleStage,
  OnboardingPrefill,
  TaxFileInfo,
  REP_AUTHORITY_ORDER,
} from './types';
import { ExtractedClientData } from './utils/geminiVision';
import { useDocumentDB } from './hooks/useIndexedDB';
import { useTheme } from './hooks/useTheme';
import { PivoMark } from './components/PivoMark';
import Icon from './components/ui/Icon';
import AuthorityConnectionButtons from './components/AuthorityConnectionButtons';
import { supabase } from './lib/supabase';
import { edgeFunctionError } from './utils/functionError';
import { effectiveNiCoversSpouse } from './utils/repSigners';
import { targetsOf } from './utils/repScope';
import {
  seedClientFromEmbeddedSpouse, findSpouseClient, resolvePersonAuthority, resolveIncomeTaxHousehold,
} from './utils/personRepresentation';
import { useClients } from './hooks/useClients';
import { useTasks } from './hooks/useTasks';
import { useRepresentationRequests } from './hooks/useRepresentationRequests';
import { useFirmProfile } from './hooks/useFirmProfile';
import { useFailedNotifications } from './hooks/useFailedNotifications';
import { useLivePulse } from './hooks/useLivePulse';
import { useLeads } from './hooks/useLeads';
import { useQuotations } from './hooks/useQuotations';
import { useCharges } from './hooks/useCharges';
import type { AdditionalCharge } from './types/charges';
import { useQuotationCatalog } from './hooks/useQuotationCatalog';
import QuotationsPipeline from './components/quotations/QuotationsPipeline';
import LeadsPanel, { LeadForm } from './components/quotations/LeadsPanel';
import QuotationBuilder, { type SaveDraftPayload } from './components/quotations/QuotationBuilder';
import ReleaseLetterDialog from './components/quotations/ReleaseLetterDialog';
import { RELEASE_MATERIALS, readReleaseDraft, releaseTemplateFrom } from './utils/releaseLetter';
import { unfiledBlocking } from './types/onboarding';
import { applySecondaryLevels } from './types/quotations';
import { currentEngagement } from './utils/engagementSelectors';
import { deriveQuotationBrand } from './components/quotations/quotationBranding';
import { buildQuotationEmailHtml } from './utils/quotationEmailHtml';
import { generateQuotationPdf } from './utils/quotationPdf';
import type { Lead, Quotation, QuotationKind } from './types/quotations';
import FirmProfileConsole from './components/FirmProfileConsole';
import type { FirmProfile } from './types/firmProfile';
import { SAMPLE_CLIENTS } from './data/sampleClients';
import { SAMPLE_TASKS } from './data/sampleTasks';
import ClientList from './components/ClientList';
import PersonDirectory from './components/PersonDirectory';
import ClientWorkspace, { type TabId as ClientTabId } from './components/ClientWorkspace';
import { unseenUploadsByClient } from './utils/prevAccountantInbox';
import { useOnboarding } from './hooks/useOnboarding';
import EmailPreviewDialog from './components/EmailActivity/EmailPreviewDialog';
import TaxCalculator from './components/TaxCalculator';
import DocumentManager from './components/DocumentManager';
import { enrichClientsWithWorkspace } from './data/sampleClientWorkspace';
import TaxCenter from './features/taxCenter/TaxCenter';
import { buildQuarterlyFreshnessTask, markFreshnessCreationAttempted, quarterlyTaskExists } from './data/freshnessTask';
import RepresentationRequestForm from './components/RepresentationRequestForm';
import RepresentationFillForm from './components/RepresentationFillForm';
import RepresentationRequestReview from './components/RepresentationRequestReview';
// TaskBoard.tsx (הלוח הישן, קיבוץ new/in_progress/done) הוחלף ב-M3 ב-TasksWorkspace
// (שלושת הדליים הקנוניים: לטיפולי/ממתין לאחרים/הושלמו). הקובץ הישן נשאר ללא
// ייבוא — קוד מת שממתין לניקוי.
// ‼ DocumentManager.tsx לעומתו *אינו* מת: לשונית המסמכים בכרטיס הלקוח עברה
// ל-DocumentsWorkspace, אבל מסך המסמכים הגלובלי (view === 'documents') עדיין
// מרנדר אותו. אל תמחק אותו בהסתמך על ההערה הזו.
import TasksWorkspace from './components/TasksWorkspace';
import TaskForm from './components/TaskForm';
import LoginScreen from './components/LoginScreen';
import NoAccessScreen from './components/NoAccessScreen';
import NewPersonDialog, { type NewPersonBasics } from './components/NewPersonDialog';
import RepresentationOnboardingDialog, { CreateRepresentationInput } from './components/RepresentationOnboardingDialog';
import { withLegacyMirror } from './utils/repDocuments';
import OnboardingPage from './components/OnboardingPage';
import SpouseFillPage from './components/SpouseFillPage';
import PublicIntakePage from './components/PublicIntakePage';
import PublicPortalPage from './components/PublicPortalPage';
import PublicReleasePage from './components/PublicReleasePage';
import PublicQuotationPage from './components/PublicQuotationPage';
import PublicApplyPage from './components/PublicApplyPage';
import TestSignaturePage from './components/signatureRequest/__TestSignaturePage';
import TestSigningRoom from './components/signatureRequest/__TestSigningRoom';
import TestExecutionCenter from './components/signatureRequest/__TestExecutionCenter';
import TestRepDocs from './components/signatureRequest/__TestRepDocs';
import TestOnboarding from './components/clientTabs/__TestOnboarding';
import TestJourney from './components/clientTabs/__TestJourney';
import TestInstitutions from './components/clientTabs/__TestInstitutions';
import TestAlignmentStatus from './components/clientTabs/__TestAlignmentStatus';
import TestTaxFileV6 from './components/clientTabs/__TestTaxFileV6';
import TestJourneyBall from './components/clientTabs/__TestJourneyBall';
import TestPortalPreview from './components/clientTabs/__TestPortalPreview';
import TestCaseComposer from './components/clientTabs/__TestCaseComposer';
import TestQuotations from './components/__TestQuotations';
import TestDeferred from './components/quotations/__TestDeferred';
import TestAgreement from './components/clientTabs/__TestAgreement';
import TestBuilder from './components/quotations/__TestBuilder';
import TestSignDone from './components/ui/__TestSignDone';
import TestFirmNotifications from './components/__TestFirmNotifications';
import TestRepDialog from './components/__TestRepDialog';
import TestSpouseLink from './components/__TestSpouseLink';
import TestAddRequestDialog from './components/__TestAddRequestDialog';
import TestRegisteredSpouse from './components/__TestRegisteredSpouse';
import TestPoaStamp from './components/__TestPoaStamp';
import PublicSignPage from './components/PublicSignPage';
import ErrorBoundary from './components/ErrorBoundary';
import LegacyMigrationBanner from './components/LegacyMigrationBanner';
import FailedNotificationsBanner from './components/FailedNotificationsBanner';
import { useAuth } from './hooks/useAuth';
import AnnualReport from './features/annualReport/AnnualReport';

type View = AppRouteView;

// ─── בן/בת הזוג הרשום/ה, מבקשת הייצוג ──────────────────────────────────────
// ‼ מקור האמת הוא `taxFiles[income_tax].owner` (registeredFileInfo), ולכן
// התשובה מהדיאלוג נכתבת לשם ולא לשדה מקביל.
//
// ‼ נכתב **רק כשהתשובה היא בן/בת הזוג** — ולא כשהיא הלקוח, שזו ברירת המחדל:
// `autofill_internal_setup` בשרת ממלא את התיקים רק כשהם ריקים לגמרי, וכתיבה
// מוקדמת הייתה חוסמת אותו לכל לקוח. בדיוק מהסיבה הזאת, כשכן כותבים — כותבים
// שורה לכל רשות שנבחרה, כדי שהחסימה לא תשאיר את שאר התיקים לא-קיימים.
const REP_AUTHORITY_TO_TAX_FILE: Record<RepAuthorityKind, TaxFileInfo['authority']> = {
  incomeTax: 'income_tax',
  withholding: 'deductions',
  vat: 'vat',
  nationalInsurance: 'national_insurance',
};

/**
 * מבנה תיקים ראשוני שמקבע מי בן/בת הזוג הרשום/ה במ"ה.
 *
 * ‼ שורה לכל רשות שנבחרה ולא רק למ"ה: `autofill_internal_setup` בשרת מוותר
 * על היצירה ברגע שיש **תיק אחד** עם מספר, ולכן כתיבה חלקית הייתה משאירה את
 * שאר הרשויות בלי תיק לתמיד.
 *
 * ‼ תיק מ"ה נרשם על שם הרשום — מספרו הוא ת.ז. שלו/ה. השאר תמיד על הלקוח:
 * תיק מע"מ/ניכויים של בן/בת הזוג נקבע בהיקף הייצוג ולא כאן.
 */
function taxFilesForRegisteredOwner(
  areas: AuthorityRepresentations,
  owner: 'client' | 'spouse',
  clientIdNumber: string | undefined,
  spouseIdNumber: string | undefined,
): TaxFileInfo[] | undefined {
  const selected = REP_AUTHORITY_ORDER.filter(a => areas[a]);
  if (!selected.length) return undefined;
  const spouseId = spouseIdNumber?.trim();
  return selected.map(a => {
    const authority = REP_AUTHORITY_TO_TAX_FILE[a];
    const onSpouse = authority === 'income_tax' && owner === 'spouse';
    const fileNumber = (onSpouse ? spouseId : clientIdNumber?.trim()) || undefined;
    return {
      id: `tf-rep-${a}`,
      authority,
      owner: onSpouse ? 'spouse' : 'client',
      repStatus: 'pending',
      ...(fileNumber ? { fileNumber } : {}),
      notes: onSpouse ? 'בן/בת הזוג הרשום/ה - נקבע בבקשת הייצוג' : 'נוצר עם בקשת הייצוג',
    } satisfies TaxFileInfo;
  });
}

/**
 * הכוונה שנרשמה **בפתיחת** הייצוג. ‼ רק 'spouse' נכתב: "ע״ש הלקוח" בשלב הזה
 * הוא ברירת מחדל ולא ידיעה, וכתיבתו הייתה חוסמת את `autofill_internal_setup`
 * לכל לקוח. ההכרעה עצמה (אחרי שע״ם) עוברת דרך handleConfirmRegisteredSpouse.
 */
function taxFilesForRegisteredSpouse(
  areas: AuthorityRepresentations,
  prefill: OnboardingPrefill,
  clientIdNumber: string | undefined,
): TaxFileInfo[] | undefined {
  if (prefill.registeredSpouse !== 'spouse') return undefined;
  return taxFilesForRegisteredOwner(areas, 'spouse', clientIdNumber, prefill.spouseIdNumber);
}

/**
 * מי הלקוח, למכתב ההעברה. ‼ הכרעת גיא (2026-08-20): אצל זוג נשוי לא מבררים
 * מי בן הזוג הרשום ולא מנסחים סביבו — פשוט נוקבים בשני השמות ובשתי הת״זים,
 * והרו״ח הקודם מזהה את התיק בוודאות. הת.ז. של הלקוח היא גם מספר התיק במ"ה.
 */
function releaseClientIdentity(client: Client | undefined | null): {
  taxFileNumber?: string; spouse?: { name: string; idNumber?: string };
} {
  if (!client) return {};
  const spouseName = (client.spouseName?.trim()
    || `${client.spouseFirstName ?? ''} ${client.spouseLastName ?? ''}`.trim());
  const married = client.familyStatus === 'married' && !!spouseName;
  return {
    ...(client.idNumber?.trim() ? { taxFileNumber: client.idNumber.trim() } : {}),
    ...(married
      ? { spouse: { name: spouseName, idNumber: client.spouseIdNumber?.trim() || undefined } }
      : {}),
  };
}

/** יוצר Client חדש עם ערכי ברירת מחדל */
function makeEmptyClient(id: string, partial: Partial<Client> = {}): Client {
  const now = new Date().toISOString();
  return {
    id,
    idNumber: '',
    firstName: '',
    lastName: '',
    birthDate: '',
    gender: 'male',
    phone: '',
    email: '',
    city: '',
    address: '',
    incomeTaxType: 'employee',
    vatStatus: 'none',
    businessDescription: '',
    hasExemptFromWithholding: false,
    niType: 'employee',
    hasTaxCoordination: false,
    taxCoordinationDetails: '',
    familyStatus: 'single',
    spouseName: '',
    spouseIdNumber: '',
    spouseWorking: false,
    spouseIncome: 0,
    spouse: null,
    children: [],
    isNewImmigrant: false,
    aliyahYear: 0,
    isReturningResident: false,
    returningYear: 0,
    disabilityPercentage: 0,
    disabilityType: '',
    hasAcademicDegree: false,
    academicDegreeYear: 0,
    academicDegreeType: '',
    completedIdf: false,
    idfReleaseYear: 0,
    completedNationalService: false,
    nationalServiceYear: 0,
    qualifyingSettlementId: '',
    qualifyingSettlementOverride: false,
    qualifyingSettlementCreditPoints: 0,
    hasResidentialProperty: false,
    propertyAddress: '',
    numberOfProperties: 0,
    hasPension: false,
    pensionFundName: '',
    employeePensionPct: 0,
    employerPensionPct: 0,
    hasKupotGemel: false,
    hasKrenHashtalmut: false,
    krenHashtalmutMonthly: 0,
    notes: '',
    createdAt: now,
    updatedAt: now,
    ...partial,
  };
}

/** מוסכמת שמות קבצים: "שם_משפחה שם_פרטי סוג מסמך.ext" */
function standardFileName(lastName: string, firstName: string, docLabel: string, originalName: string): string {
  const ext = (originalName.split('.').pop() || '').toLowerCase();
  // נקיון תווים בעייתיים
  const clean = (s: string) => s.replace(/[\\/:*?"<>|]/g, '').trim();
  const ln = clean(lastName) || 'לקוח';
  const fn = clean(firstName);
  const label = clean(docLabel);
  const baseName = [ln, fn, label].filter(Boolean).join(' ');
  return ext ? `${baseName}.${ext}` : baseName;
}

export default function App() {
  // דפי בדיקה של עורך החתימה — פיתוח בלבד. מקומפלים החוצה מהאתר החי.
  if (import.meta.env.DEV && typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('test-sig')) {
    return <TestSignaturePage />;
  }
  if (import.meta.env.DEV && typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('test-signroom')) {
    return <TestSigningRoom />;
  }
  if (import.meta.env.DEV && typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('test-exec')) {
    return <TestExecutionCenter />;
  }
  if (import.meta.env.DEV && typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('test-repdocs')) {
    return <TestRepDocs />;
  }
  if (import.meta.env.DEV && typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('test-onboarding')) {
    return <TestOnboarding />;
  }
  if (import.meta.env.DEV && typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('test-journeyball')) {
    return <TestJourneyBall />;
  }
  if (import.meta.env.DEV && typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('test-journey')) {
    return <TestJourney />;
  }
  if (import.meta.env.DEV && typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('test-institutions')) {
    return <TestInstitutions />;
  }
  if (import.meta.env.DEV && typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('test-taxfile')) {
    return <TestTaxFileV6 />;
  }
  if (import.meta.env.DEV && typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('test-alignment-status')) {
    return <TestAlignmentStatus />;
  }
  if (import.meta.env.DEV && typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('test-portal-preview')) {
    return <TestPortalPreview />;
  }
  if (import.meta.env.DEV && typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('test-case')) {
    return <TestCaseComposer />;
  }
  if (import.meta.env.DEV && typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('test-quotations')) {
    return <TestQuotations />;
  }
  if (import.meta.env.DEV && typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('test-deferred')) {
    return <TestDeferred />;
  }
  if (import.meta.env.DEV && typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('test-agreement')) {
    return <TestAgreement />;
  }
  if (import.meta.env.DEV && typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('test-builder')) {
    return <TestBuilder />;
  }
  if (import.meta.env.DEV && typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('test-signdone')) {
    return <TestSignDone />;
  }
  if (import.meta.env.DEV && typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('test-firm-notifications')) {
    return <TestFirmNotifications />;
  }
  if (import.meta.env.DEV && typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('test-repdialog')) {
    return <TestRepDialog />;
  }
  if (import.meta.env.DEV && typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('test-spouselink')) {
    return <TestSpouseLink />;
  }
  if (import.meta.env.DEV && typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('test-addrequest')) {
    return <TestAddRequestDialog />;
  }
  if (import.meta.env.DEV && typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('test-regspouse')) {
    return <TestRegisteredSpouse />;
  }
  if (import.meta.env.DEV && typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('test-poastamp')) {
    return <TestPoaStamp />;
  }
  // עמוד הזדהות ציבורי ללקוח — נטען ללא התחברות לפי טוקן.
  if (typeof window !== 'undefined') {
    // הדפים שהלקוח רואה נשארים תמיד בהירים — הם נושאים את מיתוג המשרד,
    // נשלחים במייל ולעיתים מודפסים. מצב כהה הוא העדפה פנימית של המשרד בלבד.
    const asClientPage = (node: JSX.Element) => (
      <div className="pivo-light public-page-shell">{node}</div>
    );
    const onboardToken = new URLSearchParams(window.location.search).get('onboard');
    if (onboardToken) return asClientPage(<OnboardingPage token={onboardToken} />);

    // הדף של בן/בת הזוג — נולד מ"אין לי מושג" שבטופס הקליטה (149)
    const spouseFillToken = new URLSearchParams(window.location.search).get('spousefill');
    if (spouseFillToken) return asClientPage(<SpouseFillPage token={spouseFillToken} />);
    // עמוד חתימה ציבורי — קישור אישי לכל חותם (נישום / בן זוג).
    const signToken = new URLSearchParams(window.location.search).get('sign');
    if (signToken) return asClientPage(<PublicSignPage token={signToken} />);
    // שאלון עצמאי — נשלח יזום מכרטיס הלקוח, בלי הליך ייצוג.
    const intakeToken = new URLSearchParams(window.location.search).get('intake');
    if (intakeToken) return asClientPage(<PublicIntakePage token={intakeToken} />);
    // הדף האישי — קישור אחד קבוע לכל תקופת הקליטה, תמיד מציג את המצב העדכני.
    const portalToken = new URLSearchParams(window.location.search).get('portal');
    if (portalToken) return asClientPage(<PublicPortalPage token={portalToken} />);
    // עמוד הצעת מחיר ציבורי — קישור מאובטח לפי טוקן.
    const quoteToken = new URLSearchParams(window.location.search).get('quote');
    if (quoteToken) return asClientPage(<PublicQuotationPage token={quoteToken} />);
    // דף הרו"ח הקודם — הוא חותם על מכתב השחרור ומעלה את החומרים.
    // גורם חיצוני ולא לקוח, אבל אותו כלל: מיתוג המשרד ותצוגה בהירה.
    const releaseToken = new URLSearchParams(window.location.search).get('release');
    if (releaseToken) return asClientPage(<PublicReleasePage token={releaseToken} />);
    // קישור המילוי הציבורי הקבוע של המשרד — "+ אדם חדש → שליחת קישור למילוי פרטים".
    const applyToken = new URLSearchParams(window.location.search).get('apply');
    if (applyToken) return asClientPage(<PublicApplyPage token={applyToken} />);
  }

  const { user, loading: authLoading, authorized, displayName, avatarUrl, signOut } = useAuth();

  const { clients, addClient, updateClient, deleteClient: removeClient, bulkAddClients, setClientLifecycleStage, applyClientLocally, refreshClient, refreshClients } = useClients(user?.id);
  const { tasks, loading: tasksLoading, addTask, updateTask, bulkUpdateTasks, deleteTask: removeTask, bulkAddTasks, reloadTasks } = useTasks(user?.id);

  // בתחילת כל רבעון (ינואר/אפריל/יולי/אוקטובר) נוצרת אוטומטית משימת בדיקת
  // עדכניות של מרכז הידע — פעם אחת לרבעון (זיהוי לפי תגית בכותרת + נעילת מודול
  // נגד ההרכבה הכפולה של StrictMode + אינדקס ייחודי במסד כרשת אחרונה).
  //
  // ‼ ב-DEV עם VITE_DEV_BYPASS_AUTHZ=true הרשימה מוזרקת מנתוני דוגמה ואינה
  // נטענת מהמסד, ולכן הבדיקה כאן לא רואה את משימת הרבעון האמיתית והניסיון
  // יוצא. אז האינדקס הייחודי (tasks_system_unique_title, מיגרציה 22) דוחה
  // אותו וב-console מופיע `POST /rest/v1/tasks → 409`. זו הרשת האחרונה
  // עושה את עבודתה: שום שורה לא נכתבת, השגיאה נבלעת ב-catch, והניסיון
  // יחזור בכניסה הבאה. רעש של סביבת הפיתוח בלבד — לא באג בפרודקשן.
  useEffect(() => {
    if (!user || tasksLoading) return;
    if (quarterlyTaskExists(tasks)) return;
    if (!markFreshnessCreationAttempted()) return;
    void addTask(buildQuarterlyFreshnessTask()).catch(() => { /* ניסיון חוזר בכניסה הבאה */ });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, tasksLoading]);
  const { requests, addRequest, updateRequest, deleteRequest: removeRequest } = useRepresentationRequests(user?.id);
  const { profile: firmProfile, saveProfile } = useFirmProfile(user?.id);
  // ‼ ברירת המחדל דלוקה: הנתונים כבר במסד, והדגל קיים כדי לכבות את המסך
  // (לשונית הקליטה + המקטע בשולחן) בלי שינוי קוד — settings.flags.onboardingTab=false.
  const onboardingEnabled =
    ((firmProfile?.settings?.flags as { onboardingTab?: boolean } | undefined)?.onboardingTab) !== false;
  // ‼ מתג החזרה של מהלך "המסע הוא הכרטיס": כבוי ⇒ הניווט הישן (3 טאבים) וחמש
  // לשוניות הכרטיס חוזרים במלואם. שום נתון לא תלוי בו — הוא תצוגה בלבד.
  const journeyUi =
    ((firmProfile?.settings?.flags as { journeyUi?: boolean } | undefined)?.journeyUi) !== false;
  // ‼ מתג החירום של ספריית האנשים (Customers V3.3): כבוי ⇒ מסך הלקוחות הישן
  // (ClientList) חוזר במלואו. תצוגה בלבד, שום נתון לא תלוי בו. יוסר בשלב הניקוי.
  const personDirectory =
    ((firmProfile?.settings?.flags as { personDirectory?: boolean } | undefined)?.personDirectory) !== false;
  // ‼ סקאפולד זמני ליסוד האוטומציה (docs/PIVO-AUTOMATION-FOUNDATION.html):
  // דלוק במפורש בלבד, לא ברירת מחדל כמו הדגלים שמעליו — זה מרכז עבודה של
  // פיתוח, לא יכולת מוצר מוגמרת. ראה src/components/clientTabs/ChecksTab.tsx.
  const checksTab =
    ((firmProfile?.settings?.flags as { checksTab?: boolean } | undefined)?.checksTab) === true;
  const onboarding = useOnboarding(onboardingEnabled ? user?.id : undefined);
  /** קבצים שהרו״ח הקודם שלח ושעוד לא נפתחו — המונה בכותרת. */
  const newUploadsByClient = useMemo(
    () => unseenUploadsByClient(onboarding.steps), [onboarding.steps]);
  const newUploadsTotal = useMemo(() => {
    let total = 0;
    for (const count of newUploadsByClient.values()) total += count;
    return total;
  }, [newUploadsByClient]);
  const [inboxOpen, setInboxOpen] = useState(false);
  const { leads, addLead, updateLead, deleteLead, refreshLeads } = useLeads(user?.id);
  // כרטיס לקוח ↔ הליד שממנו הוא בא. שורה בשלב "ליד" במסך הלקוחות מובילה לשם.
  const leadIdByClient = useMemo(() => {
    const map = new Map<string, string>();
    for (const l of leads) if (l.convertedClientId) map.set(l.convertedClientId, l.id);
    return map;
  }, [leads]);
  const { quotations, addQuotation, updateQuotation, cancelQuotation, deleteQuotation, refreshQuotations } = useQuotations(user?.id);
  const { charges, addCharge, replaceCharge, markChargePaid } = useCharges(user?.id);
  const { services: catalogServices, templates: quotationTemplates } = useQuotationCatalog(user?.id);
  const failedNotifications = useFailedNotifications(user?.id);

  /**
   * ‼ כל מה שהלקוח עושה בדף האישי שלו — פותח הצעה, מאשר וחותם, משיב לבקשה —
   * נכתב בשרת ולא עובר דרך המסך הזה. בלי הפעימה, מסך פתוח היה ממשיך להציג
   * "נשלחה · ממתין לתשובה" אחרי שההצעה כבר אושרה, וזו בדיוק הסתירה שהמוצר
   * הזה בא למנוע. ארבע המשיכות יחד, כי שלב הלקוח נגזר בשרת מתוך ההצעה —
   * משיכת ההצעה בלי הכרטיס הייתה יוצרת סתירה חדשה במקום לסגור אחת.
   */
  const onboardingRefresh = onboarding.refresh;
  const pulseRefreshers = useMemo(
    () => [
      refreshQuotations,
      refreshClients,
      refreshLeads,
      () => onboardingRefresh({ silent: true }),
    ],
    [refreshQuotations, refreshClients, refreshLeads, onboardingRefresh],
  );
  useLivePulse(!!user?.id && authorized === true, pulseRefreshers);

  /**
   * רשת הביטחון של התראות ההתקדמות. השרת רושם כל אירוע אצל הלקוח (חתימה על
   * הצעה, מילוי פרטי ייצוג, חתימה על ייפוי כוח) בתור, והדפדפן של הלקוח מבקש
   * לרוקן אותו מיד. לקוח שסגר את החלון באותה שנייה משאיר את ההתראה בתור —
   * וכאן היא נשלחת. רץ פעם אחת בכל טעינה, ואינו חוסם כלום.
   */
  const notifyFlushed = useRef(false);
  useEffect(() => {
    if (!user || !authorized || notifyFlushed.current) return;
    notifyFlushed.current = true;
    void supabase.functions.invoke('notify-accountant', { body: {} });
  }, [user, authorized]);

  /**
   * מה שנשאר פתוח אחרי אישור הצעה: הפקת הסכם ההתקשרות (PDF). אידמפוטנטי.
   *
   * ‼ מייל הייצוג כבר **לא נשלח מכאן**. עד 2026-08-07 ישב כאן אפקט שבדק אם
   * חלפו 24 שעות מהאישור בלי שהקישור יצא — ואם כן, שלח מייל **ללקוח** מתוך
   * הדפדפן של גיא. המשמעות: לקוח שאישר בשישי בערב חיכה לקישור עד שגיא נכנס
   * למערכת. הכרעת גיא D1 העבירה את השליחה לשרת: `approve_quotation` מפעילה
   * אותה מיד עם האישור (מיגרציה 72), בלי תלות בדפדפן של אף אחד.
   *
   * ‼ מה שקרה כאן הפך להתראה פנימית בלבד: `flag_missing_representation_links`
   * מסמנת הצעה שאושרה לפני יותר מיממה והקישור לא יצא, וגיא מקבל התראה
   * (`representation_link_missing`). **אף מייל ללקוח אינו יוצא ממנגנון 24
   * השעות יותר.** ראה docs/EMAIL-POLICY.md.
   */
  const contractSaved = useRef(new Set<string>());
  useEffect(() => {
    if (!user) return;
    for (const q of quotations) {
      if (q.status !== 'approved' || !q.representationRequestId) continue;
      if (q.clientId && !contractSaved.current.has(q.id)) {
        contractSaved.current.add(q.id);
        void saveEngagementContract(q, q.clientId);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, quotations]);

  const { theme, toggleTheme } = useTheme();
  // המסך שבו נמצאים נקרא מהכתובת, כדי שרענון (F5) יחזיר לאותו מקום
  const initialRoute = useRef(parseHash(window.location.hash)).current;
  const [view, setView] = useState<View>(initialRoute.view);
  /** סינון מסך המשימות ללקוח מסוים — מגיע מהקיצור בכרטיס הלקוח. */
  const [tasksClientFilter, setTasksClientFilter] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(initialRoute.clientId ?? null);
  const [selectedRequestId, setSelectedRequestId] = useState<string | null>(initialRoute.requestId ?? null);
  // התצוגה המהירה במסך הלקוחות — חיה בכתובת (#/clients/p/{id}) כדי ש"אחורה" יסגור
  const [quickViewId, setQuickViewId] = useState<string | null>(initialRoute.quickId ?? null);
  // לשונית הפתיחה של כרטיס הלקוח — נקבעת רק כשהגיעו אליו בשביל דבר מסוים
  const [clientInitialTab, setClientInitialTab] = useState<ClientTabId | undefined>(
    initialRoute.clientTab as ClientTabId | undefined
  );
  const [editingQuotationId, setEditingQuotationId] = useState<string | null>(initialRoute.quotationId ?? null);
  // ליד שהגיעו אליו מחיפוש במסך הלקוחות — מסך הלידים נפתח עליו
  const [focusLeadId, setFocusLeadId] = useState<string | null>(null);
  const [openNewLead, setOpenNewLead] = useState(false);
  const [newQuotationLeadId, setNewQuotationLeadId] = useState<string | null>(null);
  // הצעה חדשה שנפתחה מ"אדם חדש" (שלב 3) או מ"שירות נוסף" ללקוח קיים
  const [newQuotationClientId, setNewQuotationClientId] = useState<string | null>(null);
  const [newQuotationKind, setNewQuotationKind] = useState<QuotationKind>('engagement');
  const [convertingQuotation, setConvertingQuotation] = useState<Quotation | null>(null);
  // הכרטיס שההצעה זה עתה נשלחה אליו — היעד שאליו הבונה סוגר את עצמו (§"הכפתור
  // ששולח הוא הכפתור שמסיים"). בלי זה הבונה חזר למסך ההצעות הישן, שכבר אינו
  // חלק מהמבנה.
  // ‼ ref ולא state: הבונה קורא ל-onBack מתוך setTimeout, ולכן הוא מחזיק את
  // הפונקציה מהרנדר שבו נלחץ "שליחה" — לפני שהיעד נקבע. state היה נקרא שם ריק
  // והנחיתה הייתה נופלת בחזרה לרשימת הלקוחות.
  const postSendClientId = useRef<string | null>(null);
  // תצוגה מקדימה של מייל תזכורת להצעה — נפתחת לפני כל שליחה חוזרת
  const [remindPreview, setRemindPreview] = useState<{ quotation: Quotation; subject: string; to: string; html: string } | null>(null);
  // מכתב שחרור לרו"ח הקודם. stepId מגיע כשפתחו אותו משלב הקליטה — אחרי
  // שליחה מוצלחת השלב עובר ל"נשלח" והכדור עובר לרו"ח הקודם.
  const [releaseFor, setReleaseFor] = useState<{
    clientId: string; clientName: string; clientEmail?: string;
    taxFileNumber?: string; spouse?: { name: string; idNumber?: string };
    prevAccountant: { name?: string; email?: string; phone?: string };
    stepId: string;
    /** 'follow_up' — פריטים שנוספו אחרי השליחה, על אותו מסלול ואותו קישור. */
    mode: 'letter' | 'follow_up';
    followUpItems: { key: string; label: string }[];
  } | null>(null);
  /** תזכורת שהוכנה לשלב תקוע — נפתחת לעריכה, נשלחת רק בלחיצה. */
  const [taskModalState, setTaskModalState] = useState<{ task: Task | null; presetClientId?: string | null; presetTitle?: string } | null>(null);
  const [showNewPerson, setShowNewPerson] = useState(false);
  const [showOnboarding, setShowOnboarding] = useState(false);
  // "התחלת ייצוג ללא הצעה" משלב 3: האדם כבר נוצר, והדיאלוג נפתח מצומד אליו —
  // בשונה מ-showOnboarding (שם עדיין נוצר אדם חדש בתוך הדיאלוג עצמו).
  const [pendingRepresentationClient, setPendingRepresentationClient] = useState<Client | null>(null);
  // "המשך טיפול" בליד שהגיע מקישור המילוי הציבורי (שלב 4) — פותח את בורר
  // המסלול ממולא מראש, בלי לאסוף פרטים מחדש (הם כבר על הליד).
  const [continuationLead, setContinuationLead] = useState<Lead | null>(null);
  // בחירה מוקדמת לדוח השנתי (מתוך "פתח ←" בתמונת המס של הכרטיס)
  const [annualReportSelection, setAnnualReportSelection] = useState<{ clientId: string; taxYear: number } | null>(
    initialRoute.annualClientId && initialRoute.annualTaxYear
      ? { clientId: initialRoute.annualClientId, taxYear: initialRoute.annualTaxYear }
      : null
  );
  // ‼ עותק שני של אותה בחירה, רק בשביל הכתובת. המסך "צורך" את הבחירה שלמעלה
  // ומאפס אותה מיד — ובלי העותק הזה הכתובת הייתה מאבדת את הלקוח והשנה.
  const [annualRoute, setAnnualRoute] = useState<{ clientId: string; taxYear: number } | null>(
    initialRoute.annualClientId && initialRoute.annualTaxYear
      ? { clientId: initialRoute.annualClientId, taxYear: initialRoute.annualTaxYear }
      : null
  );
  // תפריט החשבון נפתח מהאווטאר — כדי ש"המשרד" ו"התנתק" לא יתפסו מקום בסרגל
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);
  const db = useDocumentDB();

  // ── הכתובת בשורת הכתובת ↔ המסך שמוצג ──────────────────────────────────────
  // כל מעבר מסך נרשם בהיסטוריית הדפדפן, ולכן "אחורה" חוזר למסך הקודם במערכת
  // במקום לצאת ממנה. הרענון (F5) קורא את הכתובת ומחזיר לאותו מקום.
  const currentPath = formatRoute({
    view,
    clientId: selectedId ?? undefined,
    clientTab: clientInitialTab,
    quickId: view === 'list' ? quickViewId ?? undefined : undefined,
    requestId: selectedRequestId ?? undefined,
    quotationId: editingQuotationId ?? undefined,
    annualClientId: annualRoute?.clientId,
    annualTaxYear: annualRoute?.taxYear,
  });
  const syncedPath = useRef<string | null>(null);

  useEffect(() => {
    if (syncedPath.current === currentPath) return;
    const first = syncedPath.current === null;
    syncedPath.current = currentPath;
    // הכניסה הראשונה מחליפה את הרשומה הקיימת; משם והלאה כל מסך הוא צעד חדש
    window.history[first ? 'replaceState' : 'pushState'](null, '', '#' + currentPath);
  }, [currentPath]);

  useEffect(() => {
    function onPop() {
      const route = parseHash(window.location.hash);
      // ‼ מסמנים כמסונכרן לפני העדכון, אחרת האפקט שלמעלה היה דוחף את אותו
      // מסך שוב להיסטוריה ו"אחורה" היה נתקע במקום
      syncedPath.current = formatRoute(route);
      setView(route.view);
      setSelectedId(route.clientId ?? null);
      setClientInitialTab(route.clientTab as ClientTabId | undefined);
      setQuickViewId(route.quickId ?? null);
      setSelectedRequestId(route.requestId ?? null);
      setEditingQuotationId(route.quotationId ?? null);
      setAnnualRoute(
        route.annualClientId && route.annualTaxYear
          ? { clientId: route.annualClientId, taxYear: route.annualTaxYear }
          : null
      );
      setAnnualReportSelection(
        route.annualClientId && route.annualTaxYear
          ? { clientId: route.annualClientId, taxYear: route.annualTaxYear }
          : null
      );
    }
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  useEffect(() => {
    if (!accountMenuOpen) return;
    function onDocClick(e: MouseEvent) {
      const target = e.target as Element;
      if (!target.closest('.header-account')) setAccountMenuOpen(false);
    }
    const t = setTimeout(() => document.addEventListener('click', onDocClick), 0);
    return () => { clearTimeout(t); document.removeEventListener('click', onDocClick); };
  }, [accountMenuOpen]);

  // ── ניהול משימות ───────────────────────────────────────────────────────
  async function handleSaveTask(task: Task) {
    const exists = tasks.some(t => t.id === task.id);
    if (exists) {
      await updateTask(task);
    } else {
      await addTask(task);
    }
    setTaskModalState(null);
  }

  async function handleDeleteTask(id: string) {
    await removeTask(id);
    setTaskModalState(null);
  }

  async function handleToggleTaskDone(id: string) {
    const t = tasks.find(x => x.id === id);
    if (!t) return;
    const now = new Date().toISOString();
    const updated: Task = t.status === 'open'
      ? { ...t, status: 'done', completedAt: now }
      : { ...t, status: 'open', progress: t.progress || 'in_progress', completedAt: undefined };
    await updateTask(updated);
  }

  /** שינוי סטטוס ישיר מהלוח — new/in_progress/done */
  async function handleChangeTaskStatus(id: string, status: TaskProgress | 'done') {
    const t = tasks.find(x => x.id === id);
    if (!t) return;
    const now = new Date().toISOString();
    const updated: Task = status === 'done'
      ? { ...t, status: 'done', completedAt: t.completedAt || now }
      : { ...t, status: 'open', progress: status, completedAt: undefined };
    await updateTask(updated);
  }

  async function handleChangeTaskBall(id: string, ball: BallWith) {
    const t = tasks.find(x => x.id === id);
    if (!t) return;
    await updateTask({ ...t, ballWith: ball });
  }

  async function handleChangeTaskCategory(id: string, category: TaskCategory) {
    const t = tasks.find(x => x.id === id);
    if (!t) return;
    await updateTask({ ...t, category });
  }

  /**
   * גרירה ושחרור של משימה:
   * - targetStatus הוא 'new' | 'in_progress' | 'done' (קבוצת היעד)
   * - beforeId = המשימה שאליה נעצור *לפניה* (null = לסוף הקבוצה)
   * משנה גם סטטוס (אם לא תואם) וגם sortOrder של משימות באותה קבוצה.
   */
  async function handleReorderTask(id: string, targetStatus: TaskProgress | 'done', beforeId: string | null) {
    const moving = tasks.find(t => t.id === id);
    if (!moving) return;
    const now = new Date().toISOString();

    const updatedMoving: Task = targetStatus === 'done'
      ? { ...moving, status: 'done', completedAt: moving.completedAt || now }
      : { ...moving, status: 'open', progress: targetStatus, completedAt: undefined };

    const inGroup = tasks
      .filter(t => t.id !== id)
      .filter(t => {
        if (targetStatus === 'done') return t.status === 'done';
        return t.status === 'open' && (t.progress || 'new') === targetStatus;
      })
      .sort((a, b) => {
        const ao = a.sortOrder, bo = b.sortOrder;
        if (ao !== undefined && bo !== undefined) return ao - bo;
        if (ao !== undefined) return -1;
        if (bo !== undefined) return 1;
        return a.createdAt.localeCompare(b.createdAt);
      });

    const idx = beforeId === null ? inGroup.length : inGroup.findIndex(t => t.id === beforeId);
    const insertAt = idx === -1 ? inGroup.length : idx;
    const nextGroup = [...inGroup.slice(0, insertAt), updatedMoving, ...inGroup.slice(insertAt)];

    const updates: Task[] = nextGroup.map((t, i) => ({ ...t, sortOrder: (i + 1) * 10 }));
    await bulkUpdateTasks(updates);
  }

  /**
   * גרירה/הזזה במסך המשימות החדש (M3, שלושה דליים) — רשימה שטוחה אחת של כל
   * המשימות הפתוחות, בלי חלוקת new/in_progress כמו הלוח הישן. תאריך שהגיע
   * מוצג למעלה בתצוגה (ordered() בצד הלקוח) אבל אינו כותב סדר קבוע —
   * ראה docs/prototypes/tasks-v3-final.html.
   */
  async function handleReorderOpenTask(id: string, beforeId: string | null) {
    const moving = tasks.find(t => t.id === id);
    if (!moving) return;
    const openList = tasks
      .filter(t => t.id !== id && t.status === 'open')
      .sort((a, b) => {
        const ao = a.sortOrder, bo = b.sortOrder;
        if (ao !== undefined && bo !== undefined) return ao - bo;
        if (ao !== undefined) return -1;
        if (bo !== undefined) return 1;
        return a.createdAt.localeCompare(b.createdAt);
      });
    const idx = beforeId === null ? openList.length : openList.findIndex(t => t.id === beforeId);
    const insertAt = idx === -1 ? openList.length : idx;
    const updatedMoving: Task = { ...moving, status: 'open' };
    const next = [...openList.slice(0, insertAt), updatedMoving, ...openList.slice(insertAt)];
    const updates: Task[] = next.map((t, i) => ({ ...t, sortOrder: (i + 1) * 10 }));
    await bulkUpdateTasks(updates);
  }

  function openNewTaskModal(presetClientId?: string, presetTitle?: string) {
    setTaskModalState({ task: null, presetClientId, presetTitle });
  }

  function openEditTaskModal(id: string) {
    const task = tasks.find(t => t.id === id);
    if (task) setTaskModalState({ task });
  }

  const selectedClient = selectedId ? clients.find(c => c.id === selectedId) ?? null : null;
  const selectedRequest = selectedRequestId ? requests.find(r => r.id === selectedRequestId) ?? null : null;

  function handleSelectClient(id: string) {
    setSelectedId(id);
    setClientInitialTab(undefined);
    setView('form');
  }

  /** כרטיס הלקוח ישר על לשונית הקליטה — מהמקטע "ממתינים לאישורך". */
  function handleOpenClientOnboarding(clientId: string) {
    setSelectedId(clientId);
    setClientInitialTab('onboarding');
    setView('form');
  }

  // ‼ handleRemindStep ("הכן תזכורת" ישירות מהשולחן) הוסר ב-M3: ברפרנס המאושר
  // שורת משימה אינה נושאת כפתורי פעולה, והשורה הנגזרת של הקליטה מובילה
  // ללשונית הקליטה — ששם הכפתור הזה חי ממילא (OnboardingTab), כולל המסלול
  // הנפרד של מכתב שחרור לרו״ח הקודם. הדיאלוג שהיה תלוי בו הוסר איתו.

  /**
   * ממסך הקליטה של הלקוח למרכז הייצוג שלו. הבקשה נמצאת דרך הכרטיס, ואם
   * הקישור שם ריק (לקוחות ותיקים) — דרך הבקשה שמצביעה על הלקוח.
   */
  function handleOpenClientRepresentation(clientId: string) {
    const c = clients.find(x => x.id === clientId);
    const reqId = c?.representationRequestId
      ?? requests.find(r => r.linkedClientId === clientId)?.id;
    if (reqId) handleSelectRequest(reqId);
  }

  /**
   * מהמונה שבכותרת אל הבקשה עצמה — לא אל תיק המסמכים.
   * ‼ שם יושבת המגירה, ופתיחתה היא מה שמסמן "נצפה". ניווט לתיק המסמכים היה
   * מציג את הקבצים ומשאיר את המונה דלוק לנצח, כי איש לא אישר שראה אותם.
   */
  function handleOpenPrevAccountantMaterials(clientId: string) {
    setClientInitialTab(journeyUi ? 'journey' : 'onboarding');
    setSelectedId(clientId);
    setView('form');
  }

  /** כרטיס הלקוח ישר על המסמכים — מהמסך של בקשת הייצוג. */
  function handleOpenClientDocs(clientId: string) {
    setSelectedId(clientId);
    setClientInitialTab('docs');
    setView('form');
  }

  function handleAddNew() {
    setShowNewPerson(true);
  }

  /**
   * ‼ נקודת היצירה היחידה של אדם משלב 3. נקראת רק אחרי שנבחר מסלול
   * ("שליחת הצעת מחיר" / "התחלת ייצוג ללא הצעה") — לא אחרי מילוי הפרטים.
   * ביטול הדיאלוג לפני שנבחר מסלול לא מגיע לכאן כלל, ולכן אינו יוצר כלום.
   */
  async function createPersonFromBasics(basics: NewPersonBasics): Promise<Client> {
    // ‼ אישר לקשר כבן/בת זוג (duplicateCheck.ts kind:'spouse_of') — מזרעים
    // מהנתונים שכבר קיימים על הכרטיס השני, כדי שלא יוקלדו פעם שנייה, ואת
    // הקישור עצמו כותבים לשני הכיוונים באותה פעולה. הפרטים שהרו"ח הקליד
    // כרגע (basics) גוברים על מה שנזרע — הוא הקלד אותם עכשיו במפורש.
    const owner = basics.linkSpouseClientId ? clients.find(c => c.id === basics.linkSpouseClientId) : undefined;
    const seed = owner ? seedClientFromEmbeddedSpouse(owner) : {};
    const draft = makeEmptyClient(crypto.randomUUID(), {
      ...seed,
      firstName: basics.firstName,
      lastName: basics.lastName,
      idNumber: basics.idNumber,
      phone: basics.phone,
      email: basics.email,
    });
    const created = await addClient(draft);
    if (owner) {
      await updateClient({ ...owner, spouseClientId: created.id });
    }
    return created;
  }

  /**
   * "לבן/בת הזוג יש עסק? פתיחת כרטיס לקוח" — מהאזור האישי של כרטיס קיים,
   * לא דרך "+ אדם חדש". הזהות כבר ודאית (זו קשר בן-זוג קיים על `owner`),
   * ולכן אין כאן שום בדיקת התאמת ת.ז. — רק זריעה וקישור דו-כיווני, באותו
   * דפוס בדיוק כמו ה-owner ב-createPersonFromBasics, בלי דיאלוג ביניים.
   */
  async function handleCreateClientFromSpouse(owner: Client) {
    const seed = seedClientFromEmbeddedSpouse(owner);
    const draft = makeEmptyClient(crypto.randomUUID(), seed);
    const created = await addClient(draft);
    await updateClient({ ...owner, spouseClientId: created.id });
    handleSelectClient(created.id);
  }

  async function handleConfirmNewPersonQuote(basics: NewPersonBasics) {
    const client = await createPersonFromBasics(basics);
    setShowNewPerson(false);
    handleNewQuotationForClient(client.id);
  }

  async function handleConfirmNewPersonRepresentation(basics: NewPersonBasics) {
    const client = await createPersonFromBasics(basics);
    setShowNewPerson(false);
    setPendingRepresentationClient(client);
  }

  /** מנפק/מחזיר את קישור המילוי הציבורי הקבוע של המשרד (שלב 4). */
  async function mintApplyLink(rotate: boolean): Promise<string | null> {
    const { data, error } = await supabase.rpc('mint_apply_token', { p_rotate: rotate });
    if (error) throw new Error(error.message);
    return (data as string) ?? null;
  }

  /**
   * שולח את קישור המילוי הציבורי במייל לנמען שהרו"ח מזין. ‼ אינה יוצרת שום
   * ליד — האימייל כאן הוא כתובת משלוח בלבד, לא זיהוי אדם. הליד נוצר רק כשמישהו
   * שולח בפועל את הטופס הציבורי, ולכן אפשר לשלוח את אותו קישור כמה פעמים.
   */
  async function sendApplyLinkEmail(token: string, recipientEmail: string): Promise<void> {
    const { data, error } = await supabase.functions.invoke('send-apply-link-email', {
      body: { token, recipientEmail },
    });
    if (error || !data?.ok) throw new Error(error?.message || data?.error || 'שליחת המייל נכשלה');
  }

  /**
   * שולח דרישת תשלום עבור חיוב נוסף. ‼ אין אינטגרציית סליקה — הפונקציה רק
   * שולחת מייל ומסמנת שהבקשה יצאה; היא לעולם לא מסמנת "שולם".
   */
  async function requestChargePayment(charge: AdditionalCharge): Promise<void> {
    const { data, error } = await supabase.functions.invoke('send-charge-payment-request-email', {
      body: { chargeId: charge.id },
    });
    if (error || !data?.ok) {
      throw new Error(error?.message || data?.error || 'שליחת דרישת התשלום נכשלה');
    }
    replaceCharge({ ...charge, status: 'requested', requestedAt: data.requestedAt as string });
  }

  /**
   * "המשך טיפול" בליד מקישור המילוי הציבורי — פותח את אותו בורר מסלול משלב 3,
   * ממולא מראש משם/מייל הליד. הליד עצמו כבר קיים; אין כאן איסוף פרטים חדש.
   */
  function handleContinueLead(lead: Lead) {
    setContinuationLead(lead);
  }

  async function handleContinueLeadQuote(lead: Lead) {
    setContinuationLead(null);
    handleNewQuotationForLead(lead);
  }

  /**
   * ‼ הליד מסומן converted רק אחרי שהכרטיס נוצר בהצלחה — כדי שכישלון ביצירה
   * לא ישאיר ליד "גמור" בלי אדם שמאחוריו.
   */
  async function handleContinueLeadRepresentation(lead: Lead, basics: NewPersonBasics) {
    const client = await createPersonFromBasics(basics);
    await updateLead({ ...lead, status: 'converted', convertedClientId: client.id });
    setContinuationLead(null);
    setPendingRepresentationClient(client);
  }

  async function handleSave(client: Client) {
    const exists = clients.some(c => c.id === client.id);
    if (exists) {
      await updateClient(client);
    } else {
      await addClient(client);
    }
    setSelectedId(client.id);
    setView('form');
  }

  async function handleDelete(id: string) {
    const client = clients.find(c => c.id === id);
    if (client?.representationRequestId) {
      try { await removeRequest(client.representationRequestId); } catch { /* ignore */ }
    }
    // ‼ מחיקת הקבצים היא לכל לקוח, ולא רק למי שיש לו בקשת ייצוג ישנה. המסד מוחק
    // בגרירה את *שורות* המסמכים, אבל הקבצים עצמם יושבים ב-storage ואף אחד לא
    // נוגע בהם — כך נשארו באחסון ייפויי כוח חתומים של לקוחות שנמחקו. ממתינים
    // ולא שולחים "לדרך": הרענון שבסוף היה קוטע את המחיקה באמצע.
    try {
      const docs = await db.getDocsByClient(id);
      await Promise.all(docs.map(d => db.deleteDoc(d.id)));
    } catch { /* ignore */ }
    await removeClient(id);
    // ‼ טעינה מחדש מלאה, ולא רק ניקוי הרשימה. המסד מוחק בגרירה גם משימות,
    // מסמכים, התקשרות ושלבי קליטה — וכל אחד מהם יושב בזיכרון של מסך אחר.
    // ניקוי ידני של כולם היה משאיר תמיד עוד אחד מאחור (כמו שלבי הקליטה
    // שנשארו מוצגים תחת השם "לקוח"). הכתובת נקבעת לפני הרענון כדי לנחות
    // ברשימת הלקוחות ולא בכרטיס שכבר לא קיים.
    window.location.hash = formatRoute({ view: 'list' });
    window.location.reload();
  }

  async function handleApplyExtractedData(data: ExtractedClientData) {
    if (!selectedId) return;
    const c = clients.find(x => x.id === selectedId);
    if (!c) return;
    const updated: Client = { ...c };
    if (data.firstName) updated.firstName = data.firstName;
    if (data.lastName) updated.lastName = data.lastName;
    if (data.idNumber) updated.idNumber = data.idNumber;
    if (data.birthDate) updated.birthDate = data.birthDate;
    if (data.gender) updated.gender = data.gender;
    if (data.phone) updated.phone = data.phone;
    if (data.email) updated.email = data.email;
    if (data.city) updated.city = data.city;
    if (data.address) updated.address = data.address;
    await updateClient(updated);
    setView('form');
  }

  function handleCancelForm() {
    setView('list');
    setSelectedId(null);
  }

  async function handleLoadSamples() {
    const existingIds = new Set(clients.map(c => c.id));
    const enriched = enrichClientsWithWorkspace(SAMPLE_CLIENTS);
    const newSamples = enriched.filter(s => !existingIds.has(s.id));
    if (newSamples.length === 0) return;
    await bulkAddClients(newSamples);
  }

  async function handleLoadSampleTasks() {
    const existing = new Set(tasks.map(t => t.id));
    const toAdd = SAMPLE_TASKS.filter(t => !existing.has(t.id));
    if (toAdd.length === 0) return;
    await bulkAddTasks(toAdd);
  }

  // ─── Representation requests ───────────────────────────────────────────────

  function handleAddRequest() {
    setShowOnboarding(true);
  }

  /**
   * ‼ זהות מבוססת מייל: מייל הוא פרט קשר, לא זיהוי אדם. שני אנשים שונים
   * (למשל אחים) יכולים לחלוק מייל לגיטימית — ולכן ההתנגשות הזו היא אזהרה
   * שקטה בלבד, לעולם לא חוסמת יצירה/שמירה. ת"ז תקפה היא סמן הזהות היחיד
   * שחוסם (ראה duplicateCheck.ts).
   *
   * ‼ excludeClientId — שלב 3, "התחלת ייצוג ללא הצעה": האדם שאליו מצמידים את
   * הבקשה כבר קיים כרגע (נוצר רגע קודם) ולכן לא אמור "להתנגש" עם עצמו.
   */
  function repEmailConflict(email: string, excludeClientId?: string): { status: RepresentationStatus; name: string } | null {
    const norm = email.trim().toLowerCase();
    if (!norm) return null;
    const client = clients.find(c =>
      c.id !== excludeClientId && (c.email || '').trim().toLowerCase() === norm && !!c.representationStatus);
    if (client) {
      return { status: client.representationStatus!, name: `${client.firstName} ${client.lastName}`.trim() || email.trim() };
    }
    const req = requests.find(r =>
      r.linkedClientId !== excludeClientId && (r.clientEmail || '').trim().toLowerCase() === norm);
    if (req) return { status: req.status, name: req.clientName || email.trim() };
    return null;
  }

  /** הודעה מייעצת (לא חוסמת) להצגה כשמייל כבר משויך לאדם אחר במערכת. */
  function repEmailConflictMessage(email: string, excludeClientId?: string): string | null {
    const c = repEmailConflict(email, excludeClientId);
    if (!c) return null;
    return `המייל הזה משויך גם ל${c.name} - ${REPRESENTATION_STATUS_LABELS[c.status] ?? 'לקוח פעיל'}. אפשר להמשיך; זה יכול להיות בן משפחה שחולק את אותו מייל.`;
  }

  /**
   * מתקן מיד את שלב מחזור החיים אחרי אירוע שמשנה אותו (ייצוג הוצמד/התקדם),
   * בלי לחכות למשימה הלילית — כדי שהתג במסך הלקוחות יהיה נכון כבר עכשיו.
   */
  async function syncLifecycleStage(clientId: string) {
    try {
      const { data } = await supabase.rpc('refresh_lifecycle_stage_for', { p_client_id: clientId });
      if (typeof data === 'string') await setClientLifecycleStage(clientId, data as LifecycleStage);
    } catch { /* לא חוסם את הפעולה העיקרית — הריצה הלילית תתקן בהמשך */ }
  }

  /**
   * זנב משותף: בקשת ייצוג + מייל, לאחר שכרטיס הלקוח כבר קיים (חדש או ותיק).
   * טופס 2279א'5 (שע"ם) מכסה רק מ"ה/ניכויים/מע"מ — ביטוח לאומי הוא ייצוג
   * נפרד ולכן נשמר רק במרשם הלקוח, לא ברשויות הבקשה.
   */
  async function saveRepresentationRequest(
    clientId: string, reqId: string, data: CreateRepresentationInput,
  ): Promise<{ link: string; emailSent: boolean; emailError?: string; clientId: string }> {
    const { name, email, areas, spouse, prefill, sendEmail } = data;
    const onboardingToken = crypto.randomUUID().replace(/-/g, '');
    const now = new Date().toISOString();
    const selectedKeys = Object.keys(areas) as RepAuthorityKind[];

    // חותמים: הנישום תמיד; בן/בת הזוג נוסף אם ידוע שהלקוח נשוי. לכל חותם טוקן
    // ומצב נפרד. שם/מייל ריקים מתמלאים ב-submit_onboarding_full כשהלקוח ממלא.
    const signers: RepSigner[] = [
      { id: 'client', role: 'client', name: name.trim(), email, signStatus: 'pending', signToken: crypto.randomUUID().replace(/-/g, '') },
    ];
    if (spouse) {
      signers.push({ id: 'spouse', role: 'spouse', name: spouse.name, email: spouse.email, signStatus: 'pending', signToken: crypto.randomUUID().replace(/-/g, '') });
    }

    const shaamAuthorities = selectedKeys.filter(k => k !== 'nationalInsurance') as unknown as AuthorityKind[];
    const request: RepresentationRequest = {
      id: reqId,
      linkedClientId: clientId,
      clientName: name.trim(),
      clientEmail: email,
      authorities: shaamAuthorities,
      requestedDocs: DEFAULT_REQUESTED_DOCS.map(d => ({ ...d })),
      notes: '',
      status: 'pending_fill',
      createdAt: now,
      updatedAt: now,
      submission: null,
      submittedAt: null,
      partB: null,
      signedPdfStoredId: null,
      ocrExtracted: null,
      onboardingToken,
      onboardingStatus: 'pending',
      identification: null,
      onboardingSubmittedAt: null,
      prefill,
      signers,
      // ‼ תמונת ההיקף נכתבת פעם אחת ולא מתעדכנת: היא עונה על "מה ביקשנו ולמי"
      // גם אחרי שהמרשם בכרטיס והתיקים בפועל ימשיכו לזוז. ראה `scope`.
      scope: areas,
    };
    await addRequest(request);

    // ‼ כאן נוצרה משימת "להשלים ייצוג — <שם>". היא ירדה (2026-08-04): מסלול
    // הקליטה כבר מציג את שלב הייצוג ומסנכרן אותו מהשרת, ושתי רשימות לאותה
    // עבודה פירושן שני מקומות לסמן ואחד שנשכח. ראה supabase/45-…sql.

    // שליחת מייל אוטומטית ללקוח (הכל נקרא מ-Firm Profile בצד-שרת). לא חוסם — אם נכשל, הקישור הידני זמין.
    // בלי כתובת מייל מדלגים בשקט: הקישור נשלח בוואטסאפ, וזו אינה תקלה.
    const link = `${window.location.origin}/?onboard=${onboardingToken}`;
    if (!sendEmail) return { link, emailSent: false, clientId };
    let emailSent = false;
    let emailError: string | undefined;
    try {
      // מגבלת זמן — שהחלון לא ייתקע על "יוצר…" אם שרת המייל איטי/לא מגיב.
      // force — שליחה יזומה מהחלון. אין לה מה להתנגש בתביעה האוטומטית של השרת.
      const invoke = supabase.functions.invoke('send-onboarding-email', { body: { requestId: reqId, force: true } });
      const timeout = new Promise<never>((_, reject) => setTimeout(() => reject(new Error('פג הזמן לשליחת המייל')), 12000));
      const { data: res, error } = await Promise.race([invoke, timeout]);
      if (error) emailError = error.message;
      else if (res?.ok) emailSent = true;
      else emailError = res?.detail?.message || res?.error || 'שגיאה לא ידועה';
    } catch (e) {
      emailError = e instanceof Error ? e.message : String(e);
    }
    return { link, emailSent, emailError, clientId };
  }

  /**
   * נקודת הכניסה הוותיקה לייצוג ("+ בקשת ייצוג"): הרו"ח בוחר רשויות ומקבל
   * קישור לשליחה בוואטסאפ. שם ומייל אינם חובה — מה שלא הוזן כאן, הלקוח ממלא
   * בעצמו בקישור. המערכת יוצרת: לקוח חדש ("טרם מיוצג") + התקשרות ייצוג.
   */
  async function handleCreateRepresentation(data: CreateRepresentationInput): Promise<{ link: string; emailSent: boolean; emailError?: string; clientId: string }> {
    const { name, email, areas, spouse, prefill, hasPreviousAccountant, prevAccountant } = data;
    const nameParts = name.trim().split(/\s+/).filter(Boolean);
    const clientId = crypto.randomUUID();
    const reqId = crypto.randomUUID();

    // כרטיס בלי שם צריך תווית זמנית שאפשר לזהות ברשימה — הזמן מבדיל בין
    // כמה קישורים שהופקו באותו יום. submit_onboarding_full דורס אותה בשם האמיתי.
    const placeholderLabel = new Date().toLocaleString('he-IL', {
      day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
    });
    const displayFirstName = nameParts[0] || 'ממתין למילוי';
    const displayLastName = nameParts.length > 1 ? nameParts.slice(1).join(' ') : (nameParts[0] ? '' : placeholderLabel);

    // לקוח חדש — מסומן "ממתין" עם מרשם הייצוג לפי רשות
    const client = makeEmptyClient(clientId, {
      firstName: displayFirstName,
      lastName: displayLastName,
      email,
      representationStatus: 'pending_fill',
      representationRequestId: reqId,
      authorityRepresentations: areas,
      ...(prefill.familyStatus ? { familyStatus: prefill.familyStatus } : {}),
      ...(prefill.familyStatusYear && prefill.familyStatus === 'married'  ? { marriageYear: prefill.familyStatusYear } : {}),
      ...(prefill.familyStatusYear && prefill.familyStatus === 'divorced' ? { divorceYear: prefill.familyStatusYear } : {}),
      ...(prefill.familyStatusYear && prefill.familyStatus === 'widowed'  ? { widowhoodYear: prefill.familyStatusYear } : {}),
      ...(spouse ? { spouseName: spouse.name } : {}),
      ...(spouse?.idNumber ? { spouseIdNumber: spouse.idNumber } : {}),
      ...(() => {
        const files = taxFilesForRegisteredSpouse(areas, prefill, undefined);
        return files ? { taxFiles: files } : {};
      })(),
      // מעבר מרו"ח אחר נרשם על הכרטיס מיד: ממנו נגזרים מכתב השחרור ומעקב החומרים.
      hasPreviousAccountant,
      ...(prevAccountant?.name  ? { prevAccountantName: prevAccountant.name } : {}),
      ...(prevAccountant?.email ? { prevAccountantEmail: prevAccountant.email } : {}),
      ...(prevAccountant?.phone ? { prevAccountantPhone: prevAccountant.phone } : {}),
      notes: 'נוצר אוטומטית מבקשת ייצוג. ממתין להשלמת התהליך.',
    });
    await addClient(client);
    void syncLifecycleStage(clientId);
    return saveRepresentationRequest(clientId, reqId, data);
  }

  /**
   * מה כבר מיוצג עבור הכרטיס הזה, דרך בן/בת הזוג המקושר/ת (150) — כדי
   * שדיאלוג פתיחת הייצוג לא יציע לבקש מחדש מע"מ/ניכויים/ב"ל/מ"ה שכבר
   * קיימים. ‼ בלי בן/בת זוג מקושר/ת מחזיר אובייקט ריק — אין מה לקרוא.
   */
  function alreadyRepresentedFor(client: Client): Partial<Record<RepAuthorityKind, string>> {
    const spouse = findSpouseClient(client, clients);
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

  /**
   * "התחלת ייצוג ללא הצעה" משלב 3: האדם כבר קיים (נוצר ברגע אישור המסלול,
   * או לקוח ותיק) — כאן רק מצמידים אליו בקשת ייצוג, בלי ליצור כרטיס שני.
   * ‼ שם/מייל שהוקלדו בדיאלוג מתעדכנים על הכרטיס: הם המקור העדכני ביותר.
   */
  async function handleAttachRepresentation(client: Client, data: CreateRepresentationInput) {
    const { email, areas, spouse, prefill, hasPreviousAccountant, prevAccountant } = data;
    const reqId = crypto.randomUUID();
    await updateClient({
      ...client,
      firstName: prefill.firstName || client.firstName,
      lastName: prefill.lastName ?? client.lastName,
      email: email || client.email,
      representationStatus: 'pending_fill',
      representationRequestId: reqId,
      authorityRepresentations: areas,
      ...(prefill.familyStatus ? { familyStatus: prefill.familyStatus } : {}),
      ...(prefill.familyStatusYear && prefill.familyStatus === 'married'  ? { marriageYear: prefill.familyStatusYear } : {}),
      ...(prefill.familyStatusYear && prefill.familyStatus === 'divorced' ? { divorceYear: prefill.familyStatusYear } : {}),
      ...(prefill.familyStatusYear && prefill.familyStatus === 'widowed'  ? { widowhoodYear: prefill.familyStatusYear } : {}),
      ...(spouse ? { spouseName: spouse.name } : {}),
      ...(spouse?.idNumber ? { spouseIdNumber: spouse.idNumber } : {}),
      // ‼ ללקוח קיים לא דורסים מבנה תיקים שכבר נבנה — רק קובעים את הבעלים
      // של תיק מ"ה, שזו התשובה שהתקבלה עכשיו.
      ...(() => {
        const existing = client.taxFiles ?? [];
        if (prefill.registeredSpouse !== 'spouse') return {};
        if (!existing.length) {
          const files = taxFilesForRegisteredSpouse(areas, prefill, client.idNumber);
          return files ? { taxFiles: files } : {};
        }
        const spouseId = prefill.spouseIdNumber?.trim();
        return {
          taxFiles: existing.map(f => (f.authority === 'income_tax'
            ? { ...f, owner: 'spouse' as const, ...(spouseId ? { fileNumber: spouseId } : {}) }
            : f)),
        };
      })(),
      hasPreviousAccountant,
      ...(prevAccountant?.name  ? { prevAccountantName: prevAccountant.name } : {}),
      ...(prevAccountant?.email ? { prevAccountantEmail: prevAccountant.email } : {}),
      ...(prevAccountant?.phone ? { prevAccountantPhone: prevAccountant.phone } : {}),
    });
    void syncLifecycleStage(client.id);
    return saveRepresentationRequest(client.id, reqId, data);
  }

  /**
   * ההכרעה מי בן/בת הזוג הרשום/ה — מגיעה משלב "הפרטים הוזנו בשע״ם" שבמרכז
   * ביצוע הייצוג, הרגע היחיד בתהליך שבו הרו"ח רואה מול מ"ה מי רשום בפועל.
   * כאן נסגר הסימון «טרם אומת», ואם המציאות שונה מהכוונה — גם הבעלים ומספר
   * התיק מתוקנים באותה לחיצה.
   */
  async function handleConfirmRegisteredSpouse(clientId: string, owner: 'client' | 'spouse') {
    const client = clients.find(c => c.id === clientId);
    if (!client) return;
    const ownerId = (owner === 'spouse' ? client.spouseIdNumber : client.idNumber)?.trim();
    const existing = client.taxFiles ?? [];
    const patched = existing.length
      ? existing.map(f => (f.authority === 'income_tax'
          ? {
              ...f,
              owner,
              // מספר התיק במ"ה הוא ת.ז. של הרשום. נדרס רק כשהוא ריק או מחזיק
              // את הת.ז. של בן הזוג השני — מספר שהוזן ידנית נשאר.
              ...(ownerId && (!f.fileNumber || f.fileNumber === client.idNumber || f.fileNumber === client.spouseIdNumber)
                ? { fileNumber: ownerId }
                : {}),
            }
          : f))
      // ‼ אין עדיין מבנה תיקים — ואז נכתב אחד, **גם** כשהתשובה היא הלקוח.
      // קודם נכתב רק 'spouse', מתוך הנחה ש-autofill_internal_setup ייצור את
      // השאר; אצל לקוח שהאוטופיל לא רץ עליו נשאר דגל "אומת" בלי שום בעלים,
      // וכל מסך שמציג את הרשום חזר ל"לא הוכרע" למרות שהרו"ח הכריע.
      // התוצאה ל'client' זהה למה שהאוטופיל היה יוצר, ולכן חסימתו לא גורעת.
      : taxFilesForRegisteredOwner(
          client.authorityRepresentations ?? {},
          owner,
          client.idNumber,
          client.spouseIdNumber,
        );
    await updateClient({
      ...client,
      ...(patched ? { taxFiles: patched } : {}),
      registeredSpouseVerified: true,
    });
  }

  function handleSelectRequest(id: string) {
    setSelectedRequestId(id);
    setView('requestReview');
  }

  /**
   * שמירת בקשה. אם זו בקשה חדשה — יוצרים גם stub Client עם status = 'pending_fill'
   * וקושרים ביניהם.
   */
  async function handleSaveRequest(req: RepresentationRequest) {
    const isNew = !requests.some(r => r.id === req.id);

    if (isNew) {
      // 1. יוצרים stub Client עם reqId משוייך
      const stubClientId = crypto.randomUUID();
      const nameParts = (req.clientName || '').trim().split(/\s+/);
      const stubClient = makeEmptyClient(stubClientId, {
        firstName: nameParts[0] || '',
        lastName: nameParts.slice(1).join(' ') || '',
        email: req.clientEmail,
        representationStatus: 'pending_fill',
        representationRequestId: req.id,
        notes: 'נוצר אוטומטית מבקשת ייצוג. ממתין למילוי הלקוח.',
      });
      const insertedClient = await addClient(stubClient);
      // ‼ הכרטיס נולד עם lifecycle_stage='lead' (ברירת המחדל בעמודה) — בלי
      // הסנכרון הזה הוא נשאר "חדש" עד הריצה הלילית, למרות שיש לו כבר ייצוג
      // בתהליך (derive_lifecycle_stage ממפה pending_fill ל"בקליטה" מיד).
      void syncLifecycleStage(insertedClient.id);
      // 2. יוצרים את הבקשה עם linkedClientId
      const finalReq = { ...req, linkedClientId: insertedClient.id };
      await addRequest(finalReq);
      setSelectedRequestId(finalReq.id);
    } else {
      await updateRequest(req);
      setSelectedRequestId(req.id);
    }
    setView('requestReview');
  }

  function handleOpenFill(id: string) {
    setSelectedRequestId(id);
    setView('requestFill');
  }

  /**
   * הלקוח שלח את הטופס. מעדכנים:
   * 1. את הבקשה — submission, status = awaiting_accountant
   * 2. את ה-Client הקשור — מילוי שדות, status = awaiting_accountant
   * 3. שמות הקבצים שהועלו → מוסכמת השמות
   */
  async function handleSubmitFill(submission: RequestSubmission) {
    if (!selectedRequestId) return;
    const req = requests.find(r => r.id === selectedRequestId);
    if (!req) return;
    const now = new Date().toISOString();

    // ── עדכון שמות הקבצים ב-IndexedDB וקישור ל-Client האמיתי ──
    try {
      const storedDocs = await db.getDocsByClient(`req-${req.id}`);
      for (const stored of storedDocs) {
        const matchingDoc = req.requestedDocs.find(d =>
          submission.uploadedDocs.some(u => u.docItemId === d.id && u.storedDocId === stored.id)
        );
        const docLabel = matchingDoc?.label || stored.description;
        const newName = standardFileName(submission.lastName, submission.firstName, docLabel, stored.fileName);
        await db.saveDoc({
          ...stored,
          clientId: req.linkedClientId, // העברה ל-clientId האמיתי
          fileName: newName,
          description: docLabel,
        });
      }
    } catch {
      // ignore
    }

    // ── עדכון Client ──
    const linkedClient = clients.find(c => c.id === req.linkedClientId);
    if (linkedClient) {
      await updateClient({
        ...linkedClient,
        firstName: submission.firstName,
        lastName: submission.lastName,
        idNumber: submission.idNumber,
        birthDate: submission.birthDate,
        gender: submission.gender,
        phone: submission.phone,
        email: submission.email,
        city: submission.city,
        address: submission.address,
        notes: submission.notes
          ? `${linkedClient.notes}\n\nהערות הלקוח:\n${submission.notes}`
          : linkedClient.notes,
        representationStatus: 'awaiting_accountant',
      });
    }

    // ── עדכון Request ──
    await updateRequest({ ...req, submission, status: 'awaiting_accountant', submittedAt: now });
    await reloadTasks();
    setView('requestReview');
  }

  /**
   * המייצג חתם וייפוי הכוח החתום נוצר. מעדכנים את הסטטוס ל-awaiting_authorities.
   */
  async function handleAccountantSign(req: RepresentationRequest, partB: AccountantPartB, signedPdfStoredId: string) {
    await updateRequest({ ...req, partB, signedPdfStoredId, status: 'awaiting_authorities' });
    const linkedClient = clients.find(c => c.id === req.linkedClientId);
    if (linkedClient) {
      await updateClient({ ...linkedClient, representationStatus: 'awaiting_authorities' });
    }
    await reloadTasks();
  }

  /**
   * הרו"ח סיים לסמן את אזורי החתימה על ה-PDF ("הפקת טופס") — שומרים את ההגדרה,
   * עוברים ל"נשלח לחתימה", ושולחים לכל חותם קישור חתימה אישי למייל שלו.
   */
  async function handleProduceFormWithSetup(req: RepresentationRequest, docs: RepSignatureDocument[]) {
    // ודא שלכל חותם יש טוקן חתימה (בקשות ותיקות נוצרו לפני שהיו טוקנים)
    const signers: RepSigner[] = (req.signers && req.signers.length > 0
      ? req.signers
      : [{ id: 'client', role: 'client' as const, name: req.clientName || '', email: req.clientEmail || '', signStatus: 'pending' as const }]
    ).map(s => s.signToken ? s : { ...s, signToken: crypto.randomUUID().replace(/-/g, '') });

    // ‼ המסמך הראשון ממשיך להישמר גם בשדות הישנים — ראה withLegacyMirror.
    await updateRequest({ ...req, signers, ...withLegacyMirror(docs), status: 'pending_signature' });
    const linkedClient = clients.find(c => c.id === req.linkedClientId);
    if (linkedClient) {
      await updateClient({ ...linkedClient, representationStatus: 'pending_signature' });
    }
    await reloadTasks();
    // ‼ בכוונה לא נשלח מייל כאן. הפקת הטופס והשליחה ללקוח הן שתי פעולות נפרדות:
    // שליחה אוטומטית בשלב הזה יצאה לפני שהוזנה אסמכתת ב"ל, והלקוח קיבל מייל
    // חלקי ואז עוד אחד מלא. השליחה נעשית מכפתור אחד מפורש במסך הבקשה.
  }

  /** נשמר ה-PDF הסופי (חתימות + חותמת צרובות) — עדיין בסטטוס awaiting_stamp עד "נשלח לשע"ם" */
  async function handleSaveSignedPdf(req: RepresentationRequest, values: Record<string, SignatureValue>, docs: RepSignatureDocument[]) {
    await updateRequest({ ...req, signatureValues: values, ...withLegacyMirror(docs) });
  }

  /**
   * מעקב ביצוע הייצוג מול הרשויות. כשהלקוח מאשר בב"ל, מרשם הייצוג של הלקוח
   * מתעדכן ל-active — ייצוג ב"ל נפרד מהליך שע"ם ולכן גם מסתיים בנפרד ממנו.
   */
  async function handleSaveExecution(req: RepresentationRequest, execution: RepresentationExecution) {
    await updateRequest({ ...req, execution });
    const linkedClient = clients.find(c => c.id === req.linkedClientId);
    const niRegistered = linkedClient?.authorityRepresentations?.nationalInsurance;
    // ‼ ביטוח לאומי הוא "עבור מי" לכל דבר (31.8) — כולל המקרה שהוא התבקש
    // *רק* לבן/בת הזוג (targets=['spouse'], בלי מסלול לנישום בכלל). "פעיל"
    // נבדק רק במסלולים שבאמת התבקשו: אישור אחד מותיר את המסלול השני (אם
    // התבקש) בלי ייצוג בפועל, וסימון "פעיל" היה מסתיר את זה.
    const niTargets = targetsOf(linkedClient?.authorityRepresentations, 'nationalInsurance');
    const niConfirmed = (niTargets.includes('client') || niTargets.includes('spouse'))
      && (!niTargets.includes('client') || !!execution.nationalInsurance?.confirmedAt)
      && (!niTargets.includes('spouse') || !!execution.nationalInsuranceSpouse?.confirmedAt);
    if (linkedClient && niConfirmed && niRegistered && niRegistered.status !== 'active') {
      await updateClient({
        ...linkedClient,
        authorityRepresentations: {
          ...linkedClient.authorityRepresentations,
          nationalInsurance: { ...niRegistered, status: 'active' },
        },
      });
    }
  }

  /** הרו"ח מסמן שהטופס הוגש לשע"ם: awaiting_stamp → awaiting_authorities */
  async function handleMarkSentToShaam(req: RepresentationRequest) {
    await updateRequest({ ...req, status: 'awaiting_authorities' });
    const linkedClient = clients.find(c => c.id === req.linkedClientId);
    if (linkedClient) {
      await updateClient({ ...linkedClient, representationStatus: 'awaiting_authorities' });
    }
    await reloadTasks();
  }

  /**
   * הרשויות אישרו — הלקוח הופך למיוצג פעיל: כל הרשויות במרשם → active.
   * ‼ בכוונה לא נשלח מייל כאן. עד היום יצא ללקוח מייל "הייצוג אושר" מעצם
   * הסימון, בלי שהרו"ח ידע שנשלח ובלי שראה אותו. השליחה עברה לכפתור מפורש
   * בשלב 7 של מרכז הביצוע, עם תצוגה מקדימה לפניה.
   */
  async function handleMarkActive(req: RepresentationRequest) {
    await updateRequest({ ...req, status: 'active' });
    const linkedClient = clients.find(c => c.id === req.linkedClientId);
    if (linkedClient) {
      const reps = { ...(linkedClient.authorityRepresentations || {}) } as AuthorityRepresentations;
      for (const k of Object.keys(reps) as RepAuthorityKind[]) {
        const r = reps[k];
        if (r) reps[k] = { ...r, status: 'active' };
      }
      await updateClient({ ...linkedClient, representationStatus: 'active', authorityRepresentations: reps });
      void syncLifecycleStage(linkedClient.id);
    }
    await reloadTasks();
  }

  /**
   * ‼ מחיקת בקשה לעולם לא מוחקת את האדם המקושר אליה (שלב 3, תיקון היפוך
   * הבעלות): הבקשה מתועדת על הכרטיס, ולא להפך. מה שהיא כן עושה — מנקה
   * מהכרטיס את שדות הייצוג, כדי שלא יישאר מצביע לבקשה שכבר לא קיימת.
   * קבצים תחת ‎req-{id}‎ הם קבצי-הבקשה עצמה (למשל העלאות מלפני שהיה כרטיס)
   * ונמחקים; קבצי הלקוח האמיתיים (תחת מזהה הכרטיס) לעולם לא נגועים כאן.
   */
  async function handleDeleteRequest(id: string) {
    const req = requests.find(r => r.id === id);
    try {
      const oldFiles = await db.getDocsByClient(`req-${id}`);
      await Promise.all(oldFiles.map(d => db.deleteDoc(d.id)));
    } catch {
      // ignore
    }
    await removeRequest(id);
    if (req?.linkedClientId) {
      const c = clients.find(x => x.id === req.linkedClientId);
      if (c) {
        try {
          await updateClient({
            ...c,
            representationStatus: null,
            representationRequestId: null,
            // ‼ {} ולא null — העמודה NOT NULL DEFAULT '{}'::jsonb; null נדחה
            // ב-23502 (אומת מול המסד בבדיקת שלב 3).
            authorityRepresentations: {},
          });
          // בלי ייצוג, שם הכרטיס לא אמור להישאר "בקליטה"/"פעיל" עד הריצה הלילית.
          void syncLifecycleStage(c.id);
        } catch (e) {
          // לא חוסם: הבקשה כבר נמחקה. אבל לא בולעים בשקט — זה בדיוק מה שהסתיר
          // את התקלה הזו בבדיקה הראשונה.
          console.error('ניקוי שדות הייצוג מהכרטיס נכשל אחרי מחיקת הבקשה:', e);
        }
      }
    }
    setSelectedRequestId(null);
    setView('list');
  }

  // ─── הצעות מחיר ולידים ─────────────────────────────────────────────────────

  const editingQuotation = editingQuotationId ? quotations.find(q => q.id === editingQuotationId) ?? null : null;

  function handleNewQuotation() {
    setEditingQuotationId(null);
    setNewQuotationLeadId(null);
    setNewQuotationClientId(null);
    setView('quotationBuilder');
  }

  function handleOpenQuotation(q: Quotation) {
    setEditingQuotationId(q.id);
    setNewQuotationLeadId(null);
    setNewQuotationClientId(null);
    setView('quotationBuilder');
  }

  /** הצעה חדשה שנפתחת מכרטיס ליד — הנמען ממולא מראש */
  function handleNewQuotationForLead(lead: Lead) {
    setEditingQuotationId(null);
    setNewQuotationLeadId(lead.id);
    setNewQuotationClientId(null);
    setView('quotationBuilder');
  }

  /** הצעה חדשה שנפתחת מכרטיס לקוח קיים (אדם חדש משלב 3) — הנמען ממולא מראש */
  /**
   * הצעה ללקוח קיים. הכוונה המסחרית נבחרת לפני הבונה ונשמרת על ההצעה:
   * 'one_time' מוכרת שירות לצד ההסכם, 'engagement' מעדכנת את ההסכם עצמו.
   * ‼ עדכון התקשרות מתחיל מההסכם הנוכחי — הרו"ח עורך רק את מה שהשתנה.
   */
  function handleNewQuotationForClient(clientId: string, kind: QuotationKind = 'engagement') {
    setEditingQuotationId(null);
    setNewQuotationLeadId(null);
    setNewQuotationClientId(clientId);
    setNewQuotationKind(kind);
    setView('quotationBuilder');
  }

  /**
   * שומר טיוטת הצעה (יוצר/מעדכן) ומחזיר את ההצעה השמורה. אם הנמען "ליד חדש" —
   * יוצר קודם רשומת ליד ומקשר. ליד הופך ללקוח רק אחרי אישור ההצעה (שלב 4).
   */
  async function persistQuotation(payload: SaveDraftPayload): Promise<Quotation> {
    let leadId: string | undefined;
    let clientId: string | undefined;

    if (payload.recipient.kind === 'new') {
      const lead = await addLead({
        fullName: payload.recipient.fullName,
        phone: payload.recipient.phone,
        email: payload.recipient.email,
        businessName: payload.recipient.businessName,
        dealerType: payload.recipient.dealerType,
        hasPreviousAccountant: payload.recipient.hasPreviousAccountant,
        prevAccountantName: payload.recipient.prevAccountantName,
        prevAccountantEmail: payload.recipient.prevAccountantEmail,
        prevAccountantPhone: payload.recipient.prevAccountantPhone,
        status: 'new',
      });
      leadId = lead.id;
    } else if (payload.recipient.kind === 'lead') {
      leadId = payload.recipient.id;
    } else {
      clientId = payload.recipient.id;
    }

    const existing = payload.id ? quotations.find(q => q.id === payload.id) : undefined;
    if (existing) {
      return updateQuotation({
        ...existing,
        leadId: leadId ?? existing.leadId,
        clientId: clientId ?? existing.clientId,
        items: payload.items,
        futureServices: payload.futureServices,
        vatRate: payload.vatRate,
        emailSubject: payload.emailSubject,
        emailMessage: payload.emailMessage,
        notesForClient: payload.notesForClient,
        internalNotes: payload.internalNotes,
        templateId: payload.templateId,
        expiresAt: payload.expiresAt,
        representation: payload.representation,
        kind: payload.kind,
        effectiveFrom: payload.effectiveFrom,
        events: [...existing.events, { type: 'edited', at: new Date().toISOString() }],
      });
    }
    return addQuotation({
      leadId, clientId, revision: 1, status: 'draft',
      kind: payload.kind,
      effectiveFrom: payload.effectiveFrom,
      items: payload.items,
      futureServices: payload.futureServices,
      vatRate: payload.vatRate,
      emailSubject: payload.emailSubject,
      emailMessage: payload.emailMessage,
      notesForClient: payload.notesForClient,
      internalNotes: payload.internalNotes,
      templateId: payload.templateId,
      expiresAt: payload.expiresAt,
      representation: payload.representation,
      events: [],
    });
  }

  async function handleSaveQuotationDraft(payload: SaveDraftPayload) {
    const saved = await persistQuotation(payload);
    setEditingQuotationId(saved.id);
  }

  /**
   * שולח הצעה ללקוח (או מייל בדיקה לרו"ח). שומר קודם, מקפיא snapshot ברגע השליחה,
   * מייצר טוקן ציבורי, ובונה את ה-HTML באותו מחולל של התצוגה המקדימה — כדי
   * שהמייל יהיה זהה למה שהוצג. מחזיר תוצאה להצגה בבונה.
   */
  async function handleSendQuotation(payload: SaveDraftPayload, isTest: boolean): Promise<{ ok: boolean; error?: string; link?: string }> {
    const saved = await persistQuotation(payload);
    const token = saved.publicToken || crypto.randomUUID().replace(/-/g, '');
    const link = `${window.location.origin}/?quote=${token}`;
    const now = new Date().toISOString();

    // הכרטיס והקישור הקבוע נולדים כאן — לפני המייל, כדי שהמייל הראשון כבר
    // ישא את הדף האישי. מייל בדיקה לא יוצר אדם חדש במערכת.
    let ensuredClientId: string | undefined;
    let portalLink: string | undefined;
    if (!isTest) {
      const { data: ensured, error: ensureError } = await supabase.rpc('ensure_client_for_quotation', {
        p_quotation_id: saved.id,
      });
      if (ensureError) return { ok: false, error: ensureError.message, link };
      if (!ensured?.ok) return { ok: false, error: ensured?.error || 'לא הצלחתי להכין את כרטיס הלקוח', link };
      ensuredClientId = ensured.clientId as string;
      if (ensured.portalToken) portalLink = `${window.location.origin}/?portal=${ensured.portalToken}`;
    }

    const brand = deriveQuotationBrand(firmProfile);
    const ctx: Record<string, string> = {
      '{{clientName}}': payload.recipient.fullName,
      '{{businessName}}': payload.recipient.businessName || payload.recipient.fullName,
      '{{quotationNumber}}': saved.quotationNumber,
      '{{quotationLink}}': link,
    };
    const applyPlaceholders = (s: string) => Object.entries(ctx).reduce((acc, [k, v]) => acc.split(k).join(v ?? ''), s);
    const subject = applyPlaceholders(payload.emailSubject || 'הצעת מחיר');
    const html = buildQuotationEmailHtml({
      quotationNumber: saved.quotationNumber,
      recipientName: payload.recipient.fullName,
      businessName: payload.recipient.businessName,
      items: payload.items,
      vatRate: payload.vatRate,
      message: applyPlaceholders(payload.emailMessage || ''),
      quotationLink: link,
      expiresAt: payload.expiresAt,
      portalLink,
    }, brand);

    // שולחים קודם — ורק אם המייל יצא בהצלחה מסמנים "נשלחה" ומקפיאים snapshot.
    // כך הצעה לא תיתקע במצב "נשלחה" בלי שהמייל באמת יצא.
    let res: { ok?: boolean; error?: string; detail?: { message?: string } } | null = null;
    try {
      const { data, error } = await supabase.functions.invoke('send-quotation-email', {
        body: { quotationId: saved.id, isTest, html, subject },
      });
      if (error) return { ok: false, error: await edgeFunctionError(error), link };
      res = data;
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : String(e), link };
    }
    if (!res?.ok) return { ok: false, error: res?.detail?.message || res?.error || 'שגיאה לא ידועה', link };

    const snapshot: NonNullable<Quotation['snapshot']> = {
      frozenAt: now, quotationNumber: saved.quotationNumber, revision: saved.revision,
      recipientName: payload.recipient.fullName, recipientEmail: payload.recipient.email,
      businessName: payload.recipient.businessName, items: payload.items,
      futureServices: payload.futureServices, vatRate: payload.vatRate,
      notesForClient: payload.notesForClient, emailSubject: payload.emailSubject,
      emailMessage: payload.emailMessage, firmName: firmProfile?.firmName,
      // ההגדרה מוקפאת יחד עם ההצעה: מה שהלקוח ראה ואישר הוא הייצוג שייפתח,
      // גם אם הטיוטה תיערך אחר כך.
      representation: payload.representation,
    };
    if (!isTest) {
      await updateQuotation({
        // ‼ clientId מהשרת חייב להיכנס לאובייקט — אחרת העדכון הזה ידרוס בחזרה
        // את הקישור לכרטיס שנוצר לפני רגע.
        ...saved, clientId: ensuredClientId ?? saved.clientId,
        status: 'sent', sentAt: now, publicToken: token, snapshot,
        events: [...saved.events, { type: 'sent', at: now }],
      });
      // ‼ שלב החיים של הכרטיס נגזר בשרת מתוך מצב ההצעה, ולכן העדכון שלמעלה
      // הזיז אותו מ"ליד" ל"הצעה" בלי שהדפדפן כתב לכרטיס דבר. בלי המשיכה הזו
      // דף המסע היה ממשיך להציג "לבנות הצעת מחיר" מיד אחרי השליחה, כי העותק
      // שבזיכרון נטען בכניסה למערכת ואיש לא רענן אותו.
      const targetClientId = ensuredClientId ?? saved.clientId;
      if (targetClientId) {
        await refreshClient(targetClientId);
        postSendClientId.current = targetClientId;
      }
    } else if (!saved.publicToken) {
      await updateQuotation({
        ...saved, publicToken: token,
        events: [...saved.events, { type: 'test_email_sent', at: now }],
      });
    }
    return { ok: true, link };
  }

  /**
   * הצעה אושרה → הפיכת הליד ללקוח והמשך לתהליך הייצוג הקיים.
   * אם הליד כבר הומר — פשוט קופצים לכרטיס הלקוח. אחרת פותחים את דיאלוג
   * הייצוג הקיים (ממולא מראש) — כדי לא לשכפל את מנגנון יצירת הייצוג.
   */
  function handleConvertQuotation(q: Quotation) {
    const lead = q.leadId ? leads.find(l => l.id === q.leadId) : undefined;
    if (lead?.convertedClientId) {
      // רשת ביטחון: אם ההסכם לא נשמר בהמרה (למשל כשל רגעי) — ניסיון חוזר שקט
      if (q.status === 'approved') void saveEngagementContract(q, lead.convertedClientId);
      setSelectedId(lead.convertedClientId);
      setView('form');
      return;
    }
    if (q.clientId) {   // הצעה ללקוח קיים — כבר לקוח; שומרים הסכם וישר לכרטיס
      if (q.status === 'approved') void saveEngagementContract(q, q.clientId);
      setSelectedId(q.clientId);
      setView('form');
      return;
    }
    setConvertingQuotation(q);
  }

  /**
   * פתיחת מכתב שחרור לרו"ח קודם — תמיד מתוך שלב מכתב השחרור של הלקוח.
   * ‼ stepId חובה: בלעדיו לא נטבע טוקן, והמכתב היה יוצא בלי הדרך היחידה לענות
   * עליו (דף הרו"ח הקודם). היה נתיב כזה מהפייפליין — הוא נותב לכרטיס הלקוח.
   * ‼ הפרטים נקראים מכרטיס הלקוח, והליד הוא רק גיבוי לרשומות ישנות שטרם
   * הועתקו: מכתב השחרור שייך לאדם, ולכן מחיקת הליד אחרי ההמרה לא מבטלת אותו.
   */
  function openReleaseLetter(clientId: string, stepId: string, mode: 'letter' | 'follow_up' = 'letter') {
    const client = clients.find(c => c.id === clientId);
    const lead = leads.find(l => l.convertedClientId === clientId);
    if (!client && !lead) return;
    const materialsStep = onboarding.steps.find(
      s => s.clientId === clientId && s.stepType === 'materials_received' && s.status !== 'cancelled');
    const followUpItems = (materialsStep?.payload.checklist ?? [])
      .filter(i => i.addedAfterSend && !i.notifiedAt)
      .map(i => ({ key: i.key, label: i.label }));
    setReleaseFor({
      mode,
      followUpItems,
      clientId,
      clientName: client ? `${client.firstName} ${client.lastName}`.trim() : (lead?.fullName ?? ''),
      // ‼ המכתב מזהה את התיק, לא את העסק: מספר התיק במ"ה הוא ת.ז. של בעל
      // התיק — ואצל זוג נשוי זה בן/בת הזוג הרשום, שאינו בהכרח הלקוח שבכרטיס.
      ...releaseClientIdentity(client),
      clientEmail: client?.email || lead?.email,
      prevAccountant: {
        name: client?.prevAccountantName || lead?.prevAccountantName,
        email: client?.prevAccountantEmail || lead?.prevAccountantEmail,
        phone: client?.prevAccountantPhone || lead?.prevAccountantPhone,
      },
      stepId,
    });
  }

  /**
   * מיישר את צ'קליסט "קבלת חומרים" לפי מה שבאמת נתבקש במכתב.
   * ‼ בלי זה עוקבים אחרי רשימה שנוצרה בהרכבה ולא אחרי מה שנשלח — ואז "חסר
   * טופס פחת" מופיע גם כשלא ביקשנו אותו.
   */
  /**
   * ‼ הרשימה שנשלחה בפועל היא זו שהופכת לצ'קליסט המעקב — כולל פריטים שהמשרד
   * ניסח מחדש או הוסיף במכתב. נפילה ל-RELEASE_MATERIALS קיימת רק בשביל
   * מכתבים שנשלחו לפני שהרשימה הפכה לניתנת לעריכה.
   */
  function syncRequestedMaterials(
    clientId: string,
    materialKeys: string[],
    sentMaterials?: { key: string; label: string; optional?: boolean; priority?: boolean }[],
  ) {
    const step = onboarding.steps.find(
      s => s.clientId === clientId && s.stepType === 'materials_received' && s.status !== 'cancelled');
    if (!step || materialKeys.length === 0) return;
    const prev = new Map((step.payload?.checklist ?? []).map(i => [i.key, i]));
    const source = sentMaterials?.length
      ? sentMaterials
      : RELEASE_MATERIALS.filter(m => materialKeys.includes(m.key));
    // ‼ מה שכבר התקבל אינו מתאפס: פריט שהיה בצ'קליסט שומר על מצבו ועל המסמכים
    // שהצטברו אליו, גם כשהמכתב נשלח שוב.
    const checklist = source.map(m => {
      const was = prev.get(m.key);
      return {
        ...(was ?? {}),
        key: m.key,
        label: m.label,
        done: m.optional ? false : (was?.done ?? false),
        ...(m.optional ? { optional: true } : {}),
        // ‼ סימון "חשוב" נקבע במכתב שנשלח, ולכן הוא נדרס בכל שליחה — בשונה
        // ממצב הקבלה, שנשמר. פריט שהורד מחשוב לא ישאיר תג ישן בכרטיס.
        ...(m.priority ? { priority: true } : { priority: undefined }),
      };
    });
    void onboarding.advance(step.id, 'note', {
      checklist,
      note: `רשימת החומרים עודכנה לפי המכתב שנשלח (${checklist.length} פריטים)`,
    });
  }

  /** סימון שהפריטים שנוספו אחרי השליחה נמסרו לרו"ח הקודם — כדי שההתראה תיעלם. */
  function markFollowUpNotified(clientId: string, keys: string[], atIso: string) {
    const step = onboarding.steps.find(
      s => s.clientId === clientId && s.stepType === 'materials_received' && s.status !== 'cancelled');
    if (!step || keys.length === 0) return;
    const checklist = (step.payload.checklist ?? []).map(i =>
      keys.includes(i.key) ? { ...i, notifiedAt: atIso } : i);
    void onboarding.advance(step.id, 'note', { checklist });
  }

  /**
   * "רו״ח קודם" בפייפליין ההצעות — מנווט לכרטיס הלקוח, ללשונית הבקשות, ששם
   * חי מסלול הרו"ח הקודם כולו. ‼ עד כה הכפתור פתח את חלון המכתב ישירות, בלי
   * שלב — ואז יצא מכתב בלי קישור תשובה. אין יותר שני מסלולים.
   */
  function handleReleaseLetter(q: Quotation) {
    const lead = q.leadId ? leads.find(l => l.id === q.leadId) : undefined;
    const clientId = lead?.convertedClientId || q.clientId;
    if (!clientId) return;
    setClientInitialTab(journeyUi ? 'journey' : 'onboarding');
    setSelectedId(clientId);
    setView('form');
  }

  /**
   * תזכורת — שליחה חוזרת של אותה הצעה שנשלחה, עם אותו קישור ותוכן.
   * ‼ המייל לא יוצא מהלחיצה: הכפתור פותח תצוגה מקדימה, והשליחה קורית שם —
   * שום מייל ללקוח אינו יוצא בלי שנראה קודם (מדיניות התקשורת).
   */
  function handleRemindQuotation(q: Quotation): Promise<{ ok: boolean; error?: string; deferred?: boolean }> {
    if (!q.publicToken) return Promise.resolve({ ok: false, error: 'להצעה אין קישור ציבורי - שלח אותה קודם.' });
    const link = `${window.location.origin}/?quote=${q.publicToken}`;
    const brand = deriveQuotationBrand(firmProfile);
    const snap = q.snapshot;
    const html = buildQuotationEmailHtml({
      quotationNumber: q.quotationNumber,
      recipientName: snap?.recipientName ?? '',
      businessName: snap?.businessName,
      items: snap?.items ?? q.items,
      vatRate: snap?.vatRate ?? q.vatRate,
      message: snap?.emailMessage ?? q.emailMessage ?? '',
      quotationLink: link,
      expiresAt: q.expiresAt,
    }, brand);
    const subject = q.emailSubject || snap?.emailSubject || 'תזכורת - הצעת מחיר';
    // הנמען נקבע בשרת מהליד/הלקוח של ההצעה; כאן מוצג אותו מקור, לידיעה.
    const lead = q.leadId ? leads.find(l => l.id === q.leadId) : undefined;
    const client = q.clientId ? clients.find(c => c.id === q.clientId) : undefined;
    const to = (client?.email || lead?.email || q.snapshot?.recipientEmail || '').trim();
    setRemindPreview({ quotation: q, subject, to, html });
    return Promise.resolve({ ok: true, deferred: true });
  }

  /** השליחה בפועל של התזכורת, מתוך התצוגה המקדימה. null = הצליח. */
  async function sendQuotationReminder(): Promise<string | null> {
    const p = remindPreview;
    if (!p) return 'התזכורת לא נטענה.';
    try {
      const { data: res, error } = await supabase.functions.invoke('send-quotation-email', {
        body: { quotationId: p.quotation.id, isTest: false, html: p.html, subject: p.subject },
      });
      if (error) return await edgeFunctionError(error);
      if (!res?.ok) return res?.detail?.message || res?.error || 'שגיאה';
      await updateQuotation({
        ...p.quotation,
        events: [...p.quotation.events, { type: 'reminder_sent', at: new Date().toISOString() }],
      });
      return null;
    } catch (e) {
      return e instanceof Error ? e.message : String(e);
    }
  }

  /** onCreate של דיאלוג הייצוג בזרימת ההמרה — יוצר ייצוג ואז מקשר ליד+הצעה ללקוח. */
  async function handleCreateRepresentationFromQuotation(data: CreateRepresentationInput) {
    const res = await handleCreateRepresentation(data);
    const q = convertingQuotation;
    if (q) {
      if (q.leadId) {
        const lead = leads.find(l => l.id === q.leadId);
        if (lead) await updateLead({ ...lead, status: 'converted', convertedClientId: res.clientId });
      }
      await updateQuotation({
        ...q, clientId: res.clientId,
        events: [...q.events, { type: 'lead_converted', at: new Date().toISOString() }],
      });
      await saveEngagementContract(q, res.clientId);
    }
    return res;
  }

  /**
   * ההצעה החתומה נשמרת כ"הסכם התקשרות" במסמכי הלקוח החדש — PDF שכולל את חתימת
   * הלקוח, שם החותם ומועד האישור. כישלון כאן לא עוצר את ההמרה — ההסכם ניתן
   * להורדה ידנית מטאב המעקב של ההצעה.
   */
  async function saveEngagementContract(q: Quotation, clientId: string) {
    if (q.status !== 'approved') return;
    try {
      // כבר נשמר בעבר — לא מפיקים ומעלים שוב (הקריאה זולה, ההפקה יקרה)
      const { data: already } = await supabase
        .from('documents').select('id').eq('id', `engagement-${q.id}`).maybeSingle();
      if (already) return;
      const snap = q.snapshot;
      const bytes = await generateQuotationPdf({
        quotationNumber: q.quotationNumber,
        recipientName: snap?.recipientName ?? '',
        businessName: snap?.businessName,
        items: snap?.items ?? q.items,
        futureServices: snap?.futureServices ?? q.futureServices,
        vatRate: snap?.vatRate ?? q.vatRate,
        notesForClient: snap?.notesForClient ?? q.notesForClient,
        representation: snap?.representation ?? q.representation,
        approval: {
          signatureDataUrl: q.approvalSignature,
          signerName: q.approvalSignerName,
          approvedAt: q.approvedAt,
        },
      }, deriveQuotationBrand(firmProfile));
      await db.saveDoc({
        id: `engagement-${q.id}`,
        clientId,
        fileName: `הסכם התקשרות - הצעה ${q.quotationNumber}.pdf`,
        fileType: 'application/pdf',
        fileSize: bytes.byteLength,
        category: 'engagement_contract',
        year: 'general',
        uploadedAt: new Date().toISOString(),
        description: `הצעת מחיר ${q.quotationNumber} שאושרה ונחתמה${q.approvalSignerName ? ` על ידי ${q.approvalSignerName}` : ''} - נשמרה אוטומטית עם פתיחת הלקוח`,
        notes: '',
        fileData: bytes.slice().buffer,
      });
    } catch (e) {
      // ההמרה עצמה הצליחה — רק שמירת ההסכם נכשלה; לא חוסמים את הזרימה
      console.warn('שמירת הסכם ההתקשרות במסמכי הלקוח נכשלה:', e);
    }
  }

  // פירורי הלחם ירדו מהמעטפת (§4.1) — כל מסך נושא בעצמו את ההקשר שלו,
  // וכרטיס הלקוח מציג קישור חזרה משלו.

  function goHome() {
    setView('tasks');
    setSelectedId(null);
    setSelectedRequestId(null);
  }

  if (authLoading) {
    return <div className="app-loading">טוען…</div>;
  }
  if (!user) {
    return <LoginScreen />;
  }
  // מחובר אך טרם הושלמה בדיקת ההרשאה
  if (authorized === null) {
    return <div className="app-loading">בודק הרשאה…</div>;
  }
  // מחובר אך אינו ברשימת המורשים — חוסמים ומאפשרים התנתקות בלבד
  if (!authorized) {
    return <NoAccessScreen email={user.email ?? ''} onSignOut={signOut} />;
  }

  const openTasksCount = tasks.filter(t => t.status === 'open' && (t.ballWith === 'me' || t.ballWith === 'stuck')).length;

  // הסרגל נושא רק את שלושת המקומות שבהם העבודה חיה (§4.1).
  // "ידע מס" יושב באשכול הכלים בקצה, מופרד בקו — הוא עזר, לא מקום עבודה (D9).
  // דוח 1301 ירד מהסרגל לגמרי: נכנסים אליו מכרטיס הלקוח, כי דוח תמיד שייך
  // ללקוח מסוים ואין משמעות לפתוח אותו "סתם" (D13).
  // ‼ במבנה "המסע הוא הכרטיס" נשארים שני מקומות שבהם העבודה חיה: המשימות
  // (עבודת המשרד) והלקוחות (המסעות). "הצעות ולידים" ירד מהסרגל — הלידים הם
  // שלב במסע וחיים במסך הלקוחות, ובניית ההצעות היא כלי שנכנסים אליו מהמסע
  // או מאשכול הכלים בכותרת. הישן חוזר במלואו כש-journeyUi כבוי.
  const navTabs: { id: View; label: string; badge?: number }[] = journeyUi
    ? [
        { id: 'list', label: 'לקוחות' },
        { id: 'tasks', label: 'משימות', badge: openTasksCount > 0 ? openTasksCount : undefined },
      ]
    : [
        { id: 'tasks', label: 'משימות', badge: openTasksCount > 0 ? openTasksCount : undefined },
        { id: 'list', label: 'לקוחות' },
        { id: 'quotations', label: 'הצעות ולידים' },
      ];

  return (
    <div className="app">
      <header className="header">
        {/* אלמנט שאפשר ללחוץ עליו חייב להיות נגיש גם במקלדת (§6.4) */}
        <button type="button" className="header-logo" onClick={goHome} aria-label="חזרה למשימות">
          <span className="brand-lockup">
            <PivoMark size={28} />
            <span className="brand-wordmark">PIVO</span>
          </span>
        </button>

        <nav className="main-nav">
          {navTabs.map(t => (
            <button
              key={t.id}
              onClick={() => {
                setView(t.id);
                setSelectedId(null);
                setSelectedRequestId(null);
                setEditingQuotationId(null);
                // ‼ ניווט מפורש לטאב הוא כוונה מפורשת למסך הנקי — לא לתצוגה
                // המהירה שנשארה פתוחה מביקור קודם (אחרת "לקוחות" היה מציג
                // מגירה ישנה במקום את הרשימה).
                setQuickViewId(null);
              }}
              className={`nav-tab ${view === t.id ? 'active' : ''}`}
              aria-current={view === t.id ? 'page' : undefined}
            >
              {t.label}
              {t.badge !== undefined && (
                <span className="nav-badge">{t.badge}</span>
              )}
            </button>
          ))}
        </nav>

        {/* נוריות החיבור לרשויות — צמודות לניווט, כי הן מצב גלובלי של
            המשרד ולא פעולה על מסך מסוים.
            ‼ מאחורי אותו דגל כמו לשונית "בדיקות": בלי עובד מקומי פעיל שתי
            הנוריות אפורות ומושבתות, ואין טעם להוסיף לכותרת של הפרודקשן שני
            כפתורים שאי אפשר ללחוץ עליהם. */}
        {checksTab && <AuthorityConnectionButtons userId={user?.id} />}

        <div className="header-actions">
          {/* אשכול הכלים — מופרד מהניווט בקו, כדי שיהיה ברור שזה לא מקום עבודה.
             ‼ במסך הלקוחות הקישור מוסתר (הכרעת גיא, V3.3): המסך נשאר שקט,
             וההצעות נגישות משם דרך האדם עצמו — לא דרך הכותרת. */}
          {/* ‼ "הצעות מחיר" ירד מהכותרת לגמרי. שני יעדים גלובליים בלבד —
              לקוחות ומשימות. הצעה נולדת בהקשר העסקי שלה: במסע של הליד, או
              ב"הסכם ותשלומים" של לקוח קיים לשירות נוסף. הכפתור בכותרת הפך
              את בניית ההצעות לאפליקציה נפרדת שצריך לנווט אליה. */}
          {/* ‼ מונה החומרים שהגיעו מרו״ח קודם. עד עכשיו שום דבר לא סימן
              שהגיעו קבצים — לא מייל ולא סימן — והדרך היחידה לדעת הייתה
              להיכנס ללקוח ולבדוק. הלחיצה מובילה ישר למסמכים, ושם גם נסגר
              הסימן (ראה unseenUploads). */}
          {newUploadsTotal > 0 && (
            <div className="header-account">
              <button
                type="button"
                className={`header-user ${inboxOpen ? 'is-open' : ''}`}
                aria-label={`${newUploadsTotal} קבצים חדשים מרו״ח קודם`}
                aria-expanded={inboxOpen}
                onClick={() => setInboxOpen(v => !v)}
                style={{ gap: '.3rem', padding: '.2rem .5rem' }}
              >
                <span aria-hidden="true" style={{ fontSize: '1rem' }}>📄</span>
                <span className="nav-badge">{newUploadsTotal}</span>
              </button>
              {inboxOpen && (
                <div style={{
                  position: 'absolute', insetInlineStart: 0, top: 'calc(100% + .4rem)',
                  minWidth: '15rem', maxWidth: '20rem', zIndex: 40,
                  background: 'var(--surface)', border: '1px solid var(--line)',
                  borderRadius: '.6rem', boxShadow: '0 8px 24px rgba(0,0,0,.12)',
                  padding: '.4rem',
                }}>
                  <div style={{
                    fontSize: 'var(--fs-12)', color: 'var(--muted)', padding: '.3rem .5rem .4rem',
                  }}>חומרים שהגיעו מרו״ח קודם</div>
                  {[...newUploadsByClient.entries()].map(([cid, count]) => {
                    const c = clients.find(x => x.id === cid);
                    return (
                      <button
                        key={cid}
                        type="button"
                        className="btn btn-sm btn-ghost"
                        style={{ display: 'flex', width: '100%', justifyContent: 'space-between', gap: '.5rem' }}
                        onClick={() => { setInboxOpen(false); handleOpenPrevAccountantMaterials(cid); }}
                      >
                        <span>{c ? `${c.firstName} ${c.lastName ?? ''}`.trim() : 'לקוח'}</span>
                        <span className="nav-badge">{count}</span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          <div className="header-account">
            <button
              type="button"
              className={`header-user ${accountMenuOpen ? 'is-open' : ''}`}
              title={displayName || user.email || ''}
              aria-label="חשבון והגדרות"
              aria-expanded={accountMenuOpen}
              onClick={() => setAccountMenuOpen(v => !v)}
            >
              {avatarUrl ? (
                <img className="header-user-avatar" src={avatarUrl} alt="" />
              ) : (
                <span className="header-user-avatar">
                  {(displayName || user.email || '?').slice(0, 1).toUpperCase()}
                </span>
              )}
            </button>

            {accountMenuOpen && (
              <div className="account-menu">
                <div className="account-menu-id">
                  <div className="account-menu-name">{displayName || user.email}</div>
                  <div className="account-menu-firm">{firmProfile?.firmName || 'גיא ישר · רואה חשבון'}</div>
                </div>
                {/* כלי המערכת — המשרד וידע מס. שניהם שלי ולא של לקוח מסוים,
                    ולכן הם לא תופסים מקום בסרגל שבו העבודה היומיומית חיה. */}
                <button
                  type="button"
                  className={`account-menu-item ${view === 'firmProfile' ? 'is-active' : ''}`}
                  aria-current={view === 'firmProfile' ? 'page' : undefined}
                  onClick={() => {
                    setAccountMenuOpen(false);
                    setView('firmProfile');
                    setSelectedId(null);
                    setSelectedRequestId(null);
                  }}
                >
                  <Icon name="building" size={14} />
                  <span>המשרד</span>
                </button>
                <button
                  type="button"
                  className={`account-menu-item ${view === 'reference' ? 'is-active' : ''}`}
                  aria-current={view === 'reference' ? 'page' : undefined}
                  onClick={() => {
                    setAccountMenuOpen(false);
                    setView('reference');
                    setSelectedId(null);
                    setSelectedRequestId(null);
                    setEditingQuotationId(null);
                  }}
                >
                  <Icon name="book" size={14} />
                  <span>ידע מס</span>
                </button>

                <span className="account-menu-sep" aria-hidden="true" />

                {/* מצב כהה הוא העדפה, לא פעולה — מקומו בתפריט ולא בסרגל (§4.1) */}
                <button
                  type="button"
                  className="account-menu-item account-menu-toggle"
                  role="menuitemcheckbox"
                  aria-checked={theme === 'dark'}
                  onClick={toggleTheme}
                >
                  <Icon name="moon" size={14} />
                  <span>מצב כהה</span>
                  <span className={`account-switch ${theme === 'dark' ? 'is-on' : ''}`} aria-hidden="true" />
                </button>
                <button
                  type="button"
                  className="account-menu-item"
                  onClick={async () => { setAccountMenuOpen(false); await signOut(); }}
                >
                  <Icon name="logout" size={14} />
                  <span>התנתק</span>
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      <main className="main">
        <ErrorBoundary resetKey={view}>
        <LegacyMigrationBanner knownClientIds={new Set(clients.map(c => c.id))} />
        <FailedNotificationsBanner failures={failedNotifications} />

        {view === 'tasks' && (
          <TasksWorkspace
            tasks={tasks}
            clients={clients}
            onSelectTask={openEditTaskModal}
            onAddTask={(presetClientId) => openNewTaskModal(presetClientId)}
            onReorderOpen={handleReorderOpenTask}
            onSelectClient={handleSelectClient}
            onboardingSteps={onboarding.steps}
            onOpenOnboarding={handleOpenClientOnboarding}
            quotations={quotations}
            onOpenQuotation={(id) => { const q = quotations.find(x => x.id === id); if (q) handleOpenQuotation(q); }}
            onLoadSampleTasks={handleLoadSampleTasks}
            clientFilter={tasksClientFilter}
            onClearClientFilter={() => setTasksClientFilter(null)}
          />
        )}

        {view === 'list' && personDirectory && (
          <PersonDirectory
            clients={clients}
            leads={leads}
            tasks={tasks}
            quotations={quotations}
            onboardingSteps={onboarding.steps}
            quickViewId={quickViewId}
            onQuickView={setQuickViewId}
            onAdd={handleAddNew}
            onOpenFullCase={handleSelectClient}
            onRequestMaterials={handleOpenClientOnboarding}
            onOpenQuotation={(id) => {
              const q = quotations.find(x => x.id === id);
              if (q) handleOpenQuotation(q);
            }}
            onNewQuotation={handleNewQuotation}
            onNewQuotationForLead={handleNewQuotationForLead}
            onOpenLead={(leadId) => { setFocusLeadId(leadId); if (!journeyUi) setView('quotations'); }}
            onOpenRequest={handleSelectRequest}
            onOpenTask={openEditTaskModal}
            onOpenRepresentation={handleOpenClientRepresentation}
            onContinueLead={handleContinueLead}
            onDeleteLead={async (lead) => { await deleteLead(lead.id); }}
            charges={charges}
            onAddCharge={async (clientId, description, amount, dueDate) => { await addCharge(clientId, description, amount, dueDate); }}
            onRequestChargePayment={requestChargePayment}
            onMarkChargePaid={async (charge) => { await markChargePaid(charge); }}
          />
        )}

        {view === 'list' && !personDirectory && (
          <ClientList
            clients={clients}
            requests={requests}
            tasks={tasks}
            onSelect={handleSelectClient}
            onAdd={handleAddNew}
            onDelete={handleDelete}
            onArchive={async (id) => { await setClientLifecycleStage(id, 'archived'); }}
            onLoadSamples={handleLoadSamples}
            onAddRequest={handleAddRequest}
            onSelectRequest={handleSelectRequest}
            leadIdByClient={leadIdByClient}
            onOpenLead={(leadId) => { setFocusLeadId(leadId); if (!journeyUi) setView('quotations'); }}
            journeyUi={journeyUi}
            leadsPanel={journeyUi ? (
              <LeadsPanel
                leads={leads}
                quotations={quotations}
                onSave={async l => { await updateLead(l); }}
                onCreate={async l => { await addLead(l); }}
                onDelete={async l => { await deleteLead(l.id); }}
                onNewQuotation={handleNewQuotationForLead}
                focusLeadId={focusLeadId ?? undefined}
                onFocusConsumed={() => setFocusLeadId(null)}
                /* ‼ בלי שני אלה "+ ליד" לא פתח כלום: הוא הדליק את openNewLead
                   וניווט למסך ההצעות — אבל שם, כש-journeyUi דלוק, לוח הלידים
                   כלל אינו מוצג. הלידים עברו למסך הלקוחות ומתג הפתיחה נשאר
                   מאחור. עכשיו הכפתור פותח את הטופס במקום שבו הלידים חיים. */
                creating={openNewLead}
                onCreatingChange={setOpenNewLead}
              />
            ) : undefined}
            onboardingSteps={onboarding.steps}
            engagements={onboarding.engagements}
            onOpenOnboarding={handleOpenClientOnboarding}
            leads={leads}
            onNewLead={() => { setOpenNewLead(true); if (!journeyUi) setView("quotations"); }}
            newLeadRequested={openNewLead}
            onNewQuotation={handleNewQuotation}
          />
        )}

        {view === 'form' && (
          <ClientWorkspace
            client={selectedClient}
            clients={clients}
            tasks={tasks}
            onSave={handleSave}
            onCancel={handleCancelForm}
            onDelete={handleDelete}
            onSetLifecycleStage={async (id, stage) => { await setClientLifecycleStage(id, stage); }}
            onAddTaskForClient={(clientId, presetTitle) => openNewTaskModal(clientId, presetTitle)}
            onSelectTask={openEditTaskModal}
            onToggleTaskDone={handleToggleTaskDone}
            onChangeTaskStatus={handleChangeTaskStatus}
            onChangeTaskBall={handleChangeTaskBall}
            onChangeTaskCategory={handleChangeTaskCategory}
            onReorderTask={handleReorderTask}
            onDeleteTask={handleDeleteTask}
            onOpenAnnualReport={(clientId, taxYear) => {
              setAnnualReportSelection({ clientId, taxYear });
              setAnnualRoute({ clientId, taxYear });
              setView('annualReport');
            }}
            initialTab={clientInitialTab}
            onboardingEnabled={onboardingEnabled}
            engagements={onboarding.engagements}
            onboardingSteps={onboarding.steps}
            onboardingEvents={onboarding.events}
            onboardingLoading={onboarding.loading}
            advanceOnboardingStep={onboarding.advance}
            refreshOnboarding={onboarding.refresh}
            onOpenReleaseLetter={(clientId, stepId, mode) => openReleaseLetter(clientId, stepId, mode)}
            onOpenRepresentation={handleOpenClientRepresentation}
            journeyUi={journeyUi}
            checksTabEnabled={checksTab}
            quotations={quotations}
            onOpenQuotation={(id) => {
              const q = quotations.find(x => x.id === id);
              if (q) handleOpenQuotation(q);
            }}
            onNewQuotation={(clientId, kind) => handleNewQuotationForClient(clientId, kind)}
            lead={leads.find(l => l.convertedClientId === selectedClient?.id)}
            onEditLead={(leadId) => { setFocusLeadId(leadId); if (!journeyUi) setView('quotations'); }}
            charges={charges}
            onMarkChargePaid={markChargePaid}
            onOpenClientTasks={(clientId) => { setTasksClientFilter(clientId); setSelectedId(null); setView('tasks'); }}
            onCreateSpouseClient={handleCreateClientFromSpouse}
            onOpenClient={handleSelectClient}
          />
        )}

        {view === 'calculator' && (
          selectedClient ? (
            <TaxCalculator
              client={selectedClient}
              onBack={() => setView('form')}
            />
          ) : (
            <div className="empty-state">
              <div className="empty-state-title">הלקוח לא נמצא</div>
              <button className="btn btn-primary" onClick={() => { setView('list'); setSelectedId(null); }}>חזרה לרשימה</button>
            </div>
          )
        )}

        {view === 'documents' && (
          selectedClient ? (
            <DocumentManager
              client={selectedClient}
              allClients={clients}
              onBack={() => setView('form')}
              onApplyExtractedData={handleApplyExtractedData}
            />
          ) : (
            <div className="empty-state">
              <div className="empty-state-title">הלקוח לא נמצא</div>
              <button className="btn btn-primary" onClick={() => { setView('list'); setSelectedId(null); }}>חזרה לרשימה</button>
            </div>
          )
        )}

        {view === 'reference' && (
          <TaxCenter
            onBack={() => setView('list')}
            freshnessTaskExists={quarterlyTaskExists(tasks)}
            onCreateFreshnessTask={() => { if (!quarterlyTaskExists(tasks)) void addTask(buildQuarterlyFreshnessTask()); }}
          />
        )}

        {view === 'annualReport' && (
          <AnnualReport
            clients={clients}
            userId={user?.id}
            onUpdateClient={updateClient}
            onClientLocallyUpdated={applyClientLocally}
            initialSelection={annualReportSelection}
            onConsumeInitialSelection={() => setAnnualReportSelection(null)}
          />
        )}

        {view === 'quotations' && (
          <QuotationsPipeline
            journeyUi={journeyUi}
            quotations={quotations}
            leads={leads}
            clients={clients}
            engagements={onboarding.engagements}
            focusLeadId={focusLeadId ?? undefined}
            onFocusLeadConsumed={() => setFocusLeadId(null)}
            openNewLead={openNewLead}
            onOpenNewLeadConsumed={() => setOpenNewLead(false)}
            onNew={handleNewQuotation}
            onOpen={handleOpenQuotation}
            onConvert={handleConvertQuotation}
            onRelease={handleReleaseLetter}
            onRemind={handleRemindQuotation}
            onCancel={async q => { await cancelQuotation(q); }}
            onDelete={async q => {
              await deleteQuotation(q);
              // ההצעה שנמחקה עלולה להיות זו שפתוחה בבונה — מנקים את הבחירה
              if (editingQuotationId === q.id) setEditingQuotationId(null);
            }}
            onSaveLead={async l => { await updateLead(l); }}
            onCreateLead={async l => { await addLead(l); }}
            onDeleteLead={async l => { await deleteLead(l.id); }}
            onNewQuotationForLead={handleNewQuotationForLead}
          />
        )}

        {view === 'quotationBuilder' && (
          <QuotationBuilder
            profile={firmProfile}
            services={catalogServices}
            templates={quotationTemplates}
            leads={leads}
            clients={clients}
            existing={editingQuotation}
            initialLeadId={newQuotationLeadId ?? undefined}
            initialClientId={newQuotationClientId ?? undefined}
            initialKind={newQuotationKind}
            currentEngagement={newQuotationClientId ? currentEngagement(onboarding.engagements, newQuotationClientId) : undefined}
            existingQuotations={quotations}
            checkRepEmailConflict={repEmailConflictMessage}
            onSaveDraft={handleSaveQuotationDraft}
            onSend={handleSendQuotation}
            onBack={() => {
              setEditingQuotationId(null);
              // אחרי שליחה — נוחתים על הכרטיס שההצעה יצאה אליו: שם רואים את
              // המסע ואת ההצעה הממתינה. יציאה בלי שליחה חוזרת לרשימת הלקוחות,
              // כי מסך ההצעות הישן אינו חלק מהמבנה כש-journeyUi דלוק.
              if (postSendClientId.current) {
                const target = postSendClientId.current;
                postSendClientId.current = null;
                setQuickViewId(null);
                setSelectedId(target);
                setClientInitialTab('journey');
                setView('form');
                return;
              }
              setView(journeyUi ? 'list' : 'quotations');
            }}
          />
        )}

        {view === 'firmProfile' && (
          firmProfile ? (
            <FirmProfileConsole
              profile={firmProfile}
              clients={clients}
              onSave={async (p: FirmProfile) => { await saveProfile(p); }}
            />
          ) : (
            <div className="app-loading">טוען את פרופיל המשרד…</div>
          )
        )}

        {view === 'requestNew' && (
          <RepresentationRequestForm
            request={selectedRequest}
            onSave={handleSaveRequest}
            onCancel={() => { setView('list'); setSelectedRequestId(null); }}
            onOpenFill={handleOpenFill}
          />
        )}

        {view === 'requestReview' && (
          selectedRequest ? (
            <RepresentationRequestReview
              request={selectedRequest}
              onBack={() => { setView('list'); setSelectedRequestId(null); }}
              onProduceWithSetup={handleProduceFormWithSetup}
              onSaveSignedPdf={handleSaveSignedPdf}
              onMarkSentToShaam={handleMarkSentToShaam}
              onSign={handleAccountantSign}
              onMarkActive={handleMarkActive}
              onDelete={handleDeleteRequest}
              onOpenFill={handleOpenFill}
              onOpenClientDocs={handleOpenClientDocs}
              niIncluded={!!clients.find(c => c.id === selectedRequest.linkedClientId)?.authorityRepresentations?.nationalInsurance}
              niCoversSpouse={effectiveNiCoversSpouse(clients.find(c => c.id === selectedRequest.linkedClientId))}
              onSaveExecution={handleSaveExecution}
              linkedClient={clients.find(c => c.id === selectedRequest.linkedClientId)}
              onConfirmRegisteredSpouse={handleConfirmRegisteredSpouse}
            />
          ) : (
            <div className="empty-state">
              <div className="empty-state-title">הבקשה לא נמצאה</div>
              <button className="btn btn-primary" onClick={() => { setView('list'); setSelectedRequestId(null); }}>חזרה לרשימה</button>
            </div>
          )
        )}

        {view === 'requestFill' && (
          selectedRequest ? (
            <RepresentationFillForm
              request={selectedRequest}
              onSubmit={handleSubmitFill}
              onCancel={() => setView('requestReview')}
            />
          ) : (
            <div className="empty-state">
              <div className="empty-state-title">הבקשה לא נמצאה</div>
              <button className="btn btn-primary" onClick={() => { setView('list'); setSelectedRequestId(null); }}>חזרה לרשימה</button>
            </div>
          )
        )}
        </ErrorBoundary>
      </main>

      {/* סרגל ניווט תחתון — מופיע רק במסכי טלפון */}
      <nav className="mobile-nav">
        {navTabs.map(t => (
          <button
            key={t.id}
            type="button"
            className={`mobile-nav-item ${view === t.id || (t.id === 'list' && view === 'form') ? 'active' : ''}`}
            onClick={() => {
              setView(t.id);
              setSelectedId(null);
              setSelectedRequestId(null);
              setEditingQuotationId(null);
              setQuickViewId(null);
            }}
          >
            <span className="mobile-nav-label">{t.label}</span>
            {t.badge !== undefined && <span className="mobile-nav-badge">{t.badge}</span>}
          </button>
        ))}
      </nav>

      {taskModalState && (
        <TaskForm
          task={taskModalState.task}
          clients={clients}
          presetClientId={taskModalState.presetClientId}
          presetTitle={taskModalState.presetTitle}
          presetCategory={taskModalState.presetTitle ? 'institutions' : undefined}
          onSave={handleSaveTask}
          onCancel={() => setTaskModalState(null)}
          onDelete={handleDeleteTask}
          onUpdateClient={updateClient}
        />
      )}

      {showNewPerson && (
        <NewPersonDialog
          clients={clients}
          onCancel={() => setShowNewPerson(false)}
          onOpenExisting={(clientId) => { setShowNewPerson(false); handleSelectClient(clientId); }}
          onConfirmQuote={handleConfirmNewPersonQuote}
          onConfirmRepresentation={handleConfirmNewPersonRepresentation}
          onMintApplyLink={mintApplyLink}
          onSendApplyLinkEmail={sendApplyLinkEmail}
        />
      )}

      {continuationLead && (
        <NewPersonDialog
          clients={clients}
          onCancel={() => setContinuationLead(null)}
          onOpenExisting={(clientId) => { setContinuationLead(null); handleSelectClient(clientId); }}
          onConfirmQuote={() => handleContinueLeadQuote(continuationLead)}
          onConfirmRepresentation={(basics) => handleContinueLeadRepresentation(continuationLead, basics)}
          onMintApplyLink={mintApplyLink}
          onSendApplyLinkEmail={sendApplyLinkEmail}
          continuationFor={{
            fullName: continuationLead.fullName,
            phone: continuationLead.phone || undefined,
            email: continuationLead.email || undefined,
          }}
        />
      )}

      {pendingRepresentationClient && (
        <RepresentationOnboardingDialog
          onCreate={(data) => handleAttachRepresentation(pendingRepresentationClient, data)}
          onCancel={() => setPendingRepresentationClient(null)}
          checkEmailConflict={(email) => repEmailConflictMessage(email, pendingRepresentationClient.id)}
          initialName={`${pendingRepresentationClient.firstName} ${pendingRepresentationClient.lastName}`.trim()}
          initialEmail={pendingRepresentationClient.email || undefined}
          alreadyRepresented={alreadyRepresentedFor(pendingRepresentationClient)}
        />
      )}

      {showOnboarding && (
        <RepresentationOnboardingDialog
          onCreate={handleCreateRepresentation}
          onCancel={() => setShowOnboarding(false)}
          checkEmailConflict={repEmailConflictMessage}
        />
      )}

      {/* ‼ "ערוך פרטי ליד" ניווט עד עכשיו למסך ההצעות הישן — מסך שירד מהסרגל
          במבנה "המסע הוא הכרטיס", ובו לוח הלידים כלל אינו מוצג. התוצאה הייתה
          נחיתה על טבלת הצעות במקום על הליד שביקשו לערוך. עכשיו הטופס נפתח
          במקום, מעל המסך שממנו לחצו. מוצג רק כשלוח הלידים עצמו אינו מורכב
          (שם הוא כבר צורך את focusLeadId ופותח את אותו טופס). */}
      {journeyUi && focusLeadId && !(view === 'list' && !personDirectory) && (() => {
        const lead = leads.find(l => l.id === focusLeadId);
        if (!lead) return null;
        return (
          <LeadForm
            lead={lead}
            onSave={async l => { await updateLead(l as Partial<Lead> & { id: string }); setFocusLeadId(null); }}
            onCancel={() => setFocusLeadId(null)}
          />
        );
      })()}

      {remindPreview && (
        <EmailPreviewDialog
          heading={`תזכורת ללקוח - הצעה ${remindPreview.quotation.quotationNumber}`}
          preloaded={{ subject: remindPreview.subject, to: remindPreview.to, html: remindPreview.html }}
          sendVia={sendQuotationReminder}
          onSent={() => { /* החלון מציג את האישור; ההצעה כבר עודכנה */ }}
          onClose={() => setRemindPreview(null)}
        />
      )}

      {releaseFor && (() => {
        const step = onboarding.steps.find(s => s.id === releaseFor.stepId);
        const ctx = {
          clientName: releaseFor.clientName,
          taxFileNumber: releaseFor.taxFileNumber,
          spouse: releaseFor.spouse,
          prevAccountantName: releaseFor.prevAccountant.name,
        };
        const brand = deriveQuotationBrand(firmProfile);
        const releaseTemplate = releaseTemplateFrom(firmProfile?.settings);
        return (
        <ReleaseLetterDialog
          template={releaseTemplate}
          clientId={releaseFor.clientId}
          clientName={releaseFor.clientName}
          taxFileNumber={releaseFor.taxFileNumber}
          spouse={releaseFor.spouse}
          clientEmail={releaseFor.clientEmail}
          prevAccountant={releaseFor.prevAccountant}
          brand={brand}
          stepId={releaseFor.stepId}
          mode={releaseFor.mode}
          followUpItems={releaseFor.followUpItems}
          draft={readReleaseDraft(
            step?.payload.releaseDraft, ctx, brand.firmName,
            new Date().toISOString().slice(0, 10), releaseTemplate)}
          onSaveDraft={d => void onboarding.advance(releaseFor.stepId, 'note', { releaseDraft: d })}
          onSent={({ materialKeys, objectionDueDate, subject, body, materials, to, draft, lastPeriodPrev, outstandingItems }) => {
            const stepId = releaseFor.stepId;
            const nowIso = new Date().toISOString();
            const history = [
              ...(step?.payload.releaseHistory ?? []),
              {
                at: nowIso, to: to ?? '', subject: subject ?? '',
                kind: releaseFor.mode === 'follow_up' ? ('follow_up' as const) : ('letter' as const),
                ...(releaseFor.mode === 'follow_up'
                  ? { items: releaseFor.followUpItems.map(i => i.label) } : {}),
              },
            ];

            if (releaseFor.mode === 'follow_up') {
              // ‼ עדכון המשך אינו מכתב שני: הסטטוס, המכתב המקורי והראיות שלו
              // נשארים כמו שהם — רק ההיסטוריה גדלה, והפריטים מסומנים כנמסרו.
              void onboarding.advance(stepId, 'note', {
                releaseHistory: history,
                note: `נשלח עדכון לרו״ח הקודם (${releaseFor.followUpItems.length} פריטים)`,
              });
              markFollowUpNotified(releaseFor.clientId, releaseFor.followUpItems.map(i => i.key), nowIso);
              return;
            }

            // ‼ תאריך היעד הוא חלון ההתנגדות, לא מועד קבלת החומרים.
            // עברו שלושת ימי העסקים בלי תשובה — אין התנגדות, וממשיכים.
            // שלושת הימים הם כלל עבודה פנימי של המשרד, לא חוק או תקנה.
            void onboarding.advance(stepId, 'wait_client', {
              ball: 'prev_accountant',
              dueDate: objectionDueDate,
              note: 'מכתב העברת הטיפול נשלח לרו״ח הקודם · הלקוח מכותב',
              objectionDueDate,
              requestedMaterials: materialKeys,
              // חלוקת האחריות כפי שנשלחה — הכרטיס מציג אותה, ופעולת "הוגש"
              // מתעדכנת עליה.
              ...(lastPeriodPrev ? { lastPeriodPrev } : {}),
              ...(outstandingItems ? { outstandingItems } : {}),
              // הנוסח שנשלח בפועל — דף הרו"ח הקודם מציג אותו, לא נוסח שנבנה מחדש.
              releaseSubject: subject,
              releaseBody: body,
              releaseSentAt: nowIso,
              releaseSentTo: to,
              releaseHistory: history,
              ...(draft ? { releaseDraft: draft } : {}),
            });
            // רשימת החומרים שנתבקשו בפועל הופכת לצ'קליסט המעקב — אחרת עוקבים
            // אחרי רשימה גנרית שאינה מה שביקשנו.
            syncRequestedMaterials(releaseFor.clientId, materialKeys, materials);
            // ‼ ההשלכה הייצוגית נגזרת, לא נשאלת (הכרעת גיא 2026-08-18): דוח
            // שנתי / הצהרת הון שנשארו אצל הקודם מוגשים רק על ידי המייצג הראשי,
            // ולכן הרישום אצלנו יורד למשני עד השלמתם. הטריגר במסד פותח מזה
            // לבד את שלב "שדרוג לייצוג ראשי". מעבר נקי — לא נוגעים ברמות.
            if (unfiledBlocking(outstandingItems).length > 0) {
              const client = clients.find(c => c.id === releaseFor.clientId);
              const areas = client?.authorityRepresentations;
              if (client && areas && Object.values(areas).some(a => a?.level === 'primary')) {
                void updateClient({ ...client, authorityRepresentations: applySecondaryLevels(areas) });
              }
            }
          }}
          onClose={() => setReleaseFor(null)}
        />
        );
      })()}

      {convertingQuotation && (() => {
        const lead = convertingQuotation.leadId ? leads.find(l => l.id === convertingQuotation.leadId) : undefined;
        const client = convertingQuotation.clientId ? clients.find(c => c.id === convertingQuotation.clientId) : undefined;
        return (
          <RepresentationOnboardingDialog
            initialName={lead?.fullName ?? convertingQuotation.snapshot?.recipientName ?? ''}
            initialEmail={lead?.email ?? convertingQuotation.snapshot?.recipientEmail ?? ''}
            isTransfer={!!(lead?.hasPreviousAccountant || client?.hasPreviousAccountant)}
            initialPrevAccountant={{
              name:  lead?.prevAccountantName  ?? client?.prevAccountantName,
              email: lead?.prevAccountantEmail ?? client?.prevAccountantEmail,
              phone: lead?.prevAccountantPhone ?? client?.prevAccountantPhone,
            }}
            onCreate={handleCreateRepresentationFromQuotation}
            onCancel={() => setConvertingQuotation(null)}
            checkEmailConflict={repEmailConflictMessage}
          />
        );
      })()}
    </div>
  );
}

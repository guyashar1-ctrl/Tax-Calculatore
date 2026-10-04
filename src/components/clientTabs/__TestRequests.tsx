// ─── מסך בדיקה למשטח הבקשות המפושט + ביטול בקשת ב"ל לאדם ───────────────────────
// ‼ DEV בלבד. אין כאן מסד: כל קריאה ל-supabase נענית מכאן (בלי רשת), והביטול
// מתנהג לפי הכללים של השרת (212) על נתוני הבדיקה — כדי שאפשר יהיה לבדוק את כל
// המצבים בדפדפן ובטלפון בלי לגעת בלקוח או ברשות.
//
//   ?test-requests                 — מעט בקשות · ריצת קליטה פעילה (שלב שני ממתין) · תזכורת במגש
//   ?test-requests&sc=many         — הרבה בקשות, שמות ארוכים, כל הסוגים · ריצה ידנית בעצירה עם
//                                    גרסה חדשה והצעה · מייל שלא ידוע אם יצא · בקשה במסלול בשם
//                                    בן הזוג (עריכה בלי «לקרוא ולאשר»; «דלג» במסלול = «אין צורך»)
//   ?test-requests&sc=ni           — לקוח + בת זוג בב"ל: לפני שליחה / אחרי שליחה
//   ?test-requests&sc=approved     — ב"ל מאושר (אין ביטול) + בת זוג שנשלחה לה
//   ?test-requests&sc=empty        — אין בקשות פתוחות
//   ── סבב 4 ──
//   ?test-requests&sc=ni-gated     — «ייצוג מול הרשויות» אחד: הדסה ממתינה לחתימה, ב"ל של לקוח12 —
//                                    חסרים פרטים ⇒ «השלמת פרטים» בשורה הראשית (מקרה הצילום)
//   ?test-requests&sc=rep-done     — בקשת הייצוג הושלמה: ב"ל של בת הזוג עומד לבד, עם הקשר;
//                                    וב"ל מבקשת ייצוג קודמת
//   ?test-requests&sc=shaam-id     — ייצוג לחתימה+חותמת, צילומי תעודה לשע״ם לשניהם, וב"ל בלי שלב
//                                    (שורת קריאה בלבד מהביצוע)
//   ?test-requests&sc=chain-hidden — פייפרלס שהחלק השני דורש אותך · מכתב שנחתם והחומרים בדרך ·
//                                    אישור אישי של בת הזוג בתוך הבקשה של בעל הכרטיס
//   ?test-requests&sc=problem      — שלוש בקשות «לא נוצרה» (נמחקה / ריקה בספרייה / תקלה)
//   ?test-requests&sc=legacy-review — משימה ישנה בלי תוכן בדף · משימה פנימית «ממתין ללקוח» ·
//                                    בקשה שהלקוח השלים (לבדיקה, לא «עבודה פנימית»)
//   ?test-requests&sc=kind-hold    — הקליטה מחכה לסוג העוסק ⇒ שורה במגש + «לקביעת סוג העוסק»,
//                                    שלב במסלול שמחכה לסוג, ו«סגירת הקליטה» (⋯) נחסמת עם קישור לשדה.
//                                    &kind=failed — הסוג נקבע והפתיחה נכשלה ⇒ «לפתוח את הבקשות שחיכו»;
//                                    &kindretry=fail — «השרת» עונה release_failed
//   ── הכרעות 03.10 ──
//   ?test-requests&sc=returning    — לקוח שחוזר: התקשרות קודמת שהסתיימה, קליטה חדשה שטרם פורסמה.
//                                    בקשה שעברה מההתקשרות הקודמת (פורסמה לפני הקליטה) — «בדף מ-…» +
//                                    «מההתקשרות הקודמת · עד …»; בקשות הקליטה החדשה — «ממתין לפרסום»,
//                                    ורק הן נספרות ב«עוד לא בדף» / «פרסם בדף». הפרסום פותח את הקליטה.
//   &intake=unpublished            — בכל תרחיש אחר: הקליטה (לקוח ראשון) טרם פורסמה — מה שפורסם בה
//                                    «ממתין לפרסום» ונספר ב«עוד לא בדף»; «ייצוג מול הרשויות» בדף תמיד.
//   &unk=open|closed|changed|all   — מייל שלא ידוע אם יצא, בכל תרחיש: בתוך היממה (retryUntil בעתיד),
//                                    אחרי היממה (retryUntil עבר), כתובת שהשתנתה (toEmail ≠ הכרטיס).
//                                    &cause=cut_off|no_answer|provider_error|provider_busy|accepted_no_id|retry_rejected.
//                                    «שלח שוב» עונה כמו reclaim_unknown_client_notice (retry_expired /
//                                    recipient_changed משאירים «לא ידוע»), ושחרור — כמו resolve_client_notice.
//                                    &reclaim=expired|changed — «שלח שוב» נענה כך גם כשהמסך חושב אחרת.
//   &mail=unknown                  — ביומן המיילים: בקשה אוטומטית (⚡) שהמייל שלה «לא ידוע אם יצא», ומכתב
//                                    לרו״ח הקודם שלא ידוע אם יצא (בלי releaseSentAt — כמו send-release-email).
//   &rep=<status>                  — מצב בקשת הייצוג (pending_fill…active); &send=unsent — הטופס מוכן, מייל לא יצא
//   &cancel=ok|running|active|race|error — איך «השרת» עונה לביטול
//   ── סבב 5 ──
//   &approval=required|spouse|both|declared|optional — «אישור הייצוג באזור האישי» פתוח (עם &rep=awaiting_authorities):
//                                    שע״ם ממתינה לאישור של הלקוח / של בן הזוג / של שניהם; הלקוח דיווח; זירוז בלבד
//   &upg=due|ready|later           — «שדרוג לייצוג ראשי»: הגיע מועד התזכורת / הרו״ח הקודם השלים / עוד לא
//   advance (סיימתי, חזרה אליי, סמן כחסום, הערה…) מתנהג כמו advance_onboarding_step ורושם ביומן (events).
//   &theme=dark
//
// כל קריאה נרשמת ב-window.__rqCalls (לבדיקות אוטומטיות).

import { useMemo, useState, useSyncExternalStore } from 'react';
import type { Client, NiTracking } from '../../types';
import type { Engagement, OnboardingEvent, OnboardingStep } from '../../types/onboarding';
import { parseKindHold } from '../../types/onboarding';
import type { ReadyUnknownNotice } from '../../hooks/readyToSendLoader';
import type { Quotation } from '../../types/quotations';
import { supabase } from '../../lib/supabase';
import type { ClientFlowRun, RunActionState, RunStage } from '../../features/flows/api';
import type { FlowDefinition, FlowTrigger, OfficeFlow } from '../../features/flows/types';
import OnboardingTab from './OnboardingTab';
import { representationStatusLabel } from '../../utils/representationAction';

const CLIENT_ID = 'rq-client';
const ENG_ID = 'rq-eng';
// ‼ אין כאן שום תופעת לוואי ברמת המודול: הקובץ מיובא סטטית ב-App, ולכן קוד
// שרץ בטעינה היה מחליף את supabase גם באפליקציה האמיתית. הכול בתוך install().
const qs = () => new URLSearchParams(window.location.search);
let SC = 'few';
let CANCEL_MODE = 'ok';

// ── נתוני הבדיקה ─────────────────────────────────────────────────────────────
type Track = { client?: NiTracking; spouse?: NiTracking };
interface Store {
  steps: OnboardingStep[];
  client: Client;
  ni: Track;
  /** ההתקשרות — חיה במאגר, כדי ש«לפתוח את הבקשות שחיכו» ישנה אותה כמו בשרת. */
  engagements: Engagement[];
  /** היומן (onboarding_events) — מה ש-advance רושם: הערות, סיבת חסימה. */
  events: OnboardingEvent[];
}

const ago = (days: number) => new Date(Date.now() - days * 86400000).toISOString();
const inDays = (days: number) => new Date(Date.now() + days * 86400000).toISOString().slice(0, 10);
// ‼ sc=returning — ההתקשרות שהסתיימה, והקליטה החדשה (נוצרה לפני כל מה שפורסם בה).
const OLD_ENG_ID = 'rq-eng-old';
const RETURNING_ENDED_AT = ago(60);
const RETURNING_INTAKE_AT = ago(2.5);

function step(p: Partial<OnboardingStep> & Pick<OnboardingStep, 'id' | 'stepType' | 'status' | 'ball'>): OnboardingStep {
  return {
    userId: 'rq-user', engagementId: ENG_ID, clientId: CLIENT_ID, track: 'tools', scope: 'person',
    dependsOnStepId: null, dueDate: null, needsAttention: false, payload: {},
    completionMethod: 'manual', completedBy: null, completedAt: null, verifiedAt: null,
    createdAt: ago(20), updatedAt: ago(9), publishedAt: ago(20),
    ...p,
  } as OnboardingStep;
}

const niStep = (id: string, role: 'client' | 'spouse', name: string, status: OnboardingStep['status'], updated = 6) => step({
  id, stepType: 'authority_representation', track: 'authorities', status, ball: status === 'waiting_client' ? 'client' : 'me',
  updatedAt: ago(updated),
  payload: { authority: 'national_insurance', subjectRole: role, subjectName: name,
    title: `ייצוג בביטוח לאומי — ${name}`, representationRequestId: 'rq-req' },
});

function initialStoreBase(): Omit<Store, 'engagements' | 'events'> {
  const longFirst = SC === 'many' ? 'אלכסנדרה-מרגריטה' : 'שרון';
  const longLast = SC === 'many' ? 'בן-שושן ואקנין-רוזנבלום' : 'מזרחי';
  const spouseName = SC === 'many' ? 'יהונתן-אברהם בן-שושן ואקנין' : 'רותם מזרחי';
  const client = {
    id: CLIENT_ID, firstName: longFirst, lastName: longLast, idNumber: '029384756',
    email: 'sharon.m@example.invalid', spouseEmail: 'rotem@example.invalid',
    familyStatus: 'married', spouseFirstName: spouseName.split(' ')[0], spouseLastName: spouseName.split(' ').slice(1).join(' '),
    spouseName, lifecycleStage: 'onboarding', representationRequestId: 'rq-req', representationStatus: 'pending_signature',
    hasPreviousAccountant: SC === 'many', prevAccountantName: SC === 'many' ? 'רו״ח דנה כהן ושות׳' : undefined,
    prevAccountantEmail: SC === 'many' ? 'dana@prev-firm.example' : undefined,
    authorityRepresentations: {
      incomeTax: { status: 'in_process', level: 'primary' },
      nationalInsurance: { status: 'in_process', targets: SC === 'few' ? ['client'] : ['client', 'spouse'] },
    },
    taxFiles: [
      { id: 'tf1', authority: 'national_insurance', owner: 'client', repStatus: SC === 'approved' ? 'active' : 'pending' },
      { id: 'tf2', authority: 'national_insurance', owner: 'spouse', repStatus: 'pending' },
    ],
  } as unknown as Client;

  const ni: Track = {};
  const steps: OnboardingStep[] = [];
  const add = (s: OnboardingStep) => steps.push(s);
  const fullName = `${longFirst} ${longLast}`;

  if (SC === 'empty') {
    add(step({ id: 'd-kyc', stepType: 'kyc_identification', track: 'internal', status: 'completed', ball: 'me', completedAt: ago(30) }));
    return { steps, client, ni };
  }

  // ── סבב 4 ────────────────────────────────────────────────────────────────
  if (SC === 'ni-gated') {
    // ‼ מקרה הצילום: הורה ממתין להדסה, ב"ל של הדסה נשלח, וב"ל של לקוח12 — חסרים פרטים.
    const c = client as unknown as Record<string, unknown>;
    c.firstName = 'הדסה'; c.lastName = 'לוי'; c.spouseFirstName = 'לקוח12'; c.spouseLastName = 'לוי';
    c.spouseName = 'לקוח12 לוי'; c.spouseIdNumber = undefined;
    add(step({ id: 'rep', stepType: 'representation', track: 'authorities', status: 'waiting_client', ball: 'client', updatedAt: ago(4) }));
    ni.client = { enteredAt: ago(5), referenceNumber: '75160001', deadline: inDays(20), instructionsSentAt: ago(4), instructionsSentWith: 'standalone' };
    add(niStep('ni-c', 'client', 'הדסה לוי', 'waiting_client', 4));
    add({ ...niStep('ni-s', 'spouse', 'לקוח12 לוי', 'pending', 2),
      payload: { ...niStep('ni-s', 'spouse', 'לקוח12 לוי', 'pending').payload,
        prerequisites: { missing: ['spouseIdNumber', 'spouseBirthYear'], required: ['spouseFirstName', 'spouseLastName', 'spouseIdNumber', 'spouseBirthYear'] } } });
    add(step({ id: 'docs', stepType: 'client_documents', status: 'waiting_client', ball: 'client', updatedAt: ago(12),
      payload: { checklist: [{ key: 'bank', label: 'אישור ניהול חשבון בנק', done: false }] } }));
    return { steps, client, ni };
  }

  if (SC === 'rep-done') {
    // הבקשה הושלמה ⇒ אין הורה פתוח: כל חלק עומד לבדו, עם «חלק מבקשת הייצוג שהושלמה».
    add({ ...step({ id: 'rep', stepType: 'representation', track: 'authorities', status: 'completed', ball: 'me' }), completedAt: ago(15) });
    ni.client = { enteredAt: ago(20), referenceNumber: '75160001', deadline: inDays(5), instructionsSentAt: ago(18), confirmedAt: ago(10) };
    add({ ...niStep('ni-c', 'client', fullName, 'completed', 10), completedAt: ago(10) });
    ni.spouse = { enteredAt: ago(8), referenceNumber: '75160002', deadline: inDays(14), instructionsSentAt: ago(7), instructionsSentWith: 'standalone' };
    add(niStep('ni-s', 'spouse', spouseName, 'waiting_client', 7));
    // ב"ל מבקשת ייצוג קודמת (מזהה אחר) — «חלק מבקשת ייצוג קודמת».
    add({ ...niStep('ni-old', 'client', fullName, 'in_progress', 30),
      payload: { ...niStep('ni-old', 'client', fullName, 'in_progress').payload, representationRequestId: 'rq-old', title: 'ייצוג בביטוח לאומי — ישן' } });
    return { steps, client, ni };
  }

  if (SC === 'shaam-id') {
    add(step({ id: 'rep', stepType: 'representation', track: 'authorities', status: 'in_progress', ball: 'me', updatedAt: ago(1) }));
    const shaam = (id: string, person: 'client' | 'spouse', who: string) => step({
      id, stepType: 'custom_request', status: 'pending', ball: 'client', updatedAt: ago(1),
      payload: {
        clientTitle: `צילום תעודה לרשות המסים${person === 'spouse' ? ` - ${who}` : ''}`,
        requiredBy: 'shaam',
        shaamIdentity: { key: `rq-req:${person}:idCard`, requestId: 'rq-req', person, kind: 'idCard', label: 'צילום תעודת זהות', documentIds: ['d1'] },
        requirements: [{ key: 'identity_confirm', kind: 'confirm', label: 'זה הצילום הנכון', done: false, required: true }],
      },
    });
    add(shaam('sid-c', 'client', fullName));
    add(shaam('sid-s', 'spouse', spouseName));
    // קליטה ראשונה: מסלול ב"ל של הלקוח חי רק בביצוע — אין שלב «ייצוג ברשות».
    ni.client = { enteredAt: ago(2), referenceNumber: '75160009', deadline: inDays(28) };
    add(step({ id: 'docs', stepType: 'client_documents', status: 'waiting_client', ball: 'client', updatedAt: ago(3),
      payload: { checklist: [{ key: 'bank', label: 'אישור ניהול חשבון בנק', done: false }] } }));
    return { steps, client, ni };
  }

  if (SC === 'chain-hidden') {
    add(step({ id: 'rep', stepType: 'representation', track: 'authorities', status: 'waiting_client', ball: 'client', updatedAt: ago(4) }));
    // פייפרלס: ההזמנה אצל הלקוח, והחיבור (חלק שני) כבר אצלך — לא נבלע בשורה האפורה.
    add(step({ id: 'pl-i', stepType: 'paperless_invite', status: 'waiting_client', ball: 'client', updatedAt: ago(11),
      payload: { paperlessStatus: 'other_rep', dataSource: 'paperless' } }));
    add(step({ id: 'pl-c', stepType: 'paperless_connection', status: 'pending', ball: 'me', updatedAt: ago(2),
      payload: { paperlessStatus: 'other_rep', dataSource: 'paperless' } }));
    // מכתב השחרור נחתם, והחומרים עוד בדרך ⇒ «ממתין לרו״ח הקודם», לא «הושלם».
    add({ ...step({ id: 'rel', stepType: 'release_letter', track: 'prev_accountant', status: 'completed', ball: 'me', updatedAt: ago(6) }), completedAt: ago(6) });
    add({ ...step({ id: 'rel-d', stepType: 'prev_accountant_details', track: 'prev_accountant', status: 'completed', ball: 'client' }), completedAt: ago(8) });
    add(step({ id: 'rel-m', stepType: 'materials_received', track: 'prev_accountant', status: 'waiting_client', ball: 'prev_accountant', dependsOnStepId: 'rel',
      updatedAt: ago(5), payload: { checklist: [
        { key: 'uniform_file', label: 'קובץ מבנה אחיד', done: false },
        { key: 'ledgers', label: 'כרטסות הנהלת חשבונות', done: true },
      ] } }));
    // אישור אישי של בת הזוג — משימת משרד שנפתחה במקום האישור (215) — בתוך הבקשה של בעל הכרטיס.
    add(step({ id: 'cf-own', stepType: 'custom_request', status: 'waiting_client', ball: 'client', updatedAt: ago(3),
      flowRunId: 'run-c', flowStageKey: 's1', flowItemKey: 'i7',
      payload: { title: 'אישור תנאי שכר טרחה', requirements: [{ key: 'ok', kind: 'confirm', label: 'קראתי ואני מאשר/ת', done: false }] } }));
    add(step({ id: 'cf-task', stepType: 'custom_request', status: 'pending', ball: 'me', updatedAt: ago(3),
      flowRunId: 'run-c', flowStageKey: 's1', flowItemKey: 'i7',
      payload: { title: `אישור אישי של ${spouseName.split(' ')[0]} — «אישור תנאי שכר טרחה»`, subjectRole: 'spouse',
        subjectName: spouseName.split(' ')[0], personalConfirmFor: 'i7', internalTask: true, requirements: [],
        officeNote: `האישור הזה אישי ל${spouseName.split(' ')[0]}, ואין לו/ה דף משלו/ה — לכן הוא לא עבר לדף של בעל הכרטיס. קבל את האישור (בחתימה, במייל או בפגישה) ולחץ «בוצע — התקבל האישור», או «אין צורך».` } }));
    return { steps, client, ni };
  }

  if (SC === 'problem') {
    const prob = (id: string, title: string, cp: Record<string, unknown>) => step({
      id, stepType: 'custom_request', status: 'pending', ball: 'me', updatedAt: ago(1),
      flowRunId: cp.runId ? String(cp.runId) : null, flowStageKey: cp.runId ? 's1' : null, flowItemKey: cp.itemKey ? String(cp.itemKey) : null,
      payload: { title: `לא נוצרה — «${title}»`, internalTask: true,
        creationProblem: { key: `k-${id}`, source: cp.runId ? 'flow' : 'generator', itemTitle: title, attempts: 1, firstAt: ago(1), lastAt: ago(1), ...cp } },
    });
    add(step({ id: 'rep', stepType: 'representation', track: 'authorities', status: 'waiting_client', ball: 'client', updatedAt: ago(4) }));
    add(prob('pr-gone', 'צילום רישיון עסק', { reason: 'library_item_missing', cls: 'library', next: 'add', ref: { kind: 'document', docId: 'qa-gone' }, runId: 'run-p', itemKey: 'gone' }));
    add(prob('pr-empty', 'אישורי ניכוי מס במקור', { reason: 'no_requirements', cls: 'content', next: 'library', ref: { kind: 'template', templateId: 't-9' }, runId: 'run-p', itemKey: 'empty' }));
    add(prob('pr-sys', 'שאלון פתיחת תיק', { reason: 'create_failed', cls: 'system', next: 'retry', entryKey: 'od3', attempts: 2, lastAt: ago(0) }));
    // ‼ B5.1 — סוג שלא נוצר מתוך מסלול ⇒ «פתח את המסלול» נוחת על השלב בבונה; G1/217 — חסר שם בן/בת הזוג (card).
    add(prob('pr-flow', 'חיבור לפייפרלס', { reason: 'not_creatable', cls: 'config', next: 'flow', runId: 'run-p', itemKey: 'pl' }));
    add(prob('pr-card', 'פרטי חשבון בנק · בן/בת הזוג', { reason: 'spouse_name_missing', cls: 'card', next: 'retry', runId: 'run-p', itemKey: 'bank', role: 'spouse' }));
    add(step({ id: 'docs', stepType: 'client_documents', status: 'waiting_client', ball: 'client', updatedAt: ago(12),
      payload: { checklist: [{ key: 'bank', label: 'אישור ניהול חשבון בנק', done: false }] } }));
    return { steps, client, ni };
  }

  if (SC === 'legacy-review') {
    add(step({ id: 'rep', stepType: 'representation', track: 'authorities', status: 'waiting_client', ball: 'client', updatedAt: ago(4) }));
    // ‼ 216 §9: נוצרה בלי ראיה שהיא משימה של המשרד — בדף, בלי שום דבר ללקוח.
    add(step({ id: 'lg-review', stepType: 'custom_request', status: 'waiting_client', ball: 'client', updatedAt: ago(40),
      payload: { title: 'לבדוק מקדמות 2024', clientTitle: 'לבדוק מקדמות 2024', internalTaskReview: true } }));
    // משימה פנימית שהמשרד העביר ל«ממתין ללקוח» — נשארת פנימית, בלי «בדף מ-…».
    add(step({ id: 'lg-wait', stepType: 'custom_request', status: 'waiting_client', ball: 'client', updatedAt: ago(6),
      payload: { title: 'לברר עם הלקוח את הכנסות השכירות', internalTask: true } }));
    // משימה פנימית רגילה — «פתוחה», לא «ממתין ל{שם}».
    add(step({ id: 'lg-own', stepType: 'custom_request', status: 'pending', ball: 'me', updatedAt: ago(2),
      payload: { title: 'להכין טיוטת דוח רבעוני', internalTask: true } }));
    // בקשה שהלקוח השלים (הכדור עבר למשרד) — לבדיקה ברשימה, לא «עבודה פנימית».
    add(step({ id: 'lg-done', stepType: 'custom_request', status: 'in_progress', ball: 'me', needsAttention: true, updatedAt: ago(1),
      payload: { title: 'טופס 106 לשנת 2025', requirements: [{ key: 'f', kind: 'file', label: 'טופס 106', done: true }] } }));
    return { steps, client, ni };
  }

  if (SC === 'kind-hold') {
    add(step({ id: 'rep', stepType: 'representation', track: 'authorities', status: 'waiting_client', ball: 'client', updatedAt: ago(4) }));
    add(step({ id: 'docs', stepType: 'client_documents', status: 'waiting_client', ball: 'client', updatedAt: ago(3),
      payload: { checklist: [{ key: 'bank', label: 'אישור ניהול חשבון בנק', done: false }] } }));
    return { steps, client, ni };
  }

  if (SC === 'returning') {
    // ‼ הכרעה ב (03.10): מה שעבר מההתקשרות הקודמת (217 _carry_open_work_to_engagement) — עם
    // carriedFrom, ופורסם לפני שהקליטה החדשה נוצרה ⇒ בדף. מה שנוצר בקליטה החדשה (פורסם מאז
    // שנוצרה, RETURNING_INTAKE_AT) ⇒ «ממתין לפרסום» עד «פרסם בדף».
    add(step({ id: 'r-old', stepType: 'custom_request', status: 'waiting_client', ball: 'client',
      publishedAt: ago(120), createdAt: ago(120), updatedAt: ago(40),
      payload: { title: 'אישור ניהול חשבון בנק עדכני', detachedFromFlowRun: 'run-old',
        carriedFrom: { engagementId: OLD_ENG_ID, endedAt: RETURNING_ENDED_AT },
        requirements: [{ key: 'bank', kind: 'file', label: 'אישור ניהול חשבון', done: false }] } }));
    const fresh = (id: string, p: Partial<OnboardingStep> & Pick<OnboardingStep, 'stepType'>) => step({
      id, status: 'waiting_client', ball: 'client', publishedAt: ago(2), createdAt: ago(2), updatedAt: ago(2),
      flowRunId: 'run-onb', flowStageKey: 's1', flowItemKey: id, ...p,
    });
    add(fresh('r-docs', { stepType: 'client_documents',
      payload: { checklist: [{ key: 'bank', label: 'אישור ניהול חשבון בנק', done: false }, { key: 'f106', label: 'טופס 106', done: false }] } }));
    add(fresh('r-106', { stepType: 'custom_request',
      payload: { title: 'דוח שנתי 2025 מהרו״ח הקודם', requirements: [{ key: 'r', kind: 'file', label: 'הדוח השנתי', done: false }] } }));
    // ההיסטוריה של ההתקשרות הקודמת נשארת ב«הושלמו» — לא נעלמת ולא נוצרת שוב.
    add({ ...step({ id: 'r-done', stepType: 'custom_request', status: 'completed', ball: 'client', engagementId: OLD_ENG_ID,
      publishedAt: ago(690), createdAt: ago(690), payload: { title: 'צילום תעודת זהות' } }), completedAt: ago(650) });
    return { steps, client, ni };
  }

  add(step({ id: 'rep', stepType: 'representation', track: 'authorities', status: 'waiting_client', ball: 'client', updatedAt: ago(4) }));

  if (SC === 'few') {
    ni.client = { enteredAt: ago(3), referenceNumber: '75160001', deadline: inDays(25) };
    add(niStep('ni-c', 'client', fullName, 'in_progress', 3));
    add(step({ id: 'docs', stepType: 'client_documents', status: 'waiting_client', ball: 'client', updatedAt: ago(12),
      payload: { checklist: [
        { key: 'bank', label: 'אישור ניהול חשבון בנק', done: true },
        { key: 'ret', label: 'דוח שנתי אחרון', done: false },
        { key: 'f106', label: 'טופס 106', done: false },
      ] } }));
    return { steps, client, ni };
  }

  if (SC === 'ni' || SC === 'approved') {
    if (SC === 'ni') {
      // לקוח: אסמכתא קיימת, ההוראות טרם נשלחו ⇒ «מחיקת הבקשה».
      ni.client = { enteredAt: ago(3), referenceNumber: '75160001', deadline: inDays(25) };
      add(niStep('ni-c', 'client', fullName, 'in_progress', 3));
    } else {
      // לקוח: אושר ⇒ בלי ביטול; השלב ב«הושלמו».
      ni.client = { enteredAt: ago(20), referenceNumber: '75160001', deadline: inDays(5),
        instructionsSentAt: ago(18), confirmedAt: ago(10) };
      add({ ...niStep('ni-c', 'client', fullName, 'completed', 10), completedAt: ago(10) });
    }
    // בת זוג: נשלחה לה הבקשה, טרם אישרה ⇒ «ביטול הבקשה» עם אזהרה.
    ni.spouse = { enteredAt: ago(8), referenceNumber: '75160002', deadline: inDays(14),
      instructionsSentAt: ago(7), instructionsSentWith: 'standalone' };
    add(niStep('ni-s', 'spouse', spouseName, 'waiting_client', 7));
    add(step({ id: 'docs', stepType: 'client_documents', status: 'waiting_client', ball: 'client', updatedAt: ago(12),
      payload: { checklist: [{ key: 'bank', label: 'אישור ניהול חשבון בנק', done: false }] } }));
    return { steps, client, ni };
  }

  // ── many ──
  ni.client = { enteredAt: ago(9), referenceNumber: '75160001', deadline: inDays(20),
    instructionsSentAt: ago(8), instructionsSentWith: 'standalone' };
  add(niStep('ni-c', 'client', fullName, 'waiting_client', 8));
  add(niStep('ni-s', 'spouse', spouseName, 'pending', 2));
  add(step({ id: 'rel', stepType: 'release_letter', track: 'prev_accountant', status: 'pending', ball: 'me', updatedAt: ago(5) }));
  add(step({ id: 'rel-d', stepType: 'prev_accountant_details', track: 'prev_accountant', status: 'completed', ball: 'client', completedAt: ago(6) }));
  add(step({ id: 'rel-m', stepType: 'materials_received', track: 'prev_accountant', status: 'locked', ball: 'prev_accountant', dependsOnStepId: 'rel',
    payload: { checklist: [
      { key: 'uniform_file', label: 'קובץ מבנה אחיד', done: false },
      { key: 'ledgers', label: 'כרטסות הנהלת חשבונות', done: false },
    ] } }));
  add(step({ id: 'pl-i', stepType: 'paperless_invite', status: 'waiting_client', ball: 'client', updatedAt: ago(11),
    payload: { paperlessStatus: 'none', dataSource: 'none', clientTitle: 'הרשמה לפייפרלס' } }));
  add(step({ id: 'pl-c', stepType: 'paperless_connection', status: 'locked', ball: 'me', dependsOnStepId: 'pl-i' }));
  add(step({ id: 'pl-r', stepType: 'retainer_authorization', track: 'payment', scope: 'engagement', status: 'locked', ball: 'me', dependsOnStepId: 'pl-c' }));
  add(step({ id: 'docs', stepType: 'client_documents', status: 'waiting_client', ball: 'client', updatedAt: ago(15),
    payload: { title: 'מסמכים לפתיחת התיק — אישורי בנק, דוחות שנתיים קודמים וטופסי 106 של שני בני הזוג',
      checklist: [
        { key: 'bank', label: 'אישור ניהול חשבון בנק', done: true },
        { key: 'ret', label: 'דוח שנתי אחרון', done: false },
        { key: 'f106', label: 'טופס 106', done: false },
      ] } }));
  add(step({ id: 'cr-long', stepType: 'custom_request', status: 'waiting_client', ball: 'client', updatedAt: ago(2),
    payload: { title: 'אישורי ניכוי מס במקור מכל הלקוחות העסקיים לשנת 2025, כולל אישור מרואה החשבון של החברה האם בחו״ל' } }));
  // בקשה של המסלול בשם בן הזוג — יושבת בדף של בעל הכרטיס (בעלים ≠ נושא).
  add(step({ id: 'cr-sp', stepType: 'custom_request', status: 'waiting_client', ball: 'client', updatedAt: ago(2),
    flowRunId: 'run-m', flowStageKey: 's1', flowItemKey: 'i1',
    payload: { title: `טופס 106 - ${spouseName.split(' ')[0]}`, subjectRole: 'spouse', subjectName: spouseName.split(' ')[0],
      requirements: [{ key: 'f106', kind: 'file', label: 'טופס 106 לשנת 2025', done: false }] } }));
  add(step({ id: 'cr-draft', stepType: 'custom_request', status: 'pending', ball: 'client', publishedAt: null,
    payload: { title: 'חוזה שכירות למשרד ברחוב הרצל' } }));
  add(step({ id: 'cr-red', stepType: 'custom_request', status: 'blocked', ball: 'client', needsAttention: true, updatedAt: ago(30),
    payload: { title: 'אישור תושבות מהרשות המקומית' } }));
  add(step({ id: 'cr-ext', stepType: 'custom_request', status: 'waiting_client', ball: 'external', updatedAt: ago(6),
    payload: { title: 'אישור יתרות מהבנק', externalParty: { kind: 'other', contact: { name: 'בנק הפועלים — סניף 532', email: 'branch532@example.invalid' } } } }));
  add(step({ id: 'sf', stepType: 'custom_request', status: 'in_progress', ball: 'client', updatedAt: ago(1),
    payload: { title: 'טופס 6101 — עדכון פרטים בביטוח לאומי',
      smartForm: { filingId: 'sf-1', stateLabel: 'ממתין לחתימת הלקוח', purposes: ['employment_status'], waitingOn: 'client', state: 'awaiting_signature' } } }));
  add(step({ id: 'upg', stepType: 'representation_upgrade', track: 'authorities', status: 'pending', ball: 'me', needsAttention: true,
    dueDate: inDays(-3), payload: { secondaryAuthorities: ['incomeTax', 'vat'] } }));
  add(step({ id: 'intake', stepType: 'intake_questionnaire', track: 'internal', status: 'waiting_client', ball: 'client', updatedAt: ago(3) }));
  add(step({ id: 'own-1', stepType: 'custom_request', status: 'pending', ball: 'me', updatedAt: ago(1),
    payload: { title: 'לבדוק יתרת מקדמות במס הכנסה לפני הדוח' } }));
  add(step({ id: 'own-2', stepType: 'custom_request', status: 'in_progress', ball: 'me', needsAttention: true,
    payload: { title: 'לתאם פגישת פתיחה עם שני בני הזוג' } }));
  add(step({ id: 'd-kyc', stepType: 'kyc_identification', track: 'internal', status: 'completed', ball: 'me', completedAt: ago(19) }));
  add(step({ id: 'd-cr', stepType: 'custom_request', status: 'completed', ball: 'client', completedAt: ago(12), payload: { title: 'צילום תעודת זהות' } }));
  add(step({ id: 'd-sk', stepType: 'custom_request', status: 'skipped', ball: 'client', payload: { title: 'אישור ניהול ספרים', skipReason: 'יש כבר בתיק' } }));
  return { steps, client, ni };
}

function initialStore(): Store {
  const base = initialStoreBase();
  // ‼ &kind=failed: הסוג כבר נקבע בכרטיס, והפתיחה של מה שחיכה נכשלה (failedAt).
  if (SC === 'kind-hold' && qs().get('kind') === 'failed') {
    base.client = { ...base.client, dealerType: 'licensed' } as Client;
  }
  // ‼ &mail=unknown: בקשה אוטומטית שהופעלה, ומכתב לרו״ח הקודם שלא סומן «נשלח» — ולשניהם
  // שורה ביומן במצב «לא ידוע אם יצא» (emailRows).
  if (qs().get('mail') === 'unknown') {
    base.client = { ...base.client, prevAccountantName: base.client.prevAccountantName ?? 'רו״ח דנה כהן ושות׳',
      prevAccountantEmail: base.client.prevAccountantEmail ?? 'dana@prev-firm.example' } as Client;
    base.steps = [...base.steps.filter(s => s.id !== 'auto-mail'), step({
      id: 'auto-mail', stepType: 'custom_request', status: 'waiting_client', ball: 'client', updatedAt: ago(1),
      payload: { title: 'אישור ניהול חשבון בנק עדכני', autoAction: { kind: 'email' }, autoExecutedAt: ago(1),
        requirements: [{ key: 'bank', kind: 'file', label: 'אישור ניהול חשבון', done: false }] },
    })];
    if (!base.steps.some(s => s.id === 'rel')) {
      base.steps = [...base.steps,
        step({ id: 'rel', stepType: 'release_letter', track: 'prev_accountant', status: 'pending', ball: 'me', updatedAt: ago(1) })];
    }
  }
  // ‼ &noname=1 — כרטיס בלי שם פרטי (חברה): «ממתין ללקוח», לא «ממתין להלקוח»; &biz=1 — עם שם עסק.
  if (qs().get('noname')) {
    base.client = { ...base.client, firstName: '', ...(qs().get('biz') ? { businessName: 'אקמה שירותים בע״מ' } : {}) } as Client;
  }
  // ‼ &approval=required|spouse|both|declared — שלב «אישור הייצוג באזור האישי» פתוח (נוצר בהגשה
  // לשע״ם, 131); required* ⇒ שע״ם מציגה «ממתין לאישור לקוח» (201: requiredBy 'shaam'). עם &rep=awaiting_authorities.
  const approval = qs().get('approval');
  if (approval) {
    base.steps = [...base.steps, step({
      id: 'rep-approval', stepType: 'rep_client_approval', track: 'authorities', status: 'pending',
      ball: approval === 'declared' ? 'me' : 'client', updatedAt: ago(1),
      payload: { clientTitle: 'אישור הייצוג באזור האישי',
        ...(approval === 'optional' ? {} : { requiredBy: 'shaam', requiredSince: ago(1) }),
        ...(approval === 'declared' ? { clientDeclaredAt: ago(0.2) } : {}) },
    })];
  }
  // ‼ &upg=due|ready|later — «שדרוג לייצוג ראשי» (168 sync_representation_upgrade_step): הגיע מועד
  // התזכורת / הרו״ח הקודם השלים / עוד לא. sc=many כבר כולל אחד (due).
  const upg = qs().get('upg');
  if (upg && !base.steps.some(s => s.stepType === 'representation_upgrade')) {
    base.steps = [...base.steps, step({
      id: 'upg', stepType: 'representation_upgrade', track: 'authorities', status: 'pending', ball: 'me',
      needsAttention: upg !== 'later', dueDate: upg === 'later' ? inDays(60) : inDays(-2),
      payload: { secondaryAuthorities: ['incomeTax', 'vat'], ...(upg === 'ready' ? { upgradeReadyAt: ago(1) } : {}) },
    })];
  }
  // ‼ sc=many: «אישור תושבות» חסום — והסיבה ביומן, כמו ש«סמן כחסום» רושם אותה (meta.to = blocked).
  const events: OnboardingEvent[] = SC === 'many' ? [{
    id: 'ev-block-cr-red', stepId: 'cr-red', engagementId: ENG_ID, type: 'status_changed', actor: 'accountant',
    note: 'הרשות המקומית לא עונה לטלפון — מחכים לפגישה ב-12.10', meta: { from: 'waiting_client', to: 'blocked', action: 'block' }, at: ago(30),
  }] : [];
  return { ...base, engagements: engagements(), events };
}

/**
 * ‼ advance_onboarding_step (168) על נתוני הבדיקה — המעבר, הכדור והיומן, כמו בשרת: כדי שאפשר יהיה
 * לראות בדפדפן מה קורה אחרי לחיצה («סיימתי», «חזרה אליי», «סמן כחסום», «הוספת הערה»…).
 * ‼ «ייצוג ברשות» (157) נגזר מהביצוע — השרת דוחה כל פעולה מלבד הערה/מועד (derived_step).
 */
function fakeAdvance(stepId: string, action: string, payload: Record<string, unknown> = {}): { ok: boolean; message?: string } {
  const cur = store.steps.find(s => s.id === stepId);
  if (!cur) return { ok: false, message: 'step_not_found' };
  if (cur.stepType === 'authority_representation' && !['cancel', 'note', 'set_due'].includes(action)) {
    return { ok: false, message: 'המצב של הפריט הזה נגזר אוטומטית מהביצוע בפועל, ואינו ניתן לסימון ידני.' };
  }
  if (cur.stepType === 'authority_representation' && action === 'cancel') {
    // ‼ 212: ביטול בקשת ייצוג לאדם — רק דרך cancel_authority_representation.
    return { ok: false, message: 'ביטול בקשת ייצוג נעשה מכרטיס הבקשה («ביטול הבקשה»), כדי שהייצוג, התזכורות ותיק המס יתעדכנו יחד.' };
  }
  const NEXT: Record<string, OnboardingStep['status'] | null> = {
    start: 'in_progress', wait_client: 'waiting_client', complete: 'completed', verify: 'verified', skip: 'skipped',
    block: 'blocked', fail: 'failed', reopen: 'pending', cancel: 'cancelled', note: null, set_due: null,
  };
  if (!(action in NEXT)) return { ok: false, message: 'unknown_action' };
  const to = NEXT[action] ?? cur.status;
  const now = new Date().toISOString();
  const rest: Record<string, unknown> = { ...payload };
  delete rest.note; delete rest.ball;
  const ball = typeof payload.ball === 'string' && payload.ball ? payload.ball as OnboardingStep['ball']
    : action === 'wait_client' ? 'client' : cur.ball;
  store.steps = store.steps.map(s => (s.id !== stepId ? s : {
    ...s, status: to, ball, updatedAt: now,
    payload: { ...s.payload, ...rest, ...(rest.reason ? { skipReason: String(rest.reason) } : {}) } as OnboardingStep['payload'],
    dueDate: typeof payload.dueDate === 'string' ? payload.dueDate : s.dueDate,
    needsAttention: ['completed', 'verified', 'skipped', 'cancelled'].includes(to) ? false : s.needsAttention,
    completedAt: to === 'completed' && !s.completedAt ? now : s.completedAt,
  }));
  const note = typeof payload.note === 'string' ? payload.note.trim() : '';
  store.events = [{
    id: `ev-${Date.now()}-${store.events.length}`, stepId, engagementId: cur.engagementId ?? undefined,
    type: to === cur.status ? 'note' : 'status_changed', actor: 'accountant', note: note || (rest.reason ? String(rest.reason) : undefined),
    meta: { from: cur.status, to, action }, at: now,
  }, ...store.events];
  emit();
  return { ok: true };
}

/**
 * ‼ &mail=unknown — שורות email_messages כפי ש-send-step-email / send-release-email רושמים
 * כשספק הדואר לא ענה תשובה ברורה: status 'unknown', עם step_id, בלי releaseSentAt על השלב.
 */
function emailRows(): Record<string, unknown>[] {
  if (qs().get('mail') !== 'unknown') return [];
  const at = ago(1);
  return [
    { id: 'em-auto', user_id: 'rq-user', client_id: CLIENT_ID, step_id: 'auto-mail', kind: 'step_reminder',
      to_email: store.client.email, subject: 'בקשה חדשה מהמשרד', status: 'unknown',
      error: 'unknown_outcome: network: connection reset', sent_at: at, created_at: at },
    { id: 'em-rel', user_id: 'rq-user', client_id: CLIENT_ID, step_id: 'rel', kind: 'release',
      to_email: store.client.prevAccountantEmail, subject: 'העברת ייצוג', status: 'unknown',
      error: 'unknown_outcome: network: connection reset', sent_at: at, created_at: at },
  ];
}

// ── מאגר משותף (המסך + «השרת» המדומה) ────────────────────────────────────────
let store: Store = { steps: [], client: {} as Client, ni: {}, engagements: [], events: [] };
const listeners = new Set<() => void>();
const emit = () => { store = { ...store }; listeners.forEach(l => l()); };
const subscribe = (l: () => void) => { listeners.add(l); return () => listeners.delete(l); };

declare global { interface Window { __rqCalls: { fn: string; args: unknown; res: unknown }[]; __rqStore: () => Store } }

let raceUsed = false;
/** אותם כללים כמו cancel_authority_representation (212), על נתוני הבדיקה. */
function fakeCancel(args: { p_client_id: string; p_authority: string; p_subject_role: 'client' | 'spouse'; p_acknowledge_sent?: boolean }) {
  const role = args.p_subject_role;
  if (CANCEL_MODE === 'error') return { data: null, error: { message: 'Failed to fetch' } };
  const rec = store.client.authorityRepresentations?.nationalInsurance;
  const targets = (rec?.targets ?? []) as string[];
  if (!targets.includes(role)) return { data: { ok: false, reason: 'not_requested' }, error: null };
  const track = role === 'spouse' ? store.ni.spouse : store.ni.client;
  const file = (store.client.taxFiles ?? []).find(f => f.authority === 'national_insurance' && f.owner === role);
  if (CANCEL_MODE === 'active' || track?.confirmedAt || file?.repStatus === 'active') {
    return { data: { ok: false, reason: 'already_active', stage: 'approved' }, error: null };
  }
  if (CANCEL_MODE === 'running') {
    return { data: { ok: false, reason: 'automation_running', stage: track?.instructionsSentAt ? 'sent' : 'not_sent' }, error: null };
  }
  let stage: 'sent' | 'not_sent' = track?.instructionsSentAt ? 'sent' : 'not_sent';
  if (CANCEL_MODE === 'race' && !raceUsed) {
    // ‼ «נשלח בינתיים מלשונית אחרת»: השרת רואה נשלח, המסך עוד לא.
    raceUsed = true;
    const now = new Date().toISOString();
    if (role === 'spouse') store.ni.spouse = { ...(store.ni.spouse ?? {}), instructionsSentAt: now };
    else store.ni.client = { ...(store.ni.client ?? {}), instructionsSentAt: now };
    stage = 'sent';
  }
  if (stage === 'sent' && !args.p_acknowledge_sent) {
    return { data: { ok: false, reason: 'confirm_required', stage }, error: null };
  }
  const left = targets.filter(t => t !== role);
  const at = new Date().toISOString();
  store.client = {
    ...store.client,
    authorityRepresentations: {
      ...store.client.authorityRepresentations,
      nationalInsurance: {
        ...(rec ?? { status: 'in_process' }),
        status: left.length === 0 ? 'none' : (rec?.status ?? 'in_process'),
        targets: left as ('client' | 'spouse')[],
        cancelled: { ...(rec?.cancelled ?? {}), [role]: { at, stage } },
      },
    },
    taxFiles: (store.client.taxFiles ?? []).map(f => (f.authority === 'national_insurance' && f.owner === role && f.repStatus === 'pending'
      ? { ...f, repStatus: 'none' as const } : f)),
  } as Client;
  store.steps = store.steps.map(s => (s.stepType === 'authority_representation' && s.payload?.subjectRole === role
    && !['completed', 'verified', 'skipped', 'cancelled'].includes(s.status)
    ? { ...s, status: 'cancelled' as const, payload: { ...s.payload, cancelled: { at, stage, referenceNumber: track?.referenceNumber } } }
    : s));
  emit();
  return { data: { ok: true, stage, emptied: left.length === 0, completed: false, cancelledJobs: 0 }, error: null };
}

/**
 * ‼ &approval=… — מה ש-_rep_approval_people (217) מחזיר בפריט rep_approval: מי מסמן מה, ומה שע״ם
 * מציגה אצלו כממתין (awaiting). required — הלקוח; spouse — רק בן/בת הזוג ממתין/ה; both — שניהם.
 */
function approvalPeople(): Record<string, unknown>[] {
  const a = qs().get('approval');
  const c = { person: 'client', name: store.client.firstName, systems: ['מס הכנסה', 'מע״מ'] };
  const s = { person: 'spouse', name: store.client.spouseFirstName, systems: ['מס הכנסה'] };
  if (a === 'spouse') return [{ ...c, systems: ['מע״מ'] }, { ...s, awaiting: ['מס הכנסה'] }];
  if (a === 'both') return [{ ...c, awaiting: ['מס הכנסה'] }, { ...s, awaiting: ['מס הכנסה'] }];
  return [{ ...c, awaiting: ['מס הכנסה'] }];
}

function portalPreview() {
  const items: Record<string, unknown>[] = store.steps
    .filter(s => s.status !== 'cancelled' && s.stepType !== 'rep_client_approval'
      && (s.ball === 'client' || s.stepType === 'authority_representation'))
    .map((s, i) => ({
      bucket: s.status === 'completed' ? 'done' : s.ball === 'client' ? 'action' : 'office',
      key: `${s.id}-${i}`, label: String(s.payload?.title ?? s.payload?.clientTitle ?? 'בקשה'),
      sub: s.ball === 'client' ? 'ממתין לך' : 'בטיפול המשרד',
    }));
  const approvalStep = store.steps.find(s => s.stepType === 'rep_client_approval' && s.status === 'pending');
  if (approvalStep) {
    items.unshift({ bucket: 'action', key: 'rep_approval', label: 'אישור הייצוג באזור האישי',
      sub: 'נדרש - רשות המסים ממתינה לאישור שלך לבקשת הייצוג', kind: 'declare', actionKind: 'portal',
      actionValue: approvalStep.id, cta: 'אישרתי באזור האישי', approvals: approvalPeople() });
  }
  return {
    ok: true, clientFirstName: store.client.firstName, firmName: 'משרד רו״ח לבדיקה',
    branding: {}, done: items.filter(i => i.bucket === 'done').length, total: items.length, items,
  };
}

// ── מסלולים והודעות (214/215) — מצב מדומה ───────────────────────────────────
// few  — ריצת קליטה פעילה: שלב פתוח (עם קריאה מול רשות שממתינה לך) ושלב שני
//        שממתין, ב«הכול באישורך». במגש — תזכורת על מה שנמסר.
// many — ריצה ידנית בעצירה, עם גרסה חדשה והצעה אחת. במגש — מייל שלא ידוע אם יצא.
type FakeUnknown = ReadyUnknownNotice;
let flow: { runs: ClientFlowRun[]; unknown: FakeUnknown[]; remindedAt: string | null; newSent: boolean; released: boolean } =
  { runs: [], unknown: [], remindedAt: null, newSent: false, released: false };

const UNKNOWN_CAUSES = ['cut_off', 'no_answer', 'provider_error', 'provider_busy', 'accepted_no_id', 'retry_rejected'];
const minutesAgo = (m: number) => new Date(Date.now() - m * 60_000).toISOString();
const hoursFromNow = (h: number) => new Date(Date.now() + h * 3_600_000).toISOString();
const normEmail = (e?: string | null) => String(e ?? '').trim().toLowerCase();

/**
 * &unk=open|closed|changed|all — הצורה המלאה של owner.unknown[] (214), כפי ש-client_ready_to_send
 * מחזיר אותה: הניסיון הראשון, האחרון, עד מתי «שלח שוב» בטוח (23 שעות), לאן נשלח והסיבה.
 */
function unknownVariants(): FakeUnknown[] {
  const q = qs().get('unk');
  if (!q) return [];
  const want = q === 'all' ? ['open', 'closed', 'changed'] : q.split(',');
  const cq = qs().get('cause');
  const cause = (dflt: string) => (cq && UNKNOWN_CAUSES.includes(cq) ? cq : dflt);
  const card = store.client.email ?? '';
  const first = store.client.firstName ?? '';
  const itemList = [{ title: 'מסמכים לפתיחת התיק', stillOpen: true }, { title: 'צילום תעודת זהות', stillOpen: false }];
  const subject = first + ', יש משהו חדש בדף שלך';
  const out: FakeUnknown[] = [];
  if (want.includes('open')) {
    out.push({ noticeId: 'unk-open', kind: 'new', at: minutesAgo(40), lastTriedAt: minutesAgo(38), retryUntil: hoursFromNow(22.3),
      toEmail: card, recipientChanged: false, origin: 'manual', attempts: 1, cause: cause('cut_off'), subject, items: 2, itemList });
  }
  if (want.includes('closed')) {
    out.push({ noticeId: 'unk-closed', kind: 'new', at: minutesAgo(30 * 60), lastTriedAt: minutesAgo(29 * 60), retryUntil: minutesAgo(7 * 60),
      toEmail: card, recipientChanged: false, origin: 'auto', attempts: 2, cause: cause('no_answer'), subject, items: 2, itemList });
  }
  if (want.includes('changed')) {
    const was = 'sharon.old@example.invalid';
    out.push({ noticeId: 'unk-changed', kind: 'new', at: minutesAgo(3 * 60), lastTriedAt: minutesAgo(3 * 60), retryUntil: hoursFromNow(20),
      toEmail: was, recipientChanged: normEmail(card) !== was, origin: 'manual', attempts: 1,
      cause: cause('no_answer'), subject, items: 1, itemList: itemList.slice(0, 1) });
  }
  return out;
}

/** ‼ reclaim_unknown_client_notice (214): recipient_changed ואז retry_expired — בלי לגעת בהודעה. */
function fakeReclaim(noticeId: unknown): { ok: true } | { ok: false; error: string } {
  const n = flow.unknown.find(u => u.noticeId === noticeId);
  if (!n) return { ok: false, error: 'not_found' };
  // &reclaim=expired|changed — «השרת» רואה אחרת מהמסך (שעון, כתובת שהשתנתה בלשונית אחרת).
  const forced = qs().get('reclaim');
  if (forced === 'expired') return { ok: false, error: 'retry_expired' };
  if (forced === 'changed') return { ok: false, error: 'recipient_changed' };
  if (n.toEmail && normEmail(n.toEmail) !== normEmail(store.client.email)) return { ok: false, error: 'recipient_changed' };
  if (!n.retryUntil || Date.parse(n.retryUntil) <= Date.now()) return { ok: false, error: 'retry_expired' };
  return { ok: true };
}

/** תשובת שגיאה של פונקציית קצה כפי ש-functions.invoke מחזיר אותה (FunctionsHttpError עם context). */
const edgeError = (status: number, body: Record<string, unknown>) => ({
  data: null,
  error: Object.assign(new Error('Edge Function returned a non-2xx status code'), {
    context: new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } }),
  }),
});

const counts = (p: Partial<RunStage['counts']>): RunStage['counts'] =>
  ({ total: 0, done: 0, client: 0, office: 0, external: 0, unannounced: 0, drafts: 0, awaitingStage: 0, ...p });

function fakeRun(id: string, flowId: string, name: string, trigger: FlowTrigger, status: ClientFlowRun['status'], cycleKey: string): ClientFlowRun {
  return {
    id, flowId, flowName: name, trigger, version: 1, currentVersion: 1, upgradeAvailable: false, cycleKey, status,
    startedAt: ago(0), stages: [
      { key: 's1', name: 'פתיחה', opens: { after: 'start' }, delivery: 'approve', notifyOffice: false, state: 'open',
        openedAt: ago(0), counts: counts({ total: 1, client: 1 }), actions: null },
    ], suggestions: 0,
  };
}

function initialFlow() {
  const shaam = { kind: 'action', actionId: 'shaam.sync_income_tax_file', actionType: 'shaam.sync_income_tax_file' } as unknown as RunActionState['ref'];
  const btl = { kind: 'action', actionId: 'btl.sync_file', actionType: 'btl.sync_file' } as unknown as RunActionState['ref'];
  flow = { runs: [], unknown: [], remindedAt: null, newSent: false, released: false };
  if (SC === 'kind-hold') {
    // שלב «חיבור לרשות המסים» רק לחלק מסוגי העוסקים — מחכה לסוג (waitingKind, 217).
    flow.runs = [{
      id: 'run-onb', flowId: 'f-onb', flowName: 'קליטת לקוח חדש', trigger: 'quote_approved', version: 3, currentVersion: 3,
      upgradeAvailable: false, cycleKey: 'eng:rq-eng', status: 'active', startedAt: ago(3), suggestions: 0,
      stages: [
        { key: 's1', name: 'אחרי אישור ההצעה', opens: { after: 'start' }, delivery: 'hold', notifyOffice: true, state: 'open',
          openedAt: ago(3), counts: counts({ total: 2, client: 2 }), actions: null },
        { key: 's2', name: 'חיבור לרשות המסים', opens: { after: 'stage', stage: 's1' }, delivery: 'hold', notifyOffice: false,
          state: 'waiting', waitingKind: true, counts: counts({}), actions: null },
      ],
    }];
  } else if (SC === 'problem') {
    flow.runs = [fakeRun('run-p', 'f-onb', 'קליטת לקוח חדש', 'quote_approved', 'active', 'eng:rq-eng')];
  } else if (SC === 'returning') {
    // הקליטה החדשה: שלב ראשון «הכול באישורך» (ברירת המחדל) — מה שבו מחכה ל«פרסם בדף».
    // מסלול הקליטה הקודם נסגר עם סיום ההתקשרות (closedBy, 217) — לא «בוטל».
    flow.runs = [{
      id: 'run-onb', flowId: 'f-onb', flowName: 'קליטת לקוח חדש', trigger: 'quote_approved', version: 3, currentVersion: 3,
      upgradeAvailable: false, cycleKey: 'eng:rq-eng', status: 'active', startedAt: ago(2), suggestions: 0,
      stages: [
        { key: 's1', name: 'פתיחת התיק', opens: { after: 'start' }, delivery: 'hold', notifyOffice: false, state: 'open',
          openedAt: ago(2), counts: counts({ total: 2, client: 2 }), actions: null },
      ],
    }, {
      ...fakeRun('run-old', 'f-onb', 'קליטת לקוח חדש', 'quote_approved', 'cancelled', `eng:${OLD_ENG_ID}`),
      startedAt: ago(700), cancelledAt: ago(2), closedBy: 'engagement_ended',
    }];
  } else if (SC === 'few') {
    flow.runs = [{
      id: 'run-onb', flowId: 'f-onb', flowName: 'קליטת לקוח חדש', trigger: 'quote_approved', version: 3, currentVersion: 3,
      upgradeAvailable: false, cycleKey: 'eng:rq-eng', status: 'active', startedAt: ago(20), suggestions: 0,
      stages: [
        { key: 's1', name: 'אחרי אישור ההצעה', opens: { after: 'start' }, delivery: 'hold', notifyOffice: true, state: 'open',
          openedAt: ago(20), counts: counts({ total: 4, done: 1, client: 2, office: 1 }),
          actions: [{ itemKey: 'a-shaam', ref: shaam, mode: 'auto',
            state: { state: 'waiting_office', reason: 'worker_offline', at: ago(20) }, job: null }] },
        { key: 's2', name: 'מסמכים לשנה הראשונה', opens: { after: 'stage', stage: 's1' }, delivery: 'hold', notifyOffice: false,
          state: 'waiting', counts: counts({ total: 2, awaitingStage: 2 }), actions: null },
      ],
    }];
  } else if (SC === 'many') {
    flow.runs = [{
      id: 'run-m', flowId: 'f-docs', flowName: 'בקשת מסמכים לדוח השנתי', trigger: 'manual', version: 1, currentVersion: 2,
      upgradeAvailable: true, cycleKey: 'manual:1', status: 'paused', startedAt: ago(6), pausedAt: ago(1), suggestions: 1,
      stages: [
        { key: 's1', name: 'מסמכים לדוח', opens: { after: 'start' }, delivery: 'approve', notifyOffice: false, state: 'open',
          openedAt: ago(6), counts: counts({ total: 3, client: 2, office: 1, unannounced: 1 }),
          actions: [{ itemKey: 'a-btl', ref: btl, mode: 'manual', state: null,
            job: { id: 'j1', status: 'failed', errorCode: 'portal_timeout', errorDetail: 'אתר ביטוח לאומי לא ענה בזמן. אפשר לנסות שוב.', createdAt: ago(2), finishedAt: ago(2), auto: false } }] },
        { key: 's2', name: 'הכנת הדוח', opens: { after: 'item', item: 'i1' }, delivery: 'page', notifyOffice: true,
          state: 'waiting', counts: counts({ total: 1 }), actions: null },
        { key: 's3', name: 'הצהרת הון', opens: { after: 'start' }, delivery: 'approve', notifyOffice: false,
          state: 'not_applicable', counts: counts({}), actions: null },
      ],
    }, {
      ...fakeRun('run-old', 'f-annual', 'דוח שנתי', 'annual', 'done', '2024'), doneAt: ago(200),
      stages: [{ key: 's1', name: 'איסוף', opens: { after: 'start' }, delivery: 'approve', notifyOffice: false,
        state: 'done', doneAt: ago(200), counts: counts({ total: 3, done: 3 }), actions: null }],
    }];
    flow.unknown = [{ noticeId: 'n-unk', at: new Date(Date.now() - 40 * 60_000).toISOString(), kind: 'new', items: 2 }];
  }
  const variants = unknownVariants();
  if (variants.length) flow.unknown = variants;
}

const tpl = (key: string, templateId: string, title: string, extra: Record<string, unknown> = {}) =>
  ({ key, ref: { kind: 'template', templateId }, snapshot: { stepType: 'custom_request', title }, ...extra });
const FAKE_FLOWS = [
  { id: 'f-onb', name: 'קליטת לקוח חדש', trigger: 'quote_approved', status: 'active', currentVersion: 3, seedKey: 'onboarding',
    definition: { stages: [{ key: 's1', name: 'אחרי אישור ההצעה', opens: { after: 'start' }, delivery: 'hold', items: [] }] } },
  { id: 'f-annual', name: 'דוח שנתי', trigger: 'annual', status: 'active', currentVersion: 2,
    definition: { stages: [
      { key: 's1', name: 'איסוף מסמכים', opens: { after: 'start' }, delivery: 'approve', reminder: { afterDays: 7, max: 3 }, items: [
        tpl('a1', 't-1', 'אישורי ניכוי מס במקור'),
        tpl('a2', 't-2', 'טופס 106 של בן/בת הזוג', { when: { facts: [{ key: 'married', is: true }] }, perPerson: true }),
        { key: 'a3', ref: { kind: 'action', actionId: 'shaam.sync_income_tax_file', actionType: 'shaam.sync_income_tax_file' }, mode: 'auto' },
      ] },
      { key: 's2', name: 'הכנת הדוח', opens: { after: 'stage', stage: 's1' }, delivery: 'page', items: [
        tpl('a4', 't-4', 'אישור הדוח לפני הגשה'),
      ] },
    ] } },
  { id: 'f-docs', name: 'בקשת מסמכים לדוח השנתי', trigger: 'manual', status: 'active', currentVersion: 2,
    definition: { stages: [
      { key: 's1', name: 'מסמכים לדוח', opens: { after: 'start' }, delivery: 'auto', items: [tpl('i1', 't-1', 'אישורי ניכוי מס במקור')] },
    ] } },
] as unknown as (OfficeFlow & { definition: FlowDefinition })[];

const FAKE_UPGRADE = {
  ok: true, from: 1, to: 2,
  added: [
    { stageKey: 's1', stageName: 'מסמכים לדוח', itemKey: 'i3', ref: { kind: 'template', templateId: 't-3' }, applies: true, stageOpen: true, action: false, fixed: false, addable: true },
    { stageKey: 's1', stageName: 'מסמכים לדוח', itemKey: 'i4', ref: { kind: 'action', actionId: 'btl.sync_file', actionType: 'btl.sync_file' }, applies: true, stageOpen: true, action: true, mode: 'manual', fixed: false, addable: true },
    { stageKey: 's1', stageName: 'מסמכים לדוח', itemKey: 'i5', ref: { kind: 'system', stepType: 'representation' }, applies: true, stageOpen: true, action: false, fixed: true, addable: false },
  ],
  removed: [
    { itemKey: 'i2', ref: { kind: 'template', templateId: 't-2' }, stageName: 'מסמכים לדוח',
      steps: [{ stepId: 'cr-red', status: 'blocked', title: 'אישור תושבות מהרשות המקומית', canSkip: true },
              { stepId: 'd-cr', status: 'completed', title: 'צילום תעודת זהות', canSkip: false }] },
  ],
  changed: [{ itemKey: 'i1', ref: { kind: 'template', templateId: 't-1' }, stageName: 'מסמכים לדוח' }],
};

// ── supabase מדומה: בלי רשת בכלל ────────────────────────────────────────────
let installed = false;
function install() {
  if (installed) return;
  installed = true;
  SC = qs().get('sc') ?? 'few';
  CANCEL_MODE = qs().get('cancel') ?? 'ok';
  const t = qs().get('theme');
  if (t === 'light' || t === 'dark') document.documentElement.dataset.theme = t;
  store = initialStore();
  initialFlow();
  // הבקשה שהשלב השני «אחריה» — כדי שהפס יגיד את שמה ולא «בקשה קודמת».
  if (SC === 'many') {
    store.steps = store.steps.map(s => (s.id === 'cr-long' ? { ...s, flowRunId: 'run-m', flowStageKey: 's1', flowItemKey: 'i1' } : s));
  }
  window.__rqCalls = [];
  window.__rqStore = () => store;
  const sb = supabase as unknown as Record<string, unknown>;
  const ok = (data: unknown) => Promise.resolve({ data, error: null });
  sb.rpc = (fn: string, args: Record<string, unknown> = {}) => {
    let res: { data: unknown; error: unknown };
    switch (fn) {
      case 'cancel_authority_representation': res = fakeCancel(args as never); break;
      case 'drop_authority_representation': res = fakeCancel({ ...(args as Record<string, unknown>), p_acknowledge_sent: false } as never); break;
      case 'client_ready_to_send': {
        // ‼ 214: few — מה שנמסר ועדיין ממתין (תזכורת); many — מייל שלא ידוע אם יצא.
        const newItems: { stepId: string; stepType: string; publishedAt: string; version: number; title?: string }[] =
          SC === 'many' && !flow.newSent ? [{ stepId: 'cr-long', stepType: 'custom_request', publishedAt: ago(2), version: 1 }] : [];
        // ‼ אחרי שחרור (resolve_client_notice 'not_sent') הבקשה שבמייל ועדיין פתוחה — שוב «חדש».
        if (flow.released && !flow.newSent && store.steps.some(x => x.id === 'docs')) {
          newItems.push({ stepId: 'docs', stepType: 'client_documents', publishedAt: ago(12), version: 1, title: 'מסמכים לפתיחת התיק' });
        }
        res = { data: { ok: true, owner: { email: 'sharon.m@example.invalid', lastSentAt: ago(9),
          items: newItems, fingerprint: newItems.length ? 'fp-new-1' : '',
          // ‼ returning: כמו _client_announceable_steps (214) — רק מה שהשער פתוח לו (מה שעבר).
          reminder: { items: SC === 'few' ? [{ stepId: 'docs', stepType: 'client_documents', version: 1, title: 'מסמכים לפתיחת התיק' }]
            : SC === 'returning' ? [{ stepId: 'r-old', stepType: 'custom_request', version: 1, title: 'אישור ניהול חשבון בנק עדכני' }] : [],
                      fingerprint: 'fp-rem', lastReminderAt: flow.remindedAt },
          unknown: flow.unknown, inFlight: false, queued: null },
          persons: store.ni.client?.referenceNumber && !store.ni.client.instructionsSentAt
            && (store.client.authorityRepresentations?.nationalInsurance?.targets ?? []).includes('client')
            ? [{ role: 'client', name: store.client.firstName, stepId: 'ni-c', requestId: 'rq-req', referenceNumber: store.ni.client.referenceNumber }] : [] }, error: null };
        break;
      }
      // ── מסלולים (215) — על נתוני הבדיקה ─────────────────────────────────
      case 'get_client_flow_runs': res = { data: { ok: true, runs: flow.runs }, error: null }; break;
      case 'get_office_flows': res = { data: { ok: true, flows: FAKE_FLOWS }, error: null }; break;
      case 'pause_flow_run':
        flow.runs = flow.runs.map(r => (r.id === args.p_run_id ? { ...r, status: 'paused' as const, pausedAt: new Date().toISOString() } : r));
        res = { data: { ok: true, cancelledJobs: 0 }, error: null };
        break;
      case 'resume_flow_run':
        flow.runs = flow.runs.map(r => (r.id === args.p_run_id ? { ...r, status: 'active' as const, pausedAt: null } : r));
        res = { data: { ok: true, unlocked: 1 }, error: null };
        break;
      case 'cancel_flow_run':
        flow.runs = flow.runs.map(r => (r.id === args.p_run_id ? { ...r, status: 'cancelled' as const, cancelledAt: new Date().toISOString() } : r));
        res = { data: { ok: true, cancelled: 2, kept: SC === 'many' ? [{ stepId: 'sf', stepType: 'custom_request', title: 'טופס 6101 — עדכון פרטים' }] : [] }, error: null };
        break;
      case 'flow_run_upgrade_preview': res = { data: FAKE_UPGRADE, error: null }; break;
      case 'flow_run_upgrade_apply':
        flow.runs = flow.runs.map(r => (r.id === args.p_run_id ? { ...r, version: r.currentVersion, upgradeAvailable: false } : r));
        res = { data: { ok: true, created: [{ itemKey: 'i3', stepId: 'up-1' }], skipped: [], skippedSteps: (args.p_skip_step_ids as string[] | undefined)?.length ?? 0 }, error: null };
        break;
      case 'flow_run_suggestions':
        res = { data: { ok: true, suggestions: flow.runs.some(r => r.id === args.p_run_id && r.suggestions > 0) ? [
          { kind: 'add_person', itemKey: 'i1', ref: { kind: 'template', templateId: 't-1' }, stageName: 'מסמכים לדוח',
            role: 'spouse', name: store.client.spouseFirstName },
        ] : [] }, error: null };
        break;
      case 'flow_run_add_items':
        flow.runs = flow.runs.map(r => (r.id === args.p_run_id ? { ...r, suggestions: 0 } : r));
        res = { data: { ok: true, created: [{ itemKey: 'i1', stepId: 'sp-1', role: 'spouse' }], skipped: [] }, error: null };
        break;
      case 'start_flow_run': {
        const f = FAKE_FLOWS.find(x => x.id === args.p_flow_id);
        if (f && flow.runs.some(r => r.flowId === f.id && r.status === 'active' && (f.trigger !== 'annual' || r.cycleKey === args.p_cycle_key))) {
          res = { data: { ok: true, alreadyStarted: true, runId: 'x' }, error: null };
          break;
        }
        if (f) flow.runs = [...flow.runs, fakeRun(`run-${Date.now()}`, f.id, f.name, f.trigger, 'active', String(args.p_cycle_key ?? 'manual:1'))];
        res = { data: { ok: true, runId: 'r-new', created: [{ itemKey: 'a1', stepId: 'n1' }],
          skipped: [{ itemKey: 'a2', reason: 'not_applicable' }] }, error: null };
        break;
      }
      case 'resolve_client_notice': {
        // ‼ כמו 214: 'not_sent' — רק על «לא ידוע»; reason לפי הכתובת בכרטיס מול toEmail.
        if (args.p_action === 'not_sent') {
          const n = flow.unknown.find(u => u.noticeId === args.p_notice_id);
          if (!n) { res = { data: { ok: false, error: 'not_unknown' }, error: null }; break; }
          const reason = n.toEmail && normEmail(store.client.email) !== normEmail(n.toEmail) ? 'recipient_changed' : 'office_marked_not_sent';
          flow.unknown = flow.unknown.filter(u => u.noticeId !== n.noticeId);
          flow.released = true;
          emit();
          res = { data: { ok: true, status: 'failed', reason }, error: null };
          break;
        }
        res = { data: { ok: false, error: 'not_queued' }, error: null };
        break;
      }
      case 'get_client_portal_preview': res = { data: portalPreview(), error: null }; break;
      // ‼ (סבב 3) «הוסף בקשה» במסך הבדיקה נסגר בלי שום שורה חדשה — נראה כמו כשל שקט.
      case 'create_onboarding_request': {
        const id = `new-${Date.now()}`;
        const now = new Date().toISOString();
        // «אני» ⇒ משימה של המשרד, כמו בשרת (ממתינה לך, לא ללקוח).
        const mine = args.p_owner === 'me';
        store.steps = [...store.steps, step({
          id, stepType: args.p_step_type as OnboardingStep['stepType'], status: mine ? 'pending' : 'waiting_client',
          ball: mine ? 'me' : args.p_owner === 'external' ? 'external' : 'client',
          payload: (args.p_payload ?? {}) as OnboardingStep['payload'],
          publishedAt: args.p_published ? now : null, createdAt: now, updatedAt: now,
        })];
        emit();
        res = { data: { ok: true, stepId: id }, error: null };
        break;
      }
      case 'update_onboarding_request': {
        // ‼ אותו כלל כמו בשרת: «לקרוא ולאשר» בבקשה בשם בן/בת הזוג נדחה.
        const cur = store.steps.find(s => s.id === args.p_step_id);
        const next = (args.p_payload ?? {}) as OnboardingStep['payload'];
        const merged = { ...(cur?.payload ?? {}), ...next };
        const reqs = (merged.requirements ?? []) as { kind?: string }[];
        if (!cur) { res = { data: { ok: false, error: 'step_not_found' }, error: null }; break; }
        if (merged.subjectRole === 'spouse' && reqs.some(r => r.kind === 'confirm')) {
          res = { data: { ok: false, error: 'personal_confirm_for_subject' }, error: null };
          break;
        }
        const pendingEdit = cur.publishedAt != null;
        store.steps = store.steps.map(s => (s.id !== cur.id ? s
          : pendingEdit ? { ...s, draftPayload: next } : { ...s, payload: merged }));
        emit();
        res = { data: { ok: true, pendingEdit }, error: null };
        break;
      }
      case 'publish_case_changes': {
        // ‼ כמו בשרת (216): קודם הקליטה שטרם נפתחה (publish_onboarding_process), אחר כך הטיוטות.
        const now = new Date().toISOString();
        const opened = store.engagements.filter(e => e.status === 'onboarding' && !e.processPublishedAt).length;
        store.engagements = store.engagements.map(e => (e.status === 'onboarding' && !e.processPublishedAt ? { ...e, processPublishedAt: now } : e));
        // ‼ 216 §4: הסרות ממתינות — השלב מבוטל (_set_step_status), גם «ייצוג ברשות» של בקשה קודמת.
        const removed = store.steps.filter(s => s.pendingCancel && s.status !== 'cancelled').length;
        store.steps = store.steps.map(s => (s.pendingCancel && s.status !== 'cancelled'
          ? { ...s, pendingCancel: false, status: 'cancelled' as const }
          : s.publishedAt === null ? { ...s, publishedAt: now } : s));
        emit();
        res = { data: { ok: true, processOpened: opened, removed }, error: null };
        break;
      }
      case 'set_onboarding_step_pending_cancel': {
        // ‼ 101: רק בקשה שפורסמה ושלא נסגרה — «תוסר מהדף בפרסום הבא».
        const cur = store.steps.find(s => s.id === args.p_step_id);
        if (!cur) { res = { data: { ok: false, error: 'step_not_found' }, error: null }; break; }
        if (cur.publishedAt == null) { res = { data: { ok: false, error: 'not_published' }, error: null }; break; }
        if (['completed', 'verified', 'skipped', 'cancelled'].includes(cur.status)) { res = { data: { ok: false, error: 'step_terminal' }, error: null }; break; }
        store.steps = store.steps.map(s => (s.id === cur.id ? { ...s, pendingCancel: !!args.p_pending } : s));
        emit();
        res = { data: { ok: true, pendingCancel: !!args.p_pending }, error: null };
        break;
      }
      case 'autofill_internal_setup': res = { data: { ok: true, changed: false }, error: null }; break;
      // ── סבב 4 ─────────────────────────────────────────────────────────────
      case 'retry_request_creation': {
        // ‼ כמו 217: תקלה חולפת ⇒ נוצרה והשורה נסגרת; בקשה ריקה בספרייה ⇒ עדיין לא, ניסיון נוסף נרשם.
        const cur = store.steps.find(s => s.id === args.p_step_id);
        const cp = cur?.payload?.creationProblem as { reason?: string; itemTitle?: string; attempts?: number } | undefined;
        if (!cur || !cp || cur.status !== 'pending') { res = { data: { ok: false, error: 'not_a_problem' }, error: null }; break; }
        if (cp.reason === 'create_failed') {
          const newId = `made-${Date.now()}`;
          store.steps = [...store.steps.map(s => (s.id === cur.id
            ? { ...s, status: 'cancelled' as const, payload: { ...s.payload, creationProblem: { ...cp, resolvedStepId: newId } } } : s)),
            step({ id: newId, stepType: 'custom_request', status: 'waiting_client', ball: 'client', createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(), payload: { title: cp.itemTitle, requirements: [{ key: 'q', kind: 'text', label: 'פרטי הפתיחה', done: false }] } })];
          emit();
          // ‼ הצורה של 217: resolved + how ('created' | 'exists' | 'not_applicable') + stepId.
          res = { data: { ok: true, resolved: true, how: 'created', stepId: newId }, error: null };
        } else {
          const attempts = (cp.attempts ?? 1) + 1;
          store.steps = store.steps.map(s => (s.id === cur.id
            ? { ...s, payload: { ...s.payload, creationProblem: { ...cp, attempts, lastAt: new Date().toISOString() } } } : s));
          emit();
          res = { data: { ok: true, resolved: false, reason: cp.reason, attempts }, error: null };
        }
        break;
      }
      case 'retry_kind_hold': {
        // ‼ כמו 217: אין החזקה פתוחה ⇒ {ok, 0}; הסוג לא ידוע ⇒ kind_unknown; תקלה ⇒ release_failed
        // (נרשם failedAt); אחרת נפתח מה שמתאים, וההחזקה נסגרת עם created.
        const e = store.engagements[0];
        const h = e?.kindHold;
        if (!h || h.resolvedAt) { res = { data: { ok: true, created: 0, notApplicable: 0 }, error: null }; break; }
        if (!store.client.dealerType && !store.client.vatStatus) { res = { data: { ok: false, error: 'kind_unknown' }, error: null }; break; }
        if (qs().get('kindretry') === 'fail') {
          store.engagements = [{ ...e, kindHold: { ...h, failedAt: new Date().toISOString(), error: 'boom' } }];
          emit();
          res = { data: { ok: false, error: 'release_failed' }, error: null };
          break;
        }
        const now = new Date().toISOString();
        const created = h.held.map(x => ({ key: x.key, stepId: `kh-${x.key}` }));
        store.steps = [...store.steps, ...h.held.map(x => step({
          id: `kh-${x.key}`, stepType: (x.stepType ?? 'custom_request') as OnboardingStep['stepType'], status: 'waiting_client', ball: 'client',
          createdAt: now, updatedAt: now, payload: { title: x.title },
        }))];
        store.engagements = [{ ...e, kindHold: { ...h, failedAt: undefined, error: undefined, resolvedAt: now, resolvedKind: 'licensed_dealer', created, notApplicable: [] } }];
        emit();
        res = { data: { ok: true, created: created.length, notApplicable: 0 }, error: null };
        break;
      }
      case 'close_onboarding': {
        // ‼ כמו 66b/217: לא מוכנה כל עוד יש החזקה פתוחה על סוג העוסק — readiness.kindHold.
        const h = store.engagements[0]?.kindHold;
        if (h && !h.resolvedAt && !args.p_force) {
          res = { data: { ok: false, error: 'not_ready', readiness: { ok: true, ready: false, blocking: [],
            kindHold: { since: h.since, held: h.held, count: h.held.length, ...(h.failedAt ? { failedAt: h.failedAt } : {}) } } }, error: null };
          break;
        }
        res = { data: { ok: true, forced: !!args.p_force }, error: null };
        break;
      }
      case 'hide_step_from_client': {
        const cur = store.steps.find(s => s.id === args.p_step_id);
        if (!cur) { res = { data: { ok: false, error: 'step_not_found' }, error: null }; break; }
        if (cur.stepType !== 'custom_request') { res = { data: { ok: false, error: 'not_a_request' }, error: null }; break; }
        if (cur.payload?.internalTask) { res = { data: { ok: true, already: true }, error: null }; break; }
        // ‼ כמו 216 §9 (_internal_task_back_to_office): חיכתה ללקוח ⇒ חוזרת אליך, backToOffice.
        const back = cur.status === 'waiting_client' || cur.ball === 'client';
        store.steps = store.steps.map(s => {
          if (s.id !== cur.id) return s;
          const p = { ...s.payload, internalTask: true } as Record<string, unknown>;
          delete p.internalTaskReview;
          return { ...s, payload: p as OnboardingStep['payload'],
            ...(back ? { ball: 'me' as const } : {}),
            ...(cur.status === 'waiting_client' ? { status: 'pending' as const } : {}) };
        });
        emit();
        res = { data: back ? { ok: true, backToOffice: true } : { ok: true }, error: null };
        break;
      }
      default: res = { data: { ok: true }, error: null };
    }
    window.__rqCalls.push({ fn, args, res: res.data ?? res.error });
    return Promise.resolve(res);
  };
  // שרשרת שאילתות: כל מתודה מחזירה את עצמה, וההמתנה מחזירה את השורות (ברירת מחדל: רשימה ריקה).
  const chain = (rows: unknown[] = []): unknown => {
    const target = function () { /* */ };
    const p: unknown = new Proxy(target, {
      get(_t, prop) {
        if (prop === 'then') return (resolve: (v: unknown) => void) => resolve({ data: rows, error: null });
        if (prop === 'single' || prop === 'maybeSingle') return () => ok(null);
        return () => p;
      },
      apply() { return p; },
    });
    return p;
  };
  sb.from = (table: string) => chain(table === 'email_messages' ? emailRows() : []);
  // ‼ התחברות מדומה: בלי זה AuthProvider (ב-DEV, VITE_DEV_AUTO_LOGIN) מתחבר בעצמו לשרת שב-.env —
  // ומסך הבדיקה אמור לא לגעת ברשת בכלל. משתמש קבוע (rq-user), בלי טוקן אמיתי, בלי רענון.
  const auth = sb.auth as Record<string, unknown>;
  const fakeUser = { id: 'rq-user', aud: 'authenticated', role: 'authenticated', email: 'office@example.invalid',
    app_metadata: {}, user_metadata: { full_name: 'משרד רו״ח לבדיקה' }, created_at: ago(400) };
  const fakeSession = { access_token: 'test-requests', token_type: 'bearer', expires_in: 86_400,
    expires_at: Math.floor(Date.now() / 1000) + 86_400, refresh_token: 'test-requests', user: fakeUser };
  auth.getSession = () => Promise.resolve({ data: { session: fakeSession }, error: null });
  auth.getUser = () => Promise.resolve({ data: { user: fakeUser }, error: null });
  auth.onAuthStateChange = () => ({ data: { subscription: { unsubscribe: () => { /* */ } } } });
  auth.signInWithPassword = () => Promise.resolve({ data: { user: null, session: null }, error: { message: 'מסך בדיקה — אין התחברות' } });
  auth.startAutoRefresh = () => Promise.resolve();
  // ‼ functions הוא getter על אב-הטיפוס של הלקוח — השמה רגילה נכשלת במצב strict.
  // שליחה מדומה: תצוגה מחזירה מייל לדוגמה וטביעה; שליחה מסמנת את «החדש» כנמסר.
  Object.defineProperty(sb, 'functions', {
    configurable: true,
    value: {
      invoke: (name: string, opts: { body?: Record<string, unknown> } = {}) => {
        const b = opts.body ?? {};
        let data: Record<string, unknown> = { ok: true };
        if (name === 'send-process-open-email' && b.preview) {
          const kind = String(b.kind ?? 'new');
          data = { ok: true, preview: true, kind, to: store.client.email, from: 'משרד רו״ח לבדיקה <office@example.invalid>',
            subject: kind === 'reminder' ? `${store.client.firstName}, תזכורת קטנה` : `${store.client.firstName}, יש משהו חדש בדף שלך`,
            subjectText: 'נושא לדוגמה', bodyText: 'גוף לדוגמה',
            html: `<div dir="rtl" style="font-family:sans-serif;padding:24px">מייל לדוגמה (${kind}) — מסך בדיקה, לא נשלח.</div>`,
            fingerprint: kind === 'new' ? 'fp-new-1' : kind === 'reminder' ? 'fp-rem' : '' };
        } else if (name === 'send-process-open-email' && b.retry) {
          // ‼ כמו הפונקציה: reclaim קודם; סירוב ⇒ 409 עם הקוד, וההודעה נשארת «לא ידוע».
          const rc = fakeReclaim(b.noticeId);
          if (!rc.ok) {
            const body = { error: rc.error, noticeId: b.noticeId };
            window.__rqCalls.push({ fn: `functions.${name}`, args: b, res: body });
            return Promise.resolve(edgeError(409, body));
          }
          flow.unknown = flow.unknown.filter(u => u.noticeId !== b.noticeId);
          data = { ok: true, noticeId: b.noticeId, id: 'log-retry', logged: true };
        } else if (name === 'send-process-open-email') {
          if (b.kind === 'reminder') flow.remindedAt = new Date().toISOString();
          if (!b.kind || b.kind === 'new') flow.newSent = true;
          data = { ok: true, noticeId: `n-${Date.now()}`, id: 'log-1', logged: true, transport: 'log' };
        }
        window.__rqCalls.push({ fn: `functions.${name}`, args: b, res: data });
        emit();
        return Promise.resolve({ data, error: null });
      },
    },
  });
  const ch = { on: () => ch, subscribe: () => ch, unsubscribe: () => Promise.resolve('ok') };
  sb.channel = () => ch;
  sb.removeChannel = () => Promise.resolve('ok');
}

const engagements = (): Engagement[] => SC === 'returning' ? [
  // ‼ הקליטה החדשה — טרם פורסמה (process_published_at ריק), והקודמת שהסתיימה ונפתחה בזמנה.
  { id: ENG_ID, userId: 'rq-user', clientId: CLIENT_ID, quotationId: 'rq-quote', status: 'onboarding',
    monthlyTotal: 450, billingStartMonth: '2026-11', approvedAt: RETURNING_INTAKE_AT,
    createdAt: RETURNING_INTAKE_AT, updatedAt: RETURNING_INTAKE_AT } as Engagement,
  { id: OLD_ENG_ID, userId: 'rq-user', clientId: CLIENT_ID, quotationId: 'rq-quote-old', status: 'ended',
    monthlyTotal: 380, billingStartMonth: '2024-11', approvedAt: ago(700), processPublishedAt: ago(699),
    createdAt: ago(700), updatedAt: RETURNING_ENDED_AT, endedAt: RETURNING_ENDED_AT } as Engagement,
] : [{
  id: ENG_ID, userId: 'rq-user', clientId: CLIENT_ID, quotationId: 'rq-quote', status: 'onboarding',
  monthlyTotal: 450, billingStartMonth: '2026-11', approvedAt: ago(21),
  // ‼ &intake=unpublished — לקוח ראשון שהקליטה שלו טרם פורסמה (שלב ראשון «הכול באישורך»).
  processPublishedAt: qs().get('intake') === 'unpublished' ? undefined : ago(20),
  createdAt: ago(21), updatedAt: ago(21),
  // ‼ 217: kind_hold — בקשה אחת שמחכה לסוג העוסק (engagementFromDb ממיר ל-kindHold).
  // ‼ דרך parseKindHold — אותה צורה שהמסך מקבל מ-engagementFromDb.
  ...(SC === 'kind-hold' ? { kindHold: parseKindHold({
    since: ago(2), keys: ['paperless_tax_authority'],
    held: [{ key: 'paperless_tax_authority', stepType: 'paperless_tax_authority', source: 'system', title: 'חיבור פייפרלס לרשות המסים' }],
    ...(qs().get('kind') === 'failed' ? { failedAt: ago(0), error: 'release failed' } : {}),
  }) } : {}),
} as Engagement];

const REP_STATUSES = ['pending_fill', 'awaiting_accountant', 'pending_signature', 'awaiting_stamp', 'awaiting_authorities', 'active'] as const;
type RepStatus = typeof REP_STATUSES[number];
/** מצב בקשת הייצוג במסך הבדיקה — &rep=…, אחרת לפי התרחיש. */
function repStatusFor(): RepStatus {
  const q = qs().get('rep');
  if (q && (REP_STATUSES as readonly string[]).includes(q)) return q as RepStatus;
  return SC === 'shaam-id' ? 'awaiting_stamp' : SC === 'rep-done' ? 'active' : 'pending_signature';
}
const QUOTATIONS = [{ id: 'rq-quote', clientId: CLIENT_ID, status: 'approved', approvedAt: ago(21), items: [], vatRate: 18 }] as unknown as Quotation[];
/** sc=returning — ההצעה החדשה אושרה עכשיו (היא שפתחה את הקליטה), והקודמת מלפני שנתיים. */
const RETURNING_QUOTATIONS = [
  { id: 'rq-quote', clientId: CLIENT_ID, status: 'approved', approvedAt: RETURNING_INTAKE_AT, items: [], vatRate: 18 },
  { id: 'rq-quote-old', clientId: CLIENT_ID, status: 'approved', approvedAt: ago(700), items: [], vatRate: 18 },
] as unknown as Quotation[];

export default function TestRequests() {
  useState(() => { install(); return 0; });
  const s = useSyncExternalStore(subscribe, () => store);
  const [tick, setTick] = useState(0);
  // מה «נפתח» כשלוחצים על קישור לתיק המס — אין כאן תיק מס, רק עדות גלויה לבדיקה.
  const [taxFileAt, setTaxFileAt] = useState<string | null>(null);
  const niExecution = useMemo(() => ({ client: s.ni.client, spouse: s.ni.spouse }), [s.ni]);

  const rep = repStatusFor();
  const sendPhase = qs().get('send') === 'unsent' && rep === 'pending_signature' ? 'unsent' as const : null;
  return (
    <div style={{ padding: '1rem', maxWidth: 1000, margin: '0 auto' }} dir="rtl">
      <div className="rq-harness-note" style={{ fontSize: 12, color: 'var(--ink-4)', marginBottom: '.75rem' }}>
        מסך בדיקה · נתונים מדומים · אין מסד ואין שליחה · תרחיש: {SC} · ביטול: {CANCEL_MODE}
        {taxFileAt && <span className="rq-taxfile-opened"> · נפתח תיק המס{taxFileAt === 'dealerType' ? ' על «סוג העוסק»' : ''}</span>}
      </div>
      <OnboardingTab
        key={tick}
        embedded
        clientId={CLIENT_ID}
        client={s.client}
        onClientPersisted={() => setTick(t => t)}
        clientDisplayName={`${s.client.firstName} ${s.client.lastName ?? ''}`.trim()}
        clientEmail={s.client.email}
        engagements={s.engagements}
        steps={s.steps}
        events={s.events}
        quotations={SC === 'returning' ? RETURNING_QUOTATIONS : QUOTATIONS}
        advance={async (stepId, action, payload) => {
          // ‼ כמו בשרת (168): המעבר, הכדור, היומן; דילוג — הסיבה ל-skipReason, ושאר המפתחות ל-payload.
          const r = fakeAdvance(stepId, action, payload ?? {});
          window.__rqCalls.push({ fn: 'advance', args: { stepId, action, payload }, res: r });
          return r;
        }}
        refresh={() => { window.__rqCalls.push({ fn: 'refresh', args: null, res: null }); emit(); }}
        prevAccountant={{ name: s.client.prevAccountantName, email: s.client.prevAccountantEmail }}
        onPrepareReleaseLetter={(stepId) => window.__rqCalls.push({ fn: 'prepareRelease', args: stepId, res: null })}
        repStatusLabel={`בקשת ייצוג · ${representationStatusLabel(rep, sendPhase)}`}
        repStatus={rep}
        repSendPhase={sendPhase}
        onOpenRepresentation={() => window.__rqCalls.push({ fn: 'openRepresentation', args: null, res: null })}
        onOpenTaxFile={focus => { window.__rqCalls.push({ fn: 'openTaxFile', args: focus ?? null, res: null }); setTaxFileAt(focus ?? 'tax-file'); }}
        niExecution={niExecution}
        onUpdateClientFields={async () => { /* */ }}
        onRequestAuthorityRepresentation={async () => ({ error: null, stepId: 'x' })}
      />
      <button type="button" onClick={() => setTick(t => t + 1)} style={{ display: 'none' }}>remount</button>
    </div>
  );
}

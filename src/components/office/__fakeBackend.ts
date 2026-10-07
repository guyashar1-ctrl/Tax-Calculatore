// ─── מסד מדומה ל«המשרד» · פיתוח בלבד ─────────────────────────────────────────
// ‼ למה זה קיים: בשרת הפיתוח הכניסה האוטומטית מחוברת למסד החי. מסך שמוצג כאן
// לא יכול לגעת בו — ולכן כל קריאה של supabase (טבלאות, אחסון, פונקציות, rpc
// וכניסה) מוחלפת כאן בזיכרון, **לפני** שהאפליקציה מתחילה. אין שום בקשת רשת
// למסד, לאחסון או לשליחת מייל.
//
// פרמטרים בכתובת (‎?test-office&…‎):
//   empty          — משרד חדש: בלי קבצים, עובדים, מחירון, מיילים או תבניות
//   slow           — כל תשובה מתעכבת 1.6 שניות (מצבי «טוען…»)
//   fail=save      — שמירת רשומת המשרד נכשלת
//   fail=intake    — שמירת «בקשות ללקוח חדש» נכשלת לסוג «חברה» בלבד
//   fail=upload    — העלאת קבצים לאחסון נכשלת
//   fail=load      — טעינת ברירות המחדל, היומן והמחירון נכשלת
//   offline        — אין מחשב עבודה פעיל
// כל כתיבה נרשמת ב-window.__officeWrites — כדי שבדיקה תוכל לוודא מה נכתב ומה לא.

import { supabase } from '../../lib/supabase';
import type { FirmProfile } from '../../types/firmProfile';
import { profileToDb } from '../../lib/dbMappers';
import { seedRequestGroupsDemo, rgRpc, rgSetBusinessNameBehindPortal } from './__fakeRequestGroups';
import { reserveDutyPayload, reserveDutyTemplateRow, reserveDutyPortalItem, reserveDutySubmit } from './__fakeReserveDuty';
import { previewRpc } from './__fakeRequestPreview';
import type { PreviewRequest } from '../../features/requestPreview/types';
import { mergeOfficeOverrides, type RequestTemplate, type TemplateEntry } from '../../lib/requestTemplates';
import { documentLibrary } from '../../lib/clientGuide';
import { REP_PORTAL_CARD_FIXED, resolveRepPortalCard, type RepPortalCardOverride } from '../../../supabase/functions/_shared/repTemplates.ts';
import { seedMeetings, seedPeople, fakeSplitLeadCompanion, fakeGoogleStatus, fakeMeetingsInvoke } from '../../features/meetings/__fakeMeetings';

type Row = Record<string, unknown>;

const params = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : new URLSearchParams();
// ‼ office-app — כל האפליקציה (כותרת, תפריט, סרגל תחתון, ניווט) על אותו מסד מדומה.
export const FAKE_ACTIVE = import.meta.env.DEV && (params.has('test-office') || params.has('test-firm-notifications') || params.has('office-app'));
const EMPTY = params.has('empty');
const SLOW = params.has('slow');
// ‼ ‎&big‎ — ספרייה גדולה (90 בקשות) ומסלול ארוך (12 שלבים, במקביל/אחרי/תנאים), לבדיקת קנה מידה.
const BIG = params.has('big');
const FAIL = new Set((params.get('fail') ?? '').split(',').filter(Boolean));
const OFFLINE = params.has('offline');
const DELAY = SLOW ? 1600 : 120;

export const FIRM_ID = 'test-firm';
const now = Date.now();
const iso = (minsAgo: number) => new Date(now - minsAgo * 60_000).toISOString();

const LOGO_SVG = 'data:image/svg+xml;utf8,' + encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" width="240" height="64" viewBox="0 0 240 64"><rect width="240" height="64" fill="none"/>'
  + '<text x="230" y="42" font-family="Heebo,Arial" font-size="30" font-weight="700" text-anchor="end" fill="#22384a">ישר · רו״ח</text></svg>');
const STAMP_SVG = '<svg xmlns="http://www.w3.org/2000/svg" width="120" height="120"><circle cx="60" cy="60" r="52" fill="none" stroke="#3f5f8f" stroke-width="4"/>'
  + '<text x="60" y="66" font-family="Arial" font-size="18" text-anchor="middle" fill="#3f5f8f">חותמת</text></svg>';
const SIG_SVG = '<svg xmlns="http://www.w3.org/2000/svg" width="200" height="80"><path d="M10 60 C40 10, 70 70, 100 30 S160 60, 190 20" fill="none" stroke="#1b1f24" stroke-width="3"/></svg>';

// ─── הנתונים ───────────────────────────────────────────────────────────────

export const FIXTURE_PROFILE: FirmProfile = EMPTY ? {
  id: FIRM_ID, email: '', firmName: 'משרד חדש', branding: {}, communication: {}, settings: {},
} : {
  id: FIRM_ID,
  email: 'office@example-cpa.co.il',
  fullName: 'גיא ישר',
  firmName: 'גיא ישר · משרד רואי חשבון ויועצי מס',
  legalName: 'גיא ישר רואה חשבון (2019) בע״מ',
  representativeNumber: '35102',
  representativeType: 'רואה חשבון',
  phone: '03-5551234',
  website: 'example-cpa.co.il',
  address: 'רחוב הארבעה 21, קומה 7, תל אביב-יפו',
  branding: {
    logoUrl: LOGO_SVG, logoPath: `${FIRM_ID}/logo-1.svg`,
    stampPath: `${FIRM_ID}/stamp-1.svg`,
    signaturePath: `${FIRM_ID}/signature-1.svg`,
    docDesign: { preset: 'navy-lux' },
  },
  communication: {
    senderEmail: '',
    replyTo: 'guy.replies+office@example-cpa.co.il',
    emailSignature: 'בברכה,\nגיא ישר, רו״ח\nמשרד רואי חשבון גיא ישר · 03-5551234',
  },
  settings: {
    client_documents: [
      {
        id: 'doc-expenses', label: 'מדריך הוצאות מוכרות לעצמאים — מה מותר לקזז, מה צריך לשמור ואיך מתעדים נכון (מהדורת 2026)',
        path: `${FIRM_ID}/doc-expenses-2.pdf`, url: '/fixtures/missing.pdf', fileName: 'expenses-guide-2026-final-v3.pdf',
        at: iso(60 * 24 * 20),
        history: [{ path: `${FIRM_ID}/doc-expenses-1.pdf`, url: '/fixtures/missing.pdf', fileName: 'expenses-guide-2025.pdf', at: iso(60 * 24 * 300) }],
      },
      {
        id: 'doc-paperless', label: 'איך עובדים עם פייפרלס', path: `${FIRM_ID}/doc-paperless-1.pdf`, url: '/fixtures/missing.pdf',
        fileName: 'paperless-howto.pdf', at: iso(60 * 24 * 3),
      },
    ],
    paperless: { inviteUrl: 'https://www.paperless.tax/invite?rid=TEST0000' },
    accountantNotifications: { client_document_uploaded: true },
    representation: { reminders: { sign: { enabled: true, afterDays: 5, maxReminders: 2 } } },
    commTemplates: {
      paperless_invite: { subject: 'הזמנה לפייפרלס — {{clientName}}', firmDefault: undefined },
    },
  },
};

function entry(stepType: string, i: number, extra: Row = {}): Row {
  const deps: Record<string, string> = {
    release_letter: 'prev_accountant_details', materials_received: 'release_letter',
    paperless_connection: 'paperless_invite', paperless_tax_authority: 'paperless_connection',
    retainer_authorization: 'paperless_connection',
  };
  return {
    key: stepType, stepType, enabled: true, sortIndex: (i + 1) * 10, source: 'system',
    requiredForClose: null, dueInDays: null, dependsOn: deps[stepType] ?? null, variants: [], ...extra,
  };
}

const FULL_DEFAULTS = ['client_documents', 'prev_accountant_details', 'release_letter', 'materials_received',
  'paperless_invite', 'paperless_connection', 'retainer_authorization', 'intake_questionnaire'];

function defaultsRows(): Row[] {
  const kinds = ['exempt_dealer', 'licensed_dealer', 'company', 'tax_refund', 'representation_only'];
  return kinds.map(k => ({
    office_id: FIRM_ID,
    client_kind: k,
    entries: EMPTY ? [] : k === 'tax_refund'
      ? [entry('client_documents', 0), entry('intake_questionnaire', 1)]
      : [
        ...FULL_DEFAULTS.map((t, i) => entry(t, i)),
        ...(k === 'licensed_dealer' ? [{
          key: 'send_document', stepType: 'custom_request', enabled: true, sortIndex: 90, source: 'office',
          requiredForClose: null, dueInDays: null, dependsOn: null, documentId: 'doc-expenses',
          variants: [{ key: 'default', fact: null, items: [], copy: {} }],
        }] : []),
      ],
  }));
}

const CLIENT_IDS = ['sample-1', 'sample-2', 'sample-3'];

const tables: Record<string, Row[]> = {
  office_journey_defaults: defaultsRows(),
  service_catalog: EMPTY ? [] : [
    { id: 's1', user_id: FIRM_ID, name: 'הנהלת חשבונות — עוסק מורשה', category: 'monthly', description: 'כולל דיווחי מע״מ ומקדמות', default_price: 450, vat_flag: true, billing_type: 'fixed', unit_label: null, include_by_default: true, active: true, display_order: 1 },
    { id: 's2', user_id: FIRM_ID, name: 'חשבות שכר', category: 'monthly', description: null, default_price: 80, vat_flag: true, billing_type: 'per_unit', unit_label: 'עובד', include_by_default: false, active: true, display_order: 2 },
    { id: 's3', user_id: FIRM_ID, name: 'דוח שנתי ליחיד כולל הצהרת הון ראשונה ותיאום מס מול שני מעסיקים', category: 'annual', description: 'שם ארוך במיוחד כדי לבדוק שבירת שורות', default_price: 2400, vat_flag: true, billing_type: 'fixed', unit_label: null, include_by_default: false, active: true, display_order: 3 },
    { id: 's4', user_id: FIRM_ID, name: 'פתיחת תיקים ברשויות', category: 'one_time', description: null, default_price: 300, vat_flag: true, billing_type: 'fixed', unit_label: null, include_by_default: false, active: false, display_order: 4 },
  ],
  quotation_templates: EMPTY ? [] : [
    { id: 't1', user_id: FIRM_ID, name: 'עוסק מורשה — חבילה בסיסית', kind: 'licensed_dealer', service_ids: ['s1', 's3'], active: true, display_order: 1 },
    { id: 't2', user_id: FIRM_ID, name: 'החזר מס', kind: 'tax_refund', service_ids: [], active: true, display_order: 2 },
  ],
  employees: EMPTY ? [] : [
    { id: 'emp-1', user_id: FIRM_ID, name: 'גיא ישר', role: 'רו״ח', initials: 'גי', color: '#3f5f8f' },
    { id: 'emp-2', user_id: FIRM_ID, name: 'מרים בן-אברהם', role: 'מנהלת חשבונות ראשית', initials: 'מב', color: '#2e7d5b' },
  ],
  email_messages: EMPTY ? [] : [
    { id: 'm1', user_id: FIRM_ID, client_id: 'sample-1', to_email: 'israel.israeli@gmail.com', subject: 'הבקשות שלך ממתינות בדף האישי', kind: 'process_open', status: 'opened', sent_at: iso(35), opened_at: iso(20), html: '<p dir="rtl">שלום ישראל</p>' },
    { id: 'm2', user_id: FIRM_ID, client_id: 'sample-2', to_email: 'very.long.address.for.testing.wrap@subdomain.example-company.co.il', subject: 'תזכורת - נשאר רק לחתום על ייפוי הכוח', kind: 'representation_reminder_sign', status: 'bounced', error: 'Mailbox does not exist', sent_at: iso(60 * 5), html: '<div dir="rtl" style="font-family:Arial;max-width:520px;margin:0 auto;padding:20px"><h2>תזכורת קטנה</h2><p>ייפוי הכוח לייצוג מול רשויות המס עדיין ממתין לחתימתכם. הקישור הקבוע שקיבלתם מוביל ישירות לחתימה - לוקח דקה.</p><p><a href="#" style="background:#1e3a5f;color:#fff;padding:10px 16px;border-radius:6px;text-decoration:none">לחתימה על הטופס ←</a></p></div>' },
    { id: 'm3', user_id: FIRM_ID, client_id: null, to_email: 'office@example-cpa.co.il', subject: 'לקוח אישר הצעת מחיר', kind: 'notify_quotation_approved', status: 'delivered', sent_at: iso(60 * 26) },
    { id: 'm4', user_id: FIRM_ID, client_id: 'sample-3', to_email: 'dana@example.org', subject: 'תזכורת - הצעת מחיר', kind: 'quotation_reminder', status: 'delivered', sent_at: iso(60 * 50), html: '<p dir="rtl">תזכורת</p>' },
    { id: 'm5', user_id: FIRM_ID, client_id: 'sample-1', to_email: 'israel.israeli@gmail.com', subject: 'הזמנה לפייפרלס', kind: 'paperless_invite', status: 'sent', sent_at: iso(60 * 72) },
  ],
  journey_templates: EMPTY ? [] : [
    { id: 'jt1', name: 'מסמכים מהלקוח — עוסק מורשה', description: null, kind: 'request', office_id: FIRM_ID, seed_key: 'client_documents',
      entries: [{ stepType: 'client_documents', payload: { clientTitle: 'להעלות מסמכים לפתיחת התיק', checklist: [{ label: 'צילום תעודת זהות' }, { label: 'אישור ניהול חשבון' }, { label: 'תעודת עוסק' }] } }] },
    { id: 'jt2', name: 'מסמכים מהלקוח', description: 'התבנית המובנית', kind: 'request', office_id: null, seed_key: 'client_documents', entries: [{ stepType: 'client_documents', payload: { checklist: [{ label: 'צילום תעודת זהות' }] } }] },
    { id: 'jt4', name: 'אישור תנאי שכר טרחה', description: null, kind: 'request', office_id: FIRM_ID, seed_key: null,
      entries: [{ key: 'e1', stepType: 'custom_request', owner: 'client', requiredForClose: true, payload: {
        title: 'אישור תנאי שכר טרחה', clientTitle: 'אישור תנאי ההתקשרות', clientSub: 'קריאה קצרה ואישור - שתי דקות', clientCta: 'למילוי',
        requirements: [{ key: 'r1', kind: 'confirm', label: 'קראתי ואני מאשר את תנאי שכר הטרחה', required: true, done: false }] } }] },
    { id: 'jt5', name: 'אישורי ניכוי מס במקור', description: null, kind: 'request', office_id: null, seed_key: 'withholding',
      entries: [{ key: 'e1', stepType: 'custom_request', owner: 'client', requiredForClose: true, payload: {
        title: 'אישורי ניכוי מס במקור', clientTitle: 'אישורי ניכוי מס במקור מהלקוחות', clientSub: 'קובץ אחד לכל משלם', clientCta: 'להעלאה',
        requirements: [{ key: 'r1', kind: 'files', label: 'אישורי ניכוי במקור', required: true, done: false }] } }] },
    // 05.10 · «תביעת מילואים בביטוח לאומי» — נוסח מוכן עם מדריך מצולם (221). ‼ רק בהדגמה — לא בחבילת הייצוג.
    ...(FAKE_ACTIVE ? [reserveDutyTemplateRow()] : []),
    { id: 'jt3', name: 'קליטה מלאה — חברה בע״מ', description: 'מסמכים, רו״ח קודם ופייפרלס', kind: 'journey', office_id: FIRM_ID, seed_key: null, entries: [{}, {}, {}, {}] },
    ...(BIG ? bigTemplates() : []),
  ],
  automation_jobs: EMPTY ? [] : [
    // ‼ «אוטומציות» קורא מכאן — ריצה לכל מצב שהמסך צריך להציג ביושר: הצלחה, ממתין,
    // לא-ידוע, נכשל, «לבד» ונתון ישן. אין כאן ת.ז. ואין שמות — רק מזהי לקוחות דמה.
    { id: 'j1', client_id: 'sample-1', action_type: 'btl.check_representation', status: 'succeeded', input: { role: 'client' }, result: { status: 'pending', found: true }, created_at: iso(15), updated_at: iso(14), finished_at: iso(14), error_code: null },
    { id: 'j2', client_id: null, action_type: 'shaam.connect', status: 'needs_human', created_at: iso(40), finished_at: null, error_code: null },
    // ‼ כל ריצה שייכת ללקוח שהנתונים שלו מתאימים לה: קריאת תיק — למי שיש לו מספר תיק
    // במס הכנסה (נטשה), פעולות ייצוג — למי שיש לו בקשת ייצוג (מיכל, representation_requests למטה).
    { id: 'j3', client_id: 'sample-5', action_type: 'shaam.sync_income_tax_file', status: 'failed', input: {}, error_detail: 'מערכת הגבייה לא ענתה בזמן. אפשר לנסות שוב.', created_at: iso(60 * 6), updated_at: iso(60 * 6 - 2), finished_at: iso(60 * 6 - 2), error_code: 'portal_timeout' },
    { id: 'j4', client_id: 'sample-1', action_type: 'shaam.submit_poa', status: 'succeeded', input: { role: 'client' }, result: { submitted: true }, created_at: iso(60 * 50), updated_at: iso(60 * 50 - 3), finished_at: iso(60 * 50 - 3), error_code: null },
    { id: 'j5', client_id: 'sample-1', action_type: 'shaam.check_representation', status: 'succeeded', input: { role: 'client', reason: 'post_submission_reconciliation' }, result: { found: true, settled: true, allAccepted: false }, created_at: iso(60 * 50 - 4), updated_at: iso(60 * 50 - 6), finished_at: iso(60 * 50 - 6), error_code: null },
    { id: 'j6', client_id: 'sample-2', action_type: 'shaam.create_representation', status: 'needs_human', input: { role: 'client', requestId: 'rep-demo-michal', submissionKey: 'person:client' }, needs_human: 'הפעולה מול שע״ם נעצרה באמצע, ולא ידוע אם שע״ם קלטה אותה. קודם בודקים.', created_at: iso(60 * 75), updated_at: iso(60 * 75 - 2), finished_at: null, error_code: 'external_outcome_unknown' },
    { id: 'j7', client_id: 'sample-1', action_type: 'btl.sync_file', status: 'succeeded', input: { role: 'client' }, result: { found: true }, created_at: iso(60 * 24 * 9), updated_at: iso(60 * 24 * 9 - 2), finished_at: iso(60 * 24 * 9 - 2), error_code: null },
  ],
  // ‼ בקשת ייצוג אחת — של מיכל (sample-2, בלי בן זוג), מס הכנסה בלבד, לפני חתימה: ההזנה
  // בשע״ם לא ידוע אם נקלטה (j6), ותזכורת החתימה חזרה מהכתובת (m2).
  // כך הריצות של הייצוג נוחתות בכרטיס שיש בו בקשה, ולא על «ללקוח הזה עוד אין בקשת ייצוג».
  representation_requests: EMPTY ? [] : [{
    id: 'rep-demo-michal', user_id: FIRM_ID, linked_client_id: 'sample-2', client_name: 'מיכל לוי', client_email: 'michal@example.com',
    authorities: ['incomeTax'], requested_docs: [], notes: '', status: 'pending_signature',
    created_at: iso(60 * 24 * 14), updated_at: iso(60 * 75), submission: null, submitted_at: null,
    part_b: null, ocr_extracted: null,
    // הלקוח מילא את פרטי הקליטה — ולכן המסך הוא מרכז הביצוע (הזנה ברשויות, חתימה).
    onboarding_token: 'demo-onboard-michal', onboarding_status: 'submitted', onboarding_submitted_at: iso(60 * 24 * 13),
    scope: { incomeTax: { status: 'in_process', level: 'primary' } },
    signers: [
      { id: 'client', role: 'client', source: 'client_self', name: 'מיכל לוי', email: 'michal@example.com', order: 1, signStatus: 'pending', signToken: '55555555555555555555555555555555' },
    ],
    execution: {},
  }],
  // ‼ הודעות ללקוח מהדף (214) — כל מצב ש«אוטומציות» וכרטיס הלקוח מציגים: יצאה, מתוזמנת,
  // «לא ידוע אם יצאה» (וההכרעה בכרטיס — client_ready_to_send של אותו לקוח), ודולגה.
  client_notices: EMPTY ? [] : [
    { id: 'n1', user_id: FIRM_ID, client_id: 'sample-1', kind: 'new', origin: 'auto', status: 'sent', reason: null, due_at: iso(36),
      sent_at: iso(35), created_at: iso(36), updated_at: iso(35), email_message_id: 'm1', kick_attempts: 0, lease_until: null },
    { id: 'n2', user_id: FIRM_ID, client_id: 'sample-2', kind: 'new', origin: 'auto', status: 'queued', reason: null, due_at: iso(-90),
      sent_at: null, created_at: iso(10), updated_at: iso(10), email_message_id: null, kick_attempts: 0, lease_until: null },
    { id: 'n3', user_id: FIRM_ID, client_id: 'sample-3', kind: 'new', origin: 'auto', status: 'unknown', reason: null, due_at: iso(60 * 3 + 5),
      sent_at: null, created_at: iso(60 * 3 + 5), updated_at: iso(60 * 3), email_message_id: null, kick_attempts: 1, lease_until: null },
    { id: 'n4', user_id: FIRM_ID, client_id: 'sample-4', kind: 'reminder', origin: 'auto', status: 'skipped', reason: 'nothing_to_announce', due_at: iso(60 * 24 * 2),
      sent_at: null, created_at: iso(60 * 24 * 2), updated_at: iso(60 * 24 * 2), email_message_id: null, kick_attempts: 0, lease_until: null },
  ],
  automation_workers: OFFLINE ? [] : [{
    worker_id: 'guy-office-pc', user_id: FIRM_ID, last_seen_at: new Date().toISOString(), revoked_at: null, capabilities: ['shaam', 'btl'],
    status: {
      shaam: { connected: true, bootstrapped: true },
      gmf: { ready: true, checkedAt: new Date().toISOString() },
      vat: { ready: false, checkedAt: '1970-01-01T00:00:00Z' },
      nikui: { ready: true, checkedAt: new Date().toISOString() },
      representation: { ready: false, checkedAt: new Date(now - 3 * 3600_000).toISOString() },
      btl: { connected: false },
    },
  }],
  profiles: [],
  smart_form_mappings: [{ template_key: 'btl-6101', version: 3, status: 'published', fields: {} }],
};

// רשומת המשרד כפי שהיא במסד — בשביל office-app, שבו האפליקציה טוענת אותה בעצמה.
// ‼ FAKE_ACTIVE קבוע false בבנייה לייצור — כך גם הזריעה וגם הנתונים יוצאים מהחבילה.
if (FAKE_ACTIVE) tables.profiles.push({ ...profileToDb(FIXTURE_PROFILE), id: FIRM_ID });

// 07.10 · פגישות ב-Google Meet (features/meetings/__fakeMeetings) — שלוש פגישות קרובות לדוגמה.
const MEETING_ORG = {
  fullName: FIXTURE_PROFILE.fullName, firmName: FIXTURE_PROFILE.firmName, representativeType: FIXTURE_PROFILE.representativeType,
  phone: FIXTURE_PROFILE.phone, whatsapp: FIXTURE_PROFILE.communication?.whatsapp, website: FIXTURE_PROFILE.website,
};
if (FAKE_ACTIVE && !EMPTY) {
  tables.meetings = seedMeetings(FIRM_ID, MEETING_ORG);
  // 07.10 · (224) פנייה משותפת, ליד סגור ואנשי קשר.
  const people = seedPeople(FIRM_ID);
  tables.leads = people.leads;
  tables.contacts = people.contacts;
}

// ─── «בקשות» בהדגמה המלאה (office-app) ─────────────────────────────────────
// ‼ לקוח אחד — דוד כהן (sample-1) — עם בקשות בכל המצבים, כדי שאפשר יהיה לנווט
// מ«המשרד» אל לשונית «בקשות» באותה אפליקציה. פרסום ושליחה מעדכנים את המסך
// (בזיכרון בלבד); שום דבר לא יוצא מהדפדפן.
const DEMO_CLIENT = 'sample-1';
let demoLastSent = iso(60 * 24 * 9);
if (FAKE_ACTIVE && !EMPTY) {
  const day = 60 * 24;
  const st = (id: string, step_type: string, status: string, ball: string, extra: Row = {}): Row => ({
    id, user_id: FIRM_ID, engagement_id: 'eng-demo', client_id: DEMO_CLIENT, step_type, status, ball,
    track: 'tools', scope: 'person', depends_on_step_id: null, due_date: null, needs_attention: false,
    payload: {}, completion_method: 'manual', completed_at: null, verified_at: null,
    published_at: iso(day * 20), sort_order: null, created_at: iso(day * 20), updated_at: iso(day * 9), ...extra,
  });
  tables.engagements = [{
    id: 'eng-demo', user_id: FIRM_ID, client_id: DEMO_CLIENT, quotation_id: null, status: 'onboarding',
    monthly_total: 450, billing_start_month: '2026-11', approved_at: iso(day * 21), process_published_at: iso(day * 20),
    created_at: iso(day * 21), updated_at: iso(day * 21),
  }];
  tables.onboarding_steps = [
    st('d-docs', 'client_documents', 'waiting_client', 'client', { sort_order: 1, updated_at: iso(day * 15), payload: {
      title: 'מסמכים לפתיחת התיק — אישורי בנק, דוחות שנתיים קודמים וטופסי 106 של שני בני הזוג',
      checklist: [
        { key: 'bank', label: 'אישור ניהול חשבון בנק', done: true },
        { key: 'ret', label: 'דוח שנתי אחרון', done: false },
        { key: 'f106', label: 'טופס 106', done: false },
      ] } }),
    st('d-wh', 'custom_request', 'waiting_client', 'client', { sort_order: 2, published_at: iso(day * 2), updated_at: iso(day * 2),
      payload: { title: 'אישורי ניכוי מס במקור מכל הלקוחות העסקיים לשנת 2025, כולל אישור מרואה החשבון של החברה האם' } }),
    st('d-rent', 'custom_request', 'pending', 'client', { sort_order: 3, published_at: null, payload: { title: 'חוזה שכירות למשרד ברחוב הרצל' } }),
    st('d-res', 'custom_request', 'blocked', 'client', { sort_order: 4, needs_attention: true, updated_at: iso(day * 30),
      payload: { title: 'אישור תושבות מהרשות המקומית', blockReason: 'הרשות דורשת ייפוי כוח חתום' } }),
    st('d-pl1', 'paperless_invite', 'waiting_client', 'client', { sort_order: 5, payload: { paperlessStatus: 'none', dataSource: 'none' } }),
    st('d-pl2', 'paperless_connection', 'locked', 'me', { sort_order: 6, depends_on_step_id: 'd-pl1' }),
    st('d-pl3', 'retainer_authorization', 'locked', 'me', { sort_order: 7, track: 'payment', scope: 'engagement', depends_on_step_id: 'd-pl2' }),
    st('d-intake', 'intake_questionnaire', 'waiting_client', 'client', { sort_order: 8, track: 'internal', updated_at: iso(day * 3) }),
    st('d-own', 'custom_request', 'pending', 'me', { sort_order: 9, payload: { title: 'לבדוק יתרת מקדמות במס הכנסה לפני הדוח' } }),
    st('d-kyc', 'kyc_identification', 'completed', 'me', { track: 'internal', completed_at: iso(day * 19) }),
    st('d-id', 'custom_request', 'completed', 'client', { completed_at: iso(day * 12), payload: { title: 'צילום תעודת זהות' } }),
  ];
  // 05.10 · «תביעת מילואים» פתוחה אצל דוד — רק בדף האישי המדומה (‎?portal=demo‎), שהוא מה שהלקוח רואה. ‼ לא ברשימת
  // הבקשות במשרד: שם בקשה כזו נוצרת מהספרייה (＋ בקשה חדשה ← מהספרייה), והמסלול נבדק בדיוק כך.
  if (params.get('portal') === 'demo') {
    tables.onboarding_steps.push(st('d-reserve', 'custom_request', 'waiting_client', 'client', {
      sort_order: 12, published_at: iso(day * 2), updated_at: iso(day * 2), payload: reserveDutyPayload() }));
  }
}
// 05.10 · קבוצות קבועות + פרטי העסק — לקוח הדגמה שני (יוסי, sample-3), בזיכרון בלבד.
if (FAKE_ACTIVE && !EMPTY) seedRequestGroupsDemo(tables, FIRM_ID);
if (FAKE_ACTIVE && typeof window !== 'undefined') {
  (window as unknown as { __rgSetBusinessName?: (n: string) => void }).__rgSetBusinessName = rgSetBusinessNameBehindPortal;
  // ‼ בדיקות בלבד: «הלקוח עונה» על הבקשה האחרונה של דוד שיש בה דרישות — אותה פונקציה כמו portal_submit_step
  // בדף האישי המדומה, כדי לראות במשרד (באותה אפליקציה, בלי רענון) את מה שנענה.
  (window as unknown as { __reserveDutyAnswer?: (key: string, value: string) => unknown }).__reserveDutyAnswer = (key, value) => {
    const rows = (tables.onboarding_steps ?? []).filter(r => r.client_id === DEMO_CLIENT && r.step_type === 'custom_request'
      && Array.isArray((r.payload as Row | undefined)?.requirements) && ((r.payload as Row).requirements as Row[]).length > 0
      && !['completed', 'verified', 'skipped', 'cancelled'].includes(String(r.status)));
    const row = rows[rows.length - 1];
    return row ? reserveDutySubmit(row, { key, value }) : { ok: false, error: 'no_open_request' };
  };
}
const CLOSED_OR_LOCKED = ['completed', 'verified', 'skipped', 'cancelled', 'locked'];
/**
 * הספירות של שלב — הנוסחה של get_client_flow_runs (215), על בקשות ההדגמה.
 * ‼ טיוטה נספרת רק ב«מחכים לאישורך», ו«לא בושרו» = מה שמוכן לשליחה במגש — כך
 * הרצועה, המגש ו«בקשות» מספרים אותו מספר.
 */
export function demoStageCounts(steps: Row[], unannounced: number): Record<string, number> {
  const live = steps.filter(s => s.status !== 'cancelled');
  const openPub = (ball: (b: unknown) => boolean) =>
    live.filter(s => !CLOSED_OR_LOCKED.includes(String(s.status)) && ball(s.ball) && !!s.published_at).length;
  return {
    total: live.length,
    done: live.filter(s => ['completed', 'verified', 'skipped'].includes(String(s.status))).length,
    stuck: 0,
    gates: live.length,
    client: openPub(b => b === 'client'),
    office: openPub(b => b === 'me'),
    external: openPub(b => ['prev_accountant', 'external', 'authority'].includes(String(b))),
    unannounced,
    drafts: live.filter(s => !s.published_at && !CLOSED_OR_LOCKED.includes(String(s.status))).length,
    awaitingStage: live.filter(s => !s.published_at && s.status === 'locked').length,
  };
}
function demoReady(): Row {
  const items = (tables.onboarding_steps ?? [])
    .filter(r => r.client_id === DEMO_CLIENT && r.ball === 'client' && r.published_at
      && ['pending', 'in_progress', 'waiting_client'].includes(String(r.status))
      && String(r.published_at) > demoLastSent)
    .map(r => ({ stepId: r.id, stepType: r.step_type, title: demoPortalLabel(r), publishedAt: r.published_at }));
  const reminder = (tables.onboarding_steps ?? [])
    .filter(r => r.client_id === DEMO_CLIENT && r.ball === 'client' && r.published_at
      && ['pending', 'in_progress', 'waiting_client'].includes(String(r.status))
      && String(r.published_at) <= demoLastSent)
    .map(r => ({ stepId: r.id, stepType: r.step_type, version: 1, title: demoPortalLabel(r) }));
  const newItems = items.map(i => ({ ...i, version: 1 }));
  return {
    ok: true,
    owner: {
      email: 'david@example.com', lastSentAt: demoLastSent, items, fingerprint: fingerprintOf(newItems),
      reminder: { items: reminder, fingerprint: fingerprintOf(reminder), lastReminderAt: null },
      queued: null, unknown: [], inFlight: false,
    },
    persons: [],
  };
}
/**
 * «מוכן לשליחה» של לקוח שאינו דוד: אין לו בקשות בהדגמה — רק מה שנגזר מההודעות שלו
 * (client_notices): הודעה בתור, או «לא ידוע אם יצאה» שההכרעה עליה בכרטיס.
 * ‼ לעולם לא הבקשות של דוד — קודם כל לקוח קיבל את הסט שלו.
 */
export function readyFromNotices(clientId: unknown, notices: Row[], email: string | null): Row {
  const mine = notices.filter(n => n.client_id === clientId);
  const queued = mine.find(n => n.status === 'queued');
  const unknown = mine.filter(n => n.status === 'unknown').map(n => ({
    noticeId: n.id, at: n.created_at, lastTriedAt: n.updated_at, kind: n.kind,
    subject: 'יש משהו חדש בדף שלך', items: 1, origin: n.origin, attempts: n.kick_attempts ?? 1, cause: 'no_answer',
    // ‼ חלון «שלח שוב» הבטוח — 23 שעות מהניסיון הראשון (214).
    retryUntil: new Date(Date.parse(String(n.created_at)) + 23 * 3600_000).toISOString(),
    toEmail: email, recipientChanged: false, itemList: [{ title: 'עדכון סטטוס מיסויי', stillOpen: false }],
  }));
  return {
    ok: true,
    owner: {
      email: email ?? undefined, lastSentAt: null, items: [], fingerprint: 'empty',
      reminder: { items: [], fingerprint: 'empty', lastReminderAt: null },
      queued: queued ? { noticeId: queued.id, dueAt: queued.due_at, kind: queued.kind, kickAttempts: queued.kick_attempts ?? 0 } : null,
      unknown, inFlight: false,
    },
    persons: [],
  };
}
const CLIENT_EMAIL: Record<string, string> = {
  'sample-2': 'michal@example.com', 'sample-3': 'yossi@example.com', 'sample-4': 'orit@example.com',
  'sample-5': 'natasha@example.com', 'sample-6': 'mohammad@example.com', 'sample-7': 'ron@example.com',
};
const readyFor = (clientId: unknown): Row => (clientId === DEMO_CLIENT ? demoReady()
  : readyFromNotices(clientId, tables.client_notices ?? [], CLIENT_EMAIL[String(clientId)] ?? null));
// ‼ כרטיס «זירוז אישור הייצוג» לדוד — רק בדף האישי המדומה (תצוגה מקדימה וגם
// ‎?portal=demo&office-app‎), לא כשורת בקשה: כך הדמו מראה את הכרטיס, המדריך
// ו«אישרתי» בלי לשנות את רשימות הבקשות שהבדיקות האחרות סופרות.
// הנוסח — מה שהמשרד שמר בדמו (templates.portalCard) על בסיס נוסח המערכת;
// המעבר אחרי «אישרתי» — כמו בשרת (208): לבדיקת המשרד, לא «הושלם».
const DEMO_REP_STEP = 'd-rep-approval';
let demoRepDeclared = false;
function demoRepItem(): Row {
  const saved = tables.profiles?.[0]?.settings as { representation?: { templates?: { portalCard?: RepPortalCardOverride } } } | undefined;
  const card = resolveRepPortalCard(saved?.representation?.templates?.portalCard);
  if (demoRepDeclared) {
    return { bucket: 'office', key: 'rep_approval', label: REP_PORTAL_CARD_FIXED.title, sub: 'תודה. אנחנו בודקים שהאישור נקלט אצל רשות המסים.' };
  }
  return {
    bucket: 'action', key: 'rep_approval', label: REP_PORTAL_CARD_FIXED.title, sub: card.sub, note: card.note,
    noteAfter: card.noteAfter, cta: REP_PORTAL_CARD_FIXED.cta, linkUrl: REP_PORTAL_CARD_FIXED.linkUrl, linkLabel: card.linkLabel,
    actionKind: 'portal', actionValue: DEMO_REP_STEP, kind: 'declare',
    // ‼ כמו build_client_portal (approvals): זוג — מס הכנסה רשום על שם רחל, ומע״מ לכל אחד.
    approvals: [
      { person: 'client', name: 'דוד', systems: ['מע״מ'], awaiting: [] },
      { person: 'spouse', name: 'רחל', systems: ['מס הכנסה', 'מע״מ'], awaiting: [] },
    ],
  };
}
// ‼ שם הבקשה בדף כמו בשרת (_client_step_title, ענפי build_client_portal): clientTitle,
// אחר כך title, אחר כך שם לפי הסוג — לעולם לא «בקשה» סתם.
const DEMO_PORTAL_TYPE_LABEL: Record<string, string> = {
  client_documents: 'מסמכים שביקשנו',
  prev_accountant_details: 'פרטי רואה החשבון הקודם שלך',
  paperless_invite: 'הרשמה לפייפרלס',
  paperless_tax_authority: 'חיבור פייפרלס לרשות המסים',
  intake_questionnaire: 'עדכון סטטוס מיסויי',
};
function demoPortalLabel(r: Row): string {
  const p = (r.payload ?? {}) as Row;
  const pick = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : '');
  return pick(p.clientTitle) || pick(p.title) || DEMO_PORTAL_TYPE_LABEL[String(r.step_type)] || 'בקשה מהמשרד';
}
function demoPortal(mode = 'live'): Row {
  // ‼ בקשה חופשית עם דרישות (למשל «תביעת מילואים», 221) — בצורה של השרת (220 + 221), גם אחרי שהושלמה
  // (אז הכדור אצל המשרד, והיא נשארת «הושלם»). שאר הבקשות — מינימליות כמו תמיד.
  // ‼ «אחרי עדכון» (preview) כולל גם טיוטות של הלקוח, מסומנות draft — כמו get_client_portal_preview בשרת;
  // בלי זה «איך זה ייראה» לא מראה בקשה שרק נוספה מהספרייה ועוד לא פורסמה.
  const preview = mode === 'preview';
  const items = (tables.onboarding_steps ?? [])
    .filter(r => r.client_id === DEMO_CLIENT && r.status !== 'cancelled'
      && (r.published_at || (preview && r.ball === 'client' && ['pending', 'in_progress', 'waiting_client'].includes(String(r.status)))))
    .flatMap((r): Row[] => {
      const draft = r.published_at ? {} : { draft: true };
      const rich = reserveDutyPortalItem(r, demoPortalLabel(r));
      if (rich) return [{ ...rich, ...draft }];
      if (r.ball !== 'client') return [];
      return [{
        bucket: r.status === 'completed' ? 'done' : 'action', key: String(r.id),
        label: demoPortalLabel(r), sub: r.status === 'completed' ? 'הושלם' : 'ממתין לך', ...draft,
      }];
    });
  items.unshift(demoRepItem());
  return { ok: true, clientFirstName: 'דוד', firmName: FIXTURE_PROFILE.firmName, branding: {}, done: items.filter(i => i.bucket === 'done').length, total: items.length, items };
}

// ─── ספרייה ומסלולים (2.10.2026) ────────────────────────────────────────────
// ‼ מסלול קליטה אחד כמו שהשרת בונה אותו מהרשימות הישנות (216): שלב «אחרי אישור
// ההצעה», «הכול באישורך», ייצוג קבוע, בקשות מערכת ובקשת משרד מהספרייה — ועוד
// שלב שני כדי שהרצועה בכרטיס תראה «בהמשך». ועוד מסלול שנתי עם שני שלבים, תזכורת,
// מייל לבד ופעולת קריאה «לבד» — כל מה שהמסכים צריכים להציג. בזיכרון בלבד.
interface FakeFlow {
  id: string; name: string; trigger: 'quote_approved' | 'manual' | 'annual'; status: 'active' | 'archived';
  currentVersion: number; seedKey: string | null; updatedAt: string;
  versions: { version: number; note: string | null; createdAt: string; definition: Row }[];
}
const ONBOARDING_DEF: Row = {
  stages: [
    {
      key: 's1', name: 'פתיחת התיק', opens: { after: 'start' }, delivery: 'hold', reminder: null, notifyOffice: false,
      items: [
        { key: 'representation', fixed: true, ref: { kind: 'system', stepType: 'representation' }, when: { facts: [{ key: 'rep', is: true }] } },
        { key: 'client_documents', ref: { kind: 'system', stepType: 'client_documents' }, system: {} },
        { key: 'prev_accountant_details', ref: { kind: 'system', stepType: 'prev_accountant_details' }, system: {},
          when: { kinds: ['licensed_dealer', 'company'] } },
        { key: 'fee_ack', ref: { kind: 'template', templateId: 'jt4' },
          snapshot: { stepType: 'custom_request', title: 'אישור תנאי שכר טרחה' } },
      ],
    },
    {
      key: 's2', name: 'אחרי שהמסמכים הגיעו', opens: { after: 'item', item: 'client_documents' }, delivery: 'approve',
      reminder: { afterDays: 5, max: 2 }, notifyOffice: true,
      items: [
        { key: 'guide', ref: { kind: 'document', docId: 'doc-expenses' }, optional: true },
        { key: 'read_tax', ref: { kind: 'action', actionId: 'shaam.sync_income_tax_file' }, mode: 'manual' },
      ],
    },
  ],
};
const ANNUAL_DEF: Row = {
  stages: [
    {
      key: 'a1', name: 'איסוף מסמכים לדוח', opens: { after: 'start' }, delivery: 'approve',
      reminder: { afterDays: 7, max: 3 }, notifyOffice: false,
      items: [
        { key: 'docs', ref: { kind: 'template', templateId: 'jt1' }, perPerson: true },
        { key: 'btl_read', ref: { kind: 'action', actionId: 'btl.sync_file' }, mode: 'auto' },
      ],
    },
    {
      key: 'a2', name: 'חתימה על הדוח', opens: { after: 'stage', stage: 'a1' }, delivery: 'auto', reminder: null, notifyOffice: true,
      items: [{ key: 'sign', ref: { kind: 'template', templateId: 'jt4' }, dueInDays: 14 }],
    },
  ],
};
const fakeFlows: FakeFlow[] = EMPTY ? [] : [
  ...(BIG ? [bigFlow()] : []),
  { id: 'flow-onb', name: 'קליטת לקוח חדש', trigger: 'quote_approved', status: 'active', currentVersion: 2, seedKey: 'onboarding',
    updatedAt: iso(60 * 24 * 2), versions: [
      { version: 2, note: 'נוסף שלב «אחרי שהמסמכים הגיעו»', createdAt: iso(60 * 24 * 2), definition: ONBOARDING_DEF },
      { version: 1, note: 'נבנה מ«בקשות ללקוח חדש» כפי שהיו - בלי שינוי במה שלקוח חדש מקבל', createdAt: iso(60 * 24 * 30),
        definition: { stages: [(ONBOARDING_DEF.stages as Row[])[0]] } },
    ] },
  { id: 'flow-annual', name: 'דוח שנתי', trigger: 'annual', status: 'active', currentVersion: 1, seedKey: null,
    updatedAt: iso(60 * 24 * 10), versions: [{ version: 1, note: null, createdAt: iso(60 * 24 * 10), definition: ANNUAL_DEF }] },
];
/** ‼ ‎&big‎: מסלול ארוך — 12 שלבים: שניים במקביל בהתחלה, שלב אחרי פריט, ענפים לפי סוג לקוח ועובדה. */
function bigFlow(): FakeFlow {
  const tpl = (i: number) => ({ kind: 'template', templateId: `big-${i}` });
  const items = (stageN: number, n: number, extra: Row = {}) => Array.from({ length: n }, (_, k) => ({
    key: `b${stageN}-${k}`, ref: tpl((stageN * 7 + k) % 90), ...(k === 2 ? { after: `b${stageN}-0` } : {}), ...(k === 3 ? { optional: true } : {}), ...extra,
  }));
  const st = (n: number, name: string, opens: Row, delivery: string, cnt: number, more: Row = {}) => ({
    key: `bs${n}`, name, opens, delivery, reminder: n % 3 === 0 ? { afterDays: 7, max: 2 } : null, notifyOffice: n % 4 === 0, items: items(n, cnt), ...more,
  });
  const definition = { stages: [
    st(1, 'פתיחת התיק', { after: 'start' }, 'approve', 4),
    st(2, 'חיבורים', { after: 'start' }, 'auto', 3),
    st(3, 'מסמכים לשנה', { after: 'stage', stage: 'bs1' }, 'approve', 5),
    st(4, 'עוסק פטור — מחזור', { after: 'stage', stage: 'bs1' }, 'page', 3, { when: { kinds: ['exempt_dealer'] } }),
    st(5, 'עוסק מורשה וחברה — מע״מ', { after: 'stage', stage: 'bs1' }, 'approve', 4, { when: { kinds: ['licensed_dealer', 'company'] } }),
    st(6, 'שכר', { after: 'item', item: 'b3-1' }, 'hold', 3),
    st(7, 'הצהרת הון', { after: 'stage', stage: 'bs3' }, 'approve', 2, { when: { facts: [{ key: 'married', is: true }] } }),
    st(8, 'טיוטת דוח', { after: 'stage', stage: 'bs3' }, 'page', 3),
    st(9, 'אישור הלקוח', { after: 'stage', stage: 'bs8' }, 'auto', 2),
    st(10, 'הגשה', { after: 'stage', stage: 'bs9' }, 'approve', 2),
    st(11, 'אחרי ההגשה', { after: 'stage', stage: 'bs10' }, 'page', 3),
    st(12, 'סגירת שנה', { after: 'stage', stage: 'bs11' }, 'approve', 2),
  ] };
  return { id: 'flow-big', name: 'מסלול ארוך (בדיקה)', trigger: 'manual', status: 'active', currentVersion: 1, seedKey: null,
    updatedAt: iso(60), versions: [{ version: 1, note: null, createdAt: iso(60), definition }] };
}
function bigTemplates(): Row[] {
  const nouns = ['אישור', 'מסמך', 'דוח', 'טופס', 'הצהרה', 'תלוש', 'חוזה', 'קבלה', 'אישור ניכוי', 'פירוט'];
  const subj = ['בנק', 'ביטוח', 'פנסיה', 'שכירות', 'רכב', 'השקעות', 'תרומות', 'ילדים', 'משכנתא', 'עסק'];
  return Array.from({ length: 90 }, (_, i) => ({
    id: `big-${i}`, name: `${nouns[i % 10]} ${subj[Math.floor(i / 10) % 10]} ${i + 1}`, description: null, kind: 'request',
    office_id: FIRM_ID, seed_key: null,
    entries: [{ key: 'e1', stepType: 'custom_request', owner: i % 9 === 0 ? 'me' : 'client', requiredForClose: i % 5 !== 0, payload: {
      title: `${nouns[i % 10]} ${subj[Math.floor(i / 10) % 10]}`, clientTitle: `${nouns[i % 10]} ${subj[Math.floor(i / 10) % 10]}`, clientCta: 'להעלאה',
      requirements: [{ key: 'r1', kind: i % 3 === 0 ? 'confirm' : 'file', label: `${nouns[i % 10]} ${subj[Math.floor(i / 10) % 10]}`, required: true, done: false }] } }],
  }));
}

// ─── ריצות (flow_runs) ──────────────────────────────────────────────────────
// ‼ מקור אחד לכל המסכים: «X לקוחות באמצע» במסלולים, הרצועה בכרטיס (get_client_flow_runs)
// ו«ממתינה לך» באוטומציות (קריאה ישירה של flow_runs + office_flow_versions). כמו בשרת,
// הריצה נבנית מההגדרה של **הגרסה שלה** (_flow_def(flow_id, flow_version)), לא מהנוכחית.
const DAY = 60 * 24;
/** קריאה «לבד» שלא רצה: אין מחשב עבודה פעיל, או שאין חיבור לב״ל (automation_workers למעלה). */
const BTL_WAIT = { state: 'waiting_office', reason: OFFLINE ? 'worker_offline' : 'not_connected', at: iso(DAY * 3) };
const run = (id: string, clientId: string, flowId: string, version: number, startedMins: number, state: Row): Row => ({
  id, user_id: FIRM_ID, client_id: clientId, flow_id: flowId, flow_version: version, status: 'active',
  cycle_key: id, started_at: iso(startedMins), updated_at: iso(startedMins), state,
});
tables.flow_runs = EMPTY ? [] : [
  // דוד כהן — ההדגמה: מסלול הקליטה בגרסה 1, ועכשיו יש 2.
  run('run-onb-1', DEMO_CLIENT, 'flow-onb', 1, DAY * 20, { autoActions: false, stages: { s1: { openedAt: iso(DAY * 20) } }, actions: {} }),
  run('run-onb-2', 'sample-4', 'flow-onb', 1, DAY * 12, { autoActions: false, stages: { s1: { openedAt: iso(DAY * 12) } }, actions: {} }),
  run('run-onb-3', 'sample-6', 'flow-onb', 2, DAY, { autoActions: false, stages: { s1: { openedAt: iso(DAY) } }, actions: {} }),
  // דוח שנתי — קריאת התיק בב״ל «לבד» שלא רצה (D2-2): ממתינה לך אצל שלושה לקוחות.
  ...['sample-5', 'sample-7', 'sample-2'].map((c, i) => run(`run-annual-${i + 1}`, c, 'flow-annual', 1, DAY * 3 + i,
    { autoActions: true, stages: { a1: { openedAt: iso(DAY * 3) } }, actions: { btl_read: BTL_WAIT } })),
];

const flowDef = (f: FakeFlow) => f.versions.find(v => v.version === f.currentVersion)?.definition ?? { stages: [] };
const versionDef = (flowId: unknown, version: unknown): Row =>
  fakeFlows.find(f => f.id === flowId)?.versions.find(v => v.version === Number(version))?.definition ?? { stages: [] };

/** «X לקוחות באמצע» — נספר מהריצות הפעילות, לכל גרסה. */
function runsByVersion(flowId: string): Record<string, number> {
  const out: Record<string, number> = {};
  for (const r of tables.flow_runs ?? []) {
    if (r.flow_id !== flowId || r.status !== 'active') continue;
    const v = String(r.flow_version);
    out[v] = (out[v] ?? 0) + 1;
  }
  return out;
}

function officeFlowsResult(): Row {
  return {
    ok: true,
    flows: fakeFlows.filter(f => f.status === 'active').map(f => {
      const byV = runsByVersion(f.id);
      return {
        id: f.id, name: f.name, trigger: f.trigger, status: f.status, currentVersion: f.currentVersion, seedKey: f.seedKey,
        updatedAt: f.updatedAt, definition: JSON.parse(JSON.stringify(flowDef(f))),
        versions: f.versions.map(v => ({ version: v.version, note: v.note, createdAt: v.createdAt })).sort((a, b) => b.version - a.version),
        runsByVersion: byV, activeRuns: Object.values(byV).reduce((a, b) => a + b, 0),
      };
    }),
  };
}

/** office_flows / office_flow_versions כטבלאות — נגזרות מאותם מסלולים (כולל גרסה שנשמרה עכשיו). */
function flowTableRows(table: string): Row[] | undefined {
  if (table === 'office_flows') {
    return fakeFlows.map(f => ({ id: f.id, office_id: FIRM_ID, name: f.name, trigger: f.trigger, status: f.status, current_version: f.currentVersion }));
  }
  if (table === 'office_flow_versions') {
    return fakeFlows.flatMap(f => f.versions.map(v => ({ flow_id: f.id, version: v.version, note: v.note, created_at: v.createdAt, definition: v.definition })));
  }
  return undefined;
}

/** הריצות של לקוח — כל שלב מההגדרה של הגרסה של הריצה, ומצב הפעולות מ-state.actions והמשימה האחרונה. */
export function clientFlowRuns(clientId: unknown): Row {
  if (EMPTY) return { ok: true, runs: [] };
  const zero = demoStageCounts([], 0);
  const runs = (tables.flow_runs ?? []).filter(r => r.client_id === clientId).map(r => {
    const flow = fakeFlows.find(f => f.id === r.flow_id);
    const state = (r.state ?? {}) as { autoActions?: boolean; stages?: Record<string, Row>; actions?: Record<string, Row> };
    const stages = ((versionDef(r.flow_id, r.flow_version).stages ?? []) as Row[]).map((st, i) => {
      const ss = state.stages?.[String(st.key)] ?? {};
      const openedAt = (ss.openedAt as string | undefined) ?? null;
      const doneAt = (ss.doneAt as string | undefined) ?? null;
      // ‼ בהדגמה כל הבקשות של דוד יושבות בשלב הראשון של הריצה שלו.
      const counts = r.id === 'run-onb-1' && i === 0
        ? demoStageCounts((tables.onboarding_steps ?? []).filter(s => s.client_id === DEMO_CLIENT),
          ((demoReady().owner as Row).items as Row[]).length)
        : zero;
      const actionItems = ((st.items ?? []) as Row[]).filter(it => (it.ref as Row | undefined)?.kind === 'action');
      return {
        key: st.key, name: st.name, opens: st.opens, delivery: st.delivery, reminder: st.reminder ?? null, notifyOffice: !!st.notifyOffice,
        state: doneAt ? 'done' : openedAt ? 'open' : 'waiting', openedAt, doneAt, counts,
        actions: actionItems.length ? actionItems.map(it => {
          const ref = it.ref as Row;
          const actionType = String(ref.actionType ?? ref.actionId ?? '');
          const since = openedAt ?? String(r.started_at);
          const job = (tables.automation_jobs ?? []).find(j => j.client_id === r.client_id && j.action_type === actionType
            && String(j.created_at) >= since);
          return {
            itemKey: it.key, ref: { ...ref, actionType }, mode: it.mode ?? 'manual', state: state.actions?.[String(it.key)] ?? null,
            job: job ? { id: job.id, status: job.status, errorCode: job.error_code ?? null, errorDetail: job.error_detail ?? null,
              needsHuman: job.needs_human ?? null, createdAt: job.created_at, finishedAt: job.finished_at ?? null,
              auto: (job.input as Row | undefined)?.reason === 'flow_stage_opened' } : null,
          };
        }) : null,
      };
    });
    const current = flow?.currentVersion ?? Number(r.flow_version);
    return {
      id: r.id, flowId: r.flow_id, flowName: flow?.name ?? '', trigger: flow?.trigger ?? 'manual', version: r.flow_version,
      currentVersion: current, autoActions: !!state.autoActions, upgradeAvailable: r.status === 'active' && current > Number(r.flow_version),
      cycleKey: r.id === 'run-onb-1' ? 'eng-demo' : r.cycle_key, status: r.status, startedAt: r.started_at,
      pausedAt: null, cancelledAt: null, doneAt: null, suggestions: 0, stages,
    };
  });
  return { ok: true, runs };
}

/** «בשימוש» — אותה בדיקה כמו delete_library_request: הגרסה הנוכחית של מסלול פעיל. */
function flowsUsingTemplate(id: string): string[] {
  return fakeFlows.filter(f => f.status === 'active' && JSON.stringify(flowDef(f)).includes(`"templateId":"${id}"`)).map(f => f.name);
}

function upsertLibraryRequest(args: Row): Row {
  const name = String(args.p_name ?? '').trim();
  const entry = (args.p_entry ?? {}) as Row;
  if (!name) return { ok: false, error: 'missing_name' };
  if (!entry.payload || typeof entry.payload !== 'object') return { ok: false, error: 'missing_payload' };
  const stepType = String(entry.stepType ?? 'custom_request');
  const owner = String(entry.owner ?? 'client');
  const reqs = (entry.payload as Row).requirements;
  if (stepType === 'custom_request' && owner === 'client') {
    if (!Array.isArray(reqs) || reqs.length === 0) return { ok: false, error: 'no_requirements' };
    if ((reqs as Row[]).some(r => !String(r.label ?? '').trim())) return { ok: false, error: 'missing_requirement_label' };
  }
  const nextEntry = { key: 'e1', stepType, owner, requiredForClose: entry.requiredForClose !== false, payload: entry.payload };
  const rows = (tables.journey_templates ??= []);
  const t = args.p_template_id ? rows.find(r => r.id === args.p_template_id && r.kind === 'request') : undefined;
  if (args.p_template_id && !t) return { ok: false, error: 'template_not_found' };
  const description = String(args.p_description ?? '').trim() || null;
  if (t && t.office_id === FIRM_ID) {
    Object.assign(t, { name, description, entries: [nextEntry] });
    logWrite('rpc.upsert_library_request', { templateId: t.id, payload: nextEntry.payload });
    return { ok: true, templateId: t.id };
  }
  // מובנית ⇒ עותק של המשרד (או עדכון העותק שכבר קיים).
  const copy = t?.seed_key ? rows.find(r => r.office_id === FIRM_ID && r.seed_key === t.seed_key) : undefined;
  if (copy) {
    Object.assign(copy, { name, description, entries: [nextEntry] });
    logWrite('rpc.upsert_library_request', { templateId: copy.id, copiedFromSeed: true, payload: nextEntry.payload });
    return { ok: true, templateId: copy.id, copiedFromSeed: true };
  }
  const id = `jt-${Date.now().toString(36)}`;
  rows.push({ id, name, description, kind: 'request', office_id: FIRM_ID, seed_key: t?.seed_key ?? null, entries: [nextEntry] });
  logWrite('rpc.upsert_library_request', { templateId: id, copiedFromSeed: !!t, payload: nextEntry.payload });
  return { ok: true, templateId: id, copiedFromSeed: !!t };
}

function deleteLibraryRequest(args: Row): Row {
  const rows = (tables.journey_templates ??= []);
  const t = rows.find(r => r.id === args.p_template_id && r.kind === 'request');
  if (!t || t.office_id !== FIRM_ID) return { ok: false, error: 'forbidden' };
  const used = flowsUsingTemplate(String(t.id));
  if (used.length) return { ok: false, error: 'in_use', flows: used };
  tables.journey_templates = rows.filter(r => r !== t);
  logWrite('rpc.delete_library_request', { templateId: t.id });
  return { ok: true };
}

function saveOfficeFlow(args: Row): Row {
  const f = fakeFlows.find(x => x.id === args.p_flow_id);
  if (!f) return { ok: false, error: 'flow_not_found' };
  if (Number(args.p_base_version) !== f.currentVersion) return { ok: false, error: 'version_conflict', current: f.currentVersion };
  const version = f.currentVersion + 1;
  f.versions.unshift({ version, note: (args.p_note as string | null) ?? null, createdAt: new Date().toISOString(),
    definition: JSON.parse(JSON.stringify(args.p_definition ?? { stages: [] })) });
  f.currentVersion = version;
  if (args.p_name && f.trigger !== 'quote_approved') f.name = String(args.p_name);
  f.updatedAt = new Date().toISOString();
  logWrite('rpc.save_office_flow', { flowId: f.id, version, compiled: !!args.p_compiled });
  return { ok: true, version };
}

function createOfficeFlow(args: Row): Row {
  const id = `flow-${Date.now().toString(36)}`;
  const now = new Date().toISOString();
  fakeFlows.push({ id, name: String(args.p_name ?? 'מסלול חדש'), trigger: args.p_trigger === 'annual' ? 'annual' : 'manual',
    status: 'active', currentVersion: 1, seedKey: null, updatedAt: now,
    versions: [{ version: 1, note: null, createdAt: now, definition: JSON.parse(JSON.stringify(args.p_definition ?? { stages: [] })) }] });
  logWrite('rpc.create_office_flow', { flowId: id });
  return { ok: true, flowId: id, version: 1 };
}

/** «מוכן לשליחה» בצורה של 214 — כולל טביעה, תזכורת, תור ו«לא ידוע». */
function noticeItemsOf(ready: Row): Row[] {
  return ((ready.owner as Row).items as Row[]).map(i => ({ stepId: i.stepId, stepType: i.stepType, version: 1, title: i.title }));
}
function fingerprintOf(items: Row[]): string {
  return items.map(i => `${i.stepId}:${i.version ?? 1}`).sort().join('|') || 'empty';
}

declare global {
  interface Window { __officeWrites?: { what: string; detail?: unknown }[] }
}
function logWrite(what: string, detail?: unknown) {
  (window.__officeWrites ??= []).push({ what, detail });
}

const wait = (ms = DELAY) => new Promise(r => setTimeout(r, ms));

// ─── בונה שאילתות ──────────────────────────────────────────────────────────

function from(table: string) {
  const filters: ((r: Row) => boolean)[] = [];
  let op: 'select' | 'update' | 'insert' | 'delete' | 'upsert' = 'select';
  let payload: Row | Row[] | null = null;
  let single = false;
  let maybe = false;
  let order: [string, boolean] | null = null;
  let limit: number | null = null;
  let eqKind: string | null = null;

  async function run(): Promise<{ data: unknown; error: { message: string } | null }> {
    await wait();
    if (FAIL.has('load') && op === 'select' && ['office_journey_defaults', 'email_messages', 'service_catalog'].includes(table)) {
      return { data: null, error: { message: 'החיבור לשרת נכשל (תרחיש בדיקה)' } };
    }
    const rows = (op === 'select' ? flowTableRows(table) : undefined) ?? tables[table] ?? (tables[table] = []);
    if (table === 'automation_workers') for (const w of rows) w.last_seen_at = new Date().toISOString();
    if (op === 'select') {
      let out = rows.filter(r => filters.every(f => f(r)));
      if (order) {
        const [c, asc] = order;
        out = [...out].sort((a, b) => (String(a[c] ?? '') < String(b[c] ?? '') ? -1 : 1) * (asc ? 1 : -1));
      }
      if (limit != null) out = out.slice(0, limit);
      if (single) return { data: out[0] ?? null, error: out[0] || maybe ? null : { message: 'not found' } };
      return { data: JSON.parse(JSON.stringify(out)), error: null };
    }
    if (op === 'update') {
      if (table === 'profiles' && FAIL.has('save')) {
        logWrite('profiles.update FAILED');
        return { data: null, error: { message: 'החיבור לשרת נכשל (תרחיש בדיקה)' } };
      }
      if (table === 'office_journey_defaults' && FAIL.has('intake') && eqKind === 'company') {
        logWrite('office_journey_defaults.update FAILED', { kind: eqKind });
        return { data: null, error: { message: 'השרת דחה את השמירה (תרחיש בדיקה)' } };
      }
      const hit = rows.filter(r => filters.every(f => f(r)));
      for (const r of hit) Object.assign(r, payload);
      logWrite(`${table}.update`, { kind: eqKind, count: hit.length });
      return { data: single ? hit[0] ?? null : hit, error: null };
    }
    if (op === 'insert' || op === 'upsert') {
      const list = Array.isArray(payload) ? payload : [payload!];
      const inserted = list.map(p => ({ id: `${table}-${Math.random().toString(36).slice(2, 7)}`, ...p }));
      rows.push(...inserted);
      logWrite(`${table}.insert`, inserted.length);
      return { data: single ? inserted[0] : inserted, error: null };
    }
    if (op === 'delete') {
      const keep = rows.filter(r => !filters.every(f => f(r)));
      const removed = rows.length - keep.length;
      tables[table] = keep;
      logWrite(`${table}.delete`, removed);
      return { data: null, error: null };
    }
    return { data: null, error: null };
  }

  const api: Record<string, unknown> = {
    select: () => api,
    eq: (c: string, v: unknown) => { if (c === 'client_kind') eqKind = String(v); filters.push(r => r[c] === v); return api; },
    neq: (c: string, v: unknown) => { filters.push(r => r[c] !== v); return api; },
    in: (c: string, vs: unknown[]) => { filters.push(r => vs.includes(r[c])); return api; },
    is: (c: string, v: unknown) => { filters.push(r => (r[c] ?? null) === v); return api; },
    or: () => api,
    gte: () => api, lte: () => api, gt: () => api, lt: () => api,
    not: () => api, like: () => api, ilike: () => api, contains: () => api, filter: () => api,
    range: () => api, match: () => api, overlaps: () => api, textSearch: () => api,
    order: (c: string, o?: { ascending?: boolean }) => { order = [c, o?.ascending !== false]; return api; },
    limit: (n: number) => { limit = n; return api; },
    single: () => { single = true; return api; },
    maybeSingle: () => { single = true; maybe = true; return api; },
    update: (p: Row) => { op = 'update'; payload = p; return api; },
    insert: (p: Row | Row[]) => { op = 'insert'; payload = p; return api; },
    upsert: (p: Row | Row[]) => { op = 'upsert'; payload = p; return api; },
    delete: () => { op = 'delete'; return api; },
    then: (res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) => run().then(res, rej),
  };
  return api;
}

// ─── אחסון ────────────────────────────────────────────────────────────────

const blobs = new Map<string, Blob>([
  [`firm-private:${FIRM_ID}/stamp-1.svg`, new Blob([STAMP_SVG], { type: 'image/svg+xml' })],
  [`firm-private:${FIRM_ID}/signature-1.svg`, new Blob([SIG_SVG], { type: 'image/svg+xml' })],
]);

function storageFrom(bucket: string) {
  return {
    async upload(path: string, file: Blob) {
      await wait(SLOW ? 1600 : 300);
      if (FAIL.has('upload')) {
        logWrite('storage.upload FAILED', `${bucket}:${path}`);
        return { data: null, error: { message: 'האחסון לא זמין (תרחיש בדיקה)' } };
      }
      blobs.set(`${bucket}:${path}`, file);
      logWrite('storage.upload', `${bucket}:${path}`);
      return { data: { path }, error: null };
    },
    async remove(paths: string[]) {
      for (const p of paths) blobs.delete(`${bucket}:${p}`);
      logWrite('storage.remove', paths.map(p => `${bucket}:${p}`));
      return { data: null, error: null };
    },
    getPublicUrl(path: string) {
      const b = blobs.get(`${bucket}:${path}`);
      return { data: { publicUrl: b ? URL.createObjectURL(b) : `about:blank#${path}` } };
    },
    async download(path: string) {
      await wait();
      const b = blobs.get(`${bucket}:${path}`);
      return b ? { data: b, error: null } : { data: null, error: { message: 'not found' } };
    },
  };
}

// ─── התקנה ────────────────────────────────────────────────────────────────

const SESSION = {
  access_token: 'fake', token_type: 'bearer',
  user: { id: FIRM_ID, email: 'office@example-cpa.co.il', user_metadata: { full_name: 'גיא ישר' } },
};

export function installFakeBackend() {
  const target = supabase as unknown as Record<string, unknown>;
  // ‼ חלק מהשדות של הלקוח הם getters (functions, storage) — מגדירים מחדש ולא משייכים.
  const s = new Proxy({} as Record<string, unknown>, {
    set(_t, key, value) {
      Object.defineProperty(target, key, { value, configurable: true, writable: true });
      return true;
    },
  });
  s.from = from;
  s.rpc = async (name: string, args: Row = {}) => {
    await wait();
    if (name === 'is_authorized') return { data: true, error: null };
    if (name === 'google_calendar_status') return { data: fakeGoogleStatus(), error: null };
    if (name === 'split_lead_companion') {
      const r = fakeSplitLeadCompanion(tables, FIRM_ID, args);
      logWrite('rpc.split_lead_companion', r);
      return { data: r, error: null };
    }
    // 05.10 · פרטי העסק, עבודה מהבית ודף ההדגמה של יוסי (__fakeRequestGroups).
    const rg = rgRpc(tables, name, args, FIXTURE_PROFILE.firmName ?? "המשרד", logWrite);
    if (rg) return rg;
    // 05.10 · «צפייה» בבקשה — תשובה שנלכדה מ-staging (ראה __fakeRequestPreview).
    if (name === 'preview_request_sample') return previewRpc(args.p_request as PreviewRequest, { firmName: FIXTURE_PROFILE.firmName ?? 'המשרד', branding: FIXTURE_PROFILE.branding ?? {} });
    if (name === 'client_ready_to_send') return { data: readyFor(args.p_client_id), error: null };
    if (name === 'client_notice_preview') {
      const ready = readyFor(args.p_client_id);
      const items = args.p_kind === 'reminder' ? (((ready.owner as Row).reminder as Row).items as Row[]) : noticeItemsOf(ready);
      return { data: { ok: true, kind: args.p_kind ?? 'new', items, fingerprint: fingerprintOf(items), toEmail: 'david@example.com', isFirst: false }, error: null };
    }
    // ── ספרייה ומסלולים ──
    if (name === 'get_office_flows') return { data: officeFlowsResult(), error: null };
    if (name === 'get_client_flow_runs') return { data: clientFlowRuns(args.p_client_id), error: null };
    if (name === 'flow_run_suggestions') return { data: { ok: true, suggestions: [] }, error: null };
    if (name === 'flow_run_upgrade_preview') return { data: { ok: true, upToDate: true, from: 1, to: 1, added: [], removed: [], changed: [] }, error: null };
    if (name === 'save_office_flow') return { data: saveOfficeFlow(args), error: null };
    if (name === 'create_office_flow') return { data: createOfficeFlow(args), error: null };
    if (name === 'archive_office_flow') {
      const f = fakeFlows.find(x => x.id === args.p_flow_id);
      if (f && f.trigger !== 'quote_approved') f.status = 'archived';
      logWrite('rpc.archive_office_flow', { flowId: args.p_flow_id });
      return { data: f ? { ok: true, activeRuns: Object.values(runsByVersion(f.id)).reduce((a, b) => a + b, 0) } : { ok: false, error: 'flow_not_found' }, error: null };
    }
    if (name === 'upsert_library_request') return { data: upsertLibraryRequest(args), error: null };
    if (name === 'delete_library_request') return { data: deleteLibraryRequest(args), error: null };
    if (name === 'get_client_portal_preview') return { data: demoPortal(String(args.p_mode ?? 'live')), error: null };
    // הדף האישי עצמו (‎?portal=demo&office-app‎) — רק לטוקן הדמו.
    if (name === 'get_client_portal') return { data: args.p_token === 'demo' ? demoPortal() : { ok: false }, error: null };
    if (name === 'portal_submit_step' && args.p_step_id === DEMO_REP_STEP) {
      demoRepDeclared = true;
      logWrite('rpc.portal_submit_step', { stepId: DEMO_REP_STEP });
      return { data: { ok: true }, error: null };
    }
    // ‼ תשובה של לקוח ההדגמה לבקשה חופשית (208) — רק עם טוקן ההדגמה, ורק לבקשה שלו.
    if (name === 'portal_submit_step' && args.p_token === 'demo') {
      const row = (tables.onboarding_steps ?? []).find(r => r.id === args.p_step_id && r.client_id === DEMO_CLIENT);
      if (row) {
        const res = reserveDutySubmit(row, (args.p_data ?? {}) as Row);
        logWrite('rpc.portal_submit_step', { stepId: row.id, ok: res.ok, error: res.error });
        return { data: res, error: null };
      }
    }
    if (name === 'publish_case_changes' && args.p_client_id === DEMO_CLIENT) {
      for (const r of tables.onboarding_steps ?? []) {
        if (r.client_id !== DEMO_CLIENT) continue;
        if (!r.published_at) r.published_at = new Date().toISOString();
        if (r.pending_cancel) { r.status = 'cancelled'; r.pending_cancel = false; }
      }
      logWrite('rpc.publish_case_changes');
      return { data: { ok: true }, error: null };
    }
    if (name === 'create_automation_job') {
      const now = new Date().toISOString();
      const job: Row = {
        id: `job-${Date.now()}`, user_id: FIRM_ID, client_id: args.p_client_id ?? null, action_type: args.p_action_type,
        status: 'queued', input: args.p_input ?? {}, created_at: now, updated_at: now, started_at: null, finished_at: null,
        error_code: null, progress: {}, lease_expires_at: null,
      };
      (tables.automation_jobs ??= []).unshift(job);
      logWrite('rpc.create_automation_job', { actionType: args.p_action_type });
      const auth = String(args.p_action_type).startsWith('btl.') ? 'btl' : 'shaam';
      setTimeout(() => {
        job.status = 'needs_human'; job.error_code = `awaiting_${auth}_auth`; job.updated_at = new Date().toISOString();
      }, 2500);
      return { data: { ok: true, created: true, job }, error: null };
    }
    // התקדמות שלב — המצבים הבסיסיים בלבד, כדי שלחיצה בהדגמה תשנה משהו במסך
    if (name === 'advance_onboarding_step') {
      const row = (tables.onboarding_steps ?? []).find(r => r.id === args.p_step_id);
      const next: Record<string, string> = { cancel: 'cancelled', complete: 'completed', reopen: 'waiting_client', skip: 'skipped' };
      if (row && next[String(args.p_action)]) {
        row.status = next[String(args.p_action)];
        row.updated_at = new Date().toISOString();
        if (row.status === 'completed') row.completed_at = row.updated_at;
      }
      logWrite('rpc.advance_onboarding_step', { stepId: args.p_step_id, action: args.p_action });
      return { data: { ok: true }, error: null };
    }
    // הסרת בקשה שכבר בדף: מסומנת «תוסר בפרסום הבא» — כמו בשרת
    if (name === 'set_onboarding_step_pending_cancel') {
      const row = (tables.onboarding_steps ?? []).find(r => r.id === args.p_step_id);
      if (row) row.pending_cancel = !!args.p_pending;
      logWrite('rpc.set_onboarding_step_pending_cancel', { stepId: args.p_step_id, pending: args.p_pending });
      return { data: { ok: true }, error: null };
    }
    if (name === 'create_workstation_pairing') return { data: { ok: true, code: 'K7Q4M2' }, error: null };
    // ‼ הצורה המלאה של המצב (MappingState) — בלי history לשונית «קובץ וגרסאות» נפלה.
    // גרסה 3 פורסמה מעל הבסיס שבקוד (2); הגוף שלה (fields) ב-smart_form_mappings למטה.
    if (name === 'get_smart_form_mapping') {
      return { data: { ok: true, codeBase: 2, active: { version: 3, fields: {}, publishedAt: iso(60 * 24 * 10) }, draft: null,
        history: [{ version: 3, status: 'published', publishedAt: iso(60 * 24 * 10), note: 'מצב משפחתי — הזזה קלה ימינה' }] }, error: null };
    }
    // בקשה חדשה ללקוח ההדגמה — נכנסת לרשימה (בזיכרון בלבד), כדי ש«שליחה ללקוח»
    // מספריית המסמכים תראה תוצאה אמיתית במסך הבקשות.
    if (name === 'create_onboarding_request' && args.p_client_id) {
      const id = `d-new-${Date.now()}`;
      const now = new Date().toISOString();
      const eng = (tables.engagements ?? []).find(e => e.client_id === args.p_client_id);
      (tables.onboarding_steps ??= []).push({
        id, user_id: FIRM_ID, engagement_id: eng?.id ?? null, client_id: args.p_client_id, step_type: args.p_step_type,
        status: 'waiting_client', ball: 'client', track: 'tools', scope: 'person', depends_on_step_id: args.p_depends_on ?? null,
        due_date: args.p_due_date ?? null, needs_attention: false, payload: args.p_payload ?? {}, completion_method: 'manual',
        completed_at: null, verified_at: null, published_at: args.p_published ? now : null, sort_order: 20,
        created_at: now, updated_at: now,
      });
      logWrite('rpc.create_onboarding_request', { stepType: args.p_step_type, payload: args.p_payload, published: args.p_published });
      return { data: { ok: true, stepId: id }, error: null };
    }
    logWrite(`rpc.${name}`);
    return { data: { ok: true }, error: null };
  };
  s.storage = { from: storageFrom };
  s.functions = {
    invoke: async (name: string, opts?: { body?: Row }) => {
      await wait();
      logWrite(`functions.${name}`, opts?.body);
      if (name === 'calendar-meeting' || name === 'google-calendar-connect') {
        return fakeMeetingsInvoke(name, opts?.body ?? {}, tables, FIRM_ID, MEETING_ORG);
      }
      // ‼ התצוגה המקדימה של המייל המרוכז (214) — צורה כמו בשרת, כדי שחלון השליחה
      // יציג פריטים וטביעה. השליחה עצמה ממשיכה למטה (בזיכרון בלבד).
      if (name === 'send-process-open-email' && opts?.body?.preview) {
        const ready = readyFor(opts.body.clientId ?? DEMO_CLIENT);
        const items = opts.body.kind === 'reminder' ? (((ready.owner as Row).reminder as Row).items as Row[]) : noticeItemsOf(ready);
        return { data: {
          ok: true, preview: true, kind: opts.body.kind ?? 'new', subject: 'הבקשות שלך ממתינות בדף האישי',
          subjectText: 'הבקשות שלך ממתינות בדף האישי', bodyText: '', to: 'david@example.com',
          from: `${FIXTURE_PROFILE.firmName} <office@example-cpa.co.il>`,
          html: '<div dir="rtl" style="font-family:Arial;padding:16px"><p>שלום דוד,</p><p>יש בדף האישי בקשות חדשות.</p></div>',
          items: items.map(i => ({ stepId: i.stepId, title: i.title })), fingerprint: fingerprintOf(items),
          openRequests: items.length, newDocuments: 0, otherWaiting: 0,
        }, error: null };
      }
      if (name.startsWith('send-') && (opts?.body?.clientId ?? DEMO_CLIENT) === DEMO_CLIENT) demoLastSent = new Date().toISOString();
      return { data: { ok: true, filled: 0, remaining: 0 }, error: null };
    },
  };
  s.auth = {
    getSession: async () => ({ data: { session: SESSION }, error: null }),
    getUser: async () => ({ data: { user: SESSION.user }, error: null }),
    onAuthStateChange: () => ({ data: { subscription: { unsubscribe() { /* */ } } } }),
    signInWithPassword: async () => ({ data: null, error: null }),
    signOut: async () => ({ error: null }),
  };
  s.channel = () => ({ on() { return this; }, subscribe() { return this; }, unsubscribe() { /* */ } });
  s.removeChannel = () => undefined;
}

/**
 * ספריית ההדגמה כפי שהספרייה מציגה אותה (תבניות בקשה + מסמכים) — ללכידת «צפייה» (features/requestPreview/captureCases.ts).
 * ‼ אותה מיפוי כמו loadRequestTemplates, על אותן שורות.
 */
export function demoLibraryForPreview() {
  const rows = (tables.journey_templates ?? []).filter(r => r.kind === 'request');
  const templates: RequestTemplate[] = mergeOfficeOverrides(rows.map(r => ({
    id: r.id as string, name: r.name as string, description: (r.description as string | null) ?? null, kind: 'request' as const,
    officeId: (r.office_id as string | null) ?? null, seedKey: (r.seed_key as string | null) ?? null,
    entries: Array.isArray(r.entries) ? (r.entries as TemplateEntry[]) : [],
  })));
  const docs = documentLibrary(FIXTURE_PROFILE).map(d => ({ id: d.id, label: d.label, url: d.url, path: d.path, fileName: d.fileName }));
  return { templates, docs };
}

export const FAKE_FAIL = FAIL;
export const FAKE_DELAY = DELAY;
export { CLIENT_IDS };

import { useEffect, useMemo, useState } from 'react';
import ClientPageState from './ui/ClientPageState';
import { supabase } from '../lib/supabase';
import { flushAccountantNotifications } from '../lib/notifyAccountant';
import {
  OnboardingSecondaryType,
  ONBOARDING_SECONDARY_LABELS,
  AUTHORITY_LABELS,
  AuthorityKind,
  OnboardingPrefill,
  FamilyStatus,
  FAMILY_STATUS_LABELS,
  FAMILY_STATUS_YEAR_LABELS,
  AuthorityRepresentations,
  RepTarget,
  OnboardingDraft,
} from '../types';
import { shaamSubmissions, type ScopePeople } from '../utils/repScope';
import {
  identityRequirements, missingIdentity,
  type IdentityRequirement, type IdentityDocsMap,
} from '../utils/identityEvidence';
import { FirmBranding } from '../types/firmProfile';
import { deriveQuotationBrand } from './quotations/quotationBranding';
import SignaturePad from './SignaturePad';
import { isValidIsraeliId } from '../utils/israeliId';
import { isValidEmail } from '../utils/email';
import EmailInput from './ui/EmailInput';
import HebrewTextInput from './ui/HebrewTextInput';
import { customerProcessMap } from '../lib/representationJourney';
import SampleSimulatedNote from './linkedScreens/SampleNote';
import { sampleOnboardingActions } from './linkedScreens/sampleOnboardingActions';
import type { SimulatedResult } from './linkedScreens/sampleActions';

interface Props {
  token: string;
}

export interface OnboardingInfo {
  clientName: string;
  firmName: string;
  branding: FirmBranding;
  alreadySubmitted: boolean;
  status: string;
  authorities: AuthorityKind[];
  alreadySigned: boolean;
  prefill: OnboardingPrefill;
  knownFirstName: string;
  knownLastName: string;
  knownEmail: string;
  niIncluded: boolean;
  /** ההיקף שהתבקש — קובע ממי מבקשים צילום תעודה. */
  scope?: AuthorityRepresentations;
  /** הטיוטה שנשמרה במעבר שלב (191) — ממנה הטופס חוזר לאותו מקום. */
  draft: OnboardingDraft;
  /** בן/בת הזוג כבר קיבל/ה קישור להשלמה עצמית (149) — נזכר גם אחרי רענון. */
  spouseFill: { requestedAt?: string; submittedAt?: string; token?: string };
}

// הקישור הזה מסיים בבקשת הייצוג בלבד. שאלון ההיכרות נשלח בנפרד מכרטיס הלקוח
// (קישור ?intake=) ואינו נגרר אוטומטית אחרי ההזדהות.

const SECONDARY_ORDER: OnboardingSecondaryType[] = ['parentId', 'driverLicense', 'passport'];

const FAMILY_ORDER: FamilyStatus[] = ['single', 'married', 'divorced', 'widowed', 'singleParent'];

const CURRENT_YEAR = new Date().getFullYear();

/** מה שהמסך מציג בפתיחתו — מה שהשרת החזיר, אחרי שהוכרע מי עדיף על מי (ראה onboardingViewDataFromRow). */
export interface OnboardingFormValues {
  firstName: string; lastName: string; idNumber: string; birthDate: string;
  secondaryType: OnboardingSecondaryType; secondaryValue: string;
  phone: string; email: string; city: string; address: string;
  familyStatus: FamilyStatus | ''; familyYear: string;
  spouseFirstName: string; spouseLastName: string; spouseIdNumber: string; spouseBirthYear: string;
  spousePhone: string;
  spouseBirthDate: string; spouseSecondaryType: OnboardingSecondaryType; spouseSecondaryValue: string;
}

const EMPTY_ONBOARDING_VALUES: OnboardingFormValues = {
  firstName: '', lastName: '', idNumber: '', birthDate: '', secondaryType: 'parentId', secondaryValue: '',
  phone: '', email: '', city: '', address: '', familyStatus: '', familyYear: '',
  spouseFirstName: '', spouseLastName: '', spouseIdNumber: '', spouseBirthYear: '', spousePhone: '',
  spouseBirthDate: '', spouseSecondaryType: 'parentId', spouseSecondaryValue: '',
};

export type OnboardingViewPhase = 'form' | 'submitted' | 'sign' | 'signed' | 'signLinkSent';

/** כל מה שהמסך צריך כדי להיצייר — בלי טעינה ובלי רשת. */
export interface OnboardingViewData {
  info: OnboardingInfo;
  idDocs: IdentityDocsMap;
  values: OnboardingFormValues;
  phase: OnboardingViewPhase;
  step: number;
  /** הטופס נפתח על טיוטה שמורה — מציגים «ממשיכים מאיפה שעצרתם» פעם אחת. */
  resumed: boolean;
  /** קישור שכבר הופק לבן/בת הזוג (149) — נזכר גם אחרי רענון. */
  spouseLink: string;
}

/**
 * כל מה שהמסך עושה מול העולם. בעמוד האמיתי — השרת; בתצוגה לדוגמה — פעולות
 * שאינן נוגעות בכלום (linkedScreens/sampleActions.ts).
 */
export interface OnboardingActions {
  saveStep(step: number, values: Record<string, string | number>):
    Promise<{ status: 'saved' } | { status: 'failed'; code?: string } | SimulatedResult>;
  submit(params: OnboardingSubmitParams):
    Promise<{ status: 'submitted' } | { status: 'failed' } | SimulatedResult>;
  submitSignature(signature: string):
    Promise<{ status: 'signed' } | { status: 'failed' } | SimulatedResult>;
  makeSpouseLink():
    Promise<{ status: 'created'; link: string } | { status: 'failed' } | SimulatedResult>;
  uploadIdDoc(r: IdentityRequirement, file: File):
    Promise<{ status: 'uploaded'; documentId: string } | { status: 'failed'; code?: string } | SimulatedResult>;
}

/** הפרמטרים של submit_onboarding_full, בלי הטוקן (הוא של הפעולה החיה). */
export type OnboardingSubmitParams = Record<string, string | number | string[] | null>;

export function liveOnboardingActions(token: string): OnboardingActions {
  return {
    async saveStep(s, clean) {
      const { data, error: e } = await supabase.rpc('save_onboarding_step', { p_token: token, p_step: s, p_values: clean });
      if (e || !data?.ok) return { status: 'failed', code: data?.error };
      return { status: 'saved' };
    },
    async submit(params) {
      const { data, error } = await supabase.rpc('submit_onboarding_full', { p_token: token, ...params });
      if (error || data === false) return { status: 'failed' };
      // בקשת הייצוג הושלמה. השאלון אינו חלק מהקישור הזה.
      // ההתראה לרו"ח כבר בתור; כאן רק מבקשים לרוקן אותו מיד. לא חוסם.
      flushAccountantNotifications(token);
      return { status: 'submitted' };
    },
    async submitSignature(signature) {
      const { data, error } = await supabase.rpc('submit_signature', { p_token: token, p_signature: signature });
      if (error || data === false) return { status: 'failed' };
      return { status: 'signed' };
    },
    async makeSpouseLink() {
      const { data, error: e } = await supabase.rpc('request_spouse_onboarding', {
        p_token: token,
        p_spouse_email: null,
      });
      const row = Array.isArray(data) ? data[0] : data;
      if (e || !row?.spouse_token) return { status: 'failed' };
      return { status: 'created', link: `${window.location.origin}/?spousefill=${row.spouse_token}` };
    },
    async uploadIdDoc(r, file) {
      const body = new FormData();
      body.append('token', token);
      body.append('person', r.person);
      body.append('docKind', r.kind);
      body.append('file', file);
      const { data, error: fnErr } = await supabase.functions.invoke('onboarding-upload-id', { body });
      if (fnErr || !data?.ok) return { status: 'failed', code: data?.error };
      return { status: 'uploaded', documentId: data.documentId };
    },
  };
}

/**
 * מתרגם את מה ש-get_onboarding החזיר למה שהמסך מציג.
 * ‼ מה שהלקוח עצמו כבר שמר (טיוטה, 191) גובר על כל זריעה של הרו"ח.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function onboardingViewDataFromRow(row: any): { data: OnboardingViewData; formOpened: boolean } {
  const st: string = row.status || 'pending_fill';
  const prefill: OnboardingPrefill = row.prefill || {};
  const draft: OnboardingDraft = (row.draft && typeof row.draft === 'object') ? row.draft : {};
  const spouseFill = (row.spouse_fill && typeof row.spouse_fill === 'object') ? row.spouse_fill : {};
  const info: OnboardingInfo = {
    clientName: row.client_name || '',
    firmName: row.firm_name || 'המשרד',
    branding: row.branding || {},
    alreadySubmitted: !!row.already_submitted,
    status: st,
    authorities: (row.authorities || []) as AuthorityKind[],
    alreadySigned: !!row.already_signed,
    prefill,
    knownFirstName: row.known_first_name || '',
    knownLastName: row.known_last_name || '',
    knownEmail: row.known_email || '',
    niIncluded: !!row.ni_included,
    scope: (row.scope || {}) as AuthorityRepresentations,
    draft,
    spouseFill,
  };
  const idDocs = (row.identity_docs || {}) as IdentityDocsMap;
  const values: OnboardingFormValues = { ...EMPTY_ONBOARDING_VALUES };
  // מה שהרו"ח כבר מילא (או שכבר רשום בכרטיס) נכנס כערך פתיחה; מה שלא —
  // נשאר ריק והלקוח ימלא. הכול ניתן לתיקון: הלקוח הוא מקור האמת.
  if (prefill.firstName) values.firstName = prefill.firstName;
  if (prefill.lastName) values.lastName = prefill.lastName;
  if (prefill.email) values.email = prefill.email;
  if (prefill.familyStatus) values.familyStatus = prefill.familyStatus;
  if (prefill.familyStatusYear) values.familyYear = String(prefill.familyStatusYear);
  // שם מפוצל אם קיים; אחרת פיצול זהיר של השם המלא — רק כזריעה, הלקוח מתקן.
  const spParts = (prefill.spouseName || '').trim().split(/\s+/).filter(Boolean);
  values.spouseFirstName = prefill.spouseFirstName || spParts[0] || '';
  values.spouseLastName = prefill.spouseLastName || spParts.slice(1).join(' ') || '';
  if (prefill.spouseIdNumber) values.spouseIdNumber = prefill.spouseIdNumber;
  if (prefill.spouseBirthYear) values.spouseBirthYear = String(prefill.spouseBirthYear);
  if (prefill.spousePhone) values.spousePhone = prefill.spousePhone;

  // ── מה שהלקוח עצמו כבר שמר גובר על כל זריעה (191) ──────────────────
  // ‼ הטיוטה היא של הלקוח — הוא הקליד, הוא המקור. חוזרים לשלב שאחרי
  //   האחרון שנשמר, כדי שלא יצטרך ללחוץ «המשך» על מה שכבר מילא.
  const v = draft.values ?? {};
  if (v.firstName) values.firstName = v.firstName;
  if (v.lastName) values.lastName = v.lastName;
  if (v.idNumber) values.idNumber = v.idNumber;
  if (v.birthDate) values.birthDate = v.birthDate;
  if (v.secondaryType) values.secondaryType = v.secondaryType;
  if (v.secondaryValue) values.secondaryValue = v.secondaryValue;
  if (v.phone) values.phone = v.phone;
  if (v.email) values.email = v.email;
  if (v.city) values.city = v.city;
  if (v.address) values.address = v.address;
  if (v.familyStatus) values.familyStatus = v.familyStatus;
  if (v.familyStatusYear) values.familyYear = String(v.familyStatusYear);
  if (v.spouseFirstName) values.spouseFirstName = v.spouseFirstName;
  if (v.spouseLastName) values.spouseLastName = v.spouseLastName;
  if (v.spouseIdNumber) values.spouseIdNumber = v.spouseIdNumber;
  if (v.spouseBirthYear) values.spouseBirthYear = String(v.spouseBirthYear);
  if (v.spousePhone) values.spousePhone = v.spousePhone;
  if (v.spouseBirthDate) values.spouseBirthDate = v.spouseBirthDate;
  if (v.spouseSecondaryType) values.spouseSecondaryType = v.spouseSecondaryType;
  if (v.spouseSecondaryValue) values.spouseSecondaryValue = v.spouseSecondaryValue;
  let step = 1;
  let resumed = false;
  const savedStep = Number(draft.step ?? 0) || 0;
  if (savedStep >= 1 && st === 'pending_fill' && !row.already_submitted) {
    step = Math.min(savedStep + 1, 4);
    resumed = true;
  }
  // הקישור לבן/בת הזוג נזכר: מי שכבר מסר לא מתבקש למלא במקומו/ה.
  const spouseLink = spouseFill.requestedAt && spouseFill.token
    ? `${window.location.origin}/?spousefill=${spouseFill.token}`
    : '';

  let phase: OnboardingViewPhase;
  // בזרימת החתימה החדשה (יש הגדרת PDF) — החתימה נעשית בקישור האישי, לא כאן.
  if (st === 'pending_signature' && row.has_setup) phase = 'signLinkSent';
  else if (st === 'pending_signature' && !row.already_signed) phase = 'sign';
  // הפרטים כבר נמסרו — מציגים את מסך הסיום, כולל התזכורת על המייל הבא.
  else if (row.already_submitted || row.already_signed || ['awaiting_stamp', 'awaiting_authorities', 'active'].includes(st)) {
    phase = row.already_signed ? 'signed' : 'submitted';
  } else phase = 'form';
  return { data: { info, idDocs, values, phase, step, resumed, spouseLink }, formOpened: phase === 'form' };
}

export default function OnboardingPage({ token }: Props) {
  const [loaded, setLoaded] = useState<OnboardingViewData | 'loading' | 'invalid'>('loading');
  const actions = useMemo(() => liveOnboardingActions(token), [token]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase.rpc('get_onboarding', { p_token: token });
      if (cancelled) return;
      const row = Array.isArray(data) ? data[0] : data;
      if (error || !row) {
        setLoaded('invalid');
        return;
      }
      const { data: view, formOpened } = onboardingViewDataFromRow(row);
      setLoaded(view);
      if (formOpened) {
        // «הקישור נפתח» — למשרד. לא חוסם ולא מוצג ללקוח; כישלון שקט.
        // ‼ בונה הבקשה של supabase-js עצל — בלי then/await הבקשה לא יוצאת בכלל.
        supabase.rpc('touch_onboarding', { p_token: token }).then(() => undefined, () => undefined);
      }
    })();
    return () => { cancelled = true; };
  }, [token]);

  if (loaded === 'loading') {
    return <ClientPageState quiet body="טוען…" />;
  }

  if (loaded === 'invalid') {
    return (
      /* אותו מסך מצב של עמוד ההצעה ועמוד החתימה — הלקוח עובר בין
         שלושתם באותו תהליך ולא אמור לראות שלושה כרטיסים שונים. */
      <ClientPageState
        mark="🔗"
        title="הקישור אינו תקין"
        body="ייתכן שהקישור פג תוקף או שאינו מלא. פנו למשרד לקבלת קישור חדש."
      />
    );
  }

  return <OnboardingView data={loaded} actions={actions} />;
}

export type OnboardingViewProps = { data: OnboardingViewData } & (
  | { mode?: 'live'; actions: OnboardingActions }
  /** בתצוגה לדוגמה אפשר להשמיט את `actions` — ברירת המחדל לא נוגעת בכלום. */
  | { mode: 'sample'; actions?: OnboardingActions }
);

/**
 * המסך עצמו, בלי טעינה: כל הנתונים נכנסים ב-`data` וכל מה שיוצא החוצה עובר
 * ב-`actions`. כך אותו מסך בדיוק משמש את הקישור האמיתי ואת «צפייה» במשרד.
 */
export function OnboardingView(props: OnboardingViewProps) {
  const { data } = props;
  const sample = props.mode === 'sample';
  const actions: OnboardingActions = props.actions ?? sampleOnboardingActions;
  const info = data.info;
  const v0 = data.values;
  const [phase, setPhase] = useState<OnboardingViewPhase>(data.phase);
  const [step, setStep] = useState(data.step);
  // ── פרטים אישיים ──
  const [firstName, setFirstName] = useState(v0.firstName);
  const [lastName, setLastName] = useState(v0.lastName);
  const [idNumber, setIdNumber] = useState(v0.idNumber);
  const [birthDate, setBirthDate] = useState(v0.birthDate);
  const [secondaryType, setSecondaryType] = useState<OnboardingSecondaryType>(v0.secondaryType);
  const [secondaryValue, setSecondaryValue] = useState(v0.secondaryValue);
  // ── פרטי קשר ──
  const [phone, setPhone] = useState(v0.phone);
  const [email, setEmail] = useState(v0.email);
  const [city, setCity] = useState(v0.city);
  const [address, setAddress] = useState(v0.address);
  // ── מצב משפחתי ──
  const [familyStatus, setFamilyStatus] = useState<FamilyStatus | ''>(v0.familyStatus);
  const [familyYear, setFamilyYear] = useState(v0.familyYear);
  // שם בן/בת הזוג נאסף מפוצל: ייפוי הכוח בביטוח הלאומי דורש שם פרטי ושם
  // משפחה בשדות נפרדים, ופיצול אוטומטי של "שם מלא" שוגה בשמות מורכבים.
  // מייל של בן/בת הזוג אינו נאסף כאן בכוונה — הוא נדרש רק אם יבחרו לשלוח
  // לו/לה קישור חתימה נפרד, והבחירה הזאת נעשית בשלב החתימה.
  const [spouseFirstName, setSpouseFirstName] = useState(v0.spouseFirstName);
  const [spouseLastName, setSpouseLastName] = useState(v0.spouseLastName);
  const [spouseIdNumber, setSpouseIdNumber] = useState(v0.spouseIdNumber);
  const [spouseBirthYear, setSpouseBirthYear] = useState(v0.spouseBirthYear);
  // ‼ פרט קשר קבוע של בן/בת הזוג, ולא ערך חד-פעמי: הוא נשמר בכרטיס
  // (clients.spouse_phone) ומשמש בהמשך גם את מסך «פרטי התקשרות» בבקשת
  // הייצוג בשע״ם. מה שלא יימסר כאן — המשרד ישלים בכרטיס, ולא יומצא.
  const [spousePhone, setSpousePhone] = useState(v0.spousePhone);
  // ── פרטי הזדהות של בן/בת הזוג — רק כשיש לו/לה הגשה משלו/ה בשע״ם ──
  const [spouseBirthDate, setSpouseBirthDate] = useState(v0.spouseBirthDate);
  const [spouseSecondaryType, setSpouseSecondaryType] = useState<OnboardingSecondaryType>(v0.spouseSecondaryType);
  const [spouseSecondaryValue, setSpouseSecondaryValue] = useState(v0.spouseSecondaryValue);
  // ── «בלי בן/בת הזוג אני אבוד/ה» ────────────────────────────────────────
  // ‼ הפרטים האלה הם של אדם אחר, ולרוב פשוט לא יודעים אותם. במקום להיתקע -
  // קישור להשלמה עצמית (149). ‼ אינו חוסם: הלקוח מגיש את החלק שלו ומסיים.
  const [spouseLink, setSpouseLink] = useState(data.spouseLink);

  const [spouseLinkBusy, setSpouseLinkBusy] = useState(false);
  const [spouseLinkCopied, setSpouseLinkCopied] = useState(false);
  const spouseDelegated = !!spouseLink;

  // ── צילומי תעודות ──
  // ‼ הזנת המספר אינה מספיקה. ממי מבקשים נגזר מהיקף הייצוג, ואיזו תעודה —
  //   מאמצעי הזיהוי שנבחר. ראה utils/identityEvidence.
  const [idDocs, setIdDocs] = useState<IdentityDocsMap>(data.idDocs);
  const [uploading, setUploading] = useState<RepTarget | null>(null);
  // ── «אין לי את זה זמין כרגע» ─────────────────────────────────────────────
  // ‼ בחירה מפורשת לכל אדם, לא ברירת מחדל: הצילום עדיין נדרש, רק לא עכשיו.
  //   מי שנדחה מקבל פריט העלאה בדף האישי, והמשרד רואה שחסר. ראה מיגרציה 191.
  const [idDeferred, setIdDeferred] = useState<Partial<Record<RepTarget, boolean>>>({});

  const [signature, setSignature] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** הטופס נפתח על טיוטה שמורה — מציגים «ממשיכים מאיפה שעצרתם» פעם אחת. */
  const [resumed, setResumed] = useState(data.resumed);
  /** אישור קצר אחרי שמירה במעבר שלב — נעלם לבד. */
  const [savedFlash, setSavedFlash] = useState(false);
  /** באיזה פקד נלחץ משהו שבתצוגה לדוגמה לא בוצע — ליד אותו פקד נאמר שלא נשלח דבר. */
  const [simKey, setSimKey] = useState<string | null>(null);
  const simNote = (key: string) => (simKey === key ? <SampleSimulatedNote /> : null);

  useEffect(() => {
    if (!savedFlash) return;
    const t = setTimeout(() => setSavedFlash(false), 2200);
    return () => clearTimeout(t);
  }, [savedFlash]);

  // עיצוב אחיד — אותם טוקנים של עמוד ההצעה, כדי שהמראה יהיה זהה בשני העמודים
  const brand = deriveQuotationBrand({
    id: '', firmName: info?.firmName, branding: info?.branding ?? {},
    communication: {}, settings: {},
  } as any);
  const ink = brand.ink;
  const accent = brand.accent;
  const monogram = brand.monogram;
  const logoUrl = brand.logoUrl;
  const btnRadius = brand.buttonStyle === 'pill' ? 999 : brand.radius;
  const ctaStyle: React.CSSProperties = brand.buttonStyle === 'outline'
    ? { background: 'transparent', color: ink, border: `1.5px solid ${ink}` }
    : { background: accent, color: '#fff', border: 'none' };
  // שם לפנייה אישית. בקישור שהופק בלי שם — הלקוח שהקליד זה עתה, אחרת מהבקשה.
  const greetName = (firstName || info?.clientName || '').trim().split(/\s+/)[0] || '';

  const yearLabel = familyStatus ? FAMILY_STATUS_YEAR_LABELS[familyStatus] : undefined;

  // ── מי חייב לצלם תעודה, ואיזו ──────────────────────────────────────────────
  // ‼ לפי אדם ולא לפי רשות: מי שמופיע בשלוש רשויות מעלה פעם אחת.
  const scopePeople: ScopePeople = {
    married: familyStatus === 'married',
    clientName: `${firstName} ${lastName}`.trim(),
    spouseName: `${spouseFirstName} ${spouseLastName}`.trim(),
  };
  // ── האם לבן/בת הזוג יש הגשה משלו/ה בשע״ם ─────────────────────────────────
  // ‼ הכרעת גיא (31.8): מי שיש לו תיק צריך את ערכת ההזדהות שלו — ת.ז. +
  // רישיון/דרכון/ת.ז. הורה. אין תיק — לא מטריחים. "יש תיק" = יש לו/לה הגשה
  // בשע״ם: תיק מע"מ/ניכויים על שמו/ה, או שתיק מ"ה מתנהל עליו/ה (לפי הכוונה
  // שנרשמה בפתיחה — ההכרעה הסופית ממילא נעשית מול שע״ם).
  const spouseSub = familyStatus === 'married'
    ? shaamSubmissions(info?.scope, scopePeople, info?.prefill.registeredSpouse).find(x => x.target === 'spouse')
    : undefined;
  // ‼ מה שנמסר לבן/בת הזוג יורד מהרשימה כאן, ולא רק מהחובה: דרישה שמוצגת
  // לממלא נקראת כמשהו ש**הוא** צריך לעשות, והתעודה הזאת אינה שלו.
  const idRequirements = identityRequirements(info?.scope, scopePeople, {
    client: secondaryType,
    ...(spouseSub ? { spouse: spouseSecondaryType } : {}),
  }).filter(r => !(spouseDelegated && r.person === 'spouse'));
  const idMissing = missingIdentity(idRequirements, idDocs);
  /** מי חסר *ולא* נדחה — רק אלה חוסמים את השליחה. */
  const idBlocking = idMissing.filter(r => !idDeferred[r.person]);
  /** מי נדחה ועדיין חסר — מה שנשלח לשרת ומה שמופיע במסך הסיום. */
  const idDeferredPersons = idMissing.filter(r => !!idDeferred[r.person]).map(r => r.person);

  /**
   * שמירת השלב בשרת — במעבר «המשך» בלבד (191). כותב רק את שדות השלב;
   * השרת מאמת שוב ודוחה מפתח זר. כישלון עוצר את המעבר: לא ממשיכים על
   * טיוטה שלא נשמרה, אחרת הלקוח חושב שנשמר ויוצא.
   */
  async function saveStep(s: number): Promise<boolean> {
    const values: Record<string, string | number> =
      s === 1 ? { firstName, lastName, idNumber, birthDate, secondaryType, secondaryValue }
      : s === 2 ? { phone, email, city, address }
      : {
        familyStatus, familyStatusYear: familyYear,
        ...(familyStatus === 'married' ? {
          spouseFirstName, spouseLastName, spouseIdNumber, spousePhone,
          spouseBirthYear: spouseSub ? '' : spouseBirthYear,
          spouseBirthDate: spouseSub && !spouseDelegated ? spouseBirthDate : '',
          spouseSecondaryType: spouseSub && !spouseDelegated ? spouseSecondaryType : '',
          spouseSecondaryValue: spouseSub && !spouseDelegated ? spouseSecondaryValue : '',
        } : {}),
      };
    const clean: Record<string, string | number> = {};
    for (const [k, v] of Object.entries(values)) clean[k] = typeof v === 'string' ? v.trim() : v;
    const r = await actions.saveStep(s, clean);
    if (r.status === 'failed') {
      const code = r.code;
      setError(
        code === 'already_submitted' ? 'הפרטים כבר נשלחו מקישור זה. אם נדרש תיקון - פנו למשרד.'
          : code === 'invalid_value' ? 'אחד הפרטים לא התקבל בשרת. בדקו את מה שהוזן ונסו שוב.'
            : 'לא הצלחנו לשמור את הפרטים. בדקו את החיבור לאינטרנט ונסו שוב.',
      );
      return false;
    }
    return true;
  }

  /**
   * פותח לבן/בת הזוג קישור משלו/ה להשלמת הפרטים שלו/ה.
   * ‼ אינו מגיש ואינו חוסם: הממלא ממשיך ומסיים את החלק שלו באותו רגע.
   */
  async function makeSpouseLink() {
    setSpouseLinkBusy(true);
    setError(null);
    setSimKey(null);
    try {
      const r = await actions.makeSpouseLink();
      if (r.status === 'failed') {
        setError('לא הצלחנו ליצור קישור. נסו שוב, ואם זה חוזר - פנו למשרד.');
        return;
      }
      if (r.status === 'simulated') { setSimKey('spouseLink'); return; }
      setSpouseLink(r.link);
    } finally {
      setSpouseLinkBusy(false);
    }
  }

  async function uploadIdDoc(r: IdentityRequirement, file: File) {
    setUploading(r.person);
    setError(null);
    setSimKey(null);
    try {
      const res = await actions.uploadIdDoc(r, file);
      if (res.status === 'failed') {
        const code = res.code;
        setError(
          code === 'too_large' ? 'הקובץ גדול מדי - עד 10MB'
            : code === 'type_not_allowed' ? 'אפשר לצרף תמונה או PDF בלבד'
              : code === 'rate_limited' ? 'הועלו יותר מדי קבצים. נסו שוב בעוד שעה'
                : 'ההעלאה לא הצליחה. נסו שוב, ואם זה חוזר - פנו למשרד.',
        );
        return;
      }
      if (res.status === 'simulated') { setSimKey(`upload:${r.person}`); return; }
      setIdDocs(prev => ({
        ...prev,
        [r.person]: [...(prev[r.person] ?? []), { documentId: res.documentId, docKind: r.kind, fileName: file.name }],
      }));
    } finally {
      setUploading(null);
    }
  }
  // שלב המצב המשפחתי מוצג תמיד, גם כשהרו"ח כבר בחר: הערך מגיע מסומן מראש,
  // אבל הלקוח יכול לתקן — הוא המקור המוסמך על המצב המשפחתי של עצמו.
  // (בעבר בחירה לא-נשואה של הרו"ח דילגה על השלב, והלקוח לא יכול היה לתקן טעות.)
  const lastStep = 4;

  function validateStep(s: number): string | null {
    if (s === 1) {
      if (!firstName.trim()) return 'יש להזין שם פרטי';
      if (!lastName.trim()) return 'יש להזין שם משפחה';
      if (!/^\d{9}$/.test(idNumber.trim())) return 'יש להזין 9 ספרות בתעודת הזהות';
      if (!isValidIsraeliId(idNumber.trim())) return 'מספר תעודת הזהות אינו תקין - בדקו שוב';
      if (!birthDate) return 'יש להזין תאריך לידה';
      if (new Date(birthDate) > new Date()) return 'תאריך הלידה לא יכול להיות בעתיד';
      if (!secondaryValue.trim()) return `יש להזין ${ONBOARDING_SECONDARY_LABELS[secondaryType]}`;
    }
    if (s === 2) {
      if (!/^[\d\-+\s()]{9,}$/.test(phone.trim())) return 'יש להזין מספר טלפון תקין';
      if (!isValidEmail(email)) return 'יש להזין כתובת מייל תקינה';
      if (!city.trim()) return 'יש להזין עיר מגורים';
      if (!address.trim()) return 'יש להזין כתובת (רחוב ומספר)';
    }
    if (s === 4) {
      // ‼ הצילום נדרש, אבל אינו חייב להיות ביד עכשיו (191): מי שבחר «אעלה
      // מאוחר יותר» עובר, והצילום נדרש ממנו בדף האישי. מי שלא בחר — חסום,
      // והשגיאה נוקבת בשם: "יש לצרף צילום" סתמי שולח לחפש איפה.
      const m = missingIdentity(idRequirements, idDocs).filter(r => !idDeferred[r.person]);
      if (m.length) return `יש לצרף ${m[0].prompt} של ${m[0].personName} - או לסמן שתעלו אותו מאוחר יותר`;
    }
    if (s === 3) {
      if (!familyStatus) return 'יש לבחור מצב משפחתי';
      if (yearLabel) {
        const y = Number(familyYear);
        if (!familyYear.trim()) return `יש להזין ${yearLabel}`;
        if (!Number.isInteger(y) || y < 1900 || y > CURRENT_YEAR) return `${yearLabel} - יש להזין שנה תקינה`;
      }
      if (familyStatus === 'married') {
        if (!spouseFirstName.trim()) return 'יש להזין את השם הפרטי של בן/בת הזוג';
        if (!spouseLastName.trim()) return 'יש להזין את שם המשפחה של בן/בת הזוג';
        // ‼ הת.ז. היא בדיוק מה שלא יודעים על אדם אחר. כשנמסר לבן/בת הזוג
        // היא יורדת מהחובה; מה שכן הוקלד עדיין נבדק, כדי שטעות הקלדה לא תעבור.
        if (!spouseDelegated && !spouseIdNumber.trim()) return 'יש להזין את תעודת הזהות של בן/בת הזוג';
        if (spouseIdNumber.trim() && !isValidIsraeliId(spouseIdNumber.trim())) return 'תעודת הזהות של בן/בת הזוג אינה תקינה';
        if (spouseSub && !spouseDelegated) {
          // ‼ יש לו/לה תיק ⇒ הזנה נפרדת בשע״ם על הת.ז. שלו/ה, וצריך את אותה
          // ערכת הזדהות כמו של הממלא. אין תיק ⇒ מספיקה שנת לידה (לב"ל).
          // ‼ נמסר לבן/בת הזוג ⇒ החלק הזה כבר לא באחריות הממלא, והוא מסיים.
          if (!spouseBirthDate) return 'יש להזין את תאריך הלידה של בן/בת הזוג';
          if (new Date(spouseBirthDate) > new Date()) return 'תאריך הלידה של בן/בת הזוג לא יכול להיות בעתיד';
          if (!spouseSecondaryValue.trim()) return `יש להזין ${ONBOARDING_SECONDARY_LABELS[spouseSecondaryType]} של בן/בת הזוג`;
        } else if (spouseSub && spouseDelegated) {
          // ת.ז. עדיין נדרשת מהממלא רק אם הוא הקליד אותה; ריקה - בן/בת הזוג ימלא.
        } else {
          const by = Number(spouseBirthYear);
          if (!spouseBirthYear.trim()) return 'יש להזין את שנת הלידה של בן/בת הזוג';
          if (!Number.isInteger(by) || by < 1900 || by > CURRENT_YEAR) return 'שנת הלידה של בן/בת הזוג אינה תקינה';
        }
      }
    }
    return null;
  }

  async function handleNext() {
    // ‼ בתצוגה לדוגמה «המשך» הוא ניווט מקומי בלבד: בלי אימות ובלי שמירה, כדי
    // שאפשר לעבור על כל השלבים בלי למלא אותם — ובלי «✓ נשמר» שלא קרה.
    const v = sample ? null : validateStep(step);
    if (v) { setError(v); return; }
    setError(null);
    setSimKey(null);
    if (step >= lastStep) { void handleSubmit(); return; }
    // ‼ שמירה לפני המעבר — זו נקודת העמידות של הטופס (191).
    setBusy(true);
    const saved = await saveStep(step);
    setBusy(false);
    if (!saved) return;
    if (!sample) setSavedFlash(true);
    setStep(step + 1);
  }

  async function handleSubmit() {
    if (!sample) {
      for (let s = 1; s <= lastStep; s++) {
        const v = validateStep(s);
        if (v) { setError(v); setStep(s); return; }
      }
    }
    setBusy(true);
    setError(null);
    const res = await actions.submit({
      p_first_name: firstName.trim(),
      p_last_name: lastName.trim(),
      p_id_number: idNumber.trim(),
      p_birth_date: birthDate,
      p_secondary_type: secondaryType,
      p_secondary_value: secondaryValue.trim(),
      p_phone: phone.trim(),
      p_email: email.trim(),
      p_city: city.trim(),
      p_address: address.trim(),
      p_family_status: familyStatus || null,
      p_family_status_year: yearLabel && familyYear.trim() ? Number(familyYear) : null,
      // spouse_name המשורשר נשמר לתאימות; המקור הוא השדות המפוצלים
      p_spouse_name: familyStatus === 'married' ? `${spouseFirstName.trim()} ${spouseLastName.trim()}`.trim() : null,
      p_spouse_email: null,
      p_spouse_id_number: familyStatus === 'married' ? spouseIdNumber.trim() : null,
      p_spouse_first_name: familyStatus === 'married' ? spouseFirstName.trim() : null,
      p_spouse_last_name: familyStatus === 'married' ? spouseLastName.trim() : null,
      // כשנאסף תאריך מלא — שנת הלידה (שב"ל צריך) נגזרת ממנו
      p_spouse_birth_year: familyStatus === 'married'
        ? (spouseSub && spouseBirthDate ? Number(spouseBirthDate.slice(0, 4))
            : spouseBirthYear.trim() ? Number(spouseBirthYear) : null)
        : null,
      // ‼ נמסר לבן/בת הזוג ⇒ לא שולחים את ערכי הזיהוי שלו/ה מכאן: הם כבר
      //   (או עוד) נכתבים מהקישור שלו/ה, וברירת המחדל של הבורר כאן הייתה
      //   דורסת את מה שהוא/היא בחר/ה.
      p_spouse_birth_date: familyStatus === 'married' && spouseSub && !spouseDelegated ? (spouseBirthDate || null) : null,
      p_spouse_secondary_type: familyStatus === 'married' && spouseSub && !spouseDelegated ? spouseSecondaryType : null,
      p_spouse_secondary_value: familyStatus === 'married' && spouseSub && !spouseDelegated ? (spouseSecondaryValue.trim() || null) : null,
      // 191: מי בחר/ה להעלות את צילום התעודה מאוחר יותר — נדרש בדף האישי.
      p_identity_deferred: idDeferredPersons,
      // ‼ נשמר בכרטיס כפרט קשר קבוע (194). ריק נשאר ריק.
      p_spouse_phone: familyStatus === 'married' ? (spousePhone.trim() || null) : null,
    });
    if (res.status === 'failed') {
      setError('השליחה לא הצליחה. נסו שוב, ואם זה חוזר - פנו למשרד.');
      setBusy(false);
      return;
    }
    // ‼ לא מתקדמים: בתצוגה לדוגמה המסך נשאר, כדי שאפשר להסתכל סביב.
    if (res.status === 'simulated') { setBusy(false); setSimKey('nav'); return; }
    setBusy(false);
    setPhase('submitted');
  }

  async function handleSubmitSignature() {
    if (!signature) { setError('יש לחתום לפני השליחה'); return; }
    setBusy(true);
    setError(null);
    setSimKey(null);
    const res = await actions.submitSignature(signature);
    if (res.status === 'failed') {
      setError('השליחה לא הצליחה. נסו שוב, ואם זה חוזר - פנו למשרד.');
      setBusy(false);
      return;
    }
    if (res.status === 'simulated') { setBusy(false); setSimKey('signature'); return; }
    setPhase('signed');
  }

  // ── styles ──
  const page: React.CSSProperties = {
    minHeight: '100vh', background: brand.pageBg, display: 'flex', alignItems: 'flex-start',
    justifyContent: 'center', padding: '40px 16px', fontFamily: `'${brand.font}', sans-serif`, direction: 'rtl',
  };
  const card: React.CSSProperties = {
    width: 460, maxWidth: '100%', background: brand.cardBg, border: `1px solid ${brand.border}`,
    borderRadius: brand.radius + 4, padding: '34px 34px 26px',
  };
  const inputStyle: React.CSSProperties = {
    width: '100%', boxSizing: 'border-box', background: brand.cardBg, border: `1px solid ${brand.border}`,
    borderRadius: Math.min(brand.radius, 12), padding: '11px 13px', fontSize: 14, color: '#1A1A1A', marginTop: 6,
  };
  const label: React.CSSProperties = { fontSize: 12.5, color: '#6B6B68', display: 'block' };

  function Header() {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 30 }}>
        {logoUrl ? (
          <img src={logoUrl} alt={info?.firmName || ''} style={{ maxHeight: 36 * brand.logoScale, maxWidth: 150 * brand.logoScale, objectFit: 'contain' }} />
        ) : (
          <>
            <div style={{ width: 30, height: 30, borderRadius: '50%', border: `1.5px solid ${ink}`, display: 'flex', alignItems: 'center', justifyContent: 'center', color: ink, fontWeight: 500, fontSize: 12 }}>{monogram}</div>
            <span style={{ fontSize: 12.5, color: ink }}>{info?.firmName}</span>
          </>
        )}
        <span style={{ marginInlineStart: 'auto', display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, color: '#6B6B68' }}>מאובטח</span>
      </div>
    );
  }

  if (phase === 'submitted') {
    return (
      <div style={page}>
        <div style={{ ...card, width: 520 }}>
          <Header />
          <div style={{ textAlign: 'center', padding: '4px 0 20px' }}>
            <div style={{ width: 46, height: 46, borderRadius: '50%', background: ink, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 14px', color: '#fff', fontSize: 24 }}>✓</div>
            <div style={{ fontSize: 26, fontWeight: 600, color: '#111', marginBottom: 6, letterSpacing: '-.02em' }}>
              קיבלנו הכול{greetName ? `, ${greetName}` : ''}!
            </div>
            <div style={{ fontSize: 14, color: '#6B6B68', lineHeight: 1.6 }}>
              {info?.firmName} כבר מכין את בקשת הייצוג מול הרשויות.
            </div>
          </div>

          {/* ‼ הלקוח חייב לצאת מכאן ביודעו שנשארו לו פעולות. הכותרת לא מבטיחה
              עוד "יגיע מייל" כעובדה מובנת מאליה (המייל האוטומטי על אישור
              ההצעה הוסר — הכרעת גיא, מיגרציה 102) — היא אומרת מה עוד נשאר,
              ומפנה גם לדף האישי הקבוע כמשטח המעקב. חתימת ייפוי הכוח מגיעה
              בקישור אישי נפרד, כי המשרד מכין את הטופס אחרי שהפרטים מגיעים.
              ‼ סדר התהליך (הכרעת גיא 2026-08-18): פרטים → חתימה → הגשה
              לרשויות → ייצוג פעיל. אין הגשה לרשויות לפני החתימה. */}
          <div style={{ background: accent, color: '#fff', borderRadius: '10px 10px 0 0', padding: '13px 16px', textAlign: 'center' }}>
            <div style={{ fontSize: 17, fontWeight: 600 }}>
              {(() => {
                const n = 1 + (info?.niIncluded ? 1 : 0) + (idDeferredPersons.length > 0 ? 1 : 0);
                return n === 1 ? 'עוד לא סיימנו - נשארה פעולה אחת'
                  : n === 2 ? 'עוד לא סיימנו - נשארו שתי פעולות'
                    : 'עוד לא סיימנו - נשארו שלוש פעולות';
              })()}
            </div>
            <div style={{ fontSize: 13, fontWeight: 500, opacity: .92, marginTop: 3 }}>
              {idDeferredPersons.length > 0
                ? 'צילום התעודה ממתין בדף האישי, וקישור החתימה יגיע בשעות הקרובות'
                : info?.niIncluded
                  ? 'קישור החתימה יגיע בשעות הקרובות, ואישור הביטוח הלאומי - אחרי שנגיש'
                  : 'נשלח לכם קישור אישי לחתימה, בשעות הקרובות'}
            </div>
          </div>
          <div style={{ border: `2px solid ${accent}`, borderTop: 'none', borderRadius: '0 0 10px 10px', padding: '16px', marginBottom: 20 }}>
            <div style={{ fontSize: 13, color: '#6B6B68', lineHeight: 1.7 }}>
              נכין את בקשת הייצוג ונשלח קישור אישי לחתימה אל:
            </div>
            {/* הצגת הכתובת נותנת ללקוח הזדמנות אחרונה לתפוס טעות הקלדה */}
            <div dir="ltr" style={{
              margin: '8px 0 16px', padding: '11px 12px', background: '#F7F6F3', borderRadius: 8,
              fontSize: 15, fontWeight: 600, color: '#111', textAlign: 'center', wordBreak: 'break-all',
            }}>
              {email.trim() || info?.knownEmail || '-'}
            </div>

            {/* ‼ צילום שנדחה (191): פעולה ראשונה, לפני החתימה — כי בלעדיו המשרד
                לא יגיש. מוצג רק למי שבחר, ואומר איפה מעלים: הדף האישי. */}
            {idDeferredPersons.length > 0 && (
              <NextAction n={1} title="צילום התעודה - כשיהיה זמין" tone="#8A4B00"
                text={`${idDeferredPersons.map(p => idRequirements.find(r => r.person === p)?.personName).filter(Boolean).join(' ו-')}: הצילום ממתין להעלאה בדף האישי שלכם, תחת «מסמכים שביקשנו». אפשר להעלות משם בכל רגע, גם מהטלפון.`} />
            )}
            <NextAction n={idDeferredPersons.length > 0 ? 2 : 1} title="חתימה על ייפוי הכוח" tone={accent}
              text="חתימה דיגיטלית בלחיצה, גם מהטלפון. אחרי החתימה נגיש את בקשת הייצוג לרשויות." />
            {info?.niIncluded && (
              <NextAction n={idDeferredPersons.length > 0 ? 3 : 2} title="אישור בביטוח הלאומי" tone="#C2410C"
                text="אחרי ההגשה נשלח לכם מספר אסמכתא. מאשרים באתר הביטוח הלאומי או בטלפון - לוקח כדקה." />
            )}

            <div style={{ fontSize: 12.5, color: '#8A4B00', background: '#FFF4E0', borderRadius: 8, padding: '10px 12px', lineHeight: 1.6, marginTop: 14, textAlign: 'center' }}>
              {info?.niIncluded
                ? 'בלי החתימה אי אפשר להגיש את בקשת הייצוג, ובלי אישור הביטוח הלאומי הייצוג בביטוח הלאומי לא נכנס לתוקף.'
                : 'בלי החתימה שלכם אי אפשר להגיש את בקשת הייצוג לרשויות.'}
            </div>
            <div style={{ fontSize: 12, color: '#9A9A95', lineHeight: 1.6, marginTop: 10, textAlign: 'center' }}>
              אפשר לעקוב אחרי ההתקדמות בדף האישי שקיבלתם עם הצעת המחיר.
            </div>
          </div>

          <ProcessMap current={2} />

          <div style={{ textAlign: 'center', fontSize: 12, color: '#9A9A95' }}>אפשר לסגור את החלון.</div>
        </div>
      </div>
    );
  }

  if (phase === 'sign') {
    const authList = (info?.authorities || []).map(a => AUTHORITY_LABELS[a]).filter(Boolean).join(', ');
    return (
      <div style={page}>
        <div style={card}>
          <Header />
          <div style={{ fontSize: 11, letterSpacing: '.08em', color: '#9A9A95', marginBottom: 8 }}>חתימה על ייפוי כוח</div>
          <div style={{ fontSize: 24, fontWeight: 500, color: '#111', marginBottom: 6 }}>כמעט סיימנו{greetName ? `, ${greetName}` : ''}</div>
          <div style={{ fontSize: 13.5, lineHeight: 1.6, color: '#6B6B68', marginBottom: 20 }}>
            בחתימתכם אתם מייפים את כוחו של {info?.firmName} לייצג אתכם מול {authList || 'רשויות המס'}. החתימה מאובטחת ומשמשת אך ורק לטופס ייפוי הכוח.
          </div>
          <div style={{ ...label, marginBottom: 8 }}>חתמו כאן</div>
          <SignaturePad value={signature} onChange={setSignature} />
          {error && (
            <div style={{ marginTop: 16, padding: '10px 12px', background: '#FCEBEB', color: '#A32D2D', borderRadius: 9, fontSize: 12.5 }}>{error}</div>
          )}
          {simNote('signature')}
          <button onClick={handleSubmitSignature} disabled={busy}
            style={{ width: '100%', marginTop: 20, ...ctaStyle, borderRadius: btnRadius, padding: 13, fontSize: 14.5, fontWeight: 600, cursor: busy ? 'default' : 'pointer', opacity: busy ? 0.7 : 1 }}>
            {busy ? 'שולח…' : 'שליחת החתימה'}
          </button>
        </div>
      </div>
    );
  }

  if (phase === 'signLinkSent') {
    return (
      <div style={page}>
        <div style={card}>
          <Header />
          <div style={{ textAlign: 'center', padding: '8px 0' }}>
            <div style={{ fontSize: 26, marginBottom: 10 }}>✉️</div>
            <div style={{ fontSize: 18, fontWeight: 500, color: '#111', marginBottom: 5 }}>הטופס מוכן לחתימה</div>
            <div style={{ fontSize: 13, color: '#6B6B68', lineHeight: 1.6 }}>
              שלחנו לכל אחד מהחותמים קישור אישי לחתימה במייל. פתחו את המייל מ{info?.firmName || 'המשרד'} ולחצו על הכפתור שבו כדי לחתום.
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (phase === 'signed') {
    return (
      <div style={page}>
        <div style={card}>
          <Header />
          <div style={{ textAlign: 'center', padding: '8px 0' }}>
            <div style={{ width: 42, height: 42, borderRadius: '50%', background: ink, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 12px', color: '#fff', fontSize: 22 }}>✓</div>
            <div style={{ fontSize: 18, fontWeight: 500, color: '#111', marginBottom: 5 }}>תודה{greetName ? `, ${greetName}` : ''}. קיבלנו את החתימה.</div>
            <div style={{ fontSize: 13, color: '#6B6B68', lineHeight: 1.6 }}>{info?.firmName} יגיש עכשיו את בקשת הייצוג לרשויות ויעדכן אתכם. אפשר לסגור את החלון.</div>
          </div>
        </div>
      </div>
    );
  }


  // phase === 'form' — טופס רב-שלבי. במסך טלפון שלושה מסכים קצרים עדיפים על
  // טופס אחד ארוך: פחות גלילה, ושגיאה מסומנת ליד השדה שגרם לה.
  const stepTitles = ['הפרטים שלכם', 'איך נשיג אתכם', 'מצב משפחתי', 'צילום תעודות'];
  const fieldBox = { marginBottom: 16 } as React.CSSProperties;

  function Progress() {
    return (
      <div style={{ display: 'flex', gap: 6, marginBottom: 18 }}>
        {Array.from({ length: lastStep }, (_, i) => i + 1).map(n => (
          <div key={n} style={{
            flex: 1, height: 3, borderRadius: 2,
            background: n <= step ? accent : '#E3E2DD',
          }} />
        ))}
      </div>
    );
  }

  /** פעולה ממוספרת במסך הסיום — כל אחת בשורה משלה עם עיגול צבעוני. */
  function NextAction({ n, title, text, tone }: { n: number; title: string; text: string; tone: string }) {
    return (
      <div style={{ display: 'flex', gap: 11, alignItems: 'flex-start', padding: '11px 0', borderTop: '1px solid #F0EFEB' }}>
        <div style={{
          flex: '0 0 auto', width: 28, height: 28, borderRadius: '50%', background: tone,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: '#fff', fontSize: 14, fontWeight: 600, marginTop: 1,
        }}>{n}</div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 16, fontWeight: 600, color: '#111', marginBottom: 2 }}>{title}</div>
          <div style={{ fontSize: 13, color: '#6B6B68', lineHeight: 1.6 }}>{text}</div>
        </div>
      </div>
    );
  }

  /**
   * מפת התהליך כולו. מוצגת בכניסה ובסיום — הלקוח צריך לדעת מראש שיגיע אליו
   * מייל נוסף, אחרת הוא חושב שסיים ולא פותח אותו, והייצוג נתקע.
   * ‼ M2: נגזרת מאותה הגדרת תהליך שהמשרד רואה ב«תהליכים» (customerProcessMap),
   *   ולכן אותו סדר ואותן אבני-דרך — רק בלי שלבי המשרד. ביטוח לאומי מופיע
   *   כשהוא כלול.
   */
  function ProcessMap({ current }: { current: 1 | 2 }) {
    const steps = customerProcessMap({ niIncluded: !!info?.niIncluded })
      .map((m, i) => ({ n: i + 1, title: m.title, text: m.text }));
    const last = steps.length;
    return (
      <div style={{ background: '#F7F6F3', borderRadius: 10, padding: '14px 15px', marginBottom: 24 }}>
        <div style={{ fontSize: 11.5, letterSpacing: '.06em', color: '#9A9A95', marginBottom: 11 }}>איך זה עובד</div>
        {steps.map(s => {
          const done = s.n < current;
          const now = s.n === current;
          return (
            <div key={s.n} style={{ display: 'flex', gap: 9, alignItems: 'flex-start', paddingBottom: s.n < last ? 10 : 0 }}>
              <div style={{
                flex: '0 0 auto', width: 19, height: 19, borderRadius: '50%', marginTop: 1,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 10.5, fontWeight: 600,
                background: done || now ? ink : '#E3E2DD',
                color: done || now ? '#fff' : '#8A8A85',
              }}>
                {done ? '✓' : s.n}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 12.5, fontWeight: now ? 700 : 500, color: now ? '#111' : '#6B6B68' }}>
                  {s.title}
                </div>
                <div style={{ fontSize: 11.5, color: '#9A9A95', lineHeight: 1.5 }}>{s.text}</div>
              </div>
            </div>
          );
        })}
      </div>
    );
  }

  return (
    <div style={page}>
      <div style={card}>
        <Header />
        <Progress />
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 8 }}>
          <div style={{ fontSize: 11, letterSpacing: '.08em', color: '#9A9A95' }}>
            שלב {step} מתוך {lastStep} · {stepTitles[step - 1]}
          </div>
          {/* ‼ אישור קצר אחרי «המשך»: השמירה קרתה בשרת, לא רק במסך. */}
          <span aria-live="polite" style={{
            marginInlineStart: 'auto', fontSize: 11.5, color: '#2E7D53',
            opacity: savedFlash ? 1 : 0, transition: 'opacity .3s',
          }}>{'✓'} נשמר</span>
        </div>

        {/* ‼ חזרה לטופס שנשמר (191): אומרים במפורש שהפרטים נשמרו ושממשיכים
            מאותה נקודה — אחרת לקוח שרואה שלב 3 חושב שהמערכת "דילגה" לו. */}
        {resumed && step > 1 && (
          <div style={{
            display: 'flex', alignItems: 'flex-start', gap: 8, marginBottom: 16,
            padding: '10px 12px', borderRadius: 9, border: '1px solid #CFE3D4', background: '#F5FAF6',
          }}>
            <span style={{ color: '#2E7D53', marginTop: 1 }}>{'✓'}</span>
            <span style={{ fontSize: 12.5, lineHeight: 1.55, color: '#1f3d2b' }}>
              <strong>ממשיכים מאיפה שעצרתם.</strong> הפרטים שמילאתם נשמרו; אפשר לחזור אחורה ולתקן.
            </span>
            <button type="button" onClick={() => setResumed(false)} aria-label="סגירה"
              style={{ marginInlineStart: 'auto', border: 'none', background: 'transparent', color: '#6B6B68', cursor: 'pointer', fontSize: 14, lineHeight: 1 }}>×</button>
          </div>
        )}

        {step === 1 && (
          <>
            <div style={{ fontSize: 24, fontWeight: 500, color: '#111', marginBottom: 6 }}>נעים להכיר{greetName ? `, ${greetName}` : ''}</div>
            <div style={{ fontSize: 13.5, lineHeight: 1.6, color: '#6B6B68', marginBottom: 20 }}>
              כדי ש{info?.firmName || 'המשרד'} יוכל לייצג אתכם מול רשויות המס, נאסוף כמה פרטים. לוקח כדקה.
            </div>

            <ProcessMap current={1} />

            <div style={{ display: 'flex', gap: 10, marginBottom: 16 }}>
              <label style={{ ...label, flex: 1 }}>שם פרטי
                <input style={inputStyle} value={firstName} onChange={e => setFirstName(e.target.value)}
                  placeholder="ישראל" autoComplete="given-name" />
              </label>
              <label style={{ ...label, flex: 1 }}>שם משפחה
                <input style={inputStyle} value={lastName} onChange={e => setLastName(e.target.value)}
                  placeholder="ישראלי" autoComplete="family-name" />
              </label>
            </div>

            <div style={fieldBox}>
              <label style={label}>תעודת זהות
                <input style={inputStyle} inputMode="numeric" maxLength={9} value={idNumber}
                  onChange={e => setIdNumber(e.target.value.replace(/\D/g, ''))} placeholder="9 ספרות" dir="ltr" />
              </label>
            </div>

            <div style={{ marginBottom: 22 }}>
              <label style={label}>תאריך לידה
                <input style={inputStyle} type="date" value={birthDate} max={new Date().toISOString().slice(0, 10)}
                  onChange={e => setBirthDate(e.target.value)} />
              </label>
            </div>

            <div style={{ marginBottom: 22 }}>
              <div style={{ ...label, marginBottom: 8 }}>אמצעי זיהוי נוסף <span style={{ color: '#9A9A95' }}>- בחרו אחד</span></div>
              <div style={{ display: 'flex', gap: 7, marginBottom: 12 }}>
                {SECONDARY_ORDER.map(t => {
                  const sel = secondaryType === t;
                  const short = t === 'parentId' ? 'ת.ז. הורה' : t === 'driverLicense' ? 'רישיון נהיגה' : 'דרכון';
                  return (
                    <div key={t} onClick={() => setSecondaryType(t)}
                      style={{ flex: 1, textAlign: 'center', cursor: 'pointer', fontSize: 12.5, fontWeight: sel ? 500 : 400,
                        padding: '8px 6px', borderRadius: 8,
                        background: sel ? ink : '#fff', color: sel ? '#fff' : '#6B6B68',
                        border: sel ? `1px solid ${ink}` : '1px solid #E3E2DD' }}>
                      {short}
                    </div>
                  );
                })}
              </div>
              <input style={inputStyle} value={secondaryValue} onChange={e => setSecondaryValue(e.target.value)}
                placeholder={ONBOARDING_SECONDARY_LABELS[secondaryType]} />
            </div>
          </>
        )}

        {step === 2 && (
          <>
            <div style={{ fontSize: 24, fontWeight: 500, color: '#111', marginBottom: 6 }}>איך נשיג אתכם?</div>
            <div style={{ fontSize: 13.5, lineHeight: 1.6, color: '#6B6B68', marginBottom: 26 }}>
              הפרטים האלה נדרשים לטופס ייפוי הכוח, ודרכם נעדכן אתכם בהתקדמות.
            </div>

            <div style={fieldBox}>
              <label style={label}>טלפון נייד
                <input style={inputStyle} type="tel" inputMode="tel" dir="ltr" value={phone}
                  onChange={e => setPhone(e.target.value)} placeholder="050-1234567" autoComplete="tel" />
              </label>
            </div>

            <div style={fieldBox}>
              <label style={label}>כתובת מייל
                <EmailInput ownAddress style={inputStyle} value={email}
                  onChange={e => setEmail(e.target.value)} placeholder="israel@example.com" />
              </label>
            </div>

            <div style={fieldBox}>
              <label style={label}>עיר מגורים
                <HebrewTextInput style={inputStyle} value={city} onChange={e => setCity(e.target.value)}
                  placeholder="תל אביב" autoComplete="address-level2" />
              </label>
            </div>

            <div style={{ marginBottom: 22 }}>
              <label style={label}>רחוב ומספר בית
                <HebrewTextInput style={inputStyle} value={address} onChange={e => setAddress(e.target.value)}
                  placeholder="הרצל 10, דירה 3" autoComplete="street-address" />
              </label>
            </div>
          </>
        )}

        {step === 3 && (
          <>
            <div style={{ fontSize: 24, fontWeight: 500, color: '#111', marginBottom: 6 }}>מצב משפחתי</div>
            <div style={{ fontSize: 13.5, lineHeight: 1.6, color: '#6B6B68', marginBottom: 14 }}>
              המצב המשפחתי קובע איך מתנהל תיק המס שלכם ברשויות.
            </div>
            {/* הרשויות עובדות מול מרשם האוכלוסין. מצב שנרשם כאן ולא תואם לת"ז
                מפיל את בקשת הייצוג, ולכן זו הבהרה ולא הצעה. */}
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 7, background: '#F7F6F3', borderRadius: 9, padding: '10px 12px', marginBottom: 22 }}>
              <span style={{ marginTop: 1 }}>{'\u{1FAAA}'}</span>
              <span style={{ fontSize: 12.5, lineHeight: 1.55, color: '#6B6B68' }}>
                <strong style={{ color: '#111' }}>לפי מה שרשום בתעודת הזהות שלכם</strong> - הרשויות בודקות מול מרשם האוכלוסין, ופרט שאינו תואם מעכב את הייצוג.
              </span>
            </div>

            <div style={{ marginBottom: 18 }}>
              <div style={{ ...label, marginBottom: 8 }} id="family-status-label">אני</div>
              <div role="radiogroup" aria-labelledby="family-status-label"
                style={{ display: 'flex', flexWrap: 'wrap', gap: 7 }}>
                {/* ‼ כפתורי בחירה אמיתיים ולא div עם onClick. הלקוח ממלא את
                    זה מהטלפון, ו-div אינו נגיש למקלדת, אינו מוכרז כבחירה,
                    ולא היה לו שטח נגיעה מספיק (38 פיקסלים). role=radio נותן
                    לקורא מסך את מה שהעין רואה. */}
                {FAMILY_ORDER.map(f => {
                  const sel = familyStatus === f;
                  return (
                    <button key={f} type="button" role="radio" aria-checked={sel}
                      onClick={() => { setFamilyStatus(f); setFamilyYear(''); }}
                      style={{ cursor: 'pointer', fontSize: 13, fontWeight: sel ? 500 : 400,
                        minHeight: 44, padding: '9px 16px', borderRadius: 8, font: 'inherit',
                        background: sel ? ink : '#fff', color: sel ? '#fff' : '#6B6B68',
                        border: sel ? `1px solid ${ink}` : '1px solid #E3E2DD' }}>
                      {FAMILY_STATUS_LABELS[f]}
                    </button>
                  );
                })}
              </div>
            </div>

            {yearLabel && (
              <div style={fieldBox}>
                <label style={label}>{yearLabel}
                  <input style={inputStyle} inputMode="numeric" maxLength={4} dir="ltr" value={familyYear}
                    onChange={e => setFamilyYear(e.target.value.replace(/\D/g, ''))} placeholder={String(CURRENT_YEAR - 5)} />
                </label>
              </div>
            )}

            {familyStatus === 'married' && (
              <div style={{ marginTop: 6, paddingTop: 16, borderTop: '1px solid #F0EFEB' }}>
                <div style={{ fontSize: 12.5, color: '#6B6B68', lineHeight: 1.6, marginBottom: 14 }}>
                  {'\u{1F491}'} ספרו לנו על בן/בת הזוג - הפרטים נדרשים לייפויי הכוח של
                  שניכם. את אופן החתימה של בן/בת הזוג תבחרו בשלב החתימה.
                </div>
                <div style={{ display: 'flex', gap: 10, marginBottom: 16 }}>
                  <label style={{ ...label, flex: 1 }}>שם פרטי של בן/בת הזוג
                    <input style={inputStyle} value={spouseFirstName} onChange={e => setSpouseFirstName(e.target.value)}
                      placeholder="ישראלה" />
                  </label>
                  <label style={{ ...label, flex: 1 }}>שם משפחה
                    <input style={inputStyle} value={spouseLastName} onChange={e => setSpouseLastName(e.target.value)}
                      placeholder="ישראלי" />
                  </label>
                </div>
                <div style={fieldBox}>
                  <label style={label}>תעודת זהות של בן/בת הזוג
                    <input style={inputStyle} inputMode="numeric" maxLength={9} dir="ltr" value={spouseIdNumber}
                      onChange={e => setSpouseIdNumber(e.target.value.replace(/\D/g, ''))} placeholder="9 ספרות" />
                  </label>
                </div>
                {/* ‼ רשות המסים שולחת לבן/בת הזוג הודעה על בקשת הייצוג, ולכן
                    היא מבקשת את הטלפון שלו/ה בנפרד משלכם. לא חובה כאן. */}
                <div style={fieldBox}>
                  <label style={label}>טלפון של בן/בת הזוג
                    <input style={inputStyle} type="tel" inputMode="tel" dir="ltr" value={spousePhone}
                      onChange={e => setSpousePhone(e.target.value)} placeholder="050-0000000" />
                  </label>
                </div>
                {/* ‼ יש לבן/בת הזוג תיק (מע"מ/ניכויים על שמו/ה, או תיק מ"ה שמתנהל
                    עליו/ה) ⇒ הגשה נפרדת בשע״ם על הת.ז. שלו/ה, וצריך את אותה ערכת
                    הזדהות: תאריך לידה מלא + רישיון/דרכון/ת.ז. הורה. אין תיק ⇒
                    מספיקה שנת לידה, לייפוי הכוח בביטוח לאומי. */}
                {spouseSub && spouseDelegated ? (
                  /* ‼ נמסר לבן/בת הזוג. השדות יורדים מהמסך לגמרי ולא רק
                     מהחובה — שדה ריק שנשאר קורא כמו משהו שעוד צריך למלא. */
                  <div style={{
                    marginBottom: 22, padding: '14px 14px 12px', borderRadius: 10,
                    border: '1px solid #CFE3D4', background: '#F5FAF6',
                  }}>
                    <div style={{ fontSize: 14, fontWeight: 600, color: '#111', marginBottom: 6 }}>
                      {'✓'} הקישור מוכן - שלחו אותו לבן/בת הזוג
                    </div>
                    <div style={{ fontSize: 12.5, color: '#6B6B68', lineHeight: 1.6, marginBottom: 10 }}>
                      אתם יכולים להמשיך ולסיים עכשיו - לא צריך לחכות להם.
                    </div>
                    <div style={{
                      fontSize: 12, direction: 'ltr', textAlign: 'left', wordBreak: 'break-all',
                      background: '#fff', border: '1px solid #E3E2DD', borderRadius: 8, padding: '8px 10px',
                      marginBottom: 10,
                    }}>{spouseLink}</div>
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                      {/* ‼ וואטסאפ ולא מייל: הלקוח באמצע טופס בטלפון, ובן/בת הזוג
                          במרחק הודעה אחת. שליחת מייל מכאן הייתה דורשת ערוץ שרת
                          נוסף — וקישור שאפשר להדביק עובד בכל ערוץ שהם משתמשים בו. */}
                      <a
                        href={`https://wa.me/?text=${encodeURIComponent(
                          `היי, אני ממלא/ת טופס ייצוג מול רשויות המס ב${info?.firmName || 'משרד רואי החשבון'} וצריך את הפרטים שלך. אפשר להשלים כאן: ${spouseLink}`,
                        )}`}
                        target="_blank" rel="noopener noreferrer"
                        style={{
                          border: 'none', borderRadius: btnRadius, padding: '9px 16px',
                          fontSize: 13.5, color: '#fff', background: '#25D366',
                          textDecoration: 'none', display: 'inline-block',
                        }}>
                        שליחה בוואטסאפ
                      </a>
                      <button type="button" onClick={async () => {
                        try {
                          await navigator.clipboard.writeText(spouseLink);
                          setSpouseLinkCopied(true);
                          setTimeout(() => setSpouseLinkCopied(false), 1800);
                        } catch { /* דפדפן חסם - הקישור גלוי לסימון ידני */ }
                      }} style={{
                        border: `1px solid ${ink}`, borderRadius: btnRadius, padding: '9px 16px',
                        fontSize: 13.5, color: ink, background: 'transparent', cursor: 'pointer',
                      }}>
                        {spouseLinkCopied ? '✓ הועתק' : 'העתקת הקישור'}
                      </button>
                    </div>
                  </div>
                ) : spouseSub ? (
                  <>
                    <div style={{ marginBottom: 22 }}>
                      <label style={label}>תאריך לידה של בן/בת הזוג
                        <input style={inputStyle} type="date" value={spouseBirthDate} max={new Date().toISOString().slice(0, 10)}
                          onChange={e => setSpouseBirthDate(e.target.value)} />
                      </label>
                    </div>
                    <div style={{ marginBottom: 22 }}>
                      <div style={{ ...label, marginBottom: 8 }}>
                        אמצעי זיהוי נוסף של בן/בת הזוג <span style={{ color: '#9A9A95' }}>- בחרו אחד</span>
                      </div>
                      <div style={{ fontSize: 12.5, color: '#6B6B68', lineHeight: 1.6, marginBottom: 10 }}>
                        יש על שמו/ה תיק ({spouseSub.authoritiesLabel}), ולכן הרישום ברשויות נעשה גם
                        על הפרטים שלו/ה.
                      </div>
                      <div style={{ display: 'flex', gap: 7, marginBottom: 12 }}>
                        {SECONDARY_ORDER.map(t => {
                          const sel = spouseSecondaryType === t;
                          const short = t === 'parentId' ? 'ת.ז. הורה' : t === 'driverLicense' ? 'רישיון נהיגה' : 'דרכון';
                          return (
                            <div key={t} onClick={() => setSpouseSecondaryType(t)}
                              style={{ flex: 1, textAlign: 'center', cursor: 'pointer', fontSize: 12.5, fontWeight: sel ? 500 : 400,
                                padding: '8px 6px', borderRadius: 8,
                                background: sel ? ink : '#fff', color: sel ? '#fff' : '#6B6B68',
                                border: sel ? `1px solid ${ink}` : '1px solid #E3E2DD' }}>
                              {short}
                            </div>
                          );
                        })}
                      </div>
                      <input style={inputStyle} dir="ltr" value={spouseSecondaryValue}
                        onChange={e => setSpouseSecondaryValue(e.target.value)}
                        placeholder={ONBOARDING_SECONDARY_LABELS[spouseSecondaryType]} />
                    </div>

                    {/* ── מוצא, ולא קיר ─────────────────────────────────────
                        ‼ אלה פרטים של אדם אחר, ולרוב פשוט לא יודעים אותם בעל
                        פה. בלי המוצא הזה הטופס נתקע בדיוק כאן. הניסוח קליל
                        בכוונה: מי שלא יודע לא צריך להרגיש שנכשל. */}
                    <div style={{
                      marginBottom: 22, padding: '14px 14px 12px', borderRadius: 10,
                      border: '1px dashed #E3E2DD', background: '#FBFBFA',
                    }}>
                      <div style={{ fontSize: 13.5, color: '#111', lineHeight: 1.6, marginBottom: 4 }}>
                        {'🤷'} אין לי מושג, בלי אשתי/בעלי אני אבוד/ה
                      </div>
                      <div style={{ fontSize: 12.5, color: '#6B6B68', lineHeight: 1.6, marginBottom: 12 }}>
                        שלחו לבן/בת הזוג קישור והם ישלימו את הפרטים בעצמם.
                        אתם ממשיכים ומסיימים - לא צריך לחכות להם.
                      </div>
                      <button type="button" disabled={spouseLinkBusy} onClick={() => void makeSpouseLink()}
                        style={{
                          border: `1px solid ${ink}`, borderRadius: btnRadius, padding: '9px 16px',
                          fontSize: 13.5, color: ink, background: 'transparent',
                          cursor: spouseLinkBusy ? 'default' : 'pointer', opacity: spouseLinkBusy ? 0.6 : 1,
                        }}>
                        {spouseLinkBusy ? 'רגע…' : 'יצירת קישור לבן/בת הזוג'}
                      </button>
                      {simNote('spouseLink')}
                    </div>
                  </>
                ) : (
                  <div style={{ marginBottom: 22 }}>
                    <label style={label}>שנת לידה של בן/בת הזוג
                      <input style={inputStyle} inputMode="numeric" maxLength={4} dir="ltr" value={spouseBirthYear}
                        onChange={e => setSpouseBirthYear(e.target.value.replace(/\D/g, ''))} placeholder={String(CURRENT_YEAR - 40)} />
                    </label>
                  </div>
                )}
              </div>
            )}
          </>
        )}

        {step === 4 && (
          <>
            <div style={{ fontSize: 24, fontWeight: 500, color: '#111', marginBottom: 6 }}>צילום התעודות</div>
            <div style={{ fontSize: 13.5, lineHeight: 1.6, color: '#6B6B68', marginBottom: 26 }}>
              הרשויות מבקשות לראות את התעודה עצמה, לא רק את המספר. צילום מהטלפון מספיק -
              רק שכל הפרטים יהיו קריאים.
            </div>

            {idRequirements.length === 0 && (
              <div style={{ fontSize: 13.5, color: '#6B6B68', marginBottom: 20 }}>
                לבקשה הזאת לא נדרש צילום תעודה. אפשר לשלוח.
              </div>
            )}

            {idRequirements.map(r => {
              const have = idDocs[r.person] ?? [];
              const busyMe = uploading === r.person;
              const deferred = !have.length && !!idDeferred[r.person];
              return (
                <div key={r.person} style={{
                  marginBottom: 14, padding: '14px 14px 12px', borderRadius: 10,
                  border: `1px solid ${have.length ? '#CFE3D4' : deferred ? '#EAD9B8' : '#E3E2DD'}`,
                  background: have.length ? '#F5FAF6' : deferred ? '#FFFBF2' : '#fff',
                }}>
                  <div style={{ fontSize: 14, fontWeight: 600, color: '#111', marginBottom: 2 }}>
                    {r.prompt}
                  </div>
                  {/* ‼ אומרים במפורש של מי — בטופס אחד מבקשים שתי תעודות */}
                  <div style={{ fontSize: 12.5, color: '#6B6B68', marginBottom: 10 }}>
                    של {r.personName}
                  </div>

                  {have.map(d => (
                    <div key={d.documentId} style={{ fontSize: 12.5, color: '#2E7D53', marginBottom: 6 }}>
                      {'✓'} {d.fileName || 'הקובץ התקבל'}
                    </div>
                  ))}

                  {deferred ? (
                    /* ‼ דחייה היא בחירה, לא שגיאה: צבע חם ולא אדום, ומשפט שאומר
                       מה קורה הלאה ואיפה — הדף האישי. ביטול בלחיצה אחת. */
                    <div style={{ fontSize: 12.5, color: '#6B5A2E', lineHeight: 1.6 }}>
                      <div style={{ fontWeight: 600, color: '#5C4A1E', marginBottom: 2 }}>
                        {'🕒'} נעלה מאוחר יותר
                      </div>
                      הצילום יופיע ברשימת המסמכים בדף האישי שלכם, ואפשר להעלות אותו משם בכל רגע - גם מהטלפון.
                      <div style={{ marginTop: 8 }}>
                        <button type="button"
                          onClick={() => setIdDeferred(prev => ({ ...prev, [r.person]: false }))}
                          style={{ border: 'none', background: 'transparent', padding: 0, cursor: 'pointer',
                            fontSize: 12.5, color: ink, textDecoration: 'underline', font: 'inherit' }}>
                          בכל זאת יש לי - לצרף עכשיו
                        </button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <label style={{
                        display: 'inline-block', cursor: busyMe ? 'default' : 'pointer',
                        border: `1px solid ${ink}`, borderRadius: btnRadius, padding: '9px 16px',
                        fontSize: 13.5, color: ink, opacity: busyMe ? 0.6 : 1,
                      }}>
                        {busyMe ? 'מעלה…' : have.length ? 'צירוף צילום נוסף' : `${'\u{1F4F7}'} צילום או קובץ`}
                        {/* capture — בטלפון נפתחת המצלמה ישירות, במחשב בוחר קובץ */}
                        <input
                          type="file"
                          accept="image/*,application/pdf"
                          capture="environment"
                          disabled={busyMe}
                          style={{ display: 'none' }}
                          onChange={e => {
                            const f = e.target.files?.[0];
                            e.target.value = '';
                            if (f) void uploadIdDoc(r, f);
                          }}
                        />
                      </label>
                      {simNote(`upload:${r.person}`)}
                      {/* ── מוצא, ולא קיר (191) ─────────────────────────────────
                          ‼ מי שאין לו את התעודה ביד לא צריך לאבד את מה שמילא.
                          הבחירה מפורשת ולכל אדם בנפרד; המשרד רואה שחסר. */}
                      {!have.length && (
                        <div style={{ marginTop: 10 }}>
                          <button type="button" disabled={busyMe}
                            onClick={() => { setError(null); setIdDeferred(prev => ({ ...prev, [r.person]: true })); }}
                            style={{ border: 'none', background: 'transparent', padding: 0, cursor: 'pointer',
                              fontSize: 12.5, color: '#6B6B68', textDecoration: 'underline', font: 'inherit' }}>
                            אין לי את המסמך זמין כרגע - אעלה אותו מאוחר יותר
                          </button>
                        </div>
                      )}
                    </>
                  )}
                </div>
              );
            })}

            {idBlocking.length > 0 && idRequirements.length > 1 && (
              <div style={{ fontSize: 12.5, color: '#6B6B68', marginTop: 4, marginBottom: 18 }}>
                נשאר לצרף: {idBlocking.map(m => m.personName).join(', ')}
              </div>
            )}
          </>
        )}

        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 7, background: '#F7F6F3', borderRadius: 9, padding: '10px 12px', marginBottom: 22 }}>
          <span style={{ color: accent, marginTop: 1 }}>{'\u{1F6E1}'}</span>
          <span style={{ fontSize: 11.5, lineHeight: 1.5, color: '#6B6B68' }}>
            הפרטים מוצפנים ומשמשים אך ורק להקמת הייצוג מול רשויות המס. לא יועברו לאף גורם אחר.
            {' '}כל שלב נשמר בלחיצה על «המשך» - אפשר לסגור ולחזור לקישור הזה בכל זמן.
          </span>
        </div>

        {error && (
          <div style={{ marginBottom: 16, padding: '10px 12px', background: '#FCEBEB', color: '#A32D2D', borderRadius: 9, fontSize: 12.5 }}>{error}</div>
        )}
        {simKey === 'nav' && <div style={{ marginBottom: 16 }}><SampleSimulatedNote style={{ marginTop: 0 }} /></div>}

        <div style={{ display: 'flex', gap: 10 }}>
          {step > 1 && (
            <button type="button" onClick={() => { setError(null); setSimKey(null); setStep(step - 1); }} disabled={busy}
              style={{ flex: '0 0 auto', background: 'transparent', color: ink, border: `1px solid #E3E2DD`,
                borderRadius: btnRadius, padding: '13px 18px', fontSize: 14.5, cursor: busy ? 'default' : 'pointer' }}>
              חזרה
            </button>
          )}
          <button type="button" onClick={handleNext} disabled={busy}
            style={{ flex: 1, ...ctaStyle, borderRadius: btnRadius, padding: 13, fontSize: 14.5, fontWeight: 600, cursor: busy ? 'default' : 'pointer', opacity: busy ? 0.7 : 1 }}>
            {busy ? (step >= lastStep ? 'שולח…' : 'שומר…') : step >= lastStep ? 'שליחת הפרטים' : 'המשך'}
          </button>
        </div>

        <div style={{ textAlign: 'center', marginTop: 22, paddingTop: 16, borderTop: '1px solid #F0EFEB', fontSize: 11, color: '#9A9A95' }}>
          {info?.firmName}
        </div>
      </div>
    </div>
  );
}

// ─── "+ בקשה" — הוספת בקשה למסע של הלקוח ────────────────────────────────────
// עד היום אפשר היה רק להדליק ולכבות את מה שהמרכיב בשרת יצר. כאן מוסיפים:
// בקשה מהקטלוג, או בקשה חופשית שהרו"ח מרכיב בעצמו.
//
// ‼ בקשה שנוצרת אחרי שהתהליך כבר נפתח ללקוח נולדת כטיוטה — היא מופיעה אצל
// הרו"ח ולא אצל הלקוח, עד שהוא לוחץ "שלח ללקוח". בלי זה כל תיקון קטן בניסוח
// היה קופץ מיד למסך של הלקוח.

import { useEffect, useMemo, useState } from 'react';
import type { CustomRequirement, CustomRequirementKind, InstitutionKey, OnboardingStep } from '../../types/onboarding';
import {
  DEBIT_INSTITUTION_ORDER, INSTITUTION_DEBIT_CODES, INSTITUTION_NAMES,
  REQUIREMENT_KIND_LABELS, STEP_TYPE_LABELS, paperlessTaxAuthorityPayload,
} from '../../types/onboarding';
import { BANK_DEBIT_TITLE, buildBankDebitPayload } from '../../lib/bankDebitRequest';
import type { ClientDocument } from '../../lib/clientGuide';
import { buildDocumentRequestPayload, documentLibrary } from '../../lib/clientGuide';
import {
  BUILT_IN_DOC_OPTIONS, allDocOptions, withDocOption, withoutDocOption,
} from '../../lib/documentRequestOptions';
import type { RequestTemplate } from '../../lib/requestTemplates';
import { firstEntry, loadRequestTemplates, templateBySeed } from '../../lib/requestTemplates';
import { createPrevAccountantTrack, missingPrevAccountantSteps } from '../../lib/prevAccountantTrack';
import { supabase } from '../../lib/supabase';

/** מה אפשר להוסיף ידנית. שלב הייצוג אינו כאן — הוא מסונכרן מבקשת הייצוג.
 *  'paperless_sequence', 'prev_accountant_track' ו-'bank_debit' אינם סוגי
 *  בקשה במסד — הם תבניות: הראשונה יוצרת את רצף הפייפרלס (PAPERLESS_SEQUENCE),
 *  השנייה את שלושת שלבי «חומרים מרו״ח קודם» (createPrevAccountantTrack),
 *  והשלישית בקשה חופשית אחת עם דרישת אסמכתה לכל רשות (buildBankDebitPayload). */
/* ‼ שלושה פריטים ירדו מכאן ב-2026-08: «קבלת חומרים מהרו״ח הקודם»,
   «פתיחת תיקים ברשויות» ו«הכרת הלקוח». כולם נוצרו ריקים ואז נעלמו מהמסך
   (AUTO_OFFICE_TYPES מסנן אותם), כלומר לחיצה לא הביאה שום דבר שאפשר לראות.
   ‼ היכולות עצמן לא נמחקו: המחולל האוטומטי ממשיך ליצור אותם עם התוכן המלא.
   ‼ «חומרים מרו״ח קודם» (2026-08-20) החליף את «פרטי הרו״ח הקודם» שישב כאן
   וייצר רק את השאלה ללקוח — בלי מכתב ובלי מעקב חומרים, כך שהיה צריך לזכור
   לחזור ולפתוח את ההמשך. עכשיו לחיצה אחת מביאה את הבקשה כולה, בדיוק כמו
   שהכפתור בדף המסע עושה. ‼ הזמינות אינה תלויה ב-hasPreviousAccountant:
   גיא מסמן "אין רו״ח קודם" ואחר כך מגלה שיש, וזו בקשה ככל בקשה. */
const CATALOG: { type: string; hint: string; once: boolean }[] = [
  { type: 'bank_debit',             hint: 'הלקוח פותח הרשאה בבנק ומעלה אסמכתה - לרשויות שתבחר', once: false },
  { type: 'send_document',          hint: 'מסמך מספריית המשרד - נסגרת כשהלקוח פותח אותו', once: false },
  { type: 'client_documents',       hint: 'רשימת מסמכים שהלקוח מעלה בדף האישי', once: true },
  { type: 'prev_accountant_track',  hint: '', once: true },
  { type: 'paperless_sequence',     hint: '', once: true },
  { type: 'paperless_tax_authority',
    hint: 'לעוסק מורשה - הלקוח מחבר את פייפרלס לרשות המסים, ומשם החשבוניות מקבלות מספר הקצאה', once: true },
  { type: 'intake_questionnaire',   hint: 'רענון תיק המס - שאלון ומסמכים לפי מה שחסר', once: true },
];
/* ‼ «אישור המייצג באזור האישי» ירד מכאן (הכרעת גיא, 2026-08-25). הוא אינו
   בקשה שמוסיפים אלא צעד בתוך ביצוע הייצוג: נוצר לבד כשהייצוג מוגש לשע"ם
   ונסגר לבד כשהוא מסומן כפעיל, ומנוהל בבלוק "מס הכנסה" שבמרכז הביצוע.
   פריט קטלוג היה מאפשר להוסיף אותו ללקוח שאין לו ייצוג בדרך לרשויות —
   כלומר לשלוח אותו לאשר משהו שאינו קיים. */

/** רצף הפייפרלס — תבנית מוכרת, לא תצורה. שלושה שלבים, ובעלות שונה לכל אחד:
 *
 *   1. הרשמה לפייפרלס   — הלקוח. הוא נרשם ומאשר בעצמו בדף האישי.
 *   2. חיבור לפייפרלס    — המשרד. נכנסים לחשבון ומשלימים את ההגדרה (שם
 *      פייפרלס מבקשת את פרטי האשראי) — ולכן זו פעולה שלנו, לא שלו.
 *   3. הרשאה לתשלום חודשי — נפתחת אחרי (2).
 *
 * ‼ הבעלות היא מה שקובע מי רואה כפתור: הלקוח מקבל פעולה רק על (1), ורואה
 * את (2) כ"בטיפול המשרד" בלי שום פקד. הכדור והניסוחים זהים למה שהמנוע
 * בשרת יוצר מהצעת מחיר, כדי שרצף ידני ורצף מהצעה יתנהגו אותו דבר. */
const PAPERLESS_SEQUENCE: {
  type: OnboardingStep['stepType'];
  owner: 'client' | 'me';
  payload: Record<string, unknown>;
}[] = [
  { type: 'paperless_invite', owner: 'client',
    payload: {
      paperlessStatus: 'unknown', dataSource: 'unknown',
      clientTitle: 'הרשמה לפייפרלס',
      clientSub: 'שתי דקות, ומשם רק מצלמים קבלות מהטלפון',
      clientCta: 'נרשמתי לפייפרלס',
    } },
  { type: 'paperless_connection', owner: 'me',
    payload: {
      clientTitle: 'חיבור לפייפרלס',
      clientSub: 'בימים הקרובים ניכנס לחשבון ונשלים את החיבור. אין צורך לעשות דבר כרגע.',
    } },
  { type: 'retainer_authorization', owner: 'me',
    payload: {
      clientTitle: 'להזין אמצעי תשלום',
      clientSub: 'הסכום שסוכם בהצעה, כהרשאה קבועה',
      clientCta: 'להזנה',
    } },
];

const KINDS: CustomRequirementKind[] = ['confirm', 'text', 'file'];

/** טקסט הכפתור אצל הלקוח, כשלא נכתב אחר. סוג הדרישה כבר אומר מה עושים. */
const CTA_BY_KIND: Partial<Record<CustomRequirementKind, string>> & { [k: string]: string } = {
  confirm: 'לאישור',
  text: 'למענה',
  file: 'להעלאה',
};

interface Props {
  clientId: string;
  steps: OnboardingStep[];
  /** לפני פרסום התהליך אין מושג "טיוטה" — הכל ממילא עוד לא נחשף. */
  processPublished: boolean;
  /**
   * סוג בקשה מסומן מראש — לנקודת כניסה הקשרית (למשל "עדכון סטטוס מס"
   * מתוך תיק מס). ‼ זו אינה זרימה שנייה: אותו חלון, אותו state, ואותה
   * קריאת create_onboarding_request. ההבדל היחיד הוא שמדלגים על הקטלוג.
   */
  presetType?: OnboardingStep['stepType'];
  /** האימייל שעל הכרטיס — קובע אם השאלה ב«חומרים מרו״ח קודם» היא מילוי או אישור. */
  prevAccountantEmail?: string | null;
  /** בחירת תבנית — נמסרת החוצה כדי שהקומפוזר ייפתח במקום שבו הבקשות חיות. */
  onUseTemplate?: (t: RequestTemplate) => void;
  onClose: () => void;
  onCreated: () => void;
}

export default function AddRequestDialog({ clientId, steps, processPublished, presetType, prevAccountantEmail, onUseTemplate, onClose, onCreated }: Props) {
  const [mode, setMode] = useState<'catalog' | 'custom' | 'documents' | 'bank' | 'document'>('catalog');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /** בקשה חופשית — שני השדות שמספיקים לרוב המוחלט של הבקשות.
   *  ‼ `ask` הוא מקור אחד לשלושה מקומות (שם אצלי, כותרת אצל הלקוח, תיאור
   *  הדרישה): הקלדת אותו טקסט שלוש פעמים היא בדיוק מה שהיה מסורבל כאן. */
  const [ask, setAsk] = useState('');
  const [askKind, setAskKind] = useState<CustomRequirementKind>('file');
  const [advanced, setAdvanced] = useState(false);
  const [clientTitle, setClientTitle] = useState('');
  const [clientSub, setClientSub] = useState('');
  /** ריק ⇒ נגזר מסוג הדרישה. מה שהוקלד כאן ידנית גובר. */
  const [clientCta, setClientCta] = useState('');
  /** האם הבקשה חוסמת סגירת קליטה. ברירת מחדל: כן — בקשה שביקשתי היא עבודה. */
  const [requiredForClose, setRequiredForClose] = useState(true);
  /** דרישות **נוספות** מעבר לראשונה. הראשונה חיה ב-ask/askKind. */
  const [extraReqs, setExtraReqs] = useState<{ kind: CustomRequirementKind; label: string }[]>([]);
  // מסמכים מהלקוח
  const [docOptions, setDocOptions] = useState<string[]>(BUILT_IN_DOC_OPTIONS);
  const [selectedDocs, setSelectedDocs] = useState<string[]>([]);
  const [newDocLabel, setNewDocLabel] = useState('');
  const [savingOption, setSavingOption] = useState(false);
  const [profileId, setProfileId] = useState<string | null>(null);
  /** הרשאה לחיוב חשבון — ‼ מתחיל ריק בכוונה. לא כל לקוח צריך את שלוש
   *  הרשויות, ובחירה מראש הייתה שולחת אותו לפתוח הרשאות מיותרות. */
  const [debitAuthorities, setDebitAuthorities] = useState<InstitutionKey[]>([]);
  /** ספריית המסמכים של המשרד. undefined = עוד לא נטענה. */
  const [library, setLibrary] = useState<ClientDocument[] | undefined>(undefined);
  const [docId, setDocId] = useState<string>('');

  // ‼ נטענת מיד עם פתיחת החלון, ולא רק כשנכנסים למסך המסמך: הקטלוג צריך
  // לדעת מראש אם יש מה לשלוח, כדי להשבית את הפריט במקום לגלות בסוף.
  useEffect(() => {
    let alive = true;
    void (async () => {
      const [{ data: prof }, tpls] = await Promise.all([
        supabase.from('profiles').select('id,settings').limit(1).maybeSingle(),
        loadRequestTemplates(),
      ]);
      if (!alive) return;
      const settings = (prof?.settings ?? {}) as Record<string, unknown>;
      const lib = documentLibrary({ settings });
      setLibrary(lib);
      setDocId(lib[0]?.id ?? '');
      setTemplates(tpls);
      setProfileId((prof?.id as string | undefined) ?? null);
      setDocOptions(allDocOptions(settings));
    })();
    return () => { alive = false; };
  }, []);

  const [templates, setTemplates] = useState<RequestTemplate[]>([]);

  function openDocumentMode() {
    setMode('document');
    setError(null);
    // שליחת מסמך אינה עבודה שחוסמת סגירת קליטה — היא חומר עזר.
    setRequiredForClose(false);
  }

  /** תוכן ברירת המחדל של סוג בקשה, מהתבנית המובנית. ריק ⇒ {} כמו קודם. */
  function seedPayload(seedKey: string): Record<string, unknown> {
    const entry = firstEntry(templateBySeed(templates, seedKey) ?? ({} as RequestTemplate));
    return entry?.payload ?? {};
  }

  /**
   * הרשימה היא התפריט (מובנים + מה שהמשרד הוסיף), והתבנית קובעת מה **מסומן**
   * כשנפתחים. מסמך שיושב בתבנית ולא בתפריט מצטרף לתצוגה כאן, אחרת בקשה
   * שנשמרה כתבנית הייתה נפתחת בלי חלק מהפריטים שלה.
   */
  function openDocumentsMode() {
    setMode('documents');
    setError(null);
    const entry = firstEntry(templateBySeed(templates, 'client_documents') ?? ({} as RequestTemplate));
    const seeded = ((entry?.payload?.checklist as { label?: string }[] | undefined) ?? [])
      .map(i => (i.label ?? '').trim()).filter(Boolean);
    if (seeded.length) {
      setDocOptions(list => [...list, ...seeded.filter(l => !list.includes(l))]);
      setSelectedDocs(seeded);
    }
  }

  const toggleDoc = (label: string) => setSelectedDocs(list =>
    list.includes(label) ? list.filter(l => l !== label) : [...list, label]);

  /**
   * מסמך חדש נכנס לבקשה הנוכחית **וגם** נשמר לתפריט של המשרד.
   * ‼ קוראים את ההגדרות מחדש רגע לפני הכתיבה: מסך המשרד עורך draft של אותה
   * עמודה, וכתיבה עיוורת של מה שנטען בפתיחת החלון הייתה דורסת אותו.
   */
  async function addDocOption() {
    const label = newDocLabel.trim().replace(/\s+/g, ' ');
    if (!label) return;
    setNewDocLabel('');
    if (!docOptions.includes(label)) setDocOptions(list => [...list, label]);
    if (!selectedDocs.includes(label)) setSelectedDocs(list => [...list, label]);
    if (!profileId) return;
    setSavingOption(true);
    const { data: fresh } = await supabase
      .from('profiles').select('settings').eq('id', profileId).maybeSingle();
    await supabase.from('profiles')
      .update({ settings: withDocOption((fresh?.settings ?? {}) as Record<string, unknown>, label) })
      .eq('id', profileId);
    setSavingOption(false);
  }

  async function removeDocOption(label: string) {
    setDocOptions(list => list.filter(l => l !== label));
    setSelectedDocs(list => list.filter(l => l !== label));
    if (!profileId) return;
    const { data: fresh } = await supabase
      .from('profiles').select('settings').eq('id', profileId).maybeSingle();
    await supabase.from('profiles')
      .update({ settings: withoutDocOption((fresh?.settings ?? {}) as Record<string, unknown>, label) })
      .eq('id', profileId);
  }

  const [dueDate, setDueDate] = useState('');
  const [dependsOn, setDependsOn] = useState('');
  const [sendNow, setSendNow] = useState(!processPublished);

  const existing = useMemo(
    () => new Set(steps.filter(s => s.status !== 'cancelled').map(s => s.stepType)),
    [steps],
  );
  const paperlessMissing = PAPERLESS_SEQUENCE.filter(p => !existing.has(p.type));
  const prevMissing = missingPrevAccountantSteps(steps);
  const available = CATALOG.filter(c => c.type === 'paperless_sequence'
    ? paperlessMissing.length > 0
    : c.type === 'prev_accountant_track'
    ? prevMissing.length > 0
    : !(c.once && existing.has(c.type as OnboardingStep['stepType'])));
  const dependencyOptions = steps.filter(s => s.status !== 'cancelled');
  /** ‼ המובנות אינן מוצגות כשורות: הן כבר ברירת המחדל של פריטי הקטלוג
   *  שמעליהן, והצגתן פעמיים הייתה כפילות. */
  const savedTemplates = templates.filter(t => t.officeId !== null && !!onUseTemplate);

  async function rpcCreate(
    stepType: string,
    payload: Record<string, unknown>,
    depends: string | null,
    owner?: string,
    requiredOverride?: boolean,
  ): Promise<{ id: string } | { error: string }> {
    const { data, error: rpcError } = await supabase.rpc('create_onboarding_request', {
      p_client_id: clientId,
      p_step_type: stepType,
      p_payload: payload,
      p_due_date: dueDate || null,
      p_depends_on: depends,
      p_published: processPublished ? sendNow : true,
      p_required_for_close: requiredOverride ?? requiredForClose,
      ...(owner ? { p_owner: owner } : {}),
    });
    const res = data as { ok?: boolean; error?: string; stepId?: string } | null;
    if (rpcError || !res?.ok) {
      return { error: ERRORS[res?.error ?? ''] ?? friendly(rpcError?.message) };
    }
    return { id: res.stepId ?? '' };
  }

  async function create(stepType: string, payload: Record<string, unknown>) {
    setBusy(true);
    setError(null);
    const res = await rpcCreate(stepType, payload, dependsOn || null);
    setBusy(false);
    if ('error' in res) { setError(res.error); return; }
    onCreated();
    onClose();
  }

  /** «חומרים מרו״ח קודם» — שלושת השלבים בלחיצה אחת, כמו הכפתור בדף המסע.
   *  היצירה עצמה משותפת (lib/prevAccountantTrack) ומשלימה חסרים בלבד. */
  async function createPrevTrack() {
    setBusy(true);
    setError(null);
    const res = await createPrevAccountantTrack({
      clientId, steps, prevAccountantEmail, published: processPublished ? sendNow : true,
    });
    setBusy(false);
    if (!res.ok) { setError(res.error); return; }
    onCreated();
    onClose();
  }

  /** התבנית יוצרת את הרצף שלם: מה שכבר קיים אצל הלקוח לא נוצר שוב, אלא
   *  משמש עוגן לתלות של השלב הבא — ולכן לחיצה חוזרת רק משלימה חסרים. */
  async function createPaperlessSequence() {
    setBusy(true);
    setError(null);
    const byType = new Map(
      steps.filter(s => s.status !== 'cancelled').map(s => [s.stepType, s.id]));
    let prevId: string | null = null;
    for (const part of PAPERLESS_SEQUENCE) {
      const existingId = byType.get(part.type);
      if (existingId) { prevId = existingId; continue; }
      const res: { id: string } | { error: string } =
        await rpcCreate(part.type, part.payload, prevId, part.owner);
      if ('error' in res) { setBusy(false); setError(res.error); return; }
      prevId = res.id;
    }
    setBusy(false);
    onCreated();
    onClose();
  }

  /** חיבור פייפרלס לרשות המסים — פעולה של הלקוח, אחרי שהחיבור הבסיסי נסגר.
   *  ‼ התלות נקבעת כאן ולא נבחרת: בלי שם עסק ומשיכת עוסקים בחשבון אין מה
   *  לחבר, ובקשה שנפתחת מוקדם מדי הייתה שולחת את הלקוח למסך שלא מוכן לו.
   *  כשאין שלב חיבור (לקוח שכבר מחובר לפייפרלס) היא נפתחת מיד. */
  async function createTaxAuthority() {
    setBusy(true);
    setError(null);
    const connection = steps.find(
      s => s.stepType === 'paperless_connection' && s.status !== 'cancelled');
    const res = await rpcCreate(
      'paperless_tax_authority', paperlessTaxAuthorityPayload(),
      dependsOn || connection?.id || null, 'client');
    setBusy(false);
    if ('error' in res) { setError(res.error); return; }
    onCreated();
    onClose();
  }

  function submitCustom() {
    const main = ask.trim();
    if (!main) { setError('צריך לכתוב מה מבקשים מהלקוח.'); return; }
    if (extraReqs.some(r => !r.label.trim())) {
      setError('לכל דרישה צריך תיאור - מה בדיוק הלקוח צריך לעשות.');
      return;
    }
    const requirements: CustomRequirement[] = [
      { key: 'r1', kind: askKind, label: main, done: false },
      ...extraReqs.map((r, i) => ({
        key: `r${i + 2}`, kind: r.kind, label: r.label.trim(), done: false,
      })),
    ];
    void create('custom_request', {
      title: main,
      clientTitle: clientTitle.trim() || main,
      clientSub: clientSub.trim() || undefined,
      clientCta: clientCta.trim() || CTA_BY_KIND[askKind],
      requirements,
    });
  }

  function submitBankDebit() {
    if (debitAuthorities.length === 0) {
      setError('צריך לבחור לפחות רשות אחת - אחרת אין ללקוח מה להקים.');
      return;
    }
    const ordered = DEBIT_INSTITUTION_ORDER.filter(k => debitAuthorities.includes(k));
    void create('custom_request', buildBankDebitPayload(ordered) as Record<string, unknown>);
  }

  function submitDocuments() {
    const items = docOptions.filter(l => selectedDocs.includes(l));
    if (items.length === 0) { setError('צריך לפחות מסמך אחד ברשימה.'); return; }
    void create('client_documents', {
      checklist: items.map((label, i) => ({ key: `d${i + 1}`, label, done: false })),
      clientTitle: `להעלות ${items.length} מסמכים`,
      clientSub: items.join(' · '),
      clientCta: 'להעלאה',
    });
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" style={{ maxWidth: 560 }} onClick={e => e.stopPropagation()}>
        <div className="modal-head">
          <h3 style={{ margin: 0, fontSize: 'var(--fs-16)' }}>
            {presetType ? STEP_TYPE_LABELS[presetType]
              : mode === 'catalog' ? 'הוספת בקשה'
              : mode === 'custom' ? 'בקשה חופשית'
              : mode === 'bank' ? BANK_DEBIT_TITLE
              : mode === 'document' ? 'שליחת מסמך ללקוח'
              : 'מסמכים מהלקוח'}
          </h3>
          <button type="button" className="btn btn-sm btn-ghost" onClick={onClose} aria-label="סגירה">✕</button>
        </div>

        <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '.7rem' }}>
          {error && (
            <div style={{
              padding: '.5rem .7rem', borderRadius: 'var(--radius)',
              background: 'var(--red-light)', color: 'var(--err)', fontSize: 'var(--fs-13)',
            }}>⚠ {error}</div>
          )}

          {/* ‼ נקודת כניסה הקשרית (תיק מס). אותה בקשה, אותו RPC — רק בלי
              לבחור מהקטלוג. אם כבר קיימת בקשה פתוחה מהסוג הזה לא יוצרים
              שנייה: הכפילות היא בדיוק מה שהמודל המאוחד בא למנוע. */}
          {presetType && (
            existing.has(presetType) ? (
              <div className="cw-empty">
                כבר קיימת בקשת {STEP_TYPE_LABELS[presetType]} פתוחה ללקוח. אפשר לנהל אותה מלשונית «בקשות».
              </div>
            ) : (
              <div style={{ fontSize: 'var(--fs-13)', color: 'var(--ink-3)' }}>
                הבקשה תיווצר במודל הבקשות המאוחד ותופיע ללקוח בדף האישי - כמו כל בקשה אחרת.
              </div>
            )
          )}

          {mode === 'catalog' && !presetType && (
            <>
              {available.length === 0 && (
                <div className="cw-empty">כל הבקשות מהקטלוג כבר קיימות אצל הלקוח.</div>
              )}
              {available.map(c => (
                <button
                  key={c.type}
                  type="button"
                  disabled={busy}
                  onClick={() => {
                    if (c.type === 'client_documents') { openDocumentsMode(); return; }
                    if (c.type === 'bank_debit') { setMode('bank'); return; }
                    if (c.type === 'send_document') { openDocumentMode(); return; }
                    if (c.type === 'paperless_sequence') { void createPaperlessSequence(); return; }
                    if (c.type === 'paperless_tax_authority') { void createTaxAuthority(); return; }
                    if (c.type === 'prev_accountant_track') { void createPrevTrack(); return; }
                    /* ‼ תוכן ברירת המחדל מגיע מתבנית מובנית ולא מ-{} ריק.
                       בקשה שנוצרה ריקה הגיעה ללקוח בלי ניסוח ובלי רשימה. */
                    void create(c.type, seedPayload(c.type));
                  }}
                  style={rowBtn}
                >
                  <span style={{ fontWeight: 600 }}>
                    {c.type === 'paperless_sequence' ? 'פייפרלס'
                      : c.type === 'prev_accountant_track' ? 'חומרים מרו״ח קודם'
                      : c.type === 'bank_debit' ? BANK_DEBIT_TITLE
                      : c.type === 'send_document' ? 'שליחת מסמך ללקוח'
                      : STEP_TYPE_LABELS[c.type as OnboardingStep['stepType']]}
                  </span>
                  <span style={{ fontSize: 'var(--fs-12)', color: 'var(--ink-3)' }}>
                    {c.type === 'paperless_sequence'
                      ? (paperlessMissing.length === PAPERLESS_SEQUENCE.length
                        ? 'הזמנה, חיבור והרשאה לתשלום חודשי - כל שלב נפתח אחרי הקודם'
                        : `משלים את הרצף: ${paperlessMissing.map(p => STEP_TYPE_LABELS[p.type]).join(' · ')}`)
                      : c.type === 'prev_accountant_track'
                      ? (prevMissing.length === 3
                        ? 'הלקוח מוסר מי הקודם, אנחנו שולחים מכתב ועוקבים אחרי החומרים'
                        : `משלים את החסר: ${prevMissing.map(t => STEP_TYPE_LABELS[t as OnboardingStep['stepType']]).join(' · ')}`)
                      : c.hint}
                  </span>
                </button>
              ))}

              <button type="button" disabled={busy} onClick={() => setMode('custom')} style={rowBtn}>
                <span style={{ fontWeight: 600 }}>בקשה חופשית</span>
                <span style={{ fontSize: 'var(--fs-12)', color: 'var(--ink-3)' }}>
                  אתה מגדיר מה הלקוח צריך לעשות - לאשר, לענות, או להעלות
                </span>
              </button>

              {/* ── תבניות שמורות ────────────────────────────────────────
                  ‼ בחירה בתבנית פותחת עותק לעריכה, לא יוצרת בקשה מיד:
                  התבנית היא נקודת התחלה, ומה שנשלח ללקוח הוא מה שערכת. */}
              {savedTemplates.length > 0 && (
                <>
                  <div style={{
                    fontSize: 'var(--fs-12)', color: 'var(--ink-4)',
                    marginTop: '.3rem', paddingTop: '.5rem', borderTop: '1px solid var(--hairline-2)',
                  }}>תבניות של המשרד</div>
                  {savedTemplates.map(t => (
                    <button key={t.id} type="button" disabled={busy} style={rowBtn}
                      onClick={() => onUseTemplate?.(t)}>
                      <span style={{ fontWeight: 600 }}>{t.name}</span>
                      <span style={{ fontSize: 'var(--fs-12)', color: 'var(--ink-3)' }}>
                        {t.description || 'תבנית שמורה - נפתחת לעריכה לפני היצירה'}
                      </span>
                    </button>
                  ))}
                </>
              )}
            </>
          )}

          {mode === 'bank' && (
            <>
              <div style={{ fontSize: 'var(--fs-13)', color: 'var(--ink-3)', lineHeight: 1.6 }}>
                הלקוח יראה בדף האישי הסבר איך פותחים הרשאה באפליקציית הבנק, את קודי
                המוסד של הרשויות שתבחר, ומקום להעלות אסמכתה לכל אחת.
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '.35rem' }}>
                <div style={{ fontSize: 'var(--fs-13)', fontWeight: 600 }}>לאילו רשויות</div>
                {DEBIT_INSTITUTION_ORDER.map(k => (
                  <label key={k} style={{
                    display: 'flex', gap: '.45rem', alignItems: 'center', fontSize: 'var(--fs-13)',
                  }}>
                    <input type="checkbox" checked={debitAuthorities.includes(k)}
                      onChange={e => setDebitAuthorities(list => e.target.checked
                        ? [...list, k]
                        : list.filter(x => x !== k))} />
                    {INSTITUTION_NAMES[k]}
                    <span style={{ color: 'var(--ink-4)', fontSize: 'var(--fs-12)', direction: 'ltr' }}>
                      {INSTITUTION_DEBIT_CODES[k]}
                    </span>
                  </label>
                ))}
              </div>
              <Shared {...{ dueDate, setDueDate, dependsOn, setDependsOn, dependencyOptions, processPublished, sendNow, setSendNow, requiredForClose, setRequiredForClose }} />
            </>
          )}

          {mode === 'document' && (
            <>
              {library === undefined ? (
                <div className="cw-empty">טוען…</div>
              ) : library.length === 0 ? (
                <div className="cw-empty">
                  ספריית המסמכים ריקה. מוסיפים מסמכים במסך המשרד ← «מסמכים ללקוחות», ואז חוזרים לכאן.
                </div>
              ) : (
                <>
                  <div style={{ fontSize: 'var(--fs-13)', color: 'var(--ink-3)', lineHeight: 1.6 }}>
                    הלקוח יראה בקשה עם כפתור אחד שפותח את המסמך. אין מה למלא ואין מה לאשר -
                    הפתיחה עצמה סוגרת את הבקשה, והיא תסומן כאן כהושלמה.
                  </div>
                  <label style={lbl}>
                    איזה מסמך לשלוח
                    <select className="input" value={docId} onChange={e => setDocId(e.target.value)}>
                      {library.map(d => <option key={d.id} value={d.id}>{d.label}</option>)}
                    </select>
                  </label>
                  {library.find(d => d.id === docId) && (
                    <a href={library.find(d => d.id === docId)!.url} target="_blank" rel="noopener noreferrer"
                      style={{ fontSize: 'var(--fs-12)', color: 'var(--accent)' }}>
                      לצפייה בקובץ שיישלח ←
                    </a>
                  )}
                  <Shared {...{ dueDate, setDueDate, dependsOn, setDependsOn, dependencyOptions, processPublished, sendNow, setSendNow, requiredForClose, setRequiredForClose }} />
                </>
              )}
            </>
          )}

          {mode === 'documents' && (
            <>
              <div style={{ fontSize: 'var(--fs-13)', fontWeight: 600 }}>
                אילו מסמכים לבקש
                <span style={{ fontWeight: 400, color: 'var(--ink-4)', fontSize: 'var(--fs-12)' }}>
                  {' '}- לכל מסומן הלקוח יקבל מקום נפרד להעלות
                </span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '.3rem' }}>
                {docOptions.map(label => (
                  <div key={label} style={{ display: 'flex', alignItems: 'center', gap: '.35rem' }}>
                    <label style={{
                      display: 'flex', gap: '.45rem', alignItems: 'center',
                      fontSize: 'var(--fs-13)', flex: 1, cursor: 'pointer',
                    }}>
                      <input type="checkbox" checked={selectedDocs.includes(label)}
                        onChange={() => toggleDoc(label)} />
                      {label}
                    </label>
                    {!BUILT_IN_DOC_OPTIONS.includes(label) && (
                      <button type="button" className="btn btn-sm btn-ghost"
                        aria-label={`הסרת ${label} מהרשימה`} title="הסרה מהרשימה הקבועה"
                        onClick={() => { void removeDocOption(label); }}>✕</button>
                    )}
                  </div>
                ))}
              </div>
              {/* ‼ מה שנוסף כאן נשמר לרשימה של המשרד ויופיע בכל בקשה הבאה —
                  אחרת אותו מסמך היה מוקלד מחדש בכל פעם. */}
              <div style={{ display: 'flex', gap: '.35rem', alignItems: 'center' }}>
                <input className="input" style={{ flex: 1 }} value={newDocLabel}
                  placeholder="מסמך אחר - למשל: טופס 106"
                  onChange={e => setNewDocLabel(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter') { e.preventDefault(); void addDocOption(); }
                  }} />
                <button type="button" className="btn btn-sm btn-secondary"
                  disabled={!newDocLabel.trim() || savingOption}
                  onClick={() => { void addDocOption(); }}>
                  {savingOption ? 'שומר…' : 'הוספה'}
                </button>
              </div>
              <Shared {...{ dueDate, setDueDate, dependsOn, setDependsOn, dependencyOptions, processPublished, sendNow, setSendNow, requiredForClose, setRequiredForClose }} />
            </>
          )}

          {mode === 'custom' && (
            <>
              <label style={lbl}>
                מה מבקשים
                <input className="input" value={ask} onChange={e => setAsk(e.target.value)}
                  placeholder="למשל: תצלום תעודת זהות" autoFocus />
              </label>
              <label style={lbl}>
                מה הלקוח עושה
                <select className="input" value={askKind}
                  onChange={e => setAskKind(e.target.value as CustomRequirementKind)}>
                  {KINDS.map(k => <option key={k} value={k}>{REQUIREMENT_KIND_LABELS[k]}</option>)}
                </select>
              </label>

              {/* ‼ הניסוחים הנוספים מוסתרים בכוונה: הם דרשו להקליד את אותו
                  טקסט שלוש פעמים כדי לבקש דבר אחד. מי שצריך — פותח. */}
              {!advanced ? (
                <button type="button" className="ui-linkbtn"
                  style={{ alignSelf: 'flex-start', fontSize: 'var(--fs-12)', color: 'var(--accent)' }}
                  onClick={() => setAdvanced(true)}>
                  ניסוח מתקדם ←
                </button>
              ) : (
                <div style={{
                  borderInlineStart: '3px solid var(--hairline-2)', paddingInlineStart: '.6rem',
                  display: 'flex', flexDirection: 'column', gap: '.5rem',
                }}>
                  <div style={{ fontSize: 'var(--fs-12)', color: 'var(--ink-3)' }}>מה הלקוח רואה בדף האישי</div>
                  <label style={lbl}>
                    כותרת
                    <input className="input" value={clientTitle} onChange={e => setClientTitle(e.target.value)}
                      placeholder={ask.trim() || 'ריק ⇒ אותו טקסט כמו למעלה'} />
                  </label>
                  <label style={lbl}>
                    משפט הסבר
                    <input className="input" value={clientSub} onChange={e => setClientSub(e.target.value)} />
                  </label>
                  <label style={lbl}>
                    טקסט הכפתור
                    <input className="input" value={clientCta} onChange={e => setClientCta(e.target.value)}
                      placeholder={CTA_BY_KIND[askKind]} />
                  </label>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '.35rem' }}>
                    <div style={{ fontSize: 'var(--fs-13)', fontWeight: 600 }}>עוד דרישות באותה בקשה</div>
                    {extraReqs.map((r, i) => (
                      <div key={i} style={{ display: 'flex', gap: '.35rem', alignItems: 'center' }}>
                        <select className="input" style={{ width: 130 }} value={r.kind}
                          onChange={e => setExtraReqs(list => list.map((x, j) =>
                            j === i ? { ...x, kind: e.target.value as CustomRequirementKind } : x))}>
                          {KINDS.map(k => <option key={k} value={k}>{REQUIREMENT_KIND_LABELS[k]}</option>)}
                        </select>
                        <input className="input" style={{ flex: 1 }} value={r.label}
                          placeholder="מה בדיוק צריך"
                          onChange={e => setExtraReqs(list => list.map((x, j) =>
                            j === i ? { ...x, label: e.target.value } : x))} />
                        <button type="button" className="btn btn-sm btn-ghost" aria-label="הסרה"
                          onClick={() => setExtraReqs(list => list.filter((_, j) => j !== i))}>✕</button>
                      </div>
                    ))}
                    <button type="button" className="btn btn-sm btn-ghost" style={{ alignSelf: 'flex-start' }}
                      onClick={() => setExtraReqs(list => [...list, { kind: 'confirm', label: '' }])}>
                      + עוד דרישה
                    </button>
                  </div>
                </div>
              )}

              <Shared {...{ dueDate, setDueDate, dependsOn, setDependsOn, dependencyOptions, processPublished, sendNow, setSendNow, requiredForClose, setRequiredForClose }} />
            </>
          )}

          {presetType && !existing.has(presetType) && (
            <Shared {...{ dueDate, setDueDate, dependsOn, setDependsOn, dependencyOptions, processPublished, sendNow, setSendNow, requiredForClose, setRequiredForClose }} />
          )}
        </div>

        <div className="modal-foot" style={{ display: 'flex', gap: '.4rem', justifyContent: 'flex-end' }}>
          {mode !== 'catalog' && !presetType && (
            <button type="button" className="btn btn-secondary" disabled={busy}
              onClick={() => { setMode('catalog'); setError(null); }}>חזרה</button>
          )}
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            {presetType && existing.has(presetType) ? 'סגור' : 'ביטול'}
          </button>
          {presetType && !existing.has(presetType) && (
            <button type="button" className="btn btn-primary" disabled={busy}
              onClick={() => { void create(presetType, {}); }}>
              {busy ? 'מוסיף…' : 'הוסף בקשה'}
            </button>
          )}
          {mode === 'custom' && !presetType && (
            <button type="button" className="btn btn-primary" disabled={busy} onClick={submitCustom}>
              {busy ? 'מוסיף…' : 'הוסף בקשה'}
            </button>
          )}
          {mode === 'documents' && !presetType && (
            <button type="button" className="btn btn-primary" disabled={busy} onClick={submitDocuments}>
              {busy ? 'מוסיף…' : 'הוסף בקשה'}
            </button>
          )}
          {mode === 'bank' && !presetType && (
            <button type="button" className="btn btn-primary"
              disabled={busy || debitAuthorities.length === 0} onClick={submitBankDebit}>
              {busy ? 'מוסיף…' : 'הוסף בקשה'}
            </button>
          )}
          {mode === 'document' && !presetType && !!library?.length && (
            <button type="button" className="btn btn-primary" disabled={busy || !docId}
              onClick={() => {
                const doc = library.find(d => d.id === docId);
                if (doc) void create('custom_request', buildDocumentRequestPayload(doc));
              }}>
              {busy ? 'מוסיף…' : 'הוסף בקשה'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

/** שדות שמשותפים לכל סוגי הבקשות — יעד, תלות, ומתי הלקוח יראה. */
function Shared({
  dueDate, setDueDate, dependsOn, setDependsOn, dependencyOptions,
  processPublished, sendNow, setSendNow, requiredForClose, setRequiredForClose,
}: {
  dueDate: string; setDueDate: (v: string) => void;
  dependsOn: string; setDependsOn: (v: string) => void;
  dependencyOptions: OnboardingStep[];
  processPublished: boolean;
  sendNow: boolean; setSendNow: (v: boolean) => void;
  requiredForClose: boolean; setRequiredForClose: (v: boolean) => void;
}) {
  return (
    <>
      <div style={{ display: 'flex', gap: '.5rem', flexWrap: 'wrap' }}>
        <label style={{ ...lbl, flex: 1, minWidth: 150 }}>
          תאריך יעד (לא חובה)
          <input type="date" className="input" value={dueDate} onChange={e => setDueDate(e.target.value)} />
        </label>
        <label style={{ ...lbl, flex: 1, minWidth: 180 }}>
          ייפתח רק אחרי (לא חובה)
          <select className="input" value={dependsOn} onChange={e => setDependsOn(e.target.value)}>
            <option value="">- בלי תלות -</option>
            {dependencyOptions.map(s => (
              <option key={s.id} value={s.id}>{STEP_TYPE_LABELS[s.stepType]}</option>
            ))}
          </select>
        </label>
      </div>

      {/* ‼ בקרה אחת, שורה אחת: האם הבקשה חוסמת סגירת קליטה. אותו סוג בקשה
          יכול להיות חובה במסע אחד ורשות במסע אחר, ולכן זו החלטה לכל בקשה. */}
      <label style={{ display: 'flex', gap: '.4rem', alignItems: 'center', fontSize: 'var(--fs-13)' }}>
        <input type="checkbox" checked={requiredForClose} onChange={e => setRequiredForClose(e.target.checked)} />
        נדרש לסגירת הקליטה
        <span style={{ color: 'var(--ink-4)', fontSize: 'var(--fs-12)' }}>
          (לא מסומן ⇒ רשות - לא יחסום את הסגירה)
        </span>
      </label>

      {processPublished && (
        <label style={{ display: 'flex', gap: '.4rem', alignItems: 'center', fontSize: 'var(--fs-13)' }}>
          <input type="checkbox" checked={sendNow} onChange={e => setSendNow(e.target.checked)} />
          לפתוח מיד ללקוח בדף האישי
          <span style={{ color: 'var(--ink-4)', fontSize: 'var(--fs-12)' }}>
            (לא מסומן ⇒ נשמר כטיוטה אצלך)
          </span>
        </label>
      )}
    </>
  );
}

const lbl: React.CSSProperties = {
  display: 'flex', flexDirection: 'column', gap: '.25rem', fontSize: 'var(--fs-13)',
};

const rowBtn: React.CSSProperties = {
  display: 'flex', flexDirection: 'column', gap: '.15rem', alignItems: 'flex-start',
  textAlign: 'start', padding: '.55rem .7rem', borderRadius: 'var(--radius)',
  border: '1px solid var(--hairline-2)', background: 'transparent',
  color: 'var(--ink-1)', cursor: 'pointer', font: 'inherit', width: '100%',
};

/** שגיאת מסד גולמית באנגלית אינה אומרת כלום לרו"ח. מה שאין לו תרגום — נאמר בכלליות. */
function friendly(dbMessage?: string): string {
  if (dbMessage && /duplicate key|unique constraint/i.test(dbMessage)) {
    return ERRORS.step_type_exists;
  }
  return 'ההוספה נכשלה. אפשר לנסות שוב.';
}

const ERRORS: Record<string, string> = {
  forbidden: 'אין הרשאה ללקוח הזה.',
  step_type_exists: 'כבר קיימת בקשה מהסוג הזה אצל הלקוח. אפשר לערוך אותה מלשונית «בקשות».',
  client_not_found: 'הלקוח לא נמצא.',
  step_type_not_allowed: 'סוג הבקשה הזה לא נוצר ידנית.',
  no_requirements: 'בקשה חופשית חייבת לפחות דרישה אחת.',
  dependency_not_found: 'השלב שבחרת כתלות לא נמצא.',
};

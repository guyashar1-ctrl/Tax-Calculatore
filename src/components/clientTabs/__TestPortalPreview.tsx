// ─── מסך בדיקה: תצוגה מקדימה של הדף האישי (?test-portal-preview) ─────────────
// DEV בלבד — נקמפל החוצה מפרודקשן. שני חלקים:
// 1. PortalView על נתוני דמה — אימות ויזואלי של תצוגה במשרד (officeView: טיוטות,
//    פקדים כבויים, הכול נפתח לקריאה) ושל מצב דוגמה (sample: הכול מגיב מקומית,
//    שום דבר לא נשלח) — בלי רשת.
// 2. הדיאלוג האמיתי מול לקוחות ה-DB של משתמש הפיתוח המחובר (RLS מחזיר רק
//    את שלו) — אימות מסלול ה-RPC המלא.

import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { PortalView, PortalData } from '../PublicPortalPage';
import ClientPagePreviewDialog from './ClientPagePreviewDialog';
import PublishCasePrompt from './PublishCasePrompt';
import { buildBankDebitPayload } from '../../lib/bankDebitRequest';

/** הניסוח האמיתי של בקשת ההרשאה — כדי שהבדיקה תראה את מה שהלקוח יראה. */
const BANK = buildBankDebitPayload(['income', 'vat']);

const FIXTURE: PortalData = {
  clientFirstName: 'נועה',
  firmName: 'משרד רו"ח בדיקה',
  branding: {},
  done: 2,
  total: 6,
  journeyStage: 'setup',
  items: [
    { bucket: 'action', key: 'docs', label: 'להעלות 3 מסמכים', sub: '1 מתוך 3 התקבלו',
      actionKind: 'portal', actionValue: 'step1', kind: 'documents', canUpload: true,
      checklist: [
        { key: 'd1', label: 'אישור ניהול חשבון בנק', done: true },
        { key: 'd2', label: 'דוח שנתי אחרון', done: false },
        { key: 'd3', label: 'טופס 106', done: false },
      ] },
    { bucket: 'action', key: 'custom_x', label: 'לאשר את נוהל העבודה', sub: 'שתי דקות',
      actionKind: 'portal', actionValue: 'step2', kind: 'custom', cta: 'מאשר/ת', draft: true,
      requirements: [
        { key: 'r1', kind: 'confirm', label: 'קראתי ואני מאשר/ת', done: false },
        { key: 'r2', kind: 'text', label: 'הערות (אם יש)', done: false },
      ] },
    { bucket: 'action', key: 'custom_bank', label: 'הקמת הרשאה לחיוב חשבון',
      actionKind: 'portal', actionValue: 'step3', kind: 'custom', cta: 'להקמת ההרשאה',
      canUpload: true,
      note: BANK.clientNote, refs: BANK.clientRefs, noteAfter: BANK.clientNoteAfter,
      requirements: [
        { key: 'debit_income', kind: 'file', label: 'אסמכתה - מס הכנסה', done: false, required: true },
        { key: 'debit_vat', kind: 'file', label: 'אסמכתה - מע״מ', done: false, required: true },
      ] },
    { bucket: 'action', key: 'custom_guide', label: 'מדריך הוצאות מוכרות',
      sub: 'מסמך מהמשרד - כמה דקות קריאה',
      actionKind: 'portal', actionValue: 'step4', kind: 'guide', cta: 'לפתיחת המסמך',
      resourceKey: 'expenses_guide', resourceUrl: 'https://example.com/guide.pdf',
      requirements: [
        { key: 'opened', kind: 'confirm', label: 'פתיחת המדריך', done: false, required: false },
        { key: 'reviewed', kind: 'confirm', label: 'עברתי על המדריך', done: false, required: true },
      ] },
    { bucket: 'action', key: 'rep_sign', label: 'חתימה על ייפוי הכוח', sub: 'כדקה',
      actionKind: 'sign', actionValue: 'tok' },
    /* ‼ מסמכים שהמשרד שלח — אינם "מה צריך ממך" ומצוירים בקטע «מסמכים
       מהמשרד». כאן מצב מעורב (אחד נפתח ואחד לא) עם שם ארוך, כדי לראות
       גם את הסימון השקט וגם את שבירת השורה. */
    { bucket: 'action', key: 'custom_sent', label: '2 מסמכים מהמשרד', sub: '2 קבצים',
      actionKind: 'portal', actionValue: 'step5', stepId: 'step5', kind: 'guide',
      note: 'שלום, מצורפים שני האישורים לשנת המס. אין צורך להחזיר לנו כלום.',
      resources: [
        { key: 'a1', label: 'אישור ניהול ספרים לשנת המס 2026 - עותק עבור הלקוח והרשויות',
          url: 'https://example.com/books.pdf', done: true },
        { key: 'a2', label: 'פטור מניכוי מס במקור', url: 'https://example.com/exempt.pdf', done: false },
      ] },
    { bucket: 'done', key: 'custom_sent_old', label: 'נוהל העבודה במשרד',
      stepId: 'step6', resources: [
        { key: 'a1', label: 'נוהל העבודה במשרד', url: 'https://example.com/policy.pdf', done: true },
      ], draft: true },
    { bucket: 'done', key: 'quotation', label: 'הצעת המחיר אושרה' },
    { bucket: 'office', key: 'files_office', label: 'פתיחת התיקים ברשויות', sub: 'בטיפולנו', draft: true },
    { bucket: 'future', key: 'retainer_future', label: 'הרשאת התשלום החודשי', sub: 'תופיע כאן אחרי חיבור הפייפרלס' },
  ],
};

/**
 * ‼ כל סוגי הבקשות בדף אחד — כדי לראות שבתצוגה במשרד הכול נפתח לקריאה (G2) ושבדוגמה כל פעולה
 * «מבוצעת» בלי לשלוח. מפתחות הפריטים כמו בשרת, כדי שהקיבוץ לקבוצות (פייפרלס / רו״ח קודם) יפעל כמו אצל הלקוח.
 */
const ALL_KINDS: PortalData = {
  clientFirstName: 'נועה',
  firmName: 'משרד רו"ח בדיקה',
  branding: {},
  done: 0,
  total: 9,
  items: [
    { bucket: 'action', key: 'k_docs', label: 'מסמכים לפתיחת התיק', sub: '1 מתוך 3 התקבלו',
      actionKind: 'portal', actionValue: 's-docs', kind: 'documents', canUpload: true,
      checklist: [
        { key: 'd1', label: 'אישור ניהול חשבון בנק', done: true },
        { key: 'd2', label: 'דוח שנתי אחרון', done: false, note: 'נדרש על ידי רשות המסים' },
        { key: 'd3', label: 'טופס 106', done: false },
      ] },
    { bucket: 'action', key: 'k_free', label: 'פרטים לדוח השנתי', sub: 'כמה שאלות',
      actionKind: 'portal', actionValue: 's-free', kind: 'custom', cta: 'מאשר/ת',
      note: 'כדי להגיש את הדוח צריך כמה פרטים.\n\nאפשר לענות מהטלפון.',
      refs: [{ label: 'מספר תיק במס הכנסה', value: '123456789' }],
      photoGuide: 'reserve_duty_claim',
      requirements: [
        { key: 'q_text', kind: 'text', label: 'שם הבנק', done: false },
        { key: 'q_choice', kind: 'select', label: 'מצב משפחתי', done: false, options: ['רווק/ה', 'נשוי/ה', 'גרוש/ה'] },
        { key: 'q_file', kind: 'file', label: 'צילום תעודת זהות', done: false },
        { key: 'q_ok', kind: 'confirm', label: 'קראתי ואני מאשר/ת', done: false },
        { key: 'q_done', kind: 'text', label: 'טלפון', done: true, value: '050-0000000' },
      ] },
    { bucket: 'action', key: 'prev_accountant', label: 'פרטי רואה החשבון הקודם', sub: 'כדי שנבקש ממנו את החומרים',
      actionKind: 'portal', actionValue: 's-prev', kind: 'prev_accountant',
      prefill: { name: 'דנה כהן - רו"ח', email: 'dana@example.com', phone: '0501234567' } },
    { bucket: 'action', key: 'paperless_signup', label: 'הרשמה לפייפרלס', sub: 'שם העסק והרשמה',
      actionKind: 'portal', actionValue: 's-signup', kind: 'paperless_signup', needsBusinessName: true, businessName: 'נועה עיצובים',
      linkUrl: 'https://paperless.example/signup', linkLabel: 'לפתיחת החשבון' },
    { bucket: 'action', key: 'business_details', label: 'פרטי העסק', sub: 'שם העסק ועבודה מהבית',
      actionKind: 'portal', actionValue: 's-biz', kind: 'business_details', businessName: 'נועה עיצובים',
      homeOffice: { hasDedicatedRoom: true, totalRooms: 4, businessRooms: 1, note: null } },
    { bucket: 'action', key: 'k_declare', label: 'חיבור פייפרלס לרשות המסים', sub: 'עושים באתר ומאשרים כאן',
      actionKind: 'portal', actionValue: 's-declare', kind: 'declare', cta: 'ביצעתי',
      note: 'נכנסים לאזור האישי ברשות המסים ומאשרים את החיבור.', linkUrl: 'https://www.gov.il/he/service/personal_area_taxes', linkLabel: 'לאזור האישי' },
    { bucket: 'action', key: 'k_identity', label: 'אישור צילום התעודה', sub: 'מצאנו אצלנו צילום שנשלח בעבר.',
      actionKind: 'portal', actionValue: 's-identity', stepId: 's-identity', kind: 'identity_confirm',
      resources: [{ key: 'id1', label: 'צילום תעודה', documentId: 'doc-private-1', fileName: 'id.pdf', done: false }] },
    { bucket: 'action', key: 'k_guide', label: 'מדריך הוצאות מוכרות', sub: 'מסמך מהמשרד',
      actionKind: 'portal', actionValue: 's-guide', kind: 'guide', cta: 'לפתיחת המדריך', resourceUrl: 'https://example.com/guide.pdf',
      requirements: [
        { key: 'opened', kind: 'confirm', label: 'פתיחת המדריך', done: false, required: false },
        { key: 'reviewed', kind: 'confirm', label: 'עברתי על המדריך', done: false, required: true },
      ] },
    { bucket: 'action', key: 'k_onboard', label: 'מילוי פרטים וייפוי כוח', sub: 'כשלוש דקות',
      actionKind: 'onboard', actionValue: 'sample-onboard' },
    { bucket: 'action', key: 'k_ext', label: 'כניסה לאתר רשות המסים', actionKind: 'external', actionValue: 'https://www.gov.il/he/service/personal_area_taxes' },
    { bucket: 'action', key: 'k_sent', label: '2 מסמכים מהמשרד', sub: '2 קבצים', stepId: 's-sent',
      actionKind: 'portal', actionValue: 's-sent', kind: 'guide', note: 'מצורפים שני מסמכים. אין צורך להחזיר כלום.',
      resources: [
        { key: 'a1', label: 'נוהל העבודה במשרד', url: 'https://example.com/policy.pdf', done: false },
        { key: 'a2', label: 'אישור ניהול ספרים (מהתיק שלך)', documentId: 'doc-private-2', done: false },
      ] },
  ],
};

export default function TestPortalPreview() {
  const [linked, setLinked] = useState<string[]>([]);
  const sampleHooks = useMemo(() => ({
    onOpenLinked: (kind: string, value?: string) => setLinked(l => [...l, `${kind}:${value ?? ''}`]),
  }), []);
  const [clients, setClients] = useState<{ id: string; name: string }[]>([]);
  const [openId, setOpenId] = useState<string | null>(null);
  const [promptId, setPromptId] = useState<string | null>(null);
  const [sessionReady, setSessionReady] = useState(false);

  useEffect(() => {
    const t = window.setInterval(async () => {
      const { data } = await supabase.auth.getSession();
      if (data.session) { setSessionReady(true); window.clearInterval(t); }
    }, 400);
    return () => window.clearInterval(t);
  }, []);

  useEffect(() => {
    if (!sessionReady) return;
    // משתמש הבדיקה חסום ברשימת המורשים ⇒ SELECT ישיר מחזיר ריק. ה-RPC של
    // התצוגה המקדימה הוא SECURITY DEFINER ולכן עובד — מוסרים לו מזהה בפרמטר:
    // ?test-portal-preview=<clientId>
    const explicit = new URLSearchParams(window.location.search).get('test-portal-preview');
    supabase.from('clients').select('id, first_name, last_name').limit(8)
      .then(({ data }) => {
        const fromDb = (data ?? []).map(c => ({
          id: c.id, name: `${c.first_name ?? ''} ${c.last_name ?? ''}`.trim() || c.id,
        }));
        setClients(explicit && !fromDb.some(c => c.id === explicit)
          ? [{ id: explicit, name: `לקוח ${explicit.slice(0, 8)}…` }, ...fromDb]
          : fromDb);
      });
  }, [sessionReady]);

  return (
    <div style={{ padding: '1rem', display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: '1rem', maxWidth: '100vw', overflowX: 'hidden' }}>
      <h2 style={{ margin: 0 }}>בדיקת תצוגה מקדימה של הדף האישי</h2>

      <section>
        <h3>1 · PortalView על נתוני דמה - תצוגה במשרד (פעולות כבויות, טיוטות מסומנות)</h3>
        <div className="pivo-light" style={{ border: '1px solid #ccc', borderRadius: 8, overflow: 'hidden' }}>
          <PortalView data={FIXTURE} mode="officeView" embed />
        </div>
      </section>

      <section>
        <h3>1א · כל סוגי הבקשות - תצוגה במשרד (הכול נפתח לקריאה, הפקדים כבויים)</h3>
        <div className="pivo-light" data-testid="tpp-officeview" style={{ border: '1px solid #ccc', borderRadius: 8, overflow: 'hidden' }}>
          <PortalView data={ALL_KINDS} mode="officeView" embed />
        </div>
      </section>

      <section>
        <h3>1ב · אותם פריטים - מצב דוגמה (הכול מגיב מקומית, שום דבר לא נשלח; קישור עם טוקן קורא ל-openLinked)</h3>
        <div data-testid="tpp-linked-log" style={{ fontSize: 13, marginBottom: 6 }}>פתיחות של מסך מקושר: {linked.join(', ') || 'אין'}</div>
        <div className="pivo-light" data-testid="tpp-sample" style={{ border: '1px solid #ccc', borderRadius: 8, overflow: 'hidden' }}>
          <PortalView data={ALL_KINDS} mode="sample" sampleHooks={sampleHooks} embed />
        </div>
      </section>

      {/* ‼ מצב preview מכבה כל פקד, ולכן הוא לא מראה איך הסימון נראה ומתנהג
          אצל הלקוח. כאן אותם פריטים בלי preview. ‼ טוקן ריק מכבה את הפקדים
          (כמו preview), ולכן טוקן שאינו קיים — לחיצה מקבלת 'invalid' מהשרת
          ומציגה את הודעת השגיאה. שום נתון לא נוגע. */}
      <section>
        <h3>2 · אותם פריטים במצב חי (טוקן לא קיים - לחיצה נכשלת בכוונה)</h3>
        <div className="pivo-light" style={{ border: '1px solid #ccc', borderRadius: 8, overflow: 'hidden' }}>
          <PortalView data={{ ...FIXTURE, items: FIXTURE.items.filter(i => i.bucket === 'action') }} token="qa-invalid" embed />
        </div>
      </section>

      <section>
        <h3>3 · הדיאלוג האמיתי - לקוחות ה-DB של משתמש הפיתוח</h3>
        {!sessionReady && <p>ממתין להתחברות…</p>}
        {sessionReady && clients.length === 0 && <p>למשתמש הזה אין לקוחות ב-DB.</p>}
        <div style={{ display: 'flex', gap: '.5rem', flexWrap: 'wrap' }}>
          {clients.map(c => (
            <span key={c.id} style={{ display: 'inline-flex', gap: '.25rem' }}>
              <button type="button" className="btn btn-sm btn-secondary"
                onClick={() => setOpenId(c.id)}>{c.name}</button>
              <button type="button" className="btn btn-sm btn-ghost" title="שאלת המייל שאחרי פרסום (D4)"
                onClick={() => setPromptId(c.id)}>שאלת פרסום</button>
            </span>
          ))}
        </div>
      </section>

      {openId && (
        <ClientPagePreviewDialog
          clientId={openId}
          clientName={clients.find(c => c.id === openId)?.name ?? openId}
          onClose={() => setOpenId(null)}
        />
      )}
      {promptId && (
        <PublishCasePrompt
          clientId={promptId}
          clientName={clients.find(c => c.id === promptId)?.name ?? promptId}
          clientEmail="delivered@resend.dev"
          onClose={() => setPromptId(null)}
        />
      )}
    </div>
  );
}

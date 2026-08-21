// מכתב העברת הטיפול לרו"ח קודם — הרו"ח מרכיב, בודק, ושולח. לא נשלח אוטומטית.
//
// ‼ שלושה דברים שהופכים את זה ממייל לבקשה מקצועית: גבול הטיפול השוטף (תקופת
// הדיווח האחרונה שבטיפול הקודם — בלעדיה חלוקת האחריות לא מוגדרת), רשימת
// החומרים המבוקשים, וחלון ההתייחסות של הרו"ח הקודם. הלקוח מכותב תמיד — לא
// נכון שיגלה על ההעברה אחר כך.
//
// ‼ העבודות הפתוחות (דוח שנתי / הצהרת הון / חופשי) הן הקלט היחיד הנוסף:
// פסקת הייצוג במכתב, הפריט העתידי ("העתק הדוח שהוגש") והרישום כמייצג משני
// נגזרים מהן אוטומטית — אין שאלת "האם זה משפיע על הייצוג".
//
// ‼ חלון ההתנגדות (שלושה ימי עסקים) הוא **כלל עבודה פנימי של המשרד** ולא
// חוק, תקנה או כלל מקצועי מאומת. נוסח המכתב עצמו — שגיא אישר — נשאר כפי
// שהוא; ההבהרה הזאת נוגעת לאופן שבו הקוד והתיעוד מתארים את הכלל.
//
// אחרי שליחה מוצלחת המייל נשמר כ-PDF במסמכי הלקוח — רואים בדיוק מה נשלח ולמי.

import { useRef, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { edgeFunctionError } from '../../utils/functionError';
import { useDocumentStore } from '../../hooks/useDocumentStore';
import type { QuotationBrand } from './quotationBranding';
import type { ReleaseDraft, ReleaseMaterial, TransitionOutstandingItem, TransitionOutstandingKind } from '../../utils/releaseLetter';
import {
  RELEASE_MATERIALS, defaultReleaseSubject, defaultReleaseBody,
  buildReleaseEmailHtml, generateReleaseEmailPdf, followUpBody, followUpSubject,
  toggleHighlightAt, periodLabel, nextPeriod, newOutstandingItem,
  type ReleaseTemplate, type ReleaseContext,
} from '../../utils/releaseLetter';
import HighlightTextarea from '../ui/HighlightTextarea';
import { isBlockingOutstanding, outstandingLabel } from '../../types/onboarding';
import EmailInput from '../ui/EmailInput';
import InfoLines from '../ui/InfoLines';

interface Props {
  clientId: string;
  clientName: string;
  /** ת.ז. שעליה מתנהל תיק מס הכנסה — מזהה את התיק אצל הרו״ח הקודם. */
  taxFileNumber?: string;
  /** בן/בת הזוג, כשהלקוח נשוי — שני השמות ושתי הת״זים נכנסים למכתב. */
  spouse?: { name: string; idNumber?: string };
  clientEmail?: string;
  prevAccountant: { name?: string; email?: string; phone?: string };
  brand: QuotationBrand;
  /** נקרא רק אחרי שליחה מוצלחת — מקדם את שלב הקליטה ל"נשלח". */
  onSent?: (sent: {
    materialKeys: string[]; objectionDueDate: string;
    /** גבול הטיפול השוטף והעבודות הפתוחות — נשמרים על השלב ומזינים את הכרטיס. */
    lastPeriodPrev?: string; outstandingItems?: TransitionOutstandingItem[];
    /** הפריטים שנשלחו בפועל, עם הניסוח הסופי — כולל פריטים שהמשרד הוסיף
     *  או ניסח מחדש. צ'קליסט המעקב נבנה מהם, ולא מהרשימה הקבועה. */
    materials?: { key: string; label: string; optional?: boolean; priority?: boolean }[];
    /** הנוסח הסופי והטוקן — כדי שדף הרו"ח הקודם יציג בדיוק את מה שנשלח. */
    subject?: string; body?: string; releaseToken?: string;
    /** הנמען בפועל, והטיוטה כפי שהייתה ברגע השליחה. */
    to?: string; draft?: ReleaseDraft;
  }) => void;
  /** שלב מכתב השחרור. קיים ⇒ נטבע טוקן ולמכתב יתווסף קישור לדף החתימה. */
  stepId?: string;
  /** הטיוטה השמורה על השלב — מה שנערך בכרטיס נפתח כאן, ולהפך. */
  draft?: ReleaseDraft;
  /**
   * 'follow_up' — פריטים שנוספו אחרי שהמכתב כבר יצא. אותו מסלול, אותו קישור,
   * אותה ראיה במסמכי הלקוח; מה שנשלח במקור אינו נדרס.
   */
  mode?: 'letter' | 'follow_up';
  followUpItems?: { key: string; label: string }[];
  /** נקרא בסגירה ובשליחה — הטיוטה נשמרת על השלב ולא נמחקת עם החלון. */
  onSaveDraft?: (draft: ReleaseDraft) => void;
  /** התבנית המשרדית ממסך ההגדרות. חסרה ⇒ נוסח ברירת המחדל. */
  template?: ReleaseTemplate;
  onClose: () => void;
}

/**
 * חלון ההתנגדות — שלושה ימי עסקים, בלי שישי-שבת.
 * ‼ כלל עבודה פנימי של המשרד. אינו סופר חגים.
 */
function addBusinessDays(from: Date, days: number): string {
  const d = new Date(from);
  let left = days;
  while (left > 0) {
    d.setDate(d.getDate() + 1);
    const wd = d.getDay();               // 5 = שישי, 6 = שבת
    if (wd !== 5 && wd !== 6) left -= 1;
  }
  return d.toISOString().slice(0, 10);
}

const todayISO = () => new Date().toISOString().slice(0, 10);

export default function ReleaseLetterDialog({
  clientId, clientName, taxFileNumber, spouse, clientEmail, prevAccountant, brand,
  onSent, onClose, stepId, draft, onSaveDraft, template, mode = 'letter', followUpItems = [],
}: Props) {
  const followUp = mode === 'follow_up';
  const { saveDoc } = useDocumentStore();
  const ctx: ReleaseContext = {
    clientName, taxFileNumber, spouse, prevAccountantName: prevAccountant.name,
  };

  const [toEmail, setToEmail] = useState(prevAccountant.email ?? '');
  // ‼ הלקוח מכותב תמיד (הכרעת גיא 2026-08-18) — זה לא בחירה של המשרד: הוא
  // זה שמעביר את הטיפול, ולא נכון שיגלה על המכתב בדיעבד. נגזר מהמייל בכרטיס
  // ולא ממצב שאפשר לכבות; בלי מייל אין למי לשלוח, והמכתב גם לא יצהיר שיש.
  const ccClient = !!clientEmail?.trim();
  const [lastPeriodPrev, setLastPeriodPrev] = useState(draft?.lastPeriodPrev || todayISO().slice(0, 7));
  const [materials, setMaterials] = useState<ReleaseMaterial[]>(
    (draft?.materials ?? RELEASE_MATERIALS).map(m => ({ ...m })));
  const [outstandingItems, setOutstandingItems] = useState<TransitionOutstandingItem[]>(
    (draft?.outstandingItems ?? []).map(i => ({ ...i })));
  // "כן, נשאר משהו פתוח" — נדלק ידנית גם לפני שנוסף פריט ראשון.
  const [showOutstanding, setShowOutstanding] = useState((draft?.outstandingItems ?? []).length > 0);

  const compose = (o?: Partial<{
    lastPeriodPrev: string; materials: ReleaseMaterial[]; outstandingItems: TransitionOutstandingItem[];
  }>) => defaultReleaseBody(ctx, brand.firmName, {
    lastPeriodPrev: o?.lastPeriodPrev ?? lastPeriodPrev,
    materials: o?.materials ?? materials,
    outstandingItems: o?.outstandingItems ?? outstandingItems,
    ccClient,
    template,
  });

  const [subject, setSubject] = useState(
    followUp ? followUpSubject(ctx) : (draft?.subject || defaultReleaseSubject(ctx, template)));
  const [body, setBody] = useState(() => followUp
    ? followUpBody(ctx, brand.firmName, followUpItems.map(i => i.label))
    : (draft?.body || compose()));
  // ברגע שהרו"ח נגע בנוסח, המערכת מפסיקה לדרוס אותו. יש כפתור לבנות מחדש.
  const [edited, setEdited] = useState(followUp ? true : (draft?.bodyEdited ?? false));
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);
  const [done, setDone] = useState(false);

  const fromLabel = `${brand.firmName}${brand.email ? ` <${brand.email}>` : ''}`;
  const locked = busy || done;

  function sync(next: Parameters<typeof compose>[0]) {
    if (!edited) setBody(compose(next));
  }

  /** מה שנשמר על השלב — כך שסגירה בלי שליחה אינה מוחקת את מה שהורכב. */
  function currentDraft(): ReleaseDraft {
    return {
      materials, lastPeriodPrev, outstandingItems,
      ccClient, subject, body, bodyEdited: edited,
    };
  }

  function closeAndSave() {
    // ‼ עדכון המשך אינו טיוטה: שמירתו הייתה דורסת את המכתב שהורכב.
    if (!done && !followUp) onSaveDraft?.(currentDraft());
    onClose();
  }

  /* ── עריכת רשימת החומרים ──────────────────────────────────────────────
     ‼ הרשימה המקצועית היא **נקודת פתיחה**, לא טופס סגור: מה שמבקשים מרו״ח
     קודם משתנה מלקוח ללקוח. לכן אפשר לנסח מחדש, להוסיף, למחוק ולסדר —
     ולא רק לסמן. הרשימה שנשלחת בפועל היא זו שהופכת לצ'קליסט המעקב. */
  function applyMaterials(next: ReleaseMaterial[]) {
    setMaterials(next);
    sync({ materials: next });
  }

  const toggleMaterial = (key: string) =>
    applyMaterials(materials.map(m => (m.key === key ? { ...m, checked: !m.checked } : m)));

  const renameMaterial = (key: string, label: string) =>
    applyMaterials(materials.map(m => (m.key === key ? { ...m, label } : m)));

  const removeMaterial = (key: string) =>
    applyMaterials(materials.filter(m => m.key !== key));

  /** סימון "חשוב במיוחד". הנוסח נבנה מחדש כדי שהפריט יעלה לראש הרשימה במכתב. */
  const togglePriority = (key: string) =>
    applyMaterials(materials.map(m => (
      m.key === key ? { ...m, priority: !m.priority } : m)));

  /* ── מרקר על קטע נבחר ─────────────────────────────────────────────────────
     ‼ לא עורך עשיר: הסימון הוא זוג `==` סביב הבחירה, והמכתב נשאר טקסט פשוט
     בכל מקום שהוא נשמר. לחיצה על קטע שכבר מובלט מסירה את הסימון. */
  const bodyRef = useRef<HTMLTextAreaElement | null>(null);

  function toggleHighlight() {
    const el = bodyRef.current;
    if (!el) return;
    const result = toggleHighlightAt(body, el.selectionStart ?? 0, el.selectionEnd ?? 0);
    if (!result) {
      setNotice({ kind: 'err', text: 'צריך לסמן קודם את הקטע שרוצים להדגיש.' });
      return;
    }
    setBody(result.text);
    setEdited(true);
    setNotice(null);
    requestAnimationFrame(() => { el.focus(); el.setSelectionRange(...result.selection); });
  }

  function moveMaterial(key: string, dir: -1 | 1) {
    const i = materials.findIndex(m => m.key === key);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= materials.length) return;
    const next = [...materials];
    [next[i], next[j]] = [next[j], next[i]];
    applyMaterials(next);
  }

  function addMaterial() {
    // ‼ מפתח ייחודי משלו: מפתחות הרשימה המקצועית שמורים, ופריט שהמשרד הוסיף
    // חייב מפתח שלא יתנגש בהם — גם בצ'קליסט המעקב שנבנה מהם.
    const key = `custom_${Date.now().toString(36)}`;
    applyMaterials([...materials, { key, label: '', checked: true }]);
  }

  /* ── עבודות פתוחות אצל הרו"ח הקודם ────────────────────────────────────
     ‼ שני פריסטים (דוח שנתי, הצהרת הון) + חופשי — לא טופס ניהול משימות.
     לפריסט יש שנה בלבד; הניסוח, פסקת הייצוג והפריט העתידי נגזרים ממנו. */
  function applyOutstanding(next: TransitionOutstandingItem[]) {
    setOutstandingItems(next);
    sync({ outstandingItems: next });
  }

  function addOutstanding(kind: TransitionOutstandingKind) {
    // דוח שנתי / הצהרת הון — כמעט תמיד על השנה שהסתיימה.
    const year = kind === 'other' ? undefined : new Date().getFullYear() - 1;
    const item = newOutstandingItem(kind, year, kind === 'other' ? '' : outstandingLabel(kind, year));
    applyOutstanding([...outstandingItems, item]);
  }

  const setOutstandingYear = (key: string, year: number) =>
    applyOutstanding(outstandingItems.map(i => (
      i.key === key ? { ...i, year, label: outstandingLabel(i.kind, year) } : i)));

  const setOutstandingLabel = (key: string, label: string) =>
    applyOutstanding(outstandingItems.map(i => (i.key === key ? { ...i, label } : i)));

  const removeOutstanding = (key: string) =>
    applyOutstanding(outstandingItems.filter(i => i.key !== key));

  const hasBlocking = outstandingItems.some(i => isBlockingOutstanding(i) && i.label.trim());

  async function handleSend() {
    setNotice(null);
    if (!toEmail.trim()) { setNotice({ kind: 'err', text: 'חסר מייל של הרו״ח הקודם.' }); return; }
    if (!followUp && !/^\d{4}-\d{2}$/.test(lastPeriodPrev)) {
      setNotice({ kind: 'err', text: 'חסרה התקופה האחרונה שבטיפול הרו״ח הקודם.' });
      return;
    }
    setBusy(true);
    try {
      // ‼ שולחים דגל ולא כתובת — השרת לוקח את המייל מהכרטיס, כדי שהפונקציה
      // לא תוכל לשמש לשליחת עותק לכתובת שרירותית.
      const wantsCc = ccClient && !!clientEmail?.trim();

      // ‼ הרו"ח הקודם חותם ומעלה את החומרים בדף משלו. בלי הקישור הזה המכתב
      // יוצא בלי הדרך היחידה לענות עליו (הכרעת גיא 2026-08-05).
      let releaseToken: string | undefined;
      if (stepId) {
        const { data: mint } = await supabase.rpc('mint_release_token', { p_step_id: stepId });
        releaseToken = (mint as { ok?: boolean; token?: string } | null)?.token;
      }
      // ‼ הקישור הוא הכפתור הראשי של המייל, ולא שורת טקסט בסוף המכתב. הכיתוב
      // "לאישור השחרור" ירד יחד עם דרישת החתימה — הפעולה היא העברת החומרים.
      // ‼ הגוף נשאר נקי מהקישור: הוא מה שנשמר כראיה ומה שמוצג בדף הנמען,
      // וכתובת ארוכה בתוכו הייתה נקראת שם כרעש.
      const uploadUrl = releaseToken
        ? `${window.location.origin}/?release=${releaseToken}`
        : undefined;
      const finalBody = body;

      const html = buildReleaseEmailHtml(finalBody, brand, {
        uploadUrl,
        materials,
        heading: followUp ? 'תוספת לבקשת החומרים' : `העברת חומרים — ${clientName}`,
      });
      const { data: res, error } = await supabase.functions.invoke('send-release-email', {
        body: { clientId, to: toEmail.trim(), ccClient: wantsCc, subject, html },
      });
      if (error || !res?.ok) {
        // ‼ error.message הוא תמיד "non-2xx status code" — משפט שאי אפשר
        // לפעול לפיו. הסיבה האמיתית יושבת בגוף התשובה.
        const why = error
          ? await edgeFunctionError(error)
          : (res?.detail?.message || res?.error || 'שגיאה');
        setNotice({ kind: 'err', text: `השליחה נכשלה: ${why}` });
        return;
      }
      const dateStr = new Date().toLocaleDateString('he-IL', { day: 'numeric', month: 'long', year: 'numeric' });
      const pdf = await generateReleaseEmailPdf({
        from: res.from || fromLabel, to: toEmail.trim(), date: dateStr, subject, bodyText: finalBody,
        uploadUrl,
      }, brand);
      const docId = crypto.randomUUID();
      const docTitle = followUp ? 'תוספת לבקשת החומרים — רו״ח קודם' : 'מכתב העברת טיפול — רו״ח קודם';
      await saveDoc({
        id: docId, clientId,
        fileName: `${docTitle} ${dateStr}.pdf`,
        fileType: 'application/pdf',
        fileSize: pdf.byteLength,
        category: 'other',
        year: 'general',
        uploadedAt: new Date().toISOString(),
        description: `${followUp ? 'תוספת לבקשת החומרים שנשלחה' : 'מכתב העברת הטיפול שנשלח'} ל${prevAccountant.name || 'רו״ח הקודם'} (${toEmail.trim()})${res.cc ? ` · עותק ל${clientName}` : ''}`,
        notes: `נשלח מ-${res.from || fromLabel}`,
        fileData: pdf.buffer.slice(0) as ArrayBuffer,
      });
      setDone(true);
      setNotice({
        kind: 'ok',
        text: followUp ? 'העדכון נשלח ונשמר במסמכי הלקוח.' : 'המכתב נשלח ונשמר במסמכי הלקוח.',
      });
      onSent?.({
        materialKeys: materials.filter(m => m.checked).map(m => m.key),
        materials: materials.filter(m => m.checked && m.label.trim())
          .map(m => ({
            key: m.key, label: m.label.trim(),
            ...(m.optional ? { optional: true } : {}),
            ...(m.priority ? { priority: true } : {}),
          })),
        objectionDueDate: addBusinessDays(new Date(), 3),
        // חלוקת האחריות כפי שנשלחה — הכרטיס מציג אותה, וההשלכות (ייצוג משני,
        // פריט עתידי) נגזרות ממנה. פריט חופשי בלי ניסוח לא נשלח ולא נשמר.
        lastPeriodPrev,
        outstandingItems: outstandingItems.filter(i => i.label.trim()),
        subject, body: finalBody, releaseToken,
        to: toEmail.trim(),
        draft: { ...currentDraft(), body: finalBody, subject },
      });
    } catch (e) {
      setNotice({ kind: 'err', text: `שגיאה: ${e instanceof Error ? e.message : String(e)}` });
    } finally {
      setBusy(false);
    }
  }

  const label = { fontSize: 12, color: 'var(--gray-600)' } as const;

  return (
    <div className="modal-backdrop" onClick={e => { if (e.target === e.currentTarget) closeAndSave(); }}>
      <div className="modal task-modal" style={{ maxWidth: 720, width: '100%' }}>
        <div className="modal-header">
          <h3>{followUp ? 'עדכון לרו״ח הקודם' : 'מכתב העברת טיפול לרו״ח הקודם'}</h3>
          <button className="btn btn-icon btn-ghost" onClick={closeAndSave}>✕</button>
        </div>
        <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <InfoLines
            style={{ fontSize: 12.5, color: 'var(--gray-600)', background: 'var(--gray-50)', borderRadius: 8, padding: '8px 10px' }}
            items={[
              <>נשלח מ: <b dir="ltr">{fromLabel}</b></>,
              'בדוק ושלח — לא נשלח אוטומטית',
              'עותק יישמר במסמכי הלקוח',
            ]} />

          <div style={{ display: 'grid', gap: 10, gridTemplateColumns: 'repeat(auto-fit, minmax(14rem, 1fr))' }}>
            <label style={label}>אל (מייל הרו״ח הקודם)
              <EmailInput value={toEmail} onChange={e => setToEmail(e.target.value)}
                style={{ marginTop: 4 }} disabled={locked} />
            </label>
            {!followUp && (
              <label style={label}>הרו״ח הקודם מטפל עד וכולל
                <input type="month" value={lastPeriodPrev} disabled={locked}
                  aria-label="התקופה האחרונה שבטיפול הרו״ח הקודם"
                  onChange={e => { setLastPeriodPrev(e.target.value); sync({ lastPeriodPrev: e.target.value }); }}
                  style={{ marginTop: 4, display: 'block', width: '100%' }} />
                {/^\d{4}-\d{2}$/.test(lastPeriodPrev) && (
                  <span style={{ display: 'block', marginTop: 3, color: 'var(--gray-500)', fontSize: 11.5 }}>
                    הטיפול שלנו יתחיל מתקופת {periodLabel(nextPeriod(lastPeriodPrev))}
                  </span>
                )}
              </label>
            )}
          </div>

          {/* ‼ הכיתוב ללקוח אינו בחירה: הוא זה שמעביר את הטיפול, והמכתב מצהיר
              על כך בפני הרו״ח הקודם. בלי מייל בכרטיס אין עותק — ואז גם המשפט
              "הלקוח מכותב" יורד מהנוסח, כדי שלא נצהיר על משהו שלא קרה. */}
          {ccClient ? (
            <div style={{ ...label, display: 'flex', alignItems: 'center', gap: 6 }}>
              <span aria-hidden="true">✓</span>
              <span>
                עותק יישלח ל{clientName}
                <span dir="ltr" style={{ color: 'var(--gray-500)' }}> ({clientEmail})</span>
              </span>
            </div>
          ) : (
            <InfoLines className="alert alert-warning" style={{ fontSize: 12.5 }} items={[
              `אין מייל של ${clientName} בכרטיס — המכתב ייצא בלי עותק ללקוח`,
              'המשפט "הלקוח מכותב למכתב זה" לא ייכלל בו',
              'כדאי להוסיף מייל בכרטיס לפני השליחה',
            ]} />
          )}

          {followUp ? (
            <fieldset style={{ border: '1px solid var(--bd)', borderRadius: 8, padding: '8px 10px' }}>
              <legend style={label}>הפריטים שנוספו</legend>
              <ul style={{ margin: 0, paddingInlineStart: '1.1rem', fontSize: 12.5, lineHeight: 1.9 }}>
                {followUpItems.map(i => <li key={i.key}>{i.label}</li>)}
              </ul>
              <div style={{ fontSize: 11.5, color: 'var(--gray-500)', marginTop: 6 }}>
                הם כבר מופיעים בדף של הרו״ח הקודם. הרשימה המקורית והמכתב שנשלח נשמרים כפי שהם.
              </div>
            </fieldset>
          ) : (
          <fieldset style={{ border: '1px solid var(--bd)', borderRadius: 8, padding: '8px 10px' }}>
            <legend style={label}>מה מבקשים ממנו</legend>
            <div style={{ display: 'grid', gap: 2 }}>
              {materials.map((m, i) => (
                <div key={m.key} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <input type="checkbox" checked={m.checked} disabled={locked}
                    aria-label={`לכלול: ${m.label}`}
                    onChange={() => toggleMaterial(m.key)} />
                  {/* ‼ פריט חשוב נצבע כאן באותו צהוב שבו הוא יֵצא במכתב — כדי
                      שמה שרואים ברשימה יהיה מה שהרו"ח הקודם יראה, ולא רק כוכב
                      שמסמן משהו שקורה במקום אחר. */}
                  <input
                    value={m.label} disabled={locked} placeholder="מה מבקשים"
                    aria-label="ניסוח הפריט"
                    onChange={e => renameMaterial(m.key, e.target.value)}
                    style={{ flex: 1, minWidth: 0, fontSize: 12.5, padding: '3px 6px',
                             opacity: m.checked ? 1 : .55,
                             ...(m.priority && m.checked
                               ? { background: '#fdf3c4', borderColor: '#e8d98a', fontWeight: 600 }
                               : {}) }} />
                  {m.optional && (
                    <span style={{ fontSize: 11, color: 'var(--gray-500)', flexShrink: 0 }}>רשות</span>
                  )}
                  {/* ‼ "חשוב במיוחד" הוא עדיפות תקשורתית בלבד — הפריט עולה
                      לראש הרשימה ומקבל תג מאופק. שאר הפריטים נשארים מבוקשים
                      בדיוק כמו קודם. פריט רשות אינו יכול להיות חשוב. */}
                  {!m.optional && (
                    <button type="button" className="btn btn-sm btn-ghost" disabled={locked}
                      aria-label={m.priority ? `ביטול סימון חשוב: ${m.label}` : `סימון כחשוב: ${m.label}`}
                      aria-pressed={!!m.priority}
                      title={m.priority ? 'חשוב במיוחד — יופיע ראשון ומודגש' : 'סימון כחשוב במיוחד'}
                      style={{ padding: '0 .25rem', flexShrink: 0, opacity: m.priority ? 1 : .4 }}
                      onClick={() => togglePriority(m.key)}>
                      {m.priority ? '★' : '☆'}
                    </button>
                  )}
                  <button type="button" className="btn btn-sm btn-ghost" disabled={locked || i === 0}
                    aria-label="העלאה" title="העלאה" style={{ padding: '0 .25rem' }}
                    onClick={() => moveMaterial(m.key, -1)}>↑</button>
                  <button type="button" className="btn btn-sm btn-ghost" disabled={locked || i === materials.length - 1}
                    aria-label="הורדה" title="הורדה" style={{ padding: '0 .25rem' }}
                    onClick={() => moveMaterial(m.key, 1)}>↓</button>
                  <button type="button" className="btn btn-sm btn-ghost" disabled={locked}
                    aria-label="הסרה" title="הסרה" style={{ padding: '0 .25rem' }}
                    onClick={() => removeMaterial(m.key)}>✕</button>
                </div>
              ))}
            </div>
            <button type="button" className="btn btn-sm btn-ghost" disabled={locked}
              style={{ marginTop: 4 }} onClick={addMaterial}>+ עוד פריט</button>
          </fieldset>
          )}

          {!followUp && (
            <fieldset style={{ border: '1px solid var(--bd)', borderRadius: 8, padding: '8px 10px' }}>
              <legend style={label}>נשאר משהו פתוח אצל הרו״ח הקודם?</legend>
              <div style={{ display: 'flex', gap: 14, fontSize: 12.5 }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                  <input type="radio" name="rel-outstanding" checked={!showOutstanding} disabled={locked}
                    onChange={() => { setShowOutstanding(false); applyOutstanding([]); }} />
                  לא
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                  <input type="radio" name="rel-outstanding" checked={showOutstanding} disabled={locked}
                    onChange={() => setShowOutstanding(true)} />
                  כן
                </label>
              </div>
              {showOutstanding && (
                <div style={{ display: 'grid', gap: 4, marginTop: 6 }}>
                  {outstandingItems.map(i => (
                    <div key={i.key} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      {i.kind === 'other' ? (
                        <input value={i.label} disabled={locked} autoFocus={!i.label}
                          placeholder="מה נשאר אצלו — למשל: דיון שומה פתוח במע״מ לשנת 2023"
                          aria-label="עבודה פתוחה אצל הרו״ח הקודם"
                          onChange={e => setOutstandingLabel(i.key, e.target.value)}
                          style={{ flex: 1, minWidth: 0, fontSize: 12.5, padding: '3px 6px' }} />
                      ) : (
                        <>
                          <span style={{ fontSize: 12.5, flexShrink: 0 }}>
                            {i.kind === 'annual_report' ? 'דוח שנתי' : 'הצהרת הון'}
                          </span>
                          <select value={i.year} disabled={locked}
                            aria-label={`שנת ה${i.kind === 'annual_report' ? 'דוח' : 'הצהרה'}`}
                            onChange={e => setOutstandingYear(i.key, Number(e.target.value))}
                            style={{ width: 'auto', fontSize: 12.5, padding: '2px 4px' }}>
                            {Array.from({ length: 7 }, (_, n) => new Date().getFullYear() - n).map(y => (
                              <option key={y} value={y}>{y}</option>
                            ))}
                          </select>
                          <span style={{ flex: 1 }} />
                        </>
                      )}
                      <button type="button" className="btn btn-sm btn-ghost" disabled={locked}
                        aria-label={`הסרת ${i.label || 'הפריט'}`} title="הסרה"
                        style={{ padding: '0 .25rem', flexShrink: 0 }}
                        onClick={() => removeOutstanding(i.key)}>✕</button>
                    </div>
                  ))}
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 2 }}>
                    <button type="button" className="btn btn-sm btn-ghost" disabled={locked}
                      onClick={() => addOutstanding('annual_report')}>+ דוח שנתי</button>
                    <button type="button" className="btn btn-sm btn-ghost" disabled={locked}
                      onClick={() => addOutstanding('capital_declaration')}>+ הצהרת הון</button>
                    <button type="button" className="btn btn-sm btn-ghost" disabled={locked}
                      onClick={() => addOutstanding('other')}>+ אחר</button>
                  </div>
                  {/* מידע, לא שאלה: ההשלכה על הייצוג נגזרת מהכלל העסקי — המשרד
                      לא מגדיר אותה ידנית ולא נשאל עליה. */}
                  {hasBlocking && (
                    <div style={{ fontSize: 11.5, color: 'var(--gray-500)', lineHeight: 1.6, marginTop: 2 }}>
                      כל עוד העבודה הזו טרם הושלמה, הרו״ח הקודם יישאר המייצג הראשי
                      ומשרדנו יירשם כמייצג משני. המכתב מנסח זאת, והעתק המסמך שיוגש
                      יתבקש אוטומטית אחרי ההגשה.
                    </div>
                  )}
                </div>
              )}
            </fieldset>
          )}

          <label style={label}>נושא
            <input value={subject} onChange={e => setSubject(e.target.value)} style={{ marginTop: 4 }} disabled={locked} />
          </label>

          <label style={label}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              {followUp ? 'תוכן ההודעה' : 'תוכן המכתב'}
              <button type="button" className="btn btn-sm btn-ghost" disabled={locked}
                onClick={toggleHighlight}
                title="מסמנים קטע בטקסט ולוחצים — הוא יופיע עם הדגשה צהובה">
                <span style={{ background: '#fdf3c4', padding: '0 5px', borderRadius: 3 }}>מרקר</span>
              </button>
              {edited && !followUp && (
                <button type="button" className="btn btn-sm btn-ghost" disabled={locked}
                  onClick={() => { setEdited(false); setBody(compose()); }}>
                  בנה מחדש מהשדות
                </button>
              )}
            </span>
            <HighlightTextarea ref={bodyRef} rows={14} value={body} disabled={locked}
              onChange={v => { setBody(v); setEdited(true); }}
              style={{ marginTop: 4 }} />
          </label>

          {notice && (
            <div className={`alert ${notice.kind === 'ok' ? 'alert-info' : 'alert-warning'}`}>{notice.text}</div>
          )}
        </div>
        <div className="modal-footer">
          <div style={{ flex: 1 }} />
          {done ? (
            <button className="btn btn-primary" onClick={onClose}>סיום</button>
          ) : (
            <>
              <button className="btn btn-secondary" onClick={closeAndSave} disabled={busy}>
                {followUp ? 'ביטול' : 'שמור טיוטה וסגור'}
              </button>
              <button className="btn btn-primary" onClick={handleSend} disabled={busy}>
                {busy ? 'שולח…' : followUp ? 'שלח עדכון לרו״ח הקודם' : 'שלח לרו״ח הקודם'}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

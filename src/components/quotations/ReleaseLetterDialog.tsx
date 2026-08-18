// מכתב שחרור לרו"ח קודם — הרו"ח מרכיב, בודק, ושולח. לא נשלח אוטומטית.
//
// ‼ שלושה דברים שהופכים את זה ממייל לבקשה מקצועית: תאריך הפסקת ההתקשרות
// (בלעדיו למכתב אין תוקף), רשימת החומרים המבוקשים, וחלון ההתנגדות של הרו"ח
// הקודם. הלקוח מכותב תמיד: הוא זה שמפסיק את ההתקשרות, ולא נכון שיגלה על כך
// אחר כך.
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
import type { ReleaseDraft, ReleaseMaterial } from '../../utils/releaseLetter';
import {
  RELEASE_MATERIALS, defaultReleaseSubject, defaultReleaseBody,
  buildReleaseEmailHtml, generateReleaseEmailPdf, followUpBody, followUpSubject,
  HIGHLIGHT_MARK, hasHighlightMarks, stripHighlightMarks,
} from '../../utils/releaseLetter';

interface Props {
  clientId: string;
  clientName: string;
  businessName?: string;
  clientEmail?: string;
  prevAccountant: { name?: string; email?: string; phone?: string };
  brand: QuotationBrand;
  /** נקרא רק אחרי שליחה מוצלחת — מקדם את שלב הקליטה ל"נשלח". */
  onSent?: (sent: {
    materialKeys: string[]; objectionDueDate: string;
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
  clientId, clientName, businessName, clientEmail, prevAccountant, brand, onSent, onClose, stepId,
  draft, onSaveDraft, mode = 'letter', followUpItems = [],
}: Props) {
  const followUp = mode === 'follow_up';
  const { saveDoc } = useDocumentStore();
  const ctx = { clientName, businessName, prevAccountantName: prevAccountant.name };

  const [toEmail, setToEmail] = useState(prevAccountant.email ?? '');
  const [ccClient, setCcClient] = useState(draft?.ccClient ?? true);
  const [serviceEndDate, setServiceEndDate] = useState(draft?.serviceEndDate || todayISO());
  const [materials, setMaterials] = useState<ReleaseMaterial[]>(
    (draft?.materials ?? RELEASE_MATERIALS).map(m => ({ ...m })));
  const [paidThrough, setPaidThrough] = useState(draft?.paidThroughLabel ?? '');
  const [outstanding, setOutstanding] = useState(draft?.outstanding ?? '');

  const compose = (o?: Partial<{
    serviceEndDate: string; materials: ReleaseMaterial[]; paidThrough: string; outstanding: string;
  }>) => defaultReleaseBody(ctx, brand.firmName, {
    serviceEndDate: o?.serviceEndDate ?? serviceEndDate,
    materials: o?.materials ?? materials,
    paidThroughLabel: o?.paidThrough ?? paidThrough,
    outstanding: (o?.outstanding ?? outstanding).split('\n').filter(t => t.trim()),
  });

  const [subject, setSubject] = useState(
    followUp ? followUpSubject(ctx) : (draft?.subject || defaultReleaseSubject(ctx)));
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
      materials, serviceEndDate, paidThroughLabel: paidThrough, outstanding,
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
    const start = el.selectionStart ?? 0;
    const end = el.selectionEnd ?? 0;
    if (start === end) {
      setNotice({ kind: 'err', text: 'צריך לסמן קודם את הקטע שרוצים להדגיש.' });
      return;
    }
    const before = body.slice(0, start);
    const sel = body.slice(start, end);
    const after = body.slice(end);
    // כבר מובלט — בתוך הבחירה או מסביבה: מסירים.
    const wrapped = before.endsWith(HIGHLIGHT_MARK) && after.startsWith(HIGHLIGHT_MARK);
    let next: string;
    let caret: [number, number];
    if (wrapped) {
      next = before.slice(0, -2) + sel + after.slice(2);
      caret = [start - 2, end - 2];
    } else if (hasHighlightMarks(sel)) {
      const cleaned = stripHighlightMarks(sel);
      next = before + cleaned + after;
      caret = [start, start + cleaned.length];
    } else {
      // ‼ סימון חייב להיות בתוך שורה אחת — מרקר שחוצה שורות אינו מרונדר.
      const marked = sel.split('\n')
        .map(l => (l.trim() ? `${HIGHLIGHT_MARK}${l}${HIGHLIGHT_MARK}` : l)).join('\n');
      next = before + marked + after;
      caret = [start, start + marked.length];
    }
    setBody(next);
    setEdited(true);
    setNotice(null);
    requestAnimationFrame(() => { el.focus(); el.setSelectionRange(caret[0], caret[1]); });
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

  async function handleSend() {
    setNotice(null);
    if (!toEmail.trim()) { setNotice({ kind: 'err', text: 'חסר מייל של הרו״ח הקודם.' }); return; }
    if (!followUp && !serviceEndDate) { setNotice({ kind: 'err', text: 'חסר תאריך הפסקת ההתקשרות.' }); return; }
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
      const docTitle = followUp ? 'תוספת לבקשת החומרים — רו״ח קודם' : 'מכתב שחרור — רו״ח קודם';
      await saveDoc({
        id: docId, clientId,
        fileName: `${docTitle} ${dateStr}.pdf`,
        fileType: 'application/pdf',
        fileSize: pdf.byteLength,
        category: 'other',
        year: 'general',
        uploadedAt: new Date().toISOString(),
        description: `${followUp ? 'תוספת לבקשת החומרים שנשלחה' : 'מכתב שחרור שנשלח'} ל${prevAccountant.name || 'רו״ח הקודם'} (${toEmail.trim()})${res.cc ? ` · עותק ל${clientName}` : ''}`,
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
          <h3>{followUp ? 'עדכון לרו״ח הקודם' : 'מכתב שחרור לרו״ח הקודם'}</h3>
          <button className="btn btn-icon btn-ghost" onClick={closeAndSave}>✕</button>
        </div>
        <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ fontSize: 12.5, color: 'var(--gray-600)', background: 'var(--gray-50)', borderRadius: 8, padding: '8px 10px' }}>
            נשלח מ: <b dir="ltr">{fromLabel}</b>. בדוק ושלח — לא נשלח אוטומטית. עותק יישמר במסמכי הלקוח.
          </div>

          <div style={{ display: 'grid', gap: 10, gridTemplateColumns: 'repeat(auto-fit, minmax(14rem, 1fr))' }}>
            <label style={label}>אל (מייל הרו״ח הקודם)
              <input value={toEmail} onChange={e => setToEmail(e.target.value)} dir="ltr"
                style={{ textAlign: 'right', marginTop: 4 }} disabled={locked} />
            </label>
            {!followUp && (
              <label style={label}>הפסקת ההתקשרות מתאריך
                <input type="date" value={serviceEndDate} disabled={locked}
                  onChange={e => { setServiceEndDate(e.target.value); sync({ serviceEndDate: e.target.value }); }}
                  style={{ marginTop: 4 }} />
              </label>
            )}
          </div>

          <label style={{ ...label, display: 'flex', alignItems: 'center', gap: 8 }}>
            <input type="checkbox" checked={ccClient} disabled={locked || !clientEmail}
              onChange={e => setCcClient(e.target.checked)} />
            <span>
              לשלוח עותק ל{clientName}
              {clientEmail ? <span dir="ltr" style={{ color: 'var(--gray-500)' }}> ({clientEmail})</span>
                           : <span style={{ color: 'var(--err)' }}> — אין מייל בכרטיס</span>}
            </span>
          </label>

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
                  <input
                    value={m.label} disabled={locked} placeholder="מה מבקשים"
                    aria-label="ניסוח הפריט"
                    onChange={e => renameMaterial(m.key, e.target.value)}
                    style={{ flex: 1, minWidth: 0, fontSize: 12.5, padding: '3px 6px',
                             opacity: m.checked ? 1 : .55 }} />
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
            <label style={label}>הלקוח כבר שילם לו עבור (אופציונלי — משאיר אותו מייצג ראשי עד ההגשה)
              <input value={paidThrough} disabled={locked}
                placeholder="דוחות שנתיים לשנת 2025 והנהלת חשבונות עד פברואר 2026"
                onChange={e => { setPaidThrough(e.target.value); sync({ paidThrough: e.target.value }); }}
                style={{ marginTop: 4 }} />
            </label>
          )}

          {!followUp && (
            <label style={label}>דוחות או דיווחים שהוא עדיין חייב ללקוח (שורה לכל אחד, אופציונלי)
              <textarea rows={2} value={outstanding} disabled={locked}
                onChange={e => { setOutstanding(e.target.value); sync({ outstanding: e.target.value }); }}
                style={{ marginTop: 4, width: '100%' }} />
            </label>
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
            <textarea ref={bodyRef} rows={14} value={body} disabled={locked}
              onChange={e => { setBody(e.target.value); setEdited(true); }}
              style={{ marginTop: 4, width: '100%', lineHeight: 1.7 }} />
            {hasHighlightMarks(body) && (
              <span style={{ fontSize: 11.5, color: 'var(--gray-500)' }}>
                הקטעים שבין <code>==</code> יופיעו מודגשים בצהוב אצל הנמען.
              </span>
            )}
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

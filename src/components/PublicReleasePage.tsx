// ─── דף הרו"ח הקודם (?release=TOKEN) ────────────────────────────────────────
// המכתב נשלח אליו במייל, והכפתור שבו מוביל לכאן.
//
// ‼ הכרעת גיא (2026-08-18) — הרו"ח הקודם **אינו המשתמש שלנו**, ולכן הדף הזה
// מבקש ממנו דבר אחד: לשלוח את החומרים. מה שירד מהזרימה הרגילה:
//   · החתימה. לא מבקשים אישור ולא חתימה. מי שיש לו מניעה משיב למייל (כלל 16,
//     כתוב במכתב עצמו). חתימות שכבר נאספו ממשיכות להופיע כהיסטוריה, והפונקציה
//     בשרת (release_portal_sign) לא נמחקה.
//   · ההעלאה פריט-פריט. במקומה אזור אחד: קובץ, כמה קבצים או תיקייה.
// מה שנשאר פנימי אצלנו: צ'קליסט החומרים. הוא מוצג כאן כמידע ("מה ביקשנו"),
// ולא כטופס שהוא צריך למלא.
//
// ‼ הוא לא ישלח הכול בבת אחת, וחלק יגיע במייל. הדף נשאר חי לאורך שבועות,
// מקבל העלאות חלקיות, והמשרד ממשיך לסמן ידנית מה שהגיע בדרך אחרת.
//
// ‼ מיתוג המשרד, לא PIVO — כמו כל מה שגורם חיצוני רואה.

import { useEffect, useRef, useState } from 'react';
import { supabase } from '../lib/supabase';
import { flushAccountantNotifications } from '../lib/notifyAccountant';
import { FirmBranding } from '../types/firmProfile';
import { isOptionalMaterialKey } from '../types/onboarding';
import { splitHighlights } from '../utils/releaseLetter';
import { deriveQuotationBrand } from './quotations/quotationBranding';

interface Props {
  token: string;
}

interface ReleaseMaterialRow {
  key: string;
  label: string;
  done: boolean;
  optional?: boolean;
  priority?: boolean;
  uploads?: number;
  /**
   * הוא עצמו הצהיר שזה נשלח. ‼ רק מה שהוא סימן ניתן לביטול על ידו — פריט
   * שהמשרד סימן הוא קביעה של המשרד, וגורם חיצוני אינו מבטל אותה מכאן.
   */
  declaredByRecipient?: boolean;
}

interface ReleaseData {
  firmName: string;
  branding: FirmBranding;
  clientName: string;
  businessName?: string;
  prevAccountantName?: string;
  subject?: string;
  body?: string;
  objectionDueDate?: string;
  objectionWindowPassed?: boolean;
  /** היסטוריה בלבד — הזרימה הרגילה אינה מבקשת חתימה. */
  signed: boolean;
  signedAt?: string;
  signerName?: string;
  responseNote?: string;
  respondedAt?: string;
  responderName?: string;
  materialsStepId?: string;
  materials: ReleaseMaterialRow[];
  materialsDone: number;
  materialsTotal: number;
  /** כמה קבצים כבר הגיעו בהעלאה מרוכזת (בלי שיוך לפריט). */
  bulkUploads?: number;
  /** מה שהוא שלח בפועל — כדי שיראה מה כבר הגיע ולא ישלח שוב את אותו קובץ. */
  uploads?: ReleaseUploadRow[];
  /** עבודות שנשארו בטיפולו (דוח שנתי, הצהרת הון) — כתוב במכתב, ומוצג גם כאן. */
  outstanding?: Array<{ key: string; label: string }>;
}

interface ReleaseUploadRow {
  id: string;
  name: string;
  at?: string;
}

const ACCEPT = '.pdf,.jpg,.jpeg,.png,.webp,.heic,.xls,.xlsx,.csv,.doc,.docx';

/** ‼ אותה תקרה שהשרת אוכף (portal-upload-document). כאן רק כדי לחסוך נסיעה. */
const MAX_BYTES = 10 * 1024 * 1024;

/**
 * שם קובץ בעברית בתוך שורה מימין לשמאל — הסיומת נשברת מהשם.
 * "משרד המשפטים 2.pdf" מוצג כ-"משרד המשפטים.2pdf", כי הנקודה נופלת בין
 * הספרה לאותיות הלטיניות ומקבלת את כיוון השורה. סימון LRM לפני הנקודה מצמיד
 * את הסיומת למה שלפניה, ושם הקובץ נקרא כפי שהוא נכתב.
 *
 * ‼ נכתב כקוד ולא כתו בלתי-נראה בקוד המקור, כדי שלא ייעלם בעריכה.
 */
const LRM = String.fromCharCode(0x200E);

function displayFileName(name: string): string {
  const dot = name.lastIndexOf('.');
  return dot <= 0 ? name : `${name.slice(0, dot)}${LRM}${name.slice(dot)}`;
}

/** גוון חלש של צבע המשרד — רקע כרטיס השליחה בזמן גרירה. */
function tint(hex: string, alpha = .07): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return `rgba(0,0,0,${alpha})`;
  const n = parseInt(m[1], 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${alpha})`;
}

function shortDate(iso?: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? '' : d.toLocaleDateString('he-IL', { day: 'numeric', month: 'short' });
}

/** תקרה לגרירת תיקייה, כדי שתיקייה ענקית לא תיתקע בתור אינסופי. */
const MAX_DROP_FILES = 120;

/** המפתח שאומר לשרת "הקובץ הזה לא משויך לפריט" — ראה portal-upload-document. */
const BULK_KEY = '__unfiled__';

const UPLOAD_ERRORS: Record<string, string> = {
  too_large: 'הקובץ גדול מדי - עד 10MB.',
  type_not_allowed: 'סוג הקובץ הזה לא נתמך. אפשר PDF, תמונה, אקסל או וורד.',
  rate_limited: 'הועלו הרבה קבצים בזמן קצר. אפשר לנסות שוב בעוד כמה דקות.',
};

export default function PublicReleasePage({ token }: Props) {
  const [phase, setPhase] = useState<'loading' | 'invalid' | 'ready'>('loading');
  const [data, setData] = useState<ReleaseData | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const reload = () => setReloadKey(k => k + 1);

  const [letterOpen, setLetterOpen] = useState(false);
  // ── הערה / הסתייגות ────────────────────────────────────────────────────────
  // ‼ ניסוח ניטרלי בכוונה: הדף אינו קובע מה מותר או אסור לרו"ח הקודם. הוא רק
  // פותח ערוץ מסודר לומר משהו — ושומר את מה שנאמר כראיה אצל הרו"ח החדש.
  const [noteOpen, setNoteOpen] = useState(false);
  const [noteText, setNoteText] = useState('');
  const [noteName, setNoteName] = useState('');
  const [noteBusy, setNoteBusy] = useState(false);
  const [noteErr, setNoteErr] = useState<string | null>(null);
  /** נפתח אחרי העלאה מוצלחת — ורק אז. שאלה, לא שלב חובה. */
  const [justUploaded, setJustUploaded] = useState(0);
  /** גוררים קבצים מעל העמוד — כרטיס השליחה נדלק כיעד אחד גדול. */
  const [dropActive, setDropActive] = useState(false);
  /**
   * אישור הקבלה שיושב ליד הכפתור. ‼ נפרד מ-justUploaded בכוונה: אותו state
   * נסגר כשעונים על שאלת ההמשך, והאישור חייב להישאר. בלעדיו הרגע היחיד
   * שאומר "קיבלנו" היה הכרטיס של שאלת ההמשך — שכלל לא מופיע כשאין פריטים
   * פתוחים, ואז שליחה מוצלחת עברה בלי שום סימן.
   */
  const [receipt, setReceipt] = useState(0);
  /** מזהי הקבצים שכבר היו כאן בכניסה — מה שמעבר להם נשלח עכשיו. */
  const seenUploadIds = useRef<Set<string> | null>(null);
  /** סימון/ביטול של פריט ברשימת מה שביקשנו. */
  const [markBusy, setMarkBusy] = useState<string | null>(null);
  const [markErr, setMarkErr] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data: res, error } = await supabase.rpc('get_release_portal', { p_token: token });
      if (cancelled) return;
      const row = res as (ReleaseData & { ok?: boolean }) | null;
      if (error || !row?.ok) { setPhase('invalid'); return; }
      if (seenUploadIds.current === null) {
        seenUploadIds.current = new Set((row.uploads ?? []).map(u => u.id));
      }
      setData(row);
      setPhase('ready');
    })();
    return () => { cancelled = true; };
  }, [token, reloadKey]);

  if (phase === 'loading') {
    return <div style={{ padding: 40, textAlign: 'center', color: '#6b7280' }}>טוען…</div>;
  }
  if (phase === 'invalid' || !data) {
    return (
      <div style={{ padding: 40, textAlign: 'center', maxWidth: 480, margin: '0 auto' }}>
        <h1 style={{ fontSize: 18, marginBottom: 8 }}>הקישור אינו תקין</h1>
        <p style={{ fontSize: 14, color: '#6b7280' }}>
          ייתכן שהוא פג או הוחלף. אפשר להשיב למייל שקיבלת ונשלח קישור חדש.
        </p>
      </div>
    );
  }

  const brand = deriveQuotationBrand({ firmName: data.firmName, branding: data.branding } as never);
  const accent = brand.accent;

  /**
   * ‼ השרת מכריע מה מותר: ביטול אפשרי רק למה שהוא עצמו הצהיר
   * (release_portal_set_item, מיגרציה 121). הדף רק לא מציע את מה שאסור.
   */
  async function setItem(key: string, done: boolean) {
    setMarkErr(null);
    setMarkBusy(key);
    const { data: res, error } = await supabase.rpc('release_portal_set_item', {
      p_token: token, p_key: key, p_done: done,
    });
    setMarkBusy(null);
    const r = res as { ok?: boolean; error?: string } | null;
    if (error || !r?.ok) {
      setMarkErr(r?.error === 'not_yours'
        ? 'הפריט הזה סומן על ידי המשרד - אי אפשר לבטל אותו מכאן.'
        : 'לא הצלחנו לעדכן את הסימון. אפשר לנסות שוב.');
      return;
    }
    flushAccountantNotifications(token);
    reload();
  }

  async function sendNote() {
    setNoteErr(null);
    if (!noteText.trim()) { setNoteErr('צריך לכתוב את ההערה.'); return; }
    setNoteBusy(true);
    const { data: res, error } = await supabase.rpc('release_portal_respond', {
      p_token: token, p_note: noteText.trim(), p_name: noteName.trim() || null,
    });
    setNoteBusy(false);
    const r = res as { ok?: boolean } | null;
    if (error || !r?.ok) { setNoteErr('לא הצלחנו לשלוח את ההערה. אפשר לנסות שוב.'); return; }
    flushAccountantNotifications(token);
    setNoteText('');
    setNoteOpen(false);
    reload();
  }

  // הפריט הפתוח ("חומר נוסף לפי שיקול דעתך") אינו דרישה ואינו נספר. במודל
  // החדש הוא ממילא מיותר כשורה נפרדת — ההעלאה הראשית מקבלת כל דבר.
  const requested = data.materials.filter(m => !(m.optional || isOptionalMaterialKey(m.key)));
  const openItems = requested.filter(m => !m.done);

  const card: React.CSSProperties = {
    background: brand.cardBg, border: `1px solid ${brand.border}`,
    borderRadius: brand.radius + 4, padding: '20px 22px', marginBottom: 16,
  };
  const title: React.CSSProperties = {
    fontSize: 12, fontWeight: 700, letterSpacing: '.04em',
    color: brand.muted, marginBottom: 10,
  };
  const quietLink: React.CSSProperties = {
    border: 'none', background: 'none', padding: 0, cursor: 'pointer',
    fontSize: 13, fontWeight: 600, color: accent, textDecoration: 'underline',
  };

  return (
    <div style={{
      background: brand.pageBg, minHeight: '100vh', padding: '24px 16px',
      fontFamily: `'${brand.font}', sans-serif`, color: brand.ink, direction: 'rtl',
    }}>
      <style>{
        '@media (hover: none), (pointer: coarse) { .release-drop-hint { display: none } }'
      }</style>
      <div style={{ maxWidth: 640, margin: '0 auto' }}>
        <header style={{ marginBottom: 18 }}>
          {/* ‼ אותה כותרת בדיוק כמו בדף האישי של הלקוח — שני העמודים שגורם
              חיצוני רואה. לוגו אם הוגדר, ואם לא — ראשי תיבות ושם המשרד. */}
          {brand.logoUrl ? (
            <img src={brand.logoUrl} alt={data.firmName} style={{
              display: 'block', maxHeight: 40 * brand.logoScale,
              maxWidth: 180 * brand.logoScale, objectFit: 'contain',
            }} />
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
              <div style={{
                width: 32, height: 32, borderRadius: '50%', border: `1.5px solid ${brand.ink}`,
                display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12.5,
              }}>{brand.monogram}</div>
              <div style={{ fontSize: 15, fontWeight: 700 }}>{data.firmName}</div>
            </div>
          )}
          <h1 style={{ fontSize: 21, fontWeight: 700, margin: '10px 0 0', lineHeight: 1.4 }}>
            העברת חומרים - {data.clientName}
          </h1>
          <div style={{ fontSize: 13.5, color: brand.muted, marginTop: 5, lineHeight: 1.7 }}>
            {data.clientName} עובר/ת לטיפולנו. אפשר לשלוח את החומרים כאן - הכול יחד,
            בלי למיין ובלי לסדר.
          </div>
        </header>

        {/* ── 1. הפעולה: העלאה אחת ── */}
        <section style={{
          ...card, borderColor: accent, borderWidth: dropActive ? 2 : 1.5,
          background: dropActive ? tint(accent) : card.background,
          transition: 'background .12s ease',
        }}>
          <div style={title}>שליחת החומרים</div>
          <BulkUpload
            token={token}
            stepId={data.materialsStepId}
            brand={brand}
            accent={accent}
            onUploaded={n => { setJustUploaded(n); setReceipt(n); reload(); }}
            onUploadStart={() => setReceipt(0)}
            onDragActive={setDropActive}
          />
          {!dropActive && (
            <>
              {receipt > 0 && (
                <div style={{
                  marginTop: 14, padding: '11px 13px', borderRadius: brand.radius,
                  background: tint(accent, .09), display: 'flex', gap: 9, alignItems: 'flex-start',
                }}>
                  <span aria-hidden="true" style={{ color: accent, fontSize: 15, lineHeight: 1.4 }}>✓</span>
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 700, color: accent }}>
                      {receipt === 1 ? 'הקובץ התקבל אצלנו' : `${receipt} קבצים התקבלו אצלנו`}
                    </div>
                    <div style={{ fontSize: 12.5, color: accent, marginTop: 2 }}>
                      {receipt === 1 ? 'אפשר לסגור את החלון - שמרנו אותו.'
                        : 'אפשר לסגור את החלון - שמרנו אותם.'}
                    </div>
                  </div>
                </div>
              )}
              <SentFiles
                token={token}
                files={data.uploads ?? []}
                newIds={seenUploadIds.current}
                brand={brand}
                accent={accent}
                onRemoved={reload}
              />
              <p style={{ margin: '14px 0 0', fontSize: 12.5, color: brand.muted, lineHeight: 1.75 }}>
                אפשר לשלוח בכמה פעמים - הקישור נשאר פעיל.
                יש שאלה, או שנוח יותר לשלוח במייל? אפשר פשוט להשיב להודעה ששלחנו.
              </p>
            </>
          )}
        </section>

        {/* ── 2. אחרי העלאה: מה כלל המשלוח (רשות) ── */}
        {justUploaded > 0 && openItems.length > 0 && data.materialsStepId && (
          <WhatWasSent
            token={token}
            items={openItems}
            brand={brand}
            accent={accent}
            onDone={() => { setJustUploaded(0); reload(); }}
            onSkip={() => setJustUploaded(0)}
          />
        )}

        {/* ── 3. מה ביקשנו — מידע, לא טופס ── */}
        {data.materialsStepId && requested.length > 0 && (
          <section style={card}>
            {/* ‼ הוראה אחת קצרה במקום פסקה. האינטראקציה עצמה מלמדת את השאר. */}
            <div style={{ ...title, marginBottom: 4 }}>סמן מה כבר שלחת</div>
            <div style={{ fontSize: 12.5, color: brand.muted, marginBottom: 10 }}>
              {requested.filter(m => m.done).length} מתוך {requested.length}
            </div>
            <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'grid', gap: 2 }}>
              {requested.map(m => (
                <MaterialCheckRow
                  key={m.key}
                  item={m}
                  busy={markBusy === m.key}
                  brand={brand}
                  accent={accent}
                  onToggle={() => void setItem(m.key, !m.done)}
                />
              ))}
            </ul>
            {markErr && (
              <div style={{ marginTop: 10, fontSize: 12.5, color: '#a63a3a' }}>{markErr}</div>
            )}
          </section>
        )}

        {/* ── 4. מה נשאר בטיפולו ── */}
        {/* ‼ לא בקשה ולא צ'קליסט: זה מה שסוכם שהוא מסיים, וכתוב כך במכתב.
            בלעדיו הוא קורא במכתב שהדוח עליו, ורואה עמוד שמדבר רק על חומרים. */}
        {(data.outstanding?.length ?? 0) > 0 && (
          <section style={card}>
            <div style={title}>מה נשאר בטיפולך</div>
            <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'grid', gap: 5 }}>
              {data.outstanding!.map(o => (
                <li key={o.key} style={{
                  display: 'flex', gap: 8, alignItems: 'baseline', fontSize: 13.5, lineHeight: 1.6,
                }}>
                  <span aria-hidden="true" style={{ color: brand.muted, flexShrink: 0 }}>·</span>
                  <span style={{ flex: 1, minWidth: 0 }}>{o.label}</span>
                </li>
              ))}
            </ul>
            <div style={{ marginTop: 10, fontSize: 12.5, color: brand.muted, lineHeight: 1.7 }}>
              עד ההגשה משרדך נשאר המייצג הראשי. נשמח לעדכון אחרי ההגשה ולהעתק
              ממה שהוגש - אפשר לצרף אותו כאן, כמו כל חומר אחר.
            </div>
          </section>
        )}

        {/* ── 5. פעולות שקטות ── */}
        <section style={{ ...card, background: 'transparent', border: 'none', padding: '4px 2px' }}>
          <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'center' }}>
            {data.body && (
              <button type="button" style={quietLink} onClick={() => setLetterOpen(o => !o)}>
                {letterOpen ? 'סגירת המכתב' : 'המכתב המלא'}
              </button>
            )}
            {!noteOpen && (
              <button type="button" style={quietLink}
                onClick={() => { setNoteOpen(true); setNoteName(n => n || data.prevAccountantName || ''); }}>
                {data.responseNote ? 'להוספת הערה נוספת' : 'יש מניעה או הסתייגות'}
              </button>
            )}
          </div>

          {letterOpen && data.body && (
            <div style={{
              marginTop: 12, padding: '16px 18px', background: brand.cardBg,
              border: `1px solid ${brand.border}`, borderRadius: brand.radius + 4,
              fontSize: 13.5, lineHeight: 1.85,
            }}>
              <LetterText text={data.body} ink={brand.ink} />
              {data.objectionDueDate && (
                <div style={{ marginTop: 12, fontSize: 12.5, color: brand.muted }}>
                  אם קיימת מניעה או הסתייגות להעברת התיק - נודה לעדכון עד {formatDate(data.objectionDueDate)}.
                </div>
              )}
              {/* ‼ חתימה שנאספה בעבר — היסטוריה בלבד. לא מבקשים חתימה חדשה. */}
              {data.signed && (
                <div style={{ marginTop: 10, fontSize: 12.5, color: brand.muted }}>
                  נחתם על ידך{data.signerName ? ` · ${data.signerName}` : ''}
                  {data.signedAt ? ` · ${formatDate(data.signedAt)}` : ''}
                </div>
              )}
            </div>
          )}

          {data.responseNote && (
            <div style={{
              marginTop: 12, padding: '10px 12px', borderRadius: brand.radius,
              background: '#fbf3e3', fontSize: 13.5, lineHeight: 1.7, color: brand.ink,
            }}>
              <div style={{ fontWeight: 700, marginBottom: 3 }}>
                ההערה שלך נשלחה
                {data.responderName && ` · ${data.responderName}`}
                {data.respondedAt && ` · ${formatDate(data.respondedAt)}`}
              </div>
              <div style={{ whiteSpace: 'pre-line' }}>{data.responseNote}</div>
            </div>
          )}

          {noteOpen && (
            <div style={{
              display: 'grid', gap: 8, marginTop: 12, padding: '16px 18px',
              background: brand.cardBg, border: `1px solid ${brand.border}`,
              borderRadius: brand.radius + 4,
            }}>
              <p style={{ margin: 0, fontSize: 13.5, color: brand.muted, lineHeight: 1.7 }}>
                מה שחשוב שנדע - הסתייגות, מניעה, חוב פתוח, דוח שטרם הוגש, או כל דבר אחר.
                ההערה מגיעה ישירות אלינו ונשמרת בתיק.
              </p>
              <input
                value={noteName} onChange={e => setNoteName(e.target.value)} placeholder="השם שלך"
                style={{
                  padding: '8px 10px', fontSize: 14, color: brand.ink, maxWidth: 320,
                  border: `1px solid ${brand.border}`, borderRadius: brand.radius, background: '#fff',
                }} />
              <textarea
                value={noteText} onChange={e => setNoteText(e.target.value)} rows={4}
                placeholder="מה שחשוב שנדע"
                style={{
                  padding: '8px 10px', fontSize: 14, color: brand.ink, lineHeight: 1.7,
                  border: `1px solid ${brand.border}`, borderRadius: brand.radius, background: '#fff',
                  fontFamily: 'inherit', resize: 'vertical',
                }} />
              {noteErr && <span style={{ fontSize: 12.5, color: '#a63a3a' }}>{noteErr}</span>}
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <button type="button" onClick={() => void sendNote()} disabled={noteBusy} style={{
                  border: 'none', cursor: noteBusy ? 'default' : 'pointer',
                  fontSize: 13.5, fontWeight: 600, padding: '9px 22px',
                  color: '#fff', background: accent, borderRadius: brand.radius, opacity: noteBusy ? .6 : 1,
                }}>{noteBusy ? 'שולח…' : 'שליחת ההערה'}</button>
                <button type="button" onClick={() => { setNoteOpen(false); setNoteErr(null); }} disabled={noteBusy}
                  style={{
                    border: `1px solid ${brand.border}`, background: '#fff', cursor: 'pointer',
                    fontSize: 13.5, padding: '9px 18px', color: brand.ink, borderRadius: brand.radius,
                  }}>ביטול</button>
              </div>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

/** גוף המכתב עם ההדגשות שסומנו בו (`==כך==`) — טקסט בלבד, בלי HTML מהמסד. */
function LetterText({ text, ink }: { text: string; ink: string }) {
  return (
    <div style={{ whiteSpace: 'pre-line' }}>
      {text.split('\n').map((line, i) => (
        <div key={i}>
          {splitHighlights(line).map((part, j) => (
            part.mark
              ? <span key={j} style={{ background: '#fdf3c4', padding: '0 3px', borderRadius: 2, color: ink }}>{part.text}</span>
              : <span key={j}>{part.text}</span>
          ))}
          {!line.trim() && ' '}
        </div>
      ))}
    </div>
  );
}

/** הסיומות ש-ACCEPT מתיר — לסינון גרירה, שבה חלון המחשב לא מסנן בשבילנו. */
const ACCEPTED_EXTS = ACCEPT.split(',').map(s => s.trim().toLowerCase());

const isAccepted = (name: string) =>
  ACCEPTED_EXTS.some(ext => name.toLowerCase().endsWith(ext));

/**
 * קריאת תיקייה שנגררה, על כל תת-התיקיות שלה.
 *
 * ‼ קיים רק בגרירה. חלון הבחירה של המחשב הוא או קבצים או תיקייה, לא שניהם,
 * ולכן הכפתור מציע קבצים (הדבר הנפוץ) והתיקייה נתמכת דרך גרירה.
 */
async function collectEntry(entry: FileSystemEntry | null, out: File[]): Promise<void> {
  if (!entry || out.length >= MAX_DROP_FILES) return;
  if (entry.isFile) {
    const file = await new Promise<File | null>(resolve => {
      (entry as FileSystemFileEntry).file(f => resolve(f), () => resolve(null));
    });
    if (file) out.push(file);
    return;
  }
  const reader = (entry as FileSystemDirectoryEntry).createReader();
  for (;;) {
    const batch = await new Promise<FileSystemEntry[]>(resolve => {
      reader.readEntries(e => resolve(e), () => resolve([]));
    });
    if (batch.length === 0) return;
    for (const child of batch) await collectEntry(child, out);
  }
}

async function filesFromDrop(dt: DataTransfer): Promise<File[]> {
  const entries = Array.from(dt.items)
    .filter(i => i.kind === 'file')
    .map(i => (typeof i.webkitGetAsEntry === 'function' ? i.webkitGetAsEntry() : null));

  if (entries.some(Boolean)) {
    const out: File[] = [];
    for (const entry of entries) await collectEntry(entry, out);
    return out;
  }
  return Array.from(dt.files);
}

/**
 * שורה אחת ברשימת "סמן מה כבר שלחת".
 *
 * ‼ צ'קבוקס, לא עיגול. העיגול הקטן נראה כמו סימן מצב פסיבי ולא כמו משהו
 * שאפשר ללחוץ עליו — הרו"ח הקודם לא הבין שמבקשים ממנו לסמן. עכשיו: תיבה
 * מרובעת עם מסגרת, **כל השורה** היא היעד, ויש מצב ריחוף וריכוז.
 *
 * ‼ פריט שהמשרד סימן אינו כפתור כלל — לא מעומעם ולא נעול, פשוט טקסט עם ✓.
 * גורם חיצוני אינו מבטל קביעה של המשרד, וזה נאכף גם בשרת.
 */
function MaterialCheckRow({ item, busy, brand, accent, onToggle }: {
  item: ReleaseMaterialRow; busy: boolean;
  brand: { ink: string; muted: string; border: string; radius: number };
  accent: string; onToggle: () => void;
}) {
  const [hover, setHover] = useState(false);
  const editable = !item.done || !!item.declaredByRecipient;

  const label = (
    <span style={{ flex: 1, minWidth: 0, lineHeight: 1.5 }}>
      <span style={{
        color: item.done ? brand.muted : brand.ink,
        textDecoration: item.done ? 'line-through' : 'none',
      }}>{item.label}</span>
      {item.priority && !item.done && (
        <span style={{
          marginInlineStart: 7, fontSize: 11, fontWeight: 700, whiteSpace: 'nowrap',
          background: '#fdf3c4', color: brand.ink, padding: '1px 7px', borderRadius: 999,
        }}>חשוב במיוחד</span>
      )}
    </span>
  );

  const box = (
    <span aria-hidden="true" style={{
      flex: '0 0 auto', width: 20, height: 20, borderRadius: 5,
      border: `1.5px solid ${item.done ? accent : (hover ? accent : brand.border)}`,
      background: item.done ? accent : '#fff',
      color: '#fff', fontSize: 13, fontWeight: 700, lineHeight: '17px', textAlign: 'center',
      transition: 'border-color .12s, background .12s',
    }}>{item.done ? '✓' : ''}</span>
  );

  if (!editable) {
    return (
      <li style={{
        display: 'flex', gap: 10, alignItems: 'center', fontSize: 13.5,
        padding: '9px 10px', color: brand.muted,
      }}>
        {box}
        {label}
        <span style={{ fontSize: 11.5, flex: '0 0 auto' }}>סומן אצלנו</span>
      </li>
    );
  }

  return (
    <li>
      <button
        type="button"
        role="checkbox"
        aria-checked={item.done}
        disabled={busy}
        onClick={onToggle}
        onMouseEnter={() => setHover(true)}
        onMouseLeave={() => setHover(false)}
        onFocus={() => setHover(true)}
        onBlur={() => setHover(false)}
        style={{
          // ‼ כל השורה היא היעד — לא הסימן. בטלפון אי אפשר לכוון לתיבה של 20px.
          display: 'flex', gap: 10, alignItems: 'center', width: '100%',
          minHeight: 44, padding: '9px 10px', textAlign: 'start',
          font: 'inherit', fontSize: 13.5, color: brand.ink,
          background: hover ? tint(accent, .06) : 'transparent',
          border: 'none', borderRadius: brand.radius,
          cursor: busy ? 'default' : 'pointer', opacity: busy ? .5 : 1,
          transition: 'background .12s',
        }}
      >
        {box}
        {label}
      </button>
    </li>
  );
}

/**
 * מה שכבר נשלח — רשימה, לא מונה.
 *
 * ‼ הוא שולח לאורך שבועות ובכמה פעימות. מונה ("התקבלו 3 קבצים") לא אומר לו
 * אם הקובץ שהוא עומד לשלוח כבר נשלח, והתוצאה היא כפילויות אצלנו.
 * ‼ ההסרה רכה — היא מורידה מהרשימה שלו ולא מוחקת אצלנו. ראה מיגרציה 119.
 */
function SentFiles({ token, files, newIds, brand, accent, onRemoved }: {
  token: string; files: ReleaseUploadRow[];
  /** מה שכבר היה כאן בכניסה. מה שלא ברשימה — נשלח בביקור הזה. */
  newIds: Set<string> | null;
  brand: { ink: string; muted: string; border: string; radius: number };
  accent: string; onRemoved: () => void;
}) {
  const [confirming, setConfirming] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  if (files.length === 0) return null;

  async function remove(id: string) {
    setErr(null);
    setBusyId(id);
    const { data, error } = await supabase.rpc('release_portal_remove_upload', {
      p_token: token, p_document_id: id,
    });
    setBusyId(null);
    setConfirming(null);
    const res = data as { ok?: boolean } | null;
    if (error || !res?.ok) { setErr('לא הצלחנו להסיר את הקובץ. אפשר לנסות שוב.'); return; }
    onRemoved();
  }

  const action: React.CSSProperties = {
    border: 'none', background: 'none', padding: 0, cursor: 'pointer',
    fontSize: 12, fontWeight: 600, color: brand.muted, textDecoration: 'underline',
    flex: '0 0 auto',
  };

  return (
    <div style={{ marginTop: 16 }}>
      <div style={{ fontSize: 12.5, color: brand.muted, marginBottom: 7 }}>
        מה שכבר שלחת ({files.length})
      </div>
      <ul style={{
        margin: 0, padding: 0, listStyle: 'none', display: 'grid', gap: 1,
        border: `1px solid ${brand.border}`, borderRadius: brand.radius, overflow: 'hidden',
      }}>
        {files.map(f => (
          <li key={f.id} style={{
            display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap',
            fontSize: 13, padding: '9px 12px', background: '#fff',
            borderBottom: `1px solid ${brand.border}`,
          }}>
            <span aria-hidden="true" style={{ color: accent, flex: '0 0 auto' }}>✓</span>
            <span style={{ flex: 1, minWidth: 0, overflowWrap: 'anywhere', color: brand.ink }}>
              {displayFileName(f.name)}
            </span>
            {newIds && !newIds.has(f.id) ? (
              <span style={{
                fontSize: 11, fontWeight: 700, whiteSpace: 'nowrap', flex: '0 0 auto',
                padding: '1px 8px', borderRadius: 999,
                background: tint(accent, .12), color: accent,
              }}>נשלח עכשיו</span>
            ) : f.at && (
              <span style={{ fontSize: 11.5, color: brand.muted, flex: '0 0 auto' }}>
                {shortDate(f.at)}
              </span>
            )}
            {confirming === f.id ? (
              <span style={{ display: 'flex', gap: 10, alignItems: 'center', flex: '0 0 auto' }}>
                <button type="button" style={{ ...action, color: '#a63a3a' }}
                  disabled={busyId === f.id} onClick={() => void remove(f.id)}>
                  {busyId === f.id ? 'מסיר…' : 'להסיר'}
                </button>
                <button type="button" style={action} onClick={() => setConfirming(null)}>
                  ביטול
                </button>
              </span>
            ) : (
              <button type="button" style={action} onClick={() => setConfirming(f.id)}>
                הסרה
              </button>
            )}
          </li>
        ))}
      </ul>
      {err && (
        <div style={{ marginTop: 8, fontSize: 12.5, color: '#a63a3a' }}>{err}</div>
      )}
      <div style={{ marginTop: 8, fontSize: 12, color: brand.muted, lineHeight: 1.7 }}>
        הסרה מורידה את הקובץ מהרשימה כאן. אם הסרת בטעות - אפשר פשוט לשלוח שוב.
      </div>
    </div>
  );
}

/**
 * אזור ההעלאה הראשי — קובץ, כמה קבצים או תיקייה.
 *
 * ‼ תור סדרתי ולא הצפה במקביל: לשרת יש תקרת קבצים לשעה, והעלאה מקבילה של
 * תיקייה הייתה נחסמת באמצע בלי שאיש יידע אילו קבצים עברו. כאן כל קובץ מקבל
 * שורה משלו עם התוצאה שלו — מה שנכשל נשאר על המסך ואפשר לנסות אותו שוב.
 * ‼ שום ולידציה לא נחלשה: מה שנשלח עובר בדיוק את אותה פונקציה ואת אותן
 * בדיקות (סוג, גודל, טוקן) כמו קודם. מה שהשתנה הוא שאין צורך לומר מראש
 * לאיזה פריט הקובץ שייך.
 * ‼ הגרירה נתפסת על כל העמוד ולא רק על הכרטיס: שחרור קובץ מחוץ ליעד גורם
 * לדפדפן לפתוח את הקובץ במקום הדף, והרו"ח הקודם מאבד את הקישור.
 */
function BulkUpload({ token, stepId, brand, accent, onUploaded, onUploadStart, onDragActive }: {
  token: string; stepId?: string;
  brand: { ink: string; muted: string; border: string; radius: number };
  accent: string; onUploaded: (count: number) => void;
  onUploadStart: () => void;
  onDragActive: (active: boolean) => void;
}) {
  type Row = { name: string; status: 'pending' | 'uploading' | 'ok' | 'err'; error?: string };
  const [rows, setRows] = useState<Row[]>([]);
  const [busy, setBusy] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [skipped, setSkipped] = useState(0);
  const busyRef = useRef(false);
  const dragDepth = useRef(0);

  async function uploadOne(file: File): Promise<string | null> {
    if (file.size > MAX_BYTES) return UPLOAD_ERRORS.too_large;
    const form = new FormData();
    form.append('token', token);
    form.append('tokenKind', 'release');
    form.append('stepId', stepId!);
    form.append('itemKey', BULK_KEY);
    form.append('file', file);
    const { data, error } = await supabase.functions.invoke('portal-upload-document', { body: form });
    const res = data as { ok?: boolean; error?: string } | null;
    if (error || !res?.ok) return UPLOAD_ERRORS[res?.error ?? ''] ?? 'ההעלאה נכשלה.';
    return null;
  }

  async function handleFiles(incoming: File[], dropped = false) {
    if (!stepId || busyRef.current) return;
    const usable = incoming.filter(f => f.size > 0);
    const files = dropped ? usable.filter(f => isAccepted(f.name)) : usable;
    setSkipped(dropped ? usable.length - files.length : 0);
    if (files.length === 0) return;
    onUploadStart();
    setRows(files.map(f => ({ name: f.name, status: 'pending' as const })));
    busyRef.current = true;
    setBusy(true);
    let succeeded = 0;
    for (let i = 0; i < files.length; i++) {
      setRows(prev => prev.map((r, idx) => (idx === i ? { ...r, status: 'uploading' } : r)));
      const err = await uploadOne(files[i]);
      setRows(prev => prev.map((r, idx) => (
        idx === i ? { ...r, status: err ? 'err' : 'ok', error: err ?? undefined } : r)));
      if (!err) succeeded++;
    }
    busyRef.current = false;
    setBusy(false);
    if (succeeded > 0) { flushAccountantNotifications(token); onUploaded(succeeded); }
  }

  useEffect(() => {
    if (!stepId) return;
    const carriesFiles = (e: DragEvent) =>
      Array.from(e.dataTransfer?.types ?? []).includes('Files');

    const onEnter = (e: DragEvent) => {
      if (!carriesFiles(e)) return;
      e.preventDefault();
      dragDepth.current++;
      if (!busyRef.current) { setDragging(true); onDragActive(true); }
    };
    const onOver = (e: DragEvent) => { if (carriesFiles(e)) e.preventDefault(); };
    const clear = () => { dragDepth.current = 0; setDragging(false); onDragActive(false); };
    const onLeave = (e: DragEvent) => {
      if (!carriesFiles(e)) return;
      dragDepth.current = Math.max(0, dragDepth.current - 1);
      if (dragDepth.current === 0) clear();
    };
    const onDrop = (e: DragEvent) => {
      if (!carriesFiles(e)) return;
      e.preventDefault();
      clear();
      if (e.dataTransfer) void filesFromDrop(e.dataTransfer).then(files => handleFiles(files, true));
    };

    window.addEventListener('dragenter', onEnter);
    window.addEventListener('dragover', onOver);
    window.addEventListener('dragleave', onLeave);
    window.addEventListener('drop', onDrop);
    return () => {
      window.removeEventListener('dragenter', onEnter);
      window.removeEventListener('dragover', onOver);
      window.removeEventListener('dragleave', onLeave);
      window.removeEventListener('drop', onDrop);
    };
  }, [stepId]);

  const failed = rows.filter(r => r.status === 'err').length;
  const okCount = rows.filter(r => r.status === 'ok').length;
  const doneAll = rows.length > 0 && !busy;
  const visibleRows = busy ? rows : rows.filter(r => r.status === 'err');

  const primary: React.CSSProperties = {
    cursor: busy ? 'default' : 'pointer', fontSize: 15, fontWeight: 700,
    padding: '13px 30px', color: '#fff', background: accent,
    border: 'none', borderRadius: brand.radius, opacity: busy ? .6 : 1,
    display: 'inline-block', textAlign: 'center',
  };

  if (!stepId) {
    return (
      <div style={{ fontSize: 13.5, color: brand.muted, lineHeight: 1.7 }}>
        אפשר להשיב למייל ששלחנו ולצרף את הקבצים - נשמח לקבל אותם כך.
      </div>
    );
  }

  if (dragging) {
    return (
      <div style={{
        minHeight: 118, display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center', textAlign: 'center',
        gap: 8, padding: '20px 14px',
        border: `1.5px solid ${accent}`, borderRadius: brand.radius + 2,
        background: tint(accent, .1),
      }}>
        <svg width="26" height="26" viewBox="0 0 24 24" fill="none" aria-hidden="true"
          stroke={accent} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 3v12" />
          <path d="M7 11l5 5 5-5" />
          <path d="M4 20h16" />
        </svg>
        <div style={{ fontSize: 16, fontWeight: 700, color: accent }}>
          שחררו כאן ונתחיל לקבל
        </div>
        <div style={{ fontSize: 12.5, color: accent, opacity: .85 }}>
          אפשר לשחרר גם תיקייה שלמה
        </div>
      </div>
    );
  }

  return (
    <div>
      <input id="bulk-files" type="file" accept={ACCEPT} multiple disabled={busy}
        style={{ display: 'none' }}
        onChange={e => { void handleFiles(Array.from(e.target.files ?? [])); e.target.value = ''; }} />
      <label htmlFor="bulk-files" style={primary}>
        {busy ? 'מעלה…' : 'בחירת קבצים לשליחה'}
      </label>

      {/* הרמז מוצג רק במחשב — בטלפון אין גרירה והשורה רק מבלבלת. */}
      <div className="release-drop-hint" style={{ fontSize: 12.5, color: brand.muted, marginTop: 10 }}>
        אפשר גם לגרור לכאן קבצים או תיקייה שלמה
      </div>

      {skipped > 0 && (
        <div style={{ marginTop: 10, fontSize: 12.5, color: brand.muted, lineHeight: 1.7 }}>
          {skipped === 1 ? 'קובץ אחד דולג' : `${skipped} קבצים דולגו`} - סוג הקובץ
          לא נתמך. אפשר PDF, תמונה, אקסל או וורד.
        </div>
      )}

      {/* ‼ אחרי שהכול עבר בהצלחה הרשימה הזו נעלמת — הקבצים כבר מופיעים
          ב"מה שכבר שלחת", ושתי רשימות זהות זו לזו רק מבלבלות. מה שנכשל
          נשאר, כי הוא לא נמצא בשום מקום אחר. */}
      {visibleRows.length > 0 && (
        <div style={{ marginTop: 14 }}>
          <div style={{ fontSize: 12.5, color: brand.muted, marginBottom: 6 }}>
            {busy
              ? `מעלה ${Math.min(okCount + failed + 1, rows.length)} מתוך ${rows.length}…`
              : `${failed} מתוך ${rows.length} לא נשלחו`}
          </div>
          <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'grid', gap: 3 }}>
            {visibleRows.map((r, i) => (
              <li key={`${r.name}-${i}`} style={{
                display: 'flex', gap: 8, alignItems: 'baseline', fontSize: 12.5,
                color: r.status === 'err' ? '#a63a3a' : brand.ink,
              }}>
                <span aria-hidden="true" style={{ color: r.status === 'ok' ? accent : brand.muted }}>
                  {r.status === 'ok' ? '✓' : r.status === 'err' ? '!' : r.status === 'uploading' ? '…' : '○'}
                </span>
                <span style={{ flex: 1, minWidth: 0, overflowWrap: 'anywhere' }}>
                  {displayFileName(r.name)}
                </span>
                {r.error && <span style={{ flex: '0 0 auto' }}>{r.error}</span>}
              </li>
            ))}
          </ul>
          {doneAll && failed > 0 && (
            <div style={{ marginTop: 8, fontSize: 12.5, color: brand.muted, lineHeight: 1.7 }}>
              מה שנכשל לא נשמר - אפשר לבחור את הקבצים האלה שוב, או לשלוח אותם במייל.
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * "מה כלל המשלוח?" — שאלת רשות אחת אחרי העלאה מוצלחת.
 *
 * ‼ אינה חוסמת דבר ואפשר לדלג עליה. מה שסומן נרשם אצלנו כהתקבל — אותה רמת
 * אמון בדיוק כמו ההעלאה פר-פריט שהייתה כאן קודם (גם שם איש לא בדק שהקובץ הוא
 * באמת מה שביקשנו). המשרד רואה שהסימון הוא הצהרה, ויכול לתקן.
 */
function WhatWasSent({ token, items, brand, accent, onDone, onSkip }: {
  token: string; items: ReleaseMaterialRow[];
  brand: { ink: string; muted: string; border: string; radius: number; cardBg: string };
  accent: string; onDone: () => void; onSkip: () => void;
}) {
  const [picked, setPicked] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const toggle = (key: string) =>
    setPicked(p => (p.includes(key) ? p.filter(k => k !== key) : [...p, key]));

  async function submit() {
    setErr(null);
    if (picked.length === 0) { onSkip(); return; }
    setBusy(true);
    const { data, error } = await supabase.rpc('release_portal_mark_items', {
      p_token: token, p_keys: picked,
    });
    setBusy(false);
    const res = data as { ok?: boolean } | null;
    if (error || !res?.ok) { setErr('לא הצלחנו לשמור את הסימון. אפשר לדלג - הקבצים כבר הגיעו.'); return; }
    flushAccountantNotifications(token);
    onDone();
  }

  return (
    <section style={{
      background: brand.cardBg, border: `1px solid ${accent}`,
      borderRadius: brand.radius + 4, padding: '18px 20px', marginBottom: 16,
    }}>
      <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 4 }}>הקבצים התקבלו, תודה</div>
      <p style={{ margin: '0 0 12px', fontSize: 13.5, color: brand.muted, lineHeight: 1.7 }}>
        אם נוח - אפשר לסמן מה המשלוח כלל. זה עוזר לנו לדעת מה עוד חסר, ואפשר גם לדלג.
      </p>
      <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'grid', gap: 4 }}>
        {items.map(m => (
          <li key={m.key}>
            <label style={{
              display: 'flex', gap: 8, alignItems: 'baseline', fontSize: 13.5,
              cursor: 'pointer', lineHeight: 1.6,
            }}>
              <input type="checkbox" checked={picked.includes(m.key)} disabled={busy}
                onChange={() => toggle(m.key)} style={{ flexShrink: 0 }} />
              <span>
                {m.label}
                {m.priority && (
                  <span style={{
                    marginInlineStart: 7, fontSize: 11, fontWeight: 700, whiteSpace: 'nowrap',
                    background: '#fdf3c4', color: brand.ink, padding: '1px 7px', borderRadius: 999,
                  }}>חשוב במיוחד</span>
                )}
              </span>
            </label>
          </li>
        ))}
      </ul>
      {err && <div style={{ marginTop: 8, fontSize: 12.5, color: '#a63a3a' }}>{err}</div>}
      <div style={{ display: 'flex', gap: 8, marginTop: 14, flexWrap: 'wrap' }}>
        <button type="button" onClick={() => void submit()} disabled={busy} style={{
          border: 'none', cursor: busy ? 'default' : 'pointer',
          fontSize: 13.5, fontWeight: 600, padding: '9px 22px',
          color: '#fff', background: accent, borderRadius: brand.radius, opacity: busy ? .6 : 1,
        }}>{busy ? 'שומר…' : picked.length ? `סימון ${picked.length} פריטים` : 'סיימתי'}</button>
        <button type="button" onClick={onSkip} disabled={busy} style={{
          border: `1px solid ${brand.border}`, background: '#fff', cursor: 'pointer',
          fontSize: 13.5, padding: '9px 18px', color: brand.ink, borderRadius: brand.radius,
        }}>דילוג</button>
      </div>
    </section>
  );
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
}

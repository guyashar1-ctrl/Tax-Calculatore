// ─── הדף האישי של הלקוח (?portal=TOKEN) ─────────────────────────────────────
// קישור אחד קבוע לכל תקופת הקליטה: מה הושלם, מה ממתין ללקוח (עם כפתור לכל
// פעולה), מה בטיפול המשרד, ומה יופיע בהמשך. כל תזכורת שולחת שוב את אותו
// קישור — והדף תמיד מציג את המצב העדכני.
//
// ‼ הדף הוא מפה, לא מפתח-על: הפעולות עצמן ממשיכות דרך הקישורים הממודרים
// הקיימים (?onboard= / ?sign= / ?intake= / כתובות פייפרלס). השרת
// (get_client_portal) הוא שמחליט מה מוצג — העמוד רק מצייר.
//
// ‼ מיתוג המשרד, לא PIVO — כמו כל מה שהלקוח רואה.

import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { FirmBranding } from '../types/firmProfile';
import { MESSAGE_DEFAULT_TITLE } from '../lib/sendDocuments';
import { deriveQuotationBrand } from './quotations/quotationBranding';
import EmailInput from './ui/EmailInput';
import RepApprovalGuide, { RepApprovalGuideButton, repApprovalCard, type RepApprovalPerson } from './portal/RepApprovalGuide';
import { PhotoGuideButton } from './portal/PhotoGuide';
import PhotoGuideDialog from './portal/PhotoGuideDialog';
import { photoGuideFor } from './portal/photoGuides';
import { linkHost } from '../features/links/linkDestinations';
import { REP_PORTAL_CARD_FIXED } from '../../supabase/functions/_shared/repTemplates.ts';
import './portal/portalPage.css';
import HomeOfficeForm from '../features/requests/HomeOfficeForm';
import type { ValidHomeOffice } from '../features/requests/homeOffice';
import { groupPortalItems, portalChildTitle, portalGroupStatus, type PortalGroup } from '../features/requests/requestGroups';
import {
  livePortalActions, loadClientPortal, officeViewActions, samplePortalActions, SAMPLE_SIMULATED_TEXT,
  type PortalActions, type PortalLinkedKind, type PortalMode,
} from './portal/portalActions';

interface Props {
  token: string;
}

type Bucket = 'action' | 'office' | 'done' | 'future';

/**
 * ‼ שלושה מצבים לאותו עמוד (D4):
 *   live       — הלקוח האמיתי. הדף הציבורי (ברירת המחדל שמיוצאת מכאן) תמיד כזה, ואינו יכול לקבל sample.
 *   sample     — «צפייה» בספרייה: הכול נפתח ומגיב מקומית; שום פעולה לא יוצאת (portalActions.samplePortalActions).
 *   officeView — הרו"ח בתיק של לקוח אמיתי: הכול נפתח לקריאה, כל הפקדים כבויים.
 */
const PortalModeCtx = createContext<PortalMode>('officeView');
/** כל פעולה של הלקוח עוברת כאן — הרכיבים אינם פונים לשרת בעצמם. */
const PortalActionsCtx = createContext<PortalActions>(officeViewActions);

function usePortal() {
  const mode = useContext(PortalModeCtx);
  const actions = useContext(PortalActionsCtx);
  return { mode, actions, readOnly: mode === 'officeView', sample: mode === 'sample' };
}

/** ‼ המשפט שמתחת לכפתור שנלחץ בדוגמה — «כאן הלקוח היה שולח», בלי להישמע כשגיאה. */
function SimulatedNote({ color }: { color: string }) {
  return <span data-testid="portal-simulated" role="status" style={{ display: 'block', fontSize: 12.5, lineHeight: 1.5, color }}>{SAMPLE_SIMULATED_TEXT}</span>;
}

/** תג טיוטה — מופיע רק בתצוגה המקדימה, על בקשות שטרם פורסמו. */
function DraftChip() {
  return (
    <span style={{
      flexShrink: 0, fontSize: 11, fontWeight: 700, lineHeight: 1.6,
      padding: '0 7px', borderRadius: 999, whiteSpace: 'nowrap',
      color: '#b45309', background: '#fff7ed', border: '1px solid #fbbf77',
    }}>טיוטה</span>
  );
}

/** תג "יוסר" — מופיע רק בתצוגה המקדימה (מיגרציה 101), על בקשות שסומנו
 *  להסרה בעדכון הבא. הפריט עצמו עדיין מוצג — כדי שהעורך יראה מה נעלם. */
function RemovingChip() {
  return (
    <span style={{
      flexShrink: 0, fontSize: 11, fontWeight: 700, lineHeight: 1.6,
      padding: '0 7px', borderRadius: 999, whiteSpace: 'nowrap',
      color: '#a63a3a', background: '#fdeaea', border: '1px solid #e8b4b4',
      textDecoration: 'line-through',
    }}>יוסר</span>
  );
}

export interface PortalItem {
  bucket: Bucket;
  key: string;
  label: string;
  sub?: string;
  /** 'portal' = הפעולה נעשית כאן בעמוד, בלי לנווט לטוקן אחר. */
  actionKind?: 'onboard' | 'sign' | 'intake' | 'external' | 'quote' | 'portal';
  actionValue?: string;
  /**
   * מה בדיוק הפעולה בתוך העמוד.
   * ‼ 'info' — הכדור אצל הלקוח אבל הפעולה עצמה קורית מחוץ לדף (בפייפרלס),
   * ולכן כרטיס בלי שום פקד: אין לנו מה לאמת, ואישור-דמה היה מידע כוזב.
   */
  /* ‼ 'declare' — הוראות + הצהרה. הפעולה קורית מחוץ לדף (בפייפרלס ובאתר
     רשות המסים), אבל בניגוד ל-'info' יש מה לאשר: הלקוח הוא היחיד שיודע
     שהיא בוצעה, וההצהרה שלו היא מה שסוגר את הבקשה. */
  /* ‼ 'message' — הודעה מהמשרד, בלי שום פעולה ובלי מונה. היא אינה יושבת תחת
     «מה צריך ממך» (אין מה לעשות) ולא תחת «בטיפול המשרד» (לא בהכרח מטפלים
     במשהו) — יש לה מקום שקט משלה. יורדת מהדף כשהמשרד סוגר אותה. */
  kind?: 'documents' | 'prev_accountant' | 'custom' | 'paperless_signup' | 'guide' | 'info' | 'declare' | 'message'
    /* ‼ 208 · שע״ם דורשת צילום תעודה, ובתיק כבר יש אחד: הלקוח רואה אותו ומאשר
       שהוא שלו, או מעלה אחר. קיום הקובץ אינו אישור. */
    | 'identity_confirm'
    /* ‼ 220 · «פרטי העסק» — שם העסק ושאלון עבודה מהבית, נשלחים יחד למשרד. */
    | 'business_details';
  /**
   * פרטי הרו״ח הקודם שכבר בכרטיס — מילוי-מראש לאישור. כמו businessName:
   * מקור האמת הוא הכרטיס, ומה שהלקוח שולח חוזר אליו (וגובר, מיגרציה 115).
   */
  prefill?: { name?: string; email?: string; phone?: string };
  /** חומר עזר של המשרד — הקובץ העדכני, נפתר בשרת בכל טעינה. */
  resourceUrl?: string;
  resourceKey?: string;
  /**
   * מיגרציה 144 — כמה קבצים בבקשה אחת, משני מקורות.
   * ‼ `url` קיים רק לקובץ מספריית המשרד (ציבורי). קובץ מהתיק של הלקוח פרטי,
   * ולכן מגיע כ-`documentId` בלבד ונפתח דרך portal-open-document, שחותם
   * קישור זמני אחרי שהוא מוודא שהקובץ אכן נשלח ללקוח הזה.
   * `key` הוא גם מפתח הדרישה שנסגרת בפתיחה — ולכן `done` הוא "כבר נפתח".
   */
  resources?: {
    key: string;
    label: string;
    url?: string;
    documentId?: string;
    fileName?: string;
    done: boolean;
  }[];
  /** מזהה הבקשה שהקבצים שייכים לה. ‼ נמסר גם אחרי שהיא נסגרה — בלעדיו קובץ
   *  פרטי היה מאבד את הדרך להיפתח בדיוק כשהוא עובר ל«מסמכים שימושיים». */
  stepId?: string;
  /** קישור יוצא שנלווה לפעולה בעמוד (הרשמה לפייפרלס). אינו מחליף את ההשלמה. */
  linkUrl?: string;
  /** ‼ מה כתוב על הקישור. "למדריך המלא" נכון למדריך, ושקר כשהקישור מוביל
   *  לאתר שבו הלקוח מבצע את הפעולה עצמה (האזור האישי ברשות המסים). */
  linkLabel?: string;
  /**
   * שם העסק — נשאל בכרטיס ההרשמה לפייפרלס, כי זה מה שהמשרד מזין שם.
   * ‼ מקור האמת הוא clients.business_name: הערך כאן הוא מילוי-מראש לאישור,
   * ומה שנשלח חוזר לאותו שדה עצמו ולא נשמר על הבקשה.
   */
  needsBusinessName?: boolean;
  businessName?: string;
  /** 220 · התשובות האחרונות על עבודה מהבית — מילוי-מראש לתיקון. */
  homeOffice?: { hasDedicatedRoom: boolean; totalRooms: number | null; businessRooms: number | null; note: string | null } | null;
  /** רשימת המסמכים שביקשנו — מה התקבל ומה עוד חסר. */
  checklist?: { key: string; label: string; done: boolean; /** 204 · למה מבקשים — למשל «נדרש על ידי רשות המסים להשלמת הייצוג». */ note?: string }[];
  /** דרישות של בקשה חופשית — שדות בתוך בקשה אחת, כל אחד עם סוג ו-חובה/רשות. */
  requirements?: {
    key: string;
    kind: 'confirm' | 'text' | 'email' | 'phone' | 'number' | 'date' | 'select' | 'file' | 'files';
    label: string;
    done: boolean;
    required?: boolean;
    options?: string[];
    maxFiles?: number;
    fileCount?: number;
    value?: string;
  }[];
  /** הסבר מלא שנפתח עם הבקשה — למה זה נדרש ומה בדיוק לעשות. */
  note?: string;
  /** שורות "שם ומספר" להעתקה (קוד מוסד בהרשאה לחיוב חשבון, מספר תיק וכד'). */
  refs?: { label: string; value: string }[];
  /** משפט הסגירה שאחרי הטבלה, לפני הפעולות. */
  noteAfter?: string;
  /** יש כאן פריט שאפשר להעלות אליו קובץ. */
  canUpload?: boolean;
  /** טקסט הכפתור שהרו"ח בחר לבקשה החופשית. */
  cta?: string;
  /** מסומן רק בתצוגה המקדימה של הרו"ח — בקשה שטרם פורסמה ללקוח. */
  draft?: boolean;
  /** מסומן רק בתצוגה המקדימה — בקשה שסומנה להסרה בעדכון הבא (מיגרציה 101). */
  removing?: boolean;
  /** מסומן רק בתצוגה המקדימה — בקשה מפורסמת שיש עליה עריכה שטרם פורסמה (172). */
  edited?: boolean;
  /** אישור הייצוג באזור האישי (rep_approval): מה כל אדם מסמן — מהשרת. חסר ⇒ נוסח כללי. */
  approvals?: RepApprovalPerson[];
  /**
   * 221 · מפתח של מדריך מצולם בבקשה חופשית (clientPhotoGuide בבקשה) — לא הצעדים ולא הקישור: אלה קבועים
   * בקוד (portal/photoGuides.ts). ‼ מפתח לא מוכר ⇒ הדף פשוט לא מציג מדריך.
   */
  photoGuide?: string;
}

/** מה שהדף מרשה להעלות. אותה רשימה נאכפת שוב בשרת — כאן זה רק כדי לחסוך
 *  ללקוח העלאה שתידחה, ולא כהגנה. */
const ACCEPT = '.pdf,.jpg,.jpeg,.png,.webp,.heic,.xls,.xlsx,.csv,.doc,.docx';

const UPLOAD_ERRORS: Record<string, string> = {
  too_large: 'הקובץ גדול מדי - עד 10MB.',
  type_not_allowed: 'סוג הקובץ הזה לא נתמך. אפשר PDF, תמונה, אקסל או וורד.',
  rate_limited: 'הועלו הרבה קבצים בזמן קצר. אפשר לנסות שוב בעוד כמה דקות.',
  not_published: 'הבקשה הזאת עדיין לא נפתחה.',
};

/** שלב המסע כפי שהשרת שולח — כבר לא מוצג כפס התקדמות (הכרעת מוצר: הדף מציג
 *  רק "מה צריך ממך", לא מיפוי פנימי של איפה הלקוח נמצא בתהליך המשרד). השדה
 *  נשאר בטיפוס כי get_client_portal עדיין מחזיר אותו. */
type JourneyStage = 'quote' | 'identity' | 'setup' | 'active';

export interface PortalData {
  clientFirstName: string;
  firmName: string;
  branding: FirmBranding;
  done: number;
  total: number;
  journeyStage?: JourneyStage;
  items: PortalItem[];
}

type Phase = 'loading' | 'invalid' | 'ready';

/** קישור הפעולה — טוקנים הופכים לכתובת באותו origin, חיצוני נשאר כמו שהוא. */
function actionHref(item: PortalItem): string | null {
  if (!item.actionKind || !item.actionValue) return null;
  switch (item.actionKind) {
    case 'onboard':  return `${window.location.origin}/?onboard=${item.actionValue}`;
    case 'sign':     return `${window.location.origin}/?sign=${item.actionValue}`;
    case 'intake':   return `${window.location.origin}/?intake=${item.actionValue}`;
    case 'quote':    return `${window.location.origin}/?quote=${item.actionValue}`;
    case 'external': return item.actionValue;
    // 'portal' מטופל בעמוד עצמו ואין לו כתובת.
    default: return null;
  }
}

/** קישור עם טוקן למסך אחר (קליטה, חתימה, שאלון, הצעה). בדוגמה הוא אינו מנווט — הוא פותח את המסך המקושר. */
function linkedKind(item: PortalItem): PortalLinkedKind | null {
  if (!item.actionValue) return null;
  return item.actionKind === 'onboard' || item.actionKind === 'sign' || item.actionKind === 'intake' || item.actionKind === 'quote'
    ? item.actionKind : null;
}

/**
 * העלאת קובץ כנגד פריט אחד. משרתת גם את הלקוח (?portal=) וגם את הרו"ח הקודם
 * (?release=) — אותה פונקציית שרת, רק tokenKind אחר.
 *
 * ‼ הקובץ נכנס ישירות לתיק של הלקוח אצל הרו"ח ומסמן את הפריט. אין שלב ביניים
 * של "ממתין לאישור" — מה שהגיע, הגיע, וההחלטה אם הוא תקין נשארת אצל הרו"ח.
 */
function UploadItem({ tokenKind = 'portal', stepId, itemKey, label, note, done, brand, accent, onDone, accept }: {
  tokenKind?: 'portal' | 'release';
  stepId: string; itemKey: string; label: string; note?: string; done: boolean;
  /** סוגי הקבצים שמותר לבחור. ברירת מחדל: כל מה שהמשרד מקבל. */
  accept?: string;
  brand: { ink: string; muted: string; border: string; radius: number };
  accent: string; onDone: () => void;
}) {
  const { actions, readOnly, sample } = usePortal();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [simulated, setSimulated] = useState(false);
  const inputId = `up-${stepId}-${itemKey}`;

  async function upload(file: File) {
    setErr(null);
    setSimulated(false);
    setBusy(true);
    const res = await actions.uploadDocument({ stepId, itemKey, file, tokenKind });
    setBusy(false);
    if (res.simulated) { setSimulated(true); return; }
    if (!res.ok) {
      setErr(UPLOAD_ERRORS[res.error ?? ''] ?? 'ההעלאה נכשלה. אפשר לנסות שוב.');
      return;
    }
    actions.notifyAccountant();
    onDone();
  }

  const uploadLink: React.CSSProperties = {
    flexShrink: 0, fontSize: 12.5, fontWeight: 600, padding: '2px 0', color: accent,
  };

  return (
    <li style={{ display: 'grid', gap: 4, padding: '3px 0' }}>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <span aria-hidden="true" style={{ color: done ? accent : brand.muted }}>{done ? '✓' : '○'}</span>
        <span style={{
          flex: 1, minWidth: 120, fontSize: 13,
          color: done ? brand.muted : brand.ink,
          textDecoration: done ? 'line-through' : 'none',
        }}>{label}{note && !done && (
          <span data-testid="upload-item-note" style={{ display: 'block', fontSize: 12, color: brand.muted, textDecoration: 'none' }}>{note}</span>
        )}</span>
        {/* ‼ בדוגמה אין בוחר קבצים: לחיצה אחת אומרת מה היה קורה, בלי לפתוח כלום ובלי קובץ אמיתי. */}
        {!done && readOnly && (
          <span aria-disabled="true" style={{ ...uploadLink, cursor: 'default', opacity: .55 }}>העלאה</span>
        )}
        {!done && sample && (
          <button type="button" disabled={busy}
            onClick={() => void upload(new File([], 'דוגמה.pdf'))}
            style={{ ...uploadLink, background: 'none', border: 'none', font: 'inherit', cursor: busy ? 'default' : 'pointer', opacity: busy ? .6 : 1 }}>
            {busy ? 'מעלה…' : 'העלאה'}
          </button>
        )}
        {!done && !readOnly && !sample && (
          <>
            <input id={inputId} type="file" accept={accept ?? ACCEPT} disabled={busy}
              style={{ display: 'none' }}
              onChange={e => { const f = e.target.files?.[0]; if (f) void upload(f); e.target.value = ''; }} />
            <label htmlFor={inputId} style={{
              ...uploadLink, cursor: busy ? 'default' : 'pointer',
              color: busy ? brand.muted : accent, opacity: busy ? .6 : 1,
            }}>{busy ? 'מעלה…' : 'העלאה'}</label>
          </>
        )}
      </div>
      {err && (
        <span style={{ fontSize: 12, color: '#a63a3a', paddingInlineStart: 18 }}>
          {err}
        </span>
      )}
      {simulated && <div style={{ paddingInlineStart: 18 }}><SimulatedNote color={brand.muted} /></div>}
    </li>
  );
}

/** בקשה חופשית — כל דרישה והפעולה שלה. */
function CustomRequestBlock({ item, brand, accent, onDone }: {
  item: PortalItem;
  brand: { ink: string; muted: string; border: string; radius: number };
  accent: string; onDone: () => void;
}) {
  const { actions, readOnly } = usePortal();
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [text, setText] = useState<Record<string, string>>({});
  const [err, setErr] = useState<string | null>(null);
  /** בדוגמה: איזו דרישה נלחצה — המשפט «כאן הלקוח היה שולח» מופיע מתחתיה. */
  const [simKey, setSimKey] = useState<string | null>(null);
  const stepId = item.actionValue!;

  async function submit(key: string, value?: string) {
    setErr(null);
    setSimKey(null);
    setBusyKey(key);
    const res = await actions.submitStep(stepId, value !== undefined ? { key, value } : { key });
    setBusyKey(null);
    if (res.simulated) { setSimKey(key); return; }
    if (!res.ok) {
      const messages: Record<string, string> = {
        missing_value: 'צריך למלא תשובה.',
        bad_email: 'כתובת האימייל לא נראית תקינה.',
        bad_phone: 'מספר הטלפון לא נראה תקין.',
        bad_number: 'צריך להזין מספר.',
        bad_date: 'התאריך לא נראה תקין.',
        bad_choice: 'צריך לבחור אחת מהאפשרויות.',
      };
      setErr(messages[res.error ?? ''] ?? 'לא הצלחנו לשמור. אפשר לנסות שוב.');
      return;
    }
    actions.notifyAccountant();
    onDone();
  }

  const field = {
    flex: 1, minWidth: 140, padding: '7px 10px', fontSize: 13.5, color: brand.ink,
    border: `1px solid ${brand.border}`, borderRadius: brand.radius, background: '#fff',
  } as const;

  /** תווית + סימון רשות. שדות רשות לא חוסמים את השלמת הבקשה. */
  const labelOf = (r: NonNullable<PortalItem['requirements']>[number]) => (
    <>
      {r.label}
      {r.required === false && <span style={{ color: brand.muted }}> (רשות)</span>}
    </>
  );

  return (
    <div style={{ display: 'grid', gap: 6, marginTop: 8 }}>
      {(item.requirements ?? []).map(r => {
        // 'files' נשאר פתוח להעלאות נוספות גם אחרי הקובץ הראשון — עד התקרה.
        if (r.kind === 'files') {
          const count = r.fileCount ?? 0;
          const canAddMore = !r.maxFiles || count < r.maxFiles;
          return (
            <div key={r.key} style={{ display: 'grid', gap: 2 }}>
              {count > 0 && (
                <span style={{ fontSize: 12.5, color: brand.muted }}>
                  <span aria-hidden="true" style={{ color: accent }}>✓ </span>
                  {r.label} · {count === 1 ? 'הועלה קובץ אחד' : `הועלו ${count} קבצים`}
                  {r.maxFiles ? ` מתוך ${r.maxFiles}` : ''}
                </span>
              )}
              {canAddMore && (
                <ul style={{ margin: 0, padding: 0, listStyle: 'none' }}>
                  <UploadItem stepId={stepId} itemKey={r.key}
                    label={count > 0 ? 'קובץ נוסף' : r.label} done={false}
                    brand={brand} accent={accent} onDone={onDone} />
                </ul>
              )}
            </div>
          );
        }
        if (r.done) {
          return (
            <div key={r.key} style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13, color: brand.muted }}>
              <span aria-hidden="true" style={{ color: accent }}>✓</span>
              <span style={{ textDecoration: 'line-through' }}>{r.label}</span>
              {r.value && <span style={{ color: brand.ink }}>· {r.value}</span>}
            </div>
          );
        }
        if (r.kind === 'file') {
          return (
            <ul key={r.key} style={{ margin: 0, padding: 0, listStyle: 'none' }}>
              <UploadItem stepId={stepId} itemKey={r.key}
                label={r.label} done={false} brand={brand} accent={accent} onDone={onDone} />
            </ul>
          );
        }
        if (r.kind === 'select') {
          // ‼ 221 · עד חמש תשובות — רשימה גלויה ולא תפריט נפתח. בתפריט סגור תשובה ארוכה נחתכת (ב-360px:
          // «כל תקופות המילואים מופיעות -…») והלקוח לא רואה מה בחר לפני «שליחה». כל תשובה בשורה משלה,
          // עם הטקסט המלא, ושטח לחיצה של 44px. יותר מחמש — תפריט כמו קודם.
          const opts = r.options ?? [];
          if (opts.length >= 2 && opts.length <= 5) {
            const chosen = text[r.key] ?? '';
            const locked = busyKey === r.key || readOnly;
            const groupId = `pp-q-${stepId}-${r.key}`;
            return (
              <div key={r.key} style={{ display: 'grid', gap: 6 }}>
                <span id={groupId} style={{ fontSize: 13, color: brand.ink }}>{labelOf(r)}</span>
                <div role="radiogroup" aria-labelledby={groupId} data-testid="portal-choices" style={{ display: 'grid', gap: 6 }}>
                  {opts.map(o => {
                    const on = chosen === o;
                    return (
                      <label key={o} className={`pp-choice${locked ? ' is-locked' : ''}`} style={{
                        display: 'flex', alignItems: 'flex-start', gap: 10, padding: '10px 12px', fontSize: 13.5, lineHeight: 1.55,
                        color: brand.ink, background: on ? `color-mix(in srgb, ${accent} 7%, #fff)` : '#fff',
                        border: `1px solid ${on ? accent : brand.border}`, borderRadius: brand.radius,
                        boxShadow: on ? `inset 0 0 0 1px ${accent}` : 'none',
                      }}>
                        <input type="radio" name={groupId} value={o} checked={on} disabled={locked}
                          onChange={() => setText(t => ({ ...t, [r.key]: o }))}
                          style={{ accentColor: accent, marginTop: 4, flexShrink: 0 }} />
                        <span style={{ flex: 1, minWidth: 0, overflowWrap: 'anywhere' }}>{o}</span>
                      </label>
                    );
                  })}
                </div>
                <div>
                  <button type="button"
                    disabled={readOnly || busyKey === r.key || !chosen.trim()}
                    onClick={() => void submit(r.key, chosen)}
                    style={btn(accent, brand.radius, busyKey === r.key || readOnly)}>
                    {busyKey === r.key ? 'שומר…' : 'שליחה'}
                  </button>
                </div>
                {simKey === r.key && <SimulatedNote color={brand.muted} />}
              </div>
            );
          }
          return (
            <div key={r.key} style={{ display: 'grid', gap: 4 }}>
              <span style={{ fontSize: 13, color: brand.ink }}>{labelOf(r)}</span>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                <select style={field} value={text[r.key] ?? ''} disabled={busyKey === r.key || readOnly}
                  onChange={e => setText(t => ({ ...t, [r.key]: e.target.value }))}>
                  <option value="" disabled>בחרו…</option>
                  {(r.options ?? []).map(o => <option key={o} value={o}>{o}</option>)}
                </select>
                <button type="button"
                  disabled={readOnly || busyKey === r.key || !(text[r.key] ?? '').trim()}
                  onClick={() => void submit(r.key, text[r.key])}
                  style={btn(accent, brand.radius, busyKey === r.key || readOnly)}>
                  {busyKey === r.key ? 'שומר…' : 'שליחה'}
                </button>
              </div>
              {simKey === r.key && <SimulatedNote color={brand.muted} />}
            </div>
          );
        }
        if (['text', 'email', 'phone', 'number', 'date'].includes(r.kind)) {
          const inputType = r.kind === 'text' ? 'text'
            : r.kind === 'email' ? 'email'
            : r.kind === 'phone' ? 'tel'
            : r.kind === 'number' ? 'number' : 'date';
          const ltr = ['email', 'phone', 'number', 'date'].includes(r.kind);
          return (
            <div key={r.key} style={{ display: 'grid', gap: 4 }}>
              <span style={{ fontSize: 13, color: brand.ink }}>{labelOf(r)}</span>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                <input
                  style={{ ...field, ...(ltr ? { direction: 'ltr' as const, textAlign: 'right' as const } : {}) }}
                  type={inputType}
                  inputMode={r.kind === 'number' ? 'decimal' : r.kind === 'phone' ? 'tel' : undefined}
                  value={text[r.key] ?? ''} disabled={busyKey === r.key || readOnly}
                  onChange={e => setText(t => ({ ...t, [r.key]: e.target.value }))} />
                <button type="button"
                  disabled={readOnly || busyKey === r.key || !(text[r.key] ?? '').trim()}
                  onClick={() => void submit(r.key, text[r.key])}
                  style={btn(accent, brand.radius, busyKey === r.key || readOnly)}>
                  {busyKey === r.key ? 'שומר…' : 'שליחה'}
                </button>
              </div>
              {simKey === r.key && <SimulatedNote color={brand.muted} />}
            </div>
          );
        }
        return (
          <div key={r.key} style={{ display: 'grid', gap: 4 }}>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              <span aria-hidden="true" style={{ color: brand.muted }}>○</span>
              <span style={{ flex: 1, minWidth: 120, fontSize: 13, color: brand.ink }}>{labelOf(r)}</span>
              <button type="button" disabled={busyKey === r.key || readOnly}
                onClick={() => void submit(r.key)}
                style={btn(accent, brand.radius, busyKey === r.key || readOnly)}>
                {busyKey === r.key ? 'שומר…' : (item.cta || 'מאשר/ת')}
              </button>
            </div>
            {simKey === r.key && <SimulatedNote color={brand.muted} />}
          </div>
        );
      })}
      {err && <span style={{ fontSize: 12, color: '#a63a3a' }}>{err}</span>}
    </div>
  );
}

function btn(accent: string, radius: number, busy: boolean): React.CSSProperties {
  return {
    flexShrink: 0, border: 'none', cursor: busy ? 'default' : 'pointer',
    fontSize: 12.5, fontWeight: 600, padding: '7px 16px',
    color: '#fff', background: accent, borderRadius: radius, opacity: busy ? .6 : 1,
  };
}

/** שורת התקדמות קצרה מתחת לכותרת — נגזרת מהפריטים, לא שדה שמור. */
function progressLine(item: PortalItem): string | undefined {
  // ‼ חומר עזר אינו רשימה להשלמה: יש בו דרישה טכנית אחת (הפתיחה עצמה), ו-
  // "0 מתוך 1 הושלמו" הפך פעולה של לחיצה אחת למטלה עם מונה.
  if (item.kind === 'guide') return item.sub;
  if (item.kind === 'identity_confirm') return undefined;
  if (item.checklist?.length) {
    const done = item.checklist.filter(c => c.done).length;
    return `${done} מתוך ${item.checklist.length} התקבלו`;
  }
  if (item.requirements?.length) {
    // ‼ 221 · דרישה חובה אחת — «0 מתוך 1 הושלמו» הוא מונה על שאלה אחת, וגם מחביא את הניסוח שהמשרד כתב
    // מתחת לכותרת. השרת כבר שולח אותו כ-sub (clientSub) בדיוק במצב הזה, ומונה רק מדרישה שנייה (build_client_portal).
    if (item.requirements.filter(r => r.required !== false).length <= 1) return item.sub;
    const done = item.requirements.filter(r => r.done).length;
    return `${done} מתוך ${item.requirements.length} הושלמו`;
  }
  return item.sub;
}

/**
 * כרטיס פעולה אחת שממתינה ללקוח — כותרת, שורת התקדמות, כפתור אחד.
 * ‼ יחידת התצוגה הראשית היא הקבוצה, לא הפריט הבודד: הצ'קליסט/הדרישות/טופס
 * הרו"ח הקודם נפתחים רק בלחיצה. גרסה קודמת פרשה את כל השורות תמיד — שבע
 * שורות מסמכים גלויות מיד הן בדיוק העומס שהמודל המאוחד בא לצמצם.
 */
function ActionItem({ item, brand, accent, last, onDone }: {
  item: PortalItem; last: boolean;
  brand: { ink: string; muted: string; border: string; radius: number; cardBg: string };
  accent: string; onDone: () => void;
}) {
  const { actions, readOnly, sample } = usePortal();
  const [open, setOpen] = useState(false);
  const href = actionHref(item);
  const linked = linkedKind(item);
  const inPage = item.actionKind === 'portal';
  const expandable = inPage && (item.kind === 'documents' || item.kind === 'custom' || item.kind === 'prev_accountant');
  const signup = inPage && item.kind === 'paperless_signup';
  /** חומר עזר שעדיין מבקש הצהרה ("עברתי עליו") — הכל גלוי מיד: כפתור
   *  הפתיחה והסימון, בלי כרטיס שנפתח. ‼ מסמך שנשלח ללקוח אינו מגיע לכאן. */
  const guide = inPage && item.kind === 'guide' && !!item.resourceUrl;
  /**
   * כרטיס מידע — מה שממתין ללקוח קורה מחוץ לדף (פייפרלס מבקשת ממנו כרטיס
   * אשראי), ולכן אין כאן שום פקד. ‼ הוא כן יושב תחת «מה צריך ממך»: הכדור
   * באמת אצלו, וכרטיס שקוף שמסתיר את זה בטור "בטיפול המשרד" היה שקר.
   */
  const info = item.kind === 'info';
  /** הוראות + הצהרה, הכל גלוי מיד: בלי ההוראות אין מה לאשר. */
  const declare = inPage && item.kind === 'declare';
  const identity = inPage && item.kind === 'identity_confirm';
  /** 220 · «פרטי העסק» — הטופס נפתח בלחיצה («מילוי פרטים»), כמו בהדמיה המאושרת. */
  const bizDetails = inPage && item.kind === 'business_details';
  const prog = progressLine(item);

  const primaryBtn: React.CSSProperties = {
    display: 'inline-block', flexShrink: 0, textDecoration: 'none', cursor: 'pointer', border: 'none',
    fontSize: 13.5, fontWeight: 600, padding: '9px 18px', color: '#fff', background: accent, borderRadius: brand.radius,
  };
  const inertBtn: React.CSSProperties = { ...primaryBtn, opacity: .55, cursor: 'default', pointerEvents: 'none' };

  const primaryLabel = item.cta || (
    item.kind === 'documents' ? (open ? 'סגירה' : 'המשך העלאה')
    : item.kind === 'custom' ? (open ? 'סגירה' : 'המשך')
    : item.kind === 'prev_accountant' ? (open ? 'סגירה' : 'למילוי')
    : 'להמשך'
  );

  return (
    <div className="pp-item" style={{
      marginBottom: last ? 0 : 10,
      background: brand.cardBg, border: `1px solid ${brand.border}`, borderRadius: brand.radius + 2,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ flex: 1, fontSize: 14.5, fontWeight: 650, color: brand.ink }}>{item.label}</span>
        {readOnly && item.draft && <DraftChip />}
        {readOnly && item.removing && <RemovingChip />}
      </div>
      {prog && <div style={{ fontSize: 12.5, color: brand.muted, marginTop: 3 }}>{prog}</div>}

      {/* ‼ הרשמה לפייפרלס אינה "נפתחת" — היא קישור החוצה ואישור, ולכן היא
          מוצגת ישירות ולא מאחורי כפתור פתיחה. */}
      {info ? (
        item.note ? (
          <p style={{
            margin: '9px 0 0', fontSize: 12.5, lineHeight: 1.7, color: brand.muted,
            whiteSpace: 'pre-line',
          }}>{item.note}</p>
        ) : null
      ) : guide ? (
        <div style={{ marginTop: 11 }}>
          <GuideBlock item={item} brand={brand} accent={accent} onDone={onDone} />
        </div>
      ) : signup ? (
        <div style={{ marginTop: 11 }}>
          <PaperlessSignupBlock item={item} brand={brand} accent={accent} onDone={onDone} />
        </div>
      ) : declare ? (
        <div style={{ marginTop: 11 }}>
          <DeclareBlock item={item} brand={brand} accent={accent} onDone={onDone} />
        </div>
      ) : identity ? (
        <div style={{ marginTop: 11 }}>
          <IdentityConfirmBlock item={item} brand={brand} accent={accent} onDone={onDone} />
        </div>
      ) : bizDetails ? (
        <div style={{ marginTop: 11 }}>
          {!open && <button type="button" onClick={() => setOpen(true)} style={primaryBtn} aria-expanded={false}>מילוי פרטים</button>}
          {open && <BusinessDetailsBlock item={item} brand={brand} accent={accent} onDone={onDone}
            onCancel={() => setOpen(false)} />}
        </div>
      ) : (
        <div style={{ marginTop: 11 }}>
          {/* ‼ בדוגמה קישור עם טוקן אינו מנווט — הוא מבקש מהספרייה לפתוח את המסך המקושר; קישור ציבורי (gov.il וכד׳) נפתח בלשונית חדשה. */}
          {href && (readOnly
            ? <span style={inertBtn}>להמשך ←</span>
            : sample && linked
              ? <button type="button" onClick={() => actions.openLinked(linked, item.actionValue)} style={primaryBtn}>להמשך ←</button>
              : sample
                ? <a href={href} target="_blank" rel="noopener noreferrer" style={primaryBtn}>להמשך ←</a>
                : <a href={href} style={primaryBtn}>להמשך ←</a>)}
          {/* ‼ G2 · כל סוגי הבקשות נפתחים — גם בתצוגה במשרד ובדוגמה: ההסבר, הרשימה והשדות הם מה שהלקוח רואה.
              בתצוגה במשרד הפקדים שבפנים כבויים (readOnly); בדוגמה הם עובדים מקומית ולא שולחים דבר. */}
          {expandable && (
            <button type="button" onClick={() => setOpen(o => !o)} style={primaryBtn} aria-expanded={open}>{primaryLabel}</button>
          )}
        </div>
      )}

      {/* ‼ מסמכים: הלקוח מעלה כאן, במקום. הקובץ נכנס ישר לתיק שלו אצל הרו"ח
          ומסמן את הפריט. מה שמגיע בוואטסאפ או במייל עדיין מסומן ידנית על ידי
          הרו"ח — שני הערוצים חיים זה לצד זה. */}
      {open && inPage && item.kind === 'documents' && !!item.checklist?.length && item.actionValue && (
        <ul style={{ margin: '12px 0 0', padding: 0, listStyle: 'none', display: 'grid', gap: 2, borderTop: `1px dashed ${brand.border}`, paddingTop: 8 }}>
          {item.checklist.map(ci => (
            <UploadItem key={ci.key ?? ci.label}
              stepId={item.actionValue!} itemKey={ci.key} label={ci.label} note={ci.note} done={ci.done}
              brand={brand} accent={accent} onDone={onDone} />
          ))}
        </ul>
      )}

      {open && inPage && item.kind === 'custom' && item.actionValue && (
        <div style={{ borderTop: `1px dashed ${brand.border}`, paddingTop: 8, marginTop: 12 }}>
          <RequestGuide item={item} brand={brand} />
          <PhotoGuideRow item={item} brand={brand} accent={accent} />
          <CustomRequestBlock item={item} brand={brand} accent={accent} onDone={onDone} />
        </div>
      )}

      {open && inPage && item.kind === 'prev_accountant' && item.actionValue && (
        <div style={{ borderTop: `1px dashed ${brand.border}`, paddingTop: 8, marginTop: 12 }}>
          <PrevAccountantForm stepId={item.actionValue}
            prefill={item.prefill} brand={brand} accent={accent} onDone={onDone} />
        </div>
      )}
    </div>
  );
}

/**
 * בקשת חומר עזר — כפתור שפותח את הקובץ, ומתחתיו הסימון של הלקוח.
 *
 * ‼ הפתיחה כבר אינה מה שסוגר את הבקשה: מסמך שנפתח לשנייה אינו מסמך שעברו
 * עליו. מה שסוגר הוא הסימון — בדיוק כמו "נרשמתי לפייפרלס", הצהרה של הלקוח
 * ולא אימות שלנו. הפתיחה עצמה עדיין נרשמת (דרישת רשות), ולכן הרו"ח רואה
 * גם "נפתח" וגם "עבר עליו".
 *
 * ‼ תאימות לאחור: בקשה שנשלחה לפני השינוי נושאת רק את דרישת הפתיחה, ואז
 * אין כאן שורת סימון כלל — הכפתור סוגר אותה כמו קודם.
 */
function GuideBlock({ item, brand, accent, onDone }: {
  item: PortalItem;
  brand: { ink: string; muted: string; border: string; radius: number };
  accent: string; onDone: () => void;
}) {
  // ‼ מסמך שנשלח ללקוח אינו מגיע לכאן כלל: הוא אינו "מה צריך ממך" ויושב
  // בקטע «מסמכים מהמשרד». כאן נשאר רק המדריך הוותיק, שבו יש דרישה אמיתית
  // — הצהרת "עברתי עליו".
  const marks = (item.requirements ?? []).filter(r => r.kind === 'confirm' && r.key !== 'opened');
  return (
    <div style={{ display: 'grid', gap: 10, justifyItems: 'start' }}>
      <GuideOpenButton item={item} brand={brand} accent={accent} onDone={onDone} />
      {marks.map(r => (
        <GuideCheck key={r.key} item={item} req={r}
          brand={brand} accent={accent} onDone={onDone} />
      ))}
    </div>
  );
}

/** קובץ אחד בקטע «מסמכים מהמשרד», אחרי שהבקשה נפרשה לשורות. */
export interface PortalDocFile {
  key: string;
  label: string;
  opened: boolean;
  href: string | null;
  item: PortalItem;
  /** חסר במדריך ותיק שהושלם — אין לו רשימת קבצים, ואין מה לרשום. */
  res?: NonNullable<PortalItem['resources']>[number];
}

/**
 * שורת מסמך שהמשרד שלח.
 *
 * ‼ שורה ולא כרטיס-עם-כפתור: כפתור מלא נקרא כמטלה, וזו המשמעות ההפוכה
 * מ"קיבלת מאיתנו מסמך". המשקל הוויזואלי כאן נמוך במכוון — שם הקובץ בצבע
 * ההדגשה כי הוא קישור, וכל השאר אפור ושקט.
 *
 * ‼ הלחיצה פותחת **ורושמת**, ולכן היא גם מה שסוגר את הבקשה אצל הרו"ח כשכל
 * הקבצים נפתחו. זו מדידה שלנו ואינה מוצגת ללקוח כדרישה.
 *
 * ‼ <a target="_blank"> ולא window.open אחרי await, מאותה סיבה שב-
 * GuideOpenButton: חלון שנפתח אחרי המתנה נבלע בחוסמי חלונות קופצים. הרישום
 * רץ אחרי הלחיצה, ורק אחרי שאותה כתובת ענתה 2xx (confirmOpened) — קובץ
 * שנמחק מציג דף שגיאה ולא נרשם. כישלון רישום משאיר את השורה פתוחה לניסיון הבא.
 */
function DocumentRow({ file, brand, accent, onDone }: {
  file: PortalDocFile;
  brand: { ink: string; muted: string; border: string; radius: number };
  accent: string; onDone: () => void;
}) {
  const { actions, readOnly, sample } = usePortal();
  const [busy, setBusy] = useState(false);
  const [simulated, setSimulated] = useState(false);
  const { item, res, opened } = file;

  async function record() {
    if (readOnly || busy || opened || !res || !item.actionValue) return;
    setSimulated(false);
    setBusy(true);
    try {
      if (!(await actions.confirmOpened(file.href))) return;
      const r = await actions.submitStep(item.actionValue, { key: res.key });
      if (r.simulated) { setSimulated(true); return; }
    } finally {
      setBusy(false);
    }
    actions.notifyAccountant();
    onDone();
  }

  const style: React.CSSProperties = {
    display: 'flex', alignItems: 'baseline', gap: 9, width: '100%',
    padding: '11px 0', textDecoration: 'none', boxSizing: 'border-box',
    borderTop: `1px solid ${brand.border}`,
    cursor: readOnly ? 'default' : 'pointer',
    opacity: readOnly ? .6 : 1, pointerEvents: readOnly ? 'none' : undefined,
  };
  // ‼ קובץ מהתיק של הלקוח פרטי: נפתח רק עם הטוקן של הלקוח עצמו. בדוגמה ובתצוגה במשרד אין לו כתובת — ואומרים את זה.
  const privateOnly = (sample || readOnly) && !file.href && !!res?.documentId;

  const body = (
    <>
      {/* ✓ אחרי הפתיחה — סימון שקט במקום האייקון, בלי שורת הסבר נוספת. */}
      <span aria-hidden="true" style={{
        flexShrink: 0, fontSize: opened ? 12 : 13,
        color: opened ? accent : undefined, opacity: opened ? 1 : .6,
      }}>{opened ? '✓' : '📄'}</span>
      {/* ‼ overflowWrap: שמות מסמכים ארוכים גולשים במובייל אחרת. */}
      <span style={{
        flex: 1, minWidth: 0, fontSize: 14, color: accent,
        fontWeight: opened ? 400 : 550, overflowWrap: 'anywhere',
      }}>{file.label}</span>
      {/* ‼ «חדש» ולא «לפתיחה ←»: חץ-פעולה הופך מסירה להוראה, וזו בדיוק
          הסתירה שמתחת ל"אין לך משימות". השם בצבע קישור והאייקון כבר אומרים
          שלוחצים; התגית רק אומרת מה טרם ראית. מתאר בצבע המותג — לא כתום,
          לא אזהרה, לא מטלה. */}
      {opened ? (
        <span style={{ flexShrink: 0, fontSize: 12, color: brand.muted }}>נפתח</span>
      ) : (
        <span style={{
          flexShrink: 0, fontSize: 11, fontWeight: 700, lineHeight: 1.7,
          padding: '0 8px', borderRadius: 999, whiteSpace: 'nowrap',
          color: accent, border: '1px solid currentColor', opacity: .8,
        }}>חדש</span>
      )}
      {/* תגיות התצוגה המקדימה צמודות לשורה שהן מדברות עליה — תגית שצפה
          לבדה מתחת לכותרת הקטע לא אמרה על מה היא חלה. */}
      {readOnly && item.draft && <DraftChip />}
      {readOnly && item.removing && <RemovingChip />}
    </>
  );

  const row = !file.href
    ? <div style={{ ...style, cursor: 'default' }}>{body}</div>
    : (
      <a href={file.href} target="_blank" rel="noopener noreferrer" style={style}
        onClick={() => { void record(); }}>{body}</a>
    );
  return (
    <>
      {row}
      {privateOnly && <div data-testid="portal-private-file" style={{ fontSize: 12.5, color: brand.muted, paddingBottom: 8 }}>נפתח רק אצל הלקוח</div>}
      {simulated && <div style={{ paddingBottom: 8 }}><SimulatedNote color={brand.muted} /></div>}
    </>
  );
}

/** הסימון עצמו — תיבה אחת שנשלחת בלחיצה. אין ביטול: הרו"ח פותח מחדש. */
function GuideCheck({ item, req, brand, accent, onDone }: {
  item: PortalItem;
  req: NonNullable<PortalItem['requirements']>[number];
  brand: { ink: string; muted: string; border: string; radius: number };
  accent: string; onDone: () => void;
}) {
  const { actions, readOnly } = usePortal();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [simulated, setSimulated] = useState(false);

  async function mark() {
    if (readOnly || req.done || busy || !item.actionValue) return;
    setBusy(true);
    setErr(null);
    setSimulated(false);
    const res = await actions.submitStep(item.actionValue, { key: req.key });
    setBusy(false);
    if (res.simulated) { setSimulated(true); return; }
    if (!res.ok) { setErr('לא הצלחנו לשמור את הסימון. אפשר לנסות שוב.'); return; }
    actions.notifyAccountant();
    onDone();
  }

  const checked = req.done;
  return (
    <div style={{ display: 'grid', gap: 3 }}>
      <button type="button" role="checkbox" aria-checked={checked}
        disabled={readOnly || checked || busy} onClick={() => void mark()}
        style={{
          display: 'flex', alignItems: 'center', gap: 9, padding: 0,
          border: 'none', background: 'transparent', font: 'inherit',
          cursor: readOnly || checked || busy ? 'default' : 'pointer',
          opacity: readOnly ? .55 : 1,
        }}>
        <span aria-hidden="true" style={{
          width: 18, height: 18, flexShrink: 0, borderRadius: 4,
          border: `1.5px solid ${checked ? accent : brand.border}`,
          background: checked ? accent : '#fff', color: '#fff',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 12, lineHeight: 1,
        }}>{checked ? '✓' : ''}</span>
        <span style={{ fontSize: 13.5, color: checked ? brand.muted : brand.ink }}>
          {busy ? 'שומר…' : req.label}
        </span>
      </button>
      {err && <span style={{ fontSize: 12, color: '#a63a3a' }}>{err}</span>}
      {simulated && <SimulatedNote color={brand.muted} />}
    </div>
  );
}

/**
 * כפתור הפתיחה — פותח את הקובץ ורושם את הפתיחה.
 *
 * ‼ הלחיצה נרשמת בשרת דרך אותו portal_submit_step של כל בקשה אחרת, עם טוקן
 * הדף — כלומר פעולה מזוהה של הלקוח, ולא עצם הצגת העמוד שמכיל את הקישור.
 *
 * ‼ הקובץ נפתח דרך <a target="_blank"> ולא דרך window.open אחרי await:
 * חלון שנפתח אחרי המתנה אינו נחשב תגובה ישירה ללחיצה, וחוסמי חלונות
 * קופצים בולעים אותו. הרישום בשרת רץ במקביל, ואם הוא נכשל — הקובץ כבר
 * נפתח, והבקשה פשוט תישאר פתוחה לניסיון הבא.
 */
function GuideOpenButton({ item, brand, accent, onDone }: {
  item: PortalItem;
  brand: { radius: number; muted: string };
  accent: string; onDone: () => void;
}) {
  const { actions, readOnly } = usePortal();
  const [busy, setBusy] = useState(false);
  const [simulated, setSimulated] = useState(false);

  const style: React.CSSProperties = {
    display: 'inline-block', flexShrink: 0, textDecoration: 'none', cursor: 'pointer', border: 'none',
    fontSize: 13.5, fontWeight: 600, padding: '9px 18px', color: '#fff',
    background: accent, borderRadius: brand.radius, opacity: readOnly ? .55 : 1,
    pointerEvents: readOnly ? 'none' : undefined,
  };

  async function record() {
    if (readOnly || !item.actionValue || busy) return;
    setSimulated(false);
    setBusy(true);
    // ‼ אין טיפול בשגיאה במסך: הלקוח כבר קיבל את מה שרצה. חזרה על לחיצה
    // אינה מזיקה — portal_submit_step מחזיר noop על בקשה שכבר הושלמה.
    // ‼ (170) קובץ אצלנו נרשם רק אחרי שהכתובת ענתה 2xx (confirmOpened);
    // מדריך באתר חיצוני נרשם על סמך הלחיצה, כמו קודם.
    try {
      if (!(await actions.confirmOpened(item.resourceUrl))) return;
      const r = await actions.submitStep(item.actionValue, { key: 'opened' });
      if (r.simulated) { setSimulated(true); return; }
    } finally {
      setBusy(false);
    }
    actions.notifyAccountant();
    onDone();
  }

  return (
    <>
      <a href={item.resourceUrl} target="_blank" rel="noopener noreferrer"
        style={style} onClick={() => { void record(); }}>
        {item.cta || 'לפתיחת המדריך'}
      </a>
      {simulated && <SimulatedNote color={brand.muted} />}
    </>
  );
}

/**
 * 221 · מדריך מצולם בבקשה חופשית — כפתור שפותח את המדריך, וקישור לאתר שבו הלקוח פועל.
 *
 * ‼ שניהם קריאה וניווט בלבד: אף אחד מהם לא קורא ל-portal_submit_step ולא מסמן כלום. הבקשה מושלמת
 * רק בתשובה של הלקוח (CustomRequestBlock) — מי שפתח את המדריך או את האתר עוד לא סיים.
 * ‼ המפתח (item.photoGuide) מהשרת; הצעדים והקישור קבועים בקוד (photoGuides.ts) — לא clientLinkUrl,
 * ששם בקשה חופשית הופכת ל«חומר עזר» שנסגר בפתיחה.
 * ‼ הקישור הוא כפתור משני (מסגרת, לא מילוי): הכפתור המלא בכרטיס הוא «שליחה» של התשובה.
 * ‼ במשרד (תצוגה מקדימה) המדריך נפתח בקריאה בלבד, והקישור אינרטי — כמו אישור הייצוג.
 * שורה אחת עם flexWrap: בטלפון נשברת לשתי שורות, בלי גלילה אופקית.
 */
function PhotoGuideRow({ item, brand, accent }: {
  item: PortalItem;
  brand: { ink: string; muted: string; border: string; radius: number };
  accent: string;
}) {
  const { readOnly } = usePortal();
  const [open, setOpen] = useState(false);
  const guide = photoGuideFor(item.photoGuide);
  if (!guide) return null;
  const linkStyle: React.CSSProperties = {
    display: 'inline-flex', alignItems: 'center', textDecoration: 'none',
    fontSize: 13.5, fontWeight: 600, padding: '8px 16px', color: accent,
    border: `1px solid ${accent}`, background: 'transparent', borderRadius: brand.radius,
  };
  return (
    <div className="pp-photo-row" data-testid="photo-guide-row">
      <PhotoGuideButton steps={guide.steps.length} onClick={() => setOpen(true)} accent={accent} />
      {readOnly
        ? <span className="pp-site-link is-inert" style={{ ...linkStyle, opacity: .55, cursor: 'default' }}>{guide.siteLabel} ↗</span>
        : <a className="pp-site-link" href={guide.entry.url} target="_blank" rel="noopener noreferrer" style={linkStyle}>{guide.siteLabel} ↗</a>}
      <LinkHostNote url={guide.entry.url} extra="נדרשות כניסה והזדהות" brand={brand} />
      {open && <PhotoGuideDialog guide={guide} onClose={() => setOpen(false)} accent={accent} entryInert={readOnly} />}
    </div>
  );
}

/**
 * ההסבר שנפתח עם הבקשה: למה זה נדרש, אילו מספרים צריך, ומה עושים בסוף.
 *
 * ‼ הסדר הוא ההיררכיה — קודם מבינים, אחר כך מעתיקים, ורק אז מעלים. שלושת
 * החלקים אופציונליים לחלוטין: בקשה בלי הסבר מרנדרת בדיוק כמו קודם.
 * ‼ שקט בכוונה: טקסט ורשימה, בלי כרטיס משלהם — הפעולה נשארת המוקד.
 */
function RequestGuide({ item, brand }: {
  item: PortalItem;
  brand: { ink: string; muted: string; border: string; radius: number };
}) {
  const refs = item.refs ?? [];
  if (!item.note && !item.noteAfter && refs.length === 0) return null;
  return (
    <div style={{ display: 'grid', gap: 8, marginBottom: 4 }}>
      {/* ‼ pre-line: הניסוחים כוללים פסקאות ("איך עושים את זה?"), ובלי זה
          הכול נדחס לגוש אחד. טקסט ישן בשורה אחת מרנדר בדיוק כמו קודם. */}
      {item.note && (
        <p style={{ margin: 0, fontSize: 13, lineHeight: 1.7, color: brand.ink, whiteSpace: 'pre-line' }}>{item.note}</p>
      )}
      {refs.length > 0 && (
        <ul style={{
          margin: 0, padding: '8px 12px', listStyle: 'none', display: 'grid', gap: 5,
          border: `1px solid ${brand.border}`, borderRadius: brand.radius,
        }}>
          {refs.map(r => (
            <li key={`${r.label}-${r.value}`} style={{
              display: 'flex', gap: 10, alignItems: 'baseline', flexWrap: 'wrap', fontSize: 13,
            }}>
              <span style={{ flex: 1, minWidth: 90, color: brand.ink, fontWeight: 600 }}>{r.label}</span>
              <span style={{ color: brand.muted }}>{r.value}</span>
            </li>
          ))}
        </ul>
      )}
      {item.noteAfter && (
        <p style={{ margin: 0, fontSize: 12.5, lineHeight: 1.6, color: brand.muted, whiteSpace: 'pre-line' }}>{item.noteAfter}</p>
      )}
    </div>
  );
}

/**
 * הרשמה לפייפרלס — הצעד היחיד ברצף שהוא של הלקוח.
 *
 * ‼ שני פקדים ולא אחד: הקישור פותח את ההרשמה בפייפרלס עצמה, והכפתור השני
 * הוא ההצהרה שהיא בוצעה. בלי ההצהרה הרו"ח היה צריך לנחש מתי להיכנס לחשבון —
 * וזה בדיוק מה שהמסך הזה בא לסגור.
 * ‼ אין כאן אימות מול פייפרלס, ולכן הניסוח הוא "נרשמתי" ולא "נרשם": מה
 * שנשמר הוא הצהרת הלקוח, והרו"ח יכול לפתוח את השלב מחדש אם התברר אחרת.
 *
 * ‼ שם העסק נשאל כאן ולא במסך נפרד: זה מה שהמשרד מזין בפייפרלס, וזה הרגע
 * היחיד שבו הלקוח ממילא עוסק בפייפרלס. ידוע ⇒ מוצג לאישור; לא ידוע ⇒ נשאל.
 * מה שנשלח נשמר ב-clients.business_name בלבד — אין עותק שני על הבקשה.
 */
function PaperlessSignupBlock({ item, brand, accent, onDone }: {
  item: PortalItem;
  brand: { ink: string; muted: string; border: string; radius: number; cardBg: string };
  accent: string; onDone: () => void;
}) {
  const { actions, readOnly } = usePortal();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [simulated, setSimulated] = useState(false);
  const [businessName, setBusinessName] = useState(item.businessName ?? '');

  const asksBusiness = !!item.needsBusinessName;
  const missingBusiness = asksBusiness && businessName.trim() === '';

  async function confirm() {
    if (readOnly || !item.actionValue) return;
    if (missingBusiness) { setError('צריך למלא את שם העסק לפני האישור.'); return; }
    setBusy(true);
    setError(null);
    setSimulated(false);
    const res = await actions.submitStep(item.actionValue, asksBusiness ? { businessName: businessName.trim() } : {});
    setBusy(false);
    if (res.simulated) { setSimulated(true); return; }
    if (!res.ok) {
      setError(res.error === 'missing_business_name'
        ? 'צריך למלא את שם העסק לפני האישור.'
        : 'לא הצלחנו לשמור את האישור. אפשר לנסות שוב.');
      return;
    }
    onDone();
  }

  const linkBtn: React.CSSProperties = {
    display: 'inline-block', textDecoration: 'none', cursor: 'pointer',
    fontSize: 13.5, fontWeight: 600, padding: '9px 18px', borderRadius: brand.radius,
    color: '#fff', background: accent, border: 'none',
  };
  const confirmBtn: React.CSSProperties = {
    display: 'inline-block', cursor: readOnly || busy ? 'default' : 'pointer',
    fontSize: 13.5, fontWeight: 600, padding: '9px 18px', borderRadius: brand.radius,
    color: brand.ink, background: 'transparent', border: `1px solid ${brand.border}`,
    opacity: readOnly || busy ? .55 : 1,
  };

  return (
    <div style={{ display: 'grid', gap: 10 }}>
      {asksBusiness && (
        <label style={{ display: 'grid', gap: 4, maxWidth: 420 }}>
          <span style={{ fontSize: 12.5, color: brand.muted }}>
            שם העסק{item.businessName ? ' - לאישור או לתיקון' : ''}
          </span>
          <input
            value={businessName}
            onChange={e => setBusinessName(e.target.value)}
            disabled={readOnly || busy}
            placeholder="השם שהעסק מוכר בו"
            style={{
              width: '100%', padding: '9px 11px', fontSize: 14, color: brand.ink,
              border: `1px solid ${brand.border}`, borderRadius: brand.radius, background: '#fff',
            }} />
        </label>
      )}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
        {item.linkUrl && (readOnly
          ? <span style={{ ...linkBtn, opacity: .55, pointerEvents: 'none' }}>לפתיחת החשבון ←</span>
          : <a href={item.linkUrl} target="_blank" rel="noopener noreferrer" style={linkBtn}>לפתיחת החשבון ←</a>)}
        <button type="button" style={{ ...confirmBtn, opacity: missingBusiness ? .55 : confirmBtn.opacity }}
          disabled={readOnly || busy} onClick={() => void confirm()}>
          {busy ? 'רגע…' : (item.cta || 'נרשמתי')}
        </button>
        {simulated && <div style={{ width: '100%' }}><SimulatedNote color={brand.muted} /></div>}
        {item.linkUrl && <LinkHostNote url={item.linkUrl} brand={brand} />}
        {error && <div style={{ width: '100%', fontSize: 12.5, color: '#a63a3a' }}>{error}</div>}
      </div>
    </div>
  );
}

/**
 * «פרטי העסק» (220) — שם העסק ושאלון עבודה מהבית, בשליחה אחת למשרד.
 * ‼ שם העסק נשמר בכרטיס בלבד (clients.business_name), והתשובות בהיסטוריה — לא על הבקשה.
 * ‼ «השם השתנה בינתיים במשרד» (stale) — לא דורסים: מציגים את השם הנוכחי ומבקשים לאשר שוב.
 * ‼ היחס שמוצג הוא אומדן; האחוז נקבע אצל המשרד ולא נאמר כאן.
 */
function BusinessDetailsBlock({ item, brand, accent, onDone, onCancel }: {
  item: PortalItem;
  brand: { ink: string; muted: string; border: string; radius: number; cardBg: string };
  accent: string; onDone: () => void; onCancel: () => void;
}) {
  const { actions, readOnly } = usePortal();
  const [businessName, setBusinessName] = useState(item.businessName ?? '');
  const [expected, setExpected] = useState(item.businessName ?? '');
  const [homeOffice, setHomeOffice] = useState<ValidHomeOffice | null>(null);
  const [tried, setTried] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [simulated, setSimulated] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (readOnly || !item.actionValue || busy) return;
    setTried(true);
    if (!businessName.trim()) { setError('צריך למלא את שם העסק.'); return; }
    if (!homeOffice) { setError('יש להשלים את התשובות ולוודא שמספר החדרים תקין.'); return; }
    setBusy(true); setError(null); setSimulated(false);
    const r = await actions.submitBusinessDetails(item.actionValue, { businessName, expectedBusinessName: expected, homeOffice });
    setBusy(false);
    if (r.simulated) { setSimulated(true); return; }
    if (!r.ok) {
      if (r.error === 'stale') { setBusinessName(r.businessName ?? ''); setExpected(r.businessName ?? ''); }
      setError(r.message);
      return;
    }
    setSent(true);
    actions.notifyAccountant();
    onDone();
  }

  const input: React.CSSProperties = {
    width: '100%', padding: '10px 11px', fontSize: 16, color: brand.ink, minHeight: 42,
    border: `1px solid ${brand.border}`, borderRadius: brand.radius, background: '#fff',
  };
  if (sent) return <div role="status" style={{ fontSize: 13.5, color: brand.ink }}>תודה — הפרטים הועברו למשרד.</div>;
  return (
    <form onSubmit={e => void submit(e)} noValidate style={{ display: 'grid', gap: 14, borderTop: `1px dashed ${brand.border}`, paddingTop: 12 }}>
      <label style={{ display: 'grid', gap: 5, maxWidth: 420 }}>
        <span style={{ fontSize: 13, fontWeight: 600, color: brand.ink }}>
          שם העסק{item.businessName ? ' - לאישור או לתיקון' : ''}
        </span>
        <input value={businessName} onChange={e => { setBusinessName(e.target.value); setError(null); }} disabled={readOnly || busy}
          placeholder="השם שהעסק מוכר בו" autoComplete="organization" maxLength={200} style={input} />
      </label>
      <HomeOfficeForm audience="client" initial={item.homeOffice ?? null} disabled={readOnly || busy}
        onChange={v => { setHomeOffice(v); setError(null); }} showErrors={tried} />
      {error && <div role="alert" style={{ fontSize: 13, color: '#a63a3a', fontWeight: 600 }}>{error}</div>}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <button type="submit" disabled={readOnly || busy} style={{
          fontSize: 14, fontWeight: 600, padding: '10px 18px', minHeight: 44, borderRadius: brand.radius,
          color: '#fff', background: accent, border: 'none', cursor: readOnly || busy ? 'default' : 'pointer',
          opacity: readOnly || busy ? .6 : 1,
        }}>{busy ? 'שולח…' : (item.cta || 'העברה למשרד')}</button>
        <button type="button" onClick={onCancel} disabled={busy} style={{
          fontSize: 13.5, padding: '10px 14px', minHeight: 44, borderRadius: brand.radius, color: brand.muted,
          background: 'transparent', border: `1px solid ${brand.border}`, cursor: 'pointer',
        }}>סגירה</button>
      </div>
      {simulated && <SimulatedNote color={brand.muted} />}
      <div style={{ fontSize: 12, color: brand.muted, lineHeight: 1.6 }}>
        המשרד יבדוק את הפרטים. האחוז לעבודה מהבית נקבע אצלנו, ונעדכן אותך אם נצטרך פרט נוסף.
      </div>
    </form>
  );
}

/**
 * ‼ ליד כל קישור יוצא — לאן הוא מוביל, כדי שהלקוח לא ילחץ על כפתור עיוור.
 * שם האתר בלבד (gov.il), לא כתובת ארוכה.
 */
function LinkHostNote({ url, extra, brand }: { url: string; extra?: string; brand: { muted: string } }) {
  const host = linkHost(url);
  if (!host) return null;
  return (
    <div style={{ width: '100%', fontSize: 12, color: brand.muted, lineHeight: 1.5 }}>
      נפתח באתר <span dir="ltr" style={{ unicodeBidi: 'isolate' }}>{host}</span>{extra ? ` · ${extra}` : ''}
    </div>
  );
}

/**
 * הוראות + הצהרה — פעולה שהלקוח מבצע במקום אחר, ומאשר כאן שביצע.
 *
 * ‼ ההוראות גלויות מיד ולא מאחורי כפתור פתיחה: הן לא "פרטים נוספים", הן
 * הבקשה עצמה. הצרכן הראשון הוא חיבור פייפרלס לרשות המסים, אבל אין כאן
 * שום דבר ייעודי לו — כל בקשה שהיא "לך תעשה, ותגיד לנו" נראית ככה.
 * ‼ הצהרה ולא אימות, בדיוק כמו "נרשמתי לפייפרלס": אין לנו גישה לחשבון
 * שלו ברשות המסים, והרו"ח יכול לפתוח את הבקשה מחדש אם התברר אחרת.
 */
function DeclareBlock({ item, brand, accent, onDone }: {
  item: PortalItem;
  brand: { ink: string; muted: string; border: string; radius: number; cardBg: string };
  accent: string; onDone: () => void;
}) {
  const { actions, readOnly } = usePortal();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [simulated, setSimulated] = useState(false);
  const [guideOpen, setGuideOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);

  async function confirm() {
    if (readOnly || !item.actionValue) return;
    setBusy(true);
    setError(null);
    setSimulated(false);
    const res = await actions.submitStep(item.actionValue, {});
    setBusy(false);
    if (res.simulated) { setSimulated(true); return; }
    if (!res.ok) {
      setError('לא הצלחנו לשמור את האישור. אפשר לנסות שוב.');
      return;
    }
    actions.notifyAccountant();
    onDone();
  }

  const linkBtn: React.CSSProperties = {
    display: 'inline-block', textDecoration: 'none', cursor: 'pointer',
    fontSize: 13.5, fontWeight: 600, padding: '9px 18px', borderRadius: brand.radius,
    color: '#fff', background: accent, border: 'none',
  };
  const confirmBtn: React.CSSProperties = {
    display: 'inline-block', cursor: readOnly || busy ? 'default' : 'pointer',
    fontSize: 13.5, fontWeight: 600, padding: '9px 18px', borderRadius: brand.radius,
    color: brand.ink, background: 'transparent', border: `1px solid ${brand.border}`,
    opacity: readOnly || busy ? .55 : 1,
  };

  // ‼ אישור הייצוג באזור האישי — עם מדריך מצולם. המדריך פתוח גם בתצוגה
  // המקדימה במשרד: הוא תוכן לקריאה בלבד, בלי שום פעולה.
  const isRepApproval = item.key === 'rep_approval';
  // ‼ X-3 / E:X-4 · הכרטיס הזה היה ארבע פסקאות לפני הכפתור הראשון (בטלפון — מתחת
  // לקפל). עכשיו: משפט אחד + מה מסמנים (מהשרת, approvals — לא מנחשים כאן), המדריך,
  // הכפתורים; «אין לך משתמש?» ו-SMS נפתחים בלחיצה. ראה repApprovalCard.
  const card = isRepApproval ? repApprovalCard(item.approvals, item.note, item.noteAfter) : null;

  const buttons = (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
      {item.linkUrl && (readOnly
        ? <span style={{ ...linkBtn, opacity: .55, pointerEvents: 'none' }}>{item.linkLabel || 'למדריך המלא'} ←</span>
        : <a href={item.linkUrl} target="_blank" rel="noopener noreferrer" style={linkBtn}>{item.linkLabel || 'למדריך המלא'} ←</a>)}
      <button type="button" style={confirmBtn} disabled={readOnly || busy}
        onClick={() => void confirm()}>
        {busy ? 'רגע…' : (item.cta || 'ביצעתי')}
      </button>
      {simulated && <div style={{ width: '100%' }}><SimulatedNote color={brand.muted} /></div>}
      {item.linkUrl && (
        <LinkHostNote url={item.linkUrl} brand={brand}
          extra={isRepApproval ? 'האזור האישי של רשות המסים — נדרשות כניסה והזדהות' : undefined} />
      )}
      {error && <div style={{ width: '100%', fontSize: 12.5, color: '#a63a3a' }}>{error}</div>}
    </div>
  );

  if (card) {
    return (
      <div style={{ display: 'grid', gap: 12 }}>
        <div data-testid="rep-approval-what" style={{ display: 'grid', gap: 3, overflowWrap: 'anywhere' }}>
          <div style={{ fontSize: 13.5, lineHeight: 1.6, color: brand.ink }}>{card.lead}</div>
          {card.lines.map(l => (
            <div key={l.key} style={{ fontSize: 13.5, lineHeight: 1.6, fontWeight: 650, color: brand.ink }}>
              {l.text}
              {/* ‼ H2.5b · אצל זוג — למי שע״ם ממתינה (awaiting מהשרת). */}
              {l.awaiting && <span data-testid="rep-approval-awaiting" style={{ fontWeight: 600, color: '#b45309' }}> · {l.awaiting}</span>}
            </div>
          ))}
        </div>
        <div><RepApprovalGuideButton onClick={() => setGuideOpen(true)} accent={accent} /></div>
        {buttons}
        {card.more.length > 0 && (
          <div>
            {/* ‼ מידע, לא פעולה — נפתח גם בתצוגה במשרד. */}
            <button type="button" aria-expanded={moreOpen} data-testid="rep-approval-more-toggle"
              onClick={() => setMoreOpen(o => !o)}
              style={{
                background: 'none', border: 'none', padding: '4px 0', font: 'inherit', fontSize: 13, fontWeight: 600,
                color: brand.muted, cursor: 'pointer', textDecoration: 'underline', textUnderlineOffset: 3, textAlign: 'start',
              }}>
              {card.moreLabel}
            </button>
            {moreOpen && (
              <div data-testid="rep-approval-more" style={{ display: 'grid', gap: 6, marginTop: 4 }}>
                {card.more.map((p, i) => (
                  <p key={i} style={{ margin: 0, fontSize: 13, lineHeight: 1.7, color: brand.ink }}>{p}</p>
                ))}
              </div>
            )}
          </div>
        )}
        {guideOpen && (
          <RepApprovalGuide onClose={() => setGuideOpen(false)} accent={accent}
            entryUrl={item.linkUrl} entryInert={readOnly} approvals={item.approvals} />
        )}
      </div>
    );
  }

  return (
    <div style={{ display: 'grid', gap: 10 }}>
      <RequestGuide item={item} brand={brand} />
      {buttons}
    </div>
  );
}

/**
 * 208 · צילום תעודה לרשות המסים — יש אחד בתיק, והלקוח מאשר שהוא שלו או מחליף.
 * ‼ הצילום נפתח דרך portal-open-document (הקובץ פרטי). «זה הצילום שלי» נרשם
 * בשרת כאישור הלקוח; העלאת צילום אחר נחשבת גם היא לאישור — של הצילום החדש.
 * ‼ רק PDF/JPG/PNG: שע״ם מקבלת PDF, וצילום הופך ל-PDF לפני השידור.
 */
function IdentityConfirmBlock({ item, brand, accent, onDone }: {
  item: PortalItem;
  brand: { ink: string; muted: string; border: string; radius: number; cardBg: string };
  accent: string; onDone: () => void;
}) {
  const { actions, readOnly } = usePortal();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [simulated, setSimulated] = useState(false);
  const [replacing, setReplacing] = useState(false);
  const stepId = item.stepId || item.actionValue;

  async function confirm() {
    if (readOnly || !item.actionValue) return;
    setBusy(true);
    setError(null);
    setSimulated(false);
    const res = await actions.submitStep(item.actionValue, { key: 'identity_confirm' });
    setBusy(false);
    if (res.simulated) { setSimulated(true); return; }
    if (!res.ok) {
      setError('לא הצלחנו לשמור את האישור. אפשר לנסות שוב.');
      return;
    }
    actions.notifyAccountant();
    onDone();
  }

  const primary: React.CSSProperties = {
    display: 'inline-block', cursor: readOnly || busy ? 'default' : 'pointer', border: 'none',
    fontSize: 13.5, fontWeight: 600, padding: '9px 18px', color: '#fff', background: accent,
    borderRadius: brand.radius, opacity: readOnly || busy ? .55 : 1,
  };
  const secondary: React.CSSProperties = {
    background: 'none', border: 'none', padding: 0, font: 'inherit', fontSize: 13, fontWeight: 600,
    color: accent, cursor: readOnly ? 'default' : 'pointer', textDecoration: 'underline',
  };

  return (
    <div data-testid="portal-identity-confirm" style={{ display: 'grid', gap: 10 }}>
      {item.sub && <p style={{ margin: 0, fontSize: 13, lineHeight: 1.7, color: brand.ink }}>{item.sub}</p>}
      {!!item.resources?.length && (
        <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'grid', gap: 4 }}>
          {item.resources.map((r, i, all) => {
            const href = actions.resourceHref(stepId, r);
            const what = `צילום${all.length > 1 ? ` ${i + 1}` : ''}${r.fileName ? ` (${r.fileName})` : ''}`;
            return (
              <li key={r.key} style={{ fontSize: 13 }}>
                {href && !readOnly
                  ? <a href={href} target="_blank" rel="noopener noreferrer" data-testid="portal-identity-view"
                      style={{ color: accent, fontWeight: 600 }}>לצפייה ב{what} ←</a>
                  : <span style={{ color: brand.muted }}>{what}{!href && !!r.documentId && !r.url && ' · נפתח רק אצל הלקוח'}</span>}
              </li>
            );
          })}
        </ul>
      )}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center' }}>
        <button type="button" data-testid="portal-identity-confirm-btn" style={primary}
          disabled={readOnly || busy} onClick={() => void confirm()}>
          {busy ? 'רגע…' : (item.resources?.length ?? 0) > 1 ? 'אלה הצילומים שלי' : 'זה הצילום שלי'}
        </button>
        {!replacing && (
          <button type="button" data-testid="portal-identity-replace" style={secondary}
            disabled={readOnly} onClick={() => setReplacing(true)}>
            להעלות צילום אחר
          </button>
        )}
      </div>
      {replacing && stepId && (
        <ul style={{ margin: 0, padding: 0, listStyle: 'none', borderTop: `1px dashed ${brand.border}`, paddingTop: 8 }}>
          <UploadItem stepId={stepId} itemKey="identity_replacement"
            label="צילום תעודת זהות או רישיון נהיגה (PDF, JPG או PNG)"
            note="שני צדדים? אפשר קובץ PDF אחד עם שניהם."
            done={false} brand={brand} accent={accent} onDone={onDone} accept=".pdf,.jpg,.jpeg,.png" />
        </ul>
      )}
      {error && <div style={{ fontSize: 12.5, color: '#a63a3a' }}>{error}</div>}
      {simulated && <SimulatedNote color={brand.muted} />}
    </div>
  );
}

/** טופס פרטי הרו"ח הקודם — הדבר היחיד שהלקוח כותב ישירות מהדף האישי. */
function PrevAccountantForm({ stepId, prefill, brand, accent, onDone }: {
  stepId: string;
  prefill?: { name?: string; email?: string; phone?: string };
  brand: { ink: string; muted: string; border: string; radius: number };
  accent: string; onDone: () => void;
}) {
  const { actions, readOnly } = usePortal();
  // הפרטים שכבר בכרטיס ממולאים מראש — הלקוח מאשר או מתקן, לא מקליד מאפס.
  const [name, setName] = useState(prefill?.name ?? '');
  const [email, setEmail] = useState(prefill?.email ?? '');
  const [phone, setPhone] = useState(prefill?.phone ?? '');
  const hasPrefill = !!(prefill?.name || prefill?.email || prefill?.phone);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [simulated, setSimulated] = useState(false);

  async function submit() {
    if (readOnly) return;
    setErr(null);
    setSimulated(false);
    if (!name.trim() && !email.trim()) { setErr('צריך לפחות שם או אימייל.'); return; }
    setBusy(true);
    const res = await actions.submitStep(stepId, { name, email, phone });
    setBusy(false);
    if (res.simulated) { setSimulated(true); return; }
    if (!res.ok) { setErr('לא הצלחנו לשמור. אפשר לנסות שוב.'); return; }
    actions.notifyAccountant();
    onDone();
  }

  const field = {
    width: '100%', padding: '8px 10px', fontSize: 14, color: brand.ink,
    border: `1px solid ${brand.border}`, borderRadius: brand.radius, background: '#fff',
  } as const;

  return (
    <div style={{ display: 'grid', gap: 8, marginTop: 10, maxWidth: 420 }}>
      <input style={field} value={name} onChange={e => setName(e.target.value)}
        placeholder="שם רואה החשבון או המשרד" disabled={readOnly || busy} />
      <EmailInput style={field} value={email}
        onChange={e => setEmail(e.target.value)} placeholder="אימייל" disabled={readOnly || busy} />
      <input style={{ ...field, direction: 'ltr', textAlign: 'right' }} value={phone} type="tel"
        onChange={e => setPhone(e.target.value)} placeholder="טלפון (אופציונלי)" disabled={readOnly || busy} />
      {err && <span style={{ fontSize: 12.5, color: '#a63a3a' }}>{err}</span>}
      <button type="button" onClick={() => void submit()} disabled={readOnly || busy} style={{
        justifySelf: 'start', border: 'none', cursor: readOnly || busy ? 'default' : 'pointer',
        fontSize: 13.5, fontWeight: 600, padding: '9px 20px',
        color: '#fff', background: accent, borderRadius: brand.radius, opacity: readOnly ? .55 : 1,
      }}>{busy ? 'שומר…' : hasPrefill ? 'הפרטים נכונים - אישור' : 'שליחה'}</button>
      {simulated && <SimulatedNote color={brand.muted} />}
    </div>
  );
}

/**
 * גוף הדף — מפריד בין "מאיפה הנתונים" ל"איך זה נראה", כדי שהתצוגה המקדימה
 * של הרו"ח תרנדר את אותו עמוד בדיוק (get_client_portal_preview) ולא חיקוי.
 * embed=true: בלי גובה עמוד מלא.
 *
 * ‼ המצב (mode) נקבע כאן, פעם אחת:
 *   · לא נמסר ⇒ התאימות לאחור: preview או בלי טוקן ⇒ officeView (הפעולות כבויות, טיוטות מסומנות);
 *     אחרת live. «preview» נשאר כינוי ל-officeView.
 *   · sample — רק מי שמבקש אותו במפורש (הספרייה). הדף הציבורי אינו מעביר mode ולכן אינו יכול להגיע אליו.
 *   · actions — ברירת המחדל לפי המצב; מי שמזריק פעולות אחרות (בדיקות) מקבל אותן.
 */
export function PortalView({ data, token = '', preview = false, embed = false, onReload = () => {}, mode: modeProp, actions: actionsProp, sampleHooks }: {
  data: PortalData;
  token?: string;
  preview?: boolean;
  embed?: boolean;
  onReload?: () => void;
  mode?: PortalMode;
  actions?: PortalActions;
  sampleHooks?: { onOpenLinked?: (kind: PortalLinkedKind, value?: string) => void };
}) {
  // ‼ X-2 · בלי טוקן אין פעולה של הלקוח שיכולה להצליח — זו תצוגה במשרד («הדף של …»,
  // התצוגה המקדימה). הפקדים כבויים גם ב«חי · עכשיו»: המשרד מסתכל, לא פועל בשם הלקוח.
  // לכן גם mode="live" בלי טוקן הופך לתצוגה במשרד. הדף האמיתי (?portal=) תמיד מגיע עם טוקן.
  const mode: PortalMode = modeProp
    ? (modeProp === 'live' && !token ? 'officeView' : modeProp)
    : (preview || !token ? 'officeView' : 'live');
  const portalActions = useMemo(
    () => actionsProp ?? (mode === 'live' ? livePortalActions(token)
      : mode === 'sample' ? samplePortalActions(sampleHooks)
      : officeViewActions),
    [actionsProp, mode, token, sampleHooks],
  );
  const reload = onReload;
  const brand = deriveQuotationBrand({
    id: '', firmName: data.firmName, branding: data.branding ?? {},
    communication: {}, settings: {},
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any);
  const ink = brand.ink;
  const accent = brand.accent;

  // ‼ X-5 · הריפוד של העמוד, המסגרת והכרטיסים — ב-portalPage.css (pp-*), כדי שבטלפון
  // יהיה צר יותר: שלוש מסגרות מקוננות השאירו ב-360 טור טקסט של 232px.
  const page: React.CSSProperties = {
    minHeight: embed ? undefined : '100vh', background: brand.pageBg,
    display: 'flex', alignItems: 'flex-start', justifyContent: 'center',
    fontFamily: `'${brand.font}', sans-serif`, direction: 'rtl',
  };
  const card: React.CSSProperties = {
    width: 560, maxWidth: '100%', background: brand.cardBg, border: `1px solid ${brand.border}`,
    borderRadius: brand.radius + 4, borderTop: `4px solid ${accent}`,
  };
  /** טיוטה / «יוסר» — רק מי שמסתכל בתיק של לקוח אמיתי. */
  const officeView = mode === 'officeView';
  const sectionTitle: React.CSSProperties = {
    fontSize: 12.5, fontWeight: 700, color: brand.muted, margin: '20px 0 4px', letterSpacing: '.02em',
  };

  function Header() {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 18 }}>
        {brand.logoUrl ? (
          <img src={brand.logoUrl} alt={data.firmName}
            style={{ maxHeight: 40 * brand.logoScale, maxWidth: 180 * brand.logoScale, objectFit: 'contain' }} />
        ) : (
          <>
            <div style={{
              width: 34, height: 34, borderRadius: '50%', border: `1.5px solid ${ink}`,
              display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, color: ink,
            }}>{brand.monogram}</div>
            <div style={{ fontSize: 14, color: ink }}>{data.firmName}</div>
          </>
        )}
      </div>
    );
  }

  // ‼ עבודת המשרד ("office") כן מוצגת, מ-2026-08-16 — בלי שום פקד. הלקוח
  // צריך לדעת שלושה דברים: מה עליו לעשות, מה אנחנו עושים עכשיו, ומה יקרה
  // אחר כך. קודם הושמט האמצעי מביניהם, והתוצאה הייתה שקט שנקרא כתקיעות:
  // "נרשמתי לפייפרלס — ומה עכשיו?" בלי תשובה על המסך.
  // ‼ הגבול שנשמר: office הוא מידע ולא מטלה, ולכן הוא שקט, אפור, ומתחת
  // ל"מה צריך ממך" — לעולם לא מתחרה בו.
  //
  // ‼ "future" — שלב שפורסם ועדיין נעול — כן מוצג, מ-2026-08-15. קודם הוא נזרק
  // כאן, והתוצאה הייתה שהלקוח לא ידע שיש המשך: "הרשאה לחיוב חודשי" פשוט הופיעה
  // יום אחד כאילו צצה משום מקום. עכשיו הוא רואה את השם האמיתי, שהוא נעול, ומה
  // יפתח אותו — מפת דרכים במקום הפתעות.
  // ‼ הגבול שנשאר: טיוטה אינה מגיעה לכאן בכלל (השרת מסנן לפי published_at),
  // ולכן "נעול" לעולם אינו חושף בקשה שהרו"ח עוד לא פרסם.
  /**
   * ‼ מסמך שהמשרד שלח **אינו** "מה צריך ממך".
   *
   * "מה צריך ממך" היא רשימת החובות של הלקוח כלפינו — תמלא, תחתום, תעלה.
   * מסמך שאנחנו שולחים הוא בדיוק הכיוון ההפוך: שירות שהוא קיבל. כשהוא ישב
   * שם, ליד "מילוי פרטים וייפוי כוח", הלקוח סרק את הרשימה וראה עוד שורה
   * בחוב שלו — ודחה אותה כמו מטלה.
   *
   * ‼ הפתיחה עדיין סוגרת את הבקשה אצל הרו"ח. זו מדידה שלנו, ואסור שהיא
   * תעצב את המודל המנטלי של הלקוח.
   *
   * ‼ הגבול הסמנטי: מדריך ותיק שמבקש "עברתי עליו" **נשאר** ב"מה צריך ממך",
   * כי שם באמת מבקשים ממנו משהו. מה שנשלח בלי דרישה — יורד לכאן.
   */
  // ‼ 208 · צילום התעודה לאישור אינו מסמך שנשלח — הוא שאלה ללקוח, ונשאר ב«מה צריך ממך».
  const isSentDoc = (i: PortalItem) => !!i.resources?.length && i.kind !== 'identity_confirm';
  /** מדריך ותיק שכבר הושלם — אין בו יותר דרישה, ולכן מקומו כאן. */
  const isDoneLegacyDoc = (i: PortalItem) => i.bucket === 'done' && !!i.resourceUrl && !isSentDoc(i);

  // ‼ X-3 · כרטיס הזירוז (אופציונלי — הכותרת הקבועה שלו) אחרי מה שבאמת נדרש, לא ראשון
  // ב«מה צריך ממך». כשהאישור חובה (201) הכותרת אחרת, והכרטיס נשאר במקומו.
  const optionalLast = (i: PortalItem) => (i.key === 'rep_approval' && i.label === REP_PORTAL_CARD_FIXED.title ? 1 : 0);
  /* ‼ 05.10 · קבוצות קבועות (הדמיה מאושרת): פייפרלס, העברת טיפול וייצוג — קבוצה אחת עם כל
     הבקשות שלה, בסדר קבוע, גם כשחלק הושלם וחלק בטיפולנו. הקבוצה עומדת במקטע של המצב שלה
     (יש משהו בשבילך ⇒ «מה צריך ממך»). זיהוי לפי מפתח הפריט מהשרת, לא לפי כותרת. */
  const { groups: itemGroups } = groupPortalItems(data.items.filter(i => !isSentDoc(i) && i.kind !== 'message' && !isDoneLegacyDoc(i)));
  const groupedKeys = new Set(itemGroups.flatMap(g => g.items.map(i => i.key)));
  const free = (i: PortalItem) => !groupedKeys.has(i.key);
  const groupCards = itemGroups.map(g => ({ g, st: portalGroupStatus(g.items) }));
  const groupsIn = (tone: 'action' | 'office' | 'future' | 'done') => groupCards.filter(x => x.st.tone === tone);
  const actions  = data.items.filter(i => i.bucket === 'action' && !isSentDoc(i) && free(i))
    .sort((a, b) => optionalLast(a) - optionalLast(b));
  // ‼ הודעה מהמשרד אינה "בטיפול המשרד": אין מאחוריה עבודה שמתבצעת, ולכן היא
  // יוצאת מהקבוצה הזאת ומקבלת מקום משלה. אחרת היא נקראת כמו הבטחה לטיפול.
  const messages = data.items.filter(i => i.kind === 'message');
  const office   = data.items.filter(i => i.bucket === 'office' && i.kind !== 'message' && free(i));
  // בקשת מסמכים נעולה נשארת ב"בהמשך" — היא עדיין לא נשלחה.
  const future   = data.items.filter(i => i.bucket === 'future' && free(i));
  const done     = data.items.filter(i =>
    i.bucket === 'done' && !isSentDoc(i) && !isDoneLegacyDoc(i) && free(i));
  /** מה ממתין ללקוח — בשורה אחת מעל הכול (גם בתוך קבוצות). */
  const waitingForYou = [...actions, ...itemGroups.flatMap(g => g.items.filter(i => i.bucket === 'action'))];
  const renderGroup = (x: { g: PortalGroup<PortalItem>; st: ReturnType<typeof portalGroupStatus> }) => (
    <PortalGroupCard key={`g-${x.g.key}`} group={x.g} status={x.st} brand={brand} accent={accent} onDone={reload} />
  );

  /**
   * בית אחד לכל מה שהמשרד שלח — שנפתח ושלא. הלקוח מחפש מסמך, לא בקשה,
   * ולכן כל קובץ הוא שורה ובקשה שנושאת כמה מהם נפרשת.
   * ‼ מה שטרם נפתח קודם: זה מה שחדש לו, וזה גם מה שמצדיק את הקטע.
   */
  const docItems = data.items.filter(i =>
    (isSentDoc(i) && i.bucket !== 'future') || isDoneLegacyDoc(i));
  const docGroups = docItems
    .map(i => ({
      key: i.key,
      note: isSentDoc(i) ? i.note : undefined,
      files: i.resources?.length
        ? i.resources.map(f => ({
            key: `${i.key}-${f.key}`, label: f.label, opened: f.done,
            href: portalActions.resourceHref(i.stepId ?? i.actionValue, f),
            item: i, res: f,
          }))
        : [{
            key: i.key, label: i.label, opened: true,
            href: i.resourceUrl ?? null, item: i, res: undefined,
          }],
    }))
    .sort((a, b) => Number(b.files.some(f => !f.opened)) - Number(a.files.some(f => !f.opened)));
  const unopenedCount = docGroups.reduce(
    (n, g) => n + g.files.filter(f => !f.opened).length, 0);
  const hasUnopenedDoc = unopenedCount > 0;
  const firstName = data.clientFirstName;

  return (
    <PortalModeCtx.Provider value={mode}>
    <PortalActionsCtx.Provider value={portalActions}>
    <div className={`pp-page${embed ? ' is-embed' : ''}`} style={page}>
      <div className="pp-card" style={card}>
        <Header />

        <div style={{ fontSize: 19, fontWeight: 650, color: brand.ink, marginBottom: 3 }}>
          שלום{firstName ? ` ${firstName}` : ''},
        </div>

        {/* ‼ 05.10 · שורת סיכום אחת: מה ממתין לך עכשיו — גם כשזה בתוך קבוצה. */}
        {waitingForYou.length > 0 && (
          <div role="status" style={{
            margin: '12px 0 4px', padding: '11px 14px', borderRadius: brand.radius + 2, fontSize: 13.5, lineHeight: 1.55,
            background: brand.pageBg, color: brand.ink, border: `1px solid ${brand.border}`,
          }}>
            {waitingForYou.length === 1
              ? <>יש בקשה אחת שממתינה לך: <strong>{portalChildTitle(waitingForYou[0])}</strong>.</>
              : <>יש {waitingForYou.length} בקשות שממתינות לך.</>}
          </div>
        )}
        {actions.length > 0 || groupsIn('action').length > 0 ? (
          <>
            <div style={{ ...sectionTitle, color: accent, marginTop: 16, marginBottom: 8 }}>מה צריך ממך</div>
            {groupsIn('action').map(renderGroup)}
            {actions.map((item, i) => (
              <ActionItem key={item.key} item={item} brand={brand} accent={accent}
                last={i === actions.length - 1} onDone={reload} />
            ))}
          </>
        ) : hasUnopenedDoc ? (
          /* ‼ מוביל במה שרלוונטי, לא בהיעדר חובות. "אין לך משימות" ראשון
             נקרא כ"אין כאן שום דבר בשבילי" — גם כשמיד מתחתיו מחכה מסמך
             שהמשרד שלח. מסמך שטרם נפתח אינו חובה, אבל הוא כן הדבר הרלוונטי
             ביותר על המסך, והפתיחה שלו היא הצעד הטבעי הבא. */
          <div style={{ fontSize: 15, fontWeight: 550, color: brand.ink, margin: '18px 0 4px' }}>
            {unopenedCount === 1
              ? 'המשרד שלח לך מסמך חדש.'
              : `המשרד שלח לך ${unopenedCount} מסמכים חדשים.`}
          </div>
        ) : (done.length > 0 || groupsIn('done').length > 0) && future.length === 0 && office.length === 0
            && groupsIn('office').length === 0 && groupsIn('future').length === 0 ? (
          /* ‼ "הכול הושלם" רק כשבאמת אין המשך. עם שלב עתידי נעול או עם משהו
             שבטיפולנו זה היה שקר קטן שמייצר פנייה: הלקוח קורא שסיים, ואז
             נפתח לו עוד שלב. מסמך שטרם נפתח כבר נתפס בענף שמעל. */
          <div style={{ fontSize: 15, color: brand.ink, margin: '18px 0 4px' }}>
            הכול הושלם{firstName ? `, ${firstName}` : ''} 🎉
          </div>
        ) : (
          /* ‼ המשפט הרגוע שמור למצב שבו באמת אין מה לעשות **ואין שום דבר
             חדש**: לא חובות, ולא מסמך שממתין לעיון. */
          <div style={{ fontSize: 13.5, color: brand.muted, margin: '18px 0 4px' }}>
            אין כרגע משהו שדורש את טיפולך.
          </div>
        )}

        {/* ── הודעה מהמשרד ────────────────────────────────────────────────
            ‼ מלל בלבד, בלי שום פקד: אין כאן מה לאשר ואין מה לפתוח. היא
            יושבת מתחת ל"מה צריך ממך" כדי לא להתחרות בו, ומעל השאר כדי
            שתיקרא. יורדת מהדף כשהמשרד סוגר אותה. */}
        {messages.length > 0 && (
          <>
            <div style={{ ...sectionTitle, marginTop: actions.length > 0 ? 20 : 16 }}>
              {messages.length === 1 ? 'הודעה מהמשרד' : 'הודעות מהמשרד'}
            </div>
            {messages.map(item => {
              // ‼ כותרת שחוזרת על כותרת הקטע היא רעש: "הודעה מהמשרד" פעמיים
              // זה בדיוק מה שנראה כמו תקלה. שם אמיתי — כן מוצג.
              const named = item.label && item.label !== MESSAGE_DEFAULT_TITLE;
              return (
                <div key={item.key} style={{
                  padding: '13px 15px', marginBottom: 8,
                  background: brand.cardBg, border: `1px solid ${brand.border}`,
                  borderRadius: brand.radius + 2,
                }}>
                  {(named || (officeView && (item.draft || item.removing))) && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                      {named && (
                        <span style={{ flex: 1, fontSize: 14, fontWeight: 600, color: brand.ink }}>
                          {item.label}
                        </span>
                      )}
                      {officeView && item.draft && <DraftChip />}
                      {officeView && item.removing && <RemovingChip />}
                    </div>
                  )}
                  {item.note && (
                    <p style={{
                      margin: 0, fontSize: 13, lineHeight: 1.7,
                      color: brand.ink, whiteSpace: 'pre-line',
                    }}>{item.note}</p>
                  )}
                  {/* ‼ הרחבה קטנה: הודעה שנושאת קישור חיצוני (למשל אתר
                      ביטוח לאומי) — לא כפתור פעולה, אין כאן מה "לאשר". */}
                  {item.linkUrl && (
                    <a href={item.linkUrl} target="_blank" rel="noopener noreferrer"
                      style={{
                        display: 'inline-block', marginTop: 8, textDecoration: 'none',
                        fontSize: 13, fontWeight: 600, color: accent,
                      }}>
                      {item.linkLabel || 'לפתיחת הקישור'} ←
                    </a>
                  )}
                  {item.linkUrl && <LinkHostNote url={item.linkUrl} brand={brand} />}
                </div>
              );
            })}
          </>
        )}

        {/* ── מסמכים מהמשרד ───────────────────────────────────────────────
            ‼ שורות, לא כרטיסים: כרטיס עם כפתור נקרא כמטלה, וזו בדיוק
            המשמעות ההפוכה. אין כאן כותרת פנימית לבקשה — היא הייתה חוזרת על
            כותרת הקטע. המשקל הוויזואלי נמוך מ"מה צריך ממך" (הכותרת אפורה
            ולא בצבע ההדגשה), כדי שסדר הסריקה יישאר: קודם מה שצריך ממני. */}
        {docGroups.length > 0 && (
          <>
            <div style={{ ...sectionTitle, marginTop: (actions.length > 0 || messages.length > 0) ? 20 : 16 }}>
              מסמכים מהמשרד
            </div>
            {docGroups.map(g => (
              <div key={g.key}>
                {/* המילים שצורפו לקבצים — הקשר, לא הוראה. */}
                {g.note && (
                  <p style={{
                    margin: '6px 0 2px', fontSize: 12.5, lineHeight: 1.7,
                    color: brand.muted, whiteSpace: 'pre-line',
                  }}>{g.note}</p>
                )}
                {g.files.map(f => (
                  <DocumentRow key={f.key} file={f} brand={brand} accent={accent}
                    onDone={reload} />
                ))}
              </div>
            ))}
          </>
        )}

        {/* ── בטיפול המשרד ────────────────────────────────────────────────
            מה שאנחנו עושים עכשיו. שקט ובלי פקדים — זו תשובה לשאלה "ומה
            עכשיו?", לא עוד רשימת מטלות. */}
        {(office.length > 0 || groupsIn('office').length > 0) && (
          <>
            <div style={{ ...sectionTitle, marginTop: (actions.length > 0 || messages.length > 0 || docGroups.length > 0) ? 20 : 16 }}>
              בטיפול המשרד
            </div>
            {groupsIn('office').map(renderGroup)}
            {office.map(item => (
              <div key={item.key} style={{
                display: 'flex', alignItems: 'flex-start', gap: 8,
                padding: '10px 0', borderTop: `1px solid ${brand.border}`,
              }}>
                <span aria-hidden="true" style={{ fontSize: 12, lineHeight: '20px', opacity: .55 }}>●</span>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 14, color: brand.ink }}>
                    {item.label}
                    {officeView && item.draft && <DraftChip />}
                    {officeView && item.removing && <RemovingChip />}
                  </div>
                  {item.sub && (
                    <div style={{ fontSize: 12, color: brand.muted, marginTop: 2, lineHeight: 1.55 }}>
                      {item.sub}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </>
        )}

        {/* ── בהמשך: שלבים שפורסמו ועדיין נעולים ──────────────────────────
            שקט בכוונה — אפור, בלי כפתור, בלי מסגרת מודגשת. זו מפת דרכים,
            לא רשימת מטלות: אסור שתתחרה ב"מה צריך ממך" שמעליה. */}
        {(future.length > 0 || groupsIn('future').length > 0) && (
          <>
            <div style={{ ...sectionTitle, marginTop: (actions.length > 0 || office.length > 0 || messages.length > 0 || docGroups.length > 0) ? 20 : 16 }}>
              בהמשך - ייפתח אוטומטית
            </div>
            {groupsIn('future').map(renderGroup)}
            {future.map(item => (
              <div key={item.key} style={{
                display: 'flex', alignItems: 'flex-start', gap: 8,
                padding: '10px 0', borderTop: `1px solid ${brand.border}`,
              }}>
                <span aria-hidden="true" style={{ fontSize: 12, lineHeight: '20px', opacity: .5 }}>🔒</span>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 14, color: brand.muted }}>
                    {item.label}
                    {officeView && item.draft && <DraftChip />}
                    {officeView && item.removing && <RemovingChip />}
                  </div>
                  {item.sub && (
                    <div style={{ fontSize: 12, color: brand.muted, opacity: .85, marginTop: 2 }}>
                      {item.sub}
                    </div>
                  )}
                </div>
              </div>
            ))}
            <div style={{ fontSize: 11.5, color: brand.muted, opacity: .8, marginTop: 8 }}>
              אין מה לעשות עם אלה עכשיו - הם ייפתחו כאן מעצמם.
            </div>
          </>
        )}

        {/* ‼ תזכורת שקטה שכבר קרה משהו — לא רשימה. "מה קורה עכשיו" הוא
            השאלה של העמוד הזה; "מה קרה" שייך לרו"ח בלבד. */}
        {/* ‼ קבוצה שהושלמה כולה — מקופלת, ואפשר לפתוח ולראות את הבקשות שבה. */}
        {groupsIn('done').length > 0 && (
          <div style={{ marginTop: 16 }}>{groupsIn('done').map(renderGroup)}</div>
        )}
        {done.length > 0 && (
          <div style={{ fontSize: 12, color: brand.muted, marginTop: (actions.length > 0 || future.length > 0) ? 16 : 4 }}>
            ✓ {done.length === 1 ? 'דבר אחד שכבר הושלם' : `${done.length} דברים שכבר הושלמו`}
          </div>
        )}

        {/* ‼ «מסמכים שימושיים» בוטל: מסמך שנפתח נשאר במקום שבו הוא היה,
            תחת «מסמכים מהמשרד», עם סימון שקט. שני קטעים לאותם קבצים אילצו
            את הלקוח לזכור לאיזה מהם ללכת. */}

        <div style={{
          marginTop: 22, paddingTop: 12, borderTop: `1px solid ${brand.border}`,
          fontSize: 12, color: brand.muted, textAlign: 'center', lineHeight: 1.6,
        }}>
          שאלות? פשוט השיבו למייל שקיבלתם מ{data.firmName}.
        </div>
      </div>
    </div>
    </PortalActionsCtx.Provider>
    </PortalModeCtx.Provider>
  );
}

/**
 * קבוצה קבועה בדף האישי (05.10) — כותרת עם מצב, ומתחת כל בקשה בשורה משלה, בסדר קבוע.
 * ‼ בקשה שממתינה ללקוח — אותו ActionItem כמו בשורה בודדת (אותם טפסים ופעולות); השאר —
 * שורה שקטה עם המצב שלה. בלי פקדים של המשרד ובלי הערות פנימיות: רק מה שהשרת שלח לדף.
 */
function PortalGroupCard({ group, status, brand, accent, onDone }: {
  group: PortalGroup<PortalItem>;
  status: ReturnType<typeof portalGroupStatus>;
  brand: { ink: string; muted: string; border: string; radius: number; cardBg: string; pageBg: string };
  accent: string; onDone: () => void;
}) {
  const { readOnly } = usePortal();
  const [open, setOpen] = useState(status.tone === 'action');
  const hint = status.tone === 'action' ? group.summary
    : status.tone === 'office' ? 'בטיפול המשרד · אין צורך בפעולה שלך'
    : status.tone === 'future' ? 'ייפתח בהמשך'
    : group.summary;
  const tagColor = status.tone === 'action' ? accent : status.tone === 'done' ? '#2f6b4f' : brand.muted;
  const actionKids = group.items.filter(i => i.bucket === 'action');
  return (
    <section className="pp-group" data-group={group.key} style={{
      border: `1px solid ${brand.border}`, borderRadius: brand.radius + 4, background: brand.cardBg, marginBottom: 10, overflow: 'hidden',
    }}>
      <button type="button" className="pp-group-head" aria-expanded={open} onClick={() => setOpen(o => !o)}
        style={{ color: brand.ink, borderBottom: open ? `1px solid ${brand.border}` : 'none' }}>
        <span className="pp-group-namecol">
          <span className="pp-group-name">{group.title}</span>
          <span className="pp-group-hint" style={{ color: brand.muted }}>{hint}</span>
        </span>
        <span className="pp-group-tag" style={{ color: tagColor }}>{status.tag}</span>
        <span className="pp-group-chev" aria-hidden="true" style={{ color: brand.muted }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9" /></svg>
        </span>
      </button>
      {open && (
        <div className="pp-group-kids" style={{ background: brand.pageBg }}>
          {group.items.map(it => it.bucket === 'action'
            ? <ActionItem key={it.key} item={{ ...it, label: portalChildTitle(it) }} brand={brand} accent={accent}
                last={it === actionKids[actionKids.length - 1]} onDone={onDone} />
            : (
              <div key={it.key} className="pp-group-kid" style={{ background: brand.cardBg, border: `1px solid ${brand.border}`, borderRadius: brand.radius + 2 }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 600, color: it.bucket === 'future' ? brand.muted : brand.ink }}>
                    {portalChildTitle(it)}
                    {readOnly && it.draft && <DraftChip />}
                    {readOnly && it.removing && <RemovingChip />}
                  </div>
                  {it.sub && <div style={{ fontSize: 12.5, color: brand.muted, marginTop: 2, lineHeight: 1.55 }}>{it.sub}</div>}
                </div>
                <span className="pp-group-kid-tag" style={{ color: it.bucket === 'done' ? '#2f6b4f' : brand.muted }}>
                  {it.bucket === 'done' ? 'הושלם' : it.bucket === 'office' ? 'בטיפול המשרד' : 'בהמשך'}
                </span>
              </div>
            ))}
        </div>
      )}
    </section>
  );
}

export default function PublicPortalPage({ token }: Props) {
  const [phase, setPhase] = useState<Phase>('loading');
  const [data, setData] = useState<PortalData | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const reload = () => setReloadKey(k => k + 1);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const row = await loadClientPortal<PortalData & { ok?: boolean }>(token);
      if (cancelled) return;
      if (!row) { setPhase('invalid'); return; }
      setData(row);
      setPhase('ready');
    })();
    return () => { cancelled = true; };
  }, [token, reloadKey]);

  // מצבי הביניים משתמשים במיתוג ברירת המחדל — המיתוג האמיתי מגיע עם הנתונים.
  const brand = deriveQuotationBrand({
    id: '', firmName: undefined, branding: {},
    communication: {}, settings: {},
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any);
  const page: React.CSSProperties = {
    minHeight: '100vh', background: brand.pageBg, display: 'flex', alignItems: 'flex-start',
    justifyContent: 'center', padding: '40px 16px', fontFamily: `'${brand.font}', sans-serif`, direction: 'rtl',
  };
  const card: React.CSSProperties = {
    width: 560, maxWidth: '100%', background: brand.cardBg, border: `1px solid ${brand.border}`,
    borderRadius: brand.radius + 4, padding: '30px 30px 22px', borderTop: `4px solid ${brand.accent}`,
  };

  if (phase === 'loading') {
    return <div style={page}><div style={{ ...card, textAlign: 'center', color: brand.muted }}>טוען…</div></div>;
  }

  if (phase === 'invalid' || !data) {
    return (
      <div style={page}>
        <div style={{ ...card, textAlign: 'center' }}>
          <div style={{ fontSize: 18, fontWeight: 500, color: brand.ink, marginBottom: 5 }}>הקישור אינו תקין</div>
          <div style={{ fontSize: 13, color: brand.muted, lineHeight: 1.6 }}>
            ייתכן שהקישור הועתק חלקית או שאינו פעיל עוד. פנו למשרד לקבלת קישור חדש.
          </div>
        </div>
      </div>
    );
  }

  return <PortalView data={data} token={token} onReload={reload} />;
}

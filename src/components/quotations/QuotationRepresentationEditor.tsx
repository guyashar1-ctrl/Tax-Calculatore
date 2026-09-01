// ─── הגדרת הייצוג שייפתח עם אישור ההצעה ─────────────────────────────────────
// אותן שאלות בדיוק של דיאלוג "קישור ייצוג חדש" (RepresentationOnboardingDialog),
// רק שהן נשאלות מראש: ברגע שהלקוח מאשר את ההצעה אין אף אחד שיבחר רשויות, ולכן
// הבחירה חייבת להיות שמורה על ההצעה. מה שלא ימולא כאן — הלקוח ימלא בקישור.

import { useEffect, useState } from 'react';
import {
  RepAuthorityKind,
  RepLevel,
  RepTarget,
  REP_AUTHORITY_ORDER,
  REP_AUTHORITY_LABELS,
  REP_AUTHORITIES_WITH_LEVEL,
  REP_AUTHORITIES_WITH_TARGETS,
  REP_LEVEL_LABELS,
  FamilyStatus,
  FAMILY_STATUS_LABELS,
  FAMILY_STATUS_YEAR_LABELS,
} from '../../types';
import type { QuotationRepresentation } from '../../types/quotations';
import { targetsOf } from '../../utils/repScope';
import { isValidIsraeliId } from '../../utils/israeliId';
import { isValidEmail } from '../../utils/email';
import EmailInput from '../ui/EmailInput';

const FAMILY_ORDER: FamilyStatus[] = ['single', 'married', 'divorced', 'widowed', 'singleParent'];
const CURRENT_YEAR = new Date().getFullYear();
const hasLevel = (a: RepAuthorityKind) => REP_AUTHORITIES_WITH_LEVEL.includes(a);

/**
 * האם נלקח ייצוג ב"ל גם עבור בן/בת הזוג.
 *
 * ‼ עובר דרך `targetsOf` (31.8) — ביטוח לאומי הצטרף ל"עבור מי", אותו מודל
 * בדיוק כמו מע"מ/ניכויים. `targetsOf` מתרגם גם רשומות ישנות עם `coversSpouse`
 * הגולמי, אז אין כאן שני מקורות אמת.
 */
export function niCoversSpouse(rep: QuotationRepresentation): boolean {
  return targetsOf(rep.areas, 'nationalInsurance').includes('spouse');
}

/**
 * אותן ולידציות של דיאלוג הייצוג. מוחזרת הודעה בעברית, או null אם תקין.
 * נקרא לפני שליחת ההצעה — אחרי השליחה אין הזדמנות לתקן: האישור פותח ייצוג
 * עם מה שכתוב כאן.
 */
export function validateQuotationRepresentation(rep: QuotationRepresentation): string | null {
  if (!rep.enabled) return null;
  const selected = REP_AUTHORITY_ORDER.filter(a => !!rep.areas?.[a]);
  if (selected.length === 0) {
    return 'בחר לפחות רשות אחת לייצוג, או כבה את פתיחת הייצוג האוטומטית.';
  }
  const p = rep.prefill ?? {};
  const yearLabel = p.familyStatus ? FAMILY_STATUS_YEAR_LABELS[p.familyStatus] : undefined;
  if (yearLabel && p.familyStatusYear != null) {
    const y = Number(p.familyStatusYear);
    if (!Number.isInteger(y) || y < 1900 || y > CURRENT_YEAR) return `${yearLabel} - יש להזין שנה תקינה.`;
  }
  if (p.spouseIdNumber && !isValidIsraeliId(p.spouseIdNumber)) {
    return 'תעודת הזהות של בן/בת הזוג אינה תקינה.';
  }
  if (rep.spouse?.email && !isValidEmail(rep.spouse.email)) {
    return 'כתובת האימייל של בן/בת הזוג אינה תקינה.';
  }
  // ‼ פרטי בן/בת הזוג אינם חוסמים שליחה (הכרעה 2026-08-17): מה שהרו"ח לא
  // יודע — הלקוח ממלא בעצמו בקישור ההשלמה שנפתח עם האישור, כולל ארבעת
  // שדות ייפוי הכוח בב"ל. רק ערך שהוזן בפועל נבדק שהוא תקין.
  if (p.spouseBirthYear != null) {
    const by = Number(p.spouseBirthYear);
    if (!Number.isInteger(by) || by < 1900 || by > CURRENT_YEAR) {
      return 'שנת הלידה של בן/בת הזוג אינה תקינה.';
    }
  }
  return null;
}

/** תקציר לשורת הסקשן המקופלת */
export function representationSummary(rep: QuotationRepresentation): string {
  if (!rep.enabled) return 'לא ייפתח ייצוג';
  const selected = REP_AUTHORITY_ORDER.filter(a => !!rep.areas?.[a]);
  if (selected.length === 0) return 'לא נבחרו רשויות';
  return selected.map(a => REP_AUTHORITY_LABELS[a]).join(', ');
}

interface Props {
  value: QuotationRepresentation;
  onChange: (next: QuotationRepresentation) => void;
  /** נמען ההצעה — הייצוג ייפתח על שמו, ולכן מוצג כאן ולא נשאל מחדש. */
  recipientName: string;
  recipientEmail?: string;
  /** אזהרה מייעצת בלבד: המייל כבר משויך לאדם אחר עם ייצוג פעיל/בתהליך. */
  emailConflict?: string | null;
  /** הנמען עובר מרו"ח אחר ⇒ רמת הייצוג נפתחת כמשנית, וזה נאמר על המסך. */
  isTransfer?: boolean;
  /**
   * רשויות שכבר קיים להן ייצוג — של הנמען עצמו, או של הזוג דרך בן/בת הזוג
   * המקושר/ת (150). כשהנמען כבר לקוח קיים ומקושר, מוצג כשורת מידע קבועה
   * במקום צ'קבוקס, בדיוק כמו בדיאלוג "קישור ייצוג חדש". ‼ מחושב מראש
   * ע"י הקורא (QuotationBuilder) — העורך הזה לא צריך לדעת על כרטיסים.
   */
  alreadyRepresented?: Partial<Record<RepAuthorityKind, string>>;
  /**
   * מה **בן/בת הזוג** כבר מיוצג/ת בו כאדם (159). ‼ אותו כלל בדיוק כמו
   * ב-RepresentationOnboardingDialog: אין להציע 'spouse' כיעד למי שכבר
   * מיוצג/ת שם. מחושב ע"י הקורא דרך `spousePersonAuthorities`.
   */
  spouseAlreadyRepresented?: Partial<Record<RepAuthorityKind, string>>;
}

export default function QuotationRepresentationEditor({
  value, onChange, recipientName, recipientEmail, emailConflict, isTransfer = false, alreadyRepresented,
  spouseAlreadyRepresented,
}: Props) {
  const [showKnown, setShowKnown] = useState(false);
  const p = value.prefill ?? {};
  const married = p.familyStatus === 'married';
  // "לא נשוי" מפורש מכבה את שאלת בן/בת הזוג; מצב לא ידוע ('') משאיר את ברירת
  // המחדל פעילה — אם הלקוח יצהיר בקישור שהוא נשוי, הייצוג יכסה את שניהם.
  const notMarriedExplicit = !!p.familyStatus && p.familyStatus !== 'married';
  const yearLabel = p.familyStatus ? FAMILY_STATUS_YEAR_LABELS[p.familyStatus] : undefined;
  /** ‼ (159) אותו חסם דו-כיווני של הדיאלוג הראשי — ראה spouseTargetBlocked שם. */
  const spouseTargetBlocked = (a: RepAuthorityKind) =>
    !!alreadyRepresented?.[a] || !!spouseAlreadyRepresented?.[a];
  const forSpouse = niCoversSpouse(value) && !notMarriedExplicit
    && !spouseTargetBlocked('nationalInsurance');
  // ‼ רשות שכבר מיוצגת (alreadyRepresented) לעולם לא נכנסת ל-selected — גם
  // אם היא איכשהו נשארה מסומנת ב-state. אין לה שורת בחירה, ואי אפשר לבקש
  // אותה שוב מהמסך הזה. ראה RepresentationOnboardingDialog, אותו כלל.
  const selected = REP_AUTHORITY_ORDER.filter(a => !!value.areas?.[a] && !alreadyRepresented?.[a]);
  const validation = validateQuotationRepresentation(value);

  // ‼ שאלת "עבור מי" מוצגת רק כשידוע שיש בן/בת זוג — כמו בדיאלוג הראשי.
  // רוב ההצעות הן ליחיד, ושאלה שמופיעה בכל אחת מהן מייקרת את ברירת המחדל.
  const spouseKnown = married || !!p.spouseName?.trim();
  /** מע"מ/ניכויים הם תיק אישי (155) — לא נגזר מנישואין, רק מעדות מפורשת. */
  const spouseHasBusiness = !!p.spouseHasBusiness;

  const patch = (next: Partial<QuotationRepresentation>) => onChange({ ...value, ...next });
  const patchPrefill = (next: Partial<typeof p>) => patch({ prefill: { ...p, ...next } });

  /**
   * ‼ מע"מ/ניכויים לא נגזרים מנישואין (155): הצ'יפ "עבור מי" מוצג רק כשיש
   * עדות מפורשת שלבן/בת הזוג יש עסק שאנחנו מנהלים/קולטים (spouseHasBusiness).
   * ביטוח לאומי ברמת-אדם וממשיך להיפתח מנישואין בלבד, בדיוק כמו קודם.
   */
  function showTargets(a: RepAuthorityKind): boolean {
    if (!value.areas?.[a] || !REP_AUTHORITIES_WITH_TARGETS.includes(a)) return false;
    if (spouseTargetBlocked(a)) return false;
    if (a === 'nationalInsurance') return spouseKnown;
    return spouseKnown && spouseHasBusiness;
  }

  /**
   * ‼ קריטי: `defaultQuotationRepresentation` מסמן את כל הרשויות מראש, בלי
   * לדעת על קישור בן-זוג. בלי הניקוי הזה, רשות שכבר "מיוצג/ת" (מוצגת כשורת
   * מידע, לא ניתנת לביטול ידני) הייתה נשארת פעילה ב-`value.areas` ונשלחת
   * שוב באישור ההצעה — בדיוק הכפילות שאסור ליצור. פועל פעם אחת לכל רשות
   * שכבר טופלה (לא חוזר אם הרו"ח יבחר להוסיף אותה מחדש ביודעין... אבל היא
   * לא ניתנת לבחירה מהמסך הזה כלל, ולכן "פעם אחת" תמיד מספיק כאן).
   */
  useEffect(() => {
    if (!alreadyRepresented) return;
    const toStrip = REP_AUTHORITY_ORDER.filter(a => !!alreadyRepresented[a] && !!value.areas?.[a]);
    if (toStrip.length === 0) return;
    const areas = { ...(value.areas ?? {}) };
    for (const a of toStrip) delete areas[a];
    patch({ areas });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [alreadyRepresented, value.areas]);

  function toggleArea(a: RepAuthorityKind) {
    const areas = { ...(value.areas ?? {}) };
    if (areas[a]) delete areas[a];
    // ‼ ראשי גם במעבר מרו"ח אחר (הכרעת גיא 2026-08-18) — משני נרשמים רק
    // כשנשארת אצל הקודם עבודה חוסמת, וזה נגזר במכתב העברת הטיפול.
    else areas[a] = hasLevel(a)
      ? { status: 'in_process', level: 'primary', targets: ['client'] }
      // ‼ ביטוח לאומי הוא "עבור מי" לכל דבר (31.8), אבל ברירת המחדל שלו
      // שונה: ייצוג לשני בני הזוג כשהלקוח נשוי (הכרעה 2026-08-17).
      : { status: 'in_process', targets: ['client', 'spouse'] };
    patch({ areas });
  }

  function setLevel(a: RepAuthorityKind, level: RepLevel) {
    const areas = { ...(value.areas ?? {}) };
    if (areas[a]) areas[a] = { ...areas[a]!, level };
    patch({ areas });
  }

  /** הדלקה/כיבוי של אדם ברשות. אי אפשר לכבות את האחרון — רשות בלי אף אדם
      היא בקשה שאי אפשר להגיש; הלחיצה האחרונה פשוט לא נענית. */
  function toggleTarget(a: RepAuthorityKind, t: RepTarget) {
    const areas = { ...(value.areas ?? {}) };
    const rec = areas[a];
    if (!rec) return;
    const cur = rec.targets && rec.targets.length ? rec.targets : (['client'] as RepTarget[]);
    const next = cur.includes(t) ? cur.filter(x => x !== t) : [...cur, t];
    if (next.length === 0) return;
    areas[a] = { ...rec, targets: next };
    patch({ areas });
  }

  /**
   * שם/ת.ז. של בן־הזוג יושבים גם ב-prefill (למילוי מראש בטופס הלקוח) וגם על
   * החותם השני — ולכן שניהם נכתבים כאן בעדכון אחד. שתי קריאות נפרדות ל-onChange
   * באותו אירוע נגזרות שתיהן מאותו value ישן, והשנייה מוחקת את הראשונה.
   * חותם שני נוצר רק כששמו ידוע; אחרת הלקוח יצהיר בקישור והחותם ייווצר אז.
   */
  function syncSpouse(next: { name?: string; email?: string; idNumber?: string }) {
    const name = (next.name ?? p.spouseName ?? '').trim();
    const email = (next.email ?? value.spouse?.email ?? '').trim();
    const idNumber = (next.idNumber ?? p.spouseIdNumber ?? '').trim();
    onChange({
      ...value,
      prefill: {
        ...p,
        ...(next.name !== undefined ? { spouseName: next.name } : {}),
        ...(next.idNumber !== undefined ? { spouseIdNumber: next.idNumber } : {}),
      },
      spouse: name ? { name, email, idNumber: idNumber || undefined } : null,
    });
  }

  /**
   * ‼ ביטול "יש עסק לבן/בת הזוג" חייב לנקות יעד מע"מ/ניכויים שכבר סומן —
   * אחרת הצ'יפ נעלם (showTargets) אבל היעד נשאר תקוע ב-state ונשלח בשקט.
   * ביטוח לאומי לא נוגע כאן: הוא לא תלוי ב-spouseHasBusiness.
   */
  function setSpouseHasBusiness(on: boolean) {
    const areas = { ...(value.areas ?? {}) };
    if (!on) {
      for (const a of REP_AUTHORITIES_WITH_TARGETS) {
        if (a !== 'nationalInsurance' && areas[a]) areas[a] = { ...areas[a]!, targets: ['client'] };
      }
    }
    onChange({ ...value, areas, prefill: { ...p, spouseHasBusiness: on || undefined } });
  }

  return (
    <div>
      {/* המתג הראשי */}
      <label style={{
        display: 'flex', alignItems: 'flex-start', gap: 9, cursor: 'pointer',
        padding: '10px 12px', borderRadius: 10,
        border: `1px solid ${value.enabled ? 'var(--blue)' : 'var(--gray-200)'}`,
        background: value.enabled ? 'var(--blue-light)' : 'var(--gray-50)',
      }}>
        <input type="checkbox" checked={value.enabled} style={{ marginTop: 3 }}
          onChange={e => patch({ enabled: e.target.checked })} />
        <span>
          <span style={{ display: 'block', fontSize: 13, fontWeight: 600 }}>
            אישור ההצעה פותח את הייצוג אוטומטית
          </span>
          <span style={{ display: 'block', fontSize: 11.5, color: 'var(--gray-600)', lineHeight: 1.6, marginTop: 2 }}>
            ברגע שהלקוח יחתום - ייפתח לו כרטיס לקוח, תיפתח בקשת ייצוג, וקישור השלמת
            הפרטים יוצג לו מיד וגם יישלח במייל. בלי שתצטרך להיכנס למערכת.
          </span>
        </span>
      </label>

      {!value.enabled ? (
        <div style={{ fontSize: 11.5, color: 'var(--gray-500)', marginTop: 10, lineHeight: 1.6 }}>
          ההצעה תישאר הצעת שירות בלבד. אחרי האישור תוכל לפתוח ייצוג ידנית מכפתור
          "הפוך ללקוח והתחל ייצוג".
        </div>
      ) : (
        <>
          <div style={{ fontSize: 11.5, color: 'var(--gray-600)', margin: '14px 0 6px', lineHeight: 1.6 }}>
            הייצוג ייפתח על שם <b>{recipientName || '(נמען ההצעה)'}</b>
            {recipientEmail ? <> · <span dir="ltr">{recipientEmail}</span></> : ''}
          </div>

          {emailConflict && (
            <div style={{ padding: '.6rem .8rem', background: 'var(--blue-light)', color: 'var(--chip-blue-tx)', borderRadius: 8, fontSize: 12, lineHeight: 1.6, marginBottom: 10 }}>
              {emailConflict}
            </div>
          )}

          {/* רשויות */}
          <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--gray-700)', marginBottom: 6 }}>
            אילו רשויות לייצג?
          </div>
          {isTransfer && (
            <div style={{ fontSize: 11.5, color: 'var(--gray-600)', marginBottom: 6, lineHeight: 1.55 }}>
              הלקוח עובר מרו״ח אחר - הייצוג נפתח כמייצג ראשי. אם במכתב העברת
              הטיפול יסומן שנשארו אצלו דוח שנתי או הצהרת הון, הרישום יירד
              למשני עד השלמתם.
            </div>
          )}
          {/* ‼ (160) אותו מודל מנטלי של הדיאלוג הראשי — "כבר קיים" מופרד
              מ"מה נבקש", ולא מעורבב באותה רשימה. הפריסה שונה כי ההקשר שונה
              (מקטע בתוך בונה ההצעה, לא חלון), המשמעות זהה. */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {REP_AUTHORITY_ORDER.filter(a => !!alreadyRepresented?.[a]).map(a => {
              const already = alreadyRepresented?.[a];
              {
                return (
                  <div key={a} style={{
                    display: 'flex', alignItems: 'center', gap: 9, padding: '7px 10px',
                    border: '1px solid var(--gray-200)', background: 'var(--gray-50)', borderRadius: 9,
                  }}>
                    <span style={{ fontSize: 13 }}>{'✓'}</span>
                    <span style={{ flex: 1, fontSize: 13 }}>
                      {REP_AUTHORITY_LABELS[a]}
                      <span style={{ display: 'block', fontSize: 11, color: 'var(--gray-500)', marginTop: 1 }}>
                        כבר מיוצג/ת {'·'} {already} {'·'} אין צורך בבקשה נוספת
                      </span>
                    </span>
                  </div>
                );
              }
            })}
            {REP_AUTHORITY_ORDER.filter(a => !alreadyRepresented?.[a]).map(a => {
              const on = !!value.areas?.[a];
              return (
                <div key={a} onClick={() => toggleArea(a)} style={{
                  display: 'flex', alignItems: 'center', gap: 9, padding: '7px 10px', cursor: 'pointer',
                  flexWrap: 'wrap',
                  border: `1px solid ${on ? 'var(--blue)' : 'var(--gray-200)'}`,
                  background: on ? 'var(--blue-light)' : 'var(--card)', borderRadius: 9,
                }}>
                  <input type="checkbox" checked={on} onChange={() => toggleArea(a)} onClick={e => e.stopPropagation()} />
                  <span style={{ flex: 1, fontSize: 13, fontWeight: on ? 600 : 400 }}>{REP_AUTHORITY_LABELS[a]}</span>
                  {hasLevel(a) ? (
                    <select
                      value={value.areas?.[a]?.level ?? 'primary'} disabled={!on}
                      onChange={e => setLevel(a, e.target.value as RepLevel)}
                      onClick={e => e.stopPropagation()}
                      style={{ width: 'auto', minWidth: 110, fontSize: 12, padding: '.25rem .4rem' }}
                    >
                      <option value="primary">{REP_LEVEL_LABELS.primary}</option>
                      <option value="secondary">{REP_LEVEL_LABELS.secondary}</option>
                    </select>
                  ) : (
                    <span style={{ fontSize: 11, color: 'var(--gray-500)' }}>ייצוג יחיד</span>
                  )}

                  {/* ‼ "עבור מי" בתוך שורת הרשות, כמו ב-RepresentationOnboardingDialog —
                      בחירת הרשות ובחירת האדם הן החלטה אחת. */}
                  {showTargets(a) && (
                    <div style={{ flexBasis: '100%', display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center', paddingInlineStart: 28 }}
                      onClick={e => e.stopPropagation()}>
                      <span style={{ fontSize: 11, color: 'var(--gray-500)' }}>עבור מי?</span>
                      {(['client', 'spouse'] as RepTarget[]).map(t => {
                        const targets = value.areas?.[a]?.targets && value.areas![a]!.targets!.length
                          ? value.areas![a]!.targets!
                          : ['client'];
                        const onT = targets.includes(t);
                        return (
                          <button
                            key={t} type="button"
                            onClick={() => toggleTarget(a, t)}
                            style={{
                              fontSize: 11, padding: '3px 8px', borderRadius: 999, cursor: 'pointer',
                              border: `1px solid ${onT ? 'var(--blue)' : 'var(--gray-300)'}`,
                              background: onT ? 'var(--blue)' : 'var(--card)', color: onT ? '#fff' : 'var(--gray-700)',
                            }}
                          >
                            {onT ? '✓ ' : ''}{t === 'spouse' ? (p.spouseName?.trim() || 'בן/בת הזוג') : (recipientName.trim() || 'הלקוח/ה')}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          <div style={{ fontSize: 11, color: 'var(--gray-500)', marginTop: 6, lineHeight: 1.55 }}>
            מ"ה, ניכויים ומע"מ נכנסים לטופס 2279א'5 (שע"ם). ביטוח לאומי הוא ייצוג
            נפרד עם טופס ואסמכתא משלו - המערכת מטפלת בשניהם באותו תהליך.
          </div>

          {/* ‼ אין כאן יותר צ'קבוקס נפרד לביטוח לאומי (31.8): הוא הצטרף לצ'יפי
              "עבור מי" בתוך שורת הרשות שלמעלה, בדיוק כמו מע"מ וניכויים —
              אותו מודל בדיוק, לא מודל שלישי. */}

          {/* מה שכבר ידוע — כל השאר אופציונלי */}
          <button type="button" className="btn btn-ghost btn-sm"
            style={{ marginTop: 12, padding: 0 }}
            onClick={() => setShowKnown(v => !v)}>
            {showKnown ? '▾' : '▸'} פרטים שכבר ידועים לי (לא חובה)
          </button>
          <div style={{ fontSize: 11, color: 'var(--gray-500)', marginTop: 2, lineHeight: 1.5 }}>
            כל מה שלא תמלא כאן - הלקוח ימלא בעצמו בקישור.
          </div>

          {showKnown && (
            <div style={{ marginTop: 10, padding: 12, border: '1px solid var(--gray-200)', borderRadius: 10, background: 'var(--gray-50)' }}>
              <label style={{ fontSize: 12, color: 'var(--gray-600)', display: 'block' }}>מצב משפחתי
                {/* עדכון אחד בלבד: מצב משפחתי, איפוס השנה, ומחיקת בן/בת הזוג
                    כשכבר לא נשוי — שלוש קריאות נפרדות היו דורסות זו את זו. */}
                <select value={p.familyStatus ?? ''} style={{ marginTop: 4 }}
                  onChange={e => {
                    const fs = e.target.value as FamilyStatus | '';
                    // רק "לא נשוי" מפורש מנקה את בן/בת הזוג; מצב לא ידוע ('')
                    // משאיר הכול — הלקוח יכריע בקישור, והפרטים ישמשו אם נשוי.
                    const dropSpouse = fs !== '' && fs !== 'married';
                    const areas = { ...(value.areas ?? {}) };
                    // ‼ מצטמצם ל-['client'] בכל הרשויות עם "עבור מי" — לא רק ב"ל.
                    // מע"מ/ניכויים שסומנו גם לבן/בת הזוג לפני שהתברר שהלקוח לא
                    // נשוי לא אמורים להישאר עם יעד לאדם שלא קיים.
                    if (dropSpouse) {
                      for (const a of REP_AUTHORITIES_WITH_TARGETS) {
                        if (areas[a]) areas[a] = { ...areas[a]!, targets: ['client'] };
                      }
                    }
                    onChange({
                      ...value,
                      areas,
                      spouse: dropSpouse ? null : value.spouse,
                      prefill: {
                        ...p,
                        familyStatus: fs || undefined,
                        familyStatusYear: undefined,
                        ...(dropSpouse ? { spouseName: undefined, spouseIdNumber: undefined, spouseBirthYear: undefined, spouseHasBusiness: undefined } : {}),
                      },
                    });
                  }}>
                  <option value="">- שהלקוח יבחר -</option>
                  {FAMILY_ORDER.map(f => <option key={f} value={f}>{FAMILY_STATUS_LABELS[f]}</option>)}
                </select>
              </label>
              <div style={{ fontSize: 10.5, color: 'var(--gray-500)', marginTop: 3 }}>
                כפי שרשום בתעודת הזהות - הרשויות בודקות מול מרשם האוכלוסין.
              </div>

              {yearLabel && (
                <label style={{ fontSize: 12, color: 'var(--gray-600)', display: 'block', marginTop: 10 }}>{yearLabel}
                  <input type="number" inputMode="numeric" min={1900} max={CURRENT_YEAR}
                    value={p.familyStatusYear ?? ''} placeholder={`לדוגמה: ${CURRENT_YEAR - 5}`}
                    onChange={e => patchPrefill({ familyStatusYear: e.target.value ? Number(e.target.value) : undefined })}
                    style={{ marginTop: 4 }} />
                </label>
              )}

              {married && (
                <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--gray-200)' }}>
                  <label style={{ display: 'flex', alignItems: 'flex-start', gap: 8, cursor: 'pointer' }}>
                    <input type="checkbox" checked={spouseHasBusiness} style={{ marginTop: 3 }}
                      onChange={e => setSpouseHasBusiness(e.target.checked)} />
                    <span>
                      <span style={{ fontSize: 12, color: 'var(--gray-700)' }}>לבן/בת הזוג יש עסק שאנחנו מנהלים/קולטים בבקשה הזאת</span>
                      <span style={{ display: 'block', fontSize: 11, color: 'var(--gray-500)', marginTop: 2, lineHeight: 1.5 }}>
                        מסמנים רק אם ידוע שיש לבן/בת הזוג תיק מע"מ/ניכויים שנפתח כאן. נישואין בלבד לא אומרים שיש עסק.
                      </span>
                    </span>
                  </label>
                  <label style={{ fontSize: 12, color: 'var(--gray-600)', display: 'block', marginTop: 12 }}>שם בן/בת הזוג
                    <input type="text" value={p.spouseName ?? ''} placeholder="שם פרטי ושם משפחה" style={{ marginTop: 4 }}
                      onChange={e => syncSpouse({ name: e.target.value })} />
                  </label>
                  <label style={{ fontSize: 12, color: 'var(--gray-600)', display: 'block', marginTop: 10 }}>ת.ז. בן/בת הזוג
                    <input type="text" inputMode="numeric" maxLength={9} dir="ltr" placeholder="9 ספרות"
                      value={p.spouseIdNumber ?? ''} style={{ marginTop: 4 }}
                      onChange={e => syncSpouse({ idNumber: e.target.value.replace(/\D/g, '') })} />
                  </label>
                  <div style={{ fontSize: 11, color: 'var(--gray-500)', marginTop: 6, lineHeight: 1.55 }}>
                    נשוי/אה ← שני בני הזוג חותמים על ייפוי הכוח. מה שלא תמלא - הלקוח ימלא בקישור.
                  </div>

                  <label style={{ fontSize: 12, color: 'var(--gray-600)', display: 'block', marginTop: 10 }}>
                    שנת לידה של בן/בת הזוג
                    <input type="number" inputMode="numeric" dir="ltr" min={1900} max={CURRENT_YEAR}
                      value={p.spouseBirthYear ?? ''} placeholder={`לדוגמה: ${CURRENT_YEAR - 40}`}
                      onChange={e => patchPrefill({ spouseBirthYear: e.target.value ? Number(e.target.value) : undefined })}
                      style={{ marginTop: 4 }} />
                  </label>
                  {/* לא חובה: המייל נדרש רק אם יבחרו לשלוח לבן/בת הזוג קישור
                      חתימה נפרד — והבחירה הזאת נעשית בשלב החתימה, לא כאן. */}
                  <label style={{ fontSize: 12, color: 'var(--gray-600)', display: 'block', marginTop: 10 }}>אימייל של בן/בת הזוג
                    <EmailInput placeholder="spouse@example.com"
                      value={value.spouse?.email ?? ''} style={{ marginTop: 4 }}
                      onChange={e => syncSpouse({ email: e.target.value })} />
                  </label>
                  <div style={{ fontSize: 10.5, color: 'var(--gray-500)', marginTop: 4, lineHeight: 1.5 }}>
                    גם אלה לא חובה. בלי מייל - הלקוח יבחר בשלב החתימה אם לחתום יחד או לשלוח קישור אישי.
                  </div>
                </div>
              )}
            </div>
          )}

          {validation && (
            <div style={{ marginTop: 10, padding: '.55rem .8rem', background: 'var(--orange-light, #fff7ed)', color: 'var(--gray-800)', borderRadius: 8, fontSize: 11.5, lineHeight: 1.6 }}>
              {validation}
            </div>
          )}

          {/* מה ייווצר — אותו סיכום של דיאלוג הייצוג, כדי שלא תהיה הפתעה */}
          <div style={{ marginTop: 12, padding: '10px 12px', background: 'var(--gray-50)', borderRadius: 9, fontSize: 11.5, color: 'var(--gray-700)', lineHeight: 1.8 }}>
            <div style={{ fontWeight: 600, marginBottom: 2 }}>מה ייווצר עם האישור</div>
            <div>כרטיס לקוח - {recipientName || 'נמען ההצעה'}</div>
            <div>{selected.length > 0 ? `${selected.length} סטטוסי ייצוג "בתהליך": ${selected.map(a => REP_AUTHORITY_LABELS[a]).join(', ')}` : 'בחר רשויות'}</div>
            <div>בקשת ייצוג + קישור השלמת פרטים ללקוח</div>
            <div>משימה פנימית למעקב</div>
            <div>ההצעה החתומה נשמרת כהסכם התקשרות במסמכי הלקוח</div>
            {value.spouse?.name && <div>חותם שני - {value.spouse.name}</div>}
            {married && !value.spouse?.name && <div>חותם שני - הלקוח ימלא את פרטי בן/בת הזוג בקישור</div>}
            {forSpouse && <div>ייצוג נפרד בב"ל לבן/בת הזוג {married ? '' : '(אם הלקוח נשוי) '}- שתי אסמכתאות</div>}
          </div>
        </>
      )}
    </div>
  );
}

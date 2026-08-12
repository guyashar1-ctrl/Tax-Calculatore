// ─── הגדרת הייצוג שייפתח עם אישור ההצעה ─────────────────────────────────────
// אותן שאלות בדיוק של דיאלוג "קישור ייצוג חדש" (RepresentationOnboardingDialog),
// רק שהן נשאלות מראש: ברגע שהלקוח מאשר את ההצעה אין אף אחד שיבחר רשויות, ולכן
// הבחירה חייבת להיות שמורה על ההצעה. מה שלא ימולא כאן — הלקוח ימלא בקישור.

import { useState } from 'react';
import {
  RepAuthorityKind,
  RepLevel,
  REP_AUTHORITY_ORDER,
  REP_AUTHORITY_LABELS,
  REP_AUTHORITIES_WITH_LEVEL,
  REP_LEVEL_LABELS,
  FamilyStatus,
  FAMILY_STATUS_LABELS,
  FAMILY_STATUS_YEAR_LABELS,
} from '../../types';
import type { QuotationRepresentation } from '../../types/quotations';
import { isValidIsraeliId } from '../../utils/israeliId';

const FAMILY_ORDER: FamilyStatus[] = ['single', 'married', 'divorced', 'widowed', 'singleParent'];
const CURRENT_YEAR = new Date().getFullYear();
const hasLevel = (a: RepAuthorityKind) => REP_AUTHORITIES_WITH_LEVEL.includes(a);

const isValidEmail = (email: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());

/** האם נלקח ייצוג ב"ל גם עבור בן/בת הזוג — התנאי שהופך את פרטיו לחובה. */
export function niCoversSpouse(rep: QuotationRepresentation): boolean {
  return !!rep.areas?.nationalInsurance?.coversSpouse;
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
    if (!Number.isInteger(y) || y < 1900 || y > CURRENT_YEAR) return `${yearLabel} — יש להזין שנה תקינה.`;
  }
  if (p.spouseIdNumber && !isValidIsraeliId(p.spouseIdNumber)) {
    return 'תעודת הזהות של בן/בת הזוג אינה תקינה.';
  }
  if (rep.spouse?.email && !isValidEmail(rep.spouse.email)) {
    return 'כתובת האימייל של בן/בת הזוג אינה תקינה.';
  }
  // בלי שם, ת.ז. ושנת לידה אי אפשר להזין ייפוי כוח בב"ל על שם בן/בת הזוג,
  // ואין מי שישלים אותם ברגע האישור — ולכן הם חובה כבר כאן.
  if (niCoversSpouse(rep)) {
    if (!p.spouseName?.trim()) return 'ייצוג בב"ל לבן/בת הזוג — יש להזין את שמו/ה.';
    if (!p.spouseIdNumber?.trim()) return 'ייצוג בב"ל לבן/בת הזוג — יש להזין את תעודת הזהות שלו/ה.';
    const by = Number(p.spouseBirthYear);
    if (!p.spouseBirthYear || !Number.isInteger(by) || by < 1900 || by > CURRENT_YEAR) {
      return 'ייצוג בב"ל לבן/בת הזוג — יש להזין שנת לידה תקינה.';
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
}

export default function QuotationRepresentationEditor({
  value, onChange, recipientName, recipientEmail, emailConflict, isTransfer = false,
}: Props) {
  const [showKnown, setShowKnown] = useState(false);
  const [separateSpouseEmail, setSeparateSpouseEmail] = useState(!!value.spouse?.email);
  const p = value.prefill ?? {};
  const married = p.familyStatus === 'married';
  const yearLabel = p.familyStatus ? FAMILY_STATUS_YEAR_LABELS[p.familyStatus] : undefined;
  const niSelected = !!value.areas?.nationalInsurance;
  const forSpouse = niCoversSpouse(value);
  const selected = REP_AUTHORITY_ORDER.filter(a => !!value.areas?.[a]);
  const validation = validateQuotationRepresentation(value);

  const patch = (next: Partial<QuotationRepresentation>) => onChange({ ...value, ...next });
  const patchPrefill = (next: Partial<typeof p>) => patch({ prefill: { ...p, ...next } });

  function toggleArea(a: RepAuthorityKind) {
    const areas = { ...(value.areas ?? {}) };
    if (areas[a]) delete areas[a];
    else areas[a] = hasLevel(a)
      ? { status: 'in_process', level: isTransfer ? 'secondary' : 'primary' }
      : { status: 'in_process' };
    patch({ areas });
  }

  function setLevel(a: RepAuthorityKind, level: RepLevel) {
    const areas = { ...(value.areas ?? {}) };
    if (areas[a]) areas[a] = { ...areas[a]!, level };
    patch({ areas });
  }

  function setNiForSpouse(on: boolean) {
    const areas = { ...(value.areas ?? {}) };
    if (areas.nationalInsurance) {
      areas.nationalInsurance = { ...areas.nationalInsurance, coversSpouse: on || undefined };
    }
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
            ברגע שהלקוח יחתום — ייפתח לו כרטיס לקוח, תיפתח בקשת ייצוג, וקישור השלמת
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
              הלקוח עובר מרו״ח אחר — הייצוג נפתח כמייצג משני. אפשר לשנות.
            </div>
          )}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {REP_AUTHORITY_ORDER.map(a => {
              const on = !!value.areas?.[a];
              return (
                <div key={a} onClick={() => toggleArea(a)} style={{
                  display: 'flex', alignItems: 'center', gap: 9, padding: '7px 10px', cursor: 'pointer',
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
                </div>
              );
            })}
          </div>
          <div style={{ fontSize: 11, color: 'var(--gray-500)', marginTop: 6, lineHeight: 1.55 }}>
            מ"ה, ניכויים ומע"מ נכנסים לטופס 2279א'5 (שע"ם). ביטוח לאומי הוא ייצוג
            נפרד עם טופס ואסמכתא משלו — המערכת מטפלת בשניהם באותו תהליך.
          </div>

          {/* מה שכבר ידוע — כל השאר אופציונלי */}
          <button type="button" className="btn btn-ghost btn-sm"
            style={{ marginTop: 12, padding: 0 }}
            onClick={() => setShowKnown(v => !v)}>
            {showKnown ? '▾' : '▸'} פרטים שכבר ידועים לי (לא חובה)
          </button>
          <div style={{ fontSize: 11, color: 'var(--gray-500)', marginTop: 2, lineHeight: 1.5 }}>
            כל מה שלא תמלא כאן — הלקוח ימלא בעצמו בקישור.
          </div>

          {showKnown && (
            <div style={{ marginTop: 10, padding: 12, border: '1px solid var(--gray-200)', borderRadius: 10, background: 'var(--gray-50)' }}>
              <label style={{ fontSize: 12, color: 'var(--gray-600)', display: 'block' }}>מצב משפחתי
                {/* עדכון אחד בלבד: מצב משפחתי, איפוס השנה, ומחיקת בן/בת הזוג
                    כשכבר לא נשוי — שלוש קריאות נפרדות היו דורסות זו את זו. */}
                <select value={p.familyStatus ?? ''} style={{ marginTop: 4 }}
                  onChange={e => {
                    const fs = e.target.value as FamilyStatus | '';
                    const stillMarried = fs === 'married';
                    const areas = { ...(value.areas ?? {}) };
                    if (!stillMarried && areas.nationalInsurance) {
                      areas.nationalInsurance = { ...areas.nationalInsurance, coversSpouse: undefined };
                    }
                    onChange({
                      ...value,
                      areas,
                      spouse: stillMarried ? value.spouse : null,
                      prefill: {
                        ...p,
                        familyStatus: fs || undefined,
                        familyStatusYear: undefined,
                        ...(stillMarried ? {} : { spouseName: undefined, spouseIdNumber: undefined, spouseBirthYear: undefined }),
                      },
                    });
                  }}>
                  <option value="">— שהלקוח יבחר —</option>
                  {FAMILY_ORDER.map(f => <option key={f} value={f}>{FAMILY_STATUS_LABELS[f]}</option>)}
                </select>
              </label>
              <div style={{ fontSize: 10.5, color: 'var(--gray-500)', marginTop: 3 }}>
                כפי שרשום בתעודת הזהות — הרשויות בודקות מול מרשם האוכלוסין.
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
                  <label style={{ fontSize: 12, color: 'var(--gray-600)', display: 'block' }}>שם בן/בת הזוג
                    <input type="text" value={p.spouseName ?? ''} placeholder="שם פרטי ושם משפחה" style={{ marginTop: 4 }}
                      onChange={e => syncSpouse({ name: e.target.value })} />
                  </label>
                  <label style={{ fontSize: 12, color: 'var(--gray-600)', display: 'block', marginTop: 10 }}>ת.ז. בן/בת הזוג
                    <input type="text" inputMode="numeric" maxLength={9} dir="ltr" placeholder="9 ספרות"
                      value={p.spouseIdNumber ?? ''} style={{ marginTop: 4 }}
                      onChange={e => syncSpouse({ idNumber: e.target.value.replace(/\D/g, '') })} />
                  </label>
                  <div style={{ fontSize: 11, color: 'var(--gray-500)', marginTop: 6, lineHeight: 1.55 }}>
                    נשוי/אה ← שני בני הזוג חותמים על ייפוי הכוח. מה שלא תמלא — הלקוח ימלא בקישור.
                  </div>

                  {/* חתימה ≠ ייצוג. בב"ל לכל מבוטח תיק נפרד, ולכן ייצוג של שני
                      בני הזוג הוא שני ייפויי כוח ושתי אסמכתאות — כאן בוחרים. */}
                  {niSelected && (
                    <div style={{
                      marginTop: 10, padding: '9px 10px', borderRadius: 9,
                      border: `1px solid ${forSpouse ? 'var(--blue)' : 'var(--gray-200)'}`,
                      background: forSpouse ? 'var(--blue-light)' : 'var(--card)',
                    }}>
                      <label style={{ display: 'flex', alignItems: 'flex-start', gap: 8, cursor: 'pointer' }}>
                        <input type="checkbox" checked={forSpouse} style={{ marginTop: 3 }}
                          onChange={e => setNiForSpouse(e.target.checked)} />
                        <span>
                          <span style={{ fontSize: 12.5, fontWeight: 600 }}>ייצוג בביטוח לאומי גם לבן/בת הזוג</span>
                          <span style={{ display: 'block', fontSize: 11, color: 'var(--gray-600)', lineHeight: 1.6, marginTop: 2 }}>
                            בב"ל לכל אחד תיק נפרד: שני ייפויי כוח, שתי אסמכתאות, וכל אחד מאשר את שלו.
                            במ"ה ובמע"מ ייצוג אחד מכסה את התא המשפחתי.
                          </span>
                        </span>
                      </label>
                      {forSpouse && (
                        <label style={{ fontSize: 12, color: 'var(--gray-600)', display: 'block', marginTop: 8 }}>
                          שנת לידה של בן/בת הזוג
                          <input type="number" inputMode="numeric" dir="ltr" min={1900} max={CURRENT_YEAR}
                            value={p.spouseBirthYear ?? ''} placeholder={`לדוגמה: ${CURRENT_YEAR - 40}`}
                            onChange={e => patchPrefill({ spouseBirthYear: e.target.value ? Number(e.target.value) : undefined })}
                            style={{ marginTop: 4 }} />
                          <span style={{ display: 'block', fontSize: 10.5, color: 'var(--gray-500)', marginTop: 3 }}>
                            נדרשת בטופס ייפוי הכוח של הביטוח הלאומי.
                          </span>
                        </label>
                      )}
                    </div>
                  )}

                  {p.spouseName?.trim() && (
                    <>
                      {/* מייל ריק ⇒ שתי בקשות החתימה נשלחות למייל של הנישום */}
                      <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 12, color: 'var(--gray-700)', margin: '10px 0' }}>
                        <input type="checkbox" checked={separateSpouseEmail}
                          onChange={e => { setSeparateSpouseEmail(e.target.checked); if (!e.target.checked) syncSpouse({ email: '' }); }} />
                        לבן/בת הזוג יש מייל נפרד לחתימה
                      </label>
                      {separateSpouseEmail ? (
                        <label style={{ fontSize: 12, color: 'var(--gray-600)', display: 'block' }}>אימייל של בן/בת הזוג
                          <input type="email" dir="ltr" placeholder="spouse@example.com"
                            value={value.spouse?.email ?? ''} style={{ marginTop: 4 }}
                            onChange={e => syncSpouse({ email: e.target.value })} />
                        </label>
                      ) : (
                        <div style={{ fontSize: 11, color: 'var(--gray-500)', lineHeight: 1.55 }}>
                          שתי בקשות החתימה יישלחו אל <span dir="ltr">{recipientEmail || 'המייל של הלקוח'}</span>.
                        </div>
                      )}
                    </>
                  )}
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
            <div>כרטיס לקוח — {recipientName || 'נמען ההצעה'}</div>
            <div>{selected.length > 0 ? `${selected.length} סטטוסי ייצוג "בתהליך": ${selected.map(a => REP_AUTHORITY_LABELS[a]).join(', ')}` : 'בחר רשויות'}</div>
            <div>בקשת ייצוג + קישור השלמת פרטים ללקוח</div>
            <div>משימה פנימית למעקב</div>
            <div>ההצעה החתומה נשמרת כהסכם התקשרות במסמכי הלקוח</div>
            {value.spouse?.name && <div>חותם שני — {value.spouse.name}</div>}
            {forSpouse && <div>ייצוג נפרד בב"ל לבן/בת הזוג — שתי אסמכתאות</div>}
          </div>
        </>
      )}
    </div>
  );
}

import { useState } from 'react';
import {
  AuthorityRepresentations,
  RepAuthorityKind,
  RepLevel,
  REP_AUTHORITY_ORDER,
  REP_AUTHORITY_LABELS,
  REP_AUTHORITIES_WITH_LEVEL,
  REP_LEVEL_LABELS,
} from '../types';

interface CreateResult { link: string; emailSent: boolean; emailError?: string; }

interface SpouseInput { name: string; email: string; }

interface Props {
  onCreate: (data: { name: string; email: string; areas: AuthorityRepresentations; spouse: SpouseInput | null }) => Promise<CreateResult>;
  onCancel: () => void;
  /** בודק אם המייל כבר בשימוש בייצוג פעיל/בתהליך. מחזיר הודעת חסימה, או null אם פנוי. */
  checkEmailConflict?: (email: string) => string | null;
  /** ערכי פתיחה — לזרימת "הפוך ליד ללקוח" מהצעת מחיר מאושרת. */
  initialName?: string;
  initialEmail?: string;
}

interface AreaState {
  selected: boolean;
  level: RepLevel;
}

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}

const hasLevel = (a: RepAuthorityKind) => REP_AUTHORITIES_WITH_LEVEL.includes(a);

export default function RepresentationOnboardingDialog({ onCreate, onCancel, checkEmailConflict, initialName, initialEmail }: Props) {
  const [name, setName] = useState(initialName ?? '');
  const [email, setEmail] = useState(initialEmail ?? '');
  // ── בן/בת זוג ──
  const [married, setMarried] = useState(false);
  const [spouseName, setSpouseName] = useState('');
  const [spouseEmail, setSpouseEmail] = useState('');
  // ברירת מחדל: כל אחד מקבל בקשת חתימה למייל שלו (לא מסומן).
  const [sameSigningEmail, setSameSigningEmail] = useState(false);
  const [areas, setAreas] = useState<Record<RepAuthorityKind, AreaState>>({
    incomeTax: { selected: true, level: 'primary' },
    withholding: { selected: false, level: 'primary' },
    vat: { selected: true, level: 'primary' },
    nationalInsurance: { selected: true, level: 'primary' },
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<CreateResult | null>(null);
  const [copied, setCopied] = useState(false);

  const selectedKeys = REP_AUTHORITY_ORDER.filter(a => areas[a].selected);
  const emailConflict = checkEmailConflict && isValidEmail(email) ? checkEmailConflict(email) : null;

  function toggleArea(a: RepAuthorityKind) {
    setAreas(prev => ({ ...prev, [a]: { ...prev[a], selected: !prev[a].selected } }));
  }

  function setLevel(a: RepAuthorityKind, level: RepLevel) {
    setAreas(prev => ({ ...prev, [a]: { ...prev[a], level } }));
  }

  function validate(): string | null {
    if (!name.trim()) return 'יש להזין שם לקוח';
    if (!email.trim()) return 'יש להזין אימייל';
    if (!isValidEmail(email)) return 'כתובת אימייל לא תקינה';
    if (emailConflict) return emailConflict;
    if (married) {
      if (!spouseName.trim()) return 'יש להזין שם בן/בת הזוג';
      if (!sameSigningEmail && !isValidEmail(spouseEmail)) return 'כתובת אימייל של בן/בת הזוג לא תקינה';
    }
    if (selectedKeys.length === 0) return 'יש לבחור לפחות רשות אחת לייצוג';
    return null;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const validationError = validate();
    if (validationError) {
      setError(validationError);
      return;
    }
    const built: AuthorityRepresentations = {};
    for (const a of selectedKeys) {
      built[a] = hasLevel(a)
        ? { status: 'in_process', level: areas[a].level }
        : { status: 'in_process' };
    }
    const spouse: SpouseInput | null = married
      ? { name: spouseName.trim(), email: (sameSigningEmail ? email : spouseEmail).trim() }
      : null;
    setBusy(true);
    setError(null);
    try {
      const res = await onCreate({ name: name.trim(), email: email.trim(), areas: built, spouse });
      setResult(res);
    } catch (err) {
      console.error('Representation onboarding failed:', err);
      setError(extractErrorMessage(err));
      setBusy(false);
    }
  }

  function extractErrorMessage(e: unknown): string {
    if (typeof e === 'string') return e;
    if (e && typeof e === 'object') {
      const obj = e as { message?: string; details?: string; hint?: string };
      const parts = [obj.message, obj.details, obj.hint].filter(Boolean);
      if (parts.length > 0) return parts.join(' — ');
    }
    return 'שגיאה לא ידועה ביצירת בקשת הייצוג';
  }

  if (result) {
    return (
      <div className="modal-backdrop" onClick={(e) => { if (e.target === e.currentTarget) onCancel(); }}>
        <div className="modal task-modal">
          <div className="modal-header">
            <h3>✓ בקשת הייצוג נוצרה</h3>
            <button type="button" className="btn btn-ghost btn-sm" onClick={onCancel}>✕</button>
          </div>
          <div className="modal-body">
            {result.emailSent ? (
              <div style={{ padding: '.7rem .9rem', background: 'var(--green-light)', borderRadius: 'var(--radius)', color: 'var(--green-dark, var(--ok))', fontSize: '.9rem', marginBottom: '1rem' }}>
                📧 מייל הזדהות נשלח אוטומטית ללקוח (<span dir="ltr">{email.trim()}</span>).
              </div>
            ) : (
              <div style={{ padding: '.7rem .9rem', background: 'var(--orange-light)', borderRadius: 'var(--radius)', color: 'var(--gray-800)', fontSize: '.85rem', marginBottom: '1rem', lineHeight: 1.6 }}>
                ⚠ המייל לא נשלח אוטומטית{result.emailError ? ` (${result.emailError})` : ''}. אפשר להעתיק את הקישור ולשלוח ידנית.
              </div>
            )}
            <div style={{ fontSize: '.8rem', color: 'var(--gray-600)', marginBottom: '.35rem' }}>קישור ההזדהות של הלקוח:</div>
            <div style={{ display: 'flex', gap: '.5rem', marginBottom: '.5rem' }}>
              <input readOnly value={result.link} dir="ltr" style={{ flex: 1, textAlign: 'left', fontSize: '.8rem', fontFamily: 'var(--font-mono, monospace)' }} onFocus={e => e.currentTarget.select()} />
              <button
                type="button"
                className="btn btn-primary"
                onClick={async () => { try { await navigator.clipboard.writeText(result.link); setCopied(true); setTimeout(() => setCopied(false), 2000); } catch { /* ignore */ } }}
              >
                {copied ? '✓ הועתק' : 'העתק'}
              </button>
            </div>
            <p style={{ fontSize: '.75rem', color: 'var(--gray-500)' }}>הקישור ייחודי ללקוח זה ומאובטח.</p>
          </div>
          <div className="modal-footer">
            <button type="button" className="btn btn-primary" onClick={onCancel}>סיום</button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="modal-backdrop" onClick={(e) => { if (e.target === e.currentTarget) onCancel(); }}>
      <form className="modal task-modal" onSubmit={handleSubmit}>
        <div className="modal-header">
          <h3>📨 בקשת ייצוג חדשה</h3>
          <button type="button" className="btn btn-ghost btn-sm" onClick={onCancel} disabled={busy}>✕</button>
        </div>

        <div className="modal-body">
          {/* פרטי הלקוח */}
          <div className="form-grid form-grid-2">
            <div className="form-group">
              <label className="required">שם הלקוח</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="שם פרטי ושם משפחה"
                autoFocus
                disabled={busy}
              />
            </div>
            <div className="form-group">
              <label className="required">אימייל</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="client@example.com"
                dir="ltr"
                disabled={busy}
                style={emailConflict ? { borderColor: 'var(--red)' } : undefined}
              />
              {emailConflict && (
                <div style={{ marginTop: '.4rem', fontSize: '.8rem', color: 'var(--red)', lineHeight: 1.5 }}>
                  ⛔ {emailConflict}
                </div>
              )}
            </div>
          </div>

          {/* בן/בת זוג — כשנשוי, שני בני הזוג חותמים על ייפוי הכוח */}
          <div style={{ marginTop: '1rem', padding: '.75rem .9rem', border: `1px solid ${married ? 'var(--blue)' : 'var(--gray-200)'}`, borderRadius: 'var(--radius)', background: married ? 'var(--blue-light)' : 'var(--card)' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: '.6rem', cursor: busy ? 'default' : 'pointer', fontWeight: 600, fontSize: '.9rem' }}>
              <input type="checkbox" checked={married} onChange={e => setMarried(e.target.checked)} disabled={busy} />
              💍 הלקוח/ה נשוי/אה — צריך גם חתימת בן/בת הזוג
            </label>

            {married && (
              <div style={{ marginTop: '.85rem', display: 'flex', flexDirection: 'column', gap: '.75rem' }}>
                <div className="form-group">
                  <label className="required">שם בן/בת הזוג</label>
                  <input type="text" value={spouseName} onChange={e => setSpouseName(e.target.value)} placeholder="שם פרטי ושם משפחה" disabled={busy} />
                </div>

                <label style={{ display: 'flex', alignItems: 'center', gap: '.5rem', cursor: busy ? 'default' : 'pointer', fontSize: '.85rem', color: 'var(--gray-700)' }}>
                  <input type="checkbox" checked={sameSigningEmail} onChange={e => setSameSigningEmail(e.target.checked)} disabled={busy} />
                  ✉ שלח את כל בקשות החתימה לאותו מייל (המייל של הלקוח למעלה)
                </label>

                {sameSigningEmail ? (
                  <div style={{ fontSize: '.8rem', color: 'var(--gray-700)', background: 'var(--gray-50)', padding: '.55rem .75rem', borderRadius: 'var(--radius)', lineHeight: 1.6 }}>
                    שתי בקשות החתימה — של {name.trim() || 'הלקוח'} ושל {spouseName.trim() || 'בן/בת הזוג'} — יישלחו ל<span dir="ltr">{email.trim() || 'מייל הלקוח'}</span>.
                  </div>
                ) : (
                  <div className="form-group">
                    <label className="required">אימייל של בן/בת הזוג</label>
                    <input type="email" value={spouseEmail} onChange={e => setSpouseEmail(e.target.value)} placeholder="spouse@example.com" dir="ltr" disabled={busy} />
                    <div style={{ fontSize: '.78rem', color: 'var(--gray-500)', marginTop: '.35rem' }}>בקשת החתימה של בן/בת הזוג תישלח לכתובת הזו.</div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* רשויות לבקשת ייצוג */}
          <div style={{ marginTop: '1.25rem' }}>
            <label style={{ display: 'block', fontWeight: 600, fontSize: '.85rem', color: 'var(--gray-700)', marginBottom: '.5rem' }}>
              רשויות לבקשת ייצוג <span style={{ color: 'var(--red)' }}>*</span>
            </label>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '.5rem' }}>
              {REP_AUTHORITY_ORDER.map(a => {
                const st = areas[a];
                return (
                  <div
                    key={a}
                    onClick={() => !busy && toggleArea(a)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '.75rem',
                      padding: '.6rem .8rem',
                      border: `1px solid ${st.selected ? 'var(--blue)' : 'var(--gray-200)'}`,
                      background: st.selected ? 'var(--blue-light)' : 'var(--card)',
                      borderRadius: 'var(--radius)',
                      cursor: busy ? 'default' : 'pointer',
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={st.selected}
                      onChange={() => toggleArea(a)}
                      onClick={(e) => e.stopPropagation()}
                      disabled={busy}
                    />
                    <span style={{ flex: 1, fontSize: '.95rem', fontWeight: st.selected ? 600 : 400 }}>
                      {REP_AUTHORITY_LABELS[a]}
                    </span>
                    {hasLevel(a) ? (
                      <select
                        value={st.level}
                        onChange={(e) => setLevel(a, e.target.value as RepLevel)}
                        onClick={(e) => e.stopPropagation()}
                        disabled={busy || !st.selected}
                        style={{ width: 'auto', minWidth: 130 }}
                      >
                        <option value="primary">{REP_LEVEL_LABELS.primary}</option>
                        <option value="secondary">{REP_LEVEL_LABELS.secondary}</option>
                      </select>
                    ) : (
                      <span style={{ fontSize: '.78rem', color: 'var(--gray-500)' }}>ℹ ייצוג יחיד — ללא סוג</span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* מה ייווצר */}
          <div style={{
            marginTop: '1.25rem',
            padding: '.75rem .9rem',
            background: 'var(--gray-50)',
            borderRadius: 'var(--radius)',
            fontSize: '.83rem',
            color: 'var(--gray-700)',
          }}>
            <div style={{ fontWeight: 600, marginBottom: '.4rem' }}>✨ מה ייווצר אוטומטית בשליחה</div>
            <div>✓ כרטיס לקוח חדש — מסומן "טרם מיוצג"</div>
            <div>✓ התקשרות ייצוג למעקב התהליך</div>
            <div>
              ✓ {married
                ? `2 חותמים — ${name.trim() || 'הלקוח'} ו-${spouseName.trim() || 'בן/בת הזוג'}${sameSigningEmail ? ' (לאותו מייל)' : ' (כל אחד למייל שלו)'}`
                : 'חותם אחד — הנישום'}
            </div>
            <div>✓ משימה פנימית: "להשלים ייצוג{name.trim() ? ` — ${name.trim()}` : ''}"</div>
            <div>
              ✓ {selectedKeys.length > 0
                ? `${selectedKeys.length} סטטוסי ייצוג "בתהליך": ${selectedKeys.map(a => REP_AUTHORITY_LABELS[a]).join(', ')}`
                : 'בחר רשויות כדי ליצור סטטוסי ייצוג'}
            </div>
          </div>

          {error && (
            <div style={{
              marginTop: '1rem',
              padding: '.65rem .85rem',
              background: 'var(--red-light)',
              color: 'var(--red)',
              borderRadius: 'var(--radius)',
              fontSize: '.875rem',
            }}>
              {error}
            </div>
          )}
        </div>

        <div className="modal-footer">
          <button type="button" className="btn btn-ghost" onClick={onCancel} disabled={busy}>
            ביטול
          </button>
          <button type="submit" className="btn btn-primary" disabled={busy || !!emailConflict}>
            {busy ? 'יוצר…' : '📨 שליחה'}
          </button>
        </div>
      </form>
    </div>
  );
}

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

import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { FirmBranding } from '../types/firmProfile';
import { deriveQuotationBrand } from './quotations/quotationBranding';

interface Props {
  token: string;
}

type Bucket = 'action' | 'office' | 'done' | 'future';

interface PortalItem {
  bucket: Bucket;
  key: string;
  label: string;
  sub?: string;
  /** 'portal' = הפעולה נעשית כאן בעמוד, בלי לנווט לטוקן אחר. */
  actionKind?: 'onboard' | 'sign' | 'intake' | 'external' | 'quote' | 'portal';
  actionValue?: string;
  /** מה בדיוק הפעולה בתוך העמוד. */
  kind?: 'documents' | 'prev_accountant';
  /** רשימת המסמכים שביקשנו — מה התקבל ומה עוד חסר. */
  checklist?: { label: string; done: boolean }[];
}

/** תחנות המסע כפי שהלקוח מבין אותן. השרת מחזיר את התחנה הנוכחית. */
type JourneyStage = 'quote' | 'identity' | 'setup' | 'active';

const JOURNEY: { id: JourneyStage; label: string }[] = [
  { id: 'quote',    label: 'הצעה' },
  { id: 'identity', label: 'אימות וייצוג' },
  { id: 'setup',    label: 'התחברות' },
  { id: 'active',   label: 'עובדים ביחד' },
];

interface PortalData {
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

/** טופס פרטי הרו"ח הקודם — הדבר היחיד שהלקוח כותב ישירות מהדף האישי. */
function PrevAccountantForm({ token, stepId, brand, accent, onDone }: {
  token: string; stepId: string;
  brand: { ink: string; muted: string; border: string; radius: number };
  accent: string; onDone: () => void;
}) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function submit() {
    setErr(null);
    if (!name.trim() && !email.trim()) { setErr('צריך לפחות שם או אימייל.'); return; }
    setBusy(true);
    const { data, error } = await supabase.rpc('portal_submit_step', {
      p_token: token, p_step_id: stepId, p_data: { name, email, phone },
    });
    setBusy(false);
    const res = data as { ok?: boolean } | null;
    if (error || !res?.ok) { setErr('לא הצלחנו לשמור. אפשר לנסות שוב.'); return; }
    onDone();
  }

  const field = {
    width: '100%', padding: '8px 10px', fontSize: 14, color: brand.ink,
    border: `1px solid ${brand.border}`, borderRadius: brand.radius, background: '#fff',
  } as const;

  return (
    <div style={{ display: 'grid', gap: 8, marginTop: 10, maxWidth: 420 }}>
      <input style={field} value={name} onChange={e => setName(e.target.value)}
        placeholder="שם רואה החשבון או המשרד" disabled={busy} />
      <input style={{ ...field, direction: 'ltr', textAlign: 'right' }} value={email} type="email"
        onChange={e => setEmail(e.target.value)} placeholder="אימייל" disabled={busy} />
      <input style={{ ...field, direction: 'ltr', textAlign: 'right' }} value={phone} type="tel"
        onChange={e => setPhone(e.target.value)} placeholder="טלפון (אופציונלי)" disabled={busy} />
      {err && <span style={{ fontSize: 12.5, color: '#a63a3a' }}>{err}</span>}
      <button type="button" onClick={() => void submit()} disabled={busy} style={{
        justifySelf: 'start', border: 'none', cursor: 'pointer',
        fontSize: 13.5, fontWeight: 600, padding: '9px 20px',
        color: '#fff', background: accent, borderRadius: brand.radius,
      }}>{busy ? 'שומר…' : 'שליחה'}</button>
    </div>
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
      const { data: res, error } = await supabase.rpc('get_client_portal', { p_token: token });
      if (cancelled) return;
      const row = res as (PortalData & { ok?: boolean }) | null;
      if (error || !row?.ok) { setPhase('invalid'); return; }
      setData(row);
      setPhase('ready');
    })();
    return () => { cancelled = true; };
  }, [token, reloadKey]);

  const brand = deriveQuotationBrand({
    id: '', firmName: data?.firmName, branding: data?.branding ?? {},
    communication: {}, settings: {},
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any);
  const ink = brand.ink;
  const accent = brand.accent;

  const page: React.CSSProperties = {
    minHeight: '100vh', background: brand.pageBg, display: 'flex', alignItems: 'flex-start',
    justifyContent: 'center', padding: '40px 16px', fontFamily: `'${brand.font}', sans-serif`, direction: 'rtl',
  };
  const card: React.CSSProperties = {
    width: 560, maxWidth: '100%', background: brand.cardBg, border: `1px solid ${brand.border}`,
    borderRadius: brand.radius + 4, padding: '30px 30px 22px', borderTop: `4px solid ${accent}`,
  };
  const sectionTitle: React.CSSProperties = {
    fontSize: 12.5, fontWeight: 700, color: brand.muted, margin: '20px 0 4px', letterSpacing: '.02em',
  };

  function Header() {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 18 }}>
        {brand.logoUrl ? (
          <img src={brand.logoUrl} alt={data?.firmName}
            style={{ maxHeight: 40 * brand.logoScale, maxWidth: 180 * brand.logoScale, objectFit: 'contain' }} />
        ) : (
          <>
            <div style={{
              width: 34, height: 34, borderRadius: '50%', border: `1.5px solid ${ink}`,
              display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, color: ink,
            }}>{brand.monogram}</div>
            <div style={{ fontSize: 14, color: ink }}>{data?.firmName}</div>
          </>
        )}
      </div>
    );
  }

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

  const actions = data.items.filter(i => i.bucket === 'action');
  const office  = data.items.filter(i => i.bucket === 'office');
  const done    = data.items.filter(i => i.bucket === 'done');
  const future  = data.items.filter(i => i.bucket === 'future');
  const allDone = actions.length === 0 && office.length === 0 && data.total > 0;
  const firstName = data.clientFirstName;
  const stage: JourneyStage = data.journeyStage ?? 'identity';
  const stageIdx = Math.max(0, JOURNEY.findIndex(s => s.id === stage));
  // הספירה המפורטת מדברת על שלבי הקליטה. לפני החתימה אין עדיין שלבים,
  // ו"0 מתוך 1" רק מרעיש.
  const showCount = stage !== 'quote' && data.total > 0;

  return (
    <div style={page}>
      <div style={card}>
        <Header />

        <div style={{ fontSize: 20, fontWeight: 600, color: brand.ink, marginBottom: 3 }}>
          {allDone
            ? <>הכול הושלם{firstName ? `, ${firstName}` : ''} 🎉</>
            : stage === 'quote'
              ? <>שלום{firstName ? ` ${firstName}` : ''}, זה הדף האישי שלך</>
              : <>שלום{firstName ? ` ${firstName}` : ''}, הנה מצב ההצטרפות שלך</>}
        </div>
        {/* המפה הגדולה: איפה אני במסע. מחליפה את פס ההתקדמות הדק — שני
            מדדי התקדמות זה על זה רק מבלבלים. */}
        <div style={{ display: 'flex', margin: '16px 0 2px' }}>
          {JOURNEY.map((st, i) => {
            const passed = i < stageIdx;
            const current = i === stageIdx;
            const on = passed || current;
            return (
              <div key={st.id} style={{ flex: 1, minWidth: 0, textAlign: 'center', position: 'relative' }}>
                {i > 0 && (
                  <span aria-hidden="true" style={{
                    // ‼ בעברית התחנה הקודמת נמצאת מימין, אבל left/right ב-CSS
                    // אינם מתהפכים. הקו חייב לצאת מהנקודה ימינה: left:50%.
                    position: 'absolute', top: 6, left: '50%', width: '100%', height: 2,
                    background: on ? accent : brand.border,
                  }} />
                )}
                <span aria-hidden="true" style={{
                  position: 'relative', display: 'block', width: 14, height: 14, margin: '0 auto',
                  borderRadius: 999, boxSizing: 'border-box',
                  background: on ? accent : brand.cardBg,
                  border: on ? `2px solid ${accent}` : `2px solid ${brand.border}`,
                }} />
                <div style={{
                  marginTop: 6, fontSize: 11, lineHeight: 1.35,
                  fontWeight: current ? 700 : 400,
                  color: current ? ink : brand.muted,
                }}>{st.label}</div>
              </div>
            );
          })}
        </div>
        {showCount && (
          <div style={{ fontSize: 12, color: brand.muted, textAlign: 'center', marginTop: 8 }}>
            {data.done} מתוך {data.total} הושלמו
          </div>
        )}

        {actions.length > 0 && (
          <>
            <div style={{ ...sectionTitle, color: accent }}>
              ממתין לך — {actions.length === 1 ? 'פעולה אחת קצרה' : `${actions.length} פעולות קצרות`}
            </div>
            {actions.map(item => {
              const href = actionHref(item);
              const inPage = item.actionKind === 'portal';
              return (
                <div key={item.key} style={{
                  padding: '11px 0', borderBottom: `1px solid ${brand.border}`,
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <span aria-hidden="true" style={{
                      width: 10, height: 10, borderRadius: 999, background: accent, flexShrink: 0,
                    }} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 14.5, fontWeight: 600, color: brand.ink }}>{item.label}</div>
                      {item.sub && <div style={{ fontSize: 12.5, color: brand.muted, lineHeight: 1.55 }}>{item.sub}</div>}
                    </div>
                    {href && (
                      <a href={href} style={{
                        flexShrink: 0, textDecoration: 'none', fontSize: 13.5, fontWeight: 600,
                        padding: '8px 18px', color: '#fff', background: accent,
                        borderRadius: brand.buttonStyle === 'pill' ? 999 : brand.radius,
                      }}>להמשך ←</a>
                    )}
                  </div>

                  {/* ‼ מסמכים: מראים בדיוק מה התקבל ומה חסר. אין כאן העלאה —
                      החומרים מגיעים במייל/וואטסאפ, והרשימה היא מה שמסנכרן ציפיות. */}
                  {inPage && item.kind === 'documents' && !!item.checklist?.length && (
                    <ul style={{ margin: '8px 0 0', padding: 0, listStyle: 'none', display: 'grid', gap: 4 }}>
                      {item.checklist.map(ci => (
                        <li key={ci.label} style={{
                          fontSize: 13, color: ci.done ? brand.muted : brand.ink,
                          display: 'flex', gap: 8, alignItems: 'center',
                        }}>
                          <span aria-hidden="true" style={{ color: ci.done ? accent : brand.muted }}>
                            {ci.done ? '✓' : '○'}
                          </span>
                          <span style={{ textDecoration: ci.done ? 'line-through' : 'none' }}>{ci.label}</span>
                        </li>
                      ))}
                    </ul>
                  )}

                  {inPage && item.kind === 'prev_accountant' && item.actionValue && (
                    <PrevAccountantForm
                      token={token}
                      stepId={item.actionValue}
                      brand={brand}
                      accent={accent}
                      onDone={reload}
                    />
                  )}
                </div>
              );
            })}
          </>
        )}

        {office.length > 0 && (
          <>
            <div style={sectionTitle}>בטיפול המשרד — אין צורך בפעולה שלך</div>
            {office.map(item => (
              <div key={item.key} style={{ display: 'flex', alignItems: 'flex-start', gap: 12, padding: '8px 0' }}>
                <span aria-hidden="true" style={{
                  width: 10, height: 10, borderRadius: 999, border: `1.5px solid ${brand.muted}`,
                  flexShrink: 0, marginTop: 5,
                }} />
                <div>
                  <div style={{ fontSize: 13.5, color: brand.ink }}>{item.label}</div>
                  {item.sub && <div style={{ fontSize: 12.5, color: brand.muted, lineHeight: 1.55 }}>{item.sub}</div>}
                </div>
              </div>
            ))}
          </>
        )}

        {done.length > 0 && (
          <>
            <div style={sectionTitle}>הושלם</div>
            {done.map(item => (
              <div key={item.key} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '6px 0' }}>
                <span aria-hidden="true" style={{
                  width: 18, height: 18, borderRadius: 999, background: '#e4f1ea', color: '#1e5942',
                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 11, fontWeight: 700, flexShrink: 0,
                }}>✓</span>
                <span style={{ fontSize: 13, color: brand.muted }}>{item.label}</span>
              </div>
            ))}
          </>
        )}

        {future.map(item => (
          <div key={item.key} style={{
            display: 'flex', alignItems: 'center', gap: 8, marginTop: 16, paddingTop: 12,
            borderTop: `1px solid ${brand.border}`, color: brand.muted,
          }}>
            <span aria-hidden="true" style={{ fontSize: 13 }}>🔒</span>
            <span style={{ fontSize: 12.5 }}>{item.label} — {item.sub}</span>
          </div>
        ))}

        <div style={{
          marginTop: 20, paddingTop: 12, borderTop: `1px solid ${brand.border}`,
          fontSize: 12, color: brand.muted, textAlign: 'center', lineHeight: 1.6,
        }}>
          הדף מתעדכן מעצמו — אפשר לשמור את הקישור ולחזור אליו בכל שלב.
          <br />שאלות? פשוט השיבו למייל שקיבלתם מ{data.firmName}.
        </div>
      </div>
    </div>
  );
}

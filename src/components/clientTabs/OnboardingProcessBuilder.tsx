// ─── בונה התהליך — הרגע שאחרי החתימה ─────────────────────────────────────────
// ‼ המסך הזה קיים כדי שהלקוח לא יקבל רשימת מטלות שהרו"ח לא ראה. ייפוי הכוח
// כבר נפתח לו מיד בחתימה (הרגע החם); כל השאר ממתין ללחיצה אחת כאן.
//
// ‼ שרשרת של שלבים תלויים מוצגת כשורה אחת (הכרעת גיא 2026-08-09): "הזמנה
// לפייפרלס"+"חיבור לפייפרלס" הם בעיני הרו"ח תהליך אחד של הלקוח, וכך גם
// פרטי-רו"ח-קודם → מכתב שחרור → קבלת חומרים. בשרת הם נשארים שלבים נפרדים —
// האיחוד הוא בתצוגה ובמתג בלבד.
//
// ‼ אין כאן תגי "אצלי"/"אצל הלקוח": לפני השליחה שום כדור עוד לא רץ, והתג
// התנגש עם כותרות הקבוצות ("הרשאה לתשלום" ישבה תחת "מה אני מבקש ממנו" עם
// תג "אצלי"). מי-עושה-מה נאמר במילים, על השורה.

import { useMemo, useState } from 'react';
import type { Engagement, OnboardingStep } from '../../types/onboarding';
import { STEP_TYPE_LABELS, isStepOpen } from '../../types/onboarding';
import type { RepresentationStatus } from '../../types';
import { representationAction } from '../../utils/representationAction';
import type { AdvanceResult } from '../../hooks/useOnboarding';
import { supabase } from '../../lib/supabase';
import AddRequestDialog from './AddRequestDialog';
import JourneyTemplatesDialog from './JourneyTemplatesDialog';
import SendPortalDialog from './SendPortalDialog';

interface Props {
  clientName: string;
  /** בלי מייל בכרטיס — פתיחת התהליך תציע קישור בלבד. */
  clientEmail?: string;
  engagement: Engagement;
  /** כל השלבים של הלקוח — כולל מבוטלים, כי כאן "מבוטל" הוא פשוט מתג כבוי. */
  steps: OnboardingStep[];
  advance: (stepId: string, action: string, payload?: Record<string, unknown>) => Promise<AdvanceResult>;
  refresh?: () => void;
  /** מצב בקשת הייצוג — מקורו בכרטיס הלקוח, לא בשלב הקליטה. */
  repStatus?: RepresentationStatus;
  onOpenRepresentation?: () => void;
  /** מייל הרו"ח הקודם מהכרטיס — כשהוא קיים, ללקוח אין מה למלא ואומרים לאן יישלח המכתב. */
  prevAccountantEmail?: string;
}

/** בקשות שהלקוח רואה בדף האישי. השאר הוא עבודה פנימית. */
const CLIENT_FACING: OnboardingStep['stepType'][] = [
  'client_documents', 'prev_accountant_details', 'paperless_connection',
  'retainer_authorization', 'intake_questionnaire', 'custom_request',
];

/** שורת תצוגה בבונה. שרשרת שלבים = שורה אחת, מתג אחד, סיפור אחד. */
interface ViewRow {
  key: string;
  /** כל שלבי השרשרת בסדר הפנימי שלהם — המתג והסידור פועלים על כולם יחד. */
  members: OnboardingStep[];
  title: string;
  sub?: string;
  /** ההשתלשלות במילים: "שולחים קישור ← הלקוח נרשם ← ...". */
  flow?: string;
  /** "ייפתח אוטומטית אחרי..." — מחליף את "🔒 בתור" הסתום. */
  lockText?: string;
  /** חובה רגולטורית — אין מתג. */
  fixed?: boolean;
  clientFacing: boolean;
}

function GroupTitle({ children }: { children: React.ReactNode }) {
  return (
    <span style={{
      fontSize: 'var(--fs-12)', fontWeight: 600, color: 'var(--ink-3)',
      letterSpacing: '.02em', paddingTop: '.2rem',
    }}>{children}</span>
  );
}

function clientVoice(s: OnboardingStep): { title: string; sub: string } {
  const p = s.payload ?? {};
  return {
    title: String(p.clientTitle || p.title || STEP_TYPE_LABELS[s.stepType]),
    sub: String(p.clientSub || ''),
  };
}

const rowOff = (r: ViewRow) => r.members.every(m => m.status === 'cancelled');
const sortKey = (r: ViewRow) =>
  Math.min(...r.members.map(m => m.sortOrder ?? 0));

export default function OnboardingProcessBuilder({
  clientName, clientEmail, engagement, steps, advance, refresh, repStatus,
  onOpenRepresentation, prevAccountantEmail,
}: Props) {
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [templatesOpen, setTemplatesOpen] = useState(false);
  const [sendOpen, setSendOpen] = useState(false);

  const mine = useMemo(
    () => steps.filter(s => s.engagementId === engagement.id || s.clientId === engagement.clientId),
    [steps, engagement]);

  // הייצוג כבר רץ בזמן שמרכיבים את השאר — שורה משלו, עם פעולה.
  const repStep = useMemo(
    () => mine.find(s => s.stepType === 'representation' && s.status !== 'cancelled'),
    [mine]);
  const hasUpgrade = useMemo(
    () => mine.some(s => s.stepType === 'representation_upgrade' && s.status !== 'cancelled'),
    [mine]);

  const { clientRows, officeRows } = useMemo(() => {
    const pool = mine.filter(s =>
      s.stepType !== 'representation' && s.stepType !== 'representation_upgrade');
    const one = (t: OnboardingStep['stepType']) => pool.find(s => s.stepType === t);

    const invite = one('paperless_invite');
    const conn = one('paperless_connection');
    const prevDet = one('prev_accountant_details');
    const release = one('release_letter');
    const materials = one('materials_received');
    const retainer = one('retainer_authorization');
    const merged = new Set(
      [invite, conn, prevDet, release, materials, retainer]
        .filter((s): s is OnboardingStep => !!s).map(s => s.id));

    const rows: ViewRow[] = [];

    // ── פייפרלס: תהליך אחד של הלקוח. הקישור קבוע, המערכת שולחת אותו,
    //    והחיבור נסגר כשהלקוח נרשם — ואז נפתחת ההרשאה לתשלום.
    if (invite || conn) {
      const members = [invite, conn].filter((s): s is OnboardingStep => !!s);
      rows.push({
        key: 'paperless',
        members,
        title: 'חיבור לפייפרלס',
        sub: 'שתי דקות, ומשם רק מצלמים קבלות מהטלפון',
        flow: 'שולחים לו את הקישור הקבוע ← הלקוח נרשם ומתחבר'
          + (retainer ? ' ← נפתחת ההרשאה לתשלום' : ''),
        clientFacing: true,
      });
    }

    // ── רו"ח קודם: שרשרת אחת. אם המייל כבר בכרטיס — אין ללקוח מה למלא,
    //    והשורה כולה עוברת ל"עבודה שלי".
    if (prevDet || release || materials) {
      const members = [prevDet, release, materials].filter((s): s is OnboardingStep => !!s);
      const nItems = Array.isArray(materials?.payload?.checklist)
        ? materials!.payload.checklist!.length : 0;
      const tail = nItems > 0 ? ` (${nItems} פריטים במעקב)` : '';
      rows.push({
        key: 'prev-accountant',
        members,
        title: 'מעבר מהרו״ח הקודם',
        flow: prevDet
          ? `הלקוח ממלא את פרטי הרו״ח ← שולחים מכתב שחרור ← מקבלים את החומרים${tail}`
          : `${prevAccountantEmail
              ? `מכתב השחרור יישלח אל ${prevAccountantEmail}`
              : 'שולחים מכתב שחרור'} ← מקבלים את החומרים${tail}`,
        clientFacing: !!prevDet,
      });
    }

    // ── הרשאה לתשלום: הסכום מההצעה מוצג על השורה, והמנעול מוסבר במילים.
    if (retainer) {
      const amount = Number(retainer.payload?.amount ?? engagement.monthlyTotal ?? 0);
      rows.push({
        key: 'retainer',
        members: [retainer],
        title: STEP_TYPE_LABELS.retainer_authorization,
        sub: amount > 0
          ? `${amount.toLocaleString('he-IL')} ₪ בחודש — הסכום שסוכם בהצעה, כהרשאה קבועה`
          : clientVoice(retainer).sub,
        lockText: retainer.dependsOnStepId
          ? 'ייפתח ללקוח אוטומטית אחרי החיבור לפייפרלס'
          : undefined,
        clientFacing: true,
      });
    }

    // ── כל השאר — שורה לשלב, כמו קודם, בלי תגים.
    for (const s of pool) {
      if (merged.has(s.id)) continue;
      const facing = CLIENT_FACING.includes(s.stepType);
      rows.push({
        key: s.id,
        members: [s],
        title: String(s.payload?.title ?? '').trim() || STEP_TYPE_LABELS[s.stepType],
        sub: facing ? clientVoice(s).sub : undefined,
        fixed: s.stepType === 'kyc_identification',
        clientFacing: facing,
      });
    }

    const bySort = (a: ViewRow, b: ViewRow) => sortKey(a) - sortKey(b)
      || (a.members[0].createdAt ?? '').localeCompare(b.members[0].createdAt ?? '');
    return {
      clientRows: rows.filter(r => r.clientFacing).sort(bySort),
      officeRows: rows.filter(r => !r.clientFacing).sort(bySort),
    };
  }, [mine, engagement.monthlyTotal, prevAccountantEmail]);

  const allRows = clientRows.length + officeRows.length;

  // ‼ התצוגה המקדימה חייבת להתנהג כמו הדף האישי, אחרת היא מבטיחה משהו אחר:
  // שלב נעול אינו פעולה ממוספרת אצל הלקוח אלא שורת "ייפתח בהמשך".
  const activeSteps = useMemo(
    () => mine.filter(s =>
      s.status !== 'cancelled'
      && s.stepType !== 'representation' && s.stepType !== 'representation_upgrade'
      && CLIENT_FACING.includes(s.stepType))
      .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0)),
    [mine]);
  const preview = activeSteps.filter(s => s.status !== 'locked');
  const previewLocked = activeSteps.filter(s => s.status === 'locked');

  /** מתג של שורה — מכבה/מדליק את כל שלבי השרשרת יחד. */
  async function toggleRow(row: ViewRow) {
    setBusyKey(row.key);
    setError(null);
    const turnOn = rowOff(row);
    const targets = row.members.filter(m =>
      turnOn ? m.status === 'cancelled' : m.status !== 'cancelled');
    for (const m of targets) {
      const res = await advance(m.id, turnOn ? 'reopen' : 'cancel',
        turnOn ? { note: 'הוחזר לתהליך בבונה' } : { note: 'הוסר מהתהליך בבונה' });
      if (!res.ok) { setError(res.message || 'לא הצלחתי לשנות את הבקשה.'); break; }
    }
    setBusyKey(null);
  }

  /**
   * סידור השורות — הסדר שהלקוח יראה בדף האישי. שרשרת זזה כגוש אחד,
   * ושורות המשרד נשארות אחרי כולן (הסדר שלהן לא מוצג ללקוח).
   */
  async function moveRow(key: string, dir: -1 | 1) {
    const i = clientRows.findIndex(r => r.key === key);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= clientRows.length) return;
    const next = clientRows.slice();
    [next[i], next[j]] = [next[j], next[i]];
    const ids = [...next, ...officeRows].flatMap(r => r.members.map(m => m.id));
    setBusyKey(key);
    const { error: rpcError } = await supabase.rpc('reorder_onboarding_steps', {
      p_client_id: engagement.clientId, p_ids: ids,
    });
    setBusyKey(null);
    if (rpcError) { setError(rpcError.message); return; }
    refresh?.();
  }

  /**
   * פתיחת התהליך. רצה כשלב הראשון של השליחה ולא ככפתור בפני עצמו — הכרעת גיא:
   * "אני לוחץ שלח, וזה שולח". החזרת מחרוזת = תקלה שנעצרת לפני שהמייל יוצא.
   * ‼ הפונקציה בשרת אידמפוטנטית (alreadyPublished), ולכן ניסיון חוזר בטוח.
   */
  async function publish(): Promise<string | null> {
    const { data, error: rpcError } = await supabase.rpc('publish_onboarding_process', {
      p_engagement_id: engagement.id,
    });
    const res = data as { ok?: boolean; error?: string } | null;
    if (rpcError || !res?.ok) return 'לא הצלחתי לפתוח את התהליך. נסה שוב.';
    return null;
  }

  function renderRow(row: ViewRow, movable: boolean) {
    const off = rowOff(row);
    const busy = busyKey === row.key;
    return (
      <div key={row.key} style={{
        display: 'flex', alignItems: 'flex-start', gap: '.7rem',
        padding: '.6rem .75rem', borderRadius: '.55rem',
        border: `1px solid ${off ? 'var(--bd)' : 'var(--bd-strong, var(--bd))'}`,
        background: off ? 'transparent' : 'var(--card, #fff)',
        opacity: off ? .6 : 1,
      }}>
        {row.fixed ? (
          <span
            title="חובה רגולטורית — לא ניתן להסיר"
            style={{
              flexShrink: 0, width: '2.1rem', textAlign: 'center', paddingTop: '.1rem',
              fontSize: 'var(--fs-12)', color: 'var(--ink-3)',
            }}>חובה</span>
        ) : (
          <button
            type="button"
            onClick={() => void toggleRow(row)}
            disabled={busy}
            aria-pressed={!off}
            aria-label={`${off ? 'להוסיף' : 'להסיר'} — ${row.title}`}
            style={{
              flexShrink: 0, width: '2.1rem', height: '1.2rem', padding: '.12rem',
              marginTop: '.1rem',
              display: 'inline-flex', alignItems: 'center', border: 'none',
              borderRadius: '999px', cursor: 'pointer',
              background: off ? 'var(--bd-strong, #d3d6da)' : 'var(--accent)',
              justifyContent: off ? 'flex-start' : 'flex-end',
            }}
          >
            <span style={{ width: '.95rem', height: '.95rem', borderRadius: '999px', background: '#fff' }} />
          </button>
        )}

        <span style={{ display: 'grid', gap: '.15rem', flex: 1, minWidth: 0 }}>
          <span style={{ fontWeight: 600, color: off ? 'var(--ink-3)' : 'var(--ink)' }}>
            {row.title}
          </span>
          {row.sub && (
            <span style={{ fontSize: 'var(--fs-12)', color: 'var(--ink-3)' }}>{row.sub}</span>
          )}
          {row.flow && (
            <span style={{ fontSize: 'var(--fs-12)', color: 'var(--ink-3)' }}>{row.flow}</span>
          )}
          {row.lockText && !off && (
            <span style={{ fontSize: 'var(--fs-12)', color: 'var(--ink-4)' }}>
              🔒 {row.lockText}
            </span>
          )}
        </span>

        {movable && (
          <span style={{ display: 'inline-flex', gap: 2, flexShrink: 0 }}>
            <button type="button" className="btn btn-sm btn-ghost" aria-label="הזז למעלה"
              disabled={busy} onClick={() => void moveRow(row.key, -1)}
              style={{ padding: '0 .3rem' }}>↑</button>
            <button type="button" className="btn btn-sm btn-ghost" aria-label="הזז למטה"
              disabled={busy} onClick={() => void moveRow(row.key, 1)}
              style={{ padding: '0 .3rem' }}>↓</button>
          </span>
        )}
      </div>
    );
  }

  return (
    <section className="ob-builder" style={{ display: 'grid', gap: '.9rem' }}>
      <header style={{ display: 'grid', gap: '.25rem' }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: '.5rem', flexWrap: 'wrap' }}>
          <span style={{
            padding: '.1rem .5rem', borderRadius: '.4rem', fontSize: 'var(--fs-12)',
            fontWeight: 600, background: 'var(--ok-bg, #e4f1ea)', color: 'var(--ok, #17845b)',
          }}>ההצעה אושרה</span>
          <span style={{ fontSize: 'var(--fs-13)', color: 'var(--ink-3)' }}>
            {clientName}
            {engagement.monthlyTotal ? ` · ${engagement.monthlyTotal.toLocaleString('he-IL')} ₪ לחודש` : ''}
          </span>
        </span>
        <h3 style={{ margin: 0 }}>מה אתה צריך ממנו, ובאיזה סדר?</h3>
        <p style={{ margin: 0, fontSize: 'var(--fs-13)', color: 'var(--ink-3)' }}>
          ייפוי הכוח כבר נפתח לו. שאר הבקשות יגיעו אליו כשתלחץ "שלח ללקוח" — לא לפני.
        </p>
      </header>

      {error && (
        <div role="alert" style={{
          padding: '.5rem .7rem', borderRadius: '.5rem',
          background: 'var(--err-bg, #fdeaea)', color: 'var(--err)', fontSize: 'var(--fs-13)',
        }}>{error}</div>
      )}

      {/* ── ייפוי הכוח — כבר רץ, ולכן שורה עם פעולה ולא מתג ── */}
      {repStep && isStepOpen(repStep.status) && repStatus && (() => {
        const a = representationAction(repStatus);
        return (
          <div style={{
            display: 'flex', alignItems: 'flex-start', gap: '.7rem',
            padding: '.65rem 0', borderTop: '1px solid var(--hairline-2)',
          }}>
            {/* פס דק בקצה במקום מסגרת וכרטיס — צבע רק כשהכדור אצלי */}
            <span aria-hidden="true" style={{
              alignSelf: 'stretch', width: 3, flexShrink: 0, borderRadius: 999,
              background: a.mine ? 'var(--accent)' : 'var(--hairline-2)',
            }} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '.45rem', flexWrap: 'wrap' }}>
                <span style={{
                  fontSize: 'var(--fs-12)', fontWeight: 600, borderRadius: 999, padding: '.05rem .45rem',
                  background: a.mine ? 'var(--chip-blue-bg)' : 'var(--surface-2)',
                  color: a.mine ? 'var(--chip-blue-tx)' : 'var(--ink-3)',
                }}>{a.ball}</span>
                <span style={{ fontSize: 'var(--fs-14)', fontWeight: a.mine ? 600 : 500, color: 'var(--ink-1)' }}>
                  {STEP_TYPE_LABELS[repStep.stepType]} — {a.action}
                </span>
              </div>
              {a.why && (
                <div style={{ fontSize: 'var(--fs-12)', color: 'var(--ink-3)', marginTop: 2 }}>{a.why}</div>
              )}
              {hasUpgrade && (
                <div style={{ fontSize: 'var(--fs-12)', color: 'var(--ink-4)', marginTop: 2 }}>
                  שדרוג לייצוג ראשי ממתין ברקע — יקודם מעצמו אחרי אישור הרשויות.
                </div>
              )}
            </div>
            {onOpenRepresentation && (
              <button type="button"
                className={`btn btn-sm ${a.mine ? 'btn-primary' : 'btn-secondary'}`}
                style={{ flexShrink: 0, whiteSpace: 'nowrap' }}
                onClick={onOpenRepresentation}>
                למרכז הייצוג ←
              </button>
            )}
          </div>
        );
      })()}

      <div className="ob-builder-grid">
        <div style={{ display: 'grid', gap: '.5rem' }}>
          {allRows === 0 && (
            <p style={{ fontSize: 'var(--fs-13)', color: 'var(--ink-3)', margin: 0 }}>
              אין בקשות להרכיב — ההצעה לא יצרה שלבים שדורשים משהו מהלקוח.
            </p>
          )}

          {clientRows.length > 0 && <GroupTitle>מה הלקוח יראה בדף האישי</GroupTitle>}
          {clientRows.map(r => renderRow(r, true))}

          {officeRows.length > 0 && <GroupTitle>העבודה שלי</GroupTitle>}
          {officeRows.map(r => renderRow(r, false))}

          <div style={{ display: 'flex', gap: '.4rem', justifySelf: 'start' }}>
            <button type="button" className="btn btn-secondary" onClick={() => setAddOpen(true)}>+ בקשה</button>
            <button type="button" className="btn btn-ghost" onClick={() => setTemplatesOpen(true)}>תבניות מסע</button>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '.7rem', flexWrap: 'wrap', paddingTop: '.2rem' }}>
            {/* ‼ כפתור אחד: פותח את התהליך *ומוציא אותו* ללקוח. "פתח ללקוח"
                שרק הדליק דגל בשרת השאיר את הלקוח מול דף שהוא לא יודע עליו,
                ואת הרו"ח מחפש כפתור שליחה שלא היה קיים. */}
            <button type="button" className="btn btn-primary" onClick={() => setSendOpen(true)}>
              שלח ללקוח
            </button>
            <span style={{ fontSize: 'var(--fs-13)', color: 'var(--ink-3)' }}>
              נבחר איך שולחים — מייל או קישור לוואטסאפ. אפשר לשנות הכל אחר כך.
            </span>
          </div>
        </div>

        {/* --surface-2 ולא --bg-2: השני לא מוגדר בערכת הצבעים ונופל תמיד
            לגוון בהיר — במצב כהה הפאנל נשאר לבן מול כרטיסים כהים. */}
        <aside style={{
          display: 'grid', gap: '.5rem', padding: '.75rem',
          borderRadius: '.6rem', background: 'var(--surface-2)',
        }}>
          <span style={{ fontWeight: 600, fontSize: 'var(--fs-13)' }}>מה הוא יראה</span>
          {preview.length === 0 && previewLocked.length === 0 && (
            <span style={{ fontSize: 'var(--fs-12)', color: 'var(--ink-3)' }}>
              אף בקשה לא מופנית ללקוח — הדף שלו יראה רק את מה שבטיפולנו.
            </span>
          )}
          {preview.map((s, i) => {
            const v = clientVoice(s);
            return (
              <div key={s.id} style={{
                display: 'flex', gap: '.55rem', alignItems: 'flex-start',
                padding: '.55rem', borderRadius: '.5rem', background: 'var(--card, #fff)',
                border: '1px solid var(--bd)',
              }}>
                <span style={{
                  flexShrink: 0, width: '1.35rem', height: '1.35rem', borderRadius: '.35rem',
                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 'var(--fs-12)', fontWeight: 700,
                  border: '2px solid var(--bd-strong, #d3d6da)', color: 'var(--ink-3)',
                }}>{i + 1}</span>
                <span style={{ display: 'grid', gap: '.15rem', minWidth: 0 }}>
                  <span style={{ fontWeight: 600, fontSize: 'var(--fs-13)' }}>{v.title}</span>
                  {v.sub && <span style={{ fontSize: 'var(--fs-12)', color: 'var(--ink-3)' }}>{v.sub}</span>}
                </span>
              </div>
            );
          })}
          {previewLocked.map(s => (
            <div key={s.id} style={{
              display: 'flex', gap: '.5rem', alignItems: 'center',
              padding: '.5rem', borderRadius: '.5rem', border: '1px dashed var(--bd)',
              fontSize: 'var(--fs-12)', color: 'var(--ink-3)',
            }}>
              <span aria-hidden="true">🔒</span>
              <span>{clientVoice(s).title} — ייפתח בהמשך</span>
            </div>
          ))}
        </aside>
      </div>

      {addOpen && (
        <AddRequestDialog
          clientId={engagement.clientId}
          steps={mine}
          processPublished={false}
          onClose={() => setAddOpen(false)}
          onCreated={() => refresh?.()}
        />
      )}

      {templatesOpen && (
        <JourneyTemplatesDialog
          clientId={engagement.clientId}
          clientName={clientName}
          onClose={() => setTemplatesOpen(false)}
          onApplied={() => refresh?.()}
        />
      )}

      {sendOpen && (
        <SendPortalDialog
          clientId={engagement.clientId}
          clientName={clientName}
          clientEmail={clientEmail}
          heading="פתיחת התהליך ללקוח"
          beforeSend={publish}
          onClose={() => { setSendOpen(false); refresh?.(); }}
          onSent={() => refresh?.()}
        />
      )}
    </section>
  );
}

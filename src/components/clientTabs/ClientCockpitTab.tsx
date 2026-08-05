// ─── מרכז שליטה — מסך הבית של הלקוח ──────────────────────────────────────────
// עונה תוך 5 שניות: מה בוער (אותות לפי דחיפות), מה הבא (לוח הגשות),
// מה זז (פעילות אחרונה), ואיפה עומדים הדוחות (תיקי שנה + סכומים).
// הכל נגזר אוטומטית ממה שכבר קיים — אפס תחזוקה ידנית.

import { useMemo, useState } from 'react';
import type { Client, Task } from '../../types';
import { BALL_WITH_LABELS, BALL_WITH_COLOR } from '../../types';
import type { ClientAlert } from '../../types/clientWorkspace';
import { relativeTime } from '../../utils/clientDerived';
import { formatDate } from '../../utils/dateFormat';
import { dueTone } from '../../utils/taskUtils';
import type { AnnualReportSession } from '../../features/annualReport/types';
import { summarizeYearFile, SESSION_STATUS_META, buildKeyAmounts } from '../../features/annualReport/profile';
import ClientEmailsSection, { ClientEmailsList } from '../EmailActivity/ClientEmailsSection';
import type { EmailMessage } from '../../types/emailActivity';

type TabId = 'overview' | 'dossier' | 'docs' | 'tasks';

interface Props {
  client: Client;
  tasks: Task[];
  alerts: ClientAlert[];
  openTasks: Task[];
  upcomingDebts: Task[];
  onPinNote: (text: string) => void;
  onAddNote: (text: string) => void;
  onGotoTab: (tab: TabId) => void;
  onSelectTask: (id: string) => void;
  taxSessions: AnnualReportSession[];
  taxSessionsLoading?: boolean;
  onOpenYear?: (taxYear: number) => void;
  /** יומן המיילים נטען פעם אחת בדף המסע ומוזרם לכאן — שאילתה אחת, לא שתיים.
   *  כשלא מועבר, המקטע טוען לעצמו כמו קודם (שימוש עצמאי בלשונית הישנה). */
  emails?: EmailMessage[];
  emailsLoading?: boolean;
  onEmailsChanged?: () => void;
}

type SignalLevel = 'crit' | 'warn' | 'ok';
interface Signal {
  key: string;
  level: SignalLevel;
  title: string;
  subtitle: string;
  onClick?: () => void;
}

const LEVEL_COLOR: Record<SignalLevel, string> = { crit: 'var(--err)', warn: 'var(--warn)', ok: 'var(--ok)' };
const LEVEL_RANK: Record<SignalLevel, number> = { crit: 0, warn: 1, ok: 2 };

// ─── לוח ההגשות — נגזר מצורת המס של הלקוח ───────────────────────────────────
// ארבע עמודות כמו במוקאפ: מה מגישים · על איזו תקופה · מתי · ואיפה זה עומד.
// "מתי" בלי "על מה" הוא חצי מידע — בלי התקופה אי אפשר לדעת אם פספסת.
interface CalItem {
  label: string;
  period: string;
  due: string;
  state: string;
  tone: 'late' | 'soon' | 'ok' | 'idle';
}

/** התקופה המדווחת עכשיו + מועד ההגשה שלה (ה-15 בחודש שאחריה). */
function filingPeriod(frequency: 'monthly' | 'bi_monthly'): { period: string; due: Date } {
  const now = new Date();
  let m = now.getMonth() + 1;       // תקופת הדיווח הנוכחית מדווחת בחודש הבא
  let y = now.getFullYear();
  if (frequency === 'bi_monthly' && m % 2 === 1) m += 1;
  const period = `${String(m).padStart(2, '0')}/${y}`;
  let dm = m + 1;
  let dy = y;
  if (dm > 12) { dm -= 12; dy += 1; }
  return { period, due: new Date(dy, dm - 1, 15) };
}

function dueState(due: Date): { due: string; state: string; tone: CalItem['tone'] } {
  const days = Math.floor((due.getTime() - Date.now()) / 86_400_000);
  const label = `${String(due.getDate()).padStart(2, '0')}.${String(due.getMonth() + 1).padStart(2, '0')}`;
  if (days < 0) return { due: label, state: `באיחור ${Math.abs(days)} ימים`, tone: 'late' };
  if (days <= 7) return { due: label, state: days === 0 ? 'היום' : `בעוד ${days} ימים`, tone: 'soon' };
  return { due: label, state: 'בזמן', tone: 'ok' };
}

function buildCalendar(client: Client, latest: AnnualReportSession | null): CalItem[] {
  const items: CalItem[] = [];
  const isSelfEmployed = client.incomeTaxType === 'selfEmployed' || client.incomeTaxType === 'both';

  if ((client.taxFiles ?? []).some((f) => f.authority === 'deductions')) {
    const { period, due } = filingPeriod(client.withholdingFrequency === 'monthly' ? 'monthly' : 'bi_monthly');
    items.push({ label: 'דוח 102 — ניכויים', period, ...dueState(due) });
  }
  if (client.vatStatus === 'authorizedDealer') {
    const freq = client.vatFrequency === 'monthly' ? 'monthly' : 'bi_monthly';
    const { period, due } = filingPeriod(freq);
    items.push({ label: `דיווח מע״מ (${freq === 'monthly' ? 'חודשי' : 'דו-חודשי'})`, period, ...dueState(due) });
  }
  if (isSelfEmployed) {
    const { period, due } = filingPeriod(client.pitAdvanceFrequency === 'monthly' ? 'monthly' : 'bi_monthly');
    items.push({ label: 'מקדמות מס הכנסה', period, ...dueState(due) });
  }
  if (latest) {
    const meta = SESSION_STATUS_META[latest.status];
    items.push({
      label: 'דוח שנתי 1301',
      period: String(latest.taxYear),
      due: '30.11',
      state: latest.status === 'mapping_done' ? 'מוכן להגשה' : meta.label,
      tone: latest.status === 'mapping_done' ? 'ok' : 'idle',
    });
  }
  if (client.hasWealthDeclaration) {
    items.push({
      label: 'הצהרת הון',
      period: client.lastWealthDeclarationYear ? String(client.lastWealthDeclarationYear) : '—',
      due: '—',
      state: client.lastWealthDeclarationYear ? `הוגשה ${client.lastWealthDeclarationYear}` : 'נדרשת',
      tone: client.lastWealthDeclarationYear ? 'ok' : 'idle',
    });
  }
  return items;
}

export default function ClientCockpitTab({
  client, alerts, openTasks, upcomingDebts,
  onPinNote, onAddNote, onGotoTab, onSelectTask,
  taxSessions, taxSessionsLoading, onOpenYear,
  emails, emailsLoading, onEmailsChanged,
}: Props) {
  const latest = taxSessions[0] ?? null;
  const latestSummary = latest ? summarizeYearFile(latest) : null;
  const amounts = buildKeyAmounts(client, latest);

  // ── אותות — נגזרים וממוינים לפי דחיפות ──
  const signals = useMemo<Signal[]>(() => {
    const out: Signal[] = [];

    // מסמכים חסרים = רק מה שתיק השנה באמת דורש (נגזר מהשאלון).
    // אין ציפייה אוטומטית לפי סוג הלקוח — דרישה למסמך מוגדרת במשימה.
    const missingYear = latestSummary ? Math.max(0, latestSummary.docsTotal - latestSummary.docsReceived) : 0;
    if (missingYear > 0) {
      out.push({
        key: 'docs', level: 'crit',
        title: `חסרים ${missingYear} מסמכים`,
        subtitle: `בתיק ${latest?.taxYear}`,
        onClick: () => onGotoTab('docs'),
      });
    } else {
      out.push({ key: 'docs', level: 'ok', title: 'מסמכים', subtitle: 'אין חוסרים ידועים', onClick: () => onGotoTab('docs') });
    }

    // דוח שנתי אחרון
    if (latest && latestSummary) {
      const meta = SESSION_STATUS_META[latest.status];
      out.push({
        key: 'report',
        level: latest.status === 'review' ? 'warn' : latest.status === 'in_progress' ? 'warn' : 'ok',
        title: `דוח ${latest.taxYear} — ${meta.label}`,
        subtitle: latest.status === 'review' ? 'ממתין לבדיקה שלך' : latest.status === 'in_progress' ? 'שאלון באמצע' : 'מיפוי הושלם',
        onClick: onOpenYear ? () => onOpenYear(latest.taxYear) : undefined,
      });
      if (latestSummary.openUnknowns > 0) {
        out.push({
          key: 'unknowns', level: 'warn',
          title: `${latestSummary.openUnknowns} תשובות "לא בטוח"`,
          subtitle: 'לוודא מול הלקוח בשיחה הבאה',
          onClick: onOpenYear ? () => onOpenYear(latest.taxYear) : undefined,
        });
      }
    } else if (!taxSessionsLoading) {
      out.push({ key: 'report', level: 'warn', title: 'אין תיק דוח שנתי', subtitle: 'אפשר לפתוח מכפתור "דוח שנתי" למעלה' });
    }

    // משימות
    const stuck = openTasks.filter((t) => t.ballWith === 'stuck').length;
    out.push({
      key: 'tasks',
      level: stuck > 0 ? 'crit' : upcomingDebts.length > 0 ? 'warn' : 'ok',
      title: openTasks.length === 0 ? 'אין משימות פתוחות' : `${openTasks.length} משימות פתוחות`,
      subtitle: stuck > 0 ? `${stuck} תקועות!` : upcomingDebts.length > 0 ? `${upcomingDebts.length} עם מועד קרוב` : openTasks.length > 0 ? 'אף אחת לא תקועה' : 'הכל סגור',
      onClick: () => onGotoTab('tasks'),
    });

    // התראות מערכת (ניכוי פג, שע"ם, ספרים) — רק הבעייתיות
    for (const a of alerts) {
      if (a.kind === 'open_tasks' || a.kind === 'upcoming_debt') continue; // כבר מכוסה
      out.push({
        key: a.kind,
        level: a.level === 'danger' ? 'crit' : 'warn',
        title: `${a.text}`,
        subtitle: 'טיפול בלשונית התיק',
        onClick: () => onGotoTab('dossier'),
      });
    }

    return out.sort((a, b) => LEVEL_RANK[a.level] - LEVEL_RANK[b.level]);
  }, [client, latest, latestSummary, openTasks, upcomingDebts, alerts, taxSessionsLoading, onGotoTab, onOpenYear]);

  /* הפרדה אחת: מה שדורש טיפול נשאר שורה עם צבע; מה שתקין יורד לשורת
     הסיכום השקטה. "הושלם = אפור" הוא כלל רוחבי במוצר. */
  const exceptions = useMemo(() => signals.filter(s => s.level !== 'ok'), [signals]);
  const settled = useMemo(() => signals.filter(s => s.level === 'ok'), [signals]);

  const calendar = useMemo(() => buildCalendar(client, latest), [client, latest]);
  const recentActivity = (client.activity ?? []).slice(0, 8);

  // ── הערה מוצמדת ──
  const [editingNote, setEditingNote] = useState(false);
  const [noteDraft, setNoteDraft] = useState(client.pinnedNote ?? '');
  const [quickNote, setQuickNote] = useState('');

  return (
    <div className="cw-overview" style={{ display: 'flex', flexDirection: 'column', gap: '.8rem' }}>

      {/* ── חריגות מקצועיות — צבע רק לחריגה ────────────────────────────────
          מה שתקין אינו כרטיס: הוא מתקפל לשורה שקטה אחת בתחתית המקטע.
          כרטיס ירוק לצד כרטיס אדום מלמד שהצבע לא אומר כלום. */}
      <div className="cw-section">
        <div className="cw-section-head">
          <span>חריגות מקצועיות</span>
          {exceptions.length > 0 && <span className="cw-section-count">{exceptions.length}</span>}
        </div>
        {exceptions.length === 0 ? (
          <div className="cw-empty">אין חריגה פתוחה — אין הגשה באיחור ואין פרט חסר שידוע לנו.</div>
        ) : (
          <div>
            {exceptions.map((s) => (
              <button
                key={s.key}
                type="button"
                onClick={s.onClick}
                disabled={!s.onClick}
                className="cw-exc-row"
                style={{ cursor: s.onClick ? 'pointer' : 'default' }}
              >
                <span className="cw-exc-dot" style={{ background: LEVEL_COLOR[s.level] }} aria-hidden="true" />
                <span className="cw-exc-main">
                  <span className="cw-exc-title">{s.title}</span>
                  <span className="cw-exc-sub">{s.subtitle}</span>
                </span>
                {s.onClick && <span className="cw-exc-go" aria-hidden="true">←</span>}
              </button>
            ))}
          </div>
        )}
        {settled.length > 0 && (
          <div className="cw-exc-settled">
            {settled.map(s => (
              <span key={s.key} className="cw-exc-settled-item">✓ {s.title}</span>
            ))}
          </div>
        )}
      </div>

      {/* ── לוח הגשות + מה זז ── */}
      {/* פריסת המרכז לפי מסך 07 במוקאפ: עמודה רחבה למה שדורש טיפול,
          ומסילה צרה לצידה למה שחוסם, למה שזז, ולהערה. */}
      <div className="cw-hub-grid cw-cockpit-row">
        <div className="cw-section">
          <div className="cw-section-head">
            <span>לוח הגשות</span>
            <span className="cw-section-hint">חודשי ושנתי · נגזר מסוג העוסק</span>
          </div>
          {calendar.length === 0 ? (
            <div className="cw-empty">אין חובות דיווח שוטפות לפי הכרטיס.</div>
          ) : (
            <div className="cw-cal">
              <div className="cw-cal-row cw-cal-head">
                <span>הגשה</span><span>תקופה</span><span>מועד</span><span>מצב</span>
              </div>
              {calendar.map((c) => (
                <div key={c.label} className="cw-cal-row">
                  <span className="cw-cal-label">{c.label}</span>
                  <span className="cw-cal-period">{c.period}</span>
                  <span className="cw-cal-due">{c.due}</span>
                  <span className={`cw-cal-state is-${c.tone}`}>{c.state}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="cw-section">
          <div className="cw-section-head"><span>מה זז לאחרונה</span></div>
          {recentActivity.length === 0 ? (
            <div className="cw-empty">עדיין אין פעילות רשומה.</div>
          ) : (
            <div>
              {recentActivity.map((a) => (
                <div key={a.id} className="cw-activity-row">
                  <span className="cw-activity-text">{a.text}</span>
                  <span className="cw-activity-when">{relativeTime(a.at)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ── משימות המשרד — עבודה שלי, לא בקשה שממתינה לאדם אחר ──────────── */}
      <div className="cw-section">
        <div className="cw-section-head">
          <span>משימות המשרד</span>
          {openTasks.length > 0 && <span className="cw-section-count">{openTasks.length} פתוחות</span>}
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => onGotoTab('tasks')}>
            ללשונית המשימות
          </button>
        </div>
        {openTasks.length === 0 ? (
          <div className="cw-empty">אין משימת משרד פתוחה ללקוח הזה.</div>
        ) : (
          <div className="cw-due-list">
            {openTasks.slice(0, 5).map((t) => {
              const tone = dueTone(t);
              return (
                <button key={t.id} type="button" className="cw-due-row" onClick={() => onSelectTask(t.id)}>
                  <span className="cw-due-main">
                    <span className="cw-due-title">{t.title}</span>
                  </span>
                  <span className="cw-due-ball" style={{ color: BALL_WITH_COLOR[t.ballWith] }}>
                    {BALL_WITH_LABELS[t.ballWith]}
                  </span>
                  <span className={`cw-due-date due due-${tone}`}>
                    {t.dueDate ? formatDate(t.dueDate, 'list') : '—'}
                  </span>
                </button>
              );
            })}
            {openTasks.length > 5 && (
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => onGotoTab('tasks')}>
                עוד {openTasks.length - 5}
              </button>
            )}
          </div>
        )}
        <p className="jt-footnote">
          משימות הן עבודת משרד; בקשות הן משהו שממתין לאדם אחר. שני מנגנונים נפרדים, גם אצל לקוח פעיל.
        </p>
      </div>

      {/* ── תיקי שנה + סכומי מפתח ── */}
      <div className="cw-section">
        <div className="cw-section-head">
          <span>תיקי שנה</span>
          {taxSessionsLoading && <span style={{ fontSize: '12px', color: 'var(--gray-400)' }}>טוען…</span>}
        </div>
        {taxSessions.length === 0 && !taxSessionsLoading ? (
          <div className="cw-empty">עדיין לא נפתח תיק דוח שנתי — אפשר מכפתור "דוח שנתי" למעלה.</div>
        ) : (
          /* שורה לשנה, לא גלולה: השנים נקראות זו מתחת לזו כרשימה
             כרונולוגית, ובכל שורה מצב אחד ופעולה אחת. */
          <div className="cw-years">
            {taxSessions.map((s) => {
              const y = summarizeYearFile(s);
              const meta = SESSION_STATUS_META[s.status];
              return (
                <div key={s.id} className="cw-year-row">
                  <b className="cw-year-num num">{y.taxYear}</b>
                  <span className="cw-year-state" style={{ color: meta.color }}>{meta.label}</span>
                  <span className="cw-year-meta">
                    {[
                      y.sourceLabels.length > 0 ? y.sourceLabels.join(' · ') : null,
                      y.docsTotal > 0 ? `מסמכים ${y.docsReceived}/${y.docsTotal}` : null,
                      y.openUnknowns > 0 ? `${y.openUnknowns} «לא בטוח»` : null,
                    ].filter(Boolean).join(' · ')}
                  </span>
                  {onOpenYear && (
                    <button type="button" className="btn btn-ghost btn-sm" onClick={() => onOpenYear(y.taxYear)}>פתח</button>
                  )}
                </div>
              );
            })}
          </div>
        )}
        {amounts.length > 0 && (
          <div style={{
            display: 'flex', flexWrap: 'wrap', gap: '.4rem 1.2rem', marginTop: '.6rem',
            fontSize: '13px', color: 'var(--gray-600)',
          }}>
            {amounts.map((a) => (
              <span key={a.label}>
                {a.label}: <b className="num" style={{ fontVariantNumeric: 'tabular-nums' }}>{a.value}</b>
              </span>
            ))}
          </div>
        )}
      </div>

      {/* ── מיילים שיצאו ללקוח ── */}
      {emails
        ? <ClientEmailsList rows={emails} loading={emailsLoading} onChanged={onEmailsChanged ?? (() => {})} />
        : client.id && <ClientEmailsSection clientId={client.id} emails={[client.email]} />}

      {/* ── הערה מוצמדת + הוספה מהירה ── */}
      <div className="cw-section pin-section">
        <div className="cw-section-head">
          <span>הערה מוצמדת</span>
          {!editingNote && (
            <button className="btn btn-ghost btn-sm" onClick={() => { setNoteDraft(client.pinnedNote ?? ''); setEditingNote(true); }}>
              {client.pinnedNote ? 'עריכה' : 'הוסף'}
            </button>
          )}
        </div>
        {editingNote ? (
          <div style={{ display: 'flex', gap: '.4rem', flexDirection: 'column' }}>
            <textarea value={noteDraft} onChange={(e) => setNoteDraft(e.target.value)} rows={2} style={{ width: '100%', padding: '.45rem .6rem', borderRadius: 7, border: '1px solid var(--gray-200)', fontFamily: 'inherit' }} />
            <div style={{ display: 'flex', gap: '.4rem' }}>
              <button className="btn btn-primary btn-sm" onClick={() => { onPinNote(noteDraft.trim()); setEditingNote(false); }}>שמור</button>
              <button className="btn btn-secondary btn-sm" onClick={() => setEditingNote(false)}>ביטול</button>
            </div>
          </div>
        ) : client.pinnedNote ? (
          <div style={{ fontSize: '14px', whiteSpace: 'pre-wrap' }}>{client.pinnedNote}</div>
        ) : (
          <div className="cw-empty">אין הערה מוצמדת.</div>
        )}
        <div style={{ display: 'flex', gap: '.4rem', marginTop: '.55rem' }}>
          <input
            type="text"
            value={quickNote}
            onChange={(e) => setQuickNote(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && quickNote.trim()) { onAddNote(quickNote.trim()); setQuickNote(''); } }}
            placeholder="הוסף רישום מהיר ליומן... (Enter לשמירה)"
            style={{ flex: 1, padding: '.4rem .6rem', borderRadius: 7, border: '1px solid var(--gray-200)' }}
          />
        </div>
      </div>
    </div>
  );
}

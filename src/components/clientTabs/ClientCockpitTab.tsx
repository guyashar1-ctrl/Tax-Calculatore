// ─── מרכז שליטה — מסך הבית של הלקוח ──────────────────────────────────────────
// עונה תוך 5 שניות: מה בוער (אותות לפי דחיפות), מה הבא (לוח הגשות),
// מה זז (פעילות אחרונה), ואיפה עומדים הדוחות (תיקי שנה + סכומים).
// הכל נגזר אוטומטית ממה שכבר קיים — אפס תחזוקה ידנית.

import { useMemo, useState } from 'react';
import type { Client, Task } from '../../types';
import type { ClientAlert } from '../../types/clientWorkspace';
import { ACTIVITY_ICON } from '../../types/clientWorkspace';
import { getMissingDocs, relativeTime, shortDate } from '../../utils/clientDerived';
import type { AnnualReportSession } from '../../features/annualReport/types';
import { summarizeYearFile, SESSION_STATUS_META, buildKeyAmounts } from '../../features/annualReport/profile';
import ClientEmailsSection from '../EmailActivity/ClientEmailsSection';

type TabId = 'overview' | 'dossier' | 'docs' | 'tasks';

interface Props {
  client: Client;
  tasks: Task[];
  alerts: ClientAlert[];
  openTasks: Task[];
  upcomingDebts: Task[];
  docCategories: Set<string>;
  onPinNote: (text: string) => void;
  onAddNote: (text: string) => void;
  onGotoTab: (tab: TabId) => void;
  onSelectTask: (id: string) => void;
  taxSessions: AnnualReportSession[];
  taxSessionsLoading?: boolean;
  onOpenYear?: (taxYear: number) => void;
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

// ─── לוח חובות הגשה — נגזר מצורת המס של הלקוח ───────────────────────────────
interface CalItem { label: string; due: string; ok?: boolean }

/** ה-15 בחודש הבא שרלוונטי לתדירות (חודשי/דו-חודשי, תקופות אי-זוגיות). */
function nextFilingDate(frequency: 'monthly' | 'bi_monthly'): string {
  const now = new Date();
  let m = now.getMonth() + 1; // תקופת הדיווח הנוכחית מדווחת בחודש הבא
  let y = now.getFullYear();
  if (frequency === 'bi_monthly' && m % 2 === 1) m += 1; // דו-חודשי: מדווחים אחרי חודש זוגי
  m += 1;
  if (m > 12) { m -= 12; y += 1; }
  return `15.${String(m).padStart(2, '0')}.${y}`;
}

function buildCalendar(client: Client, latest: AnnualReportSession | null): CalItem[] {
  const items: CalItem[] = [];
  const isSelfEmployed = client.incomeTaxType === 'selfEmployed' || client.incomeTaxType === 'both';

  if (client.vatStatus === 'authorizedDealer') {
    const freq = client.vatFrequency === 'monthly' ? 'monthly' : 'bi_monthly';
    items.push({ label: `מע"מ (${freq === 'monthly' ? 'חודשי' : 'דו-חודשי'})`, due: `עד ${nextFilingDate(freq)}` });
  }
  if (isSelfEmployed) {
    const freq = client.pitAdvanceFrequency === 'monthly' ? 'monthly' : 'bi_monthly';
    items.push({ label: 'מקדמות מס הכנסה', due: `עד ${nextFilingDate(freq)}` });
  }
  if ((client.taxFiles ?? []).some((f) => f.authority === 'deductions')) {
    items.push({ label: 'ניכויים (102)', due: `עד ${nextFilingDate(client.withholdingFrequency === 'monthly' ? 'monthly' : 'bi_monthly')}` });
  }
  if (latest) {
    const meta = SESSION_STATUS_META[latest.status];
    const inWork = latest.status === 'in_progress' || latest.status === 'review';
    items.push({
      label: `דוח שנתי ${latest.taxYear}`,
      due: latest.status === 'mapping_done' ? 'מוכן להגשה ✓' : inWork ? `${meta.label} ✓` : meta.label,
      ok: true,
    });
  }
  if (client.hasWealthDeclaration) {
    items.push({
      label: 'הצהרת הון',
      due: client.lastWealthDeclarationYear ? `הוגשה ${client.lastWealthDeclarationYear} ✓` : 'נדרשת',
      ok: !!client.lastWealthDeclarationYear,
    });
  }
  return items;
}

export default function ClientCockpitTab({
  client, alerts, openTasks, upcomingDebts, docCategories,
  onPinNote, onAddNote, onGotoTab, onSelectTask,
  taxSessions, taxSessionsLoading, onOpenYear,
}: Props) {
  const latest = taxSessions[0] ?? null;
  const latestSummary = latest ? summarizeYearFile(latest) : null;
  const amounts = buildKeyAmounts(client, latest);

  // ── אותות — נגזרים וממוינים לפי דחיפות ──
  const signals = useMemo<Signal[]>(() => {
    const out: Signal[] = [];

    // מסמכים חסרים: קבועים (לפי הכרטיס) + של תיק השנה
    const missingFixed = getMissingDocs(client, docCategories);
    const missingYear = latestSummary ? latestSummary.docsTotal - latestSummary.docsReceived : 0;
    const totalMissing = missingFixed.length + Math.max(0, missingYear);
    if (totalMissing > 0) {
      out.push({
        key: 'docs', level: 'crit',
        title: `📎 חסרים ${totalMissing} מסמכים`,
        subtitle: missingFixed.slice(0, 2).map((d) => d.label).join(' · ') || `בתיק ${latest?.taxYear}`,
        onClick: () => onGotoTab('docs'),
      });
    } else {
      out.push({ key: 'docs', level: 'ok', title: '📎 מסמכים', subtitle: 'אין חוסרים ידועים', onClick: () => onGotoTab('docs') });
    }

    // דוח שנתי אחרון
    if (latest && latestSummary) {
      const meta = SESSION_STATUS_META[latest.status];
      out.push({
        key: 'report',
        level: latest.status === 'review' ? 'warn' : latest.status === 'in_progress' ? 'warn' : 'ok',
        title: `📋 דוח ${latest.taxYear} — ${meta.label}`,
        subtitle: latest.status === 'review' ? 'ממתין לבדיקה שלך' : latest.status === 'in_progress' ? 'שאלון באמצע' : 'מיפוי הושלם',
        onClick: onOpenYear ? () => onOpenYear(latest.taxYear) : undefined,
      });
      if (latestSummary.openUnknowns > 0) {
        out.push({
          key: 'unknowns', level: 'warn',
          title: `🤷 ${latestSummary.openUnknowns} תשובות "לא בטוח"`,
          subtitle: 'לוודא מול הלקוח בשיחה הבאה',
          onClick: onOpenYear ? () => onOpenYear(latest.taxYear) : undefined,
        });
      }
    } else if (!taxSessionsLoading) {
      out.push({ key: 'report', level: 'warn', title: '📋 אין תיק דוח שנתי', subtitle: 'אפשר לפתוח מכפתור "דוח שנתי" למעלה' });
    }

    // משימות
    const stuck = openTasks.filter((t) => t.ballWith === 'stuck').length;
    out.push({
      key: 'tasks',
      level: stuck > 0 ? 'crit' : upcomingDebts.length > 0 ? 'warn' : 'ok',
      title: `✅ ${openTasks.length} משימות פתוחות`,
      subtitle: stuck > 0 ? `${stuck} תקועות!` : upcomingDebts.length > 0 ? `${upcomingDebts.length} עם מועד קרוב` : openTasks.length > 0 ? 'אף אחת לא תקועה' : 'הכל סגור',
      onClick: () => onGotoTab('tasks'),
    });

    // התראות מערכת (ניכוי פג, שע"ם, ספרים) — רק הבעייתיות
    for (const a of alerts) {
      if (a.kind === 'open_tasks' || a.kind === 'upcoming_debt') continue; // כבר מכוסה
      out.push({
        key: a.kind,
        level: a.level === 'danger' ? 'crit' : 'warn',
        title: `⚠ ${a.text}`,
        subtitle: 'טיפול בלשונית התיק',
        onClick: () => onGotoTab('dossier'),
      });
    }

    return out.sort((a, b) => LEVEL_RANK[a.level] - LEVEL_RANK[b.level]);
  }, [client, docCategories, latest, latestSummary, openTasks, upcomingDebts, alerts, taxSessionsLoading, onGotoTab, onOpenYear]);

  const calendar = useMemo(() => buildCalendar(client, latest), [client, latest]);
  const recentActivity = (client.activity ?? []).slice(0, 8);

  // ── הערה מוצמדת ──
  const [editingNote, setEditingNote] = useState(false);
  const [noteDraft, setNoteDraft] = useState(client.pinnedNote ?? '');
  const [quickNote, setQuickNote] = useState('');

  return (
    <div className="cw-overview" style={{ display: 'flex', flexDirection: 'column', gap: '.8rem' }}>

      {/* ── שורת האותות — מה בוער, ממוין לפי דחיפות ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '.55rem' }}>
        {signals.map((s) => (
          <button
            key={s.key}
            type="button"
            onClick={s.onClick}
            disabled={!s.onClick}
            style={{
              textAlign: 'right', background: 'var(--card)', fontFamily: 'inherit',
              border: '1px solid var(--gray-200)', borderTop: `3px solid ${LEVEL_COLOR[s.level]}`,
              borderRadius: 10, padding: '.6rem .8rem', cursor: s.onClick ? 'pointer' : 'default',
            }}
          >
            <b style={{ fontSize: '.86rem', display: 'block' }}>{s.title}</b>
            <span style={{ fontSize: '.75rem', color: 'var(--gray-500)' }}>{s.subtitle}</span>
          </button>
        ))}
      </div>

      {/* ── לוח הגשות + מה זז ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(280px, 1.3fr) minmax(260px, 1fr)', gap: '.7rem' }} className="cw-cockpit-row">
        <div className="cw-section">
          <div className="cw-section-head"><span>📅 מה הבא בתור — חובות הגשה</span></div>
          {calendar.length === 0 ? (
            <div className="cw-empty">אין חובות דיווח שוטפות לפי הכרטיס.</div>
          ) : (
            <div>
              {calendar.map((c) => (
                <div key={c.label} style={{
                  display: 'flex', justifyContent: 'space-between', gap: '.6rem', fontSize: '.86rem',
                  padding: '.35rem 0', borderBottom: '1px dashed var(--gray-100)',
                }}>
                  <span>{c.label}</span>
                  <span style={{ fontWeight: 700, color: c.ok ? 'var(--green, var(--ok))' : 'var(--warn)', whiteSpace: 'nowrap' }}>{c.due}</span>
                </div>
              ))}
            </div>
          )}
          {upcomingDebts.length > 0 && (
            <div style={{ marginTop: '.5rem' }}>
              {upcomingDebts.slice(0, 3).map((t) => (
                <button
                  key={t.id} type="button" onClick={() => onSelectTask(t.id)}
                  style={{
                    display: 'flex', justifyContent: 'space-between', width: '100%', gap: '.6rem',
                    background: 'var(--chip-amber-bg)', border: '1px solid var(--chip-amber-bd)', borderRadius: 7,
                    padding: '.3rem .6rem', fontSize: '.8rem', marginBottom: '.3rem',
                    cursor: 'pointer', fontFamily: 'inherit', textAlign: 'right',
                  }}
                >
                  <span>⏰ {t.title}</span>
                  <span style={{ fontWeight: 700, whiteSpace: 'nowrap' }}>{shortDate(t.dueDate)}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="cw-section">
          <div className="cw-section-head"><span>🕐 מה זז לאחרונה</span></div>
          {recentActivity.length === 0 ? (
            <div className="cw-empty">עדיין אין פעילות רשומה.</div>
          ) : (
            <div>
              {recentActivity.map((a) => (
                <div key={a.id} style={{ display: 'flex', gap: '.45rem', fontSize: '.8rem', padding: '.28rem 0', color: 'var(--gray-600)', alignItems: 'baseline' }}>
                  <span style={{ flex: 'none' }}>{ACTIVITY_ICON[a.kind] ?? '•'}</span>
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.text}</span>
                  <span style={{ marginRight: 'auto', color: 'var(--gray-400)', fontSize: '.72rem', whiteSpace: 'nowrap', flex: 'none' }}>{relativeTime(a.at)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ── תיקי שנה + סכומי מפתח ── */}
      <div className="cw-section">
        <div className="cw-section-head">
          <span>🗂️ דוחות שנתיים</span>
          {taxSessionsLoading && <span style={{ fontSize: '.75rem', color: 'var(--gray-400)' }}>טוען…</span>}
        </div>
        {taxSessions.length === 0 && !taxSessionsLoading ? (
          <div className="cw-empty">עדיין לא נפתח תיק דוח שנתי — אפשר מכפתור "📋 דוח שנתי" למעלה.</div>
        ) : (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '.5rem' }}>
            {taxSessions.map((s) => {
              const y = summarizeYearFile(s);
              const meta = SESSION_STATUS_META[s.status];
              return (
                <div key={s.id} style={{
                  border: '1px solid var(--gray-200)', borderRadius: 10, padding: '.5rem .8rem',
                  display: 'flex', alignItems: 'center', gap: '.55rem', fontSize: '.82rem',
                }}>
                  <b className="num" style={{ fontSize: '1rem' }}>{y.taxYear}</b>
                  <span style={{ fontSize: '.72rem', fontWeight: 700, borderRadius: 99, padding: '.1rem .5rem', color: meta.color, background: meta.bg }}>{meta.label}</span>
                  {y.sourceLabels.length > 0 && <span style={{ color: 'var(--gray-500)' }}>{y.sourceLabels.join(' · ')}</span>}
                  {y.docsTotal > 0 && <span style={{ color: 'var(--gray-500)' }}>📎 {y.docsReceived}/{y.docsTotal}</span>}
                  {y.openUnknowns > 0 && <span style={{ color: 'var(--warn)', fontWeight: 700 }}>🤷 {y.openUnknowns}</span>}
                  {onOpenYear && (
                    <button type="button" className="btn btn-ghost btn-sm" onClick={() => onOpenYear(y.taxYear)}>פתח ←</button>
                  )}
                </div>
              );
            })}
          </div>
        )}
        {amounts.length > 0 && (
          <div style={{
            display: 'flex', flexWrap: 'wrap', gap: '.4rem 1.2rem', marginTop: '.6rem',
            fontSize: '.82rem', color: 'var(--gray-600)',
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
      {client.id && <ClientEmailsSection clientId={client.id} emails={[client.email]} />}

      {/* ── הערה מוצמדת + הוספה מהירה ── */}
      <div className="cw-section pin-section">
        <div className="cw-section-head">
          <span>📌 הערה מוצמדת</span>
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
          <div style={{ fontSize: '.88rem', whiteSpace: 'pre-wrap' }}>{client.pinnedNote}</div>
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

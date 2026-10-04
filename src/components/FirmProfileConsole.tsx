// ─── «המשרד» ─────────────────────────────────────────────────────────────────
// מעטפת אחת לכל הגדרות המשרד: שמונה יעדים לפי מה שבאים לעשות
// (officeModel.ts). כל הגדרה נערכת במקום אחד; כשהיא נחוצה גם בהקשר אחר
// (קישור ההזמנה לפייפרלס, נוסח מייל מתוך בקשה) — אותו רכיב נפתח שם, לא עותק.
//
// ‼ שתי יחידות שמירה:
//   · רשומת המשרד (profiles) — כל העמודים שעורכים אותה. כתיבה אחת, אטומית,
//     מ«שמירה» בשורת השמירה.
//   · מסלול (office_flows) — נשמר כגרסה חדשה מתוך המסלול עצמו, עם סיכום השינוי.
//     הקונסולה רק יודעת שיש מסלול שלא נשמר: נקודה בתפריט, שורה בשורת השמירה,
//     ושאלה ביציאה. (2.10.2026: «בקשות ללקוח חדש» לכל סוג — עברו למסלול הקליטה.)
//   הצעות מחיר, עובדים ובקשות בספרייה נשמרים מיד בחלון העריכה שלהם.
// ‼ שינויים שלא נשמרו מוגנים: מעבר בין עמודי המשרד שומר אותם בזיכרון; יציאה
// מהמשרד, «אחורה» או סגירת הלשונית — שואלים קודם (lib/leaveGuard.ts).
// ‼ (1.10.2026, סבב 3) 18 עמודים בשש קבוצות → 8 יעדים. ראה
// docs/OFFICE-UX-ROUND3-2026-10-01.md. (2.10.2026) ספרייה · מסלולים · אוטומציות —
// docs/PLAN-LIBRARY-FLOWS.md.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { FirmProfile } from '../types/firmProfile';
import type { Client } from '../types';
import type { TabId as ClientTabId } from './ClientWorkspace';
import EmployeesPanel from './EmployeesPanel';
import QuotationSettings from './quotations/QuotationSettings';
import ProfilePage from './office/pages/ProfilePage';
import LibraryPage from './office/pages/LibraryPage';
import { FlowsPage } from './office/pages/FlowsPage';
import EmailsPage from './office/pages/EmailsPage';
import ConnectionsPage from './office/pages/ConnectionsPage';
import AutomationsPage from './office/pages/AutomationsPage';
import ClientPicker from './office/pages/ClientPicker';
import type { ActivityFilter } from './office/pages/activityFilter';
import Modal from './ui/Modal';
import {
  DEFAULT_OFFICE_PAGE, NAV_BREAK_AFTER, OFFICE_PAGES, pageDef, resolveOfficeLocation,
  type DirtyPart, type OfficePageId,
} from './office/officeModel';
import { useOfficeDraft } from './office/useOfficeDraft';
import { setLeaveGuard } from '../lib/leaveGuard';
import { setPendingIntent } from '../lib/pendingIntent';
import './office/office.css';

interface Props {
  profile: FirmProfile;
  clients: Client[];
  onSave: (p: FirmProfile) => Promise<void> | void;
  /** העמוד מהכתובת (‎#/firm/{page}‎). בלי — המסך מנהל את העמוד בעצמו. */
  page?: string | null;
  onPageChange?: (page: string | null) => void;
  /** פתיחת כרטיס לקוח: «פעילות» מיומן המיילים, «בקשות» מ«שליחה ללקוח».
   *  'rep-center' — מרכז הייצוג (מ«אוטומציות»: הזנה/שליחה/בדיקה מול הרשות). */
  onOpenClient?: (clientId: string, tab?: ClientTabId | 'rep-center') => void;
  /** מה לפתוח בעמוד, מהכתובת (‎#/firm/library/request:…‎ / ‎#/firm/flows/flow:…‎). */
  focus?: string | null;
}


export default function FirmProfileConsole({ profile, clients, onSave, page: routePage, onPageChange, onOpenClient, focus: routeFocus }: Props) {
  const office = useOfficeDraft(profile, onSave);
  const { draft, setDraft } = office;

  // ── העמוד: מהכתובת כש-App מנהל אותו, אחרת פנימי ─────────────────────────
  const [localPage, setLocalPage] = useState<string | null>(null);
  const controlled = onPageChange !== undefined;
  const rawPage = controlled ? (routePage ?? null) : localPage;
  const location = resolveOfficeLocation(rawPage);
  const page = location?.page ?? null;
  const shown: OfficePageId = page ?? DEFAULT_OFFICE_PAGE;
  // מה לפתוח בעמוד: מכתובת ישנה (‎#/firm/signature‎) או מקישור בעמוד אחר.
  const [focus, setFocus] = useState<string | null>(routeFocus ?? location?.focus ?? null);
  const go = useCallback((p: OfficePageId | null, f?: string) => {
    setFocus(f ?? null);
    if (controlled) onPageChange!(p);
    else setLocalPage(p);
  }, [controlled, onPageChange]);
  // כתובת ישנה שמגיעה מבחוץ (קישור שמור) — הפוקוס שלה נקבע פעם אחת.
  const lastRaw = useRef(rawPage);
  useEffect(() => {
    if (rawPage !== lastRaw.current) {
      lastRaw.current = rawPage;
      if (location?.focus) setFocus(location.focus);
    }
  }, [rawPage, location?.focus]);
  // קישור עמוק מכרטיס לקוח («פתח בספרייה» / «פתח את המסלול») — נוחת על הפריט.
  // ‼ רק ערך חדש שאינו ריק: App מנקה את הפוקוס במעבר עמוד, ואסור שהניקוי ידרוס
  // את הפוקוס ש-go() קבע זה עתה.
  const lastRouteFocus = useRef(routeFocus ?? null);
  useEffect(() => {
    if ((routeFocus ?? null) !== lastRouteFocus.current) {
      lastRouteFocus.current = routeFocus ?? null;
      if (routeFocus) setFocus(routeFocus);
    }
  }, [routeFocus]);

  // מעבר עמוד מתחיל מראש העמוד — אלא אם יש מה לפתוח בו (השורה גוללת לעצמה).
  const focusRef = useRef(focus);
  focusRef.current = focus;
  useEffect(() => { if (!focusRef.current) window.scrollTo({ top: 0 }); }, [page]);

  // רוחב מלא רק כשצריך: העיצוב (תצוגה מקדימה) ו«מה נשלח» (טבלה).
  const [pageWide, setPageWide] = useState(false);
  const [logFilter, setLogFilter] = useState<ActivityFilter | null>(null);
  const [sendDoc, setSendDoc] = useState<{ id: string; label: string; fileName?: string } | null>(null);

  // ── מסלול שנערך ולא נשמר ────────────────────────────────────────────────
  // ‼ המסלול נשמר מתוך העמוד שלו (גרסה חדשה + סיכום השינוי), לא מכאן. העמוד
  // מדווח שיש שינוי; כאן רק מגינים עליו: הוא נשאר טעון (מוסתר) כשעוברים לעמוד
  // אחר במשרד — כמו כל טיוטה אחרת כאן — ונזרק רק ב«יציאה בלי לשמור».
  const [flowsDirty, setFlowsDirty] = useState(false);
  const [flowsResetKey, setFlowsResetKey] = useState(0);
  // מפתח הרכבה: שינוי פוקוס (קישור «בשימוש ב» מהספרייה) פותח את המסלול הנכון —
  // אבל לא כשיש שינוי פתוח, שאחרת היה נזרק בשקט.
  const flowsFocusKey = useRef(focus ?? '');
  const flowsFocusSeen = useRef(focus);
  if (focus !== flowsFocusSeen.current) {
    flowsFocusSeen.current = focus;
    if (shown === 'flows' && !flowsDirty) flowsFocusKey.current = focus ?? '';
  }
  const discardFlows = useCallback(() => {
    setFlowsDirty(false);
    setFlowsResetKey(k => k + 1);
  }, []);

  // ── מה לא נשמר ──────────────────────────────────────────────────────────
  const dirtyPages = new Set<string>(office.dirtyPages);
  if (flowsDirty) dirtyPages.add('flows');
  const anyDirty = office.dirty || flowsDirty;

  // ── שמירה ───────────────────────────────────────────────────────────────
  const saveOffice = useCallback(async (): Promise<boolean> => (office.dirty ? office.save() : true), [office]);

  const discardAll = useCallback(() => {
    office.discard();
    if (flowsDirty) discardFlows();
  }, [office, flowsDirty, discardFlows]);

  // ── הגנה על שינויים: יציאה מהמשרד, «אחורה», סגירת הלשונית ───────────────
  const [pendingLeave, setPendingLeave] = useState<(() => void) | null>(null);
  const dirtyRef = useRef(anyDirty);
  dirtyRef.current = anyDirty;
  useEffect(() => {
    setLeaveGuard(proceed => {
      if (!dirtyRef.current) return true;
      setPendingLeave(() => proceed);
      return false;
    });
    return () => setLeaveGuard(null);
  }, []);
  useEffect(() => {
    if (!anyDirty) return;
    const h = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', h);
    return () => window.removeEventListener('beforeunload', h);
  }, [anyDirty]);

  const def = pageDef(shown);
  // ‼ «מסלולים» תמיד ברוחב מלא: הבונה ו«מה יקרה» יושבים זה לצד זה במחשב.
  // «אוטומציות» — שלוש עמודות (מה קורה · מה מפעיל · תוצאה אחרונה) צריכות רוחב.
  const wide = ((shown === 'profile' || shown === 'emails') && pageWide) || shown === 'flows' || shown === 'automations';

  return (
    <div className="of" dir="rtl">
      <div className={`of-shell${page ? ' has-page' : ''}`}>
        <nav className="of-nav" aria-label="עמודי המשרד">
          <h1 className="of-nav-title">המשרד</h1>
          <ul className="of-nav-list">
            {OFFICE_PAGES.map(p => {
              const current = shown === p.id;
              const unsaved = dirtyPages.has(p.id);
              return (
                <li key={p.id} className={NAV_BREAK_AFTER.has(p.id) ? 'has-break' : undefined}>
                  <button type="button" className="of-nav-item"
                    aria-current={current ? 'page' : undefined}
                    onClick={() => go(p.id)}>
                    <span className="of-nav-label">{p.label}</span>
                    <span className="of-nav-blurb">{p.blurb}</span>
                    <span className="of-nav-end">
                      {unsaved && <span className="of-dot" title="יש כאן שינויים שלא נשמרו" aria-label="לא נשמר" />}
                      <span className="of-chev" aria-hidden="true">‹</span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </nav>

        {/* ‼ section ולא main: המעטפת של האפליקציה כבר מחזיקה את ה-main היחיד בעמוד. */}
        <section className={`of-main${wide ? ' is-wide' : ''}`} aria-labelledby="of-page-title">
          <header className="of-page-head">
            <button type="button" className="of-back" onClick={() => go(null)}>
              <span aria-hidden="true">›</span> המשרד
            </button>
            <h1 className="of-h1" id="of-page-title">{def.label}</h1>
            <p className="of-lead">{def.blurb}</p>
          </header>

          {shown === 'profile' && (
            <ProfilePage key={`profile-${focus ?? ''}`} draft={draft} saved={profile} setDraft={setDraft}
              noteUpload={office.noteUpload} focus={focus} onWide={setPageWide} />
          )}
          {shown === 'team' && <EmployeesPanel clients={clients} />}
          {shown === 'library' && (
            <LibraryPage key={`library-${focus ?? ''}`} focus={focus} draft={draft} saved={profile} setDraft={setDraft}
              noteUpload={office.noteUpload} go={go}
              onSendToClient={onOpenClient ? d => setSendDoc(d) : undefined} />
          )}
          {(shown === 'flows' || flowsDirty) && (
            <div hidden={shown !== 'flows'}>
              <FlowsPage key={`flows-${flowsResetKey}-${flowsFocusKey.current}`} draft={draft} saved={profile} setDraft={setDraft}
                saveNow={office.saveNow} clients={clients} focus={focus ?? undefined} go={go}
                onDirtyChange={setFlowsDirty}
                onOpenClient={onOpenClient ? (id: string, tab?: 'journey') => onOpenClient(id, tab) : undefined} />
            </div>
          )}
          {shown === 'pricing' && <QuotationSettings profile={draft} onOpenReminders={() => go('automations', 'rem-expiry')} />}
          {shown === 'emails' && (
            <EmailsPage key={`emails-${focus ?? ''}`} draft={draft} saveNow={office.saveNow} userId={profile.id}
              clients={clients} onOpenClient={onOpenClient ? id => onOpenClient(id, 'log') : undefined}
              focus={focus} logFilter={logFilter} onClearLogFilter={() => setLogFilter(null)} onWide={setPageWide} go={go} />
          )}
          {shown === 'automations' && (
            <AutomationsPage key={`automations-${focus ?? ''}`} clients={clients} focus={focus} go={go}
              onOpenClient={onOpenClient ? (id, tab, target) => onOpenClient(id, target === 'rep-center' ? 'rep-center' : tab) : undefined}
              draft={draft} setDraft={setDraft}
              openLog={f => { setLogFilter(f); go('emails', 'log'); }} />
          )}
          {shown === 'connections' && (
            <ConnectionsPage key={`connections-${focus ?? ''}`} draft={draft} setDraft={setDraft} focus={focus} go={go} />
          )}

          <SaveBar office={office} flowsDirty={flowsDirty && shown !== 'flows'} onSave={saveOffice} go={go} />
        </section>
      </div>

      {sendDoc && onOpenClient && (
        <ClientPicker clients={clients} title={`שליחת «${sendDoc.label}» ללקוח`}
          onClose={() => setSendDoc(null)}
          onPick={clientId => {
            setPendingIntent({ kind: 'send-office-docs', clientId, docs: [{ officeId: sendDoc.id, label: sendDoc.label, fileName: sendDoc.fileName }] });
            setSendDoc(null);
            onOpenClient(clientId, 'journey');
          }} />
      )}

      {pendingLeave && (
        <LeaveDialog
          officeParts={office.dirtyParts}
          flowsDirty={flowsDirty}
          onStay={() => { setPendingLeave(null); if (flowsDirty && !office.dirty) go('flows'); }}
          onDiscard={() => { const go2 = pendingLeave; setPendingLeave(null); discardAll(); go2(); }}
          onSave={async () => {
            const go2 = pendingLeave;
            const ok = await saveOffice();
            setPendingLeave(null);
            if (ok) go2();
          }}
        />
      )}
    </div>
  );
}

// ─── שורת השמירה ─────────────────────────────────────────────────────────────

function partNames(parts: DirtyPart[]): string {
  return [...new Set(parts.map(p => p.label))].join(' · ');
}

function SaveBar({ office, flowsDirty, onSave, go }: {
  office: ReturnType<typeof useOfficeDraft>;
  /** מסלול שנערך ולא נשמר, כשאתה בעמוד אחר — נשמר רק מתוך המסלול. */
  flowsDirty: boolean;
  onSave: () => Promise<boolean>;
  go: (p: OfficePageId) => void;
}) {
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const showOffice = office.dirty || office.status === 'saving' || office.status === 'error' || office.status === 'saved';
  const busy = office.status === 'saving';
  useEffect(() => { if (!office.dirty) setConfirmDiscard(false); }, [office.dirty]);

  const officeText = useMemo(() => partNames(office.dirtyParts), [office.dirtyParts]);
  if (!showOffice && !flowsDirty && !office.cleanupWarning) return null;

  return (
    <div className="of-savebar" role="region" aria-label="שמירה">
      {showOffice && (
        <div className={`of-savebar-row${office.status === 'error' ? ' is-error' : ''}`} aria-live="polite">
          <div className="of-savebar-text">
            {office.status === 'saving' ? <>שומר…</>
              : office.status === 'saved' && !office.dirty ? <span className="is-ok">✓ נשמר</span>
                : <>
                  <b>לא נשמר</b> · {officeText}
                  {office.status === 'error' && (
                    <span className="is-err" role="alert">השמירה נכשלה: {office.error}. השינויים עדיין כאן — אפשר לנסות שוב.</span>
                  )}
                </>}
          </div>
          {office.dirty && !confirmDiscard && (
            <div className="of-savebar-acts">
              <button type="button" className="btn btn-ghost btn-sm" disabled={busy} onClick={() => setConfirmDiscard(true)}>ביטול<span className="of-hide-sm"> השינויים</span></button>
              <button type="button" className="btn btn-primary btn-sm" disabled={busy} onClick={() => void onSave()}>
                {busy ? 'שומר…' : office.status === 'error' ? 'ניסיון חוזר' : 'שמירה'}
              </button>
            </div>
          )}
        </div>
      )}

      {flowsDirty && (
        <div className="of-savebar-row" aria-live="polite">
          <div className="of-savebar-text">
            <b>{office.dirty ? 'וגם' : 'לא נשמר'}</b> · מסלול שנערך — נשמר מתוך המסלול, עם סיכום של מה השתנה.
          </div>
          <div className="of-savebar-acts">
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => go('flows')}>חזרה למסלול</button>
          </div>
        </div>
      )}

      {confirmDiscard && (
        <div className="of-savebar-row">
          <div className="of-savebar-text"><b>לבטל את השינויים שלא נשמרו?</b> מה שהוקלד או הועלה ולא נשמר — יימחק.</div>
          <div className="of-savebar-acts">
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setConfirmDiscard(false)} autoFocus>חזרה</button>
            <button type="button" className="btn btn-danger btn-sm" onClick={() => { setConfirmDiscard(false); office.discard(); }}>ביטול<span className="of-hide-sm"> השינויים</span></button>
          </div>
        </div>
      )}

      {office.cleanupWarning && !showOffice && (
        <div className="of-savebar-row"><div className="of-savebar-text of-muted">{office.cleanupWarning}</div></div>
      )}
    </div>
  );
}

// ─── יציאה עם שינויים שלא נשמרו ──────────────────────────────────────────────

function LeaveDialog({ officeParts, flowsDirty, onStay, onDiscard, onSave }: {
  officeParts: DirtyPart[];
  flowsDirty: boolean;
  onStay: () => void;
  onDiscard: () => void;
  onSave: () => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  // ‼ מסלול לא נשמר מכאן: שמירה שלו היא גרסה חדשה עם סיכום, ולכן היא קורית רק
  // בתוך המסלול. כשרק המסלול פתוח — «להישאר» מחזיר אליו, ואין «שמירה ויציאה».
  const canSave = officeParts.length > 0;
  return (
    <Modal title="יש שינויים שלא נשמרו" onClose={onStay} width={460}
      footer={<>
        <button type="button" className="ui-btn ui-btn-ghost" onClick={onStay} data-autofocus disabled={busy}>
          {flowsDirty && !canSave ? 'חזרה למסלול' : 'להישאר'}
        </button>
        <button type="button" className="ui-btn ui-btn-ghost" style={{ color: 'var(--danger)' }} onClick={onDiscard} disabled={busy}>יציאה בלי לשמור</button>
        {canSave && (
          <button type="button" className="ui-btn ui-btn-primary" disabled={busy}
            onClick={async () => { setBusy(true); await onSave(); setBusy(false); }}>
            {busy ? 'שומר…' : flowsDirty ? 'שמירת המשרד ויציאה' : 'שמירה ויציאה'}
          </button>
        )}
      </>}>
      <div className="ui-confirm-text">
        אם תצא עכשיו, השינויים האלה יאבדו:
        <ul className="of-leave-list">
          {officeParts.length > 0 && <li>{partNames(officeParts)}</li>}
          {flowsDirty && <li>מסלול שנערך — {canSave ? 'לא נשמר ב«שמירת המשרד»; ' : ''}נשמר רק מתוך המסלול</li>}
        </ul>
      </div>
    </Modal>
  );
}

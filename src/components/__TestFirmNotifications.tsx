// ─── מסך בדיקה ל«המשרד» כולו — מסד מדומה, פיתוח בלבד ────────────────────────
// ‼ למה זה קיים: בשרת הפיתוח הכניסה האוטומטית מחוברת למסד החי, ומשתמש הבדיקות
// חסום שם. כאן «המשרד» המלא רץ על מסד מדומה בזיכרון (office/__fakeBackend.ts)
// שמותקן לפני שהאפליקציה עולה — שום בקשה לא יוצאת למסד, לאחסון או לשליחה.
//
// פתיחה:  http://localhost:5192/?test-office            (גם ?test-firm-notifications)
// אפשרויות: &empty  &slow  &fail=save|intake|upload|load  &offline  &theme=dark
// הכתובת ‎#/firm/<עמוד>‎ פותחת עמוד ישירות, ו«אחורה» עובד כמו באפליקציה.
// הכפתור «יציאה מהמשרד» מדמה מעבר למסך אחר — כדי לבדוק את ההגנה על שינויים.

import { useEffect, useState } from 'react';
import type { Client } from '../types';
import type { FirmProfile } from '../types/firmProfile';
import FirmProfileConsole from './FirmProfileConsole';
import { ShaamReadinessProvider } from '../hooks/shaamReadiness';
import { requestLeave } from '../lib/leaveGuard';
import { FAKE_ACTIVE, FAKE_FAIL, FIRM_ID, FIXTURE_PROFILE, installFakeBackend } from './office/__fakeBackend';

if (FAKE_ACTIVE) installFakeBackend();

const CLIENTS = [
  { id: 'sample-1', firstName: 'ישראל', lastName: 'ישראלי' },
  { id: 'sample-2', firstName: 'אורית', lastName: 'בן-שושן אלמוג (חברת אלמוג השקעות ונדל״ן בע״מ)' },
  { id: 'sample-3', firstName: 'דנה', lastName: 'כהן', assignedAccountantId: 'emp-2' },
] as unknown as Client[];

const pageFromHash = () => {
  const m = window.location.hash.match(/^#\/firm\/([^/]+)/);
  return m ? decodeURIComponent(m[1]) : null;
};

export default function TestFirmNotifications() {
  const [profile, setProfile] = useState<FirmProfile>(FIXTURE_PROFILE);
  const [page, setPage] = useState<string | null>(pageFromHash());
  const [left, setLeft] = useState(false);
  const [saves, setSaves] = useState(0);

  useEffect(() => {
    const theme = new URLSearchParams(window.location.search).get('theme');
    if (theme) document.documentElement.setAttribute('data-theme', theme);
    const onPop = () => {
      if (!window.location.hash.startsWith('#/firm')) {
        // «אחורה» שיוצא מהמשרד — עובר דרך אותו שומר כמו באפליקציה
        const moved = requestLeave(() => setLeft(true));
        if (!moved) window.history.pushState(null, '', `#/firm${page ? `/${page}` : ''}`);
        return;
      }
      setPage(pageFromHash());
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, [page]);

  const changePage = (p: string | null) => {
    setPage(p);
    window.history.pushState(null, '', `#/firm${p ? `/${p}` : ''}`);
  };

  if (left) {
    return (
      <div dir="rtl" style={{ padding: 24 }}>
        <p data-testid="left-office">יצאת מהמשרד (מסך אחר).</p>
        <button className="btn btn-secondary" onClick={() => { setLeft(false); changePage(null); }}>חזרה למשרד</button>
      </div>
    );
  }

  return (
    <ShaamReadinessProvider userId={FIRM_ID}>
      <div className="app">
        <div className="main" style={{ paddingTop: 16 }}>
          <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 14, fontSize: 12, color: 'var(--ink-4)', flexWrap: 'wrap' }} dir="rtl">
            <span>מסך בדיקה · מסד מדומה · שמירות: <b data-testid="save-count">{saves}</b></span>
            {FAKE_FAIL.size > 0 && <span>כשל מכוון: {[...FAKE_FAIL].join(', ')}</span>}
            <button type="button" className="btn btn-ghost btn-sm" data-testid="leave-office"
              onClick={() => requestLeave(() => setLeft(true))}>יציאה מהמשרד ←</button>
          </div>
          <FirmProfileConsole
            profile={profile}
            clients={CLIENTS}
            page={page}
            onPageChange={changePage}
            onOpenClient={id => alert(`פתיחת כרטיס הלקוח ${id} בלשונית «פעילות»`)}
            onSave={async p => {
              await new Promise(r => setTimeout(r, new URLSearchParams(window.location.search).has('slow') ? 1600 : 250));
              if (FAKE_FAIL.has('save')) throw { message: 'החיבור לשרת נכשל (תרחיש בדיקה)' };
              (window.__officeWrites ??= []).push({ what: 'profiles.update', detail: p.settings });
              setProfile(p);
              setSaves(n => n + 1);
            }}
          />
        </div>
      </div>
    </ShaamReadinessProvider>
  );
}

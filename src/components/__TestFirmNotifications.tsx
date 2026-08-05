// ─── מסך בדיקה למסך "המשרד" — נתונים מדומים ─────────────────────────────────
// ‼ למה זה קיים: משתמש הבדיקות חסום ב-RLS, ובשרת הפיתוח פרופיל המשרד לא נטען
// מהמסד — המסך נתקע על "טוען את פרופיל המשרד…". כאן מרכיבים אותו על פרופיל
// מדומה, כדי לבדוק את לשונית "התראות למשרד" בלי לגעת בנתוני אמת.
//
// פתיחה:  http://localhost:5173/?test-firm-notifications   (DEV בלבד)

import { useState } from 'react';
import type { Client } from '../types';
import type { FirmProfile } from '../types/firmProfile';
import FirmProfileConsole from './FirmProfileConsole';

const PROFILE: FirmProfile = {
  id: 'test-firm',
  email: 'office@example.co.il',
  firmName: 'משרד בדיקה',
  branding: {},
  communication: {},
  settings: {},
};

export default function TestFirmNotifications() {
  const [profile, setProfile] = useState<FirmProfile>(PROFILE);
  const [saved, setSaved] = useState<string>('טרם נשמר');

  return (
    <div style={{ padding: '1.5rem', maxWidth: 1080, margin: '0 auto' }} dir="rtl">
      <div style={{ fontSize: 13, color: 'var(--ink-3)', marginBottom: '1rem' }}>
        בדיקת "התראות למשרד" · מה שנשמר בפועל:{' '}
        <code style={{ direction: 'ltr', display: 'inline-block' }}>{saved}</code>
      </div>
      <FirmProfileConsole
        profile={profile}
        clients={[] as Client[]}
        onSave={p => {
          setProfile(p);
          setSaved(JSON.stringify(p.settings.accountantNotifications ?? {}));
        }}
      />
    </div>
  );
}

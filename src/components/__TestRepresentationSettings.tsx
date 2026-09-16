// ─── מסך בדיקה למסך "המשרד → ייצוג" — נתונים מדומים ──────────────────────────
// ‼ אותה בעיה כמו __TestFirmNotifications.tsx: פרופיל המשרד לא נטען בשרת
// הפיתוח למשתמש הבדיקות. מרכיבים כאן על פרופיל מדומה, עם כמה התאמות קיימות
// מראש כדי לבדוק גם את מצב "מותאם" וגם את מצב "ברירת מחדל" באותה בדיקה.
//
// פתיחה:  http://localhost:5173/?test-representation-settings   (DEV בלבד)

import { useState } from 'react';
import type { Client } from '../types';
import type { FirmProfile } from '../types/firmProfile';
import FirmProfileConsole from './FirmProfileConsole';

const PROFILE: FirmProfile = {
  id: 'test-firm',
  email: 'office@example.co.il',
  firmName: 'ישר רואי חשבון',
  representativeNumber: '33421',
  representativeType: 'רואה חשבון',
  branding: {},
  communication: { senderEmail: 'office@yasharcpa.co.il' },
  settings: {
    representation: {
      defaults: {
        authorities: {
          incomeTax: { on: true, level: 'primary' },
          vat: { on: true, level: 'primary' },
          withholding: { on: false, level: 'primary' },
          nationalInsurance: { on: true },
        },
        niSpouse: true,
        delivery: 'email',
      },
      templates: {
        rep_sign: { body: 'הכנו עבורכם את טופס ייפוי הכוח לייצוג מול רשויות המס. נשאר רק לחתום — לוקח פחות מדקה, ואפשר גם מהנייד.' },
        portalCard: { sub: 'אופציונלי — שלוש דקות שחוסכות לרוב כשבועיים של המתנה' },
      },
      reminders: {
        niClient: { enabled: true, afterDays: 7, maxReminders: 2 },
      },
    },
  },
};

export default function TestRepresentationSettings() {
  const [profile, setProfile] = useState<FirmProfile>(PROFILE);
  const [saved, setSaved] = useState<string>('טרם נשמר');

  return (
    <div style={{ padding: '1.5rem', maxWidth: 1080, margin: '0 auto' }} dir="rtl">
      <div style={{ fontSize: 13, color: 'var(--ink-3)', marginBottom: '1rem' }}>
        בדיקת "ייצוג" · מה שנשמר בפועל:{' '}
        <code style={{ direction: 'ltr', display: 'inline-block', whiteSpace: 'pre-wrap' }}>{saved}</code>
      </div>
      <FirmProfileConsole
        profile={profile}
        clients={[] as Client[]}
        onSave={p => {
          setProfile(p);
          setSaved(JSON.stringify((p.settings as Record<string, unknown>).representation ?? {}, null, 1));
        }}
      />
    </div>
  );
}

// ─── מסך בדיקה: מרכז התיק על לקוח הבדיקה האמיתי (?test-case=<clientId>) ──────
// DEV בלבד. מרכיב את OnboardingTab במצב המסע מול ה-DB החי, עם הסשן של משתמש
// הפיתוח — הדרך לבדוק את הקומפוזר, הטיוטות ופס הפרסום על נתונים אמיתיים
// (בארגז החול של משתמש הבדיקה בלבד!) בלי לעבור דרך רשימת הלקוחות שמוחלפת
// בנתוני דוגמה ב-DEV.

import { useAuth } from '../../hooks/useAuth';
import { useOnboarding } from '../../hooks/useOnboarding';
import OnboardingTab from './OnboardingTab';

export default function TestCaseComposer() {
  const { user } = useAuth();
  const clientId = new URLSearchParams(window.location.search).get('test-case') ?? '';
  const ob = useOnboarding(user?.id, clientId);

  if (!clientId) return <p style={{ padding: '1rem' }}>חסר מזהה לקוח: ?test-case=&lt;id&gt;</p>;
  if (!user) return <p style={{ padding: '1rem' }}>ממתין להתחברות…</p>;

  return (
    <div style={{ maxWidth: 860, margin: '0 auto', padding: '1rem', display: 'grid', gap: '.8rem' }}>
      <h2 style={{ margin: 0 }}>מרכז התיק — הרצה אמיתית על לקוח הבדיקה</h2>
      <OnboardingTab
        embedded
        clientId={clientId}
        engagements={ob.engagements}
        steps={ob.steps}
        events={ob.events}
        loading={ob.loading}
        advance={ob.advance}
        refresh={ob.refresh}
        clientDisplayName="לקוח הבדיקה"
        clientEmail="delivered@resend.dev"
        prevAccountant={{ name: 'רו״ח קודם (בדיקה)', email: '' }}
      />
    </div>
  );
}

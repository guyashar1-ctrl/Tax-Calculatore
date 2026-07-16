// מסך "אין גישה" — מוצג למשתמש שהתחבר בהצלחה אך אינו ברשימת המורשים.
// זו שכבת הנוחות בלבד; החסימה האמיתית היא ב-RLS ובפונקציות השרת.

interface Props {
  email: string;
  onSignOut: () => void;
}

export default function NoAccessScreen({ email, onSignOut }: Props) {
  return (
    <div className="login-screen">
      <div className="login-card">
        <div className="login-logo">🔒</div>
        <h1 className="login-title">אין לך גישה למערכת זו</h1>
        <p className="login-subtitle">
          החשבון <strong dir="ltr">{email}</strong> אינו מורשה לגשת לצד הניהול.
          אם לדעתך זו טעות, פנה למנהל המשרד.
        </p>
        <button type="button" className="login-google-btn" onClick={onSignOut}>
          התנתקות והחלפת חשבון
        </button>
        <p className="login-footnote">
          הגישה מוגבלת לכתובות מייל מאושרות בלבד.
        </p>
      </div>
    </div>
  );
}

// ─── גבול שגיאה ──────────────────────────────────────────────────────────
// עוטף אזור במסך כך שקריסה של רכיב בודד (למשל נתון פגום) לא תרוקן את כל
// האפליקציה, אלא תציג הודעה ידידותית ותאפשר לנווט הלאה. Error boundary חייב
// להיות class component — אין hook מקביל.

import { Component, ErrorInfo, ReactNode } from 'react';

interface Props {
  children: ReactNode;
  /** משתנה שכשמשתנה — מאפסים את מצב השגיאה (למשל מזהה הלשונית הפעילה) */
  resetKey?: unknown;
  label?: string;
}

interface State {
  error: Error | null;
}

export default class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('ErrorBoundary caught:', error, info.componentStack);
  }

  componentDidUpdate(prev: Props) {
    // מעבר בין לשוניות/פריטים מאפס את השגיאה כדי לנסות לרנדר מחדש
    if (prev.resetKey !== this.props.resetKey && this.state.error) {
      this.setState({ error: null });
    }
  }

  render() {
    if (this.state.error) {
      return (
        <div style={{ maxWidth: 620, margin: '3rem auto', padding: '1.75rem 2rem', background: 'var(--card)', border: '1px solid var(--gray-200)', borderRadius: 'var(--radius-lg, 14px)', textAlign: 'center' }}>
          <div style={{ fontSize: '2.4rem', marginBottom: '.5rem' }}>😕</div>
          <h2 style={{ margin: '0 0 .5rem', fontSize: '1.15rem' }}>
            {this.props.label ? `שגיאה ב${this.props.label}` : 'משהו השתבש בטעינת המסך'}
          </h2>
          <p style={{ color: 'var(--gray-600)', fontSize: '.9rem', lineHeight: 1.7, margin: '0 0 1.25rem' }}>
            נתקלנו בבעיה בהצגת המסך הזה, כנראה בגלל רשומה עם נתון חסר או פגום.
            שאר המערכת פועלת - אפשר לעבור ללשונית אחרת. אם זה חוזר, ספרו לנו מה ניסיתם לפתוח.
          </p>
          <div style={{ display: 'flex', gap: '.6rem', justifyContent: 'center' }}>
            <button className="btn btn-secondary" onClick={() => this.setState({ error: null })}>נסה שוב</button>
            <button className="btn btn-primary" onClick={() => window.location.reload()}>רענן את הדף</button>
          </div>
          <details style={{ marginTop: '1.25rem', textAlign: 'left', direction: 'ltr' }}>
            <summary style={{ cursor: 'pointer', fontSize: '.75rem', color: 'var(--gray-400)' }}>פרטים טכניים</summary>
            <pre style={{ fontSize: '.72rem', color: 'var(--gray-500)', whiteSpace: 'pre-wrap', marginTop: '.5rem' }}>{String(this.state.error?.message || this.state.error)}</pre>
          </details>
        </div>
      );
    }
    return this.props.children;
  }
}

// דף בדיקה — העלאת תעודה גמישה (IdentityFlexPicker) בשלושת הסוגים, בערכת המשרד (בהיר/כהה), בלי לגעת בנתוני אמת.
// נטען רק כש-URL כולל ?test-id-flex. «אישור ושליחה» לא שולח לשום מקום — רק מדפיס את ההרכב.
import { useEffect, useState } from 'react';
import IdentityFlexPicker from './IdentityFlexPicker';
import type { IdDocKind, IdPartsManifest } from './idFlex';

const KINDS: { kind: IdDocKind; title: string }[] = [
  { kind: 'idOrLicense', title: 'תעודת זהות או רישיון (הדף האישי, טופס הייצוג)' },
  { kind: 'driverLicense', title: 'רישיון נהיגה (ערכת עסק חדש)' },
  { kind: 'passport', title: 'דרכון' },
];

export default function TestIdentityFlexPicker() {
  const [theme, setTheme] = useState<'light' | 'dark'>(() => (localStorage.getItem('pivo_theme') === 'dark' ? 'dark' : 'light'));
  const [last, setLast] = useState<string>('');
  useEffect(() => { document.documentElement.dataset.theme = theme; }, [theme]);
  return (
    <div style={{ padding: 20, maxWidth: 640, margin: '0 auto', color: 'var(--ink-1)', background: 'var(--surface-0, var(--bg))', minHeight: '100vh' }}>
      <h1 style={{ fontSize: 18 }}>העלאת תעודה גמישה — בדיקה</h1>
      <button type="button" className="btn btn-sm" data-testid="toggle-theme" onClick={() => setTheme(t => (t === 'dark' ? 'light' : 'dark'))}>
        ערכה: {theme === 'dark' ? 'כהה' : 'בהירה'} — החלפה
      </button>
      {KINDS.map(k => (
        <section key={k.kind} style={{ marginTop: 22 }} data-kind={k.kind}>
          <h2 style={{ fontSize: 15 }}>{k.title}</h2>
          <IdentityFlexPicker kind={k.kind} fileName={`בדיקה - ${k.kind}`}
            onConfirm={async (pdf: File, parts: IdPartsManifest) => { setLast(`${pdf.name} · ${pdf.size} בתים · ${parts.map(p => p.part).join(' · ')}`); return null; }} />
        </section>
      ))}
      {last && <p data-testid="last-confirm" style={{ marginTop: 16, fontSize: 13 }}>אושר (לא נשלח): {last}</p>}
    </div>
  );
}

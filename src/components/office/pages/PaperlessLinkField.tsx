// קישור ההזמנה לפייפרלס — שדה אחד, בשני הקשרים: בשורת «פייפרלס» ב«חיבורים»,
// ובחלון הנוסח של מייל «הזמנה לפייפרלס» (הקישור הוא הכפתור במייל הזה).
// ‼ זה אותו ערך (settings.paperless.inviteUrl) — לא שתי הגדרות.
// ‼ זה קישור שמור, לא חיבור: PIVO לא מחובר לחשבון בפייפרלס ולא יודע מה קורה
// שם. הקישור נושא את מזהה המייצג, ולכן הוא הגדרה של המשרד ולא קבוע בקוד.
import type { FirmProfile } from '../../../types/firmProfile';
import { Field } from '../officeUi';

export function paperlessInviteUrl(p: FirmProfile): string {
  return (((p.settings ?? {}).paperless as { inviteUrl?: string } | undefined)?.inviteUrl ?? '');
}

export function withPaperlessInviteUrl(prev: FirmProfile, v: string): FirmProfile {
  const s = prev.settings ?? {};
  const cur = (s.paperless as Record<string, unknown> | undefined) ?? {};
  return { ...prev, settings: { ...s, paperless: { ...cur, inviteUrl: v } } };
}

export default function PaperlessLinkField({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const trimmed = value.trim();
  const invalid = trimmed !== '' && !trimmed.startsWith('https://');
  return (
    <div className="of-fields is-one" style={{ maxWidth: 520 }}>
      <Field label="קישור ההזמנה שלך בפייפרלס"
        hintTone={invalid ? 'error' : trimmed ? undefined : 'warn'}
        hint={invalid ? 'הקישור חייב להתחיל ב-https://'
          : trimmed ? <a className="of-link" href={trimmed} target="_blank" rel="noopener noreferrer">בדיקה — פתיחה בלשונית חדשה ↗</a>
            : 'בלי קישור, מייל ההזמנה לא יישלח.'}>
        <input value={value} onChange={e => onChange(e.target.value)} dir="ltr" style={{ textAlign: 'left' }}
          inputMode="url" placeholder="https://www.paperless.tax/invite?rid=…" />
      </Field>
    </div>
  );
}

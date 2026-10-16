// ─── שנת האירוע ליד המצב המשפחתי ───────────────────────────────────────────
// שדה אחד לכל עורך שמציג «מצב משפחתי»: נשוי/אה ⇒ שנת הנישואין, גרוש/ה ⇒ שנת הגירושין,
// אלמן/ה ⇒ שנת הפטירה (FAMILY_STATUS_YEAR_LABELS). חובה-רך: אפשר לשמור בלי, אבל
// אז כתוב «ממתי? טרם נרשם» ומה זה עושה לחישוב — לא ריק שקט.
// מי שמשתמש: features/annualReport/CardSectionEditor; לשוניות הלקוח (PersonalContactsTab,
// TaxFileTab) — בסשן שלהן. השמירה: המפתח מ-FAMILY_STATUS_YEAR_KEY, ריק ⇒ undefined (NULL).

import type { FamilyStatus } from '../types';
import { FAMILY_STATUS_YEAR_LABELS } from '../types';
import { FAMILY_STATUS_YEAR_KEY, familyStatusYearProblem } from '../utils/familyStatusYear';

export default function FamilyStatusYearField({ status, value, onChange, birthYear, className = 'form-group' }: {
  status: FamilyStatus;
  value: number | undefined;
  onChange: (year: number | undefined) => void;
  /** לבדיקת סבירות («לפני גיל 14»). */
  birthYear?: number;
  className?: string;
}) {
  if (!FAMILY_STATUS_YEAR_KEY[status]) return null;
  const label = FAMILY_STATUS_YEAR_LABELS[status]!;
  const problem = familyStatusYearProblem(value, { birthYear });
  return (
    <div className={className} data-testid="family-status-year">
      <label>{label}</label>
      <input
        type="number" inputMode="numeric" dir="ltr" min={1930} max={new Date().getFullYear()}
        value={value ?? ''} placeholder="למשל 2019" aria-invalid={!!problem}
        onChange={e => { const n = Number(e.target.value); onChange(e.target.value === '' || !Number.isFinite(n) ? undefined : Math.trunc(n)); }}
      />
      {problem
        ? <small style={{ color: 'var(--red-600, #b42318)' }}>{problem}</small>
        : value == null && <small style={{ color: 'var(--amber-700, #92400e)' }}>ממתי? טרם נרשם — בלי השנה, חישוב לשנים קודמות מסומן «לבדיקה»</small>}
    </div>
  );
}

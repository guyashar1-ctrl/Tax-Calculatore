// ─── פקד עריכה אחד לפי סוג השדה — המנגנון היחיד בתיק המס ─────────────────────
// ‼ נבנה פעם אחת ומשמש את כל הכרטיסים ואת תמונת המס: כרטיס-רשות (גם
// כשהוא מצויר ב«בקשות»), שכירות, שוק ההון, משפחה, זיכויים, נכסים, ביטוחים
// ו"טרם ביררנו" — כולם אותו רכיב, לא עותקים נפרדים שעלולים להתפצל בהתנהגות.
//
// ‼ יישוב מזכה הוא המקרה החריג היחיד: הרשימה דינמית (תלויה בשנה), לא
// הרשימה הסטטית של editModel — ולכן מקבל טיפול נפרד לפי מפתח השדה.

import { getEligibleSettlements } from '../../data/eligibleSettlements';
import { CURRENT_TAX_YEAR } from '../../data/taxData';
import HebrewTextInput from '../../components/ui/HebrewTextInput';
import type { EditField } from './editModel';

export default function EditControl({ def, value, onChange }: {
  def: EditField; value: string; onChange: (v: string) => void;
}) {
  if (def.key === 'qualifyingSettlementId') {
    return (
      <select value={value} onChange={e => onChange(e.target.value)}>
        <option value="">- לא יישוב מוטב -</option>
        {getEligibleSettlements(CURRENT_TAX_YEAR).map(s => (
          <option key={s.name} value={s.name}>{s.name} ({s.ratePercent}%)</option>
        ))}
      </select>
    );
  }
  if (def.kind === 'bool') {
    return (
      <select value={value} onChange={e => onChange(e.target.value)}>
        <option value="">טרם ביררנו</option>
        <option value="true">כן</option>
        <option value="false">לא</option>
      </select>
    );
  }
  if (def.options) {
    return (
      <select value={value} onChange={e => onChange(e.target.value)}>
        <option value="">טרם ביררנו</option>
        {def.options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
      </select>
    );
  }
  if (def.hebrew) {
    return <HebrewTextInput value={value} placeholder="—" onChange={e => onChange(e.target.value)} />;
  }
  return (
    <input type={def.kind === 'date' ? 'date' : 'text'}
      inputMode={def.kind === 'number' || def.kind === 'money' ? 'numeric' : undefined}
      value={value} placeholder="—"
      onChange={e => onChange(e.target.value)} />
  );
}

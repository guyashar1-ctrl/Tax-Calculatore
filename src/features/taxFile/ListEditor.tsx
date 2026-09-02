// ─── עורך רשימה בתוך שורת תיק מס ────────────────────────────────────────────
//
// ‼ אותה שפה ויזואלית של עורך העיסוקים שכבר יושב בכרטיס ב״ל: שורות מופרדות
// בקו שיער, רשת שני טורים, «הסר» טקסטואלי ו«+ הוסף» מקווקו. במכוון לא נבנתה
// כאן צורה שנייה — פריסת העורך הישן (מקטעים צבעוניים, טפסים גדולים) אינה
// נכנסת לתיק המס.
//
// ‼ הרכיב לא שומר כלום ולא יודע על הלקוח: הוא מקבל טיוטה ומחזיר טיוטה.
// השמירה — דרך מסלול העובדות המנוהלות — נשארת ב-TaxFileTab.

import type { ListField, ListItem, ListSpec } from './listModel';
import { listFieldValue, coerceListField } from './listModel';

function Control({ f, item, onChange }: {
  f: ListField; item: ListItem; onChange: (v: unknown) => void;
}) {
  const value = listFieldValue(item, f);
  if (f.kind === 'bool') {
    return (
      <select className="inp" value={value} onChange={e => onChange(coerceListField(f, e.target.value))}>
        <option value="">טרם ביררנו</option>
        <option value="true">כן</option>
        <option value="false">לא</option>
      </select>
    );
  }
  if (f.kind === 'select') {
    return (
      <select className="inp" value={value} onChange={e => onChange(coerceListField(f, e.target.value))}>
        <option value="">טרם ביררנו</option>
        {(f.options ?? []).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
      </select>
    );
  }
  return (
    <input className="inp"
      type={f.kind === 'date' ? 'date' : 'text'}
      inputMode={f.kind === 'number' || f.kind === 'money' ? 'numeric' : undefined}
      value={value} placeholder="—"
      onChange={e => onChange(coerceListField(f, e.target.value))} />
  );
}

export default function ListEditor({ spec, items, onChange }: {
  spec: ListSpec; items: ListItem[]; onChange: (next: ListItem[]) => void;
}) {
  function update(id: string, key: string, value: unknown) {
    onChange(items.map(i => (i.id === id ? { ...i, [key]: value } : i)));
  }
  function remove(id: string) {
    onChange(items.filter(i => i.id !== id));
  }
  function add() {
    onChange([...items, spec.newItem(items.length)]);
  }
  return (
    <div className="txf-list-edit">
      {items.map((item, idx) => (
        <div key={item.id} className="ial-occ">
          <div className="ial-occ-head">
            <span className="ial-occ-nm">{spec.itemLabel} {idx + 1}</span>
            <button type="button" className="ial-occ-remove" onClick={() => remove(item.id)}>הסר</button>
          </div>
          <div className="ial-fgrid">
            {spec.fields.filter(f => !f.when || f.when(item)).map(f => (
              <div key={f.key}>
                <label>{f.label}</label>
                <Control f={f} item={item} onChange={v => update(item.id, f.key, v)} />
              </div>
            ))}
          </div>
        </div>
      ))}
      <button type="button" className="ial-add-occ" onClick={add}>+ הוסף {spec.itemLabel}</button>
    </div>
  );
}

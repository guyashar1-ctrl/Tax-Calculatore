import type { BusinessInfo } from '../../types';

type NumericField =
  | 'revenueAnnual'
  | 'cogs'
  | 'operatingExpenses'
  | 'depreciation'
  | 'netIncome'
  | 'clientWithholdingTax857'
  | 'selfPensionContribution'
  | 'selfStudyFundContribution';

interface FieldDef {
  key: NumericField;
  label: string;
  hint?: string;
  field1301?: string;
}

const PNL: FieldDef[] = [
  { key: 'revenueAnnual',      label: 'מחזור שנתי',         hint: 'יעדכן 150 או 170 לפי "שייך לבן/בת זוג"' },
  { key: 'cogs',               label: 'עלות המכר',          hint: 'לחישוב פנימי, לא נכנס ישירות ל-1301' },
  { key: 'operatingExpenses',  label: 'הוצאות תפעוליות',    hint: 'לחישוב פנימי' },
  { key: 'depreciation',       label: 'פחת',                hint: 'לחישוב פנימי' },
  { key: 'netIncome',          label: 'רווח/הפסד נטו',      hint: 'בסיס חישוב המס; ערכים שליליים = הפסד' },
];

const TAX_PAYMENTS: FieldDef[] = [
  { key: 'clientWithholdingTax857',   label: 'ניכוי במקור מלקוחות (857)', field1301: '040' },
  { key: 'selfPensionContribution',   label: 'הפקדה לפנסיה (עצמאי)',       field1301: '268' },
  { key: 'selfStudyFundContribution', label: 'הפקדה לקרן השתלמות',          field1301: '249' },
];

function NumberField({
  def, value, onChange, allowNegative,
}: {
  def: FieldDef;
  value: number | undefined;
  onChange: (v: number | undefined) => void;
  allowNegative?: boolean;
}) {
  return (
    <div className="form-group">
      <label>
        {def.label}
        {def.field1301 && <span style={{ color: 'var(--gray-500)', fontSize: '.8em', marginInlineStart: 4 }}>(שדה {def.field1301})</span>}
      </label>
      <input
        type="number"
        min={allowNegative ? undefined : 0}
        step={1}
        value={value ?? ''}
        onChange={ev => {
          const raw = ev.target.value;
          onChange(raw === '' ? undefined : Number(raw));
        }}
        placeholder="0"
        dir="ltr"
      />
      {def.hint && <small style={{ color: 'var(--gray-500)', fontSize: '.75em' }}>{def.hint}</small>}
    </div>
  );
}

function FieldGroup({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ fontSize: '.8rem', fontWeight: 600, color: 'var(--gray-700)', marginBottom: 4 }}>{title}</div>
      <div className="form-grid form-grid-4">{children}</div>
    </div>
  );
}

export default function Business1320Details({
  business,
  onUpdate,
}: {
  business: BusinessInfo;
  onUpdate: <K extends keyof BusinessInfo>(field: K, value: BusinessInfo[K]) => void;
}) {
  const filled = [...PNL, ...TAX_PAYMENTS].filter(d => typeof business[d.key] === 'number').length;
  const total = PNL.length + TAX_PAYMENTS.length;
  const summary = filled > 0
    ? `פרטי נספח א' (1320) — ${filled}/${total} שדות מולאו`
    : 'פרטי נספח א\' (1320) — סכומי השנה (לחץ למילוי)';

  return (
    <details className="cw-collapse-details" style={{ marginTop: 12, borderTop: '1px solid var(--gray-200)', paddingTop: 12 }}>
      <summary
        style={{
          cursor: 'pointer',
          fontWeight: 600,
          color: filled > 0 ? '#ca8a04' : 'var(--gray-700)',
          padding: '4px 0',
          userSelect: 'none',
        }}
      >
        📄 {summary}
      </summary>

      <div style={{ marginTop: 12 }}>
        <div style={{ fontSize: '.85rem', color: 'var(--gray-600)', marginBottom: 8 }}>
          סכומים שנתיים מנספח א' / דוח רווח-הפסד של העסק. הסכומים מסוכמים אוטומטית לדוח השנתי 1301.
        </div>

        <div style={{ marginBottom: 12, padding: 8, background: '#fef3c7', borderRadius: 6 }}>
          <label className="checkbox-row" style={{ margin: 0, fontWeight: 500 }}>
            <input
              type="checkbox"
              checked={business.belongsToSpouse ?? false}
              onChange={ev => onUpdate('belongsToSpouse', ev.target.checked)}
            />
            העסק שייך לבן/בת הזוג הרשום (יקבע 170 במקום 150 ב-1301)
          </label>
        </div>

        <FieldGroup title="רווח והפסד">
          {PNL.map(d => (
            <NumberField
              key={d.key}
              def={d}
              value={business[d.key]}
              onChange={v => onUpdate(d.key, v)}
              allowNegative={d.key === 'netIncome'}
            />
          ))}
        </FieldGroup>

        <FieldGroup title="תשלומים שיש לקזז">
          {TAX_PAYMENTS.map(d => (
            <NumberField key={d.key} def={d} value={business[d.key]} onChange={v => onUpdate(d.key, v)} />
          ))}
        </FieldGroup>
      </div>
    </details>
  );
}

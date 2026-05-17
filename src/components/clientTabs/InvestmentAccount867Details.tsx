import type { InvestmentAccount } from '../../types';

type NumericField =
  | 'interestIncome'
  | 'dividendIncome'
  | 'capitalGainsRealized'
  | 'capitalLosses'
  | 'taxWithheldOnInterest'
  | 'taxWithheldOnDividends'
  | 'taxWithheldOnCapitalGains';

interface FieldDef {
  key: NumericField;
  label: string;
  field1301?: string;
}

const INCOME: FieldDef[] = [
  { key: 'interestIncome',       label: 'ריבית (ני"ע ופיקדונות)', field1301: '142' },
  { key: 'dividendIncome',       label: 'דיבידנדים',                field1301: '142' },
  { key: 'capitalGainsRealized', label: 'רווחי הון ממומשים',         field1301: '054' },
  { key: 'capitalLosses',        label: 'הפסדי הון',                 field1301: '053' },
];

const WITHHOLDING: FieldDef[] = [
  { key: 'taxWithheldOnInterest',     label: 'ניכוי מס על ריבית',       field1301: '040' },
  { key: 'taxWithheldOnDividends',    label: 'ניכוי מס על דיבידנד',     field1301: '040' },
  { key: 'taxWithheldOnCapitalGains', label: 'ניכוי מס על רווחי הון',   field1301: '040' },
];

function NumberField({
  def, value, onChange,
}: {
  def: FieldDef;
  value: number | undefined;
  onChange: (v: number | undefined) => void;
}) {
  return (
    <div className="form-group">
      <label>
        {def.label}
        {def.field1301 && <span style={{ color: 'var(--gray-500)', fontSize: '.8em', marginInlineStart: 4 }}>(שדה {def.field1301})</span>}
      </label>
      <input
        type="number"
        step={1}
        value={value ?? ''}
        onChange={ev => {
          const raw = ev.target.value;
          onChange(raw === '' ? undefined : Number(raw));
        }}
        placeholder="0"
        dir="ltr"
      />
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

export default function InvestmentAccount867Details({
  account,
  onUpdate,
}: {
  account: InvestmentAccount;
  onUpdate: (field: NumericField, value: number | undefined) => void;
}) {
  const filled = [...INCOME, ...WITHHOLDING].filter(d => typeof account[d.key] === 'number').length;
  const total = INCOME.length + WITHHOLDING.length;
  const summary = filled > 0
    ? `פרטי 867 — ${filled}/${total} שדות מולאו`
    : 'פרטי 867 — סכומי השנה (לחץ למילוי)';

  return (
    <details className="cw-collapse-details" style={{ marginTop: 12, borderTop: '1px solid var(--gray-200)', paddingTop: 12 }}>
      <summary
        style={{
          cursor: 'pointer',
          fontWeight: 600,
          color: filled > 0 ? '#059669' : 'var(--gray-700)',
          padding: '4px 0',
          userSelect: 'none',
        }}
      >
        📄 {summary}
      </summary>

      <div style={{ marginTop: 12 }}>
        <div style={{ fontSize: '.85rem', color: 'var(--gray-600)', marginBottom: 8 }}>
          סכומים שנתיים מטופס 867 של בית ההשקעות / הבנק. סכומים שליליים בהפסדי הון מותרים.
        </div>

        <FieldGroup title="הכנסות מהשקעות">
          {INCOME.map(d => (
            <NumberField key={d.key} def={d} value={account[d.key]} onChange={v => onUpdate(d.key, v)} />
          ))}
        </FieldGroup>

        <FieldGroup title="ניכוי מס במקור (לקיזוז ב-1301)">
          {WITHHOLDING.map(d => (
            <NumberField key={d.key} def={d} value={account[d.key]} onChange={v => onUpdate(d.key, v)} />
          ))}
        </FieldGroup>
      </div>
    </details>
  );
}

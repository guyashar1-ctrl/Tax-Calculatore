import type { EmployerInfo } from '../../types';

type NumericField =
  | 'grossSalaryAnnual'
  | 'mandatoryTaxWithheld'
  | 'niEmployeeWithheld'
  | 'healthEmployeeWithheld'
  | 'pensionEmployerContribution'
  | 'pensionEmployeeContribution'
  | 'studyFundEmployerContribution'
  | 'studyFundEmployeeContribution'
  | 'optionsValueGranted102'
  | 'severancePayReceived';

interface FieldDef {
  key: NumericField;
  label: string;
  hint?: string;
  field1301?: string;
}

const PRIMARY: FieldDef[] = [
  { key: 'grossSalaryAnnual',      label: 'סך ברוטו שנתי',         field1301: '158' },
  { key: 'mandatoryTaxWithheld',   label: 'מס הכנסה שנוכה',        field1301: '042' },
  { key: 'niEmployeeWithheld',     label: 'ב"ל שנוכה (חלק עובד)',  field1301: '044' },
  { key: 'healthEmployeeWithheld', label: 'מס בריאות שנוכה',       field1301: '089' },
];

const PENSION: FieldDef[] = [
  { key: 'pensionEmployerContribution', label: 'הפקדת מעביד לפנסיה',  hint: 'לתיעוד; לא נכנס ל-1301' },
  { key: 'pensionEmployeeContribution', label: 'הפקדת עובד לפנסיה',  field1301: '245' },
];

const STUDY: FieldDef[] = [
  { key: 'studyFundEmployerContribution', label: 'הפקדת מעביד להשתלמות', hint: 'לתיעוד; לא נכנס ל-1301' },
  { key: 'studyFundEmployeeContribution', label: 'הפקדת עובד להשתלמות',  field1301: '249' },
];

const SPECIAL: FieldDef[] = [
  { key: 'optionsValueGranted102', label: 'שווי אופציות 102 שמומשו', field1301: '282' },
  { key: 'severancePayReceived',   label: 'פיצויי פיטורין שהתקבלו', field1301: '086' },
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
        min={0}
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

export default function Employer106Details({
  employer,
  onUpdate,
}: {
  employer: EmployerInfo;
  onUpdate: (field: NumericField, value: number | undefined) => void;
}) {
  const filled = (
    [...PRIMARY, ...PENSION, ...STUDY, ...SPECIAL]
      .filter(d => typeof employer[d.key] === 'number')
      .length
  );
  const total = PRIMARY.length + PENSION.length + STUDY.length + SPECIAL.length;
  const summary = filled > 0
    ? `פרטי 106 — ${filled}/${total} שדות מולאו`
    : 'פרטי 106 — סכומי השנה (לחץ למילוי)';

  return (
    <details className="cw-collapse-details" style={{ marginTop: 12, borderTop: '1px solid var(--gray-200)', paddingTop: 12 }}>
      <summary
        style={{
          cursor: 'pointer',
          fontWeight: 600,
          color: filled > 0 ? '#0284c7' : 'var(--gray-700)',
          padding: '4px 0',
          userSelect: 'none',
        }}
      >
        📄 {summary}
      </summary>

      <div style={{ marginTop: 12 }}>
        <div style={{ fontSize: '.85rem', color: 'var(--gray-600)', marginBottom: 8 }}>
          סכומים שנתיים מטופס 106 של המעביד. הסכומים מסוכמים אוטומטית לדוח השנתי 1301.
        </div>

        <FieldGroup title="הכנסה וניכויים בסיסיים">
          {PRIMARY.map(d => (
            <NumberField key={d.key} def={d} value={employer[d.key]} onChange={v => onUpdate(d.key, v)} />
          ))}
        </FieldGroup>

        <FieldGroup title="הפקדות פנסיה">
          {PENSION.map(d => (
            <NumberField key={d.key} def={d} value={employer[d.key]} onChange={v => onUpdate(d.key, v)} />
          ))}
        </FieldGroup>

        <FieldGroup title="הפקדות קרן השתלמות">
          {STUDY.map(d => (
            <NumberField key={d.key} def={d} value={employer[d.key]} onChange={v => onUpdate(d.key, v)} />
          ))}
        </FieldGroup>

        <FieldGroup title="מיוחד">
          {SPECIAL.map(d => (
            <NumberField key={d.key} def={d} value={employer[d.key]} onChange={v => onUpdate(d.key, v)} />
          ))}
        </FieldGroup>
      </div>
    </details>
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

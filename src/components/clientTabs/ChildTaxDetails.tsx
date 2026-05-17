import type { Child, ChildCustody } from '../../types';
import { CHILD_CUSTODY_LABELS } from '../../types';

export default function ChildTaxDetails({
  child,
  onUpdate,
}: {
  child: Child;
  onUpdate: <K extends keyof Child>(field: K, value: Child[K]) => void;
}) {
  const filled = (
    (child.lastName ? 1 : 0)
    + (child.idNumber ? 1 : 0)
    + (child.custody ? 1 : 0)
    + (typeof child.livesWithTaxpayer === 'boolean' ? 1 : 0)
    + (typeof child.monthlyAlimonyReceived === 'number' ? 1 : 0)
    + (typeof child.monthlyAlimonyPaid === 'number' ? 1 : 0)
    + (typeof child.educationCostsAnnual === 'number' ? 1 : 0)
  );
  const summary = filled > 0
    ? `פרטי מס לילד — ${filled}/7 שדות מולאו`
    : 'פרטי מס לילד (משמורת, מזונות, לימוד) — לחץ למילוי';

  return (
    <details className="cw-collapse-details" style={{ marginTop: 8, flexBasis: '100%', width: '100%', borderTop: '1px solid var(--gray-200)', paddingTop: 8 }}>
      <summary
        style={{
          cursor: 'pointer',
          fontWeight: 600,
          color: filled > 0 ? '#ec4899' : 'var(--gray-700)',
          padding: '4px 0',
          fontSize: '.85rem',
          userSelect: 'none',
        }}
      >
        📄 {summary}
      </summary>

      <div style={{ marginTop: 8 }}>
        <div style={{ marginBottom: 8, padding: 6, background: '#fef3c7', borderRadius: 6, fontSize: '.8rem', color: 'var(--gray-700)' }}>
          השדות האלו משפיעים על נקודות זיכוי לפי גיל הילד, זיכוי הורה יחיד (שדה 029), וזיכוי הוצאות לימוד (סעיף 45א).
        </div>

        <div className="form-grid form-grid-4">
          <div className="form-group">
            <label>שם משפחה (אם שונה)</label>
            <input
              type="text"
              value={child.lastName ?? ''}
              onChange={ev => onUpdate('lastName', ev.target.value || undefined)}
              placeholder="לרוב כמו ההורה"
            />
          </div>

          <div className="form-group">
            <label>ת.ז. של הילד</label>
            <input
              type="text"
              value={child.idNumber ?? ''}
              onChange={ev => onUpdate('idNumber', ev.target.value || undefined)}
              placeholder="9 ספרות"
              dir="ltr"
              maxLength={9}
            />
          </div>

          <div className="form-group">
            <label>משמורת</label>
            <select
              value={child.custody ?? ''}
              onChange={ev => onUpdate('custody', (ev.target.value || undefined) as ChildCustody | undefined)}
            >
              <option value="">—</option>
              {(Object.entries(CHILD_CUSTODY_LABELS) as [ChildCustody, string][]).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </select>
          </div>

          <div className="form-group">
            <label className="checkbox-row" style={{ marginTop: '1.4rem' }}>
              <input
                type="checkbox"
                checked={child.livesWithTaxpayer ?? false}
                onChange={ev => onUpdate('livesWithTaxpayer', ev.target.checked)}
              />
              מתגורר אצל הנישום
            </label>
          </div>

          <div className="form-group">
            <label>דמי מזונות שמתקבלים (חודשי)</label>
            <input
              type="number"
              min={0}
              step={1}
              value={child.monthlyAlimonyReceived ?? ''}
              onChange={ev => {
                const raw = ev.target.value;
                onUpdate('monthlyAlimonyReceived', raw === '' ? undefined : Number(raw));
              }}
              placeholder="0"
              dir="ltr"
            />
          </div>

          <div className="form-group">
            <label>דמי מזונות שמשולמים (חודשי)</label>
            <input
              type="number"
              min={0}
              step={1}
              value={child.monthlyAlimonyPaid ?? ''}
              onChange={ev => {
                const raw = ev.target.value;
                onUpdate('monthlyAlimonyPaid', raw === '' ? undefined : Number(raw));
              }}
              placeholder="0"
              dir="ltr"
            />
          </div>

          <div className="form-group">
            <label>הוצאות לימוד שנתיות (סעיף 45א)</label>
            <input
              type="number"
              min={0}
              step={1}
              value={child.educationCostsAnnual ?? ''}
              onChange={ev => {
                const raw = ev.target.value;
                onUpdate('educationCostsAnnual', raw === '' ? undefined : Number(raw));
              }}
              placeholder="0"
              dir="ltr"
            />
          </div>
        </div>
      </div>
    </details>
  );
}

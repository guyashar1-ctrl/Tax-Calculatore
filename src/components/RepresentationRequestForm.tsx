import { useState } from 'react';
import {
  RepresentationRequest,
  AuthorityKind,
  DEFAULT_REQUESTED_DOCS,
  DOC_CATALOG,
  AUTHORITY_LABELS,
} from '../types';

interface Props {
  request: RepresentationRequest | null; // null = new
  onSave: (req: RepresentationRequest) => void;
  onCancel: () => void;
  onOpenFill: (id: string) => void;
}

function newRequest(): RepresentationRequest {
  return {
    id: '',
    linkedClientId: '',
    clientName: '',
    clientEmail: '',
    authorities: ['incomeTax'],
    requestedDocs: DEFAULT_REQUESTED_DOCS.map(d => ({ ...d })),
    notes: '',
    status: 'pending_fill',
    createdAt: '',
    updatedAt: '',
    submission: null,
    submittedAt: null,
    partB: null,
    signedPdfStoredId: null,
    ocrExtracted: null,
  };
}

export default function RepresentationRequestForm({ request, onSave, onCancel, onOpenFill }: Props) {
  const [data, setData] = useState<RepresentationRequest>(request ?? newRequest());
  const [customLabel, setCustomLabel] = useState('');
  const [errors, setErrors] = useState<string[]>([]);
  const isNew = !request;

  const upd = <K extends keyof RepresentationRequest>(key: K, val: RepresentationRequest[K]) =>
    setData(d => ({ ...d, [key]: val }));

  function toggleAuthority(a: AuthorityKind) {
    setData(d => ({
      ...d,
      authorities: d.authorities.includes(a)
        ? d.authorities.filter(x => x !== a)
        : [...d.authorities, a],
    }));
  }

  function addCatalogDoc(catId: string, label: string) {
    if (data.requestedDocs.some(d => d.id === catId)) return;
    setData(d => ({
      ...d,
      requestedDocs: [...d.requestedDocs, { id: catId, label, required: false, isDefault: false }],
    }));
  }

  function addCustomDoc() {
    const label = customLabel.trim();
    if (!label) return;
    setData(d => ({
      ...d,
      requestedDocs: [
        ...d.requestedDocs,
        { id: `custom-${crypto.randomUUID().slice(0, 8)}`, label, required: false, isDefault: false },
      ],
    }));
    setCustomLabel('');
  }

  function removeDoc(id: string) {
    setData(d => ({ ...d, requestedDocs: d.requestedDocs.filter(x => x.id !== id) }));
  }

  function toggleRequired(id: string) {
    setData(d => ({
      ...d,
      requestedDocs: d.requestedDocs.map(x => (x.id === id ? { ...x, required: !x.required } : x)),
    }));
  }

  function validate(): string[] {
    const e: string[] = [];
    if (!data.clientEmail.trim()) e.push('יש להזין מייל לקוח');
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.clientEmail.trim())) e.push('מייל לא תקין');
    if (data.authorities.length === 0) e.push('יש לבחור לפחות רשות אחת');
    if (data.requestedDocs.length === 0) e.push('יש לכלול לפחות מסמך אחד נדרש');
    return e;
  }

  function handleSave() {
    const e = validate();
    if (e.length) {
      setErrors(e);
      return;
    }
    setErrors([]);
    const now = new Date().toISOString();
    const saved: RepresentationRequest = {
      ...data,
      id: data.id || crypto.randomUUID(),
      createdAt: data.createdAt || now,
      updatedAt: now,
    };
    onSave(saved);
  }

  function handleSaveAndOpen() {
    const e = validate();
    if (e.length) {
      setErrors(e);
      return;
    }
    setErrors([]);
    const now = new Date().toISOString();
    const saved: RepresentationRequest = {
      ...data,
      id: data.id || crypto.randomUUID(),
      createdAt: data.createdAt || now,
      updatedAt: now,
    };
    onSave(saved);
    onOpenFill(saved.id);
  }

  // הקטלוג ללא הפריטים שכבר הוספו
  const catalogAvailable = DOC_CATALOG.filter(c => !data.requestedDocs.some(d => d.id === c.id));

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '.75rem' }}>
        <div>
          <h1 style={{ fontSize: '1.4rem', fontWeight: 700, color: 'var(--gray-900)' }}>
            {isNew ? '📨 בקשת ייצוג חדשה' : '✏️ עריכת בקשת ייצוג'}
          </h1>
          <p style={{ fontSize: '.875rem', color: 'var(--gray-500)', marginTop: 2 }}>
            הגדר אילו פרטים, מסמכים וייפויי כוח אתה רוצה לקבל מהלקוח
          </p>
        </div>
        <div style={{ display: 'flex', gap: '.5rem' }}>
          <button className="btn btn-secondary" onClick={onCancel}>ביטול</button>
          <button className="btn btn-primary" onClick={handleSave}>💾 שמור</button>
        </div>
      </div>

      {errors.length > 0 && (
        <div className="card" style={{ marginBottom: '1rem', borderColor: 'var(--red)', background: 'var(--red-light)' }}>
          <div className="card-body" style={{ color: 'var(--red)' }}>
            {errors.map((e, i) => <div key={i}>• {e}</div>)}
          </div>
        </div>
      )}

      {/* פרטי לקוח לבקשה */}
      <div className="card" style={{ marginBottom: '1rem' }}>
        <div className="card-header"><div className="card-title">👤 פרטי הלקוח להפניה</div></div>
        <div className="card-body">
          <div className="form-grid form-grid-2">
            <div className="form-group">
              <label>שם הלקוח (אופציונלי)</label>
              <input
                type="text"
                value={data.clientName}
                onChange={e => upd('clientName', e.target.value)}
                placeholder="שם פרטי ושם משפחה"
              />
            </div>
            <div className="form-group">
              <label>מייל הלקוח <span style={{ color: 'var(--red)' }}>*</span></label>
              <input
                type="email"
                value={data.clientEmail}
                onChange={e => upd('clientEmail', e.target.value)}
                placeholder="client@example.com"
                dir="ltr"
              />
            </div>
          </div>
        </div>
      </div>

      {/* רשויות שמולן מבקשים ייצוג */}
      <div className="card" style={{ marginBottom: '1rem' }}>
        <div className="card-header"><div className="card-title">⚖️ רשויות מס לייצוג (השעמ — ייצוג ראשי)</div></div>
        <div className="card-body">
          <div className="form-group">
            <label>סמן את הרשויות שמולן מבקשים ייצוג <span style={{ color: 'var(--red)' }}>*</span></label>
            <div style={{ display: 'flex', gap: '.5rem', flexWrap: 'wrap' }}>
              {(['incomeTax', 'vat', 'withholding'] as AuthorityKind[]).map(a => {
                const active = data.authorities.includes(a);
                return (
                  <button
                    key={a}
                    type="button"
                    onClick={() => toggleAuthority(a)}
                    className={`btn ${active ? 'btn-primary' : 'btn-secondary'}`}
                  >
                    {active ? '✓ ' : ''}{AUTHORITY_LABELS[a]}
                  </button>
                );
              })}
            </div>
            <small style={{ color: 'var(--gray-500)', marginTop: 6, display: 'block' }}>
              💡 טופס 2279א'5 הוא לייצוג ראשי במערכת השעמ ומכסה רק רשויות אלה.
              ייצוג בביטוח לאומי דורש טופס נפרד ולא נכלל כאן.
            </small>
          </div>
        </div>
      </div>

      {/* מסמכים נדרשים */}
      <div className="card" style={{ marginBottom: '1rem' }}>
        <div className="card-header">
          <div className="card-title">📎 מסמכים נדרשים מהלקוח</div>
        </div>
        <div className="card-body">
          {data.requestedDocs.length === 0 ? (
            <div style={{ color: 'var(--gray-500)', fontSize: '.875rem' }}>אין מסמכים. הוסף מהקטלוג למטה.</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '.5rem' }}>
              {data.requestedDocs.map(doc => (
                <div
                  key={doc.id}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '.75rem',
                    padding: '.6rem .8rem',
                    border: '1px solid var(--gray-200)',
                    borderRadius: 'var(--radius)',
                    background: doc.isDefault ? 'var(--gray-50)' : 'white',
                  }}
                >
                  <span style={{ fontSize: '1.1rem' }}>📄</span>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: '.9rem', fontWeight: 500 }}>{doc.label}</div>
                    {doc.isDefault && (
                      <div style={{ fontSize: '.7rem', color: 'var(--gray-500)' }}>ברירת מחדל</div>
                    )}
                  </div>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '.3rem', fontSize: '.8rem', color: 'var(--gray-600)', cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={doc.required}
                      onChange={() => toggleRequired(doc.id)}
                    />
                    חובה
                  </label>
                  {!doc.isDefault && (
                    <button
                      type="button"
                      className="btn btn-ghost btn-icon"
                      onClick={() => removeDoc(doc.id)}
                      title="הסר"
                      style={{ color: 'var(--red)' }}
                    >🗑️</button>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* הוספה מקטלוג */}
          {catalogAvailable.length > 0 && (
            <div style={{ marginTop: '1rem' }}>
              <div style={{ fontSize: '.8rem', color: 'var(--gray-600)', marginBottom: '.4rem', fontWeight: 600 }}>
                הוסף מהקטלוג:
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '.4rem' }}>
                {catalogAvailable.map(c => (
                  <button
                    key={c.id}
                    type="button"
                    className="btn btn-secondary btn-sm"
                    onClick={() => addCatalogDoc(c.id, c.label)}
                  >
                    + {c.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* הוספה מותאמת אישית */}
          <div style={{ marginTop: '1rem' }}>
            <div style={{ fontSize: '.8rem', color: 'var(--gray-600)', marginBottom: '.4rem', fontWeight: 600 }}>
              או הוסף מסמך מותאם אישית:
            </div>
            <div style={{ display: 'flex', gap: '.5rem' }}>
              <input
                type="text"
                value={customLabel}
                onChange={e => setCustomLabel(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addCustomDoc(); } }}
                placeholder="לדוגמה: אישור הכנסות שכר דירה"
                style={{ flex: 1 }}
              />
              <button type="button" className="btn btn-secondary" onClick={addCustomDoc}>+ הוסף</button>
            </div>
          </div>
        </div>
      </div>

      {/* הערות */}
      <div className="card" style={{ marginBottom: '1rem' }}>
        <div className="card-header"><div className="card-title">📝 הערות ללקוח (אופציונלי)</div></div>
        <div className="card-body">
          <textarea
            rows={3}
            value={data.notes}
            onChange={e => upd('notes', e.target.value)}
            placeholder="הוסף הסבר או הוראות שיופיעו ללקוח בטופס המילוי..."
            style={{ width: '100%', resize: 'vertical' }}
          />
        </div>
      </div>

      {/* פעולות */}
      <div className="card" style={{ background: 'var(--blue-light)', borderColor: 'var(--blue)' }}>
        <div className="card-body">
          <div style={{ display: 'flex', alignItems: 'center', gap: '.6rem', marginBottom: '.6rem' }}>
            <span style={{ fontSize: '1.2rem' }}>💡</span>
            <strong style={{ color: 'var(--blue-dark)' }}>הדגמה מקומית</strong>
          </div>
          <div style={{ fontSize: '.85rem', color: 'var(--gray-700)', marginBottom: '.75rem' }}>
            במצב הדגמה — השמירה תיצור בקשה במערכת ותוכל לפתוח את טופס המילוי באופן מקומי כדי לראות מה הלקוח יראה.
            כשתחבר backend בעתיד, השליחה תתבצע במייל.
          </div>
          <div style={{ display: 'flex', gap: '.5rem', flexWrap: 'wrap' }}>
            <button className="btn btn-primary btn-lg" onClick={handleSaveAndOpen}>
              💾 שמור ופתח טופס מילוי
            </button>
            <button className="btn btn-secondary" onClick={handleSave}>
              שמור בלבד
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

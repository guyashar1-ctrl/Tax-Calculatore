// מצבים של בקשת מערכת בקליטה («מסמכים מהלקוח», «פרטי הרו״ח הקודם») — מה הלקוח
// מקבל לפי עובדה. הועבר מ-RequestDefaultsSection כמעט כמו שהוא.
//
// ‼ אותה סמנטיקה כמו journey_default_variant בשרת: ההתאמה הראשונה לפי הסדר,
// והנופל־אחורה (fact: null) תמיד אחרון ואינו נמחק.
// ‼ (4.10.2026) פריט בלי רשימה משלו (system: {}) — המחולל נופל לרשימות הקבועות לפי מצב
// הלקוח (generate_onboarding_steps), ולא «הלקוח לא יקבל כלום». העורך מציג אותן כמו
// שהן (BUILT_IN_VARIANTS), ועריכה מתחילה מהן.
import { useState } from 'react';
import type { DefaultItem, DefaultVariant, FactKey } from '../../../types/journeyDefaults';
import { FACTS, factWhen, metaFor, variantLabel } from '../../../types/journeyDefaults';
import { BUILT_IN_VARIANTS } from '../../../features/flows/compile';

const variantsOf = (stepType: string, vs: DefaultVariant[] | undefined): DefaultVariant[] =>
  vs?.length ? vs : (BUILT_IN_VARIANTS[stepType] ?? [{ key: 'default', fact: null, items: [] }]);

export default function VariantsEditor({ stepType, value, onChange }: {
  stepType: string;
  value: DefaultVariant[] | undefined;
  onChange: (next: DefaultVariant[]) => void;
}) {
  const vs = variantsOf(stepType, value);
  const [sel, setSel] = useState(0);
  const [adding, setAdding] = useState(false);
  const [newLabel, setNewLabel] = useState('');
  const i = Math.min(sel, vs.length - 1);
  const v = vs[i];
  const derivedCopy = !!metaFor(stepType).derivedCopy;

  function setVariant(idx: number, fn: (x: DefaultVariant) => DefaultVariant) {
    onChange(vs.map((x, j) => (j === idx ? fn(x) : x)));
  }
  function addVariant(fact: FactKey) {
    const base = vs[vs.length - 1];
    const next = [...vs];
    next.splice(next.length - 1, 0, {
      key: fact, fact,
      items: base.items ? [...base.items] : [],
      copy: base.copy ? { ...base.copy } : undefined,
    });
    onChange(next);
    setSel(next.length - 2);
    setAdding(false);
  }
  function dropVariant(idx: number) {
    if (vs[idx]?.fact === null) return;
    onChange(vs.filter((_, j) => j !== idx));
    setSel(0);
  }
  function moveVariant(idx: number, delta: number) {
    const j = idx + delta;
    if (j < 0 || j >= vs.length - 1 || vs[idx].fact === null) return;
    const next = [...vs];
    [next[idx], next[j]] = [next[j], next[idx]];
    onChange(next);
    setSel(j);
  }
  const items: DefaultItem[] = v.items ?? [];
  const setItems = (fn: (xs: DefaultItem[]) => DefaultItem[]) => setVariant(i, x => ({ ...x, items: fn(x.items ?? []) }));

  return (
    <div className="fl-var">
      <div className="fl-chiprow" role="group" aria-label="לפי מצב הלקוח">
        {vs.map((x, j) => (
          <button key={x.key} type="button" className={`fl-toggle is-sm${j === i ? ' is-on' : ''}`} aria-pressed={j === i}
            onClick={() => setSel(j)}>{variantLabel(x.key, x.fact)}</button>
        ))}
        <button type="button" className="fl-link" onClick={() => setAdding(a => !a)} aria-expanded={adding}>＋ מצב</button>
      </div>
      {adding && (
        <ul className="fl-pick is-compact" aria-label="מצב נוסף">
          {FACTS.map(f => {
            const used = vs.some(x => x.fact === f.key);
            return (
              <li key={f.key}>
                <button type="button" className="fl-pick-row" disabled={used} onClick={() => addVariant(f.key)}>
                  <span>{f.label}</span><small>{used ? 'כבר מוגדר' : f.when}</small>
                </button>
              </li>
            );
          })}
        </ul>
      )}
      <div className="fl-hint">
        <b>{variantLabel(v.key, v.fact)}</b> — {v.fact === null ? 'כל השאר' : `${factWhen(v.fact)} · נבדק לפני ברירת המחדל`}
        {v.fact !== null && (
          <span className="fl-var-acts">
            <button type="button" className="fl-link" onClick={() => moveVariant(i, -1)}>הקדם</button>
            <button type="button" className="fl-link" onClick={() => moveVariant(i, 1)}>אחר</button>
            <button type="button" className="fl-link is-danger" onClick={() => dropVariant(i)}>הסר מצב</button>
          </span>
        )}
      </div>

      {!derivedCopy && v.copy && (
        <div className="fl-var-copy">
          <label className="fl-field"><span>כותרת בדף הלקוח</span>
            <input value={v.copy.clientTitle ?? ''} onChange={e => setVariant(i, x => ({ ...x, copy: { ...x.copy, clientTitle: e.target.value } }))} />
          </label>
          <label className="fl-field"><span>שורה מתחת</span>
            <input value={v.copy.clientSub ?? ''} onChange={e => setVariant(i, x => ({ ...x, copy: { ...x.copy, clientSub: e.target.value } }))} />
          </label>
          <label className="fl-field"><span>טקסט הכפתור</span>
            <input value={v.copy.clientCta ?? ''} onChange={e => setVariant(i, x => ({ ...x, copy: { ...x.copy, clientCta: e.target.value } }))} />
          </label>
        </div>
      )}

      <div className="fl-cond-l">{derivedCopy ? 'מה הלקוח מעלה' : 'מה נדרש'}</div>
      <ul className="fl-var-items">
        {items.map((it, j) => (
          <li key={`${it.key ?? it.label}-${j}`}>
            <span>{it.label}</span>
            <button type="button" className="fl-x is-sm" aria-label={`הסרת «${it.label}»`}
              onClick={() => setItems(xs => xs.filter((_, k) => k !== j))}>✕</button>
          </li>
        ))}
        {/* ‼ רשימה ריקה אינה «כלום»: המחולל יוצר בקשה ריקה («להעלות 0 מסמכים») — validateFlow חוסם שמירה כזו. */}
        {items.length === 0 && (
          <li className="fl-hint">{derivedCopy
            ? `אין מסמכים — לקוח במצב הזה יקבל בקשה ריקה. מוסיפים מסמך${v.fact === null ? '' : ', או «הסר מצב»'}.`
            : 'אין פריטים.'}</li>
        )}
      </ul>
      <form className="fl-var-add" onSubmit={e => {
        e.preventDefault();
        const label = newLabel.trim();
        if (!label) return;
        setItems(xs => [...xs, { label }]);
        setNewLabel('');
      }}>
        <input value={newLabel} onChange={e => setNewLabel(e.target.value)} placeholder="פריט חדש" aria-label="פריט חדש" autoComplete="off" />
        <button type="submit" className="btn btn-sm btn-secondary" disabled={!newLabel.trim()}>הוספה</button>
      </form>
    </div>
  );
}

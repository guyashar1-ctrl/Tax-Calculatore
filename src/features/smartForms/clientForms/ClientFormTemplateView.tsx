// ─── «הגדרת הטופס» לטפסי הלקוח (4440/821) — בספריית הבקשות ← מסמכים ─────────
// שלוש לשוניות כמו ב-6101: הטופס (עם נתוני דוגמה, כל שדה בצבע המקור שלו, לחיצה ⇒ מה נכנס
// ומאיפה), השאלון (מה נשאל, מתי, ואיפה נשמר), והקובץ (גרסה, טביעה, אזורים שלא ממופים).
// ‼ צפייה בלבד: עריכת מיקום על גבי הטופס קיימת כאן רק ל-6101 (SmartTemplateManager).

import { useEffect, useMemo, useState } from 'react';
import SmartFormPreview, { type Hotspot } from '../SmartFormPreview';
import type { FieldDef } from '../types';
import type { ClientFormDef } from './types';
import { renderClientForm } from './registry';
import '../../taxYear/taxYear.css';
import '../smartForms.css';
import './clientForms.css';

type Tab = 'form' | 'questions' | 'file';
type Src = 'card' | 'answer' | 'system';

const SRC_LABEL: Record<Src, string> = { card: 'מהכרטיס של הלקוח', answer: 'הלקוח עונה בטופס', system: 'חתימה ותאריך' };
const SRC_TONE: Record<Src, Hotspot['tone']> = { card: 'ok', answer: 'warn', system: 'bad' };
const srcOf = (f: FieldDef): Src => (f.kind === 'signature' || f.provenance === 'system' ? 'system' : f.provenance === 'filing' ? 'answer' : 'card');

export default function ClientFormTemplateView({ def, onClose }: { def: ClientFormDef; onClose: () => void }) {
  const [tab, setTab] = useState<Tab>('form');
  const [sample, setSample] = useState(true);
  const [bytes, setBytes] = useState<Uint8Array | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [active, setActive] = useState<string | null>(null);
  const [hidden, setHidden] = useState<Set<Src>>(new Set());

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  useEffect(() => {
    let alive = true;
    setBytes(null);
    void renderClientForm(def, sample ? def.sample : {}, { draftMark: sample ? 'נתוני דוגמה' : undefined })
      .then(r => { if (alive) setBytes(r.bytes); })
      .catch(e => { if (alive) setErr(e instanceof Error ? e.message : String(e)); });
    return () => { alive = false; };
  }, [def, sample]);

  const fields = def.template.fields;
  const counts = useMemo(() => {
    const c: Record<Src, number> = { card: 0, answer: 0, system: 0 };
    for (const f of fields) c[srcOf(f)]++;
    return c;
  }, [fields]);
  const hotspots: Hotspot[] = fields.filter(f => !hidden.has(srcOf(f))).map(f => ({ page: f.page, box: f.box, key: f.id, tone: SRC_TONE[srcOf(f)], title: f.label }));
  const sel = fields.find(f => f.id === active) ?? null;

  return (
    <div className="modal-backdrop" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby="cft-h" style={{ maxWidth: 1180, width: 'calc(100vw - 24px)', maxHeight: 'calc(100dvh - 24px)', display: 'flex', flexDirection: 'column' }}>
        <div className="modal-head">
          <h3 id="cft-h" style={{ margin: 0, fontSize: 'var(--fs-16)' }}>{def.template.title} <span className="ty-note">· {def.authorityLabel}</span></h3>
          <button type="button" className="btn btn-sm btn-ghost" onClick={onClose} aria-label="סגירה">✕</button>
        </div>
        <div className="modal-body" style={{ overflow: 'auto' }}>
          <div className="cf-choice-row" role="tablist" style={{ marginBottom: '.8rem' }}>
            {([['form', 'הטופס'], ['questions', 'השאלון'], ['file', 'קובץ']] as [Tab, string][]).map(([k, l]) => (
              <button key={k} type="button" role="tab" className="ty-choice is-sm" aria-selected={tab === k} aria-pressed={tab === k} onClick={() => setTab(k)}>{l}</button>
            ))}
          </div>

          {tab === 'form' && (
            <div className="cfp-cols">
              <div className="cfp-sec">
                <p className="ty-note" style={{ margin: 0 }}>{def.intro} כל שדה צבוע לפי המקור שלו. לחיצה על שדה — מה נכנס בו ומאיפה.</p>
                <div className="cfp-actions" role="group" aria-label="מקרא">
                  {(Object.keys(SRC_LABEL) as Src[]).map(s => (
                    <button key={s} type="button" className="ty-choice is-sm" aria-pressed={!hidden.has(s)}
                      onClick={() => setHidden(h => { const n = new Set(h); if (n.has(s)) n.delete(s); else n.add(s); return n; })}>
                      <span className="cf-check-mark" aria-hidden="true" style={{ background: s === 'card' ? 'rgba(22,163,74,.25)' : s === 'answer' ? 'rgba(217,119,6,.3)' : 'rgba(220,38,38,.25)' }} />
                      {SRC_LABEL[s]} · {counts[s]}
                    </button>
                  ))}
                </div>
                <label className="cf-declare" style={{ fontSize: 'var(--fs-13)' }}>
                  <input type="checkbox" checked={sample} onChange={e => setSample(e.target.checked)} /> <span>עם נתוני דוגמה</span>
                </label>
                {sel ? (
                  <div className="cfp-form" aria-live="polite">
                    <h3>{sel.label}</h3>
                    <ul className="cfp-rows">
                      <li><span>מאיפה</span><span>{SRC_LABEL[srcOf(sel)]}</span></li>
                      {sel.source && sel.source !== '—' && <li><span>בכרטיס</span><span>{sel.source}</span></li>}
                      {sel.formatRule && sel.formatRule !== 'as_is' && <li><span>איך נכתב</span><span>{sel.formatRule}</span></li>}
                    </ul>
                  </div>
                ) : <p className="ty-note">לא נבחר שדה.</p>}
                {err && <div className="ty-err">{err}</div>}
              </div>
              <div className="cf-review-pages">
                <SmartFormPreview bytes={bytes} busy={!bytes} hotspots={hotspots} activeKey={active} onHotspot={setActive} />
              </div>
            </div>
          )}

          {tab === 'questions' && (
            <div className="cfp-sec">
              <p className="ty-note" style={{ margin: 0 }}>הלקוח רואה מסך לכל קבוצה — רק כשחסר בה משהו, או כשהיא הצהרה שלו. מה שנענה ויש לו מקום בכרטיס נשמר בכרטיס.</p>
              {def.screens.map(s => (
                <div key={s.id} className="cfp-form">
                  <h3>{typeof s.title === 'function' ? s.title(def.sample) : s.title}
                    <span className="cfp-src">{s.always ? 'נשאל תמיד' : 'רק כשחסר'}{s.identity ? ' · זהות: מתקנים במשרד' : ''}</span></h3>
                  <ul className="cfp-rows">
                    {s.fields.filter((f, i, a) => a.findIndex(x => x.key === f.key && x.label === f.label) === i).map(f => (
                      <li key={`${f.key}-${f.label}`}>
                        <span>{f.label}</span>
                        <span>{f.store === 'card' ? 'נשמר בכרטיס' : 'רק בטופס'}{f.required === true ? ' · חובה' : typeof f.required === 'function' ? ' · חובה לפי תשובה' : ''}{f.showIf ? ' · מותנה' : ''}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          )}

          {tab === 'file' && (
            <div className="cfp-sec">
              <ul className="cfp-rows">
                <li><span>טופס</span><span>{def.template.formNumber} · גרסה {def.template.version}</span></li>
                <li><span>עמודים · שדות</span><span>{def.template.pageCount} · {def.template.fields.length}</span></li>
                <li><span>מיפוי</span><span>{def.template.mappingVersion}</span></li>
                <li><span>טביעת הקובץ (SHA-256)</span><span dir="ltr" style={{ fontSize: 11, overflowWrap: 'anywhere' }}>{def.template.sha256}</span></li>
                <li><span>הקובץ הריק</span><span><a href={def.template.fileUrl} target="_blank" rel="noopener noreferrer">פתיחה</a></span></li>
              </ul>
              <h3>לא ממולא בכוונה</h3>
              <ul className="cfp-rows">
                {def.template.unmapped.map(u => <li key={u.id}><span>{u.label}</span><span>{u.reason}</span></li>)}
              </ul>
              {def.signNote && <div className="cf-note">{def.signNote}</div>}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── תבניות מסע ──────────────────────────────────────────────────────────────
// מערכת תבניות אחת (הכרעת גיא 2026-08-05): תבנית היא סט של בקשות, וכל בקשה
// נושאת את הניסוח שלה — מה הלקוח רואה, מה נדרש ממנו, ואילו מסמכים. המייל
// שמודיע על בקשה נגזר מאותו ניסוח, ואין נוסח שני לתחזק.
//
// ‼ החלת תבנית מוסיפה בלבד. בקשה שכבר קיימת אצל הלקוח מדולגת ולא נדרסת —
// אחרת ניסוח שנערך ידנית או בקשה שכבר רצה מול הלקוח היו נמחקים.

import { useEffect, useState } from 'react';
import type { OnboardingStep } from '../../types/onboarding';
import { STEP_TYPE_LABELS } from '../../types/onboarding';
import { supabase } from '../../lib/supabase';

export interface JourneyTemplate {
  id: string;
  name: string;
  description?: string;
  /**
   * ‼ requiredForClose נוסע עם הבקשה. בלעדיו בקשה שהוגדרה כרשות אצל לקוח אחד
   * הייתה חוזרת כ"נדרש" אצל כל מי שהתבנית מוחלת עליו. חסר ⇒ נדרש, כדי
   * שתבניות שנשמרו לפני השינוי ימשיכו להתנהג כמו קודם.
   */
  entries: {
    stepType: OnboardingStep['stepType'];
    payload?: Record<string, unknown>;
    requiredForClose?: boolean;
  }[];
}

interface Props {
  clientId: string;
  clientName: string;
  onClose: () => void;
  onApplied: () => void;
}

export default function JourneyTemplatesDialog({ clientId, clientName, onClose, onApplied }: Props) {
  const [tab, setTab] = useState<'apply' | 'save'>('apply');
  const [templates, setTemplates] = useState<JourneyTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');

  async function load() {
    setLoading(true);
    const { data, error: e } = await supabase
      .from('journey_templates').select('*').order('name');
    setLoading(false);
    if (e) { setError(e.message); return; }
    setTemplates((data ?? []) as JourneyTemplate[]);
  }

  useEffect(() => { void load(); }, []);

  async function apply(t: JourneyTemplate) {
    setBusy(true); setError(null); setNotice(null);
    const { data, error: e } = await supabase.rpc('apply_journey_template', {
      p_client_id: clientId, p_template_id: t.id,
    });
    setBusy(false);
    const res = data as { ok?: boolean; added?: number; skipped?: number } | null;
    if (e || !res?.ok) { setError('החלת התבנית נכשלה.'); return; }
    setNotice(`נוספו ${res.added} בקשות${res.skipped ? ` · ${res.skipped} כבר היו קיימות ולא נגעתי בהן` : ''}.`);
    onApplied();
  }

  async function save() {
    if (!name.trim()) { setError('צריך שם לתבנית.'); return; }
    setBusy(true); setError(null); setNotice(null);
    const { data, error: e } = await supabase.rpc('save_journey_template', {
      p_client_id: clientId, p_name: name, p_description: description || null,
    });
    setBusy(false);
    const res = data as { ok?: boolean; error?: string; count?: number } | null;
    if (e || !res?.ok) {
      setError(res?.error === 'nothing_to_save'
        ? 'אין ללקוח הזה בקשות לשמור.'
        : 'השמירה נכשלה.');
      return;
    }
    setNotice(`נשמרה תבנית עם ${res.count} בקשות.`);
    setName(''); setDescription('');
    void load();
  }

  async function remove(t: JourneyTemplate) {
    setBusy(true);
    const { error: e } = await supabase.from('journey_templates').delete().eq('id', t.id);
    setBusy(false);
    if (e) { setError(e.message); return; }
    void load();
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" style={{ maxWidth: 560 }} onClick={e => e.stopPropagation()}>
        <div className="modal-head">
          <h3 style={{ margin: 0, fontSize: 'var(--fs-16)' }}>תבניות מסע</h3>
          <button type="button" className="btn btn-sm btn-ghost" onClick={onClose} aria-label="סגירה">✕</button>
        </div>

        <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '.7rem' }}>
          <div style={{ display: 'flex', gap: '.35rem' }}>
            <button type="button" className={`btn btn-sm ${tab === 'apply' ? 'btn-secondary' : 'btn-ghost'}`}
              onClick={() => { setTab('apply'); setError(null); setNotice(null); }}>החלה על {clientName}</button>
            <button type="button" className={`btn btn-sm ${tab === 'save' ? 'btn-secondary' : 'btn-ghost'}`}
              onClick={() => { setTab('save'); setError(null); setNotice(null); }}>שמירה כתבנית</button>
          </div>

          {error && (
            <div style={{
              padding: '.5rem .7rem', borderRadius: 'var(--radius)',
              background: 'var(--red-light)', color: 'var(--err)', fontSize: 'var(--fs-13)',
            }}>⚠ {error}</div>
          )}
          {notice && (
            <div style={{ fontSize: 'var(--fs-13)', color: 'var(--ok, #17845b)' }}>✓ {notice}</div>
          )}

          {tab === 'apply' && (
            <>
              {loading && <div className="cw-empty">טוען…</div>}
              {!loading && templates.length === 0 && (
                <div className="cw-empty">
                  עוד אין תבניות. אפשר לשמור את ההרכב של לקוח קיים בלשונית "שמירה כתבנית".
                </div>
              )}
              {templates.map(t => (
                <div key={t.id} style={{
                  display: 'flex', gap: '.6rem', alignItems: 'flex-start',
                  padding: '.6rem .7rem', border: '1px solid var(--hairline-2)',
                  borderRadius: 'var(--radius)',
                }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 600, fontSize: 'var(--fs-14)' }}>{t.name}</div>
                    {t.description && (
                      <div style={{ fontSize: 'var(--fs-12)', color: 'var(--ink-3)' }}>{t.description}</div>
                    )}
                    {/* ‼ הבקשות מוצגות אחת-אחת ולא כשורה מחוברת, כדי שאפשר
                        יהיה לסמן ליד כל אחת אם היא רשות. מי שרוצה לשנות —
                        משנה על השלב עצמו במסע ושומר את התבנית מחדש. */}
                    <div style={{
                      fontSize: 'var(--fs-12)', color: 'var(--ink-4)', marginTop: 2,
                      display: 'flex', flexWrap: 'wrap', gap: '.2rem .5rem',
                    }}>
                      {(t.entries ?? []).map((e, i) => (
                        <span key={i} style={{ whiteSpace: 'nowrap' }}>
                          {e.stepType === 'custom_request'
                            ? String(e.payload?.title ?? 'בקשה מהמשרד')
                            : STEP_TYPE_LABELS[e.stepType]}
                          {e.requiredForClose === false && (
                            <span className="ob-optional" style={{ marginInlineStart: '.25rem' }}>רשות</span>
                          )}
                        </span>
                      ))}
                    </div>
                  </div>
                  <button type="button" className="btn btn-sm btn-primary" disabled={busy}
                    onClick={() => void apply(t)}>החל</button>
                  <button type="button" className="btn btn-sm btn-ghost" disabled={busy}
                    onClick={() => void remove(t)} aria-label="מחיקת תבנית">✕</button>
                </div>
              ))}
            </>
          )}

          {tab === 'save' && (
            <>
              <p style={{ margin: 0, fontSize: 'var(--fs-13)', color: 'var(--ink-3)', lineHeight: 1.7 }}>
                נשמרות הבקשות של {clientName} עם הניסוח והמסמכים שלהן - לא הסטטוס,
                לא התאריכים, ולא מה שכבר התקבל.
              </p>
              <label style={{ display: 'flex', flexDirection: 'column', gap: '.25rem', fontSize: 'var(--fs-13)' }}>
                שם התבנית
                <input className="input" value={name} onChange={e => setName(e.target.value)}
                  placeholder="למשל: מעבר מרו״ח אחר" />
              </label>
              <label style={{ display: 'flex', flexDirection: 'column', gap: '.25rem', fontSize: 'var(--fs-13)' }}>
                תיאור (לא חובה)
                <input className="input" value={description} onChange={e => setDescription(e.target.value)} />
              </label>
              <button type="button" className="btn btn-primary" style={{ alignSelf: 'flex-start' }}
                disabled={busy} onClick={() => void save()}>
                {busy ? 'שומר…' : 'שמור כתבנית'}
              </button>
            </>
          )}
        </div>

        <div className="modal-foot" style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <button type="button" className="btn btn-ghost" onClick={onClose}>סגירה</button>
        </div>
      </div>
    </div>
  );
}

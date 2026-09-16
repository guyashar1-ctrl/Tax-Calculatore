// ─── דף המשתתף (?participant=TOKEN) ─────────────────────────────────────────
// docs/PLAN-REQUEST-PREREQUISITES-INFORMATION-COLLECTION.md §7.2/§11. קישור
// לשלב, לתפקיד, לרשימת שדות מפורשת — ותפוגה. מציג רק את מה שבאמת חסר, כותב
// לאותם שדות קנוניים שהמשרד היה כותב אליהם ("מלא פרטים עכשיו"), ותו לא: אין
// כאן דף אישי, אין רשימת בקשות, אין נתון אחר על הכרטיס.
//
// ‼ בכוונה לא נושא מיתוג מלא (לוגו/צבעי המשרד) — זה קישור צר-תכולה שנפתח
// לפני שידוע בכלל איזה משרד זה, בדיוק כמו ClientPageState.

import { useEffect, useState } from 'react';
import ClientPageState from './ui/ClientPageState';
import { supabase } from '../lib/supabase';

interface Props {
  token: string;
}

interface Field {
  key: string;
  kind: 'text' | 'idNumber' | 'year' | 'date';
  label: string;
  value: string | number | null;
}

interface Info {
  firmName: string;
  ownerFirstName: string;
  participantName: string;
  fields: Field[];
}

type Phase = 'loading' | 'invalid' | 'expired' | 'satisfied' | 'submitted' | 'form';

const PHASE_BY_REASON: Record<string, Phase> = {
  link_expired: 'expired',
  not_found: 'invalid',
  link_revoked: 'invalid',
};

export default function PublicParticipantPage({ token }: Props) {
  const [phase, setPhase] = useState<Phase>('loading');
  const [info, setInfo] = useState<Info | null>(null);
  const [values, setValues] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data, error: e } = await supabase.rpc('get_participant_form', { p_token: token });
      if (cancelled) return;
      if (e || !data) { setPhase('invalid'); return; }
      if (!data.ok) { setPhase(PHASE_BY_REASON[String(data.reason ?? '')] ?? 'invalid'); return; }
      if (data.alreadySubmitted) { setPhase('submitted'); return; }
      if (data.alreadySatisfied) { setPhase('satisfied'); return; }
      const fields: Field[] = data.fields ?? [];
      setInfo({
        firmName: data.firmName || 'המשרד',
        ownerFirstName: data.ownerFirstName || '',
        participantName: data.participantName || '',
        fields,
      });
      setValues(Object.fromEntries(fields.map(f => [f.key, f.value != null ? String(f.value) : ''])));
      setPhase('form');
    })();
    return () => { cancelled = true; };
  }, [token]);

  async function submit() {
    setBusy(true);
    setError(null);
    const { data, error: e } = await supabase.rpc('participant_submit_prerequisites', {
      p_token: token, p_values: values,
    });
    setBusy(false);
    if (e || !data) { setError('השמירה נכשלה. נסו שוב.'); return; }
    if (!data.ok) {
      if (data.reason === 'link_expired') { setPhase('expired'); return; }
      if (data.alreadySubmitted) { setPhase('submitted'); return; }
      setError(data.reason === 'invalid_value' ? `הערך בשדה "${data.field}" אינו תקין.` : 'השמירה נכשלה. נסו שוב.');
      return;
    }
    setPhase('submitted');
  }

  if (phase === 'loading') return <ClientPageState quiet body="טוען…" />;
  if (phase === 'invalid') return <ClientPageState mark="⚠" title="הקישור אינו תקף" body="ייתכן שהוא כבר שימש, או שהוקלד לא נכון." />;
  if (phase === 'expired') return <ClientPageState mark="⏳" title="הקישור פג תוקף" body="בקשו קישור חדש ממי ששלח לכם אותו." />;
  if (phase === 'satisfied' || phase === 'submitted') {
    return <ClientPageState mark="✓" title="תודה, הפרטים נקלטו" body="אין צורך לעשות דבר נוסף כרגע." />;
  }

  if (!info) return null;

  const invalid = info.fields.some(f => !values[f.key]?.trim());

  return (
    <div className="cps">
      <div className="cps-inner is-wide" style={{ textAlign: 'right' }}>
        <div style={{ fontSize: 13, color: 'var(--ink-3, #6b6b6b)', marginBottom: 4 }}>{info.firmName}</div>
        <h1 className="cps-title" style={{ fontSize: 22 }}>
          {info.ownerFirstName ? `${info.ownerFirstName} מבקש/ת כמה פרטים עבור ${info.participantName}` : `נדרשים כמה פרטים מ${info.participantName}`}
        </h1>
        <div className="cps-body" style={{ marginBottom: 18 }}>
          כדי להמשיך בטיפול בייצוג מול הרשות, נשארו כמה פרטים קצרים. פחות מדקה.
        </div>
        <div style={{ display: 'grid', gap: '.9rem', maxWidth: 360, margin: '0 auto' }}>
          {info.fields.map(f => (
            <label key={f.key} style={{ display: 'grid', gap: 4, fontSize: 14 }}>
              <span style={{ color: 'var(--ink-3, #6b6b6b)' }}>{f.label}</span>
              <input
                className="input"
                type={f.kind === 'date' ? 'date' : 'text'}
                inputMode={f.kind === 'idNumber' || f.kind === 'year' ? 'numeric' : undefined}
                dir={f.kind === 'date' ? 'ltr' : undefined}
                maxLength={f.kind === 'idNumber' ? 9 : f.kind === 'year' ? 4 : undefined}
                value={values[f.key] ?? ''}
                onChange={e => setValues(v => ({ ...v, [f.key]: e.target.value }))}
              />
            </label>
          ))}
          {error && <div style={{ color: '#b91c1c', fontSize: 13 }}>{error}</div>}
          <button type="button" className="ui-btn ui-btn-primary" disabled={busy || invalid}
            onClick={() => void submit()} style={{ marginTop: 6 }}>
            {busy ? 'שולח…' : 'שליחה'}
          </button>
        </div>
      </div>
    </div>
  );
}

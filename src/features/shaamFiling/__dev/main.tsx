// ─── מסך בדיקה: «הפקת דוחות משע״ם והעלאה» + «מרשימות שע״ם» בתיק לקוח — פיתוח בלבד (16.10.2026) ────────
// פתיחה (שרת פיתוח):  /src/features/shaamFiling/__dev/index.html?test-office      — מסד מדומה, בלי רשת
//                     /src/features/shaamFiling/__dev/index.html?staging            — שרת במצב staging (מחובר, מסד staging)
// ‼ דף נפרד מ-index.html — לא נכנס לבניית הייצור ולא נוגע ב-App.tsx. הרכיבים עצמם יוצבו ב«כל העבודות» ובתיק המס
//   בידי הסשנים שאחראים על הקבצים האלה.
import '../../../lib/trialBuild';
import { StrictMode, useCallback, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import '../../../index.css';
import '../../../components/ui/ui.css';
import '../../../components/ui/pivo-design.css';
// ‼ גם הטפסים החכמים (קידומת sf-) — במסך האמיתי הם טעונים יחד; כך התנגשות שמות מחלקות תיראה כבר כאן (16.10)
import '../../smartForms/smartForms.css';
import { FAKE_ACTIVE, installFakeBackend } from '../../../components/office/__fakeBackend';
import { supabase } from '../../../lib/supabase';
import { clientFromDb } from '../../../lib/dbMappers';
import type { Client } from '../../../types';
import { ShaamFilingPanel, ClientObligationRows } from '../index';
import { SAMPLE_CLIENTS } from '../../../data/sampleClients';
import { enrichClientsWithWorkspace } from '../../../data/sampleClientWorkspace';

if (FAKE_ACTIVE) installFakeBackend();

type StepRow = { id: string; client_id: string; step_type: string; status: string; track?: string; published_at: string | null; payload: Record<string, unknown> };

function Harness() {
  const [clients, setClients] = useState<Client[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [focus, setFocus] = useState<string>(new URLSearchParams(location.search).get('client') ?? '');
  const [steps, setSteps] = useState<StepRow[]>([]);
  const [tick, setTick] = useState(0);
  const [opened, setOpened] = useState<string | null>(null);

  const loadClients = useCallback(async () => {
    const q = supabase.from('clients').select('*');
    const only = new URLSearchParams(location.search).get('only');
    const { data, error } = only ? await q.like('last_name', `%${only}%`) : await q;
    if (error) { setErr(error.message); return; }
    const rows = (data ?? []) as Record<string, unknown>[];
    const cs = rows.length || !FAKE_ACTIVE ? rows.map(clientFromDb) : enrichClientsWithWorkspace(SAMPLE_CLIENTS);
    setClients(cs);
    if (!focus && cs[0]) setFocus(cs[0].id);
  }, [focus]);
  const loadSteps = useCallback(async () => {
    if (!focus) return;
    const { data } = await supabase.from('onboarding_steps').select('id, client_id, step_type, status, track, published_at, payload').eq('client_id', focus);
    setSteps(((data ?? []) as StepRow[]).filter(s => ['annual_return', 'wealth_declaration', 'custom_request', 'info_collection'].includes(s.step_type)));
  }, [focus]);
  useEffect(() => { void loadClients(); }, [loadClients]);
  useEffect(() => { void loadSteps(); }, [loadSteps, tick]);

  const client = clients.find(c => c.id === focus);
  return (
    <div dir="rtl" style={{ maxWidth: 1100, margin: '0 auto', padding: 16, display: 'grid', gap: 16 }}>
      <div style={{ background: 'var(--chip-amber-bg)', color: 'var(--chip-amber-tx)', padding: '6px 10px', borderRadius: 8, fontSize: 13 }}>
        מסך בדיקה — {FAKE_ACTIVE ? 'מסד מדומה, שום דבר לא נשמר ולא נשלח' : 'מסד staging'}.
      </div>
      {err && <div className="shf-err">{err}</div>}
      <ShaamFilingPanel clients={clients} onChanged={() => setTick(t => t + 1)} onOpenRequests={(c, s) => { setFocus(c); setOpened(s); setTick(t => t + 1); }} />
      <section style={{ display: 'grid', gap: 8 }} data-dev-client>
        <label style={{ fontSize: 13 }}>תיק לקוח (לבדיקת «מרשימות שע״ם»):{' '}
          <select value={focus} onChange={e => { setFocus(e.target.value); setOpened(null); }} data-dev-client-pick>
            {clients.map(c => <option key={c.id} value={c.id}>{`${c.firstName} ${c.lastName}`}</option>)}
          </select>
        </label>
        {client && <ClientObligationRows key={`${client.id}:${tick}`} client={client} onChanged={() => setTick(t => t + 1)} onOpenRequests={(_c, s) => setOpened(s)} />}
        <div style={{ fontSize: 13 }} data-dev-steps>
          <b>«בקשות» של הלקוח (דוח/הון/מסמך):</b>
          <ul>{steps.map(s => (
            <li key={s.id} data-dev-step={s.step_type} data-dev-published={s.published_at ? 'yes' : 'no'} style={{ fontWeight: s.id === opened ? 700 : 400 }}>
              {s.step_type} · {String(s.payload.taxYear ?? s.payload.asOfDate ?? s.payload.title ?? '')} · {s.status} · {s.step_type === 'annual_return' || s.step_type === 'wealth_declaration' ? 'עבודת משרד' : s.published_at ? 'פורסם ללקוח' : 'טיוטה — לא פורסם'}
              {(s.payload.work as Record<string, unknown> | undefined)?.shaamFiled ? ' · הוגש לפי שע״ם' : ''}
            </li>
          ))}{!steps.length && <li>אין</li>}</ul>
        </div>
      </section>
    </div>
  );
}

// ‼ מסך הבדיקה לעולם לא מול הייצור: בלי מסד מדומה — רק כשהשרת מחובר ל-staging
const ON_STAGING = String(import.meta.env.VITE_SUPABASE_URL ?? '').includes('evdfxjqrkgugssfrdoxd');
createRoot(document.getElementById('root')!).render(<StrictMode>{FAKE_ACTIVE || ON_STAGING
  ? <Harness />
  : <p dir="rtl" style={{ padding: 24 }}>מסך הבדיקה נפתח רק עם ‎?test-office‎ (מסד מדומה) או בשרת staging — לא מול הייצור.</p>}</StrictMode>);

// ─── הדגמה: ספרייה · מסלולים · אצל הלקוח (‎?flows-demo‎, DEV בלבד) ──────────────
// ‼ אב-טיפוס על נתונים מדומים. אין מסד, אין מייל, אין פנייה לרשות.
// המסמך: docs/DESIGN-LIBRARY-FLOWS-2026-10-02.md.
import { useEffect, useMemo, useState } from 'react';
import { DEMO_FLOWS, DEMO_CLIENTS, type Flow } from './flowModel';
import { createRun, type Run, type ExistingRequest } from './flowEngine';
import MapView from './MapView';
import LibraryView from './LibraryView';
import FlowBuilder from './FlowBuilder';
import ClientRunView from './ClientRunView';
import { Icon } from './ui';
import './flowsDemo.css';

type Tab = 'map' | 'library' | 'flows' | 'client';
const TABS: { id: Tab; label: string; icon: 'eye' | 'lib' | 'flow' | 'person' }[] = [
  { id: 'map', label: 'מבנה', icon: 'eye' },
  { id: 'library', label: 'ספרייה', icon: 'lib' },
  { id: 'flows', label: 'מסלולים', icon: 'flow' },
  { id: 'client', label: 'אצל הלקוח', icon: 'person' },
];

/** מה כבר קיים אצל הלקוחות לפני שהמסלול מתחיל — כדי להראות «מצורף» ו«לא נפתח שוב». */
const EXISTING: Record<string, ExistingRequest[]> = {
  'c-cohen': [{ libId: 'tax_status', state: 'open', title: 'עדכון סטטוס מס', when: '28.9' }],
  'c-alpha': [{ libId: 'paperless', state: 'done', title: 'הרשמה לפייפרלס', when: '3.9' }],
};

function readTab(): Tab {
  const h = window.location.hash.replace('#', '') as Tab;
  return TABS.some(t => t.id === h) ? h : 'map';
}

export default function FlowsDemo() {
  const [tab, setTabState] = useState<Tab>(readTab);
  const [flows, setFlows] = useState<Flow[]>(() => structuredClone(DEMO_FLOWS));
  const [libVersion, setLibVersion] = useState(0);
  const [focus, setFocus] = useState<{ flowId: string; stageId?: string } | null>(null);
  const [sel, setSel] = useState({ clientId: 'c-cohen', flowId: 'onboarding' });
  const [runs, setRuns] = useState<Record<string, Run>>({});

  useEffect(() => {
    const theme = new URLSearchParams(window.location.search).get('theme');
    if (theme === 'dark') document.documentElement.dataset.theme = 'dark';
    const onHash = () => setTabState(readTab());
    window.addEventListener('hashchange', onHash);
    document.title = 'PIVO · בקשות, מסמכים ומסלולים (הדגמה)';
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  const setTab = (t: Tab) => {
    setTabState(t);
    if (window.location.hash !== `#${t}`) window.history.pushState(null, '', `#${t}`);
    window.scrollTo({ top: 0 });
  };

  const runKey = `${sel.flowId}:${sel.clientId}`;
  const run = useMemo(() => runs[runKey] ?? createRun(
    flows.find(f => f.id === sel.flowId)!,
    structuredClone(DEMO_CLIENTS.find(c => c.id === sel.clientId)!),
    EXISTING[sel.clientId] ?? [],
  ), [runs, runKey, flows, sel]);

  // ‼ ריצה שעוד לא התחילה רואה תמיד את הגרסה השמורה האחרונה; ריצה שהתחילה — את מה שהתחילה איתו.
  const liveRun = run.status === 'idle' ? { ...run, flow: flows.find(f => f.id === sel.flowId)! } : run;

  return (
    <div className="fd" dir="rtl">
      <header className="fd-head">
        <div className="fd-brand"><span className="fd-logo" aria-hidden="true">P</span> בקשות, מסמכים ומסלולים</div>
        <span className="fd-demo">הדגמה · נתונים מדומים · שום דבר לא נשלח</span>
      </header>
      <nav className="fd-tabs" aria-label="אזורי ההדגמה">
        {TABS.map(t => (
          <button key={t.id} type="button" className={`fd-tab${tab === t.id ? ' is-on' : ''}`} aria-current={tab === t.id ? 'page' : undefined}
            onClick={() => setTab(t.id)}>
            <Icon name={t.icon} size={16} /> {t.label}
          </button>
        ))}
      </nav>
      <main className="fd-main">
        {tab === 'map' && <MapView go={t => setTab(t)} />}
        {tab === 'library' && (
          <LibraryView flows={flows} version={libVersion} onLibraryChange={() => setLibVersion(v => v + 1)}
            openFlowAt={(flowId, stageId) => { setFocus({ flowId, stageId }); setTab('flows'); }} />
        )}
        {tab === 'flows' && (
          <FlowBuilder flows={flows} focus={focus}
            onSave={f => setFlows(fs => fs.map(x => x.id === f.id ? f : x))}
            onRunAt={(flowId, clientId) => { setSel({ flowId, clientId }); setTab('client'); }} />
        )}
        {tab === 'client' && (
          <ClientRunView flows={flows} clients={DEMO_CLIENTS} run={liveRun} clientId={sel.clientId} flowId={sel.flowId}
            setRun={r => setRuns(rs => ({ ...rs, [runKey]: r }))}
            onPick={(clientId, flowId) => setSel({ clientId, flowId })}
            openBuilder={(flowId, stageId) => { setFocus({ flowId, stageId }); setTab('flows'); }} />
        )}
      </main>
    </div>
  );
}

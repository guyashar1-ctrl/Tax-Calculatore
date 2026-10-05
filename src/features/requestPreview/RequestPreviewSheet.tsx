// ─── «צפייה» — מגירה שמראה בקשה בדיוק כפי שהלקוח מקבל אותה ────────────────────────
// ‼ הצפייה אינה שולחת, שומרת, חותמת, מאשרת ייצוג או מפעילה אוטומציה: הדף מצויר ב-PortalView במצב sample (כל פעולה
// מוזרקת ואינה פונה לרשת), והנתונים מגיעים מ-preview_request_sample (STABLE — Postgres עצמו אוסר בה כתיבה).
// ‼ כל התוכן נבנה בשרת באותו קוד של הדף האמיתי; כאן רק בוחרים מצב (צירים) ומציירים.

import { useEffect, useMemo, useState } from 'react';
import type { FirmProfile } from '../../types/firmProfile';
import { FlSeg, FlSheet } from '../../components/flows/builder/ui';
import { PortalView } from '../../components/PublicPortalPage';
import type { PortalLinkedKind } from '../../components/portal/portalActions';
import { REQUEST_GROUPS } from '../requests/requestGroups';
import { specProblemText } from './api';
import { viewOf, type AxisDef, type EditHint, type LinkedKey } from './registry';
import type { PreviewTarget, Selection } from './targets';
import { useSampleData } from './useSampleData';
import ProcessList from './ProcessList';
import MailPreview from './MailPreview';
import DocsPreview from './DocsPreview';
import LinkedPagePreview from './LinkedPagePreview';
import '../../components/flows/flows.css';
import './requestPreview.css';

type Tab = 'page' | 'mail' | 'docs' | 'linked';

const LINKED_OF_PORTAL_KIND: Partial<Record<PortalLinkedKind, LinkedKey>> = {
  onboard: 'onboard', sign: 'sign', intake: 'intake', release: 'release', 'sign-form': 'signForm',
};

function editLabel(h: EditHint): string | null {
  switch (h.kind) {
    case 'editor': return 'עריכה';
    case 'emails': return `${h.label} ←`;
    case 'rules': return `${h.label} ←`;
    case 'docsShelf': return 'עריכה במדף «מסמכים» ←';
    default: return null;
  }
}

function AxisChips({ axis, value, onChange }: { axis: AxisDef; value: string; onChange: (v: string) => void }) {
  if (axis.options.length > 4) {
    return (
      <label className="rp-axis">
        <span className="rp-axis-label">{axis.label}</span>
        <select value={value} onChange={e => onChange(e.target.value)} aria-label={axis.label}>
          {axis.options.map(o => <option key={o.key} value={o.key}>{o.label}</option>)}
        </select>
      </label>
    );
  }
  return (
    <div className="rp-axis" data-axis={axis.key}>
      <span className="rp-axis-label">{axis.label}</span>
      <FlSeg label={axis.label} small value={value} onChange={onChange}
        options={axis.options.map(o => ({ value: o.key, label: o.label }))} />
    </div>
  );
}

export default function RequestPreviewSheet({ target, selection, onSelectionChange, onClose, profile, onEdit, primary, badge }: {
  target: PreviewTarget;
  /** הבחירה ההתחלתית (מהכתובת) — מה שלא נבחר מקבל את ברירת המחדל. */
  selection?: Selection;
  onSelectionChange?: (sel: Selection) => void;
  onClose: () => void;
  profile: FirmProfile;
  /** מה «עריכה» עושה — המארח יודע איפה עורכים בכל מקום. */
  onEdit?: (hint: EditHint) => void;
  /** הפעולה הראשית בתחתית (בבחירת בקשה: «הוספה ל{שם}»). */
  primary?: { label: string; onClick: () => void; disabled?: boolean };
  /** «טיוטה — לא נשמר» וכד'. */
  badge?: string;
}) {
  // ‼ מחסנית: «התהליך» פותח בקשה מתוכו ו«‹ חזרה לתהליך» חוזר. הבחירה נשמרת לכל רמה.
  const [stack, setStack] = useState<{ target: PreviewTarget; sel: Selection }[]>(() => {
    const v = viewOf(target);
    return [{ target, sel: { ...v.defaults, ...selection } }];
  });
  const cur = stack[stack.length - 1];
  const view = useMemo(() => viewOf(cur.target), [cur.target]);
  const axes = view.axes(cur.sel);
  const request = useMemo(() => view.build(cur.sel), [view, cur.sel]);
  const { state, retry } = useSampleData(request);
  const [tab, setTab] = useState<Tab>('page');
  const [linked, setLinked] = useState<LinkedKey | null>(null);

  useEffect(() => { setTab('page'); setLinked(null); }, [cur.target]);

  // ‼ בלי תופעת לוואי בתוך פונקציית העדכון (StrictMode מריץ אותה פעמיים, והדיווח להורה בזמן רינדור הוא שגיאה).
  const setSel = (key: string, value: string) => {
    const nextSel = { ...cur.sel, [key]: value };
    setStack(s => s.map((x, i) => (i === s.length - 1 ? { ...x, sel: nextSel } : x)));
    if (stack.length === 1) onSelectionChange?.(nextSel);
  };

  const data = state.phase === 'ready' ? state.data : null;
  const hooks = useMemo(() => ({
    onOpenLinked: (kind: PortalLinkedKind) => {
      const k = LINKED_OF_PORTAL_KIND[kind];
      if (k) { setLinked(k); setTab('linked'); }
    },
  }), []);

  const problems = (data?.specs ?? []).map(specProblemText).filter((x): x is string => !!x);
  const hasItems = (data?.items.length ?? 0) > 0;
  const docsRelevant = view.meta.docs.length > 0 || (data?.items ?? []).some(i => (i.resources?.length ?? 0) > 0 || (i.checklist?.length ?? 0) > 0);
  const tabs: { value: Tab; label: string }[] = [
    { value: 'page', label: 'בדף הלקוח' },
    ...(view.meta.mails.length ? [{ value: 'mail' as const, label: 'במייל' }] : []),
    ...(docsRelevant ? [{ value: 'docs' as const, label: 'מסמכים' }] : []),
    ...(view.meta.linked ? [{ value: 'linked' as const, label: 'המסך שנפתח' }] : []),
  ];
  const activeTab = tabs.some(t => t.value === tab) ? tab : 'page';
  const nested = stack.length > 1;
  const groupTitle = target.kind === 'group' ? REQUEST_GROUPS[target.group].title : '';
  const edit = view.meta.editAt;
  const couple = cur.sel.persona === 'couple';

  const openKid = (stepType: string) => {
    if (target.kind !== 'group') return;
    const m = REQUEST_GROUPS[target.group].members.find(x => x.stepType === stepType);
    const kid: PreviewTarget = { kind: 'system', stepType, name: m?.title ?? stepType };
    // ‼ הבקשה בתוך התהליך נפתחת באותו אדם ובאותו רגע — אותו זוג/יחיד.
    setStack(s => [...s, { target: kid, sel: { ...viewOf(kid).defaults, ...(cur.sel.persona ? { persona: cur.sel.persona } : {}) } }]);
  };

  const pageBody = (() => {
    if (state.phase === 'loading') return <div className="rp-skel" aria-busy="true" data-testid="rp-loading"><span /><span /><span /></div>;
    if (state.phase === 'error') {
      return (
        <div className="rp-problem" role="alert" data-testid="rp-error">
          <p>{state.message}</p>
          <button type="button" className="btn btn-secondary btn-sm" onClick={retry}>נסו שוב</button>
        </div>
      );
    }
    if (!hasItems) {
      return (
        <div className="rp-problem" data-testid="rp-nothing">
          <p>{problems[0] ?? view.meta.why ?? 'הלקוח לא רואה את הבקשה הזאת בדף.'}</p>
        </div>
      );
    }
    return (
      <>
        {view.meta.why && view.meta.clientSees !== 'page' && <p className="rp-hint">{view.meta.why}</p>}
        {problems.length > 0 && problems.map(p => <p key={p} className="rp-hint rp-warn">{p}</p>)}
        <div className="rp-page pivo-light" data-testid="rp-page">
          <PortalView data={state.data} mode="sample" embed sampleHooks={hooks} />
        </div>
      </>
    );
  })();

  return (
    <FlSheet
      wide
      title={<>צפייה · {cur.target.name}</>}
      sub={nested ? `בתוך «${groupTitle}»` : view.meta.clientSees === 'nothing' ? 'הלקוח לא רואה אותה' : 'כך הלקוח מקבל אותה'}
      onClose={onClose}
      foot={(
        <>
          {primary && <button type="button" className="btn btn-primary" onClick={primary.onClick} disabled={primary.disabled}>{primary.label}</button>}
          {edit.kind === 'none'
            ? <span className="rp-foot-why">{edit.why}</span>
            : onEdit && editLabel(edit) && edit.kind !== 'addDialog'
              ? <button type="button" className="btn btn-secondary" onClick={() => onEdit(edit)}>{editLabel(edit)}</button> : null}
          <span className="fl-spacer" />
          <button type="button" className="btn btn-ghost" onClick={onClose}>סגירה</button>
        </>
      )}
    >
      <div className="rp-body" data-testid="rp-sheet" data-target={cur.target.kind}>
        {nested && (
          <button type="button" className="rp-back" onClick={() => setStack(s => s.slice(0, -1))}>‹ חזרה לתהליך</button>
        )}
        <div className="rp-tags">
          <span className="rp-badge" data-testid="rp-sample-badge">דוגמה — לא לקוח אמיתי</span>
          {badge && <span className="rp-badge is-draft">{badge}</span>}
        </div>
        {tabs.length > 1 && (
          <FlSeg label="מה לראות" value={activeTab} onChange={setTab}
            options={tabs.map(t => ({ value: t.value, label: t.label }))} />
        )}
        {activeTab === 'page' && axes.length > 0 && (
          <div className="rp-axes" data-testid="rp-axes">
            {axes.map(a => (
              <AxisChips key={a.key} axis={a} value={a.options.some(o => o.key === cur.sel[a.key]) ? cur.sel[a.key] : a.options[0].key}
                onChange={v => setSel(a.key, v)} />
            ))}
          </div>
        )}
        {view.notes(cur.sel).map(n => <p key={n} className="rp-hint">{n}</p>)}
        {activeTab === 'page' && (
          <>
            <p className="rp-lead">מה הלקוח רואה בדף שלו.</p>
            {pageBody}
            {cur.target.kind === 'group' && !nested && <ProcessList group={cur.target.group} data={data} onOpen={openKid} />}
          </>
        )}
        {activeTab === 'mail' && (
          <MailPreview mails={view.meta.mails} data={data} name={cur.target.name} profile={profile}
            onEditMail={onEdit ? (focus => onEdit({ kind: 'emails', focus, label: '' })) : undefined} />
        )}
        {activeTab === 'docs' && <DocsPreview data={data} docs={view.meta.docs} />}
        {activeTab === 'linked' && view.meta.linked && <LinkedPagePreview kind={linked ?? view.meta.linked} couple={couple} data={data} profile={profile} />}
      </div>
    </FlSheet>
  );
}

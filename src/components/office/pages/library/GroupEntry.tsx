// ─── בקשה מורכבת בספרייה — קבוצה קבועה עם הבקשות שבה (05.10.2026) ──────────
// ‼ אותה קבוצה כמו בתיק הלקוח ובדף האישי (features/requests/requestGroups). לכל
// בקשה שורה משלה: מה היא, מי עושה, ופעולה אחת — עריכה כשיש מה לערוך כאן, אחרת
// «מתי נפתחת?» אל כלל הפתיחה. בקשת מערכת שהנוסח שלה קבוע אומרת זאת, לא מסתתרת.
import { useState } from 'react';
import { GROUP_ACTOR_LABEL, REQUEST_GROUPS, type RequestGroupKey, type GroupActor } from '../../../../features/requests/requestGroups';

export interface GroupChildModel {
  key: string;
  title: string;
  hint: string;
  actor: GroupActor;
  /** מתי נפתחת — מכלל הפתיחה, או «נפתחת יחד עם …». */
  when?: string | null;
  action?: { label: string; onClick: () => void; aria?: string } | null;
}

export default function GroupEntry({ groupKey, kids, onRules, rowId, highlight, defaultOpen }: {
  groupKey: RequestGroupKey;
  kids: GroupChildModel[];
  onRules?: () => void;
  rowId: string;
  highlight?: boolean;
  defaultOpen?: boolean;
}) {
  const g = REQUEST_GROUPS[groupKey];
  const [open, setOpen] = useState(!!defaultOpen);
  return (
    <section id={rowId} className={`rg-group lb-group-card${highlight ? ' is-focus' : ''}`} data-open={open ? 'true' : 'false'}
      data-group={groupKey} aria-label={g.title}>
      <button type="button" className="rg-head" aria-expanded={open} onClick={() => setOpen(o => !o)}>
        <span className="rg-namecol">
          <span className="rg-name">{g.title}</span>
          <span className="rg-hint">קבוצה קבועה · {kids.length} בקשות קשורות · {g.summary}</span>
        </span>
        <span className="rg-tag is-mine">בקשה מורכבת</span>
        <span className="rg-chev" aria-hidden="true">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9" /></svg>
        </span>
      </button>
      {open && (
        <>
          <div className="rg-kids">
            {kids.map(k => (
              <div key={k.key} className="lb-kid" data-kid={k.key}>
                <span className="lb-kid-main">
                  <span className="lb-kid-name">{k.title}</span>
                  <span className="lb-kid-hint">{[k.hint, k.when].filter(Boolean).join(' · ')}</span>
                </span>
                <span className="lb-kid-actor">{GROUP_ACTOR_LABEL[k.actor]}</span>
                {k.action ? (
                  <button type="button" className="btn btn-secondary btn-sm lb-kid-act" aria-label={k.action.aria ?? `${k.action.label}: ${k.title}`}
                    onClick={k.action.onClick}>{k.action.label}</button>
                ) : <span className="lb-kid-act" aria-hidden="true" />}
              </div>
            ))}
          </div>
          <div className="rg-foot">
            {g.note && <span>{g.note}</span>}
            <span>כל בקשה בקבוצה נשארת בה אצל הלקוח, עם אחראי, מצב והיסטוריה משלה.</span>
            {onRules && <button type="button" className="of-link" onClick={onRules}>מתי פותחים את הקבוצה? ←</button>}
          </div>
        </>
      )}
    </section>
  );
}

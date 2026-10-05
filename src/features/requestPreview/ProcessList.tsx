// ─── בקשה מורכבת = «התהליך» — הבקשות שבקבוצה לפי הסדר, ו«צפייה» לכל אחת ──────────────
// ‼ אין כרטיסים כפולים: הקבוצה כפי שהלקוח רואה אותה — ב-PortalView שמעל; כאן רק מי עושה, מה הלקוח רואה, ופנייה פנימה.
// «מתי פותחים» ו«מי עושה» — מאותו מקור שהספרייה משתמשת בו (REQUEST_GROUPS).

import { GROUP_ACTOR_LABEL, REQUEST_GROUPS, type RequestGroupKey } from '../requests/requestGroups';
import type { PreviewData, PreviewSpec } from './types';

const BUCKET_TEXT: Record<string, string> = {
  action: 'ממתין ללקוח', office: 'בטיפול המשרד', future: 'בהמשך', done: 'הושלם',
};

export default function ProcessList({ group, data, onOpen }: {
  group: RequestGroupKey;
  data: PreviewData | null;
  onOpen: (stepType: string) => void;
}) {
  const g = REQUEST_GROUPS[group];
  const specs = data?.specs ?? [];
  const specOf = (stepType: string): PreviewSpec | undefined => specs.find(s => s.stepType === stepType);
  const seen = (s: PreviewSpec | undefined): string => {
    if (!s || !s.ok) return 'לא נוצרת';
    const keys = s.itemKeys ?? [];
    const item = (data?.items ?? []).find(i => keys.includes(i.key));
    if (!item) return 'הלקוח לא רואה כלום';
    return `הלקוח רואה: ${BUCKET_TEXT[item.bucket] ?? item.bucket}`;
  };
  return (
    <section className="rp-process" data-testid="rp-process" aria-label="הבקשות בתהליך">
      <h3 className="rp-h">הבקשות בתהליך, לפי הסדר</h3>
      <ol className="rp-process-list">
        {g.members.map((m, i) => (
          <li key={m.stepType} data-kid={m.stepType}>
            <span className="rp-process-n" aria-hidden="true">{i + 1}</span>
            <span className="rp-process-main">
              <span className="rp-process-name">{m.title}</span>
              <span className="rp-process-sub">{[GROUP_ACTOR_LABEL[m.actor], seen(specOf(m.stepType)), m.when].filter(Boolean).join(' · ')}</span>
            </span>
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => onOpen(m.stepType)} aria-label={`צפייה: ${m.title}`}>צפייה</button>
          </li>
        ))}
      </ol>
    </section>
  );
}

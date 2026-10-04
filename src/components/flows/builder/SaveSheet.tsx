// אישור שמירה: מה השתנה, במילים, ועל מי זה חל.
// ‼ שמירה = גרסה חדשה, ללקוחות חדשים בלבד. מי שבאמצע ממשיך בגרסה שלו, ומתעדכן
// רק כשמאשרים אצלו «לעדכן?» בכרטיס — ההיסטוריה נשמרת.
import { useState } from 'react';
import { flowDiff } from '../../../features/flows/preview';
import type { FlowDefinition, FlowItem } from '../../../features/flows/types';
import { FlSheet } from './ui';
import { runsText } from './model';

export default function SaveSheet({ saved, draft, savedName, draftName, title, runsByVersion, currentVersion, onboarding,
  saving, error, onConfirm, onReload, onClose }: {
  saved: FlowDefinition;
  draft: FlowDefinition;
  savedName: string;
  draftName: string;
  title: (i: FlowItem) => string;
  runsByVersion?: Record<string, number>;
  currentVersion: number;
  onboarding: boolean;
  saving: boolean;
  error: string | null;
  onConfirm: (note: string) => void;
  /** כשמישהו שמר בינתיים: טעינה מחדש של הגרסה השמורה, והשינויים כאן נמחקים. */
  onReload?: () => void;
  onClose: () => void;
}) {
  const [note, setNote] = useState('');
  const d = flowDiff(saved, draft);
  const itemsOf = (def: FlowDefinition) => new Map(def.stages.flatMap(s => s.items.map(i => [i.key, { i, s }] as const)));
  const a = itemsOf(saved), b = itemsOf(draft);
  const stageName = (def: FlowDefinition, k: string) => def.stages.find(s => s.key === k)?.name ?? '';
  const lines: string[] = [
    ...(savedName.trim() !== draftName.trim() ? [`שם: «${savedName}» ← «${draftName.trim()}»`] : []),
    ...d.stagesAdded.map(k => `שלב חדש: «${stageName(draft, k)}»`),
    ...d.stagesRemoved.map(k => `הוסר שלב: «${stageName(saved, k)}»`),
    ...d.stageChanged.map(k => `שונו הגדרות השלב «${stageName(draft, k)}»`),
    ...d.added.map(k => { const x = b.get(k)!; return `נוסף: «${title(x.i)}» (ב«${x.s.name}»)`; }),
    ...d.removed.map(k => { const x = a.get(k)!; return `הוסר: «${title(x.i)}»`; }),
    ...d.changed.map(k => {
      const x = b.get(k)!, y = a.get(k)!;
      return x.s.key !== y.s.key ? `«${title(x.i)}» עבר ל«${x.s.name}»` : `שונה: «${title(x.i)}»`;
    }),
  ];

  return (
    <FlSheet title={`שמירה כגרסה ${currentVersion + 1}`} onClose={onClose}
      foot={<>
        <button type="button" className="btn btn-secondary" onClick={onClose} disabled={saving}>חזרה לעריכה</button>
        <span className="fl-spacer" />
        <button type="button" className="btn btn-primary" onClick={() => onConfirm(note)} disabled={saving}>
          {saving ? 'שומר…' : 'שמירה'}
        </button>
      </>}>
      <h3 className="fl-cap">מה השתנה</h3>
      {lines.length === 0 ? <p className="fl-sub">אין שינוי בתוכן.</p> : (
        <ul className="fl-diff">{lines.map((l, i) => <li key={i}>{l}</li>)}</ul>
      )}
      <p className="fl-note">{runsText(runsByVersion, currentVersion)}</p>
      {onboarding && <p className="fl-hint">מסלול הקליטה: יחד איתו מתעדכן מה שכל לקוח חדש או חוזר מקבל באישור ההצעה, לפי סוג הלקוח.</p>}
      <label className="fl-field">
        <span>הערה לגרסה (לא חובה)</span>
        <input value={note} onChange={e => setNote(e.target.value)} placeholder="למשל: נוסף מדריך הוצאות" maxLength={200} />
      </label>
      {error && <div className="of-error-box" role="alert">{error}</div>}
      {onReload && (
        <button type="button" className="btn btn-sm btn-secondary fl-reload" onClick={onReload}>
          טעינה מחדש של הגרסה השמורה (השינויים כאן יימחקו)
        </button>
      )}
    </FlSheet>
  );
}

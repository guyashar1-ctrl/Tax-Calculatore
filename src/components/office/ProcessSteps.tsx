// «איך זה עובד» — השלבים של תהליך אחד, בהקשר של הבקשה שפתוחה (סבב 3, 1.10.2026).
// ‼ החליף את העמוד הנפרד «איך התהליכים עובדים»: ההסבר מופיע ליד הבקשה שהוא
// מסביר, ולא בעמוד שצריך לעבור אליו ולזכור ממנו. התוכן עצמו לא השתנה — הוא
// נקרא מאותו קטלוג (lib/processCatalog.ts), שהבדיקות שלו נשארות במקומן.
import { useMemo } from 'react';
import { PROCESS_CATALOG, processByKey } from '../../lib/processCatalog';
import { ACTOR_LABELS, numberStages, type ProcessDefinition } from '../../lib/processDefinition';

/** התהליך שבקשה בברירת המחדל שייכת אליו — לפי המפתח של בקשת משרד, אחרת לפי סוג השלב. */
export function processForEntry(stepType: string, officeKey?: string): ProcessDefinition | undefined {
  if (officeKey === 'authority_debit') return processByKey('bank_debit');
  if (officeKey === 'send_document') return processByKey('send_document');
  if (officeKey) return processByKey('custom_request');
  return PROCESS_CATALOG.find(p => p.group !== 'journey' && p.stages.some(s => s.stepType === stepType))
    ?? PROCESS_CATALOG.find(p => p.stages.some(s => s.stepType === stepType));
}

export default function ProcessSteps({ def }: { def: ProcessDefinition }) {
  const numbered = useMemo(() => numberStages(def.stages), [def]);
  const single = def.stages.length === 1;
  return (
    <div className="of-steps">
      <ol className="of-steps-list">
        {numbered.map(({ stage, n }) => (
          <li key={stage.key} className={`of-step${stage.parallel ? ' is-parallel' : ''}`}>
            {!single && <span className="of-step-n" aria-hidden="true">{n ?? '∥'}</span>}
            <div className="of-step-main">
              <div className="of-step-title">
                {stage.title}
                <span className="of-step-actor">{ACTOR_LABELS[stage.actor]}</span>
                {stage.kind === 'conditional' && <span className="of-step-actor">מותנה</span>}
              </div>
              <div className="of-step-what">{stage.when ? `${stage.when} ` : ''}{stage.what}</div>
            </div>
          </li>
        ))}
      </ol>
      <div className="of-step-done"><b>הסיום:</b> {def.completion}</div>
    </div>
  );
}

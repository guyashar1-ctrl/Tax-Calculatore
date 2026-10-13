// «איך זה עובד» — השלבים של תהליך אחד, בהקשר של הבקשה שפתוחה (סבב 3, 1.10.2026).
// ‼ החליף את העמוד הנפרד «איך התהליכים עובדים»: ההסבר מופיע ליד הבקשה שהוא
// מסביר, ולא בעמוד שצריך לעבור אליו ולזכור ממנו. התוכן עצמו לא השתנה — הוא
// נקרא מאותו קטלוג (lib/processCatalog.ts), שהבדיקות שלו נשארות במקומן.
// ‼ 11.10.2026: `manual` — לכל שלב גם «ביד»: מה מכינים, מה שואלים, מסמכים, צעדים,
// מה בודקים, מי מאשר, מה יוצא ומה נחשב ראיה. כדי לעבוד לפי המערכת גם בלי חיבורים.
import { useMemo, type ReactNode } from 'react';
import { PROCESS_CATALOG, processByKey } from '../../lib/processCatalog';
import { ACTOR_LABELS, numberStages, type ManualHow, type ProcessDefinition } from '../../lib/processDefinition';

/** התהליך שבקשה בברירת המחדל שייכת אליו — לפי המפתח של בקשת משרד, אחרת לפי סוג השלב. */
export function processForEntry(stepType: string, officeKey?: string): ProcessDefinition | undefined {
  if (officeKey === 'authority_debit') return processByKey('bank_debit');
  if (officeKey === 'send_document') return processByKey('send_document');
  if (officeKey) return processByKey('custom_request');
  return PROCESS_CATALOG.find(p => p.group !== 'journey' && p.stages.some(s => s.stepType === stepType))
    ?? PROCESS_CATALOG.find(p => p.stages.some(s => s.stepType === stepType));
}

function ManualBlock({ m }: { m: ManualHow }) {
  const rows: [string, ReactNode][] = [];
  if (m.prepare?.length) rows.push(['מה מכינים', <ul>{m.prepare.map(x => <li key={x}>{x}</li>)}</ul>]);
  if (m.ask?.length) rows.push(['מה שואלים ולמה', <ul>{m.ask.map(x => <li key={x.q}><b>{x.q}</b> — {x.why}</li>)}</ul>]);
  if (m.documents?.length) rows.push(['מסמכים וטפסים', <ul>{m.documents.map(x => <li key={x}>{x}</li>)}</ul>]);
  if (m.steps?.length) rows.push(['איך עושים', <ol>{m.steps.map(x => <li key={x}>{x}</li>)}</ol>]);
  if (m.check) rows.push(['מה בודקים', m.check]);
  if (m.approver) rows.push(['מי מאשר', ACTOR_LABELS[m.approver]]);
  if (m.output) rows.push(['מה יוצא מהשלב', m.output]);
  if (m.evidence) rows.push(['מה נחשב ראיה', m.evidence]);
  return <dl className="of-manual">{rows.map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}</dl>;
}

export default function ProcessSteps({ def, manual = false, onOpenQuestionnaire }: {
  def: ProcessDefinition;
  /** להציג לכל שלב גם איך עושים אותו ביד. */
  manual?: boolean;
  /** פותח את השאלון המלא של התהליך (כשיש לו). */
  onOpenQuestionnaire?: () => void;
}) {
  const numbered = useMemo(() => numberStages(def.stages), [def]);
  const single = def.stages.length === 1;
  return (
    <div className="of-steps">
      {manual && (
        <div className="of-manual-head">
          <div><b>מתי מתחילים:</b> {def.trigger}</div>
          {def.manualPrepare?.length ? <div><b>מה מכינים מראש:</b><ul>{def.manualPrepare.map(x => <li key={x}>{x}</li>)}</ul></div> : null}
          {def.questionnaire && onOpenQuestionnaire && (
            <div><button type="button" className="btn btn-secondary btn-sm" onClick={onOpenQuestionnaire}>השאלון המלא וההסתעפויות</button></div>
          )}
        </div>
      )}
      <ol className="of-steps-list">
        {numbered.map(({ stage, n }) => (
          <li key={stage.key} className={`of-step${stage.parallel ? ' is-parallel' : ''}`}>
            {!single && <span className="of-step-n" aria-hidden="true">{n ?? '∥'}</span>}
            <div className="of-step-main">
              <div className="of-step-title">
                {stage.title}
                <span className="of-step-actor">{ACTOR_LABELS[stage.actor]}</span>
                {stage.kind === 'conditional' && <span className="of-step-actor">מותנה</span>}
                {stage.manualOnly && <span className="of-step-actor is-manual">ביד — עדיין לא במערכת</span>}
              </div>
              <div className="of-step-what">{stage.when ? `${stage.when} ` : ''}{stage.what}</div>
              {manual && stage.done && <div className="of-step-what"><b>הושלם כש:</b> {stage.done}</div>}
              {manual && stage.manual && (
                <details className="of-manual-wrap">
                  <summary>איך עושים את זה ביד</summary>
                  <ManualBlock m={stage.manual} />
                </details>
              )}
            </div>
          </li>
        ))}
      </ol>
      <div className="of-step-done"><b>הסיום:</b> {def.completion}</div>
    </div>
  );
}

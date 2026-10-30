// ─── הכפתור בשורה של נקודת אוטומציה (313) ───────────────────────────────────────
// ‼ אותו כפתור ורוד ואותו שער חיבור כמו בתיק המס (AuthorityCheckButton): לא מחובר ⇒ הלחיצה
// פותחת את ההתחברות וממשיכה לבד. בזמן ריצה — הטקסט בוורוד במקום הכפתור. כשהריצה הצליחה
// השרת כבר סגר את הנקודה; onDone מרענן את הרשימה כדי שתראה ירוק.
import { useEffect, useRef } from 'react';
import type { Client } from '../../types';
import { OPEN_AUTOMATION_STATUSES } from '../../types/automation';
import { useAutomationJob } from '../../hooks/useAutomationJobs';
import { AuthorityCheckButton } from '../../components/clientTabs/AuthorityCheckPanel';
import { automationStepInput, type AutomationStepAction } from './automationSteps';

export default function AutomationStepButton({ action, client, spouseClient, onDone }: {
  action: AutomationStepAction; client: Client; spouseClient?: Client; onDone?: () => void;
}) {
  const job = useAutomationJob(client.id || undefined, action.type);
  const open = !!job.job && OPEN_AUTOMATION_STATUSES.has(job.job.status) && job.job.status !== 'needs_human';
  const wasOpen = useRef(open);
  useEffect(() => {
    if (wasOpen.current && !open && job.job?.status === 'succeeded') onDone?.();
    wasOpen.current = open;
  }, [open, job.job?.status, onDone]);

  if (open) return <span className="rl-auto-run" role="status">{action.runText}</span>;
  const inp = automationStepInput(action, client, spouseClient);
  return (
    <AuthorityCheckButton label={action.act} capability={action.capability} running={job.busy}
      inputBlockedReason={'blocked' in inp ? inp.blocked : null}
      onRun={() => { if ('input' in inp) void job.run(inp.input); }} />
  );
}

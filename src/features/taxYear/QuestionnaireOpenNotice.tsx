// 263 · «יש ל{שם} שאלון פתוח: «{כותרת}» — קודם מסיימים אותו» — אותו נוסח ואותו קישור בכל נקודת כניסה.
import { questionnaireOpenText, type OpenQuestionnaire } from './oneQuestionnaire';
import './taxYear.css';

interface Props {
  open: OpenQuestionnaire;
  firstName?: string;
  /** פותח את השורה של השאלון הפתוח ב«בקשות». בלי — רק הנוסח. */
  onOpen?: (stepId: string) => void;
}

export default function QuestionnaireOpenNotice({ open, firstName, onOpen }: Props) {
  return (
    <div className="ty-qopen" role="alert" data-questionnaire-open={open.stepId}>
      <span>{questionnaireOpenText(firstName, open)}.</span>
      {onOpen && <button type="button" className="btn btn-sm btn-ghost" onClick={() => onOpen(open.stepId)} data-questionnaire-open-go>לבקשה ←</button>}
    </div>
  );
}

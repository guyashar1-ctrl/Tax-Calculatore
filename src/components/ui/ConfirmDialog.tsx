/**
 * דיאלוג אישור · אפיון §3.12.
 * המשפט תמיד נוקב בשם הדבר שעומד להימחק, והכפתור נושא את הפועל עצמו —
 * לא "אישור". הפוקוס נוחת על "ביטול", כדי ש-Enter מהיר לא ימחק כלום.
 */
import { ReactNode } from 'react';
import Modal from './Modal';

interface Props {
  title: string;
  message: ReactNode;
  /** הפועל עצמו — "מחיקה", "בטל שינויים", "סגור דוח" */
  confirmLabel: string;
  cancelLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
  tone?: 'danger' | 'normal';
}

export default function ConfirmDialog({
  title, message, confirmLabel, cancelLabel = 'ביטול', onConfirm, onCancel, tone = 'danger',
}: Props) {
  return (
    <Modal
      title={title}
      onClose={onCancel}
      width={420}
      footer={
        <>
          <button type="button" className="ui-btn ui-btn-ghost" onClick={onCancel} data-autofocus>
            {cancelLabel}
          </button>
          <button
            type="button"
            className={`ui-btn ${tone === 'danger' ? 'ui-btn-danger' : 'ui-btn-primary'}`}
            onClick={onConfirm}
          >
            {confirmLabel}
          </button>
        </>
      }
    >
      {/* div ולא p: ההודעה עשויה להיות רשימת פריטים (InfoLines), ורשימה בתוך p נשברת */}
      <div className="ui-confirm-text">{message}</div>
    </Modal>
  );
}

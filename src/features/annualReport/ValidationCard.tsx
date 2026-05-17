// ─── רכיב שאלה במצב Validation — מציג preview של נתוני הכרטיס + 3 פעולות ─────
//
// מופיע במקום QuestionCard עבור שאלות שמסומנות validationMode בעץ ההחלטות,
// כאשר יש בכרטיס הלקוח נתונים מלאים מספיק כדי לגזור תשובה אוטומטית.

import { useState } from 'react';
import type { Client } from '../../types';
import type { QuestionNode, QuestionPreviewItem, AnswerValue } from './types';
import CardSectionEditor from './CardSectionEditor';

interface Props {
  node: QuestionNode;
  previewItems: QuestionPreviewItem[];
  client: Client | null | undefined;
  derivedAnswer: AnswerValue;
  disabled: boolean;
  onConfirm: () => void;                                       // משתמש לוחץ "מאשר ונכון"
  onIrrelevant: () => void;                                    // משתמש לוחץ "לא רלוונטי השנה"
  onPatchClient: (partial: Partial<Client>) => Promise<void>;  // עדכון הכרטיס מתוך ה-modal
}

export default function ValidationCard({
  node, previewItems, client, derivedAnswer, disabled,
  onConfirm, onIrrelevant, onPatchClient,
}: Props) {
  const [editorOpen, setEditorOpen] = useState(false);

  const canEdit = !!client && !!node.editTarget;

  return (
    <div>
      <h3 style={{ margin: 0, fontSize: '1.15rem', lineHeight: 1.5 }}>{node.question}</h3>
      {node.helpText && (
        <p style={{ marginTop: '.5rem', marginBottom: 0, color: 'var(--gray-600)', fontSize: '.9rem', lineHeight: 1.5 }}>
          {node.helpText}
        </p>
      )}

      <ValidationPreview items={previewItems} derivedAnswer={derivedAnswer} questionType={node.type} />

      <div style={{ marginTop: '1.25rem', display: 'flex', flexDirection: 'column', gap: '.5rem' }}>
        <button
          type="button"
          className="btn btn-primary btn-lg"
          onClick={onConfirm}
          disabled={disabled}
          style={{ background: '#16a34a' }}
        >
          ✓ מאשר ונכון, המשך
        </button>

        {canEdit && (
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => setEditorOpen(true)}
            disabled={disabled}
          >
            ✏ ערוך בכרטיס
          </button>
        )}

        <button
          type="button"
          className="btn btn-ghost"
          onClick={onIrrelevant}
          disabled={disabled}
          style={{ color: 'var(--gray-600)' }}
        >
          ⊘ לא רלוונטי השנה
        </button>
      </div>

      {editorOpen && client && node.editTarget && (
        <CardSectionEditor
          client={client}
          editTarget={node.editTarget}
          onPatchClient={onPatchClient}
          onClose={() => setEditorOpen(false)}
        />
      )}
    </div>
  );
}

// ─── תצוגת preview עם הסבר על מה ייכנס לתשובה ─────────────────────────────

function ValidationPreview({
  items, derivedAnswer, questionType,
}: {
  items: QuestionPreviewItem[];
  derivedAnswer: AnswerValue;
  questionType: QuestionNode['type'];
}) {
  return (
    <div
      style={{
        background: '#ecfdf5',
        border: '1px solid #86efac',
        borderRadius: 8,
        padding: '1rem',
        marginTop: '1.25rem',
      }}
    >
      <div style={{ fontWeight: 600, fontSize: '.9rem', color: '#065f46', marginBottom: '.6rem' }}>
        📇 הנתונים הקיימים בכרטיס הלקוח
      </div>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <tbody>
          {items.map((item, i) => (
            <tr key={i} style={{ borderTop: i === 0 ? 'none' : '1px solid #d1fae5' }}>
              <td style={{ padding: '.4rem 0', color: '#047857', width: '35%', fontSize: '.9rem' }}>
                {item.label}
              </td>
              <td style={{ padding: '.4rem 0', fontWeight: 500 }}>
                {item.missing ? (
                  <span style={{ color: '#92400e', fontStyle: 'italic' }}>(לא הוזן)</span>
                ) : (
                  item.value
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <div style={{ marginTop: '.85rem', padding: '.5rem .75rem', background: 'white', borderRadius: 6, fontSize: '.85rem' }}>
        <span style={{ color: 'var(--gray-600)' }}>אם תאשר, התשובה תהיה: </span>
        <strong style={{ color: '#065f46' }}>{formatAnswer(derivedAnswer, questionType)}</strong>
      </div>
    </div>
  );
}

function formatAnswer(a: AnswerValue, type: QuestionNode['type']): string {
  if (a === null || a === undefined) return '(ריק)';
  if (type === 'boolean') return a === true ? 'כן' : 'לא';
  if (type === 'number') return typeof a === 'number' ? a.toLocaleString('he-IL') : String(a);
  if (Array.isArray(a)) return a.join(', ');
  return String(a);
}

// ─── «מצורף ללקוח» — מה שבקשה מהספרייה נושאת ללקוח ושהמשרד לא רואה בשדות ──────
// ההסבר (clientNote / clientNoteAfter / clientRefs) והמדריך המצולם (clientPhotoGuide) נכתבים בנוסח
// המוכן בספרייה ועוברים לבקשה כמו שהם — אבל אינם שדות שהקומפוזר או העורך מציגים. בלי השורה הזאת
// המשרד היה שולח ללקוח דבר שהוא לא רואה. «הצגה» פותחת את המדריך בקריאה בלבד (הקישורים אינרטיים).
import { useState } from 'react';
import PhotoGuideDialog from './PhotoGuideDialog';
import { photoGuideFor, type PhotoGuideDef } from './photoGuides';
import { hasCarryValue } from '../../lib/requestTemplates';

export interface TemplateCarryParts {
  /** יש הסבר שנפתח עם הבקשה בדף. */
  explanation: boolean;
  /** מדריך מצולם מוכר (מפתח לא מוכר ⇒ null — הדף לא יציג מדריך, ולכן גם לא נאמר כאן). */
  guide: PhotoGuideDef | null;
}

export function templateCarryParts(content: Record<string, unknown> | null | undefined): TemplateCarryParts {
  const c = content ?? {};
  return {
    explanation: hasCarryValue('clientNote', c.clientNote) || hasCarryValue('clientNoteAfter', c.clientNoteAfter)
      || hasCarryValue('clientRefs', c.clientRefs),
    guide: photoGuideFor(c.clientPhotoGuide),
  };
}

/** «מצורף ללקוח: הסבר · מדריך מצולם (6 צעדים)» — null כשאין מה לומר. */
export function templateCarryText(parts: TemplateCarryParts, lead = 'מצורף ללקוח:'): string | null {
  const bits = [
    parts.explanation ? 'הסבר' : null,
    parts.guide ? `מדריך מצולם (${parts.guide.steps.length} צעדים)` : null,
  ].filter((x): x is string => !!x);
  return bits.length ? `${lead} ${bits.join(' · ')}` : null;
}

export default function TemplateCarryNote({ content, lead }: {
  content: Record<string, unknown> | null | undefined;
  /** ברירת מחדל «מצורף ללקוח:». בקומפוזר — «מצורף ללקוח מהספרייה:». */
  lead?: string;
}) {
  const [open, setOpen] = useState(false);
  const parts = templateCarryParts(content);
  const text = templateCarryText(parts, lead);
  if (!text) return null;
  return (
    <div data-testid="template-carry-note" style={{
      display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '.15rem .6rem',
      fontSize: 'var(--fs-12)', color: 'var(--ink-3)', lineHeight: 1.6,
    }}>
      <span>{text}</span>
      {parts.guide && (
        <button type="button" className="btn btn-sm btn-ghost" onClick={() => setOpen(true)}>הצגה</button>
      )}
      {open && parts.guide && <PhotoGuideDialog guide={parts.guide} onClose={() => setOpen(false)} entryInert />}
    </div>
  );
}

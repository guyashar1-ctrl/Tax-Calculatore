// ─── מדריך מצולם מהרישום — נקודת חיבור אחת ───────────────────────────────────
// הדף האישי, הקומפוזר בכרטיס הלקוח ועורך הבקשה בספרייה פותחים את אותו מדריך, מאותה הגדרה ב-photoGuides.ts.
import { useCallback } from 'react';
import PhotoGuide from './PhotoGuide';
import { photoGuideImageUrl, type PhotoGuideDef } from './photoGuides';

export default function PhotoGuideDialog({ guide, onClose, accent, entryInert }: {
  guide: PhotoGuideDef;
  onClose: () => void;
  /** צבע המשרד בדף האישי; במשרד — ברירת המחדל. */
  accent?: string;
  /** תצוגה במשרד: הקישורים שבמדריך אינם פעילים (רק היעד מוצג). */
  entryInert?: boolean;
}) {
  const imageUrl = useCallback((i: number) => photoGuideImageUrl(guide, i), [guide]);
  return (
    <PhotoGuide onClose={onClose} accent={accent} kicker={guide.kicker} steps={guide.steps} imageUrl={imageUrl}
      entry={guide.entry} entryInert={entryInert} fine={guide.fine} />
  );
}

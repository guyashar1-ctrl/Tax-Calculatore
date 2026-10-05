// ─── «צפייה» מתוך יריעה של הבונה — המגירה נפתחת מעל היריעה ───────────────────────────────
// ‼ Esc סוגר רק את המגירה: FlSheet (ui.tsx) מגיב ל-Esc רק כשהוא החלון העליון — בלי זה שני המאזינים על window
//   היו סוגרים גם את היריעה המארחת (ואיתה את ההוספה/הפריט שבעבודה).
// ‼ הפוקוס חוזר ל«צפייה» שנלחץ (FlSheet שומר את מי שפתח), ומשם — ליריעה.

import { useState, type ReactNode } from 'react';
import type { FirmProfile } from '../../../types/firmProfile';
import RequestPreviewSheet from '../../../features/requestPreview/RequestPreviewSheet';
import type { EditHint } from '../../../features/requestPreview/registry';
import { targetKey, type PreviewTarget } from '../../../features/requestPreview/targets';
import { EMPTY_PROFILE } from './previewTarget';

export interface PreviewPrimary { label: string; onClick: () => void; disabled?: boolean }

export interface BuilderPreview {
  /** פותחת את המגירה על יעד; primary — הפעולה הראשית בתחתית (בבחירה: «הוספה ל…»). */
  open: (target: PreviewTarget, primary?: PreviewPrimary) => void;
  /** המגירה עצמה (או null) — מרנדרים אותה בתוך היריעה המארחת. */
  node: ReactNode;
}

export function useBuilderPreview(profile: FirmProfile | undefined, onEdit?: (hint: EditHint, close: () => void) => void): BuilderPreview {
  const [opened, setOpened] = useState<{ target: PreviewTarget; primary?: PreviewPrimary } | null>(null);
  const close = () => setOpened(null);

  return {
    open: (target, primary) => setOpened({ target, primary }),
    node: opened ? (
      <RequestPreviewSheet key={targetKey(opened.target)} target={opened.target} profile={profile ?? EMPTY_PROFILE}
        primary={opened.primary} onClose={close}
        onEdit={onEdit ? hint => onEdit(hint, close) : undefined} />
    ) : null,
  };
}

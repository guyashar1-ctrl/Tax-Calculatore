// ─── «צפייה» בבונה המסלולים — מפריט במסלול ליעד הצפייה ─────────────────────────────
// ‼ טהור. מפה אחת לכל מקום שבו פריט במסלול (או בקשה שמוסיפים לשלב) נפתח ב«צפייה»:
//   · בקשה מהספרייה  ← targetOfTemplate (העובדות שממנן נבחרים צירי המצב);
//   · מסמך מהספרייה ← {doc};  בקשת מערכת ← {system} — וכשיש לה שורה בספרייה («מסמכים מהלקוח») — השורה (ראה systemPreviewTarget);
//   · פעולה מול רשות ← null: אין לה כרטיס בדף של הלקוח (הלקוח לא רואה אותה), ולכן אין «צפייה».
// ‼ מי שקובע מה הלקוח רואה הוא השרת, לפי ההפניה (templateId / docId / stepType). מה שנגזר כאן הוא רק
//   השם והעובדות לצירי המצב — ולכן פריט שהבקשה שלו נמחקה מהספרייה נפתח עם «נמחק מהספרייה», לא ריק.

import { refersTo, type RequestTemplate } from '../../../lib/requestTemplates';
import type { FirmProfile } from '../../../types/firmProfile';
import type { FlowItem } from '../../../features/flows/types';
import { REQUEST_GROUPS, type RequestGroupKey } from '../../../features/requests/requestGroups';
import { targetOfTemplate, type PreviewTarget } from '../../../features/requestPreview/targets';
import { systemTypeOf } from '../../office/pages/library/libraryModel';

/**
 * פרופיל ריק — כשהמארח עוד לא העביר את פרופיל המשרד. ‼ משפיע רק על לשונית «במייל» (מיתוג ונוסח המשרד):
 * הדף עצמו נבנה בשרת. המארח שיש לו פרופיל מעביר אותו.
 */
export const EMPTY_PROFILE: FirmProfile = { id: '', branding: {}, communication: {}, settings: {} };

export interface ItemTargetCtx {
  /** בקשות הספרייה — כשהמארח מכיר אותן. בלעדיהן העובדות נגזרות מהעותק השמור בפריט (snapshot). */
  templates?: readonly RequestTemplate[] | null;
  title: (i: FlowItem) => string;
}

/** מה מצוייר בכלל: פריט במסלול, או קבוצה קבועה (פייפרלס · העברת טיפול · ייצוג) שמוצגת בכלל כשורה אחת. */
export type RuleSubject = { kind: 'item'; item: FlowItem } | { kind: 'group'; group: RequestGroupKey };

/** בקשה מהספרייה לפי הפריט: מהרשימה; ואם אינה שם — מהעותק השמור (השרת ממילא קורא את הספרייה). */
function templateOfItem(item: FlowItem, ctx: ItemTargetCtx): RequestTemplate | null {
  if (item.ref.kind !== 'template') return null;
  const id = item.ref.templateId;
  const found = (ctx.templates ?? []).find(t => refersTo(t, id));
  if (found) return found;
  const snap = item.snapshot;
  return {
    id, name: ctx.title(item), kind: 'request', officeId: null, seedKey: null,
    entries: snap ? [{ stepType: snap.stepType, payload: snap.payload ?? {} }] : [],
  };
}

/**
 * בקשת מערכת ← יעד. ‼ סוג שיש לו נוסח בספרייה («מסמכים מהלקוח») נפתח כשורה שבספרייה — אותה מגירה בדיוק, עם
 * הרשימה של המשרד. כבקשת מערכת «חשופה» הוא היה מצויר בלי הרשימה («להעלות 0 מסמכים»): את הרשימה כותב המחולל בקליטה.
 */
export function systemPreviewTarget(stepType: string, name: string, templates?: readonly RequestTemplate[] | null): PreviewTarget {
  const lib = (templates ?? []).find(t => systemTypeOf(t) === stepType);
  return lib ? targetOfTemplate(lib) : { kind: 'system', stepType, name };
}

export function previewTargetOfItem(item: FlowItem, ctx: ItemTargetCtx): PreviewTarget | null {
  const ref = item.ref;
  switch (ref.kind) {
    case 'template': {
      const t = templateOfItem(item, ctx);
      return t ? targetOfTemplate(t) : null;
    }
    case 'document': return { kind: 'doc', docId: ref.docId, name: ctx.title(item) };
    case 'system': return systemPreviewTarget(ref.stepType, ctx.title(item), ctx.templates);
    default: return null;
  }
}

export function previewTargetOfSubject(s: RuleSubject, ctx: ItemTargetCtx): PreviewTarget | null {
  return s.kind === 'group'
    ? { kind: 'group', group: s.group, name: REQUEST_GROUPS[s.group].title }
    : previewTargetOfItem(s.item, ctx);
}

// ─── «בשימוש ב» — איפה פריט מהספרייה מופיע במסלולים ───────────────────────────
// ‼ נגזר מהגרסה הנוכחית של כל מסלול פעיל — אותו מקור שהשרת בודק כשמוחקים
// (delete_library_request), כדי שהמסך והסירוב יגידו אותו דבר.
// ‼ (4.10.2026) נוסח מוכן מסוג קבוע («מסמכים מהלקוח») סופר גם את בקשת המערכת מאותו
// סוג במסלול הקליטה (byLibraryRow) — הקישור לשם נוחת על הפריט עצמו, כי שם מוגדר
// מה לקוח חדש מקבל.
import { refersTo, type RequestTemplate } from '../../../../lib/requestTemplates';
import { CLIENT_KIND_ORDER, type ClientKind } from '../../../../types/journeyDefaults';
import type { ItemRef, OfficeFlow } from '../../../../features/flows/types';
import type { OfficePageId } from '../../officeModel';
import { kindsNote, systemTypeOf } from './libraryModel';

export interface LibraryUse {
  flowId: string;
  flowName: string;
  stageKey: string;
  stageName: string;
  /** הפריט הראשון בשלב שמצביע על הבקשה — לנחיתה על הפריט עצמו. */
  itemKey: string;
  /** הפריט הוא בקשת מערכת בקליטה (לא הפניה לשורה) — הקישור פותח את הפריט. */
  system: boolean;
  onboarding: boolean;
  /** לאילו סוגי לקוח הפריט חל (תנאי השלב ∧ תנאי הפריט). */
  kinds: ClientKind[];
}

/** כל המקומות (מסלול ← שלב) שבהם פריט מהספרייה מופיע — כל שלב פעם אחת. */
export function libraryUses(flows: OfficeFlow[], match: (ref: ItemRef) => boolean): LibraryUse[] {
  const out: LibraryUse[] = [];
  for (const f of flows) {
    for (const stage of f.definition?.stages ?? []) {
      const hits = stage.items.filter(i => match(i.ref));
      if (!hits.length) continue;
      const kinds = new Set<ClientKind>();
      for (const it of hits) {
        for (const k of CLIENT_KIND_ORDER) {
          const okStage = !stage.when?.kinds?.length || stage.when.kinds.includes(k);
          const okItem = !it.when?.kinds?.length || it.when.kinds.includes(k);
          if (okStage && okItem) kinds.add(k);
        }
      }
      out.push({
        flowId: f.id, flowName: f.name, stageKey: stage.key, stageName: stage.name,
        itemKey: hits[0].key, system: hits[0].ref.kind === 'system',
        onboarding: f.trigger === 'quote_approved', kinds: CLIENT_KIND_ORDER.filter(k => kinds.has(k)),
      });
    }
  }
  return out;
}

export const byTemplate = (t: RequestTemplate) => (r: ItemRef) => r.kind === 'template' && refersTo(t, r.templateId);
export const byDoc = (id: string) => (r: ItemRef) => r.kind === 'document' && r.docId === id;
export const bySystem = (stepType: string) => (r: ItemRef) => r.kind === 'system' && r.stepType === stepType;
/** שורה בספרייה: הפניות אליה, ובנוסח מוכן מסוג קבוע — גם בקשת המערכת מאותו סוג בקליטה. */
export const byLibraryRow = (t: RequestTemplate) => {
  const sys = systemTypeOf(t);
  const tpl = byTemplate(t);
  return (r: ItemRef) => tpl(r) || (!!sys && r.kind === 'system' && r.stepType === sys);
};

export type GoFn = (page: OfficePageId | null, focus?: string) => void;

/** הקישור נוחת על השלב עצמו במסלול (FlowsPage: ‎flow:<id>:<stage>‎). */
export const flowStageFocus = (u: Pick<LibraryUse, 'flowId' | 'stageKey'>) => `flow:${u.flowId}:${u.stageKey}`;
/** ‼ על הפריט עצמו — נפתח עם «מה הלקוח מקבל» (FlowsPage: ‎flow:<id>:<stage>:<item>‎). */
export const flowItemFocus = (u: Pick<LibraryUse, 'flowId' | 'stageKey' | 'itemKey'>) => `flow:${u.flowId}:${u.stageKey}:${u.itemKey}`;
export const focusOfUse = (u: LibraryUse) => (u.system ? flowItemFocus(u) : flowStageFocus(u));

/**
 * none — מה אומרים כשאינה באף מסלול (null — כלום). ‼ בקשה שאי אפשר לשבץ במסלול
 * («רק מכרטיס הלקוח») לא אומרת «עוד לא» — זה היה מבטיח מסלול שאין.
 * ‼ כל קישור הוא קטע (lb-seg) שנושא את ה«·» שלפניו — בשבירת שורה הנקודה לא
 * נשארת בתחילת השורה (library.css, lb-segs).
 */
export function UsedIn({ uses, go, loading, none = 'עוד לא באף מסלול' }: {
  uses: LibraryUse[]; go: GoFn; loading: boolean; none?: string | null;
}) {
  if (loading) return null;
  if (!uses.length) return none ? <span className="lb-unused">{none}</span> : null;
  return (
    <span className="lb-used lb-segs">
      {uses.map((u, i) => {
        const note = kindsNote(u.kinds);
        return (
          <span key={`${u.flowId}:${u.stageKey}`} className="lb-seg">
            {i === 0 && <span className="lb-used-label">בשימוש ב:</span>}
            <button type="button" className="of-link" onClick={() => go('flows', focusOfUse(u))}>
              {u.flowName} ← {u.stageName}
            </button>
            {note && <span className="lb-unused"> · {note}</span>}
          </span>
        );
      })}
    </span>
  );
}

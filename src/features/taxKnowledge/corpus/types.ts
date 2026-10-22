// ─── כלל במאגר הידע ───────────────────────────────────────────────────────────
// ‼ אותו מבנה גם בפונקציית השרת knowledge-answer (שם הוא מוגדר שוב, כי Deno לא מייבא מ-src).
import type { ClaimStatus } from '../claim';
import type { DomainId } from '../../taxArea/areaModel';

/** claim = טענה מדף נושא או מהערת תחום; lesson = משכבת הלימוד; value = ערך מהמרשם לשנת מס. */
export type RuleKind = 'claim' | 'lesson' | 'value';

export interface KnowledgeRule {
  id: string;
  kind: RuleKind;
  text: string;
  status: ClaimStatus;
  topic?: string;
  domain?: DomainId;
  /** «עסק זעיר › מה הניכוי מחליף» — איפה זה כתוב אצלנו. */
  where?: string;
  year?: number;
  law?: string;
  source?: string;
}

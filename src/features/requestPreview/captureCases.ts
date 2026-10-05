// ─── לכידת דוגמאות להדגמה (?office-app) ─────────────────────────────────────────
// ‼ ההדגמה רצה על מסד מדומה ואסור שתצייר בקשה מומצאת. לכל יעד × בחירה בספריית ההדגמה — הבקשה כפי שהמסך שולח, והבקשה
// כפי ש-staging מכיר אותה (נוסח מהספרייה ← stepType+payload, כי המזהים של ההדגמה אינם קיימים שם). הסקריפט
// scripts/capture-request-preview-fixtures.mjs שולח את השנייה ל-preview_request_sample ב-staging ושומר את התשובה
// תחת המפתח של הראשונה. מפתח בלי לכידה ⇒ שגיאה מפורשת «אין דוגמה בהדגמה».

import { PORTAL_STEP_TYPES } from '../../types/onboarding';
import { GROUP_ORDER } from '../requests/requestGroups';
import type { RequestTemplate } from '../../lib/requestTemplates';
import { enumerateSelections, viewOf } from './registry';
import { CATALOG_TYPES, targetKey, targetOfTemplate, type PreviewTarget } from './targets';
import { requestKey } from './api';
import type { PreviewRequest, PreviewSample } from './types';

export interface CaptureDoc { id: string; label: string; url: string; path: string; fileName?: string }
export interface CaptureCase {
  key: string;
  label: string;
  request: PreviewRequest;
  /** מה לשלוח ל-staging (נוסח מהספרייה ← inline). null — אין דרך ללכוד (הדגמה תציג «אין דוגמה»). */
  staging: PreviewRequest | null;
  /** מסמכי הספרייה שהבקשה תלויה בהם — נוספים לפרופיל ב-staging בתוך טרנזקציה שמתבטלת. */
  needsDocs?: CaptureDoc[];
}

export function buildCaptureCases(lib: { templates: RequestTemplate[]; docs: CaptureDoc[] }): CaptureCase[] {
  const targets: PreviewTarget[] = [
    ...lib.templates.filter(t => t.kind === 'request').map(targetOfTemplate),
    ...lib.docs.map(d => ({ kind: 'doc', docId: d.id, name: d.label }) as PreviewTarget),
    ...[...PORTAL_STEP_TYPES, 'representation_upgrade'].map(stepType => ({ kind: 'system', stepType, name: stepType }) as PreviewTarget),
    ...GROUP_ORDER.map(group => ({ kind: 'group', group, name: group }) as PreviewTarget),
    ...CATALOG_TYPES.map(type => ({ kind: 'catalog', type, name: type }) as PreviewTarget),
  ];
  const byId = new Map(lib.templates.map(t => [t.id, t]));
  const seen = new Set<string>();
  const out: CaptureCase[] = [];
  for (const target of targets) {
    const view = viewOf(target);
    for (const sel of enumerateSelections(view)) {
      const request = view.build(sel);
      const key = requestKey(request);
      if (seen.has(key)) continue;
      seen.add(key);
      const label = `${targetKey(target)} ${JSON.stringify(sel)}`;
      let staging: PreviewRequest | null = request;
      let needsDocs: CaptureDoc[] | undefined;
      const samples: PreviewSample[] = [];
      for (const s of request.samples) {
        if (s.ref?.kind === 'template') {
          const t = byId.get(s.ref.templateId);
          const e = t?.entries[0];
          if (!t || !e) { staging = null; break; }
          // ‼ במסלול שנתי השרת ממיר «מסמכים מהלקוח» לבקשה רגילה (_flow_item_spec) — אין לזה שקילות inline.
          if (s.repeatable) { staging = null; break; }
          const { ref: _drop, ...rest } = s;
          void _drop;
          samples.push({ ...rest, stepType: e.stepType || 'custom_request', payload: e.payload, owner: e.owner ?? 'client' });
        } else if (s.ref?.kind === 'document') {
          const ref = s.ref;
          const d = lib.docs.find(x => x.id === ref.docId);
          if (!d) { staging = null; break; }
          needsDocs = [...(needsDocs ?? []), d];
          samples.push(s);
        } else samples.push(s);
      }
      out.push({ key, label, request, staging: staging ? { ...request, samples } : null, ...(needsDocs ? { needsDocs } : {}) });
    }
  }
  return out;
}

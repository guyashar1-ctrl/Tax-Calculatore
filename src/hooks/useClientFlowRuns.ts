// ─── המסלולים שרצים אצל לקוח אחד ───────────────────────────────────────────
// עוטף את get_client_flow_runs (215). השרת אומר מה פתוח, מה ממתין ולמה — המסך
// רק מציג. ‼ אותה הגנה כמו readyToSendLoader: מעבר לקוח מאפס מיד, ותשובה של
// בקשה ישנה או של לקוח אחר נזרקת. בלי זה, מעבר מהיר בין כרטיסים הציג את
// המסלול של הלקוח הקודם תחת השם של הנוכחי.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { loadClientFlowRuns, type ClientFlowRun } from '../features/flows/api';
import { FLOW_ACTION_NAMES, actionTypeOf, type ItemRef } from '../features/flows/types';
import { systemName } from '../features/flows/preview';
import { firstEntry, loadRequestTemplates, templateForRef, type RequestTemplate } from '../lib/requestTemplates';
import { refPersonalConfirm, type PersonalConfirm } from '../components/flows/builder/model';
import { documentLibrary } from '../lib/clientGuide';
import { supabase } from '../lib/supabase';

interface State { clientId: string | undefined; runs: ClientFlowRun[]; loading: boolean; error: string | null }

export function useClientFlowRuns(clientId: string | undefined, refreshKey: unknown) {
  const [state, setState] = useState<State>({ clientId, runs: [], loading: !!clientId, error: null });
  const seq = useRef(0);
  const active = useRef<string | undefined>(clientId);

  const reload = useCallback(async () => {
    const cid = active.current;
    if (!cid) { setState({ clientId: undefined, runs: [], loading: false, error: null }); return; }
    const my = ++seq.current;
    setState(s => (s.clientId === cid ? { ...s, loading: true } : { clientId: cid, runs: [], loading: true, error: null }));
    let res: Awaited<ReturnType<typeof loadClientFlowRuns>>;
    try {
      res = await loadClientFlowRuns(cid);
    } catch (e) {
      res = { ok: false, error: e instanceof Error ? e.message : String(e), runs: [] };
    }
    // ‼ תשובה ישנה (יצאה בקשה מאוחרת יותר) או של לקוח שכבר לא פעיל — נזרקת.
    if (my !== seq.current || active.current !== cid) return;
    setState({ clientId: cid, runs: res.ok ? res.runs : [], loading: false, error: res.ok ? null : (res.error ?? 'load_failed') });
  }, []);

  useEffect(() => {
    active.current = clientId;
    seq.current++;
    setState({ clientId, runs: [], loading: !!clientId, error: null });
  }, [clientId]);
  useEffect(() => { void reload(); }, [reload, clientId, refreshKey]);

  // ‼ מצב של לקוח אחר לעולם לא מוצג — גם ברינדור שלפני שהאפקט הספיק לאפס.
  const current = state.clientId === clientId ? state : { clientId, runs: [], loading: !!clientId, error: null };
  return { runs: current.runs, loading: current.loading, error: current.error, reload };
}


export type AnyItemRef = ItemRef | (ItemRef & { actionType?: string }) | { kind: 'action'; actionType?: string; actionId?: string };


/**
 * שמות לפריטי מסלול (בקשה מהספרייה / מסמך / בקשת מערכת / פעולה) — לחלונות
 * העדכון, ההצעות וההפעלה. נטען פעם אחת כשנדרש; קריאה בלבד.
 */
export function useFlowItemTitles(enabled: boolean) {
  return useFlowLibrary(enabled).title;
}

/**
 * הספרייה כפי שחלון ההפעלה צריך אותה: שם לכל פריט, והאם פריט כולל אישור אישי
 * (‼ אז לבן/בת הזוג נפתחת משימה אליך, ובדף רק החלק של הקבצים/הפרטים אם יש —
 * refPersonalConfirm, אותו כלל כמו _flow_materialize בשרת). מובנית שהמשרד התאים —
 * לפי הנוסח של המשרד (templateForRef).
 */
export function useFlowLibrary(enabled: boolean) {
  const [lib, setLib] = useState<{ templates: RequestTemplate[]; documents: Map<string, string> } | null>(null);
  useEffect(() => {
    if (!enabled || lib) return;
    let alive = true;
    void (async () => {
      const [{ data: prof }, tpls] = await Promise.all([
        supabase.from('profiles').select('settings').limit(1).maybeSingle(),
        loadRequestTemplates(),
      ]);
      if (!alive) return;
      const docs = documentLibrary({ settings: (prof?.settings ?? {}) as Record<string, unknown> });
      setLib({ templates: tpls, documents: new Map(docs.map(d => [d.id, d.label])) });
    })();
    return () => { alive = false; };
  }, [enabled, lib]);

  return useMemo(() => ({
    loaded: !!lib,
    title: (ref: AnyItemRef, fallback?: string): string => {
      switch (ref.kind) {
        case 'system': return systemName((ref as { stepType: string }).stepType);
        case 'template': {
          const t = lib ? templateForRef(lib.templates, (ref as { templateId: string }).templateId) : undefined;
          return t?.name ?? fallback ?? 'בקשה מהספרייה';
        }
        case 'document': return lib?.documents.get((ref as { docId: string }).docId) ?? fallback ?? 'מסמך מהספרייה';
        case 'action': return FLOW_ACTION_NAMES[actionTypeOf(ref)] ?? fallback ?? 'פעולה מול רשות';
      }
    },
    // ‼ אותו כלל כמו בבונה (refPersonalConfirm) — גם מסמך מהספרייה כולל אישור אישי.
    // נמחקה מהספרייה — לפי העותק בפריט (snapshotPayload), כמו השרת.
    personalConfirm: (ref: AnyItemRef, snapshotPayload?: Record<string, unknown>): PersonalConfirm => refPersonalConfirm(ref, lib && {
      template: (id: string) => {
        const t = templateForRef(lib.templates, id);
        return t ? { payload: firstEntry(t)?.payload as Record<string, unknown> | undefined } : undefined;
      },
    }, snapshotPayload),
  }), [lib]);
}

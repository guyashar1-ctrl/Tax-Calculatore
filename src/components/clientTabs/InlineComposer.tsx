// ─── הקומפוזר של מרכז התיק: הוספה ועריכה בתוך השלב, בלי מודל ────────────────
// המסלול המהיר (הכרעת גיא, 6+7): שם ← מי מטפל ← מה מצפים לקבל ← שמירה כטיוטה.
// כל השאר — תלויות, נדרש-לסגירה, תאריך יעד, ניסוח ללקוח — מאחורי "עוד הגדרות".
//
// ‼ הדרישות הן שדות בתוך בקשה אחת, לא משימות נפרדות.
// ‼ הכול נולד טיוטה; עריכת בקשה שפורסמה נכתבת ל-draft_payload והלקוח רואה
//   את הישן עד "עדכן את דף הלקוח" (D4).
// ‼ גורם חיצוני: מוכנות פרטי הקשר היא דרישת-מערכת, לא תלות — היא מוצגת
//   ומוסברת, אבל אי אפשר "להסיר" אותה (Correction 1).

import { useMemo, useState } from 'react';
import { supabase } from '../../lib/supabase';
import type { CustomRequirement, CustomRequirementKind, ExternalPartyConfig, OnboardingStep } from '../../types/onboarding';
import { REQUIREMENT_KIND_LABELS } from '../../types/onboarding';

type Owner = 'client' | 'me' | 'external';

interface InputRow {
  key: string;
  kind: CustomRequirementKind;
  label: string;
  required: boolean;
  optionsText: string;   // select — אפשרויות מופרדות בפסיקים
  maxFiles: string;      // files — ריק = בלי תקרה
}

const KIND_ORDER: CustomRequirementKind[] = [
  'file', 'files', 'text', 'email', 'phone', 'number', 'date', 'select', 'confirm',
];

const ERRORS: Record<string, string> = {
  no_requirements: 'בקשת לקוח צריכה לפחות פריט אחד.',
  missing_requirement_label: 'לכל פריט צריך תווית.',
  select_needs_options: 'בחירה מרשימה צריכה לפחות שתי אפשרויות (מופרדות בפסיק).',
  bad_requirement_kind: 'סוג פריט לא מוכר.',
  missing_external_party: 'צריך לבחור מי הגורם החיצוני.',
  stage_not_found: 'השלב לא נמצא — נסו לרענן.',
  dependency_cycle: 'התלות הזאת יוצרת מעגל.',
  step_terminal: 'הבקשה כבר נסגרה — אי אפשר לערוך אותה.',
  not_editable: 'את הבקשה הזאת עורכים במסך שלה.',
};

let nextTempKey = 1;
const freshKey = () => `r${Date.now().toString(36)}${nextTempKey++}`;

function emptyRow(): InputRow {
  return { key: freshKey(), kind: 'file', label: '', required: true, optionsText: '', maxFiles: '' };
}

export default function InlineComposer({
  clientId, stageId, editStep, existingSteps, prevAccountant, onSaved, onCancel,
}: {
  clientId: string;
  /** שלב-העל שבו נלחץ "+ הוסף" — נגזר מההקשר, לא נשאל. null = דלי ברירת-מחדל. */
  stageId?: string | null;
  /** מצב עריכה — אותו קומפוזר, מלא מראש. */
  editStep?: OnboardingStep;
  /** בקשות פתוחות אחרות של הלקוח — לבחירת "ממתין ל…". */
  existingSteps: OnboardingStep[];
  /** פרטי הרו״ח הקודם מכרטיס הלקוח — לפתרון דרישת-הקשר של גורם חיצוני. */
  prevAccountant?: { name?: string; email?: string; phone?: string };
  /** נקרא אחרי שמירה מוצלחת, עם השלב האופטימי להצגה מיידית. */
  onSaved: (optimistic: OnboardingStep) => void;
  onCancel: () => void;
}) {
  const edit = editStep ?? null;
  const editContent = edit ? { ...edit.payload, ...(edit.draftPayload ?? {}) } : null;

  const [name, setName] = useState(String(editContent?.title ?? editContent?.clientTitle ?? ''));
  const [owner, setOwner] = useState<Owner>(() => {
    if (!edit) return 'client';
    if (edit.payload.externalParty) return 'external';
    return edit.ball === 'me' ? 'me' : 'client';
  });
  const [rows, setRows] = useState<InputRow[]>(() => {
    if (edit) {
      const r = (editContent?.requirements as CustomRequirement[] | undefined) ?? [];
      return r.length ? r.map(x => ({
        key: x.key, kind: x.kind, label: x.label, required: x.required !== false,
        optionsText: (x.options ?? []).join(', '), maxFiles: x.maxFiles ? String(x.maxFiles) : '',
      })) : [emptyRow()];
    }
    return [emptyRow()];
  });
  const [extKind, setExtKind] = useState<'prev_accountant' | 'other'>(
    (editContent?.externalParty as ExternalPartyConfig | undefined)?.kind ?? 'prev_accountant');
  const [extContact, setExtContact] = useState(() => ({
    name: (editContent?.externalParty as ExternalPartyConfig | undefined)?.contact?.name ?? '',
    email: (editContent?.externalParty as ExternalPartyConfig | undefined)?.contact?.email ?? '',
    phone: (editContent?.externalParty as ExternalPartyConfig | undefined)?.contact?.phone ?? '',
  }));
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [clientSub, setClientSub] = useState(String(editContent?.clientSub ?? ''));
  const [clientCta, setClientCta] = useState(String(editContent?.clientCta ?? ''));
  const [requiredForClose, setRequiredForClose] = useState(edit ? edit.requiredForClose !== false : true);
  const [dueDate, setDueDate] = useState(edit?.dueDate ?? '');
  const [deps, setDeps] = useState<string[]>(edit?.dependsOnStepId ? [edit.dependsOnStepId] : []);
  const [depsOpen, setDepsOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const depCandidates = useMemo(
    () => existingSteps.filter(s =>
      s.id !== edit?.id &&
      !['completed', 'verified', 'cancelled', 'skipped'].includes(s.status)),
    [existingSteps, edit?.id]);

  // דרישת-הקשר של הגורם החיצוני — נגזרת, לא ניתנת להסרה (Correction 1).
  const prevEmail = prevAccountant?.email?.trim();
  const contactGap = owner === 'external'
    ? (extKind === 'prev_accountant'
        ? (prevEmail ? null : 'חסר אימייל של הרו״ח הקודם')
        : (extContact.email.trim() ? null : 'חסר אימייל של הגורם'))
    : null;

  function setRow(i: number, patch: Partial<InputRow>) {
    setRows(rs => rs.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  }
  function moveRow(i: number, dir: -1 | 1) {
    setRows(rs => {
      const j = i + dir;
      if (j < 0 || j >= rs.length) return rs;
      const next = [...rs];
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });
  }

  function buildPayload(): Record<string, unknown> | { error: string } {
    const title = name.trim();
    if (!title) return { error: 'צריך שם לבקשה — הוא גם מה שהלקוח יראה.' };

    const activeRows = owner === 'client' ? rows.filter(r => r.label.trim()) : [];
    if (owner === 'client' && activeRows.length === 0) {
      return { error: ERRORS.no_requirements };
    }
    for (const r of activeRows) {
      if (r.kind === 'select') {
        const opts = r.optionsText.split(',').map(s => s.trim()).filter(Boolean);
        if (opts.length < 2) return { error: ERRORS.select_needs_options };
      }
    }

    const requirements: CustomRequirement[] = activeRows.map(r => ({
      key: r.key,
      kind: r.kind,
      label: r.label.trim(),
      done: false,
      ...(r.required ? {} : { required: false }),
      ...(r.kind === 'select'
        ? { options: r.optionsText.split(',').map(s => s.trim()).filter(Boolean) } : {}),
      ...(r.kind === 'files' && Number(r.maxFiles) > 0
        ? { maxFiles: Number(r.maxFiles) } : {}),
    }));

    const externalParty: ExternalPartyConfig | undefined = owner === 'external'
      ? (extKind === 'prev_accountant'
          ? { kind: 'prev_accountant' }
          : {
              kind: 'other',
              contact: {
                name: extContact.name.trim() || undefined,
                email: extContact.email.trim() || undefined,
                phone: extContact.phone.trim() || undefined,
              },
            })
      : undefined;

    return {
      title,
      clientTitle: title,
      clientSub: clientSub.trim(),
      clientCta: clientCta.trim(),
      ...(requirements.length ? { requirements } : {}),
      ...(externalParty ? { externalParty } : {}),
    };
  }

  async function save() {
    setError(null);
    const payload = buildPayload();
    if ('error' in payload) { setError(payload.error as string); return; }
    setBusy(true);

    if (edit) {
      const { data, error: rpcErr } = await supabase.rpc('update_onboarding_request', {
        p_step_id: edit.id,
        p_payload: payload,
        p_due_date: dueDate || null,
        p_apply_due: true,
      });
      const res = data as { ok?: boolean; error?: string; pendingEdit?: boolean } | null;
      if (rpcErr || !res?.ok) {
        setBusy(false);
        setError(ERRORS[res?.error ?? ''] ?? rpcErr?.message ?? 'השמירה נכשלה.');
        return;
      }
      if (deps.join('|') !== (edit.dependsOnStepId ?? '')) {
        await supabase.rpc('set_onboarding_step_dependencies', { p_step_id: edit.id, p_depends_on: deps });
      }
      setBusy(false);
      onSaved(res.pendingEdit
        ? { ...edit, draftPayload: payload, dueDate: dueDate || undefined }
        : { ...edit, payload: { ...edit.payload, ...payload }, dueDate: dueDate || undefined });
      return;
    }

    const { data, error: rpcErr } = await supabase.rpc('create_onboarding_request', {
      p_client_id: clientId,
      p_step_type: 'custom_request',
      p_payload: payload,
      p_due_date: dueDate || null,
      p_depends_on: deps[0] ?? null,
      p_published: false,                    // ‼ הכול נולד טיוטה (D4)
      p_required_for_close: requiredForClose,
      p_owner: owner,
      p_stage_id: stageId ?? null,
    });
    const res = data as { ok?: boolean; error?: string; stepId?: string; status?: string } | null;
    if (rpcErr || !res?.ok || !res.stepId) {
      setBusy(false);
      setError(ERRORS[res?.error ?? ''] ?? rpcErr?.message ?? 'היצירה נכשלה.');
      return;
    }
    if (deps.length > 1) {
      await supabase.rpc('set_onboarding_step_dependencies', { p_step_id: res.stepId, p_depends_on: deps });
    }
    setBusy(false);
    onSaved({
      id: res.stepId,
      clientId,
      stepType: 'custom_request',
      track: 'custom',
      scope: 'person',
      status: (res.status as OnboardingStep['status']) ?? 'pending',
      ball: owner === 'me' ? 'me' : owner === 'external'
        ? (extKind === 'prev_accountant' ? 'prev_accountant' : 'external') : 'client',
      dependsOnStepId: deps[0],
      requiredForClose,
      dueDate: dueDate || undefined,
      stageId: stageId ?? null,
      publishedAt: null,
      needsAttention: false,
      payload: { ...(payload as object), published: false },
      completionMethod: 'manual',
    });
  }

  const field: React.CSSProperties = {
    font: 'inherit', fontSize: 'var(--fs-13)', color: 'var(--ink-1)',
    padding: '.4rem .55rem', border: '1px solid var(--bd)', borderRadius: 'var(--radius)',
    background: 'var(--card, #fff)', minWidth: 0,
  };
  const pill = (active: boolean): React.CSSProperties => ({
    font: 'inherit', fontSize: 'var(--fs-13)', fontWeight: 600, cursor: 'pointer',
    padding: '.3rem .8rem', borderRadius: 999, minHeight: 36,
    border: `1px solid ${active ? 'var(--accent)' : 'var(--bd)'}`,
    color: active ? '#fff' : 'var(--ink-2)',
    background: active ? 'var(--accent)' : 'transparent',
  });

  return (
    <div style={{
      display: 'grid', gap: '.6rem', padding: '.7rem .75rem', margin: '.35rem 0',
      border: '1px solid var(--bd-strong, var(--bd))', borderRadius: 'var(--radius)',
      background: 'var(--surface-2)',
    }}>
      <div style={{ display: 'flex', gap: '.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
        <input
          autoFocus
          style={{ ...field, flex: 1, minWidth: 180 }}
          placeholder={owner === 'me' ? 'שם המשימה' : 'שם הבקשה'}
          value={name}
          disabled={busy}
          onChange={e => setName(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') void save(); if (e.key === 'Escape') onCancel(); }}
        />
        <span role="group" aria-label="מי מטפל" style={{ display: 'inline-flex', gap: '.3rem' }}>
          <button type="button" style={pill(owner === 'client')} aria-pressed={owner === 'client'}
            onClick={() => setOwner('client')}>לקוח</button>
          <button type="button" style={pill(owner === 'me')} aria-pressed={owner === 'me'}
            onClick={() => setOwner('me')}>אני</button>
          <button type="button" style={pill(owner === 'external')} aria-pressed={owner === 'external'}
            onClick={() => setOwner('external')}>גורם חיצוני</button>
        </span>
      </div>

      {/* ── לקוח: מה אני מצפה לקבל ── */}
      {owner === 'client' && (
        <div style={{ display: 'grid', gap: '.35rem' }}>
          <span style={{ fontSize: 'var(--fs-13)', fontWeight: 600, color: 'var(--ink-2)' }}>
            מה אני מצפה לקבל מהלקוח?
          </span>
          {rows.map((r, i) => (
            <div key={r.key} style={{ display: 'flex', gap: '.35rem', alignItems: 'center', flexWrap: 'wrap' }}>
              <span style={{ display: 'inline-flex', gap: 1 }}>
                <button type="button" className="btn btn-sm btn-ghost" aria-label="הזז למעלה"
                  style={{ padding: '0 .25rem' }} onClick={() => moveRow(i, -1)}>↑</button>
                <button type="button" className="btn btn-sm btn-ghost" aria-label="הזז למטה"
                  style={{ padding: '0 .25rem' }} onClick={() => moveRow(i, 1)}>↓</button>
              </span>
              <input
                style={{ ...field, flex: 1, minWidth: 140 }}
                placeholder="למשל: דוח שנתי אחרון"
                value={r.label}
                disabled={busy}
                onChange={e => setRow(i, { label: e.target.value })}
                onKeyDown={e => { if (e.key === 'Enter') void save(); }}
              />
              <select
                style={field}
                value={r.kind}
                disabled={busy}
                aria-label="סוג הפריט"
                onChange={e => setRow(i, { kind: e.target.value as CustomRequirementKind })}
              >
                {KIND_ORDER.map(k => <option key={k} value={k}>{REQUIREMENT_KIND_LABELS[k]}</option>)}
              </select>
              <button
                type="button"
                onClick={() => setRow(i, { required: !r.required })}
                aria-pressed={r.required}
                title={r.required ? 'חובה — חוסם את השלמת הבקשה' : 'רשות — לא חוסם'}
                style={{
                  font: 'inherit', fontSize: 'var(--fs-12)', fontWeight: 600, cursor: 'pointer',
                  padding: '.2rem .55rem', borderRadius: 999, minHeight: 32,
                  border: `1px solid ${r.required ? 'var(--accent)' : 'var(--bd)'}`,
                  color: r.required ? 'var(--accent)' : 'var(--ink-3)', background: 'transparent',
                }}
              >{r.required ? 'חובה' : 'רשות'}</button>
              <button type="button" className="btn btn-sm btn-ghost" aria-label="הסרת פריט"
                onClick={() => setRows(rs => rs.filter((_, j) => j !== i))}>✕</button>
              {r.kind === 'select' && (
                <input
                  style={{ ...field, width: '100%' }}
                  placeholder="אפשרויות, מופרדות בפסיק: עוסק מורשה, עוסק פטור"
                  value={r.optionsText}
                  disabled={busy}
                  onChange={e => setRow(i, { optionsText: e.target.value })}
                />
              )}
              {r.kind === 'files' && (
                <input
                  style={{ ...field, width: 110 }}
                  placeholder="עד כמה?"
                  inputMode="numeric"
                  value={r.maxFiles}
                  disabled={busy}
                  onChange={e => setRow(i, { maxFiles: e.target.value.replace(/\D/g, '') })}
                />
              )}
            </div>
          ))}
          <button type="button" className="btn btn-sm btn-ghost" style={{ justifySelf: 'start' }}
            onClick={() => setRows(rs => [...rs, emptyRow()])}>+ עוד פריט</button>
        </div>
      )}

      {/* ── אני: מינימלי בכוונה ── */}
      {owner === 'me' && (
        <label style={{ display: 'flex', gap: '.4rem', alignItems: 'center', fontSize: 'var(--fs-13)', color: 'var(--ink-2)' }}>
          תאריך יעד (רשות):
          <input type="date" style={field} value={dueDate} disabled={busy}
            onChange={e => setDueDate(e.target.value)} />
        </label>
      )}

      {/* ── גורם חיצוני ── */}
      {owner === 'external' && (
        <div style={{ display: 'grid', gap: '.4rem' }}>
          <span role="group" aria-label="מי הגורם" style={{ display: 'inline-flex', gap: '.3rem' }}>
            <button type="button" style={pill(extKind === 'prev_accountant')}
              aria-pressed={extKind === 'prev_accountant'}
              onClick={() => setExtKind('prev_accountant')}>רו״ח קודם</button>
            <button type="button" style={pill(extKind === 'other')}
              aria-pressed={extKind === 'other'}
              onClick={() => setExtKind('other')}>גורם אחר</button>
          </span>
          {extKind === 'prev_accountant' ? (
            <div style={{ fontSize: 'var(--fs-13)', color: 'var(--ink-2)' }}>
              פרטי קשר: מתוך «פרטי רו״ח קודם» בכרטיס —
              {prevEmail
                ? <span dir="ltr" style={{ marginInlineStart: 4 }}>{prevEmail}</span>
                : <span style={{ color: 'var(--warn)' }}> טרם התקבלו</span>}
              {!prevEmail && (
                /* ‼ דרישת-מערכת, לא תלות: אי אפשר להסיר אותה. הפעולה כלפי
                   הגורם תמתין לפרטים גם בלי שום צ'יפ תלות (Correction 1). */
                <div style={{ fontSize: 'var(--fs-12)', color: 'var(--ink-3)', marginTop: 2 }}>
                  המשימה תמתין לפרטי הקשר — הם יגיעו מהבקשה «פרטי רו״ח קודם» או מהכרטיס.
                </div>
              )}
            </div>
          ) : (
            <div style={{ display: 'flex', gap: '.35rem', flexWrap: 'wrap' }}>
              <input style={{ ...field, flex: 1, minWidth: 120 }} placeholder="שם הגורם" value={extContact.name}
                disabled={busy} onChange={e => setExtContact(c => ({ ...c, name: e.target.value }))} />
              <input style={{ ...field, flex: 1, minWidth: 150, direction: 'ltr', textAlign: 'right' }} placeholder="אימייל" type="email"
                value={extContact.email} disabled={busy}
                onChange={e => setExtContact(c => ({ ...c, email: e.target.value }))} />
              <input style={{ ...field, width: 130, direction: 'ltr', textAlign: 'right' }} placeholder="טלפון" type="tel"
                value={extContact.phone} disabled={busy}
                onChange={e => setExtContact(c => ({ ...c, phone: e.target.value }))} />
            </div>
          )}
          {contactGap && extKind === 'other' && (
            <span style={{ fontSize: 'var(--fs-12)', color: 'var(--warn)' }}>
              {contactGap} — המשימה תמתין עד שיהיה למי לפנות.
            </span>
          )}
        </div>
      )}

      {/* ── עוד הגדרות — חשיפה הדרגתית ── */}
      <button type="button" onClick={() => setShowAdvanced(v => !v)}
        aria-expanded={showAdvanced}
        style={{
          justifySelf: 'start', background: 'none', border: 'none', padding: 0, cursor: 'pointer',
          font: 'inherit', fontSize: 'var(--fs-13)', color: 'var(--accent)', minHeight: 32,
        }}>
        {showAdvanced ? 'עוד הגדרות ▴' : 'עוד הגדרות ▾'}
      </button>

      {showAdvanced && (
        <div style={{ display: 'grid', gap: '.5rem', paddingInlineStart: '.2rem' }}>
          {/* תלויות — קשר בין משימות, לא היררכיה. השורות נשארות באותה רמה. */}
          <div style={{ display: 'grid', gap: '.25rem' }}>
            <span style={{ fontSize: 'var(--fs-13)', fontWeight: 600, color: 'var(--ink-2)' }}>ממתין ל…</span>
            <div style={{ display: 'flex', gap: '.3rem', flexWrap: 'wrap', alignItems: 'center' }}>
              {deps.map(id => {
                const s = depCandidates.find(x => x.id === id) ?? existingSteps.find(x => x.id === id);
                return (
                  <span key={id} style={{
                    display: 'inline-flex', alignItems: 'center', gap: '.25rem',
                    fontSize: 'var(--fs-12)', padding: '.15rem .5rem', borderRadius: 999,
                    border: '1px solid var(--bd)', background: 'var(--card, #fff)',
                  }}>
                    {s ? (String(s.payload.title ?? '').trim() || s.stepType) : id}
                    <button type="button" aria-label="הסרת תלות" onClick={() => setDeps(d => d.filter(x => x !== id))}
                      style={{ border: 'none', background: 'none', cursor: 'pointer', color: 'var(--ink-3)', padding: 0 }}>✕</button>
                  </span>
                );
              })}
              <button type="button" className="btn btn-sm btn-ghost" onClick={() => setDepsOpen(v => !v)}>
                {depsOpen ? 'סגור' : '+ תלות'}
              </button>
            </div>
            {depsOpen && (
              <div style={{
                display: 'grid', gap: '.15rem', maxHeight: 180, overflowY: 'auto',
                border: '1px solid var(--bd)', borderRadius: 'var(--radius)', padding: '.4rem .5rem',
                background: 'var(--card, #fff)',
              }}>
                {depCandidates.length === 0 && (
                  <span style={{ fontSize: 'var(--fs-12)', color: 'var(--ink-3)' }}>אין בקשות פתוחות אחרות.</span>
                )}
                {depCandidates.map(s => (
                  <label key={s.id} style={{ display: 'flex', gap: '.4rem', alignItems: 'center', fontSize: 'var(--fs-13)' }}>
                    <input type="checkbox" checked={deps.includes(s.id)}
                      onChange={e => setDeps(d => e.target.checked ? [...d, s.id] : d.filter(x => x !== s.id))} />
                    <span>{String(s.payload.title ?? '').trim() || String(s.payload.clientTitle ?? '').trim() || s.stepType}</span>
                  </label>
                ))}
              </div>
            )}
          </div>

          {owner !== 'me' && (
            <label style={{ display: 'flex', gap: '.4rem', alignItems: 'center', fontSize: 'var(--fs-13)', color: 'var(--ink-2)' }}>
              תאריך יעד:
              <input type="date" style={field} value={dueDate} disabled={busy}
                onChange={e => setDueDate(e.target.value)} />
            </label>
          )}

          {!edit && (
            <label style={{ display: 'flex', gap: '.4rem', alignItems: 'center', fontSize: 'var(--fs-13)', color: 'var(--ink-2)' }}>
              <input type="checkbox" checked={requiredForClose}
                onChange={e => setRequiredForClose(e.target.checked)} />
              נדרש לסגירת הקליטה
            </label>
          )}

          {owner === 'client' && (
            <div style={{ display: 'grid', gap: '.3rem' }}>
              <span style={{ fontSize: 'var(--fs-13)', fontWeight: 600, color: 'var(--ink-2)' }}>ניסוח ללקוח (רשות)</span>
              <input style={field} placeholder="משפט הסבר קצר מתחת לכותרת" value={clientSub}
                disabled={busy} onChange={e => setClientSub(e.target.value)} />
              <input style={{ ...field, maxWidth: 220 }} placeholder="טקסט הכפתור (למשל: מאשר/ת)" value={clientCta}
                disabled={busy} onChange={e => setClientCta(e.target.value)} />
            </div>
          )}
        </div>
      )}

      {error && (
        <div role="alert" style={{ fontSize: 'var(--fs-13)', color: 'var(--err)' }}>⚠ {error}</div>
      )}

      <div style={{ display: 'flex', gap: '.4rem', alignItems: 'center' }}>
        <button type="button" className="btn btn-sm btn-primary" disabled={busy} onClick={() => void save()}>
          {busy ? 'שומר…' : edit ? 'שמירה' : 'שמור כטיוטה'}
        </button>
        <button type="button" className="btn btn-sm btn-ghost" disabled={busy} onClick={onCancel}>ביטול</button>
        {!edit && (
          <span style={{ fontSize: 'var(--fs-12)', color: 'var(--ink-3)' }}>
            הלקוח לא יראה עד "עדכן את דף הלקוח"
          </span>
        )}
      </div>
    </div>
  );
}

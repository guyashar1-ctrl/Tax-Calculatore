// ─── עורך נוסח — נושא + גוף, עם שדות שמתמלאים לבד ─────────────────────────────
// הוצא מ-EmailsPage (07.10.2026) כדי שאותו עורך ישמש גם את נוסח ההזמנה לפגישה
// (ספריית הבקשות ← פגישות, ו«מיילים ← פגישות»): אותן שלוש מדרגות נוסח, אותו
// «בטל», ואותם שדות בעברית בסוגריים מרובעים.
import { useMemo, useRef, useState } from 'react';
import { toggleHighlightAt } from '../../../utils/releaseLetter';
import HighlightTextarea from '../../ui/HighlightTextarea';
import { templateFromLabels, templateToLabels, TEMPLATE_FIELD_LABELS } from '../../../types/emailActivity';
import { Field } from '../officeUi';

/** נוסח שנשמר ב-settings.commTemplates[מפתח]. */
export interface CommTemplate {
  subject?: string;
  body?: string;
  firmDefault?: { subject: string; body: string };
}

/** מה שהעורך צריך לדעת על נוסח. */
export interface EditorSpec {
  key: string;
  base: { subject: string; body: string };
  vars: { label: string; hint?: string; section?: boolean }[];
  /** שם אחר לשדה במייל הזה — למשל {{clientName}} במייל לגורם חיצוני הוא שם הנמען. */
  varLabels?: Record<string, string>;
  /**
   * ‼ כשיש — אלה השמות היחידים שמוכרים בעורך (הזמנה לפגישה): [שם המשרד] שהוקלד לא הופך
   * לשדה של מיילי הבקשות, שהזמנה לא יודעת למלא.
   */
  fieldLabels?: Record<string, string>;
  /** «נושא המייל» כברירת מחדל; בהזמנה לפגישה — «הכותרת ביומן». */
  subjectLabel?: string;
  bodyLabel: string;
  rows: number;
  /** עורך עם מרקר — רק במכתב ההעברה: שאר המיילים אינם מרנדרים `==`. */
  marker?: boolean;
}

/**
 * השם בעברית של שדה שמתמלא לבד — בצ'יפ, ובטקסט עצמו בסוגריים מרובעים ([שורת פתיחה]).
 * מקור אחד לשמות: TEMPLATE_FIELD_LABELS (גם חלון השליחה קורא משם).
 */
export function fieldLabel(spec: EditorSpec, v: { label: string; hint?: string }): string {
  return spec.varLabels?.[v.label] ?? TEMPLATE_FIELD_LABELS[v.label] ?? v.hint ?? v.label;
}

// ─── העורך עצמו ──────────────────────────────────────────────────────────────
// ‼ "חזרה לנוסח המערכת" אינו מוחק את נוסח המשרד — הוא מוריד רק את מה שנשלח
// בפועל. אחרת התנסות אחת הייתה מוחקת את הנוסח שגיא בנה.

const TEMPLATE_HISTORY_MAX = 50;
/** הקלדה רצופה היא צעד אחד — "בטל" חוזר לפני הפסקה, לא תו אחורה. */
const TYPING_BURST_MS = 700;

export function TemplateEditor({ spec, entry, onReplace }: {
  spec: EditorSpec;
  entry: CommTemplate;
  onReplace: (update: (prev: CommTemplate) => CommTemplate) => void;
}) {
  const bodyRef = useRef<HTMLTextAreaElement | null>(null);
  const [markerHint, setMarkerHint] = useState(false);
  const [history, setHistory] = useState<CommTemplate[]>([]);
  const lastChangeAt = useRef(0);

  const cur = { subject: entry.subject ?? spec.base.subject, body: entry.body ?? spec.base.body };
  const firm = entry.firmDefault;
  const sameAsFirm = !!firm && firm.subject === cur.subject && firm.body === cur.body;
  const sameAsSystem = cur.subject === spec.base.subject && cur.body === spec.base.body;

  // ‼ בעורך השדות בעברית ([רשימת הבקשות]) — אותו שם כמו בצ'יפ. נשמר ונשלח כקוד ({{requestList}}).
  // גם שדה מוכר שאין לו צ'יפ במייל הזה (נוסח ישן) — בעברית, לא בקוד.
  const labels = useMemo<Record<string, string>>(
    () => (spec.fieldLabels
      ? { ...spec.fieldLabels }
      : { ...TEMPLATE_FIELD_LABELS, ...Object.fromEntries(spec.vars.map(v => [v.label, fieldLabel(spec, v)])) }),
    [spec]);
  const show = (t: string) => templateToLabels(t, labels);
  const store = (t: string) => templateFromLabels(t, labels);
  const shownBody = show(cur.body);

  function apply(update: (prev: CommTemplate) => CommTemplate, checkpoint = false) {
    const now = Date.now();
    if (checkpoint || now - lastChangeAt.current > TYPING_BURST_MS) {
      setHistory(h => [...h.slice(-(TEMPLATE_HISTORY_MAX - 1)), entry]);
    }
    lastChangeAt.current = checkpoint ? 0 : now;
    onReplace(update);
  }

  function undo() {
    const prev = history[history.length - 1];
    if (!prev) return;
    setHistory(h => h.slice(0, -1));
    lastChangeAt.current = 0;
    setMarkerHint(false);
    onReplace(() => prev);
  }

  const currentOf = (p: CommTemplate) => ({ subject: p.subject ?? spec.base.subject, body: p.body ?? spec.base.body });

  // ‼ המיקומים (סמן, בחירה) הם של הטקסט שמוצג — עם השמות בעברית. עובדים עליו, וממירים בסוף.
  function toggleMarker() {
    const el = bodyRef.current;
    if (!el) return;
    const result = toggleHighlightAt(shownBody, el.selectionStart ?? 0, el.selectionEnd ?? 0);
    if (!result) { setMarkerHint(true); return; }
    setMarkerHint(false);
    apply(p => ({ ...p, body: store(result.text) }), true);
    requestAnimationFrame(() => { el.focus(); el.setSelectionRange(...result.selection); });
  }

  /** לחיצה על שדה — נכנס לטקסט במקום הסמן (בסוף, אם הסמן לא בטקסט). */
  function insertVar(token: string) {
    const el = bodyRef.current;
    const shown = labels[token] ? `[${labels[token]}]` : token;
    const at = el && document.activeElement === el ? el.selectionStart ?? shownBody.length : shownBody.length;
    const end = el && document.activeElement === el ? el.selectionEnd ?? at : at;
    const text = shownBody.slice(0, at) + shown + shownBody.slice(end);
    apply(p => ({ ...p, body: store(text) }), true);
    requestAnimationFrame(() => { if (el) { el.focus(); el.setSelectionRange(at + shown.length, at + shown.length); } });
  }

  // סעיף שנמחק מהשלד לא יופיע במכתב — אזהרה, לא חסימה.
  const missingSections = spec.vars
    .filter(v => v.section && !cur.body.includes(v.label))
    .map(v => v.hint ?? v.label);

  return (
    <div className="of-tpl-editor">
      <div className="of-vars-label">שדות שמתמלאים לבד — לחיצה מכניסה לטקסט</div>
      <div className="of-vars">
        {spec.vars.map(v => (
          <button key={v.label} type="button" className={`of-var${v.section ? ' is-section' : ''}`}
            title={spec.fieldLabels ? v.hint : undefined}
            onMouseDown={e => e.preventDefault()} onClick={() => insertVar(v.label)}>
            {labels[v.label]}
          </button>
        ))}
      </div>
      {spec.marker && (
        <p className="of-muted" style={{ margin: '0 0 10px' }}>
          החלקים הכתומים נבנים לכל לקוח — אפשר להזיז, למחוק או לסמן אותם במרקר, לא לנסח אותם.
        </p>
      )}

      <Field label={spec.subjectLabel ?? 'נושא המייל'}>
        <input value={show(cur.subject)} onChange={e => apply(p => ({ ...p, subject: store(e.target.value) }))} />
      </Field>

      <div className="of-field" style={{ marginTop: 12 }}>
        <div className="of-tpl-body-head">
          <label className="of-field-label" htmlFor={`tpl-body-${spec.key}`}>{spec.bodyLabel}</label>
          {spec.marker && (
            <button type="button" className="btn btn-sm btn-ghost" onClick={toggleMarker}
              title="מסמנים קטע בטקסט ולוחצים - הוא יופיע עם הדגשה צהובה">
              <span className="of-marker-chip">מרקר</span>
            </button>
          )}
        </div>
        {spec.marker ? (
          <HighlightTextarea ref={bodyRef} rows={spec.rows} value={shownBody} id={`tpl-body-${spec.key}`}
            onChange={v => apply(p => ({ ...p, body: store(v) }))} />
        ) : (
          <textarea ref={bodyRef} id={`tpl-body-${spec.key}`} rows={spec.rows} value={shownBody}
            onChange={e => apply(p => ({ ...p, body: store(e.target.value) }))}
            style={{ width: '100%', resize: 'vertical' }} />
        )}
      </div>

      {markerHint && <div className="of-field-hint is-warn" style={{ marginTop: 6 }}>צריך לסמן קודם את הקטע שרוצים להדגיש.</div>}
      {missingSections.length > 0 && (
        <div className="of-field-hint is-warn" style={{ marginTop: 6 }}>המכתב ייצא בלי {missingSections.join(', ')}.</div>
      )}

      <div className="of-tpl-acts">
        {history.length > 0 && <button type="button" className="btn btn-sm btn-ghost" onClick={undo}>↶ בטל</button>}
        {!sameAsFirm && !(sameAsSystem && !firm) && (
          <button type="button" className="btn btn-sm btn-ghost"
            title="הנוסח הזה יישמר גם כנקודת חזרה קבועה של המשרד — גם אם תשנה אותו בהמשך"
            onClick={() => apply(p => { const c = currentOf(p); return { ...p, subject: c.subject, body: c.body, firmDefault: c }; }, true)}>
            לזכור כנוסח הקבוע שלי
          </button>
        )}
        {firm && !sameAsFirm && (
          <button type="button" className="btn btn-sm btn-ghost"
            onClick={() => apply(p => (p.firmDefault ? { ...p, subject: p.firmDefault.subject, body: p.firmDefault.body } : p), true)}>
            חזרה לנוסח הקבוע שלי
          </button>
        )}
        {!sameAsSystem && (
          <button type="button" className="btn btn-sm btn-ghost"
            title="חוזר לנוסח המקורי של המערכת. הנוסח הקבוע שלך נשמר ואפשר לחזור אליו."
            onClick={() => apply(p => (p.firmDefault ? { firmDefault: p.firmDefault } : {}), true)}>
            חזרה לנוסח המערכת
          </button>
        )}
      </div>
    </div>
  );
}

// ─── עורך בקשה בספרייה ──────────────────────────────────────────────────────
// ‼ כל שמירה דרך upsert_library_request. נוסח מוכן (מובנית) לא נכתב — השרת שומר
// עותק של המשרד, בשקט; «חזרה לנוסח המוכן» מוחקת את העותק (delete_library_request),
// ואם פריט במסלול מצביע על העותק עצמו (מחיקה הייתה נדחית) — מחזירה את הנוסח
// המוכן לתוך העותק, כדי שהמסלול לא יישבר.
import { useEffect, useRef, useState } from 'react';
import Modal from '../../../ui/Modal';
import { isSeedTemplate, type RequestTemplate } from '../../../../lib/requestTemplates';
import { metaFor } from '../../../../types/journeyDefaults';
import { serverErrorText, upsertLibraryRequest, deleteLibraryRequest } from '../../../../features/flows/api';
import { libraryEntryGap } from '../../../../features/flows/compile';
import { templateEntryOwner } from '../../../../utils/templateEntryOwner';
import { entryOf, listOf, canRevertToPreset, canBeInFlow } from './libraryModel';
import { UsedIn, type GoFn, type LibraryUse } from './usedIn';

type ReqKind = 'confirm' | 'file' | 'files' | 'text' | 'email' | 'phone' | 'number' | 'date' | 'select';
const KIND_LABELS: Record<ReqKind, string> = {
  confirm: 'אישור', file: 'קובץ', files: 'כמה קבצים', text: 'תשובה בכתב',
  email: 'מייל', phone: 'טלפון', number: 'מספר', date: 'תאריך', select: 'בחירה מרשימה',
};
/** מה מציעים בעורך. סוג אחר שכבר שמור (בחירה מרשימה וכו') נשמר ומוצג, אבל לא מוצע. */
const OFFERED_KINDS: ReqKind[] = ['confirm', 'file', 'files', 'text'];
/** ‼ אותה הבחנה כמו officeDefaultRequests והקומפוזר בכרטיס: פריט שנקרא «צילום»/«אסמכתה» הוא קובץ. */
const suggestKind = (label: string): ReqKind => (/צילום|אסמכתה|קובץ|העתק/.test(label) ? 'file' : 'confirm');

interface EditItem {
  key: string;
  label: string;
  kind: ReqKind;
  /** המשתמש בחר סוג בעצמו — מפסיקים להציע לפי השם. */
  kindTouched: boolean;
  /** שדות נוספים מהפריט השמור (חובה, אפשרויות, מספר קבצים) — עוברים כמות שהם. */
  rest: Record<string, unknown>;
}

let keySeq = 0;
const newItemKey = () => `r${Date.now().toString(36)}${(keySeq++).toString(36)}`;

export interface RequestEditorProps {
  /** null = בקשה חדשה. */
  template: RequestTemplate | null;
  /** בקשה חדשה מתוך חיפוש שלא מצא — השם שהוקלד. */
  initialName?: string;
  /**
   * איפה הבקשה במסלולים (null = לא ידוע — המסלולים לא נטענו). ‼ נוסח מוכן מסוג קבוע
   * כולל גם את הפריט מאותו סוג בקליטה — והקישור נוחת עליו, שם מגדירים מה לקוח חדש מקבל
   * (בלי פסקת הסבר כאן).
   */
  uses: LibraryUse[] | null;
  onClose: () => void;
  onSaved: (name: string) => void;
  onDeleted: (name: string) => void;
  onReverted: (name: string) => void;
  go: GoFn;
}

export default function RequestEditor({ template, initialName, uses, onClose, onSaved, onDeleted, onReverted, go }: RequestEditorProps) {
  const entry = template ? entryOf(template) : undefined;
  const orig = (entry?.payload ?? {}) as Record<string, unknown>;
  const stepType = entry?.stepType || 'custom_request';
  const custom = stepType === 'custom_request';
  const meta = metaFor(stepType);
  // ‼ בקשה מסוג קבוע (למשל «מסמכים מהלקוח»): עורכים שם, נוסח ושמות הפריטים
  // בלבד — הסוג וצורת ה-payload שלה הם מה שהמחולל ודף הלקוח קוראים.
  const listKey: 'requirements' | 'checklist' | null =
    Array.isArray(orig.requirements) ? 'requirements' : Array.isArray(orig.checklist) ? 'checklist'
      : custom ? 'requirements'
      // בקשת מסמכים שנשמרה בלי רשימה — מציגים רשימה ריקה כדי שאפשר יהיה להשלים אותה
      : stepType === 'client_documents' ? 'checklist' : null;
  const seed = !!template && isSeedTemplate(template);
  const revertable = !!template && canRevertToPreset(template);
  // עותק של המשרד שאין לו נוסח מוכן קיים, ובקשה של המשרד — נמחקים. נוסח מוכן — לא.
  const deletable = !!template && !seed && !template.preset;
  const flowable = !template || canBeInFlow(template);

  const initialItems = (): EditItem[] => listOf(orig).map(x => {
    const { key, label, kind, done: _d, ...rest } = x as Record<string, unknown>;
    const k = (String(kind ?? '') || suggestKind(String(label ?? ''))) as ReqKind;
    return { key: String(key ?? '') || newItemKey(), label: String(label ?? ''), kind: k, kindTouched: !!kind, rest };
  });

  const [name, setName] = useState(template?.name ?? initialName ?? '');
  const [clientTitle, setClientTitle] = useState(String(orig.clientTitle ?? orig.title ?? ''));
  const [clientSub, setClientSub] = useState(String(orig.clientSub ?? ''));
  const [clientCta, setClientCta] = useState(String(orig.clientCta ?? ''));
  // ‼ מי יבצע בפועל (templateEntryOwner, כמו בשרת) — לא רק מה שנשמר: רשומה ישנה עם «המשרד»
  // ופריטים ללקוח נוצרת כבקשה ללקוח, והעורך מראה את זה.
  const savedOwner = entry ? templateEntryOwner(entry) : 'client';
  const [owner, setOwner] = useState<'client' | 'me' | 'external'>(savedOwner);
  const [requiredForClose, setRequiredForClose] = useState(entry?.requiredForClose !== false);
  const [items, setItems] = useState<EditItem[]>(initialItems);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<'delete' | 'revert' | null>(null);
  const [inUse, setInUse] = useState<string[] | null>(null);
  // ‼ השגיאה/האישור יושבים בתחתית החלון — בטלפון הם מחוץ למסך, ולחיצה נראתה כמו «לא קרה כלום».
  const feedbackRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (error || confirm || inUse) feedbackRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [error, confirm, inUse]);

  const editKinds = custom && listKey === 'requirements';
  const showCopy = owner !== 'me' && !meta.derivedCopy;

  const snapshot = (s: { name: string; clientTitle: string; clientSub: string; clientCta: string; owner: string; requiredForClose: boolean; items: EditItem[] }) =>
    JSON.stringify([s.name.trim(), s.clientTitle.trim(), s.clientSub.trim(), s.clientCta.trim(), s.owner, s.requiredForClose,
      s.items.map(x => [x.label.trim(), x.kind])]);
  const [initialSnap] = useState(() => snapshot({
    name: template?.name ?? initialName ?? '', clientTitle: String(orig.clientTitle ?? orig.title ?? ''), clientSub: String(orig.clientSub ?? ''),
    clientCta: String(orig.clientCta ?? ''), owner: savedOwner, requiredForClose: entry?.requiredForClose !== false,
    items: initialItems(),
  }));
  const dirty = snapshot({ name, clientTitle, clientSub, clientCta, owner, requiredForClose, items }) !== initialSnap;

  /** יציאה מהעורך (ביטול, או קישור למסלול) — עם שינויים שלא נשמרו, שואלים קודם. */
  const leave = (then?: () => void) => {
    if (dirty && !busy && !window.confirm('לצאת בלי לשמור?')) return;
    onClose();
    then?.();
  };
  const goOut: GoFn = (p, f) => leave(() => go(p, f));

  const patchItem = (i: number, p: Partial<EditItem>) => setItems(l => l.map((x, j) => (j === i ? { ...x, ...p } : x)));
  const move = (i: number, d: -1 | 1) => setItems(l => {
    const j = i + d;
    if (j < 0 || j >= l.length) return l;
    const n = [...l];
    [n[i], n[j]] = [n[j], n[i]];
    return n;
  });

  const kept = items.filter(x => x.label.trim());
  // ‼ «הכותרת שהלקוח רואה נגזרת מהרשימה» — כמו במחולל. בלי זה נשאר «להעלות 2 מסמכים»
  // אחרי שהרשימה גדלה ל-4, והטקסט הישן הגיע לדף ולמייל.
  const derivedTitle = kept.length === 1 ? 'להעלות מסמך אחד' : 'להעלות ' + kept.length + ' מסמכים';

  const save = async () => {
    setError(null);
    // ‼ «שמירה» בלי שינוי לא כותבת: בנוסח מוכן היא הייתה יוצרת עותק של המשרד בשקט,
    // ומעכשיו המשרד לא היה מקבל עדכונים לנוסח המוכן.
    if (template && !dirty) { onClose(); return; }
    const nm = name.trim();
    if (!nm) { setError(serverErrorText('missing_name') + '.'); return; }
    const payload: Record<string, unknown> = { ...orig };
    if (custom) payload.title = nm;
    if (showCopy) {
      payload.clientTitle = clientTitle.trim() || nm;
      payload.clientSub = clientSub.trim();
      payload.clientCta = clientCta.trim() || 'למילוי';
    }
    if (listKey === 'checklist') {
      payload.checklist = kept.map(x => ({ key: x.key, label: x.label.trim(), done: false }));
      if (meta.derivedCopy) {
        payload.clientTitle = derivedTitle;
        payload.clientSub = kept.map(x => x.label.trim()).join(' · ');
      }
    } else if (listKey === 'requirements') {
      payload.requirements = kept.map(x => ({ required: true, ...x.rest, key: x.key, kind: x.kind, label: x.label.trim(), done: false }));
    }
    // בקשה שאין בה מה ליצור — אותו כלל כמו בבונה ובשרת (libraryEntryGap / upsert_library_request).
    const gap = libraryEntryGap(stepType, owner, payload);
    if (gap) { setError(serverErrorText(gap === 'no_items' ? 'no_requirements' : 'no_documents') + '.'); return; }
    setBusy(true);
    const r = await upsertLibraryRequest(template?.id ?? null, nm, template?.description ?? null, {
      stepType, owner, requiredForClose, payload,
    });
    setBusy(false);
    if (r.ok === false) { setError(serverErrorText(r.error, 'השמירה נכשלה — אפשר לנסות שוב') + '.'); return; }
    onSaved(nm);
  };

  const remove = async () => {
    if (!template) return;
    setError(null);
    setBusy(true);
    const r = await deleteLibraryRequest(template.id);
    setBusy(false);
    if (r.ok === false) {
      if (r.error === 'in_use') { setInUse(r.flows ?? []); setConfirm(null); return; }
      setError(r.error === 'forbidden' ? 'אי אפשר למחוק את הבקשה הזאת.' : serverErrorText(r.error, 'המחיקה נכשלה — אפשר לנסות שוב') + '.');
      return;
    }
    onDeleted(template.name);
  };

  const revert = async () => {
    const preset = template?.preset;
    if (!template || !preset) return;
    setError(null);
    setBusy(true);
    const r = await deleteLibraryRequest(template.id);
    if (r.ok === false && r.error === 'in_use') {
      // ‼ פריט במסלול מצביע על הנוסח של המשרד עצמו — מחיקה הייתה שוברת אותו.
      // אותו מזהה, והנוסח המוכן בתוכו.
      const pe = preset.entries[0];
      const u = pe ? await upsertLibraryRequest(template.id, preset.name, preset.description ?? null, {
        // ‼ מי מבצע — כפי שהשרת יוצר מהנוסח המוכן (templateEntryOwner), כדי ש«המשרד» לא יסומן
        // כ«משימה של המשרד» (officeTask) על נוסח שנוצר תמיד כבקשה ללקוח.
        stepType: pe.stepType || 'custom_request', owner: templateEntryOwner(pe),
        requiredForClose: pe.requiredForClose !== false, payload: pe.payload ?? {},
      }) : { ok: false as const, error: 'template_not_found' };
      setBusy(false);
      if (u.ok === false) { setError(serverErrorText(u.error, 'החזרה נכשלה — אפשר לנסות שוב') + '.'); return; }
      onReverted(preset.name);
      return;
    }
    setBusy(false);
    if (r.ok === false) { setError(serverErrorText(r.error, 'החזרה נכשלה — אפשר לנסות שוב') + '.'); return; }
    onReverted(preset.name);
  };

  const askDelete = () => {
    setInUse(null);
    // ‼ ידוע מראש שהיא במסלול — אומרים את זה מיד, עם קישור לשלב, במקום סירוב מהשרת.
    if (uses && uses.length > 0) { setConfirm(null); setInUse(uses.map(u => u.flowName)); return; }
    setConfirm('delete');
  };

  const presetTitle = template?.preset ? String((template.preset.entries[0]?.payload ?? {}).clientTitle ?? template.preset.name) : '';
  const previewTitle = meta.derivedCopy ? derivedTitle : (clientTitle.trim() || name.trim() || 'כותרת הבקשה');
  const previewSub = meta.derivedCopy ? kept.map(x => x.label.trim()).join(' · ') : clientSub.trim();

  return (
    <Modal title={template ? template.name : 'בקשה חדשה בספרייה'} onClose={onClose} dirty={dirty && !busy} width={620}
      footer={<>
        {revertable && !confirm && (
          <button type="button" className="ui-btn ui-btn-ghost ui-foot-start" disabled={busy}
            onClick={() => { setInUse(null); setConfirm('revert'); }}>חזרה לנוסח המוכן</button>
        )}
        {deletable && !confirm && (
          <button type="button" className="ui-btn ui-btn-ghost ui-foot-start" style={{ color: 'var(--danger)' }}
            disabled={busy} onClick={askDelete}>מחיקה מהספרייה</button>
        )}
        <button type="button" className="ui-btn ui-btn-ghost" onClick={() => leave()} disabled={busy}>ביטול</button>
        <button type="button" className="ui-btn ui-btn-primary" onClick={() => void save()} disabled={busy}>
          {busy ? 'שומר…' : 'שמירה'}
        </button>
      </>}>
      <div className="lb-editor">
        <label className="of-field-wrap">
          <span className="of-field-label">שם הבקשה בספרייה</span>
          <input value={name} onChange={e => setName(e.target.value)} placeholder="למשל: אישורי ניכוי מס במקור" data-autofocus />
        </label>

        {custom && (
          <fieldset className="lb-fieldset">
            <legend className="of-field-label">מי עושה</legend>
            {/* ‼ שגיאה מניסיון קודם («צריך לפחות פריט…») לא נשארת אחרי שמחליפים מי עושה — היא כבר לא נכונה. */}
            <div className="of-seg" role="group" aria-label="מי עושה">
              <button type="button" aria-pressed={owner === 'client'} onClick={() => { setOwner('client'); setError(null); }}>הלקוח</button>
              <button type="button" aria-pressed={owner === 'me'} onClick={() => { setOwner('me'); setError(null); }}>המשרד</button>
              {owner === 'external' && <button type="button" aria-pressed>גורם חיצוני</button>}
            </div>
            {owner === 'me' && <span className="of-field-hint">לא מופיעה בדף של הלקוח ולא נכללת במייל — משימה שלך.</span>}
          </fieldset>
        )}

        {owner !== 'me' && !meta.extern && (
          <fieldset className="lb-fieldset">
            <legend className="lb-legend">מה הלקוח רואה</legend>
            <div className="lb-preview" aria-label="כך זה ייראה בדף של הלקוח">
              <span className="lb-preview-tag">בדף של הלקוח</span>
              <span className="lb-preview-title">{previewTitle}</span>
              {previewSub && <span className="lb-preview-sub">{previewSub}</span>}
              <span className="lb-preview-cta">{(meta.derivedCopy ? String(orig.clientCta ?? '') : clientCta.trim()) || (meta.derivedCopy ? 'להעלאה' : 'למילוי')}</span>
            </div>
            {showCopy && (
              <>
                <label className="of-field-wrap">
                  <span className="of-field-label">כותרת</span>
                  <input value={clientTitle} onChange={e => setClientTitle(e.target.value)} placeholder={name.trim() || 'כמו שם הבקשה'} />
                </label>
                <label className="of-field-wrap">
                  <span className="of-field-label">שורה מתחת לכותרת</span>
                  <input value={clientSub} onChange={e => setClientSub(e.target.value)} placeholder="למשל: שתי דקות, צילום בטלפון מספיק" />
                </label>
                <label className="of-field-wrap">
                  <span className="of-field-label">טקסט הכפתור</span>
                  <input value={clientCta} onChange={e => setClientCta(e.target.value)} placeholder="למילוי" />
                </label>
              </>
            )}
            {meta.derivedCopy && <span className="of-field-hint">הכותרת והשורה שמתחתיה נגזרות מרשימת המסמכים.</span>}
          </fieldset>
        )}

        {listKey && (
          <fieldset className="lb-fieldset">
            <legend className="lb-legend">
              {owner === 'me' ? 'מה צריך לעשות' : listKey === 'checklist' ? 'מה הלקוח מעלה' : 'מה הלקוח מעלה או מאשר'}
            </legend>
            <ol className="lb-items">
              {items.map((it, i) => (
                <li key={it.key} className="lb-item">
                  <input className="lb-item-label" value={it.label} aria-label={`פריט ${i + 1}`}
                    placeholder="למשל: צילום תעודת זהות"
                    onChange={e => {
                      const label = e.target.value;
                      patchItem(i, it.kindTouched || !editKinds ? { label } : { label, kind: suggestKind(label) });
                    }} />
                  {editKinds && (
                    <select className="lb-item-kind" value={it.kind} aria-label={`סוג פריט ${i + 1}`}
                      onChange={e => patchItem(i, { kind: e.target.value as ReqKind, kindTouched: true })}>
                      {[...OFFERED_KINDS, ...(OFFERED_KINDS.includes(it.kind) ? [] : [it.kind])].map(k => (
                        <option key={k} value={k}>{KIND_LABELS[k] ?? k}</option>
                      ))}
                    </select>
                  )}
                  <span className="lb-item-acts">
                    <button type="button" className="lb-icon" aria-label={`להזיז למעלה: ${it.label || `פריט ${i + 1}`}`}
                      disabled={i === 0} onClick={() => move(i, -1)}>↑</button>
                    <button type="button" className="lb-icon" aria-label={`להזיז למטה: ${it.label || `פריט ${i + 1}`}`}
                      disabled={i === items.length - 1} onClick={() => move(i, 1)}>↓</button>
                    <button type="button" className="lb-icon" aria-label={`הסרה: ${it.label || `פריט ${i + 1}`}`}
                      onClick={() => setItems(l => l.filter((_, j) => j !== i))}>×</button>
                  </span>
                </li>
              ))}
            </ol>
            <button type="button" className="of-link lb-add-item"
              onClick={() => setItems(l => [...l, { key: newItemKey(), label: '', kind: 'confirm', kindTouched: false, rest: {} }])}>
              ＋ פריט
            </button>
            {editKinds && owner !== 'me' && <span className="of-field-hint">פריט שנקרא «צילום» או «אסמכתה» הופך לקובץ להעלאה; השאר — אישור. אפשר לשנות.</span>}
          </fieldset>
        )}

        {/* ‼ «חובה» הוא רק ברירת המחדל כשמוסיפים את הבקשה למסלול — סוג שלא נכנס לאף מסלול לא שואל.
            והקליטה נאמרת רק על בקשה חופשית: רק אותה אפשר להוסיף למסלול הקליטה (AddSheet). */}
        {flowable && (
          <label className="of-check lb-check">
            <input type="checkbox" checked={requiredForClose} onChange={e => setRequiredForClose(e.target.checked)} />
            <span>
              <span className="of-check-label">חובה, כברירת מחדל</span>
              <span className="of-check-hint">
                כשמוסיפים אותה למסלול היא מסומנת «חובה» — השלב{custom ? ' (ובקליטה גם הקליטה)' : ''} לא נסגר בלעדיה. בפריט שבמסלול אפשר לשנות.
              </span>
            </span>
          </label>
        )}

        {template && (
          <div className="lb-where">
            {/* בזמן «אי אפשר למחוק» הקישורים מופיעים בהודעה עצמה — לא פעמיים. */}
            {uses && !inUse && (
              <div><UsedIn uses={uses} go={goOut} loading={false} none={flowable ? undefined : 'רק מכרטיס הלקוח'} /></div>
            )}
            <span className="of-field-hint">
              {seed
                ? 'זה נוסח מוכן. השינויים נשמרים כנוסח של המשרד, ותמיד אפשר לחזור לנוסח המוכן. '
                : ''}
              שינוי חל על בקשות שייפתחו מעכשיו; מה שכבר נפתח אצל לקוחות לא משתנה.
            </span>
          </div>
        )}

        <div ref={feedbackRef} className="lb-feedback">
        {error && <p className="lb-error" role="alert">{error}</p>}

        {confirm === 'delete' && template && (
          <div className="lb-confirm" role="alertdialog" aria-label={`מחיקת ${template.name}`}>
            <p>למחוק את «{template.name}» מהספרייה? בקשות שכבר נפתחו אצל לקוחות נשארות כמו שהן.</p>
            <div className="lb-confirm-acts">
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => setConfirm(null)} disabled={busy}>חזרה</button>
              <button type="button" className="btn btn-danger btn-sm" onClick={() => void remove()} disabled={busy}>
                {busy ? 'מוחק…' : 'מחיקה'}
              </button>
            </div>
          </div>
        )}
        {confirm === 'revert' && template?.preset && (
          <div className="lb-confirm" role="alertdialog" aria-label="חזרה לנוסח המוכן">
            <p>
              לחזור לנוסח המוכן? השינויים של המשרד בבקשה הזו יימחקו, ומעכשיו ייפתח הנוסח המוכן —
              הלקוח יראה «{presetTitle}». בקשות שכבר נפתחו אצל לקוחות לא משתנות.
            </p>
            <div className="lb-confirm-acts">
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => setConfirm(null)} disabled={busy}>ביטול</button>
              <button type="button" className="btn btn-secondary btn-sm" onClick={() => void revert()} disabled={busy}>
                {busy ? 'מחזיר…' : 'חזרה לנוסח המוכן'}
              </button>
            </div>
          </div>
        )}
        {inUse && (
          <div className="lb-confirm" role="alert">
            <p>
              אי אפשר למחוק: הבקשה בשימוש {new Set(inUse).size === 1 ? 'במסלול' : 'במסלולים'} {[...new Set(inUse)].map(n => `«${n}»`).join(', ')}.
              קודם מוציאים אותה משם, ואז מוחקים.
            </p>
            {uses && uses.length > 0
              ? <UsedIn uses={uses} go={goOut} loading={false} />
              : <button type="button" className="of-link" onClick={() => goOut('flows')}>למסלולים ←</button>}
          </div>
        )}
        </div>
      </div>
    </Modal>
  );
}

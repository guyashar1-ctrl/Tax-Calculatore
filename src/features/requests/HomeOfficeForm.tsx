// ─── שאלון עבודה מהבית — אותו טופס ללקוח (דף אישי) ולמשרד (מילוי/תיקון) ───────
import './requestGroups.css';
// ‼ שלוש שאלות לפי מספר חדרים (הדמיה מאושרת): האם יש חדר שמשמש רק לעסק; כמה
// חדרים בבית בסך הכול (כולל חדרי העסק); כמה מהם רק לעסק. היחס המחושב הוא אומדן
// לבדיקת המשרד — לא זכאות. חדרים חריגים — בהערה.
import { useId, useState } from 'react';
import {
  HOME_OFFICE_ERROR_TEXT, ROOM_COUNT_HELP, ROOM_NOTE_HELP, roomRatioPercent, validateHomeOffice, formatPercent,
  type HomeOfficeInput, type ValidHomeOffice,
} from './homeOffice';

export interface HomeOfficeFormProps {
  initial?: Partial<HomeOfficeInput> | null;
  /** מילות היחס — «המשרד יבדוק» ללקוח, «יחס מחושב» למשרד. */
  audience: 'client' | 'office';
  disabled?: boolean;
  /** מחזיר את התשובות התקינות למי שעוטף (שולח יחד עם שם העסק / שומר). null ⇒ לא תקין. */
  onChange: (valid: ValidHomeOffice | null) => void;
  /** הצגת שגיאות לפני ניסיון שליחה — רק אחרי שהמשתמש ניסה. */
  showErrors?: boolean;
}

const fmtInit = (v: unknown) => (v === null || v === undefined ? '' : String(v));

export default function HomeOfficeForm({ initial, audience, disabled, onChange, showErrors }: HomeOfficeFormProps) {
  const uid = useId();
  const [has, setHas] = useState<'' | 'yes' | 'no'>(
    initial?.hasDedicatedRoom === true ? 'yes' : initial?.hasDedicatedRoom === false ? 'no' : '');
  const [total, setTotal] = useState(fmtInit(initial?.totalRooms));
  const [biz, setBiz] = useState(fmtInit(initial?.businessRooms));
  const [note, setNote] = useState(fmtInit(initial?.note));

  const input: HomeOfficeInput = { hasDedicatedRoom: has === '' ? null : has === 'yes', totalRooms: total, businessRooms: biz, note };
  const v = validateHomeOffice(input);
  const emit = (next: Partial<{ has: typeof has; total: string; biz: string; note: string }>) => {
    const n = { has, total, biz, note, ...next };
    const r = validateHomeOffice({ hasDedicatedRoom: n.has === '' ? null : n.has === 'yes', totalRooms: n.total, businessRooms: n.biz, note: n.note });
    onChange(r.ok ? r.value : null);
  };
  const ratio = v.ok && v.value.hasDedicatedRoom ? roomRatioPercent(v.value.totalRooms, v.value.businessRooms) : null;
  const err = !v.ok ? HOME_OFFICE_ERROR_TEXT[v.error] : null;
  // ‼ שגיאה של יחס בלתי אפשרי נאמרת מיד (כמו בהדמיה); «חסר» — רק אחרי ניסיון שליחה.
  const liveErr = !v.ok && (v.error === 'business_rooms_exceed_total' || v.error === 'rooms_precision' || v.error === 'rooms_not_numeric'
    || v.error === 'rooms_too_many' || v.error === 'rooms_not_positive') && total !== '' && biz !== '';
  const shownErr = err && (showErrors || liveErr) ? err : null;

  return (
    <div className="ho-form">
      <label className="ho-field">
        <span className="ho-label">האם יש בבית חדר שמשמש רק לעבודה בעסק?</span>
        <select value={has} disabled={disabled} aria-describedby={shownErr ? `${uid}-err` : undefined}
          onChange={e => { const x = e.target.value as typeof has; setHas(x); emit({ has: x }); }}>
          <option value="">בחירה</option>
          <option value="yes">כן</option>
          <option value="no">לא</option>
        </select>
      </label>
      {has === 'yes' && (
        <>
          <div className="ho-pair">
            <label className="ho-field">
              <span className="ho-label">כמה חדרים יש בבית בסך הכול?</span>
              <input type="text" inputMode="decimal" dir="ltr" value={total} disabled={disabled} autoComplete="off"
                aria-describedby={`${uid}-help`}
                onChange={e => { setTotal(e.target.value); emit({ total: e.target.value }); }} />
            </label>
            <label className="ho-field">
              <span className="ho-label">כמה מהם משמשים רק לעסק?</span>
              <input type="text" inputMode="decimal" dir="ltr" value={biz} disabled={disabled} autoComplete="off"
                aria-describedby={`${uid}-help`}
                onChange={e => { setBiz(e.target.value); emit({ biz: e.target.value }); }} />
            </label>
          </div>
          <p className="ho-help" id={`${uid}-help`}>{ROOM_COUNT_HELP}</p>
          <label className="ho-field">
            <span className="ho-label">הערה <span className="ho-opt">(לא חובה)</span></span>
            <textarea rows={2} value={note} disabled={disabled} maxLength={1000} placeholder={ROOM_NOTE_HELP}
              onChange={e => { setNote(e.target.value); emit({ note: e.target.value }); }} />
          </label>
        </>
      )}
      {ratio !== null && !shownErr && (
        <p className="ho-ratio" aria-live="polite">
          יחס לפי מספר החדרים: <strong>{formatPercent(ratio)}</strong>
          {audience === 'client' ? ' · המשרד יבדוק ויאשר את האחוז המתאים.' : ' · זו הצעה לבדיקה, לא האחוז המאושר.'}
        </p>
      )}
      {shownErr && <p className="ho-err" id={`${uid}-err`} role="alert">{shownErr}</p>}
    </div>
  );
}

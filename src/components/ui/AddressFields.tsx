// ─── יישוב ורחוב מרשימה סגורה · הרכיב היחיד ─────────────────────────────────
// כל מקום שבו מזינים כתובת מגורים (טופס הקליטה, ייפוי הכוח, כרטיס הלקוח,
// «פרטי הנישום», השאלון השנתי) משתמש בזה. היישוב — מרשימת רשות האוכלוסין;
// הרחוב — מרחובות היישוב שנבחר; ביישוב בלי רחובות שדה הרחוב נעלם.
//
// ‼ מה יוצא החוצה: שתי מחרוזות, city ו-address, בדיוק כמו קודם — ולכן אף
//   RPC או שמירה לא השתנו. המסד מזהה מהן סמל יישוב, רחוב ויישוב מזכה (285).
// ‼ רחוב חדש שעוד לא ברשימה — אפשר לכתוב. יישוב — רק כשאין שום התאמה
//   ברשימה (יש יישובים שעוד לא נכנסו אליה), והמשרד רואה שלא זוהה.
// ‼ בלי רשת (צפייה לדוגמה) או כשהרשימה לא נטענה — שני שדות טקסט, כמו פעם.
import { useEffect, useId, useMemo, useRef, useState, type CSSProperties } from 'react';
import HebrewTextInput from './HebrewTextInput';
import { loadLocalities, loadStreets } from '../../lib/ilAddressData';
import {
  composeAddress, findByName, normIl, searchByName, splitAddress, NO_STREET_CODE,
  type IlLocality, type IlStreet,
} from '../../utils/ilAddress';

type Picked<T> = { item: T; free?: false } | { item: { name: string }; free: true } | null;

export interface AddressFieldsProps {
  city: string;
  address: string;
  /** רק על פעולה של המשתמש — לא בטעינה, כדי שטופס לא ייראה «שונה». */
  onChange: (v: { city: string; address: string }) => void;
  /** מה חסר כדי שהכתובת תהיה שלמה (null = שלמה). נקרא גם בטעינה. */
  onProblem?: (problem: string | null) => void;
  offline?: boolean;
  inputStyle?: CSSProperties;
  labelStyle?: CSSProperties;
  fieldStyle?: CSSProperties;
  /** מחלקה לכל שדה — למשל form-group במשרד */
  fieldClassName?: string;
  cityLabel?: string;
}

export default function AddressFields(p: AddressFieldsProps) {
  const [all, setAll] = useState<IlLocality[] | null | 'loading'>(p.offline ? null : 'loading');
  useEffect(() => {
    if (p.offline) return;
    let live = true;
    loadLocalities().then(l => { if (live) setAll(l); });
    return () => { live = false; };
  }, [p.offline]);

  // ערך שהגיע מבחוץ (למשל פרטים שנקראו מספח ת.ז.) — הטופס נבנה מחדש ממנו.
  // ערך שהטופס עצמו שלח — לא, אחרת כל הקלדה הייתה מאפסת אותו.
  const own = useRef({ city: p.city, address: p.address });
  const [gen, setGen] = useState(0);
  useEffect(() => {
    if (p.city !== own.current.city || p.address !== own.current.address) {
      own.current = { city: p.city, address: p.address };
      setGen(g => g + 1);
    }
  }, [p.city, p.address]);
  const onChange = (v: { city: string; address: string }) => { own.current = v; p.onChange(v); };

  if (all === 'loading') return <div style={p.fieldStyle} className="addr-loading" aria-busy="true">טוען את רשימת היישובים…</div>;
  if (!all) return <PlainFields {...p} />;
  return <ListFields key={gen} {...p} onChange={onChange} localities={all} />;
}

// ─── בלי רשימה: כמו פעם ───────────────────────────────────────────────────────
function PlainFields(p: AddressFieldsProps) {
  useEffect(() => { p.onProblem?.(!p.city.trim() ? 'יש להזין יישוב' : !p.address.trim() ? 'יש להזין רחוב ומספר בית' : null); });
  return (
    <>
      <div style={p.fieldStyle} className={fc(p)}>
        <label style={p.labelStyle}>{p.cityLabel ?? 'יישוב'}
          <HebrewTextInput style={p.inputStyle} value={p.city} autoComplete="address-level2"
            onChange={e => p.onChange({ city: e.target.value, address: p.address })} />
        </label>
      </div>
      <div style={p.fieldStyle} className={fc(p)}>
        <label style={p.labelStyle}>רחוב ומספר בית
          <HebrewTextInput style={p.inputStyle} value={p.address} placeholder="הרצל 10, דירה 3" autoComplete="street-address"
            onChange={e => p.onChange({ city: p.city, address: e.target.value })} />
        </label>
      </div>
    </>
  );
}

// ─── עם הרשימה ────────────────────────────────────────────────────────────────
function ListFields(p: AddressFieldsProps & { localities: IlLocality[] }) {
  const { localities } = p;
  const initial = useMemo(() => {
    const loc = findByName(localities, p.city);
    return { loc: loc ? { item: loc } : p.city.trim() ? { item: { name: p.city.trim() }, free: true as const } : null, ...splitAddress(p.address) };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [localities]);

  const [loc, setLoc] = useState<Picked<IlLocality>>(initial.loc);
  const [streets, setStreets] = useState<IlStreet[] | null>(null);
  const [street, setStreet] = useState<Picked<IlStreet>>(initial.street ? { item: { name: initial.street }, free: true } : null);
  const [house, setHouse] = useState(initial.house);
  const [apt, setApt] = useState(initial.apartment);
  // אחרי כל בחירה — לשדה הבא (בטלפון: בלי לחפש אותו)
  const [focus, setFocus] = useState<'city' | 'street' | 'house' | null>(null);
  const houseRef = useRef<HTMLInputElement>(null);
  useEffect(() => { if (focus === 'house') houseRef.current?.focus(); }, [focus]);

  const locItem = loc && !loc.free ? loc.item : null;
  const noStreets = !!locItem && !locItem.hasStreets;

  // רחובות היישוב. הכתובת השמורה מפורקת שוב מול הרשימה — כך «דרך 4 12»
  // נקרא כרחוב «דרך 4» ובית 12 — ורחוב שנמצא נקשר אליה. רק עד שהמשתמש נגע.
  const touched = useRef(false);
  const savedAddress = useRef(p.address);
  useEffect(() => {
    setStreets(null);
    if (!locItem || !locItem.hasStreets) return;
    let live = true;
    loadStreets(locItem.code).then(list => {
      if (!live || !list) return;
      const real = list.filter(s => s.code !== NO_STREET_CODE);
      setStreets(real);
      if (touched.current) return;
      const sp = splitAddress(savedAddress.current, real);
      const hit = findByName(real, sp.street);
      if (hit) { setStreet({ item: hit }); setHouse(sp.house); setApt(sp.apartment); }
    });
    return () => { live = false; };
  }, [locItem?.code]); // eslint-disable-line react-hooks/exhaustive-deps

  const problem = !loc ? 'יש לבחור יישוב מהרשימה'
    : noStreets ? null
    : !street ? 'יש לבחור רחוב'
    : !house.trim() ? 'יש להזין מספר בית'
    : null;
  const onProblem = p.onProblem;
  useEffect(() => { onProblem?.(problem); }, [problem, onProblem]);

  function emit(next: { loc?: Picked<IlLocality>; street?: Picked<IlStreet>; house?: string; apt?: string }) {
    touched.current = true;
    const l = next.loc !== undefined ? next.loc : loc;
    const s = next.street !== undefined ? next.street : street;
    const h = next.house ?? house;
    const a = next.apt ?? apt;
    const li = l && !l.free ? l.item : null;
    const streetName = li && !li.hasStreets ? li.name : s?.item.name ?? '';
    p.onChange({ city: l?.item.name ?? '', address: composeAddress(streetName, h, a) });
  }

  const ids = useId();
  return (
    <>
      <div style={p.fieldStyle} className={fc(p)}>
        <label style={p.labelStyle} htmlFor={`${ids}-city`}>{p.cityLabel ?? 'יישוב'}</label>
        {loc
          ? <PickedBox style={p.inputStyle} text={loc.item.name} tag={loc.free ? 'לא מהרשימה' : undefined}
              onChange={() => { setFocus('city'); setLoc(null); setStreet(null); setHouse(''); setApt(''); emit({ loc: null, street: null, house: '', apt: '' }); }} />
          : <Combo id={`${ids}-city`} autoFocus={focus === 'city'} inputStyle={p.inputStyle} placeholder="מתחילים להקליד…" autoComplete="address-level2"
              search={q => searchByName(localities, q)}
              freeWhenEmpty={q => `«${q}» לא ברשימה — להשתמש בזה`}
              onPick={it => { const next: Picked<IlLocality> = 'code' in it ? { item: it as IlLocality } : { item: it, free: true }; setLoc(next); setStreet(null); setFocus('street'); emit({ loc: next, street: null }); }} />}
      </div>

      {!noStreets && (
        <div style={p.fieldStyle} className={fc(p)}>
          <label style={p.labelStyle} htmlFor={`${ids}-street`}>רחוב</label>
          {street
            ? <PickedBox style={p.inputStyle} text={street.item.name} tag={street.free && streets ? 'לא מהרשימה' : undefined}
                onChange={() => { setFocus('street'); setStreet(null); emit({ street: null }); }} />
            : <Combo id={`${ids}-street`} autoFocus={focus === 'street'} inputStyle={p.inputStyle} disabled={!loc}
                placeholder={loc ? 'מתחילים להקליד…' : 'קודם בוחרים יישוב'} autoComplete="address-line1"
                search={q => (streets ? searchByName(streets, q) : [])}
                freeAlways={q => (streets ? `«${q}» לא ברשימה — להשתמש בזה` : `להשתמש ב«${q}»`)}
                onPick={it => { const next: Picked<IlStreet> = 'code' in it ? { item: it as IlStreet } : { item: it, free: true }; setStreet(next); setFocus('house'); emit({ street: next }); }} />}
          {street?.free && streets && <div className="addr-hint">נשמר כמו שכתבת. המשרד יראה שהרחוב לא מהרשימה.</div>}
        </div>
      )}

      <div className={["addr-row", p.fieldClassName].filter(Boolean).join(" ")}>
        <div style={p.fieldStyle} className="addr-field">
          <label style={p.labelStyle}>{noStreets ? 'מספר בית (לא חובה)' : 'מספר בית'}
            <input ref={houseRef} style={p.inputStyle} value={house} dir="ltr" maxLength={8} autoComplete="off"
              onChange={e => { const v = e.target.value.replace(/[^\dא-ת]/g, ''); setHouse(v); emit({ house: v }); }} />
          </label>
        </div>
        <div style={p.fieldStyle} className="addr-field">
          <label style={p.labelStyle}>דירה (לא חובה)
            <input style={p.inputStyle} value={apt} dir="ltr" inputMode="numeric" maxLength={6} autoComplete="off"
              onChange={e => { const v = e.target.value.replace(/[^\d]/g, ''); setApt(v); emit({ apt: v }); }} />
          </label>
        </div>
      </div>
    </>
  );
}

function PickedBox({ text, tag, onChange, style }: { text: string; tag?: string; onChange: () => void; style?: CSSProperties }) {
  return (
    <div className="addr-picked" style={style}>
      <b>{text}</b>
      {tag && <span className="addr-tag">{tag}</span>}
      <button type="button" onClick={onChange}>שינוי</button>
    </div>
  );
}

// ─── combobox: חיפוש בהקלדה, חיצים, Enter, Escape ──────────────────────────────
function Combo<T extends { name: string }>({ id, search, onPick, freeAlways, freeWhenEmpty, inputStyle, placeholder, disabled, autoComplete, autoFocus }: {
  id: string;
  search: (q: string) => T[];
  onPick: (item: T | { name: string }) => void;
  freeAlways?: (q: string) => string;
  freeWhenEmpty?: (q: string) => string;
  inputStyle?: CSSProperties; placeholder?: string; disabled?: boolean; autoComplete?: string; autoFocus?: boolean;
}) {
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const [idx, setIdx] = useState(0);
  const items = useMemo(() => search(q), [q, search]);
  const trimmed = q.trim();
  const free = trimmed && (freeAlways ? freeAlways(trimmed) : items.length === 0 && freeWhenEmpty ? freeWhenEmpty(trimmed) : null);
  const total = items.length + (free ? 1 : 0);
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => { if (autoFocus) inputRef.current?.focus(); }, [autoFocus]);

  const pick = (i: number) => {
    if (i < items.length) onPick(items[i]);
    else if (free) onPick({ name: trimmed });
    setOpen(false); setQ('');
  };

  return (
    <div className="addr-combo">
      <HebrewTextInput
        id={id} ref={inputRef} style={inputStyle} value={q} placeholder={placeholder} disabled={disabled}
        autoComplete={autoComplete} role="combobox" aria-expanded={open && !!trimmed} aria-controls={`${id}-list`}
        aria-activedescendant={open && total ? `${id}-o${idx}` : undefined} aria-autocomplete="list"
        onChange={e => { setQ(e.target.value); setOpen(true); setIdx(0); }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        onKeyDown={e => {
          if (!open || !total) return;
          if (e.key === 'ArrowDown') { e.preventDefault(); setIdx(i => (i + 1) % total); }
          else if (e.key === 'ArrowUp') { e.preventDefault(); setIdx(i => (i - 1 + total) % total); }
          else if (e.key === 'Enter') { e.preventDefault(); pick(idx); }
          else if (e.key === 'Escape') setOpen(false);
        }}
      />
      {open && trimmed && (
        <div className="addr-list" role="listbox" id={`${id}-list`}>
          {items.map((it, i) => (
            <div key={`${it.name}-${i}`} id={`${id}-o${i}`} role="option" aria-selected={i === idx} className="addr-opt"
              onMouseDown={e => { e.preventDefault(); pick(i); }}>{highlight(it.name, trimmed)}</div>
          ))}
          {items.length === 0 && <div className="addr-opt addr-none">לא נמצא ברשימה</div>}
          {free && (
            <div id={`${id}-o${items.length}`} role="option" aria-selected={idx === items.length} className="addr-opt addr-free"
              onMouseDown={e => { e.preventDefault(); pick(items.length); }}>{free}</div>
          )}
        </div>
      )}
    </div>
  );
}

function highlight(name: string, q: string) {
  const i = name.indexOf(q);
  if (i < 0) {
    const n = normIl(q);
    return normIl(name).startsWith(n) ? <><mark>{name.slice(0, q.length)}</mark>{name.slice(q.length)}</> : name;
  }
  return <>{name.slice(0, i)}<mark>{name.slice(i, i + q.length)}</mark>{name.slice(i + q.length)}</>;
}

const fc = (p: AddressFieldsProps) => ['addr-field', p.fieldClassName].filter(Boolean).join(' ');

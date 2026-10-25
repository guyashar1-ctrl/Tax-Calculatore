import {bookkeepingFields} from './types';
// ─────────────────────────────────────────────────────────────────────────────
// ניהול ספרים — המסך הראשי במרכז הידע
// ארבעה מסלולים: אשף "אילו ספרים העסק חייב" · 15 התוספות · מילון הספרים · כללים
// ─────────────────────────────────────────────────────────────────────────────
import { useMemo, useState, useEffect, useRef } from 'react';
import {
  AddendumTier, BookkeepingAddendum, BusinessTypeEntry, matchTier, searchBusinessTypes,
} from './types';
import { ADDENDA, getAddendum } from './addendaData';
import {
  BOOK_DICTIONARY, DISQUALIFICATION, ELIGIBLE_TAXPAYER, KEY_DEFINITIONS,
  RECORDING_RULES, RELIEFS, VAT_NOTE,
} from './generalData';
import { BUSINESS_TYPES, DECISION_QUESTIONS } from './businessTypes';

/* קיבוץ = קו ואוויר, לא קופסה. שני הקבועים האלה מוזרקים בעשרות מקומות
   בקובץ הזה, ולכן הם המקום היחיד שצריך לשנות כדי שכל המסך ידבר את השפה. */
const card: React.CSSProperties = { borderTop: '1px solid var(--hairline-2)', padding: '.85rem 0 .95rem' };
const chip = (_bg: string, color: string): React.CSSProperties => ({ display: 'inline-block', fontSize: 'var(--fs-12)', fontWeight: 500, color });

type View = 'wizard' | 'addenda' | 'dictionary' | 'rules';

export default function BookkeepingKnowledge() {
  const [view, setView] = useState<View>('wizard');
  const [openAddendum, setOpenAddendum] = useState<string | null>(null);
  const firstBookEntry=useRef(true);useEffect(()=>{if(firstBookEntry.current){firstBookEntry.current=false;return}const intro=document.querySelector<HTMLElement>('.work-tool-bookkeeping .bk-intro');intro?.scrollIntoView({block:'start'});document.querySelector<HTMLElement>(openAddendum?'[data-book-addendum]':'.work-tool-bookkeeping .tabs [aria-pressed=true]')?.focus({preventScroll:true})},[view,openAddendum]);

  const tabs: { key: View; label: string }[] = [
    { key: 'wizard', label: 'אילו ספרים העסק חייב?' },
    { key: 'addenda', label: '15 התוספות' },
    { key: 'dictionary', label: 'מילון הספרים' },
    { key: 'rules', label: 'כללים לכולם' },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      <div className="bk-intro">
        <div className="bk-intro-title">הוראות ניהול ספרים</div>
        <div className="bk-intro-text">מאתרים את הפעילות, ואז משלימים מחזור ונתוני ענף. בעסק מעורב ייתכנו התאמות.<details className="bk-intro-detail"><summary>תחולה ועקרונות הבחירה</summary><p>
          מאגר עיון משולב 2025–2026; האשף אינו בוחר גרסת דין שנתית. לפני קביעת חובה מאמתים את הנוסח והסכומים לשנת העסק. עסק עשוי לכלול כמה פעילויות עם דרישות שונות. לצורך האיתור מוצגות 15 התוספות של הוראות ניהול פנקסי חשבונות (תשל"ג-1973) - לפי סוג העסק.
          בתוך התוספת, רשימת הספרים נקבעת לפי מדרגה (מחזור / מועסקים). מי שלא נכנס לאף תוספת ייעודית - שייך לתוספת יא' (סעיף הסל).
        </p></details></div>
      </div>

      <div className="tabs">
        {tabs.map(t => (
          <button key={t.key} onClick={() => { setView(t.key); setOpenAddendum(null); }}
            aria-pressed={view===t.key} className={view === t.key ? 'active' : ''}>
            {t.label}
          </button>
        ))}
      </div>

      {view === 'wizard' && <Wizard onOpenAddendum={id => { setOpenAddendum(id); setView('addenda'); }} />}
      {view === 'addenda' && (openAddendum
        ? <AddendumDetail addendum={getAddendum(openAddendum)!} onBack={() => setOpenAddendum(null)} />
        : <AddendaGrid onOpen={setOpenAddendum} />)}
      {view === 'dictionary' && <Dictionary />}
      {view === 'rules' && <GeneralRules />}
    </div>
  );
}

// ─── האשף ────────────────────────────────────────────────────────────────────

function Wizard({ onOpenAddendum }: { onOpenAddendum: (id: string) => void }) {
  const [query, setQuery] = useState('');
  const [picked, setPicked] = useState<BusinessTypeEntry | null>(null);
  const [showQuestions, setShowQuestions] = useState(false);
  const [turnover, setTurnover] = useState('');
  const [employees, setEmployees] = useState('');
  const [manualTier, setManualTier] = useState<string | null>(null);
  const [bookFacts,setBookFacts]=useState<Record<string,string>>({});

  const results = useMemo(() => searchBusinessTypes(BUSINESS_TYPES, query).slice(0, 12), [query]);
  const addendum = picked ? getAddendum(picked.addendumId) : null;

  const turnoverNum = turnover.trim() ? Number(turnover.replace(/,/g, '')) : null;
  const employeesNum = employees.trim() ? Number(employees) : null;
  const manualScope=false,missingEmployees=false;
  const facts:Record<string,string>=addendum?{...Object.fromEntries(bookkeepingFields(addendum.id).filter((f:any)=>f.options).map((f:any)=>[f.key,f.options[0]])),...bookFacts}:bookFacts;
  const autoTier=addendum?matchTier(addendum,turnoverNum,employeesNum,facts):null;
  const activeTier: AddendumTier | null =
    (manualTier && addendum?.tiers.find(t => t.id === manualTier)) ||
    autoTier;

  useEffect(()=>{const sync=()=>{const seg=decodeURIComponent(location.hash.split('/')[2]||'');const hit=seg?BUSINESS_TYPES.find(b=>b.label===seg)||null:null;if(hit&&hit.label!==picked?.label){setPicked(hit);setTurnover('');setEmployees('');setManualTier(null);setBookFacts({})}else if(!seg&&picked&&BUSINESS_TYPES.some(b=>b.label===picked.label))reset()};sync();addEventListener('hashchange',sync);return()=>removeEventListener('hashchange',sync)},[picked]);
  function reset() {
    setPicked(null); setQuery(''); setTurnover(''); setEmployees(''); setManualTier(null); setShowQuestions(false);setBookFacts({});
  }

  if (!picked) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '.9rem' }}>
        <div style={card}>
          <div style={{ fontSize: 'var(--fs-15)', fontWeight: 600, marginBottom: '.5rem' }}>מה העסק עושה?</div>
          <input
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder='הקלד סוג עסק: "מסעדה", "שיפוצניק", "עורך דין", "חנות אונליין"…'
            className="bk-field bk-field-wide"
            aria-label="סוג הפעילות העסקית"
          />
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(230px, 1fr))', gap: '.6rem' }}>
          {results.map(e => {
            const a = getAddendum(e.addendumId)!;
            return (
              <div key={e.label} role="button" tabIndex={0} aria-label={e.label} onKeyDown={event=>{if(event.target===event.currentTarget&&(event.key==='Enter'||event.key===' ')){event.preventDefault();location.hash='#tool/bookkeeping/'+encodeURIComponent(e.label)}}} onClick={() => {location.hash='#tool/bookkeeping/'+encodeURIComponent(e.label)}}
                style={{ ...card, cursor: 'pointer', padding: '.7rem .9rem', display: 'flex', gap: '.6rem', alignItems: 'center' }}>
                <span style={{ fontSize: '20px' }}>{a.icon}</span>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontWeight: 600, fontSize: '14px' }}>{e.label}</div>
                  <div style={{ fontSize: '12px', color: 'var(--gray-500)' }}>תוספת {a.letter} - {a.title}</div>
                </div>
              </div>
            );
          })}
        </div>

        {query.trim() && results.length === 0 && (
          <div style={{ ...card, color: 'var(--gray-600)', fontSize: '14px' }}>
            לא נמצא ברשימה - נסו ניסוח אחר, או השתמשו בשאלות ההכרעה למטה. מי שלא נכנס לאף תוספת - שייך לתוספת יא' (סעיף הסל).
          </div>
        )}

        <div style={card}>
          <div role="button" tabIndex={0} aria-expanded={showQuestions} onKeyDown={event=>{if(event.target===event.currentTarget&&(event.key==='Enter'||event.key===' ')){event.preventDefault();setShowQuestions(!showQuestions)}}} onClick={() => setShowQuestions(!showQuestions)} className="bk-link bk-link-strong">
            {showQuestions ? '▾' : '◂'} העסק לא ברשימה? שאלות הכרעה
          </div>
          {showQuestions && (
            <div style={{ marginTop: '.7rem', display: 'flex', flexDirection: 'column', gap: '.6rem' }}>
              {DECISION_QUESTIONS.map((q, i) => (
                <div key={i} className="bk-q">
                  <div style={{ fontWeight: 600, fontSize: '14px' }}>{i + 1}. {q.question}</div>
                  <div style={{ fontSize: '13px', color: 'var(--gray-600)', marginTop: '.15rem' }}>{q.answer}</div>
                </div>
              ))}
              <div style={{ display: 'flex', gap: '.4rem', flexWrap: 'wrap', marginTop: '.3rem' }}>
                {ADDENDA.map(a => (
                  <button key={a.id} onClick={() => setPicked({ label: a.title, keywords: [], addendumId: a.id, confidence: 'high' })}
                    className="btn btn-secondary btn-sm">
                    {a.icon} {a.letter}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  // ── תוצאה ──
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '.9rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '.5rem' }}>
        <div style={{ fontSize: '14px' }}>
          <button className="bk-link" onClick={()=>{if(location.hash.split('/')[2])location.hash='#tool/bookkeeping';else reset()}}>← חיפוש חדש</button>
        </div>
        <button onClick={() => onOpenAddendum(addendum!.id)}
          className="btn btn-secondary btn-sm">
          לדף המלא של התוספת ←
        </button>
      </div>

      <div style={{ ...card, borderTopColor: 'var(--accent)' }}>
        <div style={{ display: 'flex', gap: '.8rem', alignItems: 'flex-start' }}>
          <span style={{ fontSize: '34px' }}>{addendum!.icon}</span>
          <div>
            <div style={{ fontSize: '13px', color: 'var(--gray-500)' }}>{picked.label}</div>
            <div style={{ fontWeight: 600, fontSize: '17px' }}>תוספת {addendum!.letter} - {addendum!.title}</div>
            {picked.reasoning && <div style={{ fontSize: '13px', color: 'var(--gray-600)', marginTop: '.2rem' }}>{picked.reasoning}</div>}
            {picked.caveat && (
              <div className="bk-caveat">
                מקרה גבול: {picked.caveat}
              </div>
            )}
          </div>
        </div>
      </div>

      {activeTier&&activeTier.id!=='exempt31'&&<div className="bk-answer"><div className="bk-answer-head"><b>הספרים הנדרשים</b><span>{activeTier.label}</span></div><TierBooks tier={activeTier}/></div>}
      {/* קלטי מדרגה */}
      {(addendum!.wizard.askTurnover || addendum!.wizard.askEmployees) && (
        <div style={card}>
          <div style={{ fontWeight: 600, fontSize: '14px', marginBottom: '.5rem' }}>נתוני העסק - לקביעת המדרגה</div>
          <div style={{ display: 'flex', gap: '.7rem', flexWrap: 'wrap' }}>
            {addendum!.wizard.askTurnover && (
              <label style={{ fontSize: '13px', color: 'var(--gray-600)' }}>
                מחזור שנתי (כולל מע"מ!)
                <input value={turnover} onChange={e => { setTurnover(e.target.value); setManualTier(null); }} placeholder="למשל 950000" dir="ltr"
                  className="bk-field" style={{ display: 'block', marginTop: '.25rem', width: 160 }} />
              </label>
            )}
            {addendum!.wizard.askEmployees && (
              <label style={{ fontSize: '13px', color: 'var(--gray-600)' }}>
                מספר מועסקים (כולל הבעלים!)
                <input value={employees} onChange={e => { setEmployees(e.target.value); setManualTier(null); }} placeholder="למשל 3" dir="ltr"
                  className="bk-field" style={{ display: 'block', marginTop: '.25rem', width: 110 }} />
              </label>
            )}
          </div>
        </div>
      )}
      {addendum!.wizard.customQuestion && (
        <div style={{ ...card, fontSize: '14px', color: 'var(--gray-700)' }}>
          {addendum!.wizard.customQuestion} - בחרו את המדרגה המתאימה למטה.
        </div>
      )}

      {(manualScope || missingEmployees) && <p className="kn-soft" role="status">{missingEmployees ? 'חסר מספר מועסקים; שדה ריק אינו אפס. משלימים לפני בחירת מדרגה.' : 'נדרשת בחירה ידנית לפי ההגדרה המלאה: תנאים כגון סוג חנות, שטח נטיעות או עלות בנייה לא נקלטים באשף. הרשימות הן לעיון ואינן קביעת חובה אוטומטית.'}</p>}
      {manualTier && <p className="kn-small">מדרגה שנבחרה ידנית לעיון; יש לאמת שנה, התאמה וכל תנאי הענף לפני עבודה בתיק.</p>}
      {!autoTier&&!manualTier&&<p className="kn-small" role="status">{facts.relief==='כן'?'קובעים את החובות לפי נוסח ההקלה, שנת התחולה והפעילות שאושרו; בחירת מדרגה למטה היא עיון בלבד.':'מזינים מחזור שנתי (ומועסקים, אם נשאל) — והספרים יופיעו כאן.'}</p>}
      {autoTier?.id==='exempt31'&&<div style={card}><b>{autoTier.label}</b><TierBooks tier={autoTier}/></div>}
      <details style={card} className="bk-facts"><summary>מקרים מיוחדים <span>{bookkeepingFields(addendum!.id).filter((f:any)=>f.options).map((f:any)=>facts[f.key]).join(' · ')}</span></summary><p className="kn-small">הפעילות שנבחרה צריכה להיות הפעילות העיקרית. בעסק מעורב מוסיפים התאמות סבירות לפי 2(ב). מחזור הוא לפי הגדרת ההוראות; חלקי מועסקים אינם מעוגלים.</p><div style={{display:'flex',flexWrap:'wrap',gap:'.8rem'}}>{bookkeepingFields(addendum!.id).map((f:any)=><label key={f.key} style={{fontSize:13,display:'flex',flexDirection:'column',gap:4,maxWidth:340}}>{f.label}{f.options?<select className="bk-field" value={facts[f.key]??''} onChange={e=>{setBookFacts(s=>({...s,[f.key]:e.target.value}));setManualTier(null)}}>{f.options.map((v:string)=><option key={v}>{v}</option>)}</select>:<input className="bk-field" type="number" min="0" step="any" value={bookFacts[f.key]||''} onChange={e=>{setBookFacts(s=>({...s,[f.key]:e.target.value}));setManualTier(null)}}/>}</label>)}</div></details>
      {/* המדרגות */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '.6rem' }}>
        {addendum!.tiers.filter(tier=>!/מוסך|מונית|טכנאי שיניים|טבק/.test(tier.label)||Object.values(facts).some(v=>v&&v!=='לא'&&v!=='שירות רגיל'&&tier.label.includes(String(v).replace(/^כן$/,'@@')))||(facts.dental==='כן'&&/טכנאי שיניים/.test(tier.label))||(facts.tobacco==='כן'&&/טבק/.test(tier.label))||activeTier?.id===tier.id).map(tier => {
          const active = activeTier?.id === tier.id;
          return (
            <div key={tier.id} role="button" tabIndex={0} aria-expanded={active} onKeyDown={event=>{if(event.target===event.currentTarget&&(event.key==='Enter'||event.key===' ')){event.preventDefault();setManualTier(tier.id)}}} onClick={() => setManualTier(tier.id)}
              style={{ ...card, cursor: 'pointer', borderColor: active ? 'var(--chip-green-tx)' : 'var(--gray-200)', borderWidth: active ? 2 : 1, background: active ? 'var(--chip-green-bg)' : 'var(--card)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '.5rem', flexWrap: 'wrap' }}>
                <div style={{ fontWeight: 600, fontSize: '14px' }}>
                  {active && <span style={{ color: 'var(--chip-green-tx)' }}>✓ </span>}{tier.label}
                </div>
                {tier.doubleEntry && <span style={chip('var(--chip-violet-bg)', 'var(--info)')}>חשבונאות כפולה</span>}
              </div>
              <div style={{ fontSize: '13px', color: 'var(--gray-500)', marginTop: '.15rem' }}>{tier.condition.asWritten}</div>
              
            </div>
          );
        })}
      </div>
      {!activeTier && (
        <div style={{ fontSize: '13px', color: 'var(--gray-500)' }}>
          הזינו נתונים או לחצו על מדרגה כדי לראות את רשימת הספרים המלאה.
        </div>
      )}

      <BookkeepingSources refs={(addendum as any)?.sourceRefs}/>
      {addendum!.specialNotes && addendum!.specialNotes.length > 0 && (
        <div style={card}>
          <div style={{ fontWeight: 600, fontSize: '14px', marginBottom: '.3rem' }}>שימו לב</div>
          {addendum!.specialNotes.map((n, i) => <div key={i} style={{ fontSize: '13px', color: 'var(--gray-600)', marginTop: '.2rem' }}>• {n}</div>)}
        </div>
      )}
    </div>
  );
}

function TierBooks({ tier }: { tier: AddendumTier }) {
  return (
    <div style={{ marginTop: '.7rem' }}>
      <div style={{ fontWeight: 600, fontSize: '14px', marginBottom: '.35rem' }}>הספרים במדרגה המוצגת:</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '.35rem' }}>
        {tier.requiredBooks.map((b, i) => (
          <BookLine key={i} name={b.name} sectionRef={b.sectionRef} details={b.details} />
        ))}
      </div>
      {tier.requiredDocs && (
        <div style={{ fontSize: '13px', color: 'var(--gray-600)', marginTop: '.5rem' }}>
          <b>תיעוד נדרש:</b> {tier.requiredDocs}
        </div>
      )}
      <BookkeepingSources refs={(tier as any).sourceRefs}/>
      {tier.notes?.map((n, i) => (
        <div key={i} style={{ fontSize: '13px', color: 'var(--warn)', marginTop: '.3rem' }}>• {n}</div>
      ))}
    </div>
  );
}

function BookLine({ name, sectionRef, details }: { name: string; sectionRef?: string; details?: string }) {
  const [open, setOpen] = useState(false);
  const dict = BOOK_DICTIONARY.find(d => name.includes(d.name) || d.name.includes(name.replace(/ או .*/, '')));
  return (
    <div style={{ background: 'var(--card)', border: '1px solid var(--gray-200)', borderRadius: 8, padding: '.45rem .7rem' }}>
      <div role={dict?"button":undefined} tabIndex={dict?0:undefined} aria-expanded={dict?open:undefined} onKeyDown={e=>{if(dict&&(e.key==='Enter'||e.key===' ')){e.preventDefault();setOpen(!open)}}} onClick={() => dict && setOpen(!open)} style={{ display: 'flex', justifyContent: 'space-between', gap: '.5rem', cursor: dict ? 'pointer' : 'default', alignItems: 'center' }}>
        <div style={{ fontSize: '14px', fontWeight: 600 }}>
          {dict?.icon ?? '📘'} {name}
          {dict && <span style={{ color: 'var(--blue)', fontSize: '12px', fontWeight: 400 }}> - {open ? 'סגור' : 'מה זה?'}</span>}
        </div>
        {sectionRef && <span style={{ fontSize: '12px', color: 'var(--gray-400)', whiteSpace: 'nowrap' }}>{sectionRef}</span>}
      </div>
      {details && <div style={{ fontSize: '12px', color: 'var(--gray-500)', marginTop: '.15rem' }}>{details}</div>}
      {open && dict && (
        <div style={{ marginTop: '.45rem', borderTop: '1px dashed var(--gray-200)', paddingTop: '.45rem', fontSize: '13px', color: 'var(--gray-600)', lineHeight: 1.55 }}>
          <div>{dict.whatIsIt}</div>
          <div style={{ marginTop: '.3rem' }}><b>מה רושמים:</b> {dict.whatIsRecorded.join(' · ')}</div>
          {dict.whenRecorded && <div style={{ marginTop: '.2rem' }}><b>מתי:</b> {dict.whenRecorded}</div>}
        </div>
      )}
    </div>
  );
}

// ─── עיון בתוספות ────────────────────────────────────────────────────────────

function AddendaGrid({ onOpen }: { onOpen: (id: string) => void }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: '.7rem' }}>
      {ADDENDA.map(a => (
        <div key={a.id} role="button" tabIndex={0} aria-label={"תוספת "+a.letter+" — "+a.title} onKeyDown={e=>{if(e.target===e.currentTarget&&(e.key==='Enter'||e.key===' ')){e.preventDefault();onOpen(a.id)}}} onClick={() => onOpen(a.id)} style={{ ...card, cursor: 'pointer' }}>
          <div style={{ display: 'flex', gap: '.6rem', alignItems: 'center', marginBottom: '.35rem' }}>
            <span style={{ fontSize: '24px' }}>{a.icon}</span>
            <div>
              <div style={{ fontSize: 'var(--fs-15)', fontWeight: 600 }}>תוספת {a.letter}</div>
              <div style={{ fontSize: '13px', color: 'var(--gray-600)' }}>{a.title}</div>
            </div>
          </div>
          <div style={{ fontSize: '12px', color: 'var(--gray-500)', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
            {a.appliesTo}
          </div>
        </div>
      ))}
    </div>
  );
}

function AddendumDetail({ addendum, onBack }: { addendum: BookkeepingAddendum; onBack: () => void }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '.8rem' }}>
      <div style={{ fontSize: '14px' }}>
        <button className="bk-link" onClick={onBack}>← כל התוספות</button>
      </div>
      <div style={card}>
        <div style={{ display: 'flex', gap: '.7rem', alignItems: 'center' }}>
          <span style={{ fontSize: '34px' }}>{addendum.icon}</span>
          <div>
            <h2 data-book-addendum tabIndex={-1} style={{fontSize:20}}>תוספת {addendum.letter} — {addendum.title}</h2>
            <div style={{ fontSize: '14px', color: 'var(--gray-600)', marginTop: '.2rem' }}>{addendum.appliesTo}</div>
          </div>
        </div>
        {addendum.definitions.length > 0 && (
          <div style={{ marginTop: '.6rem', borderTop: '1px solid var(--gray-100)', paddingTop: '.5rem' }}>
            {addendum.definitions.map((d, i) => (
              <div key={i} style={{ fontSize: '13px', color: 'var(--gray-600)', marginTop: '.2rem' }}>
                <b>"{d.term}"</b> - {d.definition}
              </div>
            ))}
          </div>
        )}
      </div>

      {addendum.tiers.map(tier => (
        <div key={tier.id} style={card}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: '.5rem', flexWrap: 'wrap' }}>
            <div style={{ fontSize: 'var(--fs-15)', fontWeight: 600 }}>{tier.label}</div>
            {tier.doubleEntry && <span style={chip('var(--chip-violet-bg)', 'var(--info)')}>חשבונאות כפולה</span>}
          </div>
          <div style={{ fontSize: '13px', color: 'var(--gray-500)', marginTop: '.15rem' }}>{tier.condition.asWritten}</div>
          <TierBooks tier={tier} />
        </div>
      ))}

      <BookkeepingSources refs={(addendum as any).sourceRefs}/>
      {addendum.specialBooks && addendum.specialBooks.length > 0 && (
        <div style={card}>
          <div style={{ fontSize: 'var(--fs-15)', fontWeight: 600, marginBottom: '.4rem' }}>הספרים הייחודיים לתוספת</div>
          {addendum.specialBooks.map((b, i) => (
            <div key={i} style={{ marginTop: '.4rem', borderRight: '3px solid var(--blue)', paddingRight: '.6rem' }}>
              <div style={{ fontWeight: 600, fontSize: '14px' }}>{b.name}</div>
              <div style={{ fontSize: '13px', color: 'var(--gray-600)', lineHeight: 1.55 }}>{b.whatIsRecorded}</div>
            </div>
          ))}
        </div>
      )}

      {(addendum.cashRegister || addendum.inventoryRules) && (
        <div style={card}>
          {addendum.cashRegister && <div style={{ fontSize: '13px', color: 'var(--gray-600)' }}><b>קופה רושמת:</b> {addendum.cashRegister}</div>}
          {addendum.inventoryRules && <div style={{ fontSize: '13px', color: 'var(--gray-600)', marginTop: '.3rem' }}><b>מלאי:</b> {addendum.inventoryRules}</div>}
        </div>
      )}

      {addendum.specialNotes && addendum.specialNotes.length > 0 && (
        <div className="bk-notes">
          {addendum.specialNotes.map((n, i) => <div key={i} style={{ fontSize: '13px', color: 'var(--ink-2)', marginTop: i ? '.25rem' : 0 }}>• {n}</div>)}
        </div>
      )}
      {addendum.needsReview && addendum.needsReview.length > 0 && (
        <div style={{ fontSize: '12px', color: 'var(--gray-400)' }}>
          לאימות: {addendum.needsReview.join(' · ')}
        </div>
      )}
    </div>
  );
}

// ─── מילון הספרים ────────────────────────────────────────────────────────────

function Dictionary() {
  const [q, setQ] = useState('');
  const items = BOOK_DICTIONARY.filter(d => !q.trim() || d.name.includes(q.trim()) || d.whatIsIt.includes(q.trim()));
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '.7rem' }}>
      <input value={q} onChange={e => setQ(e.target.value)} placeholder='חיפוש: "ספר הזמנות", "תעודת משלוח"…'
        className="bk-field" />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '.7rem' }}>
        {items.map(d => (
          <div key={d.id} style={card}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ fontSize: 'var(--fs-15)', fontWeight: 600 }}>{d.icon} {d.name}</div>
              <span style={chip(d.kind === 'book' ? 'var(--soft)' : 'var(--chip-green-bg)', d.kind === 'book' ? 'var(--chip-blue-tx)' : 'var(--chip-green-tx)')}>
                {d.kind === 'book' ? 'ספר חשבון' : 'תיעוד'}
              </span>
            </div>
            <div style={{ fontSize: '13px', color: 'var(--gray-600)', marginTop: '.35rem', lineHeight: 1.5 }}>{d.whatIsIt}</div>
            <div style={{ fontSize: '13px', color: 'var(--gray-500)', marginTop: '.4rem' }}><b>מה רושמים:</b> {d.whatIsRecorded.join(' · ')}</div>
            {d.whenRecorded && <div style={{ fontSize: '13px', color: 'var(--gray-500)', marginTop: '.25rem' }}><b>מתי:</b> {d.whenRecorded}</div>}
            {d.commonMistakes && d.commonMistakes.length > 0 && (
              <div style={{ fontSize: '13px', color: 'var(--warn)', marginTop: '.35rem' }}>
                {d.commonMistakes.map((m, i) => <div key={i}>{m}</div>)}
              </div>
            )}
            <div style={{fontSize:12}}>{d.sectionRef}</div><BookkeepingSources refs={(d as any).sourceRefs}/>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── כללים לכולם ─────────────────────────────────────────────────────────────

function GeneralRules() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '.8rem' }}>
      <div style={card}>
        <div style={{ fontSize: 'var(--fs-15)', fontWeight: 600, marginBottom: '.4rem' }}>שלוש הגדרות שהכול תלוי בהן</div>
        {KEY_DEFINITIONS.map((d, i) => (
          <div key={i} style={{ marginTop: '.5rem', borderRight: '3px solid var(--blue)', paddingRight: '.6rem' }}>
            <div style={{ fontWeight: 600, fontSize: '14px' }}>"{d.term}" <span style={{ fontSize: '12px', color: 'var(--gray-400)', fontWeight: 400 }}>{d.sectionRef}</span></div>
            <div style={{ fontSize: '13px', color: 'var(--gray-600)', lineHeight: 1.55 }}>{d.definition}</div>
            {d.note && <div style={{ fontSize: '13px', color: 'var(--warn)', marginTop: '.15rem' }}>{d.note}</div>}
          </div>
        ))}
      </div>

      <div style={card}>
        <div style={{ fontSize: 'var(--fs-15)', fontWeight: 600, marginBottom: '.4rem' }}>⏱️ מתי רושמים</div>
        <table style={{ width: '100%', fontSize: '13px', borderCollapse: 'collapse' }}>
          <tbody>
            {RECORDING_RULES.timing.map((r, i) => (
              <tr key={i} style={{ borderBottom: '1px solid var(--gray-100)' }}>
                <td style={{ padding: '.35rem .3rem' }}>{r.what}</td>
                <td style={{ padding: '.35rem .3rem', fontWeight: 600, whiteSpace: 'nowrap' }}>{r.when}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div style={{ fontSize: '13px', color: 'var(--gray-600)', marginTop: '.5rem' }}><b>תיקון טעויות:</b> {RECORDING_RULES.corrections}</div>
      </div>

      <div style={card}>
        <div style={{ fontSize: 'var(--fs-15)', fontWeight: 600, marginBottom: '.4rem' }}>שמירת הספרים</div>
        <div style={{ fontSize: '13px', color: 'var(--gray-600)', lineHeight: 1.6 }}>
          <div>{RECORDING_RULES.retention}</div>
          <div style={{ marginTop: '.3rem' }}>{RECORDING_RULES.location}</div>
          <div style={{ marginTop: '.3rem' }}><b>מערכת ממוחשבת:</b> {RECORDING_RULES.computerized}</div>
        </div>
      </div>

      <div style={card}>
        <div style={{ fontSize: 'var(--fs-15)', fontWeight: 600, marginBottom: '.4rem' }}>הקלות - סעיף 3</div>
        <div style={{ fontSize: '13px', color: 'var(--gray-600)', lineHeight: 1.6 }}>{RELIEFS.mechanism}</div>
        <div style={{ fontSize: '13px', color: 'var(--gray-600)', marginTop: '.4rem' }}>
          <b>אישור אוטומטי ("שתיקה כהסכמה"):</b>
          {RELIEFS.deemedApproval.map((d, i) => <div key={i} style={{ marginTop: '.15rem' }}>• {d}</div>)}
        </div>
        <div style={{ fontSize: '13px', color: 'var(--gray-600)', marginTop: '.4rem' }}>
          <b>דוגמאות נפוצות:</b> {RELIEFS.examples.join(' · ')}
        </div>
        <div style={{ fontSize: '13px', color: 'var(--gray-500)', marginTop: '.4rem' }}>{RELIEFS.smallDealer}</div>
      </div>

      <div style={{ ...card, borderColor: 'var(--chip-red-bd)' }}>
        <div style={{ fontSize: 'var(--fs-15)', fontWeight: 600, marginBottom: '.4rem', color: 'var(--err)' }}>פסילת ספרים</div>
        <div style={{ fontSize: '13px', color: 'var(--gray-600)', lineHeight: 1.6 }}>{DISQUALIFICATION.what}</div>
        <div style={{ fontSize: '13px', color: 'var(--gray-600)', marginTop: '.4rem' }}>
          {DISQUALIFICATION.consequences.map((c, i) => <div key={i} style={{ marginTop: '.15rem' }}>• {c}</div>)}
        </div>
        <div style={{ fontSize: '13px', color: 'var(--gray-600)', marginTop: '.4rem' }}>{DISQUALIFICATION.closedSystem}</div>
        <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--err)', marginTop: '.4rem' }}>{DISQUALIFICATION.mostCommon}</div>
      </div>

      <div style={card}>
        <div style={{ fontSize: 'var(--fs-15)', fontWeight: 600, marginBottom: '.4rem' }}>מסלול "נישום זכאי" - יומן העסק</div>
        <div style={{ fontSize: '13px', color: 'var(--gray-600)', lineHeight: 1.6 }}>
          <div><b>למי:</b> {ELIGIBLE_TAXPAYER.who}</div>
          <div style={{ marginTop: '.3rem' }}>{ELIGIBLE_TAXPAYER.what}</div>
          <div style={{ marginTop: '.3rem' }}>{ELIGIBLE_TAXPAYER.keyRules.join(' · ')}</div>
        </div>
      </div>

      <div style={card}>
        <div style={{ fontSize: 'var(--fs-15)', fontWeight: 600, marginBottom: '.3rem' }}>ומה עם מע"מ?</div>
        <div style={{ fontSize: '13px', color: 'var(--gray-600)', lineHeight: 1.6 }}>{VAT_NOTE}</div>
      </div>

      <div style={{ fontSize: '12px', color: 'var(--gray-400)' }}>
        נבדק 25.10.2026: כל 15 התוספות,44 המסלולים,13 ערכי המילון והכללים המוצגים. סכומים ענפיים מתיקון 2014 בתחולה מ־2015; סכום תלוש מונית במע״מ נבדק בנפרד לכל שנה. נוסח מס הכנסה המשולב נקרא בהעתקת דין מתוארכת 2021, עם תיקוני רשומות; לא אותר נוסח רשמי משולב שלם ל־2026.
        <BookkeepingSources refs={[{"id":"consolidated","title":"הוראות ניהול פנקסים — נוסח הדין המשולב בהעתקת תקדין","url":"https://www.takdin.co.il/Document/Text?id=2437&lawDate=&maagar=1&packCode=131072","kind":"statutory-text-reproduction","readingMethod":"HTML: governing sections1–34 and all15addenda read in full relevant subsections; relevant appendix provisions read; no claim that every software technical appendix provision was re-audited","version":"display date22.2.2021; includes2019amendment; not an official current consolidation","yearScope":"structural rules; applicability checked as of25.10.2026 subject to consolidation-currency limitation"},{"id":"gazette2014","title":"רשומות ק״ת 7457 — תיקון סכומי ניהול ספרים, 11.12.2014","url":"https://olaw.org.il/takanot/takanot-7457.pdf","kind":"primary-gazette-on-mirror","readingMethod":"PDF extracted text, printed pp410–412 (PDF pp2–4)","effectiveFrom":"2015-01-01","yearScope":"fixed statutory amounts, not automatic annual indexing"},{"id":"vat","title":"תקנות מע״מ (ניהול פנקסי חשבונות) — מאגר החקיקה בביטוח הלאומי","url":"https://www.btl.gov.il/Laws1/02_0022_100006.pdf","kind":"official-consolidated-legislation","readingMethod":"all 3 PDF pages, extracted text; footnote explicitly cites2026 gazette12460 p2345","yearScope":"includes effective1.1.2026 amount309"},{"id":"vat2025","title":"רשומות ק״ת11725 — הודעת תיאום סכום לשנת 2025","url":"https://olaw.org.il/takanot/takanot-11725.pdf","kind":"primary-gazette-on-mirror","readingMethod":"both PDF pages, §1 printed p1066","effectiveFrom":"2025-01-01","yearScope":"2025 only:302ILS"},{"id":"ordinance","title":"פקודת מס הכנסה — מאגר החקיקה בביטוח הלאומי","url":"https://www.btl.gov.il/Laws1/00_0103_000000.pdf","kind":"official-consolidated-legislation","readingMethod":"PDF extracted text §§32(18),32א,33 PDFpp41–42;145ב PDFpp136–137;155 official indexed text. Initial directPDF failed, later retrieval succeeded; not a claim of all165pages read","yearScope":"current statutory text as accessed25.10.2026;32אcommencement separatelyverifiedfullcircular03/2026 sourceblack2026"},{"id":"allocation","title":"רשות המסים — כל מה שעסקים צריכים לדעת על חשבוניות ישראל","url":"https://www.gov.il/he/pages/minisite-israel-invoice-200324","kind":"official-guidance","readingMethod":"full relevant official HTML/index text; thresholds and periods","yearScope":"2025:20,000;1.1–31.5.2026:10,000;from1.6.2026:5,000;beforeVAT"}]}/>
      </div>
    </div>
  );
}

function BookkeepingSources({refs}:{refs:any[]|undefined}){if(!refs?.length)return null;return <details style={{fontSize:12,marginTop:8}}><summary>מקור, תחולה ושיטת בדיקה</summary>{refs.map((s:any,i:number)=><p key={i} style={{margin:'6px 0'}}><a href={s.url} target="_blank" rel="noreferrer">{s.title}</a><br/>{s.locator||s.yearScope}<br/><span>{s.kind==='statutory-text-reproduction'?'העתקת נוסח דין; אינו פרסום רשמי משולב עדכני':s.kind==='primary-gazette-on-mirror'?'צילום רשומות במראה חיצונית':'מקור רשמי'} · נבדק 25.10.2026</span></p>)}</details>}

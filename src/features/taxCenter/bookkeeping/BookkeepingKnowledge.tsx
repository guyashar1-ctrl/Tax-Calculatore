// ─────────────────────────────────────────────────────────────────────────────
// ניהול ספרים — המסך הראשי במרכז הידע
// ארבעה מסלולים: אשף "אילו ספרים העסק חייב" · 15 התוספות · מילון הספרים · כללים
// ─────────────────────────────────────────────────────────────────────────────
import { useMemo, useState } from 'react';
import {
  AddendumTier, BookkeepingAddendum, BusinessTypeEntry, matchTier, searchBusinessTypes,
} from './types';
import { ADDENDA, getAddendum } from './addendaData';
import {
  BOOK_DICTIONARY, DISQUALIFICATION, ELIGIBLE_TAXPAYER, KEY_DEFINITIONS,
  RECORDING_RULES, RELIEFS, VAT_NOTE,
} from './generalData';
import { BUSINESS_TYPES, DECISION_QUESTIONS } from './businessTypes';

const card: React.CSSProperties = { background: 'white', border: '1px solid var(--gray-200)', borderRadius: 12, padding: '1rem 1.15rem' };
const chip = (bg: string, color: string): React.CSSProperties => ({ display: 'inline-block', padding: '.15rem .6rem', borderRadius: 999, fontSize: '.72rem', fontWeight: 700, background: bg, color });

type View = 'wizard' | 'addenda' | 'dictionary' | 'rules';

export default function BookkeepingKnowledge() {
  const [view, setView] = useState<View>('wizard');
  const [openAddendum, setOpenAddendum] = useState<string | null>(null);

  const tabs: { key: View; label: string }[] = [
    { key: 'wizard', label: '🧭 אילו ספרים העסק חייב?' },
    { key: 'addenda', label: '📚 15 התוספות' },
    { key: 'dictionary', label: '📖 מילון הספרים' },
    { key: 'rules', label: '⚖️ כללים לכולם' },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      <div style={{ ...card, background: 'var(--gray-50)' }}>
        <div style={{ fontWeight: 700, marginBottom: '.25rem' }}>📖 הוראות ניהול ספרים</div>
        <div style={{ fontSize: '.85rem', color: 'var(--gray-600)', lineHeight: 1.6 }}>
          כל עוסק חייב להשתייך לאחת מ-15 התוספות של הוראות ניהול פנקסי חשבונות (תשל"ג-1973) — לפי סוג העסק.
          בתוך התוספת, רשימת הספרים נקבעת לפי מדרגה (מחזור / מועסקים). מי שלא נכנס לאף תוספת ייעודית — שייך לתוספת יא' (סעיף הסל).
        </div>
      </div>

      <div style={{ display: 'flex', gap: '.35rem', flexWrap: 'wrap', borderBottom: '2px solid var(--gray-200)', paddingBottom: '.5rem' }}>
        {tabs.map(t => (
          <button key={t.key} onClick={() => { setView(t.key); setOpenAddendum(null); }}
            style={{ padding: '.4rem .8rem', borderRadius: 8, border: 'none', cursor: 'pointer', fontFamily: 'inherit', fontSize: '.85rem', fontWeight: view === t.key ? 700 : 400, background: view === t.key ? 'var(--blue)' : 'transparent', color: view === t.key ? 'white' : 'var(--gray-600)' }}>
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

  const results = useMemo(() => searchBusinessTypes(BUSINESS_TYPES, query).slice(0, 12), [query]);
  const addendum = picked ? getAddendum(picked.addendumId) : null;

  const turnoverNum = turnover.trim() ? Number(turnover.replace(/[^\d]/g, '')) : null;
  const employeesNum = employees.trim() ? Number(employees) : null;
  const autoTier = addendum ? matchTier(addendum, turnoverNum, employeesNum) : null;
  const activeTier: AddendumTier | null =
    (manualTier && addendum?.tiers.find(t => t.id === manualTier)) ||
    (turnoverNum !== null ? autoTier : null);

  function reset() {
    setPicked(null); setQuery(''); setTurnover(''); setEmployees(''); setManualTier(null); setShowQuestions(false);
  }

  if (!picked) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '.9rem' }}>
        <div style={card}>
          <div style={{ fontWeight: 700, marginBottom: '.5rem' }}>מה העסק עושה?</div>
          <input
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder='הקלד סוג עסק: "מסעדה", "שיפוצניק", "עורך דין", "חנות אונליין"…'
            style={{ width: '100%', padding: '.65rem .9rem', borderRadius: 10, border: '1.5px solid var(--gray-300)', fontSize: '1rem', fontFamily: 'inherit' }}
            autoFocus
          />
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(230px, 1fr))', gap: '.6rem' }}>
          {results.map(e => {
            const a = getAddendum(e.addendumId)!;
            return (
              <div key={e.label} onClick={() => setPicked(e)}
                style={{ ...card, cursor: 'pointer', padding: '.7rem .9rem', display: 'flex', gap: '.6rem', alignItems: 'center' }}>
                <span style={{ fontSize: '1.3rem' }}>{a.icon}</span>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontWeight: 600, fontSize: '.9rem' }}>{e.label}</div>
                  <div style={{ fontSize: '.72rem', color: 'var(--gray-500)' }}>תוספת {a.letter} — {a.title}</div>
                </div>
              </div>
            );
          })}
        </div>

        {query.trim() && results.length === 0 && (
          <div style={{ ...card, color: 'var(--gray-600)', fontSize: '.9rem' }}>
            לא נמצא ברשימה — נסו ניסוח אחר, או השתמשו בשאלות ההכרעה למטה. מי שלא נכנס לאף תוספת — שייך לתוספת יא' (סעיף הסל).
          </div>
        )}

        <div style={card}>
          <div onClick={() => setShowQuestions(!showQuestions)} style={{ cursor: 'pointer', fontWeight: 600, fontSize: '.9rem', color: 'var(--blue)' }}>
            {showQuestions ? '▾' : '◂'} העסק לא ברשימה? שאלות הכרעה
          </div>
          {showQuestions && (
            <div style={{ marginTop: '.7rem', display: 'flex', flexDirection: 'column', gap: '.6rem' }}>
              {DECISION_QUESTIONS.map((q, i) => (
                <div key={i} style={{ borderRight: '3px solid var(--gray-200)', paddingRight: '.7rem' }}>
                  <div style={{ fontWeight: 600, fontSize: '.85rem' }}>{i + 1}. {q.question}</div>
                  <div style={{ fontSize: '.82rem', color: 'var(--gray-600)', marginTop: '.15rem' }}>{q.answer}</div>
                </div>
              ))}
              <div style={{ display: 'flex', gap: '.4rem', flexWrap: 'wrap', marginTop: '.3rem' }}>
                {ADDENDA.map(a => (
                  <button key={a.id} onClick={() => setPicked({ label: a.title, keywords: [], addendumId: a.id, confidence: 'high' })}
                    style={{ padding: '.3rem .6rem', borderRadius: 8, border: '1px solid var(--gray-300)', background: 'white', cursor: 'pointer', fontFamily: 'inherit', fontSize: '.78rem' }}>
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
        <div style={{ fontSize: '.85rem' }}>
          <span style={{ cursor: 'pointer', color: 'var(--blue)' }} onClick={reset}>← חיפוש חדש</span>
        </div>
        <button onClick={() => onOpenAddendum(addendum!.id)}
          style={{ padding: '.35rem .8rem', borderRadius: 8, border: '1px solid var(--gray-300)', background: 'white', cursor: 'pointer', fontFamily: 'inherit', fontSize: '.8rem' }}>
          לדף המלא של התוספת ←
        </button>
      </div>

      <div style={{ ...card, borderColor: 'var(--blue)', borderWidth: 1.5 }}>
        <div style={{ display: 'flex', gap: '.8rem', alignItems: 'flex-start' }}>
          <span style={{ fontSize: '2rem' }}>{addendum!.icon}</span>
          <div>
            <div style={{ fontSize: '.78rem', color: 'var(--gray-500)' }}>{picked.label}</div>
            <div style={{ fontWeight: 700, fontSize: '1.1rem' }}>תוספת {addendum!.letter} — {addendum!.title}</div>
            {picked.reasoning && <div style={{ fontSize: '.82rem', color: 'var(--gray-600)', marginTop: '.2rem' }}>{picked.reasoning}</div>}
            {picked.caveat && (
              <div style={{ fontSize: '.82rem', color: '#b45309', background: '#fef9c3', borderRadius: 8, padding: '.4rem .6rem', marginTop: '.4rem' }}>
                ⚠ מקרה גבול: {picked.caveat}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* קלטי מדרגה */}
      {(addendum!.wizard.askTurnover || addendum!.wizard.askEmployees) && (
        <div style={card}>
          <div style={{ fontWeight: 600, fontSize: '.9rem', marginBottom: '.5rem' }}>נתוני העסק — לקביעת המדרגה</div>
          <div style={{ display: 'flex', gap: '.7rem', flexWrap: 'wrap' }}>
            {addendum!.wizard.askTurnover && (
              <label style={{ fontSize: '.82rem', color: 'var(--gray-600)' }}>
                מחזור שנתי (כולל מע"מ!)
                <input value={turnover} onChange={e => { setTurnover(e.target.value); setManualTier(null); }} placeholder="למשל 950000" dir="ltr"
                  style={{ display: 'block', marginTop: '.25rem', padding: '.45rem .7rem', borderRadius: 8, border: '1px solid var(--gray-300)', fontFamily: 'inherit', width: 160 }} />
              </label>
            )}
            {addendum!.wizard.askEmployees && (
              <label style={{ fontSize: '.82rem', color: 'var(--gray-600)' }}>
                מספר מועסקים (כולל הבעלים!)
                <input value={employees} onChange={e => { setEmployees(e.target.value); setManualTier(null); }} placeholder="למשל 3" dir="ltr"
                  style={{ display: 'block', marginTop: '.25rem', padding: '.45rem .7rem', borderRadius: 8, border: '1px solid var(--gray-300)', fontFamily: 'inherit', width: 110 }} />
              </label>
            )}
          </div>
        </div>
      )}
      {addendum!.wizard.customQuestion && (
        <div style={{ ...card, fontSize: '.85rem', color: 'var(--gray-700)' }}>
          💡 {addendum!.wizard.customQuestion} — בחרו את המדרגה המתאימה למטה.
        </div>
      )}

      {/* המדרגות */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '.6rem' }}>
        {addendum!.tiers.map(tier => {
          const active = activeTier?.id === tier.id;
          return (
            <div key={tier.id} onClick={() => setManualTier(tier.id)}
              style={{ ...card, cursor: 'pointer', borderColor: active ? '#15803d' : 'var(--gray-200)', borderWidth: active ? 2 : 1, background: active ? '#f0fdf4' : 'white' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '.5rem', flexWrap: 'wrap' }}>
                <div style={{ fontWeight: 700, fontSize: '.92rem' }}>
                  {active && <span style={{ color: '#15803d' }}>✓ </span>}{tier.label}
                </div>
                {tier.doubleEntry && <span style={chip('#faf5ff', '#6d28d9')}>חשבונאות כפולה</span>}
              </div>
              <div style={{ fontSize: '.78rem', color: 'var(--gray-500)', marginTop: '.15rem' }}>{tier.condition.asWritten}</div>
              {active && <TierBooks tier={tier} />}
            </div>
          );
        })}
      </div>
      {!activeTier && (
        <div style={{ fontSize: '.82rem', color: 'var(--gray-500)' }}>
          הזינו נתונים או לחצו על מדרגה כדי לראות את רשימת הספרים המלאה.
        </div>
      )}

      {addendum!.specialNotes && addendum!.specialNotes.length > 0 && (
        <div style={{ ...card, background: 'var(--gray-50)' }}>
          <div style={{ fontWeight: 600, fontSize: '.85rem', marginBottom: '.3rem' }}>שימו לב</div>
          {addendum!.specialNotes.map((n, i) => <div key={i} style={{ fontSize: '.82rem', color: 'var(--gray-600)', marginTop: '.2rem' }}>• {n}</div>)}
        </div>
      )}
    </div>
  );
}

function TierBooks({ tier }: { tier: AddendumTier }) {
  return (
    <div style={{ marginTop: '.7rem' }}>
      <div style={{ fontWeight: 600, fontSize: '.85rem', marginBottom: '.35rem' }}>הספרים שחובה לנהל:</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '.35rem' }}>
        {tier.requiredBooks.map((b, i) => (
          <BookLine key={i} name={b.name} sectionRef={b.sectionRef} details={b.details} />
        ))}
      </div>
      {tier.requiredDocs && (
        <div style={{ fontSize: '.82rem', color: 'var(--gray-600)', marginTop: '.5rem' }}>
          <b>תיעוד נדרש:</b> {tier.requiredDocs}
        </div>
      )}
      {tier.notes?.map((n, i) => (
        <div key={i} style={{ fontSize: '.8rem', color: '#b45309', marginTop: '.3rem' }}>• {n}</div>
      ))}
    </div>
  );
}

function BookLine({ name, sectionRef, details }: { name: string; sectionRef?: string; details?: string }) {
  const [open, setOpen] = useState(false);
  const dict = BOOK_DICTIONARY.find(d => name.includes(d.name) || d.name.includes(name.replace(/ או .*/, '')));
  return (
    <div style={{ background: 'white', border: '1px solid var(--gray-200)', borderRadius: 8, padding: '.45rem .7rem' }}>
      <div onClick={() => dict && setOpen(!open)} style={{ display: 'flex', justifyContent: 'space-between', gap: '.5rem', cursor: dict ? 'pointer' : 'default', alignItems: 'center' }}>
        <div style={{ fontSize: '.85rem', fontWeight: 600 }}>
          {dict?.icon ?? '📘'} {name}
          {dict && <span style={{ color: 'var(--blue)', fontSize: '.72rem', fontWeight: 400 }}> — {open ? 'סגור' : 'מה זה?'}</span>}
        </div>
        {sectionRef && <span style={{ fontSize: '.68rem', color: 'var(--gray-400)', whiteSpace: 'nowrap' }}>{sectionRef}</span>}
      </div>
      {details && <div style={{ fontSize: '.76rem', color: 'var(--gray-500)', marginTop: '.15rem' }}>{details}</div>}
      {open && dict && (
        <div style={{ marginTop: '.45rem', borderTop: '1px dashed var(--gray-200)', paddingTop: '.45rem', fontSize: '.8rem', color: 'var(--gray-600)', lineHeight: 1.55 }}>
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
        <div key={a.id} onClick={() => onOpen(a.id)} style={{ ...card, cursor: 'pointer' }}>
          <div style={{ display: 'flex', gap: '.6rem', alignItems: 'center', marginBottom: '.35rem' }}>
            <span style={{ fontSize: '1.5rem' }}>{a.icon}</span>
            <div>
              <div style={{ fontWeight: 700 }}>תוספת {a.letter}</div>
              <div style={{ fontSize: '.82rem', color: 'var(--gray-600)' }}>{a.title}</div>
            </div>
          </div>
          <div style={{ fontSize: '.76rem', color: 'var(--gray-500)', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
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
      <div style={{ fontSize: '.85rem' }}>
        <span style={{ cursor: 'pointer', color: 'var(--blue)' }} onClick={onBack}>← כל התוספות</span>
      </div>
      <div style={card}>
        <div style={{ display: 'flex', gap: '.7rem', alignItems: 'center' }}>
          <span style={{ fontSize: '2rem' }}>{addendum.icon}</span>
          <div>
            <div style={{ fontWeight: 700, fontSize: '1.15rem' }}>תוספת {addendum.letter} — {addendum.title}</div>
            <div style={{ fontSize: '.85rem', color: 'var(--gray-600)', marginTop: '.2rem' }}>{addendum.appliesTo}</div>
          </div>
        </div>
        {addendum.definitions.length > 0 && (
          <div style={{ marginTop: '.6rem', borderTop: '1px solid var(--gray-100)', paddingTop: '.5rem' }}>
            {addendum.definitions.map((d, i) => (
              <div key={i} style={{ fontSize: '.8rem', color: 'var(--gray-600)', marginTop: '.2rem' }}>
                <b>"{d.term}"</b> — {d.definition}
              </div>
            ))}
          </div>
        )}
      </div>

      {addendum.tiers.map(tier => (
        <div key={tier.id} style={card}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: '.5rem', flexWrap: 'wrap' }}>
            <div style={{ fontWeight: 700 }}>{tier.label}</div>
            {tier.doubleEntry && <span style={chip('#faf5ff', '#6d28d9')}>חשבונאות כפולה</span>}
          </div>
          <div style={{ fontSize: '.78rem', color: 'var(--gray-500)', marginTop: '.15rem' }}>{tier.condition.asWritten}</div>
          <TierBooks tier={tier} />
        </div>
      ))}

      {addendum.specialBooks && addendum.specialBooks.length > 0 && (
        <div style={card}>
          <div style={{ fontWeight: 700, marginBottom: '.4rem' }}>הספרים הייחודיים לתוספת</div>
          {addendum.specialBooks.map((b, i) => (
            <div key={i} style={{ marginTop: '.4rem', borderRight: '3px solid var(--blue)', paddingRight: '.6rem' }}>
              <div style={{ fontWeight: 600, fontSize: '.88rem' }}>{b.name}</div>
              <div style={{ fontSize: '.8rem', color: 'var(--gray-600)', lineHeight: 1.55 }}>{b.whatIsRecorded}</div>
            </div>
          ))}
        </div>
      )}

      {(addendum.cashRegister || addendum.inventoryRules) && (
        <div style={{ ...card, background: 'var(--gray-50)' }}>
          {addendum.cashRegister && <div style={{ fontSize: '.82rem', color: 'var(--gray-600)' }}><b>🖨️ קופה רושמת:</b> {addendum.cashRegister}</div>}
          {addendum.inventoryRules && <div style={{ fontSize: '.82rem', color: 'var(--gray-600)', marginTop: '.3rem' }}><b>📦 מלאי:</b> {addendum.inventoryRules}</div>}
        </div>
      )}

      {addendum.specialNotes && addendum.specialNotes.length > 0 && (
        <div style={{ ...card, background: '#fffbeb', borderColor: '#fde68a' }}>
          {addendum.specialNotes.map((n, i) => <div key={i} style={{ fontSize: '.82rem', color: '#92400e', marginTop: i ? '.25rem' : 0 }}>• {n}</div>)}
        </div>
      )}
      {addendum.needsReview && addendum.needsReview.length > 0 && (
        <div style={{ fontSize: '.75rem', color: 'var(--gray-400)' }}>
          ⚠ לאימות: {addendum.needsReview.join(' · ')}
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
        style={{ padding: '.55rem .9rem', borderRadius: 10, border: '1.5px solid var(--gray-300)', fontSize: '.95rem', fontFamily: 'inherit' }} />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '.7rem' }}>
        {items.map(d => (
          <div key={d.id} style={card}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ fontWeight: 700 }}>{d.icon} {d.name}</div>
              <span style={chip(d.kind === 'book' ? '#eef2f6' : '#f0fdf4', d.kind === 'book' ? '#264155' : '#15803d')}>
                {d.kind === 'book' ? 'ספר חשבון' : 'תיעוד'}
              </span>
            </div>
            <div style={{ fontSize: '.84rem', color: 'var(--gray-600)', marginTop: '.35rem', lineHeight: 1.5 }}>{d.whatIsIt}</div>
            <div style={{ fontSize: '.78rem', color: 'var(--gray-500)', marginTop: '.4rem' }}><b>מה רושמים:</b> {d.whatIsRecorded.join(' · ')}</div>
            {d.whenRecorded && <div style={{ fontSize: '.78rem', color: 'var(--gray-500)', marginTop: '.25rem' }}><b>מתי:</b> {d.whenRecorded}</div>}
            {d.commonMistakes && d.commonMistakes.length > 0 && (
              <div style={{ fontSize: '.78rem', color: '#b45309', marginTop: '.35rem' }}>
                {d.commonMistakes.map((m, i) => <div key={i}>⚠ {m}</div>)}
              </div>
            )}
            <div style={{ fontSize: '.68rem', color: 'var(--gray-400)', marginTop: '.35rem' }}>{d.sectionRef}</div>
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
        <div style={{ fontWeight: 700, marginBottom: '.4rem' }}>🔑 שלוש הגדרות שהכול תלוי בהן</div>
        {KEY_DEFINITIONS.map((d, i) => (
          <div key={i} style={{ marginTop: '.5rem', borderRight: '3px solid var(--blue)', paddingRight: '.6rem' }}>
            <div style={{ fontWeight: 600, fontSize: '.9rem' }}>"{d.term}" <span style={{ fontSize: '.68rem', color: 'var(--gray-400)', fontWeight: 400 }}>{d.sectionRef}</span></div>
            <div style={{ fontSize: '.82rem', color: 'var(--gray-600)', lineHeight: 1.55 }}>{d.definition}</div>
            {d.note && <div style={{ fontSize: '.8rem', color: '#b45309', marginTop: '.15rem' }}>💡 {d.note}</div>}
          </div>
        ))}
      </div>

      <div style={card}>
        <div style={{ fontWeight: 700, marginBottom: '.4rem' }}>⏱️ מתי רושמים</div>
        <table style={{ width: '100%', fontSize: '.84rem', borderCollapse: 'collapse' }}>
          <tbody>
            {RECORDING_RULES.timing.map((r, i) => (
              <tr key={i} style={{ borderBottom: '1px solid var(--gray-100)' }}>
                <td style={{ padding: '.35rem .3rem' }}>{r.what}</td>
                <td style={{ padding: '.35rem .3rem', fontWeight: 600, whiteSpace: 'nowrap' }}>{r.when}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div style={{ fontSize: '.82rem', color: 'var(--gray-600)', marginTop: '.5rem' }}><b>תיקון טעויות:</b> {RECORDING_RULES.corrections}</div>
      </div>

      <div style={card}>
        <div style={{ fontWeight: 700, marginBottom: '.4rem' }}>🗄️ שמירת הספרים</div>
        <div style={{ fontSize: '.84rem', color: 'var(--gray-600)', lineHeight: 1.6 }}>
          <div>{RECORDING_RULES.retention}</div>
          <div style={{ marginTop: '.3rem' }}>{RECORDING_RULES.location}</div>
          <div style={{ marginTop: '.3rem' }}><b>מערכת ממוחשבת:</b> {RECORDING_RULES.computerized}</div>
        </div>
      </div>

      <div style={card}>
        <div style={{ fontWeight: 700, marginBottom: '.4rem' }}>🤝 הקלות — סעיף 3</div>
        <div style={{ fontSize: '.84rem', color: 'var(--gray-600)', lineHeight: 1.6 }}>{RELIEFS.mechanism}</div>
        <div style={{ fontSize: '.82rem', color: 'var(--gray-600)', marginTop: '.4rem' }}>
          <b>אישור אוטומטי ("שתיקה כהסכמה"):</b>
          {RELIEFS.deemedApproval.map((d, i) => <div key={i} style={{ marginTop: '.15rem' }}>• {d}</div>)}
        </div>
        <div style={{ fontSize: '.82rem', color: 'var(--gray-600)', marginTop: '.4rem' }}>
          <b>דוגמאות נפוצות:</b> {RELIEFS.examples.join(' · ')}
        </div>
        <div style={{ fontSize: '.8rem', color: 'var(--gray-500)', marginTop: '.4rem' }}>{RELIEFS.smallDealer}</div>
      </div>

      <div style={{ ...card, borderColor: '#fecaca' }}>
        <div style={{ fontWeight: 700, marginBottom: '.4rem', color: '#b91c1c' }}>🚨 פסילת ספרים</div>
        <div style={{ fontSize: '.84rem', color: 'var(--gray-600)', lineHeight: 1.6 }}>{DISQUALIFICATION.what}</div>
        <div style={{ fontSize: '.82rem', color: 'var(--gray-600)', marginTop: '.4rem' }}>
          {DISQUALIFICATION.consequences.map((c, i) => <div key={i} style={{ marginTop: '.15rem' }}>• {c}</div>)}
        </div>
        <div style={{ fontSize: '.82rem', color: 'var(--gray-600)', marginTop: '.4rem' }}>{DISQUALIFICATION.closedSystem}</div>
        <div style={{ fontSize: '.84rem', fontWeight: 700, color: '#b91c1c', marginTop: '.4rem' }}>{DISQUALIFICATION.mostCommon}</div>
      </div>

      <div style={card}>
        <div style={{ fontWeight: 700, marginBottom: '.4rem' }}>📔 מסלול "נישום זכאי" — יומן העסק</div>
        <div style={{ fontSize: '.84rem', color: 'var(--gray-600)', lineHeight: 1.6 }}>
          <div><b>למי:</b> {ELIGIBLE_TAXPAYER.who}</div>
          <div style={{ marginTop: '.3rem' }}>{ELIGIBLE_TAXPAYER.what}</div>
          <div style={{ marginTop: '.3rem' }}>{ELIGIBLE_TAXPAYER.keyRules.join(' · ')}</div>
        </div>
      </div>

      <div style={{ ...card, background: 'var(--gray-50)' }}>
        <div style={{ fontWeight: 700, marginBottom: '.3rem' }}>ומה עם מע"מ?</div>
        <div style={{ fontSize: '.82rem', color: 'var(--gray-600)', lineHeight: 1.6 }}>{VAT_NOTE}</div>
      </div>

      <div style={{ fontSize: '.72rem', color: 'var(--gray-400)' }}>
        מקור: הוראות מס הכנסה (ניהול פנקסי חשבונות), תשל"ג-1973 — נוסח משולב מעודכן. מועד האימות האחרון מוצג בתג העדכניות שבראש המסך.
      </div>
    </div>
  );
}

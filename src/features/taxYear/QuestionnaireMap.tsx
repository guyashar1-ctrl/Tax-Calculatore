// ─── השאלון המלא וההסתעפויות שלו — ובמצב «ללקוח הזה» ─────────────────────────
// ‼ 11.10.2026 (גיא): המשרד צריך לראות את כל השאלון, מתי כל שאלה נשאלת ולמה — גם
// כדי לעבוד ביד במשרד אחר. התנאים הם נתונים בקטלוג (after, rare, onlyIfOnCard,
// coveredBy, per, purposes), וכאן הם מתורגמים למילים. אין כאן לוגיקה משלו:
// במצב לקוח, מה נשאל ולמה — מתמונת השנה (picture.ts), אותו חישוב שבונה את השאלות.
// ‼ תבנית ≠ מה שנשלח: לשאלה שנשלחה מוצג הנוסח שנשמר איתה וגרסת התבנית שממנה נבנתה.

import { useMemo, useState } from 'react';
import type { Client } from '../../types';
import { AREAS, ITEMS, ITEM_BY_KEY, CATALOG_VERSION, type InfoItem, type AreaId } from './catalog';
import type { ItemState, YearPicture } from './picture';
import { DOCS } from './documents';
import type { InfoAsk, Purpose } from './types';
import { AVAILABLE } from '../taxKnowledge/availability';

const KIND: Record<InfoItem['kind'], string> = { screener: 'שאלת פתיחה', confirm: 'אישור מהכרטיס', detail: 'פירוט', amount: 'סכום', document: 'מסמך' };
const PER: Record<string, string> = {
  person: 'לכל אחד מבני הזוג', couple: 'למשק הבית', employer: 'לכל מעסיק', business: 'לכל עסק', property: 'לכל נכס', account: 'לכל חשבון',
  foreign_source: 'לכל מקור בחו״ל', fund: 'לכל קופה', child: 'לכל ילד', transaction: 'לכל עסקה', company: 'לכל חברה', asset: 'לכל נכס קבוע',
};
const STATE: Record<ItemState, { label: string; tone: string }> = {
  known: { label: 'ידוע', tone: 'green' }, partial: { label: 'ידוע חלקית', tone: 'blue' }, fromCard: { label: 'לאשר מהכרטיס', tone: 'blue' },
  pendingReview: { label: 'ממתין לבדיקה', tone: 'amber' }, docReceived: { label: 'מסמך התקבל', tone: 'amber' }, asked: { label: 'נשלח ללקוח', tone: 'violet' },
  unavailable: { label: '«אין עדיין»', tone: 'amber' }, notYetAvailable: { label: 'עוד לא זמין', tone: '' }, missing: { label: 'חסר', tone: 'red' }, notApplicable: { label: 'לא חל', tone: '' },
};
const ROLE: Record<string, string> = { client: 'הלקוח', spouse: 'בן/בת הזוג', couple: 'משק הבית' };

/** התנאים של פריט, במילים — מה שצריך כדי לשאול אותו ביד. */
export function conditionsOf(it: InfoItem): string[] {
  const out: string[] = [];
  if (it.after) out.push(`רק אחרי «כן» ל«${ITEM_BY_KEY[it.after]?.label ?? it.after}»`);
  if (it.rare) out.push('חריג: נפתח רק כשהמשרד מסמן אותו');
  if (it.onlyIfOnCard) out.push('נשאל רק כשיש בכרטיס מה לאשר');
  if (it.coveredBy) out.push(`לא נשאל כשהכרטיס כבר עונה דרך «${ITEM_BY_KEY[it.coveredBy]?.label ?? it.coveredBy}»`);
  if (it.key === 'household.degree' || it.key === 'household.release') out.push('רק כשהסיום או השחרור היו ב-4 השנים שלפני שנת המס');
  if (it.key === 'household.creditChanges') out.push('רק כשתואר, שחרור או יישוב לא נשאלו כי הכרטיס ריק או ישן');
  if (it.key === 'rent.expenses') out.push('רק כשאחד הנכסים במסלול הרגיל (לא בפטור ולא ב-10%)');
  if (it.key.endsWith('.changesSince')) out.push('בדוח שנתי, רק לתחום שידוע עד חודש החתך — במקום לשאול הכול מחדש');
  if (it.coupleQuestion) out.push('לזוג: שאלה אחת «מי מכם?»; התשובה נשמרת לכל אחד');
  if (it.declKind === 'first') out.push('רק בהצהרה ראשונה');
  if (it.declKind === 'followup') out.push('רק בהצהרת המשך — מה השתנה מאז ההצהרה הקודמת');
  if (it.followupQuestion) out.push(`בהצהרת המשך נשאל אחרת: «${it.followupQuestion.replace('{name}', '…')}», עם הסכום מההצהרה הקודמת`);
  // 12.10.2026 · ישות חדשה, שאלה כשהכרטיס ריק, עדכון הכרטיס
  if (it.onlyNew) out.push('רק על ישות חדשה: אחרי «כן», כשבתיק אין לאדם הזה ישות כזו — ואז גם המסמך שלה מתבקש מיד');
  if (it.noCardEntity) out.push('רק כשבכרטיס אין לאדם הזה עסק');
  if (it.whenEmpty) out.push(`כשבכרטיס אין כלום — נשאל: «${it.whenEmpty.question}»`);
  if (it.cardFlag || it.cardChoice) out.push('אחרי אישור — «עדכן בתיק» (הצעה עם הערך הקודם והמקור)');
  if (it.docKind && DOCS[it.docKind]?.durable) out.push('מסמך קבוע: אם כבר אושר בתיק (בקליטה, בשנה אחרת או בתהליך אחר) — לא מתבקש שוב');
  return out;
}

function purposeText(p: Purpose[]): string {
  // 16.10.2026 · מסמכי ההיכרות ירדו מהשאלון (נשארים כזהות הראיות); מסך הרשת נבנה מהשאלות, לא מהתמונה
  if (!p.length) return 'לא נשאל (מסמך — בדוח ובהצהרה; או מסך מקובץ)';
  if (p.includes('intake')) return 'בקליטה והשלמת תיק';
  if (p.includes('wealth')) return 'בהצהרת הון';
  return p.includes('estimate') && p.includes('annual') ? 'בהערכה ובדוח' : p.includes('annual') ? 'בדוח השנתי בלבד' : 'בהערכה בלבד';
}

function ItemRow({ it, nested, picture, asks }: { it: InfoItem; nested?: boolean; picture?: YearPicture; asks?: InfoAsk[] }) {
  const doc = it.docKind ? DOCS[it.docKind] : undefined;
  const conds = conditionsOf(it);
  const st = picture?.statuses.filter(s => s.item.key === it.key) ?? [];
  const sent = (asks ?? []).filter(a => a.itemKey === it.key && a.state !== 'draft');
  return (
    <li className={`qm-item${nested ? ' is-nested' : ''}`} data-item={it.key}>
      <div className="qm-item-head">
        <b>{it.label}</b>
        <span className="ty-chip">{KIND[it.kind]}</span>
        {it.who === 'office' && <span className="ty-chip violet">המשרד ממלא</span>}
        <span className="qm-meta">{PER[it.per] ?? it.per} · {purposeText(it.purposes)}</span>
      </div>
      {it.who === 'client' && (it.question || it.coupleQuestion) && (
        <div className="qm-q">«{(it.question ?? it.coupleQuestion ?? '').replace('{name}', '…').replace('{entity}', '…').replace('{since}', '…')}»</div>
      )}
      {it.why && <div className="qm-why">למה: {it.why}</div>}
      {conds.length > 0 && <ul className="qm-conds">{conds.map(c => <li key={c}>{c}</li>)}</ul>}
      {doc && <div className="qm-why">מסמך: {doc.label}{doc.availableFrom ? ' — זמין בדרך כלל רק בשנה שאחרי' : ''}{doc.extraction === 'not_supported' ? ' · הסכומים מוזנים במשרד' : ''}</div>}
      {it.calcBlockedBy && <div className="qm-why qm-warn">נאסף, אבל החישוב שתלוי בו חסום עד הכרעה ({it.calcBlockedBy})</div>}
      {it.officeNext && <div className="qm-why">המשרד אחר כך: {it.officeNext}</div>}
      {picture && (
        <div className="qm-client">
          {st.length === 0
            ? <span className="qm-meta">לא נשאל ללקוח הזה{conds.length ? ' — לפי התנאים למעלה' : ''}</span>
            : st.map((s, i) => (
              <span key={i} className="qm-client-row">
                <span className={`ty-chip ${STATE[s.state].tone}`}>{STATE[s.state].label}</span>
                <span className="qm-meta">{ROLE[s.subjectRole] ?? s.subjectRole}{s.entityLabel ? ` · ${s.entityLabel}` : ''} — {s.officeAction ?? s.detail}</span>
              </span>
            ))}
          {sent.map(a => (
            <div key={a.id} className="qm-sent">
              נשלח בנוסח: «{a.prompt.title}»
              {a.prompt.templateVersion
                ? a.prompt.templateVersion === CATALOG_VERSION ? ' · מהתבנית הנוכחית' : ` · מגרסת תבנית ${a.prompt.templateVersion} — התבנית השתנתה מאז; מה שנשלח לא משתנה`
                : ' · נשלח לפני שנשמרה גרסת תבנית'}
            </div>
          ))}
        </div>
      )}
    </li>
  );
}

export default function QuestionnaireMap({ client, picture, asks, initialPurpose = 'annual' }: {
  client?: Client;
  /** מצב «ללקוח הזה»: מה נשאל, מה ידוע ולמה — מתמונת השנה. */
  picture?: YearPicture;
  asks?: InfoAsk[];
  initialPurpose?: Purpose;
}) {
  const [purpose, setPurpose] = useState<Purpose>(picture?.purpose ?? initialPurpose);
  const [mode, setMode] = useState<'all' | 'client'>(picture ? 'client' : 'all');
  const [q, setQ] = useState('');
  const showClient = mode === 'client' && !!picture;

  const byArea = useMemo(() => {
    const words = q.trim().split(/\s+/).filter(Boolean);
    const match = (it: InfoItem) => !words.length || words.some(w => `${it.label} ${it.question ?? ''} ${it.coupleQuestion ?? ''} ${it.why ?? ''}`.includes(w));
    const m = new Map<AreaId, InfoItem[]>();
    for (const it of ITEMS) {
      if (!it.purposes.includes(showClient ? picture!.purpose : purpose)) continue;
      if (!match(it)) continue;
      m.set(it.area, [...(m.get(it.area) ?? []), it]);
    }
    return m;
  }, [q, purpose, showClient, picture]);

  const count = [...byArea.values()].reduce((n, l) => n + l.length, 0);
  return (
    <div className="qm">
      <div className="qm-bar">
        {picture && (
          <div className="qm-seg" role="group" aria-label="תצוגה">
            <button type="button" aria-pressed={mode === 'client'} onClick={() => setMode('client')}>ללקוח הזה{client?.firstName ? ` (${client.firstName})` : ''}</button>
            <button type="button" aria-pressed={mode === 'all'} onClick={() => setMode('all')}>השאלון המלא</button>
          </div>
        )}
        {!showClient && (
          <div className="qm-seg" role="group" aria-label="תכלית">
            {AVAILABLE.taxEstimate && <button type="button" aria-pressed={purpose === 'estimate'} onClick={() => setPurpose('estimate')}>הערכת מס</button>}
            <button type="button" aria-pressed={purpose === 'annual'} onClick={() => setPurpose('annual')}>דוח שנתי</button>
            <button type="button" aria-pressed={purpose === 'wealth'} onClick={() => setPurpose('wealth')}>הצהרת הון</button>
            <button type="button" aria-pressed={purpose === 'intake'} onClick={() => setPurpose('intake')}>קליטה</button>
          </div>
        )}
        <input className="qm-search" type="search" aria-label="חיפוש בשאלון" placeholder="חיפוש: תואר, שכירות, 106…" value={q} onChange={e => setQ(e.target.value)} />
      </div>
      <p className="qm-meta" style={{ margin: 0 }}>
        {showClient
          ? 'מה נשאל את הלקוח הזה, מה כבר ידוע ולמה שאלות אחרות לא נשאלות. השאלות נבנות מהתבנית; מה שנשלח נשמר בנוסח שבו נשלח.'
          : `התבנית: ${count} פריטים. שאלת פתיחה פותחת את השאלות שתחתיה; פריט שהכרטיס עונה עליו נשלח לאישור ולא כשאלה.`}
        {' '}גרסת תבנית: {CATALOG_VERSION}.
      </p>
      {AREAS.filter(a => byArea.has(a.id)).map(a => {
        const list = byArea.get(a.id)!;
        const top = list.filter(it => !it.after || !list.some(o => o.key === it.after));
        return (
          <section key={a.id} className="qm-area" aria-label={a.title}>
            <h4>{a.title} <span className="qm-meta">ללקוח: «{a.clientTitle}» · {a.form1219 ? `בטופס 1219: ${a.form1219}` : a.purposes.includes('intake') ? `משמש בטופס 1301: חלק ${a.parts1301.join(', ')}` : `בטופס 1301: חלק ${a.parts1301.join(', ')}`}{a.annexes.length ? ` · נספחים ${a.annexes.join(', ')}` : ''}</span></h4>
            <ul className="qm-list">
              {top.map(it => (
                <ItemRowWithKids key={it.key} it={it} list={list} picture={showClient ? picture : undefined} asks={showClient ? asks : undefined} />
              ))}
            </ul>
          </section>
        );
      })}
      {count === 0 && <p className="qm-meta">לא נמצאו שאלות. נסו מילה אחרת.</p>}
    </div>
  );
}

function ItemRowWithKids({ it, list, picture, asks }: { it: InfoItem; list: InfoItem[]; picture?: YearPicture; asks?: InfoAsk[] }) {
  const kids = list.filter(o => o.after === it.key);
  return (
    <>
      <ItemRow it={it} picture={picture} asks={asks} />
      {kids.length > 0 && (
        <li className="qm-kids"><ul className="qm-list">{kids.map(k => <ItemRow key={k.key} it={k} nested picture={picture} asks={asks} />)}</ul></li>
      )}
    </>
  );
}

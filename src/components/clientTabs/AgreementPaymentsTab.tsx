// ─── הסכם ותשלומים — הרשומה המסחרית ────────────────────────────────────────
// מקור UX מחייב: docs/prototypes/client-agreement-payments.html
//
// המסך עונה על שלוש שאלות, בסדר הזה: כמה הוא משלם · מה עוד לגבות · מה אפשר
// לעשות. כל השאר משני.
//
// ‼ תקרת צפיפות מדודה (לקוח רגיל בלי חריגים): 11 שורות טקסט · קו מפריד אחד ·
// 3 פעולות · אלמנט כחול אחד ("+ הצעת מחיר חדשה") · אפס קופסאות ואפס תגיות.
// כל מקטע משני נעלם לגמרי כשאין לו תוכן — לא מוצג כמצב ריק. תוספת ויזואלית
// כאן היא ליקוי, גם אם היא "רק" שורה אחת.
//
// ‼ מה שהמנוע החדש יודע (scheduled / effective_from / supersedes / משימת
// המעבר) לא מופיע כאן כמונח, כתגית או כאזהרה. שינוי עתידי שאושר הוא משפט
// אחד שקט; המספר הגדול לא זז עד מועד התוקף.

import { useMemo, useState } from 'react';
import type { Client } from '../../types';
import type { AdditionalCharge } from '../../types/charges';
import type { Engagement } from '../../types/onboarding';
import type { Quotation, QuotationItem, QuotationKind } from '../../types/quotations';
import { itemFinalPrice, formatILS } from '../../utils/quotationCalc';
import { currentEngagement, upcomingEngagement, previousEngagements } from '../../utils/engagementSelectors';
import Modal from '../ui/Modal';

const VAT_RATE = 18;

interface Props {
  client: Client;
  quotations: Quotation[];
  engagements: Engagement[];
  charges: AdditionalCharge[];
  onMarkChargePaid: (charge: AdditionalCharge) => Promise<AdditionalCharge>;
  /** פותח את בונה ההצעות עם הכוונה המסחרית שנבחרה. */
  onNewQuotation?: (kind: QuotationKind) => void;
}

function fmtMonth(ym?: string): string {
  if (!ym) return '';
  const m = /^(\d{4})-(\d{2})/.exec(ym);
  if (!m) return ym;
  const names = ['ינואר', 'פברואר', 'מרץ', 'אפריל', 'מאי', 'יוני', 'יולי', 'אוגוסט', 'ספטמבר', 'אוקטובר', 'נובמבר', 'דצמבר'];
  return `${names[Number(m[2]) - 1]} ${m[1]}`;
}
function fmtDate(iso?: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  return isNaN(d.getTime()) ? iso : d.toLocaleDateString('he-IL', { day: '2-digit', month: '2-digit', year: 'numeric' });
}
function itemLabel(i: QuotationItem): string {
  return i.year ? `${i.name} ${i.year}` : i.name;
}
/** "מאוגוסט 2026" — הצמדת מ' לחודש, בלי רווח שנראה כמו תקלה. */
function fromMonth(ym?: string): string {
  const label = fmtMonth(ym);
  return label ? `מ${label}` : '';
}

export default function AgreementPaymentsTab({
  client, quotations, engagements, charges, onMarkChargePaid, onNewQuotation,
}: Props) {
  const [detailOpen, setDetailOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [prevOpen, setPrevOpen] = useState(false);
  const [intentOpen, setIntentOpen] = useState(false);
  const [markingId, setMarkingId] = useState<string | null>(null);
  const [markError, setMarkError] = useState<string | null>(null);

  const clientCharges = useMemo(() => charges.filter(c => c.clientId === client.id), [charges, client.id]);
  const clientQuotations = useMemo(
    () => quotations.filter(q => q.clientId === client.id),
    [quotations, client.id]);

  const current = useMemo(() => currentEngagement(engagements, client.id), [engagements, client.id]);
  const upcoming = useMemo(() => upcomingEngagement(engagements, client.id), [engagements, client.id]);
  const previous = useMemo(() => previousEngagements(engagements, client.id), [engagements, client.id]);

  const quotationOf = (e?: Engagement) => e?.quotationId ? clientQuotations.find(q => q.id === e.quotationId) : undefined;
  const currentQuotation = quotationOf(current);
  const itemsOf = (q?: Quotation): QuotationItem[] => (q?.snapshot?.items ?? q?.items ?? []) as QuotationItem[];
  const items = itemsOf(currentQuotation);

  const priced = items.filter(i => i.category !== 'included');
  const included = items.filter(i => i.category === 'included');

  /** הצעה שנשלחה וממתינה לחתימת הלקוח — עדיין לא הסכם. */
  const awaiting = useMemo(
    () => clientQuotations.find(q => q.status === 'sent' || q.status === 'viewed'),
    [clientQuotations]);

  const outstanding = clientCharges
    .filter(c => c.status !== 'paid')
    .sort((a, b) => (a.dueDate ?? '9999').localeCompare(b.dueDate ?? '9999'));
  const paid = clientCharges
    .filter(c => c.status === 'paid')
    .sort((a, b) => (b.paidAt ?? '').localeCompare(a.paidAt ?? ''));

  const today = new Date().toISOString().slice(0, 10);

  async function markPaid(charge: AdditionalCharge) {
    setMarkingId(charge.id);
    setMarkError(null);
    try {
      await onMarkChargePaid(charge);
    } catch (e) {
      setMarkError(e instanceof Error ? e.message : 'הפעולה נכשלה');
    } finally {
      setMarkingId(null);
    }
  }

  function sourceLabel(c: AdditionalCharge): string {
    if (c.sourceType === 'manual') return 'הזנה ידנית';
    const q = clientQuotations.find(x => x.id === c.sourceQuotationId);
    return q?.quotationNumber ? `הצעה #${q.quotationNumber}` : 'לפי הצעת מחיר';
  }

  /** מתי ייגבה: תנאי עסקי אם יש, אחרת תאריך. אף פעם לא שניהם. */
  function whenLabel(c: AdditionalCharge): string {
    if (c.dueTrigger) return c.dueTrigger;
    if (!c.dueDate) return '';
    return c.dueDate <= today ? `הגיע מועד התשלום · ${fmtDate(c.dueDate)}` : `לתשלום ${fmtDate(c.dueDate)}`;
  }

  const newQuotationAction = onNewQuotation && (
    <button type="button" className="ap-link ap-link-primary" onClick={() => {
      if (current) setIntentOpen(true); else onNewQuotation('engagement');
    }}>
      + הצעת מחיר חדשה
    </button>
  );

  // ── אין הסכם: שורה אחת ופעולה, בלי שלושה מקטעים ריקים ──
  if (!current) {
    return (
      <div className="cw-tabpanel ap">
        <div className="ap-label">התקשרות</div>
        <div className="ap-empty">אין עדיין הסכם פעיל ללקוח הזה.</div>
        {newQuotationAction && <div className="ap-actions">{newQuotationAction}</div>}
        {intentOpen && onNewQuotation && (
          <IntentDialog current={current} onPick={k => { setIntentOpen(false); onNewQuotation(k); }} onClose={() => setIntentOpen(false)} />
        )}
      </div>
    );
  }

  const monthly = current.monthlyTotal ?? 0;

  return (
    <div className="cw-tabpanel ap">

      {/* ① כמה הוא משלם היום */}
      <div className="ap-label">התקשרות נוכחית</div>
      <div className="ap-amount">
        <span className="ap-amount-num">{formatILS(monthly)}</span>
        <span className="ap-amount-vat">לחודש + מע״מ</span>
      </div>
      {priced.length > 0 && (
        <div className="ap-what">
          {priced.map(itemLabel).join(' · ')}
          {included.length > 0 && <span className="ap-what-more"> · ועוד {included.length} שירותים ללא תוספת</span>}
        </div>
      )}
      <div className="ap-when">
        {fromMonth(current.effectiveFrom ?? current.billingStartMonth)}
        {currentQuotation?.quotationNumber ? ` · לפי הצעה #${currentQuotation.quotationNumber}` : ''}
      </div>
      <div className="ap-actions">
        <button type="button" className="ap-link" onClick={() => setDetailOpen(true)}>פרטי ההתקשרות</button>
        {previous.length > 0 && (
          <button type="button" className="ap-link" onClick={() => setPrevOpen(true)}>התקשרויות קודמות</button>
        )}
      </div>

      {/* ② שינוי מסחרי — משפט אחד, מיקום אחד, שתי נוסחאות. */}
      {upcoming ? (
        <div className="ap-note">
          {fromMonth(upcoming.effectiveFrom)}: <b>{formatILS(upcoming.monthlyTotal ?? 0)}</b> לחודש
          {upcoming.approvedAt ? ` · אושר ${fmtDate(upcoming.approvedAt)}` : ''}
        </div>
      ) : awaiting ? (
        <div className="ap-note">
          הצעה #{awaiting.quotationNumber} ממתינה לאישור הלקוח
        </div>
      ) : null}

      {/* ③ מה עוד לגבות — קיים רק כשיש */}
      {outstanding.length > 0 && (
        <>
          <hr className="ap-rule" />
          <div className="ap-label">מה עוד לגבות</div>
          {outstanding.map(c => (
            <div className="ap-charge" key={c.id}>
              <div className="ap-charge-amt">{formatILS(c.amount)}</div>
              <div className="ap-charge-name">
                <div>{c.description}</div>
                <div className="ap-charge-meta">
                  {[whenLabel(c), sourceLabel(c)].filter(Boolean).join(' · ')}
                </div>
              </div>
              <button type="button" className="ap-mark" disabled={markingId === c.id} onClick={() => markPaid(c)}>
                {markingId === c.id ? 'מסמן…' : 'סמן כשולם'}
              </button>
            </div>
          ))}
          {markError && <div className="ap-error">{markError}</div>}
        </>
      )}

      {/* ④ הפעולה המסחרית */}
      {newQuotationAction && (
        <>
          <hr className="ap-rule" />
          <div>{newQuotationAction}</div>
        </>
      )}

      {/* ⑤ היסטוריה — נוכחת, לא מתחרה */}
      {paid.length > 0 && (
        <div className="ap-history">
          <span className="ap-history-k">היסטוריית תשלומים</span>
          <span className="ap-history-v">
            {paid.length} תשלומים · {formatILS(paid.reduce((s, c) => s + c.amount, 0))} סה״כ
          </span>
          <button type="button" className="ap-link" onClick={() => setHistoryOpen(true)}>הצגה</button>
        </div>
      )}

      <div className="ap-hint">שכר חודשי ותשלומים חד־פעמיים מוצגים בנפרד - הם לא מתאחדים לסכום אחד.</div>

      {detailOpen && (
        <EngagementDetail
          engagement={current} quotation={currentQuotation} items={items}
          onClose={() => setDetailOpen(false)} />
      )}
      {prevOpen && (
        <PreviousAgreements
          current={current} currentQuotation={currentQuotation}
          previous={previous} quotationOf={quotationOf}
          onClose={() => setPrevOpen(false)} />
      )}
      {historyOpen && (
        <PaymentHistory paid={paid} sourceLabel={sourceLabel} onClose={() => setHistoryOpen(false)} />
      )}
      {intentOpen && onNewQuotation && (
        <IntentDialog current={current} onPick={k => { setIntentOpen(false); onNewQuotation(k); }} onClose={() => setIntentOpen(false)} />
      )}
    </div>
  );
}

/* ─── פרטי ההתקשרות — כאן, ורק כאן, יושבות שורות "כלול" ──────────────────── */
function EngagementDetail({ engagement, quotation, items, onClose }: {
  engagement: Engagement; quotation?: Quotation; items: QuotationItem[]; onClose: () => void;
}) {
  const priced = items.filter(i => i.category !== 'included');
  const included = items.filter(i => i.category === 'included');
  const monthlyItems = priced.filter(i => i.category === 'monthly');
  const lineSum = monthlyItems.reduce((s, i) => s + itemFinalPrice(i), 0);
  const agreed = engagement.monthlyTotal ?? lineSum;
  const discount = Math.round(lineSum - agreed);

  return (
    <Modal
      title="פרטי ההתקשרות"
      onClose={onClose}
      footer={<button type="button" className="btn btn-primary" onClick={onClose}>סגירה</button>}
    >
      <div className="ap-detail-sub">
        {quotation?.quotationNumber ? `לפי הצעה #${quotation.quotationNumber}` : 'לפי ההצעה שאושרה'}
        {quotation?.approvedAt ? ` · אושרה ${fmtDate(quotation.approvedAt)}` : ''}
        {` · בתוקף ${fromMonth(engagement.effectiveFrom ?? engagement.billingStartMonth)}`}
      </div>

      <div className="ap-detail-sect">בשכר החודשי</div>
      {monthlyItems.map(i => (
        <div className="ap-detail-row" key={i.id}>
          <div className="ap-detail-name">{itemLabel(i)}</div>
          <div className="ap-detail-val">{formatILS(itemFinalPrice(i))} לחודש</div>
        </div>
      ))}
      <div className="ap-detail-row ap-detail-total">
        <div className="ap-detail-name">
          <b>סה״כ חודשי</b>
          {discount >= 1 && <div className="ap-detail-meta">מחיר שסוכם - הנחה של {formatILS(discount)} לחודש</div>}
        </div>
        <div className="ap-detail-val"><b>{formatILS(agreed)}</b> + מע״מ</div>
      </div>
      <div className="ap-detail-row">
        <div className="ap-detail-name">כולל מע״מ {VAT_RATE}%</div>
        <div className="ap-detail-val">{formatILS(Math.round(agreed * (1 + VAT_RATE / 100)))} לחודש</div>
      </div>

      {priced.filter(i => i.category !== 'monthly').length > 0 && (
        <>
          <div className="ap-detail-sect">מחוץ לשכר החודשי</div>
          {priced.filter(i => i.category !== 'monthly').map(i => (
            <div className="ap-detail-row" key={i.id}>
              <div className="ap-detail-name">{itemLabel(i)}</div>
              <div className="ap-detail-val">
                {formatILS(itemFinalPrice(i))}{i.category === 'annual' ? ' לשנה' : ''}
              </div>
            </div>
          ))}
        </>
      )}

      {included.length > 0 && (
        <>
          <div className="ap-detail-sect">כלול - ללא תוספת תשלום</div>
          {included.map(i => (
            <div className="ap-detail-row" key={i.id}>
              <div className="ap-detail-name">{itemLabel(i)}</div>
              <div className="ap-detail-val ap-detail-free">כלול</div>
            </div>
          ))}
        </>
      )}

      <div className="ap-detail-sect">תנאי התשלום</div>
      <div className="ap-detail-row">
        <div className="ap-detail-name">תחילת חיוב</div>
        <div className="ap-detail-val">{fmtMonth(engagement.effectiveFrom ?? engagement.billingStartMonth)}</div>
      </div>
      <div className="ap-detail-row">
        <div className="ap-detail-name">מועד החיוב<div className="ap-detail-meta">הראשון נגבה עם האישור</div></div>
        <div className="ap-detail-val">ב־1 בכל חודש</div>
      </div>
      <div className="ap-detail-row">
        <div className="ap-detail-name">
          חידוש<div className="ap-detail-meta">המחיר ממשיך לשנה הבאה אלא אם יוסכם אחרת</div>
        </div>
        <div className="ap-detail-val">אוטומטי</div>
      </div>

      <div className="ap-callout">
        שינוי מסחרי מהותי אינו נערך כאן. הוא נעשה בהצעת מחיר חדשה, כדי שיישאר תיעוד
        של מה סוכם, מתי, ועל סמך מה הלקוח חתם.
      </div>
    </Modal>
  );
}

function PreviousAgreements({ current, currentQuotation, previous, quotationOf, onClose }: {
  current: Engagement; currentQuotation?: Quotation; previous: Engagement[];
  quotationOf: (e?: Engagement) => Quotation | undefined; onClose: () => void;
}) {
  return (
    <Modal
      title="התקשרויות קודמות"
      onClose={onClose}
      footer={<button type="button" className="btn btn-primary" onClick={onClose}>סגירה</button>}
    >
      <div className="ap-detail-sub">כל שינוי מסחרי נשמר כהסכם נפרד עם התאריכים שלו.</div>
      <div className="ap-detail-row">
        <div className="ap-detail-name">
          {currentQuotation?.quotationNumber ? `הצעה #${currentQuotation.quotationNumber}` : 'ההסכם הנוכחי'}
          <div className="ap-detail-meta">{fromMonth(current.effectiveFrom ?? current.billingStartMonth)} · נוכחית</div>
        </div>
        <div className="ap-detail-val">{formatILS(current.monthlyTotal ?? 0)} לחודש</div>
      </div>
      {previous.map(e => {
        const q = quotationOf(e);
        return (
          <div className="ap-detail-row" key={e.id}>
            <div className="ap-detail-name">
              {q?.quotationNumber ? `הצעה #${q.quotationNumber}` : 'הסכם קודם'}
              <div className="ap-detail-meta">
                {fromMonth(e.effectiveFrom ?? e.billingStartMonth)}
                {e.endedAt ? ` עד ${fmtDate(e.endedAt)}` : ''}
              </div>
            </div>
            <div className="ap-detail-val ap-detail-free">{formatILS(e.monthlyTotal ?? 0)} לחודש</div>
          </div>
        );
      })}
    </Modal>
  );
}

function PaymentHistory({ paid, sourceLabel, onClose }: {
  paid: AdditionalCharge[]; sourceLabel: (c: AdditionalCharge) => string; onClose: () => void;
}) {
  return (
    <Modal
      title="היסטוריית תשלומים"
      onClose={onClose}
      footer={<button type="button" className="btn btn-primary" onClick={onClose}>סגירה</button>}
    >
      <div className="ap-detail-sub">
        חיובים חד־פעמיים שסומנו כשולמו. השכר החודשי נגבה בהוראת קבע ואינו מופיע כאן.
      </div>
      {paid.map(c => (
        <div className="ap-detail-row" key={c.id}>
          <div className="ap-detail-name">
            {c.description}
            <div className="ap-detail-meta">{sourceLabel(c)} · {fmtDate(c.paidAt)}</div>
          </div>
          <div className="ap-detail-val">{formatILS(c.amount)}</div>
        </div>
      ))}
      <div className="ap-detail-row ap-detail-total">
        <div className="ap-detail-name"><b>סה״כ</b></div>
        <div className="ap-detail-val"><b>{formatILS(paid.reduce((s, c) => s + c.amount, 0))}</b></div>
      </div>
    </Modal>
  );
}

/** שתי כוונות מסחריות. הבחירה קובעת ממה בונה ההצעות מתחיל. */
function IntentDialog({ current, onPick, onClose }: {
  current?: Engagement; onPick: (k: QuotationKind) => void; onClose: () => void;
}) {
  return (
    <Modal title="הצעת מחיר חדשה" onClose={onClose} width={470} footer={null}>
      <div className="ap-detail-sub">מה מטרת ההצעה? הבחירה קובעת ממה הבונה מתחיל.</div>
      <button type="button" className="ap-choice" onClick={() => onPick('one_time')}>
        <b>שירות חד־פעמי</b>
        <span>אישור מיוחד, הצהרת הון, עבודה חריגה. השכר החודשי לא משתנה.</span>
      </button>
      <button type="button" className="ap-choice" onClick={() => onPick('engagement')}>
        <b>עדכון ההתקשרות / שנה הבאה</b>
        <span>
          מתחיל מההתקשרות הנוכחית{current?.monthlyTotal ? ` (${formatILS(current.monthlyTotal)} לחודש)` : ''} ומעדכן רק מה שהשתנה.
        </span>
      </button>
    </Modal>
  );
}

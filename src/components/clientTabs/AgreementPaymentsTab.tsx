// ─── הסכם ותשלומים — הרשומה המסחרית ────────────────────────────────────────
// מקור UX מחייב: docs/prototypes/client-case-simplified-exploration-v3-final2.html
// (מקטע #v-pay). לא מערכת חיוב שנייה: קוראת מתוך quotations/engagements/
// additional_charges הקיימים ומציגה אותם בהיררכיה רגועה. הצעה נוספת עוברת
// באותו מסלול הצעה (Draft→שליחה→אישור), בקשה עתידית נשארת ב-additional_charges.

import { useMemo, useState } from 'react';
import type { Client } from '../../types';
import type { AdditionalCharge } from '../../types/charges';
import type { Engagement } from '../../types/onboarding';
import type { Quotation, QuotationItem } from '../../types/quotations';
import { itemFinalPrice, itemOriginalPrice, formatILS } from '../../utils/quotationCalc';

interface Props {
  client: Client;
  quotations: Quotation[];
  engagements: Engagement[];
  charges: AdditionalCharge[];
  onMarkChargePaid: (charge: AdditionalCharge) => Promise<AdditionalCharge>;
  onNewQuotation?: () => void;
}

function fmtMonth(ym?: string): string {
  if (!ym) return '';
  const m = /^(\d{4})-(\d{2})$/.exec(ym);
  return m ? `${m[2]}/${m[1]}` : ym;
}
function fmtDate(iso?: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('he-IL', { day: '2-digit', month: '2-digit', year: 'numeric' });
}
function itemLabel(item: QuotationItem): string {
  return item.year ? `${item.name} ${item.year}` : item.name;
}

export default function AgreementPaymentsTab({ client, quotations, engagements, charges, onMarkChargePaid, onNewQuotation }: Props) {
  const [showAgreementDetail, setShowAgreementDetail] = useState(false);
  const [showAttribution, setShowAttribution] = useState(false);
  const [markingId, setMarkingId] = useState<string | null>(null);
  const [markError, setMarkError] = useState<string | null>(null);

  const clientCharges = useMemo(() => charges.filter(c => c.clientId === client.id), [charges, client.id]);
  const clientQuotations = useMemo(
    () => quotations.filter(q => q.clientId === client.id).sort((a, b) => (b.updatedAt ?? '').localeCompare(a.updatedAt ?? '')),
    [quotations, client.id]);
  const engagement = useMemo(
    () => engagements.find(e => e.clientId === client.id && e.status !== 'cancelled'),
    [engagements, client.id]);
  const currentQuotation = useMemo(
    () => engagement?.quotationId ? clientQuotations.find(q => q.id === engagement.quotationId) : undefined,
    [engagement, clientQuotations]);

  const items: QuotationItem[] = useMemo(() => {
    const snap = currentQuotation?.snapshot;
    return (snap?.items ?? currentQuotation?.items ?? []) as QuotationItem[];
  }, [currentQuotation]);

  const monthlyItems = items.filter(i => i.category === 'monthly');
  const includedItems = items.filter(i => i.category === 'included');
  const oneTimeItems = items.filter(i => i.category === 'one_time');
  const annualItems = items.filter(i => i.category === 'annual');

  // ‼ שנת הייחוס לדוח השנתי — השנה האחרונה שיש לה שורת 'annual' בהצעה,
  // אחרת השנה הנוכחית. לא ממציאים דוח שלא הוצע.
  const attributionYear = useMemo(() => {
    const years = annualItems.map(i => i.year).filter((y): y is number => !!y);
    return years.length ? Math.max(...years) : new Date().getFullYear();
  }, [annualItems]);
  const annualForYear = annualItems.filter(i => i.year === attributionYear);
  const retainerAttributed = annualForYear.reduce((s, i) => s + itemFinalPrice(i), 0);

  // ‼ השלמה חד-פעמית מגיעה גם מהצעה *נוספת* שנשלחה אחרי ההתקשרות ("השלמת
  // דוח שנתי"), ולכן מחפשים את שורת המקור בכל ההצעות של הלקוח ולא רק בזו
  // שמאחורי ההתקשרות. חיפוש בהצעה הנוכחית בלבד היה מפספס בדיוק את המקרה
  // שהייחוס נועד לענות עליו. הצמדה היא תמיד דרך source_item_id — לא סכימה
  // של כל החיובים, ולא סכום שמור שיכול להתיישן.
  const oneTimeItemsById = useMemo(() => {
    const m = new Map<string, QuotationItem>();
    for (const q of clientQuotations) {
      const list = (q.snapshot?.items ?? q.items ?? []) as QuotationItem[];
      for (const i of list) if (i.category === 'one_time') m.set(i.id, i);
    }
    return m;
  }, [clientQuotations]);

  const topUpCharges = clientCharges.filter(c => {
    const src = c.sourceItemId ? oneTimeItemsById.get(c.sourceItemId) : undefined;
    return !!src && src.year === attributionYear;
  });
  const topUpAttributed = topUpCharges.reduce((s, c) => s + c.amount, 0);
  const attributionTotal = retainerAttributed + topUpAttributed;

  const today = new Date().toISOString().slice(0, 10);
  const future = clientCharges
    .filter(c => c.status !== 'paid')
    .sort((a, b) => (a.dueDate ?? '9999').localeCompare(b.dueDate ?? '9999'));
  const history = clientCharges
    .filter(c => c.status === 'paid')
    .sort((a, b) => (b.paidAt ?? '').localeCompare(a.paidAt ?? ''));

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
    return q ? `לפי הצעת מחיר ${q.quotationNumber ? `#${q.quotationNumber}` : ''}`.trim() : 'לפי הצעת מחיר';
  }

  return (
    <div className="cw-tab">
      <div className="cw-section">
        <div className="cw-section-head">
          <span>התקשרות נוכחית</span>
          <span style={{ display: 'flex', gap: '.4rem' }}>
            {currentQuotation && (
              <button type="button" className="btn btn-sm btn-ghost" onClick={() => setShowAgreementDetail(v => !v)}>פרטי ההצעה</button>
            )}
            {onNewQuotation && <button type="button" className="btn btn-sm" onClick={onNewQuotation}>+ הצעת מחיר</button>}
          </span>
        </div>

        {!engagement || !currentQuotation ? (
          <div className="cw-empty">אין התקשרות פעילה עם הצעת מחיר מאושרת ברקע.</div>
        ) : (
          <>
            <div className="cw-kv-row">
              <span style={{ color: 'var(--ink-3)' }}>סה״כ חודשי</span>
              <b>{formatILS(engagement.monthlyTotal ?? 0)} לחודש</b>
            </div>
            {monthlyItems.map(i => (
              <div className="cw-kv-row" key={i.id}>
                <span style={{ color: 'var(--ink-3)' }}>{itemLabel(i)}</span>
                <b>{itemFinalPrice(i) > 0 ? `${formatILS(itemFinalPrice(i))} לחודש` : 'ללא חיוב'}</b>
              </div>
            ))}
            {includedItems.map(i => (
              <div className="cw-kv-row" key={i.id}>
                <span style={{ color: 'var(--ink-3)' }}>{itemLabel(i)}</span>
                <b>כלול בריטיינר</b>
              </div>
            ))}
            {engagement.billingStartMonth && (
              <div className="cw-kv-row">
                <span style={{ color: 'var(--ink-3)' }}>תחילת התקשרות</span>
                <b>{fmtMonth(engagement.billingStartMonth)}</b>
              </div>
            )}
            {oneTimeItems.filter(i => itemFinalPrice(i) === 0).map(i => (
              <div className="cw-kv-row" key={i.id}>
                <span style={{ color: 'var(--ink-3)' }}>{itemLabel(i)}</span>
                <b style={{ color: 'var(--ok, #17845b)' }}>ניתן ללא חיוב</b>
              </div>
            ))}
            {showAgreementDetail && (
              <div style={{ marginTop: '.5rem', padding: '.6rem .7rem', background: 'var(--surface-1)', borderRadius: 'var(--radius)', fontSize: 'var(--fs-12)', color: 'var(--ink-3)' }}>
                מתוך ההצעה המקורית{currentQuotation.quotationNumber ? ` #${currentQuotation.quotationNumber}` : ''}
                {currentQuotation.approvedAt ? ` · אושרה ${fmtDate(currentQuotation.approvedAt)}` : ''}:
                <ul style={{ margin: '.4rem 0 0', paddingInlineStart: '1.1rem' }}>
                  {items.map(i => (
                    <li key={i.id}>
                      {itemLabel(i)} — מחיר מחירון {formatILS(itemOriginalPrice(i))}
                      {itemFinalPrice(i) !== itemOriginalPrice(i) && `, בפועל ${itemFinalPrice(i) > 0 ? formatILS(itemFinalPrice(i)) : 'ללא חיוב'}`}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </>
        )}
      </div>

      {annualForYear.length > 0 && (
        <>
          <div className="cw-section-head" style={{ marginTop: '1rem' }}><span>דוח שנתי {attributionYear}</span></div>
          <div className="cw-section">
            <div className="cw-kv-row">
              <div>
                <div style={{ fontWeight: 600, fontSize: 'var(--fs-13)' }}>תמחור הדוח</div>
                <div style={{ fontSize: 'var(--fs-12)', color: 'var(--ink-3)' }}>
                  {topUpAttributed > 0 ? 'כלול בריטיינר + השלמה חד-פעמית' : 'כלול בריטיינר'}
                </div>
              </div>
              <div style={{ textAlign: 'left' }}>
                <div style={{ fontSize: 'var(--fs-17)', fontWeight: 700 }}>{formatILS(attributionTotal)}</div>
                <div style={{ fontSize: 'var(--fs-11,11px)', color: 'var(--ink-4)' }}>סה״כ נגבה עבור הדוח</div>
              </div>
            </div>
            <div style={{ padding: '.3rem 0' }}>
              <button type="button" className="btn btn-sm btn-ghost" onClick={() => setShowAttribution(v => !v)}>פירוט</button>
            </div>
            {showAttribution && (
              <div style={{ padding: '.4rem .2rem', fontSize: 'var(--fs-12)' }}>
                <div className="cw-kv-row"><span>חלק מהריטיינר שיוחס לדוח</span><b>{formatILS(retainerAttributed)}</b></div>
                {topUpCharges.map(c => (
                  <div className="cw-kv-row" key={c.id}><span>{c.description}</span><b>{formatILS(c.amount)}</b></div>
                ))}
                <div className="cw-kv-row"><span>סה״כ</span><b>{formatILS(attributionTotal)}</b></div>
              </div>
            )}
          </div>
        </>
      )}

      <div className="cw-section-head" style={{ marginTop: '1rem' }}><span>תשלומים עתידיים</span></div>
      <div className="cw-section">
        {future.length === 0 ? (
          <div className="cw-empty">אין תשלומים עתידיים.</div>
        ) : future.map(c => {
          const due = !!c.dueDate && c.dueDate <= today;
          return (
            <div className="cw-kv-row" key={c.id} style={{ alignItems: 'center' }}>
              <div>
                <div style={{ fontWeight: 600, fontSize: 'var(--fs-13)' }}>{c.description}</div>
                <div style={{ fontSize: 'var(--fs-12)', color: 'var(--ink-3)' }}>{sourceLabel(c)}</div>
              </div>
              <b>{formatILS(c.amount)}</b>
              <div style={{ fontSize: 'var(--fs-12)' }}>
                {due
                  ? <span style={{ color: 'var(--warn)', fontWeight: 600 }}>מועד התשלום הגיע{c.dueDate ? ` · ${fmtDate(c.dueDate)}` : ''}</span>
                  : c.dueDate ? <span style={{ color: 'var(--ink-3)' }}>{fmtDate(c.dueDate)}</span> : null}
              </div>
              <button type="button" className="btn btn-sm" disabled={markingId === c.id} onClick={() => markPaid(c)}>
                {markingId === c.id ? 'מסמן…' : 'סמן כשולם'}
              </button>
            </div>
          );
        })}
        {markError && <div style={{ color: 'var(--err)', fontSize: 'var(--fs-12)', marginTop: '.4rem' }}>{markError}</div>}
      </div>

      <div className="cw-section-head" style={{ marginTop: '1rem' }}><span>היסטוריית תשלומים</span></div>
      <div className="cw-section">
        {history.length === 0 ? (
          <div className="cw-empty">אין עדיין תשלומים שסומנו.</div>
        ) : history.map(c => (
          <div className="cw-kv-row" key={c.id}>
            <div>
              <div style={{ fontWeight: 600, fontSize: 'var(--fs-13)' }}>{c.description}</div>
              <div style={{ fontSize: 'var(--fs-12)', color: 'var(--ink-3)' }}>{sourceLabel(c)}</div>
            </div>
            <b>{formatILS(c.amount)}</b>
            <span style={{ fontSize: 'var(--fs-12)', color: 'var(--ink-3)' }}>{fmtDate(c.paidAt)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── רכיבים ועזרים משותפים לסביבת העבודה של 6101 ───────────────────────────

import type { Client } from '../../../types';
import { NI_HOURS_BAND_LABELS } from '../../../types';
import type { Filing, FilingEvent, Revision } from '../api';
import type { CurrentBtlState } from './resolve';
import type { BtlPortalPerson } from '../../nationalInsurance/btlPortalRecord';
import type { SmartFormTemplate } from '../types';

export interface WorkspaceCtx {
  filing: Filing;
  rev: Revision;
  revisions: Revision[];
  events: FilingEvent[];
  client: Client;
  reload: () => Promise<void>;
  onChanged?: () => void;
  /** (207) מה ב"ל רושם על האדם שההגשה עליו. */
  btlRecord?: BtlPortalPerson;
  /** (210) הבסיס + גרסת המיפוי הפעילה — נעילה, השוואת גרסאות ושמירת החתום. */
  template: SmartFormTemplate;
}

export const formatDay = (iso: string) => { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso); return m ? `${m[3]}/${m[2]}/${m[1]}` : iso; };
export const formatIl = (iso: string) => new Date(iso).toLocaleDateString('he-IL', { timeZone: 'Asia/Jerusalem' });

/** מה ב"ל מחזיק כרגע — המצב הרשום, לא המבוקש. */
export function BtlNow({ btl }: { btl: CurrentBtlState }) {
  return (
    <div style={{ display: 'grid', gap: '.3rem', fontSize: 'var(--fs-13)' }}>
      <div><b>סיווג:</b> {btl.classificationLabel}</div>
      {btl.declaredIncomeMonthly != null && (
        <div><b>הכנסה חודשית מוצהרת:</b> {btl.declaredIncomeMonthly.toLocaleString('en-US')} ₪{btl.declaredIncomeYear ? ` (${btl.declaredIncomeYear})` : ''}</div>
      )}
      {btl.advanceMonthly != null && <div><b>מקדמה חודשית:</b> {btl.advanceMonthly.toLocaleString('en-US')} ₪</div>}
      {btl.recorded?.paymentObligation && (
        <div><b>חובת תשלום:</b> {btl.recorded.paymentObligation.value}
          {btl.recorded.paymentObligation.previous
            ? <span className="sf-hint"> · מאז {formatDay(btl.recorded.paymentObligation.since.slice(0, 10))} (קודם: {btl.recorded.paymentObligation.previous})</span>
            : null}
        </div>
      )}
      {btl.recorded?.familyStatus && <div><b>מצב משפחתי בב"ל:</b> {btl.recorded.familyStatus}</div>}
      {btl.recorded?.coverage && <div><b>כיסוי ביטוחי:</b> {btl.recorded.coverage}</div>}
      {btl.recorded?.years?.length ? (
        <div className="sf-note">חיוב שנתי: {btl.recorded.years.map(y => `${y.year} ${y.text}`).join(' · ')}</div>
      ) : null}
      {btl.currentSelfEmployed?.btlDetail && (() => {
        const d = btl.currentSelfEmployed.btlDetail;
        return (
          <div>
            <b>רשום בב"ל (פירוט עיסוק):</b>{' '}
            {[d.hoursBand ? `${NI_HOURS_BAND_LABELS[d.hoursBand]} בשבוע` : null,
              d.definitionIncome != null ? `הכנסה להגדרה ${Math.round(d.definitionIncome).toLocaleString('en-US')} ₪` : null,
              d.definitionText, d.status ? `מצב: ${d.status}` : null].filter(Boolean).join(' · ')}
          </div>
        );
      })()}
      {btl.occupations.length > 0 && (
        <div className="sf-note">
          {/* ‼ «עד» ולא מקף: תאריך–תאריך מתהפך לעין בשורה RTL. */}
          עיסוקים: {btl.occupations.slice(0, 4).map(o => `${o.label}${o.from ? ` מ-${formatDay(o.from)}` : ''}${o.to ? ` עד ${formatDay(o.to)}` : o.from ? ' עד היום' : ''}`).join(' · ')}
          {btl.occupations.length > 4 ? ` · ועוד ${btl.occupations.length - 4}` : ''}
        </div>
      )}
    </div>
  );
}

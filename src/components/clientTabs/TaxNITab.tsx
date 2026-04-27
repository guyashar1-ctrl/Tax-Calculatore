// ─── לשונית מיסוי וביטוח לאומי ────────────────────────────────────────────
// 6 סעיפים בעלי מבנה זהה (אותו רוחב, אותו עיצוב), כל אחד עם נקודת צבע בכותרת
// שמסמנת את הרשות:
//   1. 🏛 מס הכנסה
//   2. 📥 ניכויים
//   3. 📊 מע״מ
//   4. 🏥 ביטוח לאומי
//   5. 🔐 הרשאת שע״ם
//   6. 📅 הצהרת הון
//
// שדות זיכויים (ילדים, ישוב מזכה, עלייה, נכות, השכלה, צבא/לאומי) נמצאים
// בלשונית "פרטים אישיים וקשרים".

import React from 'react';
import { Client, IncomeTaxType, NIType, VATStatus } from '../../types';
import {
  ShaamStatus, BookStatus, VATFrequency, WithholdingFrequency,
  FieldMeta, FIELD_SOURCE_LABELS,
} from '../../types/clientWorkspace';
import { shortDate } from '../../utils/clientDerived';

interface Props {
  client: Client;
  update: <K extends keyof Client>(key: K, value: Client[K]) => void;
}

const IT_LABELS: Record<IncomeTaxType, string> = {
  employee: 'שכיר',
  selfEmployed: 'עצמאי',
  both: 'שכיר + עצמאי',
  rentalOnly: 'שכירות בלבד',
  other: 'אחר / פסיבי',
};

const NI_LABELS: Record<NIType, string> = {
  employee: 'שכיר',
  selfEmployed: 'עצמאי (עונה להגדרה)',
  nonQualifying: 'לא עונה להגדרה',
  employeeAndSE: 'שכיר + עצמאי',
  passive: 'פסיבי',
  pensioner: 'פנסיונר',
};

const VAT_LABELS: Record<VATStatus, string> = {
  authorizedDealer: 'עוסק מורשה',
  exemptDealer: 'עוסק פטור',
  none: 'אין רישום מע״מ',
};

function MetaPill({ meta }: { meta?: FieldMeta }) {
  if (!meta || (!meta.source && !meta.syncedAt && !meta.validUntil)) return null;
  return (
    <div className="cw-field-meta">
      {meta.source && <span>מקור: {FIELD_SOURCE_LABELS[meta.source]}</span>}
      {meta.syncedAt && <span>· סונכרן: {shortDate(meta.syncedAt)}</span>}
      {meta.validUntil && <span>· תוקף: {shortDate(meta.validUntil)}</span>}
      {meta.override && <span className="warn">· override ידני</span>}
    </div>
  );
}

/** מקטע צבעוני: פס עליון + כותרת בצבע תואם — להבחנה ויזואלית בין רשויות */
function ColoredSection({ color, icon, label, children }: { color: string; icon: string; label: string; children: React.ReactNode }) {
  return (
    <div className="cw-section cw-colored-section" style={{ borderTopColor: color }}>
      <div className="cw-section-head" style={{ color }}>
        <span>{icon} {label}</span>
      </div>
      {children}
    </div>
  );
}

// צבעים ייחודיים לכל רשות (תואמים לפלטות של מערכות CRM מקצועיות)
const COLOR_PIT       = '#2563eb';  // כחול
const COLOR_NIKUYIM   = '#0891b2';  // טורקיז
const COLOR_VAT       = '#059669';  // ירוק
const COLOR_NI        = '#7c3aed';  // סגול
const COLOR_SHAAM     = '#d97706';  // כתום
const COLOR_WEALTH    = '#be185d';  // פוקסיה

export default function TaxNITab({ client, update }: Props) {
  const meta = client.fieldMeta ?? {};

  return (
    <div className="cw-tab cw-tax-tab">

      {/* ════════════════════════════════════════════════════════════
          1. 🏛 מס הכנסה
          ════════════════════════════════════════════════════════════ */}
      <ColoredSection color={COLOR_PIT} icon="🏛" label="מס הכנסה">
        <div className="cw-subsection">
          <div className="cw-subsection-title">סיווג</div>
          <div className="form-grid form-grid-3">
            <div className="form-group">
              <label>סיווג מס הכנסה</label>
              <select value={client.incomeTaxType} onChange={e => update('incomeTaxType', e.target.value as IncomeTaxType)}>
                {(['employee','selfEmployed','both','rentalOnly','other'] as IncomeTaxType[]).map(k =>
                  <option key={k} value={k}>{IT_LABELS[k]}</option>
                )}
              </select>
              <MetaPill meta={meta.incomeTaxType} />
            </div>
            <div className="form-group span-2">
              <label>תיאור עסקי</label>
              <input type="text" value={client.businessDescription} onChange={e => update('businessDescription', e.target.value)} placeholder="לדוגמה: ייעוץ פיננסי, עו״ד, רופא..." />
            </div>
            <div className="form-group">
              <label>פקיד שומה</label>
              <input type="text" value={client.taxOfficeName ?? ''} onChange={e => update('taxOfficeName', e.target.value || undefined)} placeholder="ת״א 4 / ירושלים 1..." />
            </div>
          </div>
        </div>

        <div className="cw-subsection">
          <div className="cw-subsection-title">מקדמות</div>
          <div className="form-grid form-grid-3">
            <div className="form-group">
              <label>שיעור מקדמות (%)</label>
              <input type="number" min={0} max={100} step={0.5} value={client.pitAdvancePercent ?? 0} onChange={e => update('pitAdvancePercent', Number(e.target.value))} dir="ltr" />
            </div>
            <div className="form-group">
              <label>תדירות תשלום</label>
              <select value={client.pitAdvanceFrequency ?? ''} onChange={e => update('pitAdvanceFrequency', (e.target.value || undefined) as VATFrequency | undefined)}>
                <option value="">לא נקבע</option>
                <option value="monthly">חד-חודשי</option>
                <option value="bi_monthly">דו-חודשי</option>
              </select>
            </div>
          </div>
        </div>

        <div className="cw-subsection">
          <div className="cw-subsection-title">תיאום מס</div>
          <div className="form-grid form-grid-3">
            <div className="form-group">
              <label className="checkbox-row" style={{ marginTop: '1.4rem' }}>
                <input type="checkbox" checked={client.hasTaxCoordination} onChange={e => update('hasTaxCoordination', e.target.checked)} />
                יש צורך לבצע תיאום מס
              </label>
            </div>
            {client.hasTaxCoordination && (
              <div className="form-group span-2">
                <label>פרטי תיאום</label>
                <input type="text" value={client.taxCoordinationDetails} onChange={e => update('taxCoordinationDetails', e.target.value)} placeholder="לדוגמה: שכר ממשרד + הכנסות עצמאי" />
              </div>
            )}
          </div>
        </div>
      </ColoredSection>

      {/* ════════════════════════════════════════════════════════════
          2. 📥 ניכויים
          ════════════════════════════════════════════════════════════ */}
      <ColoredSection color={COLOR_NIKUYIM} icon="📥" label="ניכויים">
        <div className="form-grid form-grid-3">
          <div className="form-group">
            <label>שיעור ניכוי במקור (%)</label>
            <input type="number" min={0} max={100} step={1} value={client.withholdingRate ?? 0} onChange={e => update('withholdingRate', Number(e.target.value))} dir="ltr" />
          </div>
          <div className="form-group">
            <label>תוקף עד</label>
            <input type="date" value={client.withholdingValidUntil ?? ''} onChange={e => update('withholdingValidUntil', e.target.value || undefined)} />
          </div>
          <div className="form-group">
            <label>תדירות דיווח</label>
            <select value={client.withholdingFrequency ?? 'none'} onChange={e => update('withholdingFrequency', e.target.value as WithholdingFrequency)}>
              <option value="none">אין דיווח</option>
              <option value="monthly">חד-חודשי</option>
              <option value="bi_monthly">דו-חודשי</option>
            </select>
          </div>
          <div className="form-group">
            <label>סטטוס ספרים</label>
            <select value={client.bookStatus ?? 'unknown'} onChange={e => update('bookStatus', e.target.value as BookStatus)}>
              <option value="kosher">תקינים</option>
              <option value="rejected">נפסלו</option>
              <option value="unknown">לא ידוע</option>
            </select>
          </div>
          <div className="form-group">
            <label>משרד ניכויים</label>
            <input type="text" value={client.withholdingOfficeName ?? ''} onChange={e => update('withholdingOfficeName', e.target.value || undefined)} />
          </div>
          <div className="form-group">
            <label className="checkbox-row" style={{ marginTop: '1.4rem' }}>
              <input type="checkbox" checked={client.hasExemptFromWithholding} onChange={e => update('hasExemptFromWithholding', e.target.checked)} />
              פטור מניכוי במקור
            </label>
          </div>
        </div>
      </ColoredSection>

      {/* ════════════════════════════════════════════════════════════
          3. 📊 מע״מ
          ════════════════════════════════════════════════════════════ */}
      <ColoredSection color={COLOR_VAT} icon="📊" label='מע״מ'>
        <div className="form-grid form-grid-3">
          <div className="form-group">
            <label>סטטוס</label>
            <select value={client.vatStatus} onChange={e => update('vatStatus', e.target.value as VATStatus)}>
              {(['authorizedDealer','exemptDealer','none'] as VATStatus[]).map(k =>
                <option key={k} value={k}>{VAT_LABELS[k]}</option>
              )}
            </select>
            <MetaPill meta={meta.vatStatus} />
          </div>

          {client.vatStatus !== 'none' && (
            <>
              <div className="form-group">
                <label>תדירות דיווח</label>
                <select value={client.vatFrequency ?? ''} onChange={e => update('vatFrequency', (e.target.value || undefined) as VATFrequency | undefined)}>
                  <option value="">לא נקבע</option>
                  <option value="monthly">חד-חודשי</option>
                  <option value="bi_monthly">דו-חודשי</option>
                </select>
              </div>

              <div className="form-group">
                <label className="checkbox-row" style={{ marginTop: '1.4rem' }}>
                  <input type="checkbox" checked={client.vatDetailedReport ?? false} onChange={e => update('vatDetailedReport', e.target.checked)} />
                  מע״מ מפורט (PCN874)
                </label>
              </div>

              {client.vatDetailedReport && (
                <div className="form-group">
                  <label>תאריך תחילת דיווח מפורט</label>
                  <input type="date" value={client.vatDetailedReportStartDate ?? ''} onChange={e => update('vatDetailedReportStartDate', e.target.value || undefined)} />
                </div>
              )}
            </>
          )}

          {client.vatStatus === 'none' && (
            <div className="form-group span-2 cw-info-line">
              <div className="cw-empty">לקוח לא רשום במע״מ — אין דיווחי מע״מ</div>
            </div>
          )}
        </div>
      </ColoredSection>

      {/* ════════════════════════════════════════════════════════════
          4. 🏥 ביטוח לאומי
          ════════════════════════════════════════════════════════════ */}
      <ColoredSection color={COLOR_NI} icon="🏥" label="ביטוח לאומי">
        <div className="form-grid form-grid-3">
          <div className="form-group">
            <label>סיווג</label>
            <select value={client.niType} onChange={e => update('niType', e.target.value as NIType)}>
              {(['employee','selfEmployed','employeeAndSE','nonQualifying','passive','pensioner'] as NIType[]).map(k =>
                <option key={k} value={k}>{NI_LABELS[k]}</option>
              )}
            </select>
            <MetaPill meta={meta.niType} />
          </div>

          <div className="form-group">
            <label>מקדמה חודשית (₪)</label>
            <input type="number" min={0} step={50} value={client.niAdvanceMonthly ?? 0} onChange={e => update('niAdvanceMonthly', Number(e.target.value))} dir="ltr" />
          </div>

          <div className="form-group">
            <label>סניף ביטוח לאומי</label>
            <input type="text" value={client.niBranchName ?? ''} onChange={e => update('niBranchName', e.target.value || undefined)} placeholder="לדוגמה: ת״א, חיפה..." />
          </div>
        </div>
      </ColoredSection>

      {/* ════════════════════════════════════════════════════════════
          5. 🔐 הרשאת שע״ם
          ════════════════════════════════════════════════════════════ */}
      <ColoredSection color={COLOR_SHAAM} icon="🔐" label='הרשאת שע״ם'>
        <div className="form-grid form-grid-4">
          <div className="form-group">
            <label>סטטוס</label>
            <select value={client.shaamStatus ?? 'unknown'} onChange={e => update('shaamStatus', e.target.value as ShaamStatus)}>
              <option value="active">פעיל</option>
              <option value="inactive">לא פעיל</option>
              <option value="pending">בטיפול</option>
              <option value="unknown">לא ידוע</option>
            </select>
          </div>
          <div className="form-group">
            <label>תאריך יצירה</label>
            <input type="date" value={(client.shaamCreatedAt || '').split('T')[0]} onChange={e => update('shaamCreatedAt', e.target.value ? new Date(e.target.value).toISOString() : undefined)} />
          </div>
          <div className="form-group">
            <label>שימוש אחרון</label>
            <input type="date" value={(client.shaamLastUsed || '').split('T')[0]} onChange={e => update('shaamLastUsed', e.target.value ? new Date(e.target.value).toISOString() : undefined)} />
          </div>
          <div className="form-group">
            <label>מקור הנתון</label>
            <select value={client.shaamSource ?? 'manual'} onChange={e => update('shaamSource', e.target.value as 'manual' | 'shaam' | 'authority' | 'import')}>
              <option value="manual">ידני</option>
              <option value="shaam">סנכרון שע״ם</option>
              <option value="authority">מהרשות</option>
              <option value="import">יבוא</option>
            </select>
          </div>
        </div>
      </ColoredSection>

      {/* ════════════════════════════════════════════════════════════
          6. 📅 הצהרת הון
          ════════════════════════════════════════════════════════════ */}
      <ColoredSection color={COLOR_WEALTH} icon="📅" label="הצהרת הון">
        <div className="form-grid form-grid-3">
          <div className="form-group">
            <label className="checkbox-row" style={{ marginTop: '1.4rem' }}>
              <input type="checkbox" checked={client.hasWealthDeclaration ?? false} onChange={e => update('hasWealthDeclaration', e.target.checked)} />
              הוגשה הצהרת הון
            </label>
          </div>
          {client.hasWealthDeclaration && (
            <div className="form-group">
              <label>שנה אחרונה</label>
              <input type="number" min={1990} max={2030} value={client.lastWealthDeclarationYear ?? ''} onChange={e => update('lastWealthDeclarationYear', Number(e.target.value) || undefined)} dir="ltr" />
            </div>
          )}
        </div>
      </ColoredSection>
    </div>
  );
}

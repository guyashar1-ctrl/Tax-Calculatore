// ─── טאב "פרופיל מס" — תמונת המס המלאה של הלקוח ─────────────────────────────
// מציג את כל מה שנאסף: תיקי שנה, סכומי מפתח, פרופיל קבוע ומסמכים נדרשים.
// הנתונים נערכים בטאבים הייעודיים ומתעדכנים אוטומטית מהשאלונים.

import type { Client, TaxFileInfo } from '../../types';
import type { AnnualReportSession } from '../../features/annualReport/types';
import TaxSnapshot from '../../features/annualReport/TaxSnapshot';

interface Props {
  client: Client;
  sessions: AnnualReportSession[];
  loading?: boolean;
  onOpenYear?: (taxYear: number) => void;
  onUpdateTaxFiles?: (files: TaxFileInfo[]) => void;
}

export default function TaxProfileTab({ client, sessions, loading, onOpenYear, onUpdateTaxFiles }: Props) {
  return (
    <div className="cw-tab">
      <TaxSnapshot client={client} sessions={sessions} loading={loading} variant="full" onOpenYear={onOpenYear} onUpdateTaxFiles={onUpdateTaxFiles} />
      <div style={{
        marginTop: '1rem', padding: '.7rem 1rem', borderRadius: 8, fontSize: '.83rem',
        background: 'var(--gray-50)', border: '1px solid var(--gray-200)', color: 'var(--gray-600)',
      }}>
        🔄 הפרופיל מתעדכן אוטומטית מהשאלונים (קליטה וסקירה שנתית) ומעריכה בטאבים הייעודיים.
        עובדות עם תגית מקור — יודעים מתי ומאיפה הן הגיעו.
      </div>
    </div>
  );
}

// ─── תצוגה מהירה של אדם — התוכן שבתוך המגירה/היריעה ─────────────────────────
// המקור החזותי המחייב: docs/prototypes/customers-v3-production-reference.html.
// עונה על חמש שאלות בלבד: מי זה, מה קורה עכשיו, אילו מסמכים אחרונים,
// מה הפעולה הרלוונטית, ואיך פותחים את התיק המלא. ניהול עמוק — בתיק המלא.
//
// ‼ קריאה בלבד בכוונה: התיק המלא מחזיק עותק עריכה משלו של הכרטיס, ותצוגה
//   שעורכת במקביל הייתה יוצרת שני בעלים לאותה רשומה.

import type { PersonRow } from '../utils/personDirectory';
import type { RecentDoc } from '../hooks/useRecentDocuments';

export interface QuickViewAction {
  label: string;
  run: () => void;
}

interface Props {
  row: PersonRow;
  /** "מה קורה עכשיו" — כותרת מודגשת + שורת הקשר. */
  now: { title: string; detail?: string };
  docs: RecentDoc[];
  docsLoading: boolean;
  /**
   * הפעולה התלוית-הקשר; null ⇒ הכפתור לא מוצג (ללקוח פעיל רגוע אין פעולה).
   * ‼ כלל צפיפות הפעולות (הכרעת גיא, V3.3): לעולם לא יותר משלושה כפתורים —
   * פעולה תלוית-הקשר אחת, "בקשת חומרים", "פתח תיק מלא". זה בכוונה שדה יחיד
   * ולא מערך: מצב עתידי שרוצה כפתור נוסף חייב להחליף, לא להוסיף.
   */
  quickAction: QuickViewAction | null;
  /** "בקשת חומרים" — רק למי שיש כרטיס. */
  onRequestMaterials?: () => void;
  /** הפעולה הראשית: פתיחת התיק המלא / רשומת הליד. */
  primary: QuickViewAction;
  onClose: () => void;
  /** התאמה אפשרית ללקוח קיים (שלב 4, ליד מקישור ציבורי בלבד) — עם פעולה לפתוח את הכרטיס הקיים. */
  possibleMatch?: { clientName: string; onOpen: () => void } | null;
  /** מחיקת ליד שטרם הפך ללקוח — קישור שקט, לא כפתור מתחרה; רק לשורות ליד. */
  onDeleteLead?: () => void;
}

function relDate(iso: string): string {
  const d = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  if (Number.isNaN(d)) return '';
  if (d <= 0) return 'התקבל היום';
  if (d === 1) return 'התקבל אתמול';
  if (d < 30) return `לפני ${d} ימים`;
  return new Date(iso).toLocaleDateString('he-IL', { day: '2-digit', month: '2-digit', year: '2-digit' });
}

export default function PersonQuickView(p: Props) {
  const { row } = p;
  return (
    <>
      <div className="pd-qv-head">
        <div className="pd-av pd-av-lg">{row.initials}</div>
        <div>
          <div className="pd-qv-name">{row.name}</div>
          <div className="pd-qv-state">{row.badge.label}</div>
        </div>
        <button type="button" className="pd-x" onClick={p.onClose} aria-label="סגירה" data-autofocus>×</button>
      </div>
      <div className="pd-qv-body">
        {p.possibleMatch && (
          <div className="pd-dupbox">
            ייתכן שכבר קיים אדם תואם — {p.possibleMatch.clientName}.{' '}
            <button type="button" className="ui-linkbtn" onClick={p.possibleMatch.onOpen}>
              פתח את הכרטיס הקיים
            </button>
          </div>
        )}

        <div className="pd-info">
          <div className="pd-cell">
            <div className="pd-lab">תעודת זהות</div>
            <div className="pd-val num">{row.idNumber || 'טרם התקבל'}</div>
          </div>
          <div className="pd-cell">
            <div className="pd-lab">טלפון</div>
            <div className="pd-val num pd-ltr">{row.phone || '—'}</div>
          </div>
          <div className="pd-cell">
            <div className="pd-lab">אימייל</div>
            <div className="pd-val pd-ltr">{row.email || '—'}</div>
          </div>
          <div className="pd-cell">
            <div className="pd-lab">סטטוס</div>
            <div className="pd-val"><span className={`pd-badge ${row.badge.cls}`}>{row.badge.label}</span></div>
          </div>
        </div>

        <div className="pd-section">
          <div className="pd-st">מה קורה עכשיו</div>
          <div className="pd-process">
            <b>{p.now.title}</b>
            {p.now.detail && <div className="pd-small">{p.now.detail}</div>}
          </div>
        </div>

        {row.kind === 'client' && (
          <div className="pd-section">
            <div className="pd-st">מסמכים אחרונים</div>
            {p.docsLoading ? (
              <div className="pd-small">טוען…</div>
            ) : p.docs.length === 0 ? (
              <div className="pd-small">אין מסמכים עדיין</div>
            ) : (
              <div className="pd-docs">
                {p.docs.map(d => (
                  <div className="pd-doc" key={d.id}>
                    <div className="pd-di">▤</div>
                    <div>
                      {d.fileName}
                      <div className="pd-small">{relDate(d.uploadedAt)}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        <div className="pd-qv-actions">
          {p.onRequestMaterials && (
            <button type="button" className={`pd-act${!p.quickAction ? ' pd-act-full' : ''}`}
              onClick={p.onRequestMaterials}>
              בקשת חומרים
            </button>
          )}
          {p.quickAction && (
            <button type="button" className={`pd-act${!p.onRequestMaterials ? ' pd-act-full' : ''}`}
              onClick={p.quickAction.run}>
              {p.quickAction.label}
            </button>
          )}
          <button type="button" className="pd-act pd-act-main pd-act-full" onClick={p.primary.run}>
            {p.primary.label}
          </button>
        </div>

        {p.onDeleteLead && (
          <div style={{ textAlign: 'center', marginTop: 12 }}>
            <button type="button" className="ui-linkbtn" style={{ color: 'var(--danger)' }} onClick={p.onDeleteLead}>
              מחיקת הליד
            </button>
          </div>
        )}
      </div>
    </>
  );
}

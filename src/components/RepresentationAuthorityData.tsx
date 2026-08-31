// ─── פלט הנתונים לביצוע הייצוג בפועל ──────────────────────────────────────
// אחרי שהלקוח מילא, הרו"ח צריך להקליד את אותם פרטים בפורטלים של הרשויות.
// כאן הם מוצגים מסודרים לפי הטופס של כל רשות, עם העתקה בלחיצה — כדי שלא
// יצטרך לחפש אותם בכרטיס ולהעתיק שדה-שדה.

import { useState } from 'react';
import {
  RepresentationRequest,
  Client,
  FAMILY_STATUS_LABELS,
  FAMILY_STATUS_YEAR_LABELS,
  ONBOARDING_SECONDARY_LABELS,
} from '../types';
import { requestScope, shaamSubmissions, type ScopePeople } from '../utils/repScope';
import { registeredOwnerOf } from '../features/annualReport/profile';

interface Row {
  label: string;
  value: string;
  /** מה שמועתק בפועל בלחיצה על "העתק" — כשריק, מועתק row.value. */
  copyValue?: string;
}

function birthYearOf(birthDate?: string): string {
  if (!birthDate) return '';
  const y = birthDate.slice(0, 4);
  return /^\d{4}$/.test(y) ? y : '';
}

/** ‼ תבנית ISO (2005-03-23) לא נוחה להקלדה בטפסי הרשויות — הרו"ח צריך DDMMYYYY
 * להקלדה מהירה, עם אימות ויזואלי DD/MM/YYYY לצידה. הערך המאוחסן במסד לא משתנה. */
function parseBirthDate(birthDate?: string): { d: string; m: string; y: string } | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(birthDate || '');
  return m ? { y: m[1], m: m[2], d: m[3] } : null;
}

function birthDateDisplay(birthDate?: string): string {
  const p = parseBirthDate(birthDate);
  return p ? `${p.d}${p.m}${p.y} (${p.d}/${p.m}/${p.y})` : '';
}

function birthDateCopy(birthDate?: string): string {
  const p = parseBirthDate(birthDate);
  return p ? `${p.d}${p.m}${p.y}` : '';
}

function CopyRow({ row }: { row: Row }) {
  const [copied, setCopied] = useState(false);
  const empty = !row.value;
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: '.6rem',
      padding: '.45rem .6rem', borderBottom: '1px solid var(--gray-100, #eee)',
    }}>
      <span style={{ fontSize: 'var(--fs-13)', color: 'var(--ink-3)', minWidth: 120 }}>{row.label}</span>
      <span
        dir="ltr"
        style={{
          flex: 1, textAlign: 'right', fontWeight: 500, fontSize: 'var(--fs-14)',
          color: empty ? 'var(--gray-400, #aaa)' : 'var(--gray-900, #111)',
          fontFamily: 'var(--font-mono, monospace)', wordBreak: 'break-word',
        }}
      >
        {row.value || '-'}
      </span>
      <button
        type="button"
        className="btn btn-ghost btn-sm"
        disabled={empty}
        title={empty ? 'אין ערך להעתקה' : 'העתקה'}
        style={{ minWidth: 62 }}
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(row.copyValue ?? row.value);
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          } catch { /* דפדפן חסם גישה ללוח — הערך גלוי וניתן לסימון ידני */ }
        }}
      >
        {copied ? '✓' : 'העתק'}
      </button>
    </div>
  );
}

function Block({ title, subtitle, rows }: { title: string; subtitle: string; rows: Row[] }) {
  const [copiedAll, setCopiedAll] = useState(false);
  const filled = rows.filter(r => r.value);
  return (
    <div style={{ border: '1px solid var(--hairline-1)', borderRadius: 'var(--radius)', overflow: 'hidden', marginBottom: '1rem' }}>
      <div style={{
        display: 'flex', alignItems: 'center', gap: '.6rem', flexWrap: 'wrap',
        padding: '.6rem .75rem', background: 'var(--surface-2)', borderBottom: '1px solid var(--hairline-1)',
      }}>
        <div style={{ flex: 1, minWidth: 180 }}>
          <div style={{ fontWeight: 600, fontSize: 'var(--fs-14)' }}>{title}</div>
          <div style={{ fontSize: 'var(--fs-12)', color: 'var(--ink-3)' }}>{subtitle}</div>
        </div>
        <button
          type="button"
          className="btn btn-secondary btn-sm"
          disabled={filled.length === 0}
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(filled.map(r => `${r.label}: ${r.copyValue ?? r.value}`).join('\n'));
              setCopiedAll(true);
              setTimeout(() => setCopiedAll(false), 1800);
            } catch { /* ראה CopyRow */ }
          }}
        >
          {copiedAll ? 'הועתק' : 'העתק הכל'}
        </button>
      </div>
      <div>
        {rows.map(r => <CopyRow key={r.label} row={r} />)}
      </div>
    </div>
  );
}

export default function RepresentationAuthorityData({ request, niCoversSpouse, linkedClient }: {
  request: RepresentationRequest;
  /** הייצוג בב"ל נלקח גם לבן/בת הזוג — צריך גם את ארבעת השדות שלו/ה */
  niCoversSpouse?: boolean;
  /** לגזירת ההגשות בשע״ם (מי הרשום, של מי כל תיק) — ההיקף עצמו מגיע מהבקשה */
  linkedClient?: Client | null;
}) {
  const id = request.identification;
  if (!id) return null;

  // מה שהרו"ח מילא בהפקת הקישור משלים את מה שהלקוח לא מילא — אחרת ת.ז. של
  // בן/בת זוג שהוזנה מראש לא הייתה מגיעה לכאן בכלל.
  const pre = request.prefill || {};

  // בקשות מלפני הטופס המלא שמרו שם מלא אחד בלבד; מפצלים כדי שיהיה מה להעתיק.
  const nameParts = (request.clientName || '').trim().split(/\s+/).filter(Boolean);
  const firstName = id.firstName || pre.firstName || nameParts[0] || '';
  const lastName = id.lastName || pre.lastName || nameParts.slice(1).join(' ') || '';

  const familyStatus = id.familyStatus || pre.familyStatus;
  const familyLabel = familyStatus ? FAMILY_STATUS_LABELS[familyStatus] : '';
  const yearLabel = familyStatus ? FAMILY_STATUS_YEAR_LABELS[familyStatus] : undefined;
  const familyYear = id.familyStatusYear || pre.familyStatusYear;

  const incomeTaxRows: Row[] = [
    { label: 'שם פרטי', value: firstName },
    { label: 'שם משפחה', value: lastName },
    { label: 'תעודת זהות', value: id.idNumber || '' },
    { label: 'תאריך לידה', value: birthDateDisplay(id.birthDate), copyValue: birthDateCopy(id.birthDate) },
    { label: 'טלפון', value: id.phone || '' },
    { label: 'דוא"ל', value: id.email || pre.email || request.clientEmail || '' },
    { label: 'עיר', value: id.city || '' },
    { label: 'כתובת', value: id.address || '' },
    {
      label: id.secondaryType ? ONBOARDING_SECONDARY_LABELS[id.secondaryType] : 'מזהה משני',
      value: id.secondaryValue || '',
    },
    { label: 'מצב משפחתי', value: familyLabel },
  ];
  if (yearLabel) {
    incomeTaxRows.push({ label: yearLabel, value: familyYear ? String(familyYear) : '' });
  }
  if (familyStatus === 'married') {
    incomeTaxRows.push({ label: 'שם בן/בת הזוג', value: id.spouseName || pre.spouseName || '' });
    incomeTaxRows.push({ label: 'ת.ז. בן/בת הזוג', value: id.spouseIdNumber || pre.spouseIdNumber || '' });
  }

  // ── הגשה בשע״ם היא לכל אדם — וכך גם הנתונים ─────────────────────────────
  // ‼ הכרעת גיא (31.8): כשהתיק (מע"מ/ניכויים, או מ"ה אצל הרשום/ה) על שם
  // בן/בת הזוג, ההזנה בשע״ם נעשית על הת.ז. **שלו/ה** — ולכן הבלוק מציג את
  // ערכת ההזדהות של בעל ההגשה, לא של מי שמילא את הטופס.
  // גם מהשדות המפוצלים — בדיוק כמו niSpouseRows למטה: רשומה שנכתבה עם שם
  // מפוצל בלבד היא עדיין משק בית נשוי.
  const spouseFullForScope = (
    (id.spouseName || pre.spouseName || '').trim()
    || `${id.spouseFirstName || pre.spouseFirstName || ''} ${id.spouseLastName || pre.spouseLastName || ''}`.trim()
  );
  const scopePeople: ScopePeople = {
    married: (id.familyStatus || pre.familyStatus) === 'married' && !!spouseFullForScope,
    clientName: `${firstName} ${lastName}`.trim(),
    spouseName: spouseFullForScope,
  };
  const submissions = shaamSubmissions(
    requestScope(request, linkedClient), scopePeople,
    // רק הכרעה שנקבעה; לפני כן תיק מ"ה נספר אצל הנישום — כמו במרכז הביצוע
    (linkedClient ? registeredOwnerOf(linkedClient) : null) ?? undefined,
  );

  const spouseShaamRows: Row[] = [
    { label: 'שם פרטי', value: id.spouseFirstName || pre.spouseFirstName || '' },
    { label: 'שם משפחה', value: id.spouseLastName || pre.spouseLastName || '' },
    { label: 'תעודת זהות', value: id.spouseIdNumber || pre.spouseIdNumber || '' },
    { label: 'תאריך לידה', value: birthDateDisplay(id.spouseBirthDate), copyValue: birthDateCopy(id.spouseBirthDate) },
    {
      label: id.spouseSecondaryType ? ONBOARDING_SECONDARY_LABELS[id.spouseSecondaryType] : 'מזהה משני',
      value: id.spouseSecondaryValue || '',
    },
  ];

  // סדר השדות זהה לטופס "הוספת ייפוי כח מבוטח" באתר ביטוח לאומי, כדי שאפשר
  // יהיה לרוץ עליו מלמעלה למטה בלי לחפש.
  const niRows: Row[] = [
    { label: 'תעודת זהות', value: id.idNumber || '' },
    { label: 'שנת לידה', value: birthYearOf(id.birthDate) },
    { label: 'שם פרטי', value: firstName },
    { label: 'שם משפחה', value: lastName },
  ];

  // ייפוי כוח שני בב"ל, על שם בן/בת הזוג. השם המפוצל שהלקוח מילא בקליטה הוא
  // המקור (110); פיצול המחרוזת נשאר רק לרשומות ישנות שאין בהן שדות מפוצלים.
  const spouseFull = (id.spouseName || pre.spouseName || '').trim();
  const spouseParts = spouseFull.split(/\s+/).filter(Boolean);
  const spouseBirthYear = id.spouseBirthYear ?? pre.spouseBirthYear;
  const spouseFirst = id.spouseFirstName || pre.spouseFirstName || spouseParts[0] || '';
  const niSpouseRows: Row[] = [
    { label: 'תעודת זהות', value: id.spouseIdNumber || pre.spouseIdNumber || '' },
    { label: 'שנת לידה', value: spouseBirthYear ? String(spouseBirthYear) : '' },
    { label: 'שם פרטי', value: spouseFirst },
    { label: 'שם משפחה', value: id.spouseLastName || pre.spouseLastName || spouseParts.slice(1).join(' ') },
  ];

  return (
    <div id="rep-authority-data" className="card" style={{ marginBottom: '1rem' }}>
      <div className="card-header">
        <div className="card-title">נתונים לביצוע הייצוג</div>
      </div>
      <div className="card-body">
        {/* ‼ הבלוק של הממלא נשאר תמיד — הוא נושא גם את פרטי טופס ייפוי הכוח
            ואת נתוני משק הבית. כשיש לבן/בת הזוג הגשה משלו/ה בשע״ם — בלוק שני
            עם ערכת ההזדהות שלו/ה: ההזנה נעשית על הת.ז. של בעל ההגשה. */}
        {(() => {
          const clientSub = submissions.find(s => s.target === 'client');
          const spouseSub = submissions.find(s => s.target === 'spouse');
          return (
            <>
              <Block
                title={spouseSub ? `שע״ם - ${scopePeople.clientName || 'הנישום'}` : 'מס הכנסה'}
                subtitle={spouseSub
                  ? (clientSub
                      ? `ההזנה על ת.ז. שלו/ה: ${clientSub.authoritiesLabel} · והפרטים לטופס ייפוי הכוח`
                      : 'אין הגשה על שמו/ה - הפרטים לטופס ייפוי הכוח ולמשק הבית')
                  : 'הפרטים לטופס ייפוי הכוח ולפתיחת הייצוג בשע״ם'}
                rows={incomeTaxRows}
              />
              {spouseSub && (
                <Block
                  title={`שע״ם - ${spouseSub.personName}`}
                  subtitle={`ההזנה על ת.ז. שלו/ה: ${spouseSub.authoritiesLabel}`}
                  rows={spouseShaamRows}
                />
              )}
            </>
          );
        })()}
        <Block
          title={niCoversSpouse ? `ביטוח לאומי - ${firstName || 'הנישום'}` : 'ביטוח לאומי'}
          subtitle="בדיוק ארבעת השדות של ״הוספת ייפוי כח מבוטח״, לפי הסדר"
          rows={niRows}
        />
        {niCoversSpouse && (
          <Block
            title={`ביטוח לאומי - ${spouseFirst || 'בן/בת הזוג'}`}
            subtitle="ייפוי כוח שני, נפרד - בב״ל לכל מבוטח תיק משלו"
            rows={niSpouseRows}
          />
        )}
      </div>
    </div>
  );
}

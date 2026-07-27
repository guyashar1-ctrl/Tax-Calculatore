// ─── פלט הנתונים לביצוע הייצוג בפועל ──────────────────────────────────────
// אחרי שהלקוח מילא, הרו"ח צריך להקליד את אותם פרטים בפורטלים של הרשויות.
// כאן הם מוצגים מסודרים לפי הטופס של כל רשות, עם העתקה בלחיצה — כדי שלא
// יצטרך לחפש אותם בכרטיס ולהעתיק שדה-שדה.

import { useState } from 'react';
import {
  RepresentationRequest,
  FAMILY_STATUS_LABELS,
  FAMILY_STATUS_YEAR_LABELS,
  ONBOARDING_SECONDARY_LABELS,
} from '../types';

interface Row {
  label: string;
  value: string;
}

function birthYearOf(birthDate?: string): string {
  if (!birthDate) return '';
  const y = birthDate.slice(0, 4);
  return /^\d{4}$/.test(y) ? y : '';
}

function CopyRow({ row }: { row: Row }) {
  const [copied, setCopied] = useState(false);
  const empty = !row.value;
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: '.6rem',
      padding: '.45rem .6rem', borderBottom: '1px solid var(--gray-100, #eee)',
    }}>
      <span style={{ fontSize: '.78rem', color: 'var(--gray-500)', minWidth: 120 }}>{row.label}</span>
      <span
        dir="ltr"
        style={{
          flex: 1, textAlign: 'right', fontWeight: 500, fontSize: '.9rem',
          color: empty ? 'var(--gray-400, #aaa)' : 'var(--gray-900, #111)',
          fontFamily: 'var(--font-mono, monospace)', wordBreak: 'break-word',
        }}
      >
        {row.value || '—'}
      </span>
      <button
        type="button"
        className="btn btn-ghost btn-sm"
        disabled={empty}
        title={empty ? 'אין ערך להעתקה' : 'העתקה'}
        style={{ minWidth: 62 }}
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(row.value);
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
    <div style={{ border: '1px solid var(--gray-200)', borderRadius: 'var(--radius)', overflow: 'hidden', marginBottom: '1rem' }}>
      <div style={{
        display: 'flex', alignItems: 'center', gap: '.6rem', flexWrap: 'wrap',
        padding: '.6rem .75rem', background: 'var(--gray-50)', borderBottom: '1px solid var(--gray-200)',
      }}>
        <div style={{ flex: 1, minWidth: 180 }}>
          <div style={{ fontWeight: 600, fontSize: '.9rem' }}>{title}</div>
          <div style={{ fontSize: '.75rem', color: 'var(--gray-500)' }}>{subtitle}</div>
        </div>
        <button
          type="button"
          className="btn btn-secondary btn-sm"
          disabled={filled.length === 0}
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(filled.map(r => `${r.label}: ${r.value}`).join('\n'));
              setCopiedAll(true);
              setTimeout(() => setCopiedAll(false), 1800);
            } catch { /* ראה CopyRow */ }
          }}
        >
          {copiedAll ? '✓ הועתק' : 'העתק הכל'}
        </button>
      </div>
      <div>
        {rows.map(r => <CopyRow key={r.label} row={r} />)}
      </div>
    </div>
  );
}

export default function RepresentationAuthorityData({ request }: { request: RepresentationRequest }) {
  const id = request.identification;
  if (!id) return null;

  // בקשות מלפני הטופס המלא שמרו שם מלא אחד בלבד; מפצלים כדי שיהיה מה להעתיק.
  const nameParts = (request.clientName || '').trim().split(/\s+/).filter(Boolean);
  const firstName = id.firstName || nameParts[0] || '';
  const lastName = id.lastName || nameParts.slice(1).join(' ') || '';

  const familyLabel = id.familyStatus ? FAMILY_STATUS_LABELS[id.familyStatus] : '';
  const yearLabel = id.familyStatus ? FAMILY_STATUS_YEAR_LABELS[id.familyStatus] : undefined;

  const incomeTaxRows: Row[] = [
    { label: 'שם פרטי', value: firstName },
    { label: 'שם משפחה', value: lastName },
    { label: 'תעודת זהות', value: id.idNumber || '' },
    { label: 'תאריך לידה', value: id.birthDate || '' },
    { label: 'טלפון', value: id.phone || '' },
    { label: 'דוא"ל', value: id.email || request.clientEmail || '' },
    { label: 'עיר', value: id.city || '' },
    { label: 'כתובת', value: id.address || '' },
    {
      label: id.secondaryType ? ONBOARDING_SECONDARY_LABELS[id.secondaryType] : 'מזהה משני',
      value: id.secondaryValue || '',
    },
    { label: 'מצב משפחתי', value: familyLabel },
  ];
  if (yearLabel) {
    incomeTaxRows.push({ label: yearLabel, value: id.familyStatusYear ? String(id.familyStatusYear) : '' });
  }
  if (id.familyStatus === 'married') {
    incomeTaxRows.push({ label: 'שם בן/בת הזוג', value: id.spouseName || '' });
    incomeTaxRows.push({ label: 'ת.ז. בן/בת הזוג', value: id.spouseIdNumber || '' });
  }

  // סדר השדות זהה לטופס "הוספת ייפוי כח מבוטח" באתר ביטוח לאומי, כדי שאפשר
  // יהיה לרוץ עליו מלמעלה למטה בלי לחפש.
  const niRows: Row[] = [
    { label: 'תעודת זהות', value: id.idNumber || '' },
    { label: 'שנת לידה', value: birthYearOf(id.birthDate) },
    { label: 'שם פרטי', value: firstName },
    { label: 'שם משפחה', value: lastName },
  ];

  return (
    <div className="card" style={{ marginBottom: '1rem' }}>
      <div className="card-header">
        <div className="card-title">📋 נתונים לביצוע הייצוג</div>
      </div>
      <div className="card-body">
        <Block
          title="מס הכנסה"
          subtitle="הפרטים לטופס ייפוי הכוח ולפתיחת הייצוג בשע״ם"
          rows={incomeTaxRows}
        />
        <Block
          title="ביטוח לאומי"
          subtitle="בדיוק ארבעת השדות של ״הוספת ייפוי כח מבוטח״, לפי הסדר"
          rows={niRows}
        />
      </div>
    </div>
  );
}

// ─── סנכרון סעיף מס הכנסה מול שע״ם (שאילתה 134) ────────────────────────────
// ‼ מציע, לא כותב. הסנכרון קורא את שדות ראש התיק משע״ם ומציג אותם מול מה
// שיש בכרטיס. שום ערך לא נכנס לכרטיס עד שהרו"ח לוחץ «אמץ» — ואז הוא נכנס
// לטופס, ונשמר רק בשמירה הרגילה של יישור הקו. אין דריסה שקטה.
//
// ‼ ארבעה שדות בלבד. שיעור המקדמות ותדירות הדיווח **אינם** מסונכרנים: לא
// נמצאה להם תווית ייעודית במסך 134, וניחוש היה גרוע מערך ריק. הם נשארים
// בהזנה ידנית עד שנמצא להם עוגן ודאי.

import { useMemo } from 'react';
import type { Client } from '../../types';
import { useAutomationJob } from '../../hooks/useAutomationJobs';
import { SHAAM_SYNC_INCOME_TAX_ACTION_TYPE } from '../../types/automation';
import { incomeTaxFileType } from '../../data/incomeTaxFileTypes';

interface Props {
  client: Client;
  /** הערך שכרגע בטופס — לא בהכרח מה שבכרטיס, כי הרו"ח אולי כבר הקליד. */
  current: (key: string) => string;
  onAdopt: (key: string, value: string) => void;
}

interface Row {
  /** המפתח כפי שהעובד מחזיר אותו. */
  from: string;
  /** מפתח השדה בטופס יישור הקו. */
  to: string;
  label: string;
}

const ROWS: Row[] = [
  { from: 'fileType', to: 'incomeTaxFileType', label: 'סוג תיק' },
  { from: 'taxOffice', to: 'taxOfficeName', label: 'פקיד שומה' },
  { from: 'unit', to: 'incomeTaxUnit', label: 'חוליה' },
  { from: 'economicIndustry', to: 'incomeTaxEconomicIndustry', label: 'ענף כלכלי' },
];

export default function ShaamIncomeTaxSync({ client, current, onAdopt }: Props) {
  const fileNumber = useMemo(() => {
    const f = (client.taxFiles ?? []).find(t => t.authority === 'income_tax');
    return (f?.fileNumber ?? '').replace(/\D/g, '');
  }, [client.taxFiles]);

  const { job, busy, run } = useAutomationJob(client.id, SHAAM_SYNC_INCOME_TAX_ACTION_TYPE);

  const fields = (job?.status === 'succeeded'
    ? (job.result as { fields?: Record<string, string> } | undefined)?.fields
    : undefined) ?? null;

  const pending = job?.status === 'queued' || job?.status === 'running';

  if (!fileNumber) {
    return (
      <div className="ial-sync ial-sync-off">
        אין מספר תיק במס הכנסה בכרטיס, ולכן אין מה למשוך משע״ם.
        מספר התיק הוא ת״ז של בן/בת הזוג הרשום/ה, ונקבע בתיק המס.
      </div>
    );
  }

  return (
    <div className="ial-sync">
      <div className="ial-sync-bar">
        <button type="button" className="btn-secondary btn-sm"
          disabled={busy || pending}
          onClick={() => { void run({ fileNumber }); }}>
          {pending ? 'קורא משע״ם…' : 'קרא משע״ם'}
        </button>
        <span className="ial-sync-note">
          קורא את «מקדמות — פרטי דרישה ודיווח» (134). מציג להשוואה — לא משנה כלום בכרטיס.
        </span>
      </div>

      {job?.status === 'needs_human' && (
        <div className="ial-sync-msg">{job.needsHuman ?? 'דרושה פעולה בחלון שע״ם.'}</div>
      )}
      {job?.status === 'failed' && (
        <div className="ial-sync-msg ial-sync-err">{job.errorDetail ?? 'הקריאה נכשלה.'}</div>
      )}

      {fields && (
        <table className="ial-sync-table">
          <thead>
            <tr><th>שדה</th><th>בכרטיס</th><th>בשע״ם</th><th /></tr>
          </thead>
          <tbody>
            {ROWS.map(row => {
              const shaam = (fields[row.from] ?? '').trim();
              const mine = current(row.to).trim();
              const same = shaam !== '' && shaam === mine;
              const type = row.to === 'incomeTaxFileType' ? incomeTaxFileType(shaam) : undefined;
              return (
                <tr key={row.to}>
                  <td>
                    {row.label}
                    {type && <div className="ial-sync-hint">{type.description} — {type.explanation}</div>}
                  </td>
                  <td className={mine ? '' : 'ial-sync-empty'}>{mine || '—'}</td>
                  <td>{shaam || '—'}</td>
                  <td>
                    {shaam === '' ? null : same ? (
                      <span className="ial-sync-same">זהה</span>
                    ) : (
                      <button type="button" className="btn-secondary btn-sm"
                        onClick={() => onAdopt(row.to, shaam)}>
                        {mine ? 'החלף' : 'אמץ'}
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}

      {fields && (
        <div className="ial-sync-note">
          שיעור המקדמות ותדירות הדיווח אינם נקראים אוטומטית — אין להם שדה מזוהה
          במסך הזה. יש להזין אותם ידנית.
        </div>
      )}
    </div>
  );
}

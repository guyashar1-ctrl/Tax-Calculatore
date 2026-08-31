// ─── תיקי רשויות — עריכה בכרטיס הלקוח ────────────────────────────────────────
// רשומה לכל תיק: רשות, מספר תיק, על שם מי (הלקוח/בן הזוג/משותף) וסטטוס ייצוג.
// כפתור "צור מבנה מומלץ" מרכיב שלד לפי מה שידוע בכרטיס (עסקים, בן זוג).

import type { Client, TaxFileInfo, TaxAuthority, TaxFileOwner, TaxFileRepStatus } from '../../types';
import {
  TAX_AUTHORITY_LABELS, TAX_FILE_REP_STATUS_LABELS,
} from '../../types';
import { clientDisplayName, spouseDisplayName, REGISTERED_UNVERIFIED_LABEL } from '../../features/annualReport/profile';
import { resolveIncomeTaxHousehold, resolvePersonAuthority } from '../../utils/personRepresentation';

interface Props {
  client: Client;
  update: <K extends keyof Client>(key: K, value: Client[K]) => void;
  /** הכרטיס של בן/בת הזוג, כשהוא/היא לקוח/ה בפני עצמו/ה (150). */
  spouseClient?: Client;
}

const AUTHORITY_ORDER: TaxAuthority[] = ['income_tax', 'vat', 'deductions', 'national_insurance'];

function newFile(authority: TaxAuthority): TaxFileInfo {
  return {
    id: `tf-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    authority,
    owner: 'client',
    repStatus: 'none',
  };
}

/** שלד מומלץ לפי הכרטיס: מ"ה תמיד; מע"מ/ניכויים אם יש עסק; ב"ל אישי לכל בן זוג
    + שורת ב"ל לתיק הניכויים כשיש כזה. */
function suggestFiles(client: Client): TaxFileInfo[] {
  const out: TaxFileInfo[] = [];
  const hasSpouse = client.familyStatus === 'married';
  const hasBusiness = (client.businesses ?? []).length > 0 || client.incomeTaxType === 'selfEmployed' || client.incomeTaxType === 'both';
  out.push({ ...newFile('income_tax'), fileNumber: client.idNumber || undefined });
  if (hasBusiness) {
    out.push(newFile('vat'));
    out.push(newFile('deductions'));
  }
  out.push(newFile('national_insurance'));
  if (hasSpouse) out.push({ ...newFile('national_insurance'), owner: 'spouse' });
  if (hasBusiness) out.push({ ...newFile('national_insurance'), owner: 'joint' }); // ב"ל של תיק הניכויים
  return out;
}

/** תוויות בעלים עם שמות אמיתיים; בב"ל owner='joint' מייצג את תיק הניכויים. */
function ownerOptionLabel(client: Client, authority: TaxAuthority, owner: TaxFileOwner): string {
  if (authority === 'national_insurance' && owner === 'joint') return 'תיק הניכויים (מעסיק)';
  if (owner === 'joint') return 'משותף';
  return owner === 'spouse' ? spouseDisplayName(client) : clientDisplayName(client);
}

export default function TaxFilesSection({ client, update, spouseClient }: Props) {
  const files = client.taxFiles ?? [];
  // ‼ ייצוג שכבר קיים דרך בן/בת הזוג המקושר/ת (150) — לא נוסף ל-taxFiles
  // של הכרטיס הזה (זה היה מכפיל את מקור האמת), אבל "לא הוגדרו תיקים"
  // היה שקר קטן כשהוא כן מיוצג, רק במקום אחר.
  const household = resolveIncomeTaxHousehold(client, spouseClient);
  const spouseLabel = spouseClient ? `${spouseClient.firstName} ${spouseClient.lastName}`.trim() || 'בן/בת הזוג' : '';
  const viaSpouseAuthorities = spouseClient
    ? (['vat', 'withholding', 'nationalInsurance'] as const)
        .filter(a => resolvePersonAuthority(client, spouseClient, a).source === 'spouse')
    : [];
  const AUTH_LABEL = { vat: 'מע"מ', withholding: 'ניכויים', nationalInsurance: 'ביטוח לאומי' } as const;

  function setFiles(next: TaxFileInfo[]) {
    update('taxFiles', next);
  }
  function patchFile(id: string, patch: Partial<TaxFileInfo>) {
    setFiles(files.map((f) => {
      if (f.id !== id) return f;
      const next = { ...f, ...patch };
      // מקור האמת: שינוי הבעלים של תיק מ"ה ממלא אוטומטית את הת.ז. הנכונה כמספר תיק
      if (next.authority === 'income_tax' && patch.owner) {
        const ownerId = patch.owner === 'spouse' ? client.spouseIdNumber : client.idNumber;
        if (ownerId && (!f.fileNumber || f.fileNumber === client.idNumber || f.fileNumber === client.spouseIdNumber)) {
          next.fileNumber = ownerId;
        }
      }
      return next;
    }));
    // קביעה ידנית של הבעלים היא ידיעה, לא כוונה — ולכן סוגרת את «טרם אומת».
    // זו גם דרך המילוט היחידה לבקשות ישנות, שאין להן מרכז ביצוע ייצוג.
    const target = files.find((f) => f.id === id);
    if (target?.authority === 'income_tax' && patch.owner && !client.registeredSpouseVerified) {
      update('registeredSpouseVerified', true);
    }
  }
  function removeFile(id: string) {
    setFiles(files.filter((f) => f.id !== id));
  }

  // אזהרה מרכזית: תיק מס הכנסה שמתנהל על ת.ז. של בן/בת הזוג
  const itFile = files.find((f) => f.authority === 'income_tax');
  const itOnSpouse = itFile?.owner === 'spouse';

  return (
    <div className="cw-section">
      <div className="cw-section-head">
        <span>תיקים ברשויות</span>
        <div style={{ display: 'flex', gap: '.4rem' }}>
          {files.length === 0 && (
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => setFiles(suggestFiles(client))}>
              צור מבנה מומלץ
            </button>
          )}
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => setFiles([...files, newFile('income_tax')])}>
            + הוסף תיק
          </button>
        </div>
      </div>

      {itOnSpouse && (
        <div className="tf-spouse-warn">
          בן/בת הזוג הרשום/ה במס הכנסה: {spouseDisplayName(client)}
          {itFile?.fileNumber ? ` - ת.ז. ${itFile.fileNumber}` : ''}. כל התנהלות מול מ"ה בת.ז. הזו.
        </div>
      )}

      {/* ‼ תיק מס הכנסה אחד לזוג (150) — כשהוא אצל בן/בת הזוג המקושר/ת ולא
          אצל הכרטיס הזה, זו לא היעדר תיק. לא נוסף ל-taxFiles כאן: זה היה
          יוצר עותק שני למקור אמת אחד. */}
      {household.holder === 'spouse' && (
        <div className="tf-spouse-warn">
          תיק מס הכנסה משותף — מנוהל בכרטיס של {spouseLabel}.
        </div>
      )}
      {viaSpouseAuthorities.length > 0 && (
        <div className="tf-spouse-warn">
          כבר מיוצג/ת ב{viaSpouseAuthorities.map(a => AUTH_LABEL[a]).join(', ')} — הושג בקליטה של {spouseLabel}. אין צורך בבקשה נוספת.
        </div>
      )}

      {files.length === 0 ? (
        <div className="cw-empty">
          {household.holder === 'spouse' || viaSpouseAuthorities.length > 0
            ? 'לא הוגדרו תיקים על הכרטיס הזה — הייצוג הקיים מוצג למעלה. "צור מבנה מומלץ" מוסיף כאן רק תיקים חדשים.'
            : 'לא הוגדרו תיקים. "צור מבנה מומלץ" מרכיב שלד לפי הכרטיס - מס הכנסה, מע"מ/ניכויים אם יש עסק, וב"ל לכל בן זוג.'}
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '.45rem' }}>
          {AUTHORITY_ORDER.flatMap((auth) => files.filter((f) => f.authority === auth)).map((f) => (
            <div
              key={f.id}
              className="tf-row"
            >
              <select
                value={f.authority}
                onChange={(e) => patchFile(f.id, { authority: e.target.value as TaxAuthority })}
                className="tf-select tf-select-strong"
              >
                {AUTHORITY_ORDER.map((a) => <option key={a} value={a}>{TAX_AUTHORITY_LABELS[a]}</option>)}
              </select>
              <input
                type="text"
                value={f.fileNumber ?? ''}
                onChange={(e) => patchFile(f.id, { fileNumber: e.target.value })}
                placeholder="מספר תיק"
                dir="ltr"
                className="tf-select" style={{ width: 130 }}
              />
              <label style={{ fontSize: '13px', color: 'var(--gray-500)', display: 'flex', alignItems: 'center', gap: 4 }}>
                {f.authority === 'national_insurance' ? 'של' : 'ע"ש'}
                <select
                  value={f.owner}
                  onChange={(e) => patchFile(f.id, { owner: e.target.value as TaxFileOwner })}
                  className="tf-select"
                >
                  {(['client', 'spouse', 'joint'] as TaxFileOwner[]).map((o) => (
                    <option key={o} value={o}>{ownerOptionLabel(client, f.authority, o)}</option>
                  ))}
                </select>
                {f.authority === 'income_tax' && f.owner !== 'joint' && client.familyStatus === 'married' && (
                  <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--warn)', whiteSpace: 'nowrap' }}>
                    ← בן/בת הזוג הרשום/ה
                    {client.registeredSpouseVerified ? '' : ` · ${REGISTERED_UNVERIFIED_LABEL}`}
                  </span>
                )}
              </label>
              <select
                value={f.repStatus}
                onChange={(e) => patchFile(f.id, { repStatus: e.target.value as TaxFileRepStatus })}
                className={`tf-rep tf-rep-${f.repStatus}`}
              >
                {(Object.keys(TAX_FILE_REP_STATUS_LABELS) as TaxFileRepStatus[]).map((s) => (
                  <option key={s} value={s}>{TAX_FILE_REP_STATUS_LABELS[s]}</option>
                ))}
              </select>
              <button type="button" className="btn btn-ghost btn-sm" style={{ color: 'var(--red)', marginRight: 'auto' }} onClick={() => removeFile(f.id)}>🗑</button>
            </div>
          ))}
        </div>
      )}
      <div style={{ fontSize: '12px', color: 'var(--gray-400)', marginTop: '.5rem' }}>
        במס הכנסה תיק אחד לתא המשפחתי - מי שעליו התיק הוא בן/בת הזוג הרשום/ה. במע"מ/ניכויים ייתכן תיק לכל בן זוג. בב"ל התיק אישי - שורה לכל בן זוג, ועוד שורה לייצוג בתיק הניכויים אם קיים.
      </div>
    </div>
  );
}

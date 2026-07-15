// ─── תיקי רשויות — עריכה בכרטיס הלקוח ────────────────────────────────────────
// רשומה לכל תיק: רשות, מספר תיק, על שם מי (הלקוח/בן הזוג/משותף) וסטטוס ייצוג.
// כפתור "צור מבנה מומלץ" מרכיב שלד לפי מה שידוע בכרטיס (עסקים, בן זוג).

import type { Client, TaxFileInfo, TaxAuthority, TaxFileOwner, TaxFileRepStatus } from '../../types';
import {
  TAX_AUTHORITY_LABELS, TAX_FILE_OWNER_LABELS, TAX_FILE_REP_STATUS_LABELS,
} from '../../types';

interface Props {
  client: Client;
  update: <K extends keyof Client>(key: K, value: Client[K]) => void;
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

/** שלד מומלץ לפי הכרטיס: מ"ה תמיד; מע"מ/ניכויים אם יש עסק; ב"ל לכל בן זוג. */
function suggestFiles(client: Client): TaxFileInfo[] {
  const out: TaxFileInfo[] = [];
  const hasSpouse = client.familyStatus === 'married';
  out.push({ ...newFile('income_tax'), fileNumber: client.idNumber || undefined });
  if ((client.businesses ?? []).length > 0 || client.incomeTaxType === 'selfEmployed' || client.incomeTaxType === 'both') {
    out.push(newFile('vat'));
    out.push(newFile('deductions'));
  }
  out.push(newFile('national_insurance'));
  if (hasSpouse) out.push({ ...newFile('national_insurance'), owner: 'spouse' });
  return out;
}

export default function TaxFilesSection({ client, update }: Props) {
  const files = client.taxFiles ?? [];

  function setFiles(next: TaxFileInfo[]) {
    update('taxFiles', next);
  }
  function patchFile(id: string, patch: Partial<TaxFileInfo>) {
    setFiles(files.map((f) => (f.id === id ? { ...f, ...patch } : f)));
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
        <span>🗄️ תיקים ברשויות</span>
        <div style={{ display: 'flex', gap: '.4rem' }}>
          {files.length === 0 && (
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => setFiles(suggestFiles(client))}>
              ✨ צור מבנה מומלץ
            </button>
          )}
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => setFiles([...files, newFile('income_tax')])}>
            + הוסף תיק
          </button>
        </div>
      </div>

      {itOnSpouse && (
        <div style={{
          margin: '.3rem 0 .6rem', padding: '.5rem .8rem', borderRadius: 8, fontSize: '.85rem', fontWeight: 700,
          background: '#FBF2E2', border: '1.5px solid #f2d492', color: '#b45309',
        }}>
          ⚠ תיק מס הכנסה מתנהל על ת.ז. של בן/בת הזוג{client.spouseName ? ` (${client.spouseName})` : ''}
          {itFile?.fileNumber ? ` — ${itFile.fileNumber}` : ''}. כל התנהלות מול מ"ה בת.ז. הזו.
        </div>
      )}

      {files.length === 0 ? (
        <div className="cw-empty">
          לא הוגדרו תיקים. "צור מבנה מומלץ" מרכיב שלד לפי הכרטיס — מס הכנסה, מע"מ/ניכויים אם יש עסק, וב"ל לכל בן זוג.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '.45rem' }}>
          {AUTHORITY_ORDER.flatMap((auth) => files.filter((f) => f.authority === auth)).map((f) => (
            <div
              key={f.id}
              style={{
                display: 'flex', gap: '.5rem', alignItems: 'center', flexWrap: 'wrap',
                border: '1px solid var(--gray-200)', borderRadius: 9, padding: '.5rem .7rem',
              }}
            >
              <select
                value={f.authority}
                onChange={(e) => patchFile(f.id, { authority: e.target.value as TaxAuthority })}
                style={{ padding: '.35rem .5rem', borderRadius: 6, border: '1px solid var(--gray-200)', fontWeight: 700 }}
              >
                {AUTHORITY_ORDER.map((a) => <option key={a} value={a}>{TAX_AUTHORITY_LABELS[a]}</option>)}
              </select>
              <input
                type="text"
                value={f.fileNumber ?? ''}
                onChange={(e) => patchFile(f.id, { fileNumber: e.target.value })}
                placeholder="מספר תיק"
                dir="ltr"
                style={{ width: 130, padding: '.35rem .55rem', borderRadius: 6, border: '1px solid var(--gray-200)' }}
              />
              <label style={{ fontSize: '.78rem', color: 'var(--gray-500)', display: 'flex', alignItems: 'center', gap: 4 }}>
                על שם
                <select
                  value={f.owner}
                  onChange={(e) => patchFile(f.id, { owner: e.target.value as TaxFileOwner })}
                  style={{ padding: '.3rem .45rem', borderRadius: 6, border: '1px solid var(--gray-200)' }}
                >
                  {(Object.keys(TAX_FILE_OWNER_LABELS) as TaxFileOwner[]).map((o) => (
                    <option key={o} value={o}>{TAX_FILE_OWNER_LABELS[o]}</option>
                  ))}
                </select>
              </label>
              <select
                value={f.repStatus}
                onChange={(e) => patchFile(f.id, { repStatus: e.target.value as TaxFileRepStatus })}
                style={{
                  padding: '.3rem .45rem', borderRadius: 99, border: 'none', fontSize: '.76rem', fontWeight: 700,
                  background: f.repStatus === 'active' ? '#E8F3EC' : f.repStatus === 'pending' ? '#FBF2E2' : 'var(--gray-100)',
                  color: f.repStatus === 'active' ? '#1F7A4D' : f.repStatus === 'pending' ? '#b45309' : 'var(--gray-500)',
                }}
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
      <div style={{ fontSize: '.73rem', color: 'var(--gray-400)', marginTop: '.5rem' }}>
        💡 במס הכנסה תיק אחד לתא המשפחתי — על ת.ז. של בן הזוג הרשום. במע"מ/ניכויים ייתכן תיק לכל בן זוג. בב"ל — שורה לכל בן זוג + לתיק הניכויים.
      </div>
    </div>
  );
}

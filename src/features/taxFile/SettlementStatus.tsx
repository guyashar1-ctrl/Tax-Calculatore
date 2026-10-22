// ─── «יישוב מזכה» — מה נקבע, ולמה · אותה שורה בתיק המס ובכרטיס הלקוח ─────────
// ‼ המקור: השרת גוזר qualifying_settlement_id מהיישוב שבכתובת (285), כל עוד
//   המשרד לא קבע ידנית. כאן רק מציגים את זה, ומאפשרים לקבוע ידנית (עם סיבה)
//   או לחזור לקביעה לפי הכתובת. אין כאן חישוב שני של «מזכה או לא».
import { useState } from 'react';
import type { Client } from '../../types';
import { getEligibleSettlements, resolveSettlement } from '../../data/eligibleSettlements';
import { CURRENT_TAX_YEAR } from '../../data/taxData';
import HebrewTextInput from '../../components/ui/HebrewTextInput';

const money = (n: number) => `₪${n.toLocaleString('he-IL')}`;

export function settlementUnmatched(c: Pick<Client, 'city' | 'cityCode'>): boolean {
  return !!c.city?.trim() && !c.cityCode;
}

export default function SettlementStatus({ client, onSave, year = CURRENT_TAX_YEAR }: {
  client: Client;
  onSave?: (patch: Partial<Client>) => Promise<void>;
  year?: number;
}) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const id = client.qualifyingSettlementId || '';
  const s = id ? resolveSettlement(id, year) : undefined;
  const manual = !!client.qualifyingSettlementOverride;
  const unmatched = settlementUnmatched(client);

  async function save(patch: Partial<Client>) {
    if (!onSave) return;
    setBusy(true); setErr(null);
    try { await onSave(patch); setEditing(false); }
    catch (e) { setErr(e instanceof Error ? e.message : 'השמירה נכשלה'); }
    finally { setBusy(false); }
  }

  if (editing) {
    return (
      <div className="settle-edit">
        <select value={value} onChange={e => setValue(e.target.value)} aria-label="יישוב מזכה">
          <option value="">לא מזכה</option>
          {getEligibleSettlements(year).map(x => <option key={x.name} value={x.name}>{x.name} ({x.ratePercent}%)</option>)}
        </select>
        <HebrewTextInput value={note} onChange={e => setNote(e.target.value)} placeholder="למה? למשל: עבר דירה ביוני" aria-label="סיבה" />
        <div className="settle-actions">
          <button type="button" className="ui-btn ui-btn-sm ui-btn-primary" disabled={busy || !note.trim()}
            onClick={() => save({ qualifyingSettlementId: value, qualifyingSettlementOverride: true, qualifyingSettlementNote: note.trim() })}>
            {busy ? 'שומר…' : 'שמירה'}
          </button>
          <button type="button" className="ui-btn ui-btn-sm" disabled={busy} onClick={() => setEditing(false)}>ביטול</button>
        </div>
        {err && <div className="txf-editor-err">{err}</div>}
      </div>
    );
  }

  const what = s ? `${s.name} · ${s.ratePercent}% עד ${money(s.ceilingAnnual)}`
    : id ? `${id} · לא ברשימה של ${year}`
    : 'לא מזכה';
  const source = manual
    ? `קבוע ידנית${client.qualifyingSettlementNote ? ` · ${client.qualifyingSettlementNote}` : ''}`
    : unmatched ? null
    : client.city?.trim() ? `לפי הכתובת${!s && !id ? ` · ${client.city}` : ''}` : null;

  return (
    <div className="settle-status">
      <span>{what}</span>
      {source && <span className="settle-src">{source}</span>}
      {onSave && manual && client.cityCode && (
        <button type="button" className="settle-link" disabled={busy}
          onClick={() => save({ qualifyingSettlementOverride: false })}>חזרה לפי הכתובת</button>
      )}
      {onSave && !manual && (
        <button type="button" className="settle-link"
          onClick={() => { setValue(id && s ? s.name : ''); setNote(''); setEditing(true); }}>שינוי</button>
      )}
      {unmatched && (
        <div className="settle-warn">היישוב בכרטיס, «{client.city}», לא זוהה ברשימת היישובים. בוחרים אותו מחדש בכתובת המגורים.</div>
      )}
      {err && <div className="txf-editor-err">{err}</div>}
    </div>
  );
}

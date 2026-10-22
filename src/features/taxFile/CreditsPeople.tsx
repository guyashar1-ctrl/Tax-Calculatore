// ─── 288 · כרטיס הזיכויים — חלק לכל אחד מבני הזוג ────────────────────────────────
// לפי ההמחשה שגיא אישר (docs/proposals/2026-10-22-credits-card-couple.html): לכל אדם — שורות הנקודות,
// מה חסר (ונכלל לפי הנחה / לא נכלל), ועריכה. בעל/ת התיק נערך/ת בעורך הקיים של התיק (onEditClient);
// בן/בת הזוג — כאן, ונשמר כעובדה מנוהלת «spouse» (מיזוג לתוך האובייקט, עם היסטוריה).
import { useState } from 'react';
import type { Client, CreditPointLine, SpouseData } from '../../types';
import { calcSpouseCreditPoints } from '../../utils/taxCalculations';
import { clientCreditGaps, spouseCreditGaps, type CreditGap } from './creditGaps';

const MONTHS = ['ינואר', 'פברואר', 'מרץ', 'אפריל', 'מאי', 'יוני', 'יולי', 'אוגוסט', 'ספטמבר', 'אוקטובר', 'נובמבר', 'דצמבר'];
const pts = (n: number) => n.toFixed(2).replace(/\.?0+$/, '');
const money = (n: number) => `₪${Math.round(n).toLocaleString('he-IL')}`;

function Person({ name, lines, gaps, onEdit, children }: {
  name: string; lines: CreditPointLine[]; gaps: CreditGap[]; onEdit?: () => void; children?: React.ReactNode;
}) {
  const total = lines.reduce((a, l) => a + l.points, 0);
  const value = lines.reduce((a, l) => a + l.valueNIS, 0);
  return (
    <div className="crp-person">
      <div className="crp-head"><b>{name}</b><span className="crp-tot">{pts(total)} נק׳{value ? ` · ${money(value)}` : ''}</span></div>
      {lines.map((l, i) => (
        <div className="crp-line" key={i}><span>{l.description}</span><span>{pts(l.points)} נק׳</span></div>
      ))}
      {gaps.map((g, i) => (
        <div className={`crp-line crp-gap is-${g.effect}`} key={`g${i}`}>
          <span>{g.text}</span><span>{g.effect === 'excluded' ? 'הזיכוי לא נכלל' : 'נכלל לפי הנחה'}</span>
        </div>
      ))}
      {children}
      {onEdit && <button type="button" className="crp-edit" onClick={onEdit}>עריכה</button>}
    </div>
  );
}

/** בן/בת זוג בלי אובייקט — שלד מהשדות השטוחים של הכרטיס (שם, ת.ז.), בלי להמציא מין. */
function spouseBase(c: Client): Partial<SpouseData> {
  return c.spouse ?? {
    firstName: c.spouseFirstName ?? '', lastName: c.spouseLastName ?? '', idNumber: c.spouseIdNumber ?? '',
    birthDate: c.spouseBirthYear ? `${c.spouseBirthYear}-01-01` : '',
  };
}

export default function CreditsPeople({ client, year, cpValue, clientLines, onEditClient, onSaveSpouse }: {
  client: Client;
  year: number;
  cpValue: number;
  clientLines: CreditPointLine[];
  onEditClient?: () => void;
  onSaveSpouse?: (spouse: Partial<SpouseData>) => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const married = client.familyStatus === 'married';
  const sp = client.spouse;
  const spouseLines = married && sp?.gender ? calcSpouseCreditPoints(sp, client.children ?? [], year, cpValue) : [];
  const spouseName = sp?.firstName || client.spouseFirstName || 'בן/בת הזוג';

  return (
    <div className={`crp ${married ? 'is-couple' : ''}`}>
      <Person name={client.firstName || 'בעל/ת התיק'} lines={clientLines} gaps={clientCreditGaps(client, year)} onEdit={onEditClient} />
      {married && (
        <Person name={spouseName} lines={spouseLines} gaps={spouseCreditGaps(client, year)}
          onEdit={onSaveSpouse && !editing ? () => setEditing(true) : undefined}>
          {editing && onSaveSpouse && (
            <SpouseForm base={spouseBase(client)} onCancel={() => setEditing(false)}
              onSave={async patch => { await onSaveSpouse(patch); setEditing(false); }} />
          )}
        </Person>
      )}
    </div>
  );
}

function SpouseForm({ base, onSave, onCancel }: { base: Partial<SpouseData>; onSave: (s: Partial<SpouseData>) => Promise<void>; onCancel: () => void }) {
  const service = base.completedIdf ? 'idf' : base.completedNationalService ? 'national' : 'none';
  const [f, setF] = useState({
    gender: base.gender ?? '',
    service,
    releaseYear: String((service === 'idf' ? base.idfReleaseYear : base.nationalServiceYear) || ''),
    releaseMonth: String(base.idfReleaseMonth || ''),
    serviceMonths: String(base.serviceMonths || ''),
    degree: base.hasAcademicDegree ? (base.academicDegreeType || 'bachelor') : '',
    degreeYear: String(base.academicDegreeYear || ''),
    aliyahYear: base.isNewImmigrant ? String(base.aliyahYear || '') : '',
    immigrant: !!base.isNewImmigrant,
    disability: String(base.disabilityPercentage || ''),
    reserve: String(base.reserveCombatDaysPrevYear || ''),
    alimony: !!base.paysAlimonyToEx,
  });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setF(x => ({ ...x, [k]: e.target.type === 'checkbox' ? (e.target as HTMLInputElement).checked : e.target.value }));
  const num = (v: string) => (v.trim() ? Number(v) : 0);

  async function save() {
    if (!f.gender) { setErr('חסר מין — בלעדיו אי אפשר לחשב'); return; }
    setBusy(true); setErr(null);
    const ry = num(f.releaseYear);
    try {
      await onSave({
        ...base,
        gender: f.gender as SpouseData['gender'],
        completedIdf: f.service === 'idf', idfReleaseYear: f.service === 'idf' ? ry : 0,
        completedNationalService: f.service === 'national', nationalServiceYear: f.service === 'national' ? ry : 0,
        idfReleaseMonth: f.service !== 'none' && f.releaseMonth ? Number(f.releaseMonth) : undefined,
        serviceMonths: f.service !== 'none' && f.serviceMonths ? num(f.serviceMonths) : undefined,
        hasAcademicDegree: !!f.degree, academicDegreeType: (f.degree || '') as SpouseData['academicDegreeType'], academicDegreeYear: f.degree ? num(f.degreeYear) : 0,
        isNewImmigrant: f.immigrant, aliyahYear: f.immigrant ? num(f.aliyahYear) : 0,
        disabilityPercentage: num(f.disability),
        reserveCombatDaysPrevYear: num(f.reserve),
        paysAlimonyToEx: f.alimony,
      });
    } catch (e) { setErr(e instanceof Error ? e.message : 'השמירה נכשלה'); }
    finally { setBusy(false); }
  }

  return (
    <div className="crp-form">
      <label>מין<select value={f.gender} onChange={set('gender')}><option value="">—</option><option value="female">אישה</option><option value="male">גבר</option></select></label>
      <label>שירות<select value={f.service} onChange={set('service')}><option value="none">לא שירת/ה</option><option value="idf">צבאי</option><option value="national">לאומי</option></select></label>
      {f.service !== 'none' && <>
        <label>שנת שחרור<input value={f.releaseYear} onChange={set('releaseYear')} inputMode="numeric" dir="ltr" maxLength={4} /></label>
        <label>חודש שחרור<select value={f.releaseMonth} onChange={set('releaseMonth')}><option value="">—</option>{MONTHS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}</select></label>
        <label>חודשי שירות<input value={f.serviceMonths} onChange={set('serviceMonths')} inputMode="numeric" dir="ltr" maxLength={2} /></label>
      </>}
      <label>תואר<select value={f.degree} onChange={set('degree')}><option value="">אין</option><option value="bachelor">ראשון</option><option value="master">שני</option><option value="phd">שלישי</option></select></label>
      {f.degree && <label>שנת סיום<input value={f.degreeYear} onChange={set('degreeYear')} inputMode="numeric" dir="ltr" maxLength={4} /></label>}
      <label className="crp-check"><input type="checkbox" checked={f.immigrant} onChange={set('immigrant')} /> עולה חדש/ה</label>
      {f.immigrant && <label>שנת עלייה<input value={f.aliyahYear} onChange={set('aliyahYear')} inputMode="numeric" dir="ltr" maxLength={4} /></label>}
      <label>אחוז נכות<input value={f.disability} onChange={set('disability')} inputMode="numeric" dir="ltr" maxLength={3} /></label>
      <label>ימי מילואים כלוחם/ת (שנה קודמת)<input value={f.reserve} onChange={set('reserve')} inputMode="numeric" dir="ltr" maxLength={3} /></label>
      <label className="crp-check crp-full"><input type="checkbox" checked={f.alimony} onChange={set('alimony')} /> משלם/ת מזונות לבן/בת זוג לשעבר</label>
      <div className="crp-acts crp-full">
        <button type="button" className="ui-btn ui-btn-sm ui-btn-primary" disabled={busy} onClick={save}>{busy ? 'שומר…' : 'שמירה'}</button>
        <button type="button" className="ui-btn ui-btn-sm" disabled={busy} onClick={onCancel}>ביטול</button>
      </div>
      {err && <div className="txf-editor-err crp-full">{err}</div>}
    </div>
  );
}

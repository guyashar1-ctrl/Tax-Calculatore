// ─── הערכת מס: עסק זעיר לשורת עסק ─────────────────────────────────────────────
// ‼ ארבעה דברים נפרדים: רישום ברשות (מתי), סוג התיק, המסלול לשנה, והזכאות — שנגזרת בחישוב. המעמד במע״מ לא
//   נשאל כאן ולא קובע. בחריגה (87ד(ג)) — שתי חלופות שלא משולבות; המשרד יכול לבחור, אחרת נלקח הנמוך.
import type { Client } from '../../types';
import { DocPick, nis } from './parts';
import type { IncomeLine, MicroLineResult, MicroSetup } from './types';

type Docs = { id: string; label: string; date?: string }[];
const STATUS_HE: Record<MicroLineResult['status'], string> = { within: 'בתקרה', forecastExceed: 'צפויה חריגה', actualExceed: 'חרג מהתקרה' };
const MODE_HE: Record<MicroLineResult['mode'], string> = {
  regular: '30% מהמחזור', exceeded87dc: 'חריגה — ניכוי מוגבל או ספרים (87ד(ג))', exceededNoRelief: 'חריגה — לפי הספרים', blockedCooling: 'צינון — לפי הספרים',
};

export function MicroLineEditor({ line, year, client, result, docs, onChange }: {
  line: IncomeLine; year: number; client: Client; result?: MicroLineResult; docs: Docs; onChange: (patch: Partial<IncomeLine>) => void;
}) {
  const m: MicroSetup = line.micro ?? {};
  const set = (patch: Partial<MicroSetup>) => onChange({ micro: { ...m, ...patch } });
  const hist = (y: number) => m.history?.find(h => h.year === y);
  const setHist = (y: number, patch: Partial<{ deducted: boolean; hadBusinessIncome: boolean }>) => {
    const cur = hist(y) ?? { year: y, deducted: false, hadBusinessIncome: false };
    set({ history: [...(m.history ?? []).filter(h => h.year !== y), { ...cur, ...patch }].sort((a, b) => a.year - b.year) });
  };
  const fileType = client.incomeTaxFileType;
  return (
    <div className="te-micro">
      <div className="te-grid">
        <label className="te-field">מסלול לשנת {year}<select value={line.track ?? ''} onChange={e => onChange({ track: (e.target.value || undefined) as IncomeLine['track'] })}>
          <option value="">— לא נקבע —</option><option value="books">לפי הספרים (הוצאות בפועל)</option><option value="micro">עסק זעיר — 30% מהמחזור</option>
        </select><small>סוג התיק{fileType ? ` בכרטיס: ${fileType}` : ': לא ידוע'} — מידע, לא זכאות. מעמד במע״מ לא קובע.</small></label>
        {line.track === 'micro' && (
          <>
            <label className="te-field">רשום כעסק זעיר בתחילת {year}?<select value={m.registeredAtYearStart == null ? '' : m.registeredAtYearStart ? 'yes' : 'no'} onChange={e => set({ registeredAtYearStart: e.target.value === '' ? undefined : e.target.value === 'yes' })}>
              <option value="">לא ידוע</option><option value="yes">כן — רשום ב-1.1</option><option value="no">לא — נרשם במהלך השנה</option>
            </select><small>קובע אם בחריגה יש ניכוי מוגבל (87ד(ג))</small></label>
            <label className="te-field">תאריך הרישום<input type="date" value={m.registeredOn ?? ''} onChange={e => set({ registeredOn: e.target.value || undefined })} /></label>
            <DocPick docs={docs} value={m.evidence?.documentId} onChange={id => set({ evidence: id ? { documentId: id } : undefined })} />
            <label className="te-field">מסלול הדיווח לשנה<select value={m.reporting ?? ''} onChange={e => set({ reporting: (e.target.value || undefined) as MicroSetup['reporting'] })}>
              <option value="">— לא נבחר —</option><option value="short">דיווח מקוצר (תיק 44, תיאום, תקנות הפטור)</option><option value="full">דוח שנתי מלא עם 30%</option>
            </select><small>קובע את הטבות הפנסיה וקרן ההשתלמות</small></label>
          </>
        )}
      </div>
      {line.track === 'micro' && (
        <>
          <fieldset className="te-fc-side">
            <legend>השנים הקודמות — לבדיקת הצינון (87ה(ב))</legend>
            {[year - 2, year - 1].filter(y => y >= 2024).map(y => (
              <div key={y} className="te-row">
                <span>{y}</span>
                <label className="te-radio"><input type="checkbox" checked={!!hist(y)?.deducted} onChange={e => setHist(y, { deducted: e.target.checked })} /> ניכה 30%</label>
                <label className="te-radio"><input type="checkbox" checked={!!hist(y)?.hadBusinessIncome} onChange={e => setHist(y, { hadBusinessIncome: e.target.checked })} /> הייתה הכנסה מעסק</label>
              </div>
            ))}
            <small>ניכה בשנה אחת, ובשנה שאחריה לא ניכה (והייתה הכנסה מעסק) — אין 30% בשתי השנים הבאות. שנת חריגה נחשבת «לא ניכה».</small>
          </fieldset>
          {result && (
            <div className="te-adv">
              <p className="te-adv-head"><b>עסק זעיר · {STATUS_HE[result.status]}</b><span>{MODE_HE[result.mode]} · הכנסה מהעסק {result.taxable == null ? 'חסרה' : nis(result.taxable)}</span></p>
              {result.mode === 'exceeded87dc' && result.alternatives && (
                <div className="te-grid">
                  <label className="te-field">בשנת החריגה<select value={m.choice ?? ''} onChange={e => set({ choice: (e.target.value || undefined) as MicroSetup['choice'] })}>
                    <option value="">הנמוך מהשניים ({result.chosen === 'books' ? 'הספרים' : 'ניכוי מוגבל'})</option>
                    <option value="normativeCapped">ניכוי מוגבל — {nis(result.alternatives.normativeCapped)}</option>
                    <option value="books">הוצאות בפועל — {result.alternatives.books == null ? 'חסר רווח בספרים' : nis(result.alternatives.books)}</option>
                  </select><small>לא משלבים: או הניכוי המוגבל, או הוצאות בפועל על כל המחזור</small></label>
                </div>
              )}
              <ol className="te-explain-list">{result.explain.map((e, i) => <li key={i}>{e}</li>)}</ol>
              {result.reporting && (result.reporting.short != null || result.reporting.full != null) && (
                <div className="te-calc">
                  {result.reporting.short != null && <div><span>מס הכנסה — דיווח מקוצר</span><b>{nis(result.reporting.short)}</b></div>}
                  {result.reporting.full != null && <div><span>מס הכנסה — דוח מלא</span><b>{nis(result.reporting.full)}</b></div>}
                  {result.reporting.withoutDeposits != null && <div><span>בלי הטבות ההפקדות</span><b>{nis(result.reporting.withoutDeposits)}</b></div>}
                </div>
              )}
              {result.reporting && <p className="ty-note">{result.reporting.note}. מקוצר: אין ניכוי קרן השתלמות; פנסיה — זיכוי 35% עד 5% מההכנסה החייבת (כשזו ההכנסה היחידה). מלא: קרן לפי 17(5א), פנסיה לפי 45א/47.</p>}
              {result.open.map((o, i) => <p key={i} className="ty-note">פתוח: {o}</p>)}
            </div>
          )}
        </>
      )}
    </div>
  );
}

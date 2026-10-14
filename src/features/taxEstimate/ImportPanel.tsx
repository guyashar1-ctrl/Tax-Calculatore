// ─── הערכת מס: קליטת רו״ה, 134 ו-ESNA — תצוגה ואישור לפני שימוש ──────────────────
// ‼ שום מספר לא נכנס להערכה בלי שהמשרד ראה אותו ואישר: זיהוי (שם/מספר עוסק מול הכרטיס), שנה ותקופה,
//   סתירות, חודשים ריקים ושורות שלא נקראו. רו״ה נכנס כספרים — לפני תיאומים; קטגוריות ההוצאה מוצגות
//   כדי לרשום תיאומים בנפרד. PDF בלי שכבת טקסט (צילום) לא נקרא — הדרך: ייצוא Excel/CSV, הדבקה או הזנה ידנית.
import { useMemo, useState } from 'react';
import type { Client } from '../../types';
import { useDocumentStore } from '../../hooks/useDocumentStore';
import { MONTH_HE } from './engine';
import { identityMatches, parse134, parseEsna, parsePnl, parseTable, pnlToCutoff, readXlsx } from './importers';
import type { PeriodImport, PnlImport } from './importers';
import { PERSON, nis, perHe, today } from './parts';
import type { AuthorityPeriod, EstimateDraft, Person, SourceRef } from './types';

type Kind = 'pnl' | '134' | 'esna';
const KIND_HE: Record<Kind, string> = { pnl: 'רווח והפסד (פייפרלס או הנהלת חשבונות)', '134': 'מס הכנסה — טבלת התקופות (134)', esna: 'מע״מ — סיכומי דיווח (ESNA)' };

export default function ImportPanel({ client, year, draft, onApply }: {
  client: Client; year: number; draft: EstimateDraft; onApply: (f: (d: EstimateDraft) => EstimateDraft, note: string) => void;
}) {
  const store = useDocumentStore();
  const [kind, setKind] = useState<Kind>('pnl');
  const [text, setText] = useState('');
  const [table, setTable] = useState<string[][] | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [err, setErr] = useState('');
  const [keepFile, setKeepFile] = useState(true);
  const [busy, setBusy] = useState(false);
  const bizLines = draft.lines.filter(l => l.source === 'business');
  const [lineId, setLineId] = useState(bizLines[0]?.id ?? '');
  const [person, setPerson] = useState<Person>('client');
  const [closed, setClosed] = useState(draft.cutoffMonth);

  const reset = () => { setTable(null); setText(''); setFile(null); setErr(''); };
  const readFile = async (f: File) => {
    setErr(''); setFile(f);
    try {
      if (/\.pdf$/i.test(f.name) || f.type === 'application/pdf') { setTable(null); setErr('קובץ PDF — רו״ה של פייפרלס מגיע כתמונה בלי שכבת טקסט, ואין כאן קריאה אמינה שלו. לייצא מפייפרלס ל-Excel/CSV, או להעתיק את הטבלה ולהדביק, או להזין ביד בשורת ההכנסה.'); return; }
      if (/\.xlsx$/i.test(f.name)) { setTable(await readXlsx(await f.arrayBuffer())); return; }
      if (/\.xls$/i.test(f.name)) { setErr('קובץ Excel ישן (xls) — לשמור מחדש כ-xlsx או CSV'); return; }
      const buf = await f.arrayBuffer();
      let t = new TextDecoder('utf-8').decode(buf);
      if (t.includes('�')) t = new TextDecoder('windows-1255').decode(buf);
      setTable(parseTable(t));
    } catch (e) { setErr(`הקובץ לא נקרא: ${(e as Error).message}`); }
  };

  const pnl = useMemo<PnlImport | null>(() => (kind === 'pnl' && table ? parsePnl(table) : null), [kind, table]);
  const per = useMemo<(PeriodImport & { random?: { period: string; amount: number }[] }) | null>(() => (table && kind === '134' ? parse134(table) : table && kind === 'esna' ? parseEsna(table) : null), [kind, table]);
  // שורה שנוספה אחרי שהחלונית נפתחה — ברירת המחדל היא העסק הראשון, לא «אין יעד»
  const line = bizLines.find(l => l.id === lineId) ?? bizLines[0];
  const biz = line?.entityRef ? (client.businesses ?? []).find(b => b.id === line.entityRef) : undefined;
  const ids = [client.idNumber, client.spouse?.idNumber, ...(client.businesses ?? []).map(b => b.taxId)];
  const idState = pnl ? identityMatches(pnl.taxId, ids) : 'unknown';
  const cut = pnl ? pnlToCutoff(pnl, closed) : null;

  const saveSource = async (what: string): Promise<SourceRef> => {
    const note = `${what} · ${file ? file.name : 'הדבקה'} · נקלט ${today().split('-').reverse().join('.')}`;
    if (!file || !keepFile) return { note, provenance: 'import', checkedAt: today() };
    try {
      const id = crypto.randomUUID();
      await store.saveDoc({ id, clientId: client.id, fileName: file.name, fileType: file.type || 'application/octet-stream', fileSize: file.size, category: 'other', year,
        uploadedAt: new Date().toISOString(), description: `${what} ${year}`, notes: 'נקלט להערכת המס', fileData: await file.arrayBuffer(), folderId: null, labelId: null } as Parameters<typeof store.saveDoc>[0]);
      return { documentId: id, note, provenance: 'import', checkedAt: today() };
    } catch (e) {
      setErr(`הנתונים נקלטו, אבל הקובץ לא נשמר במסמכים (${(e as Error).message}). אפשר להעלות אותו ידנית.`);
      return { note: `${note} · הקובץ לא נשמר`, provenance: 'import', checkedAt: today() };
    }
  };

  const applyPnl = async () => {
    if (!pnl || !cut || !line) return;
    setBusy(true);
    const src = await saveSource('רווח והפסד');
    setBusy(false);
    onApply(d => ({ ...d, lines: d.lines.map(l => l.id === line.id ? {
      ...l, actualToCutoff: Math.round(cut.profit), turnoverToCutoff: Math.round(cut.turnover),
      actualMonths: cut.monthsMeasured && cut.monthsMeasured < closed ? cut.monthsMeasured : undefined, actualSource: src, actualFrom: 'import',
    } : l), cutoffMonth: closed }), `רו״ה נקלט ל«${line.label}»: רווח ${nis(cut.profit)} ומחזור ${nis(cut.turnover)} עד סוף ${MONTH_HE[closed]} (לפני תיאומים)`);
    reset();
  };
  const applyPeriods = async () => {
    if (!per) return;
    setBusy(true);
    const src = await saveSource(kind === '134' ? 'טבלת 134' : 'סיכומי ESNA');
    setBusy(false);
    const merge = (old: AuthorityPeriod[]) => [...old.filter(o => !per.periods.some(p => p.period === o.period)), ...per.periods.filter(p => p.period.startsWith(String(year)))];
    if (kind === '134') {
      const key = person === 'client' ? 'it' : 'itSpouse';
      onApply(d => {
        const cur = (key === 'it' ? d.it : d.itSpouse) ?? { via: 'manual' as const, method: 'unknown' as const, frequency: 1 as const, periods: [] };
        return { ...d, [key]: { ...cur, periods: merge(cur.periods), via: 'upload', readOn: today(), evidence: { ...src, note: `${src.note}${per.decisionUpdatedOn ? ` · החלטת המקדמה עודכנה ב-${per.decisionUpdatedOn.split('-').reverse().join('.')}` : ''}` } } };
      }, `134 נקלט (${PERSON[person]}): ${per.periods.length} תקופות; נבדק היום (${today().split('-').reverse().join('.')})`);
    } else {
      onApply(d => ({ ...d, vat: { ...d.vat, periods: merge(d.vat.periods), via: 'upload', evidence: src } }), `ESNA נקלט: ${per.periods.length} תקופות`);
    }
    reset();
  };

  const otherYear = per ? per.periods.filter(p => !p.period.startsWith(String(year))).length : 0;
  return (
    <div className="te-lines te-import">
      <div className="te-grid">
        <label className="te-field">מה קולטים<select value={kind} onChange={e => { setKind(e.target.value as Kind); reset(); }}>{(Object.keys(KIND_HE) as Kind[]).map(k => <option key={k} value={k}>{KIND_HE[k]}</option>)}</select></label>
        {kind === 'pnl' && <label className="te-field">לשורת העסק<select value={line?.id ?? ''} onChange={e => setLineId(e.target.value)}>{bizLines.map(l => <option key={l.id} value={l.id}>{l.label} · {PERSON[l.person]}</option>)}</select>{!bizLines.length && <small>אין שורת עסק — להוסיף אותה ב«הכנסות»</small>}</label>}
        {kind === '134' && client.familyStatus === 'married' && <label className="te-field">של מי התיק<select value={person} onChange={e => setPerson(e.target.value as Person)}><option value="client">הלקוח</option><option value="spouse">בן/בת הזוג</option></select></label>}
        <label className="te-field">קובץ (xlsx / csv)<input type="file" accept=".xlsx,.csv,.txt,.pdf" onChange={e => { const f = e.target.files?.[0]; if (f) void readFile(f); }} /></label>
      </div>
      <label className="te-field">או הדבקה מהמסך / מהגיליון<textarea rows={4} value={text} onChange={e => { setText(e.target.value); setFile(null); setErr(''); setTable(e.target.value.trim() ? parseTable(e.target.value) : null); }}
        placeholder={kind === 'pnl' ? 'להעתיק את כל הטבלה — כולל שורת החודשים (01/26 …) ושורות «סך הכנסות», «סך הוצאות», «סך רווח והפסד»' : kind === '134' ? 'להעתיק את טבלת התקופות ממסך 134, כולל הכותרת (תקופה, מצב דיווח, מחזור, חיוב, תשלומים…)' : 'להעתיק את סיכומי הדיווח מ-ESNA, כולל הכותרת (תקופה, עסקאות חייבות…)'} /></label>
      {err && <p className="ty-err" role="alert">{err}</p>}

      {pnl && (
        <div className="te-preview">
          <p className="ty-label">תצוגה לפני קליטה</p>
          <ul className="wd-list">
            <li>זיהוי: {pnl.name ?? 'שם לא נמצא'}{pnl.taxId ? ` · ${pnl.taxId}` : ''} — {idState === 'match' ? <span className="ty-chip green">תואם לכרטיס</span> : idState === 'mismatch' ? <span className="ty-chip red">לא תואם לכרטיס — לבדוק שזה הלקוח הנכון</span> : <span className="ty-chip amber">לא נבדק — אין מספר להשוואה</span>}{biz?.name && pnl.name && !pnl.name.includes(biz.name) ? ` · העסק בכרטיס: ${biz.name}` : ''}</li>
            <li>שנה: {pnl.year ?? 'לא זוהתה'} {pnl.year && pnl.year !== year ? <span className="ty-chip red">לא שנת ההערכה ({year})</span> : null} · חודש אחרון עם נתונים: {pnl.lastMonthWithData ? MONTH_HE[pnl.lastMonthWithData] : 'אין'}</li>
          </ul>
          <div className="te-table-wrap"><table className="te-table"><thead><tr><th>חודש</th><th>הכנסות</th><th>הוצאות</th><th>רווח</th></tr></thead>
            <tbody>{pnl.months.filter(x => x.m <= Math.max(closed, pnl.lastMonthWithData)).map(x => <tr key={x.m} className={x.m > closed ? 'is-after' : ''}><td>{MONTH_HE[x.m]}</td><td>{nis(x.income)}</td><td>{nis(x.expenses)}</td><td>{x.profit == null ? 'ריק' : nis(x.profit)}</td></tr>)}</tbody></table></div>
          <label className="te-field te-cut">הספרים סגורים עד סוף<select value={closed} onChange={e => setClosed(Number(e.target.value))}>{MONTH_HE.slice(1).map((x, i) => <option key={i + 1} value={i + 1}>{x}</option>)}</select>
            <small>זה יהיה חודש החתך של ההערכה. חודש שלא נסגר בספרים — לא «בפועל».</small></label>
          {cut && <p><b>ייכנס כבפועל עד סוף {MONTH_HE[closed]}:</b> רווח {nis(cut.profit)} · מחזור {nis(cut.turnover)}{cut.monthsMeasured < closed ? ` · ${cut.monthsMeasured} חודשים נמדדו (עסק שנפתח באמצע השנה?)` : ''}</p>}
          {[...pnl.warnings, ...(cut?.checks ?? [])].length > 0 && <ul className="te-blockers">{[...pnl.warnings, ...(cut?.checks ?? [])].map((w, i) => <li key={i}>{w}</li>)}</ul>}
          {pnl.expenseCategories.length > 0 && (
            <details className="te-explain"><summary>קטגוריות הוצאה בספרים ({pnl.expenseCategories.length}) — לתיאומי מס</summary>
              <ul className="wd-list">{pnl.expenseCategories.map(c => <li key={c.label}>{c.label}: {nis(c.toMonth(closed))} עד סוף {MONTH_HE[closed]}</li>)}</ul>
              <p className="ty-note">הרווח נקלט כפי שבספרים. תיאום (למשל חלק פרטי ברכב) נרשם ב«תיאומי מס» עם שם הקטגוריה — פעם אחת.</p>
            </details>
          )}
          {file && <label className="te-radio"><input type="checkbox" checked={keepFile} onChange={e => setKeepFile(e.target.checked)} /> לשמור את הקובץ במסמכי הלקוח ({year}) כאסמכתה</label>}
          <div className="ty-actions">
            <button type="button" className="btn btn-primary" disabled={busy || !line || !cut || idState === 'mismatch' || (pnl.year != null && pnl.year !== year) || !pnl.months.some(x => x.profit != null)} onClick={() => void applyPnl()}>קלוט לשורה «{line?.label ?? '—'}»</button>
            <button type="button" className="btn btn-ghost" onClick={reset}>בטל</button>
          </div>
          {idState === 'mismatch' && <p className="ty-note">לא נקלט: המספר בדוח לא שייך ללקוח. אם זה בכל זאת הדוח הנכון — לתקן את מספר העוסק בכרטיס.</p>}
        </div>
      )}

      {per && (
        <div className="te-preview">
          <p className="ty-label">תצוגה לפני קליטה</p>
          {per.periods.length === 0 ? <p className="ty-err">לא נמצאו תקופות.</p> : (
            <div className="te-table-wrap"><table className="te-table"><thead><tr><th>תקופה</th><th>מצב</th><th>מחזור</th>{kind === '134' && <><th>חיוב</th><th>שולם</th><th>ניכוי במקור</th></>}</tr></thead>
              <tbody>{per.periods.map(p => <tr key={p.period} className={p.period.startsWith(String(year)) ? '' : 'is-after'}><td>{perHe(p.period)}</td><td>{p.state === 'reported' ? 'דווח' : p.state === 'not_due' ? 'טרם הגיע המועד' : 'לא נקרא'}</td><td>{nis(p.turnover)}</td>
                {kind === '134' && <><td>{nis(p.charged)}</td><td>{nis(p.paid)}</td><td>{nis(p.withheld)}</td></>}</tr>)}</tbody></table></div>
          )}
          {kind === '134' && <p>«נבדק בתאריך» יירשם כהיום — היום שבו קראתם את המסך.{per.decisionUpdatedOn ? ` «עודכן ב-${per.decisionUpdatedOn.split('-').reverse().join('.')}» במסך הוא מועד עדכון החלטת המקדמה, לא מועד הבדיקה.` : ''}</p>}
          {[...per.warnings, ...(otherYear ? [`${otherYear} תקופות משנה אחרת — לא ייקלטו`] : [])].length > 0 && <ul className="te-blockers">{[...per.warnings, ...(otherYear ? [`${otherYear} תקופות משנה אחרת — לא ייקלטו`] : [])].map((w, i) => <li key={i}>{w}</li>)}</ul>}
          {per.skipped.length > 0 && <details className="te-explain"><summary>שורות שלא נקראו ({per.skipped.length})</summary><ul className="wd-list">{per.skipped.map((s, i) => <li key={i}>{s}</li>)}</ul></details>}
          {file && <label className="te-radio"><input type="checkbox" checked={keepFile} onChange={e => setKeepFile(e.target.checked)} /> לשמור את הקובץ במסמכי הלקוח כאסמכתה</label>}
          <div className="ty-actions">
            <button type="button" className="btn btn-primary" disabled={busy || !per.periods.some(p => p.period.startsWith(String(year)))} onClick={() => void applyPeriods()}>קלוט {per.periods.filter(p => p.period.startsWith(String(year))).length} תקופות</button>
            <button type="button" className="btn btn-ghost" onClick={reset}>בטל</button>
          </div>
          <p className="ty-note">תקופה שכבר קיימת מוחלפת בנתון החדש; שאר התקופות נשמרות. «טרם הגיע המועד» אינו חוסר ואינו 0.</p>
        </div>
      )}
      {!table && !err && <p className="ty-note">אין קובץ? אפשר תמיד להזין ביד: בפועל ומחזור בשורת העסק, תקופות 134 במקדמות, ו-ESNA במע״מ.</p>}
    </div>
  );
}


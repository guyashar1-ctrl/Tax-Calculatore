// ─── שורות מקור במסך: המסמכים של השנה, עורך הזנה בסיסי לפי תבנית, ו«ממה זה מורכב» (שלב 1 של תוכנית הליווי, 17.10.2026) ────
// ‼ בתוך שורת הבקשה «דוח שנתי» — לא מסך שלישי. ההזנה ידנית ומובנית (בלי ניתוח PDF): המשרד מקליד מהמסמך; «שמור» כותב שורות
//   מקור (record_source_lines) ומראה לאן כל שורה הלכה. מסך הליווי המלא קובץ-קובץ — שלב 2.
// ‼ אין כאן חישוב: הסכומים בשדות באים מהמנוע (ReturnOutputs); כאן רק קריאה והזנה.
import { useMemo, useState } from 'react';
import type { Client } from '../../types';
import type { Evidence, YearFact } from '../taxYear/types';
import { DOCS } from '../taxYear/documents';
import { ITEM_BY_KEY } from '../taxYear/catalog';
import { NumField, PERSON, he, nis } from '../taxEstimate/parts';
import { DOC_TEMPLATES, TEMPLATE_DOC_KINDS, entitiesFor, linesToSave, missingRequired, templateFor, type DocTemplate, type LineValues } from './docTemplates';
import * as api from './api';
import type { FieldSource, ReturnField, ReturnOutputs } from './types';

type Run = (fn: () => Promise<unknown>, done?: string) => Promise<boolean>;
const docLabel = (k: string) => (DOCS as Record<string, { label: string }>)[k]?.label ?? k;
const personHe = (p: string, spouseName: string, clientName: string) => (p === 'spouse' ? spouseName : p === 'couple' ? 'משק הבית' : clientName);

/** «ממה זה מורכב» — שורות המקור של שדה: סכום · מסמך · של מי · השאלה · השנה · מי הזין ומתי. */
export function Breakdown({ source, spouseName, clientName, compact }: { source: FieldSource; spouseName: string; clientName: string; compact?: boolean }) {
  const lines = source.lines ?? [];
  return (
    <div className="ar-breakdown" data-ar-breakdown>
      {source.kind === 'manual' && <p className="ar-manual"><b>#</b> ערך ידני מעל החישוב — {source.text.replace(/^# ערך ידני: /, '')}. <small>המחושב: {nis(source.computed)}</small></p>}
      {source.kind === 'completion' && <p className="ar-manual"><b>✍</b> {source.text}</p>}
      {source.kind === 'calculation' && !lines.length && <p className="ty-note">∑ {source.text}{source.ruleIds?.length ? <small> · כללים: {source.ruleIds.join(', ')}</small> : null}</p>}
      {source.kind === 'card' && <p className="ty-note">מהכרטיס — {source.text}</p>}
      {lines.length > 0 && (
        <ul className="ar-lines">
          {lines.map(l => (
            <li key={l.factId} className="ar-line">
              <b className="ar-num">{nis(l.amount)}</b>
              <span>{l.docLabel}{l.fileName ? <small> · {l.fileName}</small> : null}</span>
              <span>{personHe(l.person, spouseName, clientName)}</span>
              {!compact && <span className="ty-note">{ITEM_BY_KEY[l.itemKey]?.label ?? l.itemKey}{l.lineKey ? ` · ${l.lineKey}` : ''} · {l.year}</span>}
              {!compact && <span className="ty-note">{l.trust === 'verified' ? '✓ מסמך' : l.trust === 'read' ? '⟳ מהרשות' : '✎ הוזן'} · {he(l.enteredAt.slice(0, 10))}</span>}
            </li>
          ))}
        </ul>
      )}
      {lines.length > 1 && source.sumIsField !== false && <p className="ty-note">סה״כ השורות: {nis(lines.reduce((a, l) => a + l.amount, 0))}</p>}
      {lines.length > 0 && source.sumIsField === false && source.kind !== 'manual' && <p className="ty-note">השדה נגזר מהשורות ({source.text}).</p>}
      {!lines.length && source.kind === 'fact' && <p className="ty-err">שדה בלי מקור — אין שורות שמרכיבות אותו.</p>}
    </div>
  );
}

/** סימון המקור בטבלה: # ידני · ✍ השלמה · ∑ חישוב · ✓/⟳/✎ לפי האמון. */
export const sourceMark = (s: FieldSource) => (s.kind === 'manual' ? '# ידני' : s.kind === 'fact' ? ({ verified: '✓ אומת מול מסמך', read: '⟳ נקרא מהרשות', manual: '✎ הוזן / הוצהר' } as Record<string, string>)[s.trust ?? 'manual'] : s.kind === 'calculation' ? '∑ חישוב' : s.kind === 'completion' ? '✍ השלמה מקצועית' : 'מהתיק');

interface DocRow { ev: Evidence; template?: DocTemplate; lines: YearFact[]; state: 'entered' | 'todo' | 'mismatch' | 'noTemplate' }

/** המסמכים של השנה והזנת שורות המקור מהם. */
export function SourceDocsSection({ client, year, facts, evidence, out, requestId, run, spouseName }: {
  client: Client; year: number; facts: YearFact[]; evidence: Evidence[]; out: ReturnOutputs; requestId: string; run: Run; spouseName: string;
}) {
  const clientName = client.firstName || PERSON.client;
  const [editing, setEditing] = useState<{ ev?: Evidence; docKind: string } | null>(null);
  const [lastSaved, setLastSaved] = useState<string[] | null>(null);
  const [pickKind, setPickKind] = useState('');
  const rows: DocRow[] = useMemo(() => evidence
    .filter(e => (e.taxYear == null || e.taxYear === year) && e.review !== 'rejected')
    .map(e => {
      const t = templateFor(e.docKind, year)?.template;
      const lines = facts.filter(f => f.evidenceId === e.id && f.status === 'accepted');
      const state: DocRow['state'] = !t ? 'noTemplate' : e.identityMatch === 'mismatch' || e.periodMatch === 'mismatch' ? 'mismatch' : lines.length ? 'entered' : 'todo';
      return { ev: e, template: t, lines, state };
    })
    .sort((a, b) => (a.state === 'todo' ? 0 : 1) - (b.state === 'todo' ? 0 : 1) || b.ev.receivedAt.localeCompare(a.ev.receivedAt)), [evidence, facts, year]);
  const todo = rows.filter(r => r.state === 'todo').length, entered = rows.filter(r => r.state === 'entered').length;
  const landed = lastSaved ? out.fields.filter(f => f.source.lines?.some(l => lastSaved.includes(l.factId))) : [];
  const STATE_HE: Record<DocRow['state'], { text: string; tone: string }> = { entered: { text: 'הוזן', tone: 'green' }, todo: { text: 'להזנה', tone: 'amber' }, mismatch: { text: 'לא תואם — לא מזינים', tone: 'red' }, noTemplate: { text: 'אין תבנית הזנה (שלב 2)', tone: '' } };
  return (
    <details className="ty-details" id="ar-sources" open={todo > 0 || !!editing || !!lastSaved} data-ar-sources>
      <summary><b>מסמכים ושורות מקור</b><span>{rows.length ? `${rows.length} מסמכים · ${entered} הוזנו · ${todo} להזנה` : 'אין עדיין מסמכים לשנה — אפשר להזין מהנייר'}</span></summary>
      <div className="ty-details-body">
        <p className="ty-note">כל סכום בדוח מורכב משורות מקור: סכום + המסמך + השאלה + האדם + השנה. מזינים מהמסמך לפי «מה לוקחים ממנו»; השדה בטופס הוא סיכום השורות — לא מספר שמקלידים.</p>
        {lastSaved && landed.length > 0 && (
          <p className="ty-ok" role="status" data-ar-landed>לאן זה הלך: {landed.map(f => `${f.code} ← ${nis(f.amount)}`).join(' · ')}</p>
        )}
        {lastSaved && landed.length === 0 && <p className="ty-note" role="status" data-ar-landed>השורות נשמרו. עדיין אין להן שדה בטיוטה — למשל כי המקור חסר בכרטיס (מעסיק/עסק) או שהוא ממתין להכרעה.</p>}
        <ul className="ar-docs">
          {rows.map(r => (
            <li key={r.ev.id} className="ar-doc" data-ar-doc={r.ev.docKind}>
              <div className="ar-doc-head">
                <b>{docLabel(r.ev.docKind)}</b>
                <span className="ty-note">{personHe(r.ev.subjectRole, spouseName, clientName)}{r.ev.entityRef ? ` · ${entityLabel(client, r.ev.entityRef)}` : ''}{r.ev.fileName ? ` · ${r.ev.fileName}` : ''} · {r.ev.receivedVia === 'portal' ? `הגיע מהלקוח ${he(r.ev.receivedAt.slice(0, 10))}` : `נרשם במשרד ${he(r.ev.receivedAt.slice(0, 10))}`}</span>
                <span className={`ty-chip ${STATE_HE[r.state].tone}`}>{STATE_HE[r.state].text}{r.state === 'entered' ? ` · ${r.lines.length} שורות` : ''}</span>
                {r.template && r.state !== 'mismatch' && editing?.ev?.id !== r.ev.id && (
                  <button type="button" className="btn btn-sm btn-ghost" onClick={() => { setEditing({ ev: r.ev, docKind: r.ev.docKind }); setLastSaved(null); }} data-ar-enter={r.ev.docKind}>{r.state === 'entered' ? 'ערוך שורות' : 'הזן מהמסמך'}</button>
                )}
              </div>
              {r.state === 'entered' && editing?.ev?.id !== r.ev.id && (
                <ul className="ar-lines is-doc">{r.lines.map(f => <li key={f.id} className="ar-line"><span>{lineLabel(r.template, f)}</span><b className="ar-num">{nis(lineAmount(f))}</b></li>)}</ul>
              )}
              {editing?.ev?.id === r.ev.id && r.template && (
                <EntryEditor client={client} year={year} template={r.template} ev={r.ev} existing={r.lines} evidence={evidence} requestId={requestId} run={run} spouseName={spouseName}
                  onDone={ids => { setEditing(null); setLastSaved(ids); }} onCancel={() => setEditing(null)} />
              )}
            </li>
          ))}
        </ul>
        <div className="ar-paper">
          <label className="te-field">הזנה מהנייר — מסמך שלא הועלה לתיק
            <select value={pickKind} onChange={e => setPickKind(e.target.value)} data-ar-pick>
              <option value="">— בחרו סוג מסמך —</option>
              {TEMPLATE_DOC_KINDS.map(k => <option key={k} value={k}>{docLabel(k)}</option>)}
            </select>
          </label>
          <button type="button" className="btn btn-sm btn-ghost" disabled={!pickKind} onClick={() => { setEditing({ docKind: pickKind }); setLastSaved(null); }} data-ar-paper>הזן</button>
        </div>
        {editing && !editing.ev && (
          <EntryEditor client={client} year={year} template={templateFor(editing.docKind as DocTemplate['docKind'], year)!.template} existing={[]} evidence={evidence} requestId={requestId} run={run} spouseName={spouseName}
            onDone={ids => { setEditing(null); setLastSaved(ids); setPickKind(''); }} onCancel={() => setEditing(null)} />
        )}
        <p className="ty-note">תבניות קיימות ל-{DOC_TEMPLATES[2025].length} מסמכים ({DOC_TEMPLATES[2025].map(t => docLabel(t.docKind)).join(' · ')}). שאר המסמכים — בסבב הבא. ניתוח אוטומטי של PDF — לא כאן.</p>
      </div>
    </details>
  );
}

const entityLabel = (c: Client, ref: string) =>
  (c.employers ?? []).find(e => e.id === ref)?.name ?? (c.businesses ?? []).find(b => b.id === ref)?.name ?? (c.investmentAccounts ?? []).find(a => a.id === ref)?.institutionName
  ?? (c.pensionFunds ?? []).find(f => f.id === ref)?.institutionName ?? (c.properties ?? []).find(p => p.id === ref)?.address ?? ref;
const lineAmount = (f: YearFact): number | undefined => {
  if (typeof f.value === 'number') return f.value;
  if (f.value && typeof f.value === 'object') { const v = Object.values(f.value as Record<string, unknown>).find(x => typeof x === 'number'); return typeof v === 'number' ? v : undefined; }
  return undefined;
};
const lineLabel = (t: DocTemplate | undefined, f: YearFact) => t?.lines.find(l => l.key === f.lineKey)?.label ?? f.lineKey ?? ITEM_BY_KEY[f.itemKey]?.label ?? f.itemKey;

/** עורך הזנה בסיסי לפי תבנית: של מי, איזו ישות, השדות עם «איפה זה במסמך», אימות, «מתקן או נוסף», שמירה. */
function EntryEditor({ client, year, template, ev, existing, evidence, requestId, run, spouseName, onDone, onCancel }: {
  client: Client; year: number; template: DocTemplate; ev?: Evidence; existing: YearFact[]; evidence: Evidence[]; requestId: string; run: Run; spouseName: string;
  onDone: (factIds: string[]) => void; onCancel: () => void;
}) {
  const married = client.familyStatus === 'married' || !!client.spouse;
  const [who, setWho] = useState<'client' | 'spouse'>(ev?.subjectRole === 'spouse' ? 'spouse' : 'client');
  const [entityRef, setEntityRef] = useState<string>(ev?.entityRef ?? '');
  const [fileName, setFileName] = useState('');
  const [replaces, setReplaces] = useState<string>('');
  const [values, setValues] = useState<LineValues>(() => Object.fromEntries(existing.map(f => [f.lineKey ?? '', lineAmount(f)])));
  const [err, setErr] = useState<string | null>(null);
  const entities = entitiesFor(template, client, who);
  const problems = template.validate(values);
  const missing = missingRequired(template, values);
  const needEntity = !!template.entityKind && entities.length > 0 && !entityRef;
  // מסמך קודם מאותו סוג לאותו אדם ואותה ישות — «אישור מתקן» מחליף את שורותיו; «נוסף» מתווסף
  const prior = evidence.filter(e => e.id !== ev?.id && e.docKind === template.docKind && e.subjectRole === who && (e.entityRef ?? '') === (entityRef ?? '') && (e.taxYear == null || e.taxYear === year) && e.review !== 'rejected');
  const canSave = problems.length === 0 && missing.length === 0 && !needEntity && Object.values(values).some(v => typeof v === 'number');
  const save = () => run(async () => {
    setErr(null);
    const lines = linesToSave(template, values, { subjectRole: who, entityRef: entityRef || undefined, taxYear: year, requestId });
    const r = await api.recordSourceLines(client.id, lines, {
      evidenceId: ev?.id,
      evidence: ev ? undefined : { docKind: template.docKind, subjectRole: who, entityKind: template.entityKind, entityRef: entityRef || undefined, taxYear: year, fileName: fileName.trim() || undefined, note: 'הוזן מהנייר במשרד' },
      replacesEvidenceId: replaces || undefined,
    });
    if (!r.ok) { setErr(r.error === 'unknown_item' ? 'אחת השורות מצביעה לפריט שאינו בקטלוג של השרת' : r.error === 'evidence_mismatch' ? 'המסמך סומן «לא תואם» — לא מזינים ממנו' : `השמירה נכשלה (${r.error})`); return r; }
    onDone(r.factIds);
    return r;
  }, `נשמרו ${Object.values(values).filter(v => typeof v === 'number').length} שורות מקור מ${docLabel(template.docKind)}${replaces ? ' — אישור מתקן; שורות המסמך הקודם יצאו מהחישוב' : ''}`);
  return (
    <div className="ar-editor ar-entry" role="group" aria-label={`הזנה: ${template.title}`} data-ar-editor={template.docKind}>
      <p className="ty-label">{template.title}{ev?.fileName ? ` · ${ev.fileName}` : ''}</p>
      <p className="ty-note">{template.intro}</p>
      <div className="te-grid">
        {married && <label className="te-field">של מי<select value={who} onChange={e => { setWho(e.target.value as 'client' | 'spouse'); setEntityRef(''); }} data-ar-who><option value="client">{client.firstName || PERSON.client}</option><option value="spouse">{spouseName}</option></select></label>}
        {template.entityKind && (
          <label className="te-field">{template.per === 'employer' ? 'מעסיק' : template.per === 'business' ? 'עסק' : template.per === 'account' ? 'חשבון' : 'קופה'}
            <select value={entityRef} onChange={e => setEntityRef(e.target.value)} data-ar-entity>
              <option value="">{entities.length ? '— בחרו —' : 'אין בכרטיס — להוסיף בתיק המס'}</option>
              {entities.map(x => <option key={x.id} value={x.id}>{x.label}</option>)}
            </select>
            {!entities.length && <small>בלי ישות בכרטיס השורות נשמרות, אבל המנוע לא ישבץ אותן עד שתתווסף.</small>}
          </label>
        )}
        {!ev && <label className="te-field">שם הקובץ / האישור (לא חובה)<input value={fileName} onChange={e => setFileName(e.target.value)} placeholder="למשל 106-2025 מעסיק א׳" /></label>}
      </div>
      <p className="ty-label">מה לוקחים מהמסמך</p>
      <div className="te-grid">
        {template.lines.map(l => (
          <div key={l.key} className="ar-entry-line" data-ar-line={l.key}>
            <NumField label={`${l.label}${l.optional ? '' : ' *'}`} value={typeof values[l.key] === 'number' ? (values[l.key] as number) : undefined} onChange={v => setValues(x => ({ ...x, [l.key]: v }))} hint={`${l.where} ← ${l.goesTo}`} />
            {l.note && <small className="ty-note">{l.note}</small>}
          </div>
        ))}
      </div>
      {prior.length > 0 && (
        <label className="te-field">אישור נוסף או מתקן?
          <select value={replaces} onChange={e => setReplaces(e.target.value)} data-ar-replaces>
            <option value="">אישור נוסף — מתווסף לקודם</option>
            {prior.map(p => <option key={p.id} value={p.id}>אישור מתקן — מחליף את {p.fileName ?? docLabel(p.docKind)} מ-{he(p.receivedAt.slice(0, 10))}</option>)}
          </select>
        </label>
      )}
      {(problems.length > 0 || missing.length > 0 || needEntity) && (
        <ul className="ar-problems" role="alert" data-ar-problems>
          {missing.map(m => <li key={m}>חסר: {m}</li>)}
          {needEntity && <li>לבחור למי המסמך שייך ({template.per === 'employer' ? 'מעסיק' : template.per === 'business' ? 'עסק' : template.per === 'account' ? 'חשבון' : 'קופה'})</li>}
          {problems.map(p => <li key={p}>{p}</li>)}
        </ul>
      )}
      {err && <p className="ty-err" role="alert">{err}</p>}
      <div className="ty-actions">
        <button type="button" className="btn btn-sm btn-primary" disabled={!canSave} onClick={() => void save()} data-ar-save>שמור שורות מקור</button>
        <button type="button" className="btn btn-sm btn-ghost" onClick={onCancel}>ביטול</button>
        <small className="ty-note">* חובה. השמירה מחליפה את כל שורות המסמך הזה; הקודמות נשמרות בהיסטוריה.</small>
      </div>
    </div>
  );
}

/** שורה בטבלת השדות עם «ממה זה מורכב» בלחיצה. */
export function FieldRow({ f, spouseName, clientName, onMap }: { f: ReturnField; spouseName: string; clientName: string; onMap?: (code: string) => void }) {
  const [open, setOpen] = useState(false);
  const lines = f.source.lines?.length ?? 0;
  return (
    <>
      <tr className={`ar-row${open ? ' is-open' : ''}${f.source.kind === 'manual' ? ' is-manual' : ''}`} data-ar-field={f.code} data-ar-person={f.person}>
        <td className="ar-code">{f.source.kind === 'manual' ? <b title="ערך ידני מעל החישוב">#</b> : null}{f.code}{f.ambiguous ? <small title="הקוד מופיע בטופס יותר מפעם אחת — לבדיקה"> ?</small> : null}</td>
        <td>{f.label}</td>
        <td>{f.person === 'spouse' ? spouseName : f.person === 'joint' ? 'משותף' : clientName}</td>
        <td className="ar-num">{f.kind === 'amount' ? nis(f.amount) : f.kind === 'checkbox' ? (f.checked ? '☒ מסומן' : '☐') : f.text}</td>
        <td className="ar-src">{sourceMark(f.source)}<br /><small>{f.source.text}</small>
          <div className="ar-row-actions">
            {(lines > 0 || f.source.kind !== 'card') && f.kind === 'amount' && <button type="button" className="btn btn-sm btn-ghost" onClick={() => setOpen(o => !o)} aria-expanded={open} data-ar-breakdown-btn>{open ? 'סגור' : `ממה זה מורכב${lines ? ` (${lines})` : ''}`}</button>}
            {onMap && /^\d{3}$/.test(f.code) && <button type="button" className="btn btn-sm btn-ghost" onClick={() => onMap(f.code)} data-ar-map>במפת הטופס</button>}
          </div>
        </td>
      </tr>
      {open && <tr className="ar-row-detail"><td colSpan={5}><Breakdown source={f.source} spouseName={spouseName} clientName={clientName} /></td></tr>}
    </>
  );
}

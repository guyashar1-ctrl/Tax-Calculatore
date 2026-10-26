// ─── הצהרת הון במשרד: מסך אחד — «אצלך», החומרים, והסכומים לכל סעיף עם הטופס עצמו (26.10.2026) ──────────────────
// ‼ גיא (26.10): אותם עקרונות כמו הדוח השנתי — הפרדה בין הלקוח למשרד, מידע קיים בלי כפילויות, פרטים לבדיקה,
//   שיוך ליום ההצהרה בלי לדרוס היסטוריה, מעט צעדים ופעולה הבאה ברורה.
// ‼ התשובות נכנסות לבד (autoAcceptPlan — אותו כלל כמו בדוח השנתי). סעיף שהלקוח ענה עליו «לא» — «אין» לבד.
//   המשרד רושם סכום אחד לכל סעיף, ליום ההצהרה (as_of); 200/210/220/800 נגזרים. «שליחה לחתימה» — כמו בדוח השנתי (300).
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { Client } from '../../types';
import type { OnboardingStep } from '../../types/onboarding';
import type { ProposedFact } from '../../types/taxFacts';
import type { YearData } from '../taxYear/api';
import * as tyApi from '../taxYear/api';
import type { ItemStatus } from '../taxYear/picture';
import type { YearFact } from '../taxYear/types';
import type { WealthPayload } from '../taxYear/WealthDeclarationPanel';
import { materialsOf, type Material, type Who } from '../annualReturn/workspace';
import { loadSigning, sendForSigning, signErrorText, signersOf, snapshotKey, storeSigned, wealthSnapshot, type Signing } from '../annualReturn/signing';
import { buildSignedSetPdf, sha256Hex } from '../annualReturn/signedSet';
import { loadDocumentFile } from '../annualReturn/docFile';
import { supabase } from '../../lib/supabase';
import { computeWealth, SECTION_KEYS, type SectionValue } from './engine';
import { WealthFormView, WealthSummary, wealthHeadline } from './WealthView';
import { printWealthSet } from './print';
import '../annualReturn/workspace.css';
import { useAutoAccept } from '../taxYear/useAutoAccept';

type ApplyCard = (proposals: ProposedFact[], sourceRef: string) => Promise<{ ok: boolean; client?: Client; error?: string }>;
interface Props {
  client: Client;
  step: OnboardingStep;
  year: number;
  data: YearData;
  busy: boolean;
  run: (fn: () => Promise<unknown>, done?: string) => Promise<boolean>;
  statuses: ItemStatus[];
  applyCard: ApplyCard;
  officeTodo: ItemStatus[];
  renderOffice: (statuses: ItemStatus[]) => ReactNode;
  /** «שליחת השאלון» בלחיצה אחת — אותו מנוע כמו «להכין» + «לפרסם» (TaxYearProcess). */
  sendMore?: { count: number; run: () => Promise<boolean> };
  prevFacts: YearFact[];
  advancedOpen: boolean;
  onAdvanced: (open: boolean) => void;
}

const he = (iso?: string) => (iso ? `${iso.slice(8, 10)}.${iso.slice(5, 7)}.${iso.slice(0, 4)}` : '');
const ICON: Record<Material['state'], string> = {
  wait: '<circle cx="12" cy="12" r="8"/><path d="M12 8v4l2.5 1.5"/>',
  here: '<path d="M7 3h7l4 4v14H7z"/><path d="M14 3v4h4M9.5 12h5M9.5 15.5h5"/>',
  got: '<path d="M7 3h7l4 4v14H7z"/><path d="M14 3v4h4"/>',
  mine: '<rect x="6" y="3" width="12" height="18" rx="2"/><path d="M9 7h6M9 11h1M12 11h1M9 15h1M12 15h1"/>',
  done: '<path d="M6 12.5l4 4 8-9"/>',
};

export default function WealthWorkspace({ client, step, year, data, busy, run, statuses, applyCard, officeTodo, renderOffice, sendMore, prevFacts, advancedOpen, onAdvanced }: Props) {
  const p = step.payload as unknown as WealthPayload & { taxYear: number };
  const asOf = p.asOfDate ?? `${year}-12-31`;
  const firstName = client.firstName || 'הלקוח';
  const married = client.familyStatus === 'married' || !!client.spouse;
  const spouseName = client.spouseFirstName || client.spouse?.firstName || 'בן/בת הזוג';
  const nameOf = (w: Who) => (w === 'spouse' ? spouseName : w === 'client' ? firstName : 'משותף');

  const asks = data.asks.filter(a => a.parentStepId === step.id && a.state !== 'cancelled');
  const filling = asks.some(a => a.state === 'published' && a.prompt.input.kind !== 'file');
  const sent = asks.length > 0;

  // ── ‼ התשובות נכנסות לבד (כמו בדוח השנתי): עדכון הכרטיס במה שאפשר עד הסוף, ואישור התשובות ──
  const plan = useAutoAccept({ client, facts: data.facts, stepId: step.id, filling, busy, run, applyCard });

  // ‼ תחום שיש לו ישות בכרטיס — «לא» של אחד מבני הזוג אינו «אין» (נכס של הלקוח, «לא» של בת הזוג)
  const onCard = useMemo(() => new Set([(client.properties ?? []).length ? 'wRealEstate' : '', (client.pensionFunds ?? []).length ? 'wFunds' : '',
    (client.investmentAccounts ?? []).length ? 'wSecurities' : '', (client.businesses ?? []).filter(b => !b.isClosed).length ? 'wBusiness' : ''].filter(Boolean)), [client]);
  const out = useMemo(() => computeWealth(data.facts, asOf, p.kind === 'followup' ? { facts: prevFacts, asOf: p.previous?.asOfDate, typedNetWorth: p.previous?.netWorth } : undefined, { onCard }),
    [data.facts, asOf, p.kind, prevFacts, p.previous?.asOfDate, p.previous?.netWorth, onCard]);
  const mats = useMemo(() => materialsOf({ client, year, stepId: step.id, asks: data.asks, evidence: data.evidence, facts: data.facts, statuses }), [client, year, step.id, data, statuses]);
  const notes = asks.filter(a => a.officeNote && !a.noteResolvedAt);
  // ‼ הסכומים לכל סעיף — בגיליון למטה, לא שורה נוספת ב«להשלים»
  const officeRest = [...new Map(officeTodo.filter(s => s.item.kind !== 'document' && !SECTION_KEYS.has(s.item.key)).map(s => [s.item.key, s])).values()];
  const isMine = (m: Material) => m.state === 'here' || m.state === 'mine';
  const sheetOpen = out.missing.length;
  const openExtras = notes.length + plan.needsDecision.length + (officeRest.length ? 1 : 0) + (sheetOpen ? 1 : 0);
  // ‼ בלי מסמכים בכלל (הלקוח ענה «לא» על הכול) — מוכן כשהסכומים רשומים
  const ready = sent && !filling && mats.every(m => m.state === 'done' || m.state === 'got') && openExtras === 0;
  const waiting = mats.filter(m => m.state === 'wait').length;
  const mine = mats.filter(isMine).length + openExtras;

  const [extra, setExtra] = useState<'office' | null>(null);
  const [tab, setTab] = useState<'sum' | '1219'>('sum');
  const [msg, setMsg] = useState<string | null>(null);

  // ── החתימה (300): אותו מנגנון כמו בדוח השנתי ──
  const [signing, setSigning] = useState<Signing | null>(null);
  const refreshSigning = () => loadSigning(step.id).then(setSigning).catch(() => setSigning(null));
  useEffect(() => { void refreshSigning(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [step.id, data]);
  const docsDone = mats.filter(m => m.state === 'done' || m.state === 'got').map(m => ({ title: m.title, who: nameOf(m.who) }));
  const snap = wealthSnapshot(out, { year, clientName: firstName, spouseName: married ? spouseName : undefined, docs: docsDone });
  const changed = !!(signing && snapshotKey(signing.snapshot) !== snapshotKey(snap));
  const pendingNames = signing ? signing.signers.filter(g => !signing.signed[g.role]).map(g => g.name) : [];
  const status0 = !sent ? 'השאלון עוד לא נשלח' : filling ? `${firstName} באמצע השאלון` : ready ? 'הכול מוכן'
    : [waiting ? `ממתין ל-${waiting} מ${firstName}` : '', mine ? `${mine} אצלך` : ''].filter(Boolean).join(' · ') || 'הכול מוכן';
  const status = !signing ? status0 : changed ? 'ההצהרה השתנתה מאז החתימה' : signing.state === 'signed' ? (signing.signers.length > 1 ? 'שניהם חתמו' : 'נחתמה')
    : `נשלחה לחתימה · ממתין ל${pendingNames.join(' ול')}`;
  const send = () => void run(async () => {
    const r = await sendForSigning(step.id, snap, signersOf(client));
    if (!r.ok) { setMsg(signErrorText(r.error)); return r; }
    setMsg(null); await refreshSigning(); return r;
  }, `נשלחה לחתימה — מופיעה בדף של ${firstName}.`);
  // ‼ הקובץ החתום — נבנה מהצילום והחתימות שבשרת ונשמר במסמכים, פעם אחת (עוד שני ניסיונות לבד אם נכשל)
  const storing = useRef(false);
  const [storeTry, setStoreTry] = useState(0);
  useEffect(() => {
    if (!signing || signing.state !== 'signed' || signing.signedDocumentId || storing.current) return;
    storing.current = true;
    let failed = true;
    void (async () => {
      try {
        const { data: u } = await supabase.auth.getUser();
        if (!u.user) return;
        const bytes = await buildSignedSetPdf(signing);
        const sha = await sha256Hex(bytes);
        const path = `${u.user.id}/${client.id}/wdsign-${signing.id}-v${signing.version}`;
        const up = await supabase.storage.from('client-documents').upload(path, new Blob([bytes as BlobPart], { type: 'application/pdf' }), { contentType: 'application/pdf', upsert: true });
        if (up.error) return;
        const r = await storeSigned(signing.id, path, bytes.length, sha);
        if (!r.ok) return;
        failed = false;
        await refreshSigning();
      } catch (e) {
        console.warn('wealth signed set', e);
      } finally {
        storing.current = false;
        if (failed) {
          if (storeTry < 2) window.setTimeout(() => setStoreTry(n => n + 1), 3000);
          else setMsg('הקובץ החתום לא נשמר — ננסה שוב בפתיחה הבאה');
        }
      }
    })();
    /* eslint-disable-next-line react-hooks/exhaustive-deps */
  }, [signing?.id, signing?.state, signing?.signedDocumentId, storeTry]);
  const openSigned = async () => {
    if (!signing?.signedDocumentId) return;
    const f = await loadDocumentFile(signing.signedDocumentId);
    if (f) window.open(f.url, '_blank'); else setMsg('הקובץ לא נטען');
  };

  const head = wealthHeadline(snap);
  const groups: Who[] = married ? ['client', 'spouse', 'home'] : ['client', 'home'];
  const matRow = (m: Material, withName = false) => (
    <div key={m.key} className={`aw-mat is-${m.state}`} data-aw-mat={m.docKind ?? ''} data-state={m.state}>
      <span className="aw-ic" aria-hidden="true" dangerouslySetInnerHTML={{ __html: `<svg viewBox="0 0 24 24">${ICON[m.state]}</svg>` }} />
      <span className="aw-t"><b>{m.title}</b>{withName
        ? <small><span className="aw-who" data-who={m.who}>{nameOf(m.who)}</span>{m.sub && m.sub !== 'אצלך' ? ` · ${m.sub}` : ''}</small>
        : m.sub && <small>{m.sub}</small>}</span>
      {m.state === 'got' && m.evidence?.documentId && <button type="button" className="aw-link" onClick={() => void loadDocumentFile(m.evidence!.documentId!).then(f => f && window.open(f.url, '_blank'))}>צפייה</button>}
      {m.state === 'wait' && <span className="aw-tag">ממתין</span>}
      {m.state === 'done' && <span className="aw-tag is-ok">✓</span>}
    </div>
  );

  return (
    <section className="aw" data-wealth-workspace aria-label={`הצהרת הון ליום ${he(asOf)}`}>
      <header className="aw-top">
        <div className="aw-status"><span data-wd-status>{status}</span>
          <span className="aw-btns">
            {!sent && sendMore && sendMore.count > 0 && <button type="button" className="btn btn-primary" disabled={busy} onClick={() => void sendMore.run()} data-wd-send-q>שליחת השאלון ל{firstName}</button>}
            {sent && sendMore && sendMore.count > 0 && !filling && <button type="button" className="btn btn-ghost" disabled={busy} onClick={() => void sendMore.run()} data-wd-send-more>שליחת {sendMore.count === 1 ? 'שאלה נוספת' : `${sendMore.count} שאלות נוספות`}</button>}
            <button type="button" className={`btn ${ready && (!signing || changed) ? 'btn-ghost' : 'btn-primary'}`} disabled={!ready} onClick={() => printWealthSet(snap)} data-wd-print>הדפסה</button>
            {ready && (!signing || changed) && <button type="button" className="btn btn-primary" disabled={busy} onClick={send} data-wd-send-sign>{signing ? 'שליחה מחדש' : 'שליחה לחתימה'}</button>}
            {signing?.signedDocumentId && !changed && <button type="button" className="btn btn-ghost" onClick={() => void openSigned()} data-wd-signed-file>הקובץ החתום</button>}
          </span>
        </div>
      </header>
      {signing && (
        <div className="aw-signers" data-wd-signing={changed ? 'changed' : signing.state}>
          {signing.signers.map(g => (
            <div key={g.role} className={`aw-signer${signing.signed[g.role] ? ' is-done' : ''}`} data-who={g.role} data-wd-signer={g.role}>
              <i aria-hidden="true">{g.name[0]}</i><b>{g.name}</b>
              <span>{signing.signed[g.role] ? `${g.gender === 'f' ? '✓ חתמה' : '✓ חתם'} · ${new Date(signing.signed[g.role]!).toLocaleDateString('he-IL')}` : 'ממתין'}</span>
            </div>
          ))}
          {changed && <p className="aw-changed" role="note">ההצהרה עודכנה אחרי ש{signing.state === 'signed' ? 'נחתמה' : 'נשלחה לחתימה'}. החתימה הקודמת נשמרת בהיסטוריה.</p>}
        </div>
      )}
      {msg && <p className="aw-msg" role="status">{msg}</p>}

      <div className="aw-grid">
        <section className="aw-mats" aria-labelledby="wd-mats-h">
          <div className="aw-col-h"><h4 id="wd-mats-h">חומרים</h4><small>{sent ? (waiting + mine ? `${waiting + mine} פתוחים` : 'הכול התקבל') : ''}</small></div>
          {!sent && <p className="aw-empty">כשהשאלון יישלח ל{firstName}, המסמכים יופיעו כאן.</p>}
          {sent && (
            <div className="aw-grp aw-minebox" data-who="mine" data-wd-mine={mine}>
              <div className="aw-grp-h"><i aria-hidden="true">✓</i>אצלך{mine ? ` · ${mine}` : ''}</div>
              {!mine && <p className="aw-empty">אין לך מה לעשות כרגע.</p>}
              {mats.filter(isMine).map(m => matRow(m, true))}
              {sheetOpen > 0 && (
                <div className="aw-mat is-mine" data-wd-sheet-todo>
                  <span className="aw-ic" aria-hidden="true" dangerouslySetInnerHTML={{ __html: `<svg viewBox="0 0 24 24">${ICON.mine}</svg>` }} />
                  <span className="aw-t"><b>סכומים ליום ההצהרה · {sheetOpen}</b><small>{out.missing.slice(0, 3).map(s => s.label).join(' · ')}{sheetOpen > 3 ? ` ועוד ${sheetOpen - 3}` : ''}</small></span>
                  <a className="aw-act" href="#wd-sheet">לרשום</a>
                </div>
              )}
              {notes.map(a => (
                <div key={a.id} className="aw-mat is-mine" data-aw-hint>
                  <span className="aw-ic" aria-hidden="true" dangerouslySetInnerHTML={{ __html: `<svg viewBox="0 0 24 24">${ICON.mine}</svg>` }} />
                  <span className="aw-t"><b>«{a.officeNote}»</b><small>{a.prompt.subjectName ?? firstName}</small></span>
                  <button type="button" className="aw-act" disabled={busy} onClick={() => void run(() => tyApi.resolveNote(a.id), 'סומן שנסגר')}>סגור</button>
                </div>
              ))}
              {officeRest.length > 0 && (
                <div className="aw-mat is-mine" data-wd-office-rest>
                  <span className="aw-ic" aria-hidden="true" dangerouslySetInnerHTML={{ __html: `<svg viewBox="0 0 24 24">${ICON.mine}</svg>` }} />
                  <span className="aw-t"><b>להשלים במשרד{officeRest.length > 1 ? ` · ${officeRest.length}` : ''}</b><small>{officeRest.slice(0, 2).map(s => s.item.label).join(' · ')}{officeRest.length > 2 ? ` ועוד ${officeRest.length - 2}` : ''}</small></span>
                  <button type="button" className="aw-act" onClick={() => setExtra(extra === 'office' ? null : 'office')} aria-expanded={extra === 'office'}>להשלים</button>
                </div>
              )}
              {officeRest.length > 0 && extra === 'office' && <div className="aw-inline">{renderOffice(officeRest)}</div>}
              {plan.needsDecision.map(({ fact, plan: pl }) => (
                <div key={fact.id} className="aw-mat is-mine" data-aw-decide>
                  <span className="aw-ic" aria-hidden="true" dangerouslySetInnerHTML={{ __html: `<svg viewBox="0 0 24 24">${ICON.mine}</svg>` }} />
                  <span className="aw-t"><b>שינוי בכרטיס</b><small>{pl.lines[0] ?? 'צריך החלטה לפני העדכון בתיק'}</small></span>
                  <button type="button" className="aw-link" onClick={() => onAdvanced(true)}>להחליט</button>
                </div>
              ))}
            </div>
          )}
          {groups.map(w => {
            const list = mats.filter(m => m.who === w && !isMine(m));
            if (!list.length) return null;
            return (
              <div key={w} className="aw-grp" data-who={w}>
                <div className="aw-grp-h"><i aria-hidden="true">{w === 'home' ? '✱' : nameOf(w)[0]}</i>{nameOf(w)}</div>
                {list.map(m => matRow(m))}
              </div>
            );
          })}
          <button type="button" className="aw-link" onClick={() => onAdvanced(!advancedOpen)} aria-expanded={advancedOpen} data-wd-advanced>{advancedOpen ? 'סגירת כלים מתקדמים' : 'כלים מתקדמים (מועדים, בסיס רישום, השמטות)'}</button>
        </section>

        <section className="aw-rep" aria-labelledby="wd-rep-h">
          <div className="aw-col-h"><h4 id="wd-rep-h">ההצהרה</h4><small>ליום {he(asOf)} · {p.kind === 'followup' ? 'הצהרת המשך' : 'הצהרה ראשונה'}</small></div>
          <div className="aw-card">
            <div className="aw-rep-top">
              <div className="aw-est"><small>הון נטו</small><b data-wd-net>{head.net}</b>{head.change && <small data-wd-change>{head.change}</small>}</div>
            </div>
            <div className="aw-tabs" role="tablist" aria-label="ההצהרה">
              <button type="button" role="tab" aria-selected={tab === 'sum'} onClick={() => setTab('sum')}>סיכום</button>
              <button type="button" role="tab" aria-selected={tab === '1219'} onClick={() => setTab('1219')} data-wd-tab="1219">1219</button>
            </div>
            {tab === 'sum' ? <WealthSummary d={snap} /> : <WealthFormView d={snap} />}
          </div>
          <SectionSheet sections={out.sections} busy={busy} onSave={(sec, amount) => run(() => tyApi.recordFact(client.id, {
            taxYear: year, itemKey: sec.itemKey, subjectRole: 'couple', periodKind: 'as_of', periodTo: asOf,
            answer: amount === 0 ? 'zero' : 'value', value: amount === 0 ? undefined : amount, basis: 'actual', requestId: step.id,
          } as never), 'נשמר')} />
        </section>
      </div>
    </section>
  );
}

/** הגיליון: סכום אחד לכל סעיף, ליום ההצהרה. ריק = חסר; 0 = «אין». «אין» מתשובת הלקוח — כבר רשום. */
function SectionSheet({ sections, busy, onSave }: { sections: SectionValue[]; busy: boolean; onSave: (s: SectionValue, amount: number) => Promise<boolean> }) {
  const [vals, setVals] = useState<Record<string, string>>({});
  const [edit, setEdit] = useState<Record<string, boolean>>({});
  return (
    <div className="wd-sheet" id="wd-sheet" data-wd-sheet>
      {sections.map(s => {
        const has = s.amount !== null && !edit[s.code];
        const v = vals[s.code] ?? '';
        const num = Number(v.replace(/[^\d.]/g, ''));
        return (
          <div key={s.code} className={`wd-sec${has ? ' is-done' : ''}`} data-wd-sec={s.code}>
            <span className="c">{/^\d+$/.test(s.code) ? s.code : ''}</span>
            <span className="l">{s.label}{s.byClient && <small>{'הלקוח ענה «לא»'}</small>}</span>
            {has ? (
              <>
                <span className="v">{s.none ? 'אין' : `${Math.round(s.amount!).toLocaleString('he-IL')} ₪`}</span>
                <button type="button" className="aw-link" onClick={() => setEdit(e => ({ ...e, [s.code]: true }))}>תיקון</button>
              </>
            ) : (
              <>
                <input inputMode="decimal" aria-label={`${s.label} — סכום ליום ההצהרה`} value={v} placeholder="₪"
                  onChange={e => setVals(x => ({ ...x, [s.code]: e.target.value }))} />
                <button type="button" className="aw-act" disabled={busy || !v.trim() || !Number.isFinite(num)} data-wd-save
                  onClick={() => void onSave(s, Math.round(num)).then(ok => { if (ok) { setEdit(e => ({ ...e, [s.code]: false })); setVals(x => ({ ...x, [s.code]: '' })); } })}>שמירה</button>
                <button type="button" className="aw-link" disabled={busy} data-wd-none
                  onClick={() => void onSave(s, 0).then(ok => { if (ok) setEdit(e => ({ ...e, [s.code]: false })); })}>אין</button>
              </>
            )}
          </div>
        );
      })}
    </div>
  );
}

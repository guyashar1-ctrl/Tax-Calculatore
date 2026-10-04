// מפת הביצוע של מסלול: רגעים לפי הסדר האמיתי (מ«נפתח», לא ממיקום ברשימה),
// השלבים של כל רגע זה לצד זה, ומה יוצא ללקוח באותו רגע.
// בראש: «מה מקבל» — סוג לקוח או לקוח לדוגמה; מה שלא ייפתח לו מעומעם, עם הסיבה.
// ‼ «במקביל» רק למה שיכול להיפתח לאותו לקוח. ענפים שסותרים זה את זה (עוסק פטור
// מול חברה) הם חלופות — «או» — ונספרים כמסלול אחד (momentLanes).
import type { ReactNode } from 'react';
import type { FlowIssue } from '../../../features/flows/compile';
import type { Verdict } from '../../../features/flows/conditions';
import {
  LENS_KINDS, SAMPLE_FACTS, detachedMoments, lanePartners, momentLanes, type Lens, type Moment,
} from '../../../features/flows/preview';
import type { FlowDefinition, FlowItem, FlowStage, FlowTrigger, Opens } from '../../../features/flows/types';
import { CLIENT_KIND_LABELS } from '../../../types/journeyDefaults';
import type { RequestTemplate } from '../../../lib/requestTemplates';
import StageCard from './StageCard';
import { FlIcon } from './ui';
import type { MailEntry, MomentMail, PersonalConfirm } from './model';

const quoted = (xs: string[]) => xs.map(x => `«${x}»`).join(', ');
/**
 * כשהמייל מכסה יותר משלב אחד — אחרת null. ‼ בלי מספר: ענף של סוג אחר (עוסק פטור / חברה)
 * לא נפתח לאותו לקוח, ו«על שני השלבים» לא היה נכון לכל לקוח.
 */
const severalStages = (es: MailEntry[]) => (new Set(es.map(e => e.stageKey)).size < 2 ? null : 'כל השלבים שנפתחים לו כאן');

export function LensBar({ lens, onLens, summary }: { lens: Lens; onLens: (l: Lens) => void; summary: ReactNode }) {
  const chip = (on: boolean, label: string, next: Lens) => (
    <button key={label} type="button" className={`fl-toggle is-sm${on ? ' is-on' : ''}`} aria-pressed={on} onClick={() => onLens(next)}>{label}</button>
  );
  return (
    <div className="fl-lens" role="group" aria-label="מה מקבל כל סוג לקוח">
      <div className="fl-lens-row">
        <span className="fl-lens-l">מה מקבל:</span>
        <div className="fl-lens-chips">
          {chip(lens.t === 'all', 'כולם', { t: 'all' })}
          {LENS_KINDS.map(k => chip(lens.t === 'kind' && lens.kind === k, CLIENT_KIND_LABELS[k], { t: 'kind', kind: k }))}
          {chip(lens.t === 'sample', 'לקוח לדוגמה', { t: 'sample', i: lens.t === 'sample' ? lens.i : 0 })}
        </div>
      </div>
      {lens.t === 'sample' && (
        <label className="fl-lens-sample">
          <span className="fl-sr">לקוח לדוגמה</span>
          <select value={lens.i} onChange={e => onLens({ t: 'sample', i: Number(e.target.value) })}>
            {SAMPLE_FACTS.map((s, i) => <option key={s.label} value={i}>{s.label}</option>)}
          </select>
        </label>
      )}
      <p className="fl-lens-sum">{summary}</p>
    </div>
  );
}

/**
 * מה יוצא ללקוח ברגע הזה — רק מה שכרטיס השלב לא אומר. ‼ (4.10.2026) כרטיס השלב כבר
 * אומר «איך מגיע» והפריטים שבו; כאן לא חוזרים על שמות הפריטים — רק כשיש ברגע כמה
 * שלבים שמגיעים ללקוח, או כמה דרכים (שני מיילים), אומרים כמה מיילים יוצאים ומתי.
 * ‼ שלב «מייל אוטומטי» ושלב «מייל כשתשלח» באותו רגע הם שני מיילים נפרדים (214:
 * _client_notice_items — במייל שיוצא לבד רק פריטים של שלבי «לבד» כחדשים); המייל
 * האוטומטי מזכיר את השאר תחת «ועוד דברים שממתינים לכם בדף», בלי לסמן אותו כנשלח.
 * ‼ מה שיש לו מייל משלו (ייצוג, שאלון…) — רק כאן, בשמו: הכרטיס לא אומר את זה.
 */
export function MomentMailLine({ mail, onPreview }: { mail: MomentMail; onPreview: () => void }) {
  const { approve, auto, hold, own } = mail;
  const hasMail = approve.length > 0 || auto.length > 0 || hold.length > 0;
  if (!hasMail && !own.length) return null;
  const two = approve.length > 0 && auto.length > 0;
  // מייל אחד על כמה שלבים — אומרים את זה פעם אחת כאן (כל כרטיס אומר רק את שלו).
  const autoMany = two ? null : severalStages(auto);
  const approveMany = two ? null : severalStages(approve);
  const holdBeside = hold.length > 0 && (approve.length > 0 || auto.length > 0);
  return (
    <div className="fl-mail">
      {two && (
        <>
          <p className="fl-mail-h"><FlIcon name="mail" size={14} /><span><b>שני מיילים ללקוח ברגע הזה</b>:</span></p>
          <p className="is-auto is-sub"><span>
            <b>אחד יוצא לבד</b> תוך כמה דקות — עם מה שנפתח לבד; שאר מה שבדף רק מוזכר בו. עד שהוא יוצא אפשר ללחוץ «אל תשלח לבד» בכרטיס הלקוח.
          </span></p>
          <p className="is-sub"><span><b>השני מחכה לך</b> ויוצא כשתלחץ «שלח מייל…» בכרטיס הלקוח.</span></p>
        </>
      )}
      {autoMany && (
        <p className="is-auto"><FlIcon name="mail" size={14} /><span>
          <b>מייל אחד יוצא לבד</b> על {autoMany}, תוך כמה דקות. עד שהוא יוצא אפשר ללחוץ «אל תשלח לבד» בכרטיס הלקוח.
        </span></p>
      )}
      {approveMany && (
        <p><FlIcon name="mail" size={14} /><span>
          <b>מייל אחד ללקוח</b> על {approveMany} — יוצא כשתלחץ «שלח מייל…» בכרטיס הלקוח.
        </span></p>
      )}
      {holdBeside && (
        <p><FlIcon name="clock" size={14} /><span>
          מה שמחכה לאישורך — לא בדף ולא במייל עד «פרסם בדף» בכרטיס הלקוח.
        </span></p>
      )}
      {own.length > 0 && (
        <p className="is-quiet"><span>{own.map(e => e.title).join(' · ')} — {own.length === 1 ? 'נשלחת' : 'נשלחות'} במייל נפרד, לא בתוך המייל המרוכז.</span></p>
      )}
      {hasMail && (
        <button type="button" className="fl-link" onClick={onPreview}><FlIcon name="eye" size={14} /> {two ? 'איך ייראו המיילים' : 'איך ייראה המייל'}</button>
      )}
    </div>
  );
}

export default function FlowMap({ def, trigger, moments, title, titleOf, templates, verdict, stageVerdict, lensActive, lensLabel,
  notCreated, issues, flash, mailOf, personalConfirm, onJump, onOpenItem, onOpenStage, onAdd, onAddStage, onPreview, mapRef }: {
  def: FlowDefinition;
  trigger: FlowTrigger;
  moments: Moment[];
  title: (i: FlowItem) => string;
  titleOf: (itemKey: string) => string;
  templates: RequestTemplate[];
  verdict: (s: FlowStage, i: FlowItem) => Verdict;
  stageVerdict: (s: FlowStage) => Verdict;
  lensActive: boolean;
  lensLabel: string;
  notCreated: ReadonlyMap<string, string>;
  issues: FlowIssue[];
  flash: string | null;
  mailOf: (m: Moment) => MomentMail;
  /** מה נפתח לבן/בת הזוג בפריט «גם לבן/בת הזוג» (personalConfirmOf). */
  personalConfirm?: (i: FlowItem) => PersonalConfirm;
  onJump: (stageKey: string) => void;
  onOpenItem: (itemKey: string) => void;
  onOpenStage: (stageKey: string) => void;
  onAdd: (stageKey: string) => void;
  onAddStage: (opens: Opens) => void;
  onPreview: (m: Moment) => void;
  mapRef: React.Ref<HTMLDivElement>;
}) {
  const byKey = new Map(def.stages.map(s => [s.key, s]));
  const detached = detachedMoments(moments);
  // שלב שלא ייפתח לסוג שנבחר (או שאין בו כלום שייפתח) — לא נספר ב«במקביל».
  const stageOff = (s: FlowStage) => lensActive && (stageVerdict(s).state === 'off'
    || (s.items.length > 0 && s.items.every(i => notCreated.has(i.key) || verdict(s, i).state === 'off')));

  const card = (s: FlowStage, mixedAuto: boolean) => (
    <StageCard key={s.key} trigger={trigger} stage={s} title={title} titleOf={titleOf} templates={templates}
      verdict={i => verdict(s, i)} stageVerdict={stageVerdict(s)} lensActive={lensActive} lensLabel={lensLabel}
      notCreated={notCreated} issues={issues} flash={flash === s.key} mixedAutoMail={mixedAuto} personalConfirm={personalConfirm}
      onOpenItem={onOpenItem} onOpenStage={() => onOpenStage(s.key)} onAdd={() => onAdd(s.key)} />
  );

  return (
    <div className="fl-map" ref={mapRef}>
      {moments.map((m, mi) => {
        const stages = m.stageKeys.map(k => byKey.get(k)).filter(Boolean) as FlowStage[];
        const lanes = momentLanes(stages);
        const live = lanes.filter(l => l.stageKeys.some(k => !stageOff(byKey.get(k)!))).length;
        const mail = mailOf(m);
        const mixed = mail.approve.length > 0 && mail.auto.length > 0;
        const w = m.waitsFor;
        const prev = mi > 0 ? moments[mi - 1].stageKeys.map(k => byKey.get(k)?.name ?? '') : [];
        const nextDetached = mi + 1 < moments.length && detached.has(moments[mi + 1].key);
        return (
          <section key={m.key} className={`fl-moment${nextDetached ? ' is-before-detached' : ''}`} aria-label={m.label}>
            <header className="fl-moment-head">
              <span className="fl-moment-dot" aria-hidden="true" />
              <h3 className="fl-moment-title">
                {/* ‼ אותו ניסוח בכל המסכים (flowMoments, הכרטיס): «אחרי שהשלב «X» הושלם» / «אחרי שהבקשה «X» הושלמה». */}
                {m.opens.after === 'start' || !w ? m.label : m.opens.after === 'stage' ? (
                  // ‼ המירכאות בתוך הכפתור, וה«שהשלב» צמוד אליו — בלי זה «» נשאר לבד בסוף שורה ב-360.
                  <>אחרי <span className="fl-nb">שהשלב <button type="button" className="fl-jump" onClick={() => onJump(w.stageKey)}>«{w.name}»</button></span> הושלם</>
                ) : (
                  <>אחרי שהבקשה «{w.itemKey ? titleOf(w.itemKey) : ''}» הושלמה
                    <span className="fl-moment-in"> · בשלב <button type="button" className="fl-jump" onClick={() => onJump(w.stageKey)}>«{w.name}»</button></span></>
                )}
              </h3>
              {live > 1 && <span className="fl-moment-par">{live} שלבים במקביל</span>}
              {detached.has(m.key) && (
                <span className="fl-moment-detached">{prev.length <= 2 ? `לא מחכה ל${quoted(prev)}` : 'לא מחכה לרגע הקודם'}</span>
              )}
              <button type="button" className="fl-link fl-moment-add" onClick={() => onAddStage(m.opens)}>
                <FlIcon name="plus" size={13} /> שלב במקביל
              </button>
            </header>
            <ol className="fl-moment-stages" data-lanes={Math.min(lanes.length, 3)}>
              {lanes.map((l, li) => {
                const partners = lanePartners(stages, lanes, li);
                const members = l.stageKeys.map(k => byKey.get(k)!).filter(Boolean);
                return (
                  <li key={l.stageKeys[0]} className={`fl-lane${l.alt ? ' is-alt' : ''}`}>
                    {partners.length > 0 && (
                      <div className="fl-par-mark">במקביל ל{partners.map(ns => ns.map(x => `«${x}»`).join(' או ')).join(', ')}</div>
                    )}
                    {l.alt ? (
                      <>
                        <p className="fl-alt-h">
                          <FlIcon name="branch" size={13} />
                          {/* ‼ «לכל היותר»: לקוח שאינו מאף אחד מהסוגים (החזר מס, ייצוג בלבד) לא מקבל אף אחד מהם. */}
                          <span>{l.byKind ? 'לפי סוג הלקוח' : 'לפי מה שידוע על הלקוח'} — לכל לקוח לכל היותר אחד מאלה</span>
                        </p>
                        <div className="fl-alt-list">
                          {members.map((s, k) => (
                            <div key={s.key} className="fl-alt-item">
                              {k > 0 && <div className="fl-or" aria-hidden="true"><span>או</span></div>}
                              {card(s, mixed && s.delivery === 'auto')}
                            </div>
                          ))}
                        </div>
                      </>
                    ) : card(members[0], mixed && members[0].delivery === 'auto')}
                  </li>
                );
              })}
            </ol>
            <MomentMailLine mail={mail} onPreview={() => onPreview(m)} />
          </section>
        );
      })}
    </div>
  );
}

// ─── «תהליכים» · ניהול המשרד ─────────────────────────────────────────────────
// עונה על «ממה מורכב התהליך הזה?» לכל תהליך משמעותי במערכת (M2): מה מתחיל
// אותו, השלבים בסדרם, מי פועל, מה מותנה ולמה, מה נדרש, מה אפשר לדחות, ומה זה
// «הסתיים». תיאור ההגדרה — לא מצב של לקוח מסוים (זה חי בכרטיס הלקוח).
//
// ‼ המסך קורא מ-lib/processCatalog.ts. הוא אינו מגדיר ואינו מפעיל דבר; מה
//   שהמשרד כן יכול להגדיר מקושר למקטע שבו זה נעשה.
// ‼ חשיפה הדרגתית: ברירת המחדל — שם, שלבים ומשפט לכל שלב. פתיחת שלב מציגה
//   דרישות, חסימות, דחיות, תתי-שלבים ומה זה הושלם.

import { useMemo, useState } from 'react';
import { PROCESS_CATALOG, NOT_A_PROCESS, processByKey } from '../../lib/processCatalog';
import {
  ACTOR_LABELS, PROCESS_GROUP_LABELS, numberStages,
  type OfficeSectionId, type ProcessDefinition, type ProcessGroup, type ProcessStage,
} from '../../lib/processDefinition';
import { CLIENT_KIND_LABELS, CLIENT_KIND_ORDER } from '../../types/journeyDefaults';
import { useJourneyDefaults } from '../../hooks/useJourneyDefaults';
import type { FirmProfile } from '../../types/firmProfile';
import './processCatalog.css';

interface Props {
  profile: FirmProfile;
  /** קפיצה למקטע שבו מגדירים את הדבר. */
  onOpenSection?: (id: OfficeSectionId) => void;
  /** התהליך שנפתח תחילה (למשל מהכפתור במקטע «ייצוג»). */
  initialKey?: string;
}

const GROUP_ORDER: ProcessGroup[] = ['journey', 'requests', 'internal'];

const CLASSIFICATION_LABEL: Record<ProcessDefinition['classification'], string> = {
  multi_stage: 'תהליך רב-שלבי',
  single_step: 'בקשה בודדת',
  sub_process: 'חלק מתהליך',
  internal: 'עבודה פנימית',
};

const SECTION_LABEL: Record<OfficeSectionId, string> = {
  representation: 'ייצוג',
  requestDefaults: 'בקשות מסמכים',
  paperless: 'פייפרלס ותקשורת',
  quotations: 'הצעות מחיר',
  clientDocs: 'מסמכים ללקוחות',
};

function Chevron() {
  return (
    <svg className="pc-chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M6 9l6 6 6-6" />
    </svg>
  );
}

function Actor({ actor }: { actor: ProcessStage['actor'] }) {
  return <span className={`pc-actor is-${actor}`}>{ACTOR_LABELS[actor]}</span>;
}

/** «מופיע כש…» — נאמר תמיד על שלב מותנה/רשות, בלי לחייב פתיחה. */
function When({ stage }: { stage: ProcessStage }) {
  if (!stage.when) return null;
  const optional = stage.kind === 'optional';
  return <div className={`pc-when${optional ? ' is-optional' : ''}`}>{optional ? 'אופציונלי · ' : ''}{stage.when}</div>;
}

function KindTag({ stage, onOpenSection }: { stage: ProcessStage; onOpenSection?: (id: OfficeSectionId) => void }) {
  const kind = stage.kind ?? 'fixed';
  if (kind === 'fixed' && !stage.configureIn) return <div className="pc-kind-tag">שלב קבוע בתהליך - אין מה להגדיר.</div>;
  const parts: string[] = [];
  if (kind === 'fixed') parts.push('שלב קבוע');
  if (kind === 'conditional') parts.push('שלב מותנה');
  if (kind === 'optional') parts.push('שלב רשות');
  if (kind === 'configurable') parts.push('ניתן להגדרה');
  return (
    <div className="pc-kind-tag">
      {parts.join(' · ')}
      {stage.configureIn && (
        <>
          {' · '}מגדירים ב
          {onOpenSection
            ? <button type="button" onClick={() => onOpenSection(stage.configureIn!)}>«{SECTION_LABEL[stage.configureIn]}»</button>
            : <>«{SECTION_LABEL[stage.configureIn]}»</>}
        </>
      )}
    </div>
  );
}

function StageDetails({ stage, onOpenSection }: { stage: ProcessStage; onOpenSection?: (id: OfficeSectionId) => void }) {
  return (
    <div className="pc-stage-body">
      {stage.requires?.length ? (
        <div className="pc-detail"><b>מה נדרש:</b><ul>{stage.requires.map(r => <li key={r}>{r}</li>)}</ul></div>
      ) : null}
      {stage.blocks && <div className="pc-detail"><b>מה יכול לתקוע:</b> {stage.blocks}</div>}
      {stage.deferrable && <div className="pc-detail"><b>אפשר לדחות:</b> {stage.deferrable}</div>}
      {stage.substages?.length ? (
        <div className="pc-sub">
          {stage.substages.map(s => (
            <div key={s.key}>
              <div className="pc-sub-title">{s.title}<Actor actor={s.actor} /></div>
              <div className="pc-detail">{s.what}</div>
              <When stage={s} />
              {s.deferrable && <div className="pc-detail"><b>אפשר לדחות:</b> {s.deferrable}</div>}
            </div>
          ))}
        </div>
      ) : null}
      {stage.done && <div className="pc-detail"><b>הושלם פירושו:</b> {stage.done}</div>}
      <KindTag stage={stage} onOpenSection={onOpenSection} />
    </div>
  );
}

/**
 * לפייפרלס: מה ברירת המחדל של המשרד לכל סוג לקוח — קריאה מהנתון האמיתי
 * (office_journey_defaults), לא תיאור. מראה איזה מארבעת השלבים נולד.
 */
function PaperlessDefaultsStrip({ profile, def }: { profile: FirmProfile; def: ProcessDefinition }) {
  const { byKind, loading } = useJourneyDefaults(profile.id);
  const types = def.stages.map(s => s.stepType).filter((t): t is NonNullable<typeof t> => !!t);
  if (loading) return null;
  const kinds = CLIENT_KIND_ORDER.filter(k => (byKind[k]?.length ?? 0) > 0);
  if (kinds.length === 0) return null;
  return (
    <div className="pc-detail" style={{ marginTop: 14 }}>
      <b>בברירת המחדל של המשרד היום</b> — אילו מהשלבים נולדים לכל סוג לקוח (בכפוף לתנאים שלמעלה):
      {kinds.map(k => {
        const enabled = new Set((byKind[k] ?? []).filter(e => e.enabled).map(e => e.stepType));
        return (
          <div key={k} className="pc-kinds">
            <span className="pc-kind-pill" style={{ borderStyle: 'none', paddingInlineStart: 0 }}>{CLIENT_KIND_LABELS[k]}:</span>
            {types.map(t => (
              <span key={t} className={`pc-kind-pill ${enabled.has(t) ? 'is-on' : 'is-off'}`}>
                {def.stages.find(s => s.stepType === t)?.title}
              </span>
            ))}
          </div>
        );
      })}
    </div>
  );
}

function ProcessView({ def, profile, onOpenSection, onSelect }: {
  def: ProcessDefinition; profile: FirmProfile;
  onOpenSection?: (id: OfficeSectionId) => void; onSelect: (key: string) => void;
}) {
  const [open, setOpen] = useState<Set<string>>(new Set());
  const numbered = useMemo(() => numberStages(def.stages), [def]);
  const parent = def.parentKey ? processByKey(def.parentKey) : undefined;
  const single = def.classification === 'single_step';
  const children = PROCESS_CATALOG.filter(p => p.parentKey === def.key);

  function toggle(key: string) {
    setOpen(prev => { const n = new Set(prev); n.has(key) ? n.delete(key) : n.add(key); return n; });
  }

  return (
    <div className="pc-def" key={def.key}>
      <div className="pc-head">
        <div className="pc-kind">
          {CLASSIFICATION_LABEL[def.classification]}
          {parent && <span className="pc-parent">· חלק מ<button type="button" onClick={() => onSelect(parent.key)}>{parent.name}</button></span>}
        </div>
        <div className="pc-name">{def.name}</div>
        <div className="pc-purpose">{def.purpose}</div>
      </div>

      <dl className="pc-facts">
        <dt>מה מתחיל</dt><dd>{def.trigger}</dd>
        {def.when && <><dt>מתי נוצר</dt><dd>{def.when}</dd></>}
        <dt>מי פועל</dt>
        <dd>{Array.from(new Set(def.stages.map(s => s.actor))).map(a => ACTOR_LABELS[a]).join(' · ')}</dd>
      </dl>

      <div className="pc-stages">
        <div className="pc-stages-label">{single ? 'מה מבקשים' : 'השלבים, בסדרם'}</div>
        {numbered.map(({ stage, n }) => {
          const isOpen = open.has(stage.key) || single;
          return (
            <section key={stage.key} className={`pc-stage${isOpen ? ' is-open' : ''}${stage.parallel ? ' is-parallel' : ''}`}>
              <button type="button" className="pc-stage-head" aria-expanded={isOpen} onClick={() => !single && toggle(stage.key)}>
                <span className={`pc-stage-num${stage.parallel ? ' is-parallel' : ''}`} aria-hidden="true">{n ?? '∥'}</span>
                <span className="pc-stage-main">
                  <span className="pc-stage-title">{stage.title}</span>
                  <div className="pc-stage-what">{stage.what}</div>
                  <When stage={stage} />
                </span>
                <Actor actor={stage.actor} />
                {!single && <Chevron />}
              </button>
              {isOpen && <StageDetails stage={stage} onOpenSection={onOpenSection} />}
            </section>
          );
        })}
      </div>

      {def.key === 'paperless' && <PaperlessDefaultsStrip profile={profile} def={def} />}

      <div className="pc-done"><b>הסתיים כש…</b> {def.completion}</div>

      <div className="pc-foot">
        <div>איפה זה חי: {def.source}</div>
        {def.configurable && (
          <div>
            מה המשרד מגדיר: {def.configurable.text}
            {onOpenSection && <> <button type="button" onClick={() => onOpenSection(def.configurable!.section)}>למקטע «{SECTION_LABEL[def.configurable.section]}» ←</button></>}
          </div>
        )}
        {children.length > 0 && (
          <div>
            תהליכי משנה: {children.map((c, i) => (
              <span key={c.key}>{i > 0 && ' · '}<button type="button" onClick={() => onSelect(c.key)}>{c.name}</button></span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default function ProcessCatalogSection({ profile, onOpenSection, initialKey }: Props) {
  const [selected, setSelected] = useState<string>(
    initialKey && processByKey(initialKey) ? initialKey : PROCESS_CATALOG[0].key);
  const def = processByKey(selected) ?? PROCESS_CATALOG[0];

  return (
    <>
      <div className="rs-intro">
        <div className="rs-title">תהליכים</div>
        <div className="rs-lead">
          ממה מורכב כל תהליך מול הלקוח: מה מתחיל אותו, השלבים בסדרם, מי פועל בכל שלב, מה מותנה ולמה, ומה פירוש «הסתיים».
          זו ההגדרה; איפה לקוח מסוים עומד — בכרטיס שלו.
        </div>
      </div>

      <div className="pc-layout">
        <nav className="pc-list" aria-label="תהליכים">
          {GROUP_ORDER.map(g => {
            const items = PROCESS_CATALOG.filter(p => p.group === g);
            if (items.length === 0) return null;
            return (
              <div key={g} style={{ display: 'contents' }}>
                <div className="pc-group">{PROCESS_GROUP_LABELS[g]}</div>
                {items.map(p => (
                  <button key={p.key} type="button"
                    className={`pc-item${p.key === def.key ? ' is-active' : ''}`}
                    aria-current={p.key === def.key ? 'page' : undefined}
                    onClick={() => setSelected(p.key)}>
                    {p.parentKey && <span className="pc-sub-mark" aria-hidden="true">↳</span>}
                    {p.name}
                  </button>
                ))}
              </div>
            );
          })}
        </nav>

        <ProcessView def={def} profile={profile} onOpenSection={onOpenSection} onSelect={setSelected} />
      </div>

      <details className="pc-not">
        <summary>מה בכוונה אינו ברשימה</summary>
        <ul>
          {NOT_A_PROCESS.map(x => <li key={x.what}><b>{x.what}</b> — {x.why}</li>)}
        </ul>
      </details>
    </>
  );
}

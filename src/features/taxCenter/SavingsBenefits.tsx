import {
  SAVINGS_TRACKS,
  SAVINGS_DATA_YEAR,
  BENEFIT_KIND_META,
  BenefitBlock,
  SavingsTrack,
} from '../../data/savingsBenefits';

interface Props {
  year: number;
  /** פתיחת נושא ההוצאה המקביל במאגר "הוצאות מוכרות" */
  onOpenExpenseTopic: (topicId: string) => void;
}

const BASIS_NOTE: Record<BenefitBlock['basis'], string | null> = {
  sourced: null,
  derived: 'סכום מחושב — לא תקרה אוניברסלית',
  needsCheck: 'לאימות לפני הסתמכות',
};

function Block({ block }: { block: BenefitBlock }) {
  const meta = BENEFIT_KIND_META[block.kind];
  const basisNote = BASIS_NOTE[block.basis];

  return (
    <article className={`sv-block sv-block-${block.kind}`}>
      <div className="sv-block-head">
        <span className={`sv-kind sv-kind-${block.kind}`}>{meta.label}</span>
        <span className="sv-block-title">{block.title}</span>
      </div>
      <div className="sv-effect">{meta.effect}</div>

      <p className="sv-plain">{block.plain}</p>

      <div className="sv-figures">
        <div className="sv-fig">
          <div className="sv-fig-label">השיעור</div>
          <div className="sv-fig-value">{block.rate}</div>
        </div>
        {block.ceiling && (
          <div className="sv-fig">
            <div className="sv-fig-label">התקרה / הסכום</div>
            <div className="sv-fig-value">{block.ceiling}</div>
          </div>
        )}
      </div>

      {(block.ceilingNote || basisNote) && (
        <div className="sv-caution">
          {basisNote && <span className="sv-basis">{basisNote}</span>}
          {block.ceilingNote}
        </div>
      )}

      {(block.caveats.length > 0 || block.legalBasis) && (
        <details className="sv-more">
          <summary>תנאים וסייגים{block.caveats.length ? ` (${block.caveats.length})` : ''}</summary>
          <div className="sv-more-body">
            {block.legalBasis && (
              <div className="sv-basis-law"><span className="ed-lead">בסיס חוקי: </span>{block.legalBasis}</div>
            )}
            <ul className="ed-bullets">
              {block.caveats.map((c, i) => <li key={i}>{c}</li>)}
            </ul>
          </div>
        </details>
      )}
    </article>
  );
}

function Track({ track, onOpenExpenseTopic }: { track: SavingsTrack; onOpenExpenseTopic: (id: string) => void }) {
  return (
    <section className="sv-track">
      <header className="sv-track-head">
        <div className="sv-track-title-row">
          <span className="sv-track-icon">{track.icon}</span>
          <h2 className="sv-track-title">{track.title}</h2>
        </div>
        <p className="sv-track-lead">{track.lead}</p>
        <p className="sv-track-note">{track.notAnExpense}</p>
      </header>

      {/* ההבחנה שאסור לפספס — הכרטיס הצבוע היחיד בכל מסלול */}
      <div className="sv-key">
        <div className="sv-key-title">{track.keyDistinction.title}</div>
        <p className="sv-key-text">{track.keyDistinction.text}</p>
      </div>

      <div className="sv-blocks">
        {track.blocks.map(b => <Block key={b.kind + b.title} block={b} />)}
      </div>

      <div className="sv-track-foot">
        <button type="button" className="bk-link" onClick={() => onOpenExpenseTopic(track.expenseTopicId)}>
          הדין המלא, המקורות והדוגמאות — בכרטיס ההוצאה ←
        </button>
        <span className="sv-sources">
          מקורות: {track.sources.map((s, i) => (
            <span key={s.url}>
              {i > 0 && ' · '}
              <a href={s.url} target="_blank" rel="noreferrer">{s.label}</a>
            </span>
          ))}
        </span>
      </div>
    </section>
  );
}

export default function SavingsBenefits({ year, onOpenExpenseTopic }: Props) {
  return (
    <div className="sv-page">
      {year !== SAVINGS_DATA_YEAR && (
        <div className="alert alert-warning">
          כל הסכומים במסך הזה שייכים לשנת המס {SAVINGS_DATA_YEAR}. לשנת {year} טרם אומתו ערכים במאגר —
          אין להסתמך על המספרים כאן לשנה שנבחרה.
        </div>
      )}

      {/* המקרא — קודם המנגנונים, אחר כך המספרים. בלעדיו כל הסכומים
          נקראים כאותו סוג של הטבה, וזו בדיוק הטעות שהמסך בא למנוע. */}
      <section className="sv-legend">
        <div className="sv-legend-title">שלושה מנגנונים שונים — לא להחליף ביניהם</div>
        <div className="sv-legend-items">
          {(['deduction', 'credit', 'capitalGains'] as const).map(k => (
            <div key={k} className="sv-legend-item">
              <span className={`sv-kind sv-kind-${k}`}>{BENEFIT_KIND_META[k].label}</span>
              <span className="sv-legend-effect">{BENEFIT_KIND_META[k].effect}</span>
            </div>
          ))}
        </div>
      </section>

      {SAVINGS_TRACKS.map(t => (
        <Track key={t.id} track={t} onOpenExpenseTopic={onOpenExpenseTopic} />
      ))}

      <div className="alert alert-info">
        המסך מציג את מבנה ההטבה ואת התקרות — לא חישוב אישי. החיסכון בפועל תלוי בשיעור המס השולי,
        בשילוב שכיר/עצמאי ובהפקדות שכבר בוצעו; בכל תיק נדרש חישוב פרטני.
      </div>
    </div>
  );
}

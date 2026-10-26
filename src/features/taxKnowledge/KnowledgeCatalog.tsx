import { useState } from 'react';
import { formatAreaPath, type AreaPath } from '../taxArea/areaModel';
import { BODIES } from './TopicPage';
import { courseStepsOf, learningUnitsOf } from './learnPath';
import { readMarks } from './readingMarks';
import KnowledgeArt from './KnowledgeArt';
import { entryPath, LIBRARY_ENTRIES, SHELVES, type ShelfId } from './libraryModel';

export default function KnowledgeCatalog({ onGo }: { onGo: (p: AreaPath) => void }) {
  const [shelf, setShelf] = useState<ShelfId>(() => {
    try { const s = sessionStorage.getItem('pivo.knowledge.shelf'); return SHELVES.find(x => x.id === s)?.id ?? 'all'; } catch { return 'all'; }
  });
  const choose = (id: ShelfId) => { setShelf(id); try { sessionStorage.setItem('pivo.knowledge.shelf', id); } catch { /* Filtering works without storage. */ } };
  const shown = LIBRARY_ENTRIES.filter(e => shelf === 'all' || e.group === shelf);
  return <>
    <section className="kl-catalog" aria-labelledby="kl-catalog-heading">
      <div className="kl-section-head"><h2 id="kl-catalog-heading">נושאים ללימוד ולעיון</h2><span role="status">{shown.length} נושאים</span></div>
      <nav className="kl-shelves" aria-label="תחומי הידע">{SHELVES.map(s => <button key={s.id} type="button" aria-pressed={shelf === s.id} onClick={() => choose(s.id)}>{s.name}</button>)}</nav>
      <div className="kl-subjects">
        {shown.map(e => {
          const toc = BODIES[e.id]?.toc ?? [];
          const steps = courseStepsOf(e.id, toc), done = readMarks(e.id, steps.map(s => s.id));
          const units = learningUnitsOf(e.id, toc);
          const to = entryPath(e);
          return <a key={e.id} href={`#/tax/${formatAreaPath(to)}`} className={`kl-subject tone-${e.hue}`} onClick={ev => { if (ev.ctrlKey || ev.metaKey || ev.shiftKey || ev.altKey) return; ev.preventDefault(); onGo(to); }} data-book-item={e.id}>
            <div className="kl-cover"><span>{SHELVES.find(s => s.id === e.group)?.name}</span><KnowledgeArt name={e.icon} /><small>{e.domain ? 'עיון ונתונים' : 'מחברת + לימוד'}</small></div>
            <div className="kl-copy"><h3>{e.name}</h3><p>{e.line}</p><small>{e.tags}</small>
              <footer><span>{e.domain ? 'לפתוח את החומר' : done.length ? `נקראו ${done.length} מתוך ${steps.length} שלבים` : `${units.length} יחידות לימוד`}</span><span aria-hidden="true">←</span></footer>
              {done.length > 0 && <progress value={done.length} max={steps.length} aria-label={`התקדמות ב${e.name}`} />}
            </div>
          </a>;
        })}
      </div>
    </section>
    <div className="kl-workbench">
      <a href="#/tax/learn/tools" onClick={e => { if (e.ctrlKey || e.metaKey || e.shiftKey || e.altKey) return; e.preventDefault(); onGo({ mode: 'learn', directory: 'tools' }); }}><KnowledgeArt name="grid" /><div><h2>כלים ונתונים לעבודה</h2><p>מחשבונים, טבלאות וערכי מס — כשצריך לחשב או לבדוק.</p><span>לכל כלי העבודה ←</span></div></a>
      <a href="#/tax/learn/forms" onClick={e => { if (e.ctrlKey || e.metaKey || e.shiftKey || e.altKey) return; e.preventDefault(); onGo({ mode: 'learn', directory: 'forms' }); }}><KnowledgeArt name="pages" /><div><h2>דוחות, נספחים והצהרת הון</h2><p>הטופס המסומן וההסבר ליד כל סעיף.</p><span>לפתוח דוח או טופס ←</span></div></a>
    </div>
  </>;
}

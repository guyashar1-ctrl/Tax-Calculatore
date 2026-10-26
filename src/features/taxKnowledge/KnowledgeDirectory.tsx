import { DOMAINS, formatAreaPath, type AreaPath } from '../taxArea/areaModel';
import { MAP_FORMS } from './formMap/model';
import { SOURCE_DOCS } from './sourceDocs';
import KnowledgeArt from './KnowledgeArt';
import { LIBRARY_TOOLS } from './libraryModel';

export default function KnowledgeDirectory({ kind, onGo }: { kind: 'tools' | 'forms'; onGo: (p: AreaPath) => void }) {
  const link = (p: AreaPath, title: string, detail: string, n?: number) => <a key={title} href={`#/tax/${formatAreaPath(p)}`} onClick={e => { if (e.ctrlKey || e.metaKey || e.shiftKey || e.altKey) return; e.preventDefault(); onGo(p); }}>
    {n !== undefined && <small className="kl-index">{String(n + 1).padStart(2, '0')}</small>}<h2>{title}</h2><p>{detail}</p><span>לפתוח {kind === 'tools' ? 'כלי' : 'טופס'} ←</span></a>;
  return <section className="kl-directory" data-knowledge-directory={kind}>
    <header className="kl-intro"><div><p className="kl-eyeline">{kind === 'tools' ? 'כלים ונתונים לעבודה' : 'הסבר ליד הסעיף'}</p><h1>{kind === 'tools' ? 'לחשב. להשוות. לבדוק.' : 'דוחות והצהרת הון'}</h1><p>{kind === 'tools' ? 'כלי העבודה שלצד הידע המקצועי.' : 'פותחים טופס, בוחרים סעיף ורואים מה למלא ומה חשוב לבדוק.'}</p></div></header>
    {kind === 'tools' ? <>
      <div className="kl-tool-grid">{LIBRARY_TOOLS.map((i, n) => link({ mode: 'learn', domain: i.domain, item: i.id }, i.label, i.purpose, n))}</div>
      <section className="kl-reference-directory"><h2>ערכי מס וטבלאות לפי תחום</h2><div>{DOMAINS.map(d => <a key={d.id} href={`#/tax/learn/${d.id}`} onClick={e => { if (e.ctrlKey || e.metaKey || e.shiftKey || e.altKey) return; e.preventDefault(); onGo({ mode: 'learn', domain: d.id }); }}>{d.label}<span aria-hidden="true">←</span></a>)}</div></section>
      <p><button type="button" className="kn-link" onClick={() => onGo({ mode: 'learn', domain: 'reference', item: 'maintenance' })}>עדכון הנתונים ובקרת המקורות ←</button></p>
    </> : <>
      <div className="kl-featured-forms">{(['annual', 'wealth'] as const).map((domain, n) => <a key={domain} href={`#/tax/learn/${domain}`} onClick={e => { if (e.ctrlKey || e.metaKey || e.shiftKey || e.altKey) return; e.preventDefault(); onGo({ mode: 'learn', domain }); }}><KnowledgeArt name={n ? 'layers' : 'pages'} /><div><small>טופס {n ? '1219' : '1301'}</small><h2>{n ? 'הצהרת הון' : 'דוח שנתי'}</h2><p>{n ? 'נכסים, התחייבויות ובדיקת הנתונים' : 'הכנסות, ניכויים, זיכויים ונספחים'}</p></div><span aria-hidden="true">←</span></a>)}</div>
      <h2 className="kl-section-title">נספחים ובקשות</h2>
      <div className="kl-tool-grid is-forms">{link({ mode: 'learn', domain: 'annual', form: '6111' }, '6111 · נתונים כספיים', 'הטופס המלא ומילון הסיווג')}{MAP_FORMS.filter(f => f.role === 'annex').map(f => link({ mode: 'learn', domain: f.domain, form: f.slug }, f.short, 'הסעיפים, המסמכים וההסבר המקצועי'))}</div>
      <section className="kl-reference-directory"><h2>אישורים ומסמכים — מה לוקחים מכל אחד?</h2><p>מה בודקים במסמך, ולאיזה סעיף בדוח מעבירים.</p><div>{SOURCE_DOCS.map(doc => <a key={doc.id} href={`#/tax/learn/annual/d/${doc.id}`} onClick={e => { if (e.ctrlKey || e.metaKey || e.shiftKey || e.altKey) return; e.preventDefault(); onGo({ mode: 'learn', domain: 'annual', doc: doc.id }); }}>{doc.title}<span aria-hidden="true">←</span></a>)}</div></section>
    </>}
  </section>;
}

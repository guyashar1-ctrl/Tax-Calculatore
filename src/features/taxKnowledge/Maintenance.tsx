// ─── עדכניות ותחזוקה ─────────────────────────────────────────────────────────
// ‼ ביסוס לכל כלל, לא «אומת» לכל המאגר. עדכון קורה בסבב של Claude בענף נפרד
// (הפרומפט), ומתפרסם רק אחרי אישור. מאגרים שעוד לא עברו למרשם — מוצגים
// בבדיקת הכיסוי עם מה שנבדק בפועל.

import { useState, type ReactNode } from 'react';
import { ALL_RULES } from '../taxRules/rules';
import { ruleView, formatRuleValue, RULESET_VERSION } from '../taxRules/registry';
import { BasisTag, CopyPrompt } from './RuleBits';
import { TOPICS, FIELD_MAP_TAX_YEAR } from './topics';
import { ALL_SOURCES, EXPECTED_PUBLICATIONS } from '../taxRules/sources';
import { ruleUsage } from '../taxRules/impact';
import { DOC_KIND_LABEL, NEW_FORM_TARGETS } from './maintenancePrompt';
import { RESEARCH_LEADS, LEAD_STATE_LABEL, LEVEL_LABEL, LEVEL_STATE_LABEL, type LevelKey } from './researchLeads';
import { OPEN_ITEMS, MEANWHILE_LABEL, STATUS_LABEL, OWNER_LABEL } from '../taxRules/openItems';
// פתוח קודם — מה שמחכה להכרעה; נסגר בסוף, כהיסטוריה
const STATUS_ORDER = { open: 0, partlyClosed: 1, closed: 2 } as const;

const fmtDate = (iso: string) => { const [y, m, d] = iso.split('-'); return d ? `${d}.${m}.${y}` : iso; };
import { COVERAGE_AUDIT, type AuditState } from './coverageAudit';
import './knowledge.css';

const AUDIT_LABEL: Record<AuditState, string> = { checked: 'נבדק', partial: 'נבדק חלקית', notChecked: 'לא נבדק', replaced: 'הוחלף בנושא חדש' };
const AUDIT_COLOR: Record<AuditState, string> = { checked: 'var(--ok)', partial: 'var(--warn)', notChecked: 'var(--err)', replaced: 'var(--info)' };

export default function Maintenance({ year, freshnessPanel }: { year: number; freshnessPanel?: ReactNode }) {
  const [topicId, setTopicId] = useState(TOPICS[0].id);
  const [impactRule, setImpactRule] = useState('sf.se.ceiling');
  const [formId, setFormId] = useState('1301');
  const [formYear, setFormYear] = useState(new Date().getFullYear() - 1);
  const usage = ruleUsage(impactRule);
  const counts = ALL_RULES.reduce((acc, r) => { const b = ruleView(r.id, year)?.entry?.basis ?? 'unverified'; acc[b] = (acc[b] ?? 0) + 1; return acc; }, {} as Record<string, number>);
  return (
    <div className="kn-page">
      <section className="kn-box">
        <strong>עדכון הידע — איך זה עובד</strong>
        <ol className="kn-small" style={{ margin: 0, paddingInlineStart: 18, display: 'flex', flexDirection: 'column', gap: 3 }}>
          <li>מעתיקים פרומפט — לכל המאגר או לנושא — ופותחים איתו שיחה חדשה עם Claude.</li>
          <li>Claude חוקר מול מקורות רשמיים — ערכים, טפסים, נספחים, הוראות ומיפוי שדות — לכל שנת מס פתוחה, גם כשהפרסום מאוחר (דוח 2026 ב-2027).</li>
          <li>מעדכן בענף נפרד: ערך חדש מתווסף לשנה שלו; תיקון לאותה שנה שומר את הגרסה הקודמת; מסמך חדש לא מוחק את הקודם.</li>
          <li>בודק השפעה על נושאים, חישובים ושדות, ומעדכן אותם. הערכות שאושרו ותשובות לקוחות לא משתנות — מסומנות «נדרשת בדיקה» עם הסבר.</li>
          <li>מגיש דוח שינויים. שום דבר לא עולה למערכת בלי אישורך.</li>
        </ol>
        <p className="kn-xs kn-muted" style={{ margin: 0 }}>ההעתקה אינה אימות. גרסת המרשם הנוכחית: {RULESET_VERSION}.</p>
        <div className="kn-two">
          <CopyPrompt scope={{ kind: 'all' }} label="העתק פרומפט עדכון לכל ידע המס" />
          <div className="kn-page" style={{ gap: 6 }}>
            <label className="kn-field" htmlFor="mt-topic">או לנושא אחד
              <select id="mt-topic" value={topicId} onChange={e => setTopicId(e.target.value)}>{TOPICS.map(t => <option key={t.id} value={t.id}>{t.title}</option>)}</select>
            </label>
            <CopyPrompt key={topicId} scope={{ kind: 'topic', topicId }} label="העתק פרומפט לנושא שנבחר" />
          </div>
        </div>
      </section>

      <section className="kn-box" aria-labelledby="mt-newform">
        <strong id="mt-newform">טופס לשנה חדשה — כשמתפרסם (למשל 1301 לשנת 2026, שמתפרסם ב-2027)</strong>
        <p className="kn-small kn-muted" style={{ margin: 0 }}>הפרומפט מוביל לקריאת הטופס, דברי ההסבר ומבנה הקובץ, השוואה לשנה הקודמת לפי משמעות, עדכון בפועל של הקטלוג, המילון, הידע והשאלונים — ובדיקת השפעה. תשובות לקוח והערכות שאושרו לא משתנות.</p>
        <div className="kn-row" style={{ alignItems: 'flex-end' }}>
          <label className="kn-field" htmlFor="mt-form" style={{ flex: '1 1 240px' }}>טופס
            <select id="mt-form" value={formId} onChange={e => setFormId(e.target.value)}>{NEW_FORM_TARGETS.map(f => <option key={f.formId} value={f.formId}>{f.label}</option>)}</select>
          </label>
          <label className="kn-field" htmlFor="mt-year" style={{ flex: '0 1 120px' }}>שנת המס
            <input id="mt-year" type="number" inputMode="numeric" value={formYear} min={2024} max={2035} onChange={e => setFormYear(Number(e.target.value) || formYear)} />
          </label>
        </div>
        <CopyPrompt key={formId + formYear} scope={{ kind: 'newForm', formId, taxYear: formYear }} label={`העתק פרומפט — טופס ${formId} לשנת ${formYear}`} />
      </section>

      <section className="kn-page" style={{ gap: 8 }} aria-labelledby="mt-leads">
        <h2 id="mt-leads" className="kn-area-title">קצות החוט R01 עד R14 — מה נסגר ואיפה זה</h2>
        <div className="kn-dict">{RESEARCH_LEADS.map(l => (
          <details key={l.id} className="kn-dict-row">
            <summary><span className="kn-dict-name"><b>{l.id}</b> {l.title}</span><span className={`kn-rd ${l.state === 'closed' ? 'ready' : l.state === 'partial' ? 'verify' : 'missing'}`}>{LEAD_STATE_LABEL[l.state]}</span></summary>
            <div className="kn-dict-body kn-small">
              {/* ‼ כל יכולת בנפרד — הסבר אינו חישוב, חישוב אינו אוטומציה, ומימוש אינו בדיקה */}
              <div className="kn-levels" role="list" aria-label={`מצב היכולות של ${l.id}`}>
                {(Object.keys(LEVEL_LABEL) as LevelKey[]).map(k => (
                  <span key={k} role="listitem" className={`kn-level is-${l.levels[k]}`} title={l.levelNotes?.[k] ?? ''}>{LEVEL_LABEL[k]}: <b>{LEVEL_STATE_LABEL[l.levels[k]]}</b></span>
                ))}
              </div>
              {l.levelNotes && <ul className="kn-level-notes">{(Object.keys(l.levelNotes) as LevelKey[]).map(k => <li key={k}><span className="kn-muted">{LEVEL_LABEL[k]}:</span> {l.levelNotes![k]}</li>)}</ul>}
              <div>{l.found}</div>
              <div><span className="kn-muted">איפה במערכת:</span> {l.where}</div>
              {l.open && <div><span className="kn-muted">פתוח:</span> {l.open}</div>}
            </div>
          </details>
        ))}</div>
      </section>

      <section className="kn-page" style={{ gap: 8 }} aria-labelledby="mt-open">
        <h2 id="mt-open" className="kn-area-title">פריטים פתוחים ({OPEN_ITEMS.filter(i => i.status !== 'closed').length} פתוחים · {OPEN_ITEMS.filter(i => i.status === 'closed').length} נסגרו)</h2>
        <p className="kn-small kn-muted" style={{ margin: 0 }}>לכל פריט: מה חסר, מה נבדק בפועל, על איזו יכולת הוא משפיע ומה המערכת עושה עד להכרעה.</p>
        <ul className="kn-rd-list">
          {[...OPEN_ITEMS].sort((a, b) => STATUS_ORDER[a.status] - STATUS_ORDER[b.status]).map(i => (
            <li key={i.id}>
              <span className={`kn-rd ${i.status === 'closed' ? 'ready' : i.meanwhile === 'blocked' ? 'missing' : 'verify'}`}>{STATUS_LABEL[i.status]}</span>
              <div style={{ minWidth: 0 }}>
                <div><strong>{i.title}</strong> <span className="kn-xs kn-muted">· {OWNER_LABEL[i.owner]}</span></div>
                {i.status === 'closed' ? <div className="kn-xs">הוכרע: {i.resolution}</div> : <div className="kn-xs">חסר: {i.missing}</div>}
                <div className="kn-xs">משפיע על: {i.affects} · בינתיים: <strong>{MEANWHILE_LABEL[i.meanwhile]}</strong> — {i.meanwhileText}</div>
                {i.collection && <div className="kn-xs">איסוף מידע: {i.collection}</div>}
                <details className="kn-details"><summary>מה נבדק ({i.checked.length})</summary>
                  <ul className="kn-xs" style={{ margin: 0, paddingInlineStart: 18 }}>{i.checked.map(c => <li key={c.source}><strong>{c.source}</strong> — {c.found}</li>)}</ul>
                </details>
              </div>
            </li>
          ))}
        </ul>
      </section>

      <section className="kn-page" style={{ gap: 8 }} aria-labelledby="mt-rules">
        <h2 id="mt-rules" className="kn-area-title">כללים במרשם · שנת {year}</h2>
        <p className="kn-small kn-muted" style={{ margin: 0 }}>{ALL_RULES.length} כללים: {counts.primary ?? 0} רשמיים · {counts.derived ?? 0} מחושבים · {counts.secondary ?? 0} משניים · {counts.unverified ?? 0} לא אומתו. רק רשמיים ומחושבים מהם נכנסים לחישוב, ורק לשנה שלהם.</p>
        <details className="kn-details">
          <summary>כל הכללים, הערך והביסוס לשנת {year}</summary>
          <div className="kn-tbl-wrap">
          <table className="kn-tbl kn-tbl-wide">
            <thead><tr><th>כלל</th><th>ערך</th><th>שנה</th><th>ביסוס</th><th>לחישוב</th><th>נבדק</th></tr></thead>
            <tbody>{ALL_RULES.map(r => { const v = ruleView(r.id, year); if (!v?.entry) return null; return (
              <tr key={r.id}><td>{r.label}<div className="kn-xs kn-muted" dir="ltr" style={{ textAlign: 'end' }}>{r.id}</div></td><td style={{ minWidth: 140 }} className="kn-small">{typeof v.entry.value === 'string' ? (v.entry.value.length > 90 ? v.entry.value.slice(0, 90) + '…' : v.entry.value) : formatRuleValue(v)}</td><td className="n">{v.exactYear ? v.entry.taxYear : `${v.entry.taxYear}*`}</td><td><BasisTag basis={v.entry.basis} /></td><td className="kn-small">{r.computable ? 'כן' : 'הסבר בלבד'}</td><td className="kn-xs">{v.entry.checkedAt}</td></tr>
            ); })}</tbody>
          </table>
        </div>
        <p className="kn-xs kn-muted" style={{ margin: 0 }}>* אין ערך לשנה שנבחרה; מוצג הערך האחרון שקדם לה.</p>
        </details>
      </section>

      <section className="kn-page" style={{ gap: 8 }} aria-labelledby="mt-docs">
        <h2 id="mt-docs" className="kn-area-title">מסמכים ומקורות</h2>
        <p className="kn-small kn-muted" style={{ margin: 0 }}>
          לכל מסמך — לאיזו שנת מס הוא מתייחס, מתי פורסם, ממתי חל ואיזו גרסה. אלה ארבעה דברים שונים: דוח 2026 ונספחיו מתפרסמים ב-2027 ושייכים ל-2026.
          מה שלא נבדק מסומן «לא נרשם» — לא משלימים לפי שנת הפרסום.
        </p>
        <details className="kn-details">
          <summary>כל המסמכים ({ALL_SOURCES.length})</summary>
          <div className="kn-tbl-wrap">
          <table className="kn-tbl kn-tbl-wide">
            <thead><tr><th>מסמך</th><th>סוג</th><th>שנת מס</th><th>פורסם</th><th>חל מ</th><th>גרסה</th><th>ביסוס</th></tr></thead>
            <tbody>{ALL_SOURCES.map(s => (
              <tr key={s.id}>
                <td>{s.url ? <a href={s.url} target="_blank" rel="noreferrer">{s.label}</a> : s.label}{s.note && <div className="kn-xs kn-muted">{s.note}</div>}</td>
                <td className="kn-small">{DOC_KIND_LABEL[s.docKind]}</td>
                <td className="n">{s.refersToTaxYear ?? '—'}</td>
                <td className="kn-xs">{s.publishedAt ? fmtDate(s.publishedAt) : <span className="kn-muted">לא נרשם</span>}</td>
                <td className="kn-xs">{s.effectiveFrom ? fmtDate(s.effectiveFrom) : <span className="kn-muted">לא נרשם</span>}</td>
                <td className="kn-xs">{s.documentVersion ?? <span className="kn-muted">לא נרשמה</span>}</td>
                <td className="kn-small">{s.kind === 'primary' ? 'רשמי' : s.kind === 'office' ? 'משרד' : 'משני'}</td>
              </tr>
            ))}</tbody>
          </table>
        </div>
        </details>
      </section>

      <section className="kn-page" style={{ gap: 8 }} aria-labelledby="mt-expected">
        <h2 id="mt-expected" className="kn-area-title">פרסומים שעוד לא נמצאו</h2>
        <p className="kn-small kn-muted" style={{ margin: 0 }}>רשימת החיפוש של סבב העדכון הבא. «בדרך כלל» היא הערכה לתכנון — לא מועד.</p>
        <ul className="kn-page" style={{ gap: 6, margin: 0, paddingInlineStart: 18 }}>
          {EXPECTED_PUBLICATIONS.map(p => (
            <li key={p.id} className="kn-small">
              <strong>{p.title}</strong> · {DOC_KIND_LABEL[p.docKind]} · שנת מס {p.refersToTaxYear} · בדרך כלל {p.usuallyPublished}
              <div className="kn-xs kn-muted">ישפיע על: {p.affects.join(' · ')}</div>
            </li>
          ))}
        </ul>
      </section>

      <section className="kn-page" style={{ gap: 8 }} aria-labelledby="mt-impact">
        <h2 id="mt-impact" className="kn-area-title">מה מושפע כשכלל משתנה</h2>
        <label className="kn-field" htmlFor="mt-impact-rule">כלל
          <select id="mt-impact-rule" value={impactRule} onChange={e => setImpactRule(e.target.value)}>
            {ALL_RULES.map(r => <option key={r.id} value={r.id}>{r.label}</option>)}
          </select>
        </label>
        <div className="kn-box kn-small" aria-live="polite">
          <div><strong>נושאים:</strong> {usage.topics.length ? usage.topics.map(t => t.title).join(' · ') : 'אין'}</div>
          <div><strong>חישובים:</strong> {usage.calcs.length ? usage.calcs.map(c => c.label).join(' · ') : 'אין — הכלל מוצג להסבר בלבד'}</div>
          <div><strong>שדות 1301 (טופס {FIELD_MAP_TAX_YEAR}):</strong> {usage.form1301.length ? usage.form1301.map(f => `חלק ${f.part} סעיף ${f.section} (${f.fields})`).join(' · ') : 'אין'}</div>
          <div className="kn-xs kn-muted">
            תוצאה שאושרה שומרת את הכללים, השנה, הערך והמקור שנכנסו אליה. כשכלל כזה משתנה, התוצאה לא מחושבת מחדש — היא מסומנת «נדרשת בדיקה» עם ההסבר, והמשרד מחליט.
            הערכות מאושרות ייבנו בשלב 3; המנגנון קיים ונבדק כבר עכשיו.
          </div>
        </div>
      </section>

      <section className="kn-page" style={{ gap: 8 }} aria-labelledby="mt-audit">
        <h2 id="mt-audit" className="kn-area-title">בדיקת הכיסוי של עמודי הידע · 10.10.2026</h2>
        <div className="kn-tbl-wrap">
          <table className="kn-tbl kn-tbl-wide">
            <thead><tr><th>עמוד</th><th>מצב</th><th>מה נמצא</th><th>הלאה</th></tr></thead>
            <tbody>{COVERAGE_AUDIT.map(a => (
              <tr key={a.page}><td>{a.page}<div className="kn-xs kn-muted">{a.dataset}</div></td><td style={{ color: AUDIT_COLOR[a.state], fontWeight: 600, whiteSpace: 'nowrap' }}>{AUDIT_LABEL[a.state]}</td><td className="kn-small">{a.found}</td><td className="kn-small">{a.next}</td></tr>
            ))}</tbody>
          </table>
        </div>
      </section>

      {freshnessPanel}
    </div>
  );
}

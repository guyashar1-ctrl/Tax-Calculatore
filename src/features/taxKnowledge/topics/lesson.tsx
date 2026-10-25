// ─── שכבת הלימוד של נושא ─────────────────────────────────────────────────────
// ‼ 11.10.2026 (גיא): הידע צריך ללמד מהבסיס ועד יישום — מושגים, דרך חשיבה, דוגמאות
// פתורות, טעויות נפוצות ותרגול — ולהבחין בגלוי בין מה שמאומת, פרשנות ופער פתוח.
// לכן לכל פריט יש status, ומספרים נשלפים מהמרשם ({{rule.id}}) ולא נכתבים בטקסט.
// נושא בוחר אילו אבנים הוא צריך; אין תבנית אחידה שחובה למלא.

import { useState, type ReactNode } from 'react';
import { RV } from '../RuleBits';

import { ClaimTag, CLAIM_LABEL, type ClaimStatus } from '../claim';
export { ClaimTag, CLAIM_LABEL, type ClaimStatus };

/** טקסט עם ערכים מהמרשם: «עד {{sf.se.rate}} מההכנסה». */
export function Txt({ text, year }: { text: string; year: number }) {
  const parts = text.split(/\{\{([a-zA-Z0-9.]+)\}\}/g);
  return <>{parts.map((p, i) => (i % 2 ? <RV key={i} id={p} year={year} /> : p))}</>;
}

/** מזהי הכללים שבטקסט — לבדיקה שכל הפניה קיימת במרשם. */
export function ruleTokens(text: string): string[] {
  return [...text.matchAll(/\{\{([a-zA-Z0-9.]+)\}\}/g)].map(m => m[1]);
}

export interface LessonPoint { text: string; status: ClaimStatus }
export interface GlossaryTerm { term: string; plain: string; where?: string; status: ClaimStatus }
export interface ThinkStep { q: string; why: string; status: ClaimStatus }
export interface Mistake { wrong: string; right: string; status: ClaimStatus }

export interface Lesson {
  /** «בקצרה» — מה חייבים לזכור, בלי להיכנס לפרטים. */
  mustKnow: LessonPoint[];
  /** מה עושים עם זה בפועל, במשפט. */
  action?: LessonPoint;
  glossary: GlossaryTerm[];
  thinking: ThinkStep[];
  mistakes: Mistake[];
}

export function Legend() {
  return (
    <p className="kn-xs kn-muted kn-legend-claims">
      <ClaimTag status="verified" /> מקור רשמי שנקרא · <ClaimTag status="interpretation" /> הסבר, נוהג או מקור משני · <ClaimTag status="open" /> לא הוכרע
    </p>
  );
}

export function QuickRead({ lesson, year, gaps, onLearn }: { lesson: Lesson; year: number; gaps: number; onLearn: () => void }) {
  return (
    <div className="kn-quick">
      <h2 className="kn-quick-h">מה חייבים לזכור</h2>
      <ol className="kn-must">
        {lesson.mustKnow.map(p => (
          <li key={p.text}><span><Txt text={p.text} year={year} /></span> <ClaimTag status={p.status} /></li>
        ))}
      </ol>
      {lesson.action && (
        <div className="kn-explain"><strong>בפועל: </strong><Txt text={lesson.action.text} year={year} /> <ClaimTag status={lesson.action.status} /></div>
      )}
      <div className="kn-spread">
        <span className="kn-xs kn-muted">{gaps ? `${gaps === 1 ? 'שאלה מקצועית אחת פתוחה' : `${gaps} שאלות מקצועיות פתוחות`} בנושא — הפירוט בשלב «חריגים ושאלות פתוחות».` : ''}</span>
        <button type="button" className="btn btn-primary btn-sm" onClick={onLearn}>ללמוד מהבסיס</button>
      </div>
      <Legend />
    </div>
  );
}

export function Glossary({ terms, year }: { terms: GlossaryTerm[]; year: number }) {
  return (
    <dl className="kn-gloss">
      {terms.map(t => (
        <div key={t.term} className="kn-gloss-row">
          <dt>{t.term} <ClaimTag status={t.status} /></dt>
          <dd>
            <span><Txt text={t.plain} year={year} /></span>
            {t.where && <span className="kn-xs kn-muted">איפה פוגשים: <Txt text={t.where} year={year} /></span>}
          </dd>
        </div>
      ))}
    </dl>
  );
}

export function Thinking({ steps, year }: { steps: ThinkStep[]; year: number }) {
  return (
    <ol className="kn-think">
      {steps.map(s => (
        <li key={s.q}>
          <strong><Txt text={s.q} year={year} /></strong> <ClaimTag status={s.status} />
          <span className="kn-small kn-muted"><Txt text={s.why} year={year} /></span>
        </li>
      ))}
    </ol>
  );
}

export function Mistakes({ items, year }: { items: Mistake[]; year: number }) {
  return (
    <div className="kn-mistakes">
      {items.map(m => (
        <div key={m.wrong} className="kn-mistake">
          <div className="kn-mistake-wrong"><span className="kn-eyebrow">טעות</span><span><Txt text={m.wrong} year={year} /></span></div>
          <div className="kn-mistake-right"><span className="kn-eyebrow">נכון</span><span><Txt text={m.right} year={year} /></span> <ClaimTag status={m.status} /></div>
        </div>
      ))}
    </div>
  );
}

/**
 * דוגמה פתורה: קודם הנתונים והשאלה, הפתרון נפתח בלחיצה — כדי לנסות לבד.
 * ‼ המספרים מחושבים מהמרשם על ידי מי שמרכיב את הדוגמה; כאן רק התצוגה.
 */
export function SolveFirst({ title, facts, ask, steps, answer, note, status, level }: {
  title: string; facts: ReactNode; ask: ReactNode; steps: { label: ReactNode; value: ReactNode }[]; answer: ReactNode; note?: ReactNode; status: ClaimStatus; level: 'יסוד' | 'יישום' | 'מתקדם';
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="kn-solve">
      <div className="kn-spread"><strong>{title}</strong><span className="kn-row"><span className="kn-level">{level}</span><ClaimTag status={status} /></span></div>
      <div className="kn-small">{facts}</div>
      <div className="kn-small"><strong>השאלה: </strong>{ask}</div>
      {!open ? (
        <button type="button" className="btn btn-secondary btn-sm" style={{ alignSelf: 'flex-start' }} onClick={() => setOpen(true)} aria-expanded={false}>נסו לבד — ואז להציג פתרון</button>
      ) : (
        <div className="kn-solution" aria-live="polite"><button type="button" className="btn btn-secondary btn-sm" onClick={()=>setOpen(false)} aria-expanded={true}>לסגור את הפתרון ולנסות שוב</button>
          <ol>{steps.map((s, i) => <li key={i}><span>{s.label}</span><span className="kn-walk-num" dir="ltr">{s.value}</span></li>)}</ol>
          <div className="kn-explain"><strong>תשובה: </strong>{answer}</div>
          {note && <p className="kn-xs kn-muted" style={{ margin: 0 }}>{note}</p>}
        </div>
      )}
    </div>
  );
}

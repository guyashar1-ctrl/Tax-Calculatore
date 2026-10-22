// ─── מאגר הכללים — נבנה מהידע הקיים, לא נכתב מחדש ───────────────────────────────
// ‼ 21.10.2026 (גיא): «שאל» עונה רק מתוך כללים מאומתים, ותמיד עם מקור. כלל = טענה אחת + מעמד + מאיפה.
//   המקור נשאר אחד: דפי הנושאים (ClaimTag), שכבת הלימוד, הערות התחומים, מסמכי המקור והמרשם.
//   scripts/knowledge-corpus.mjs מריץ את זה ושומר corpus.json — לדפדפן ולפונקציית השרת. בדיקה נופלת אם יש סטייה.
// ‼ מזהה כלל = נושא + סעיף + גיבוב של הנוסח. נוסח שהשתנה ⇒ מזהה חדש (תשובה ישנה לא נשענת בשקט על נוסח אחר).

// ‼ גרסת הדפדפן של הרינדור הסטטי: גרסת node דורשת את `stream`, שאגד הבדיקות והבנייה (esbuild, ESM) אינו יכול לטעון.
// @ts-expect-error TS7016 — אין הצהרת טיפוסים ל-react-dom/server.browser (כמו ב-portalModes.test.ts)
import { renderToStaticMarkup } from 'react-dom/server.browser';
import type { ComponentType } from 'react';
import { claimsFromHtml } from './htmlClaims';
import type { ClaimStatus } from '../claim';
import { TOPIC_BY_ID } from '../topics';
import { DOMAINS, domainOf, type DomainId } from '../../taxArea/areaModel';
import { SOURCE_DOCS } from '../sourceDocs';
import { RULES } from '../../taxRules/rules';
import { SOURCES } from '../../taxRules/sources';
import type { Basis } from '../../taxRules/types';
import type { Lesson } from '../topics/lesson';
import type { TopicBodyProps } from '../topics/shared';
import { PENSION_LESSON, STUDY_FUND_LESSON, WEALTH_LESSON } from '../topics/lessons';
import { NI_LESSON, ADVANCES_LESSON, MANDATORY_LESSON, MICRO_LESSON } from '../topics/lessonsMore';
import { ANNUAL_LESSON, FORM6111_LESSON } from '../topics/lessonsReports';
import StudyFundBody from '../topics/StudyFundBody';
import PensionBody from '../topics/PensionBody';
import MandatoryPensionBody from '../topics/MandatoryPensionBody';
import NiBody from '../topics/NiBody';
import AdvancesBody from '../topics/AdvancesBody';
import WealthBody from '../topics/WealthBody';
import MicroBusinessBody from '../topics/MicroBusinessBody';
import DealerTypeBody, { DEALER_LESSON } from '../topics/DealerTypeBody';
import AnnualReturnBody from '../topics/AnnualReturnBody';
import Form6111Body from '../topics/Form6111Body';
import MaternityBody, { MATERNITY_LESSON } from '../topics/MaternityBody';
import type { KnowledgeRule, RuleKind } from './types';

/** השנה שבה מוצגים ערכי המרשם בתוך נוסח הנושאים. ערכים לשנים אחרות — בכללי «ערך» נפרדים. */
export const CORPUS_YEAR = 2026;

const TOPIC_BODIES: { id: string; Body: ComponentType<TopicBodyProps>; lesson?: Lesson }[] = [
  { id: 'studyFund', Body: StudyFundBody, lesson: STUDY_FUND_LESSON },
  { id: 'pensionSE', Body: PensionBody, lesson: PENSION_LESSON },
  { id: 'mandatoryPension', Body: MandatoryPensionBody, lesson: MANDATORY_LESSON },
  { id: 'niSelfEmployed', Body: NiBody, lesson: NI_LESSON },
  { id: 'advances', Body: AdvancesBody, lesson: ADVANCES_LESSON },
  { id: 'wealth', Body: WealthBody, lesson: WEALTH_LESSON },
  { id: 'microBusiness', Body: MicroBusinessBody, lesson: MICRO_LESSON },
  { id: 'dealerType', Body: DealerTypeBody, lesson: DEALER_LESSON },
  { id: 'annualReturn', Body: AnnualReturnBody, lesson: ANNUAL_LESSON },
  { id: 'form6111', Body: Form6111Body, lesson: FORM6111_LESSON },
  { id: 'maternity', Body: MaternityBody, lesson: MATERNITY_LESSON },
];

/** גיבוב קצר ויציב (FNV-1a) — לא קריפטוגרפי, רק מזהה. */
export function shortHash(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return h.toString(36).padStart(7, '0');
}

const strip = (html: string) => html.replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#x27;|&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/\s+/g, ' ').trim();
/** טקסט שיעור עם {{rule.id}} — הערך לשנת המאגר, כמו שהוא מוצג בדף. */
function lessonText(text: string): string {
  return text.replace(/\{\{([a-zA-Z0-9.]+)\}\}/g, (_, id: string) => {
    const r = RULES[id];
    const v = r ? [...r.values].sort((a, b) => b.taxYear - a.taxYear).find(x => x.taxYear <= CORPUS_YEAR) ?? r.values[0] : undefined;
    return v ? fmtValue(v.value, r!.unit) : `[${id}]`;
  });
}

function fmtValue(v: number | string, unit: string): string {
  if (typeof v === 'string') return v;
  if (unit === 'rate') return `${+(v * 100).toFixed(4)}%`;
  if (unit === '₪') return `${v.toLocaleString('en-US')} ₪`;
  return String(v);
}

const BASIS_STATUS: Record<Basis, ClaimStatus> = { primary: 'verified', derived: 'interpretation', secondary: 'interpretation', unverified: 'open' };

function push(out: KnowledgeRule[], seen: Set<string>, r: Omit<KnowledgeRule, 'id'> & { key: string }) {
  const id = `${r.key}.${shortHash(r.text)}`;
  if (seen.has(id)) return;
  seen.add(id);
  const { key: _key, ...rest } = r;
  out.push({ id, ...rest });
}

export function buildCorpus(): KnowledgeRule[] {
  const out: KnowledgeRule[] = [];
  const seen = new Set<string>();
  const add = (key: string, kind: RuleKind, text: string, status: ClaimStatus, extra: Partial<KnowledgeRule> = {}) =>
    push(out, seen, { key, kind, text, status, ...extra });

  for (const { id, Body, lesson } of TOPIC_BODIES) {
    const topic = TOPIC_BY_ID[id];
    const where = topic?.title ?? id;
    const domain = domainOf(id);
    const html = renderToStaticMarkup(<Body year={CORPUS_YEAR} />);
    for (const c of claimsFromHtml(html)) {
      add(`${id}.${c.sectionId ?? 'x'}`, 'claim', c.text, c.status, { topic: id, domain, where: c.sectionTitle ? `${where} › ${c.sectionTitle}` : where });
    }
    // ‼ מושגים, «איך חושבים» וטעויות מוצגים בתוך גוף הנושא — הם כבר נאספו משם. «בקצרה» מוצג בעמוד, לא בגוף.
    if (lesson) {
      for (const p of lesson.mustKnow) add(`${id}.must`, 'lesson', lessonText(p.text), p.status, { topic: id, domain, where: `${where} › בקצרה` });
      if (lesson.action) add(`${id}.action`, 'lesson', lessonText(lesson.action.text), lesson.action.status, { topic: id, domain, where: `${where} › בקצרה` });
    }
  }

  for (const d of DOMAINS) {
    for (const n of d.notes ?? []) {
      for (const p of n.points) add(`dom.${d.id}.${n.id}`, 'claim', p.text, p.status, { domain: d.id as DomainId, where: `${d.label} › ${n.title}` });
    }
  }

  for (const doc of SOURCE_DOCS) {
    for (const r of doc.rows) {
      add(`doc.${doc.id}`, 'claim', `${doc.title}: ${r.what} · קוד ${r.code}${r.note ? ` (${r.note})` : ''}`, r.status, { domain: 'annual', where: `מסמכי מקור › ${doc.title}` });
    }
  }

  for (const rule of Object.values(RULES)) {
    for (const v of [...rule.values].sort((a, b) => a.taxYear - b.taxYear)) {
      const src = SOURCES[v.sourceId];
      add(`val.${rule.id}.${v.taxYear}`, 'value', `${rule.label} — שנת מס ${v.taxYear}: ${fmtValue(v.value, rule.unit)}`, BASIS_STATUS[v.basis], {
        year: v.taxYear, law: rule.law, source: [src?.label, v.locator].filter(Boolean).join(' · ') || undefined, where: 'ערכים לשנה',
        topic: Object.values(TOPIC_BY_ID).find(t => t.ruleIds.includes(rule.id))?.id,
      });
    }
  }
  return out;
}

/** strip נחשף לבדיקות. */
export const _strip = strip;

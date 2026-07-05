// ─── הסקירה השנתית: "זה מה שידוע לנו — מה השתנה?" ───────────────────────────
// מוצג במקום שער האריחים כשקיים תיק שנה קודם ללקוח. כל כרטיס = תחום מהפרופיל:
// "ללא שינוי" מעתיק את תשובות אשתקד לתיק החדש (הפרקים האלה לא יישאלו),
// "השתנה" פותח את הפרק לשאלות. מה שחדש — מסמנים באריחים למטה.

import { useMemo, useState } from 'react';
import type { AnswerValue, ChapterKey, TaxpayerModel } from './types';
import { annualReportTree } from './tree';

export interface DeltaCardDef {
  key: string;
  icon: string;
  title: string;
  summary: string;
  /** אילו פרקים / שאלות ספציפיות מועתקים באישור "ללא שינוי". */
  chapters: ChapterKey[];
  extraQuestionIds?: string[];
  /** אילו אריחי-שער הכרטיס מדליק (ריק לכרטיסי בסיס כמו משפחה). */
  tiles: string[];
}

const NEW_TILES = [
  { value: 'salary', label: '💼 עבודה כשכיר/ה' },
  { value: 'business', label: '🧾 עסק עצמאי' },
  { value: 'rental', label: '🏠 נכס מושכר' },
  { value: 'capital', label: '📈 שוק ההון' },
  { value: 'pension_ni', label: '🌅 קצבאות / ביטוח לאומי' },
  { value: 'foreign', label: '✈️ חו"ל' },
  { value: 'companies', label: '🏢 חברות / משיכות' },
  { value: 'other', label: '⭐ אחר (הגרלות, תמלוגים)' },
];

const fmt = (n?: number) => (n && n > 0 ? `${n.toLocaleString('he-IL')} ₪` : '');

export function buildDeltaCards(prior: TaxpayerModel): DeltaCardDef[] {
  const src = prior.income?.sources ?? [];
  const cards: DeltaCardDef[] = [];

  const kids = prior.identity?.childrenCount ?? 0;
  cards.push({
    key: 'family', icon: '👨‍👩‍👧', title: 'משפחה, תושבות ומצבים קבועים',
    summary: [
      prior.identity?.maritalStatus === 'married' ? 'נשוי/אה' : null,
      kids > 0 ? `${kids} ילדים` : null,
      prior.identity?.hasDisability ? 'נכות מוכרת' : null,
    ].filter(Boolean).join(' · ') || 'רווק/ה, ללא ילדים',
    chapters: ['identity_family'],
    extraQuestionIds: ['is_family_company_member', 'is_foreign_controlling_shareholder', 'is_kibbutz_member', 'trust_role'],
    tiles: [],
  });

  if (src.includes('salary')) {
    cards.push({
      key: 'salary', icon: '💼', title: 'עבודה כשכיר/ה',
      summary: `${prior.income?.salaryEmployerCount ?? 1} מעסיק/ים אשתקד`,
      chapters: ['salary'], tiles: ['salary'],
    });
  }
  if (src.includes('business')) {
    cards.push({
      key: 'business', icon: '🧾', title: 'עסק עצמאי',
      summary: prior.income?.businessKind === 'osek_morshe' ? 'עוסק מורשה' : prior.income?.businessKind === 'osek_patur' ? 'עוסק פטור' : 'עסק',
      chapters: ['business'], tiles: ['business'],
    });
  }
  if (src.includes('rental')) {
    cards.push({
      key: 'rental', icon: '🏠', title: 'נכס מושכר',
      summary: fmt(prior.income?.rentalGrossAnnual) ? `שכ"ד ${fmt(prior.income?.rentalGrossAnnual)} אשתקד` : 'דווח אשתקד',
      chapters: ['rental'], tiles: ['rental'],
    });
  }
  if (src.includes('capital') || src.includes('interest')) {
    cards.push({
      key: 'capital', icon: '📈', title: 'שוק ההון וחסכונות',
      summary: (prior.income?.capitalSubTypes ?? []).length > 0 ? 'ני"ע / השקעות אשתקד' : 'ריבית / חסכונות',
      chapters: ['capital'], tiles: ['capital'],
    });
  }
  if (src.includes('pension')) {
    cards.push({
      key: 'pension_ni', icon: '🌅', title: 'קצבאות וביטוח לאומי',
      summary: prior.income?.hasPensionIncome ? 'קצבה שוטפת' : 'תקבולי ב"ל אשתקד',
      chapters: ['pension_ni'], tiles: ['pension_ni'],
    });
  }
  if (src.includes('foreign')) {
    cards.push({
      key: 'foreign', icon: '✈️', title: 'הכנסות ונכסים בחו"ל',
      summary: prior.income?.foreignCountries || 'דווח אשתקד',
      chapters: ['foreign'], tiles: ['foreign'],
    });
  }
  if (prior.income?.hasCompanyInvolvement || src.includes('dividend')) {
    cards.push({
      key: 'companies', icon: '🏢', title: 'חברות, שותפויות ומשיכות',
      summary: 'דווח אשתקד',
      chapters: ['companies'], tiles: ['companies'],
    });
  }
  if (src.includes('other')) {
    cards.push({
      key: 'other', icon: '⭐', title: 'הכנסות אחרות',
      summary: 'הגרלות / תמלוגים אשתקד',
      chapters: [], extraQuestionIds: ['has_other_income', 'other_income_kinds'], tiles: ['other'],
    });
  }

  const donations = prior.deductionsCredits?.donationAmount ?? 0;
  cards.push({
    key: 'deductions', icon: '💝', title: 'ניכויים וזיכויים',
    summary: [
      donations > 0 ? `תרומות ${fmt(donations)}` : null,
      (prior.deductionsCredits?.lifeInsuranceAnnual ?? 0) > 0 ? 'ביטוח חיים' : null,
      (prior.deductionsCredits?.selfPensionDeposits ?? 0) > 0 ? 'הפקדות פנסיה' : null,
    ].filter(Boolean).join(' · ') || 'ללא ניכויים מיוחדים אשתקד',
    chapters: ['deductions'], tiles: [],
  });

  return cards;
}

export interface DeltaResult {
  /** תשובות שהועתקו משנה שעברה (לפי הכרטיסים שאושרו "ללא שינוי"). */
  copiedAnswers: Map<string, AnswerValue>;
  /** תשובת שער האריחים המשוחזרת לשנה החדשה. */
  gateTiles: string[];
}

interface Props {
  clientName: string;
  taxYear: number;
  priorYear: number;
  priorModel: TaxpayerModel;
  priorAnswers: Map<string, AnswerValue>;
  saving: boolean;
  onApply: (result: DeltaResult) => void;
}

export default function AnnualDeltaScreen({ clientName, taxYear, priorYear, priorModel, priorAnswers, saving, onApply }: Props) {
  const cards = useMemo(() => buildDeltaCards(priorModel), [priorModel]);
  const [decisions, setDecisions] = useState<Record<string, 'same' | 'changed'>>({});
  const [newTiles, setNewTiles] = useState<string[]>([]);

  const priorTileKeys = new Set(cards.flatMap((c) => c.tiles));
  const availableNewTiles = NEW_TILES.filter((t) => !priorTileKeys.has(t.value));
  const allDecided = cards.every((c) => decisions[c.key]);

  function collectAnswersForCard(card: DeltaCardDef): Array<[string, AnswerValue]> {
    const out: Array<[string, AnswerValue]> = [];
    for (const [qid, value] of priorAnswers) {
      const node = annualReportTree.nodes[qid];
      if (!node) continue;
      const inChapter = card.chapters.includes(node.chapter ?? 'finish');
      const inExtra = (card.extraQuestionIds ?? []).includes(qid);
      if (inChapter || inExtra) out.push([qid, value]);
    }
    return out;
  }

  function apply() {
    const copied = new Map<string, AnswerValue>();
    const tiles = new Set<string>(newTiles);
    for (const card of cards) {
      const d = decisions[card.key];
      // גם "ללא שינוי" וגם "השתנה" משאירים את התחום פעיל השנה;
      // ההבדל: רק "ללא שינוי" מעתיק את התשובות (הפרק לא יישאל).
      for (const t of card.tiles) tiles.add(t);
      if (d === 'same') {
        for (const [qid, v] of collectAnswersForCard(card)) copied.set(qid, v);
      }
    }
    onApply({ copiedAnswers: copied, gateTiles: Array.from(tiles) });
  }

  return (
    <div className="card">
      <div className="card-body" style={{ padding: '1.6rem' }}>
        <div style={{ fontSize: '1.25rem', fontWeight: 800 }}>
          היי {clientName} 👋 בואו נעדכן את {taxYear}
        </div>
        <div style={{ fontSize: '.88rem', color: 'var(--gray-600)', margin: '.2rem 0 1.1rem' }}>
          זה מה שידוע לנו מ-{priorYear}. סמנו "ללא שינוי" על מה שנשאר אותו דבר — נשאל רק על מה שהשתנה.
        </div>

        {cards.map((c) => {
          const d = decisions[c.key];
          return (
            <div
              key={c.key}
              style={{
                display: 'flex', alignItems: 'center', gap: '.7rem', flexWrap: 'wrap',
                border: '1.5px solid var(--gray-200)', borderRadius: 11,
                padding: '.7rem .9rem', marginBottom: '.55rem', background: 'white',
              }}
            >
              <span style={{ fontSize: '1.25rem' }}>{c.icon}</span>
              <div style={{ flex: 1, minWidth: 180 }}>
                <div style={{ fontWeight: 700, fontSize: '.92rem' }}>{c.title}</div>
                <div style={{ fontSize: '.78rem', color: 'var(--gray-500)' }}>{c.summary}</div>
              </div>
              <div style={{ display: 'flex', gap: '.4rem' }}>
                <button
                  type="button"
                  className="btn btn-sm"
                  onClick={() => setDecisions((p) => ({ ...p, [c.key]: 'same' }))}
                  style={{
                    border: d === 'same' ? '1.5px solid var(--green)' : '1.5px solid var(--gray-200)',
                    background: d === 'same' ? '#E8F3EC' : 'white',
                    color: d === 'same' ? 'var(--green)' : 'var(--gray-600)', fontWeight: 700,
                  }}
                >
                  ✓ ללא שינוי
                </button>
                <button
                  type="button"
                  className="btn btn-sm"
                  onClick={() => setDecisions((p) => ({ ...p, [c.key]: 'changed' }))}
                  style={{
                    border: d === 'changed' ? '1.5px solid var(--blue)' : '1.5px solid var(--gray-200)',
                    background: d === 'changed' ? 'var(--blue-light, #dbeafe)' : 'white',
                    color: d === 'changed' ? 'var(--blue)' : 'var(--gray-600)', fontWeight: 700,
                  }}
                >
                  השתנה
                </button>
              </div>
            </div>
          );
        })}

        {availableNewTiles.length > 0 && (
          <div style={{ border: '1.5px dashed var(--gray-300)', borderRadius: 11, padding: '.8rem .9rem', marginTop: '.8rem' }}>
            <div style={{ fontWeight: 700, fontSize: '.9rem', marginBottom: '.45rem' }}>➕ משהו חדש ב-{taxYear}?</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '.4rem' }}>
              {availableNewTiles.map((t) => {
                const on = newTiles.includes(t.value);
                return (
                  <button
                    key={t.value}
                    type="button"
                    className="btn btn-sm"
                    onClick={() => setNewTiles((prev) => on ? prev.filter((v) => v !== t.value) : [...prev, t.value])}
                    style={{
                      border: on ? '1.5px solid var(--blue)' : '1.5px solid var(--gray-200)',
                      background: on ? 'var(--blue-light, #dbeafe)' : 'white',
                      color: on ? 'var(--blue)' : 'var(--gray-600)', fontWeight: 600,
                    }}
                  >
                    {t.label}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        <div style={{ display: 'flex', justifyContent: 'flex-start', marginTop: '1.1rem', alignItems: 'center', gap: '.8rem' }}>
          <button
            type="button"
            className="btn btn-primary btn-lg"
            disabled={!allDecided || saving}
            style={{ opacity: allDecided ? 1 : 0.5 }}
            onClick={apply}
          >
            {saving ? 'מעבד…' : 'המשך ←'}
          </button>
          {!allDecided && <span style={{ fontSize: '.8rem', color: 'var(--gray-500)' }}>יש להכריע על כל הכרטיסים</span>}
        </div>
      </div>
    </div>
  );
}

// ─── יישור קו מול הרשויות — יכולת אחת, שלושה הקשרי מחזור-חיים ──────────────
// מקור UX מחייב: docs/prototypes/client-case-simplified-exploration-v3-final2.html
// (openFocus/renderFocus/finishInst). המודל המאושר: לאן להיכנס → מה להעתיק →
// חריגה אם קיימת → הבא. שלושה יציאות: עובדה מקצועית (M1), הבהרה לשיחת הפתיחה,
// או טיוטת בקשת לקוח — ראה finishInstitution() למטה.
//
// ‼ שלושה מסכי מיקוד, לא טופס ארוך אחד. כל מוסד הוא עמוד סגור בפני עצמו.

import { useState } from 'react';
import type { Client } from '../../types';
import { NI_OCCUPATION_TYPE_LABELS } from '../../types';
import type { NiOccupation, NiOccupationType } from '../../types';
import type { OnboardingStep } from '../../types/onboarding';
import { INSTITUTION_NAMES } from '../../types/onboarding';
import type { InstitutionKey } from '../../types/onboarding';
import type { AdvanceResult } from '../../hooks/useOnboarding';
import { proposeTaxFacts, acceptTaxFactChange } from '../../lib/taxFacts';
import { clientFromDb } from '../../lib/dbMappers';
import { supabase } from '../../lib/supabase';

// ─── תצורת השדות — אחת לכל מוסד ─────────────────────────────────────────────

type FieldType = 'text' | 'number' | 'date' | 'select';

interface AlignmentField {
  key: string;
  label: string;
  type?: FieldType;
  placeholder?: string;
  options?: string[];
  /** קיים ⇒ נכתב לתיק המס (allowlist מנוהל, M1). חסר ⇒ נשמר לתיעוד בלבד. */
  governedKey?: string;
  toPatchValue?: (raw: string) => unknown;
  note?: string;
}

interface AlignmentSection {
  kicker: string;
  fields: AlignmentField[];
}

type ExceptionOutcome =
  | { kind: 'clarification'; text: string }
  | { kind: 'request'; title: string; sub?: string }
  | { kind: 'none' };

interface AlignmentException {
  key: string;
  label: string;
  options: string[];
  badValues: string[];
  governedKey?: string;
  governedPatch?: (badSelected: boolean) => unknown;
  outcome: (badValue: string) => ExceptionOutcome;
  /** שדה נוסף שמופיע רק כשהתשובה חריגה — למשל מועד להגשת הצהרת הון. */
  extraFieldWhenBad?: AlignmentField;
}

interface InstitutionConfig {
  route: string[];
  sections: AlignmentSection[];
  exceptions: AlignmentException[];
  /** הבהרות נגזרות משדה "מה להעתיק" עצמו, לא מ-exceptions (למשל ניהול ספרים לא תקף). */
  derivedClarifications?: (collected: Record<string, unknown>) => string[];
}

const YES_NO_UNCLEAR = ['לא', 'כן', 'לא ברור'];
const AUTH_OPTS = ['קיימת', 'אין הרשאה'];

const INSTITUTIONS: Record<InstitutionKey, InstitutionConfig> = {
  btl: {
    route: ['פרטים כלליים → ריכוז מידע → עיסוק', 'עיסוקים והכנסות → רשימת עיסוקים',
      'מצב חשבון → לפי ימי ערך ריאלי', 'דמי ביטוח → דמי ביטוח שנתיים → פירוט חודשים',
      'הוראות כספיות → הרשאות לחיוב'],
    sections: [
      {
        kicker: 'עיסוק ומצב חשבון',
        fields: [
          { key: 'occupationStatus', label: 'עיסוק (כפי שמופיע בריכוז מידע)', placeholder: 'עצמאי / שכיר' },
          { key: 'niBalance', label: 'יתרה בביטוח לאומי', type: 'number', governedKey: 'niBalance',
            toPatchValue: v => v === '' ? null : Number(v) },
        ],
      },
      {
        kicker: 'מקדמות',
        fields: [
          { key: 'incomeBasisMonthly', label: 'בסיס הכנסה למקדמות (לחודש)', type: 'number',
            governedKey: 'niIncomeBasisMonthly', toPatchValue: v => v === '' ? null : Number(v) },
          { key: 'niAdvanceMonthly', label: 'מקדמה חודשית', type: 'number', governedKey: 'niAdvanceMonthly',
            toPatchValue: v => v === '' ? null : Number(v) },
        ],
      },
    ],
    exceptions: [
      {
        key: 'niDebitAuthorization', label: 'הרשאה לחיוב חשבון', options: AUTH_OPTS, badValues: ['אין הרשאה'],
        governedKey: 'niDebitAuthorization', governedPatch: bad => !bad,
        outcome: () => ({ kind: 'request', title: 'הקמת הרשאה לחיוב בביטוח לאומי — קוד מוטב 28900',
          sub: 'להקים הרשאה לחיוב חשבון בביטוח לאומי, קוד מוטב 28900.' }),
      },
    ],
  },
  vat: {
    route: ['פרטי עוסק → פרטי רישום', 'פרטי עוסק → מאפייני דיווח',
      'פורטל המייצגים → רשימת מיוצגים → מע״מ → הרשאה לחיוב חשבון'],
    sections: [
      {
        kicker: 'פרטי רישום',
        fields: [
          { key: 'vatFileType', label: 'סוג תיק', type: 'select',
            options: ['עוסק מורשה', 'עוסק פטור', 'חברה', 'מלכ״ר', 'אחר'], governedKey: 'vatFileType' },
          { key: 'vatOpeningDate', label: 'תאריך פתיחת תיק', type: 'date', governedKey: 'vatOpeningDate',
            toPatchValue: v => v || null },
          { key: 'vatPrimaryIndustry', label: 'ענף עיקרי', placeholder: 'קוד/תיאור ענף',
            governedKey: 'vatPrimaryIndustry',
            note: 'טקסט חופשי בשלב זה — אין עדיין תשתית קודי ענף לחיפוש.' },
        ],
      },
      {
        kicker: 'דיווח ויתרה',
        fields: [
          { key: 'vatFrequency', label: 'תדירות דיווח', type: 'select',
            options: ['חודשי', 'דו-חודשי'], governedKey: 'vatFrequency',
            toPatchValue: v => v === 'חודשי' ? 'monthly' : 'bi_monthly' },
          { key: 'vatLastReportPeriod', label: 'דוח אחרון שהוגש', placeholder: '06/2026', governedKey: 'vatLastReportPeriod' },
          { key: 'vatBalance', label: 'יתרה במע״מ', type: 'number', governedKey: 'vatBalance',
            toPatchValue: v => v === '' ? null : Number(v) },
        ],
      },
    ],
    exceptions: [
      {
        key: 'reportMissing', label: 'נראה שחסר דיווח?', options: YES_NO_UNCLEAR, badValues: ['כן', 'לא ברור'],
        outcome: bad => ({ kind: 'clarification',
          text: bad === 'כן' ? 'נראה שחסר דיווח מע״מ — לברר בשיחת הפתיחה.' : 'לא ברור אם קיים דיווח מע״מ חסר — לבדוק.' }),
      },
      {
        key: 'vatDebitAuthorization', label: 'הרשאה לחיוב חשבון', options: AUTH_OPTS, badValues: ['אין הרשאה'],
        governedKey: 'vatDebitAuthorization', governedPatch: bad => !bad,
        outcome: () => ({ kind: 'request', title: 'הקמת הרשאה לחיוב במע״מ',
          sub: 'להקים הרשאה לחיוב חשבון במע״מ דרך פורטל המייצגים.' }),
      },
    ],
  },
  income: {
    route: ['גביית מס הכנסה → 134 מקדמות → מידע לתיק', 'אזור אישי → דרישות להצהרת הון',
      'אישורי ניכוי במקור וניהול ספרים', 'פורטל המייצגים → מס הכנסה → הרשאה לחיוב חשבון'],
    sections: [
      {
        kicker: 'תיק ומקדמות',
        fields: [
          { key: 'incomeTaxFileType', label: 'סוג תיק', governedKey: 'incomeTaxFileType' },
          { key: 'taxOfficeName', label: 'פקיד שומה', placeholder: 'תל אביב 3', governedKey: 'taxOfficeName' },
          { key: 'incomeTaxUnit', label: 'חוליה', governedKey: 'incomeTaxUnit' },
          { key: 'incomeTaxEconomicIndustry', label: 'ענף כלכלי', governedKey: 'incomeTaxEconomicIndustry' },
          { key: 'pitAdvancePercent', label: 'שיעור מקדמות', placeholder: '6%', governedKey: 'pitAdvancePercent' },
          { key: 'pitAdvanceFrequency', label: 'תדירות מקדמות', type: 'select',
            options: ['חודשי', 'דו-חודשי'], governedKey: 'pitAdvanceFrequency',
            toPatchValue: v => v === 'חודשי' ? 'monthly' : 'bi_monthly' },
          { key: 'incomeTaxBalance', label: 'יתרה במס הכנסה', type: 'number', governedKey: 'incomeTaxBalance',
            toPatchValue: v => v === '' ? null : Number(v) },
          { key: 'reportingStatus', label: 'מצב דיווחים', placeholder: 'למשל: אין דיווחים חסרים / חסר דיווח',
            governedKey: 'incomeTaxReportingStatus' },
        ],
      },
      {
        kicker: 'ניכוי במקור וניהול ספרים',
        fields: [
          { key: 'withholdingStatus', label: 'מצב ניכוי במקור', type: 'select',
            options: ['פטור מניכוי', 'שיעור/ים לפי פעילות', 'אין אישור תקף'] },
          { key: 'withholdingDetail', label: 'פירוט (כפי שמופיע באישור)', governedKey: 'withholdingDetail',
            placeholder: 'למשל: 0% שירותים, 30% קבלנות' },
          { key: 'bookStatus', label: 'ניהול ספרים', type: 'select',
            options: ['תקין', 'נפסל', 'לא ידוע'], governedKey: 'bookStatus',
            toPatchValue: v => v === 'תקין' ? 'kosher' : v === 'נפסל' ? 'rejected' : 'unknown' },
        ],
      },
    ],
    exceptions: [
      {
        key: 'capitalDeclarationRequired', label: 'דרישת הצהרת הון', options: ['אין דרישה פתוחה', 'דרישה פתוחה'],
        badValues: ['דרישה פתוחה'], governedKey: 'capitalDeclarationRequired', governedPatch: bad => bad,
        outcome: () => ({ kind: 'clarification', text: 'קיימת דרישה פתוחה להצהרת הון — לברר מועד הגשה עם הלקוח.' }),
        extraFieldWhenBad: { key: 'capitalDeclarationDeadline', label: 'מועד להגשה', type: 'date',
          governedKey: 'capitalDeclarationDeadline', toPatchValue: v => v || null },
      },
      {
        key: 'incomeTaxDebitAuthorization', label: 'הרשאה לחיוב חשבון', options: AUTH_OPTS, badValues: ['אין הרשאה'],
        governedKey: 'incomeTaxDebitAuthorization', governedPatch: bad => !bad,
        outcome: () => ({ kind: 'request', title: 'הקמת הרשאה לחיוב במס הכנסה',
          sub: 'להקים הרשאה לחיוב חשבון במס הכנסה דרך פורטל המייצגים.' }),
      },
    ],
    derivedClarifications: collected => {
      const out: string[] = [];
      if (collected.withholdingStatus === 'אין אישור תקף') out.push('אין אישור ניכוי במקור תקף — לברר עם הלקוח.');
      if (collected.bookStatus && collected.bookStatus !== 'תקין') out.push('אין אישור ניהול ספרים תקף.');
      return out;
    },
  },
};

// ─── עוזרי DB ────────────────────────────────────────────────────────────────

/**
 * מציע עובדה מקצועית ומאשר אותה מיד — נשארת pending (ולא נדרסת) אם הערך
 * המקובל בפועל השתנה מאז שהמסך נטען. ‼ oldValue.patch הוא מה שמאפשר ל-M1
 * לזהות את הקונפליקט הזה (accept_tax_fact_change בודק אותו מול הערך הנוכחי
 * בשרת) — בלעדיו אין בדיקת עדכניות בכלל, וזו בדיוק "הדריסה בשקט" שנאסרה.
 */
async function proposeAndAccept(
  client: Client, sourceRef: string, fieldKey: string, label: string, display: string, patch: unknown,
): Promise<{ client: Client | null; pending: boolean }> {
  const oldRaw = (client as unknown as Record<string, unknown>)[fieldKey];
  const propose = await proposeTaxFacts(client.id, 'institution_alignment', sourceRef, [
    {
      fieldKey, label,
      oldValue: { display: String(oldRaw ?? '—'), patch: { [fieldKey]: oldRaw ?? null } },
      newValue: { display, patch: { [fieldKey]: patch } },
    },
  ]);
  if (!propose.ok || !propose.change?.id) return { client: null, pending: false };
  const accept = await acceptTaxFactChange(propose.change.id);
  if (!accept.ok) return { client: null, pending: accept.error === 'stale_conflict' };
  return { client: accept.client ? clientFromDb(accept.client) : null, pending: false };
}

async function createDebitAuthRequest(
  clientId: string, stageId: string | null, title: string, sub: string,
): Promise<void> {
  await supabase.rpc('create_onboarding_request', {
    p_client_id: clientId,
    p_step_type: 'custom_request',
    p_payload: {
      title, clientTitle: title, clientSub: sub, clientCta: 'לאישור',
      requirements: [{ key: 'debit_auth_confirm', kind: 'confirm', label: 'הקמתי את הרשאת החיוב', done: false }],
    },
    p_due_date: null,
    p_depends_on: null,
    p_published: false,
    p_required_for_close: false,
    p_owner: 'client',
    p_stage_id: stageId,
  });
}

// ─── תצוגת "מה נשמר" ─────────────────────────────────────────────────────────

function displayValue(_f: AlignmentField, raw: unknown): string {
  const s = String(raw ?? '').trim();
  return s || '—';
}

// ─── מסך מיקוד — מוסד אחד ────────────────────────────────────────────────────

interface FocusProps {
  client: Client;
  step: OnboardingStep;
  allSteps: OnboardingStep[];
  advance: (stepId: string, action: string, payload?: Record<string, unknown>) => Promise<AdvanceResult>;
  onClientPersisted: (c: Client) => void;
  openingCallStep?: OnboardingStep;
  /** "חזרה לבקשות" — יעד אחד, שם אחד, בלי תלות בשלב החיים (נגזר ב-OnboardingTab). */
  returnLabel: string;
  onClose: () => void;
  onAdvanceInstitution: (nextKey: InstitutionKey | null) => void;
}

export function InstitutionFocus({ client, step, allSteps, advance, onClientPersisted, openingCallStep, returnLabel, onClose, onAdvanceInstitution }: FocusProps) {
  const key = (step.payload.institution ?? 'btl') as InstitutionKey;
  const cfg = INSTITUTIONS[key];
  const [collected, setCollected] = useState<Record<string, unknown>>(step.payload.collected ?? {});
  const [exceptions, setExceptions] = useState<Record<string, unknown>>(step.payload.exceptions ?? {});
  const [occupations, setOccupations] = useState<NiOccupation[]>(
    (step.payload.collected?.occupations as NiOccupation[] | undefined) ?? []);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const remaining = (['btl', 'vat', 'income'] as InstitutionKey[]).filter(k => {
    const s = allSteps.find(x => x.payload.institution === k);
    return k !== key && s && s.status !== 'completed' && s.status !== 'verified';
  });
  const nextLabel = remaining.length === 0 ? 'שמור וסיים את יישור הקו' : `שמור והמשך ל${INSTITUTION_NAMES[remaining[0]]}`;

  function setField(k: string, v: unknown) {
    setCollected(prev => ({ ...prev, [k]: v }));
  }
  function setExc(k: string, v: unknown) {
    setExceptions(prev => ({ ...prev, [k]: v }));
  }

  async function finish() {
    setSaving(true);
    setError(null);
    try {
      const fullCollected = key === 'btl' ? { ...collected, occupations } : collected;

      // 1) עובדות מקצועיות — כל שדה עם governedKey מוצע ומאושר מיד דרך M1.
      //    נשאר pending (לא נדרס) אם הערך המקובל השתנה מאז שהמסך נטען.
      let latestClient = client;
      let pendingCount = 0;
      for (const section of cfg.sections) {
        for (const f of section.fields) {
          if (!f.governedKey) continue;
          const raw = fullCollected[f.key];
          if (raw === undefined || raw === '' || raw === null) continue;
          const patchVal = f.toPatchValue ? f.toPatchValue(String(raw)) : raw;
          const res = await proposeAndAccept(
            latestClient, step.id, f.governedKey, f.label, displayValue(f, raw), patchVal);
          if (res.client) latestClient = res.client;
          if (res.pending) pendingCount++;
        }
      }
      if (key === 'btl') {
        const res = await proposeAndAccept(
          latestClient, step.id, 'niOccupations', 'עיסוקים בביטוח לאומי',
          occupations.length ? `${occupations.length} עיסוקים` : '—', occupations);
        if (res.client) latestClient = res.client;
        if (res.pending) pendingCount++;
      }
      // ‼ פטור מניכוי במקור נגזר מ"מצב ניכוי במקור" — לא שדה עצמאי במסך.
      if (key === 'income' && fullCollected.withholdingStatus) {
        const exempt = fullCollected.withholdingStatus === 'פטור מניכוי';
        const res = await proposeAndAccept(
          latestClient, step.id, 'hasExemptFromWithholding', 'פטור מניכוי במקור', exempt ? 'כן' : 'לא', exempt);
        if (res.client) latestClient = res.client;
        if (res.pending) pendingCount++;
      }

      // 2) חריגות — שלושה יעדי פלט: עובדה מקצועית, הבהרה, או טיוטת בקשה.
      const clarifications: string[] = [];
      for (const exc of cfg.exceptions) {
        const val = String(exceptions[exc.key] ?? exc.options[0]);
        const bad = exc.badValues.includes(val);
        if (exc.governedKey && exc.governedPatch) {
          const patchVal = exc.governedPatch(bad);
          const res = await proposeAndAccept(
            latestClient, step.id, exc.governedKey, exc.label, val, patchVal);
          if (res.client) latestClient = res.client;
          if (res.pending) pendingCount++;
        }
        if (exc.extraFieldWhenBad && bad) {
          const f = exc.extraFieldWhenBad;
          const raw = fullCollected[f.key];
          if (raw !== undefined && raw !== '' && f.governedKey) {
            const patchVal = f.toPatchValue ? f.toPatchValue(String(raw)) : raw;
            const res = await proposeAndAccept(latestClient, step.id, f.governedKey, f.label, String(raw), patchVal);
            if (res.client) latestClient = res.client;
            if (res.pending) pendingCount++;
          }
        }
        if (!bad) continue;
        const outcome = exc.outcome(val);
        if (outcome.kind === 'clarification') clarifications.push(outcome.text);
        else if (outcome.kind === 'request') {
          await createDebitAuthRequest(client.id, step.stageId ?? null, outcome.title, outcome.sub ?? outcome.title);
        }
      }
      (cfg.derivedClarifications?.(fullCollected) ?? []).forEach(t => clarifications.push(t));

      // 3) הבהרות → שיחת הפתיחה (קליטה חדשה) או הערה מקומית על השלב (לקוח קיים/פעיל).
      const nowIso = new Date().toISOString();
      if (clarifications.length > 0) {
        if (openingCallStep) {
          const existing = (openingCallStep.payload.clarifications ?? []) as Array<{ text: string; institution: InstitutionKey; at: string }>;
          const merged = [...existing, ...clarifications.map(text => ({ text, institution: key, at: nowIso }))];
          await advance(openingCallStep.id, 'note', {
            note: `יישור קו · ${INSTITUTION_NAMES[key]}: ${clarifications.length} נקודות לבירור`,
            clarifications: merged,
          });
        } else {
          await advance(step.id, 'note', { note: clarifications.join(' · ') });
        }
      }

      onClientPersisted(latestClient);

      // 4) סימון השלב עצמו כהושלם, עם תמונת המצב המלאה.
      const res = await advance(step.id, 'complete', {
        collected: fullCollected, exceptions, checkedAt: nowIso,
      });
      if (!res.ok) { setError(res.message || 'השמירה נכשלה.'); setSaving(false); return; }

      setSaving(false);
      if (pendingCount > 0) {
        // ‼ לא נדרס — הערך המקובל השתנה מאז שהמסך נטען. ההצעה נשארת ל-M1
        // (תיק המס, "עדכונים ממתינים"), לא נעלמת ולא כותבת בשקט.
        setError(`${pendingCount} ערכים הועברו לבדיקה בתיק המס (ערך מקובל השתנה בינתיים ולא נדרס).`);
      }
      onAdvanceInstitution(remaining.length > 0 ? remaining[0] : null);
    } catch (e) {
      setSaving(false);
      setError(e instanceof Error ? e.message : 'השמירה נכשלה.');
    }
  }

  return (
    <div className="ial-focus">
      <button type="button" className="ial-back" onClick={onClose}>→ {returnLabel}</button>
      <div className="ial-trail">
        {(['btl', 'vat', 'income'] as InstitutionKey[]).map(k => {
          const s = allSteps.find(x => x.payload.institution === k);
          const isDone = s && (s.status === 'completed' || s.status === 'verified');
          return (
            <span key={k} className={isDone ? 'is-done' : k === key ? 'is-on' : ''}>
              {isDone ? '✓ ' : ''}{INSTITUTION_NAMES[k]}
            </span>
          );
        })}
      </div>
      <div className="ial-card">
        <div className="ial-step">
          <div className="ial-focus-title">{INSTITUTION_NAMES[key]}</div>
          <div className="ial-kicker">לאן להיכנס</div>
          <div className="ial-route">
            {cfg.route.map((r, i) => (
              <span key={i}>{r}</span>
            ))}
          </div>
        </div>

        {cfg.sections.map(section => (
          <div className="ial-step" key={section.kicker}>
            <div className="ial-kicker">{section.kicker}</div>
            <div className="ial-fgrid">
              {section.fields.map(f => (
                <div key={f.key}>
                  <label>{f.label}</label>
                  {f.type === 'select' ? (
                    <select className="inp" value={String(collected[f.key] ?? '')}
                      onChange={e => setField(f.key, e.target.value)}>
                      <option value="">—</option>
                      {(f.options ?? []).map(o => <option key={o} value={o}>{o}</option>)}
                    </select>
                  ) : (
                    <input className="inp" type={f.type === 'number' ? 'number' : f.type === 'date' ? 'date' : 'text'}
                      placeholder={f.placeholder} value={String(collected[f.key] ?? '')}
                      onChange={e => setField(f.key, e.target.value)} />
                  )}
                  {f.note && <div className="m" style={{ fontSize: 11, color: 'var(--ink-4)', marginTop: 3 }}>{f.note}</div>}
                </div>
              ))}
            </div>
          </div>
        ))}

        {key === 'btl' && (
          <div className="ial-step">
            <div className="ial-kicker">רשימת עיסוקים</div>
            <OccupationsEditor occupations={occupations} onChange={setOccupations} />
          </div>
        )}

        <div className="ial-step ial-exc">
          <div className="ial-kicker">יש משהו חריג?</div>
          <div className="ial-fgrid">
            {cfg.exceptions.map(exc => {
              const val = String(exceptions[exc.key] ?? exc.options[0]);
              const bad = exc.badValues.includes(val);
              return (
                <div key={exc.key}>
                  <label>{exc.label}</label>
                  <select className="inp" value={val} onChange={e => setExc(exc.key, e.target.value)}>
                    {exc.options.map(o => <option key={o} value={o}>{o}</option>)}
                  </select>
                  {bad && exc.extraFieldWhenBad && (
                    <div style={{ marginTop: 6 }}>
                      <label>{exc.extraFieldWhenBad.label}</label>
                      <input className="inp" type={exc.extraFieldWhenBad.type === 'date' ? 'date' : 'text'}
                        value={String(collected[exc.extraFieldWhenBad.key] ?? '')}
                        onChange={e => setField(exc.extraFieldWhenBad!.key, e.target.value)} />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          {cfg.exceptions.some(exc => exc.badValues.includes(String(exceptions[exc.key] ?? exc.options[0]))) && (
            <div className="ial-exc-note">
              {cfg.exceptions
                .filter(exc => exc.badValues.includes(String(exceptions[exc.key] ?? exc.options[0])))
                .map(exc => {
                  const outcome = exc.outcome(String(exceptions[exc.key]));
                  return (
                    <div key={exc.key}>
                      {outcome.kind === 'request' ? `תיווצר בקשת לקוח (כטיוטה): ${outcome.title}`
                        : outcome.kind === 'clarification' ? `יירשם לבירור: ${outcome.text}` : null}
                    </div>
                  );
                })}
            </div>
          )}
        </div>

        <div className="ial-step ial-saved">
          <div className="ial-kicker">מה נשמר לתיק המס</div>
          {cfg.sections.flatMap(s => s.fields).filter(f => f.governedKey).map(f => (
            <div key={f.key} className="ial-srow">
              <span>{f.label}</span><b>{displayValue(f, collected[f.key])}</b>
            </div>
          ))}
          {key === 'btl' && <div className="ial-srow"><span>עיסוקים</span><b>{occupations.length || '—'}</b></div>}
        </div>

        {error && (
          <div className="ial-step" style={{ color: 'var(--err)', fontSize: 'var(--fs-13)' }}>{error}</div>
        )}

        <div className="ial-factbar">
          <button type="button" className="btn" onClick={onClose} disabled={saving}>חזרה</button>
          <button type="button" className="btn btn-primary" onClick={() => void finish()} disabled={saving}>
            {saving ? 'שומר…' : nextLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── עורך רשימת עיסוקים — חשיפה הדרגתית לפי סוג ─────────────────────────────

const OCC_TYPES = Object.keys(NI_OCCUPATION_TYPE_LABELS) as NiOccupationType[];

function OccupationsEditor({ occupations, onChange }: { occupations: NiOccupation[]; onChange: (o: NiOccupation[]) => void }) {
  function update(id: string, patch: Partial<NiOccupation>) {
    onChange(occupations.map(o => o.id === id ? { ...o, ...patch } : o));
  }
  function remove(id: string) {
    onChange(occupations.filter(o => o.id !== id));
  }
  function add() {
    onChange([...occupations, { id: `occ_${Date.now()}_${occupations.length}`, type: 'employee' }]);
  }
  return (
    <div>
      {occupations.map(o => (
        <div key={o.id} className="ial-occ">
          <div className="ial-occ-head">
            <select value={o.type} onChange={e => update(o.id, { type: e.target.value as NiOccupationType })}>
              {OCC_TYPES.map(t => <option key={t} value={t}>{NI_OCCUPATION_TYPE_LABELS[t]}</option>)}
            </select>
            <button type="button" className="ial-occ-remove" onClick={() => remove(o.id)} aria-label="הסר עיסוק">✕</button>
          </div>
          {o.type === 'employee' && (
            <div className="ial-fgrid">
              <div><label>שם מעביד</label><input className="inp" value={o.employerName ?? ''}
                onChange={e => update(o.id, { employerName: e.target.value })} /></div>
              <div><label>תיק ניכויים</label><input className="inp" value={o.withholdingFile ?? ''}
                onChange={e => update(o.id, { withholdingFile: e.target.value })} /></div>
              <div><label>מתאריך</label><input className="inp" type="date" value={o.fromDate ?? ''}
                onChange={e => update(o.id, { fromDate: e.target.value })} /></div>
              <div><label>עד תאריך</label><input className="inp" type="date" value={o.toDate ?? ''}
                onChange={e => update(o.id, { toDate: e.target.value })} /></div>
            </div>
          )}
          {(o.type === 'self_employed' || o.type === 'self_employed_non_qualifying') && (
            <div className="ial-fgrid">
              <div><label>מתאריך</label><input className="inp" type="date" value={o.fromDate ?? ''}
                onChange={e => update(o.id, { fromDate: e.target.value })} /></div>
              <div><label>עד תאריך</label><input className="inp" type="date" value={o.toDate ?? ''}
                onChange={e => update(o.id, { toDate: e.target.value })} /></div>
              <div><label>שעות שבועיות</label><input className="inp" type="number" value={o.weeklyHours ?? ''}
                onChange={e => update(o.id, { weeklyHours: Number(e.target.value) || undefined })} /></div>
              <div><label>הכנסה לצורך הגדרה</label><input className="inp" type="number" value={o.definitionIncome ?? ''}
                onChange={e => update(o.id, { definitionIncome: Number(e.target.value) || undefined })} /></div>
            </div>
          )}
        </div>
      ))}
      <button type="button" className="ial-add-occ" onClick={add}>+ הוסף עיסוק</button>
    </div>
  );
}

// ─── כרטיס הקבוצה — שלושת המוסדות, כפי שמופיע ברשימת הבקשות ────────────────

interface GroupProps {
  steps: OnboardingStep[];
  /** בחירת מוסד למיקוד — הבעלים על מצב המיקוד הוא OnboardingTab (השתלטות מלאה על המסך). */
  onOpen: (key: InstitutionKey) => void;
}

/** כרטיס הקבוצה — שלושת המוסדות. פתיחה קופצת להשתלטות מלאה על המסך אצל ההורה. */
export default function InstitutionAlignmentGroup({ steps, onOpen }: GroupProps) {
  const instSteps = (['btl', 'vat', 'income'] as InstitutionKey[])
    .map(k => steps.find(s => s.payload.institution === k))
    .filter((s): s is OnboardingStep => !!s);

  return (
    <div className="ial-grid">
      {instSteps.map(s => {
        const k = s.payload.institution as InstitutionKey;
        const done = s.status === 'completed' || s.status === 'verified';
        const checkedAt = s.payload.checkedAt ? new Date(String(s.payload.checkedAt)).toLocaleDateString('he-IL') : null;
        return (
          <button type="button" key={k} className={`ial-box ${done ? 'is-done' : ''}`}
            onClick={() => onOpen(k)} style={{ textAlign: 'right', cursor: 'pointer' }}>
            <b>{INSTITUTION_NAMES[k]}</b>
            <div className="m">{done ? `נבדק ${checkedAt ? '· ' + checkedAt : ''}` : 'טרם בוצע'}</div>
          </button>
        );
      })}
    </div>
  );
}

export { INSTITUTIONS };

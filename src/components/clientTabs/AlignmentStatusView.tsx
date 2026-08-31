// ─── תמונת מצב מול הרשויות — התוצר של יישור הקו ─────────────────────────────
// מקור UX מחייב: docs/prototypes/institution-alignment-status-v1.html
//
// ‼ המסקנות לפני הנתונים. יישור קו נעשה כדי לענות על שאלה אחת — "מה דורש
// טיפול אצל הלקוח הזה" — ועד היום התשובה הייתה מפוזרת בין שורות מתקפלות
// בתיק המס. כאן היא נמצאת בראש העמוד, והנתונים שמתחתיה הם ההוכחה.
//
// ‼ כל הנתונים גלויים, בלי מתקפלים. זו תצוגת סקירה שעוברים עליה ברצף לפני
// שיחה עם הלקוח או בתחילת שנה — כל לחיצה שנדרשת כדי לראות ערך היא לחיצה
// שמונעת השוואה בין הרשויות.

import { useMemo } from 'react';
import type { Client } from '../../types';
import { VAT_FREQ_LABELS } from '../../types/clientWorkspace';
import type { OnboardingStep } from '../../types/onboarding';
import { INSTITUTION_NAMES } from '../../types/onboarding';
import type { InstitutionKey } from '../../types/onboarding';
import { NI_OCCUPATION_TYPE_LABELS } from '../../types';
import { computeAuthorityFlags, actionableFlagCount } from '../../utils/authorityFlags';
import type { AuthorityFlag } from '../../utils/authorityFlags';
import { shortDate } from '../../utils/clientDerived';

const ORDER: InstitutionKey[] = ['btl', 'vat', 'income'];

interface Props {
  client: Client;
  /** שלושת שלבי המוסדות — לחותמות "נבדק", להיסטוריה, ולזיהוי בקשות קיימות. */
  steps: OnboardingStep[];
  /** כל בקשות הלקוח — לזיהוי דגל שכבר נוצרה לו בקשה. */
  allSteps?: OnboardingStep[];
  returnLabel: string;
  onClose: () => void;
  onRerun: () => void;
  rerunBusy?: boolean;
  onCreateTask: (title: string) => void;
  onCreateRequest: (flag: AuthorityFlag) => void;
  creatingRequestKey?: string | null;
}

function money(n?: number | null): string | null {
  if (n == null || Number.isNaN(n)) return null;
  return `${Math.abs(Math.round(n)).toLocaleString('he-IL')} ₪`;
}

type Tone = 'ok' | 'warn' | undefined;

interface Row {
  k: string;
  v: React.ReactNode;
  tone?: Tone;
  /** המפתח ב-collected של השלב — לצורך "מה השתנה מאז היישור הקודם". */
  diffKey?: string;
  /** ניסוח הערך הקודם, כשהוא שונה. */
  formatPrev?: (raw: unknown) => string;
}

/** יתרה: חיובי = חוב, שלילי = זכות, 0 = תקין. אותה מוסכמת כמו במחולל הדגלים. */
function balanceRow(label: string, value: number | undefined, diffKey: string): Row | null {
  if (value == null) return null;
  if (value > 0) return { k: label, v: `חוב של ${money(value)}`, tone: 'warn', diffKey, formatPrev: formatMoneyPrev };
  if (value < 0) return { k: label, v: `יתרת זכות ${money(value)}`, diffKey, formatPrev: formatMoneyPrev };
  return { k: label, v: 'אין יתרה', tone: 'ok', diffKey, formatPrev: formatMoneyPrev };
}

function formatMoneyPrev(raw: unknown): string {
  const n = Number(raw);
  return Number.isNaN(n) ? String(raw) : (money(n) ?? String(raw));
}

function authRow(label: string, value: boolean | undefined, diffKey: string): Row | null {
  if (value == null) return null;
  return value
    ? { k: label, v: 'קיימת', tone: 'ok', diffKey }
    : { k: label, v: 'אין הרשאה', tone: 'warn', diffKey };
}

/** שורות הרשות — רק ממה שבאמת קיים על הלקוח. שדה ריק אינו שורה. */
function rowsFor(key: InstitutionKey, client: Client): Row[] {
  const out: (Row | null)[] = [];

  if (key === 'btl') {
    out.push(balanceRow('יתרה', client.niBalance, 'niBalance'));
    if (client.niIncomeBasisMonthly != null) {
      out.push({ k: 'בסיס הכנסה למקדמות', v: `${money(client.niIncomeBasisMonthly)} לחודש`,
        diffKey: 'incomeBasisMonthly', formatPrev: formatMoneyPrev });
    }
    if (client.niAdvanceMonthly != null) {
      out.push({ k: 'מקדמה חודשית', v: money(client.niAdvanceMonthly),
        diffKey: 'niAdvanceMonthly', formatPrev: formatMoneyPrev });
    }
    const occ = client.niOccupations ?? [];
    if (occ.length > 0) {
      out.push({
        k: 'עיסוקים',
        v: occ.map(o => {
          const name = NI_OCCUPATION_TYPE_LABELS[o.type] ?? o.type;
          return o.employerName ? `${name} - ${o.employerName}` : name;
        }).join(' · '),
      });
    }
    out.push(authRow('הרשאה לחיוב חשבון', client.niDebitAuthorization, 'niDebitAuthorization'));
  }

  if (key === 'vat') {
    if (client.vatFileType) out.push({ k: 'סוג תיק', v: client.vatFileType, diffKey: 'vatFileType' });
    if (client.vatOpeningDate) out.push({ k: 'פתיחת תיק', v: shortDate(client.vatOpeningDate), diffKey: 'vatOpeningDate' });
    if (client.vatPrimaryIndustry) out.push({ k: 'ענף עיקרי', v: client.vatPrimaryIndustry, diffKey: 'vatPrimaryIndustry' });
    if (client.vatFrequency) {
      out.push({ k: 'תדירות דיווח', v: VAT_FREQ_LABELS[client.vatFrequency], diffKey: 'vatFrequency' });
    }
    if (client.vatLastReportPeriod) {
      out.push({ k: 'דוח אחרון שהוגש', v: client.vatLastReportPeriod, diffKey: 'vatLastReportPeriod' });
    }
    out.push(balanceRow('יתרה', client.vatBalance, 'vatBalance'));
    out.push(authRow('הרשאה לחיוב חשבון', client.vatDebitAuthorization, 'vatDebitAuthorization'));
  }

  if (key === 'income') {
    if (client.incomeTaxFileType) out.push({ k: 'סוג תיק', v: client.incomeTaxFileType, diffKey: 'incomeTaxFileType' });
    if (client.taxOfficeName) {
      out.push({ k: 'פקיד שומה', v: client.incomeTaxUnit ? `${client.taxOfficeName} · חוליה ${client.incomeTaxUnit}` : client.taxOfficeName, diffKey: 'taxOfficeName' });
    }
    if (client.incomeTaxEconomicIndustry) {
      out.push({ k: 'ענף כלכלי', v: client.incomeTaxEconomicIndustry, diffKey: 'incomeTaxEconomicIndustry' });
    }
    if (client.pitAdvancePercent != null) {
      const freq = client.pitAdvanceFrequency ? ` · ${VAT_FREQ_LABELS[client.pitAdvanceFrequency]}` : '';
      out.push({ k: 'מקדמות', v: `${client.pitAdvancePercent}%${freq}`, diffKey: 'pitAdvancePercent' });
    }
    out.push(balanceRow('יתרה', client.incomeTaxBalance, 'incomeTaxBalance'));
    if (client.incomeTaxReportingStatus) {
      out.push({
        k: 'מצב דיווחים', v: client.incomeTaxReportingStatus, diffKey: 'reportingStatus',
        tone: client.incomeTaxReportingStatus.trim() === 'אין דיווחים חסרים' ? 'ok' : 'warn',
      });
    }
    if (client.capitalDeclarationRequired != null) {
      out.push(client.capitalDeclarationRequired
        ? { k: 'הצהרת הון', tone: 'warn',
            v: `דרישה פתוחה${client.capitalDeclarationDeadline ? ` · עד ${shortDate(client.capitalDeclarationDeadline)}` : ''}` }
        : { k: 'הצהרת הון', v: 'אין דרישה פתוחה', tone: 'ok' });
    }
    out.push(authRow('הרשאה לחיוב חשבון', client.incomeTaxDebitAuthorization, 'incomeTaxDebitAuthorization'));
    if (client.withholdingStatus) {
      const map = { exempt: 'פטור מניכוי', rates: 'שיעורים לפי פעילות', none: 'אין אישור תקף' } as const;
      out.push({
        k: 'ניכוי מס במקור',
        v: client.withholdingStatus === 'rates' && client.withholdingDetail
          ? `${map.rates} · ${client.withholdingDetail}` : map[client.withholdingStatus],
        tone: client.withholdingStatus === 'none' ? 'warn' : 'ok',
        diffKey: 'withholdingStatus',
      });
    }
    if (client.bookStatus && client.bookStatus !== 'unknown') {
      out.push({
        k: 'ניהול ספרים',
        v: client.bookStatus === 'kosher' ? 'תקין' : 'נפסל',
        tone: client.bookStatus === 'kosher' ? 'ok' : 'warn',
        diffKey: 'bookStatus',
      });
    }
  }

  return out.filter((r): r is Row => r !== null);
}

/**
 * הערך באותו שדה בריצה הקודמת — או undefined כשאין היסטוריה או שלא השתנה.
 * ‼ אין היסטוריה ⇒ ריצה ראשונה ⇒ לא מסמנים דבר. סימון הכל ככתום בפעם
 * הראשונה היה הופך את הסימון לרעש חסר משמעות.
 */
function previousValue(step: OnboardingStep | undefined, diffKey?: string): unknown {
  if (!step || !diffKey) return undefined;
  const history = step.payload.history ?? [];
  if (history.length === 0) return undefined;
  const prev = history[history.length - 1]?.collected ?? {};
  const now = step.payload.collected ?? {};
  const before = prev[diffKey];
  const after = now[diffKey];
  if (before === undefined || before === null || before === '') return undefined;
  return String(before) === String(after) ? undefined : before;
}

/** תאריך היישור הקודם — לשורת המקרא. */
function previousCheckedAt(steps: OnboardingStep[]): string | undefined {
  const dates = steps
    .flatMap(s => (s.payload.history ?? []).map(h => h.checkedAt))
    .filter((d): d is string => !!d)
    .sort();
  return dates[dates.length - 1];
}

/** ריצות קודמות, מקובצות לפי מועד — התשתית כבר נשמרת ב-reopen. */
function pastRuns(steps: OnboardingStep[]): Array<{ at: string; count: number }> {
  const byDate = new Map<string, number>();
  for (const s of steps) {
    for (const h of s.payload.history ?? []) {
      if (!h.checkedAt) continue;
      const day = h.checkedAt.slice(0, 10);
      byDate.set(day, (byDate.get(day) ?? 0) + 1);
    }
  }
  return [...byDate.entries()]
    .map(([at, count]) => ({ at, count }))
    .sort((a, b) => b.at.localeCompare(a.at));
}

function FlagRow({ flag, onCreateTask, onCreateRequest, busy }: {
  flag: AuthorityFlag;
  onCreateTask: (title: string) => void;
  onCreateRequest: (flag: AuthorityFlag) => void;
  busy: boolean;
}) {
  return (
    <div className={`alst-flag is-${flag.severity}`}>
      <span className="alst-flag-dot" aria-hidden="true" />
      <div className="alst-flag-text">
        <b>{flag.title}</b>
        <span className="alst-flag-why">{flag.why}</span>
      </div>
      <div className="alst-flag-act">
        {flag.requestExists ? (
          <span className="alst-flag-done">✓ נוצרה בקשה ללקוח</span>
        ) : (
          <>
            {flag.actions.includes('request') && (
              <button type="button" className="ui-btn ui-btn-sm" disabled={busy}
                onClick={() => onCreateRequest(flag)}>
                {busy ? 'יוצר…' : 'צור בקשה ללקוח'}
              </button>
            )}
            {flag.actions.includes('task') && flag.taskTitle && (
              <button type="button" className="ui-btn ui-btn-sm"
                onClick={() => onCreateTask(flag.taskTitle!)}>צור משימה</button>
            )}
          </>
        )}
      </div>
    </div>
  );
}

export default function AlignmentStatusView({
  client, steps, allSteps, returnLabel, onClose, onRerun, rerunBusy,
  onCreateTask, onCreateRequest, creatingRequestKey,
}: Props) {
  const stepByKey = useMemo(() => {
    const m = new Map<InstitutionKey, OnboardingStep>();
    for (const s of steps) {
      const k = s.payload.institution as InstitutionKey | undefined;
      if (k) m.set(k, s);
    }
    return m;
  }, [steps]);

  const flags = useMemo(
    () => computeAuthorityFlags(client, allSteps ?? steps),
    [client, allSteps, steps],
  );
  const needsAction = actionableFlagCount(flags);
  const prevRunAt = previousCheckedAt(steps);
  const runs = pastRuns(steps);

  const anyChecked = ORDER.some(k => stepByKey.get(k)?.payload.checkedAt);

  return (
    <div className="alst-root">
      <button type="button" className="alst-back" onClick={onClose}>← {returnLabel}</button>

      <div className="alst-head">
        <div>
          <h2>תמונת מצב מול הרשויות</h2>
          <div className="alst-sub">מה שנמצא ברשויות ביישור הקו האחרון, והמסקנות שנגזרות ממנו.</div>
        </div>
        <div className="alst-head-act">
          {anyChecked && (
            <button type="button" className="ui-btn" onClick={() => window.print()}>הדפס / שמור PDF</button>
          )}
          <button type="button" className="ui-btn ui-btn-primary" disabled={rerunBusy} onClick={onRerun}>
            {rerunBusy ? 'מעדכן…' : anyChecked ? 'בצע יישור קו מחדש' : 'התחל יישור קו'}
          </button>
        </div>
      </div>

      {!anyChecked ? (
        <div className="alst-empty">
          טרם בוצע יישור קו מול הרשויות עבור {client.firstName} {client.lastName}.
          <span>אחרי שייבדקו ביטוח לאומי, מע״מ ומס הכנסה - התמונה המלאה תופיע כאן.</span>
        </div>
      ) : (
        <>
          <div className="alst-stamps">
            {ORDER.map(k => {
              const at = stepByKey.get(k)?.payload.checkedAt;
              return (
                <span key={k} className={`alst-stamp ${at ? '' : 'is-missing'}`}>
                  {INSTITUTION_NAMES[k]} {at ? `· נבדק ${shortDate(String(at))}` : '· טרם נבדק'}
                </span>
              );
            })}
          </div>

          <div className="alst-secthead">
            דורש טיפול{needsAction > 0 ? ` · ${needsAction}` : ''}
          </div>
          <div className="alst-flags">
            {flags.length === 0 ? (
              <div className="alst-allgood">✓ לא נמצאו נקודות שדורשות טיפול.</div>
            ) : (
              flags.map(f => (
                <FlagRow key={f.key} flag={f}
                  onCreateTask={onCreateTask} onCreateRequest={onCreateRequest}
                  busy={creatingRequestKey === f.key} />
              ))
            )}
          </div>

          <div className="alst-secthead">הנתונים המלאים</div>
          <div className="alst-auths">
            {ORDER.map(k => {
              const step = stepByKey.get(k);
              const rows = rowsFor(k, client);
              const at = step?.payload.checkedAt;
              return (
                <div className="alst-auth" key={k}>
                  <div className="alst-auth-head">
                    <b>{INSTITUTION_NAMES[k]}</b>
                    <span className="alst-auth-when">{at ? shortDate(String(at)) : 'טרם נבדק'}</span>
                  </div>
                  {rows.length === 0 ? (
                    <div className="alst-auth-empty">לא נאספו נתונים.</div>
                  ) : rows.map(r => {
                    const prev = previousValue(step, r.diffKey);
                    return (
                      <div className="alst-arow" key={r.k}>
                        <span className="alst-arow-k">{r.k}</span>
                        <span className={`alst-arow-v ${r.tone ? `is-${r.tone}` : ''}`}>
                          {r.v}
                          {prev !== undefined && <span className="alst-chg" aria-hidden="true" />}
                          {prev !== undefined && (
                            <span className="alst-diff">
                              היה {r.formatPrev ? r.formatPrev(prev) : String(prev)} ביישור הקודם
                            </span>
                          )}
                        </span>
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>

          <div className="alst-legend">
            {prevRunAt && <span><span className="alst-chg" /> השתנה מאז היישור הקודם ({shortDate(prevRunAt)})</span>}
            <span>אדום - דורש טיפול · ירוק - תקין</span>
          </div>

          {runs.length > 0 && (
            <>
              <div className="alst-secthead">יישורי קו קודמים</div>
              <div className="alst-runs">
                {runs.map(r => (
                  <div className="alst-run" key={r.at}>
                    <span className="alst-run-date">{shortDate(r.at)}</span>
                    <span className="alst-run-text">{r.count} רשויות</span>
                  </div>
                ))}
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}

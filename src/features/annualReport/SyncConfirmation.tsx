// ─── מסך Sync Confirmation — סוגר את לולאת השאלון ↔ תיק המס ────────────────
//
// מופיע אחרי סיום השאלון. מציג את כל הדיפים בין מודל הסשן (התשובות
// שניתנו השנה) לבין הפרופיל הקיים בכרטיס.
//
// ‼ המסך הזה כבר לא כותב לכרטיס. הוא רק **מציע** שינויים לתיק המס
// (propose_tax_facts) — הכתיבה בפועל קורית רק אחרי שהרו"ח מאשר אותם שם,
// בנפרד, בזמן שנוח לו. השאלון הוא מקור מידע, לא הסמכות על הפרופיל
// (הכרעת מוצר, ראה docs/prototypes/README.md).
import { useState, useMemo } from 'react';
import type { Client } from '../../types';
import type { ProposedFact } from '../../types/taxFacts';
import type { AnnualReportSession } from './types';
import { clientDisplayName, spouseDisplayName } from './profile';

interface Props {
  session: AnnualReportSession;
  client: Client;
  /** מציע לתיק המס — לא כותב לכרטיס. מחזיר ok גם כשלא הוצע כלום. */
  onProposeChanges: (items: ProposedFact[]) => Promise<{ ok: boolean; error?: string }>;
  onContinue: () => void;
}

interface Diff {
  key: string;
  label: string;
  fromCard: string;
  fromQuestionnaire: string;
  /** {} = הצעה מידעית בלבד — לא ניתן ליישם אוטומטית (למשל מספר ילדים,
   *  שדורש הוספת רשומת ילד עם תאריך לידה אמיתי, לא ניחוש). */
  apply: (client: Client) => Partial<Client>;
}

export default function SyncConfirmation({ session, client, onProposeChanges, onContinue }: Props) {
  const diffs = useMemo(() => computeDiffs(session, client), [session, client]);
  const [selected, setSelected] = useState<Set<string>>(() => new Set(diffs.map((d) => d.key)));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleApply() {
    if (selected.size === 0) {
      onContinue();
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const items: ProposedFact[] = diffs
        .filter((d) => selected.has(d.key))
        .map((d) => {
          const patch = d.apply(client);
          const patchKeys = Object.keys(patch);
          // תמונת מצב של הערך המקובל *עכשיו*, לאותם מפתחות שה-patch נוגע בהם —
          // לא רק טקסט לתצוגה. השרת משווה אותה מול הערך המקובל בזמן האישור:
          // אם מישהו כבר שינה את הערך בינתיים, האישור נדחה כ-stale ולא דורס בשקט.
          const oldPatch: Record<string, unknown> = {};
          for (const k of patchKeys) oldPatch[k] = (client as unknown as Record<string, unknown>)[k] ?? null;
          return {
            fieldKey: d.key,
            label: d.label,
            oldValue: { display: d.fromCard, ...(patchKeys.length > 0 ? { patch: oldPatch } : {}) },
            newValue: {
              display: d.fromQuestionnaire,
              ...(patchKeys.length > 0 ? { patch } : {}),
            },
          };
        });
      const res = await onProposeChanges(items);
      if (!res.ok) {
        setError(res.error ?? 'ההצעה לתיק המס נכשלה');
        setSaving(false);
        return;
      }
      onContinue();
    } catch (e) {
      console.error('[sync] failed', e);
      setError('ההצעה לתיק המס נכשלה');
      setSaving(false);
    }
  }

  if (diffs.length === 0) {
    return (
      <div style={{ maxWidth: 700, margin: '2rem auto', padding: '0 1rem' }}>
        <div className="card">
          <div className="card-body" style={{ textAlign: 'center', padding: '2rem' }}>
            <div style={{ fontSize: '34px' }}>✅</div>
            <h2 style={{ margin: '.5rem 0' }}>התיק מעודכן</h2>
            <p style={{ color: 'var(--gray-600)' }}>
              כל התשובות בשאלון תואמות את תיק המס. אין מה להציע.
            </p>
            <button className="btn btn-primary btn-lg" onClick={onContinue}>המשך לפלט →</button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 800, margin: '1.5rem auto', padding: '0 1rem' }}>
      <div style={{ marginBottom: '1.25rem' }}>
        <h2 style={{ margin: 0, fontSize: '24px' }}>עדכונים לתיק המס</h2>
        <p style={{ margin: '.4rem 0 0', color: 'var(--gray-600)', fontSize: '14px' }}>
          זוהו {diffs.length} שינויים בין התשובות בשאלון לבין תיק המס. סמן אילו להציע.
          העדכון עצמו לא קורה כאן - הוא ממתין לאישורך בתיק המס, כדי שלא ידרוס בשקט ערך שנקבע ידנית.
        </p>
        {error && (
          <p style={{ margin: '.6rem 0 0', color: 'var(--red)', fontSize: '13px' }}>⚠ {error}</p>
        )}
      </div>

      <div className="card">
        <div className="card-body" style={{ padding: 0 }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: 'var(--gray-50)', borderBottom: '2px solid var(--gray-200)' }}>
                <th style={{ padding: '.6rem', textAlign: 'right', width: 40 }}></th>
                <th style={{ padding: '.6rem', textAlign: 'right' }}>שדה</th>
                <th style={{ padding: '.6rem', textAlign: 'right' }}>בכרטיס היום</th>
                <th style={{ padding: '.6rem', textAlign: 'right' }}>תשובה בשאלון</th>
              </tr>
            </thead>
            <tbody>
              {diffs.map((d) => (
                <tr key={d.key} style={{ borderBottom: '1px solid var(--gray-100)' }}>
                  <td style={{ padding: '.6rem' }}>
                    <input
                      type="checkbox"
                      checked={selected.has(d.key)}
                      onChange={(e) => {
                        const next = new Set(selected);
                        if (e.target.checked) next.add(d.key); else next.delete(d.key);
                        setSelected(next);
                      }}
                    />
                  </td>
                  <td style={{ padding: '.6rem', fontWeight: 500 }}>{d.label}</td>
                  <td style={{ padding: '.6rem', color: 'var(--gray-500)', textDecoration: 'line-through' }}>{d.fromCard}</td>
                  <td style={{ padding: '.6rem', color: 'var(--ok)', fontWeight: 500 }}>← {d.fromQuestionnaire}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div style={{ marginTop: '1.25rem', display: 'flex', justifyContent: 'space-between', gap: '.5rem' }}>
        <button className="btn btn-ghost" onClick={onContinue} disabled={saving}>
          ⊘ דלג (אל תציע כלום לתיק המס)
        </button>
        <div style={{ display: 'flex', gap: '.5rem' }}>
          <button
            className="btn btn-secondary"
            onClick={() => setSelected(new Set(diffs.map((d) => d.key)))}
            disabled={saving}
          >
            סמן הכל
          </button>
          <button
            className="btn btn-secondary"
            onClick={() => setSelected(new Set())}
            disabled={saving}
          >
            נקה הכל
          </button>
          <button className="btn btn-primary btn-lg" onClick={handleApply} disabled={saving}>
            {saving ? 'מציע...' : `הצע ${selected.size} שינויים לתיק המס והמשך`}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── חישוב הדיפים בין session.model לכרטיס ─────────────────────────────────

function computeDiffs(session: AnnualReportSession, client: Client): Diff[] {
  const out: Diff[] = [];
  const m = session.model;

  // מצב משפחתי
  if (m.identity?.maritalStatus) {
    const inCard = client.familyStatus;
    const mapped = m.identity.maritalStatus === 'separated' ? 'divorced' : m.identity.maritalStatus;
    if (inCard !== mapped) {
      out.push({
        key: 'maritalStatus',
        label: 'סטטוס משפחתי',
        fromCard: familyStatusLabel(inCard),
        fromQuestionnaire: maritalStatusLabel(m.identity.maritalStatus),
        apply: () => ({ familyStatus: mapped as Client['familyStatus'] }),
      });
    }
  }

  // מספר ילדים — לא מעדכנים את הרשימה (זה מעדן ידני), רק מציינים פער אם יש
  if (m.identity?.childrenCount !== undefined) {
    const cardCount = (client.children ?? []).length;
    if (cardCount !== m.identity.childrenCount) {
      out.push({
        key: 'childrenCount',
        label: 'מספר ילדים',
        fromCard: `${cardCount} ילדים בכרטיס`,
        fromQuestionnaire: `${m.identity.childrenCount} בשאלון (יש לעדכן ידנית את הרשימה בכרטיס)`,
        apply: () => ({}), // לא ניתן לסנכרן אוטומטית — דורש פעולה ידנית
      });
    }
  }

  // נכות
  if (m.identity?.hasDisability !== undefined) {
    const cardPct = client.disabilityPercentage ?? 0;
    const cardHasDisability = cardPct > 0;
    if (cardHasDisability !== m.identity.hasDisability) {
      out.push({
        key: 'hasDisability',
        label: 'נכות מוכרת',
        fromCard: cardHasDisability ? `${cardPct}%` : 'אין',
        fromQuestionnaire: m.identity.hasDisability ? 'יש (יש להזין אחוז בכרטיס)' : 'אין',
        apply: () => m.identity.hasDisability ? {} : { disabilityPercentage: 0 },
      });
    }
  }

  // תושבות
  if (m.identity?.residencyType) {
    const cardIsImmigrant = !!client.isNewImmigrant;
    const cardIsReturning = !!client.isReturningResident;
    const expectedImmigrant = m.identity.residencyType === 'new_immigrant';
    const expectedReturning = m.identity.residencyType === 'returning_resident';
    if (cardIsImmigrant !== expectedImmigrant || cardIsReturning !== expectedReturning) {
      out.push({
        key: 'residency',
        label: 'תושבות',
        fromCard: cardIsImmigrant ? 'עולה חדש' : cardIsReturning ? 'תושב חוזר' : 'תושב ותיק',
        fromQuestionnaire: residencyLabel(m.identity.residencyType),
        apply: () => ({
          isNewImmigrant: expectedImmigrant,
          isReturningResident: expectedReturning,
        }),
      });
    }
  }

  // תרומות
  if (m.deductionsCredits?.donationAmount !== undefined && m.deductionsCredits.donationAmount > 0) {
    const cardAmt = client.donationsAnnual ?? 0;
    if (cardAmt !== m.deductionsCredits.donationAmount) {
      out.push({
        key: 'donations',
        label: 'תרומות שנתיות',
        fromCard: cardAmt > 0 ? `${cardAmt.toLocaleString('he-IL')} ₪` : 'לא הוזן',
        fromQuestionnaire: `${m.deductionsCredits.donationAmount.toLocaleString('he-IL')} ₪`,
        apply: () => ({ donationsAnnual: m.deductionsCredits.donationAmount }),
      });
    }
  }

  // ביטוח חיים
  if (m.deductionsCredits?.lifeInsuranceAnnual !== undefined && m.deductionsCredits.lifeInsuranceAnnual > 0) {
    const cardAmt = client.lifeInsuranceAnnual ?? 0;
    if (cardAmt !== m.deductionsCredits.lifeInsuranceAnnual) {
      out.push({
        key: 'lifeInsurance',
        label: 'ביטוח חיים',
        fromCard: cardAmt > 0 ? `${cardAmt.toLocaleString('he-IL')} ₪` : 'לא הוזן',
        fromQuestionnaire: `${m.deductionsCredits.lifeInsuranceAnnual.toLocaleString('he-IL')} ₪`,
        apply: () => ({ lifeInsuranceAnnual: m.deductionsCredits.lifeInsuranceAnnual, hasLifeInsurance: true }),
      });
    }
  }

  // תואר אקדמי
  if (m.deductionsCredits?.hasAcademicDegree !== undefined) {
    if (!!client.hasAcademicDegree !== m.deductionsCredits.hasAcademicDegree) {
      out.push({
        key: 'academicDegree',
        label: 'תואר אקדמי',
        fromCard: client.hasAcademicDegree ? 'כן' : 'לא',
        fromQuestionnaire: m.deductionsCredits.hasAcademicDegree ? 'כן' : 'לא',
        apply: () => ({ hasAcademicDegree: m.deductionsCredits.hasAcademicDegree ?? false }),
      });
    }
  }

  // חייל משוחרר (אין שדה ישיר, אבל יש completedIdf)
  if (m.deductionsCredits?.isDischargedSoldier !== undefined) {
    // נשמר רק במודל; אינדיקציה לפרופיל היא completedIdf
    // לא ננסה לסנכרן כי החלון הוא 2-3 שנים מתאריך שחרור.
  }

  // חברה משפחתית / CFC / קיבוץ
  if (m.specialSituations?.isFamilyCompanyMember !== undefined && !!client.isFamilyCompanyMember !== m.specialSituations.isFamilyCompanyMember) {
    out.push({
      key: 'familyCo',
      label: 'חבר בחברה משפחתית',
      fromCard: client.isFamilyCompanyMember ? 'כן' : 'לא',
      fromQuestionnaire: m.specialSituations.isFamilyCompanyMember ? 'כן' : 'לא',
      apply: () => ({ isFamilyCompanyMember: m.specialSituations.isFamilyCompanyMember ?? false }),
    });
  }
  if (m.specialSituations?.isForeignControllingShareholder !== undefined && !!client.isForeignControllingShareholder !== m.specialSituations.isForeignControllingShareholder) {
    out.push({
      key: 'cfc',
      label: 'בעל שליטה בחברה זרה (CFC)',
      fromCard: client.isForeignControllingShareholder ? 'כן' : 'לא',
      fromQuestionnaire: m.specialSituations.isForeignControllingShareholder ? 'כן' : 'לא',
      apply: () => ({ isForeignControllingShareholder: m.specialSituations.isForeignControllingShareholder ?? false }),
    });
  }
  if (m.specialSituations?.isKibbutzMember !== undefined && !!client.isKibbutzMember !== m.specialSituations.isKibbutzMember) {
    out.push({
      key: 'kibbutz',
      label: 'חבר קיבוץ',
      fromCard: client.isKibbutzMember ? 'כן' : 'לא',
      fromQuestionnaire: m.specialSituations.isKibbutzMember ? 'כן' : 'לא',
      apply: () => ({ isKibbutzMember: m.specialSituations.isKibbutzMember ?? false }),
    });
  }

  // ── מקורות הכנסה שהתגלו בשאלון ומעדכנים את הפרופיל ──
  const src = m.income?.sources ?? [];

  // נכס מושכר
  if (src.includes('rental') && !client.hasResidentialProperty) {
    out.push({
      key: 'rental',
      label: 'נכס מושכר',
      fromCard: 'לא מסומן נדל"ן בכרטיס',
      fromQuestionnaire: (m.income?.rentalGrossAnnual ?? 0) > 0
        ? `נכס מושכר · שכ"ד ${(m.income!.rentalGrossAnnual!).toLocaleString('he-IL')} ₪/שנה`
        : 'יש נכס מושכר',
      apply: () => ({
        hasResidentialProperty: true,
        numberOfProperties: Math.max(1, client.numberOfProperties || 0),
      }),
    });
  }

  // שוק ההון
  const hasCapitalInModel = src.includes('capital') || (m.income?.capitalSubTypes ?? []).length > 0;
  if (hasCapitalInModel && !client.hasCapitalIncome) {
    out.push({
      key: 'capital',
      label: 'פעילות בשוק ההון',
      fromCard: 'לא מסומן',
      fromQuestionnaire: (m.income?.capitalSubTypes ?? []).length > 0
        ? `כן (${(m.income!.capitalSubTypes!).join(', ')})`
        : 'כן',
      apply: () => ({ hasCapitalIncome: true }),
    });
  }

  // בעל מניות מהותי
  if (m.income?.isControllingShareholder !== undefined && !!client.isSubstantialShareholder !== m.income.isControllingShareholder) {
    out.push({
      key: 'substantialShareholder',
      label: 'בעל מניות מהותי (10%+)',
      fromCard: client.isSubstantialShareholder ? 'כן' : 'לא',
      fromQuestionnaire: m.income.isControllingShareholder ? 'כן' : 'לא',
      apply: () => ({ isSubstantialShareholder: m.income.isControllingShareholder ?? false }),
    });
  }

  // הגרלות ופרסים
  if (m.income?.hasGamblingOrPrizes && !client.hasGamblingIncome) {
    out.push({
      key: 'gambling',
      label: 'הכנסות מהגרלות/פרסים',
      fromCard: 'לא מסומן',
      fromQuestionnaire: 'כן',
      apply: () => ({ hasGamblingIncome: true }),
    });
  }

  // בן הזוג הרשום (הכרעת רו"ח במאזן) ← תיק מס הכנסה בכרטיס
  if (m.spouse?.registeredRole) {
    const wantOwner = m.spouse.registeredRole === 'spouse_only' ? 'spouse' as const : 'client' as const;
    const files = client.taxFiles ?? [];
    const itFile = files.find((f) => f.authority === 'income_tax');
    if (!itFile || itFile.owner !== wantOwner) {
      out.push({
        key: 'itFileOwner',
        label: 'תיק מס הכנסה - על שם מי',
        fromCard: itFile ? `ע"ש ${itFile.owner === 'spouse' ? spouseDisplayName(client) : clientDisplayName(client)}` : 'לא מוגדר תיק',
        fromQuestionnaire: `ע"ש ${wantOwner === 'spouse' ? spouseDisplayName(client) : clientDisplayName(client)} (בן/בת הזוג הרשום/ה)`,
        apply: (c) => {
          const cur = c.taxFiles ?? [];
          const existing = cur.find((f) => f.authority === 'income_tax');
          const ownerId = wantOwner === 'spouse' ? (c.spouseIdNumber || undefined) : (c.idNumber || undefined);
          if (existing) {
            return {
              taxFiles: cur.map((f) => f.authority === 'income_tax'
                ? { ...f, owner: wantOwner, fileNumber: f.fileNumber || ownerId }
                : f),
            };
          }
          return {
            taxFiles: [...cur, {
              id: `tf-${Date.now()}`, authority: 'income_tax' as const,
              owner: wantOwner, repStatus: 'none' as const, fileNumber: ownerId,
            }],
          };
        },
      });
    }
  }

  // נכסים/הכנסות בחו"ל
  const foreignInModel = src.includes('foreign') || m.openingDeclarations?.hasForeignAssetsOverThreshold === true;
  if (foreignInModel && !client.hasForeignAssets) {
    out.push({
      key: 'foreign',
      label: 'הכנסות/נכסים בחו"ל',
      fromCard: 'לא מסומן',
      fromQuestionnaire: m.income?.foreignCountries ? `כן (${m.income.foreignCountries})` : 'כן',
      apply: () => ({ hasForeignAssets: true }),
    });
  }

  // תעסוקת בן/בת הזוג ← spouseWorking בכרטיס
  if (m.identity?.spouseHasIncome !== undefined && client.familyStatus === 'married'
      && client.spouseWorking !== m.identity.spouseHasIncome) {
    const val = m.identity.spouseHasIncome;
    out.push({
      key: 'spouseWorking',
      label: 'תעסוקת בן/בת הזוג',
      fromCard: client.spouseWorking ? 'עובד/ת' : 'לא עובד/ת',
      fromQuestionnaire: val ? (m.spouse?.has106 ? 'שכיר/ה' : m.spouse?.hasBusinessIncome ? 'עצמאי/ת' : 'יש הכנסה') : 'ללא הכנסה',
      apply: () => ({ spouseWorking: val }),
    });
  }

  // בנקים מהשאלון ← חשבונות בנק בכרטיס (רק כשהכרטיס ריק — לא דורסים פירוט קיים)
  const bankNames = (m.accounts?.bankNames ?? '').trim();
  if (bankNames && (client.bankAccounts ?? []).length === 0) {
    const names = bankNames.split(/[,،;\/]+| ו/).map((s) => s.trim()).filter((s) => s.length > 1);
    if (names.length > 0) {
      out.push({
        key: 'bankAccounts',
        label: 'חשבונות בנק',
        fromCard: 'לא הוזנו',
        fromQuestionnaire: names.join(', '),
        apply: () => ({
          bankAccounts: names.map((n, i) => ({
            id: `bank-${Date.now()}-${i}`, bankName: n, isPrimary: i === 0,
          })),
        }),
      });
    }
  }

  // בתי השקעות מהשאלון ← חשבונות השקעה בכרטיס
  const investNames = (m.accounts?.investmentInstitutions ?? '').trim();
  if (investNames && (client.investmentAccounts ?? []).length === 0) {
    const names = investNames.split(/[,،;\/]+| ו/).map((s) => s.trim()).filter((s) => s.length > 1);
    if (names.length > 0) {
      out.push({
        key: 'investmentAccounts',
        label: 'חשבונות השקעה',
        fromCard: 'לא הוזנו',
        fromQuestionnaire: names.join(', '),
        apply: () => ({
          investmentAccounts: names.map((n, i) => ({
            id: `inv-${Date.now()}-${i}`, institutionName: n,
          })),
        }),
      });
    }
  }

  return out;
}

function familyStatusLabel(s?: string): string {
  return ({ single: 'רווק/ה', married: 'נשוי/אה', divorced: 'גרוש/ה', widowed: 'אלמן/ה', singleParent: 'הורה יחיד' } as Record<string, string>)[s ?? ''] ?? 'לא מוגדר';
}
function maritalStatusLabel(s?: string): string {
  return ({ single: 'רווק/ה', married: 'נשוי/אה', divorced: 'גרוש/ה', widowed: 'אלמן/ה', separated: 'פרוד/ה' } as Record<string, string>)[s ?? ''] ?? '';
}
function residencyLabel(s?: string): string {
  return ({ resident: 'תושב ותיק', new_immigrant: 'עולה חדש', returning_resident: 'תושב חוזר' } as Record<string, string>)[s ?? ''] ?? '';
}

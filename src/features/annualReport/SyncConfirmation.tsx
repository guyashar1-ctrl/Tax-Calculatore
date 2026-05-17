// ─── מסך Sync Confirmation — סוגר את לולאת השאלון ↔ הכרטיס ─────────────────
//
// מופיע אחרי סיום השאלון. מציג את כל הדיפים בין מודל הסשן (התשובות
// שניתנו השנה) לבין הפרופיל הקיים בכרטיס. המשתמש מאשר אילו שינויים
// להעביר לפרופיל לפני שעוברים למסך הפלט.

import { useState, useMemo } from 'react';
import type { Client } from '../../types';
import type { AnnualReportSession } from './types';

interface Props {
  session: AnnualReportSession;
  client: Client;
  onUpdateClient: (client: Client) => Promise<Client>;
  onContinue: () => void;
}

interface Diff {
  key: string;
  label: string;
  fromCard: string;
  fromQuestionnaire: string;
  apply: (client: Client) => Partial<Client>;
}

export default function SyncConfirmation({ session, client, onUpdateClient, onContinue }: Props) {
  const diffs = useMemo(() => computeDiffs(session, client), [session, client]);
  const [selected, setSelected] = useState<Set<string>>(() => new Set(diffs.map((d) => d.key)));
  const [saving, setSaving] = useState(false);

  async function handleApply() {
    if (selected.size === 0) {
      onContinue();
      return;
    }
    setSaving(true);
    try {
      let updates: Partial<Client> = {};
      for (const d of diffs) {
        if (selected.has(d.key)) updates = { ...updates, ...d.apply(client) };
      }
      await onUpdateClient({ ...client, ...updates, updatedAt: new Date().toISOString() });
      onContinue();
    } catch (e) {
      console.error('[sync] failed', e);
      setSaving(false);
    }
  }

  if (diffs.length === 0) {
    return (
      <div style={{ maxWidth: 700, margin: '2rem auto', padding: '0 1rem' }}>
        <div className="card">
          <div className="card-body" style={{ textAlign: 'center', padding: '2rem' }}>
            <div style={{ fontSize: '3rem' }}>✅</div>
            <h2 style={{ margin: '.5rem 0' }}>הפרופיל מסונכרן</h2>
            <p style={{ color: 'var(--gray-600)' }}>
              כל התשובות בשאלון תואמות את הנתונים בכרטיס. אין מה לעדכן.
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
        <h2 style={{ margin: 0, fontSize: '1.4rem' }}>🔄 סנכרון פרופיל הלקוח</h2>
        <p style={{ margin: '.4rem 0 0', color: 'var(--gray-600)', fontSize: '.9rem' }}>
          זוהו {diffs.length} שינויים בין התשובות בשאלון לבין הפרופיל בכרטיס.
          סמן אילו לעדכן בכרטיס. סימון ↔ הפרופיל מעודכן, ביטול סימון ↔ הנתון נשאר רק בשאלון השנה.
        </p>
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
                  <td style={{ padding: '.6rem', color: '#16a34a', fontWeight: 500 }}>← {d.fromQuestionnaire}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div style={{ marginTop: '1.25rem', display: 'flex', justifyContent: 'space-between', gap: '.5rem' }}>
        <button className="btn btn-ghost" onClick={onContinue} disabled={saving}>
          ⊘ דלג (אל תעדכן את הכרטיס)
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
            {saving ? 'מעדכן...' : `✓ עדכן ${selected.size} שינויים והמשך`}
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

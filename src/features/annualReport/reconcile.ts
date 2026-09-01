// ─── התאמה בין תשובות השאלון לכרטיס — מקור אחד ─────────────────────────────
// ‼ הקוד הזה ישב בתוך SyncConfirmation.tsx. הוא הוצא לכאן כדי ששני הצרכנים
// ישתמשו **באותה לוגיקה בדיוק** ולא בשני עותקים שיסטו זה מזה:
//   · SyncConfirmation — הרו"ח עובר על השאלון במסך הדוח השנתי.
//   · תיק המס — קליטת שאלון שהלקוח מילא בעצמו בדף האישי (V6).
// שינוי כלל התאמה כאן משנה את שניהם, וזו הכוונה.
import type { Client } from '../../types';
import type { ProposedFact } from '../../types/taxFacts';
import type { AnnualReportSession } from './types';
import { clientDisplayName, spouseDisplayName } from './profile';

export interface Diff {
  key: string;
  label: string;
  fromCard: string;
  fromQuestionnaire: string;
  /** {} = הצעה מידעית בלבד — לא ניתן ליישם אוטומטית (למשל מספר ילדים,
   *  שדורש הוספת רשומת ילד עם תאריך לידה אמיתי, לא ניחוש). */
  apply: (client: Client) => Partial<Client>;
}

/** ‼ דיף בלי patch הוא מידע בלבד — אי אפשר להחיל אותו, רק להציג. */
export function isApplicable(d: Diff, client: Client): boolean {
  return Object.keys(d.apply(client)).length > 0;
}

/** בונה פריט הצעה אחד, כולל תמונת המצב שמאפשרת לשרת לזהות דריסה. */
export function toProposedFact(d: Diff, client: Client): ProposedFact {
  const patch = d.apply(client);
  const patchKeys = Object.keys(patch);
  const oldPatch: Record<string, unknown> = {};
  for (const k of patchKeys) oldPatch[k] = (client as unknown as Record<string, unknown>)[k] ?? null;
  return {
    fieldKey: d.key,
    label: d.label,
    oldValue: { display: d.fromCard, ...(patchKeys.length > 0 ? { patch: oldPatch } : {}) },
    newValue: { display: d.fromQuestionnaire, ...(patchKeys.length > 0 ? { patch } : {}) },
  };
}

/**
 * ‼ מקבל רק את מה שהוא באמת קורא (`model`), ולא `AnnualReportSession` מלא:
 * קליטת השאלון בתיק המס שולפת מהמסד שלוש עמודות בלבד, ודרישת סשן שלם שם
 * הייתה מחייבת יציקה שקרית של שדות שלא נטענו.
 */
export function computeDiffs(session: Pick<AnnualReportSession, 'model'>, client: Client): Diff[] {
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

  // ── שדות V6 של תיק המס ──────────────────────────────────────────────
  // ‼ אלה נכנסים דרך אותו מסלול התאמה כמו כל השאר: אם בכרטיס אין ערך, זו
  // לא מחלוקת והשינוי נקלט; אם יש ערך אחר, הוא ממתין להכרעת הרו"ח.

  const cryptoInModel = (m.income?.capitalSubTypes ?? []).includes('crypto');
  if (cryptoInModel && !client.hasCrypto) {
    out.push({
      key: 'hasCrypto',
      label: 'מטבעות דיגיטליים',
      fromCard: 'לא מסומן',
      fromQuestionnaire: 'כן - היו עסקאות',
      apply: () => ({ hasCrypto: true }),
    });
  }

  const reserveDays = m.deductionsCredits?.reserveCombatDaysPrevYear;
  if (reserveDays != null && reserveDays !== (client.reserveCombatDaysPrevYear ?? 0)) {
    out.push({
      key: 'reserveCombatDaysPrevYear',
      label: 'ימי מילואים כלוחם',
      fromCard: client.reserveCombatDaysPrevYear ? `${client.reserveCombatDaysPrevYear} ימים` : 'לא הוזן',
      fromQuestionnaire: reserveDays > 0 ? `${reserveDays} ימים` : 'לא היו',
      apply: () => ({ reserveCombatDaysPrevYear: reserveDays }),
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

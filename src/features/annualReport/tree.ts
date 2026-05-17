// ─── עץ ההחלטות לשאלון הדוח השנתי — גרסה 2 (גלים א+ב) ──────────────────────
// מכסה את כל סעיפי 1301 שניתן לתחקר ברמת triage. שאלות data-collection
// מפורטות יבואו בשלב הבא כשנבנה את שכבת המילוי.

import type {
  QuestionTree,
  TaxpayerModel,
  MaritalStatus,
  IncomeSourceKind,
  DisabilityBand,
  RegisteredSpouseRole,
  BizRevenueBand,
  WithholdingSource,
} from './types';

export const annualReportTree: QuestionTree = {
  rootNodeId: 'identity_basics',
  nodes: {
    // ═══ א. זהות בסיסית ═════════════════════════════════════════════════════
    identity_basics: {
      id: 'identity_basics',
      question: 'האם הנתונים האלה מהכרטיס מעודכנים ונכונים?',
      helpText: 'שדות חסרים יתווספו אוטומטית לרשימת הדרישות בסוף התהליך — אין צורך לעצור עכשיו.',
      type: 'boolean',
      required: true,
      applyToModel: (m) => m,
      next: () => 'marital_status',
      targetFieldCodes: ['001', '002', '003', '004'],
      validationMode: true,
      editTarget: 'identity',
      deriveAnswerFromCard: () => true,
      dataPreview: ({ client }) => {
        if (!client) return null;
        const fullName = [client.firstName, client.lastName].filter(Boolean).join(' ').trim();
        const addressParts = [client.address, client.city].filter(Boolean).join(', ');
        const formatDate = (d?: string) => {
          if (!d) return '';
          // תומך גם ב-ISO וגם ב-YYYY-MM-DD
          const parsed = new Date(d);
          if (isNaN(parsed.getTime())) return d;
          return parsed.toLocaleDateString('he-IL', { day: '2-digit', month: '2-digit', year: 'numeric' });
        };
        return [
          { label: 'שם מלא', value: fullName || '', missing: !fullName },
          { label: 'תעודת זהות', value: client.idNumber || '', missing: !client.idNumber },
          { label: 'תאריך לידה', value: formatDate(client.birthDate), missing: !client.birthDate },
          { label: 'כתובת', value: addressParts || '', missing: !addressParts },
        ];
      },
    },

    marital_status: {
      id: 'marital_status',
      question: 'מה הסטטוס המשפחתי של הלקוח לתום שנת המס?',
      type: 'single_select',
      required: true,
      options: [
        { value: 'single', label: 'רווק/ה' },
        { value: 'married', label: 'נשוי/אה' },
        { value: 'divorced', label: 'גרוש/ה' },
        { value: 'widowed', label: 'אלמן/ה' },
        { value: 'separated', label: 'פרוד/ה' },
      ],
      applyToModel: (m, a) => ({
        ...m,
        identity: { ...m.identity, maritalStatus: a as MaritalStatus, hasSpouse: a === 'married' },
      }),
      next: (a) => (a === 'married' ? 'registered_spouse_role' : 'children_count'),
      targetFieldCodes: ['113'],
      validationMode: true,
      editTarget: 'identity',
      deriveAnswerFromCard: ({ client }) => {
        const fs = client?.familyStatus;
        if (!fs) return null;
        return fs === 'singleParent' ? 'divorced' : fs;
      },
      dataPreview: ({ client }) => {
        const label = ({
          single: 'רווק/ה',
          married: 'נשוי/אה',
          divorced: 'גרוש/ה',
          widowed: 'אלמן/ה',
          singleParent: 'הורה יחיד',
        } as Record<string, string>)[client?.familyStatus ?? ''] ?? '';
        return [{ label: 'סטטוס משפחתי בכרטיס', value: label, missing: !label }];
      },
    },

    // ═══ ב. בן/בת זוג (רק אם נשוי) ══════════════════════════════════════════
    registered_spouse_role: {
      id: 'registered_spouse_role',
      question: 'מי "בן הזוג הרשום" שמגיש את הדוח?',
      helpText: 'בן הזוג הרשום הוא זה שמופיע ראשון בדוח. הבחירה נעשית אחת לכמה שנים ומשפיעה על מי מקבל החזרי מס.',
      type: 'single_select',
      required: true,
      options: [
        { value: 'me_only', label: 'הנישום בלבד (בן/בת הזוג ללא חובת הגשה)' },
        { value: 'file_jointly', label: 'הנישום הוא הרשום + חישוב מאוחד' },
        { value: 'spouse_only', label: 'בן/בת הזוג הוא/היא הרשום/ה' },
        { value: 'separate_files', label: 'כל אחד מגיש בנפרד' },
      ],
      applyToModel: (m, a) => ({
        ...m,
        spouse: { ...m.spouse, registeredRole: a as RegisteredSpouseRole },
      }),
      next: () => 'spouse_has_income',
      targetFieldCodes: ['S-role'],
    },

    spouse_has_income: {
      id: 'spouse_has_income',
      question: 'האם לבן/בת הזוג היו הכנסות בשנת המס?',
      type: 'boolean',
      required: true,
      applyToModel: (m, a) => ({
        ...m,
        identity: { ...m.identity, spouseHasIncome: a as boolean },
      }),
      next: (a) => (a ? 'spouse_has_106' : 'children_count'),
      targetFieldCodes: ['S-calc'],
    },

    spouse_has_106: {
      id: 'spouse_has_106',
      question: 'האם לבן/בת הזוג יש טופס 106 (שכר) לשנה זו?',
      type: 'boolean',
      required: true,
      applyToModel: (m, a) => ({ ...m, spouse: { ...m.spouse, has106: a as boolean } }),
      next: () => 'spouse_has_business',
      targetFieldCodes: ['S-spouse-salary'],
    },

    spouse_has_business: {
      id: 'spouse_has_business',
      question: 'האם לבן/בת הזוג יש הכנסה מעסק או משלח יד?',
      helpText: 'כולל עוסק פטור או מורשה. משפיע על זכאות לחישוב נפרד.',
      type: 'boolean',
      required: true,
      applyToModel: (m, a) => ({ ...m, spouse: { ...m.spouse, hasBusinessIncome: a as boolean } }),
      next: () => 'eligible_separate_calc',
    },

    eligible_separate_calc: {
      id: 'eligible_separate_calc',
      question: 'האם בני הזוג עומדים בתנאי החישוב הנפרד?',
      helpText: 'תנאי החישוב הנפרד: הכנסת כל אחד מעבודה לא תלויה בשני, וכל אחד מקדיש לפחות 36 שעות שבועיות לעיסוקו.',
      type: 'boolean',
      required: true,
      applyToModel: (m, a) => ({
        ...m,
        spouse: { ...m.spouse, eligibleSeparateCalc: a as boolean },
      }),
      next: () => 'children_count',
      targetFieldCodes: ['S-calc'],
    },

    // ═══ ג. ילדים ════════════════════════════════════════════════════════════
    children_count: {
      id: 'children_count',
      question: 'כמה ילדים יש לנישום עד גיל 18 (כולל)?',
      type: 'number',
      required: true,
      applyToModel: (m, a) => ({
        ...m,
        identity: { ...m.identity, childrenCount: Number(a) || 0 },
      }),
      next: (a) => (Number(a) > 0 ? 'children_details_required' : 'residency_type'),
      targetFieldCodes: ['C-list'],
      validationMode: true,
      editTarget: 'children',
      deriveAnswerFromCard: ({ client }) => (client?.children ?? []).length,
      dataPreview: ({ client }) => {
        const kids = client?.children ?? [];
        if (kids.length === 0) {
          return [{ label: 'ילדים בכרטיס', value: 'אין ילדים רשומים', missing: true }];
        }
        return kids.map((c, i) => ({
          label: c.firstName || `ילד ${i + 1}`,
          value: c.birthDate ? `נולד ${c.birthDate}` : `שנת לידה ${c.birthYear}`,
          missing: !c.birthDate && !c.birthYear,
        }));
      },
    },

    children_details_required: {
      id: 'children_details_required',
      question: 'יש להכין רשימה של הילדים עם שנת לידה והחזקה (מלאה/משותפת). האם הנתונים זמינים?',
      helpText: 'נדרש לחישוב נקודות זיכוי לפי גיל ילד. את הפירוט נאסוף בשלב הבא של איסוף הנתונים.',
      type: 'boolean',
      required: true,
      applyToModel: (m) => m,
      next: () => 'children_special_needs',
      targetFieldCodes: ['C-list'],
    },

    children_special_needs: {
      id: 'children_special_needs',
      question: 'האם יש בין הילדים ילד עם נכות מוכרת / צרכים מיוחדים?',
      type: 'boolean',
      required: true,
      applyToModel: (m, a) => ({
        ...m,
        identity: { ...m.identity, childrenWithSpecialNeeds: a as boolean },
      }),
      next: (_a, m) => {
        // הורה יחיד? הילדים אצל הנישום — נשאל רק אם רווק/גרוש/אלמן/פרוד עם ילדים
        const ms = m.identity?.maritalStatus;
        const hasKids = (m.identity?.childrenCount ?? 0) > 0;
        if (ms && ms !== 'married' && hasKids) return 'is_custodial_single_parent';
        return 'residency_type';
      },
      targetFieldCodes: ['C-special'],
    },

    is_custodial_single_parent: {
      id: 'is_custodial_single_parent',
      question: 'האם הילדים נמצאים במשמורת הנישום (הורה יחיד שילדיו אצלו)?',
      helpText: 'הורה יחיד שילדיו אצלו זכאי לזיכוי מס מיוחד (שדה 029).',
      type: 'boolean',
      required: true,
      applyToModel: (m, a) => ({
        ...m,
        identity: { ...m.identity, isCustodialSingleParent: a as boolean },
      }),
      next: () => 'residency_type',
      targetFieldCodes: ['029'],
    },

    // ═══ ד. תושבות ונכות ═════════════════════════════════════════════════════
    residency_type: {
      id: 'residency_type',
      question: 'מה סטטוס התושבות של הנישום?',
      type: 'single_select',
      required: true,
      options: [
        { value: 'resident', label: 'תושב/ת ישראל ותיק/ה' },
        { value: 'new_immigrant', label: 'עולה חדש/ה' },
        { value: 'returning_resident', label: 'תושב/ת חוזר/ת' },
      ],
      applyToModel: (m, a) => ({
        ...m,
        identity: { ...m.identity, residencyType: a as 'resident' | 'new_immigrant' | 'returning_resident' },
        specialSituations: { ...m.specialSituations, isNewImmigrant: a === 'new_immigrant' },
      }),
      next: (a) => (a !== 'resident' ? 'elects_section_14' : 'qualifying_settlement'),
      validationMode: true,
      editTarget: 'identity',
      deriveAnswerFromCard: ({ client }) => {
        if (client?.isNewImmigrant) return 'new_immigrant';
        if (client?.isReturningResident) return 'returning_resident';
        return 'resident';
      },
      dataPreview: ({ client }) => {
        const items: { label: string; value: string; missing?: boolean }[] = [];
        if (client?.isNewImmigrant) items.push({ label: 'עולה חדש', value: client.aliyahYear ? `משנת ${client.aliyahYear}` : 'מסומן' });
        if (client?.isReturningResident) items.push({ label: 'תושב חוזר', value: 'מסומן' });
        if (items.length === 0) items.push({ label: 'תושבות בכרטיס', value: 'תושב ישראל ותיק' });
        return items;
      },
    },

    elects_section_14: {
      id: 'elects_section_14',
      question: 'האם הנישום בוחר להחיל פטור לפי סעיף 14 (פטור 10 שנים על הכנסות חו"ל)?',
      helpText: 'הזכאות פוקעת אוטומטית 10 שנים מיום העלייה/החזרה. אם פוקעת בשנת המס — חישוב חלקי.',
      type: 'boolean',
      required: true,
      applyToModel: (m, a) => ({
        ...m,
        specialSituations: { ...m.specialSituations, electsSection14: a as boolean },
      }),
      next: () => 'qualifying_settlement',
      targetFieldCodes: ['S14'],
    },

    qualifying_settlement: {
      id: 'qualifying_settlement',
      question: 'האם הנישום מתגורר ביישוב מזכה (נגב/גליל/גולן/ערבה/בקעת הירדן)?',
      helpText: 'מקנה נקודות זיכוי נוספות לפי מעגל הישוב. נדרש תעודת תושב.',
      type: 'boolean',
      required: true,
      applyToModel: (m, a) => ({
        ...m,
        identity: { ...m.identity, livesInQualifyingSettlement: a as boolean },
      }),
      next: () => 'has_disability',
    },

    has_disability: {
      id: 'has_disability',
      question: 'האם לנישום יש אחוז נכות מוכר?',
      helpText: 'נכות 90% או יותר מזכה בפטור מלא ממס על הכנסה מיגיעה אישית עד תקרה.',
      type: 'boolean',
      required: true,
      applyToModel: (m, a) => ({
        ...m,
        identity: { ...m.identity, hasDisability: a as boolean },
      }),
      next: (a) => (a ? 'disability_band' : 'income_sources'),
      targetFieldCodes: ['D-pct'],
      validationMode: true,
      editTarget: 'identity',
      deriveAnswerFromCard: ({ client }) => (client?.disabilityPercentage ?? 0) > 0,
      dataPreview: ({ client }) => {
        const pct = client?.disabilityPercentage ?? 0;
        return [{
          label: 'אחוז נכות בכרטיס',
          value: pct > 0 ? `${pct}%` : 'לא מוגדר',
          missing: pct === 0 && client?.disabilityPercentage === undefined,
        }];
      },
    },

    disability_band: {
      id: 'disability_band',
      question: 'באיזה אחוז נכות מדובר?',
      type: 'single_select',
      required: true,
      options: [
        { value: 'low', label: 'מתחת ל-40% (לא מקנה זיכוי)' },
        { value: 'high', label: '40%-89% (זיכוי חלקי)' },
        { value: 'full', label: '90% ומעלה (פטור מלא לפי סעיף 9(5))' },
      ],
      applyToModel: (m, a) => ({
        ...m,
        identity: { ...m.identity, disabilityBand: a as DisabilityBand },
      }),
      next: () => 'income_sources',
      targetFieldCodes: ['D-pct'],
    },

    // ═══ ה. מקורות הכנסה ═════════════════════════════════════════════════════
    income_sources: {
      id: 'income_sources',
      question: 'בשנת המס היו לנישום הכנסות מאיזה מהמקורות הבאים?',
      helpText: 'בחר את כל המקורות הרלוונטיים. כל בחירה תפתח שאלות נוספות.',
      type: 'multi_select',
      required: true,
      options: [
        { value: 'salary', label: 'שכר מעבודה (שכיר)' },
        { value: 'business', label: 'עסק / משלח יד (עצמאי)' },
        { value: 'rental', label: 'הכנסה משכר דירה' },
        { value: 'capital', label: 'רווחי הון / שוק ההון' },
        { value: 'dividend', label: 'דיבידנד' },
        { value: 'foreign', label: 'הכנסה מחו"ל' },
        { value: 'other', label: 'אחר (הגרלה, תמלוגים, מענק)' },
      ],
      applyToModel: (m, a) => ({
        ...m,
        income: { ...m.income, sources: a as IncomeSourceKind[] },
      }),
      next: (_a, m) => firstIncomeBranch(m),
    },

    // ─── ענף שכיר ─────────────────────────────────────────────────────────
    salary_employer_count: {
      id: 'salary_employer_count',
      question: 'מכמה מעבידים קיבל הנישום שכר בשנת המס?',
      helpText: 'אם הרשימה מהכרטיס נכונה — תכניס את אותו המספר. אחרת — תזכור להוסיף/להסיר מעבידים בכרטיס.',
      type: 'number',
      required: true,
      applyToModel: (m, a) => ({
        ...m,
        income: { ...m.income, salaryEmployerCount: Number(a) || 0, hasMultipleEmployers: Number(a) > 1 },
      }),
      next: () => 'received_severance',
      targetFieldCodes: ['158', '170'],
      validationMode: true,
      editTarget: 'employers',
      deriveAnswerFromCard: ({ client }) => (client?.employers ?? []).length,
      dataPreview: ({ client }) => {
        const employers = client?.employers ?? [];
        const active = employers.filter((e) => !e.endDate);
        if (employers.length === 0) {
          return [{ label: 'מעבידים בכרטיס', value: '', missing: true }];
        }
        return employers.map((e) => ({
          label: e.endDate ? `(לשעבר) ${e.name || '—'}` : e.name || '—',
          value: e.taxId ? `ע.מ ${e.taxId}` : (e.endDate ? `סיים ${e.endDate}` : 'מועסק'),
          missing: !e.name,
        })).concat(active.length > 0 ? [] : [{ label: 'הערה', value: 'אין מעבידים פעילים בכרטיס', missing: false }]);
      },
    },

    received_severance: {
      id: 'received_severance',
      question: 'האם הנישום קיבל מענק פרישה / פיצויי פיטורין בשנת המס?',
      type: 'boolean',
      required: true,
      applyToModel: (m, a) => ({
        ...m,
        income: { ...m.income, receivedSeverance: a as boolean },
      }),
      next: () => 'has_options_102',
      targetFieldCodes: ['037-sev'],
    },

    has_options_102: {
      id: 'has_options_102',
      question: 'האם הנישום מימש אופציות 102 / 3i השנה?',
      helpText: 'אופציות עובדים — תוכנית 102 (מעבידים ישראליים) או 3i (מעבידים זרים). שווי המימוש מופיע ב-106.',
      type: 'boolean',
      required: true,
      applyToModel: (m, a) => ({
        ...m,
        income: { ...m.income, hasOptions102: a as boolean },
      }),
      next: (_a, m) => nextIncomeBranch(m, 'salary'),
      targetFieldCodes: ['282'],
    },

    // ─── ענף עסק ───────────────────────────────────────────────────────────
    business_kind: {
      id: 'business_kind',
      question: 'מה סוג העסק?',
      type: 'single_select',
      required: true,
      options: [
        { value: 'osek_patur', label: 'עוסק פטור' },
        { value: 'osek_morshe', label: 'עוסק מורשה' },
        { value: 'family_company', label: 'חברה משפחתית / שותפות' },
      ],
      applyToModel: (m, a) => ({
        ...m,
        income: { ...m.income, businessKind: a as 'osek_patur' | 'osek_morshe' | 'family_company' },
      }),
      next: () => 'biz_revenue_band',
      targetFieldCodes: ['150'],
    },

    biz_revenue_band: {
      id: 'biz_revenue_band',
      question: 'מה רמת המחזור השנתי של העסק?',
      helpText: 'מחזור מעל 300,000 ₪ מחייב הגשת נספח 6111 (מאזן ודוח רווח-הפסד מקודד) לפי הוראות 2025.',
      type: 'single_select',
      required: true,
      options: [
        { value: 'under_300k', label: 'עד 300,000 ₪' },
        { value: '300k_plus', label: 'מעל 300,000 ₪ (מחייב 6111)' },
      ],
      applyToModel: (m, a) => ({
        ...m,
        income: { ...m.income, bizRevenueBand: a as BizRevenueBand },
      }),
      next: () => 'biz_has_client_withholding',
      targetFieldCodes: ['150', '6111-req'],
    },

    biz_has_client_withholding: {
      id: 'biz_has_client_withholding',
      question: 'האם לקוחות העסק ניכו לנישום מס במקור (טופס 857)?',
      type: 'boolean',
      required: true,
      applyToModel: (m, a) => ({
        ...m,
        income: { ...m.income, bizHasClientWithholding: a as boolean },
      }),
      next: () => 'biz_keren_hashtalmut',
      targetFieldCodes: ['B-client-wh'],
    },

    biz_keren_hashtalmut: {
      id: 'biz_keren_hashtalmut',
      question: 'האם הנישום הפקיד לקרן השתלמות לעצמאי השנה?',
      type: 'boolean',
      required: true,
      applyToModel: (m, a) => ({
        ...m,
        deductionsCredits: { ...m.deductionsCredits, hasKerenHashtalmutSelf: a as boolean },
      }),
      next: (_a, m) => nextIncomeBranch(m, 'business'),
      targetFieldCodes: ['K-hashtalmut'],
    },

    // ─── ענף שכ"ד ────────────────────────────────────────────────────────
    rental_track: {
      id: 'rental_track',
      question: 'באיזה מסלול מס נבחר לשכר הדירה?',
      helpText: 'פטור עד 5,654 ₪/חודש (2025), 10% על המחזור, או מס שולי עם הוצאות.',
      type: 'single_select',
      required: true,
      options: [
        { value: 'exempt', label: 'פטור (עד 5,654 ₪/חודש)' },
        { value: 'flat10', label: 'מסלול 10% (סעיף 122)' },
        { value: 'regular', label: 'מס שולי רגיל (עם הוצאות)' },
      ],
      applyToModel: (m, a) => ({
        ...m,
        income: { ...m.income, rentalTrack: a as 'exempt' | 'flat10' | 'regular' },
      }),
      next: () => 'rental_gross',
      targetFieldCodes: ['077', '078', '080'],
    },

    rental_gross: {
      id: 'rental_gross',
      question: 'מה סך הכנסת שכ"ד השנתית?',
      type: 'number',
      required: false,
      applyToModel: (m, a) => ({
        ...m,
        income: { ...m.income, rentalGrossAnnual: Number(a) || 0 },
      }),
      next: (_a, m) => nextIncomeBranch(m, 'rental'),
      targetFieldCodes: ['077', '078', '080'],
    },

    // ─── ענף הון ─────────────────────────────────────────────────────────
    capital_has_securities: {
      id: 'capital_has_securities',
      question: 'האם הנישום מחזיק בני"ע סחירים (מניות, אג"ח, קרנות)?',
      helpText: 'הצ\'ק-ליסט יבקש 867 נפרד מכל בית השקעות. הוסף בכרטיס חשבונות שחסרים.',
      type: 'boolean',
      required: true,
      applyToModel: (m, a) => ({
        ...m,
        income: {
          ...m.income,
          capitalSubTypes: a
            ? Array.from(new Set([...(m.income.capitalSubTypes ?? []), 'securities' as const]))
            : (m.income.capitalSubTypes ?? []).filter((t) => t !== 'securities'),
        },
      }),
      next: (a) => (a ? 'capital_securities_withholding' : 'capital_has_crypto'),
      targetFieldCodes: ['142'],
      validationMode: true,
      editTarget: 'investmentAccounts',
      deriveAnswerFromCard: ({ client }) =>
        (client?.investmentAccounts ?? []).filter((a) => !a.isClosed).length > 0,
      dataPreview: ({ client }) => {
        const accounts = (client?.investmentAccounts ?? []).filter((a) => !a.isClosed);
        if (accounts.length === 0) {
          return [{ label: 'חשבונות השקעה בכרטיס', value: 'אין חשבונות רשומים', missing: true }];
        }
        return accounts.map((a) => ({
          label: a.institutionName,
          value: a.kind ? a.kind : 'חשבון',
          missing: !a.institutionName,
        }));
      },
    },

    capital_securities_withholding: {
      id: 'capital_securities_withholding',
      question: 'האם בית ההשקעות ניכה לנישום מס במקור מרווחי ההון?',
      helpText: 'מופיע ב-867 כסכום מס שנוכה במקור (שדה 253 בטופס).',
      type: 'boolean',
      required: true,
      applyToModel: (m, a) => ({
        ...m,
        income: { ...m.income, capitalHasWithholding: a as boolean },
      }),
      next: () => 'capital_has_crypto',
      targetFieldCodes: ['253'],
    },

    capital_has_crypto: {
      id: 'capital_has_crypto',
      question: 'האם היו לנישום עסקאות במטבעות דיגיטליים (קריפטו)?',
      type: 'boolean',
      required: true,
      applyToModel: (m, a) => ({
        ...m,
        income: {
          ...m.income,
          capitalSubTypes: a
            ? Array.from(new Set([...(m.income.capitalSubTypes ?? []), 'crypto' as const]))
            : (m.income.capitalSubTypes ?? []).filter((t) => t !== 'crypto'),
        },
      }),
      next: () => 'capital_has_real_estate',
      targetFieldCodes: ['C-crypto'],
    },

    capital_has_real_estate: {
      id: 'capital_has_real_estate',
      question: 'האם הנישום מכר מקרקעין (שאינו דירת מגורים יחידה) השנה?',
      type: 'boolean',
      required: true,
      applyToModel: (m, a) => ({
        ...m,
        income: {
          ...m.income,
          capitalSubTypes: a
            ? Array.from(new Set([...(m.income.capitalSubTypes ?? []), 'real_estate' as const]))
            : (m.income.capitalSubTypes ?? []).filter((t) => t !== 'real_estate'),
        },
      }),
      next: (_a, m) => nextIncomeBranch(m, 'capital'),
      targetFieldCodes: ['054'],
    },

    // ─── ענף דיבידנד ─────────────────────────────────────────────────────
    dividend_controlling: {
      id: 'dividend_controlling',
      question: 'האם הדיבידנד שולם לנישום כבעל מניות מהותי (10%+)?',
      helpText: 'בעל מניות מהותי חייב במס 30% במקום 25%.',
      type: 'boolean',
      required: true,
      applyToModel: (m, a) => ({
        ...m,
        income: { ...m.income, isControllingShareholder: a as boolean },
      }),
      next: (_a, m) => nextIncomeBranch(m, 'dividend'),
      targetFieldCodes: ['036'],
    },

    // ─── ענף ריבית ────────────────────────────────────────────────────────
    has_interest_income: {
      id: 'has_interest_income',
      question: 'האם הייתה לנישום הכנסה מריבית על פיקדונות / אג"ח / תוכניות חיסכון?',
      helpText: 'אם כן — נצטרך 867 מכל בנק בהמשך.',
      type: 'boolean',
      required: true,
      applyToModel: (m, a) => ({
        ...m,
        income: { ...m.income, hasInterestIncome: a as boolean },
      }),
      next: (a) => (a ? 'interest_has_withholding' : 'has_pension_income'),
      targetFieldCodes: ['126'],
      validationMode: true,
      editTarget: 'bankAccounts',
      deriveAnswerFromCard: ({ client }) => (client?.bankAccounts ?? []).length > 0,
      dataPreview: ({ client }) => {
        const banks = client?.bankAccounts ?? [];
        if (banks.length === 0) {
          return [{ label: 'חשבונות בנק בכרטיס', value: 'אין', missing: true }];
        }
        return banks.map((b) => ({
          label: b.bankName,
          value: b.isPrimary ? '🔑 ראשי' : 'חשבון',
          missing: !b.bankName,
        }));
      },
    },

    interest_has_withholding: {
      id: 'interest_has_withholding',
      question: 'האם הבנק ניכה מס במקור מהריבית?',
      type: 'boolean',
      required: true,
      applyToModel: (m, a) => ({
        ...m,
        income: { ...m.income, interestHasWithholding: a as boolean },
      }),
      next: () => 'has_pension_income',
      targetFieldCodes: ['043'],
    },

    // ─── ענף פנסיה ────────────────────────────────────────────────────────
    has_pension_income: {
      id: 'has_pension_income',
      question: 'האם הנישום מקבל פנסיה / קצבה שוטפת?',
      type: 'boolean',
      required: true,
      applyToModel: (m, a) => ({
        ...m,
        income: { ...m.income, hasPensionIncome: a as boolean },
      }),
      next: () => 'ni_maternity',
      targetFieldCodes: ['P-pension'],
    },

    // ─── ענף תקבולי ביטוח לאומי ────────────────────────────────────────────
    ni_maternity: {
      id: 'ni_maternity',
      question: 'האם הנישום קיבל דמי לידה מביטוח לאומי?',
      helpText: 'דמי לידה חייבים במס מלא (שלא כמו ב-106 הרגיל). נדרש אישור בט"ל.',
      type: 'boolean',
      required: true,
      applyToModel: (m, a) => ({
        ...m,
        income: { ...m.income, niMaternityReceived: a as boolean },
      }),
      next: () => 'ni_unemployment',
      targetFieldCodes: ['194'],
    },

    ni_unemployment: {
      id: 'ni_unemployment',
      question: 'האם הנישום קיבל דמי אבטלה מביטוח לאומי?',
      type: 'boolean',
      required: true,
      applyToModel: (m, a) => ({
        ...m,
        income: { ...m.income, niUnemploymentReceived: a as boolean },
      }),
      next: () => 'ni_reserve_duty',
      targetFieldCodes: ['196'],
    },

    ni_reserve_duty: {
      id: 'ni_reserve_duty',
      question: 'האם הנישום קיבל תגמולי מילואים מביטוח לאומי?',
      type: 'boolean',
      required: true,
      applyToModel: (m, a) => ({
        ...m,
        income: { ...m.income, niReserveDutyReceived: a as boolean },
      }),
      next: () => 'ni_work_injury',
      targetFieldCodes: ['250'],
    },

    ni_work_injury: {
      id: 'ni_work_injury',
      question: 'האם הנישום קיבל תקבולי פגיעה בעבודה מביטוח לאומי?',
      type: 'boolean',
      required: true,
      applyToModel: (m, a) => ({
        ...m,
        income: { ...m.income, niWorkInjuryReceived: a as boolean },
      }),
      next: () => 'has_other_income',
      targetFieldCodes: ['270'],
    },

    // ─── ענף אחר ─────────────────────────────────────────────────────────
    has_other_income: {
      id: 'has_other_income',
      question: 'האם היו הכנסות אחרות שטרם דווחו? (הגרלה, תמלוגים, פרסים)',
      type: 'boolean',
      required: true,
      applyToModel: (m, a) => ({
        ...m,
        income: { ...m.income, hasOtherIncome: a as boolean },
      }),
      next: (_a, m) => nextNonIncomeBranch(m, 'pension'),
    },

    // ─── ענף חו"ל ────────────────────────────────────────────────────────
    foreign_countries: {
      id: 'foreign_countries',
      question: 'מאיזו מדינה / מדינות הגיעו ההכנסות מחו"ל?',
      type: 'text',
      required: false,
      applyToModel: (m, a) => ({
        ...m,
        income: { ...m.income, foreignCountries: String(a || '') },
      }),
      next: () => 'foreign_income_kinds',
      targetFieldCodes: ['249'],
    },

    foreign_income_kinds: {
      id: 'foreign_income_kinds',
      question: 'אילו סוגי הכנסה הגיעו מחו"ל?',
      type: 'multi_select',
      required: true,
      options: [
        { value: 'salary', label: 'שכר עבודה' },
        { value: 'business', label: 'עסק' },
        { value: 'capital', label: 'רווחי הון' },
        { value: 'rental', label: 'שכר דירה' },
        { value: 'pension', label: 'פנסיה' },
      ],
      applyToModel: (m, a) => ({
        ...m,
        income: { ...m.income, foreignIncomeKinds: a as Array<'salary' | 'business' | 'capital' | 'rental' | 'pension'> },
      }),
      next: () => 'foreign_paid_tax_abroad',
      targetFieldCodes: ['249'],
    },

    foreign_paid_tax_abroad: {
      id: 'foreign_paid_tax_abroad',
      question: 'האם שולם מס במדינת המקור (לזיכוי מס זר)?',
      type: 'boolean',
      required: true,
      applyToModel: (m, a) => ({
        ...m,
        income: { ...m.income, foreignPaidTaxAbroad: a as boolean },
      }),
      next: (_a, m) => nextIncomeBranch(m, 'foreign'),
      targetFieldCodes: ['F-tax-credit'],
    },

    // ═══ ו. ניכויים וזיכויים ═════════════════════════════════════════════════
    donations: {
      id: 'donations',
      question: 'מה סכום התרומות לארגונים מוכרים (אישור 46) השנה?',
      helpText: 'מינ׳ 207 ₪. תקרה: 30% מההכנסה החייבת או 10,354,816 ₪. זיכוי 35%.',
      type: 'number',
      required: false,
      applyToModel: (m, a) => ({
        ...m,
        deductionsCredits: { ...m.deductionsCredits, donationAmount: Number(a) || 0 },
      }),
      next: () => 'life_insurance',
      targetFieldCodes: ['037'],
      validationMode: true,
      editTarget: 'identity',
      deriveAnswerFromCard: ({ client }) => client?.donationsAnnual ?? 0,
      dataPreview: ({ client }) => {
        const amt = client?.donationsAnnual ?? 0;
        return [{
          label: 'תרומות בכרטיס',
          value: amt > 0 ? `${amt.toLocaleString('he-IL')} ₪/שנה` : 'לא הוזן',
          missing: !amt,
        }];
      },
    },

    life_insurance: {
      id: 'life_insurance',
      question: 'מה סכום דמי ביטוח החיים הפרטי השנה?',
      type: 'number',
      required: false,
      applyToModel: (m, a) => ({
        ...m,
        deductionsCredits: {
          ...m.deductionsCredits,
          hasLifeInsurance: Number(a) > 0,
          lifeInsuranceAnnual: Number(a) || 0,
        },
      }),
      next: () => 'alimony_received',
      targetFieldCodes: ['045'],
      validationMode: true,
      editTarget: 'identity',
      deriveAnswerFromCard: ({ client }) => client?.lifeInsuranceAnnual ?? 0,
      dataPreview: ({ client }) => {
        const amt = client?.lifeInsuranceAnnual ?? 0;
        return [{
          label: 'ביטוח חיים בכרטיס',
          value: amt > 0 ? `${amt.toLocaleString('he-IL')} ₪/שנה` : 'לא הוזן',
          missing: !amt,
        }];
      },
    },

    alimony_received: {
      id: 'alimony_received',
      question: 'האם הנישום קיבל דמי מזונות השנה? אם כן — סכום שנתי (₪).',
      helpText: 'מזונות חייבים חלקית במס לפי סעיף 9(21).',
      type: 'number',
      required: false,
      applyToModel: (m, a) => ({
        ...m,
        deductionsCredits: { ...m.deductionsCredits, alimonyReceivedAnnual: Number(a) || 0 },
      }),
      next: () => 'alimony_paid',
      targetFieldCodes: ['9-21'],
    },

    alimony_paid: {
      id: 'alimony_paid',
      question: 'האם הנישום שילם דמי מזונות השנה? אם כן — סכום שנתי (₪).',
      helpText: 'זיכוי לפי סעיף 25 — בלבד אם התשלום מעוגן בפסק דין.',
      type: 'number',
      required: false,
      applyToModel: (m, a) => ({
        ...m,
        deductionsCredits: { ...m.deductionsCredits, alimonyPaidAnnual: Number(a) || 0 },
      }),
      next: () => 'self_pension',
      targetFieldCodes: ['25-alimony-paid'],
    },

    self_pension: {
      id: 'self_pension',
      question: 'מה סכום ההפקדות העצמאיות לפנסיה (לא דרך מעביד)?',
      helpText: 'נצטרך אישור הפקדות מכל קופה שמסומנת בכרטיס כ"הפקדה עצמאית".',
      type: 'number',
      required: false,
      applyToModel: (m, a) => ({
        ...m,
        deductionsCredits: { ...m.deductionsCredits, selfPensionDeposits: Number(a) || 0 },
      }),
      next: () => 'is_discharged_soldier',
      targetFieldCodes: ['086'],
      dataPreview: ({ client }) => {
        const selfDepositFunds = (client?.pensionFunds ?? []).filter((p) => p.hasSelfDeposits);
        if (selfDepositFunds.length === 0) {
          return [{ label: 'קופות עם הפקדה עצמאית', value: 'אין', missing: true }];
        }
        return selfDepositFunds.map((f) => ({
          label: f.institutionName,
          value: f.kind ?? 'קופה',
          missing: !f.institutionName,
        }));
      },
    },

    is_discharged_soldier: {
      id: 'is_discharged_soldier',
      question: 'האם הנישום השתחרר מצה"ל / שירות לאומי בשנתיים האחרונות?',
      helpText: 'מקנה 2 נקודות זיכוי לשנת השחרור ושנתיים אחריה.',
      type: 'boolean',
      required: true,
      applyToModel: (m, a) => ({
        ...m,
        deductionsCredits: { ...m.deductionsCredits, isDischargedSoldier: a as boolean },
      }),
      next: () => 'has_academic_degree',
      targetFieldCodes: ['CR-soldier'],
    },

    has_academic_degree: {
      id: 'has_academic_degree',
      question: 'האם הנישום קיבל תואר אקדמי בשלוש השנים האחרונות?',
      helpText: 'תואר ראשון = נקודה אחת לשנת קבלה ו-3 שנים אחריה. תואר שני/דוקטור = 0.5 נוסף.',
      type: 'boolean',
      required: true,
      applyToModel: (m, a) => ({
        ...m,
        deductionsCredits: { ...m.deductionsCredits, hasAcademicDegree: a as boolean },
      }),
      next: () => 'paid_advance_payments',
      targetFieldCodes: ['CR-academic'],
      validationMode: true,
      editTarget: 'identity',
      deriveAnswerFromCard: ({ client }) => !!client?.hasAcademicDegree,
      dataPreview: ({ client }) => {
        if (!client?.hasAcademicDegree) {
          return [{ label: 'תואר אקדמי בכרטיס', value: 'לא מסומן', missing: true }];
        }
        return [{
          label: 'תואר אקדמי בכרטיס',
          value: client.academicDegreeYear ? `שנת קבלה ${client.academicDegreeYear}` : 'מסומן (ללא שנה)',
        }];
      },
    },

    // ═══ ז. מיסים ששולמו במהלך השנה ═══════════════════════════════════════
    paid_advance_payments: {
      id: 'paid_advance_payments',
      question: 'האם הנישום שילם מקדמות מ"ה במהלך השנה?',
      helpText: 'מקדמות מ"ה משולמות בד"כ ע"י עצמאים או מי שיש לו הכנסות שאינן משכר. מופיעות באזור האישי בשע"ם.',
      type: 'boolean',
      required: true,
      applyToModel: (m, a) => ({
        ...m,
        taxPaid: { ...m.taxPaid, paidAdvancePayments: a as boolean },
      }),
      next: () => 'had_withholding_at_source',
      targetFieldCodes: ['040'],
    },

    had_withholding_at_source: {
      id: 'had_withholding_at_source',
      question: 'מאילו מקורות נוכה לנישום מס במקור במהלך השנה?',
      helpText: 'סמן את כל המקורות שמהם נוכה מס. נדרש לקיזוז כנגד חוב המס.',
      type: 'multi_select',
      required: false,
      options: [
        { value: 'salary_106', label: 'משכר (טופס 106)' },
        { value: 'business_clients', label: 'מלקוחות (לעצמאי — 857)' },
        { value: 'interest_bank', label: 'מריבית בנק (867)' },
        { value: 'securities', label: 'מרווחי הון מני"ע (867)' },
        { value: 'dividend', label: 'מדיבידנד' },
        { value: 'foreign', label: 'מהכנסה חו"ל' },
      ],
      applyToModel: (m, a) => ({
        ...m,
        taxPaid: { ...m.taxPaid, withholdingSources: a as WithholdingSource[] },
      }),
      next: () => 'carried_losses',
      targetFieldCodes: ['042', '043', '253', 'WH-summary'],
    },

    // ═══ ח. נסיבות מיוחדות ═══════════════════════════════════════════════
    carried_losses: {
      id: 'carried_losses',
      question: 'האם יש לנישום הפסדים מועברים משנים קודמות?',
      helpText: 'הפסדים מועברים מקטינים את חבות המס לשנה הנוכחית. נדרש לאתר את היתרה מהשומה האחרונה.',
      type: 'boolean',
      required: false,
      applyToModel: (m, a) => ({
        ...m,
        specialSituations: { ...m.specialSituations, hasCarriedLosses: a as boolean },
      }),
      next: () => 'wealth_declaration_required',
      targetFieldCodes: ['L-losses'],
    },

    wealth_declaration_required: {
      id: 'wealth_declaration_required',
      question: 'האם פקיד השומה דרש הצהרת הון לשנה זו?',
      helpText: 'מקבלים מכתב מוקדם מפקיד השומה. אם לא נדרש — אין צורך.',
      type: 'boolean',
      required: false,
      applyToModel: (m, a) => ({
        ...m,
        specialSituations: { ...m.specialSituations, wealthDeclarationRequired: a as boolean },
      }),
      next: () => 'is_family_company_member',
      targetFieldCodes: ['W-decl'],
    },

    is_family_company_member: {
      id: 'is_family_company_member',
      question: 'האם הנישום חבר בחברה משפחתית (סעיף 64א)?',
      helpText: 'חברה משפחתית מייחסת רווחים לבעל המניות, ולא לחברה. דורש דיווח נוסף.',
      type: 'boolean',
      required: true,
      applyToModel: (m, a) => ({
        ...m,
        specialSituations: { ...m.specialSituations, isFamilyCompanyMember: a as boolean },
      }),
      next: () => 'is_foreign_controlling_shareholder',
      targetFieldCodes: ['64a-fam-co'],
      validationMode: true,
      editTarget: 'identity',
      deriveAnswerFromCard: ({ client }) => !!client?.isFamilyCompanyMember,
      dataPreview: ({ client }) => [{
        label: 'חבר בחברה משפחתית',
        value: client?.isFamilyCompanyMember ? 'כן (מסומן בכרטיס)' : 'לא מסומן',
      }],
    },

    is_foreign_controlling_shareholder: {
      id: 'is_foreign_controlling_shareholder',
      question: 'האם הנישום הוא בעל שליטה בחברה זרה (10%+)?',
      helpText: 'חברה זרה נשלטת (CFC) — סעיף 75ב. רווחי החברה הזרה מיוחסים לבעל השליטה גם אם לא חולקו.',
      type: 'boolean',
      required: true,
      applyToModel: (m, a) => ({
        ...m,
        specialSituations: { ...m.specialSituations, isForeignControllingShareholder: a as boolean },
      }),
      next: () => 'is_kibbutz_member',
      targetFieldCodes: ['75b-cfc'],
      validationMode: true,
      editTarget: 'identity',
      deriveAnswerFromCard: ({ client }) => !!client?.isForeignControllingShareholder,
      dataPreview: ({ client }) => [{
        label: 'בעל שליטה בחברה זרה',
        value: client?.isForeignControllingShareholder ? 'כן (מסומן בכרטיס)' : 'לא מסומן',
      }],
    },

    is_kibbutz_member: {
      id: 'is_kibbutz_member',
      question: 'האם הנישום חבר קיבוץ או מושב שיתופי?',
      helpText: 'חישוב המס לחברי קיבוץ שונה — סעיפים 54-58 לפקודה.',
      type: 'boolean',
      required: true,
      applyToModel: (m, a) => ({
        ...m,
        specialSituations: { ...m.specialSituations, isKibbutzMember: a as boolean },
      }),
      next: () => 'final_declaration',
      targetFieldCodes: ['kibbutz'],
      validationMode: true,
      editTarget: 'identity',
      deriveAnswerFromCard: ({ client }) => !!client?.isKibbutzMember,
      dataPreview: ({ client }) => [{
        label: 'חבר קיבוץ',
        value: client?.isKibbutzMember ? 'כן (מסומן בכרטיס)' : 'לא מסומן',
      }],
    },

    // ═══ ט. חתימה ════════════════════════════════════════════════════════════
    final_declaration: {
      id: 'final_declaration',
      question: 'הלקוח אישר שכל הנתונים נמסרו במלואם ונכונים?',
      helpText: 'בסוף התהליך הלקוח יחתום על הצהרה. כאן רק אישור מקדים שאין נתונים חסרים.',
      type: 'boolean',
      required: true,
      applyToModel: (m) => m,
      next: () => null,
      targetFieldCodes: ['SIG'],
    },
  },
};

// ─── עזרים ──────────────────────────────────────────────────────────────────

const INCOME_BRANCH_ORDER: IncomeSourceKind[] = [
  'salary', 'business', 'rental', 'capital', 'dividend', 'foreign',
];

const BRANCH_FIRST_NODE: Partial<Record<IncomeSourceKind, string>> = {
  salary: 'salary_employer_count',
  business: 'business_kind',
  rental: 'rental_track',
  capital: 'capital_has_securities',
  dividend: 'dividend_controlling',
  foreign: 'foreign_countries',
};

function firstIncomeBranch(model: TaxpayerModel): string {
  const selected = model.income.sources;
  for (const kind of INCOME_BRANCH_ORDER) {
    if (selected.includes(kind) && BRANCH_FIRST_NODE[kind]) return BRANCH_FIRST_NODE[kind]!;
  }
  return 'has_interest_income';
}

function nextIncomeBranch(model: TaxpayerModel, justFinished: IncomeSourceKind): string {
  const selected = model.income.sources;
  const idx = INCOME_BRANCH_ORDER.indexOf(justFinished);
  for (let i = idx + 1; i < INCOME_BRANCH_ORDER.length; i++) {
    const kind = INCOME_BRANCH_ORDER[i];
    if (selected.includes(kind) && BRANCH_FIRST_NODE[kind]) return BRANCH_FIRST_NODE[kind]!;
  }
  return 'has_interest_income';
}

function nextNonIncomeBranch(_model: TaxpayerModel, _justFinished: string): string {
  // אחרי השאלות הפסיביות (ריבית, פנסיה, אחר) — עוברים לניכויים
  return 'donations';
}

// ─── איסוף שדות חסרים מכרטיס הלקוח ─────────────────────────────────────
// עובר על כל השאלות בעץ שמכריזות על dataPreview, מריץ אותן מול הלקוח הנוכחי,
// ומחזיר רשימה מאוחדת של שדות שמסומנים missing=true. שימושי לבניית מקטע
// "פרטים להשלים בכרטיס" ברשימת הדרישות הסופית.
import type { QuestionPreviewClient, QuestionPreviewItem } from './types';

export interface MissingClientField extends QuestionPreviewItem {
  questionId: string;
}

export function collectMissingClientFields(
  client: QuestionPreviewClient | undefined,
  model: TaxpayerModel,
): MissingClientField[] {
  const out: MissingClientField[] = [];
  const seen = new Set<string>();
  for (const node of Object.values(annualReportTree.nodes)) {
    if (!node.dataPreview) continue;
    const items = node.dataPreview({ client, model });
    if (!items) continue;
    for (const item of items) {
      if (!item.missing) continue;
      const key = item.label;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ ...item, questionId: node.id });
    }
  }
  return out;
}

// אומדן מספר השאלות הצפויות לפרופיל מסוים
export function estimateTotalQuestions(model: TaxpayerModel): number {
  let base = 14; // שאלות בסיסיות שכמעט כל נישום עובר
  if (model.identity.maritalStatus === 'married') base += 4;  // ענף בן/בת זוג
  if ((model.identity.childrenCount ?? 0) > 0) base += 2;
  if (model.identity.hasDisability) base += 1;
  if (model.identity.residencyType !== 'resident') base += 1;
  // לכל מקור הכנסה
  for (const k of model.income.sources) {
    if (k === 'salary') base += 2;
    if (k === 'business') base += 4;
    if (k === 'rental') base += 2;
    if (k === 'capital') base += 4;
    if (k === 'dividend') base += 1;
    if (k === 'foreign') base += 3;
  }
  return base;
}

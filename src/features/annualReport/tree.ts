// ─── עץ ההחלטות לשאלון הדוח השנתי — גרסה 2 (גלים א+ב) ──────────────────────
// מכסה את כל סעיפי 1301 שניתן לתחקר ברמת triage. שאלות data-collection
// מפורטות יבואו בשלב הבא כשנבנה את שכבת המילוי.

import type {
  QuestionTree,
  TaxpayerModel,
  MaritalStatus,
  IncomeSourceKind,
  IncomeOwnership,
  DisabilityBand,
  RegisteredSpouseRole,
  BizRevenueBand,
  WithholdingSource,
  ChapterKey,
} from './types';

export const annualReportTree: QuestionTree = {
  rootNodeId: 'year_map',
  nodes: {
    // ═══ 0. שער — "מה היה לך השנה?" ══════════════════════════════════════════
    // אריח שלא סומן = ענף שלם שנגזם. זה מסך אחד שחוסך עשרות שאלות "האם יש לך...".
    year_map: {
      id: 'year_map',
      question: 'מה היה לך בשנת המס? סמנו כל מה שרלוונטי — גם אם אינכם בטוחים',
      helpText: 'לפי הסימון נדע בדיוק מה לשאול. כל מה שלא סומן — לא יישאל עליו כלום.',
      type: 'multi_select',
      required: true,
      options: [
        { value: 'salary', label: '💼 עבודה כשכיר/ה (משכורת, טופס 106)' },
        { value: 'business', label: '🧾 עסק עצמאי / משלח יד' },
        { value: 'rental', label: '🏠 נכס מושכר (דירה / נכס אחר)' },
        { value: 'capital', label: '📈 שוק ההון וחסכונות (ני"ע, קריפטו, ריבית, דיבידנד)' },
        { value: 'pension_ni', label: '🌅 קצבאות: פנסיה, פרישה, ביטוח לאומי (לידה/אבטלה/מילואים)' },
        { value: 'foreign', label: '✈️ הכנסות או נכסים בחו"ל' },
        { value: 'companies', label: '🏢 חברה בבעלותי / שותפות / משיכות בעלים' },
        { value: 'other', label: '⭐ אחר: הגרלות, תמלוגים, פרסים' },
      ],
      applyToModel: (m, a) => {
        const tiles = (Array.isArray(a) ? a : []) as string[];
        const sources: IncomeSourceKind[] = [];
        if (tiles.includes('salary')) sources.push('salary');
        if (tiles.includes('business')) sources.push('business');
        if (tiles.includes('rental')) sources.push('rental');
        if (tiles.includes('capital')) sources.push('capital', 'interest');
        if (tiles.includes('pension_ni')) sources.push('pension');
        if (tiles.includes('foreign')) sources.push('foreign');
        if (tiles.includes('other')) sources.push('other');
        return {
          ...m,
          income: {
            ...m.income,
            sources,
            hasCompanyInvolvement: tiles.includes('companies'),
          },
        };
      },
      next: () => 'identity_basics',
    },

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
      audience: 'accountant',
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
      targetFieldCodes: ['172'],
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
      audience: 'accountant',
      question: 'החלטת רו"ח: האם בני הזוג עומדים בתנאי החישוב הנפרד?',
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
      next: (a) => (a === false ? 'child_economics' : 'residency_type'),
      targetFieldCodes: ['026'],
    },

    child_economics: {
      id: 'child_economics',
      question: 'האם הנישום משתתף בכלכלת הילדים (מזונות/הוצאות) למרות שאינם בחזקתו?',
      helpText: 'הורה פרוד שמשתתף בכלכלת ילדיו זכאי לנקודת זיכוי (יחסית אם ההשתתפות חלקית).',
      type: 'boolean',
      required: true,
      applyToModel: (m, a) => ({
        ...m,
        identity: { ...m.identity, paysChildEconomics: a as boolean },
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
      audience: 'accountant',
      question: 'החלטת רו"ח: החלת פטור סעיף 14 (10 שנים על הכנסות חו"ל)?',
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
      // בשער החדש המקורות כבר סומנו באריחים — השאלה מוצגת רק בסשנים ישנים.
      visibleWhen: (m) => (m.income?.sources ?? []).length === 0,
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
      next: () => 'salary_owner',
      targetFieldCodes: ['158', '106-count'],
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

    salary_owner: {
      id: 'salary_owner',
      question: 'של מי הכנסת השכר?',
      helpText: 'קובע לאיזה טור בטופס נכנסת ההכנסה (בן הזוג הרשום / בן הזוג) — משפיע על החישוב.',
      type: 'single_select',
      required: true,
      options: [
        { value: 'registered', label: 'של בן הזוג הרשום' },
        { value: 'spouse', label: 'של בן/בת הזוג' },
        { value: 'both', label: 'לשניהם יש שכר' },
      ],
      applyToModel: (m, a) => ({
        ...m,
        income: { ...m.income, salaryOwner: a as IncomeOwnership },
      }),
      next: () => 'shift_work',
      visibleWhen: (m) => m.identity?.maritalStatus === 'married',
      targetFieldCodes: ['158', '172'],
    },

    shift_work: {
      id: 'shift_work',
      question: 'האם עבדת במשמרות שנייה/שלישית בתעשייה?',
      helpText: 'עבודת משמרות בתעשייה מזכה בזיכוי 15% עד תקרה. מופיע בטופס 106 כתוספת משמרות.',
      type: 'boolean',
      required: true,
      applyToModel: (m, a) => ({
        ...m,
        income: { ...m.income, hasShiftWork: a as boolean },
      }),
      next: () => 'received_severance',
      targetFieldCodes: ['068'],
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
      next: (a) => (a ? 'severance_spread' : 'has_options_102'),
      targetFieldCodes: ['258-sev'],
    },

    severance_spread: {
      id: 'severance_spread',
      audience: 'accountant',
      question: 'החלטת רו"ח: פריסת פיצויים — כמה שנות פריסה נותרו (לא כולל השנה)?',
      helpText: 'פריסה מאושרת ע"י פקיד השומה עד 5 שנים. אם אין פריסה — השאירו 0.',
      type: 'number',
      required: false,
      applyToModel: (m, a) => ({
        ...m,
        income: { ...m.income, severanceSpreadYears: Number(a) || 0 },
      }),
      next: () => 'has_options_102',
      targetFieldCodes: ['009'],
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
      next: () => 'business_owner',
      targetFieldCodes: ['150'],
    },

    business_owner: {
      id: 'business_owner',
      question: 'של מי העסק?',
      type: 'single_select',
      required: true,
      options: [
        { value: 'registered', label: 'של בן הזוג הרשום' },
        { value: 'spouse', label: 'של בן/בת הזוג' },
        { value: 'both', label: 'לשניהם עסק / עסק משותף' },
      ],
      applyToModel: (m, a) => ({
        ...m,
        income: { ...m.income, businessOwner: a as IncomeOwnership },
      }),
      next: () => 'partnership_member',
      visibleWhen: (m) => m.identity?.maritalStatus === 'married',
      targetFieldCodes: ['150'],
    },

    partnership_member: {
      id: 'partnership_member',
      question: 'האם העסק פועל כשותפות עם שותפים נוספים?',
      helpText: 'שותפות מחייבת טופס 1504 וייחוס חלק יחסי במחזור וברווח.',
      type: 'boolean',
      required: true,
      applyToModel: (m, a) => ({
        ...m,
        income: { ...m.income, isPartnershipMember: a as boolean },
      }),
      next: () => 'biz_revenue_band',
      targetFieldCodes: ['1504'],
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
      next: () => 'business_asset_rental',
      targetFieldCodes: ['B-client-wh'],
    },

    business_asset_rental: {
      id: 'business_asset_rental',
      question: 'האם הנישום משכיר נכס ששימש בעסק שלו 10 שנים ומעלה?',
      helpText: 'השכרה כזו נחשבת הכנסה מיגיעה אישית (שדות 120/220) — מדרגות מס נמוכות יותר.',
      type: 'boolean',
      required: true,
      applyToModel: (m, a) => ({
        ...m,
        income: { ...m.income, hasBusinessAssetRental10y: a as boolean },
      }),
      next: () => 'biz_keren_hashtalmut',
      targetFieldCodes: ['120'],
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
      targetFieldCodes: ['136'],
    },

    // ─── ענף שכ"ד — הלקוח מדווח עובדות בלבד ─────────────────────────────
    // בחירת המסלול (פטור/10%/שולי) היא החלטת רו"ח: השאלה rental_track קיימת
    // אך מסומנת audience='accountant' ומחוץ לשרשרת — עונים עליה בשער הכיסוי,
    // בעזרת מחשבון האופטימיזציה הקיים במערכת.
    rental_gross: {
      id: 'rental_gross',
      question: 'מה סך שכר הדירה השנתי שהתקבל מהנכס?',
      helpText: 'סכום ברוטו לכל השנה. את מסלול המס המשתלם ביותר רואה החשבון יבחר עבורך.',
      type: 'number',
      required: true,
      applyToModel: (m, a) => ({
        ...m,
        income: { ...m.income, rentalGrossAnnual: Number(a) || 0 },
      }),
      next: () => 'rental_owner',
      targetFieldCodes: ['332', 'R-flat10', 'R-marginal'],
    },

    rents_own_home: {
      id: 'rents_own_home',
      question: 'האם אתם עצמכם גרים בשכירות (משלמים שכר דירה על דירת המגורים)?',
      helpText: 'משכיר דירה שגר בעצמו בשכירות זכאי להקלה משמעותית (סעיף 122(ו)) — זה משפיע על בחירת המסלול.',
      type: 'boolean',
      required: true,
      applyToModel: (m, a) => ({
        ...m,
        income: { ...m.income, livesInRentedHome: a as boolean },
      }),
      next: (a, m) => (a ? 'rent_paid_annual' : nextIncomeBranch(m, 'rental')),
      targetFieldCodes: ['R-rent-paid'],
    },

    rent_paid_annual: {
      id: 'rent_paid_annual',
      question: 'כמה שכר דירה שנתי אתם משלמים על דירת המגורים?',
      type: 'number',
      required: true,
      applyToModel: (m, a) => ({
        ...m,
        income: { ...m.income, rentPaidAnnual: Number(a) || 0 },
      }),
      next: (_a, m) => nextIncomeBranch(m, 'rental'),
      targetFieldCodes: ['R-rent-paid'],
    },

    rental_track: {
      id: 'rental_track',
      question: 'החלטת רו"ח: באיזה מסלול מס תדווח השכירות למגורים?',
      helpText: 'מומלץ להריץ את מחשבון השכירות (122(ו) כשיש שכ"ד ששולם). ההחלטה מפעילה את השדה המתאים בטופס.',
      type: 'single_select',
      required: true,
      audience: 'accountant',
      options: [
        { value: 'exempt', label: 'פטור (עד 5,654 ₪/חודש)' },
        { value: 'flat10', label: 'מסלול 10% (סעיף 122, כולל ניכוי 122(ו))' },
        { value: 'regular', label: 'מס שולי עם הוצאות (נספח ב\')' },
      ],
      applyToModel: (m, a) => ({
        ...m,
        income: { ...m.income, rentalTrack: a as 'exempt' | 'flat10' | 'regular' },
      }),
      // מחוץ לשרשרת החדשה — נענית משער הכיסוי. סשן ישן שעצר כאן ממשיך רגיל.
      next: () => 'rental_owner',
      targetFieldCodes: ['332', 'R-flat10', 'R-marginal'],
    },

    rental_owner: {
      id: 'rental_owner',
      question: 'על שם מי רשום הנכס המושכר?',
      helpText: 'נכס שנרכש לפני הנישואין או התקבל בירושה נשאר בחישוב נפרד של אותו בן זוג.',
      type: 'single_select',
      required: true,
      options: [
        { value: 'registered', label: 'בן הזוג הרשום' },
        { value: 'spouse', label: 'בן/בת הזוג' },
        { value: 'both', label: 'משותף' },
      ],
      applyToModel: (m, a) => ({
        ...m,
        income: { ...m.income, rentalOwner: a as IncomeOwnership },
      }),
      next: () => 'rents_own_home',
      visibleWhen: (m) => m.identity?.maritalStatus === 'married',
      targetFieldCodes: ['R-marginal'],
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
      targetFieldCodes: ['CG-securities', '054', 'D-sec-turnover'],
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
      next: () => 'dividend_preferred',
      targetFieldCodes: ['141'],
    },

    dividend_preferred: {
      id: 'dividend_preferred',
      question: 'האם הדיבידנד חולק ממפעל מועדף / מאושר / מוטב (חוק עידוד השקעות)?',
      helpText: 'דיבידנד ממפעל מועדף חייב ב-20% בלבד (במקום 25%/30%). נדרש אישור מהחברה.',
      type: 'boolean',
      required: true,
      applyToModel: (m, a) => ({
        ...m,
        income: { ...m.income, hasPreferredEnterpriseDividend: a as boolean },
      }),
      next: (_a, m) =>
        m.income?.hasCompanyInvolvement ? 'paid_advance_payments' : nextIncomeBranch(m, 'dividend'),
      targetFieldCodes: ['173'],
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
      next: (a) => (a ? 'interest_owner' : 'has_pension_income'),
      visibleWhen: (m) => (m.income?.sources ?? []).includes('interest') || (m.income?.sources ?? []).includes('capital'),
      targetFieldCodes: ['076', '074', '060', '067', '157'],
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

    interest_owner: {
      id: 'interest_owner',
      question: 'על שם מי החשבונות נושאי הריבית / ההשקעות?',
      type: 'single_select',
      required: true,
      options: [
        { value: 'registered', label: 'בן הזוג הרשום' },
        { value: 'spouse', label: 'בן/בת הזוג' },
        { value: 'both', label: 'משותף / של שנינו' },
      ],
      applyToModel: (m, a) => ({
        ...m,
        income: { ...m.income, interestOwner: a as IncomeOwnership },
      }),
      next: () => 'interest_has_withholding',
      visibleWhen: (m) => m.identity?.maritalStatus === 'married',
      targetFieldCodes: ['076', '074'],
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

    // ─── ענף פנסיה, פרישה וקצבאות ─────────────────────────────────────────
    has_pension_income: {
      id: 'has_pension_income',
      question: 'האם הנישום מקבל פנסיה / קצבה שוטפת (ממעביד לשעבר, קרן פנסיה, ביטוח)?',
      type: 'boolean',
      required: true,
      applyToModel: (m, a) => ({
        ...m,
        income: { ...m.income, hasPensionIncome: a as boolean },
      }),
      next: (a) => (a ? 'pension_owner' : 'exempt_pensions'),
      visibleWhen: (m) => (m.income?.sources ?? []).includes('pension'),
      targetFieldCodes: ['258-pension'],
    },

    pension_owner: {
      id: 'pension_owner',
      question: 'מי מקבל את הקצבה?',
      type: 'single_select',
      required: true,
      options: [
        { value: 'registered', label: 'בן הזוג הרשום' },
        { value: 'spouse', label: 'בן/בת הזוג' },
        { value: 'both', label: 'שנינו' },
      ],
      applyToModel: (m, a) => ({
        ...m,
        income: { ...m.income, pensionOwner: a as IncomeOwnership },
      }),
      next: () => 'exempt_pensions',
      visibleWhen: (m) => m.identity?.maritalStatus === 'married',
      targetFieldCodes: ['258-pension'],
    },

    exempt_pensions: {
      id: 'exempt_pensions',
      question: 'האם מתקבלות קצבאות פטורות ממס? (נכות ממשרד הביטחון, שאירים מב"ל, נכות כללית)',
      helpText: 'קצבאות פטורות מדווחות בדוח לצורכי מידע (שדות 101/102) אך אינן חייבות במס.',
      type: 'boolean',
      required: true,
      applyToModel: (m, a) => ({
        ...m,
        income: { ...m.income, hasExemptPensions: a as boolean },
      }),
      next: () => 'ni_maternity',
      visibleWhen: (m) => (m.income?.sources ?? []).includes('pension'),
      targetFieldCodes: ['101', '209'],
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
      visibleWhen: (m) => (m.income?.sources ?? []).includes('pension'),
      targetFieldCodes: ['NI-employee', 'NI-self'],
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
      visibleWhen: (m) => (m.income?.sources ?? []).includes('pension'),
      targetFieldCodes: ['NI-employee'],
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
      visibleWhen: (m) => (m.income?.sources ?? []).includes('pension'),
      targetFieldCodes: ['NI-employee', 'NI-self'],
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
      next: () => 'ni_benefits_owner',
      visibleWhen: (m) => (m.income?.sources ?? []).includes('pension'),
      targetFieldCodes: ['NI-employee', 'NI-self'],
    },

    ni_benefits_owner: {
      id: 'ni_benefits_owner',
      question: 'מי קיבל את התקבולים מביטוח לאומי?',
      type: 'single_select',
      required: true,
      options: [
        { value: 'registered', label: 'בן הזוג הרשום' },
        { value: 'spouse', label: 'בן/בת הזוג' },
        { value: 'both', label: 'שנינו' },
      ],
      applyToModel: (m, a) => ({
        ...m,
        income: { ...m.income, niBenefitsOwner: a as IncomeOwnership },
      }),
      next: () => 'maternity_spread',
      visibleWhen: (m) =>
        m.identity?.maritalStatus === 'married' &&
        (m.income?.niMaternityReceived === true || m.income?.niUnemploymentReceived === true ||
         m.income?.niReserveDutyReceived === true || m.income?.niWorkInjuryReceived === true),
      targetFieldCodes: ['NI-employee', 'NI-self'],
    },

    maternity_spread: {
      id: 'maternity_spread',
      audience: 'accountant',
      question: 'החלטת רו"ח: לבקש פריסת דמי הלידה לשנת המס הבאה?',
      helpText: 'פריסה משתלמת כשההכנסה בשנת הלידה גבוהה מהצפוי בשנה הבאה — נבדוק ונמליץ.',
      type: 'boolean',
      required: false,
      applyToModel: (m, a) => ({
        ...m,
        income: { ...m.income, requestsMaternitySpread: a as boolean },
      }),
      next: () => 'has_other_income',
      visibleWhen: (m) => m.income?.niMaternityReceived === true,
      targetFieldCodes: ['D-maternity-spread'],
    },

    // ─── ענף אחר ─────────────────────────────────────────────────────────
    has_other_income: {
      id: 'has_other_income',
      question: 'האם היו הכנסות אחרות שטרם דווחו? (הגרלה, תמלוגים, פרסים, השכרת ציוד)',
      type: 'boolean',
      required: true,
      applyToModel: (m, a) => ({
        ...m,
        income: { ...m.income, hasOtherIncome: a as boolean },
      }),
      next: (a, m) => (a ? 'other_income_kinds' : nextNonIncomeBranch(m, 'pension')),
      visibleWhen: (m) => (m.income?.sources ?? []).includes('other'),
      targetFieldCodes: ['167'],
    },

    other_income_kinds: {
      id: 'other_income_kinds',
      question: 'איזה סוג הכנסה אחרת?',
      type: 'multi_select',
      required: true,
      options: [
        { value: 'gambling', label: 'הימורים / הגרלות (מפעל הפיס, טוטו, קזינו)' },
        { value: 'prize', label: 'פרסים וזכיות' },
        { value: 'royalties', label: 'תמלוגים' },
        { value: 'other', label: 'אחר (ריט, השכרת ציוד...)' },
      ],
      applyToModel: (m, a) => {
        const kinds = (Array.isArray(a) ? a : []) as Array<'gambling' | 'royalties' | 'prize' | 'other'>;
        return {
          ...m,
          income: {
            ...m.income,
            otherIncomeKinds: kinds,
            hasGamblingOrPrizes: kinds.includes('gambling') || kinds.includes('prize'),
          },
        };
      },
      next: (_a, m) => nextNonIncomeBranch(m, 'pension'),
      targetFieldCodes: ['427', '167'],
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
      targetFieldCodes: ['290'],
    },

    foreign_income_kinds: {
      id: 'foreign_income_kinds',
      question: 'אילו סוגי הכנסה הגיעו מחו"ל?',
      type: 'multi_select',
      required: true,
      options: [
        { value: 'salary', label: 'שכר עבודה' },
        { value: 'business', label: 'עסק' },
        { value: 'capital', label: 'רווחי הון / ני"ע' },
        { value: 'rental', label: 'שכר דירה מנכס בחו"ל' },
        { value: 'pension', label: 'פנסיה / קצבה' },
        { value: 'interest', label: 'ריבית' },
        { value: 'dividend', label: 'דיבידנד' },
        { value: 'gambling', label: 'הגרלות / פרסים' },
        { value: 'annuity', label: 'קצבה אחרת / מלוג / אנונה' },
        { value: 'other', label: 'אחר' },
      ],
      applyToModel: (m, a) => ({
        ...m,
        income: {
          ...m.income,
          foreignIncomeKinds: a as NonNullable<TaxpayerModel['income']['foreignIncomeKinds']>,
        },
      }),
      next: () => 'foreign_paid_tax_abroad',
      targetFieldCodes: ['290', 'FD-business', 'FD-salary', 'FD-pension', 'FD-rental', 'FD-interest', 'FD-dividend', 'FD-capital', 'FD-gambling'],
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
      next: () => 'foreign_assets',
      targetFieldCodes: ['F-tax-credit'],
    },

    foreign_assets: {
      id: 'foreign_assets',
      question: 'האם שווי כלל הנכסים בחו"ל (שלך, של בן/בת הזוג וילדים עד 18) עולה על כ-2.09 מיליון ₪?',
      helpText: 'נכסים: נדל"ן, חשבונות בנק, ני"ע, זכויות בחברות. מעל הסף — קיימת חובת הגשת דוח גם ללא הכנסה.',
      type: 'boolean',
      required: true,
      applyToModel: (m, a) => ({
        ...m,
        openingDeclarations: { ...m.openingDeclarations, hasForeignAssetsOverThreshold: a as boolean },
      }),
      next: () => 'transferred_abroad',
      targetFieldCodes: ['D-foreign-assets'],
    },

    transferred_abroad: {
      id: 'transferred_abroad',
      question: 'האם הועברו מישראל לחו"ל 500,000 ₪ או יותר במהלך השנה?',
      helpText: 'העברה כזו יוצרת חובת דיווח בשנת ההעברה ובשנה שאחריה.',
      type: 'boolean',
      required: true,
      applyToModel: (m, a) => ({
        ...m,
        openingDeclarations: { ...m.openingDeclarations, transferredAbroad500k: a as boolean },
      }),
      next: (_a, m) => nextIncomeBranch(m, 'foreign'),
      targetFieldCodes: ['D-abroad500k'],
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
      next: () => 'extra_deductions',
      targetFieldCodes: ['036'],
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

    extra_deductions: {
      id: 'extra_deductions',
      question: 'האם אחד מהבאים רלוונטי? סמנו הכל (או המשיכו אם לא)',
      helpText: 'אלה זיכויים שרוב הלקוחות מפספסים — שווה לעצור ולחשוב רגע.',
      type: 'multi_select',
      required: false,
      options: [
        { value: 'disability_insurance', label: 'ביטוח אובדן כושר עבודה פרטי' },
        { value: 'survivor_annuity', label: 'ביטוח קצבת שאירים' },
        { value: 'institution_care', label: 'מימון החזקת הורה/ילד/בן זוג במוסד סיעודי' },
        { value: 'us_charities', label: 'תרומות למוסדות בארה"ב' },
        { value: 'special_investments', label: 'השקעה במחקר מדעי / חיפושי נפט / סרטים' },
      ],
      applyToModel: (m, a) => {
        const sel = (Array.isArray(a) ? a : []) as string[];
        const si: Array<'research' | 'oil' | 'film'> = [];
        if (sel.includes('special_investments')) si.push('research');
        return {
          ...m,
          deductionsCredits: {
            ...m.deductionsCredits,
            hasDisabilityInsurance: sel.includes('disability_insurance'),
            hasSurvivorAnnuityInsurance: sel.includes('survivor_annuity'),
            paysInstitutionCare: sel.includes('institution_care'),
            hasUsCharityDonations: sel.includes('us_charities'),
            specialInvestments: si,
          },
        };
      },
      next: () => 'alimony_received',
      targetFieldCodes: ['112', '140', '132', '046', 'SI-invest'],
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
      visibleWhen: (m) => ['divorced', 'separated', 'widowed'].includes(m.identity?.maritalStatus ?? ''),
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
      visibleWhen: (m) => ['divorced', 'separated', 'married'].includes(m.identity?.maritalStatus ?? ''),
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
      targetFieldCodes: ['135', '268'],
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
      next: (a) => (a ? 'soldier_service_months' : 'has_academic_degree'),
      targetFieldCodes: ['024'],
    },

    soldier_service_months: {
      id: 'soldier_service_months',
      question: 'כמה חודשי שירות סדיר הושלמו?',
      helpText: 'מעל 23 חודשים — נקודת זיכוי מלאה יותר. הזיכוי נמשך 36 חודשים מהשחרור.',
      type: 'number',
      required: true,
      applyToModel: (m, a) => ({
        ...m,
        deductionsCredits: { ...m.deductionsCredits, soldierServiceMonths: Number(a) || 0 },
      }),
      next: () => 'has_academic_degree',
      targetFieldCodes: ['024'],
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
      next: () => 'companies_situations',
      targetFieldCodes: ['181'],
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

    // ═══ ו2. חברות, שותפויות ומשיכות (אריח "חברות") ═══════════════════════
    companies_situations: {
      id: 'companies_situations',
      question: 'בנוגע לחברות בבעלותך — סמן כל מה שקרה השנה',
      helpText: 'כל סימון פותח טיפול ייעודי אצל רואה החשבון + רשימת הטפסים הנדרשים.',
      type: 'multi_select',
      required: false,
      options: [
        { value: 'own_dividend', label: 'קיבלתי דיבידנד מהחברה שלי' },
        { value: 'owner_withdrawals', label: 'משכתי כספים מהחברה (מעל 100 אלף ₪ מצטבר)' },
        { value: 'close_company_62a', label: 'חברת ארנק — הכנסתה מיוחסת אליי (סעיף 62א)' },
        { value: 'house_company', label: 'חברת בית (חברה שמחזיקה נדל"ן, סעיף 64)' },
        { value: 'patent', label: 'מכרתי פטנט / זכות יוצרים (מכירה חד-פעמית)' },
        { value: 'preferred_dividend', label: 'דיבידנד ממפעל מועדף / מאושר' },
      ],
      applyToModel: (m, a) => {
        const sel = (Array.isArray(a) ? a : []) as string[];
        const wantsDividend = sel.includes('own_dividend') || sel.includes('preferred_dividend');
        return {
          ...m,
          income: {
            ...m.income,
            sources: wantsDividend && !(m.income.sources ?? []).includes('dividend')
              ? [...m.income.sources, 'dividend' as IncomeSourceKind]
              : m.income.sources,
            hasOwnerWithdrawals: sel.includes('owner_withdrawals'),
            hasCloseCompanyPassthrough: sel.includes('close_company_62a'),
            isHouseCompanyMember: sel.includes('house_company'),
            hasPatentOrPostMortemIncome: sel.includes('patent'),
            hasPreferredEnterpriseDividend: sel.includes('preferred_dividend'),
          },
        };
      },
      next: (a) => {
        const sel = (Array.isArray(a) ? a : []) as string[];
        return sel.includes('own_dividend') || sel.includes('preferred_dividend')
          ? 'dividend_controlling'
          : 'paid_advance_payments';
      },
      visibleWhen: (m) => m.income?.hasCompanyInvolvement === true,
      targetFieldCodes: ['323', '351', '159', '061', '173', '141'],
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
      next: () => 'special_situations_select',
      targetFieldCodes: ['042', '043', '253', 'WH-summary'],
    },

    // ═══ ח. נסיבות מיוחדות — שאלה מרוכזת אחת במקום שרשרת ═══════════════════
    special_situations_select: {
      id: 'special_situations_select',
      question: 'לסיום — האם אחד מהמצבים הבאים חל עליך? (רוב הלקוחות ממשיכים ישר)',
      helpText: 'אלה מצבים נדירים עם חובות דיווח מיוחדות. סימון = רואה החשבון יטפל, לא תישאלו עוד.',
      type: 'multi_select',
      required: false,
      options: [
        { value: 'losses', label: 'הפסדים משנים קודמות (מעסק, נכס, ני"ע)' },
        { value: 'wealth_decl', label: 'פקיד השומה דרש הצהרת הון' },
        { value: 'trust', label: 'קשור/ה לנאמנות (יוצר או נהנה)' },
        { value: 'related_party', label: 'עסקאות עם חברות קשורות בחו"ל' },
        { value: 'opinion', label: 'קיבלתי חוות דעת מס / נקטתי עמדה חייבת בדיווח' },
        { value: 'internet_energy', label: 'הכנסות מפעילות אינטרנט / אנרגיה מתחדשת (סולארי)' },
        { value: 'construction', label: 'קבלן — הסתיים פרויקט בנייה' },
        { value: 'non_resident', label: 'שהיתי בישראל אך אני טוען/ת שאינני תושב/ת' },
      ],
      applyToModel: (m, a) => {
        const sel = (Array.isArray(a) ? a : []) as string[];
        const codes: Array<'internet' | 'renewable_energy'> = [];
        if (sel.includes('internet_energy')) codes.push('internet');
        return {
          ...m,
          specialSituations: {
            ...m.specialSituations,
            hasCarriedLosses: sel.includes('losses'),
            wealthDeclarationRequired: sel.includes('wealth_decl'),
          },
          openingDeclarations: {
            ...m.openingDeclarations,
            trustRole: sel.includes('trust') ? 'both' : 'none',
            hasRelatedPartyForeignTransactions: sel.includes('related_party'),
            hasReportableOpinionOrPosition: sel.includes('opinion'),
            specialActivityCodes: codes,
            hasConstructionCompletion: sel.includes('construction'),
            claimsNonResidencyDaysPresumption: sel.includes('non_resident'),
          },
        };
      },
      next: (a) => {
        const sel = (Array.isArray(a) ? a : []) as string[];
        if (sel.includes('trust')) return 'trust_role';
        if (sel.includes('losses')) return 'carried_losses';
        return 'is_family_company_member';
      },
      targetFieldCodes: ['W-decl', 'D-trust', 'D-related-party', 'D-opinion', '307', 'D-construction', 'D-non-resident'],
    },

    trust_role: {
      id: 'trust_role',
      question: 'מה הקשר שלך לנאמנות?',
      type: 'single_select',
      required: true,
      options: [
        { value: 'settlor', label: 'יוצר הנאמנות (הקמתי / הכנסתי נכסים)' },
        { value: 'beneficiary', label: 'נהנה (קיבלתי או זכאי לקבל חלוקות)' },
        { value: 'both', label: 'גם וגם' },
      ],
      applyToModel: (m, a) => ({
        ...m,
        openingDeclarations: {
          ...m.openingDeclarations,
          trustRole: a as 'settlor' | 'beneficiary' | 'both',
        },
      }),
      next: (_a, m) => (m.specialSituations?.hasCarriedLosses ? 'carried_losses' : 'is_family_company_member'),
      targetFieldCodes: ['D-trust'],
    },

    carried_losses: {
      id: 'carried_losses',
      question: 'איזה סוג הפסדים מועברים יש? סמנו את כל הרלוונטיים',
      helpText: 'היתרות המדויקות יאותרו מהשומה האחרונה — כאן רק מסמנים את הסוג.',
      type: 'multi_select',
      required: false,
      options: [
        { value: 'business_carry', label: 'הפסד מעסק / משלח יד' },
        { value: 'rental_property', label: 'הפסד מנכס מושכר' },
        { value: 'capital_carry', label: 'הפסדי הון / ני"ע' },
        { value: 'securities_pre2006', label: 'הפסדי ני"ע ישנים (לפני 2006)' },
        { value: 'foreign_carry', label: 'הפסדים מפעילות בחו"ל' },
        { value: 'rnd_investment', label: 'השקעה בחברת מו"פ (חוק האנג\'לים)' },
      ],
      applyToModel: (m, a) => {
        const kinds = (Array.isArray(a) ? a : []) as NonNullable<TaxpayerModel['losses']['kinds']>;
        return {
          ...m,
          losses: { ...m.losses, kinds },
          specialSituations: { ...m.specialSituations, hasCarriedLosses: kinds.length > 0 },
        };
      },
      next: () => 'is_family_company_member',
      targetFieldCodes: ['079', '179', '166', '160', '299', '319'],
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

// ─── שיוך פרקים ─────────────────────────────────────────────────────────────
// כל שאלה משויכת לפרק. מוחל על העץ מיד אחרי ההגדרה — מקום אחד לתחזוקה.

const NODE_CHAPTERS: Record<string, ChapterKey> = {
  year_map: 'identity_family',
  identity_basics: 'identity_family',
  marital_status: 'identity_family',
  registered_spouse_role: 'identity_family',
  spouse_has_income: 'identity_family',
  spouse_has_106: 'identity_family',
  spouse_has_business: 'identity_family',
  eligible_separate_calc: 'identity_family',
  children_count: 'identity_family',
  children_details_required: 'identity_family',
  children_special_needs: 'identity_family',
  is_custodial_single_parent: 'identity_family',
  child_economics: 'identity_family',
  residency_type: 'identity_family',
  elects_section_14: 'identity_family',
  qualifying_settlement: 'identity_family',
  has_disability: 'identity_family',
  disability_band: 'identity_family',
  income_sources: 'identity_family',

  salary_employer_count: 'salary',
  salary_owner: 'salary',
  shift_work: 'salary',
  received_severance: 'salary',
  severance_spread: 'salary',
  has_options_102: 'salary',

  business_kind: 'business',
  business_owner: 'business',
  partnership_member: 'business',
  biz_revenue_band: 'business',
  biz_has_client_withholding: 'business',
  business_asset_rental: 'business',
  biz_keren_hashtalmut: 'business',

  rental_track: 'rental',
  rental_owner: 'rental',
  rental_gross: 'rental',
  rents_own_home: 'rental',
  rent_paid_annual: 'rental',

  capital_has_securities: 'capital',
  capital_securities_withholding: 'capital',
  capital_has_crypto: 'capital',
  capital_has_real_estate: 'capital',
  has_interest_income: 'capital',
  interest_owner: 'capital',
  interest_has_withholding: 'capital',
  dividend_controlling: 'companies',
  dividend_preferred: 'companies',

  has_pension_income: 'pension_ni',
  pension_owner: 'pension_ni',
  exempt_pensions: 'pension_ni',
  ni_maternity: 'pension_ni',
  ni_unemployment: 'pension_ni',
  ni_reserve_duty: 'pension_ni',
  ni_work_injury: 'pension_ni',
  ni_benefits_owner: 'pension_ni',
  maternity_spread: 'pension_ni',

  has_other_income: 'special',
  other_income_kinds: 'special',

  foreign_countries: 'foreign',
  foreign_income_kinds: 'foreign',
  foreign_paid_tax_abroad: 'foreign',
  foreign_assets: 'foreign',
  transferred_abroad: 'foreign',

  companies_situations: 'companies',

  donations: 'deductions',
  life_insurance: 'deductions',
  extra_deductions: 'deductions',
  alimony_received: 'deductions',
  alimony_paid: 'deductions',
  self_pension: 'deductions',
  is_discharged_soldier: 'deductions',
  soldier_service_months: 'deductions',
  has_academic_degree: 'deductions',

  paid_advance_payments: 'finish',
  had_withholding_at_source: 'finish',
  special_situations_select: 'special',
  trust_role: 'special',
  carried_losses: 'special',
  wealth_declaration_required: 'special',
  is_family_company_member: 'special',
  is_foreign_controlling_shareholder: 'special',
  is_kibbutz_member: 'special',
  final_declaration: 'finish',
};

for (const [nodeId, chapter] of Object.entries(NODE_CHAPTERS)) {
  const node = annualReportTree.nodes[nodeId];
  if (node) node.chapter = chapter;
}

// ─── תיוג אורך-חיים ─────────────────────────────────────────────────────────
// עובדות "קבוע" נשאלות פעם אחת בקליטה ונשמרות בפרופיל; כל השאר "שנתי".
// ברירת מחדל למה שלא ברשימה: annual.

const PERMANENT_NODES: string[] = [
  'year_map',                    // מקורות ההכנסה הקיימים = מבנה הפרופיל
  'identity_basics', 'marital_status', 'registered_spouse_role',
  'children_count', 'children_details_required', 'children_special_needs',
  'is_custodial_single_parent', 'child_economics',
  'residency_type', 'qualifying_settlement', 'has_disability', 'disability_band',
  'salary_owner',
  'business_kind', 'business_owner', 'partnership_member',
  'rental_owner', 'rents_own_home',
  'interest_owner', 'pension_owner',
  'dividend_controlling',
  'is_discharged_soldier', 'soldier_service_months', 'has_academic_degree',
  'is_family_company_member', 'is_foreign_controlling_shareholder', 'is_kibbutz_member',
  'trust_role',
];

for (const node of Object.values(annualReportTree.nodes)) {
  node.lifetime = PERMANENT_NODES.includes(node.id) ? 'permanent' : 'annual';
}

// ─── עזרים ──────────────────────────────────────────────────────────────────

const INCOME_BRANCH_ORDER: IncomeSourceKind[] = [
  'salary', 'business', 'rental', 'capital', 'dividend', 'foreign',
];

const BRANCH_FIRST_NODE: Partial<Record<IncomeSourceKind, string>> = {
  salary: 'salary_employer_count',
  business: 'business_kind',
  rental: 'rental_gross',
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

// ─── פרקים רלוונטיים לפרופיל, לפי סדר ההופעה בשאלון ────────────────────────

export function chaptersForModel(m: TaxpayerModel): ChapterKey[] {
  const src = m.income?.sources ?? [];
  const out: ChapterKey[] = ['identity_family'];
  if (src.includes('salary')) out.push('salary');
  if (src.includes('business')) out.push('business');
  if (src.includes('rental')) out.push('rental');
  if (src.includes('capital') || src.includes('interest')) out.push('capital');
  if (src.includes('pension')) out.push('pension_ni');
  if (src.includes('foreign')) out.push('foreign');
  out.push('deductions');
  if (m.income?.hasCompanyInvolvement || src.includes('dividend')) out.push('companies');
  out.push('special', 'finish');
  return out;
}

// אומדן מספר השאלות הצפויות לפרופיל מסוים (אחרי שער האריחים)
export function estimateTotalQuestions(model: TaxpayerModel): number {
  const married = model.identity.maritalStatus === 'married';
  // בסיס: שער, זהות, מצב משפחתי, ילדים, תושבות, ישוב, נכות, תרומות, ביטוח חיים,
  // ניכויים נוספים, פנסיה עצמאית, חייל, תואר, מקדמות, ניכוי במקור, מצבים מיוחדים,
  // 3 אימותי כרטיס, הצהרה — רובן בלחיצה אחת.
  let base = 19;
  if (married) base += 4;
  if ((model.identity.childrenCount ?? 0) > 0) base += 2;
  if (model.identity.hasDisability) base += 1;
  if (model.identity.residencyType !== 'resident') base += 1;
  for (const k of model.income.sources) {
    if (k === 'salary') base += married ? 4 : 3;
    if (k === 'business') base += married ? 6 : 5;
    if (k === 'rental') base += married ? 3 : 2;
    if (k === 'capital') base += 4;
    if (k === 'interest') base += married ? 2 : 1;
    if (k === 'pension') base += married ? 7 : 6;
    if (k === 'dividend') base += 2;
    if (k === 'foreign') base += 5;
    if (k === 'other') base += 2;
  }
  if (model.income.hasCompanyInvolvement) base += 1;
  return base;
}

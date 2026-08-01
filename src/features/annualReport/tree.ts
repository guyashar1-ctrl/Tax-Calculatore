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
        { value: 'salary', label: 'עבודה כשכיר/ה (משכורת, טופס 106)' },
        { value: 'business', label: 'עסק עצמאי / משלח יד' },
        { value: 'rental', label: 'נכס מושכר (דירה / נכס אחר)' },
        { value: 'capital', label: 'שוק ההון וחסכונות (ני"ע, קריפטו, ריבית, דיבידנד)' },
        { value: 'pension_ni', label: 'קצבאות: פנסיה, פרישה, ביטוח לאומי (לידה/אבטלה/מילואים)' },
        { value: 'foreign', label: 'הכנסות או נכסים בחו"ל' },
        { value: 'companies', label: 'חברה בבעלותי / שותפות / משיכות בעלים' },
        { value: 'other', label: 'אחר: הגרלות, תמלוגים, פרסים' },
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
      question: 'מה המצב המשפחתי שלך לתום שנת המס?',
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
      // בן הזוג הרשום + חישוב מאוחד/נפרד = הכרעות רו"ח בשער הכיסוי, לא שאלות לקוח
      next: (a) => (a === 'married' ? 'spouse_has_income' : 'children_count'),
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
      // מוצג רק כשהכרטיס לא קבע (תיק מ"ה בכרטיס = מקור האמת; נזרע למודל בפתיחה)
      visibleWhen: (m) => m.identity?.maritalStatus === 'married' && !m.spouse?.registeredRole,
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
      next: (a) => (a ? 'spouse_income_kinds' : 'children_count'),
      targetFieldCodes: ['S-calc'],
    },

    spouse_income_kinds: {
      id: 'spouse_income_kinds',
      question: 'ממה ההכנסה של בן/בת הזוג? סמנו את כל מה שרלוונטי',
      type: 'multi_select',
      required: true,
      options: [
        { value: 'salary', label: 'משכורת (יש טופס 106)' },
        { value: 'business', label: 'עסק עצמאי' },
        { value: 'other', label: 'אחר (קצבה, שכירות...)' },
      ],
      applyToModel: (m, a) => {
        const kinds = (Array.isArray(a) ? a : []) as string[];
        return {
          ...m,
          spouse: {
            ...m.spouse,
            has106: kinds.includes('salary'),
            hasBusinessIncome: kinds.includes('business'),
          },
        };
      },
      next: () => 'children_count',
      targetFieldCodes: ['172', 'S-calc'],
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
      visibleWhen: (m) => m.identity?.maritalStatus === 'married' && m.identity?.spouseHasIncome === true,
      targetFieldCodes: ['S-calc'],
    },

    // ═══ ג. ילדים ════════════════════════════════════════════════════════════
    children_count: {
      id: 'children_count',
      question: 'כמה ילדים עד גיל 18 (כולל) יש לך?',
      type: 'number',
      required: true,
      applyToModel: (m, a) => ({
        ...m,
        identity: { ...m.identity, childrenCount: Number(a) || 0 },
      }),
      next: (a) => (Number(a) > 0 ? 'children_special_needs' : 'residency_type'),
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

    children_special_needs: {
      id: 'children_special_needs',
      question: 'האם יש בין הילדים ילד עם נכות מוכרת / צרכים מיוחדים?',
      type: 'boolean',
      required: true,
      validationMode: true,
      editTarget: 'children',
      deriveAnswerFromCard: ({ client }) => {
        const kids = client?.children ?? [];
        return kids.length > 0 ? kids.some((c) => c.hasDisability) : null;
      },
      dataPreview: ({ client }) => {
        const kids = client?.children ?? [];
        if (kids.length === 0) return null;
        const withDis = kids.filter((c) => c.hasDisability);
        return [{
          label: 'לפי רשימת הילדים בכרטיס',
          value: withDis.length > 0 ? `${withDis.length} ילד/ים עם נכות מסומנת` : 'ללא נכות מסומנת',
        }];
      },
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
      question: 'האם הילדים בחזקתך (הורה יחיד שהילדים אצלו)?',
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
      question: 'האם את/ה משתתף/ת בכלכלת הילדים (מזונות או הוצאות) למרות שאינם בחזקתך?',
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
      question: 'מה סטטוס התושבות שלך?',
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
      next: (a) => (a !== 'resident' ? 'elects_section_14' : 'has_disability'),
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
      next: () => 'has_disability',
      visibleWhen: (m) => (m.identity?.residencyType ?? 'resident') !== 'resident',
      targetFieldCodes: ['S14'],
    },

    // ישוב מזכה — נגזר אוטומטית מהכתובת בכרטיס (seedModelFromClient), לא נשאל.
    // הצומת נשאר לתאימות (הפניות שדות + סשנים ישנים שעצרו כאן).
    qualifying_settlement: {
      id: 'qualifying_settlement',
      question: 'האם הלקוח מתגורר ביישוב מזכה?',
      helpText: 'נקבע אוטומטית לפי הכתובת בכרטיס. תיקון — דרך שדה "יישוב מזכה" בכרטיס הלקוח.',
      type: 'boolean',
      required: false,
      applyToModel: (m, a) => ({
        ...m,
        identity: { ...m.identity, livesInQualifyingSettlement: a as boolean },
      }),
      next: () => 'has_disability',
      visibleWhen: () => false,
    },

    has_disability: {
      id: 'has_disability',
      question: 'האם יש לך אחוז נכות מוכר?',
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
      // כשאחוז הנכות כבר בכרטיס — הדרגה נגזרת אוטומטית (seedModelFromClient)
      visibleWhen: (m) => m.identity?.hasDisability === true && !m.identity?.disabilityBand,
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
      question: 'אצל כמה מעסיקים עבדת בשנת המס?',
      helpText: 'אם הרשימה מהכרטיס נכונה — תכניס את אותו המספר. אחרת — תזכור להוסיף/להסיר מעבידים בכרטיס.',
      type: 'number',
      required: true,
      applyToModel: (m, a) => ({
        ...m,
        income: { ...m.income, salaryEmployerCount: Number(a) || 0, hasMultipleEmployers: Number(a) > 1 },
      }),
      // משמרות (068) ואופציות 102 (282) נקראים ישירות מטופס ה-106 — לא נשאל
      next: () => 'received_severance',
      targetFieldCodes: ['158', '106-count', '068', '282'],
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

    // "של מי השכר/העסק/החשבון" — נלמד מהמסמכים עצמם (106/867 נושאים שם), לא נשאל.

    received_severance: {
      id: 'received_severance',
      question: 'האם קיבלת מענק פרישה / פיצויי פיטורין בשנת המס?',
      type: 'boolean',
      required: true,
      applyToModel: (m, a) => ({
        ...m,
        income: { ...m.income, receivedSeverance: a as boolean },
      }),
      next: (a, m) => (a ? 'severance_spread' : nextIncomeBranch(m, 'salary')),
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
      next: (_a, m) => nextIncomeBranch(m, 'salary'),
      visibleWhen: (m) => m.income?.receivedSeverance === true,
      targetFieldCodes: ['009'],
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
      next: () => 'partnership_member',
      targetFieldCodes: ['150'],
    },

    partnership_member: {
      id: 'partnership_member',
      question: 'האם העסק פועל כשותפות עם שותפים נוספים?',
      helpText: 'שותפות מחייבת טופס 1504 וייחוס חלק יחסי במחזור וברווח.',
      type: 'boolean',
      required: true,
      validationMode: true,
      deriveAnswerFromCard: ({ client }) => {
        const biz = (client?.businesses ?? []).filter((b) => !b.isClosed);
        return biz.length > 0 ? biz.some((b) => b.kind === 'partnership') : null;
      },
      dataPreview: ({ client }) => {
        const biz = (client?.businesses ?? []).filter((b) => !b.isClosed);
        if (biz.length === 0) return null;
        return [{ label: 'עסקים בכרטיס', value: biz.map((b) => b.name).join(', ') }];
      },
      applyToModel: (m, a) => ({
        ...m,
        income: { ...m.income, isPartnershipMember: a as boolean },
      }),
      // המחזור (6111) נקבע מדוח הרווח-הפסד; ניכוי במקור מלקוחות (857) נמשך
      // מאישורי הניכויים — שניהם עובדות-מסמך, לא שאלות ללקוח.
      next: () => 'business_asset_rental',
      targetFieldCodes: ['1504', '6111-req', 'B-client-wh'],
    },

    business_asset_rental: {
      id: 'business_asset_rental',
      question: 'האם אתם משכירים נכס ששימש בעסק שלכם 10 שנים ומעלה?',
      helpText: 'השכרה כזו נחשבת הכנסה מיגיעה אישית (שדות 120/220) — מדרגות מס נמוכות יותר.',
      type: 'boolean',
      required: true,
      applyToModel: (m, a) => ({
        ...m,
        income: { ...m.income, hasBusinessAssetRental10y: a as boolean },
      }),
      next: () => 'biz_keren_hashtalmut',
      // רלוונטי רק כשיש גם עסק וגם נכס מושכר — אחרת מדולג
      visibleWhen: (m) =>
        (m.income?.sources ?? []).includes('business') && (m.income?.sources ?? []).includes('rental'),
      targetFieldCodes: ['120'],
    },

    biz_keren_hashtalmut: {
      id: 'biz_keren_hashtalmut',
      question: 'האם הפקדת לקרן השתלמות לעצמאים השנה?',
      type: 'boolean',
      required: true,
      validationMode: true,
      deriveAnswerFromCard: ({ client }) =>
        client?.hasKrenHashtalmut === undefined ? null : !!client.hasKrenHashtalmut,
      dataPreview: ({ client }) => [{
        label: 'קרן השתלמות בכרטיס',
        value: client?.hasKrenHashtalmut ? 'מסומנת' : 'לא מסומנת',
      }],
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
      next: () => 'rents_own_home',
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
      visibleWhen: (m) => (m.income?.sources ?? []).includes('rental'),
      // מחוץ לשרשרת החדשה — נענית משער הכיסוי. סשן ישן שעצר כאן ממשיך רגיל.
      next: () => 'rents_own_home',
      targetFieldCodes: ['332', 'R-flat10', 'R-marginal'],
    },

    // ─── ענף הון ─────────────────────────────────────────────────────────
    capital_has_securities: {
      id: 'capital_has_securities',
      question: 'האם יש לך ניירות ערך סחירים (מניות, אג"ח, קרנות)?',
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
      // ניכוי המס במקור ייקרא ישירות מטופסי ה-867 — אין צורך לשאול
      next: () => 'capital_has_crypto',
      targetFieldCodes: ['CG-securities', '054', 'D-sec-turnover', '253'],
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
      question: 'האם מכרת נכס מקרקעין (שאינו דירת מגורים יחידה) השנה?',
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
      next: (_a, m) =>
        m.income?.hasCompanyInvolvement ? 'special_situations_select' : nextIncomeBranch(m, 'dividend'),
      targetFieldCodes: ['141'],
      validationMode: true,
      deriveAnswerFromCard: ({ client }) =>
        client?.isSubstantialShareholder === undefined ? null : !!client.isSubstantialShareholder,
      dataPreview: ({ client }) => [{
        label: 'בעל מניות מהותי בכרטיס',
        value: client?.isSubstantialShareholder ? 'כן (מסומן)' : 'לא מסומן',
      }],
    },

    // מפעל מועדף/מאושר — מונח מקצועי שהלקוח לא אמור להכיר; הכרעת רו"ח בשער
    dividend_preferred: {
      id: 'dividend_preferred',
      audience: 'accountant',
      question: 'החלטת רו"ח: האם הדיבידנד חולק ממפעל מועדף / מאושר (20%)?',
      helpText: 'נבדק מול אישור החברה המחלקת. משנה שיעור מ-25%/30% ל-20% (שדות 173/275/375).',
      type: 'boolean',
      required: true,
      applyToModel: (m, a) => ({
        ...m,
        income: { ...m.income, hasPreferredEnterpriseDividend: a as boolean },
      }),
      next: (_a, m) =>
        m.income?.hasCompanyInvolvement ? 'special_situations_select' : nextIncomeBranch(m, 'dividend'),
      visibleWhen: (m) => (m.income?.sources ?? []).includes('dividend'),
      targetFieldCodes: ['173'],
    },

    // ─── ענף ריבית ────────────────────────────────────────────────────────
    has_interest_income: {
      id: 'has_interest_income',
      question: 'האם קיבלת ריבית מפיקדונות / אג"ח / תוכניות חיסכון?',
      helpText: 'אם כן — נצטרך 867 מכל בנק בהמשך.',
      type: 'boolean',
      required: true,
      applyToModel: (m, a) => ({
        ...m,
        income: { ...m.income, hasInterestIncome: a as boolean },
      }),
      // הפירוט לפי שיעורי מס והניכוי במקור נקראים מה-867 — שאלת טריגר בלבד
      next: () => 'bank_names',
      visibleWhen: (m) => (m.income?.sources ?? []).includes('interest') || (m.income?.sources ?? []).includes('capital'),
      targetFieldCodes: ['076', '074', '060', '067', '157', '043'],
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
          value: b.isPrimary ? 'ראשי' : 'חשבון',
          missing: !b.bankName,
        }));
      },
    },

    // ─── חשבונות — פרופיל קבוע, רלוונטי ל-867 ולהצהרת הון ───────────────────
    bank_names: {
      id: 'bank_names',
      question: 'באילו בנקים מתנהלים חשבונות העו"ש שלכם?',
      helpText: 'למשל: לאומי, הפועלים. עוזר לנו לדעת מאילו בנקים לבקש אישורים (867) — וחשוב גם להצהרת הון.',
      type: 'text',
      required: true,
      applyToModel: (m, a) => ({
        ...m,
        accounts: { ...(m.accounts ?? {}), bankNames: String(a ?? '').trim() },
      }),
      next: () => 'investment_institutions',
      validationMode: true,
      editTarget: 'bankAccounts',
      deriveAnswerFromCard: ({ client }) => {
        const banks = (client?.bankAccounts ?? []).map((b) => b.bankName).filter(Boolean);
        return banks.length > 0 ? banks.join(', ') : null;
      },
      dataPreview: ({ client }) => {
        const banks = client?.bankAccounts ?? [];
        if (banks.length === 0) return [{ label: 'חשבונות בנק בכרטיס', value: 'אין', missing: true }];
        return banks.map((b) => ({ label: b.bankName, value: b.isPrimary ? 'ראשי' : 'חשבון', missing: !b.bankName }));
      },
    },

    investment_institutions: {
      id: 'investment_institutions',
      question: 'איפה מתנהל תיק ההשקעות / ניירות הערך שלכם?',
      helpText: 'בית השקעות (מיטב, IBI, אקסלנס...) או בנק. מכל מוסד כזה נבקש אישור שנתי.',
      type: 'text',
      required: true,
      applyToModel: (m, a) => ({
        ...m,
        accounts: { ...(m.accounts ?? {}), investmentInstitutions: String(a ?? '').trim() },
      }),
      next: () => 'has_pension_income',
      visibleWhen: (m) => (m.income?.sources ?? []).includes('capital'),
      validationMode: true,
      editTarget: 'investmentAccounts',
      deriveAnswerFromCard: ({ client }) => {
        const inst = (client?.investmentAccounts ?? []).map((a) => a.institutionName).filter(Boolean);
        return inst.length > 0 ? inst.join(', ') : null;
      },
      dataPreview: ({ client }) => {
        const inst = client?.investmentAccounts ?? [];
        if (inst.length === 0) return [{ label: 'חשבונות השקעה בכרטיס', value: 'אין', missing: true }];
        return inst.map((a) => ({ label: a.institutionName, value: a.kind || 'חשבון', missing: !a.institutionName }));
      },
    },

    // ─── ענף פנסיה, פרישה וקצבאות ─────────────────────────────────────────
    has_pension_income: {
      id: 'has_pension_income',
      question: 'האם את/ה מקבל/ת פנסיה או קצבה שוטפת (ממעביד לשעבר, קרן פנסיה, ביטוח)?',
      type: 'boolean',
      required: true,
      applyToModel: (m, a) => ({
        ...m,
        income: { ...m.income, hasPensionIncome: a as boolean },
      }),
      next: () => 'exempt_pensions',
      visibleWhen: (m) => (m.income?.sources ?? []).includes('pension'),
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
      next: () => 'ni_benefits',
      visibleWhen: (m) => (m.income?.sources ?? []).includes('pension'),
      targetFieldCodes: ['101', '209'],
    },

    // ─── תקבולי ביטוח לאומי — שאלה מרוכזת אחת ─────────────────────────────
    ni_benefits: {
      id: 'ni_benefits',
      question: 'אילו תקבולים קיבלת מביטוח לאומי השנה? סמנו הכל (או המשיכו אם כלום)',
      helpText: 'תקבולים אלה חייבים במס. נבקש אישור שנתי אחד מביטוח לאומי — מי קיבל וכמה כתוב שם.',
      type: 'multi_select',
      required: false,
      options: [
        { value: 'maternity', label: 'דמי לידה' },
        { value: 'unemployment', label: 'דמי אבטלה' },
        { value: 'reserve', label: 'תגמולי מילואים' },
        { value: 'work_injury', label: 'דמי פגיעה בעבודה' },
      ],
      applyToModel: (m, a) => {
        const sel = (Array.isArray(a) ? a : []) as string[];
        return {
          ...m,
          income: {
            ...m.income,
            niMaternityReceived: sel.includes('maternity'),
            niUnemploymentReceived: sel.includes('unemployment'),
            niReserveDutyReceived: sel.includes('reserve'),
            niWorkInjuryReceived: sel.includes('work_injury'),
          },
        };
      },
      next: () => 'maternity_spread',
      visibleWhen: (m) => (m.income?.sources ?? []).includes('pension'),
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
      question: 'האם קיבלת דמי מזונות השנה? אם כן — סכום שנתי (₪).',
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

    // הסכום המדויק נקרא מאישור ההפקדות של הקופה — הלקוח רק מאשר שיש
    self_pension: {
      id: 'self_pension',
      question: 'האם הפקדת השנה כספים לפנסיה או קופת גמל באופן עצמאי (לא דרך המעסיק)?',
      helpText: 'אם כן — נבקש את האישור השנתי מהקופה; הסכום המדויק כתוב שם.',
      type: 'boolean',
      required: true,
      applyToModel: (m, a) => ({
        ...m,
        deductionsCredits: { ...m.deductionsCredits, hasSelfPensionDeposits: a as boolean },
      }),
      next: () => 'is_discharged_soldier',
      targetFieldCodes: ['135', '268'],
      validationMode: true,
      deriveAnswerFromCard: ({ client }) => {
        const funds = client?.pensionFunds;
        if (!funds || funds.length === 0) return null;
        return funds.some((p) => p.hasSelfDeposits);
      },
      editTarget: 'pensionFunds',
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
      question: 'האם השתחררת מצה"ל / שירות לאומי בשנתיים האחרונות?',
      helpText: 'מקנה 2 נקודות זיכוי לשנת השחרור ושנתיים אחריה.',
      type: 'boolean',
      required: true,
      validationMode: true,
      deriveAnswerFromCard: ({ client, model }) => {
        if (client?.completedIdf === undefined && client?.completedNationalService === undefined) return null;
        const y = model?.taxYear ?? new Date().getFullYear();
        const rel = client?.idfReleaseYear || client?.nationalServiceYear || 0;
        return (!!client?.completedIdf || !!client?.completedNationalService) && rel > 0 && y - rel <= 2;
      },
      dataPreview: ({ client }) => [{
        label: 'שירות בכרטיס',
        value: client?.completedIdf
          ? `צה"ל, שחרור ${client.idfReleaseYear || '?'}`
          : client?.completedNationalService
            ? `שירות לאומי, סיום ${client.nationalServiceYear || '?'}`
            : 'לא מסומן',
      }],
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
      question: 'האם קיבלת תואר אקדמי בשלוש השנים האחרונות?',
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
          : 'special_situations_select';
      },
      visibleWhen: (m) => m.income?.hasCompanyInvolvement === true,
      targetFieldCodes: ['323', '351', '159', '061', '173', '141'],
    },

    // מקדמות (040) וניכויי מקור (042/043/253) נמשכים משע"ם ומהמסמכים —
    // עובדות-מסמך, לא שאלות ללקוח. הצמתים בוטלו.

    // ═══ ח. נסיבות מיוחדות — שאלה מרוכזת אחת במקום שרשרת ═══════════════════
    special_situations_select: {
      id: 'special_situations_select',
      question: 'לסיום — האם אחד מהמצבים הבאים חל עליך? (רוב הלקוחות ממשיכים ישר)',
      helpText: 'אלה מצבים נדירים עם חובות דיווח מיוחדות. סימון = רואה החשבון יטפל, לא תישאלו עוד.',
      type: 'multi_select',
      required: false,
      options: [
        { value: 'wealth_decl', label: 'קיבלתי מכתב מפקיד השומה שדורש הצהרת הון' },
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
      next: () => 'is_family_company_member',
      targetFieldCodes: ['D-trust'],
    },

    // הפסדים מועברים — הלקוח כמעט אף פעם לא יודע; נלקח מהשומה הקודמת. הכרעת רו"ח.
    carried_losses: {
      id: 'carried_losses',
      audience: 'accountant',
      question: 'החלטת רו"ח: אילו הפסדים מועברים יש (לפי השומה האחרונה)?',
      helpText: 'סמנו סוגים קיימים; היתרות המדויקות מהשומה/דוח קודם. אין — השאירו ריק ושמרו.',
      type: 'multi_select',
      required: false,
      visibleWhen: (m) => {
        const src = m.income?.sources ?? [];
        return src.includes('business') || src.includes('capital') || src.includes('rental') || src.includes('foreign');
      },
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
  spouse_income_kinds: 'identity_family',
  eligible_separate_calc: 'identity_family',
  children_count: 'identity_family',
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
  received_severance: 'salary',
  severance_spread: 'salary',

  business_kind: 'business',
  partnership_member: 'business',
  business_asset_rental: 'business',
  biz_keren_hashtalmut: 'business',

  rental_track: 'rental',
  rental_gross: 'rental',
  rents_own_home: 'rental',
  rent_paid_annual: 'rental',

  capital_has_securities: 'capital',
  capital_has_crypto: 'capital',
  capital_has_real_estate: 'capital',
  has_interest_income: 'capital',
  bank_names: 'capital',
  investment_institutions: 'capital',
  dividend_controlling: 'companies',
  dividend_preferred: 'companies',

  has_pension_income: 'pension_ni',
  exempt_pensions: 'pension_ni',
  ni_benefits: 'pension_ni',
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
  'spouse_has_income', 'spouse_income_kinds',   // תעסוקת בן/בת הזוג = חלק מהפרופיל
  'bank_names', 'investment_institutions',      // איפה החשבונות — 867 והצהרת הון
  'children_count', 'children_special_needs',
  'is_custodial_single_parent', 'child_economics',
  'residency_type', 'qualifying_settlement', 'has_disability', 'disability_band',

  'business_kind', 'partnership_member',
  'rents_own_home',
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

/** סדר הפרקים הקבוע — משמש את המפה, הסרגל ושער הכיסוי. */
export const CHAPTER_ORDER: ChapterKey[] = [
  'identity_family', 'salary', 'business', 'rental', 'capital',
  'pension_ni', 'foreign', 'deductions', 'companies', 'special', 'finish',
];

/** כל השאלות מקובצות לפי פרק, בסדר ההגדרה בעץ. */
export function nodesByChapter(): Map<ChapterKey, import('./types').QuestionNode[]> {
  const map = new Map<ChapterKey, import('./types').QuestionNode[]>();
  for (const ch of CHAPTER_ORDER) map.set(ch, []);
  for (const node of Object.values(annualReportTree.nodes)) {
    map.get(node.chapter ?? 'finish')?.push(node);
  }
  return map;
}

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
  let base = 15;
  if (married) base += 2;
  if ((model.identity.childrenCount ?? 0) > 0) base += 2;
  if (model.identity.hasDisability) base += 1;
  if (model.identity.residencyType !== 'resident') base += 1;
  for (const k of model.income.sources) {
    if (k === 'salary') base += 2;
    if (k === 'business') base += 3;
    if (k === 'rental') base += 2;
    if (k === 'capital') base += 3;
    if (k === 'interest') base += 1;
    if (k === 'pension') base += 3;
    if (k === 'dividend') base += 2;
    if (k === 'foreign') base += 5;
    if (k === 'other') base += 2;
  }
  if (model.income.hasCompanyInvolvement) base += 1;
  return base;
}

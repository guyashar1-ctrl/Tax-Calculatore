// ─── ענף כלכלי לטופס 821 — הרשימה הרשמית של רשות המסים ─────────────────────────────
// ‼ 16.10.2026 (גיא, סבב 2): לא רשימת-על של הלמ״ס אלא 591 הענפים של אתר רשות המסים («ענפים כלכליים»,
//   misim.gov.il/mm_anafim) — אותם קודים שמסך «פתיחת תיק» ומערכת מע״מ משתמשים בהם. הערך הנשמר = הקוד.
//   המקור והחיפוש: src/data/vatBranches.ts. ערכים ישנים (אות סדר A..S מהסבב הראשון) נקראים לתצוגה בלבד.

import { VAT_BRANCHES, SECTION_LABEL, branchName } from '../../../data/vatBranches';

export interface Industry { value: string; label: string }

export const INDUSTRIES: Industry[] = VAT_BRANCHES.map(b => ({ value: b.code, label: `${b.code} · ${b.name}` }));

/** השם לטופס המודפס: שם הענף לפי הקוד; ערך ישן (אות) — שם הסדר. */
export const industryShort = (value: string | undefined): string => {
  if (!value) return '';
  return branchName(value) || SECTION_LABEL[value] || '';
};

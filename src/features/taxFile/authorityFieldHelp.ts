// ─── «איפה מוצאים את זה ברשות?» — עזרת שדה לתצוגה הקומפקטית ─────────────────
// ‼ אין כאן אף מסלול ניווט כתוב ביד. הכול נגזר מ-INSTITUTIONS — התצורה של
// מסכי יישור הקו המלאים (InstitutionAlignment.tsx), שהיא המקום היחיד שבו
// המשרד תיעד «לאן להיכנס» לכל שדה. שדה שאין לו שם מסלול — אין לו עזרה גם
// כאן (§8 ב-CLAUDE.md: לא ממציאים).
//
// המפתח הוא מפתח השדה בכרטיס הלקוח (governedKey / editKey / syncKey), ולכן
// אותה עזרה משרתת את הלקוח ואת בן/בת הזוג: מפתחות `spouseNi*` מתנרמלים
// ל-`ni*` — המסלול בפורטל ביטוח לאומי זהה לשני האנשים.

import { INSTITUTIONS } from '../../components/clientTabs/InstitutionAlignment';
import type { HowToGuide } from '../../components/clientTabs/InstitutionAlignment';
import type { InstitutionKey } from '../../types/onboarding';

export interface AuthorityFieldHelp {
  institution: InstitutionKey;
  /** שם המערכת שבה מחפשים — לכותרת «איפה מוצאים ב…?». */
  source: string;
  /** מסלול/י ניווט, כפי שתועדו במסך יישור הקו. */
  paths: string[];
  /** «איך בודקים?» — סדר פעולות בשאילתה, כשקיים. */
  guide?: HowToGuide;
}

/**
 * שם המערכת בשפת המשרד. ‼ מע״מ נקרא בשע״ם (מערכת מע״מ בפורטל המייצגים),
 * ולכן «שע״ם» ולא «מע״מ» — המסלול עצמו כבר אומר באיזו מערכת.
 */
const SOURCE_LABEL: Record<InstitutionKey, string> = {
  income: 'שע״ם',
  vat: 'שע״ם',
  btl: 'ביטוח לאומי',
};

let cache: Record<string, AuthorityFieldHelp> | null = null;

function build(): Record<string, AuthorityFieldHelp> {
  const out: Record<string, AuthorityFieldHelp> = {};
  const put = (key: string | undefined, institution: InstitutionKey, paths: string[] | undefined, guide?: HowToGuide) => {
    if (!key || out[key]) return;
    if ((!paths || paths.length === 0) && !guide) return;
    out[key] = { institution, source: SOURCE_LABEL[institution], paths: paths ?? [], guide };
  };
  for (const institution of Object.keys(INSTITUTIONS) as InstitutionKey[]) {
    const cfg = INSTITUTIONS[institution];
    for (const section of cfg.sections) {
      for (const f of section.fields) put(f.governedKey, institution, f.where ?? section.where);
    }
    for (const exc of cfg.exceptions) {
      put(exc.governedKey, institution, exc.where, exc.guide);
      put(exc.extraFieldWhenBad?.governedKey, institution, exc.extraFieldWhenBad?.where ?? exc.where, exc.guide);
    }
    if (cfg.occupationsWhere) put('niOccupations', institution, cfg.occupationsWhere);
  }
  return out;
}

/** מפתח של בן/בת הזוג בב״ל → המפתח הבסיסי: המסלול בפורטל זהה. */
function normalizeKey(fieldKey: string): string {
  return fieldKey.startsWith('spouseNi') ? 'ni' + fieldKey.slice('spouseNi'.length) : fieldKey;
}

/** העזרה לשדה, או null כשאין מסלול מתועד — ואז לא מציגים כלום. */
export function authorityFieldHelp(fieldKey: string | undefined): AuthorityFieldHelp | null {
  if (!fieldKey) return null;
  cache ??= build();
  return cache[normalizeKey(fieldKey)] ?? null;
}

// ─── לשונית «המסך שנפתח» — המסך הנפרד שהכפתור בדף פותח (?onboard= · ?sign= · ?release= · ?intake= · ?sign-form=) ──
// ‼ הרכיב האמיתי מצויר על נתוני דוגמה, בלי רשת (שלב ה׳ בתוכנית) — linkedRenderers.tsx. מסך שעוד לא הופרד מהטעינה שלו —
// משפט כן ונרשם כפער בדוח; לא צילום מסך ולא חיקוי (הם מתיישנים).

import { Suspense, lazy, useEffect, useState } from 'react';
import type { FirmProfile } from '../../types/firmProfile';
import { FlSeg } from '../../components/flows/builder/ui';
import type { LinkedKey } from './registry';
import type { PreviewData } from './types';

// ‼ בעצלות — ראה linkedRenderers.tsx (מנוע ה-PDF).
const LinkedScreenBody = lazy(() => import('./linkedRenderers'));

/** מה פותח כל קישור, בשפת המשרד — מוצג כשאין מסך לצייר. */
export const LINKED_EXPLAIN: Record<LinkedKey, string> = {
  onboard: 'בלחיצה נפתח מסך נפרד: הלקוח ממלא את פרטיו האישיים ומאשר את הפרטים לייפוי הכוח.',
  sign: 'בלחיצה נפתח מסך נפרד: הלקוח חותם על ייפוי הכוח.',
  release: 'בלחיצה נפתח מסך נפרד — לרו״ח הקודם, גורם חיצוני ולא הלקוח: הוא חותם על מכתב ההעברה ומעלה את החומרים.',
  intake: 'בלחיצה נפתח מסך נפרד: שאלון «עדכון סטטוס מיסויי» — עונים רק על מה שרלוונטי, ואפשר לעצור ולהמשיך.',
  signForm: 'בלחיצה נפתח מסך נפרד: חתימה על טופס 6101 בקישור אישי.',
};

export const LINKED_TITLE: Record<LinkedKey, string> = {
  onboard: 'מילוי פרטים לייפוי הכוח',
  sign: 'חתימה על ייפוי הכוח',
  release: 'הדף של הרו״ח הקודם',
  intake: 'שאלון עדכון סטטוס מיסויי',
  signForm: 'חתימה על טופס 6101',
};

/** ייצוג: הלקוח ממלא פרטים (?onboard=) ואחר כך חותם על ייפוי הכוח בקישור אישי (?sign=) — שני מסכים, אותה בקשה. */
const SIBLINGS: Partial<Record<LinkedKey, LinkedKey[]>> = { onboard: ['onboard', 'sign'], sign: ['onboard', 'sign'] };

export default function LinkedPagePreview({ kind, couple, data, profile }: {
  kind: LinkedKey;
  couple: boolean;
  /** מה שהשרת החזיר לדוגמה — שם המשרד והמיתוג נלקחים משם, לא מכאן. */
  data: PreviewData | null;
  profile: FirmProfile;
}) {
  // ‼ נפתח במה שהכפתור בדף פותח; בייצוג אפשר לעבור למסך השני של אותה בקשה.
  const [shown, setShown] = useState<LinkedKey>(kind);
  useEffect(() => setShown(kind), [kind]);
  const siblings = SIBLINGS[kind];
  return (
    <div className="rp-linked" data-testid="rp-linked" data-linked={shown}>
      {siblings && (
        <FlSeg label="איזה מסך" small value={shown} onChange={setShown}
          options={siblings.map(k => ({ value: k, label: LINKED_TITLE[k] }))} />
      )}
      <h3 className="rp-h">{LINKED_TITLE[shown]}</h3>
      <p className="rp-lead">{LINKED_EXPLAIN[shown]}</p>
      {data ? (
        <Suspense fallback={<p className="rp-hint" aria-busy="true">טוען…</p>}>
          <LinkedScreenBody kind={shown} opts={{ couple, firmName: data.firmName, branding: data.branding ?? {}, profile }} />
        </Suspense>
      ) : <p className="rp-hint" aria-busy="true">טוען…</p>}
    </div>
  );
}

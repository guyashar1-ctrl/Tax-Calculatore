// ─── «המסך שנפתח» — המסכים האמיתיים של הלקוח, מצוירים על נתוני דוגמה ──────────────────────────
// ‼ אלה אותם רכיבים שהלקוח רואה בקישור האישי (`OnboardingView`, `PublicSignView`, ...) במצב `sample`:
// כל פעולה שהייתה שולחת/שומרת/חותמת מציגה «בתצוגה לדוגמה — כאן הלקוח היה שולח» ואינה פונה לרשת.
// ‼ הניסוחים לא נכתבים כאן: שם המשרד והמיתוג מגיעים מהשרת (preview_request_sample), ומכתב ההעברה ורשימת החומרים
// נבנים באותו קוד של הרו״ח (utils/releaseLetter) מהתבנית של המשרד. כאן נקבעים רק קלטים: מי, אילו רשויות, איזו תקופה.

import { useEffect, useMemo, useState, type ReactNode } from 'react';
import type { FirmBranding, FirmProfile } from '../../types/firmProfile';
import type { LinkedKey } from './registry';
import { OnboardingView } from '../../components/OnboardingPage';
import { PublicSignView } from '../../components/PublicSignPage';
import { PublicReleaseView } from '../../components/PublicReleasePage';
import { PublicIntakePageView } from '../../components/PublicIntakePage';
import { PublicSmartFormSignView } from '../smartForms/PublicSmartFormSignPage';
import LinkedScreenFrame from '../../components/linkedScreens/LinkedScreenFrame';
import { loadSampleForm2279Pdf, renderSampleBtl6101 } from '../../components/linkedScreens/samplePdf';
import {
  SAMPLE_PEOPLE, sampleIntakeData, sampleOnboardingData, sampleReleaseData, sampleSignData, sampleSignFormInfo,
  type SampleAuthority,
} from '../../components/linkedScreens/sample';
import {
  RELEASE_MATERIALS, defaultReleaseBody, defaultReleaseSubject, releaseTemplateFrom, type ReleaseContext,
} from '../../utils/releaseLetter';

/** מה כל מסך צריך מהמארח: מי רואה, אילו רשויות, ואיך נראה המשרד (כפי שהשרת החזיר). */
export interface LinkedRenderOpts {
  couple: boolean;
  firmName: string;
  branding: FirmBranding;
  profile: FirmProfile;
}

/** ייצוג מלא בארבע הרשויות — ברירת המחדל של המשרד (ראה quotation-rep-default-full). */
const ALL_AUTHORITIES: SampleAuthority[] = ['incomeTax', 'vat', 'withholding', 'nationalInsurance'];

function Loading({ what }: { what: string }) {
  return <div style={{ padding: 24, color: 'var(--ink-3)' }} aria-busy="true">{what}</div>;
}

function SignScreen({ opts }: { opts: LinkedRenderOpts }) {
  const [bytes, setBytes] = useState<ArrayBuffer | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let alive = true;
    void loadSampleForm2279Pdf().then(b => { if (alive) setBytes(b); }, () => { if (alive) setFailed(true); });
    return () => { alive = false; };
  }, []);
  if (failed) return <Loading what="טופס הדוגמה לא נטען." />;
  if (!bytes) return <Loading what="טוען טופס לדוגמה…" />;
  return <PublicSignView mode="sample" data={sampleSignData({ firmName: opts.firmName, branding: opts.branding, couple: opts.couple, authorities: ALL_AUTHORITIES, pdfBytes: bytes })} />;
}

function SignFormScreen({ opts }: { opts: LinkedRenderOpts }) {
  const info = useMemo(() => sampleSignFormInfo({ firmName: opts.firmName, role: 'client' }), [opts.firmName]);
  const [bytes, setBytes] = useState<Uint8Array | null>(null);
  useEffect(() => {
    let alive = true;
    void renderSampleBtl6101(info).then(b => { if (alive) setBytes(b); }, () => undefined);
    return () => { alive = false; };
  }, [info]);
  return <PublicSmartFormSignView mode="sample" info={info} bytes={bytes} />;
}

function ReleaseScreen({ opts }: { opts: LinkedRenderOpts }) {
  const data = useMemo(() => {
    const template = releaseTemplateFrom(opts.profile.settings);
    const now = new Date();
    // ‼ התקופה האחרונה בטיפול הרו״ח הקודם: החודש שעבר — קלט של הדוגמה, לא טקסט.
    const prev = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const lastPeriodPrev = `${prev.getFullYear()}-${String(prev.getMonth() + 1).padStart(2, '0')}`;
    const P = SAMPLE_PEOPLE;
    const ctx: ReleaseContext = {
      clientName: P.clientFull, prevAccountantName: P.previousAccountant,
      ...(opts.couple ? { spouse: { name: P.spouseFull } } : {}),
    };
    const materials = RELEASE_MATERIALS.filter(m => m.checked);
    return sampleReleaseData({
      firmName: opts.firmName, branding: opts.branding,
      materials: materials.map(m => ({ key: m.key, label: m.label, ...(m.optional ? { optional: true } : {}) })),
      subject: defaultReleaseSubject(ctx, template),
      letterBody: defaultReleaseBody(ctx, opts.firmName, { lastPeriodPrev, materials, ccClient: true, template }),
    });
  }, [opts.profile.settings, opts.firmName, opts.branding, opts.couple]);
  return <PublicReleaseView mode="sample" seenUploadIds={null} onReload={() => undefined} data={data} />;
}

export interface LinkedRenderer { (opts: LinkedRenderOpts): ReactNode }

/** כל המסכים הנפרדים שהפרדנו מהטעינה שלהם. מסך חדש מצטרף כאן, ולא ב-LinkedPagePreview. */
// ‼ Partial בכוונה: מסך חדש בלי רנדרר מציג בלשונית משפט כן («המסך עצמו לא מוצג כאן עדיין») ונרשם כפער — לא חיקוי.
export const LINKED_RENDERERS: Partial<Record<LinkedKey, LinkedRenderer>> = {
  onboard: o => <OnboardingView mode="sample" data={sampleOnboardingData({ firmName: o.firmName, branding: o.branding, couple: o.couple, authorities: ALL_AUTHORITIES })} />,
  sign: o => <SignScreen opts={o} />,
  release: o => <ReleaseScreen opts={o} />,
  intake: o => <PublicIntakePageView mode="sample" data={sampleIntakeData({ firmName: o.firmName, branding: o.branding })} />,
  signForm: o => <SignFormScreen opts={o} />,
};

/**
 * גוף הלשונית. ‼ נטען בעצלות (LinkedPagePreview): מסכי הלקוח מושכים את מנוע ה-PDF (חדר החתימה, טופס 6101) והוא כבד —
 * מי שפותח «צפייה» בלי ללחוץ על «המסך שנפתח» לא משלם עליו, וגם בדיקות היחידה של המגירה לא טוענות אותו.
 */
export default function LinkedScreenBody({ kind, opts }: { kind: LinkedKey; opts: LinkedRenderOpts }) {
  const render = LINKED_RENDERERS[kind];
  // ‼ מסך חדש בלי רנדרר — משפט כן ופער בדוח, לא חיקוי.
  if (!render) {
    return (
      <p className="rp-hint" data-testid="rp-linked-gap">
        המסך עצמו לא מוצג כאן עדיין — הוא עדיין נטען מהשרת באותו רכיב, ולכן אי אפשר לצייר אותו בדוגמה בלי לשלוח.
      </p>
    );
  }
  // מסגרת אחת לכל המסכים: אותה עטיפה בהירה וממותגת כמו בקישור האישי, וגובה סופי כדי שהמגירה לא תימתח.
  return (
    <div className="rp-linked-frame pivo-light">
      <LinkedScreenFrame style={{ height: 'min(72vh, 680px)' }}>{render(opts)}</LinkedScreenFrame>
    </div>
  );
}

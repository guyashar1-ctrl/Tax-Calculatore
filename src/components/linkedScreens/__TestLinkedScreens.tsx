// ─── מסך בדיקה: המסכים שהלקוח מגיע אליהם בקישור אישי, בתצוגה לדוגמה ─────────────
// DEV בלבד.   ?test-linked&screen=onboard|sign|release|intake|signform&couple=1
// אפשרויות:   &auth=incomeTax,vat,withholding,nationalInsurance  &phase=…  &step=1..4  &frame=1
// ‼ אין כאן שום חיבור למסד: כל המסכים מקבלים פעולות «לדוגמה» ולא נוגעים ברשת.

import { useEffect, useState, type ReactNode } from 'react';
import { OnboardingView } from '../OnboardingPage';
import type { OnboardingViewPhase } from '../OnboardingPage';
import { PublicSignView, type PublicSignViewPhase } from '../PublicSignPage';
import { PublicReleaseView } from '../PublicReleasePage';
import { PublicIntakePageView } from '../PublicIntakePage';
import { PublicSmartFormSignView } from '../../features/smartForms/PublicSmartFormSignPage';
import LinkedScreenFrame from './LinkedScreenFrame';
import { loadSampleForm2279Pdf, renderSampleBtl6101 } from './samplePdf';
import { sampleIntakeData, sampleOnboardingData, sampleReleaseData, sampleSignData, sampleSignFormInfo, type SampleAuthority, type SampleLinkedOpts } from './sample';

const AUTHORITIES: SampleAuthority[] = ['incomeTax', 'vat', 'withholding', 'nationalInsurance'];
// ‼ שם המשרד כאן הוא של הבדיקה בלבד; בצפייה אמיתית הוא מה שהשרת מחזיר.
const TEST_FIRM = 'משרד לדוגמה';

function SignScreen({ opts, phase }: { opts: SampleLinkedOpts; phase: PublicSignViewPhase | null }) {
  const [bytes, setBytes] = useState<ArrayBuffer | null>(null);
  useEffect(() => { void loadSampleForm2279Pdf().then(setBytes); }, []);
  if (!bytes) return <div style={{ padding: 40 }}>טוען טופס לדוגמה…</div>;
  return <PublicSignView mode="sample" data={sampleSignData({ ...opts, pdfBytes: bytes, ...(phase ? { phase } : {}) })} />;
}

function SignFormScreen({ role }: { role: 'client' | 'spouse' }) {
  const info = sampleSignFormInfo({ firmName: TEST_FIRM, role });
  const [bytes, setBytes] = useState<Uint8Array | null>(null);
  useEffect(() => { void renderSampleBtl6101(info).then(setBytes); // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [role]);
  return <PublicSmartFormSignView mode="sample" info={info} bytes={bytes} />;
}

export default function TestLinkedScreens() {
  const q = new URLSearchParams(window.location.search);
  const screen = q.get('screen') ?? 'onboard';
  const couple = q.get('couple') === '1';
  const authorities = (q.get('auth') ?? 'incomeTax').split(',').filter((a): a is SampleAuthority => (AUTHORITIES as string[]).includes(a));
  const opts: SampleLinkedOpts = { firmName: TEST_FIRM, couple, authorities };

  let node: ReactNode;
  if (screen === 'onboard') {
    const base = sampleOnboardingData(opts);
    // ?reg=spouse — מס הכנסה על שם בן/בת הזוג, כלומר להם יש הגשה משלהם בשע״ם.
    const data = q.get('reg') === 'spouse'
      ? { ...base, info: { ...base.info, prefill: { ...base.info.prefill, registeredSpouse: 'spouse' as const } } }
      : base;
    const phase = q.get('phase') as OnboardingViewPhase | null;
    const step = Number(q.get('step') ?? 0);
    node = <OnboardingView
      mode="sample"
      data={{ ...data, ...(phase ? { phase } : {}), ...(step >= 1 && step <= 4 ? { step } : {}) }}
    />;
  } else if (screen === 'sign') {
    node = <SignScreen opts={opts} phase={q.get('phase') as PublicSignViewPhase | null} />;
  } else if (screen === 'release') {
    // ‼ התוויות והמכתב כאן הם של הבדיקה בלבד; בצפייה אמיתית הם מה שהשרת מחזיר.
    node = <PublicReleaseView mode="sample" seenUploadIds={null} onReload={() => undefined} data={sampleReleaseData({
      firmName: TEST_FIRM,
      materials: [
        { key: 'm1', label: 'חומר לדוגמה א', priority: true },
        { key: 'm2', label: 'חומר לדוגמה ב' },
        { key: 'm3', label: 'חומר לדוגמה ג' },
      ],
      letterBody: 'שורה ראשונה של מכתב בדיקה.\n==שורה מודגשת==\nשורה אחרונה.',
      outstanding: [{ key: 'o1', label: 'עבודה פתוחה לדוגמה' }],
      objectionDueDate: '2026-12-01',
    })} />;
  } else if (screen === 'intake') {
    node = <PublicIntakePageView mode="sample" data={sampleIntakeData({ firmName: TEST_FIRM, phase: q.get('phase') === 'done' ? 'done' : 'intake' })} />;
  } else if (screen === 'signform') {
    node = <SignFormScreen role={q.get('role') === 'spouse' ? 'spouse' : 'client'} />;
  } else {
    node = <div style={{ padding: 40 }}>המסך «{screen}» עדיין לא מחובר לבדיקה.</div>;
  }

  if (q.get('frame') === '1') {
    return (
      <div style={{ padding: 24, background: '#d8d8d8', minHeight: '100vh' }}>
        <div style={{ width: 760, height: 640, margin: '0 auto', border: '2px solid #888' }}>
          <LinkedScreenFrame>{node}</LinkedScreenFrame>
        </div>
      </div>
    );
  }
  return <div className="pivo-light public-page-shell">{node}</div>;
}

// ─── בדיקות: המסכים שהלקוח מגיע אליהם בקישור אישי, בתצוגה לדוגמה (Stage E) ───────
// ‼ מה נעול כאן:
//   · קבצי הדוגמה (פעולות, נתונים, ההערה) אינם מזכירים לקוח מסד/fetch/פתיחת חלון/ניווט.
//   · כל פעולה לדוגמה מחזירה «הוצג בלבד» — ובפועל לא נוגעת ב-fetch/window.open.
//   · הדפים החיים (ברירת המחדל של כל קובץ) אינם יכולים להגיע ל-mode sample.
//   · בוני הנתונים מחזירים את הדמויות והיקף הרשויות שביקשו, בלי ניסוח של לקוח.
//   · רינדור סטטי של כל מסך במצב sample מציג את הדמויות, בלי הערת «לא נשלח» לפני שנלחץ משהו.

import { createElement } from 'react';
// ‼ גרסת הדפדפן של הרינדור הסטטי: גרסת node דורשת את `stream`, שאגד הבדיקות (ESM) אינו יכול לטעון.
// @ts-expect-error TS7016 — אין הצהרת טיפוסים ל-react-dom/server.browser
import { renderToStaticMarkup } from 'react-dom/server.browser';
import { test, assert, equal, deepEqual } from '../../../testkit/tinyTest';
import type { TestCase } from '../../../testkit/tinyTest';
import SAMPLE_RAW from '../sample.ts?raw';
import SAMPLE_NOTE_RAW from '../SampleNote.tsx?raw';
import SAMPLE_ACTIONS_RAW from '../sampleActions.ts?raw';
import SAMPLE_ONBOARDING_RAW from '../sampleOnboardingActions.ts?raw';
import SAMPLE_SIGN_RAW from '../sampleSignActions.ts?raw';
import SAMPLE_RELEASE_RAW from '../sampleReleaseActions.ts?raw';
import SAMPLE_INTAKE_RAW from '../sampleIntakeActions.ts?raw';
import SAMPLE_SIGNFORM_RAW from '../sampleSignFormActions.ts?raw';
import SAMPLE_PDF_RAW from '../samplePdf.ts?raw';
import ONBOARDING_RAW from '../../OnboardingPage.tsx?raw';
import SIGN_RAW from '../../PublicSignPage.tsx?raw';
import RELEASE_RAW from '../../PublicReleasePage.tsx?raw';
import INTAKE_PAGE_RAW from '../../PublicIntakePage.tsx?raw';
import INTAKE_RAW from '../../PublicIntake.tsx?raw';
import SIGNFORM_RAW from '../../../features/smartForms/PublicSmartFormSignPage.tsx?raw';
import APP_RAW from '../../../App.tsx?raw';
import { OnboardingView } from '../../OnboardingPage';
import { PublicReleaseView } from '../../PublicReleasePage';
import { PublicIntakePageView } from '../../PublicIntakePage';
import { sampleOnboardingActions } from '../sampleOnboardingActions';
import { samplePublicSignActions } from '../sampleSignActions';
import { samplePublicReleaseActions } from '../sampleReleaseActions';
import { samplePublicIntakeActions, samplePublicIntakePageActions } from '../sampleIntakeActions';
import { samplePublicSmartFormSignActions } from '../sampleSignFormActions';
import {
  SAMPLE_PEOPLE, SAMPLE_SIMULATED_TEXT, sampleIntakeData, sampleOnboardingData, sampleReleaseData,
  sampleSignData, sampleSignFormInfo,
} from '../sample';

const n = (s: string) => s.replace(/\r\n/g, '\n');

/** ‼ כל מה שמדבר עם השרת או עם הדפדפן מחוץ לדף — אסור בקוד של הדוגמה. */
const FORBIDDEN = /supabase|SUPABASE_URL|fetch\(|window\.open|window\.location|XMLHttpRequest|sendBeacon|\.rpc\(|functions\.invoke|flushAccountantNotifications/;

/** מריץ עם fetch ו-window.open שזורקים אם נקראים, ומחזיר מה נקרא. */
async function withTrappedNetwork(run: () => Promise<void>): Promise<string[]> {
  const g = globalThis as Record<string, unknown>;
  const calls: string[] = [];
  const realFetch = g.fetch;
  const hadWindow = 'window' in g;
  const realWindow = g.window;
  g.fetch = () => { calls.push('fetch'); throw new Error('fetch אסור בדוגמה'); };
  g.window = {
    open: () => { calls.push('window.open'); throw new Error('window.open אסור בדוגמה'); },
    location: { origin: 'http://localhost', assign: () => { calls.push('location.assign'); throw new Error('ניווט אסור בדוגמה'); } },
  };
  try { await run(); } finally {
    g.fetch = realFetch;
    if (hadWindow) g.window = realWindow; else delete g.window;
  }
  return calls;
}

function render(node: Parameters<typeof renderToStaticMarkup>[0]): string {
  const g = globalThis as Record<string, unknown>;
  const hadWindow = 'window' in g;
  const realWindow = g.window;
  g.window = { location: { origin: 'http://localhost' } };
  try { return renderToStaticMarkup(node); } finally {
    if (hadWindow) g.window = realWindow; else delete g.window;
  }
}

/** גוף ברירת המחדל המיוצאת של קובץ — עד ה-} שבתחילת שורה. */
function defaultExportBody(src: string): string {
  const s = n(src);
  const start = s.indexOf('export default function');
  assert(start >= 0, 'לא נמצאה ברירת מחדל מיוצאת');
  const end = s.indexOf('\n}\n', start);
  assert(end > start, 'לא נמצא סוף לברירת המחדל');
  return s.slice(start, end + 2);
}

const OPTS = { firmName: 'משרד בדיקה', couple: true, authorities: ['incomeTax', 'vat', 'nationalInsurance'] as ('incomeTax' | 'vat' | 'nationalInsurance')[] };

export const TESTS: TestCase[] = [
  test('קבצי הדוגמה אינם מזכירים לקוח מסד, fetch, פתיחת חלון או ניווט', () => {
    const files: Record<string, string> = {
      'sample.ts': SAMPLE_RAW, 'SampleNote.tsx': SAMPLE_NOTE_RAW, 'sampleActions.ts': SAMPLE_ACTIONS_RAW,
      'sampleOnboardingActions.ts': SAMPLE_ONBOARDING_RAW, 'sampleSignActions.ts': SAMPLE_SIGN_RAW,
      'sampleReleaseActions.ts': SAMPLE_RELEASE_RAW, 'sampleIntakeActions.ts': SAMPLE_INTAKE_RAW,
      'sampleSignFormActions.ts': SAMPLE_SIGNFORM_RAW,
    };
    for (const [name, raw] of Object.entries(files)) {
      // ההערות מותרות לדבר על האיסור עצמו; הקוד — לא.
      const code = n(raw).split('\n').filter(l => !/^\s*(\/\/|\*|\/\*)/.test(l)).join('\n');
      assert(!FORBIDDEN.test(code), `${name}: ${code.match(FORBIDDEN)?.[0]}`);
    }
  }),

  test('samplePdf.ts: הקריאה היחידה היא קובץ טופס שנשלח עם האתר — לא מסד', () => {
    const code = n(SAMPLE_PDF_RAW).split('\n').filter(l => !/^\s*(\/\/|\*|\/\*)/.test(l)).join('\n');
    assert(!/supabase|\.rpc\(|functions\.invoke|window\.open/.test(code), 'אין מסד/פתיחת חלון');
    const fetches = [...code.matchAll(/fetch\('([^']+)'\)/g)].map(m => m[1]);
    deepEqual(fetches, ['/templates/poa_2279a5.pdf'], 'ה-fetch היחיד הוא הטופס הריק');
  }),

  test('הדפים החיים: ברירת המחדל של כל קובץ אינה מגיעה ל-sample ואינה מקבלת mode', () => {
    for (const [name, raw] of Object.entries({
      OnboardingPage: ONBOARDING_RAW, PublicSignPage: SIGN_RAW, PublicReleasePage: RELEASE_RAW,
      PublicIntakePage: INTAKE_PAGE_RAW, PublicIntake: INTAKE_RAW, PublicSmartFormSignPage: SIGNFORM_RAW,
    })) {
      const body = defaultExportBody(raw);
      assert(!/sample/i.test(body), `${name}: ברירת המחדל אינה מזכירה sample`);
      assert(!/\bmode=/.test(body), `${name}: ברירת המחדל אינה מעבירה mode`);
    }
  }),

  test('App.tsx: מסלולי הקישורים החיים מעבירים רק token — אין sample', () => {
    const app = n(APP_RAW);
    for (const re of [
      /<OnboardingPage token=\{onboardToken\} \/>/, /<PublicSignPage token=\{signToken\} \/>/,
      /<PublicSmartFormSignPage token=\{signFormToken\} \/>/, /<PublicIntakePage token=\{intakeToken\} \/>/,
      /<PublicReleasePage token=\{releaseToken\} \/>/,
    ]) assert(re.test(app), `חסר מסלול חי: ${re}`);
    assert(!/mode="sample"/.test(app), 'ב-App.tsx אין הפעלה של sample');
    assert(/has\('test-linked'\)/.test(app) && /import\.meta\.env\.DEV[^\n]*has\('test-linked'\)/.test(app), 'מסך הבדיקה ?test-linked הוא DEV בלבד');
  }),

  test('כל פעולה לדוגמה מחזירה «הוצג בלבד» — בלי fetch ובלי פתיחת חלון', async () => {
    const file = new File(['x'], 'id.png');
    const calls = await withTrappedNetwork(async () => {
      const all: [string, Promise<{ status: string }>][] = [
        ['onboarding.saveStep', sampleOnboardingActions.saveStep(1, {})],
        ['onboarding.submit', sampleOnboardingActions.submit({})],
        ['onboarding.submitSignature', sampleOnboardingActions.submitSignature('x')],
        ['onboarding.makeSpouseLink', sampleOnboardingActions.makeSpouseLink()],
        ['onboarding.uploadIdDoc', sampleOnboardingActions.uploadIdDoc({ person: 'client', personName: 'x', kind: 'idCard', prompt: 'x' }, file)],
        ['sign.submit', samplePublicSignActions.submit({})],
        ['sign.handoff', samplePublicSignActions.spouse.handoff()],
        ['sign.invite', samplePublicSignActions.spouse.invite('a@b.co')],
        ['release.setItem', samplePublicReleaseActions.setItem('k', true)],
        ['release.sendNote', samplePublicReleaseActions.sendNote('x', null)],
        ['release.removeUpload', samplePublicReleaseActions.removeUpload('x')],
        ['release.markItems', samplePublicReleaseActions.markItems(['k'])],
        ['release.uploadFile', samplePublicReleaseActions.uploadFile('s', file)],
        ['intake.saveAnswer', samplePublicIntakeActions.saveAnswer({ sessionId: 's', questionId: 'q', answer: true, model: sampleIntakeData({ firmName: 'x' }).initial!.model, currentQuestionId: null, done: false })],
        ['intake.reopen', samplePublicIntakePageActions.reopen()],
        ['signform.submit', samplePublicSmartFormSignActions.submit('x', 'sha', true)],
      ];
      for (const [name, p] of all) equal((await p).status, 'simulated', name);
      samplePublicSignActions.restart();
      samplePublicSignActions.navigate('http://x');
      samplePublicReleaseActions.flush();
    });
    deepEqual(calls, [], 'שום fetch/window.open/ניווט');
  }),

  test('המשפט «לא נשמר ולא נשלח דבר» זהה לזה של הדף האישי', () => {
    equal(SAMPLE_SIMULATED_TEXT, 'בתצוגה לדוגמה — כאן הלקוח היה שולח. לא נשמר ולא נשלח דבר.');
  }),

  test('sampleOnboardingData: הדמויות, ההיקף, ושלב הפתיחה', () => {
    const single = sampleOnboardingData({ firmName: 'משרד בדיקה' });
    equal(single.phase, 'form'); equal(single.step, 1); equal(single.resumed, false);
    equal(single.info.clientName, SAMPLE_PEOPLE.clientFull);
    equal(single.info.firmName, 'משרד בדיקה');
    equal(single.values.familyStatus, '');
    deepEqual(Object.keys(single.info.scope ?? {}), ['incomeTax']);

    const couple = sampleOnboardingData(OPTS);
    equal(couple.values.familyStatus, 'married');
    equal(couple.values.spouseFirstName, SAMPLE_PEOPLE.spouseFirst);
    equal(couple.info.niIncluded, true);
    deepEqual(couple.info.authorities, ['incomeTax', 'vat']);
    deepEqual(couple.info.scope?.nationalInsurance?.targets, ['client', 'spouse']);
    deepEqual(couple.info.scope?.vat?.targets, ['client']);
    // ‼ מה שהלקוח מקליד נשאר ריק — בדוגמה לא ממלאים בשמו.
    equal(couple.values.idNumber, ''); equal(couple.values.phone, ''); equal(couple.values.city, '');
  }),

  test('sampleSignData: מקומות החתימה לפי זוג/יחיד, והאסמכתא של ב"ל', () => {
    const bytes = new ArrayBuffer(8);
    const single = sampleSignData({ firmName: 'x', pdfBytes: bytes });
    deepEqual(single.session.fields.filter(f => f.kind === 'signature').map(f => f.signerId), ['client']);
    equal(single.session.ni, null); equal(single.phase, 'sign');
    const couple = sampleSignData({ ...OPTS, pdfBytes: bytes });
    deepEqual(couple.session.fields.filter(f => f.kind === 'signature').map(f => f.signerId).sort(), ['client', 'spouse']);
    equal(couple.session.ni?.referenceNumber, SAMPLE_PEOPLE.reference);
    equal(couple.session.signerName, SAMPLE_PEOPLE.clientFull);
    // מע"מ בלבד אצל זוג — טופס של אדם אחד.
    const vatOnly = sampleSignData({ firmName: 'x', couple: true, authorities: ['vat'], pdfBytes: bytes });
    deepEqual(vatOnly.session.fields.filter(f => f.kind === 'signature').map(f => f.signerId), ['client']);
  }),

  test('sampleReleaseData: הרו"ח הקודם הוא צד חיצוני עם דוגמה — הניסוח נכנס מבחוץ', () => {
    const d = sampleReleaseData({ firmName: 'x', materials: [{ key: 'a', label: 'תווית מהשרת', priority: true }], letterBody: 'מכתב מהשרת' });
    equal(d.prevAccountantName, SAMPLE_PEOPLE.previousAccountant);
    equal(d.businessName, SAMPLE_PEOPLE.business);
    equal(d.materials[0].label, 'תווית מהשרת');
    equal(d.body, 'מכתב מהשרת');
    equal(d.uploads?.length, 0); equal(d.signed, false); equal(d.materialsTotal, 1);
  }),

  test('sampleIntakeData / sampleSignFormInfo: שאלה ראשונה, וטביעת הטופס שבקוד', () => {
    const q = sampleIntakeData({ firmName: 'x' });
    equal(q.initial?.currentQuestionId, 'year_map'); equal(q.phase, 'intake'); equal(q.initial?.model.meta?.flow, 'onboarding');
    equal(sampleIntakeData({ firmName: 'x', phase: 'done' }).phase, 'done');
    const s = sampleSignFormInfo({ firmName: 'x' });
    equal(s.ok, true); equal(s.role, 'client'); equal(s.signerName, SAMPLE_PEOPLE.clientFull);
    equal(sampleSignFormInfo({ firmName: 'x', role: 'spouse' }).signerName, SAMPLE_PEOPLE.spouseFull);
    assert(!!s.templateSha256 && s.templateSha256.length === 64, 'טביעת הטופס');
  }),

  test('רינדור סטטי במצב sample: הדמויות מופיעות, וההערה «לא נשלח» לא מופיעה לפני לחיצה', () => {
    const onboarding = render(createElement(OnboardingView, { mode: 'sample', data: sampleOnboardingData(OPTS) }));
    assert(onboarding.includes('שלב 1 מתוך 4') && onboarding.includes('ישראל') && onboarding.includes('משרד בדיקה'), 'קליטה');
    const release = render(createElement(PublicReleaseView, {
      mode: 'sample', seenUploadIds: null, onReload: () => undefined,
      data: sampleReleaseData({ firmName: 'משרד בדיקה', materials: [{ key: 'a', label: 'תווית בדיקה' }] }),
    }));
    assert(release.includes('העברת חומרים - ישראל ישראלי') && release.includes('תווית בדיקה'), 'רו"ח קודם');
    const intake = render(createElement(PublicIntakePageView, { mode: 'sample', data: sampleIntakeData({ firmName: 'משרד בדיקה' }) }));
    assert(intake.includes('שאלון היכרות') && intake.includes('עוד צעד אחד, ישראל'), 'שאלון');
    for (const [name, html] of Object.entries({ onboarding, release, intake })) {
      assert(!html.includes(SAMPLE_SIMULATED_TEXT), `${name}: ההערה לא מופיעה לפני שנלחץ משהו`);
    }
  }),
];

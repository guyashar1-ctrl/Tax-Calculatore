// משימות המשך אחרי אישור הערכה — המלצה, לא ביצוע.
import { test, equal, assert } from '../../../testkit/tinyTest';
import type { TestCase } from '../../../testkit/tinyTest';
import type { Client } from '../../../types';
import { computeEstimate } from '../engine';
import { followUpsFor } from '../followUps';
import { DEMO_ESTIMATE_DRAFT } from '../__demoEstimate';
import { SAMPLE_CLIENTS } from '../../../data/sampleClients';

const orit = SAMPLE_CLIENTS.find(c => c.id === 'sample-4') as unknown as Client;

export const TESTS: TestCase[] = [
  test('הדגמה (אורית): בלי חוסמים; משימה להקטין את מקדמת מ״ה 12% ← 8% ולהגדיל ב״ל, ואחריהן קריאה חוזרת ברשות', () => {
    const o = computeEstimate(DEMO_ESTIMATE_DRAFT, { client: orit, taxYear: 2026 });
    equal(o.blockers.map(b => b.text).join(' | '), '');
    const fu = followUpsFor(o, { clientName: 'אורית שפירא', spouseName: 'עמית', version: 1 });
    const it = fu.find(f => f.key === 'adv-it-client');
    assert(!!it && it.title.includes('ל-8%') && it.title.includes('היום 12%') && it.why.includes('190(א)(2)'), JSON.stringify(fu.map(f => f.title)));
    assert(fu.some(f => f.key === 'adv-ni-client' && f.why.includes('672')), 'ב״ל — טופס 672');
    const reread = fu.findIndex(f => f.key === 'reread');
    assert(reread > fu.findIndex(f => f.key === 'adv-it-client'), 'קריאה חוזרת אחרי העדכון');
    assert(fu.every(f => f.title.includes('הערכת מס 2026 גרסה 1')), 'כל משימה מפנה לגרסה');
    assert(!fu.some(f => /בוצע|עודכן ברשות/.test(f.title)), 'לא טוענת ביצוע');
  }),
  test('בלי שינוי מקדמה ובלי השלמה — אין משימת «קריאה חוזרת»', () => {
    const o = computeEstimate({ ...DEMO_ESTIMATE_DRAFT, it: { ...DEMO_ESTIMATE_DRAFT.it, ratePct: 8 } }, { client: orit, taxYear: 2026 });
    const fu = followUpsFor({ ...o, advances: o.advances.filter(a => a.authority === 'it') }, { clientName: 'א', version: 2 });
    assert(!fu.some(f => f.key === 'reread'), JSON.stringify(fu.map(f => f.key)));
  }),
];

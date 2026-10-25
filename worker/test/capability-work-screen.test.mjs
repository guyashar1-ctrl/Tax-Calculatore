// capability-work-screen.test.mjs — שחזור שכבה כשחלון שע״ם עומד על מסך של הרו"ח (25.10.2026).
// בלי בקשה מפורשת (warm-up ברקע) — לא נוגעים במסך שלו, אבל אומרים למה (work_screen) במקום
// «unknown». page מדומה על מסך Citrix (isOnWorkScreen=true) — בלי Chrome אמיתי.
//
//   node --test test/capability-work-screen.test.mjs

import test from 'node:test';
import assert from 'node:assert/strict';
import { runCapabilities } from '../src/warmupManager.mjs';

const workScreenPage = { url: () => 'https://shaam-mf-emulator.taxes.gov.il/some/screen' };
const ctx = () => ({ job: { id: 'job-1', progress: {}, revision: 0 }, workerId: 'w', log: () => {} });

test('בלי takeover: מסך של הרו"ח ⇒ לא נוגעים, והסיבה נרשמת כ-work_screen', async () => {
  const { progress } = await runCapabilities(ctx(), workScreenPage, ['representation']);
  assert.equal(progress.capabilities.representation.state, 'unavailable');
  assert.equal(progress.capabilities.representation.reasonCode, 'work_screen');
});

test('שכבה שכבר נבדקה באותה משימה לא נדרסת ב-work_screen', async () => {
  const c = ctx();
  c.job.progress = { capabilities: { representation: { state: 'deferred' } } };
  const { progress } = await runCapabilities(c, workScreenPage, ['representation']);
  assert.equal(progress.capabilities.representation.state, 'deferred');
});

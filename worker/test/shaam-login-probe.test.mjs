import test from 'node:test';
import assert from 'node:assert/strict';
import { probeServerSession } from '../src/browserSession.mjs';

// The probe's request lands on /taxes-login/login/otpCts without a session and
// restarts SHAAM's one-time-code sequence under the accountant's hands.
function windowWith(urls, onFetch) {
  const pages = urls.map((url) => ({
    url: () => url,
    context: () => ({ pages: () => pages }),
    evaluate: async () => {
      onFetch();
      return { status: 200, finalUrl: 'https://shaam.taxes.gov.il/myz/pages/homepage.aspx', len: 94000, hasLogout: true };
    },
  }));
  return pages;
}

for (const loginUrl of [
  'https://shaam.taxes.gov.il/taxes-login/login/otp?x=1',
  'https://shaam.taxes.gov.il/taxes-login/login/otpCts',
  'https://shaam.taxes.gov.il/dbusbyip1/loginDetails.aspx',
]) {
  test(`no server request while the window is mid-login: ${new URL(loginUrl).pathname}`, async () => {
    let fetches = 0;
    const [page] = windowWith([loginUrl], () => { fetches++; });
    const r = await probeServerSession(page);
    assert.equal(fetches, 0);
    assert.equal(r.skipped, true);
    assert.equal(r.ok, false, 'not a measurement — callers must not treat it as "session expired"');
  });
}

test('a login screen in another tab of the same window also holds the probe', async () => {
  let fetches = 0;
  const [page] = windowWith([
    'https://shaam.taxes.gov.il/gmf-main-menu/main/home',
    'https://shaam.taxes.gov.il/taxes-login/login/otp',
  ], () => { fetches++; });
  assert.equal((await probeServerSession(page)).skipped, true);
  assert.equal(fetches, 0);
});

test('outside the login screens the probe still asks the server', async () => {
  let fetches = 0;
  const [page] = windowWith(['https://shaam.taxes.gov.il/myz/pages/homepage.aspx'], () => { fetches++; });
  const r = await probeServerSession(page);
  assert.equal(fetches, 1);
  assert.equal(r.ok, true);
  assert.equal(r.authenticated, true);
});

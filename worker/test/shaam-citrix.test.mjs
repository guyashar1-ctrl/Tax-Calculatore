import test from 'node:test';
import assert from 'node:assert/strict';
import { isShaamCitrixUrl, detectShaam, classifyShaamAuth, focusShaamWindow, isOnWorkScreen } from '../src/browserSession.mjs';

test('Citrix exact HTTPS origin only', () => {
  assert.equal(isShaamCitrixUrl('https://shaam-mf-emulator.taxes.gov.il/Citrix/CTSWeb/'), true);
  for (const url of ['http://shaam-mf-emulator.taxes.gov.il/', 'https://shaam-mf-emulator.taxes.gov.il.evil.example/', 'https://evil.example/shaam-mf-emulator.taxes.gov.il', 'about:blank']) {
    assert.equal(isShaamCitrixUrl(url), false);
  }
});

test('monitor and focus preserve manual Citrix work without declaring portal authenticated', async () => {
  let focused = 0;
  const page = {
    url: () => 'https://shaam-mf-emulator.taxes.gov.il/Citrix/CTSWeb/',
    title: async () => 'HomePage', // Title alone must not authenticate another origin.
    bringToFront: async () => { focused++; },
    goto: async () => assert.fail('must not navigate the Citrix tab'),
    evaluate: async () => assert.fail('must not inspect or change Citrix DOM'),
  };
  assert.equal((await detectShaam(page)).detail, 'citrix_manual_work');
  assert.equal((await classifyShaamAuth(page)).authenticated, false);
  assert.equal(await isOnWorkScreen(page), true);
  await focusShaamWindow(page);
  assert.equal(focused, 1);
});

test('ordinary blank window still navigates to SHAAM on explicit focus', async () => {
  let destination;
  await focusShaamWindow({url: () => 'about:blank', bringToFront: async () => {}, goto: async url => { destination = url; }});
  assert.equal(destination, 'https://shaam.taxes.gov.il/');
});

test('focus emulation: restored for SHAAM tabs (clicks hang in a background window without it), never sent to the Citrix tab', async () => {
  const { enableFocusEmulation } = await import('../src/browserSession.mjs');
  const sent = [];
  const fakePage = (url) => ({
    url: () => url,
    context: () => ({ newCDPSession: async () => ({ send: async (method, params) => { sent.push([url, method, params]); } }) }),
  });
  assert.equal(await enableFocusEmulation(fakePage('https://shaam.taxes.gov.il/srmyzgipuykoach/#/process')), true);
  assert.equal(await enableFocusEmulation(fakePage('https://shaam-mf-emulator.taxes.gov.il/Citrix/CTSWeb/')), false);
  assert.deepEqual(sent, [['https://shaam.taxes.gov.il/srmyzgipuykoach/#/process', 'Emulation.setFocusEmulationEnabled', { enabled: true }]]);
  const broken = { url: () => 'about:blank', context: () => ({ newCDPSession: async () => { throw new Error('target closed'); } }) };
  assert.equal(await enableFocusEmulation(broken), false, 'a closed tab does not fail the attach');
});

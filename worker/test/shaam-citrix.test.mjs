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

// Manual, standalone test of browserSession.mjs — NOT part of the shipped
// worker pipeline. Run directly: node test/manual-detect-shaam.mjs
import { ensureBrowser, detectShaam, classifyShaamAuth } from '../src/browserSession.mjs';

console.log('ensureBrowser()...');
const { page } = await ensureBrowser();
console.log('✓ browser context ready');

console.log('\ndetectShaam()...');
console.log(JSON.stringify(await detectShaam(page), null, 2));

console.log('\nclassifyShaamAuth()...');
console.log(JSON.stringify(await classifyShaamAuth(page), null, 2));

console.log('\n(browser left open for inspection)');

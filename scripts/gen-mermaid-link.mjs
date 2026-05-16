// Generate a Mermaid Live Editor URL from the diagram in decision_tree.md.
// Outputs the pako-compressed URL form, which is what mermaid.live now uses.

import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { deflateRawSync } from 'node:zlib';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');
const md = readFileSync(resolve(root, 'decision_tree.md'), 'utf8');

// Extract first ```mermaid ... ``` block
const m = md.match(/```mermaid\n([\s\S]*?)\n```/);
if (!m) {
  console.error('No mermaid block found');
  process.exit(1);
}
const code = m[1];

const state = {
  code,
  mermaid: '{\n  "theme": "default"\n}',
  autoSync: true,
  rough: false,
  updateDiagram: true,
  panZoom: true,
  pan: { x: 0, y: 0 },
  zoom: 1,
  editorMode: 'code',
};

const json = JSON.stringify(state);
const compressed = deflateRawSync(Buffer.from(json, 'utf8'), { level: 9 });
const b64 = compressed.toString('base64')
  .replace(/\+/g, '-')
  .replace(/\//g, '_')
  .replace(/=+$/, '');

console.log('=== Mermaid Live Editor URL (pako form) ===');
console.log(`https://mermaid.live/edit#pako:${b64}`);
console.log('');
console.log('=== Mermaid Live View URL (read-only) ===');
console.log(`https://mermaid.live/view#pako:${b64}`);
console.log('');
console.log(`(URL length: ${b64.length + 32} chars)`);

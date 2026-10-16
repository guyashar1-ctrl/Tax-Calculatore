// בונה את index.html עם הצילומים בפנים (data:) — כך הקובץ נפתח לבד, גם בחלונית.
//   node docs/release-guides/2026-10-16-family-status-year/src/build.mjs
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
const here = dirname(fileURLToPath(import.meta.url));
const html = readFileSync(join(here, 'template.html'), 'utf8')
  .replace(/\{\{([\w-]+)\}\}/g, (_, n) => `data:image/png;base64,${readFileSync(join(here, `${n}.png`)).toString('base64')}`);
writeFileSync(join(here, '..', 'index.html'), html);
console.log('index.html', html.length);

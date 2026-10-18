// הצד של הקוד ל-253: רשימת הפריטים (מפתח ← סוג) והרשימות הסגורות (רשימה ← מזהה ← שם) — מקור אחד לשרת.
//   npx esbuild scripts/sql/253/items.ts --bundle --platform=node --alias:@src=./src --outfile=<tmp>/items253.cjs && node <tmp>/items253.cjs > <tmp>/items253.json
import { ITEMS } from '@src/features/taxYear/catalog';
import { institutionMap } from '@src/data/institutions';
console.log(JSON.stringify({ items: Object.fromEntries(ITEMS.map(i => [i.key, i.kind])), institutions: institutionMap() }));

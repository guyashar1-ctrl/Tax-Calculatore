import { ITEMS } from '@src/features/taxYear/catalog';
console.log(JSON.stringify(Object.fromEntries(ITEMS.map(i => [i.key, i.kind]))));

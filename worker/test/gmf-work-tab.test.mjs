// ─── לשונית העבודה של מס הכנסה — לא נוגעים בלשונית שהרו"ח עובד בה ──────────────
// ‼ 25.10.2026: קריאת מס הכנסה ניווטה את הלשונית הראשונה (דוח 413 של גיא) למסך הכניסה.
import test from 'node:test';
import assert from 'node:assert/strict';
import { gmfWorkTab } from '../src/browserSession.mjs';

const ORIGIN = 'https://shaam.taxes.gov.il';
function fakePage(path, name = '') {
  const p = {
    path, name, gotos: [],
    url: () => (p.path ? ORIGIN + p.path : 'about:blank'),
    evaluate: async (fn, arg) => {
      if (!fn.toString().includes('window.name')) return undefined;
      if (arg !== undefined) { p.name = arg; return undefined; }
      if (fn.toString().includes("= ''")) { p.name = ''; return undefined; }
      return p.name;
    },
    goto: async (u) => { p.gotos.push(u); p.path = new URL(u).pathname; },
  };
  return p;
}
function fakeContext(pages) {
  return { pages: () => pages, newPage: async () => { const p = fakePage(''); pages.push(p); return p; } };
}

test('מסך עבודה של הרו"ח (413) ⇒ לשונית חדשה; הלשונית שלו לא זזה ולא מסומנת', async () => {
  const mine = fakePage('/gmf-413/main/TafritHafaka/1');
  const pages = [mine];
  const tab = await gmfWorkTab(fakeContext(pages));
  assert.notEqual(tab, mine);
  assert.equal(pages.length, 2);
  assert.deepEqual(mine.gotos, []);
  assert.equal(mine.name, '');
});

test('לשונית על התפריט/כניסת GMF ⇒ מאומצת (הסיסמה השנייה בלשונית אחת), בלי לשונית חדשה', async () => {
  const user = fakePage('/gmf-413/main/home');
  const menu = fakePage('/gmf-main-menu/login');
  const pages = [user, menu];
  const tab = await gmfWorkTab(fakeContext(pages));
  assert.equal(tab, menu);
  assert.equal(pages.length, 2);
});

test('הלשונית המסומנת — גם על 181 או 154 — היא לשונית העבודה', async () => {
  const work = fakePage('/gmf-181/main/main181', 'pivo-gmf-work');
  const pages = [fakePage('/gmf-main-menu/main/home'), work];
  assert.equal(await gmfWorkTab(fakeContext(pages)), work);
});

test('הרו"ח העביר את לשונית העבודה למסך שלו ⇒ מוותרים עליה ולא מזיזים אותה', async () => {
  const taken = fakePage('/gmf-413/main/home', 'pivo-gmf-work');
  const pages = [taken];
  const tab = await gmfWorkTab(fakeContext(pages));
  assert.notEqual(tab, taken);
  assert.equal(taken.name, '');
  assert.deepEqual(taken.gotos, []);
});

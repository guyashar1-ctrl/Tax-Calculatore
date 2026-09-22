// test-ready-to-send-race.ts — «שלח בקשות» לא מציג לקוח אחר אחרי מעבר בלי רענון.
// הרצה: node scripts/test-ready-to-send-race.ts   (Node ≥ 22.6, בלי בנייה)
//
// ‼ מכסה את הרגרסיה מ-22.09.2026 בייצור: מעבר גיא → יאיר השאיר במגש את
// שלוש הבקשות של גיא ואת קבוצת דין תחת השם של יאיר, כי תשובה מאוחרת של
// הלקוח הקודם דרסה את תשובת הלקוח החדש. ראה src/hooks/readyToSendLoader.ts.

import assert from 'node:assert/strict';
import { createReadyToSendLoader, EMPTY_READY, readyRecipientCount, type ReadyRpcResult } from '../src/hooks/readyToSendLoader.ts';

type Deferred = { resolve: (r: ReadyRpcResult) => void; promise: Promise<ReadyRpcResult> };
const deferred = (): Deferred => {
  let resolve!: (r: ReadyRpcResult) => void;
  const promise = new Promise<ReadyRpcResult>(r => { resolve = r; });
  return { resolve, promise };
};
const okFor = (tag: string): ReadyRpcResult => ({
  data: { ok: true, owner: { email: `${tag}@example.com`, lastSentAt: null, items: [{ stepId: `${tag}-s1`, stepType: 'client_documents', publishedAt: '2026-09-04T09:07:52Z' }] },
    persons: [{ role: 'spouse', name: `${tag}-spouse`, email: `${tag}-spouse@example.com`, stepId: `${tag}-ni`, requestId: `${tag}-req`, referenceNumber: '1' }] },
  error: null,
});
const tick = () => new Promise(r => setTimeout(r, 0));

async function main() {
  // ── 1 · מעבר לקוח מאפס מיד ─────────────────────────────────────────────
  {
    const pending = new Map<string, Deferred[]>();
    const rpc = (cid: string) => { const d = deferred(); pending.set(cid, [...(pending.get(cid) ?? []), d]); return d.promise; };
    const states: string[] = [];
    const L = createReadyToSendLoader(rpc, s => states.push(`${s.clientId}:${readyRecipientCount(s.ready)}:${s.loading ? 'L' : '-'}`));
    L.setClient('A'); const pA = L.load();
    pending.get('A')![0].resolve(okFor('A')); await pA;
    assert.equal(readyRecipientCount(L.state.ready), 2, 'A loaded');
    L.setClient('B');
    assert.deepEqual(L.state.ready, EMPTY_READY, 'switching to B clears A immediately');
    assert.equal(L.state.loading, true, 'B shows loading, not A\'s data');
    assert.equal(L.state.error, null);
  }

  // ── 2 · המרוץ: תשובה מאוחרת של א' לא דורסת את ב' ────────────────────────
  {
    const pending = new Map<string, Deferred[]>();
    const rpc = (cid: string) => { const d = deferred(); pending.set(cid, [...(pending.get(cid) ?? []), d]); return d.promise; };
    const L = createReadyToSendLoader(rpc, () => {});
    L.setClient('A'); const pA = L.load();          // A's request is in flight…
    L.setClient('B'); const pB = L.load();          // …user switches to B
    pending.get('B')![0].resolve(okFor('B')); await pB;
    assert.equal(L.state.ready.owner.email, 'B@example.com', 'B loaded');
    pending.get('A')![0].resolve(okFor('A')); await pA; await tick();   // A's slow answer arrives late
    assert.equal(L.state.clientId, 'B');
    assert.equal(L.state.ready.owner.email, 'B@example.com', 'late A response must not overwrite B');
    assert.equal(L.state.ready.persons[0]?.name, 'B-spouse');
    assert.equal(L.state.loading, false);
  }

  // ── 3 · A → B → A: הרענון של א' מביא את א' מחדש, לא שארית ─────────────
  {
    const pending = new Map<string, Deferred[]>();
    const rpc = (cid: string) => { const d = deferred(); pending.set(cid, [...(pending.get(cid) ?? []), d]); return d.promise; };
    const L = createReadyToSendLoader(rpc, () => {});
    L.setClient('A'); let p = L.load(); pending.get('A')![0].resolve(okFor('A')); await p;
    L.setClient('B'); p = L.load(); pending.get('B')![0].resolve(okFor('B')); await p;
    L.setClient('A');
    assert.deepEqual(L.state.ready, EMPTY_READY, 'back to A starts empty');
    p = L.load(); pending.get('A')![1].resolve(okFor('A')); await p;
    assert.equal(L.state.ready.owner.email, 'A@example.com');
  }

  // ── 4 · שגיאה של א' לא מדליפה ל-ב' ─────────────────────────────────────
  {
    const pending = new Map<string, Deferred[]>();
    const rpc = (cid: string) => { const d = deferred(); pending.set(cid, [...(pending.get(cid) ?? []), d]); return d.promise; };
    const L = createReadyToSendLoader(rpc, () => {});
    L.setClient('A'); const pA = L.load();
    L.setClient('B'); const pB = L.load();
    pending.get('A')![0].resolve({ data: null, error: { message: 'boom' } }); await pA; await tick();
    assert.equal(L.state.error, null, 'A\'s error must not show on B');
    pending.get('B')![0].resolve(okFor('B')); await pB;
    assert.equal(L.state.error, null);
    assert.equal(L.state.ready.owner.email, 'B@example.com');
  }

  // ── 5 · רענון כפול של אותו לקוח: רק התשובה האחרונה נשמרת ────────────────
  {
    const pending = new Map<string, Deferred[]>();
    const rpc = (cid: string) => { const d = deferred(); pending.set(cid, [...(pending.get(cid) ?? []), d]); return d.promise; };
    const L = createReadyToSendLoader(rpc, () => {});
    L.setClient('A'); const p1 = L.load(); const p2 = L.load();
    const stale = okFor('A'); stale.data!.persons = [];
    pending.get('A')![1].resolve(okFor('A')); await p2;
    pending.get('A')![0].resolve(stale); await p1; await tick();
    assert.equal(L.state.ready.persons.length, 1, 'older response of the same client is ignored');
  }

  console.log('ready-to-send race: 5 scenarios OK');
}

main().catch(e => { console.error(e); process.exit(1); });

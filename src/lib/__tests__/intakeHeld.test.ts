// ─── «הבקשות מוחזקות עד אישור ההצעה» בדפדפן — התאום של requests_held_until_approval ──
// ‼ אותם מקרים כמו בשרת (217 §15, D2; test-r4-engine.sql R.1 / R.15א): ליד/בהצעה — תמיד;
// לקוח שחוזר (אין התקשרות נוכחית) עם הצעה שנשלחה/נצפתה — כן; לקוח פעיל עם הצעה לעדכון — לא.
import { test, equal, assert, type TestCase } from '../../testkit/tinyTest';
import type { Engagement } from '../../types/onboarding';
import { intakeContext, requestsHeldUntilApproval, type IntakeQuote } from '../clientState';

const C = { id: 'c1', lifecycleStage: 'active' as const };
const eng = (p: Partial<Engagement> & Pick<Engagement, 'id' | 'status'>): Engagement =>
  ({ clientId: 'c1', createdAt: '2025-01-01T00:00:00Z', effectiveFrom: '2025-01-01', ...p } as Engagement);
const ENDED = eng({ id: 'e-old', status: 'ended' });
const ACTIVE = eng({ id: 'e-cur', status: 'active' });
const q = (status: string, p: Partial<IntakeQuote> = { clientId: 'c1' }): IntakeQuote => ({ status, ...p });

export const TESTS: TestCase[] = [
  test('ליד / בהצעה — מוחזקות תמיד, גם בלי הצעות', () => {
    assert(requestsHeldUntilApproval({ id: 'c1', lifecycleStage: 'lead' }, []), 'lead');
    assert(requestsHeldUntilApproval({ id: 'c1', lifecycleStage: 'quoted' }, [ACTIVE]), 'quoted');
  }),

  test('R.1 · לקוח שחוזר: ההתקשרות הסתיימה ונשלחה הצעה ⇒ מוחזקות, והקליטה «pending»', () => {
    assert(requestsHeldUntilApproval(C, [ENDED], { quotations: [q('sent')] }), 'sent');
    assert(requestsHeldUntilApproval(C, [ENDED], { quotations: [q('viewed')] }), 'viewed');
    equal(intakeContext(C, [ENDED], { quotations: [q('sent')] }).state, 'pending');
  }),

  test('R.15א · לקוח פעיל עם הצעה לעדכון הסכם — לא מוחזקות (D2 צר)', () => {
    assert(!requestsHeldUntilApproval(C, [ACTIVE], { quotations: [q('sent')] }), 'active engagement');
    equal(intakeContext(C, [ACTIVE], { quotations: [q('sent')] }).state, 'none');
  }),

  test('הצעה שלא נשלחה, שאושרה או שנדחתה — לא מחזיקה', () => {
    for (const s of ['draft', 'approved', 'rejected', 'expired']) {
      assert(!requestsHeldUntilApproval(C, [ENDED], { quotations: [q(s)] }), s);
    }
  }),

  test('הצעה דרך ליד שהומר ללקוח — כמו בשרת (leads.converted_client_id)', () => {
    const viaLead = q('sent', { leadId: 'l1' });
    assert(requestsHeldUntilApproval(C, [ENDED], { quotations: [viaLead], leadIds: ['l1'] }), 'converted lead');
    assert(!requestsHeldUntilApproval(C, [ENDED], { quotations: [viaLead], leadIds: ['l2'] }), 'other lead');
    assert(!requestsHeldUntilApproval(C, [ENDED], { quotations: [viaLead] }), 'no lead ids');
  }),

  test('הצעה של לקוח אחר — לא; בלי הצעות בכלל — רק הכלל של ליד/בהצעה', () => {
    assert(!requestsHeldUntilApproval(C, [ENDED], { quotations: [q('sent', { clientId: 'c2' })] }), 'other client');
    assert(!requestsHeldUntilApproval(C, [ENDED]), 'no quotes');
    equal(intakeContext(C, [ENDED]).state, 'none');
  }),

  test('קליטה פתוחה גוברת: open עם ההתקשרות, גם כשיש הצעה שנשלחה', () => {
    const onb = eng({ id: 'e-onb', status: 'onboarding' });
    const ctx = intakeContext(C, [ENDED, onb], { quotations: [q('sent')] });
    equal(ctx.state, 'open');
    equal(ctx.engagementId, 'e-onb');
  }),
];

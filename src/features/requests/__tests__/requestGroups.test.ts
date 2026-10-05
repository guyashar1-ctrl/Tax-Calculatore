// ─── קבוצות קבועות, עבודה מהבית, וראיית ההרשמה לפייפרלס (05.10.2026) ──────
import { test, equal, assert, deepEqual, type TestCase } from '../../../testkit/tinyTest';
import type { OnboardingStep, OnboardingStepType, OnboardingStepStatus, OnboardingBall } from '../../../types/onboarding';
import {
  buildStepGroups, groupProgress, groupStatus, childPhase, officeGroupOf, groupPortalItems, portalGroupStatus, portalChildTitle,
  type GroupChildView,
} from '../requestGroups';
import {
  validateHomeOffice, roomRatioPercent, proposedPercent, deriveHomeOffice, homeOfficeLine, HOME_OFFICE_CAP_PERCENT,
  type HomeOfficeHistory,
} from '../homeOffice';
import { paperlessSignupEvidence, connectionIntro, paperlessSettingsItems, settingsReviewCount } from '../paperlessEvidence';

let n = 0;
const step = (stepType: OnboardingStepType, status: OnboardingStepStatus = 'pending', extra: Partial<OnboardingStep> = {}): OnboardingStep => ({
  id: `s${++n}`, userId: 'u', engagementId: 'e1', clientId: 'c1', stepType, track: 'tools', scope: 'person',
  status, ball: 'client' as OnboardingBall, needsAttention: false, payload: {}, requiredForClose: true,
  sortOrder: n, createdAt: `2026-10-0${Math.min(9, n)}T10:00:00Z`, updatedAt: '2026-10-05T10:00:00Z',
  publishedAt: '2026-10-01T10:00:00Z',
  ...extra,
} as unknown as OnboardingStep);

const hist = (h: Partial<HomeOfficeHistory>): HomeOfficeHistory => ({ answers: [], approvals: [], ...h });
const ans = (id: string, has: boolean, total: number | null, biz: number | null, source: 'client' | 'office' = 'client') => ({
  id, source, has_dedicated_room: has, total_rooms: total, business_rooms: biz,
  ratio_percent: has && total && biz ? Math.round(biz / total * 1000) / 10 : null, note: null, created_at: '2026-10-05T10:00:00Z',
});
const appr = (id: string, answersId: string, pct: number, entered: string | null = null) => ({
  id, answers_id: answersId, approved_percent: pct, effective_from: '2026-10-01', note: null,
  approved_at: '2026-10-05T11:00:00Z', paperless_entered_at: entered,
});

export const TESTS: TestCase[] = [
  // ── קבוצות בתיק ─────────────────────────────────────────────────────────
  test('פייפרלס: כל החברים בקבוצה אחת בסדר קבוע — גם מה שהושלם וגם מה שנעול', () => {
    const conn = step('paperless_connection', 'locked');
    const inv = step('paperless_invite', 'completed');
    const ret = step('retainer_authorization', 'locked');
    const bd = step('business_details', 'pending');
    const docs = step('client_documents', 'pending');
    const { groups, grouped } = buildStepGroups([conn, docs, ret, inv, bd]);
    equal(groups.length, 1);
    deepEqual(groups[0].steps.map(s => s.stepType), ['paperless_invite', 'business_details', 'paperless_connection', 'retainer_authorization']);
    assert(!grouped.has(docs.id), 'בקשה בודדת אינה בקבוצה');
  }),
  test('בקשה שהושלמה נשארת בקבוצה כשהאחראי משתנה (לא «עוברת» להיסטוריה)', () => {
    const inv = step('paperless_invite', 'completed', { ball: 'me' });
    const conn = step('paperless_connection', 'pending', { ball: 'me' });
    const { groups } = buildStepGroups([inv, conn]);
    deepEqual(groups[0].steps.map(s => s.id), [inv.id, conn.id]);
  }),
  test('הרשאת תשלום בלי פייפרלס — בקשה בודדת; הסדר ידני — בודדת גם עם פייפרלס', () => {
    const ret = step('retainer_authorization', 'pending');
    equal(buildStepGroups([ret]).groups.length, 0);
    equal(officeGroupOf({ stepType: 'retainer_authorization', payload: { method: 'manual_arrangement' } }, true), null);
    equal(officeGroupOf({ stepType: 'retainer_authorization', payload: {} }, true), 'paperless');
  }),
  test('מבוטלת ו«לא נוצרה» אינן בקבוצה', () => {
    const a = step('paperless_invite', 'cancelled');
    const b = step('paperless_connection', 'pending', { payload: { creationProblem: { key: 'x' } } });
    equal(buildStepGroups([a, b]).groups.length, 0);
  }),
  test('מחזור חדש של אותו סוג — שורה חדשה אחרי הקודמת, ההיסטוריה לא נכתבת מחדש', () => {
    const old = step('business_details', 'completed', { createdAt: '2025-01-01T00:00:00Z', engagementId: 'e0' });
    const inv = step('paperless_invite', 'completed');
    const neu = step('business_details', 'pending', { createdAt: '2026-10-05T00:00:00Z' });
    const g = buildStepGroups([neu, inv, old]).groups[0];
    deepEqual(g.steps.map(s => s.id), [inv.id, old.id, neu.id]);
    equal(g.steps.find(s => s.id === old.id)?.status, 'completed');
  }),
  test('העברת טיפול: שלוש הבקשות יחד, כולל מכתב שנשלח והחומרים שממתינים', () => {
    const det = step('prev_accountant_details', 'completed');
    const rel = step('release_letter', 'completed');
    const mat = step('materials_received', 'waiting_client', { ball: 'prev_accountant' });
    const g = buildStepGroups([mat, rel, det]).groups;
    equal(g[0].key, 'prevAccountant');
    deepEqual(g[0].steps.map(s => s.stepType), ['prev_accountant_details', 'release_letter', 'materials_received']);
  }),
  // ── ספירה ומצב ──────────────────────────────────────────────────────────
  test('הספירה סופרת רק מה שחל: «אין צורך» יורד, «כבר מחובר» נספר כהושלם', () => {
    const p = groupProgress([
      { status: 'completed', payload: {} },
      { status: 'skipped', payload: { skipReason: 'not_applicable' } },
      { status: 'skipped', payload: { skipReason: 'already_connected' } },
      { status: 'pending', payload: {} },
    ]);
    deepEqual(p, { applicable: 3, done: 2, allDone: false });
    equal(childPhase({ status: 'locked', payload: {} }), 'locked');
  }),
  test('מצב קבוצה: יש למשרד מה לעשות ⇒ לא «ממתין ללקוח» כללי — שתי העבודות במקביל', () => {
    const kids: GroupChildView[] = [
      { id: '1', title: 'הרשמה לפייפרלס', actor: 'done' },
      { id: '2', title: 'פרטי העסק', actor: 'client', who: 'אילן' },
      { id: '3', title: 'הקמת העסק בפייפרלס', actor: 'me' },
      { id: '4', title: 'הסדרת התשלום', actor: 'locked' },
    ];
    const st = groupStatus(kids, { applicable: 4, done: 1, allDone: false });
    equal(st.tag, '1 מתוך 4 הושלמו');
    equal(st.hint, 'לטיפולך: הקמת העסק בפייפרלס · ממתין לאילן: פרטי העסק');
    equal(st.rank, 0);
  }),
  test('מצב קבוצה: רק אצל הלקוח ⇒ «השלב הבא … אצל אילן»; הכול הושלם ⇒ «הושלם»', () => {
    const st = groupStatus([{ id: '1', title: 'פרטי העסק', actor: 'client', who: 'אילן' }, { id: '2', title: 'הקמה', actor: 'locked' }],
      { applicable: 3, done: 1, allDone: false });
    equal(st.hint, 'השלב הבא: פרטי העסק · אצל אילן');
    const done = groupStatus([], { applicable: 2, done: 2, allDone: true });
    equal(done.tag, 'הושלם');
    equal(done.rank, 3);
  }),
  // ── הדף האישי ───────────────────────────────────────────────────────────
  test('דף אישי: פריטי פייפרלס בקבוצה אחת לפי המפתח, בסדר קבוע; ההרשאה מצטרפת רק כשיש פייפרלס', () => {
    const items = [
      { key: 'retainer_future', bucket: 'future', label: 'הרשאת התשלום החודשי' },
      { key: 'docs', bucket: 'done', label: 'מסמכים' },
      { key: 'paperless_connect', bucket: 'office', label: 'חיבור לפייפרלס' },
      { key: 'business_details', bucket: 'action', label: 'פרטי העסק' },
      { key: 'paperless_signup', bucket: 'done', label: 'הרשמה לפייפרלס' },
    ];
    const r = groupPortalItems(items);
    equal(r.groups.length, 1);
    deepEqual(r.groups[0].items.map(i => i.key), ['paperless_signup', 'business_details', 'paperless_connect', 'retainer_future']);
    deepEqual(r.singles.map(i => i.key), ['docs']);
    equal(portalGroupStatus(r.groups[0].items).tag, 'נדרש ממך');
    equal(portalChildTitle({ key: 'paperless_connect', label: 'חיבור לפייפרלס' }), 'הקמת העסק');
    const noPl = groupPortalItems([{ key: 'retainer_info', bucket: 'office' }, { key: 'docs', bucket: 'action' }]);
    equal(noPl.groups.length, 0);
  }),
  test('דף אישי: קבוצה של פריט אחד אינה קבוצה', () => {
    const r = groupPortalItems([{ key: 'prev_accountant', bucket: 'office' }]);
    equal(r.groups.length, 0);
    equal(r.singles.length, 1);
  }),
  test('דף אישי: ייצוג — rep_*, authrep_ וצילום התעודה יחד', () => {
    const r = groupPortalItems([{ key: 'rep_sign', bucket: 'action' }, { key: 'authrep_x', bucket: 'office' },
      { key: 'custom_9', kind: 'identity_confirm', bucket: 'action' }]);
    equal(r.groups[0].key, 'representation');
    equal(r.groups[0].items.length, 3);
    equal(portalChildTitle({ key: 'rep_done', label: 'ייצוג מול הרשויות' }), 'בקשת ייצוג', 'הילד לא בשם הקבוצה');
  }),
  // ── עבודה מהבית ─────────────────────────────────────────────────────────
  test('חדרים: חובה לבחור; «לא» תקין בלי מספרים', () => {
    equal((validateHomeOffice({ hasDedicatedRoom: null, totalRooms: null, businessRooms: null }) as { error: string }).error, 'missing_has_room');
    const r = validateHomeOffice({ hasDedicatedRoom: false, totalRooms: '4', businessRooms: '1' });
    assert(r.ok, 'no is valid');
    if (r.ok) { equal(r.value.totalRooms, null); equal(r.value.businessRooms, null); }
  }),
  test('חדרים: חיוביים, עסק ≤ סך הכול, חצאי חדר, פסיק עשרוני, חסר, טקסט', () => {
    const err = (t: unknown, b: unknown) => {
      const r = validateHomeOffice({ hasDedicatedRoom: true, totalRooms: t as string, businessRooms: b as string });
      return r.ok ? 'ok' : r.error;
    };
    equal(err('3', '4'), 'business_rooms_exceed_total');
    equal(err('0', '0'), 'rooms_not_positive');
    equal(err('4.3', '1'), 'rooms_precision');
    equal(err('3,5', '1'), 'ok');
    equal(err('', '1'), 'missing_rooms');
    equal(err('ארבעה', '1'), 'rooms_not_numeric');
    equal(err('60', '1'), 'rooms_too_many');
    equal(err('4', '4'), 'ok');
  }),
  test('יחס והצעה: 1 מתוך 4 = 25%; 2 מתוך 3 = 66.7% והצעה בתקרה (25%) — התשובה נשמרת כמו שהיא', () => {
    equal(roomRatioPercent(4, 1), 25);
    equal(roomRatioPercent(3, 2), 66.7);
    equal(proposedPercent(66.7), HOME_OFFICE_CAP_PERCENT);
    equal(proposedPercent(12.5), 12.5);
    equal(roomRatioPercent(3, 4), null);
  }),
  test('מצבים: בלי תשובה / אין חדר / ממתין / אושר / השתנה אחרי אישור — שונים זה מזה', () => {
    equal(deriveHomeOffice(hist({})).phase, 'unanswered');
    const noRoom = deriveHomeOffice(hist({ answers: [ans('a1', false, null, null)] }));
    equal(noRoom.phase, 'noRoom');
    equal(noRoom.current, null, '«אין חדר» אינו אישור משרד');
    equal(noRoom.paperless, 'none');
    const waiting = deriveHomeOffice(hist({ answers: [ans('a1', true, 3, 2)] }));
    equal(waiting.phase, 'awaitingApproval');
    assert(waiting.aboveCap, 'above cap is visible');
    equal(waiting.proposed, 25);
    const ok = deriveHomeOffice(hist({ answers: [ans('a1', true, 4, 1)], approvals: [appr('p1', 'a1', 20)] }));
    equal(ok.phase, 'approved');
    equal(ok.paperless, 'pending');
    const zero = deriveHomeOffice(hist({ answers: [ans('a1', false, null, null)], approvals: [appr('p1', 'a1', 0)] }));
    equal(zero.phase, 'approved', '0% מפורש הוא אישור');
    equal(zero.current?.approved_percent, 0);
  }),
  test('שינוי מהותי אחרי אישור ו«הוזן בפייפרלס» ⇒ לבדיקה, לא עדכני', () => {
    const st = deriveHomeOffice(hist({
      answers: [ans('a2', true, 3, 2, 'office'), ans('a1', true, 4, 1)],
      approvals: [appr('p1', 'a1', 20, '2026-10-05T12:00:00Z')],
    }));
    equal(st.phase, 'stale');
    equal(st.current, null);
    equal(st.paperless, 'stale');
    assert(homeOfficeLine(st).includes('נדרשת בדיקה'), homeOfficeLine(st));
  }),
  // ── פייפרלס ─────────────────────────────────────────────────────────────
  test('ראיית ההרשמה: המשרד סימן ≠ הלקוח אישר; «כבר מחובר» — קביעת המשרד', () => {
    const office = paperlessSignupEvidence({ status: 'completed', completionMethod: 'manual', completedAt: '2026-10-05T06:18:12Z', payload: {} } as unknown as OnboardingStep);
    equal(office.source, 'office');
    assert(office.line.startsWith('אישור המשרד'), office.line);
    assert(office.detail.includes('אינה בדיקה אוטומטית'), office.detail);
    const client = paperlessSignupEvidence({ status: 'completed', completionMethod: 'system', payload: { submittedByClient: true, clientConfirmedAt: '2026-09-01T10:00:00Z' } } as unknown as OnboardingStep);
    equal(client.source, 'client');
    assert(client.line.includes('1.9.2026'), client.line);
    const already = paperlessSignupEvidence({ status: 'skipped', payload: { skipReason: 'already_connected' } } as unknown as OnboardingStep);
    equal(already.source, 'alreadyConnected');
    const open = paperlessSignupEvidence({ status: 'pending', payload: {} } as unknown as OnboardingStep);
    equal(open.done, false);
  }),
  test('פתיח ההקמה: לא «הלקוח נרשם» כשרק המשרד סימן', () => {
    const office = paperlessSignupEvidence({ status: 'completed', completionMethod: 'manual', completedAt: '2026-10-05T06:18:12Z', payload: {} } as unknown as OnboardingStep);
    const t = connectionIntro('none', office);
    assert(t.startsWith('המשרד סימן שהלקוח נרשם'), t);
    assert(connectionIntro('none', { done: false, source: 'none', line: '', detail: '' }).startsWith('עדיין אין אישור'), 'no registration claim');
  }),
  test('בדיקת הגדרות: ערך לא ידוע ב-PIVO הוא «לא ידוע», לא 0; אחוז משרד ביתי מהאישור', () => {
    const ho = deriveHomeOffice(hist({ answers: [ans('a1', true, 4, 1)], approvals: [appr('p1', 'a1', 20)] }));
    const items = paperlessSettingsItems({ dealerType: 'exempt', withholdingStatus: 'none' }, ho);
    const by = Object.fromEntries(items.map(i => [i.key, i.pivo]));
    equal(by.dealer_sale, 'עוסק פטור');
    equal(by.home_office, 'אושר 20%');
    equal(by.advances, null);
    equal(by.ni, null);
    equal(by.withholding, 'אין אישור ניכוי תקף');
    equal(by.bookkeeping, null);
    const c = settingsReviewCount(items, { dealer_sale: { state: 'checked', at: 'x' }, bookkeeping: { state: 'na', at: 'x' } }, true);
    deepEqual(c, { marked: 3, total: 6 });
  }),
  test('סיווג העוסק — הקנוני: «פטור» בשדה עם סיווג מע״מ «מורשה» הוא מורשה (cardDealerKind)', () => {
    const items = paperlessSettingsItems({ dealerType: 'exempt', vatStatus: 'authorizedDealer' }, null);
    equal(items.find(i => i.key === 'dealer_sale')?.pivo, 'עוסק מורשה (לפי סיווג מע״מ)');
    const none = paperlessSettingsItems({ dealerType: 'other' }, null);
    equal(none.find(i => i.key === 'dealer_sale')?.pivo, null, '«אחר» הוא «לא ידוע», לא סוג');
  }),
  test('ניכוי במקור — אישור הלקוח, לא שיעור תיק הניכויים', () => {
    const rateOnly = paperlessSettingsItems({ withholdingRate: 30 }, null);
    equal(rateOnly.find(i => i.key === 'withholding')?.pivo, null, 'withholdingRate הוא תיק ניכויים');
    const rates = paperlessSettingsItems({ withholdingStatus: 'rates', withholdingDetail: '0% שירותים, 30% קבלנות' }, null);
    equal(rates.find(i => i.key === 'withholding')?.pivo, 'לפי פעילות · 0% שירותים, 30% קבלנות');
    const exempt = paperlessSettingsItems({ withholdingStatus: 'exempt' }, null);
    equal(exempt.find(i => i.key === 'withholding')?.pivo, 'פטור מניכוי');
  }),
];

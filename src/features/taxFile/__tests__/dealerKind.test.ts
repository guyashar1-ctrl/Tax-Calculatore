// ─── בדיקות: «סוג העוסק» בתיק המס והבקשות שמחכות לו (r4, 217) ─────────────────
// ‼ החוזה: סוג עוסק חסר אינו «עוסק מורשה» בשקט. בקשות שתלויות בסוג מוחזקות על
// ההתקשרות (engagements.kind_hold) עד שהמשרד קובע את הסוג ב«פרטי הנישום».
// כל הודעה אחרי השמירה נגזרת רק ממה שהשרת רשם על ההתקשרות.

import { test, equal, assert, deepEqual } from '../../../testkit/tinyTest';
import type { TestCase } from '../../../testkit/tinyTest';
import type { Client } from '../../../types';
import { GOVERNED_FACT_KEYS } from '../../../types/taxFacts';
import { clientPatchToDb } from '../../../lib/dbMappers';
import {
  EDIT_SECTIONS, EDIT_FIELD_BY_KEY, coerceEditField, editFieldValue, identityFieldError,
  cardDealerKind, dealerTypeDisplay, dealerKindLabel, parseKindHold, currentKindHold,
  kindHoldPending, kindHoldCount, kindHoldTitles, titleList, kindHoldRowException,
  kindHoldFieldHint, kindHoldOutcome, retryKindHoldErrorText,
} from '../editModel';
import type { KindHold } from '../editModel';
import TAB_SOURCE from '../../../components/clientTabs/TaxFileTab.tsx?raw';

const card = (p: Partial<Client>) => p as Pick<Client, 'dealerType' | 'vatStatus'>;

const PAPERLESS = { key: 'paperless_tax_authority', stepType: 'paperless_tax_authority', source: 'system', title: 'חיבור פייפרלס לרשות המסים' };
const OFFICE = { key: 'qa27x', stepType: 'custom_request', source: 'office', title: 'דוח מחזור לעוסק פטור' };

const pending = (held = [PAPERLESS]): KindHold =>
  parseKindHold({ since: '2026-10-03T08:00:00Z', keys: held.map(h => h.key), held })!;
const resolved = (over: Record<string, unknown>, held = [PAPERLESS]): KindHold =>
  parseKindHold({ since: '2026-10-03T08:00:00Z', keys: held.map(h => h.key), held, resolvedAt: '2026-10-03T09:00:00Z', ...over })!;

/** טקסט גלוי לא נושא קודים באנגלית (מפתחות, סוגי שלבים, סוגי לקוח). */
const noCodes = (s: string | null | undefined) => {
  assert(!/[A-Za-z_]{3,}/.test(s ?? ''), `קוד בטקסט גלוי: ${s}`);
};

export const TESTS: TestCase[] = [
  test('A · «סוג העוסק» יושב ב«פרטי הנישום», נשמר במסלול הרגיל, שלוש אפשרויות בלבד', () => {
    const identity = EDIT_SECTIONS.find(s => s.id === 'identity')!;
    const f = identity.fields.find(x => x.key === 'dealerType');
    assert(f, 'השדה חסר במקטע identity');
    equal(f!.label, 'סוג העוסק');
    equal(f!.kind, 'select');
    assert(!f!.governed, 'סוג העוסק אינו עובדה מנוהלת — update_client_fields היה דוחה אותו');
    assert(!GOVERNED_FACT_KEYS.has('dealerType'), 'dealerType ב-GOVERNED_FACT_KEYS ⇒ useClients היה שולח אותו כעובדה');
    deepEqual(f!.options, [['exempt', 'עוסק פטור'], ['licensed', 'עוסק מורשה'], ['company', 'חברה']]);
    equal(EDIT_FIELD_BY_KEY.dealerType, f);
  }),

  test('B · ריק נשמר כ-NULL (לא «מורשה», לא מחרוזת ריקה); בחירה נשמרת כמות שהיא', () => {
    const f = EDIT_FIELD_BY_KEY.dealerType;
    deepEqual(clientPatchToDb({ dealerType: coerceEditField(f, '') } as Partial<Client>), { dealer_type: null });
    deepEqual(clientPatchToDb({ dealerType: coerceEditField(f, 'company') } as Partial<Client>), { dealer_type: 'company' });
    equal(editFieldValue({} as Client, f), '');
    equal(identityFieldError(f, ''), null);
    equal(identityFieldError(f, 'licensed'), null);
    assert(identityFieldError(f, 'licensed_dealer') !== null, 'ערך שאינו בעמודה נדחה לפני השמירה');
  }),

  test('C · הסוג מהכרטיס — אותו סדר כמו resolve_client_kind, ובלי ברירת מחדל', () => {
    equal(cardDealerKind(card({})), null);
    equal(cardDealerKind(card({ vatStatus: 'none' })), null);
    equal(cardDealerKind(card({ dealerType: 'other' })), null);
    equal(cardDealerKind(card({ dealerType: 'company', vatStatus: 'exemptDealer' })), 'company');
    equal(cardDealerKind(card({ dealerType: 'exempt', vatStatus: 'authorizedDealer' })), 'licensed');
    equal(cardDealerKind(card({ dealerType: 'exempt' })), 'exempt');
    equal(cardDealerKind(card({ vatStatus: 'exemptDealer' })), 'exempt');
    equal(cardDealerKind(card({ dealerType: 'other', vatStatus: 'authorizedDealer' })), 'licensed');
  }),

  test('D · תצוגה לקריאה: «טרם ביררנו», «אחר» בלי קוד, ומקור הסוג כשאינו מהשדה', () => {
    deepEqual(dealerTypeDisplay(card({})), { text: 'טרם ביררנו', unknown: true });
    deepEqual(dealerTypeDisplay(card({ dealerType: 'other' })), { text: 'אחר — טרם נקבע', unknown: true });
    deepEqual(dealerTypeDisplay(card({ dealerType: 'company' })), { text: 'חברה', unknown: false });
    deepEqual(dealerTypeDisplay(card({ vatStatus: 'exemptDealer' })), { text: 'עוסק פטור (לפי סיווג מע״מ)', unknown: false });
    deepEqual(dealerTypeDisplay(card({ dealerType: 'exempt', vatStatus: 'authorizedDealer' })),
      { text: 'עוסק מורשה (לפי סיווג מע״מ)', unknown: false });
    equal(dealerKindLabel('exempt_dealer'), 'עוסק פטור');
    equal(dealerKindLabel('licensed_dealer'), 'עוסק מורשה');
    equal(dealerKindLabel('company'), 'חברה');
    equal(dealerKindLabel('tax_refund'), null);
  }),

  test('E · kind_hold מהמסד — סלחני: חסר/פגום ⇒ null, לא קריסה', () => {
    equal(parseKindHold(null), null);
    equal(parseKindHold(undefined), null);
    equal(parseKindHold('not json'), null);
    equal(parseKindHold([1, 2]), null);
    const h = parseKindHold(JSON.stringify({ keys: ['a', 3], held: [PAPERLESS, { key: '', title: '' }, 'x'], created: [{ key: 'a', stepId: 's1' }, {}] }))!;
    deepEqual(h.keys, ['a']);
    equal(h.held.length, 1);
    equal(h.created.length, 1);
    deepEqual(h.notApplicable, []);
    assert(kindHoldPending(h), 'בלי resolvedAt ⇒ ממתין');
    assert(!kindHoldPending(resolved({})), 'עם resolvedAt ⇒ לא ממתין');
    equal(kindHoldCount(resolved({})), 0);
    equal(kindHoldCount(null), 0);
  }),

  test('F · ההתקשרות הנוכחית בלבד — החזקה על התקשרות שהסתיימה אינה ממתינה', () => {
    const rows = [
      { id: 'e-old', client_id: 'c1', status: 'ended', created_at: '2025-01-01T00:00:00Z', kind_hold: { held: [OFFICE], keys: ['qa27x'] } },
      { id: 'e-cur', client_id: 'c1', status: 'onboarding', created_at: '2026-10-01T00:00:00Z', kind_hold: { held: [PAPERLESS], keys: ['paperless_tax_authority'] } },
    ];
    const h = currentKindHold(rows, 'c1');
    equal(h?.held[0]?.key, 'paperless_tax_authority');
    equal(currentKindHold([rows[0]], 'c1'), null);
    equal(currentKindHold([{ ...rows[1], kind_hold: null }], 'c1'), null);
    // ‼ סביבה בלי 217: אין עמודה — אין החזקה, ולא שגיאה.
    equal(currentKindHold([{ id: 'e', client_id: 'c1', status: 'active' }], 'c1'), null);
  }),

  test('G · ההסבר מתחת לשדה: יחיד/רבים, שמות אמיתיים, ושום דבר כשאין מה שמחכה', () => {
    equal(kindHoldFieldHint(pending()),
      'עם השמירה תיפתח הבקשה שחיכתה לסוג העוסק (חיבור פייפרלס לרשות המסים) — רק אם היא מתאימה לסוג שבחרת.');
    equal(kindHoldFieldHint(pending([PAPERLESS, OFFICE])),
      'עם השמירה ייפתחו הבקשות שחיכו לסוג העוסק (חיבור פייפרלס לרשות המסים, דוח מחזור לעוסק פטור) — רק אלה שמתאימות לסוג שבחרת.');
    equal(kindHoldFieldHint(resolved({})), null);
    equal(kindHoldFieldHint(pending([])), null);
    equal(kindHoldFieldHint(null), null);
    // פריט בלי שם — נספר, אבל המפתח שלו לא מוצג
    const noTitle = pending([{ ...OFFICE, title: '' }]);
    equal(kindHoldTitles(noTitle).length, 0);
    equal(kindHoldFieldHint(noTitle), 'עם השמירה תיפתח הבקשה שחיכתה לסוג העוסק — רק אם היא מתאימה לסוג שבחרת.');
    equal(titleList(['א', 'ב', 'ג', 'ד', 'ה']), 'א, ב, ג ועוד 2');
    noCodes(kindHoldFieldHint(pending([PAPERLESS, OFFICE])));
  }),

  test('H · הסימון על השורה הסגורה: «חסר סוג העוסק», ואחרי סוג שנקבע — «עדיין מחכה»', () => {
    equal(kindHoldRowException(pending()), 'חסר סוג העוסק — בקשה אחת מחכה לו');
    equal(kindHoldRowException(pending([PAPERLESS, OFFICE])), 'חסר סוג העוסק — 2 בקשות מחכות לו');
    equal(kindHoldRowException(pending([PAPERLESS, OFFICE]), true), '2 בקשות עדיין מחכות לסוג העוסק');
    equal(kindHoldRowException(resolved({})), null);
    equal(kindHoldRowException(undefined), null);
  }),

  test('I · אחרי השמירה: «נפתחו» רק עם שורות שנוצרו', () => {
    const before = pending([PAPERLESS, OFFICE]);
    equal(kindHoldOutcome(before, resolved({ resolvedKind: 'licensed_dealer', created: [{ key: 'paperless_tax_authority', stepId: 's1' }] }, [PAPERLESS, OFFICE]), 'save', 'licensed')?.text,
      'נשמר. נפתחה בקשה אחת שחיכתה לסוג העוסק — היא בלשונית «בקשות».');
    const two = kindHoldOutcome(before, resolved({ created: [{ key: 'a', stepId: '1' }, { key: 'b', stepId: '2' }] }, [PAPERLESS, OFFICE]), 'save', 'company');
    equal(two?.text, 'נשמר. נפתחו 2 בקשות שחיכו לסוג העוסק — הן בלשונית «בקשות».');
    equal(two?.tone, 'ok');
    equal(two?.retryLabel, undefined);
  }),

  test('J · «לא מתאימה» רק כשהשרת רשם notApplicable — ובשם הסוג שהשרת קבע', () => {
    const before = pending([PAPERLESS, OFFICE]);
    equal(kindHoldOutcome(before, resolved({ resolvedKind: 'exempt_dealer', notApplicable: ['paperless_tax_authority', 'qa27x'] }, [PAPERLESS, OFFICE]), 'save', 'exempt')?.text,
      'נשמר. אף אחת מהבקשות שחיכו לסוג העוסק לא מתאימה לעוסק פטור — לא נפתח דבר.');
    equal(kindHoldOutcome(pending(), resolved({ notApplicable: ['paperless_tax_authority'] }), 'save', 'company')?.text,
      'נשמר. הבקשה שחיכתה לסוג העוסק לא מתאימה לחברה — לא נפתח דבר.');
    // אין רישום של מה קרה — לא ממציאים «לא מתאימה»
    equal(kindHoldOutcome(pending(), resolved({}), 'save', 'company')?.text,
      'נשמר. סוג העוסק נקבע — לא נפתחו בקשות חדשות.');
  }),

  test('K · עדיין ממתין אחרי השמירה ⇒ אומרים שלא נפתחו, ומציעים לפתוח שוב', () => {
    const save = kindHoldOutcome(pending([PAPERLESS, OFFICE]), pending([PAPERLESS, OFFICE]), 'save', 'licensed');
    equal(save?.text, 'נשמר, אבל הבקשות שחיכו לסוג העוסק לא נפתחו.');
    equal(save?.tone, 'warn');
    equal(save?.retryLabel, 'לפתוח את הבקשות שחיכו');
    const failed = parseKindHold({ ...pending(), failedAt: '2026-10-03T09:00:00Z', error: 'boom' });
    const one = kindHoldOutcome(pending(), failed, 'save', 'licensed');
    equal(one?.text, 'נשמר, אבל הבקשה שחיכתה לסוג העוסק לא נפתחה.');
    equal(one?.retryLabel, 'לפתוח את הבקשה שחיכתה');
    equal(kindHoldOutcome(pending(), pending(), 'retry')?.text, 'הבקשה שחיכתה לסוג העוסק עדיין לא נפתחה.');
    equal(kindHoldOutcome(pending([PAPERLESS, OFFICE]), resolved({ created: [{ key: 'a' }, { key: 'b' }] }, [PAPERLESS, OFFICE]), 'retry')?.text,
      'נפתחו 2 בקשות שחיכו לסוג העוסק — הן בלשונית «בקשות».');
  }),

  test('L · בלי מה שחיכה — אין הודעה; קריאה שנכשלה — «לא בדקנו», לא «נכשל»', () => {
    equal(kindHoldOutcome(null, resolved({ created: [{ key: 'a' }] }), 'save', 'exempt'), null);
    equal(kindHoldOutcome(resolved({}), resolved({ created: [{ key: 'a' }] }), 'save', 'exempt'), null);
    equal(kindHoldOutcome(pending(), null, 'save', 'exempt'), null);
    const unread = kindHoldOutcome(pending(), undefined, 'save', 'exempt');
    equal(unread?.text, 'נשמר. לא הצלחנו לבדוק אם הבקשה שחיכתה לסוג העוסק נפתחה — בדוק בלשונית «בקשות».');
    equal(unread?.retryLabel, undefined);
  }),

  test('M · שגיאות של «לפתוח את הבקשות שחיכו» — בעברית, בלי קודים', () => {
    for (const e of ['forbidden', 'kind_unknown', 'not_found', undefined, null]) noCodes(retryKindHoldErrorText(e));
    for (const h of [kindHoldOutcome(pending(), undefined, 'save'), kindHoldOutcome(pending(), pending(), 'save'),
      kindHoldOutcome(pending(), resolved({ notApplicable: ['x'], resolvedKind: 'weird_kind' }), 'save', 'other')]) {
      noCodes(h?.text);
    }
    equal(kindHoldOutcome(pending(), resolved({ notApplicable: ['x'] }), 'save', null)?.text,
      'נשמר. הבקשה שחיכתה לסוג העוסק לא מתאימה לסוג שבחרת — לא נפתח דבר.');
  }),

  test('N · מיקוד וטלפון קווי — ביטויים עם לוכסנים (הבאג: כל ערך נדחה והשורה לא נשמרה)', () => {
    const zip = EDIT_FIELD_BY_KEY.zipCode, land = EDIT_FIELD_BY_KEY.landlinePhone;
    equal(identityFieldError(zip, '6100001'), null);
    equal(identityFieldError(zip, '61000'), null);
    equal(identityFieldError(zip, '610 0001'), null);
    assert(identityFieldError(zip, '123') !== null, 'מיקוד קצר נדחה');
    assert(identityFieldError(zip, 'ddddd') !== null, 'אותיות אינן מיקוד');
    equal(identityFieldError(land, '03-1234567'), null);
    equal(identityFieldError(land, '08 9123456'), null);
    assert(identityFieldError(land, '0501') !== null, 'מספר קצר נדחה');
  }),

  test('O · מבנה: focusField פותח את «פרטי הנישום» בעריכה, וההחזקה נקראת מחדש אחרי השמירה', () => {
    const code = TAB_SOURCE.split('\n').filter(l => !/^\s*(\/\/|\*|\/\*|\{\/\*)/.test(l)).join('\n');
    assert(/focusField\?:\s*'dealerType'/.test(code), 'הפרופ focusField חסר');
    assert(/startSectionEdit\('identity', identityFields\(\)\)/.test(code), 'הנחיתה לא פותחת עריכה של פרטי הנישום');
    assert(/supabase\.rpc\('retry_kind_hold', \{ p_client_id: client\.id \}\)/.test(code), 'retry_kind_hold בשם ובפרמטר שבחוזה');
    const saveFn = code.slice(code.indexOf('async function saveSectionEdit'), code.indexOf('function renderLists'));
    const afterSave = saveFn.slice(saveFn.indexOf('await onUpdateClientFields(plain)'));
    assert(/readKindHold\(\)/.test(afterSave), 'אחרי השמירה ההתקשרות נקראת מחדש');
    assert(/after\?\.resolvedAt && after\.created\.length > 0\) onRequestsChanged\?\.\(\)/.test(afterSave),
      'רענון «בקשות» רק אחרי שחרור שנרשם');
  }),
];

// ─── הערכת מס: משימות המשך אחרי אישור ─────────────────────────────────────────
// ‼ טהור. נגזר מגרסה מאושרת בלבד. המלצה ≠ ביצוע: המשימה היא «לעדכן ברשות / לבדוק / למסור», והמערכת לא
//   משנה מקדמות ולא שולחת דבר. אחרי שינוי ברשות — קוראים שוב את היתרות (משימה נפרדת).
import type { EstimateOutputs, Person } from './types';
import { isNum } from './types';

export interface FollowUp { key: string; title: string; why: string }

const nis = (n: number) => `${Math.round(n).toLocaleString('he-IL')} ₪`;
const who = (p: Person, spouse?: string) => (p === 'spouse' ? ` (${spouse ?? 'בן/בת הזוג'})` : '');

export function followUpsFor(out: EstimateOutputs, ctx: { clientName: string; spouseName?: string; version: number }): FollowUp[] {
  const list: FollowUp[] = [];
  const tag = `הערכת מס ${out.taxYear} גרסה ${ctx.version}`;
  for (const a of out.advances) {
    if (a.recommended == null || a.current == null) continue;
    const changed = a.authority === 'it' ? Math.abs(a.recommended - a.current) >= 0.1 : !a.belowChangeThreshold && Math.abs(a.recommended - a.current) >= 1;
    if (!changed) continue;
    const val = (v: number) => (a.unit === '%' ? `${v}%` : nis(v));
    const auth = a.authority === 'it' ? 'מקדמת מס הכנסה' : 'מקדמת ב״ל';
    list.push({
      key: `adv-${a.authority}-${a.person}`,
      title: `${ctx.clientName}${who(a.person, ctx.spouseName)}: לעדכן ${auth} ל-${val(a.recommended)} (היום ${val(a.current)}) — ${tag}`,
      why: a.authority === 'it'
        ? (a.recommended < a.current ? 'הקטנה — טופס 2216א / דרך המייצג; אם תתברר כלא מוצדקת — הצמדה וריבית (190(א)(2))' : 'הגדלה — דרך המייצג (2216ב) או תשלום על חשבון')
        : 'טופס 672 — שינוי של 10% לפחות, פעם ברבעון, עד 31.12; מחושב מחדש מינואר',
    });
  }
  for (const a of out.advances.filter(x => isNum(x.catchUp) && x.catchUp.value > 0)) {
    list.push({
      key: `cu-${a.authority}-${a.person}`,
      title: `${ctx.clientName}${who(a.person, ctx.spouseName)}: השלמה ל${a.authority === 'it' ? 'מס הכנסה' : 'ב״ל'} ${nis((a.catchUp as { value: number }).value)} — לוודא מול הרשות ולמסור ללקוח — ${tag}`,
      why: a.authority === 'it' ? 'לפי דרישת פקיד השומה או כתשלום מרצון' : '«הגדלת מקדמות» — במועד שב״ל קובע',
    });
  }
  for (const c of (out.checks ?? []).filter(x => x.status === 'saving' && x.action)) {
    list.push({ key: `chk-${c.id}`, title: `${ctx.clientName}: ${c.action} — ${tag}`, why: `חיסכון משוער במס של כ-${nis(c.saving ?? 0)} (${c.title})` });
  }
  if (list.some(f => f.key.startsWith('adv-') || f.key.startsWith('cu-'))) {
    list.push({ key: 'reread', title: `${ctx.clientName}: אחרי העדכון ברשות — לקרוא שוב 134 / ב״ל ולשמור אסמכתה — ${tag}`, why: 'המלצה אינה ביצוע; רק קריאה חוזרת מראה שהשינוי נקלט' });
  }
  const notDone = (out.checks ?? []).filter(x => x.status === 'notSupported' || x.status === 'missingData' || x.status === 'notCompared' || x.status === 'undecided');
  if (notDone.length) list.push({ key: 'manual-checks', title: `${ctx.clientName}: לבדוק ביד — ${notDone.map(x => x.title).join(' · ')} — ${tag}`, why: 'בדיקות שלא בוצעו אוטומטית' });
  return list;
}

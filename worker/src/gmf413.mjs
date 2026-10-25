// gmf413.mjs — «413 הנפקת אישורים שנתיים»: פענוח בלבד (בלי דפדפן), כדי שייבדק לבד.
//
// ‼ נצפה חי 25.10.2026 (התיק של גיא, קריאה בלבד):
//   · מסך הכניסה /gmf-413/main/home — «מספר ישות» (#rbYeshut) + #mezahe, ושלושה כרטיסים:
//     «הקטנות» (אישור ניכוי מס במקור), «גופים» (אישור ניהול ספרים), «מורחב».
//   · כרטיס ⇒ POST gmf413Api/api/Ptik/GetIshur {mezahe, kodMezahe:"1", kodPeula:1|2, kodMyzg:1}.
//     objIsrKayam = האישור הקיים (kodMazav 910 «יש אישור (יזום)», tokefMe/Ad, LstSeif, isn);
//     objIsrNew = הטופס להנפקה (lstHkt — 6 סעיפים, swSeif = ניתן להקטנה, ahzTkn = שיעור התקנות).
//   · «הדפסת העתק אישור» ⇒ POST gmfHdpsIsrApi/api/Phdps/hdpsIsr {misYeshut, isnHkt|isnGfm}
//     ⇒ {fileContent: PDF ב-base64, fileType:"pdf"}.
//   · ‼ הנפקה לפי **ת.ז. של בעל העסק** (העוסק במע״מ), לא לפי מספר תיק מס הכנסה: בתיק משותף
//     הרשום על בן/בת הזוג, «גופים» לפי מספר התיק נדחה «לא קיים תיק מע״מ» (הקלטה של גיא).
//   · כלל עסק חדש — מהקוד של המסך עצמו (btnBdikaClicked): למייצג, כשבאפיון «עסק חדש» /
//     «עוסק מורשה חדש», שיעור מתחת ל-5% או «פטור מלא» נדחים בכל סעיף מלבד ריבית (אינדקס 4).

/** שמות קצרים לששת הסעיפים, באותו סדר כמו lstHkt / lstAhuzim — כמו בכותרת המסך. */
export const SECTION_SHORT = ['שירותים', 'בניה', 'ביטוח', 'שכר', 'שוק ההון', 'שכירות'];
/** «פטור מלא» בשע״ם הוא 99 בשיעור. */
export const EXEMPT = 99;
/** הסעיף היחיד שכלל העסק החדש אינו חל עליו (ריבית ושוק ההון). */
const NEW_BUSINESS_FREE_INDEX = 4;
export const NEW_BUSINESS_FLOOR = 5;

const num = (v) => (v == null || v === '' ? null : Number(v));
/** 20270331 ⇒ '2027-03-31'. */
export function decToIso(dec) {
  const s = String(dec ?? '').replace(/\D/g, '');
  return s.length === 8 && s !== '00000000' ? `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}` : null;
}
const todayIso = (now = new Date()) => {
  const d = new Date(now.getTime() + 3 * 3600_000); // ישראל — מספיק ליום, לא לשעה
  return d.toISOString().slice(0, 10);
};

/** האם באפיון התיק יש עסק חדש — אותם תנאים כמו במסך. */
export function isNewBusiness(body) {
  const efun = (body?.lstTeurEfun ?? []).filter(Boolean).map(String);
  return efun.some((t) => /עסק חדש|עוסק מורשה חדש/.test(t))
    || (body?.lstKodEfun ?? []).some((c) => c === 5 || c === 15)
    || !!body?.swEsekHadashMitmashech || !!body?.swOsekMursheHadashMitmashech;
}

/**
 * מצב האישור מתשובת GetIshur.
 * @param kind 'withholding' (הקטנות) | 'bookkeeping' (גופים)
 */
export function parseIshur(body, kind, { now = new Date() } = {}) {
  if (!body || typeof body !== 'object') return { ok: false, reason: 'no_body' };
  const k = body.objIsrKayam ?? {};
  const prt = (k.objPrtIsr?.OPrtTikIsr?.misYeshut ? k.objPrtIsr : body.objIsrNew?.objPrtIsr) ?? {};
  const entity = String(prt.OPrtTikIsr?.misYeshut ?? '').replace(/\D/g, '');
  const year = num(prt.isurYear) ?? num(body.objIsrNew?.objPrtIsr?.isurYear);
  const code = num(k.kodMazav) ?? 0;
  const validFrom = decToIso(k.decTokefMe);
  const validUntil = decToIso(k.decTokefAd);
  // ‼ קודי 9xx = אישור קיים (כך גם המסך: kodMazav>=900&&<=999). ובכל זאת בודקים את התאריך —
  // אישור שתוקפו עבר אינו «בתוקף», גם אם הקוד נשאר.
  const valid = !!k.isn && code >= 900 && code <= 999 && !!validUntil && validUntil >= todayIso(now);
  const rates = [];
  if (kind === 'withholding' && valid) {
    (k.lstAhuzim ?? []).forEach((r, i) => {
      const v = num(r);
      if (v != null && v !== 0) rates.push({ section: SECTION_SHORT[i] ?? `סעיף ${i + 1}`, rate: v === EXEMPT ? 'exempt' : v });
    });
  }
  const hkt = (body.objIsrNew?.lstHkt ?? []).map((h, i) => ({
    index: i, section: SECTION_SHORT[i] ?? `סעיף ${i + 1}`,
    editable: !!h?.swSeif, standard: num(h?.ahzTkn), current: num(h?.ahzCur),
  }));
  return {
    ok: true, kind, entity, year, valid, code,
    statusText: String(k.teurMazav ?? (valid ? 'יש אישור' : 'אין אישור בתוקף')).trim(),
    validFrom, validUntil, isn: num(k.isn) || null,
    // תאריך העדכון האחרון של האישור ⇒ מזהה גרסה (אותו isn מתעדכן בהנפקה חוזרת).
    updatedOn: decToIso(k.taIdkun),
    rates, sections: hkt,
    newBusiness: isNewBusiness(body),
    partnership: !!body.swShutfut,
    locked: num(k.kodNeilaHkt) === 3,
    deficiencies: num(body.objIsrNew?.moneLikuim) ?? 0,
    // «גופים» מופיע גם בתשובת «הקטנות» — עוזר לדעת אם ההנפקה הראשונה הוציאה את שניהם.
    bookkeepingCode: num(k.kodMazavGfm) ?? 0,
  };
}

/** «5% שירותים · 5% שכר · 5% שכירות» / «פטור מלא». */
export function ratesText(rates) {
  if (!rates?.length) return '';
  if (rates.every((r) => r.rate === 'exempt')) return 'פטור מלא';
  const same = rates.every((r) => r.rate === rates[0].rate);
  if (same) return `${rates[0].rate === 'exempt' ? 'פטור מלא' : `${rates[0].rate}%`} · ${rates.map((r) => r.section).join(', ')}`;
  return rates.map((r) => `${r.rate === 'exempt' ? 'פטור' : `${r.rate}%`} ${r.section}`).join(' · ');
}

/**
 * מה ממלאים בטופס «הקטנות»: לכל סעיף שניתן להקטנה — השיעור הנמוך ביותר שמותר, או המבוקש.
 * @param desired null = הנמוך ביותר האפשרי (פטור מלא אם מותר); מספר = השיעור המבוקש.
 * @returns {{ rows: {index:number, section:string, exempt:boolean, rate:number|null}[], floor:number, reason:string|null }}
 */
export function plannedRates(info, desired = null) {
  const floor = info.newBusiness ? NEW_BUSINESS_FLOOR : 0;
  const want = desired == null ? 0 : Math.max(0, Math.round(Number(desired)));
  const rows = info.sections.filter((s) => s.editable).map((s) => {
    let r = want;
    if (s.index !== NEW_BUSINESS_FREE_INDEX) r = Math.max(r, floor);
    // ‼ שותפות: המסך אוסר לרדת מתחת לשיעור המוצע (ahzCur) — לא מנסים.
    if (info.partnership && s.current != null && s.current !== EXEMPT) r = Math.max(r, s.current);
    // שיעור שאינו מקטין מהתקנות אינו «הקטנה» — לא מעל השיעור הרגיל.
    if (s.standard != null) r = Math.min(r, s.standard);
    return { index: s.index, section: s.section, exempt: r === 0, rate: r === 0 ? null : r };
  });
  const reason = floor > want ? `עסק חדש — המינימום ${floor}%` : null;
  return { rows, floor, reason };
}

/** «לא ניתן להקטין … מעבר ל 5% …» ⇒ 5. ההודעה בלי מספר ⇒ null (לא מנחשים). */
export function rateFromError(text) {
  const m = /(\d{1,2})\s*%/.exec(String(text ?? ''));
  return m ? Number(m[1]) : null;
}

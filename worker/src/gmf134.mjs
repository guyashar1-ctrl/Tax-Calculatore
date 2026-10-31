// gmf134.mjs — «מצב דיווח» של המקדמות מתשובת ה-JSON של שאילתה 134 (gmf134Api/gmf134/getTikData).
//
// ‼ נצפה חי 23.10.2026 אצל לקוח עם מקדמות פעילות (דו-חודשי, 15%):
//   · lstTkufot — שורה לכל תקופה: tkufaMe/tkufa (YYYYMM), kodMazavDvc + mazavDvc
//     (1 «דווח» · 15 «טרם הגיע המועד»; אצל לקוח בלי מקדמות — «פטור»). שורות סיכום בלי
//     misMikForSchum (למשל tkufaMe 998) אינן תקופה.
//   · moneDvcChaser — מונה הדיווחים החסרים של שע״ם עצמה (0 אצל הלקוח שנצפה, שכל תקופותיו דווחו).
// ‼ «אין דיווחים חסרים» רק על סמך המונה של שע״ם. מונה חיובי ⇒ «חסר דיווח» עם התקופות שאינן
//   «דווח» / «טרם הגיע המועד» / «פטור»; אם לא זוהו — מספר החסרים בלבד. קוד מצב שלא נצפה לא מנוחש.
// ‼ טהור — נבדק ב-test/gmf134.test.mjs.

const DONE = new Set(['דווח', 'טרם הגיע המועד', 'פטור']);

/** 202607 + 202608 ⇒ «07-08/2026»; חודש אחד ⇒ «07/2026». */
export function periodLabel(from, to) {
  const f = String(from ?? ''), t = String(to ?? from ?? '');
  if (!/^\d{6}$/.test(f) || !/^\d{6}$/.test(t)) return null;
  const mm = (s) => s.slice(4, 6);
  return f === t ? `${mm(f)}/${f.slice(0, 4)}` : `${mm(f)}-${mm(t)}/${t.slice(0, 4)}`;
}

/** @returns {{ status: string|null, periods: {period:string, status:string, code:number|null}[] }} */
export function reportingFrom134(tik) {
  const rows = Array.isArray(tik?.lstTkufot) ? tik.lstTkufot : [];
  const periods = rows
    .filter((r) => r && r.misMikForSchum != null)
    .map((r) => ({
      period: periodLabel(r.tkufaMe, r.tkufa),
      status: String(r.mazavDvc ?? '').trim(),
      code: Number.isFinite(Number(r.kodMazavDvc)) ? Number(r.kodMazavDvc) : null,
    }))
    .filter((p) => p.period);
  const missing = Number(tik?.moneDvcChaser);
  if (!Number.isFinite(missing)) return { status: null, periods };
  if (missing === 0) return { status: 'אין דיווחים חסרים', periods };
  const open = periods.filter((p) => p.status && !DONE.has(p.status)).map((p) => p.period);
  return {
    status: open.length ? `חסר דיווח: ${open.join(', ')}` : `חסרים ${missing} דיווחים`,
    periods,
  };
}

// ─── 31.10.2026 · ההחלטה והתשלומים מאותה תשובה (נצפה חי 31.10.2026, קריאה בלבד) ───────────────────────────
// ‼ השדות כפי שנצפו מול המסך: tDvc ⇔ «עודכן ב» (תאריך עדכון החלטת המקדמה, YYYYMMDD) · hodeshTchula ⇔ «חודש שינוי»
//   · hodeshDrisha1 ⇔ «חודש דרישה ראשון» · hachlata + sibatHachlataMsrd ⇔ «החלטה» · goremMdvc ⇔ «ע״י» (הסוג בלבד —
//   shemMdvc הוא שם של אדם, לא נשמר). לכל תקופה: machzor/hiuv/tash ⇔ מחזור/חיוב/תשלומים, tDvc ⇔ תאריך הדיווח.
//   שורות tkufaMe 998/999 הן סיכום (בלי misMikForSchum) — לא תקופה.
// ‼ «עודכן ב» אינו «נבדק ב»: הוא מתי הרשות שינתה את ההחלטה, לא מתי קראנו.
const isoDay = (n) => { const s = String(n ?? ''); return /^\d{8}$/.test(s) && s !== '00000000' ? `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}` : null; };
const isoMonth = (n) => { const s = String(n ?? ''); return /^\d{6}$/.test(s) && Number(s.slice(4, 6)) >= 1 && Number(s.slice(4, 6)) <= 12 ? `${s.slice(0, 4)}-${s.slice(4, 6)}` : null; };
const money = (v) => (v == null || v === '' || !Number.isFinite(Number(v)) ? null : Number(v));
const text = (v) => { const s = String(v ?? '').replace(/\s+/g, ' ').trim(); return s || null; };

/** @returns {{ updatedOn: string|null, changeMonth: string|null, firstMonth: string|null, decision: string|null, updatedBy: string|null, periods: object[] } | null} */
export function advanceDetailsFrom134(tik) {
  if (!tik || typeof tik !== 'object') return null;
  const decision = [text(tik.hachlata), text(tik.sibatHachlataMsrd)].filter(Boolean).join(' — ') || null;
  const periods = (Array.isArray(tik.lstTkufot) ? tik.lstTkufot : [])
    .filter((r) => r && r.misMikForSchum != null && isoMonth(r.tkufaMe) && isoMonth(r.tkufa))
    .map((r) => ({
      from: isoMonth(r.tkufaMe), to: isoMonth(r.tkufa),
      status: text(r.mazavDvc), code: Number.isFinite(Number(r.kodMazavDvc)) ? Number(r.kodMazavDvc) : null,
      turnover: money(r.machzor), charge: money(r.hiuv), paid: money(r.tash), withheld: money(r.nikuy),
      reportedOn: isoDay(r.tDvc),
    }));
  return {
    updatedOn: isoDay(tik.tDvc), changeMonth: isoMonth(tik.hodeshTchula), firstMonth: isoMonth(tik.hodeshDrisha1),
    decision, updatedBy: text(tik.goremMdvc), periods,
  };
}

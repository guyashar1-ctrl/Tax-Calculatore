// gmf154.mjs — פענוח שאילתה 154 («מידע אודות שנות מס») במערכת גביית מס הכנסה.
//
// ‼ המקור הוא תשובות ה-JSON שהמסך עצמו מקבל (gmf154Api/getPrtKnisaShilta +
// getPrtTavla), לא הטקסט שעל המסך. נצפו חי 21.10.2026 אצל שני תיקים אמיתיים:
//   · getPrtKnisaShilta.objKnisaSheilta — ראש התיק: misTik, misPsTik+PsTikEdit
//     («26 - רחובות», זהה ל-134), sugTik, huliaaTik, anafCalcaliTik.
//   · getPrtTavla.title — yitratHov/yitratZhut (סך יתרת חוב/זכות של התיק),
//     sugDrisha (מצב המקדמות: «לא נדרש» / «בוטלה (שעור דו)» / …),
//     tarihPtihatEsek, shnatPeilutAhrona, kodIsur (אישור ניכוי במקור).
//   · getPrtTavla.tableData — מערכים מקבילים, עמודה לכל שנת מס (5 בעמוד):
//     shnatMas, kodHayav+kodHayavCode (101 «חייב בהגשה» · 100 «לא חייב בהגשה»
//     · 105 «שנה לא קיימת»), tarHagasha (תאריך הגשה, ריק = לא הוגש), moedHuki,
//     tarOrca+makorOrca (ארכה ומקורה, למשל «הכנה»), numSeifShuma/strSeifShuma.
//   · tableData.allZhanData.zhanArr — דרישות הצהרת הון: {text: «דרישה עד
//     31/12/2026», shantMas, isDatePass}. מופיעה רק בעמוד הראשון.
//
// ‼ «חייב בהגשה» + תאריך הגשה ריק = דוח פתוח לפי רישום שע״ם. «לא חייב» ו«שנה
// לא קיימת» אינם חובה. קוד חבות שלא נצפה — נשמר כלשונו כ-'other', לא מנוחש.
// ‼ טהור: בלי דפדפן — נבדק ב-test/gmf154.test.mjs.

export const HAYAV_REQUIRED = 101;
export const HAYAV_NOT_REQUIRED = 100;
export const HAYAV_NO_YEAR = 105;

/** «31/12/2026» ⇒ «2026-12-31». כל צורה אחרת ⇒ null. */
export function dmyToIso(raw) {
  const m = String(raw ?? '').match(/(\d{2})\/(\d{2})\/(\d{4})/);
  return m ? `${m[3]}-${m[2]}-${m[1]}` : null;
}

const text = (v) => String(v ?? '').replace(/\s+/g, ' ').trim();
const num = (v) => {
  const n = Number(String(v ?? '').replace(/,/g, ''));
  return Number.isFinite(n) ? n : null;
};

/** האם בעמוד יש לפחות שנה קיימת — כל עוד יש, כדאי לדפדף אחורה. */
export function pageHasExistingYear(table) {
  const codes = table?.tableData?.kodHayavCode;
  return Array.isArray(codes) && codes.some((c) => Number(c) !== HAYAV_NO_YEAR);
}

function requiredOf(code, raw) {
  const c = Number(code);
  if (c === HAYAV_REQUIRED || raw === 'חייב בהגשה') return 'required';
  if (c === HAYAV_NOT_REQUIRED || raw === 'לא חייב בהגשה') return 'not_required';
  if (c === HAYAV_NO_YEAR || raw === 'שנה לא קיימת') return 'no_year';
  return 'other';
}

/**
 * מצב המקדמות מתוך «סוג דרישה». ‼ רק שתי צורות מוכרות מכריעות שאין מקדמות
 * פעילות; כל טקסט אחר ⇒ 'active' — כלומר צריך את 134 לשיעור ולתדירות.
 */
export function advanceStateOf(sugDrisha) {
  const t = text(sugDrisha);
  if (/^לא נדרש/.test(t)) return 'no_advance';
  if (/^בוטל/.test(t)) return 'cancelled';
  return 'active';
}

/**
 * ראש התיק + כל עמודי הטבלה ⇒ שדות לכרטיס ורשימת שנים.
 * @returns {{ok:true, fields:Record<string,string>, advance:string, filing:object} | {ok:false, reason:string, detail?:string}}
 */
/** אותו שם בסדר מילים אחר («ישר גיא» / «גיא ישר») — אותו אדם. */
const sameName = (a, b) => {
  const w = (s) => text(s).split(' ').filter(Boolean).sort().join(' ');
  return !!w(a) && w(a) === w(b);
};

/**
 * `user` — שם המשתמש המחובר כפי שמופיע בכותרת GMF (‎#userDatails‎). ‼ באותה צורה כמו
 * shemMyzgTik («ישר גיא»), ולכן ההשוואה היא בין שני טקסטים של שע״ם — לא מול שם ב-PIVO.
 */
export function parseTaxYears({ head, pages, fileNumber, user }) {
  const k = head?.objKnisaSheilta;
  if (!k) return { ok: false, reason: 'head_missing' };
  // ‼ לפני ערך אחד: זה התיק שביקשנו? (מספר — אפסים מובילים נעלמים ב-JSON)
  if (num(k.misTik) === null || num(k.misTik) !== num(fileNumber)) {
    return { ok: false, reason: 'file_mismatch' };
  }
  const first = pages?.[0];
  if (!first?.tableData || !first?.title) return { ok: false, reason: 'table_missing' };
  if (Number(first.rc ?? 0) !== 0) return { ok: false, reason: 'table_error', detail: text(first.rcText) };

  const fields = {};
  if (num(k.sugTik)) fields.fileType = String(num(k.sugTik));
  if (num(k.misPsTik) && text(k.PsTikEdit)) fields.taxOffice = `${num(k.misPsTik)} - ${text(k.PsTikEdit)}`;
  if (num(k.huliaaTik) !== null && text(k.huliaaTik) !== '') fields.unit = String(num(k.huliaaTik));
  if (text(k.anafCalcaliTik)) fields.economicIndustry = text(k.anafCalcaliTik);
  // ‼ «מייצג ראשי» בראש המסך = shemMyzgTik. «אנחנו» רק כשהמשתמש המחובר הוא אותו שם.
  if (text(k.shemMyzgTik)) {
    fields.mainRepresentative = text(k.shemMyzgTik);
    if (text(user)) fields.representedByMe = sameName(user, k.shemMyzgTik) ? 'yes' : 'no';
  }

  const t = first.title;
  const hov = num(t.yitratHov);
  const zhut = num(t.yitratZhut);
  // ‼ חיובי = חוב, שלילי = זכות — אותה מוסכמה כמו בשדה «יתרה» בכרטיס.
  // ‼ 26.10.2026 · שע״ם מחזירה את יתרת הזכות **כמספר שלילי** (יובל גרוסמן: yitratHov 0, yitratZhut
  // −17176) — «חוב פחות זכות» הפך אותה ל«חוב 17,176». ערכים מוחלטים, כמו במע״מ.
  if (hov !== null && zhut !== null) fields.balance = String(Math.abs(hov) - Math.abs(zhut));

  const advance = advanceStateOf(t.sugDrisha);
  if (advance !== 'active') {
    fields.advanceStatus = advance;
    fields.advanceStatusRaw = text(t.sugDrisha);
  }

  const years = [];
  const seen = new Set();
  pages.forEach((p, pi) => {
    const d = p?.tableData;
    if (!d || !Array.isArray(d.shnatMas)) return;
    d.shnatMas.forEach((y, i) => {
      const year = num(y);
      if (!year || seen.has(year)) return;
      seen.add(year);
      const requiredRaw = text(d.kodHayav?.[i]);
      const filedRaw = text(d.tarHagasha?.[i]);
      const dueRaw = text(d.moedHuki?.[i]);
      const extRaw = text(d.tarOrca?.[i]);
      years.push({
        year,
        page: pi + 1,
        required: requiredOf(d.kodHayavCode?.[i], requiredRaw),
        requiredRaw,
        filedOn: dmyToIso(filedRaw),
        filedRaw: filedRaw || null,
        legalDue: dmyToIso(dueRaw),
        legalDueRaw: dueRaw || null,
        extension: dmyToIso(extRaw),
        extensionRaw: extRaw || null,
        extensionSource: text(d.makorOrca?.[i]) || null,
        section: text(d.numSeifShuma?.[i]) || null,
        sectionText: text(d.strSeifShuma?.[i]) || null,
      });
    });
  });
  years.sort((a, b) => b.year - a.year);

  const wealth = (first.tableData.allZhanData?.zhanArr ?? [])
    .map((z) => ({ year: num(z.shantMas), text: text(z.text), due: dmyToIso(z.text), passed: z.isDatePass === true }))
    .filter((z) => z.text);
  // הדרישה שמוצגת בכרטיס: האחרונה לפי שנה. טקסט שאינו «דרישה עד …» נשאר
  // כלשונו — הצד של PIVO לא ימפה אותו לערך, ויסמן «לא ניתן למיפוי».
  const demand = [...wealth].sort((a, b) => (b.year ?? 0) - (a.year ?? 0))[0];
  if (demand) {
    fields.wealthDemand = demand.year ? `${demand.text} · שנת ${demand.year}` : demand.text;
    if (demand.due) fields.wealthDemandDue = demand.due;
  } else {
    fields.wealthDemand = 'אין דרישה';
  }

  const last = pages[pages.length - 1];
  return {
    ok: true,
    fields,
    advance,
    filing: {
      years,
      wealth,
      pagesRead: pages.length,
      // ‼ «מלא» = הגענו לעמוד שאין בו אף שנה קיימת. אחרת יש עוד שנים ישנות שלא נקראו.
      complete: !pageHasExistingYear(last),
      name: text(k.shemTik) || null,
      header: {
        businessOpenYear: num(t.tarihPtihatEsek) || null,
        lastActivityYear: num(t.shnatPeilutAhrona) || null,
        withholdingApproval: text(t.kodIsur) || null,
        totalDebt: hov,
        totalCredit: zhut,
        advancesYear: num(t.shnatMkdamot) || null,
        advancesDemand: text(t.sugDrisha) || null,
      },
    },
  };
}

/** שנים שבהן שע״ם רושמת «חייב בהגשה» ואין תאריך הגשה — הדוחות הפתוחים. */
export const openYears = (filing) => (filing?.years ?? []).filter((y) => y.required === 'required' && !y.filedOn);

// gmf154-sample.mjs — תשובות JSON סינתטיות של שאילתה 154, באותו מבנה שנצפה חי
// ב-21.10.2026 (gmf154Api/getPrtKnisaShilta + getPrtTavla). ‼ נתוני דמה בלבד —
// לא תיק אמיתי. השדות שאינם נקראים הושמטו.

const HAYAV = { required: ['חייב בהגשה', 101], not: ['לא חייב בהגשה', 100], none: ['שנה לא קיימת', 105] };

export function head154(fileNumber = '123456789', over = {}) {
  return {
    rc: 0, rcText: '',
    objKnisaSheilta: {
      misTik: Number(fileNumber), shemTik: 'ישראלי ישראל ו/או ישראלה', misPsTik: 26, PsTikEdit: 'רחובות',
      sugTik: 52, huliaaTik: 2, anafCalcaliTik: '6921', strKodMasBmakor: 'קיים אישור', shemMyzgTik: 'ישר גיא', ...over,
    },
  };
}

/**
 * עמוד של 5 שנים. `years`: [{year, hayav: 'required'|'not'|'none', filed?, due?, ext?, extSrc?}].
 * `title` נדרש רק בעמוד הראשון; `zhan` — דרישות הצהרת הון (עמוד ראשון בלבד).
 */
export function table154(years, { title = {}, zhan = [] } = {}) {
  const col = (f) => years.map(f);
  return {
    rc: 0, rcText: '',
    title: {
      yitratHov: 0, yitratZhut: 0, tarihPtihatEsek: 2020, shnatPeilutAhrona: 0, shnatMkdamot: 2026,
      sugDrisha: 'לא נדרש', sugDrishaCode: 0, kodIsur: 'קיים אישור', ...title,
    },
    tableData: {
      shnatMas: col((y) => y.year),
      kodHayav: col((y) => HAYAV[y.hayav][0]),
      kodHayavCode: col((y) => HAYAV[y.hayav][1]),
      tarHagasha: col((y) => y.filed ?? ''),
      moedHuki: col((y) => y.due ?? (y.hayav === 'none' ? '' : `30/04/${y.year + 1}`)),
      tarOrca: col((y) => y.ext ?? ''),
      makorOrca: col((y) => y.extSrc ?? ''),
      numSeifShuma: col((y) => (y.hayav === 'none' ? '' : '00')),
      strSeifShuma: col((y) => (y.hayav === 'none' ? '' : 'שומה עצמית')),
      allZhanData: { zhanMone: zhan.length, zhanArr: zhan },
    },
  };
}

/** תיק לדוגמה: 2023 חייב ולא הוגש, הצהרת הון פתוחה, ועמוד שלישי ריק. */
export function sample154({ sugDrisha = 'לא נדרש', fileNumber = '123456789', hov = 1200, zhut = 200 } = {}) {
  return {
    head: head154(fileNumber),
    pages: [
      table154([
        { year: 2025, hayav: 'required', filed: '07/06/2026', ext: '30/09/2026', extSrc: 'הכנה' },
        { year: 2024, hayav: 'required', filed: '04/05/2025' },
        { year: 2023, hayav: 'required', ext: '31/08/2024', extSrc: 'הכנה' },
        { year: 2022, hayav: 'not' },
        { year: 2021, hayav: 'not', filed: '08/11/2025' },
      ], {
        title: { sugDrisha, yitratHov: hov, yitratZhut: zhut },
        zhan: [{ text: ' דרישה עד 31/12/2026', shantMas: 2025, isDatePass: false }],
      }),
      table154([
        { year: 2020, hayav: 'required', filed: '27/06/2021' },
        { year: 2019, hayav: 'required' },
        { year: 2018, hayav: 'none' },
        { year: 2017, hayav: 'none' },
        { year: 2016, hayav: 'none' },
      ]),
      table154([2015, 2014, 2013, 2012, 2011].map((year) => ({ year, hayav: 'none' }))),
      table154([2010, 2009, 2008, 2007, 2006].map((year) => ({ year, hayav: 'none' }))),
    ],
  };
}

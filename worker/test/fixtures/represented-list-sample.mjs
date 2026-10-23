// represented-list-sample.mjs — תשובת ShlifReshMeyuzagim סינתטית («רשימת מיוצגים»), במבנה שנצפה חי 23.10.2026. ‼ נתוני דמה.

export const reshPost = (misTik, over = {}) => ({
  misOsekMeyazeg: null, misTik, tarTchilatYezugMe: '', tarTchilatYezugAd: '', kodMaarach: 0, kodKvutza: '0',
  tik91: 0, harshaaCheshbon: 0, index: 1, camutIsn: 0, ...over,
});

export function reshBody(misTik, { itRep = 'נוסף', debit = true, extension = '30/11/2026' } = {}) {
  const base = { iORmMisTikMeyuzag: Number(misTik), oRmShemTik: 'ישראלי ישראל' };
  return {
    oRmRc: 0,
    listReshMeyuzagim: [
      { ...base, iORmKodMaarach: 2, iORmShemMaarach: 'מעמ', oRmSugMyzg: 'נוסף', oRmTaarihOrca: '0', oRmMekorOrca: '', oRmBank: 0, oRmSnif: 0, oRmCheshbon: '0', oPirteiBank: '' },
      { ...base, iORmKodMaarach: 1, iORmShemMaarach: 'מס הכנסה', oRmSugMyzg: itRep,
        oRmTaarihOrca: extension ?? '0', oRmMekorOrca: extension ? 'למיוצגים' : '',
        oRmBank: debit ? 12 : 0, oRmSnif: debit ? 170 : 0, oRmCheshbon: debit ? '48047' : '0', oPirteiBank: debit ? '12-170-48047' : '' },
    ],
  };
}

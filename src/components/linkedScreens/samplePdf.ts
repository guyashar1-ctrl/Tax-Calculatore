// ‼ הקריאה היחידה ברשת של תצוגת הדוגמה, וגם היא אינה מול שום מסד: טופס 2279 הריק
// שנשלח עם האתר (public/templates). מי שמרכיב מסך חתימה לדוגמה קורא לזה ומעביר את
// הבתים ל-`sampleSignData`. מוכן ל-`SigningRoom` בלי שום החלפה.
export async function loadSampleForm2279Pdf(): Promise<ArrayBuffer> {
  const res = await fetch('/templates/poa_2279a5.pdf');
  if (!res.ok) throw new Error('טופס הדוגמה לא נטען');
  return res.arrayBuffer();
}

// ‼ גם כאן הקריאה היחידה היא קובץ הטופס הריק שנשלח עם האתר (public/templates/btl-6101-…pdf),
// ונבדקת הטביעה שלו מול זו שמופה. אין שום פנייה למסד.
import { renderBtl6101 } from '../../features/smartForms/btl6101/document';
import type { PublicSigning } from '../../features/smartForms/api';
import { applyMapping } from '../../features/smartForms/mapping';
import { BTL6101_TEMPLATE } from '../../features/smartForms/btl6101/template';

/** מצייר את טופס 6101 עם נתוני הדוגמה — אותו מנוע שהחותם האמיתי רואה. */
export async function renderSampleBtl6101(info: PublicSigning): Promise<Uint8Array> {
  const template = applyMapping(BTL6101_TEMPLATE, { version: info.mappingVersion!, fields: info.mapping ?? {} });
  const r = await renderBtl6101({ ...info.data!, declarationDate: '' }, info.purposes ?? [], {
    signatures: info.otherSignatures ?? {}, title: 'דין וחשבון רב שנתי (6101)', template,
  });
  return r.bytes;
}

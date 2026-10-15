// הכתובת זוכרת שמסך הטופס פתוח (#sf=<בקשה>): רענון חוזר אליו, «אחורה» בטלפון חוזר לבקשות.
// ‼ קובץ קטן בנפרד — הדף האישי טוען את מסך הטופס (pdf-lib) רק כשנפתח.
export const CLIENT_FORM_HASH = 'sf=';
export const openClientFormFromHash = (): string | null => {
  const m = typeof location !== 'undefined' ? location.hash.match(/(?:^#|&)sf=([^&]+)/) : null;
  return m ? decodeURIComponent(m[1]) : null;
};

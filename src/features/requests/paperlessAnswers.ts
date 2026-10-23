export interface PaperlessAnswers {
  paperlessStatus: 'unknown' | 'none' | 'self' | 'other_rep' | 'not_applicable';
  dataSource: 'unknown' | 'none' | 'other_software' | 'paperless';
  softwareName: string;
}

/** Same normalization as _paperless_answers in 292. Unknown is never a negative answer. */
export function paperlessAnswers(value?: Record<string, unknown> | null, clientStatus?: string): PaperlessAnswers {
  const raw = value?.paperlessStatus && value.paperlessStatus !== 'unknown' ? value.paperlessStatus : clientStatus;
  const paperlessStatus = ['none', 'self', 'other_rep', 'not_applicable'].includes(String(raw))
    ? raw as PaperlessAnswers['paperlessStatus'] : 'unknown';
  const source = value?.dataSource;
  const dataSource = paperlessStatus === 'unknown' ? 'unknown'
    : paperlessStatus === 'self' || paperlessStatus === 'other_rep' ? 'paperless'
    : paperlessStatus === 'not_applicable' ? 'none'
    : ['none', 'other_software'].includes(String(source)) ? source as PaperlessAnswers['dataSource'] : 'unknown';
  return { paperlessStatus, dataSource, softwareName: dataSource === 'other_software' ? String(value?.softwareName ?? '').trim() : '' };
}

export function paperlessAnswersPending(a: PaperlessAnswers): boolean {
  return a.paperlessStatus === 'unknown' || (a.paperlessStatus === 'none'
    && (a.dataSource === 'unknown' || (a.dataSource === 'other_software' && !a.softwareName.trim())));
}

export function paperlessAnswerError(code?: string): string {
  if (code === 'answers_changed') return 'התשובות עודכנו בינתיים. רעננו את הדף לפני שינוי נוסף.';
  if (code === 'not_published') return 'השאלות עדיין לא פורסמו בדף האישי.';
  if (code === 'locked') return 'אפשר יהיה להשלים אחרי פתיחת השלב.';
  return 'התשובה לא נשמרה. אפשר לנסות שוב.';
}

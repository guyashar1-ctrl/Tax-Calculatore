import { paperlessAnswers, paperlessAnswersPending } from '../paperlessAnswers';
import { clientToDb } from '../../../lib/dbMappers';
import { portalChildTitle } from '../requestGroups';
const check = (v: unknown) => { if (!v) throw new Error('Assertion failed'); };
export const TESTS = [
  { name: 'missing account/history remain unknown, not no', fn: () => {
    const a = paperlessAnswers(); check(a.paperlessStatus === 'unknown' && a.dataSource === 'unknown');
    check(paperlessAnswersPending(a));
    check(paperlessAnswersPending(paperlessAnswers({ paperlessStatus: 'none' })));
  } },
  { name: 'account exists: no redundant history question', fn: () => {
    for (const paperlessStatus of ['self', 'other_rep']) {
      const a = paperlessAnswers({ paperlessStatus }); check(a.dataSource === 'paperless' && !paperlessAnswersPending(a));
    }
  } },
  { name: 'legacy unknown step does not hide a known card answer', fn: () => {
    const a = paperlessAnswers({ paperlessStatus: 'unknown' }, 'self');
    check(a.paperlessStatus === 'self' && !paperlessAnswersPending(a));
  } },
  { name: 'software selection needs its name; known no-history is complete', fn: () => {
    check(paperlessAnswersPending(paperlessAnswers({ paperlessStatus: 'none', dataSource: 'other_software' })));
    check(!paperlessAnswersPending(paperlessAnswers({ paperlessStatus: 'none', dataSource: 'other_software', softwareName: ' ריווחית ' })));
    check(!paperlessAnswersPending(paperlessAnswers({ paperlessStatus: 'none', dataSource: 'none' })));
  } },
  { name: 'question title is not overwritten by registration title', fn: () => {
    check(portalChildTitle({ key: 'paperless_signup', kind: 'paperless_questions', label: 'פרטים לקראת החיבור לפייפרלס' }) === 'פרטים לקראת החיבור לפייפרלס');
  } },
  { name: 'ordinary card save cannot overwrite shared workflow answer', fn: () => {
    check(!('paperless_status' in clientToDb({ paperlessStatus: 'none' })));
  } },
];

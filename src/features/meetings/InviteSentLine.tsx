// «הזימון נשלח אל … · היום 09:07» — בשורת הפגישה וביומן. ‼ הכתובת בבידוד LTR בתוך
// שורה עברית, ושבירה בכל מקום: כתובת ארוכה לא דוחפת את המסך לרוחב בטלפון.

import type { inviteSentInfo } from './meetingModel';

export default function InviteSentLine({ info }: { info: ReturnType<typeof inviteSentInfo> }) {
  if (!info) return null;
  return (
    <div className="mt-sent">
      {info.label}{' '}
      {info.emails.map((e, i) => (
        <span key={e}>{i > 0 && ', '}<span className="ltr-isolate">{e}</span></span>
      ))}
      {' · '}<span className="mt-sent-when">{info.when}</span>
    </div>
  );
}

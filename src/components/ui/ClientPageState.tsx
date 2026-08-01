// ─── מסך מצב שהלקוח רואה ────────────────────────────────────────────────────
// "הקישור אינו תקף" · "החתימה התקבלה" · "טוען" · "משהו השתבש".
//
// עד עכשיו כל עמוד ציבורי המציא לעצמו את הכרטיס הזה מחדש: עמוד ההצעה
// בנה אותו על ‎#F4F3EF‎ עם ‎#fff‎ ורדיוס 16, עמוד החתימה על ‎--gray-100‎
// עם ‎white‎ ורדיוס 16 וצל אחר, ומסך אין-הגישה בדרך שלישית. הלקוח עובר
// בין השלושה באותו תהליך, ורואה שלושה מוצרים.
//
// אלה גם הרגעים היחידים שבהם הלקוח פוגש את המערכת בלי מיתוג המשרד —
// עמוד ההצעה ועמוד השאלון נושאים את המותג שהרו"ח בחר בסטודיו, אבל
// "הקישור פג" קורה עוד לפני שידוע איזה משרד זה. לכן כאן אין מותג:
// יש נייר, טקסט, ומרכז אחד.

interface Props {
  /** סימן יחיד בראש. אמוג'י קיים מהמוצר — לא נוסף כאן חדש. */
  mark?: string;
  title?: string;
  body?: React.ReactNode;
  /** פעולה יחידה, כשיש. */
  action?: React.ReactNode;
  /** מצב טעינה — בלי סימן ובלי כותרת, רק משפט שקט. */
  quiet?: boolean;
}

export default function ClientPageState({ mark, title, body, action, quiet }: Props) {
  return (
    <div className="cps">
      <div className="cps-inner">
        {mark && <div className="cps-mark" aria-hidden="true">{mark}</div>}
        {title && <h1 className="cps-title">{title}</h1>}
        {body && <div className={`cps-body ${quiet ? 'is-quiet' : ''}`}>{body}</div>}
        {action && <div className="cps-action">{action}</div>}
      </div>
    </div>
  );
}

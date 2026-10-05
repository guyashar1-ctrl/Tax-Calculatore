// ─── לשונית «מסמכים» — מה מצורף, מה הלקוח מעלה, ומה נוצר לכל לקוח ─────────────────
// ‼ קובץ מספריית המשרד — נפתח האמיתי. קובץ מהתיק של לקוח — «נפתח רק אצל הלקוח». מסמך שנוצר לכל לקוח (ייפוי כוח,
// מכתב העברה, 6101) — הסבר במשפט; דוגמה רק כשהיא נוצרת באותו מחולל (D12) — עד אז לא מציירים חיקוי.

import type { DocKind } from './registry';
import type { PreviewData } from './types';

const GENERATED_TEXT: Partial<Record<DocKind, string>> = {
  generatedPoa: 'ייפוי כוח — טופס הרשות, ממולא מהפרטים שהלקוח מילא ונחתם. נוצר לכל לקוח בנפרד, ולכן אין לו דוגמה כאן.',
  generatedRelease: 'מכתב ההעברה — נוצר לכל לקוח ונשלח לרו״ח הקודם (לא ללקוח). הנוסח נערך ב«מיילים».',
  smartForm: 'טופס 6101 — ממולא מהכרטיס ומביטוח לאומי, ונחתם בקישור אישי. נוצר לכל לקוח בנפרד, ולכן אין לו דוגמה כאן.',
};

export default function DocsPreview({ data, docs }: { data: PreviewData | null; docs: DocKind[] }) {
  const items = data?.items ?? [];
  const files = items.flatMap(i => (i.resources ?? []).map(r => ({ ...r, item: i })));
  const uploads = items.flatMap(i => [
    ...(i.checklist ?? []).map(c => ({ key: `${i.key}-${c.key}`, label: c.label, note: c.note })),
    ...(i.requirements ?? []).filter(r => r.kind === 'file' || r.kind === 'files').map(r => ({ key: `${i.key}-${r.key}`, label: r.label, note: undefined })),
  ]);
  const generated = docs.filter(d => GENERATED_TEXT[d]);

  return (
    <div className="rp-docs" data-testid="rp-docs">
      <section className="rp-mail-sec">
        <h3 className="rp-h">קבצים שהמשרד שולח</h3>
        {files.length === 0 ? <p className="rp-lead">אין קבצים מצורפים לבקשה הזאת.</p> : (
          <ul className="rp-docs-list">
            {files.map(f => (
              <li key={`${f.item.key}-${f.key}`}>
                <span className="rp-docs-name">{f.label}</span>
                {f.url
                  ? <a className="rp-link" href={f.url} target="_blank" rel="noopener noreferrer">פתיחה ←</a>
                  : <span className="rp-docs-note">נפתח רק אצל הלקוח</span>}
              </li>
            ))}
          </ul>
        )}
      </section>
      <section className="rp-mail-sec">
        <h3 className="rp-h">מה הלקוח מעלה</h3>
        {uploads.length === 0 ? <p className="rp-lead">הלקוח לא מעלה כאן קבצים.</p> : (
          <ul className="rp-docs-list">
            {uploads.map(u => (
              <li key={u.key}>
                <span className="rp-docs-name">הלקוח מעלה כאן: {u.label}</span>
                {u.note && <span className="rp-docs-note">{u.note}</span>}
              </li>
            ))}
          </ul>
        )}
      </section>
      {generated.length > 0 && (
        <section className="rp-mail-sec">
          <h3 className="rp-h">מסמכים שנוצרים לכל לקוח</h3>
          {generated.map(d => <p key={d} className="rp-lead" data-doc={d}>{GENERATED_TEXT[d]}</p>)}
        </section>
      )}
    </div>
  );
}

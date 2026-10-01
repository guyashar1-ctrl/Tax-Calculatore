// ─── צילום תעודה שהגיע למשרד — צירוף לבקשת הייצוג, לאדם מסוים (204) ─────────
// ‼ הדרך השנייה שבה צילום «מגיע» (הראשונה: הלקוח מעלה בדף האישי). בלי זה
// צילום שהגיע בוואטסאפ ונשמר בתיק לא הזיז כלום, ו-201 כתב «יש לשייך אותו»
// בלי מקום לשייך. הצירוף נרשם בשרת (office_attach_identity_doc) על
// identity_docs של האדם שנבחר — ומשם גם נסגר פריט המסמך אצל הלקוח, והשידור
// לשע״ם שממתין לו ממשיך מעצמו.
// ‼ מסמך שכבר רשום לאדם אחד לא מוצע לשני: צילום של אחד אינו של השני.

import { useEffect, useRef, useState } from 'react';
import { supabase } from '../lib/supabase';
import { identicalIdDocs, planOfficeUpload, sha256Hex } from '../features/representation/identityDedupe';
import { useDocumentStore, DOC_CATEGORY_LABELS, type DocCategory } from '../hooks/useDocumentStore';

type AttachKind = 'idOrLicense' | 'passport';

interface MissingPerson {
  person: 'client' | 'spouse';
  name: string;
  kind: AttachKind;
}

interface Props {
  requestId: string;
  clientId: string;
  missing: MissingPerson[];
  /** מסמכים שכבר רשומים כצילום של מישהו בבקשה — לא מציעים אותם שוב. */
  usedDocumentIds?: string[];
  /** אחרי צירוף מוצלח — טעינה מחדש של הבקשה (הצילום נכתב בשרת). */
  onAttached: () => void;
}

const ID_CATEGORIES: DocCategory[] = ['id_card', 'drivers_license'];
const KIND_TEXT: Record<AttachKind, string> = { idOrLicense: 'תעודת זהות או רישיון נהיגה', passport: 'דרכון' };

const REASONS: Record<string, string> = {
  forbidden: 'אין הרשאה לבקשה הזו',
  document_not_of_client: 'המסמך אינו בתיק של הלקוח הזה',
  document_belongs_to_other_person: 'המסמך כבר רשום כצילום של האדם השני',
  request_not_found: 'הבקשה לא נמצאה',
  no_linked_client: 'הבקשה אינה מקושרת לכרטיס לקוח',
};

/** docKind שנרשם: דרכון מפורש; אחרת לפי הקטגוריה (רישיון) — השרת מכריע גם כך. */
function docKindFor(kind: AttachKind, category?: DocCategory): 'idCard' | 'driverLicense' | 'passport' {
  if (kind === 'passport') return 'passport';
  return category === 'drivers_license' ? 'driverLicense' : 'idCard';
}

export default function IdentityDocAttach({ requestId, clientId, missing, usedDocumentIds = [], onAttached }: Props) {
  const { getDocsByClient, saveDoc } = useDocumentStore();
  const [existing, setExisting] = useState<{ id: string; name: string; category: DocCategory }[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const fileRefs = useRef<Record<string, HTMLInputElement | null>>({});

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const all = await getDocsByClient(clientId);
        if (cancelled) return;
        setExisting(all.filter(d => ID_CATEGORIES.includes(d.category))
          .map(d => ({ id: d.id, name: d.description || d.fileName, category: d.category })));
      } catch { /* אין מסמכים / אין הרשאה — נשארת רק ההעלאה */ }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientId]);

  async function attach(m: MissingPerson, documentId: string, category?: DocCategory): Promise<boolean> {
    const { data, error } = await supabase.rpc('office_attach_identity_doc', {
      p_request_id: requestId, p_person: m.person, p_document_id: documentId,
      p_doc_kind: docKindFor(m.kind, category),
    });
    if (error) { setErr(error.message); return false; }
    if (!data?.ok) { setErr(REASONS[data?.reason] || data?.reason || 'הצירוף נכשל'); return false; }
    return true;
  }

  async function attachExisting(m: MissingPerson, d: { id: string; category: DocCategory }) {
    setBusy(`${m.person}:${d.id}`);
    setErr(null);
    try {
      if (await attach(m, d.id, d.category)) onAttached();
    } finally { setBusy(null); }
  }

  async function upload(m: MissingPerson, file: File) {
    setBusy(`${m.person}:upload`);
    setErr(null);
    try {
      // ‼ 212 · בלי עותק כפול: זהה שכבר משויך לאדם הזה / יושב בתיק בלי שיוך — לא מעלים שוב.
      // זהה שמשויך לאדם האחר — רשומה נפרדת (שיוך ואישור משלה). ראה identityDedupe.ts.
      const data = await file.arrayBuffer();
      const hash = await sha256Hex(data);
      const { data: rq } = await supabase.from('representation_requests').select('identity_docs').eq('id', requestId).maybeSingle();
      const ids = (p: string) => (((rq?.identity_docs ?? {}) as Record<string, { documentId?: string }[]>)[p] ?? [])
        .map(e => e?.documentId ?? '').filter(Boolean);
      const plan = planOfficeUpload(await identicalIdDocs(clientId, data, hash), ids(m.person), ids(m.person === 'client' ? 'spouse' : 'client'));
      if (plan.kind === 'already') { onAttached(); return; }
      if (plan.kind === 'reuse') { if (await attach(m, plan.documentId, 'id_card')) onAttached(); return; }
      const id = crypto.randomUUID();
      // ‼ הקובץ נשמר בתיק הלקוח קודם — הצירוף מצביע על מסמך אמיתי, לא על עותק.
      await saveDoc({
        id, clientId,
        fileName: file.name,
        fileType: file.type || 'application/octet-stream',
        fileSize: file.size,
        category: 'id_card',
        year: 'general',
        uploadedAt: new Date().toISOString(),
        description: `צילום ${KIND_TEXT[m.kind]} - ${m.name}`,
        notes: '',
        fileData: data,
        folderId: null,
        labelId: null,
      });
      await supabase.from('documents').update({ content_sha256: hash }).eq('id', id);
      if (await attach(m, id, 'id_card')) onAttached();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally { setBusy(null); }
  }

  const link: React.CSSProperties = {
    background: 'none', border: 'none', padding: 0, font: 'inherit',
    color: 'var(--accent)', textDecoration: 'underline', cursor: 'pointer',
  };
  const offer = existing.filter(d => !usedDocumentIds.includes(d.id));

  return (
    <div data-testid="identity-doc-attach" style={{ fontSize: 'var(--fs-13)', color: 'var(--ink-2)', lineHeight: 1.7, marginTop: '.3rem' }}>
      {missing.map(m => {
        const key = `${m.person}:${m.kind}`;
        return (
          <div key={key} style={{ marginTop: '.2rem' }}>
            <span>צילום {KIND_TEXT[m.kind]} של {m.name} אצלכם? </span>
            <button type="button" style={link} disabled={!!busy}
              onClick={() => fileRefs.current[key]?.click()}>
              {busy === `${m.person}:upload` ? 'מעלה…' : 'העלאה מהמחשב'}
            </button>
            <input ref={el => { fileRefs.current[key] = el; }} type="file" accept="image/jpeg,image/png,application/pdf"
              style={{ display: 'none' }}
              onChange={e => { const f = e.target.files?.[0]; e.target.value = ''; if (f) void upload(m, f); }} />
            {offer.length > 0 && (
              <div style={{ fontSize: 'var(--fs-12)', color: 'var(--ink-3)' }}>
                או מתיק המסמכים:{' '}
                {offer.map((d, i) => (
                  <span key={d.id}>
                    {i > 0 && ' · '}
                    <button type="button" style={link} disabled={!!busy}
                      onClick={() => void attachExisting(m, d)}>
                      {busy === `${m.person}:${d.id}` ? 'מצרף…' : `${DOC_CATEGORY_LABELS[d.category]} - ${d.name}`}
                    </button>
                  </span>
                ))}
              </div>
            )}
          </div>
        );
      })}
      {err && <div style={{ color: 'var(--danger)', marginTop: '.3rem' }}>⚠ {err}</div>}
    </div>
  );
}

// ─── «מסמכים ללקוחות» · טפסים חכמים ────────────────────────────────────────
// התבנית המשותפת (קובץ רשמי + מיפוי מאומת) שונה ממופע ללקוח (הגשה עם גרסאות
// וחתימות). ‼ החלפת קובץ אינה «מחילה» את המיפוי הישן על קובץ אחר: הקובץ נבדק
// מול הטביעה; שונה ⇒ לא ממופה, והגשות קיימות ממשיכות עם הגרסה שבה נוצרו.

import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { loadPdf } from '../../utils/pdfRender';
import { sha256Hex } from './hash';
import { BTL6101_TEMPLATE } from './btl6101/template';
import { FILING_STATE_LABELS, type FilingState } from './api';

interface Check { name: string; same: boolean; version?: string; pages?: number; size?: string }

async function inspect(file: File): Promise<Check> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const hash = await sha256Hex(bytes);
  if (hash === BTL6101_TEMPLATE.sha256) return { name: file.name, same: true };
  const pdf = await loadPdf(bytes);
  let version: string | undefined;
  try {
    const page = await pdf.doc.getPage(1);
    const text = (await page.getTextContent()).items.map(i => ('str' in i ? i.str : '')).join(' ');
    version = /(\d{2}\.\d{4})/.exec(text)?.[1];
  } catch { /* בלי שכבת טקסט — נשארים בלי גרסה */ }
  const p1 = pdf.pages[0];
  const out = { name: file.name, same: false, version, pages: pdf.numPages, size: p1 ? `${Math.round(p1.width)}×${Math.round(p1.height)}` : undefined };
  void pdf.doc.destroy();
  return out;
}

export default function SmartTemplatesCard() {
  const t = BTL6101_TEMPLATE;
  const [check, setCheck] = useState<Check | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [open, setOpen] = useState<Record<string, number> | null>(null);

  useEffect(() => {
    void supabase.from('smart_form_filings').select('state').eq('template_key', t.key)
      .then(({ data }) => {
        if (!data) return;
        const m: Record<string, number> = {};
        for (const r of data as { state: string }[]) if (!['closed', 'cancelled'].includes(r.state)) m[r.state] = (m[r.state] ?? 0) + 1;
        setOpen(m);
      });
  }, [t.key]);

  const fillable = t.fields.filter(f => f.provenance !== 'system').length;
  const openTotal = open ? Object.values(open).reduce((a, b) => a + b, 0) : 0;

  return (
    <div style={{ marginTop: 14, paddingTop: 12, borderTop: '1px solid var(--hairline-2, var(--bd))' }}>
      <div style={{ fontWeight: 650, fontSize: 'var(--fs-14)', marginBottom: 4 }}>טפסים חכמים</div>
      <div style={{ fontSize: 'var(--fs-12)', color: 'var(--gray-500)', lineHeight: 1.6, marginBottom: 8 }}>
        טופס רשמי שממולא מנתוני הלקוח ומב"ל, נחתם בדיוק במקום, ונשמר כמסמך חתום עם מעקב עד התשובה.
        כל לקוח מקבל עותק משלו; הקובץ המשותף כאן אינו משתנה.
      </div>
      <div style={{ display: 'grid', gap: 4, padding: '8px 0' }}>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <b style={{ fontSize: 'var(--fs-14)' }}>{t.title} · ביטוח לאומי</b>
          <span className="sf-badge sf-b-verified">מיפוי מאומת</span>
          <a href={t.fileUrl} target="_blank" rel="noopener noreferrer" style={{ fontSize: 'var(--fs-12)', color: 'var(--accent)' }}>הטופס הריק</a>
        </div>
        <div style={{ fontSize: 'var(--fs-12)', color: 'var(--gray-500)' }}>
          גרסת הטופס {t.version} · {t.pageCount} עמודים · {fillable} שדות ממופים · מיפוי {t.mappingVersion} · טביעה {t.sha256.slice(0, 12)}…
        </div>
        <div style={{ fontSize: 'var(--fs-12)', color: 'var(--gray-500)' }}>
          יוצרים טופס ללקוח מ«בקשות» ← «＋ בקשה חדשה» ← «דין וחשבון רב שנתי (6101)».
          {open && (openTotal ? ` כרגע ${openTotal} הגשות פתוחות: ${Object.entries(open).map(([s, n]) => `${FILING_STATE_LABELS[s as FilingState] ?? s} ${n}`).join(' · ')}.` : ' אין כרגע הגשות פתוחות.')}
        </div>
        <label style={{ fontSize: 'var(--fs-12)', color: 'var(--accent)', cursor: 'pointer', width: 'fit-content' }}>
          <input type="file" accept="application/pdf" style={{ display: 'none' }} disabled={busy}
            onChange={async e => {
              const f = e.target.files?.[0]; e.target.value = '';
              if (!f) return;
              setBusy(true); setErr(null); setCheck(null);
              try { setCheck(await inspect(f)); } catch (x) { setErr(x instanceof Error ? x.message : String(x)); } finally { setBusy(false); }
            }} />
          {busy ? 'בודק…' : 'יצאה גרסה חדשה של הטופס? בדיקת קובץ'}
        </label>
        {check && (
          <div className={`sf-banner ${check.same ? 'is-info' : 'is-warn'}`} style={{ marginTop: 4 }}>
            {check.same
              ? `«${check.name}» זהה בדיוק לגרסה הממופה (${t.version}). אין צורך בשינוי.`
              : <>«{check.name}» שונה מהגרסה הממופה{check.version ? ` — נראה שזו גרסה ${check.version}` : ''}
                  {check.pages ? ` (${check.pages} עמודים, ${check.size} נק')` : ''}. המיפוי הקיים <b>אינו</b> חל עליו, ולא ייעשה בו שימוש
                  עד שהקובץ ימופה ויאומת מחדש. טפסים שכבר נוצרו ונחתמו אינם משתנים — כל אחד שומר את גרסת הטופס והטביעה שלו.</>}
          </div>
        )}
        {err && <div className="sf-error">{err}</div>}
      </div>
    </div>
  );
}

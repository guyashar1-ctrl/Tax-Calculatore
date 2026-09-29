// ─── «מסמכים ללקוחות» · טפסים חכמים ────────────────────────────────────────
// התבנית המשותפת (קובץ רשמי + מיפוי מאומת) שונה ממופע ללקוח (הגשה עם גרסאות
// וחתימות). ‼ החלפת קובץ אינה «מחילה» את המיפוי הישן על קובץ אחר: הקובץ נבדק
// מול הטביעה; שונה ⇒ לא ממופה, והגשות קיימות ממשיכות עם הגרסה שבה נוצרו.
//
// «מלא ללקוח» פותח כאן את אותו מסך עבודה שנפתח מ«בקשות» — ההגשה נוצרת בשרת
// (smart_form_start) עם שורה ב«בקשות» של הלקוח, ופתיחה חוזרת מחזירה לאותה הגשה.

import { useEffect, useMemo, useState } from 'react';
import type { Client } from '../../types';
import { supabase } from '../../lib/supabase';
import { loadPdf } from '../../utils/pdfRender';
import { sha256Hex } from './hash';
import { BTL6101_TEMPLATE } from './btl6101/template';
import Btl6101Workspace from './btl6101/Btl6101Workspace';
import { FILING_STATE_LABELS, filingErrorText, startFiling, type FilingState } from './api';

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

const fullName = (c: Client) => `${c.firstName ?? ''} ${c.lastName ?? ''}`.trim() || c.id;

export default function SmartTemplatesCard({ clients = [] }: { clients?: Client[] }) {
  const t = BTL6101_TEMPLATE;
  const [check, setCheck] = useState<Check | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [open, setOpen] = useState<Record<string, number> | null>(null);
  const [picking, setPicking] = useState(false);
  const [query, setQuery] = useState('');
  const [starting, setStarting] = useState<string | null>(null);
  const [working, setWorking] = useState<{ filingId: string; client: Client } | null>(null);
  const [lastClosed, setLastClosed] = useState<Client | null>(null);
  const [refresh, setRefresh] = useState(0);

  useEffect(() => {
    void supabase.from('smart_form_filings').select('state').eq('template_key', t.key)
      .then(({ data }) => {
        if (!data) return;
        const m: Record<string, number> = {};
        for (const r of data as { state: string }[]) if (!['closed', 'cancelled'].includes(r.state)) m[r.state] = (m[r.state] ?? 0) + 1;
        setOpen(m);
      });
  }, [t.key, refresh]);

  const matches = useMemo(() => {
    const q = query.trim();
    if (!q) return [];
    const digits = q.replace(/\D/g, '');
    return clients
      .filter(c => c.lifecycleStage !== 'archived')
      .filter(c => fullName(c).includes(q) || (digits.length >= 3 && (c.idNumber ?? '').replace(/\D/g, '').includes(digits)))
      .slice(0, 8);
  }, [clients, query]);

  const startFor = async (c: Client) => {
    setStarting(c.id); setErr(null);
    try {
      const r = await startFiling(c.id, []);
      if (!r.ok) { setErr(filingErrorText(r.error)); return; }
      setPicking(false); setQuery('');
      setWorking({ filingId: r.filingId as string, client: c });
    } finally { setStarting(null); }
  };

  const fillable = t.fields.filter(f => f.provenance !== 'system').length;
  const openTotal = open ? Object.values(open).reduce((a, b) => a + b, 0) : 0;

  return (
    <div style={{ marginTop: 14, paddingTop: 12, borderTop: '1px solid var(--hairline-2, var(--bd))' }}>
      <div style={{ fontWeight: 650, fontSize: 'var(--fs-14)', marginBottom: 4 }}>טפסים חכמים</div>
      <div style={{ display: 'grid', gap: 6, padding: '6px 0' }}>
        <b style={{ fontSize: 'var(--fs-14)' }}>{t.title} · ביטוח לאומי</b>
        <div style={{ fontSize: 'var(--fs-13)', color: 'var(--gray-600)', lineHeight: 1.6 }}>
          ממולא מהכרטיס ומביטוח לאומי, ואתם משלימים רק את מה שמבקשים לשנות. נחתם במשרד או בקישור,
          ונשמר חתום בתיק הלקוח — עם מעקב ב«בקשות» עד התשובה.
        </div>

        {!picking ? (
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
            <button type="button" className="btn btn-primary btn-sm" onClick={() => { setPicking(true); setErr(null); }}>מלא ללקוח</button>
            <a href={t.fileUrl} target="_blank" rel="noopener noreferrer" style={{ fontSize: 'var(--fs-12)', color: 'var(--accent)' }}>הטופס הריק</a>
            {open && openTotal > 0 && (
              <span style={{ fontSize: 'var(--fs-12)', color: 'var(--gray-500)' }}>
                פתוחים כרגע: {Object.entries(open).map(([s, n]) => `${FILING_STATE_LABELS[s as FilingState] ?? s} ${n}`).join(' · ')}
              </span>
            )}
          </div>
        ) : (
          <div style={{ display: 'grid', gap: 6, maxWidth: 420 }}>
            <input autoFocus value={query} onChange={e => setQuery(e.target.value)} placeholder="שם הלקוח או מספר זהות"
              aria-label="חיפוש לקוח" style={{ width: '100%' }} />
            {query.trim() && (
              <div role="listbox" aria-label="לקוחות" style={{ display: 'grid', border: '1px solid var(--bd)', borderRadius: 8, overflow: 'hidden' }}>
                {matches.length === 0 && <div style={{ padding: '8px 10px', fontSize: 'var(--fs-13)', color: 'var(--gray-500)' }}>לא נמצא לקוח</div>}
                {matches.map(c => (
                  <button key={c.id} type="button" role="option" aria-selected={false} disabled={!!starting}
                    onClick={() => void startFor(c)}
                    style={{ textAlign: 'right', padding: '8px 10px', background: 'var(--card, #fff)', border: 0, borderTop: '1px solid var(--bd)', cursor: 'pointer', fontSize: 'var(--fs-13)' }}>
                    {starting === c.id ? 'פותח…' : fullName(c)}
                  </button>
                ))}
              </div>
            )}
            <button type="button" className="btn btn-ghost btn-sm" style={{ width: 'fit-content' }} onClick={() => { setPicking(false); setQuery(''); }}>ביטול</button>
          </div>
        )}

        {lastClosed && !working && (
          <div className="sf-okline" style={{ fontSize: 'var(--fs-13)' }}>
            ההגשה של {fullName(lastClosed)} נמצאת ב«בקשות» שלו/ה —{' '}
            <a href={`#/client/${encodeURIComponent(lastClosed.id)}/onboarding`} style={{ color: 'var(--accent)' }}>לכרטיס הלקוח</a>
          </div>
        )}
        {err && <div className="sf-error">{err}</div>}

        <details style={{ fontSize: 'var(--fs-12)', color: 'var(--gray-500)' }}>
          <summary style={{ cursor: 'pointer', width: 'fit-content' }}>פרטי הקובץ</summary>
          <div style={{ display: 'grid', gap: 4, marginTop: 6 }}>
            <div>גרסת הטופס {t.version} · {t.pageCount} עמודים · {fillable} שדות ממופים · מיפוי {t.mappingVersion} · טביעה {t.sha256.slice(0, 12)}…</div>
            <div>כל לקוח מקבל עותק משלו; הקובץ המשותף כאן אינו משתנה.</div>
            <label style={{ color: 'var(--accent)', cursor: 'pointer', width: 'fit-content' }}>
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
          </div>
        </details>
      </div>

      {working && (
        <Btl6101Workspace filingId={working.filingId} client={working.client}
          onClose={() => { setLastClosed(working.client); setWorking(null); setRefresh(n => n + 1); }} />
      )}
    </div>
  );
}

// ─── מסך בדיקה: תצוגה מקדימה של הדף האישי (?test-portal-preview) ─────────────
// DEV בלבד — נקמפל החוצה מפרודקשן. שני חלקים:
// 1. PortalView על נתוני דמה — אימות ויזואלי של מצב preview (טיוטות, פעולות
//    כבויות) בלי רשת.
// 2. הדיאלוג האמיתי מול לקוחות ה-DB של משתמש הפיתוח המחובר (RLS מחזיר רק
//    את שלו) — אימות מסלול ה-RPC המלא.

import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { PortalView, PortalData } from '../PublicPortalPage';
import ClientPagePreviewDialog from './ClientPagePreviewDialog';

const FIXTURE: PortalData = {
  clientFirstName: 'נועה',
  firmName: 'משרד רו"ח בדיקה',
  branding: {},
  done: 2,
  total: 6,
  journeyStage: 'setup',
  items: [
    { bucket: 'action', key: 'docs', label: 'להעלות 3 מסמכים', sub: '1 מתוך 3 התקבלו',
      actionKind: 'portal', actionValue: 'step1', kind: 'documents', canUpload: true,
      checklist: [
        { key: 'd1', label: 'אישור ניהול חשבון בנק', done: true },
        { key: 'd2', label: 'דוח שנתי אחרון', done: false },
        { key: 'd3', label: 'טופס 106', done: false },
      ] },
    { bucket: 'action', key: 'custom_x', label: 'לאשר את נוהל העבודה', sub: 'שתי דקות',
      actionKind: 'portal', actionValue: 'step2', kind: 'custom', cta: 'מאשר/ת', draft: true,
      requirements: [
        { key: 'r1', kind: 'confirm', label: 'קראתי ואני מאשר/ת', done: false },
        { key: 'r2', kind: 'text', label: 'הערות (אם יש)', done: false },
      ] },
    { bucket: 'action', key: 'rep_sign', label: 'חתימה על ייפוי הכוח', sub: 'כדקה',
      actionKind: 'sign', actionValue: 'tok' },
    { bucket: 'done', key: 'quotation', label: 'הצעת המחיר אושרה' },
    { bucket: 'office', key: 'files_office', label: 'פתיחת התיקים ברשויות', sub: 'בטיפולנו', draft: true },
    { bucket: 'future', key: 'retainer_future', label: 'הרשאת התשלום החודשי', sub: 'תופיע כאן אחרי חיבור הפייפרלס' },
  ],
};

export default function TestPortalPreview() {
  const [clients, setClients] = useState<{ id: string; name: string }[]>([]);
  const [openId, setOpenId] = useState<string | null>(null);
  const [sessionReady, setSessionReady] = useState(false);

  useEffect(() => {
    const t = window.setInterval(async () => {
      const { data } = await supabase.auth.getSession();
      if (data.session) { setSessionReady(true); window.clearInterval(t); }
    }, 400);
    return () => window.clearInterval(t);
  }, []);

  useEffect(() => {
    if (!sessionReady) return;
    // משתמש הבדיקה חסום ברשימת המורשים ⇒ SELECT ישיר מחזיר ריק. ה-RPC של
    // התצוגה המקדימה הוא SECURITY DEFINER ולכן עובד — מוסרים לו מזהה בפרמטר:
    // ?test-portal-preview=<clientId>
    const explicit = new URLSearchParams(window.location.search).get('test-portal-preview');
    supabase.from('clients').select('id, first_name, last_name').limit(8)
      .then(({ data }) => {
        const fromDb = (data ?? []).map(c => ({
          id: c.id, name: `${c.first_name ?? ''} ${c.last_name ?? ''}`.trim() || c.id,
        }));
        setClients(explicit && !fromDb.some(c => c.id === explicit)
          ? [{ id: explicit, name: `לקוח ${explicit.slice(0, 8)}…` }, ...fromDb]
          : fromDb);
      });
  }, [sessionReady]);

  return (
    <div style={{ padding: '1rem', display: 'grid', gap: '1rem', maxWidth: '100vw', overflowX: 'hidden' }}>
      <h2 style={{ margin: 0 }}>בדיקת תצוגה מקדימה של הדף האישי</h2>

      <section>
        <h3>1 · PortalView על נתוני דמה — מצב preview (פעולות כבויות, טיוטות מסומנות)</h3>
        <div className="pivo-light" style={{ border: '1px solid #ccc', borderRadius: 8, overflow: 'hidden' }}>
          <PortalView data={FIXTURE} preview embed />
        </div>
      </section>

      <section>
        <h3>2 · הדיאלוג האמיתי — לקוחות ה-DB של משתמש הפיתוח</h3>
        {!sessionReady && <p>ממתין להתחברות…</p>}
        {sessionReady && clients.length === 0 && <p>למשתמש הזה אין לקוחות ב-DB.</p>}
        <div style={{ display: 'flex', gap: '.5rem', flexWrap: 'wrap' }}>
          {clients.map(c => (
            <button key={c.id} type="button" className="btn btn-sm btn-secondary"
              onClick={() => setOpenId(c.id)}>{c.name}</button>
          ))}
        </div>
      </section>

      {openId && (
        <ClientPagePreviewDialog
          clientId={openId}
          clientName={clients.find(c => c.id === openId)?.name ?? openId}
          onClose={() => setOpenId(null)}
        />
      )}
    </div>
  );
}

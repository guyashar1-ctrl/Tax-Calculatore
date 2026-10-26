// ─── «＋ חומר חדש» מכל עמוד בידע (26.10.2026) ────────────────────────────────────────────────
// ‼ ההדמיה המאושרת (25.10): שאלה, צילום מהקורס או חוזר נשמרים יחד עם המקום שבו עלו — הנושא/הסעיף/הכלי, שנת המס,
//   התחום וסוג המקור. אותו «מה אני לומד» (knowledge_inbox) — ההקשר נשמר בשדה ההערה, בלי טבלה חדשה.
// ‼ חומר חדש אינו כלל: הוא נכנס לעדכון הבא, ושם נבדק מול מקור רשמי ושנת מס (WORKING-AGREEMENT).

import { useState } from 'react';
import Modal from '../../../components/ui/Modal';
import { useToast } from '../../../components/ui/Toast';
import { DOMAINS, type DomainId } from '../../taxArea/areaModel';
import { addInbox, INBOX_CHANGED } from './askApi';

const SOURCE_KINDS = ['שאלה מהשטח', 'חומר מהקורס', 'חוזר או הוראת ביצוע', 'פסק דין', 'פרסום של רשות', 'מאמר מקצועי', 'אחר'] as const;
const YEARS = ['2025', '2026', 'ליום ההצהרה', 'לא תלוי שנה'] as const;

export interface MaterialContext { label: string; domain?: DomainId; year?: string; seed?: string }

/** ההערה שנשמרת עם החומר — שורה אחת של הקשר, ואחריה הטקסט. */
export function materialNote(ctx: { label: string; year: string; domainLabel?: string; kind: string }, text: string): string {
  const head = [`מתוך: ${ctx.label}`, `שנת מס: ${ctx.year}`, ctx.domainLabel ? `תחום: ${ctx.domainLabel}` : '', `סוג: ${ctx.kind}`].filter(Boolean).join(' · ');
  return text.trim() ? `${head}\n${text.trim()}` : head;
}

export default function AddMaterial({ context, onClose }: { context: MaterialContext; onClose: () => void }) {
  const { showToast } = useToast();
  const [title, setTitle] = useState(context.seed ?? '');
  const [text, setText] = useState('');
  const [year, setYear] = useState<string>(context.year && YEARS.includes(context.year as typeof YEARS[number]) ? context.year : YEARS[0]);
  const [domain, setDomain] = useState<DomainId | ''>(context.domain ?? '');
  const [kind, setKind] = useState<string>(SOURCE_KINDS[0]);
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const dirty = !!(text.trim() || files.length) || title.trim() !== (context.seed ?? '').trim();

  async function save() {
    const t = title.trim() || files[0]?.name.replace(/\.[^.]+$/, '') || '';
    if (t.length < 2 || busy) { setErr('כותרת — לפחות שתי אותיות'); return; }
    setBusy(true); setErr(null);
    const domainLabel = DOMAINS.find(d => d.id === domain)?.label;
    const r = await addInbox(t, files, materialNote({ label: context.label, year, domainLabel, kind }, text));
    setBusy(false);
    if (!r.ok) { setErr(`לא נשמר: ${r.error}`); return; }
    window.dispatchEvent(new Event(INBOX_CHANGED));
    showToast('נשמר ב«מה אני לומד» — ייבדק בעדכון הבא');
    onClose();
  }

  return (
    <Modal title="חומר חדש או שאלה" onClose={onClose} dirty={dirty} width={560}
      footer={<div className="ak-am-foot"><button type="button" className="btn btn-secondary" onClick={onClose}>ביטול</button><button type="button" className="btn btn-primary" onClick={() => void save()} disabled={busy} data-am-save>{busy ? 'שומר…' : 'לשמור לעדכון הבא'}</button></div>}>
      <div className="ak-am" data-add-material>
        <p className="ak-am-ctx"><span>מתוך</span><b>{context.label}</b></p>
        <label className="ak-am-f"><span>כותרת</span><input value={title} onChange={e => setTitle(e.target.value)} placeholder="למשל: ניכוי ארוחות בכנס מקצועי" data-am-title /></label>
        <label className="ak-am-f"><span>מה כתוב או מה השאלה</span><textarea rows={4} value={text} onChange={e => setText(e.target.value)} data-am-text /></label>
        <div className="ak-am-row">
          <label className="ak-am-f"><span>שנת מס</span><select value={year} onChange={e => setYear(e.target.value)}>{YEARS.map(y => <option key={y}>{y}</option>)}</select></label>
          <label className="ak-am-f"><span>תחום</span><select value={domain} onChange={e => setDomain(e.target.value as DomainId | '')}><option value="">לא ידוע</option>{DOMAINS.map(d => <option key={d.id} value={d.id}>{d.label}</option>)}</select></label>
          <label className="ak-am-f"><span>סוג</span><select value={kind} onChange={e => setKind(e.target.value)}>{SOURCE_KINDS.map(k => <option key={k}>{k}</option>)}</select></label>
        </div>
        <label className="ak-am-f"><span>קבצים (לא חובה)</span><input type="file" multiple onChange={e => setFiles(Array.from(e.target.files ?? []))} /></label>
        <p className="kn-xs kn-muted">החומר לא הופך לכלל לפני שנבדק מול מקור רשמי ושנת המס.</p>
        {err && <p className="kn-xs ak-am-err" role="alert">{err}</p>}
      </div>
    </Modal>
  );
}

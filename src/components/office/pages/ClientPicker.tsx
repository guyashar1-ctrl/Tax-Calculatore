// בחירת לקוח — ל«שליחה ללקוח» מספריית המסמכים. חיפוש לפי שם, עסק או ת.ז.
// ‼ הבחירה רק פותחת את כרטיס הלקוח עם חלון השליחה — שום דבר לא נשלח כאן.
import { useMemo, useState } from 'react';
import type { Client } from '../../../types';
import Modal from '../../ui/Modal';

export default function ClientPicker({ clients, title, onPick, onClose }: {
  clients: Client[];
  title: string;
  onPick: (clientId: string) => void;
  onClose: () => void;
}) {
  const [q, setQ] = useState('');
  const list = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const named = clients
      .map(c => ({ c, name: `${c.firstName ?? ''} ${c.lastName ?? ''}`.trim() }))
      .filter(x => x.name || x.c.businessName);
    const hits = needle
      ? named.filter(x => [x.name, x.c.businessName, x.c.idNumber].filter(Boolean).join(' ').toLowerCase().includes(needle))
      : named;
    return hits.sort((a, b) => a.name.localeCompare(b.name, 'he')).slice(0, 40);
  }, [clients, q]);

  return (
    <Modal title={title} onClose={onClose} width={480}
      footer={<button type="button" className="ui-btn ui-btn-ghost" onClick={onClose}>ביטול</button>}>
      <input className="of-search of-picker-search" value={q} onChange={e => setQ(e.target.value)} data-autofocus
        placeholder="חיפוש לקוח לפי שם, עסק או ת.ז." aria-label="חיפוש לקוח" />
      {list.length === 0 ? (
        <div className="of-empty">לא נמצא לקוח.</div>
      ) : (
        <ul className="of-picker" role="list">
          {list.map(({ c, name }) => (
            <li key={c.id}>
              <button type="button" className="of-picker-item" onClick={() => onPick(c.id)}>
                <span className="of-picker-name">{name || c.businessName}</span>
                {c.businessName && name && <span className="of-picker-sub">{c.businessName}</span>}
              </button>
            </li>
          ))}
        </ul>
      )}
      <p className="of-muted" style={{ margin: '10px 0 0' }}>ייפתח אצלו חלון השליחה, עם הקובץ כבר בפנים.</p>
    </Modal>
  );
}

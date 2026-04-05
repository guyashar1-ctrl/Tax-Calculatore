import { useState } from 'react';
import { Client, IncomeTaxType, NIType } from '../types';

const IT_LABELS: Record<IncomeTaxType, string> = {
  employee: 'שכיר',
  selfEmployed: 'עצמאי',
  both: 'שכיר + עצמאי',
  rentalOnly: 'שכירות',
  other: 'אחר',
};

const IT_BADGE: Record<IncomeTaxType, string> = {
  employee: 'badge-blue',
  selfEmployed: 'badge-green',
  both: 'badge-purple',
  rentalOnly: 'badge-orange',
  other: 'badge-gray',
};

const NI_LABELS: Record<NIType, string> = {
  employee: 'שכיר (ב"ל)',
  selfEmployed: 'עצמאי (ב"ל)',
  nonQualifying: 'שאינו עונה להגדרה',
  employeeAndSE: 'שכיר+עצמאי (ב"ל)',
  passive: 'פסיבי (ב"ל)',
  pensioner: 'פנסיונר',
};

interface Props {
  clients: Client[];
  onSelect: (id: string) => void;
  onAdd: () => void;
  onDelete: (id: string) => void;
  onLoadSamples: () => void;
}

export default function ClientList({ clients, onSelect, onAdd, onDelete, onLoadSamples }: Props) {
  const [search, setSearch] = useState('');

  const filtered = clients.filter(c => {
    const q = search.toLowerCase();
    return (
      c.firstName.toLowerCase().includes(q) ||
      c.lastName.toLowerCase().includes(q) ||
      c.idNumber.includes(q) ||
      c.phone.includes(q) ||
      c.city?.toLowerCase().includes(q)
    );
  });

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '.75rem' }}>
        <div>
          <h1 style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--gray-900)' }}>לקוחות</h1>
          <p style={{ fontSize: '.875rem', color: 'var(--gray-500)', marginTop: 2 }}>{clients.length} לקוחות במערכת</p>
        </div>
        <div style={{ display: 'flex', gap: '.5rem', flexWrap: 'wrap' }}>
          {clients.length === 0 && (
            <button className="btn btn-secondary" onClick={onLoadSamples}>
              📋 טען לקוחות לדוגמה
            </button>
          )}
          <button className="btn btn-primary btn-lg" onClick={onAdd}>＋ לקוח חדש</button>
        </div>
      </div>

      <div className="search-bar">
        <div className="search-input-wrap">
          <span className="search-icon">🔍</span>
          <input
            type="text"
            placeholder="חיפוש לפי שם, ת.ז., עיר, טלפון..."
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
        {search && <span style={{ fontSize: '.875rem', color: 'var(--gray-500)' }}>{filtered.length} תוצאות</span>}
      </div>

      {clients.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-icon">👥</div>
          <div className="empty-state-title">אין לקוחות עדיין</div>
          <div className="empty-state-desc">הוסף לקוח חדש או טען לקוחות לדוגמה</div>
          <br />
          <div style={{ display: 'flex', gap: '.75rem', justifyContent: 'center', flexWrap: 'wrap' }}>
            <button className="btn btn-secondary" onClick={onLoadSamples}>📋 טען לקוחות לדוגמה</button>
            <button className="btn btn-primary" onClick={onAdd}>＋ לקוח חדש</button>
          </div>
        </div>
      ) : filtered.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-icon">🔍</div>
          <div className="empty-state-title">לא נמצאו תוצאות</div>
        </div>
      ) : (
        <div className="client-grid">
          {filtered.map(client => (
            <ClientCard
              key={client.id}
              client={client}
              onSelect={() => onSelect(client.id)}
              onDelete={() => { if (confirm(`למחוק את ${client.firstName} ${client.lastName}?`)) onDelete(client.id); }}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function ClientCard({ client, onSelect, onDelete }: { client: Client; onSelect: () => void; onDelete: () => void }) {
  const initials = `${client.firstName.charAt(0)}${client.lastName.charAt(0)}`.toUpperCase();

  return (
    <div className="card client-card" onClick={onSelect}>
      <div className="card-body">
        <div className="client-card-header">
          <div style={{ display: 'flex', gap: '.75rem', alignItems: 'flex-start' }}>
            <div className="client-avatar">{initials || '?'}</div>
            <div>
              <div className="client-name">{client.firstName} {client.lastName}</div>
              <div className="client-id">
                ת.ז. {client.idNumber || '—'}
                {client.city && <span> · {client.city}</span>}
              </div>
            </div>
          </div>
          <button className="btn btn-ghost btn-icon" onClick={e => { e.stopPropagation(); onDelete(); }} title="מחק">🗑️</button>
        </div>

        <div className="client-meta">
          <span className={`badge ${IT_BADGE[client.incomeTaxType]}`}>{IT_LABELS[client.incomeTaxType]}</span>
          {client.niType !== 'employee' && client.incomeTaxType !== 'employee' && (
            <span className="badge badge-gray" style={{ fontSize: '.7rem' }}>{NI_LABELS[client.niType]}</span>
          )}
          {client.vatStatus === 'authorizedDealer' && <span className="badge badge-green">עוסק מורשה</span>}
          {client.vatStatus === 'exemptDealer' && <span className="badge badge-gray">עוסק פטור</span>}
          {client.hasTaxCoordination && <span className="badge badge-orange">תיאום מס</span>}
          {client.children.length > 0 && <span className="badge badge-gray">{client.children.length} ילדים</span>}
          {client.isNewImmigrant && <span className="badge badge-blue">עולה חדש</span>}
          {client.qualifyingSettlementId && <span className="badge badge-purple">ישוב מזכה</span>}
          {client.disabilityPercentage > 0 && <span className="badge badge-orange">נכות {client.disabilityPercentage}%</span>}
        </div>

        {(client.phone || client.email) && (
          <div style={{ marginTop: '.75rem', fontSize: '.8125rem', color: 'var(--gray-500)' }}>
            {client.phone && <span>📱 {client.phone}</span>}
            {client.phone && client.email && <span style={{ margin: '0 .5rem' }}>·</span>}
            {client.email && <span>✉️ {client.email}</span>}
          </div>
        )}

        <div className="client-actions" onClick={e => e.stopPropagation()}>
          <button className="btn btn-secondary btn-sm" style={{ flex: 1 }} onClick={onSelect}>✏️ עריכה / פרטים</button>
        </div>
      </div>
    </div>
  );
}

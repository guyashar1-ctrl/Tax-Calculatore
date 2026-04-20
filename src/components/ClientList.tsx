import { useState, useMemo } from 'react';
import {
  Client,
  IncomeTaxType,
  NIType,
  RepresentationRequest,
  RepresentationStatus,
  REPRESENTATION_STATUS_LABELS,
  REPRESENTATION_STATUS_BADGE,
} from '../types';

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

type SortField = 'name' | 'idNumber' | 'city' | 'type' | 'phone' | 'email' | 'status' | 'createdAt';
type SortDir = 'asc' | 'desc';

interface Props {
  clients: Client[];
  requests: RepresentationRequest[];
  onSelect: (id: string) => void;
  onAdd: () => void;
  onDelete: (id: string) => void;
  onLoadSamples: () => void;
  onAddRequest: () => void;
  onSelectRequest: (id: string) => void;
}

const STATUS_ORDER: Record<RepresentationStatus, number> = {
  awaiting_accountant: 0,   // דורש התייחסות שלי — דחוף ביותר
  pending_fill: 1,
  awaiting_authorities: 2,
  active: 3,
};

type StatusFilter = 'all' | RepresentationStatus;

const STATUS_FILTERS: { id: StatusFilter; label: string; }[] = [
  { id: 'all', label: 'הכל' },
  { id: 'awaiting_accountant', label: 'דורש התייחסות' },
  { id: 'pending_fill', label: 'ממתין למילוי' },
  { id: 'awaiting_authorities', label: 'ממתין לאישור' },
  { id: 'active', label: 'מיוצג פעיל' },
];

export default function ClientList({
  clients,
  requests,
  onSelect,
  onAdd,
  onDelete,
  onLoadSamples,
  onAddRequest,
  onSelectRequest,
}: Props) {
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [search, setSearch] = useState('');
  const [sortField, setSortField] = useState<SortField>('status');
  const [sortDir, setSortDir] = useState<SortDir>('asc');

  const getStatus = (c: Client): RepresentationStatus => c.representationStatus ?? 'active';

  function toggleSort(field: SortField) {
    if (sortField === field) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDir('asc');
    }
  }

  const filtered = useMemo(() => {
    let list = clients.filter(c => {
      // status filter
      if (statusFilter !== 'all' && getStatus(c) !== statusFilter) return false;
      // search
      const q = search.toLowerCase();
      if (!q) return true;
      return (
        c.firstName.toLowerCase().includes(q) ||
        c.lastName.toLowerCase().includes(q) ||
        c.idNumber.includes(q) ||
        c.phone.includes(q) ||
        c.email?.toLowerCase().includes(q) ||
        c.city?.toLowerCase().includes(q)
      );
    });

    list.sort((a, b) => {
      let cmp = 0;
      switch (sortField) {
        case 'name':
          cmp = `${a.lastName} ${a.firstName}`.localeCompare(`${b.lastName} ${b.firstName}`, 'he');
          break;
        case 'idNumber':
          cmp = a.idNumber.localeCompare(b.idNumber);
          break;
        case 'city':
          cmp = (a.city || '').localeCompare(b.city || '', 'he');
          break;
        case 'type':
          cmp = IT_LABELS[a.incomeTaxType].localeCompare(IT_LABELS[b.incomeTaxType], 'he');
          break;
        case 'phone':
          cmp = (a.phone || '').localeCompare(b.phone || '');
          break;
        case 'email':
          cmp = (a.email || '').localeCompare(b.email || '');
          break;
        case 'status':
          cmp = STATUS_ORDER[getStatus(a)] - STATUS_ORDER[getStatus(b)];
          break;
        case 'createdAt':
          cmp = new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
          break;
      }
      return sortDir === 'asc' ? cmp : -cmp;
    });

    return list;
  }, [clients, search, sortField, sortDir, statusFilter]);

  const sortIcon = (field: SortField) => {
    if (sortField !== field) return <span className="sort-icon inactive">⇅</span>;
    return <span className="sort-icon active">{sortDir === 'asc' ? '▲' : '▼'}</span>;
  };

  // ספירות לכל סטטוס
  const statusCounts = useMemo(() => {
    const counts: Record<StatusFilter, number> = {
      all: clients.length,
      pending_fill: 0,
      awaiting_accountant: 0,
      awaiting_authorities: 0,
      active: 0,
    };
    for (const c of clients) {
      counts[getStatus(c)]++;
    }
    return counts;
  }, [clients]);

  function handleRowClick(c: Client) {
    const status = getStatus(c);
    if (status !== 'active' && c.representationRequestId) {
      // נווט למסך הסקירה של הבקשה
      onSelectRequest(c.representationRequestId);
    } else {
      onSelect(c.id);
    }
  }

  // unused but kept for type compatibility
  void requests;

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem', flexWrap: 'wrap', gap: '.75rem' }}>
        <div>
          <h1 style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--gray-900)' }}>לקוחות</h1>
          <p style={{ fontSize: '.875rem', color: 'var(--gray-500)', marginTop: 2 }}>
            {clients.length} לקוחות במערכת
          </p>
        </div>
        <div style={{ display: 'flex', gap: '.5rem', flexWrap: 'wrap' }}>
          <button className="btn btn-secondary" onClick={onLoadSamples}>טען לקוחות לדוגמה</button>
          <button className="btn btn-secondary" onClick={onAddRequest}>📨 בקשת ייצוג</button>
          <button className="btn btn-primary btn-lg" onClick={onAdd}>+ לקוח חדש</button>
        </div>
      </div>

      {/* Filter chips */}
      <div className="tabs">
        {STATUS_FILTERS.map(f => {
          const count = statusCounts[f.id];
          const active = statusFilter === f.id;
          return (
            <button
              key={f.id}
              className={`tab ${active ? 'active' : ''}`}
              onClick={() => setStatusFilter(f.id)}
            >
              {f.label}
              {count > 0 && (
                <span
                  style={{
                    marginRight: 6,
                    background: active ? 'var(--blue-light)' : 'var(--gray-200)',
                    color: active ? 'var(--blue)' : 'var(--gray-600)',
                    padding: '.05rem .4rem',
                    borderRadius: 999,
                    fontSize: '.7rem',
                    fontWeight: 700,
                  }}
                >
                  {count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      <div className="search-bar">
        <div className="search-input-wrap">
          <span className="search-icon">&#x1F50D;</span>
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
          <div className="empty-state-icon">&#x1F465;</div>
          <div className="empty-state-title">אין לקוחות עדיין</div>
          <div className="empty-state-desc">הוסף לקוח חדש, צור בקשת ייצוג, או טען לקוחות לדוגמה</div>
          <br />
          <div style={{ display: 'flex', gap: '.75rem', justifyContent: 'center', flexWrap: 'wrap' }}>
            <button className="btn btn-secondary" onClick={onLoadSamples}>טען לקוחות לדוגמה</button>
            <button className="btn btn-secondary" onClick={onAddRequest}>📨 בקשת ייצוג</button>
            <button className="btn btn-primary" onClick={onAdd}>+ לקוח חדש</button>
          </div>
        </div>
      ) : filtered.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-icon">&#x1F50D;</div>
          <div className="empty-state-title">לא נמצאו תוצאות</div>
        </div>
      ) : (
        <div className="card" style={{ overflow: 'hidden' }}>
          <div className="table-wrap">
            <table className="client-table">
              <thead>
                <tr>
                  <th className="th-sortable" onClick={() => toggleSort('status')} style={{ width: 160 }}>
                    <span>סטטוס</span> {sortIcon('status')}
                  </th>
                  <th className="th-sortable" onClick={() => toggleSort('name')}>
                    <span>שם</span> {sortIcon('name')}
                  </th>
                  <th className="th-sortable" onClick={() => toggleSort('idNumber')}>
                    <span>ת.ז.</span> {sortIcon('idNumber')}
                  </th>
                  <th className="th-sortable hide-mobile" onClick={() => toggleSort('city')}>
                    <span>עיר</span> {sortIcon('city')}
                  </th>
                  <th className="th-sortable hide-mobile" onClick={() => toggleSort('type')}>
                    <span>סיווג</span> {sortIcon('type')}
                  </th>
                  <th className="th-sortable hide-mobile" onClick={() => toggleSort('phone')}>
                    <span>טלפון</span> {sortIcon('phone')}
                  </th>
                  <th className="th-sortable hide-mobile" onClick={() => toggleSort('email')}>
                    <span>אימייל</span> {sortIcon('email')}
                  </th>
                  <th style={{ width: 80 }}>פעולות</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(client => {
                  const status = getStatus(client);
                  const fullName = `${client.firstName} ${client.lastName}`.trim() || '(ללא שם)';
                  return (
                    <tr key={client.id} className="client-row" onClick={() => handleRowClick(client)}>
                      <td>
                        <span className={`badge ${REPRESENTATION_STATUS_BADGE[status]}`} style={{ fontSize: '.7rem', whiteSpace: 'nowrap' }}>
                          {REPRESENTATION_STATUS_LABELS[status]}
                        </span>
                      </td>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '.6rem' }}>
                          <div className="client-avatar-sm">
                            {`${client.firstName.charAt(0) || '?'}${client.lastName.charAt(0) || ''}`}
                          </div>
                          <div>
                            <div className="client-table-name">{fullName}</div>
                            <div className="client-table-badges">
                              {client.isNewImmigrant && <span className="badge badge-blue" style={{ fontSize: '.65rem', padding: '.1rem .4rem' }}>עולה חדש</span>}
                              {client.qualifyingSettlementId && <span className="badge badge-purple" style={{ fontSize: '.65rem', padding: '.1rem .4rem' }}>ישוב מזכה</span>}
                              {client.disabilityPercentage > 0 && <span className="badge badge-orange" style={{ fontSize: '.65rem', padding: '.1rem .4rem' }}>נכות {client.disabilityPercentage}%</span>}
                              {client.hasTaxCoordination && <span className="badge badge-orange" style={{ fontSize: '.65rem', padding: '.1rem .4rem' }}>תיאום מס</span>}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="mono-text">{client.idNumber || '—'}</td>
                      <td className="hide-mobile">{client.city || '—'}</td>
                      <td className="hide-mobile">
                        <span className={`badge ${IT_BADGE[client.incomeTaxType]}`} style={{ fontSize: '.75rem' }}>
                          {IT_LABELS[client.incomeTaxType]}
                        </span>
                        {client.vatStatus === 'authorizedDealer' && (
                          <span className="badge badge-green" style={{ fontSize: '.65rem', marginRight: '.3rem', padding: '.1rem .4rem' }}>מע"מ</span>
                        )}
                        {client.niType !== client.incomeTaxType && client.niType !== 'employee' && (
                          <div style={{ fontSize: '.7rem', color: 'var(--gray-500)', marginTop: 2 }}>{NI_LABELS[client.niType]}</div>
                        )}
                      </td>
                      <td className="mono-text hide-mobile" dir="ltr" style={{ textAlign: 'right' }}>{client.phone || '—'}</td>
                      <td className="hide-mobile" style={{ fontSize: '.8125rem' }}>{client.email || '—'}</td>
                      <td onClick={e => e.stopPropagation()}>
                        <div style={{ display: 'flex', gap: '.25rem' }}>
                          <button className="btn btn-ghost btn-icon" onClick={() => handleRowClick(client)} title="פתח">&#x270F;&#xFE0F;</button>
                          <button
                            className="btn btn-ghost btn-icon"
                            onClick={() => { if (confirm(`למחוק את ${fullName}?`)) onDelete(client.id); }}
                            title="מחיקה"
                            style={{ color: 'var(--red)' }}
                          >&#x1F5D1;&#xFE0F;</button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

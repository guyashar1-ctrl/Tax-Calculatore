import { useState, useMemo, useEffect } from 'react';
import {
  Client,
  IncomeTaxType,
  NIType,
  RepresentationRequest,
  RepresentationStatus,
  REPRESENTATION_STATUS_LABELS,
  REPRESENTATION_STATUS_BADGE,
  Task,
  VATStatus,
} from '../types';
import { ShaamStatus } from '../types/clientWorkspace';
import { useEmployees } from '../hooks/useEmployees';
import { useDocumentDB } from '../hooks/useIndexedDB';
import {
  getClientOpenTasks,
  getUpcomingDebts,
  isWithholdingExpired,
} from '../utils/clientDerived';

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
  employee: 'שכיר',
  selfEmployed: 'עצמאי',
  nonQualifying: 'לא עונה',
  employeeAndSE: 'שכיר+עצמאי',
  passive: 'פסיבי',
  pensioner: 'פנסיונר',
};

const VAT_LABELS: Record<VATStatus, string> = {
  authorizedDealer: 'עוסק מורשה',
  exemptDealer: 'עוסק פטור',
  none: 'פטור',     // אם אין רישום מע"מ — מוצג כ"פטור" לפי הוראת המשתמש
};

const VAT_BADGE: Record<VATStatus, string> = {
  authorizedDealer: 'badge-green',
  exemptDealer: 'badge-blue',
  none: 'badge-gray',
};

const NI_BADGE: Record<NIType, string> = {
  employee: 'badge-blue',
  selfEmployed: 'badge-green',
  employeeAndSE: 'badge-purple',
  nonQualifying: 'badge-gray',
  passive: 'badge-gray',
  pensioner: 'badge-orange',
};

type SortField = 'name' | 'idNumber' | 'city' | 'phone' | 'email' | 'status' | 'assignee' | 'tasks';
type SortDir = 'asc' | 'desc';

interface Props {
  clients: Client[];
  requests: RepresentationRequest[];
  tasks: Task[];
  onSelect: (id: string) => void;
  onAdd: () => void;
  onDelete: (id: string) => void;
  onLoadSamples: () => void;
  onAddRequest: () => void;
  onSelectRequest: (id: string) => void;
}

const STATUS_ORDER: Record<RepresentationStatus, number> = {
  awaiting_accountant: 0,
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
  tasks,
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

  // ── פילטרים מורחבים ──
  const [employeeFilter, setEmployeeFilter] = useState<string>('all');
  const [vatFilter, setVatFilter] = useState<'all' | VATStatus>('all');
  const [itFilter, setItFilter] = useState<'all' | IncomeTaxType>('all');
  const [niFilter, setNiFilter] = useState<'all' | NIType>('all');
  const [shaamFilter, setShaamFilter] = useState<'all' | ShaamStatus>('all');
  const [openTasksOnly, setOpenTasksOnly] = useState(false);
  const [upcomingDebtsOnly, setUpcomingDebtsOnly] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);

  const { employees, findEmployee } = useEmployees();

  const getStatus = (c: Client): RepresentationStatus => c.representationStatus ?? 'active';

  function toggleSort(field: SortField) {
    if (sortField === field) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDir('asc');
    }
  }

  // ── מטריקות לכל לקוח (לעמודות + פילטרים) ──
  const metricsByClient = useMemo(() => {
    const map = new Map<string, {
      openTasksCount: number;
      upcomingDebtsCount: number;
      withholdingExpired: boolean;
    }>();
    for (const c of clients) {
      map.set(c.id, {
        openTasksCount: getClientOpenTasks(c.id, tasks).length,
        upcomingDebtsCount: getUpcomingDebts(c.id, tasks).length,
        withholdingExpired: isWithholdingExpired(c).expired,
      });
    }
    return map;
  }, [clients, tasks]);

  // איש הקשר הראשי — אם תוסף מסומן ראשי משתמשים בו, אחרת הנישום עצמו.
  function getPrimaryContact(c: Client): { name: string; phone: string; email: string; isClient: boolean } {
    const primary = (c.additionalContacts ?? []).find(ac => ac.isPrimary);
    if (primary) {
      return {
        name: primary.name,
        phone: primary.phone || '',
        email: primary.email || '',
        isClient: false,
      };
    }
    return {
      name: `${c.firstName} ${c.lastName}`.trim(),
      phone: c.phone || '',
      email: c.email || '',
      isClient: true,
    };
  }

  const filtered = useMemo(() => {
    let list = clients.filter(c => {
      if (statusFilter !== 'all' && getStatus(c) !== statusFilter) return false;
      if (employeeFilter !== 'all' && c.assignedAccountantId !== employeeFilter) return false;
      if (vatFilter !== 'all' && c.vatStatus !== vatFilter) return false;
      if (itFilter !== 'all' && c.incomeTaxType !== itFilter) return false;
      if (niFilter !== 'all' && c.niType !== niFilter) return false;
      if (shaamFilter !== 'all' && (c.shaamStatus ?? 'unknown') !== shaamFilter) return false;

      const m = metricsByClient.get(c.id);
      if (openTasksOnly && (!m || m.openTasksCount === 0)) return false;
      if (upcomingDebtsOnly && (!m || m.upcomingDebtsCount === 0)) return false;

      const q = search.toLowerCase().trim();
      if (!q) return true;
      const pc = getPrimaryContact(c);
      return (
        c.firstName.toLowerCase().includes(q) ||
        c.lastName.toLowerCase().includes(q) ||
        c.idNumber.includes(q) ||
        (c.phone || '').includes(q) ||
        (c.email || '').toLowerCase().includes(q) ||
        (c.city || '').toLowerCase().includes(q) ||
        pc.phone.includes(q) ||
        pc.email.toLowerCase().includes(q) ||
        pc.name.toLowerCase().includes(q)
      );
    });

    list.sort((a, b) => {
      let cmp = 0;
      const ma = metricsByClient.get(a.id);
      const mb = metricsByClient.get(b.id);
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
        case 'phone':
          cmp = getPrimaryContact(a).phone.localeCompare(getPrimaryContact(b).phone);
          break;
        case 'email':
          cmp = getPrimaryContact(a).email.localeCompare(getPrimaryContact(b).email);
          break;
        case 'status':
          cmp = STATUS_ORDER[getStatus(a)] - STATUS_ORDER[getStatus(b)];
          break;
        case 'assignee':
          cmp = (findEmployee(a.assignedAccountantId)?.name || '').localeCompare(
            findEmployee(b.assignedAccountantId)?.name || '', 'he');
          break;
        case 'tasks':
          cmp = (ma?.openTasksCount ?? 0) - (mb?.openTasksCount ?? 0);
          break;
      }
      return sortDir === 'asc' ? cmp : -cmp;
    });

    return list;
  }, [
    clients, search, sortField, sortDir, statusFilter,
    employeeFilter, vatFilter, itFilter, niFilter, shaamFilter,
    openTasksOnly, upcomingDebtsOnly, metricsByClient,
  ]);

  const sortIcon = (field: SortField) => {
    if (sortField !== field) return <span className="sort-icon inactive">⇅</span>;
    return <span className="sort-icon active">{sortDir === 'asc' ? '▲' : '▼'}</span>;
  };

  const statusCounts = useMemo(() => {
    const counts: Record<StatusFilter, number> = {
      all: clients.length,
      pending_fill: 0,
      awaiting_accountant: 0,
      awaiting_authorities: 0,
      active: 0,
    };
    for (const c of clients) counts[getStatus(c)]++;
    return counts;
  }, [clients]);

  function handleRowClick(c: Client) {
    const status = getStatus(c);
    if (status !== 'active' && c.representationRequestId) {
      onSelectRequest(c.representationRequestId);
    } else {
      onSelect(c.id);
    }
  }

  void requests;

  const activeAdvancedCount =
    (employeeFilter !== 'all' ? 1 : 0) +
    (vatFilter !== 'all' ? 1 : 0) +
    (itFilter !== 'all' ? 1 : 0) +
    (niFilter !== 'all' ? 1 : 0) +
    (shaamFilter !== 'all' ? 1 : 0) +
    (openTasksOnly ? 1 : 0) +
    (upcomingDebtsOnly ? 1 : 0);

  function clearAdvanced() {
    setEmployeeFilter('all');
    setVatFilter('all');
    setItFilter('all');
    setNiFilter('all');
    setShaamFilter('all');
    setOpenTasksOnly(false);
    setUpcomingDebtsOnly(false);
  }

  return (
    <div>
      <div className="cl-list-header">
        <div>
          <h1 className="cl-list-title">לקוחות</h1>
          <p className="cl-list-sub">{clients.length} לקוחות במערכת{filtered.length !== clients.length ? ` · ${filtered.length} מסוננים` : ''}</p>
        </div>
        <div style={{ display: 'flex', gap: '.5rem', flexWrap: 'wrap' }}>
          <button className="btn btn-secondary" onClick={onLoadSamples}>טען לקוחות לדוגמה</button>
          <button className="btn btn-secondary" onClick={onAddRequest}>📨 בקשת ייצוג</button>
          <button className="btn btn-primary btn-lg" onClick={onAdd}>+ לקוח חדש</button>
        </div>
      </div>

      {/* Status chips */}
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
                <span className={`tab-count ${active ? 'active' : ''}`}>{count}</span>
              )}
            </button>
          );
        })}
      </div>

      {/* Search + advanced toggle */}
      <div className="cl-search-row">
        <div className="search-input-wrap" style={{ flex: 1 }}>
          <span className="search-icon">🔍</span>
          <input
            type="text"
            placeholder="חיפוש לפי שם, ת.ז., עיר, טלפון, אימייל..."
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
        <button
          className={`btn ${showAdvanced || activeAdvancedCount > 0 ? 'btn-primary' : 'btn-secondary'}`}
          onClick={() => setShowAdvanced(s => !s)}
        >
          🎯 פילטרים מתקדמים{activeAdvancedCount > 0 ? ` (${activeAdvancedCount})` : ''}
        </button>
        {activeAdvancedCount > 0 && (
          <button className="btn btn-ghost btn-sm" onClick={clearAdvanced}>נקה</button>
        )}
      </div>

      {showAdvanced && (
        <div className="cl-advanced">
          <div className="cl-adv-row">
            <label>עובד מטפל
              <select value={employeeFilter} onChange={e => setEmployeeFilter(e.target.value)}>
                <option value="all">הכל</option>
                {employees.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
              </select>
            </label>
            <label>מע״מ
              <select value={vatFilter} onChange={e => setVatFilter(e.target.value as 'all' | VATStatus)}>
                <option value="all">הכל</option>
                <option value="authorizedDealer">עוסק מורשה</option>
                <option value="exemptDealer">עוסק פטור</option>
                <option value="none">אין</option>
              </select>
            </label>
            <label>מס הכנסה
              <select value={itFilter} onChange={e => setItFilter(e.target.value as 'all' | IncomeTaxType)}>
                <option value="all">הכל</option>
                <option value="employee">שכיר</option>
                <option value="selfEmployed">עצמאי</option>
                <option value="both">שכיר + עצמאי</option>
                <option value="rentalOnly">שכירות</option>
                <option value="other">אחר</option>
              </select>
            </label>
            <label>ביטוח לאומי
              <select value={niFilter} onChange={e => setNiFilter(e.target.value as 'all' | NIType)}>
                <option value="all">הכל</option>
                <option value="employee">שכיר</option>
                <option value="selfEmployed">עצמאי</option>
                <option value="employeeAndSE">שכיר+עצמאי</option>
                <option value="nonQualifying">לא עונה להגדרה</option>
                <option value="passive">פסיבי</option>
                <option value="pensioner">פנסיונר</option>
              </select>
            </label>
            <label>הרשאת שע״ם
              <select value={shaamFilter} onChange={e => setShaamFilter(e.target.value as 'all' | ShaamStatus)}>
                <option value="all">הכל</option>
                <option value="active">פעילה</option>
                <option value="inactive">לא פעילה</option>
                <option value="pending">בטיפול</option>
                <option value="unknown">לא ידוע</option>
              </select>
            </label>
          </div>
          <div className="cl-adv-toggles">
            <label className="checkbox-row">
              <input type="checkbox" checked={openTasksOnly} onChange={e => setOpenTasksOnly(e.target.checked)} />
              משימות פתוחות
            </label>
            <label className="checkbox-row">
              <input type="checkbox" checked={upcomingDebtsOnly} onChange={e => setUpcomingDebtsOnly(e.target.checked)} />
              חובות קרובים (21 יום)
            </label>
          </div>
        </div>
      )}

      {clients.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-icon">👥</div>
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
          <div className="empty-state-icon">🔍</div>
          <div className="empty-state-title">לא נמצאו תוצאות</div>
        </div>
      ) : (
        <div className="card" style={{ overflow: 'hidden' }}>
          <div className="table-wrap">
            <table className="client-table client-table-dense">
              <thead>
                <tr>
                  <th className="th-sortable" onClick={() => toggleSort('name')}>
                    <span>שם</span> {sortIcon('name')}
                  </th>
                  <th className="th-sortable" onClick={() => toggleSort('idNumber')}>
                    <span>ת.ז.</span> {sortIcon('idNumber')}
                  </th>
                  <th className="th-sortable hide-mobile" onClick={() => toggleSort('city')}>
                    <span>עיר</span> {sortIcon('city')}
                  </th>
                  <th className="th-sortable hide-mobile" onClick={() => toggleSort('phone')}>
                    <span>טלפון</span> {sortIcon('phone')}
                  </th>
                  <th className="th-sortable hide-mobile" onClick={() => toggleSort('email')}>
                    <span>אימייל</span> {sortIcon('email')}
                  </th>
                  <th className="hide-mobile">
                    <span>סטטוסי מס</span>
                  </th>
                  <th className="th-sortable hide-mobile" onClick={() => toggleSort('assignee')}>
                    <span>מטפל</span> {sortIcon('assignee')}
                  </th>
                  <th className="th-sortable" onClick={() => toggleSort('tasks')} style={{ width: 80 }}>
                    <span>משימות</span> {sortIcon('tasks')}
                  </th>
                  <th className="hide-mobile" style={{ width: 60 }}>שע״ם</th>
                  <th style={{ width: 60 }}></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(client => {
                  const status = getStatus(client);
                  const fullName = `${client.firstName} ${client.lastName}`.trim() || '(ללא שם)';
                  const m = metricsByClient.get(client.id);
                  const employee = findEmployee(client.assignedAccountantId);
                  const repBadgeForNonActive = status !== 'active';
                  const pc = getPrimaryContact(client);
                  // אם הראשי הוא לא הנישום, נציג שם של הראשי כדי שגיא יבין את מי הוא רואה
                  const primaryNote = !pc.isClient ? pc.name : '';

                  return (
                    <tr key={client.id} className="client-row" onClick={() => handleRowClick(client)}>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '.6rem' }}>
                          <div className="client-avatar-sm">
                            {`${client.firstName.charAt(0) || '?'}${client.lastName.charAt(0) || ''}`}
                          </div>
                          <div>
                            <div className="client-table-name">{fullName}</div>
                            <div className="client-table-badges">
                              {repBadgeForNonActive && (
                                <span className={`badge ${REPRESENTATION_STATUS_BADGE[status]}`} style={{ fontSize: '.65rem', padding: '.05rem .35rem' }}>
                                  {REPRESENTATION_STATUS_LABELS[status]}
                                </span>
                              )}
                              {client.qualifyingSettlementId && <span className="badge badge-purple cl-mini-badge">ישוב מזכה</span>}
                              {client.disabilityPercentage > 0 && <span className="badge badge-orange cl-mini-badge">נכות {client.disabilityPercentage}%</span>}
                              {client.isNewImmigrant && <span className="badge badge-blue cl-mini-badge">עולה</span>}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="mono-text">{client.idNumber || '—'}</td>
                      <td className="hide-mobile">{client.city || '—'}</td>
                      <td className="mono-text hide-mobile" dir="ltr" style={{ textAlign: 'right' }}>
                        {pc.phone ? (
                          <span title={primaryNote ? `איש קשר ראשי: ${primaryNote}` : ''}>
                            {pc.phone}
                            {primaryNote && <span className="cl-primary-mark" title={`איש קשר ראשי: ${primaryNote}`}>🔑</span>}
                          </span>
                        ) : '—'}
                      </td>
                      <td className="mono-text hide-mobile" dir="ltr" style={{ textAlign: 'right' }}>
                        {pc.email ? (
                          <span title={primaryNote ? `איש קשר ראשי: ${primaryNote}` : ''}>{pc.email}</span>
                        ) : '—'}
                      </td>
                      <td className="hide-mobile">
                        <div className="cl-tax-chips">
                          <span className={`badge ${IT_BADGE[client.incomeTaxType]} cl-mini-badge`}>מ״ה: {IT_LABELS[client.incomeTaxType]}</span>
                          <span className={`badge ${NI_BADGE[client.niType]} cl-mini-badge`}>ב״ל: {NI_LABELS[client.niType]}</span>
                          <span className={`badge ${VAT_BADGE[client.vatStatus]} cl-mini-badge`}>מע״מ: {VAT_LABELS[client.vatStatus]}</span>
                        </div>
                      </td>
                      <td className="hide-mobile">
                        {employee ? (
                          <div className="cl-emp-chip" title={employee.role}>
                            <span className="cl-emp-dot" style={{ background: employee.color }}>{employee.initials}</span>
                            <span style={{ fontSize: '.75rem' }}>{employee.name}</span>
                          </div>
                        ) : (
                          <span style={{ color: 'var(--gray-400)', fontSize: '.75rem' }}>לא הוקצה</span>
                        )}
                      </td>
                      <td>
                        {m && m.openTasksCount > 0 ? (
                          <div className="cl-metric-cell">
                            <span className={`cl-metric-num ${m.upcomingDebtsCount > 0 ? 'warn' : ''}`}>{m.openTasksCount}</span>
                            {m.upcomingDebtsCount > 0 && <span className="cl-metric-tag">⏰ {m.upcomingDebtsCount}</span>}
                          </div>
                        ) : <span className="cl-metric-zero">—</span>}
                      </td>
                      <td className="hide-mobile" style={{ textAlign: 'center' }}>
                        {client.shaamStatus === 'active' && <span title="שע״ם פעיל">🟢</span>}
                        {client.shaamStatus === 'inactive' && <span title="שע״ם לא פעיל">🔴</span>}
                        {client.shaamStatus === 'pending' && <span title="שע״ם בטיפול">🟠</span>}
                        {(!client.shaamStatus || client.shaamStatus === 'unknown') && <span title="לא ידוע" style={{ color: 'var(--gray-300)' }}>○</span>}
                      </td>
                      <td onClick={e => e.stopPropagation()}>
                        <button
                          className="btn btn-ghost btn-icon"
                          onClick={() => { if (confirm(`למחוק את ${fullName}?`)) onDelete(client.id); }}
                          title="מחיקה"
                          style={{ color: 'var(--red)' }}
                        >🗑</button>
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

import { useState } from 'react';
import { Client } from './types';
import { useLocalStorage } from './hooks/useLocalStorage';
import { SAMPLE_CLIENTS } from './data/sampleClients';
import ClientList from './components/ClientList';
import ClientForm from './components/ClientForm';
import TaxCalculator from './components/TaxCalculator';
import DocumentManager from './components/DocumentManager';
import TaxReferencePanel from './components/TaxReferencePanel';

type View = 'list' | 'form' | 'calculator' | 'documents' | 'reference';

export default function App() {
  const [clients, setClients] = useLocalStorage<Client[]>('crm_clients', []);
  const [view, setView] = useState<View>('list');
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const selectedClient = selectedId ? clients.find(c => c.id === selectedId) ?? null : null;

  function handleSelectClient(id: string) {
    setSelectedId(id);
    setView('form');
  }

  function handleAddNew() {
    setSelectedId(null);
    setView('form');
  }

  function handleSave(client: Client) {
    setClients(prev => {
      const exists = prev.some(c => c.id === client.id);
      return exists
        ? prev.map(c => c.id === client.id ? client : c)
        : [...prev, client];
    });
    setSelectedId(client.id);
    setView('form');
  }

  function handleDelete(id: string) {
    setClients(prev => prev.filter(c => c.id !== id));
    if (selectedId === id) {
      setSelectedId(null);
      setView('list');
    }
  }

  function handleOpenCalculator(client: Client) {
    setClients(prev => {
      const exists = prev.some(c => c.id === client.id);
      return exists ? prev.map(c => c.id === client.id ? client : c) : [...prev, client];
    });
    setSelectedId(client.id);
    setView('calculator');
  }

  function handleOpenDocuments(client: Client) {
    setClients(prev => {
      const exists = prev.some(c => c.id === client.id);
      return exists ? prev.map(c => c.id === client.id ? client : c) : [...prev, client];
    });
    setSelectedId(client.id);
    setView('documents');
  }

  function handleCancelForm() {
    setView('list');
    setSelectedId(null);
  }

  function handleLoadSamples() {
    setClients(prev => {
      const existingIds = new Set(prev.map(c => c.id));
      const newSamples = SAMPLE_CLIENTS.filter(s => !existingIds.has(s.id));
      return [...prev, ...newSamples];
    });
  }

  const breadcrumb =
    view === 'form'
      ? selectedClient ? `${selectedClient.firstName} ${selectedClient.lastName}` : 'לקוח חדש'
      : view === 'calculator' && selectedClient
      ? `${selectedClient.firstName} ${selectedClient.lastName} — מחשבון מס`
      : view === 'documents' && selectedClient
      ? `${selectedClient.firstName} ${selectedClient.lastName} — מסמכים`
      : view === 'reference'
      ? 'מדריך מס'
      : null;

  return (
    <div className="app">
      <header className="header">
        <div className="header-logo" onClick={() => { setView('list'); setSelectedId(null); }}>
          📊 CRM רואה חשבון
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          {breadcrumb && (
            <div className="header-nav">
              <span
                style={{ cursor: 'pointer', color: 'var(--gray-400)' }}
                onClick={() => { setView('list'); setSelectedId(null); }}
              >
                לקוחות
              </span>
              <span>›</span>
              <span className="header-breadcrumb">{breadcrumb}</span>
            </div>
          )}
          <button
            onClick={() => { setView('reference'); setSelectedId(null); }}
            style={{
              padding: '.35rem .75rem',
              borderRadius: 'var(--radius)',
              border: '1px solid var(--gray-300)',
              background: view === 'reference' ? 'var(--blue)' : 'white',
              color: view === 'reference' ? 'white' : 'var(--gray-600)',
              cursor: 'pointer',
              fontFamily: 'inherit',
              fontSize: '.8125rem',
              fontWeight: 600,
            }}
          >
            📚 מדריך מס
          </button>
        </div>
      </header>

      <main className="main">
        {view === 'list' && (
          <ClientList
            clients={clients}
            onSelect={handleSelectClient}
            onAdd={handleAddNew}
            onDelete={handleDelete}
            onLoadSamples={handleLoadSamples}
          />
        )}

        {view === 'form' && (
          <ClientForm
            client={selectedClient}
            onSave={handleSave}
            onCancel={handleCancelForm}
            onOpenCalculator={handleOpenCalculator}
            onOpenDocuments={handleOpenDocuments}
          />
        )}

        {view === 'calculator' && selectedClient && (
          <TaxCalculator
            client={selectedClient}
            onBack={() => setView('form')}
          />
        )}

        {view === 'documents' && selectedClient && (
          <DocumentManager
            client={selectedClient}
            onBack={() => setView('form')}
          />
        )}

        {view === 'reference' && (
          <TaxReferencePanel
            onBack={() => setView('list')}
          />
        )}
      </main>
    </div>
  );
}

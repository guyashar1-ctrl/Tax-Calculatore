// ─── לשונית מסמכים ─────────────────────────────────────────────────────────
// עוטף את DocumentManager הקיים.

import { Client } from '../../types';
import DocumentManager from '../DocumentManager';

interface Props {
  client: Client;
  allClients: Client[];
  onDocChange: () => void;
}

export default function DocumentsTab({ client, allClients, onDocChange }: Props) {
  return (
    <div className="cw-tab cw-docs-tab">
      <div className="cw-doc-wrap" onClickCapture={() => onDocChange()}>
        <DocumentManager
          client={client}
          allClients={allClients}
          onBack={() => { /* אין צורך — אנחנו בלשונית */ }}
        />
      </div>
    </div>
  );
}

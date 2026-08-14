// ─── לשונית מסמכים ─────────────────────────────────────────────────────────
// M3: מערכת קבצים רגילה + שכבת מטא-דאטה מקצועית דקה (תוויות, שנה, קישור
// רב-לקוחי, קישור למשימות). מחליף את DocumentManager הישן — ראה
// docs/prototypes/client-case-simplified-exploration-v3-final2.html (#v-docs).
// DocumentManager.tsx נשאר בקוד (ניתוח AI/OCR, שכפול ללקוח אחר) אך אינו
// מיובא עוד מכאן — מועמד להסרה בסבב נפרד, לא הוסר כאן כדי לא להרחיב את השינוי.

import { Client } from '../../types';
import DocumentsWorkspace from './DocumentsWorkspace';

interface Props {
  client: Client;
  allClients: Client[];
  onDocChange: () => void;
}

export default function DocumentsTab({ client, allClients, onDocChange }: Props) {
  return (
    <div className="cw-tab cw-docs-tab">
      <div className="cw-doc-wrap" onClickCapture={() => onDocChange()}>
        <DocumentsWorkspace client={client} allClients={allClients} />
      </div>
    </div>
  );
}

// ─── לשונית מסמכים ─────────────────────────────────────────────────────────
// M3: מערכת קבצים רגילה + שכבת מטא-דאטה מקצועית דקה (תוויות, שנה, קישור
// רב-לקוחי, קישור למשימות). מחליף את DocumentManager הישן — ראה
// docs/prototypes/client-case-simplified-exploration-v3-final2.html (#v-docs).
// DocumentManager.tsx נשאר בקוד (ניתוח AI/OCR, שכפול ללקוח אחר) אך אינו
// מיובא עוד מכאן — מועמד להסרה בסבב נפרד, לא הוסר כאן כדי לא להרחיב את השינוי.
//
// ‼ cw-tab ולא cw-tabpanel: זו הייתה טעות אמיתית, לא בחירת עיצוב. cw-tab
// היא גם מחלקת כפתור הטאב בכותרת (display:flex ללא flex-direction:column,
// align-items:center) — שורש התיק כולו (כלים/נתיב/רשימה) נדחס לשורה
// אופקית אחת וכל בלוק כווץ למינימום, זו הייתה "התוכן דחוס בשטח צר" שדווחה.
// tabpanel היא flex column עם gap, בדיוק כמו JourneyTab/OnboardingTab.

import { Client } from '../../types';
import DocumentsWorkspace from './DocumentsWorkspace';

interface Props {
  client: Client;
  allClients: Client[];
  onDocChange: () => void;
  /** תיקייה שנפתחת ישירות — קיצור ממסך הבקשות. */
  initialFolderId?: string | null;
}

export default function DocumentsTab({ client, allClients, onDocChange, initialFolderId }: Props) {
  return (
    <div className="cw-tabpanel cw-docs-tab">
      <div className="cw-doc-wrap" onClickCapture={() => onDocChange()}>
        <DocumentsWorkspace client={client} allClients={allClients} initialFolderId={initialFolderId} />
      </div>
    </div>
  );
}

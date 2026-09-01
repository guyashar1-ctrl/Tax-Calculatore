// ─── לשונית "התיק" ──────────────────────────────────────────────────────────
// מבנה: מאסטר-דיטייל, לפי מסך 08 בפרויקט העיצוב.
//
// המבנה הקודם היה שתי קבוצות-ענק מתקפלות, שכל אחת פרשה עשר קבוצות שדות
// זו מתחת לזו — מסך בגובה אלפי פיקסלים שאפשר רק לגלול בו, לא לסרוק אותו.
// עכשיו: מסילה צרה שמראה את כל עשרים הקבוצות ואת מצב כל אחת, ופאנל
// שמראה קבוצה אחת. חיפוש חוצה את כל התיק ופותח את הכול.
//
// השדות עצמם, ההנדלרים והשמירה לא זזו — הפילטר יושב ב-dossierSection.

import { useMemo, useState } from 'react';
import type { Client } from '../../types';
import type { Employee } from '../../types/clientWorkspace';
import type { AnnualReportSession } from '../../features/annualReport/types';
import { registeredFileInfo } from '../../features/annualReport/profile';
import { resolveIncomeTaxHousehold } from '../../utils/personRepresentation';
import TaxFilesSection from './TaxFilesSection';
import PersonalContactsTab from './PersonalContactsTab';
import TaxNITab from './TaxNITab';
import { DossierFilterProvider, DOSSIER_GROUPS } from './dossierSection';

interface Props {
  client: Client;
  /** הכרטיס של בן/בת הזוג, כשהוא/היא לקוח/ה בפני עצמו/ה (150). */
  spouseClient?: Client;
  update: <K extends keyof Client>(key: K, value: Client[K]) => void;
  patch: (partial: Partial<Client>) => void;
  patchAndSave: (partial: Partial<Client>) => Promise<void>;
  employees: Employee[];
  sessions: AnnualReportSession[];
  isNew?: boolean;
  /** פותח כרטיס לקוח נפרד לבן/בת הזוג, מזורע ומקושר דו-כיווני (150). */
  onCreateSpouseClient?: () => Promise<void> | void;
  /** פותח את כרטיס בן/בת הזוג הקיים — כשהוא כבר מקושר (client.spouseClientId). */
  onOpenSpouseClient?: (clientId: string) => void;
}

const ANCHOR = 'תיקים ברשויות';

/** מצב קבוצה — נגזר מהכרטיס, כדי שהמסילה תגיד מה חסר בלי לפתוח. */
function groupState(client: Client, label: string): { text: string; todo: boolean } {
  const has = (v: unknown) => v !== undefined && v !== null && v !== '' && !(Array.isArray(v) && v.length === 0);
  switch (label) {
    case 'פרטי נישום':
      return has(client.idNumber) && has(client.firstName) && has(client.birthDate)
        ? { text: 'הושלם', todo: false } : { text: 'חסר', todo: true };
    case 'מצב משפחתי':
      return has(client.familyStatus) ? { text: 'הושלם', todo: false } : { text: 'חסר', todo: true };
    case 'ילדים':
      return { text: String(client.children?.length ?? 0), todo: false };
    case 'נכסים והשקעות':
      return { text: String(client.properties?.length ?? 0), todo: false };
    case 'אנשי קשר':
      return { text: String(client.additionalContacts?.length ?? 0), todo: false };
    case 'תגיות':
      return { text: String(client.tags?.length ?? 0), todo: false };
    case 'מס הכנסה':
      return has(client.incomeTaxType) ? { text: 'הושלם', todo: false } : { text: 'חסר', todo: true };
    case 'מע״מ':
      return has(client.vatStatus) ? { text: 'הושלם', todo: false } : { text: 'חסר', todo: true };
    default:
      return { text: '', todo: false };
  }
}

export default function ClientDossierTab({
  client, spouseClient, update, patch, employees, isNew, onCreateSpouseClient, onOpenSpouseClient,
}: Props) {
  // ‼ תיק מס הכנסה אחד לזוג (150) — כשהוא לא על הכרטיס הזה, נקרא דרך
  // household ולא מוצג כאילו אף אחד לא רשום.
  const household = resolveIncomeTaxHousehold(client, spouseClient);
  const regFile = household.holderClient ? registeredFileInfo(household.holderClient) : null;
  const [active, setActive] = useState<string>(isNew ? 'פרטי נישום' : ANCHOR);
  const [query, setQuery] = useState('');

  const rail = useMemo(
    () => [{ label: ANCHOR, pane: 'anchor' as const }, ...DOSSIER_GROUPS],
    [],
  );
  const states = useMemo(
    () => rail.map((g) => ({ ...g, ...groupState(client, g.label) })),
    [rail, client],
  );

  const searching = query.trim().length > 0;
  const todoCount = states.filter((g) => g.todo).length;
  const statusText = searching
    ? 'חיפוש בכל התיק'
    : todoCount === 0
      ? 'התיק שלם'
      : `${todoCount} קבוצות דורשות השלמה · ${states.length - todoCount} מתוך ${states.length} סגורות`;

  const activeGroup = states.find((g) => g.label === active) ?? states[0];
  const showAnchor = searching || active === ANCHOR;
  const showPersonal = searching || activeGroup.pane === 'personal';
  const showTax = searching || activeGroup.pane === 'tax';

  return (
    <div className="pg cw-tabpanel">
      <div className="pg-head">
        <div className="pg-head-main">
          <div className="pg-title">התיק</div>
          <div className="pg-status">{statusText}</div>
        </div>
        <div className="pg-actions">
          <input
            type="text"
            className="pg-search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="חפש שדה בתיק"
            aria-label="חיפוש שדה בתיק"
          />
        </div>
      </div>

      {/* מקטע לכל קבוצה — פס אחד שמחליף עשרים תוויות מצב */}
      <div className="pg-bars" aria-hidden="true">
        {states.map((g) => (
          <span key={g.label} className={`pg-bar ${g.todo ? 'is-todo' : 'is-done'}`} />
        ))}
      </div>

      <div className="pg-split">
        <nav className="pg-rail" aria-label="קבוצות התיק">
          {states.map((g) => (
            <button
              key={g.label}
              type="button"
              className={`pg-rail-item ${!searching && g.label === active ? 'is-active' : ''}`}
              onClick={() => { setQuery(''); setActive(g.label); }}
              aria-current={!searching && g.label === active ? 'true' : undefined}
            >
              <span className="pg-rail-name">{g.label}</span>
              <span className={`pg-rail-state ${g.todo ? 'is-todo' : ''}`}>{g.text}</span>
            </button>
          ))}
        </nav>

        <div className="pg-pane">
          {showAnchor && (
            <>
              {!searching && (
                <div className="pg-pane-head">
                  <div className="pg-pane-title">{ANCHOR}</div>
                  <div className="pg-pane-help">
                    התיק שכל השאר נשען עליו. כאן נקבע מול איזו רשות מתנהל כל תיק,
                    על שם מי הוא רשום, ומה מצב הייצוג בו.
                  </div>
                </div>
              )}
              <TaxFilesSection client={client} update={update} spouseClient={spouseClient} />
              {regFile && client.familyStatus === 'married' && (() => {
                // ‼ regFile.owner יחסי לכרטיס שמחזיק את התיק (household.holderClient),
                // לא לכרטיס הזה. כשהתיק אצל בן/בת הזוג, ההיפוך נחוץ — ראה PersonQuickView.
                const spouseIsRegistered = household.holder === 'spouse'
                  ? regFile.owner === 'client' : regFile.owner === 'spouse';
                return (
                  <div className="dossier-spouse-note" style={{ color: spouseIsRegistered ? 'var(--warn)' : 'var(--ink-3)' }}>
                    {spouseIsRegistered ? '⚠ ' : ''}
                    {household.holder === 'spouse' ? 'תיק מס הכנסה משותף · ' : ''}
                    בן/בת הזוג הרשום/ה: {regFile.name}
                    {regFile.idNumber ? ` · ת.ז. ${regFile.idNumber}` : ''} - כל ההתנהלות מול מ"ה בת.ז. הזו
                    {household.holder === 'spouse' ? ` (מנוהל בכרטיס של ${spouseClient?.firstName ?? ''} ${spouseClient?.lastName ?? ''})` : ''}
                  </div>
                );
              })()}
            </>
          )}

          <DossierFilterProvider value={{ active: searching ? null : active, query }}>
            {showPersonal && (
              <PersonalContactsTab
                client={client} update={update} patch={patch} employees={employees}
                onCreateSpouseClient={onCreateSpouseClient} onOpenSpouseClient={onOpenSpouseClient}
              />
            )}
            {showTax && <TaxNITab client={client} update={update} hideFiles />}
          </DossierFilterProvider>
        </div>
      </div>
    </div>
  );
}

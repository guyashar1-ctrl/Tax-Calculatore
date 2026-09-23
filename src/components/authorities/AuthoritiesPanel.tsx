// ─── «מול הרשויות» — התצוגה הקומפקטית, רכיב אחד לכל ההקשרים ─────────────────
// ‼ החלטת מוצר (19.09.2026): יש **חוויה אחת** לנתוני הרשויות — השורות
// הקומפקטיות של תיק המס (מס הכנסה / מע״מ / ביטוח לאומי / ניכויים). היא
// מצוירת גם בתיק המס וגם ב«בקשות» (כרטיס יישור הקו) מאותו רכיב ממש — לא
// שני עותקים שמתפצלים (זה בדיוק מה שקרה כשפרק 17 חובר לתיק המס ולא
// למרכז הביצוע). מסכי יישור הקו הגדולים נשארים זמינים כ«תצוגה מפורטת»
// בלבד, עד שהאוטומציות ייבנו.
//
// מה חי כאן, פעם אחת:
//   · המודל (buildAuthorityRows) והצגתו, כולל בלוקי-אדם בב״ל (154);
//   · האוטומציה ברמת הכרטיס — «בדוק מול …», סמני מצב, סיכום ואישור מקובץ
//     (authorityAutomation + AuthorityCheckPanel), עם שער החיבור (useAutomationGate);
//   · הפעולה ההקשרית של ב״ל לכל אדם (NiNextActionButton) ותא שע״ם;
//   · עריכה במקום של עובדות הרשות (אותו מסלול עובדות מנוהלות, recordManualEdit);
//   · «איפה מוצאים?» ליד כל שדה שיש לו מסלול מתועד (authorityFieldHelp);
//   · «תצוגה מפורטת» — קישור משני, לא ורוד, למסך המלא של אותה רשות.
//
// ‼ מה **לא** חי כאן: מחזור החיים של הבקשות. הרכיב מציג מצב ומפעיל
// אוטומציה; פתיחת/סגירת שלבי יישור הקו נשארת אצל המארח (onOpenDetailed).

import { useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import type { Client, TaxAuthority, NiOccupation } from '../../types';
import { TAX_AUTHORITY_LABELS } from '../../types';
import type { TaxFactChange, ProposedFact } from '../../types/taxFacts';
import type { AutomationJob } from '../../types/automation';
import { proposeTaxFacts, listPendingTaxFactChanges } from '../../lib/taxFacts';
import { useTaxFacts } from '../../hooks/useTaxFacts';
import { useAutomationJob } from '../../hooks/useAutomationJobs';
import { jobIsLive } from '../../lib/automationJobs';
import { shortDate } from '../../utils/clientDerived';
import { buildAuthorityRows } from '../../utils/authorityRows';
import type { AuthorityRowFact } from '../../utils/authorityRows';
import type { NiExecutionByRole } from '../../utils/niPersons';
import { EDIT_FIELD_BY_KEY, editFieldValue, coerceEditField, editFieldDisplay } from '../../features/taxFile/editModel';
import type { EditField } from '../../features/taxFile/editModel';
import EditControl from '../../features/taxFile/EditControl';
import { AUTHORITY_AUTOMATION, buildAuthorityCheck } from '../../features/taxFile/authorityAutomation';
import type { AuthorityAutomationSpec, AuthorityCheckResult } from '../../features/taxFile/authorityAutomation';
import { shaamRepresentationAction } from '../../features/taxFile/shaamRepresentationAction';
import { authorityFieldHelp } from '../../features/taxFile/authorityFieldHelp';
import { AuthorityCheckButton, AuthorityCheckSummary, FieldStatusMark, FieldAuthorityLine } from '../clientTabs/AuthorityCheckPanel';
import { TRow, SrcLine } from '../clientTabs/taxFileRows';
import { OccupationsEditor, newOccupationRow } from '../clientTabs/InstitutionAlignment';
import type { OccupationDraft } from '../clientTabs/InstitutionAlignment';
import NiNextActionButton from '../NiNextActionButton';
import AuthorityFieldHelp from './AuthorityFieldHelp';

export interface AuthoritiesPanelProps {
  client: Client;
  /** הכרטיס של בן/בת הזוג המקושר/ת (150) — לקריאה בלבד דרכו. */
  spouseClient?: Client;
  /** מסלולי הביצוע של ב"ל בבקשת הייצוג המקושרת — לשורת «ייצוג» פר-אדם. */
  niExecution?: NiExecutionByRole;
  /** מתי בוצע יישור הקו האחרון — לשורת המקור. */
  alignedAt?: string;
  /** סנכרון עותק הלקוח המקומי אחרי כתיבה טרנזקציונית בשרת. */
  onClientPersisted: (c: Client) => void;
  /** אחרי אישור/עריכה — המארח מרענן את רשימת ההצעות הממתינות שלו, אם יש לו. */
  onFactsChanged?: () => void;
  onOpenSpouseClient?: (clientId: string) => void;
  /** «המשך במרכז הייצוג» בשורת ייצוג ב"ל. */
  onOpenRepresentation?: () => void;
  /** «בקש ייצוג» לרשות×אדם — יוצר את הבקשה במשטח "בקשות" (157). */
  onAddNiTarget?: (role: 'client' | 'spouse') => Promise<{ error: string | null; stepId?: string }>;
  /** אחרי שנוצרה בקשה — קפיצה למשטח "בקשות", שם היא חיה. */
  onOpenRequestStep?: () => void;
  /** «שלח הוראות אישור» — המארח פותח את הדיאלוג הקיים שלו (NiInstructionsDialog). */
  onSendNiInstructions?: (target: { role: 'client' | 'spouse'; name: string; idNumberMasked?: string }) => void;
  /**
   * v3: במשטח הבקשות אין מקום לפקד-מקום מושבת («הזן את הפרטים בשע״ם» /
   * «בדוק קבלת הייצוג» של שע״ם שטרם נבנה) — מצב הייצוג מול שע״ם חי שם על
   * כרטיס «ייצוג מול הרשויות». בתיק המס הוא נשאר, עם הסיבה ב-title.
   */
  hideRepresentationPlaceholder?: boolean;
  /**
   * v3: במשטח הבקשות פעולות הייצוג של ב"ל לכל אדם (הזן / בדוק / בקש ייצוג)
   * חיות על כרטיס «ייצוג בביטוח לאומי — X» ב«לטיפולי»; אותו כפתור פעמיים
   * באותו עמוד הוא הכפילות שהמודל בא להסיר. בתיק המס הן נשארות כאן.
   */
  hideNiRepresentationActions?: boolean;
  /** אחרי שמשימת ב"ל הסתיימה בהצלחה — רענון הבקשה/הכרטיס. */
  onNiInstructionsSent?: () => void | Promise<void>;
  /**
   * «תצוגה מפורטת» — פותח את מסך יישור הקו המלא של הרשות (כלי בדיקה זמני
   * בזמן שהאוטומציות נבנות). חסר ⇒ הקישור לא מצויר. ‼ לא אוטומציה — לא ורוד.
   */
  onOpenDetailed?: (authority: TaxAuthority) => void;
  /** מה לצייר כשאין אף שורת רשות (למשל בלוק «עוד לא בדקנו…» של תיק המס). */
  emptyState?: ReactNode;
}

/** מפתח taxFiles בתוך הטיוטות — קידומת כדי שלא יתנגש עם editKey אמיתי. */
function taxFileNumberKey(authority: TaxAuthority, owner: 'client' | 'spouse' = 'client') {
  return `__taxFileNumber:${authority}:${owner}`;
}

/** לרשויות עם מסך מלא בלבד — לניכויים אין מסך יישור קו. */
const HAS_DETAILED: Partial<Record<TaxAuthority, true>> = { income_tax: true, vat: true, national_insurance: true };

export default function AuthoritiesPanel({
  client, spouseClient, niExecution, alignedAt, onClientPersisted, onFactsChanged,
  onOpenSpouseClient, onOpenRepresentation, onAddNiTarget, onOpenRequestStep,
  onSendNiInstructions, onNiInstructionsSent, onOpenDetailed, emptyState, hideRepresentationPlaceholder, hideNiRepresentationActions,
}: AuthoritiesPanelProps) {
  const { acceptFact, recordManualEdit, refresh: refreshFacts } = useTaxFacts(client.id || undefined);
  const [openRows, setOpenRows] = useState<Set<string>>(new Set());
  function toggleRow(id: string) {
    setOpenRows(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  }
  const factsChanged = () => { void refreshFacts(); onFactsChanged?.(); };

  const authorityRows = useMemo(
    () => buildAuthorityRows(client, spouseClient, niExecution),
    [client, spouseClient, niExecution],
  );
  const niTrackOf = (role: 'client' | 'spouse') => (role === 'spouse' ? niExecution?.spouse : niExecution?.client);

  // ‼ «בקש ייצוג» — נעילה בזמן הכתיבה ושגיאה גלויה.
  const [niAddBusy, setNiAddBusy] = useState<'client' | 'spouse' | null>(null);
  const [niAddError, setNiAddError] = useState<string | null>(null);
  async function runAddNiTarget(role: 'client' | 'spouse') {
    if (niAddBusy || !onAddNiTarget) return;
    setNiAddBusy(role);
    setNiAddError(null);
    try {
      const res = await onAddNiTarget(role);
      if (res.error) { setNiAddError(res.error); return; }
      onOpenRequestStep?.();
    } catch (e) {
      setNiAddError(e instanceof Error ? e.message : 'השמירה נכשלה');
    } finally {
      setNiAddBusy(null);
    }
  }

  // ‼ הוק משימה אחד **לכל רשות אוטומטית** (AUTHORITY_AUTOMATION) — רשות בלי
  // action_type מקבלת הוק שאינו שולח שאילתה ואינו מריץ.
  const jobIncomeTax = useAutomationJob(client.id || undefined, AUTHORITY_AUTOMATION.income_tax?.actionType ?? '');
  const jobVat = useAutomationJob(client.id || undefined, AUTHORITY_AUTOMATION.vat?.actionType ?? '');
  const jobBtl = useAutomationJob(client.id || undefined, AUTHORITY_AUTOMATION.national_insurance?.actionType ?? '');
  const authorityJobs: Partial<Record<TaxAuthority, ReturnType<typeof useAutomationJob>>> = {
    income_tax: jobIncomeTax, vat: jobVat, national_insurance: jobBtl,
  };
  // ‼ המשימה **החיה** לכל רשות, לקריאה מתוך פונקציה אסינכרונית (שער ההתיישנות באישור).
  const authorityJobsRef = useRef<Partial<Record<TaxAuthority, AutomationJob | null>>>({});
  authorityJobsRef.current = { income_tax: jobIncomeTax.job, vat: jobVat.job, national_insurance: jobBtl.job };

  // ‼ אישור מקובץ — פעם אחת לכרטיס, לא לשדה.
  const [approvingAuthority, setApprovingAuthority] = useState<TaxAuthority | null>(null);
  const [approveError, setApproveError] = useState<string | null>(null);
  const [approveNotice, setApproveNotice] = useState<string | null>(null);

  // ─── עריכה במקום של עובדות הרשות ───────────────────────────────────────────
  // ‼ המפתח הוא מזהה השורה ('auth-vat', 'auth-national_insurance:spouse').
  const [editingSection, setEditingSection] = useState<string | null>(null);
  const [sectionDrafts, setSectionDrafts] = useState<Record<string, string>>({});
  const [sectionSaving, setSectionSaving] = useState(false);
  const [sectionError, setSectionError] = useState<string | null>(null);
  // ‼ עיסוקים בביטוח לאומי הם רשימה, לא שדה שטוח — טיוטה נפרדת.
  const [sectionOccDrafts, setSectionOccDrafts] = useState<OccupationDraft[]>([]);

  /**
   * תיק הרשות הזו על שם ה-owner המבוקש. ‼ לב"ל — התאמה מדויקת בלבד (154);
   * לשאר הרשויות — התיק של הלקוח, ואם אין, הראשון של הרשות.
   */
  function currentTaxFile(authority: TaxAuthority, owner: 'client' | 'spouse' = 'client') {
    const files = client.taxFiles ?? [];
    if (authority === 'national_insurance') {
      return files.find(t => t.authority === authority && t.owner === owner);
    }
    return files.find(t => t.authority === authority && t.owner === 'client')
      ?? files.find(t => t.authority === authority);
  }
  /** עדכון במקום כשיש רשומה, יצירה רק כשאין — לעולם לא כפילות ולעולם לא מת.ז. */
  function buildTaxFilesPatch(authority: TaxAuthority, newNumber: string, owner: 'client' | 'spouse' = 'client') {
    const files = client.taxFiles ?? [];
    const existing = currentTaxFile(authority, owner);
    if (existing) {
      return files.map(t => t.id === existing.id ? { ...t, fileNumber: newNumber || undefined } : t);
    }
    return [...files, {
      id: `tf-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      authority, owner, repStatus: 'none' as const,
      fileNumber: newNumber || undefined,
    }];
  }

  function startSectionEdit(
    id: string, fields: EditField[],
    opts?: { taxFileAuthority?: TaxAuthority; taxFileOwner?: 'client' | 'spouse'; niOwner?: 'client' | 'spouse' },
  ) {
    const drafts: Record<string, string> = {};
    for (const f of fields) drafts[f.key] = editFieldValue(client, f);
    if (opts?.taxFileAuthority) {
      const owner = opts.taxFileOwner ?? 'client';
      drafts[taxFileNumberKey(opts.taxFileAuthority, owner)] = currentTaxFile(opts.taxFileAuthority, owner)?.fileNumber ?? '';
    }
    setSectionDrafts(drafts);
    // ‼ תמיד לפחות שורה ריקה אחת; לבן/בת הזוג רשימת עיסוקים משלו/ה (154).
    const occSource = opts?.niOwner === 'spouse' ? (client.spouseNiOccupations ?? []) : (client.niOccupations ?? []);
    setSectionOccDrafts(occSource.length > 0 ? occSource.map(o => ({ ...o })) : [newOccupationRow(0)]);
    setSectionError(null);
    setEditingSection(id);
  }

  function cancelSectionEdit() {
    setEditingSection(null);
    setSectionDrafts({});
    setSectionOccDrafts([]);
    setSectionError(null);
  }

  /**
   * ‼ נשמר דרך מסלול העובדות המנוהלות (record_manual_fact_change): הערך
   * נכתב **ונרשם** עם פרובננס manual והיסטוריה. רק שדות שהשתנו נשלחים.
   */
  async function saveSectionEdit() {
    if (!client.id) return;
    setSectionSaving(true);
    setSectionError(null);
    for (const [key, raw] of Object.entries(sectionDrafts)) {
      if (key.startsWith('__taxFileNumber:')) {
        const [authority, owner] = key.slice('__taxFileNumber:'.length).split(':') as [TaxAuthority, 'client' | 'spouse'];
        const before = currentTaxFile(authority, owner)?.fileNumber ?? '';
        if (raw === before) continue;
        const label = `מספר תיק — ${TAX_AUTHORITY_LABELS[authority]}${owner === 'spouse' ? ' (בן/בת הזוג)' : ''}`;
        const res = await recordManualEdit(
          client.id, 'taxFiles', label,
          before || '—', raw || '—', { taxFiles: buildTaxFilesPatch(authority, raw, owner) },
        );
        if (!res.ok) {
          setSectionError(`מספר תיק: ${res.error ?? 'השמירה נכשלה'}`);
          setSectionSaving(false);
          return;
        }
        if (res.client) onClientPersisted(res.client);
        continue;
      }
      const def = EDIT_FIELD_BY_KEY[key];
      if (!def) continue;
      const before = editFieldValue(client, def);
      if (raw === before) continue;
      const res = await recordManualEdit(
        client.id, def.key, def.label,
        editFieldDisplay(def, before), editFieldDisplay(def, raw),
        { [def.key]: coerceEditField(def, raw) } as Partial<Client>,
      );
      if (!res.ok) {
        setSectionError(`${def.label}: ${res.error ?? 'השמירה נכשלה'}`);
        setSectionSaving(false);
        return;
      }
      if (res.client) onClientPersisted(res.client);
    }

    // עיסוקים בביטוח לאומי — רק כשבלוק אדם בכרטיס ב״ל הוא זה שבעריכה, ורק אם השתנה.
    const niOccMatch = /^auth-national_insurance:(client|spouse)$/.exec(editingSection ?? '');
    if (niOccMatch) {
      const occOwner = niOccMatch[1] as 'client' | 'spouse';
      const occKey = occOwner === 'spouse' ? 'spouseNiOccupations' : 'niOccupations';
      const occLabel = occOwner === 'spouse' ? 'עיסוקים בביטוח לאומי — בן/בת הזוג' : 'עיסוקים בביטוח לאומי';
      const selected = sectionOccDrafts.filter((o): o is NiOccupation => o.type !== '');
      const before = (client[occKey] as NiOccupation[] | undefined) ?? [];
      if (JSON.stringify(selected) !== JSON.stringify(before)) {
        const res = await recordManualEdit(
          client.id, occKey, occLabel,
          before.length ? `${before.length} עיסוקים` : '-',
          selected.length ? `${selected.length} עיסוקים` : '-',
          { [occKey]: selected } as Partial<Client>,
        );
        if (!res.ok) {
          setSectionError(`עיסוקים: ${res.error ?? 'השמירה נכשלה'}`);
          setSectionSaving(false);
          return;
        }
        if (res.client) onClientPersisted(res.client);
      }
    }
    setSectionSaving(false);
    cancelSectionEdit();
    onFactsChanged?.();
  }

  /** כפתורי שמור/ביטול — אותו בלוק בכל שורה שנמצאת בעריכה. */
  function EditActions() {
    return (
      <div className="txf-editor-actions">
        <button type="button" className="ui-btn ui-btn-primary" disabled={sectionSaving}
          onClick={() => { void saveSectionEdit(); }}>
          {sectionSaving ? 'שומר…' : 'שמור'}
        </button>
        <button type="button" className="ui-btn" disabled={sectionSaving} onClick={cancelSectionEdit}>ביטול</button>
        {sectionError && <span className="txf-editor-err">{sectionError}</span>}
      </div>
    );
  }

  /**
   * «אשר N שינויים» — האישור המקובץ של כרטיס הרשות. עובר דרך מסלול העובדות
   * המנוהלות (propose → accept) כדי לשמור פרובננס, היסטוריה ובדיקת
   * stale_conflict בשרת. בלי כפילויות; שדה שנכשל לא עוצר את השאר.
   */
  async function approveAuthorityChanges(spec: AuthorityAutomationSpec, check: AuthorityCheckResult) {
    if (!client.id) return;
    const changed = check.fields.filter(f => f.status === 'changed' && f.fieldKey && f.authorityValue != null);
    if (changed.length === 0) return;
    setApprovingAuthority(spec.authority);
    setApproveError(null);
    setApproveNotice(null);

    const existing = await listPendingTaxFactChanges(client.id);
    const reuse = new Map<string, TaxFactChange>();
    const toPropose: ProposedFact[] = [];
    for (const f of changed) {
      const def = EDIT_FIELD_BY_KEY[f.fieldKey];
      // ‼ patchValue גובר: «אין תדירות» הוא ניקוי השדה (null), ולא מחרוזת ריקה.
      const newPatch = f.patchValue !== undefined ? f.patchValue
        : def ? coerceEditField(def, f.authorityValue!) : f.authorityValue!;
      const oldRaw = (client as unknown as Record<string, unknown>)[f.fieldKey] ?? null;
      const dup = existing.find(c => c.fieldKey === f.fieldKey && c.source === 'automation'
        && JSON.stringify(c.newValue.patch?.[f.fieldKey]) === JSON.stringify(newPatch));
      if (dup) { reuse.set(f.fieldKey, dup); continue; }
      toPropose.push({
        fieldKey: f.fieldKey, label: f.label,
        oldValue: { display: String(oldRaw ?? '') || '—', patch: { [f.fieldKey]: oldRaw } },
        newValue: {
          display: f.authorityDisplay ?? f.authorityRaw ?? f.authorityValue!,
          patch: { [f.fieldKey]: newPatch },
        },
        // ‼ הראיה הגולמית מהרשות נשמרת בהצעה עצמה; שם הרשות מהרשומה ולא קבוע.
        note: f.provenance ? `${spec.sourceLabel}: ${f.provenance}` : undefined,
      });
    }
    if (toPropose.length > 0) {
      const res = await proposeTaxFacts(client.id, 'automation', spec.sourceRef ?? null, toPropose);
      if (!res.ok) {
        setApproveError(res.error ?? 'ההצעה נכשלה');
        setApprovingAuthority(null);
        return;
      }
    }
    const after = toPropose.length > 0 ? await listPendingTaxFactChanges(client.id) : existing;

    // ‼ שער התיישנות: ריצה חדשה של אותה רשות הסתיימה בינתיים ⇒ לא כותבים.
    const liveRunId = authorityJobsRef.current[spec.authority]?.id;
    if (check.runId && liveRunId && liveRunId !== check.runId) {
      setApprovingAuthority(null);
      setApproveError('בינתיים הסתיימה קריאה חדשה מהרשות — ההשוואה התעדכנה, ולא אושר דבר. בדקו שוב.');
      factsChanged();
      return;
    }

    const failures: string[] = [];
    let approved = 0;
    for (const f of changed) {
      const change = reuse.get(f.fieldKey)
        ?? [...after].reverse().find(c => c.fieldKey === f.fieldKey && c.source === 'automation');
      if (!change) { failures.push(f.label); continue; }
      const r = await acceptFact(change);
      if (!r.ok) {
        failures.push(r.error === 'stale_conflict' ? `${f.label} (הערך בתיק השתנה בינתיים)` : f.label);
        continue;
      }
      if (r.client) onClientPersisted(r.client);
      approved++;
    }
    setApprovingAuthority(null);
    if (failures.length > 0) {
      setApproveError(`לא אושרו: ${failures.join(' · ')}. ההצעות נשארו ממתינות ברשימת השינויים.`);
    }
    setApproveNotice(approved > 0
      ? `${approved === 1 ? 'שינוי אחד אושר' : `${approved} שינויים אושרו`} ונרשמו ביומן.`
      : null);
    factsChanged();
  }

  /** תווית שדה + סמן מצב + «?» של איפה מוצאים — אותה שורה בכל הקשר. */
  function FieldLabel({ f, status }: { f: AuthorityRowFact; status?: ReactNode }) {
    const help = authorityFieldHelp(f.helpKey ?? f.editKey ?? f.syncKey ?? f.btlSyncKey);
    return (
      <div className="k">
        {status}{f.k}
        {help && <AuthorityFieldHelp help={help} />}
      </div>
    );
  }

  const srcLabel = alignedAt ? 'יישור קו מול הרשויות · ' + shortDate(alignedAt) : 'תיקי הרשויות בכרטיס הלקוח';

  if (authorityRows.length === 0) return <>{emptyState ?? null}</>;

  return (
    <div className="txf-sect">
      {authorityRows.map(row => {
        const sectionId = 'auth-' + row.authority;
        const editingThis = editingSection === sectionId;
        // ‼ (154) לב"ל יש עד שני מצבי עריכה בו-זמנית — אחד לכל אדם.
        const twoPersons = !!row.persons && row.persons.length > 1;
        const cardEditing = editingThis
          || (twoPersons && row.persons!.some(p => editingSection === `${sectionId}:${p.role}`));
        const detailed = onOpenDetailed && HAS_DETAILED[row.authority]
          ? () => onOpenDetailed(row.authority) : undefined;

        // ── אוטומציה ברמת הכרטיס — ראה authorityAutomation.ts ──
        const spec = AUTHORITY_AUTOMATION[row.authority];
        const shaamRepAction = row.authority === 'income_tax' ? shaamRepresentationAction(client.representationStatus) : null;
        const sync = authorityJobs[row.authority];
        const job = spec?.actionType ? (sync?.job ?? null) : null;
        const cardFields = row.facts.map(f => ({ label: f.k, fieldKey: f.syncKey ?? f.btlSyncKey ?? f.editKey }));
        const check = spec ? buildAuthorityCheck(spec, job, client, cardFields) : null;
        const inputRes = spec?.buildInput?.(client, spouseClient);
        // ‼ שני סוגי «לא עכשיו»: רשות שהאוטומציה שלה עוד לא נבנתה — מושבת
        // באמת; קלט חסר בכרטיס — הלחיצה מסבירה. חיבור שאינו מוכן אינו
        // «חסימה»: הכפתור עצמו פותח את ההתחברות וממשיך (useAutomationGate).
        const unavailable = spec && !spec.available
          ? (spec.unavailableReason ?? 'האוטומציה עוד לא נבנתה לרשות הזו.') : null;
        const inputBlocked = !spec || unavailable ? null
          : inputRes && 'blocked' in inputRes ? inputRes.blocked
          : null;
        // ‼ "רץ" רק כשהעובד באמת חי (החכירה בתוקף) — ספר הפערים N5.
        const running = !!spec?.available && (!!sync?.busy || jobIsLive(job));
        const runCheck = () => {
          if (!spec?.available || !sync || !inputRes || !('input' in inputRes)) return;
          setApproveError(null);
          setApproveNotice(null);
          // ‼ פותחים את הכרטיס — התוצאות יושבות בו.
          setOpenRows(s => new Set(s).add(sectionId));
          void sync.run(inputRes.input);
        };

        const renderValue = (f: AuthorityRowFact, editing: boolean, owner: 'client' | 'spouse') => {
          const def = f.editKey ? EDIT_FIELD_BY_KEY[f.editKey] : undefined;
          if (editing && def) {
            return (
              <div className="v txf-inline-edit">
                <EditControl def={def} value={sectionDrafts[def.key] ?? ''}
                  onChange={v => setSectionDrafts(d => ({ ...d, [def.key]: v }))} />
                {def.note && <div className="txf-note">{def.note}</div>}
              </div>
            );
          }
          if (editing && f.taxFileNumberAuthority) {
            const key = taxFileNumberKey(f.taxFileNumberAuthority, f.taxFileNumberOwner ?? owner);
            return (
              <div className="v txf-inline-edit">
                <input type="text" placeholder="—" value={sectionDrafts[key] ?? ''}
                  onChange={e => setSectionDrafts(d => ({ ...d, [key]: e.target.value }))} />
              </div>
            );
          }
          return <div className={'v ' + (f.tone ?? '')}>{f.v}</div>;
        };

        return (
          <TRow
            key={row.authority}
            id={sectionId}
            name={row.name}
            summary={row.summary}
            exception={row.exception}
            open={openRows.has(sectionId)}
            onToggle={toggleRow}
            action={
              <>
                {spec && (
                  <AuthorityCheckButton label={spec.actionLabel} capability={spec.capability ?? ''}
                    running={running} onRun={runCheck} unavailableReason={unavailable} inputBlockedReason={inputBlocked} />
                )}
                {/* ‼ פרק 17/194: תא הפעולה של שע״ם. האוטומציה עצמה רצה
                    במרכז ביצוע הייצוג — שם יושבים הבקשה, ההגשות, הטפסים
                    והחתימות שהיא צריכה. כאן מוצגת **אותה תווית בדיוק**
                    (מאותה נגזרת), והלחיצה מביאה לשם. ‼ בכוונה לא משוכפלת
                    כאן פעולה שנייה מול רשות: שני כפתורים שמריצים את אותה
                    פעולה משני מסכים הם בדיוק איך נוצרות בקשות כפולות. */}
                {row.authority === 'income_tax' && shaamRepAction && !hideRepresentationPlaceholder && (
                  <button type="button" className="txf-check-btn btn-automation"
                    disabled={!onOpenRepresentation}
                    title={onOpenRepresentation
                      ? `${shaamRepAction.label} — במרכז ביצוע הייצוג`
                      : 'הפעולה זמינה במרכז ביצוע הייצוג.'}
                    onClick={() => onOpenRepresentation?.()}>
                    <span className="txf-check-lbl">{shaamRepAction.label}</span>
                  </button>
                )}
              </>
            }
          >
            {/* ‼ (154) כרטיס ב"ל: שני בלוקי-אדם במקום רשת אחת — התשובה ל"של
                מי הנתונים" היא כותרת הבלוק. לקוח/ה יחיד/ה — רשת אחת. */}
            {twoPersons ? (
              row.persons!.map((person, pi) => {
                const personEditId = `${sectionId}:${person.role}`;
                const editingPerson = editingSection === personEditId;
                return (
                  <div className="txf-person" key={person.role}>
                    <div className="txf-person-head">
                      <span className="txf-person-name">{person.name}</span>
                      <span className="txf-person-idctx">ת.ז. {person.idNumber || '—'}</span>
                      {!person.editable && (
                        <span className="txf-person-linked">
                          הנתונים בכרטיס של {person.name}
                          {spouseClient && onOpenSpouseClient && (
                            <button type="button" className="ui-linkbtn"
                              onClick={() => onOpenSpouseClient(spouseClient.id)}>
                              פתיחת הכרטיס
                            </button>
                          )}
                        </span>
                      )}
                    </div>
                    <div className="txf-kv">
                      {person.facts.map((f, i) => {
                        // ‼ ת.ז. כבר בכותרת הבלוק — לא כפילות כאן (index יציב לבדיקה).
                        if (f.k === 'ת.ז.') return null;
                        const editingScalar = editingPerson && !!(f.editKey && EDIT_FIELD_BY_KEY[f.editKey]);
                        const editingTaxFileNumber = editingPerson && !!f.taxFileNumberAuthority;
                        // ‼ בדיקת האוטומציה נגזרת מ-row.facts (=persons[0]) — סמן רק באדם הראשון.
                        const fieldCheck = pi === 0 && check?.checkedAt ? check.fields[i] : undefined;
                        return (
                          <div key={i}>
                            <FieldLabel f={f} status={fieldCheck && <FieldStatusMark status={fieldCheck.status} />} />
                            {renderValue(f, editingPerson, person.role)}
                            {/* ‼ שורת "ייצוג" — הפעולה ההקשרית של האדם הזה, לפי role מפורש. */}
                            {f.niRepAction && !hideNiRepresentationActions && !editingScalar && !editingTaxFileNumber && (
                              (f.niRepAction.kind === 'enter_btl' || f.niRepAction.kind === 'check_btl')
                                ? <NiNextActionButton client={client} spouseClient={spouseClient} role={person.role}
                                    action={f.niRepAction} track={niTrackOf(person.role)} onChanged={onNiInstructionsSent} />
                                : <>
                                  <button type="button" className="ui-linkbtn"
                                    disabled={f.niRepAction.kind === 'add' && niAddBusy !== null}
                                    onClick={() => {
                                      if (f.niRepAction!.kind === 'add') void runAddNiTarget(person.role);
                                      else if (f.niRepAction!.kind === 'send') {
                                        onSendNiInstructions?.({ role: person.role, name: person.name, idNumberMasked: person.idNumber });
                                      } else onOpenRepresentation?.();
                                    }}>
                                    {f.niRepAction.kind === 'add' && niAddBusy === person.role ? 'שומר…' : f.niRepAction.label}
                                  </button>
                                  {f.niRepAction.kind === 'add' && niAddError && (
                                    <div className="txf-qt-err">{niAddError}</div>
                                  )}
                                </>
                            )}
                            {fieldCheck && !editingPerson && spec && (
                              <FieldAuthorityLine field={fieldCheck} sourceLabel={spec.sourceLabel} />
                            )}
                          </div>
                        );
                      })}
                    </div>

                    {/* ‼ עיסוקים — לכל אדם הרשימה שלו/ה. */}
                    {editingPerson && (
                      <div className="txf-editor">
                        <h4>עיסוקים בביטוח לאומי{person.role === 'spouse' ? ` — ${person.name}` : ''}</h4>
                        <OccupationsEditor occupations={sectionOccDrafts} onChange={setSectionOccDrafts} />
                      </div>
                    )}
                    {editingPerson && <EditActions />}
                    {person.editable && (
                      <SrcLine
                        label={srcLabel}
                        onDetailed={pi === 0 ? detailed : undefined}
                        onEdit={
                          editingPerson || !person.facts.some(f => f.editKey || f.taxFileNumberAuthority)
                            ? undefined
                            : () => {
                                const editFields = person.facts
                                  .map(f => f.editKey ? EDIT_FIELD_BY_KEY[f.editKey] : undefined)
                                  .filter((d): d is EditField => !!d);
                                const tf = person.facts.find(f => f.taxFileNumberAuthority);
                                startSectionEdit(personEditId, editFields, {
                                  ...(tf ? { taxFileAuthority: tf.taxFileNumberAuthority, taxFileOwner: tf.taxFileNumberOwner ?? 'client' } : {}),
                                  niOwner: person.role,
                                });
                              }
                        }
                      />
                    )}
                  </div>
                );
              })
            ) : (
              <div className="txf-kv">
                {row.facts.map((f, i) => {
                  const fieldCheck = check?.checkedAt ? check.fields[i] : undefined;
                  return (
                    <div key={i}>
                      {/* ‼ סמן המצב לפני התווית, קטן וללא מילים — רק אחרי בדיקה. */}
                      <FieldLabel f={f} status={fieldCheck && <FieldStatusMark status={fieldCheck.status} />} />
                      {renderValue(f, editingThis, 'client')}
                      {/* ‼ שורת הרשות רק כשיש מה לומר; האישור מקובץ בסיכום. */}
                      {fieldCheck && !editingThis && spec && (
                        <FieldAuthorityLine field={fieldCheck} sourceLabel={spec.sourceLabel} />
                      )}
                      {/* ‼ לקוח/ה יחיד/ה בב"ל: הפעולה ההקשרית של הייצוג יושבת כאן. */}
                      {f.niRepAction && !hideNiRepresentationActions && !editingThis && (
                        (f.niRepAction.kind === 'enter_btl' || f.niRepAction.kind === 'check_btl')
                          ? <NiNextActionButton client={client} spouseClient={spouseClient} role="client"
                              action={f.niRepAction} track={niTrackOf('client')} onChanged={onNiInstructionsSent} />
                          : <button type="button" className="ui-linkbtn"
                              disabled={f.niRepAction.kind === 'add' && niAddBusy !== null}
                              onClick={() => {
                                if (f.niRepAction!.kind === 'add') void runAddNiTarget('client');
                                else if (f.niRepAction!.kind === 'send') {
                                  onSendNiInstructions?.({ role: 'client', name: `${client.firstName} ${client.lastName}`.trim(), idNumberMasked: client.idNumber });
                                } else onOpenRepresentation?.();
                              }}>
                              {f.niRepAction.kind === 'add' && niAddBusy === 'client' ? 'שומר…' : f.niRepAction.label}
                            </button>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            {/* ‼ סיכום הבדיקה פעם אחת לכרטיס: מה נבדק, כמה שינויים, כפתור
                אישור אחד — גם שגיאת ריצה וגם סיבת חסימה, לא ליד כל שדה. */}
            {spec && !cardEditing && (
              <AuthorityCheckSummary
                result={check}
                sourceLabel={spec.sourceLabel}
                runError={sync?.error ?? null}
                approving={approvingAuthority === row.authority}
                approveError={approvingAuthority === null ? approveError : null}
                approveNotice={approvingAuthority === null ? approveNotice : null}
                onApprove={() => { if (check) void approveAuthorityChanges(spec, check); }}
              >
                {(inputBlocked ?? unavailable) && !running && <div className="txf-check-note">{inputBlocked ?? unavailable}</div>}
              </AuthorityCheckSummary>
            )}

            {!twoPersons && editingThis && <EditActions />}
            {!twoPersons && (
              <SrcLine
                label={srcLabel}
                onDetailed={detailed}
                onEdit={
                  editingThis || !row.facts.some(f => f.editKey || f.taxFileNumberAuthority)
                    ? undefined
                    : () => {
                        const editFields = row.facts
                          .map(f => f.editKey ? EDIT_FIELD_BY_KEY[f.editKey] : undefined)
                          .filter((d): d is EditField => !!d);
                        const tfAuthority = row.facts.find(f => f.taxFileNumberAuthority)?.taxFileNumberAuthority;
                        startSectionEdit(sectionId, editFields, tfAuthority ? { taxFileAuthority: tfAuthority } : undefined);
                      }
                }
              />
            )}
          </TRow>
        );
      })}
    </div>
  );
}

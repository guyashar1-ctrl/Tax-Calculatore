// ─── בדיקת שלמות עץ ורישום — רץ ידנית: npm run validate:1301 ───────────────
// בודק שכל ההפניות בעץ וברישום השדות עקביות. מיועד לרוץ אחרי כל שינוי בעץ.

import { annualReportTree, estimateTotalQuestions } from './tree';
import { form1301Fields } from './form1301Fields';
import { emptyModel } from './types';
import type { AnswerValue, TaxpayerModel, QuestionNode } from './types';

interface Issue { level: 'error' | 'warn'; msg: string }
const issues: Issue[] = [];

const nodeIds = new Set(Object.keys(annualReportTree.nodes));
const fieldNumbers = new Set(form1301Fields.map((f) => f.fieldNumber));

// 1. rootNodeId קיים
if (!nodeIds.has(annualReportTree.rootNodeId)) {
  issues.push({ level: 'error', msg: `rootNodeId '${annualReportTree.rootNodeId}' לא קיים` });
}

// 2. targetFieldCodes של כל שאלה מפנים לשדות קיימים
for (const node of Object.values(annualReportTree.nodes)) {
  for (const code of node.targetFieldCodes ?? []) {
    if (!fieldNumbers.has(code)) {
      issues.push({ level: 'error', msg: `שאלה '${node.id}' מפנה לשדה לא קיים '${code}'` });
    }
  }
  if (!node.chapter) {
    issues.push({ level: 'warn', msg: `שאלה '${node.id}' ללא שיוך פרק` });
  }
}

// 3. sourceQuestionIds של כל שדה מפנים לשאלות קיימות
for (const field of form1301Fields) {
  for (const qid of field.sourceQuestionIds) {
    if (!nodeIds.has(qid)) {
      issues.push({ level: 'error', msg: `שדה '${field.fieldNumber}' מפנה לשאלה לא קיימת '${qid}'` });
    }
  }
}

// 4. ייחודיות fieldNumber
const seen = new Set<string>();
for (const f of form1301Fields) {
  if (seen.has(f.fieldNumber)) issues.push({ level: 'error', msg: `fieldNumber כפול: '${f.fieldNumber}'` });
  seen.add(f.fieldNumber);
}

// 5. סימולציית מסלולים — עוברים מסלולים שלמים ומוודאים שאין מבוי סתום.
//    לכל שאלה עונים תשובת ברירת מחדל ובודקים שה-next קיים.
function defaultAnswer(nodeId: string, m: TaxpayerModel): AnswerValue {
  const node = annualReportTree.nodes[nodeId];
  switch (node.type) {
    case 'boolean': return false;
    case 'number': return 1;
    case 'text': return 'בדיקה';
    case 'single_select': return node.options?.[0]?.value ?? '';
    case 'multi_select': return [];
  }
  return String(m.taxYear);
}

function walkPath(label: string, answers: Record<string, AnswerValue>): number {
  let model = emptyModel(2025);
  let currentId: string | null = annualReportTree.rootNodeId;
  let steps = 0;
  const visited = new Set<string>();
  while (currentId) {
    if (steps > 200) {
      issues.push({ level: 'error', msg: `מסלול '${label}': לולאה אינסופית ב-'${currentId}'` });
      break;
    }
    const node: QuestionNode | undefined = annualReportTree.nodes[currentId];
    if (!node) {
      issues.push({ level: 'error', msg: `מסלול '${label}': הגעה לשאלה לא קיימת '${currentId}'` });
      break;
    }
    if (visited.has(currentId)) {
      issues.push({ level: 'error', msg: `מסלול '${label}': ביקור חוזר ב-'${currentId}'` });
      break;
    }
    visited.add(currentId);
    steps++;
    const skip: boolean = !!node.visibleWhen && !node.visibleWhen(model);
    const answer: AnswerValue = answers[currentId] ?? defaultAnswer(currentId, model);
    if (!skip) model = node.applyToModel(model, answer);
    const nextId: string | null = skip
      ? node.next(undefined as unknown as AnswerValue, model)
      : node.next(answer, model);
    currentId = nextId;
  }
  return steps;
}

// מסלולים מייצגים
const PATHS: Array<{ label: string; answers: Record<string, AnswerValue> }> = [
  { label: 'שכיר רווק פשוט', answers: { year_map: ['salary'], marital_status: 'single', children_count: 0, residency_type: 'resident' } },
  {
    label: 'נשוי + עסק + שכירות',
    answers: {
      year_map: ['salary', 'business', 'rental'], marital_status: 'married',
      spouse_has_income: true, spouse_has_106: true, children_count: 2,
      residency_type: 'resident', rental_track: 'flat10',
    },
  },
  {
    label: 'משקיע: שוק ההון + חו"ל + חברות',
    answers: {
      year_map: ['capital', 'foreign', 'companies'], marital_status: 'married',
      capital_has_securities: true, has_interest_income: true,
      foreign_income_kinds: ['capital', 'dividend'],
      companies_situations: ['own_dividend', 'owner_withdrawals'],
    },
  },
  {
    label: 'פנסיונר + קצבאות ב"ל + מצבים מיוחדים',
    answers: {
      year_map: ['pension_ni', 'other'], marital_status: 'widowed',
      has_pension_income: true, ni_maternity: false, ni_unemployment: true,
      has_other_income: true, other_income_kinds: ['gambling'],
      special_situations_select: ['losses', 'trust'], carried_losses: ['business_carry'],
    },
  },
];

let pathReport = '';
for (const p of PATHS) {
  const steps = walkPath(p.label, p.answers);
  pathReport += `  ✓ ${p.label}: ${steps} שאלות (כולל מדולגות)\n`;
}

// ─── פלט ───────────────────────────────────────────────────────────────────
const errors = issues.filter((i) => i.level === 'error');
const warns = issues.filter((i) => i.level === 'warn');

console.log(`\n═══ בדיקת שלמות 1301 ═══`);
console.log(`שאלות בעץ: ${nodeIds.size} | שדות ברישום: ${fieldNumbers.size}`);
console.log(`צפי לשכיר פשוט: ~${estimateTotalQuestions({ ...emptyModel(2025), income: { sources: ['salary'] } } as TaxpayerModel)} שאלות`);
console.log(pathReport);
if (warns.length) { console.log(`⚠ אזהרות (${warns.length}):`); warns.forEach((w) => console.log('  - ' + w.msg)); }
if (errors.length) {
  console.log(`✗ שגיאות (${errors.length}):`); errors.forEach((e) => console.log('  - ' + e.msg));
  process.exit(1);
}
console.log('✓ אין שגיאות עקביות');

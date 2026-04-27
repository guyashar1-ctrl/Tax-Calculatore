// ─── העשרת לקוחות הדוגמה במידע תיק עבודה ────────────────────────────────
// פרופיל מיסוי מורחב, אנשי קשר נוספים, פעילות, התראות.
// משאיר את sampleClients.ts כמו שהוא — רק עוטף.

import { Client } from '../types';
import {
  ClientContact,
  ActivityEntry,
  ClientWorkspaceExtensions,
} from '../types/clientWorkspace';

const daysAgo = (n: number) => {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString();
};

const daysFromNow = (n: number) => {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d.toISOString().split('T')[0];
};

const yearsFromNow = (n: number) => {
  const d = new Date();
  d.setFullYear(d.getFullYear() + n);
  return d.toISOString().split('T')[0];
};

const monthsAgo = (n: number) => {
  const d = new Date();
  d.setMonth(d.getMonth() - n);
  return d.toISOString();
};

function mkActivity(items: { kind: ActivityEntry['kind']; text: string; daysAgo: number }[]): ActivityEntry[] {
  return items.map((it, i) => ({
    id: `act-${Math.random().toString(36).slice(2, 8)}-${i}`,
    at: daysAgo(it.daysAgo),
    kind: it.kind,
    text: it.text,
    authorName: 'גיא',
  }));
}

const PROFILES: Record<string, ClientWorkspaceExtensions> = {
  // ── 1. דוד כהן — שכיר פשוט ─────────────────────────────────────
  'sample-1': {
    assignedAccountantId: 'emp-self',
    tags: ['שכיר', 'הייטק', 'משלם מס מקסימלי'],
    pinnedNote: 'מבקש לקבל סיכום שנתי בתחילת מרץ. קשר ישיר במייל.',
    additionalContacts: [
      { id: 'k1', role: 'בן/בת זוג', name: 'רחל כהן', phone: '050-9876543', email: 'rachel@example.com' },
    ],
    vatFrequency: undefined,                  // לא רלוונטי לשכיר
    pitAdvancePercent: 0,
    withholdingFrequency: 'none',
    shaamStatus: 'active',
    shaamCreatedAt: '2022-03-15T08:00:00Z',
    shaamLastUsed: monthsAgo(1),
    shaamSource: 'shaam',
    bookStatus: 'kosher',
    taxOfficeName: 'תל אביב 4',
    niBranchName: 'תל אביב',
    hasWealthDeclaration: true,
    lastWealthDeclarationYear: 2020,
    activity: mkActivity([
      { kind: 'task_created', text: 'נוצרה משימה: דיווח שנתי 2025', daysAgo: 5 },
      { kind: 'doc_uploaded', text: 'הועלה: טופס 106 — חברת הייטק', daysAgo: 12 },
      { kind: 'note', text: 'שיחה עם דוד — מאשר את החזר המס. מעדכן בהמשך.', daysAgo: 18 },
      { kind: 'status_change', text: 'שע״ם — חודש בהצלחה לשנה הקרובה', daysAgo: 45 },
    ]),
  },

  // ── 2. מיכל לוי — הורה יחיד ──────────────────────────────────
  'sample-2': {
    assignedAccountantId: 'emp-shira',
    tags: ['הורה יחיד', 'מורה', 'נכות בילד'],
    pinnedNote: 'מקבלת קבצים בוואטסאפ. לא לשלוח SMS אוטומטיים.',
    additionalContacts: [
      { id: 'k2', role: 'עו״ד גירושין', name: 'יעל בכר', phone: '03-1234567', email: 'yael@law.co.il', notes: 'משלמת מזונות — לבדוק זיכויים' },
    ],
    pitAdvancePercent: 0,
    withholdingFrequency: 'none',
    shaamStatus: 'active',
    shaamCreatedAt: '2023-01-10T08:00:00Z',
    shaamLastUsed: monthsAgo(2),
    shaamSource: 'manual',
    bookStatus: 'kosher',
    taxOfficeName: 'ירושלים 1',
    niBranchName: 'ירושלים',
    activity: mkActivity([
      { kind: 'doc_uploaded', text: 'הועלה: אישור נכות 50% — ילד', daysAgo: 8 },
      { kind: 'task_completed', text: 'הסתיימה: בקשת נקודות זיכוי הורה יחיד', daysAgo: 25 },
      { kind: 'note', text: 'מבקשת בדיקה האם זכאית ל-2 נקודות נוספות', daysAgo: 40 },
    ]),
  },

  // ── 3. יוסי אברהם — עוסק מורשה ─────────────────────────────
  'sample-3': {
    assignedAccountantId: 'emp-self',
    tags: ['עוסק מורשה', 'ייעוץ', 'דיווח דו-חודשי'],
    pinnedNote: 'מבקש דוח מע״מ מודפס לפני שליחה. תמיד.',
    additionalContacts: [
      { id: 'k3', role: 'מנהל חשבונות שכיר', name: 'אלון רביב', phone: '04-9999999', email: 'alon@hashbon.co.il' },
      { id: 'k4', role: 'עו״ד מסחרי', name: 'דניאל בן-דוד', phone: '04-8888888' },
    ],
    vatFrequency: 'bi_monthly',
    vatDetailedReport: true,
    vatDetailedReportStartDate: '2023-01-01',
    pitAdvancePercent: 18,
    pitAdvanceFrequency: 'bi_monthly',
    withholdingFrequency: 'bi_monthly',
    withholdingRate: 30,
    withholdingValidUntil: yearsFromNow(1),
    bookStatus: 'kosher',
    niAdvanceMonthly: 2400,
    shaamStatus: 'active',
    shaamCreatedAt: '2021-06-20T08:00:00Z',
    shaamLastUsed: daysAgo(3),
    shaamSource: 'shaam',
    taxOfficeName: 'חיפה 2',
    withholdingOfficeName: 'חיפה',
    niBranchName: 'חיפה',
    activity: mkActivity([
      { kind: 'doc_uploaded', text: 'הועלה: חשבוניות רבעון 1', daysAgo: 2 },
      { kind: 'task_created', text: 'נוצרה משימה: דיווח מע״מ מרץ-אפריל', daysAgo: 4 },
      { kind: 'status_change', text: 'שע״ם — שימוש אחרון לחיתוך נתוני בנק', daysAgo: 3 },
      { kind: 'note', text: 'יוסי מבקש לעבור לדיווח חד-חודשי בשנה הבאה', daysAgo: 22 },
      { kind: 'task_completed', text: 'הסתיימה: שומה 2024', daysAgo: 60 },
    ]),
  },

  // ── 4. אורית שפירא — שכירה+עצמאית ─────────────────────────
  'sample-4': {
    assignedAccountantId: 'emp-shira',
    tags: ['שכיר+עצמאי', 'תיאום מס', 'הדרכה'],
    pinnedNote: 'יש לוודא שתיאום המס עודכן בכל תחילת שנה.',
    additionalContacts: [
      { id: 'k5', role: 'מנהלת משאבי אנוש (שכיר)', name: 'מורן זילברמן', email: 'moran@company.co.il' },
    ],
    vatFrequency: 'bi_monthly',
    vatDetailedReport: false,
    pitAdvancePercent: 12,
    pitAdvanceFrequency: 'bi_monthly',
    withholdingFrequency: 'none',
    withholdingRate: 0,
    bookStatus: 'kosher',
    shaamStatus: 'active',
    shaamCreatedAt: '2022-09-01T08:00:00Z',
    shaamLastUsed: daysAgo(15),
    shaamSource: 'shaam',
    taxOfficeName: 'נתניה',
    niBranchName: 'נתניה',
    activity: mkActivity([
      { kind: 'task_created', text: 'נוצרה משימה: תיאום מס 2026', daysAgo: 1 },
      { kind: 'doc_uploaded', text: 'הועלה: אישור תיאום מס משרד', daysAgo: 30 },
    ]),
  },

  // ── 5. נטשה גולדברג — עולה חדשה ──────────────────────────
  'sample-5': {
    assignedAccountantId: 'emp-orit',
    tags: ['עולה חדש', 'זכאית הנחה', 'לא דובר עברית'],
    pinnedNote: 'תקשורת באנגלית או ברוסית. לא להשתמש במונחים מקצועיים.',
    additionalContacts: [
      { id: 'k6', role: 'מתורגמנית', name: 'ויקטוריה אילין', phone: '050-0000001', notes: 'תרגום מסמכים מרוסית' },
    ],
    pitAdvancePercent: 0,
    withholdingFrequency: 'none',
    shaamStatus: 'pending',
    shaamCreatedAt: monthsAgo(2),
    shaamSource: 'manual',
    bookStatus: 'kosher',
    taxOfficeName: 'נתניה',
    niBranchName: 'נתניה',
    activity: mkActivity([
      { kind: 'note', text: 'הוגשה בקשת הרשאת שע״ם — ממתין לאישור הרשות', daysAgo: 14 },
      { kind: 'doc_uploaded', text: 'הועלה: תעודת עלייה 2023', daysAgo: 60 },
    ]),
  },

  // ── 6. מוחמד חוסין — שדרות, נכות ─────────────────────────
  'sample-6': {
    assignedAccountantId: 'emp-self',
    tags: ['ישוב מזכה', 'נכות 35%', '4 ילדים'],
    pinnedNote: 'מקבל החזר מס משמעותי בזכות זיכוי שדרות + נכות.',
    additionalContacts: [
      { id: 'k7', role: 'אחות מבעבר', name: 'נורא חוסין', phone: '052-1112222', notes: 'מסייעת בתרגום מסמכים' },
    ],
    pitAdvancePercent: 0,
    withholdingFrequency: 'none',
    shaamStatus: 'active',
    shaamCreatedAt: '2020-04-12T08:00:00Z',
    shaamLastUsed: monthsAgo(3),
    shaamSource: 'shaam',
    bookStatus: 'kosher',
    taxOfficeName: 'אשקלון',
    niBranchName: 'אשקלון',
    activity: mkActivity([
      { kind: 'doc_uploaded', text: 'הועלה: אישור מגורים בשדרות 2025', daysAgo: 90 },
      { kind: 'task_completed', text: 'הסתיימה: דיווח שנתי 2024', daysAgo: 120 },
    ]),
  },

  // ── 7. רון בר-לב — עו״ד עצמאי ──────────────────────────
  'sample-7': {
    assignedAccountantId: 'emp-self',
    tags: ['עוסק מורשה', 'הכנסה גבוהה', 'תא משפחתי', 'דיון שומה'],
    pinnedNote: 'תיק מורכב — תא משפחתי + שניהם עצמאיים. תמיד לסקור עם רון לפני הגשה.',
    additionalContacts: [
      { id: 'k8', role: 'בת זוג', name: 'תמר בר-לב', phone: '054-8901234', email: 'tamar@design.co.il' },
      { id: 'k9', role: 'יועצת השקעות', name: 'מיכל אורן', phone: '03-7654321', email: 'michal@inv.co.il' },
    ],
    vatFrequency: 'monthly',
    vatDetailedReport: true,
    vatDetailedReportStartDate: '2022-01-01',
    pitAdvancePercent: 35,
    pitAdvanceFrequency: 'monthly',
    withholdingFrequency: 'monthly',
    withholdingRate: 47,
    withholdingValidUntil: daysFromNow(20),  // עומד לפוג!
    bookStatus: 'kosher',
    niAdvanceMonthly: 5800,
    shaamStatus: 'inactive',                 // התראה
    shaamCreatedAt: '2019-02-10T08:00:00Z',
    shaamLastUsed: monthsAgo(8),
    shaamSource: 'manual',
    taxOfficeName: 'תל אביב 5',
    withholdingOfficeName: 'תל אביב',
    niBranchName: 'הרצליה',
    hasWealthDeclaration: true,
    lastWealthDeclarationYear: 2018,
    activity: mkActivity([
      { kind: 'task_created', text: 'נוצרה משימה: דיון שומה 2022 עם רפרנט', daysAgo: 3 },
      { kind: 'note', text: 'התקשר רון — דורש פגישה לפני הדיון. נקבע ל-2026-05-15.', daysAgo: 4 },
      { kind: 'status_change', text: 'הרשאת שע״ם — בוטלה (לא חודשה בזמן)', daysAgo: 60 },
      { kind: 'doc_uploaded', text: 'הועלו: כל החשבוניות 2025 רבעון 1', daysAgo: 25 },
    ]),
  },
};

/**
 * מחזיר את הלקוח כשהוא מועשר בנתוני workspace (אם יש פרופיל זמין).
 * לקוח שלא מופיע במפה — מקבל ערכי ברירת מחדל מינימליים.
 */
export function enrichClientWithWorkspace(c: Client): Client {
  const profile = PROFILES[c.id];
  if (!profile) {
    return {
      ...c,
      assignedAccountantId: c.assignedAccountantId ?? 'emp-self',
      tags: c.tags ?? [],
      additionalContacts: c.additionalContacts ?? [],
      activity: c.activity ?? [],
    };
  }
  // לא לדרוס שדות שכבר קיימים בלקוח (אם המשתמש ערך)
  return {
    ...profile,
    ...c,
    // אבל פרופיל החדש יותר מנצח ב-arrays של דמו
    additionalContacts: c.additionalContacts ?? profile.additionalContacts,
    activity: c.activity ?? profile.activity,
    tags: c.tags ?? profile.tags,
  };
}

export function enrichClientsWithWorkspace(clients: Client[]): Client[] {
  return clients.map(enrichClientWithWorkspace);
}

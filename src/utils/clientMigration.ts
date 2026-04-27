// ─── מיגרציה של לקוחות קיימים ל-workspace ─────────────────────────────────
// בלקוחות שבאחסון מקומי שאין להם שדות workspace — נוסיף מתוך הפרופיל לדוגמה
// (אם זה לקוח דוגמה לפי ID), אחרת נוסיף ערכי ברירת מחדל מינימליים.

import { Client } from '../types';
import { enrichClientWithWorkspace } from '../data/sampleClientWorkspace';

interface MigrationResult {
  clients: Client[];
  migratedCount: number;
}

/** האם ללקוח חסרים שדות workspace (כלומר נוצר לפני שהוצגו) */
function needsWorkspaceMigration(c: Client): boolean {
  return c.activity === undefined && c.assignedAccountantId === undefined && c.tags === undefined;
}

export function migrateClients(clients: Client[]): MigrationResult {
  let migrated = 0;
  const result = clients.map(c => {
    if (!needsWorkspaceMigration(c)) return c;
    migrated++;
    return enrichClientWithWorkspace(c);
  });
  return { clients: result, migratedCount: migrated };
}

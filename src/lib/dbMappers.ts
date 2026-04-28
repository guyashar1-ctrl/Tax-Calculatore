import type {
  Client,
  Task,
  RepresentationRequest,
} from '../types';
import type { Employee } from '../types/clientWorkspace';

function toSnake(s: string): string {
  // Convert camelCase / PascalCase to snake_case, treating runs of uppercase
  // letters as a single acronym. e.g. "completedIDF" → "completed_idf",
  // "XMLParser" → "xml_parser", "birthDate" → "birth_date".
  return s
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1_$2')
    .toLowerCase();
}

function toCamel(s: string): string {
  return s.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase());
}

function rowToObject<T>(row: Record<string, any>): T {
  const out: Record<string, any> = {};
  for (const [k, v] of Object.entries(row)) {
    out[toCamel(k)] = v === null ? undefined : v;
  }
  return out as T;
}

function objectToRow<T extends Record<string, any>>(obj: T, exclude: string[] = []): Record<string, any> {
  const out: Record<string, any> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (exclude.includes(k)) continue;
    if (v === undefined) continue;
    // Skip empty strings: PostgreSQL rejects '' for date/numeric columns. Letting the
    // column take its default (NULL) is the consistent behavior across all column types.
    if (v === '') continue;
    out[toSnake(k)] = v;
  }
  return out;
}

// ───────────────────────────────────────── Client ─────────────────────────

const CLIENT_OMIT_ON_WRITE = ['updatedAt'];

export function clientFromDb(row: Record<string, any>): Client {
  const c = rowToObject<Client>(row);
  if (!c.children) c.children = [] as any;
  if (!c.tags) c.tags = [];
  return c;
}

export function clientToDb(client: Partial<Client>, userId?: string): Record<string, any> {
  const row = objectToRow(client, CLIENT_OMIT_ON_WRITE);
  if (userId) row.user_id = userId;
  return row;
}

// ───────────────────────────────────────── Task ───────────────────────────

const TASK_OMIT_ON_WRITE = ['updatedAt'];

export function taskFromDb(row: Record<string, any>): Task {
  return rowToObject<Task>(row);
}

export function taskToDb(task: Partial<Task>, userId?: string): Record<string, any> {
  const row = objectToRow(task, TASK_OMIT_ON_WRITE);
  if (userId) row.user_id = userId;
  return row;
}

// ────────────────────────── RepresentationRequest ─────────────────────────

const REP_OMIT_ON_WRITE = ['updatedAt'];

export function repRequestFromDb(row: Record<string, any>): RepresentationRequest {
  // DB column is part_b → camelCase becomes partB. Same for all others.
  const r = rowToObject<RepresentationRequest>(row);
  if (!r.requestedDocs) r.requestedDocs = [] as any;
  if (!r.authorities) r.authorities = [] as any;
  return r;
}

export function repRequestToDb(req: Partial<RepresentationRequest>, userId?: string): Record<string, any> {
  // Drop the legacy IndexedDB-specific field that doesn't exist in the new schema
  const { signedPdfStoredId: _drop, ...rest } = req as any;
  const row = objectToRow(rest, REP_OMIT_ON_WRITE);
  if (userId) row.user_id = userId;
  return row;
}

// ───────────────────────────────────────── Employee ───────────────────────

const EMP_OMIT_ON_WRITE = ['updatedAt'];

export function employeeFromDb(row: Record<string, any>): Employee {
  return rowToObject<Employee>(row);
}

export function employeeToDb(emp: Partial<Employee>, userId?: string): Record<string, any> {
  const row = objectToRow(emp, EMP_OMIT_ON_WRITE);
  if (userId) row.user_id = userId;
  return row;
}

// ─── ההרכב של צילום תעודה: מה כל עמוד ב-PDF (16.10.2026) ────────────────────────────────────
// ‼ מגיע מהדפדפן (src/features/identity/idFlex.ts) כשדה טופס «parts» — JSON של
//   [{ page, part, tag }]. זה תיאור בלבד: המשרד רואה «קדמי+ספח · אחורי» ליד הקובץ, וה-PDF עצמו כבר
//   נבנה בסדר הזה. לא משפיע על מה שהשרת אוכף; הרכב לא תקין פשוט מושמט.

export interface IdPart { page: number; part: string; tag?: string }

const TAGS = new Set(["front", "back", "appendix", "frontAppendix", "all", "page"]);
const SHORT: Record<string, string> = {
  front: "קדמי", back: "אחורי", appendix: "ספח", frontAppendix: "קדמי+ספח", all: "הכול יחד", page: "עמוד",
};

export function parseParts(raw: FormDataEntryValue | null): IdPart[] | null {
  if (typeof raw !== "string" || !raw.trim()) return null;
  try {
    const v = JSON.parse(raw);
    if (!Array.isArray(v) || v.length === 0 || v.length > 30) return null;
    const out: IdPart[] = [];
    for (const x of v) {
      if (!x || typeof x !== "object") return null;
      const page = Number((x as { page?: unknown }).page);
      const part = String((x as { part?: unknown }).part ?? "").trim().slice(0, 60);
      const tag = String((x as { tag?: unknown }).tag ?? "").trim();
      if (!Number.isInteger(page) || page < 1 || page > 30 || !part) return null;
      out.push({ page, part, ...(TAGS.has(tag) ? { tag } : {}) });
    }
    return out;
  } catch {
    return null;
  }
}

/** «קדמי+ספח · אחורי» — תקציר להצגה. */
export function partsSummary(parts: IdPart[] | null | undefined): string {
  if (!parts?.length) return "";
  return parts.map((p) => (p.tag && SHORT[p.tag]) || p.part).join(" · ");
}

/** הערת המסמך עם ההרכב, או ההערה הבסיסית כשאין הרכב. */
export function partsNote(base: string, parts: IdPart[] | null | undefined): string {
  const s = partsSummary(parts);
  return s ? `${base} · עמודים: ${s}` : base;
}

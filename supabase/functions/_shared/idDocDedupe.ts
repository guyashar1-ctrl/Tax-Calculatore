// ─── אותו צילום מזהה, לאותו אדם — לא נשמר פעמיים (213) ─────────────────────
// גיא, 01.10.2026: «קובץ זהה שהועלה לנישום ולבן הזוג אינו בהכרח מסמך תקין של
// שניהם … יש לשמור שיוך ואישור נפרדים לכל אדם … אל תסיק בעלות מתוך זהות הקבצים».
// ‼ לכן: כפילות = אותם בייטים בדיוק **שכבר משויכים לאותו אדם**. אותו קובץ לאדם אחר
// הוא רשומה נפרדת (עותק משלה) — עם שיוך, אישור, שם ותיקייה משלה. אחסון לא משותף:
// מחיקה/העברה של מסמך אצל אחד לא יכולה לשבור את המסמך של השני.

// deno-lint-ignore no-explicit-any
type Admin = any;

export async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const d = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * מבין המסמכים האלה (המשויכים לאדם) — אחד עם אותו תוכן בדיוק, או null.
 * מסמכים ישנים בלי טביעה נבדקים לפי גודל ואז לפי התוכן עצמו (ומקבלים טביעה).
 */
export async function findIdenticalAmong(admin: Admin, docIds: string[], bytes: Uint8Array, hash: string): Promise<string | null> {
  const ids = [...new Set(docIds.filter(Boolean))];
  if (!ids.length) return null;
  const { data: rows } = await admin.from("documents").select("id, storage_path, file_size, content_sha256").in("id", ids);
  for (const d of (rows ?? []) as { id: string; storage_path: string; file_size: number; content_sha256: string | null }[]) {
    if (d.content_sha256) { if (d.content_sha256 === hash) return d.id; continue; }
    if (Number(d.file_size) !== bytes.length || !d.storage_path) continue;
    const { data: file } = await admin.storage.from("client-documents").download(d.storage_path);
    if (!file) continue;
    const h = await sha256Hex(new Uint8Array(await file.arrayBuffer()));
    await admin.from("documents").update({ content_sha256: h }).eq("id", d.id);
    if (h === hash) return d.id;
  }
  return null;
}

/** המסמכים המשויכים לאדם ב-identity_docs של בקשה. */
export function personDocIds(identityDocs: unknown, person: string): string[] {
  const list = (identityDocs as Record<string, unknown> | null)?.[person];
  return Array.isArray(list) ? list.map((e) => String((e as { documentId?: string })?.documentId ?? "")).filter(Boolean) : [];
}

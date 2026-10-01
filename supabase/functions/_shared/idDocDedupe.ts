// ─── אותו צילום מזהה בדיוק — נשמר פעם אחת ללקוח (212) ───────────────────────
// גיא, 01.10.2026: «לשמור פעם אחת». לקוח שמעלה את אותו קובץ גם לעצמו וגם לבן/בת
// הזוג (למשל ספח משותף) — הקובץ נשמר פעם אחת ומשויך לשניהם. הבעלות נקבעת לפי
// המקום שאליו הועלה (identity_docs), לא לפי התוכן.
// ‼ «זהה» = אותם בייטים בדיוק (sha256). קובץ דומה (צילום נוסף של אותה תעודה) —
// קובץ אחר, נשמר כרגיל.

// deno-lint-ignore no-explicit-any
type Admin = any;

export async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const d = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * מסמך מזהה של אותו לקוח עם אותו תוכן בדיוק — המזהה שלו, או null.
 * מסמכים ישנים בלי טביעה נבדקים לפי גודל ואז לפי התוכן עצמו (ומקבלים טביעה).
 */
export async function findIdenticalIdDoc(admin: Admin, clientId: string, bytes: Uint8Array, hash: string): Promise<string | null> {
  const { data: byHash } = await admin.from("documents").select("id")
    .eq("client_id", clientId).eq("category", "id_card").eq("content_sha256", hash).limit(1);
  if (byHash?.[0]?.id) return byHash[0].id as string;
  const { data: sameSize } = await admin.from("documents").select("id, storage_path")
    .eq("client_id", clientId).eq("category", "id_card").is("content_sha256", null).eq("file_size", bytes.length).limit(5);
  for (const d of (sameSize ?? []) as { id: string; storage_path: string }[]) {
    const { data: file } = await admin.storage.from("client-documents").download(d.storage_path);
    if (!file) continue;
    const h = await sha256Hex(new Uint8Array(await file.arrayBuffer()));
    await admin.from("documents").update({ content_sha256: h }).eq("id", d.id);
    if (h === hash) return d.id;
  }
  return null;
}

// ─── אריזת קבצים ל-ZIP בדפדפן, בלי ספרייה חיצונית ──────────────────────
// כותב ZIP בשיטת "store" (בלי דחיסה). זו לא קמצנות: כמעט כל מה שנארז כאן
// הוא PDF/JPG/PNG — פורמטים דחוסים בעצמם, ודחיסה חוזרת שלהם חוסכת אחוזים
// בודדים תמורת deflate שלם בצד הלקוח. store נותן קובץ תקני שכל מערכת
// הפעלה פותחת, בקוד שאפשר לקרוא בשלמותו.
//
// ‼ דגל 0x0800 (UTF-8) חובה: שמות הקבצים כאן עבריים, ובלעדיו Windows קורא
// אותם בקידוד המקומי ומציג ג'יבריש.

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[i] = c >>> 0;
  }
  return t;
})();

function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/** שעה ותאריך בפורמט MS-DOS, כפי ש-ZIP דורש (רזולוציה של 2 שניות). */
function dosDateTime(d: Date): { time: number; date: number } {
  const year = Math.max(1980, d.getFullYear());
  return {
    time: (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1),
    date: ((year - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate(),
  };
}

export interface ZipEntry {
  /** השם כפי שיופיע בתוך הארכיון, כולל סיומת. */
  name: string;
  data: ArrayBuffer | Uint8Array;
  /** תאריך המסמך; ברירת המחדל היא רגע האריזה. */
  date?: Date;
}

/** מעל הגבול הזה נדרש ZIP64, שאינו נתמך כאן — עוצרים במקום לייצר קובץ פגום. */
const ZIP32_LIMIT = 0xfffffffe;

/**
 * בונה ארכיון ZIP יחיד מרשימת קבצים.
 * ‼ שמות כפולים אינם נבדקים כאן — ראה uniqueEntryName; הקורא אחראי לייחוד.
 */
/**
 * בונה ארכיון ZIP יחיד מרשימת קבצים.
 * ‼ שמות כפולים אינם נבדקים כאן — ראה uniqueEntryName; הקורא אחראי לייחוד.
 */
export function buildZip(entries: ZipEntry[]): Blob {
  const enc = new TextEncoder();
  const prepared = entries.map(entry => {
    const nameBytes = enc.encode(entry.name);
    const data: Uint8Array = entry.data instanceof Uint8Array ? entry.data : new Uint8Array(entry.data);
    const { time, date } = dosDateTime(entry.date ?? new Date());
    return { nameBytes, data, time, date, crc: crc32(data), offset: 0 };
  });

  const localSize = prepared.reduce((n, e) => n + 30 + e.nameBytes.length + e.data.length, 0);
  const centralSize = prepared.reduce((n, e) => n + 46 + e.nameBytes.length, 0);
  if (localSize > ZIP32_LIMIT || localSize + centralSize + 22 > ZIP32_LIMIT) {
    throw new Error('ZIP_TOO_LARGE');
  }

  // חוצץ אחד לכל הארכיון: הכתיבה סדרתית ממילא, וכך אין מערך של מאות
  // חלקים שה-Blob צריך לשרשר בסוף.
  const out = new Uint8Array(localSize + centralSize + 22);
  const view = new DataView(out.buffer);
  let pos = 0;

  for (const e of prepared) {
    e.offset = pos;
    view.setUint32(pos, 0x04034b50, true);
    view.setUint16(pos + 4, 20, true);        // version needed
    view.setUint16(pos + 6, 0x0800, true);    // UTF-8
    view.setUint16(pos + 8, 0, true);         // method: store
    view.setUint16(pos + 10, e.time, true);
    view.setUint16(pos + 12, e.date, true);
    view.setUint32(pos + 14, e.crc, true);
    view.setUint32(pos + 18, e.data.length, true);
    view.setUint32(pos + 22, e.data.length, true);
    view.setUint16(pos + 26, e.nameBytes.length, true);
    view.setUint16(pos + 28, 0, true);        // extra
    out.set(e.nameBytes, pos + 30);
    out.set(e.data, pos + 30 + e.nameBytes.length);
    pos += 30 + e.nameBytes.length + e.data.length;
  }

  const centralStart = pos;
  for (const e of prepared) {
    view.setUint32(pos, 0x02014b50, true);
    view.setUint16(pos + 4, 20, true);        // version made by
    view.setUint16(pos + 6, 20, true);        // version needed
    view.setUint16(pos + 8, 0x0800, true);
    view.setUint16(pos + 10, 0, true);
    view.setUint16(pos + 12, e.time, true);
    view.setUint16(pos + 14, e.date, true);
    view.setUint32(pos + 16, e.crc, true);
    view.setUint32(pos + 20, e.data.length, true);
    view.setUint32(pos + 24, e.data.length, true);
    view.setUint16(pos + 28, e.nameBytes.length, true);
    view.setUint16(pos + 30, 0, true);        // extra
    view.setUint16(pos + 32, 0, true);        // comment
    view.setUint16(pos + 34, 0, true);        // disk
    view.setUint16(pos + 36, 0, true);        // internal attrs
    view.setUint32(pos + 38, 0, true);        // external attrs
    view.setUint32(pos + 42, e.offset, true);
    out.set(e.nameBytes, pos + 46);
    pos += 46 + e.nameBytes.length;
  }

  view.setUint32(pos, 0x06054b50, true);
  view.setUint16(pos + 4, 0, true);
  view.setUint16(pos + 6, 0, true);
  view.setUint16(pos + 8, prepared.length, true);
  view.setUint16(pos + 10, prepared.length, true);
  view.setUint32(pos + 12, centralSize, true);
  view.setUint32(pos + 16, centralStart, true);
  view.setUint16(pos + 20, 0, true);

  return new Blob([out], { type: 'application/zip' });
}

// ─── שמות ──────────────────────────────────────────────────────────────

/** תווים שמערכות הקבצים של Windows/macOS פוסלות, וגם תווי בקרה. */
// eslint-disable-next-line no-control-regex
const ILLEGAL = /[\\\/:*?"<>|\u0000-\u001f\u007f]/g;
/** שמות שמורים ב-Windows — קובץ בשם כזה פשוט לא נוצר. */
const RESERVED = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i;

/**
 * מנקה שם שהמשתמש הקליד לשם קובץ בטוח. מחזיר '' אם לא נשאר ממנו כלום —
 * הקורא אמור לחסום הורדה במקרה כזה ולא להמציא שם.
 */
export function sanitizeFileBaseName(raw: string, maxLength = 120): string {
  let name = raw.replace(ILLEGAL, ' ').replace(/\s+/g, ' ').trim();
  // נקודות ורווחים בסוף נבלעים בשקט ב-Windows ויוצרים שם אחר ממה שביקשו
  name = name.replace(/[. ]+$/, '').replace(/^[. ]+/, '');
  if (name.length > maxLength) name = name.slice(0, maxLength).trim();
  if (RESERVED.test(name)) name = `${name}_`;
  return name;
}

/**
 * מחזיר שם פנוי בתוך הארכיון. שני מסמכים יכולים לשאת בדיוק אותו שם קובץ,
 * ו-ZIP עם שתי רשומות זהות נפתח חלקית בחלק מהכלים — לכן משכפל מקבל " (2)"
 * לפני הסיומת, כמו הורדה חוזרת בדפדפן.
 */
export function uniqueEntryName(name: string, taken: Set<string>): string {
  const safe = sanitizeFileBaseName(name, 180) || 'מסמך';
  if (!taken.has(safe.toLowerCase())) { taken.add(safe.toLowerCase()); return safe; }
  const dot = safe.lastIndexOf('.');
  const base = dot > 0 ? safe.slice(0, dot) : safe;
  const ext = dot > 0 ? safe.slice(dot) : '';
  for (let i = 2; ; i++) {
    const candidate = `${base} (${i})${ext}`;
    if (!taken.has(candidate.toLowerCase())) { taken.add(candidate.toLowerCase()); return candidate; }
  }
}

/** מוריד Blob למחשב תחת שם נתון. */
export function triggerBlobDownload(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // שחרור מיידי שובר את ההורדה בחלק מהדפדפנים — נותנים לה להתחיל
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

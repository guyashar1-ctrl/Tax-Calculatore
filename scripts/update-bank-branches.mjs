// מרענן את רשימת הבנקים והסניפים מהמאגר הרשמי של בנק ישראל ב-data.gov.il («סניפי בנקים פיזיים»).
//   node scripts/update-bank-branches.mjs        → public/data/bank-branches.json
// ‼ המאגר כולל רק סניפים פיזיים של תאגידים בנקאיים. בנק בלי סניף פיזי (למשל בנק דיגיטלי) או סניף חדש
//   שעוד לא נכנס — אינם ברשימה, ולכן הקלט תמיד מאפשר «לא ברשימה» (קוד ידני). הרשימה אינה «מלאה».
// ‼ קודים נשמרים כמחרוזות עם אפסים מובילים: בנק 2 ספרות, סניף 3 ספרות.
// הקריאה בלבד מהמאגר הציבורי; אין כאן מפתח או סוד.
import { writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve, dirname } from 'node:path';

const RESOURCE = '2202bada-4baf-45f5-aa61-8c5bad9646d3';
const API = 'https://data.gov.il/api/3/action';
const OUT = resolve(fileURLToPath(import.meta.url), '../../public/data/bank-branches.json');

const meta = await (await fetch(`${API}/resource_show?id=${RESOURCE}`)).json();
if (!meta.success) throw new Error('resource_show נכשל');
const rows = [];
for (let offset = 0; ; offset += 1000) {
  const r = await (await fetch(`${API}/datastore_search?resource_id=${RESOURCE}&limit=1000&offset=${offset}`)).json();
  if (!r.success) throw new Error('datastore_search נכשל');
  rows.push(...r.result.records);
  if (rows.length >= r.result.total || r.result.records.length === 0) break;
}
const pad = (n, w) => String(n ?? '').trim().padStart(w, '0');
const banks = new Map();
const branches = [];
for (const r of rows) {
  if (r.Bank_Code == null || r.Branch_Code == null) continue;
  const bank = pad(r.Bank_Code, 2);
  banks.set(bank, String(r.Bank_Name ?? '').trim());
  // [בנק, סניף, שם, עיר, נסגר?, מוזג-לבנק, מוזג-לסניף]
  const closed = String(r.Close_Date ?? '').trim();
  branches.push([bank, pad(r.Branch_Code, 3), String(r.Branch_Name ?? '').trim(), String(r.City ?? '').trim(),
    closed ? 1 : 0, r.Merge_Bank != null ? pad(r.Merge_Bank, 2) : '', r.Merge_Branch != null ? pad(r.Merge_Branch, 3) : '']);
}
branches.sort((a, b) => a[0].localeCompare(b[0]) || a[1].localeCompare(b[1]));
const out = {
  source: 'בנק ישראל · data.gov.il · «סניפי בנקים פיזיים»',
  sourceUrl: `https://data.gov.il/dataset/32348d0b-dc49-4bd0-a931-860e55709689`,
  resourceId: RESOURCE,
  sourceUpdated: meta.result.last_modified,
  fetchedAt: new Date().toISOString(),
  note: 'סניפים פיזיים בלבד — בנק או סניף שאינו ברשימה אפשר להזין ידנית',
  banks: [...banks.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([code, name]) => ({ code, name })),
  branches,
};
mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, JSON.stringify(out));
console.log(`${out.banks.length} בנקים, ${branches.length} סניפים · עדכון המקור ${out.sourceUpdated}`);

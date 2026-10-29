export interface HandbookRow {
  id: string; group: string; when: string; examples: string; code: string; name: string;
  secondary: string; note: string; displayOrder?: number;
  recognition: { homeProfileLinked: boolean; mode: 'section_specific' | 'client_home_office_percentage' | 'manual_review'; text: string };
}
export interface HandbookData {
  date: string; containsClientData: boolean; rows: HandbookRow[];
  generalLightEquipmentThreshold: number; secondaryDefault: string;
  [key: string]: unknown;
}

/** חיפוש גם בכינויים עבריים, בלי להחליט סיווג לפי שם הספק. */
export function normalizeHandbookSearch(text: string): string {
  return text.toLowerCase().replace(/קלוד/g, 'claude').replace(/אנטרופיק|אנתרופיק/g, 'anthropic')
    .replace(/צ[׳'’]?אט\s*ג[׳'’]?יפיטי/g, 'chatgpt').replace(/[״׳"'’\u200e\u200f]/g, '').replace(/\s+/g, ' ').trim();
}
export function filterHandbook(rows: HandbookRow[], query: string, group = ''): HandbookRow[] {
  const terms = normalizeHandbookSearch(query).split(' ').filter(Boolean);
  return rows.filter(r => (!group || r.group === group) && terms.every(t =>
    normalizeHandbookSearch([r.when, r.examples, r.code, r.name, r.secondary, r.note, r.recognition.text].join(' ')).includes(t)));
}
export function handbookTsv(rows: HandbookRow[]): string {
  const clean = (s: string) => s.replace(/[\t\r\n]/g, ' ');
  return [['הוצאה', 'דוגמאות', 'קוד ראשי', 'שם המיון בפייפרלס', 'משני', 'אופן ההכרה', 'דגש'],
    ...rows.map(r => [r.when, r.examples, r.code, r.name, r.secondary, r.recognition.text, r.note])]
    .map(r => r.map(clean).join('\t')).join('\n');
}

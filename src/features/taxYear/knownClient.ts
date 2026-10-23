import type { Client, EmployerInfo } from '../../types';

/** Read-only questionnaire view. Authority observations are offered for confirmation,
 * never written over approved card data. Keep person and target year boundaries. */
export function questionnaireClient(c: Client, year?: number): Client {
  const dateYear = (date?: string) => date && /^\d{4}/.test(date) ? Number(date.slice(0, 4)) : undefined;
  const relevant = (e: EmployerInfo) => !year ||
    ((dateYear(e.startDate) ?? year) <= year && (dateYear(e.endDate) ?? year) >= year);
  const employers = (c.employers ?? []).filter(relevant).map(e => ({ ...e }));
  const key = (name: string) => name.normalize('NFKC').trim().replace(/\s+/g, ' ').toLowerCase();
  for (const spouse of [false, true]) {
    for (const o of (spouse ? c.spouseNiOccupations : c.niOccupations) ?? []) {
      const name = o.employerName?.trim() || o.btlDetail?.employerName?.trim() || '';
      if (o.type !== 'employee' || !name) continue;
      const e: EmployerInfo = { id: `ni-${spouse ? 'spouse' : 'client'}-${o.id}`, name,
        belongsToSpouse: spouse, startDate: o.fromDate, endDate: o.toDate };
      if (!relevant(e)) continue;
      // Preserve card identity and dates; do not silently resolve conflicting sources.
      if (!employers.some(x => !!x.belongsToSpouse === spouse && key(x.name) === key(name))) employers.push(e);
    }
  }
  return { ...c, employers };
}

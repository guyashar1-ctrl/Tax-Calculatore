// נקודת הכניסה לשילוב (סשנים אחרים): «כל העבודות» ← ShaamFilingPanel (ו-ShaamOpenRows אם השורות נכנסות לרשימה עצמה);
// תיק המס ← «דוחות והצהרות» ← ClientObligationRows.
export { default as ShaamFilingPanel, ShaamOpenRows, type ShaamFilingPanelProps } from './ShaamFilingPanel';
export { default as ClientObligationRows, type ClientObligationRowsProps } from './ClientObligationRows';
export { useObligations } from './useObligations';
export { needsRequest, type Obligation } from './model';
export { gmf154Filing, openReturnYears, batchFromGmf154, isGmf154Source, type Gmf154Filing } from './fromGmf154';

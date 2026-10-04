import type { QuotationTemplate } from '../../types/quotations';

// ─── תבנית הצעה חדשה ─────────────────────────────────────────────────────────
// ‼ נוצרת מ«＋ תבנית» ב«הצעות מחיר». סוג «מותאם אישית»: הבונה בוחר מעצמו רק
// תבנית מסוג העוסק (פטור / מורשה / חברה); תבנית חדשה נבחרת בהצעה ידנית.
// נכנסת בסוף הרשימה, ובלי מחירון «אם וכאשר» — אותו מבנה של תבנית זרועה.

export function newTemplateDraft(
  existing: readonly Pick<QuotationTemplate, 'displayOrder'>[],
  name: string,
  serviceIds: string[],
): Omit<QuotationTemplate, 'id'> {
  const last = existing.reduce((m, t) => Math.max(m, Number.isFinite(t.displayOrder) ? t.displayOrder : 0), 0);
  return {
    name: name.trim(),
    kind: 'custom',
    serviceIds: [...serviceIds],
    futureServiceIds: [],
    displayOrder: last + 1,
    active: true,
  };
}

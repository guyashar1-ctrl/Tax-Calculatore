// מחיר והנחה בשורת הצעה — שתי החלטות נפרדות (גיא, 20.10.2026).
//
// ‼ עד כאן כל מחיר נמוך מהקטלוג הפך בשקט להנחה בעמוד הלקוח, והרו"ח לא ידע
// אם "שינה מחיר" או "נתן הנחה". עכשיו: המחיר הוא העוגן שהלקוח רואה כמחיר
// הרגיל (catalogPrice), וההנחה נבחרת במפורש — בשקלים, באחוזים או ללא עלות.
// שינוי מחיר לבדו לעולם לא מוצג ללקוח כהנחה.

import type { QuotationItem } from '../types/quotations';
import { itemFinalPrice, itemOriginalPrice } from './quotationCalc';

export type DiscountMode = 'none' | 'ils' | 'pct' | 'free';

export interface PriceDiscount {
  /** המחיר הרגיל ליחידה, לפני מע"מ — מה שהלקוח רואה מחוק כשיש הנחה */
  price: number;
  mode: DiscountMode;
  /** ₪ ליחידה ב-'ils', אחוז ב-'pct'; לא בשימוש ב-'none'/'free' */
  value: number;
}

const r2 = (n: number) => Math.round(n * 100) / 100;

/** מחיר ליחידה אחרי ההנחה, לפני מע"מ */
export function discountedPrice(pd: PriceDiscount): number {
  if (pd.mode === 'free') return 0;
  if (pd.mode === 'ils') return r2(Math.max(0, pd.price - Math.max(0, pd.value)));
  if (pd.mode === 'pct') return r2(pd.price * (1 - Math.min(100, Math.max(0, pd.value)) / 100));
  return r2(pd.price);
}

/** קריאת השורה כמחיר + הנחה. עוגן ידני (displayFullPrice) נקרא כמחיר הרגיל. */
export function readPriceDiscount(item: QuotationItem): PriceDiscount {
  const qty = item.quantity || 1;
  const price = r2(itemOriginalPrice(item) / qty);
  const final = r2(itemFinalPrice(item) / qty);
  const off = r2(price - final);
  if (off < 1) return { price, mode: 'none', value: 0 };
  if (final < 0.5) return { price, mode: 'free', value: 0 };
  const pct = item.discountPercent ?? 0;
  if (pct > 0 && Math.abs(item.clientPrice - price) < 0.5) return { price, mode: 'pct', value: pct };
  return { price, mode: 'ils', value: off };
}

/** השדות שהשורה שומרת. ללא עלות = הנחה של 100%, כדי שהמחיר הרגיל יישאר עוגן. */
export function priceDiscountPatch(pd: PriceDiscount): Partial<QuotationItem> {
  const price = r2(Math.max(0, pd.price));
  return {
    catalogPrice: price,
    displayFullPrice: undefined,
    clientPrice: pd.mode === 'ils' ? discountedPrice({ ...pd, price }) : price,
    discountPercent: pd.mode === 'free' ? 100
      : pd.mode === 'pct' ? r2(Math.min(100, Math.max(0, pd.value))) : 0,
  };
}

/** שינוי המחיר בלבד — ההנחה שנבחרה נשארת מאותו סוג ובאותו גודל */
export function withPrice(item: QuotationItem, price: number): Partial<QuotationItem> {
  return priceDiscountPatch({ ...readPriceDiscount(item), price });
}

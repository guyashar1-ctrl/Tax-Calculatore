// ─── מאיזו שנה קוראים עיסוקים מביטוח לאומי ──────────────────────────────────
// ‼ החלטת גיא (21.10.2026): מהשנה הראשונה בהצעת המחיר — כולל שנים קודמות
// שבהצעה — ועוד כל עבודה שהתחילה קודם ונמשכת אל תוך השנה. בלי הצעה — שנת
// המס הנוכחית של המשרד. ההצעה הקובעת: האחרונה שאושרה, ואם אין — האחרונה
// שנשלחה.

import { supabase } from '../../lib/supabase';
import type { QuotationItem } from '../../types/quotations';
import { quotationServiceYear } from '../../utils/quotationCalc';
import { reportTaxYear } from '../annualReport/reportTaxYear';
import { niOccupationsWindowStart } from './niOccupations';

interface QuoteRow { status: string; items: QuotationItem[] | null; expires_at: string | null }

export function quoteYears(q: QuoteRow): (number | undefined)[] {
  const items = q.items ?? [];
  return [quotationServiceYear(items, q.expires_at ?? undefined), ...items.map(i => i.year)];
}

export function pickWindowQuote(quotes: readonly QuoteRow[]): QuoteRow | undefined {
  return quotes.find(q => q.status === 'approved') ?? quotes.find(q => q.status === 'sent' || q.status === 'viewed');
}

export async function loadOccupationsWindowStart(clientId: string): Promise<string> {
  const fallback = reportTaxYear();
  const { data, error } = await supabase
    .from('quotations')
    .select('status, items, expires_at')
    .eq('client_id', clientId)
    .order('created_at', { ascending: false })
    .limit(20);
  const q = error || !data ? undefined : pickWindowQuote(data as QuoteRow[]);
  return niOccupationsWindowStart(q ? quoteYears(q) : [], fallback);
}

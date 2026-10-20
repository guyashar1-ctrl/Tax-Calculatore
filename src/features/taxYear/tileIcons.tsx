// ─── ציור קטן לכל ריבוע במסך «מה היה לכם ב-{שנה}?» (20.10.2026, ההמחשה המאושרת) ─────────────────────────────
// ‼ גיא: «אין תמונות?». ציור קו פשוט אחד לכל נושא — מזהה במבט, בלי מילים נוספות. ריבוע בלי ציור (ענפים) — בלי.

const P: Record<string, string> = {
  'salary.worked': 'M3 7h18v13H3zM9 7V5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2M3 13h18',
  'salary.equity': 'M4 4h16v16H4zM8 15l3-3 2 2 3-4',
  'pension.received': 'M12 3a9 9 0 1 0 0 18a9 9 0 1 0 0-18M12 7v5l3 2',
  'niBenefits.received': 'M12 3l8 4v5c0 4.5-3.4 8.3-8 9-4.6-.7-8-4.5-8-9V7zM9 12l2 2 4-4',
  'rent.newRental': 'M3 11l9-7 9 7M5 10v10h14V10M10 20v-5h4v5',
  'rent.otherProperty': 'M5 16h14l-1.5-5h-11zM7 16v2M17 16v2M8 11l1.5-4h5L16 11',
  'capital.newAccount': 'M3 20h18M6 16l4-5 3 3 5-7M15 7h3v3',
  'savings.selfDeposits': 'M5 11a7 6 0 0 1 13-2h2v4l-2 1v3h-3v-2h-4v2H8v-3a6 6 0 0 1-3-3z',
  'savings.insurance': 'M3 12a9 9 0 0 1 18 0zM12 12v6a2 2 0 0 1-4 0',
  'donations.given': 'M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z',
  'special.disability': 'M4 4h16v16H4zM12 8v8M8 12h8',
  'household.creditChanges': 'M2 9l10-5 10 5-10 5zM6 11v5c3 2 9 2 12 0v-5',
  'foreign.income': 'M12 3a9 9 0 1 0 0 18a9 9 0 1 0 0-18M3 12h18M12 3c3 3.5 3 14.5 0 18M12 3c-3 3.5-3 14.5 0 18',
  'sales.sold': 'M3 12V4h8l10 10-8 8zM7.5 8.5h.01',
  'household.familyChange': 'M5 7a3 3 0 1 0 6 0a3 3 0 1 0-6 0M13 7a3 3 0 1 0 6 0a3 3 0 1 0-6 0M3 20c0-3 2.2-5 5-5s5 2 5 5M11 20c0-3 2.2-5 5-5s5 2 5 5',
};

export function TileIcon({ k }: { k: string }) {
  const d = P[k];
  if (!d) return null;
  return (
    <svg className="ty-tile-ic" viewBox="0 0 24 24" aria-hidden="true" focusable="false"
      fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round"><path d={d} /></svg>
  );
}
export const hasTileIcon = (k: string) => !!P[k];

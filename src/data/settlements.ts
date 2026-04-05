// ─────────────────────────────────────────────────────────────────────────────
// ישובים מזכים לפי תקנות מס הכנסה (נקודות זיכוי לתושבי ישובי פיתוח)
// מקור: תקנות מס הכנסה (נקודות זיכוי לתושבי ישובי פיתוח, ישובים ב-א' ועיירות פיתוח)
// הערה: הרשימה מתעדכנת מדי שנה — יש לאמת מול פרסומי רשות המיסים
// ─────────────────────────────────────────────────────────────────────────────

export interface Settlement {
  id: string;
  name: string;
  region: SettlementRegion;
  creditPoints: number; // נקודות זיכוי לשנה
  tier: 'A' | 'B';     // מעגל א/ב
}

export type SettlementRegion =
  | 'negev'        // נגב
  | 'arava'        // ערבה
  | 'galilee'      // גליל
  | 'golan'        // גולן
  | 'north-border' // גבול צפון
  | 'jordan-valley'; // בקעת הירדן

export const SETTLEMENTS: Settlement[] = [
  // ── נגב ──────────────────────────────────────────────────────────────────
  { id: 'eilat',        name: 'אילת',               region: 'negev', creditPoints: 0.5, tier: 'A' },
  { id: 'arad',         name: 'ערד',                region: 'negev', creditPoints: 0.5, tier: 'A' },
  { id: 'dimona',       name: 'דימונה',              region: 'negev', creditPoints: 0.5, tier: 'A' },
  { id: 'yeruham',      name: 'ירוחם',               region: 'negev', creditPoints: 0.5, tier: 'A' },
  { id: 'mitzpe-ramon', name: 'מצפה רמון',           region: 'negev', creditPoints: 0.5, tier: 'A' },
  { id: 'ofakim',       name: 'אופקים',              region: 'negev', creditPoints: 0.5, tier: 'A' },
  { id: 'netivot',      name: 'נתיבות',              region: 'negev', creditPoints: 0.5, tier: 'A' },
  { id: 'sderot',       name: 'שדרות',               region: 'negev', creditPoints: 0.5, tier: 'A' },
  { id: 'kiryat-gat',   name: 'קרית גת',             region: 'negev', creditPoints: 0.5, tier: 'B' },
  { id: 'rahat',        name: 'רהט',                 region: 'negev', creditPoints: 0.5, tier: 'A' },
  { id: 'tel-sheva',    name: 'תל שבע',              region: 'negev', creditPoints: 0.5, tier: 'A' },
  { id: 'hura',         name: 'חורה',                region: 'negev', creditPoints: 0.5, tier: 'A' },
  { id: 'kseifa',       name: 'כסיפה',               region: 'negev', creditPoints: 0.5, tier: 'A' },
  { id: 'arara-negev',  name: 'ערערה-בנגב',          region: 'negev', creditPoints: 0.5, tier: 'A' },
  { id: 'laqye',        name: 'לקיה',                region: 'negev', creditPoints: 0.5, tier: 'A' },
  { id: 'segev-shalom', name: 'שגב-שלום',            region: 'negev', creditPoints: 0.5, tier: 'A' },
  { id: 'nevatim',      name: 'נבטים',               region: 'negev', creditPoints: 0.5, tier: 'B' },
  { id: 'nirim',        name: 'ניר"מ',               region: 'negev', creditPoints: 0.5, tier: 'A' },
  { id: 'nir-oz',       name: 'ניר עוז',             region: 'negev', creditPoints: 0.5, tier: 'A' },
  { id: 'nir-am',       name: 'ניר עם',              region: 'negev', creditPoints: 0.5, tier: 'A' },
  { id: 'halutza',      name: 'חלוצה',               region: 'negev', creditPoints: 0.5, tier: 'A' },
  { id: 'meon',         name: 'מעון',                region: 'negev', creditPoints: 0.5, tier: 'A' },
  { id: 'yakhini',      name: 'יכיני',               region: 'negev', creditPoints: 0.5, tier: 'A' },
  { id: 'alumim',       name: 'אלומים',              region: 'negev', creditPoints: 0.5, tier: 'A' },
  { id: 'nir-yitzhak',  name: 'ניר יצחק',            region: 'negev', creditPoints: 0.5, tier: 'A' },
  { id: 'be-eri',       name: 'בארי',                region: 'negev', creditPoints: 0.5, tier: 'A' },
  { id: 'kissufim',     name: 'כיסופים',             region: 'negev', creditPoints: 0.5, tier: 'A' },
  { id: 'gevim',        name: 'גבים',                region: 'negev', creditPoints: 0.5, tier: 'A' },
  { id: 'ibim',         name: 'אבים',                region: 'negev', creditPoints: 0.5, tier: 'A' },
  { id: 'sdot-negev',   name: 'שדות נגב',            region: 'negev', creditPoints: 0.5, tier: 'A' },
  { id: 'omer',         name: 'עומר',                region: 'negev', creditPoints: 0.5, tier: 'B' },
  { id: 'meitar',       name: 'מיתר',                region: 'negev', creditPoints: 0.5, tier: 'B' },
  { id: 'eshkol',       name: 'אשכול',               region: 'negev', creditPoints: 0.5, tier: 'A' },

  // ── ערבה ─────────────────────────────────────────────────────────────────
  { id: 'yotvata',      name: 'יטבתה',               region: 'arava', creditPoints: 0.5, tier: 'A' },
  { id: 'ein-yahav',    name: 'עין יהב',             region: 'arava', creditPoints: 0.5, tier: 'A' },
  { id: 'sapir',        name: 'ספיר',                region: 'arava', creditPoints: 0.5, tier: 'A' },
  { id: 'paran',        name: 'פארן',                region: 'arava', creditPoints: 0.5, tier: 'A' },
  { id: 'grofit',       name: 'גרופית',              region: 'arava', creditPoints: 0.5, tier: 'A' },
  { id: 'elifaz',       name: 'אליפז',               region: 'arava', creditPoints: 0.5, tier: 'A' },
  { id: 'ketura',       name: 'קטורה',               region: 'arava', creditPoints: 0.5, tier: 'A' },
  { id: 'shizafon',     name: 'שיזף',                region: 'arava', creditPoints: 0.5, tier: 'A' },
  { id: 'ein-hatzeva',  name: 'עין חצבה',            region: 'arava', creditPoints: 0.5, tier: 'A' },
  { id: 'hatzeva',      name: 'חצבה',                region: 'arava', creditPoints: 0.5, tier: 'A' },
  { id: 'nitzana',      name: 'ניצנה',               region: 'arava', creditPoints: 0.5, tier: 'A' },
  { id: 'neot-hakikar', name: 'נאות הכיכר',          region: 'arava', creditPoints: 0.5, tier: 'A' },
  { id: 'zofar',        name: 'צופר',                region: 'arava', creditPoints: 0.5, tier: 'A' },
  { id: 'shaharut',     name: 'שחרות',               region: 'arava', creditPoints: 0.5, tier: 'A' },

  // ── גליל ─────────────────────────────────────────────────────────────────
  { id: 'kiryat-shmona', name: 'קריית שמונה',        region: 'galilee', creditPoints: 0.5, tier: 'A' },
  { id: 'safed',         name: 'צפת',                region: 'galilee', creditPoints: 0.5, tier: 'A' },
  { id: 'bet-shean',     name: 'בית שאן',            region: 'galilee', creditPoints: 0.5, tier: 'A' },
  { id: 'hatzor',        name: 'חצור הגלילית',       region: 'galilee', creditPoints: 0.5, tier: 'A' },
  { id: 'maalot',        name: 'מעלות-תרשיחא',       region: 'galilee', creditPoints: 0.5, tier: 'A' },
  { id: 'shlomi',        name: 'שלומי',              region: 'galilee', creditPoints: 0.5, tier: 'A' },
  { id: 'metula',        name: 'מטולה',              region: 'north-border', creditPoints: 0.5, tier: 'A' },
  { id: 'kfar-yuval',    name: 'כפר יובל',           region: 'north-border', creditPoints: 0.5, tier: 'A' },
  { id: 'rosh-pina',     name: 'ראש פינה',           region: 'galilee', creditPoints: 0.5, tier: 'B' },
  { id: 'migdal-haemek', name: 'מגדל העמק',          region: 'galilee', creditPoints: 0.5, tier: 'B' },
  { id: 'afula',         name: 'עפולה',              region: 'galilee', creditPoints: 0.5, tier: 'B' },
  { id: 'tiberias',      name: 'טבריה',              region: 'galilee', creditPoints: 0.5, tier: 'B' },
  { id: 'karmiel',       name: 'כרמיאל',             region: 'galilee', creditPoints: 0.5, tier: 'B' },
  { id: 'peki-in',       name: 'פקיעין',             region: 'galilee', creditPoints: 0.5, tier: 'A' },
  { id: 'bir-al-maks',   name: 'ביר אל-מכסור',       region: 'galilee', creditPoints: 0.5, tier: 'A' },
  { id: 'rama',          name: 'ראמה',               region: 'galilee', creditPoints: 0.5, tier: 'A' },
  { id: 'kisra-sume',    name: 'כסרא-סמיע',          region: 'galilee', creditPoints: 0.5, tier: 'A' },
  { id: 'massade',       name: 'מסעדה',              region: 'golan', creditPoints: 0.5, tier: 'A' },
  { id: 'buqata',        name: 'בקעתא',              region: 'golan', creditPoints: 0.5, tier: 'A' },
  { id: 'jish',          name: 'גוש חלב (ג\'ש)',     region: 'galilee', creditPoints: 0.5, tier: 'A' },
  { id: 'rehaniya',      name: 'ריחאניה',            region: 'galilee', creditPoints: 0.5, tier: 'A' },
  { id: 'iksal',         name: 'אכסאל',              region: 'galilee', creditPoints: 0.5, tier: 'A' },
  { id: 'jat',           name: 'ג\'ת',               region: 'galilee', creditPoints: 0.5, tier: 'A' },
  { id: 'beit-jann',     name: 'בית ג\'ן',           region: 'galilee', creditPoints: 0.5, tier: 'A' },
  { id: 'khwalid',       name: 'ח\'ואלד',            region: 'galilee', creditPoints: 0.5, tier: 'A' },
  { id: 'kafr-manda',    name: 'כפר מנדא',           region: 'galilee', creditPoints: 0.5, tier: 'A' },
  { id: 'kafr-kanna',    name: 'כפר כנא',            region: 'galilee', creditPoints: 0.5, tier: 'A' },
  { id: 'eilabun',       name: 'עילבון',             region: 'galilee', creditPoints: 0.5, tier: 'A' },
  { id: 'fassuta',       name: 'פסוטה',              region: 'galilee', creditPoints: 0.5, tier: 'A' },
  { id: 'tarshiha',      name: 'תרשיחא',             region: 'galilee', creditPoints: 0.5, tier: 'A' },
  { id: 'bustan-hagalil', name: 'בוסתן הגליל',       region: 'galilee', creditPoints: 0.5, tier: 'A' },
  { id: 'zarzir',        name: 'זרזיר',              region: 'galilee', creditPoints: 0.5, tier: 'A' },
  { id: 'julis',         name: 'ג\'וליס',            region: 'galilee', creditPoints: 0.5, tier: 'A' },
  { id: 'mghar',         name: 'מג\'ד אל-כרום',      region: 'galilee', creditPoints: 0.5, tier: 'A' },
  { id: 'deir-hanna',    name: 'דיר חנא',            region: 'galilee', creditPoints: 0.5, tier: 'A' },
  { id: 'arrabe',        name: 'עראבה',              region: 'galilee', creditPoints: 0.5, tier: 'A' },
  { id: 'sakhnin',       name: 'סכנין',              region: 'galilee', creditPoints: 0.5, tier: 'A' },
  { id: 'tur-an',        name: 'טורעאן',             region: 'galilee', creditPoints: 0.5, tier: 'A' },
  { id: 'nazareth-ilit', name: 'נצרת עילית (נוף הגליל)', region: 'galilee', creditPoints: 0.5, tier: 'B' },
  { id: 'yodfat',        name: 'יודפת',              region: 'galilee', creditPoints: 0.5, tier: 'A' },
  { id: 'kfar-vradim',   name: 'כפר ורדים',          region: 'galilee', creditPoints: 0.5, tier: 'B' },
  { id: 'hurfeish',      name: 'חורפיש',             region: 'galilee', creditPoints: 0.5, tier: 'A' },
  { id: 'yiron',         name: 'יר\'ון',             region: 'galilee', creditPoints: 0.5, tier: 'A' },
  { id: 'shatula',       name: 'שתולה',              region: 'north-border', creditPoints: 0.5, tier: 'A' },
  { id: 'zarit',         name: 'זרית',               region: 'north-border', creditPoints: 0.5, tier: 'A' },
  { id: 'avivim',        name: 'אביבים',             region: 'north-border', creditPoints: 0.5, tier: 'A' },

  // ── גולן ─────────────────────────────────────────────────────────────────
  { id: 'katzrin',       name: 'קצרין',              region: 'golan', creditPoints: 0.5, tier: 'A' },
  { id: 'kfar-nafah',    name: 'כפר נפח',            region: 'golan', creditPoints: 0.5, tier: 'A' },
  { id: 'majdal-shams',  name: 'מג\'דל שמס',         region: 'golan', creditPoints: 0.5, tier: 'A' },
  { id: 'buka-ta',       name: 'בועתא',              region: 'golan', creditPoints: 0.5, tier: 'A' },
  { id: 'hashfiya',      name: 'חשניה',              region: 'golan', creditPoints: 0.5, tier: 'A' },
  { id: 'ein-zivan',     name: 'עין זיוון',          region: 'golan', creditPoints: 0.5, tier: 'A' },
  { id: 'elrom',         name: 'אלרום',              region: 'golan', creditPoints: 0.5, tier: 'A' },
  { id: 'ortal',         name: 'אורטל',              region: 'golan', creditPoints: 0.5, tier: 'A' },
  { id: 'alonei-habashan', name: 'אלוני הבשן',       region: 'golan', creditPoints: 0.5, tier: 'A' },
  { id: 'natur',         name: 'נטור',               region: 'golan', creditPoints: 0.5, tier: 'A' },
  { id: 'hadar',         name: 'הדר',                region: 'golan', creditPoints: 0.5, tier: 'A' },
  { id: 'yonatan',       name: 'יונתן',              region: 'golan', creditPoints: 0.5, tier: 'A' },
  { id: 'merom-golan',   name: 'מרום גולן',          region: 'golan', creditPoints: 0.5, tier: 'A' },
  { id: 'neve-ativ',     name: 'נווה אטיב',          region: 'golan', creditPoints: 0.5, tier: 'A' },

  // ── בקעת הירדן ───────────────────────────────────────────────────────────
  { id: 'beit-shean-valley', name: 'בית שאן (עמק)',  region: 'jordan-valley', creditPoints: 0.5, tier: 'B' },
  { id: 'massua',        name: 'מסואה',              region: 'jordan-valley', creditPoints: 0.5, tier: 'A' },
  { id: 'shadmot-mehola', name: 'שדמות מחולה',       region: 'jordan-valley', creditPoints: 0.5, tier: 'A' },
  { id: 'tomer',         name: 'תומר',               region: 'jordan-valley', creditPoints: 0.5, tier: 'A' },
  { id: 'gilgal',        name: 'גלגל',               region: 'jordan-valley', creditPoints: 0.5, tier: 'A' },
  { id: 'netiv-hagdud',  name: 'נתיב הגדוד',         region: 'jordan-valley', creditPoints: 0.5, tier: 'A' },
];

export const REGION_LABELS: Record<string, string> = {
  negev: 'נגב',
  arava: 'ערבה',
  galilee: 'גליל',
  'north-border': 'גבול צפון',
  golan: 'גולן',
  'jordan-valley': 'בקעת הירדן',
};

export const TIER_LABELS = { A: 'מעגל א\'', B: 'מעגל ב\'' };

export function findSettlementByName(name: string): Settlement | undefined {
  const lower = name.trim().toLowerCase();
  return SETTLEMENTS.find(s =>
    s.name.toLowerCase().includes(lower) ||
    lower.includes(s.name.toLowerCase())
  );
}

export function getSettlementById(id: string): Settlement | undefined {
  return SETTLEMENTS.find(s => s.id === id);
}

// Sorted by name for dropdown
export const SETTLEMENTS_SORTED = [...SETTLEMENTS].sort((a, b) =>
  a.name.localeCompare(b.name, 'he')
);

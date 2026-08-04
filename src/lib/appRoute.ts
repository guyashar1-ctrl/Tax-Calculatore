// ─── כתובת המסך ─────────────────────────────────────────────────────────────
// ‼ ניתוב על ה-hash (‎#/clients‎) ולא על הנתיב. אין vercel.json עם rewrite,
// ולכן רענון על ‎/clients‎ היה מחזיר 404 מהשרת. ה-hash לעולם לא מגיע לשרת.
// ‼ ה-hash גם לא מתנגש בטוקנים הציבוריים (‎?quote=‎ ‎?sign=‎ ‎?onboard=‎ ‎?intake=‎),
// שנבדקים לפני הכניסה למערכת ונשארים ב-query.

export type View =
  | 'myDesk'
  | 'tasks'
  | 'list'
  | 'form'
  | 'calculator'
  | 'documents'
  | 'reference'
  | 'annualReport'
  | 'firmProfile'
  | 'requestNew'
  | 'requestReview'
  | 'requestFill'
  | 'quotations'
  | 'quotationBuilder';

export interface AppRoute {
  view: View;
  clientId?: string;
  /** לשונית הפתיחה של כרטיס הלקוח */
  clientTab?: string;
  requestId?: string;
  /** null = הצעה חדשה שעדיין לא נשמרה */
  quotationId?: string;
  annualClientId?: string;
  annualTaxYear?: number;
}

const SLUG_BY_VIEW: Record<View, string> = {
  myDesk: 'desk',
  tasks: 'tasks',
  list: 'clients',
  form: 'client',
  calculator: 'calculator',
  documents: 'documents',
  reference: 'reference',
  annualReport: 'annual',
  firmProfile: 'firm',
  requestNew: 'request-new',
  requestReview: 'request',
  requestFill: 'request-fill',
  quotations: 'quotations',
  quotationBuilder: 'quotation',
};

const VIEW_BY_SLUG = Object.fromEntries(
  Object.entries(SLUG_BY_VIEW).map(([view, slug]) => [slug, view as View]),
) as Record<string, View>;

export const DEFAULT_ROUTE: AppRoute = { view: 'tasks' };

export function formatRoute(route: AppRoute): string {
  const parts: string[] = [SLUG_BY_VIEW[route.view]];
  switch (route.view) {
    case 'form':
      if (route.clientId) parts.push(route.clientId);
      if (route.clientId && route.clientTab) parts.push(route.clientTab);
      break;
    case 'documents':
    case 'calculator':
      if (route.clientId) parts.push(route.clientId);
      break;
    case 'requestReview':
    case 'requestFill':
      if (route.requestId) parts.push(route.requestId);
      break;
    case 'quotationBuilder':
      if (route.quotationId) parts.push(route.quotationId);
      break;
    case 'annualReport':
      if (route.annualClientId && route.annualTaxYear) {
        parts.push(route.annualClientId, String(route.annualTaxYear));
      }
      break;
    default:
      break;
  }
  return '/' + parts.map(encodeURIComponent).join('/');
}

/**
 * מסך שדורש מזהה ואין לו — נופל למסך שממנו מגיעים אליו, ולא נשאר תקוע ריק.
 * זה מה שקורה כשמעתיקים כתובת ישנה או שהרשומה נמחקה בינתיים.
 */
export function parseHash(hash: string): AppRoute {
  const raw = hash.replace(/^#\/?/, '');
  if (!raw) return DEFAULT_ROUTE;
  const [slug, ...rest] = raw.split('/').map(decodeURIComponent);
  const view = VIEW_BY_SLUG[slug];
  if (!view) return DEFAULT_ROUTE;

  switch (view) {
    case 'form':
      if (!rest[0]) return { view: 'list' };
      return { view, clientId: rest[0], clientTab: rest[1] };
    case 'documents':
    case 'calculator':
      if (!rest[0]) return { view: 'list' };
      return { view, clientId: rest[0] };
    case 'requestReview':
    case 'requestFill':
      if (!rest[0]) return { view: 'list' };
      return { view, requestId: rest[0] };
    case 'quotationBuilder':
      // בונה הצעות בלי מזהה = טיוטה שלא נשמרה. אין מה לשחזר אחרי רענון.
      if (!rest[0]) return { view: 'quotations' };
      return { view, quotationId: rest[0] };
    case 'annualReport': {
      const year = Number(rest[1]);
      if (!rest[0] || !Number.isFinite(year)) return { view };
      return { view, annualClientId: rest[0], annualTaxYear: year };
    }
    default:
      return { view };
  }
}

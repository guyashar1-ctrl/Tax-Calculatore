-- ============================================================================
-- CLIENT EXTENSIONS — שדות חדשים לכרטיס הלקוח לכיסוי דרישות 1301
-- ============================================================================
-- מוסיף 4 רשימות JSONB חדשות לטבלת clients:
--   - investment_accounts  → בתי השקעות/חשבונות מסחר בארץ (כל חשבון = 867)
--   - bank_accounts        → חשבונות בנק (חשבון ראשי לקבלת החזרי מס)
--   - employers            → מעבידים (כל מעביד = 106)
--   - pension_funds        → קופות פנסיה/השתלמות/קופ"ג (כל קופה = אישור נפרד)
--
-- הגישה: הוספה בלבד (additive). השדות הישנים (investment_broker_name וכו')
-- נשארים בטבלה למיגרציה הדרגתית.
-- ============================================================================

alter table public.clients
  add column if not exists investment_accounts jsonb default '[]'::jsonb,
  add column if not exists bank_accounts       jsonb default '[]'::jsonb,
  add column if not exists employers           jsonb default '[]'::jsonb,
  add column if not exists pension_funds       jsonb default '[]'::jsonb;

-- ─── מיגרציית נתונים: ממיר investment_broker_name → investment_accounts ────
-- עבור כל לקוח שיש לו hasInvestments=true ושם ברוקר (מ-jsonb fieldMeta או מעמודה ייעודית),
-- בונה רשומה אחת ברשימה החדשה.
-- בגלל שה-investmentBrokerName מאוחסן ב-fieldMeta או בעמודה ייעודית, נטפל בזה
-- בצד הקוד באמצעות migrate-client-investments.mjs כדי לכבד את ה-clientFromDb mapping.

-- אינדקס לחיפוש לפי שם בית השקעות (אופציונלי, יעיל לחיפוש "מי מחזיק במיטב דש")
create index if not exists clients_inv_accounts_idx on public.clients using gin (investment_accounts);

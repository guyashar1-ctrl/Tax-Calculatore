import { useEffect, useRef, useState } from 'react';
import type { ServiceCatalogItem, QuotationTemplate } from '../types/quotations';
import { supabase } from '../lib/supabase';
import {
  serviceCatalogFromDb, serviceCatalogToDb,
  quotationTemplateFromDb, quotationTemplateToDb,
} from '../lib/dbMappers';
import {
  DEFAULT_SERVICES, DEFAULT_TEMPLATES, TOP_UP_SEED_KEYS, buildTemplateRows,
} from '../data/defaultServiceCatalog';

// קטלוג שירותים + תבניות הצעה. נטענים יחד כי הזריעה הראשונית תלויה בשניהם:
// התבניות מפנות למזהי שירותים, ולכן חייבות להיזרע אחרי שהשירותים קיבלו id.
export function useQuotationCatalog(userId: string | undefined) {
  const [services, setServices] = useState<ServiceCatalogItem[]>([]);
  const [templates, setTemplates] = useState<QuotationTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const seedingRef = useRef(false);

  useEffect(() => {
    if (!userId) {
      setServices([]);
      setTemplates([]);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    (async () => {
      const [svcRes, tplRes] = await Promise.all([
        supabase.from('service_catalog').select('*').order('display_order', { ascending: true }),
        supabase.from('quotation_templates').select('*').order('display_order', { ascending: true }),
      ]);
      if (cancelled) return;
      if (svcRes.error || tplRes.error) {
        setError((svcRes.error ?? tplRes.error)!.message);
        setLoading(false);
        return;
      }

      let svcRows = (svcRes.data ?? []).map(serviceCatalogFromDb);
      let tplRows = (tplRes.data ?? []).map(quotationTemplateFromDb);

      // זריעה ראשונית — רק אם הקטלוג ריק לחלוטין (משתמש שטרם פתח את המודול)
      if (svcRows.length === 0 && tplRows.length === 0 && !seedingRef.current) {
        seedingRef.current = true;
        try {
          const seeded = await seedDefaults(userId);
          svcRows = seeded.services;
          tplRows = seeded.templates;
        } catch (e: any) {
          if (!cancelled) setError(e.message ?? String(e));
        }
      } else if (svcRows.length > 0 && !seedingRef.current && !topUpDone(userId)) {
        // משתמש שכבר נזרע לא עובר זריעה חוזרת, ולכן שירותים שנוספו לקטלוג
        // מאוחר יותר לא יגיעו אליו לעולם. השלמה חד־פעמית סוגרת את הפער.
        seedingRef.current = true;
        try {
          const topped = await topUpCatalog(userId, svcRows, tplRows);
          svcRows = topped.services;
          tplRows = topped.templates;
          markTopUpDone(userId);
        } catch {
          // השלמה שנכשלה לא חוסמת את טעינת המודול — ננסה שוב בטעינה הבאה
        }
      }

      if (cancelled) return;
      setServices(svcRows);
      setTemplates(tplRows);
      setError(null);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [userId]);

  // ─── שירותים ───

  async function addService(item: Omit<ServiceCatalogItem, 'id'>): Promise<ServiceCatalogItem> {
    if (!userId) throw new Error('Not signed in');
    const row = serviceCatalogToDb(item as Partial<ServiceCatalogItem>, userId);
    const { data, error } = await supabase.from('service_catalog').insert(row).select().single();
    if (error) throw error;
    const inserted = serviceCatalogFromDb(data);
    setServices(prev => [...prev, inserted].sort((a, b) => a.displayOrder - b.displayOrder));
    return inserted;
  }

  async function updateService(item: ServiceCatalogItem): Promise<ServiceCatalogItem> {
    const row = serviceCatalogToDb(item);
    delete row.id;
    delete row.user_id;
    delete row.created_at;
    const { data, error } = await supabase
      .from('service_catalog').update(row).eq('id', item.id).select().single();
    if (error) throw error;
    const updated = serviceCatalogFromDb(data);
    setServices(prev => prev.map(s => s.id === updated.id ? updated : s));
    return updated;
  }

  async function deleteService(id: string): Promise<void> {
    const { error } = await supabase.from('service_catalog').delete().eq('id', id);
    if (error) throw error;
    setServices(prev => prev.filter(s => s.id !== id));
  }

  // ─── תבניות ───

  async function addTemplate(tpl: Omit<QuotationTemplate, 'id'>): Promise<QuotationTemplate> {
    if (!userId) throw new Error('Not signed in');
    const row = quotationTemplateToDb(tpl as Partial<QuotationTemplate>, userId);
    const { data, error } = await supabase.from('quotation_templates').insert(row).select().single();
    if (error) throw error;
    const inserted = quotationTemplateFromDb(data);
    setTemplates(prev => [...prev, inserted].sort((a, b) => a.displayOrder - b.displayOrder));
    return inserted;
  }

  async function updateTemplate(tpl: QuotationTemplate): Promise<QuotationTemplate> {
    const row = quotationTemplateToDb(tpl);
    delete row.id;
    delete row.user_id;
    delete row.created_at;
    const { data, error } = await supabase
      .from('quotation_templates').update(row).eq('id', tpl.id).select().single();
    if (error) throw error;
    const updated = quotationTemplateFromDb(data);
    setTemplates(prev => prev.map(t => t.id === updated.id ? updated : t));
    return updated;
  }

  async function deleteTemplate(id: string): Promise<void> {
    const { error } = await supabase.from('quotation_templates').delete().eq('id', id);
    if (error) throw error;
    setTemplates(prev => prev.filter(t => t.id !== id));
  }

  return {
    services, templates, loading, error,
    addService, updateService, deleteService,
    addTemplate, updateTemplate, deleteTemplate,
  };
}

// ─── השלמת קטלוג למשתמש קיים ────────────────────────────────────────────────
// הסימון נשמר מקומית ולא ב-DB: ההשלמה רצה פעם אחת, וכך שירות שגיא מחק במכוון
// לא יחזור בכל טעינה. במכשיר חדש היא תרוץ שוב, אבל רק על שירותים שחסרים.
const TOP_UP_KEY_PREFIX = 'quotationCatalogTopUp:v2:';

function topUpDone(userId: string): boolean {
  try {
    return localStorage.getItem(TOP_UP_KEY_PREFIX + userId) === '1';
  } catch {
    return true;   // אין גישה ל-localStorage — לא נוגעים בקטלוג
  }
}

function markTopUpDone(userId: string): void {
  try {
    localStorage.setItem(TOP_UP_KEY_PREFIX + userId, '1');
  } catch {
    // אין localStorage — ההשלמה תרוץ שוב, אך היא מוסיפה רק מה שחסר
  }
}

// שם השירות הוא המפתח להשוואה — הקטלוג ב-DB לא שומר seedKey
function seedName(key: string): string | undefined {
  return DEFAULT_SERVICES.find(s => s.seedKey === key)?.name;
}

// תבניות הליווי השוטף — רק אליהן משויכים פייפרלס וטיפול בקנסות
const ONGOING_TEMPLATE_KINDS = ['exempt_dealer', 'licensed_dealer', 'company'];

async function topUpCatalog(
  userId: string,
  services: ServiceCatalogItem[],
  templates: QuotationTemplate[],
): Promise<{ services: ServiceCatalogItem[]; templates: QuotationTemplate[] }> {
  const existingNames = new Set(services.map(s => s.name));
  const missing = DEFAULT_SERVICES.filter(
    s => TOP_UP_SEED_KEYS.includes(s.seedKey) && !existingNames.has(s.name));

  let nextServices = services;
  if (missing.length > 0) {
    const rows = missing.map(({ seedKey: _key, ...svc }) => serviceCatalogToDb(svc, userId));
    const { data, error } = await supabase.from('service_catalog').insert(rows).select();
    if (error) throw error;
    nextServices = [...services, ...(data ?? []).map(serviceCatalogFromDb)]
      .sort((a, b) => a.displayOrder - b.displayOrder);
  }

  // שיוך לתבניות הקיימות — אחרת "כלול אוטומטית" לא יתבטא בהצעה חדשה
  const idByName = new Map(nextServices.map(s => [s.name, s.id]));
  const attachIds = ['paperless', 'fines_handling']
    .map(key => seedName(key))
    .map(name => (name ? idByName.get(name) : undefined))
    .filter((id): id is string => Boolean(id));

  const nextTemplates = [...templates];
  for (let i = 0; i < nextTemplates.length; i++) {
    const tpl = nextTemplates[i];
    if (!ONGOING_TEMPLATE_KINDS.includes(tpl.kind)) continue;
    const toAdd = attachIds.filter(id => !tpl.serviceIds.includes(id));
    if (toAdd.length === 0) continue;
    const { data, error } = await supabase
      .from('quotation_templates')
      .update({ service_ids: [...tpl.serviceIds, ...toAdd] })
      .eq('id', tpl.id).select().single();
    if (error) throw error;
    nextTemplates[i] = quotationTemplateFromDb(data);
  }

  return { services: nextServices, templates: nextTemplates };
}

async function seedDefaults(userId: string): Promise<{
  services: ServiceCatalogItem[];
  templates: QuotationTemplate[];
}> {
  const serviceRows = DEFAULT_SERVICES.map(({ seedKey: _key, ...svc }) =>
    serviceCatalogToDb(svc, userId));
  const { data: svcData, error: svcError } = await supabase
    .from('service_catalog').insert(serviceRows).select();
  if (svcError) throw svcError;
  const services = (svcData ?? []).map(serviceCatalogFromDb);

  // מיפוי seedKey → id אמיתי לפי שם השירות (השמות ייחודיים בזריעה)
  const idBySeedKey: Record<string, string> = {};
  for (const seed of DEFAULT_SERVICES) {
    const match = services.find(s => s.name === seed.name);
    if (match) idBySeedKey[seed.seedKey] = match.id;
  }

  const templateRows = buildTemplateRows(DEFAULT_TEMPLATES, idBySeedKey)
    .map(tpl => quotationTemplateToDb(tpl, userId));
  const { data: tplData, error: tplError } = await supabase
    .from('quotation_templates').insert(templateRows).select();
  if (tplError) throw tplError;
  const templates = (tplData ?? []).map(quotationTemplateFromDb);

  return { services, templates };
}

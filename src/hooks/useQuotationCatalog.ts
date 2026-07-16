import { useEffect, useRef, useState } from 'react';
import type { ServiceCatalogItem, QuotationTemplate } from '../types/quotations';
import { supabase } from '../lib/supabase';
import {
  serviceCatalogFromDb, serviceCatalogToDb,
  quotationTemplateFromDb, quotationTemplateToDb,
} from '../lib/dbMappers';
import { DEFAULT_SERVICES, DEFAULT_TEMPLATES, buildTemplateRows } from '../data/defaultServiceCatalog';

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

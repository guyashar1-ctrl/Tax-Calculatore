// «פרטי המשרד» — כל מה שהלקוח רואה מהמשרד, בעמוד אחד (סבב 3, 1.10.2026).
// אוחדו לכאן: פרטי המשרד, לוגו, חתימה וחותמת, שולח וחתימת מייל, עיצוב.
//
// ‼ סיכום קודם, עריכה במקום: כל נושא הוא שורה שמראה את הערך הנוכחי, ו«שינוי»
// פותח את העורך שלו מתחת — באותו עמוד, בלי מעבר. שתי ה«חתימות» (התמונה
// למסמכים והטקסט בסוף המייל) יושבות זו ליד זו, כדי שמי שמחפש «חתימה» לא
// יצטרך לנחש איזו מהן ואיפה.
// ‼ אין כאן שמירה משלה: הכל עורך את טיוטת המשרד, ושורת השמירה בתחתית שומרת.
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { REP_TYPE_OPTIONS, deriveMonogram, type FirmCommunication, type FirmProfile, type LogoSurface, type FirmBranding } from '../../../types/firmProfile';
import EmailInput from '../../ui/EmailInput';
import LogoAssetsPanel, { type LogoUploadRequest } from '../../LogoAssetsPanel';
import QuotationDesignStudio from '../../quotations/QuotationDesignStudio';
import { deriveQuotationBrand } from '../../quotations/quotationBranding';
import { DESIGN_PRESETS } from '../../../data/quotationDesignPresets';
import { supabase } from '../../../lib/supabase';
import { assetRef, LOGO_BUCKET, type AssetRef } from '../officeModel';
import { uniquePath, uploadFile } from '../assets';
import { Field } from '../officeUi';
import { AssetSlot, usePrivateImage } from './assetSlot';

type RowId = 'details' | 'logo' | 'signature' | 'sender' | 'design';

const LOGO_FIELDS: Record<LogoSurface, { url: keyof FirmBranding; path: keyof FirmBranding; prefix: string }> = {
  app: { url: 'logoUrl', path: 'logoPath', prefix: 'logo' },
  dark: { url: 'logoOnDarkUrl', path: 'logoOnDarkPath', prefix: 'logo-dark' },
  email: { url: 'emailLogoUrl', path: 'emailLogoPath', prefix: 'logo-email' },
};

interface Props {
  draft: FirmProfile;
  saved: FirmProfile;
  setDraft: React.Dispatch<React.SetStateAction<FirmProfile>>;
  noteUpload: (r: AssetRef) => void;
  /** שורה שנפתחת בכניסה — מכתובת ישנה (‎#/firm/signature‎) או מקישור בעמוד אחר. */
  focus?: string | null;
  /** הרוחב המלא — כשהעיצוב פתוח (יש בו תצוגה מקדימה). */
  onWide?: (wide: boolean) => void;
}

export default function ProfilePage({ draft, saved, setDraft, noteUpload, focus, onWide }: Props) {
  const initial = (['details', 'logo', 'signature', 'sender', 'design'] as RowId[]).includes(focus as RowId) ? focus as RowId : null;
  const [open, setOpen] = useState<Set<RowId>>(new Set(initial ? [initial] : []));
  const toggle = (id: RowId) => setOpen(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  useEffect(() => { onWide?.(open.has('design')); }, [open, onWide]);
  useEffect(() => () => onWide?.(false), [onWide]);

  const upd = <K extends keyof FirmProfile>(key: K, val: FirmProfile[K]) => setDraft(d => ({ ...d, [key]: val }));
  const comm = draft.communication ?? {};
  const updComm = <K extends keyof FirmCommunication>(key: K, val: FirmCommunication[K]) =>
    setDraft(d => ({ ...d, communication: { ...d.communication, [key]: val } }));

  const firmName = (draft.firmName ?? '').trim();
  const email = (draft.email ?? '').trim();
  const brand = deriveQuotationBrand(draft);
  const preset = DESIGN_PRESETS.find(p => p.id === draft.branding?.docDesign?.preset);
  const sigSrc = usePrivateImage(draft.branding?.signaturePath);
  const stampSrc = usePrivateImage(draft.branding?.stampPath);
  const logoUrl = draft.branding?.logoUrl;
  const from = (comm.senderEmail ?? '').trim();
  const replyTo = (comm.replyTo ?? '').trim() || email;
  const sig = (comm.emailSignature ?? '').trim();

  // ── לוגו ──
  const [logoBusy, setLogoBusy] = useState<LogoSurface | null>(null);
  const [logoErr, setLogoErr] = useState<string | null>(null);
  async function uploadLogo({ surface, file }: LogoUploadRequest) {
    const f = LOGO_FIELDS[surface];
    setLogoErr(null);
    setLogoBusy(surface);
    const path = uniquePath(draft.id, f.prefix, file);
    const upErr = await uploadFile(LOGO_BUCKET, path, file);
    setLogoBusy(null);
    if (upErr) { setLogoErr(`ההעלאה נכשלה: ${upErr}`); return; }
    noteUpload(assetRef(LOGO_BUCKET, path));
    const { data: pub } = supabase.storage.from(LOGO_BUCKET).getPublicUrl(path);
    setDraft(d => ({ ...d, branding: { ...d.branding, [f.url]: pub.publicUrl, [f.path]: path } }));
  }
  function removeLogo(surface: LogoSurface) {
    const f = LOGO_FIELDS[surface];
    setDraft(d => ({ ...d, branding: { ...d.branding, [f.url]: undefined, [f.path]: undefined } }));
  }

  return (
    <div className="of-sums">
      <SumRow id="details" title="שם ופרטי קשר" open={open.has('details')} onToggle={() => toggle('details')} autoScroll={initial === 'details'}
        summary={<>
          <span>{firmName || <span className="of-muted">אין שם משרד</span>}</span>
          {draft.representativeNumber && <span>מייצג {draft.representativeNumber}</span>}
          {email ? <bdi className="of-ltr">{email}</bdi> : <span className="of-sum-warn">אין אימייל — התראות למשרד לא יישלחו</span>}
          {draft.phone && <bdi className="of-ltr">{draft.phone}</bdi>}
        </>}>
        <div className="of-fields">
          <Field label="שם המשרד" hint="כך הוא מופיע ללקוחות ובשם השולח של המיילים.">
            <input value={draft.firmName ?? ''} onChange={e => upd('firmName', e.target.value)} placeholder="משרד רואי חשבון…" />
          </Field>
          <Field label="שם משפטי">
            <input value={draft.legalName ?? ''} onChange={e => upd('legalName', e.target.value)} placeholder="השם הרשום" />
          </Field>
          <Field label="מספר מייצג">
            <input value={draft.representativeNumber ?? ''} onChange={e => upd('representativeNumber', e.target.value)} className="of-ltr" inputMode="numeric" />
          </Field>
          <Field label="סוג מייצג">
            <select value={draft.representativeType ?? REP_TYPE_OPTIONS[0]} onChange={e => upd('representativeType', e.target.value)}>
              {REP_TYPE_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
            </select>
          </Field>
          <Field label="אימייל המשרד" hintTone={email ? undefined : 'error'}
            hint={email ? 'לכאן מגיעות ההתראות למשרד.' : 'בלי כתובת — שום התראה למשרד לא תישלח.'}>
            <EmailInput value={draft.email ?? ''} onChange={e => upd('email', e.target.value)} placeholder="office@example.co.il" />
          </Field>
          <Field label="טלפון">
            <input value={draft.phone ?? ''} onChange={e => upd('phone', e.target.value)} className="of-ltr" inputMode="tel" placeholder="03-1234567" />
          </Field>
          <Field label="אתר">
            <input value={draft.website ?? ''} onChange={e => upd('website', e.target.value)} className="of-ltr" placeholder="example.co.il" />
          </Field>
          <Field label="כתובת">
            <input value={draft.address ?? ''} onChange={e => upd('address', e.target.value)} placeholder="רחוב, עיר" />
          </Field>
        </div>
      </SumRow>

      <SumRow id="logo" title="לוגו" open={open.has('logo')} onToggle={() => toggle('logo')} autoScroll={initial === 'logo'}
        summary={logoUrl
          ? <img className="of-sum-logo" src={logoUrl} alt="הלוגו" />
          : <><span className="of-sum-mono" aria-hidden="true">{(draft.branding?.monogram || deriveMonogram(draft.firmName)) || '—'}</span>
            <span className="of-muted">אין לוגו — מוצגים ראשי התיבות</span></>}>
        {logoErr && <div className="of-error-box" role="alert" style={{ marginBottom: 12 }}>{logoErr}</div>}
        <LogoAssetsPanel
          branding={draft.branding}
          darkBg={brand.ink}
          firmName={brand.firmName}
          busySurface={logoBusy}
          onUpload={uploadLogo}
          onRemove={async s => removeLogo(s)}
          onScaleChange={scale => setDraft(d => ({ ...d, branding: { ...d.branding, logoScale: scale } }))}
          onError={setLogoErr}
        />
        <div className="of-fields is-one" style={{ maxWidth: 220, marginTop: 18 }}>
          <Field label="ראשי תיבות כשאין לוגו">
            <input value={draft.branding.monogram ?? ''} maxLength={2} placeholder={deriveMonogram(draft.firmName)}
              onChange={e => setDraft(d => ({ ...d, branding: { ...d.branding, monogram: e.target.value } }))} />
          </Field>
        </div>
      </SumRow>

      <SumRow id="signature" title="חתימה וחותמת למסמכים" open={open.has('signature')} onToggle={() => toggle('signature')} autoScroll={initial === 'signature'}
        summary={<>
          <Thumb src={sigSrc} has={!!draft.branding?.signaturePath} empty="אין חתימה" alt="החתימה" />
          <Thumb src={stampSrc} has={!!draft.branding?.stampPath} empty="אין חותמת" alt="החותמת" square />
        </>}>
        <div className="of-sig-grid">
          <div>
            <div className="of-sub-title">החתימה שלך</div>
            <p className="of-muted" style={{ margin: '2px 0 10px' }}>נכנסת בלחיצה במקום שדורש את חתימתך. רצוי PNG שקוף.</p>
            <AssetSlot kind="signature" draft={draft} saved={saved} setDraft={setDraft} noteUpload={noteUpload} />
          </div>
          <div>
            <div className="of-sub-title">חותמת המשרד</div>
            <p className="of-muted" style={{ margin: '2px 0 10px' }}>מוטבעת על טפסי ייפוי הכוח החתומים.</p>
            <AssetSlot kind="stamp" draft={draft} saved={saved} setDraft={setDraft} noteUpload={noteUpload} />
          </div>
        </div>
      </SumRow>

      <SumRow id="sender" title="מיילים ללקוחות — שולח וחתימה" open={open.has('sender')} onToggle={() => toggle('sender')} autoScroll={initial === 'sender'}
        summary={<>
          <span>בשם {firmName || 'המשרד'}</span>
          {replyTo ? <span>תשובות אל <bdi className="of-ltr">{replyTo}</bdi></span> : <span className="of-sum-warn">אין כתובת לתשובות</span>}
          <span>{sig ? 'עם חתימה בסוף המייל' : 'בלי חתימה בסוף המייל'}</span>
        </>}>
        <div className="of-fields">
          <Field label="כתובת השולח"
            hint={from ? 'הדומיין של הכתובת צריך להיות מאומת אצל ספק המייל.' : 'ריק — יוצא מכתובת המערכת, בשם המשרד.'}>
            <EmailInput value={comm.senderEmail ?? ''} onChange={e => updComm('senderEmail', e.target.value)} placeholder="כתובת המערכת" />
          </Field>
          <Field label="כתובת לתשובות" hint={email ? `ריק — תשובות מגיעות ל-${email}.` : 'ריק — תשובות מגיעות לאימייל המשרד.'}>
            <EmailInput value={comm.replyTo ?? ''} onChange={e => updComm('replyTo', e.target.value)} placeholder={email || 'office@example.co.il'} />
          </Field>
          <Field label="חתימה בסוף כל מייל" wide>
            <textarea rows={4} value={comm.emailSignature ?? ''} onChange={e => updComm('emailSignature', e.target.value)}
              placeholder={'בברכה,\nשם, רו״ח\nשם המשרד · 03-1234567'} />
          </Field>
        </div>
        <div className="of-mailpv" aria-label="דוגמת מייל" style={{ marginTop: 14 }}>
          <div className="of-mailpv-meta">
            <div><span>מאת</span><span>{firmName || 'שם המשרד'} {from ? <bdi className="of-ltr">&lt;{from}&gt;</bdi> : <span className="of-muted">(מכתובת המערכת)</span>}</span></div>
            <div><span>תשובות אל</span><span>{replyTo ? <bdi className="of-ltr">{replyTo}</bdi> : <span className="of-field-hint is-error">אין כתובת — לקוח שיענה לא יגיע אליך</span>}</span></div>
          </div>
          <div className="of-mailpv-body">
            שלום ישראל,
            <br />…גוף המייל…
            <div className="of-mailpv-sig">{sig || <span className="of-muted">אין חתימה</span>}</div>
          </div>
        </div>
      </SumRow>

      <SumRow id="design" title="עיצוב ההצעות, הבקשות והמיילים" open={open.has('design')} onToggle={() => toggle('design')} autoScroll={initial === 'design'}
        summary={<>
          <span className="of-sum-swatches" aria-hidden="true">
            <span style={{ background: brand.ink }} /><span style={{ background: brand.accent }} /><span style={{ background: brand.pageBg }} />
          </span>
          <span>{preset?.label ?? 'תבנית ברירת המחדל'}</span>
        </>}>
        <QuotationDesignStudio profile={draft}
          onChange={dd => setDraft(d => ({ ...d, branding: { ...d.branding, docDesign: dd } }))} />
      </SumRow>
    </div>
  );
}

function Thumb({ src, has, empty, alt, square }: { src?: string; has: boolean; empty: string; alt: string; square?: boolean }) {
  if (!has) return <span className="of-muted">{empty}</span>;
  return (
    <span className={`of-sum-thumb${square ? ' is-square' : ''}`}>
      {src ? <img src={src} alt={alt} /> : <span className="of-muted">…</span>}
    </span>
  );
}

/**
 * שורת סיכום: שם הנושא, הערך הנוכחי, ו«שינוי» שפותח את העורך מתחת.
 * ‼ הכפתור אומר מה יקרה («שינוי»/«סגירה») — לא חץ שצריך לנחש.
 */
export function SumRow({ id, title, summary, open, onToggle, children, autoScroll }: {
  id: string; title: string; summary: ReactNode; open: boolean; onToggle: () => void;
  children: ReactNode; autoScroll?: boolean;
}) {
  const ref = useRef<HTMLElement | null>(null);
  useEffect(() => {
    if (autoScroll && ref.current) ref.current.scrollIntoView({ block: 'start' });
  }, [autoScroll]);
  const bodyId = `of-sum-${id}`;
  return (
    <section ref={ref} className={`of-sum${open ? ' is-open' : ''}`} aria-labelledby={`${bodyId}-t`} data-row={id}>
      <div className="of-sum-head">
        <div className="of-sum-main">
          <h2 className="of-sum-title" id={`${bodyId}-t`}>{title}</h2>
          {!open && <div className="of-sum-val">{summary}</div>}
        </div>
        <button type="button" className={`btn btn-sm ${open ? 'btn-ghost' : 'btn-secondary'}`}
          aria-expanded={open} aria-controls={bodyId} onClick={onToggle}>
          {open ? 'סגירה' : 'שינוי'}
        </button>
      </div>
      {open && <div className="of-sum-body" id={bodyId}>{children}</div>}
    </section>
  );
}

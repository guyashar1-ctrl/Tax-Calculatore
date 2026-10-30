-- ════════════════════════════════════════════════════════════════════════════
-- 314 · ספריית הבקשות — בקשה פשוטה לכל מסמך נפוץ (30.10.2026, באישור גיא)
-- ════════════════════════════════════════════════════════════════════════════
-- גיא: «וזה כל הבקשות? לא אמור להיות עוד? אני מדבר על הכי פשוטות». בספרייה היו 4 בקשות
-- בודדות בלבד. כל מסמך נפוץ = בקשה אחת (נקודה אחת) שאפשר לשלוח לבד או לחבר לקבוצה.
-- ‼ בקשות של המשרד (office_id, כמו «הקמת הרשאה לחיוב חשבון») — נערכות ונמחקות כרגיל בספרייה.
-- ‼ לא נוגע בלקוחות ולא שולח דבר. שם שכבר קיים במשרד (או נוסח מוכן באותו שם) — לא נוסף שוב.
-- הרשימה: DOC_CATALOG (src/types/index.ts) + תעודת זהות ורישיון נהיגה.
-- ════════════════════════════════════════════════════════════════════════════

with docs(ord, name, sub, kind) as (values
  (1,  'צילום תעודת זהות + ספח',               'צילום ברור של שני הצדדים, כולל הספח', 'file'),
  (2,  'צילום רישיון נהיגה',                   'שני הצדדים',                            'file'),
  (3,  'טופס 106',                              'מכל מעסיק שעבדת אצלו בשנה',            'files'),
  (4,  'טופס 161',                              'הודעת מעביד על פרישה או עזיבה',         'file'),
  (5,  'טופס 867',                              'מכל בנק או בית השקעות',                 'files'),
  (6,  'אישור פנסיה / קופות גמל',              'האישור השנתי על ההפקדות',               'files'),
  (7,  'אישור ניהול חשבון בנק / שיק מבוטל',    'אחד מהשניים',                           'file'),
  (8,  'קבלות תרומות (סעיף 46)',                'כל הקבלות מהשנה',                       'files'),
  (9,  'תעודת עולה חדש / תושב חוזר',            'צילום התעודה',                          'file'),
  (10, 'אישור ביטוח חיים / אובדן כושר עבודה',  'האישור השנתי מחברת הביטוח',             'files'),
  (11, 'אישור מגורים (יישוב מזכה)',             'אישור תושבות מהרשות המקומית',           'file'),
  (12, 'שומת מס שנה קודמת',                     'השומה האחרונה שקיבלת ממס הכנסה',        'file'),
  (13, 'דוח רווח והפסד',                        'לשנה שהסתיימה',                         'file'),
  (14, 'תלושי שכר אחרונים',                     'שלושת התלושים האחרונים',                'files')
), offices as (
  select distinct office_id from public.profiles where office_id is not null
)
insert into public.journey_templates (user_id, office_id, kind, name, description, entries)
select null, o.office_id, 'request', d.name, null,
       jsonb_build_array(jsonb_build_object(
         'key', 'e1', 'owner', 'client', 'stepType', 'custom_request', 'requiredForClose', true,
         'payload', jsonb_build_object(
           'title', d.name, 'clientTitle', d.name, 'clientSub', d.sub, 'clientCta', 'להעלאה',
           'requirements', jsonb_build_array(jsonb_build_object(
             'key', 'doc', 'kind', d.kind, 'label', d.name, 'required', true, 'done', false)))))
  from offices o cross join docs d
 where not exists (select 1 from public.journey_templates t
                    where t.kind = 'request' and btrim(t.name) = d.name
                      and (t.office_id = o.office_id or t.office_id is null))
 order by o.office_id, d.ord;

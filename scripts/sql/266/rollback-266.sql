-- התאוששות מ-266: מסיר את «מחק לגמרי». הטבלה tax_work_trash נשארת — יש בה העותקים של מה שנמחק (לשחזור ידני).
drop function if exists public.purge_tax_work(text, boolean);
drop function if exists public._tax_work_purge_scope(text);

-- 285 · חיבור הכרטיסים הקיימים לרשימת היישובים (הוחל בייצור 22.10.2026, אחרי גיבוי backup_r285_20261022).
-- רק התאמה ודאית (_il_locality_code). הטריגר clients_address_canonical משלים בעצמו: השם הרשמי,
-- חלקי הכתובת ויישוב מזכה (כשלא נקבע ידנית). מה שלא זוהה — נשאר כמו שהוא, והמשרד רואה «לא זוהה».
update public.clients c
   set city_code = public._il_locality_code(c.city)
 where c.city_code is null
   and coalesce(btrim(c.city), '') <> ''
   and public._il_locality_code(c.city) is not null;

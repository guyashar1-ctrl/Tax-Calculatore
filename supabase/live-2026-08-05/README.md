# צילום ההגדרות החיות — 2026-08-05

**57 הפונקציות של סכימת `public`, כפי שהן רצות במסד `uoweoqtuiettozagwgdw`
אחרי מיגרציות 56–61** (מהלך "המסע הוא הכרטיס", `docs/PLAN-JOURNEY-CENTER.md`).

נוצר אוטומטית ב-`node scripts/dump-live-functions.mjs supabase/live-2026-08-05`.
מעכשיו זה המנגנון — לא העתקה ידנית. הרץ אותו שוב אחרי כל מהלך SQL, והריפו
יישאר מסונכרן עם המסד.

## למה התיקייה הזאת נוצרה

`live-2026-08-04/` נכתבה ידנית ב-18:28–18:35 UTC, **לפני** שרצו מיגרציות 51–55b
(18:42–19:19 UTC). כתוצאה מכך היא הציגה מצב שלא היה קיים כבר באותו ערב:
`get_client_portal`, `generate_onboarding_steps` ו-`advance_onboarding_step` היו
בגרסה מיושנת, ו-`portal_submit_step` / `publish_onboarding_process` /
`close_onboarding` חסרו לגמרי. היא מכסה 23 פונקציות מתוך 57.

**אל תסתמך על `live-2026-08-04/`.** התיקייה הזאת מחליפה אותה.

## שחזור נוסח קודם של פונקציה

הנוסח המדויק של כל מיגרציה שרצה שמור במסד עצמו:

```sql
select name, array_to_string(statements, E'\n;\n')
from supabase_migrations.schema_migrations
where name like '%portal%' order by version;
```

הנוסח שקדם למהלך הנוכחי:
`get_client_portal` — מיגרציה `portal_publish_gate_52b` (וקודמותיה 51c, 50).
`portal_submit_step` — מיגרציה `portal_submit_step_53`.
`public_link_health` — מיגרציה `public_link_health_check` (32).

## מצב הבסיס שנמדד בתחילת המהלך

- מיגרציה אחרונה לפני המהלך: `20260804191955` (`long_tail_steps_dont_block_activation_55b`).
- `public_link_health()` — ירוק, 21 קישורים. אחרי המהלך: 24, בשישה סוגים
  (נוספו `portal` ו-`release`).
- 17 לקוחות, 3 התקשרויות, 28 שלבי קליטה, 10 בקשות ייצוג, 4 הצעות, 3 לידים,
  14 משימות, 11 מסמכים.

-- 143 — בקשה אחת, כמה טופסי 2279
--
-- עד כה לבקשה היה טופס אחד: `signature_setup` יחיד ו-`signed_pdf_path` יחיד.
-- זה מספיק כשכל הרשויות שייכות לאותו תיק, אבל מע"מ וניכויים מוגשים בנפרד לכל
-- אדם, ובחלק ב' של הטופס יש שורת «שם העוסק» אחת — שני תיקי מע"מ אינם נכנסים
-- לטופס אחד. משק בית אחד עשוי אפוא להוליד כמה טפסים.
--
-- ‼ החותמים ותפקידיהם **זהים בכל הטפסים**: מיקומי החתימה נגזרים מיחסי
-- בן-הזוג-הרשום ולא ממי שהתיק שלו — הרשום חותם תמיד במקום «בן זוג רשום»
-- והשני במקום «בן/בת הזוג». לכן `signers` נשאר ברמת הבקשה, ומה שמתרבה הוא
-- המסמך בלבד.
--
-- `signature_documents`: [{key,title,pdfDocId,pdfFileName,fields[],createdAt,
--                          signedPdfStoredId}]
--   key = מפתח ההגשה בשע״ם — אחת לכל אדם ('person:client' | 'person:spouse').
--
-- ‼ תאימות לאחור בלי מיגרציית נתונים: **אין רשימה ⇒ מסמך יחיד מהשדות
-- הישנים**, וזו בדיוק המשמעות של כל בקשה קיימת. בקשה חדשה כותבת את הרשימה
-- **וגם** ממשיכה לשקף את המסמך הראשון ב-`signature_setup`/`signed_pdf_path`,
-- כדי שכל הקוראים שלהם — `get_onboarding.has_setup`, `submit_signature`,
-- מסכי הסטטוס — ימשיכו לעבוד בלי לדעת על הרשימה. אין מילוי-לאחור.

alter table public.representation_requests
  add column if not exists signature_documents jsonb;

comment on column public.representation_requests.signature_documents is
  'כל טופסי ה-2279 של הבקשה. NULL = בקשה מלפני 143; המסמך היחיד נגזר מ-signature_setup + signed_pdf_path.';

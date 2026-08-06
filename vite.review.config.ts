// ─── בנייה של סביבת הסקירה הוויזואלית ────────────────────────────────────────
// ‼ קיים רק בענף הסקירה. אינו מיועד למיזוג ל-master.
//
// שני דברים בלבד נבדלים מהבנייה הרגילה, ושניהם קיימים כדי לבודד:
//
//   1. תוסף שמיירט את *הפתרון* של src/lib/supabase.ts ומחזיר במקומו בדל.
//      ‼ ההחלפה נעשית על הנתיב המפוענח ולא על צורת ה-import, כי במוצר יש
//      ארבע צורות שונות ('./supabase', './lib/supabase', '../lib/supabase',
//      '../../lib/supabase') — התאמה לפי מחרוזת החמיצה אחת מהן והקובץ
//      האמיתי נכנס לחבילה דרך הדלת האחורית.
//      התוצאה: הקובץ היחיד במוצר שקורא את VITE_SUPABASE_URL ו-
//      VITE_SUPABASE_ANON_KEY אינו נכנס לפלט, ואיתו לא נכנסת גם ספריית
//      supabase-js עצמה. אין כתובת, אין מפתח, ואין לקוח שאפשר לפנות בו.
//   2. נקודת הכניסה היא index.review.html, שטוענת את ReviewApp במקום App.
//
// envPrefix מכוון לתחילית שאינה בשימוש, כדי ש-Vite לא יטמיע שום משתנה
// VITE_* בפלט — חגורה נוספת מעל הבדל.

import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';
import { copyFileSync, existsSync } from 'fs';

const STUB = resolve(__dirname, 'src/review/supabaseStub.ts');
const REAL = resolve(__dirname, 'src/lib/supabase.ts');

/** מיירט כל ניסיון לטעון את לקוח ה-Supabase האמיתי, מכל צורת import שהיא. */
function isolateSupabase(): Plugin {
  return {
    name: 'review-isolate-supabase',
    enforce: 'pre',
    async resolveId(source, importer, options) {
      const resolved = await this.resolve(source, importer, { ...options, skipSelf: true });
      if (!resolved) return null;
      const id = resolved.id.split('?')[0].replace(/\\/g, '/');
      if (id === REAL.replace(/\\/g, '/')) return STUB;
      // חסימה מוחלטת של הספרייה עצמה — גם import ישיר לא יעבור.
      if (id.includes('/node_modules/@supabase/supabase-js/')) {
        throw new Error(
          '[review] ניסיון לייבא את @supabase/supabase-js בבנייה המבודדת. ' +
          'הבנייה הזאת אינה אמורה להכיל לקוח מסד כלל.',
        );
      }
      return null;
    },
  };
}

/** מוציא את הדף גם כ-index.html, כדי ש"/" יעבוד גם מקומית וגם בורסל. */
function emitAsIndex(): Plugin {
  return {
    name: 'review-emit-as-index',
    closeBundle() {
      const dir = resolve(__dirname, 'dist-review');
      const from = resolve(dir, 'index.review.html');
      if (existsSync(from)) copyFileSync(from, resolve(dir, 'index.html'));
    },
  };
}

export default defineConfig({
  plugins: [isolateSupabase(), react(), emitAsIndex()],
  envPrefix: 'REVIEW_ONLY_UNUSED_',
  build: {
    outDir: 'dist-review',
    rollupOptions: {
      input: resolve(__dirname, 'index.review.html'),
    },
  },
});

import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { execSync } from 'node:child_process'
import { readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

/**
 * חותמת מקור — כדי שבדיקה לא תרוץ בטעות על קוד ישן.
 *
 * ‼ למה זה קיים: בבדיקות המובייל שיניתי קוד, "טענתי מחדש" את המסגרת, וקיבלתי
 * מדידות של הגרסה **הקודמת**. תוצאה שנראית תקינה על קוד ישן גרועה מתוצאה
 * שנכשלת, כי היא מסתירה את הבעיה במקום לחשוף אותה.
 *
 * ‼ מוגש דרך middleware ולא כמודול: מודול וירטואלי נכנס למטמון של vite
 * והחותמת קפאה על הערך של עליית השרת — כלומר בדיוק התקלה שהיא אמורה לגלות.
 * נקודת קצה עם no-store מחושבת מחדש בכל בקשה, תמיד.
 *
 * dev בלבד. בבנייה לפרודקשן אין נקודת קצה כזאת והערך הוא 'build'.
 */
function computeStamp(): string {
  let head = 'nogit'
  try { head = execSync('git rev-parse --short HEAD').toString().trim() } catch { /* אין ריפו */ }
  let newest = 0
  const walk = (dir: string) => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const p = join(dir, e.name)
      if (e.isDirectory()) walk(p)
      else { const m = statSync(p).mtimeMs; if (m > newest) newest = m }
    }
  }
  try { walk('src') } catch { /* אין תיקייה */ }
  return `${head}.${Math.round(newest)}`
}

function srcStampPlugin() {
  return {
    name: 'src-stamp',
    apply: 'serve' as const,
    configureServer(server: { middlewares: { use(path: string, fn: (req: unknown, res: { setHeader(k: string, v: string): void; end(b: string): void }) => void): void } }) {
      server.middlewares.use('/__src_stamp', (_req, res) => {
        res.setHeader('Content-Type', 'text/plain; charset=utf-8')
        res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate')
        res.end(computeStamp())
      })
    },
  }
}

export default defineConfig({
  plugins: [react(), srcStampPlugin()],
  server: {
    watch: {
      // ‼ תיקיות עבודה מקבילות יושבות בתוך הפרויקט ומכילות פרופיל דפדפן חי.
      // קובץ ה-Cookies שלו נעול על ידי התהליך, והצופה של vite קרס עם EBUSY
      // והפיל את השרת כולו. אין שום סיבה לצפות בהן — הן ריפו נפרד.
      ignored: ['**/.claude/worktrees/**'],
    },
  },
})

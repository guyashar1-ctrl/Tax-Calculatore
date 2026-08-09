import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import './components/ui/ui.css'
import './components/ui/pivo-design.css'
import App from './App.tsx'
import { ToastProvider } from './components/ui/Toast'

/**
 * ‼ חותמת המקור נחשפת ל-window כדי שבדיקה אוטומטית תוכל לוודא שהיא רואה את
 * הקוד שעל הדיסק ולא גרסה שנשארה בזיכרון הדפדפן. ראה vite.config.ts.
 * dev בלבד; בפרודקשן הערך נשאר 'build' ואינו מסגיר דבר.
 */
(window as unknown as Record<string, unknown>).__SRC_STAMP__ = 'build';
if (import.meta.env.DEV) {
  void fetch('/__src_stamp', { cache: 'no-store' })
    .then(r => r.text())
    .then(s => { (window as unknown as Record<string, unknown>).__SRC_STAMP__ = s.trim(); })
    .catch(() => { /* אין נקודת קצה — נשאר 'build' */ });
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ToastProvider>
      <App />
    </ToastProvider>
  </StrictMode>,
)

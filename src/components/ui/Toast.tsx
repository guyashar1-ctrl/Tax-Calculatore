/**
 * הודעה חולפת · אפיון §3.17.
 * אחת בכל רגע — חדשה מחליפה ישנה. נעלמת אחרי 5 שניות.
 * זהו גם מנגנון ה"ביטול" של פעולות הפיכות: משימה שהושלמה בטעות
 * נסגרת מיד ואפשר להחזיר אותה, במקום לשאול "בטוח?" לפני כל לחיצה.
 */
import { createContext, useContext, useState, useCallback, useRef, ReactNode, useEffect } from 'react';

interface ToastPayload {
  message: string;
  actionLabel?: string;
  onAction?: () => void;
}

interface ToastApi {
  showToast: (payload: ToastPayload | string) => void;
}

const Ctx = createContext<ToastApi>({ showToast: () => {} });

export function useToast() { return useContext(Ctx); }

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<(ToastPayload & { id: number }) | null>(null);
  const timer = useRef<number | undefined>(undefined);

  const showToast = useCallback((payload: ToastPayload | string) => {
    const data = typeof payload === 'string' ? { message: payload } : payload;
    window.clearTimeout(timer.current);
    setToast({ ...data, id: Date.now() });
    timer.current = window.setTimeout(() => setToast(null), 5000);
  }, []);

  useEffect(() => () => window.clearTimeout(timer.current), []);

  return (
    <Ctx.Provider value={{ showToast }}>
      {children}
      {toast && (
        <div className="ui-toast" role="status" key={toast.id}>
          <span>{toast.message}</span>
          {toast.actionLabel && (
            <button
              type="button"
              className="ui-toast-action"
              onClick={() => { toast.onAction?.(); window.clearTimeout(timer.current); setToast(null); }}
            >
              {toast.actionLabel}
            </button>
          )}
        </div>
      )}
    </Ctx.Provider>
  );
}

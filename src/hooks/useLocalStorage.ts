import { useState, useEffect } from 'react';

export function useLocalStorage<T>(key: string, initialValue: T) {
  const [storedValue, setStoredValue] = useState<T>(() => {
    try {
      const item = window.localStorage.getItem(key);
      if (!item) return initialValue;
      const parsed = JSON.parse(item) as T;
      // Safety: if initialValue is an array but parsed isn't, fall back
      if (Array.isArray(initialValue) && !Array.isArray(parsed)) return initialValue;
      return parsed;
    } catch {
      return initialValue;
    }
  });

  useEffect(() => {
    try {
      window.localStorage.setItem(key, JSON.stringify(storedValue));
    } catch {
      // ignore
    }
  }, [key, storedValue]);

  return [storedValue, setStoredValue] as const;
}

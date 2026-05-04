'use client';

import { createContext, useContext, useEffect, useState, useCallback } from 'react';

type Theme = 'dark' | 'light';

const ThemeContext = createContext<{
  theme: Theme;
  toggle: () => void;
} | null>(null);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  // Always initialize as 'dark' to match the server render and avoid hydration mismatch.
  // The actual stored preference is applied in the useEffect below.
  const [theme, setTheme] = useState<Theme>('dark');

  // Sync theme from localStorage after mount (client-only)
  useEffect(() => {
    const stored = localStorage.getItem('redteam_theme') as Theme | null;
    if (stored === 'light') setTheme('light');
  }, []);

  // Keep effect only for applying to document if needed, 
  // though it's already handled by layout.tsx inline script.
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  const toggle = useCallback(() => {
    setTheme((prev) => {
      const next: Theme = prev === 'dark' ? 'light' : 'dark';
      document.documentElement.setAttribute('data-theme', next);
      try { localStorage.setItem('redteam_theme', next); } catch { /* silent */ }
      return next;
    });
  }, []);

  return (
    <ThemeContext.Provider value={{ theme, toggle }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used within ThemeProvider');
  return ctx;
}

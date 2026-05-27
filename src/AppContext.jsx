import { createContext, useContext, useState, useEffect, useCallback } from 'react';

const CategoriesCtx = createContext(null);
const SessionsCtx = createContext(null);

const DEFAULT_CATEGORIES = [{ name: 'General', color: '#1976d2' }];

export function AppProvider({ children }) {
  const [categories, setCategories] = useState(() => {
    try {
      const raw = JSON.parse(localStorage.getItem('categories'));
      if (!Array.isArray(raw) || !raw.length) return DEFAULT_CATEGORIES;
      if (typeof raw[0] === 'string') return raw.map(name => ({ name, color: '#1976d2' }));
      return raw;
    } catch { return DEFAULT_CATEGORIES; }
  });

  const [activeCategory, setActiveCategory] = useState(() =>
    localStorage.getItem('category') || DEFAULT_CATEGORIES[0].name
  );

  const [sessions, setSessions] = useState(() => {
    try { return JSON.parse(localStorage.getItem('sessions')) || []; }
    catch { return []; }
  });

  useEffect(() => {
    localStorage.setItem('categories', JSON.stringify(categories));
  }, [categories]);

  useEffect(() => {
    localStorage.setItem('category', activeCategory);
  }, [activeCategory]);

  const getCategoryColor = useCallback((name) =>
    categories.find(c => c.name === name)?.color ?? '#1976d2',
  [categories]);

  const addSession = useCallback((session) => {
    setSessions(prev => {
      const updated = [...prev, session];
      try { localStorage.setItem('sessions', JSON.stringify(updated)); } catch {}
      return updated;
    });
  }, []);

  return (
    <CategoriesCtx.Provider value={{ categories, setCategories, getCategoryColor, activeCategory, setActiveCategory }}>
      <SessionsCtx.Provider value={{ sessions, addSession }}>
        {children}
      </SessionsCtx.Provider>
    </CategoriesCtx.Provider>
  );
}

export const useCategories = () => useContext(CategoriesCtx);
export const useSessions = () => useContext(SessionsCtx);

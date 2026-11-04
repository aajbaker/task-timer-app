import { createContext, useContext, useState, useEffect, useCallback } from 'react';

const CategoriesCtx = createContext(null);
const SessionsCtx = createContext(null);

const DEFAULT_CATEGORIES = [
  { name: 'General', color: '#1976d2' },
  { name: 'Writing', color: '#7b1fa2' },
];

// Default category names this browser has already been given, so a newly
// added default reaches existing users once, and stays gone if they delete it.
const SEEDED_KEY = 'seededDefaultCategories';

function loadCategories() {
  let cats;
  try {
    const raw = JSON.parse(localStorage.getItem('categories'));
    if (!Array.isArray(raw) || !raw.length) return DEFAULT_CATEGORIES;
    cats = typeof raw[0] === 'string' ? raw.map(name => ({ name, color: '#1976d2' })) : raw;
  } catch { return DEFAULT_CATEGORIES; }

  let seeded;
  try { seeded = JSON.parse(localStorage.getItem(SEEDED_KEY)) || ['General']; }
  catch { seeded = ['General']; }

  const has = (name) => cats.some(c => c.name.toLowerCase() === name.toLowerCase());
  const missing = DEFAULT_CATEGORIES.filter(d => !seeded.includes(d.name) && !has(d.name));
  return missing.length ? [...cats, ...missing] : cats;
}

export function AppProvider({ children }) {
  const [categories, setCategories] = useState(loadCategories);

  useEffect(() => {
    try {
      localStorage.setItem(SEEDED_KEY, JSON.stringify(DEFAULT_CATEGORIES.map(c => c.name)));
    } catch { /* storage unavailable */ }
  }, []);

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

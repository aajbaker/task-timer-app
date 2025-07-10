import React, { useState, useEffect, useRef } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';

const HomePage = () => {
  // Helper to get initial categories with color
  const getInitialCategories = () => {
    const stored = localStorage.getItem('categories');
    if (stored) {
      const parsed = JSON.parse(stored);
      // Migrate string array to object array if needed
      if (Array.isArray(parsed) && typeof parsed[0] === 'string') {
        return parsed.map(name => ({ name, color: '#1976d2' }));
      }
      return parsed;
    }
    return [{ name: 'General', color: '#1976d2' }];
  };
  const getInitialCategory = () => {
    const stored = localStorage.getItem('category');
    return stored ? stored : 'General';
  };

  // Helper to get initial timer state from localStorage
  const getInitialTimerState = () => {
    const saved = localStorage.getItem('timerState');
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch {}
    }
    return {};
  };
  const initialTimerState = getInitialTimerState();

  const [time, setTime] = useState(
    typeof initialTimerState.time === 'number' ? initialTimerState.time : 30 * 60
  );
  const [isRunning, setIsRunning] = useState(
    typeof initialTimerState.isRunning === 'boolean' ? initialTimerState.isRunning : false
  );
  const [editingTime, setEditingTime] = useState(false);
  const [inputMinutes, setInputMinutes] = useState(Math.floor(time / 60));
  const [inputSeconds, setInputSeconds] = useState(time % 60);
  const [menuOpen, setMenuOpen] = useState(null); // which category's menu is open
  const [colorMenuOpen, setColorMenuOpen] = useState(null); // which category's color menu is open
  const [endTime, setEndTime] = useState(
    typeof initialTimerState.endTime === 'number' ? initialTimerState.endTime : null
  );
  const [lastSetTime, setLastSetTime] = useState(
    typeof initialTimerState.lastSetTime === 'number' ? initialTimerState.lastSetTime : 30 * 60
  );
  const [sessionStart, setSessionStart] = useState(null);
  const [categories, setCategories] = useState(getInitialCategories);
  const [category, setCategory] = useState(
    initialTimerState.category || getInitialCategory()
  );
  const [addingCategory, setAddingCategory] = useState(false);
  const [newCategory, setNewCategory] = useState("");
  const [newCategoryColor, setNewCategoryColor] = useState('#1976d2');
  const minutesInputRef = useRef(null);
  const newCategoryInputRef = useRef(null);
  const defaultColors = ['#1976d2', '#388e3c', '#fbc02d', '#d32f2f', '#7b1fa2'];
  const audioRef = useRef(null);
  const navigate = useNavigate();
  const location = useLocation();
  const isStats = location.pathname === '/stats';

  // Helper to log a session
  const logSession = (endType = 'complete') => {
    if (!sessionStart) return;
    const end = Date.now();
    const start = sessionStart;
    const duration = Math.round((end - start) / 1000); // in seconds
    const dateObj = new Date(start);
    const dayOfWeek = dateObj.getDay(); // 0=Sun
    const session = {
      start,
      end,
      duration,
      dayOfWeek,
      category,
      endType,
    };
    let sessions = [];
    try {
      sessions = JSON.parse(localStorage.getItem('sessions')) || [];
    } catch {}
    sessions.push(session);
    localStorage.setItem('sessions', JSON.stringify(sessions));
  };

  useEffect(() => {
    let interval;
    if (isRunning && endTime) {
      interval = setInterval(() => {
        const remaining = Math.max(0, Math.round((endTime - Date.now()) / 1000));
        setTime(remaining);
        if (remaining === 0) {
          // Play chime and show notification here
          let played = false;
          if (audioRef.current) {
            audioRef.current.currentTime = 0;
            audioRef.current.play().then(() => { played = true; }).catch(() => {});
          }
          setTimeout(() => { if (!played) playBeep(); }, 300);
          if (window.Notification && Notification.permission === 'granted' && document.visibilityState !== 'visible') {
            new Notification('Time is up!', { body: 'Your timer has finished.' });
          }
          logSession('complete');
          setIsRunning(false);
          setEndTime(null);
          setTime(lastSetTime); // Reset to last set time
        }
      }, 200);
    }
    return () => clearInterval(interval);
  }, [isRunning, endTime]);

  // When timer is reset or edited, clear endTime
  useEffect(() => {
    if (!isRunning) setEndTime(null);
  }, [isRunning]);

  useEffect(() => {
    document.title = formatTime();
  }, [time]);

  useEffect(() => {
    if (editingTime && minutesInputRef.current) {
      minutesInputRef.current.focus();
      minutesInputRef.current.select();
    }
  }, [editingTime]);

  useEffect(() => {
    if (addingCategory && newCategoryInputRef.current) {
      newCategoryInputRef.current.focus();
    }
  }, [addingCategory]);

  // Save categories and category to localStorage when they change
  useEffect(() => {
    localStorage.setItem('categories', JSON.stringify(categories));
  }, [categories]);

  useEffect(() => {
    localStorage.setItem('category', category);
  }, [category]);

  // Persist timer state to localStorage on change
  useEffect(() => {
    localStorage.setItem('timerState', JSON.stringify({
      time,
      isRunning,
      endTime,
      category,
      lastSetTime
    }));
  }, [time, isRunning, endTime, category, lastSetTime]);

  // Sync body background color with timer background
  useEffect(() => {
    document.body.style.background = getCategoryColor(category);
    return () => {
      document.body.style.background = '';
    };
  }, [category, categories]);

  // Get color for current category
  const getCategoryColor = (catName) => {
    const cat = categories.find(c => c.name === catName);
    return cat ? cat.color : '#1976d2';
  };

  const formatTime = () => {
    const minutes = Math.floor(time / 60);
    const seconds = time % 60;
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  };

  const handleTimeClick = () => {
    if (isRunning) return;
    setInputMinutes(Math.floor(time / 60));
    setInputSeconds('00'); // Always reset seconds to 00 when editing
    setEditingTime(true);
  };

  const handleMinutesChange = (e) => {
    setInputMinutes(e.target.value.replace(/[^0-9]/g, ''));
  };

  const handleSecondsChange = (e) => {
    let value = e.target.value.replace(/[^0-9]/g, '');
    if (parseInt(value, 10) > 59) value = '59';
    if (value.length > 2) value = value.slice(0, 2);
    if (value.length === 1) value = '0' + value;
    setInputSeconds(value);
  };

  const handleTimeInputBlur = () => {
    const minutes = parseInt(inputMinutes, 10) || 0;
    const seconds = parseInt(inputSeconds, 10) || 0;
    if (minutes > 0 || seconds > 0) {
      const newTime = minutes * 60 + seconds;
      setTime(newTime);
      setLastSetTime(newTime); // Only update here
    }
    setEditingTime(false);
  };

  const handleTimeInputKeyDown = (e) => {
    if (e.key === 'Enter') {
      handleTimeInputBlur();
    } else if (e.key === 'Escape') {
      setEditingTime(false);
    }
  };

  // Close menu on outside click
  useEffect(() => {
    const handleClick = (e) => {
      if (!e.target.closest('.cat-menu-btn') && !e.target.closest('.cat-menu')) {
        setMenuOpen(null);
      }
    };
    if (menuOpen !== null) {
      document.addEventListener('mousedown', handleClick);
    }
    return () => document.removeEventListener('mousedown', handleClick);
  }, [menuOpen]);

  // Request notification permission on mount
  useEffect(() => {
    if (window.Notification && Notification.permission === 'default') {
      Notification.requestPermission();
    }
  }, []);

  // Unlock audio on first user interaction
  useEffect(() => {
    const unlock = () => {
      if (audioRef.current) {
        audioRef.current.play().catch(() => {});
        audioRef.current.pause();
        audioRef.current.currentTime = 0;
      }
      window.removeEventListener('pointerdown', unlock);
    };
    window.addEventListener('pointerdown', unlock);
    return () => window.removeEventListener('pointerdown', unlock);
  }, []);

  // Helper: Web Audio API beep fallback
  const playBeep = () => {
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = 'sine';
      o.frequency.value = 880;
      g.gain.value = 0.15;
      o.connect(g).connect(ctx.destination);
      o.start();
      o.stop(ctx.currentTime + 0.4);
      o.onended = () => ctx.close();
    } catch {}
  };

  return (
    <div
      className="timer-container"
      style={{
        background: getCategoryColor(category),
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        width: '100vw',
        margin: 0,
        padding: 0,
        position: 'relative',
      }}
    >
      <div style={{ position: 'absolute', top: 24, right: 32, zIndex: 10 }}>
        <Link
          to="/stats"
          style={{
            display: 'inline-block',
            padding: '8px 22px',
            borderRadius: 20,
            background: '#fff',
            color: '#1976d2',
            fontWeight: 'bold',
            fontSize: 17,
            textDecoration: 'none',
            border: '2px solid #1976d2',
            boxShadow: '0 2px 8px rgba(25,118,210,0.08)',
            transition: 'background 0.2s, color 0.2s',
          }}
          onMouseOver={e => {
            e.target.style.background = '#1976d2';
            e.target.style.color = '#fff';
          }}
          onMouseOut={e => {
            e.target.style.background = '#fff';
            e.target.style.color = '#1976d2';
          }}
        >
          Go to Stats
        </Link>
      </div>
      {/* Chime audio element */}
      <audio ref={audioRef} src="src/assets/chime-sound-7143.mp3" preload="auto" />
      <div className="timer-display">
        <div className="timer-static" style={{ visibility: editingTime ? 'hidden' : 'visible' }}>
          <h1
            style={{ cursor: isRunning ? 'not-allowed' : 'pointer', width: '100%', opacity: isRunning ? 0.6 : 1 }}
            onClick={handleTimeClick}
            title={isRunning ? 'Pause or reset to edit timer' : 'Click to set timer'}
          >
            {formatTime()}
          </h1>
        </div>
        <div className="timer-edit" style={{ visibility: editingTime ? 'visible' : 'hidden' }}>
          <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '100%' }}>
            <input
              type="text"
              className="timer-input"
              value={inputMinutes}
              onChange={handleMinutesChange}
              onBlur={handleTimeInputBlur}
              onKeyDown={handleTimeInputKeyDown}
              ref={minutesInputRef}
              maxLength={2}
              disabled={isRunning}
              style={{ width: '60px' }}
            />
            <span className="timer-colon">:</span>
            <input
              type="text"
              className="timer-input"
              value={inputSeconds.toString().padStart(2, '0')}
              onChange={handleSecondsChange}
              onBlur={handleTimeInputBlur}
              onKeyDown={handleTimeInputKeyDown}
              maxLength={2}
              disabled={isRunning}
              style={{ width: '60px' }}
            />
          </span>
        </div>
      </div>
      <div className="timer-buttons">
        <button
          onClick={() => {
            if (!isRunning) {
              setEndTime(Date.now() + time * 1000);
              setSessionStart(Date.now());
            }
            setIsRunning(!isRunning);
          }}
          style={{
            background: '#f5f5f5',
            color: '#444',
            border: '2px solid #bbb',
            borderRadius: 8,
            padding: '8px 18px',
            cursor: 'pointer',
            fontWeight: 'bold',
            outline: 'none',
            marginRight: 8,
            transition: 'all 0.2s',
            boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
          }}
        >
          {isRunning ? 'Pause' : 'Start'}
        </button>
        <button
          onClick={() => {
            setTime(lastSetTime);
            setIsRunning(false);
            setEndTime(null);
            setLastSetTime(lastSetTime); // Ensure reset always uses lastSetTime
            logSession('reset');
          }}
          style={{
            background: '#f5f5f5',
            color: '#444',
            border: '2px solid #bbb',
            borderRadius: 8,
            padding: '8px 18px',
            cursor: 'pointer',
            fontWeight: 'bold',
            outline: 'none',
            transition: 'all 0.2s',
            boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
          }}
        >
          Reset
        </button>
      </div>
      <div className="category-bar" style={{ display: 'flex', gap: '10px', margin: '24px 0', flexWrap: 'wrap' }}>
        {categories.map(cat => (
          <div key={cat.name} style={{ position: 'relative', display: 'inline-block' }}>
            <button
              onClick={() => setCategory(cat.name)}
              style={{
                background: category === cat.name ? cat.color : '#f5f5f5',
                color: category === cat.name ? '#fff' : cat.color,
                border: category === cat.name ? '2px solid #222' : `2px solid ${cat.color}`,
                fontWeight: category === cat.name ? 'bold' : 'normal',
                borderRadius: 8,
                padding: '8px 18px',
                cursor: 'pointer',
                outline: 'none',
                boxShadow: category === cat.name ? '0 2px 8px rgba(0,0,0,0.12)' : 'none',
                opacity: category === cat.name ? 1 : 0.85,
                transition: 'all 0.2s',
                position: 'relative',
                paddingRight: '32px',
              }}
            >
              {cat.name}
            </button>
            <button
              className="cat-menu-btn"
              style={{
                position: 'absolute',
                right: 4,
                top: 4,
                background: 'transparent',
                border: 'none',
                color: '#fff',
                fontSize: '1.2em',
                cursor: 'pointer',
                zIndex: 2,
                padding: 0,
                width: 24,
                height: 24,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                opacity: 0.7,
              }}
              onClick={e => {
                e.stopPropagation();
                setMenuOpen(cat.name === menuOpen ? null : cat.name);
                setColorMenuOpen(null);
              }}
              title="Category options"
            >
              &#8942;
            </button>
            {menuOpen === cat.name && (
              <div className="cat-menu" style={{
                position: 'absolute',
                right: 0,
                top: 36,
                background: '#fff',
                color: '#222',
                border: '1px solid #bbb',
                borderRadius: 6,
                boxShadow: '0 2px 8px rgba(0,0,0,0.12)',
                zIndex: 10,
                minWidth: 120,
              }}>
                <button
                  style={{
                    background: 'none',
                    border: 'none',
                    color: cat.name === 'General' ? '#bbb' : '#d32f2f',
                    padding: '8px 12px',
                    width: '100%',
                    textAlign: 'left',
                    cursor: cat.name === 'General' ? 'not-allowed' : 'pointer',
                    fontWeight: 'bold',
                  }}
                  onClick={() => {
                    if (cat.name !== 'General') {
                      setCategories(categories.filter(c => c.name !== cat.name));
                      if (category === cat.name) setCategory('General');
                    }
                    setMenuOpen(null);
                  }}
                  disabled={cat.name === 'General'}
                >Delete</button>
                <button
                  style={{
                    background: 'none',
                    border: 'none',
                    color: '#1976d2',
                    padding: '8px 12px',
                    width: '100%',
                    textAlign: 'left',
                    cursor: 'pointer',
                    fontWeight: 'bold',
                  }}
                  onClick={() => {
                    setColorMenuOpen(cat.name);
                  }}
                >Set Color</button>
                {colorMenuOpen === cat.name && (
                  <div style={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 8,
                    padding: 12,
                    background: '#fafafa',
                    borderRadius: 6,
                    border: '1px solid #eee',
                    marginTop: 4,
                  }}>
                    <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
                      {defaultColors.map(color => (
                        <button
                          key={color}
                          style={{
                            width: 28,
                            height: 28,
                            borderRadius: 8, // soft corners
                            border: color === cat.color ? `3px solid #222` : `2px solid ${color}`,
                            background: color,
                            cursor: 'pointer',
                            outline: 'none',
                            boxShadow: color === cat.color ? '0 0 0 2px #1976d2' : 'none',
                            margin: 0,
                            padding: 0,
                          }}
                          onClick={() => {
                            setCategories(categories.map(c => c.name === cat.name ? { ...c, color } : c));
                          }}
                          title={color}
                        />
                      ))}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <input
                        type="color"
                        value={cat.color}
                        onChange={e => {
                          setCategories(categories.map(c => c.name === cat.name ? { ...c, color: e.target.value } : c));
                        }}
                        style={{ width: 32, height: 32, border: 'none', background: 'none', cursor: 'pointer' }}
                      />
                      <span style={{ fontSize: 13, color: '#444' }}>Custom</span>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        ))}
        {addingCategory ? (
          <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <input
              type="text"
              className="category-select"
              ref={newCategoryInputRef}
              value={newCategory}
              onChange={e => setNewCategory(e.target.value)}
              placeholder="New category"
              style={{ marginRight: 2 }}
            />
            <input
              type="color"
              value={newCategoryColor}
              onChange={e => setNewCategoryColor(e.target.value)}
              title="Pick a color"
              style={{ width: 28, height: 28, border: 'none', background: 'none', cursor: 'pointer' }}
            />
            <button
              onClick={() => {
                if (newCategory.trim() && !categories.some(c => c.name === newCategory.trim())) {
                  setCategories([...categories, { name: newCategory.trim(), color: newCategoryColor }]);
                  setCategory(newCategory.trim());
                }
                setNewCategory("");
                setNewCategoryColor('#1976d2');
                setAddingCategory(false);
              }}
              style={{ marginLeft: 2 }}
            >Add</button>
            <button
              onClick={() => {
                setAddingCategory(false);
                setNewCategory("");
                setNewCategoryColor('#1976d2');
              }}
              style={{ marginLeft: 2 }}
            >Cancel</button>
          </span>
        ) : (
          <button
            onClick={() => setAddingCategory(true)}
            style={{
              background: '#f5f5f5',
              color: '#444',
              border: '2px solid #444',
              borderRadius: 8,
              padding: '8px 18px',
              cursor: 'pointer',
              fontWeight: 'bold',
              outline: 'none',
              transition: 'all 0.2s',
              boxShadow: '0 2px 8px rgba(0,0,0,0.12)',
            }}
          >
            + New Category
          </button>
        )}
      </div>
    </div>
  );
};

export default HomePage;
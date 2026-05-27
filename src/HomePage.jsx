import { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { useCategories, useSessions } from './AppContext';
import { getContrastColor } from './utils';
import chimeSound from './assets/chime-sound-7143.mp3';

const PRESET_COLORS = ['#1976d2', '#388e3c', '#d32f2f', '#7b1fa2', '#e65100', '#0097a7'];

function getSavedTimer() {
  try { return JSON.parse(localStorage.getItem('timerState')) || {}; }
  catch { return {}; }
}

export default function HomePage() {
  const { categories, setCategories, getCategoryColor, activeCategory: category, setActiveCategory: setCategory } = useCategories();
  const { addSession } = useSessions();

  // ── Timer state ──────────────────────────────────────────────────────
  const saved = getSavedTimer();
  const [time, setTime] = useState(saved.time ?? 30 * 60);
  const [isRunning, setIsRunning] = useState(false);
  const [endTime, setEndTime] = useState(null);
  const [lastSetTime, setLastSetTime] = useState(saved.lastSetTime ?? 30 * 60);
  const [sessionStart, setSessionStart] = useState(null);

  // ── Timer editing ────────────────────────────────────────────────────
  const [editingTime, setEditingTime] = useState(false);
  const [inputMins, setInputMins] = useState(Math.floor(time / 60));
  const [inputSecs, setInputSecs] = useState('00');
  const minutesRef = useRef(null);

  // ── Category editing ─────────────────────────────────────────────────
  const [colorPickerFor, setColorPickerFor] = useState(null);
  const [addingCategory, setAddingCategory] = useState(false);
  const [newCatName, setNewCatName] = useState('');
  const [newCatColor, setNewCatColor] = useState(PRESET_COLORS[0]);
  const newCatRef = useRef(null);

  // ── Audio ─────────────────────────────────────────────────────────────
  const audioRef = useRef(null);

  // ── Derived theming ───────────────────────────────────────────────────
  const bgColor = getCategoryColor(category);
  const fg = getContrastColor(bgColor);

  // ── Stale-closure-safe session logger ─────────────────────────────────
  // Reassigned every render so it always closes over fresh state.
  const logSessionRef = useRef(null);
  logSessionRef.current = (endType) => {
    if (!sessionStart) return;
    addSession({
      start: sessionStart,
      end: Date.now(),
      duration: Math.round((Date.now() - sessionStart) / 1000),
      dayOfWeek: new Date(sessionStart).getDay(),
      category,
      endType,
    });
    setSessionStart(null);
  };

  // ── Persist minimal timer state ───────────────────────────────────────
  useEffect(() => {
    localStorage.setItem('timerState', JSON.stringify({ time, lastSetTime }));
  }, [time, lastSetTime]);

  // ── Page title ────────────────────────────────────────────────────────
  useEffect(() => {
    const m = Math.floor(time / 60);
    const s = (time % 60).toString().padStart(2, '0');
    document.title = `${m}:${s}`;
  }, [time]);

  // ── Body background ───────────────────────────────────────────────────
  useEffect(() => {
    document.body.style.background = bgColor;
    return () => { document.body.style.background = ''; };
  }, [bgColor]);

  // ── Focus effects ────────────────────────────────────────────────────
  useEffect(() => {
    if (editingTime && minutesRef.current) {
      minutesRef.current.focus();
      minutesRef.current.select();
    }
  }, [editingTime]);

  useEffect(() => {
    if (addingCategory && newCatRef.current) newCatRef.current.focus();
  }, [addingCategory]);

  // ── Unlock audio on first interaction ────────────────────────────────
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

  // ── Notification permission ───────────────────────────────────────────
  useEffect(() => {
    if (window.Notification?.permission === 'default') Notification.requestPermission();
  }, []);

  // ── Countdown ─────────────────────────────────────────────────────────
  useEffect(() => {
    if (!isRunning || !endTime) return;
    const id = setInterval(() => {
      const remaining = Math.max(0, Math.round((endTime - Date.now()) / 1000));
      setTime(remaining);
      if (remaining === 0) {
        clearInterval(id);
        playChime();
        if (window.Notification?.permission === 'granted' && document.visibilityState !== 'visible') {
          new Notification('Time is up!', { body: 'Your timer has finished.' });
        }
        logSessionRef.current('complete');
        setIsRunning(false);
        setEndTime(null);
        setTime(lastSetTime);
      }
    }, 200);
    return () => clearInterval(id);
  }, [isRunning, endTime, lastSetTime]);

  // ── Dismiss color picker on outside click ─────────────────────────────
  useEffect(() => {
    if (!colorPickerFor) return;
    const dismiss = (e) => {
      if (!e.target.closest('.color-popover') && !e.target.closest('.color-dot')) {
        setColorPickerFor(null);
      }
    };
    document.addEventListener('mousedown', dismiss);
    return () => document.removeEventListener('mousedown', dismiss);
  }, [colorPickerFor]);

  // ── Audio helpers ─────────────────────────────────────────────────────
  const playChime = () => {
    if (audioRef.current) {
      audioRef.current.currentTime = 0;
      audioRef.current.play().catch(playBeep);
    } else {
      playBeep();
    }
  };

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

  // ── Timer controls ─────────────────────────────────────────────────────
  const handleStart = () => {
    if (isRunning) {
      setIsRunning(false);
    } else {
      setEndTime(Date.now() + time * 1000);
      if (!sessionStart) setSessionStart(Date.now());
      setIsRunning(true);
    }
  };

  const handleReset = () => {
    logSessionRef.current('reset');
    setIsRunning(false);
    setEndTime(null);
    setTime(lastSetTime);
  };

  const handleTimeClick = () => {
    if (isRunning) return;
    setInputMins(Math.floor(time / 60));
    setInputSecs('00');
    setEditingTime(true);
  };

  const commitEdit = () => {
    const m = parseInt(inputMins, 10) || 0;
    const s = parseInt(inputSecs, 10) || 0;
    if (m > 0 || s > 0) {
      const t = m * 60 + s;
      setTime(t);
      setLastSetTime(t);
    }
    setEditingTime(false);
  };

  const handleEditKeyDown = (e) => {
    if (e.key === 'Enter') commitEdit();
    else if (e.key === 'Escape') setEditingTime(false);
  };

  // ── Category helpers ──────────────────────────────────────────────────
  const handleDeleteCategory = (name) => {
    setCategories(prev => prev.filter(c => c.name !== name));
    if (category === name) {
      setCategory(categories.find(c => c.name !== name)?.name ?? 'General');
    }
  };

  const handleSetColor = (name, color) => {
    setCategories(prev => prev.map(c => c.name === name ? { ...c, color } : c));
  };

  const handleAddCategory = () => {
    const name = newCatName.trim();
    if (name && !categories.some(c => c.name === name)) {
      setCategories(prev => [...prev, { name, color: newCatColor }]);
      setCategory(name);
    }
    setNewCatName('');
    setNewCatColor(PRESET_COLORS[0]);
    setAddingCategory(false);
  };

  // ── Theme helpers ─────────────────────────────────────────────────────
  const ghostStyle = { borderColor: fg, color: fg };
  const solidStyle = { background: fg, borderColor: fg, color: bgColor };

  const formatTime = () => {
    const m = Math.floor(time / 60);
    const s = (time % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  };

  return (
    <div className="timer-page" style={{ background: bgColor, color: fg }}>
      <audio ref={audioRef} src={chimeSound} preload="auto" />

      {/* Nav */}
      <div className="timer-nav">
        <Link to="/stats" className="nav-btn" style={ghostStyle}>
          Stats
        </Link>
      </div>

      {/* Timer */}
      <div className="timer-area">
        {editingTime ? (
          <div className="timer-input-row" style={{ color: fg }}>
            <input
              ref={minutesRef}
              className="timer-input"
              style={{ color: fg }}
              value={inputMins}
              onChange={e => setInputMins(e.target.value.replace(/\D/g, ''))}
              onBlur={commitEdit}
              onKeyDown={handleEditKeyDown}
              maxLength={3}
            />
            <span className="timer-colon">:</span>
            <input
              className="timer-input"
              style={{ color: fg }}
              value={String(inputSecs).padStart(2, '0')}
              onChange={e => {
                let v = e.target.value.replace(/\D/g, '');
                if (parseInt(v, 10) > 59) v = '59';
                setInputSecs(v.slice(0, 2));
              }}
              onBlur={commitEdit}
              onKeyDown={handleEditKeyDown}
              maxLength={2}
            />
          </div>
        ) : (
          <div
            className={`timer-time${isRunning ? ' locked' : ''}`}
            style={{ color: fg }}
            onClick={handleTimeClick}
            title={isRunning ? 'Pause to edit' : 'Click to set time'}
          >
            {formatTime()}
          </div>
        )}
      </div>

      {/* Controls */}
      <div className="timer-buttons">
        <button className="timer-btn" style={ghostStyle} onClick={handleStart}>
          {isRunning ? 'Pause' : 'Start'}
        </button>
        <button className="timer-btn" style={ghostStyle} onClick={handleReset}>
          Reset
        </button>
      </div>

      {/* Category bar */}
      <div className="category-bar">
        {categories.map(cat => {
          const isActive = cat.name === category;
          return (
            <div key={cat.name} className="category-pill-wrap">
              <button
                className="category-pill"
                style={isActive ? solidStyle : ghostStyle}
                onClick={() => setCategory(cat.name)}
              >
                <span
                  className="color-dot"
                  style={{ background: cat.color }}
                  onClick={e => {
                    e.stopPropagation();
                    setColorPickerFor(colorPickerFor === cat.name ? null : cat.name);
                  }}
                  title="Change color"
                />
                {cat.name}
              </button>

              {cat.name !== 'General' && (
                <button
                  className="pill-delete"
                  style={solidStyle}
                  onClick={() => handleDeleteCategory(cat.name)}
                  title={`Delete ${cat.name}`}
                >
                  ×
                </button>
              )}

              {colorPickerFor === cat.name && (
                <div className="color-popover">
                  <div className="color-swatches">
                    {PRESET_COLORS.map(color => (
                      <button
                        key={color}
                        className={`color-swatch${cat.color === color ? ' selected' : ''}`}
                        style={{ background: color }}
                        onClick={() => { handleSetColor(cat.name, color); setColorPickerFor(null); }}
                      />
                    ))}
                  </div>
                  <input
                    type="color"
                    value={cat.color}
                    onChange={e => handleSetColor(cat.name, e.target.value)}
                    style={{ width: '100%', height: 28, border: 'none', cursor: 'pointer', padding: 0, borderRadius: 4 }}
                  />
                </div>
              )}
            </div>
          );
        })}

        {addingCategory ? (
          <div className="add-category-form">
            <input
              ref={newCatRef}
              className="category-input"
              style={ghostStyle}
              value={newCatName}
              onChange={e => setNewCatName(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter') handleAddCategory();
                else if (e.key === 'Escape') { setAddingCategory(false); setNewCatName(''); }
              }}
              placeholder="Name"
              maxLength={20}
            />
            <div className="color-swatches" style={{ background: '#fff', padding: '6px 8px', borderRadius: 8, boxShadow: '0 2px 8px rgba(0,0,0,0.12)' }}>
              {PRESET_COLORS.map(color => (
                <button
                  key={color}
                  className={`color-swatch${newCatColor === color ? ' selected' : ''}`}
                  style={{ background: color }}
                  onClick={() => setNewCatColor(color)}
                />
              ))}
            </div>
            <button className="timer-btn" style={{ ...solidStyle, padding: '6px 16px', fontSize: '0.85rem' }} onClick={handleAddCategory}>Add</button>
            <button className="timer-btn" style={{ ...ghostStyle, padding: '6px 16px', fontSize: '0.85rem' }} onClick={() => { setAddingCategory(false); setNewCatName(''); }}>✕</button>
          </div>
        ) : (
          <button
            className="category-pill add-pill"
            style={ghostStyle}
            onClick={() => setAddingCategory(true)}
            title="Add category"
          >
            +
          </button>
        )}
      </div>
    </div>
  );
}

import { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useCategories, useSessions } from './AppContext';
import { getContrastColor } from './utils';

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function getContrastYIQ(hex) {
  hex = hex.replace('#', '');
  if (hex.length === 3) hex = hex.split('').map(c => c + c).join('');
  const r = parseInt(hex.slice(0, 2), 16);
  const g = parseInt(hex.slice(2, 4), 16);
  const b = parseInt(hex.slice(4, 6), 16);
  return ((r * 299 + g * 587 + b * 114) / 1000) >= 140 ? '#1a1a1a' : '#fff';
}

export default function StatsPage() {
  const { categories, getCategoryColor, activeCategory } = useCategories();
  const { sessions } = useSessions();

  const bgColor = getCategoryColor(activeCategory);
  const fg = getContrastColor(bgColor);
  const navStyle = { borderColor: fg, color: fg };

  // ── Current week sessions ─────────────────────────────────────────────
  const weekSessions = useMemo(() => {
    const now = new Date();
    const startOfWeek = new Date(now);
    startOfWeek.setHours(0, 0, 0, 0);
    startOfWeek.setDate(now.getDate() - now.getDay());
    const endOfWeek = new Date(startOfWeek);
    endOfWeek.setDate(startOfWeek.getDate() + 7);
    return sessions.filter(s => {
      const d = new Date(s.start);
      return d >= startOfWeek && d < endOfWeek;
    });
  }, [sessions]);

  // grid[dayIndex][categoryName] = total seconds
  const gridData = useMemo(() => {
    const grid = Array.from({ length: 7 }, () => ({}));
    weekSessions.forEach(s => {
      if (!s.category) return;
      const day = s.dayOfWeek;
      grid[day][s.category] = (grid[day][s.category] || 0) + s.duration;
    });
    return grid;
  }, [weekSessions]);

  const activeCatNames = useMemo(() => {
    const names = new Set();
    weekSessions.forEach(s => { if (s.category) names.add(s.category); });
    return [...names];
  }, [weekSessions]);

  const maxDaySeconds = useMemo(() => {
    return gridData.reduce((max, catMap) => {
      const total = Object.values(catMap).reduce((a, b) => a + b, 0);
      return Math.max(max, total);
    }, 0);
  }, [gridData]);

  const maxHours = Math.max(2, Math.ceil(maxDaySeconds / 3600));
  const hours = Array.from({ length: maxHours + 1 }, (_, i) => i);
  const Y_STEP = 60;
  const Y_BASE = 36;
  const svgHeight = Y_BASE + hours.length * Y_STEP + 32;

  // ── CSV export ────────────────────────────────────────────────────────
  const downloadCSV = () => {
    if (!sessions.length) return;
    const header = ['Start', 'End', 'Duration (s)', 'DayOfWeek', 'Category', 'EndType'];
    const rows = sessions.map(s => [
      new Date(s.start).toISOString(),
      new Date(s.end).toISOString(),
      s.duration,
      DAYS[s.dayOfWeek],
      s.category || '',
      s.endType || '',
    ]);
    const csv = [header, ...rows].map(r => r.map(x => `"${x}"`).join(',')).join('\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    const a = Object.assign(document.createElement('a'), { href: url, download: 'task-timer-sessions.csv' });
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { document.body.removeChild(a); URL.revokeObjectURL(url); }, 0);
  };

  // ── Weekly goals ──────────────────────────────────────────────────────
  const [goals, setGoals] = useState(() => {
    try { return JSON.parse(localStorage.getItem('weeklyGoals')) || []; }
    catch { return []; }
  });
  const [goalMode, setGoalMode] = useState('total');
  const [goalCategory, setGoalCategory] = useState('Any');
  const [goalValue, setGoalValue] = useState('');
  const [showGoalForm, setShowGoalForm] = useState(false);

  // Persist goals
  useEffect(() => {
    try { localStorage.setItem('weeklyGoals', JSON.stringify(goals)); } catch {}
  }, [goals]);

  const getGoalProgress = (goal) => {
    const sumDay = (catMap) =>
      goal.category === 'Any'
        ? Object.values(catMap).reduce((a, b) => a + b, 0)
        : (catMap[goal.category] || 0);

    if (goal.mode === 'total') {
      const total = gridData.reduce((acc, catMap) => acc + sumDay(catMap), 0);
      return { value: total / 3600, percent: Math.min(1, total / (goal.value * 3600)) };
    }
    const daysRange = goal.mode === 'monFri' ? [1, 2, 3, 4, 5] : [0, 1, 2, 3, 4, 5, 6];
    const met = daysRange.filter(i => sumDay(gridData[i] || {}) >= goal.value * 3600).length;
    return { value: met, percent: Math.min(1, met / daysRange.length) };
  };

  const handleAddGoal = (e) => {
    e.preventDefault();
    if (!goalValue) return;
    setGoals(prev => [...prev, { mode: goalMode, category: goalCategory, value: Number(goalValue) }]);
    setGoalValue('');
    setShowGoalForm(false);
  };

  const goalModeLabel = (mode) =>
    mode === 'total' ? 'total this week' : mode === 'perDay' ? 'every day' : 'Mon–Fri';

  return (
    <div className="stats-page" style={{ background: bgColor }}>
      {/* Nav */}
      <div className="stats-nav">
        <button className="nav-btn" style={navStyle} onClick={downloadCSV}>
          Download
        </button>
        <Link to="/" className="nav-btn" style={navStyle}>
          Timer
        </Link>
      </div>

      {/* Chart card */}
      <div className="stats-card">
        <h2>This Week</h2>

        {weekSessions.length === 0 ? (
          <p className="empty-chart">No sessions recorded this week. Start the timer to log time!</p>
        ) : (
          <>
            <svg
              viewBox={`0 0 700 ${svgHeight}`}
              style={{ width: '100%', height: 'auto', display: 'block' }}
            >
              {/* Horizontal grid + y-axis labels */}
              {hours.map((h, i) => {
                const y = Y_BASE + (hours.length - 1 - i) * Y_STEP;
                return (
                  <g key={h}>
                    <text x={30} y={y + 4} fontSize={13} fill="#aaa" textAnchor="end">{h}</text>
                    <line x1={40} x2={680} y1={y} y2={y} stroke="#f0f0f0" strokeWidth={1.5} />
                  </g>
                );
              })}

              {/* Vertical grid + day labels */}
              {DAYS.map((d, i) => {
                const x = 80 + i * 86;
                const isToday = i === new Date().getDay();
                return (
                  <g key={d}>
                    <line x1={x} x2={x} y1={Y_BASE} y2={Y_BASE + (hours.length - 1) * Y_STEP} stroke="#f0f0f0" strokeWidth={1} />
                    <text x={x} y={svgHeight - 6} fontSize={13} fill={isToday ? '#1976d2' : '#aaa'} textAnchor="middle" fontWeight={isToday ? '700' : '400'}>
                      {d}
                    </text>
                    {isToday && <circle cx={x} cy={svgHeight - 22} r={3} fill="#1976d2" />}
                  </g>
                );
              })}

              {/* Stacked bars */}
              {gridData.map((catMap, dayIdx) => {
                const x = 80 + dayIdx * 86;
                const totalSecs = Object.values(catMap).reduce((a, b) => a + b, 0);
                if (!totalSecs) return null;
                const sorted = Object.entries(catMap).sort((a, b) => b[1] - a[1]);
                let yAcc = Y_BASE + (hours.length - 1) * Y_STEP;
                return sorted.map(([cat, secs]) => {
                  const barH = Math.min((secs / 3600) * Y_STEP, (hours.length - 0.1) * Y_STEP);
                  yAcc -= barH;
                  const rect = (
                    <rect key={cat + dayIdx} x={x - 20} y={yAcc} width={40} height={barH} fill={getCategoryColor(cat)} rx={6} opacity={0.92}>
                      <title>{cat}: {(secs / 3600).toFixed(2)}h</title>
                    </rect>
                  );
                  return rect;
                });
              })}
            </svg>

            {activeCatNames.length > 0 && (
              <div className="chart-legend">
                {activeCatNames.map(name => (
                  <div key={name} className="legend-item">
                    <div className="legend-swatch" style={{ background: getCategoryColor(name) }} />
                    {name}
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>

      {/* Goals card */}
      <div className="stats-card">
        <h3>Weekly Goals</h3>

        {!showGoalForm ? (
          <button className="btn btn-primary" style={{ marginBottom: 16 }} onClick={() => setShowGoalForm(true)}>
            + Add Goal
          </button>
        ) : (
          <form className="goal-form" onSubmit={handleAddGoal}>
            <label>At least</label>
            <input
              type="number"
              min="0.5"
              step="0.5"
              value={goalValue}
              onChange={e => setGoalValue(e.target.value)}
              required
              placeholder="hrs"
            />
            <label>hours</label>
            <select value={goalMode} onChange={e => setGoalMode(e.target.value)}>
              <option value="total">total this week</option>
              <option value="perDay">every day</option>
              <option value="monFri">Mon–Fri</option>
            </select>
            <label>in</label>
            <select value={goalCategory} onChange={e => setGoalCategory(e.target.value)}>
              <option value="Any">All Categories</option>
              {categories.map(c => <option key={c.name} value={c.name}>{c.name}</option>)}
            </select>
            <button type="submit" className="btn btn-primary">Add</button>
            <button type="button" className="btn btn-ghost" onClick={() => { setShowGoalForm(false); setGoalValue(''); }}>
              Cancel
            </button>
          </form>
        )}

        <div className="goal-list">
          {goals.length === 0 && <p className="empty-state">No goals set for this week.</p>}
          {goals.map((goal, idx) => {
            const progress = getGoalProgress(goal);
            const catColor = goal.category !== 'Any' ? getCategoryColor(goal.category) : '#1976d2';
            const barColor = progress.percent >= 1 ? '#388e3c' : catColor;
            const daysTotal = goal.mode === 'monFri' ? 5 : 7;
            return (
              <div key={idx} className="goal-item">
                <button className="goal-remove" onClick={() => setGoals(prev => prev.filter((_, i) => i !== idx))} title="Remove">×</button>
                <div className="goal-label">
                  At least <strong>{goal.value}h</strong> {goalModeLabel(goal.mode)} in{' '}
                  {goal.category === 'Any' ? 'all categories' : (
                    <span
                      className="cat-pill-inline"
                      style={{ background: catColor, color: getContrastYIQ(catColor) }}
                    >
                      {goal.category}
                    </span>
                  )}
                  {goal.mode !== 'total' && ` — ${progress.value}/${daysTotal} days`}
                </div>
                <div className="goal-bar-track">
                  <div className="goal-bar-fill" style={{ width: `${progress.percent * 100}%`, background: barColor }} />
                </div>
                <div className="goal-sub">
                  {goal.mode === 'total'
                    ? `${progress.value.toFixed(1)}h / ${goal.value}h`
                    : `${progress.value} of ${daysTotal} days`}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

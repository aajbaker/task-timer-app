import { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useCategories, useSessions } from './AppContext';
import { getContrastColor } from './utils';

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const DAY_ABBR = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];
const ALL_DAYS = [0, 1, 2, 3, 4, 5, 6];

// Goals saved before day selection existed have no `days` (and may use 'monFri').
const goalDays = (goal) =>
  goal.days ?? (goal.mode === 'monFri' ? [1, 2, 3, 4, 5] : ALL_DAYS);

const daysLabel = (days) => {
  const key = days.join(',');
  if (key === '1,2,3,4,5') return 'Mon–Fri';
  if (key === '0,6') return 'weekends';
  return days.map(d => DAYS[d]).join(', ');
};

const goalModeLabel = (goal) => {
  const days = goalDays(goal);
  const all = days.length === 7;
  if (goal.mode === 'total') return all ? 'total this week' : `total on ${daysLabel(days)}`;
  return all ? 'every day' : `on ${daysLabel(days)}`;
};

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

  // Y axis tops out at 1h unless some day exceeds it. The plot never gets
  // shorter than MIN_PLOT_H; past 2h it grows by 60px per extra hour.
  const maxHours = Math.max(1, Math.ceil(maxDaySeconds / 3600));
  const MIN_PLOT_H = 120;
  const pxPerHour = Math.max(60, MIN_PLOT_H / maxHours);
  const plotH = maxHours * pxPerHour;
  const tickStep = maxHours === 1 ? 0.5 : 1;
  const ticks = Array.from({ length: maxHours / tickStep + 1 }, (_, i) => i * tickStep);
  const Y_BASE = 36;
  const yBottom = Y_BASE + plotH;
  const svgHeight = yBottom + 92;

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
  const [goalDaysSel, setGoalDaysSel] = useState(ALL_DAYS);
  const [showGoalForm, setShowGoalForm] = useState(false);

  const toggleGoalDay = (d) =>
    setGoalDaysSel(prev =>
      prev.includes(d) ? prev.filter(x => x !== d) : [...prev, d].sort((a, b) => a - b)
    );

  const closeGoalForm = () => {
    setShowGoalForm(false);
    setGoalValue('');
    setGoalDaysSel(ALL_DAYS);
  };

  // Persist goals
  useEffect(() => {
    try { localStorage.setItem('weeklyGoals', JSON.stringify(goals)); } catch {}
  }, [goals]);

  const getGoalProgress = (goal) => {
    const sumDay = (catMap) =>
      goal.category === 'Any'
        ? Object.values(catMap).reduce((a, b) => a + b, 0)
        : (catMap[goal.category] || 0);

    const days = goalDays(goal);
    if (goal.mode === 'total') {
      const total = days.reduce((acc, i) => acc + sumDay(gridData[i] || {}), 0);
      return { value: total / 3600, percent: Math.min(1, total / (goal.value * 3600)) };
    }
    const met = days.filter(i => sumDay(gridData[i] || {}) >= goal.value * 3600).length;
    return { value: met, percent: Math.min(1, met / days.length) };
  };

  const handleAddGoal = (e) => {
    e.preventDefault();
    if (!goalValue || goalDaysSel.length === 0) return;
    setGoals(prev => [
      ...prev,
      { mode: goalMode, category: goalCategory, value: Number(goalValue), days: goalDaysSel },
    ]);
    closeGoalForm();
  };

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
              {ticks.map(h => {
                const y = yBottom - h * pxPerHour;
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
                    <line x1={x} x2={x} y1={Y_BASE} y2={yBottom} stroke="#f0f0f0" strokeWidth={1} />
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
                let yAcc = yBottom;
                return sorted.map(([cat, secs]) => {
                  const barH = (secs / 3600) * pxPerHour;
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
              <option value="total">total</option>
              <option value="perDay">each day</option>
            </select>
            <label>in</label>
            <select value={goalCategory} onChange={e => setGoalCategory(e.target.value)}>
              <option value="Any">All Categories</option>
              {categories.map(c => <option key={c.name} value={c.name}>{c.name}</option>)}
            </select>
            <div className="day-picker" role="group" aria-label="Days">
              <label>on</label>
              {DAY_ABBR.map((abbr, d) => {
                const on = goalDaysSel.includes(d);
                return (
                  <button
                    key={abbr}
                    type="button"
                    className={`day-toggle${on ? ' on' : ''}`}
                    aria-pressed={on}
                    title={DAYS[d]}
                    onClick={() => toggleGoalDay(d)}
                  >
                    {abbr}
                  </button>
                );
              })}
            </div>
            <div className="goal-form-actions">
              <button type="submit" className="btn btn-primary" disabled={goalDaysSel.length === 0}>Add</button>
              <button type="button" className="btn btn-ghost" onClick={closeGoalForm}>
                Cancel
              </button>
            </div>
          </form>
        )}

        <div className="goal-list">
          {goals.length === 0 && <p className="empty-state">No goals set for this week.</p>}
          {goals.map((goal, idx) => {
            const progress = getGoalProgress(goal);
            const catColor = goal.category !== 'Any' ? getCategoryColor(goal.category) : '#1976d2';
            const barColor = progress.percent >= 1 ? '#388e3c' : catColor;
            const daysTotal = goalDays(goal).length;
            return (
              <div key={idx} className="goal-item">
                <button className="goal-remove" onClick={() => setGoals(prev => prev.filter((_, i) => i !== idx))} title="Remove">×</button>
                <div className="goal-label">
                  At least <strong>{goal.value}h</strong> {goalModeLabel(goal)} in{' '}
                  {goal.category === 'Any' ? 'all categories' : (
                    <span
                      className="cat-pill-inline"
                      style={{ background: catColor, color: getContrastColor(catColor) }}
                    >
                      {goal.category}
                    </span>
                  )}
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

import React, { useMemo } from 'react';
import { Link, useLocation } from 'react-router-dom';

const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const getCategoryColor = () => {
  const storedCategories = localStorage.getItem('categories');
  const storedCategory = localStorage.getItem('category');
  let categories = [{ name: 'General', color: '#1976d2' }];
  let category = 'General';
  if (storedCategories) {
    const parsed = JSON.parse(storedCategories);
    if (Array.isArray(parsed) && typeof parsed[0] === 'string') {
      categories = parsed.map(name => ({ name, color: '#1976d2' }));
    } else {
      categories = parsed;
    }
  }
  if (storedCategory) category = storedCategory;
  const cat = categories.find(c => c.name === category);
  return cat ? cat.color : '#1976d2';
};

const StatsPage = () => {
  const location = useLocation();
  const isStats = location.pathname === '/stats';
  const bgColor = getCategoryColor();

  // Get categories for color lookup
  const categories = useMemo(() => {
    try {
      return JSON.parse(localStorage.getItem('categories')) || [{ name: 'General', color: '#1976d2' }];
    } catch {
      return [{ name: 'General', color: '#1976d2' }];
    }
  }, []);

  // Get sessions for current week
  const weekSessions = useMemo(() => {
    let sessions = [];
    try {
      sessions = JSON.parse(localStorage.getItem('sessions')) || [];
    } catch {}
    if (!sessions.length) return [];
    // Get start of current week (Sunday)
    const now = new Date();
    const startOfWeek = new Date(now);
    startOfWeek.setHours(0,0,0,0);
    startOfWeek.setDate(now.getDate() - now.getDay());
    const endOfWeek = new Date(startOfWeek);
    endOfWeek.setDate(startOfWeek.getDate() + 7);
    // Filter sessions in this week
    return sessions.filter(s => {
      const d = new Date(s.start);
      return d >= startOfWeek && d < endOfWeek;
    });
  }, []);

  // Aggregate time (in hours) per day/category
  const gridData = useMemo(() => {
    // grid[day][category] = total seconds
    const grid = Array(7).fill(0).map(() => ({}));
    weekSessions.forEach(s => {
      if (!s.category) return;
      const day = s.dayOfWeek;
      if (!grid[day][s.category]) grid[day][s.category] = 0;
      grid[day][s.category] += s.duration;
    });
    return grid;
  }, [weekSessions]);
  // Dynamically compute y-axis based on max hours in week
  const maxDaySeconds = useMemo(() => {
    let max = 0;
    gridData.forEach(catMap => {
      const total = Object.values(catMap).reduce((a, b) => a + b, 0);
      if (total > max) max = total;
    });
    return max;
  }, [gridData]);
  const maxHours = Math.max(2, Math.ceil(maxDaySeconds / 3600));
  const hours = Array.from({ length: maxHours + 1 }, (_, i) => i);
  const yStep = 60;
  const yBase = 40;
  const svgHeight = yBase + (hours.length - 1) * yStep + 40; // extra 40 for bottom labels

  // Helper to get color for a category
  const getCatColor = catName => {
    const cat = categories.find(c => c.name === catName);
    return cat ? cat.color : '#1976d2';
  };

  // Helper to download sessions as CSV
  const downloadCSV = () => {
    let sessions = [];
    try {
      sessions = JSON.parse(localStorage.getItem('sessions')) || [];
    } catch {}
    if (!sessions.length) return;
    const header = ['Start', 'End', 'Duration (s)', 'DayOfWeek', 'Category', 'EndType'];
    const rows = sessions.map(s => [
      new Date(s.start).toISOString(),
      new Date(s.end).toISOString(),
      s.duration,
      days[s.dayOfWeek],
      s.category,
      s.endType || ''
    ]);
    const csv = [header, ...rows].map(r => r.map(x => `"${x}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'task-timer-sessions.csv';
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }, 0);
  };

  // --- Weekly Goals State ---
  const [goals, setGoals] = React.useState(() => {
    try {
      return JSON.parse(localStorage.getItem('weeklyGoals')) || [];
    } catch {
      return [];
    }
  });
  const [goalMode, setGoalMode] = React.useState('total'); // 'total' or 'perDay'
  const [goalCategory, setGoalCategory] = React.useState('Any');
  const [goalValue, setGoalValue] = React.useState('');
  const [showGoalForm, setShowGoalForm] = React.useState(false);

  React.useEffect(() => {
    localStorage.setItem('weeklyGoals', JSON.stringify(goals));
  }, [goals]);

  // --- Goal Progress Calculation ---
  const getGoalProgress = (goal) => {
    if (goal.mode === 'total') {
      // Sum all time for category (or all)
      let total = 0;
      gridData.forEach(catMap => {
        if (goal.category === 'Any') {
          total += Object.values(catMap).reduce((a, b) => a + b, 0);
        } else {
          total += catMap[goal.category] || 0;
        }
      });
      return { value: total / 3600, percent: Math.min(1, total / (goal.value * 3600)) };
    } else if (goal.mode === 'perDay') {
      // Count days with at least goal.value hours in category (or all)
      let count = 0;
      gridData.forEach(catMap => {
        const t = goal.category === 'Any' ? Object.values(catMap).reduce((a, b) => a + b, 0) : (catMap[goal.category] || 0);
        if (t >= goal.value * 3600) count++;
      });
      return { value: count, percent: Math.min(1, count / 7) };
    } else if (goal.mode === 'monFri') {
      // Only count Mon-Fri (days 1-5)
      let count = 0;
      for (let i = 1; i <= 5; i++) {
        const catMap = gridData[i] || {};
        const t = goal.category === 'Any' ? Object.values(catMap).reduce((a, b) => a + b, 0) : (catMap[goal.category] || 0);
        if (t >= goal.value * 3600) count++;
      }
      return { value: count, percent: Math.min(1, count / 5) };
    }
    return { value: 0, percent: 0 };
  };

  // --- Add Goal Handler ---
  const handleAddGoal = (e) => {
    e.preventDefault();
    if (goalValue) {
      setGoals([...goals, { mode: goalMode, category: goalCategory, value: Number(goalValue) }]);
      setGoalValue('');
    }
  };

  // --- Remove Goal ---
  const handleRemoveGoal = idx => {
    setGoals(goals.filter((_, i) => i !== idx));
  };

  return (
    <div
      style={{
        minHeight: '100vh',
        width: '100vw',
        background: bgColor,
        position: 'relative',
      }}
    >
      <div style={{ position: 'fixed', top: 24, right: 32, zIndex: 10, display: 'flex', flexDirection: 'row', gap: 8 }}>
        <button onClick={downloadCSV} style={{
          display: 'inline-block',
          padding: '8px 22px',
          borderRadius: 20,
          background: '#fff',
          color: '#1976d2',
          fontWeight: 'bold',
          fontSize: 17,
          border: '2px solid #1976d2',
          boxShadow: '0 2px 8px rgba(25,118,210,0.08)',
          cursor: 'pointer',
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
        >Download Data</button>
        <Link to="/" style={{
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
          Go to Timer
        </Link>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '100vh' }}>
        <div style={{ maxWidth: 900, width: '100%', padding: 24, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
          <h2 style={{ textAlign: 'center', marginBottom: 32 }}>Weekly Activity</h2>
          <div style={{ background: '#fff', borderRadius: 16, boxShadow: '0 2px 12px rgba(0,0,0,0.07)', padding: 24, display: 'flex', justifyContent: 'center', width: 700 }}>
            <svg width={700} height={svgHeight} style={{ display: 'block' }}>
              {/* Y axis labels (hours, flipped) */}
              {hours.map((h, i) => {
                const y = yBase + (hours.length - 1 - i) * yStep;
                return (
                  <text
                    key={h}
                    x={32}
                    y={y}
                    fontSize={15}
                    fill={h === 0 ? '#444' : '#888'}
                    textAnchor="end"
                    alignmentBaseline="middle"
                  >
                    {h}
                  </text>
                );
              })}
              {/* X axis labels (days) */}
              {days.map((d, i) => {
                const isToday = i === new Date().getDay();
                return (
                  <g key={d}>
                    <text
                      x={80 + i * 80}
                      y={svgHeight - 10}
                      fontSize={15}
                      fill="#1976d2"
                      textAnchor="middle"
                      fontWeight="bold"
                    >
                      {d}
                    </text>
                    {isToday && (
                      <circle
                        cx={80 + i * 80}
                        cy={svgHeight - 28}
                        r={7}
                        fill="#1976d2"
                        stroke="#fff"
                        strokeWidth={2}
                      />
                    )}
                  </g>
                );
              })}
              {/* Grid lines (horizontal) */}
              {hours.map((_, i) => {
                const y = yBase + (hours.length - 1 - i) * yStep;
                return (
                  <line
                    key={i}
                    x1={60}
                    x2={700 - 20}
                    y1={y}
                    y2={y}
                    stroke="#eee"
                    strokeWidth={1.5}
                  />
                );
              })}
              {/* Grid lines (vertical) */}
              {days.map((_, i) => (
                <line
                  key={i}
                  y1={yBase}
                  y2={yBase + (hours.length - 1) * yStep}
                  x1={80 + i * 80}
                  x2={80 + i * 80}
                  stroke="#eee"
                  strokeWidth={1.5}
                />
              ))}
              {/* Data bars: stacked by category */}
              {gridData.map((catMap, dayIdx) => {
                let yAcc = yBase + (hours.length - 1) * yStep;
                const totalSeconds = Object.values(catMap).reduce((a, b) => a + b, 0);
                if (!totalSeconds) return null;
                // Sort categories for stacking (by total time, descending)
                const sortedCats = Object.entries(catMap).sort((a, b) => b[1] - a[1]);
                return sortedCats.map(([cat, secs], i) => {
                  const barHeight = Math.min((secs / 3600) * yStep, (hours.length - 0.1) * yStep);
                  yAcc -= barHeight;
                  return (
                    <rect
                      key={cat + dayIdx}
                      x={80 + dayIdx * 80 - 18}
                      y={yAcc}
                      width={36}
                      height={barHeight}
                      fill={getCatColor(cat)}
                      opacity={0.92}
                      rx={7}
                    >
                      <title>{cat}: {(secs / 3600).toFixed(2)}h</title>
                    </rect>
                  );
                });
              })}
            </svg>
          </div>
        </div>
        {/* Weekly Goals Section */}
        <div style={{ maxWidth: 700, width: '100%', margin: '32px auto 0', background: '#fff', borderRadius: 16, boxShadow: '0 2px 12px rgba(0,0,0,0.07)', padding: 24, color: '#222' }}>
          <h3 style={{ marginTop: 0, marginBottom: 16, color: '#1976d2' }}>Weekly Goals</h3>
          {!showGoalForm && (
            <button onClick={() => setShowGoalForm(true)} style={{ fontSize: 16, padding: '6px 20px', borderRadius: 8, background: '#1976d2', color: '#fff', border: 'none', fontWeight: 'bold', cursor: 'pointer', marginBottom: 18 }}>Add Goal</button>
          )}
          {showGoalForm && (
            <form onSubmit={e => { handleAddGoal(e); setShowGoalForm(false); }} style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center', marginBottom: 18, color: '#222' }}>
              <span style={{ color: '#222' }}>Amount of time</span>
              <input type="number" min="0.5" step="0.5" value={goalValue} onChange={e => setGoalValue(e.target.value)} style={{ width: 60, fontSize: 16, padding: 4, color: '#222', background: '#fff', border: '1px solid #bbb' }} required />
              <span style={{ color: '#222' }}>hours</span>
              <select value={goalMode} onChange={e => setGoalMode(e.target.value)} style={{ fontSize: 16, padding: 4, color: '#222', background: '#fff', border: '1px solid #bbb' }}>
                <option value="total">Total (this week)</option>
                <option value="perDay">Every day</option>
                <option value="monFri">Mon-Fri</option>
              </select>
              <span style={{ color: '#222' }}>in</span>
              <select value={goalCategory} onChange={e => setGoalCategory(e.target.value)} style={{ fontSize: 16, padding: 4, color: '#222', background: '#fff', border: '1px solid #bbb' }}>
                <option value="Any">All Categories</option>
                {categories.map(c => <option key={c.name} value={c.name}>{c.name}</option>)}
              </select>
              <button type="submit" style={{ fontSize: 16, padding: '4px 16px', borderRadius: 8, background: '#1976d2', color: '#fff', border: 'none', fontWeight: 'bold', cursor: 'pointer' }}>Add</button>
              <button type="button" onClick={() => { setShowGoalForm(false); setGoalValue(''); }} style={{ fontSize: 16, padding: '4px 16px', borderRadius: 8, background: '#eee', color: '#1976d2', border: 'none', fontWeight: 'bold', cursor: 'pointer' }}>Cancel</button>
            </form>
          )}
          <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
            {goals.length === 0 && <li style={{ color: '#888', fontStyle: 'italic' }}>No goals set for this week.</li>}
            {goals.map((goal, idx) => {
              const progress = getGoalProgress(goal);
              // Get category color for pill
              const catColor = goal.category !== 'Any' ? getCatColor(goal.category) : '#1976d2';
              // Helper to determine text color based on background
              function getContrastYIQ(hexcolor) {
                hexcolor = hexcolor.replace('#', '');
                if (hexcolor.length === 3) hexcolor = hexcolor.split('').map(x => x + x).join('');
                const r = parseInt(hexcolor.substr(0,2),16);
                const g = parseInt(hexcolor.substr(2,2),16);
                const b = parseInt(hexcolor.substr(4,2),16);
                const yiq = ((r*299)+(g*587)+(b*114))/1000;
                return yiq >= 180 ? '#222' : '#fff';
              }
              const pillTextColor = getContrastYIQ(catColor);
              return (
                <li key={idx} style={{ marginBottom: 18, background: '#f5f5f5', borderRadius: 8, padding: 12, position: 'relative', color: '#222' }}>
                  <button onClick={() => handleRemoveGoal(idx)} style={{ position: 'absolute', right: 10, top: 10, background: 'none', border: 'none', color: '#888', fontSize: 18, cursor: 'pointer' }} title="Remove goal">×</button>
                  <div style={{ marginBottom: 6, color: '#222' }}>
                    {goal.mode === 'total' ? (
                      <span>At least <b>{goal.value}h</b> total in {goal.category === 'Any' ? 'all categories' : (
                        <span style={{
                          display: 'inline-block',
                          background: catColor,
                          color: pillTextColor,
                          borderRadius: 8,
                          padding: '2px 10px',
                          fontWeight: 600,
                          fontSize: 15,
                          marginLeft: 2
                        }}>{goal.category}</span>
                      )}</span>
                    ) : goal.mode === 'perDay' ? (
                      <span>At least <b>{goal.value}h</b> every day in {goal.category === 'Any' ? 'all categories' : (
                        <span style={{
                          display: 'inline-block',
                          background: catColor,
                          color: pillTextColor,
                          borderRadius: 8,
                          padding: '2px 10px',
                          fontWeight: 600,
                          fontSize: 15,
                          marginLeft: 2
                        }}>{goal.category}</span>
                      )} ({progress.value} days met)</span>
                    ) : (
                      <span>At least <b>{goal.value}h</b> Mon-Fri in {goal.category === 'Any' ? 'all categories' : (
                        <span style={{
                          display: 'inline-block',
                          background: catColor,
                          color: pillTextColor,
                          borderRadius: 8,
                          padding: '2px 10px',
                          fontWeight: 600,
                          fontSize: 15,
                          marginLeft: 2
                        }}>{goal.category}</span>
                      )} ({progress.value} days met)</span>
                    )}
                  </div>
                  <div style={{ height: 16, background: '#e3eafc', borderRadius: 8, overflow: 'hidden', marginBottom: 2 }}>
                    <div style={{ width: `${progress.percent * 100}%`, height: '100%', background: progress.percent >= 1 ? '#388e3c' : '#1976d2', transition: 'width 0.3s' }} />
                  </div>
                  <div style={{ fontSize: 14, color: '#555' }}>
                    {goal.mode === 'total'
                      ? `${progress.value.toFixed(2)}h / ${goal.value}h`
                      : goal.mode === 'perDay'
                        ? `${progress.value} days / 7 days`
                        : `${progress.value} days / 5 days`}
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      </div>
    </div>
  );
};

export default StatsPage;
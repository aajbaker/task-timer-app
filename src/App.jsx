import { Routes, Route } from 'react-router-dom';
import { AppProvider } from './AppContext';
import HomePage from './HomePage';
import StatsPage from './StatsPage';

export default function App() {
  return (
    <AppProvider>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/stats" element={<StatsPage />} />
      </Routes>
    </AppProvider>
  );
}

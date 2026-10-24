import { BrowserRouter, Routes, Route, Link, useLocation } from 'react-router-dom';
import { AnimatePresence } from 'framer-motion';
import { ArrowLeft, Bell, CircleUser } from 'lucide-react';
import LandingPage from './pages/LandingPage';
import ClientCabinet from './pages/ClientCabinet';
import EmployeeDashboard from './pages/EmployeeDashboard';
import { useApp } from './context/AppContext';
import { Logo } from './components/ui/Logo';

function Navigation() {
  const location = useLocation();
  const { role, clientName, employeeName } = useApp();

  if (location.pathname === '/') return null;

  const isClient = location.pathname === '/client';
  const displayName = isClient ? clientName : employeeName;
  const displayRole = isClient ? 'Клиент' : 'Кредитный специалист';

  return (
    <nav className="bg-white border-b sticky top-0 z-50 h-16">
      <div className="max-w-[1600px] mx-auto px-6 h-full flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link to="/" className="text-slate-400 hover:text-alfa transition flex items-center gap-2 font-medium">
            <ArrowLeft className="w-4 h-4" /> На главную
          </Link>
          <div className="h-6 w-px bg-slate-200" />
          <Link to="/" className="flex items-center gap-2">
            <Logo className="w-6 h-6" />
            <span className="text-xl font-extrabold text-slate-900 tracking-tight">Альфа Бизнес</span>
          </Link>
        </div>
        <div className="flex items-center gap-6">
          <button className="text-slate-400 hover:text-slate-600 relative">
            <Bell className="w-5 h-5" />
            <span className="absolute -top-1 -right-1 w-2 h-2 bg-alfa rounded-full border border-white"></span>
          </button>
          <div className="flex items-center gap-3 pl-6 border-l border-slate-200">
            <div className="text-right hidden sm:block">
              <p className="text-sm font-bold leading-tight">{displayName}</p>
              <p className="text-[10px] text-slate-500">{displayRole}</p>
            </div>
            <CircleUser className="w-8 h-8 text-slate-300" />
          </div>
        </div>
      </div>
    </nav>
  );
}

function App() {
  return (
    <BrowserRouter>
      <div className="min-h-screen bg-slate-50">
        <Navigation />
        <AnimatePresence mode="wait">
          <Routes>
            <Route path="/" element={<LandingPage />} />
            <Route path="/client" element={<ClientCabinet />} />
            <Route path="/employee" element={<EmployeeDashboard />} />
          </Routes>
        </AnimatePresence>
      </div>
    </BrowserRouter>
  );
}

export default App;
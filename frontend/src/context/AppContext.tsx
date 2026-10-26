import { createContext, useContext, useState, useEffect, type ReactNode, type Dispatch, type SetStateAction } from 'react';
import { initialApplications } from '../mocks/mockData';

interface AppContextType {
  role: 'client' | 'employee' | null;
  setRole: (role: 'client' | 'employee' | null) => void;
  clientName: string;
  employeeName: string;
  apps: any[];
  // ИСПРАВЛЕНИЕ: Добавляем Dispatch, чтобы React понимал setApps(prev => ...)
  setApps: Dispatch<SetStateAction<any[]>>;
  docs: Record<string, any>;
  // ИСПРАВЛЕНИЕ: То же самое для документов
  setDocs: Dispatch<SetStateAction<Record<string, any>>>;
  resetData: () => void;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

export function AppProvider({ children }: { children: ReactNode }) {
  const [role, setRole] = useState<'client' | 'employee' | null>(null);
  const [apps, setApps] = useState<any[]>([]);
  const [docs, setDocs] = useState<Record<string, any>>({});

  useEffect(() => {
    // Твоя логика: если в LocalStorage пусто, грузим стартовые заявки
    const savedApps = localStorage.getItem('mock_apps');
    if (!savedApps) {
      localStorage.setItem('mock_apps', JSON.stringify(initialApplications));
      setApps(initialApplications);
    } else {
      setApps(JSON.parse(savedApps));
    }

    const savedDocs = localStorage.getItem('mock_docs');
    if (savedDocs) setDocs(JSON.parse(savedDocs));
  }, []);

  const resetData = () => {
    localStorage.removeItem('mock_apps');
    localStorage.removeItem('mock_docs');
    // При сбросе возвращаем стартовые заявки, чтобы демо не было пустым
    setApps(initialApplications);
    setDocs({});
    window.location.reload();
  };

  return (
    <AppContext.Provider value={{
      role, setRole,
      clientName: 'Иван Иванов',
      employeeName: 'Алексей Смирнов',
      apps, setApps, docs, setDocs, resetData
    }}>
      {children}
    </AppContext.Provider>
  );
}

export function useApp() {
  const context = useContext(AppContext);
  if (!context) throw new Error('useApp must be used within AppProvider');
  return context;
}
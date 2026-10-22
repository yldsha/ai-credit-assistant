import { useNavigate } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import { motion } from 'framer-motion';
import { ShieldCheck, User, ArrowRight, CheckCircle2 } from 'lucide-react';
import { Logo } from '../components/ui/Logo';
import { Button, Card } from '../components/ui';

export default function LandingPage() {
  const navigate = useNavigate();
  const { setRole } = useApp();

  const handleLogin = (r: 'client' | 'employee') => {
    setRole(r);
    navigate(r === 'client' ? '/client' : '/employee');
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col">
      <header className="px-6 py-4 bg-white border-b border-slate-200">
        <div className="max-w-7xl mx-auto flex justify-between items-center">
          <div className="flex items-center gap-3">
            <Logo className="w-8 h-8" />
            <span className="text-xl font-extrabold text-slate-900 tracking-tight">Альфа Бизнес</span>
          </div>
          <nav className="hidden md:flex gap-8 text-sm font-medium text-slate-500">
            <span className="text-alfa cursor-pointer">Малому бизнесу и ИП</span>
            <span className="hover:text-slate-900 cursor-pointer transition">Среднему бизнесу</span>
            <span className="hover:text-slate-900 cursor-pointer transition">Крупному бизнесу</span>
          </nav>
          <Button onClick={() => handleLogin('client')} variant="secondary" className="hidden sm:block bg-slate-100 hover:bg-slate-200 text-slate-800">Онлайн-заявки</Button>
        </div>
      </header>

      <main className="flex-1 flex items-center">
        <div className="max-w-7xl mx-auto px-6 py-16 grid md:grid-cols-2 gap-16 items-center w-full">
          <motion.div initial={{ opacity: 0, x: -30 }} animate={{ opacity: 1, x: 0 }}>
            <div className="inline-flex items-center gap-2 px-3 py-1 bg-red-50 text-alfa rounded-full text-sm font-bold mb-6">
              <span className="w-2 h-2 bg-alfa rounded-full animate-pulse" /> Умный кредитный кабинет
            </div>
            <h1 className="text-5xl md:text-6xl font-extrabold leading-[1.1] mb-6 text-slate-900">
              Кредиты для бизнеса <br/><span className="text-alfa">от 13%</span>
            </h1>
            <p className="text-lg text-slate-600 mb-10 max-w-lg leading-relaxed">
              Быстрое решение. Индивидуальные условия. Поддержка на каждом этапе. Наш цифровой конвейер подберет лучшие условия для вашего дела.
            </p>

            <div className="flex flex-col sm:flex-row gap-4 max-w-lg">
              <Card className="flex-1 p-6 flex flex-col items-center text-center cursor-pointer hover:border-alfa hover:shadow-lg transition-all border-2 border-transparent" onClick={() => handleLogin('client')}>
                <div className="w-14 h-14 bg-red-50 rounded-full flex items-center justify-center mb-4">
                  <User className="w-7 h-7 text-alfa" />
                </div>
                <h3 className="font-bold text-lg mb-1">Войти как клиент</h3>
                <p className="text-xs text-slate-500 mb-4">Подать заявку и получить финансирование</p>
                <Button className="w-full mt-auto">Войти <ArrowRight className="w-4 h-4 ml-2"/></Button>
              </Card>

              <Card className="flex-1 p-6 flex flex-col items-center text-center cursor-pointer hover:border-slate-800 hover:shadow-lg transition-all border-2 border-transparent" onClick={() => handleLogin('employee')}>
                <div className="w-14 h-14 bg-slate-100 rounded-full flex items-center justify-center mb-4">
                  <ShieldCheck className="w-7 h-7 text-slate-700" />
                </div>
                <h3 className="font-bold text-lg mb-1">Войти как сотрудник</h3>
                <p className="text-xs text-slate-500 mb-4">Оценка рисков и принятие решений</p>
                <Button variant="secondary" className="w-full mt-auto bg-slate-900 text-white hover:bg-slate-800">Войти <ArrowRight className="w-4 h-4 ml-2"/></Button>
              </Card>
            </div>
          </motion.div>

          <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} className="relative hidden md:flex justify-center items-center">
            <div className="absolute inset-0 bg-gradient-to-tr from-alfa/10 to-blue-500/10 rounded-full blur-3xl" />
            <div className="relative z-10 w-full max-w-md bg-white rounded-[32px] shadow-2xl border border-slate-100 p-8 transform rotate-2 hover:rotate-0 transition-transform duration-500">
              <div className="flex justify-between items-center mb-8">
                <div>
                  <p className="text-sm text-slate-500">Одобрено</p>
                  <p className="text-3xl font-extrabold text-slate-900 mt-1">3 000 000 ₽</p>
                </div>
                <div className="w-12 h-12 bg-green-50 rounded-full flex items-center justify-center">
                  <CheckCircle2 className="w-6 h-6 text-green-500" />
                </div>
              </div>

              <div className="space-y-4 mb-8">
                <div className="flex justify-between text-sm"><span className="text-slate-500">Ставка</span><span className="font-bold">19%</span></div>
                <div className="flex justify-between text-sm"><span className="text-slate-500">Срок</span><span className="font-bold">6 месяцев</span></div>
                <div className="flex justify-between text-sm"><span className="text-slate-500">Платеж</span><span className="font-bold">50 410 ₽/мес</span></div>
              </div>

              <Button className="w-full">Подписать договор</Button>
            </div>
          </motion.div>
        </div>
      </main>
    </div>
  );
}
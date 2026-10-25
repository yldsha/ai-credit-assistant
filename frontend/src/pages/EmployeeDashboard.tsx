import { useState, useEffect } from 'react';
import { useApp } from '../context/AppContext';
import { getEmployeeApplications, makeEmployeeDecision } from '../services/api';
import { products } from '../mocks/mockData'; // Используем для выпадающего списка альтернатив
import {
  Search, Briefcase, PieChart, CheckCircle2, XCircle,
  ShieldAlert, ArrowLeft, RefreshCw, FileText, Check, AlertTriangle,
  BrainCircuit, Target, TrendingUp, Building2, X, ChevronDown, RotateCcw,
  Sparkles, CreditCard, Zap, Clock, AlertOctagon
} from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import toast from 'react-hot-toast';
import { Button, Card, Badge } from '../components/ui';
import { motion, AnimatePresence } from 'framer-motion';

export default function EmployeeDashboard() {
  const { apps, setApps, employeeName } = useApp();
  const [selectedApp, setSelectedApp] = useState<any>(null);
  const [activeMenu, setActiveMenu] = useState<'applications' | 'statistics'>('applications');
  const [filter, setFilter] = useState('Все');
  const [searchQuery, setSearchQuery] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  // Стейты для панели решения
  const [comment, setComment] = useState('');
  const [altProductId, setAltProductId] = useState('');
  const [altAmount, setAltAmount] = useState('');
  const [altTerm, setAltTerm] = useState('');
  const [needInfoText, setNeedInfoText] = useState('');
  const [isNeedInfoOpen, setIsNeedInfoOpen] = useState(false);

  // Загрузка заявок с бэкенда
  const loadApplications = async () => {
    setIsLoading(true);
    try {
      const data = await getEmployeeApplications();
      setApps(data);
    } catch (error) {
      toast.error('Ошибка загрузки заявок с сервера');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadApplications();
  }, []);

  useEffect(() => {
    if (activeMenu === 'applications') setSelectedApp(null);
  }, [activeMenu]);

  const handleTakeToWork = () => {
    if (!selectedApp) return;
    // На бэкенде Кости нет отдельного эндпоинта "взять в работу",
    // поэтому мы просто меняем стейт локально для удобства UI.
    const updated = apps.map(a => a.id === selectedApp.id ? { ...a, status: 'В работе' } : a);
    setApps(updated);
    setSelectedApp({ ...selectedApp, status: 'В работе' });
    toast.success('Заявка взята в работу');
  };

  // Отправка решения на бэкенд
  const submitDecision = async (outcomeEng: string, outcomeRus: string, extraData?: any) => {
    if (!selectedApp) return;

    // Проверка на обязательный комментарий (кроме запроса инфо)
    if (!comment.trim() && outcomeEng !== 'need_info') {
      toast.error('Пожалуйста, оставьте комментарий для клиента (обязательно при любом решении)');
      return;
    }

    if (outcomeEng === 'counter_offer' && !altProductId) {
      toast.error('Выберите продукт для альтернативы');
      return;
    }

    try {
      await makeEmployeeDecision(selectedApp.id, outcomeEng, comment || needInfoText, extraData);
      toast.success(`Статус обновлен: ${outcomeRus}`);

      // Обновляем данные с сервера, чтобы увидеть реальный статус
      await loadApplications();

      // Обновляем выбранную заявку
      const updatedApp = {
        ...selectedApp,
        status: outcomeRus,
        employeeComment: comment || needInfoText,
        alternativeProduct: extraData ? { ...extraData, name: products.find(p => p.id === extraData.productId)?.name } : selectedApp.alternativeProduct
      };
      setSelectedApp(updatedApp);

      // Очищаем форму
      setComment('');
      setAltProductId('');
      setAltAmount('');
      setAltTerm('');
      setIsNeedInfoOpen(false);
      setNeedInfoText('');
    } catch (error) {
      toast.error('Ошибка при отправке решения на сервер');
    }
  };

  const handleDecision = (outcomeRus: string) => {
    let outcomeEng = 'approved';
    let extra = undefined;

    if (outcomeRus === 'Отказ') outcomeEng = 'rejected';
    if (outcomeRus === 'Предложена альтернатива') {
      outcomeEng = 'counter_offer';
      extra = {
        productId: altProductId,
        amount: Number(altAmount) || selectedApp.amount,
        term: Number(altTerm) || selectedApp.term
      };
    }

    submitDecision(outcomeEng, outcomeRus, extra);
  };

  const handleNeedInfo = () => {
    if (!needInfoText.trim()) {
      toast.error('Укажите, какие документы или информацию нужно запросить');
      return;
    }
    submitDecision('need_info', 'Нужна информация', { missingFields: [needInfoText] });
  };

  // Фильтрация
  const filteredApps = apps.filter(a => {
    const matchesFilter = filter === 'Все' || a.status === filter;
    const searchLower = searchQuery.toLowerCase();
    const matchesSearch =
      (a.company && a.company.toLowerCase().includes(searchLower)) ||
      (a.id && a.id.toString().includes(searchLower)) ||
      (a.inn && a.inn.includes(searchQuery));
    return matchesFilter && matchesSearch;
  });

  // ============ СТАТИСТИКА ============
  const renderStatistics = () => {
    const myApproved = apps.filter(a => a.status === 'Одобрено' && a.employeeComment).length;
    const myRejected = apps.filter(a => a.status === 'Отказ').length;
    const myNeedInfo = apps.filter(a => a.status === 'Нужна информация').length;
    const myInProgress = apps.filter(a => a.status === 'В работе' || a.status === 'На рассмотрении').length;
    const autoApproved = apps.filter(a => a.status === 'Одобрено' && !a.employeeComment).length;

    const barData = [
      { name: 'Одобрено мной', count: myApproved, fill: '#22c55e' },
      { name: 'Отклонено', count: myRejected, fill: '#ef4444' },
      { name: 'Запрошено инфо', count: myNeedInfo, fill: '#eab308' },
      { name: 'Авто-решения', count: autoApproved, fill: '#3b82f6' },
    ];

    return (
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="p-8 max-w-6xl mx-auto space-y-6">
        <div className="flex justify-between items-end">
          <div>
            <h1 className="text-3xl font-extrabold text-slate-900">Статистика</h1>
            <p className="text-slate-500">Показатели вашей личной эффективности и работы конвейера</p>
          </div>
          <Button onClick={loadApplications} disabled={isLoading} variant="outline" className="gap-2">
            <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} /> Обновить
          </Button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card className="p-5 border-l-4 border-blue-500 flex flex-col justify-between">
            <div><p className="text-xs text-slate-500 font-medium mb-1">В работе у меня</p><p className="text-3xl font-extrabold text-slate-900">{myInProgress}</p></div>
          </Card>
          <Card className="p-5 border-l-4 border-green-500 flex flex-col justify-between">
            <div><p className="text-xs text-slate-500 font-medium mb-1">Мной одобрено</p><p className="text-3xl font-extrabold text-slate-900">{myApproved}</p></div>
          </Card>
          <Card className="p-5 border-l-4 border-red-500 flex flex-col justify-between">
            <div><p className="text-xs text-slate-500 font-medium mb-1">Мной отклонено</p><p className="text-3xl font-extrabold text-slate-900">{myRejected}</p></div>
          </Card>
          <Card className="p-5 border-l-4 border-slate-300 flex flex-col justify-between">
            <div><p className="text-xs text-slate-500 font-medium mb-1">Среднее время</p><p className="text-3xl font-extrabold text-slate-900">1.5 <span className="text-lg text-slate-500">мин</span></p></div>
          </Card>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <Card className="p-6">
            <h3 className="font-bold text-lg mb-6 flex items-center gap-2"><PieChart className="w-5 h-5" /> Мои решения по заявкам</h3>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={barData} margin={{ top: 20, right: 30, left: 0, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                  <XAxis dataKey="name" tick={{ fontSize: 12 }} axisLine={false} tickLine={false} />
                  <YAxis axisLine={false} tickLine={false} allowDecimals={false} />
                  <Tooltip cursor={{ fill: 'transparent' }} />
                  <Bar dataKey="count" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Card>

          <Card className="p-6">
            <h3 className="font-bold text-lg mb-6 flex items-center gap-2"><Clock className="w-5 h-5" /> Моя активность за неделю</h3>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={[
                  { day: 'Пн', count: 4 }, { day: 'Вт', count: 7 }, { day: 'Ср', count: 3 },
                  { day: 'Чт', count: 9 }, { day: 'Пт', count: 5 }, { day: 'Сб', count: 1 }, { day: 'Вс', count: 0 }
                ]}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                  <XAxis dataKey="day" axisLine={false} tickLine={false} />
                  <YAxis axisLine={false} tickLine={false} allowDecimals={false} />
                  <Tooltip cursor={{ fill: 'transparent' }} />
                  <Bar dataKey="count" fill="#EF3124" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Card>
        </div>
      </motion.div>
    );
  };

  // ============ ДЕТАЛИ ЗАЯВКИ ============
  const renderAppDetail = () => {
    if (!selectedApp) return null;

    const isActionRequired = selectedApp.status === 'Новая' || selectedApp.status === 'На рассмотрении';
    const isInProgress = selectedApp.status === 'В работе';
    const isAutoApproved = selectedApp.status === 'Одобрено' && !selectedApp.employeeComment;

    return (
      <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} className="max-w-6xl mx-auto space-y-6 pb-10 p-8">
        <button onClick={() => setSelectedApp(null)} className="text-slate-500 hover:text-alfa flex items-center gap-2 text-sm font-bold transition mb-2">
          <ArrowLeft className="w-4 h-4"/> Назад к списку заявок
        </button>

        {/* Шапка заявки */}
        <div className="flex justify-between items-start bg-white p-6 rounded-3xl shadow-sm border border-slate-100">
          <div>
            <div className="flex items-center gap-3 mb-1">
              <h1 className="text-3xl font-extrabold text-slate-900">Заявка № {selectedApp.id}</h1>
              {selectedApp.isManual && <Badge variant="danger">Индивидуальная</Badge>}
              {isAutoApproved && <Badge variant="success">Одобрено системой</Badge>}
            </div>
            <p className="text-slate-500 font-medium text-lg">{selectedApp.company}</p>
            <p className="text-sm text-slate-400 mt-1">Создана {selectedApp.created_at ? new Date(selectedApp.created_at).toLocaleDateString('ru-RU') : selectedApp.date} • ИНН: {selectedApp.inn}</p>
          </div>
          <Badge variant={
            selectedApp.status === 'Одобрено' ? 'success' :
            selectedApp.status === 'Отказ' ? 'danger' :
            selectedApp.status === 'В работе' ? 'warning' :
            selectedApp.status === 'Нужна информация' ? 'info' : 'default'
          } className="text-sm px-4 py-2">
            {selectedApp.status}
          </Badge>
        </div>

        {/* Параметры заявки */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card className="p-4"><p className="text-xs text-slate-500 mb-1">Сумма</p><p className="font-extrabold text-xl">{selectedApp.amount?.toLocaleString()} ₽</p></Card>
          <Card className="p-4"><p className="text-xs text-slate-500 mb-1">Продукт</p><p className="font-bold text-base truncate">{selectedApp.product}</p></Card>
          <Card className="p-4"><p className="text-xs text-slate-500 mb-1">Срок</p><p className="font-bold text-base">{selectedApp.term || 6} мес.</p></Card>
          <Card className="p-4"><p className="text-xs text-slate-500 mb-1">Цель</p><p className="font-bold text-base truncate">{selectedApp.purpose || 'Кассовый разрыв'}</p></Card>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mt-6">
          {/* ЛЕВАЯ КОЛОНКА: Данные компании, Финансы и Проверки */}
          <div className="lg:col-span-2 space-y-6">
            <Card className="p-6">
              <h3 className="font-bold text-lg mb-4 flex items-center gap-2"><Building2 className="w-5 h-5"/> Информация о компании</h3>
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div><p className="text-slate-500 mb-1">Компания</p><p className="font-medium">{selectedApp.company}</p></div>
                <div><p className="text-slate-500 mb-1">Руководитель</p><p className="font-medium">{selectedApp.director || 'Не указан'}</p></div>
                <div><p className="text-slate-500 mb-1">Телефон</p><p className="font-medium">{selectedApp.phone || 'Не указан'}</p></div>
                <div><p className="text-slate-500 mb-1">Сфера</p><p className="font-medium">{selectedApp.industry || 'Торговля'}</p></div>
              </div>
            </Card>

            <Card className="p-6">
              <h3 className="font-bold text-lg mb-4 flex items-center gap-2"><TrendingUp className="w-5 h-5"/> Финансовые показатели</h3>
              <div className="space-y-3 text-sm">
                <div className="flex justify-between border-b border-slate-50 pb-2"><span className="text-slate-500">Выручка за год</span><span className="font-medium">{(selectedApp.revenue || selectedApp.annual_revenue || 0).toLocaleString()} ₽</span></div>
                <div className="flex justify-between border-b border-slate-50 pb-2"><span className="text-slate-500">Чистая прибыль</span><span className="font-medium">{(selectedApp.profit || 0).toLocaleString()} ₽</span></div>
                <div className="flex justify-between border-b border-slate-50 pb-2"><span className="text-slate-500">Обязательства</span><span className="font-medium">{(selectedApp.liabilities || selectedApp.existing_debt || 0).toLocaleString()} ₽</span></div>
              </div>
            </Card>

            {/* Проверка во внешних источниках */}
            <Card className="p-6 border-t-4 border-slate-300">
              <h3 className="font-bold text-lg mb-4 flex items-center gap-2"><FileText className="w-5 h-5"/> Проверка во внешних источниках</h3>
              <div className="bg-slate-50 rounded-xl p-4 border border-slate-200 space-y-3">
                <div className="flex justify-between items-center text-sm">
                  <span className="text-slate-700 font-medium">ЕГРЮЛ (Статус компании)</span>
                  {selectedApp.egrul?.status === 'active' || selectedApp.external_checks?.egrul === 'active' ? (
                    <span className="text-green-600 font-bold flex items-center gap-1 bg-green-50 px-2 py-1 rounded-md"><Check className="w-4 h-4"/> Действует</span>
                  ) : (
                    <span className="text-red-600 font-bold flex items-center gap-1 bg-red-50 px-2 py-1 rounded-md"><X className="w-4 h-4"/> Ликвидация / Неизвестно</span>
                  )}
                </div>
                <div className="flex justify-between items-center text-sm">
                  <span className="text-slate-700 font-medium">ФНС (Налоговая задолженность)</span>
                  {selectedApp.fns?.tax_debt === 0 || selectedApp.external_checks?.fns === 'no_debt' ? (
                    <span className="text-green-600 font-bold flex items-center gap-1 bg-green-50 px-2 py-1 rounded-md"><Check className="w-4 h-4"/> Нет долгов</span>
                  ) : (
                    <span className="text-red-600 font-bold flex items-center gap-1 bg-red-50 px-2 py-1 rounded-md"><AlertTriangle className="w-4 h-4"/> Есть долг</span>
                  )}
                </div>
                <div className="flex justify-between items-center text-sm">
                  <span className="text-slate-700 font-medium">БКИ (Кредитная история)</span>
                  {(selectedApp.bki?.max_overdue_days_12m === 0) || selectedApp.external_checks?.bki === 'ok' ? (
                    <span className="text-green-600 font-bold flex items-center gap-1 bg-green-50 px-2 py-1 rounded-md"><Check className="w-4 h-4"/> Без просрочек</span>
                  ) : (
                    <span className="text-red-600 font-bold flex items-center gap-1 bg-red-50 px-2 py-1 rounded-md"><AlertTriangle className="w-4 h-4"/> Просрочка</span>
                  )}
                </div>
              </div>
            </Card>
          </div>

          {/* ПРАВАЯ КОЛОНКА: Оценка риска и SHAP-факторы */}
          <div className="lg:col-span-1 space-y-6">
            <Card className="p-6 border-t-4 border-indigo-500 relative overflow-hidden bg-white shadow-sm h-full">
              <div className="absolute top-2 right-2 opacity-5"><BrainCircuit className="w-24 h-24"/></div>
              <h3 className="font-bold text-lg mb-4 flex items-center gap-2"><Target className="w-5 h-5"/> Оценка риска (ML)</h3>
              <div className="mb-6 relative z-10">
                <p className="text-xs text-slate-500 mb-1">Вероятность дефолта (PD)</p>
                <div className="flex items-end gap-3">
                  <span className={`text-5xl font-extrabold ${selectedApp.riskScore > 0.15 ? 'text-red-500' : 'text-green-500'}`}>
                    {selectedApp.riskScore?.toFixed(2) || '0.00'}
                  </span>
                  <span className={`px-2 py-1 rounded text-xs font-bold mb-2 ${selectedApp.riskScore > 0.15 ? 'bg-red-50 text-red-600' : 'bg-green-50 text-green-600'}`}>
                    {selectedApp.riskScore > 0.15 ? 'Высокий риск' : 'Низкий риск'}
                  </span>
                </div>
                <div className="w-full bg-slate-100 h-2 rounded-full mt-3 overflow-hidden">
                  <div className={`h-full ${selectedApp.riskScore > 0.15 ? 'bg-red-500' : 'bg-green-500'}`} style={{ width: `${(selectedApp.riskScore || 0) * 100}%` }} />
                </div>
              </div>

              {/* Ключевые факторы риска */}
              <div className="bg-slate-50 rounded-xl p-4 border border-slate-200 mb-6 relative z-10">
                <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3">Ключевые факторы риска</p>
                <div className="space-y-2 text-sm">
                  {selectedApp.risk_factors && selectedApp.risk_factors.length > 0 ? (
                    selectedApp.risk_factors.map((factor: any, i: number) => (
                      <div key={i} className="flex justify-between items-center">
                        <span className="text-slate-700 text-xs">{factor.label || factor.name}</span>
                        <span className={`font-bold text-xs ${factor.direction === 'up' || factor.direction === 'increases_risk' ? 'text-red-500' : 'text-green-500'}`}>
                          {factor.direction === 'up' || factor.direction === 'increases_risk' ? 'Повышает риск' : 'Снижает риск'}
                        </span>
                      </div>
                    ))
                  ) : (
                    <p className="text-xs text-slate-500">Факторов риска не выявлено</p>
                  )}
                </div>
              </div>

              <div className="bg-indigo-50 rounded-xl p-4 relative z-10 border border-indigo-100">
                <p className="text-xs text-indigo-800 font-bold mb-2 uppercase tracking-wider">Рекомендация системы</p>
                <p className="font-extrabold text-indigo-900 text-lg mb-2">
                  {selectedApp.mlRecommendation || (selectedApp.riskScore > 0.15 ? 'Склоняется к отказу' : 'Склоняется к одобрению')}
                </p>
              </div>
            </Card>
          </div>
        </div>

        {/* ПАНЕЛЬ ПРИНЯТИЯ РЕШЕНИЯ */}
        <div className="mt-8">
          {isAutoApproved ? (
             <Card className="p-8 text-center bg-green-50 border border-green-200 shadow-sm rounded-3xl">
               <CheckCircle2 className="w-16 h-16 text-green-500 mx-auto mb-4"/>
               <h3 className="font-bold text-2xl mb-2 text-green-800">Заявка одобрена автоматически</h3>
               <p className="text-slate-600 max-w-lg mx-auto">
                 Система приняла решение без участия человека, так как риск (PD) ниже 5% и сумма не превышает 3 млн ₽.
               </p>
             </Card>
          ) : isActionRequired ? (
            <Card className="p-10 text-center bg-slate-900 text-white shadow-xl border-none rounded-3xl">
              <ShieldAlert className="w-16 h-16 text-yellow-500 mx-auto mb-4"/>
              <h3 className="font-bold text-2xl mb-2">Требуется ваше решение</h3>
              <p className="text-base text-slate-400 mb-8 max-w-lg mx-auto">Возьмите заявку в работу, чтобы изучить детали и принять финальное решение.</p>
              <Button onClick={handleTakeToWork} className="w-full max-w-md mx-auto bg-alfa hover:bg-alfaDark text-xl py-5 rounded-xl shadow-lg shadow-alfa/20">
                Взять в работу
              </Button>
            </Card>
          ) : isInProgress ? (
            <Card className="p-8 border-2 border-slate-200 shadow-lg bg-white rounded-3xl">
              <h3 className="font-bold text-2xl mb-6">Принятие решения</h3>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                <div className="space-y-6">
                  <div className="bg-slate-50 p-5 rounded-xl border border-slate-200">
                    <label className="text-sm font-bold text-slate-700 mb-2 block">Предложить альтернативу?</label>
                    <div className="relative mb-3">
                      <select
                        className="w-full p-4 bg-white border border-slate-300 rounded-xl text-base outline-none focus:ring-2 focus:ring-alfa transition appearance-none pr-12"
                        value={altProductId}
                        onChange={(e) => setAltProductId(e.target.value)}
                      >
                        <option value="">Не предлагать (одобрение/отказ)</option>
                        {products.map(p => <option key={p.id} value={p.id}>{p.name} (от {p.rate}%)</option>)}
                      </select>
                      <ChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400 pointer-events-none" />
                    </div>

                    {altProductId && (
                      <div className="grid grid-cols-2 gap-3 mt-3 p-3 bg-blue-50 rounded-lg border border-blue-100">
                        <div>
                          <label className="text-xs text-slate-500 mb-1 block">Новая сумма (₽)</label>
                          <input type="number" placeholder={selectedApp.amount} value={altAmount} onChange={e => setAltAmount(e.target.value)} className="w-full p-2 border border-slate-200 rounded-lg text-sm"/>
                        </div>
                        <div>
                          <label className="text-xs text-slate-500 mb-1 block">Новый срок (мес.)</label>
                          <input type="number" placeholder={selectedApp.term} value={altTerm} onChange={e => setAltTerm(e.target.value)} className="w-full p-2 border border-slate-200 rounded-lg text-sm"/>
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="flex flex-col gap-3">
                    <Button variant="success" className="w-full bg-green-500 hover:bg-green-600 py-4 text-lg shadow-lg shadow-green-500/20" onClick={() => handleDecision('Одобрено')}>
                      <CheckCircle2 className="w-5 h-5 mr-2" /> Одобрить текущую заявку
                    </Button>

                    {altProductId && (
                      <Button className="w-full bg-indigo-600 hover:bg-indigo-700 text-white py-4 text-lg" onClick={() => handleDecision('Предложена альтернатива')}>
                        <RefreshCw className="w-5 h-5 mr-2" /> Отправить альтернативу
                      </Button>
                    )}

                    <Button variant="secondary" className="w-full bg-yellow-100 text-yellow-800 hover:bg-yellow-200 py-4 text-lg border-none" onClick={() => setIsNeedInfoOpen(true)}>
                      <AlertOctagon className="w-5 h-5 mr-2" /> Запросить информацию у клиента
                    </Button>

                    <Button variant="secondary" className="w-full bg-white text-red-600 border-2 border-red-100 hover:bg-red-50 py-4 text-lg" onClick={() => handleDecision('Отказ')}>
                      <XCircle className="w-5 h-5 mr-2" /> Отказать
                    </Button>
                  </div>
                </div>

                <div className="flex flex-col h-full">
                  <label className="text-sm font-bold text-slate-700 mb-2 block">Комментарий для клиента (обязательно)</label>
                  <textarea
                    placeholder="Опишите причину отказа, условия альтернативы или решение по заявке..."
                    value={comment}
                    onChange={e => setComment(e.target.value)}
                    className="w-full flex-1 p-4 bg-slate-50 border border-slate-200 rounded-xl text-base resize-none outline-none focus:ring-2 focus:ring-slate-300 mb-2"
                  />
                  <p className="text-xs text-slate-400">Комментарий сохраняется в истории заявки и отправляется клиенту.</p>
                </div>
              </div>
            </Card>
          ) : (
            <Card className="p-10 text-center bg-slate-100 border-none shadow-sm rounded-3xl">
              <CheckCircle2 className={`w-20 h-20 mx-auto mb-4 ${selectedApp.status === 'Одобрено' ? 'text-green-500' : selectedApp.status === 'Нужна информация' ? 'text-yellow-500' : 'text-red-500'}`} />
              <h3 className="font-bold text-2xl mb-2">Решение принято</h3>
              <p className="font-bold text-slate-600 text-xl mb-6">Статус: {selectedApp.status}</p>

              {selectedApp.employeeComment && (
                <div className="bg-white p-6 rounded-xl text-left border border-slate-200 shadow-sm max-w-2xl mx-auto">
                  <p className="text-xs text-slate-400 mb-2 font-bold uppercase tracking-wider">Ваш комментарий:</p>
                  <p className="text-slate-700 text-lg italic">«{selectedApp.employeeComment}»</p>
                </div>
              )}
            </Card>
          )}
        </div>
      </motion.div>
    );
  };

  return (
    <div className="flex h-[calc(100vh-64px)] bg-slate-50 overflow-hidden">
      <div className="w-64 bg-white border-r border-slate-200 flex flex-col hidden md:flex shrink-0 z-20">
        <div className="p-6 border-b border-slate-100 flex items-center gap-3">
          <div className="w-10 h-10 bg-slate-900 rounded-full flex items-center justify-center text-white font-bold">АС</div>
          <div><p className="font-bold text-sm">{employeeName}</p><p className="text-xs text-slate-500">Кредитный специалист</p></div>
        </div>
        <div className="p-4 flex flex-col gap-2 flex-1">
          <button onClick={() => { setActiveMenu('applications'); setSelectedApp(null); }} className={`flex items-center gap-3 px-4 py-3 rounded-xl font-bold transition ${activeMenu === 'applications' ? 'bg-red-50 text-alfa' : 'text-slate-600 hover:bg-slate-50'}`}>
            <Briefcase className="w-5 h-5" /> Заявки <Badge className="ml-auto bg-alfa text-white">{apps.length}</Badge>
          </button>
          <button onClick={() => setActiveMenu('statistics')} className={`flex items-center gap-3 px-4 py-3 rounded-xl font-bold transition ${activeMenu === 'statistics' ? 'bg-red-50 text-alfa' : 'text-slate-600 hover:bg-slate-50'}`}>
            <PieChart className="w-5 h-5" /> Статистика
          </button>

          <button onClick={loadApplications} disabled={isLoading} className="flex items-center gap-3 px-4 py-3 mt-auto rounded-xl text-slate-400 hover:bg-slate-50 hover:text-alfa font-medium transition text-sm">
            <RotateCcw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} /> Обновить данные
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-hidden relative">
        <AnimatePresence mode="wait">
          {activeMenu === 'statistics' && (
            <motion.div key="stats" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="h-full overflow-y-auto absolute inset-0">
              {renderStatistics()}
            </motion.div>
          )}

          {activeMenu === 'applications' && !selectedApp && (
            <motion.div key="list" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="h-full overflow-y-auto absolute inset-0 p-8">
              <div className="max-w-6xl mx-auto">
                <div className="flex justify-between items-center mb-6">
                  <div>
                    <h1 className="text-3xl font-extrabold text-slate-900 mb-1">Рабочий стол</h1>
                    <p className="text-slate-500">Все входящие заявки на кредиты МСБ</p>
                  </div>

                  <div className="relative w-80">
                    <Search className="absolute left-4 top-3.5 w-5 h-5 text-slate-400" />
                    <input
                      type="text"
                      placeholder="Поиск по компании или ИНН"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="w-full pl-12 pr-10 py-3 bg-white border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-slate-300 transition text-sm shadow-sm"
                    />
                    {searchQuery && (
                      <button onClick={() => setSearchQuery('')} className="absolute right-3 top-3.5 text-slate-400 hover:text-slate-600">
                        <X className="w-5 h-5" />
                      </button>
                    )}
                  </div>
                </div>

                <div className="flex gap-2 mb-6 overflow-x-auto pb-2">
                  {['Все', 'Новая', 'На рассмотрении', 'В работе', 'Нужна информация', 'Одобрено', 'Отказ'].map(f => (
                    <button key={f} onClick={() => setFilter(f)} className={`px-4 py-2 rounded-lg text-sm font-bold whitespace-nowrap transition shadow-sm ${filter === f ? 'bg-slate-900 text-white' : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'}`}>
                      {f} {f === 'Все' && <span className="ml-1 opacity-60">{apps.length}</span>}
                    </button>
                  ))}
                </div>

                <Card className="overflow-hidden shadow-sm">
                  <table className="w-full text-left">
                    <thead className="bg-slate-50 border-b border-slate-100">
                      <tr>
                        <th className="p-4 text-xs font-bold text-slate-500 uppercase tracking-wider">№ Заявки</th>
                        <th className="p-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Компания</th>
                        <th className="p-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Сумма</th>
                        <th className="p-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Риск (ML)</th>
                        <th className="p-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Статус</th>
                        <th className="p-4 text-xs font-bold text-slate-500 uppercase tracking-wider text-right">Действие</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {filteredApps.length === 0 ? (
                        <tr>
                          <td colSpan={6} className="p-8 text-center text-slate-500">
                            {isLoading ? 'Загрузка данных...' : 'По вашему запросу ничего не найдено'}
                          </td>
                        </tr>
                      ) : (
                        filteredApps.map(app => (
                          <tr key={app.id} onClick={() => setSelectedApp(app)} className="hover:bg-slate-50 cursor-pointer transition">
                            <td className="p-4 font-bold text-slate-900">{app.id}</td>
                            <td className="p-4 font-medium">{app.company}</td>
                            <td className="p-4 font-bold">{app.amount?.toLocaleString()} ₽</td>
                            <td className="p-4 font-bold text-slate-500">{app.riskScore?.toFixed(2) || '—'}</td>
                            <td className="p-4">
                              <Badge variant={
                                app.status === 'Одобрено' ? 'success' :
                                app.status === 'Отказ' ? 'danger' :
                                app.status === 'Новая' ? 'info' :
                                app.status === 'В работе' ? 'warning' : 'default'
                              }>{app.status}</Badge>
                            </td>
                            <td className="p-4 text-right text-alfa font-bold text-sm">Открыть</td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </Card>
              </div>
            </motion.div>
          )}

          {activeMenu === 'applications' && selectedApp && (
            <motion.div key="detail" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="h-full overflow-y-auto absolute inset-0 bg-slate-50">
              {renderAppDetail()}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Модалка для запроса информации */}
      <AnimatePresence>
        {isNeedInfoOpen && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
            <Card className="w-full max-w-md p-6 bg-white">
              <h3 className="font-bold text-xl mb-4">Запросить информацию</h3>
              <p className="text-sm text-slate-500 mb-4">Укажите, какие документы или сведения необходимы клиенту.</p>
              <textarea
                className="w-full p-3 border border-slate-200 rounded-xl h-32 outline-none mb-4"
                placeholder="Например: Приложите актуальную выписку по расчетному счету за последние 3 месяца."
                value={needInfoText}
                onChange={e => setNeedInfoText(e.target.value)}
              />
              <div className="flex gap-2 justify-end">
                <Button variant="outline" onClick={() => setIsNeedInfoOpen(false)}>Отмена</Button>
                <Button className="bg-yellow-500 hover:bg-yellow-600 text-white" onClick={handleNeedInfo}>Отправить запрос</Button>
              </div>
            </Card>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
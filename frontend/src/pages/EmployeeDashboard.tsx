import { useState, useEffect } from 'react';
import { useApp } from '../context/AppContext';
import { products, mockGetSystemSuggestions } from '../mocks/mockData'; // Импортируем новую функцию
import {
  Search, Briefcase, PieChart, CheckCircle2, XCircle,
  BarChart3, ShieldAlert, ArrowLeft, RefreshCw,
  BrainCircuit, Target, TrendingUp, Building2, X, ChevronDown, RotateCcw, Sparkles, CreditCard, Zap
} from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import toast from 'react-hot-toast';
import { Button, Card, Badge } from '../components/ui';
import { motion, AnimatePresence } from 'framer-motion';

export default function EmployeeDashboard() {
  const { apps, setApps, employeeName, resetData } = useApp();
  const [selectedApp, setSelectedApp] = useState<any>(null);
  const [activeMenu, setActiveMenu] = useState<'applications' | 'statistics'>('applications');
  const [filter, setFilter] = useState('Все');
  const [searchQuery, setSearchQuery] = useState('');

  const [comment, setComment] = useState('');
  const [altProductId, setAltProductId] = useState('');

  useEffect(() => {
    if (activeMenu === 'applications') setSelectedApp(null);
  }, [activeMenu]);

  const handleTakeToWork = () => {
    if (!selectedApp) return;
    const updated = apps.map(a => a.id === selectedApp.id ? { ...a, status: 'В работе' } : a);
    setApps(updated);
    setSelectedApp({ ...selectedApp, status: 'В работе' });
    localStorage.setItem('mock_apps', JSON.stringify(updated));
    toast.success('Заявка взята в работу');
  };

  const handleDecision = (status: string) => {
    if (!selectedApp) return;
    if (!comment.trim() && (status === 'Отказ' || status === 'Предложена альтернатива')) {
      toast.error('Пожалуйста, оставьте комментарий для клиента');
      return;
    }

    let updateData: any = { status, employeeComment: comment };

    if (status === 'Предложена альтернатива') {
      if (!altProductId) {
        toast.error('Выберите продукт для альтернативы');
        return;
      }
      const altProduct = products.find(p => p.id === altProductId);
      updateData.alternativeProduct = altProduct;
    }

    const updated = apps.map(a => {
      if (a.id === selectedApp.id) {
        return {
          ...a,
          ...updateData,
          timeline: a.timeline.map((t:any) => t.step === 'Решение' ? { ...t, date: `Решение: ${status}`, done: true } : t)
        };
      }
      return a;
    });
    setApps(updated);
    setSelectedApp({ ...selectedApp, ...updateData });
    setComment('');
    setAltProductId('');
    toast.success(`Статус обновлен: ${status}`);
    localStorage.setItem('mock_apps', JSON.stringify(updated));
  };

  const filteredApps = apps.filter(a => {
    const matchesFilter = filter === 'Все' || a.status === filter;
    const searchLower = searchQuery.toLowerCase();
    const matchesSearch =
      (a.company && a.company.toLowerCase().includes(searchLower)) ||
      (a.id && a.id.toLowerCase().includes(searchLower)) ||
      (a.inn && a.inn.includes(searchQuery));

    return matchesFilter && matchesSearch;
  });

  const renderStatistics = () => {
    const barData = [
      { name: 'Одобрено', count: 45, fill: '#22c55e' },
      { name: 'На рассмотрении', count: 12, fill: '#eab308' },
      { name: 'Отказы', count: 8, fill: '#ef4444' },
    ];

    return (
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="p-8 max-w-6xl mx-auto space-y-6">
        <h1 className="text-3xl font-extrabold text-slate-900">Аналитика и статистика</h1>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {[
            { title: 'Всего заявок', value: '65', icon: <Briefcase className="w-5 h-5 text-blue-500" />, bg: 'bg-blue-50' },
            { title: 'Одобрено', value: '45', icon: <CheckCircle2 className="w-5 h-5 text-green-500" />, bg: 'bg-green-50' },
            { title: 'Отказы', value: '8', icon: <XCircle className="w-5 h-5 text-red-500" />, bg: 'bg-red-50' },
            { title: 'Средний риск', value: '0.34', icon: <ShieldAlert className="w-5 h-5 text-yellow-500" />, bg: 'bg-yellow-50' },
          ].map((stat, i) => (
            <Card key={i} className="p-5 flex items-center gap-4">
              <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${stat.bg}`}>{stat.icon}</div>
              <div><p className="text-xs text-slate-500 font-medium">{stat.title}</p><p className="text-2xl font-extrabold text-slate-900">{stat.value}</p></div>
            </Card>
          ))}
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <Card className="p-6">
            <h3 className="font-bold text-lg mb-6 flex items-center gap-2"><PieChart className="w-5 h-5" /> Распределение по статусам</h3>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={barData} margin={{ top: 20, right: 30, left: 0, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                  <XAxis dataKey="name" tick={{ fontSize: 12 }} axisLine={false} tickLine={false} />
                  <YAxis axisLine={false} tickLine={false} />
                  <Tooltip cursor={{ fill: 'transparent' }} />
                  <Bar dataKey="count" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Card>
          <Card className="p-6 flex flex-col items-center justify-center text-center">
            <BarChart3 className="w-16 h-16 text-slate-300 mb-4" />
            <h3 className="text-xl font-bold text-slate-900 mb-2">Модуль в разработке</h3>
            <p className="text-slate-500 text-sm max-w-sm">Здесь аналитик разместит расширенные дашборды.</p>
          </Card>
        </div>
      </motion.div>
    );
  };

  const renderAppDetail = () => {
    if (!selectedApp) return null;

    const isActionRequired = selectedApp.status === 'Новая' || selectedApp.status === 'На рассмотрении';
    const isInProgress = selectedApp.status === 'В работе';

    // Получаем умные рекомендации (текст + продукты)
    const systemSuggestions = mockGetSystemSuggestions(selectedApp);

    return (
      <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} className="max-w-6xl mx-auto space-y-6 pb-10 p-8">

        <button onClick={() => setSelectedApp(null)} className="text-slate-500 hover:text-alfa flex items-center gap-2 text-sm font-bold transition mb-2">
          <ArrowLeft className="w-4 h-4"/> Назад к списку заявок
        </button>

        <div className="flex justify-between items-start bg-white p-6 rounded-3xl shadow-sm border border-slate-100">
          <div>
            <h1 className="text-3xl font-extrabold text-slate-900 mb-2">Заявка № {selectedApp.id}</h1>
            <p className="text-slate-500 font-medium text-lg">{selectedApp.company} {selectedApp.isManual && <Badge variant="danger" className="ml-2">Индивидуальная</Badge>}</p>
            <p className="text-sm text-slate-400 mt-1">Создана {selectedApp.date} • ИНН: {selectedApp.inn}</p>
          </div>
          <Badge variant={selectedApp.status === 'Одобрено' ? 'success' : selectedApp.status === 'Отказ' ? 'danger' : selectedApp.status === 'В работе' ? 'warning' : 'info'} className="text-sm px-4 py-2">
            {selectedApp.status}
          </Badge>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card className="p-4"><p className="text-xs text-slate-500 mb-1">Сумма</p><p className="font-extrabold text-xl">{selectedApp.amount?.toLocaleString()} ₽</p></Card>
          <Card className="p-4"><p className="text-xs text-slate-500 mb-1">Продукт</p><p className="font-bold text-base truncate">{selectedApp.product}</p></Card>
          <Card className="p-4"><p className="text-xs text-slate-500 mb-1">Срок</p><p className="font-bold text-base">{selectedApp.term || 6} мес.</p></Card>
          <Card className="p-4"><p className="text-xs text-slate-500 mb-1">Цель</p><p className="font-bold text-base truncate">{selectedApp.purpose || 'Кассовый разрыв'}</p></Card>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mt-6">
          <div className="lg:col-span-2 space-y-6">
            <Card className="p-6">
              <h3 className="font-bold text-lg mb-4 flex items-center gap-2"><Building2 className="w-5 h-5"/> Информация о компании</h3>
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div><p className="text-slate-500 mb-1">Компания</p><p className="font-medium">{selectedApp.company}</p></div>
                <div><p className="text-slate-500 mb-1">Руководитель</p><p className="font-medium">{selectedApp.director || 'Не указан'}</p></div>
                <div><p className="text-slate-500 mb-1">Телефон</p><p className="font-medium">{selectedApp.phone || 'Не указан'}</p></div>
                <div><p className="text-slate-500 mb-1">Сфера</p><p className="font-medium">Торговля</p></div>
              </div>
            </Card>

            <Card className="p-6">
              <h3 className="font-bold text-lg mb-4 flex items-center gap-2"><TrendingUp className="w-5 h-5"/> Финансовые показатели</h3>
              <div className="space-y-3 text-sm">
                <div className="flex justify-between border-b border-slate-50 pb-2"><span className="text-slate-500">Выручка за год</span><span className="font-medium">{(selectedApp.revenue || 50000000).toLocaleString()} ₽</span></div>
                <div className="flex justify-between border-b border-slate-50 pb-2"><span className="text-slate-500">Чистая прибыль</span><span className="font-medium">{(selectedApp.profit || 3500000).toLocaleString()} ₽</span></div>
                <div className="flex justify-between border-b border-slate-50 pb-2"><span className="text-slate-500">Обязательства</span><span className="font-medium">{(selectedApp.liabilities || 2000000).toLocaleString()} ₽</span></div>
              </div>
            </Card>
          </div>

          <div className="lg:col-span-1">
            <Card className="p-6 border-t-4 border-indigo-500 relative overflow-hidden bg-white shadow-sm h-full">
              <div className="absolute top-2 right-2 opacity-5"><BrainCircuit className="w-24 h-24"/></div>
              <h3 className="font-bold text-lg mb-4 flex items-center gap-2"><Target className="w-5 h-5"/> Оценка риска (ML)</h3>
              <div className="mb-6 relative z-10">
                <p className="text-xs text-slate-500 mb-1">Вероятность дефолта</p>
                <div className="flex items-end gap-3">
                  <span className={`text-5xl font-extrabold ${selectedApp.riskScore > 0.5 ? 'text-red-500' : 'text-green-500'}`}>
                    {selectedApp.riskScore?.toFixed(2)}
                  </span>
                  <span className={`px-2 py-1 rounded text-xs font-bold mb-2 ${selectedApp.riskScore > 0.5 ? 'bg-red-50 text-red-600' : 'bg-green-50 text-green-600'}`}>
                    {selectedApp.riskScore > 0.5 ? 'Высокий риск' : 'Низкий риск'}
                  </span>
                </div>
                <div className="w-full bg-slate-100 h-2 rounded-full mt-3 overflow-hidden">
                  <div className={`h-full ${selectedApp.riskScore > 0.5 ? 'bg-red-500' : 'bg-green-500'}`} style={{ width: `${selectedApp.riskScore * 100}%` }} />
                </div>
              </div>

              <div className="bg-indigo-50 rounded-xl p-4 relative z-10 border border-indigo-100">
                <p className="text-xs text-indigo-800 font-bold mb-2 uppercase tracking-wider">Мнение системы</p>
                <p className="font-extrabold text-indigo-900 text-xl mb-2">
                  {selectedApp.mlRecommendation || (selectedApp.riskScore > 0.5 ? 'Склоняется к отказу' : 'Склоняется к одобрению')}
                </p>
              </div>
            </Card>
          </div>
        </div>

        {/* БЛОК ПРИНЯТИЯ РЕШЕНИЯ НА ВСЮ ШИРИНУ (ВНИЗУ) */}
        <div className="mt-8">
          {isActionRequired ? (
            <Card className="p-10 text-center bg-slate-900 text-white shadow-xl border-none">
              <ShieldAlert className="w-16 h-16 text-yellow-500 mx-auto mb-4"/>
              <h3 className="font-bold text-2xl mb-2">Требуется ваше решение</h3>
              <p className="text-base text-slate-400 mb-8 max-w-lg mx-auto">Возьмите заявку в работу, чтобы изучить детали и принять финальное решение.</p>
              <Button onClick={handleTakeToWork} className="w-full max-w-md mx-auto bg-alfa hover:bg-alfaDark text-xl py-5 rounded-xl shadow-lg shadow-alfa/20">
                Взять в работу
              </Button>
            </Card>
          ) : isInProgress ? (
            <Card className="p-8 border-2 border-slate-200 shadow-lg bg-white">
              <h3 className="font-bold text-2xl mb-6">Принятие решения</h3>

              {/* НОВЫЙ КРАСИВЫЙ БЛОК УМНЫХ РЕКОМЕНДАЦИЙ */}
              <div className="bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-100 p-6 rounded-2xl mb-8">
                <div className="flex items-center gap-2 mb-3">
                  <Sparkles className="w-5 h-5 text-blue-600" />
                  <h4 className="font-bold text-blue-900 text-lg">Умные рекомендации</h4>
                </div>
                <p className="text-sm text-blue-800 mb-5 font-medium">{systemSuggestions.advice}</p>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {systemSuggestions.products.map((prod) => prod && (
                    <div
                      key={prod.id}
                      onClick={() => setAltProductId(prod.id)}
                      className={`bg-white p-4 rounded-xl border-2 cursor-pointer transition-all duration-200 hover:shadow-md ${altProductId === prod.id ? 'border-blue-500 ring-2 ring-blue-100' : 'border-transparent'}`}
                    >
                      <div className="flex justify-between items-start mb-2">
                        <div className="w-10 h-10 bg-slate-100 rounded-lg flex items-center justify-center text-slate-600">
                          {prod.icon === 'card' ? <CreditCard className="w-5 h-5"/> : prod.icon === 'money' ? <Building2 className="w-5 h-5"/> : <Zap className="w-5 h-5"/>}
                        </div>
                        <Badge variant="info">от {prod.rate}%</Badge>
                      </div>
                      <p className="font-bold text-slate-900 text-sm mb-1">{prod.name}</p>
                      <p className="text-xs text-slate-500">До {prod.maxAmount.toLocaleString()} ₽</p>
                    </div>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                <div className="space-y-6">
                  <div className="bg-slate-50 p-5 rounded-xl border border-slate-200">
                    <label className="text-sm font-bold text-slate-700 mb-2 block">Выбранный продукт для альтернативы</label>
                    {/* КРАСИВЫЙ СЕЛЕКТ */}
                    <div className="relative">
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
                  </div>

                  <div className="flex flex-col gap-4">
                    <Button variant="success" className="w-full bg-green-500 hover:bg-green-600 py-5 text-xl shadow-lg shadow-green-500/20" onClick={() => handleDecision('Одобрено')}>
                      <CheckCircle2 className="w-6 h-6 mr-3" /> Одобрить
                    </Button>
                    {altProductId && (
                      <Button className="w-full bg-blue-600 hover:bg-blue-700 text-white py-5 text-xl" onClick={() => handleDecision('Предложена альтернатива')}>
                        <RefreshCw className="w-6 h-6 mr-3" /> Отправить альтернативу
                      </Button>
                    )}
                    <Button variant="secondary" className="w-full bg-white text-red-600 border-2 border-red-100 hover:bg-red-50 py-5 text-xl" onClick={() => handleDecision('Отказ')}>
                      <XCircle className="w-6 h-6 mr-3" /> Отказать
                    </Button>
                  </div>
                </div>

                <div className="flex flex-col h-full">
                  <label className="text-sm font-bold text-slate-700 mb-2 block">Комментарий для клиента</label>
                  <textarea
                    placeholder="Опишите причину отказа или условия альтернативы..."
                    value={comment}
                    onChange={e => setComment(e.target.value)}
                    className="w-full flex-1 p-4 bg-slate-50 border border-slate-200 rounded-xl text-base resize-none outline-none focus:ring-2 focus:ring-slate-300 mb-2"
                  />
                  <p className="text-xs text-slate-400">Обязательно при отказе или отправке альтернативы.</p>
                </div>
              </div>
            </Card>
          ) : (
            <Card className="p-10 text-center bg-slate-100 border-none shadow-sm">
              <CheckCircle2 className={`w-20 h-20 mx-auto mb-4 ${selectedApp.status === 'Одобрено' ? 'text-green-500' : 'text-red-500'}`} />
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

          <button onClick={resetData} className="flex items-center gap-3 px-4 py-3 mt-auto rounded-xl text-slate-400 hover:bg-slate-50 hover:text-alfa font-medium transition text-sm">
            <RotateCcw className="w-4 h-4" /> Сбросить демо-данные
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
                    <p className="text-slate-500">Заявки на кредиты МСБ</p>
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

                <div className="flex gap-2 mb-6">
                  {['Все', 'Новая', 'На рассмотрении', 'В работе', 'Одобрено', 'Отказ'].map(f => (
                    <button key={f} onClick={() => setFilter(f)} className={`px-4 py-2 rounded-lg text-sm font-bold transition shadow-sm ${filter === f ? 'bg-slate-900 text-white' : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'}`}>
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
                        <th className="p-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Статус</th>
                        <th className="p-4 text-xs font-bold text-slate-500 uppercase tracking-wider text-right">Действие</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {filteredApps.length === 0 ? (
                        <tr>
                          <td colSpan={5} className="p-8 text-center text-slate-500">По вашему запросу ничего не найдено</td>
                        </tr>
                      ) : (
                        filteredApps.map(app => (
                          <tr key={app.id} onClick={() => setSelectedApp(app)} className="hover:bg-slate-50 cursor-pointer transition">
                            <td className="p-4 font-bold text-slate-900">{app.id}</td>
                            <td className="p-4 font-medium">{app.company}</td>
                            <td className="p-4 font-bold">{app.amount?.toLocaleString()} ₽</td>
                            <td className="p-4">
                              <Badge variant={app.status === 'Одобрено' ? 'success' : app.status === 'Отказ' ? 'danger' : app.status === 'Новая' ? 'info' : app.status === 'В работе' ? 'warning' : 'default'}>{app.status}</Badge>
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
    </div>
  );
}
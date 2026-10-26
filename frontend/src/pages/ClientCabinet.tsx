import { useState, useEffect } from 'react';
import { documentRequirements } from '../mocks/mockData';
import { useApp } from '../context/AppContext';
import {
  createDraft,
  submitApplication,
  getApplications,
  getApplicationById,
  uploadDocument,
  getDocuments
} from '../services/api';
import { recommendProducts } from '../services/recommender';
import {
  Home, FileText, Calculator, User, ChevronRight, CheckCircle2, XCircle,
  ArrowLeft, Briefcase, CreditCard, ShieldCheck, HelpCircle, Upload, Clock,
  Phone, Building2, MapPin, AlertTriangle, MessageSquare, Download, Wallet,
  Users, MessageCircle, Bell, LifeBuoy, Headphones, Mail, FileEdit, FilePlus,
  Sparkles
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import toast from 'react-hot-toast';
import { Button, Card, Badge } from '../components/ui';

type Tab = 'main' | 'applications' | 'drafts' | 'calculator' | 'documents' | 'profile' | 'app-detail' | 'notifications' | 'support';

export default function ClientCabinet() {
  const { apps, setApps, docs, setDocs, clientName } = useApp();
  const [activeTab, setActiveTab] = useState<Tab>('main');
  const [viewingApp, setViewingApp] = useState<any>(null);
  const [step, setStep] = useState(1);
  const [disputeText, setDisputeText] = useState('');
  const [isDisputing, setIsDisputing] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Стейты для подписания договора
  const [signStep, setSignStep] = useState<'offer' | 'contract' | 'otp' | 'signed' | 'disbursed'>('offer');
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [otpInput, setOtpInput] = useState('');
  const [otpError, setOtpError] = useState(false);

  // Согласие на БКИ
  const [bkiConsent, setBkiConsent] = useState(false);

  const [calcParams, setCalcParams] = useState({
    type: 'ООО' as 'ООО' | 'ИП',
    collateral: 'Без залога' as 'С залогом' | 'Без залога',
    businessAgeCategory: 'Более 9 месяцев' as 'До 9 месяцев' | 'Более 9 месяцев',
    amount: 1000000,
    termYears: 2,
    purpose: 'working_capital' // <--- ДОБАВЛЕНО ПОЛЕ ЦЕЛИ
  });

  // Стейты для рекомендаций
  const [recommendations, setRecommendations] = useState<any[]>([]);
  const [isRecLoading, setIsRecLoading] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<any>(null);

  const [formData, setFormData] = useState({
    inn: '770200000001',
    ogrn: '1234567890123',
    companyName: 'ООО «Ромашка»',
    region: 'Москва',
    revenue: 50000000,
    profit: 3500000,
    liabilities: 2000000,
    director: 'Иванов Иван Иванович',
    phone: '+7 (999) 123-45-67',
    email: 'ivan@romashka.ru',
    address: 'г. Москва, ул. Тверская, д. 1',
    okved: '47.11 Торговля розничная'
  });
  const [result, setResult] = useState<any>(null);

  // Загрузка заявок и документов при монтировании
  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const fetchedApps = await getApplications(formData.inn);
      if (fetchedApps) setApps(fetchedApps);
      const fetchedDocs = await getDocuments(formData.inn);
      if (fetchedDocs) setDocs(fetchedDocs);
    } catch (e) {
      console.error("Ошибка загрузки данных", e);
    }
  };

  // Асинхронный вызов рекомендательной модели с учетом цели
  useEffect(() => {
    let isMounted = true;
    const fetchRecs = async () => {
      setIsRecLoading(true);
      try {
        const recs = await recommendProducts(calcParams);
        if (isMounted) setRecommendations(recs || []);
      } catch (e) {
        console.error(e);
      } finally {
        if (isMounted) setIsRecLoading(false);
      }
    };

    // Небольшой дебаунс, чтобы не спамить бэкенд при перетаскивании ползунков
    const timer = setTimeout(() => {
      fetchRecs();
    }, 300);

    return () => {
      isMounted = false;
      clearTimeout(timer);
    };
  }, [calcParams]);

  // Поллинг статуса заявки
  useEffect(() => {
    if (!viewingApp) return;
    const isProcessing = ['Проверка данных', 'Оценка рисков', 'На рассмотрении'].includes(viewingApp.status);
    if (!isProcessing) return;

    const interval = setInterval(async () => {
      try {
        const updatedApp = await getApplicationById(viewingApp.id);
        if (updatedApp && updatedApp.status !== viewingApp.status) {
          setViewingApp(updatedApp);
          setApps(prev => prev.map(a => a.id === updatedApp.id ? updatedApp : a));
        }
      } catch (e) {
        console.error("Ошибка поллинга", e);
      }
    }, 2000);

    return () => clearInterval(interval);
  }, [viewingApp, setApps]);

  // Сброс шагов подписания при открытии другой заявки
  useEffect(() => {
    setSignStep('offer');
    setTermsAccepted(false);
    setOtpInput('');
    setOtpError(false);
    setIsDisputing(false);
  }, [viewingApp]);

  const approvedApps = apps.filter(a => a.status === 'Одобрено');
  const totalDebt = approvedApps.reduce((sum, app) => sum + (app.amount || 0), 0);
  const estimatedMonthlyPayment = approvedApps.length > 0 ? Math.round(totalDebt / 24) : 0;

  const handleSaveDraft = async () => {
    try {
      await createDraft({
        ...formData,
        ...calcParams,
        term: calcParams.termYears * 12,
        productId: selectedProduct?.product?.id // <--- ПЕРЕДАЕМ ID ПРОДУКТА
      });
      toast.success('Черновик сохранен на сервере!');
      await loadData();
      setActiveTab('drafts');
      setStep(1);
    } catch (e) {
      toast.error('Ошибка при сохранении черновика');
    }
  };

  const handleSubmit = async () => {
    if (!bkiConsent) {
      toast.error('Необходимо ваше согласие на запрос кредитной истории в БКИ');
      return;
    }

    setIsSubmitting(true);
    try {
      const draft = await createDraft({
        ...formData,
        ...calcParams,
        term: calcParams.termYears * 12,
        productId: selectedProduct?.product?.id // <--- ПЕРЕДАЕМ ID ПРОДУКТА
      });
      const submitted = await submitApplication(draft.id);
      setResult(submitted);
      await loadData();
      setStep(5);
      toast.success('Заявка отправлена на рассмотрение!');
    } catch (e) {
      toast.error('Произошла ошибка при отправке заявки');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleUpload = async (docId: string, e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      await uploadDocument(formData.inn, docId, file);
      const updatedDocs = await getDocuments(formData.inn);
      setDocs(updatedDocs);
      toast.success('Документ успешно загружен');
    } catch (e) {
      toast.error('Ошибка загрузки документа');
    }
  };

  const handleDispute = () => {
    if (!disputeText.trim()) {
      toast.error('Пожалуйста, опишите причину несогласия');
      return;
    }
    const updated = apps.map(a => {
      if (a.id === viewingApp.id) {
        return { ...a, status: 'Оспорено', clientComment: disputeText };
      }
      return a;
    });
    setApps(updated);
    setViewingApp({ ...viewingApp, status: 'Оспорено', clientComment: disputeText });
    setIsDisputing(false);
    toast.success('Ваше обращение отправлено в банк');
  };

  // ============ 1. ГЛАВНАЯ ============
  const renderMain = () => (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
      <Card className="p-8 bg-slate-900 text-white relative overflow-hidden border-none">
        <div className="relative z-10">
          <h2 className="text-3xl font-extrabold mb-2">Добрый день, {clientName.split(' ')[0]}!</h2>
          <p className="text-slate-400 mb-6">{formData.companyName} • ИНН {formData.inn}</p>
          <Button onClick={() => { setActiveTab('calculator'); setStep(1); }} className="bg-alfa hover:bg-alfaDark">
            Рассчитать кредит
          </Button>
        </div>
        <div className="absolute right-0 top-0 w-1/3 h-full bg-gradient-to-l from-alfa/20 to-transparent flex items-center justify-center">
           <Briefcase className="w-32 h-32 text-white/10" />
        </div>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="p-5 border-l-4 border-green-500 flex justify-between items-center">
          <div>
            <p className="text-xs text-slate-500 mb-1">Остаток на счете</p>
            <p className="text-2xl font-extrabold text-slate-900">1 250 000 ₽</p>
          </div>
          <Wallet className="w-8 h-8 text-green-500 opacity-20" />
        </Card>
        <Card className="p-5 border-l-4 border-blue-500 flex justify-between items-center">
          <div>
            <p className="text-xs text-slate-500 mb-1">Ближайший платеж</p>
            <p className="text-2xl font-extrabold text-slate-900">{estimatedMonthlyPayment > 0 ? `${estimatedMonthlyPayment.toLocaleString()} ₽` : 'Нет активных кредитов'}</p>
            {estimatedMonthlyPayment > 0 && <p className="text-[10px] text-slate-400 mt-1">По одобренным заявкам</p>}
          </div>
          <CreditCard className="w-8 h-8 text-blue-500 opacity-20" />
        </Card>
        <Card className="p-5 border-l-4 border-slate-300 flex justify-between items-center">
          <div>
            <p className="text-xs text-slate-500 mb-1">Сотрудники</p>
            <p className="text-2xl font-extrabold text-slate-900">15 чел.</p>
          </div>
          <Users className="w-8 h-8 text-slate-400 opacity-20" />
        </Card>
      </div>

      <Card>
        <div className="p-6 border-b border-slate-100 flex justify-between items-center">
          <h3 className="font-bold text-lg">Мои заявки</h3>
          <button onClick={() => setActiveTab('applications')} className="text-alfa text-sm font-bold hover:underline flex items-center gap-1">
            Все заявки ({apps.filter(a => a.status !== 'Черновик').length}) <ChevronRight className="w-4 h-4"/>
          </button>
        </div>
        {apps.filter(a => a.status !== 'Черновик').length === 0 ? (
          <div className="p-8 text-center text-slate-400">
            У вас пока нет заявок. <button onClick={() => setActiveTab('calculator')} className="text-alfa underline font-medium">Создать первую</button>
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {apps.filter(a => a.status !== 'Черновик').slice(0, 3).map(app => (
              <div key={app.id} onClick={() => { setViewingApp(app); setActiveTab('app-detail'); }} className="p-4 hover:bg-slate-50 cursor-pointer flex justify-between items-center transition">
                <div>
                  <p className="font-bold text-slate-900">№ {app.id} • {app.product}</p>
                  <p className="text-sm text-slate-500">{app.amount?.toLocaleString()} ₽ • {app.date}</p>
                </div>
                <Badge variant={app.status === 'Одобрено' ? 'success' : app.status === 'Отказ' ? 'danger' : app.status === 'Предложена альтернатива' ? 'info' : 'warning'}>
                  {app.status}
                </Badge>
              </div>
            ))}
          </div>
        )}
      </Card>
    </motion.div>
  );

  // ============ 2. МОИ ЗАЯВКИ ============
  const renderApplications = () => (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-4">
      <div className="flex justify-between items-center mb-4">
        <h1 className="text-2xl font-extrabold text-slate-900">Мои заявки</h1>
        <Button onClick={() => { setActiveTab('calculator'); setStep(1); }}>+ Новая заявка</Button>
      </div>

      {apps.filter(a => a.status !== 'Черновик').length === 0 ? (
        <Card className="p-12 text-center flex flex-col items-center">
          <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center mb-4"><FileText className="w-8 h-8 text-slate-400"/></div>
          <p className="font-bold text-lg text-slate-900 mb-2">Заявок пока нет</p>
          <Button onClick={() => setActiveTab('calculator')}>Рассчитать кредит</Button>
        </Card>
      ) : (
        apps.filter(a => a.status !== 'Черновик').map(app => (
          <Card key={app.id} className="p-5 hover:shadow-md transition cursor-pointer" onClick={() => { setViewingApp(app); setActiveTab('app-detail'); }}>
            <div className="flex justify-between items-start mb-3">
              <div>
                <p className="font-bold text-slate-900">Заявка № {app.id}</p>
                <p className="text-xs text-slate-500">от {app.date}</p>
              </div>
              <Badge variant={app.status === 'Одобрено' ? 'success' : app.status === 'Отказ' ? 'danger' : app.status === 'Предложена альтернатива' ? 'info' : 'warning'}>
                {app.status}
              </Badge>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
              <div><p className="text-xs text-slate-500">Продукт</p><p className="font-medium truncate">{app.product}</p></div>
              <div><p className="text-xs text-slate-500">Сумма</p><p className="font-bold">{app.amount?.toLocaleString()} ₽</p></div>
              <div><p className="text-xs text-slate-500">Срок</p><p className="font-medium">{app.term} мес.</p></div>
              <div><p className="text-xs text-slate-500">Статус</p><p className="font-bold text-slate-700">{app.status}</p></div>
            </div>
          </Card>
        ))
      )}
    </motion.div>
  );

  // ============ 3. ЧЕРНОВИКИ ============
  const renderDrafts = () => {
    const drafts = apps.filter(a => a.status === 'Черновик');
    return (
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-4">
        <h1 className="text-2xl font-extrabold text-slate-900">Черновики</h1>
        <p className="text-slate-500 mb-6">Незаконченные заявки, к которым можно вернуться.</p>

        {drafts.length === 0 ? (
          <Card className="p-12 text-center flex flex-col items-center">
            <FileEdit className="w-16 h-16 text-slate-300 mb-4"/>
            <p className="font-bold text-lg text-slate-900 mb-2">Нет сохраненных черновиков</p>
            <p className="text-sm text-slate-500 mb-4">Если вы начнете заполнять заявку и сохраните её, она появится здесь.</p>
            <Button onClick={() => setActiveTab('calculator')}>Создать заявку</Button>
          </Card>
        ) : (
          drafts.map(app => (
            <Card key={app.id} className="p-5 hover:shadow-md transition cursor-pointer border-l-4 border-slate-300" onClick={() => { setActiveTab('calculator'); setStep(2); }}>
              <div className="flex justify-between items-start">
                <div>
                  <p className="font-bold text-slate-900">Черновик № {app.id}</p>
                  <p className="text-xs text-slate-500 mb-2">Создан {app.date} • {app.company}</p>
                  <Badge variant="default">Не отправлено</Badge>
                </div>
                <Button variant="outline" size="sm" className="flex gap-2">
                  <FilePlus className="w-4 h-4"/> Продолжить
                </Button>
              </div>
            </Card>
          ))
        )}
      </motion.div>
    );
  };

  // ============ 4. УВЕДОМЛЕНИЯ ============
  const renderNotifications = () => {
    const feedbackApps = apps.filter(a => a.employeeComment || a.status === 'Предложена альтернатива' || a.status === 'Оспорено' || a.status === 'Нужна информация');

    return (
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-4">
        <h1 className="text-2xl font-extrabold text-slate-900">Уведомления</h1>
        <p className="text-slate-500 mb-6">Здесь отображаются решения и запросы от кредитных специалистов.</p>

        {feedbackApps.length === 0 ? (
          <Card className="p-12 text-center flex flex-col items-center">
            <Bell className="w-12 h-12 text-slate-300 mb-4" />
            <p className="font-bold text-lg text-slate-900 mb-2">У вас пока нет новых уведомлений</p>
            <p className="text-sm text-slate-500">Когда специалист запросит данные или примет решение, оно появится здесь.</p>
          </Card>
        ) : (
          feedbackApps.map(app => (
            <Card key={app.id} className="p-6 border-l-4 border-indigo-500 hover:shadow-md transition cursor-pointer" onClick={() => { setViewingApp(app); setActiveTab('app-detail'); }}>
              <div className="flex justify-between items-start mb-3">
                <div>
                  <p className="font-bold text-slate-900">Заявка № {app.id}</p>
                  <p className="text-xs text-slate-500">от {app.date}</p>
                </div>
                <Badge variant={app.status === 'Одобрено' ? 'success' : app.status === 'Отказ' ? 'danger' : app.status === 'Предложена альтернатива' ? 'info' : 'warning'}>
                  {app.status}
                </Badge>
              </div>

              {app.employeeComment && (
                <div className="bg-indigo-50 p-4 rounded-xl mt-3 border border-indigo-100">
                  <p className="text-xs font-bold text-indigo-800 mb-1">Сообщение от банка:</p>
                  <p className="text-sm text-indigo-900 italic">«{app.employeeComment}»</p>
                </div>
              )}
              {app.alternativeProduct && (
                <div className="bg-blue-50 p-4 rounded-xl mt-3 border border-blue-100">
                  <p className="text-xs font-bold text-blue-800 mb-1">Предложено решение:</p>
                  <p className="text-sm font-bold text-blue-900">{app.alternativeProduct.name} (Сумма: {(app.alternativeProduct as any).amount?.toLocaleString() || app.amount?.toLocaleString()} ₽)</p>
                </div>
              )}
            </Card>
          ))
        )}
      </motion.div>
    );
  };

  // ============ 5. ПОДДЕРЖКА ============
  const renderSupport = () => (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
      <h1 className="text-2xl font-extrabold text-slate-900">Служба поддержки</h1>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card className="p-6 text-center hover:shadow-md transition cursor-pointer border-t-4 border-alfa">
          <div className="w-16 h-16 bg-red-50 rounded-full flex items-center justify-center mx-auto mb-4">
            <Phone className="w-8 h-8 text-alfa" />
          </div>
          <h3 className="font-bold text-lg mb-2">Позвонить</h3>
          <p className="text-sm text-slate-500 mb-4">Круглосуточно, бесплатно по России</p>
          <p className="text-xl font-extrabold text-slate-900">8 800 200-00-00</p>
        </Card>

        <Card className="p-6 text-center hover:shadow-md transition cursor-pointer border-t-4 border-blue-500">
          <div className="w-16 h-16 bg-blue-50 rounded-full flex items-center justify-center mx-auto mb-4">
            <Mail className="w-8 h-8 text-blue-500" />
          </div>
          <h3 className="font-bold text-lg mb-2">Написать</h3>
          <p className="text-sm text-slate-500 mb-4">Ответим в течение 2 часов</p>
          <p className="text-xl font-extrabold text-slate-900">help@alfabank.ru</p>
        </Card>

        <Card className="p-6 text-center hover:shadow-md transition cursor-pointer border-t-4 border-green-500">
          <div className="w-16 h-16 bg-green-50 rounded-full flex items-center justify-center mx-auto mb-4">
            <MessageCircle className="w-8 h-8 text-green-500" />
          </div>
          <h3 className="font-bold text-lg mb-2">Онлайн-чат</h3>
          <p className="text-sm text-slate-500 mb-4">Поможем решить вопрос в чате</p>
          <Button onClick={() => toast.success('Чат пока в разработке (демо-версия)')} className="w-full mt-2">Открыть чат</Button>
        </Card>
      </div>

      <Card className="p-8 bg-slate-50 border-dashed border-2 border-slate-200 mt-8">
        <div className="flex items-center gap-4 mb-4">
          <Headphones className="w-10 h-10 text-slate-400" />
          <div>
            <h3 className="font-bold text-xl text-slate-900">База знаний</h3>
            <p className="text-sm text-slate-500">Ответы на часто задаваемые вопросы</p>
          </div>
        </div>
        <div className="space-y-3">
          {['Как быстро рассматривается заявка?', 'Какие документы нужны для ИП?', 'Как оспорить решение по заявке?'].map((q, i) => (
            <div key={i} className="bg-white p-4 rounded-xl border border-slate-200 flex justify-between items-center cursor-pointer hover:border-alfa transition">
              <span className="font-medium text-slate-700">{q}</span>
              <ChevronRight className="w-5 h-5 text-slate-400" />
            </div>
          ))}
        </div>
      </Card>
    </motion.div>
  );

  // ============ 6. ДЕТАЛИ ЗАЯВКИ ============
  const renderAppDetail = () => {
    if (!viewingApp) return null;
    return (
      <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} className="space-y-4 max-w-4xl mx-auto">
        <button onClick={() => { setActiveTab('applications'); setIsDisputing(false); }} className="text-slate-500 hover:text-alfa flex items-center gap-2 text-sm font-medium mb-2">
          <ArrowLeft className="w-4 h-4"/> К списку заявок
        </button>

        <div className="flex justify-between items-start mb-6">
          <div>
            <h1 className="text-2xl font-extrabold text-slate-900">Заявка № {viewingApp.id}</h1>
            <p className="text-sm text-slate-500">Создана {viewingApp.date} • {viewingApp.product}</p>
          </div>
          <Badge variant={viewingApp.status === 'Одобрено' ? 'success' : viewingApp.status === 'Отказ' ? 'danger' : viewingApp.status === 'Предложена альтернатива' ? 'info' : viewingApp.status === 'Оспорено' ? 'warning' : 'default'}>
            {viewingApp.status}
          </Badge>
        </div>

        {viewingApp.status === 'Нужна информация' && (
          <Card className="p-6 border-l-4 border-yellow-500 bg-yellow-50/30">
            <div className="flex items-center gap-2 mb-2">
              <AlertTriangle className="w-6 h-6 text-yellow-600"/>
              <h3 className="font-bold text-yellow-800">Банку требуется дополнительная информация</h3>
            </div>
            <p className="text-sm text-slate-700 mb-4">{viewingApp.employeeComment || 'Пожалуйста, приложите актуальную выписку по расчетному счету.'}</p>
            <Button onClick={() => setActiveTab('documents')} className="bg-yellow-500 hover:bg-yellow-600 text-white">
              Перейти к документам
            </Button>
          </Card>
        )}

        {viewingApp.employeeComment && viewingApp.status !== 'Нужна информация' && (
          <Card className="p-4 bg-indigo-50 border-indigo-100 flex gap-3 items-start">
            <MessageCircle className="w-6 h-6 text-indigo-500 shrink-0 mt-0.5" />
            <div>
              <h4 className="font-bold text-indigo-900 text-sm mb-1">Сообщение от кредитного специалиста</h4>
              <p className="text-sm text-indigo-800 italic">«{viewingApp.employeeComment}»</p>
            </div>
          </Card>
        )}

        <Card className="p-6">
          <h3 className="font-bold mb-6">Этапы рассмотрения</h3>
          <div className="flex justify-between relative">
            <div className="absolute top-4 left-0 right-0 h-0.5 bg-slate-200 -z-10"/>
            {viewingApp.timeline?.map((t: any, i: number) => (
              <div key={i} className="flex flex-col items-center text-center max-w-[25%] bg-white px-2">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center mb-2 ${t.done ? 'bg-alfa text-white' : 'bg-slate-200 text-slate-400'}`}>
                  {t.done ? <CheckCircle2 className="w-5 h-5"/> : i+1}
                </div>
                <p className="text-sm font-bold text-slate-900">{t.step}</p>
                <p className="text-xs text-slate-600 mt-1 font-medium">{t.date}</p>
              </div>
            ))}
          </div>
        </Card>

        {viewingApp.status === 'Предложена альтернатива' && viewingApp.alternativeProduct && (
          <Card className="p-6 border-l-4 border-blue-500 bg-blue-50/30">
            <div className="flex items-center gap-2 mb-3"><MessageSquare className="w-6 h-6 text-blue-600"/><h3 className="font-bold text-blue-800">Банк предлагает альтернативные условия</h3></div>
            <div className="bg-white p-4 rounded-xl border border-blue-100 mb-4">
              <p className="font-bold text-lg text-slate-900">{viewingApp.alternativeProduct.name || viewingApp.alternativeProduct.product_name}</p>
              <div className="flex gap-6 mt-3">
                <div>
                  <p className="text-xs text-slate-500">Ставка</p>
                  <p className="font-bold text-blue-600 text-lg">от {viewingApp.alternativeProduct.rate || viewingApp.alternativeProduct.rate_calc}%</p>
                </div>
                <div>
                  <p className="text-xs text-slate-500">Сумма</p>
                  <p className="font-bold text-slate-900 text-lg">{viewingApp.alternativeProduct.amount?.toLocaleString() || viewingApp.amount?.toLocaleString()} ₽</p>
                </div>
                <div>
                  <p className="text-xs text-slate-500">Срок</p>
                  <p className="font-bold text-slate-900 text-lg">{viewingApp.alternativeProduct.term_months || viewingApp.alternativeProduct.term || viewingApp.term} мес.</p>
                </div>
              </div>
            </div>
            <div className="flex gap-3">
              <Button onClick={() => toast.success('Вы приняли альтернативу! Специалист свяжется с вами.')}>Принять предложение</Button>
              <Button variant="outline">Отклонить</Button>
            </div>
          </Card>
        )}

        {viewingApp.status === 'Отказ' && (
          <Card className="p-6 border-l-4 border-red-500 bg-red-50/30">
            <div className="flex items-center gap-2 mb-3"><XCircle className="w-6 h-6 text-red-600"/><h3 className="font-bold text-red-800">Заявка отклонена</h3></div>
            <div className="bg-white p-4 rounded-xl border border-red-100 mb-4">
              <p className="text-sm font-bold text-slate-800 mb-2">Причины отказа:</p>
              <ul className="list-disc list-inside text-sm text-slate-600 space-y-1">
                <li>{viewingApp.reason || 'Недостаточная финансовая устойчивость'}</li>
                {viewingApp.risk_factors && viewingApp.risk_factors.map((f: any, idx: number) => (
                  <li key={idx}>{f.label || f.name}</li>
                ))}
              </ul>
            </div>

            {!isDisputing ? (
              <Button variant="outline" className="text-red-600 border-red-200" onClick={() => setIsDisputing(true)}>
                <AlertTriangle className="w-4 h-4 mr-2" /> Оспорить решение
              </Button>
            ) : (
              <div className="bg-white p-4 rounded-xl border border-red-200">
                <textarea
                  className="w-full p-3 border border-slate-200 rounded-lg text-sm h-24 outline-none mb-3"
                  placeholder="Опишите причину несогласия или приложите новые данные..."
                  value={disputeText}
                  onChange={(e) => setDisputeText(e.target.value)}
                />
                <div className="flex gap-2">
                  <Button onClick={handleDispute}>Отправить в банк</Button>
                  <Button variant="outline" onClick={() => setIsDisputing(false)}>Отмена</Button>
                </div>
              </div>
            )}
          </Card>
        )}

        {viewingApp.status === 'Одобрено' && (
          <Card className="p-6 border-l-4 border-green-500 bg-green-50/30">
            <div className="flex items-center gap-2 mb-4">
              <CheckCircle2 className="w-6 h-6 text-green-600"/>
              <h3 className="font-bold text-green-800 text-xl">Заявка одобрена!</h3>
            </div>

            {signStep === 'offer' && (
              <div>
                <div className="bg-white p-5 rounded-xl border border-green-100 mb-6 shadow-sm">
                  <h4 className="font-bold text-slate-900 mb-4">Предложение по кредиту</h4>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
                    <div><p className="text-xs text-slate-500">Продукт</p><p className="font-medium">{viewingApp.product}</p></div>
                    <div><p className="text-xs text-slate-500">Сумма</p><p className="font-bold text-lg">{viewingApp.amount?.toLocaleString()} ₽</p></div>
                    <div><p className="text-xs text-slate-500">Срок</p><p className="font-bold">{viewingApp.term} мес.</p></div>
                    <div><p className="text-xs text-slate-500">Ставка</p><p className="font-bold text-alfa text-lg">{viewingApp.rate || 19}%</p></div>
                  </div>
                  <div className="bg-slate-50 p-3 rounded-lg flex justify-between items-center text-sm">
                    <span className="text-slate-600">Ежемесячный платеж (примерно)</span>
                    <span className="font-bold text-slate-900">{Math.round((viewingApp.amount || 0) / (viewingApp.term || 1) * 1.2).toLocaleString()} ₽</span>
                  </div>
                </div>
                <div className="flex gap-4">
                  <Button onClick={() => setSignStep('contract')} className="flex-1 bg-green-500 hover:bg-green-600 py-3">
                    Принять предложение
                  </Button>
                  <Button variant="outline" className="flex-1 py-3">Отказаться</Button>
                </div>
              </div>
            )}

            {signStep === 'contract' && (
              <div>
                <div className="bg-white p-6 rounded-xl border border-slate-200 mb-6 shadow-sm">
                  <h4 className="font-bold text-lg mb-4 text-center">Кредитный договор № {viewingApp.id}</h4>
                  <div className="space-y-2 text-sm text-slate-700 mb-6">
                    <p><strong>Кредитор:</strong> АО «Альфа-Банк»</p>
                    <p><strong>Заемщик:</strong> {viewingApp.company} (ИНН: {viewingApp.inn})</p>
                    <p><strong>Продукт:</strong> {viewingApp.product}</p>
                    <p><strong>Сумма:</strong> {viewingApp.amount?.toLocaleString()} ₽</p>
                    <p><strong>Срок:</strong> {viewingApp.term} месяцев</p>
                    <p><strong>Процентная ставка:</strong> {viewingApp.rate || 19}% годовых</p>
                  </div>

                  <button onClick={() => toast.success('Договор скачан (демо)')} className="flex items-center gap-2 text-sm font-bold text-blue-600 hover:text-blue-800 mb-6">
                    <Download className="w-4 h-4" /> Скачать договор (PDF)
                  </button>

                  <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 flex items-start gap-3">
                    <input
                      type="checkbox"
                      id="terms"
                      checked={termsAccepted}
                      onChange={e => setTermsAccepted(e.target.checked)}
                      className="mt-1 w-5 h-5 accent-green-500 cursor-pointer"
                    />
                    <label htmlFor="terms" className="text-sm text-slate-700 cursor-pointer select-none">
                      Я ознакомлен с условиями кредитного договора и тарифами банка, и подтверждаю свое согласие.
                    </label>
                  </div>
                </div>
                <div className="flex gap-4">
                  <Button onClick={() => setSignStep('otp')} disabled={!termsAccepted} className="flex-1 bg-alfa hover:bg-alfaDark py-3 text-white">
                    Подписать электронной подписью
                  </Button>
                </div>
              </div>
            )}

            {signStep === 'otp' && (
              <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm text-center">
                <ShieldCheck className="w-12 h-12 text-alfa mx-auto mb-4" />
                <h4 className="font-bold text-lg mb-2">Подтверждение подписи</h4>
                <p className="text-sm text-slate-500 mb-6">
                  Демо-режим: в реальном продукте — подписание через Альфа-Бизнес или квалифицированную электронную подпись.
                </p>

                <div className="inline-block bg-red-50 border border-red-200 text-alfa px-6 py-3 rounded-xl font-bold text-2xl tracking-widest mb-6">
                  Код: 4821
                </div>

                <div className="max-w-xs mx-auto mb-6">
                  <input
                    type="text"
                    placeholder="Введите код из 4 цифр"
                    value={otpInput}
                    onChange={e => { setOtpInput(e.target.value); setOtpError(false); }}
                    className={`w-full p-4 text-center text-2xl tracking-widest border rounded-xl outline-none focus:ring-2 ${otpError ? 'border-red-500 ring-red-100' : 'border-slate-300 focus:ring-alfa'}`}
                    maxLength={4}
                  />
                  {otpError && <p className="text-red-500 text-xs mt-1">Неверный код. Попробуйте 4821.</p>}
                </div>

                <div className="flex gap-3 justify-center">
                  <Button variant="outline" onClick={() => setSignStep('contract')}>Назад</Button>
                  <Button onClick={() => {
                    if (otpInput === '4821') {
                      setSignStep('signed');
                      setTimeout(() => setSignStep('disbursed'), 2000);
                    } else {
                      setOtpError(true);
                    }
                  }} className="bg-green-500 hover:bg-green-600 text-white px-8">
                    Подтвердить
                  </Button>
                </div>
              </div>
            )}

            {signStep === 'signed' && (
              <div className="text-center py-8">
                <CheckCircle2 className="w-16 h-16 text-green-500 mx-auto mb-4" />
                <h3 className="text-2xl font-extrabold text-slate-900 mb-2">Договор подписан!</h3>
                <p className="text-slate-500">Подготовка к перечислению средств...</p>
              </div>
            )}

            {signStep === 'disbursed' && (
              <div className="text-center py-8 bg-green-50 rounded-xl border border-green-200">
                <Wallet className="w-16 h-16 text-green-600 mx-auto mb-4" />
                <h3 className="text-2xl font-extrabold text-slate-900 mb-2">Кредит выдан!</h3>
                <p className="text-lg font-bold text-green-700 mb-2">{viewingApp.amount?.toLocaleString()} ₽ зачислены на расчётный счёт</p>
                <p className="text-sm text-slate-500">Симуляция завершена. В реальном продукте здесь произошло бы реальное зачисление.</p>
              </div>
            )}
          </Card>
        )}

        <Card className="p-6 mt-6">
          <h3 className="font-bold mb-4 text-lg">Параметры заявки</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
            <div><p className="text-slate-500 text-xs mb-1">Продукт</p><p className="font-medium">{viewingApp.product}</p></div>
            <div><p className="text-slate-500 text-xs mb-1">Сумма</p><p className="font-medium">{viewingApp.amount?.toLocaleString()} ₽</p></div>
            <div><p className="text-slate-500 text-xs mb-1">Срок</p><p className="font-medium">{viewingApp.term} мес.</p></div>
            <div><p className="text-slate-500 text-xs mb-1">Цель</p><p className="font-medium">{viewingApp.purpose || 'Не указана'}</p></div>
          </div>
        </Card>
      </motion.div>
    );
  };

  // ============ 7. КАЛЬКУЛЯТОР ============
  const renderCalculator = () => (
    <div className="bg-slate-50 rounded-[40px] p-8 md:p-12">
      <h1 className="text-3xl font-extrabold text-slate-900 mb-8">Рассчитаем кредит под вашу задачу</h1>
      <div className="flex flex-col lg:flex-row gap-8">
        <div className="w-full lg:w-[380px] shrink-0 space-y-8">

          {/* ЦЕЛЬ КРЕДИТА (ДОБАВЛЕНО) */}
          <div>
            <p className="text-sm text-slate-500 mb-3">Цель кредита</p>
            <select
              value={calcParams.purpose}
              onChange={e => setCalcParams({...calcParams, purpose: e.target.value})}
              className="w-full p-3 bg-white border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-alfa text-sm font-medium"
            >
              <option value="working_capital">Пополнение оборотных средств</option>
              <option value="cash_gap">Кассовый разрыв</option>
              <option value="equipment">Покупка оборудования</option>
              <option value="development">Развитие бизнеса</option>
              <option value="refinancing">Рефинансирование</option>
            </select>
          </div>

          <div>
            <p className="text-sm text-slate-500 mb-3">Тип регистрации</p>
            <div className="flex gap-2">
              {['ООО', 'ИП'].map(t => (
                <button key={t} onClick={() => setCalcParams({...calcParams, type: t as any})}
                  className={`px-6 py-2.5 rounded-xl text-sm font-bold transition-all ${calcParams.type === t ? 'bg-slate-900 text-white' : 'bg-slate-200 text-slate-600 hover:bg-slate-300'}`}>
                  Для {t}
                </button>
              ))}
            </div>
          </div>
          <div>
            <p className="text-sm text-slate-500 mb-3">Залог</p>
            <div className="flex gap-2">
              {['Без залога', 'С залогом'].map(t => (
                <button key={t} onClick={() => setCalcParams({...calcParams, collateral: t as any})}
                  className={`px-6 py-2.5 rounded-xl text-sm font-bold transition-all ${calcParams.collateral === t ? 'bg-slate-900 text-white' : 'bg-slate-200 text-slate-600 hover:bg-slate-300'}`}>
                  {t}
                </button>
              ))}
            </div>
          </div>
          <div>
            <p className="text-sm text-slate-500 mb-3">Срок ведения бизнеса</p>
            <div className="flex gap-2">
              {['Более 9 месяцев', 'До 9 месяцев'].map(t => (
                <button key={t} onClick={() => setCalcParams({...calcParams, businessAgeCategory: t as any})}
                  className={`px-6 py-2.5 rounded-xl text-sm font-bold transition-all ${calcParams.businessAgeCategory === t ? 'bg-slate-900 text-white' : 'bg-slate-200 text-slate-600 hover:bg-slate-300'}`}>
                  {t}
                </button>
              ))}
            </div>
          </div>
          <div className="bg-slate-200/50 p-6 rounded-2xl">
            <p className="text-sm text-slate-500 mb-1">Сумма кредита</p>
            <p className="text-2xl font-extrabold text-slate-900 mb-4">{calcParams.amount.toLocaleString()} ₽</p>
            <input type="range" min="50000" max="30000000" step="50000" value={calcParams.amount} onChange={e => setCalcParams({...calcParams, amount: Number(e.target.value)})} className="w-full accent-alfa cursor-pointer" />
            <div className="flex justify-between text-xs text-slate-400 mt-2"><span>50 тыс ₽</span><span>15 млн ₽</span><span>30 млн ₽</span></div>
          </div>
          <div className="bg-slate-200/50 p-6 rounded-2xl">
            <p className="text-sm text-slate-500 mb-1">Срок кредита</p>
            <p className="text-2xl font-extrabold text-slate-900 mb-4">{calcParams.termYears} {calcParams.termYears === 1 ? 'год' : calcParams.termYears < 5 ? 'года' : 'лет'}</p>
            <input type="range" min="1" max="10" step="1" value={calcParams.termYears} onChange={e => setCalcParams({...calcParams, termYears: Number(e.target.value)})} className="w-full accent-alfa cursor-pointer" />
            <div className="flex justify-between text-xs text-slate-400 mt-2"><span>1 год</span><span>5 лет</span><span>10 лет</span></div>
          </div>
        </div>

        <div className="flex-1 space-y-4">
          {isRecLoading ? (
            <div className="flex flex-col items-center justify-center h-full space-y-4">
              <div className="w-12 h-12 border-4 border-alfa border-t-transparent rounded-full animate-spin"></div>
              <p className="text-slate-500 font-medium">Модель подбирает лучшие условия...</p>
            </div>
          ) : recommendations.length > 0 ? (
            recommendations.map((rec, idx) => (
              <motion.div key={rec.product.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: idx * 0.1 }}>
                <div className="bg-white p-6 rounded-3xl shadow-sm border border-slate-100 relative">
                  <div className="flex justify-between items-start mb-4">
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <h3 className="text-xl font-extrabold text-slate-900">{rec.product.name}</h3>
                        {/* ВЫВОДИМ МЕТКУ ОТ БЭКЕНДА */}
                        {rec.product.label && (
                          <Badge variant={idx === 0 ? 'warning' : idx === 1 ? 'info' : 'default'}>
                            {rec.product.label}
                          </Badge>
                        )}
                      </div>
                      <p className="text-slate-500 text-sm">{rec.product.desc}</p>

                      {/* ВЫВОДИМ ПРИЧИНЫ ОТ БЭКЕНДА */}
                      {rec.product.reasons && rec.product.reasons.length > 0 && (
                        <div className="mt-2 flex flex-wrap gap-2">
                          {rec.product.reasons.map((reason: string, i: number) => (
                            <span key={i} className="inline-flex items-center gap-1 text-[10px] font-medium bg-indigo-50 text-indigo-700 px-2 py-1 rounded-md">
                              <Sparkles className="w-3 h-3" /> {reason}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                    <div className="w-14 h-14 bg-slate-100 rounded-2xl flex items-center justify-center shrink-0">
                      <Briefcase className="w-6 h-6 text-slate-600" />
                    </div>
                  </div>
                  <div className="grid grid-cols-3 gap-4 mb-6">
                    <div><p className="text-xs text-slate-500 mb-1">Ставка</p><p className="font-extrabold text-lg">{rec.product.rate}%</p></div>
                    <div><p className="text-xs text-slate-500 mb-1">Переплата</p><p className="font-extrabold text-lg">{rec.overpayment.toLocaleString()} ₽</p></div>
                    <div><p className="text-xs text-slate-500 mb-1">Платёж</p><p className="font-extrabold text-lg">{rec.payment.toLocaleString()} ₽</p></div>
                  </div>
                  <div className="flex gap-3">
                    <Button variant="secondary" className="bg-slate-100 text-slate-700 hover:bg-slate-200">Узнать подробнее</Button>
                    <Button onClick={() => { setSelectedProduct(rec); setStep(2); }} className="bg-alfa text-white hover:bg-alfaDark">Заполнить заявку</Button>
                  </div>
                </div>
              </motion.div>
            ))
          ) : (
            <div className="bg-white p-10 rounded-3xl shadow-sm border-2 border-dashed border-slate-200 text-center flex flex-col items-center justify-center h-full">
              <HelpCircle className="w-12 h-12 text-slate-300 mb-4" />
              <h3 className="text-2xl font-extrabold text-slate-900 mb-3">Не нашли подходящий продукт?</h3>
              <p className="text-slate-500 text-base max-w-md mb-8">
                По вашим текущим параметрам нет стандартных предложений. Оставьте заявку, и специалист подберет индивидуальные условия.
              </p>
              <Button onClick={() => { setSelectedProduct(null); setStep(2); }} className="bg-alfa text-white hover:bg-alfaDark px-8 py-4 text-lg rounded-xl shadow-lg shadow-red-500/20">
                Оставить заявку на индивидуальное рассмотрение
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );

  // ============ 8. ФОРМА ============
  const renderForm = () => (
    <div className="max-w-3xl mx-auto space-y-6">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-4">
          <Button variant="outline" onClick={() => setStep(1)}><ArrowLeft className="w-4 h-4 mr-2"/> Назад</Button>
          <h2 className="text-2xl font-extrabold">Оформление заявки</h2>
        </div>
        <Button variant="secondary" onClick={handleSaveDraft} className="flex gap-2" disabled={isSubmitting}>
          <FileEdit className="w-4 h-4"/> Сохранить черновик
        </Button>
      </div>

      <div className="flex justify-between bg-white p-4 rounded-2xl shadow-sm border border-slate-100 overflow-x-auto mb-6">
        {[{s:2,l:'О компании'},{s:3,l:'Финансы'},{s:4,l:'Документы'},{s:5,l:'Решение'}].map((it) => (
          <div key={it.s} className="flex items-center gap-2">
            <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${step>=it.s?'bg-alfa text-white':'bg-slate-100 text-slate-400'}`}>{it.s}</div>
            <span className={`text-sm font-medium ${step>=it.s?'text-slate-900':'text-slate-400'}`}>{it.l}</span>
            {it.s < 5 && <div className="w-8 h-px bg-slate-200 mx-2"/>}
          </div>
        ))}
      </div>

      <Card className="p-8">
        {step === 2 && (
          <>
            <h3 className="text-xl font-bold mb-6">Данные о компании</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <div><label className="text-sm text-slate-500 mb-1 block">Название</label><input value={formData.companyName} onChange={e => setFormData({...formData, companyName: e.target.value})} className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl outline-none"/></div>
              <div><label className="text-sm text-slate-500 mb-1 block">ИНН</label><input value={formData.inn} onChange={e => setFormData({...formData, inn: e.target.value})} className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl outline-none" placeholder="Начните с 000 для отказа"/></div>
              <div><label className="text-sm text-slate-500 mb-1 block">ОГРН</label><input value={formData.ogrn} onChange={e => setFormData({...formData, ogrn: e.target.value})} className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl outline-none"/></div>
              <div><label className="text-sm text-slate-500 mb-1 block">Регион</label><input value={formData.region} onChange={e => setFormData({...formData, region: e.target.value})} className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl outline-none"/></div>
            </div>
            <Button className="w-full mt-8" onClick={() => setStep(3)}>Далее</Button>
          </>
        )}
        {step === 3 && (
          <>
            <h3 className="text-xl font-bold mb-6">Финансовые показатели</h3>
            <div className="space-y-4">
              <div><label className="text-sm text-slate-500 mb-1 block">Выручка (₽)</label><input type="number" value={formData.revenue} onChange={e => setFormData({...formData, revenue: Number(e.target.value)})} className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl outline-none"/></div>
              <div><label className="text-sm text-slate-500 mb-1 block">Чистая прибыль (₽)</label><input type="number" value={formData.profit} onChange={e => setFormData({...formData, profit: Number(e.target.value)})} className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl outline-none"/></div>
              <div><label className="text-sm text-slate-500 mb-1 block">Кредитные обязательства (₽)</label><input type="number" value={formData.liabilities} onChange={e => setFormData({...formData, liabilities: Number(e.target.value)})} className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl outline-none"/></div>
            </div>
            <div className="flex gap-4 mt-8"><Button variant="outline" onClick={() => setStep(2)}>Назад</Button><Button className="flex-1" onClick={() => setStep(4)}>Далее</Button></div>
          </>
        )}
        {step === 4 && (
          <>
            <h3 className="text-xl font-bold mb-6">Документы и согласия</h3>
            <div className="space-y-3 mb-6">
              {documentRequirements.map(doc => (
                <div key={doc.id} className="p-4 border border-slate-200 rounded-xl flex justify-between items-center">
                  <div><p className="font-medium text-sm">{doc.name}</p><p className="text-xs text-slate-500">{doc.format} • {doc.period}</p></div>
                  {docs[doc.id] ? (
                    <span className="text-green-600 font-bold text-sm flex items-center gap-1"><CheckCircle2 className="w-4 h-4"/> Загружено</span>
                  ) : (
                    <label className="cursor-pointer bg-slate-100 hover:bg-slate-200 px-3 py-1.5 rounded-lg text-sm font-medium flex items-center gap-1 transition">
                      <Upload className="w-4 h-4"/> Загрузить<input type="file" className="hidden" onChange={(e) => handleUpload(doc.id, e)}/>
                    </label>
                  )}
                </div>
              ))}
            </div>

            <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 mb-6 flex items-start gap-3">
              <input
                type="checkbox"
                id="bki"
                checked={bkiConsent}
                onChange={e => setBkiConsent(e.target.checked)}
                className="mt-1 w-5 h-5 accent-alfa cursor-pointer"
              />
              <label htmlFor="bki" className="text-sm text-slate-700 cursor-pointer select-none">
                Я согласен на запрос моей кредитной истории в БКИ и обработку персональных данных. <br/>
                <span className="text-xs text-slate-500">Без этого согласия банк не имеет права запрашивать вашу кредитную историю.</span>
              </label>
            </div>

            <div className="flex gap-4 mt-8">
              <Button variant="outline" onClick={() => setStep(3)}>Назад</Button>
              <Button className="flex-1" onClick={handleSubmit} disabled={!bkiConsent || isSubmitting}>
                {isSubmitting ? 'Отправка...' : 'Отправить заявку'}
              </Button>
            </div>
          </>
        )}
        {step === 5 && result && (
          <div className="text-center py-8">
            <div className="w-20 h-20 bg-yellow-100 rounded-full flex items-center justify-center mx-auto mb-6">
              <Clock className="w-10 h-10 text-yellow-600"/>
            </div>
            <h2 className="text-2xl font-extrabold mb-2">Заявка успешно отправлена!</h2>
            <p className="text-slate-500 mb-6 max-w-md mx-auto">Она находится на рассмотрении. Система уже начала проверку ваших данных.</p>
            <Button onClick={() => { setStep(1); setActiveTab('applications'); }}>Перейти в мои заявки</Button>
          </div>
        )}
      </Card>
    </div>
  );

  // ============ 9. ДОКУМЕНТЫ ============
  const renderDocuments = () => (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-4">
      <div className="flex justify-between items-center mb-4">
        <h1 className="text-2xl font-extrabold">Мои документы</h1>
        <Badge variant="default">{Object.keys(docs).length} из {documentRequirements.length} загружено</Badge>
      </div>
      {Object.keys(docs).length === 0 && (
        <Card className="p-8 bg-blue-50/50 border-blue-100 flex items-center gap-4">
          <FileText className="w-8 h-8 text-blue-500 shrink-0"/>
          <div>
            <h3 className="font-bold text-slate-900">Вы еще не прикрепили ни одного документа</h3>
            <p className="text-sm text-slate-500">Загрузите документы для ускорения рассмотрения заявок.</p>
          </div>
        </Card>
      )}
      <Card className="p-6">
        <div className="space-y-3">
          {documentRequirements.map(doc => (
            <div key={doc.id} className="p-4 border border-slate-200 rounded-xl flex justify-between items-center">
              <div><p className="font-medium">{doc.name} {doc.required && <span className="text-red-500">*</span>}</p><p className="text-xs text-slate-500">{doc.format} • {doc.period}</p></div>
              {docs[doc.id] ? (
                <div className="flex items-center gap-3">
                  <span className="text-green-600 font-bold text-sm flex items-center gap-1"><CheckCircle2 className="w-4 h-4"/> {docs[doc.id].name}</span>
                  <label className="cursor-pointer text-xs text-slate-400 hover:text-alfa underline">Заменить<input type="file" className="hidden" onChange={(e) => handleUpload(doc.id, e)}/></label>
                </div>
              ) : (
                <label className="cursor-pointer bg-slate-100 hover:bg-slate-200 px-4 py-2 rounded-lg text-sm font-bold flex items-center gap-2 transition">
                  <Upload className="w-4 h-4"/> Загрузить<input type="file" className="hidden" onChange={(e) => handleUpload(doc.id, e)}/>
                </label>
              )}
            </div>
          ))}
        </div>
      </Card>
    </motion.div>
  );

  // ============ 10. ПРОФИЛЬ ============
  const renderProfile = () => (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-4">
      <div className="flex justify-between items-center mb-4">
        <h1 className="text-2xl font-extrabold">Профиль компании</h1>
        <Button onClick={() => toast.success('Профиль сохранен (демо)')}>Сохранить</Button>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card className="p-6">
          <h3 className="font-bold text-lg mb-4 flex items-center gap-2"><Building2 className="w-5 h-5"/> Основные данные</h3>
          <div className="space-y-4">
            <div><label className="text-sm text-slate-500 mb-1 block">Название</label><input value={formData.companyName} onChange={e => setFormData({...formData, companyName: e.target.value})} className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl outline-none"/></div>
            <div><label className="text-sm text-slate-500 mb-1 block">ИНН</label><input value={formData.inn} onChange={e => setFormData({...formData, inn: e.target.value})} className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl outline-none"/></div>
            <div><label className="text-sm text-slate-500 mb-1 block">ОГРН</label><input value={formData.ogrn} onChange={e => setFormData({...formData, ogrn: e.target.value})} className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl outline-none"/></div>
            <div><label className="text-sm text-slate-500 mb-1 block">ОКВЭД</label><input value={formData.okved} onChange={e => setFormData({...formData, okved: e.target.value})} className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl outline-none"/></div>
          </div>
        </Card>
        <div className="space-y-6">
          <Card className="p-6">
            <h3 className="font-bold text-lg mb-4 flex items-center gap-2"><User className="w-5 h-5"/> Руководитель</h3>
            <div className="space-y-4">
              <div><label className="text-sm text-slate-500 mb-1 block">ФИО</label><input value={formData.director} onChange={e => setFormData({...formData, director: e.target.value})} className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl outline-none"/></div>
              <div><label className="text-sm text-slate-500 mb-1 block">Телефон</label><input value={formData.phone} onChange={e => setFormData({...formData, phone: e.target.value})} className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl outline-none"/></div>
              <div><label className="text-sm text-slate-500 mb-1 block">Email</label><input value={formData.email} onChange={e => setFormData({...formData, email: e.target.value})} className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl outline-none"/></div>
            </div>
          </Card>
          <Card className="p-6">
            <h3 className="font-bold text-lg mb-4 flex items-center gap-2"><MapPin className="w-5 h-5"/> Адрес</h3>
            <div><label className="text-sm text-slate-500 mb-1 block">Юридический адрес</label><input value={formData.address} onChange={e => setFormData({...formData, address: e.target.value})} className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl outline-none"/></div>
          </Card>
        </div>
      </div>
    </motion.div>
  );

  return (
    <div className="flex h-[calc(100vh-64px)] bg-slate-50">
      <div className="w-64 bg-white border-r border-slate-200 flex flex-col hidden md:flex">
        <div className="p-6 border-b border-slate-100 flex items-center gap-3">
          <div className="w-10 h-10 bg-red-100 rounded-full flex items-center justify-center text-alfa font-bold">{clientName[0]}</div>
          <div><p className="font-bold text-sm">{clientName}</p><p className="text-xs text-slate-500">{formData.companyName}</p></div>
        </div>
        <div className="p-4 flex flex-col gap-1 flex-1">
          {[
            {id:'main', icon:<Home className="w-5 h-5"/>, label:'Главная'},
            {id:'applications', icon:<FileText className="w-5 h-5"/>, label:'Мои заявки'},
            {id:'drafts', icon:<FileEdit className="w-5 h-5"/>, label:'Черновики'},
            {id:'notifications', icon:<Bell className="w-5 h-5"/>, label:'Уведомления'},
            {id:'calculator', icon:<Calculator className="w-5 h-5"/>, label:'Рассчитать кредит'},
            {id:'documents', icon:<Upload className="w-5 h-5"/>, label:'Документы'},
            {id:'profile', icon:<User className="w-5 h-5"/>, label:'Мой профиль'},
          ].map(t => (
            <button key={t.id} onClick={() => { setActiveTab(t.id as Tab); if (t.id === 'calculator') setStep(1); }}
              className={`flex items-center gap-3 px-4 py-3 rounded-xl font-bold transition whitespace-nowrap ${activeTab === t.id ? 'bg-red-50 text-alfa' : 'text-slate-600 hover:bg-slate-50'}`}>
              {t.icon} {t.label}
            </button>
          ))}

          <button onClick={() => setActiveTab('support')}
            className={`flex items-center gap-3 px-4 py-3 mt-auto rounded-xl font-bold transition whitespace-nowrap ${activeTab === 'support' ? 'bg-red-50 text-alfa' : 'text-slate-600 hover:bg-slate-50'}`}>
            <LifeBuoy className="w-5 h-5" /> Поддержка
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-6 md:p-8">
        <div className="max-w-5xl mx-auto">
          <AnimatePresence mode="wait">
            {activeTab === 'main' && renderMain()}
            {activeTab === 'applications' && renderApplications()}
            {activeTab === 'drafts' && renderDrafts()}
            {activeTab === 'notifications' && renderNotifications()}
            {activeTab === 'support' && renderSupport()}
            {activeTab === 'app-detail' && renderAppDetail()}
            {activeTab === 'calculator' && (step === 1 ? renderCalculator() : renderForm())}
            {activeTab === 'documents' && renderDocuments()}
            {activeTab === 'profile' && renderProfile()}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}
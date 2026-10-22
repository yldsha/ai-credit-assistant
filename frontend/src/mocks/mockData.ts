export const products = [
  { id: 'money-deal', name: 'Кредит «Деньги на дело»', desc: 'Без оценки бизнеса', rate: 15.5, minAmount: 50000, maxAmount: 7000000, minTerm: 3, maxTerm: 60, types: ['ООО', 'ИП'], collateral: 'Без залога', minBusinessAge: 3, icon: 'money' },
  { id: 'auto', name: 'Автокредит для бизнеса', desc: 'На все виды транспорта', rate: 17.5, minAmount: 300000, maxAmount: 15000000, minTerm: 12, maxTerm: 84, types: ['ООО', 'ИП'], collateral: 'С залогом', minBusinessAge: 6, icon: 'car' },
  { id: 'line-no-coll', name: 'Возобновляемая кредитная линия без залога', desc: 'Проценты только на использованную часть', rate: 14.5, minAmount: 100000, maxAmount: 10000000, minTerm: 6, maxTerm: 36, types: ['ООО', 'ИП'], collateral: 'Без залога', minBusinessAge: 9, icon: 'line' },
  { id: 'card', name: 'Кредитная карта Business One Credit', desc: 'Для оплаты товаров и услуг', rate: 25, minAmount: 100000, maxAmount: 1000000, minTerm: 1, maxTerm: 24, types: ['ООО', 'ИП'], collateral: 'Без залога', minBusinessAge: 3, icon: 'card' },
  { id: 'business-coll', name: 'Кредит для бизнеса с залогом', desc: 'На развитие бизнеса', rate: 17, minAmount: 500000, maxAmount: 30000000, minTerm: 6, maxTerm: 120, types: ['ООО', 'ИП'], collateral: 'С залогом', minBusinessAge: 12, icon: 'shield' },
  { id: 'business-no-coll', name: 'Оборотный кредит без залога', desc: 'На развитие бизнеса', rate: 19, minAmount: 50000, maxAmount: 5000000, minTerm: 3, maxTerm: 60, types: ['ООО', 'ИП'], collateral: 'Без залога', minBusinessAge: 6, icon: 'credit' },
];

export const mockDecisionEngine = (data: any) => {
  if (data.amount > 50000000) return { status: 'REJECTED', riskScore: 0.99, reason: 'Запрашиваемая сумма превышает максимальный лимит банка для данного сегмента' };
  if (data.inn?.startsWith('000')) return { status: 'REJECTED', riskScore: 0.85, reason: 'Недостаточная финансовая устойчивость (высокая долговая нагрузка)' };
  if (data.amount > 5000000 || data.revenue < data.amount * 0.5) return { status: 'MANUAL_REVIEW', riskScore: 0.55, reason: 'Сумма превышает лимит автоматического одобрения' };

  return { status: 'APPROVED', riskScore: 0.15, reason: 'Стабильное финансовое положение', approvedAmount: data.amount, rate: 19 };
};

export const mockGetSystemSuggestions = (app: any) => {
  const availableProducts = [];

  if (app.revenue < app.amount * 0.5) {
    availableProducts.push(products.find(p => p.id === 'card'));
    availableProducts.push(products.find(p => p.id === 'money-deal'));
  } else if (app.amount > 5000000) {
    availableProducts.push(products.find(p => p.id === 'line-no-coll'));
    availableProducts.push(products.find(p => p.id === 'business-coll'));
  } else {
    availableProducts.push(products.find(p => p.id === 'business-no-coll'));
    availableProducts.push(products.find(p => p.id === 'line-no-coll'));
  }

  let advice = "Клиент запросил сумму, которая не проходит по стандартным параметрам.";
  if (app.revenue < app.amount) {
    advice = "Выручка компании ниже запрашиваемой суммы. Рекомендуется снизить лимит или предложить кредитную карту.";
  } else if (app.isManual) {
    advice = "Клиент не определился с продуктом. На основе его финансовых данных, лучше всего подойдут следующие варианты:";
  }

  return {
    advice,
    products: availableProducts.filter(Boolean).slice(0, 2)
  };
};

export const documentRequirements = [
  { id: 'bank_stmt', name: 'Выписка по счету', format: 'PDF, до 10 МБ', period: 'За последние 12 месяцев', required: true },
  { id: 'accounting', name: 'Бухгалтерская отчетность', format: 'PDF, XLSX, до 10 МБ', period: 'Баланс + ОПУ за последний год', required: true },
  { id: 'tax', name: 'Справка об отсутствии задолженности', format: 'PDF, до 5 МБ', period: 'Выдана не позднее 30 дней назад', required: true },
  { id: 'passport', name: 'Паспорт руководителя', format: 'PDF, JPG, до 5 МБ', period: 'Стр. 2-3 и прописка', required: true },
];

export const initialApplications = [
  {
    id: '2024-0451',
    inn: '7709876543',
    company: 'ООО «Вектор»',
    amount: 1500000,
    product: 'Кредит «Деньги на дело»',
    status: 'На рассмотрении',
    mlRecommendation: 'Склоняется к одобрению',
    riskScore: 0.12,
    rate: 15.5, // <--- ДОБАВЛЕНО
    date: '15.03.2025',
    term: 24,
    purpose: 'Развитие бизнеса',
    revenue: 12000000,
    profit: 1500000,
    liabilities: 500000,
    director: 'Кузнецов Владимир Иванович',
    phone: '+7 (912) 345-67-89',
    timeline: [
      { step: 'Заявка получена', date: '15.03.2025 09:15', done: true },
      { step: 'Проверка данных', date: '15.03.2025 09:20', done: true },
      { step: 'Оценка рисков', date: '15.03.2025 09:22', done: true },
      { step: 'Решение', date: 'Ожидает решения', done: false },
    ]
  },
  {
    id: '2024-0450',
    inn: '7701112233',
    company: 'ООО «СтройМастер»',
    amount: 3250000,
    product: 'Возобновляемая кредитная линия',
    status: 'Одобрено',
    mlRecommendation: 'Склоняется к одобрению',
    riskScore: 0.15,
    rate: 14.5, // <--- ДОБАВЛЕНО
    date: '14.03.2025',
    term: 24,
    purpose: 'Кассовый разрыв',
    revenue: 50000000,
    profit: 3500000,
    liabilities: 2000000,
    director: 'Петров П.П.',
    phone: '+7 (999) 555-44-33',
    employeeComment: 'Отличный профиль, одобрено.',
    timeline: [
      { step: 'Заявка получена', date: '14.03.2025 10:00', done: true },
      { step: 'Проверка данных', date: '14.03.2025 10:15', done: true },
      { step: 'Оценка рисков', date: '14.03.2025 10:20', done: true },
      { step: 'Решение', date: 'Решение: Одобрено', done: true },
    ]
  },
  {
    id: '2024-0187',
    inn: '7701234567',
    company: 'ООО «Ромашка»',
    amount: 3000000,
    product: 'Оборотный кредит',
    status: 'В работе',
    isManual: true,
    mlRecommendation: 'Склоняется к отказу',
    riskScore: 0.72,
    rate: 19, // <--- ДОБАВЛЕНО
    date: '12.03.2025',
    term: 6,
    purpose: 'Кассовый разрыв',
    revenue: 2000000,
    profit: 150000,
    liabilities: 2000000,
    director: 'Иванов И.И.',
    phone: '+7 (999) 123-45-67',
    reason: 'Высокая долговая нагрузка',
    timeline: [
      { step: 'Заявка получена', date: '12.03.2025 14:25', done: true },
      { step: 'Проверка данных', date: '12.03.2025 14:30', done: true },
      { step: 'Оценка рисков', date: '12.03.2025 14:35', done: true },
      { step: 'Решение', date: 'Ожидает решения', done: false },
    ]
  }
];
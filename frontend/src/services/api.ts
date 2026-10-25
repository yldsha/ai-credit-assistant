const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';

// Словарь для перевода технических статусов бэкенда в красивые русские
export const translateStatus = (status: string) => {
  const map: Record<string, string> = {
    draft: 'Черновик',
    submitted: 'На рассмотрении',
    checking: 'Проверка данных',
    scoring: 'Оценка рисков',
    approved: 'Одобрено',
    rejected: 'Отказ',
    manual_review: 'На рассмотрении', // или "Ручная проверка"
    need_info: 'Нужна информация',
    counter_offer: 'Предложена альтернатива',
    issued: 'Кредит выдан',
  };
  return map[status] || status;
};

// Адаптер: переводит данные с бэкенда (Python) в формат, который ждет наш React
const normalizeApplication = (app: any) => {
  if (!app) return null;

  return {
    ...app,
    // Переводим ключи
    company: app.company_name || app.company || 'Без названия',
    term: app.term_months || app.term || 0,
    riskScore: app.pd !== undefined ? app.pd : app.riskScore,
    alternativeProduct: app.offer || app.alternativeProduct,
    // Расшифровываем статус для интерфейса
    status: translateStatus(app.status),
    // Форматируем таймлайн (бэкенд отдает историю в поле status_history)
    timeline: app.status_history?.map((h: any) => ({
      step: translateStatus(h.new_status),
      date: new Date(h.changed_at).toLocaleString('ru-RU'),
      done: true,
      comment: h.comment
    })) || app.timeline || [],
  };
};

// === ЭНДПОИНТЫ ДЛЯ КЛИЕНТА ===

// Получить список заявок клиента (бэкенд Кости не имеет общего эндпоинта,
// поэтому мы собираем их по ID, сохраненным в LocalStorage)
export async function getApplications(inn: string) {
  const localIds = JSON.parse(localStorage.getItem(`my_apps_${inn}`) || '[]');
  if (localIds.length === 0) return [];

  const apps = [];
  for (const id of localIds) {
    try {
      const res = await fetch(`${API_URL}/applications/${id}`);
      if (res.ok) {
        const data = await res.json();
        apps.push(normalizeApplication(data));
      }
    } catch (e) {
      console.error('Ошибка загрузки заявки', id, e);
    }
  }
  return apps;
}

// Создать черновик заявки и получить рекомендации
export async function createDraft(data: any) {
  const payload = {
    inn: data.inn,
    amount: data.amount,
    term_months: data.term,
    purpose: data.purpose || "working_capital",
    legal_form: data.type === 'ООО' ? 'OOO' : 'IP',
    has_collateral: data.collateral === 'С залогом',
    collateral_type: data.collateral === 'С залогом' ? 'real_estate' : 'none',
    business_age_months: 24, // Можно доработать, чтобы бралось из формы
    annual_revenue: data.revenue,
    monthly_turnover: data.revenue / 12,
    monthly_expenses: data.liabilities / 12,
    existing_debt: data.liabilities,
    monthly_debt_payments: data.liabilities / 24,
    overdue_days: 0,
    collateral_value: 0,
    industry: "trade",
    bki_consent: true
  };

  const res = await fetch(`${API_URL}/applications/draft`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });

  const result = await res.json();

  // Запоминаем ID созданной заявки, чтобы потом показать её в списке
  const localIds = JSON.parse(localStorage.getItem(`my_apps_${data.inn}`) || '[]');
  localStorage.setItem(`my_apps_${data.inn}`, JSON.stringify([...localIds, result.application.id]));

  return normalizeApplication(result.application);
}

// Отправить заявку в банк (запускает конвейер на бэкенде)
export async function submitApplication(id: number) {
  const res = await fetch(`${API_URL}/applications/${id}/submit`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' }
  });
  const data = await res.json();
  return normalizeApplication(data);
}

// Получить детали конкретной заявки (для обновления статуса)
export async function getApplicationById(id: number) {
  const res = await fetch(`${API_URL}/applications/${id}`);
  const data = await res.json();
  return normalizeApplication(data);
}

// === ЭНДПОИНТЫ ДЛЯ СОТРУДНИКА ===

// Получить все заявки для рабочего стола сотрудника
export async function getEmployeeApplications() {
  const res = await fetch(`${API_URL}/employee/applications`);
  const data = await res.json();
  return data.map(normalizeApplication);
}

// Принять решение по заявке
export async function makeEmployeeDecision(id: number, outcome: string, comment: string, extra?: any) {
  const payload: any = {
    outcome,
    comment,
    employee_id: 2,
  };

  if (extra?.productId) payload.product_id = extra.productId;
  if (extra?.amount) payload.amount = extra.amount;
  if (extra?.term) payload.term_months = extra.term;
  if (extra?.missingFields) payload.missing_fields = extra.missingFields;

  const res = await fetch(`${API_URL}/employee/applications/${id}/decision`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  const data = await res.json();
  return normalizeApplication(data);
}

// Заглушка для документов (Костя пока не сделал эндпоинт загрузки файлов)
export async function uploadDocument(inn: string, docId: string, file: File) {
  // Имитируем задержку сети
  await new Promise(r => setTimeout(r, 500));
  const docs = JSON.parse(localStorage.getItem(`docs_${inn}`) || '{}');
  docs[docId] = { name: file.name, size: file.size };
  localStorage.setItem(`docs_${inn}`, JSON.stringify(docs));
  return docs[docId];
}

export async function getDocuments(inn: string) {
  return JSON.parse(localStorage.getItem(`docs_${inn}`) || '{}');
}